import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresProductWarehouseStockReader } from '../adapters/postgres/src/product-warehouse-stock-reader.ts';
import type { InventoryAdmissionRuntime } from '../adapters/postgres/src/inventory-key-admission-reader.ts';
import type { PgSalesPool } from '../adapters/postgres/src/sales-unit-of-work.ts';
import type { ProductDetailsScopedRead, ProductDetailsPageQuery, ProductStockOverviewScopedRead } from '../packages/application/src/product-details-query-ports.ts';
import type { InventoryQueryAuthorization } from '../packages/application/src/inventory-query-contracts.ts';
import type { NativeRuntime26Capability } from '../packages/application/src/native-import-schema-contract.ts';
import { inventoryActor, inventoryScope } from './support/synthetic-inventory-query.ts';
import { entityId } from '../packages/domain/src/values.ts';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const parameters = { productId: entityId('product', id(20)), page: 1, pageSize: 20 as const };
const read = (signal = new AbortController().signal): ProductDetailsScopedRead<ProductDetailsPageQuery> => ({ actor: inventoryActor,
  intent: { kind: 'stock', parameters }, parameters, grant: { kind: 'stock', productId: parameters.productId }, signal });
function fixture(options: { version?: number; fail?: string; unpublished?: boolean; missingProduct?: boolean; mutate?: (rows: Record<string, unknown>[]) => Record<string, unknown>[]; after?: (tag: string) => void } = {}) {
  const calls: { tag: string; sql: string; values: unknown[] }[] = [], releases: unknown[] = []; let connects = 0, authorizations = 0;
  const warehouse = inventoryScope.warehouses[0]!, pool: PgSalesPool = { async connect() { connects++; return { async query(sql, values = []) {
    const tag = /\/\* ([^*]+) \*\//.exec(sql)?.[1] ?? sql; calls.push({ tag, sql, values }); if (tag === options.fail) throw Error('SYNTHETIC:' + tag);
    let rows: Record<string, unknown>[] = [];
    if (sql.includes('AS accounting_guards_present')) rows = [{ accounting_guards_present: true }];
    else if (sql.includes('AS integrity_guards_present')) rows = [{ integrity_guards_present: true }];
    else if (tag === 'product-stock:schema') rows = [{ versions: Array.from({ length: options.version ?? 19 }, (_, i) => i + 1) }];
    else if (tag === 'product-stock:product') rows = options.missingProduct ? [] : [{ id: parameters.productId }];
    else if (tag === 'product-stock:publication') { const counts = { WAREHOUSE: 1, SKU: 3, INVENTORY_LEDGER: 2, IMPORT_BATCH: 1 };
      rows = options.unpublished ? [] : [{ id: id(30), completed: true, final_approval: true, checkpoint: { sequence: 2, cursor: 7, counts, expected: counts } }]; }
    else if (tag === 'product-stock:warehouses') rows = [{ id: warehouse.id, hall_id: warehouse.hallId, name: warehouse.label }];
    else if (tag === 'product-stock:count') rows = [{ total: '3', valid_sizes: true }];
    else if (tag === 'product-stock:page') rows = Number(values[5]) > 0 ? [] : options.mutate?.([]) ?? [
      ...['-2', '0'].map((quantity, i) => ({ warehouse_id: warehouse.id, warehouse_name: warehouse.label, sku_id: id(40 + i), balance_present: true, quantity, version: 1,
        last_operation_id: id(50 + i), ledger_present: true, warehouse_published: true, sku_published: true })),
      { warehouse_id: warehouse.id, warehouse_name: warehouse.label, sku_id: id(42), balance_present: false, quantity: null, version: null, last_operation_id: null, ledger_present: false, warehouse_published: true, sku_published: true }];
    else if (tag === 'inventory-admission:keys') rows = (values[0] as string[]).map((w, i) => ({ warehouse_id: w, sku_id: (values[1] as string[])[i], admitted: true, published_batch_id: id(30),
      warehouse_basis: 'CUTOFF_MEMBER', sku_basis: 'POST_CUTOFF_CREATED', warehouse_created_operation_id: null, sku_created_operation_id: id(60 + i) }));
    options.after?.(tag); return { rows, rowCount: rows.length };
  }, release(error) { releases.push(error); } }; } };
  const authorization = { async authorize() { authorizations++; return inventoryScope; } };
  return { pool, authorization, calls, releases, connects: () => connects, authorizations: () => authorizations, warehouse };
}
test('stock v1 separately authorizes inventory and preserves negative/explicit zero/proven absent zero in one snapshot', async () => {
  const f = fixture(), reader = new PostgresProductWarehouseStockReader(f.pool, f.authorization); assert.equal(f.connects(), 0);
  const result = await reader.readStock(read()); assert.deepEqual(result!.items.map(x => [x.quantity, x.state]), [['-2', 'KNOWN'], ['0', 'KNOWN'], ['0', 'KNOWN']]);
  assert.equal(f.authorizations(), 1); assert.equal(result!.total, 3); assert.deepEqual(f.releases, [undefined]);
  const page = f.calls.find(x => x.tag === 'product-stock:page')!; assert.match(page.sql, /LIMIT \$5 OFFSET \$6::bigint/); assert.deepEqual(page.values.slice(-2), [20, '0']);
  assert.ok(f.calls.every(c => !/^(INSERT|UPDATE|DELETE)/.test(c.sql)));
});
test('product grant alone cannot bypass inventory denial or change target/tab; no default provider', async () => {
  const f = fixture(); assert.throws(() => new PostgresProductWarehouseStockReader(f.pool, {} as never));
  const reader = new PostgresProductWarehouseStockReader(f.pool, { async authorize() { throw Object.assign(Error('denied'), { code: 'FORBIDDEN' }); } });
  await assert.rejects(reader.readStock(read()), { code: 'FORBIDDEN' }); assert.equal(f.connects(), 0);
  await assert.rejects(new PostgresProductWarehouseStockReader(f.pool, f.authorization).readStock({ ...read(), grant: { kind: 'prices', productId: parameters.productId } }), { code: 'FORBIDDEN' }); assert.equal(f.connects(), 0);
});
test('unknown old membership stays null; missing retained balance with ledger fails instead of turning into zero', async () => {
  const seed = fixture(), ordinary = await new PostgresProductWarehouseStockReader(seed.pool, seed.authorization).readStock(read());
  const row = { warehouse_id: seed.warehouse.id, warehouse_name: seed.warehouse.label, sku_id: ordinary!.items[0]!.skuId,
    balance_present: false, quantity: null, version: null, last_operation_id: null, ledger_present: false, warehouse_published: true, sku_published: false };
  const unknown = fixture({ mutate: () => [row, { ...row, sku_id: id(41) }, { ...row, sku_id: id(42) }] });
  assert.ok((await new PostgresProductWarehouseStockReader(unknown.pool, unknown.authorization).readStock(read()))!.items.every(x => x.quantity === null && x.state === 'UNKNOWN'));
  const broken = fixture({ mutate: () => [{ ...row, ledger_present: true }, { ...row, sku_id: id(41) }, { ...row, sku_id: id(42) }] });
  await assert.rejects(new PostgresProductWarehouseStockReader(broken.pool, broken.authorization).readStock(read()), { code: 'INVENTORY_INTEGRITY_FAILED' });
});
test('unpublished inventory and missing new-profile runtime fail closed; schema number does not approve capability', async () => {
  for (const settings of [{ unpublished: true }, { version: 23 }, { version: 20 }]) {
    const f = fixture(settings); await assert.rejects(new PostgresProductWarehouseStockReader(f.pool, f.authorization).readStock(read()), { code: 'INVENTORY_NOT_READY' });
    assert.ok(!f.calls.some(c => c.tag === 'product-stock:page'));
  }
});
test('D1 reviewed exact23 capability and exact function authorize true new-created keys without any zero inserts', async () => {
  const f = fixture({ version: 23 }); let ready = 0;
  const runtime: InventoryAdmissionRuntime = { profile: 'EXACT23', async assertReady() { ready++; } };
  const result = await new PostgresProductWarehouseStockReader(f.pool, f.authorization, runtime).readStock(read());
  assert.equal(result!.items[2]!.quantity, '0'); assert.equal(ready, 1); assert.equal(f.calls.filter(c => c.tag === 'inventory-admission:keys').length, 1);
  assert.ok(!f.calls.some(c => /^(INSERT|UPDATE|DELETE)/.test(c.sql)));
});
test('page beyond end is empty; absent product returns null; SQL error never becomes READ_FAILED zero', async () => {
  const f = fixture(), q = { ...parameters, page: 2 }, r = { ...read(), parameters: q, intent: { kind: 'stock' as const, parameters: q } };
  assert.deepEqual((await new PostgresProductWarehouseStockReader(f.pool, f.authorization).readStock(r))!.items, []);
  const missing = fixture({ missingProduct: true }); assert.equal(await new PostgresProductWarehouseStockReader(missing.pool, missing.authorization).readStock(read()), null);
  const failed = fixture({ fail: 'product-stock:page' }); await assert.rejects(new PostgresProductWarehouseStockReader(failed.pool, failed.authorization).readStock(read()), /SYNTHETIC/);
  assert.equal(failed.calls.at(-1)!.tag, 'ROLLBACK');
});
test('stock read unknown COMMIT discards without rollback; late confirmed-COMMIT cancellation keeps healthy client', async () => {
  const f = fixture({ fail: 'COMMIT' }); await assert.rejects(new PostgresProductWarehouseStockReader(f.pool, f.authorization).readStock(read()), /SYNTHETIC/);
  assert.equal(f.calls.at(-1)!.tag, 'COMMIT'); assert.ok(f.releases[0] instanceof Error);
  const controller = new AbortController(), late = fixture({ after(tag) { if (tag === 'COMMIT') controller.abort(); } });
  await assert.rejects(new PostgresProductWarehouseStockReader(late.pool, late.authorization).readStock(read(controller.signal)), { code: 'INVENTORY_READ_ABORTED' });
  assert.deepEqual(late.releases, [undefined]); assert.equal(late.calls.at(-1)!.tag, 'COMMIT');
});

const overviewParameters = { productId: parameters.productId, warehouseMode: 'NON_ZERO' as const };
const overviewRead = (mode: 'NON_ZERO' | 'ALL' = 'NON_ZERO', signal = new AbortController().signal): ProductStockOverviewScopedRead => {
  const query = { ...overviewParameters, warehouseMode: mode };
  return { actor: inventoryActor, intent: { kind: 'stock-overview', parameters: query }, parameters: query,
    grant: { kind: 'stock', productId: query.productId }, signal };
};
function overviewFixture(options: {
  version?: number; skuCount?: string; unknown?: boolean; partial?: boolean; fail?: string; missingProduct?: boolean;
  mutate?: (tag: string, rows: Record<string, unknown>[]) => Record<string, unknown>[]; after?: (tag: string) => void;
} = {}) {
  const calls: { tag: string; sql: string; values: unknown[] }[] = [], releases: unknown[] = [];
  let connects = 0, authorizations = 0;
  const scope = { hallIds: inventoryScope.hallIds, warehouses: [0, 1, 2].map(n => ({
    id: entityId('warehouse', id(103 + n)), hallId: inventoryScope.hallIds[0]!, label: `SYNTHETIC OVERVIEW ${n}`
  })) };
  // Finite grouped DB replies only: these protocol checks do not execute SQL.
  // Each warehouse has 31 real SKU identities, including balances outside a 20-row page.
  const cells: bigint[][] = [Array.from({ length: 31 }, (_, n) => n === 0 ? 5n : n === 30 ? -5n : 0n),
    Array.from({ length: 31 }, (_, n) => n === 30 ? -2n : 0n),
    Array.from({ length: 31 }, (_, n) => n === 0 ? 9223372036854775807n : n === 30 ? 1n : 0n)];
  const client = { async query(sql: string, values: unknown[] = []) {
    const tag = /\/\* ([^*]+) \*\//.exec(sql)?.[1] ?? sql; calls.push({ tag, sql, values });
    if (tag === options.fail) throw Error('SYNTHETIC:' + tag);
    let rows: Record<string, unknown>[] = [];
    if (sql.includes('AS accounting_guards_present')) rows = [{ accounting_guards_present: true }];
    else if (sql.includes('AS integrity_guards_present')) rows = [{ integrity_guards_present: true }];
    else if (tag === 'product-overview:schema') rows = [{ versions: Array.from({ length: options.version ?? 19 }, (_, i) => i + 1) }];
    else if (tag === 'product-overview:product') rows = options.missingProduct ? [] : [{ id: parameters.productId }];
    else if (tag === 'product-overview:publication') {
      const counts = { WAREHOUSE: 3, SKU: 31, INVENTORY_LEDGER: 5, IMPORT_BATCH: 1 };
      rows = [{ id: id(130), completed: true, final_approval: true, checkpoint: { sequence: 2, cursor: 40, counts, expected: counts } }];
    } else if (tag === 'product-overview:warehouses') rows = scope.warehouses.map(w => ({ id: w.id, hall_id: w.hallId, name: w.label }));
    else if (tag === 'product-overview:coverage') rows = [{ full_coverage: !options.partial }];
    else if (tag === 'product-overview:sku-count') rows = [{ total: options.skuCount ?? '31', valid_sizes: true }];
    else if (tag === 'product-overview:aggregate') rows = scope.warehouses.map((w, i) => ({ warehouse_id: w.id, warehouse_name: w.label,
      key_count: '31', unknown_keys: options.unknown && i === 0 ? '1' : '0', known_quantity: cells[i]!.reduce((sum, n) => sum + n, 0n).toString(), invalid: false }));
    rows = options.mutate?.(tag, rows) ?? rows; options.after?.(tag); return { rows, rowCount: rows.length };
  }, release(error?: Error) { releases.push(error); } };
  const pool: PgSalesPool = { async connect() { connects++; return client; } };
  const authorization: InventoryQueryAuthorization = { async authorize(actor, intent, signal) {
    authorizations++; assert.deepEqual(actor, inventoryActor); assert.equal(signal.aborted, false);
    assert.deepEqual(intent, { kind: 'inventory', parameters: { page: 1, pageSize: 100,
      filter: { productIds: [parameters.productId], categoryIds: [], warehouseIds: [], supplierIds: [], fitIds: [], seasonIds: [] } } });
    return scope;
  } };
  return { pool, client, scope, calls, releases, authorization, connects: () => connects, authorizations: () => authorizations };
}
test('overview uses whole authorized warehouse aggregates, exact signed totals and net-zero mode filtering beyond twenty keys', async () => {
  const f = overviewFixture(), reader = new PostgresProductWarehouseStockReader(f.pool, f.authorization);
  const result = await reader.readOverview(overviewRead());
  assert.deepEqual(result!.items.map(x => x.quantity), ['-2', '9223372036854775808']);
  assert.deepEqual(result!.counts, { authorizedWarehouses: 3, nonZeroWarehouses: 2, zeroWarehouses: 1, unknownWarehouses: 0, returnedWarehouses: 2 });
  assert.deepEqual(result!.total, { state: 'KNOWN', quantity: '9223372036854775806', unknownSkuWarehouseKeys: 0 });
  assert.equal(result!.coverage, 'ALL_BUSINESS_WAREHOUSES'); assert.equal(f.authorizations(), 1);
  const aggregate = f.calls.filter(c => c.tag === 'product-overview:aggregate'); assert.equal(aggregate.length, 1);
  assert.deepEqual(aggregate[0]!.values, [parameters.productId, f.scope.warehouses.map(w => w.id), f.scope.hallIds, id(130)]);
  assert.match(aggregate[0]!.sql, /CROSS JOIN product_skus/); assert.match(aggregate[0]!.sql, /sum\(CASE WHEN admitted/);
  assert.match(aggregate[0]!.sql, /bool_or\(admitted IS NULL/); assert.match(aggregate[0]!.sql, /LEFT JOIN naijue_erp.inventory_balance/);
  assert.doesNotMatch(aggregate[0]!.sql, /\bLIMIT\b|\bOFFSET\b|quantity\s*>\s*0|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
  assert.equal(f.calls[0]!.tag, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); assert.equal(f.calls.at(-1)!.tag, 'COMMIT');
  assert.ok(!f.calls.some(c => c.tag.startsWith('product-stock:'))); assert.deepEqual(f.releases, [undefined]);
  const all = overviewFixture(), allResult = await new PostgresProductWarehouseStockReader(all.pool, all.authorization).readOverview(overviewRead('ALL'));
  assert.deepEqual(allResult!.items.map(x => x.quantity), ['0', '-2', '9223372036854775808']);
  assert.deepEqual(allResult!.total, result!.total); assert.equal(allResult!.counts.returnedWarehouses, 3);
  assert.notEqual(allResult!.readReference, result!.readReference);
});
test('overview retains unknown warehouses and labels a verified partial scope without reporting a partial subtotal as total', async () => {
  const f = overviewFixture({ unknown: true, partial: true }), result = await new PostgresProductWarehouseStockReader(f.pool, f.authorization).readOverview(overviewRead());
  assert.deepEqual(result!.total, { state: 'UNKNOWN', quantity: null, unknownSkuWarehouseKeys: 1 });
  assert.deepEqual(result!.items[0], { warehouseId: f.scope.warehouses[0]!.id, warehouseName: f.scope.warehouses[0]!.label, state: 'UNKNOWN', quantity: null, unknownSkuCount: 1 });
  assert.equal(result!.coverage, 'AUTHORIZED_SUBSET'); assert.equal(result!.counts.authorizedWarehouses, 3); assert.equal(result!.counts.unknownWarehouses, 1);
  const coverage = f.calls.find(c => c.tag === 'product-overview:coverage')!;
  assert.match(coverage.sql, /SELECT NOT EXISTS/); assert.deepEqual(coverage.values, [f.scope.warehouses.map(w => w.id), f.scope.hallIds]);
  assert.doesNotMatch(coverage.sql, /quantity|count\(/);
});
test('overview rejects integrity errors even in a warehouse hidden by NON_ZERO, and rejects incomplete or oversized SKU universes', async () => {
  for (const [tag, change] of [
    ['product-overview:aggregate', { invalid: true }], ['product-overview:aggregate', { key_count: '30' }],
    ['product-overview:aggregate', { unknown_keys: '32' }], ['product-overview:aggregate', { known_quantity: '-0' }],
    ['product-overview:warehouses', { hall_id: id(999) }], ['product-overview:sku-count', { valid_sizes: false }]
  ] as const) {
    const f = overviewFixture({ mutate: (current, rows) => current === tag ? rows.map((r, i) => i === 0 ? { ...r, ...change } : r) : rows });
    await assert.rejects(new PostgresProductWarehouseStockReader(f.pool, f.authorization).readOverview(overviewRead()), { code: 'INVENTORY_INTEGRITY_FAILED' });
    assert.equal(f.calls.at(-1)!.tag, 'ROLLBACK'); assert.deepEqual(f.releases, [undefined]);
  }
  for (const [skuCount, code] of [['0', 'INVENTORY_NOT_READY'], ['333334', 'INVENTORY_READ_TOO_LARGE']] as const) {
    const f = overviewFixture({ skuCount });
    await assert.rejects(new PostgresProductWarehouseStockReader(f.pool, f.authorization).readOverview(overviewRead()), { code });
    assert.ok(!f.calls.some(c => c.tag === 'product-overview:aggregate'));
  }
});
test('overview requires the stock tab and independent warehouse grant before a connection, and never converts missing/failed reads into zero', async () => {
  const f = overviewFixture(), denied = new PostgresProductWarehouseStockReader(f.pool, { async authorize() { throw Object.assign(Error('denied'), { code: 'FORBIDDEN' }); } });
  await assert.rejects(denied.readOverview(overviewRead()), { code: 'FORBIDDEN' }); assert.equal(f.connects(), 0);
  const reader = new PostgresProductWarehouseStockReader(f.pool, f.authorization);
  await assert.rejects(reader.readOverview({ ...overviewRead(), grant: { kind: 'prices', productId: parameters.productId } }), { code: 'FORBIDDEN' });
  await assert.rejects(reader.readOverview({ ...overviewRead(), grant: { kind: 'stock', productId: id(999) } }), { code: 'FORBIDDEN' });
  assert.equal(f.connects(), 0);
  const missing = overviewFixture({ missingProduct: true });
  assert.equal(await new PostgresProductWarehouseStockReader(missing.pool, missing.authorization).readOverview(overviewRead()), null);
  assert.ok(!missing.calls.some(c => c.tag === 'product-overview:aggregate'));
  const failed = overviewFixture({ fail: 'product-overview:aggregate' });
  await assert.rejects(new PostgresProductWarehouseStockReader(failed.pool, failed.authorization).readOverview(overviewRead()), /SYNTHETIC/);
  assert.equal(failed.calls.at(-1)!.tag, 'ROLLBACK');
});
test('overview exact26 requires the reviewed capability on the original snapshot client; missing, wrong-pool or boolean capability never reaches aggregation', async () => {
  for (const version of [23, 24, 25, 26, 27]) {
    const f = overviewFixture({ version });
    await assert.rejects(new PostgresProductWarehouseStockReader(f.pool, f.authorization).readOverview(overviewRead()), { code: 'INVENTORY_NOT_READY' });
    assert.ok(!f.calls.some(c => c.tag === 'product-overview:aggregate'));
  }
  for (const verify of [async () => { throw Error('SYNTHETIC WRONG POOL'); }, async () => true]) {
    const f = overviewFixture({ version: 26 }), cap = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', assertReady: verify } as unknown as NativeRuntime26Capability;
    await assert.rejects(new PostgresProductWarehouseStockReader(f.pool, f.authorization, null, cap).readOverview(overviewRead()));
    assert.ok(!f.calls.some(c => c.tag === 'product-overview:aggregate'));
  }
  const f = overviewFixture({ version: 26 }); let verified = 0;
  const cap: NativeRuntime26Capability = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(client, purpose) {
    verified++; assert.equal(client, f.client); assert.equal(purpose, 'INVENTORY_ADMISSION');
    assert.equal(f.calls.at(-1)!.tag, 'product-overview:schema');
  } };
  const result = await new PostgresProductWarehouseStockReader(f.pool, f.authorization, null, cap).readOverview(overviewRead());
  assert.equal(verified, 1); assert.equal(result!.total.quantity, '9223372036854775806');
  assert.match(f.calls.find(c => c.tag === 'product-overview:aggregate')!.sql, /LEFT JOIN LATERAL naijue_erp.inventory_key_admission\(w.id,s.id\) a ON true/);
});
test('overview unknown COMMIT discards without retry, and late confirmed-COMMIT cancellation preserves the healthy client', async () => {
  const f = overviewFixture({ fail: 'COMMIT' });
  await assert.rejects(new PostgresProductWarehouseStockReader(f.pool, f.authorization).readOverview(overviewRead()), /SYNTHETIC/);
  assert.equal(f.calls.at(-1)!.tag, 'COMMIT'); assert.ok(f.releases[0] instanceof Error); assert.equal(f.connects(), 1);
  const controller = new AbortController(), late = overviewFixture({ after(tag) { if (tag === 'COMMIT') controller.abort(); } });
  await assert.rejects(new PostgresProductWarehouseStockReader(late.pool, late.authorization).readOverview(overviewRead('ALL', controller.signal)), { code: 'INVENTORY_READ_ABORTED' });
  assert.deepEqual(late.releases, [undefined]); assert.equal(late.calls.at(-1)!.tag, 'COMMIT');
});
