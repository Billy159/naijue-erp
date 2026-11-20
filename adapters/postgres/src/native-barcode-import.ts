import { requestHash as schemeInitializationHash } from "../../../packages/application/src/request-hash.ts";
import { stableImportId as schemeInitializationOperationId, validateBarcodeSchemeInitializationCommand as validateSchemeInitializationCommand } from "../../../packages/application/src/inventory-cutoff-import.ts";
import { assertNativeImportAccountingGuards } from "./native-import-accounting-capability.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { nativeBarcodeSourceEvidence, validatePreparedNativeBarcode, validateNativeBarcodeSchemeInitializationRows26 } from "../../../packages/application/src/native-barcode-import.ts";
import type { NativeBarcodeImportStore, PreparedNativeBarcode } from "../../../packages/application/src/native-barcode-import.ts";
import { assertReviewedNativeImportSchema, checkedNativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { PgSalesClient, PgSalesPool } from "./sales-unit-of-work.ts";

/** Effective SKU barcodes only; old MAIN downgrades fail in the pure preparation gate. */
export class PostgresNativeBarcodeImportStore implements NativeBarcodeImportStore {
  protected readonly pool: PgSalesPool;
  constructor(pool: PgSalesPool) { this.pool = pool; }
  async stage(input: PreparedNativeBarcode): Promise<{ inserted: number; replayed: number }> {
    const row = structuredClone(input); validatePreparedNativeBarcode(row);
    return this.stageValidated(row);
  }
  protected async stageValidated(row: PreparedNativeBarcode, runtime26?: NativeRuntime26Capability): Promise<{ inserted: number; replayed: number }> {
    const client = await this.pool.connect(); let began = false, committing = false, discard: Error | undefined;
    try {
      if (runtime26) await runtime26.assertReady(client, "IMPORT_STAGE");
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      const result = await this.write(client, row, runtime26);
      committing = true; await client.query("COMMIT"); return result;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error("Barcode COMMIT outcome unknown; do not auto-retry");
      if (began && !committing) try { await client.query("ROLLBACK"); } catch (rollback) {
        discard = rollback instanceof Error ? rollback : new Error("Barcode rollback failed");
        throw new AggregateError([error, rollback], "Native barcode staging failed; discard connection");
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async write(client: PgSalesClient, row: PreparedNativeBarcode, runtime26?: NativeRuntime26Capability): Promise<{ inserted: number; replayed: number }> {
    await client.query("/* native-barcode:cutoff */ SELECT naijue_erp.cutoff_import_lock()");
    const versions = (await client.query(`/* native-barcode:schema */ SELECT
      array_agg(version ORDER BY version) AS installed_versions FROM naijue_erp.schema_migration`)).rows;
    requireDomain(versions.length === 1, "NATIVE_BARCODE_SCHEMA_NOT_READY", "Schema migration registry required");
    if (runtime26) {
      const installed = versions[0]!.installed_versions;
      requireDomain(Array.isArray(installed) && installed.length === 26 && installed.every((v, i) => v === i + 1),
        "NATIVE_BARCODE_SCHEMA_NOT_READY", "Exact successor prefix26 required");
    } else {
      const reviewedSchema = assertReviewedNativeImportSchema(versions[0]!.installed_versions,
        { minimumVersion: 14, errorCode: "NATIVE_BARCODE_SCHEMA_NOT_READY" });
      if ((reviewedSchema.versions.length === 18 || reviewedSchema.versions.length === 19)) await assertNativeImportAccountingGuards(client);
    }
    const batches = (await client.query(`/* native-barcode:batch */ SELECT id,mapping_version,status,source_hash,source_name,
      EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') AS already_published
      FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`, [row.batchId])).rows;
    const b = batches[0];
    requireDomain(batches.length === 1 && b?.id === row.batchId && b.mapping_version === row.mappingVersion
      && (b.status === "STAGED" || b.status === "VALIDATING") && b.source_hash === row.selection.selectionSha256
      && b.source_name === row.fixedSourceNamespace && b.already_published === false,
    "NATIVE_BARCODE_BATCH", "Exact effective replacement selection in open unpublished batch required");
    const k = row.nativeBarcode;
    const sku = (await client.query(`/* native-barcode:sku-alias */ SELECT k.id FROM naijue_erp.sku k
      JOIN naijue_erp.import_record r ON r.import_batch_id=$1::uuid AND r.source_entity_type='SKU'
        AND r.source_key=$2 AND r.target_type='SKU' AND r.target_id=k.id AND r.status='IMPORTED'
      JOIN naijue_erp.import_sku_alias a ON a.batch_id=$1::uuid AND a.canonical_sku_id=k.id
        AND a.canonical_source_key=$2 AND a.old_source_sku_id=$3
      WHERE k.id=$4::uuid FOR SHARE OF k,r,a`,
    [row.batchId, row.sku.canonicalSourceKey, row.sku.oldSourceSkuKey, row.sku.nativeId])).rows;
    requireDomain(sku.length === 1, "NATIVE_BARCODE_SKU_BINDING", "Exact old/canonical same-batch imported SKU alias required");
    const schemes = (await client.query(`/* native-barcode:scheme */ SELECT to_jsonb(s)=$2::jsonb AS exact
      FROM naijue_erp.barcode_scheme s WHERE id=$1::uuid FOR SHARE`, [row.scheme.id, JSON.stringify(row.scheme.snapshot)])).rows;
    requireDomain(schemes.length === 1 && schemes[0]!.exact === true,
      "NATIVE_BARCODE_SCHEME_MISSING", "Actual exact original scheme mapping required, not an invented nullable scheme");
    const targets = (await client.query(`/* native-barcode:target */ SELECT id,to_jsonb(b)=$3::jsonb AS exact
      FROM naijue_erp.sku_barcode b WHERE b.id=$1::uuid OR b.barcode=$2 ORDER BY b.id FOR UPDATE`,
    [k.id, k.barcode, JSON.stringify(k)])).rows;
    requireDomain(targets.length <= 1 && (targets.length === 0 || (targets[0]!.id === k.id && targets[0]!.exact === true)),
      "NATIVE_BARCODE_TARGET_CONFLICT", "Existing raw barcode may only replay the exact same immutable canonical binding");
    if (k.enabled && k.barcode_kind === "MAIN") {
      const mains = (await client.query(`/* native-barcode:main */ SELECT id FROM naijue_erp.sku_barcode
        WHERE sku_id=$1::uuid AND barcode_kind='MAIN' AND enabled ORDER BY id LIMIT 2 FOR SHARE`, [k.sku_id])).rows;
      requireDomain(mains.length === 0 || (mains.length === 1 && mains[0]!.id === k.id),
        "NATIVE_BARCODE_MAIN_CONFLICT", "One enabled canonical MAIN maximum; no implicit demotion or overwrite");
    }
    const s = row.source, evidence = nativeBarcodeSourceEvidence(row);
    const sources = (await client.query(`/* native-barcode:source-replay */ SELECT
      (to_jsonb(s)||jsonb_build_object('row_no',s.row_no::text))=$2::jsonb AS exact
      FROM naijue_erp.import_source_row s WHERE s.id=$1::uuid OR (s.batch_id=$3::uuid AND (
        (s.entity_type='BARCODE' AND (s.source_key=$4 OR s.field_provenance->>'native_barcode'=$5))
        OR (s.source_file_sha256=$6 AND s.sheet=$7 AND s.row_no=$8::bigint))) ORDER BY s.id LIMIT 2 FOR SHARE`,
    [s.id, JSON.stringify(evidence), row.batchId, s.sourceKey, k.barcode, s.sourceFileSha256, s.sheet, s.rowNo])).rows;
    requireDomain(sources.length <= 1 && (sources.length === 0 || sources[0]!.exact === true)
      && (sources.length === 0) === (targets.length === 0),
    "NATIVE_BARCODE_REPLAY_CONFLICT", "Native raw barcode and exact original source must exist together or neither");
    if (sources.length) return { inserted: 0, replayed: 1 };
    const created = await client.query(`/* native-barcode:create */ INSERT INTO naijue_erp.sku_barcode
      (id,barcode,sku_id,barcode_kind,scheme_id,enabled)
      VALUES ($1::uuid,$2,$3::uuid,$4,$5::uuid,$6) RETURNING id`,
    [k.id, k.barcode, k.sku_id, k.barcode_kind, k.scheme_id, k.enabled]);
    requireDomain(created.rowCount === 1 && created.rows[0]!.id === k.id,
      "NATIVE_BARCODE_CREATE_FAILED", "Exactly one retained original raw barcode binding required");
    const sr = await client.query(`/* native-barcode:source-create */ INSERT INTO naijue_erp.import_source_row
      SELECT x.* FROM jsonb_populate_record(NULL::naijue_erp.import_source_row,$1::jsonb) x RETURNING id`, [JSON.stringify(evidence)]);
    requireDomain(sr.rowCount === 1 && sr.rows[0]!.id === s.id,
      "NATIVE_BARCODE_SOURCE_FAILED", "Exactly one exact selected original barcode source required");
    return { inserted: 1, replayed: 0 };
  }
}

/** Explicit successor with unchanged native/source shape. No legacy schema union. */
export class PostgresNativeBarcodeImportStore26 extends PostgresNativeBarcodeImportStore {
  private readonly runtime26: NativeRuntime26Capability;
  constructor(pool: PgSalesPool, runtime26: NativeRuntime26Capability) {
    super(pool); const checked = checkedNativeRuntime26Capability(runtime26);
    if (!checked) throw new TypeError("Actual successor runtime capability required"); this.runtime26 = checked;
  }
  override async stage(input: PreparedNativeBarcode): Promise<{ inserted: number; replayed: number }> {
    const row = structuredClone(input); validatePreparedNativeBarcode(row); return this.stageValidated(row, this.runtime26);
  }
}

/** Fixed statements consumed by D1's trusted same-client initializer callback.
 * D1 owns transaction/locks/birth admission/authority/replay/audit/checkpoint. */
export const NATIVE_BARCODE_SCHEME_INITIALIZATION26_SQL = Object.freeze({
  read: "SELECT id,name,barcode_type,rule_description,code_length,rule_version,status FROM naijue_erp.barcode_scheme ORDER BY id FOR SHARE",
  insert: "INSERT INTO naijue_erp.barcode_scheme(id,name,barcode_type,rule_description,code_length,rule_version,status) VALUES($1::uuid,$2,$3,$4,$5,$6,$7) RETURNING id"
});

/** First-write callback only, matching BarcodeSchemeInitialization26 exactly.
 * Same-key replay is verified by the original D1 store and does not call this.
 * D1 supplies the scoped runtime mapping this borrowed query object to the
 * original actual lease; no new client or runtime is issued by this callback. */
export async function initializeNativeBarcodeSchemesOnClient26(
  client: Pick<PgSalesClient, "query">, input: {
    readonly command: import("../../../packages/application/src/inventory-cutoff-import.ts").BarcodeSchemeInitializationCommand;
    readonly now: string; readonly operationId: string;
  }, runtime26: NativeRuntime26Capability
): Promise<void> {
  const runtime = checkedNativeRuntime26Capability(runtime26);
  requireDomain(runtime !== undefined && typeof client?.query === "function",
    "NATIVE_BARCODE_INITIALIZATION_CONTEXT", "Actual D1-issued runtime and original borrowed client required");
  const original = schemeInitializationHash(input), snapshot = structuredClone(input), command = snapshot.command;
  validateSchemeInitializationCommand(command);
  validateNativeBarcodeSchemeInitializationRows26(command.schemeInitialization.schemes);
  requireDomain(snapshot.operationId === schemeInitializationOperationId("operation", command.actorAccountId, command.requestKey)
    && typeof snapshot.now === "string" && snapshot.now.endsWith("Z") && Number.isFinite(Date.parse(snapshot.now)),
    "NATIVE_BARCODE_INITIALIZATION_CONTEXT", "Original request-key operation and canonical transaction time required");
  const unchanged = (): void => requireDomain(schemeInitializationHash(input) === original,
    "NATIVE_BARCODE_INITIALIZATION_CHANGED", "Initialization command cannot change across the borrowed callback");
  await runtime!.assertReady(client, "IMPORT_STAGE"); unchanged();
  const existing = await client.query(NATIVE_BARCODE_SCHEME_INITIALIZATION26_SQL.read); unchanged();
  requireDomain(existing.rows.length === 0, "NATIVE_BARCODE_INITIALIZATION_NOT_EMPTY",
    "Only the original first-write callback may create six rows; preseeded or partial rows cannot be adopted");
  const rows = [...command.schemeInitialization.schemes].sort((a, b) => Buffer.compare(Buffer.from(a.sourceSchemeKey), Buffer.from(b.sourceSchemeKey)));
  for (const row of rows) {
    const n = row.native, saved = await client.query(NATIVE_BARCODE_SCHEME_INITIALIZATION26_SQL.insert,
      [n.id, n.name, n.barcode_type, n.rule_description, n.code_length, n.rule_version, n.status]); unchanged();
    requireDomain(saved.rowCount === 1 && saved.rows.length === 1 && saved.rows[0]!.id === n.id,
      "NATIVE_BARCODE_INITIALIZATION_INSERT", "Each original approved scheme must be inserted exactly once");
  }
  const actual = await client.query(NATIVE_BARCODE_SCHEME_INITIALIZATION26_SQL.read); unchanged();
  const expected = rows.map(row => row.native).sort((a, b) => Buffer.compare(Buffer.from(a.id), Buffer.from(b.id)));
  requireDomain(actual.rows.length === 6 && schemeInitializationHash(actual.rows) === schemeInitializationHash(expected),
    "NATIVE_BARCODE_INITIALIZATION_READBACK", "Whole table must contain exactly the six approved seven-field snapshots");
  await runtime!.assertReady(client, "IMPORT_STAGE"); unchanged();
}
