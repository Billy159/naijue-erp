import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadScope } from '../loading/read-scope.ts';
import { PaymentSettingsController } from './controller.ts';
import type { PaymentAccountRecord } from './contracts.ts';
const scope = () => new ReadScope({ accountId: 'a', sessionRevision: 's', permissionRevision: 'p' }, 'payment-test', null, () => {});
test('account edits preserve every existing hall including unknown names and an empty list is never ALL', () => {
  const owner = scope(), halls = [{ id: 'h1', name: '一厅' }, { id: 'h2', name: null }];
  const record: PaymentAccountRecord = { kind: 'accounts', id: 'account', name: '收款', enabled: true, version: 5, paymentMethod: { id: 'method', name: '方式' }, halls };
  const controller = new PaymentSettingsController(owner, 'accounts', record);
  halls[0]!.name = '外部改变'; controller.update({ name: '新名称' });
  assert.deepEqual(controller.getSnapshot().draft?.halls, [{ id: 'h1', name: '一厅' }, { id: 'h2', name: null }]);
  controller.update({ halls: [] }); assert.deepEqual(controller.getSnapshot().draft?.halls, []);
  assert.equal(controller.requestClose(), false); owner.dispose(); assert.equal(controller.getSnapshot().draft, null);
});
test('new account needs a method and duplicate hall identities are rejected without merging identities', () => {
  const owner = scope(), controller = new PaymentSettingsController(owner, 'accounts', null);
  controller.update({ name: '账户' }); assert.ok(controller.validate().method);
  controller.update({ method: { id: 'method', name: null }, halls: [{ id: 'h', name: '甲' }, { id: 'h', name: '乙' }] });
  assert.ok(controller.validate().halls); assert.equal(controller.getSnapshot().draft?.halls.length, 2);
  controller.update({ halls: [{ id: 'h', name: '甲' }, { id: 'h2', name: '甲' }] }); assert.deepEqual(controller.validate(), {});
  owner.dispose();
});

import { createPaymentSettingsWorkspace } from './controller.ts';
import { PaymentClientError, type PaymentCommand, type PaymentCommandClient, type PaymentCommandResult, type PaymentCommandReceipt } from './contracts.ts';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const saved = (kind: 'methods' | 'accounts', command: PaymentCommand): PaymentCommandResult => ({ operationId: id(99), kind: kind === 'methods' ? 'PAYMENT_METHOD' : 'PAYMENT_ACCOUNT', targetId: command.action === 'CREATE' ? id(90) : command.id, version: command.action === 'CREATE' ? 1 : command.expectedVersion + 1 });
function fixture() {
  const owner = scope(), sent: PaymentCommand[] = [], receipts: PaymentCommand[] = []; let keys = 0, enabled = false, failures = 0, commits = 0;
  let execute: PaymentCommandClient['execute'] = async (kind, command) => saved(kind, command);
  let receipt: PaymentCommandClient['receipt'] = async (kind, command) => ({ requestKey: command.requestKey, action: command.action, status: 'COMMITTED', completedAt: '2026-10-22T00:00:00Z', result: saved(kind, command) });
  const workspace = createPaymentSettingsWorkspace({ scope: owner, writesEnabled: () => enabled, newRequestKey: () => `payment-test-${++keys}`,
    onAccessFailure() { failures++; }, onCommitted() { commits++; }, client: {
      execute: async (kind, command, signal) => { sent.push(command); return execute(kind, command, signal); },
      receipt: async (kind, command, signal) => { receipts.push(command); return receipt(kind, command, signal); },
    } });
  return { owner, sent, receipts, workspace, keys: () => keys, failures: () => failures, commits: () => commits,
    enable: () => { enabled = true; }, execute: (value: PaymentCommandClient['execute']) => { execute = value; }, receipt: (value: PaymentCommandClient['receipt']) => { receipt = value; } };
}
test('production gate defaults closed; dirty close and workspace replacement require explicit discard', async () => {
  const f = fixture(), c = f.workspace.open('methods', null)!; c.update({ name: '合成方式' }); await c.submit();
  assert.equal(f.sent.length, 0); assert.equal(f.keys(), 0); assert.equal(f.workspace.canLeave(), false);
  assert.equal(f.workspace.close('methods'), false); assert.equal(f.workspace.open('methods', null), null); assert.equal(c.getSnapshot().closePrompt, true);
  c.keepEditing(); assert.equal(c.discard(), true); assert.equal(f.workspace.close('methods'), true); assert.equal(f.workspace.canLeave(), true); f.owner.dispose();
});
test('one immutable native account command preserves complete/empty hall set and serializes double click', async () => {
  const f = fixture(); f.enable(); let finish!: (result: PaymentCommandResult) => void;
  f.execute(() => new Promise(resolve => { finish = resolve; }));
  const record: PaymentAccountRecord = { kind: 'accounts', id: id(2), name: '账户', enabled: true, version: 3, paymentMethod: { id: id(3), name: null }, halls: [{ id: id(5), name: '旧停用厅' }, { id: id(4), name: null }] };
  const c = f.workspace.open('accounts', record)!; c.update({ name: ' 修改 ', enabled: false, halls: [] });
  const pending = c.submit(); await c.submit(); assert.equal(f.sent.length, 1); assert.equal(f.keys(), 1);
  assert.deepEqual(f.sent[0], { action: 'EDIT', requestKey: 'payment-test-1', id: id(2), expectedVersion: 3, values: { name: ' 修改 ', enabled: false, paymentMethodId: id(3), hallIds: [] } });
  assert.equal(Object.isFrozen(f.sent[0]), true); assert.equal(Object.isFrozen((f.sent[0] as Extract<PaymentCommand, { action: 'EDIT' }>).values), true);
  c.update({ name: '不能改', halls: [{ id: id(8), name: '新厅' }] }); assert.equal(c.getSnapshot().draft?.name, ' 修改 ');
  assert.equal(c.requestClose(), false); assert.equal(c.discard(), false); finish(saved('accounts', f.sent[0]!)); await pending;
  assert.equal(c.getSnapshot().write.phase, 'committed'); assert.equal(f.workspace.canLeave(), true); assert.equal(f.commits(), 1); await c.submit(); assert.equal(f.sent.length, 1); f.owner.dispose();
});
test('uncertain original survives missing, forbidden, cancelled and malformed receipts with no new key or POST', async () => {
  const f = fixture(); f.enable(); f.execute(async () => { throw new PaymentClientError('network', 'NETWORK_ERROR', 'uncertain'); });
  const c = f.workspace.open('methods', null)!; c.update({ name: '原内容' }); await c.submit(); const command = c.getSnapshot().write.command;
  for (const error of [new PaymentClientError('not-found', 'RECEIPT_NOT_FOUND', 'read', 404), new PaymentClientError('forbidden', 'FORBIDDEN', 'read', 403), new PaymentClientError('aborted', 'PAYMENT_ABORTED', 'read')]) {
    f.receipt(async () => { throw error; }); await c.recover(); assert.equal(c.getSnapshot().write.phase, 'uncertain'); assert.equal(c.getSnapshot().write.command, command);
    assert.equal(c.requestClose(), false); assert.equal(c.discard(), false); assert.equal(f.workspace.canLeave(), false); assert.equal(f.owner.active, true);
  }
  f.receipt(async (kind, original) => ({ requestKey: 'different-key', action: original.action, status: 'COMMITTED', completedAt: '2026-10-22T00:00:00Z', result: saved(kind, original) })); await c.recover();
  assert.equal(c.getSnapshot().write.phase, 'uncertain'); assert.equal(c.getSnapshot().write.command, command); assert.equal(f.failures(), 0);
  await c.submit(); assert.equal(f.keys(), 1); assert.equal(f.sent.length, 1); assert.equal(f.receipts.every(item => item === command), true);
  f.receipt(async (kind, original) => ({ requestKey: original.requestKey, action: original.action, status: 'COMMITTED', completedAt: '2026-10-22T00:00:00Z', result: saved(kind, original) })); await c.recover();
  assert.equal(c.getSnapshot().write.phase, 'committed'); assert.equal(f.workspace.canLeave(), true); f.owner.dispose();
});
test('fresh route uses same session editor; permission/session invalidation clears both editors and ignores late success', async () => {
  const f = fixture(); f.enable(); let finish!: (result: PaymentCommandResult) => void; f.execute(() => new Promise(resolve => { finish = resolve; }));
  const c = f.workspace.open('methods', null)!; c.update({ name: '保留草稿' }); const other = f.workspace.open('accounts', null)!; other.update({ name: '另一草稿' });
  const route = scope(); assert.equal(f.workspace.matches(route), true); route.dispose(); assert.equal(c.getSnapshot().draft?.name, '保留草稿');
  const pending = c.submit(), command = f.sent[0]!; f.owner.dispose(); finish(saved('methods', command)); await pending;
  assert.deepEqual(f.workspace.getSnapshot(), { methods: null, accounts: null }); assert.equal(c.getSnapshot().draft, null); assert.equal(c.record, null); assert.equal(other.getSnapshot().draft, null); assert.equal(c.getSnapshot().write.command, null); assert.equal(f.commits(), 0);
});
test('strictly mismatched success is uncertain; definite native relation rejection preserves input', async () => {
  const f = fixture(); f.enable(); f.execute(async (kind, command) => ({ ...saved(kind, command), version: 9 }));
  const c = f.workspace.open('methods', null)!; c.update({ name: '合成' }); await c.submit(); assert.equal(c.getSnapshot().write.phase, 'uncertain'); assert.equal(f.workspace.canLeave(), false); f.owner.dispose();
  const g = fixture(); g.enable(); g.execute(async () => { throw new PaymentClientError('conflict', 'PAYMENT_RELATION_IN_USE', 'rejected', 409); });
  const d = g.workspace.open('accounts', { kind: 'accounts', id: id(2), name: '原账户', enabled: true, version: 2, paymentMethod: { id: id(3), name: '方式' }, halls: [{ id: id(4), name: null }] })!;
  d.update({ halls: [] }); await d.submit(); assert.equal(d.getSnapshot().write.phase, 'rejected'); assert.equal(d.getSnapshot().draft?.halls.length, 0); assert.equal(d.getSnapshot().dirty, true); assert.equal(d.requestClose(), false); g.owner.dispose();
});
test('401 clears the session; a later 403 on another editor cannot erase an unresolved original', async () => {
  const f = fixture(); f.enable(); f.execute(async () => { throw new PaymentClientError('network', 'NETWORK_ERROR', 'uncertain'); });
  const c = f.workspace.open('methods', null)!; c.update({ name: '原请求' }); await c.submit();
  const other = f.workspace.open('accounts', null)!; other.update({ name: '另一账户', method: { id: id(3), name: '方式' } });
  f.execute(async () => { throw new PaymentClientError('forbidden', 'FORBIDDEN', 'rejected', 403); }); await other.submit(); assert.equal(f.owner.active, true); assert.equal(c.getSnapshot().write.phase, 'uncertain');
  f.receipt(async () => { throw new PaymentClientError('unauthenticated', 'UNAUTHENTICATED', 'read', 401); }); await c.recover(); assert.equal(f.owner.active, false); assert.equal(f.failures(), 1); assert.equal(c.getSnapshot().write.command, null);
});
