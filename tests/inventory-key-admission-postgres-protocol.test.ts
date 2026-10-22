import test from 'node:test';
import assert from 'node:assert/strict';
import { readInventoryKeyAdmissions } from '../adapters/postgres/src/inventory-key-admission-reader.ts';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const keys = [{ warehouseId: id(1), skuId: id(2) }, { warehouseId: id(1), skuId: id(3) }];
function client(reverse = false, duplicate = false) {
  const calls: string[] = [];
  return { calls, async query(sql: string, values: unknown[] = []) {
    calls.push(sql); assert.deepEqual(values, [[id(1), id(1)], [id(2), id(3)]]);
    const rows = keys.map(k => ({ warehouse_id: k.warehouseId, sku_id: k.skuId, admitted: true, published_batch_id: id(8),
      warehouse_basis: 'CUTOFF_MEMBER', sku_basis: 'CUTOFF_MEMBER', warehouse_created_operation_id: null, sku_created_operation_id: null }));
    return { rows: duplicate ? [rows[0]!, rows[0]!] : reverse ? rows.reverse() : rows, rowCount: 2 };
  } };
}
test('one bounded batched query uses D1 exact function and exact key order, not N application queries', async () => {
  const c = client(), result = await readInventoryKeyAdmissions(c, keys); assert.equal(result.length, 2); assert.equal(c.calls.length, 1);
  assert.match(c.calls[0]!, /CROSS JOIN LATERAL naijue_erp.inventory_key_admission/); assert.match(c.calls[0]!, /WITH ORDINALITY/);
});
test('changed/duplicate returned key, duplicate requested key and overbound fail; empty set makes no SQL', async () => {
  for (const c of [client(true), client(false, true)]) await assert.rejects(readInventoryKeyAdmissions(c, keys), { code: 'INVENTORY_INTEGRITY_FAILED' });
  const c = client(); await assert.rejects(readInventoryKeyAdmissions(c, [keys[0]!, keys[0]!]));
  await assert.rejects(readInventoryKeyAdmissions(c, Array.from({ length: 1001 }, () => keys[0]!))); assert.deepEqual(c.calls, []);
  assert.deepEqual(await readInventoryKeyAdmissions(c, []), []);
});
