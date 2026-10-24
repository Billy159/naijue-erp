/** SYNTHETIC scripted pg protocol, NOT SQL parsing/engine/database acceptance. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresStoreSettingsReadReader, type PgStoreSettingsClient, type PgStoreSettingsResult } from '../adapters/postgres/src/store-settings-read-reader.ts';
import type { StoreSettingsCoreReadCapability, StoreSettingsKind, StoreSettingsReadGrant, StoreSettingsScopedRead } from '../packages/application/src/store-settings-read-ports.ts';
import { actor, sid } from './support/synthetic-fixtures.ts';
const id = sid('hall', 3201), otherHall = sid('hall', 3202), warehouseId = sid('warehouse', 3203), customerId = sid('customer', 3204);
const store = { id, name: ' SAME NAME ', enabled: true, version: 7, default_customer_id: customerId, default_sales_warehouse_id: warehouseId, default_customer_name: null, default_warehouse_name: null };
const warehouse = { id: warehouseId, name: ' SAME NAME ', hall_id: id, enabled: true, version: 3, hall_name: null };
interface Step { readonly sql: RegExp; readonly rows?: Record<string, unknown>[]; readonly error?: Error; readonly inspect?: (values: unknown[], sql: string) => void }
class Client implements PgStoreSettingsClient {
  readonly calls: { sql: string; values: unknown[] }[] = []; readonly releases: (Error | boolean | undefined)[] = [];
  private readonly steps: Step[];
  constructor(steps: Step[]) { this.steps = steps; }
  async query(sql: string, values: unknown[] = []): Promise<PgStoreSettingsResult> { this.calls.push({ sql, values }); const step = this.steps.shift(); assert.ok(step, `Unexpected SQL ${sql}`); assert.match(sql, step.sql); step.inspect?.(values, sql); if (step.error) throw step.error; return { rows: structuredClone(step.rows ?? []), rowCount: step.rows?.length ?? 0 }; }
  release(error?: Error | boolean) { this.releases.push(error); }
  done() { assert.equal(this.steps.length, 0); assert.equal(this.releases.length, 1); for (const { sql } of this.calls) assert.doesNotMatch(sql, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|import_|inventory_|candidate|created_at/i); }
}
const begin = (): Step => ({ sql: /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$/ }), commit = (): Step => ({ sql: /^COMMIT$/ }), rollback = (): Step => ({ sql: /^ROLLBACK$/ }), count = (n: number): Step => ({ sql: /^SELECT count\(\*\)::text AS total FROM naijue_erp\./, rows: [{ total: String(n) }] });
const parameters = { search: '100%_\\原样', status: 'normal' as const, hallId: null, page: 1, pageSize: 20 as const };
function read(kind: StoreSettingsKind = 'stores', references: StoreSettingsReadGrant['references'] = 'NONE', signal = new AbortController().signal): StoreSettingsScopedRead { return { actor, intent: { kind, operation: 'list', parameters }, grant: { kind, operation: 'list', targetId: null, scope: { kind: 'HALL_IDS', hallIds: [id] }, references }, signal }; }
function detail(kind: StoreSettingsKind = 'stores', references: StoreSettingsReadGrant['references'] = 'NONE'): StoreSettingsScopedRead { const input = read(kind, references); const targetId = kind === 'stores' ? id : warehouseId; return { ...input, intent: { kind, operation: 'detail', parameters: { id: targetId } }, grant: { ...input.grant, operation: 'detail', targetId } }; }
const reader = (client: Client) => new PostgresStoreSettingsReadReader({ async connect() { return client; } });
const coreHalls = [id, ...Array.from({ length: 21 }, (_, i) => sid('hall', 3400 + i))];
const coreWarehouses = [warehouseId, ...Array.from({ length: 21 }, (_, i) => sid('warehouse', 3500 + i))];
function coreRead(kind: StoreSettingsKind = 'stores', references: StoreSettingsReadGrant['references'] = 'NONE'): StoreSettingsScopedRead {
  const input = read(kind, references);
  return { ...input, grant: { ...input.grant, scope: { kind: 'CORE_MEMBERS', hallIds: coreHalls, warehouseIds: coreWarehouses } } };
}
function coreReader(client: Client, verify?: StoreSettingsCoreReadCapability['assertReady']) {
  return new PostgresStoreSettingsReadReader({ async connect() { return client; } }, { profile: 'COMMITTED_CORE_SETTINGS_V14', async assertReady(actual, input) {
    assert.equal(actual, client); assert.equal(client.calls.length, 1); assert.deepEqual(input.actor, actor);
    assert.deepEqual(input.grant.scope, { kind: 'CORE_MEMBERS', hallIds: coreHalls, warehouseIds: coreWarehouses });
    if (verify) await verify(actual, input);
  } });
}
test('CORE members: verified same-client proof precedes exact hall/warehouse count and page, including empty later pages', async () => {
  for (const kind of ['stores', 'warehouses'] as const) {
    const ids = kind === 'stores' ? coreHalls : coreWarehouses;
    const c = new Client([begin(), { ...count(22), inspect(values, sql) {
      assert.deepEqual(values.slice(0, 2), [false, ids]); assert.match(sql, /n.id = ANY\(\$2::uuid\[\]\)/);
      if (kind === 'warehouses') assert.doesNotMatch(sql, /n.hall_id = ANY/);
    } }, { sql: /^SELECT n.id/, rows: [], inspect(values, sql) {
      assert.deepEqual(values.slice(0, 2), [false, ids]); assert.deepEqual(values.slice(-2), [20, 40]); assert.match(sql, /n.id = ANY\(\$2::uuid\[\]\)/);
    } }, commit()]);
    const input = coreRead(kind); assert.equal(input.intent.operation, 'list');
    const result = await coreReader(c).readList({ ...input, intent: { kind, operation: 'list', parameters: { ...parameters, page: 3 } } });
    assert.deepEqual(result, { page: 3, pageSize: 20, total: 22, items: [] }); c.done();
  }
});
test('CORE members: exact warehouse identity blocks another warehouse in the same hall for page and detail', async () => {
  const outside = { ...warehouse, id: sid('warehouse', 3999) };
  const c = new Client([begin(), count(1), { sql: /^SELECT n.id/, rows: [outside] }, rollback()]);
  await assert.rejects(coreReader(c).readList(coreRead('warehouses')), { code: 'STORE_SETTINGS_INVALID_RESPONSE' }); c.done();
  const scoped = coreRead('warehouses'), targetId = outside.id;
  const d: StoreSettingsScopedRead = { ...scoped, intent: { kind: 'warehouses', operation: 'detail', parameters: { id: targetId } }, grant: { ...scoped.grant, operation: 'detail', targetId } };
  const absent = new Client([begin(), { sql: /^SELECT n.id/, rows: [], inspect(values, sql) { assert.deepEqual(values, [false, coreWarehouses, targetId]); assert.match(sql, /n.id = ANY\(\$2::uuid\[\]\)/); } }, commit()]);
  assert.deepEqual(await coreReader(absent).readDetail(d), { item: null }); absent.done();
  const leaked = new Client([begin(), { sql: /^SELECT n.id/, rows: [outside] }, rollback()]);
  await assert.rejects(coreReader(leaked).readDetail(d), { code: 'STORE_SETTINGS_INVALID_RESPONSE' }); leaked.done();
});
test('CORE members: FK names join only exact permitted target sets while original FK identities remain', async () => {
  for (const kind of ['stores', 'warehouses'] as const) {
    const foreign = kind === 'stores' ? coreWarehouses : coreHalls;
    const c = new Client([begin(), count(1), { sql: /^SELECT n.id/, rows: [kind === 'stores' ? { ...store, default_customer_name: 'REAL FK CUSTOMER', default_warehouse_name: 'MEMBER WAREHOUSE' } : { ...warehouse, hall_name: 'MEMBER HALL' }], inspect(values, sql) {
      const index = kind === 'stores' ? 5 : 6;
      assert.deepEqual(values[index - 1], foreign); assert.match(sql, new RegExp(`(?:w|h)\\.id=ANY\\(\\$${index}::uuid\\[\\]\\)`));
    } }, commit()]);
    const result = await coreReader(c).readList(coreRead(kind, 'REFERENCES')); assert.equal(result.items.length, 1); c.done();
  }
  const outsideId = sid('warehouse', 3998), input = coreRead('stores', 'REFERENCES');
  const c = new Client([begin(), count(1), { sql: /^SELECT n.id/, rows: [{ ...store, default_sales_warehouse_id: outsideId, default_warehouse_name: null }] }, commit()]);
  const result = await coreReader(c).readList(input); const row = result.items[0]!; assert.equal(row.kind, 'stores'); if (row.kind === 'stores') assert.deepEqual(row.defaultWarehouse, { id: outsideId, name: null }); c.done();
  const forbiddenName = new Client([begin(), count(1), { sql: /^SELECT n.id/, rows: [{ ...store, default_sales_warehouse_id: outsideId, default_warehouse_name: 'UNGRANTED NAME' }] }, rollback()]);
  await assert.rejects(coreReader(forbiddenName).readList(input), { code: 'STORE_SETTINGS_INVALID_RESPONSE' }); forbiddenName.done();
});
test('CORE members: missing proof, wrong member proof and current principal denial cannot become empty or ALL', async () => {
  let acquired = 0;
  await assert.rejects(new PostgresStoreSettingsReadReader({ async connect() { acquired++; throw Error('must not acquire'); } }).readList(coreRead()), { code: 'STORE_SETTINGS_FORBIDDEN' });
  for (const scope of [{ kind: 'CORE_MEMBERS', hallIds: [], warehouseIds: [] }, { kind: 'CORE_MEMBERS', hallIds: coreHalls, warehouseIds: [...coreWarehouses.slice(1), coreWarehouses[1]] }])
    await assert.rejects(new PostgresStoreSettingsReadReader({ async connect() { acquired++; throw Error('must not acquire'); } }).readList({ ...coreRead(), grant: { ...coreRead().grant, scope: scope as never } }), { code: 'STORE_SETTINGS_FORBIDDEN' });
  assert.equal(acquired, 0);
  for (const reason of ['NOT_COMMITTED', 'WRONG_MEMBER_SET', 'SALESPERSON_CURRENT_PRINCIPAL'] as const) {
    const c = new Client([begin(), rollback()]);
    await assert.rejects(coreReader(c, async () => { throw Object.assign(new Error(reason), { code: 'STORE_SETTINGS_FORBIDDEN' }); }).readList(coreRead()), { code: 'STORE_SETTINGS_FORBIDDEN' });
    assert.equal(c.calls.length, 2); c.done();
  }
});
test('native reader construction is inert, invalid/target-mismatched/missing scope/pre-aborted grants never acquire', async () => {
  assert.throws(() => new PostgresStoreSettingsReadReader(undefined as never), /explicit PostgreSQL pool/); let acquired = 0; const r = new PostgresStoreSettingsReadReader({ async connect() { acquired++; throw new Error('must not acquire'); } });
  for (const grant of [{ ...read().grant, scope: undefined }, { ...read().grant, targetId: id }, { ...read().grant, kind: 'warehouses' }]) await assert.rejects(() => r.readList({ ...read(), grant: grant as never }), { code: 'STORE_SETTINGS_FORBIDDEN' });
  await assert.rejects(() => r.readDetail(read()), { code: 'STORE_SETTINGS_FORBIDDEN' }); const controller = new AbortController(); controller.abort(); await assert.rejects(() => r.readList(read('stores', 'NONE', controller.signal)), { code: 'STORE_SETTINGS_READ_ABORTED' }); assert.equal(acquired, 0);
});
test('count and page share RR/RO snapshot with exact scope/status/literal search and native FK IDs; NONE never joins references', async () => {
  for (const kind of ['stores', 'warehouses'] as const) {
    const scope = kind === 'stores' ? 'n.id' : 'n.hall_id', values = [false, [id], 'normal', parameters.search, ...(kind === 'warehouses' ? [null] : [])];
    const check = (input: unknown[], sql: string) => { assert.deepEqual(input, values); assert.ok(sql.includes(`${scope} = ANY($2::uuid[])`)); assert.match(sql, /strpos\(lower\(n.name\), lower\(\$4::text\)\)/); assert.ok(!sql.includes(parameters.search)); assert.doesNotMatch(sql, /\bJOIN\b/); };
    const client = new Client([begin(), { ...count(1), inspect: check }, { sql: /^SELECT n.id, n.name/, rows: [kind === 'stores' ? store : warehouse], inspect(input, sql) { check(input.slice(0, -2), sql); assert.deepEqual(input.slice(-2), [20, 0]); assert.match(sql, /ORDER BY n.name COLLATE "C", n.id LIMIT \$\d OFFSET \$\d$/); assert.match(sql, /NULL::text AS/); } }, commit()]);
    const result = await reader(client).readList(read(kind)); assert.equal(result.items[0]!.name, ' SAME NAME '); assert.equal(result.items[0]!.createdAt, null); if (kind === 'stores') { const item = result.items[0]!; assert.equal(item.kind, 'stores'); if (item.kind === 'stores') { assert.equal(item.defaultCustomer!.id, customerId); assert.equal(item.defaultWarehouse!.id, warehouseId); assert.equal(item.defaultWarehouse!.name, null); } } else { const item = result.items[0]!; if (item.kind === 'warehouses') { assert.equal(item.hall.id, id); assert.equal(item.stockFacts, null); } } client.done();
  }
});
test('explicit REFERENCES joins only actual FKs, preserves disabled/cross-hall names; list cannot enumerate target tables', async () => {
  const c = new Client([begin(), count(1), { sql: /^SELECT n.id/, rows: [{ ...store, default_customer_name: 'DISABLED CUSTOMER', default_warehouse_name: 'OTHER HALL DEFAULT' }], inspect(_values, sql) { assert.match(sql, /LEFT JOIN naijue_erp.customer c ON c.id = n.default_customer_id/); assert.match(sql, /LEFT JOIN naijue_erp.warehouse w ON w.id = n.default_sales_warehouse_id/); assert.doesNotMatch(sql, /c.enabled|w.enabled|w.hall_id/); } }, commit()]);
  const result = await reader(c).readList(read('stores', 'REFERENCES')); assert.equal(result.items[0]!.kind === 'stores' && result.items[0]!.defaultWarehouse!.name, 'OTHER HALL DEFAULT'); c.done();
  const w = new Client([begin(), { sql: /^SELECT n.id/, rows: [{ ...warehouse, hall_name: 'NATIVE HALL' }], inspect(values, sql) { assert.match(sql, /LEFT JOIN naijue_erp.hall h ON h.id = n.hall_id/); assert.deepEqual(values, [false, [id], warehouseId]); assert.match(sql, /AND n.id = \$3::uuid LIMIT 2$/); } }, commit()]); assert.equal((await reader(w).readDetail(detail('warehouses', 'REFERENCES'))).item?.id, warehouseId); w.done();
});
test('ALL/empty scope, selected hall/status/page are parameterized, out-of-range and null detail are not guessed', async () => {
  const input = read('warehouses'); const listInput: StoreSettingsScopedRead = { ...input, intent: { kind: 'warehouses', operation: 'list', parameters: { ...parameters, hallId: otherHall, status: 'disabled', page: 2 } }, grant: { ...input.grant, scope: { kind: 'ALL' } } };
  const c = new Client([begin(), { ...count(1), inspect(values, sql) { assert.deepEqual(values, [true, [], 'disabled', parameters.search, otherHall]); assert.match(sql, /\(\$5::uuid IS NULL OR n.hall_id = \$5::uuid\)/); } }, { sql: /^SELECT n.id/, rows: [], inspect(values) { assert.deepEqual(values.slice(-2), [20, 20]); } }, commit()]); const result = await reader(c).readList(listInput); assert.equal(result.page, 2); assert.equal(result.total, 1); c.done();
  const empty = new Client([begin(), count(0), { sql: /^SELECT n.id/, rows: [], inspect(values) { assert.deepEqual(values.slice(0, 2), [false, []]); } }, commit()]); await reader(empty).readList({ ...read(), grant: { ...read().grant, scope: { kind: 'HALL_IDS', hallIds: [] } } }); empty.done();
  const missing = new Client([begin(), { sql: /^SELECT n.id/, rows: [] }, commit()]); assert.deepEqual(await reader(missing).readDetail(detail()), { item: null }); missing.done();
});
test('corrupt database IDs/versions/states/total/partial pages/out-of-scope rows fail closed and rollback', async () => {
  for (const rows of [[{ ...store, id: otherHall }], [{ ...store, id: 'SAME NAME' }], [{ ...store, version: 0 }], [{ ...store, enabled: 'true' }], [{ ...store, default_customer_name: 'UNGRANTED' }], []]) { const c = new Client([begin(), count(1), { sql: /^SELECT n.id/, rows }, rollback()]); await assert.rejects(() => reader(c).readList(read())); c.done(); }
  const bad = new Client([begin(), { sql: /^SELECT count/, rows: [{ total: '9007199254740992' }] }, rollback()]); await assert.rejects(() => reader(bad).readList(read()), { code: 'INVALID_DATABASE_VALUE' }); bad.done();
  const duplicate = new Client([begin(), { sql: /^SELECT n.id/, rows: [store, store] }, rollback()]); await assert.rejects(() => reader(duplicate).readDetail(detail()), { code: 'INVALID_DATABASE_VALUE' }); duplicate.done();
});
test('acquire/begin/read/commit/rollback failures release exactly once, discard uncertain clients, never retry', async () => {
  const failure = new Error('SYNTHETIC SQL'), rollbackFailure = new Error('SYNTHETIC rollback'); let acquired = 0;
  await assert.rejects(() => new PostgresStoreSettingsReadReader({ async connect() { acquired++; throw failure; } }).readList(read()), failure); assert.equal(acquired, 1);
  const beginFailure = new Client([{ sql: /^BEGIN/, error: failure }]); await assert.rejects(() => reader(beginFailure).readList(read()), failure); assert.equal(beginFailure.releases[0], failure); beginFailure.done();
  const queryFailure = new Client([begin(), { sql: /^SELECT count/, error: failure }, rollback()]); await assert.rejects(() => reader(queryFailure).readList(read()), failure); assert.equal(queryFailure.releases[0], undefined); queryFailure.done();
  const commitFailure = new Client([begin(), count(0), { sql: /^SELECT n.id/, rows: [] }, { sql: /^COMMIT$/, error: failure }, rollback()]); await assert.rejects(() => reader(commitFailure).readList(read()), failure); assert.equal(commitFailure.releases[0], failure); commitFailure.done();
  const rollbackFailed = new Client([begin(), { sql: /^SELECT count/, error: failure }, { sql: /^ROLLBACK$/, error: rollbackFailure }]); await assert.rejects(() => reader(rollbackFailed).readList(read()), AggregateError); assert.equal(rollbackFailed.releases[0], rollbackFailure); rollbackFailed.done();
});
test('abort between statements or during acquisition stops further SQL and late publication', async () => {
  const controller = new AbortController(), c = new Client([begin(), { ...count(1), inspect() { controller.abort(); } }, rollback()]); await assert.rejects(() => reader(c).readList(read('stores', 'NONE', controller.signal)), { code: 'STORE_SETTINGS_READ_ABORTED' }); c.done();
  const acquiring = new AbortController(), empty = new Client([]); await assert.rejects(() => new PostgresStoreSettingsReadReader({ async connect() { acquiring.abort(); return empty; } }).readList(read('stores', 'NONE', acquiring.signal)), { code: 'STORE_SETTINGS_READ_ABORTED' }); assert.ok(empty.releases[0] instanceof Error); empty.done();
});
