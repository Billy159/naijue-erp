import type { NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import { checkedNativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { COMPLETE_SCOPE_DECISION, stableImportId, validateCoreImportCommand } from "../../../packages/application/src/inventory-cutoff-import.ts";
import type { CutoffImportBatch, ImportCheckpoint, ImportTarget, CoreWarehouseItem } from "../../../packages/application/src/inventory-cutoff-import.ts";
import { HISTORY_MAPPING_VERSION, isHistoryQuantity } from "../../../packages/application/src/history-storage-contract.ts";
import type { ImportSourceEvidence, JsonObject, StockContributionLineage } from "../../../packages/application/src/history-storage-contract.ts";
import { prepareNativeStockGroup } from "../../../packages/application/src/native-stock-contributor-import.ts";
import type { NativeStockContributorInput, NativeStockSelection } from "../../../packages/application/src/native-stock-contributor-import.ts";
import { requestHash } from "../../../packages/application/src/request-hash.ts";
import { assertNativeRecordAccountingSchema, checkpointFromNativeImportClaims, checkpointFromNativeCoreClaims, nativeImportAccountingRequestHash,
  NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION, NATIVE_IMPORT_STOCK_CONSERVATION_VERSION,
  nativeStockContributorsManifestHash, nativeStockEffectiveGroupsManifestHash } from "../../../packages/application/src/native-import-record-accounting.ts";
import type { NativeAccountingBaselineItem, NativeAccountingMembershipItem, NativeImportAccountingCommand,
  NativeImportRecordClaim, NativeStockContributorObservation, NativeStockEffectiveGroupObservation } from "../../../packages/application/src/native-import-record-accounting.ts";
import { jsonObject, stringValue } from "./codec.ts";
import type { PgSalesClient, PgSalesResult } from "./sales-unit-of-work.ts";

export interface NativeRecordAccountingTransaction {
  /** MAIN original command; its hash includes accountingVersion and every nativeRecord. */
  readonly command: NativeImportAccountingCommand;
  readonly batch: CutoffImportBatch; readonly operationId: string; readonly commandHash: string; readonly now: string;
}
export interface NewBaselineInsertResults {
  readonly record: PgSalesResult; readonly ledger: PgSalesResult; readonly balance: PgSalesResult;
}
export interface NativeImportRecordAccountant {
  claimMembership(item: NativeAccountingMembershipItem): Promise<NativeImportRecordClaim>;
  /** Caller must INSERT record+ledger+balance and attach all exact contributors on THIS client first. */
  claimBaseline(item: NativeAccountingBaselineItem, created: NewBaselineInsertResults): Promise<NativeImportRecordClaim>;
  claimFinalApproval(createdRecord: PgSalesResult): Promise<NativeImportRecordClaim>;
  /** No SQL UPDATE: returns only progress derived from all successful new claim RETURNING results. */
  checkpoint(): ImportCheckpoint;
}
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const check = (ok: unknown, message: string): void => requireDomain(ok, "NATIVE_RECORD_ACCOUNTING_CONFLICT", message);
function returned(result: PgSalesResult, expected: Readonly<Record<string, string>>): void {
  check(result.rowCount === 1 && result.rows.length === 1 && Object.entries(expected).every(([key, value]) => result.rows[0]?.[key] === value),
    "One actual successful INSERT RETURNING row with exact identities required; no adopted target or fabricated passed flag");
}
/** NO pool/connection/BEGIN/COMMIT/retry/receipt/audit/CAS here. Original store owns ALL of those.
 * Invoke only after original receipt replay handling and independent command authorization.
 * Passing a PgSalesClient is a trusted internal seam, not an authorization boundary.
 */
export async function createNativeImportRecordAccountant(client: PgSalesClient,
  input: NativeRecordAccountingTransaction, runtime26?: NativeRuntime26Capability): Promise<NativeImportRecordAccountant> {
  const transaction = structuredClone(input); const { command, batch, operationId, now } = transaction;
  check(nativeImportAccountingRequestHash(command) === transaction.commandHash, "Accounting metadata must be covered by the original MAIN command hash");
  entityId("operation", operationId);
  check(operationId === stableImportId("operation", command.actorAccountId, command.requestKey), "Original actor/key must own the unchanged operation ID");
  check(Number.isFinite(Date.parse(now)) && now.endsWith("Z"), "Actual server UTC operation time required, not an original historical timestamp");
  check(batch.id === command.batchId && batch.mappingVersion === HISTORY_MAPPING_VERSION
    && (batch.status === "STAGED" || batch.status === "VALIDATING")
    && batch.checkpoint.sequence === command.expectedSequence && batch.checkpoint.cursor === command.expectedCursor,
  "Exact original open V2 batch/checkpoint required");
  const runtime = checkedNativeRuntime26Capability(runtime26);
  if (runtime) await runtime.assertReady(client, command.action === "IMPORT_PUBLISH" ? "IMPORT_PUBLISH" : "IMPORT_STAGE");
  else {
  const schema = (await client.query("/* native-accounting:schema */ SELECT array_agg(version ORDER BY version) AS versions FROM naijue_erp.schema_migration")).rows;
  check(schema.length === 1, "One complete migration registry required"); assertNativeRecordAccountingSchema(schema[0]!.versions);
  }
  await client.query("/* native-accounting:cutoff */ SELECT naijue_erp.cutoff_import_lock()");
  const batches = (await client.query(`/* native-accounting:batch */ SELECT id,mapping_version,status,source_name,source_hash,source_manifest_ref,checkpoint,
    EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') AS already_published
    FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`, [batch.id])).rows;
  const locked = batches[0];
  check(batches.length === 1 && locked?.id === batch.id && locked.mapping_version === batch.mappingVersion
    && locked.status === batch.status && locked.source_name === batch.sourceName && locked.source_hash === batch.sourceHash
    && locked.source_manifest_ref === batch.sourceManifestRef && locked.already_published === false
    && requestHash(locked.checkpoint) === requestHash(batch.checkpoint), "Locked database batch differs from original frozen accounting context");
  if (command.action === "IMPORT_PUBLISH") {
    check(command.approval.sourceHash === batch.sourceHash && command.approval.sourceManifestRef === batch.sourceManifestRef
      && batch.checkpoint.counts.IMPORT_BATCH === 0
      && (["WAREHOUSE", "SKU", "INVENTORY_LEDGER"] as const).every(type => batch.checkpoint.counts[type] === batch.checkpoint.expected[type]),
    "Original exact complete-scope approval and all prior native counts required");
  }
  const natives = new Map<string, { type: "WAREHOUSE" | "SKU"; id: string }>();
  if (command.action === "IMPORT_CHUNK") for (const item of command.items) {
    if (item.targetType === "INVENTORY_LEDGER") {
      natives.set(`WAREHOUSE:${item.warehouseId}`, { type: "WAREHOUSE", id: item.warehouseId });
      natives.set(`SKU:${item.skuId}`, { type: "SKU", id: item.skuId });
    } else natives.set(`${item.targetType}:${item.targetId}`, { type: item.targetType, id: item.targetId });
  }
  const snapshots = new Map<string, unknown>();
  for (const target of [...natives.values()].sort((a, b) => (a.type === b.type ? compare(a.id, b.id) : a.type === "WAREHOUSE" ? -1 : 1))) {
    const table = target.type === "WAREHOUSE" ? "warehouse" : "sku";
    const rows = (await client.query(`/* native-accounting:native:${target.type} */ SELECT id,to_jsonb(n) AS native_snapshot
      FROM naijue_erp.${table} n WHERE id=$1::uuid FOR SHARE`, [target.id])).rows;
    check(rows.length === 1 && rows[0]!.id === target.id && rows[0]!.native_snapshot !== null
      && typeof rows[0]!.native_snapshot === "object", "Exact native target must exist and remain locked; no adoption or insertion");
    snapshots.set(`${target.type}:${target.id}`, rows[0]!.native_snapshot);
  }
  const sources = command.action === "IMPORT_CHUNK" ? command.items : [{ sourceEntityType: "INVENTORY_SCOPE_APPROVAL", sourceKey: "FINAL_COMPLETE_SCOPE" }];
  for (const source of [...sources].sort((a, b) => compare(JSON.stringify([a.sourceEntityType, a.sourceKey]), JSON.stringify([b.sourceEntityType, b.sourceKey]))))
    await client.query("/* native-accounting:source-lock */ SELECT naijue_erp.import_source_key_lock($1,$2,$3)", [batch.sourceName, source.sourceEntityType, source.sourceKey]);
  if (command.action === "IMPORT_CHUNK") for (const item of command.items.filter((item): item is NativeAccountingBaselineItem => item.targetType === "INVENTORY_LEDGER")
    .sort((a, b) => compare(JSON.stringify([a.warehouseId, a.skuId]), JSON.stringify([b.warehouseId, b.skuId]))))
    await client.query("/* native-accounting:inventory-lock */ SELECT naijue_erp.inventory_key_lock($1::uuid,$2::uuid)", [item.warehouseId, item.skuId]);
  return new Accountant(client, transaction, snapshots);
}
class Accountant implements NativeImportRecordAccountant {
  private readonly client: PgSalesClient;
  private readonly transaction: NativeRecordAccountingTransaction;
  private readonly snapshots: ReadonlyMap<string, unknown>;
  private readonly claimed = new Set<string>(); private readonly claims: NativeImportRecordClaim[] = [];
  private failed = false;
  constructor(client: PgSalesClient, transaction: NativeRecordAccountingTransaction, snapshots: ReadonlyMap<string, unknown>) {
    this.client = client; this.transaction = transaction; this.snapshots = snapshots;
  }
  private item(input: NativeAccountingMembershipItem | NativeAccountingBaselineItem): void {
    const command = this.transaction.command;
    check(!this.failed && command.action === "IMPORT_CHUNK" && command.items.some(item => requestHash(item) === requestHash(input))
      && !this.claimed.has(requestHash(input)), "Only one exact MAIN-command item can acquire a new claim; roll back after any failed step");
  }
  private async perform<T>(work: () => Promise<T>): Promise<T> {
    check(!this.failed, "Accountant failed; original store must roll back the complete transaction");
    try { return await work(); } catch (error) { this.failed = true; throw error; }
  }
  async claimMembership(input: NativeAccountingMembershipItem): Promise<NativeImportRecordClaim> {
    return this.perform(async () => {
      const item = structuredClone(input); this.item(item);
      check(item.targetType === "WAREHOUSE" || item.targetType === "SKU", "Only native WAREHOUSE/canonical SKU membership may consume an existing record");
      const { batch } = this.transaction; const record = item.nativeRecord;
      const native = JSON.stringify(this.snapshots.get(`${item.targetType}:${item.targetId}`));
      const creator = item.targetType === "WAREHOUSE" ? `
        JOIN naijue_erp.native_party_import_evidence e ON e.batch_id=r.import_batch_id AND e.source_row_id=s.id
          AND e.entity_type='WAREHOUSE' AND e.source_key=r.source_key AND e.native_id=r.target_id
          AND e.validator_version='NATIVE_PARTY_IMPORT_V1' AND e.native_snapshot=$11::jsonb
          AND e.warehouse_record=$12::jsonb AND e.selection->>'selectionSha256'=$13
        WHERE s.normalized_fields->>'切换范围'='本次完整核准'` : `
        JOIN naijue_erp.import_sku_alias a ON a.batch_id=s.batch_id AND a.source_row_id=s.id
          AND a.old_source_sku_id=s.source_key AND a.canonical_source_key=r.source_key AND a.canonical_sku_id=r.target_id
        WHERE s.field_provenance->'native_sku_import'->>'validator_version'='NATIVE_SKU_IMPORT_V1'
          AND s.field_provenance->'native_sku_import'->>'canonical_source_key'=r.source_key
          AND s.field_provenance->'native_sku_import'->>'native_sku_id'=r.target_id::text
          AND s.field_provenance->'native_sku_import'->'native_sku'=$11::jsonb
          AND s.field_provenance->'native_sku_import'->'selection'->>'selectionSha256'=$13
          AND s.field_provenance->'native_sku_import'->'mapping'->>'isRepresentative'='true'
          AND s.field_provenance->'native_sku_import'->'mapping'->>'canonicalMemberCount'=
            (SELECT count(*)::text FROM naijue_erp.import_sku_alias all_alias WHERE all_alias.batch_id=r.import_batch_id
              AND all_alias.canonical_sku_id=r.target_id AND all_alias.canonical_source_key=r.source_key)
          AND $12::jsonb ?& ARRAY['id','reviewedAt','decisionReason']`;
      const rows = (await this.client.query(`/* native-accounting:membership:${item.targetType} */ SELECT r.id
        FROM naijue_erp.import_record r JOIN naijue_erp.import_source_row s
          ON s.batch_id=r.import_batch_id AND s.entity_type=r.source_entity_type AND s.source_key=r.source_key
            AND s.row_sha256=r.source_record_hash AND s.file_ref=r.source_file_ref
        ${creator}
          AND r.id=$1::uuid AND r.import_batch_id=$2::uuid AND r.source_entity_type=$3 AND r.source_key=$4
          AND r.source_record_hash=$5 AND r.source_file_ref=$6 AND r.target_type=$7 AND r.target_id=$8::uuid
          AND r.status='IMPORTED' AND r.reviewed_at=$9::timestamptz AND r.decision_reason=$10
        FOR SHARE OF r,s${item.targetType === "WAREHOUSE" ? ",e" : ",a"}`,
      [record.id, batch.id, item.sourceEntityType, item.sourceKey, item.sourceRecordHash, item.sourceFileRef,
        item.targetType, item.targetId, record.reviewedAt, record.decisionReason, native, JSON.stringify(record), batch.sourceHash])).rows;
      check(rows.length === 1 && rows[0]!.id === record.id, "Exact immutable source/record/current-native creator proof required; do not fabricate original review text");
      const claim = await this.insertClaim(record.id, item.targetType, item.targetId); this.claimed.add(requestHash(item)); return claim;
    });
  }
  async claimBaseline(input: NativeAccountingBaselineItem, created: NewBaselineInsertResults): Promise<NativeImportRecordClaim> {
    return this.perform(async () => {
      const item = structuredClone(input); this.item(item); check(item.targetType === "INVENTORY_LEDGER", "One real new nonzero baseline item required");
      const { batch, operationId, now } = this.transaction;
      const recordId = stableImportId("source", batch.sourceName, item.sourceEntityType, item.sourceKey);
      const ledgerId = stableImportId("baseline", batch.sourceName, item.sourceEntityType, item.sourceKey);
      returned(created.record, { id: recordId }); returned(created.ledger, { id: ledgerId });
      returned(created.balance, { warehouse_id: item.warehouseId, sku_id: item.skuId });
      const rows = (await this.client.query(`/* native-accounting:baseline */ SELECT r.id
        FROM naijue_erp.import_record r JOIN naijue_erp.inventory_ledger l ON l.id=r.target_id
        JOIN naijue_erp.inventory_balance q ON q.warehouse_id=l.warehouse_id AND q.sku_id=l.sku_id
        WHERE r.id=$1::uuid AND r.import_batch_id=$2::uuid AND r.source_entity_type='INVENTORY_BASELINE' AND r.source_key=$3
          AND r.source_record_hash=$4 AND r.source_file_ref=$5 AND r.status='IMPORTED' AND r.target_type='INVENTORY_LEDGER'
          AND r.target_id=$6::uuid AND r.reviewed_at=$7::timestamptz AND r.decision_reason IS NULL
          AND l.event_kind='CUTOFF_BASELINE' AND l.operation_id=$8::uuid AND l.source_import_batch_id=$2::uuid
          AND l.warehouse_id=$9::uuid AND l.sku_id=$10::uuid AND l.quantity_delta=$11::bigint
          AND l.business_date=$12::date AND l.posted_at=$7::timestamptz
          AND q.quantity=l.quantity_delta AND q.version=1 AND q.last_operation_id=$8::uuid AND q.updated_at=$7::timestamptz
          AND EXISTS(SELECT 1 FROM naijue_erp.import_stock_contributor c WHERE c.batch_id=$2::uuid
            AND c.warehouse_id=$9::uuid AND c.canonical_sku_id=$10::uuid)
          AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_stock_contributor c JOIN naijue_erp.import_source_row s ON s.batch_id=c.batch_id AND s.id=c.source_row_id
            WHERE c.batch_id=$2::uuid AND c.warehouse_id=$9::uuid AND c.canonical_sku_id=$10::uuid AND (
              c.baseline_ledger_id IS DISTINCT FROM l.id OR c.canonical_stock_source_key<>$3
              OR (s.field_provenance->'native_stock_import'->>'validator_version'='NATIVE_STOCK_CONTRIBUTOR_V1'
                AND s.field_provenance->'native_stock_import'->'selection'->>'selectionSha256'=$13
                AND s.field_provenance->'native_stock_import'->'canonical_stock_row'->>'来源编号'=$3
                AND s.field_provenance->'native_stock_import'->'canonical_stock_row'->>'核准库存数量'=$11::text
                AND s.field_provenance->'native_stock_import'->'canonical_stock_row'->>'合并输入库存行数'=
                  (SELECT count(*)::text FROM naijue_erp.import_stock_contributor all_c WHERE all_c.batch_id=c.batch_id
                    AND all_c.warehouse_id=c.warehouse_id AND all_c.canonical_sku_id=c.canonical_sku_id)) IS DISTINCT FROM TRUE))
          AND (SELECT sum(c.signed_quantity::numeric) FROM naijue_erp.import_stock_contributor c
            WHERE c.batch_id=$2::uuid AND c.warehouse_id=$9::uuid AND c.canonical_sku_id=$10::uuid)=$11::numeric
          AND (SELECT count(DISTINCT c.source_unit)=1 AND bool_and(length(btrim(c.source_unit))>0)
            FROM naijue_erp.import_stock_contributor c WHERE c.batch_id=$2::uuid
              AND c.warehouse_id=$9::uuid AND c.canonical_sku_id=$10::uuid)
        FOR SHARE OF r,l,q`, [recordId, batch.id, item.sourceKey, item.sourceRecordHash, item.sourceFileRef, ledgerId,
        now, operationId, item.warehouseId, item.skuId, item.quantity.toString(), item.businessDate, batch.sourceHash])).rows;
      check(rows.length === 1 && rows[0]!.id === recordId, "One new exact signed baseline/balance and ALL original attached contributors required; missing is not zero");
      const claim = await this.insertClaim(recordId, "INVENTORY_LEDGER", ledgerId); this.claimed.add(requestHash(item)); return claim;
    });
  }
  async claimFinalApproval(createdRecord: PgSalesResult): Promise<NativeImportRecordClaim> {
    return this.perform(async () => {
      const { command, batch, now } = this.transaction;
      check(command.action === "IMPORT_PUBLISH" && this.claims.length === 0, "Only original PUBLISH can claim its one new final approval");
      const recordId = stableImportId("source", batch.sourceName, "INVENTORY_SCOPE_APPROVAL", "FINAL_COMPLETE_SCOPE");
      returned(createdRecord, { id: recordId });
      const rows = (await this.client.query(`/* native-accounting:final */ SELECT id FROM naijue_erp.import_record
        WHERE id=$1::uuid AND import_batch_id=$2::uuid AND source_entity_type='INVENTORY_SCOPE_APPROVAL' AND source_key='FINAL_COMPLETE_SCOPE'
          AND source_record_hash=$3 AND source_file_ref=$4 AND target_type='IMPORT_BATCH' AND target_id=$2::uuid
          AND status='IMPORTED' AND decision_reason=$5 AND reviewed_at=$6::timestamptz FOR SHARE`,
      [recordId, batch.id, batch.sourceHash, batch.sourceManifestRef, COMPLETE_SCOPE_DECISION, now])).rows;
      check(rows.length === 1 && rows[0]!.id === recordId, "One new exact original explicit final approval record required");
      return this.insertClaim(recordId, "IMPORT_BATCH", batch.id);
    });
  }
  private async insertClaim(importRecordId: string, targetType: NativeImportRecordClaim["targetType"], targetId: string): Promise<NativeImportRecordClaim> {
    const { batch, operationId, now } = this.transaction; const sequence = batch.checkpoint.sequence + 1;
    const result = await this.client.query(`/* native-accounting:claim */ INSERT INTO naijue_erp.import_record_accounting_claim
      (import_batch_id,import_record_id,target_type,target_id,operation_id,checkpoint_sequence,claimed_at,validator_version)
      VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,$6,$7::timestamptz,$8)
      RETURNING import_batch_id,import_record_id,target_type,target_id,operation_id,checkpoint_sequence`,
    [batch.id, importRecordId, targetType, targetId, operationId, sequence, now, NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION]);
    returned(result, { import_batch_id: batch.id, import_record_id: importRecordId, target_type: targetType, target_id: targetId, operation_id: operationId });
    check(result.rows[0]!.checkpoint_sequence === sequence, "New claim RETURNING sequence differs; never count a skipped/conflicting insert");
    const claim: NativeImportRecordClaim = { batchId: batch.id, importRecordId, targetType, targetId, operationId, checkpointSequence: sequence };
    this.claims.push(claim); return structuredClone(claim);
  }
  checkpoint(): ImportCheckpoint {
    check(!this.failed, "A failed accountant cannot advance progress; original store must roll back");
    return checkpointFromNativeImportClaims(this.transaction.batch.checkpoint, this.transaction.command, this.transaction.operationId, this.claims);
  }
}

export interface NativeStockConservationReport {
  readonly version: typeof NATIVE_IMPORT_STOCK_CONSERVATION_VERSION;
  readonly selectionSha256: string; readonly sourcePayloadHashRecomputed: false;
  readonly contributorsManifestHash: string; readonly effectiveGroupsManifestHash: string;
  readonly contributorCount: number; readonly effectiveGroupCount: number; readonly nativeBaselineCount: number;
  readonly warehouses: readonly { readonly sourceKey: string; readonly nativeId: string; readonly sourceSignedQuantity: string;
    readonly effectiveSignedQuantity: string; readonly nativeSignedQuantity: string; readonly authorizedEmptyScope: boolean }[];
  readonly warehouseUnits: readonly { readonly warehouseSourceKey: string; readonly sourceUnit: string; readonly sourceSignedQuantity: string;
    readonly effectiveSignedQuantity: string; readonly nativeSignedQuantity: string }[];
}
function conservation(ok: unknown, reason: string): asserts ok { requireDomain(ok, "NATIVE_STOCK_CONSERVATION_CONFLICT", reason); }
const countText = (value: unknown): number => {
  conservation(typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value), "SQL observation count is missing/unknown");
  const result = Number(value); conservation(Number.isSafeInteger(result) && result >= 0, "SQL observation count exceeds safe capacity"); return result;
};
/** Required future original-PUBLISH gate, on its ORIGINAL transaction/client.
 * Main-command plan must be independently authenticated. This is SQL field/identity readback,
 * NOT a fresh download or a recomputed whole-source-file hash. No mutation/receipt/commit.
 */
export async function reconcileNativeImportStockConservation(client: PgSalesClient,
  input: NativeRecordAccountingTransaction, runtime26?: NativeRuntime26Capability): Promise<NativeStockConservationReport> {
  const transaction = structuredClone(input);
  await createNativeImportRecordAccountant(client, transaction, runtime26); // same complete schema/batch/hash/approval locks; never creates a claim
  const { command, batch } = transaction;
  conservation(command.action === "IMPORT_PUBLISH" && command.stockConservation !== undefined,
    "An independently authorized stockConservation plan must be inside the MAIN original PUBLISH hash");
  if (command.action !== "IMPORT_PUBLISH" || command.stockConservation === undefined) throw Error("Unreachable conservation command");
  const plan = command.stockConservation;
  conservation(plan.selectionSha256 === batch.sourceHash && plan.warehouses.length === batch.checkpoint.expected.WAREHOUSE
    && plan.effectiveGroupCount === batch.checkpoint.expected.INVENTORY_LEDGER
    && batch.historyMetadata !== undefined && plan.contributorCount === batch.historyMetadata.expectedCounts.import_stock_contributor,
  "Authorized stock selection/counts must match the original frozen native AND separate history scope");
  const warehouseRows = (await client.query(`/* native-accounting:conservation-warehouses */ SELECT w.id,r.source_key,
    (SELECT count(*)::text FROM naijue_erp.import_record_accounting_claim c WHERE c.import_batch_id=$1::uuid
      AND c.import_record_id=r.id AND c.target_type='WAREHOUSE' AND c.target_id=w.id) AS claim_count
    FROM naijue_erp.warehouse w LEFT JOIN naijue_erp.import_record r ON r.import_batch_id=$1::uuid AND r.target_type='WAREHOUSE'
      AND r.target_id=w.id AND r.status='IMPORTED' AND r.source_entity_type='WAREHOUSE' ORDER BY w.id FOR SHARE OF w`, [batch.id])).rows;
  const warehousePlan = new Map(plan.warehouses.map(row => [row.sourceKey, row])); const warehouseIds = new Set<string>();
  conservation(warehouseRows.length === plan.warehouses.length, "Missing/extra warehouse invalidates full authorized scope, even with equal grand total");
  for (const row of warehouseRows) {
    const sourceKey = stringValue(row.source_key), id = stringValue(row.id); const expected = warehousePlan.get(sourceKey);
    conservation(expected?.nativeId === id && !warehouseIds.has(id) && countText(row.claim_count) === 1,
      "Exact complete warehouse source/native/once-only-claim set required"); warehouseIds.add(id);
  }
  const coverage = (await client.query(`/* native-accounting:conservation-source-coverage */ SELECT s.id,c.source_row_id
    FROM naijue_erp.import_source_row s LEFT JOIN naijue_erp.import_stock_contributor c ON c.batch_id=s.batch_id AND c.source_row_id=s.id
    WHERE s.batch_id=$1::uuid AND s.entity_type='INVENTORY_BASELINE' ORDER BY s.id FOR SHARE OF s`, [batch.id])).rows;
  const sourceRows = (await client.query(`/* native-accounting:conservation-contributors */ SELECT c.source_row_id,c.warehouse_id,c.canonical_sku_id,
    c.old_source_sku_id,c.canonical_stock_source_key,c.source_unit,c.signed_quantity::text AS signed_quantity,c.baseline_ledger_id,
    (to_jsonb(s)||jsonb_build_object('row_no',s.row_no::text)) AS source_row,
    a.canonical_source_key AS canonical_sku_source_key,w.source_key AS warehouse_source_key
    FROM naijue_erp.import_stock_contributor c LEFT JOIN naijue_erp.import_source_row s ON s.batch_id=c.batch_id AND s.id=c.source_row_id
    LEFT JOIN naijue_erp.import_sku_alias a ON a.batch_id=c.batch_id AND a.old_source_sku_id=c.old_source_sku_id AND a.canonical_sku_id=c.canonical_sku_id
    LEFT JOIN naijue_erp.import_record w ON w.import_batch_id=c.batch_id AND w.target_type='WAREHOUSE' AND w.target_id=c.warehouse_id
      AND w.source_entity_type='WAREHOUSE' AND w.status='IMPORTED'
    WHERE c.batch_id=$1::uuid ORDER BY c.source_row_id FOR SHARE OF c`, [batch.id])).rows;
  conservation(sourceRows.length === plan.contributorCount && coverage.length === plan.contributorCount,
    "Every original signed contribution, including zero, must be present exactly once");
  const sourceIds = new Set<string>(), sourceKeys = new Set<string>(); const observedContributors: NativeStockContributorObservation[] = [];
  type Group = { warehouseSourceKey: string; canonicalSkuSourceKey: string; warehouseId: string; skuId: string;
    effective: JsonObject; selection: NativeStockSelection; fingerprint: string; contributors: NativeStockContributorInput[]; baselineId: string };
  const groups = new Map<string, Group>();
  for (const row of sourceRows) {
    const rawSource = jsonObject(row.source_row), fullProvenance = jsonObject(rawSource.field_provenance);
    const proof = jsonObject(fullProvenance.native_stock_import), lineage = jsonObject(fullProvenance.stock_contribution);
    const selection = jsonObject(proof.selection); const effective = jsonObject(proof.canonical_stock_row) as JsonObject;
    const warehouseSourceKey = stringValue(row.warehouse_source_key), canonicalSkuSourceKey = stringValue(row.canonical_sku_source_key);
    const warehouseId = stringValue(row.warehouse_id), skuId = stringValue(row.canonical_sku_id), sourceId = stringValue(row.source_row_id);
    const key = stringValue(row.canonical_stock_source_key), signedQuantity = stringValue(row.signed_quantity), sourceUnit = stringValue(row.source_unit);
    conservation(isHistoryQuantity(signedQuantity) && warehousePlan.get(warehouseSourceKey)?.nativeId === warehouseId
      && proof.validator_version === "NATIVE_STOCK_CONTRIBUTOR_V1" && proof.warehouse_native_id === warehouseId && proof.sku_native_id === skuId
      && selection.selectionSha256 === plan.selectionSha256 && selection.csvSha256 === plan.effectiveStockCsvSha256
      && selection.lineageCsvSha256 === plan.contributorLineageCsvSha256 && typeof proof.group_fingerprint === "string"
      && /^[a-f0-9]{64}$/.test(proof.group_fingerprint), "Unknown/changed selected source, native key, quantity or group evidence");
    const { native_stock_import: _native, stock_contribution: _lineage, ...originalProvenance } = fullProvenance;
    const source: ImportSourceEvidence = { id: stringValue(rawSource.id), batchId: stringValue(rawSource.batch_id), entityType: stringValue(rawSource.entity_type),
      sourceKey: stringValue(rawSource.source_key), fileRef: stringValue(rawSource.file_ref), sheet: stringValue(rawSource.sheet), rowNo: stringValue(rawSource.row_no),
      sourceFileSha256: stringValue(rawSource.source_file_sha256), rowSha256: stringValue(rawSource.row_sha256), rawFields: jsonObject(rawSource.raw_fields) as JsonObject,
      normalizedFields: jsonObject(rawSource.normalized_fields) as JsonObject, fieldProvenance: originalProvenance as JsonObject };
    conservation(source.id === sourceId && !sourceIds.has(sourceId) && !sourceKeys.has(source.sourceKey)
      && lineage.signedQuantity === signedQuantity && lineage.sourceUnit === sourceUnit && lineage.oldSkuSourceId === row.old_source_sku_id,
    "Duplicate/mismatched original source identity or signed lineage"); sourceIds.add(sourceId); sourceKeys.add(source.sourceKey);
    const baselineId = stringValue(row.baseline_ledger_id); let group = groups.get(key);
    if (!group) {
      group = { warehouseSourceKey, canonicalSkuSourceKey, warehouseId, skuId, effective, selection: selection as unknown as NativeStockSelection,
        fingerprint: proof.group_fingerprint, contributors: [], baselineId }; groups.set(key, group);
    }
    conservation(group.warehouseSourceKey === warehouseSourceKey && group.canonicalSkuSourceKey === canonicalSkuSourceKey
      && group.warehouseId === warehouseId && group.skuId === skuId && group.baselineId === baselineId
      && group.fingerprint === proof.group_fingerprint && requestHash(group.effective) === requestHash(effective)
      && requestHash(group.selection) === requestHash(selection), "One canonical stock key cannot hide conflicting effective rows, units or native groups");
    group.contributors.push({ source, lineage: lineage as unknown as StockContributionLineage });
    observedContributors.push({ sourceRowId: sourceId, sourceKey: source.sourceKey, sourceFileSha256: source.sourceFileSha256, rowSha256: source.rowSha256,
      fileRef: source.fileRef, sheet: source.sheet, rowNo: source.rowNo, warehouseSourceKey, canonicalSkuSourceKey,
      oldSkuSourceId: stringValue(row.old_source_sku_id), canonicalStockSourceKey: key, warehouseId, skuId, signedQuantity, sourceUnit });
  }
  const coveredIds = new Set<string>();
  for (const row of coverage) {
    const id = stringValue(row.id); conservation(row.source_row_id === id && sourceIds.has(id) && !coveredIds.has(id), "Orphan/duplicate original source occurrence"); coveredIds.add(id);
  }
  const observedGroups: NativeStockEffectiveGroupObservation[] = []; const nativeKeys = new Set<string>();
  for (const [key, group] of groups) {
    const prepared = prepareNativeStockGroup({ batchId: batch.id, fixedSourceNamespace: batch.sourceName, selection: group.selection,
      canonicalStock: group.effective, warehouse: { sourceKey: group.warehouseSourceKey, nativeId: group.warehouseId },
      sku: { canonicalSourceKey: group.canonicalSkuSourceKey, nativeId: group.skuId }, contributors: group.contributors });
    const nativeKey = JSON.stringify([group.warehouseId, group.skuId]);
    conservation(!nativeKeys.has(nativeKey) && group.baselineId === stableImportId("baseline", batch.sourceName, "INVENTORY_BASELINE", key),
      "Duplicate native stock key or wrong baseline identity"); nativeKeys.add(nativeKey);
    observedGroups.push({ canonicalStockSourceKey: key, warehouseSourceKey: group.warehouseSourceKey, canonicalSkuSourceKey: group.canonicalSkuSourceKey,
      warehouseId: group.warehouseId, skuId: group.skuId, signedQuantity: prepared.signedQuantity, sourceUnit: group.contributors[0]!.lineage.sourceUnit,
      contributorCount: group.contributors.length, effectiveRowHash: requestHash(group.effective) });
  }
  const contributorsHash = nativeStockContributorsManifestHash(observedContributors), groupsHash = nativeStockEffectiveGroupsManifestHash(observedGroups);
  conservation(observedGroups.length === plan.effectiveGroupCount && contributorsHash === plan.contributorsManifestHash
    && groupsHash === plan.effectiveGroupsManifestHash, "Actual complete source/effective identity manifests differ from independently authorized selection");
  const baselines = (await client.query(`/* native-accounting:conservation-native */ SELECT l.id,l.operation_id,l.event_kind,l.source_import_batch_id,
    l.warehouse_id,l.sku_id,l.quantity_delta::text AS signed_quantity,r.id AS record_id,r.source_key,w.source_key AS warehouse_source_key,
    k.source_key AS canonical_sku_source_key,
    (q.quantity=l.quantity_delta AND q.version=1 AND q.last_operation_id=l.operation_id AND q.updated_at=l.posted_at) AS balance_equal,
    (SELECT count(*)::text FROM naijue_erp.import_record_accounting_claim c WHERE c.import_batch_id=$1::uuid
      AND c.import_record_id=r.id AND c.target_type='INVENTORY_LEDGER' AND c.target_id=l.id AND c.operation_id=l.operation_id) AS claim_count,
    (SELECT count(*)::text FROM naijue_erp.import_record_accounting_claim c WHERE c.import_batch_id=$1::uuid
      AND c.import_record_id=k.id AND c.target_type='SKU' AND c.target_id=l.sku_id) AS sku_claim_count
    FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.import_record r ON r.import_batch_id=$1::uuid AND r.target_type='INVENTORY_LEDGER'
      AND r.target_id=l.id AND r.source_entity_type='INVENTORY_BASELINE' AND r.status='IMPORTED'
    LEFT JOIN naijue_erp.import_record w ON w.import_batch_id=$1::uuid AND w.target_type='WAREHOUSE' AND w.target_id=l.warehouse_id
      AND w.source_entity_type='WAREHOUSE' AND w.status='IMPORTED'
    LEFT JOIN naijue_erp.import_record k ON k.import_batch_id=$1::uuid AND k.target_type='SKU' AND k.target_id=l.sku_id
      AND k.source_entity_type='SKU' AND k.status='IMPORTED'
    LEFT JOIN naijue_erp.inventory_balance q ON q.warehouse_id=l.warehouse_id AND q.sku_id=l.sku_id
    ORDER BY l.id FOR SHARE OF l`, [batch.id])).rows;
  const balances = (await client.query(`/* native-accounting:conservation-balances */ SELECT warehouse_id,sku_id,quantity::text AS signed_quantity
    FROM naijue_erp.inventory_balance ORDER BY warehouse_id,sku_id FOR SHARE`)).rows;
  conservation(baselines.length === plan.effectiveGroupCount && balances.length === baselines.length,
    "Every effective key requires exactly one real baseline/fresh balance; extra native effects are not allowed");
  const groupByKey = new Map(observedGroups.map(group => [group.canonicalStockSourceKey, group]));
  const actualNative: NativeStockEffectiveGroupObservation[] = [], baselineKeys = new Map<string, string>(), seenGroups = new Set<string>();
  for (const row of baselines) {
    const key = stringValue(row.source_key), group = groupByKey.get(key);
    const nativeKey = JSON.stringify([row.warehouse_id, row.sku_id]);
    conservation(group !== undefined && !seenGroups.has(key) && !baselineKeys.has(nativeKey) && row.event_kind === "CUTOFF_BASELINE"
      && row.source_import_batch_id === batch.id && row.warehouse_id === group.warehouseId && row.sku_id === group.skuId
      && row.warehouse_source_key === group.warehouseSourceKey && row.canonical_sku_source_key === group.canonicalSkuSourceKey
      && row.signed_quantity === group.signedQuantity && row.balance_equal === true
      && row.id === groups.get(key)!.baselineId && row.record_id === stableImportId("source", batch.sourceName, "INVENTORY_BASELINE", key)
      && countText(row.claim_count) === 1 && countText(row.sku_claim_count) === 1,
    "Wrong/missing/duplicate native key, signed quantity, real balance or once-only ownership");
    seenGroups.add(key); baselineKeys.set(nativeKey, group!.signedQuantity); actualNative.push({ ...group! });
  }
  const balanceKeys = new Set<string>();
  for (const row of balances) {
    const key = JSON.stringify([row.warehouse_id, row.sku_id]);
    conservation(!balanceKeys.has(key) && baselineKeys.get(key) === row.signed_quantity, "Missing/extra/changed native balance is not zero"); balanceKeys.add(key);
  }
  const totals = (rows: readonly { warehouseSourceKey: string; sourceUnit: string; signedQuantity: string }[]) => {
    const warehouses = new Map(plan.warehouses.map(row => [row.sourceKey, 0n])), units = new Map<string, bigint>();
    for (const row of rows) {
      conservation(warehouses.has(row.warehouseSourceKey) && isHistoryQuantity(row.signedQuantity), "Unknown source warehouse/quantity cannot be inferred as zero");
      warehouses.set(row.warehouseSourceKey, warehouses.get(row.warehouseSourceKey)! + BigInt(row.signedQuantity));
      const key = JSON.stringify([row.warehouseSourceKey, row.sourceUnit]); units.set(key, (units.get(key) ?? 0n) + BigInt(row.signedQuantity));
    }
    return { warehouses, units };
  };
  const sourceTotals = totals(observedContributors), effectiveTotals = totals(observedGroups), nativeTotals = totals(actualNative);
  conservation(sourceTotals.units.size === plan.warehouseUnits.length && effectiveTotals.units.size === plan.warehouseUnits.length
    && nativeTotals.units.size === plan.warehouseUnits.length, "Missing/extra selected warehouse-unit partition, regardless of global sum");
  const warehouseTotals = plan.warehouses.map(row => {
    const source = sourceTotals.warehouses.get(row.sourceKey)!.toString(), effective = effectiveTotals.warehouses.get(row.sourceKey)!.toString(), native = nativeTotals.warehouses.get(row.sourceKey)!.toString();
    conservation(source === row.signedQuantity && effective === row.signedQuantity && native === row.signedQuantity,
      "Per-warehouse source/effective/native signed totals differ; cross-warehouse cancellation is forbidden");
    return { sourceKey: row.sourceKey, nativeId: row.nativeId, sourceSignedQuantity: source, effectiveSignedQuantity: effective, nativeSignedQuantity: native,
      authorizedEmptyScope: !observedContributors.some(source => source.warehouseSourceKey === row.sourceKey) };
  });
  const unitTotals = plan.warehouseUnits.map(row => {
    const key = JSON.stringify([row.warehouseSourceKey, row.sourceUnit]);
    conservation(sourceTotals.units.has(key) && effectiveTotals.units.has(key) && nativeTotals.units.has(key), "Unknown/missing unit partition is not zero");
    const source = sourceTotals.units.get(key)!.toString(), effective = effectiveTotals.units.get(key)!.toString(), native = nativeTotals.units.get(key)!.toString();
    conservation(source === row.signedQuantity && effective === row.signedQuantity && native === row.signedQuantity, "Per-warehouse-unit three-way signed conservation failed");
    return { warehouseSourceKey: row.warehouseSourceKey, sourceUnit: row.sourceUnit, sourceSignedQuantity: source, effectiveSignedQuantity: effective, nativeSignedQuantity: native };
  });
  return { version: NATIVE_IMPORT_STOCK_CONSERVATION_VERSION, selectionSha256: plan.selectionSha256, sourcePayloadHashRecomputed: false,
    contributorsManifestHash: contributorsHash, effectiveGroupsManifestHash: groupsHash, contributorCount: observedContributors.length,
    effectiveGroupCount: observedGroups.length, nativeBaselineCount: baselines.length, warehouses: warehouseTotals, warehouseUnits: unitTotals };
}

/** The original store calls this on its actual client AFTER its finite bootstrap callback.
 * All record/source/native identities are proved before the original claim INSERT. */
export async function claimNativeCoreWarehouseRecords(client: PgSalesClient,
  input: { readonly command: import("../../../packages/application/src/inventory-cutoff-import.ts").CoreStageCommand;
    readonly operationId: string; readonly now: string }, runtime26: NativeRuntime26Capability): Promise<import("../../../packages/application/src/inventory-cutoff-import.ts").CoreImportCheckpoint> {
  const { command, operationId, now } = structuredClone(input);
  validateCoreImportCommand(command);
  check(now === command.coreInitialization.bootstrapAt && operationId === stableImportId("operation", command.actorAccountId, command.requestKey), "CORE source time/operation must remain original");
  await checkedNativeRuntime26Capability(runtime26)!.assertReady(client, "IMPORT_STAGE");
  const state = (await client.query(`/* native-core:accounting-batch */ SELECT checkpoint FROM naijue_erp.import_batch WHERE id=$1::uuid AND status='STAGED' AND history_payload_hash IS NULL AND history_expected_counts IS NULL FOR UPDATE`, [command.batchId])).rows;
  check(state.length === 1 && requestHash(state[0]!.checkpoint) === requestHash({ sequence: 0, cursor: 0, counts: { WAREHOUSE: 0, SKU: 0, INVENTORY_LEDGER: 0, IMPORT_BATCH: 0 }, expected: {} }), "CORE accounting starts only at the actual zero batch");
  const claims: NativeImportRecordClaim[] = [];
  for (const item of [...command.items].sort((a, b) => compare(a.targetId, b.targetId))) {
    const source = command.coreInitialization.coreSourceMembers.parties.find(row => row.entity === "WAREHOUSE" && row.nativeId === item.targetId)!;
    const proof = (await client.query(`/* native-core:warehouse-record */ SELECT r.id FROM naijue_erp.import_record r
      JOIN naijue_erp.import_source_row s ON s.batch_id=r.import_batch_id AND s.entity_type=r.source_entity_type AND s.source_key=r.source_key
      JOIN naijue_erp.native_party_import_evidence e ON e.batch_id=s.batch_id AND e.source_row_id=s.id AND e.entity_type='WAREHOUSE' AND e.native_id=r.target_id
      JOIN naijue_erp.warehouse w ON w.id=e.native_id AND to_jsonb(w)=e.native_snapshot
      WHERE r.id=$1::uuid AND r.import_batch_id=$2::uuid AND s.id=$3::uuid AND r.source_key=$4 AND r.target_id=$5::uuid
        AND r.source_entity_type='WAREHOUSE' AND r.target_type='WAREHOUSE' AND r.status='IMPORTED' AND r.source_record_hash=$6
        AND r.source_file_ref=$7 AND r.reviewed_at=$8::timestamptz AND r.decision_reason=$9
        AND s.row_sha256=r.source_record_hash AND s.file_ref=r.source_file_ref AND e.source_key=r.source_key
        AND e.warehouse_record=$10::jsonb AND e.selection->>'selectionSha256'=$11
        AND e.creation_xid=pg_current_xact_id() AND s.normalized_fields->>'切换范围'='本次完整核准' FOR SHARE OF r,s,e,w`,
    [item.nativeRecord.id, command.batchId, source.sourceRowId, item.sourceKey, item.targetId, item.sourceRecordHash, item.sourceFileRef,
      item.nativeRecord.reviewedAt, item.nativeRecord.decisionReason, JSON.stringify(item.nativeRecord), command.sourceHash])).rows;
    check(proof.length === 1 && proof[0]!.id === item.nativeRecord.id, "CORE warehouse must have its actual fresh native/source/creator record");
    const result = await client.query(`/* native-accounting:claim */ INSERT INTO naijue_erp.import_record_accounting_claim
      (import_batch_id,import_record_id,target_type,target_id,operation_id,checkpoint_sequence,claimed_at,validator_version)
      VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,$6,$7::timestamptz,$8)
      RETURNING import_batch_id,import_record_id,target_type,target_id,operation_id,checkpoint_sequence`,
    [command.batchId, item.nativeRecord.id, "WAREHOUSE", item.targetId, operationId, 1, now, NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION]);
    returned(result, { import_batch_id: command.batchId, import_record_id: item.nativeRecord.id, target_type: "WAREHOUSE", target_id: item.targetId, operation_id: operationId });
    check(result.rows[0]!.checkpoint_sequence === 1, "Actual CORE claim RETURNING sequence must be1");
    claims.push({ batchId: command.batchId, importRecordId: item.nativeRecord.id, targetType: "WAREHOUSE", targetId: item.targetId, operationId, checkpointSequence: 1 });
  }
  return checkpointFromNativeCoreClaims(command, operationId, claims);
}

export interface NativeCoreContinuationReadback {
  readonly checkpoint: unknown; readonly claims: readonly NativeImportRecordClaim[]; readonly warehouses: readonly CoreWarehouseItem[];
  readonly coreClaims: readonly NativeImportRecordClaim[]; readonly coreWarehouses: readonly CoreWarehouseItem[];
  readonly fullBinding: Readonly<Record<string,unknown>> | null; readonly status: string; readonly actorAccountId: string;
  readonly fixedSourceNamespace: string; readonly selectionSha256: string;
  readonly committedOperations: readonly { readonly operationId: string; readonly requestKey: string; readonly requestHash: string;
    readonly action: string; readonly beforeCheckpoint: unknown; readonly checkpoint: unknown; readonly result: Readonly<Record<string,unknown>> }[];
  readonly records: readonly { readonly importRecordId: string; readonly targetType: ImportTarget; readonly targetId: string;
    readonly sourceEntityType: string; readonly sourceKey: string; readonly sourceRecordHash: string; readonly sourceFileRef: string }[];
}
/** Immutable CORE birth is separate from current progress. No claim/write/retry is performed here. */
export async function readNativeCoreWarehouseCarryForward(client: PgSalesClient,
  binding: { readonly batchId: string; readonly coreReceiptId: string; readonly coreSourceDigest: string }, runtime26: NativeRuntime26Capability): Promise<NativeCoreContinuationReadback> {
  entityId("operation", binding.batchId); entityId("operation", binding.coreReceiptId);
  check(/^[a-f0-9]{64}$/.test(binding.coreSourceDigest), "Original CORE input digest required");
  await checkedNativeRuntime26Capability(runtime26)!.assertReady(client, "IMPORT_STAGE");
  const rows = (await client.query(`/* native-core:carry-forward */ SELECT b.checkpoint,b.status,b.source_name,b.source_hash,b.source_manifest_ref,b.history_payload_hash,
    r.actor_account_id::text AS core_actor,a.after_values->'checkpoint' AS core_checkpoint,
    c.import_batch_id,c.import_record_id,c.target_type,c.target_id,c.operation_id,c.checkpoint_sequence,
    rec.source_entity_type,rec.source_key,rec.source_record_hash,rec.source_file_ref,e.warehouse_record
    FROM naijue_erp.import_batch b JOIN naijue_erp.operation_receipt r ON r.target_id=b.id AND r.target_type='IMPORT' AND r.action='IMPORT_CORE_STAGE'
    JOIN naijue_erp.audit_change a ON a.operation_id=r.id JOIN naijue_erp.import_record_accounting_claim c ON c.operation_id=r.id AND c.import_batch_id=b.id
    JOIN naijue_erp.import_record rec ON rec.id=c.import_record_id AND rec.import_batch_id=b.id AND rec.target_id=c.target_id AND rec.target_type=c.target_type
    JOIN naijue_erp.native_party_import_evidence e ON e.batch_id=b.id AND e.entity_type='WAREHOUSE' AND e.native_id=c.target_id
    JOIN naijue_erp.import_source_row s ON s.id=e.source_row_id AND s.batch_id=b.id
    WHERE b.id=$1::uuid AND r.id=$2::uuid AND r.status='COMMITTED' AND a.after_values->>'coreSourceDigest'=$3
      AND a.action=r.action AND a.object_type='IMPORT' AND a.object_id=b.id AND a.actor_account_id=r.actor_account_id
      AND a.old_version=1 AND a.new_version=2 AND a.after_values->>'phase'='CORE_INITIALIZED_V1'
      AND c.target_type='WAREHOUSE' AND c.checkpoint_sequence=1 AND rec.status='IMPORTED' AND rec.source_entity_type='WAREHOUSE'
      AND e.warehouse_record->>'id'=rec.id::text AND e.warehouse_record->>'decisionReason'=rec.decision_reason
      AND (e.warehouse_record->>'reviewedAt')::timestamptz=rec.reviewed_at AND rec.source_key=e.source_key
      AND rec.source_record_hash=s.row_sha256 AND rec.source_file_ref=s.file_ref
      AND to_jsonb(s)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.source_snapshot))
    ORDER BY c.target_id FOR SHARE OF b,r,a,c,rec,e,s`, [binding.batchId, binding.coreReceiptId, binding.coreSourceDigest])).rows;
  check(rows.length === 22 && new Set(rows.map(row => row.import_record_id)).size === 22 && new Set(rows.map(row => row.target_id)).size === 22,
    "All22 original exact CORE claims must be read back; a missing/conflicting birth record cannot be silently ignored");
  const first=rows[0]!, targets=["WAREHOUSE","SKU","INVENTORY_LEDGER","IMPORT_BATCH"] as const;
  const cp=(value: unknown): Record<string,unknown> => {
    const p=jsonObject(value),counts=jsonObject(p.counts),expected=jsonObject(p.expected);
    check(Object.keys(p).sort().join() === "counts,cursor,expected,sequence" && Object.keys(counts).sort().join() === [...targets].sort().join()
      && [p.sequence,p.cursor,...Object.values(counts)].every(n=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=0&&n<2147483646)
      && Object.values(counts).reduce<number>((sum,n)=>sum+Number(n),0)===p.cursor,"Exact bounded checkpoint and cursor=sum(counts) required");
    check(Object.keys(expected).length===0 || Object.keys(expected).sort().join()===[...targets].sort().join()
      && targets.every(t=>typeof expected[t]==="number"&&Number.isSafeInteger(expected[t])&&Number(expected[t])>=Number(counts[t])&&Number(expected[t])<2147483646)
      && expected.IMPORT_BATCH===1,"Frozen expected counts must bound actual claims");
    return p;
  };
  const checkpoint=cp(first.checkpoint),birth=cp(first.core_checkpoint);
  check(requestHash(birth)===requestHash({sequence:1,cursor:22,counts:{WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0},expected:{}}),
    "Original22 CORE birth checkpoint must remain immutable");
  check(["STAGED","VALIDATING","IMPORTED"].includes(stringValue(first.status)) && Number(checkpoint.sequence)>=1,"Current resumable batch status required");
  const coreClaims = rows.map(row => ({ batchId: stringValue(row.import_batch_id), importRecordId: stringValue(row.import_record_id), targetType: "WAREHOUSE" as const,
    targetId: stringValue(row.target_id), operationId: stringValue(row.operation_id), checkpointSequence: 1 }));
  const coreWarehouses = rows.map(row => ({ sourceEntityType: "WAREHOUSE", sourceKey: stringValue(row.source_key), sourceRecordHash: stringValue(row.source_record_hash),
    sourceFileRef: stringValue(row.source_file_ref), targetType: "WAREHOUSE" as const, targetId: entityId("warehouse", stringValue(row.target_id)),
    nativeRecord: structuredClone(row.warehouse_record) as import("../../../packages/application/src/inventory-cutoff-import.ts").CoreWarehouseItem["nativeRecord"] }));
  const operations=(await client.query(`/* native-core:committed-chain */ SELECT r.id,r.request_key,r.request_hash,r.action,r.actor_account_id::text,
    r.result_data,a.before_values,a.after_values,a.old_version,a.new_version,
    (a.object_type='IMPORT' AND a.object_id=r.target_id AND a.action=r.action AND a.actor_account_id=r.actor_account_id
      AND a.occurred_at=r.completed_at) AS link_ok
    FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id
    WHERE r.target_type='IMPORT' AND r.target_id=$1::uuid AND r.status='COMMITTED' AND r.id<>$2::uuid
    ORDER BY a.new_version,r.id FOR SHARE OF r,a`,[binding.batchId,binding.coreReceiptId])).rows;
  const claimed=(await client.query(`/* native-core:all-claims */ SELECT c.import_batch_id,c.import_record_id,c.target_type,c.target_id,c.operation_id,c.checkpoint_sequence,
    rec.source_entity_type,rec.source_key,rec.source_record_hash,rec.source_file_ref,
    (rec.status='IMPORTED' AND rec.target_type=c.target_type AND rec.target_id=c.target_id) AS record_ok,
    (SELECT e.warehouse_record FROM naijue_erp.native_party_import_evidence e WHERE e.batch_id=c.import_batch_id
      AND e.entity_type='WAREHOUSE' AND e.native_id=c.target_id) AS warehouse_record,
    CASE c.target_type WHEN 'WAREHOUSE' THEN EXISTS(SELECT 1 FROM naijue_erp.native_party_import_evidence e
      JOIN naijue_erp.import_source_row s ON s.batch_id=e.batch_id AND s.id=e.source_row_id
      WHERE e.batch_id=c.import_batch_id AND e.entity_type='WAREHOUSE' AND e.native_id=c.target_id AND e.source_key=rec.source_key
      AND rec.source_entity_type='WAREHOUSE' AND rec.source_record_hash=s.row_sha256 AND rec.source_file_ref=s.file_ref
      AND e.warehouse_record->>'id'=rec.id::text AND e.warehouse_record->>'decisionReason'=rec.decision_reason
      AND (e.warehouse_record->>'reviewedAt')::timestamptz=rec.reviewed_at
      AND to_jsonb(s)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.source_snapshot)))
    WHEN 'SKU' THEN EXISTS(SELECT 1 FROM naijue_erp.import_source_row s JOIN naijue_erp.import_sku_alias al ON al.batch_id=s.batch_id AND al.source_row_id=s.id
      WHERE s.batch_id=c.import_batch_id AND s.entity_type=rec.source_entity_type AND s.source_key=rec.source_key
      AND s.row_sha256=rec.source_record_hash AND s.file_ref=rec.source_file_ref
      AND al.old_source_sku_id=s.source_key AND al.canonical_source_key=rec.source_key AND al.canonical_sku_id=c.target_id
      AND s.field_provenance->'native_sku_import'->>'validator_version'='NATIVE_SKU_IMPORT_V1'
      AND s.field_provenance->'native_sku_import'->>'native_sku_id'=c.target_id::text
      AND s.field_provenance->'native_sku_import'->'selection'->>'selectionSha256'=$3
      AND s.field_provenance->'native_sku_import'->'mapping'->>'isRepresentative'='true')
    WHEN 'INVENTORY_LEDGER' THEN EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.id=c.target_id
      AND l.source_import_batch_id=c.import_batch_id AND l.operation_id=c.operation_id AND l.event_kind='CUTOFF_BASELINE'
      AND rec.source_entity_type='INVENTORY_BASELINE' AND rec.reviewed_at=l.posted_at)
    WHEN 'IMPORT_BATCH' THEN rec.source_entity_type='INVENTORY_SCOPE_APPROVAL' AND rec.source_key='FINAL_COMPLETE_SCOPE'
      AND rec.target_id=c.import_batch_id AND rec.source_record_hash=$3 AND rec.decision_reason=$4 AND rec.source_file_ref=$5
    ELSE false END AS source_ok
    FROM naijue_erp.import_record_accounting_claim c JOIN naijue_erp.import_record rec ON rec.id=c.import_record_id AND rec.import_batch_id=c.import_batch_id
    WHERE c.import_batch_id=$1::uuid ORDER BY c.checkpoint_sequence,c.import_record_id LIMIT $2 FOR SHARE OF c,rec`,
    [binding.batchId,Number(checkpoint.cursor)+1,stringValue(first.source_hash),COMPLETE_SCOPE_DECISION,stringValue(first.source_manifest_ref)])).rows;
  check(claimed.length===checkpoint.cursor,"Current cursor must equal the entire exact claim set, not just birth22");
  const claims:NativeImportRecordClaim[]=[],records:NativeCoreContinuationReadback["records"][number][]=[],warehouses:CoreWarehouseItem[]=[];
  const recordIds=new Set<string>(),targetIds=new Set<string>();
  for(const row of claimed){
    const type=stringValue(row.target_type) as ImportTarget,record=stringValue(row.import_record_id),target=stringValue(row.target_id);
    check(targets.includes(type)&&row.record_ok===true&&row.source_ok===true&&!recordIds.has(record)&&!targetIds.has(`${type}:${target}`),"Claim source/record/target identity must be exact and unique");
    entityId("operation",record);entityId("operation",target);recordIds.add(record);targetIds.add(`${type}:${target}`);
    check(typeof row.checkpoint_sequence==="number"&&Number.isSafeInteger(row.checkpoint_sequence)&&row.checkpoint_sequence>=1,"Claim sequence must be an integer");
    check(row.import_batch_id===binding.batchId&&/^[a-f0-9]{64}$/.test(stringValue(row.source_record_hash))
      && stringValue(row.source_key).trim().length>0&&stringValue(row.source_file_ref).trim().length>0,"Claim must retain exact source identity in this batch");
    if(type==="INVENTORY_LEDGER")check(record===stableImportId("source",stringValue(first.source_name),stringValue(row.source_entity_type),stringValue(row.source_key))
      &&target===stableImportId("baseline",stringValue(first.source_name),stringValue(row.source_entity_type),stringValue(row.source_key)),"Baseline record/ledger IDs must retain original source identity");
    claims.push({batchId:stringValue(row.import_batch_id),importRecordId:record,targetType:type,targetId:target,operationId:stringValue(row.operation_id),checkpointSequence:Number(row.checkpoint_sequence)});
    records.push({importRecordId:record,targetType:type,targetId:target,sourceEntityType:stringValue(row.source_entity_type),sourceKey:stringValue(row.source_key),sourceRecordHash:stringValue(row.source_record_hash),sourceFileRef:stringValue(row.source_file_ref)});
    if(type==="WAREHOUSE"){
      const native=jsonObject(row.warehouse_record);
      check(Object.keys(native).sort().join()==="decisionReason,id,reviewedAt"&&native.id===record&&typeof native.reviewedAt==="string"&&Number.isFinite(Date.parse(native.reviewedAt))
        &&typeof native.decisionReason==="string"&&native.decisionReason.length>0,"Original warehouse record ID/time/reason required without reconstruction");
      warehouses.push({sourceEntityType:"WAREHOUSE",sourceKey:stringValue(row.source_key),sourceRecordHash:stringValue(row.source_record_hash),sourceFileRef:stringValue(row.source_file_ref),targetType:"WAREHOUSE",targetId:entityId("warehouse",target),nativeRecord:structuredClone(native) as unknown as CoreWarehouseItem["nativeRecord"]});
    }
  }
  check(coreClaims.every(c=>claims.filter(x=>requestHash(x)===requestHash(c)).length===1)
    && coreWarehouses.every(w=>warehouses.some(x=>requestHash(x)===requestHash(w))),"All original22 birth claims and exact warehouse items must survive unchanged");
  let previous=birth,fullBinding:Record<string,unknown>|null=null,published=false;const committedOperations:NativeCoreContinuationReadback["committedOperations"][number][]=[];
  const usedOperations=new Set<string>([binding.coreReceiptId]),usedClaims=new Set(coreClaims.map(c=>c.importRecordId));
  for(const row of operations){
    const action=stringValue(row.action),operation=stringValue(row.id),key=stringValue(row.request_key),result=jsonObject(row.result_data);
    const beforeRoot=jsonObject(row.before_values),afterRoot=jsonObject(row.after_values);
    const wrapped=action==="IMPORT_BIND_FULL_SOURCE"||action==="IMPORT_INITIALIZE_BARCODE_SCHEMES";
    const before=cp(wrapped?beforeRoot.checkpoint:beforeRoot),after=cp(wrapped?afterRoot.checkpoint:afterRoot);
    check(!published&&row.link_ok===true&&row.actor_account_id===first.core_actor&&/^[a-f0-9]{64}$/.test(stringValue(row.request_hash))
      && operation===stableImportId("operation",stringValue(first.core_actor),key)&&!usedOperations.has(operation)
      && requestHash(before)===requestHash(previous)&&after.sequence===Number(before.sequence)+1
      && row.old_version===Number(before.sequence)+1&&row.new_version===Number(after.sequence)+1
      && result.operationId===operation&&result.batchId===binding.batchId&&result.sequence===after.sequence&&result.cursor===after.cursor
      && Array.isArray(result.ledgerEntryIds),"Committed receipt/audit must form one exact actor/key/hash/checkpoint chain");
    usedOperations.add(operation);const countsBefore=jsonObject(before.counts),countsAfter=jsonObject(after.counts);
    const owned=claims.filter(c=>c.operationId===operation),delta=targets.reduce((n,t)=>n+Number(countsAfter[t])-Number(countsBefore[t]),0);
    if(action==="IMPORT_BIND_FULL_SOURCE"){
      check(fullBinding===null&&owned.length===0&&delta===0&&after.cursor===before.cursor&&requestHash(before.counts)===requestHash(after.counts)
        && Object.keys(jsonObject(before.expected)).length===0&&beforeRoot.fullBinding===null&&beforeRoot.fullFrozen===false
        && afterRoot.phase==="FULL_SOURCE_BOUND_V1"&&afterRoot.fullFrozen===true&&afterRoot.coreReceiptId===binding.coreReceiptId&&afterRoot.coreSourceDigest===binding.coreSourceDigest,
        "One genuine full binding must preserve current claims");
      check(result.status==="STAGED"&&jsonObject(beforeRoot.checkpoint).sequence===previous.sequence&&beforeRoot.coreReceiptId===binding.coreReceiptId
        &&beforeRoot.coreSourceDigest===binding.coreSourceDigest,"Full binding must retain its original CORE identity and staged result");
      fullBinding=jsonObject(afterRoot.fullBinding);
      check(fullBinding.coreReceiptId===binding.coreReceiptId&&fullBinding.coreSourceDigest===binding.coreSourceDigest
        && fullBinding.authorizedPayloadHash===first.history_payload_hash&&/^[a-f0-9]{64}$/.test(stringValue(fullBinding.authorizedPayloadHash))
        && requestHash(fullBinding.inventoryExpectedCounts)===requestHash(after.expected),"Frozen full hash and expected scope must match actual batch");
    }else if(action==="IMPORT_INITIALIZE_BARCODE_SCHEMES"){
      check(owned.length===0&&after.cursor===before.cursor&&requestHash(after.counts)===requestHash(before.counts)&&requestHash(after.expected)===requestHash(before.expected)
        && afterRoot.commandHash===row.request_hash&&result.status==="STAGED","Scheme initialization advances only sequence, never MAIN claims");
    }else{
      check(fullBinding!==null&&(action==="IMPORT_CHUNK"||action==="IMPORT_PUBLISH")&&requestHash(after.expected)===requestHash(before.expected)
        && owned.length===delta&&owned.length>0&&Number(after.cursor)===Number(before.cursor)+owned.length
        && targets.every(t=>Number(countsAfter[t])-Number(countsBefore[t])===owned.filter(c=>c.targetType===t).length),"MAIN counts and cursor must equal only its exact owned claims");
      for(const c of owned){check(c.checkpointSequence===after.sequence&&!usedClaims.has(c.importRecordId),"Claim cannot belong to another sequence or be counted twice");usedClaims.add(c.importRecordId);}
      if(action==="IMPORT_PUBLISH"){
        check(owned.length===1&&owned[0]!.targetType==="IMPORT_BATCH"&&countsBefore.IMPORT_BATCH===0&&countsAfter.IMPORT_BATCH===1
          && requestHash(after.counts)===requestHash(after.expected)&&result.status==="IMPORTED","Publication must be the one exact final complete-scope claim");published=true;
      }else check(owned.every(c=>c.targetType!=="IMPORT_BATCH")&&(result.status==="STAGED"||result.status==="VALIDATING"),"Only PUBLISH may claim final approval");
    }
    check(requestHash(result.ledgerEntryIds)===requestHash(owned.filter(c=>c.targetType==="INVENTORY_LEDGER").map(c=>c.targetId).sort()),"Receipt ledger IDs must equal its exact claimed baselines");
    previous=after;committedOperations.push({operationId:operation,requestKey:key,requestHash:stringValue(row.request_hash),action,beforeCheckpoint:structuredClone(before),checkpoint:structuredClone(after),result:structuredClone(result)});
  }
  check(requestHash(previous)===requestHash(checkpoint)&&usedClaims.size===claims.length
    && (fullBinding!==null||first.history_payload_hash===null)&&published===(first.status==="IMPORTED")
    &&first.status===(committedOperations.at(-1)?.result.status??"STAGED"),"Current batch must equal the proven chain; missing/future/conflicting links are forbidden");
  return {checkpoint:structuredClone(checkpoint),claims,warehouses,coreClaims,coreWarehouses,fullBinding,status:stringValue(first.status),actorAccountId:stringValue(first.core_actor),
    fixedSourceNamespace:stringValue(first.source_name),selectionSha256:stringValue(first.source_hash),committedOperations,records};
}
