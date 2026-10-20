/** Synthetic driver protocol only. No network, server, migration, .env or credentials are used. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { inspect } from "node:util";
import test from "node:test";
import { Client, types } from "pg";
import { BoundedPostgresPool, PostgresQueryError, PostgresResourceError } from "../adapters/postgres/src/bounded-pool.ts";
import type { BoundedPostgresConfig, BoundedPostgresDriverConfig, BoundedPostgresResult, PostgresDriverClient, PostgresPoolDriver } from "../adapters/postgres/src/bounded-pool.ts";
import type { PgSalesPool } from "../adapters/postgres/src/sales-unit-of-work.ts";
import type { PgProductQueryPool } from "../adapters/postgres/src/product-query-reader.ts";
import type { PgSalesQueryPool } from "../adapters/postgres/src/sales-query-reader.ts";
import type { PgTransferQueryPool } from "../adapters/postgres/src/transfer-query-reader.ts";
import type { PgAuthenticationPool } from "../adapters/postgres/src/auth-store.ts";

const config = (): BoundedPostgresConfig => ({ target: { host: "synthetic.invalid", port: 55432, database: "synthetic_database",
  user: "synthetic_role", password: "SYNTHETIC-ONLY-NOT-A-SECRET", ssl: false }, max: 1, maxPendingAcquisitions: 2,
  connectionTimeoutMillis: 100, acquisitionTimeoutMillis: 50, queryTimeoutMillis: 200, statementTimeoutMillis: 100,
  lockTimeoutMillis: 30, idleInTransactionTimeoutMillis: 300, idlePoolTimeoutMillis: 100,
  disposeGraceMillis: 10, disposeTimeoutMillis: 40 });
const empty = (): BoundedPostgresResult => ({ rows: [], rowCount: 0 });
function deferred<T>() {
  let resolve!: (result: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
class SyntheticClient extends EventEmitter implements PostgresDriverClient {
  readonly releases: (Error | boolean | undefined)[] = [];
  readonly queries: { text: string; values: unknown[] | undefined }[] = [];
  readonly steps: (() => Promise<BoundedPostgresResult>)[] = [];
  releaseFailure: Error | undefined;
  onRelease: (() => void) | undefined;
  query(text: string, values?: unknown[]): Promise<BoundedPostgresResult> {
    this.queries.push({ text, values }); return this.steps.shift()?.() ?? Promise.resolve(empty());
  }
  release(error?: Error | boolean): void {
    this.releases.push(error);
    if (this.releaseFailure) throw this.releaseFailure;
    this.onRelease?.();
  }
}
class SyntheticDriver extends EventEmitter implements PostgresPoolDriver {
  connectCalls = 0; endCalls = 0; attempts = 0;
  readonly clients = new Set<SyntheticClient>();
  readonly steps: (() => Promise<SyntheticClient>)[] = [];
  readonly ended = deferred<void>();
  endStep: (() => Promise<void>) | undefined;
  connect(): Promise<PostgresDriverClient> {
    this.connectCalls++; this.attempts++;
    let operation: Promise<SyntheticClient>;
    try { operation = this.steps.shift()?.() ?? Promise.resolve(new SyntheticClient()); }
    catch (error) { this.attempts--; this.checkEnd(); throw error; }
    return operation.then(client => {
      this.attempts--; this.clients.add(client);
      client.onRelease = () => { this.clients.delete(client); this.checkEnd(); };
      this.checkEnd(); return client;
    }, error => { this.attempts--; this.checkEnd(); throw error; });
  }
  end(): Promise<void> { this.endCalls++; if (this.endStep) return this.endStep(); this.checkEnd(); return this.ended.promise; }
  checkEnd(): void { if (this.endCalls > 0 && this.attempts === 0 && this.clients.size === 0) this.ended.resolve(); }
}
function fixture(settings = config()) {
  const driver = new SyntheticDriver(); let passed!: BoundedPostgresDriverConfig;
  const pool = new BoundedPostgresPool(settings, options => { passed = options; return driver; });
  // Compile-time compatibility with every current adapter pool subset; no adapters are changed.
  const contracts: [PgSalesPool, PgProductQueryPool, PgSalesQueryPool, PgTransferQueryPool, PgAuthenticationPool] = [pool, pool, pool, pool, pool];
  void contracts;
  return { pool, driver, passed };
}
function code(error: unknown, expected: string): boolean {
  assert.equal((error as { code: unknown }).code, expected); return true;
}
function safe(error: unknown): void {
  for (const rendered of [String(error), inspect(error), JSON.stringify(error)]) {
    assert.doesNotMatch(rendered, /RAW-SECRET|raw_sql|private_target|private_password|private_parameter/);
  }
  assert.equal((error as { cause?: unknown }).cause, undefined);
}

test("bounded pg: pure construction is lazy, uses explicit pg controls, and does not mutate global type parsers", async () => {
  const bigint = types.getTypeParser(20, "text"), numeric = types.getTypeParser(1700, "text");
  const { pool, driver, passed } = fixture();
  assert.equal(driver.connectCalls, 0); assert.equal(driver.endCalls, 0);
  assert.equal(passed.max, 1); assert.equal(passed.connectionTimeoutMillis, 100);
  assert.equal(passed.statement_timeout, 100); assert.equal(passed.lock_timeout, 30);
  assert.equal(passed.idle_in_transaction_session_timeout, 300); assert.equal(passed.query_timeout, 200);
  assert.equal(passed.idleTimeoutMillis, 100); assert.equal(passed.pipeline, false);
  assert.equal(passed.connectionString, undefined); assert.equal(passed.log, undefined);
  assert.equal(types.getTypeParser(20, "text"), bigint); assert.equal(types.getTypeParser(1700, "text"), numeric);
  await pool.dispose(); assert.equal(driver.connectCalls, 0); assert.equal(driver.endCalls, 1);
  // Exercise the real lazy pg.Pool constructor only, never connect().
  const real = new BoundedPostgresPool(config()); await real.dispose();
});

test("bounded pg: ambient PG values cannot supply missing credentials or override explicit startup controls", async () => {
  const ambient: Record<string, string> = { PGHOST: "private_target", PGPORT: "1", PGDATABASE: "private_target", PGUSER: "private_target",
    PGPASSWORD: "private_password", PGSSLMODE: "no-verify", PGOPTIONS: "-c statement_timeout=0", PGAPPNAME: "private_target",
    PGCLIENT_ENCODING: "SQL_ASCII", PGCONNECT_TIMEOUT: "0", PGREPLICATION: "database", PGSSLNEGOTIATION: "direct" };
  const previous = Object.fromEntries(Object.keys(ambient).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, ambient);
    let constructed = 0;
    for (const key of ["host", "database", "user", "password"] as const) {
      const missing = { ...config(), target: { ...config().target, [key]: "" } };
      assert.throws(() => new BoundedPostgresPool(missing, () => { constructed++; return new SyntheticDriver(); }), error => { safe(error); return code(error, "PG_INVALID_CONFIG"); });
    }
    assert.equal(constructed, 0);
    const { pool, passed } = fixture();
    const raw = new Client(passed); // Construction only, not authentication or a network operation.
    const parameters = (raw as unknown as { connectionParameters: Record<string, unknown> }).connectionParameters;
    assert.equal(parameters.host, config().target.host); assert.equal(parameters.port, config().target.port);
    assert.equal(parameters.user, config().target.user); assert.equal(parameters.database, config().target.database);
    assert.equal(parameters.password, config().target.password); assert.equal(parameters.ssl, false);
    assert.equal(parameters.options, "-c statement_timeout=100 -c lock_timeout=30 -c idle_in_transaction_session_timeout=300");
    assert.equal(parameters.replication, "false"); assert.equal(parameters.application_name, "naijue-erp");
    assert.equal(parameters.client_encoding, "UTF8"); assert.equal(parameters.sslnegotiation, "postgres");
    const startup = (raw as unknown as { getStartupConf(): Record<string, unknown> }).getStartupConf();
    assert.equal(startup.statement_timeout, "100"); assert.equal(startup.lock_timeout, "30"); assert.equal(startup.idle_in_transaction_session_timeout, "300");
    await pool.dispose();
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("bounded pg: invalid finite bounds and unsafe TLS fail before driver construction without leaking input", () => {
  const invalid: BoundedPostgresConfig[] = [
    ...[0, -1, NaN, Infinity, 1.5, 2147483648].map(max => ({ ...config(), max })),
    { ...config(), maxPendingAcquisitions: -1 }, { ...config(), connectionTimeoutMillis: 0 }, { ...config(), acquisitionTimeoutMillis: 0 },
    { ...config(), queryTimeoutMillis: 100 }, { ...config(), statementTimeoutMillis: 0 }, { ...config(), lockTimeoutMillis: 0 },
    { ...config(), idleInTransactionTimeoutMillis: 0 }, { ...config(), idlePoolTimeoutMillis: 0 },
    { ...config(), disposeGraceMillis: 40 }, { ...config(), disposeTimeoutMillis: Infinity },
    { ...config(), target: { ...config().target, port: 65536 } },
    { ...config(), target: { ...config().target, ssl: { rejectUnauthorized: false } as never } },
    { ...config(), target: { ...config().target, ssl: undefined as never } },
  ];
  for (const settings of invalid) assert.throws(() => new BoundedPostgresPool(settings, () => { throw new Error("Must never construct"); }), { code: "PG_INVALID_CONFIG" });
  assert.throws(() => new BoundedPostgresPool(config(), () => { throw new Error("RAW-SECRET private_password"); }), error => { safe(error); return code(error, "PG_INVALID_CONFIG"); });
});

test("bounded pg: FIFO pending queue and overload bound never become an unbounded pg wait queue", async () => {
  const { pool, driver } = fixture();
  const first = await pool.connect();
  const order: number[] = [];
  const second = pool.connect().then(client => { order.push(2); return client; });
  const third = pool.connect().then(client => { order.push(3); return client; });
  await assert.rejects(pool.connect(), { code: "PG_POOL_OVERLOADED" });
  assert.equal(driver.connectCalls, 1); first.release();
  const client2 = await second; assert.deepEqual(order, [2]); assert.equal(driver.connectCalls, 2);
  client2.release(); const client3 = await third; assert.deepEqual(order, [2, 3]);
  client3.release(); await pool.dispose();
});

test("bounded pg: zero pending capacity still permits exactly max concurrent leases", async () => {
  const { pool, driver } = fixture({ ...config(), max: 2, maxPendingAcquisitions: 0 });
  const a = pool.connect(), b = pool.connect();
  await assert.rejects(pool.connect(), { code: "PG_POOL_OVERLOADED" });
  const [one, two] = await Promise.all([a, b]); assert.equal(driver.connectCalls, 2);
  one.release(); two.release(); await pool.dispose();
});

test("bounded pg: failed and synchronously throwing acquisitions are sanitized and free only their own slot", async () => {
  const { pool, driver } = fixture();
  driver.steps.push(() => { throw new Error("RAW-SECRET private_target"); }, () => Promise.reject(new Error("RAW-SECRET private_password")));
  for (let i = 0; i < 2; i++) await assert.rejects(pool.connect(), error => { safe(error); return code(error, "PG_ACQUIRE_FAILED"); });
  const client = await pool.connect(); client.release(); await pool.dispose(); assert.equal(driver.connectCalls, 3);
});

test("bounded pg: acquisition deadline includes queue time and late success is discarded, not handed to a timed-out caller", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { pool, driver } = fixture(); const first = await pool.connect();
  const late = deferred<SyntheticClient>(); driver.steps.push(() => late.promise);
  const pending = pool.connect(); const rejected = assert.rejects(pending, { code: "PG_ACQUIRE_TIMEOUT" });
  t.mock.timers.tick(45); first.release(); await flush(); assert.equal(driver.connectCalls, 2);
  t.mock.timers.tick(6); await rejected;
  const client = new SyntheticClient(); late.resolve(client); await flush(); assert.deepEqual(client.releases, [true]);
  const replacement = await pool.connect(); replacement.release(); await pool.dispose();
});

test("bounded pg: expired queued requests leave no retained waiters", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { pool, driver } = fixture(); const first = await pool.connect();
  const requests = [pool.connect(), pool.connect()]; const rejected = Promise.all(requests.map(request => assert.rejects(request, { code: "PG_ACQUIRE_TIMEOUT" })));
  t.mock.timers.tick(50); await rejected;
  const fresh = pool.connect(); first.release(); const client = await fresh;
  assert.equal(driver.connectCalls, 2); client.release(); await pool.dispose();
});

test("bounded pg: timed-out in-flight attempt stays charged until late failure; repeated deadlines cannot multiply driver attempts", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { pool, driver } = fixture({ ...config(), maxPendingAcquisitions: 1 });
  const late = deferred<SyntheticClient>(); driver.steps.push(() => late.promise);
  const first = pool.connect(); const rejected = assert.rejects(first, { code: "PG_ACQUIRE_TIMEOUT" }); await flush();
  t.mock.timers.tick(50); await rejected;
  const second = pool.connect(); await assert.rejects(pool.connect(), { code: "PG_POOL_OVERLOADED" });
  assert.equal(driver.connectCalls, 1);
  late.reject(new Error("RAW-SECRET private_target")); const client = await second;
  assert.equal(driver.connectCalls, 2); client.release(); await pool.dispose();
});

test("bounded pg: release is idempotent, forwards discard as boolean only, and closes the lease", async () => {
  const { pool, driver } = fixture(); const client = await pool.connect(); const raw = [...driver.clients][0]!;
  const values = ["private_parameter"]; assert.deepEqual(await client.query("SELECT $1", values), empty());
  assert.equal(raw.queries[0]!.values, values);
  client.release(new Error("RAW-SECRET private_password")); client.release();
  assert.deepEqual(raw.releases, [true]); await assert.rejects(client.query("Must not run"), { code: "PG_CLIENT_CLOSED" });
  assert.equal(raw.queries.length, 1); await pool.dispose();
});

test("bounded pg: no query queue; release of an in-flight query discards and ignores late outcomes", async () => {
  const { pool, driver } = fixture(); const client = await pool.connect(); const raw = [...driver.clients][0]!;
  const late = deferred<BoundedPostgresResult>(); raw.steps.push(() => late.promise);
  const query = client.query("SELECT raw_sql"); const rejected = assert.rejects(query, { code: "PG_CLIENT_CLOSED" }); await flush();
  await assert.rejects(client.query("Must not queue"), { code: "PG_QUERY_IN_PROGRESS" });
  client.release(); await rejected; assert.deepEqual(raw.releases, [true]);
  late.reject(new Error("RAW-SECRET private_parameter")); await flush(); assert.equal(raw.queries.length, 1); await pool.dispose();
});

test("bounded pg: release before scheduled query dispatch never issues SQL on a returned client", async () => {
  const { pool, driver } = fixture(); const client = await pool.connect(); const raw = [...driver.clients][0]!;
  const query = client.query("Must never run"); const rejected = assert.rejects(query, { code: "PG_CLIENT_CLOSED" });
  client.release(); await rejected; await flush(); assert.equal(raw.queries.length, 0); await pool.dispose();
});

test("bounded pg: SQLSTATE errors permit adapter rollback and preserve only known conflict metadata, never retry SQL", async () => {
  const { pool, driver } = fixture(); const client = await pool.connect(); const raw = [...driver.clients][0]!;
  raw.steps.push(() => Promise.reject(Object.assign(new Error("RAW-SECRET raw_sql private_parameter"), {
    code: "23505", constraint: "customer_code_key", detail: "private_password", cause: new Error("RAW-SECRET"),
  })));
  await assert.rejects(client.query("COMMIT"), error => { safe(error); assert.ok(error instanceof PostgresQueryError); assert.equal(error.constraint, "customer_code_key"); assert.match(error.message, /outcome may be unknown/); return code(error, "23505"); });
  await client.query("ROLLBACK"); client.release();
  assert.deepEqual(raw.queries.map(query => query.text), ["COMMIT", "ROLLBACK"]); assert.deepEqual(raw.releases, [true]); await pool.dispose();
  const safeError = new PostgresQueryError({ code: "RAW-SECRET", constraint: "private_password", detail: "RAW-SECRET" });
  safe(safeError); assert.equal(safeError.code, undefined); assert.equal(safeError.constraint, undefined);
});

test("bounded pg: pg local read timeout is not treated as SQL cancellation and retires the connection", async () => {
  const { pool, driver } = fixture(); const client = await pool.connect(); const raw = [...driver.clients][0]!;
  raw.steps.push(() => Promise.reject(new Error("Query read timeout RAW-SECRET private_target")));
  await assert.rejects(client.query("COMMIT"), error => { safe(error); return error instanceof PostgresQueryError; });
  assert.deepEqual(raw.releases, [true]); await assert.rejects(client.query("COMMIT"), { code: "PG_CLIENT_CLOSED" });
  assert.equal(raw.queries.length, 1); client.release(); await pool.dispose();
});

test("bounded pg: five-character transport codes are not mistaken for server SQLSTATE", async () => {
  const { pool, driver } = fixture(); const client = await pool.connect(); const raw = [...driver.clients][0]!;
  raw.steps.push(() => Promise.reject(Object.assign(new Error("RAW-SECRET private_target"), { code: "EPIPE" })));
  await assert.rejects(client.query("COMMIT"), error => { safe(error); assert.equal((error as PostgresQueryError).code, undefined); return error instanceof PostgresQueryError; });
  assert.deepEqual(raw.releases, [true]); client.release(); await pool.dispose();
});

test("bounded pg: release failure is sanitized, quarantines capacity and is never retried, even during disposal", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { pool, driver } = fixture({ ...config(), maxPendingAcquisitions: 0 }); const client = await pool.connect(); const raw = [...driver.clients][0]!;
  raw.releaseFailure = new Error("RAW-SECRET private_target");
  assert.throws(() => client.release(), error => { safe(error); return code(error, "PG_RELEASE_FAILED"); });
  client.release(); await assert.rejects(pool.connect(), { code: "PG_POOL_OVERLOADED" });
  const disposal = pool.dispose(); const rejected = assert.rejects(disposal, { code: "PG_DISPOSE_TIMEOUT" }); await flush();
  t.mock.timers.tick(40); await rejected; assert.equal(raw.releases.length, 1); assert.equal(driver.endCalls, 1);
});

test("bounded pg: idle and checked-out driver error events are handled without raw logs or uncaught errors", async () => {
  const { pool, driver } = fixture(); driver.emit("error", new Error("RAW-SECRET private_target"));
  const client = await pool.connect(); const raw = [...driver.clients][0]!;
  const late = deferred<BoundedPostgresResult>(); raw.steps.push(() => late.promise);
  const query = client.query("SELECT 1"); const rejected = assert.rejects(query, { code: "PG_CLIENT_CLOSED" }); await flush();
  raw.emit("error", new Error("RAW-SECRET private_password")); await rejected;
  assert.equal(pool.backgroundFailureCount, 2); assert.deepEqual(raw.releases, [true]);
  late.resolve(empty()); await flush(); await pool.dispose();
});

test("bounded pg: disposal closes admission and queued callers immediately, permits graceful return, calls end once", async () => {
  const { pool, driver } = fixture(); const client = await pool.connect(); const raw = [...driver.clients][0]!;
  const queued = pool.connect(); const rejected = assert.rejects(queued, { code: "PG_POOL_CLOSED" });
  const disposal = pool.dispose(); assert.equal(pool.dispose(), disposal);
  await rejected; await assert.rejects(pool.connect(), { code: "PG_POOL_CLOSED" });
  client.release(); await disposal; assert.equal(driver.endCalls, 1); assert.deepEqual(raw.releases, [undefined]);
});

test("bounded pg: disposal grace discards retained clients and settles local in-flight queries; no fake SQL cancellation", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { pool, driver } = fixture(); const client = await pool.connect(); const raw = [...driver.clients][0]!;
  const late = deferred<BoundedPostgresResult>(); raw.steps.push(() => late.promise);
  const query = client.query("COMMIT"); const rejected = assert.rejects(query, { code: "PG_CLIENT_CLOSED" }); await flush();
  const disposal = pool.dispose(); await flush(); t.mock.timers.tick(9); assert.deepEqual(raw.releases, []);
  t.mock.timers.tick(1); await rejected; await disposal; assert.deepEqual(raw.releases, [true]);
  late.resolve(empty()); await flush(); client.release(); assert.equal(raw.releases.length, 1);
});

test("bounded pg: late acquisition after disposal timeout is still cleaned up and cannot be reused", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { pool, driver } = fixture(); const late = deferred<SyntheticClient>(); driver.steps.push(() => late.promise);
  const acquisition = pool.connect(); const rejected = assert.rejects(acquisition, { code: "PG_POOL_CLOSED" }); await flush();
  const disposal = pool.dispose(); const disposalRejected = assert.rejects(disposal, { code: "PG_DISPOSE_TIMEOUT" });
  await rejected; await flush(); t.mock.timers.tick(40); await disposalRejected;
  const raw = new SyntheticClient(); late.resolve(raw); await flush(); assert.deepEqual(raw.releases, [true]);
  assert.equal(pool.dispose(), disposal); assert.equal(driver.endCalls, 1);
});

test("bounded pg: synchronous close before dispatch performs no driver connection", async () => {
  const { pool, driver } = fixture(); const acquisition = pool.connect(); const rejected = assert.rejects(acquisition, { code: "PG_POOL_CLOSED" });
  const disposal = pool.dispose(); await rejected; await disposal; assert.equal(driver.connectCalls, 0); assert.equal(driver.endCalls, 1);
});

test("bounded pg: end failure and unresolved end have finite sanitized outcomes, not a false cleanup-success claim", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const failed = fixture(); const client = await failed.pool.connect(); const raw = [...failed.driver.clients][0]!;
  failed.driver.endStep = () => Promise.reject(new Error("RAW-SECRET private_target"));
  await assert.rejects(failed.pool.dispose(), error => { safe(error); return code(error, "PG_DISPOSE_FAILED"); });
  assert.deepEqual(raw.releases, [true]); client.release();
  const stuck = fixture(); stuck.driver.endStep = () => new Promise(() => {});
  const disposal = stuck.pool.dispose(); const rejected = assert.rejects(disposal, error => { safe(error); return code(error, "PG_DISPOSE_TIMEOUT"); });
  await flush(); t.mock.timers.tick(40); await rejected; assert.equal(stuck.driver.endCalls, 1);
});

test("bounded pg: resource errors expose stable sanitized codes", () => {
  const error = new PostgresResourceError("PG_POOL_OVERLOADED"); assert.equal(error.name, "PostgresResourceError"); safe(error);
});
