import type { PartyPage, PartyRecord, PartyReadReader, PartyScopedRead } from "../../../packages/application/src/party-read-ports.ts";
import { activePartyRead, checkedPartyReadScope, checkedPartyReadRecord } from "../../../packages/application/src/party-read-service.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { PgSalesPool, PgSalesResult } from "./sales-unit-of-work.ts";
import { booleanValue, nullableString, stringValue, versionFromSql } from "./codec.ts";
type Query = (text: string, values?: unknown[]) => Promise<PgSalesResult>;
const stamp = (column: string) => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const columns = `id, code, name, enabled, version, ${stamp("created_at")} AS created_at, ${stamp("updated_at")} AS updated_at`;
/** Real read-only adapter. Abort checks are between bounded queries/acquisition; not in-flight PG cancellation. */
export class PostgresPartyReadReader implements PartyReadReader {
  private readonly pool: PgSalesPool;
  constructor(pool: PgSalesPool) { if (typeof pool?.connect !== "function") throw TypeError("Explicit party read pool required"); this.pool = pool; }
  private async snapshot<T>(signal: AbortSignal, work: (query: Query) => Promise<T>): Promise<T> {
    activePartyRead(signal); const client = await this.pool.connect(); let began = false, committing = false, discard: Error | undefined;
    const query: Query = (text, values = []) => { activePartyRead(signal); return client.query(text, values); };
    try {
      await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
      const result = await work(query); activePartyRead(signal); committing = true; await query("COMMIT"); activePartyRead(signal); return result;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : Error("Party read transaction failed");
      else try { await client.query("ROLLBACK"); } catch (rollbackError) {
        discard = rollbackError instanceof Error ? rollbackError : Error("Party read rollback failed");
        throw new AggregateError([error, rollbackError], "Party read/rollback failed; connection discarded");
      }
      throw error;
    } finally { client.release(discard); }
  }
  private record(row: Record<string, unknown>, read: PartyScopedRead): PartyRecord {
    const kind = read.intent.kind;
    const values = { code: stringValue(row.code), name: stringValue(row.name), enabled: booleanValue(row.enabled), version: versionFromSql(row.version),
      createdAt: nullableString(row.created_at), updatedAt: nullableString(row.updated_at) };
    return checkedPartyReadRecord(kind === "CUSTOMER" ? { id: entityId("customer", stringValue(row.id)), ...values } : { id: entityId("supplier", stringValue(row.id)), ...values }, kind);
  }
  async search(input: PartyScopedRead): Promise<PartyPage<PartyRecord>> {
    const read = checkedPartyReadScope(input), intent = read.intent;
    requireDomain(intent.operation !== "DETAIL", "FORBIDDEN", "Party list grant required");
    const table = intent.kind === "CUSTOMER" ? "customer" : "supplier", p = intent.query;
    const predicate = "($1::text = '' OR strpos(code, $1) > 0 OR strpos(name, $1) > 0) AND ($2::boolean IS NULL OR enabled = $2)";
    return this.snapshot(read.signal, async query => {
      const parameters = [p.search, p.enabled === "ALL" ? null : p.enabled === "ENABLED"];
      const counts = (await query(`SELECT count(*)::text AS total FROM naijue_erp.${table} WHERE ${predicate}`, parameters)).rows;
      const text = counts.length === 1 ? counts[0]!.total : undefined;
      requireDomain(typeof text === "string" && /^(0|[1-9]\d*)$/.test(text) && Number.isSafeInteger(Number(text)), "PARTY_READ_TOO_LARGE", "Invalid party count");
      const rows = (await query(`SELECT ${columns} FROM naijue_erp.${table} WHERE ${predicate} ORDER BY name COLLATE "C", id LIMIT $3 OFFSET $4`,
        [...parameters, p.pageSize, (p.page - 1) * p.pageSize])).rows;
      requireDomain(rows.length <= p.pageSize, "INVALID_DATABASE_VALUE", "Party page exceeded bound");
      return { total: Number(text), items: rows.map(row => this.record(row, read)), page: p.page, pageSize: p.pageSize };
    });
  }
  async detail(input: PartyScopedRead): Promise<PartyRecord | undefined> {
    const read = checkedPartyReadScope(input), intent = read.intent;
    requireDomain(intent.operation === "DETAIL", "FORBIDDEN", "Exact party detail grant required");
    if (intent.operation !== "DETAIL") throw Error("Invalid trusted party detail intent");
    const table = intent.kind === "CUSTOMER" ? "customer" : "supplier";
    return this.snapshot(read.signal, async query => {
      const rows = (await query(`SELECT ${columns} FROM naijue_erp.${table} WHERE id=$1`, [intent.id])).rows;
      requireDomain(rows.length <= 1, "INVALID_DATABASE_VALUE", "Repeated party identity"); return rows[0] ? this.record(rows[0], read) : undefined;
    });
  }
}
