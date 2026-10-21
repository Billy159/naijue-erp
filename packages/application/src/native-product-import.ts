import { requireDomain } from "../../domain/src/errors.ts";
import { entityId, version } from "../../domain/src/values.ts";
import type { CompleteCataloguePrices } from "./catalogue-price-input.ts";
import { createCatalogueSourcePriceProof, CATALOGUE_SOURCE_PRICE_FIELDS } from "./catalogue-source-proof.ts";
import { HISTORY_MAPPING_VERSION } from "./history-storage-contract.ts";
import { IMPORT_V2_TABLES } from "./import-v2-contract.ts";
import { prepareProductEvidenceChunk } from "./product-evidence-staging.ts";
import type { ProductEvidenceChunk, ProductEvidenceRow } from "./product-evidence-staging.ts";
import { requestHash } from "./request-hash.ts";

export const NATIVE_PRODUCT_IMPORT_VERSION = "NATIVE_PRODUCT_IMPORT_V1";
/** An explicit reviewed historical blank policy, NOT a change to live CREATE. */
export const NATIVE_PRODUCT_NULLABLE_POLICY = "EXACT_BLANK_IS_HISTORICAL_NULL_V1";
interface NamedReference {
  readonly sourceValue: string; readonly nativeId: string; readonly code: string; readonly name: string;
  /** Digest of the independently reviewed source-to-native mapping, not a grant. */
  readonly mappingSha256: string;
}
export interface NativeProductReferences {
  readonly category: { readonly sourceValue: string; readonly mappingSha256: string;
    /** Exact root-to-leaf chain. Never parse an undocumented path separator. */
    readonly path: readonly { readonly nativeId: string; readonly name: string; readonly expectedVersion: number }[] };
  readonly sizeGroup: NamedReference;
  readonly season: NamedReference | null;
  readonly supplier: (NamedReference & { readonly expectedVersion: number; readonly enabled: boolean }) | null;
}
export interface NativeProductImportRow extends ProductEvidenceRow {
  readonly nullableFieldPolicy: typeof NATIVE_PRODUCT_NULLABLE_POLICY;
  readonly references: NativeProductReferences;
}
export interface NativeProductImportChunk extends Omit<ProductEvidenceChunk, "rows"> {
  readonly rows: readonly NativeProductImportRow[];
}
export interface NativeProductImportValues extends CompleteCataloguePrices {
  readonly id: string; readonly product_code: string; readonly name: string;
  readonly category_id: string; readonly supplier_id: string | null; readonly season_id: string | null; readonly size_group_id: string;
  readonly year: number | null; readonly system_item_code: string | null; readonly thickness: string | null; readonly collar_pants_type: string | null;
  readonly enabled: boolean; readonly version: 1;
}
export interface PreparedNativeProductImportChunk extends NativeProductImportChunk {
  readonly mappingVersion: typeof HISTORY_MAPPING_VERSION; readonly fingerprint: string;
  readonly nativeProducts: readonly NativeProductImportValues[];
}
export interface NativeProductImportStore {
  /** Whole bounded chunk, native rows plus immutable source/proof in one transaction. */
  stage(chunk: PreparedNativeProductImportChunk): Promise<{ inserted: number; replayed: number }>;
}
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 65536 && !value.includes("\0");
const hash = (value: unknown): boolean => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function namedReference(value: NamedReference | null, sourceValue: unknown, kind: "sizeGroup" | "season" | "supplier"): void {
  if (sourceValue === "") {
    requireDomain(value === null, "NATIVE_PRODUCT_REFERENCE", "Blank optional source reference must remain explicitly null"); return;
  }
  requireDomain(value && text(sourceValue) && value.sourceValue === sourceValue && text(value.code) && text(value.name) && hash(value.mappingSha256),
    "NATIVE_PRODUCT_REFERENCE", "Explicit reviewed source/native reference mapping required");
  entityId(kind, value.nativeId);
}
export function prepareNativeProductImportChunk(input: NativeProductImportChunk): PreparedNativeProductImportChunk {
  const chunk = structuredClone(input);
  // Reuse exact selection/source identity, all-nine price and bounded chunk gates.
  prepareProductEvidenceChunk(chunk);
  const columns = IMPORT_V2_TABLES.find(table => table.entity === "PRODUCT")!.columns;
  const priceFields = new Set<string>(Object.values(CATALOGUE_SOURCE_PRICE_FIELDS));
  const codes = new Set<string>();
  const nativeProducts = chunk.rows.map(row => {
    const { source: s, product: binding, references: refs } = row, n = s.normalizedFields, raw = s.rawFields;
    requireDomain(binding.expectedVersion === 1 && binding.nativeId !== s.sourceKey && row.nullableFieldPolicy === NATIVE_PRODUCT_NULLABLE_POLICY,
      "NATIVE_PRODUCT_CREATION_CONTRACT", "New native version 1, independent explicit ID and historical nullable policy required");
    const fields = s.fieldProvenance.fields as Record<string, unknown>;
    requireDomain(!Object.hasOwn(fields, "native_product_import"), "NATIVE_PRODUCT_PROVENANCE", "Unaugmented original field provenance required");
    for (const column of columns) {
      // Non-price corrections require a new versioned transformation contract.
      requireDomain(Object.hasOwn(raw, column.name) && (priceFields.has(column.name) || raw[column.name] === n[column.name]),
        "NATIVE_PRODUCT_SOURCE_TRANSFORMATION_UNSUPPORTED", "Missing or changed native product source field cannot be invented");
      const field = fields[column.name] as Record<string, unknown> | undefined;
      requireDomain(field && Object.hasOwn(field, "raw") && requestHash(field.raw) === requestHash(raw[column.name])
        && (field.origin !== "UNKNOWN" || (!column.required && !priceFields.has(column.name) && n[column.name] === "")),
      "NATIVE_PRODUCT_PROVENANCE", "Each native field needs exact raw provenance; unknown required values are rejected");
      if (!priceFields.has(column.name) && n[column.name] !== "") requireDomain(text(n[column.name]), "NATIVE_PRODUCT_SOURCE_VALUE", "Whitespace is unknown, not an empty historical field");
    }
    requireDomain(refs && refs.category && refs.sizeGroup && Object.hasOwn(refs, "supplier") && Object.hasOwn(refs, "season"),
      "NATIVE_PRODUCT_REFERENCE", "All native reference decisions must be explicit");
    const category = refs.category;
    requireDomain(category.sourceValue === n["分类路径"] && hash(category.mappingSha256) && Array.isArray(category.path)
      && category.path.length > 0 && category.path.length <= 2, "NATIVE_PRODUCT_REFERENCE", "Reviewed full category path must obey the existing two-level catalogue contract");
    const categoryIds = new Set<string>();
    for (const part of category.path) {
      entityId("category", part.nativeId); version(part.expectedVersion);
      requireDomain(text(part.name) && part.expectedVersion <= 2147483647 && !categoryIds.has(part.nativeId),
        "NATIVE_PRODUCT_REFERENCE", "Exact acyclic native category path required"); categoryIds.add(part.nativeId);
    }
    namedReference(refs.sizeGroup, n["尺码组"], "sizeGroup"); namedReference(refs.season, n["季节"], "season"); namedReference(refs.supplier, n["供应商来源编号"], "supplier");
    if (refs.supplier !== null) {
      version(refs.supplier.expectedVersion);
      requireDomain(refs.supplier.expectedVersion <= 2147483647 && typeof refs.supplier.enabled === "boolean",
        "NATIVE_PRODUCT_REFERENCE", "Exact current supplier snapshot required");
    }
    const year = n["年份"];
    requireDomain(year === "" || (typeof year === "string" && /^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(year)
      && BigInt(year) >= -2147483648n && BigInt(year) <= 2147483647n), "NATIVE_PRODUCT_YEAR", "Exact PostgreSQL integer year or confirmed historical blank required");
    requireDomain(n["状态"] === "正常" || n["状态"] === "停用", "NATIVE_PRODUCT_STATUS", "Exact reviewed PRODUCT state required");
    requireDomain(!codes.has(n["款号"] as string), "NATIVE_PRODUCT_DUPLICATE_CODE", "Product codes must be unique within a chunk"); codes.add(n["款号"] as string);
    const nullable = (key: string): string | null => n[key] === "" ? null : n[key] as string;
    const prices = createCatalogueSourcePriceProof({ nativeProductId: binding.nativeId, productVersion: 1, rawFields: raw, blankPricePolicy: row.blankPricePolicy }).product_input_proof.prices;
    return { id: binding.nativeId, product_code: n["款号"] as string, name: n["商品名称"] as string,
      category_id: category.path.at(-1)!.nativeId, supplier_id: refs.supplier?.nativeId ?? null, season_id: refs.season?.nativeId ?? null,
      size_group_id: refs.sizeGroup.nativeId, year: year === "" ? null : Number(year), system_item_code: nullable("系统货号"),
      thickness: nullable("厚薄"), collar_pants_type: nullable("领型或裤型"), enabled: n["状态"] === "正常", version: 1 as const, ...prices };
  });
  return { ...chunk, mappingVersion: HISTORY_MAPPING_VERSION, nativeProducts, fingerprint: requestHash(chunk) };
}
/** Revalidate derived values too; a prepared DTO is not authority to edit targets. */
export function validatePreparedNativeProductImportChunk(chunk: PreparedNativeProductImportChunk): void {
  const { mappingVersion: _mapping, fingerprint: _fingerprint, nativeProducts: _products, ...input } = chunk;
  requireDomain(requestHash(prepareNativeProductImportChunk(input)) === requestHash(chunk), "NATIVE_PRODUCT_PREPARED_CHANGED", "Prepared native product import changed");
}
/** Deterministic immutable metadata shared by first insert and exact replay. */
export function nativeProductImportEvidence(chunk: PreparedNativeProductImportChunk, index: number) {
  const row = chunk.rows[index]!, s = row.source;
  const proof = createCatalogueSourcePriceProof({ nativeProductId: row.product.nativeId, productVersion: 1, rawFields: s.rawFields, blankPricePolicy: row.blankPricePolicy });
  const fields = { ...(s.fieldProvenance.fields as Record<string, unknown>), native_product_import: {
    origin: "MIGRATION_DERIVED", reason: "Reviewed explicit native product creation and source binding", raw: null,
    evidence_ref: chunk.selection.selectionSha256, validator_version: NATIVE_PRODUCT_IMPORT_VERSION, selection: chunk.selection,
    row_fingerprint: requestHash({ selection: chunk.selection, row }), native_product: chunk.nativeProducts[index]!,
    nullable_field_policy: row.nullableFieldPolicy, references: row.references
  } };
  return { fields, source: { id: s.id, batch_id: s.batchId, entity_type: "PRODUCT", source_key: s.sourceKey, file_ref: s.fileRef,
    sheet: s.sheet, row_no: s.rowNo, source_file_sha256: s.sourceFileSha256, row_sha256: s.rowSha256,
    raw_fields: s.rawFields, normalized_fields: s.normalizedFields, field_provenance: { schema_version: 1, fields, ...proof } } };
}
export async function stageNativeProductImportChunk(input: NativeProductImportChunk, options: {
  readonly mode?: "DRY_RUN" | "STAGE"; readonly store?: NativeProductImportStore;
  /** Independently verify exact effective/original bytes, every row and every reference mapping. */
  readonly authorize?: (chunk: PreparedNativeProductImportChunk) => Promise<void>;
} = {}): Promise<{ mode: "DRY_RUN" | "STAGE"; rows: number; inserted: number; replayed: number; published: false; importReady: false }> {
  const chunk = prepareNativeProductImportChunk(input);
  if (options.mode === undefined || options.mode === "DRY_RUN") return { mode: "DRY_RUN", rows: chunk.rows.length, inserted: 0, replayed: 0, published: false, importReady: false };
  requireDomain(options.mode === "STAGE" && options.store && options.authorize, "NATIVE_PRODUCT_AUTHORIZATION_REQUIRED", "Exact source and native mapping authorization required");
  await options.authorize(structuredClone(chunk));
  return { mode: "STAGE", rows: chunk.rows.length, ...await options.store.stage(chunk), published: false, importReady: false };
}
