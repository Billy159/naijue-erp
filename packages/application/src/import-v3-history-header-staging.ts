import { prepareV3HistoryHeader } from './import-v3-history-header.ts';
import type { HistoryHeaderInput, PreparedHistoryHeader, HistoryHeaderSelection } from './import-v3-history-header.ts';
import { HISTORY_MAPPING_VERSION, isExactHistoryMoney } from './history-storage-contract.ts';
import { requestHash } from './request-hash.ts';

export const HISTORY_HEADER_STAGING_CHUNK_LIMIT = 100;
export interface PreparedHistoryHeaderRow {
  /** Retained original mapper inputs let the SQL boundary independently rederive every typed field. */
  input: HistoryHeaderInput;
  prepared: PreparedHistoryHeader;
}
export interface PreparedHistoryHeaderChunk {
  batchId: string; fixedSourceNamespace: string; mappingVersion: typeof HISTORY_MAPPING_VERSION;
  selection: HistoryHeaderSelection; rows: readonly PreparedHistoryHeaderRow[];
}
export interface HistoryHeaderStagingStore {
  /** Whole bounded chunk is atomic; exact immutable replay only. Never retries or publishes. */
  stage(chunk: PreparedHistoryHeaderChunk): Promise<{inserted:number; replayed:number}>;
}
const require = (ok: unknown, code: string): void => { if (!ok) throw Error(code); };
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !v.includes('\0');

export function prepareV3HistoryHeaderChunk(inputs: readonly HistoryHeaderInput[]): PreparedHistoryHeaderChunk {
  require(Array.isArray(inputs) && inputs.length > 0 && inputs.length <= HISTORY_HEADER_STAGING_CHUNK_LIMIT, 'HISTORY_HEADER_STAGING_CHUNK_LIMIT');
  const cloned = structuredClone(inputs), first = cloned[0]!;
  // Include approval Map entries in the UTF-8 budget; JSON.stringify(Map) alone would hide them.
  const budget = JSON.stringify(cloned, (_key, value: unknown) => value instanceof Map ? [...value.entries()] : value);
  require(new TextEncoder().encode(budget).byteLength <= 4 * 1024 * 1024, 'HISTORY_HEADER_STAGING_BYTE_LIMIT');
  const identities = new Set<string>(), ids = new Set<string>(), positions = new Set<string>(), headers = new Set<string>();
  const rows = cloned.map(input => {
    require(input.batchId === first.batchId && input.fixedSourceNamespace === first.fixedSourceNamespace
      && input.selection.selectionSha256 === first.selection.selectionSha256
      && input.selection.baseManifestSha256 === first.selection.baseManifestSha256
      && requestHash(input.selection) === requestHash(first.selection), 'HISTORY_HEADER_STAGING_MIXED_BATCH');
    const prepared = prepareV3HistoryHeader(input), s = prepared.source;
    require(text(s.sourceKey) && text(input.fixedSourceNamespace), 'HISTORY_HEADER_STAGING_SOURCE');
    const fields = prepared.fieldProvenance.fields as Record<string, unknown>;
    for (const value of Object.values(fields)) {
      const field = value as Record<string, unknown>;
      require(field && ['ORIGINAL','MIGRATION_DERIVED','UNKNOWN'].includes(String(field.origin))
        && typeof field.reason === 'string' && Object.hasOwn(field,'raw')
        && (field.origin !== 'MIGRATION_DERIVED' || text(field.evidence_ref)), 'HISTORY_HEADER_STAGING_PROVENANCE');
    }
    if ('grossAmount' in prepared.header) require([prepared.header.grossAmount,prepared.header.orderDiscount,prepared.header.netDue].every(isExactHistoryMoney), 'HISTORY_HEADER_STAGING_MONEY_RANGE');
    const identity = JSON.stringify([prepared.entity,s.sourceKey]), position = JSON.stringify([s.sourceFileSha256,s.sheet,s.rowNo]);
    require(!identities.has(identity) && !ids.has(s.id) && !positions.has(position) && !headers.has(prepared.header.id), 'HISTORY_HEADER_STAGING_DUPLICATE');
    identities.add(identity); ids.add(s.id); positions.add(position); headers.add(prepared.header.id);
    return {input,prepared};
  });
  return {batchId:first.batchId,fixedSourceNamespace:first.fixedSourceNamespace,mappingVersion:HISTORY_MAPPING_VERSION,selection:structuredClone(first.selection),rows};
}

/** Recompute from original inputs, including exact-cell money/temporal/creator-hall evidence. */
export function validatePreparedHistoryHeaderChunk(chunk: PreparedHistoryHeaderChunk): void {
  const expected = prepareV3HistoryHeaderChunk(chunk.rows.map(row => row.input));
  require(chunk.batchId === expected.batchId && chunk.fixedSourceNamespace === expected.fixedSourceNamespace
    && chunk.mappingVersion === expected.mappingVersion && requestHash(chunk.selection) === requestHash(expected.selection)
    && requestHash(chunk.rows.map(row => row.prepared)) === requestHash(expected.rows.map(row => row.prepared)), 'HISTORY_HEADER_STAGING_PREPARED_CHANGED');
}

export async function stageV3HistoryHeaders(inputs: readonly HistoryHeaderInput[], options: {
  mode?: 'DRY_RUN'|'STAGE'; store?: HistoryHeaderStagingStore;
  /** Must authenticate exact selected rows, original evidence, overlays and same-batch native bindings. */
  authorize?: (chunk: PreparedHistoryHeaderChunk) => Promise<void>;
} = {}): Promise<{mode:'DRY_RUN'|'STAGE'; rows:number; inserted:number; replayed:number; published:false; importReady:false}> {
  const chunk = prepareV3HistoryHeaderChunk(inputs);
  if (options.mode === undefined || options.mode === 'DRY_RUN') return {mode:'DRY_RUN',rows:chunk.rows.length,inserted:0,replayed:0,published:false,importReady:false};
  require(options.mode === 'STAGE' && options.store && options.authorize, 'HISTORY_HEADER_STAGING_EXPLICIT_AUTHORIZATION_REQUIRED');
  await options.authorize!(structuredClone(chunk));
  const result = await options.store!.stage(chunk);
  return {mode:'STAGE',rows:chunk.rows.length,...result,published:false,importReady:false};
}
