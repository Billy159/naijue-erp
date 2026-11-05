import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../../loading/read-scope.ts';
import type { TransferDetailDto } from '../contracts.ts';
import { TransferCommandError, type TransferCommandClient, type TransferCommandDto, type TransferCommandResultDto } from './contracts.ts';
import { TransferCommandWorkspace } from './controller.ts';
import { detail, draft, result, receipt, uuid, deferred, flush } from './fixtures.test-support.ts';
function setup(overrides: Partial<TransferCommandClient> = {}, first = detail()) {
  const context = new ReadContext({ accountId: 'TEST', sessionRevision: '1', permissionRevision: '1' }), scope = context.createScope('TEST-TRANSFER-WORKSPACE');
  const commands: TransferCommandDto[] = []; let current = first, keys = 0, reads = 0, access = 0;
  const client: TransferCommandClient = { execute: async command => { commands.push(command); return result(command); }, receipt: async command => receipt(command), ...overrides };
  const workspace = new TransferCommandWorkspace({ scope, client, reader: { readDetail: async () => { reads++; return current; } }, newRequestKey: () => `TEST.transfer:${++keys}`, onAccessFailure: () => { access++; } });
  return { workspace, context, scope, commands, setCurrent: (value: TransferDetailDto) => { current = value; }, get keys() { return keys; }, get reads() { return reads; }, get access() { return access; } };
}
test('SYNTHETIC transfer workspace: inert create, one SAVE, original snapshots and null CAS; no optimistic stock', async () => {
  const h = setup(); assert.equal(h.reads, 0); assert.equal(h.workspace.matchesIdentity(h.scope), true); const other = new ReadContext({ accountId: 'OTHER', sessionRevision: '1', permissionRevision: '1' }).createScope('TEST-FOREIGN'); assert.equal(h.workspace.matchesIdentity(other), false); const input = structuredClone(draft()); h.workspace.openCreate(input); assert.equal(h.workspace.canLeave(), false);
  const pending = h.workspace.submit('SAVE'); assert.equal(await h.workspace.submit('SAVE'), false);
  assert.equal(await pending, true); assert.equal(h.commands.length, 1); assert.equal(h.commands[0]!.expectedVersion, null);
  assert.equal(h.workspace.getSnapshot().write.result?.ledgerEntryIds.length, 0); assert.equal(h.workspace.getSnapshot().editor?.detail, null);
  assert.equal(await h.workspace.submit('APPROVE'), false); assert.equal(h.workspace.canLeave(), true); h.workspace.dispose();
});
test('SYNTHETIC existing edit: raw invalid quantity persists, blocks SAVE/APPROVE/navigation; endpoints/SKU/barcode unchanged', async () => {
  const h = setup(); await h.workspace.openExisting(uuid(1)); const before = h.workspace.getSnapshot().editor!.draft!, input = h.workspace.getSnapshot().editor!.input!;
  assert.equal(h.workspace.updateInput({ ...input, quantities: { ...input.quantities, [before.lines[0]!.id]: '1.5' } }), false);
  assert.equal(h.workspace.hasDirtyDraft, true); assert.equal(h.workspace.canLeave(), false); assert.equal(await h.workspace.submit('SAVE'), false); assert.equal(await h.workspace.submit('APPROVE'), false);
  h.workspace.suspend(); assert.equal(h.workspace.getSnapshot().editor!.input!.quantities[before.lines[0]!.id], '1.5');
  assert.equal(h.workspace.updateInput({ ...input, note: 'TEST EDIT', quantities: { ...input.quantities, [before.lines[0]!.id]: '7' } }), true);
  assert.equal(await h.workspace.submit('APPROVE'), false); assert.equal(await h.workspace.submit('SAVE'), true);
  const command = h.commands[0]!; assert.equal(command.action, 'SAVE'); assert.ok('draft' in command);
  assert.equal(command.expectedVersion, 2); assert.equal(command.draft.header.fromWarehouseId, before.header.fromWarehouseId); assert.equal(command.draft.header.toWarehouseId, before.header.toWarehouseId);
  assert.equal(command.draft.lines[0]!.skuId, before.lines[0]!.skuId); assert.deepEqual(command.draft.lines[0]!.snapshot, before.lines[0]!.snapshot);
  assert.equal(command.draft.lines[0]!.quantity, '7'); h.workspace.dispose();
});
test('SYNTHETIC lifecycle: transitions only persisted state, exact two-end posting count, explicit read/adopt after commit', async () => {
  const h = setup(); await h.workspace.openExisting(uuid(1)); assert.equal(await h.workspace.submit('APPROVE'), true); assert.equal(h.workspace.getSnapshot().write.result?.ledgerEntryIds.length, 4);
  assert.equal(await h.workspace.submit('UNAPPROVE'), false); h.setCurrent(detail('APPROVED', 3)); assert.equal(await h.workspace.readCurrent(), true); assert.equal(h.workspace.adoptCurrent(), true);
  for (const action of ['SAVE', 'APPROVE', 'VOID'] as const) assert.equal(await h.workspace.submit(action), false);
  assert.equal(await h.workspace.submit('UNAPPROVE'), true); h.setCurrent(detail('DRAFT', 4)); await h.workspace.readCurrent(); h.workspace.adoptCurrent();
  assert.equal(await h.workspace.submit('VOID'), true); assert.equal(h.workspace.getSnapshot().write.result?.ledgerEntryIds.length, 0); h.workspace.dispose();
  const wrong = setup({ execute: async command => result(command, 2) }); await wrong.workspace.openExisting(uuid(1)); assert.equal(await wrong.workspace.submit('APPROVE'), false); assert.equal(wrong.workspace.getSnapshot().write.phase, 'uncertain'); wrong.workspace.dispose();
});
test('SYNTHETIC historical and VOID are fail-closed; no zero/negative/decimal/unknown quantity coercion', async () => {
  for (const current of [{ ...detail(), stockBasis: 'CUTOFF_HISTORY' as const }, detail('VOID')]) {
    const h = setup({}, current); await h.workspace.openExisting(uuid(1)); for (const action of ['SAVE', 'APPROVE', 'UNAPPROVE', 'VOID'] as const) assert.equal(await h.workspace.submit(action), false); assert.equal(h.commands.length, 0); h.workspace.dispose();
  }
  for (const quantity of ['', '0', '-1', '1.0', '01', '9223372036854775808']) { const h = setup(); await h.workspace.openExisting(uuid(1)); const editor = h.workspace.getSnapshot().editor!; assert.equal(h.workspace.updateInput({ ...editor.input!, quantities: { ...editor.input!.quantities, [editor.draft!.lines[0]!.id]: quantity } }), false); assert.equal(await h.workspace.submit('SAVE'), false); h.workspace.dispose(); }
});
test('SYNTHETIC uncertain outcome retains exact original key/CAS/content; receipt404 never means uncommitted', async () => {
  const received: TransferCommandDto[] = []; let absent = true;
  const h = setup({ execute: async command => { received.push(command); throw new TransferCommandError('network', 'NETWORK_ERROR', 'uncertain'); }, receipt: async command => { if (absent) throw new TransferCommandError('not-found', 'RECEIPT_NOT_FOUND', 'read', 404); return receipt(command); } });
  h.workspace.openCreate(draft()); await h.workspace.submit('SAVE'); const original = h.workspace.getSnapshot().write.command;
  assert.equal(await h.workspace.checkReceipt(), false); assert.equal(h.workspace.getSnapshot().write.recovery, 'absent'); assert.equal(h.workspace.canLeave(), false);
  assert.equal(h.workspace.discardEditor(), false); assert.equal(await h.workspace.submit('SAVE'), false); await h.workspace.replayOriginal(); assert.strictEqual(received[0], received[1]); assert.strictEqual(h.workspace.getSnapshot().write.command, original); assert.equal(h.keys, 1);
  absent = false; assert.equal(await h.workspace.checkReceipt(), true); assert.equal(h.workspace.getSnapshot().write.phase, 'committed'); h.workspace.dispose();
});
test('SYNTHETIC cancellation/identity: pre-dispatch cancel is not sent, post-dispatch uncertain, late results cannot revive', async () => {
  const a = setup(); a.workspace.openCreate(draft()); const first = a.workspace.submit('SAVE'); a.workspace.cancelWaiting(); await first; assert.equal(a.commands.length, 0); assert.equal(a.workspace.getSnapshot().write.error?.outcome, 'not-sent'); a.workspace.dispose();
  const pending = deferred<TransferCommandResultDto>(); let command!: TransferCommandDto; const h = setup({ execute: async value => { command = value; return pending.promise; } }); h.workspace.openCreate(draft()); const write = h.workspace.submit('SAVE'); await flush(); h.workspace.cancelWaiting(); assert.equal(h.workspace.getSnapshot().write.phase, 'uncertain');
  h.context.replaceIdentity({ accountId: 'NEW', sessionRevision: '2', permissionRevision: '2' }); pending.resolve(result(command)); assert.equal(await write, false); assert.equal(h.workspace.getSnapshot().disposed, true); assert.equal(h.workspace.getSnapshot().editor, null);
});
test('SYNTHETIC conflict and regression: no force overwrite/rebase; original input stays until explicit current adoption', async () => {
  const h = setup({ execute: async () => { throw new TransferCommandError('conflict', 'VERSION_CONFLICT', 'rejected', 409); } }); await h.workspace.openExisting(uuid(1)); const input = h.workspace.getSnapshot().editor!.input!; h.workspace.updateInput({ ...input, note: 'KEEP USER INPUT' }); await h.workspace.submit('SAVE');
  h.setCurrent(detail('DRAFT', 1)); assert.equal(await h.workspace.readCurrent(), false); assert.equal(h.workspace.getSnapshot().editor!.draft!.header.note, 'KEEP USER INPUT');
  h.setCurrent(detail('DRAFT', 5)); assert.equal(await h.workspace.readCurrent(), true); assert.equal(await h.workspace.submit('SAVE'), false); assert.equal(h.workspace.getSnapshot().write.command!.expectedVersion, 2); h.workspace.adoptCurrent(); assert.equal(h.workspace.hasDirtyDraft, false); assert.equal(h.workspace.getSnapshot().editor!.detail!.document.header.version, 5); h.workspace.dispose();
});
