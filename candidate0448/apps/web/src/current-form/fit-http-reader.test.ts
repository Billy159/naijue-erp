import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentFormHttpReader } from './http-reader.ts';
const id = '00000000-0000-4000-8000-000000000009', query = { search: 'A', page: 1, pageSize: 20 as const };
test('A fit default reuses the original authenticated fits read API and validates canonical metadata', async () => {
 const calls: { url: string; init: RequestInit }[] = [];
 const reader = createCurrentFormHttpReader({ origin: 'https://erp.example', basePath: '/api', fetch: async (url, init) => { calls.push({ url, init }); return Response.json({ page: 1, pageSize: 20, total: 1, items: [{ id, code: 'A', name: '标准版型', enabled: true, version: 1 }] }); } });
 assert.equal(calls.length, 0); const result = await reader.readFits(query, new AbortController().signal); assert.equal(result.items[0]!.code, 'A');
 assert.equal(calls[0]!.url, 'https://erp.example/api/catalogue-settings-read/fits/query'); assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), query); assert.equal(calls[0]!.init.credentials, 'same-origin');
});
test('invalid fit lookup and aborted lookup send no request', async () => {
 let calls = 0; const reader = createCurrentFormHttpReader({ origin: 'https://erp.example', basePath: '/api', fetch: async () => { calls++; throw Error('unexpected fetch'); } });
 assert.throws(() => reader.readFits({ ...query, actor: 'browser' } as never, new AbortController().signal)); const controller = new AbortController(); controller.abort();
 await assert.rejects(() => reader.readFits(query, controller.signal), { kind: 'aborted' }); assert.equal(calls, 0);
});
