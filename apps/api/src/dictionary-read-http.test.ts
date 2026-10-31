/** SYNTHETIC Fastify injection only. No listener, real session/policy or database. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import Fastify from 'fastify';
import { createDictionaryReadHttpPlugin, type DictionaryReadHttpOptions } from './dictionary-read-http.ts';
import type { DictionaryBarcodeScheme, DictionaryReadAuthorization, DictionaryReadDependencies } from '../../../packages/application/src/dictionary-read-ports.ts';
import { DomainError } from '../../../packages/domain/src/errors.ts';
import { actor, sid } from '../../../tests/support/synthetic-fixtures.ts';
const parameters = { search: '', page: 1, pageSize: 20 }, schemeId = sid('product', 901);
const paths = ['/dictionary-read/size-groups/query', '/dictionary-read/seasons/query', '/dictionary-read/barcode-schemes/query', '/dictionary-read/barcode-scheme/query'] as const;
const scheme = { id: schemeId, name: '2026 only a name', barcodeType: 'STORED TYPE', ruleDescription: 'STORED ORIGINAL RULE', codeLength: null, ruleVersion: 'STORED VERSION', status: 'HISTORICAL' as const, applicability: null };
async function setup(t: TestContext, options: { authenticate?: DictionaryReadHttpOptions['authenticate']; authorize?: DictionaryReadAuthorization['authorize']; failure?: Error; malformed?: boolean; scheme?:DictionaryBarcodeScheme } = {}) {
  let policyCalls = 0, readCalls = 0; const empty = { page: 1, pageSize: 20 as const, total: 0, items: [] }; const check = () => { readCalls++; if (options.failure) throw options.failure; };
  const dependencies: DictionaryReadDependencies = { authorization: { async authorize(a, intent, signal) { policyCalls++; assert.deepEqual(a, actor); assert.ok(signal instanceof AbortSignal); return options.authorize ? options.authorize(a, intent, signal) : { kind: intent.kind, targetId: intent.operation === 'detail' ? intent.parameters.schemeId : null }; } }, reader: {
    async readSizeGroups() { check(); return empty; }, async readSeasons() { check(); return options.malformed ? { ...empty, total: 1 } : empty; }, async readBarcodeSchemes() { check(); return { ...empty, total: 1, items: [scheme] }; }, async readBarcodeScheme() { check(); return options.scheme??scheme; }
  } };
  const app = Fastify({ logger: false }); app.register(createDictionaryReadHttpPlugin({ authenticate: options.authenticate ?? (async () => actor), dependencies })); t.after(() => app.close()); await app.ready();
  return { app, counts: () => ({ policyCalls, readCalls }), post: (url: string, body: unknown) => app.inject({ method: 'POST', url, payload: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) };
}
test('dictionary HTTP exposes four read-only routes, current explicit policy, no-store and native unknowns, without opening a listener', async t => {
  const f = await setup(t); assert.equal(f.app.server.listening, false);
  for (const path of paths) { const response = await f.post(path, path === paths[3] ? { schemeId } : parameters); assert.equal(response.statusCode, 200, response.body); assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(response.headers.pragma, 'no-cache'); if (path === paths[3]) { assert.equal(response.json().codeLength, null); assert.equal(response.json().applicability, null); assert.equal(response.json().status, 'HISTORICAL'); } }
  assert.deepEqual(f.counts(), { policyCalls: 4, readCalls: 4 }); assert.equal(f.app.server.listening, false);
  for (const path of paths) assert.equal((await f.app.inject({ method: 'GET', url: path })).statusCode, 404);
  for (const method of ['PUT', 'PATCH', 'DELETE'] as const) assert.equal((await f.app.inject({ method, url: '/dictionary-read/seasons/query' })).statusCode, 404);
});
test('dictionary HTTP authentication and per-kind/target grants fail closed before native reads, without exposing raw messages', async t => {
  assert.throws(() => createDictionaryReadHttpPlugin({} as never), /explicit trusted authentication/);
  const unauthenticated = await setup(t, { authenticate: async () => null });
  for (const path of paths) assert.equal((await unauthenticated.post(path, path === paths[3] ? { schemeId } : parameters)).statusCode, 401);
  assert.deepEqual(unauthenticated.counts(), { policyCalls: 0, readCalls: 0 });
  for (const authorize of [async () => { throw new DomainError('FORBIDDEN', 'PRIVATE POLICY'); }, async () => ({ kind: 'size-groups' as const, targetId: null })]) {
    const f = await setup(t, { authorize }); const response = await f.post(paths[1], parameters); assert.equal(response.statusCode, 403); assert.ok(!response.body.includes('PRIVATE')); assert.equal(f.counts().readCalls, 0);
  }
  const wrongTarget = await setup(t, { authorize: async () => ({ kind: 'barcode-schemes', targetId: null }) }); assert.equal((await wrongTarget.post(paths[3], { schemeId })).statusCode, 403); assert.equal(wrongTarget.counts().readCalls, 0);
});
test('dictionary HTTP strict JSON/query/body budgets reject client auth, scope and write fields before policy', async t => {
  const f = await setup(t);
  for (const payload of [{ ...parameters, actor }, { ...parameters, role: 'ADMIN' }, { ...parameters, enabled: true }, { ...parameters, grant: { kind: 'seasons' } }, { ...parameters, pageSize: 1000 }, {}, null]) assert.equal((await f.post(paths[1], payload)).statusCode, 400);
  assert.equal((await f.post(`${paths[1]}?role=ADMIN`, parameters)).statusCode, 400);
  assert.equal((await f.app.inject({ method: 'POST', url: paths[1], payload: '{', headers: { 'content-type': 'application/json' } })).statusCode, 400);
  assert.equal((await f.app.inject({ method: 'POST', url: paths[1], payload: 'x', headers: { 'content-type': 'text/plain' } })).statusCode, 415);
  assert.equal((await f.post(paths[1], { ...parameters, search: 'x'.repeat(9000) })).statusCode, 413); assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0 });
});
test('dictionary HTTP sanitizes DB failures and malformed DTOs; no untrusted error/detail facts are serialized', async t => {
  for (const options of [{ failure: new Error('PRIVATE DATABASE SECRET') }, { malformed: true }]) { const f = await setup(t, options), response = await f.post(paths[1], parameters); assert.equal(response.statusCode, 500); assert.equal(response.json().error.code, 'INTERNAL_ERROR'); assert.ok(!response.body.includes('PRIVATE')); }
  for (const [code, status] of [['DICTIONARY_READ_ABORTED', 408], ['DICTIONARY_READ_TOO_LARGE', 413]] as const) { const f = await setup(t, { failure: new DomainError(code, 'PRIVATE') }); assert.equal((await f.post(paths[1], parameters)).statusCode, status); }
});

test('scheme segments are exact opt-in detail only; old/list shapes and authorization remain closed',async t=>{
 const f=await setup(t);
 const post=(url:string,header:string|undefined)=>f.app.inject({method:'POST',url,payload:JSON.stringify(url===paths[3]?{schemeId}:parameters),headers:{'content-type':'application/json',...(header?{'x-naijue-scheme-detail':header}:{})}});
 for(const header of [undefined,'unknown','scheme-segments-v1,unknown'])assert.deepEqual((await post(paths[3],header)).json(),scheme);
 const detail=(await post(paths[3],'scheme-segments-v1')).json();assert.deepEqual(detail,{...scheme,generationRule:{basis:'UNKNOWN',segments:[]}});
 assert.deepEqual((await post(paths[2],'scheme-segments-v1')).json().items,[scheme]);assert.deepEqual(f.counts(),{policyCalls:5,readCalls:5});
 const denied=await setup(t,{authorize:async()=>{throw new DomainError('FORBIDDEN','private');}});const response=await denied.app.inject({method:'POST',url:paths[3],payload:JSON.stringify({schemeId}),headers:{'content-type':'application/json','x-naijue-scheme-detail':'scheme-segments-v1'}});assert.equal(response.statusCode,403);assert.equal(denied.counts().readCalls,0);
});

test('approved current metadata uses the one authorized detail read, no new query',async t=>{const {nativeBarcodeSchemeInitializationRows26}=await import('../../../packages/application/src/native-barcode-import.ts');const n=nativeBarcodeSchemeInitializationRows26().find(x=>x.sourceSchemeKey==='2026')!.native;const current={id:n.id,name:n.name,barcodeType:n.barcode_type,ruleDescription:n.rule_description,codeLength:n.code_length,ruleVersion:n.rule_version,status:n.status,applicability:null};const f=await setup(t,{scheme:current});const legacy=await f.post(paths[3],{schemeId:current.id});assert.deepEqual(legacy.json(),current);const detail=await f.app.inject({method:'POST',url:paths[3],payload:JSON.stringify({schemeId:current.id}),headers:{'content-type':'application/json','x-naijue-scheme-detail':'scheme-segments-v1'}});assert.equal(detail.statusCode,200);assert.equal(detail.json().generationRule.basis,'CURRENT_GENERATION');assert.deepEqual(detail.json().generationRule.segments.map((s:{length:number})=>s.length),[1,1,7,3,3]);assert.deepEqual(f.counts(),{policyCalls:2,readCalls:2});});
