import { historicalCustomerExclusionEnabled, EXACT_HISTORICAL_CUSTOMER_EXCLUSION, type HistoricalCustomerExclusionCapability } from "./party-read-reader.ts";
import type { Pool } from "pg";
import type { CustomerRecord, PartyAudit, PartyKind, PartyPage, PartyReceipt, PartyRecord, PartyResult, PartySearch, PartyTransaction, PartyUnitOfWork, SupplierRecord } from "../../../packages/application/src/party-maintenance-ports.ts";
import { assertAllocatedPartyCode, partyKind, partyName, partyRequestKey } from "../../../packages/application/src/party-maintenance-validation.ts";
import { nextApprovedPartyNumber, formatApprovedPartyCode } from "../../../packages/application/src/party-numbering.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { EntityId, Version } from "../../../packages/domain/src/values.ts";
import type { PgSalesClient, PgSalesPool, PgSalesResult } from "./sales-unit-of-work.ts";
import { auditJson, booleanValue, jsonObject, nullableString, stringValue, versionFromSql, versionToSql } from "./codec.ts";

type PgPoolCompatibility = Pool extends PgSalesPool ? true : never;
const compatible: PgPoolCompatibility = true; void compatible;
const stamp = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const columns = `id, code, name, enabled, version, ${stamp("created_at")} AS created_at, ${stamp("updated_at")} AS updated_at`;
const table = (kind: PartyKind): "customer" | "supplier" => kind === "CUSTOMER" ? "customer" : "supplier";
function record(kind: PartyKind, row: Record<string, unknown>): PartyRecord {
  const values = { code: stringValue(row.code), name: stringValue(row.name),
    enabled: booleanValue(row.enabled), version: versionFromSql(row.version), createdAt: nullableString(row.created_at), updatedAt: nullableString(row.updated_at) };
  return kind === "CUSTOMER" ? { id: entityId("customer", stringValue(row.id)), ...values } : { id: entityId("supplier", stringValue(row.id)), ...values };
}
function result(input: unknown, kind: PartyKind, targetId: string, operationId: string): PartyResult {
  const row = jsonObject(input); assertAllocatedPartyCode(row.code);
  requireDomain(row.kind === kind && row.partyId === targetId && row.operationId === operationId && Object.keys(row).sort().join(",") === "code,enabled,kind,operationId,partyId,version", "INVALID_DATABASE_VALUE", "Persisted party result does not match receipt identity");
  return { operationId: entityId("operation", operationId), kind, partyId: entityId(kind === "CUSTOMER" ? "customer" : "supplier", targetId),
    version: versionFromSql(row.version), code: row.code, enabled: booleanValue(row.enabled) };
}
/** Inject an existing pg pool only. No connection, migration, seed or listener at construction.
 * Protocol tests do not establish PostgreSQL-engine locking/trigger behavior. */
export class PostgresPartyUnitOfWork implements PartyUnitOfWork {
  private readonly pool: PgSalesPool; private readonly excludeHistorical: boolean;
  constructor(pool: PgSalesPool, capability: HistoricalCustomerExclusionCapability | null = null) { if (typeof pool?.connect !== "function") throw new TypeError("Party storage requires an explicit PostgreSQL pool"); this.pool = pool; this.excludeHistorical = historicalCustomerExclusionEnabled(pool, capability); }
  async transaction<T>(work: (tx: PartyTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect(); const tx = new PostgresPartyTransaction(client, this.excludeHistorical);
    let began = false; let committing = false; let discard: Error | undefined;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      const value = await work(tx); tx.close(); committing = true; await client.query("COMMIT"); return value;
    } catch (error) {
      tx.close(); if (!began || committing) discard = error instanceof Error ? error : new Error("Party transaction failed");
      // An attempted COMMIT can already have committed. Discard; recover using the original request key.
      if (began && !committing) try { await client.query("ROLLBACK"); }
      catch (rollbackError) { discard = rollbackError instanceof Error ? rollbackError : new Error("Party rollback failed"); throw new AggregateError([error, rollbackError], "Party transaction and rollback failed; connection discarded"); }
      throw error;
    } finally { client.release(discard); }
  }
}
class PostgresPartyTransaction implements PartyTransaction {
  private active = true;
  private loaded: { kind: PartyKind; id: string; previous: PartyRecord | undefined } | undefined;
  private receiptIdentity: string | undefined;
  private written = false;
  private codeReserved = false;
  private readonly client: PgSalesClient; private readonly excludeHistorical: boolean;
  constructor(client: PgSalesClient, excludeHistorical: boolean) { this.client = client; this.excludeHistorical = excludeHistorical; }
  close(): void { this.active = false; }
  private query(sql: string, values: unknown[] = []): Promise<PgSalesResult> {
    requireDomain(this.active, "TRANSACTION_CLOSED", "Party transaction handle cannot escape callback"); return this.client.query(sql, values);
  }
  async getReceipt(actor: EntityId<"account">, requestKey: string, kind: PartyKind): Promise<PartyReceipt | undefined> {
    partyKind(kind); partyRequestKey(requestKey); entityId("account", actor);
    const identity = JSON.stringify([actor, requestKey]);
    requireDomain(this.receiptIdentity === undefined || this.receiptIdentity === identity, "TRANSACTION_SCOPE", "One actor/request key per transaction"); this.receiptIdentity = identity;
    // EXACT shared namespace from existing sales + transfer adapters, never kind-scoped.
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:receipt:${identity}`]);
    const row = (await this.query(`SELECT id, actor_account_id, request_key, request_hash, action, target_type, target_id, status, result_data,
      ${stamp("completed_at")} AS completed_at FROM naijue_erp.operation_receipt WHERE actor_account_id = $1 AND request_key = $2`, [actor, requestKey])).rows[0];
    if (!row) return undefined;
    requireDomain(row.target_type === kind, "IDEMPOTENCY_CONFLICT", "Original actor/key belongs to another operation kind");
    requireDomain(["CREATE", "EDIT", "DISABLE", "RESTORE"].includes(stringValue(row.action)) && row.status === "COMMITTED", "INVALID_DATABASE_VALUE", "Invalid persisted party action or status");
    const targetId = stringValue(row.target_id); const operationId = stringValue(row.id);
    return { id: entityId("operation", operationId), actorAccountId: entityId("account", stringValue(row.actor_account_id)), requestKey: stringValue(row.request_key), requestHash: stringValue(row.request_hash),
      kind, action: row.action as PartyReceipt["action"], targetId, result: result(row.result_data, kind, targetId, operationId), completedAt: stringValue(row.completed_at) };
  }
  private async get(kind: PartyKind, id: string): Promise<PartyRecord | undefined> {
    requireDomain(this.loaded === undefined, "TRANSACTION_SCOPE", "Load one customer OR one supplier per command transaction");
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:${table(kind)}:${id}`]);
    const row = (await this.query(`SELECT ${columns} FROM naijue_erp.${table(kind)} WHERE id = $1${this.excludeHistorical && kind === "CUSTOMER" ? ` AND ${EXACT_HISTORICAL_CUSTOMER_EXCLUSION}` : ""} FOR UPDATE`, [id])).rows[0];
    const previous = row ? record(kind, row) : undefined; this.loaded = { kind, id, previous: structuredClone(previous) }; return previous;
  }
  getCustomer(id: EntityId<"customer">): Promise<CustomerRecord | undefined> { entityId("customer", id); return this.get("CUSTOMER", id) as Promise<CustomerRecord | undefined>; }
  getSupplier(id: EntityId<"supplier">): Promise<SupplierRecord | undefined> { entityId("supplier", id); return this.get("SUPPLIER", id) as Promise<SupplierRecord | undefined>; }
  private async reserveCode(kind: PartyKind): Promise<string> {
    requireDomain(this.loaded?.kind === kind && this.loaded.previous === undefined && this.receiptIdentity !== undefined
      && !this.written && !this.codeReserved, "TRANSACTION_SCOPE", "Reserve one code for the locked new customer or supplier only");
    // Different party kinds have independent counters. Same-kind creators serialize until
    // native row + receipt commit/rollback. Sequence reservations themselves do not roll back.
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:party-code:${kind}`]);
    const sequence = kind === "CUSTOMER" ? "customer_code_sequence" : "supplier_code_sequence";
    const prefix = kind === "CUSTOMER" ? "KH" : "GYS";
    const start = kind === "CUSTOMER" ? 3 : 4;
    const state = (await this.query(`SELECT last_value::text AS last_value, is_called FROM naijue_erp.${sequence}`)).rows[0];
    requireDomain(state, "INVALID_DATABASE_VALUE", "Missing native party sequence state");
    // Rank decimal strings by significant digit length then lexically, never numeric-cast
    // imported codes or load the whole master table. Arbitrarily padded zeros stay intact.
    const highest = (await this.query(`SELECT code FROM naijue_erp.${table(kind)} WHERE code ~ '^${prefix}[0-9]+$'
      ORDER BY length(ltrim(substring(code FROM ${start}), '0')) DESC,
      ltrim(substring(code FROM ${start}), '0') COLLATE "C" DESC, code COLLATE "C" DESC LIMIT 1`)).rows[0];
    const next = nextApprovedPartyNumber(kind, stringValue(state.last_value), booleanValue(state.is_called), highest ? stringValue(highest.code) : null);
    const reserved = (await this.query(`SELECT setval('naijue_erp.${sequence}'::regclass, $1::bigint, true)::text AS allocated`, [next.toString()])).rows[0];
    requireDomain(reserved?.allocated === next.toString(), "INVALID_DATABASE_VALUE", "Native sequence reservation differs from intended value");
    this.codeReserved = true; return formatApprovedPartyCode(kind, next);
  }
  reserveCustomerCode(): Promise<string> { return this.reserveCode("CUSTOMER"); }
  reserveSupplierCode(): Promise<string> { return this.reserveCode("SUPPLIER"); }
  private async put(kind: PartyKind, row: PartyRecord): Promise<void> {
    const loaded = this.loaded;
    requireDomain(loaded?.kind === kind && loaded.id === row.id && !this.written, "TRANSACTION_SCOPE", "Read and write exactly one native party version");
    const previous = loaded.previous; assertAllocatedPartyCode(row.code); partyName(row.name);
    requireDomain(row.version === (previous ? previous.version + 1 : 1), "VERSION_CONFLICT", "Party version must advance once");
    requireDomain(!previous || row.code === previous.code && row.createdAt === previous.createdAt, "IMMUTABLE_PARTY_CODE", "Existing code and creation time are immutable");
    if (this.excludeHistorical && kind === "CUSTOMER") {
      const proof = (await this.query("SELECT naijue_erp.is_exact_historical_customer_only($1::uuid) AS historical_only", [row.id])).rows;
      requireDomain(proof.length === 1 && typeof proof[0]!.historical_only === "boolean", "INVALID_DATABASE_VALUE", "Invalid historical customer source proof result");
      requireDomain(proof[0]!.historical_only === false, "PARTY_NOT_FOUND", "Customer is unavailable for current maintenance");
    }
    const parameters: unknown[] = [row.id, row.code, row.name, row.enabled, versionToSql(row.version), row.createdAt, row.updatedAt];
    let written: PgSalesResult;
    try {
      written = previous ? await this.query(`UPDATE naijue_erp.${table(kind)} SET name = $3, enabled = $4, version = $5, updated_at = $7
        WHERE id = $1 AND version = $8 AND code = $2 AND created_at IS NOT DISTINCT FROM $6::timestamptz`, [...parameters, versionToSql(previous.version)])
        : await this.query(`INSERT INTO naijue_erp.${table(kind)} (id, code, name, enabled, version, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, parameters);
    } catch (error) {
      const pg = error as { code?: string; constraint?: string };
      if (pg.code === "23505" && pg.constraint === `${table(kind)}_code_key`) requireDomain(false, "PARTY_CODE_CONFLICT", "Allocated code already exists in this table");
      throw error;
    }
    requireDomain(written.rowCount === 1, "VERSION_CONFLICT", "Party compare-and-swap failed"); this.written = true;
  }
  putCustomer(row: CustomerRecord): Promise<void> { return this.put("CUSTOMER", row); }
  putSupplier(row: SupplierRecord): Promise<void> { return this.put("SUPPLIER", row); }
  async customerIsEnabledHallDefault(id: EntityId<"customer">): Promise<boolean> {
    requireDomain(this.loaded?.kind === "CUSTOMER" && this.loaded.id === id, "TRANSACTION_SCOPE", "Lock customer before its hall dependency check");
    // Native hall trigger takes a SHARE lock on the customer for assignment/enable,
    // closing the concurrent check-then-disable race. Disabled halls do not block.
    const row = (await this.query("SELECT EXISTS (SELECT 1 FROM naijue_erp.hall WHERE enabled AND default_customer_id = $1) AS used", [id])).rows[0];
    requireDomain(row, "INVALID_DATABASE_VALUE", "Missing trusted default-customer dependency result"); return booleanValue(row.used);
  }
  private async search(kind: PartyKind, query: PartySearch): Promise<PartyPage<PartyRecord>> {
    const filter = "($1::text = '' OR strpos(code, $1) > 0 OR strpos(name, $1) > 0) AND ($2::boolean IS NULL OR enabled = $2)" + (this.excludeHistorical && kind === "CUSTOMER" ? ` AND ${EXACT_HISTORICAL_CUSTOMER_EXCLUSION}` : "");
    const rows = (await this.query(`SELECT page.*, totals.total::text FROM (SELECT COUNT(*) AS total FROM naijue_erp.${table(kind)} WHERE ${filter}) totals
      LEFT JOIN LATERAL (SELECT ${columns} FROM naijue_erp.${table(kind)} WHERE ${filter} ORDER BY name COLLATE "C", id LIMIT $3 OFFSET $4) page ON true`,
      [query.search, query.enabled === "ALL" ? null : query.enabled === "ENABLED", query.pageSize, (query.page - 1) * query.pageSize])).rows;
    const totalText = rows[0]?.total;
    requireDomain(typeof totalText === "string" && /^(0|[1-9]\d*)$/.test(totalText) && Number.isSafeInteger(Number(totalText)), "PARTY_READ_TOO_LARGE", "Invalid or excessive count");
    const items = rows.filter(row => row.id !== null).map(row => record(kind, row));
    requireDomain(items.length <= query.pageSize, "INVALID_DATABASE_VALUE", "Party reader exceeded page bound");
    return { items, total: Number(totalText), page: query.page, pageSize: query.pageSize };
  }
  searchCustomers(query: PartySearch): Promise<PartyPage<CustomerRecord>> { return this.search("CUSTOMER", query) as Promise<PartyPage<CustomerRecord>>; }
  searchSuppliers(query: PartySearch): Promise<PartyPage<SupplierRecord>> { return this.search("SUPPLIER", query) as Promise<PartyPage<SupplierRecord>>; }
  async appendAudit(row: PartyAudit): Promise<void> {
    requireDomain(this.written && this.loaded?.kind === row.kind && this.loaded.id === row.targetId, "TRANSACTION_SCOPE", "Audit must match newly written native party");
    await this.query(`INSERT INTO naijue_erp.audit_change (id, operation_id, actor_account_id, object_type, object_id, action, old_version, new_version, before_values, after_values, occurred_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)`, [row.id, row.operationId, row.actorAccountId, row.kind, row.targetId, row.action,
      row.before?.version ?? null, versionToSql(row.after.version), row.before === null ? null : auditJson(row.before), auditJson(row.after), row.occurredAt]);
  }
  async insertReceipt(row: PartyReceipt): Promise<void> {
    requireDomain(this.written && this.loaded?.kind === row.kind && this.loaded.id === row.targetId
      && this.receiptIdentity === JSON.stringify([row.actorAccountId, row.requestKey]), "TRANSACTION_SCOPE", "Receipt must match locked global key and written native party");
    await this.query(`INSERT INTO naijue_erp.operation_receipt (id, actor_account_id, request_key, request_hash, action, target_type, target_id, status, result_data, completed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'COMMITTED',$8::jsonb,$9)`, [row.id, row.actorAccountId, row.requestKey, row.requestHash, row.action, row.kind, row.targetId, auditJson(row.result), row.completedAt]);
  }
}
