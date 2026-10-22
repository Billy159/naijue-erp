import type { Pool } from 'pg';
import type { StoreSettingsEntry, StoreSettingsKind, StoreSettingsPage, StoreSettingsDetail, StoreSettingsReadGrant, StoreSettingsReadIntent, StoreSettingsReader, StoreSettingsScopedRead } from '../../../packages/application/src/store-settings-read-ports.ts';
import { activeStoreSettingsRead, checkedStoreSettingsActor, checkedStoreSettingsGrant, checkedStoreSettingsIntent, storeSettingsId, validateStoreSettingsDetail, validateStoreSettingsEntry, validateStoreSettingsPage } from '../../../packages/application/src/store-settings-read-validation.ts';
import { DomainError, requireDomain } from '../../../packages/domain/src/errors.ts';
import { booleanValue, integerValue, stringValue } from './codec.ts';

export interface PgStoreSettingsResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
export interface PgStoreSettingsClient { query(text: string, values?: unknown[]): Promise<PgStoreSettingsResult>; release(error?: Error | boolean): void }
export interface PgStoreSettingsPool { connect(): Promise<PgStoreSettingsClient> }
type PgPoolCompatibility = Pool extends PgStoreSettingsPool ? true : never;
const pgPoolCompatibility: PgPoolCompatibility = true; void pgPoolCompatibility;
type Query = (sql: string, values?: unknown[]) => Promise<PgStoreSettingsResult>;
function nativeId(value: unknown): string { try { return storeSettingsId(value); } catch { throw new DomainError('INVALID_DATABASE_VALUE', 'Invalid native store identity'); } }
function total(rows: readonly Record<string, unknown>[]): number {
  requireDomain(rows.length === 1, 'INVALID_DATABASE_VALUE', 'Missing native store total');
  const value = stringValue(rows[0]!.total);
  requireDomain(/^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)), 'INVALID_DATABASE_VALUE', 'Invalid native store total'); return Number(value);
}
function nullableName(value: unknown): string | null { return value === null ? null : stringValue(value); }
function entry(row: Record<string, unknown>, kind: StoreSettingsKind): StoreSettingsEntry {
  const base = { kind, id: nativeId(row.id), name: stringValue(row.name), enabled: booleanValue(row.enabled), version: integerValue(row.version), createdAt: null, updatedAt: null };
  const reference = (id: unknown, name: unknown) => id === null ? null : { id: nativeId(id), name: nullableName(name) };
  return validateStoreSettingsEntry(kind === 'stores' ? { ...base, defaultCustomer: reference(row.default_customer_id, row.default_customer_name), defaultWarehouse: reference(row.default_sales_warehouse_id, row.default_warehouse_name) }
    : { ...base, hall: { id: nativeId(row.hall_id), name: nullableName(row.hall_name) }, stockFacts: null }, kind);
}
/** Inert native hall/warehouse reader. No DDL, importer, writes, stock assumptions,
 * credential/session defaults or permission inference. Count/page/detail are read
 * in a single REPEATABLE READ READ ONLY snapshot. Host must impose pool/statement/
 * lock timeouts: AbortSignal checks suppress further SQL/publication, NOT in-flight
 * pg acquisition/query cancellation. Uncertain commit or failed rollback discards
 * the client; no automatic retry. NONE never joins any FK target table. */
export class PostgresStoreSettingsReadReader implements StoreSettingsReader {
  private readonly pool: PgStoreSettingsPool;
  constructor(pool: PgStoreSettingsPool) { this.pool = pool; if (typeof pool?.connect !== 'function') throw new TypeError('Store settings reader requires an explicit PostgreSQL pool'); }
  private validate(read: StoreSettingsScopedRead, operation: 'list' | 'detail') {
    checkedStoreSettingsActor(read.actor); const intent = checkedStoreSettingsIntent(read.intent); const grant = checkedStoreSettingsGrant(read.grant, intent); activeStoreSettingsRead(read.signal);
    requireDomain(intent.operation === operation, 'STORE_SETTINGS_FORBIDDEN', 'Mismatched store settings reader operation'); return { intent, grant };
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: Query) => Promise<T>): Promise<T> {
    activeStoreSettingsRead(signal); const client = await this.pool.connect(); let began = false, committing = false, discard: Error | undefined;
    const query: Query = (sql, values = []) => { activeStoreSettingsRead(signal); return client.query(sql, values); };
    try {
      activeStoreSettingsRead(signal); await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
      const value = await work(query); activeStoreSettingsRead(signal); committing = true; await query('COMMIT'); activeStoreSettingsRead(signal); return value;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error('Store settings snapshot failed');
      if (began) try { await client.query('ROLLBACK'); } catch (rollbackError) { discard = rollbackError instanceof Error ? rollbackError : new Error('Store settings rollback failed'); throw new AggregateError([error, rollbackError], 'Store settings read and rollback failed; client discarded'); }
      throw error;
    } finally { client.release(discard); }
  }
  private sql(kind: StoreSettingsKind, grant: StoreSettingsReadGrant) {
    const names = grant.references === 'REFERENCES';
    if (kind === 'stores') return {
      from: 'naijue_erp.hall n', scope: 'n.id',
      select: `n.id, n.name, n.enabled, n.version, n.default_customer_id, n.default_sales_warehouse_id, ${names ? 'c.name' : 'NULL::text'} AS default_customer_name, ${names ? 'w.name' : 'NULL::text'} AS default_warehouse_name`,
      joins: names ? ' LEFT JOIN naijue_erp.customer c ON c.id = n.default_customer_id LEFT JOIN naijue_erp.warehouse w ON w.id = n.default_sales_warehouse_id' : ''
    };
    return { from: 'naijue_erp.warehouse n', scope: 'n.hall_id', select: `n.id, n.name, n.enabled, n.version, n.hall_id, ${names ? 'h.name' : 'NULL::text'} AS hall_name`, joins: names ? ' LEFT JOIN naijue_erp.hall h ON h.id = n.hall_id' : '' };
  }
  private scopeValues(grant: StoreSettingsReadGrant): unknown[] { return [grant.scope.kind === 'ALL', grant.scope.kind === 'HALL_IDS' ? [...grant.scope.hallIds] : []]; }
  async readList(read: StoreSettingsScopedRead): Promise<StoreSettingsPage> {
    const { intent, grant } = this.validate(read, 'list'); if (intent.operation !== 'list') throw new Error('Expected store list'); const parameters = intent.parameters;
    return this.snapshot(read.signal, async query => {
      const sql = this.sql(intent.kind, grant);
      const predicate = `($1::boolean OR ${sql.scope} = ANY($2::uuid[])) AND ($3::text = 'all' OR n.enabled = ($3::text = 'normal')) AND strpos(lower(n.name), lower($4::text)) > 0${intent.kind === 'warehouses' ? ' AND ($5::uuid IS NULL OR n.hall_id = $5::uuid)' : ''}`;
      const values = [...this.scopeValues(grant), parameters.status, parameters.search, ...(intent.kind === 'warehouses' ? [parameters.hallId] : [])];
      const n = total((await query(`SELECT count(*)::text AS total FROM ${sql.from} WHERE ${predicate}`, values)).rows);
      const limit = values.length + 1, offset = values.length + 2;
      const rows = (await query(`SELECT ${sql.select} FROM ${sql.from}${sql.joins} WHERE ${predicate} ORDER BY n.name COLLATE "C", n.id LIMIT $${limit} OFFSET $${offset}`, [...values, parameters.pageSize, (parameters.page - 1) * parameters.pageSize])).rows;
      requireDomain(rows.length <= parameters.pageSize, 'INVALID_DATABASE_VALUE', 'Store settings page exceeded requested bound');
      return validateStoreSettingsPage({ page: parameters.page, pageSize: parameters.pageSize, total: n, items: rows.map(row => entry(row, intent.kind)) }, intent.kind, parameters, grant);
    });
  }
  async readDetail(read: StoreSettingsScopedRead): Promise<StoreSettingsDetail> {
    const { intent, grant } = this.validate(read, 'detail'); if (intent.operation !== 'detail') throw new Error('Expected store detail');
    return this.snapshot(read.signal, async query => {
      const sql = this.sql(intent.kind, grant);
      const rows = (await query(`SELECT ${sql.select} FROM ${sql.from}${sql.joins} WHERE ($1::boolean OR ${sql.scope} = ANY($2::uuid[])) AND n.id = $3::uuid LIMIT 2`, [...this.scopeValues(grant), intent.parameters.id])).rows;
      requireDomain(rows.length <= 1, 'INVALID_DATABASE_VALUE', 'Repeated native store detail identity');
      return validateStoreSettingsDetail({ item: rows.length ? entry(rows[0]!, intent.kind) : null }, intent.kind, intent.parameters, grant);
    });
  }
}
