import { assertNativeImportAccountingGuards } from "./native-import-accounting-capability.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { CATALOGUE_PRICE_KEYS } from "../../../packages/application/src/catalogue-price-input.ts";
import { nativeProductImportEvidence, validatePreparedNativeProductImportChunk } from "../../../packages/application/src/native-product-import.ts";
import type { NativeProductImportStore, NativeProductReferences, PreparedNativeProductImportChunk } from "../../../packages/application/src/native-product-import.ts";
import { requestHash } from "../../../packages/application/src/request-hash.ts";
import { assertReviewedNativeImportSchema } from "../../../packages/application/src/native-import-schema-contract.ts";
import { insertValidatedCatalogueSourceProof } from "./catalogue-completeness.ts";
import type { PgSalesClient, PgSalesPool } from "./sales-unit-of-work.ts";

const BASE_COLUMNS = ["id", "product_code", "name", "category_id", "supplier_id", "season_id", "size_group_id", "year",
  "system_item_code", "thickness", "collar_pants_type", "enabled", "version"] as const;
const PRODUCT_COLUMNS = [...BASE_COLUMNS, ...CATALOGUE_PRICE_KEYS];
const nativeJson = `jsonb_build_object(${PRODUCT_COLUMNS.map(key => `'${key}', p.${key}${(CATALOGUE_PRICE_KEYS as readonly string[]).includes(key) ? "::text" : ""}`).join(", ")})`;

/** Trusted explicitly reviewed schema-11/12 import adapter, NOT live CREATE or a public write endpoint.
 * No DDL, source loader, default authority, dictionaries, SKU/barcode/stock writes,
 * publication, guessed IDs/values, or automatic retry. Default orchestration is DRY_RUN.
 * Cutoff -> batch -> ALL native targets (created if absent) -> immutable sources.
 * The proof writer reuses these already-held locks and this same client. */
export class PostgresNativeProductImportStore implements NativeProductImportStore {
  private readonly pool: PgSalesPool;
  constructor(pool: PgSalesPool) { this.pool = pool; }
  async stage(input: PreparedNativeProductImportChunk): Promise<{ inserted: number; replayed: number }> {
    const chunk = structuredClone(input); validatePreparedNativeProductImportChunk(chunk);
    const client = await this.pool.connect(); let began = false, committing = false, discard: Error | undefined;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      const result = await this.write(client, chunk);
      committing = true; await client.query("COMMIT"); return result;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error("Native product import outcome unknown");
      if (began) try { await client.query("ROLLBACK"); } catch (rollback) {
        discard = rollback instanceof Error ? rollback : new Error("Native product import rollback failed");
        throw new AggregateError([error, rollback], "Native product import failed; discard connection");
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async references(client: PgSalesClient, refs: NativeProductReferences): Promise<void> {
    const categories = (await client.query(`/* native-product-import:category */ SELECT id, parent_id, name, version
      FROM naijue_erp.product_category WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE`, [refs.category.path.map(part => part.nativeId)])).rows;
    requireDomain(categories.length === refs.category.path.length, "NATIVE_PRODUCT_REFERENCE_STALE", "Complete actual category chain required");
    const byId = new Map(categories.map(part => [part.id, part]));
    for (let index = 0; index < refs.category.path.length; index++) {
      const expected = refs.category.path[index]!, actual = byId.get(expected.nativeId);
      requireDomain(actual && actual.name === expected.name && actual.version === expected.expectedVersion
        && actual.parent_id === (index === 0 ? null : refs.category.path[index - 1]!.nativeId),
      "NATIVE_PRODUCT_REFERENCE_STALE", "Category identity, parent path, name or version changed");
    }
    const groups = (await client.query(`/* native-product-import:size-group */ SELECT id, code, name FROM naijue_erp.size_group WHERE id=$1::uuid FOR SHARE`, [refs.sizeGroup.nativeId])).rows;
    requireDomain(groups.length === 1 && groups[0]!.id === refs.sizeGroup.nativeId && groups[0]!.code === refs.sizeGroup.code && groups[0]!.name === refs.sizeGroup.name,
      "NATIVE_PRODUCT_REFERENCE_STALE", "Actual explicitly mapped size group required");
    // Native inventory readers reject products whose group has no actual sizes.
    // Lock one real member+size, rather than an unlocked EXISTS that can go stale
    // before COMMIT. This does not invent or claim a complete SKU/member mapping.
    const members = (await client.query(`/* native-product-import:size-group-member */ SELECT m.size_group_id, m.size_id
      FROM naijue_erp.size_group_member m JOIN naijue_erp.size z ON z.id=m.size_id
      WHERE m.size_group_id=$1::uuid ORDER BY m.size_id LIMIT 1 FOR SHARE OF m, z`, [refs.sizeGroup.nativeId])).rows;
    requireDomain(members.length === 1 && members[0]!.size_group_id === refs.sizeGroup.nativeId,
      "NATIVE_PRODUCT_REFERENCE_STALE", "An actual locked size-group member is required; empty groups are not native catalogue targets");
    entityId("size", members[0]!.size_id as string);
    if (refs.season !== null) {
      const seasons = (await client.query(`/* native-product-import:season */ SELECT id, code, name FROM naijue_erp.season WHERE id=$1::uuid FOR SHARE`, [refs.season.nativeId])).rows;
      requireDomain(seasons.length === 1 && seasons[0]!.id === refs.season.nativeId && seasons[0]!.code === refs.season.code && seasons[0]!.name === refs.season.name,
        "NATIVE_PRODUCT_REFERENCE_STALE", "Actual explicitly mapped season required");
    }
    if (refs.supplier !== null) {
      const suppliers = (await client.query(`/* native-product-import:supplier */ SELECT id, code, name, enabled, version FROM naijue_erp.supplier WHERE id=$1::uuid FOR SHARE`, [refs.supplier.nativeId])).rows;
      requireDomain(suppliers.length === 1 && suppliers[0]!.id === refs.supplier.nativeId && suppliers[0]!.code === refs.supplier.code && suppliers[0]!.name === refs.supplier.name
        && suppliers[0]!.version === refs.supplier.expectedVersion && suppliers[0]!.enabled === refs.supplier.enabled,
      "NATIVE_PRODUCT_REFERENCE_STALE", "Actual explicitly mapped supplier snapshot required");
    }
  }
  private async write(client: PgSalesClient, chunk: PreparedNativeProductImportChunk): Promise<{ inserted: number; replayed: number }> {
    await client.query("/* native-product-import:lock */ SELECT naijue_erp.cutoff_import_lock()");
    const schema = (await client.query(`/* native-product-import:schema */ SELECT
      array_agg(version ORDER BY version) AS installed_versions FROM naijue_erp.schema_migration`)).rows;
    requireDomain(schema.length === 1, "NATIVE_PRODUCT_SCHEMA_NOT_READY", "Actual migration registry required");
    const reviewedSchema = assertReviewedNativeImportSchema(schema[0]!.installed_versions, { minimumVersion: 11, errorCode: "NATIVE_PRODUCT_SCHEMA_NOT_READY" });
    if (reviewedSchema.versions.length === 18) await assertNativeImportAccountingGuards(client);
    const batches = (await client.query(`/* native-product-import:batch */ SELECT id, mapping_version, status, source_hash, source_name
      FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`, [chunk.batchId])).rows;
    const batch = batches[0];
    requireDomain(batches.length === 1 && batch?.id === chunk.batchId && batch.mapping_version === chunk.mappingVersion
      && (batch.status === "STAGED" || batch.status === "VALIDATING") && batch.source_hash === chunk.selection.selectionSha256
      && batch.source_name === chunk.fixedSourceNamespace, "NATIVE_PRODUCT_BATCH", "Reviewed open batch and exact selection/namespace required");
    const indexes = chunk.nativeProducts.map((product, index) => ({ id: product.id, index })).sort((a, b) => a.id.localeCompare(b.id)).map(row => row.index);
    const created = new Set<number>();
    // Acquire every pre-existing product lock before any source-row access.
    for (const index of indexes) {
      const product = chunk.nativeProducts[index]!;
      const targets = (await client.query(`/* native-product-import:target */ SELECT p.id, ${nativeJson}=$2::jsonb AS native_equal
        FROM naijue_erp.product p WHERE p.id=$1::uuid OR p.product_code=$3 ORDER BY p.id FOR UPDATE`, [product.id, JSON.stringify(product), product.product_code])).rows;
      if (targets.length === 0) created.add(index);
      else requireDomain(targets.length === 1 && targets[0]!.id === product.id && targets[0]!.native_equal === true,
        "NATIVE_PRODUCT_TARGET_CONFLICT", "Existing native ID/code must match every approved native field; never overwrite or adopt");
    }
    const verifiedReferences = new Set<string>();
    for (const index of indexes) {
      const refs = chunk.rows[index]!.references, fingerprint = requestHash(refs);
      if (!verifiedReferences.has(fingerprint)) { await this.references(client, refs); verifiedReferences.add(fingerprint); }
    }
    // Complete native creation before immutable sources. A later proof failure
    // rolls back ALL native rows; no exposed product-without-proof intermediate state.
    for (const index of indexes) if (created.has(index)) {
      const product = chunk.nativeProducts[index]!;
      const result = await client.query(`/* native-product-import:create */ INSERT INTO naijue_erp.product (${PRODUCT_COLUMNS.join(", ")})
        VALUES (${PRODUCT_COLUMNS.map((key, position) => `$${position + 1}${key === "id" || key.endsWith("_id") ? "::uuid" : (CATALOGUE_PRICE_KEYS as readonly string[]).includes(key) ? "::numeric" : ""}`).join(", ")}) RETURNING id`,
      PRODUCT_COLUMNS.map(key => product[key]));
      requireDomain(result.rowCount === 1 && result.rows.length === 1 && result.rows[0]!.id === product.id, "NATIVE_PRODUCT_CREATE_FAILED", "Exactly one actual native product must be created");
    }
    let inserted = 0, replayed = 0;
    for (const index of indexes) {
      const row = chunk.rows[index]!, s = row.source, product = chunk.nativeProducts[index]!, evidence = nativeProductImportEvidence(chunk, index);
      const previous = (await client.query(`/* native-product-import:replay */ SELECT
        (to_jsonb(s) || jsonb_build_object('row_no', s.row_no::text))=$2::jsonb AS source_equal
        FROM naijue_erp.import_source_row s WHERE s.id=$1::uuid OR (s.batch_id=$3::uuid AND (
          (s.entity_type='PRODUCT' AND (s.source_key=$4 OR s.field_provenance->>'native_product_id'=$5))
          OR (s.source_file_sha256=$6 AND s.sheet=$7 AND s.row_no=$8::bigint))) ORDER BY s.id LIMIT 2 FOR SHARE`,
      [s.id, JSON.stringify(evidence.source), chunk.batchId, s.sourceKey, product.id, s.sourceFileSha256, s.sheet, s.rowNo])).rows;
      if (previous.length > 0) {
        requireDomain(!created.has(index) && previous.length === 1 && previous[0]!.source_equal === true,
          "NATIVE_PRODUCT_REPLAY_CONFLICT", "Exact immutable source and actual native product must already exist together"); replayed++; continue;
      }
      requireDomain(created.has(index), "NATIVE_PRODUCT_UNPROVEN_EXISTING_TARGET", "Existing products cannot be adopted by the native creator; use the separately reviewed existing-target proof path");
      await insertValidatedCatalogueSourceProof((sql, values) => client.query(sql, values), { sourceRowId: s.id, batchId: s.batchId,
        nativeProductId: product.id, sourceKey: s.sourceKey, fileRef: s.fileRef, sheet: s.sheet, rowNo: s.rowNo,
        sourceFileSha256: s.sourceFileSha256, rowSha256: s.rowSha256, rawFields: s.rawFields, normalizedFields: s.normalizedFields,
        fields: evidence.fields, blankPricePolicy: row.blankPricePolicy });
      inserted++;
    }
    return { inserted, replayed };
  }
}
