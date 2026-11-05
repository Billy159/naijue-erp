import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build, transform } from 'esbuild';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { resolveFrozenSourceReference } from './frozen-source-reference.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../..');
const text = relative => readFile(path.join(source, relative), 'utf8');
execFileSync(process.execPath,['--test',path.join(here,'frozen-source-reference.test.mjs')],{stdio:'inherit'});
const frozen = process.env.FROZEN_DEMO_UI;
const frozenRepository = path.resolve(source, '../../../../..', '奈爵服饰-8877-Demo');
const evidence=await resolveFrozenSourceReference({repository:path.resolve(source,'../../..'),defaultRepository:frozenRepository,explicitDirectory:frozen});
console.log('Frozen source evidence:',evidence.kind,'(eight leaves only; no full Demo/Git object claim)');
const original=evidence.original;
const frame = await text('demo-presentation/frame.css');
const controls = await text('demo-presentation/controls.css');
const sales = await text('sales/detail.css');
const transfers = await text('transfers/transfers.css');
const documentTags = await text('components/standard-status-tag.css');
const detail = await text('sales/detail-content.tsx');
const header = await text('sales/detail-header.tsx');
const styles = await original('styles.css');
const alignment = await original('sales-detail-alignment.css');
const consistency = await original('golden-consistency.css');
const transferOriginal = await original('transfer-current.css');
const final = await original('final-ui.css');
const statusEnhancer = await original('final-ui.js');
const enhancer = await original('interaction-common.js');
const order = await evidence.order();
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
assert.match(detail, /<SalesProductPresentation scope=\{scope\} \{\.\.\.\(product \? \{ capability: product \} : \{\}\)\}/);
assert.match(detail, /disabled=\{!openProduct \|\| header\.hallId === null\}/, 'Product action remains fail-closed when capability is absent or the historical hall is unknown');
assert.match(detail, /openProduct\?\.\(line\.skuId, header\.hallId\)/, 'Only the selected SKU/hall is passed to the delegated product action');
assert.match(header, /output \?\? \['导出', '打印'\]\.map.*disabled title=/, 'Unwired output actions retain disabled fallback');
assert.match(header, /<SalesHistoryAction \{\.\.\.\(history \? \{ capability: history \} : \{\}\)\}/, 'History is delegated through the optional explicit capability');
assert.doesNotMatch(detail, /readList\(|readReferences\(|productReader|fetch\(/);
assert.equal((detail.match(/void query\.run\(salesTarget\(props\.salesId\)\)/g) ?? []).length, 2);

const dom = new JSDOM(`<!doctype html><style>${frame.replace(/@import[^;]+;/g, '')}\n${controls.replace(/@import[^;]+;/g, '')}\n${sales}\n${transfers}\n${documentTags}</style><div class="demo-ui"><button id="button">Button</button><input id="checkbox" type="checkbox"><input id="radio" type="radio"><input id="native"><select id="select"></select><textarea id="textarea"></textarea><span class="arco-picker"><input id="arco-date"></span><span class="arco-tree-select"><input id="arco-search"></span></div>`);
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
const focusBases = rules.filter(item => item.selectorText === '.demo-ui :is(button,a,input,select,textarea,summary,[tabindex]):focus-visible');
assert.equal(focusBases.length, 2, 'Frozen frame outline and current control-token override are both retained');
assert.equal(focusBases[0].style.outline, '2px solid var(--ca-primary)');
assert.equal(focusBases[1].style.outline, '2px solid var(--ca-control-focus-border)');
assert.ok(rules.indexOf(focusException) > rules.indexOf(focusBases[0]));
const scopedFocusException = rules.find(item => item.selectorText?.startsWith('.demo-ui input:not(:where(.arco-input,') && item.selectorText.endsWith(':focus-visible'));
assert.ok(scopedFocusException && rules.indexOf(scopedFocusException) > rules.indexOf(focusBases[1]), 'Current native-only exception follows the control outline override');
assert.equal(scopedFocusException.style.outline, '0px');
const withoutFocus = selector => selector.replaceAll(':focus-visible', '');
for (const id of ['button', 'checkbox', 'radio']) assert.equal(dom.window.document.getElementById(id).matches(withoutFocus(focusException.selectorText)), false, `${id} keeps keyboard outline`);
for (const id of ['native', 'select', 'textarea', 'arco-date', 'arco-search']) assert.equal(dom.window.document.getElementById(id).matches(withoutFocus(focusException.selectorText)), true, `${id} avoids double inner outline`);
const nativeFocus = rules.find(item => item.selectorText?.includes(':not(:where(.arco-picker input'));
assert.ok(nativeFocus); assert.equal(nativeFocus.style.getPropertyValue('box-shadow'), 'var(--ca-focus-ring)');
assert.equal(dom.window.document.getElementById('native').matches(withoutFocus(nativeFocus.selectorText)), true);
for (const id of ['checkbox', 'radio', 'arco-date', 'arco-search']) assert.equal(dom.window.document.getElementById(id).matches(withoutFocus(nativeFocus.selectorText)), false, `${id} does not acquire native-text inner shadow`);
// The current shared editor/detail adapter deliberately follows the earlier
// frozen grid; retain both exact declarations and assert the override order.
const sharedPaymentSelector=':is(.sales-proposal-editor,.sales-detail-facts) .sale-payment-read';
const sharedPayments=rules.filter(item=>item.selectorText===sharedPaymentSelector);
assert.equal(sharedPayments.length,2);
assert.equal(sharedPayments[0].style.getPropertyValue('grid-template-columns'),'minmax(0,1fr) minmax(0,1.2fr) auto');
assert.equal(sharedPayments[1].style.getPropertyValue('grid-template-columns'),'100px minmax(160px,1fr) 110px');
assert.equal(sharedPayments[1].style.getPropertyValue('max-width'),'560px');
value('.sales-detail-facts .sale-payment-read', 'grid-template-columns', '100px minmax(160px,1fr) 110px');
value('.sales-detail-facts .sale-payment-read', 'align-items', 'center');
value('.sales-detail-facts .sale-payment-read>*', 'white-space', 'nowrap');
value('.sales-detail-facts .sale-payment-read>*', 'overflow', 'hidden');
value('.sales-detail-facts .sale-payment-read>*', 'text-overflow', 'ellipsis');
assert.equal(rule('.sales-detail-facts .sale-payment-read').style.getPropertyValue('max-width'), '560px');
const narrow=rules.filter(item=>item.conditionText==='(max-width:620px)').flatMap(item=>[...item.cssRules]).find(item=>item.selectorText===sharedPaymentSelector);
assert.ok(narrow);assert.equal(narrow.style.getPropertyValue('grid-template-columns'),'80px minmax(0,1fr) 90px','Current narrow-screen read grid remains explicit');
value('.transfer-list-table', 'font-size', '13px');
value('.transfer-list-table th,.transfer-list-table td', 'padding', '4px 10px');
value('.transfer-list-table th,.transfer-list-table td', 'font-weight', '400');
value('.transfer-list-table th,.transfer-list-table td', 'height', '44px');
value('.transfer-list-table th', 'height', '40px');
value('.transfer-list-table th', 'font-weight', '600');
// Domain adapters retain DRAFT/APPROVED/VOID while shared appearance controls
// use pending/effective/void. Their mapping is exercised by the real Tag DOM test.
value('.erp-document-tag.arco-tag', 'padding', '3px 7px');
value('.erp-document-tag.arco-tag', 'border-radius', '4px');
value('.erp-document-tag.arco-tag', 'font-weight', '500');
value('.erp-document-tag[data-status-appearance=void]', 'color', 'var(--ca-neutral-tag-ink)');
value('.erp-document-tag[data-status-appearance=pending]', 'background', 'var(--ca-warning-soft)');
value('.erp-document-tag[data-status-appearance=pending]', 'color', 'var(--ca-warning)');
value('.erp-document-tag[data-status-appearance=effective]', 'background', 'var(--ca-success-soft)');
for (const table of [':is(.sales-proposal-editor,.sales-detail-facts) .sale-lines-table', '.transfer-list-table']) {
  const cellRules=rules.filter(item=>item.selectorText===`${table} .ui-action-cell`);
  assert.ok(cellRules.length>=1);assert.equal(cellRules[0].style.position,'sticky');assert.equal(cellRules[0].style.right,'0px');assert.equal(cellRules[0].style.getPropertyValue('z-index'),'2');
  const headRules=rules.filter(item=>item.selectorText===`${table} thead .ui-action-cell`);
  assert.equal(headRules[0].style.getPropertyValue('z-index'),'7');
  const surface=cellRules.findLast(item=>item.style.background);
  assert.ok(surface && surface.style.background!=='transparent','Sticky action cells retain opaque surfaces');
  const hover=rule(`${table} tbody tr:hover td`).style.background;
  assert.equal(hover,table.startsWith(':is')?'var(--ca-table-row-hover,#f2f3f5)':'var(--ca-table-row-hover)');
}
dom.window.close();

const temporary = await mkdtemp(path.join(here, '.document-source-'));
try {
  for (const [name, css] of [['frame', frame], ['sales-detail', sales], ['transfers', transfers]]) {
    const result = await transform(css, { loader: 'css', logLevel: 'warning' });
    assert.equal(result.warnings.length, 0, `${name} CSS parses without warnings`);
  }
  const output = path.join(temporary, 'frame.mjs');
  await build({ stdin: { contents: "export { DemoFrame } from './demo-frame.tsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: path.resolve(source, 'demo-presentation'), loader: 'tsx' }, outfile: output, bundle: true, platform: 'node', format: 'esm', external:['react','react/*','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},loader:{'.css':'empty'}, jsx: 'automatic', logLevel: 'warning' });
  const { DemoFrame, createElement, renderToStaticMarkup } = await import(pathToFileURL(output).href);
  for (const selected of [true, false]) {
    const rendered = new JSDOM(renderToStaticMarkup(createElement(DemoFrame, { navigation: { inventory: { selected } }, breadcrumb: [{id:'test',label:'SYNTHETIC'}], children: 'SYNTHETIC' })));
    assert.equal(rendered.window.document.querySelector('main').classList.contains('demo-page-inventory'), selected);
    rendered.window.close();
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
console.log('PASS source/CSSOM/SSR: final non-inventory spacing without changing inventory marker, scoped keyboard-focus exceptions, final settlement grid, transfer font/padding/heights/badge, sticky action cells with opaque/hover surfaces; non-Demo saved blocks absent, explicit product/history capability delegation and disabled output fallback preserved.');
console.log('LIMIT: source, CSS selector/declaration and synthetic DOM assertions only. No browser layout, real pixel parity, live request, server, database or performance acceptance.');
