import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createCurrentFormHttpPlugin } from './current-form-http.ts';
import type { CurrentFormHttpOptions } from './current-form-http.ts';
import type { CurrentFormReader } from '../../../packages/application/src/current-form-ports.ts';
import type { ActorContext } from '../../../packages/application/src/ports.ts';
import { entityId } from '../../../packages/domain/src/values.ts';
import { DomainError } from '../../../packages/domain/src/errors.ts';
const id = '00000000-0000-4000-8000-000000000001';
const actor: ActorContext = { accountId: entityId('account', id), hallId: null };
const routes = [
 ['/current-form/sales-references/query', { kind: 'hall', hallId: null, search: '', page: 1, pageSize: 20 }],
 ['/current-form/transfer-warehouses/query', { direction: 'FROM', search: '', page: 1, pageSize: 20 }],
 ['/current-form/products/query', { context: { kind: 'TRANSFER' }, search: '', page: 1, pageSize: 20 }],
 ['/current-form/product-skus/query', { context: { kind: 'TRANSFER' }, productId: id, page: 1, pageSize: 20 }],
 ['/current-form/sku-batch/query', { context: { kind: 'TRANSFER' }, skuIds: [id] }]
] as const;
async function setup(t: TestContext, options: { authenticate?: CurrentFormHttpOptions['authenticate']; failure?: Error; abortPhase?: "BEFORE" | "DURING" } = {}) {
 let abortCurrent: (() => void) | undefined;
 const calls: { actor: ActorContext; body: unknown; signal: AbortSignal }[] = [];
 const page = { page: 1, pageSize: 20 as const, exactTotal: 9007199254740993n, items: [] };
 const read = async (a: ActorContext, body: unknown, signal: AbortSignal) => {
  calls.push({ actor: a, body, signal }); if (options.abortPhase === "DURING") abortCurrent?.(); if (options.failure) throw options.failure; return page;
 };
 const reader: CurrentFormReader = { readSalesReferences: read, readTransferWarehouses: read, readProducts: read, readProductSkus: read,
  async readSkuBatch(a, b, s) { await read(a, b, s); return []; } };
 const app = Fastify({ logger: false });
 app.addHook('onRequest', async request => { abortCurrent = () => { request.raw.emit('aborted'); }; });
 app.addHook('preHandler', async () => { if (options.abortPhase === "BEFORE") abortCurrent?.(); });
 app.register(createCurrentFormHttpPlugin({ reader, authenticate: options.authenticate ?? (async () => actor) }));
 t.after(() => app.close()); await app.ready();
 return { app, calls, reader, post: (url: string, body: unknown) => app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload: JSON.stringify(body) }) };
}
test('CURRENT form HTTP: five strict read routes, exact totals, captured actor and no listener', async t => {
 const f = await setup(t);
 for (const [url, body] of routes) {
  const response = await f.post(url, body); assert.equal(response.statusCode, 200, response.body);
  if (!url.includes('sku-batch')) assert.equal(response.json().exactTotal, '9007199254740993');
  assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(response.headers.pragma, 'no-cache');
 }
 assert.equal(f.calls.length, 5); assert.equal(f.app.server.listening, false);
 for (const call of f.calls) { assert.deepEqual(call.actor, actor); assert.ok(Object.isFrozen(call.actor)); assert.equal(call.signal.aborted, false); }
});
test('CURRENT form HTTP: client actor, scope and invalid query fail before provider', async t => {
 const f = await setup(t);
 for (const [url, body] of routes) {
  for (const invalid of [null, {}, { ...body, actor }, { ...body, scope: 'all' }]) assert.equal((await f.post(url, invalid)).statusCode, 400);
  assert.equal((await f.post(url + '?role=ADMIN', body)).statusCode, 400);
 }
 assert.equal(f.calls.length, 0);
});
test('CURRENT form HTTP: selected method mandatory only for account lookup', async t => {
 const f = await setup(t); const url = routes[0][0];
 const query = { kind: 'paymentAccount', hallId: id, search: '', page: 1, pageSize: 20 };
 assert.equal((await f.post(url, query)).statusCode, 400);
 assert.equal((await f.post(url, { ...query, paymentMethodId: id })).statusCode, 200);
 assert.equal((await f.post(url, { ...query, kind: 'customer', paymentMethodId: id })).statusCode, 400);
 assert.equal(f.calls.length, 1);
});
test('CURRENT form HTTP: authentication must precede reader and malformed trusted facts fail closed', async t => {
 const f = await setup(t, { authenticate: async () => null });
 for (const [url, body] of routes) assert.equal((await f.post(url, body)).statusCode, 401);
 assert.equal(f.calls.length, 0);
 for (const authenticate of [async () => ({ accountId: 'fake', hallId: null }) as never, async () => { throw new Error('PRIVATE SECRET'); }]) {
  const g = await setup(t, { authenticate }); const r = await g.post(...routes[0]); assert.equal(r.statusCode, 500); assert.ok(!r.body.includes('PRIVATE')); assert.equal(g.calls.length, 0);
 }
 assert.throws(() => createCurrentFormHttpPlugin({} as CurrentFormHttpOptions), /explicit trusted authentication/);
 assert.throws(() => createCurrentFormHttpPlugin({ authenticate: async () => actor } as CurrentFormHttpOptions), /explicit trusted reader/);
});
test('CURRENT form HTTP: captured reader cannot be replaced after construction', async t => {
 const f = await setup(t); f.reader.readSalesReferences = async () => { throw new Error('REPLACED'); };
 assert.equal((await f.post(...routes[0])).statusCode, 200); assert.equal(f.calls.length, 1);
});
test('CURRENT form HTTP: safe domain statuses and hidden internal diagnostics', async t => {
 for (const [error, status] of [[new DomainError('FORBIDDEN', 'PRIVATE SQL'), 403], [new DomainError('CURRENT_FORM_READ_ABORTED', 'PRIVATE SQL'), 408], [new DomainError('SKU_UNAVAILABLE', 'PRIVATE SKU ID'), 409],
  [new Error('PRIVATE SQL'), 500], [new DomainError('UNEXPECTED', 'PRIVATE SQL'), 500]] as const) {
  const f = await setup(t, { failure: error }); const r = await f.post(...routes[0]); assert.equal(r.statusCode, status); assert.ok(!r.body.includes('PRIVATE'));
 }
});
test('CURRENT form HTTP: bounded body, JSON media and malformed payload', async t => {
 const f = await setup(t); const url = routes[0][0];
 assert.equal((await f.app.inject({ method: 'POST', url, payload: '{', headers: { 'content-type': 'application/json' } })).statusCode, 400);
 assert.equal((await f.app.inject({ method: 'POST', url, payload: '{}', headers: { 'content-type': 'text/plain' } })).statusCode, 415);
 assert.equal((await f.post(url, { value: 'x'.repeat(70000) })).statusCode, 413);
 assert.equal(f.calls.length, 0);
});

test('CURRENT form HTTP: injected raw abort event cancels before provider and rejects late results', async t => {
 for (const phase of ['BEFORE', 'DURING'] as const) {
  const f = await setup(t, { abortPhase: phase }); const response = await f.post(...routes[0]);
  assert.equal(response.statusCode, 408); assert.equal(f.calls.length, phase === 'BEFORE' ? 0 : 1);
  if (phase === 'DURING') assert.equal(f.calls[0]!.signal.aborted, true);
 }
});
test('CURRENT form HTTP: pending injected disconnect forwards cancellation and cleans listeners', async t => {
 const app = Fastify({ logger: false }); t.after(() => app.close());
 let raw: import('node:http').IncomingMessage | undefined; let forwarded: AbortSignal | undefined;
 let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
 let reading!: () => void; const entered = new Promise<void>(resolve => { reading = resolve; });
 const read = async (_a: ActorContext, _b: unknown, signal: AbortSignal) => { forwarded = signal; reading(); await gate; return { page: 1, pageSize: 20 as const, exactTotal: 0n, items: [] }; };
 const reader: CurrentFormReader = { readSalesReferences: read, readTransferWarehouses: read, readProducts: read, readProductSkus: read, async readSkuBatch() { return []; } };
 app.addHook('onRequest', async request => { raw = request.raw; });
 app.register(createCurrentFormHttpPlugin({ reader, authenticate: async () => actor })); await app.ready();
 const pending = app.inject({ method: 'POST', url: routes[0][0], payload: routes[0][1] }); await entered;
 assert.ok(raw); assert.ok(forwarded); const listeners = raw.listenerCount('aborted'); raw.emit('aborted');
 assert.equal(forwarded.aborted, true); release(); const response = await pending;
 assert.equal(response.statusCode, 408); assert.equal(raw.listenerCount('aborted'), listeners - 1); assert.equal(app.server.listening, false);
});
