import { requireDomain } from "../../domain/src/errors.ts";
import { entityId, version } from "../../domain/src/values.ts";
import { IMPORT_V2_TABLES } from "./import-v2-contract.ts";
import { HISTORY_MAPPING_VERSION } from "./history-storage-contract.ts";
import type { ImportSourceEvidence } from "./history-storage-contract.ts";
import { createCatalogueSourcePriceProof } from "./catalogue-source-proof.ts";
import type { CatalogueBlankPricePolicy } from "./catalogue-source-proof.ts";
import { requestHash } from "./request-hash.ts";
export const PRODUCT_EVIDENCE_CHUNK_LIMIT = 200;
export interface ProductEvidenceSelection {
  readonly baseManifestSha256: string; readonly selectionSha256: string; readonly approvalSha256: string;
  readonly entity: "PRODUCT"; readonly source: "BASE_V2"; readonly path: "business/01商品.csv"; readonly csvSha256: string;
}
export interface ProductEvidenceRow {
  readonly source: ImportSourceEvidence;
  /** Independently verified explicit native identity; never derived from source key. */
  readonly product: { readonly sourceKey: string; readonly nativeId: string; readonly expectedVersion: number };
  readonly blankPricePolicy: CatalogueBlankPricePolicy;
}
export interface ProductEvidenceChunk {
  readonly batchId: string; readonly fixedSourceNamespace: string; readonly selection: ProductEvidenceSelection;
  readonly rows: readonly ProductEvidenceRow[];
}
export interface PreparedProductEvidenceChunk extends ProductEvidenceChunk {
  readonly mappingVersion: typeof HISTORY_MAPPING_VERSION; readonly fingerprint: string;
}
export interface ProductEvidenceStagingStore {
  stage(chunk: PreparedProductEvidenceChunk): Promise<{ inserted: number; replayed: number }>;
}
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 65536 && !value.includes("\0");
const hash = (value: unknown): boolean => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function prepareProductEvidenceChunk(input: ProductEvidenceChunk): PreparedProductEvidenceChunk {
  const chunk = structuredClone(input); entityId("product", chunk.batchId);
  const selection = chunk.selection;
  requireDomain(text(chunk.fixedSourceNamespace) && selection && selection.entity === "PRODUCT" && selection.source === "BASE_V2"
    && selection.path === "business/01商品.csv" && [selection.baseManifestSha256, selection.selectionSha256, selection.approvalSha256, selection.csvSha256].every(hash),
  "PRODUCT_STAGE_SELECTION", "Exact effective PRODUCT file selection required");
  requireDomain(Array.isArray(chunk.rows) && chunk.rows.length > 0 && chunk.rows.length <= PRODUCT_EVIDENCE_CHUNK_LIMIT
    && new TextEncoder().encode(JSON.stringify(chunk)).byteLength <= 4 * 1024 * 1024, "PRODUCT_STAGE_LIMIT", "Bounded product evidence chunk required");
  const columns = IMPORT_V2_TABLES.find(row => row.entity === "PRODUCT")!.columns;
  const ids = new Set<string>(), keys = new Set<string>(), targets = new Set<string>(), positions = new Set<string>();
  for (const row of chunk.rows) {
    const s = row.source, p = row.product;
    requireDomain(s && p && s.entityType === "PRODUCT" && s.batchId === chunk.batchId && text(s.sourceKey) && text(s.fileRef) && text(s.sheet)
      && typeof s.rowNo === "string" && /^[1-9]\d*$/.test(s.rowNo) && s.rowNo.length <= 19 && BigInt(s.rowNo) <= 9223372036854775807n
      && hash(s.sourceFileSha256) && hash(s.rowSha256), "PRODUCT_STAGE_SOURCE", "Exact original source identity required");
    entityId("product", s.id); entityId("product", p.nativeId); version(p.expectedVersion);
    requireDomain(p.expectedVersion <= 2147483647 && p.sourceKey === s.sourceKey, "PRODUCT_STAGE_BINDING", "Explicit source/native binding and version required");
    const n = s.normalizedFields, raw = s.rawFields, provenance = s.fieldProvenance;
    requireDomain(n && raw && provenance && Object.keys(n).length === columns.length && columns.every(column => Object.hasOwn(n, column.name)
      && typeof n[column.name] === "string" && (n[column.name] as string).length <= 65536 && !(n[column.name] as string).includes("\0")
      && (!column.required || n[column.name] !== "")), "PRODUCT_STAGE_COLUMNS", "Exact PRODUCT normalized columns required");
    requireDomain(n["来源编号"] === s.sourceKey && Object.hasOwn(raw, "来源编号") && raw["来源编号"] === s.sourceKey
      && raw["款号"] === n["款号"] && raw["商品名称"] === n["商品名称"] && raw["绑定范围"] !== "PRODUCT" && n["绑定范围"] !== "PRODUCT",
    "PRODUCT_STAGE_BINDING", "Original source identity and native product labels must be preserved");
    requireDomain(provenance.schema_version === 1 && provenance.fields && typeof provenance.fields === "object" && !Array.isArray(provenance.fields)
      && !Object.hasOwn(provenance.fields, "product_staging")
      && Object.keys(provenance).every(key => key === "schema_version" || key === "fields"), "PRODUCT_STAGE_PROVENANCE", "Only unaugmented source field provenance accepted");
    for (const value of Object.values(provenance.fields)) {
      requireDomain(value !== null && typeof value === "object" && !Array.isArray(value), "PRODUCT_STAGE_PROVENANCE", "Field provenance must be an object");
      const field = value as Record<string, unknown>;
      requireDomain( ["ORIGINAL", "MIGRATION_DERIVED", "UNKNOWN"].includes(String(field.origin))
        && typeof field.reason === "string" && Object.hasOwn(field, "raw") && (field.origin !== "MIGRATION_DERIVED" || text(field.evidence_ref)),
      "PRODUCT_STAGE_PROVENANCE", "Versioned per-field provenance required");
    }
    const original = createCatalogueSourcePriceProof({ nativeProductId: p.nativeId, productVersion: p.expectedVersion, rawFields: raw, blankPricePolicy: row.blankPricePolicy });
    const normalized = createCatalogueSourcePriceProof({ nativeProductId: p.nativeId, productVersion: p.expectedVersion, rawFields: n, blankPricePolicy: row.blankPricePolicy });
    requireDomain(requestHash(original) === requestHash(normalized), "PRODUCT_STAGE_PRICE_TRANSFORMATION_UNSUPPORTED",
      "Changed source prices require a separately versioned approved-correction proof; never relabel them as original values");
    const position = JSON.stringify([s.sourceFileSha256, s.sheet, s.rowNo]);
    requireDomain(!ids.has(s.id) && !keys.has(s.sourceKey) && !targets.has(p.nativeId) && !positions.has(position), "PRODUCT_STAGE_DUPLICATE", "Repeated source/native product target in chunk");
    ids.add(s.id); keys.add(s.sourceKey); targets.add(p.nativeId); positions.add(position);
  }
  return { ...chunk, mappingVersion: HISTORY_MAPPING_VERSION, fingerprint: requestHash(chunk) };
}
export function validatePreparedProductEvidenceChunk(chunk: PreparedProductEvidenceChunk): void {
  const { mappingVersion, fingerprint, ...input } = chunk;
  const expected = prepareProductEvidenceChunk(input);
  requireDomain(mappingVersion === expected.mappingVersion && fingerprint === expected.fingerprint, "PRODUCT_STAGE_CHANGED", "Prepared product evidence changed");
}
/** Default is genuinely connection-free. Authorization must independently bind
 * exact source bytes/selection and native targets, not accept an aggregate flag. */
export async function stageProductEvidenceChunk(input: ProductEvidenceChunk, options: {
  readonly mode?: "DRY_RUN" | "STAGE"; readonly store?: ProductEvidenceStagingStore;
  readonly authorize?: (chunk: PreparedProductEvidenceChunk) => Promise<void>;
} = {}): Promise<{ mode: "DRY_RUN" | "STAGE"; rows: number; inserted: number; replayed: number; published: false; importReady: false }> {
  const chunk = prepareProductEvidenceChunk(input);
  if (options.mode === undefined || options.mode === "DRY_RUN") return { mode: "DRY_RUN", rows: chunk.rows.length, inserted: 0, replayed: 0, published: false, importReady: false };
  requireDomain(options.mode === "STAGE" && options.store && options.authorize, "PRODUCT_STAGE_AUTHORIZATION_REQUIRED", "Explicit exact-source staging authority required");
  await options.authorize(structuredClone(chunk));
  const result = await options.store.stage(chunk);
  return { mode: "STAGE", rows: chunk.rows.length, ...result, published: false, importReady: false };
}
