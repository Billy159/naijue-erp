import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), temporary = await mkdtemp(path.join(here, '.profile-toolbar-dom-'));
const dom = new JSDOM('<style data-unified-harness-style data-management-harness-style data-harness-style data-inventory-inline data-demo-single-select-inline data-demo-multi-select-inline data-inventory-product-select-inline></style><div id="business"></div><div id="tools"></div><button id="outside">SYN outside</button>', { url: 'https://synthetic-management.invalid/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLIFrameElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator }); dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; dom.window.ResizeObserver = globalThis.ResizeObserver; HTMLElement.prototype.scrollIntoView = () => {}; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let session, detach, act;
try {
  const output = path.join(temporary, 'entry.mjs'); await build({ stdin: { resolveDir: here, loader: 'tsx', contents: "export{act}from'react';export{mountUnifiedProfileSession}from'./profile-host.ts';export{mountReviewProfileToolbar}from'./profile-toolbar.tsx';" }, outfile: output, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/*', 'react-dom', 'react-dom/*'], loader: { '.css': 'empty' }, banner: { js: "import{createRequire}from'node:module';const require=createRequire(import.meta.url);" }, logLevel: 'warning' });
  const module = await import(pathToFileURL(output).href); ({ act } = module); const business = document.getElementById('business'), tools = document.getElementById('tools'), changed = [];
  const settle = async (ms = 30) => act(async () => new Promise(resolve => setTimeout(resolve, ms)));
  const click = async node => { assert.ok(node); await act(async () => { node.focus?.(); node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); node.click(); node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true })); }); await settle(); };
  const apply = () => tools.querySelector('button');
  const select = async label => {
    await click(tools.querySelector('.arco-select'));
    const option = () => [...tools.querySelectorAll('.arco-select-option')].find(node => node.textContent === label);
    for (let i = 0; i < 50 && !option(); i++) await settle(20);
    assert.ok(option(), 'Visible Arco option commits after its portal effects');
    await click(option());
  };
  await act(async () => { session = module.mountUnifiedProfileSession(business); detach = module.mountReviewProfileToolbar(tools, session, profile => changed.push(profile)); }); await settle();
  assert.ok(tools.querySelector('.arco-select')); assert.ok(apply().classList.contains('arco-btn')); assert.equal(tools.querySelector('select'), null, 'Profile selector is actual Arco, not a new native exception'); assert.ok(apply().disabled); assert.equal(session.transport.calls().length, 0); assert.match(tools.textContent, /另有一个本验收工具栏 React 根/);
  const initial = session.app; await select('合成只读调拨模式'); assert.equal(session.app, initial); assert.equal(session.getSnapshot().profile, 'standard', 'Selecting a pending option alone has no side effects'); await click(apply()); await settle(50); assert.deepEqual(changed, ['transfer-readonly']); assert.equal(initial.controller.getSnapshot().phase, 'disposed'); assert.equal(session.getSnapshot().profile, 'transfer-readonly'); assert.equal(session.transport.calls().length, 0); assert.ok(tools.querySelector('.arco-select').contains(document.activeElement) || document.activeElement === tools.querySelector('.arco-select'), 'Successful apply returns keyboard focus to the enabled Arco selector');
  await act(async () => session.enter('transfers')); await settle(100); assert.equal(business.querySelectorAll('.demo-frame').length, 1); assert.equal(tools.querySelector('.demo-frame'), null); assert.equal(business.querySelectorAll('.transfer-view').length, 3); assert.ok([...business.querySelectorAll('button')].find(node => node.textContent === '新增调拨单').disabled);
  await select('标准合成交易模式'); const outside = document.getElementById('outside'); await act(async () => { apply().focus(); apply().click(); outside.focus(); }); await settle(80); assert.equal(session.getSnapshot().profile, 'standard'); assert.equal(document.activeElement, outside, 'Later outside focus is not stolen by apply completion'); assert.deepEqual(changed, ['transfer-readonly', 'standard']); assert.equal(session.transport.calls().length, 0);
  await act(async () => session.revoke()); await settle(); assert.match(tools.textContent, /合成身份已清除/); const stale = apply(); await act(async () => { detach(); detach = null; session.dispose(); session = null; }); stale.click(); await settle(60); assert.equal(tools.childElementCount, 0); assert.equal(business.childElementCount, 0); assert.equal(document.querySelector('.arco-select-popup'), null); assert.deepEqual(changed, ['transfer-readonly', 'standard']);
  console.log('PASS actual Arco profile toolbar in StrictMode: explicit selection inert until apply; one live business Application plus one tools React root; guarded fresh inert profile, disabled NEW, enabled selector focus/no newer outside focus steal, revoke notice and both-root cleanup. No browser/layout/build claim.');
  for (const intent of ['outside-blur', 'Tab', 'Escape', 'outside-pointer', 'frame-outside-blur', 'revoke', 'unmount']) {
    let release;
    const completion = new Promise(resolve => { release = resolve; });
    await act(async () => {
      session = module.mountUnifiedProfileSession(business);
      const gated = {
        get app() { return session.app; }, get transport() { return session.transport; },
        subscribe: session.subscribe, getSnapshot: session.getSnapshot, enter: session.enter,
        revoke: session.revoke, dispose: session.dispose,
        async switchProfile(profile) { const ok = await session.switchProfile(profile); await completion; return ok; },
      };
      detach = module.mountReviewProfileToolbar(tools, gated, () => {});
    });

    await settle(); await select('合成只读调拨模式');
    const initiating = apply(), outside = document.getElementById('outside');
    const raf = globalThis.requestAnimationFrame, frames = [];
    if (intent === 'frame-outside-blur') globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    try {

      await act(async () => { initiating.focus(); initiating.click(); });

      assert.equal(session.getSnapshot().profile, 'transfer-readonly', 'Actual owner switches before gated completion');
      if (intent === 'frame-outside-blur') { await act(async () => release()); await settle(); assert.ok(frames.length); }
      await act(async () => {

        if (intent === 'outside-blur' || intent === 'frame-outside-blur') { outside.focus(); outside.blur(); }
        else if (intent === 'Tab' || intent === 'Escape') { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: intent, bubbles: true })); document.activeElement.blur(); }
        else if (intent === 'outside-pointer') { outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); document.activeElement.blur(); }
        else if (intent === 'revoke') { await session.revoke(); document.activeElement.blur(); }
        else { detach(); detach = null; session.dispose(); initiating.blur(); }
      });

      // jsdom has no native Tab traversal; finish the gesture on an external
      // target after Arco's keyboard effects, then leave no focus target.
      if (intent === 'Tab' || intent === 'Escape' || intent === 'outside-pointer' || intent === 'revoke') await act(async () => { outside.focus(); outside.blur(); });
      assert.ok(document.activeElement === document.body, `${intent}: new intent or invalidated owner leaves focus on BODY`);
      await act(async () => release());
      if (intent === 'frame-outside-blur') await act(async () => { for (const frame of frames.splice(0)) frame(0); });
      await settle(80);

      assert.ok(document.activeElement === document.body, `${intent}: delayed restore must not revive focus after newer intent or owner invalidation`);
      console.log(`PASS gated toolbar focus: ${intent}; actual switch, stale completion cannot reclaim BODY.`);
    } finally {
      globalThis.requestAnimationFrame = raf;
      await act(async () => { release(); detach?.(); detach = null; session?.dispose(); session = null; });
    }
  }
} finally { if (act) await act(async () => { detach?.(); session?.dispose(); }); dom.window.close(); await rm(temporary, { recursive: true, force: true }); }
