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
