/** SYNTHETIC scripted driver protocol, NOT SQL parsing or real PostgreSQL acceptance. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresCatalogueSettingsReadReader, type PgCatalogueSettingsClient, type PgCatalogueSettingsResult } from '../adapters/postgres/src/catalogue-settings-read-reader.ts';
import { CATALOGUE_SETTINGS_MAX_CATEGORIES, type CatalogueSettingsScopedRead } from '../packages/application/src/catalogue-settings-read-ports.ts';
import { actor, sid } from './support/synthetic-fixtures.ts';
interface Step { readonly sql: RegExp; readonly rows?: Record<string, unknown>[]; readonly error?: Error; readonly inspect?: (values: unknown[], sql: string) => void }
class Client implements PgCatalogueSettingsClient {
  readonly calls: { sql: string; values: unknown[] }[] = []; readonly releases: (Error | boolean | undefined)[] = [];
  private readonly steps: Step[];
  constructor(steps: Step[]) { this.steps = steps; }
  async query(sql: string, values: unknown[] = []): Promise<PgCatalogueSettingsResult> { this.calls.push({ sql, values }); const step = this.steps.shift(); assert.ok(step, `Unexpected SQL ${sql}`); assert.match(sql, step.sql); step.inspect?.(values, sql); if (step.error) throw step.error; return { rows: structuredClone(step.rows ?? []), rowCount: step.rows?.length ?? 0 }; }
  release(error?: Error | boolean) { this.releases.push(error); }
  done() { assert.equal(this.steps.length, 0); assert.equal(this.releases.length, 1); for (const call of this.calls) assert.doesNotMatch(call.sql, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|import_|candidate/i); }
}
const begin = (): Step => ({ sql: /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$/ }), commit = (): Step => ({ sql: /^COMMIT$/ }), rollback = (): Step => ({ sql: /^ROLLBACK$/ });
const count = (n: number): Step => ({ sql: /^SELECT count\(\*\)::text AS total FROM naijue_erp\./, rows: [{ total: String(n) }] });
const parameters = { search: '100%_\\原值', page: 1, pageSize: 20 as const }, id = sid('category', 1001), childId = sid('category', 1002), deepId = sid('category', 1003);
const categories = [{ id, parent_id: null, name: '原根分类', display_order: -4, version: 7 }, { id: childId, parent_id: id, name: '同名', display_order: 0, version: 1 }, { id: deepId, parent_id: childId, name: '同名', display_order: 19, version: 1 }];
const nativeEntry = { id: sid('color', 1004), code: 'UNCHANGED', name: '同名', enabled: false, version: 3 };
const categoryStep = (rows: Record<string, unknown>[] = categories): Step => ({ sql: /^SELECT id, parent_id, name, display_order, version FROM naijue_erp.product_category WHERE deleted_at IS NULL ORDER BY display_order, id LIMIT \$1$/, rows, inspect(values) { assert.deepEqual(values, [CATALOGUE_SETTINGS_MAX_CATEGORIES + 1]); } });
function read(kind: 'categories' | 'colors' | 'fits', productCounts: 'NONE' | 'ALL' = 'NONE', signal = new AbortController().signal): CatalogueSettingsScopedRead {
  return kind === 'categories' ? { actor, intent: { kind, operation: 'tree', parameters: {} }, grant: { kind, operation: 'tree', productCounts }, signal }
    : { actor, intent: { kind, operation: 'list', parameters }, grant: { kind, operation: 'list' }, signal };
}
const reader = (client: Client) => new PostgresCatalogueSettingsReadReader({ async connect() { return client; } });
test('catalogue PG construction is inert; invalid/mismatched/aborted requests never acquire a client', async () => {
  assert.throws(() => new PostgresCatalogueSettingsReadReader(undefined as never), /explicit PostgreSQL pool/); let acquired = 0;
  const r = new PostgresCatalogueSettingsReadReader({ async connect() { acquired++; throw new Error('must not acquire'); } });
  await assert.rejects(() => r.readColors({ ...read('colors'), grant: { kind: 'fits', operation: 'list' } }), { code: 'CATALOGUE_SETTINGS_FORBIDDEN' });
  await assert.rejects(() => r.readCategories(read('fits')), { code: 'CATALOGUE_SETTINGS_FORBIDDEN' });
  await assert.rejects(() => r.readCategories({ ...read('categories'), grant: { kind: 'categories', operation: 'tree' } as never }), { code: 'CATALOGUE_SETTINGS_FORBIDDEN' });
  const c = new AbortController(); c.abort(); await assert.rejects(() => r.readFits(read('fits', 'NONE', c.signal)), { code: 'CATALOGUE_SETTINGS_READ_ABORTED' }); assert.equal(acquired, 0);
});
test('color and fit count/page are parameterized, literal-substring and bounded in same RR snapshot; exact state and identity survive', async () => {
  for (const kind of ['colors', 'fits'] as const) {
    const table = kind === 'colors' ? 'color' : 'fit';
    const c = new Client([begin(), { ...count(2), inspect(values, sql) { assert.deepEqual(values, [parameters.search]); assert.ok(sql.includes(`naijue_erp.${table}`)); assert.match(sql, /strpos\(lower\(name \|\| ' ' \|\| code\), lower\(\$1::text\)\)/); assert.ok(!sql.includes(parameters.search)); } },
      { sql: /^SELECT id, code, name, enabled, version FROM naijue_erp\./, rows: [nativeEntry, { ...nativeEntry, id: sid('color', 1005), enabled: true }], inspect(values, sql) { assert.ok(sql.includes(`naijue_erp.${table}`)); assert.match(sql, /ORDER BY code COLLATE "C", id LIMIT \$2 OFFSET \$3$/); assert.deepEqual(values, [parameters.search, 20, 0]); } }, commit()]);
    const result = await (kind === 'colors' ? reader(c).readColors(read(kind)) : reader(c).readFits(read(kind)));
    assert.equal(result.items.length, 2); assert.notEqual(result.items[0]!.id, result.items[1]!.id); assert.equal(result.items[0]!.name, result.items[1]!.name); assert.equal(result.items[0]!.enabled, false); assert.equal(result.items[0]!.version, 3); c.done();
  }
});
test('category NONE capability reads complete bounded native tree but never queries products or invents code/count/depth', async () => {
  const c = new Client([begin(), count(3), categoryStep(), commit()]);
  const result = await reader(c).readCategories(read('categories'));
  assert.equal(result.total, 3); assert.deepEqual(result.items.map(item => item.parentId), [null, id, childId]); assert.deepEqual(result.items.map(item => item.childCount), [1, 1, 0]); assert.equal(result.items[0]!.displayOrder, -4);
  assert.ok(result.items.every(item => item.code === null && item.productCount === null)); assert.ok(!c.calls.some(call => /FROM naijue_erp.product\b/.test(call.sql))); c.done();
});
test('category ALL capability alone authorizes complete direct product counts, zero only from absent exact group in same snapshot', async () => {
  const c = new Client([begin(), count(3), categoryStep(), { sql: /^SELECT category_id, count\(\*\)::text AS product_count FROM naijue_erp.product WHERE deleted_at IS NULL GROUP BY category_id$/, rows: [{ category_id: childId, product_count: '9' }] }, commit()]);
  const result = await reader(c).readCategories(read('categories', 'ALL')); assert.deepEqual(result.items.map(item => item.productCount), [0, 9, 0]); assert.equal(c.calls.length, 5); c.done();
});
test('explicit empty and out-of-range color pages preserve requested page/total and do not clamp or fetch all', async () => {
  for (const n of [0, 1]) {
    const c = new Client([begin(), count(n), { sql: /^SELECT id, code, name, enabled, version/, rows: [], inspect(values) { assert.equal(values[2], 20); } }, commit()]);
    const r = read('colors'); const result = await reader(c).readColors({ ...r, intent: { kind: 'colors', operation: 'list', parameters: { ...parameters, page: 2 } } }); assert.equal(result.page, 2); assert.equal(result.total, n); assert.equal(result.items.length, 0); c.done();
  }
  const empty = new Client([begin(), count(0), categoryStep([]), commit()]); assert.deepEqual(await reader(empty).readCategories(read('categories')), { total: 0, items: [] }); empty.done();
});
test('category count overflow fails before fetching rows; row overflow fails without product access, never truncates', async () => {
  const c = new Client([begin(), count(CATALOGUE_SETTINGS_MAX_CATEGORIES + 1), rollback()]); await assert.rejects(() => reader(c).readCategories(read('categories', 'ALL')), { code: 'CATALOGUE_SETTINGS_READ_TOO_LARGE' }); assert.equal(c.calls.length, 3); c.done();
  const rows = Array.from({ length: CATALOGUE_SETTINGS_MAX_CATEGORIES + 1 }, () => categories[0]!);
  const overflow = new Client([begin(), count(1), categoryStep(rows), rollback()]); await assert.rejects(() => reader(overflow).readCategories(read('categories', 'ALL')), { code: 'CATALOGUE_SETTINGS_READ_TOO_LARGE' }); overflow.done();
});
test('count mismatch, missing/cyclic/duplicate category IDs and invalid counters fail closed, not repaired', async () => {
  for (const rows of [[{ ...categories[0], parent_id: childId }], [categories[0], categories[0]], [{ ...categories[0], parent_id: id }]]) {
    const c = new Client([begin(), count(rows.length), categoryStep(rows as Record<string, unknown>[]), rollback()]); await assert.rejects(() => reader(c).readCategories(read('categories')), { code: 'CATALOGUE_SETTINGS_INVALID_RESPONSE' }); c.done();
  }
  const short = new Client([begin(), count(2), categoryStep([]), rollback()]); await assert.rejects(() => reader(short).readCategories(read('categories')), { code: 'CATALOGUE_SETTINGS_INVALID_RESPONSE' }); short.done();
  for (const counts of [[{ category_id: childId, product_count: '0' }], [{ category_id: sid('category', 9999), product_count: '1' }], [{ category_id: id, product_count: '1' }, { category_id: id, product_count: '1' }], [{ category_id: id, product_count: '9007199254740992' }]]) {
    const c = new Client([begin(), count(3), categoryStep(), { sql: /^SELECT category_id/, rows: counts }, rollback()]); await assert.rejects(() => reader(c).readCategories(read('categories', 'ALL')), { code: 'INVALID_DATABASE_VALUE' }); c.done();
  }
});
test('persisted unsafe counts, invalid IDs/state/version, and partial pages are not silently converted', async () => {
  for (const rows of [[{ ...nativeEntry, enabled: 'false' }], [{ ...nativeEntry, id: 'COLOR-NAME' }], [{ ...nativeEntry, version: 0 }], []]) {
    const c = new Client([begin(), count(1), { sql: /^SELECT id, code, name/, rows }, rollback()]); await assert.rejects(() => reader(c).readColors(read('colors'))); c.done();
  }
  const c = new Client([begin(), { sql: /^SELECT count/, rows: [{ total: '9007199254740992' }] }, rollback()]); await assert.rejects(() => reader(c).readCategories(read('categories')), { code: 'INVALID_DATABASE_VALUE' }); c.done();
});
test('acquire/begin/query/commit/rollback failures release exactly once; uncertain client discarded; no automatic retries', async () => {
  const failure = new Error('SYNTHETIC SQL'), rollbackFailure = new Error('SYNTHETIC rollback');
  const beginFailure = new Client([{ sql: /^BEGIN/, error: failure }]); await assert.rejects(() => reader(beginFailure).readCategories(read('categories')), failure); assert.equal(beginFailure.releases[0], failure); beginFailure.done();
  const queryFailure = new Client([begin(), { sql: /^SELECT count/, error: failure }, rollback()]); await assert.rejects(() => reader(queryFailure).readCategories(read('categories')), failure); assert.equal(queryFailure.releases[0], undefined); queryFailure.done();
  const commitFailure = new Client([begin(), count(0), categoryStep([]), { sql: /^COMMIT$/, error: failure }, rollback()]); await assert.rejects(() => reader(commitFailure).readCategories(read('categories')), failure); assert.equal(commitFailure.releases[0], failure); commitFailure.done();
  const rollbackFailed = new Client([begin(), { sql: /^SELECT count/, error: failure }, { sql: /^ROLLBACK$/, error: rollbackFailure }]); await assert.rejects(() => reader(rollbackFailed).readCategories(read('categories')), AggregateError); assert.equal(rollbackFailed.releases[0], rollbackFailure); rollbackFailed.done();
  let acquired = 0; await assert.rejects(() => new PostgresCatalogueSettingsReadReader({ async connect() { acquired++; throw failure; } }).readCategories(read('categories')), failure); assert.equal(acquired, 1);
});
test('abort between reads or while acquiring stops subsequent SQL and releases once; no late facts', async () => {
  const controller = new AbortController(), c = new Client([begin(), { ...count(3), inspect() { controller.abort(); } }, rollback()]); await assert.rejects(() => reader(c).readCategories(read('categories', 'ALL', controller.signal)), { code: 'CATALOGUE_SETTINGS_READ_ABORTED' }); c.done();
  const acquired = new AbortController(), client = new Client([]); await assert.rejects(() => new PostgresCatalogueSettingsReadReader({ async connect() { acquired.abort(); return client; } }).readCategories(read('categories', 'NONE', acquired.signal)), { code: 'CATALOGUE_SETTINGS_READ_ABORTED' }); assert.ok(client.releases[0] instanceof Error); client.done();
});
