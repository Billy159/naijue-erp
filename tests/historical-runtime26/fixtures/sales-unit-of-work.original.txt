import { historicalCustomerExclusionEnabled } from "./party-read-reader.ts";
import type { HistoricalCustomerExclusionCapability } from "./party-read-reader.ts";
import { NATIVE_TRANSFER_SNAPSHOT_LIMIT, loadNativeTransferSnapshots } from "./native-transfer-snapshots.ts";
import { reserveRuntimeDocumentNumber, assertRuntimeDocumentNumber } from "./runtime-document-number.ts";
import type { RuntimeDocumentNumberInput } from "../../../packages/application/src/runtime-document-number.ts";
import { checkedNativeSalesFactInput, PostgresNativeSalesFacts } from "./sales-native-facts.ts";
import type { NativeCatalogueCompletenessVerifier, NativeSalesHistoricalCustomers } from "./sales-native-facts.ts";
import type { NativeSalesReferenceFacts } from "../../../packages/application/src/sales-native-facts.ts";
import { PostgresPostingBalances } from "./inventory-posting-balances.ts";
import type { Pool } from "pg";
import type { OperationReceiptRow, SalesAuditRow, SalesCurrentIdentity, SalesResult, SalesTransaction, SalesUnitOfWork, StoredSales } from "../../../packages/application/src/ports.ts";
import { sameSalesLine, sameSalesSettlement } from "../../../packages/application/src/sales-change-evidence.ts";
import type { SalesDocument, SalesDraft, SalesHeaderRow, SalesLineRow, SalesSettlementRow } from "../../../packages/domain/src/documents.ts";
import type { InventoryBalanceRow, InventoryLedgerRow } from "../../../packages/domain/src/inventory.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { businessDate, entityId } from "../../../packages/domain/src/values.ts";
import type { EntityId, EntityKind, Version } from "../../../packages/domain/src/values.ts";
import { auditJson, booleanValue, integerValue, jsonObject, moneyFromSql, moneyToSql, nullableString, quantityFromSql, stringValue, versionFromSql, versionToSql } from "./codec.ts";
import { checkedNativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import { createMaintainedCatalogue26TransactionProof } from "./catalogue-completeness.ts";
import type { MaintainedCatalogue26TransactionProof } from './catalogue-completeness.ts';
import { resolveNativeDocumentSpecifications } from './native-document-specification.ts';
import type { DocumentSpecificationResolution } from '../../../packages/application/src/document-specification.ts';

export interface PgSalesResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
/** Structural subset of the actual pg PoolClient protocol, also usable by explicitly labelled protocol fakes. */
export interface PgSalesClient {
  query(text: string, values?: unknown[]): Promise<PgSalesResult>;
  release(error?: Error | boolean): void;
}
export interface PgSalesPool { connect(): Promise<PgSalesClient> }
// Compile-time compatibility with the pinned real driver, without constructing a Pool or making a connection.
type PgPoolCompatibility = Pool extends PgSalesPool ? true : never;
const pgPoolCompatibility: PgPoolCompatibility = true;
void pgPoolCompatibility;

const id = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> => entityId(kind, stringValue(value));
const nullableId = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> | null => value === null ? null : id(kind, value);
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  requireDomain(typeof value === "string" && choices.includes(value as T), "INVALID_DATABASE_VALUE", "Unexpected persisted enum value");
  return value as T;
}
const stamp = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const HEADER_SELECT = `SELECT id, number, business_type, to_char(business_date, 'YYYY-MM-DD') AS business_date, hall_id, customer_id, salesperson_id, warehouse_id,
  responsible_staff_id, status, version, gross_amount::text, order_discount::text, net_due::text, note, created_by_account_id, created_hall_id,
  ${stamp("created_at")} AS created_at, ${stamp("updated_at")} AS updated_at,
  approved_by_account_id, ${stamp("approved_at")} AS approved_at, stock_basis
  FROM naijue_erp.sales_header WHERE id = $1 FOR UPDATE`;
const LINE_SELECT = `SELECT id, sales_id, line_no, sku_id, quantity::text, reference_price::text, deal_price::text,
  line_amount::text, allocated_discount::text, is_gift, pricing_rule, discount_tenths, zero_confirmed, product_code_snapshot, product_name_snapshot,
  color_name_snapshot, fit_name_snapshot, size_name_snapshot, barcode_snapshot, is_current
  FROM naijue_erp.sales_line WHERE sales_id = $1 ORDER BY line_no, id`;
const SETTLEMENT_SELECT = `SELECT id, sales_id, line_no, payment_account_id, payment_method_id_snapshot, direction, amount::text
  FROM naijue_erp.sales_settlement WHERE sales_id = $1 ORDER BY line_no, id`;


function decodeHeader(row: Record<string, unknown>): SalesHeaderRow {
  return { id: id("sales", row.id), number: stringValue(row.number), businessType: choice(row.business_type, ["SALE", "RETURN", "EXCHANGE"]),
    businessDate: businessDate(stringValue(row.business_date)), hallId: id("hall", row.hall_id), customerId: id("customer", row.customer_id),
    salespersonId: nullableId("staff", row.salesperson_id), warehouseId: id("warehouse", row.warehouse_id), status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]),
    version: versionFromSql(row.version), grossAmount: moneyFromSql(row.gross_amount), orderDiscount: moneyFromSql(row.order_discount), netDue: moneyFromSql(row.net_due),
    note: nullableString(row.note), responsibleStaffId: nullableId("staff", row.responsible_staff_id), createdByAccountId: id("account", row.created_by_account_id), createdHallId: nullableId("hall", row.created_hall_id),
    createdAt: stringValue(row.created_at), updatedAt: stringValue(row.updated_at), approvedByAccountId: nullableId("account", row.approved_by_account_id), approvedAt: nullableString(row.approved_at) };
}
function decodeLine(row: Record<string, unknown>): SalesLineRow {
  return { id: id("salesLine", row.id), salesId: id("sales", row.sales_id), lineNo: integerValue(row.line_no), skuId: id("sku", row.sku_id),
    quantity: quantityFromSql(row.quantity), referencePrice: row.reference_price === null ? null : moneyFromSql(row.reference_price), dealPrice: moneyFromSql(row.deal_price),
    pricingRule: row.pricing_rule === null ? null : choice(row.pricing_rule, ["UNIT_PRICE", "DISCOUNT"] as const),
    discountTenths: row.discount_tenths === null ? null : integerValue(row.discount_tenths),
    zeroConfirmed: row.zero_confirmed === null ? null : booleanValue(row.zero_confirmed),
    lineAmount: moneyFromSql(row.line_amount), allocatedDiscount: moneyFromSql(row.allocated_discount), isGift: booleanValue(row.is_gift), isCurrent: booleanValue(row.is_current),
    snapshot: { productCode: stringValue(row.product_code_snapshot), productName: stringValue(row.product_name_snapshot), colorName: stringValue(row.color_name_snapshot),
      fitName: stringValue(row.fit_name_snapshot), sizeName: stringValue(row.size_name_snapshot), barcode: nullableString(row.barcode_snapshot) } };
}
function decodeSettlement(row: Record<string, unknown>): SalesSettlementRow {
  return { id: id("settlement", row.id), salesId: id("sales", row.sales_id), lineNo: integerValue(row.line_no), paymentAccountId: id("paymentAccount", row.payment_account_id), paymentMethodId: nullableId("paymentMethod", row.payment_method_id_snapshot),
    direction: choice(row.direction, ["RECEIVE", "REFUND"]), amount: moneyFromSql(row.amount) };
}

function decodeResult(value: unknown): SalesResult {
  const row = jsonObject(value);
  requireDomain(Array.isArray(row.ledgerEntryIds), "INVALID_DATABASE_VALUE", "Receipt ledger identities must be an array");
  return { operationId: id("operation", row.operationId), salesId: id("sales", row.salesId), version: versionFromSql(row.version),
    status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]), ledgerEntryIds: row.ledgerEntryIds.map(value => id("ledger", value)) };
}

/** Real pg transaction adapter. No connection, migration, seed, retry, authorization default or server is created here. */
export class PostgresSalesUnitOfWork implements SalesUnitOfWork {
  private readonly pool: PgSalesPool;
  private readonly catalogueCompleteness: NativeCatalogueCompletenessVerifier | undefined;
  private readonly historicalCustomers: NativeSalesHistoricalCustomers | undefined;
  private readonly runtime26: NativeRuntime26Capability | undefined;
  private readonly maintainedCatalogue: boolean;
  constructor(pool: PgSalesPool, options?: { readonly catalogueCompleteness: NativeCatalogueCompletenessVerifier; readonly historicalCustomerExclusion?: HistoricalCustomerExclusionCapability; readonly runtime26?: NativeRuntime26Capability; readonly catalogueReadProof?: { readonly profile: "MAINTAINED_CATALOGUE26_V1" } }) {
    this.pool = pool;
    if (options !== undefined && typeof options.catalogueCompleteness?.assertComplete !== "function")
      throw new TypeError("Native catalogue facts require an explicit real completeness verifier");
    const capability = options?.historicalCustomerExclusion;
    this.historicalCustomers = historicalCustomerExclusionEnabled(pool, capability ?? null) && capability !== undefined
      ? Object.freeze({ target: pool, capability: Object.freeze({ profile: capability.profile, assertVerified: capability.assertVerified.bind(capability) }) }) : undefined;
    const verifier = options?.catalogueCompleteness;
    this.catalogueCompleteness = verifier === undefined ? undefined : Object.freeze({ assertComplete: verifier.assertComplete.bind(verifier) });
    if (options !== undefined && "runtime26" in options) {
      const descriptor = Object.getOwnPropertyDescriptor(options, "runtime26");
      if (!descriptor?.enumerable || !("value" in descriptor) || descriptor.value === undefined)
        throw new TypeError("Explicit own-data exact26 runtime capability required");
      this.runtime26 = checkedNativeRuntime26Capability(descriptor.value);
    }
    this.maintainedCatalogue = false;
    if (options !== undefined && "catalogueReadProof" in options) {
      const descriptor = Object.getOwnPropertyDescriptor(options, "catalogueReadProof"), selector: unknown = descriptor && "value" in descriptor ? descriptor.value : undefined;
      if (!descriptor?.enumerable || !selector || typeof selector !== "object" || Object.getPrototypeOf(selector) !== Object.prototype || Reflect.ownKeys(selector).length !== 1
        || !Object.getOwnPropertyDescriptor(selector, "profile")?.enumerable || !("value" in Object.getOwnPropertyDescriptor(selector, "profile")!)
        || (selector as { profile?: unknown }).profile !== "MAINTAINED_CATALOGUE26_V1" || !this.runtime26)
        throw new TypeError("Explicit closed maintained catalogue selector and original exact26 runtime required");
      this.maintainedCatalogue = true;
    }
  }
  async transaction<T>(work: (tx: SalesTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let tx: PostgresSalesTransaction | undefined;
    let began = false; let commitAttempted = false; let discard: Error | undefined;
    try {
      tx = new PostgresSalesTransaction(client, this.catalogueCompleteness, this.historicalCustomers, this.runtime26, this.maintainedCatalogue, this.pool);
      // The first explicit runtime check is on this same client inside BEGIN,
      // before schema/current-actor/business work; the pre-COMMIT check remains.
      // Explicit READ COMMITTED: a receipt waiter must see the previous holder's committed receipt after its advisory lock.
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      if (this.runtime26) await this.runtime26.assertReady(client, "INVENTORY_ADMISSION");
      const schema = await client.query(`/* sales:current-schema */ SELECT EXISTS (
        SELECT 1 FROM naijue_erp.schema_migration WHERE version = 10) AS current_sales_schema_ready`);
      requireDomain(schema.rows.length === 1 && schema.rows[0]!.current_sales_schema_ready === true,
        "SALES_SCHEMA_NOT_READY", "The current sales writer requires reviewed schema version 10");
      const result = await work(tx);
      tx.assertPostingComplete();
      tx.close();
      if (this.runtime26) await this.runtime26.assertReady(client, "INVENTORY_ADMISSION");
      commitAttempted = true; await client.query("COMMIT");
      return result;
    } catch (error) {
      tx?.close();
      if (!began || commitAttempted) discard = error instanceof Error ? error : new Error("PostgreSQL transaction failed");
      // A failed COMMIT may already have committed. Preserve the original key
      // and discard the client; ROLLBACK cannot prove that outcome was undone.
      if (began && !commitAttempted) {
        try { await client.query("ROLLBACK"); }
        catch (rollbackError) {
          discard = rollbackError instanceof Error ? rollbackError : new Error("PostgreSQL rollback failed");
          throw new AggregateError([error, rollbackError], "PostgreSQL transaction and rollback failed; connection discarded");
        }
      }
      throw error;
    } finally { client.release(discard); }
  }
}

class PostgresSalesTransaction implements SalesTransaction {
  private active = true;
  private sales: { readonly id: EntityId<"sales">; readonly version: Version | null; readonly stockBasis: StoredSales["stockBasis"];
    readonly creation?: Pick<SalesHeaderRow, "createdByAccountId" | "createdHallId" | "createdAt"> } | undefined;
  private receiptActor: EntityId<"account"> | undefined;
  private identityLoaded = false;
  private identity: SalesCurrentIdentity | undefined;
  private readonly balances: PostgresPostingBalances;
  private readonly previousLines = new Map<string, SalesLineRow>();
  private readonly previousSettlements = new Map<EntityId<"settlement">, SalesSettlementRow>();
  private receiptKey: string | undefined;
  // One entry per kind, private to this original client/receipt/target lifetime.
  private referenceGeneration = 0;
  private factsCache: { readonly key: string; readonly value: NativeSalesReferenceFacts } | undefined;
  private snapshotsCache: { readonly key: string; readonly value: ReadonlyMap<EntityId<"sku">, SalesLineRow["snapshot"]> } | undefined;
  private invalidateReferenceReads(): void {
    this.referenceGeneration++; this.factsCache = undefined; this.snapshotsCache = undefined;
  }
  private referenceScopeKey(): string {
    return JSON.stringify([this.receiptActor, this.receiptKey, this.sales?.id, this.sales?.version, this.sales?.stockBasis,
      this.specificationResolved, this.referenceGeneration, [...this.previousLines.values()].filter(line => line.isCurrent)
        .map(line => [line.id, line.skuId, line.snapshot]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
  }
  assertPostingComplete(): void {
    requireDomain(this.active, "TRANSACTION_CLOSED", "Posting completion requires its active original transaction");
    this.balances.assertLiveComplete();
  }
  close(): void { this.active = false; this.invalidateReferenceReads(); }
  private readonly client: PgSalesClient;
  private readonly nativeFacts: PostgresNativeSalesFacts;
  private readonly specificationCatalogue: MaintainedCatalogue26TransactionProof | undefined;
  private readonly specificationRuntime: NativeRuntime26Capability | undefined;
  private readonly specificationPool: PgSalesPool | undefined;
  private readonly specificationNativeFacts: PostgresNativeSalesFacts | undefined;
  private specificationResolved = false;
  private specificationResolving = false;
  constructor(client: PgSalesClient, verifier?: NativeCatalogueCompletenessVerifier, historicalCustomers?: NativeSalesHistoricalCustomers, runtime26?: NativeRuntime26Capability, maintainedCatalogue = false, pool?: PgSalesPool) {
    this.client = client; this.balances = runtime26 === undefined ? new PostgresPostingBalances((sql, values) => this.query(sql, values))
      : PostgresPostingBalances.forRuntime26(client, runtime26, () => requireDomain(this.active, "TRANSACTION_CLOSED", "Transaction handle cannot be used after its callback completes"));
    const pair = maintainedCatalogue && runtime26 ? createMaintainedCatalogue26TransactionProof(client, runtime26,
      () => requireDomain(this.active, "TRANSACTION_CLOSED", "Catalogue proof cannot outlive its original sales callback")) : undefined;
    this.specificationCatalogue = pair ?? (runtime26 ? createMaintainedCatalogue26TransactionProof(client,runtime26,
      ()=>requireDomain(this.active,'TRANSACTION_CLOSED','Document specification proof cannot escape its original SAVE')) : undefined);
    this.specificationRuntime = runtime26; this.specificationPool = pool;
    this.nativeFacts = new PostgresNativeSalesFacts(pair?.query ?? ((sql, values) => this.query(sql, values)), salesId => {
      requireDomain(this.active && this.receiptActor !== undefined && this.sales?.id === salesId,
        "TRANSACTION_SCOPE", "Native facts require the original bound sales actor and target in an active transaction");
    }, () => [...this.previousLines.values()].filter(line => line.isCurrent).map(line => ({ id: line.id, skuId: line.skuId, snapshot: line.snapshot })), pair?.verifier ?? verifier, historicalCustomers);
    const specificationPair=this.specificationCatalogue;
    this.specificationNativeFacts=specificationPair?new PostgresNativeSalesFacts(specificationPair.query,salesId=>{
      requireDomain(this.active && this.specificationResolved && this.receiptActor!==undefined && this.sales?.id===salesId,
        'TRANSACTION_SCOPE','Native proposal facts require the original resolved SAVE target');
    },()=>[...this.previousLines.values()].filter(l=>l.isCurrent).map(l=>({id:l.id,skuId:l.skuId,snapshot:l.snapshot})),specificationPair.verifier,historicalCustomers):undefined;
  }
  async resolveDocumentSkus(input: DocumentSpecificationResolution): Promise<readonly EntityId<'sku'>[]> {
    const bound = () => requireDomain(this.active && input.scope.kind === 'SALES' && input.scope.actor.accountId === this.receiptActor
      && input.scope.documentId === this.sales?.id && (this.sales.version === null || this.sales.stockBasis === 'RUNTIME_LEDGER'),
      'TRANSACTION_SCOPE','Specification append requires the original bound sales SAVE');
    bound(); await this.getCurrentSalesIdentity(input.scope.actor.accountId);
    requireDomain(this.specificationRuntime && this.specificationPool && this.specificationCatalogue,
      'NATIVE_CATALOGUE_FACTS_UNAVAILABLE','Reviewed exact26 maintained catalogue authority required');
    requireDomain(!this.specificationResolving, "TRANSACTION_SCOPE", "One original specification resolution at a time");
    // The resolver is the only sales path that can append product/SKU/barcode
    // facts using the raw original client. Invalidate on both sides, even failure.
    this.invalidateReferenceReads(); this.specificationResolving = true;
    try {
      const ids = await resolveNativeDocumentSpecifications({pool:this.specificationPool,client:this.client,runtime:this.specificationRuntime,
        catalogue:this.specificationCatalogue,assertBound:bound},input);
      bound(); this.specificationResolved = true; return ids;
    } finally { this.specificationResolving = false; this.invalidateReferenceReads(); }
  }
  private assertNumberScope(input: RuntimeDocumentNumberInput): void {
    requireDomain(this.active && input.kind === "SALES" && input.actorAccountId === this.receiptActor
      && this.sales?.id === input.documentId && this.sales.version === null,
    "TRANSACTION_SCOPE", "Number allocation requires the original actor and new sales target");
  }
  async reserveRuntimeDocumentNumber(input: RuntimeDocumentNumberInput): Promise<string> {
    this.assertNumberScope(input);
    const number = await reserveRuntimeDocumentNumber((sql, values) => this.query(sql, values), input);
    this.assertNumberScope(input); return number;
  }
  async assertRuntimeDocumentNumber(input: RuntimeDocumentNumberInput & { readonly number: string }): Promise<void> {
    this.assertNumberScope(input);
    await assertRuntimeDocumentNumber((sql, values) => this.query(sql, values), input);
    this.assertNumberScope(input);
  }
  async getCurrentSalesReferenceFacts(input: SalesDraft | SalesDocument): Promise<NativeSalesReferenceFacts> {
    const check = (salesId: EntityId<"sales">): void => requireDomain(this.active && !this.specificationResolving && this.receiptActor !== undefined && this.sales?.id === salesId,
      "TRANSACTION_SCOPE", "Native facts require the original receipt actor and loaded sales target");
    check(input.header.id);
    const { document, referenceKey } = checkedNativeSalesFactInput(input);
    await this.getCurrentSalesIdentity(this.receiptActor!); check(document.header.id);
    const scope = this.referenceScopeKey(), key = JSON.stringify([scope, referenceKey]);
    if (this.factsCache?.key === key) return this.factsCache.value;
    const value = await (this.specificationResolved ? this.specificationNativeFacts! : this.nativeFacts).load(document);
    check(document.header.id);
    requireDomain(this.referenceScopeKey() === scope, "TRANSACTION_SCOPE", "Native facts changed during their original read");
    this.factsCache = { key, value }; return value;
  }
  async getCurrentSalesSnapshots(skuIds: readonly EntityId<"sku">[]): Promise<ReadonlyMap<EntityId<"sku">, SalesLineRow["snapshot"]>> {
    const check = (): void => requireDomain(this.active && !this.specificationResolving && this.receiptActor !== undefined && this.sales !== undefined,
      "TRANSACTION_SCOPE", "Native snapshots require the original bound sales actor and target");
    check();
    const ids = [...new Set(skuIds.map(value => entityId("sku", value)))].sort();
    requireDomain(ids.length > 0 && ids.length <= NATIVE_TRANSFER_SNAPSHOT_LIMIT, "INVALID_LINES", "Bounded SKU selection required");
    await this.getCurrentSalesIdentity(this.receiptActor!); check();
    const scope = this.referenceScopeKey(), key = JSON.stringify([scope, ids]);
    if (this.snapshotsCache?.key === key) return new Map(this.snapshotsCache.value);
    const value = await loadNativeTransferSnapshots((sql, values) => this.query(sql, values), ids);
    check();
    requireDomain(this.referenceScopeKey() === scope, "TRANSACTION_SCOPE", "Native snapshots changed during their original read");
    this.snapshotsCache = { key, value: new Map(value) }; return new Map(value);
  }
  private query(text: string, values: unknown[] = []): Promise<PgSalesResult> {
    requireDomain(this.active, "TRANSACTION_CLOSED", "Transaction handle cannot be used after its callback completes");
    return this.client.query(text, values);
  }
  async getCurrentSalesIdentity(accountId: EntityId<"account">): Promise<SalesCurrentIdentity | undefined> {
    // Check before the cache too: a closed or differently-bound handle must never
    // return an earlier grant. Cache lifetime is this command transaction only.
    const check = (): void => {
      requireDomain(this.active, "TRANSACTION_CLOSED", "Transaction handle cannot be used after its callback completes");
      requireDomain(this.receiptActor === accountId && this.sales !== undefined, "TRANSACTION_SCOPE", "Bind the receipt actor and sales target before identity lookup");
    };
    check();
    if (this.identityLoaded) return this.identity;
    const rows = (await this.query(`/* sales-authorization:identity */ SELECT a.id AS account_id, a.staff_id, a.login_enabled,
      s.role, s.employment_status, s.hall_id
      FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id = a.staff_id
      WHERE a.id = $1::uuid FOR SHARE OF a, s`, [accountId])).rows;
    check();
    requireDomain(rows.length <= 1, "FORBIDDEN", "Current sales identity is ambiguous");
    const row = rows[0];
    if (!row) { this.identityLoaded = true; return undefined; }
    const nativeAccountId = id("account", row.account_id);
    requireDomain(nativeAccountId === accountId, "FORBIDDEN", "Current identity must match the receipt account");
    const hallId = nullableId("hall", row.hall_id);
    // Separate READ COMMITTED statement observes hall changes after account/staff
    // lock waits; never lock the nullable side of an outer join.
    const halls = hallId === null ? [] : (await this.query(`/* sales-authorization:hall */ SELECT id, enabled
      FROM naijue_erp.hall WHERE id = $1::uuid FOR SHARE`, [hallId])).rows;
    check();
    requireDomain(halls.length <= 1, "FORBIDDEN", "Current sales hall is ambiguous");
    const hall = halls[0];
    const hallEnabled = hallId === null ? null : !!hall && id("hall", hall.id) === hallId && booleanValue(hall.enabled);
    this.identity = Object.freeze({ accountId: nativeAccountId, staffId: id("staff", row.staff_id), loginEnabled: booleanValue(row.login_enabled),
      role: stringValue(row.role), employmentStatus: stringValue(row.employment_status), hallId, hallEnabled });
    this.identityLoaded = true;
    return this.identity;
  }
  async getReceipt(actorId: EntityId<"account">, requestKey: string): Promise<OperationReceiptRow | undefined> {
    const identity = JSON.stringify([actorId, requestKey]);
    requireDomain(this.receiptKey === undefined || this.receiptKey === identity, "TRANSACTION_SCOPE", "One command receipt key is supported per transaction");
    this.receiptKey = identity;
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:receipt:${identity}`]);
    const row = (await this.query(`SELECT id, actor_account_id, request_key, request_hash, action, target_type, target_id AS target_sales_id, status, result_data AS result,
      ${stamp("completed_at")} AS completed_at FROM naijue_erp.operation_receipt WHERE actor_account_id = $1 AND request_key = $2`, [actorId, requestKey])).rows[0];
    requireDomain(this.active, "TRANSACTION_CLOSED", "Transaction handle cannot be used after its callback completes");
    this.receiptActor = actorId;
    if (!row) return undefined;
    requireDomain(row.target_type === "SALES", "IDEMPOTENCY_CONFLICT", "The original actor/key belongs to another document kind");
    return { id: id("operation", row.id), actorAccountId: id("account", row.actor_account_id), requestKey: stringValue(row.request_key), requestHash: stringValue(row.request_hash),
      action: choice(row.action, ["SAVE", "APPROVE", "UNAPPROVE", "VOID"]), targetSalesId: id("sales", row.target_sales_id), status: choice(row.status, ["COMMITTED"]), result: decodeResult(row.result), completedAt: stringValue(row.completed_at) };
  }
  async getSales(salesId: EntityId<"sales">): Promise<StoredSales | undefined> {
    requireDomain(this.sales === undefined, "TRANSACTION_SCOPE", "Load a single sales target once per command transaction");
    // Covers the absent-row insert race, which SELECT FOR UPDATE alone cannot lock.
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:sales:${salesId}`]);
    const row = (await this.query(HEADER_SELECT, [salesId])).rows[0];
    if (!row) { this.sales = { id: salesId, version: null, stockBasis: "RUNTIME_LEDGER" }; return undefined; }
    const header = decodeHeader(row);
    const stockBasis = choice(row.stock_basis, ["RUNTIME_LEDGER", "CUTOFF_HISTORY"]);
    this.sales = { id: salesId, version: header.version, stockBasis,
      creation: { createdByAccountId: header.createdByAccountId, createdHallId: header.createdHallId, createdAt: header.createdAt } };
    const lines = (await this.query(LINE_SELECT, [salesId])).rows.map(decodeLine);
    const settlements = (await this.query(SETTLEMENT_SELECT, [salesId])).rows.map(decodeSettlement);
    for (const line of lines) this.previousLines.set(line.id, structuredClone(line));
    for (const row of settlements) this.previousSettlements.set(row.id, structuredClone(row));
    // Existing AND absent keys share the importer's canonical advisory-lock order before row locks.
    // Loading a document never materializes a sparse zero balance.
    if (stockBasis === "RUNTIME_LEDGER") await this.balances.lock(lines.filter(line => line.isCurrent)
      .map(line => ({ warehouseId: header.warehouseId, skuId: line.skuId })));
    return { document: { header, lines, settlements }, stockBasis };
  }
  async putRuntimeSales(document: SalesDocument): Promise<void> {
    requireDomain(this.active, "TRANSACTION_CLOSED", "Transaction handle cannot be used after its callback completes");
    const h = document.header; const loaded = this.sales;
    requireDomain(loaded?.id === h.id, "TRANSACTION_SCOPE", "Document must be read before it is written");
    requireDomain(loaded.stockBasis === "RUNTIME_LEDGER", "HISTORICAL_POSTING_NOT_IMPLEMENTED", "Cutoff history is not a runtime posting");
    requireDomain(h.version === (loaded.version === null ? 1 : loaded.version + 1), "VERSION_CONFLICT", "Document write must advance the loaded version exactly once");
    requireDomain(loaded.creation ? h.createdByAccountId === loaded.creation.createdByAccountId
      && h.createdHallId === loaded.creation.createdHallId && h.createdAt === loaded.creation.createdAt
      : this.receiptActor !== undefined && h.createdByAccountId === this.receiptActor,
    "IMMUTABLE_CREATION_FACTS", "Sales creation facts must preserve the loaded header, and new creators must match the receipt actor");
    if (h.responsibleStaffId !== null) {
      const responsible = await this.query("/* document:responsible-staff */ SELECT id FROM naijue_erp.staff WHERE id=$1::uuid FOR SHARE", [h.responsibleStaffId]);
      requireDomain(responsible.rows.length === 1, "RESPONSIBLE_STAFF_UNAVAILABLE", "Responsible employee does not exist");
    }
    const values: unknown[] = [h.id, h.number, h.businessType, h.businessDate, h.hallId, h.customerId, h.salespersonId, h.warehouseId, h.status,
      versionToSql(h.version), moneyToSql(h.grossAmount), moneyToSql(h.orderDiscount), moneyToSql(h.netDue), h.note, h.createdByAccountId, h.createdHallId,
      h.createdAt, h.updatedAt, h.approvedByAccountId, h.approvedAt, h.responsibleStaffId];
    const columns = "id, number, business_type, business_date, hall_id, customer_id, salesperson_id, warehouse_id, status, version, gross_amount, order_discount, net_due, note, created_by_account_id, created_hall_id, created_at, updated_at, approved_by_account_id, approved_at, responsible_staff_id";
    let result: PgSalesResult;
    if (loaded.version === null) {
      result = await this.query(`INSERT INTO naijue_erp.sales_header (${columns}, stock_basis) VALUES (${values.map((_value, index) => `$${index + 1}`).join(", ")}, 'RUNTIME_LEDGER') ON CONFLICT (id) DO NOTHING`, values);
    } else {
      const fields = columns.split(", ");
      result = await this.query(`UPDATE naijue_erp.sales_header SET ${fields.slice(1).map((field, index) => `${field} = $${index + 2}`).join(", ")} WHERE id = $1 AND version = $22 AND stock_basis = 'RUNTIME_LEDGER'`, [...values, versionToSql(loaded.version)]);
    }
    requireDomain(result.rowCount === 1, "VERSION_CONFLICT", "Document compare-and-swap failed");
    const changedLines = document.lines.filter(line => {
      requireDomain(line.salesId === h.id, "FOREIGN_LINE_ID", "Line must belong to this sales document");
      const previous = this.previousLines.get(line.id);
      return previous === undefined || !sameSalesLine(previous, line);
    });
    // Only changed current rows need their positions freed. The existing immediate
    // partial unique index still permits swaps/replacements, without touching every
    // unchanged row on a memo edit or posting-only action.
    const freedIds = changedLines.filter(line => this.previousLines.get(line.id)?.isCurrent).map(line => line.id);
    if (freedIds.length > 0) await this.query("UPDATE naijue_erp.sales_line SET is_current = false WHERE sales_id = $1 AND id = ANY($2::uuid[]) AND is_current", [h.id, freedIds]);
    for (const line of changedLines) {
      requireDomain(line.salesId === h.id, "FOREIGN_LINE_ID", "Line must belong to this sales document");
      const s = line.snapshot;
      const lineValues = [line.id, line.salesId, line.lineNo, line.skuId, line.quantity.toString(), line.referencePrice === null ? null : moneyToSql(line.referencePrice), moneyToSql(line.dealPrice),
        moneyToSql(line.lineAmount), moneyToSql(line.allocatedDiscount), line.isGift, s.productCode, s.productName, s.colorName, s.fitName, s.sizeName, s.barcode, line.isCurrent, line.pricingRule, line.discountTenths, line.zeroConfirmed];
      const lineColumns = ["id", "sales_id", "line_no", "sku_id", "quantity", "reference_price", "deal_price", "line_amount", "allocated_discount", "is_gift", "product_code_snapshot", "product_name_snapshot", "color_name_snapshot", "fit_name_snapshot", "size_name_snapshot", "barcode_snapshot", "is_current", "pricing_rule", "discount_tenths", "zero_confirmed"];
      const written = await this.query(`INSERT INTO naijue_erp.sales_line (${lineColumns.join(", ")}) VALUES (${lineValues.map((_value, index) => `$${index + 1}`).join(", ")})
        ON CONFLICT (id) DO UPDATE SET ${lineColumns.slice(2).map(column => `${column} = EXCLUDED.${column}`).join(", ")} WHERE sales_line.sales_id = EXCLUDED.sales_id`, lineValues);
      requireDomain(written.rowCount === 1, "FOREIGN_LINE_ID", "A retained line identity cannot move between documents");
    }
    const nextSettlementIds = new Set(document.settlements.map(row => row.id));
    const removedSettlementIds = [...this.previousSettlements.keys()].filter(id => !nextSettlementIds.has(id));
    if (removedSettlementIds.length > 0) await this.query("DELETE FROM naijue_erp.sales_settlement WHERE sales_id = $1 AND id = ANY($2::uuid[])", [h.id, removedSettlementIds]);
    for (const row of document.settlements) {
      requireDomain(row.salesId === h.id, "FOREIGN_SETTLEMENT_ID", "Settlement must belong to this sales document");
      const previous = this.previousSettlements.get(row.id);
      // Status-only reversal/void never rewrites an unchanged stored unknown.
      // Runtime SAVE/APPROVE enforce explicit intent before reaching this adapter.
      if (previous !== undefined && sameSalesSettlement(previous, row)) continue;
      requireDomain(typeof row.paymentMethodId === "string", "INVALID_SETTLEMENT_REFERENCE", "Runtime settlement requires its explicit selected payment-method identity");
      if (previous?.paymentAccountId === row.paymentAccountId) requireDomain(previous.paymentMethodId === row.paymentMethodId,
        "IMMUTABLE_SETTLEMENT_METHOD", "The original method of a retained same-account settlement cannot be replaced or inferred");
      const written = await this.query(`INSERT INTO naijue_erp.sales_settlement (id, sales_id, line_no, payment_account_id, direction, amount, account_name_snapshot, method_name_snapshot, payment_method_id_snapshot)
        SELECT $1, $2, $3, pa.id, $5, $6, pa.name, pm.name, pm.id FROM naijue_erp.payment_account pa
        JOIN naijue_erp.payment_method pm ON pm.id = pa.payment_method_id WHERE pa.id = $4 AND pm.id = $7::uuid
        ON CONFLICT (id) DO UPDATE SET line_no = EXCLUDED.line_no, payment_account_id = EXCLUDED.payment_account_id,
        direction = EXCLUDED.direction, amount = EXCLUDED.amount,
        account_name_snapshot = CASE WHEN sales_settlement.payment_account_id = EXCLUDED.payment_account_id THEN sales_settlement.account_name_snapshot ELSE EXCLUDED.account_name_snapshot END,
        method_name_snapshot = CASE WHEN sales_settlement.payment_account_id = EXCLUDED.payment_account_id THEN sales_settlement.method_name_snapshot ELSE EXCLUDED.method_name_snapshot END,
        payment_method_id_snapshot = CASE WHEN sales_settlement.payment_account_id = EXCLUDED.payment_account_id THEN sales_settlement.payment_method_id_snapshot ELSE EXCLUDED.payment_method_id_snapshot END
        WHERE sales_settlement.sales_id = EXCLUDED.sales_id`, [row.id, row.salesId, row.lineNo, row.paymentAccountId, row.direction, moneyToSql(row.amount), row.paymentMethodId]);
      requireDomain(written.rowCount === 1, "INVALID_SETTLEMENT_REFERENCE", "Settlement identity or payment account reference is invalid");
    }
  }
  async getBalance(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">): Promise<InventoryBalanceRow | undefined> {
    requireDomain(this.active && this.sales, "TRANSACTION_SCOPE", "Read the sales target before posting");
    return this.balances.get(warehouseId, skuId);
  }
  async assertAbsentBalanceIsPublishedZero(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">): Promise<void> {
    requireDomain(this.active && this.sales?.stockBasis === "RUNTIME_LEDGER", "TRANSACTION_SCOPE", "Only the loaded runtime sales document may prove first use");
    await this.balances.assertZero(warehouseId, skuId);
  }
  async putBalance(row: InventoryBalanceRow): Promise<void> { await this.balances.put(row); }
  async listSalesLedger(salesId: EntityId<"sales">): Promise<readonly InventoryLedgerRow[]> {
    requireDomain(this.sales?.id === salesId, "TRANSACTION_SCOPE", "Ledger must belong to the loaded document");
    return (await this.query(`SELECT l.id, l.operation_id, l.event_kind, l.warehouse_id, l.sku_id, l.quantity_delta::text, sl.sales_id, l.source_sales_line_id AS sales_line_id,
      l.source_document_version, l.reverses_entry_id, to_char(l.business_date, 'YYYY-MM-DD') AS business_date, ${stamp("l.posted_at")} AS posted_at
      FROM naijue_erp.inventory_ledger l JOIN naijue_erp.sales_line sl ON sl.id = l.source_sales_line_id
      WHERE sl.sales_id = $1 ORDER BY l.source_document_version, l.id`, [salesId])).rows.map(row => ({
        id: id("ledger", row.id), operationId: id("operation", row.operation_id), eventKind: choice(row.event_kind, ["APPROVE", "UNAPPROVE"]), warehouseId: id("warehouse", row.warehouse_id),
        skuId: id("sku", row.sku_id), quantityDelta: quantityFromSql(row.quantity_delta), source: { kind: "SALES", salesId: id("sales", row.sales_id), salesLineId: id("salesLine", row.sales_line_id), endpoint: "SALES_WAREHOUSE" },
        sourceDocumentVersion: versionFromSql(row.source_document_version), reversesEntryId: nullableId("ledger", row.reverses_entry_id), businessDate: businessDate(stringValue(row.business_date)), postedAt: stringValue(row.posted_at) }));
  }
  async appendLedger(input: InventoryLedgerRow): Promise<void> {
    const row: InventoryLedgerRow = structuredClone(input);
    requireDomain(row.source.kind === "SALES" && row.source.salesId === this.sales?.id && this.sales?.stockBasis === "RUNTIME_LEDGER", "TRANSACTION_SCOPE", "This adapter persists only runtime sales effects, not transfer commands");
    const transition = this.balances.prepareLiveAppend(row);
    const written = await this.query(`INSERT INTO naijue_erp.inventory_ledger (id, operation_id, event_kind, warehouse_id, sku_id, quantity_delta,
      source_sales_line_id, endpoint, source_document_version, reverses_entry_id, business_date, posted_at, quantity_before, quantity_after)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'SALES_WAREHOUSE', $8, $9, $10, $11, $12::bigint, $13::bigint)`,
      [row.id, row.operationId, row.eventKind, row.warehouseId, row.skuId, row.quantityDelta.toString(), row.source.salesLineId, versionToSql(row.sourceDocumentVersion), row.reversesEntryId, row.businessDate, row.postedAt,
        transition.quantityBefore.toString(), transition.quantityAfter.toString()]);
    requireDomain(written.rowCount === 1, "INVENTORY_INTEGRITY_FAILED", "Exact native inventory effect was not appended");
    this.balances.didAppendLive(transition);
  }
  async appendAudit(row: SalesAuditRow): Promise<void> {
    requireDomain(row.salesId === this.sales?.id, "TRANSACTION_SCOPE", "Audit must belong to the command target");
    await this.query(`INSERT INTO naijue_erp.audit_change (id, operation_id, actor_account_id, object_type, object_id, action, occurred_at, old_version, new_version, before_values, after_values)
      VALUES ($1, $2, $3, 'SALES', $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)`, [row.id, row.operationId, row.actorAccountId, row.salesId, row.action, row.occurredAt, row.before?.header.version ?? null, versionToSql(row.after.header.version), row.before === null ? null : auditJson(row.before), auditJson(row.after)]);
  }
  async insertReceipt(row: OperationReceiptRow): Promise<void> {
    requireDomain(this.receiptKey === JSON.stringify([row.actorAccountId, row.requestKey]) && row.targetSalesId === this.sales?.id, "TRANSACTION_SCOPE", "Receipt must match the locked original actor/key and document");
    await this.query(`INSERT INTO naijue_erp.operation_receipt (id, actor_account_id, request_key, request_hash, action, target_type, target_id, status, result_data, completed_at)
      VALUES ($1, $2, $3, $4, $5, 'SALES', $6, $7, $8::jsonb, $9)`, [row.id, row.actorAccountId, row.requestKey, row.requestHash, row.action, row.targetSalesId, row.status, JSON.stringify(row.result), row.completedAt]);
  }
}
