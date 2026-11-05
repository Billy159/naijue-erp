import type { InventoryBalanceRow, InventoryLedgerRow } from "../../../packages/domain/src/inventory.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { EntityId } from "../../../packages/domain/src/values.ts";
import { COMPLETE_SCOPE_DECISION } from "../../../packages/application/src/inventory-cutoff-import.ts";
import { decodeImportCheckpoint } from "./inventory-cutoff-import-store.ts";
import { booleanValue, quantityFromSql, stringValue, versionFromSql, versionToSql } from "./codec.ts";
import type { PgSalesResult } from "./sales-unit-of-work.ts";
import type { PgSalesClient } from "./sales-unit-of-work.ts";
import type { HistoryRevisionPostingContext, HistoryRevisionPostingEffect, HistoryRevisionPostingPort } from "../../../packages/application/src/inventory-posting.ts";
import type { InventoryAdmissionRuntime } from "./inventory-key-admission-reader.ts";
import { readInventoryKeyAdmissions } from "./inventory-key-admission-reader.ts";
import { addQuantity, businessDate, quantity, version, nextVersion } from "../../../packages/domain/src/values.ts";
import { checkedNativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";

type Query = (sql: string, values?: unknown[]) => Promise<PgSalesResult>;
type PostingProof = Pick<InventoryLedgerRow, "warehouseId" | "skuId" | "quantityDelta" | "operationId" | "postedAt" | "reversesEntryId">
  & { readonly eventKind: InventoryLedgerRow["eventKind"] | "HISTORY_REVISION" };
interface Key { readonly warehouseId: EntityId<"warehouse">; readonly skuId: EntityId<"sku"> }
/** Inert prepared facts, not a database capability. The issuing manager owns the
 * exact token; copies cannot acknowledge another manager's ledger append. */
export interface PreparedLiveLedgerAppend {
  readonly quantityBefore: InventoryBalanceRow["quantity"];
  readonly quantityAfter: InventoryBalanceRow["quantity"];
}
interface PendingLiveLedgerAppend {
  readonly row: InventoryLedgerRow; readonly expected: InventoryBalanceRow;
  readonly token: PreparedLiveLedgerAppend; appended: boolean;
}
const key = (warehouse: string, sku: string): string => JSON.stringify([warehouse, sku]);
const stamp = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const integrity = (condition: unknown, message: string): void => requireDomain(condition, "INVENTORY_INTEGRITY_FAILED", message);
/** Constant-size native capability proof, exact table/trigger pairs. Not protection against a privileged owner bypassing guards. */
const GUARDS = `/* posting:guards */ SELECT
  EXISTS (SELECT 1 FROM naijue_erp.schema_migration WHERE version = 8)
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'naijue_erp.inventory_ledger'::regclass
    AND confrelid = 'naijue_erp.inventory_balance'::regclass AND conname = 'ledger_retains_balance'
    AND contype = 'f' AND convalidated AND condeferrable AND confdeltype = 'a')
  AND NOT EXISTS (SELECT 1 FROM (VALUES
    ('inventory_ledger', 'immutable_ledger'), ('import_record', 'immutable_import_record'),
    ('audit_change', 'immutable_audit'), ('operation_receipt', 'immutable_receipt'),
    ('import_batch', 'import_batch_transition'), ('import_batch', 'import_batch_command_consistency'),
    ('inventory_balance', 'inventory_balance_identity'), ('inventory_balance', 'sparse_balance_final_consistency'),
    ('inventory_ledger', 'cutoff_ledger_guard'), ('import_record', 'import_record_identity'),
    ('warehouse', 'warehouse_import_identity'), ('sku', 'sku_import_identity'),
    ('import_record', 'import_source_final_consistency'), ('inventory_ledger', 'baseline_source_final_consistency'),
    ('operation_receipt', 'import_operation_consistency'), ('inventory_ledger', 'cutoff_ledger_no_truncate'),
    ('inventory_balance', 'cutoff_balance_no_truncate'), ('import_record', 'cutoff_sources_no_truncate'),
    ('import_batch', 'cutoff_batch_no_truncate'), ('operation_receipt', 'cutoff_receipts_no_truncate'),
    ('audit_change', 'cutoff_audits_no_truncate'), ('warehouse', 'cutoff_warehouse_no_truncate'), ('sku', 'cutoff_sku_no_truncate'),
    ('inventory_ledger', 'validate_sales_ledger_source'), ('inventory_ledger', 'validate_transfer_ledger_source'),
    ('inventory_ledger', 'ledger_receipt_source_coherence'), ('operation_receipt', 'sales_receipt_final_consistency'),
    ('operation_receipt', 'transfer_receipt_final_consistency')
  ) AS required(table_name, trigger_name) WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'naijue_erp'
      AND c.relname = required.table_name AND t.tgname = required.trigger_name AND t.tgenabled = 'O'))
  AND NOT EXISTS (SELECT 1 FROM (VALUES ('import_batch', 'import_one_published_cutoff'), ('import_record', 'import_scope_target_once'))
    AS required(table_name, index_name) WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class c ON c.oid = i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_class x ON x.oid = i.indexrelid WHERE n.nspname = 'naijue_erp' AND c.relname = required.table_name
      AND x.relname = required.index_name AND i.indisunique AND i.indisvalid AND i.indisready)) AS integrity_guards_present`;

/** One command transaction owns this object. No proof/cache survives COMMIT, rollback or callback close. */
export class PostgresPostingBalances {
  private readonly query: Query;
  private locked: Set<string> | undefined;
  private readonly balances = new Map<string, InventoryBalanceRow>();
  private readonly provenZero = new Set<string>();
  private readonly firstEffects = new Map<string, PostingProof>();
  private readonly liveByKey = new Map<string, PendingLiveLedgerAppend>();
  private readonly liveTokens = new WeakMap<PreparedLiveLedgerAppend, PendingLiveLedgerAppend>();
  private liveWriteFailed = false;
  private batchId: string | undefined;
  private readonly admissionRuntime: InventoryAdmissionRuntime | null;
  private runtime26: { readonly client: PgSalesClient; readonly capability: NativeRuntime26Capability } | undefined;
  constructor(query: Query, admissionRuntime: InventoryAdmissionRuntime | null = null) {
    this.query = query; this.admissionRuntime = admissionRuntime;
  }
  /** Independent successor: business SQL is derived from the exact proof client,
   * never a separately supplied query wrapper or a copied lease. */
  static forRuntime26(client: PgSalesClient, capability: NativeRuntime26Capability, assertActive: () => void): PostgresPostingBalances {
    const checked = checkedNativeRuntime26Capability(capability);
    if (checked === undefined || typeof client?.query !== "function" || typeof assertActive !== "function")
      throw new TypeError("Explicit original client, exact26 capability and active transaction required");
    const balances = new PostgresPostingBalances(async (sql, values) => {
      assertActive(); const result = await client.query(sql, values); assertActive(); return result;
    });
    balances.runtime26 = Object.freeze({ client, capability: checked }); return balances;
  }
  async lock(keys: readonly Key[]): Promise<void> {
    requireDomain(this.locked === undefined, "TRANSACTION_SCOPE", "Lock the complete posting set exactly once");
    if (this.runtime26) await this.runtime26.capability.assertReady(this.runtime26.client, "INVENTORY_ADMISSION");
    // IDENTICAL binary JSON tuple order and SQL lock namespace to the cutoff importer.
    const unique = [...new Map(keys.map(row => [key(row.warehouseId, row.skuId), row])).entries()]
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    this.locked = new Set(unique.map(([identity]) => identity));
    // Separate awaited calls make evaluation order explicit, independent of a SQL planner's target-list evaluation.
    for (const [, row] of unique) await this.query("SELECT naijue_erp.inventory_key_lock($1::uuid, $2::uuid)", [row.warehouseId, row.skuId]);
    if (unique.length === 0) return;
    const rows = (await this.query(`SELECT b.warehouse_id, b.sku_id, b.quantity::text, b.version, b.last_operation_id, ${stamp("b.updated_at")} AS updated_at
      FROM naijue_erp.inventory_balance b JOIN unnest($1::uuid[], $2::uuid[]) AS k(warehouse_id, sku_id)
      ON k.warehouse_id = b.warehouse_id AND k.sku_id = b.sku_id ORDER BY b.warehouse_id, b.sku_id FOR UPDATE OF b`,
    [unique.map(([, row]) => row.warehouseId), unique.map(([, row]) => row.skuId)])).rows;
    for (const row of rows) {
      const balance: InventoryBalanceRow = { warehouseId: entityId("warehouse", stringValue(row.warehouse_id)), skuId: entityId("sku", stringValue(row.sku_id)),
        quantity: quantityFromSql(row.quantity), version: versionFromSql(row.version), lastOperationId: row.last_operation_id === null ? null : entityId("operation", stringValue(row.last_operation_id)), updatedAt: stringValue(row.updated_at) };
      const identity = key(balance.warehouseId, balance.skuId);
      integrity(this.locked.has(identity) && !this.balances.has(identity), "Unexpected or duplicate locked balance");
      this.balances.set(identity, balance);
    }
  }
  get(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">): InventoryBalanceRow | undefined {
    requireDomain(this.locked?.has(key(warehouseId, skuId)), "TRANSACTION_SCOPE", "Balance must belong to the complete locked posting set");
    return structuredClone(this.balances.get(key(warehouseId, skuId)));
  }
  private async publication(): Promise<string> {
    if (this.batchId !== undefined) return this.batchId;
    const rows = (await this.query(`/* posting:publication */ SELECT b.id, b.checkpoint, b.completed_at IS NOT NULL AS completed,
      EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = b.id AND r.status = 'IMPORTED'
        AND r.target_type = 'IMPORT_BATCH' AND r.target_id = b.id AND r.source_entity_type = 'INVENTORY_SCOPE_APPROVAL'
        AND r.source_key = 'FINAL_COMPLETE_SCOPE' AND r.decision_reason = $1 AND r.source_record_hash = b.source_hash
        AND r.source_file_ref = b.source_manifest_ref) AS final_approval
      FROM naijue_erp.import_batch b WHERE b.status = 'IMPORTED' AND b.inventory_mode = 'CUTOFF_STOCK_BASELINE' ORDER BY b.id LIMIT 2`, [COMPLETE_SCOPE_DECISION])).rows;
    requireDomain(rows.length > 0, "INVENTORY_NOT_READY", "No completely published inventory takeover is available");
    integrity(rows.length === 1, "Multiple published initial scopes are not legal");
    const row = rows[0]!;
    integrity(booleanValue(row.completed) && booleanValue(row.final_approval), "Complete immutable scope approval is unavailable");
    const checkpoint = decodeImportCheckpoint(row.checkpoint);
    integrity(checkpoint.sequence > 0 && checkpoint.expected.IMPORT_BATCH === 1
      && Object.entries(checkpoint.expected).every(([kind, expected]) => checkpoint.counts[kind as keyof typeof checkpoint.counts] === expected)
      && checkpoint.cursor === Object.values(checkpoint.counts).reduce((sum, value) => sum + value, 0), "Published checkpoint is incomplete");
    const guards = (await this.query(GUARDS)).rows;
    integrity(guards.length === 1 && booleanValue(guards[0]!.integrity_guards_present), "Native runtime sparse first-use guards are unavailable");
    this.batchId = entityId("operation", stringValue(row.id));
    return this.batchId;
  }
  /** Only the borrowed HISTORY exact24 path batches missing-key evidence.
   * Existing sales/transfer first-use semantics keep their original path. */
  async assertHistoryZeros(keys: readonly Key[]): Promise<void> {
    requireDomain(this.admissionRuntime?.profile === "EXACT24" && this.runtime26 === undefined,
      "TRANSACTION_SCOPE", "Original historical posting context required");
    const unique=[...new Map(keys.map(row=>[key(row.warehouseId,row.skuId),row])).entries()]
      .filter(([identity])=>!this.provenZero.has(identity));
    if(!unique.length)return;
    requireDomain(unique.every(([identity])=>this.locked?.has(identity)&&!this.balances.has(identity)),"TRANSACTION_SCOPE","Only absent locked historical keys may prove zero");
    const batchId=await this.publication();await this.admissionRuntime.assertReady({query:this.query});
    const admissions=await readInventoryKeyAdmissions({query:this.query},unique.map(([,row])=>row));
    requireDomain(admissions.length===unique.length&&admissions.every(row=>row.admitted&&row.publishedBatchId===batchId),"INVENTORY_NOT_READY","Every historical first key requires original native admission");
    const rows=(await this.query(`/* history-posting:unused-keys */ SELECT k.warehouse_id::text,k.sku_id::text,
      NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_balance b WHERE b.warehouse_id=k.warehouse_id AND b.sku_id=k.sku_id) AS balance_absent,
      NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=k.warehouse_id AND l.sku_id=k.sku_id) AS ledger_absent
      FROM unnest($1::uuid[],$2::uuid[]) AS k(warehouse_id,sku_id)`,
    [unique.map(([,row])=>row.warehouseId),unique.map(([,row])=>row.skuId)])).rows;
    const pending=new Set(unique.map(([identity])=>identity));
    for(const row of rows){const identity=key(stringValue(row.warehouse_id),stringValue(row.sku_id));
      integrity(pending.delete(identity)&&row.balance_absent===true&&row.ledger_absent===true,"Historical first use cannot adopt an already used or unproven key");}
    integrity(pending.size===0,"Every historical missing key must be observed");
    for(const [identity] of unique)this.provenZero.add(identity);
  }
  async assertZero(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">): Promise<void> {
    const identity = key(warehouseId, skuId);
    requireDomain(this.locked?.has(identity) && !this.balances.has(identity), "TRANSACTION_SCOPE", "Only an absent locked posting key can acquire a zero proof");
    if (this.provenZero.has(identity)) return;
    const batchId = await this.publication();
    if (this.runtime26 !== undefined || this.admissionRuntime !== null) {
      if (this.runtime26) await this.runtime26.capability.assertReady(this.runtime26.client, "INVENTORY_ADMISSION");
      else await this.admissionRuntime!.assertReady({ query: this.query });
      const admissions = await readInventoryKeyAdmissions({ query: this.query }, [{ warehouseId, skuId }]);
      requireDomain(admissions[0]?.admitted === true && admissions[0].publishedBatchId === batchId,
        "INVENTORY_NOT_READY", "Exact native admission is unavailable for this published scope");
      const unused = (await this.query(`/* posting:admitted-unused-key */ SELECT
        NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_balance WHERE warehouse_id=$1::uuid AND sku_id=$2::uuid) AS balance_absent,
        NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id=$1::uuid AND sku_id=$2::uuid) AS ledger_absent`, [warehouseId, skuId])).rows;
      integrity(unused.length === 1 && unused[0]!.balance_absent === true && unused[0]!.ledger_absent === true,
        "Admitted first use cannot rebuild an already-used missing balance");
      this.provenZero.add(identity); return;
    }
    const rows = (await this.query(`/* posting:zero-key */ SELECT w.id AS warehouse_id, s.id AS sku_id,
      EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = $3::uuid AND r.status = 'IMPORTED'
        AND r.target_type = 'WAREHOUSE' AND r.target_id = w.id) AS warehouse_published,
      EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = $3::uuid AND r.status = 'IMPORTED'
        AND r.target_type = 'SKU' AND r.target_id = s.id) AS sku_published,
      NOT EXISTS (SELECT 1 FROM naijue_erp.inventory_balance b WHERE b.warehouse_id = w.id AND b.sku_id = s.id) AS balance_absent,
      NOT EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id = w.id AND l.sku_id = s.id) AS ledger_absent,
      m.size_id IS NOT NULL AS valid_size
      FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id = w.hall_id
      JOIN naijue_erp.sku s ON s.id = $2::uuid JOIN naijue_erp.product p ON p.id = s.product_id
      JOIN naijue_erp.color c ON c.id = s.color_id JOIN naijue_erp.fit f ON f.id = s.fit_id
      JOIN naijue_erp.size_group_member m ON m.size_group_id = p.size_group_id AND m.size_id = s.size_id
      WHERE w.id = $1::uuid FOR SHARE OF w, h, s, p, c, f, m`, [warehouseId, skuId, batchId])).rows;
    requireDomain(rows.length === 1 && rows[0]!.warehouse_id === warehouseId && rows[0]!.sku_id === skuId
      && booleanValue(rows[0]!.warehouse_published) && booleanValue(rows[0]!.sku_published), "INVENTORY_NOT_READY", "Exact native posting key is outside the proven published scope");
    const row = rows[0]!;
    integrity(booleanValue(row.balance_absent) && booleanValue(row.ledger_absent) && booleanValue(row.valid_size), "Missing balance is not a previously unused valid native key");
    this.provenZero.add(identity);
  }
  assertCanAppend(row: PostingProof): void {
    const identity = key(row.warehouseId, row.skuId);
    requireDomain(this.locked?.has(identity), "TRANSACTION_SCOPE", "Ledger key must belong to the complete locked posting set");
    requireDomain(this.balances.has(identity) || (this.provenZero.has(identity)
      && (row.eventKind === "APPROVE" || (row.eventKind === "HISTORY_REVISION" && this.admissionRuntime?.profile === "EXACT24")) && row.reversesEntryId === null),
      "INVENTORY_NOT_READY", "Ledger requires an existing balance or explicit first-approval zero proof");
    requireDomain(!this.firstEffects.has(identity), "TRANSACTION_SCOPE", "Persist the first actual balance before another same-key effect");
    requireDomain(!this.liveByKey.has(identity), "TRANSACTION_SCOPE", "Persist the prepared live effect before another same-key append");
  }
  /** Native append seam only. Call after original coverage proof, before the
   * original ledger INSERT. Nothing is persisted or acknowledged here. HISTORY
   * batching deliberately continues to use assertCanAppend without snapshots. */
  prepareLiveAppend(input: InventoryLedgerRow): PreparedLiveLedgerAppend {
    const row = structuredClone(input);
    requireDomain(this.admissionRuntime?.profile !== "EXACT24"
      && (row.eventKind === "APPROVE" || row.eventKind === "UNAPPROVE")
      && (row.source.kind === "SALES" || row.source.kind === "TRANSFER")
      && ((row.eventKind === "UNAPPROVE") === (row.reversesEntryId !== null))
      && row.quantityDelta !== 0n, "TRANSACTION_SCOPE", "Only exact native live effects may prepare recorded balances");
    this.assertCanAppend(row);
    requireDomain(!this.liveWriteFailed, "TRANSACTION_SCOPE", "A failed live write requires transaction abandonment");
    const previous = this.get(row.warehouseId, row.skuId);
    // assertCanAppend has already required explicit provenZero for an absent key.
    // Absence itself is never the authority for assigning this zero.
    const before = previous === undefined ? quantity("0") : previous.quantity;
    const after = addQuantity(before, row.quantityDelta);
    const expected: InventoryBalanceRow = { warehouseId: row.warehouseId, skuId: row.skuId,
      quantity: after, version: previous === undefined ? version(1) : nextVersion(previous.version),
      lastOperationId: row.operationId, updatedAt: row.postedAt };
    versionToSql(expected.version);
    const token = Object.freeze({ quantityBefore: before, quantityAfter: after });
    const pending: PendingLiveLedgerAppend = { row, expected: Object.freeze(expected), token, appended: false };
    this.liveByKey.set(key(row.warehouseId, row.skuId), pending); this.liveTokens.set(token, pending);
    return token;
  }
  /** Call only after the original ledger INSERT acknowledged exactly one row.
   * On any failed/uncertain append the caller must abandon its transaction. */
  didAppendLive(token: PreparedLiveLedgerAppend): void {
    const pending = this.liveTokens.get(token);
    requireDomain(pending && pending.token === token && !pending.appended
      && this.liveByKey.get(key(pending.row.warehouseId, pending.row.skuId)) === pending,
    "TRANSACTION_SCOPE", "An unacknowledged token from this exact manager is required");
    pending.appended = true;
    if (!this.balances.has(key(pending.row.warehouseId, pending.row.skuId)))
      this.firstEffects.set(key(pending.row.warehouseId, pending.row.skuId), structuredClone(pending.row));
  }
  didAppend(row: PostingProof): void {
    requireDomain(!this.liveByKey.has(key(row.warehouseId, row.skuId)), "TRANSACTION_SCOPE", "Prepared live append requires its exact token acknowledgement");
    if (!this.balances.has(key(row.warehouseId, row.skuId))) this.firstEffects.set(key(row.warehouseId, row.skuId), structuredClone(row));
  }
  /** Success boundary only: close/rollback must remain unconditional and nonthrowing.
   * Neither a prepared-only nor an acknowledged-but-unpersisted effect may commit. */
  assertLiveComplete(): void {
    integrity(!this.liveWriteFailed && this.liveByKey.size === 0, "Unfinished or failed live inventory posting cannot commit");
  }
  async put(input: InventoryBalanceRow): Promise<void> {
    // Bind validation, SQL parameters and post-await cache to the same private
    // value snapshot. TypeScript readonly does not freeze caller-owned aliases.
    const row: InventoryBalanceRow = structuredClone(input);
    integrity(!this.liveWriteFailed, "A failed live write requires transaction abandonment");
    const identity = key(row.warehouseId, row.skuId); const previous = this.get(row.warehouseId, row.skuId);
    const live = this.liveByKey.get(identity);
    if (live) requireDomain(live.appended && row.quantity === live.expected.quantity
      && row.version === live.expected.version && row.lastOperationId === live.expected.lastOperationId
      && row.updatedAt === live.expected.updatedAt,
    "INVENTORY_INTEGRITY_FAILED", "Balance must persist this exact acknowledged live transition");
    let result: PgSalesResult;
    let attempted = false;
    try {
      if (previous === undefined) {
        const first = this.firstEffects.get(identity);
        requireDomain(this.provenZero.has(identity) && first && row.version === 1 && row.quantity === first.quantityDelta
          && row.lastOperationId === first.operationId && row.updatedAt === first.postedAt,
          "INVENTORY_NOT_READY", "First balance must be the exact appended runtime approval, never a zero placeholder");
        attempted = true;
        result = await this.query(`INSERT INTO naijue_erp.inventory_balance (warehouse_id, sku_id, quantity, version, last_operation_id, updated_at)
          VALUES ($1, $2, $3::bigint, $4, $5, $6::timestamptz) ON CONFLICT (warehouse_id, sku_id) DO NOTHING`,
        [row.warehouseId, row.skuId, row.quantity.toString(), versionToSql(row.version), row.lastOperationId, row.updatedAt]);
      } else {
        requireDomain(row.version === previous.version + 1, "VERSION_CONFLICT", "Balance must advance exactly once per effect");
        attempted = true;
        result = await this.query(`UPDATE naijue_erp.inventory_balance SET quantity = $3, version = $4, last_operation_id = $5, updated_at = $6
          WHERE warehouse_id = $1 AND sku_id = $2 AND version = $7`,
        [row.warehouseId, row.skuId, row.quantity.toString(), versionToSql(row.version), row.lastOperationId, row.updatedAt, versionToSql(previous.version)]);
      }
      requireDomain(result.rowCount === 1, "VERSION_CONFLICT", "Inventory first-insert or compare-and-swap failed");
    } catch (error) {
      // A caller catching a failed/uncertain live CAS may not retry and clear the
      // pending token. The original unit of work must roll this transaction back.
      if (live && attempted) this.liveWriteFailed = true;
      throw error;
    }
    this.balances.set(identity, structuredClone(row)); this.firstEffects.delete(identity);
    if (live) { this.liveByKey.delete(identity); this.liveTokens.delete(live.token); }
  }
}

/** Borrowed-client adapter. It cannot COMMIT/ROLLBACK, create a pool or replay
 * source history. D3 must persist its controlled revision/evidence and close
 * receipt/audit/projections in the original transaction. */
export function createPostgresHistoryRevisionPosting(runtime: InventoryAdmissionRuntime): HistoryRevisionPostingPort<Pick<PgSalesClient, "query">> {
  if (runtime?.profile !== "EXACT24" || typeof runtime.assertReady !== "function") throw new TypeError("Explicit verified exact24 history posting capability required");
  const assertReady = runtime.assertReady.bind(runtime);
  return Object.freeze<HistoryRevisionPostingPort<Pick<PgSalesClient, "query">>>({ async post(client, input, effectInput) {
    const context: HistoryRevisionPostingContext = structuredClone(input), effects: readonly HistoryRevisionPostingEffect[] = structuredClone(effectInput);
    requireDomain(typeof client?.query === "function" && effects.length <= 20_000, "HISTORY_REVISION_INVALID", "Bounded original-client history posting required");
    const operationId = entityId("operation", context.operationId); entityId("operation", context.revisionId); entityId("account", context.actorAccountId);
    entityId("sales", context.documentId);
    requireDomain((context.kind === "sales" || context.kind === "transfers") && Number.isInteger(context.toVersion) && context.toVersion > 1 && context.toVersion <= 2147483647
      && typeof context.postedAt === "string" && !Number.isNaN(Date.parse(context.postedAt)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(context.postedAt),
    "HISTORY_REVISION_INVALID", "Actual revision identities/version/time required");
    if (effects.length === 0) return Object.freeze({ ledgerEntryIds: Object.freeze([]) });
    requireDomain(context.businessDate !== null, "HISTORY_REVISION_DATE_UNAVAILABLE", "Stock correction requires the actual original business date");
    const date = businessDate(context.businessDate), ids = new Set<string>(), endpoints = new Set<string>();
    const pairs = new Map<string, { from?: typeof entries[number]; to?: typeof entries[number] }>();
    const entries = effects.map(effect => {
      const ledgerId = entityId("ledger", effect.ledgerEntryId), warehouseId = entityId("warehouse", effect.warehouseId), skuId = entityId("sku", effect.skuId), delta = quantity(effect.quantityDelta);
      entityId("salesLine", effect.lineId);
      const endpointKey = JSON.stringify([effect.lineId, effect.endpoint]);
      requireDomain(delta !== 0n && !ids.has(ledgerId) && !endpoints.has(endpointKey)
        && (context.kind === "sales" ? effect.endpoint === "SALES_WAREHOUSE" : effect.endpoint === "FROM" || effect.endpoint === "TO"),
      "HISTORY_REVISION_INVALID", "Unique nonzero historical line/endpoint effects required"); ids.add(ledgerId); endpoints.add(endpointKey);
      return { ...effect, ledgerId, warehouseId, skuId, delta };
    });
    if (context.kind === "transfers") {
      for (const entry of entries) {
        const pair = pairs.get(entry.lineId) ?? {}; if (entry.endpoint === "FROM") pair.from = entry; else pair.to = entry; pairs.set(entry.lineId, pair);
      }
      for (const pair of pairs.values()) requireDomain(pair.from && pair.to && pair.from.skuId === pair.to.skuId
        && pair.from.warehouseId !== pair.to.warehouseId && pair.from.delta + pair.to.delta === 0n,
      "HISTORY_REVISION_INVALID", "Each historical transfer line must conserve its two exact endpoint deltas");
    }
    await assertReady(client);
    const query: Query = (sql, values = []) => client.query(sql, values);
    const balances = new PostgresPostingBalances(query, Object.freeze({ profile: "EXACT24", assertReady }));
    await balances.lock(entries);
    await balances.assertHistoryZeros(entries.filter(entry=>!balances.get(entry.warehouseId,entry.skuId)));
    const grouped = new Map<string, { warehouseId: string; skuId: string; previous: InventoryBalanceRow | undefined; running: InventoryBalanceRow["quantity"]; count: number }>();
    for (const entry of entries) {
      balances.assertCanAppend({ warehouseId:entry.warehouseId,skuId:entry.skuId,quantityDelta:entry.delta,
        operationId,postedAt:context.postedAt,eventKind:"HISTORY_REVISION",reversesEntryId:null });
      const identity=key(entry.warehouseId,entry.skuId), group=grouped.get(identity);
      if(group){group.running=addQuantity(group.running,entry.delta);group.count++;}
      else {const previous=balances.get(entry.warehouseId,entry.skuId);grouped.set(identity,{warehouseId:entry.warehouseId,skuId:entry.skuId,previous,running:previous?addQuantity(previous.quantity,entry.delta):entry.delta,count:1});}
    }
    const ledger=await query(`/* history-posting:ledger */ INSERT INTO naijue_erp.inventory_ledger
      (id,operation_id,event_kind,warehouse_id,sku_id,quantity_delta,source_history_revision_id,
       source_history_sales_line_id,source_history_transfer_line_id,endpoint,source_document_version,reverses_entry_id,source_import_batch_id,business_date,posted_at)
      SELECT x.id,$2::uuid,'HISTORY_REVISION',x.warehouse_id,x.sku_id,x.delta,$6::uuid,
       CASE WHEN $10::text='sales' THEN x.line_id ELSE NULL END,CASE WHEN $10::text='transfers' THEN x.line_id ELSE NULL END,
       x.endpoint,$11::integer,NULL,NULL,$12::date,$13::timestamptz
      FROM unnest($1::uuid[],$3::uuid[],$4::uuid[],$5::bigint[],$7::uuid[],$8::text[]) AS x(id,warehouse_id,sku_id,delta,line_id,endpoint)
      WHERE $9::integer=cardinality($1::uuid[]) RETURNING id::text`,
    [entries.map(e=>e.ledgerId),operationId,entries.map(e=>e.warehouseId),entries.map(e=>e.skuId),entries.map(e=>e.delta.toString()),context.revisionId,
      entries.map(e=>e.lineId),entries.map(e=>e.endpoint),entries.length,context.kind,context.toVersion,date,context.postedAt]);
    const actualIds=new Set(ledger.rows.map(row=>stringValue(row.id)));
    integrity(ledger.rowCount===entries.length&&actualIds.size===entries.length&&entries.every(e=>actualIds.has(e.ledgerId)),"Exact historical correction ledger set was not appended");
    const rows=[...grouped.values()].map(g=>({...g,quantity:g.running.toString(),
      version:versionToSql(version((g.previous?.version??0)+g.count))}));
    for(const fresh of [false,true]){
      const selected=rows.filter(g=>(g.previous===undefined)===fresh);if(!selected.length)continue;
      const result=await query(fresh?`/* history-posting:balances-insert */ INSERT INTO naijue_erp.inventory_balance
        (warehouse_id,sku_id,quantity,version,last_operation_id,updated_at)
        SELECT x.warehouse_id,x.sku_id,x.quantity,x.version,$5::uuid,$6::timestamptz
        FROM unnest($1::uuid[],$2::uuid[],$3::bigint[],$4::integer[]) AS x(warehouse_id,sku_id,quantity,version)
        ON CONFLICT(warehouse_id,sku_id) DO NOTHING RETURNING warehouse_id::text,sku_id::text,quantity::text,version`
      :`/* history-posting:balances-update */ UPDATE naijue_erp.inventory_balance b
        SET quantity=x.quantity,version=x.version,last_operation_id=$5::uuid,updated_at=$6::timestamptz
        FROM unnest($1::uuid[],$2::uuid[],$3::bigint[],$4::integer[],$7::integer[]) AS x(warehouse_id,sku_id,quantity,version,old_version)
        WHERE b.warehouse_id=x.warehouse_id AND b.sku_id=x.sku_id AND b.version=x.old_version
        RETURNING b.warehouse_id::text,b.sku_id::text,b.quantity::text,b.version`,
      [selected.map(g=>g.warehouseId),selected.map(g=>g.skuId),selected.map(g=>g.quantity),selected.map(g=>g.version),operationId,context.postedAt,...(fresh?[]:[selected.map(g=>g.previous!.version)])]);
      const expected=new Map(selected.map(g=>[key(g.warehouseId,g.skuId),g]));
      requireDomain(result.rowCount===selected.length&&result.rows.length===selected.length,"VERSION_CONFLICT","Historical balance batch CAS incomplete");
      for(const row of result.rows){const identity=key(stringValue(row.warehouse_id),stringValue(row.sku_id)),g=expected.get(identity);
        integrity(g&&row.quantity===g.quantity&&row.version===g.version,"Exact historical balance batch RETURNING mismatch");expected.delete(identity);}
      integrity(expected.size===0,"Missing historical balance batch member");
    }
    return Object.freeze({ ledgerEntryIds: Object.freeze(entries.map(entry => entry.ledgerId)) });
  } });
}
