// Independent synthetic protocol + Fastify.inject probes only. No DB, socket, network, credentials, or installs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createSourceConfirmedPostgresReadAuthorization as createPolicies } from '../../adapters/postgres/src/source-confirmed-read-authorization.ts';
import { createPostgresReadApi } from '../../apps/api/src/postgres-read-api.ts';
import { createSourceAuthenticationPolicy } from '../../packages/authentication/src/source-policy.ts';
import { sessionTokenHash } from '../../packages/authentication/src/service.ts';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ids = { account: id(1), staff: id(2), hall: id(3), otherHall: id(4), warehouse: id(5), otherWarehouse: id(6), product: id(7), image: id(8) };
const actor = { accountId: ids.account, hallId: ids.hall };
const inventoryIntent = { kind: 'inventory', parameters: { page: 1, pageSize: 100, filter: { productIds: [], categoryId: null, warehouseIds: [], supplierIds: [], fitIds: [], seasonIds: [] } } };
const salesInput = () => ({ filter: { startDate: null, endDate: null, status: null, businessType: null, hallId: null, salespersonId: null, customerId: null, warehouseId: null, number: null }, page: 1, pageSize: 20 });
const salesIntent = { kind: 'list', parameters: salesInput() };
const productIntent = { kind: 'basics', parameters: { productId: ids.product } };
const identity = (role = 'SALESPERSON', hallId = ids.hall) => ({ account_id: ids.account, staff_id: ids.staff, login_enabled: true, role, employment_status: '在职', hall_id: hallId, native_hall_id: hallId, hall_enabled: hallId === null ? null : true });
const warehouses = () => [{ id: ids.otherWarehouse, hall_id: ids.otherHall, native_hall_id: ids.otherHall, name: '  历史停用乙仓完整名  ' }, { id: ids.warehouse, hall_id: ids.hall, native_hall_id: ids.hall, name: '甲仓完整名' }];
const stage = sql => /\/\* read-authorization:([a-z-]+) \*\//.exec(sql)?.[1] ?? sql;
const signal = () => new AbortController().signal;
class ProbePool {
  connects = 0; calls = []; releases = []; identities = [identity()]; warehouseRows = warehouses(); hook; fail;
  async connect() { this.connects++; return this; }
  async query(sql, values = []) {
    const at = stage(sql); this.calls.push({ at, sql, values: structuredClone(values) });
    await this.hook?.(at);
    if (this.fail?.at === at) throw this.fail.error;
    const rows = at === 'identity' ? structuredClone(this.identities) : at === 'warehouses' ? structuredClone(this.warehouseRows) : [];
    return { rows, rowCount: rows.length };
  }
  release(error) { this.releases.push(error); }
}
const states = pool => pool.calls.map(call => call.at);
const policyCall = (p, kind, abortSignal = signal(), passedActor = actor) => createPolicies(p)[kind].authorize(passedActor, kind === 'inventory' ? inventoryIntent : kind === 'sales' ? salesIntent : productIntent, abortSignal);

test('independent: current canonical role determines sales scope, not injected role, target hall, or old provider state', async () => {
  const p = new ProbePool(); const policies = createPolicies(p);
  for (const role of ['ADMIN', 'SALESPERSON', 'WAREHOUSE', 'SALESPERSON']) {
    p.identities = [identity(role)];
    const result = await policies.sales.authorize({ ...actor, role: 'ADMIN' }, { ...salesIntent, parameters: { ...salesInput(), filter: { ...salesInput().filter, hallId: ids.otherHall } } }, signal());
    assert.deepEqual(result, role === 'SALESPERSON' ? { kind: 'restricted', clauses: [{ hallId: ids.hall }] } : { kind: 'all' });
  }
  assert.equal(p.connects, 4); assert.equal(p.calls.filter(c => c.at === 'identity').length, 4); assert.equal(p.calls.filter(c => c.at === 'warehouses').length, 0);
  assert.deepEqual(p.releases, [undefined, undefined, undefined, undefined]);
});
test('independent: ALL-role complete warehouse grants preserve native other-hall and historical labels without enabling filters', async () => {
  for (const role of ['SALESPERSON', 'ADMIN', 'WAREHOUSE']) {
    const p = new ProbePool(); p.identities = [identity(role)];
    const scope = await policyCall(p, 'inventory');
    assert.deepEqual(scope, { hallIds: [ids.otherHall, ids.hall], warehouses: p.warehouseRows.map(w => ({ id: w.id, hallId: w.hall_id, label: w.name })) });
    assert.equal(scope.warehouses[0].label, '  历史停用乙仓完整名  ');
    const query = p.calls.find(c => c.at === 'warehouses'); assert.deepEqual(query.values, [1001]);
    assert.doesNotMatch(query.sql, /\bWHERE\b|enabled|inventory_balance|inventory_ledger|product|sku|publication|import/i);
    assert.deepEqual(states(p), ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', 'identity', 'warehouses', 'COMMIT']);
  }
});
test('independent: exactly 1000 unique warehouses pass, 1001 fail without scope truncation, empty/duplicate/unknown hall never becomes invented scope', async () => {
  const thousand = Array.from({ length: 1000 }, (_, i) => ({ id: id(1000 + i), hall_id: ids.otherHall, native_hall_id: ids.otherHall, name: `仓库${i}` }));
  const p = new ProbePool(); p.warehouseRows = thousand; assert.equal((await policyCall(p, 'inventory')).warehouses.length, 1000);
  for (const rows of [[...thousand, { ...thousand[0], id: id(2500) }], [], [warehouses()[0], warehouses()[0]], [{ ...warehouses()[0], native_hall_id: null }], [{ ...warehouses()[0], hall_id: null }]]) {
    const bad = new ProbePool(); bad.warehouseRows = rows;
    await assert.rejects(policyCall(bad, 'inventory')); assert.equal(states(bad).at(-1), 'ROLLBACK'); assert.equal(bad.calls.some(c => c.at === 'COMMIT'), false); assert.equal(bad.releases.length, 1);
  }
});
test('independent: all policy families deny stale/null/disabled/unknown native identity and never continue to warehouse grant', async () => {
  for (const kind of ['inventory', 'sales', 'products']) for (const patch of [
    { login_enabled: 1 }, { login_enabled: false }, { employment_status: '在职 ' }, { role: 'admin' }, { role: 'UNKNOWN' },
    { staff_id: null }, { account_id: id(99) }, { hall_id: ids.otherHall, native_hall_id: ids.otherHall }, { hall_enabled: false },
    { hall_id: null, native_hall_id: null, hall_enabled: null }, { native_hall_id: undefined }
  ]) {
    const p = new ProbePool(); p.identities = [{ ...identity(), ...patch }];
    await assert.rejects(policyCall(p, kind), { code: 'FORBIDDEN' });
    assert.deepEqual(states(p), ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', 'identity', 'ROLLBACK']); assert.deepEqual(p.releases, [undefined]);
  }
});
test('independent: product facts are exact target and image ownership remains native reader work; no stock or producthall invention', async () => {
  for (const role of ['SALESPERSON', 'ADMIN', 'WAREHOUSE']) for (const kind of ['basics', 'specifications', 'images', 'image']) {
    const p = new ProbePool(); p.identities = [identity(role)];
    const intent = { kind, parameters: { productId: ids.product, ...(kind === 'image' ? { imageId: ids.image } : {}) } };
    assert.deepEqual(await createPolicies(p).products.authorize(actor, intent, signal()), { productId: ids.product });
    assert.deepEqual(states(p), ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', 'identity', 'COMMIT']);
    assert.doesNotMatch(p.calls.find(c => c.at === 'identity').sql, /password|session|token|auth_version|login_name/i);
  }
  for (const intent of [{ kind: 'basics', parameters: { productId: ids.product, hallId: ids.otherHall } }, { kind: 'image', parameters: { productId: ids.product, imageId: 'bad' } }]) {
    const p = new ProbePool(); await assert.rejects(createPolicies(p).products.authorize(actor, intent, signal()), { code: 'INVALID_PRODUCT_QUERY' }); assert.equal(p.connects, 0);
  }
});
test('independent: abort boundaries return no grant, rollback active snapshots, and never rollback acknowledged COMMIT', async () => {
  for (const at of ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', 'identity', 'warehouses', 'COMMIT']) {
    const p = new ProbePool(); const abort = new AbortController(); p.hook = current => { if (current === at) abort.abort(); };
    await assert.rejects(policyCall(p, 'inventory', abort.signal), { code: 'INVENTORY_READ_ABORTED' });
    assert.equal(p.releases.length, 1);
    if (at === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY') { assert.equal(p.calls.length, 1); assert.ok(p.releases[0] instanceof Error); }
    else if (at === 'COMMIT') { assert.equal(states(p).at(-1), 'COMMIT'); assert.equal(p.calls.filter(c => c.at === 'ROLLBACK').length, 0); assert.equal(p.releases[0], undefined); }
    else { assert.equal(states(p).at(-1), 'ROLLBACK'); assert.equal(p.calls.filter(c => c.at === 'ROLLBACK').length, 1); }
  }
  let resume; const p = new ProbePool(); p.connect = () => new Promise(resolve => { resume = () => resolve(p); });
  const abort = new AbortController(); const pending = policyCall(p, 'products', abort.signal); abort.abort(); resume();
  await assert.rejects(pending, { code: 'PRODUCT_READ_ABORTED' }); assert.equal(p.calls.length, 0); assert.equal(p.releases.length, 1); assert.ok(p.releases[0] instanceof Error);
});
test('independent: failed and non-Error COMMIT never retries/returns success; rollback errors retain both failures and discard once', async () => {
  for (const error of [new Error('independent synthetic commit failure'), 'non-error synthetic failure']) {
    const p = new ProbePool(); p.fail = { at: 'COMMIT', error };
    await assert.rejects(policyCall(p, 'sales'), actual => actual === error); assert.equal(p.calls.filter(c => c.at === 'COMMIT').length, 1);
    assert.equal(states(p).at(-1), 'ROLLBACK'); assert.equal(p.releases.length, 1); assert.ok(p.releases[0] instanceof Error);
  }
  const p = new ProbePool(); p.identities = []; const failure = new Error('independent synthetic rollback failure'); p.fail = { at: 'ROLLBACK', error: failure };
  await assert.rejects(policyCall(p, 'products'), error => error instanceof AggregateError && error.errors.length === 2 && error.errors[0].code === 'FORBIDDEN' && error.errors[1] === failure);
  assert.equal(p.releases.length, 1); assert.equal(p.releases[0], failure);
});


test('independent: release failure never reports a successful grant or retries connection ownership cleanup', async () => {
  const p = new ProbePool(); const failedRelease = new Error('independent synthetic release failure');
  p.release = error => { p.releases.push(error); throw failedRelease; };
  await assert.rejects(policyCall(p, 'sales'), error => error === failedRelease);
  assert.equal(p.connects, 1); assert.equal(p.releases.length, 1); assert.equal(states(p).at(-1), 'COMMIT');
  assert.equal(p.calls.filter(c => c.at === 'ROLLBACK').length, 0);
});

const origin = 'https://independent-synthetic.invalid'; const time = '2026-10-20T12:00:00.000Z'; const token = Buffer.alloc(32, 43).toString('base64url');
const postgres = () => ({ target: { host: 'never-connect.invalid', port: 5432, database: 'INDEPENDENT_SYNTHETIC_ONLY', user: 'SYNTHETIC_ONLY', password: 'SYNTHETIC_NOT_A_CREDENTIAL', ssl: false }, max: 2, maxPendingAcquisitions: 2, connectionTimeoutMillis: 1000, acquisitionTimeoutMillis: 1000, queryTimeoutMillis: 1000, statementTimeoutMillis: 900, lockTimeoutMillis: 800, idleInTransactionTimeoutMillis: 1000, idlePoolTimeoutMillis: 1000, disposeGraceMillis: 0, disposeTimeoutMillis: 1000 });
const options = authorization => ({ postgres: postgres(), authentication: { trustedOrigin: origin, now: () => time, policy: createSourceAuthenticationPolicy(900) }, authorization, productMedia: null });
class InjectDriver extends EventEmitter {
  allocations = 0; connects = 0; releases = []; calls = []; ends = 0; current = identity();
  factory = () => { this.allocations++; return this; };
  async connect() {
    this.connects++; const emitter = new EventEmitter();
    return Object.assign(emitter, { query: (sql, values = []) => this.query(sql, values), release: error => { this.releases.push(error); } });
  }
  async end() { this.ends++; }
  async query(sql, values) {
    this.calls.push({ sql, values: structuredClone(values) }); let rows = [];
    if (sql.startsWith('BEGIN ') || sql === 'COMMIT' || sql === 'ROLLBACK') { /* control */ }
    else if (sql.includes('/* read-authorization:identity */')) rows = [this.current];
    else if (sql.includes('/* read-authorization:warehouses */')) rows = warehouses();
    else if (sql.includes('FROM naijue_erp.user_account a JOIN')) rows = [{ ...identity(), login_name: 'SYNTHETIC.only', password_hash: 'SYNTHETIC_NOT_A_PASSWORD_HASH', auth_version: 1 }];
    else if (sql === 'SELECT enabled FROM naijue_erp.hall WHERE id = $1 FOR SHARE') rows = [{ enabled: true }];
    else if (sql.includes('FROM naijue_erp.auth_session')) rows = [{ token_hash: sessionTokenHash(token), account_id: ids.account, auth_version: 1, created_at: time, expires_at: '2026-10-20T12:15:00.000Z', revoked_at: null }];
    else if (/SELECT COUNT\(\*\)::text AS exact_total FROM naijue_erp\.(sales_header|transfer_header)/.test(sql)) rows = [{ exact_total: '0' }];
    else if (/SELECT h\.id, h\.number/.test(sql) && /FROM naijue_erp\.(sales_header|transfer_header)/.test(sql)) { /* empty authorized page */ }
    else if (sql.includes('FROM naijue_erp.product p')) { /* absent target */ }
    else throw new Error('Independent script encountered an unexpected SQL shape');
    return { rows: structuredClone(rows), rowCount: rows.length };
  }
}
const post = (api, url, payload, cookie = true) => api.app.inject({ method: 'POST', url, payload, headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie: `__Host-naijue_session=${token}` } : {}) } });
test('independent: native selector is exact, rejects overrides/inherited keys/symbols before allocating or connecting a driver', async () => {
  const nonenumerable = Object.defineProperty({ mode: 'source-confirmed-native' }, 'transfers', { value: undefined });
  const symbol = { mode: 'source-confirmed-native', [Symbol('extra')]: true };
  const inheritedOverride = Object.assign(Object.create({ transfers: 'not allowed' }), { mode: 'source-confirmed-native' });
  for (const value of [undefined, null, [], {}, 'source-confirmed-native', { kind: 'source-confirmed-native' }, { mode: undefined }, { mode: 'other' }, { mode: 'source-confirmed-native', transfers: undefined }, { mode: 'source-confirmed-native', kind: undefined }, nonenumerable, symbol, Object.create({ mode: 'source-confirmed-native' }), inheritedOverride]) {
    const driver = new InjectDriver(); await assert.rejects(createPostgresReadApi(options(value), driver.factory), TypeError);
    assert.equal(driver.allocations, 0); assert.equal(driver.connects, 0); assert.equal(driver.ends, 0);
  }
});
test('independent: sole own-key native selector (ordinary/null prototype) constructs one lazy owned non-listening pool only', async () => {
  for (const authorization of [{ mode: 'source-confirmed-native' }, Object.assign(Object.create(null), { mode: 'source-confirmed-native' })]) {
    const driver = new InjectDriver(); const api = await createPostgresReadApi(options(authorization), driver.factory);
    assert.equal(driver.allocations, 1); assert.equal(driver.connects, 0); assert.equal(api.app.server.listening, false);
    for (const url of ['/sales/commands', '/transfers/commands', '/products/commands', '/accounts']) assert.equal((await post(api, url, {})).statusCode, 404);
    assert.equal(driver.connects, 0); await api.close(); await api.close(); assert.equal(driver.ends, 1);
  }
});
test('independent: request JSON cannot select profile, omit session, fabricate role/hall, or bypass business-input validation', async () => {
  const driver = new InjectDriver(); const api = await createPostgresReadApi(options({ mode: 'source-confirmed-native' }), driver.factory);
  try {
    const unauthenticated = await post(api, '/sales/query', { ...salesInput(), mode: 'source-confirmed-native', role: 'ADMIN', hallId: ids.otherHall }, false);
    assert.equal(unauthenticated.statusCode, 401); assert.equal(driver.connects, 0);
    const invalid = await post(api, '/sales/query', { ...salesInput(), mode: 'source-confirmed-native', authorization: { mode: 'source-confirmed-native' } });
    assert.equal(invalid.statusCode, 400); assert.equal(driver.calls.some(c => c.sql.includes('/* read-authorization:identity */')), false);
  } finally { await api.close(); }
});
test('independent: authenticated native sales shares one pool, keeps current-hall predicate before foreign filter, and captured selector survives caller mutation', async () => {
  const authorization = { mode: 'source-confirmed-native' }; const driver = new InjectDriver(); const api = await createPostgresReadApi(options(authorization), driver.factory);
  authorization.mode = 'do-not-use'; authorization.transfers = { authorize() { throw new Error('Injected replacement'); } };
  try {
    const payload = salesInput(); payload.filter.hallId = ids.otherHall; const response = await post(api, '/sales/query', payload);
    assert.equal(response.statusCode, 200, response.body); assert.deepEqual(response.json(), { page: 1, pageSize: 20, exactTotal: '0', items: [] });
    assert.equal(driver.allocations, 1); assert.equal(driver.connects, 3); assert.equal(driver.releases.length, 3);
    const count = driver.calls.find(c => /SELECT COUNT\(\*\)::text AS exact_total FROM naijue_erp.sales_header/.test(c.sql));
    assert.deepEqual(count.values, [ids.hall, ids.otherHall]); assert.match(count.sql, /h\.hall_id = \$1::uuid/); assert.match(count.sql, /AND h\.hall_id = \$2/);
  } finally { await api.close(); }
});
test('independent: native lookup denies a current account changed after authentication before any sales count/page query; sibling product stays independent', async () => {
  const driver = new InjectDriver(); const api = await createPostgresReadApi(options({ mode: 'source-confirmed-native' }), driver.factory);
  try {
    driver.current = { ...identity(), hall_id: ids.otherHall, native_hall_id: ids.otherHall };
    const denied = await post(api, '/sales/query', salesInput()); assert.equal(denied.statusCode, 403); assert.equal(driver.calls.some(c => /FROM naijue_erp.sales_header/.test(c.sql)), false);
    driver.current = identity(); const sibling = await post(api, '/products/basics/query', { productId: ids.product }); assert.equal(sibling.statusCode, 200, sibling.body);
    assert.equal(driver.allocations, 1); assert.equal(driver.calls.filter(c => c.sql.includes('/* read-authorization:identity */')).length, 2);
  } finally { await api.close(); }
});
test('independent: native profile preserves existing canonical transfer endpoint/creator union, without a second native-policy lookup', async () => {
  const driver = new InjectDriver(); const api = await createPostgresReadApi(options({ mode: 'source-confirmed-native' }), driver.factory);
  try {
    const payload = { filter: { startDate: null, endDate: null, statuses: [], fromWarehouseIds: [], toWarehouseIds: [], number: null }, page: 1, pageSize: 20 };
    const response = await post(api, '/transfers/query', payload); assert.equal(response.statusCode, 200, response.body);
    const count = driver.calls.find(c => /SELECT COUNT\(\*\)::text AS exact_total FROM naijue_erp.transfer_header/.test(c.sql));
    assert.deepEqual(count.values, [ids.hall, ids.hall, ids.hall, 'SALESPERSON']); assert.match(count.sql, / OR /); assert.match(count.sql, /created_role/);
    assert.equal(driver.calls.some(c => c.sql.includes('/* read-authorization:identity */')), false); assert.equal(driver.allocations, 1);
  } finally { await api.close(); }
});
test('independent source/schema: fresh identity is non-secret and read-only; one bounded pool/native factory/canonical transfer; no commands or runtime defaults', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const native = read('../../adapters/postgres/src/source-confirmed-read-authorization.ts'); const api = read('../../apps/api/src/postgres-read-api.ts');
  const schema = read('../../adapters/postgres/migrations/0001_runtime_sales.sql');
  assert.match(schema, /CREATE TABLE naijue_erp\.staff[\s\S]*?employment_status text NOT NULL/); assert.match(schema, /staff_id uuid NOT NULL UNIQUE REFERENCES naijue_erp.staff\(id\)/);
  assert.match(native, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/); assert.doesNotMatch(native, /\b(?:INSERT|UPDATE|DELETE|FOR UPDATE|FOR SHARE)\b|new Pool\(|process\.env|password_hash|auth_session|token_hash/);
  assert.equal((api.match(/new BoundedPostgresPool\(/g) ?? []).length, 1); assert.match(api, /createSourceConfirmedPostgresReadAuthorization\(pool\)/); assert.match(api, /transfers: createSourceConfirmedTransferQueryAuthorization\(\)/);
  assert.doesNotMatch(api, /process\.env|\.listen\s*\(|createSalesHttpPlugin|createTransferHttpPlugin|createPartyMaintenanceHttpPlugin/);
});
