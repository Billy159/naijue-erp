import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// The operative InventoryLedger, SourceDialog, source controls and query decoder
// are real modules. Only read transports, dialog methods and CSS bytes are
// synthetic. This is source DOM evidence, NOT browser pixels, PG, persistence,
// source authorization, release readiness or business acceptance.
const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.ledger-balance-dom-'));
const dom = new JSDOM('<!doctype html><button id="anchor">库存格</button><div id="root"></div><dialog id="ledger-dialog"><div id="gold-drawer-content"></div></dialog>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLDialogElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = media => ({ matches: false, media, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
let root, act, context;
try {
  const output = path.join(temporary, 'entry.mjs');
  // Same real-source esbuild/JSDOM approach as runtime/catalogue/tests/run-dom-tests.mjs.
  await build({ entryPoints: [path.join(here, 'ledger-balance-transition-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react','react-dom','react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', plugins: [{ name: 'source-css-test-only', setup(b) { b.onResolve({ filter: /\.css(?:\?inline)?$/ }, args => ({ path: args.path, namespace: 'test-css' })); b.onLoad({ filter: /.*/, namespace: 'test-css' }, () => ({ contents: 'export default "";', loader: 'js' })); } }], logLevel: 'warning' });
  const { act: realAct, createElement: h, StrictMode, createRoot, InventoryLedger, ReadContext, HttpQueryError, inventoryActor, inventoryId, ledgerDisplayEntry, ledgerRead, ledgerSkuId, ledgerSnapshot, ledgerWarehouse } = await import(pathToFileURL(output).href);
  act = realAct;
  root = createRoot(document.getElementById('root'));
  context = new ReadContext({ accountId: inventoryActor.accountId, sessionRevision: '1', permissionRevision: '1' });
  const requests = [], sourceReads = [], accessFailures = [];
  const dialog = document.getElementById('ledger-dialog');
  const target = { productId: inventoryId('product', 401), productLabel: 'Synthetic operative ledger product', color: { id: inventoryId('color', 402), label: '合成色' }, fit: { id: inventoryId('fit', 403), label: '合成版' }, size: { id: inventoryId('size', 405), label: '合成码' }, warehouse: ledgerWarehouse, skuId: ledgerSkuId, readReference: 'SYNTHETIC-OPERATIVE-CELL' };
  const reader = { readLedger: read => new Promise((resolve, reject) => requests.push({ read, resolve, reject })) };
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  const click = async element => { assert.ok(element, 'Expected operative clickable element'); await act(async () => element.click()); await settle(); };
  const button = label => [...dialog.querySelectorAll('button')].find(node => node.textContent.trim() === label);
  const rows = () => [...dialog.querySelectorAll('tbody tr')];
  const cells = () => rows().map(row => row.cells[3].textContent);
  const sourceLink = () => rows()[0]?.querySelector('a');
  const known = (n, before, after, delta = '2') => { const entry = ledgerDisplayEntry(n); entry.quantityDelta = delta; entry.display.balanceTransition = { state: 'KNOWN', before, after, reason: 'RECORDED_BALANCE_TRANSITION' }; return entry; };
  const history = n => { const entry = ledgerDisplayEntry(n); entry.eventKind = 'HISTORY_REVISION'; entry.source = { kind: 'HISTORY_REVISION', documentKind: 'SALES', revisionId: inventoryId('operation', 700 + n), salesId: inventoryId('sales', 500), salesLineId: inventoryId('salesLine', 510 + n), endpoint: 'SALES_WAREHOUSE' }; return entry; };
  const baseline = n => { const entry = ledgerDisplayEntry(n); entry.eventKind = 'CUTOFF_BASELINE'; entry.sourceDocumentVersion = null; entry.source = { kind: 'CUTOFF_BASELINE', importBatchId: inventoryId('operation', 450), endpoint: 'IMPORT_BASELINE' }; entry.display.businessType = 'BASELINE'; return entry; };
  const page = (request, entries, total = entries.length) => {
    const parameters = request.read.parameters;
    const date = parameters.filter.dateTo ?? parameters.filter.dateFrom ?? '2026-10-21';
    return { ...ledgerSnapshot(ledgerRead(parameters), entries.map(entry => ({ ...entry, display: { ...entry.display, date } }))).data, page: parameters.page, filteredTotal: String(total) };
  };
  const resolve = async (request, entries, total) => { await act(async () => request.resolve(page(request, entries, total))); await settle(); };
  let generation = 0, closeCount = 0;
  const mount = async () => {
    const before = requests.length, scope = context.createScope(`synthetic-operative-ledger-${++generation}`, ledgerSkuId);
    document.getElementById('anchor').focus();
    await act(async () => root.render(h(StrictMode, null, h(InventoryLedger, { key: generation, target, quantity: '7777777777777777', scope, reader, dialog, onAccessFailure: error => accessFailures.push(error), onOpenSource: entry => new Promise((resolve, reject) => sourceReads.push({ entry, resolve, reject })), close: () => { closeCount++; scope.dispose(); root.render(null); } }))));
    await settle();
    assert.equal(requests.length, before + 1, 'StrictMode starts exactly one operative reader per mount');
    return requests.at(-1);
  };

  const first = await mount();
  assert.equal(rows().length, 0, 'Pending initial load never publishes invented before/after values');
  assert.match(dialog.querySelector('.ledger-stats').textContent, /正在读取库存流水/);
  assert.equal(dialog.querySelector('.ledger-scroll').getAttribute('aria-busy'), 'true');
  assert.equal(button('查询中…').disabled, true);
  assert.match(dialog.querySelector('.ledger-identity').textContent, /当前库存 7,777,777,777,777,777/);
  assert.deepEqual([...dialog.querySelectorAll('thead th')].map(cell => cell.textContent), ['时间','业务类型','变化','变化前 → 后','来源单据','操作人']);

  const reversal = known(3, '-2', '0'); reversal.eventKind = 'UNAPPROVE'; reversal.reversesEntryId = inventoryId('ledger', 88);
  const initial = [known(1, '10', '12'), known(2, '-10', '-12', '-2'), reversal, known(4, '0', '2'), known(5, '9007199254740993', '9007199254740995'), ledgerDisplayEntry(6), history(7), baseline(8), ...Array.from({ length: 12 }, (_, index) => ledgerDisplayEntry(index + 9))];
  await resolve(first, initial, 21);
  assert.deepEqual(cells().slice(0, 5), ['10 → 12','-10 → -12','-2 → 0','0 → 2','9,007,199,254,740,993 → 9,007,199,254,740,995'], 'Operative DOM must render validated recorded pairs exactly, not its old hardcoded 未记录');
  assert.deepEqual(cells().slice(5), Array(15).fill('未记录'), 'Current, historical revision and cutoff UNKNOWN stay 未记录; never fill zero or infer from current quantity');
  assert.equal(rows()[4].cells[2].textContent, '+2', 'Positive quantity delta remains its existing exact cell');
  assert.equal(rows()[1].cells[2].textContent, '-2', 'Negative quantity delta never acquires an extra plus sign');
  assert.equal(rows()[7].cells[4].querySelector('a'), null, 'Cutoff baseline never gains source navigation');
  assert.ok(dialog.querySelector('[data-ledger-date="dateFrom"]')?.shadowRoot?.querySelector('input'), 'Real source date control retained');
  assert.ok(dialog.querySelector('[data-ledger-source]')?.shadowRoot?.querySelector('input'), 'Real source-number control retained');
  assert.ok(dialog.querySelector('.ui-single-host > div')?.shadowRoot?.querySelector('[role="combobox"]'), 'Real source business-type select retained');
  console.log('PASS operative real React DOM: positive/negative/zero/huge recorded pairs exact; UNKNOWN current/history/cutoff remain 未记录; controls and source columns retained.');

  await click(sourceLink()); await click(sourceLink());
  assert.equal(sourceReads.length, 1, 'Repeated source clicks retain existing single navigation request guard');
  assert.equal(sourceReads[0].entry.id, initial[0].id);
  assert.match(dialog.textContent, /正在打开来源单据/);
  await act(async () => sourceReads[0].resolve(false)); await settle();
  assert.match(dialog.querySelector('[role="alert"]').textContent, /该来源单据当前不可查看/);
  assert.equal(cells()[0], '10 → 12', 'Denied source intent cannot rewrite recorded balances');

  await click(dialog.querySelector('[aria-label="下一页"]'));
  const second = requests.at(-1);
  assert.equal(second.read.parameters.page, 2);
  assert.deepEqual(second.read.parameters.filter, first.read.parameters.filter, 'Pagination retains executed filter');
  assert.equal(dialog.querySelector('.ledger-scroll').getAttribute('aria-busy'), 'true');
  assert.equal(dialog.querySelector('[aria-label="下一页"]').disabled, true);
  assert.equal(cells()[4], '9,007,199,254,740,993 → 9,007,199,254,740,995', 'Loading keeps genuine previous success, not invented new facts');
  await act(async () => second.reject(new HttpQueryError('unavailable', 'SYNTHETIC_LEDGER_UNAVAILABLE'))); await settle();
  assert.match(dialog.querySelector('[role="alert"]').textContent, /库存流水读取失败/);
  assert.match(dialog.querySelector('.ledger-stats').textContent, /上一次成功查询/);
  assert.equal(cells()[2], '-2 → 0', 'Read failure does not zero or erase the labeled previous success');
  await click(button('重试'));
  const retry = requests.at(-1);
  assert.equal(retry.read.parameters.page, 2);
  assert.deepEqual(retry.read.parameters.filter, second.read.parameters.filter);
  await resolve(retry, [known(21, '-9007199254740995', '-9007199254740993')], 21);
  assert.deepEqual(cells(), ['-9,007,199,254,740,995 → -9,007,199,254,740,993']);
  console.log('PASS operative loading/error/retry/pagination: executed scope retained; exact prior-success cells remain labeled; retry publishes exact negative huge endpoints.');

  await click(dialog.querySelector('[aria-label="上一页"]'));
  const abandoned = requests.at(-1);
  await click(dialog.querySelector('[aria-label="关闭库存流水"]'));
  assert.equal(abandoned.read.signal.aborted, true);
  assert.equal(dialog.open, false);
  assert.equal(document.activeElement, document.getElementById('anchor'), 'Source dialog returns original inventory focus');
  const reopened = await mount();
  assert.equal(rows().length, 0, 'Reopen starts fresh rather than leaking prior target facts');
  await resolve(abandoned, initial, 21);
  assert.equal(rows().length, 0, 'Aborted prior generation cannot publish into reopened dialog');
  await resolve(reopened, [history(1)]);
  assert.deepEqual(cells(), ['未记录'], 'Historical UNKNOWN after reopen never derives from current inventory');
  await click(sourceLink());
  await act(async () => sourceReads.at(-1).resolve(true)); await settle();
  assert.equal(dialog.open, false, 'Existing successful source navigation still closes ledger');
  assert.equal(closeCount, 2);

  const invalid = await mount();
  const malformed = known(1, '10', '12'); malformed.display.balanceTransition.before = null;
  await resolve(invalid, [malformed]);
  assert.match(dialog.querySelector('[role="alert"]').textContent, /库存流水读取失败/);
  assert.equal(rows().length, 0, 'Decoder rejection never becomes an invented pair or successful empty/zero page');
  assert.equal(accessFailures.length, 0, 'Synthetic unavailable/malformed reads never masquerade as source authorization');
  console.log('PASS operative close/reopen/source intent: old generation cancelled; historic UNKNOWN unchanged; source navigation lifecycle retained; malformed pairs fail before DOM publication. Synthetic DOM only, not browser/PG/business acceptance.');
} finally {
  if (root) await act(async () => root.unmount());
  context?.clear();
  dom.window.close();
  await rm(temporary, { recursive: true, force: true });
}
