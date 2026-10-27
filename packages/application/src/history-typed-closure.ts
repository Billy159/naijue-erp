/** Pure versioned closure bytes only. This module grants no STAGE/PUBLISH capability. */
import { createHash } from "node:crypto";
import { requireDomain } from "../../domain/src/errors.ts";
import type { HistoryCounts } from "./history-storage-contract.ts";
import { HISTORY_COUNT_KEYS } from "./history-storage-contract.ts";

export const HISTORY_TYPED_CLOSURE_VERSION = "HISTORY_TYPED_CLOSURE_V1" as const;
export const HISTORY_CLOSURE_SOURCE_ENTITIES = ["HALL", "WAREHOUSE", "STAFF", "CUSTOMER", "SUPPLIER", "CATEGORY", "COLOR", "FIT", "SIZE", "SIZE_GROUP", "SIZE_GROUP_MEMBER", "SEASON", "PRODUCT", "SKU", "BARCODE", "INVENTORY_BASELINE", "PAYMENT_METHOD", "PAYMENT_ACCOUNT", "PAYMENT_ACCOUNT_HALL", "SALES_HEADER", "SALES_LINE", "SETTLEMENT", "TRANSFER_HEADER", "TRANSFER_LINE"] as const;
export type HistoryClosureSourceEntity = typeof HISTORY_CLOSURE_SOURCE_ENTITIES[number];
export interface HistoryTypedClosurePlan {
 readonly version: typeof HISTORY_TYPED_CLOSURE_VERSION;
 readonly selectionSha256: string;
 readonly authorizedPayloadHash: string;
 readonly sourceManifestSha256: string;
 readonly typedManifestSha256: string;
 readonly documentManifestSha256: string;
 readonly expectedCounts: HistoryCounts;
 readonly sourceEntityCounts: Readonly<Record<HistoryClosureSourceEntity, number>>;
 readonly documentCount: number;
}
export interface HistoryDocumentClosure {
 readonly kind: "SALES" | "TRANSFER";
 readonly sourceKey: string;
 readonly headerSourceRowId: string;
 readonly headerId: string;
 readonly headerSourceSha256: string;
 readonly lineCount: number;
 readonly settlementCount: number;
 readonly sourceDocumentSha256: string;
 readonly typedDocumentSha256: string;
}
export interface HistoryTypedClosureStageInput {
 readonly batchId: string;
 readonly fixedSourceNamespace: string;
 readonly plan: HistoryTypedClosurePlan;
 readonly documents: readonly HistoryDocumentClosure[];
}
export interface HistoryClosureRow {
 readonly relation: string;
 readonly key: string;
 /** Exact versioned SQL projection. Money/bigint/time columns are strings, never driver number/Date conversions. */
 readonly projection: unknown;
}
/** This exact STAGE prefix is separate from general native-writer registration.
 * Recognition grants no capability: the full runtime guard check remains mandatory. */
export function assertHistoryTypedClosureSchema(value: unknown): void {
 const valid = Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
  && Object.getOwnPropertyDescriptor(value, "length")?.value === 18 && Reflect.ownKeys(value).length === 19
  && Array.from({ length: 18 }, (_, i) => Object.getOwnPropertyDescriptor(value, String(i)))
   .every((d, i) => d?.enumerable && Object.hasOwn(d, "value") && d.value === i + 1);
 requireDomain(valid, "HISTORY_CLOSURE_SCHEMA_NOT_READY", "Exact finite own-data history closure prefix1–18 required");
}
const MAX_ROW_BYTES = 4 * 1024 * 1024;
const MAX_STREAM_ROWS = 2147483645;
const must = (ok: unknown): void => requireDomain(ok, "INVALID_HISTORY_CLOSURE_ENCODING", "Bounded acyclic own JSON data and exact UTF8/scalar types required");
const validString = (value: string): boolean => {
 if (value.includes("\0")) return false;
 for (const c of value) { const n = c.codePointAt(0)!; if (n >= 0xd800 && n <= 0xdfff) return false; }
 return true;
};
/** n=null,t/f=boolean,i<signed base10>;=safe integer,s<UTF8 bytes>:<bytes>,
 * a<count>:<frames>,o<count>:<key frame,value frame> with UTF8 byte-ordered keys.
 * NULL/absence/empty/string-number distinctions survive PostgreSQL jsonb normalization. */
export function encodeHistoryClosureValue(value: unknown): Buffer {
 const chunks: string[] = [], active = new Set<object>(); let bytes = 0;
 // Each fragment is valid Unicode or an ASCII frame. Keep exact UTF8 byte
 // accounting at every emit; materialize the complete bytes only once.
 const emit = (part: string) => { bytes += Buffer.byteLength(part, "utf8"); must(bytes <= MAX_ROW_BYTES); chunks.push(part); };
 const visit = (v: unknown, depth: number): void => {
  must(depth <= 64);
  if (v === null) { emit("n"); return; }
  if (typeof v === "boolean") { emit(v ? "t" : "f"); return; }
  if (typeof v === "string") { must(v.length <= MAX_ROW_BYTES && validString(v)); const length = Buffer.byteLength(v, "utf8"); must(length <= MAX_ROW_BYTES); emit("s" + length + ":"); emit(v); return; }
  if (typeof v === "number") { must(Number.isSafeInteger(v) && !Object.is(v, -0)); emit("i" + v.toString() + ";"); return; }
  must(typeof v === "object" && v !== null && !active.has(v)); const o = v as object;
  const array = Array.isArray(o); must(Object.getPrototypeOf(o) === (array ? Array.prototype : Object.prototype));
  const keys = Reflect.ownKeys(o), descriptors = new Map<string, PropertyDescriptor>();
  for (const k of keys) { must(typeof k === "string"); const d = Object.getOwnPropertyDescriptor(o, k)!; must(Object.hasOwn(d, "value") && (d.enumerable || array && k === "length")); descriptors.set(k as string, d); }
  active.add(o);
  if (array) {
   const a = o as unknown[]; must(keys.length === a.length + 1 && keys.every(k => k === "length" || typeof k === "string" && /^(0|[1-9]\d*)$/.test(k) && Number(k) < a.length));
   emit("a" + a.length + ":"); for (let i = 0; i < a.length; i++) visit(descriptors.get(String(i))!.value, depth + 1);
  } else {
   const ordered = [...descriptors.keys()].map(key => ({ key, bytes: Buffer.from(key, "utf8") }))
    .sort((a, b) => Buffer.compare(a.bytes, b.bytes));
   emit("o" + ordered.length + ":"); for (const { key } of ordered) { visit(key, depth + 1); visit(descriptors.get(key)!.value, depth + 1); }
  }
  active.delete(o);
 };
 visit(value, 0); return Buffer.from(chunks.join(""), "utf8");
}
function captureRow(value: HistoryClosureRow): HistoryClosureRow {
 must(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
 const keys = Reflect.ownKeys(value); must(keys.length === 3 && ["relation", "key", "projection"].every(k => keys.includes(k)));
 const data: Record<string, unknown> = {};
 for (const k of keys) { must(typeof k === "string"); const d = Object.getOwnPropertyDescriptor(value, k)!; must(d.enumerable && Object.hasOwn(d, "value")); data[k as string] = d.value; }
 must(typeof data.relation === "string" && data.relation.length > 0 && Buffer.byteLength(data.relation, "utf8") <= 65536 && validString(data.relation));
 must(typeof data.key === "string" && data.key.length > 0 && Buffer.byteLength(data.key, "utf8") <= 65536 && validString(data.key));
 return { relation: data.relation as string, key: data.key as string, projection: data.projection };
}
export function historyClosureRowHash(original: HistoryClosureRow): string {
 const row = captureRow(original);
 return createHash("sha256").update(encodeHistoryClosureValue(["HISTORY_CLOSURE_ROW_V1", row.relation, row.key, row.projection])).digest("hex");
}
/** Caller supplies a bounded sorted iterator. No whole-dataset array, string_agg,
 * missing-as-zero rule or caller-provided prehashed row can bypass row coverage. */
class ClosureFold {
 private state: Buffer; private previous: Buffer | undefined; private count = 0;
 private readonly scope: string;
 constructor(scope: string) {
  this.scope = scope;
  must(typeof scope === "string" && scope.length > 0 && Buffer.byteLength(scope, "utf8") <= 65536 && validString(scope));
  this.state = createHash("sha256").update(encodeHistoryClosureValue(["HISTORY_CLOSURE_STREAM_V1", scope])).digest();
 }
 private beginRow(original: HistoryClosureRow): { row: HistoryClosureRow; order: Buffer } {
  const row = captureRow(original), order = Buffer.from(row.relation + "\0" + row.key, "utf8");
  requireDomain(this.previous === undefined || Buffer.compare(this.previous, order) < 0, "INVALID_HISTORY_CLOSURE_ORDER", "Strict byte-ordered unique relation/primary-key rows required");
  must(++this.count <= MAX_STREAM_ROWS); return { row, order };
 }
 private advance(order: Buffer, hash: string): void {
  this.state = createHash("sha256").update(Buffer.concat([Buffer.from([1]), this.state, Buffer.from(hash, "hex")])).digest(); this.previous = order;
 }
 add(original: HistoryClosureRow): string {
  const { row, order } = this.beginRow(original), hash = historyClosureRowHash(row);
  this.advance(order, hash); return hash;
 }
 /** Module-internal only: the builder passes the global fold's just-created
  * digest for the SAME canonical row, synchronously and without mutation.
  * No public API accepts a caller-provided digest or skips row coverage. */
 addSameCanonicalRow(original: HistoryClosureRow, hash: string): void {
  const { order } = this.beginRow(original); this.advance(order, hash);
 }
 finish(): { rows: number; sha256: string } { return { rows: this.count, sha256: createHash("sha256").update(encodeHistoryClosureValue(["HISTORY_CLOSURE_STREAM_FINAL_V1", this.scope, this.count, this.state.toString("hex")])).digest("hex") }; }
}
export async function hashHistoryClosureRows(scope: string, rows: Iterable<HistoryClosureRow> | AsyncIterable<HistoryClosureRow>): Promise<{ rows: number; sha256: string }> {
 const fold = new ClosureFold(scope); for await (const row of rows) fold.add(row); return fold.finish();
}

const stageMust = (ok: unknown): void => requireDomain(ok, "INVALID_HISTORY_CLOSURE_STAGE", "Exact bounded own-data closure plan and complete unique document descriptors required");
const STAGE_MAX_BYTES = 64 * 1024 * 1024;
const STAGE_MAX_DOCUMENTS = 100000;
/** Inspect descriptors before reading values: no getter or clone can precede this boundary. */
function stageObject(value: unknown, expected: readonly string[]): Record<string, unknown> {
 stageMust(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
 const keys = Reflect.ownKeys(value as object); stageMust(keys.length === expected.length && keys.every(k => typeof k === "string" && expected.includes(k)));
 const result: Record<string, unknown> = {};
 for (const k of keys) { const d = Object.getOwnPropertyDescriptor(value, k)!; stageMust(d.enumerable && Object.hasOwn(d, "value")); result[k as string] = d.value; }
 return result;
}
function stageString(value: unknown, maxBytes: number): string {
 stageMust(typeof value === "string" && value.trim().length > 0 && validString(value) && Buffer.byteLength(value, "utf8") <= maxBytes); return value as string;
}
const stageUuid = (value: unknown): string => { stageMust(typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)); return value as string; };
const stageHash = (value: unknown): string => { stageMust(typeof value === "string" && /^[0-9a-f]{64}$/.test(value)); return value as string; };
const stageCount = (value: unknown, positive = false): number => { stageMust(typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= (positive ? 1 : 0) && value <= MAX_STREAM_ROWS); return value as number; };
function stageCounts<K extends string>(value: unknown, keys: readonly K[]): Record<K, number> {
 const data = stageObject(value, keys); return Object.fromEntries(keys.map(k => [k, stageCount(data[k])])) as Record<K, number>;
}
/** Returns a fresh, exact data-only snapshot; input itself is never used after capture. */
export function captureHistoryTypedClosureStageInput(original: unknown): HistoryTypedClosureStageInput {
 const root = stageObject(original, ["batchId", "fixedSourceNamespace", "plan", "documents"]);
 const batchId = stageUuid(root.batchId), fixedSourceNamespace = stageString(root.fixedSourceNamespace, 1024);
 const p = stageObject(root.plan, ["version", "selectionSha256", "authorizedPayloadHash", "sourceManifestSha256", "typedManifestSha256", "documentManifestSha256", "expectedCounts", "sourceEntityCounts", "documentCount"]);
 stageMust(p.version === HISTORY_TYPED_CLOSURE_VERSION);
 const plan: HistoryTypedClosurePlan = { version: HISTORY_TYPED_CLOSURE_VERSION, selectionSha256: stageHash(p.selectionSha256), authorizedPayloadHash: stageHash(p.authorizedPayloadHash), sourceManifestSha256: stageHash(p.sourceManifestSha256), typedManifestSha256: stageHash(p.typedManifestSha256), documentManifestSha256: stageHash(p.documentManifestSha256), expectedCounts: stageCounts(p.expectedCounts, HISTORY_COUNT_KEYS), sourceEntityCounts: stageCounts(p.sourceEntityCounts, HISTORY_CLOSURE_SOURCE_ENTITIES), documentCount: stageCount(p.documentCount) };
 const array = root.documents; stageMust(Array.isArray(array) && Object.getPrototypeOf(array) === Array.prototype);
 const length = Object.getOwnPropertyDescriptor(array, "length")!.value as number;
 stageMust(length <= STAGE_MAX_DOCUMENTS && length === plan.documentCount);
 const keys = Reflect.ownKeys(array as object); stageMust(keys.length === length + 1 && keys.every(k => k === "length" || typeof k === "string" && /^(0|[1-9]\d*)$/.test(k) && Number(k) < length));
 let bytes = encodeHistoryClosureValue({ batchId, fixedSourceNamespace, plan }).byteLength;
 const sourceIds = new Set<string>(), headers = new Set<string>(), sourceKeys = new Set<string>(), documents: HistoryDocumentClosure[] = [];
 let salesHeaders = 0, transferHeaders = 0, salesLines = 0, transferLines = 0, settlements = 0;
 for (let i = 0; i < length; i++) {
  const descriptor = Object.getOwnPropertyDescriptor(array, String(i))!; stageMust(descriptor.enumerable && Object.hasOwn(descriptor, "value"));
  const d = stageObject(descriptor.value, ["kind", "sourceKey", "headerSourceRowId", "headerId", "headerSourceSha256", "lineCount", "settlementCount", "sourceDocumentSha256", "typedDocumentSha256"]);
  stageMust(d.kind === "SALES" || d.kind === "TRANSFER");
  const document: HistoryDocumentClosure = { kind: d.kind as "SALES" | "TRANSFER", sourceKey: stageString(d.sourceKey, 65536), headerSourceRowId: stageUuid(d.headerSourceRowId), headerId: stageUuid(d.headerId), headerSourceSha256: stageHash(d.headerSourceSha256), lineCount: stageCount(d.lineCount, true), settlementCount: stageCount(d.settlementCount), sourceDocumentSha256: stageHash(d.sourceDocumentSha256), typedDocumentSha256: stageHash(d.typedDocumentSha256) };
  const header = document.kind + "/" + document.headerId, key = document.kind + "/" + document.sourceKey;
  stageMust(!sourceIds.has(document.headerSourceRowId) && !headers.has(header) && !sourceKeys.has(key));
  sourceIds.add(document.headerSourceRowId); headers.add(header); sourceKeys.add(key);
  if (document.kind === "SALES") { salesHeaders++; salesLines += document.lineCount; settlements += document.settlementCount; }
  else { stageMust(document.settlementCount === 0); transferHeaders++; transferLines += document.lineCount; }
  bytes += encodeHistoryClosureValue(document).byteLength; stageMust(bytes <= STAGE_MAX_BYTES); documents.push(document);
 }
 const expected = plan.expectedCounts, entities = plan.sourceEntityCounts;
 stageMust(salesHeaders === expected.history_sales_header && transferHeaders === expected.history_transfer_header && salesLines === expected.history_sales_line && transferLines === expected.history_transfer_line && settlements === expected.history_sales_settlement);
 for (const [entity, table] of [["SALES_HEADER", "history_sales_header"], ["SALES_LINE", "history_sales_line"], ["SETTLEMENT", "history_sales_settlement"], ["TRANSFER_HEADER", "history_transfer_header"], ["TRANSFER_LINE", "history_transfer_line"], ["BARCODE", "barcodes"]] as const) stageMust(entities[entity] === expected[table]);
 stageMust(Object.values(entities).reduce((a, b) => a + b, 0) === expected.import_source_row);
 return { batchId, fixedSourceNamespace, plan, documents };
}

interface ExpectedDocumentAllocation { readonly kind: "SALES" | "TRANSFER"; readonly sourceKey: string; readonly headerSourceRowId: string; readonly headerId: string }
interface ExpectedDocumentState {
 allocation: ExpectedDocumentAllocation; source: ClosureFold; typed: ClosureFold; sourceHeaderSha?: string;
 sourceLines: number; sourceSettlements: number; typedHeaders: number; typedLines: number; typedSettlements: number;
}
const expectedMust = (value: unknown): void => requireDomain(value, "INVALID_HISTORY_CLOSURE_EXPECTED", "Complete independently authenticated source/prepared rows, original document membership and exact allocations required; this builder grants no authorization");
/** Pure bounded streaming EXPECTED construction. No SQL/file/environment reads, source approval or grant.
 * Only the external trusted authorizer may call this with independently authenticated complete
 * file selections and original prepared native allocations. Observed SQL rows are not source authority.
 * Complete expected counts are mandatory; a truncated stream cannot establish its own approval. */
export async function buildHistoryTypedClosureExpected(original: unknown): Promise<HistoryTypedClosureStageInput> {
 return buildHistoryTypedClosureExpectedUsing(original, historyClosureProjectionRow);
}
/** Explicit successor prepared-source projection; no runtime or source grant. */
export async function buildHistoryTypedClosureExpected26(original: unknown): Promise<HistoryTypedClosureStageInput> {
 return buildHistoryTypedClosureExpectedUsing(original, historyClosureProjectionRow26);
}
async function buildHistoryTypedClosureExpectedUsing(original: unknown,
 project: (relation: string, value: unknown) => HistoryClosureRow): Promise<HistoryTypedClosureStageInput> {
 const o = stageObject(original, ["batchId", "fixedSourceNamespace", "selectionSha256", "authorizedPayloadHash", "expectedCounts", "expectedSourceEntityCounts", "documents", "sourceRows", "typedRows"]);
 const batchId = stageUuid(o.batchId), fixedSourceNamespace = stageString(o.fixedSourceNamespace, 1024), selectionSha256 = stageHash(o.selectionSha256), authorizedPayloadHash = stageHash(o.authorizedPayloadHash);
 const expectedCounts = stageCounts(o.expectedCounts, HISTORY_COUNT_KEYS), expectedSourceEntityCounts = stageCounts(o.expectedSourceEntityCounts, HISTORY_CLOSURE_SOURCE_ENTITIES);
 expectedMust(Array.isArray(o.documents) && Object.getPrototypeOf(o.documents) === Array.prototype);
 const allocationArray = o.documents as unknown[], length = Object.getOwnPropertyDescriptor(allocationArray, "length")!.value as number;
 expectedMust(length <= STAGE_MAX_DOCUMENTS && Reflect.ownKeys(allocationArray).length === length + 1);
 const byKey = new Map<string, ExpectedDocumentState>(), byId = new Map<string, ExpectedDocumentState>(), sourceHeaderIds = new Set<string>(); let allocationBytes = 0;
 for (let i = 0; i < length; i++) {
  const descriptor = Object.getOwnPropertyDescriptor(allocationArray, String(i)); expectedMust(descriptor?.enumerable && Object.hasOwn(descriptor, "value"));
  const d = stageObject(descriptor!.value, ["kind", "sourceKey", "headerSourceRowId", "headerId"]); expectedMust(d.kind === "SALES" || d.kind === "TRANSFER");
  const allocation: ExpectedDocumentAllocation = { kind: d.kind as "SALES" | "TRANSFER", sourceKey: stageString(d.sourceKey, 65536), headerSourceRowId: stageUuid(d.headerSourceRowId), headerId: stageUuid(d.headerId) };
  const key = allocation.kind + "/" + allocation.sourceKey, nativeKey = allocation.kind + "/" + allocation.headerId, scope = `${batchId}:${allocation.kind}:${allocation.headerId}`;
  expectedMust(!byKey.has(key) && !byId.has(nativeKey) && !sourceHeaderIds.has(allocation.headerSourceRowId));
  allocationBytes += encodeHistoryClosureValue(allocation).byteLength; expectedMust(allocationBytes <= STAGE_MAX_BYTES);
  const state: ExpectedDocumentState = { allocation, source: new ClosureFold("document-source:" + scope), typed: new ClosureFold("document-typed:" + scope), sourceLines: 0, sourceSettlements: 0, typedHeaders: 0, typedLines: 0, typedSettlements: 0 };
  byKey.set(key, state); byId.set(nativeKey, state); sourceHeaderIds.add(allocation.headerSourceRowId);
 }
 const source = new ClosureFold("source:" + batchId), typed = new ClosureFold("typed:" + batchId);
 const sourceEntityCounts = Object.fromEntries(HISTORY_CLOSURE_SOURCE_ENTITIES.map(k => [k, 0])) as Record<HistoryClosureSourceEntity, number>;
 const actualCounts = Object.fromEntries(HISTORY_COUNT_KEYS.map(k => [k, 0])) as HistoryCounts;
 // Only small original identity->document links are retained, never whole source rows.
 // Hard stop before accumulating beyond1M historical identities /256MiB estimate.
 const originalMembership = new Map<string, { entity: string; state: ExpectedDocumentState }>(), typedMembership = new Set<string>(); let identityBytes = 0;
 const canonical = (originalRow: HistoryClosureRow): HistoryClosureRow => {
  const raw = captureRow(originalRow), row = project(raw.relation, raw.projection); expectedMust(row.key === raw.key); return row;
 };
 for await (const originalRow of o.sourceRows as Iterable<HistoryClosureRow> | AsyncIterable<HistoryClosureRow>) {
  const row = canonical(originalRow), p = row.projection as Record<string, unknown>;
  expectedMust(row.relation === "import_source_row" && p.batch_id === batchId && typeof p.entity_type === "string" && HISTORY_CLOSURE_SOURCE_ENTITIES.includes(p.entity_type as HistoryClosureSourceEntity));
  const entity = p.entity_type as HistoryClosureSourceEntity, rowHash = source.add(row); sourceEntityCounts[entity]++; actualCounts.import_source_row++;
  expectedMust(sourceEntityCounts[entity] <= expectedSourceEntityCounts[entity] && actualCounts.import_source_row <= expectedCounts.import_source_row);
  if (entity === "BARCODE") actualCounts.barcodes++;
  if (!["SALES_HEADER", "SALES_LINE", "SETTLEMENT", "TRANSFER_HEADER", "TRANSFER_LINE"].includes(entity)) continue;
  const kind = entity.startsWith("TRANSFER") ? "TRANSFER" : "SALES", header = entity.endsWith("HEADER"), raw = p.raw_fields as Record<string, unknown>, normalized = p.normalized_fields as Record<string, unknown>;
  expectedMust(raw !== null && typeof raw === "object" && normalized !== null && typeof normalized === "object");
  const key = header ? p.source_key : normalized["单据来源编号"];
  expectedMust(typeof key === "string" && (header ? raw["来源编号"] === key && normalized["来源编号"] === key : raw["单据来源编号"] === key));
  const state = byKey.get(kind + "/" + key); expectedMust(state !== undefined);
  const id = stageUuid(p.id); expectedMust(!originalMembership.has(id));
  identityBytes += Buffer.byteLength(id, "utf8") + 160; expectedMust(originalMembership.size < 1000000 && identityBytes <= 256 * 1024 * 1024);
  originalMembership.set(id, { entity, state: state! });
  state!.source.addSameCanonicalRow(row, rowHash);
  if (header) { expectedMust(state!.allocation.headerSourceRowId === id && state!.sourceHeaderSha === undefined); state!.sourceHeaderSha = rowHash; }
  else if (entity === "SETTLEMENT") state!.sourceSettlements++; else state!.sourceLines++;
 }
 expectedMust(HISTORY_CLOSURE_SOURCE_ENTITIES.every(k => sourceEntityCounts[k] === expectedSourceEntityCounts[k]));
 for await (const originalRow of o.typedRows as Iterable<HistoryClosureRow> | AsyncIterable<HistoryClosureRow>) {
  const row = canonical(originalRow), p = row.projection as Record<string, unknown>; expectedMust(row.relation !== "import_source_row" && (!Object.hasOwn(p, "batch_id") || p.batch_id === batchId));
  const rowHash = typed.add(row);
  if (HISTORY_COUNT_KEYS.includes(row.relation as typeof HISTORY_COUNT_KEYS[number])) actualCounts[row.relation as typeof HISTORY_COUNT_KEYS[number]]++;
  if (!["history_sales_header", "history_sales_line", "history_sales_settlement", "history_transfer_header", "history_transfer_line"].includes(row.relation)) continue;
  const member = originalMembership.get(stageUuid(p.source_row_id)), header = row.relation.endsWith("_header"), kind = row.relation.startsWith("history_transfer") ? "TRANSFER" : "SALES";
  const sourceEntity = row.relation === "history_sales_settlement" ? "SETTLEMENT" : row.relation.replace("history_", "").toUpperCase();
  expectedMust(member !== undefined && member.entity === sourceEntity && !typedMembership.has(p.source_row_id as string)); typedMembership.add(p.source_row_id as string);
  const state = byId.get(kind + "/" + (header ? stageUuid(p.id) : stageUuid(p.header_id))); expectedMust(state !== undefined && state === member!.state);
  state!.typed.addSameCanonicalRow(row, rowHash);
  if (header) { expectedMust(state!.allocation.headerSourceRowId === p.source_row_id); state!.typedHeaders++; }
  else if (row.relation === "history_sales_settlement") state!.typedSettlements++; else state!.typedLines++;
 }
 expectedMust(HISTORY_COUNT_KEYS.every(k => actualCounts[k] === expectedCounts[k]) && typedMembership.size === originalMembership.size);
 const documents: HistoryDocumentClosure[] = [...byKey.values()].map(state => {
  expectedMust(state.sourceHeaderSha !== undefined && state.typedHeaders === 1 && state.sourceLines > 0 && state.sourceLines === state.typedLines && state.sourceSettlements === state.typedSettlements);
  return { ...state.allocation, headerSourceSha256: state.sourceHeaderSha!, lineCount: state.sourceLines, settlementCount: state.sourceSettlements, sourceDocumentSha256: state.source.finish().sha256, typedDocumentSha256: state.typed.finish().sha256 };
 });
 const documentRows = documents.map(d => ({ relation: "document_manifest", key: encodeHistoryClosureValue([d.kind, d.headerId]).toString("hex"), projection: d })).sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
 const plan: HistoryTypedClosurePlan = { version: HISTORY_TYPED_CLOSURE_VERSION, selectionSha256, authorizedPayloadHash, sourceManifestSha256: source.finish().sha256, typedManifestSha256: typed.finish().sha256, documentManifestSha256: (await hashHistoryClosureRows("documents:" + batchId, documentRows)).sha256, expectedCounts, sourceEntityCounts, documentCount: documents.length };
 return captureHistoryTypedClosureStageInput({ batchId, fixedSourceNamespace, plan, documents });
}

// Explicit reviewed V2 semantic columns; excluded server metadata is never accepted as source authority.
const HISTORY_PROJECTION_SPEC = [
 {
  "relation": "import_source_row",
  "columns": [
   "id",
   "batch_id",
   "entity_type",
   "source_key",
   "file_ref",
   "sheet",
   "row_no",
   "source_file_sha256",
   "row_sha256",
   "raw_fields",
   "normalized_fields",
   "field_provenance"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "history_sales_header",
  "columns": [
   "id",
   "source_row_id",
   "batch_id",
   "version",
   "number",
   "business_date",
   "source_status",
   "note",
   "created_by_source_key",
   "approved_by_source_key",
   "created_hall_id",
   "created_hall_provenance",
   "created_hall_reason",
   "created_local_at",
   "updated_local_at",
   "approved_local_at",
   "created_instant",
   "updated_instant",
   "approved_instant",
   "business_type",
   "hall_id",
   "customer_id",
   "warehouse_id",
   "salesperson_id",
   "gross_amount",
   "order_discount",
   "net_due"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "history_transfer_header",
  "columns": [
   "id",
   "source_row_id",
   "batch_id",
   "version",
   "number",
   "business_date",
   "source_status",
   "note",
   "created_by_source_key",
   "approved_by_source_key",
   "created_hall_id",
   "created_hall_provenance",
   "created_hall_reason",
   "created_local_at",
   "updated_local_at",
   "approved_local_at",
   "created_instant",
   "updated_instant",
   "approved_instant",
   "from_warehouse_id",
   "to_warehouse_id",
   "created_role_source"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "history_sales_line",
  "columns": [
   "id",
   "source_row_id",
   "batch_id",
   "header_id",
   "line_no",
   "sku_id",
   "quantity",
   "product_code_snapshot",
   "product_name_snapshot",
   "color_name_snapshot",
   "fit_name_snapshot",
   "size_name_snapshot",
   "barcode_snapshot",
   "reference_price",
   "deal_price",
   "line_amount",
   "allocated_discount",
   "is_gift",
   "pricing_method_source",
   "discount_tenths",
   "ordinary_zero_confirmed"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "history_transfer_line",
  "columns": [
   "id",
   "source_row_id",
   "batch_id",
   "header_id",
   "line_no",
   "sku_id",
   "quantity",
   "product_code_snapshot",
   "product_name_snapshot",
   "color_name_snapshot",
   "fit_name_snapshot",
   "size_name_snapshot",
   "barcode_snapshot"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "history_sales_settlement",
  "columns": [
   "id",
   "source_row_id",
   "batch_id",
   "header_id",
   "line_no",
   "payment_account_id",
   "direction",
   "amount",
   "account_name_snapshot",
   "method_name_snapshot",
   "payment_method_id_snapshot"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "import_sku_alias",
  "columns": [
   "batch_id",
   "old_source_sku_id",
   "canonical_sku_id",
   "source_row_id",
   "canonical_source_key",
   "mapping_basis"
  ],
  "keys": [
   "batch_id",
   "old_source_sku_id"
  ]
 },
 {
  "relation": "import_stock_contributor",
  "columns": [
   "batch_id",
   "source_row_id",
   "warehouse_id",
   "canonical_sku_id",
   "old_source_sku_id",
   "canonical_stock_source_key",
   "source_unit",
   "signed_quantity",
   "baseline_ledger_id"
  ],
  "keys": [
   "batch_id",
   "source_row_id"
  ]
 },
 {
  "relation": "import_header_native_reference",
  "columns": [
   "batch_id",
   "entity_type",
   "source_key",
   "source_row_id",
   "native_hall_id",
   "native_customer_id",
   "native_staff_id",
   "native_version",
   "native_snapshot",
   "validator_version"
  ],
  "keys": [
   "batch_id",
   "entity_type",
   "source_key"
  ]
 },
 {
  "relation": "native_party_import_evidence",
  "columns": [
   "batch_id",
   "source_row_id",
   "entity_type",
   "source_key",
   "native_id",
   "native_hall_id",
   "native_customer_id",
   "native_supplier_id",
   "native_staff_id",
   "native_warehouse_id",
   "warehouse_record",
   "native_snapshot",
   "source_snapshot",
   "selection",
   "authorization",
   "row_fingerprint",
   "validator_version"
  ],
  "keys": [
   "source_row_id"
  ]
 },
 {
  "relation": "import_native_catalogue_binding",
  "columns": [
   "batch_id",
   "entity_type",
   "source_key",
   "source_row_id",
   "category_id",
   "color_id",
   "fit_id",
   "size_id",
   "size_group_id",
   "season_id",
   "member_group_id",
   "member_size_id",
   "native_snapshot",
   "evidence_fingerprint",
   "validator_version"
  ],
  "keys": [
   "batch_id",
   "entity_type",
   "source_key"
  ]
 },
 {
  "relation": "import_native_payment_binding",
  "columns": [
   "batch_id",
   "entity_type",
   "source_key",
   "source_row_id",
   "native_payment_method_id",
   "native_payment_account_id",
   "native_hall_id",
   "native_snapshot",
   "evidence_fingerprint",
   "validator_version"
  ],
  "keys": [
   "batch_id",
   "entity_type",
   "source_key"
  ]
 },
 {
  "relation": "product",
  "columns": [
   "id",
   "product_code",
   "name",
   "category_id",
   "supplier_id",
   "season_id",
   "size_group_id",
   "retail_price",
   "enabled",
   "version",
   "year",
   "system_item_code",
   "thickness",
   "collar_pants_type",
   "purchase_price",
   "wholesale5_price",
   "wholesale6_price",
   "wholesale7_price",
   "wholesale8_price",
   "wholesale9_price",
   "wholesale10_price",
   "minimum_price"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "sku",
  "columns": [
   "id",
   "product_id",
   "color_id",
   "fit_id",
   "size_id",
   "sku_code",
   "enabled",
   "version"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "hall",
  "columns": [
   "id",
   "name",
   "default_customer_id",
   "default_sales_warehouse_id",
   "enabled",
   "version"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "warehouse",
  "columns": [
   "id",
   "hall_id",
   "name",
   "enabled",
   "version"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "customer",
  "columns": [
   "id",
   "code",
   "name",
   "enabled",
   "version",
   "created_at",
   "updated_at"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "supplier",
  "columns": [
   "id",
   "code",
   "name",
   "enabled",
   "version",
   "created_at",
   "updated_at"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "staff",
  "columns": [
   "id",
   "name",
   "hall_id",
   "role",
   "contact",
   "employment_status",
   "version"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "product_category",
  "columns": [
   "id",
   "parent_id",
   "name",
   "display_order",
   "version"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "color",
  "columns": [
   "id",
   "code",
   "name",
   "enabled",
   "version"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "fit",
  "columns": [
   "id",
   "code",
   "name",
   "enabled",
   "version"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "size",
  "columns": [
   "id",
   "code",
   "name"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "size_group",
  "columns": [
   "id",
   "code",
   "name"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "size_group_member",
  "columns": [
   "size_group_id",
   "size_id",
   "display_order"
  ],
  "keys": [
   "size_group_id",
   "size_id"
  ]
 },
 {
  "relation": "season",
  "columns": [
   "id",
   "code",
   "name",
   "display_order"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "sku_barcode",
  "columns": [
   "id",
   "barcode",
   "sku_id",
   "barcode_kind",
   "scheme_id",
   "enabled"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "barcode_scheme",
  "columns": [
   "id",
   "name",
   "barcode_type",
   "rule_description",
   "code_length",
   "rule_version",
   "status"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "payment_method_identity",
  "columns": [
   "id"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "payment_account_identity",
  "columns": [
   "id"
  ],
  "keys": [
   "id"
  ]
 },
 {
  "relation": "payment_account_hall",
  "columns": [
   "payment_account_id",
   "hall_id"
  ],
  "keys": [
   "payment_account_id",
   "hall_id"
  ]
 }
] as const;
for (const spec of HISTORY_PROJECTION_SPEC) { Object.freeze(spec.columns); Object.freeze(spec.keys); Object.freeze(spec); }
Object.freeze(HISTORY_PROJECTION_SPEC);
export const historyClosureProjectionSpec = (): typeof HISTORY_PROJECTION_SPEC => HISTORY_PROJECTION_SPEC;
/** Expected-side builder consumes only independently authorized prepared facts, never actual SQL rows. */
export function historyClosureProjectionRow(relation: string, original: unknown): HistoryClosureRow {
 return projectHistoryClosureRow(relation, original, HISTORY_PROJECTION_SPEC);
}
interface ProjectionSpecification { readonly relation: string; readonly columns: readonly string[]; readonly keys: readonly string[] }
const SUCCESSOR26_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
 product: Object.freeze(["season_ids", "deleted_at", "default_barcode_scheme_id"]),
 sku: Object.freeze(["created_operation_id"]), warehouse: Object.freeze(["created_operation_id"]),
 product_category: Object.freeze(["deleted_at"]), color: Object.freeze(["deleted_at"]), fit: Object.freeze(["deleted_at"])
});
const HISTORY_PROJECTION_SPEC_26 = Object.freeze(HISTORY_PROJECTION_SPEC.map(spec => Object.freeze({
 relation: spec.relation, keys: spec.keys, columns: Object.freeze([...spec.columns, ...(SUCCESSOR26_FIELDS[spec.relation] ?? [])])
})));
export const historyClosureProjectionSpec26 = (): readonly ProjectionSpecification[] => HISTORY_PROJECTION_SPEC_26;
export function historyClosureProjectionRow26(relation: string, original: unknown): HistoryClosureRow {
 const row = projectHistoryClosureRow(relation, original, HISTORY_PROJECTION_SPEC_26), value = row.projection as Record<string, unknown>;
 // Generic encoding above inspects every nested descriptor before these value reads.
 if (relation === "product") {
  const ids = value.season_ids;
  if (ids !== null) {
   must(Array.isArray(ids));
   for (let i = 0; i < (ids as unknown[]).length; i++) {
    const id = stageUuid((ids as unknown[])[i]); must(i === 0 || (ids as string[])[i - 1]! < id);
   }
  }
 }
 for (const field of SUCCESSOR26_FIELDS[relation] ?? []) {
  const v = value[field];
  if (field === "deleted_at") must(v === null || typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(v) && Number.isFinite(Date.parse(v)));
  else if (field !== "season_ids" && v !== null) stageUuid(v);
 }
 return row;
}
function projectHistoryClosureRow(relation: string, original: unknown, specs: readonly ProjectionSpecification[]): HistoryClosureRow {
 const spec = specs.find(s => s.relation === relation);
 must(spec !== undefined); const value = stageObject(original, spec!.columns);
 for (const col of spec!.keys) must(typeof value[col] === "string" && (value[col] as string).length > 0);
 for (const col of spec!.columns) {
  const v = value[col];
  if (col.endsWith("_price") || ["gross_amount","order_discount","net_due","deal_price","line_amount","allocated_discount","reference_price","amount"].includes(col))
   must(v === null || typeof v === "string" && /^-?(?:0|[1-9][0-9]{0,15})[.][0-9]{2}$/.test(v) && v !== "-0.00");
  if (["row_no","quantity","signed_quantity"].includes(col)) must(typeof v === "string" && /^(?:0|-?[1-9][0-9]*)$/.test(v));
 }
 if (relation === "customer" || relation === "supplier") must(value.created_at === null && value.updated_at === null);
 encodeHistoryClosureValue(value);
 const key = spec!.keys.length === 1 ? value[spec!.keys[0]!] as string : encodeHistoryClosureValue(spec!.keys.map(k => value[k])).toString("hex");
 return captureRow({ relation, key, projection: value });
}
