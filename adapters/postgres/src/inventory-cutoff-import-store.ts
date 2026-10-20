import type { CutoffImportBatch, CutoffImportCommand, CutoffImportItem, CutoffImportResult, CutoffImportStore, ImportCheckpoint, ImportCounts, ImportTarget } from "../../../packages/application/src/inventory-cutoff-import.ts";
import { COMPLETE_SCOPE_DECISION, stableImportId, validateCutoffImportCommand, validateImportCounts } from "../../../packages/application/src/inventory-cutoff-import.ts";
import { requestHash } from "../../../packages/application/src/request-hash.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { auditJson, integerValue, jsonObject, nullableString, stringValue } from "./codec.ts";
import type { PgSalesClient, PgSalesPool } from "./sales-unit-of-work.ts";

const stamp = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const targets: readonly ImportTarget[] = ["WAREHOUSE", "SKU", "INVENTORY_LEDGER", "IMPORT_BATCH"];
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const zeroCounts = (): ImportCounts => ({ WAREHOUSE: 0, SKU: 0, INVENTORY_LEDGER: 0, IMPORT_BATCH: 0 });
function counts(value: unknown, expected: boolean): ImportCounts {
  const row = jsonObject(value);
  const result = Object.fromEntries(targets.map(target => [target, integerValue(row[target])])) as unknown as ImportCounts;
  requireDomain(Object.keys(row).length === 4 && Object.values(result).every(v => v >= 0 && v < 2147483646), "INVALID_DATABASE_VALUE", "Invalid persisted import counts");
  if (expected) validateImportCounts(result);
  return result;
}
export function decodeImportCheckpoint(value: unknown): ImportCheckpoint {
  const row = jsonObject(value);
  const result = { sequence: integerValue(row.sequence), cursor: integerValue(row.cursor), counts: counts(row.counts, false), expected: counts(row.expected, true) };
  requireDomain(Object.keys(row).length === 4 && result.sequence >= 0 && result.sequence < 2147483646 && result.cursor >= 0
    && result.cursor < 2147483646 && targets.every(target => result.counts[target] <= result.expected[target]),
  "INVALID_DATABASE_VALUE", "Invalid persisted import checkpoint");
  return result;
}
function decodeResult(value: unknown): CutoffImportResult {
  const row = jsonObject(value); const sequence = integerValue(row.sequence); const cursor = integerValue(row.cursor);
  requireDomain(Object.keys(row).length === 6 && sequence >= 0 && cursor >= 0 && Array.isArray(row.ledgerEntryIds)
    && (row.status === "STAGED" || row.status === "VALIDATING" || row.status === "IMPORTED"), "INVALID_DATABASE_VALUE", "Invalid persisted import receipt");
  return { operationId: entityId("operation", stringValue(row.operationId)), batchId: entityId("operation", stringValue(row.batchId)), sequence, cursor, status: row.status,
    ledgerEntryIds: row.ledgerEntryIds.map(value => entityId("ledger", stringValue(value))) };
}
function decodeBatch(row: Record<string, unknown>): CutoffImportBatch {
  requireDomain(row.inventory_mode === "CUTOFF_STOCK_BASELINE" && ["STAGED", "VALIDATING", "PASSED", "IMPORTED", "FAILED"].includes(stringValue(row.status)),
    "INVALID_DATABASE_VALUE", "Unexpected persisted import batch kind or state");
  return { id: entityId("operation", stringValue(row.id)), sourceName: stringValue(row.source_name), sourceManifestRef: stringValue(row.source_manifest_ref), sourceHash: stringValue(row.source_hash),
    cutoffAt: stringValue(row.cutoff_at), mappingVersion: stringValue(row.mapping_version), inventoryMode: "CUTOFF_STOCK_BASELINE", status: row.status as CutoffImportBatch["status"],
    checkpoint: decodeImportCheckpoint(row.checkpoint), createdAt: stringValue(row.created_at), completedAt: nullableString(row.completed_at) };
}
/** Pure protocol adapter: constructing it does not connect, migrate, seed, or start a server. */
export class PostgresCutoffImportStore implements CutoffImportStore {
  private readonly pool: PgSalesPool;
  constructor(pool: PgSalesPool) { this.pool = pool; }
  async execute(command: CutoffImportCommand, now: string): Promise<CutoffImportResult> {
    const snapshot = structuredClone(command); validateCutoffImportCommand(snapshot);
    requireDomain(Number.isFinite(Date.parse(now)) && now.endsWith("Z"), "INVALID_IMPORT_TIME", "Actual UTC processing time is required");
    const client = await this.pool.connect(); let began = false; let commitAttempted = false; let discard: Error | undefined;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      const result = await this.executeInTransaction(client, snapshot, now);
      commitAttempted = true; await client.query("COMMIT"); return result;
    } catch (error) {
      if (!began || commitAttempted) discard = error instanceof Error ? error : new Error("Import transaction failed");
      if (began) try { await client.query("ROLLBACK"); } catch (rollbackError) {
        discard = rollbackError instanceof Error ? rollbackError : new Error("Import rollback failed");
        throw new AggregateError([error, rollbackError], "Import transaction and rollback failed; connection discarded");
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async executeInTransaction(client: PgSalesClient, command: CutoffImportCommand, now: string): Promise<CutoffImportResult> {
    const digest = requestHash(command);
    const operationId = entityId("operation", stableImportId("operation", command.actorAccountId, command.requestKey));
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:receipt:${JSON.stringify([command.actorAccountId, command.requestKey])}`]);
    const previous = (await client.query(`SELECT request_hash, target_type, target_id, action, result_data FROM naijue_erp.operation_receipt
      WHERE actor_account_id = $1 AND request_key = $2`, [command.actorAccountId, command.requestKey])).rows[0];
    if (previous) {
      requireDomain(previous.request_hash === digest && previous.target_type === "IMPORT" && previous.target_id === command.batchId && previous.action === command.action,
        "IDEMPOTENCY_CONFLICT", "Original account/key belongs to different content or target");
      return decodeResult(previous.result_data);
    }
    await client.query("SELECT naijue_erp.cutoff_import_lock()");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:import-batch:${command.batchId}`]);
    const found = (await client.query(`SELECT id, source_name, source_manifest_ref, source_hash, ${stamp("cutoff_at")} AS cutoff_at,
      mapping_version, inventory_mode, status, checkpoint, ${stamp("created_at")} AS created_at, ${stamp("completed_at")} AS completed_at
      FROM naijue_erp.import_batch WHERE id = $1 FOR UPDATE`, [command.batchId])).rows[0];
    let batch: CutoffImportBatch; let before: ImportCheckpoint | null; let checkpoint: ImportCheckpoint; let status: CutoffImportResult["status"];
    if (command.action === "IMPORT_STAGE") {
      requireDomain(found === undefined, "IMPORT_BATCH_EXISTS", "Resume the original batch with its original request keys");
      checkpoint = { sequence: 0, cursor: 0, counts: zeroCounts(), expected: command.expected }; before = null; status = "STAGED";
      batch = { id: command.batchId, sourceName: command.sourceName, sourceManifestRef: command.sourceManifestRef, sourceHash: command.sourceHash,
        cutoffAt: command.cutoffAt, mappingVersion: command.mappingVersion, inventoryMode: "CUTOFF_STOCK_BASELINE", status,
        checkpoint, createdAt: now, completedAt: null };
      const inserted = await client.query(`INSERT INTO naijue_erp.import_batch (id, source_name, source_manifest_ref, source_hash, cutoff_at, mapping_version,
        inventory_mode, status, checkpoint, created_at, completed_at) VALUES ($1, $2, $3, $4, $5::timestamptz, $6, 'CUTOFF_STOCK_BASELINE', 'STAGED', $7::jsonb, $8::timestamptz, NULL)`,
      [batch.id, batch.sourceName, batch.sourceManifestRef, batch.sourceHash, batch.cutoffAt, batch.mappingVersion, auditJson(checkpoint), now]);
      requireDomain(inserted.rowCount === 1, "IMPORT_INSERT_FAILED", "Staged batch was not inserted");
    } else {
      requireDomain(found !== undefined, "IMPORT_BATCH_NOT_FOUND", "Stage an approved frozen manifest before importing data"); batch = decodeBatch(found);
      requireDomain(batch.status === "STAGED" || batch.status === "VALIDATING", "IMPORT_BATCH_FROZEN", "Published, passed, or failed batches cannot accept data");
      before = batch.checkpoint;
      requireDomain(before.sequence === command.expectedSequence && before.cursor === command.expectedCursor, "IMPORT_CHECKPOINT_CONFLICT", "Resume only from the committed stable checkpoint");
      const nextCounts = { ...before.counts };
      if (command.action === "IMPORT_CHUNK") {
        // Source identity locks are deterministic; membership records precede baseline records.
        const ordered = [...command.items].sort((a, b) => targets.indexOf(a.targetType) - targets.indexOf(b.targetType)
          || compare(JSON.stringify([a.sourceEntityType, a.sourceKey]), JSON.stringify([b.sourceEntityType, b.sourceKey])));
        const sourceOrder = [...ordered].sort((a, b) => compare(JSON.stringify([a.sourceEntityType, a.sourceKey]), JSON.stringify([b.sourceEntityType, b.sourceKey])));
        // Acquire cross-batch source locks in a global order BEFORE the INSERT statements.
        // The next READ COMMITTED statement sees the preceding owner's committed identity.
        for (const item of sourceOrder) await client.query("SELECT naijue_erp.import_source_key_lock($1, $2, $3)", [batch.sourceName, item.sourceEntityType, item.sourceKey]);
        const keys = ordered.filter((item): item is Extract<CutoffImportItem, { targetType: "INVENTORY_LEDGER" }> => item.targetType === "INVENTORY_LEDGER")
          .map(item => [item.warehouseId, item.skuId] as const).sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
        for (const [warehouseId, skuId] of keys) await client.query("SELECT naijue_erp.inventory_key_lock($1::uuid, $2::uuid)", [warehouseId, skuId]);
        for (const item of ordered) {
          nextCounts[item.targetType]++;
          requireDomain(nextCounts[item.targetType] <= before.expected[item.targetType], "IMPORT_EXPECTED_COUNT_EXCEEDED", "Source count exceeds the frozen reviewed manifest");
          await this.insertItem(client, batch, item, operationId, now);
        }
        checkpoint = { ...before, sequence: before.sequence + 1, cursor: before.cursor + command.items.length, counts: nextCounts }; status = "VALIDATING";
      } else {
        requireDomain(command.approval.sourceHash === batch.sourceHash && command.approval.sourceManifestRef === batch.sourceManifestRef,
          "IMPORT_MANIFEST_CONFLICT", "Final approval must refer to the exact frozen reviewed manifest");
        requireDomain(targets.filter(target => target !== "IMPORT_BATCH").every(target => batch.checkpoint.counts[target] === batch.checkpoint.expected[target])
          && before.counts.IMPORT_BATCH === 0, "INCOMPLETE_IMPORT_SCOPE", "Every expected source and nonzero baseline must be reconciled before publication");
        await this.insertRecord(client, batch, { sourceEntityType: "INVENTORY_SCOPE_APPROVAL", sourceKey: "FINAL_COMPLETE_SCOPE",
          sourceRecordHash: batch.sourceHash, sourceFileRef: batch.sourceManifestRef }, "IMPORT_BATCH", batch.id, COMPLETE_SCOPE_DECISION, now);
        nextCounts.IMPORT_BATCH = 1; checkpoint = { ...before, sequence: before.sequence + 1, cursor: before.cursor + 1, counts: nextCounts }; status = "IMPORTED";
      }
      requireDomain(checkpoint.sequence < 2147483646 && checkpoint.cursor < 2147483646, "IMPORT_COUNTER_OVERFLOW", "Import checkpoint exceeds integer audit capacity");
      const update = await client.query(`UPDATE naijue_erp.import_batch SET status = $2, checkpoint = $3::jsonb,
        completed_at = $4::timestamptz WHERE id = $1 AND checkpoint->>'sequence' = $5 AND checkpoint->>'cursor' = $6 AND status IN ('STAGED', 'VALIDATING')`,
      [batch.id, status, auditJson(checkpoint), status === "IMPORTED" ? now : null, String(before.sequence), String(before.cursor)]);
      requireDomain(update.rowCount === 1, "IMPORT_CHECKPOINT_CONFLICT", "Atomic import checkpoint compare-and-swap failed");
    }
    const ledgerEntryIds = command.action === "IMPORT_CHUNK" ? command.items.filter(item => item.targetType === "INVENTORY_LEDGER")
      .map(item => entityId("ledger", stableImportId("baseline", batch.sourceName, item.sourceEntityType, item.sourceKey))).sort() : [];
    const result: CutoffImportResult = { operationId, batchId: batch.id, sequence: checkpoint.sequence, cursor: checkpoint.cursor, status, ledgerEntryIds };
    await client.query(`INSERT INTO naijue_erp.audit_change (id, operation_id, actor_account_id, object_type, object_id, action,
      old_version, new_version, before_values, after_values, occurred_at) VALUES ($1, $2, $3, 'IMPORT', $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::timestamptz)`,
    [stableImportId("audit", operationId), operationId, command.actorAccountId, batch.id, command.action, before === null ? null : before.sequence + 1,
      checkpoint.sequence + 1, before === null ? null : auditJson(before), auditJson(checkpoint), now]);
    await client.query(`INSERT INTO naijue_erp.operation_receipt (id, actor_account_id, request_key, request_hash, action, target_type, target_id,
      status, result_data, created_at, completed_at) VALUES ($1, $2, $3, $4, $5, 'IMPORT', $6, 'COMMITTED', $7::jsonb, $8::timestamptz, $8::timestamptz)`,
    [operationId, command.actorAccountId, command.requestKey, digest, command.action, batch.id, auditJson(result), now]);
    return result;
  }
  private async insertRecord(client: PgSalesClient, batch: CutoffImportBatch, source: Pick<CutoffImportItem, "sourceEntityType" | "sourceKey" | "sourceRecordHash" | "sourceFileRef">,
    targetType: ImportTarget, targetId: string, decisionReason: string | null, now: string): Promise<void> {
    await client.query("SELECT naijue_erp.import_source_key_lock($1, $2, $3)", [batch.sourceName, source.sourceEntityType, source.sourceKey]);
    const inserted = await client.query(`INSERT INTO naijue_erp.import_record (id, import_batch_id, source_entity_type, source_key, source_record_hash, source_file_ref,
      target_type, target_id, status, decision_reason, reviewed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'IMPORTED', $9, $10::timestamptz)`,
    [stableImportId("source", batch.sourceName, source.sourceEntityType, source.sourceKey), batch.id, source.sourceEntityType, source.sourceKey,
      source.sourceRecordHash, source.sourceFileRef, targetType, targetId, decisionReason, now]);
    requireDomain(inserted.rowCount === 1, "IMPORT_INSERT_FAILED", "Approved source identity was not inserted; checkpoint cannot advance");
  }
  private async insertItem(client: PgSalesClient, batch: CutoffImportBatch, item: CutoffImportItem, operationId: string, now: string): Promise<void> {
    if (item.targetType !== "INVENTORY_LEDGER") { await this.insertRecord(client, batch, item, item.targetType, item.targetId, null, now); return; }
    const ledgerId = stableImportId("baseline", batch.sourceName, item.sourceEntityType, item.sourceKey);
    await this.insertRecord(client, batch, item, "INVENTORY_LEDGER", ledgerId, null, now);
    const ledger = await client.query(`INSERT INTO naijue_erp.inventory_ledger (id, operation_id, event_kind, warehouse_id, sku_id, quantity_delta,
      source_sales_line_id, source_transfer_line_id, source_import_batch_id, source_document_version, endpoint, reverses_entry_id, business_date, posted_at)
      VALUES ($1, $2, 'CUTOFF_BASELINE', $3, $4, $5::bigint, NULL, NULL, $6, NULL, 'IMPORT_BASELINE', NULL, $7::date, $8::timestamptz)`,
    [ledgerId, operationId, item.warehouseId, item.skuId, item.quantity.toString(), batch.id, item.businessDate, now]);
    requireDomain(ledger.rowCount === 1, "IMPORT_INSERT_FAILED", "Nonzero baseline ledger effect was not inserted");
    // Deliberate INSERT only: no overwrite/upsert of previously used stock, even zero.
    const balance = await client.query(`INSERT INTO naijue_erp.inventory_balance (warehouse_id, sku_id, quantity, version, last_operation_id, updated_at)
      VALUES ($1, $2, $3::bigint, 1, $4, $5::timestamptz)`, [item.warehouseId, item.skuId, item.quantity.toString(), operationId, now]);
    requireDomain(balance.rowCount === 1, "IMPORT_INSERT_FAILED", "Nonzero baseline balance was not inserted");
  }
}
