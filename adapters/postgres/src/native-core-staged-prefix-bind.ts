/** Private v22 import adapter. Expected rows come from the original source authority,
 * never from this database. No SQL/provider registration or independent transaction. */
import type { BindFullSourceCommand } from "../../../packages/application/src/inventory-cutoff-import.ts";
import type { HistoryClosureRow } from "../../../packages/application/src/history-typed-closure.ts";
import { encodeHistoryClosureValue, hashHistoryClosureRows, historyClosureProjectionRow26, historyClosureRowHash } from "../../../packages/application/src/history-typed-closure.ts";
import { requestHash } from "../../../packages/application/src/request-hash.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import type { PgSalesClient } from "./sales-unit-of-work.ts";

export const CORE_STAGED_PREFIX_VERSION22 = "CORE_STAGED_PREFIX_BIND_V22" as const;
export const CORE_PREFIX_GROUPS22 = ["HEADERS", "TRANSFER_LINES", "PRODUCTS", "SKUS", "STOCK_CONTRIBUTORS"] as const;
export type CorePrefixGroup22 = typeof CORE_PREFIX_GROUPS22[number];
export interface CoreStagedPrefixExpected22 {
 readonly version: typeof CORE_STAGED_PREFIX_VERSION22;
 readonly binding: { readonly batchId: string; readonly actorAccountId: string; readonly fixedSourceNamespace: string;
  readonly cutoffAt: string; readonly selectionSha256: string; readonly commandHash: string };
 readonly preparation: { readonly inputDigest: string; readonly manifestSha256: string };
 readonly groups: readonly { readonly name: CorePrefixGroup22; readonly sourceRows: () => AsyncIterable<HistoryClosureRow>;
  readonly typedRows: () => AsyncIterable<HistoryClosureRow> }[];
 readonly schemes: readonly Record<string, unknown>[];
 readonly skuRecords: () => AsyncIterable<HistoryClosureRow>;
 readonly schemeInitialization: { readonly operationId: string; readonly requestKey: string; readonly requestHash: string;
  readonly approvalPins: { readonly proposalSha256: string; readonly approvalSha256: string; readonly writeContractReplySha256: string } };
}
export interface CoreStagedPrefixBinding22 {
 capture(command: BindFullSourceCommand): Promise<CoreStagedPrefixExpected22>;
}
export interface CoreStagedPrefixProof22 {
 readonly version: typeof CORE_STAGED_PREFIX_VERSION22;
 readonly binding: CoreStagedPrefixExpected22["binding"];
 readonly preparation: CoreStagedPrefixExpected22["preparation"];
 readonly schemeInitialization: CoreStagedPrefixExpected22["schemeInitialization"];
 readonly skuRecords: { readonly rows: number; readonly sha256: string };
 readonly groups: readonly { readonly name: CorePrefixGroup22 | "SCHEMES";
  readonly source: { readonly rows: number; readonly sha256: string }; readonly typed: { readonly rows: number; readonly sha256: string } }[];
}
const must = (ok: unknown, detail: string): void => requireDomain(ok, "CORE_STAGED_PREFIX_MISMATCH", detail);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
function own(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
 must(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
  && Reflect.ownKeys(value).length === keys.length && keys.every(k => {
   const d = Object.getOwnPropertyDescriptor(value, k); return d?.enumerable && Object.hasOwn(d, "value");
  }), "Exact own-data private prefix fields required");
}
export function captureCoreStagedPrefixBinding22(value: CoreStagedPrefixBinding22 | undefined): CoreStagedPrefixBinding22 | undefined {
 if (value === undefined) return undefined;
 own(value, ["capture"]); must(typeof value.capture === "function", "Explicit source-owned capture method required");
 return Object.freeze({ capture: value.capture.bind(value) });
}
const typedRelations: Readonly<Record<CorePrefixGroup22, readonly string[]>> = {
 HEADERS: ["history_sales_header", "history_transfer_header"], TRANSFER_LINES: ["history_transfer_line"],
 PRODUCTS: ["product"], SKUS: ["import_sku_alias", "sku"], STOCK_CONTRIBUTORS: ["import_stock_contributor"]
};
const sourceEntities: Readonly<Record<CorePrefixGroup22, readonly string[]>> = {
 HEADERS: ["SALES_HEADER", "TRANSFER_HEADER"], TRANSFER_LINES: ["TRANSFER_LINE"], PRODUCTS: ["PRODUCT"],
 SKUS: ["SKU"], STOCK_CONTRIBUTORS: ["INVENTORY_BASELINE"]
};
export const corePrefixScope22 = (group: CorePrefixGroup22 | "SCHEMES" | "SKU_RECORDS", segment: "source" | "typed"): string => `${CORE_STAGED_PREFIX_VERSION22}:${group}:${segment}`;
const recordColumns = ["id", "import_batch_id", "source_entity_type", "source_key", "source_record_hash", "source_file_ref", "target_type", "target_id", "status", "decision_reason", "reviewed_at"] as const;
function project(relation: string, value: unknown): HistoryClosureRow {
 if (relation !== "import_record") return historyClosureProjectionRow26(relation, value);
 own(value, recordColumns); encodeHistoryClosureValue(value);
 must(recordColumns.every(k => typeof value[k] === "string") && value.source_entity_type === "SKU" && value.target_type === "SKU" && value.status === "IMPORTED",
  "Complete original SKU record required");
 const stamp = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/.exec(value.reviewed_at as string);
 must(stamp !== null && Number.isFinite(Date.parse(value.reviewed_at as string)), "Original SKU review UTC time required");
 return { relation, key: value.id as string, projection: { ...value, reviewed_at: `${stamp![1]}.${(stamp![2] ?? "").padEnd(6,"0")}Z` } };
}
// Exact original SQL projection expressions, expanded here to avoid adding
// EXECUTE privileges for private projection helpers. Same approved row codec.
const projectionExpressions22: Readonly<Record<string,string>> = {
 "import_source_row": "jsonb_build_object('id',to_jsonb(t)->'id','batch_id',to_jsonb(t)->'batch_id','entity_type',to_jsonb(t)->'entity_type','source_key',to_jsonb(t)->'source_key','file_ref',to_jsonb(t)->'file_ref','sheet',to_jsonb(t)->'sheet','row_no',to_jsonb((to_jsonb(t)->>'row_no')::bigint::text),'source_file_sha256',to_jsonb(t)->'source_file_sha256','row_sha256',to_jsonb(t)->'row_sha256','raw_fields',to_jsonb(t)->'raw_fields','normalized_fields',to_jsonb(t)->'normalized_fields','field_provenance',to_jsonb(t)->'field_provenance')",
 "history_sales_header": "jsonb_build_object('id',to_jsonb(t)->'id','source_row_id',to_jsonb(t)->'source_row_id','batch_id',to_jsonb(t)->'batch_id','version',to_jsonb(t)->'version','number',to_jsonb(t)->'number','business_date',to_jsonb(to_char((to_jsonb(t)->>'business_date')::date,'YYYY-MM-DD')),'source_status',to_jsonb(t)->'source_status','note',to_jsonb(t)->'note','created_by_source_key',to_jsonb(t)->'created_by_source_key','approved_by_source_key',to_jsonb(t)->'approved_by_source_key','created_hall_id',to_jsonb(t)->'created_hall_id','created_hall_provenance',to_jsonb(t)->'created_hall_provenance','created_hall_reason',to_jsonb(t)->'created_hall_reason','created_local_at',to_jsonb(to_char((to_jsonb(t)->>'created_local_at')::timestamp,'YYYY-MM-DD\"T\"HH24:MI:SS.US')),'updated_local_at',to_jsonb(to_char((to_jsonb(t)->>'updated_local_at')::timestamp,'YYYY-MM-DD\"T\"HH24:MI:SS.US')),'approved_local_at',to_jsonb(to_char((to_jsonb(t)->>'approved_local_at')::timestamp,'YYYY-MM-DD\"T\"HH24:MI:SS.US')),'created_instant',to_jsonb(to_char((to_jsonb(t)->>'created_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')),'updated_instant',to_jsonb(to_char((to_jsonb(t)->>'updated_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')),'approved_instant',to_jsonb(to_char((to_jsonb(t)->>'approved_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')),'business_type',to_jsonb(t)->'business_type','hall_id',to_jsonb(t)->'hall_id','customer_id',to_jsonb(t)->'customer_id','warehouse_id',to_jsonb(t)->'warehouse_id','salesperson_id',to_jsonb(t)->'salesperson_id','gross_amount',to_jsonb((to_jsonb(t)->>'gross_amount')::numeric(18,2)::text),'order_discount',to_jsonb((to_jsonb(t)->>'order_discount')::numeric(18,2)::text),'net_due',to_jsonb((to_jsonb(t)->>'net_due')::numeric(18,2)::text))",
 "history_transfer_header": "jsonb_build_object('id',to_jsonb(t)->'id','source_row_id',to_jsonb(t)->'source_row_id','batch_id',to_jsonb(t)->'batch_id','version',to_jsonb(t)->'version','number',to_jsonb(t)->'number','business_date',to_jsonb(to_char((to_jsonb(t)->>'business_date')::date,'YYYY-MM-DD')),'source_status',to_jsonb(t)->'source_status','note',to_jsonb(t)->'note','created_by_source_key',to_jsonb(t)->'created_by_source_key','approved_by_source_key',to_jsonb(t)->'approved_by_source_key','created_hall_id',to_jsonb(t)->'created_hall_id','created_hall_provenance',to_jsonb(t)->'created_hall_provenance','created_hall_reason',to_jsonb(t)->'created_hall_reason','created_local_at',to_jsonb(to_char((to_jsonb(t)->>'created_local_at')::timestamp,'YYYY-MM-DD\"T\"HH24:MI:SS.US')),'updated_local_at',to_jsonb(to_char((to_jsonb(t)->>'updated_local_at')::timestamp,'YYYY-MM-DD\"T\"HH24:MI:SS.US')),'approved_local_at',to_jsonb(to_char((to_jsonb(t)->>'approved_local_at')::timestamp,'YYYY-MM-DD\"T\"HH24:MI:SS.US')),'created_instant',to_jsonb(to_char((to_jsonb(t)->>'created_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')),'updated_instant',to_jsonb(to_char((to_jsonb(t)->>'updated_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')),'approved_instant',to_jsonb(to_char((to_jsonb(t)->>'approved_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')),'from_warehouse_id',to_jsonb(t)->'from_warehouse_id','to_warehouse_id',to_jsonb(t)->'to_warehouse_id','created_role_source',to_jsonb(t)->'created_role_source')",
 "history_transfer_line": "jsonb_build_object('id',to_jsonb(t)->'id','source_row_id',to_jsonb(t)->'source_row_id','batch_id',to_jsonb(t)->'batch_id','header_id',to_jsonb(t)->'header_id','line_no',to_jsonb(t)->'line_no','sku_id',to_jsonb(t)->'sku_id','quantity',to_jsonb((to_jsonb(t)->>'quantity')::bigint::text),'product_code_snapshot',to_jsonb(t)->'product_code_snapshot','product_name_snapshot',to_jsonb(t)->'product_name_snapshot','color_name_snapshot',to_jsonb(t)->'color_name_snapshot','fit_name_snapshot',to_jsonb(t)->'fit_name_snapshot','size_name_snapshot',to_jsonb(t)->'size_name_snapshot','barcode_snapshot',to_jsonb(t)->'barcode_snapshot')",
 "product": "jsonb_build_object('id',to_jsonb(t)->'id','product_code',to_jsonb(t)->'product_code','name',to_jsonb(t)->'name','category_id',to_jsonb(t)->'category_id','supplier_id',to_jsonb(t)->'supplier_id','season_id',to_jsonb(t)->'season_id','size_group_id',to_jsonb(t)->'size_group_id','retail_price',to_jsonb((to_jsonb(t)->>'retail_price')::numeric(18,2)::text),'enabled',to_jsonb(t)->'enabled','version',to_jsonb(t)->'version','year',to_jsonb(t)->'year','system_item_code',to_jsonb(t)->'system_item_code','thickness',to_jsonb(t)->'thickness','collar_pants_type',to_jsonb(t)->'collar_pants_type','purchase_price',to_jsonb((to_jsonb(t)->>'purchase_price')::numeric(18,2)::text),'wholesale5_price',to_jsonb((to_jsonb(t)->>'wholesale5_price')::numeric(18,2)::text),'wholesale6_price',to_jsonb((to_jsonb(t)->>'wholesale6_price')::numeric(18,2)::text),'wholesale7_price',to_jsonb((to_jsonb(t)->>'wholesale7_price')::numeric(18,2)::text),'wholesale8_price',to_jsonb((to_jsonb(t)->>'wholesale8_price')::numeric(18,2)::text),'wholesale9_price',to_jsonb((to_jsonb(t)->>'wholesale9_price')::numeric(18,2)::text),'wholesale10_price',to_jsonb((to_jsonb(t)->>'wholesale10_price')::numeric(18,2)::text),'minimum_price',to_jsonb((to_jsonb(t)->>'minimum_price')::numeric(18,2)::text),'season_ids',to_jsonb(t)->'season_ids','deleted_at',to_jsonb(to_char((to_jsonb(t)->>'deleted_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')),'default_barcode_scheme_id',to_jsonb(t)->'default_barcode_scheme_id')",
 "sku": "jsonb_build_object('id',to_jsonb(t)->'id','product_id',to_jsonb(t)->'product_id','color_id',to_jsonb(t)->'color_id','fit_id',to_jsonb(t)->'fit_id','size_id',to_jsonb(t)->'size_id','sku_code',to_jsonb(t)->'sku_code','enabled',to_jsonb(t)->'enabled','version',to_jsonb(t)->'version','created_operation_id',to_jsonb(t)->'created_operation_id')",
 "import_sku_alias": "jsonb_build_object('batch_id',to_jsonb(t)->'batch_id','old_source_sku_id',to_jsonb(t)->'old_source_sku_id','canonical_sku_id',to_jsonb(t)->'canonical_sku_id','source_row_id',to_jsonb(t)->'source_row_id','canonical_source_key',to_jsonb(t)->'canonical_source_key','mapping_basis',to_jsonb(t)->'mapping_basis')",
 "import_stock_contributor": "jsonb_build_object('batch_id',to_jsonb(t)->'batch_id','source_row_id',to_jsonb(t)->'source_row_id','warehouse_id',to_jsonb(t)->'warehouse_id','canonical_sku_id',to_jsonb(t)->'canonical_sku_id','old_source_sku_id',to_jsonb(t)->'old_source_sku_id','canonical_stock_source_key',to_jsonb(t)->'canonical_stock_source_key','source_unit',to_jsonb(t)->'source_unit','signed_quantity',to_jsonb((to_jsonb(t)->>'signed_quantity')::bigint::text),'baseline_ledger_id',to_jsonb(t)->'baseline_ledger_id')",
 "barcode_scheme": "jsonb_build_object('id',to_jsonb(t)->'id','name',to_jsonb(t)->'name','barcode_type',to_jsonb(t)->'barcode_type','rule_description',to_jsonb(t)->'rule_description','code_length',to_jsonb(t)->'code_length','rule_version',to_jsonb(t)->'rule_version','status',to_jsonb(t)->'status')",
 "import_record": "to_jsonb(t) || jsonb_build_object('reviewed_at',to_char(t.reviewed_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'))"
};
function projectionSql(relation: string): string { return projectionExpressions22[relation]!; }
function rowJoin(relation: string): string {
 if (relation === "import_sku_alias") return "t.batch_id=(e->'projection'->>'batch_id')::uuid AND t.old_source_sku_id=e->'projection'->>'old_source_sku_id'";
 if (relation === "import_stock_contributor") return "t.batch_id=(e->'projection'->>'batch_id')::uuid AND t.source_row_id=(e->'projection'->>'source_row_id')::uuid";
 return "t.id=(e->'projection'->>'id')::uuid";
}
async function verifyBatch(client: PgSalesClient, relation: string, rows: readonly HistoryClosureRow[]): Promise<void> {
 // Relation is selected only from the finite group/segment lists below. Expected
 // full projections are values, not query text. Indexed original primary keys.
 const identity = relation === "import_sku_alias" ? "old_source_sku_id" : relation === "import_stock_contributor" ? "source_row_id" : "id";
 const result = await client.query(`/* core-prefix22:members:${relation} */ SELECT e->>'key' AS key,t.${identity} IS NOT NULL AS present,
  ${projectionSql(relation)} AS projection FROM jsonb_array_elements($1::jsonb) e
  LEFT JOIN naijue_erp.${relation} t ON ${rowJoin(relation)}`, [JSON.stringify(rows)]);
 must(result.rows.length === rows.length, "Every expected prefix member must match one actual row");
 const expected = new Map(rows.map(r => [r.key, r]));
 for (const actual of result.rows) {
  must(typeof actual.key === "string" && actual.present === true && expected.has(actual.key), "Missing or duplicate actual prefix member");
  const row = project(relation, actual.projection);
  must(row.key === actual.key && historyClosureRowHash(row) === historyClosureRowHash(expected.get(actual.key as string)!),
   "Actual complete prefix projection differs from approved source");
  expected.delete(actual.key as string);
 }
 must(expected.size === 0, "All approved prefix members required");
}
async function verifyStream(client: PgSalesClient, group: CorePrefixGroup22 | "SCHEMES" | "SKU_RECORDS", segment: "source" | "typed",
 rows: AsyncIterable<HistoryClosureRow>, batchId: string): Promise<{ rows: number; sha256: string }> {
 const allowed = segment === "source" ? ["import_source_row"] : group === "SCHEMES" ? ["barcode_scheme"] : group === "SKU_RECORDS" ? ["import_record"] : typedRelations[group];
 async function* verified(): AsyncGenerator<HistoryClosureRow> {
  let pending: HistoryClosureRow[] = [], bytes = 0, relation: string | undefined;
  for await (const original of rows) {
   own(original, ["relation", "key", "projection"]);
   must(typeof original.relation === "string" && allowed.includes(original.relation), "Wrong prefix stream relation");
   const row = project(original.relation, original.projection);
   must(original.key === row.key, "Original canonical prefix row key required");
   // Validate every nested field before detaching the source-owned mutable row.
   const size = encodeHistoryClosureValue(row.projection).length;
   must(size <= 4 * 1024 * 1024, "Original bounded prefix row required");
   const captured = structuredClone(row), p = captured.projection as Record<string, unknown>;
   if (segment === "source" || ["history_sales_header", "history_transfer_header", "history_transfer_line", "import_sku_alias", "import_stock_contributor"].includes(row.relation))
    must(p.batch_id === batchId, "No foreign batch prefix member");
   if (row.relation === "import_record") must(p.import_batch_id === batchId, "No foreign SKU source record");
   if (segment === "source") must(group !== "SCHEMES" && group !== "SKU_RECORDS" && sourceEntities[group].includes(p.entity_type as string), "Wrong source group entity");
   if (pending.length && (row.relation !== relation || pending.length === 128 || bytes + size > 4 * 1024 * 1024)) {
    await verifyBatch(client, relation!, pending); for (const r of pending) yield r; pending = []; bytes = 0;
   }
   relation = row.relation; pending.push(captured); bytes += size;
  }
  if (pending.length) { await verifyBatch(client, relation!, pending); yield* pending; }
 }
 return hashHistoryClosureRows(corePrefixScope22(group, segment), verified());
}
export async function verifyCoreStagedPrefix22(client: PgSalesClient, command: BindFullSourceCommand,
 batch: { source_name: unknown; source_hash: unknown; cutoff_at: unknown }, authority: CoreStagedPrefixBinding22): Promise<CoreStagedPrefixProof22> {
 const e = await authority.capture(structuredClone(command));
 own(e, ["version", "binding", "preparation", "groups", "schemes", "schemeInitialization", "skuRecords"]);
 own(e.binding, ["batchId", "actorAccountId", "fixedSourceNamespace", "cutoffAt", "selectionSha256", "commandHash"]);
 own(e.preparation, ["inputDigest", "manifestSha256"]);
 own(e.schemeInitialization, ["operationId", "requestKey", "requestHash", "approvalPins"]);
 own(e.schemeInitialization.approvalPins, ["proposalSha256", "approvalSha256", "writeContractReplySha256"]);
 must(e.version === CORE_STAGED_PREFIX_VERSION22 && e.binding.batchId === command.batchId && e.binding.actorAccountId === command.actorAccountId
  && e.binding.commandHash === requestHash(command) && e.binding.fixedSourceNamespace === batch.source_name && e.binding.selectionSha256 === batch.source_hash
  && hash(e.binding.selectionSha256) && typeof e.binding.fixedSourceNamespace === "string" && e.binding.fixedSourceNamespace.length > 0
  && typeof e.binding.cutoffAt === "string" && Number.isFinite(Date.parse(e.binding.cutoffAt))
  && Date.parse(e.binding.cutoffAt) === Date.parse(String(batch.cutoff_at)) && hash(e.preparation.inputDigest) && hash(e.preparation.manifestSha256)
  && typeof e.schemeInitialization.operationId === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(e.schemeInitialization.operationId)
  && typeof e.schemeInitialization.requestKey === "string" && e.schemeInitialization.requestKey.length > 0
  && hash(e.schemeInitialization.requestHash) && Object.values(e.schemeInitialization.approvalPins).every(hash), "Exact source-approved command, batch and preparation required");
 must(Array.isArray(e.groups) && e.groups.length === 5 && Array.isArray(e.schemes) && e.schemes.length === 6 && typeof e.skuRecords === "function", "Five original source groups, original SKU records and exact six schemes required");
 const binding = structuredClone(e.binding), preparation = structuredClone(e.preparation), initialization = structuredClone(e.schemeInitialization);
 const schemes = e.schemes.map(s => historyClosureProjectionRow26("barcode_scheme", s)).sort((a,b) => Buffer.compare(Buffer.from(a.key),Buffer.from(b.key)));
 const streams = e.groups.map((g,i) => { own(g, ["name", "sourceRows", "typedRows"]);
  must(g.name === CORE_PREFIX_GROUPS22[i] && typeof g.sourceRows === "function" && typeof g.typedRows === "function", "Exact ordered original source streams required");
  return { name:g.name,sourceRows:g.sourceRows.bind(g),typedRows:g.typedRows.bind(g) }; });
 const recordRows = e.skuRecords.bind(e);
 const groups: CoreStagedPrefixProof22["groups"][number][] = [];
 for (let i = 0; i < CORE_PREFIX_GROUPS22.length; i++) {
  const g = streams[i]!;
  const source = await verifyStream(client, g.name, "source", g.sourceRows(), command.batchId);
  const typed = await verifyStream(client, g.name, "typed", g.typedRows(), command.batchId);
  must(source.rows > 0 && typed.rows > 0, "No missing approved prefix group"); groups.push({ name: g.name, source, typed });
 }
 const skuRecords = await verifyStream(client, "SKU_RECORDS", "typed", recordRows(), command.batchId);
 must(skuRecords.rows > 0, "Original canonical SKU records required");
 const empty = async function* (): AsyncGenerator<HistoryClosureRow> {};
 const schemeRows = async function* (): AsyncGenerator<HistoryClosureRow> { yield* schemes; };
 groups.push({ name: "SCHEMES", source: await hashHistoryClosureRows(corePrefixScope22("SCHEMES", "source"), empty()),
  typed: await verifyStream(client, "SCHEMES", "typed", schemeRows(), command.batchId) });
 // Under the same cutoff/batch lock: bind original initialization evidence to
 // the independent approved source pins. Full SQL creation check repeats this.
 const receipts = (await client.query(`/* core-prefix22:scheme-receipt */ SELECT r.id,r.actor_account_id,r.request_key,r.request_hash,r.target_id,r.action,r.status,
  a.before_values,a.after_values FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id
  WHERE r.id=$1::uuid AND r.target_type='IMPORT' AND a.object_type='IMPORT' AND a.object_id=r.target_id AND a.action=r.action AND a.actor_account_id=r.actor_account_id`, [initialization.operationId])).rows;
 const r = receipts[0], after = r?.after_values as Record<string, unknown> | undefined;
 const scheme = after?.schemeInitialization as Record<string, unknown> | undefined;
 const originalSchemes = Array.isArray(scheme?.schemes) ? scheme.schemes.map((s: { native: Record<string, unknown> }) => s.native)
  .sort((a,b) => String(a.id).localeCompare(String(b.id))) : undefined;
 must(receipts.length === 1 && r?.id === initialization.operationId && r.actor_account_id === command.actorAccountId && r.target_id === command.batchId
  && r.request_key === initialization.requestKey && r.request_hash === initialization.requestHash && r.action === "IMPORT_INITIALIZE_BARCODE_SCHEMES" && r.status === "COMMITTED"
  && scheme !== undefined && requestHash(scheme.approvalPins) === requestHash(initialization.approvalPins)
  && scheme.fixedSourceNamespace === binding.fixedSourceNamespace && scheme.selectionSha256 === binding.selectionSha256
  && Date.parse(String(scheme.cutoffAt)) === Date.parse(binding.cutoffAt)
  && originalSchemes !== undefined && requestHash(originalSchemes) === requestHash(schemes.map(s => s.projection)),
 "Original committed source-approved six-scheme initialization required");
 return { version: CORE_STAGED_PREFIX_VERSION22, binding, preparation, schemeInitialization: initialization, skuRecords, groups };
}
