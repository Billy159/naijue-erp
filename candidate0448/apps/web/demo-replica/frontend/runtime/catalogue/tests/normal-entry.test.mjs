import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// BEGIN TEST-ONLY CAUSAL FIXTURE SYNCHRONIZATION
// This 2s watchdog observes ORIGINAL asynchronous events only. It neither changes
// the HTTP100ms deadline nor sleeps/retries/sends a product request.
function createFixtureSynchronization(inspect = () => ({})) {
  let generation = 0, requestSequence = 0, current;
  const requests = new Set(), events = [], waiters = new Set(), owners = new Map(), scenarios = new Map();
  const observation = () => { try { return inspect(); } catch { return { unavailable: true }; } };
  function begin(label, ownerRequestKey = null) {
    current = Object.freeze({ generation: ++generation, label, startedAtMs: Date.now(), initialObservation: observation() }); scenarios.set(current.generation, current);
    if (ownerRequestKey !== null) owners.set(current.generation, ownerRequestKey);
    return current;
  }
  function matches(waiter, event) { return event.generation === waiter.scenario.generation && event.type === waiter.type && waiter.accept(event); }
  function record(type, request, value) {
    assert.ok(requests.has(request), 'fixture event requires an actual captured dispatch, not an invented receipt');
    const event = Object.freeze({ ...request, type, value, currentGeneration: current.generation, elapsedMs: Date.now() - scenarios.get(request.generation).startedAtMs, observation: observation() }); events.push(event);
    if (type === 'committed') owners.set(request.generation, request.body.requestKey);
    for (const waiter of [...waiters]) if (matches(waiter, event)) { waiters.delete(waiter); clearTimeout(waiter.timer); waiter.resolve(event); }
    return event;
  }
  function capture(endpoint, body) {
    const request = Object.freeze({ generation: current.generation, scenario: current.label, requestId: ++requestSequence, endpoint,
      body: structuredClone(body), ownerRequestKey: owners.get(current.generation) ?? null });
    requests.add(request); record('dispatch', request, null); return request;
  }
  function wait(scenario, type, accept, label) {
    const found = events.find(event => matches({ scenario, type, accept }, event)); if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const waiter = { scenario, type, accept, resolve, timer: null };
      waiter.timer = setTimeout(() => { waiters.delete(waiter);
        const seen = events.filter(event => event.generation === scenario.generation), dispatched = seen.some(event => event.type === 'dispatch' && event.endpoint.endsWith('/commands'));
        const code = (type === 'committed' || type === 'lost-response') && !dispatched ? 'PRECONDITION_NOT_DISPATCHED' : type === 'deferred-read' ? 'PRECONDITION_CURRENT_READ_NOT_OBSERVED' : 'PRECONDITION_CURRENT_COMMAND_PHASE_NOT_OBSERVED';
        reject(Object.assign(new Error(code + ' (HTTP100ms unchanged; no request retry): ' + label + '; diagnostic=' + JSON.stringify(diagnostics())), { code })); }, 2000);
      waiters.add(waiter);
    });
  }
  function deferred(request, response, sourceRows, mode) {
    const responseSnapshot = structuredClone(response), sourceRowsSnapshot = structuredClone(sourceRows); let resolve, settled = false;
    const promise = new Promise(accept => { resolve = accept; });
    const read = Object.freeze({ request, responseSnapshot, sourceRowsSnapshot, mode, resolve() {
      assert.equal(settled, false, 'each deferred response belongs to one request and resolves once'); settled = true; record('deferred-read-resolved', request, { mode, page: responseSnapshot.page }); resolve(structuredClone(responseSnapshot));
    } });
    record('deferred-read', request, read); return { read, promise };
  }
  begin('initial normal-route setup');
  function diagnostics() {
    return { scope: 'TEST_FIXTURE_EVENTS_NOT_PRODUCT_TIMER_INSTRUMENTATION', currentGeneration: current.generation, currentObservation: observation(),
      cases: [...scenarios.values()], events: events.slice(-96).map(event => ({ generation: event.generation, currentGeneration: event.currentGeneration, requestId: event.requestId, type: event.type, endpoint: event.endpoint,
        key: event.body?.requestKey ?? event.ownerRequestKey, action: event.body?.action ?? null, page: event.body?.page ?? null, mode: event.value?.mode ?? null, elapsedMs: event.elapsedMs,
        status: event.value?.receipt?.status ?? null, targetId: event.value?.receipt?.result?.targetId ?? null, version: event.value?.receipt?.result?.version ?? null,
        abortReasonName: event.value?.reasonName ?? null, observation: event.observation })) };
  }
  return { begin, capture, record, wait, deferred, diagnostics };
}
function observeFixtureDom(label, ready) {
  return new Promise((resolve, reject) => {
    let timer; const startedAtMs = Date.now(), observer = new MutationObserver(() => check());
    const finish = value => { observer.disconnect(); clearTimeout(timer); resolve(value); };
    const check = () => { const value = ready(); if (value) finish(value); };
    observer.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
    timer = setTimeout(() => { observer.disconnect(); reject(Object.assign(new Error('PRECONDITION_DOM_PHASE_NOT_OBSERVED (HTTP deadline unchanged): ' + label + '; elapsedMs=' + (Date.now() - startedAtMs)), { code: 'PRECONDITION_DOM_PHASE_NOT_OBSERVED' })); }, 2000);
    check();
  });
}
async function verifyFixtureSynchronization() {
  const sync = createFixtureSynchronization(), old = sync.begin('old generation'), oldRequest = sync.capture('/commands', { requestKey: 'old-key' });
  const now = sync.begin('current generation'); let observed = false;
  const wanted = sync.wait(now, 'committed', event => event.body.requestKey === 'new-key', 'negative controls require a genuinely new dispatch').then(event => { observed = true; return event; });
  sync.record('committed', oldRequest, { status: 'COMMITTED' }); await Promise.resolve(); assert.equal(observed, false, 'old generation cannot satisfy current observer');
  const reusedKey = sync.capture('/commands', { requestKey: 'old-key' }); sync.record('committed', reusedKey, { status: 'COMMITTED' }); await Promise.resolve(); assert.equal(observed, false, 'old key cannot satisfy current observer');
  assert.throws(() => sync.record('committed', { generation: now.generation, body: { requestKey: 'new-key' } }, { status: 'COMMITTED' }), /actual captured dispatch/);
  await Promise.resolve(); assert.equal(observed, false, 'an invented COMMITTED without dispatch cannot satisfy observer');
  const genuine = sync.capture('/commands', { requestKey: 'new-key' }); sync.record('committed', genuine, { status: 'COMMITTED' }); assert.equal((await wanted).requestId, genuine.requestId);
  const rows = [{ id: 'target', name: 'snapshot-before-change', version: 1 }], prior = sync.deferred(oldRequest, { page: 2, items: rows }, rows, 'timeout');
  let currentReadObserved = false; const currentRead = sync.wait(now, 'deferred-read', event => event.ownerRequestKey === 'new-key', 'stale callback must not own new read').then(event => { currentReadObserved = true; return event; });
  prior.read.resolve(); await Promise.resolve(); assert.equal(currentReadObserved, false, 'settling an old callback cannot become the current deferred read');
  rows[0].name = 'later mutation'; rows[0].version = 2; const staleResponse = await prior.promise;
  assert.equal(staleResponse.items[0].name, 'snapshot-before-change'); assert.equal(staleResponse.items[0].version, 1, 'deferred response is the original request snapshot');
  const freshRequest = sync.capture('/read/page2', { page: 2 }), fresh = sync.deferred(freshRequest, { page: 2, items: rows }, rows, 'late');
  assert.equal((await currentRead).value, fresh.read); assert.notEqual(prior.read, fresh.read);
  fresh.read.resolve(); assert.equal((await fresh.promise).items[0].version, 2); assert.throws(() => prior.read.resolve(), /resolves once/);
  return { staleGenerationRejected: true, oldKeyRejected: true, undispatchedReceiptRejected: true, staleCallbackRejected: true, requestSnapshotsIndependent: true };
}
// END TEST-ONLY CAUSAL FIXTURE SYNCHRONIZATION

await verifyFixtureSynchronization();

// Actual normal ready-pages/session/client/controller integration, with finite
// in-memory HTTP responses only. No browser, server, database or global preview switch.
const here = path.dirname(fileURLToPath(import.meta.url)), temp = await mkdtemp(path.join(here, '.normal-entry-'));
const dom = new JSDOM('<!doctype html><div id="page"></div>', { url: 'https://catalogue.test/', pretendToBeVisual: true });
for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLDialogElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = media => ({ matches: false, media, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
const { act } = await import('react');
let pages, session, current, scope, fixtureSync;
try {
  const output = path.join(temp, 'normal.mjs');
  await build({ stdin: { contents: "export {createReadyPageMounts} from '../../common/ready-pages.tsx';export {createReplicaSession} from '../../common/session.ts';export {createCatalogueCommandSession} from '../session.ts';", resolveDir: here, sourcefile: 'normal.tsx', loader: 'tsx' }, outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react','react-dom','react-dom/*'], jsx: 'automatic', banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" }, plugins: [{ name: 'nonvisual-source-css', setup(b) { b.onResolve({ filter: /\.css(?:\?inline)?$/ }, args => ({ path: args.path, namespace: 'css' })); b.onLoad({ filter: /.*/, namespace: 'css' }, () => ({ contents: 'export default "";', loader: 'js' })); } }], logLevel: 'warning' });
  const { createReadyPageMounts, createReplicaSession, createCatalogueCommandSession } = await import(pathToFileURL(output).href);
  const sid = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
  const calls = [], receipts = new Map(), colors = [], changes = [], lostCommandResponses = [];
  const fits = [{ id: sid(80), code: 'A', name: 'SYNTHETIC FIT', version: 1, enabled: true }];
  let role = 'ADMIN', authVersion = 1, keys = 500, sequence = 0, disconnect = false;
  let readbackMode = 'normal';
  fixtureSync = createFixtureSynchronization(() => ({ scopeActive: scope?.active ?? null, ownerUnresolved: pages?.hasUnresolvedWrite() ?? null,
    editorPresent: !!document.querySelector('#pc-dict-form'), timeoutMessageVisible: document.body.textContent.includes('超时'),
    buttons: [...document.querySelectorAll('button')].filter(node => ['确定', '重新读取资料', '查回原请求结果', '按原请求重试'].includes(node.textContent.trim())).map(node => ({ name: node.textContent.trim(), disabled: node.disabled })) }));
  const category = { id: sid(70), parentId: null, name: 'SYNTHETIC ROOT', displayOrder: 0, version: 2, code: null, productCount: null, childCount: 0 };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const http = { origin: 'https://catalogue.test', basePath: '/api', timeoutMs: 100, fetch: async (url, init) => {
    const endpoint = new URL(url).pathname.slice(4), body = init.body ? JSON.parse(init.body) : null; calls.push({ endpoint, method: init.method, body });
    const fixtureRequest = fixtureSync.capture(endpoint, body);
    // Signal abort is observable, but is NOT asserted to mean timeout: original
    // clients also abort after normal completion/cancellation. No timer is mocked.
    init.signal?.addEventListener('abort', () => fixtureSync.record('request-signal-aborted', fixtureRequest, { reasonName: init.signal.reason?.name ?? null }), { once: true });
    if (endpoint === '/auth/session') return json({ principal: { accountId: sid(900), staffId: sid(901), loginName: 'SYNTHETIC-ONLY', role, hallId: role === 'SALESPERSON' ? sid(902) : null, authVersion } });
    if (endpoint === '/catalogue-settings-read/categories/query') return json({ total: 1, items: [{ ...category }] });
    if (/^\/catalogue-settings-read\/(colors|fits)\/query$/.test(endpoint)) {
      const rows = endpoint.includes('/colors/') ? colors : fits;
      const filtered = rows.filter(row => (row.code + row.name).includes(body.search));
      if (body.search === '999') {
        if (readbackMode === 'network' && body.page === 2) throw new Error('synthetic read disconnected');
        if (readbackMode === 'forbidden') return json({ error: { code: 'FORBIDDEN' } }, 403);
        if ((readbackMode === 'timeout' || readbackMode === 'late') && body.page === 2) {
          const deferred = fixtureSync.deferred(fixtureRequest, { page: body.page, pageSize: body.pageSize, total: filtered.length, items: filtered.slice((body.page - 1) * body.pageSize, body.page * body.pageSize) }, filtered, readbackMode);
          return deferred.promise.then(snapshot => json(snapshot));
        }
        let items = filtered.slice((body.page - 1) * body.pageSize, body.page * body.pageSize);
        if (readbackMode === 'duplicate' && body.page === 2) items = filtered.slice(0, body.pageSize);
        if (readbackMode === 'old-version') items = items.map(row => row.code === '999' ? { ...row, version: 1 } : row);
        if (readbackMode === 'missing') items = items.map(row => row.code === '999' ? { ...row, id: sid(850) } : row);
        return json({ page: readbackMode === 'wrong-page' && body.page === 2 ? 1 : body.page, pageSize: body.pageSize, total: filtered.length + (readbackMode === 'drift' && body.page === 2 ? 1 : 0), items });
      }
      return json({ page: body.page, pageSize: body.pageSize, total: filtered.length, items: filtered.slice((body.page - 1) * body.pageSize, body.page * body.pageSize) });
    }
    if (endpoint.startsWith('/catalogue/colors/receipts/')) {
      const receipt = receipts.get(decodeURIComponent(endpoint.split('/').at(-1))); return receipt ? json(receipt) : json({ error: { code: 'RECEIPT_NOT_FOUND' } }, 404);
    }
    if (/^\/catalogue\/(colors|fits)\/commands$/.test(endpoint)) {
      const rows = endpoint.includes('/colors/') ? colors : fits;
      if (receipts.has(body.requestKey)) return json(receipts.get(body.requestKey).result);
      const previous = body.action === 'CREATE' ? null : rows.find(row => row.id === body.id);
      if (body.action !== 'CREATE') { assert.ok(previous); assert.equal(body.expectedVersion, previous.version); }
      const targetId = previous?.id ?? sid(100 + rows.length), version = previous ? previous.version + 1 : 1;
      const result = { kind: endpoint.includes('/colors/') ? 'COLOR' : 'FIT', operationId: sid(++sequence + 1000), targetId, version };
      if (body.action === 'CREATE') rows.push({ id: targetId, ...body.values, version });
      else if (body.action === 'EDIT') Object.assign(previous, body.values, { version });
      else { assert.equal(body.action, 'DELETE'); rows.splice(rows.indexOf(previous), 1); }
      receipts.set(body.requestKey, { requestKey: body.requestKey, action: body.action, status: 'COMMITTED', completedAt: '2026-10-25T00:00:00Z', result });
      fixtureSync.record('committed', fixtureRequest, { command: structuredClone(body), receipt: structuredClone(receipts.get(body.requestKey)) });
      if (disconnect) { disconnect = false; lostCommandResponses.push({ endpoint, command: structuredClone(body), receipt: structuredClone(receipts.get(body.requestKey)) }); fixtureSync.record('lost-response', fixtureRequest, { command: structuredClone(body), receipt: structuredClone(receipts.get(body.requestKey)) }); throw new Error('synthetic lost command response'); } return json(result);
    }
    if (endpoint === '/catalogue/categories/commands') {
      assert.equal(body.action, 'EDIT'); assert.equal(body.expectedVersion, category.version); category.name = body.values.name; category.version++;
      return json({ kind: 'CATEGORY', operationId: sid(++sequence + 1000), targetId: category.id, version: category.version });
    }
    throw new Error('Unexpected test HTTP operation: ' + endpoint);
  } };
  session = createReplicaSession(http); await act(async () => session.auth.resolveSession());
  const host = document.getElementById('page');
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  const click = async node => { assert.ok(node); await act(async () => node.click()); await settle(); };
  const type = async (node, value) => { assert.ok(node); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(); };
  const commandCalls = () => calls.filter(call => call.endpoint.endsWith('/commands'));
  function factory(maintenance) {
    return createReadyPageMounts({ session, routes: { inventory: false, sales: false, transfers: false, productCategories: true, productSettings: { colors: true, fits: true, groups: true, seasons: true, initialTab: 'colors' }, ...(maintenance ? { maintenance } : {}) }, newRequestKey: () => sid(++keys), inventory: { ledgerDialog: document.createElement('dialog'), createWorkbook: () => { throw new Error('Not inventory'); } }, catalogue: { onChanged: kind => changes.push(kind) } }, () => {});
  }
  async function enter(route) {
    if (current) await act(async () => { current.dispose(); scope.dispose(); });
    scope = session.reads.createScope('normal-page-' + ++sequence); await act(async () => { current = await pages.mount(host, route, scope); }); await settle();
  }
  pages = factory(); const before = calls.length; assert.equal(calls.length, before, 'normal route factory does not prefetch');
  await enter('product-settings'); assert.equal(button('新增颜色').disabled, true); assert.equal(commandCalls().length, 0);
  await act(async () => { current.dispose(); scope.dispose(); pages.dispose(); }); current = null;
  pages = factory({ categories: true, colors: true, fits: false, categoryOrderReady: false });
  await enter('product-settings'); assert.equal(button('新增颜色').disabled, false);
  await click(button('新增颜色')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC WHITE'); await type(document.querySelector('#pc-dict-code input'), '031');
  disconnect = true; await click(button('确定')); const original = commandCalls().at(-1).body;
  assert.equal(pages.hasUnresolvedWrite(), true); assert.equal(current.canLeave(), false); assert.ok(button('查回原请求结果'));
  const writesBeforeReentry = commandCalls().length;
  await enter('product-settings'); assert.equal(commandCalls().length, writesBeforeReentry, 'page re-entry cannot resubmit a command');
  assert.equal(document.querySelector('#pc-dict-name input').value, original.values.name); assert.equal(document.querySelector('#pc-dict-code input').value, original.values.code);
  await click(button('查回原请求结果'));
  assert.equal(calls.findLast(call => call.endpoint.includes('/receipts/')).endpoint.split('/').at(-1), original.requestKey);
  assert.equal(document.querySelector('#pc-dict-form'), null); assert.equal(pages.hasUnresolvedWrite(), false); assert.equal(keys, 501); assert.deepEqual(changes, ['COLOR']);
  await click(button('编辑')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC WHITE EDITED'); await click(button('确定'));
  assert.equal(commandCalls().at(-1).body.action, 'EDIT'); assert.equal(commandCalls().at(-1).body.expectedVersion, 1); assert.equal(document.querySelector('#pc-dict-form'), null); assert.equal(pages.hasUnresolvedWrite(), false);
  await click(button('编辑')); await click(button('删除')); await click(button('确认删除'));
  assert.equal(commandCalls().at(-1).body.action, 'DELETE'); assert.equal(commandCalls().at(-1).body.expectedVersion, 2); assert.equal(colors.length, 0); assert.equal(pages.hasUnresolvedWrite(), false);
  colors.push(...Array.from({ length: 21 }, (_, i) => ({ id: sid(200 + i), code: String(i).padStart(3, '0'), name: 'SYNTHETIC MATCH 999', enabled: true, version: 1 })));
  await click(button('新增颜色')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC TARGET'); await type(document.querySelector('#pc-dict-code input'), '999');
  const writesBeforePagedSave = commandCalls().length;
  await click(button('确定'));
  assert.equal(commandCalls().length, writesBeforePagedSave + 1, 'paged verification never submits a second command');
  assert.ok(!document.querySelector('#pc-dict-form'), 'committed target on search page two must close after exact version readback');
  assert.equal(pages.hasUnresolvedWrite(), false);
  assert.ok(calls.some(call => call.endpoint === '/catalogue-settings-read/colors/query' && call.body.search === '999' && call.body.page === 2 && call.body.pageSize === 20));
  colors.unshift(...Array.from({ length: 20 }, (_, i) => ({ id: sid(300 + i), code: `0${i}`, name: 'SYNTHETIC MATCH 999', enabled: true, version: 1 })));
  await type(host.querySelector('#pc-dict-search'), 'SYNTHETIC TARGET');
  await click(button('编辑')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC TARGET EDITED');
  readbackMode = 'duplicate'; const beforeUnconfirmed = commandCalls().length;
  let readbackScenario = fixtureSync.begin('committed edit then readback:duplicate'), timeoutRead;
  await click(button('确定'));
  const readbackCommit = await fixtureSync.wait(readbackScenario, 'committed', event => event.endpoint === '/catalogue/colors/commands' && event.body.action === 'EDIT' && event.body.values.name === 'SYNTHETIC TARGET EDITED', 'initial exact EDIT receipt before readback variants');
  const readbackOwnerKey = readbackCommit.body.requestKey;
  for (const mode of ['duplicate', 'drift', 'wrong-page', 'old-version', 'missing', 'network', 'timeout']) {
    if (mode !== 'duplicate') { readbackMode = mode; readbackScenario = fixtureSync.begin('readback retry:' + mode, readbackOwnerKey); await click(button('重新读取资料')); }
    if (mode === 'timeout') {
      timeoutRead = (await fixtureSync.wait(readbackScenario, 'deferred-read', event => event.ownerRequestKey === readbackOwnerKey && event.body.page === 2 && event.value.mode === 'timeout', 'this timeout attempt must actually reach page2')).value;
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 130)); });
    }
    assert.ok(document.querySelector('#pc-dict-form'), `${mode} must retain committed editor`);
    assert.equal(pages.hasUnresolvedWrite(), true);
    assert.equal(commandCalls().length, beforeUnconfirmed + 1, `${mode} read retry must not write`);
  }
  readbackMode = 'normal'; fixtureSync.begin('normal readback after timeout', readbackOwnerKey); await click(button('重新读取资料'));
  await observeFixtureDom('normal readback confirms exact original target before old callback', () => !document.querySelector('#pc-dict-form'));
  timeoutRead.resolve(); await settle();
  assert.ok(!document.querySelector('#pc-dict-form'), 'last page exact target version confirms the original committed edit');
  assert.equal(pages.hasUnresolvedWrite(), false);
  assert.equal(commandCalls().length, beforeUnconfirmed + 1);
  assert.ok(calls.some(call => call.endpoint === '/catalogue-settings-read/colors/query' && call.body.search === '999' && call.body.page === 3));
  await click(button('编辑')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC TARGET CANCELLED READ');
  const cancelledTargetBefore = structuredClone(colors.find(row => row.code === '999')); assert.ok(cancelledTargetBefore);
  readbackMode = 'late'; const beforeCancelledWrite = commandCalls().length, previousCancelledKeys = new Set(commandCalls().map(call => call.body.requestKey));
  const cancellationScenario = fixtureSync.begin('cancel only this committed EDIT readback'), confirmCancellation = button('确定');
  assert.ok(confirmCancellation?.isConnected && !confirmCancellation.disabled, 'cancel scenario must actually confirm its new EDIT');
  await click(confirmCancellation);
  const cancelledCommit = await fixtureSync.wait(cancellationScenario, 'committed', event => event.endpoint === '/catalogue/colors/commands' && event.body.action === 'EDIT' && !previousCancelledKeys.has(event.body.requestKey) && event.body.values.name === 'SYNTHETIC TARGET CANCELLED READ', 'new EDIT must actually commit before cancelling its readback');
  const cancelledCommands = commandCalls().slice(beforeCancelledWrite); assert.equal(cancelledCommands.length, 1); assert.deepEqual(cancelledCommands[0].body, cancelledCommit.value.command);
  assert.equal(cancelledCommit.body.id, cancelledTargetBefore.id); assert.equal(cancelledCommit.body.expectedVersion, cancelledTargetBefore.version);
  assert.deepEqual(cancelledCommit.body.values, { name: 'SYNTHETIC TARGET CANCELLED READ', code: '999', enabled: true });
  assert.equal(cancelledCommit.value.receipt.status, 'COMMITTED'); assert.equal(cancelledCommit.value.receipt.result.targetId, cancelledTargetBefore.id); assert.equal(cancelledCommit.value.receipt.result.version, cancelledTargetBefore.version + 1); assert.deepEqual(cancelledCommit.value.receipt, receipts.get(cancelledCommit.body.requestKey));
  const cancelledRead = (await fixtureSync.wait(cancellationScenario, 'deferred-read', event => event.ownerRequestKey === cancelledCommit.body.requestKey && event.endpoint === '/catalogue-settings-read/colors/query' && event.body.search === '999' && event.body.page === 2 && event.value.mode === 'late', 'current committed EDIT must own its current page2 deferred read')).value;
  assert.notEqual(cancelledRead, timeoutRead); assert.ok(cancelledRead.sourceRowsSnapshot.some(row => row.id === cancelledCommit.value.receipt.result.targetId && row.version === cancelledCommit.value.receipt.result.version && row.name === 'SYNTHETIC TARGET CANCELLED READ'));
  assert.equal(pages.hasUnresolvedWrite(), true, 'the new committed owner exists before page disposal'); const writesBeforeAbort = commandCalls().length;
  await act(async () => { current.dispose(); scope.dispose(); }); current = null;
  cancelledRead.resolve(); await settle(); assert.equal(host.childElementCount, 0);
  assert.equal(pages.hasUnresolvedWrite(), true, 'page cancellation keeps the session committed owner');
  readbackMode = 'normal'; fixtureSync.begin('reenter original committed owner', cancelledCommit.body.requestKey); await enter('product-settings'); await settle();
  await observeFixtureDom('original owner completes its exact readback after reentry', () => !pages.hasUnresolvedWrite());
  assert.equal(pages.hasUnresolvedWrite(), false); assert.equal(commandCalls().length, writesBeforeAbort);
  colors.length = 0;
  await click(button('版型')); assert.equal(button('新增版型').disabled, true); assert.equal(commandCalls().filter(call => call.endpoint.includes('/fits/')).length, 0);
  await enter('product-categories'); assert.equal(host.querySelector('[data-cat="name"]').disabled, false); await type(host.querySelector('[data-cat="name"]'), 'SYNTHETIC RENAMED'); await click(button('保存'));
  assert.equal(category.name, 'SYNTHETIC RENAMED'); assert.equal(pages.hasUnresolvedWrite(), false);
  const orderSession = createCatalogueCommandSession(session, { categories: true, categoryOrderReady: true }, () => sid(++keys), () => { throw new Error('No pending test command'); });
  assert.equal(orderSession.maintenance.CATEGORY.categoryOrderReady, true); assert.ok(orderSession.maintenance.CATEGORY.allowedActions.includes('UNDO_REORDER')); assert.equal(orderSession.maintenance.COLOR, undefined); orderSession.dispose();
  const boundedSession = createCatalogueCommandSession(session, { categories: true, colors: false, fits: true, categoryOrderReady: false }, () => sid(++keys), () => { throw new Error('No pending test command'); });
  assert.equal(boundedSession.maintenance.COLOR, undefined); assert.equal(boundedSession.maintenance.FIT.client.kind, 'FIT'); assert.equal(boundedSession.maintenance.CATEGORY.categoryOrderReady, undefined); assert.equal(boundedSession.maintenance.CATEGORY.allowedActions.includes('REORDER'), false); boundedSession.dispose();
  await enter('product-settings'); await click(button('新增颜色')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC SECOND'); await type(document.querySelector('#pc-dict-code input'), '032');
  // This scenario requires a NEW dispatched, committed-but-response-lost command.
  // A missed/disabled click or a not-sent deadline must fail that precondition,
  // not silently borrow the previous command and fail later as "undefined".
  // These observations do not establish the cause of the preserved C09 failure.
  const beforeAbandon = commandCalls().length, previousKeys = new Set(commandCalls().map(call => call.body.requestKey)), confirmAbandon = button('确定');
  assert.ok(confirmAbandon?.isConnected && !confirmAbandon.disabled, 'final COLOR CREATE requires a connected enabled confirm button');
  assert.equal(document.querySelector('#pc-dict-name input').value, 'SYNTHETIC SECOND'); assert.equal(document.querySelector('#pc-dict-code input').value, '032');
  const abandonedScenario = fixtureSync.begin('auth expiry only this dispatched lost-response CREATE');
  disconnect = true; await click(confirmAbandon);
  await fixtureSync.wait(abandonedScenario, 'lost-response', event => event.endpoint === '/catalogue/colors/commands' && event.body.action === 'CREATE' && !previousKeys.has(event.body.requestKey) && event.body.values.name === 'SYNTHETIC SECOND' && event.body.values.code === '032', 'new CREATE must actually dispatch, commit and lose its response before expiry');
  await observeFixtureDom('new lost-response command becomes actually uncertain before expiry', () => button('查回原请求结果') && button('按原请求重试'));
  const dispatched = commandCalls().slice(beforeAbandon); assert.equal(dispatched.length, 1, 'final COLOR CREATE must actually dispatch one NEW command before expiry');
  assert.equal(dispatched[0].endpoint, '/catalogue/colors/commands'); assert.equal(dispatched[0].method, 'POST');
  const abandoned = dispatched[0].body; assert.equal(abandoned.action, 'CREATE'); assert.equal(previousKeys.has(abandoned.requestKey), false);
  assert.deepEqual(abandoned.values, { name: 'SYNTHETIC SECOND', code: '032', enabled: true });
  const lost = lostCommandResponses.filter(call => call.command.requestKey === abandoned.requestKey); assert.equal(lost.length, 1, 'the exact new command must reach the original fixture response-loss branch');
  assert.equal(lost[0].endpoint, '/catalogue/colors/commands'); assert.deepEqual(lost[0].command, abandoned); assert.equal(lost[0].receipt.status, 'COMMITTED');
  assert.equal(lost[0].receipt.requestKey, abandoned.requestKey); assert.deepEqual(lost[0].receipt, receipts.get(abandoned.requestKey));
  assert.ok(colors.some(row => row.id === lost[0].receipt.result.targetId && row.name === 'SYNTHETIC SECOND' && row.code === '032'), 'original fixture mutation must precede the lost response');
  // Recovery renders these actions ONLY for the actual uncertain controller phase.
  assert.ok(button('查回原请求结果') && button('按原请求重试'), 'new command must be uncertain before auth expiry');
  assert.equal(pages.hasUnresolvedWrite(), true); assert.equal(current.canLeave(), false);
  await act(async () => session.auth.expire()); await settle();
  assert.equal(host.childElementCount, 0); const retained = pages.retainedCatalogueCommands(); assert.ok(retained.length > 0, 'expiry must retain the exact dispatched uncertain command'); assert.equal(retained.at(-1).command.requestKey, abandoned.requestKey); assert.deepEqual(JSON.parse(JSON.stringify(retained.at(-1).command)), abandoned);
  role = 'SALESPERSON'; authVersion++; await act(async () => session.auth.resolveSession());
  const writesBeforeIdentity = commandCalls().length; await enter('product-settings'); assert.equal(button('新增颜色').disabled, true); assert.equal(commandCalls().length, writesBeforeIdentity); assert.equal(document.querySelector('#pc-dict-form'), null, 'old identity cannot recover by reusing old capability');
  await act(async () => { current.dispose(); scope.dispose(); pages.dispose(); }); current = null;
  role = 'ADMIN'; authVersion++; await act(async () => session.auth.resolveSession());
  pages = factory({ colors: true, fits: true }); await enter('product-settings'); await click(button('版型'));
  fits.length = 0; fits.push(...Array.from({ length: 21 }, (_, i) => ({ id: sid(400 + i), code: String.fromCharCode(65 + i), name: 'SYNTHETIC Z MATCH', enabled: true, version: 1 })));
  await click(button('新增版型')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC Z TARGET'); await type(document.querySelector('#pc-dict-code input'), 'Z');
  const beforeFit = commandCalls().length; await click(button('确定'));
  assert.ok(!document.querySelector('#pc-dict-form')); assert.equal(commandCalls().length, beforeFit + 1);
  assert.equal(commandCalls().at(-1).body.action, 'CREATE');
  assert.ok(calls.some(call => call.endpoint === '/catalogue-settings-read/fits/query' && call.body.search === 'Z' && call.body.page === 2));
  await click(button('颜色')); await click(button('新增颜色')); await type(document.querySelector('#pc-dict-name input'), 'SYNTHETIC DENIED READ'); await type(document.querySelector('#pc-dict-code input'), '999');
  readbackMode = 'forbidden'; const beforeDenied = commandCalls().length; await click(button('确定'));
  assert.equal(scope.active, false); assert.equal(host.childElementCount, 0);
  assert.equal(commandCalls().length, beforeDenied + 1);
  assert.equal(receipts.get(commandCalls().at(-1).body.requestKey).status, 'COMMITTED', 'permission loss does not alter the original committed receipt');
  assert.ok(calls.every(call => !call.endpoint.startsWith('/catalogue-settings-read/') || !call.body.pageSize || call.body.pageSize === 20), 'verification uses existing bounded page size');
  console.log('PASS normal catalogue route: existing receipt/re-entry/DELETE checks; F03 COLOR second/last page and FIT second page exact ID/version; duplicate/total drift/wrong page/stale version/wrong ID/network/timeout retain committed owner, read-only retry, unmount/late result and permission-loss cancellation. Finite synthetic HTTP only; no real PG/deployment claim.');
} finally {
  if (fixtureSync) console.log('NORMAL_ENTRY_CAUSAL_FIXTURE_DIAGNOSTIC ' + JSON.stringify(fixtureSync.diagnostics()));
  await act(async () => { current?.dispose(); scope?.dispose(); pages?.dispose(); session?.dispose(); }); dom.window.close(); await rm(temp, { recursive: true, force: true });
}
