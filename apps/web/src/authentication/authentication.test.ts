import assert from 'node:assert/strict';
import test from 'node:test';
import { entityId } from '../../../../packages/domain/src/values.ts';
import { ReadContext } from '../loading/read-scope.ts';
import { AuthClientError, type AuthClient, type AuthenticationPrincipal, type LoginResult } from './contracts.ts';
import { createAuthHttpClient } from './http-client.ts';
import { AuthenticationController, readContextAuthenticationLifecycle, type IdentityChange } from './model.ts';

const origin = 'https://synthetic.example';
const now = Date.parse('2026-10-20T00:00:00.000Z');
const identity = (suffix = '1', authVersion = 1): AuthenticationPrincipal => ({
  accountId: entityId('account', `00000000-0000-0000-0000-00000000000${suffix}`),
  staffId: entityId('staff', `10000000-0000-0000-0000-00000000000${suffix}`),
  loginName: `SYNTHETIC-${suffix}`, role: 'ADMIN', hallId: null, authVersion,
});
const result = (principal = identity()): LoginResult => ({ principal, expiresAt: '2026-10-21T00:00:00.000Z' });
const credentials = { loginName: 'SYNTHETIC-1', password: 'synthetic-login-only' };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const success = () => new Response(null, { status: 204 });
const signal = () => new AbortController().signal;
const client = (overrides: Partial<AuthClient> = {}): AuthClient => ({ login: async () => result(), session: async () => null,
  logout: async () => {}, changeOwnPassword: async () => {}, ...overrides });
function controller(clientValue: AuthClient = client()) {
  const changes: IdentityChange[] = [];
  const readContext = new ReadContext();
  const bridge = readContextAuthenticationLifecycle(readContext);
  const model = new AuthenticationController({ client: clientValue, now: () => now, onIdentityChange: change => { changes.push(change); bridge(change); } });
  return { model, changes, readContext };
}

test('HTTP auth is inert, explicit HTTPS only, fixed same-origin cookie requests and exact DTOs', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const replies = [response(result()), response({ principal: identity() }), success(), success()];
  const http = createAuthHttpClient({ origin, basePath: '/api', fetch: async (url, init) => {
    requests.push({ url, init }); return replies.shift()!;
  } });
  assert.equal(requests.length, 0);
  assert.deepEqual(await http.login(credentials, signal()), result());
  assert.deepEqual(await http.session(signal()), identity());
  await http.changeOwnPassword({ currentPassword: 'synthetic-old', newPassword: 'synthetic-new' }, signal());
  await http.logout(signal());
  assert.deepEqual(requests.map(row => row.url), ['/auth/login', '/auth/session', '/auth/password', '/auth/logout'].map(path => `${origin}/api${path}`));
  for (const request of requests) {
    assert.equal(request.init.credentials, 'same-origin'); assert.equal(request.init.mode, 'same-origin');
    assert.equal(request.init.redirect, 'error'); assert.equal(request.init.cache, 'no-store');
    assert.equal(new Headers(request.init.headers).has('Authorization'), false);
    assert.equal(new Headers(request.init.headers).has('Cookie'), false);
  }
  assert.equal(requests[1]!.init.method, 'GET'); assert.equal(requests[1]!.init.body, undefined);
  assert.deepEqual(JSON.parse(requests[0]!.init.body as string), credentials);
  assert.deepEqual(JSON.parse(requests[2]!.init.body as string), { currentPassword: 'synthetic-old', newPassword: 'synthetic-new' });
  assert.deepEqual(JSON.parse(requests[3]!.init.body as string), {});
  for (const invalid of ['http://synthetic.example', `${origin}/`, `${origin}/path`, 'https://user:secret@synthetic.example']) {
    assert.throws(() => createAuthHttpClient({ origin: invalid, basePath: '', fetch: async () => success() }), TypeError);
  }
  for (const basePath of ['//attacker', '/..', '/api?token=x', '/%2f/', '/api\\path', '/api#hash']) {
    assert.throws(() => createAuthHttpClient({ origin, basePath, fetch: async () => success() }), TypeError);
  }
});
test('HTTP session null is truthful; unknown/secret response fields, identities, redirect and wrong statuses fail closed', async () => {
  const values = [{ principal: null }, { principal: identity(), token: 'SYNTHETIC-NOT-ALLOWED' },
    { principal: { ...identity(), password: 'SYNTHETIC-NOT-ALLOWED' } }, { principal: { ...identity(), accountId: 'not-uuid' } },
    { principal: { ...identity(), authVersion: 0 } }, { principal: { ...identity(), hallId: '' } }];
  const http = createAuthHttpClient({ origin, basePath: '', fetch: async () => response(values.shift()) });
  assert.equal(await http.session(signal()), null);
  while (values.length) await assert.rejects(http.session(signal()), (error: unknown) => error instanceof AuthClientError && error.kind === 'invalid-response');
  const redirect = createAuthHttpClient({ origin, basePath: '', fetch: async () => new Response(null, { status: 302 }) });
  await assert.rejects(redirect.session(signal()), AuthClientError);
  const wrong = createAuthHttpClient({ origin, basePath: '', fetch: async () => response({}) });
  await assert.rejects(wrong.logout(signal()), (error: unknown) => error instanceof AuthClientError && error.kind === 'invalid-response');
});
test('HTTP validation rejects oversize/empty inputs without fetching and sanitizes errors', async () => {
  let count = 0;
  const http = createAuthHttpClient({ origin, basePath: '', fetch: async () => {
    count++; return response({ error: { code: 'INVALID_CREDENTIALS', message: 'SYNTHETIC-SECRET-PROVIDER-MESSAGE' } }, 401);
  } });
  await assert.rejects(http.login({ loginName: '', password: 'x' }, signal()), AuthClientError);
  await assert.rejects(http.login({ loginName: '界'.repeat(100), password: 'x' }, signal()), AuthClientError);
  await assert.rejects(http.login({ loginName: 'a', password: '界'.repeat(400) }, signal()), AuthClientError);
  await assert.rejects(http.changeOwnPassword({ currentPassword: '', newPassword: 'synthetic-new' }, signal()), AuthClientError);
  assert.equal(count, 0);
  await assert.rejects(http.login(credentials, signal()), (error: unknown) => {
    assert.ok(error instanceof AuthClientError); assert.equal(error.kind, 'credentials');
    assert.doesNotMatch(String(error), /SYNTHETIC-SECRET/); assert.doesNotMatch(JSON.stringify(error), /SYNTHETIC-SECRET/); return true;
  });
  assert.equal(count, 1);
});
test('HTTP status mappings distinguish old-password rejection and expiry without retaining server messages', async () => {
  const samples = [[401, 'UNAUTHENTICATED', 'unauthenticated'], [422, 'PASSWORD_REJECTED', 'password-rejected'],
    [403, 'ORIGIN_REJECTED', 'forbidden'], [400, 'INVALID_AUTH_INPUT', 'invalid-input'], [500, 'INTERNAL_ERROR', 'server']] as const;
  for (const [status, code, kind] of samples) {
    const http = createAuthHttpClient({ origin, basePath: '', fetch: async () => response({ error: { code, message: 'discard' } }, status) });
    await assert.rejects(http.session(signal()), (error: unknown) => error instanceof AuthClientError && error.kind === kind);
  }
});
test('HTTP cancellation, timeout and late ignored fetch response never produce a successful login/retry', async () => {
  let calls = 0;
  const pending = deferred<Response>();
  const http = createAuthHttpClient({ origin, basePath: '', fetch: async () => { calls++; return pending.promise; } });
  const abort = new AbortController();
  const operation = http.login(credentials, abort.signal);
  await Promise.resolve(); abort.abort();
  await assert.rejects(operation, (error: unknown) => error instanceof AuthClientError && error.kind === 'aborted');
  pending.resolve(response(result())); await Promise.resolve(); assert.equal(calls, 1);
  const timeout = createAuthHttpClient({ origin, basePath: '', timeoutMs: 5, fetch: async () => new Promise<Response>(() => {}) });
  await assert.rejects(timeout.session(signal()), (error: unknown) => error instanceof AuthClientError && error.kind === 'timeout');
  const already = new AbortController(); already.abort();
  await assert.rejects(http.session(already.signal), (error: unknown) => error instanceof AuthClientError && error.kind === 'aborted');
  assert.equal(calls, 1);
});
test('HTTP bounded stream and content validation; pending body aborts without exposing contents', async () => {
  const badReplies = [new Response('not-json', { headers: { 'Content-Type': 'text/plain' } }),
    response({ principal: null, padding: 'x'.repeat(17_000) }),
    new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '999999' } }),
    new Response('not-json', { headers: { 'Content-Type': 'application/json' } })];
  const http = createAuthHttpClient({ origin, basePath: '', fetch: async () => badReplies.shift()! });
  while (badReplies.length) await assert.rejects(http.session(signal()), (error: unknown) => error instanceof AuthClientError && error.kind === 'invalid-response');
  const body = new ReadableStream<Uint8Array>({ start(stream) { stream.enqueue(new TextEncoder().encode('{')); } });
  const stalled = createAuthHttpClient({ origin, basePath: '', timeoutMs: 5, fetch: async () => new Response(body, { headers: { 'Content-Type': 'application/json' } }) });
  await assert.rejects(stalled.session(signal()), (error: unknown) => error instanceof AuthClientError && error.kind === 'timeout');
});
test('controller requires lifecycle, starts without reads/secrets, and explicit resolve handles null/current/revisions', async () => {
  let reads = 0;
  const s = controller(client({ session: async () => { reads++; return reads === 1 ? null : identity(); } }));
  assert.equal(reads, 0); assert.equal(s.model.getSnapshot().phase, 'unresolved'); assert.equal(s.changes[0]?.reason, 'initial');
  await s.model.resolveSession(); assert.equal(s.model.getSnapshot().phase, 'anonymous');
  await s.model.resolveSession(); assert.deepEqual(s.model.getSnapshot().principal, identity());
  const scope = s.readContext.createScope('SYNTHETIC-OLD-READ');
  await s.model.resolveSession(); assert.equal(scope.active, false);
  assert.doesNotMatch(JSON.stringify(s.model.getSnapshot()), /password|token|synthetic-login-only/);
  s.model.dispose();
});
test('repeated login is single-shot; logout supersedes pending login, clears ReadContext and ignores late identity', async () => {
  const late = deferred<LoginResult>(); let logins = 0, logouts = 0; let loginSignal: AbortSignal | null = null;
  const s = controller(client({ login: async (_input, inputSignal) => { logins++; loginSignal = inputSignal; return late.promise; }, logout: async () => { logouts++; } }));
  const first = s.model.login(credentials);
  assert.equal(await s.model.login(credentials), false); assert.equal(logins, 1);
  await s.model.logout(); assert.equal(logouts, 1); assert.equal((loginSignal as AbortSignal | null)?.aborted, true);
  late.resolve(result(identity('2'))); assert.equal(await first, false);
  assert.equal(s.model.getSnapshot().principal, null); assert.equal(s.model.getSnapshot().notice, 'logged-out');
  assert.throws(() => s.readContext.createScope('SYNTHETIC-AFTER-LOGOUT'));
  s.model.dispose();
});
test('cancelled session resolution never restores identity; explicit retry is distinct and late rejection is consumed', async () => {
  const first = deferred<AuthenticationPrincipal | null>(); let calls = 0;
  const s = controller(client({ session: async () => ++calls === 1 ? first.promise : identity('2') }));
  const operation = s.model.resolveSession(); s.model.cancel();
  await s.model.resolveSession(); first.resolve(identity()); await operation;
  assert.equal(s.model.getSnapshot().principal?.accountId, identity('2').accountId); assert.equal(calls, 2);
  s.model.dispose();
});
test('successful password change clears all scopes and requires explicit fresh login, no automatic relogin', async () => {
  let logins = 0, changes = 0;
  const s = controller(client({ login: async () => { logins++; return result(); }, changeOwnPassword: async () => { changes++; } }));
  await s.model.login(credentials); const scope = s.readContext.createScope('SYNTHETIC-BUSINESS');
  await s.model.changeOwnPassword({ currentPassword: 'synthetic-old', newPassword: 'synthetic-new' });
  assert.equal(changes, 1); assert.equal(logins, 1); assert.equal(scope.active, false);
  assert.equal(s.model.getSnapshot().principal, null); assert.equal(s.model.getSnapshot().notice, 'password-changed');
  assert.equal(s.changes.at(-1)?.reason, 'password-changed'); s.model.dispose();
});
test('old-password/policy rejection retain verified identity, real expiry/uncertain writes clear it', async () => {
  for (const kind of ['credentials', 'password-rejected', 'unauthenticated', 'network'] as const) {
    const s = controller(client({ changeOwnPassword: async () => { throw new AuthClientError(kind); } }));
    await s.model.login(credentials); const scope = s.readContext.createScope('SYNTHETIC-READ');
    await s.model.changeOwnPassword({ currentPassword: 'synthetic-old', newPassword: 'synthetic-new' });
    assert.equal(s.model.getSnapshot().error?.kind, kind);
    assert.equal(s.model.getSnapshot().principal !== null, kind === 'credentials' || kind === 'password-rejected');
    assert.equal(scope.active, kind === 'credentials' || kind === 'password-rejected'); s.model.dispose();
  }
});
test('logout failure is not success, cancellation/disposal/expiry clear host context and detach late responses', async () => {
  const s = controller(client({ logout: async () => { throw new Error('SYNTHETIC-PRIVATE-PROVIDER-DETAIL'); } }));
  await s.model.login(credentials); const scope = s.readContext.createScope('SYNTHETIC-READ');
  assert.equal(await s.model.logout(), false); assert.equal(scope.active, false);
  assert.equal(s.model.getSnapshot().notice, 'uncertain'); assert.equal(s.model.getSnapshot().error?.kind, 'server');
  assert.doesNotMatch(JSON.stringify(s.model.getSnapshot()), /PRIVATE-PROVIDER/); s.model.dispose();
  const late = deferred<LoginResult>(); const closed = controller(client({ login: async () => late.promise }));
  const operation = closed.model.login(credentials); closed.model.dispose(); late.resolve(result()); await operation;
  assert.equal(closed.model.getSnapshot().principal, null); assert.equal(closed.changes.at(-1)?.reason, 'disposed');
  assert.equal(await closed.model.resolveSession(), false);
  const expiry = controller(); await expiry.model.login(credentials); const expiredScope = expiry.readContext.createScope('SYNTHETIC-EXPIRY');
  expiry.model.expire(); assert.equal(expiredScope.active, false); assert.equal(expiry.model.getSnapshot().notice, 'expired'); expiry.model.dispose();
});
test('cancelled password write cannot report success; login expiry and session failure remain truthful', async () => {
  const pending = deferred<void>(); const s = controller(client({ changeOwnPassword: async () => pending.promise }));
  await s.model.login(credentials); const old = s.readContext.createScope('SYNTHETIC-CANCEL');
  const operation = s.model.changeOwnPassword({ currentPassword: 'synthetic-old', newPassword: 'synthetic-new' });
  s.model.cancel(); pending.resolve(); assert.equal(await operation, false);
  assert.equal(old.active, false); assert.equal(s.model.getSnapshot().notice, 'cancelled'); s.model.dispose();
  const expired = controller(client({ login: async () => ({ ...result(), expiresAt: '2026-10-19T00:00:00.000Z' }) }));
  assert.equal(await expired.model.login(credentials), false); assert.equal(expired.model.getSnapshot().principal, null); expired.model.dispose();
  const failed = controller(client({ session: async () => { throw new AuthClientError('network'); } }));
  await failed.model.resolveSession(); assert.equal(failed.model.getSnapshot().phase, 'error');
  assert.equal(failed.model.getSnapshot().principal, null); failed.model.dispose();
});

test('known login expiry timer invalidates current reads without making a network request', async () => {
  let clock = now, reads = 0;
  const readContext = new ReadContext();
  const model = new AuthenticationController({ now: () => clock, onIdentityChange: readContextAuthenticationLifecycle(readContext), client: client({
    login: async () => { reads++; return { ...result(), expiresAt: new Date(now + 5).toISOString() }; },
  }) });
  await model.login(credentials); const scope = readContext.createScope('SYNTHETIC-TIMED-EXPIRY');
  clock += 10; await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(scope.active, false); assert.equal(model.getSnapshot().notice, 'expired'); assert.equal(reads, 1); model.dispose();
});

test('absolute monotonic deadline rejects microtask-starved streams and late fetch before timer callbacks', async context => {
  let monotonic = 0;
  context.mock.method(performance, 'now', () => monotonic);
  for (const status of [200, 401]) {
    monotonic = 0; let emitted = 0, cancelled = false, timerFired = false;
    const timer = setTimeout(() => { timerFired = true; }, 0);
    const http = createAuthHttpClient({ origin, basePath: '', timeoutMs: 1, fetch: async () => new Response(new ReadableStream<Uint8Array>({
      pull(stream) {
        emitted++; monotonic += 0.02;
        if (emitted <= 8_000) stream.enqueue(new Uint8Array(0));
        else { stream.enqueue(new TextEncoder().encode(status === 200 ? '{"principal":null}' : '{"error":{"code":"UNAUTHENTICATED"}}')); stream.close(); }
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 }), { status, headers: { 'Content-Type': 'application/json' } }) });
    await assert.rejects(http.session(signal()), (error: unknown) => error instanceof AuthClientError && error.kind === 'timeout');
    assert.ok(emitted > 0 && emitted < 8_000); assert.equal(cancelled, true); assert.equal(timerFired, false); clearTimeout(timer);
  }
  monotonic = 0; let cancelled = false;
  const lateFetch = createAuthHttpClient({ origin, basePath: '', timeoutMs: 1, fetch: async () => {
    monotonic = 2;
    return new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } });
  } });
  await assert.rejects(lateFetch.session(signal()), (error: unknown) => error instanceof AuthClientError && error.kind === 'timeout');
  assert.equal(cancelled, true);
});
