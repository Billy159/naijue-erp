import { requestHash } from "../../../packages/application/src/request-hash.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { createCatalogueSourcePriceProof } from "../../../packages/application/src/catalogue-source-proof.ts";
import { validatePreparedProductEvidenceChunk } from "../../../packages/application/src/product-evidence-staging.ts";
import type { PreparedProductEvidenceChunk, ProductEvidenceStagingStore } from "../../../packages/application/src/product-evidence-staging.ts";
import { insertValidatedCatalogueSourceProof } from "./catalogue-completeness.ts";
import type { PgSalesPool, PgSalesClient } from "./sales-unit-of-work.ts";

/** Existing native products only. Does NOT create products, guesses or batches;
 * no publication, baseline effects, receipts or automatic retry on unknown COMMIT.
 * Every source+proof row in a bounded chunk commits or rolls back together. */
export class PostgresProductEvidenceStagingStore implements ProductEvidenceStagingStore {
  private readonly pool: PgSalesPool;
  constructor(pool: PgSalesPool) { this.pool = pool; }
  async stage(input: PreparedProductEvidenceChunk): Promise<{ inserted: number; replayed: number }> {
    const chunk = structuredClone(input); validatePreparedProductEvidenceChunk(chunk);
    const client = await this.pool.connect(); let began = false, committing = false, discard: Error | undefined;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      const result = await this.write(client, chunk);
      committing = true; await client.query("COMMIT"); return result;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error("Product evidence outcome unknown");
      if (began) try { await client.query("ROLLBACK"); } catch (rollback) {
        discard = rollback instanceof Error ? rollback : new Error("Product evidence rollback failed");
        throw new AggregateError([error, rollback], "Product evidence staging failed; discard connection");
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async write(client: PgSalesClient, chunk: PreparedProductEvidenceChunk): Promise<{ inserted: number; replayed: number }> {
    await client.query("/* product-stage:lock */ SELECT naijue_erp.cutoff_import_lock()");
    const batches = (await client.query(`/* product-stage:batch */ SELECT id, mapping_version, status, source_hash, source_name
      FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`, [chunk.batchId])).rows;
    const batch = batches[0];
    requireDomain(batches.length === 1 && batch?.id === chunk.batchId && batch.mapping_version === chunk.mappingVersion
      && (batch.status === "STAGED" || batch.status === "VALIDATING") && batch.source_hash === chunk.selection.selectionSha256
      && batch.source_name === chunk.fixedSourceNamespace, "PRODUCT_STAGE_BATCH", "Reviewed open batch must match exact selected input identity");
    let inserted = 0, replayed = 0;
    for (const row of chunk.rows) {
      const s = row.source, product = row.product;
      const targets = (await client.query(`/* product-stage:target */ SELECT id, version, product_code, name FROM naijue_erp.product
        WHERE id=$1::uuid FOR SHARE`, [product.nativeId])).rows;
      requireDomain(targets.length === 1 && targets[0]!.id === product.nativeId && targets[0]!.version === product.expectedVersion
        && targets[0]!.product_code === s.normalizedFields["款号"] && targets[0]!.name === s.normalizedFields["商品名称"],
      "PRODUCT_STAGE_NATIVE_TARGET", "Actual native product/version/code/name binding is missing or stale; no product is invented");
      const proof = createCatalogueSourcePriceProof({ nativeProductId: product.nativeId, productVersion: product.expectedVersion,
        rawFields: s.rawFields, blankPricePolicy: row.blankPricePolicy });
      // Selection is persisted inside the existing per-field metadata envelope;
      // not a new product field, schema object or replacement for raw cells.
      const fields = { ...(s.fieldProvenance.fields as Record<string, unknown>), product_staging: {
        origin: "MIGRATION_DERIVED", reason: "Explicit effective selection and native product binding", raw: null,
        evidence_ref: chunk.selection.selectionSha256, validator_version: "PRODUCT_SOURCE_STAGE_V1", selection: chunk.selection,
        row_fingerprint: requestHash({ selection: chunk.selection, row }), native_product_id: product.nativeId
      } };
      const metadata = { schema_version: 1, fields, ...proof };
      const expected = { id: s.id, batch_id: s.batchId, entity_type: "PRODUCT", source_key: s.sourceKey, file_ref: s.fileRef,
        sheet: s.sheet, row_no: s.rowNo, source_file_sha256: s.sourceFileSha256, row_sha256: s.rowSha256,
        raw_fields: s.rawFields, normalized_fields: s.normalizedFields, field_provenance: metadata };
      const previous = (await client.query(`/* product-stage:replay */ SELECT
        (to_jsonb(s) || jsonb_build_object('row_no', s.row_no::text))=$2::jsonb AS source_equal
        FROM naijue_erp.import_source_row s WHERE s.id=$1::uuid`, [s.id, JSON.stringify(expected)])).rows;
      if (previous.length > 0) {
        requireDomain(previous.length === 1 && previous[0]!.source_equal === true, "PRODUCT_STAGE_REPLAY_CONFLICT", "Immutable source/proof differs on replay");
        // Writer checks actual all-nine values on inserts. Replays must check too,
        // not turn an old proof into authority after an in-place price mutation.
        const priceCheck = (await client.query(`/* product-stage:replay-prices */ SELECT
          ${Object.keys(proof.product_input_proof.prices).map(key => `(${key} IS NOT DISTINCT FROM ($2::jsonb->>'${key}')::numeric)`).join(" AND ")} AS prices_equal
          FROM naijue_erp.product WHERE id=$1::uuid FOR SHARE`, [product.nativeId, JSON.stringify(proof.product_input_proof.prices)])).rows;
        requireDomain(priceCheck.length === 1 && priceCheck[0]!.prices_equal === true, "PRODUCT_STAGE_NATIVE_TARGET", "Replayed evidence no longer matches native prices");
        replayed++; continue;
      }
      await insertValidatedCatalogueSourceProof((sql, values) => client.query(sql, values), { sourceRowId: s.id, batchId: s.batchId,
        nativeProductId: product.nativeId, sourceKey: s.sourceKey, fileRef: s.fileRef, sheet: s.sheet, rowNo: s.rowNo,
        sourceFileSha256: s.sourceFileSha256, rowSha256: s.rowSha256, rawFields: s.rawFields, normalizedFields: s.normalizedFields,
        fields, blankPricePolicy: row.blankPricePolicy });
      inserted++;
    }
    return { inserted, replayed };
  }
}
