import type { Pool } from 'pg';
import type { CatalogueSettingsCategory, CatalogueSettingsEntry, CatalogueSettingsKind, CatalogueSettingsPage, CatalogueSettingsReader, CatalogueSettingsScopedRead, CatalogueSettingsTree } from '../../../packages/application/src/catalogue-settings-read-ports.ts';
import { CATALOGUE_SETTINGS_MAX_CATEGORIES } from '../../../packages/application/src/catalogue-settings-read-ports.ts';
import { activeCatalogueSettingsRead, catalogueSettingsId, checkedCatalogueSettingsActor, checkedCatalogueSettingsGrant, checkedCatalogueSettingsIntent, validateCatalogueSettingsEntry, validateCatalogueSettingsPage, validateCatalogueSettingsTreeGrant } from '../../../packages/application/src/catalogue-settings-read-validation.ts';
import { DomainError, requireDomain } from '../../../packages/domain/src/errors.ts';
import { booleanValue, integerValue, stringValue } from './codec.ts';
import { catalogueRetainedDeleteEnabled, type CatalogueRetainedDeleteCapability } from './product-query-reader.ts';

export interface PgCatalogueSettingsResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
export interface PgCatalogueSettingsClient { query(text: string, values?: unknown[]): Promise<PgCatalogueSettingsResult>; release(error?: Error | boolean): void }
export interface PgCatalogueSettingsPool { connect(): Promise<PgCatalogueSettingsClient> }
type PgPoolCompatibility = Pool extends PgCatalogueSettingsPool ? true : never;
const pgPoolCompatibility: PgPoolCompatibility = true; void pgPoolCompatibility;
export interface CatalogueSettingsCoreReadCapability {
  readonly profile: 'COMMITTED_CORE_SETTINGS_V14';
  assertReady(client: PgCatalogueSettingsClient, read: CatalogueSettingsScopedRead): Promise<readonly string[]>;
}
type Query = (sql: string, values?: unknown[]) => Promise<PgCatalogueSettingsResult>;
function nativeId(value: unknown): string { try { return catalogueSettingsId(value); } catch { throw new DomainError('INVALID_DATABASE_VALUE', 'Invalid persisted catalogue identity'); } }
function count(value: unknown): number {
  const text = stringValue(value);
  requireDomain(/^(0|[1-9]\d*)$/.test(text) && Number.isSafeInteger(Number(text)), 'INVALID_DATABASE_VALUE', 'Invalid persisted catalogue count'); return Number(text);
}
function total(rows: readonly Record<string, unknown>[]): number { requireDomain(rows.length === 1, 'INVALID_DATABASE_VALUE', 'Missing catalogue total'); return count(rows[0]!.total); }
/** Native directory reads only, inert until invoked. No listener, pool creation, writes,
 * migrations, imports, candidate grants or default policy. All count/page/tree/product
 * counts use one REPEATABLE READ READ ONLY snapshot. Abort is checked between calls;
 * it CANNOT cancel an in-flight pg query/acquisition. Host must set statement/lock/pool
 * timeouts. Unknown COMMIT or failed rollback discards the client; never auto-retries. */
export class PostgresCatalogueSettingsReadReader implements CatalogueSettingsReader {
  private readonly coreRead: CatalogueSettingsCoreReadCapability | null;
  private readonly pool: PgCatalogueSettingsPool;
  private readonly retainedDelete: boolean;
  constructor(pool: PgCatalogueSettingsPool, capability: CatalogueRetainedDeleteCapability | null = null, coreRead: CatalogueSettingsCoreReadCapability | null = null) { this.coreRead = coreRead;
    this.pool = pool; if (typeof pool?.connect !== 'function') throw new TypeError('Catalogue settings reader requires an explicit PostgreSQL pool');
    this.retainedDelete = catalogueRetainedDeleteEnabled(pool, capability);
  }
  private validate(read: CatalogueSettingsScopedRead, kind: CatalogueSettingsKind) {
    const intent = checkedCatalogueSettingsIntent(read.intent); checkedCatalogueSettingsActor(read.actor);
    const grant = checkedCatalogueSettingsGrant(read.grant, intent); activeCatalogueSettingsRead(read.signal);
    requireDomain(intent.kind === kind, 'CATALOGUE_SETTINGS_FORBIDDEN', 'Mismatched catalogue reader kind'); return { intent, grant };
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: Query, client: PgCatalogueSettingsClient) => Promise<T>): Promise<T> {
    activeCatalogueSettingsRead(signal); const client = await this.pool.connect(); let began = false, committing = false, discard: Error | undefined;
    const query: Query = (sql, values = []) => { activeCatalogueSettingsRead(signal); return client.query(sql, values); };
    try {
      activeCatalogueSettingsRead(signal); await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
      const value = await work(query, client); activeCatalogueSettingsRead(signal); committing = true; await query('COMMIT'); activeCatalogueSettingsRead(signal); return value;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error('Catalogue snapshot failed');
      if (began) try { await client.query('ROLLBACK'); } catch (rollbackError) {
        discard = rollbackError instanceof Error ? rollbackError : new Error('Catalogue rollback failed');
        throw new AggregateError([error, rollbackError], 'Catalogue read and rollback failed; client discarded');
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async list(read: CatalogueSettingsScopedRead, kind: 'colors' | 'fits'): Promise<CatalogueSettingsPage<CatalogueSettingsEntry>> {
    const { intent } = this.validate(read, kind); if (intent.operation !== 'list') throw new Error('Expected catalogue list'); const parameters = intent.parameters;
    return this.snapshot(read.signal, async (query, client) => {
      const scopeIds = this.coreRead === null ? null : await this.coreRead.assertReady(client, read);
      const table = kind === 'colors' ? 'color' : 'fit'; // Fixed internal identifiers only.
      const predicate = `${this.retainedDelete ? "deleted_at IS NULL AND " : ""}strpos(lower(name || ' ' || code), lower($1::text)) > 0${scopeIds === null ? '' : ' AND id=ANY($2::uuid[])'}`;
      const values: unknown[] = [parameters.search, ...(scopeIds === null ? [] : [scopeIds])];
      const n = total((await query(`SELECT count(*)::text AS total FROM naijue_erp.${table} WHERE ${predicate}`, values)).rows);
      const rows = (await query(`SELECT id, code, name, enabled, version FROM naijue_erp.${table} WHERE ${predicate} ORDER BY code COLLATE "C", id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, parameters.pageSize, (parameters.page - 1) * parameters.pageSize])).rows;
      requireDomain(rows.length <= parameters.pageSize, 'INVALID_DATABASE_VALUE', 'Catalogue page exceeded requested bound');
      const items = rows.map(row => validateCatalogueSettingsEntry({ id: nativeId(row.id), code: stringValue(row.code), name: stringValue(row.name), enabled: booleanValue(row.enabled), version: integerValue(row.version) }));
      return validateCatalogueSettingsPage({ page: parameters.page, pageSize: parameters.pageSize, total: n, items }, parameters);
    });
  }
  readColors(read: CatalogueSettingsScopedRead): Promise<CatalogueSettingsPage<CatalogueSettingsEntry>> { return this.list(read, 'colors'); }
  readFits(read: CatalogueSettingsScopedRead): Promise<CatalogueSettingsPage<CatalogueSettingsEntry>> { return this.list(read, 'fits'); }
  async readCategories(read: CatalogueSettingsScopedRead): Promise<CatalogueSettingsTree> {
    const { intent, grant } = this.validate(read, 'categories'); if (intent.kind !== 'categories' || grant.kind !== 'categories') throw new Error('Expected category tree');
    return this.snapshot(read.signal, async (query, client) => {
      const scopeIds = this.coreRead === null ? null : await this.coreRead.assertReady(client, read);
      requireDomain(this.coreRead === null || grant.productCounts === 'NONE', 'CATALOGUE_SETTINGS_FORBIDDEN', 'CORE reads have no complete product-count authority');
      const predicates = [...(this.retainedDelete ? ['deleted_at IS NULL'] : []), ...(scopeIds === null ? [] : ['id=ANY($1::uuid[])'])];
      const retained = predicates.length === 0 ? '' : ` WHERE ${predicates.join(' AND ')}`;
      const values: unknown[] = scopeIds === null ? [] : [scopeIds];
      const n = total((await query(`SELECT count(*)::text AS total FROM naijue_erp.product_category${retained}`, values)).rows);
      requireDomain(n <= CATALOGUE_SETTINGS_MAX_CATEGORIES, 'CATALOGUE_SETTINGS_READ_TOO_LARGE', 'Category tree exceeds technical response bound');
      const rows = (await query(`SELECT id, parent_id, name, display_order, version FROM naijue_erp.product_category${retained} ORDER BY display_order, id LIMIT $${values.length + 1}`, [...values, CATALOGUE_SETTINGS_MAX_CATEGORIES + 1])).rows;
      requireDomain(rows.length <= CATALOGUE_SETTINGS_MAX_CATEGORIES, 'CATALOGUE_SETTINGS_READ_TOO_LARGE', 'Category tree exceeds technical response bound');
      const items: CatalogueSettingsCategory[] = rows.map(row => ({ id: nativeId(row.id), parentId: row.parent_id === null ? null : nativeId(row.parent_id),
        name: stringValue(row.name), displayOrder: integerValue(row.display_order), version: integerValue(row.version), code: null, productCount: null, childCount: 0 }));
      const childCounts = new Map<string, number>();
      for (const item of items) if (item.parentId !== null) childCounts.set(item.parentId, (childCounts.get(item.parentId) ?? 0) + 1);
      let tree = validateCatalogueSettingsTreeGrant({ total: n, items: items.map(item => ({ ...item, childCount: childCounts.get(item.id) ?? 0 })) }, { ...grant, productCounts: 'NONE' });
      if (grant.productCounts === 'ALL') {
        // Only this independently approved COMPLETE product-count capability accesses product.
        const rows = (await query(`SELECT category_id, count(*)::text AS product_count FROM naijue_erp.product${retained} GROUP BY category_id`)).rows;
        requireDomain(rows.length <= tree.total, 'INVALID_DATABASE_VALUE', 'Product counts exceed category directory');
        const known = new Set(tree.items.map(item => item.id)), counts = new Map<string, number>();
        for (const row of rows) {
          const categoryId = nativeId(row.category_id), n = count(row.product_count);
          requireDomain(known.has(categoryId) && !counts.has(categoryId) && n > 0, 'INVALID_DATABASE_VALUE', 'Invalid or repeated product-count category'); counts.set(categoryId, n);
        }
        tree = validateCatalogueSettingsTreeGrant({ total: n, items: tree.items.map(item => ({ ...item, productCount: counts.get(item.id) ?? 0 })) }, grant);
      }
      return tree;
    });
  }
}
