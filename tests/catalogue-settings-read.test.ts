/** SYNTHETIC contracts only; no current production identity, catalogue or database. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogueSettingsReadService } from '../packages/application/src/catalogue-settings-read-service.ts';
import { CATALOGUE_SETTINGS_MAX_CATEGORIES, type CatalogueSettingsReadAuthorization, type CatalogueSettingsReadDependencies, type CatalogueSettingsScopedRead } from '../packages/application/src/catalogue-settings-read-ports.ts';
import { parseCatalogueSettingsListQuery, validateCatalogueSettingsEntry, validateCatalogueSettingsPage, validateCatalogueSettingsTree } from '../packages/application/src/catalogue-settings-read-validation.ts';
import { actor, sid } from './support/synthetic-fixtures.ts';
const query = { search: '', page: 1, pageSize: 20 as const }, id = sid('category', 901), childId = sid('category', 902), deepId = sid('category', 903);
const entry = { id: sid('color', 904), code: 'UNINFERRED', name: 'SYNTHETIC SAME NAME', enabled: false, version: 7 };
const category = { id, parentId: null, name: 'ORIGINAL NAME', displayOrder: -8, version: 3, code: null, productCount: null, childCount: 1 };
const tree = { total: 3, items: [category, { ...category, id: childId, parentId: id, displayOrder: 10 }, { ...category, id: deepId, parentId: childId, childCount: 0, displayOrder: 0 }] };
function fixture(authorize?: CatalogueSettingsReadAuthorization['authorize']) {
  const reads: CatalogueSettingsScopedRead[] = [], intents: CatalogueSettingsScopedRead['intent'][] = [];
  const page = (read: CatalogueSettingsScopedRead) => { reads.push(read); if (read.intent.operation !== 'list') throw new Error(); return { ...read.intent.parameters, total: 1, items: [entry] }; };
  const dependencies: CatalogueSettingsReadDependencies = { authorization: { async authorize(a, intent, signal) {
    intents.push(intent); assert.deepEqual(a, actor); assert.ok(signal instanceof AbortSignal);
    return authorize ? authorize(a, intent, signal) : intent.kind === 'categories' ? { kind: 'categories', operation: 'tree', productCounts: 'NONE' } : { kind: intent.kind, operation: 'list' };
  } }, reader: { async readCategories(read) { reads.push(read); return tree; }, async readColors(read) { const { search: _search, ...value } = page(read); return value; }, async readFits(read) { const { search: _search, ...value } = page(read); return value; } } };
  return { service: createCatalogueSettingsReadService(dependencies), dependencies, reads, intents };
}
const signal = () => new AbortController().signal;
test('catalogue read requires explicit trusted dependencies and reauthorizes each exact full-directory kind', async () => {
  assert.throws(() => createCatalogueSettingsReadService({} as never), /explicit trusted/);
  const f = fixture(); assert.deepEqual(await f.service.readCategories(actor, {}, signal()), tree);
  assert.deepEqual((await f.service.readColors(actor, query, signal())).items, [entry]);
  assert.deepEqual((await f.service.readFits(actor, query, signal())).items, [entry]);
  assert.deepEqual(f.intents.map(intent => intent.kind), ['categories', 'colors', 'fits']); assert.equal(f.reads.length, 3);
  for (const grant of [{ kind: 'colors', operation: 'list' }, { kind: 'categories', operation: 'tree' }, { kind: 'categories', operation: 'tree', productCounts: 'PARTIAL' }, { kind: 'categories', operation: 'tree', productCounts: 'ALL', hallId: actor.hallId }]) {
    const denied = fixture(async () => grant as never); await assert.rejects(() => denied.service.readCategories(actor, {}, signal()), { code: 'CATALOGUE_SETTINGS_FORBIDDEN' }); assert.equal(denied.reads.length, 0);
  }
});
test('category directory grant never implicitly grants product counts; exact NONE/ALL reader result is enforced', async () => {
  const none = fixture(); none.dependencies.reader.readCategories = async () => ({ total: 1, items: [{ ...category, childCount: 0, productCount: 0 }] });
  await assert.rejects(() => none.service.readCategories(actor, {}, signal()), { code: 'CATALOGUE_SETTINGS_INVALID_RESPONSE' });
  const all = fixture(async () => ({ kind: 'categories', operation: 'tree', productCounts: 'ALL' }));
  await assert.rejects(() => all.service.readCategories(actor, {}, signal()), { code: 'CATALOGUE_SETTINGS_INVALID_RESPONSE' });
  all.dependencies.reader.readCategories = async () => ({ total: 1, items: [{ ...category, childCount: 0, productCount: 0 }] });
  assert.equal((await all.service.readCategories(actor, {}, signal())).items[0]!.productCount, 0);
});
test('strict queries reject forged authority, write fields, unsafe paging/search and malformed actor before authorization', async () => {
  const f = fixture();
  for (const input of [{ ...query, actor }, { ...query, enabled: true }, { ...query, grant: 'ALL' }, { ...query, page: 0 }, { ...query, page: Number.MAX_SAFE_INTEGER }, { ...query, pageSize: 30 }, { ...query, search: '\u007f' }, { ...query, search: 'x'.repeat(201) }, null, {}, []]) await assert.rejects(() => f.service.readColors(actor, input, signal()), { code: 'CATALOGUE_SETTINGS_INVALID_QUERY' });
  for (const input of [{ search: '' }, { productCounts: 'ALL' }, { role: 'ADMIN' }, null, []]) await assert.rejects(() => f.service.readCategories(actor, input, signal()), { code: 'CATALOGUE_SETTINGS_INVALID_QUERY' });
  await assert.rejects(() => f.service.readFits({ accountId: 'not-uuid', hallId: null } as never, query, signal()), /Invalid trusted catalogue settings actor/); assert.equal(f.intents.length, 0);
  assert.equal(parseCatalogueSettingsListQuery({ ...query, search: '100%_\\原值' }).search, '100%_\\原值');
});
test('DTOs preserve exact native code/name/state/version, empty text and unrestricted signed category depth/order', () => {
  assert.deepEqual(validateCatalogueSettingsEntry({ ...entry, code: '', name: '' }), { ...entry, code: '', name: '' });
  const result = validateCatalogueSettingsTree(tree); assert.equal(result.items[2]!.parentId, childId); assert.equal(result.items[0]!.displayOrder, -8); assert.equal(result.items[0]!.code, null); assert.equal(result.items[0]!.productCount, null);
  const sameNames = [{ ...entry }, { ...entry, id: sid('color', 905) }]; assert.deepEqual(validateCatalogueSettingsPage({ page: 1, pageSize: 20, total: 2, items: sameNames }, query).items, sameNames);
  for (const value of [{ ...entry, enabled: 'true' }, { ...entry, version: 0 }, { ...entry, code: null }, { ...entry, extra: 'write' }, { ...entry, id: 'SAME-NAME-NOT-ID' }]) assert.throws(() => validateCatalogueSettingsEntry(value), { code: 'CATALOGUE_SETTINGS_INVALID_RESPONSE' });
});
test('full tree refuses duplicate/missing/cyclic/reparented/truncated/count-inconsistent data rather than inventing roots or totals', () => {
  for (const value of [
    { total: 2, items: [category, category] }, { total: 1, items: [{ ...category, parentId: childId, childCount: 0 }] },
    { total: 1, items: [{ ...category, parentId: id }] }, { total: 2, items: [{ ...category, childCount: 0 }, { ...category, id: childId, parentId: id, childCount: 0 }] },
    { total: 1, items: [{ ...category, code: 'INVENTED', childCount: 0 }] }, { total: 2, items: [category] },
    { total: 1, items: [{ ...category, childCount: 0, productCount: -1 }] }, { total: 3, items: [category, { ...tree.items[1], parentId: deepId }, { ...tree.items[2], parentId: childId, childCount: 1 }] },
    { total: 3, items: [category, { ...tree.items[1], productCount: 2 }, tree.items[2]] }
  ]) {
    assert.throws(() => validateCatalogueSettingsTree(value), { code: 'CATALOGUE_SETTINGS_INVALID_RESPONSE' });
  }
  assert.throws(() => validateCatalogueSettingsTree({ total: CATALOGUE_SETTINGS_MAX_CATEGORIES + 1, items: [] }), { code: 'CATALOGUE_SETTINGS_READ_TOO_LARGE' });
});
test('page length and total use executed range, explicit out-of-range empty pages do not silently clamp', () => {
  for (const value of [{ page: 1, pageSize: 20, total: 2, items: [entry] }, { page: 2, pageSize: 20, total: 1, items: [entry] }, { page: 1, pageSize: 20, total: 2, items: [entry, entry] }]) assert.throws(() => validateCatalogueSettingsPage(value, query), { code: 'CATALOGUE_SETTINGS_INVALID_RESPONSE' });
  assert.deepEqual(validateCatalogueSettingsPage({ page: 2, pageSize: 20, total: 1, items: [] }, { ...query, page: 2 }).items, []);
});
test('pre-abort, policy abort and late reader abort never publish data or execute later stages', async () => {
  const early = new AbortController(); early.abort(); const f = fixture(); await assert.rejects(() => f.service.readCategories(actor, {}, early.signal), { code: 'CATALOGUE_SETTINGS_READ_ABORTED' }); assert.equal(f.intents.length, 0);
  const policyController = new AbortController(), policy = fixture(async () => { policyController.abort(); return { kind: 'colors', operation: 'list' }; });
  await assert.rejects(() => policy.service.readColors(actor, query, policyController.signal), { code: 'CATALOGUE_SETTINGS_READ_ABORTED' }); assert.equal(policy.reads.length, 0);
  const controller = new AbortController(), late = fixture(); late.dependencies.reader.readCategories = async () => { controller.abort(); return tree; };
  await assert.rejects(() => late.service.readCategories(actor, {}, controller.signal), { code: 'CATALOGUE_SETTINGS_READ_ABORTED' });
});
