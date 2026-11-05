import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://independent.invalid/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLDialogElement', 'Element', 'SVGElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'getComputedStyle']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window); globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
const output = path.join(here, 'transfer-read-ui-independent-dom-runtime.mjs');
await build({ entryPoints: [path.join(here, 'transfer-read-ui-independent-dom-entry.tsx')], outfile: output, bundle: true, platform: 'node', format: 'esm', external: ['react', 'react/*', 'react-dom', 'react-dom/*'], banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" }, jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'warning' });
const { act, createElement: h, StrictMode, createRoot, ReadContext, TransferPageHost, detail, summary, uuid, warehouse } = await import(pathToFileURL(output).href + '?review=' + Date.now());
const host = document.getElementById('root'); let root = createRoot(host); let context; const listReads = [], detailReads = [], referenceReads = [], productReads = []; let styleReads = 0, productStyles = 0;
let detailStyles = () => Promise.resolve(), productStyle = () => Promise.resolve(); let heldDetail = null; let wide = false;
const reader = {
  async readList(read) { listReads.push(read); const rows = Array.from({ length: 25 }, (_, i) => summary(i + 1)).filter(row => read.parameters.filter.number === null || row.number.includes(read.parameters.filter.number)); const p = read.parameters; return { page: p.page, pageSize: p.pageSize, exactTotal: String(rows.length), items: rows.slice((p.page - 1) * p.pageSize, p.page * p.pageSize) }; },
  async readDetail(read) { detailReads.push(read); if (heldDetail) return heldDetail.promise; const d = detail(Number(read.parameters.transferId.slice(-12))); if (wide) d.catalog.sizeGroups[0].members.push(...Array.from({ length: 41 }, (_, i) => ({ sizeId: uuid(10000 + i), code: null, name: 'IND-SIZE-' + i, displayOrder: 4 + i }))); return d; },
};
const references = { async readWarehouses(read) { referenceReads.push(read); return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: '2', items: [warehouse(20),warehouse(21)] }; } };
const product = { reader: { async readProductBasics(read) { productReads.push(read); return { productId: read.parameters.productId, code: 'IND-PRODUCT', name: 'Independent product', categoryLabel: null, yearLabel: null, seasonLabel: null, supplierLabel: null, systemCode: null }; }, async readProductSpecifications() { throw new Error('Unexpected eager specs'); }, async readProductImages() { throw new Error('Unexpected eager images'); }, async readProductImage() { throw new Error('Unexpected eager original'); } }, loadStyles: () => { productStyles++; return productStyle(); } };
const settle = async (ms = 35) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const click = async element => { assert.ok(element, 'Click target exists'); await act(async () => { element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); element.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await settle(); };
const button = text => [...host.querySelectorAll('button')].find(el => { const copy=el.cloneNode(true); copy.querySelectorAll('[aria-hidden]').forEach(node=>node.remove()); return copy.textContent.trim() === text && !el.closest('[hidden]'); });
const pending = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const mount = async extra => { context = new ReadContext({ accountId: 'IND', sessionRevision: '1', permissionRevision: '1' }); const scope = context.createScope('IND-'+listReads.length); await act(async () => root.render(h(StrictMode, null, h(TransferPageHost, { scope, reader, references, loadDetailStyles: () => { styleReads++; return detailStyles(); }, product, ...extra })))); await settle(); };
const remount = async extra => { await act(async () => root.unmount()); root=createRoot(host); await mount(extra); };
try {
  await mount({});
  assert.equal(host.querySelector('button[aria-label="上一页"]').textContent,'上一页'); assert.equal(host.querySelector('button[aria-label="下一页"]').textContent,'下一页');
  assert.equal(listReads.length,1); assert.equal(detailReads.length,0); assert.equal(referenceReads.length,0); assert.equal(styleReads,0); assert.equal(productReads.length,0); assert.equal(productStyles,0);
  await click(button('高级筛选')); const input=host.querySelector('input[aria-label="调拨单号"]'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  await act(async () => { setter.call(input,'UNEXECUTED'); input.dispatchEvent(new Event('input',{bubbles:true})); }); await settle(); assert.equal(listReads.length,1);
  await click(host.querySelector('button[aria-label="下一页"]')); assert.equal(listReads.at(-1).parameters.filter.number,null); assert.equal(listReads.at(-1).parameters.page,2); assert.equal(host.querySelectorAll('.transfer-list-table tbody tr').length,5);
  for (const pageSize of [50,100,200,20]) {
    await click(host.querySelector('.transfer-page-size .arco-select')); await settle(250);
    const option=[...document.querySelectorAll('[role=option],.arco-select-option')].find(el=>el.textContent.includes(`${pageSize}张/页`));
    await click(option); assert.equal(listReads.at(-1).parameters.pageSize,pageSize); assert.equal(listReads.at(-1).parameters.page,1); assert.equal(listReads.at(-1).parameters.filter.number,null);
  }
  console.log('PASS IND DOM 1: actual StrictMode single initial list, no lazy work; edited draft never leaks into same-filter pagination or actual Arco 20/50/100/200 page-size selections.');
  const beforeMulti=listReads.length;
  const treeOption = text => [...document.querySelectorAll('.arco-tree-node-title')].find(el=>el.textContent.trim()===text);
  const status=host.querySelector('[aria-label="状态，多选"]'); await click(status); await settle(250); await click(treeOption('未审核')); await click(treeOption('已作废')); await click(status);
  for (const label of ['调出仓库','调入仓库']) { const select=host.querySelector(`[aria-label="${label}，多选"]`); await click(select); await settle(250); await click(treeOption('TEST 完整仓库 20')); await click(treeOption('TEST 完整仓库 21')); await click(select); }
  assert.equal(listReads.length,beforeMulti);
  await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))); await settle();
  assert.deepEqual(listReads.at(-1).parameters.filter.statuses,['DRAFT','VOID']);
  assert.deepEqual(listReads.at(-1).parameters.filter.fromWarehouseIds,[uuid(20),uuid(21)]);
  assert.deepEqual(listReads.at(-1).parameters.filter.toWarehouseIds,[uuid(20),uuid(21)]);
  assert.equal(listReads.at(-1).parameters.filter.number,'UNEXECUTED');
  const beforeReset=listReads.length; await click(button('重置')); assert.equal(listReads.length,beforeReset); await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))); await settle();
  assert.deepEqual(listReads.at(-1).parameters.filter.statuses,[]);
  console.log('PASS IND DOM 1b: actual Arco status/from/to controls accept multiple selections, including disabled historical warehouse facts, send exact independent arrays only on Query; reset remains draft-only.');
  const savedList=host.querySelector('.transfer-list-table'); const region=host.querySelector('.transfer-results'); region.scrollTop=99; region.scrollLeft=44; const trigger=host.querySelector('.transfer-view'); trigger.focus(); const styles=pending(); detailStyles=()=>styles.promise;
  await click(trigger); assert.equal(detailReads.length,0); await click(button('返回列表')); await act(async()=>styles.resolve()); await settle(); assert.equal(detailReads.length,0); assert.equal(host.querySelector('.transfer-list-table'),savedList); assert.equal(document.activeElement,trigger); assert.equal(region.scrollTop,99); assert.equal(region.scrollLeft,44);
  console.log('PASS IND DOM 2: Back during pending detail CSS prevents business read, ignores late style readiness, and retains list node/scroll/focus.');
  detailStyles=()=>Promise.reject(new Error('IND CSS fail')); await click(trigger); assert.equal(detailReads.length,0); assert.match(host.textContent,/样式加载失败/); detailStyles=()=>Promise.resolve(); await click(button('重试加载')); assert.equal(detailReads.length,1); assert.ok(host.querySelector('.transfer-editor'));
  assert.equal(productReads.length,0); assert.equal(productStyles,0); const holdProduct=pending(); productStyle=()=>holdProduct.promise; const productTrigger=host.querySelector('.mx-actions button'); productTrigger.focus(); await click(productTrigger); assert.equal(productReads.length,0); assert.equal(productStyles,1);
  await click(button('取消商品查看')); await act(async()=>holdProduct.resolve()); await settle(); assert.equal(productReads.length,0); assert.equal(host.querySelector('dialog'),null); assert.equal(document.activeElement,productTrigger);
  console.log('PASS IND DOM 3: failed detail CSS retries explicitly; product action waits configured styles, close defeats late readiness without eager/default-fetch work.');
  productStyle=()=>Promise.resolve(); await click(productTrigger); assert.equal(productReads.filter(read=>!read.signal.aborted).length,1); assert.ok(productReads.every(read=>read.parameters.productId===uuid(40)));  assert.equal(host.querySelectorAll('dialog').length,1); assert.match(host.textContent,/Independent product/); await click(host.querySelector('button[aria-label="关闭商品资料"]')); await click(button('返回列表'));
  heldDetail=pending(); await click(host.querySelector('.transfer-view')); assert.equal(detailReads.length,2); const held=detailReads.at(-1); await act(async()=>context.replaceIdentity({accountId:'IND',sessionRevision:'1',permissionRevision:'2'})); await settle(); assert.equal(held.signal.aborted,true); assert.equal(host.querySelector('.transfer-list-table'),null); await act(async()=>heldDetail.resolve(detail(21))); await settle(); assert.equal(host.querySelector('.transfer-editor'),null); assert.doesNotMatch(host.textContent,/TEST 当前商品/); heldDetail=null;
  console.log('PASS IND DOM 4: shared product host reads only target basics; same-account permission replacement clears hidden list and pending detail, rejects ignored-signal late data.');
  wide=true; await remount({initialTransferId:uuid(1)}); assert.ok(host.querySelector('.transfer-sparse-lines')); assert.equal(host.querySelector('.mx-table'),null); const fallbackView=[...host.querySelectorAll('.transfer-sparse-lines button')].find(el=>el.textContent==='查看'); assert.ok(fallbackView); const productBefore=productReads.length; await click(fallbackView); assert.ok(productReads.length>productBefore); assert.equal(productReads.slice(productBefore).filter(read=>!read.signal.aborted).length,1); await click(host.querySelector('button[aria-label="关闭商品资料"]'));
  await click(button('查看完整规范尺码组')); const allSizes=[]; for (;;) { allSizes.push(...[...host.querySelectorAll('.transfer-full-sizes li')].map(el=>el.textContent)); const next=[...host.querySelectorAll('nav[aria-label="规范尺码分页"] button')].find(el=>el.textContent==='下一页'); if(next.disabled)break; await click(next); } assert.equal(allSizes.length,45); assert.equal(new Set(allSizes).size,45);
  console.log('PASS IND DOM 5: bounded large-grid fallback preserves lazy product action and exposes every canonical size through explicit pages without truncation.');
  console.log('All 6 independent synthetic DOM groups passed; no browser, network, server, DB, pixels or timing acceptance.');
} finally { if(root) await act(async()=>root.unmount()); dom.window.close(); await rm(output,{force:true}); }
