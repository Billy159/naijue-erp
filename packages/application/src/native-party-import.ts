import { requireDomain } from '../../domain/src/errors.ts';
import { IMPORT_V2_TABLES } from './import-v2-contract.ts';
import { HISTORY_MAPPING_VERSION } from './history-storage-contract.ts';
import type { ImportSourceEvidence, JsonObject } from './history-storage-contract.ts';
import { prepareV3HistoryHeaderNativeReferenceChunk } from './import-v3-history-header-native-reference.ts';
import type { HistoryHeaderNativeReferenceInput, HistoryHeaderNativeReferenceSelection, HistoryHeaderReferenceEnumMapping, PreparedHistoryHeaderNativeReferenceChunk } from './import-v3-history-header-native-reference.ts';
import type { HeaderNativeBinding } from './import-v3-history-header.ts';
import { requestHash } from './request-hash.ts';
import { mapHistoryTemporal } from './history-temporal-mapping.ts';

export const NATIVE_PARTY_IMPORT_VERSION = 'NATIVE_PARTY_IMPORT_V1';
export const NATIVE_PARTY_IMPORT_CHUNK_LIMIT = 100;
export type NativePartyImportEntity = 'HALL' | 'CUSTOMER' | 'SUPPLIER' | 'STAFF' | 'WAREHOUSE';
export interface NativePartyImportSelection extends Omit<HistoryHeaderNativeReferenceSelection, 'entity'> { entity: NativePartyImportEntity }
export interface NativePartyImportInput {
  batchId: string; fixedSourceNamespace: string; selection: NativePartyImportSelection; source: ImportSourceEvidence;
  /** Explicit independent UUID and complete native shape. No lookup by name or source UUID reuse. */
  nativeSnapshot: JsonObject;
  bindings: Readonly<Record<string, HeaderNativeBinding | undefined>>;
  enumMappings: Readonly<Record<string, HistoryHeaderReferenceEnumMapping | undefined>>;
  /** Explicit reviewed metadata for the existing immutable same-batch warehouse import_record. */
  warehouseRecord?: { id: string; reviewedAt: string; decisionReason: string };
}
export interface NativePartyRowAuthorization {
  sourceRowId: string; sourceKey: string; nativeId: string; rowFingerprint: string; selectionSha256: string; approvalSha256: string;
}
export interface PreparedNativePartyImportRow {
  input: NativePartyImportInput; entity: NativePartyImportEntity; nativeId: string; nativeSnapshot: JsonObject;
  fingerprint: string; authorization: NativePartyRowAuthorization;
  /** Reuses the independently validated 0012 contract, never an alternate header mapping. */
  headerReference: PreparedHistoryHeaderNativeReferenceChunk | null;
}
export interface PreparedNativePartyImportChunk {
  batchId: string; fixedSourceNamespace: string; mappingVersion: typeof HISTORY_MAPPING_VERSION;
  selection: NativePartyImportSelection; rows: readonly PreparedNativePartyImportRow[]; fingerprint: string;
}
export interface NativePartyImportStore { stage(chunk: PreparedNativePartyImportChunk): Promise<{ inserted: number; replayed: number }> }
const check = (ok: unknown, code: string): void => requireDomain(ok, code, code);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 65536 && !v.includes('\0');
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const hash = (v: unknown): boolean => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);

export function prepareNativePartyImportChunk(inputs: readonly NativePartyImportInput[]): PreparedNativePartyImportChunk {
  check(Array.isArray(inputs) && inputs.length > 0 && inputs.length <= NATIVE_PARTY_IMPORT_CHUNK_LIMIT, 'NATIVE_PARTY_CHUNK_LIMIT');
  const cloned = structuredClone(inputs), first = cloned[0]!;
  check(new TextEncoder().encode(JSON.stringify(cloned)).byteLength <= 4 * 1024 * 1024, 'NATIVE_PARTY_BYTE_LIMIT');
  const sources = new Set<string>(), positions = new Set<string>(), natives = new Set<string>(), codes = new Set<string>(), recordIds = new Set<string>();
  const rows = cloned.map(input => {
    const { selection, source: s, nativeSnapshot: n } = input, entity = selection.entity;
    check(['HALL', 'CUSTOMER', 'SUPPLIER', 'STAFF', 'WAREHOUSE'].includes(entity), 'NATIVE_PARTY_ENTITY');
    const table = IMPORT_V2_TABLES.find(t => t.entity === entity)!;
    check(selection.source === 'BASE_V2' && selection.path === table.file && [selection.baseManifestSha256, selection.selectionSha256, selection.approvalSha256, selection.csvSha256].every(hash), 'NATIVE_PARTY_SELECTION');
    check(input.batchId === first.batchId && input.fixedSourceNamespace === first.fixedSourceNamespace && ['baseManifestSha256', 'selectionSha256', 'approvalSha256'].every(k => selection[k as keyof NativePartyImportSelection] === first.selection[k as keyof NativePartyImportSelection]), 'NATIVE_PARTY_MIXED_SELECTION');
    check(uuid(input.batchId) && text(input.fixedSourceNamespace) && s.batchId === input.batchId && uuid(s.id) && s.entityType === entity && text(s.sourceKey)
      && text(s.fileRef) && text(s.sheet) && typeof s.rowNo === 'string' && /^[1-9]\d*$/.test(s.rowNo) && BigInt(s.rowNo) <= 9223372036854775807n && hash(s.sourceFileSha256) && hash(s.rowSha256), 'NATIVE_PARTY_SOURCE');
    const raw = s.rawFields, normalized = s.normalizedFields;
    check(Object.keys(normalized).length === table.columns.length && table.columns.every(c => Object.hasOwn(raw, c.name) && raw[c.name] === normalized[c.name]
      && typeof raw[c.name] === 'string' && (raw[c.name] as string).length <= 65536 && !(raw[c.name] as string).includes('\0') && (!c.required || text(raw[c.name])))
      && raw['来源编号'] === s.sourceKey, 'NATIVE_PARTY_EXACT_SOURCE');
    check(s.fieldProvenance.schema_version === 1 && s.fieldProvenance.fields && typeof s.fieldProvenance.fields === 'object' && !Array.isArray(s.fieldProvenance.fields)
      && !Object.hasOwn(s.fieldProvenance, 'native_party_import'), 'NATIVE_PARTY_PROVENANCE');
    check(uuid(n.id) && n.id !== s.sourceKey && n.id !== s.id && n.version === 1 && text(n.name), 'NATIVE_PARTY_NEW_ID_VERSION');
    let headerReference: PreparedHistoryHeaderNativeReferenceChunk | null = null;
    if (entity !== 'SUPPLIER' && entity !== 'WAREHOUSE') {
      headerReference = prepareV3HistoryHeaderNativeReferenceChunk([input as HistoryHeaderNativeReferenceInput]);
    } else {
      const keys = entity === 'SUPPLIER' ? ['id', 'code', 'name', 'enabled', 'version', 'created_at', 'updated_at'] : ['id', 'hall_id', 'name', 'enabled', 'version'];
      check(Object.keys(n).length === keys.length && keys.every(k => Object.hasOwn(n, k)) && (entity !== 'SUPPLIER' || n.code === raw['原编码'] && text(n.code))
        && n.name === raw[entity === 'SUPPLIER' ? '名称' : '仓库名称'] && typeof n.enabled === 'boolean', 'NATIVE_PARTY_SUPPLIER_FIELDS');
      check((entity === 'WAREHOUSE' || Object.keys(input.bindings).length === 0) && Object.keys(input.enumMappings).length === 1 && input.enumMappings['状态']?.raw === raw['状态']
        && input.enumMappings['状态']?.native === n.enabled && text(input.enumMappings['状态']?.evidenceRef), 'NATIVE_PARTY_ENUM_MAPPING');
      check(!['native_hall_id', 'native_customer_id', 'native_staff_id', 'native_supplier_id', 'native_warehouse_id'].some(k => Object.hasOwn(s.fieldProvenance, k)), 'NATIVE_PARTY_COMPETING_BINDING');
    }
    if (entity === 'WAREHOUSE') {
      check(raw['切换范围'] === '本次完整核准', 'NATIVE_PARTY_WAREHOUSE_SCOPE_NOT_APPROVED');
      const binding = input.bindings['所属厅来源编号'];
      check(Object.keys(input.bindings).length === 1 && binding && binding.sourceKey === raw['所属厅来源编号'] && uuid(binding.nativeId) && n.hall_id === binding.nativeId, 'NATIVE_PARTY_WAREHOUSE_HALL_BINDING');
      const record = input.warehouseRecord;
      check(record && uuid(record.id) && record.id !== s.id && record.id !== n.id && text(record.decisionReason) && mapHistoryTemporal(record.reviewedAt, 'DATETIME').instant !== null, 'NATIVE_PARTY_WAREHOUSE_IMPORT_RECORD');
      check(!recordIds.has(record!.id), 'NATIVE_PARTY_DUPLICATE_WAREHOUSE_RECORD'); recordIds.add(record!.id);
    } else check(input.warehouseRecord === undefined, 'NATIVE_PARTY_UNEXPECTED_WAREHOUSE_RECORD');
    // The approved BASE_V2 files have NO historical timestamp fields. Runtime import time is separate metadata.
    if (entity === 'CUSTOMER' || entity === 'SUPPLIER') {
      check(n.created_at === null && n.updated_at === null, 'NATIVE_PARTY_UNKNOWN_HISTORICAL_TIME_MUST_STAY_NULL');
      check(!codes.has(`${entity}:${n.code}`), 'NATIVE_PARTY_DUPLICATE_CODE'); codes.add(`${entity}:${n.code}`);
    }
    const sourceIdentity = JSON.stringify([entity, s.sourceKey]), position = JSON.stringify([s.sourceFileSha256, s.sheet, s.rowNo]);
    check(!sources.has(sourceIdentity) && !sources.has(s.id) && !positions.has(position) && !natives.has(n.id as string), 'NATIVE_PARTY_DUPLICATE');
    sources.add(sourceIdentity); sources.add(s.id); positions.add(position); natives.add(n.id as string);
    const fingerprint = requestHash({ validatorVersion: NATIVE_PARTY_IMPORT_VERSION, input });
    const authorization = { sourceRowId: s.id, sourceKey: s.sourceKey, nativeId: n.id as string, rowFingerprint: fingerprint,
      selectionSha256: selection.selectionSha256, approvalSha256: selection.approvalSha256 };
    return { input, entity, nativeId: n.id as string, nativeSnapshot: n, fingerprint, authorization, headerReference };
  });
  return { batchId: first.batchId, fixedSourceNamespace: first.fixedSourceNamespace, mappingVersion: HISTORY_MAPPING_VERSION,
    selection: first.selection, rows, fingerprint: requestHash(cloned) };
}
export function validatePreparedNativePartyImportChunk(chunk: PreparedNativePartyImportChunk): void {
  check(requestHash(prepareNativePartyImportChunk(chunk.rows.map(r => r.input))) === requestHash(chunk), 'NATIVE_PARTY_PREPARED_CHANGED');
}
/** Exact immutable source shape the supplier writer persists; header entities use the shared 0012 writer. */
export function nativePartyStandaloneImportSource(row: PreparedNativePartyImportRow): JsonObject {
  check(row.entity === 'SUPPLIER' || row.entity === 'WAREHOUSE', 'NATIVE_PARTY_STANDALONE_REQUIRED'); const s = row.input.source;
  const fields: JsonObject = { ...(s.fieldProvenance.fields as JsonObject) };
  const enums: JsonObject = {};
  for (const [key, mapping] of Object.entries(row.input.enumMappings)) if (mapping) enums[key] = { raw: mapping.raw, native: mapping.native, evidenceRef: mapping.evidenceRef };
  for (const [key, raw] of Object.entries(s.normalizedFields)) fields[key] = { origin: raw === '' ? 'UNKNOWN' : 'ORIGINAL', reason: raw === '' ? 'SOURCE_EMPTY' : 'SOURCE_PRESERVED', raw };
  return { id: s.id, batch_id: s.batchId, entity_type: s.entityType, source_key: s.sourceKey, file_ref: s.fileRef, sheet: s.sheet, row_no: s.rowNo,
    source_file_sha256: s.sourceFileSha256, row_sha256: s.rowSha256, raw_fields: s.rawFields, normalized_fields: s.normalizedFields,
    field_provenance: { ...s.fieldProvenance, schema_version: 1, fields, [row.entity === 'SUPPLIER' ? 'native_supplier_id' : 'native_warehouse_id']: row.nativeId,
      native_party_import: { validator_version: NATIVE_PARTY_IMPORT_VERSION, native_id: row.nativeId, native_snapshot: row.nativeSnapshot,
        row_fingerprint: row.fingerprint, selection: { ...row.input.selection }, enum_mappings: enums, bindings: Object.fromEntries(Object.entries(row.input.bindings).filter(([, binding]) => !!binding).map(([field, binding]) => [field, { sourceKey: binding!.sourceKey, nativeId: binding!.nativeId }])) } } };
}
/** Backward-named supplier utility; cannot produce a warehouse payload accidentally. */
export function nativeSupplierImportSource(row: PreparedNativePartyImportRow): JsonObject {
  check(row.entity === 'SUPPLIER', 'NATIVE_PARTY_SUPPLIER_REQUIRED'); return nativePartyStandaloneImportSource(row);
}
export async function stageNativePartyImports(inputs: readonly NativePartyImportInput[], options: {
  mode?: 'DRY_RUN' | 'STAGE'; store?: NativePartyImportStore;
  /** Independently authenticate original/selected bytes AND this exact row/target/enum/relation grant. No default authority. */
  authorizeRow?: (row: PreparedNativePartyImportRow) => Promise<NativePartyRowAuthorization>;
} = {}): Promise<{ mode: 'DRY_RUN' | 'STAGE'; rows: number; inserted: number; replayed: number; published: false; importReady: false }> {
  const chunk = prepareNativePartyImportChunk(inputs);
  if (options.mode === undefined || options.mode === 'DRY_RUN') return { mode: 'DRY_RUN', rows: chunk.rows.length, inserted: 0, replayed: 0, published: false, importReady: false };
  check(options.mode === 'STAGE' && options.store && options.authorizeRow, 'NATIVE_PARTY_AUTHORIZATION_REQUIRED');
  for (const row of chunk.rows) check(requestHash(await options.authorizeRow!(structuredClone(row))) === requestHash(row.authorization), 'NATIVE_PARTY_EXACT_ROW_AUTHORIZATION_REQUIRED');
  return { mode: 'STAGE', rows: chunk.rows.length, ...await options.store!.stage(chunk), published: false, importReady: false };
}
