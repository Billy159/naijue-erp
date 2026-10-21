import { DomainError, requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId, version } from "../../../packages/domain/src/values.ts";
import { CATALOGUE_PRICE_KEYS, CATALOGUE_PRICE_VALIDATOR_VERSION, validateCompleteCataloguePrices } from "../../../packages/application/src/catalogue-price-input.ts";
import { createCatalogueSourcePriceProof } from "../../../packages/application/src/catalogue-source-proof.ts";
import type { CatalogueBlankPricePolicy } from "../../../packages/application/src/catalogue-source-proof.ts";
import { SALES_NATIVE_FACT_MAX_LINES, SALES_NATIVE_FACT_QUERY_BATCH_SIZE } from "../../../packages/application/src/sales-native-facts.ts";
import type { NativeCatalogueCompletenessVerifier } from "./sales-native-facts.ts";
import { integerValue, jsonObject, stringValue } from "./codec.ts";

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
