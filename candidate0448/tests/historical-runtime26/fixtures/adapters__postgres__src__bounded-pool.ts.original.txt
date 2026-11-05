import { Pool } from "pg";
import type { PoolConfig } from "pg";

/** Operator settings, not approved business capacity or response-time objectives. No defaults. */
export interface BoundedPostgresConfig {
  readonly target: {
    readonly host: string;
    readonly port: number;
    readonly database: string;
    readonly user: string;
    readonly password: string;
    readonly ssl: false | { readonly rejectUnauthorized: true; readonly ca?: string };
  };
  readonly max: number;
  readonly maxPendingAcquisitions: number;
  readonly connectionTimeoutMillis: number;
  readonly acquisitionTimeoutMillis: number;
  readonly queryTimeoutMillis: number;
  readonly statementTimeoutMillis: number;
  readonly lockTimeoutMillis: number;
  readonly idleInTransactionTimeoutMillis: number;
  readonly idlePoolTimeoutMillis: number;
  readonly disposeGraceMillis: number;
  readonly disposeTimeoutMillis: number;
}

export interface BoundedPostgresResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
/** The same query/release subset consumed by the existing read and transaction adapters. */
export interface BoundedPostgresClient {
  query(text: string, values?: unknown[]): Promise<BoundedPostgresResult>;
  release(error?: Error | boolean): void;
}
export interface PostgresDriverClient extends BoundedPostgresClient {
  on(event: "error", listener: (error: Error) => void): unknown;
  removeListener(event: "error", listener: (error: Error) => void): unknown;
}
export interface PostgresPoolDriver {
  connect(): Promise<PostgresDriverClient>;
  end(): Promise<void>;
  on(event: "error", listener: (error: Error) => void): unknown;
}
// pg accepts this startup parameter, although @types/pg does not declare it. A truthy
// literal overrides PGREPLICATION without enabling replication (PostgreSQL boolean false).
export type BoundedPostgresDriverConfig = PoolConfig & { readonly replication: "false" };
export type PostgresPoolDriverFactory = (config: BoundedPostgresDriverConfig) => PostgresPoolDriver;

type ResourceCode = "PG_INVALID_CONFIG" | "PG_POOL_OVERLOADED" | "PG_POOL_CLOSED" | "PG_ACQUIRE_TIMEOUT"
  | "PG_ACQUIRE_FAILED" | "PG_CLIENT_CLOSED" | "PG_QUERY_IN_PROGRESS" | "PG_QUERY_FAILED"
  | "PG_RELEASE_FAILED" | "PG_DISPOSE_FAILED" | "PG_DISPOSE_TIMEOUT";
const messages: Record<ResourceCode, string> = {
  PG_INVALID_CONFIG: "Explicit valid PostgreSQL target and finite resource settings are required",
  PG_POOL_OVERLOADED: "PostgreSQL acquisition capacity is exhausted",
  PG_POOL_CLOSED: "PostgreSQL pool is closing or closed",
  PG_ACQUIRE_TIMEOUT: "PostgreSQL acquisition deadline exceeded",
  PG_ACQUIRE_FAILED: "PostgreSQL acquisition failed",
  PG_CLIENT_CLOSED: "PostgreSQL client is no longer available; an in-flight outcome may be unknown",
  PG_QUERY_IN_PROGRESS: "Only one query at a time is supported on a PostgreSQL lease",
  PG_QUERY_FAILED: "PostgreSQL query failed; a write or commit outcome may be unknown",
  PG_RELEASE_FAILED: "PostgreSQL client cleanup failed; capacity remains quarantined",
  PG_DISPOSE_FAILED: "PostgreSQL disposal failed; resource cleanup is not confirmed",
  PG_DISPOSE_TIMEOUT: "PostgreSQL disposal deadline exceeded; resource cleanup is not confirmed",
};
/** No raw driver message, SQL, parameter, target, credentials or cause is retained. */
export class PostgresResourceError extends Error {
  readonly code: ResourceCode;
  constructor(code: ResourceCode) { super(messages[code]); this.name = "PostgresResourceError"; this.code = code; }
}
// Only the real bounded driver rejection path can retain this internal fact.
// Neither a public property nor constructing a sanitized error supplies origin.
const knownTransportQueryErrors = new WeakSet<object>();
const knownDriverTransportCodes = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EPIPE", "ENETDOWN", "ENETUNREACH", "EHOSTUNREACH"]);
export function isKnownPostgresTransportQueryError(error: unknown): boolean {
  return error !== null && typeof error === "object" && knownTransportQueryErrors.has(error);
}
/** Preserve only SQLSTATE and the two constraint identities used by current adapter conflict mapping. */
export class PostgresQueryError extends Error {
  readonly code: string | undefined;
  readonly constraint: "customer_code_key" | "supplier_code_key" | undefined;
  constructor(error: unknown) {
    super(messages.PG_QUERY_FAILED); this.name = "PostgresQueryError";
    const record = error && typeof error === "object" ? error as { code?: unknown; constraint?: unknown } : {};
    // Do not mistake five-character Node transport codes such as EPIPE for a
    // PostgreSQL SQLSTATE. Unknown classes are conservatively treated as fatal.
    this.code = typeof record.code === "string" && /^[0-9A-Z]{5}$/.test(record.code)
      && sqlStateClasses.has(record.code.slice(0, 2)) ? record.code : undefined;
    this.constraint = record.constraint === "customer_code_key" || record.constraint === "supplier_code_key" ? record.constraint : undefined;
  }
}
const sqlStateClasses = new Set("00 01 02 03 08 09 0A 0B 0F 0L 0P 0Z 10 20 21 22 23 24 25 26 27 28 2B 2D 2F 34 38 39 3B 3D 3F 40 42 44 53 54 55 57 58 72 F0 HV P0 XX".split(" "));

function integer(value: unknown, minimum = 1, maximum = 2147483647): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}
function nonempty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && !value.includes("\0"); }
function checkedConfig(config: BoundedPostgresConfig): BoundedPostgresConfig {
  const target = config?.target;
  if (!target || ![target.host, target.database, target.user, target.password].every(nonempty)
    || !integer(target.port, 1, 65535) || !integer(config.max) || !integer(config.maxPendingAcquisitions, 0)
    || ![config.connectionTimeoutMillis, config.acquisitionTimeoutMillis, config.queryTimeoutMillis, config.statementTimeoutMillis,
      config.lockTimeoutMillis, config.idleInTransactionTimeoutMillis, config.idlePoolTimeoutMillis, config.disposeTimeoutMillis].every(value => integer(value))
    || !integer(config.disposeGraceMillis, 0) || config.disposeGraceMillis >= config.disposeTimeoutMillis
    || config.queryTimeoutMillis <= config.statementTimeoutMillis
    || (target.ssl !== false && (!target.ssl || target.ssl.rejectUnauthorized !== true
      || (target.ssl.ca !== undefined && !nonempty(target.ssl.ca))))) throw new PostgresResourceError("PG_INVALID_CONFIG");
  // Copy only supported settings; no URI parsing, ambient PG*, .env, pgpass or native driver.
  return Object.freeze({ ...config, target: Object.freeze({ host: target.host, port: target.port, database: target.database,
    user: target.user, password: target.password, ssl: target.ssl === false ? false : Object.freeze({ rejectUnauthorized: true as const,
      ...(target.ssl.ca === undefined ? {} : { ca: target.ssl.ca }) }) }) });
}
function driverConfig(config: BoundedPostgresConfig): BoundedPostgresDriverConfig {
  return { ...config.target, max: config.max, min: 0, connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idlePoolTimeoutMillis, statement_timeout: config.statementTimeoutMillis,
    lock_timeout: config.lockTimeoutMillis, idle_in_transaction_session_timeout: config.idleInTransactionTimeoutMillis,
    query_timeout: config.queryTimeoutMillis, application_name: "naijue-erp", client_encoding: "UTF8", sslnegotiation: "postgres",
    replication: "false", options: `-c statement_timeout=${config.statementTimeoutMillis} -c lock_timeout=${config.lockTimeoutMillis} -c idle_in_transaction_session_timeout=${config.idleInTransactionTimeoutMillis}`,
    allowExitOnIdle: true, keepAlive: true, pipeline: false };
}

interface Acquisition {
  readonly resolve: (client: BoundedPostgresClient) => void;
  readonly reject: (error: PostgresResourceError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  settled: boolean;
}
interface Lease { close(error?: Error | boolean): void }

/** Lazy composition leaf. Construction does not connect, migrate, seed or start a service.
 * No query, transaction, acquisition or ambiguous COMMIT is ever retried here. */
export class BoundedPostgresPool {
  readonly #config: BoundedPostgresConfig;
  readonly #driver: PostgresPoolDriver;
  readonly #queue: Acquisition[] = [];
  readonly #acquiring = new Set<Acquisition>();
  readonly #leases = new Set<Lease>();
  #slots = 0;
  #closing = false;
  #backgroundFailures = 0;
  #dispose: Promise<void> | undefined;
  #checkDisposed: (() => void) | undefined;

  readonly #observer: ((stage: "POOL_ACQUIRE" | "DB_QUERY", error?: unknown) => void) | undefined;
  #observe(stage: "POOL_ACQUIRE" | "DB_QUERY", error?: unknown): void { try { this.#observer?.(stage, error); } catch { /* Diagnostics cannot affect resource semantics. */ } }
  constructor(config: BoundedPostgresConfig, createDriver: PostgresPoolDriverFactory = options => new Pool(options), observer?: (stage: "POOL_ACQUIRE" | "DB_QUERY", error?: unknown) => void) {
    this.#observer = observer;
    this.#config = checkedConfig(config);
    try {
      this.#driver = createDriver(driverConfig(this.#config));
      this.#driver.on("error", () => { this.#backgroundFailures++; });
    }
    catch { throw new PostgresResourceError("PG_INVALID_CONFIG"); }
    // pg emits idle-client errors at the pool. Never log the raw error or let an
    // unhandled EventEmitter error crash the host. The host can observe this counter.
  }

  get backgroundFailureCount(): number { return this.#backgroundFailures; }

  connect(): Promise<BoundedPostgresClient> {
    this.#observe("POOL_ACQUIRE");
    return this.#connect().catch(error => { this.#observe("POOL_ACQUIRE", error); throw error; });
  }
  #connect(): Promise<BoundedPostgresClient> {
    if (this.#closing) return Promise.reject(new PostgresResourceError("PG_POOL_CLOSED"));
    if (this.#slots >= this.#config.max && this.#queue.length >= this.#config.maxPendingAcquisitions)
      return Promise.reject(new PostgresResourceError("PG_POOL_OVERLOADED"));
    return new Promise((resolve, reject) => {
      const request: Acquisition = { resolve, reject, settled: false, timer: setTimeout(() => {
        this.#reject(request, "PG_ACQUIRE_TIMEOUT");
        const index = this.#queue.indexOf(request);
        if (index >= 0) this.#queue.splice(index, 1);
        // A timed-out driver attempt retains its slot until its late outcome is
        // known and cleaned up. A Promise.race alone would permit unbounded attempts.
      }, this.#config.acquisitionTimeoutMillis) };
      if (this.#slots < this.#config.max) this.#acquire(request);
      else this.#queue.push(request);
    });
  }

  #reject(request: Acquisition, code: ResourceCode): void {
    if (request.settled) return;
    request.settled = true; clearTimeout(request.timer); request.reject(new PostgresResourceError(code));
  }
  #acquire(request: Acquisition): void {
    this.#slots++; this.#acquiring.add(request);
    // Also handles synchronous driver throws without retaining an unobserved rejection.
    Promise.resolve().then(() => {
      if (this.#closing) throw new PostgresResourceError("PG_POOL_CLOSED");
      return this.#driver.connect();
    }).then(client => {
      this.#acquiring.delete(request);
      const lease = this.#lease(client);
      if (request.settled || this.#closing) {
        this.#reject(request, "PG_POOL_CLOSED");
        try { lease.close(true); } catch { this.#backgroundFailures++; }
      } else {
        request.settled = true; clearTimeout(request.timer); request.resolve(lease.client);
      }
      this.#checkDisposed?.();
    }, () => {
      this.#acquiring.delete(request); this.#slots--;
      this.#reject(request, this.#closing ? "PG_POOL_CLOSED" : "PG_ACQUIRE_FAILED");
      this.#pump(); this.#checkDisposed?.();
    });
  }
  #pump(): void {
    while (!this.#closing && this.#slots < this.#config.max && this.#queue.length) {
      const next = this.#queue.shift()!;
      if (!next.settled) this.#acquire(next);
    }
  }

  #lease(raw: PostgresDriverClient): Lease & { readonly client: BoundedPostgresClient } {
    let closed = false; let tainted = false;
    let rejectQuery: ((error: Error) => void) | undefined;
    const onError = () => {
      this.#backgroundFailures++;
      try { lease.close(true); } catch { this.#backgroundFailures++; }
    };
    const lease = {
      close: (error?: Error | boolean): void => {
        if (closed) return; // Idempotent wrapper; raw release is called at most once.
        closed = true;
        const inFlight = rejectQuery !== undefined;
        rejectQuery?.(new PostgresResourceError("PG_CLIENT_CLOSED")); rejectQuery = undefined;
        try { raw.release(Boolean(error) || tainted || inFlight ? true : undefined); }
        catch {
          // It may already have executed: do not retry or make its capacity reusable.
          throw new PostgresResourceError("PG_RELEASE_FAILED");
        }
        raw.removeListener("error", onError);
        this.#leases.delete(lease); this.#slots--; this.#pump(); this.#checkDisposed?.();
      },
      client: {
        query: (text: string, values?: unknown[]): Promise<BoundedPostgresResult> => {
          this.#observe("DB_QUERY");
          if (closed) return Promise.reject(new PostgresResourceError("PG_CLIENT_CLOSED"));
          if (rejectQuery) return Promise.reject(new PostgresResourceError("PG_QUERY_IN_PROGRESS"));
          return new Promise((resolve, reject) => {
            rejectQuery = reject;
            Promise.resolve().then(() => {
              if (closed) throw new PostgresResourceError("PG_CLIENT_CLOSED");
              return raw.query(text, values);
            }).then(result => {
              if (closed) return;
              rejectQuery = undefined; resolve(result);
            }, error => {
              if (closed) return;
              rejectQuery = undefined; tainted = true;
              const safe = new PostgresQueryError(error);
              this.#observe("DB_QUERY", safe);
              const driverCode = error instanceof Error ? Object.getOwnPropertyDescriptor(error, "code") : undefined;
              if (driverCode && "value" in driverCode && typeof driverCode.value === "string" && knownDriverTransportCodes.has(driverCode.value))
                knownTransportQueryErrors.add(safe);
              // A pg read timeout is NOT SQL cancellation. Non-SQLSTATE failures
              // (including that timeout and transport failures) retire the connection.
              if (!safe.code) try { lease.close(true); } catch { this.#backgroundFailures++; }
              reject(safe);
            });
          });
        },
        release: (error?: Error | boolean) => lease.close(error),
      },
    };
    this.#leases.add(lease); raw.on("error", onError); return lease;
  }

  /** Stop admission immediately; allow grace, then discard retained leases. A finite
   * deadline rejects rather than claiming cleanup completed if driver.end() hangs. */
  dispose(): Promise<void> {
    if (this.#dispose) return this.#dispose;
    this.#closing = true;
    for (const request of [...this.#queue, ...this.#acquiring]) this.#reject(request, "PG_POOL_CLOSED");
    this.#queue.length = 0;
    this.#dispose = new Promise((resolve, reject) => {
      let endDone = false; let finished = false;
      const finish = (error?: PostgresResourceError) => {
        if (finished) return;
        finished = true; clearTimeout(grace); clearTimeout(deadline); this.#checkDisposed = undefined;
        if (error) reject(error); else resolve();
      };
      const grace = setTimeout(() => {
        for (const lease of this.#leases) try { lease.close(true); } catch { this.#backgroundFailures++; }
      }, this.#config.disposeGraceMillis);
      const deadline = setTimeout(() => finish(new PostgresResourceError("PG_DISPOSE_TIMEOUT")), this.#config.disposeTimeoutMillis);
      this.#checkDisposed = () => { if (endDone && this.#slots === 0) finish(); };
      Promise.resolve().then(() => this.#driver.end()).then(() => {
        endDone = true; this.#checkDisposed?.();
      }, () => {
        for (const lease of this.#leases) try { lease.close(true); } catch { this.#backgroundFailures++; }
        finish(new PostgresResourceError("PG_DISPOSE_FAILED"));
      });
    });
    return this.#dispose;
  }
}
