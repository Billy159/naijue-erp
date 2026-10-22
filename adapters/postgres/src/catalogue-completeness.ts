import { DomainError, requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId, version } from "../../../packages/domain/src/values.ts";
import { CATALOGUE_PRICE_KEYS, CATALOGUE_PRICE_VALIDATOR_VERSION, validateCompleteCataloguePrices } from "../../../packages/application/src/catalogue-price-input.ts";
import { createCatalogueSourcePriceProof } from "../../../packages/application/src/catalogue-source-proof.ts";
import type { CatalogueBlankPricePolicy } from "../../../packages/application/src/catalogue-source-proof.ts";
import { SALES_NATIVE_FACT_MAX_LINES, SALES_NATIVE_FACT_QUERY_BATCH_SIZE } from "../../../packages/application/src/sales-native-facts.ts";
import type { NativeCatalogueCompletenessVerifier } from "./sales-native-facts.ts";
import { integerValue, jsonObject, stringValue } from "./codec.ts";
import { checkedNativeRuntime26Capability, type NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import { requestHash } from "../../../packages/application/src/request-hash.ts";
import { COMPLETE_SCOPE_DECISION } from "../../../packages/application/src/inventory-cutoff-import.ts";
import type { PgSalesClient } from "./sales-unit-of-work.ts";

/** Explicit import-origin verifier. No defaults, DDL, publication or synthetic
 * fixture exception. Joins immutable per-row source provenance to a published
 * validated batch AND its explicit native product identity. Values and product
 * version are rechecked, so historical provenance cannot authorize later edits.
 * Live product CREATE requires its own reviewed persisted proof, not this import
 * verifier and not a schema-version or nullable-column shortcut. */
export class PostgresImportedCatalogueCompletenessVerifier implements NativeCatalogueCompletenessVerifier {
  async assertComplete({ productIds, query }: Parameters<NativeCatalogueCompletenessVerifier["assertComplete"]>[0]): Promise<void> {
    const ids = [...new Set(productIds.map(value => entityId("product", value)))].sort();
    requireDomain(ids.length > 0 && ids.length <= SALES_NATIVE_FACT_MAX_LINES,
      "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Bounded actual product target set required");
    const read: typeof query = async (sql, values) => {
      try { return await query(sql, values); }
      catch (error) {
        const code = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
        if (code === "42P01" || code === "42703") throw new DomainError("NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Persisted catalogue source evidence schema is unavailable");
        throw error;
      }
    };
    for (let offset = 0; offset < ids.length; offset += SALES_NATIVE_FACT_QUERY_BATCH_SIZE) {
      const batch = ids.slice(offset, offset + SALES_NATIVE_FACT_QUERY_BATCH_SIZE);
      const rows = (await read(`/* native-catalogue-completeness:source-proof */ SELECT p.id AS product_id, p.version AS product_version,
        ${CATALOGUE_PRICE_KEYS.map(key => `p.${key}::text AS ${key}`).join(", ")},
        s.id AS source_row_id, s.batch_id, s.source_key, s.file_ref, s.sheet, s.row_no::text,
        s.source_file_sha256, s.row_sha256, s.raw_fields, s.field_provenance,
        b.status AS batch_status, b.mapping_version, b.history_validation_passed
        FROM naijue_erp.product p JOIN naijue_erp.import_source_row s
          ON s.entity_type = 'PRODUCT' AND s.field_provenance->>'native_product_id' = p.id::text
        JOIN naijue_erp.import_batch b ON b.id = s.batch_id
        WHERE p.id = ANY($1::uuid[]) AND b.status = 'IMPORTED'
          AND b.mapping_version = 'V2_HISTORY_NULLABLE_1' AND b.history_validation_passed
          AND s.field_provenance ? 'product_input_proof'
        ORDER BY p.id, s.id LIMIT $2 FOR SHARE OF p, s, b`, [batch, batch.length + 1])).rows;
      requireDomain(rows.length === batch.length, "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "One published complete source proof per native product required");
      const seen = new Set<string>();
      for (const row of rows) {
        const id = entityId("product", stringValue(row.product_id));
        requireDomain(batch.includes(id) && !seen.has(id), "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Missing or ambiguous native product proof"); seen.add(id);
        const currentVersion = version(integerValue(row.product_version));
        entityId("product", stringValue(row.source_row_id)); entityId("product", stringValue(row.batch_id));
        requireDomain(row.batch_status === "IMPORTED" && row.mapping_version === "V2_HISTORY_NULLABLE_1" && row.history_validation_passed === true
          && typeof row.source_key === "string" && row.source_key.length > 0 && typeof row.file_ref === "string" && row.file_ref.length > 0
          && typeof row.sheet === "string" && row.sheet.length > 0 && typeof row.row_no === "string" && /^[1-9]\d*$/.test(row.row_no)
          && typeof row.source_file_sha256 === "string" && /^[0-9a-f]{64}$/.test(row.source_file_sha256)
          && typeof row.row_sha256 === "string" && /^[0-9a-f]{64}$/.test(row.row_sha256),
        "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Published source identity and hashes required");
        const metadata = jsonObject(row.field_provenance), proof = jsonObject(metadata.product_input_proof);
        requireDomain(metadata.schema_version === 1 && metadata.native_product_id === id && metadata.fields !== null && typeof metadata.fields === "object"
          && !Array.isArray(metadata.fields) && proof.schema_version === 1 && proof.validator_version === CATALOGUE_PRICE_VALIDATOR_VERSION
          && Object.keys(proof).length === 5 && proof.product_version === currentVersion && (proof.blank_price_policy === "EXPLICIT_NULL_ONLY" || proof.blank_price_policy === "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET"),
        "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Versioned validated product source proof required");
        const actual = validateCompleteCataloguePrices(Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [key, row[key]])));
        const recorded = validateCompleteCataloguePrices(proof.prices);
        const recomputed = createCatalogueSourcePriceProof({ nativeProductId: id, productVersion: currentVersion, rawFields: jsonObject(row.raw_fields),
          blankPricePolicy: proof.blank_price_policy as CatalogueBlankPricePolicy }).product_input_proof.prices;
        requireDomain(CATALOGUE_PRICE_KEYS.every(key => actual[key] === recorded[key] && recorded[key] === recomputed[key] && (proof.prices as Record<string, unknown>)[key] === recorded[key]),
          "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Persisted product prices must equal validated exact source inputs");
      }
    }
  }
}

export interface CatalogueSourceProofWriteInput {
  readonly sourceRowId: string; readonly batchId: string; readonly nativeProductId: string;
  readonly sourceKey: string; readonly fileRef: string; readonly sheet: string; readonly rowNo: string;
  /** Actual source digests from verified intake, not generated from normalized values. */
  readonly sourceFileSha256: string; readonly rowSha256: string;
  readonly rawFields: Readonly<Record<string, unknown>>; readonly normalizedFields: Readonly<Record<string, unknown>>;
  readonly fields: Readonly<Record<string, unknown>>; readonly blankPricePolicy: CatalogueBlankPricePolicy;
}
/** Trusted import transaction adapter, not a public API. Native product creation
 * and this insert must share the caller's transaction. Does not create a batch,
 * change product prices, publish the batch or infer target IDs from source keys.
 * A staged source row still cannot pass the SALES reader until checked publication.
 * Immutable source rows are inserted once, never patched to add a later proof. */
export async function insertValidatedCatalogueSourceProof(
  query: Parameters<NativeCatalogueCompletenessVerifier["assertComplete"]>[0]["query"], input: CatalogueSourceProofWriteInput
): Promise<void> {
  const sourceRowId = entityId("product", input.sourceRowId), batchId = entityId("product", input.batchId), nativeProductId = entityId("product", input.nativeProductId);
  requireDomain([input.sourceKey, input.fileRef, input.sheet].every(value => typeof value === "string" && value.length > 0)
    && typeof input.rowNo === "string" && /^[1-9]\d*$/.test(input.rowNo) && BigInt(input.rowNo) <= 9223372036854775807n
    && /^[0-9a-f]{64}$/.test(input.sourceFileSha256) && /^[0-9a-f]{64}$/.test(input.rowSha256),
  "INCOMPLETE_CATALOGUE_PRICE_INPUT", "Actual original source identity and digests required");
  const rawFields = structuredClone(jsonObject(input.rawFields)), normalizedFields = structuredClone(jsonObject(input.normalizedFields));
  const fields = structuredClone(jsonObject(input.fields));
  // Match source-row triggers and publication: global cutoff lock BEFORE the
  // batch row lock. Reversing these can deadlock against publication.
  await query("/* native-catalogue-completeness:write-lock */ SELECT naijue_erp.cutoff_import_lock()");
  const batches = (await query(`/* native-catalogue-completeness:write-batch */ SELECT id, status, mapping_version FROM naijue_erp.import_batch WHERE id = $1::uuid FOR UPDATE`, [batchId])).rows;
  requireDomain(batches.length === 1 && batches[0]!.id === batchId && ["STAGED", "VALIDATING"].includes(stringValue(batches[0]!.status))
    && batches[0]!.mapping_version === "V2_HISTORY_NULLABLE_1", "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Reviewed open import batch required");
  const products = (await query(`/* native-catalogue-completeness:write-target */ SELECT id, version,
    ${CATALOGUE_PRICE_KEYS.map(key => `${key}::text`).join(", ")} FROM naijue_erp.product WHERE id = $1::uuid FOR SHARE`, [nativeProductId])).rows;
  requireDomain(products.length === 1 && products[0]!.id === nativeProductId, "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Actual explicit native product binding required");
  const product = products[0]!;
  const proof = createCatalogueSourcePriceProof({ nativeProductId, productVersion: version(integerValue(product.version)), rawFields, blankPricePolicy: input.blankPricePolicy });
  const current = validateCompleteCataloguePrices(Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [key, product[key]])));
  requireDomain(CATALOGUE_PRICE_KEYS.every(key => current[key] === proof.product_input_proof.prices[key]),
    "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Native prices must match exact validated input before proof insert");
  const result = await query(`/* native-catalogue-completeness:write-proof */ INSERT INTO naijue_erp.import_source_row
    (id, batch_id, entity_type, source_key, file_ref, sheet, row_no, source_file_sha256, row_sha256, raw_fields, normalized_fields, field_provenance)
    VALUES ($1::uuid, $2::uuid, 'PRODUCT', $3, $4, $5, $6::bigint, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb) RETURNING id`,
    [sourceRowId, batchId, input.sourceKey, input.fileRef, input.sheet, input.rowNo, input.sourceFileSha256, input.rowSha256,
      JSON.stringify(rawFields), JSON.stringify(normalizedFields), JSON.stringify({ schema_version: 1, fields, ...proof })]);
  requireDomain(result.rowCount === 1 && result.rows.length === 1 && result.rows[0]!.id === sourceRowId,
    "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Complete source proof insertion required");
}


// H06 is a separate, opt-in read proof. The imported verifier above remains the
// authority for an unchanged import, with its original errors and byte region.
const MAINTAINED_ROOT = ["id", "product_code", "name", "category_id", "supplier_id", "season_id", "size_group_id", "year", "system_item_code", "thickness", "collar_pants_type", "default_barcode_scheme_id", "enabled", "version", "deleted_at", ...CATALOGUE_PRICE_KEYS, "season_ids"] as const;
const MAINTAINED_SKU = ["id", "product_id", "color_id", "fit_id", "size_id", "sku_code", "enabled", "version", "created_operation_id"] as const;
const MAINTAINED_BARCODE = ["id", "barcode", "sku_id", "barcode_kind", "scheme_id", "enabled"] as const;
const MAINTAINED_IMAGE = ["id", "product_id", "file_ref", "mime", "byte_size", "display_order", "created_at", "created_by_account_id", "version", "image_role", "color_id"] as const;
const CHAIN_LIMIT = 1024, SKU_LIMIT = 5000, BARCODE_LIMIT = 20000, IMAGE_LIMIT = 1000, AUDIT_BYTES = 16 * 1024 * 1024;
type Facts = Record<string, unknown>;
type FactQuery = Parameters<NativeCatalogueCompletenessVerifier["assertComplete"]>[0]["query"];
function complete(value: unknown, message: string): asserts value { requireDomain(value, "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", message); }
function ownObject(value: unknown): Facts {
  complete(value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype, "Plain persisted evidence required");
  const row = value as Facts;
  complete(Reflect.ownKeys(row).every(key => typeof key === "string" && Object.getOwnPropertyDescriptor(row, key)?.enumerable && "value" in Object.getOwnPropertyDescriptor(row, key)!), "Own data evidence required");
  return row;
}
function exactFacts(value: unknown, keys: readonly string[]): Facts {
  const row = ownObject(value); complete(Object.keys(row).length === keys.length && keys.every(k => Object.hasOwn(row, k)), "Complete persisted field set required"); return { ...row };
}
function uuid(value: unknown): string { complete(typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) && value !== "00000000-0000-0000-0000-000000000000", "Actual UUID required"); return value; }
function positive(value: unknown): number { complete(Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= 2147483647, "Persisted positive version required"); return value as number; }
function label(value: unknown): void { complete(typeof value === "string" && value.trim().length > 0 && value.length <= 65536 && !value.includes("\0"), "Actual nonblank text required"); }
function digest(value: unknown): void { complete(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), "Original digest required"); }
function instant(value: unknown): string {
  complete(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value) && Number.isFinite(Date.parse(value)), "Actual UTC evidence time required");
  const [seconds, fraction = ""] = value.slice(0, -1).split("."); return seconds + "." + fraction.padEnd(6, "0") + "Z";
}
function equal(a: unknown, b: unknown): boolean { return requestHash(a) === requestHash(b); }
function priceEvidence<T>(read: () => T): T {
  try { return read(); } catch (error) {
    if (error instanceof DomainError) throw new DomainError("NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Persisted complete price evidence is invalid");
    throw error;
  }
}
function rootFacts(input: unknown): Facts {
  const p = exactFacts(input, MAINTAINED_ROOT);
  for (const k of ["id", "category_id", "size_group_id"]) uuid(p[k]);
  for (const k of ["supplier_id", "season_id", "default_barcode_scheme_id"]) if (p[k] !== null) uuid(p[k]);
  label(p.product_code); label(p.name); positive(p.version); complete(typeof p.enabled === "boolean", "Actual enabled state required");
  complete(p.year === null || Number.isSafeInteger(p.year), "Actual nullable year required");
  for (const k of ["system_item_code", "thickness", "collar_pants_type"]) complete(p[k] === null || typeof p[k] === "string", "Actual nullable catalogue text required");
  if (p.deleted_at !== null) p.deleted_at = instant(p.deleted_at);
  complete(p.season_ids === null || Array.isArray(p.season_ids) && p.season_ids.length <= 1000 && new Set(p.season_ids.map(uuid)).size === p.season_ids.length, "Actual unique season selection required");
  const prices = priceEvidence(() => validateCompleteCataloguePrices(Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k => [k, p[k]]))));
  complete(CATALOGUE_PRICE_KEYS.every(k => p[k] === prices[k]), "Nine canonical prices, including explicit historical NULL, required"); return p;
}
function childFacts(kind: "skus" | "barcodes" | "images", input: unknown, productId: string): Facts {
  const row = exactFacts(input, kind === "skus" ? MAINTAINED_SKU : kind === "barcodes" ? MAINTAINED_BARCODE : MAINTAINED_IMAGE); uuid(row.id);
  if (kind !== "barcodes") complete(row.product_id === productId, "Child belongs to another product");
  if (kind === "skus") {
    for (const k of ["color_id", "fit_id", "size_id"]) uuid(row[k]); label(row.sku_code); positive(row.version);
    if (row.created_operation_id !== null) uuid(row.created_operation_id);
  } else if (kind === "barcodes") {
    uuid(row.sku_id); label(row.barcode); complete(row.barcode_kind === "MAIN" || row.barcode_kind === "CONFIRMED_OLD", "Actual barcode kind required"); if (row.scheme_id !== null) uuid(row.scheme_id);
  } else {
    label(row.file_ref); label(row.mime); complete(typeof row.byte_size === "string" && /^[1-9]\d*$/.test(row.byte_size), "Actual image byte count required");
    complete(Number.isSafeInteger(row.display_order) && (row.display_order as number) >= -2147483648 && (row.display_order as number) <= 2147483647, "Actual image order required"); positive(row.version); row.created_at = instant(row.created_at);
    if (row.created_by_account_id !== null) uuid(row.created_by_account_id); if (row.color_id !== null) uuid(row.color_id);
    complete(row.image_role === null || ["MAIN", "WHITE_BACKGROUND", "HANG_TAG", "DETAIL", "COLOR"].includes(row.image_role as string), "Actual retained image role required");
    complete((row.image_role === "COLOR") === (row.color_id !== null), "Image role and color differ");
  }
  if (kind !== "images") complete(typeof row.enabled === "boolean", "Actual child enabled state required"); return row;
}
function children(kind: "skus" | "barcodes" | "images", input: unknown, productId: string): Map<string, Facts> {
  complete(Array.isArray(input) && input.length <= (kind === "skus" ? SKU_LIMIT : kind === "barcodes" ? BARCODE_LIMIT : IMAGE_LIMIT), "Bounded full child set required");
  const out = new Map<string, Facts>(); for (const item of input) { const row = childFacts(kind, item, productId), key = uuid(row.id); complete(!out.has(key), "Duplicate child identity"); out.set(key, row); } return out;
}
function sameChildren(a: Map<string, Facts>, b: Map<string, Facts>): boolean { return a.size === b.size && [...a].every(([k, v]) => b.has(k) && equal(v, b.get(k))); }
// MVCC visibility also includes this transaction's own writes. age(xid) uses
// wrap-aware transaction age; require evidence older than our top-level xid,
// which excludes own top-level and subtransaction inserts. A newer concurrent
// commit may conservatively be unavailable. No second connection or xid cast to
// a guessed epoch, and no uncommitted prepared receipt can become an anchor.
const committedBefore = (alias: string): string => `(pg_current_xact_id_if_assigned() IS NULL OR age(${alias}.xmin)>age(pg_current_xact_id_if_assigned()::xid))`;
const fullPublication = `b.mapping_version='V2_HISTORY_NULLABLE_1' AND b.status='IMPORTED'
 AND b.history_validation_passed IS TRUE AND b.history_actual_counts=b.history_expected_counts
 AND b.checkpoint->'counts'=b.checkpoint->'expected' AND b.checkpoint->'counts'->>'IMPORT_BATCH'='1'
 AND b.completed_at IS NOT NULL AND m.validator_version='HISTORY_TYPED_CLOSURE_V1'
 AND m.selection_sha256=b.source_hash AND m.authorized_payload_hash=b.history_payload_hash AND m.expected_counts=b.history_expected_counts
 AND m.document_count=(SELECT count(*) FROM naijue_erp.import_history_document_manifest md WHERE md.batch_id=b.id)
 AND ${committedBefore("b")} AND ${committedBefore("s")} AND ${committedBefore("m")}
 AND EXISTS(SELECT 1 FROM naijue_erp.import_record f
 JOIN naijue_erp.import_record_accounting_claim c ON c.import_batch_id=f.import_batch_id AND c.import_record_id=f.id AND c.target_type=f.target_type AND c.target_id=f.target_id
 JOIN naijue_erp.operation_receipt r ON r.id=c.operation_id JOIN naijue_erp.audit_change a ON a.operation_id=r.id
 WHERE f.import_batch_id=b.id AND f.target_type='IMPORT_BATCH' AND f.target_id=b.id AND f.status='IMPORTED'
 AND f.source_entity_type='INVENTORY_SCOPE_APPROVAL' AND f.source_key='FINAL_COMPLETE_SCOPE'
 AND f.source_record_hash=b.source_hash AND f.source_file_ref=b.source_manifest_ref AND f.decision_reason=$2::text
 AND c.checkpoint_sequence=(b.checkpoint->>'sequence')::integer AND r.target_type='IMPORT' AND r.target_id=b.id
 AND r.action='IMPORT_PUBLISH' AND r.status='COMMITTED' AND r.result_data->>'status'='IMPORTED' AND r.result_data->>'batchId'=b.id::text
 AND r.result_data->>'sequence'=b.checkpoint->>'sequence' AND r.result_data->>'cursor'=b.checkpoint->>'cursor'
 AND a.object_type='IMPORT' AND a.object_id=b.id AND a.action=r.action AND a.actor_account_id=r.actor_account_id
 AND a.occurred_at=r.completed_at AND ${committedBefore("r")} AND ${committedBefore("a")} AND ${committedBefore("f")} AND ${committedBefore("c")})`;
function sourceIdentity(row: Facts): Facts {
  uuid(row.id); uuid(row.batch_id); label(row.source_key); label(row.file_ref); label(row.sheet);
  complete(typeof row.row_no === "string" && /^[1-9]\d*$/.test(row.row_no), "Original source row position required"); digest(row.source_file_sha256); digest(row.row_sha256);
  return ownObject(row.field_provenance);
}
function auditJsonEvidence(value: unknown): void {
  let bytes = 0; const seen = new Set<object>();
  function walk(v: unknown, depth: number) {
    complete(depth <= 16, "Audit nesting exceeds the reviewed bound");
    if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isSafeInteger(v)) return;
    if (typeof v === "string") { bytes += Buffer.byteLength(v); complete(bytes <= AUDIT_BYTES, "Audit byte bound exceeded"); return; }
    complete(typeof v === "object" && !seen.has(v), "Invalid persisted audit value"); seen.add(v);
    const obj = Array.isArray(v) ? v : ownObject(v); for (const [k, item] of Object.entries(obj)) { bytes += Buffer.byteLength(k); walk(item, depth + 1); } seen.delete(v);
  }
  walk(value, 0); complete(Buffer.byteLength(JSON.stringify(value)) <= AUDIT_BYTES, "Audit byte bound exceeded");
}
function replayChildren(kind: "skus" | "barcodes" | "images", before: unknown, after: unknown, state: Map<string, Facts>, target: string, operationId: string, create: boolean) {
  const old = children(kind, before, target), next = children(kind, after, target);
  for (const [id, row] of old) complete(state.has(id) && equal(state.get(id), row), "Changed child before-value differs from the reconstructed state");
  for (const [id] of old) if (!next.has(id)) { complete(kind === "images", "SKU/barcode identity cannot be removed"); state.delete(id); }
  for (const [id, row] of next) {
    const previous = state.get(id);
    complete(previous ? old.has(id) && !equal(previous, row) : !old.has(id), "Child addition/update has no exact before evidence");
    if (kind === "skus") {
      if (previous) complete(MAINTAINED_SKU.filter(k => k !== "enabled" && k !== "version").every(k => equal(previous[k], row[k])) && row.version === (previous.version as number) + 1 && row.enabled !== previous.enabled, "SKU identity/version changed without legal maintenance");
      else complete(row.created_operation_id === operationId && row.version === 1, "Added SKU has no original creation operation");
    }
    if (kind === "barcodes" && previous) complete(MAINTAINED_BARCODE.filter(k => k !== "enabled").every(k => equal(previous[k], row[k])) && row.enabled !== previous.enabled, "Barcode immutable binding changed");
    if (kind === "images") complete(previous ? row.version === (previous.version as number) + 1 : row.version === 1, "Image version chain is incomplete");
    state.set(id, row);
  }
  complete(!create || old.size === 0, "CREATE cannot invent earlier children");
}
/** Only the trusted explicit26 UOW creates this pair. The runtime issuer checks
 * the actual managed client, never a supplied query wrapper. The verifier accepts
 * only its own query, with a fresh proof for every call and no fallback on error. */
export function createMaintainedCatalogue26TransactionProof(client: PgSalesClient, runtimeInput: NativeRuntime26Capability, guard: () => void): Readonly<{ query: FactQuery; verifier: NativeCatalogueCompletenessVerifier }> {
  const runtime = checkedNativeRuntime26Capability(runtimeInput); if (!runtime || typeof client?.query !== "function" || typeof guard !== "function") throw TypeError("Original exact26 client and active transaction required");
  const active = () => { const result: unknown = guard(); if (result !== undefined) throw TypeError("Transaction guard must not return a success substitute"); };
  const query: FactQuery = async (sql, values) => {
    active(); let result: Awaited<ReturnType<FactQuery>>;
    try { result = await client.query(sql, values); } catch (error) {
      const code = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === "42P01" || code === "42703") throw new DomainError("NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Persisted maintained catalogue evidence schema is unavailable");
      throw error;
    }
    active(); return result;
  };
  const legacy = new PostgresImportedCatalogueCompletenessVerifier();
  const verifier: NativeCatalogueCompletenessVerifier = Object.freeze({ async assertComplete(context: Parameters<NativeCatalogueCompletenessVerifier["assertComplete"]>[0]) {
    active(); complete(context.query === query, "Proof requires its private original transaction query"); await runtime.assertReady(client, "INVENTORY_ADMISSION"); active();
    const ids = [...new Set(context.productIds.map(v => entityId("product", v)))].sort(); complete(ids.length > 0 && ids.length <= SALES_NATIVE_FACT_MAX_LINES, "Bounded product targets required");
    const roots = new Map<string, Facts>();
    for (let i = 0; i < ids.length; i += SALES_NATIVE_FACT_QUERY_BATCH_SIZE) {
      const batch = ids.slice(i, i + SALES_NATIVE_FACT_QUERY_BATCH_SIZE);
      const rows = (await query(`/* maintained-catalogue26:roots */ SELECT ${MAINTAINED_ROOT.map(k => CATALOGUE_PRICE_KEYS.includes(k as typeof CATALOGUE_PRICE_KEYS[number]) ? `p.${k}::text AS ${k}` : k === "deleted_at" ? `to_char(p.deleted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS deleted_at` : `p.${k}`).join(",")},${committedBefore("p")} AS committed_before
        FROM naijue_erp.product p WHERE p.id=ANY($1::uuid[]) ORDER BY p.id LIMIT $2 FOR SHARE`, [batch, batch.length + 1])).rows;
      complete(rows.length === batch.length, "Complete current product roots required");
      for (const r of rows) { complete(r.committed_before === true && batch.includes(r.id as typeof ids[number]) && !roots.has(uuid(r.id)), "Foreign, duplicate or uncommitted product root"); const { committed_before: _c, ...facts } = r; roots.set(uuid(r.id), rootFacts(facts)); }
    }
    for (const productId of ids) {
      const current = roots.get(productId)!; complete(current.deleted_at === null, "Deleted product is unavailable for native sales");
      const sources = (await query(`/* maintained-catalogue26:product-source */ SELECT s.id,s.batch_id,s.source_key,s.file_ref,s.sheet,s.row_no::text,s.source_file_sha256,s.row_sha256,s.raw_fields,s.normalized_fields,s.field_provenance,b.source_hash,
        (${fullPublication}) AS published FROM naijue_erp.import_source_row s JOIN naijue_erp.import_batch b ON b.id=s.batch_id
        LEFT JOIN naijue_erp.import_history_closure_manifest m ON m.batch_id=b.id
        WHERE s.entity_type='PRODUCT' AND s.field_provenance->>'native_product_id'=$1::text ORDER BY s.id LIMIT 2 FOR SHARE OF s,b`, [productId, COMPLETE_SCOPE_DECISION])).rows;
      complete(sources.length <= 1, "Ambiguous product origin");
      const source = sources[0], sourceProof = source ? ownObject(ownObject(source.field_provenance).product_input_proof) : undefined;
      const baselineVersion = sourceProof ? positive(sourceProof.product_version) : 0;
      const audits = (await query(`/* maintained-catalogue26:chain */ SELECT a.id,a.operation_id,a.actor_account_id,a.object_type,a.object_id,a.action,a.old_version,a.new_version,a.before_values,a.after_values,
        to_char(a.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at,
        r.id AS receipt_id,r.actor_account_id AS receipt_actor,r.target_type,r.target_id,r.action AS receipt_action,r.status,r.request_key,r.request_hash,r.result_data,
        to_char(r.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS completed_at,
        (${committedBefore("a")} AND ${committedBefore("r")}) AS committed_before
        FROM naijue_erp.audit_change a LEFT JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id
        WHERE a.object_type='PRODUCT' AND a.object_id=$1::uuid AND (a.new_version>$2 OR a.old_version IS NULL)
        ORDER BY a.new_version,a.id LIMIT $3 FOR SHARE OF a`, [productId, baselineVersion, CHAIN_LIMIT + 1])).rows;
      complete(audits.length <= CHAIN_LIMIT, "Maintenance chain exceeds 1024 steps; proof was not truncated");
      if (source && audits.length === 0 && baselineVersion === current.version) {
        // An explicit routing decision, never exception handling or fallback.
        complete(source.published === true, "Unchanged import still requires full publication"); await legacy.assertComplete({ productIds: [productId], query }); continue;
      }
      let state: Facts | undefined; const sets = { skus: new Map<string, Facts>(), barcodes: new Map<string, Facts>(), images: new Map<string, Facts>() };
      if (source) {
        complete(source.published === true && baselineVersion < (current.version as number), "Maintained import requires a published earlier full baseline");
        const metadata = sourceIdentity(source), recorded = ownObject(ownObject(metadata.fields).native_product_import);
        complete(metadata.schema_version === 1 && metadata.native_product_id === productId && recorded.validator_version === "NATIVE_PRODUCT_IMPORT_V2_EXACT26" && recorded.schema_profile === "EXACT26", "Full immutable exact26 import origin required"); digest(recorded.row_fingerprint);
        state = rootFacts(recorded.native_product); complete(state.id === productId && state.version === baselineVersion && baselineVersion === 1 && state.deleted_at === null && state.default_barcode_scheme_id === null, "Imported baseline identity/version or approved migration defaults differ");
        complete(sourceProof!.schema_version === 1 && sourceProof!.validator_version === CATALOGUE_PRICE_VALIDATOR_VERSION && Object.keys(sourceProof!).length === 5 && (sourceProof!.blank_price_policy === "EXPLICIT_NULL_ONLY" || sourceProof!.blank_price_policy === "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET"), "Original complete price input proof required");
        const prices = priceEvidence(() => createCatalogueSourcePriceProof({ nativeProductId: productId, productVersion: baselineVersion, rawFields: ownObject(source.raw_fields), blankPricePolicy: sourceProof!.blank_price_policy as CatalogueBlankPricePolicy }).product_input_proof.prices);
        complete(equal(prices, sourceProof!.prices) && CATALOGUE_PRICE_KEYS.every(k => state![k] === prices[k]), "Raw original prices differ from the full baseline");
        await importChildren(query, source, productId, sets);
      }
      let totalBytes = 0; const operations = new Set<string>();
      for (const audit of audits) {
        const operationId = uuid(audit.operation_id); uuid(audit.id); uuid(audit.actor_account_id); label(audit.request_key); digest(audit.request_hash);
        complete(!operations.has(operationId), "Repeated audit operation"); operations.add(operationId);
        const result = exactFacts(audit.result_data, ["operationId", "kind", "targetId", "version"]);
        complete(audit.committed_before === true && audit.receipt_id === operationId && audit.receipt_actor === audit.actor_account_id && audit.object_type === "PRODUCT" && audit.object_id === productId && audit.target_type === "PRODUCT" && audit.target_id === productId && audit.receipt_action === audit.action && audit.status === "COMMITTED"
          && instant(audit.occurred_at) === instant(audit.completed_at) && result.operationId === operationId && result.kind === "PRODUCT" && result.targetId === productId && result.version === audit.new_version, "Matching previously committed audit and original receipt required");
        complete(["CREATE", "EDIT", "DISABLE", "RESTORE", "DELETE"].includes(audit.action as string), "Invalid maintenance action");
        auditJsonEvidence(audit.before_values); auditJsonEvidence(audit.after_values); totalBytes += Buffer.byteLength(JSON.stringify([audit.before_values, audit.after_values])); complete(totalBytes <= AUDIT_BYTES, "Complete chain exceeds the audit byte bound");
        const create = state === undefined, after = ownObject(audit.after_values), before = create ? {} : ownObject(audit.before_values);
        complete(create ? !source && audit.action === "CREATE" && audit.old_version === null && audit.new_version === 1 && audit.before_values === null : audit.action !== "CREATE" && audit.old_version === state!.version && audit.new_version === (state!.version as number) + 1, "Missing CREATE anchor or discontinuous maintenance version");
        const allowed = [...MAINTAINED_ROOT, "skus", "barcodes", "images"];
        complete(Object.keys(after).every(k => allowed.includes(k as typeof allowed[number])) && Object.keys(before).every(k => allowed.includes(k as typeof allowed[number])), "Unknown audit fields cannot advance the proof");
        const afterKeys = Object.keys(after).filter(k => !["skus", "barcodes", "images"].includes(k)), beforeKeys = Object.keys(before).filter(k => !["skus", "barcodes", "images"].includes(k));
        complete(create ? MAINTAINED_ROOT.every(k => Object.hasOwn(after, k)) : equal([...afterKeys].sort(), [...beforeKeys].sort()) && afterKeys.includes("version"), "Complete CREATE or paired sparse root delta required");
        complete(create || afterKeys.some(k => k !== "version" && !equal(before[k], after[k])) || ["skus", "barcodes", "images"].some(k => Array.isArray(after[k]) && ((after[k] as unknown[]).length > 0 || Array.isArray(before[k]) && (before[k] as unknown[]).length > 0)), "A version-only no-op is not a complete maintenance change");
        if (!create) for (const k of beforeKeys) { const old = k === "deleted_at" && before[k] !== null ? instant(before[k]) : before[k]; complete(equal(state![k], old), "Sparse audit before-value differs from prior root"); }
        state = rootFacts({ ...state, ...Object.fromEntries(afterKeys.map(k => [k, after[k]])) }); complete(state.id === productId && state.version === audit.new_version, "Audit final root differs from target/version");
        for (const kind of ["skus", "barcodes", "images"] as const) if (Object.hasOwn(after, kind) || Object.hasOwn(before, kind)) {
          complete(Object.hasOwn(after, kind) && (create || Object.hasOwn(before, kind)), "Changed child family has missing evidence"); replayChildren(kind, create ? [] : before[kind], after[kind], sets[kind], productId, operationId, create);
        }
      }
      complete(state && equal(state, current), "Full reconstructed root differs from current facts");
      const actualSkus = (await query(`/* maintained-catalogue26:skus */ SELECT to_jsonb(s) AS facts,CASE WHEN s.created_operation_id IS NULL THEN false ELSE naijue_erp.native_creation_operation_valid('SKU',s.id,s.created_operation_id) END AS native_creation_valid,
        (${committedBefore("s")} AND (s.created_operation_id IS NULL OR (${committedBefore("r")} AND ${committedBefore("a")}))) AS committed_before
        FROM naijue_erp.sku s LEFT JOIN naijue_erp.operation_receipt r ON r.id=s.created_operation_id LEFT JOIN naijue_erp.audit_change a ON a.operation_id=s.created_operation_id
        WHERE s.product_id=$1::uuid ORDER BY s.id LIMIT $2 FOR SHARE OF s`, [productId, SKU_LIMIT + 1])).rows;
      complete(actualSkus.length > 0 && actualSkus.length <= SKU_LIMIT, "Full bounded current SKU set required");
      for (const row of actualSkus) { complete(row.committed_before === true, "Uncommitted SKU creation/update"); const sku = ownObject(row.facts); if (sku.created_operation_id !== null) complete(row.native_creation_valid === true, "SKU creation operation is not proven"); }
      complete(sameChildren(sets.skus, children("skus", actualSkus.map(r => r.facts), productId)), "Complete current SKU set differs from replay");
      const barcodes = (await query(`/* maintained-catalogue26:barcodes */ SELECT to_jsonb(b) AS facts,${committedBefore("b")} AS committed_before FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.product_id=$1::uuid ORDER BY b.id LIMIT $2 FOR SHARE OF b`, [productId, BARCODE_LIMIT + 1])).rows;
      complete(barcodes.length <= BARCODE_LIMIT && barcodes.every(r => r.committed_before === true), "Full committed bounded barcode set required");
      complete(sameChildren(sets.barcodes, children("barcodes", barcodes.map(r => r.facts), productId)), "Complete current barcode set differs from replay");
      const images = (await query(`/* maintained-catalogue26:images */ SELECT jsonb_build_object(${MAINTAINED_IMAGE.map(k => `'${k}',${k === "byte_size" ? "i.byte_size::text" : k === "created_at" ? `to_char(i.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` : `i.${k}`}`).join(",")}) AS facts,${committedBefore("i")} AS committed_before FROM naijue_erp.product_image i WHERE i.product_id=$1::uuid ORDER BY i.id LIMIT $2 FOR SHARE`, [productId, IMAGE_LIMIT + 1])).rows;
      complete(images.length <= IMAGE_LIMIT && images.every(r => r.committed_before === true) && sameChildren(sets.images, children("images", images.map(r => r.facts), productId)), "Image metadata differs from continuous audit; no file validation is implied");
      await currentReferences(query, current, sets.skus, sets.barcodes);
    }
    active(); await runtime.assertReady(client, "INVENTORY_ADMISSION"); active();
  } });
  return Object.freeze({ query, verifier });
}
async function importChildren(query: FactQuery, source: Facts, productId: string, sets: { skus: Map<string, Facts>; barcodes: Map<string, Facts> }): Promise<void> {
  // All declared aliases are read, rather than selecting the first source row.
  // A legitimate alias group must share one canonical identity and full native9.
  const rows = (await query(`/* maintained-catalogue26:import-skus */ SELECT s.id,s.batch_id,s.source_key,s.file_ref,s.sheet,s.row_no::text,s.source_file_sha256,s.row_sha256,s.field_provenance,
    x.old_source_sku_id,x.canonical_sku_id,x.canonical_source_key,x.source_row_id,
    EXISTS(SELECT 1 FROM naijue_erp.import_record f WHERE f.import_batch_id=s.batch_id AND f.source_entity_type='SKU' AND f.source_key=x.canonical_source_key AND f.target_type='SKU' AND f.target_id=x.canonical_sku_id AND f.status='IMPORTED') AS bound_record,
    ${committedBefore("s")} AS committed_before FROM naijue_erp.import_source_row s JOIN naijue_erp.import_sku_alias x ON x.batch_id=s.batch_id AND x.source_row_id=s.id
    WHERE s.batch_id=$1::uuid AND s.entity_type='SKU' AND s.field_provenance->'native_sku_import'->'native_sku'->>'product_id'=$2::text ORDER BY x.canonical_sku_id,s.id LIMIT $3 FOR SHARE OF s,x`, [source.batch_id, productId, BARCODE_LIMIT + 1])).rows;
  complete(rows.length > 0 && rows.length <= BARCODE_LIMIT, "Bounded full original SKU alias evidence required"); const groups = new Map<string, { key: string; count: number; representatives: number; sourceKeys: Set<string> }>();
  for (const row of rows) {
    const metadata = sourceIdentity(row), proof = ownObject(metadata.native_sku_import), sku = childFacts("skus", proof.native_sku, productId), id = uuid(sku.id), canonical = proof.canonical_source_key;
    complete(row.committed_before === true && row.bound_record === true && row.batch_id === source.batch_id && row.source_row_id === row.id && row.old_source_sku_id === row.source_key && row.canonical_sku_id === id && row.canonical_source_key === canonical && proof.native_sku_id === id && proof.schema_profile === "EXACT26" && proof.validator_version === "NATIVE_SKU_IMPORT_EXACT26_V1" && sku.created_operation_id === null, "Published exact canonical SKU binding required"); label(canonical); digest(proof.row_fingerprint);
    const refs = ownObject(proof.references); complete(ownObject(refs.product).nativeId === productId, "Imported SKU parent reference differs");
    const mapping = ownObject(proof.mapping);
    complete(mapping.oldSourceSkuId === row.source_key && mapping.canonicalSourceSkuId === canonical && mapping.productSourceId === source.source_key
      && typeof mapping.canonicalMemberCount === "string" && /^[1-9]\d*$/.test(mapping.canonicalMemberCount) && Number(mapping.canonicalMemberCount) <= BARCODE_LIMIT
      && (mapping.isRepresentative === "true" && row.source_key === canonical || mapping.isRepresentative === "false" && row.source_key !== canonical), "Complete declared SKU alias group required");
    for (const [name, key] of [["color", "color_id"], ["fit", "fit_id"], ["size", "size_id"]]) complete(ownObject(refs[name!]).nativeId === sku[key!], "Imported SKU coordinate reference differs");
    const prior = sets.skus.get(id), group = groups.get(id);
    complete(!prior || equal(prior, sku) && group!.key === canonical && group!.count === Number(mapping.canonicalMemberCount) && !group!.sourceKeys.has(row.source_key as string), "Conflicting SKU aliases");
    if (!group) groups.set(id, { key: canonical as string, count: Number(mapping.canonicalMemberCount), representatives: mapping.isRepresentative === "true" ? 1 : 0, sourceKeys: new Set([row.source_key as string]) });
    else { group.sourceKeys.add(row.source_key as string); if (mapping.isRepresentative === "true") group.representatives++; }
    sets.skus.set(id, sku);
  }
  complete(sets.skus.size <= SKU_LIMIT && [...groups.values()].every(g => g.sourceKeys.has(g.key) && g.representatives === 1 && g.sourceKeys.size === g.count), "Canonical representative or a declared alias is missing");
  const codes = (await query(`/* maintained-catalogue26:import-barcodes */ SELECT s.id,s.batch_id,s.source_key,s.file_ref,s.sheet,s.row_no::text,s.source_file_sha256,s.row_sha256,s.field_provenance,${committedBefore("s")} AS committed_before FROM naijue_erp.import_source_row s
    WHERE s.batch_id=$1::uuid AND s.entity_type='BARCODE' AND s.field_provenance->>'native_sku_id'=ANY($2::text[]) ORDER BY s.id LIMIT $3 FOR SHARE`, [source.batch_id, [...sets.skus.keys()], BARCODE_LIMIT + 1])).rows;
  complete(codes.length <= BARCODE_LIMIT, "Full original barcode evidence exceeds bound");
  for (const row of codes) {
    const metadata = sourceIdentity(row), proof = ownObject(metadata.native_barcode_import), code = childFacts("barcodes", proof.native_barcode, productId), id = uuid(code.id);
    complete(row.committed_before === true && row.batch_id === source.batch_id && proof.validator_version === "NATIVE_BARCODE_IMPORT_V1" && metadata.native_sku_id === code.sku_id && metadata.native_barcode === code.barcode && sets.skus.has(code.sku_id as string) && !sets.barcodes.has(id), "Exact original SKU barcode binding required"); digest(proof.row_fingerprint); sets.barcodes.set(id, code);
  }
}
async function currentReferences(query: FactQuery, product: Facts, skus: Map<string, Facts>, codes: Map<string, Facts>): Promise<void> {
  const targets = new Map<string, Set<string>>();
  const add = (table: string, value: unknown) => { if (value !== null) { const id = uuid(value); if (!targets.has(table)) targets.set(table, new Set()); targets.get(table)!.add(id); } };
  add("size_group", product.size_group_id); add("supplier", product.supplier_id); add("season", product.season_id); add("barcode_scheme", product.default_barcode_scheme_id);
  for (const season of product.season_ids as string[] | null ?? []) add("season", season);
  const coordinates = new Set<string>(), skuCodes = new Set<string>();
  for (const sku of skus.values()) {
    const coordinate = JSON.stringify([sku.color_id, sku.fit_id, sku.size_id]); complete(!coordinates.has(coordinate) && !skuCodes.has(sku.sku_code as string), "Duplicate SKU coordinate or code"); coordinates.add(coordinate); skuCodes.add(sku.sku_code as string);
    add("color", sku.color_id); add("fit", sku.fit_id); add("size", sku.size_id);
  }
  const mains = new Set<string>(), raw = new Set<string>();
  for (const code of codes.values()) { complete(skus.has(code.sku_id as string) && !raw.has(code.barcode as string), "Foreign or duplicate raw barcode"); raw.add(code.barcode as string); add("barcode_scheme", code.scheme_id);
    if (code.enabled && code.barcode_kind === "MAIN") { complete(!mains.has(code.sku_id as string), "Ambiguous enabled MAIN barcode"); mains.add(code.sku_id as string); } }
  for (const [table, wanted] of targets) for (let i = 0, ids = [...wanted].sort(); i < ids.length; i += SALES_NATIVE_FACT_QUERY_BATCH_SIZE) {
    const batch = ids.slice(i, i + SALES_NATIVE_FACT_QUERY_BATCH_SIZE), rows = (await query(`/* maintained-catalogue26:reference:${table} */ SELECT to_jsonb(d) AS facts FROM naijue_erp.${table} d WHERE d.id=ANY($1::uuid[]) ORDER BY d.id LIMIT $2 FOR SHARE`, [batch, batch.length + 1])).rows;
    complete(rows.length === batch.length && new Set(rows.map(r => uuid(ownObject(r.facts).id))).size === batch.length && rows.every(r => batch.includes(ownObject(r.facts).id as string)), "Full current referenced dictionary set required");
  }
  const visited = new Set<string>(); let category: unknown = product.category_id;
  while (category !== null) {
    const id = uuid(category); complete(visited.size < 64 && !visited.has(id), "Category path is cyclic or incomplete"); visited.add(id);
    const rows = (await query(`/* maintained-catalogue26:category */ SELECT id,parent_id,deleted_at FROM naijue_erp.product_category WHERE id=$1::uuid FOR SHARE`, [id])).rows;
    complete(rows.length === 1 && rows[0]!.id === id && rows[0]!.deleted_at === null, "Current retained category path required"); category = rows[0]!.parent_id;
  }
  const sizes = [...new Set([...skus.values()].map(s => uuid(s.size_id)))].sort();
  for (let i = 0; i < sizes.length; i += SALES_NATIVE_FACT_QUERY_BATCH_SIZE) {
    const batch = sizes.slice(i, i + SALES_NATIVE_FACT_QUERY_BATCH_SIZE), rows = (await query(`/* maintained-catalogue26:membership */ SELECT size_group_id,size_id FROM naijue_erp.size_group_member WHERE size_group_id=$1::uuid AND size_id=ANY($2::uuid[]) ORDER BY size_id LIMIT $3 FOR SHARE`, [product.size_group_id, batch, batch.length + 1])).rows;
    complete(rows.length === batch.length && new Set(rows.map(r => r.size_id)).size === batch.length && rows.every(r => r.size_group_id === product.size_group_id && batch.includes(r.size_id as string)), "Every actual SKU size needs current group membership");
  }
}
