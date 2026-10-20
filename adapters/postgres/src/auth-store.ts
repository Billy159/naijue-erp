import type { Pool } from "pg";
import type { AuthenticationAccount, AuthenticationSession, AuthenticationStore, AuthenticationTransaction } from "../../../packages/authentication/src/ports.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { EntityId } from "../../../packages/domain/src/values.ts";
import { booleanValue, integerValue, nullableString, stringValue } from "./codec.ts";

export interface PgAuthenticationResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
export interface PgAuthenticationClient {
  query(text: string, values?: unknown[]): Promise<PgAuthenticationResult>;
  release(error?: Error | boolean): void;
}
export interface PgAuthenticationPool { connect(): Promise<PgAuthenticationClient> }
type PgPoolCompatibility = Pool extends PgAuthenticationPool ? true : never;
const pgPoolCompatibility: PgPoolCompatibility = true;
void pgPoolCompatibility;
const stamp = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const ACCOUNT = `SELECT a.id AS account_id, a.staff_id, a.login_name, a.password_hash, a.login_enabled, a.auth_version,
  s.role, s.employment_status, s.hall_id
  FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id = a.staff_id`;
function decodeAccount(row: Record<string, unknown>): AuthenticationAccount {
  return { accountId: entityId("account", stringValue(row.account_id)), staffId: entityId("staff", stringValue(row.staff_id)),
    loginName: stringValue(row.login_name), passwordHash: stringValue(row.password_hash), loginEnabled: booleanValue(row.login_enabled),
    authVersion: integerValue(row.auth_version), role: stringValue(row.role), employmentStatus: stringValue(row.employment_status),
    hallId: row.hall_id === null ? null : entityId("hall", stringValue(row.hall_id)), hallEnabled: row.hall_enabled === null ? null : booleanValue(row.hall_enabled) };
}
function decodeSession(row: Record<string, unknown>): AuthenticationSession {
  return { tokenHash: stringValue(row.token_hash), accountId: entityId("account", stringValue(row.account_id)), authVersion: integerValue(row.auth_version),
    createdAt: stringValue(row.created_at), expiresAt: stringValue(row.expires_at), revokedAt: nullableString(row.revoked_at) };
}
/** Parameterized pg adapter only. Does not create a Pool, connect on construction, migrate, seed or execute a server. */
export class PostgresAuthenticationStore implements AuthenticationStore {
  private readonly pool: PgAuthenticationPool;
  constructor(pool: PgAuthenticationPool) {
    if (typeof pool?.connect !== "function") throw new TypeError("Authentication requires an explicit trusted PostgreSQL pool");
    this.pool = pool;
  }
  async transaction<T>(work: (tx: AuthenticationTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const tx = new PostgresAuthenticationTransaction(client);
    let began = false; let commitAttempted = false; let discard: Error | undefined;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      const result = await work(tx);
      tx.close(); commitAttempted = true;
      await client.query("COMMIT");
      return result;
    } catch (error) {
      tx.close();
      if (!began || commitAttempted) discard = error instanceof Error ? error : new Error("Authentication transaction failed");
      if (began) try { await client.query("ROLLBACK"); }
      catch (rollbackError) {
        discard = rollbackError instanceof Error ? rollbackError : new Error("Authentication rollback failed");
        throw new AggregateError([error, rollbackError], "Authentication transaction and rollback failed; connection discarded");
      }
      throw error;
    } finally { client.release(discard); }
  }
}
class PostgresAuthenticationTransaction implements AuthenticationTransaction {
  private active = true;
  private readonly client: PgAuthenticationClient;
  private readonly loaded = new Map<string, AuthenticationAccount>();
  constructor(client: PgAuthenticationClient) { this.client = client; }
  close(): void { this.active = false; }
  private query(text: string, values: unknown[] = []): Promise<PgAuthenticationResult> {
    if (!this.active) throw new Error("Authentication transaction is closed");
    return this.client.query(text, values);
  }
  private async account(where: string, value: string): Promise<AuthenticationAccount | undefined> {
    const row = (await this.query(`${ACCOUNT} WHERE ${where} = $1 FOR UPDATE OF a, s`, [value])).rows[0];
    if (!row) return undefined;
    // A separate READ COMMITTED statement avoids a stale nullable-join hall snapshot after account/staff lock waits.
    const hall = row.hall_id === null ? undefined : (await this.query("SELECT enabled FROM naijue_erp.hall WHERE id = $1 FOR SHARE", [row.hall_id])).rows[0];
    const account = decodeAccount({ ...row, hall_enabled: row.hall_id === null ? null : hall?.enabled ?? false });
    this.loaded.set(account.accountId, account); return account;
  }
  findAccountByLogin(loginName: string): Promise<AuthenticationAccount | undefined> { return this.account("a.login_name", loginName); }
  getAccount(accountId: EntityId<"account">): Promise<AuthenticationAccount | undefined> { return this.account("a.id", accountId); }
  async getSession(tokenHash: string): Promise<AuthenticationSession | undefined> {
    const row = (await this.query(`SELECT token_hash, account_id, auth_version, ${stamp("created_at")} AS created_at,
      ${stamp("expires_at")} AS expires_at, ${stamp("revoked_at")} AS revoked_at FROM naijue_erp.auth_session WHERE token_hash = $1`, [tokenHash])).rows[0];
    return row ? decodeSession(row) : undefined;
  }
  async lockSession(tokenHash: string, accountId: EntityId<"account">): Promise<AuthenticationSession | undefined> {
    if (!this.loaded.has(accountId)) throw new Error("Lock the owning account before its session");
    const row = (await this.query(`SELECT token_hash, account_id, auth_version, ${stamp("created_at")} AS created_at,
      ${stamp("expires_at")} AS expires_at, ${stamp("revoked_at")} AS revoked_at FROM naijue_erp.auth_session
      WHERE token_hash = $1 AND account_id = $2 FOR UPDATE`, [tokenHash, accountId])).rows[0];
    return row ? decodeSession(row) : undefined;
  }
  async insertSession(session: AuthenticationSession): Promise<void> {
    const account = this.loaded.get(session.accountId);
    if (!account || account.authVersion !== session.authVersion) throw new Error("A session requires its locked current account");
    const written = await this.query(`INSERT INTO naijue_erp.auth_session (token_hash, account_id, auth_version, created_at, expires_at, revoked_at)
      VALUES ($1, $2, $3, $4, $5, $6)`, [session.tokenHash, session.accountId, session.authVersion, session.createdAt, session.expiresAt, session.revokedAt]);
    if (written.rowCount !== 1) throw new Error("Session was not persisted");
  }
  async revokeSession(tokenHash: string, revokedAt: string): Promise<void> {
    await this.query("UPDATE naijue_erp.auth_session SET revoked_at = COALESCE(revoked_at, $2) WHERE token_hash = $1", [tokenHash, revokedAt]);
  }
  async changePassword(accountId: EntityId<"account">, expectedAuthVersion: number, expectedPasswordHash: string, passwordHash: string, changedAt: string): Promise<boolean> {
    const account = this.loaded.get(accountId);
    if (!account || account.authVersion !== expectedAuthVersion || account.passwordHash !== expectedPasswordHash) throw new Error("Password change requires its locked current account");
    const result = await this.query(`UPDATE naijue_erp.user_account SET password_hash = $4, auth_version = auth_version + 1, version = version + 1, updated_at = $5
      WHERE id = $1 AND auth_version = $2 AND password_hash = $3`, [accountId, expectedAuthVersion, expectedPasswordHash, passwordHash, changedAt]);
    if (result.rowCount !== 1) return false;
    await this.query("UPDATE naijue_erp.auth_session SET revoked_at = COALESCE(revoked_at, $2) WHERE account_id = $1", [accountId, changedAt]);
    this.loaded.delete(accountId);
    return true;
  }
}
