import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { buildDevelopmentHost } from '../build-development-host.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const workingDirectory = path.resolve(here, '../../application');
const temporary = await mkdtemp(path.join(here, '.host-build-'));
// This exact negative-only selector prevents a native-text ring on composite
// Arco inner inputs. It is not an eager Arco dependency or positive Arco style.
const sharedFocusInputExclusion = ':not(:where(.arco-picker input,.arco-tree-select input,.arco-select input,.arco-input-tag input))';
const withoutSharedFocusInputExclusion = css => css.replaceAll(sharedFocusInputExclusion, '');
const assertNoPositiveArcoStyle = css => assert.doesNotMatch(withoutSharedFocusInputExclusion(css), /\.arco-/);
assertNoPositiveArcoStyle(`.demo-ui input${sharedFocusInputExclusion}:focus-visible{box-shadow:var(--ca-focus-ring)}`);
for (const forbidden of ['.arco-picker{color:red}', `${sharedFocusInputExclusion} .arco-btn{color:red}`, sharedFocusInputExclusion.replace('.arco-picker input', '.arco-picker textarea')]) {
  assert.throws(() => assertNoPositiveArcoStyle(forbidden), 'Positive Arco styles and unreviewed exclusion variants remain forbidden');
}
const configuration = { kind: 'naijue-erp-development-host', http: { origin: 'https://synthetic.test', basePath: '/api' }, assets: { basePath: '/development/erp/' }, routes: { inventory: true, sales: true, transfers: true }, session: { verifyOnMount: false } };
try {
  await assert.rejects(buildDevelopmentHost({ configuration: { ...configuration, password: 'SYNTHETIC' }, outdir: path.join(temporary, 'rejected') }));
  await assert.rejects(stat(path.join(temporary, 'rejected')));
  await assert.rejects(buildDevelopmentHost({ configuration, outdir: 'relative-output' }));
  const outdir = path.join(temporary, 'output');
  const result = await buildDevelopmentHost({ configuration, outdir });
  const html = await readFile(path.join(outdir, result.html), 'utf8');
  const dom = new JSDOM(html, { url: `${configuration.http.origin}${configuration.assets.basePath}` });
  try {
    const { document } = dom.window;
    assert.equal(document.documentElement.lang, 'zh-CN'); assert.ok(document.getElementById('naijue-erp-root'));
    assert.equal(document.querySelectorAll('script[src]').length, 1);
    assert.equal(document.querySelector('script[src]').type, 'module');
    assert.equal(document.querySelector('script[src]').src, 'https://synthetic.test/development/erp/application.js');
    assert.equal(document.querySelectorAll('script:not([src])').length, 1);
    const data = document.getElementById('naijue-erp-development-configuration'); assert.equal(data.type, 'application/json');
    assert.deepEqual(JSON.parse(data.textContent), { configuration, assets: result.manifest });
    assert.deepEqual([...document.querySelectorAll('link')].map(element => [element.rel, element.href]), [
      ['stylesheet', 'https://synthetic.test/development/erp/application.css'], ['stylesheet', 'https://synthetic.test/development/erp/development-host.css'],
    ]);
    assert.equal(document.querySelector('[rel=preload], [rel=modulepreload], iframe, base, [onclick]'), null);
    for (const element of [...document.querySelectorAll('[src], link[href]')]) {
      const url = new URL(element.src || element.href); assert.equal(url.origin, configuration.http.origin);
      assert.ok(url.pathname.startsWith(configuration.assets.basePath));
      const filename = url.pathname.slice(configuration.assets.basePath.length);
      assert.ok((await stat(path.join(outdir, filename))).isFile());
    }
  } finally { dom.window.close(); }
  const outputs = result.metafile.outputs;
  const byAbsolute = new Map(Object.keys(outputs).map(name => [path.resolve(workingDirectory, name), name]));
  const entryFor = relative => Object.keys(outputs).find(name => outputs[name].entryPoint && path.resolve(workingDirectory, outputs[name].entryPoint) === path.resolve(workingDirectory, relative));
  const closure = start => {
    assert.ok(start, 'Expected actual emitted entry'); const visited = new Set();
    const walk = name => { if (visited.has(name)) return; visited.add(name);
      for (const item of outputs[name].imports) {
        if (item.external || item.kind === 'dynamic-import') continue;
        const next = byAbsolute.get(path.resolve(workingDirectory, item.path)) ?? byAbsolute.get(path.resolve(workingDirectory, path.dirname(name), item.path));
        assert.ok(next, `Missing actual dependency ${item.path}`); walk(next);
      }
    }; walk(start); return visited;
  };
  const inputsOf = names => [...new Set([...names].flatMap(name => Object.keys(outputs[name].inputs)))];
  const startup = closure(entryFor('../development-host/entry.ts'));
  for (const file of inputsOf(startup)) assert.doesNotMatch(file, /\/(?:inventory|sales|parties|transfers)\/|@arco-design\/|\/tests\/|\/preview\/|synthetic/, 'Real startup closure has no eager business leaves, Arco or fixtures');
  for (const route of ['inventory', 'sales']) for (const file of inputsOf(closure(entryFor(`routes/${route}.tsx`)))) assert.doesNotMatch(file, /@arco-design\//);
  for (const file of inputsOf(closure(entryFor('routes/transfers.tsx')))) assert.doesNotMatch(file, /detail-content\.tsx$|product-drawer-host\.tsx$|product-http-reader\.ts$|\/tests\//);
  assert.ok(entryFor('../sales/detail-content.tsx')); assert.ok(entryFor('../transfers/detail-content.tsx')); assert.ok(entryFor('../inventory/product-drawer.tsx'));
  assert.ok(entryFor('../components/product-candidate-action.tsx'));
  const productStyles = byAbsolute.get(path.join(outdir, 'chunks/product-candidate-action.css')); assert.ok(productStyles);
  assert.match(await readFile(path.join(outdir, 'chunks/product-candidate-action.css'), 'utf8'), /inv-menu-grid/);
  for (const file of Object.keys(outputs[productStyles].inputs)) assert.doesNotMatch(file, /dist\/css\/arco\.css|\/es\/style\/index\.css/);
  const css = Object.fromEntries(await Promise.all(Object.entries(result.manifest.styles).map(async ([key, filename]) => [key, await readFile(path.join(outdir, filename), 'utf8')])));
  assert.match(css.application, /auth-panel/); assert.match(css.application, /demo-ui/);
  assert.doesNotMatch(withoutSharedFocusInputExclusion(css.application), /\.mx-|sales-workbench|party-workbench|transfer-route|transfer-editor|pd-tabs|\.arco-/);
  assert.match(css.inventory, /iw-workbench/); assert.doesNotMatch(withoutSharedFocusInputExclusion(css.inventory), /\.arco-/);
  assert.match(css.sales, /sales-workbench/); assert.doesNotMatch(withoutSharedFocusInputExclusion(css.sales), /\.arco-|sale-lines-table|sales-detail-facts/);
  assert.match(css['sales-detail'], /sales-detail-facts/); assert.match(css.transfers, /transfer-route/);
  assert.doesNotMatch(css.transfers, /transfer-editor|pd-tabs|iw-product-drawer/);
  assert.match(css['transfer-detail'], /transfer-editor/); assert.doesNotMatch(css['transfer-detail'], /pd-tabs|iw-product-drawer/);
  assert.match(css['transfer-product'], /pd-tabs/); assert.match(css['transfer-product'], /iw-product-drawer/); assert.doesNotMatch(css['transfer-product'], /\.mx-/);
  const hostStyles = await readFile(path.join(outdir, result.hostStyles), 'utf8'); assert.match(hostStyles, /background:#fff/);
  assert.doesNotMatch(hostStyles, /@import|sales-workbench|party-workbench|transfer-route|transfer-editor|\.mx-|pd-tabs|\.arco-/);
  assert.equal(await readFile(path.join(outdir, result.manifest.productDrawerStyles), 'utf8'), await readFile(path.resolve(here, '../../inventory/product-drawer.css'), 'utf8'));
  assert.deepEqual(JSON.parse(await readFile(path.join(outdir, 'application-assets.json'), 'utf8')), result.manifest);
  assert.deepEqual(JSON.parse(await readFile(path.join(outdir, 'metafile.json'), 'utf8')), result.metafile);
  // Execute the exact emitted ESM entry against its exact HTML, still in jsdom,
  // with a synthetic fetch. This is not a browser or real HTTP/cookie check.
  const emittedDom = new JSDOM(html, { url: `${configuration.http.origin}${configuration.assets.basePath}`, pretendToBeVisual: true });
  const saved = new Map();
  const install = (key, value) => { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, value }); };
  const emittedCalls = [];
  try {
    for (const key of ['window', 'document', 'navigator', 'location', 'HTMLElement', 'HTMLIFrameElement', 'HTMLInputElement', 'HTMLButtonElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) install(key, emittedDom.window[key]);
    install('fetch', async (url, init) => {
      emittedCalls.push({ url, init }); assert.equal(url, 'https://synthetic.test/api/auth/session');
      assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error');
      return new Response(JSON.stringify({ principal: { accountId: '00000000-0000-0000-0000-000000000901', staffId: '00000000-0000-0000-0000-000000000902', loginName: 'SYNTHETIC-EMITTED-ENTRY', role: 'ADMIN', hallId: null, authVersion: 1 } }), { headers: { 'content-type': 'application/json' } });
    });
    const until = async (check, label) => { const deadline = Date.now() + 5000; while (!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 12)); assert.ok(check(), label); };
    await import(pathToFileURL(path.join(outdir, result.manifest.entry)).href);
    const root = emittedDom.window.document.getElementById('naijue-erp-root');
    await until(() => root.textContent.includes('尚未核验'), 'Actual emitted entry mounts the actual HTML root');
    assert.equal(emittedCalls.length, 0); assert.equal(emittedDom.window.document.querySelectorAll('link').length, 2);
    [...root.querySelectorAll('button')].find(button => button.textContent.trim() === '核验登录状态').click();
    await until(() => root.querySelector('.demo-frame'), 'Actual emitted entry reaches real auth/frame after one explicit synthetic session response');
    assert.equal(emittedCalls.length, 1); assert.equal(root.querySelectorAll('.sidebar a').length, 3); assert.equal(emittedDom.window.document.querySelectorAll('link').length, 2);
    emittedDom.window.dispatchEvent(new emittedDom.window.PageTransitionEvent('pagehide', { persisted: true }));
    assert.equal(root.childElementCount, 0);
    console.log('PASS emitted-entry smoke: exact built HTML + ESM executes in jsdom, startup is inert, one explicit mocked session check reaches the reused three-route frame, pagehide disposes it.');
  } finally {
    emittedDom.window.close();
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
  console.log(JSON.stringify({ syntheticStaticOnly: true, html: result.html, shellStyles: ['application.css', result.hostStyles], startupInputs: inputsOf(startup).sort(), routeStyles: result.manifest.styles, productDrawerStyles: result.manifest.productDrawerStyles }, null, 2));
  console.log('PASS host build: explicit configuration; actual HTML/manifest/output wiring; shell-only startup CSS/JS; separate inventory/sales/transfer/detail/product code and CSS; no eager preload, inline executable script, fixture, listener or browser.');
} finally { await rm(temporary, { recursive: true, force: true }); }
