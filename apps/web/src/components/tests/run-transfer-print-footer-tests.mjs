/** Prepared RED->GREEN test; not executed by preparer. No browser, DB or print device. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), tmp = await mkdtemp(path.join(here, '.transfer-print-test-'));
const dom = new JSDOM('<div id="root"></div>', { url: 'https://synthetic.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLIFrameElement', 'HTMLInputElement', 'Element', 'SVGElement', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver', 'getComputedStyle'])
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const fetches = []; globalThis.fetch = async (...args) => { fetches.push(args); throw new Error('Print tests must perform no requests'); };
let root, act;
try {
  const out = path.join(tmp, 'entry.mjs');
  await build({ stdin: { resolveDir: here, loader: 'tsx', contents: `export {act,createElement} from 'react';export {createRoot} from 'react-dom/client';export {transferDocumentOutput} from '../document-output-contracts.ts';export {createDocumentPrintHtml,createDocumentWorkbook,DocumentOutputActions} from '../document-output.tsx';export {classifiedTransfer} from './transfer-print-fixtures.ts';` }, outfile: out,
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' }, external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    banner: { js: "import{createRequire}from'node:module';const require=createRequire(import.meta.url);" }, logLevel: 'warning' });
  const lib = await import(pathToFileURL(out).href); act = lib.act;
  const parsed = input => new JSDOM(lib.createDocumentPrintHtml(lib.transferDocumentOutput(input))).window.document;
  await test('single-group saved VOID print has exact native style counts and all category entries', () => {
    const data = lib.classifiedTransfer(false), printed = parsed(data), footer = printed.querySelector('[aria-label="商品汇总"]');
    assert.ok(footer, 'Original N34-T10 footer absent on old code (expected RED)');
    assert.equal(printed.querySelectorAll('main section').length, 1);
    assert.equal(footer.querySelector('[data-print-styles]').textContent, '4款');
    assert.equal(footer.children[1].textContent, '数量：9007199254741031');
    assert.deepEqual([...footer.querySelectorAll('.product-tag')].map(x => x.textContent), ['TEST 衬衫 1', 'TEST 同名分类 1', 'TEST 同名分类 1', '待确认分类 1']);
    assert.deepEqual([...footer.querySelectorAll('[data-print-category-id]')].map(x => x.dataset.printCategoryId), data.categorySummary.items.slice(0, 3).map(x => x.categoryId));
    assert.equal(footer.querySelector('button'), null, 'Paper never truncates to interactive +more');
    assert.equal(footer.querySelector('[aria-label="商品信息"]').title, '按当前商品分类统计');
    assert.deepEqual([...printed.querySelectorAll('thead th')].slice(0, 2).map(x => x.textContent), ['商品名称', '款号']);
    assert.match(printed.querySelector('style').textContent, /@page\{size:552mm 241mm/);
    assert.equal(printed.querySelectorAll('script').length, 0);
  });
  await test('multiple size groups count native product once and retain exact SKU quantity/export snapshots', () => {
    const data = lib.classifiedTransfer(), output = lib.transferDocumentOutput(data), printed = parsed(data);
    assert.equal(printed.querySelectorAll('main section').length, 2);
    assert.equal(output.printSections.reduce((sum, group) => sum + group.rows.length, 0), 5, 'Five native color/FIT rows but four products');
    assert.equal(printed.querySelector('[data-print-styles]').textContent, '4款', 'Not SKU, tuple, label or available-but-unused SKU count');
    assert.deepEqual(output.sections[0].rows.map(x => [x[1], x[7], x[8]]), data.document.lines.map(x => [x.skuId, x.quantity, x.snapshot.barcode]));
    assert.equal(output.printSections.flatMap(x => x.rows).flat().filter(x => x === '9007199254740993').length, 1);
    assert.deepEqual([...printed.querySelectorAll('.product-tag')].map(x => x.textContent), ['TEST 衬衫 1', 'TEST 同名分类 1', 'TEST 同名分类 1', '待确认分类 1']);
    const { printSummary, ...withoutPrintSummary } = output;
    assert.deepEqual(lib.createDocumentWorkbook(output), lib.createDocumentWorkbook(withoutPrintSummary), 'Print-only footer cannot change XLSX bytes');
  });
  await test('HISTORY cutoff suppresses supplied CURRENT classification and current native style count', () => {
    const printed = parsed({ ...lib.classifiedTransfer(), stockBasis: 'CUTOFF_HISTORY' }), footer = printed.querySelector('[aria-label="商品汇总"]');
    assert.ok(footer); assert.equal(footer.querySelector('[data-print-styles]').textContent, '历史未记录款数');
    assert.equal(footer.querySelector('[aria-label="商品信息"]').textContent, '历史未记录分类');
    assert.equal(footer.querySelectorAll('.product-tag').length, 0); assert.equal(footer.querySelectorAll('[data-print-category-id]').length, 0);
    assert.equal(footer.children[1].textContent, '数量：9007199254741031', 'Known saved quantity stays exact, not zero/unknown');
  });
  await test('explicit UNKNOWN history summary stays unknown without reading a current category', () => {
    const data = { ...lib.classifiedTransfer(), stockBasis: 'CUTOFF_HISTORY', categorySummary: { basis: 'UNKNOWN', metric: 'PRODUCT_COUNT', categoryCount: null, items: [], hasMore: false } };
    const footer = parsed(data).querySelector('[aria-label="商品汇总"]');
    assert.ok(footer); assert.equal(footer.querySelector('[aria-label="商品信息"]').textContent, '历史未记录分类');
    assert.equal(footer.querySelectorAll('.product-tag').length, 0);
  });
  await test('legacy missing summary is unavailable, not a guessed/default category', () => {
    const { categorySummary, ...data } = lib.classifiedTransfer(), footer = parsed(data).querySelector('[aria-label="商品汇总"]');
    assert.ok(footer); assert.equal(footer.querySelector('[data-print-styles]').textContent, '4款');
    assert.equal(footer.querySelector('[aria-label="商品信息"]').textContent, '分类统计未提供'); assert.equal(footer.querySelectorAll('.product-tag').length, 0);
  });
  await test('category names are escaped literal text and sales has no transfer footer', () => {
    const data = lib.classifiedTransfer(), unsafe = '</span><script>throw 1</script>&"';
    const printed = parsed({ ...data, categorySummary: { ...data.categorySummary, items: [{ ...data.categorySummary.items[0], categoryName: unsafe }, ...data.categorySummary.items.slice(1)] } });
    assert.equal(printed.querySelector('.product-tag').textContent, unsafe + ' 1'); assert.equal(printed.querySelectorAll('script').length, 0);
    const sales = { ...lib.transferDocumentOutput(data), kind: 'sales' };
    assert.equal(new JSDOM(lib.createDocumentPrintHtml(sales)).window.document.querySelector('[aria-label="商品汇总"]'), null);
  });
  await test('actual UI print entry cancels/reopens without requests, commands, download or native print', async () => {
    const data = lib.classifiedTransfer(), reads = [], h = lib.createElement; let nativePrint = 0, downloads = 0;
    const oldClick = dom.window.HTMLAnchorElement.prototype.click;
    dom.window.HTMLAnchorElement.prototype.click = () => { downloads++; };
    root = lib.createRoot(document.getElementById('root'));
    const output = lib.transferDocumentOutput(data), sourceKey = `${output.id}:${output.version}`;
    await act(async () => root.render(h(lib.DocumentOutputActions, { sourceKey, getDocument: () => { reads.push('local-output'); return output; } })));
    const button = text => [...document.querySelectorAll('button')].find(x => x.textContent === text);
    const open = async () => {
      await act(async () => button('打印').click());
      const frame = document.querySelector('iframe'); assert.ok(frame); assert.match(frame.srcdoc, /TEST 衬衫/);
      frame.contentWindow.print = () => { nativePrint++; throw new Error('Never invoke a printer'); };
      await act(async () => frame.dispatchEvent(new Event('load'))); assert.equal(button('浏览器打印').disabled, false); return frame;
    };
    let frame = await open();
    await act(async () => frame.contentDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(document.querySelector('iframe'), null); frame = await open();
    await act(async () => document.querySelector('[aria-label="关闭打印预览"]').click());
    assert.equal(document.querySelector('iframe'), null); assert.equal(reads.length, 2);
    assert.deepEqual(fetches, []); assert.equal(nativePrint, 0); assert.equal(downloads, 0);
    await act(async () => root.unmount()); root = null; dom.window.HTMLAnchorElement.prototype.click = oldClick;
  });
} finally {
  if (root) await act(async () => root.unmount()); dom.window.close(); await rm(tmp, { recursive: true, force: true });
}
