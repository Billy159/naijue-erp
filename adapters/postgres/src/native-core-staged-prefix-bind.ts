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
function projectionSql(relation: string): string {
 const base = `naijue_erp.history_closure_projection('${relation}',to_jsonb(t))`;
 if (relation === "product") return `${base} || jsonb_build_object('season_ids',t.season_ids,'deleted_at',to_char(t.deleted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'default_barcode_scheme_id',t.default_barcode_scheme_id)`;
 if (relation === "sku") return `${base} || jsonb_build_object('created_operation_id',t.created_operation_id)`;
 if (relation === "import_record") return `to_jsonb(t) || jsonb_build_object('reviewed_at',to_char(t.reviewed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))`;
 return base;
}
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
  && typeof e.binding.cutoffAt === "string" && Number.isFinite(Date.parse(e.binding.cutoffAt))
  && Date.parse(e.binding.cutoffAt) === Date.parse(String(batch.cutoff_at)) && hash(e.preparation.inputDigest) && hash(e.preparation.manifestSha256)
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
 must(receipts.length === 1 && r?.id === initialization.operationId && r.actor_account_id === command.actorAccountId && r.target_id === command.batchId
  && r.request_key === initialization.requestKey && r.request_hash === initialization.requestHash && r.action === "IMPORT_INITIALIZE_BARCODE_SCHEMES" && r.status === "COMMITTED"
  && scheme !== undefined && requestHash(scheme.approvalPins) === requestHash(initialization.approvalPins)
  && scheme.fixedSourceNamespace === binding.fixedSourceNamespace && scheme.selectionSha256 === binding.selectionSha256
  && Date.parse(String(scheme.cutoffAt)) === Date.parse(binding.cutoffAt)
  && Array.isArray(scheme.schemes) && requestHash(scheme.schemes.map((s: { native: unknown }) => s.native).sort((a: any,b: any) => String(a.id).localeCompare(String(b.id)))) === requestHash(schemes.map(s => s.projection)),
 "Original committed source-approved six-scheme initialization required");
 return { version: CORE_STAGED_PREFIX_VERSION22, binding, preparation, schemeInitialization: initialization, skuRecords, groups };
}
