/** TEST ONLY. Actual organization read HTTP/service, finite in-memory source.
 * No listener/PG/credentials, no business mutations, no response rewriting.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const ORIGIN = 'https://synthetic-management.invalid';
export const id = number => `9a110000-0000-4000-8000-${String(number).padStart(12, '0')}`;
export const IDS = Object.freeze({ hallA: id(1), hallB: id(2), warehouseA: id(11), warehouseB: id(12), methodA: id(21), methodB: id(22), accountA: id(31), accountB: id(32), accountAB: id(33), unknown: id(999) });
export const NAMES = Object.freeze({ hallA: 'SYNTHETIC 一厅', hallB: 'SYNTHETIC 二厅', warehouseA: 'SYNTHETIC 一厅仓', warehouseB: 'SYNTHETIC 二厅仓', methodA: 'SYNTHETIC 现金', methodB: 'SYNTHETIC 转账', accountA: 'SYNTHETIC 甲厅账户', accountB: 'SYNTHETIC 乙厅账户', accountAB: 'SYNTHETIC 双厅账户' });
export const QUERY = Object.freeze({ search: '', status: 'normal', hallId: null, page: 1, pageSize: 20 });
const KIND_PATHS = Object.freeze({ HALL: '/organization/halls', WAREHOUSE: '/organization/warehouses', PAYMENT_METHOD: '/payment/methods', PAYMENT_ACCOUNT: '/payment/accounts' });
const freeze = value => { if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); } return value; };
export function createMultiHallSeed() {
  const root = (id, name) => ({ id, name, enabled: true, version: 1 });
  return {
    halls: [{ ...root(IDS.hallA, NAMES.hallA), defaultWarehouseId: IDS.warehouseA }, { ...root(IDS.hallB, NAMES.hallB), defaultWarehouseId: IDS.warehouseB }],
    warehouses: [{ ...root(IDS.warehouseA, NAMES.warehouseA), hallId: IDS.hallA }, { ...root(IDS.warehouseB, NAMES.warehouseB), hallId: IDS.hallB }],
    methods: [root(IDS.methodA, NAMES.methodA), root(IDS.methodB, NAMES.methodB)],
    accounts: [{ ...root(IDS.accountA, NAMES.accountA), paymentMethodId: IDS.methodA, hallIds: [IDS.hallA] }, { ...root(IDS.accountB, NAMES.accountB), paymentMethodId: IDS.methodB, hallIds: [IDS.hallB] }, { ...root(IDS.accountAB, NAMES.accountAB), paymentMethodId: IDS.methodA, hallIds: [IDS.hallA, IDS.hallB] }],
  };
}
export function checkedRepository(repoRoot, expectedCheckpoint) {
  assert.ok(path.isAbsolute(repoRoot ?? ''), 'Explicit absolute repoRoot required');
  assert.match(expectedCheckpoint ?? '', /^[0-9a-f]{40}$/, 'Explicit full expected checkpoint required');
  const actual = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(actual, expectedCheckpoint, 'Repository checkpoint changed; review/rebind before execution');
  const binding = JSON.parse(readFileSync(new URL('./SOURCE_BINDING.json', import.meta.url), 'utf8'));
  // Later evidence-only commits may reuse this reviewed source binding; all bound bytes remain checked below.
  execFileSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', binding.expectedCheckpoint, expectedCheckpoint], { stdio: 'pipe' });
  for (const file of binding.sourceFiles) {
    const actualHash = createHash('sha256').update(readFileSync(path.join(repoRoot, file.path))).digest('hex');
    assert.equal(actualHash, file.sha256, 'Bound source changed: ' + file.path);
  }
  return { repoRoot, expectedCheckpoint };
}
export async function createMultiHallReadFixture({ repoRoot, expectedCheckpoint, seed = createMultiHallSeed(), actorName = 'admin' } = {}) {
  checkedRepository(repoRoot, expectedCheckpoint);
  const fromRepo = relative => import(pathToFileURL(path.join(repoRoot, relative)).href);
  const require = createRequire(path.join(repoRoot, 'package.json'));
  const Fastify = require('fastify');
  const [{ createOrganizationMaintenanceReadHttpPlugin }, { requireDomain }, { entityId }, { qaPrincipal, qaStaff }, { createReplicaPreviewTransport }] = await Promise.all([
    fromRepo('apps/api/src/organization-maintenance-http.ts'), fromRepo('packages/domain/src/errors.ts'), fromRepo('packages/domain/src/values.ts'),
    fromRepo('apps/web/demo-replica/frontend/qa-reference-fixtures.mts'), fromRepo('apps/web/demo-replica/frontend/runtime-preview-transport.ts'),
  ]);
  const source = freeze(structuredClone(seed));
  const identities = new Map([
    ['admin', { accountId: qaPrincipal.accountId, staffId: qaPrincipal.staffId, hallId: null, role: 'ADMIN', employmentStatus: '在职', loginEnabled: true }],
    ['warehouse', { accountId: qaStaff[1].account.id, staffId: qaStaff[1].id, hallId: null, role: 'WAREHOUSE', employmentStatus: '在职', loginEnabled: true }],
    ['salesperson', { accountId: qaStaff[2].account.id, staffId: qaStaff[2].id, hallId: IDS.hallA, role: 'SALESPERSON', employmentStatus: '在职', loginEnabled: true }],
  ]);
  let selectedActor = actorName, actorOverride;
  const counts = { transactions: 0, authorizationChecks: 0, sourceReads: 0, writeAttempts: 0, fallbackReads: 0 };
  const calls = [];
  const valid = (kind, value) => entityId(kind, value);
  const find = (rows, target, kind) => { valid(kind, target); const found = rows.find(row => row.id === target); requireDomain(found, 'INVALID_DATABASE_VALUE', 'Synthetic native reference missing'); return found; };
  const ref = row => ({ id: row.id, name: row.name, enabled: row.enabled });
  function nativeRows(kind) {
    const base = row => ({ id: row.id, version: row.version, createdAt: null, updatedAt: null });
    if (kind === 'HALL') return source.halls.map(row => {
      const warehouse = row.defaultWarehouseId === null ? null : find(source.warehouses, row.defaultWarehouseId, 'warehouse');
      return { ...base(row), kind, name: row.name, enabled: row.enabled, defaultCustomer: null, defaultSalesWarehouse: warehouse ? { ...ref(warehouse), hallId: warehouse.hallId } : null };
    });
    if (kind === 'WAREHOUSE') return source.warehouses.map(row => ({ ...base(row), kind, name: row.name, enabled: row.enabled, hall: ref(find(source.halls, row.hallId, 'hall')) }));
    if (kind === 'PAYMENT_METHOD') return source.methods.map(row => ({ ...base(row), kind, name: row.name, enabled: row.enabled }));
    requireDomain(kind === 'PAYMENT_ACCOUNT', 'FORBIDDEN', 'Finite organization kinds only');
    return source.accounts.map(row => ({ ...base(row), kind, name: row.name, enabled: row.enabled, paymentMethod: ref(find(source.methods, row.paymentMethodId, 'paymentMethod')), halls: row.hallIds.map(hall => ref(find(source.halls, hall, 'hall'))).sort((a, b) => a.id.localeCompare(b.id)) }));
  }
  const currentActor = () => {
    if (selectedActor === null) return null;
    const identity = identities.get(selectedActor);
    assert.ok(identity, 'Known synthetic actor selection required');
    return structuredClone(actorOverride ?? { accountId: identity.accountId, hallId: identity.hallId });
  };
  async function assertAllowed(actor, kind, action) {
    counts.authorizationChecks++;
    const identity = [...identities.values()].find(row => row.accountId === actor.accountId);
    requireDomain(identity && identity.loginEnabled === true && identity.employmentStatus === '在职'
      && ['ADMIN', 'WAREHOUSE'].includes(identity.role) && identity.hallId === actor.hallId
      && (identity.hallId === null || source.halls.some(hall => hall.id === identity.hallId && hall.enabled))
      && Object.hasOwn(KIND_PATHS, kind) && ['LIST', 'DETAIL'].includes(action), 'FORBIDDEN', 'Current synthetic organization read scope denied');
  }
  const denyWrite = () => { counts.writeAttempts++; throw Error('SYNTHETIC_READ_ONLY_NO_WRITES_OR_RECEIPTS'); };
  const unitOfWork = { async transaction(work) {
    counts.transactions++;
    let authorized = false;
    const tx = {
      evidence: { async assertAllowed(...args) { await assertAllowed(...args); authorized = true; }, getReceipt: denyWrite, prepare: denyWrite, complete: denyWrite },
      async readList(kind, query) {
        assert.ok(authorized, 'Authorization precedes source enumeration'); counts.sourceReads++;
        const lower = query.search.toLowerCase();
        const matched = nativeRows(kind).filter(row => row.name.toLowerCase().includes(lower)
          && (query.status === 'all' || row.enabled === (query.status === 'normal'))
          && (query.hallId === null || (kind === 'HALL' ? row.id === query.hallId : kind === 'WAREHOUSE' ? row.hall.id === query.hallId : kind === 'PAYMENT_ACCOUNT' ? row.halls.some(hall => hall.id === query.hallId) : false))
          && (!('paymentMethodId' in query) || query.paymentMethodId === null || kind === 'PAYMENT_ACCOUNT' && row.paymentMethod.id === query.paymentMethodId))
          .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        return structuredClone({ kind, page: query.page, pageSize: query.pageSize, total: matched.length, items: matched.slice((query.page - 1) * query.pageSize, query.page * query.pageSize) });
      },
      async readDetail(kind, target) { assert.ok(authorized, 'Authorization precedes detail read'); counts.sourceReads++; return structuredClone(nativeRows(kind).find(row => row.id === target) ?? null); },
    };
    return work(tx);
  } };
  const app = Fastify({ logger: false });
  app.register(createOrganizationMaintenanceReadHttpPlugin({ authenticate: async () => currentActor(), unitOfWork, kinds: Object.keys(KIND_PATHS) }));
  await app.ready();
  const fallback = createReplicaPreviewTransport();
  const nativePath = pathname => Object.values(KIND_PATHS).some(prefix => [prefix + '/query', prefix + '/detail/query'].includes(pathname.replace(/^\/api(?=\/)/, '')));
  const json = (status, body) => ({ status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
  const fixture = {
    sourceCheckpoint: expectedCheckpoint, origin: ORIGIN, unitOfWork,
    snapshot: () => structuredClone(source), statistics: () => structuredClone(counts), calls: () => structuredClone(calls),
    selectActor(name, override) { assert.ok(name === null || identities.has(name)); selectedActor = name; actorOverride = override ? structuredClone(override) : undefined; },
    patchIdentity(name, patch) { const row = identities.get(name); assert.ok(row); identities.set(name, { ...row, ...structuredClone(patch) }); },
    canHandle: (pathname, method) => method === 'POST' && nativePath(pathname),
    async inject({ kind, operation = 'list', body = QUERY, headers = { 'content-type': 'application/json' }, suffix = '' }) {
      assert.ok(Object.hasOwn(KIND_PATHS, kind));
      const result = await app.inject({ method: 'POST', url: KIND_PATHS[kind] + (operation === 'detail' ? '/detail/query' : '/query') + suffix, headers, payload: body });
      return { status: result.statusCode, headers: result.headers, body: result.body };
    },
    async request(request) {
      const url = new URL(request.url), method = request.method ?? 'GET';
      assert.equal(url.origin, ORIGIN, 'Closed synthetic origin'); assert.equal(url.username + url.password + url.hash, '', 'Closed synthetic URL');
      if (/\/(?:commands)(?:\/|$)|\/receipts(?:\/|$)/.test(url.pathname)) { counts.writeAttempts++; return json(501, { error: { code: 'SYNTHETIC_READ_ONLY', message: 'Writes and receipts are forbidden in this fixture' } }); }
      if (nativePath(url.pathname)) {
        const result = await app.inject({ method, url: url.pathname.slice(4) + url.search, headers: request.headers ?? { 'content-type': 'application/json' }, payload: request.body });
        calls.push({ source: 'ACTUAL_ORGANIZATION_READ_HTTP_SERVICE_MEMORY', method, path: url.pathname, status: result.statusCode });
        return { status: result.statusCode, headers: { ...result.headers, 'x-synthetic-read-source': 'actual-organization-service-memory' }, body: result.body };
      }
      const unrelatedRead = method === 'GET' && url.pathname === '/api/auth/session'
        || method === 'POST' && /^\/api\//.test(url.pathname) && url.pathname.endsWith('/query') && !/^\/api\/(organization|payment)\//.test(url.pathname);
      if (!unrelatedRead) return json(501, { error: { code: 'SYNTHETIC_READ_ONLY', message: 'Only exact organization reads and explicitly delegated original reads exist' } });
      counts.fallbackReads++;
      const response = await fallback.http.fetch(request.url, { method, credentials: 'same-origin', headers: request.headers ?? {}, ...(request.body ? { body: request.body } : {}), signal: new AbortController().signal });
      calls.push({ source: 'ORIGINAL_UNRELATED_READ_FIXTURE', method, path: url.pathname, status: response.status });
      return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
    },
    async close() { await app.close(); },
  };
  return fixture;
}
