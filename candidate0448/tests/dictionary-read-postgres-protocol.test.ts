/** SYNTHETIC scripted pg protocol, NOT a PostgreSQL/database acceptance pass. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresDictionaryReadReader, DICTIONARY_MAX_GROUP_MEMBERS, type PgDictionaryClient, type PgDictionaryResult } from '../adapters/postgres/src/dictionary-read-reader.ts';
import type { DictionaryKind, DictionaryScopedRead } from '../packages/application/src/dictionary-read-ports.ts';
import { actor, sid } from './support/synthetic-fixtures.ts';
interface Step { readonly sql: RegExp; readonly rows?: Record<string, unknown>[]; readonly error?: Error; readonly inspect?: (values: unknown[], sql: string) => void }
class Client implements PgDictionaryClient {
  readonly calls: { sql: string; values: unknown[] }[] = []; readonly releases: (Error | boolean | undefined)[] = [];
  private readonly steps: Step[];
  constructor(steps: Step[]) { this.steps = steps; }
  async query(sql: string, values: unknown[] = []): Promise<PgDictionaryResult> { this.calls.push({ sql, values }); const step = this.steps.shift(); assert.ok(step, `Unexpected SQL ${sql}`); assert.match(sql, step.sql); step.inspect?.(values, sql); if (step.error) throw step.error; return { rows: structuredClone(step.rows ?? []), rowCount: step.rows?.length ?? 0 }; }
  release(error?: Error | boolean) { this.releases.push(error); }
  done() { assert.equal(this.steps.length, 0); assert.equal(this.releases.length, 1); assert.ok(this.calls.every(call => !/INSERT|UPDATE|DELETE|FOR UPDATE|import_/i.test(call.sql))); }
}
const begin = (): Step => ({ sql: /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$/ });
const commit = (): Step => ({ sql: /^COMMIT$/ }), rollback = (): Step => ({ sql: /^ROLLBACK$/ });
const count = (n: number): Step => ({ sql: /^SELECT count\(\*\)::text AS total/, rows: [{ total: String(n) }] });
const groupId = sid('sizeGroup', 801), size1 = sid('size', 802), size2 = sid('size', 803), schemeId = sid('product', 804);
const parameters = { search: '100%_\\原值', page: 1, pageSize: 20 as const };
const read = (kind: DictionaryKind, signal = new AbortController().signal): DictionaryScopedRead => ({ actor, intent: { kind, operation: 'list', parameters }, grant: { kind, targetId: null }, signal });
const detail = (): DictionaryScopedRead => ({ ...read('barcode-schemes'), intent: { kind: 'barcode-schemes', operation: 'detail', parameters: { schemeId } }, grant: { kind: 'barcode-schemes', targetId: schemeId } });
const reader = (client: Client) => new PostgresDictionaryReadReader({ async connect() { return client; } });
const nativeScheme = { id: schemeId, name: '2026 only a name', barcode_type: 'stored-type', rule_description: 'STORED RULE', code_length: null, rule_version: 'stored-version', status: 'HISTORICAL' };
test('dictionary pg is inert; invalid/mismatched/aborted requests never connect', async () => {
  assert.throws(() => new PostgresDictionaryReadReader(undefined as never), /explicit PostgreSQL pool/); let connects = 0;
  const r = new PostgresDictionaryReadReader({ async connect() { connects++; throw new Error('must not connect'); } });
  await assert.rejects(() => r.readSeasons({ ...read('seasons'), grant: { kind: 'size-groups', targetId: null } }), { code: 'FORBIDDEN' });
  await assert.rejects(() => r.readSizeGroups(read('seasons')), { code: 'FORBIDDEN' });
  const c = new AbortController(); c.abort(); await assert.rejects(() => r.readSeasons(read('seasons', c.signal)), { code: 'DICTIONARY_READ_ABORTED' });
  await assert.rejects(() => r.readBarcodeScheme({ ...detail(), grant: { kind: 'barcode-schemes', targetId: null } }), { code: 'FORBIDDEN' }); assert.equal(connects, 0);
});
test('dictionary pg one RR snapshot holds count, parameterized bounded page and ordered member set, preserving same-name distinct IDs', async () => {
  const client = new Client([begin(), { ...count(1), inspect(values, sql) { assert.deepEqual(values, [parameters.search]); assert.match(sql, /strpos\(lower\(name \|\| ' ' \|\| code\), lower\(\$1::text\)\)/); assert.ok(!sql.includes(parameters.search)); } },
    { sql: /^SELECT id, name FROM naijue_erp.size_group/, rows: [{ id: groupId, name: 'SYNTHETIC GROUP' }], inspect(values, sql) { assert.deepEqual(values, [parameters.search, 20, 0]); assert.match(sql, /ORDER BY code COLLATE "C", id LIMIT \$2 OFFSET \$3/); } },
    { sql: /^SELECT m.size_group_id/, rows: [{ size_group_id: groupId, id: size1, name: '同名', display_order: 1 }, { size_group_id: groupId, id: size2, name: '同名', display_order: 2 }], inspect(values, sql) { assert.deepEqual(values, [[groupId], DICTIONARY_MAX_GROUP_MEMBERS + 1]); assert.match(sql, /WHERE m.size_group_id = ANY\(\$1::uuid\[\]\)/); assert.match(sql, /ORDER BY m.size_group_id, m.display_order, s.id LIMIT \$2/); } }, commit()]);
  const result = await reader(client).readSizeGroups(read('size-groups')); assert.deepEqual(result.items[0]!.sizes.map(size => size.id), [size1, size2]); assert.equal(result.items[0]!.sizes[0]!.name, result.items[0]!.sizes[1]!.name); assert.equal(client.calls.length, 5); client.done();
});
test('all-size seam dictionary: normal and no-size groups return every native member without requiring any product/SKU occurrence', async () => {
  const noSizeGroup = sid('sizeGroup', 810), noSize = sid('size', 811);
  const client = new Client([begin(), count(2),
    { sql: /^SELECT id, name FROM naijue_erp.size_group/, rows: [{ id: groupId, name: 'SYNTHETIC 上衣尺码' }, { id: noSizeGroup, name: 'SYNTHETIC 无尺码' }],
      inspect(values) { assert.deepEqual(values, ['', 100, 0]); } },
    { sql: /^SELECT m.size_group_id/, rows: [
      { size_group_id: groupId, id: size1, name: '160/S', display_order: 1 }, { size_group_id: groupId, id: size2, name: '170/M', display_order: 2 },
      { size_group_id: noSizeGroup, id: noSize, name: '无尺码', display_order: 1 }
    ], inspect(values) { assert.deepEqual(values, [[groupId, noSizeGroup], 2 * DICTIONARY_MAX_GROUP_MEMBERS + 1]); } }, commit()]);
  const input = read('size-groups'), result = await reader(client).readSizeGroups({ ...input,
    intent: { kind: 'size-groups', operation: 'list', parameters: { search: '', page: 1, pageSize: 100 } } });
  assert.equal(result.total, 2); assert.deepEqual(result.items.map(g => g.sizes.map(s => s.name)), [['160/S', '170/M'], ['无尺码']]);
  assert.ok(client.calls.every(c => !/naijue_erp\.(?:product|sku|inventory_)/.test(c.sql))); client.done();
});
test('dictionary pg empty and out-of-range pages are explicit, no full catalog loading or member queries', async () => {
  for (const n of [0, 1]) { const c = new Client([begin(), count(n), { sql: /^SELECT id, name/, rows: [], inspect(values) { assert.equal(values[2], 20); } }, commit()]); const input = read('size-groups'); const value = await reader(c).readSizeGroups({ ...input, intent: { kind: 'size-groups', operation: 'list', parameters: { ...parameters, page: 2 } } }); assert.equal(value.page, 2); assert.equal(value.total, n); assert.deepEqual(value.items, []); c.done(); }
});
test('dictionary pg seasons use persisted display order; barcode description/type/status/null length remain stored facts', async () => {
  const seasons = new Client([begin(), count(1), { sql: /^SELECT id, name FROM naijue_erp.season/, rows: [{ id: sid('season', 805), name: 'STORED SEASON' }], inspect(_v, sql) { assert.match(sql, /ORDER BY display_order, id/); } }, commit()]); assert.equal((await reader(seasons).readSeasons(read('seasons'))).items[0]!.name, 'STORED SEASON'); seasons.done();
  const list = new Client([begin(), count(1), { sql: /^SELECT id, name, barcode_type/, rows: [nativeScheme] }, commit()]); const result = await reader(list).readBarcodeSchemes(read('barcode-schemes')); assert.equal(result.items[0]!.codeLength, null); assert.equal(result.items[0]!.applicability, null); assert.equal(result.items[0]!.status, 'HISTORICAL'); assert.equal(result.items[0]!.barcodeType, 'stored-type'); list.done();
  for (const rows of [[nativeScheme], []]) { const c = new Client([begin(), { sql: /^SELECT id, name, barcode_type/, rows, inspect(values, sql) { assert.deepEqual(values, [schemeId]); assert.match(sql, /WHERE id = \$1::uuid$/); } }, commit()]); assert.equal((await reader(c).readBarcodeScheme(detail()))?.id ?? null, rows.length ? schemeId : null); c.done(); }
});
test('dictionary pg inconsistent count/page, duplicate/outside members, overflow and corrupt schema values fail rather than silently truncate/guess', async () => {
  for (const memberRows of [Array.from({ length: DICTIONARY_MAX_GROUP_MEMBERS + 1 }, () => ({ size_group_id: groupId, id: size1, name: 'S', display_order: 1 })), [{ size_group_id: sid('sizeGroup', 999), id: size1, name: 'S', display_order: 1 }], [{ size_group_id: groupId, id: size1, name: 'S', display_order: 1 }, { size_group_id: groupId, id: size1, name: 'S', display_order: 1 }]]) {
    const c = new Client([begin(), count(1), { sql: /^SELECT id, name/, rows: [{ id: groupId, name: 'G' }] }, { sql: /^SELECT m.size_group_id/, rows: memberRows }, rollback()]); await assert.rejects(() => reader(c).readSizeGroups(read('size-groups'))); c.done();
  }
  const short = new Client([begin(), count(2), { sql: /^SELECT id, name/, rows: [] }, rollback()]); await assert.rejects(() => reader(short).readSeasons(read('seasons')), { code: 'INVALID_DICTIONARY_RESPONSE' }); short.done();
  const corruptId = new Client([begin(), count(1), { sql: /^SELECT id, name/, rows: [{ id: 'INVALID DATABASE UUID', name: 'S' }] }, rollback()]); await assert.rejects(() => reader(corruptId).readSeasons(read('seasons')), { code: 'INVALID_DATABASE_VALUE' }); corruptId.done();
  const corrupt = new Client([begin(), { sql: /^SELECT id, name, barcode_type/, rows: [{ ...nativeScheme, code_length: 0 }] }, rollback()]); await assert.rejects(() => reader(corrupt).readBarcodeScheme(detail()), { code: 'INVALID_DICTIONARY_RESPONSE' }); corrupt.done();
});
test('dictionary pg acquire/begin/query/commit/rollback failures release once, discard uncertainty and never auto-retry', async () => {
  const failure = new Error('SYNTHETIC SQL'), rollbackFailure = new Error('SYNTHETIC rollback');
  const beginFailure = new Client([{ sql: /^BEGIN/, error: failure }]); await assert.rejects(() => reader(beginFailure).readSeasons(read('seasons')), failure); assert.equal(beginFailure.releases[0], failure); beginFailure.done();
  const queryFailure = new Client([begin(), { sql: /^SELECT count/, error: failure }, rollback()]); await assert.rejects(() => reader(queryFailure).readSeasons(read('seasons')), failure); assert.equal(queryFailure.releases[0], undefined); queryFailure.done();
  const commitFailure = new Client([begin(), count(0), { sql: /^SELECT id, name/, rows: [] }, { sql: /^COMMIT$/, error: failure }, rollback()]); await assert.rejects(() => reader(commitFailure).readSeasons(read('seasons')), failure); assert.equal(commitFailure.releases[0], failure); commitFailure.done();
  const rollbackFailed = new Client([begin(), { sql: /^SELECT count/, error: failure }, { sql: /^ROLLBACK$/, error: rollbackFailure }]); await assert.rejects(() => reader(rollbackFailed).readSeasons(read('seasons')), AggregateError); assert.equal(rollbackFailed.releases[0], rollbackFailure); rollbackFailed.done();
  let connects = 0; await assert.rejects(() => new PostgresDictionaryReadReader({ async connect() { connects++; throw failure; } }).readSeasons(read('seasons')), failure); assert.equal(connects, 1);
});
test('dictionary pg cancellation between count/page/member reads rolls back and ignores any late facts', async () => {
  const controller = new AbortController(), c = new Client([begin(), { ...count(1), inspect() { controller.abort(); } }, rollback()]); await assert.rejects(() => reader(c).readSizeGroups(read('size-groups', controller.signal)), { code: 'DICTIONARY_READ_ABORTED' }); c.done();
});
