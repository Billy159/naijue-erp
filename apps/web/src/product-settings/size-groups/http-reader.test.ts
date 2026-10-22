/** SYNTHETIC in-memory Fetch responses. No real API/session/backend. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDictionaryHttpReader } from './http-reader.ts';
import type { QueryRead } from '../../loading/latest-query.ts';
import type { DictionaryListQuery } from './contracts.ts';
const id = '00000000-0000-4000-8000-000000000001';
const parameters: DictionaryListQuery = { search: 'literal%_', page: 1, pageSize: 20 };
const read = (): QueryRead<DictionaryListQuery> => ({ parameters, signal: new AbortController().signal, identity: { accountId: 'NONSECRET-MUST-NOT-SEND', permissionRevision: '1', sessionRevision: '1' }, routeInstanceId: 'SYNTHETIC', entityId: null });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
test('dictionary browser transport sends only executed query to same-origin session POST; native unknowns remain null', async () => {
  const requests: { input: string; init: RequestInit }[] = [];
  const reader = createDictionaryHttpReader({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (input, init) => { requests.push({ input, init }); return json({ page: 1, pageSize: 20, total: 1, items: [{ id, name: 'SYNTHETIC GROUP', sizes: [] }] }); } });
  const result = await reader.readSizeGroups(read()); assert.equal(result.items[0]!.id, id); assert.equal(requests[0]!.input, 'https://synthetic.test/api/dictionary-read/size-groups/query'); assert.equal(requests[0]!.init.method, 'POST'); assert.equal(requests[0]!.init.credentials, 'same-origin'); assert.deepEqual(JSON.parse(requests[0]!.init.body as string), parameters); assert.ok(!String(requests[0]!.init.body).includes('NONSECRET'));
});
test('dictionary browser rejects wrong ranges, extra fields, duplicate IDs and invented applicability, never falls back to static arrays', async () => {
  for (const value of [{ page: 2, pageSize: 20, total: 0, items: [] }, { page: 1, pageSize: 20, total: 1, items: [] }, { page: 1, pageSize: 20, total: 0, items: [], extra: 'ignored?' }]) {
    const reader = createDictionaryHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => json(value) }); await assert.rejects(() => reader.readSeasons(read()), { kind: 'malformed-response' });
  }
  const reader = createDictionaryHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => json({ id, name: '2026', barcodeType: 'Code128', ruleDescription: 'stored', codeLength: null, ruleVersion: 'v1', status: 'HISTORICAL', applicability: 'new products from name' }) });
  await assert.rejects(() => reader.readBarcodeScheme({ ...read(), parameters: { schemeId: id } }), { kind: 'malformed-response' });
});
test('dictionary browser permission/unavailable/aborted failures stay typed, sanitized, with no retry', async () => {
  for (const [status, kind] of [[401, 'unauthenticated'], [403, 'forbidden'], [503, 'unavailable']] as const) { let calls = 0; const reader = createDictionaryHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => { calls++; return json({ error: { code: 'PRIVATE CODE', message: 'PRIVATE DETAIL' } }, status); } }); await assert.rejects(() => reader.readSeasons(read()), error => { assert.equal((error as { kind: string }).kind, kind); assert.ok(!String(error).includes('PRIVATE')); return true; }); assert.equal(calls, 1); }
  let calls = 0; const reader = createDictionaryHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => { calls++; return json({}); } }); const controller = new AbortController(); controller.abort(); await assert.rejects(() => reader.readSeasons({ ...read(), signal: controller.signal }), { kind: 'aborted' }); assert.equal(calls, 0);
});
