/** DOM entry smoke only. Simulated CSS load events are not browser asset/waterfall evidence. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { act } from 'react';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../../../..');
test('new test-only entry mounts the source frame and actual three pages without production auth', async () => {
  const temporary = await mkdtemp(path.join(repo, '.acceptance-entry-test-'));
  const dom = new JSDOM('<!doctype html><div id="visual-acceptance-root"></div>', { url: 'http://127.0.0.1:49152/', pretendToBeVisual: true });
  const keys = ['window','document','location','HTMLElement','HTMLIFrameElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLInputElement','HTMLDialogElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','navigator'];
  const saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.matchMedia = media => ({ media, matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
  try {
    const output = path.join(temporary, 'entry.mjs');
    await build({ entryPoints: [path.resolve(here, '../entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm',
      external: ['react','react-dom','react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
      jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
    await act(async () => { await import(pathToFileURL(output).href); });
    const root = document.getElementById('visual-acceptance-root');
    const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); }); };
    const until = async (check, label) => { const deadline = Date.now() + 5000; while (!check() && Date.now() < deadline) await settle(); assert.ok(check(), label); };
    const link = name => [...document.querySelectorAll('link')].find(item => item.href.endsWith(`/${name}.css`));
    const style = async (name, event = 'load') => { await until(() => link(name), `${name} stylesheet owner`); await act(async () => { link(name).dispatchEvent(new Event(event)); }); await settle(); };
    const nav = text => [...root.querySelectorAll('.sidebar a')].find(item => item.textContent === text);
    const click = async element => { assert.ok(element); await act(async () => element.click()); await settle(); };
    assert.ok(root.querySelector('.demo-frame')); assert.match(root.querySelector('.topbar .acceptance-marker').textContent, /SYNTHETIC ONLY/);
    assert.equal(root.querySelector('.acceptance-diagnostics').open, false); assert.equal(root.querySelectorAll('.sidebar a').length, 3);
    assert.equal(root.querySelector('.auth-panel'), null); assert.equal(root.querySelector('input[type=password]'), null);
    assert.equal(link('sales'), undefined); assert.equal(link('transfers'), undefined);
    await style('inventory'); await until(() => root.querySelector('.iw-workbench'), 'actual inventory page');
    assert.match(root.textContent, /等待查询/);
    await act(async () => root.querySelector('form[aria-label="库存筛选"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await until(() => root.textContent.includes('SYNTH-003'), 'finite synthetic inventory result');
    await click(nav('销货单列表')); await style('sales', 'error');
    assert.match(root.textContent, /页面或样式未加载/); assert.equal(root.querySelector('.iw-workbench'), null);
    await click([...root.querySelectorAll('button')].find(item => item.textContent === '重试'));
    await style('sales'); await until(() => root.querySelector('.sales-workbench'), 'actual sales page after CSS retry');
    assert.equal(link('sales-detail'), undefined); assert.equal(root.querySelector('input[type=password]'), null);
    await click(nav('调拨单列表')); await style('transfers'); await until(() => root.querySelector('.transfer-route'), 'actual transfer page');
    assert.equal(link('transfer-detail'), undefined); assert.equal(link('transfer-product'), undefined);
    assert.equal(root.querySelector('.acceptance-diagnostics').open, false);
    await act(async () => dom.window.dispatchEvent(new Event('pagehide')));
    assert.equal(root.childElementCount, 0);
  } finally {
    dom.window.close();
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    await rm(temporary, { recursive: true, force: true });
  }
});
