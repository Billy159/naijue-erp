import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { HISTORY_MAPPING_VERSION } from "./history-storage-contract.ts";
import type { ImportSourceEvidence, JsonObject, JsonValue } from "./history-storage-contract.ts";
import { requestHash } from "./request-hash.ts";
import { historySettlementRequestHash } from "./import-v3-history-settlement.ts";

export const NATIVE_CATALOGUE_IMPORT_VERSION = "NATIVE_CATALOGUE_IMPORT_V1";
/** Pure DTO discriminator. The existing binding-table validator_version stays V1. */
export const NATIVE_CATALOGUE_IMPORT_VERSION_26 = "NATIVE_CATALOGUE_IMPORT_EXACT26_V1";
export const NATIVE_CATALOGUE_ENTITIES = ["CATEGORY", "COLOR", "FIT", "SIZE", "SIZE_GROUP", "SEASON", "SIZE_GROUP_MEMBER"] as const;
export type NativeCatalogueEntity = typeof NATIVE_CATALOGUE_ENTITIES[number];
/** Native schema columns, NOT a claim about original dictionary field names. */
export const NATIVE_CATALOGUE_COLUMNS: Readonly<Record<NativeCatalogueEntity, readonly string[]>> = {
  CATEGORY: ["id", "parent_id", "name", "display_order", "version"], COLOR: ["id", "code", "name", "enabled", "version"],
  FIT: ["id", "code", "name", "enabled", "version"], SIZE: ["id", "code", "name"], SIZE_GROUP: ["id", "code", "name"],
  SEASON: ["id", "code", "name", "display_order"], SIZE_GROUP_MEMBER: ["size_group_id", "size_id", "display_order"]
};
export const NATIVE_CATALOGUE_COLUMNS_26: Readonly<Record<NativeCatalogueEntity, readonly string[]>> = Object.freeze(Object.fromEntries(
  NATIVE_CATALOGUE_ENTITIES.map(entity => [entity, Object.freeze([...NATIVE_CATALOGUE_COLUMNS[entity], ...(["CATEGORY", "COLOR", "FIT"].includes(entity) ? ["deleted_at"] : [])])])
) as Record<NativeCatalogueEntity, readonly string[]>);
export interface NativeCatalogueSelection {
  readonly source: "REVIEWED_DICTIONARY_OCCURRENCES_V1";
  readonly baseManifestSha256: string; readonly selectionSha256: string; readonly approvalSha256: string;
  /** Authenticated occurrence/schema/creation-decision artifact; no guessed v2 dictionary schema. */
  readonly occurrenceContractSha256: string;
}
export type NativeCatalogueValueDecision = {
  readonly kind: "SOURCE_FIELD"; readonly field: string;
} | {
  /** A NEW native property, never falsely labelled as an original source cell. */
  readonly kind: "REVIEWED_VALUE"; readonly value: JsonValue; readonly ruleId: string;
  readonly evidenceRef: string; readonly approvalSha256: string; readonly reason: string;
  readonly sourceFields: readonly string[];
};
export interface NativeCatalogueReference {
  readonly entity: "CATEGORY" | "SIZE" | "SIZE_GROUP";
  readonly sourceKey: string; readonly nativeId: string;
  /** Full binding-time native projection. No name-only lookup. */
  readonly nativeSnapshot: JsonObject;
}
export interface NativeCatalogueImportRow {
  readonly source: ImportSourceEvidence;
  /** Original occurrence identity field, not a guessed label or native ID. */
  readonly sourceKeyField: string;
  /** Explicit, independently allocated native ID; absent only for composite members. */
  readonly nativeId: string | null;
  /** Every non-technical native column requires a decision; no implicit active/order/code. */
  readonly decisions: Readonly<Record<string, NativeCatalogueValueDecision>>;
  readonly references: Readonly<Record<string, NativeCatalogueReference>>;
}
export interface NativeCatalogueImportChunk {
  readonly batchId: string; readonly fixedSourceNamespace: string; readonly selection: NativeCatalogueSelection;
  readonly rows: readonly NativeCatalogueImportRow[];
}
export interface PreparedNativeCatalogueImportRow extends NativeCatalogueImportRow {
  readonly entity: NativeCatalogueEntity; readonly nativeSnapshot: JsonObject; readonly targetKey: string;
  readonly fingerprint: string; readonly evidence: JsonObject;
}
export interface PreparedNativeCatalogueImportChunk extends Omit<NativeCatalogueImportChunk, "rows"> {
  readonly rows: readonly PreparedNativeCatalogueImportRow[]; readonly mappingVersion: typeof HISTORY_MAPPING_VERSION;
  readonly fingerprint: string;
}
export interface NativeCatalogueImportChunk26 extends NativeCatalogueImportChunk {
  readonly schemaProfile: "EXACT26"; readonly validatorVersion: typeof NATIVE_CATALOGUE_IMPORT_VERSION_26;
}
export interface PreparedNativeCatalogueImportChunk26 extends PreparedNativeCatalogueImportChunk {
  readonly schemaProfile: "EXACT26"; readonly validatorVersion: typeof NATIVE_CATALOGUE_IMPORT_VERSION_26;
}
export interface NativeCatalogueImportResult {
  readonly inserted: number; readonly replayed: number;
  /** Observation only, never a substitute for publication-time current reconciliation. */
  readonly nativeCurrentMatchesCreation: boolean;
}
export interface NativeCatalogueImportStore { stage(chunk: PreparedNativeCatalogueImportChunk): Promise<NativeCatalogueImportResult> }
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 65536 && !v.includes("\0");
const hash = (v: unknown): boolean => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const object = (v: unknown): v is JsonObject => v !== null && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown): boolean => Number.isSafeInteger(v) && (v as number) >= -2147483648 && (v as number) <= 2147483647;
function exactValue(v: JsonValue, column: string): JsonValue {
  if (column === "display_order" && typeof v === "string" && /^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(v)
    && BigInt(v) >= -2147483648n && BigInt(v) <= 2147483647n) return Number(v);
  return v;
}
function validateSnapshot(entity: NativeCatalogueEntity, n: JsonObject, successor = false): void {
  const cols = (successor ? NATIVE_CATALOGUE_COLUMNS_26 : NATIVE_CATALOGUE_COLUMNS)[entity];
  requireDomain(Object.keys(n).length === cols.length && cols.every(c => Object.hasOwn(n, c)), "NATIVE_CATALOGUE_COLUMNS", "Exact complete native columns required");
  for (const [key, value] of Object.entries(n)) {
    if (successor && key === "deleted_at") requireDomain(value === null, "NATIVE_CATALOGUE_CREATION_METADATA", "First source creation has explicitly approved NULL tombstone metadata");
    else if (key === "id" || key.endsWith("_id")) {
      if (key === "parent_id" && value === null) continue;
      entityId("category", value as string);
    } else if (key === "version") requireDomain(value === 1, "NATIVE_CATALOGUE_VERSION", "Creation version is exactly 1");
    else if (key === "enabled") requireDomain(typeof value === "boolean", "NATIVE_CATALOGUE_ENABLEMENT", "Explicit source or reviewed enablement decision required; never default active");
    else if (key === "display_order") requireDomain(integer(value), "NATIVE_CATALOGUE_ORDER", "Explicit exact PostgreSQL display order required");
    else if (key === "code" && entity === "SIZE" && value === null) continue;
    else requireDomain(text(value), "NATIVE_CATALOGUE_VALUE", `Missing nonblank native ${entity}.${key}; no code/name is invented`);
  }
  if (entity === "FIT") requireDomain(typeof n.code === "string" && /^[A-Z]$/.test(n.code), "NATIVE_CATALOGUE_FIT_CODE", "Existing native one-letter uppercase FIT constraint is unchanged");
}
export function prepareNativeCatalogueImportChunk(input: NativeCatalogueImportChunk): PreparedNativeCatalogueImportChunk {
  requireDomain(!Object.hasOwn(input, "schemaProfile") && !Object.hasOwn(input, "validatorVersion"), "NATIVE_CATALOGUE_SUCCESSOR_EXPLICIT", "Successor requires its explicit preparer");
  return prepareNativeCatalogueCore(input);
}
function prepareNativeCatalogueCore(input: NativeCatalogueImportChunk, successor = false): PreparedNativeCatalogueImportChunk {
  const chunk = structuredClone(input); entityId("category", chunk.batchId);
  const selection = chunk.selection;
  requireDomain(text(chunk.fixedSourceNamespace) && selection?.source === "REVIEWED_DICTIONARY_OCCURRENCES_V1"
    && [selection.baseManifestSha256, selection.selectionSha256, selection.approvalSha256, selection.occurrenceContractSha256].every(hash),
  "NATIVE_CATALOGUE_SELECTION", "Authenticated dictionary occurrence and creation-decision contract required");
  requireDomain(Array.isArray(chunk.rows) && chunk.rows.length > 0 && chunk.rows.length <= 200
    && new TextEncoder().encode(JSON.stringify(chunk)).byteLength <= 4 * 1024 * 1024, "NATIVE_CATALOGUE_LIMIT", "Bounded dictionary chunk required");
  const ids = new Set<string>(), keys = new Set<string>(), targets = new Set<string>(), positions = new Set<string>(), uniqueCodes = new Set<string>();
  const rows: PreparedNativeCatalogueImportRow[] = chunk.rows.map((row: NativeCatalogueImportRow) => {
    const s = row.source, entity = s?.entityType as NativeCatalogueEntity;
    requireDomain(s && (NATIVE_CATALOGUE_ENTITIES as readonly string[]).includes(entity) && s.batchId === chunk.batchId
      && text(s.sourceKey) && text(s.fileRef) && text(s.sheet) && typeof s.rowNo === "string" && /^[1-9]\d*$/.test(s.rowNo)
      && s.rowNo.length <= 19 && BigInt(s.rowNo) <= 9223372036854775807n && hash(s.sourceFileSha256) && hash(s.rowSha256),
    "NATIVE_CATALOGUE_SOURCE_OCCURRENCE", "An exact independently reviewed dictionary occurrence is required; PRODUCT/SKU aggregation is not dictionary source authority");
    entityId("category", s.id);
    requireDomain(object(s.rawFields) && object(s.normalizedFields) && requestHash(s.rawFields) === requestHash(s.normalizedFields)
      && text(row.sourceKeyField) && s.rawFields[row.sourceKeyField] === s.sourceKey && s.rawFields["绑定范围"] !== "PRODUCT",
    "NATIVE_CATALOGUE_RAW_IDENTITY", "Exact original dictionary cells and explicit source identity field required");
    const provenance = s.fieldProvenance, fields = provenance.fields;
    requireDomain(provenance.schema_version === 1 && object(fields) && Object.keys(provenance).every(k => k === "schema_version" || k === "fields"),
      "NATIVE_CATALOGUE_PROVENANCE", "Unaugmented original occurrence provenance required");
    for (const [key, raw] of Object.entries(s.rawFields)) {
      const field = fields[key];
      requireDomain(object(field) && field.origin === "ORIGINAL" && text(field.reason) && Object.hasOwn(field, "raw")
        && requestHash(field.raw) === requestHash(raw), "NATIVE_CATALOGUE_PROVENANCE", `Missing exact original evidence for ${entity}.${key}`);
    }
    const expected = NATIVE_CATALOGUE_COLUMNS[entity].filter(c => c !== "id" && c !== "version" && !c.endsWith("_id"));
    requireDomain(row.decisions && Object.keys(row.decisions).length === expected.length && expected.every(c => Object.hasOwn(row.decisions, c)),
      "NATIVE_CATALOGUE_CREATION_DECISIONS", `Explicit decisions required for ${entity}: ${expected.join(", ")}; absent original fields are not defaults`);
    const n: JsonObject = {}, decisionEvidence: JsonObject = {};
    if (entity !== "SIZE_GROUP_MEMBER") { entityId("category", row.nativeId as string);
      requireDomain(row.nativeId !== s.sourceKey, "NATIVE_CATALOGUE_NATIVE_ID", "Explicit independent native allocation required; do not copy source identity into native identity"); n.id = row.nativeId; }
    else requireDomain(row.nativeId === null, "NATIVE_CATALOGUE_MEMBER_ID", "Members have their native composite group/size key, not an invented row ID");
    if (["CATEGORY", "COLOR", "FIT"].includes(entity)) n.version = 1;
    if (successor && ["CATEGORY", "COLOR", "FIT"].includes(entity)) n.deleted_at = null;
    for (const column of expected) {
      const d = row.decisions[column]!;
      if (d.kind === "SOURCE_FIELD") {
        requireDomain(text(d.field) && Object.hasOwn(s.rawFields, d.field), "NATIVE_CATALOGUE_SOURCE_FIELD_MISSING", `No proven raw source field for native ${entity}.${column}`);
        n[column] = exactValue(s.rawFields[d.field]!, column); decisionEvidence[column] = { ...d, origin: "ORIGINAL", raw: s.rawFields[d.field]! };
      } else {
        requireDomain(d.kind === "REVIEWED_VALUE" && Object.hasOwn(d, "value") && text(d.ruleId) && text(d.evidenceRef) && text(d.reason)
          && hash(d.approvalSha256) && d.approvalSha256 === selection.approvalSha256 && Array.isArray(d.sourceFields)
          && d.sourceFields.length > 0 && new Set(d.sourceFields).size === d.sourceFields.length
          && d.sourceFields.every(f => text(f) && Object.hasOwn(s.rawFields, f)), "NATIVE_CATALOGUE_REVIEWED_VALUE", `Reviewed new native ${entity}.${column} rule with exact original inputs required`);
        n[column] = d.value; decisionEvidence[column] = { ...d, sourceFields: [...d.sourceFields], origin: "MIGRATION_DERIVED", inputs: Object.fromEntries(d.sourceFields.map(f => [f, s.rawFields[f]!])) };
      }
    }
    const refColumns = entity === "CATEGORY" ? ["parent_id"] : entity === "SIZE_GROUP_MEMBER" ? ["size_group_id", "size_id"] : [];
    requireDomain(row.references && Object.keys(row.references).every(c => refColumns.includes(c))
      && (entity !== "SIZE_GROUP_MEMBER" || refColumns.every(c => Object.hasOwn(row.references, c))), "NATIVE_CATALOGUE_REFERENCES", "Explicit native parent/member source bindings required");
    if (entity === "CATEGORY") n.parent_id = null;
    for (const [column, ref] of Object.entries(row.references)) {
      const expectedEntity = column === "parent_id" ? "CATEGORY" : column === "size_id" ? "SIZE" : "SIZE_GROUP";
      requireDomain(ref.entity === expectedEntity && text(ref.sourceKey) && object(ref.nativeSnapshot) && ref.nativeSnapshot.id === ref.nativeId,
        "NATIVE_CATALOGUE_REFERENCES", "Exact source/native dependency identity and snapshot required");
      entityId("category", ref.nativeId); validateSnapshot(ref.entity, ref.nativeSnapshot, successor); n[column] = ref.nativeId;
      if (column === "parent_id") requireDomain(ref.nativeSnapshot.parent_id === null && ref.nativeId !== n.id,
        "NATIVE_CATALOGUE_CATEGORY_DEPTH", "Existing two-level acyclic category contract is unchanged; never reclassify products");
    }
    validateSnapshot(entity, n, successor);
    const targetKey = entity === "SIZE_GROUP_MEMBER" ? `${n.size_group_id}/${n.size_id}` : n.id as string;
    const key = JSON.stringify([entity, s.sourceKey]), target = JSON.stringify([entity, targetKey]), position = JSON.stringify([s.sourceFileSha256, s.sheet, s.rowNo]);
    requireDomain(!ids.has(s.id) && !keys.has(key) && !targets.has(target) && !positions.has(position), "NATIVE_CATALOGUE_DUPLICATE", "Repeated dictionary occurrence, identity or target");
    ids.add(s.id); keys.add(key); targets.add(target); positions.add(position);
    if (["COLOR", "FIT", "SIZE_GROUP", "SEASON"].includes(entity)) {
      const code = JSON.stringify([entity, n.code]); requireDomain(!uniqueCodes.has(code), "NATIVE_CATALOGUE_DUPLICATE_CODE", "Native unique code collision; SIZE code intentionally is not globally unique"); uniqueCodes.add(code);
    }
    const fingerprint = requestHash({ selection, row, nativeSnapshot: n, ...(successor ? { schemaProfile: "EXACT26" } : {}) });
    const evidence: JsonObject = { validator_version: NATIVE_CATALOGUE_IMPORT_VERSION, fingerprint, native_snapshot: n,
      target_key: targetKey, source_key_field: row.sourceKeyField, selection: { ...selection }, decisions: decisionEvidence,
      references: structuredClone(row.references) as unknown as JsonObject,
      ...(successor ? { schema_profile: "EXACT26", migration_defaults: { version: "NATIVE_CATALOGUE_APPROVED_MIGRATION_DEFAULTS_26_V1",
        ...(["CATEGORY", "COLOR", "FIT"].includes(entity) ? { deleted_at: null } : {}) } } : {}) };
    return { ...row, entity, nativeSnapshot: n, targetKey, fingerprint, evidence };
  });
  // In-chunk references must resolve exactly; others are checked against immutable same-batch bindings by the SQL adapter.
  const byTarget = new Map(rows.filter(r => r.entity !== "SIZE_GROUP_MEMBER").map(r => [JSON.stringify([r.entity, r.targetKey]), r]));
  const dependencyDecisions = new Map<string, string>();
  for (const row of rows) for (const ref of Object.values(row.references)) {
    const refKey = JSON.stringify([ref.entity, ref.nativeId]), refHash = requestHash(ref);
    requireDomain(!dependencyDecisions.has(refKey) || dependencyDecisions.get(refKey) === refHash, "NATIVE_CATALOGUE_REFERENCE_CONFLICT", "Repeated native dependency must have one exact source identity/snapshot");
    dependencyDecisions.set(refKey, refHash);
    const other = byTarget.get(JSON.stringify([ref.entity, ref.nativeId]));
    if (other) requireDomain(other.source.sourceKey === ref.sourceKey && requestHash(other.nativeSnapshot) === requestHash(ref.nativeSnapshot),
      "NATIVE_CATALOGUE_REFERENCE_CONFLICT", "In-chunk reference differs from exact source/native creation decision");
  }
  return { ...chunk, rows, mappingVersion: HISTORY_MAPPING_VERSION, fingerprint: requestHash(chunk) };
}
export function prepareNativeCatalogueImportChunk26(input: NativeCatalogueImportChunk26): PreparedNativeCatalogueImportChunk26 {
  historySettlementRequestHash(input);
  requireDomain(Reflect.ownKeys(input).length === 6 && ["batchId", "fixedSourceNamespace", "selection", "rows", "schemaProfile", "validatorVersion"].every(k => Object.hasOwn(input, k))
    && input.schemaProfile === "EXACT26" && input.validatorVersion === NATIVE_CATALOGUE_IMPORT_VERSION_26,
  "NATIVE_CATALOGUE_SUCCESSOR_PROFILE", "Explicit exact26 source DTO required");
  return prepareNativeCatalogueCore(input, true) as PreparedNativeCatalogueImportChunk26;
}
export function validatePreparedNativeCatalogueImportChunk26(chunk: PreparedNativeCatalogueImportChunk26): void {
  historySettlementRequestHash(chunk);
  const input: NativeCatalogueImportChunk26 = { batchId: chunk.batchId, fixedSourceNamespace: chunk.fixedSourceNamespace, selection: chunk.selection,
    schemaProfile: chunk.schemaProfile, validatorVersion: chunk.validatorVersion,
    rows: chunk.rows.map(({ source, sourceKeyField, nativeId, decisions, references }) => ({ source, sourceKeyField, nativeId, decisions, references })) };
  requireDomain(requestHash(prepareNativeCatalogueImportChunk26(input)) === requestHash(chunk), "NATIVE_CATALOGUE_PREPARED_CHANGED", "Prepared successor catalogue changed");
}
export function validatePreparedNativeCatalogueImportChunk(chunk: PreparedNativeCatalogueImportChunk): void {
  const input: NativeCatalogueImportChunk = { batchId: chunk.batchId, fixedSourceNamespace: chunk.fixedSourceNamespace, selection: chunk.selection,
    rows: chunk.rows.map(({ source, sourceKeyField, nativeId, decisions, references }) => ({ source, sourceKeyField, nativeId, decisions, references })) };
  requireDomain(requestHash(prepareNativeCatalogueImportChunk(input)) === requestHash(chunk), "NATIVE_CATALOGUE_PREPARED_CHANGED", "Prepared native catalogue data changed");
}
export function nativeCatalogueSourceEvidence(row: PreparedNativeCatalogueImportRow): JsonObject {
  const s = row.source;
  return { id: s.id, batch_id: s.batchId, entity_type: row.entity, source_key: s.sourceKey, file_ref: s.fileRef, sheet: s.sheet, row_no: s.rowNo,
    source_file_sha256: s.sourceFileSha256, row_sha256: s.rowSha256, raw_fields: s.rawFields, normalized_fields: s.normalizedFields,
    field_provenance: { ...s.fieldProvenance, native_catalogue_import: row.evidence } };
}
export async function stageNativeCatalogueImportChunk(input: NativeCatalogueImportChunk, options: {
  readonly mode?: "DRY_RUN" | "STAGE"; readonly store?: NativeCatalogueImportStore;
  /** Independently authenticate exact original/new-dictionary bytes, occurrence locators, all decisions and native ID allocations. */
  readonly authorize?: (chunk: PreparedNativeCatalogueImportChunk) => Promise<void>;
} = {}): Promise<{ mode: "DRY_RUN" | "STAGE"; rows: number; inserted: number; replayed: number; published: false; importReady: false; nativeCurrentMatchesCreation?: boolean }> {
  const chunk = prepareNativeCatalogueImportChunk(input);
  if (options.mode === undefined || options.mode === "DRY_RUN") return { mode: "DRY_RUN", rows: chunk.rows.length, inserted: 0, replayed: 0, published: false, importReady: false };
  requireDomain(options.mode === "STAGE" && options.store && options.authorize, "NATIVE_CATALOGUE_AUTHORIZATION_REQUIRED", "Exact occurrence and creation-decision authorization required");
  await options.authorize(structuredClone(chunk));
  return { mode: "STAGE", rows: chunk.rows.length, ...await options.store.stage(chunk), published: false, importReady: false };
}
