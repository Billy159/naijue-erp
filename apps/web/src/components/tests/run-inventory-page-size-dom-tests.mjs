import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(path.join(here, '.page-size-dom-'));
const dom = new JSDOM('<!doctype html><style data-inventory-inline data-demo-single-select-inline></style><div id="root"></div><button id="outside">outside</button>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLIFrameElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, cleanupAct;
try {
  const css = await readFile(path.join(here, '../../demo-controls/single-select.css'), 'utf8');
  assert.match(css, /\.demo-single-select \.arco-select:focus-visible\{outline:0\}/);
  assert.match(css, /\.arco-select\.arco-select-focused \.arco-select-view\{border-color:var\(--ca-control-focus-border\)/);
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'inventory-page-size-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { act, createElement: h, StrictMode, createRoot, InventoryPageSizeSelect, ReadContext, DemoPageSizeSelect, SalesPagination, TransferPagination, createDemoSingleSelectStyles } = await import(pathToFileURL(output).href);
  cleanupAct = act;
  const host = document.getElementById('root');
  const context = new ReadContext({ accountId: 'TEST-PAGE-SIZE', sessionRevision: '1', permissionRevision: '1' });
  let scope = context.createScope('TEST-PAGE-SIZE');
  root = createRoot(host);
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); });
  const click = async element => { assert.ok(element); await act(async () => element.click()); await settle(); };
  let calls = 0, styleCalls = 0, resolveAction, rejectAction;
  const loadAction = () => { calls++; return new Promise((resolve, reject) => { resolveAction = resolve; rejectAction = reject; }); };
  const mockModule = { createDemoSingleSelectStyles: () => ({ load: async () => { styleCalls++; }, dispose() {} }), DemoSingleSelectAction: props => h('button', { 'data-fake-action': '', 'aria-expanded': props.open, onClick: () => props.onOpenChange(!props.open) }, String(props.value)) };
  let key = 0;
  const render = async (options = {}) => act(async () => root.render(h(StrictMode, null, h(InventoryPageSizeSelect, { key, scope, value: 100, disabled: false, onChange() {}, loadAction, ...options }))));
  const trigger = () => host.querySelector('.iw-page-size-trigger');
  await render(); assert.equal(calls, 0); assert.equal(host.querySelector('select'), null); assert.match(trigger().textContent, /100款\/页/);
  await act(async () => trigger().focus()); assert.equal(calls, 1); await click(trigger()); assert.equal(calls, 1);
  await act(async () => trigger().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  await act(async () => resolveAction(mockModule)); await settle(); assert.equal(host.querySelector('[data-fake-action]'), null); assert.ok(trigger()); assert.equal(styleCalls, 0, 'A cancelled module cannot start a late stylesheet request');
  console.log('PASS page-size shell: no idle import/native select; first focus loads once; click joins pending work; Escape cancels and a late module cannot replace/open the shell.');

  key++; await render(); await click(trigger()); await act(async () => document.getElementById('outside').focus()); await act(async () => resolveAction(mockModule)); await settle();
  assert.equal(host.querySelector('[data-fake-action]').getAttribute('aria-expanded'), 'false');
  key++; await render(); await click(trigger()); await render({ disabled: true }); await act(async () => resolveAction(mockModule)); await settle(); assert.equal(host.querySelector('[data-fake-action]').getAttribute('aria-expanded'), 'false');
  key++; await render(); await click(trigger()); await act(async () => scope.dispose()); await act(async () => resolveAction(mockModule)); await settle(); assert.equal(host.querySelector('[data-fake-action]'), null);
  scope = context.createScope('TEST-PAGE-SIZE-REOPEN'); key++; await render(); await click(trigger()); await act(async () => root.render(null)); await act(async () => resolveAction(mockModule)); await settle(); assert.equal(host.childElementCount, 0);
  console.log('PASS page-size interruption: blur/busy closes pending intent; scope revoke/unmount rejects late attachment.');

  key++; await render(); await click(trigger()); await act(async () => rejectAction(new Error('TEST missing leaf'))); await settle(); assert.match(host.querySelector('[role=alert]').textContent, /仍为 100/);
  await click(trigger()); await act(async () => resolveAction({ ...mockModule, createDemoSingleSelectStyles: () => ({ load: async () => { throw new Error('TEST missing CSS'); }, dispose() {} }) })); await settle(); assert.match(host.querySelector('[role=alert]').textContent, /组件未加载/);
  await click(trigger()); await act(async () => resolveAction(mockModule)); await settle(); assert.ok(host.querySelector('[data-fake-action]'));
  console.log('PASS page-size failure: missing JS or CSS is accessible and retryable, never silently falls back to an OS popup.');

  key++; await render(); await act(async () => trigger().focus()); await act(async () => resolveAction(mockModule)); await settle(); assert.equal(host.querySelector('[data-fake-action]').getAttribute('aria-expanded'), 'false');
  key++; await render(); await click(trigger()); await click([...host.querySelectorAll('button')].find(button => button.textContent === '取消加载')); await act(async () => resolveAction(mockModule)); await settle(); assert.ok(trigger()); assert.equal(host.querySelector('[data-fake-action]'), null);
  const chosen = [];
  key++; await render({ loadAction: undefined, onChange: size => chosen.push(size) });
  assert.equal(host.querySelector('.arco-select'), null); await click(trigger()); await settle();
  assert.ok(host.querySelector('.arco-select'), 'Must mount the real installed Arco Select');
  let options = [...host.querySelectorAll('[role=option]')]; assert.deepEqual(options.map(option => option.textContent), ['100款/页', '200款/页', '500款/页']);
  assert.equal(host.querySelector('.arco-trigger').style.width, '150px');
  await click(options[1]); assert.deepEqual(chosen, [200]); assert.equal(host.querySelector('.ui-single-tag').textContent, '100款/页', 'Selection cannot publish an uncommitted page size');
  await render({ loadAction: undefined, value: 200, onChange: size => chosen.push(size) }); assert.equal(host.querySelector('.ui-single-tag').textContent, '200款/页');
  await click(host.querySelector('.arco-select-view')); assert.equal(host.querySelector('[role=combobox]').getAttribute('aria-expanded'), 'true'); assert.equal(host.querySelectorAll('[role=option]').length, 3);
  await act(async () => host.querySelector('[role=combobox]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))); await settle(); assert.equal(host.querySelector('[role=combobox]').getAttribute('aria-expanded'), 'false');
  await click(host.querySelector('.arco-select-view')); assert.equal(host.querySelector('[role=combobox]').getAttribute('aria-expanded'), 'true');
  await act(async () => document.getElementById('outside').focus()); await settle(); assert.equal(host.querySelector('[role=combobox]').getAttribute('aria-expanded'), 'false');
  await render({ loadAction: undefined, value: 200, disabled: true, onChange: size => chosen.push(size) }); assert.ok(host.querySelector('.arco-select-disabled'));
  console.log('PASS actual Arco action: exactly100/200/500, 150px popup, controlled applied value and busy disable. Popup configuration uses frozen tl placement; jsdom is not layout/pixel acceptance.');
  // Browser reproduction: selecting a size starts a read, disables the actual
  // Select and drops focus to BODY. JSDOM does not perform that native blur,
  // so simulate only this observed browser transition, not component state.
  let focusScope = context.createScope('TEST-SIZE-RETURN'), focusBusy = false, focusActive = true, appliedSize = '100', selectedSize = '100';
  const focusRender = () => root.render(h(StrictMode, null, h(DemoPageSizeSelect, { key: 'focus-return', scope: focusScope, active: focusActive, label: '每页焦点测试', value: appliedSize, options: [{ value: '100', label: '100款/页' }, { value: '200', label: '200款/页' }], disabled: focusBusy, onChange: value => { selectedSize = value; focusBusy = true; focusRender(); } })));
  const startSizeRead = async () => {
    await act(async () => focusRender()); await settle();
    if (trigger()) { await click(trigger()); await settle(); }
    const combo = host.querySelector('[role=combobox]'); assert.ok(combo);
    await act(async () => combo.focus());
    if (combo.getAttribute('aria-expanded') !== 'true') await click(host.querySelector('.arco-select-view'));
    await click([...host.querySelectorAll('[role=option]')].find(option => option.textContent === (appliedSize === '100' ? '200款/页' : '100款/页')));
    assert.equal(focusBusy, true); assert.ok(host.querySelector('.arco-select-disabled'));
    await act(async () => document.activeElement.blur()); assert.ok(document.activeElement === document.body);
  };
  const finishSizeRead = async (success = true) => { if (success) appliedSize = selectedSize; focusBusy = false; await act(async () => focusRender()); await settle(); };
  await startSizeRead(); await finishSizeRead();
  assert.ok(host.contains(document.activeElement), 'After size read readiness the live owner must restore focus lost by disabling its Select');
  assert.equal(host.querySelector('[role=combobox]').getAttribute('aria-expanded'), 'false');
  await startSizeRead(); await finishSizeRead(false);
  assert.ok(host.contains(document.activeElement), 'Failed size read restores focus with original applied value');
  await startSizeRead(); await act(async () => { document.getElementById('outside').focus(); document.getElementById('outside').blur(); }); await finishSizeRead();
  assert.ok(document.activeElement === document.body, 'A newer outside focus, even if later blurred, cancels old return ownership');
  await startSizeRead(); await act(async () => document.getElementById('outside').dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }))); await finishSizeRead();
  assert.ok(document.activeElement === document.body, 'Outside pointer intent cannot be stolen by an old size read');
  await startSizeRead(); focusActive = false; await act(async () => focusRender()); await finishSizeRead();
  assert.ok(!host.contains(document.activeElement), 'Inactive retained route must not restore old focus');
  focusActive = true; focusScope = context.createScope('TEST-SIZE-RETURN-REVOKED'); await startSizeRead(); await act(async () => focusScope.dispose()); await finishSizeRead();
  assert.ok(!host.contains(document.activeElement), 'Revoked scope cannot restore focus or an old popup');
  console.log('PASS page-size focus ownership: success/failure readiness restores disabled-lost focus; newer outside focus/pointer, inactive navigation and identity revocation cancel ownership under StrictMode.');
  // Domain adapters reuse the exact same action, but not each other's page math.
  for (const [name, Pager] of [['sales', SalesPagination], ['transfers', TransferPagination]]) {
    const domainScope = context.createScope(`TEST-${name}`); const sizes = []; const pageChanges = [];
    let applied = 20; let busy = false; let active = true;
    const total = '900719925474099312345';
    const domainRender = async () => act(async () => root.render(h(StrictMode, null, h(Pager, { scope: domainScope, active, page: 2, pageSize: applied, total, busy, onPage: page => pageChanges.push(page), onPageSize: size => sizes.push(size) }))));
    await domainRender(); assert.ok(trigger()); assert.equal(host.querySelector('.arco-select'), null);
    assert.match(host.textContent, /21–40/); assert.ok(host.textContent.includes(BigInt(total).toLocaleString('zh-CN')));
    await click(trigger());
    const choices = [...host.querySelectorAll('[role=option]')];
    assert.deepEqual(choices.map(option => option.textContent), ['20张/页', '50张/页', '100张/页', '200张/页']);
    assert.equal(host.querySelector('.arco-trigger').style.width, '150px');
    await click(choices[1]); assert.deepEqual(sizes, [50]); assert.equal(host.querySelector('.ui-single-tag').textContent, '20张/页');
    applied = 50; await domainRender(); assert.equal(host.querySelector('.ui-single-tag').textContent, '50张/页'); assert.match(host.textContent, /51–100/);
    await click(host.querySelector('.arco-select-view')); const stale = host.querySelectorAll('[role=option]')[2];
    busy = true; await domainRender(); await click(stale); assert.deepEqual(sizes, [50]);
    busy = false; await domainRender(); await click(host.querySelector('.arco-select-view'));
    active = false; await domainRender(); await click(stale); await settle();
    await click(host.querySelector('[aria-label="下一页"]')); assert.deepEqual(pageChanges, []);
    assert.ok([...host.querySelectorAll('nav button')].every(button => button.disabled));
    assert.equal(host.querySelector('.arco-select'), null); assert.equal(host.querySelector('.arco-trigger'), null); assert.deepEqual(sizes, [50]); assert.match(trigger().textContent, /50张/);
    active = true; await domainRender(); await click(trigger()); await act(async () => domainScope.dispose()); await settle();
    assert.equal(host.querySelector('.arco-trigger'), null); assert.equal(host.querySelector('.arco-select'), null);
  }
  console.log('PASS shared document adapters: 20/50/100/200, same real Demo action, exact >MAX_SAFE_INTEGER totals/ranges, no optimistic apply, busy/stale option rejection, hidden-list and scope cleanup.');

  const inline = document.querySelector('[data-demo-single-select-inline]'); inline.removeAttribute('data-demo-single-select-inline');
  const styleA = createDemoSingleSelectStyles(document, 'https://synthetic.test/a/single-select.css');
  const styleB = createDemoSingleSelectStyles(document, 'https://synthetic.test/b/single-select.css');
  const a = styleA.load(); assert.equal(styleA.load(), a); const b = styleB.load(); const failedB = b.then(() => false, () => true);
  let links = [...document.querySelectorAll('link[data-demo-single-select-styles]')]; assert.equal(links.length, 2);
  assert.equal(links[0].href, 'https://synthetic.test/a/single-select.css'); assert.equal(links[1].href, 'https://synthetic.test/b/single-select.css');
  links[0].dispatchEvent(new dom.window.Event('load')); await a;
  links[1].dispatchEvent(new dom.window.Event('error')); assert.equal(await failedB, true); assert.equal(document.querySelectorAll('link[data-demo-single-select-styles]').length, 1);
  const retryB = styleB.load(); const rejectedB = retryB.then(() => false, () => true); assert.equal(document.querySelectorAll('link[data-demo-single-select-styles]').length, 2);
  styleA.dispose(); assert.equal(document.querySelectorAll('link[data-demo-single-select-styles]').length, 1);
  styleB.dispose(); assert.equal(await rejectedB, true); assert.equal(document.querySelectorAll('link[data-demo-single-select-styles]').length, 0);
  console.log('PASS action CSS leases: exact asset identities stay independent, one request per owner, error retry, loaded/pending cleanup removes only the owner and settles its promise.');

  const pendingScope = context.createScope('TEST-PENDING-CSS'); let resolveCss; let disposeCss = 0; let cssLoads = 0; let actionLoads = 0;
  const controlledModule = { ...mockModule, createDemoSingleSelectStyles: () => ({ load: () => { cssLoads++; return new Promise(resolve => { resolveCss = resolve; }); }, dispose() { disposeCss++; } }) };
  let shown = true;
  const pendingRender = async () => act(async () => root.render(h(DemoPageSizeSelect, { scope: pendingScope, active: shown, label: 'TEST 每页', value: '20', options: [{ value: '20', label: '20张/页' }], disabled: false, onChange() {}, loadAction: async () => { actionLoads++; return controlledModule; } })));
  await pendingRender(); await click(trigger()); assert.equal(cssLoads, 1);
  shown = false; await pendingRender(); assert.equal(disposeCss, 1); await act(async () => resolveCss()); await settle(); assert.equal(host.querySelector('[data-fake-action]'), null);
  shown = true; await pendingRender(); await click(trigger()); assert.equal(actionLoads, 2); assert.equal(cssLoads, 2);
  await act(async () => document.getElementById('outside').dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }))); assert.equal(disposeCss, 2);
  await act(async () => resolveCss()); await settle(); assert.equal(host.querySelector('[data-fake-action]'), null);
  console.log('PASS pending CSS interruption: retained hidden lists and outside pointer intent revoke work; late stylesheet completion cannot mount or reopen the selector.');
  inline.setAttribute('data-demo-single-select-inline', '');

} finally {
  if (root) await cleanupAct(async () => root.unmount());
  dom.window.close();
  await rm(temporary, { recursive: true, force: true });
}
