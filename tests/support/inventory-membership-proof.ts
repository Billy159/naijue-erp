/** Driver-free review helpers for the inventory membership rewrite. These do not execute SQL. */
const projection = "SELECT s.id, s.product_id, s.color_id, s.fit_id, s.size_id, p.size_group_id FROM naijue_erp.sku s JOIN matched_products p ON p.id = s.product_id";
const previousProjection = "SELECT s.id, s.product_id, s.color_id, s.fit_id, s.size_id FROM naijue_erp.sku s JOIN matched_products p ON p.id = s.product_id";
const membership = `EXISTS (SELECT 1 FROM filtered_skus s WHERE NOT EXISTS (
      SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id = s.size_group_id AND m.size_id = s.size_id)) AS invalid_sku_size`;
const previousMembership = `EXISTS (SELECT 1 FROM filtered_skus s JOIN matched_products p ON p.id = s.product_id WHERE NOT EXISTS (
      SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id = p.size_group_id AND m.size_id = s.size_id)) AS invalid_sku_size`;

/** Reconstruct exactly the reviewed preceding expression, not a second implementation or production fallback. */
export function previousInventoryMembershipSource(source: string): string {
  if (source.split(projection).length !== 2 || source.split(membership).length !== 2)
    throw new Error("Expected one reviewed projected group and one catalog-status membership expression");
  return source.replace(projection, previousProjection).replace(membership, previousMembership);
}

/** Returns the actual static CATALOG + catalog-status SELECT text for a later separately gated PostgreSQL comparison. */
export function inventoryCatalogStatusSql(source: string): string {
  const catalog = /const CATALOG = `([\s\S]*?)`;/u.exec(source)?.[1];
  const status = /async function catalogStatus[\s\S]*?one\(await query\(`([\s\S]*?)`, values\)\);/u.exec(source)?.[1];
  if (!catalog || !status || status.split("${CATALOG}").length !== 2)
    throw new Error("Expected the reviewed static inventory CATALOG and catalog-status query");
  const sql = status.replace("${CATALOG}", catalog);
  if (sql.includes("${")) throw new Error("Unresolved query interpolation is not accepted");
  return sql;
}
