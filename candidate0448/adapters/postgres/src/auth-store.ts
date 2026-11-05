import type { Pool } from "pg";
import type { AuthenticationAccount, AuthenticationSessionSnapshot, AuthenticationSession, AuthenticationLoginSnapshot, AuthenticationPasswordChangeSnapshot, AuthenticationStore, AuthenticationTransaction, BorrowedAuthenticationLoginStore, AuthenticationLoginTransaction, BorrowedAuthenticationLoginOperations } from "../../../packages/authentication/src/ports.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { EntityId } from "../../../packages/domain/src/values.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
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
  s.role, s.employment_status, s.hall_id, s.name AS staff_name
  FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id = a.staff_id`;
const LOGIN_SNAPSHOT = `/* auth:login-snapshot */ SELECT id AS account_id,login_name,password_hash,auth_version
      FROM naijue_erp.user_account WHERE login_name=$1`;
const decodeLoginSnapshot = (row: Record<string, unknown>): AuthenticationLoginSnapshot => ({accountId: entityId('account', stringValue(row.account_id)),
  loginName: stringValue(row.login_name), passwordHash: stringValue(row.password_hash), authVersion: integerValue(row.auth_version)});
function decodeIdentity(row: Record<string, unknown>): Omit<AuthenticationAccount, 'passwordHash'> {
  const staffName = Object.hasOwn(row, "staff_name") ? stringValue(row.staff_name) : undefined;
  requireDomain(staffName === undefined || staffName.trim().length > 0 && !staffName.includes("\0"), "INVALID_DATABASE_VALUE", "Trusted employee display name must be nonblank text");
  return { accountId: entityId("account", stringValue(row.account_id)), staffId: entityId("staff", stringValue(row.staff_id)),
    loginName: stringValue(row.login_name), loginEnabled: booleanValue(row.login_enabled),
    authVersion: integerValue(row.auth_version), role: stringValue(row.role), employmentStatus: stringValue(row.employment_status),
    hallId: row.hall_id === null ? null : entityId("hall", stringValue(row.hall_id)), hallEnabled: row.hall_enabled === null ? null : booleanValue(row.hall_enabled),
    ...(staffName === undefined ? {} : { staffName }) };
}
function decodeAccount(row: Record<string, unknown>): AuthenticationAccount {
  return {...decodeIdentity(row),passwordHash:stringValue(row.password_hash)};
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
  private async snapshot<T>(sql: string, values: unknown[], decode: (row: Record<string, unknown>) => T): Promise<T | undefined> {
    const client = await this.pool.connect(); let discard: Error | undefined;
    try {
      const result = await client.query(sql, values);
      requireDomain(result.rows.length <= 1, 'INVALID_DATABASE_VALUE', 'One exact authentication snapshot required');
      return result.rows[0] === undefined ? undefined : decode(result.rows[0]);
    } catch (error) { discard = error instanceof Error ? error : Error('Authentication snapshot failed'); throw error; }
    finally { client.release(discard); }
  }
  readLoginSnapshot(loginName: string): Promise<AuthenticationLoginSnapshot | undefined> {
    return this.snapshot(LOGIN_SNAPSHOT, [loginName], decodeLoginSnapshot);
  }
  readPasswordChangeSnapshot(tokenHash: string): Promise<AuthenticationPasswordChangeSnapshot | undefined> {
    return this.snapshot(`/* auth:password-snapshot */ SELECT a.id AS account_id,a.staff_id,a.login_name,a.password_hash,a.login_enabled,a.auth_version,
      s.role,s.employment_status,s.hall_id,s.name AS staff_name,h.enabled AS hall_enabled,
      se.token_hash,se.account_id AS session_account_id,se.auth_version AS session_auth_version,
      ${stamp('se.created_at')} AS created_at,${stamp('se.expires_at')} AS expires_at,${stamp('se.revoked_at')} AS revoked_at
      FROM naijue_erp.auth_session se JOIN naijue_erp.user_account a ON a.id=se.account_id
      JOIN naijue_erp.staff s ON s.id=a.staff_id LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE se.token_hash=$1`, [tokenHash], row => ({
      account: decodeAccount({...row, hall_enabled: row.hall_id === null ? null : row.hall_enabled ?? false}),
      session: decodeSession({...row, account_id: row.session_account_id, auth_version: row.session_auth_version})
    }));
  }
  readSessionSnapshot(tokenHash: string): Promise<AuthenticationSessionSnapshot | undefined> {
    return this.snapshot(`/* auth:query-session-snapshot */ SELECT a.id AS account_id,a.staff_id,a.login_name,a.login_enabled,a.auth_version,
      s.role,s.employment_status,s.hall_id,s.name AS staff_name,h.enabled AS hall_enabled,
      se.token_hash,se.account_id AS session_account_id,se.auth_version AS session_auth_version,
      ${stamp('se.created_at')} AS created_at,${stamp('se.expires_at')} AS expires_at,${stamp('se.revoked_at')} AS revoked_at
      FROM naijue_erp.auth_session se JOIN naijue_erp.user_account a ON a.id=se.account_id
      JOIN naijue_erp.staff s ON s.id=a.staff_id LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE se.token_hash=$1`, [tokenHash], row => ({
      account:decodeIdentity({...row,hall_enabled:row.hall_id===null?null:row.hall_enabled??false}),
      session:decodeSession({...row,account_id:row.session_account_id,auth_version:row.session_auth_version})
    }));
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
      if (began && !commitAttempted) try { await client.query("ROLLBACK"); }
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
  private readonly client: Pick<PgAuthenticationClient, 'query'>;
  private readonly loaded = new Map<string, AuthenticationAccount>();
  constructor(client: Pick<PgAuthenticationClient, 'query'>) { this.client = client; }
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

export interface PgBorrowedAuthenticationClient extends Pick<PgAuthenticationClient, 'query'> {
  /** Actual native ReadyForQuery state, not the driver's queue-ready boolean. */
  getTransactionStatus(): string | null;
}
export interface PgBorrowedAuthenticationContext {
  readonly client: PgBorrowedAuthenticationClient;
  /** Original backend/top xid after real INIT. Full decimal xid, never Number. */
  readonly backendPid: number;
  readonly transactionId: string;
  readonly controller: string;
  readonly runtimeRole: string;
}
const BORROWED_CONTEXT = [
  '/* auth:borrowed-context */ SELECT pg_backend_pid() AS backend_pid,',
  'pg_current_xact_id_if_assigned()::text AS transaction_id,session_user::text AS controller,',
  "current_user::text AS current_user,current_setting('role') AS selected_role,",
  "current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only,",
  "current_setting('row_security') AS row_security,current_setting('session_replication_role') AS replication_role,",
  '(NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole',
  'AND NOT r.rolreplication AND NOT r.rolbypassrls',
  'AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)',
  "AND r.oid<>(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp')",
  'AND r.oid<>(SELECT datdba FROM pg_database WHERE datname=current_database())',
  "AND pg_has_role(session_user,r.oid,'SET')) AS safe_runtime_role",
  'FROM pg_roles r WHERE r.rolname=current_user'
].join('\n');

/** Explicit borrowed leaf, never a Pool or ordinary AuthenticationStore.
 * Parent supplies its exclusive private native client, original INIT identity and
 * target admission; this is not a database/source profile admission factory.
 * No connect/release/transaction-control SQL or rollback/retry is performed.
 * Callback may switch to importer after authentication; it must leave the same
 * transaction active. Any failure poisons the scope and requires parent rollback
 * or quarantine. Pending work settles before this function returns or throws. */
export async function withPostgresAuthenticationInCurrentTransaction(context: PgBorrowedAuthenticationContext,
  work: (store: BorrowedAuthenticationLoginStore) => Promise<void>): Promise<void> {
  if (typeof context?.client?.query!=='function' || typeof context.client.getTransactionStatus!=='function' || typeof work!=='function'
    || !Number.isSafeInteger(context.backendPid) || context.backendPid<=0
    || typeof context.transactionId!=='string' || !/^[1-9][0-9]{0,19}$/.test(context.transactionId)
    || BigInt(context.transactionId)>18446744073709551615n
    || [context.controller,context.runtimeRole].some(name=>typeof name!=='string'||!name||name.includes('\0')||Buffer.byteLength(name)>63)) {
    throw new TypeError('Original private authentication transaction context required');
  }
  const binding=Object.freeze({backendPid:context.backendPid,transactionId:context.transactionId,controller:context.controller,runtimeRole:context.runtimeRole});
  const query=context.client.query.bind(context.client),status=context.client.getTransactionStatus.bind(context.client);
  let active=true,consumed=false,driverBusy=false;let failure:unknown;let operation:Promise<void>|undefined;
  const error=()=>new Error('Borrowed authentication transaction is closed, failed or changed');
  const record=(cause:unknown)=>{failure??=cause??error();return failure;};
  const valid=()=>{if(!active||failure!==undefined||status()!=='T')throw error();};
  async function assertContext(runtime:boolean,ownsDriver=false):Promise<void> {
    valid();if(driverBusy&&!ownsDriver)throw error();
    if(!ownsDriver)driverBusy=true;
    try {
      const result=await query(BORROWED_CONTEXT);valid();
      const row=result.rows[0];
      if(result.rows.length!==1 || !row || row.backend_pid!==binding.backendPid || row.transaction_id!==binding.transactionId
        || row.controller!==binding.controller || row.isolation!=='read committed' || row.read_only!=='off'
        || row.row_security!=='on' || row.replication_role!=='origin'
        || runtime&&(row.current_user!==binding.runtimeRole||row.selected_role!==binding.runtimeRole||row.safe_runtime_role!==true)) throw error();
    } finally {if(!ownsDriver)driverBusy=false;}
  }
  async function guardedQuery(sql:string,values:unknown[]=[]):Promise<PgAuthenticationResult> {
    let ownsDriver=false;
    try {
      valid();if(driverBusy)throw error();driverBusy=true;ownsDriver=true;
      await assertContext(true,true);const result=await query(sql,values);valid();await assertContext(true,true);return result;
    } catch(cause) {throw record(cause);} finally {if(ownsDriver)driverBusy=false;}
  }
  const activities=new Set<Promise<unknown>>(),leaves=new Set<Promise<unknown>>();
  function track<T>(pending:Set<Promise<unknown>>,run:()=>Promise<T>):Promise<T> {
    const promise=(async()=>{try{return await run();}catch(cause){throw record(cause);}})();
    pending.add(promise);void promise.then(()=>pending.delete(promise),()=>pending.delete(promise));void promise.catch(()=>{});
    return promise;
  }
  async function drain(pending:Set<Promise<unknown>>):Promise<void> {
    while(pending.size)await Promise.all([...pending].map(promise=>promise.catch(()=>{})));
  }
  const store:BorrowedAuthenticationLoginStore=Object.freeze({
    runInCurrentTransaction(run: (operations: BorrowedAuthenticationLoginOperations) => Promise<void>) {
      if(!active||consumed||failure!==undefined||typeof run!=='function') {
        const rejected=Promise.reject(record(error()));void rejected.catch(()=>{});return rejected;
      }
      consumed=true;
      operation=(async()=>{
        let phase:'START'|'SNAPSHOT'|'LOCKED'|'USED'='START';
        const tx=new PostgresAuthenticationTransaction({query:guardedQuery});
        const operations:BorrowedAuthenticationLoginOperations=Object.freeze({
          readLoginSnapshot(loginName:string) {
            return track(activities,async()=>{
              valid();if(phase!=='START')throw error();phase='SNAPSHOT';
              const result=await guardedQuery(LOGIN_SNAPSHOT,[loginName]);
              requireDomain(result.rows.length<=1,'INVALID_DATABASE_VALUE','One exact authentication snapshot required');
              return result.rows[0]===undefined?undefined:decodeLoginSnapshot(result.rows[0]);
            });
          },
          withLockedAccount<T>(locked:(tx:AuthenticationLoginTransaction)=>Promise<T>):Promise<T> {
            return track(activities,async()=>{
              try {
                valid();if(phase!=='SNAPSHOT'||typeof locked!=='function')throw error();phase='LOCKED';
                await assertContext(true);
                const result=await locked(Object.freeze({
                  getAccount:(id:EntityId<'account'>)=>track(leaves,()=>tx.getAccount(id)),
                  insertSession:(session:AuthenticationSession)=>track(leaves,()=>tx.insertSession(session))
                }));
                // The caller's leaf lifetime ends now, not after an awaited
                // context postcheck. Escaped references cannot query in between.
                tx.close();
                if(leaves.size){record(error());await drain(leaves);throw failure;}
                await assertContext(true);phase='USED';return result;
              } finally {tx.close();}
            });
          }
        });
        try {
          await assertContext(true);await run(operations);
          if((phase as string)!=='USED'||driverBusy||activities.size||leaves.size)throw error();
          // Importer role changes are owned by the outer executor, but switching
          // backend/controller/xid or ending the transaction is never allowed.
          await assertContext(false);
        } catch(cause) {throw record(cause);} finally {
          tx.close();
          if(activities.size||leaves.size)record(error());
          await drain(activities);await drain(leaves);
          if(failure!==undefined)throw failure;
        }
      })();
      void operation.catch(()=>{});return operation;
    }
  });
  try {
    await work(store);
    if(!operation)throw record(error());
    await operation;if(failure!==undefined)throw failure;
    // work(store) may continue after awaiting authentication. Recheck only after
    // both lifetimes settle, not just inside the earlier login operation.
    await assertContext(false);
  } catch(cause) {
    record(cause);
    // A forgotten await or caught error cannot release the parent while native
    // query/password work is still running. No SQL cancel/rollback is invented.
    if(operation)await operation.catch(()=>{});
    throw failure;
  } finally {active=false;}
}
