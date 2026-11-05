import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedInventoryKeyAdmission } from '../packages/application/src/inventory-key-admission.ts';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const evidence = () => ({ admitted: true, published_batch_id: id(1), warehouse_basis: 'CUTOFF_MEMBER', sku_basis: 'POST_CUTOFF_CREATED',
  warehouse_created_operation_id: null, sku_created_operation_id: id(2) });
test('D1 admission result preserves mixed original/new evidence without inventing a second decision', () => {
  const value = checkedInventoryKeyAdmission(evidence(), id(3), id(4));
  assert.equal(value.admitted, true); assert.equal(value.skuBasis, 'POST_CUTOFF_CREATED'); assert.equal(value.skuCreatedOperationId, id(2)); assert.ok(Object.isFrozen(value));
  assert.equal(checkedInventoryKeyAdmission({ ...evidence(), admitted: false, published_batch_id: null }, id(3), id(4)).admitted, false);
});
test('admitted evidence needs a published batch, both valid bases and actual new-operation IDs; getters never run', () => {
  let gets = 0; const accessor = Object.defineProperty(evidence(), 'admitted', { enumerable: true, get() { gets++; return true; } });
  for (const value of [accessor, { ...evidence(), admitted: 1 }, { ...evidence(), published_batch_id: null }, { ...evidence(), warehouse_basis: null },
    { ...evidence(), sku_created_operation_id: null }, { ...evidence(), sku_basis: 'ENABLED_IS_ZERO' }, { ...evidence(), extra: true }]) {
    assert.throws(() => checkedInventoryKeyAdmission(value, id(3), id(4)), { code: 'INVENTORY_INTEGRITY_FAILED' });
  }
  assert.equal(gets, 0);
});
