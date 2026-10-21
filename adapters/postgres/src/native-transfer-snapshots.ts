import type { SkuSnapshot } from "../../../packages/domain/src/documents.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { EntityId } from "../../../packages/domain/src/values.ts";
import type { PgSalesResult } from "./sales-unit-of-work.ts";

export const NATIVE_TRANSFER_SNAPSHOT_LIMIT = 200;
/** Uses only the caller's original transaction. MAIN-only manual SKU selection;
 * not a barcode scanner, price-completeness assertion or catalogue publication.
 * Missing MAIN is unavailable, never an inferred null or regenerated barcode. */
export async function loadNativeTransferSnapshots(
  query: (sql: string, values?: unknown[]) => Promise<PgSalesResult>, requested: readonly EntityId<"sku">[]
): Promise<ReadonlyMap<EntityId<"sku">, SkuSnapshot>> {
  const ids = [...new Set(requested.map(value => entityId("sku", value)))].sort();
  requireDomain(ids.length > 0 && ids.length <= NATIVE_TRANSFER_SNAPSHOT_LIMIT, "INVALID_LINES", "Bounded SKU selection required");
  const schema = await query("/* native-transfer-snapshots:schema */ SELECT EXISTS (SELECT 1 FROM naijue_erp.schema_migration WHERE version = 9) AS installed");
  requireDomain(schema.rows.length === 1 && schema.rows[0]!.installed === true,
    "NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE", "Native barcode authority is unavailable");
  const result = await query(`/* native-transfer-snapshots:targets */ SELECT s.id,
    p.product_code, p.name AS product_name, c.name AS color_name, f.name AS fit_name, sz.name AS size_name, b.barcode
    FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id = s.product_id
    JOIN naijue_erp.color c ON c.id = s.color_id JOIN naijue_erp.fit f ON f.id = s.fit_id
    JOIN naijue_erp.size sz ON sz.id = s.size_id
    JOIN naijue_erp.size_group_member m ON m.size_group_id = p.size_group_id AND m.size_id = s.size_id
    JOIN naijue_erp.sku_barcode b ON b.sku_id = s.id AND b.enabled AND b.barcode_kind = 'MAIN'
    WHERE s.id = ANY($1::uuid[]) AND s.enabled AND p.enabled AND c.enabled AND f.enabled
    ORDER BY s.id FOR SHARE OF s, p, c, f, sz, m, b`, [ids]);
  requireDomain(result.rows.length === ids.length, "NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE", "Complete current SKU snapshots required");
  const snapshots = new Map<EntityId<"sku">, SkuSnapshot>();
  function label(value: unknown): string {
    requireDomain(typeof value === "string" && value.trim().length > 0, "INVALID_DATABASE_VALUE", "Native snapshot label unavailable"); return value;
  }
  for (const row of result.rows) {
    const skuId = entityId("sku", row.id as string);
    requireDomain(ids.includes(skuId) && !snapshots.has(skuId), "INVALID_DATABASE_VALUE", "Unexpected native snapshot target");
    requireDomain(typeof row.barcode === "string" && row.barcode.length > 0, "NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE", "Actual raw MAIN barcode required");
    snapshots.set(skuId, Object.freeze({ productCode: label(row.product_code), productName: label(row.product_name),
      colorName: label(row.color_name), fitName: label(row.fit_name), sizeName: label(row.size_name), barcode: row.barcode }));
  }
  return snapshots;
}
