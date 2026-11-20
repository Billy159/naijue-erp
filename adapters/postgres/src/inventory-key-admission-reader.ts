import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { entityId } from '../../../packages/domain/src/values.ts';
import { checkedInventoryKeyAdmission } from '../../../packages/application/src/inventory-key-admission.ts';
import type { InventoryKeyAdmission } from '../../../packages/application/src/inventory-key-admission.ts';
import type { PgSalesClient } from './sales-unit-of-work.ts';

export interface InventoryAdmissionRuntime {
  readonly profile: 'EXACT23' | 'EXACT24';
  /** D1-owned finite function/schema/ACL capability. Missing/invalid evidence must throw.
   * Called with the SAME snapshot client; this leaf cannot approve a profile from a version number. */
  readonly assertReady: (client: Pick<PgSalesClient, 'query'>) => Promise<void>;
}
export async function readInventoryKeyAdmissions(client: Pick<PgSalesClient, 'query'>,
  keys: readonly { readonly warehouseId: string; readonly skuId: string }[]): Promise<readonly InventoryKeyAdmission[]> {
  requireDomain(keys.length <= 1000, 'INVENTORY_READ_TOO_LARGE', 'Bounded exact inventory keys required');
  const identities = keys.map(k => { entityId('warehouse', k.warehouseId); entityId('sku', k.skuId); return JSON.stringify([k.warehouseId, k.skuId]); });
  requireDomain(new Set(identities).size === identities.length, 'INVENTORY_INTEGRITY_FAILED', 'Duplicate requested inventory admission key');
  if (keys.length === 0) return [];
  const rows = (await client.query(`/* inventory-admission:keys */ SELECT k.warehouse_id,k.sku_id,
    a.admitted,a.published_batch_id,a.warehouse_basis,a.sku_basis,a.warehouse_created_operation_id,a.sku_created_operation_id
    FROM unnest($1::uuid[],$2::uuid[]) WITH ORDINALITY AS k(warehouse_id,sku_id,position)
    CROSS JOIN LATERAL naijue_erp.inventory_key_admission(k.warehouse_id,k.sku_id) a ORDER BY k.position`,
  [keys.map(k => k.warehouseId), keys.map(k => k.skuId)])).rows;
  requireDomain(rows.length === keys.length, 'INVENTORY_INTEGRITY_FAILED', 'One native admission decision per exact key required');
  return rows.map((row, index) => {
    const key = keys[index]!;
    requireDomain(row.warehouse_id === key.warehouseId && row.sku_id === key.skuId, 'INVENTORY_INTEGRITY_FAILED', 'Native admission key changed');
    const { warehouse_id: _w, sku_id: _s, ...evidence } = row;
    return checkedInventoryKeyAdmission(evidence, key.warehouseId, key.skuId);
  });
}
