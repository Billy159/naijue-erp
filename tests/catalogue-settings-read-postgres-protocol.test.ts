/** SYNTHETIC scripted driver protocol, NOT SQL parsing or real PostgreSQL acceptance. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresCatalogueSettingsReadReader, type PgCatalogueSettingsClient, type PgCatalogueSettingsResult } from '../adapters/postgres/src/catalogue-settings-read-reader.ts';
import { CATALOGUE_SETTINGS_MAX_CATEGORIES, type CatalogueSettingsScopedRead } from '../packages/application/src/catalogue-settings-read-ports.ts';
import { actor, sid } from './support/synthetic-fixtures.ts';
import { PostgresProductQueryReader, type PgProductQueryPool } from '../adapters/postgres/src/product-query-reader.ts';
import { PostgresProductManagementQueryReader } from '../adapters/postgres/src/product-management-query-reader.ts';
import { PostgresProductDetailsQueryReader } from '../adapters/postgres/src/product-details-query-reader.ts';
import { CATALOGUE_PRICE_KEYS } from '../packages/application/src/catalogue-price-input.ts';
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
const reader = (client: Client) => new PostgresCatalogueSettingsReadReader({ async connect() { return client; } }, { profile: 'catalogue-retained-delete-v22', assertVerified() {} });
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

// QB-R1-DELETED-COLUMN-01: call the same four actual reader constructors as
// the R1 host. This column-aware scripted seam is NOT PostgreSQL execution.
const r1Product = sid('product', 8801), r1Image = sid('product', 8802), r1Group = sid('sizeGroup', 8803);
const r1Row = { id: r1Product, product_code: 'R1-SYNTHETIC', name: 'R1 retained product', year: null, system_item_code: null,
  category_name: 'Category', season_name: null, supplier_name: null, thickness: null, retail_price: null };
const r1ImageRow = { id: r1Image, product_id: r1Product, file_ref: 'private:synth', mime: 'image/png', byte_size: '32', display_order: 4 };
type R1ReadCase = 'categories' | 'colors' | 'fits' | 'list' | 'basics' | 'specifications' | 'images' | 'image' | 'prices' | 'barcodes';
const r1Cases: readonly R1ReadCase[] = ['categories', 'colors', 'fits', 'list', 'basics', 'specifications', 'images', 'image', 'prices', 'barcodes'];
function r1Rows(name: R1ReadCase): Record<string, unknown>[][] {
  switch (name) {
    case 'categories': return [[{ total: '1' }], [{ id, parent_id: null, name: 'Category', display_order: 0, version: 1 }], [{ category_id: id, product_count: '1' }]];
    case 'colors': case 'fits': return [[{ total: '1' }], [nativeEntry]];
    case 'list': return [[{ exact_total: '1', invalid_category_tree: false }], [r1Row], []];
    case 'basics': return [[r1Row]];
    case 'specifications': return [[{ id: r1Product, size_group_id: r1Group, size_group_name: 'Group' }], [], []];
    case 'images': return [[{ id: r1Product, name: r1Row.name }], [r1ImageRow]];
    case 'image': return [[r1ImageRow]];
    case 'prices': return [[{ id: r1Product, version: 1, ...Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k => [k, null])) }]];
    case 'barcodes': return [[{ id: r1Product, version: 1 }], [{ total: '0' }], []];
  }
}
function r1Pool(name: R1ReadCase, missingColumn = true) {
  const rows = r1Rows(name), calls: string[] = []; let connected = 0, released = 0;
  const pool: PgProductQueryPool = { async connect() { connected++; return { async query(sql) {
    calls.push(sql); if (missingColumn && sql.includes('deleted_at')) throw Object.assign(Error('schema19 protocol: column deleted_at does not exist'), { code: '42703' });
    if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
    const next = rows.shift(); assert.ok(next, `Unexpected ${name} SQL: ${sql}`); return { rows: structuredClone(next), rowCount: next.length };
  }, release() { released++; } }; } };
  return { pool, calls, counts: () => ({ connected, released, pending: rows.length }) };
}
function r1Invoke(name: R1ReadCase, pool: PgProductQueryPool, capability?: unknown) {
  const signal = new AbortController().signal;
  switch (name) {
    case 'categories': return new PostgresCatalogueSettingsReadReader(pool, capability as never).readCategories(read('categories', 'ALL'));
    case 'colors': return new PostgresCatalogueSettingsReadReader(pool, capability as never).readColors(read('colors'));
    case 'fits': return new PostgresCatalogueSettingsReadReader(pool, capability as never).readFits(read('fits'));
    case 'list': return new PostgresProductManagementQueryReader(pool, capability as never).readList({ actor, signal, grant: { kind: 'all', totalStock: 'unavailable' }, parameters: { page: 1, pageSize: 100, filter: { productIds: [], categoryIds: [], years: [], seasonIds: [], supplierIds: [], fitIds: [], thicknesses: [], shapeCodes: [] } } });
    case 'basics': return new PostgresProductQueryReader(pool, capability as never).readBasics({ actor, signal, grant: { productId: r1Product }, parameters: { productId: r1Product } });
    case 'specifications': return new PostgresProductQueryReader(pool, capability as never).readSpecifications({ actor, signal, grant: { productId: r1Product }, parameters: { productId: r1Product } });
    case 'images': return new PostgresProductQueryReader(pool, capability as never).readImages({ actor, signal, grant: { productId: r1Product }, parameters: { productId: r1Product } });
    case 'image': return new PostgresProductQueryReader(pool, capability as never).readImage({ actor, signal, grant: { productId: r1Product }, parameters: { productId: r1Product, imageId: r1Image } });
    case 'prices': return new PostgresProductDetailsQueryReader(pool, capability as never).readPrices({ actor, signal, grant: { kind: 'prices', productId: r1Product }, parameters: { productId: r1Product }, intent: { kind: 'prices', parameters: { productId: r1Product } } });
    case 'barcodes': { const parameters = { productId: r1Product, page: 1, pageSize: 20 as const }; return new PostgresProductDetailsQueryReader(pool, capability as never).readBarcodes({ actor, signal, parameters, grant: { kind: 'barcodes', productId: r1Product }, intent: { kind: 'barcodes', parameters } }); }
  }
}
for (const name of r1Cases) test(`QB-R1 schema19 ${name}: actual host-style reader must return retained facts without new-column SQL`, async () => {
  const f = r1Pool(name), result = await r1Invoke(name, f.pool); assert.ok(result !== null);
  assert.ok(f.calls.every(sql => !sql.includes('deleted_at'))); assert.equal(f.calls.at(-1), 'COMMIT'); assert.deepEqual(f.counts(), { connected: 1, released: 1, pending: 0 });
});
test('QB-R1 capability: host-verified same-pool branch retains soft-delete filtering on all ten affected entries', async () => {
  for (const name of r1Cases) {
    const f = r1Pool(name, false); let verified = 0;
    const capability = { profile: 'catalogue-retained-delete-v22', assertVerified(pool: PgProductQueryPool) { assert.equal(pool, f.pool); verified++; } };
    assert.ok(await r1Invoke(name, f.pool, capability)); assert.equal(verified, 1); assert.match(f.calls[1]!, /deleted_at IS NULL/);
    if (name === 'categories' || name === 'colors' || name === 'fits' || name === 'list') {
      const scoped = name === 'list' ? f.calls.filter(s => /product-management:(count|page) \*\//.test(s)) : f.calls.filter(s => s.startsWith('SELECT'));
      for (const sql of scoped) assert.match(sql, /deleted_at IS NULL/);
    }
    assert.equal(f.calls.at(-1), 'COMMIT'); assert.deepEqual(f.counts(), { connected: 1, released: 1, pending: 0 });
  }
});
test('QB-R1 capability: a number/profile flag or failed/asynchronous proof cannot activate any reader or acquire a client', () => {
  const constructors = [PostgresCatalogueSettingsReadReader, PostgresProductQueryReader, PostgresProductManagementQueryReader, PostgresProductDetailsQueryReader];
  for (const Reader of constructors) {
    const f = r1Pool('basics');
    for (const capability of [22, true, {}, { profile: 'catalogue-retained-delete-v22' }, { profile: 'other', assertVerified() {} },
      { profile: 'catalogue-retained-delete-v22', assertVerified() { throw Error('HOST_PROOF_NOT_READY'); } },
      { profile: 'catalogue-retained-delete-v22', async assertVerified() {} }]) assert.throws(() => new Reader(f.pool, capability as never));
    let getterCalls = 0; const getter = { profile: 'catalogue-retained-delete-v22', get assertVerified() { getterCalls++; return () => {}; } }; assert.throws(() => new Reader(f.pool, getter as never)); assert.equal(getterCalls, 0);
    assert.equal(f.counts().connected, 0); assert.equal(f.calls.length, 0);
  }
});
test('QB-R1 capability: new-column SQL errors propagate and roll back without fallback or fabricated empty facts', async () => {
  const f = r1Pool('basics');
  await assert.rejects(r1Invoke('basics', f.pool, { profile: 'catalogue-retained-delete-v22', assertVerified() {} }), { code: '42703' });
  assert.equal(f.calls.at(-1), 'ROLLBACK'); assert.equal(f.calls.length, 3); assert.equal(f.counts().connected, 1);
});
test('QB-R1 capability: management candidate count/page use the same explicit schema branch and original grant', async () => {
  for (const enabled of [false, true]) {
    const calls: string[] = [], pool: PgProductQueryPool = { async connect() { return { async query(sql, values = []) {
      calls.push(sql); if (sql.includes('product-management:candidate-count')) { assert.equal(values[0], false); assert.deepEqual(values[1], [r1Product]); return { rows: [{ exact_total: '1' }], rowCount: 1 }; }
      if (sql.includes('product-management:candidate-page')) return { rows: [{ id: r1Product, label: 'R1-SYNTHETIC R1 retained product', code: 'R1-SYNTHETIC', name: 'R1 retained product' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }, release() {} }; } };
    const capability = enabled ? { profile: 'catalogue-retained-delete-v22' as const, assertVerified(actual: PgProductQueryPool) { assert.equal(actual, pool); } } : null;
    const result = await new PostgresProductManagementQueryReader(pool, capability).readCandidates({ actor, signal: new AbortController().signal, grant: { kind: 'products', productIds: [r1Product], totalStock: 'unavailable' }, parameters: { kind: 'product', search: '', selectedIds: [], page: 1, pageSize: 20 } });
    assert.equal(result.exactTotal, 1); assert.equal(result.items[0]!.id, r1Product); assert.ok(calls.filter(sql => sql.includes('product-management:candidate')).every(sql => sql.includes('deleted_at IS NULL') === enabled)); assert.equal(calls.at(-1), 'COMMIT');
  }
});
