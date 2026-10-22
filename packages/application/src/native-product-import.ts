import { requireDomain } from "../../domain/src/errors.ts";
import { entityId, version } from "../../domain/src/values.ts";
import type { CompleteCataloguePrices } from "./catalogue-price-input.ts";
import { createCatalogueSourcePriceProof, CATALOGUE_SOURCE_PRICE_FIELDS } from "./catalogue-source-proof.ts";
import { HISTORY_MAPPING_VERSION } from "./history-storage-contract.ts";
import { IMPORT_V2_TABLES } from "./import-v2-contract.ts";
import { prepareProductEvidenceChunk } from "./product-evidence-staging.ts";
import type { ProductEvidenceChunk, ProductEvidenceRow } from "./product-evidence-staging.ts";
import { requestHash } from "./request-hash.ts";
import { historySettlementRequestHash } from "./import-v3-history-settlement.ts";

export const NATIVE_PRODUCT_IMPORT_VERSION = "NATIVE_PRODUCT_IMPORT_V1";
export const NATIVE_PRODUCT_IMPORT_VERSION_26 = "NATIVE_PRODUCT_IMPORT_V2_EXACT26";
export const NATIVE_PRODUCT_REFERENCE_DECISION_VERSION_26 = "NATIVE_PRODUCT_REFERENCE_DECISIONS_V2_EXACT26";
export const NATIVE_PRODUCT_REFERENCE_DECISION_VERSION = "NATIVE_PRODUCT_REFERENCE_DECISIONS_V1";
/** Only the two PRODUCT rows affected by the already approved four-product
 * pants branch. Raw source cells/identity remain unchanged; this proof grants
 * nothing until the composite authorizer checks independently pinned rule bytes. */
export const NATIVE_PRODUCT_SIZE_GROUP_OVERRIDE_VERSION = "NATIVE_PRODUCT_EXACT_SIZE_GROUP_OVERRIDE_V1";
export interface NativeProductSizeGroupOverride {
  readonly version: typeof NATIVE_PRODUCT_SIZE_GROUP_OVERRIDE_VERSION;
  readonly field: "尺码组"; readonly mappingSha256: string;
}
const SIZE_GROUP_OVERRIDE_SOURCE_ROWS: Readonly<Record<string, readonly [string, string]>> = {
  "ce3871bc-1ddb-533a-a164-f4cd8bd3bf1a": ["501XK5399665", "739"],
  "53641e19-578b-5f6e-9000-0d3a8201a017": ["501XK5399666", "740"]
};
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
  readonly sourceTransformation?: NativeProductSizeGroupOverride;
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
export interface NativeProductSeasonSelection {
  readonly version: "NATIVE_PRODUCT_SEASON_SELECTION_V1"; readonly mapping_sha256: string;
  readonly source_key: string; readonly source_season: string; readonly state: "UNKNOWN" | "KNOWN";
  readonly season_ids: readonly string[] | null;
  readonly references: readonly { readonly sourceKey: string; readonly nativeId: string;
    readonly nativeSnapshot: { readonly id: string; readonly code: string; readonly name: string; readonly display_order: number } }[];
}
export interface NativeProductLegacyScalarCreation {
  readonly state: "LEGACY_SINGLE_SLOT_NOT_APPLICABLE_TO_CONFIRMED_MULTI_SELECTION";
  readonly value: null; readonly appliesOnlyTo: "FRESH_NATIVE_PRODUCT_IN_NEW_DATABASE"; readonly originalSeason: string;
}
export interface NativeProductImportRow26 extends NativeProductImportRow {
  readonly seasonSelection: NativeProductSeasonSelection;
  readonly legacyScalarCreation?: NativeProductLegacyScalarCreation;
}
/** A pure prepared-data discriminator, never a D1 runtime capability. */
export interface NativeProductImportChunk26 extends Omit<NativeProductImportChunk, "rows"> {
  readonly schemaProfile: "EXACT26"; readonly validatorVersion: typeof NATIVE_PRODUCT_IMPORT_VERSION_26;
  readonly rows: readonly NativeProductImportRow26[];
}
export interface NativeProductImportValues26 extends NativeProductImportValues {
  readonly season_ids: readonly string[] | null; readonly deleted_at: null; readonly default_barcode_scheme_id: null;
}
export interface PreparedNativeProductImportChunk26 extends NativeProductImportChunk26 {
  readonly mappingVersion: typeof HISTORY_MAPPING_VERSION; readonly fingerprint: string;
  readonly nativeProducts: readonly NativeProductImportValues26[];
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
  requireDomain(!Object.hasOwn(input, "schemaProfile") && !Object.hasOwn(input, "validatorVersion")
    && !input.rows.some(row => Object.hasOwn(row, "seasonSelection") || Object.hasOwn(row, "legacyScalarCreation")),
  "NATIVE_PRODUCT_SUCCESSOR_REQUIRES_EXPLICIT_PREPARE", "Successor season evidence requires its explicit versioned preparer");
  return prepareNativeProductCore(input);
}
function prepareNativeProductCore(input: NativeProductImportChunk, multipleSeasonKeys: ReadonlySet<string> = new Set()): PreparedNativeProductImportChunk {
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
    const transformation = row.sourceTransformation, approvedRow = SIZE_GROUP_OVERRIDE_SOURCE_ROWS[s.sourceKey];
    if (Object.hasOwn(row, "sourceTransformation")) requireDomain(transformation && Object.keys(transformation).length === 3
      && transformation.version === NATIVE_PRODUCT_SIZE_GROUP_OVERRIDE_VERSION && transformation.field === "尺码组" && hash(transformation.mappingSha256)
      && approvedRow && s.sourceFileSha256 === "652c21df52c56d362b11e48bcd1684a690a85a215ee2e2c6a390506d89c474bf"
      && s.sheet === "01商品" && s.rowNo === approvedRow[1] && raw["款号"] === approvedRow[0]
      && raw["尺码组"] === "男装裤子尺码" && n["尺码组"] === "男装上衣尺码", "NATIVE_PRODUCT_SIZE_GROUP_OVERRIDE", "Exact approved two source rows and separately pinned size rule required");
    for (const column of columns) {
      // All other non-price source transformations remain closed.
      requireDomain(Object.hasOwn(raw, column.name) && (priceFields.has(column.name) || raw[column.name] === n[column.name] || (column.name === "尺码组" && transformation !== undefined)),
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
    namedReference(refs.sizeGroup, n["尺码组"], "sizeGroup");
    if (multipleSeasonKeys.has(s.sourceKey)) requireDomain(refs.season === null, "NATIVE_PRODUCT_LEGACY_SCALAR", "Confirmed multiple seasons have no legacy scalar slot");
    else namedReference(refs.season, n["季节"], "season");
    namedReference(refs.supplier, n["供应商来源编号"], "supplier");
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
const exactKeys = (value: object, keys: readonly string[]): boolean => Reflect.ownKeys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
/** Pure source-26 preparation. All original field/price/identity/category/size
 * checks remain shared. No legacy preparer/store accepts this result. */
export function prepareNativeProductImportChunk26(input: NativeProductImportChunk26): PreparedNativeProductImportChunk26 {
  historySettlementRequestHash(input); const chunk = structuredClone(input);
  requireDomain(exactKeys(chunk, ["schemaProfile", "validatorVersion", "batchId", "fixedSourceNamespace", "selection", "rows"])
    && chunk.schemaProfile === "EXACT26" && chunk.validatorVersion === NATIVE_PRODUCT_IMPORT_VERSION_26 && Array.isArray(chunk.rows),
  "NATIVE_PRODUCT_SUCCESSOR_PROFILE", "Explicit exact26 prepared-data contract required");
  const multiple = new Set<string>();
  const names = ["春", "夏", "秋", "冬"], codes = ["SEASON_SPRING", "SEASON_SUMMER", "SEASON_AUTUMN", "SEASON_WINTER"];
  const choices = new Map<string, readonly string[] | null>([["", null], ...names.map(n => [n, [n]] as const), ["春、夏", ["春", "夏"]], ["秋、冬", ["秋", "冬"]]]);
  for (const row of chunk.rows) {
    requireDomain(exactKeys(row, ["source", "product", "blankPricePolicy", "nullableFieldPolicy", "references", "seasonSelection",
      ...(Object.hasOwn(row, "sourceTransformation") ? ["sourceTransformation"] : []), ...(Object.hasOwn(row, "legacyScalarCreation") ? ["legacyScalarCreation"] : [])]),
    "NATIVE_PRODUCT_SUCCESSOR_ROW", "Exact successor row fields required");
    const s = row.source, proof = row.seasonSelection, raw = s.rawFields["季节"];
    requireDomain(typeof raw === "string" && choices.has(raw) && s.normalizedFields["季节"] === raw && proof
      && exactKeys(proof, ["version", "mapping_sha256", "source_key", "source_season", "state", "season_ids", "references"])
      && proof.version === "NATIVE_PRODUCT_SEASON_SELECTION_V1" && hash(proof.mapping_sha256) && proof.source_key === s.sourceKey
      && proof.mapping_sha256 === chunk.rows[0]!.seasonSelection.mapping_sha256
      && proof.source_season === raw && Array.isArray(proof.references), "NATIVE_PRODUCT_SEASON_PROOF", "Exact original season and independently authorized mapping descriptor required");
    const expected = choices.get(raw as string)!;
    if (expected === null) {
      requireDomain(proof.state === "UNKNOWN" && proof.season_ids === null && proof.references.length === 0 && row.references.season === null
        && !Object.hasOwn(row, "legacyScalarCreation"), "NATIVE_PRODUCT_SEASON_UNKNOWN", "Original blank remains unknown, never explicit empty");
      continue;
    }
    requireDomain(proof.state === "KNOWN" && Array.isArray(proof.season_ids) && proof.season_ids.length === expected.length
      && proof.references.length === expected.length, "NATIVE_PRODUCT_SEASON_MEMBERS", "All exact atomic members required");
    const selectedNames = new Set<string>();
    for (let i = 0; i < proof.references.length; i++) {
      const ref = proof.references[i]!, native = ref.nativeSnapshot, nativeId = proof.season_ids![i]!;
      entityId("season", nativeId);
      requireDomain(exactKeys(ref, ["sourceKey", "nativeId", "nativeSnapshot"]) && native
        && exactKeys(native, ["id", "code", "name", "display_order"]) && ref.nativeId === nativeId && native.id === nativeId
        && ref.sourceKey === native.name && expected.includes(native.name) && !selectedNames.has(native.name)
        && native.display_order === names.indexOf(native.name) && native.code === codes[native.display_order]
        && (i === 0 || proof.season_ids![i - 1]! < nativeId), "NATIVE_PRODUCT_SEASON_MEMBERS", "Canonical unique UUID order and complete atomic season snapshots required");
      selectedNames.add(native.name);
    }
    if (expected.length > 1) {
      const legacy = row.legacyScalarCreation;
      requireDomain(row.references.season === null && legacy && exactKeys(legacy, ["state", "value", "appliesOnlyTo", "originalSeason"])
        && legacy.state === "LEGACY_SINGLE_SLOT_NOT_APPLICABLE_TO_CONFIRMED_MULTI_SELECTION" && legacy.value === null
        && legacy.appliesOnlyTo === "FRESH_NATIVE_PRODUCT_IN_NEW_DATABASE" && legacy.originalSeason === raw,
      "NATIVE_PRODUCT_LEGACY_SCALAR", "Explicit new-product legacy slot nonapplicability required; no first-member conversion");
      multiple.add(s.sourceKey);
    } else {
      const original = row.references.season, selected = proof.references[0]!;
      requireDomain(!Object.hasOwn(row, "legacyScalarCreation") && original && original.nativeId === selected.nativeId
        && original.name === selected.nativeSnapshot.name && original.code === selected.nativeSnapshot.code,
      "NATIVE_PRODUCT_LEGACY_SCALAR", "Exact existing reviewed single-season reference must be preserved");
    }
  }
  const prepared = prepareNativeProductCore(chunk, multiple);
  const nativeProducts = prepared.nativeProducts.map((native, i) => ({ ...native,
    season_ids: chunk.rows[i]!.seasonSelection.season_ids, deleted_at: null, default_barcode_scheme_id: null }));
  return { ...chunk, mappingVersion: HISTORY_MAPPING_VERSION, nativeProducts, fingerprint: requestHash(chunk) };
}
export function validatePreparedNativeProductImportChunk26(chunk: PreparedNativeProductImportChunk26): void {
  historySettlementRequestHash(chunk);
  const { mappingVersion: _mapping, fingerprint: _fingerprint, nativeProducts: _products, ...input } = chunk;
  requireDomain(requestHash(prepareNativeProductImportChunk26(input)) === requestHash(chunk), "NATIVE_PRODUCT_PREPARED_CHANGED", "Prepared successor product changed");
}
export function nativeProductReferenceDecision26(row: NativeProductImportRow26) {
  const { decisionSha256: _old, ...old } = nativeProductReferenceDecision(row);
  const body = { ...old, seasonSelection: row.seasonSelection,
    ...(Object.hasOwn(row, "legacyScalarCreation") ? { legacyScalarCreation: row.legacyScalarCreation } : {}) };
  return { ...body, decisionSha256: requestHash({ validatorVersion: NATIVE_PRODUCT_REFERENCE_DECISION_VERSION_26, ...body }) };
}
export function nativeProductImportEvidence26(chunk: PreparedNativeProductImportChunk26, index: number) {
  validatePreparedNativeProductImportChunk26(chunk);
  requireDomain(Number.isSafeInteger(index) && index >= 0 && index < chunk.rows.length, "NATIVE_PRODUCT_ROW_INDEX", "Existing product row required");
  const original = nativeProductImportEvidence(chunk, index), row = chunk.rows[index]!;
  const fields = { ...original.fields, native_product_import: { ...original.fields.native_product_import,
    validator_version: NATIVE_PRODUCT_IMPORT_VERSION_26, schema_profile: "EXACT26", season_selection: row.seasonSelection,
    migration_defaults: { version: "NATIVE_PRODUCT_APPROVED_MIGRATION_DEFAULTS_26_V1", deleted_at: null, default_barcode_scheme_id: null },
    ...(row.legacyScalarCreation ? { legacy_scalar_creation: row.legacyScalarCreation } : {}),
    row_fingerprint: requestHash({ validatorVersion: NATIVE_PRODUCT_IMPORT_VERSION_26, schemaProfile: chunk.schemaProfile, selection: chunk.selection, row }),
    reference_decision_sha256: nativeProductReferenceDecision26(row).decisionSha256 } };
  return { fields, source: { ...original.source, field_provenance: { ...original.source.field_provenance, fields } } };
}
/** Revalidate derived values too; a prepared DTO is not authority to edit targets. */
export function validatePreparedNativeProductImportChunk(chunk: PreparedNativeProductImportChunk): void {
  const { mappingVersion: _mapping, fingerprint: _fingerprint, nativeProducts: _products, ...input } = chunk;
  requireDomain(requestHash(prepareNativeProductImportChunk(input)) === requestHash(chunk), "NATIVE_PRODUCT_PREPARED_CHANGED", "Prepared native product import changed");
}
/** Pure exact decision descriptor, NOT an authorization. A trusted authorizer
 * must compare it with an independently pinned reviewed manifest and mapping
 * bytes; computing a digest from untrusted caller input grants nothing. */
export function nativeProductReferenceDecision(row: NativeProductImportRow) {
  const body = { sourceRowId: row.source.id, sourceKey: row.source.sourceKey, sourceEvidenceHash: requestHash(row.source),
    product: row.product, blankPricePolicy: row.blankPricePolicy, nullableFieldPolicy: row.nullableFieldPolicy, references: row.references,
    ...(Object.hasOwn(row, "sourceTransformation") ? { sourceTransformation: row.sourceTransformation } : {}) };
  return { ...body, decisionSha256: requestHash({ validatorVersion: NATIVE_PRODUCT_REFERENCE_DECISION_VERSION, ...body }) };
}
/** Deterministic immutable metadata shared by first insert and exact replay. */
export function nativeProductImportEvidence(chunk: PreparedNativeProductImportChunk, index: number) {
  const row = chunk.rows[index]!, s = row.source;
  const proof = createCatalogueSourcePriceProof({ nativeProductId: row.product.nativeId, productVersion: 1, rawFields: s.rawFields, blankPricePolicy: row.blankPricePolicy });
  const fields = { ...(s.fieldProvenance.fields as Record<string, unknown>), native_product_import: {
    origin: "MIGRATION_DERIVED", reason: "Reviewed explicit native product creation and source binding", raw: null,
    evidence_ref: chunk.selection.selectionSha256, validator_version: NATIVE_PRODUCT_IMPORT_VERSION, selection: chunk.selection,
    row_fingerprint: requestHash({ selection: chunk.selection, row }), native_product: chunk.nativeProducts[index]!,
    nullable_field_policy: row.nullableFieldPolicy, references: row.references,
    ...(Object.hasOwn(row, "sourceTransformation") ? { source_transformation: row.sourceTransformation } : {}),
    reference_decision_sha256: nativeProductReferenceDecision(row).decisionSha256
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
