import { requireDomain } from '../../domain/src/errors.ts';
import { entityId } from '../../domain/src/values.ts';

/** D1 INVENTORY_KEY_ADMISSION_23_V1. This DTO consumes the unique SQL decision,
 * never reimplements native-creation proof or grants a frontend admission flag. */
export type InventoryAdmissionBasis = 'CUTOFF_MEMBER' | 'POST_CUTOFF_CREATED';
export interface InventoryKeyAdmission {
  readonly warehouseId: string; readonly skuId: string; readonly admitted: boolean; readonly publishedBatchId: string | null;
  readonly warehouseBasis: InventoryAdmissionBasis | null; readonly skuBasis: InventoryAdmissionBasis | null;
  readonly warehouseCreatedOperationId: string | null; readonly skuCreatedOperationId: string | null;
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
export function checkedInventoryKeyAdmission(value: unknown, warehouseId: string, skuId: string): InventoryKeyAdmission {
  entityId('warehouse', warehouseId); entityId('sku', skuId);
  const must = (ok: unknown) => requireDomain(ok, 'INVENTORY_INTEGRITY_FAILED', 'Invalid native inventory admission evidence');
  must(value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype);
  const keys = ['admitted', 'published_batch_id', 'warehouse_basis', 'sku_basis', 'warehouse_created_operation_id', 'sku_created_operation_id'];
  const row: Record<string, unknown> = {};
  must(Reflect.ownKeys(value as object).length === keys.length);
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key); must(d && d.enumerable && Object.hasOwn(d, 'value')); row[key] = d!.value; }
  must(typeof row.admitted === 'boolean' && (row.published_batch_id === null || uuid(row.published_batch_id)));
  for (const name of ['warehouse', 'sku']) {
    const basis = row[name + '_basis'], operation = row[name + '_created_operation_id'];
    must(basis === null || basis === 'CUTOFF_MEMBER' || basis === 'POST_CUTOFF_CREATED');
    must(operation === null || uuid(operation));
    if (basis === 'POST_CUTOFF_CREATED') must(uuid(operation));
    if (row.admitted) must(row.published_batch_id !== null && basis !== null);
  }
  return Object.freeze({ warehouseId, skuId, admitted: row.admitted as boolean, publishedBatchId: row.published_batch_id as string | null,
    warehouseBasis: row.warehouse_basis as InventoryAdmissionBasis | null, skuBasis: row.sku_basis as InventoryAdmissionBasis | null,
    warehouseCreatedOperationId: row.warehouse_created_operation_id as string | null, skuCreatedOperationId: row.sku_created_operation_id as string | null });
}
