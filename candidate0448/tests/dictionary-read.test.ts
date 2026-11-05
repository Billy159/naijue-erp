/** SYNTHETIC unit contracts; no real identities, database or policy is exercised. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDictionaryReadService } from '../packages/application/src/dictionary-read-service.ts';
import { parseDictionaryListQuery, validateDictionaryPage, validateDictionarySizeGroup } from '../packages/application/src/dictionary-read-validation.ts';
import type { DictionaryReadAuthorization, DictionaryReadDependencies, DictionaryScopedRead } from '../packages/application/src/dictionary-read-ports.ts';
import { actor, sid } from './support/synthetic-fixtures.ts';
const groupId = sid('sizeGroup', 701), size1 = sid('size', 702), size2 = sid('size', 703), schemeId = sid('product', 704);
const parameters = { search: '', page: 1, pageSize: 20 as const };
const group = { id: groupId, name: 'SYNTHETIC GROUP', sizes: [{ id: size1, name: '同名尺码', displayOrder: 1 }, { id: size2, name: '同名尺码', displayOrder: 2 }] };
const scheme = { id: schemeId, name: '2026 is only a name', barcodeType: 'Code128', ruleDescription: 'STORED ORIGINAL RULE', codeLength: null, ruleVersion: 'SYNTHETIC-v1', status: 'HISTORICAL' as const, applicability: null };
function setup(authorize?: DictionaryReadAuthorization['authorize']) {
  const reads: DictionaryScopedRead[] = [], grants: DictionaryScopedRead['intent'][] = [];
  const page = (read: DictionaryScopedRead, items: unknown[]) => { reads.push(read); if (read.intent.operation !== 'list') throw new Error(); return { page: read.intent.parameters.page, pageSize: read.intent.parameters.pageSize, total: items.length, items }; };
  const dependencies: DictionaryReadDependencies = { authorization: { async authorize(a, intent, signal) { grants.push(intent); assert.deepEqual(a, actor); assert.ok(signal instanceof AbortSignal); return authorize ? authorize(a, intent, signal) : { kind: intent.kind, targetId: intent.operation === 'detail' ? intent.parameters.schemeId : null }; } }, reader: {
    async readSizeGroups(read) { return page(read, [group]) as never; }, async readSeasons(read) { return page(read, []) as never; }, async readBarcodeSchemes(read) { return page(read, [scheme]) as never; }, async readBarcodeScheme(read) { reads.push(read); return scheme; }
  } }; return { dependencies, service: createDictionaryReadService(dependencies), reads, grants };
}
const signal = () => new AbortController().signal;
test('dictionary service requires explicit auth/reader; kind and exact target grants never inherit transaction candidate access', async () => {
  assert.throws(() => createDictionaryReadService({} as never), /explicit trusted/);
  for (const authorize of [async () => ({ kind: 'seasons' as const, targetId: null }), async () => ({ kind: 'size-groups' as const, targetId: schemeId })]) {
    const f = setup(authorize); await assert.rejects(async () => f.service.readSizeGroups(actor, parameters, signal()), { code: 'FORBIDDEN' }); assert.equal(f.reads.length, 0);
  }
  const f = setup(); const result = await f.service.readSizeGroups(actor, parameters, signal()); assert.equal(result.items[0]!.sizes.length, 2); assert.equal(result.items[0]!.sizes[0]!.name, result.items[0]!.sizes[1]!.name); assert.notEqual(result.items[0]!.sizes[0]!.id, result.items[0]!.sizes[1]!.id);
  assert.deepEqual(await f.service.readSeasons(actor, parameters, signal()), { items: [], total: 0, page: 1, pageSize: 20 });
});
test('dictionary list validation rejects client roles/scope/write fields, bad paging and unsafe identity before authorization', async () => {
  const f = setup();
  for (const input of [{ ...parameters, actor }, { ...parameters, kind: 'seasons' }, { ...parameters, role: 'ADMIN' }, { ...parameters, enabled: true }, { ...parameters, search: '\u0000' }, { ...parameters, search: 'x'.repeat(201) }, { ...parameters, page: 0 }, { ...parameters, page: Number.MAX_SAFE_INTEGER }, { ...parameters, pageSize: 30 }, {}, null]) await assert.rejects(async () => f.service.readSizeGroups(actor, input, signal()), { code: 'INVALID_DICTIONARY_QUERY' });
  await assert.rejects(async () => f.service.readBarcodeScheme(actor, { schemeId: 'not-uuid' }, signal()), { code: 'INVALID_DICTIONARY_QUERY' }); assert.equal(f.grants.length, 0);
  await assert.rejects(async () => f.service.readSeasons({ accountId: 'fake', hallId: null } as never, parameters, signal()), /Invalid trusted dictionary actor/); assert.equal(f.grants.length, 0);
  assert.equal(parseDictionaryListQuery({ ...parameters, search: '100%_\\原值' }).search, '100%_\\原值');
});
test('dictionary scheme uses stored type/rule/nulls/status, never derives prefix/length/applicability from its name', async () => {
  const f = setup(); assert.deepEqual((await f.service.readBarcodeSchemes(actor, parameters, signal())).items, [scheme]);
  assert.deepEqual(await f.service.readBarcodeScheme(actor, { schemeId }, signal()), scheme); assert.deepEqual(f.reads[1]!.grant, { kind: 'barcode-schemes', targetId: schemeId });
  await assert.rejects(async () => f.service.readBarcodeScheme(actor, { schemeId: sid('product', 999) }, signal()), /Mismatched trusted dictionary scheme target/);
});
test('dictionary response validation rejects partial/truncated pages, duplicate identities and unordered or too-large member sets', () => {
  for (const value of [{ page: 1, pageSize: 20, total: 2, items: [group] }, { page: 2, pageSize: 20, total: 1, items: [group] }, { page: 1, pageSize: 20, total: 2, items: [group, group] }]) assert.throws(() => validateDictionaryPage(value, parameters, validateDictionarySizeGroup), { code: 'INVALID_DICTIONARY_RESPONSE' });
  for (const sizes of [[group.sizes[0], group.sizes[0]], [...group.sizes].reverse(), Array.from({ length: 1001 }, () => group.sizes[0])]) assert.throws(() => validateDictionarySizeGroup({ ...group, sizes }), { code: 'INVALID_DICTIONARY_RESPONSE' });
  assert.deepEqual(validateDictionaryPage({ page: 2, pageSize: 20, total: 1, items: [] }, { ...parameters, page: 2 }, validateDictionarySizeGroup).items, []);
});
test('dictionary cancellation before authorization and after awaited policy/read cannot publish any facts', async () => {
  const early = new AbortController(); early.abort(); const f = setup(); await assert.rejects(async () => f.service.readSeasons(actor, parameters, early.signal), { code: 'DICTIONARY_READ_ABORTED' }); assert.equal(f.grants.length, 0);
  const controller = new AbortController(); const policy = setup(async (_a, intent) => { controller.abort(); return { kind: intent.kind, targetId: null }; }); await assert.rejects(async () => policy.service.readSeasons(actor, parameters, controller.signal), { code: 'DICTIONARY_READ_ABORTED' }); assert.equal(policy.reads.length, 0);
  const last = new AbortController(), g = setup(); g.dependencies.reader.readSeasons = async () => { last.abort(); return { page: 1, pageSize: 20, total: 0, items: [] }; }; await assert.rejects(async () => g.service.readSeasons(actor, parameters, last.signal), { code: 'DICTIONARY_READ_ABORTED' });
});
