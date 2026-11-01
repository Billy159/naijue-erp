/** Pure contracts ONLY. No listener/build/browser/PG, no simulated geometry
 * acceptance. Positive DOM snapshots below are declared validator inputs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile, mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createInventoryProfile } from './inventory-profile.mjs';
import { classifyRequest, createInventoryRouter, safeRequestSummary, makeExpectedRows, sha256, verifiedFile } from './serve.mjs';
import { requireManifestShape, mapRuntimeImport, generatePinnedEntry, assertBrowserGraphBoundaries } from './build.mjs';
import { createObservationGate, createMeasuredEpochTracker, claimTerminalOwner, resolveInventoryAction, captureInventoryDom, inspectInventoryReady, DEFAULTS } from './observer.mjs';
const profile = await createInventoryProfile(), port = 58701, headers = { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, 'sec-fetch-site': 'same-origin' };
const query = { filter: { products: [], categories: [], warehouses: [], suppliers: [], fits: [], seasons: [] }, page: 1, pageSize: 500 };
const operation = () => ({ mode: 'FIRST_QUERY', pageSize: 500, setting: null, sampleId: 'functional-only', settings: { ...DEFAULTS } });
function routerFor() {
  const records = [], receipts = [];
  const router = createInventoryRouter({ profile, port,
    authSession: async () => ({ status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from('{"principal":"UNIT_STUB_NOT_PRODUCTION_AUTH"}') }),
    asset: async () => ({ status: 404, headers: {}, body: Buffer.alloc(0) }), record: async value => { records.push(value); }, receipt: async value => { receipts.push(value); } });
  const call = async (target, body, method = 'POST', more = {}) => {
    let readCount = 0; const response = await router({ method, target, headers, signal: new AbortController().signal, body: async limit => { readCount++; const bytes = Buffer.from(JSON.stringify(body)); assert.ok(bytes.length <= limit); return bytes; }, ...more });
    return { ...response, value: response.body.length ? JSON.parse(response.body) : null, readCount };
  };
  return { router, call, records, receipts };
}
test('closed exact loopback Host/Origin and method/path whitelist, before any body', () => {
  for (const target of ['/inventory/100', '/inventory/200', '/inventory/500', '/assets/application.js', '/api/auth/session', '/__inventory/bootstrap']) assert.notEqual(classifyRequest({ method: 'GET', target, headers, port }).kind, 'reject');
  for (const h of [{ ...headers, host: `localhost:${port}` }, { ...headers, host: ['127.0.0.1:' + port] }, { ...headers, origin: 'https://foreign.invalid' }, { ...headers, 'sec-fetch-site': 'cross-site' }]) assert.equal(classifyRequest({ method: 'POST', target: '/api/inventory/query', headers: h, port }).status, 403);
  for (const target of ['/assets/../secret', '/assets/%2e%2e/secret', '//evil.invalid/path', 'https://evil.invalid/api/inventory/query', '/api/inventory/query?password=secret', '/assets/a\\b.js']) assert.equal(classifyRequest({ method: 'POST', target, headers, port }).status, 400);
  for (const target of ['/api/auth/login', '/api/auth/password', '/api/inventory/commands', '/api/products/images/query', '/inventory/600']) assert.equal(classifyRequest({ method: 'POST', target, headers, port }).status, 501);
});
test('unsupported credential/write routes do not read submitted body or log it', async () => {
  const { router, records } = routerFor(); let reads = 0;
  const response = await router({ method: 'POST', target: '/api/auth/password', headers, body: async () => { reads++; throw Error('SECRET_PASSWORD_MUST_NOT_BE_READ'); } });
  assert.equal(response.status, 501); assert.equal(reads, 0); assert.ok(!JSON.stringify(records).includes('SECRET_PASSWORD'));
  assert.deepEqual(records[0].body, null);
  const summary = safeRequestSummary('/inventory/candidates/query', { kind: 'product', page: 1, pageSize: 20, search: 'PRIVATE_SEARCH', selectedIds: [], categoryIds: [], password: 'SECRET' });
  assert.ok(!JSON.stringify(summary).includes('PRIVATE_SEARCH')); assert.ok(!JSON.stringify(summary).includes('SECRET')); assert.match(summary.searchSha256, /^[a-f0-9]{64}$/);
});
test('one original actual factory call returns full500 with real serialized bytes/hash;25ms is synthetic delay not DB', async () => {
  const { call, records } = routerFor(), response = await call('/api/inventory/query', query);
  assert.equal(response.status, 200); assert.equal(response.value.products.length, 500); assert.equal(response.value.exactTotalProducts, 600);
  assert.equal(response.body.length, 3101433); assert.equal(response.headers['x-opt00-inventory-response-sha256'], sha256(response.body));
  assert.equal(records[0].responseBytes, response.body.length); assert.equal(records[0].configuredSyntheticServerDelayMs, 25); assert.ok(records[0].syntheticGenerationWallMs >= 0); assert.equal(records[0].realDatabaseTiming, null);
  const again = await call('/api/inventory/query', query); assert.equal(again.status, 200); assert.notEqual(again.headers['x-opt00-inventory-request-id'], response.headers['x-opt00-inventory-request-id']);
  assert.equal(records.length, 2); assert.ok(records.every(record => record.syntheticGenerationWallMs > 0)); // every read regenerates, no response cache branch
});
test('ARM has no500 oracle preload; post-candidate oracle binds actual requestID/hash; READY cannot precede validation', async () => {
  const { call, receipts } = routerFor(), before = await call('/__inventory/sample/before', operation()); assert.equal(before.status, 200);
  assert.equal(Object.hasOwn(before.value, 'dto'), false); assert.equal(Object.hasOwn(before.value, 'expectedRows'), false); assert.ok(before.body.length < 3000);
  const key = before.value.key;
  assert.equal((await call('/__inventory/sample/before', operation())).status, 400);
  assert.equal((await call('/__inventory/sample/oracle', { key, requestId: 'old', responseSha256: 'old' })).status, 400);
  assert.equal((await call('/__inventory/sample/after', { key, status: 'READY', browser: { status: 'READY', readyObservation: { ready: true }, clickToCandidateReadyMs: 1, performanceAcceptance: false } })).status, 400);
  const result = await call('/api/inventory/query', query), requestId = result.headers['x-opt00-inventory-request-id'], responseSha256 = result.headers['x-opt00-inventory-response-sha256'];
  assert.equal((await call('/__inventory/sample/oracle', { key, requestId: 'wrong', responseSha256 })).status, 400);
  const oracle = await call('/__inventory/sample/oracle', { key, requestId, responseSha256 }); assert.equal(oracle.status, 200); assert.equal(oracle.value.dto.products.length, 500); assert.equal(oracle.value.dto.products[0].sizes.length, 11);
  const final = await call('/__inventory/sample/after', { key, status: 'READY', browser: { status: 'READY', readyObservation: { ready: true }, clickToReadyMs: null, bodyToReadyMs: null, clickToCandidateReadyMs: 1, performanceAcceptance: false, oracle: { requestId, responseSha256 } } }); assert.equal(final.status, 200); assert.equal(receipts.length, 1);
  assert.equal(receipts[0].actualRead.requestId, requestId); assert.equal(Object.hasOwn(receipts[0].before, 'dto'), false); assert.equal(Object.hasOwn(receipts[0].actualRead, 'dto'), false);
  assert.equal((await call('/__inventory/sample/before', operation())).status, 400);
});
test('cancelled ARM produces null timing terminal; a later response cannot attach to that operation', async () => {
  const { call, receipts } = routerFor(), before = await call('/__inventory/sample/before', operation()), key = before.value.key;
  assert.equal((await call('/__inventory/sample/after', { key, status: 'ABORTED', browser: { status: 'ABORTED', clickToReadyMs: null, bodyToReadyMs: null } })).status, 200);
  assert.equal(receipts[0].status, 'ABORTED'); assert.equal(receipts[0].actualRead, null);
  const late = await call('/api/inventory/query', query);
  assert.equal((await call('/__inventory/sample/oracle', { key, requestId: late.headers['x-opt00-inventory-request-id'], responseSha256: late.headers['x-opt00-inventory-response-sha256'] })).status, 400);
});
test('pure display setting uses explicit prior accepted epoch and0newread, fit requires new original query', async () => {
  const { call } = routerFor(); const initial = await call('/api/inventory/query', query);
  const display = { ...operation(), mode: 'DISPLAY_SETTING', setting: 'supplier', settings: { ...DEFAULTS, supplier: true } };
  const before = await call('/__inventory/sample/before', display); assert.equal(before.status, 200); assert.equal(before.value.needsRead, false); assert.equal(before.value.baseRequestId, initial.headers['x-opt00-inventory-request-id']);
  const oracle = await call('/__inventory/sample/oracle', { key: before.value.key, requestId: initial.headers['x-opt00-inventory-request-id'], responseSha256: initial.headers['x-opt00-inventory-response-sha256'] }); assert.equal(oracle.status, 200);
  await call('/__inventory/sample/after', { key: before.value.key, status: 'ABORTED', browser: { status: 'ABORTED', clickToReadyMs: null, bodyToReadyMs: null } });
  const fit = await call('/__inventory/sample/before', { ...operation(), mode: 'DISPLAY_SETTING', setting: 'fit', settings: { ...DEFAULTS, fit: true } });
  assert.equal(fit.value.needsRead, true); assert.equal(fit.value.baseRequestId, null);
  assert.equal((await call('/__inventory/sample/oracle', { key: fit.value.key, requestId: initial.headers['x-opt00-inventory-request-id'], responseSha256: initial.headers['x-opt00-inventory-response-sha256'] })).status, 400);
  await call('/__inventory/sample/after', { key: fit.value.key, status: 'ABORTED', browser: { status: 'ABORTED', clickToReadyMs: null, bodyToReadyMs: null } });
});
test('host disposal terminates pending ARM without a fake ready; oversize/invalid UTF8 bodies fail closed', async () => {
  const { router, call, receipts } = routerFor(); await call('/__inventory/sample/before', operation()); await router.dispose();
  assert.equal(receipts.length, 1); assert.equal(receipts[0].status, 'ABORTED'); assert.equal(receipts[0].browser.clickToCandidateReadyMs, null);
  const invoke = body => router({ method: 'POST', target: '/api/inventory/query', headers, signal: new AbortController().signal, body: async () => body });
  assert.equal((await invoke(Buffer.alloc(65537))).status, 413); assert.equal((await invoke(Buffer.from([0xff]))).status, 400);
});
function fixtureObservation(dto) {
  const expectedRows = makeExpectedRows(dto, DEFAULTS), row = expectedRows.find(row => row.kind === 'warehouse'), p = dto.products.find(p => p.id === row.productId), visible = p.sizes.slice(0, 5);
  const dom = { hash: '#inventory', busy: 'false', measured: true, preparing: false, error: [], fontsReady: true, stylesReady: true, viewport: { width: 900, height: 600 }, probeRowsRemaining: 0, probeSectionsRemaining: 0, collapsedFoldCount: 0, descriptions: [{ hidden: true, text: '' }], pageSizeText: '500款/页', stats: '600款商品 ·2个仓库 ·库存25,318', pagination: '共600款，当前第1–500款', rows: [{ productId: p.id, productCode: p.code, productName: p.name, kind: 'warehouse', color: row.color, warehouse: row.warehouse, connected: true, intersectsViewport: true, rect: { width: 900, height: 40 }, metadata: { '分类': p.categoryLabel }, total: row.total,
    axisParts: [...visible.map(size => ({ kind: 'size', id: size.id, label: size.label })), { kind: 'gap', hidden: true, span: 6 }],
    cellValues: visible.map(size => ({ sizeId: size.id, sizeLabel: size.label, text: row.cells[size.id].quantity, notApplicable: false })) }] };
  return { dom, query, dto, expectedRows, busyObserved: true, requestCompleted: true, settingsKnown: true, measurementEpochObserved: true };
}
test('public ready guard checks complete column-window axis accounting, not all11simultaneous or arbitrary subset', async () => {
  const dto = await profile.inventory(query, new AbortController().signal), good = fixtureObservation(dto); assert.equal(inspectInventoryReady(good).ready, true);
  const cases = [g => { g.dom.rows[0].cellValues.pop(); }, g => { g.dom.rows[0].axisParts.pop(); }, g => { g.dom.rows[0].axisParts.at(-1).span = 7; }, g => { g.dom.rows[0].axisParts[1] = g.dom.rows[0].axisParts[0]; }, g => { g.dom.rows[0].cellValues[0].text = '0'; }, g => { g.dom.rows[0].productId = 'foreign'; }, g => { g.dom.rows[0].rect.height = 0; }, g => { g.dom.probeRowsRemaining = 1; }, g => { g.dom.busy = 'true'; }, g => { g.requestCompleted = false; }, g => { g.busyObserved = false; }, g => { g.dom.error = ['Read failed; old result']; }];
  for (const mutate of cases) { const bad = structuredClone(good); mutate(bad); assert.equal(inspectInventoryReady(bad).ready, false); }
  const display = { ...good, requiresNewRead: false, busyObserved: false, settingsChangeObserved: true, acceptedReadEpochMatches: true }; assert.equal(inspectInventoryReady(display).ready, true);
  assert.equal(inspectInventoryReady({ ...display, settingsChangeObserved: false }).ready, false); assert.equal(inspectInventoryReady({ ...display, acceptedReadEpochMatches: false }).ready, false);
  assert.equal(inspectInventoryReady({ ...good, measurementEpochObserved: false }).ready, false);
  const outside = structuredClone(good); outside.dom.rows[0].intersectsViewport = false; assert.equal(inspectInventoryReady(outside).ready, false);
  const meta = structuredClone(display); meta.settings = { ...DEFAULTS, supplier: true }; assert.equal(inspectInventoryReady(meta).ready, false);
  meta.dom.rows[0].metadata['供应商'] = meta.dto.products[0].supplierLabel; assert.equal(inspectInventoryReady(meta).ready, true);
  meta.dom.rows[0].metadata['供应商'] = 'wrong old metadata'; assert.equal(inspectInventoryReady(meta).ready, false);
});
test('real selector contracts: foreign/disabled/detached/wrong native controls cannot begin an operation', () => {
  const dom = new JSDOM('<div id="page"><button class="iw-query-button">查询</button><button>查询</button></div><div role="dialog" aria-label="显示设置"><label><input type="checkbox">供应商</label></div>');
  try { const document = dom.window.document, root = document.querySelector('#page'), queryButton = document.querySelector('.iw-query-button'), input = document.querySelector('input');
    assert.ok(resolveInventoryAction({ root, target: queryButton, mode: 'FIRST_QUERY' }));
    assert.equal(resolveInventoryAction({ root, target: root.querySelector('button:last-child'), mode: 'FIRST_QUERY' }), null);
    queryButton.disabled = true; assert.equal(resolveInventoryAction({ root, target: queryButton, mode: 'FIRST_QUERY' }), null); queryButton.disabled = false; queryButton.remove(); assert.equal(resolveInventoryAction({ root, target: queryButton, mode: 'FIRST_QUERY' }), null);
    assert.ok(resolveInventoryAction({ root, target: input, mode: 'DISPLAY_SETTING', setting: 'supplier' })); assert.equal(resolveInventoryAction({ root, target: input, mode: 'DISPLAY_SETTING', setting: 'fit' }), null);
    const observed = captureInventoryDom(document); assert.equal(observed.measured, false); assert.equal(observed.rows.length, 0); // no fake JSDOM geometry success
  } finally { dom.window.close(); }
});
test('original page-size control is read from its specific open shadow root, not a light-DOM impostor', () => {
  const dom = new JSDOM('<div id="page"><div class="iw-pagination"><div class="ui-single-host"><div id="source-host"></div></div></div></div><div class="ui-page-size-select">100款/页 IMPOSTOR</div>');
  try {
    const document = dom.window.document, host = document.querySelector('#source-host'), shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<div id="root"><div class="ui-page-size-select"><input aria-label="每页商品款数"><span>500款/页</span></div></div><div id="portal"></div>';
    assert.equal(captureInventoryDom(document).pageSizeText, '500款/页');
    host.remove(); assert.equal(captureInventoryDom(document).pageSizeText, '');
  } finally { dom.window.close(); }
});
test('observation gate rejects repeated/wrong actions and stale late ARM after cancel', () => {
  const gate = createObservationGate(), first = gate.begin('FIRST_QUERY'); assert.ok(first); assert.equal(gate.begin('FIRST_QUERY'), null); gate.cancel(); assert.equal(gate.confirm(first), false);
  const next = gate.begin('FIRST_QUERY'); assert.ok(gate.confirm(next)); assert.equal(gate.consume({ mode: 'DISPLAY_SETTING' }), null); assert.ok(gate.consume({ mode: 'FIRST_QUERY' })); assert.equal(gate.consume({ mode: 'FIRST_QUERY' }), null); assert.equal(gate.finish(first), false); assert.ok(gate.finish(next));
});
test('deferred old oracle rejection and stream cancel cannot terminate a newly armed/running owner', async () => {
  for (const kind of ['oracle-rejection', 'stream-cancel']) {
    let rejectOld; const old = { key: 'old', finished: false }; let current = old; const terminals = [];
    const pending = new Promise((_resolve, reject) => { rejectOld = reject; }).catch(() => {
      const claimed = claimTerminalOwner(old, current); if (claimed) terminals.push(claimed.key);
    });
    assert.equal(claimTerminalOwner(old, current), old); current = { key: 'new-' + kind, finished: false };
    rejectOld(new Error('Valid late failure of already aborted old observation')); await pending;
    assert.equal(current.finished, false); assert.deepEqual(terminals, []);
    assert.equal(claimTerminalOwner(null, current), null); assert.equal(current.finished, false);
    assert.equal(claimTerminalOwner(current, current), current); assert.equal(current.finished, true);
    assert.equal(claimTerminalOwner(current, current), null);
  }
});
test('late old before success/rejection cannot confirm or clear the new ARM generation', async () => {
  for (const outcome of ['success', 'rejection']) {
    const gate = createObservationGate(), old = gate.begin('FIRST_QUERY'); let resolveOld, rejectOld, active = null, abandoned = 0;
    const deferred = new Promise((resolve, reject) => { resolveOld = resolve; rejectOld = reject; }).then(boundary => {
      if (!gate.confirm(old)) { abandoned++; return; } active = boundary;
    }, () => { if (gate.finish(old)) active = null; });
    gate.cancel(); const newer = gate.begin('FIRST_QUERY'); assert.ok(gate.confirm(newer)); active = { key: 'new' };
    if (outcome === 'success') resolveOld({ key: 'old' }); else rejectOld(new Error('Old before response failed'));
    await deferred; assert.deepEqual(active, { key: 'new' }); assert.equal(gate.state().sequence, newer.sequence); assert.equal(gate.state().phase, 'armed'); assert.equal(abandoned, outcome === 'success' ? 1 : 0);
    assert.ok(gate.finish(newer));
  }
});
test('build source accepts exact reviewed9+one immutable helper only; runtime redirect cannot select active app code', () => {
  const sourceFiles = ['README.md', 'identity-map.mjs', 'inventory-profile.mjs', 'inventory-profile.test.mjs', 'observer.mjs', 'entry.tsx', 'serve.mjs', 'build.mjs', 'host.test.mjs'].map(name => ({ path: 'tests/performance/opt00/inventory-browser-baseline/' + name })), m = { sourceFiles, readOnlyHelpers: [{ path: 'tests/performance/opt00/browser-host/html-assets.mjs' }] };
  assert.equal(requireManifestShape(m), m); assert.throws(() => requireManifestShape({ ...m, sourceFiles: m.sourceFiles.slice(1) })); assert.throws(() => requireManifestShape({ ...m, readOnlyHelpers: [] }));
  assert.equal(mapRuntimeImport('/active', '/clean', '/active/tests/performance/opt00/inventory-browser-baseline/serve.mjs', '../../../../apps/web/preview/synthetic-reader.ts'), '/clean/apps/web/preview/synthetic-reader.ts');
  assert.equal(mapRuntimeImport('/active', '/clean', '/active/tests/performance/opt00/inventory-browser-baseline/serve.mjs', './inventory-profile.mjs'), null); assert.equal(mapRuntimeImport('/active', '/clean', '/active/x.mjs', 'node:crypto'), null);
});
test('generated pinned TS/TSX imports stay relative without disabling rewriteRelativeImportExtensions', () => {
  const source = "import x from '../../../../apps/web/demo-replica/frontend/runtime/entry.tsx';\nimport y from '../../../../apps/web/demo-replica/frontend/runtime-styles.ts';\nimport z from '../../../../apps/web/src/production-host/configuration.ts';\nimport o from './observer.mjs';\n";
  const output = generatePinnedEntry(source, { outdir: '/evidence/out02', runtimeRepo: '/evidence/clean-runtime', observerFile: '/evidence/harness/observer.mjs' });
  const imports = [...output.matchAll(/from\s+("[^"]+")/g)].map(match => JSON.parse(match[1]));
  assert.equal(imports.length, 4); assert.ok(imports.every(specifier => specifier.startsWith('../'))); assert.ok(!imports.some(path.isAbsolute));
  assert.equal(path.resolve('/evidence/out02', imports[0]), '/evidence/clean-runtime/apps/web/demo-replica/frontend/runtime/entry.tsx');
  assert.equal(path.resolve('/evidence/out02', imports[3]), '/evidence/harness/observer.mjs');
});
test('browser guard checks real apps/api and adapters/postgres paths plus builtin edges, not mistaken package names only', () => {
  const graph = path => ({ inputs: { [path]: { imports: [] } } });
  assert.doesNotThrow(() => assertBrowserGraphBoundaries(graph('apps/web/demo-replica/frontend/runtime/inventory/page.tsx')));
  for (const file of ['apps/api/src/current-form-http.ts', 'adapters/postgres/src/current-form-reader.ts', '/clean/apps/api/src/index.ts', 'inventory-inline:/clean/adapters/postgres/src/pool.ts', 'packages/api/index.ts', 'node_modules/pg/lib/index.js', 'apps/web/preview/synthetic-reader.ts']) assert.throws(() => assertBrowserGraphBoundaries(graph(file)));
  for (const file of ['node:crypto', 'fs']) assert.throws(() => assertBrowserGraphBoundaries({ inputs: { 'apps/web/safe.ts': { imports: [{ path: file, external: true }] } } }));
});
test('actual strict TypeScript narrows public ready union; unguarded reason still fails', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'inventory-observer-type-contract-'));
  try {
    const observer = fileURLToPath(new URL('./observer.mjs', import.meta.url));
    const prelude = `import {inspectInventoryReady} from ${JSON.stringify(observer)}; declare const input: Parameters<typeof inspectInventoryReady>[0]; const result=inspectInventoryReady(input);\n`;
    const valid = path.join(dir, 'valid.ts'), invalid = path.join(dir, 'invalid.ts');
    await writeFile(valid, prelude + "if(!result.ready){const reason:string=result.reason; console.log(reason);}\n");
    await writeFile(invalid, prelude + "const reason:string=result.reason; console.log(reason);\n");
    const options = { noEmit: true, strict: true, allowJs: true, checkJs: false, types: [], target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], skipLibCheck: false };
    const diagnose = file => ts.getPreEmitDiagnostics(ts.createProgram([file], options));
    const positive = diagnose(valid); assert.deepEqual(positive.map(d => [d.code, ts.flattenDiagnosticMessageText(d.messageText, '\n')]), []);
    assert.ok(diagnose(invalid).some(d => d.code === 2339), 'No cast/any/ignore should allow unguarded reason');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('frozen input verifier rejects changed/missing/symlinked bytes, without building or binding', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'inventory-pure-contract-'));
  try { const bytes = Buffer.from('ORIGINAL'); await writeFile(path.join(dir, 'leaf'), bytes); const fact = { path: 'leaf', bytes: bytes.length, sha256: sha256(bytes) }; assert.deepEqual(await verifiedFile(dir, fact), bytes);
    await writeFile(path.join(dir, 'leaf'), 'CHANGED'); await assert.rejects(() => verifiedFile(dir, fact)); await assert.rejects(() => verifiedFile(dir, { ...fact, path: 'missing' }));
    await symlink(path.join(dir, 'leaf'), path.join(dir, 'link')); await assert.rejects(() => verifiedFile(dir, { ...fact, path: 'link' })); await assert.rejects(() => verifiedFile(dir, { ...fact, path: '../leaf' }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('source boundary remains explicit functional-only; no private snapshots/preload500/timed body clone/production edits', async () => {
  const entry = await readFile(new URL('./entry.tsx', import.meta.url), 'utf8'), serve = await readFile(new URL('./serve.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(entry, /\.getSnapshot\(|response\.clone\(|localStorage\.(?:setItem|clear)\(|setGeometry\(|query\.run\(/);
  assert.match(entry, /performanceAcceptance: false/); assert.match(entry, /mainThreadMs: null/); assert.match(entry, /browserLayoutDurationMs: null/);
  assert.ok(entry.indexOf('const candidateAt = performance.now()') < entry.indexOf("nativeFetch('/__inventory/sample/oracle'"));
  assert.match(serve, /No preloaded500 oracle/i); assert.match(serve, /Actual start must run the frozen server-source/);
});

// Real MutationObserver scheduling, not a hand-authored record or mocked rect.
async function measurementProbe(run) {
  const dom = new JSDOM('<div id="page"><div id="iw-results"><div id="window"></div></div></div>');
  const { document, MutationObserver } = dom.window, tracker = createMeasuredEpochTracker(document), node = document.querySelector('#window');
  const observer = new MutationObserver(records => tracker.consume(records));
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['data-inventory-windowed', 'aria-busy'] });
  const flush = () => new Promise(resolve => dom.window.queueMicrotask(resolve));
  try { await run({ document, node, tracker, flush }); } finally { observer.disconnect(); dom.window.close(); }
}
test('real reused status node transitions into measured, including another same-node measurement round', async () => {
  await measurementProbe(async ({ node, tracker, flush }) => {
    node.setAttribute('data-inventory-windowed', 'measured'); await flush(); assert.equal(tracker.epoch(), 1);
    node.removeAttribute('data-inventory-windowed'); await flush(); assert.equal(tracker.epoch(), 1);
    node.setAttribute('data-inventory-windowed', 'measured'); await flush(); assert.equal(tracker.epoch(), 2);
    node.setAttribute('data-inventory-windowed', 'measured'); await flush(); assert.equal(tracker.epoch(), 2);
    node.setAttribute('aria-busy', 'false'); await flush(); assert.equal(tracker.epoch(), 2);
  });
});
test('same-batch oldValue transitions count only actual current measured activations; detached old nodes do not count', async () => {
  await measurementProbe(async ({ document, node, tracker, flush }) => {
    node.setAttribute('data-inventory-windowed', 'measured'); node.removeAttribute('data-inventory-windowed'); node.setAttribute('data-inventory-windowed', 'measured'); await flush(); assert.equal(tracker.epoch(), 2);
    node.setAttribute('data-inventory-windowed', 'measured'); node.setAttribute('data-inventory-windowed', 'measured'); await flush(); assert.equal(tracker.epoch(), 2);
    node.remove(); node.removeAttribute('data-inventory-windowed'); node.setAttribute('data-inventory-windowed', 'measured'); await flush(); assert.equal(tracker.epoch(), 2);
    const current = document.createElement('div'); current.setAttribute('data-inventory-windowed', 'measured'); document.querySelector('#iw-results').append(current); await flush(); assert.equal(tracker.epoch(), 3);
    current.remove(); document.querySelector('#iw-results').append(current); await flush(); assert.equal(tracker.epoch(), 3);
    // transient measured while final state is not measured must not certify current geometry
    current.removeAttribute('data-inventory-windowed'); current.setAttribute('data-inventory-windowed', 'measured'); current.removeAttribute('data-inventory-windowed'); await flush(); assert.equal(tracker.epoch(), 3);
  });
});
