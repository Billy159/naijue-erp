import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build, transform } from 'esbuild';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../..');
const text = relative => readFile(path.join(source, relative), 'utf8');
const frozen = process.env.FROZEN_DEMO_UI ?? '/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3';
const original = name => readFile(path.join(frozen, 'frontend', name), 'utf8');
const frame = await text('demo-presentation/frame.css');
const controls = await text('demo-presentation/controls.css');
const sales = await text('sales/detail.css');
const transfers = await text('transfers/transfers.css');
const detail = await text('sales/detail-content.tsx');
const header = await text('sales/detail-header.tsx');
const styles = await original('styles.css');
const alignment = await original('sales-detail-alignment.css');
const consistency = await original('golden-consistency.css');
const transferOriginal = await original('transfer-current.css');
const final = await original('final-ui.css');
const statusEnhancer = await original('final-ui.js');
const enhancer = await original('interaction-common.js');
const order = await readFile(path.join(frozen, 'LOAD_ORDER.md'), 'utf8');
assert.ok(order.indexOf('styles.css') < order.indexOf('golden-consistency.css'));
assert.ok(order.indexOf('transfer-current.css') < order.indexOf('final-ui.css'));
assert.ok(order.indexOf('final-ui.css') < order.indexOf('sales-detail-alignment.css'));
assert.ok(styles.includes('input:not([type=checkbox]):not([type=radio]):focus-visible,select:focus-visible,textarea:focus-visible{outline:0}'));
assert.ok(consistency.includes('body:not(.inventory-workbench) #page{padding:16px 20px}'));
assert.ok(alignment.includes('grid-template-columns: minmax(0,1fr) minmax(0,1.2fr) auto; align-items: center;'));
assert.ok(transferOriginal.includes('width:100%;font-size:13px'));
assert.ok(transferOriginal.includes('height:32px;padding:4px 10px;white-space:nowrap;'));
assert.ok(consistency.includes('th{height:40px!important;font-weight:600!important;'));
assert.ok(consistency.includes('td{height:44px!important}'));
assert.ok(final.includes('border-radius:4px;padding:3px 7px;font-size:12px;font-weight:500'));
assert.ok(statusEnhancer.includes("/草稿|已弃审|未审核|未保存/.test(text)?'pending'"));
assert.ok(final.includes('[data-document-status=pending]{background:var(--ca-warning-soft)!important;color:var(--ca-warning)!important}'));
assert.ok(enhancer.includes("heads[idx].classList.add('ui-action-cell')"));
assert.doesNotMatch(detail, /sales-line-record|sales-record-metadata|selectedLine|setSelectedLine/);
assert.match(detail, /disabled title="商品规格详情尚未接入">查看/);
assert.match(header, /\['导出', '打印', '操作历史'\].*disabled title=/);
assert.doesNotMatch(detail, /readList\(|readReferences\(|productReader|fetch\(/);
assert.equal((detail.match(/void query\.run\(salesTarget\(props\.salesId\)\)/g) ?? []).length, 2);

const dom = new JSDOM(`<!doctype html><style>${frame.replace(/@import[^;]+;/g, '')}\n${controls}\n${sales}\n${transfers}</style><div class="demo-ui"><button id="button">Button</button><input id="checkbox" type="checkbox"><input id="radio" type="radio"><input id="native"><select id="select"></select><textarea id="textarea"></textarea><span class="arco-picker"><input id="arco-date"></span><span class="arco-tree-select"><input id="arco-search"></span></div>`);
const rules = [...dom.window.document.styleSheets[0].cssRules];
const rule = selector => {
  const matches = rules.filter(item => item.selectorText === selector);
  assert.equal(matches.length, 1, `Exactly one declaration for ${selector}`);
  return matches[0];
};
const value = (selector, property, expected) => assert.equal(rule(selector).style.getPropertyValue(property), expected, `${selector}: ${property}`);
value('.demo-ui .demo-page:not(.demo-page-inventory)', 'padding', '16px 20px');
value('.demo-ui .demo-page', 'padding', '12px var(--ui-page-space) 16px');
const focusException = rule('.demo-ui input:not([type=checkbox]):not([type=radio]):focus-visible,.demo-ui select:focus-visible,.demo-ui textarea:focus-visible');
assert.equal(focusException.style.outline, '0px');
const focusBase = rule('.demo-ui :is(button,a,input,select,textarea,summary,[tabindex]):focus-visible');
assert.ok(rules.indexOf(focusException) > rules.indexOf(focusBase));
const withoutFocus = selector => selector.replaceAll(':focus-visible', '');
for (const id of ['button', 'checkbox', 'radio']) assert.equal(dom.window.document.getElementById(id).matches(withoutFocus(focusException.selectorText)), false, `${id} keeps keyboard outline`);
for (const id of ['native', 'select', 'textarea', 'arco-date', 'arco-search']) assert.equal(dom.window.document.getElementById(id).matches(withoutFocus(focusException.selectorText)), true, `${id} avoids double inner outline`);
const nativeFocus = rules.find(item => item.selectorText?.includes(':not(:where(.arco-picker input'));
assert.ok(nativeFocus); assert.equal(nativeFocus.style.getPropertyValue('box-shadow'), 'var(--ca-focus-ring)');
assert.equal(dom.window.document.getElementById('native').matches(withoutFocus(nativeFocus.selectorText)), true);
for (const id of ['checkbox', 'radio', 'arco-date', 'arco-search']) assert.equal(dom.window.document.getElementById(id).matches(withoutFocus(nativeFocus.selectorText)), false, `${id} does not acquire native-text inner shadow`);
value('.sales-detail-facts .sale-payment-read', 'grid-template-columns', 'minmax(0,1fr) minmax(0,1.2fr) auto');
value('.sales-detail-facts .sale-payment-read', 'align-items', 'center');
value('.sales-detail-facts .sale-payment-read>*', 'white-space', 'nowrap');
value('.sales-detail-facts .sale-payment-read>*', 'overflow', 'hidden');
value('.sales-detail-facts .sale-payment-read>*', 'text-overflow', 'ellipsis');
assert.equal(rule('.sales-detail-facts .sale-payment-read').style.getPropertyValue('max-width'), '');
assert.doesNotMatch(sales, /grid-template-columns:80px|grid-template-columns:100px/);
value('.transfer-list-table', 'font-size', '13px');
value('.transfer-list-table th,.transfer-list-table td', 'padding', '4px 10px');
value('.transfer-list-table th,.transfer-list-table td', 'font-weight', '400');
value('.transfer-list-table th,.transfer-list-table td', 'height', '44px');
value('.transfer-list-table th', 'height', '40px');
value('.transfer-list-table th', 'font-weight', '600');
value('.transfer-route .tc-state-tag', 'padding', '3px 7px');
value('.transfer-route .tc-state-tag', 'border-radius', '4px');
value('.transfer-route .tc-state-tag', 'font-weight', '500');
value('.transfer-route .tc-state-tag', 'color', 'var(--ca-neutral-tag-ink)');
value('.transfer-route .tc-state-tag[data-document-status=DRAFT]', 'background', 'var(--ca-warning-soft)');
value('.transfer-route .tc-state-tag[data-document-status=DRAFT]', 'color', 'var(--ca-warning)');
value('.transfer-route .tc-state-tag[data-document-status=APPROVED]', 'background', 'var(--ca-success-soft)');
for (const table of ['.sales-detail-facts .sale-lines-table', '.transfer-list-table']) {
  value(`${table} .ui-action-cell`, 'position', 'sticky'); value(`${table} .ui-action-cell`, 'right', '0px');
  value(`${table} .ui-action-cell`, 'z-index', '2'); value(`${table} thead .ui-action-cell`, 'z-index', '7');
  assert.notEqual(rule(`${table} .ui-action-cell`).style.background, 'transparent');
  value(`${table} tbody tr:hover td`, 'background', 'var(--ca-table-row-hover)');
}
dom.window.close();

const temporary = await mkdtemp(path.join(here, '.document-source-'));
try {
  for (const [name, css] of [['frame', frame], ['sales-detail', sales], ['transfers', transfers]]) {
    const result = await transform(css, { loader: 'css', logLevel: 'warning' });
    assert.equal(result.warnings.length, 0, `${name} CSS parses without warnings`);
  }
  const output = path.join(temporary, 'frame.mjs');
  await build({ stdin: { contents: "export { DemoFrame } from './demo-frame.tsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: path.resolve(source, 'demo-presentation'), loader: 'tsx' }, outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', logLevel: 'warning' });
  const { DemoFrame, createElement, renderToStaticMarkup } = await import(pathToFileURL(output).href);
  for (const selected of [true, false]) {
    const rendered = new JSDOM(renderToStaticMarkup(createElement(DemoFrame, { navigation: { inventory: { selected } }, breadcrumb: 'SYNTHETIC', children: 'SYNTHETIC' })));
    assert.equal(rendered.window.document.querySelector('main').classList.contains('demo-page-inventory'), selected);
    rendered.window.close();
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
console.log('PASS source/CSSOM/SSR: final non-inventory spacing without changing inventory marker, scoped keyboard-focus exceptions, final settlement grid, transfer font/padding/heights/badge, sticky action cells with opaque/hover surfaces; non-Demo saved blocks absent, unavailable product/history semantics preserved.');
console.log('LIMIT: source, CSS selector/declaration and synthetic DOM assertions only. No browser layout, real pixel parity, live request, server, database or performance acceptance.');
