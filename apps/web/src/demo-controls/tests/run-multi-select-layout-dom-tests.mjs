import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../../..');
const temporary = await mkdtemp(path.join(here, '.multi-layout-'));
const css = async entry => {
  const result = await build({ entryPoints: [path.join(repo, entry)], bundle: true, write: false, minify: true, metafile: true, logLevel: 'warning' });
  if (entry.endsWith('/demo-controls/multi-select.css')) {
    for (const input of Object.keys(result.metafile.inputs)) assert.doesNotMatch(input, /dist\/css\/arco\.css|\/es\/style\/index\.css$/, 'The action supplies only scoped primitives, never the installed global reset');
  }
  return result.outputFiles[0].text;
};
const artifact = process.argv[2];
const styles = [];
const provenance = JSON.parse(await readFile(path.join(here, '../multi-select-source-provenance.json'), 'utf8'));
const primitive = provenance.installedArco.copiedPrimitiveSource;
assert.equal(createHash('sha256').update(await readFile(path.join(repo, 'node_modules/@arco-design/web-react', primitive.file))).digest('hex'), primitive.sha256, 'Scoped primitive provenance must match the installed source');
if (artifact) {
  // Diagnostic mode reads the exact rejected derivative without rebuilding it.
  const html = await readFile(artifact, 'utf8');
  const matches = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
  assert.ok(matches.length, 'The named diagnostic artifact must contain real inline CSS');
  styles.push({ name: 'rejected-artifact', css: matches.map(match => match[1]).join('\n') });
} else {
  // Compile the actual portable source graph, not an isolated component stylesheet.
  // No HTML is generated or labelled as a reviewed/committed derivative here.
  const portable = await build({ absWorkingDir: path.join(repo, 'apps/web/preview-core-pages'), entryPoints: ['main.tsx'], outdir: path.join(temporary, 'portable'), bundle: true, platform: 'browser', target: 'es2022', format: 'iife', minify: true, write: false, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': '"about:blank"' }, logLevel: 'warning' });
  const portableCss = portable.outputFiles.find(file => file.path.endsWith('.css'))?.text;
  assert.ok(portableCss, 'Actual portable graph must emit CSS');
  assert.match(portableCss, /\.demo-multi-select/, 'Portable output includes the shared action stylesheet');
  styles.push({ name: 'portable', css: portableCss });
  const shell = await css('apps/web/src/application/styles/shell.css');
  styles.push({ name: 'split-transfer', css: shell + await css('apps/web/src/application/styles/transfers.css'), routes: ['transfer'] });
  styles.push({ name: 'split-sales', css: shell + await css('apps/web/src/application/styles/sales.css') + await css('apps/web/src/demo-controls/multi-select.css'), routes: ['sales'] });
}
const dom = new JSDOM('<!doctype html><style></style><div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLIFrameElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'Element', 'SVGElement', 'MutationObserver', 'ShadowRoot', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'innerWidth', 'innerHeight', 'pageXOffset', 'pageYOffset']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; dom.window.ResizeObserver = globalThis.ResizeObserver;
dom.window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: text => ({ width: text.length * 7 }) });
let root;
try {
  const output = path.join(temporary, 'entry.mjs');
  await build({ entryPoints: [path.join(here, 'multi-select-layout-entry.tsx')], outfile: output, bundle: true, platform: 'browser', format: 'esm', external: ['react', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, jsx: 'automatic', logLevel: 'warning' });
  const { act, createElement: h, StrictMode, createRoot, DemoMultiSelectAction } = await import(pathToFileURL(output).href);
  const host = document.getElementById('root');
  root = createRoot(host);
  for (const scenario of styles) {
    console.log(JSON.stringify({ cssScenario: scenario.name, cssSha256: createHash('sha256').update(scenario.css).digest('hex') }));
    document.querySelector('style').textContent = scenario.css;
    for (const route of scenario.routes ?? ['transfer', 'sales']) {
      // These are the actual filter field ancestors in transfers-page/sales-page.
      const fieldTag = route === 'transfer' ? 'label' : 'div';
      await act(async () => root.render(h(StrictMode, null, h('section', { className: `demo-ui ${route === 'transfer' ? 'transfer-route' : 'sales-workbench'}` },
        h('form', { className: 'tc-filters' }, h('div', { className: 'tc-filter-row' }, h(fieldTag, { ...(route === 'sales' ? { className: 'iw-field' } : {}), 'data-field': '' }, h('span', null, '状态'),
          h('div', { className: route === 'transfer' ? 'transfer-multi-control' : 'demo-multi-host' }, h(DemoMultiSelectAction, { key: `${scenario.name}-${route}`, label: '状态', allLabel: '全部状态', options: [{ id: 'DRAFT', name: '未审核' }, { id: 'APPROVED', name: '已审核' }, { id: 'VOID', name: '已作废' }], value: [], completeUniverse: true, open: true, onChange() {} })))))))));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
      const field = host.querySelector('[data-field]');
      const rows = [...host.querySelectorAll('.arco-tree-node')];
      assert.equal(rows.length, 4, 'The real installed TreeSelect renders ALL plus three enum rows');
      const checkbox = rows[1].querySelector('label.arco-checkbox');
      const input = checkbox.querySelector('input');
      const title = rows[1].querySelector('.arco-tree-node-title');
      const search = host.querySelector('.arco-tree-select-view input');
      // Snapshot each element once; assertions and diagnostics use the same
      // computed declaration, without mutating DOM or injecting test CSS.
      const styleCache = new WeakMap();
      const computed = element => {
        if (!styleCache.has(element)) styleCache.set(element, getComputedStyle(element));
        return styleCache.get(element);
      };
      const maskWrapper = checkbox.querySelector('.arco-checkbox-mask-wrapper');
      const observation = { scenario: scenario.name, route, field: { display: computed(field).display, flexDirection: computed(field).flexDirection }, row: { display: computed(rows[1]).display, alignItems: computed(rows[1]).alignItems, children: [...rows[1].children].map(child => `${child.tagName}.${child.className}`) }, checkbox: { display: computed(checkbox).display, flexDirection: computed(checkbox).flexDirection, gap: computed(checkbox).gap, alignItems: computed(checkbox).alignItems, fontSize: computed(checkbox).fontSize, lineHeight: computed(checkbox).lineHeight }, maskWrapper: { display: computed(maskWrapper).display, lineHeight: computed(maskWrapper).lineHeight }, input: { position: computed(input).position, width: computed(input).width, height: computed(input).height, opacity: computed(input).opacity }, title: { fontSize: computed(title).fontSize }, search: { fontSize: computed(search).fontSize, minWidth: computed(search).minWidth }, markup: rows[1].outerHTML };
      console.log(JSON.stringify(observation));
      assert.equal(computed(field).display, 'flex', 'Outer field keeps source stacked label/control layout');
      assert.equal(computed(field).flexDirection, 'column');
      for (const row of rows) {
        const box = row.querySelector('label.arco-checkbox');
        assert.equal(computed(row).display, 'flex');
        assert.equal(computed(row).alignItems, 'flex-start');
        assert.equal(computed(row).flexWrap, 'nowrap');
        assert.equal(computed(box).display, 'inline-block', 'Field-label layout must not override the installed checkbox inline baseline box');
        assert.notEqual(computed(box).flexDirection, 'column', 'No field flex-column may leak into an internal checkbox label');
        assert.equal(computed(box).lineHeight, '32px');
        assert.equal(computed(box).fontSize, '14px', 'Field font-size must not override the installed checkbox leaf');
      }
      assert.equal(computed(input).position, 'absolute');
      assert.equal(computed(maskWrapper).display, 'inline-block', 'Action-only CSS must retain the installed icon-hover inline box without global Arco');
      assert.equal(computed(maskWrapper).lineHeight, '1', 'Checkbox-specific line-height must win over the primitive icon-hover base');
      assert.match(computed(host.querySelector('.demo-multi-select')).getPropertyValue('--color-white').trim(), /^#(?:fff|ffffff)$/i);
      assert.equal(computed(host.querySelector('.demo-multi-select')).getPropertyValue('--border-radius-circle').trim(), '50%');
      assert.equal(computed(input).width, '0px'); assert.equal(computed(input).height, '0px'); assert.equal(computed(input).opacity, '0');
      assert.equal(observation.title.fontSize, '13px');
      assert.equal(observation.search.fontSize, '13px'); assert.equal(observation.search.minWidth, '32px');
      // Installed TreeSelect's size+multiple rule authors height:auto with higher
      // specificity, including in the frozen source. Source min/max clamp it32px.
      assert.equal(computed(host.querySelector('.arco-tree-select-view')).minHeight, '32px');
      assert.equal(computed(host.querySelector('.arco-tree-select-view')).maxHeight, '32px');
      assert.equal(computed(host.querySelector('.arco-input-tag-tag')).height, '23px');
      console.log(`PASS shared multi-select layout cascade: ${scenario.name}/${route}`);
    }
  }
  console.log('PASS actual TreeSelect DOM and computed CSS invariants across current portable and production split styles. JSDOM does not perform browser layout or prove same-row pixels; actual-browser comparison remains required.');
} finally {
  if (root) await (await import('react')).act(async () => root.unmount());
  dom.window.close(); await rm(temporary, { recursive: true, force: true });
}
