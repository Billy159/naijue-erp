import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build, transform } from 'esbuild';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../../..');
const frozen = process.env.FROZEN_DEMO_UI ?? '/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3';
const hashes = {
  'sales-current.js': '846a217125cc7f0fe2800a7508a01131ad3648cdd4fe8a69cf8284a4b6b4d3a1',
  'sales-summary.js': '069889073393a0bb33264067f1d8e259821cde4512dbcbfbd3822b310c990404',
  'sales-current.css': 'f21cc2f3f6b670d8bc96902ae659aa5ee6c54a3384cd3f9b8912498a15fcd2fd',
  'sales-golden.css': '51ba8658fd8c7b7eb270b62c0ddef6f335d37163290f711fa10c950f19b9a04f',
  'sales-refinement.css': '61016985258cc56c40d7f75dbd7b016e06619abef92e6a6488d86189fbface8b',
  'sales-detail-alignment.css': '8b903028a1fd91407347f71d63bd7cc3a891df66c84d7e179647475847ef833b',
  'golden-consistency.css': '05cb997a5205ced67b8bba1df5e62f43529f67ef37bfd798439547f099888b22',
  'transfer-current.css': '5f36c1b79afdabf6daf9558f2408cd29e386b141038efc4b03a733afe322377e',
  'final-ui.css': '091f0855996134925b1c99a187977cfcd652210af8f447dd451bb38d27a154fa',
  'ui-review.css': '087dfe16245092a6113977a2cca5c8ddcb229f890af06acd5915e3b483b5b64f',
};
const sources = {};
for (const [name, hash] of Object.entries(hashes)) {
  const bytes = await readFile(path.join(frozen, 'frontend', name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, `Frozen evidence changed: ${name}`);
  sources[name] = bytes.toString('utf8');
}
const loadOrder = await readFile(path.join(frozen, 'LOAD_ORDER.md'), 'utf8');
assert.ok(loadOrder.indexOf('sales-golden.css') < loadOrder.indexOf('sales-refinement.css'));
assert.ok(loadOrder.indexOf('sales-refinement.css') < loadOrder.indexOf('sales-detail-alignment.css'));
const page = await readFile(path.join(here, '../sales-page.tsx'), 'utf8');
const detail = await readFile(path.join(here, '../detail-content.tsx'), 'utf8');
const host = await readFile(path.join(here, '../detail-host.tsx'), 'utf8');
const css = await readFile(path.join(here, '../sales.css'), 'utf8');
const detailCss = await readFile(path.join(here, '../detail.css'), 'utf8');
const header = await readFile(path.join(here, '../detail-header.tsx'), 'utf8');
const columns = "['日期', '销货单号', '状态', '业务类型', '营业厅', '营业员', '商品信息', '数量', '金额', '最后更新', '操作']";
assert.ok(page.includes(columns));
assert.ok(sources['sales-current.js'].includes(columns.replaceAll(', ', ',')));
const finalWidths = [...sources['sales-refinement.css'].matchAll(/\[data-document-list="sales"\] \.tc-list-scroll th:nth-child\((\d+)\) \{ width: (\d+)px;/g)].map(match => [match[1], match[2]]);
assert.equal(finalWidths.length, 11);
for (const [column, width] of finalWidths) assert.ok(css.includes(`.sales-list th:nth-child(${column}){width:${width}px}`));
assert.ok(sources['sales-current.js'].includes('[270,100,122,84,80,95,90,108,99,142]'));
assert.ok(detail.includes('[270, 100, 122, 84, 80, 95, 90, 108, 99, 142]'));
assert.ok(sources['sales-detail-alignment.css'].includes('grid-template-columns: 160px repeat(5, minmax(0, 1fr))'));
assert.ok(detailCss.includes('grid-template-columns:160px repeat(5,minmax(0,1fr))'));
assert.ok(detailCss.includes('.sales-detail-facts.sale-editor{display:flex;flex-direction:column;'));
assert.ok(detailCss.includes('.sales-detail-facts .sales-document-state{display:flex;align-items:center;'));
assert.ok(detail.indexOf('className="sale-note-row"') < detail.indexOf('className="sale-entry-section"'));
assert.match(page, /timeZone: 'Asia\/Shanghai'/);
assert.match(page, /row\.incomingQuantity/); assert.match(page, /row\.outgoingQuantity/); assert.match(page, /row\.updatedAt/);
assert.match(page, /历史分类未提供/); assert.match(page, /不根据现商品资料推断/);
assert.match(sources['sales-summary.js'], /历史单据未记录分类，未按当前商品资料推断/);
assert.match(sources['sales-current.js'], /<div class="tc-head sale-head"><h1>/);
assert.match(header, /<div className="tc-head sale-head sales-document-state"><h1>查看销货单<\/h1>/);
assert.ok(header.indexOf('返回列表') < header.indexOf("['导出', '打印', '操作历史']"));
assert.match(page, /hidden=\{detailActive\}/);
assert.match(page, /active=\{!detailActive\}/);
assert.match(page, /target && !detailAvailable\) setTarget\(null\)/); assert.match(page, /useLayoutEffect/);
assert.match(page, /disabled=\{!detailAvailable\}/);
assert.doesNotMatch(host, /<dialog|aria-modal|showModal|onCancel|onKeyDown|event\.key/);
assert.doesNotMatch(css, /sales-detail-facts|sale-editor|sale-doc-fields|sale-lines-table|sale-summary|sales-detail-dialog/);
assert.doesNotMatch(detailCss, /position:fixed|::backdrop|sales-detail-dialog/);
assert.match(host, /loadStyles: props\.loadDetailStyles/);
assert.doesNotMatch(detail + host, /import ['"][^'"]*detail\.css/);
for (const source of [page, detail, host, header]) {
  assert.doesNotMatch(source, /LEGACY_REAL|SALES_SERVICE|PRODUCT_CATALOG|ERP_DEMO|real-data-bridge|fetch\(/);
}
assert.doesNotMatch(detail, /productReader|readList\(|readReferences\(/);
assert.equal((detail.match(/void query\.run\(salesTarget\(props\.salesId\)\)/g) ?? []).length, 2, 'One effect read plus explicit retry only');
assert.doesNotMatch(detail, /\bNumber\([^)]*(?:quantity|Amount|netDue|Price)/);
const scaffold = await readFile(path.join(root, 'apps/web/src/application/styles/sales-base.css'), 'utf8');
assert.equal((await transform(scaffold, { loader: 'css', minify: true })).code.trim(), '');
const temporary = await mkdtemp(path.join(here, '.frozen-check-'));
try {
  const out = path.join(temporary, 'output');
  const result = await build({ absWorkingDir: root, entryPoints: [path.join(here, '../sales-route.tsx')], outdir: out, bundle: true, splitting: true, platform: 'browser', format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime'], metafile: true, logLevel: 'warning' });
  const outputs = result.metafile.outputs;
  const outputNames = new Map(Object.keys(outputs).map(name => [path.resolve(root, name), name]));
  const entry = Object.keys(outputs).find(name => outputs[name].entryPoint?.endsWith('/sales-route.tsx'));
  assert.ok(entry);
  const visited = new Set();
  const walk = name => {
    if (visited.has(name)) return; visited.add(name);
    for (const item of outputs[name].imports) if (!item.external && item.kind !== 'dynamic-import') {
      const next = outputNames.get(path.resolve(root, item.path)) ?? outputNames.get(path.resolve(root, path.dirname(name), item.path));
      assert.ok(next, `Missing output ${item.path}`); walk(next);
    }
  };
  walk(entry);
  const inputs = [...visited].flatMap(name => Object.keys(outputs[name].inputs));
  assert.equal(inputs.some(name => name.endsWith('/detail-content.tsx')), false, 'Detail code remains explicit-action lazy');
  assert.equal(Object.keys(result.metafile.inputs).some(name => name.endsWith('/detail.css')), false, 'Action CSS has no static/dynamic JS import that esbuild could hoist into route CSS');
  const routeCss = Object.keys(outputs).find(name => name.endsWith('/sales-route.css'));
  assert.ok(routeCss); const emittedRouteCss = await readFile(path.resolve(root, routeCss), 'utf8');
  assert.doesNotMatch(emittedRouteCss, /sales-detail-facts|sale-editor|sale-doc-fields|sale-lines-table|sale-summary/);
  const style = await build({ absWorkingDir: root, entryPoints: [path.join(here, '../detail.css')], outdir: path.join(temporary, 'action-style'), bundle: true, write: false, metafile: true, logLevel: 'warning' });
  assert.ok(style.outputFiles.some(file => file.text.includes('.sales-detail-facts')));
  assert.equal(Object.keys(style.metafile.inputs).length, 1, 'Separate action stylesheet reuses tokens instead of bundling shell/route/Arco');
  assert.ok(Object.keys(result.metafile.inputs).some(name => name.endsWith('/detail-content.tsx')));
  assert.equal(inputs.some(name => /\/(?:inventory|parties)\/|@arco-design\//.test(name)), false);
  console.log('PASS: 10 frozen source hashes/load order, exact list and line columns/widths, six-field grid, note order, single full-page header/action order and reveal-before-focus lifecycle, timestamp/quantity facts, explicit category gap, no legacy/catalog imports, inert scaffold, action-only detail JavaScript/CSS asset graph.');
  console.log('LIMIT: visible 返回列表 only; no native browser URL/history integration. Static/source/synthetic evidence only; no real browser, computed layout acceptance, network waterfall, timing, memory, server or database.');
} finally { await rm(temporary, { recursive: true, force: true }); }
