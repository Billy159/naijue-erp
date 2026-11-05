/** Explicit TEST ONLY loopback adapter. Canonical copied inventory renderer and
 * original HTTP clients; no production HTTPS guard/source/default change. */
import { createReplicaSession, mountNormalReplica, createReplicaWorkbook } from '../../../../apps/web/demo-replica/frontend/runtime/entry.tsx';
import { configureReplicaStyleAssetBase, prepareReplicaCommonStyles, prepareReplicaStyles } from '../../../../apps/web/demo-replica/frontend/runtime-styles.ts';
import { parseProductionHostConfiguration } from '../../../../apps/web/src/production-host/configuration.ts';
import { createObservationGate, createMeasuredEpochTracker, claimTerminalOwner, resolveInventoryAction, readSettings, captureInventoryDom, inspectInventoryReady, sameJson, SETTINGS } from './observer.mjs';

const match = /^\/inventory\/(100|200|500)$/.exec(location.pathname);
if (!match || location.hostname !== '127.0.0.1' || location.protocol !== 'http:' || location.search) throw Error('Explicit isolated inventory600 loopback page required');
const pageSize = Number(match[1]), nativeFetch = window.fetch.bind(window), gate = createObservationGate();
const required = <T extends HTMLElement>(selector: string) => { const node = document.querySelector<T>(selector); if (!node) throw Error('Missing canonical host element ' + selector); return node; };
const status = required<HTMLOutputElement>('#inventory-test-state'), mode = required<HTMLSelectElement>('#inventory-test-mode'), setting = required<HTMLSelectElement>('#inventory-test-setting'), sampleId = required<HTMLSelectElement>('#inventory-test-sample');
const calls: any[] = []; let lastSettings: any = null, armed: any = null, running: any = null, checking = false, disposed = false;
let timeout: ReturnType<typeof setTimeout> | null = null, checkFrame = 0;
const probeLive = new Set<Element>(), probeSeen = new WeakSet<Element>();
const measuredTracker = createMeasuredEpochTracker(document); let measuredEpoch = 0;
let probePeak = 0, probeConstructed = 0, probeInsertions = 0, geometrySnapshots = 0;
const probeRows = (node: Node) => node instanceof Element ? [...(node.matches('[data-probe-row]') ? [node] : []), ...node.querySelectorAll('[data-probe-row]')] : [];
const probeObserver = new MutationObserver(records => {
  measuredEpoch = measuredTracker.consume(records);
  for (const record of records) {
    for (const node of record.addedNodes) for (const row of probeRows(node)) { probeInsertions++; if (!probeSeen.has(row)) { probeSeen.add(row); probeConstructed++; } probeLive.add(row); probePeak = Math.max(probePeak, probeLive.size); }
    for (const node of record.removedNodes) for (const row of probeRows(node)) probeLive.delete(row);
  }
  const observed = readSettings(document); if (observed) lastSettings = observed;
  if (running && document.querySelector('#iw-results')?.getAttribute('aria-busy') === 'true') running.busyObserved = true;
  scheduleCheck();
});
// Install before ORIGINAL mount so transient add/remove probes are not counted0
// merely because the end-state DOM is already windowed. No added layout reads.
probeObserver.observe(document, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['aria-busy', 'hidden', 'data-inventory-windowed'] });
const config = parseProductionHostConfiguration(JSON.parse(required<HTMLScriptElement>('#naijue-erp-production-configuration').textContent!).configuration);
const http = { ...config.http, fetch: async (input: string, init: RequestInit) => {
  const url = new URL(input);
  if (url.origin !== config.http.origin || url.search || url.hash) throw Error('Closed inventory-only synthetic origin');
  if (!['/api/auth/session', '/api/inventory/query', '/api/inventory/candidates/query'].includes(url.pathname)) return new Response('{"error":{"code":"NOT_IMPLEMENTED"}}', { status: 501, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }); // before reading/logging an unsupported credential/body
  const dispatchOwner = running;
  const call: any = { index: calls.length, endpoint: url.pathname.slice(4), started: performance.now(), phase: 'pending', body: init.body ? JSON.parse(String(init.body)) : null }; calls.push(call);
  try {
    const response = await nativeFetch(url.pathname, { ...init, cache: 'no-store' });
    call.status = response.status; call.requestId = response.headers.get('x-opt00-inventory-request-id'); call.responseSha256 = response.headers.get('x-opt00-inventory-response-sha256'); call.headersAt = performance.now(); call.bytes = 0;
    if (!response.body) { call.phase = 'completed'; call.completed = performance.now(); return new Response(null, { status: response.status, headers: response.headers }); }
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({ async pull(controller) {
      try { const part = await reader.read(); if (part.done) { call.phase = 'completed'; call.completed = performance.now(); controller.close(); scheduleCheck(); return; } call.bytes += part.value.byteLength; controller.enqueue(part.value); }
      catch (error) { call.phase = init.signal?.aborted ? 'aborted' : 'failed'; controller.error(error); void terminal(call.phase === 'aborted' ? 'ABORTED' : 'FAILED', 'Original read stream did not complete', null, dispatchOwner); }
    }, cancel(reason) { call.phase = 'aborted'; void terminal('ABORTED', 'Original client cancelled body', null, dispatchOwner); return reader.cancel(reason); } });
    // Adapter preserves real bytes/status/body/limits. Reconstructed Response
    // has no URL; original production redirect/HTTPS guards are NOT edited.
    return new Response(body, { status: response.status, headers: response.headers });
  } catch (error) { call.phase = init.signal?.aborted ? 'aborted' : 'failed'; call.completed = performance.now(); void terminal(call.phase === 'aborted' ? 'ABORTED' : 'FAILED', 'Original transport failed', null, dispatchOwner); throw error; }
} };
configureReplicaStyleAssetBase(config.assets.basePath);
if (!location.hash) history.replaceState(null, '', '#inventory');
await prepareReplicaCommonStyles(new AbortController().signal);
const session = createReplicaSession(http), owner = mountNormalReplica({ session, routes: config.routes, newRequestKey: () => crypto.randomUUID(), inventory: { ledgerDialog: required<HTMLDialogElement>('#gold-drawer'), createWorkbook: createReplicaWorkbook }, catalogue: { onChanged: () => {} }, page: required('#page'), accountHost: required('.basic-account'), app: required('.app'), breadcrumb: required('#breadcrumb'), transportMode: 'approved-synthetic', prepareRoute: prepareReplicaStyles });
document.documentElement.removeAttribute('data-replica-starting'); document.getElementById('replica-startup')?.remove(); document.getElementById('replica-startup-style')?.remove();
status.textContent = `功能验证 ONLY /600同集：先原显示设置恢复默认并观测，再原每页控件选${pageSize}。准备不会替你查询；不是整页导航冷启动或正式性能。`;

required('#inventory-test-arm').addEventListener('click', async () => {
  if (armed || running || !lastSettings || calls.some(c => c.phase === 'pending') || location.hash !== '#inventory') { status.textContent = '需观测原显示设置、正确库存页且没有在途读取；未ARM'; return; }
  const observed = readSettings(document); if (observed) lastSettings = observed;
  const targetSettings = { ...lastSettings }, operationMode = mode.value;
  const originalResult = document.getElementById('iw-results');
  if (operationMode === 'FIRST_QUERY' && calls.some(call => call.endpoint === '/inventory/query') || operationMode === 'DISPLAY_SETTING' && (originalResult?.getAttribute('aria-busy') !== 'false' || !originalResult?.querySelector('[data-inventory-windowed="measured"]') || document.querySelector('#page [role="alert"]'))) { status.textContent = '首次查询须新document未查过；显示切换须当前原成功页且无error，不用旧结果代替'; return; }
  if (operationMode === 'DISPLAY_SETTING') targetSettings[setting.value] = !targetSettings[setting.value];
  const ticket = gate.begin(operationMode); if (!ticket) return;
  try {
    const operation = { mode: operationMode, setting: operationMode === 'DISPLAY_SETTING' ? setting.value : null, sampleId: sampleId.value, pageSize, settings: targetSettings };
    const response = await nativeFetch('/__inventory/sample/before', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(operation) });
    if (!response.ok) throw Error('Functional boundary rejected; keep all raw');
    const boundary = await response.json();
    if (!gate.confirm(ticket)) { await nativeFetch('/__inventory/sample/after', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: boundary.key, status: 'ABORTED', browser: { status: 'ABORTED', reason: 'Old ARM cancelled before response; no current operation changed', performanceAcceptance: false, clickToReadyMs: null, bodyToReadyMs: null, clickToCandidateReadyMs: null, bodyToCandidateReadyMs: null } }) }); return; }
    armed = { ...boundary, ticket }; status.textContent = operationMode === 'FIRST_QUERY' ? 'ARMED：收起测试工具，再点击原查询' : 'ARMED：只点击指定原显示设置checkbox';
  } catch (error) { if (gate.finish(ticket)) status.textContent = String(error); }
});
document.addEventListener('click', event => {
  if ((event.target as Element)?.closest('[role="dialog"][aria-label="显示设置"]')) requestAnimationFrame(() => { const observed = readSettings(document); if (observed) lastSettings = observed; });
  if (!armed) return;
  const started = performance.now(), action: any = resolveInventoryAction({ root: document.getElementById('page'), target: event.target as Element, mode: armed.operation.mode, setting: armed.operation.setting });
  if (action?.mode === 'DISPLAY_SETTING' && action.checked !== armed.operation.settings[action.setting]) return;
  const ticket = gate.consume(action); if (!ticket) return;
  running = { ...armed, ticket, action, started, observedAt: new Date().toISOString(), callCursor: calls.length, busyObserved: false, probeBefore: { probeConstructed, probeInsertions, probePeak, measuredEpoch }, geometryBefore: geometrySnapshots, finished: false };
  armed = null; if (action.mode === 'DISPLAY_SETTING') lastSettings = readSettings(document);
  const observationOwner = running; timeout = setTimeout(() => void terminal('FAILED', 'FUNCTIONAL_OBSERVATION_DEADLINE_60000_MS; no ready claim', null, observationOwner), 60_000);
  scheduleCheck();
}, true);
required('#inventory-test-abort').addEventListener('click', () => { gate.cancel(); void terminal('ABORTED', 'Explicit observation cancellation; business UI not changed'); });
function scheduleCheck() { if (!running || running.finished || checkFrame || checking) return; checkFrame = requestAnimationFrame(() => { checkFrame = 0; void checkCandidate(); }); }
function publicCandidate(dom: any, current: any, call: any) {
  return location.hash === '#inventory' && dom.busy === 'false' && dom.measured && !dom.preparing && !dom.error.length && dom.fontsReady && dom.stylesReady && dom.viewport?.width > 0 && dom.viewport?.height > 0 && !dom.probeRowsRemaining && !dom.probeSectionsRemaining && measuredEpoch > current.probeBefore.measuredEpoch && probeConstructed > current.probeBefore.probeConstructed && dom.rows.some((row: any) => row.intersectsViewport) && dom.rows.every((row: any) => row.connected && row.rect.width > 0 && row.rect.height > 0) && (!current.needsRead || current.busyObserved) && call?.phase === 'completed' && call.status === 200 && call.requestId && call.responseSha256 && sameJson(lastSettings, current.operation.settings);
}
async function checkCandidate() {
  if (checking || !running || running.finished) return;
  const current = running;
  if (location.hash !== '#inventory') { await terminal('ABORTED', 'Original navigation left inventory', null, current); return; }
  const reads = calls.slice(current.callCursor).filter(call => call.endpoint === '/inventory/query');
  if (reads.some(call => call.phase === 'failed' || call.phase === 'aborted' || call.status && call.status !== 200)) { await terminal('FAILED', 'Original request failed; old page is not new success', null, current); return; }
  const call = current.needsRead ? reads.length === 1 && sameJson(reads[0].body, current.query) ? reads[0] : null : calls.find(c => c.requestId === current.baseRequestId);
  if (current.needsRead ? reads.length > 1 : reads.length > 0) { await terminal('FAILED', 'Unexpected repeated/new inventory query', null, current); return; }
  if (calls.slice(current.callCursor).some(c => c.phase === 'pending') || document.getElementById('iw-results')?.getAttribute('aria-busy') !== 'false') return;
  geometrySnapshots++; const first = captureInventoryDom(document);
  if (first.error.length) { await terminal('FAILED', 'Original page shows error, not zero success', null, current); return; }
  if (!publicCandidate(first, current, call)) return;
  checking = true;
  try {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (running !== current || current.finished) return;
    geometrySnapshots++; const candidateDom = captureInventoryDom(document);
    if (!publicCandidate(candidateDom, current, call)) return;
    const candidateAt = performance.now();
    // All full-oracle network/parsing/validation happens AFTER candidateAt.
    // Failure can only INVALIDATE the candidate, never create a READY timing.
    const response = await nativeFetch('/__inventory/sample/oracle', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: current.key, requestId: call.requestId, responseSha256: call.responseSha256 }) });
    if (!response.ok) { await terminal('FAILED', 'Post-candidate actual-response oracle rejected', null, current); return; }
    const oracle = await response.json(); if (running !== current || current.finished) return;
    if (call.bytes !== oracle.responseBytes) { await terminal('FAILED', 'INVALID_CANDIDATE: actual received bytes do not match verified response', null, current); return; }
    const observation = inspectInventoryReady({ dom: candidateDom, query: oracle.query, dto: oracle.dto, expectedRows: oracle.expectedRows, busyObserved: current.busyObserved, requestCompleted: true, settingsKnown: !!lastSettings, settingsMatch: sameJson(lastSettings, current.operation.settings), requiresNewRead: current.needsRead, settingsChangeObserved: current.action.mode === 'DISPLAY_SETTING', acceptedReadEpochMatches: call.requestId === current.baseRequestId, measurementEpochObserved: measuredEpoch > current.probeBefore.measuredEpoch && probeConstructed > current.probeBefore.probeConstructed, settings: current.operation.settings });
    if (!observation.ready) { await terminal('FAILED', 'INVALID_CANDIDATE: ' + observation.reason, null, current); return; }
    await terminal('READY', null, { readyObservation: observation, candidateDom, candidateAt, candidateCall: call, postCandidateVerifiedAt: performance.now(), oracle: { requestId: oracle.requestId, responseSha256: oracle.responseSha256, datasetSha256: oracle.datasetSha256 } }, current);
  } catch { await terminal('FAILED', 'Post-candidate verification failed', null, current); }
  finally { checking = false; scheduleCheck(); }
}
async function terminal(state: 'READY' | 'FAILED' | 'ABORTED', reason: string | null, proof: any = null, expected: any = running ?? armed) {
  const current = claimTerminalOwner(expected, running ?? armed); if (!current) return;
  armed = null; running = null; if (timeout !== null) clearTimeout(timeout); gate.cancel();
  const browser = { status: state, reason, scope: 'FUNCTIONAL ONLY; candidate timestamps are not an approved performance sample', performanceAcceptance: false,
    mode: current.operation.mode, settings: current.operation.settings, action: current.action ?? null,
    observedAt: current.observedAt ?? new Date().toISOString(), clickToReadyMs: null, bodyToReadyMs: null,
    clickToCandidateReadyMs: state === 'READY' ? proof.candidateAt - current.started : null,
    bodyToCandidateReadyMs: state === 'READY' && current.needsRead ? proof.candidateAt - proof.candidateCall.completed : null,
    postCandidateVerifiedAt: proof?.postCandidateVerifiedAt ?? null, readyObservation: proof?.readyObservation ?? { ready: false }, candidateDom: proof?.candidateDom ?? null, oracle: proof?.oracle ?? null,
    calls: calls.slice(current.callCursor ?? calls.length).map(({ body, ...call }) => ({ ...call, request: body?.filter ? { page: body.page, pageSize: body.pageSize, filterIds: Object.fromEntries(Object.entries(body.filter).map(([key, rows]: [string, any]) => [key, rows.map((row: any) => row.id)])) } : body ? { kind: body.kind, page: body.page, pageSize: body.pageSize } : null })),
    probes: { scope: 'Cumulative native MutationObserver row events/measured element epochs, not private layout calls/CPU', constructed: probeConstructed, insertions: probeInsertions, peakRows: probePeak, measuredEpoch, sampleStartCounters: current.probeBefore ?? null },
    observerGeometrySnapshots: geometrySnapshots - (current.geometryBefore ?? geometrySnapshots), observerOverhead: 'Extra DOM geometry/MutationObserver work is included in candidate wall time and not proven zero; full500 oracle fetched/parsed only afterward',
    resourceEntries: performance.getEntriesByType('resource').map((e: any) => ({ name: e.name, startTime: e.startTime, duration: e.duration, transferSize: e.transferSize, encodedBodySize: e.encodedBodySize, decodedBodySize: e.decodedBodySize })),
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, mainThreadMs: null, browserLayoutDurationMs: null, realDatabaseTiming: null,
  };
  try { const response = await nativeFetch('/__inventory/sample/after', { method: 'POST', keepalive: state !== 'READY', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: current.key, status: state, browser }) }); if (!response.ok) throw Error(); if (!gate.state() && !running && !armed) status.textContent = `${state}: ${reason ?? 'actual wire + captured candidate DOM validated'}; FUNCTIONAL ONLY, no formal performance acceptance`; }
  catch { if (!gate.state() && !running && !armed) status.textContent = `${state}: evidence receipt failed; NO acceptance claim`; }
}
window.addEventListener('pagehide', () => { disposed = true; void terminal('ABORTED', 'Original document left before verification'); probeObserver.disconnect(); cancelAnimationFrame(checkFrame); owner.dispose(); }, { once: true });
void disposed;
