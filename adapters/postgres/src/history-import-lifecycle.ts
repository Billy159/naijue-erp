import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { HISTORY_COUNT_KEYS } from "../../../packages/application/src/history-storage-contract.ts";
import type { HistoryCounts } from "../../../packages/application/src/history-storage-contract.ts";
import { HISTORY_IMPORT_READBACK_VERSION, assertHistoryImportReadbackCapabilities, validateHistoryImportStageMetadata } from "../../../packages/application/src/history-import-lifecycle.ts";
import type { HistoryImportStageMetadata, HistoryImportReconciliation } from "../../../packages/application/src/history-import-lifecycle.ts";
import { IMPORT_V2_TABLES } from "../../../packages/application/src/import-v2-contract.ts";
import { assertReviewedNativeImportSchema } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { PgSalesClient } from "./sales-unit-of-work.ts";

const TABLES = HISTORY_COUNT_KEYS.filter(k => k !== "barcodes");
const count = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^(?:0|[1-9][0-9]*)$/.test(v) ? Number(v) : NaN;
  requireDomain(Number.isSafeInteger(n) && n >= 0, "HISTORY_IMPORT_DATABASE_COUNT", "Exact safe-integer database count required"); return n;
};
const quote = (v: string): string => `'${v.replaceAll("'", "''")}'`;
async function noInvalid(client: PgSalesClient, tag: string, sql: string, batchId: string): Promise<void> {
  const rows = (await client.query(`/* history-lifecycle:${tag} */ ${sql}`, [batchId])).rows;
  requireDomain(rows.length === 0, "HISTORY_IMPORT_READBACK_FAILED", `Historical SQL field/lineage verification failed: ${tag}; counts alone cannot publish`);
}
// Cast the extracted VALUE, never the JSON key literal (:: binds before ->>).
const N = (key: string): string => `(s.normalized_fields->>${quote(key)})`;
const F = (key: string, property: string): string => `(s.field_provenance->'fields'->${quote(key)}->>${quote(property)})`;
function headerConditions(sales: boolean): string {
  const nullable = (column: string, field: string) => `h.${column} IS NOT DISTINCT FROM NULLIF(${N(field)},'')`;
  // v2Cents intentionally preserves source spellings such as 0001.00.
  const money = (column: string, field: string) => `(${N(field)} ~ '^-?[0-9]+([.][0-9]{1,2})?$'
    AND h.${column}=${N(field)}::numeric AND s.field_provenance->'fields'->${quote(field)}->'raw'=s.raw_fields->${quote(field)}
    AND (s.raw_fields->${quote(field)}=s.normalized_fields->${quote(field)} OR (${F(field,"origin")}='MIGRATION_DERIVED'
      AND length(${F(field,"evidence_ref")})>0 AND ${F(field,"parsed")}::numeric=h.${column})))`;
  const columns = IMPORT_V2_TABLES.find(t => t.entity === (sales ? "SALES_HEADER" : "TRANSFER_HEADER"))!.columns;
  const conditions = ["h.version=1", "s.raw_fields->>'来源编号'=s.source_key", `${N("来源编号")}=s.source_key`,
    `s.normalized_fields ?& ARRAY[${columns.map(c => quote(c.name)).join(",")}]`,
    `s.normalized_fields-ARRAY[${columns.map(c => quote(c.name)).join(",")}]='{}'::jsonb`,
    "NOT EXISTS(SELECT 1 FROM jsonb_each(s.normalized_fields) f WHERE jsonb_typeof(f.value) IS DISTINCT FROM 'string')",
    ...columns.filter(c=>c.logicalType!=="MONEY" && !["创建厅归属来源","创建厅归属原因","原创建厅编号"].includes(c.name))
      .map(c=>`(s.raw_fields->${quote(c.name)}=s.normalized_fields->${quote(c.name)}${!c.required || c.logicalType==="DATE" ? ` OR (NOT s.raw_fields ? ${quote(c.name)} AND ${N(c.name)}='')` : ""})`),
    `h.number=${N("原单号")}`, `h.source_status=CASE ${N("原审核状态")} WHEN '未审核' THEN 'DRAFT' WHEN '已审核' THEN 'APPROVED' WHEN '已作废' THEN 'VOID' END`,
    "s.field_provenance->'history_header_staging'->>'validator_version'='V3_HISTORY_HEADER_STAGE_1'",
    "s.field_provenance->'history_header_mapping'->>'validator_version'='V3_HISTORY_HEADER_1'",
    `h.business_date IS NOT NULL AND h.business_date=(${F("业务日期","parsed_date")})::date`,
    nullable("note","备注"), nullable("created_by_source_key","原制单账号编号"), nullable("approved_by_source_key","原审核账号编号"),
    `h.created_hall_id IS NOT DISTINCT FROM (${F("created_hall_id","parsed")})::uuid`,
    `h.created_hall_provenance=${F("created_hall_id","origin")}`, `h.created_hall_reason=${F("created_hall_id","reason")}`,
    `length(btrim(${F("created_hall_id","evidence_ref")}))>0`,
    `s.field_provenance->'fields'->'created_hall_id'->'raw'=COALESCE(s.raw_fields->'原创建厅编号','null'::jsonb)`];
  for (const field of ["业务日期", "原创建时间", "原修改时间", "原审核时间"]) {
    conditions.push(`s.field_provenance->'fields'->${quote(field)} ?& ARRAY['parse_state','precision','encoding','parsed_date','parsed_local','parsed_instant','evidence_ref']`,
      `${F(field,"parse_state")} IN ('EXACT','DATE_ONLY','UNKNOWN','POLICY_REQUIRED')`,
      `s.field_provenance->'fields'->${quote(field)}->'raw'=s.normalized_fields->${quote(field)}`);
  }
  for (const [column, field] of [["created","原创建时间"],["updated","原修改时间"],["approved","原审核时间"]]) {
    conditions.push(`h.${column}_local_at IS NOT DISTINCT FROM (${F(field!,"parsed_local")})::timestamp`,
      `h.${column}_instant IS NOT DISTINCT FROM (${F(field!,"parsed_instant")})::timestamptz`);
  }
  if (sales) conditions.push(`h.business_type=CASE ${N("单据类型")} WHEN '销售' THEN 'SALE' WHEN '退货' THEN 'RETURN' WHEN '换货' THEN 'EXCHANGE' END`,
    money("gross_amount","优惠前金额"), money("order_discount","整单优惠"), money("net_due","应结金额"));
  else conditions.push(nullable("created_role_source","原制单角色"), "h.from_warehouse_id<>h.to_warehouse_id");
  return conditions.map(c => `(${c})`).join(" AND ");
}
async function headerBindings(client: PgSalesClient, batchId: string, sales: boolean): Promise<void> {
  const table = sales ? "history_sales_header" : "history_transfer_header";
  const relations = sales ? [["HALL","所属厅来源编号","hall_id",false],["CUSTOMER","客户来源编号","customer_id",false],
    ["WAREHOUSE","仓库来源编号","warehouse_id",false],["STAFF","营业员来源编号","salesperson_id",true],["HALL","原创建厅编号","created_hall_id",true]] as const
    : [["WAREHOUSE","调出仓来源编号","from_warehouse_id",false],["WAREHOUSE","调入仓来源编号","to_warehouse_id",false],["HALL","原创建厅编号","created_hall_id",true]] as const;
  for (const [entity, field, column, optional] of relations) {
    const binding = entity === "WAREHOUSE" ? `EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=h.batch_id
      AND r.source_entity_type='WAREHOUSE' AND r.source_key=${N(field)} AND r.target_type='WAREHOUSE' AND r.target_id=h.${column} AND r.status='IMPORTED')`
      : `EXISTS(SELECT 1 FROM naijue_erp.import_header_native_reference r WHERE r.batch_id=h.batch_id AND r.entity_type=${quote(entity)}
        AND r.source_key=${N(field)} AND r.${entity === "HALL" ? "native_hall_id" : entity === "CUSTOMER" ? "native_customer_id" : "native_staff_id"}=h.${column})`;
    const condition = optional ? `((${N(field)}='' AND h.${column} IS NULL) OR (${N(field)}<>'' AND ${binding}))` : binding;
    await noInvalid(client, `header-binding-${entity}-${column}`, `SELECT 1 AS invalid FROM naijue_erp.${table} h
      JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id
      WHERE h.batch_id=$1::uuid AND (${condition}) IS DISTINCT FROM TRUE LIMIT 1`, batchId);
  }
}
const DICTIONARIES = [
  ["CATEGORY","product_category","category_id","category"], ["COLOR","color","color_id","color"],
  ["FIT","fit","fit_id","fit"], ["SIZE","size","size_id","size"],
  ["SIZE_GROUP","size_group","size_group_id","sizeGroup"], ["SEASON","season","season_id","season"]
] as const;
const PARTIES = ["HALL","CUSTOMER","STAFF","WAREHOUSE","SUPPLIER"] as const;
/** Lock current native identities before validating them. Batch/cutoff locks keep
 * import membership stable; FOR SHARE additionally excludes ordinary native
 * maintenance through the publication CAS/COMMIT. All SQL identifiers are fixed. */
async function lockCurrentNative(client: PgSalesClient, batchId: string, versions: readonly number[]): Promise<void> {
  const products = `SELECT field_provenance->>'native_product_id' FROM naijue_erp.import_source_row WHERE batch_id=$1::uuid AND entity_type='PRODUCT'`;
  const skus = `SELECT canonical_sku_id::text FROM naijue_erp.import_sku_alias WHERE batch_id=$1::uuid
    UNION SELECT target_id::text FROM naijue_erp.import_record WHERE import_batch_id=$1::uuid AND target_type='SKU' AND status='IMPORTED'`;
  await client.query(`/* history-lifecycle:lock:product */ SELECT n.id FROM naijue_erp.product n WHERE n.id::text IN (${products}) ORDER BY n.id FOR SHARE OF n`, [batchId]);
  await client.query(`/* history-lifecycle:lock:sku */ SELECT n.id FROM naijue_erp.sku n WHERE n.id::text IN (${skus}) ORDER BY n.id FOR SHARE OF n`, [batchId]);
  for (const [entity, table, column, ref] of DICTIONARIES) {
    const scopes = [`SELECT s.field_provenance->'fields'->'native_product_import'->'references'->${quote(ref)}->>'nativeId' FROM naijue_erp.import_source_row s WHERE s.batch_id=$1::uuid`,
      `SELECT s.field_provenance->'native_sku_import'->'references'->${quote(ref)}->>'nativeId' FROM naijue_erp.import_source_row s WHERE s.batch_id=$1::uuid`];
    if (entity === "CATEGORY") scopes.push(`SELECT part->>'nativeId' FROM naijue_erp.import_source_row s
      CROSS JOIN LATERAL jsonb_array_elements(s.field_provenance->'fields'->'native_product_import'->'references'->'category'->'path') part WHERE s.batch_id=$1::uuid`);
    if (["CATEGORY","SIZE_GROUP","SEASON"].includes(entity)) scopes.push(`SELECT p.${column}::text FROM naijue_erp.product p WHERE p.id::text IN (${products})`);
    if (["COLOR","FIT","SIZE"].includes(entity)) scopes.push(`SELECT k.${column}::text FROM naijue_erp.sku k WHERE k.id::text IN (${skus})`);
    if (versions.includes(14)) scopes.push(`SELECT ${column}::text FROM naijue_erp.import_native_catalogue_binding WHERE batch_id=$1::uuid`);
    await client.query(`/* history-lifecycle:lock:${table} */ SELECT n.id FROM naijue_erp.${table} n WHERE n.id::text IN (${scopes.join(" UNION ")}) ORDER BY n.id FOR SHARE OF n`, [batchId]);
  }
  for (const entity of PARTIES) {
    const table=entity.toLowerCase();
    const scopes=[`SELECT target_id::text FROM naijue_erp.import_record WHERE import_batch_id=$1::uuid AND target_type=${quote(entity)} AND status='IMPORTED'`,
      `SELECT field_provenance->>${quote(`native_${table}_id`)} FROM naijue_erp.import_source_row WHERE batch_id=$1::uuid`];
    if (entity === "SUPPLIER") scopes.push(`SELECT p.supplier_id::text FROM naijue_erp.product p WHERE p.id::text IN (${products})`);
    if (versions.includes(13)) scopes.push(`SELECT native_id::text FROM naijue_erp.native_party_import_evidence WHERE batch_id=$1::uuid AND entity_type=${quote(entity)}`);
    if (versions.includes(12) && ["HALL","CUSTOMER","STAFF"].includes(entity)) scopes.push(`SELECT native_${table}_id::text FROM naijue_erp.import_header_native_reference WHERE batch_id=$1::uuid AND entity_type=${quote(entity)}`);
    await client.query(`/* history-lifecycle:lock:${table} */ SELECT n.id FROM naijue_erp.${table} n WHERE n.id::text IN (${scopes.join(" UNION ")}) ORDER BY n.id FOR SHARE OF n`, [batchId]);
  }
  if (versions.includes(14)) await client.query(`/* history-lifecycle:lock:size_group_member */ SELECT n.size_group_id,n.size_id FROM naijue_erp.size_group_member n
    WHERE EXISTS(SELECT 1 FROM naijue_erp.import_native_catalogue_binding e WHERE e.batch_id=$1::uuid AND e.member_group_id=n.size_group_id AND e.member_size_id=n.size_id)
    ORDER BY n.size_group_id,n.size_id FOR SHARE OF n`, [batchId]);
  await client.query(`/* history-lifecycle:lock:sku_barcode */ SELECT bc.id FROM naijue_erp.sku_barcode bc WHERE EXISTS(
    SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=$1::uuid AND s.entity_type='BARCODE'
    AND s.field_provenance->>'native_barcode'=bc.barcode AND s.field_provenance->>'native_sku_id'=bc.sku_id::text) ORDER BY bc.id FOR SHARE OF bc`, [batchId]);
  await client.query(`/* history-lifecycle:lock:barcode_scheme */ SELECT n.id FROM naijue_erp.barcode_scheme n WHERE EXISTS(
    SELECT 1 FROM naijue_erp.sku_barcode bc JOIN naijue_erp.import_source_row s ON s.field_provenance->>'native_barcode'=bc.barcode
    WHERE s.batch_id=$1::uuid AND s.entity_type='BARCODE' AND bc.scheme_id=n.id) ORDER BY n.id FOR SHARE OF n`, [batchId]);
}
/** Same already-locked client only. NO checkpoint/counter/batch UPDATE, no
 * publication, no source writes and no externally supplied validation boolean.
 * Counts are observations; per-class field/lineage checks and final DB triggers
 * remain independent. The authorization artifact hash is NOT recomputed here. */
export async function reconcileHistoryImport(client: PgSalesClient, batchId: string, metadata: HistoryImportStageMetadata,
  schemaVersions: readonly number[]): Promise<HistoryImportReconciliation> {
  validateHistoryImportStageMetadata(metadata); assertHistoryImportReadbackCapabilities(metadata.expectedCounts);
  assertReviewedNativeImportSchema(schemaVersions,{minimumVersion:11,errorCode:"HISTORY_IMPORT_SCHEMA_NOT_READY"});
  await lockCurrentNative(client,batchId,schemaVersions);
  const actual = {} as HistoryCounts;
  for (const table of TABLES) {
    const rows = (await client.query(`/* history-lifecycle:count:${table} */ SELECT count(*)::text AS n FROM naijue_erp.${table} WHERE batch_id=$1::uuid`, [batchId])).rows;
    requireDomain(rows.length === 1, "HISTORY_IMPORT_DATABASE_COUNT", "Exactly one independent count row required"); actual[table] = count(rows[0]!.n);
  }
  const barcode = (await client.query(`/* history-lifecycle:count:barcodes */ SELECT count(*)::text AS n FROM naijue_erp.import_source_row s
    JOIN naijue_erp.sku_barcode bc ON bc.barcode=s.field_provenance->>'native_barcode' AND bc.sku_id::text=s.field_provenance->>'native_sku_id'
    WHERE s.batch_id=$1::uuid AND s.entity_type='BARCODE'`, [batchId])).rows;
  requireDomain(barcode.length === 1, "HISTORY_IMPORT_DATABASE_COUNT", "Exactly one independent barcode count required"); actual.barcodes = count(barcode[0]!.n);
  requireDomain(HISTORY_COUNT_KEYS.every(k => actual[k] === metadata.expectedCounts[k]), "HISTORY_IMPORT_COUNT_MISMATCH", "Independent typed-table/barcode observations differ from frozen nine-key expectations; no progress counter is repaired");
  assertHistoryImportReadbackCapabilities(actual);
  await noInvalid(client, "source-provenance", `SELECT 1 AS invalid FROM naijue_erp.import_source_row s WHERE s.batch_id=$1::uuid AND (
    s.raw_fields->>'绑定范围'='PRODUCT' OR s.normalized_fields->>'绑定范围'='PRODUCT'
    OR EXISTS(SELECT 1 FROM jsonb_each(s.raw_fields) r WHERE (s.field_provenance->'fields'->r.key->'raw') IS DISTINCT FROM r.value)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row x WHERE x.batch_id=s.batch_id AND x.entity_type=s.entity_type AND x.source_key=s.source_key AND x.id<>s.id)) LIMIT 1`, batchId);
  const entities = (await client.query(`/* history-lifecycle:source-entities */ SELECT DISTINCT entity_type FROM naijue_erp.import_source_row WHERE batch_id=$1::uuid ORDER BY entity_type`, [batchId])).rows.map(r => String(r.entity_type));
  const known = new Set(["PRODUCT","SKU","BARCODE","INVENTORY_BASELINE","SALES_HEADER","TRANSFER_HEADER","TRANSFER_LINE",
    "HALL","CUSTOMER","STAFF","WAREHOUSE","SUPPLIER","CATEGORY","COLOR","FIT","SIZE","SIZE_GROUP","SEASON","SIZE_GROUP_MEMBER"]);
  requireDomain(entities.every(e => known.has(e)), "HISTORY_IMPORT_SOURCE_CAPABILITY_MISSING", "An actual source entity has no implemented typed field/binding read-back; raw-only SALES_LINE/SETTLEMENT/payment sources cannot publish");
  for (const [entity, table] of [["SALES_HEADER","history_sales_header"],["TRANSFER_HEADER","history_transfer_header"],["TRANSFER_LINE","history_transfer_line"],["SKU","import_sku_alias"],["INVENTORY_BASELINE","import_stock_contributor"]]) {
    await noInvalid(client, `source-coverage-${entity}`, `SELECT 1 AS invalid FROM naijue_erp.import_source_row s WHERE s.batch_id=$1::uuid AND s.entity_type=${quote(entity!)}
      AND NOT EXISTS(SELECT 1 FROM naijue_erp.${table} t WHERE t.batch_id=s.batch_id AND t.source_row_id=s.id) LIMIT 1`, batchId);
  }
  for (const [entity, table] of [["SALES_HEADER","history_sales_header"],["TRANSFER_HEADER","history_transfer_header"]] as const) {
    if (!actual[table]) continue;
    requireDomain(schemaVersions.includes(12), "HISTORY_IMPORT_HEADER_BINDINGS_NOT_READY", "Typed header native source bindings require reviewed schema12 or a reviewed extension");
    await noInvalid(client, `fields-${entity}`, `SELECT 1 AS invalid FROM naijue_erp.${table} h LEFT JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id
      WHERE h.batch_id=$1::uuid AND (s.entity_type=${quote(entity)} AND ${headerConditions(entity === "SALES_HEADER")}) IS DISTINCT FROM TRUE LIMIT 1`, batchId);
    await headerBindings(client, batchId, entity === "SALES_HEADER");
  }
  const transferColumns=IMPORT_V2_TABLES.find(t=>t.entity==="TRANSFER_LINE")!.columns.map(c=>quote(c.name)).join(",");
  await noInvalid(client, "transfer-line-fields", `SELECT 1 AS invalid FROM naijue_erp.history_transfer_line l
    LEFT JOIN naijue_erp.import_source_row s ON s.batch_id=l.batch_id AND s.id=l.source_row_id
    LEFT JOIN naijue_erp.history_transfer_header h ON h.batch_id=l.batch_id AND h.id=l.header_id
    LEFT JOIN naijue_erp.import_source_row hs ON hs.batch_id=h.batch_id AND hs.id=h.source_row_id
    WHERE l.batch_id=$1::uuid AND (s.entity_type='TRANSFER_LINE' AND s.field_provenance->'history_staging'->>'validator_version'='V3_TRANSFER_LINE_STAGE_1'
      AND s.normalized_fields ?& ARRAY[${transferColumns}] AND s.normalized_fields-ARRAY[${transferColumns}]='{}'::jsonb
      AND NOT EXISTS(SELECT 1 FROM jsonb_each(s.normalized_fields) f WHERE jsonb_typeof(f.value) IS DISTINCT FROM 'string')
      AND NOT EXISTS(SELECT 1 FROM jsonb_each(s.normalized_fields) f WHERE f.key<>'SKU来源编号' AND s.raw_fields->f.key IS DISTINCT FROM f.value)
      AND s.raw_fields->>'来源编号'=s.source_key AND s.normalized_fields->>'来源编号'=s.source_key
      AND ${N("原行号")} ~ '^[1-9][0-9]*$' AND l.line_no=${N("原行号")}::integer
      AND l.quantity::text=${N("原数量")} AND s.raw_fields->'原数量'=s.normalized_fields->'原数量'
      AND hs.entity_type='TRANSFER_HEADER' AND hs.source_key=${N("单据来源编号")}
      AND EXISTS(SELECT 1 FROM naijue_erp.import_sku_alias a WHERE a.batch_id=l.batch_id AND a.canonical_sku_id=l.sku_id
        AND a.canonical_source_key=${N("SKU来源编号")} AND a.old_source_sku_id=s.raw_fields->>'SKU来源编号')
      AND ${[["product_code_snapshot","原款号"],["product_name_snapshot","原品名"],["color_name_snapshot","原颜色名称"],["fit_name_snapshot","原版型名称"],["size_name_snapshot","原完整尺码"],["barcode_snapshot","原使用条码"]].map(([col,f])=>`l.${col} IS NOT DISTINCT FROM NULLIF(${N(f!)},'')`).join(" AND ")}) IS DISTINCT FROM TRUE LIMIT 1`, batchId);
  await noInvalid(client, "transfer-document-lines", `SELECT 1 AS invalid FROM naijue_erp.history_transfer_header h
    WHERE h.batch_id=$1::uuid AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_transfer_line l
      WHERE l.batch_id=h.batch_id AND l.header_id=h.id) LIMIT 1`, batchId);
  await noInvalid(client, "sku-alias-lineage", `SELECT 1 AS invalid FROM naijue_erp.import_sku_alias a
    LEFT JOIN naijue_erp.import_source_row s ON s.batch_id=a.batch_id AND s.id=a.source_row_id LEFT JOIN naijue_erp.sku k ON k.id=a.canonical_sku_id
    WHERE a.batch_id=$1::uuid AND (s.entity_type='SKU' AND s.source_key=a.old_source_sku_id AND s.raw_fields->>'来源编号'=a.old_source_sku_id
      AND length(btrim(a.mapping_basis))>0 AND k.id IS NOT NULL
      AND EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=a.batch_id AND r.source_entity_type='SKU' AND r.source_key=a.canonical_source_key AND r.target_type='SKU' AND r.target_id=k.id AND r.status='IMPORTED')
      AND (NOT s.field_provenance ? 'native_sku_id' OR s.field_provenance->>'native_sku_id'=k.id::text)
      AND (NOT s.field_provenance ? 'native_sku_import' OR (s.field_provenance->'native_sku_import'->>'validator_version'='NATIVE_SKU_IMPORT_V1'
        AND s.field_provenance->'native_sku_import'->'native_sku'=to_jsonb(k)
        AND s.field_provenance->'native_sku_import'->>'native_sku_id'=k.id::text
        AND s.field_provenance->'native_sku_import'->>'canonical_source_key'=a.canonical_source_key
        AND s.field_provenance->'native_sku_import'->'mapping'->>'oldSourceSkuId'=a.old_source_sku_id
        AND s.field_provenance->'native_sku_import'->'mapping'->>'canonicalSourceSkuId'=a.canonical_source_key
        AND s.field_provenance->'native_sku_import'->'mapping'->>'mappingBasis'=a.mapping_basis))
      AND EXISTS(SELECT 1 FROM naijue_erp.import_source_row p WHERE p.batch_id=a.batch_id AND p.entity_type='PRODUCT'
        AND p.source_key=${N("商品来源编号")} AND p.field_provenance->>'native_product_id'=k.product_id::text)) IS DISTINCT FROM TRUE LIMIT 1`, batchId);
  await noInvalid(client, "product-proof-required", `SELECT 1 AS invalid FROM naijue_erp.import_source_row s WHERE s.batch_id=$1::uuid AND s.entity_type='PRODUCT'
    AND (s.field_provenance ? 'native_product_id' AND s.field_provenance ? 'product_input_proof') IS DISTINCT FROM TRUE LIMIT 1`, batchId);
  await noInvalid(client, "product-fields", `SELECT 1 AS invalid FROM naijue_erp.import_source_row s LEFT JOIN naijue_erp.product p
    ON p.id::text=s.field_provenance->>'native_product_id' WHERE s.batch_id=$1::uuid AND s.entity_type='PRODUCT' AND (
      p.id IS NOT NULL AND s.raw_fields->>'来源编号'=s.source_key AND ${N("来源编号")}=s.source_key
      AND s.raw_fields->>'款号'=p.product_code AND ${N("款号")}=p.product_code
      AND s.raw_fields->>'商品名称'=p.name AND ${N("商品名称")}=p.name
      AND (NOT (s.field_provenance->'fields') ? 'native_product_import' OR (
        s.field_provenance->'fields'->'native_product_import'->>'validator_version'='NATIVE_PRODUCT_IMPORT_V1'
        AND to_jsonb(jsonb_populate_record(NULL::naijue_erp.product,s.field_provenance->'fields'->'native_product_import'->'native_product'))=to_jsonb(p)))) IS DISTINCT FROM TRUE LIMIT 1`, batchId);
  await client.query("/* history-lifecycle:product-prices */ SELECT naijue_erp.validate_history_product_proofs($1::uuid)", [batchId]);
  // Modern creators persist exact current dependencies separately from raw cells.
  // This is publication reconciliation, not operation replay: drift is rejected,
  // never silently repaired or treated as a grant to update/adopt native rows.
  const productRefs="s.field_provenance->'fields'->'native_product_import'->'references'";
  await noInvalid(client,"modern-reference-shapes",`SELECT 1 AS invalid FROM naijue_erp.import_source_row s WHERE s.batch_id=$1::uuid AND (
    ((s.field_provenance->'fields') ? 'native_product_import' AND (s.entity_type='PRODUCT' AND jsonb_typeof(${productRefs})='object'
      AND (${productRefs}) ?& ARRAY['category','sizeGroup','season','supplier'] AND (${productRefs})-ARRAY['category','sizeGroup','season','supplier']='{}'::jsonb
      AND jsonb_typeof((${productRefs})->'category')='object' AND jsonb_typeof((${productRefs})->'sizeGroup')='object'
      AND (((${productRefs})->'season')='null'::jsonb OR jsonb_typeof((${productRefs})->'season')='object')
      AND (((${productRefs})->'supplier')='null'::jsonb OR jsonb_typeof((${productRefs})->'supplier')='object')) IS DISTINCT FROM TRUE)
    OR (s.field_provenance ? 'native_sku_import' AND (s.entity_type='SKU' AND jsonb_typeof(s.field_provenance->'native_sku_import'->'references')='object'
      AND s.field_provenance->'native_sku_import'->'references' ?& ARRAY['product','color','fit','size','sizeGroup']
      AND (s.field_provenance->'native_sku_import'->'references')-ARRAY['product','color','fit','size','sizeGroup']='{}'::jsonb
      AND NOT EXISTS(SELECT 1 FROM jsonb_each(s.field_provenance->'native_sku_import'->'references') r WHERE
        (jsonb_typeof(r.value)='object' AND r.value ?& ARRAY['sourceKey','nativeId','nativeSnapshot']
          AND jsonb_typeof(r.value->'nativeSnapshot')='object') IS DISTINCT FROM TRUE)) IS DISTINCT FROM TRUE)) LIMIT 1`,batchId);
  await noInvalid(client,"current-reference-product-category",`SELECT 1 AS invalid FROM naijue_erp.import_source_row s
    LEFT JOIN naijue_erp.product p ON p.id::text=s.field_provenance->>'native_product_id'
    WHERE s.batch_id=$1::uuid AND (s.field_provenance->'fields') ? 'native_product_import' AND (
      (${productRefs})->'category'->>'sourceValue'=${N("分类路径")}
      AND jsonb_typeof((${productRefs})->'category'->'path')='array'
      AND jsonb_array_length((${productRefs})->'category'->'path') BETWEEN 1 AND 2
      AND p.category_id::text=(${productRefs})->'category'->'path'-> -1->>'nativeId'
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements((${productRefs})->'category'->'path') WITH ORDINALITY part(value,ordinality)
        LEFT JOIN naijue_erp.product_category n ON n.id::text=part.value->>'nativeId'
        WHERE (n.id IS NOT NULL AND n.name=part.value->>'name' AND n.version=(part.value->>'expectedVersion')::integer
          AND n.parent_id::text IS NOT DISTINCT FROM CASE WHEN part.ordinality=1 THEN NULL
            ELSE (${productRefs})->'category'->'path'->(part.ordinality::integer-2)->>'nativeId' END) IS DISTINCT FROM TRUE)) IS DISTINCT FROM TRUE LIMIT 1`,batchId);
  for(const [key,table,field,column] of [["sizeGroup","size_group","尺码组","size_group_id"],["season","season","季节","season_id"],["supplier","supplier","供应商来源编号","supplier_id"]] as const) {
    await noInvalid(client,`current-reference-product-${key}`,`SELECT 1 AS invalid FROM naijue_erp.import_source_row s
      LEFT JOIN naijue_erp.product p ON p.id::text=s.field_provenance->>'native_product_id'
      LEFT JOIN naijue_erp.${table} n ON n.id::text=(${productRefs})->${quote(key)}->>'nativeId'
      WHERE s.batch_id=$1::uuid AND (s.field_provenance->'fields') ? 'native_product_import' AND (
        p.${column}::text IS NOT DISTINCT FROM (${productRefs})->${quote(key)}->>'nativeId'
        AND (((${productRefs})->${quote(key)}='null'::jsonb AND ${N(field)}='') OR (n.id IS NOT NULL
        AND n.code=(${productRefs})->${quote(key)}->>'code' AND n.name=(${productRefs})->${quote(key)}->>'name'
        AND (${productRefs})->${quote(key)}->>'sourceValue'=${N(field)}
        ${key==="supplier" ? `AND n.version=((${productRefs})->'supplier'->>'expectedVersion')::integer AND n.enabled=((${productRefs})->'supplier'->>'enabled')::boolean` : ""}))) IS DISTINCT FROM TRUE LIMIT 1`,batchId);
  }
  const refs="s.field_provenance->'native_sku_import'->'references'";
  for (const [key,table,nativeColumn] of [["product","product","k.product_id"],["sizeGroup","size_group","p.size_group_id"],["color","color","k.color_id"],["fit","fit","k.fit_id"],["size","size","k.size_id"]] as const) {
      await noInvalid(client, `current-reference-sku-${key}`, `SELECT 1 AS invalid FROM naijue_erp.import_source_row s
        LEFT JOIN naijue_erp.sku k ON k.id::text=s.field_provenance->'native_sku_import'->>'native_sku_id'
        LEFT JOIN naijue_erp.product p ON p.id=k.product_id
        LEFT JOIN naijue_erp.${table} n ON n.id::text=(${refs})->${quote(key)}->>'nativeId'
        WHERE s.batch_id=$1::uuid AND jsonb_typeof((${refs})->${quote(key)})='object'
        AND (n.id IS NOT NULL AND n.id=${nativeColumn} AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys((${refs})->${quote(key)}->'nativeSnapshot') k)
          =(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(to_jsonb(n)) k)
          AND to_jsonb(jsonb_populate_record(NULL::naijue_erp.${table},(${refs})->${quote(key)}->'nativeSnapshot'))=to_jsonb(n)) IS DISTINCT FROM TRUE LIMIT 1`, batchId);
  }
  await noInvalid(client, "barcode-fields", `SELECT 1 AS invalid FROM naijue_erp.import_source_row s LEFT JOIN naijue_erp.sku_barcode bc
      ON bc.barcode=s.field_provenance->>'native_barcode' AND bc.sku_id::text=s.field_provenance->>'native_sku_id'
    WHERE s.batch_id=$1::uuid AND s.entity_type='BARCODE' AND (bc.id IS NOT NULL AND s.raw_fields->>'来源编号'=s.source_key
      AND s.raw_fields->>'绑定范围'='SKU' AND s.normalized_fields->>'绑定范围'='SKU' AND s.raw_fields->>'条码'=bc.barcode AND ${N("条码")}=bc.barcode
      AND EXISTS(SELECT 1 FROM naijue_erp.import_sku_alias a WHERE a.batch_id=s.batch_id AND a.canonical_sku_id=bc.sku_id AND a.canonical_source_key=${N("SKU来源编号")})
      AND (NOT s.normalized_fields ? '条码性质' OR (bc.barcode_kind=CASE ${N("条码性质")} WHEN '主码' THEN 'MAIN' WHEN '已确认旧码' THEN 'CONFIRMED_OLD' END
        AND s.raw_fields->'条码性质'=s.normalized_fields->'条码性质'))
      AND (NOT s.normalized_fields ? '状态' OR (bc.enabled=CASE ${N("状态")} WHEN '正常' THEN true WHEN '停用' THEN false END AND s.raw_fields->'状态'=s.normalized_fields->'状态'))
      AND (NOT s.normalized_fields ? '原条码方案' OR EXISTS(SELECT 1 FROM naijue_erp.barcode_scheme bs WHERE bs.id=bc.scheme_id AND bs.name=${N("原条码方案")}))
      AND (NOT s.field_provenance ? 'native_barcode_import' OR (
        s.field_provenance->'native_barcode_import'->>'validator_version'='NATIVE_BARCODE_IMPORT_V1'
        AND s.field_provenance->'native_barcode_import'->'native_barcode'=to_jsonb(bc)
        AND EXISTS(SELECT 1 FROM naijue_erp.barcode_scheme bs WHERE bs.id=bc.scheme_id
          AND to_jsonb(jsonb_populate_record(NULL::naijue_erp.barcode_scheme,s.field_provenance->'native_barcode_import'->'scheme_snapshot'))=to_jsonb(bs))))) IS DISTINCT FROM TRUE LIMIT 1`, batchId);
  // Existing schema11 stock guards remain authoritative, including no zero ledger
  // invention. A zero-net group with no supported baseline lineage remains blocked.
  await noInvalid(client, "stock-lineage", `SELECT 1 AS invalid FROM naijue_erp.import_stock_contributor c
    LEFT JOIN naijue_erp.import_source_row s ON s.batch_id=c.batch_id AND s.id=c.source_row_id
    LEFT JOIN naijue_erp.import_sku_alias a ON a.batch_id=c.batch_id AND a.old_source_sku_id=c.old_source_sku_id
    LEFT JOIN naijue_erp.inventory_ledger l ON l.id=c.baseline_ledger_id
    WHERE c.batch_id=$1::uuid AND (s.entity_type='INVENTORY_BASELINE' AND s.source_key=s.field_provenance->'stock_contribution'->>'oldStockSourceId'
      AND s.raw_fields->>'来源编号'=s.source_key AND s.raw_fields->>'核准库存数量'=c.signed_quantity::text
      AND s.field_provenance->'stock_contribution'->>'validator_version'='STOCK_CONTRIBUTOR_LINEAGE_V1'
      AND a.canonical_sku_id=c.canonical_sku_id AND a.canonical_source_key=s.field_provenance->'stock_contribution'->>'canonicalSkuSourceId'
      AND c.source_unit=s.field_provenance->'stock_contribution'->>'sourceUnit' AND length(btrim(c.source_unit))>0
      AND l.event_kind='CUTOFF_BASELINE' AND l.source_import_batch_id=c.batch_id AND l.warehouse_id=c.warehouse_id AND l.sku_id=c.canonical_sku_id
      AND EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=c.batch_id AND r.target_type='WAREHOUSE' AND r.target_id=c.warehouse_id AND r.status='IMPORTED' AND r.source_key=s.raw_fields->>'仓库来源编号')
      AND EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=c.batch_id AND r.target_type='INVENTORY_LEDGER' AND r.target_id=l.id AND r.status='IMPORTED' AND r.source_key=c.canonical_stock_source_key)) IS DISTINCT FROM TRUE LIMIT 1`, batchId);
  await noInvalid(client, "stock-sums", `SELECT 1 AS invalid FROM naijue_erp.inventory_ledger l LEFT JOIN (
      SELECT baseline_ledger_id,sum(signed_quantity::numeric) AS total,count(DISTINCT source_unit) AS units FROM naijue_erp.import_stock_contributor WHERE batch_id=$1::uuid GROUP BY baseline_ledger_id
    ) c ON c.baseline_ledger_id=l.id WHERE l.source_import_batch_id=$1::uuid AND l.event_kind='CUTOFF_BASELINE'
      AND (c.total IS DISTINCT FROM l.quantity_delta::numeric OR c.units IS DISTINCT FROM 1::bigint) LIMIT 1`, batchId);
  for (const entity of entities.filter(e => PARTIES.includes(e as typeof PARTIES[number]))) {
    const table=entity.toLowerCase();
    const options:string[]=[];
    if (schemaVersions.includes(12) && ["HALL","CUSTOMER","STAFF"].includes(entity)) options.push(`EXISTS(SELECT 1 FROM naijue_erp.import_header_native_reference e
      JOIN naijue_erp.${table} n ON n.id=e.native_${table}_id WHERE e.batch_id=s.batch_id AND e.source_row_id=s.id
      AND e.entity_type=s.entity_type AND e.source_key=s.source_key AND to_jsonb(jsonb_populate_record(NULL::naijue_erp.${table},e.native_snapshot))=to_jsonb(n))`);
    if (schemaVersions.includes(13)) options.push(`EXISTS(SELECT 1 FROM naijue_erp.native_party_import_evidence e
      JOIN naijue_erp.${table} n ON n.id=e.native_id WHERE e.batch_id=s.batch_id AND e.source_row_id=s.id AND e.entity_type=s.entity_type
      AND e.source_key=s.source_key AND to_jsonb(jsonb_populate_record(NULL::naijue_erp.${table},e.native_snapshot))=to_jsonb(n))`);
    requireDomain(options.length>0, "HISTORY_IMPORT_PARTY_BINDINGS_NOT_READY", "Party source read-back requires its reviewed typed schema12 reference or schema13 creation directory");
    await noInvalid(client, `party-binding-${entity}`, `SELECT 1 AS invalid FROM naijue_erp.import_source_row s WHERE s.batch_id=$1::uuid AND s.entity_type=${quote(entity)}
      AND NOT (${options.join(" OR ")}) LIMIT 1`, batchId);
  }
  for (const entity of entities.filter(e => ["CATEGORY","COLOR","FIT","SIZE","SIZE_GROUP","SEASON","SIZE_GROUP_MEMBER"].includes(e))) {
    requireDomain(schemaVersions.includes(14), "HISTORY_IMPORT_CATALOGUE_BINDINGS_NOT_READY", "Dictionary source read-back requires the reviewed typed schema14 directory");
    await noInvalid(client, `catalogue-binding-${entity}`, `SELECT 1 AS invalid FROM naijue_erp.import_source_row s WHERE s.batch_id=$1::uuid AND s.entity_type=${quote(entity)}
      AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_native_catalogue_binding e WHERE e.batch_id=s.batch_id AND e.source_row_id=s.id AND e.entity_type=s.entity_type AND e.source_key=s.source_key) LIMIT 1`, batchId);
  }
  if (schemaVersions.includes(14)) {
    for (const [entity,table,column] of DICTIONARIES) await noInvalid(client, `catalogue-current-${entity}`, `SELECT 1 AS invalid
      FROM naijue_erp.import_native_catalogue_binding e LEFT JOIN naijue_erp.${table} n ON n.id=e.${column}
      WHERE e.batch_id=$1::uuid AND e.entity_type=${quote(entity)} AND e.native_snapshot IS DISTINCT FROM to_jsonb(n) LIMIT 1`, batchId);
    await noInvalid(client, "catalogue-current-SIZE_GROUP_MEMBER", `SELECT 1 AS invalid FROM naijue_erp.import_native_catalogue_binding e
      LEFT JOIN naijue_erp.size_group_member n ON n.size_group_id=e.member_group_id AND n.size_id=e.member_size_id
      WHERE e.batch_id=$1::uuid AND e.entity_type='SIZE_GROUP_MEMBER' AND e.native_snapshot IS DISTINCT FROM to_jsonb(n) LIMIT 1`, batchId);
  }
  return { actualCounts: actual, authorizedPayloadHash: metadata.payloadHash, sourcePayloadHashRecomputed: false, sqlFieldValidation: HISTORY_IMPORT_READBACK_VERSION };
}
