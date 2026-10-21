import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../../loading/read-scope.ts';
import type { SalesDetailDto } from '../contracts.ts';
import { SalesCommandError, type SalesCommandClient, type SalesCommandDto, type SalesCommandReceiptDto, type SalesCommandResultDto } from './contracts.ts';
import { SalesCommandWorkspace } from './controller.ts';
import { createSalesCommandHttpClient } from './http-client.ts';
import { deferred, detail, draft, flush, receipt, result, uuid } from './fixtures.test-support.ts';

function setup(overrides: Partial<SalesCommandClient> = {}, first = detail()) {
  const context = new ReadContext({ accountId: 'TEST', sessionRevision: '1', permissionRevision: '1' }), scope = context.createScope('TEST-SALES-WORKSPACE');
  const commands: SalesCommandDto[] = [], receipts: SalesCommandDto[] = []; let reads = 0, keys = 0, access = 0; let current = first;
  const client: SalesCommandClient = { execute: async command => { commands.push(command); return result(command); }, receipt: async command => { receipts.push(command); return receipt(command); }, ...overrides };
  const controller = new SalesCommandWorkspace({ scope, client, reader: { readDetail: async () => { reads++; return current; } }, newRequestKey: () => `TEST.operation:${++keys}`, onAccessFailure: () => { access++; } });
  return { controller, context, scope, commands, receipts, client, setCurrent: (next: SalesDetailDto) => { current = next; }, get reads() { return reads; }, get keys() { return keys; }, get access() { return access; } };
}

test('workspace construction is inert; CREATE saves once with null CAS and no inventory optimism', async () => {
  const h = setup(); assert.equal(h.reads, 0); assert.equal(h.commands.length, 0);
  const input = structuredClone(draft()); assert.equal(h.controller.openCreate(input), true); assert.equal(h.controller.canLeave(), false);
  const pending = h.controller.submit('SAVE'); assert.equal(h.controller.getSnapshot().write.phase, 'submitting');
  assert.equal(await h.controller.submit('SAVE'), false); Object.assign(input.header, { note: 'changed after prepare' });
  assert.equal(await pending, true); assert.equal(h.commands.length, 1); const command = h.commands[0]!;
  assert.equal(command.expectedVersion, null); assert.equal(command.action === 'SAVE' && command.draft.header.note, 'TEST 独立退货');
  assert.equal(h.controller.getSnapshot().write.result?.status, 'DRAFT'); assert.equal(h.controller.getSnapshot().stale, true);
  assert.equal(h.controller.getSnapshot().editor?.detail, null); assert.equal(await h.controller.submit('APPROVE'), false);
  assert.equal(h.controller.canLeave(), true); h.controller.dispose();
});
test('DRAFT SAVE is CAS-bound and cannot silently approve unsaved local edits', async () => {
  const h = setup(); assert.equal(await h.controller.openExisting(uuid(1)), true);
  assert.equal(await h.controller.submit('SAVE'), false); const edited = { ...draft(), header: { ...draft().header, note: 'USER EDIT' } };
  assert.equal(h.controller.replaceDraft(edited), true); assert.equal(await h.controller.submit('APPROVE'), false); assert.equal(h.commands.length, 0);
  assert.equal(await h.controller.submit('SAVE'), true); assert.equal(h.commands[0]?.expectedVersion, 2);
  assert.equal(h.controller.replaceDraft(draft()), false); assert.equal(await h.controller.submit('VOID'), false);
  assert.equal(await h.controller.readCurrent(), false); // old version cannot replace committed v3
  assert.equal(h.controller.getSnapshot().write.result?.version, 3); assert.equal(h.controller.getSnapshot().editor?.draft?.header.note, 'USER EDIT');
  h.setCurrent(detail('DRAFT', 4)); assert.equal(await h.controller.readCurrent(), true);
  assert.equal(h.controller.getSnapshot().write.result?.version, 3); assert.equal(h.controller.getSnapshot().editor?.current?.document.header.version, 4);
  assert.equal(h.controller.adoptCurrent(), true); assert.equal(h.controller.getSnapshot().write.phase, 'idle'); h.controller.dispose();
});
test('APPROVED document cannot edit or SAVE/APPROVE/VOID; UNAPPROVE must commit then read back first', async () => {
  const h = setup({}, detail('APPROVED'));
  await h.controller.openExisting(uuid(1)); assert.equal(h.controller.replaceDraft(draft()), false);
  for (const action of ['SAVE', 'APPROVE', 'VOID'] as const) assert.equal(await h.controller.submit(action), false);
  assert.equal(await h.controller.submit('UNAPPROVE'), true); assert.equal(h.commands[0]?.action, 'UNAPPROVE');
  assert.equal(h.controller.replaceDraft(draft()), false); assert.equal(await h.controller.submit('SAVE'), false);
  h.setCurrent(detail('DRAFT', 3)); assert.equal(await h.controller.readCurrent(), true); assert.equal(h.controller.adoptCurrent(), true);
  assert.equal(h.controller.replaceDraft({ ...draft(), header: { ...draft().header, note: 'AFTER UNAPPROVE' } }), true);
  assert.equal(await h.controller.submit('SAVE'), true); assert.equal(h.commands[1]?.expectedVersion, 3); h.controller.dispose();
});
test('approval requires persisted exact settlement; independent return does not consult an original sale or stock balance', async () => {
  const unbalanced = detail(); const h = setup({}, { ...unbalanced, document: { ...unbalanced.document, settlements: [] }, settlementNames: [] });
  await h.controller.openExisting(uuid(1)); assert.equal(await h.controller.submit('APPROVE'), false); assert.equal(h.keys, 0); assert.equal(h.commands.length, 0);
  assert.match(h.controller.getSnapshot().notice ?? '', /配平/); h.controller.dispose();
  const ready = setup(); await ready.controller.openExisting(uuid(1)); assert.equal(await ready.controller.submit('APPROVE'), true);
  assert.equal(ready.reads, 1); assert.deepEqual(Object.keys(ready.commands[0]!).sort(), ['action', 'expectedVersion', 'requestKey', 'salesId']); ready.controller.dispose();
});
test('all historical writes stay closed even for historical DRAFT; VOID is saved DRAFT only', async () => {
  const historical = detail(); const h = setup({}, { ...historical, stockBasis: 'CUTOFF_HISTORY' }); await h.controller.openExisting(uuid(1));
  assert.equal(h.controller.replaceDraft(draft()), false); for (const action of ['SAVE', 'APPROVE', 'UNAPPROVE', 'VOID'] as const) assert.equal(await h.controller.submit(action), false);
  assert.equal(h.commands.length, 0); h.controller.dispose();
  const v = setup(); await v.controller.openExisting(uuid(1)); assert.equal(await v.controller.submit('VOID'), true); assert.deepEqual(v.controller.getSnapshot().write.result?.ledgerEntryIds, []); v.controller.dispose();
  const unsaved = setup(); unsaved.controller.openCreate(draft()); assert.equal(await unsaved.controller.submit('VOID'), false); unsaved.controller.dispose();
});
test('unknown outcome blocks edits/replacement/new writes and explicit receipt404 remains unknown', async () => {
  let calls = 0; const h = setup({ execute: async () => { calls++; throw new SalesCommandError('network', 'NETWORK_ERROR', 'uncertain'); },
    receipt: async () => { throw new SalesCommandError('not-found', 'RECEIPT_NOT_FOUND', 'read', 404); } });
  h.controller.openCreate(draft()); assert.equal(await h.controller.submit('SAVE'), false);
  const original = h.controller.getSnapshot().write.command!; assert.equal(h.controller.getSnapshot().write.phase, 'uncertain');
  assert.equal(h.controller.discardEditor(), false); assert.equal(h.controller.openCreate(draft()), false); assert.equal(h.controller.replaceDraft(draft()), false);
  assert.equal(await h.controller.submit('SAVE'), false); assert.equal(await h.controller.readCurrent(), false); assert.equal(h.controller.canLeave(), false);
  assert.equal(await h.controller.checkReceipt(), false); assert.equal(h.controller.getSnapshot().write.phase, 'uncertain'); assert.equal(h.controller.getSnapshot().write.recovery, 'absent');
  assert.strictEqual(h.controller.getSnapshot().write.command, original); assert.equal(calls, 1); assert.equal(h.keys, 1); h.controller.dispose();
});
test('explicit replay keeps original key/CAS/deep payload and rejection cannot disprove original commit', async () => {
  const received: SalesCommandDto[] = []; const h = setup({ execute: async command => { received.push(command); throw new SalesCommandError(received.length === 1 ? 'network' : 'conflict', received.length === 1 ? 'NETWORK_ERROR' : 'VERSION_CONFLICT', received.length === 1 ? 'uncertain' : 'rejected'); } });
  await h.controller.openExisting(uuid(1)); h.controller.replaceDraft({ ...draft(), header: { ...draft().header, note: 'ORIGINAL USER' } });
  await h.controller.submit('SAVE'); const original = h.controller.getSnapshot().write.command!; assert.ok(Object.isFrozen(original));
  assert.equal(await h.controller.replayOriginal(), false); assert.equal(h.controller.getSnapshot().write.phase, 'uncertain');
  assert.strictEqual(received[0], received[1]); assert.equal(h.keys, 1); assert.equal(h.reads, 1); assert.equal(received[1]?.expectedVersion, 2);
  assert.equal(await h.controller.checkReceipt(), true); assert.equal(h.controller.getSnapshot().write.phase, 'committed');
  assert.equal(h.controller.getSnapshot().write.receipt?.requestKey, original.requestKey); assert.equal(h.controller.getSnapshot().editor?.detail?.document.header.version, 2);
  h.setCurrent(detail('DRAFT', 5)); assert.equal(await h.controller.readCurrent(), true);
  assert.equal(h.controller.getSnapshot().write.receipt?.result.version, 3); assert.equal(h.controller.getSnapshot().editor?.current?.document.header.version, 5); h.controller.dispose();
});
test('wrong receipt action, target, CAS or posting count never becomes committed', async () => {
  for (const mutate of [
    (r: SalesCommandReceiptDto) => ({ ...r, action: 'SAVE' }),
    (r: SalesCommandReceiptDto) => ({ ...r, result: { ...r.result, salesId: uuid(9) } }),
    (r: SalesCommandReceiptDto) => ({ ...r, result: { ...r.result, version: 99 } }),
    (r: SalesCommandReceiptDto) => ({ ...r, result: { ...r.result, ledgerEntryIds: [uuid(101), uuid(102)] } })
  ]) {
    const h = setup({ execute: async () => { throw new SalesCommandError('network', 'NETWORK_ERROR', 'uncertain'); }, receipt: async command => mutate(receipt(command)) as SalesCommandReceiptDto });
    await h.controller.openExisting(uuid(1)); await h.controller.submit('APPROVE'); assert.equal(await h.controller.checkReceipt(), false); assert.equal(h.controller.getSnapshot().write.phase, 'uncertain'); h.controller.dispose();
  }
});
test('local cancel before client invocation is not-sent; after invocation keeps uncertain and ignores late success', async () => {
  const first = setup(); first.controller.openCreate(draft()); const before = first.controller.submit('SAVE'); assert.equal(first.controller.cancelWaiting(), true);
  assert.equal(await before, false); assert.equal(first.commands.length, 0); assert.equal(first.controller.getSnapshot().write.error?.outcome, 'not-sent'); assert.equal(first.controller.getSnapshot().write.phase, 'rejected'); first.controller.dispose();
  const pending = deferred<SalesCommandResultDto>(); let original: SalesCommandDto | null = null;
  const during = setup({ execute: async command => { original = command; return pending.promise; } }); during.controller.openCreate(draft()); const write = during.controller.submit('SAVE'); await flush();
  assert.equal(during.controller.cancelWaiting(), true); assert.equal(during.controller.getSnapshot().write.phase, 'uncertain'); pending.resolve(result(original!)); assert.equal(await write, false);
  assert.equal(during.controller.getSnapshot().write.result, null); assert.equal(during.controller.getSnapshot().write.phase, 'uncertain'); during.controller.dispose();
});
test('route suspension preserves original recovery, while identity disposal clears facts and ignores late results', async () => {
  const pending = deferred<SalesCommandResultDto>(); let original: SalesCommandDto | null = null;
  const h = setup({ execute: async command => { original = command; return pending.promise; } }); h.controller.openCreate(draft()); const write = h.controller.submit('SAVE'); await flush();
  h.controller.suspend(); assert.equal(h.controller.getSnapshot().write.phase, 'uncertain'); assert.equal(h.controller.getSnapshot().editor?.draft?.header.id, uuid(1));
  assert.equal(await h.controller.checkReceipt(), true); pending.resolve(result(original!)); assert.equal(await write, false); assert.equal(h.controller.getSnapshot().write.phase, 'committed');
  const late = deferred<SalesCommandReceiptDto>(); const second = setup({ execute: async () => { throw new SalesCommandError('network', 'NETWORK_ERROR', 'uncertain'); }, receipt: async () => late.promise });
  second.controller.openCreate(draft()); await second.controller.submit('SAVE'); const original2 = second.controller.getSnapshot().write.command!; const checking = second.controller.checkReceipt();
  second.context.replaceIdentity({ accountId: 'OTHER', sessionRevision: '2', permissionRevision: '2' }); assert.equal(second.controller.getSnapshot().disposed, true); assert.equal(second.controller.getSnapshot().editor, null); assert.equal(second.controller.getSnapshot().write.command, null);
  late.resolve(receipt(original2)); assert.equal(await checking, false); assert.equal(second.controller.getSnapshot().write.result, null); h.controller.dispose();
});
test('definitive rejection preserves draft; explicit current read never force-rebases old CAS', async () => {
  const h = setup({ execute: async () => { throw new SalesCommandError('conflict', 'VERSION_CONFLICT', 'rejected', 409); } }); await h.controller.openExisting(uuid(1));
  h.controller.replaceDraft({ ...draft(), header: { ...draft().header, note: 'USER DRAFT' } }); await h.controller.submit('SAVE'); const original = h.controller.getSnapshot().write.command!;
  h.setCurrent(detail('DRAFT', 6)); assert.equal(await h.controller.readCurrent(), true); assert.equal(h.controller.getSnapshot().editor?.draft?.header.note, 'USER DRAFT');
  assert.equal(h.controller.getSnapshot().editor?.detail?.document.header.version, 2); assert.equal(original.expectedVersion, 2); assert.equal(await h.controller.submit('SAVE'), false);
  assert.equal(h.controller.adoptCurrent(), true); assert.equal(h.controller.getSnapshot().editor?.detail?.document.header.version, 6); assert.equal(h.controller.hasDirtyDraft, false); h.controller.dispose();
});
test('access failures clear identity-scoped data before host callback, including malformed HTML-status invalidation', async () => {
  for (const kind of ['unauthenticated', 'forbidden'] as const) {
    const h = setup({ execute: async () => { throw new SalesCommandError(kind, kind === 'forbidden' ? 'FORBIDDEN' : 'UNAUTHENTICATED', 'uncertain', kind === 'forbidden' ? 403 : 401); } });
    h.controller.openCreate(draft()); assert.equal(await h.controller.submit('SAVE'), false); assert.equal(h.access, 1); assert.equal(h.scope.active, false); assert.equal(h.controller.getSnapshot().editor, null); assert.equal(h.controller.getSnapshot().write.command, null);
  }
});
test('superseded detail/readCurrent cannot revive another target or disposed identity', async () => {
  const context = new ReadContext({ accountId: 'TEST', sessionRevision: '1', permissionRevision: '1' }), scope = context.createScope('TEST-RACES');
  const reads: ReturnType<typeof deferred<SalesDetailDto>>[] = [];
  const controller = new SalesCommandWorkspace({ scope, client: { execute: async command => result(command), receipt: async command => receipt(command) }, reader: { readDetail: async () => { const pending = deferred<SalesDetailDto>(); reads.push(pending); return pending.promise; } }, newRequestKey: () => 'TEST', onAccessFailure: () => {} });
  const first = controller.openExisting(uuid(1)); const second = controller.openExisting(uuid(2)); const other = detail();
  const next = { ...other, document: { ...other.document, header: { ...other.document.header, id: uuid(2) as SalesDetailDto['document']['header']['id'] }, lines: other.document.lines.map(line => ({ ...line, salesId: uuid(2) as SalesDetailDto['document']['header']['id'] })), settlements: other.document.settlements.map(row => ({ ...row, salesId: uuid(2) as SalesDetailDto['document']['header']['id'] })) } };
  reads[1]!.resolve(next); assert.equal(await second, true); reads[0]!.resolve(detail()); assert.equal(await first, false); assert.equal(controller.getSnapshot().editor?.salesId, uuid(2));
  const refresh = controller.readCurrent(); context.clear(); reads[2]!.resolve(next); assert.equal(await refresh, false); assert.equal(controller.getSnapshot().editor, null);
});

test('duplicate generated request key is refused across resolved/discarded operations', async () => {
  const context = new ReadContext({ accountId: 'TEST', sessionRevision: '1', permissionRevision: '1' }); let calls = 0;
  const controller = new SalesCommandWorkspace({ scope: context.createScope('TEST-KEYS'), newRequestKey: () => 'TEST.same-key', onAccessFailure: () => {}, reader: { readDetail: async () => detail() },
    client: { execute: async command => { calls++; return result(command); }, receipt: async command => receipt(command) } });
  controller.openCreate(draft()); assert.equal(await controller.submit('SAVE'), true); assert.equal(controller.discardEditor(), true);
  controller.openCreate(draft()); assert.equal(await controller.submit('SAVE'), false); assert.equal(calls, 1); controller.dispose();
});
test('unknown legacy price facts never become inferred SAVE or APPROVE intent', async () => {
  const saved = detail(); const h = setup({}, { ...saved, document: { ...saved.document, lines: saved.document.lines.map(line => ({ ...line, pricingRule: null, zeroConfirmed: null })) } });
  assert.equal(await h.controller.openExisting(uuid(1)), true); assert.equal(h.controller.getSnapshot().editor?.draft, null);
  assert.equal(await h.controller.submit('SAVE'), false); assert.equal(await h.controller.submit('APPROVE'), false); assert.equal(h.commands.length, 0);
  assert.equal(await h.controller.submit('VOID'), true); h.controller.dispose();
});
test('retained settlement/account cannot replace its original method identity in the local editor', async () => {
  const h = setup(); await h.controller.openExisting(uuid(1));
  const value = draft(); assert.equal(h.controller.replaceDraft({ ...value, settlements: value.settlements.map(row => ({ ...row, paymentMethodId: uuid(99) })) }), false);
  assert.equal(h.controller.getSnapshot().editor?.draft?.settlements[0]?.paymentMethodId, uuid(25));
  assert.equal(h.controller.getSnapshot().editor?.draft?.settlements[0]?.paymentAccountId, value.settlements[0]?.paymentAccountId);
  assert.equal(h.commands.length, 0); assert.equal(h.keys, 0); h.controller.dispose();
});
test('selected M1/account A intent survives a current-account method race and a definitive mismatch rejection', async () => {
  const currentAccountMethod = uuid(26), sent: SalesCommandDto[] = [];
  const client = createSalesCommandHttpClient({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (_url, init) => {
    const command = JSON.parse(init.body as string) as SalesCommandDto; sent.push(command); assert.equal(command.action, 'SAVE');
    assert.equal(command.draft.settlements[0]?.paymentMethodId, uuid(25));
    assert.notEqual(command.draft.settlements[0]?.paymentMethodId, currentAccountMethod);
    assert.equal(command.draft.settlements[0]?.paymentAccountId, draft().settlements[0]?.paymentAccountId);
    return new Response(JSON.stringify({ error: { code: 'SETTLEMENT_METHOD_MISMATCH', message: 'Rejected' } }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  } });
  const h = setup(client); await h.controller.openExisting(uuid(1));
  h.controller.replaceDraft({ ...draft(), header: { ...draft().header, note: 'TEST M1/A selected before account changed to M2' } });
  assert.equal(await h.controller.submit('SAVE'), false); assert.equal(h.controller.getSnapshot().write.phase, 'rejected');
  assert.equal(h.controller.getSnapshot().write.error?.code, 'SETTLEMENT_METHOD_MISMATCH'); assert.equal(sent.length, 1); assert.equal(h.keys, 1);
  assert.match(h.controller.getSnapshot().notice ?? '', /已保留原选择/);
  assert.equal(h.controller.getSnapshot().editor?.draft?.settlements[0]?.paymentMethodId, uuid(25)); assert.equal(h.controller.getSnapshot().write.result, null); h.controller.dispose();
});
test('unknown runtime method does not block legitimate status-only VOID or UNAPPROVE and is never filled in', async () => {
  for (const action of ['VOID', 'UNAPPROVE'] as const) {
    const native = detail(action === 'UNAPPROVE' ? 'APPROVED' : 'DRAFT');
    const unknown = { ...native, document: { ...native.document, settlements: native.document.settlements.map(row => ({ ...row, paymentMethodId: null })) } };
    const h = setup({}, unknown); assert.equal(await h.controller.openExisting(uuid(1)), true);
    assert.equal(h.controller.getSnapshot().editor?.draft, null); assert.equal(await h.controller.submit(action), true);
    assert.equal(h.commands[0]?.action, action); assert.deepEqual(Object.keys(h.commands[0]!).sort(), ['action', 'expectedVersion', 'requestKey', 'salesId']);
    assert.equal(h.controller.getSnapshot().editor?.detail?.document.settlements[0]?.paymentMethodId, null); h.controller.dispose();
  }
});

test('opened stock provenance is pinned across readback, conflict and recovery; cutoff history cannot promote', async () => {
  for (const initial of ['CUTOFF_HISTORY', 'RUNTIME_LEDGER'] as const) {
    const saved = detail(); const h = setup({}, { ...saved, stockBasis: initial }); await h.controller.openExisting(uuid(1));
    h.setCurrent({ ...detail('DRAFT', 3), stockBasis: initial === 'CUTOFF_HISTORY' ? 'RUNTIME_LEDGER' : 'CUTOFF_HISTORY' });
    assert.equal(await h.controller.readCurrent(), false); assert.equal(h.controller.getSnapshot().editor?.readError?.code, 'CHANGED_STOCK_BASIS');
    assert.equal(h.controller.getSnapshot().editor?.detail?.stockBasis, initial); assert.equal(h.controller.adoptCurrent(), false);
    assert.equal(await h.controller.submit('APPROVE'), false); assert.equal(h.commands.length, 0); h.controller.dispose();
  }
  const conflict = setup({ execute: async () => { throw new SalesCommandError('conflict', 'VERSION_CONFLICT', 'rejected', 409); } });
  await conflict.controller.openExisting(uuid(1)); conflict.controller.replaceDraft({ ...draft(), header: { ...draft().header, note: 'USER' } }); await conflict.controller.submit('SAVE');
  conflict.setCurrent({ ...detail('DRAFT', 4), stockBasis: 'CUTOFF_HISTORY' }); assert.equal(await conflict.controller.readCurrent(), false); assert.equal(conflict.controller.getSnapshot().write.command?.expectedVersion, 2); conflict.controller.dispose();
  const recovered = setup({ execute: async () => { throw new SalesCommandError('network', 'NETWORK_ERROR', 'uncertain'); } }); recovered.controller.openCreate(draft()); await recovered.controller.submit('SAVE');
  assert.equal(await recovered.controller.checkReceipt(), true); recovered.setCurrent({ ...detail('DRAFT', 4), stockBasis: 'CUTOFF_HISTORY' });
  assert.equal(await recovered.controller.readCurrent(), false); assert.equal(recovered.controller.getSnapshot().write.receipt?.result.version, 1); assert.equal(recovered.controller.adoptCurrent(), false); recovered.controller.dispose();
});

test('known command/read status must agree at its exact version; VOID remains terminal at all later reads', async () => {
  for (const action of ['APPROVE', 'VOID'] as const) {
    const h = setup(); await h.controller.openExisting(uuid(1)); assert.equal(await h.controller.submit(action), true);
    h.setCurrent(detail('DRAFT', 3)); assert.equal(await h.controller.readCurrent(), false);
    assert.equal(h.controller.getSnapshot().editor?.readError?.code, 'INCONSISTENT_DOCUMENT_STATE');
    assert.equal(h.controller.adoptCurrent(), false); assert.equal(h.controller.replaceDraft(draft()), false);
    assert.equal(h.controller.getSnapshot().write.result?.status, action === 'APPROVE' ? 'APPROVED' : 'VOID');
    h.setCurrent(detail('DRAFT', 4)); assert.equal(await h.controller.readCurrent(), action === 'APPROVE');
    if (action === 'APPROVE') assert.equal(h.controller.adoptCurrent(), true); else assert.equal(h.controller.adoptCurrent(), false);
    h.controller.dispose();
  }
  const h = setup({}, detail('VOID', 5)); await h.controller.openExisting(uuid(1));
  h.setCurrent(detail('DRAFT', 6)); assert.equal(await h.controller.readCurrent(), false);
  h.setCurrent(detail('VOID', 6)); assert.equal(await h.controller.readCurrent(), false);
  h.setCurrent(detail('VOID', 5)); assert.equal(await h.controller.readCurrent(), true); assert.equal(h.controller.adoptCurrent(), true);
  assert.equal(h.controller.replaceDraft(draft()), false); assert.equal(await h.controller.submit('SAVE'), false); h.controller.dispose();
});

test('observed auth headers clear workspace immediately even when response JSON never arrives', async () => {
  for (const status of [401, 403]) {
    let cancelled = 0; const client = createSalesCommandHttpClient({ origin: 'https://synthetic.test', basePath: '', timeoutMs: 1000,
      fetch: async () => new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled++; } }), { status, headers: { 'Content-Type': 'application/json' } }) });
    const h = setup(client); h.controller.openCreate(draft()); const pending = h.controller.submit('SAVE');
    await flush(); assert.equal(await pending, false);
    assert.equal(h.scope.active, false); assert.equal(h.access, 1); assert.equal(h.controller.getSnapshot().editor, null);
    assert.equal(h.controller.getSnapshot().write.command, null); assert.equal(cancelled, 1);
  }
});
