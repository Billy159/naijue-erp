/** TEST ONLY source. Importing this module NEVER binds/listens or starts a fixture.
 * Actual start must run the frozen server-source copy from a reviewed build. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, appendFile, mkdir, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createInventoryProfile, routeInventoryProfile, profileDigest } from './inventory-profile.mjs';
import { projectInventoryColors } from '../../../../apps/web/src/inventory/display-projection.ts';
import { createReplicaPreviewTransport } from '../../../../apps/web/demo-replica/frontend/runtime-preview-transport.ts';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function classifyRequest({ method, target, headers = {}, port }) {
  const reject = status => ({ status, kind: 'reject', logPath: 'UNSUPPORTED_OR_INVALID_REDACTED' });
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) return reject(403);
  if (headers.host !== `127.0.0.1:${port}` || headers.origin !== undefined && headers.origin !== `http://127.0.0.1:${port}` || headers['sec-fetch-site'] && !['same-origin', 'none'].includes(headers['sec-fetch-site'])) return reject(403);
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//') || /[%\\\s?#]/.test(target) || target.includes('..') || target.includes('//')) return reject(400);
  if (method === 'GET' && /^\/inventory\/(100|200|500)$/.test(target)) return { kind: 'document', pageSize: Number(target.split('/').at(-1)), logPath: target };
  if (method === 'GET' && /^\/assets\/[A-Za-z0-9_./-]+$/.test(target)) return { kind: 'asset', file: target.slice(1), logPath: target };
  if (method === 'GET' && target === '/__inventory/bootstrap') return { kind: 'bootstrap', logPath: target };
  if (method === 'GET' && target === '/api/auth/session') return { kind: 'session', logPath: target };
  if (method === 'POST' && ['/api/inventory/query', '/api/inventory/candidates/query'].includes(target)) return { kind: 'read', endpoint: target.slice(4), logPath: target };
  if (method === 'POST' && ['/__inventory/sample/before', '/__inventory/sample/oracle', '/__inventory/sample/after'].includes(target)) return { kind: target.split('/').at(-1), logPath: target };
  // Unknown auth/login/password/write rejected BEFORE request body is requested.
  return reject(501);
}
export function safeRequestSummary(endpoint, body) {
  if (endpoint === '/inventory/query') return { page: body.page, pageSize: body.pageSize, filterIds: Object.fromEntries(Object.entries(body.filter).map(([key, rows]) => [key, rows.map(row => row.id)])) };
  if (endpoint === '/inventory/candidates/query') return { kind: body.kind, page: body.page, pageSize: body.pageSize, selectedIds: body.selectedIds, categoryIds: body.categoryIds, searchSha256: sha256(String(body.search)), searchChars: body.search.length };
  return null; // never recursively log arbitrary submitted credential fields
}
export function makeExpectedRows(dto, settings) {
  const rows = [];
  for (const p of dto.products) {
    rows.push({ productId: p.id, kind: 'product-total', color: null, warehouse: null, total: p.total.knownQuantity, cells: Object.fromEntries(p.sizes.map(s => [s.id, { state: 'known', quantity: p.sizeTotals[s.id].knownQuantity }])) });
    for (const group of settings.fit ? p.colorFits : projectInventoryColors(p)) {
      rows.push({ productId: p.id, kind: 'color-total', fitLabel: group.fit?.label ?? null, color: group.color.label, warehouse: null, total: group.total.knownQuantity, cells: Object.fromEntries(p.sizes.map(s => [s.id, { state: 'known', quantity: group.sizeTotals[s.id].knownQuantity }])) });
      for (const row of group.rows) rows.push({ productId: p.id, kind: 'warehouse', fitLabel: group.fit?.label ?? null, color: group.color.label, warehouse: row.warehouse.label, total: row.total.knownQuantity,
        cells: Object.fromEntries(p.sizes.map(s => { const cell = row.cells[s.id]; return [s.id, cell.state === 'known' ? { state: 'known', quantity: cell.quantity } : { state: 'not-applicable' }]; })) });
    }
  }
  return rows;
}
export function validateOperation(body) {
  assert.ok(body && typeof body === 'object' && !Array.isArray(body));
  assert.deepEqual(Object.keys(body).sort(), ['mode', 'pageSize', 'sampleId', 'setting', 'settings'].sort());
  assert.ok([100, 200, 500].includes(body.pageSize)); assert.ok(['cold-1', 'repeat-1', 'repeat-2', 'functional-only'].includes(body.sampleId));
  assert.ok(['FIRST_QUERY', 'DISPLAY_SETTING'].includes(body.mode));
  assert.deepEqual(Object.keys(body.settings).sort(), ['category', 'supplier', 'fit', 'sizeGroup', 'season', 'subtotal', 'total', 'sizeDescription'].sort());
  assert.ok(Object.values(body.settings).every(value => typeof value === 'boolean'));
  if (body.mode === 'FIRST_QUERY') assert.equal(body.setting, null);
  else assert.ok(Object.hasOwn(body.settings, body.setting));
  return body;
}
export async function verifiedFile(root, record) {
  assert.ok(record && typeof record.path === 'string' && !path.isAbsolute(record.path) && !record.path.split(/[\\/]/).some(p => !p || p === '.' || p === '..'));
  assert.match(record.sha256, /^[a-f0-9]{64}$/); assert.ok(Number.isSafeInteger(record.bytes));
  const base = await realpath(root); let cursor = base;
  for (const part of record.path.split('/')) { cursor = path.join(cursor, part); assert.equal((await lstat(cursor)).isSymbolicLink(), false); }
  assert.ok((await realpath(cursor)).startsWith(base + path.sep));
  const bytes = await readFile(cursor); assert.equal(bytes.length, record.bytes); assert.equal(sha256(bytes), record.sha256); return bytes;
}

/** Pure router, no socket or disk writes. Injected body()/asset()/record() are
 * called only AFTER the request policy passes. Production APIs never consulted. */
export function createInventoryRouter({ profile, port, delayMs = 25, authSession, asset, record = async () => {}, receipt = async () => {} }) {
  assert.equal(delayMs, 25, 'This baseline source fixes SYNTHETIC server delay25ms, not DB/network throttle');
  const operations = new Map(), completed = new Set(), deadlines = new Map(); let nextId = 1, lastRead = null;
  async function abandon(key, reason) {
    const state = operations.get(key); if (!state) return;
    clearTimeout(deadlines.get(key)); deadlines.delete(key); operations.delete(key); completed.add(key);
    const { actualRead, ...before } = state;
    await receipt({ scope: 'FINITE FUNCTIONAL OBSERVATION; no ready/performance result', before, status: 'ABORTED', reason,
      browser: { status: 'ABORTED', clickToReadyMs: null, bodyToReadyMs: null, clickToCandidateReadyMs: null, bodyToCandidateReadyMs: null, performanceAcceptance: false }, after: { datasetSha256: profileDigest(profile), kind: 'VERIFIED_UNCHANGED' } });
  }
  const json = (status, value, headers = {}) => { const bytes = Buffer.from(JSON.stringify(value)); return { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'content-length': String(bytes.length), ...headers }, body: bytes }; };
  const route = async request => {
    const policy = classifyRequest({ ...request, port }), id = nextId++, start = performance.now();
    if (policy.kind === 'reject') { await record({ id, method: request.method, endpoint: policy.logPath, status: policy.status, body: null }); return json(policy.status, { error: { code: policy.status === 403 ? 'FORBIDDEN' : policy.status === 400 ? 'INVALID_REQUEST' : 'NOT_IMPLEMENTED' } }); }
    let status = 500, summary = null, generationMs = 0, delayActualMs = 0, serializationMs = 0, responseSha256 = null, responseBytes = null;
    try {
      if (policy.kind === 'asset' || policy.kind === 'document') { const response = await asset(policy.kind === 'document' ? 'host-shell.html' : policy.file); status = response.status; return response; }
      if (policy.kind === 'bootstrap') { status = 200; return json(200, { scope: 'SYNTHETIC INVENTORY600 ORIGINAL COPIED RENDERER; no PG/no optimization', datasetSha256: profileDigest(profile), exactTotalProducts: 600, sourceOnlyPreparationRequiresSeparateActualBuildReview: true }); }
      if (policy.kind === 'session') { const response = await authSession(); status = response.status; return { ...response, headers: { ...response.headers, 'cache-control': 'no-store' } }; }
      const bytes = await request.body(policy.kind === 'read' || policy.kind === 'before' ? 65_536 : 1_048_576);
      if (bytes.length > (policy.kind === 'read' || policy.kind === 'before' ? 65_536 : 1_048_576)) { status = 413; return json(413, { error: { code: 'BODY_TOO_LARGE' } }); }
      let body; try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { status = 400; return json(400, { error: { code: 'INVALID_JSON' } }); }
      if (policy.kind === 'read') {
        const began = performance.now(); const result = await routeInventoryProfile(profile, policy.endpoint, body, { signal: request.signal }); generationMs = performance.now() - began;
        if (result.status === 200) summary = safeRequestSummary(policy.endpoint, body);
        const waited = performance.now(); await new Promise(resolve => setTimeout(resolve, delayMs)); delayActualMs = performance.now() - waited;
        const serializationBegan = performance.now(); const response = json(result.status, result.body, { 'x-opt00-inventory-request-id': String(id) });
        responseBytes = response.body.length; responseSha256 = sha256(response.body); serializationMs = performance.now() - serializationBegan;
        response.headers['x-opt00-inventory-response-sha256'] = responseSha256;
        response.headers['x-opt00-inventory-generation-ms'] = String(generationMs); response.headers['x-opt00-inventory-delay-ms'] = String(delayActualMs);
        if (policy.endpoint === '/inventory/query' && result.status === 200) {
          // Retain actual completed-response evidence, NEVER serve a request
          // from it. Every original read above regenerates/validates its facts.
          lastRead = { requestId: String(id), query: body, dto: result.body, responseSha256, responseBytes };
          for (const state of operations.values()) if (state.needsRead && id >= state.armRequestCursor && JSON.stringify(state.query) === JSON.stringify(body)) state.actualRead = lastRead;
        }
        status = response.status; return response;
      }
      if (policy.kind === 'before') {
        const operation = validateOperation(body), key = `${operation.pageSize}/${operation.mode}/${operation.setting ?? 'query'}/${operation.sampleId}`;
        assert.ok(!operations.size && !completed.has(key), 'No repeated ARM or overwritten sample');
        const filter = { products: [], categories: [], warehouses: [], suppliers: [], fits: [], seasons: [] }, query = { filter, page: 1, pageSize: operation.pageSize };
        const needsRead = operation.mode === 'FIRST_QUERY' || operation.setting === 'fit';
        if (operation.mode === 'DISPLAY_SETTING') assert.ok(lastRead && JSON.stringify(lastRead.query) === JSON.stringify(query), 'Display operation needs original successful matching page first');
        const state = { key, operation, query, needsRead, actualRead: needsRead ? null : lastRead, datasetSha256: profileDigest(profile), armRequestCursor: nextId, atUtc: new Date().toISOString() };
        operations.set(key, state); status = 200;
        const deadline = setTimeout(() => { void abandon(key, 'SERVER_FUNCTIONAL_BOUNDARY_EXPIRED_120000_MS_NO_ACCEPTANCE').catch(() => {}); }, 120_000); deadline.unref(); deadlines.set(key, deadline);
        return json(200, { key, operation, query, needsRead, baseRequestId: needsRead ? null : lastRead.requestId, datasetSha256: state.datasetSha256, armRequestCursor: state.armRequestCursor, atUtc: state.atUtc,
          scope: 'NO preloaded500 oracle. Public candidate-ready first, post-candidate verification separately; functional-only protocol pending timing review' });
      }
      if (policy.kind === 'oracle') {
        assert.deepEqual(Object.keys(body).sort(), ['key', 'requestId', 'responseSha256'].sort()); const state = operations.get(body.key); assert.ok(state?.actualRead);
        const fact = state.actualRead; assert.equal(body.requestId, fact.requestId); assert.equal(body.responseSha256, fact.responseSha256);
        const dto = fact.dto; state.oracleVerified = true; status = 200;
        return json(200, { key: body.key, requestId: fact.requestId, responseSha256: fact.responseSha256, responseBytes: fact.responseBytes, query: state.query, datasetSha256: state.datasetSha256,
          dto: { page: dto.page, pageSize: dto.pageSize, exactTotalProducts: dto.exactTotalProducts, readReference: dto.readReference, warehouseLabels: dto.warehouseLabels, allMatchesTotal: dto.allMatchesTotal, products: dto.products.map(({ id, code, name, sizes, categoryLabel, supplierLabel, seasonLabel, sizeGroup }) => ({ id, code, name, sizes, categoryLabel, supplierLabel, seasonLabel, sizeGroup })) },
          expectedRows: makeExpectedRows(dto, state.operation.settings), scope: 'POST-CANDIDATE validation from the actual independently regenerated validated business response, NOT a cache hit or timed JSON clone' });
      }
      assert.equal(policy.kind, 'after');
      assert.deepEqual(Object.keys(body).sort(), ['key', 'status', 'browser'].sort()); const state = operations.get(body.key); assert.ok(state);
      assert.ok(['READY', 'FAILED', 'ABORTED'].includes(body.status)); assert.equal(body.browser.status, body.status);
      if (body.status === 'READY') { assert.ok(state.oracleVerified && body.browser.readyObservation?.ready); assert.ok(Number.isFinite(body.browser.clickToCandidateReadyMs) && body.browser.clickToCandidateReadyMs >= 0); assert.equal(body.browser.performanceAcceptance, false); assert.equal(body.browser.clickToReadyMs, null); assert.equal(body.browser.bodyToReadyMs, null); assert.equal(body.browser.oracle?.requestId, state.actualRead.requestId); assert.equal(body.browser.oracle?.responseSha256, state.actualRead.responseSha256); }
      else { assert.equal(body.browser.clickToReadyMs, null); assert.equal(body.browser.bodyToReadyMs, null); }
      assert.equal(profileDigest(profile), state.datasetSha256);
      const { actualRead, ...before } = state;
      await receipt({ scope: 'FUNCTIONAL-ONLY SYNTHETIC CANONICAL INVENTORY OBSERVATION; formal timing protocol NOT approved', before, actualRead: actualRead ? { requestId: actualRead.requestId, responseSha256: actualRead.responseSha256, wireProductCount: actualRead.dto.products.length, exactTotalProducts: actualRead.dto.exactTotalProducts } : null, browser: body.browser, status: body.status, after: { datasetSha256: profileDigest(profile), kind: 'VERIFIED_UNCHANGED' } });
      clearTimeout(deadlines.get(body.key)); deadlines.delete(body.key); operations.delete(body.key); completed.add(body.key); status = 200; return json(200, { accepted: true, key: body.key });
    } catch (error) { status = policy.kind === 'read' || policy.kind === 'asset' || policy.kind === 'document' || policy.kind === 'session' ? 500 : 400; return json(status, { error: { code: status === 500 ? 'INTERNAL_ERROR' : 'SYNTHETIC_REQUEST_OR_OPERATION_REJECTED' } }); }
    finally { await record({ id, method: request.method, endpoint: policy.logPath, status, body: summary, responseSha256, responseBytes,
      syntheticGenerationWallMs: generationMs, configuredSyntheticServerDelayMs: policy.kind === 'read' ? delayMs : 0, actualDelayWallMs: delayActualMs,
      serializationAndHashWallMs: serializationMs, serverDispatchWallMs: performance.now() - start, realDatabaseTiming: null }); }
  };
  return Object.assign(route, { dispose: async () => { for (const key of [...operations.keys()]) await abandon(key, 'EXPLICIT_HOST_DISPOSAL_BEFORE_VERIFICATION'); } });
}

export async function startInventoryHost({ buildRoot, buildIdentitySha256, rawRoot, port }) {
  assert.equal(process.version, 'v24.21.0'); assert.ok([buildRoot, rawRoot].every(path.isAbsolute));
  const identityBytes = await readFile(path.join(buildRoot, 'build-identity.json')); assert.equal(sha256(identityBytes), buildIdentitySha256); const build = JSON.parse(identityBytes);
  assert.equal(build.format, 'OPT00_INVENTORY600_CANONICAL_TEST_HOST_V1');
  assert.equal(fileURLToPath(import.meta.url), path.join(buildRoot, build.serverEntry), 'Run only the reviewed frozen server-source copy');
  for (const file of build.artifacts) await verifiedFile(buildRoot, file);
  await mkdir(rawRoot, { recursive: false });
  const profile = await createInventoryProfile(), auth = createReplicaPreviewTransport();
  const artifactMap = new Map(build.artifacts.map(file => [file.path, file]));
  const router = createInventoryRouter({ profile, port, delayMs: 25,
    authSession: async () => { const response = await auth.http.fetch(auth.http.origin + '/api/auth/session', { method: 'GET', credentials: 'same-origin', signal: new AbortController().signal }); return { status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) }; },
    asset: async file => { const fact = artifactMap.get(file); if (!fact) return { status: 404, headers: { 'cache-control': 'no-store' }, body: Buffer.alloc(0) }; const body = await verifiedFile(buildRoot, fact); const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream'; return { status: 200, headers: { 'content-type': type, 'content-length': String(body.length), 'cache-control': 'no-store' }, body }; },
    record: value => appendFile(path.join(rawRoot, 'http.ndjson'), JSON.stringify(value) + '\n'),
    receipt: value => writeFile(path.join(rawRoot, value.before.key.replaceAll('/', '-') + '.json'), JSON.stringify({ ...value, runtime: build.runtime, harnessManifestSha256: build.harnessManifestSha256, artifactBuildSha256: build.artifactBuildSha256 }, null, 2) + '\n', { flag: 'wx' }),
  });
  const server = createServer(async (req, res) => {
    const abort = new AbortController(); req.on('aborted', () => abort.abort());
    try { const response = await router({ method: req.method, target: req.url, headers: req.headers, signal: abort.signal, body: async limit => {
      const chunks = []; let bytes = 0; for await (const chunk of req) { bytes += chunk.length; if (bytes > limit) throw new TypeError('Bounded test body exceeded'); chunks.push(chunk); } return Buffer.concat(chunks);
    } }); res.writeHead(response.status, { ...response.headers, connection: 'close' }); res.end(response.body); }
    catch { if (!res.headersSent) res.writeHead(500, { 'cache-control': 'no-store', connection: 'close' }); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  await writeFile(path.join(rawRoot, 'HOST-START.json'), JSON.stringify({ pid: process.pid, argv: process.argv, atUtc: new Date().toISOString(), address: server.address(), buildIdentitySha256, datasetSha256: profileDigest(profile), node: process.version, runtime: build.runtime, fixedSyntheticDelayMs: 25 }, null, 2) + '\n', { flag: 'wx' });
  for (const name of ['SIGTERM', 'SIGINT']) process.once(name, () => { server.close(() => { void router.dispose().then(() => writeFile(path.join(rawRoot, 'HOST-STOP.json'), JSON.stringify({ pid: process.pid, signal: name, atUtc: new Date().toISOString() }) + '\n', { flag: 'wx' })).then(() => process.exit(0), () => process.exit(1)); }); server.closeIdleConnections(); });
  return { server, profile };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [buildRoot, buildIdentitySha256, rawRoot, port] = process.argv.slice(2); assert.equal(process.argv.length, 6);
  await startInventoryHost({ buildRoot, buildIdentitySha256, rawRoot, port: Number(port) });
}
