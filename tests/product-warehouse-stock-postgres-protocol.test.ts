import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresProductWarehouseStockReader } from '../adapters/postgres/src/product-warehouse-stock-reader.ts';
import type { InventoryAdmissionRuntime } from '../adapters/postgres/src/inventory-key-admission-reader.ts';
import type { PgSalesPool } from '../adapters/postgres/src/sales-unit-of-work.ts';
import type { ProductDetailsScopedRead, ProductDetailsPageQuery } from '../packages/application/src/product-details-query-ports.ts';
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
