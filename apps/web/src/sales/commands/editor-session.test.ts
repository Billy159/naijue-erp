import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../../loading/read-scope.ts';
import type { AuthenticationPrincipal } from '../../authentication/contracts.ts';
import type { SalesDetailDto } from '../contracts.ts';
import { SalesCommandError, type SalesCommandClient, type SalesCommandDto, type SalesDraftDto, type SalesFormPreparationProvider } from './contracts.ts';
import { SalesEditorSession } from './editor-session.ts';
import { deferred, detail, draft, flush, receipt, result, uuid } from './fixtures.test-support.ts';

function setup(options: { readonly client?: Partial<SalesCommandClient>; readonly principal?: Partial<AuthenticationPrincipal>; readonly preparation?: SalesFormPreparationProvider } = {}) {
  const first = detail(), accountId = first.document.header.createdByAccountId;
  const principal: AuthenticationPrincipal = { accountId, staffId: first.document.header.salespersonId!, hallId: first.document.header.hallId,
    loginName: 'TEST-EDITOR', role: 'ADMIN', authVersion: 1, ...options.principal };
  const context = new ReadContext({ accountId: principal.accountId, sessionRevision: '1', permissionRevision: '1' }), scope = context.createScope('TEST-SALES-EDITOR');
  const commands: SalesCommandDto[] = []; let current = first, reads = 0, keys = 0;
  const session = new SalesEditorSession({ scope, principal, reader: { readDetail: async () => { reads++; return current; } }, newRequestKey: () => `TEST.editor:${++keys}`, onAccessFailure: () => {},
    client: { execute: async command => { commands.push(command); return result(command); }, receipt: async command => receipt(command), ...options.client },
    ...(options.preparation ? { preparation: options.preparation } : {}) });
  return { session, context, scope, commands, setCurrent: (value: SalesDetailDto) => { current = value; }, get reads() { return reads; }, get keys() { return keys; } };
}
test('session construction is inert and absent native preparation keeps new-create unavailable', async () => {
  const h = setup(); assert.equal(h.reads, 0); assert.equal(h.session.canCreate, false); assert.equal(await h.session.openCreate(), false);
  assert.equal(h.commands.length, 0); assert.equal(h.keys, 0); h.session.dispose();
});
test('invalid raw input survives suspend, blocks navigation/actions and never saves the old valid value', async () => {
  const h = setup(); await h.session.openExisting(uuid(1)); const input = h.session.getSnapshot().input!;
  h.session.updateInput({ ...input, lines: input.lines.map(line => ({ ...line, dealPrice: '1.' })) });
  assert.equal(h.session.canLeave(), false); h.session.suspend(); assert.equal(h.session.getSnapshot().input?.lines[0]?.dealPrice, '1.');
  assert.equal(await h.session.save(), false); assert.equal(await h.session.submit('APPROVE'), false); assert.equal(h.commands.length, 0); assert.equal(h.keys, 0);
  assert.equal(h.session.discardEditor(), false); assert.equal(h.session.discardEditor(true), true); assert.equal(h.session.canLeave(), true); h.session.dispose();
});
test('valid edit saves only explicit native fields at original CAS, double click allocates one key', async () => {
  const h = setup(); await h.session.openExisting(uuid(1)); const input = h.session.getSnapshot().input!;
  h.session.updateInput({ ...input, note: 'TEST 用户修改', lines: input.lines.map(line => ({ ...line, quantity: '-2', dealPrice: '10.01' })) });
  const pending = h.session.save(); assert.equal(await h.session.save(), false); assert.equal(await pending, true); assert.equal(h.keys, 1);
  const command = h.commands[0]!; assert.equal(command.expectedVersion, 2); assert.equal(command.action, 'SAVE');
  if (command.action === 'SAVE') { assert.equal(command.draft.lines[0]?.dealPrice, '1001'); assert.equal(command.draft.lines[0]?.quantity, '-2'); assert.equal(command.draft.header.netDue, '-2002'); assert.equal(command.draft.lines[0]?.snapshot.barcode, draft().lines[0]?.snapshot.barcode); }
  assert.equal(h.session.editable, false); assert.equal(h.session.canLeave(), true); h.session.dispose();
});
test('current read preserves raw invalid edit and requires explicit discard to adopt', async () => {
  const h = setup(); await h.session.openExisting(uuid(1)); const input = h.session.getSnapshot().input!;
  h.session.updateInput({ ...input, note: 'TEST 保留', businessDate: '' }); h.setCurrent(detail('DRAFT', 4));
  assert.equal(await h.session.commands.readCurrent(), true); assert.equal(h.session.getSnapshot().input?.businessDate, '');
  assert.equal(h.session.adoptCurrent(), false); assert.equal(h.session.getSnapshot().command.editor?.detail?.document.header.version, 2);
  assert.equal(h.session.adoptCurrent(true), true); assert.equal(h.session.getSnapshot().input?.note, draft().header.note); assert.equal(h.session.canLeave(), true); h.session.dispose();
});
test('unknown commit retains original request, raw input and blocks new operations until receipt recovery', async () => {
  const h = setup({ client: { execute: async () => { throw new SalesCommandError('network', 'NETWORK_ERROR', 'uncertain'); } } });
  await h.session.openExisting(uuid(1)); h.session.updateInput({ ...h.session.getSnapshot().input!, note: 'TEST 原输入' });
  await h.session.save(); const original = h.session.getSnapshot().command.write.command;
  assert.equal(h.session.canLeave(), false); assert.equal(h.session.updateInput({ ...h.session.getSnapshot().input!, note: '不能替换' }), false);
  assert.equal(h.session.discardEditor(true), false); assert.equal(await h.session.submit('VOID'), false); assert.equal(h.keys, 1);
  h.session.suspend(); assert.strictEqual(h.session.getSnapshot().command.write.command, original); assert.equal(await h.session.commands.checkReceipt(), true);
  assert.equal(h.session.canLeave(), true); h.session.dispose();
});
test('identity replacement clears raw inputs and native command facts synchronously', async () => {
  const h = setup(); await h.session.openExisting(uuid(1)); h.session.updateInput({ ...h.session.getSnapshot().input!, note: 'TEST 私有输入' });
  h.context.replaceIdentity({ accountId: uuid(199), sessionRevision: '2', permissionRevision: '2' });
  assert.equal(h.session.getSnapshot().input, null); assert.equal(h.session.getSnapshot().command.editor, null); assert.equal(h.session.getSnapshot().command.disposed, true); h.session.dispose();
});
test('preparer supplies document number, cancellation and late ignored abort never invent or revive a new draft', async () => {
  const pending = deferred<SalesDraftDto>(); let calls = 0;
  const h = setup({ preparation: { prepareCreate: async () => { calls++; return pending.promise; }, prepareEdit: async () => draft() } });
  assert.equal(h.session.canCreate, true); const open = h.session.openCreate(); await flush(); assert.equal(h.session.canLeave(), false);
  h.session.suspend(); pending.resolve(draft()); assert.equal(await open, false); assert.equal(h.session.getSnapshot().command.editor, null);
  assert.equal(calls, 1); assert.equal(h.keys, 0); assert.equal(h.commands.length, 0); h.session.dispose();
});
test('salesperson affordances allow own-hall save/void and own creator approval but never unapproval', async () => {
  const own = setup({ principal: { role: 'SALESPERSON' } }); await own.session.openExisting(uuid(1));
  assert.equal(own.session.actionAllowed('SAVE'), true); assert.equal(own.session.actionAllowed('VOID'), true); assert.equal(own.session.actionAllowed('APPROVE'), true); assert.equal(own.session.actionAllowed('UNAPPROVE'), false); own.session.dispose();
  const other = setup({ principal: { role: 'SALESPERSON', accountId: uuid(198) as AuthenticationPrincipal['accountId'] } }); await other.session.openExisting(uuid(1));
  assert.equal(other.session.actionAllowed('SAVE'), true); assert.equal(other.session.actionAllowed('APPROVE'), false); assert.equal(await other.session.submit('APPROVE'), false); assert.equal(other.keys, 0); other.session.dispose();
});
test('superseded open completion cannot reset newer raw input to the last valid native draft', async () => {
  const native = detail(), header = native.document.header;
  const context = new ReadContext({ accountId: header.createdByAccountId, sessionRevision: '1', permissionRevision: '1' }), reads: ReturnType<typeof deferred<SalesDetailDto>>[] = [];
  const session = new SalesEditorSession({ scope: context.createScope('TEST-RAW-OPEN-RACE'), principal: { accountId: header.createdByAccountId, staffId: uuid(14) as AuthenticationPrincipal['staffId'], hallId: header.hallId, loginName: 'TEST', role: 'ADMIN', authVersion: 1 },
    reader: { readDetail: async () => { const pending = deferred<SalesDetailDto>(); reads.push(pending); return pending.promise; } },
    client: { execute: async command => result(command), receipt: async command => receipt(command) }, newRequestKey: () => 'TEST.race', onAccessFailure: () => {} });
  const first = session.openExisting(uuid(1)), second = session.openExisting(uuid(1));
  reads[1]!.resolve(native); assert.equal(await second, true); session.updateInput({ ...session.getSnapshot().input!, note: 'TEST 新输入必须保留' });
  reads[0]!.resolve(native); assert.equal(await first, false); assert.equal(session.getSnapshot().input?.note, 'TEST 新输入必须保留'); assert.equal(session.hasDirtyDraft, true); session.dispose();
});
test('unknown original payment method remains readable but cannot become an editable or approvable runtime draft', async () => {
  const h = setup(), native = detail();
  h.setCurrent({ ...native, document: { ...native.document, settlements: native.document.settlements.map(row => ({ ...row, paymentMethodId: null })) },
    settlementNames: native.settlementNames.map(row => ({ ...row, methodNameSnapshot: 'TEST 名称不能补ID', currentMethodName: 'TEST 当前账户方式也不能补ID' })) });
  assert.equal(await h.session.openExisting(uuid(1)), true); assert.equal(h.session.getSnapshot().input, null); assert.equal(h.session.editable, false);
  assert.equal(h.session.getSnapshot().command.editor?.detail?.document.settlements[0]?.paymentMethodId, null);
  assert.equal(await h.session.save(), false); assert.equal(await h.session.submit('APPROVE'), false); assert.equal(h.keys, 0); assert.equal(h.commands.length, 0); h.session.dispose();
  const history = setup(); history.setCurrent({ ...native, stockBasis: 'CUTOFF_HISTORY', document: { ...native.document,
    settlements: native.document.settlements.map(row => ({ ...row, paymentMethodId: null })) } });
  assert.equal(await history.session.openExisting(uuid(1)), true); assert.equal(history.session.editable, false);
  for (const action of ['APPROVE', 'UNAPPROVE', 'VOID'] as const) assert.equal(await history.session.submit(action), false);
  assert.equal(await history.session.save(), false); assert.equal(history.keys, 0); assert.equal(history.commands.length, 0); history.session.dispose();
});
