import { assertNativeImportAccountingGuards } from "./native-import-accounting-capability.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { nativeStockSourceEvidence, validatePreparedNativeStockGroup } from "../../../packages/application/src/native-stock-contributor-import.ts";
import type { NativeStockContributorStore, PreparedNativeStockGroup } from "../../../packages/application/src/native-stock-contributor-import.ts";
import { assertReviewedNativeImportSchema, checkedNativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { PgSalesClient, PgSalesPool } from "./sales-unit-of-work.ts";

/** Original signed contribution staging only. No ledger/balance/receipt/publication effect. */
export class PostgresNativeStockContributorStore implements NativeStockContributorStore {
  protected readonly pool: PgSalesPool;
  constructor(pool: PgSalesPool) { this.pool = pool; }
  async stage(input: PreparedNativeStockGroup): Promise<{ inserted: number; replayed: number }> {
    const group = structuredClone(input); validatePreparedNativeStockGroup(group);
    return this.stageValidated(group);
  }
  protected async stageValidated(group: PreparedNativeStockGroup, runtime26?: NativeRuntime26Capability): Promise<{ inserted: number; replayed: number }> {
    const client = await this.pool.connect(); let began = false, committing = false, discard: Error | undefined;
    try {
      if (runtime26) await runtime26.assertReady(client, "IMPORT_STAGE");
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      const result = await this.write(client, group, runtime26);
      committing = true; await client.query("COMMIT"); return result;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error("Stock contribution COMMIT outcome unknown; do not auto-retry");
      if (began && !committing) try { await client.query("ROLLBACK"); } catch (rollback) {
        discard = rollback instanceof Error ? rollback : new Error("Stock contribution rollback failed");
        throw new AggregateError([error, rollback], "Stock contributor staging failed; discard connection");
      }
      throw error;
    } finally { client.release(discard); }
  }
  /** Approved v18: complete original items share one transaction, never partial commits. */
  protected async stageBatchValidated(groups: readonly PreparedNativeStockGroup[], runtime26: NativeRuntime26Capability):
    Promise<{ inserted: number; replayed: number; items: Array<{ fingerprint: string; inserted: number; replayed: number }> }> {
    const client = await this.pool.connect(); let began = false, committing = false, discard: Error | undefined;
    try {
      await runtime26.assertReady(client, "IMPORT_STAGE");
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      const items: Array<{ fingerprint: string; inserted: number; replayed: number }> = [];
      let inserted = 0, replayed = 0;
      for (const item of groups) {
        const result = await this.write(client, item, runtime26);
        items.push({ fingerprint: item.fingerprint, ...result }); inserted += result.inserted; replayed += result.replayed;
      }
      const sourceIds = groups.flatMap(group => group.contributors.map(row => row.source.id));
      const expectedIds = new Set(sourceIds);
      const contributions = await client.query(`/* native-stock:batch-null-baselines */ SELECT source_row_id,baseline_ledger_id
        FROM naijue_erp.import_stock_contributor WHERE batch_id=$1::uuid AND source_row_id=ANY($2::uuid[]) FOR SHARE`,
      [groups[0]!.batchId, sourceIds]);
      requireDomain(contributions.rowCount === sourceIds.length && contributions.rows.length === sourceIds.length
        && new Set(contributions.rows.map(row => row.source_row_id)).size === sourceIds.length
        && contributions.rows.every(row => typeof row.source_row_id === "string" && expectedIds.has(row.source_row_id) && row.baseline_ledger_id === null),
      "NATIVE_STOCK_BATCH_NULL_BASELINE", "Every exact staged contributor must retain its NULL baseline");
      await runtime26.assertReady(client, "IMPORT_STAGE");
      committing = true; await client.query("COMMIT"); return { inserted, replayed, items };
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error("STOCK batch outcome unknown; inspect all original keys before any retry");
      if (began && !committing) try { await client.query("ROLLBACK"); } catch (rollback) {
        discard = rollback instanceof Error ? rollback : new Error("STOCK batch rollback failed");
        throw new AggregateError([error, rollback], "STOCK batch failed; discard connection and preserve the whole batch");
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async write(client: PgSalesClient, group: PreparedNativeStockGroup, runtime26?: NativeRuntime26Capability): Promise<{ inserted: number; replayed: number }> {
    await client.query("/* native-stock:cutoff */ SELECT naijue_erp.cutoff_import_lock()");
    const versions = (await client.query(`/* native-stock:schema */ SELECT
      array_agg(version ORDER BY version) AS installed_versions FROM naijue_erp.schema_migration`)).rows;
    requireDomain(versions.length === 1, "NATIVE_STOCK_SCHEMA_NOT_READY", "Schema migration registry required");
    if (runtime26) {
      const installed = versions[0]!.installed_versions;
      requireDomain(Array.isArray(installed) && installed.length === 26 && installed.every((v, i) => v === i + 1),
        "NATIVE_STOCK_SCHEMA_NOT_READY", "Exact successor prefix26 required");
    } else {
      const reviewedSchema = assertReviewedNativeImportSchema(versions[0]!.installed_versions,
        { minimumVersion: 14, errorCode: "NATIVE_STOCK_SCHEMA_NOT_READY" });
      if ((reviewedSchema.versions.length === 18 || reviewedSchema.versions.length === 19)) await assertNativeImportAccountingGuards(client);
    }
    const batches = (await client.query(`/* native-stock:batch */ SELECT id,mapping_version,status,source_hash,source_name,
      EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') AS already_published
      FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`, [group.batchId])).rows;
    const b = batches[0];
    requireDomain(batches.length === 1 && b?.id === group.batchId && b.mapping_version === group.mappingVersion
      && (b.status === "STAGED" || b.status === "VALIDATING") && b.source_hash === group.selection.selectionSha256
      && b.source_name === group.fixedSourceNamespace && b.already_published === false,
    "NATIVE_STOCK_BATCH", "Exact selected open unpublished import batch required");
    // 0013 WAREHOUSE owns its original source and formal 0007 import_record.
    const warehouses = (await client.query(`/* native-stock:warehouse */ SELECT w.id FROM naijue_erp.warehouse w
      JOIN naijue_erp.import_record r ON r.target_id=w.id AND r.import_batch_id=$1::uuid
        AND r.source_entity_type='WAREHOUSE' AND r.target_type='WAREHOUSE' AND r.status='IMPORTED'
        AND r.source_key=$2 WHERE w.id=$3::uuid FOR SHARE OF w,r`,
    [group.batchId, group.warehouse.sourceKey, group.warehouse.nativeId])).rows;
    requireDomain(warehouses.length === 1, "NATIVE_STOCK_WAREHOUSE_BINDING", "Exact same-batch imported warehouse required");
    const skus = (await client.query(`/* native-stock:sku */ SELECT k.id FROM naijue_erp.sku k
      JOIN naijue_erp.import_record r ON r.target_id=k.id AND r.import_batch_id=$1::uuid
        AND r.source_entity_type='SKU' AND r.target_type='SKU' AND r.status='IMPORTED'
        AND r.source_key=$2 WHERE k.id=$3::uuid FOR SHARE OF k,r`,
    [group.batchId, group.sku.canonicalSourceKey, group.sku.nativeId])).rows;
    requireDomain(skus.length === 1, "NATIVE_STOCK_SKU_BINDING", "Exact same-batch imported canonical SKU required");
    const other = (await client.query(`/* native-stock:group-identity */ SELECT canonical_stock_source_key
      FROM naijue_erp.import_stock_contributor WHERE batch_id=$1::uuid AND warehouse_id=$2::uuid AND canonical_sku_id=$3::uuid
      ORDER BY canonical_stock_source_key,source_row_id LIMIT 201 FOR SHARE`,
    [group.batchId, group.warehouse.nativeId, group.sku.nativeId])).rows;
    requireDomain(other.length <= 200 && other.every(r => r.canonical_stock_source_key === group.canonicalStock["来源编号"]),
      "NATIVE_STOCK_GROUP_CONFLICT", "A warehouse/canonical SKU cannot acquire a second effective stock group");
    let inserted = 0, replayed = 0;
    for (const row of [...group.contributors].sort((a, b) => a.source.sourceKey.localeCompare(b.source.sourceKey))) {
      const s = row.source, l = row.lineage, evidence = nativeStockSourceEvidence(group, row);
      const aliases = (await client.query(`/* native-stock:alias */ SELECT a.canonical_sku_id,a.canonical_source_key
        FROM naijue_erp.import_sku_alias a WHERE a.batch_id=$1::uuid AND a.old_source_sku_id=$2 FOR SHARE`,
      [group.batchId, l.oldSkuSourceId])).rows;
      requireDomain(aliases.length === 1 && aliases[0]!.canonical_sku_id === group.sku.nativeId
        && aliases[0]!.canonical_source_key === group.sku.canonicalSourceKey,
      "NATIVE_STOCK_ALIAS_BINDING", "Original contributor SKU must have the exact same-batch canonical alias");
      const previousSource = (await client.query(`/* native-stock:source-replay */ SELECT
        (to_jsonb(s)||jsonb_build_object('row_no',s.row_no::text))=$2::jsonb AS equal FROM naijue_erp.import_source_row s
        WHERE s.id=$1::uuid OR (s.batch_id=$3::uuid AND ((s.entity_type='INVENTORY_BASELINE' AND s.source_key=$4)
          OR (s.source_file_sha256=$5 AND s.sheet=$6 AND s.row_no=$7::bigint))) ORDER BY s.id LIMIT 2 FOR SHARE`,
      [s.id, JSON.stringify(evidence), group.batchId, s.sourceKey, s.sourceFileSha256, s.sheet, s.rowNo])).rows;
      const expected = { batch_id: group.batchId, source_row_id: s.id, warehouse_id: group.warehouse.nativeId,
        canonical_sku_id: group.sku.nativeId, old_source_sku_id: l.oldSkuSourceId,
        canonical_stock_source_key: group.canonicalStock["来源编号"], source_unit: l.sourceUnit, signed_quantity: l.signedQuantity };
      const previousContribution = (await client.query(`/* native-stock:contributor-replay */ SELECT
        ((to_jsonb(c)-'baseline_ledger_id')||jsonb_build_object('signed_quantity',c.signed_quantity::text))=$3::jsonb AS equal,
        c.baseline_ledger_id FROM naijue_erp.import_stock_contributor c
        WHERE (c.batch_id=$1::uuid AND c.source_row_id=$2::uuid)
          OR (c.batch_id=$1::uuid AND c.canonical_stock_source_key=$4 AND c.source_row_id=$2::uuid)
        ORDER BY c.source_row_id LIMIT 2 FOR SHARE`,
      [group.batchId, s.id, JSON.stringify(expected), group.canonicalStock["来源编号"]])).rows;
      requireDomain(previousSource.length <= 1 && previousContribution.length <= 1
        && (previousSource.length === 0) === (previousContribution.length === 0)
        && (previousSource.length === 0 || previousSource[0]!.equal === true)
        && (previousContribution.length === 0 || previousContribution[0]!.equal === true),
      "NATIVE_STOCK_REPLAY_CONFLICT", "Original signed source and contribution must replay exactly together");
      if (previousSource.length) {
        const linkedId = previousContribution[0]!.baseline_ledger_id;
        if (linkedId !== null) {
          const linked = (await client.query(`/* native-stock:linked-baseline */ SELECT l.id FROM naijue_erp.inventory_ledger l
            JOIN naijue_erp.import_record r ON r.import_batch_id=$1::uuid AND r.source_entity_type='INVENTORY_BASELINE'
              AND r.source_key=$2 AND r.target_type='INVENTORY_LEDGER' AND r.target_id=l.id AND r.status='IMPORTED'
            WHERE l.id=$3::uuid AND l.event_kind='CUTOFF_BASELINE' AND l.source_import_batch_id=$1::uuid
              AND l.warehouse_id=$4::uuid AND l.sku_id=$5::uuid AND l.quantity_delta=$6::bigint FOR SHARE OF l,r`,
          [group.batchId, group.canonicalStock["来源编号"], linkedId, group.warehouse.nativeId,
            group.sku.nativeId, group.signedQuantity])).rows;
          requireDomain(linked.length === 1 && linked[0]!.id === linkedId,
            "NATIVE_STOCK_LINK_CONFLICT", "Replayed original contribution must attach only its exact signed canonical baseline");
        }
        replayed++; continue;
      }
      const created = await client.query(`/* native-stock:source-create */ INSERT INTO naijue_erp.import_source_row
        SELECT x.* FROM jsonb_populate_record(NULL::naijue_erp.import_source_row,$1::jsonb) x RETURNING id`, [JSON.stringify(evidence)]);
      requireDomain(created.rowCount === 1 && created.rows[0]!.id === s.id,
        "NATIVE_STOCK_SOURCE_FAILED", "Exactly one original signed contributor source required");
      const contribution = await client.query(`/* native-stock:contributor-create */ INSERT INTO naijue_erp.import_stock_contributor
        (batch_id,source_row_id,warehouse_id,canonical_sku_id,old_source_sku_id,canonical_stock_source_key,source_unit,signed_quantity,baseline_ledger_id)
        VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8::bigint,NULL) RETURNING source_row_id`,
      [group.batchId, s.id, group.warehouse.nativeId, group.sku.nativeId,
        l.oldSkuSourceId, group.canonicalStock["来源编号"], l.sourceUnit, l.signedQuantity]);
      requireDomain(contribution.rowCount === 1 && contribution.rows[0]!.source_row_id === s.id,
        "NATIVE_STOCK_CONTRIBUTOR_FAILED", "Exactly one original signed contributor linkage required");
      inserted++;
    }
    requireDomain(inserted === 0 || replayed === 0, "NATIVE_STOCK_PARTIAL_GROUP", "One complete group must be either all new or an exact replay");
    return { inserted, replayed };
  }
}

/** Explicit successor with unchanged native/source shape. No legacy schema union. */
export class PostgresNativeStockContributorStore26 extends PostgresNativeStockContributorStore {
  private readonly runtime26: NativeRuntime26Capability;
  constructor(pool: PgSalesPool, runtime26: NativeRuntime26Capability) {
    super(pool); const checked = checkedNativeRuntime26Capability(runtime26);
    if (!checked) throw new TypeError("Actual successor runtime capability required"); this.runtime26 = checked;
  }
  override async stage(input: PreparedNativeStockGroup): Promise<{ inserted: number; replayed: number }> {
    const group = structuredClone(input); validatePreparedNativeStockGroup(group); return this.stageValidated(group, this.runtime26);
  }
  async stageBatch(input: readonly PreparedNativeStockGroup[]):
    Promise<{ inserted: number; replayed: number; items: Array<{ fingerprint: string; inserted: number; replayed: number }> }> {
    requireDomain(Array.isArray(input) && input.length > 0 && input.length <= 100,
      "NATIVE_STOCK_BATCH_BOUND", "One through100 complete original items required");
    const groups = structuredClone(input); for (const item of groups) validatePreparedNativeStockGroup(item);
    const first = groups[0]!, selectionEntries = Object.entries(first.selection);
    requireDomain(groups.every(item => item.batchId === first.batchId && item.fixedSourceNamespace === first.fixedSourceNamespace
      && item.mappingVersion === first.mappingVersion && Object.keys(item.selection).length === selectionEntries.length
      && selectionEntries.every(([key, value]) => Object.hasOwn(item.selection, key) && Reflect.get(item.selection, key) === value)),
      "NATIVE_STOCK_BATCH_SCOPE", "Same batch, namespace and whole original selection required");
    const members = groups.flatMap(item => item.contributors);
    const windowBytes = 4 * 1024 * 1024 + 4096;
    requireDomain(members.length <= 200 && groups.every(item => Buffer.byteLength(JSON.stringify(item), "utf8") <= windowBytes)
      && Buffer.byteLength(JSON.stringify(groups), "utf8") <= windowBytes + groups.length + 1,
      "NATIVE_STOCK_BATCH_BOUND", "Original complete items and transport window bounds must be preserved");
    requireDomain(new Set(groups.map(group => `${group.warehouse.nativeId}:${group.sku.nativeId}`)).size === groups.length
      && new Set(groups.map(group => group.canonicalStock["来源编号"])).size === groups.length
      && new Set(members.map(member => member.source.id)).size === members.length
      && new Set(members.map(member => member.source.sourceKey)).size === members.length,
      "NATIVE_STOCK_BATCH_DUPLICATE", "Canonical items and original source members cannot repeat inside a batch");
    return this.stageBatchValidated(groups, this.runtime26);
  }

}
