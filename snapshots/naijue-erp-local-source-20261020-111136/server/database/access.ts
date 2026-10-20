import {AsyncLocalStorage} from 'node:async_hooks';
import {Pool, type PoolClient} from 'pg';
import {assertIsolatedTarget, readDatabaseConfig, type DatabaseConfig} from './config.js';
import {accessOptions, type AccessOptions} from './access-options.js';
import {passwordProvider} from './credentials.js';
import {readinessCheck} from './readiness.js';
import {ActionSession, type DataSession} from './session.js';
import {DataAccessError, databaseError} from './access-errors.js';
import {assertProductionAdmission, assertProductionSession, type ProductionAccess} from './production-admission.js';
import type {SqlValue} from './session.js';
import type {QueryResultRow} from 'pg';

const runningAction = new AsyncLocalStorage<boolean>();
export interface DataAccess {
  read<T>(work: (session: DataSession) => Promise<T>): Promise<T>;
  transaction<T>(work: (session: DataSession) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function immutableConfig(input: DatabaseConfig): DatabaseConfig {
  // Revalidate even configurations assembled by a caller, and detach every nested object.
  const config = readDatabaseConfig({APP_ENV: input.environment, POSTGRES_HOST: input.host, POSTGRES_PORT: String(input.port),
    POSTGRES_DB: input.database, POSTGRES_USER: input.user, POSTGRES_PASSFILE: input.passfile, POSTGRES_SSLMODE: input.sslmode,
    POSTGRES_ROLE_PREFIX: input.roles.app.replace(/_app$/, ''), POSTGRES_SOURCE_SCHEMA: input.schemas.source,
    POSTGRES_RUNTIME_SCHEMA: input.schemas.runtime, POSTGRES_AUTH_SCHEMA: input.schemas.auth, POSTGRES_CONTROL_SCHEMA: input.schemas.control,
    POSTGRES_INSTANCE_ID: input.instanceId, POSTGRES_CLUSTER_ID: input.clusterId});
  if (Object.entries(config.roles).some(([key,value]) => input.roles[key as keyof DatabaseConfig['roles']] !== value)) throw new DataAccessError('INVALID_ACCESS_ROLES');
  Object.freeze(config.schemas); Object.freeze(config.roles);
  return Object.freeze({...config,...(input.productionAdmission ? {productionAdmission:input.productionAdmission} : {})});
}

/** QA remains unchanged; production needs an externally authorized, exact private capability. */
export class PgDataAccess implements DataAccess {
  #pool: Pool;
  #closed = false;
  #closing: Promise<void> | undefined;
  #idleErrors = 0;
  #active = 0;
  #operations = new Set<Promise<unknown>>();
  #config: DatabaseConfig;
  #options: AccessOptions;
  #ready: (client: PoolClient) => Promise<void>;
  #production: ProductionAccess | undefined;
  constructor(config: DatabaseConfig, options: Partial<AccessOptions> = {}, production?: ProductionAccess) {
    this.#config = immutableConfig(config); this.#options = accessOptions(options); this.#ready = readinessCheck(this.#config);
    const admission = production?.admission ?? this.#config.productionAdmission;
    if (admission) {
      // Health may own a dormant maintenance pool; default runtime actions cannot use it.
      assertProductionAdmission(this.#config,admission,'database-plan');
      this.#production = Object.freeze(production ? {...production} : {admission,operation:'business-runtime'});
      if (production) {
        if (!['employee-initialization','historical-import','baseline-import','baseline-activation','business-runtime','database-inspect'].includes(production.operation)) throw new DataAccessError('PRODUCTION_POOL_OPERATION_NOT_ADMITTED');
        assertProductionAdmission(this.#config,admission,production.operation,production.sourceSha256);
      }
    } else assertIsolatedTarget(this.#config);
    const c = this.#config; const o = this.#options;
    this.#pool = new Pool({host:c.host, port:c.port, database:c.database, user:c.user, password:passwordProvider(c),
      ssl:c.sslmode === 'verify-full' ? {rejectUnauthorized:true} : false, sslnegotiation:'postgres',
      max:o.maxConnections, connectionTimeoutMillis:o.connectionTimeoutMs, idleTimeoutMillis:o.idleTimeoutMs,
      statement_timeout:o.statementTimeoutMs, lock_timeout:o.lockTimeoutMs, idle_in_transaction_session_timeout:o.idleTransactionTimeoutMs,
      query_timeout:o.statementTimeoutMs + 1000, application_name:'naijue-t09-data-access', client_encoding:'UTF8',
      options:'-c search_path=pg_catalog -c timezone=UTC', keepAlive:true});
    this.#pool.on('error', () => {this.#idleErrors++;});
  }
  statistics(): {total: number; idle: number; waiting: number; active: number; idleErrors: number; closed: boolean} {
    return {total:this.#pool.totalCount, idle:this.#pool.idleCount, waiting:this.#pool.waitingCount, active:this.#active, idleErrors:this.#idleErrors, closed:this.#closed};
  }
  read<T>(work: (session: DataSession) => Promise<T>): Promise<T> {return this.#start(true, work);}
  transaction<T>(work: (session: DataSession) => Promise<T>): Promise<T> {return this.#start(false, work);}
  #start<T>(readOnly: boolean, work: (session: DataSession) => Promise<T>): Promise<T> {
    const operation = this.#action(readOnly, work); this.#operations.add(operation);
    void operation.then(() => this.#operations.delete(operation), () => this.#operations.delete(operation));
    return operation;
  }
  close(): Promise<void> {
    if (runningAction.getStore()) return Promise.reject(new DataAccessError('CLOSE_WITHIN_DATA_ACTION'));
    this.#closed = true;
    this.#closing ??= (async () => {await Promise.allSettled([...this.#operations]); await this.#pool.end();})();
    return this.#closing;
  }
  async #action<T>(readOnly: boolean, work: (session: DataSession) => Promise<T>): Promise<T> {
    if (this.#closed) throw new DataAccessError('DATA_ACCESS_CLOSED');
    if (runningAction.getStore()) throw new DataAccessError('NESTED_DATA_ACTION');
    if (this.#production) assertProductionAdmission(this.#config,this.#production.admission,this.#production.operation,this.#production.sourceSha256);
    if (this.#production?.operation === 'database-inspect' && !readOnly) throw new DataAccessError('PRODUCTION_INSPECTION_READ_ONLY');
    let client: PoolClient;
    try {client = await this.#pool.connect();} catch {throw new DataAccessError('DATABASE_CONNECTION_UNAVAILABLE');}
    this.#active++;
    const session = new ActionSession(client, this.#config.instanceId, readOnly);
    let released = false; let committed = false; let commitIssued = false;
    const release = (destroy: boolean): void => {
      if (released) return; released = true; session.close(); client.removeListener('error', broken); client.release(destroy);
    };
    const broken = (): void => {release(true);};
    client.on('error', broken);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {release(true); reject(new DataAccessError(commitIssued ? 'COMMIT_OUTCOME_UNKNOWN' : 'DATA_ACTION_TIMEOUT'));}, this.#options.actionTimeoutMs);
    });
    try {
      return await Promise.race([timeout, runningAction.run(true, async () => {
        try {
          await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN ISOLATION LEVEL READ COMMITTED');
          await client.query({text:`SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),
            set_config('idle_in_transaction_session_timeout',$3,true),set_config('search_path','pg_catalog',true),set_config('timezone','UTC',true)`,
          values:[String(this.#options.statementTimeoutMs),String(this.#options.lockTimeoutMs),String(this.#options.idleTransactionTimeoutMs)]});
          await this.#ready(client);
          if (this.#production) {
            const bound = this.#production;
            const proofSession = {query: <Row extends QueryResultRow>(text: string, values: readonly SqlValue[] = []) => client.query<Row>(text,[...values])};
            await assertProductionSession(proofSession,this.#config,bound.admission,bound.operation,bound.sourceSha256);
          }
        } catch (error) {throw databaseError(error);}
        const result = await work(session);
        session.assertComplete(); session.close();
        if (this.#production) assertProductionAdmission(this.#config,this.#production.admission,this.#production.operation,this.#production.sourceSha256);
        if (released) throw new DataAccessError('ACTION_CONNECTION_LOST');
        try {
          commitIssued = true; await client.query('COMMIT'); committed = true;
          await client.query('DISCARD ALL');
        } catch (error) {
          // COMMIT transport loss is an unknown result. Never automatically replay writes.
          throw new DataAccessError(committed ? 'COMMITTED_CONNECTION_CLEANUP_FAILED' : 'COMMIT_OUTCOME_UNKNOWN', databaseError(error).sqlState);
        }
        release(false); return result;
      })]);
    } catch (error) {
      session.close();
      if (!released && !committed && !session.hasPendingQuery()) {
        try {await client.query('ROLLBACK');} catch { /* Destroy below; backend disconnect also rolls back. */ }
      }
      release(true); throw error;
    } finally {clearTimeout(timer); this.#active--;}
  }
}
