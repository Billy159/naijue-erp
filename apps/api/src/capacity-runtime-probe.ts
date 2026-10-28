/** A02 trusted host resource. No pool construction, filesystem inference,
 * default window/budgets or operational fact collection. The API binds its one
 * owned bounded pool before serving requests; the original admission component
 * owns TTL, waiter limits, shared-volume accounting and the single in-flight probe.
 */
import type {PgSalesPool} from '../../../adapters/postgres/src/sales-unit-of-work.ts';
import type {BoundedPostgresConfig} from '../../../adapters/postgres/src/bounded-pool.ts';
import {CAPACITY_VOLUMES, createCapacityAdmission} from './capacity-admission.ts';
import type {CapacityAdmission, CapacityBinding, CapacityBytes, CapacityReading, CapacityWindow} from './capacity-admission.ts';

export interface CapacityRuntimeTarget {
  readonly host: string; readonly port: number; readonly database: string;
  readonly role: string; readonly databaseOid: string; readonly postmasterStart: string;
}
export type CapacityRuntimeVolumeFacts = {readonly status: 'UNKNOWN'} | {
  readonly status: 'KNOWN'; readonly windowToken: string; readonly binding: CapacityBinding;
  /** Actual collection time on the SAME trusted clock as admission.now, not file
   * read time. All five logical-volume observations must be at least this fresh.
   * The provider must freshly observe after this probe starts; do not relabel
   * a cached operational receipt or an API-local statfs as remote PG/WAL space.
   */
  readonly observedAt: number; readonly freeBytes: CapacityBytes;
};
export interface CapacityRuntimeProbeOptions {
  readonly target: CapacityRuntimeTarget;
  /** Explicit authorized operational producer; no remote mount or second pool. */
  readonly readVolumeFacts: (context: {readonly window: CapacityWindow; readonly signal: AbortSignal}) => Promise<CapacityRuntimeVolumeFacts>;
}
export type OwnedPoolCapacityOptions = Omit<Parameters<typeof createCapacityAdmission>[0], 'probe'> & {
  readonly runtimeProbe: CapacityRuntimeProbeOptions;
};
type PoolBinder = (pool: PgSalesPool, target: BoundedPostgresConfig['target']) => void;
const binders = new WeakMap<CapacityAdmission, PoolBinder>();

/** Capture before the API's first await, alongside its original singleton.
 * Ordinary explicit admission providers retain their existing path unchanged.
 */
export function captureCapacityRuntimePoolBinder(admission: CapacityAdmission): PoolBinder | undefined {
  return binders.get(admission);
}
const IDENTITY_SQL = `/* capacity-runtime:identity */ SELECT current_database() AS database,current_user AS role,session_user,
 (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS database_oid,
 pg_postmaster_start_time()::text AS postmaster_start,
 current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation`;
// Same finite aggregate as scripts/ops/capacity-inventory.mjs. Keep this literal
// inside the bundled runtime: that standalone operational script is not a runtime
// release member. No collector traversal or second-pool entry is imported.
const STORAGE_SQL = `/* capacity-inventory:storage */ SELECT
 pg_relation_size('naijue_erp.auth_session'::regclass)::text AS relation_bytes,
 pg_indexes_size('naijue_erp.auth_session'::regclass)::text AS index_bytes,
 pg_total_relation_size('naijue_erp.auth_session'::regclass)::text AS total_relation_bytes,
 pg_database_size(current_database())::text AS database_bytes`;
const unknown = (): CapacityReading => ({status: 'UNKNOWN'});
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const decimal = (value: unknown): value is string => typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value);
function sameBinding(a: CapacityBinding, b: CapacityBinding): boolean {
  return !!a && !!b && ['candidateFingerprint', 'targetFingerprint', 'writerTopologyFingerprint', 'inventoryFingerprint', 'processInstanceId',
    'restartGeneration', 'writerCount'].every(key => a[key as keyof CapacityBinding] === b[key as keyof CapacityBinding])
    && !!a.physicalVolumes && !!b.physicalVolumes && CAPACITY_VOLUMES.every(v => a.physicalVolumes[v] === b.physicalVolumes[v]);
}

/** Pass this singleton through the existing production factory/main capacity
 * parameter. No JSON/parser/permission contract or automatic approval is added.
 */
export function createOwnedPoolCapacityAdmission(options: OwnedPoolCapacityOptions): CapacityAdmission {
  const input = options?.runtimeProbe, t = input?.target;
  if (!t || !['host', 'database', 'role', 'postmasterStart'].every(key => typeof t[key as keyof CapacityRuntimeTarget] === 'string'
    && String(t[key as keyof CapacityRuntimeTarget]).length > 0)
    || !Number.isSafeInteger(t.port) || t.port < 1 || t.port > 65535 || !/^[1-9]\d*$/.test(t.databaseOid)
    || typeof input.readVolumeFacts !== 'function') throw new TypeError('Explicit capacity runtime target and authorized fresh volume facts required');
  const expected = structuredClone(t), readVolumeFacts = input.readVolumeFacts.bind(input), {now, probeTtlMillis} = options;
  let pool: PgSalesPool | undefined, closed = false;
  const admission = createCapacityAdmission({...options, async probe({window, signal}) {
    const started = now();
    if (!pool || closed || signal.aborted || !timestamp(started)) return unknown();
    const active = () => {
      const at = now();
      if (closed || signal.aborted || !timestamp(at) || at < started || at < window.startsAt || at >= window.expiresAt)
        throw new Error('Capacity runtime observation unavailable');
      return at;
    };
    let client: Awaited<ReturnType<PgSalesPool['connect']>> | undefined, began = false, discard: Error | undefined;
    let result: CapacityReading = unknown();
    try {
      // Operational IO finishes BEFORE borrowing the database lease. The original
      // admission retains its in-flight slot until this entire worker settles,
      // even if a provider ignores abort or a bounded acquisition is still pending.
      const supplied = await readVolumeFacts({window: structuredClone(window), signal}); active();
      if (supplied?.status !== 'KNOWN') return unknown();
      const facts = structuredClone(supplied), factsAt = active();
      if (facts.windowToken !== window.token || !sameBinding(facts.binding, window.binding)
        || !timestamp(facts.observedAt) || facts.observedAt < started || facts.observedAt > factsAt
        || factsAt - facts.observedAt >= probeTtlMillis || !facts.freeBytes
        || !CAPACITY_VOLUMES.every(v => typeof facts.freeBytes[v] === 'bigint' && facts.freeBytes[v] >= 0n)) return unknown();
      active(); client = await pool.connect(); active();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true; active();
      const identity = await client.query(IDENTITY_SQL); active();
      const id = identity.rows[0];
      if (identity.rows.length !== 1 || !id || id.database !== expected.database || id.role !== expected.role
        || id.session_user !== expected.role || id.database_oid !== expected.databaseOid || id.postmaster_start !== expected.postmasterStart
        || id.read_only !== 'on' || id.isolation !== 'repeatable read') throw new Error('Capacity runtime target mismatch');
      const storage = await client.query(STORAGE_SQL); active();
      const bytes = storage.rows[0];
      if (storage.rows.length !== 1 || !bytes || !['relation_bytes', 'index_bytes', 'total_relation_bytes', 'database_bytes'].every(k => decimal(bytes[k])))
        throw new Error('Capacity runtime storage unavailable');
      const sessionRelationBytes = BigInt(String(bytes.total_relation_bytes)), databaseBytes = BigInt(String(bytes.database_bytes));
      if (sessionRelationBytes < BigInt(String(bytes.relation_bytes)) + BigInt(String(bytes.index_bytes)) || databaseBytes < sessionRelationBytes)
        throw new Error('Capacity runtime storage inconsistent');
      // The oldest actual component controls expiry. Physical sizes are current
      // observations within a read transaction, not an MVCC-frozen storage size.
      if (active() - facts.observedAt < probeTtlMillis) result = {status: 'KNOWN', windowToken: window.token,
        binding: structuredClone(window.binding), observedAt: facts.observedAt, freeBytes: facts.freeBytes, databaseBytes, sessionRelationBytes};
    } catch {discard = new Error('Capacity runtime probe failed'); result = unknown();}
    finally {
      if (client) {
        if (began) try {await client.query('ROLLBACK');} catch {discard = new Error('Capacity runtime rollback unconfirmed'); result = unknown();}
        try {client.release(discard);} catch {result = unknown();}
      }
    }
    // No Promise.race or early lease release: bounded driver acquisition/query
    // outcomes must settle before rollback/release. Abort is not claimed SQL cancel.
    try {if (active() - (result.status === 'KNOWN' ? result.observedAt : started) >= probeTtlMillis) return unknown();}
    catch {return unknown();}
    return result;
  }});
  const owned: CapacityAdmission = Object.freeze({acquire: admission.acquire.bind(admission), close() {closed = true; admission.close();}});
  binders.set(owned, (original, target) => {
    if (closed || pool || !original || typeof original.connect !== 'function' || target.host !== expected.host || target.port !== expected.port
      || target.database !== expected.database || target.user !== expected.role) throw new TypeError('Capacity runtime requires its one exact owned pool target');
    pool = original;
  });
  return owned;
}
