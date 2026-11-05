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

import { createStoreMaintenanceWorkspace } from './maintenance-controller.ts';
import { StoreSettingsReadController } from './controller.ts';
import { HttpQueryError } from '../../transport/http-query.ts';
import { StoreCommandError, type StoreCommand, type StoreCommandClient, type StoreCommandResult } from './maintenance-contracts.ts';
import type { StoreSettingsKind, StoreSettingsEntry } from './contracts.ts';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const saved = (kind: StoreSettingsKind, command: StoreCommand): StoreCommandResult => ({ operationId: id(99), kind: kind === 'stores' ? 'HALL' : 'WAREHOUSE', targetId: command.action === 'CREATE' ? id(90) : command.id, version: command.action === 'CREATE' ? 1 : command.expectedVersion + 1 });
function writeFixture() {
  const owner = scope(), sent: StoreCommand[] = [], receipts: StoreCommand[] = []; let keys = 0, enabled = false, failures = 0, commits = 0;
  let execute: StoreCommandClient['execute'] = async (kind, command) => saved(kind, command);
  let receipt: StoreCommandClient['receipt'] = async (kind, command) => ({ requestKey: command.requestKey, action: command.action, status: 'COMMITTED', completedAt: '2026-10-22T00:00:00Z', result: saved(kind, command) });
  const workspace = createStoreMaintenanceWorkspace({ scope: owner, writesEnabled: () => enabled, newRequestKey: () => `w5-test-${++keys}`,
    onAccessFailure() { failures++; }, onCommitted() { commits++; }, client: {
      execute: async (kind, command, signal) => { sent.push(command); return execute(kind, command, signal); },
      receipt: async (kind, command, signal) => { receipts.push(command); return receipt(kind, command, signal); },
    } });
  return { owner, sent, receipts, workspace, keys: () => keys, failures: () => failures, commits: () => commits,
    enable: () => { enabled = true; }, execute: (value: StoreCommandClient['execute']) => { execute = value; }, receipt: (value: StoreCommandClient['receipt']) => { receipt = value; } };
}
const hall = (): StoreSettingsEntry => ({ kind: 'stores', id: id(1), version: 6, name: '合成厅', enabled: true, createdAt: null, updatedAt: null, defaultCustomer: { id: id(2), name: null }, defaultWarehouse: { id: id(3), name: '本厅仓' } });
const warehouse = (): StoreSettingsEntry => ({ kind: 'warehouses', id: id(3), version: 4, name: '合成仓', enabled: true, createdAt: null, updatedAt: null, hall: { id: id(1), name: '合成厅' }, stockFacts: null });
test('W5 production gate and dirty close are enforced; new hall defaults remain explicit null', async () => {
  const f = writeFixture(), c = f.workspace.open('stores', null)!; c.update({ name: ' 新厅 ' }); await c.submit(); assert.equal(f.sent.length, 0); assert.equal(f.keys(), 0);
  assert.equal(f.workspace.close('stores'), false); assert.equal(c.getSnapshot().closePrompt, true); c.keepEditing(); assert.equal(f.workspace.canLeave(), false);
  f.enable(); await c.submit(); assert.deepEqual(f.sent[0], { action: 'CREATE', requestKey: 'w5-test-1', values: { name: ' 新厅 ', enabled: true, defaultCustomerId: null, defaultSalesWarehouseId: null } });
  assert.equal(c.getSnapshot().write.phase, 'committed'); assert.equal(f.workspace.canLeave(), true); assert.equal(f.commits(), 1); f.owner.dispose();
});
test('W5 fresh hall version and complete actual defaults survive immutable duplicate-click submission', async () => {
  const f = writeFixture(); f.enable(); let finish!: (result: StoreCommandResult) => void; f.execute(() => new Promise(resolve => { finish = resolve; }));
  const c = f.workspace.open('stores', hall())!; c.update({ name: '改名' }); const pending = c.submit(); await c.submit();
  assert.deepEqual(f.sent[0], { action: 'EDIT', requestKey: 'w5-test-1', id: id(1), expectedVersion: 6, values: { name: '改名', enabled: true, defaultCustomerId: id(2), defaultSalesWarehouseId: id(3) } });
  assert.equal(Object.isFrozen(f.sent[0]), true); assert.equal(f.keys(), 1); assert.equal(f.sent.length, 1); assert.equal(c.requestClose(), false); assert.equal(c.discard(), false);
  c.update({ customer: null, warehouse: null }); assert.equal(c.getSnapshot().draft?.warehouse?.id, id(3));
  finish(saved('stores', f.sent[0]!)); await pending; assert.equal(c.canLeave(), true); f.owner.dispose();
});
test('W5 warehouse explicit one-hall move never emits old relations/proof; reference rejection retains draft and old baseline', async () => {
  const f = writeFixture(); f.enable(); f.execute(async () => { throw new StoreCommandError('conflict', 'WAREHOUSE_DEFAULT_IN_USE', 'rejected', 409); });
  const c = f.workspace.open('warehouses', warehouse())!; c.update({ hall: { id: id(8), name: '新厅' }, enabled: false }); await c.submit();
  assert.deepEqual(f.sent[0], { action: 'EDIT', requestKey: 'w5-test-1', id: id(3), expectedVersion: 4, values: { name: '合成仓', enabled: false, hallId: id(8) } });
  assert.equal(c.getSnapshot().write.phase, 'rejected'); assert.equal(c.getSnapshot().draft?.hall?.id, id(8)); assert.equal(c.record?.kind === 'warehouses' && c.record.hall.id, id(1));
  assert.equal(c.requestClose(), false); assert.equal(c.getSnapshot().dirty, true); f.owner.dispose();
});
test('W5 unknown original survives receipt404/403/cancel and mismatches; only exact receipt ends uncertainty', async () => {
  const f = writeFixture(); f.enable(); f.execute(async () => { throw new StoreCommandError('timeout', 'ORGANIZATION_TIMEOUT', 'uncertain'); });
  const c = f.workspace.open('warehouses', warehouse())!; c.update({ name: '待确认仓' }); await c.submit(); const original = c.getSnapshot().write.command;
  for (const error of [new StoreCommandError('not-found', 'RECEIPT_NOT_FOUND', 'read', 404), new StoreCommandError('forbidden', 'FORBIDDEN', 'read', 403), new StoreCommandError('aborted', 'ORGANIZATION_ABORTED', 'read')]) {
    f.receipt(async () => { throw error; }); await c.recover(); assert.equal(c.getSnapshot().write.command, original); assert.equal(c.getSnapshot().write.phase, 'uncertain'); assert.equal(c.discard(), false);
  }
  f.receipt(async (kind, command) => ({ requestKey: command.requestKey, action: 'DISABLE', status: 'COMMITTED', completedAt: '2026-10-22T00:00:00Z', result: saved(kind, command) })); await c.recover(); assert.equal(c.getSnapshot().write.phase, 'uncertain');
  await c.submit(); assert.equal(f.keys(), 1); assert.equal(f.sent.length, 1); assert.equal(f.failures(), 0); assert.equal(f.workspace.canLeave(), false);
  f.receipt(async (kind, command) => ({ requestKey: command.requestKey, action: command.action, status: 'COMMITTED', completedAt: '2026-10-22T00:00:00Z', result: saved(kind, command) })); await c.recover();
  assert.equal(c.getSnapshot().write.phase, 'committed'); assert.equal(f.workspace.canLeave(), true); assert.equal(f.receipts.every(command => command === original), true); f.owner.dispose();
});
test('W5 read403 preserves pending session and retry; ordinary read-only403 still disposes its child scope', async () => {
  const f = writeFixture(); f.enable(); f.execute(async () => { throw new StoreCommandError('network', 'NETWORK_ERROR', 'uncertain'); });
  const c = f.workspace.open('stores', null)!; c.update({ name: '未决厅' }); await c.submit(); const original = c.getSnapshot().write.command;
  let deny = true, failures = 0;
  const reader: StoreSettingsBrowserReader = { async readList() { if (deny) throw new HttpQueryError('forbidden', 'FORBIDDEN'); return page; }, async readDetail() { return { item: null }; } };
  const read = new StoreSettingsReadController({ scope: scope(), reader, maintenance: { workspace: f.workspace }, onAccessFailure() { failures++; } }, 'stores');
  const query = { search: '', status: 'all' as const, hallId: null, page: 1, pageSize: 20 as const };
  await read.queryList(query); assert.equal(read.scope.active, true); assert.equal(read.list.getSnapshot().phase, 'error'); assert.equal(read.accessFailure, null); assert.equal(failures, 0); assert.equal(c.getSnapshot().write.command, original);
  deny = false; await read.queryList(query); assert.equal(read.list.getSnapshot().phase, 'success'); read.dispose(); assert.equal(c.getSnapshot().write.command, original);
  deny = true; const ordinary = new StoreSettingsReadController({ scope: scope(), reader, onAccessFailure() { failures++; } }, 'stores'); await ordinary.queryList(query); assert.equal(ordinary.scope.active, false); assert.equal(failures, 1); f.owner.dispose();
});
test('W5 read401 clears both session editors synchronously and ignores a late original success', async () => {
  const f = writeFixture(); f.enable(); let finish!: (result: StoreCommandResult) => void; f.execute(() => new Promise(resolve => { finish = resolve; }));
  const c = f.workspace.open('stores', hall())!; c.update({ name: '未决厅' }); const pending = c.submit(); const original = f.sent[0]!;
  const other = f.workspace.open('warehouses', warehouse())!; other.update({ name: '另一草稿' });
  const reader: StoreSettingsBrowserReader = { async readList() { throw new HttpQueryError('unauthenticated', 'UNAUTHENTICATED'); }, async readDetail() { return { item: null }; } };
  let failures = 0; const read = new StoreSettingsReadController({ scope: scope(), reader, maintenance: { workspace: f.workspace }, onAccessFailure() { failures++; } }, 'stores');
  await read.queryList({ search: '', status: 'all', hallId: null, page: 1, pageSize: 20 }); assert.equal(f.owner.active, false); assert.equal(failures, 1);
  assert.deepEqual(f.workspace.getSnapshot(), { stores: null, warehouses: null }); assert.equal(c.record, null); assert.equal(other.record, null); assert.equal(c.getSnapshot().write.command, null);
  finish(saved('stores', original)); await pending; assert.equal(f.commits(), 0); assert.equal(c.getSnapshot().draft, null);
});
