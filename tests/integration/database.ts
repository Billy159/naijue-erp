/** Real PostgreSQL execution helpers, reachable only through the explicit opt-in suite. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import type { PoolClient } from "pg";
import { assertExactRawSqlFailure } from "./proof.ts";
import type { IntegrationSettings } from "./safety.ts";

import { MIGRATIONS } from "./migration-manifest.ts";
export { MIGRATIONS } from "./migration-manifest.ts";
function refused(reason: string): never { throw new Error(`Fresh disposable database verification refused: ${reason}`); }

/** Migration-only diagnostics: never retain SQL, credentials or arbitrary driver message/context fields. */
export function migrationExecutionFailure(filename: (typeof MIGRATIONS)[number][1], error: unknown): Error {
  const fields = error !== null && typeof error === "object" ? error : {};
  const rawCode = "code" in fields ? fields.code : undefined;
  const rawPosition = "position" in fields ? fields.position : undefined;
  const code = typeof rawCode === "string" && /^[0-9A-Z]{5}$/u.test(rawCode) ? rawCode : "unknown";
  const position = typeof rawPosition === "string" && /^[1-9][0-9]{0,9}$/u.test(rawPosition) ? rawPosition : "unknown";
  return Object.assign(new Error(`Reviewed migration ${filename} failed (SQLSTATE ${code}; position ${position}). Database text omitted.`),
    { name: "MigrationExecutionError", code, position, migration: filename });
}

export interface IntegrationDatabase {
  readonly pool: Pool;
  readonly serverVersion: number;
  /** Releases only harness connections. Never drops schemas/databases or deletes append-only facts. */
  close(): Promise<void>;
}

async function assertFresh(client: PoolClient, settings: IntegrationSettings): Promise<number> {
  const { rows: [identity] } = await client.query(`SELECT current_database() AS database, current_user AS role, session_user AS session_role,
    host(inet_server_addr()) AS address, inet_server_port() AS port, pg_is_in_recovery() AS recovery,
    current_setting('server_version_num')::integer AS server_version,
    r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls, r.rolcanlogin,
    d.datdba = r.oid AS owns_database
    FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_database d ON d.datname = current_database() WHERE r.rolname = current_user`);
  if (!identity || identity.database !== settings.database || identity.role !== settings.user || identity.session_role !== settings.user) refused("server database/role identity differs from the explicit target");
  // host(inet) removes /32 or /128 notation. These values cannot prove that no SSH forwarding exists;
  // the operator must independently verify the approved physical disposable target before running.
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(String(identity.address)) || identity.port !== settings.port || identity.recovery !== false) refused("server must report a loopback primary on the requested port; only independently verified direct targets are supported");
  if (identity.rolsuper !== false || identity.rolcreatedb !== false || identity.rolcreaterole !== false || identity.rolreplication !== false
    || identity.rolbypassrls !== false || identity.rolcanlogin !== true || identity.owns_database !== true) refused("role must own the disposable target without elevated role capabilities");
  if (!Number.isInteger(identity.server_version) || identity.server_version < 150000) refused("PostgreSQL 15 or newer is required by this harness");
  const { rows: [lock] } = await client.query("SELECT pg_try_advisory_lock(20261020, 5005) AS acquired");
  if (lock?.acquired !== true) refused("another harness owns this database; no migration will be attempted");
  const { rows: [fresh] } = await client.query(`SELECT
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_namespace WHERE nspname NOT IN ('public', 'information_schema', 'pg_catalog', 'pg_toast')) AS extra_schemas,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) AS user_relations,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) AS user_routines,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) AS user_types,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_collation c JOIN pg_catalog.pg_namespace n ON n.oid=c.collnamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) AS user_collations,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_conversion c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) AS user_conversions,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_operator o JOIN pg_catalog.pg_namespace n ON n.oid=o.oprnamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) AS user_operators,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_opclass o JOIN pg_catalog.pg_namespace n ON n.oid=o.opcnamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) AS user_operator_classes,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_opfamily o JOIN pg_catalog.pg_namespace n ON n.oid=o.opfnamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) AS user_operator_families,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_ts_config t JOIN pg_catalog.pg_namespace n ON n.oid=t.cfgnamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) AS user_text_search_configurations,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_ts_dict t JOIN pg_catalog.pg_namespace n ON n.oid=t.dictnamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) AS user_text_search_dictionaries,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_ts_parser t JOIN pg_catalog.pg_namespace n ON n.oid=t.prsnamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) AS user_text_search_parsers,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_ts_template t JOIN pg_catalog.pg_namespace n ON n.oid=t.tmplnamespace
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) AS user_text_search_templates,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_default_acl) AS default_acl_overrides,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_extension WHERE extname <> 'plpgsql') AS extra_extensions,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_event_trigger) AS event_triggers,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_foreign_server) AS foreign_servers,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_publication) AS publications,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_largeobject_metadata) AS large_objects,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_auth_members WHERE member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)) AS role_memberships,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_prepared_xacts WHERE database = current_database()) AS prepared_transactions,
    (SELECT COUNT(*)::integer FROM pg_catalog.pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()) AS other_connections`);
  if (!fresh || Object.values(fresh).some(value => value !== 0)) refused("target is not fresh, exclusive and free of unexpected schemas/objects/connections; it will not be cleaned or reused");
  return identity.server_version as number;
}

/** This function is the only Pool construction in the suite. The caller must validate all opt-in gates first. */
export async function openFreshDatabase(settings: IntegrationSettings, options: {
  /** Explicit historical reference fixture setup after 0005, before current party constraints. Not CREATE acceptance. */
  readonly afterVersionFive: (pool: Pool) => Promise<void>;
}): Promise<IntegrationDatabase> {
  if (typeof options.afterVersionFive !== "function") refused("the reviewed historical reference fixture hook is required");
  // Validate source hashes before even constructing the driver. No URL/default PG credentials are passed through.
  const sources = await Promise.all(MIGRATIONS.map(async ([, filename, expected]) => {
    const sql = await readFile(new URL(`../../adapters/postgres/migrations/${filename}`, import.meta.url), "utf8");
    if (createHash("sha256").update(sql).digest("hex") !== expected) refused(`migration ${filename} changed; review source and update the explicit manifest first`);
    return sql;
  }));
  const pool = new Pool({ host: settings.host, port: settings.port, database: settings.database, user: settings.user, password: settings.password,
    ssl: false, application_name: "naijue_erp_disposable_integration_test", max: 6, connectionTimeoutMillis: 3000, idleTimeoutMillis: 1000,
    statement_timeout: 15000, lock_timeout: 4000, idle_in_transaction_session_timeout: 20000,
    options: "-c search_path=pg_catalog -c timezone=UTC" });
  let guard: PoolClient | undefined;
  try {
    guard = await pool.connect();
    const serverVersion = await assertFresh(guard, settings);
    for (let index = 0; index < sources.length; index++) {
      const migration = MIGRATIONS[index]!;
      // Each reviewed migration owns its BEGIN/COMMIT. Keep failures attributable without logging SQL or connection data.
      try { await guard.query(sources[index]!); }
      catch (error) { throw migrationExecutionFailure(migration[1], error); }
      const { rows } = await guard.query("SELECT version FROM naijue_erp.schema_migration ORDER BY version");
      const expected = MIGRATIONS.slice(0, index + 1).map(([version]) => version);
      if (JSON.stringify(rows.map(row => row.version)) !== JSON.stringify(expected)) refused(`migration registry differs after ${migration[1]}`);
      if (migration[0] === 5 && options.afterVersionFive) await options.afterVersionFive(pool);
    }
    const held = guard;
    return { pool, serverVersion, async close() { held.release(true); await pool.end(); } };
  } catch (error) {
    // A failed migration can leave only its own transaction aborted. Do not attempt destructive cleanup.
    if (guard) { try { await guard.query("ROLLBACK"); } catch { /* The connection is discarded below. */ } guard.release(true); }
    await pool.end();
    throw error;
  }
}

/** Run a constraint probe in its own transaction. Deferred errors must be forced before rollback. */
export async function expectSqlState(pool: Pool, sqlState: string, work: (client: PoolClient) => Promise<void>, constraint?: string): Promise<void> {
  const client = await pool.connect(); let failure: unknown;
  try {
    await client.query("BEGIN");
    try { await work(client); await client.query("SET CONSTRAINTS ALL IMMEDIATE"); }
    catch (error) { failure = error; }
    await client.query("ROLLBACK");
  } finally { client.release(); }
  if (!failure || typeof failure !== "object" || !("code" in failure) || failure.code !== sqlState) {
    throw new Error(`Constraint probe expected SQLSTATE ${sqlState}, observed ${failure && typeof failure === "object" && "code" in failure ? String(failure.code) : "no matching database error"}`);
  }
  if (constraint && (!("constraint" in failure) || failure.constraint !== constraint)) throw new Error(`Constraint probe did not reach the expected ${constraint} constraint`);
}

/** Exact real-driver constraint probe. Force deferred checks, then always roll back; never fabricate a receipt. */
export async function expectExactSqlFailure(pool: Pool, code: string, message: string, functionName: string,
  work: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect(); let failure: unknown;
  try {
    await client.query("BEGIN");
    try { await work(client); await client.query("SET CONSTRAINTS ALL IMMEDIATE"); } catch (error) { failure = error; }
    await client.query("ROLLBACK");
  } finally { client.release(); }
  assertExactRawSqlFailure(failure, code, message, functionName);
}
