import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadScope } from '../loading/read-scope.ts';
import { StaffSettingsController } from './controller.ts';
import type { StaffSettingsRecord } from './contracts.ts';
const roles = [{ value: 'SALESPERSON', label: '营业员', requiresHall: true }];
const scope = () => new ReadScope({ accountId: 'a', sessionRevision: 's', permissionRevision: 'p' }, 'staff-test', null, () => {});
test('role, hall and optional account preparation validate separately and disabling a new account clears credentials', () => {
  const owner = scope(), controller = new StaffSettingsController(owner, null, roles);
  assert.ok(controller.validate().name); assert.ok(controller.validate().role);
  controller.update({ name: '员工', role: 'SALESPERSON', loginName: 'employee', password: 'synthetic-only' });
  assert.ok(controller.validate().hall);
  controller.update({ hall: { id: 'h', name: '厅' } }); assert.deepEqual(controller.validate(), {});
  // The form explicitly clears login input when opt-in is removed, never turns it into a saved account.
  controller.update({ loginEnabled: false, loginName: '', password: '' }); assert.deepEqual(controller.validate(), {});
  owner.dispose(); assert.equal(controller.getSnapshot().draft, null);
});
test('a resigned employee cannot prepare enabled login and a password leaves no state after invalidation', () => {
  const owner = scope(), record: StaffSettingsRecord = { id: 'staff', name: '旧员工', role: 'SALESPERSON', hall: { id: 'h', name: null }, contact: null, employmentStatus: '离职', version: 2,
    account: { id: 'account', staffId: 'staff', loginName: 'employee', loginEnabled: false, version: 3 } };
  const controller = new StaffSettingsController(owner, record, roles);
  assert.equal(controller.getSnapshot().draft?.loginEnabled, false);
  controller.update({ loginEnabled: true, password: 'synthetic-reset' }); assert.ok(controller.validate().loginEnabled);
  assert.equal(record.account?.loginEnabled, false); owner.dispose();
  assert.equal(controller.getSnapshot().draft, null); assert.equal(controller.getSnapshot().dirty, false);
});
