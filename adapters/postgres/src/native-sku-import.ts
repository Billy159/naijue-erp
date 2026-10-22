import { assertNativeImportAccountingGuards } from "./native-import-accounting-capability.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { nativeSkuAliasEvidence, validatePreparedNativeSkuImport } from "../../../packages/application/src/native-sku-import.ts";
import type { NativeSkuImportStore, NativeSkuReference, PreparedNativeSkuImport } from "../../../packages/application/src/native-sku-import.ts";
import { CATALOGUE_PRICE_KEYS } from "../../../packages/application/src/catalogue-price-input.ts";
import { assertReviewedNativeImportSchema } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { PgSalesClient, PgSalesPool } from "./sales-unit-of-work.ts";

const PRODUCT_COLUMNS = ["id", "product_code", "name", "category_id", "supplier_id", "season_id", "size_group_id", "year",
  "system_item_code", "thickness", "collar_pants_type", "enabled", "version", ...CATALOGUE_PRICE_KEYS] as const;
const nativeProductJson = `jsonb_build_object(${PRODUCT_COLUMNS.map(key => `'${key}',p.${key}${(CATALOGUE_PRICE_KEYS as readonly string[]).includes(key) ? "::text" : ""}`).join(",")})`;

/** Internal source-only schema-14 adapter. No connection unless STAGE was explicitly authorized.
 * Not a barcode/stock/publication creator and not a substitute for a real PostgreSQL acceptance run. */
export class PostgresNativeSkuImportStore implements NativeSkuImportStore {
  private readonly pool: PgSalesPool;
  constructor(pool: PgSalesPool) { this.pool = pool; }
  async stage(input: PreparedNativeSkuImport): Promise<{ inserted: number; replayed: number }> {
    const row = structuredClone(input); validatePreparedNativeSkuImport(row);
    const client = await this.pool.connect(); let began = false, committing = false, discard: Error | undefined;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      const result = await this.write(client, row);
      committing = true; await client.query("COMMIT"); return result;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error("Native SKU COMMIT outcome unknown; inspect exact replay before manual retry");
      if (began && !committing) try { await client.query("ROLLBACK"); } catch (rollback) {
        discard = rollback instanceof Error ? rollback : new Error("Native SKU rollback failed");
        throw new AggregateError([error, rollback], "Native SKU import failed; discard connection");
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async catalogue(client: PgSalesClient, row: PreparedNativeSkuImport, entity: "COLOR" | "FIT" | "SIZE" | "SIZE_GROUP", ref: NativeSkuReference): Promise<void> {
    const table = { COLOR: "color", FIT: "fit", SIZE: "size", SIZE_GROUP: "size_group" }[entity];
    const targetColumn = { COLOR: "color_id", FIT: "fit_id", SIZE: "size_id", SIZE_GROUP: "size_group_id" }[entity];
    const bindings = (await client.query(`/* native-sku:catalogue:${entity} */ SELECT b.native_snapshot=$4::jsonb AS binding_equal,
      to_jsonb(n)=$4::jsonb AS native_equal FROM naijue_erp.import_native_catalogue_binding b
      JOIN naijue_erp.${table} n ON n.id=b.${targetColumn}
      WHERE b.batch_id=$1::uuid AND b.entity_type=$2 AND b.source_key=$5 AND n.id=$3::uuid
      FOR SHARE OF b,n`, [row.batchId, entity, ref.nativeId, JSON.stringify(ref.nativeSnapshot), ref.sourceKey])).rows;
    requireDomain(bindings.length === 1 && bindings[0]!.binding_equal === true && bindings[0]!.native_equal === true,
      "NATIVE_SKU_CATALOGUE_BINDING", "Exact same-batch dictionary binding and locked native row required");
  }
  private async write(client: PgSalesClient, row: PreparedNativeSkuImport): Promise<{ inserted: number; replayed: number }> {
    await client.query("/* native-sku:cutoff */ SELECT naijue_erp.cutoff_import_lock()");
    const versions = (await client.query(`/* native-sku:schema */ SELECT
      array_agg(version ORDER BY version) AS installed_versions FROM naijue_erp.schema_migration`)).rows;
    requireDomain(versions.length === 1, "NATIVE_SKU_SCHEMA_NOT_READY", "Schema migration registry required");
    const reviewedSchema = assertReviewedNativeImportSchema(versions[0]!.installed_versions,
      { minimumVersion: 14, errorCode: "NATIVE_SKU_SCHEMA_NOT_READY" });
    if ((reviewedSchema.versions.length === 18 || reviewedSchema.versions.length === 19)) await assertNativeImportAccountingGuards(client);
    const batches = (await client.query(`/* native-sku:batch */ SELECT id,mapping_version,status,source_hash,source_name,
      EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') AS already_published
      FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`, [row.batchId])).rows;
    const batch = batches[0];
    requireDomain(batches.length === 1 && batch?.id === row.batchId && batch.mapping_version === row.mappingVersion
      && (batch.status === "STAGED" || batch.status === "VALIDATING") && batch.source_hash === row.selection.selectionSha256
      && batch.source_name === row.fixedSourceNamespace && batch.already_published === false,
      "NATIVE_SKU_BATCH", "Exact selected open unpublished import batch required");
    const k = row.nativeSku;
    const targets = (await client.query(`/* native-sku:target */ SELECT k.id,to_jsonb(k)=$2::jsonb AS native_equal
      FROM naijue_erp.sku k WHERE k.id=$1::uuid OR k.sku_code=$3
        OR (k.product_id=$4::uuid AND k.color_id=$5::uuid AND k.fit_id=$6::uuid AND k.size_id=$7::uuid)
      ORDER BY k.id FOR UPDATE`, [k.id, JSON.stringify(k), k.sku_code, k.product_id, k.color_id, k.fit_id, k.size_id])).rows;
    requireDomain(targets.length <= 1 && (targets.length === 0 || (targets[0]!.id === k.id && targets[0]!.native_equal === true)),
      "NATIVE_SKU_TARGET_CONFLICT", "Native SKU identity/code/tuple cannot collide or drift");
    const product = row.references.product;
    const products = (await client.query(`/* native-sku:product */ SELECT p.id,p.size_group_id,
      ${nativeProductJson}=$4::jsonb AS native_equal,
      s.id AS source_row_id FROM naijue_erp.product p JOIN naijue_erp.import_source_row s
        ON s.batch_id=$1::uuid AND s.entity_type='PRODUCT' AND s.source_key=$2 AND s.field_provenance->>'native_product_id'=p.id::text
      WHERE p.id=$3::uuid FOR SHARE OF p,s`, [row.batchId, product.sourceKey, product.nativeId,
        JSON.stringify(product.nativeSnapshot)])).rows;
    requireDomain(products.length === 1 && products[0]!.id === product.nativeId
      && products[0]!.size_group_id === row.references.sizeGroup.nativeId
      && products[0]!.native_equal === true,
      "NATIVE_SKU_PRODUCT_BINDING", "Exact same-batch native PRODUCT proof and size group required");
    for (const entity of ["COLOR", "FIT", "SIZE", "SIZE_GROUP"] as const)
      await this.catalogue(client, row, entity, row.references[entity === "SIZE_GROUP" ? "sizeGroup" : entity.toLowerCase() as "color" | "fit" | "size"]);
    const members = (await client.query(`/* native-sku:group-member */ SELECT m.size_group_id,m.size_id FROM naijue_erp.size_group_member m
      WHERE m.size_group_id=$1::uuid AND m.size_id=$2::uuid FOR SHARE`, [row.references.sizeGroup.nativeId, k.size_id])).rows;
    requireDomain(members.length === 1, "NATIVE_SKU_SIZE_NOT_IN_GROUP", "Exact actual product size-group membership required");
    const record = row.importRecord;
    const oldRecord = (await client.query(`/* native-sku:record-replay */ SELECT id,import_batch_id,source_entity_type,source_key,
      source_record_hash,source_file_ref,target_type,target_id,status,decision_reason,
      reviewed_at=$5::timestamptz AS reviewed_equal FROM naijue_erp.import_record
      WHERE id=$1::uuid OR (import_batch_id=$2::uuid AND source_entity_type='SKU' AND source_key=$3)
        OR (import_batch_id=$2::uuid AND target_type='SKU' AND target_id=$4::uuid)
      ORDER BY id LIMIT 2 FOR SHARE`, [record.id, row.batchId, row.canonicalSource.sourceKey, k.id, record.reviewedAt])).rows;
    if (oldRecord.length > 0) {
      const r = oldRecord[0]!;
      requireDomain(oldRecord.length === 1 && r.id === record.id && r.import_batch_id === row.batchId
        && r.source_entity_type === "SKU" && r.source_key === row.canonicalSource.sourceKey
        && r.source_record_hash === row.canonicalSource.rowSha256 && r.source_file_ref === row.canonicalSource.fileRef
        && r.target_type === "SKU" && r.target_id === k.id && r.status === "IMPORTED"
        && r.decision_reason === record.decisionReason && r.reviewed_equal === true,
      "NATIVE_SKU_RECORD_CONFLICT", "Only exact immutable native SKU source record may replay");
    }
    const previous: boolean[] = [];
    for (const alias of [...row.aliases].sort((a, b) => a.source.sourceKey.localeCompare(b.source.sourceKey))) {
      const s = alias.source, evidence = nativeSkuAliasEvidence(row, alias);
      const source = (await client.query(`/* native-sku:source-replay */ SELECT
        (to_jsonb(s)||jsonb_build_object('row_no',s.row_no::text))=$2::jsonb AS equal FROM naijue_erp.import_source_row s
        WHERE s.id=$1::uuid OR (s.batch_id=$3::uuid AND ((s.entity_type='SKU' AND s.source_key=$4)
          OR (s.source_file_sha256=$5 AND s.sheet=$6 AND s.row_no=$7::bigint))) ORDER BY s.id LIMIT 2 FOR SHARE`,
      [s.id, JSON.stringify(evidence), row.batchId, s.sourceKey, s.sourceFileSha256, s.sheet, s.rowNo])).rows;
      const oldAlias = (await client.query(`/* native-sku:alias-replay */ SELECT to_jsonb(a)=$4::jsonb AS equal
        FROM naijue_erp.import_sku_alias a WHERE (a.batch_id=$1::uuid AND a.old_source_sku_id=$2)
          OR (a.batch_id=$1::uuid AND a.source_row_id=$3::uuid) ORDER BY a.old_source_sku_id LIMIT 2 FOR SHARE`,
      [row.batchId, s.sourceKey, s.id, JSON.stringify({ batch_id: row.batchId, old_source_sku_id: s.sourceKey,
        canonical_sku_id: k.id, source_row_id: s.id, canonical_source_key: row.canonicalSource.sourceKey,
        mapping_basis: alias.mapping.mappingBasis })])).rows;
      requireDomain(source.length <= 1 && oldAlias.length <= 1 && (source.length === 0 || source[0]!.equal === true)
        && (oldAlias.length === 0 || oldAlias[0]!.equal === true) && (source.length === 0) === (oldAlias.length === 0),
      "NATIVE_SKU_ALIAS_REPLAY_CONFLICT", "Native SKU old source and alias must replay exactly together");
      previous.push(source.length === 1);
    }
    const replay = previous.every(Boolean), fresh = previous.every(v => !v);
    requireDomain((replay && targets.length === 1 && oldRecord.length === 1)
      || (fresh && targets.length === 0 && oldRecord.length === 0),
    "NATIVE_SKU_PARTIAL_OR_ADOPTED", "No partial repair or adoption of pre-existing native/source rows");
    if (replay) return { inserted: 0, replayed: row.aliases.length };
    const created = await client.query(`/* native-sku:create */ INSERT INTO naijue_erp.sku
      (id,product_id,color_id,fit_id,size_id,sku_code,enabled,version)
      VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8) RETURNING id`,
    [k.id, k.product_id, k.color_id, k.fit_id, k.size_id, k.sku_code, k.enabled, k.version]);
    requireDomain(created.rowCount === 1 && created.rows[0]!.id === k.id, "NATIVE_SKU_CREATE_FAILED", "Exactly one native SKU must be created");
    for (const alias of [...row.aliases].sort((a, b) => a.source.sourceKey.localeCompare(b.source.sourceKey))) {
      const s = alias.source, e = nativeSkuAliasEvidence(row, alias);
      const sr = await client.query(`/* native-sku:source-create */ INSERT INTO naijue_erp.import_source_row
        SELECT x.* FROM jsonb_populate_record(NULL::naijue_erp.import_source_row,$1::jsonb) x RETURNING id`, [JSON.stringify(e)]);
      requireDomain(sr.rowCount === 1 && sr.rows[0]!.id === s.id, "NATIVE_SKU_SOURCE_FAILED", "Exactly one original SKU source row required");
      const ar = await client.query(`/* native-sku:alias-create */ INSERT INTO naijue_erp.import_sku_alias
        (batch_id,old_source_sku_id,canonical_sku_id,source_row_id,canonical_source_key,mapping_basis)
        VALUES ($1::uuid,$2,$3::uuid,$4::uuid,$5,$6) RETURNING source_row_id`,
      [row.batchId, s.sourceKey, k.id, s.id, row.canonicalSource.sourceKey, alias.mapping.mappingBasis]);
      requireDomain(ar.rowCount === 1 && ar.rows[0]!.source_row_id === s.id,
        "NATIVE_SKU_ALIAS_FAILED", "Exactly one immutable old-to-canonical alias required");
    }
    const ir = await client.query(`/* native-sku:record-create */ INSERT INTO naijue_erp.import_record
      (id,import_batch_id,source_entity_type,source_key,source_record_hash,source_file_ref,target_type,target_id,status,decision_reason,reviewed_at)
      VALUES ($1::uuid,$2::uuid,'SKU',$3,$4,$5,'SKU',$6::uuid,'IMPORTED',$7,$8::timestamptz) RETURNING id`,
    [record.id, row.batchId, row.canonicalSource.sourceKey, row.canonicalSource.rowSha256,
      row.canonicalSource.fileRef, k.id, record.decisionReason, record.reviewedAt]);
    requireDomain(ir.rowCount === 1 && ir.rows[0]!.id === record.id, "NATIVE_SKU_RECORD_FAILED", "Exactly one reviewed SKU import identity required");
    return { inserted: row.aliases.length, replayed: 0 };
  }
}
