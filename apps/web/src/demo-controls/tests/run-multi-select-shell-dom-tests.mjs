import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)); const temporary = await mkdtemp(path.join(here, '.multi-shell-'));
const dom = new JSDOM('<!doctype html><div id="root"></div><button id="outside">Outside</button>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true; let root;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'multi-select-shell-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
  const { act, createElement: h, StrictMode, useEffect, useRef, createRoot, DemoMultiSelect, ExclusivePopupController, ReadContext, createDemoMultiSelectStyles } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root'); root = createRoot(host);
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); };
  const click = async element => { assert.ok(element); await act(async () => element.click()); await settle(); };
  const escaped = async element => { await act(async () => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))); await settle(); };
  const context = new ReadContext({ accountId: 'SYNTHETIC', sessionRevision: '1', permissionRevision: '1' }); const scope = context.createScope('SYNTHETIC-MULTI');
  const popup = new ExclusivePopupController(); const attached = [];
  const popupHost = { controller: popup, attach: (ownership, element) => { attached.push({ ownership, element }); return () => {}; } };
  const preparations = []; const styles = []; const childScopes = []; const changes = [];
  function FakeAction(props) {
    const trigger = useRef(null);
    useEffect(() => { if (props.focusOnMount) trigger.current?.focus(); }, []);
    return h('div', { className: 'fake-multi-action' }, h('button', { ref: trigger, type: 'button', role: 'combobox', 'aria-label': `${props.label}，多选`, onClick: () => props.onOpen?.(!props.open) }, props.label), props.open ? props.renderMenu?.(h('span', null, 'Synthetic menu')) : null);
  }
  let mode = 'hold';
  const loadAction = async () => { preparations.push(mode); return { DemoMultiSelectAction: FakeAction, createDemoMultiSelectStyles: () => {
    const lease = { disposed: false, release: null, load: () => mode === 'ready' ? Promise.resolve() : mode === 'fail' ? Promise.reject(new Error('SYNTHETIC STYLE FAILURE')) : new Promise(resolve => { lease.release = resolve; }), dispose: () => { lease.disposed = true; } }; styles.push(lease); return lease;
  } }; };
  const props = label => ({ scope, popupHost, active: true, label, allLabel: `全部${label}`, options: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], value: [], completeUniverse: true, loadAction,
    onChange: ids => changes.push(ids), renderMenu: (menu, child) => { if (!childScopes.includes(child)) childScopes.push(child); return h('div', { 'data-menu': label }, menu); } });
  const render = async (first = props('状态'), second = props('营业厅')) => { await act(async () => root.render(h(StrictMode, null, h(DemoMultiSelect, first), h(DemoMultiSelect, second)))); await settle(); };
  const control = label => host.querySelector(`[data-multi-label="${label}"]`);
  const trigger = label => control(label)?.querySelector('button');
  await render(); assert.equal(preparations.length, 0); assert.equal(styles.length, 0); assert.equal(popup.active, null); assert.equal(childScopes.length, 0);
  await click(trigger('状态')); assert.equal(preparations.length, 1); assert.ok(popup.active); assert.equal(host.querySelector('.fake-multi-action'), null); assert.equal(childScopes.length, 0);
  const old = popup.active; await click(trigger('营业厅')); assert.equal(old.active, false); assert.ok(popup.active); assert.equal(preparations.length, 2);
  await act(async () => styles[0].release()); await settle(); assert.equal(control('状态').querySelector('.fake-multi-action'), null); assert.equal(childScopes.length, 0);
  await escaped(trigger('营业厅')); assert.equal(popup.active, null); assert.equal(styles[1].disposed, true);
  await act(async () => styles[1].release()); await settle(); assert.equal(host.querySelector('.fake-multi-action'), null); assert.equal(childScopes.length, 0);
  console.log('PASS multi shell 1: idle is inert; CSS gates views/data; replacement, Escape and late CSS cannot revive dismissed owners.');

  mode = 'ready'; await click(trigger('营业厅')); assert.ok(control('营业厅').querySelector('.fake-multi-action')); assert.equal(childScopes.length, 1); assert.ok(childScopes[0].active);
  await escaped(trigger('营业厅')); assert.equal(childScopes[0].active, false); assert.equal(popup.active, null); assert.equal(document.activeElement, trigger('营业厅'));
  await click(trigger('营业厅')); assert.equal(childScopes.length, 2); assert.notEqual(childScopes[0], childScopes[1]);
  await render(props('状态'), { ...props('营业厅'), active: false }); assert.equal(childScopes[1].active, false); assert.equal(control('营业厅').querySelector('.fake-multi-action'), null);
  assert.equal(trigger('营业厅').disabled, true); assert.equal(popup.active, null);
  console.log('PASS multi shell 2: reopen gets an independent child; Escape restores safe focus and hiding the list drops ownership/view/data.');

  await render(); mode = 'fail'; await click(trigger('状态')); assert.match(control('状态').textContent, /选项未加载/); assert.equal(popup.active, null); assert.equal(host.querySelector('[data-menu]'), null);
  mode = 'ready'; await click([...control('状态').querySelectorAll('button')].find(button => button.textContent === '重试加载'));
  assert.ok(control('状态').querySelector('.fake-multi-action')); assert.equal(childScopes.length, 3); assert.ok(childScopes[2].active);
  assert.deepEqual(changes, []);
  console.log('PASS multi shell 3: CSS failure is visible, never starts data, and explicit retry opens once without changing selection.');

  await act(async () => context.replaceIdentity({ accountId: 'SYNTHETIC', sessionRevision: '2', permissionRevision: '2' })); await settle();
  assert.equal(childScopes[2].active, false); assert.equal(popup.active, null); assert.equal(host.querySelector('.fake-multi-action'), null);
  assert.ok(styles.every(lease => lease.disposed)); assert.ok([...host.querySelectorAll('button')].filter(button => button.classList.contains('demo-multi-trigger')).every(button => button.disabled));
  await act(async () => root.unmount()); root = null; assert.equal(host.textContent, '');
  console.log('PASS multi shell 4: identity/permission replacement drops every child/style/view, and unmount leaves no retained popup.');
  root = createRoot(host); const freshContext = new ReadContext({ accountId: 'SYNTHETIC', sessionRevision: '3', permissionRevision: '3' });
  const fresh = freshContext.createScope('SYNTHETIC-FOCUS-ONLY');
  const nextProps = { ...props('状态'), scope: fresh }; const nextOther = { ...props('营业厅'), scope: fresh };
  mode = 'hold'; await render(nextProps, nextOther);
  await act(async () => trigger('状态').focus()); await settle();
  const held = styles.at(-1); assert.ok(held.release); assert.equal(popup.active, null); assert.ok(control('状态').querySelector('[aria-busy="true"]'));
  await render({ ...nextProps, disabled: true }, nextOther); assert.equal(held.disposed, true); assert.equal(trigger('状态').disabled, true);
  await act(async () => held.release()); await settle(); assert.equal(control('状态').querySelector('.fake-multi-action'), null); assert.doesNotMatch(control('状态').textContent, /正在加载/);
  mode = 'ready'; await render(nextProps, nextOther); await click(trigger('状态')); assert.ok(control('状态').querySelector('.fake-multi-action'));
  const oldProviderChild = childScopes.at(-1); const beforeProvider = preparations.length;
  await render({ ...nextProps, ownerKey: {} }, nextOther);
  assert.equal(oldProviderChild.active, false); assert.equal(popup.active, null); assert.equal(control('状态').querySelector('.fake-multi-action'), null);
  assert.equal(preparations.length, beforeProvider, 'Replacing a provider must not start a new preparation/read');
  await click(trigger('状态')); assert.ok(childScopes.at(-1).active); assert.notEqual(childScopes.at(-1), oldProviderChild);
  const beforeFocusRace = preparations.length;
  await act(async () => {
    trigger('状态').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    root.render(h(StrictMode, null, h(DemoMultiSelect, { ...nextProps, ownerKey: {} }), h(DemoMultiSelect, nextOther)));
  }); await settle();
  assert.equal(preparations.length, beforeFocusRace, 'Queued close focus must not prepare a replacement provider');
  await act(async () => root.unmount()); root = null; assert.equal(styles.at(-1).disposed, true); assert.equal(popup.active, null);
  console.log('PASS multi shell 5: disabling a focus-only pending preparation disposes its lease without popup ownership; reenable starts a clean action.');
  console.log('PASS multi shell 6: provider/target identity replacement closes the old child synchronously, drops its view and waits for another explicit action.');
  const one = createDemoMultiSelectStyles(document, '/multi-select.css'); const two = createDemoMultiSelectStyles(document, '/multi-select.css');
  assert.equal(document.querySelector('[data-demo-multi-select-styles]'), null, 'Style lease construction is inert');
  const firstLoad = one.load(); assert.equal(one.load(), firstLoad); const secondLoad = two.load();
  const links = [...document.querySelectorAll('[data-demo-multi-select-styles]')]; assert.equal(links.length, 2, 'Owners are isolated, not a global retained cache');
  links.forEach(link => link.dispatchEvent(new Event('load'))); await Promise.all([firstLoad, secondLoad]);
  one.dispose(); assert.equal(document.querySelectorAll('[data-demo-multi-select-styles]').length, 1); two.dispose();
  const retry = createDemoMultiSelectStyles(document, '/multi-select.css'); const failed = retry.load(); const rejected = assert.rejects(failed, /样式未加载/);
  document.querySelector('[data-demo-multi-select-styles]').dispatchEvent(new Event('error')); await rejected; assert.equal(document.querySelector('[data-demo-multi-select-styles]'), null);
  const again = retry.load(); const detached = assert.rejects(again, /disposed/); retry.dispose(); await detached;
  assert.equal(document.querySelector('[data-demo-multi-select-styles]'), null);
  const inline = document.createElement('style'); inline.dataset.demoMultiSelectInline = ''; document.head.append(inline);
  const inlineOwner = createDemoMultiSelectStyles(document); await inlineOwner.load(); assert.equal(document.querySelector('[data-demo-multi-select-styles]'), null); inlineOwner.dispose(); inline.remove();
  console.log('PASS multi shell 7: actual stylesheet leases are inert, per-owner, deduplicated, retryable, detachable while pending and honor an explicit portable-inline marker.');
  console.log('All 7 synthetic shared multi-select shell groups passed. Injected action plus actual stylesheet-owner lifecycle only; actual TreeSelect behavior has separate sales/transfer DOM tests. No browser, network, PG or pixel acceptance.');
} finally { if (root) await (await import('react')).act(async () => root.unmount()); dom.window.close(); await rm(temporary, { recursive: true, force: true }); }
