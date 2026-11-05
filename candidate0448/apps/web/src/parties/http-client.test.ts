import assert from 'node:assert/strict';
import test from 'node:test';
import { PartyClientError, type PartyCommand, type PartyKind, type PartySearch } from './contracts.ts';
import { createPartyHttpClient, type HttpQueryOptions } from './http-client.ts';

const origin = 'https://erp.example.test';
const id = '00000000-0000-4000-8000-000000000001';
const operationId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
const row = { id, code: '原始 KH-02', name: ' 原始名称 ', enabled: true, version: 7, createdAt: null, updatedAt: null };
const query: PartySearch = { search: '原始 &+ 名称', enabled: 'ALL', page: 1, pageSize: 20 };
const command: PartyCommand = { action: 'EDIT', requestKey: 'synthetic:edit.1', id, expectedVersion: 7, name: ' 新名称 ', enabled: true };
const signal = () => new AbortController().signal;
function result(kind: PartyKind = 'CUSTOMER') { return { operationId, kind, partyId: id, version: 8, code: row.code, enabled: true }; }
function createResult(kind: PartyKind = 'CUSTOMER') { return { ...result(kind), version: 1, code: kind === 'CUSTOMER' ? 'KH000001' : 'GYS000001' }; }
function receipt(kind: PartyKind = 'CUSTOMER', requestKey = command.requestKey) { return { requestKey, action: 'EDIT', status: 'COMMITTED', completedAt: '2026-10-20T01:02:03.000Z', result: result(kind) }; }
function json(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } }); }
function options(fetch: HttpQueryOptions['fetch'], extra: Partial<HttpQueryOptions> = {}): HttpQueryOptions { return { origin, basePath: '/api', fetch, ...extra }; }
function failure(kind: PartyClientError['kind'], outcome: PartyClientError['outcome'], code?: string, status?: number | null): (value: unknown) => boolean {
  return value => {
    assert.ok(value instanceof PartyClientError); assert.equal(value.kind, kind); assert.equal(value.outcome, outcome);
    if (code !== undefined) assert.equal(value.code, code); if (status !== undefined) assert.equal(value.status, status);
    assert.equal(value.cause, undefined); assert.doesNotMatch(String(value), /private|secret|token|SQL/); return true;
  };
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function flush(): Promise<void> { await new Promise<void>(resolve => setImmediate(resolve)); }
/** These top-level tests are nonconcurrent. Control the monotonic clock without
 * recording hundreds of thousands of mock calls in the chunk-bound fixture. */
async function withControlledClock(work: (advance: (milliseconds: number) => void) => Promise<void>): Promise<void> {
  const previous = Object.getOwnPropertyDescriptor(performance, 'now');
  let now = 1000;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
  try { await work(milliseconds => { now += milliseconds; }); }
  finally {
    if (previous) Object.defineProperty(performance, 'now', previous);
    else Reflect.deleteProperty(performance, 'now');
  }
}

test('party construction is inert and each read uses its exact native GET route with bounded same-origin session options', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createPartyHttpClient(options(async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/candidates?')) return json({ items: [{ id, code: row.code, name: row.name }], total: 1, page: 1, pageSize: 20 });
    if (url.includes('/receipts/')) return json(receipt('SUPPLIER', 'synthetic:key.1'));
    if (url.includes('?')) return json({ items: [row], total: 1, page: 1, pageSize: 20 });
    return json(row);
  }));
  assert.equal(calls.length, 0);
  assert.deepEqual(await client.list('CUSTOMER', query, signal()), { items: [row], total: 1, page: 1, pageSize: 20 });
  assert.equal((await client.detail('SUPPLIER', id, signal())).createdAt, null);
  assert.deepEqual((await client.candidates('CUSTOMER', { search: '原始 &+', page: 1, pageSize: 20 }, signal())).items, [{ id, code: row.code, name: row.name }]);
  assert.deepEqual(await client.receipt('SUPPLIER', 'synthetic:key.1', signal()), receipt('SUPPLIER', 'synthetic:key.1'));
  assert.deepEqual(calls.map(call => call.url), [
    `${origin}/api/customers?search=%E5%8E%9F%E5%A7%8B+%26%2B+%E5%90%8D%E7%A7%B0&enabled=ALL&page=1&pageSize=20`,
    `${origin}/api/suppliers/${id}`, `${origin}/api/customers/candidates?search=%E5%8E%9F%E5%A7%8B+%26%2B&page=1&pageSize=20`,
    `${origin}/api/suppliers/receipts/synthetic%3Akey.1`,
  ]);
  for (const { init } of calls) {
    assert.equal(init.method, 'GET'); assert.equal(init.mode, 'same-origin'); assert.equal(init.credentials, 'same-origin');
    assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error'); assert.equal(init.body, undefined);
    assert.deepEqual(init.headers, { Accept: 'application/json' }); assert.ok(init.signal instanceof AbortSignal);
  }
});

test('all four actions POST exact command DTOs to independent families without actor, kind, code or retries', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createPartyHttpClient(options(async (url, init) => {
    calls.push({ url, init }); const body = JSON.parse(init.body as string) as PartyCommand;
    const kind = url.includes('/suppliers/') ? 'SUPPLIER' : 'CUSTOMER';
    return json(body.action === 'CREATE' ? createResult(kind) : { ...result(kind), enabled: body.action === 'EDIT' ? body.enabled : body.action !== 'DISABLE' });
  }));
  const commands: PartyCommand[] = [{ action: 'CREATE', requestKey: 'synthetic:create', name: ' 新供应商 ' }, command,
    { action: 'DISABLE', requestKey: 'synthetic:disable', id, expectedVersion: 7 }, { action: 'RESTORE', requestKey: 'synthetic:restore', id, expectedVersion: 7 }];
  for (const [index, input] of commands.entries()) await client.execute(index % 2 === 0 ? 'SUPPLIER' : 'CUSTOMER', input, signal());
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map(call => JSON.parse(call.init.body as string)), commands);
  assert.deepEqual(Object.keys(JSON.parse(calls[1]!.init.body as string)), ['action', 'requestKey', 'id', 'expectedVersion', 'name', 'enabled']);
  assert.deepEqual(calls.map(call => call.url), [`${origin}/api/suppliers/commands`, `${origin}/api/customers/commands`, `${origin}/api/suppliers/commands`, `${origin}/api/customers/commands`]);
  for (const { init } of calls) { assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.mode, 'same-origin');
    assert.deepEqual(init.headers, { Accept: 'application/json', 'Content-Type': 'application/json' }); }
});

test('EDIT atomically sends name and required enabled state and requires that exact state in the committed result', async () => {
  for (const kind of ['CUSTOMER', 'SUPPLIER'] as const) {
    const input: PartyCommand = { action: 'EDIT', requestKey: `synthetic:rename-disable:${kind}`, id, expectedVersion: 7, name: ' 同时改名并停用 ', enabled: false };
    const calls: { url: string; body: unknown }[] = [];
    const client = createPartyHttpClient(options(async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body as string) }); return json({ ...result(kind), enabled: false });
    }));
    assert.deepEqual(await client.execute(kind, input, signal()), { ...result(kind), enabled: false });
    assert.deepEqual(calls, [{ url: `${origin}/api/${kind === 'CUSTOMER' ? 'customers' : 'suppliers'}/commands`, body: input }]);
    const mismatched = createPartyHttpClient(options(async () => json(result(kind))));
    await assert.rejects(mismatched.execute(kind, input, signal()), failure('malformed-response', 'uncertain', 'INVALID_RESPONSE', 200));
  }
});

test('configuration rejects absolute/ambiguous prefixes, credentials and invalid resource bounds without sending', () => {
  let calls = 0; const fetch: HttpQueryOptions['fetch'] = async () => { calls++; return json(null); };
  for (const basePath of ['//other.example', 'https://other.example', '/api/../escape', '/api\\escape', '/api?x=1', '/api#hash', '/%2fescape', '/api//x', '/api x']) {
    assert.throws(() => createPartyHttpClient(options(fetch, { basePath })), TypeError);
  }
  for (const bad of [`${origin}/`, `${origin}/path`, 'https://u:p@erp.example.test', 'null', 'data:text/plain,x']) assert.throws(() => createPartyHttpClient(options(fetch, { origin: bad })), TypeError);
  for (const value of [0, -1, NaN, Infinity, 1.5]) { assert.throws(() => createPartyHttpClient(options(fetch, { timeoutMs: value })), TypeError); assert.throws(() => createPartyHttpClient(options(fetch, { maxResponseBytes: value })), TypeError); }
  assert.throws(() => createPartyHttpClient(options(fetch, { timeoutMs: 120_001 })), TypeError);
  assert.throws(() => createPartyHttpClient(options(fetch, { maxResponseBytes: 32 * 1024 * 1024 + 1 })), TypeError);
  for (const basePath of ['', '/', '/api/', '/erp-v1/read_only']) assert.doesNotThrow(() => createPartyHttpClient(options(fetch, { basePath })));
  assert.equal(calls, 0);
});

test('invalid kind, exact-key DTOs, identifiers, query values and oversized UTF-8 body all fail before dispatch', async () => {
  let calls = 0; const client = createPartyHttpClient(options(async () => { calls++; return json(result()); }));
  for (const bad of [{ ...command, actor: { role: 'ADMIN' } }, { ...command, code: 'KH000001' }, { ...command, kind: 'CUSTOMER' },
    { ...command, usage: 'extra' }, { ...command, expectedVersion: 0 }, { ...command, expectedVersion: 2147483648 },
    { ...command, id: '../customers' }, { ...command, requestKey: 'bad/key' }, { ...command, name: ' ' },
    { action: 'EDIT', requestKey: command.requestKey, id, expectedVersion: 7, name: command.name },
    { ...command, enabled: undefined }, { ...command, enabled: null }, { ...command, enabled: 'false' }, { ...command, enabled: 0 },
    Object.assign(Object.create({ kind: 'CUSTOMER' }) as object, command)]) {
    await assert.rejects(client.execute('CUSTOMER', bad as PartyCommand, signal()), failure('invalid-request', 'not-sent', 'INVALID_PARTY_INPUT', null));
  }
  await assert.rejects(client.execute('CUSTOMER', { action: 'CREATE', requestKey: 'synthetic:large', name: '😀'.repeat(1024) + '界'.repeat(1024) }, signal()), failure('invalid-request', 'not-sent'));
  // JSON escaping can make a valid 2048-code-unit name exceed the 8192-byte wire bound.
  await assert.rejects(client.execute('CUSTOMER', { action: 'CREATE', requestKey: 'x'.repeat(200), name: '\u0001'.repeat(2048) }, signal()), failure('invalid-request', 'not-sent', 'REQUEST_TOO_LARGE'));
  for (const bad of [{ ...query, enabled: 'TRUE' }, { ...query, page: 0 }, { ...query, pageSize: 10 }, { ...query, search: 'x'.repeat(201) }, { ...query, actor: 'x' }]) {
    await assert.rejects(client.list('CUSTOMER', bad as PartySearch, signal()), failure('invalid-request', 'read'));
  }
  await assert.rejects(client.candidates('CUSTOMER', { search: '', page: 1, pageSize: 20, enabled: 'ALL' } as never, signal()), failure('invalid-request', 'read'));
  await assert.rejects(client.detail('CUSTOMER', '../suppliers', signal()), failure('invalid-request', 'read'));
  await assert.rejects(client.receipt('CUSTOMER', 'bad/key', signal()), failure('invalid-request', 'read'));
  await assert.rejects(client.execute('UNKNOWN' as PartyKind, command, signal()), failure('invalid-request', 'not-sent'));
  await assert.rejects(client.list('UNKNOWN' as PartyKind, query, signal()), failure('invalid-request', 'read'));
  await assert.rejects(client.detail('UNKNOWN' as PartyKind, id, signal()), failure('invalid-request', 'read'));
  await assert.rejects(client.candidates('UNKNOWN' as PartyKind, { search: '', page: 1, pageSize: 20 }, signal()), failure('invalid-request', 'read'));
  await assert.rejects(client.receipt('UNKNOWN' as PartyKind, command.requestKey, signal()), failure('invalid-request', 'read'));
  assert.equal(calls, 0);
});

test('caller mutations after invocation cannot change dispatch or expected response validation', async () => {
  const input = { ...command }; const parameters = { ...query };
  const calls: { url: string; body: unknown }[] = [];
  const client = createPartyHttpClient(options(async (url, init) => { calls.push({ url, body: init.body ? JSON.parse(init.body as string) : null });
    return json(init.method === 'POST' ? result() : { items: [row], total: 1, page: 1, pageSize: 20 }); }));
  const write = client.execute('CUSTOMER', input, signal()); Object.assign(input, { name: 'mutated', id: otherId, expectedVersion: 99, enabled: false });
  const read = client.list('CUSTOMER', parameters, signal()); Object.assign(parameters, { page: 2, enabled: 'DISABLED' });
  await write; await read;
  assert.deepEqual(calls[0]!.body, command); assert.equal(new URL(calls[1]!.url).searchParams.get('page'), '1');
});

test('every known party 4xx code is retained only from an exact error envelope and proves command rejection', async () => {
  const errors = [[400, 'INVALID_PARTY_INPUT', 'invalid-request'], [400, 'INVALID_ID', 'invalid-request'], [400, 'INVALID_VERSION', 'invalid-request'],
    [400, 'INVALID_HTTP_INPUT', 'invalid-request'], [400, 'INVALID_JSON', 'invalid-request'], [401, 'UNAUTHENTICATED', 'unauthenticated'], [403, 'FORBIDDEN', 'forbidden'],
    [404, 'PARTY_NOT_FOUND', 'not-found'], [404, 'RECEIPT_NOT_FOUND', 'not-found'], [409, 'VERSION_CONFLICT', 'conflict'], [409, 'IDEMPOTENCY_CONFLICT', 'conflict'],
    [409, 'PARTY_CODE_CONFLICT', 'conflict'], [409, 'PARTY_CODE_EXHAUSTED', 'conflict'], [409, 'CUSTOMER_DEFAULT_IN_USE', 'conflict'], [409, 'INVALID_PARTY_STATE', 'conflict'],
    [409, 'NO_PARTY_CHANGE', 'conflict'], [409, 'VERSION_STORAGE_OVERFLOW', 'conflict'], [413, 'BODY_TOO_LARGE', 'invalid-request'], [415, 'UNSUPPORTED_MEDIA_TYPE', 'invalid-request'],
    [422, 'PARTY_READ_TOO_LARGE', 'invalid-request']] as const;
  let calls = 0;
  for (const [status, code, kind] of errors) {
    const client = createPartyHttpClient(options(async () => { calls++; return json({ error: { code, message: 'private SQL token diagnostics' } }, status); }));
    await assert.rejects(client.execute('CUSTOMER', command, signal()), failure(kind, 'rejected', code, status));
    await assert.rejects(client.list('CUSTOMER', query, signal()), failure(kind, 'read', code, status));
  }
  assert.equal(calls, errors.length * 2);
});

test('unknown, wrong-status, extra-field and malformed error envelopes never prove a write did not commit', async () => {
  const bodies: unknown[] = [{ error: { code: 'VERSION_CONFLICT', message: 'private', detail: 'secret' } },
    { error: { code: 'VERSION_CONFLICT', message: 'private' }, extra: 'secret' }, { error: { code: 'private-token', message: 'private' } },
    { error: { code: 'FORBIDDEN', message: 'private' } }, { error: { code: 'VERSION_CONFLICT', message: 1 } }, null];
  for (const body of bodies) {
    const client = createPartyHttpClient(options(async () => json(body, 409)));
    await assert.rejects(client.execute('CUSTOMER', command, signal()), failure('malformed-response', 'uncertain', 'INVALID_ERROR_RESPONSE', 409));
  }
  for (const [status, kind, code] of [[401, 'unauthenticated', 'UNAUTHENTICATED'], [403, 'forbidden', 'FORBIDDEN']] as const) {
    const html = createPartyHttpClient(options(async () => new Response('<html>private login</html>', { status })));
    await assert.rejects(html.execute('CUSTOMER', command, signal()), failure(kind, 'uncertain', code, status));
    await assert.rejects(html.detail('CUSTOMER', id, signal()), failure(kind, 'read', code, status));
  }
  const server = createPartyHttpClient(options(async () => json({ error: { code: 'INTERNAL_ERROR', message: 'private SQL token' } }, 500)));
  await assert.rejects(server.execute('CUSTOMER', command, signal()), failure('server', 'uncertain', 'INTERNAL_ERROR', 500));
});

test('network failure is sanitized, uncertain after write dispatch, and never retried', async () => {
  let calls = 0; const client = createPartyHttpClient(options(async () => { calls++; throw new Error('private secret token host diagnostics'); }));
  await assert.rejects(client.execute('CUSTOMER', command, signal()), failure('network', 'uncertain', 'NETWORK_ERROR', null));
  await assert.rejects(client.detail('CUSTOMER', id, signal()), failure('network', 'read', 'NETWORK_ERROR', null));
  assert.equal(calls, 2);
});

test('pre-abort and same-turn cancellation do not send; post-dispatch ignored abort stays uncertain and consumes late failure', async () => {
  let calls = 0; const pending = deferred<Response>(); let forwarded: AbortSignal | null | undefined;
  const client = createPartyHttpClient(options(async (_url, init) => { calls++; forwarded = init.signal; return pending.promise; }));
  const before = new AbortController(); before.abort('private token');
  await assert.rejects(client.execute('CUSTOMER', command, before.signal), failure('aborted', 'not-sent', 'PARTY_ABORTED', null));
  const immediate = new AbortController(); const noSend = client.execute('CUSTOMER', command, immediate.signal); immediate.abort();
  await assert.rejects(noSend, failure('aborted', 'not-sent')); assert.equal(calls, 0);
  const during = new AbortController(); const write = client.execute('CUSTOMER', command, during.signal); await flush(); during.abort('private token');
  await assert.rejects(write, failure('aborted', 'uncertain')); assert.equal(forwarded?.aborted, true); assert.equal(calls, 1);
  pending.reject(new Error('late private failure')); await flush();
});

test('timeout detaches ignored fetch, cancels a late body, and keeps writes uncertain', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  await withControlledClock(async advance => {
    let calls = 0, cancelled = 0; const pending = deferred<Response>(), dispatched = deferred<void>();
    const client = createPartyHttpClient(options(async () => { calls++; dispatched.resolve(); return pending.promise; }, { timeoutMs: 10 }));
    const rejected = assert.rejects(client.execute('CUSTOMER', command, signal()), failure('timeout', 'uncertain', 'PARTY_TIMEOUT', null));
    await dispatched.promise;
    advance(10); context.mock.timers.tick(10);
    await rejected;
    pending.resolve(new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled++; } }), { headers: { 'Content-Type': 'application/json' } }));
    await flush(); assert.equal(cancelled, 1); assert.equal(calls, 1);
  });
});

test('fetch/body microtasks cannot publish a result after the monotonic timeout budget', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  await withControlledClock(async advance => {
    let calls = 0;
    const client = createPartyHttpClient(options(async () => {
      calls++; advance(10); return json(result());
    }, { timeoutMs: 10 }));
    // No timer callbacks are run. Only the post-dispatch monotonic checkpoint can
    // reject this response, independent of host load or task-queue scheduling.
    await assert.rejects(client.execute('CUSTOMER', command, signal()), failure('timeout', 'uncertain', 'PARTY_TIMEOUT', 200));
    assert.equal(calls, 1);
  });
});

test('streamed bodies are byte/chunk bounded, stalled reads detach on timeout and cancellation', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  await withControlledClock(async advance => {
    let cancelled = 0;
    const oversized = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(100)); }, cancel() { cancelled++; } });
    const client = createPartyHttpClient(options(async () => new Response(oversized, { headers: { 'Content-Type': 'application/json' } }), { maxResponseBytes: 16 }));
    await assert.rejects(client.execute('CUSTOMER', command, signal()), failure('malformed-response', 'uncertain', 'RESPONSE_TOO_LARGE'));
    assert.equal(cancelled, 1);
    for (const length of ['99999999999999999999', 'private', '1000']) {
      const bounded = createPartyHttpClient(options(async () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': length } }), { maxResponseBytes: 32 }));
      await assert.rejects(bounded.detail('CUSTOMER', id, signal()), failure('malformed-response', 'read'));
    }
    const stalled = createPartyHttpClient(options(async () => new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled++; } }), { headers: { 'Content-Type': 'application/json' } }), { timeoutMs: 10 }));
    const timedOut = assert.rejects(stalled.execute('CUSTOMER', command, signal()), failure('timeout', 'uncertain'));
    await flush(); advance(10); context.mock.timers.tick(10); await timedOut;
    assert.equal(cancelled, 2);
    const abortController = new AbortController();
    const cancelledRead = createPartyHttpClient(options(async () => new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled++; } }), { headers: { 'Content-Type': 'application/json' } })));
    const reading = cancelledRead.detail('CUSTOMER', id, abortController.signal); await flush(); abortController.abort('private reason');
    await assert.rejects(reading, failure('aborted', 'read')); assert.equal(cancelled, 3);
    let count = 0;
    const empty = new Uint8Array();
    const chunkResponse = json(null);
    // This explicitly synthetic reader probes the real 65,536-chunk boundary
    // without 65,537 heavyweight native Web Streams pull/queue operations.
    Object.defineProperty(chunkResponse, 'body', { value: { getReader: () => ({
      read: async () => { count++; return { done: false, value: empty }; },
      cancel: async () => { cancelled++; }, releaseLock() {},
    }) } });
    const chunks = createPartyHttpClient(options(async () => chunkResponse));
    await assert.rejects(chunks.detail('CUSTOMER', id, signal()), failure('malformed-response', 'read', 'RESPONSE_TOO_LARGE'));
    assert.equal(count, 65_537); assert.equal(cancelled, 4);
  });
});

test('malformed JSON/UTF-8/content, non-200 success and observable redirects never acknowledge a command', async () => {
  for (const makeResponse of [() => new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    () => new Response(new Uint8Array([0xff]), { headers: { 'Content-Type': 'application/json' } }),
    () => new Response('<html>private login</html>'), () => new Response(null, { status: 204 }), () => json(result(), 201)]) {
    const client = createPartyHttpClient(options(async () => makeResponse()));
    await assert.rejects(client.execute('CUSTOMER', command, signal()), failure('malformed-response', 'uncertain'));
  }
  for (const overrides of [{ redirected: true }, { url: 'https://other.example/commands' }, { url: `${origin}/sign-in` }, { type: 'opaqueredirect' }]) {
    const response = json(result()); for (const [key, value] of Object.entries(overrides)) Object.defineProperty(response, key, { value });
    const client = createPartyHttpClient(options(async () => response));
    await assert.rejects(client.execute('CUSTOMER', command, signal()), failure('malformed-response', 'uncertain', 'UNEXPECTED_REDIRECT'));
  }
});

test('wrong kind/id/CAS/state/code successes are uncertain, and invalid list/candidate/detail/receipt data fail closed', async () => {
  for (const value of [{ ...result(), kind: 'SUPPLIER' }, { ...result(), partyId: otherId }, { ...result(), version: 7 }, { ...result(), code: '' }, { ...result(), enabled: false }, { ...result(), actor: 'private' }, null]) {
    const client = createPartyHttpClient(options(async () => json(value)));
    await assert.rejects(client.execute('CUSTOMER', command, signal()), failure('malformed-response', 'uncertain', 'INVALID_RESPONSE', 200));
  }
  for (const value of [{ ...createResult(), code: 'V2-CP001' }, { ...createResult(), code: 'GYS000001' }, { ...createResult(), enabled: false }, { ...createResult(), version: 2 }]) {
    const client = createPartyHttpClient(options(async () => json(value)));
    await assert.rejects(client.execute('CUSTOMER', { action: 'CREATE', requestKey: 'synthetic:create', name: '新客户' }, signal()), failure('malformed-response', 'uncertain'));
  }
  const disabled = createPartyHttpClient(options(async () => json(result())));
  await assert.rejects(disabled.execute('CUSTOMER', { action: 'DISABLE', requestKey: 'synthetic:disable', id, expectedVersion: 7 }, signal()), failure('malformed-response', 'uncertain'));
  for (const value of [{ items: [], total: 1, page: 1, pageSize: 20 }, { items: [row], total: 1, page: 2, pageSize: 20 }, { items: [row], total: 1, page: 1, pageSize: 50 },
    { items: [row, row], total: 2, page: 1, pageSize: 20 }, { items: [{ ...row, version: 0 }], total: 1, page: 1, pageSize: 20 }]) {
    const client = createPartyHttpClient(options(async () => json(value)));
    await assert.rejects(client.list('CUSTOMER', query, signal()), failure('malformed-response', 'read'));
  }
  const candidates = createPartyHttpClient(options(async () => json({ items: [row], total: 1, page: 1, pageSize: 20 })));
  await assert.rejects(candidates.candidates('CUSTOMER', { search: '', page: 1, pageSize: 20 }, signal()), failure('malformed-response', 'read'));
  const detail = createPartyHttpClient(options(async () => json({ ...row, id: otherId })));
  await assert.rejects(detail.detail('CUSTOMER', id, signal()), failure('malformed-response', 'read'));
  for (const value of [{ ...receipt(), requestKey: 'other:key' }, { ...receipt(), result: result('SUPPLIER') }, { ...receipt(), status: 'PENDING' }, { ...receipt(), requestHash: 'private' }]) {
    const client = createPartyHttpClient(options(async () => json(value)));
    await assert.rejects(client.receipt('CUSTOMER', command.requestKey, signal()), failure('malformed-response', 'read'));
  }
});
