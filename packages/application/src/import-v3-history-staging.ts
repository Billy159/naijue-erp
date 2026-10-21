import { IMPORT_V2_TABLES } from './import-v2-contract.ts';
import { HISTORY_MAPPING_VERSION, isHistoryQuantity } from './history-storage-contract.ts';
import type { ImportSourceEvidence } from './history-storage-contract.ts';
import { stableImportId } from './inventory-cutoff-import.ts';
import { requestHash } from './request-hash.ts';

/** Smallest schema-11 staging slice: no headers, inferred dates, catalogue writes or publication. */
export const HISTORY_STAGING_CHUNK_LIMIT = 200;
export interface V3HistorySelectionBinding {
  baseManifestSha256: string; selectionSha256: string; approvalSha256: string;
  entity: 'TRANSFER_LINE'; source: 'BASE_V2'; path: 'business/17历史调拨明细.csv'; csvSha256: string;
}
export interface V3HistoryTransferInput {
  source: ImportSourceEvidence;
  /** Explicit verified bindings, never UUIDs inferred from legacy IDs. */
  header: { sourceKey: string; nativeId: string };
  sku: { sourceKey: string; nativeId: string };
}
export interface V3HistoryChunk {
  batchId: string; fixedSourceNamespace: string; selection: V3HistorySelectionBinding;
  rows: readonly V3HistoryTransferInput[];
}
export interface PreparedHistoryTransfer {
  source: ImportSourceEvidence;
  line: Record<string, string | number | null>;
  fingerprint: string;
}
export interface PreparedHistoryChunk {
  batchId: string; fixedSourceNamespace: string; mappingVersion: typeof HISTORY_MAPPING_VERSION;
  selection: V3HistorySelectionBinding; rows: readonly PreparedHistoryTransfer[];
}
export interface HistoryStagingStore {
  /** Atomic whole chunk; exact immutable replay succeeds, changed replay fails. No automatic retries. */
  stage(chunk: PreparedHistoryChunk): Promise<{ inserted: number; replayed: number }>;
}
const reject = (ok: unknown, code: string): void => { if (!ok) throw Error(code); };
const hash = (v: unknown): boolean => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = (v: unknown): boolean => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 65536 && !v.includes('\0');
export function prepareV3HistoryChunk(input: V3HistoryChunk): PreparedHistoryChunk {
  const chunk = structuredClone(input), b = chunk.selection;
  reject(uuid(chunk.batchId) && text(chunk.fixedSourceNamespace), 'HISTORY_STAGING_BATCH');
  reject(b && hash(b.baseManifestSha256) && hash(b.selectionSha256) && hash(b.approvalSha256) && hash(b.csvSha256)
    && b.entity === 'TRANSFER_LINE' && b.source === 'BASE_V2' && b.path === 'business/17历史调拨明细.csv', 'HISTORY_STAGING_SELECTION');
  reject(Array.isArray(chunk.rows) && chunk.rows.length > 0 && chunk.rows.length <= HISTORY_STAGING_CHUNK_LIMIT, 'HISTORY_STAGING_CHUNK_LIMIT');
  reject(new TextEncoder().encode(JSON.stringify(chunk)).byteLength <= 4 * 1024 * 1024, 'HISTORY_STAGING_BYTE_LIMIT');
  const columns = IMPORT_V2_TABLES.find(t => t.entity === 'TRANSFER_LINE')!.columns;
  const sourceIds = new Set<string>(), evidenceIds = new Set<string>(), positions = new Set<string>(), lineKeys = new Set<string>();
  const rows = chunk.rows.map(({source, header, sku}) => {
    reject(source && source.entityType === 'TRANSFER_LINE' && source.batchId === chunk.batchId && uuid(source.id)
      && text(source.sourceKey) && text(source.fileRef) && text(source.sheet) && typeof source.rowNo === 'string'
      && /^[1-9]\d*$/.test(source.rowNo) && BigInt(source.rowNo) <= 9223372036854775807n
      && hash(source.sourceFileSha256) && hash(source.rowSha256), 'HISTORY_STAGING_SOURCE');
    reject(source.rawFields && source.normalizedFields && source.fieldProvenance, 'HISTORY_STAGING_EVIDENCE');
    const n = source.normalizedFields, raw = source.rawFields, p = source.fieldProvenance;
    reject(Object.keys(n).length === columns.length && columns.every(c => Object.hasOwn(n,c.name) && typeof n[c.name] === 'string'
      && (n[c.name] as string).length <= 65536 && !(n[c.name] as string).includes('\0') && (!c.required || n[c.name] !== '')), 'HISTORY_STAGING_EXACT_COLUMNS');
    reject(columns.every(c => Object.hasOwn(raw,c.name) && typeof raw[c.name] === 'string'
      && (c.name === 'SKU来源编号' ? text(raw[c.name]) : raw[c.name] === n[c.name])), 'HISTORY_STAGING_RAW_FIELDS_CHANGED_OR_MISSING');
    reject(n['来源编号'] === source.sourceKey && raw['来源编号'] === source.sourceKey
      && raw['绑定范围'] !== 'PRODUCT' && n['绑定范围'] !== 'PRODUCT', 'HISTORY_STAGING_RAW_IDENTITY');
    reject(header && sku && uuid(header.nativeId) && uuid(sku.nativeId)
      && header.sourceKey === n['单据来源编号'] && sku.sourceKey === n['SKU来源编号'], 'HISTORY_STAGING_NATIVE_BINDINGS');
    reject(typeof n['原行号'] === 'string' && /^[1-9]\d*$/.test(n['原行号']) && BigInt(n['原行号']) <= 2147483647n
      && isHistoryQuantity(n['原数量']) && raw['原数量'] === n['原数量'], 'HISTORY_STAGING_QUANTITY_OR_LINE');
    const fields = p.fields;
    reject(p.schema_version === 1 && fields && typeof fields === 'object' && !Array.isArray(fields), 'HISTORY_STAGING_PROVENANCE');
    for (const field of Object.values(fields as Record<string, unknown>)) {
      const f = field as Record<string, unknown>;
      reject(f && ['ORIGINAL','MIGRATION_DERIVED','UNKNOWN'].includes(String(f.origin)) && typeof f.reason === 'string'
        && Object.hasOwn(f,'raw') && (f.origin !== 'MIGRATION_DERIVED' || text(f.evidence_ref)), 'HISTORY_STAGING_PROVENANCE');
    }
    const position = JSON.stringify([source.sourceFileSha256,source.sheet,source.rowNo]);
    const lineKey = JSON.stringify([header.nativeId,n['原行号']]);
    reject(!sourceIds.has(source.sourceKey) && !evidenceIds.has(source.id) && !positions.has(position) && !lineKeys.has(lineKey), 'HISTORY_STAGING_DUPLICATE');
    sourceIds.add(source.sourceKey); evidenceIds.add(source.id); positions.add(position); lineKeys.add(lineKey);
    const nullable = (key: string): string | null => n[key] === '' ? null : n[key] as string;
    const line = { id: stableImportId('history-transfer-line',chunk.fixedSourceNamespace,source.sourceKey), batch_id: chunk.batchId,
      source_row_id: source.id, header_id: header.nativeId, line_no: Number(n['原行号']), sku_id: sku.nativeId, quantity: n['原数量'] as string,
      product_code_snapshot: nullable('原款号'), product_name_snapshot: nullable('原品名'), color_name_snapshot: nullable('原颜色名称'),
      fit_name_snapshot: nullable('原版型名称'), size_name_snapshot: nullable('原完整尺码'), barcode_snapshot: nullable('原使用条码') };
    return { source, line, fingerprint: requestHash({ selection:b, source, line, headerSourceKey:header.sourceKey, skuSourceKey:sku.sourceKey }) };
  });
  return { batchId:chunk.batchId, fixedSourceNamespace:chunk.fixedSourceNamespace, mappingVersion:HISTORY_MAPPING_VERSION, selection:b, rows };
}
export async function stageV3HistoryChunk(input: V3HistoryChunk, options: {
  mode?: 'DRY_RUN' | 'STAGE'; store?: HistoryStagingStore;
  /** Must bind these exact rows to independently verified effective CSV + original snapshot and native targets.
   * A caller-supplied aggregate report or boolean is NOT sufficient authorization. */
  authorize?: (chunk: PreparedHistoryChunk) => Promise<void>;
} = {}): Promise<{ mode:'DRY_RUN'|'STAGE'; rows:number; inserted:number; replayed:number; published:false; importReady:false }> {
  const chunk = prepareV3HistoryChunk(input);
  if (options.mode === undefined || options.mode === 'DRY_RUN') return {mode:'DRY_RUN',rows:chunk.rows.length,inserted:0,replayed:0,published:false,importReady:false};
  reject(options.mode === 'STAGE' && options.store && options.authorize, 'HISTORY_STAGING_EXPLICIT_AUTHORIZATION_REQUIRED');
  await options.authorize!(structuredClone(chunk));
  const result = await options.store!.stage(chunk);
  return {mode:'STAGE',rows:chunk.rows.length,...result,published:false,importReady:false};
}

/** Revalidate prepared DTOs at the SQL boundary; callers cannot alter a target after validation. */
export function validatePreparedHistoryChunk(chunk: PreparedHistoryChunk): void {
  const expected = prepareV3HistoryChunk({ batchId:chunk.batchId, fixedSourceNamespace:chunk.fixedSourceNamespace, selection:chunk.selection,
    rows:chunk.rows.map(row => ({ source:row.source,
      header:{sourceKey:row.source.normalizedFields['单据来源编号'] as string,nativeId:row.line.header_id as string},
      sku:{sourceKey:row.source.normalizedFields['SKU来源编号'] as string,nativeId:row.line.sku_id as string} })) });
  reject(requestHash(expected) === requestHash(chunk), 'HISTORY_STAGING_PREPARED_CHANGED');
}
