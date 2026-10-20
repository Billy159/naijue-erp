import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpQueryOptions } from '../../transport/http-query.ts';
import { SalesCommandError } from './contracts.ts';
import { createSalesCommandHttpClient } from './http-client.ts';
import { deferred, flush, json, receipt, result, save, stateCommand, uuid } from './fixtures.test-support.ts';

const signal = () => new AbortController().signal;
const options = (fetch: HttpQueryOptions['fetch'], extra: Partial<HttpQueryOptions> = {}): HttpQueryOptions => ({ origin: 'https://synthetic.test', basePath: '/api', fetch, ...extra });
function failure(kind: SalesCommandError['kind'], outcome: SalesCommandError['outcome'], code?: string, status?: number | null) {
  return (error: unknown) => { assert.ok(error instanceof SalesCommandError); assert.equal(error.kind, kind); assert.equal(error.outcome, outcome); if (code) assert.equal(error.code, code); if (status !== undefined) assert.equal(error.status, status); assert.doesNotMatch(String(error), /secret|private|SQL|token/); return true; };
}
async function controlledClock(work: (advance: (milliseconds: number) => void) => Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(performance, 'now'); let now = 0;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
  try { await work(ms => { now += ms; }); } finally { if (original) Object.defineProperty(performance, 'now', original); else Reflect.deleteProperty(performance, 'now'); }
}

test('command client construction is inert, same-origin exact endpoints retain exact native wire values', async () => {
  const command = save(); const calls: { url: string; init: RequestInit }[] = [];
  const client = createSalesCommandHttpClient(options(async (url, init) => { calls.push({ url, init }); return json(init.method === 'GET' ? receipt(command) : result(command)); }));
  assert.equal(calls.length, 0); assert.deepEqual(await client.execute(command, signal()), result(command));
  assert.deepEqual(await client.receipt(command, signal()), receipt(command)); assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, 'https://synthetic.test/api/sales/commands'); assert.equal(calls[1]?.url, 'https://synthetic.test/api/sales/receipts/TEST.sales%3Aoriginal');
  assert.deepEqual(JSON.parse(calls[0]!.init.body as string), command); assert.equal(calls[1]?.init.body, undefined);
  for (const call of calls) { assert.equal(call.init.credentials, 'same-origin'); assert.equal(call.init.cache, 'no-store'); assert.equal(call.init.redirect, 'error'); assert.equal(call.init.mode, 'same-origin'); }
  assert.equal(calls[0]?.init.method, 'POST'); assert.equal(calls[1]?.init.method, 'GET');
});
test('immutable caller snapshot protects original nested payload, target and CAS through dispatch and validation', async () => {
  const original = save(2), command = structuredClone(original); let body: unknown;
  const client = createSalesCommandHttpClient(options(async (_url, init) => { body = JSON.parse(init.body as string); return json(result(original)); }));
  const write = client.execute(command, signal()); Object.assign(command, { expectedVersion: 99 }); if (command.action === 'SAVE') { Object.assign(command.draft.header, { id: uuid(9) }); Object.assign(command.draft.lines[0]!.snapshot, { barcode: 'MUTATED' }); }
  assert.deepEqual(await write, result(original)); assert.deepEqual(body, original);
});
test('malformed input and oversized UTF-8 draft are rejected before any fetch', async () => {
  let calls = 0; const client = createSalesCommandHttpClient(options(async () => { calls++; return json({}); }));
  await assert.rejects(client.execute({ ...save(), actor: 'private' } as never, signal()), failure('invalid-request', 'not-sent'));
  await assert.rejects(client.receipt({ ...stateCommand(), requestKey: '../private' }, signal()), failure('invalid-request', 'read'));
  const command = save(); assert.equal(command.action, 'SAVE');
  await assert.rejects(client.execute({ ...command, draft: { ...command.draft, header: { ...command.draft.header, note: '中'.repeat(25000) } } }, signal()), failure('invalid-request', 'not-sent', 'REQUEST_TOO_LARGE'));
  assert.equal(calls, 0);
  for (const bad of [{ origin: 'https://other.test/path' }, { origin: 'https://user:password@synthetic.test' }, { origin: 'file:///tmp' }, { basePath: '//other.test' }, { basePath: '/api?actor=secret' }, { timeoutMs: 0 }, { maxResponseBytes: -1 }]) assert.throws(() => createSalesCommandHttpClient(options(async () => json({}), bad)));
});
test('recognized native original 4xx rejection is definitive, sanitized and not retried', async () => {
  for (const [status, code, kind] of [[400, 'INVALID_HTTP_INPUT', 'invalid-request'], [404, 'DOCUMENT_NOT_FOUND', 'not-found'],
    [409, 'VERSION_CONFLICT', 'conflict'], [409, 'HISTORICAL_POSTING_NOT_IMPLEMENTED', 'conflict'], [409, 'PRODUCT_PRICING_UNAVAILABLE', 'conflict'], [409, 'INVENTORY_NOT_READY', 'conflict'],
    [422, 'SETTLEMENT_MISMATCH', 'invalid-request'], [422, 'BELOW_MINIMUM_PRICE', 'invalid-request'], [413, 'BODY_TOO_LARGE', 'invalid-request'], [415, 'UNSUPPORTED_MEDIA_TYPE', 'invalid-request']] as const) {
    let calls = 0; const client = createSalesCommandHttpClient(options(async () => { calls++; return json({ error: { code, message: 'private SQL token secret' } }, status); }));
    await assert.rejects(client.execute(save(), signal()), failure(kind, 'rejected', code, status)); assert.equal(calls, 1);
  }
});
test('receipt404 is a read absence and never a definitive command outcome', async () => {
  let calls = 0; const client = createSalesCommandHttpClient(options(async () => { calls++; return json({ error: { code: 'RECEIPT_NOT_FOUND', message: 'private' } }, 404); }));
  await assert.rejects(client.receipt(save(), signal()), failure('not-found', 'read', 'RECEIPT_NOT_FOUND', 404)); assert.equal(calls, 1);
});
test('unknown, malformed or wrong-status errors and 5xx cannot prove non-commit', async () => {
  for (const body of [{ error: { code: 'VERSION_CONFLICT', message: 'private', detail: 'secret' } }, { error: { code: 'FORBIDDEN', message: 'private' } }, { error: { code: 'NEW_ERROR', message: 'private' } }, { error: { code: 'VERSION_CONFLICT', message: 1 } }, null]) {
    const client = createSalesCommandHttpClient(options(async () => json(body, 409)));
    await assert.rejects(client.execute(save(), signal()), failure('malformed-response', 'uncertain', 'INVALID_ERROR_RESPONSE', 409));
  }
  const server = createSalesCommandHttpClient(options(async () => json({ error: { code: 'INTERNAL_ERROR', message: 'private' } }, 500)));
  await assert.rejects(server.execute(save(), signal()), failure('server', 'uncertain', 'INTERNAL_ERROR', 500));
  for (const [status, kind] of [[401, 'unauthenticated'], [403, 'forbidden']] as const) {
    const html = createSalesCommandHttpClient(options(async () => new Response('<html>private secret</html>', { status })));
    await assert.rejects(html.execute(save(), signal()), failure(kind, 'uncertain', undefined, status));
  }
});
test('network errors are uncertain once dispatched, safe and never automatically retried', async () => {
  let calls = 0; const client = createSalesCommandHttpClient(options(async () => { calls++; throw new Error('private secret token'); }));
  await assert.rejects(client.execute(save(), signal()), failure('network', 'uncertain', 'NETWORK_ERROR', null));
  await assert.rejects(client.receipt(save(), signal()), failure('network', 'read', 'NETWORK_ERROR', null)); assert.equal(calls, 2);
});
test('pre-abort/same-turn abort do not dispatch; abort after dispatch detaches an ignored fetch without claiming rollback', async () => {
  let calls = 0; const pending = deferred<Response>(); const client = createSalesCommandHttpClient(options(async () => { calls++; return pending.promise; }));
  const before = new AbortController(); before.abort('secret'); await assert.rejects(client.execute(save(), before.signal), failure('aborted', 'not-sent'));
  const immediate = new AbortController(); const noSend = client.execute(save(), immediate.signal); immediate.abort(); await assert.rejects(noSend, failure('aborted', 'not-sent')); assert.equal(calls, 0);
  const during = new AbortController(); const write = client.execute(save(), during.signal); await flush(); during.abort();
  await assert.rejects(write, failure('aborted', 'uncertain')); assert.equal(calls, 1); pending.reject(new Error('private late secret')); await flush();
});
test('timeout consumes late fetch and cancels late body; monotonic checks prevent expired microtask success', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  await controlledClock(async advance => {
    const pending = deferred<Response>(), dispatched = deferred<void>(); let cancelled = 0;
    const client = createSalesCommandHttpClient(options(async () => { dispatched.resolve(); return pending.promise; }, { timeoutMs: 10 }));
    const timeout = assert.rejects(client.execute(save(), signal()), failure('timeout', 'uncertain'));
    await dispatched.promise; advance(10); context.mock.timers.tick(10); await timeout;
    pending.resolve(new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled++; } }), { headers: { 'Content-Type': 'application/json' } })); await flush(); assert.equal(cancelled, 1);
  });
  await controlledClock(async advance => {
    const command = save(); const client = createSalesCommandHttpClient(options(async () => { advance(10); return json(result(command)); }, { timeoutMs: 10 }));
    await assert.rejects(client.execute(command, signal()), failure('timeout', 'uncertain'));
  });
});
test('stream timeout is bounded and cannot publish valid JSON after deadline', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  await controlledClock(async advance => {
    const ready = deferred<void>(); let source!: ReadableStreamDefaultController<Uint8Array>;
    const client = createSalesCommandHttpClient(options(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { source = controller; ready.resolve(); } }), { headers: { 'Content-Type': 'application/json' } }), { timeoutMs: 10 }));
    const pending = assert.rejects(client.execute(save(), signal()), failure('timeout', 'uncertain')); await ready.promise; await flush(); advance(10); context.mock.timers.tick(10); await pending;
    assert.throws(() => source.enqueue(new Uint8Array([1])));
  });
});
test('malformed/oversized/redirected/wrong-target successes stay uncertain, never fake empty results', async () => {
  const command = save();
  const cases = [new Response('private secret', { headers: { 'Content-Type': 'text/html' } }), new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    json({ ...result(command), salesId: uuid(9) }), json({ ...result(command), version: 3 }), json({ ...result(command), ledgerEntryIds: [uuid(3)] }),
    new Response(new Uint8Array([0xff]), { headers: { 'Content-Type': 'application/json' } }), new Response(null, { status: 204 }),
    new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '10000000' } })];
  for (const response of cases) {
    const client = createSalesCommandHttpClient(options(async () => response)); await assert.rejects(client.execute(command, signal()), failure('malformed-response', 'uncertain'));
  }
  const redirect = json(result(command)); Object.defineProperty(redirect, 'url', { value: 'https://other.test/private' });
  await assert.rejects(createSalesCommandHttpClient(options(async () => redirect)).execute(command, signal()), failure('malformed-response', 'uncertain', 'UNEXPECTED_REDIRECT'));
  await assert.rejects(createSalesCommandHttpClient(options(async () => json(result(command)), { maxResponseBytes: 8 })).execute(command, signal()), failure('malformed-response', 'uncertain', 'RESPONSE_TOO_LARGE'));
});

test('receipt-only error code cannot prove command rejection; dot-segment keys fail closed before dispatch', async () => {
  let calls = 0; const client = createSalesCommandHttpClient(options(async () => { calls++; return json({ error: { code: 'RECEIPT_NOT_FOUND', message: 'private' } }, 404); }));
  await assert.rejects(client.execute(save(), signal()), failure('malformed-response', 'uncertain', 'INVALID_ERROR_RESPONSE', 404));
  assert.equal(calls, 1);
  for (const requestKey of ['.', '..']) {
    await assert.rejects(client.execute({ ...save(), requestKey }, signal()), failure('invalid-request', 'not-sent'));
    await assert.rejects(client.receipt({ ...save(), requestKey }, signal()), failure('invalid-request', 'read'));
  }
  assert.equal(calls, 1);
});

test('observed 401/403 fails immediately and cancels any body without awaiting timeout or claiming non-commit', async () => {
  for (const status of [401, 403]) {
    for (const mode of ['stalled', 'malformed', 'oversized', 'valid'] as const) {
      let cancelled = 0, pulled = 0;
      const response = mode === 'stalled' ? new Response(new ReadableStream<Uint8Array>({ pull() { pulled++; }, cancel() { cancelled++; } }), { status, headers: { 'Content-Type': 'application/json' } })
        : mode === 'malformed' ? new Response('{private', { status, headers: { 'Content-Type': 'application/json' } })
          : mode === 'oversized' ? new Response('private', { status, headers: { 'Content-Type': 'application/json', 'Content-Length': '100000000' } })
            : json({ error: { code: status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', message: 'private' } }, status);
      const client = createSalesCommandHttpClient(options(async () => response, { timeoutMs: 1000 }));
      const write = client.execute(save(), signal()); await flush();
      await assert.rejects(write, failure(status === 401 ? 'unauthenticated' : 'forbidden', 'uncertain', status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', status));
      if (mode === 'stalled') { assert.equal(cancelled, 1); assert.ok(pulled <= 1); }
    }
  }
});
