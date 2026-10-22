import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadScope } from '../../loading/read-scope.ts';
import { SettingsDraftController } from './maintenance-controller.ts';
import { createStoreSettingsMaintenanceDirectory } from './maintenance-http-client.ts';
import { storeMaintenanceDraft, validateStoreMaintenanceDraft } from './maintenance-validation.ts';
import type { StoreSettingsBrowserReader, StoreSettingsPage } from './contracts.ts';
const scope = () => new ReadScope({ accountId: 'a', sessionRevision: 's', permissionRevision: 'p' }, 'f05-test', null, () => {});
const page: StoreSettingsPage = { items: [], total: 0, page: 1, pageSize: 20 };
test('dirty preparation blocks dismissal and scope invalidation clears every retained draft', () => {
  const owner = scope(), original = { name: '旧名称', selected: [{ id: 'hall-a', name: null as string | null }] };
  const controller = new SettingsDraftController(owner, original, () => ({}));
  original.selected[0]!.name = '外部改变';
  assert.equal(controller.getSnapshot().draft?.selected[0]?.name, null);
  controller.update({ name: '新名称' }); assert.equal(controller.requestClose(), false);
  assert.equal(controller.getSnapshot().closePrompt, true); controller.keepEditing();
  assert.equal(controller.getSnapshot().draft?.name, '新名称');
  let notified = 0; controller.subscribe(() => { notified++; }); owner.dispose();
  assert.equal(controller.getSnapshot().draft, null); assert.equal(controller.getSnapshot().disposed, true);
  controller.update({ name: '迟到修改' }); assert.equal(controller.getSnapshot().draft, null); assert.equal(notified, 1);
});
test('warehouse preparation requires exactly one reference and new hall has no invented default warehouse', () => {
  const initial = storeMaintenanceDraft(null);
  assert.ok(validateStoreMaintenanceDraft('warehouses', initial, null).hall);
  assert.equal(validateStoreMaintenanceDraft('warehouses', { ...initial, name: '仓库', hall: { id: 'hall-a', name: null } }, null).hall, undefined);
  assert.ok(validateStoreMaintenanceDraft('stores', { ...initial, name: '厅', warehouse: { id: 'foreign', name: '旧仓' } }, null).warehouse);
});
test('existing directory adapter requests the explicit hall filter and separate native customer kind', async () => {
  const owner = scope(); let reads = 0, customerReads = 0;
  const reader: StoreSettingsBrowserReader = { async readList(kind, read) {
    reads++; assert.equal(kind, 'warehouses'); assert.equal(read.parameters.hallId, 'hall-a'); assert.equal(read.parameters.status, 'normal'); return page;
  }, async readDetail() { throw new Error('not expected'); } };
  const directory = createStoreSettingsMaintenanceDirectory({ scope: owner, reader, customers: { async candidates(kind, parameters) {
    customerReads++; assert.equal(kind, 'CUSTOMER'); assert.equal(parameters.search, '客户'); return { ...page, items: [{ id: 'customer-a', code: 'KH001', name: '客户' }] };
  } } });
  assert.equal(reads, 0); const signal = new AbortController().signal;
  const query = { search: '', page: 1, pageSize: 20 as const, hallId: 'hall-a' };
  await directory.read('warehouses', query, signal);
  const customers = await directory.read('customers', { ...query, search: '客户', hallId: null }, signal);
  assert.deepEqual(customers.items, [{ id: 'customer-a', name: '客户' }]); assert.equal(customerReads, 1);
  await assert.rejects(directory.read('warehouses', { ...query, hallId: null }, signal), { kind: 'invalid-request' });
  await assert.rejects(directory.read('payment-methods', query, signal), { kind: 'not-implemented' });
  assert.equal(reads, 1); owner.dispose();
});
test('an ignored abort from a reader cannot publish candidate facts after identity invalidation', async () => {
  const owner = scope(); let finish!: (page: StoreSettingsPage) => void;
  const pending = new Promise<StoreSettingsPage>(resolve => { finish = resolve; });
  const reader: StoreSettingsBrowserReader = { readList: () => pending, async readDetail() { throw new Error('not expected'); } };
  const directory = createStoreSettingsMaintenanceDirectory({ scope: owner, reader });
  const result = directory.read('halls', { search: '', page: 1, pageSize: 20, hallId: null }, new AbortController().signal);
  owner.dispose(); finish(page); await assert.rejects(result, { kind: 'aborted' });
});
