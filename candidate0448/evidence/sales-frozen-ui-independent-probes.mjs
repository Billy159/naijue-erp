import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const root = process.cwd();
const frozen = '/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3';
const read = file => readFile(path.join(root, file), 'utf8');
const css = await read('apps/web/src/sales/sales.css');
const originalListCss = await readFile(path.join(frozen, 'frontend/sales-refinement.css'), 'utf8');
const originalGeometry = await readFile(path.join(frozen, 'frontend/golden-consistency.css'), 'utf8');
const originalDetail = await readFile(path.join(frozen, 'frontend/sales-detail-alignment.css'), 'utf8');
const originalJs = await readFile(path.join(frozen, 'frontend/sales-current.js'), 'utf8');
const normalize = text => text.replace(/\s/g, '');
const widths = [90,180,75,90,110,80,240,60,80,145,70];
for (const [index, width] of widths.entries()) {
  assert.ok(normalize(originalListCss).includes(`th:nth-child(${index + 1}){width:${width}px;}`));
  assert.ok(normalize(css).includes(`th:nth-child(${index + 1}){width:${width}px}`));
}
for (const template of [
  'minmax(120px,.8fr) minmax(120px,.8fr) 155px minmax(180px,1fr) minmax(168px,1.2fr) minmax(168px,1.2fr) max-content',
  'minmax(100px,.8fr) minmax(100px,.8fr) 155px minmax(138px,1fr) minmax(110px,1.2fr) minmax(110px,1.2fr) max-content',
  'minmax(88px,.8fr) minmax(88px,.8fr) 155px minmax(115px,1fr) minmax(95px,1.2fr) minmax(95px,1.2fr) max-content',
]) { assert.ok(normalize(originalGeometry).includes(normalize(template))); assert.ok(normalize(css).includes(normalize(template))); }
assert.ok(normalize(originalDetail).includes('grid-template-columns:160pxrepeat(5,minmax(0,1fr))'));
assert.ok(normalize(css).includes('grid-template-columns:160pxrepeat(5,minmax(0,1fr))'));
assert.ok(originalJs.includes('[270,100,122,84,80,95,90,108,99,142]'));
for (const breakpoint of [1100,700,620]) {
  assert.ok(normalize(originalDetail).includes(`@media(max-width:${breakpoint}px)`));
  assert.ok(normalize(css).includes(`@media(max-width:${breakpoint}px)`));
}
assert.doesNotMatch(await read('apps/web/src/application/styles/sales-base.css'), /\.iw-|\.tc-|\{[^}]*display/);
console.log('PASS independent source: frozen 11 widths, 3 primary filter templates, six-field grid and inherited responsive breakpoints; obsolete sales-base scaffold is inert.');
const dom = new JSDOM('<!doctype html><div class="demo-ui"><div id="root"></div></div>', { url: 'https://synthetic.test/' });
for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLDialogElement','Node','Event','MouseEvent','KeyboardEvent']) Object.defineProperty(globalThis, key, {configurable:true,value:dom.window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const file of ['apps/web/src/demo-presentation/tokens.css','apps/web/src/demo-presentation/frame.css','apps/web/src/demo-presentation/controls.css','apps/web/src/sales/sales.css']) {
  const style = document.createElement('style'); style.textContent = (await read(file)).replace(/@import[^;]+;/g, ''); document.head.append(style);
}
const temp = await mkdtemp(path.join(root, 'evidence/.frozen-dom-'));
let reactRoot;
try {
  const output = path.join(temp, 'entry.mjs');
  await build({entryPoints:[path.join(root,'apps/web/src/sales/tests/dom-entry.tsx')],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'warning'});
  const {act,createElement,createRoot,SalesPageHost,ReadContext,createSalesHttpReader,createSalesFilterReferenceHttpReader,summary,detail,uuid} = await import(pathToFileURL(output).href);
  const host = document.getElementById('root'); reactRoot = createRoot(host);
  const rows = [
    {...summary(101),businessType:'SALE',quantity:'9007199254740993',incomingQuantity:'0',outgoingQuantity:'9007199254740993'},
    {...summary(102),businessType:'RETURN',quantity:'-3',incomingQuantity:'3',outgoingQuantity:'0'},
    {...summary(103),businessType:'EXCHANGE',quantity:'2',incomingQuantity:'4',outgoingQuantity:'6'},
  ];
  const calls = []; const held = []; let holdDetails = false;
  const json = value => new Response(JSON.stringify(value), {headers:{'content-type':'application/json'}});
  const options = {origin:'https://synthetic.test',basePath:'/api',fetch:async (url, init) => {
    const body = JSON.parse(init.body); calls.push({url,body,signal:init.signal});
    if (url.endsWith('/sales/query')) return json({page:1,pageSize:20,exactTotal:'3',items:rows});
    if (url.endsWith('/sales/references/query')) throw new Error('Unrequested reference read');
    if (url.endsWith('/sales/detail/query')) {
      const data = detail(Number(body.salesId.slice(-12)));
      data.document.lines[0].snapshot.productName = '保存的完整商品名称·不能用当前分类替换';
      data.document.lines[0].snapshot.colorName = '历史全名颜色·未缩写';
      data.document.lines[0].snapshot.fitName = 'Y版（修身）完整历史版型';
      data.document.lines[0].snapshot.sizeName = '165/S（旧尺码原文）';
      data.document.lines.push({...data.document.lines[0],id:uuid(299),lineNo:2,quantity:'-20',lineAmount:'0',dealPrice:'0',isGift:true,snapshot:{...data.document.lines[0].snapshot,productCode:'GIFT'}});
      if (holdDetails) return new Promise(resolve => held.push({signal:init.signal,finish:()=>resolve(json(data))}));
      return json(data);
    }
    throw new Error('Unexpected synthetic endpoint');
  }};
  const reader = createSalesHttpReader(options), references = createSalesFilterReferenceHttpReader(options);
  const context = new ReadContext({accountId:'INDEPENDENT',sessionRevision:'1',permissionRevision:'1'});
  const scope = context.createScope('INDEPENDENT-SALES');
  const settle = async () => act(async () => {await new Promise(resolve => setTimeout(resolve,10));});
  const click = async element => {assert.ok(element); await act(async () => element.click()); await settle();};
  const key = async (element, value, shiftKey=false) => {
    const event = new KeyboardEvent('keydown',{key:value,shiftKey,bubbles:true,cancelable:true});
    await act(async()=>element.dispatchEvent(event)); await settle(); return event;
  };
  await act(async()=>reactRoot.render(createElement(SalesPageHost,{scope,reader,references}))); await settle();
  assert.equal(calls.length,0);
  await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))); await settle();
  assert.equal(calls.length,1);
  assert.deepEqual([...host.querySelectorAll('.sales-list tbody tr')].map(row=>row.cells[7].textContent),['9007199254740993','退3 · 换0','退4 · 换6']);
  for (const row of host.querySelectorAll('.sales-list tbody tr')) {
    assert.equal(row.cells.length,11); assert.equal(row.cells[6].textContent,'历史分类未提供');
    assert.equal(row.cells[9].textContent,'2026-10-20 08:00'); assert.equal(row.cells[9].title,'2026-10-20T00:00:00.000000Z');
  }
  assert.equal(dom.window.getComputedStyle(host.querySelector('.sales-workbench')).display,'flex');
  assert.equal(dom.window.getComputedStyle(host.querySelector('.sales-list th')).width,'90px');
  console.log('PASS independent DOM: no eager list/detail/reference read; actual SALE exact quantity above Number safe range and separate RETURN/EXCHANGE incoming/outgoing render unchanged, with unavailable historical category and native update timestamp.');
  const trigger = host.querySelectorAll('.sales-view')[1]; trigger.focus();
  const region = host.querySelector('.sales-results'); region.scrollTop=73; region.scrollLeft=29;
  await click(trigger); assert.equal(calls.length,2);
  let dialog = host.querySelector('.sales-detail-dialog'); assert.ok(dialog);
  assert.deepEqual([...dialog.querySelectorAll('col')].map(col=>Number(col.style.width.slice(0,-2))),[270,100,122,84,80,95,90,108,99,142]);
  assert.equal(dialog.querySelectorAll('.sale-lines-table th').length,10);
  assert.deepEqual([...dialog.querySelector('.sale-doc-fields').children].slice(0,6).map(field=>field.querySelector('.sale-field-label').textContent),['单据日期','业务类型','营业厅','营业员','客户','出库仓']);
  for (const text of ['保存的完整商品名称·不能用当前分类替换','历史全名颜色·未缩写','Y版（修身）完整历史版型','165/S（旧尺码原文）']) assert.ok(dialog.textContent.includes(text));
  assert.match(dialog.querySelector('.sale-summary').textContent,/退回 1换出 0/); // gift -20 is not a sales quantity
  assert.equal(dom.window.getComputedStyle(dialog.querySelector('.sales-detail-facts')).display,'flex');
  assert.equal(dom.window.getComputedStyle(dialog.querySelector('.sales-detail-facts')).flexDirection,'column');
  assert.equal(dom.window.getComputedStyle(dialog.querySelector('.sales-document-state')).display,'flex');
  assert.equal(dom.window.getComputedStyle(dialog.querySelector('.sale-doc-fields')).gridTemplateColumns,'160px repeat(5,minmax(0,1fr))');
  assert.equal(dialog.querySelectorAll('input,select,textarea').length,0);
  for (const name of ['导出','打印','操作历史']) assert.equal([...dialog.querySelectorAll('button')].find(button=>button.textContent===name).disabled,true);
  const before = calls.length; await click(dialog.querySelector('button[aria-label="查看第1行保存记录"]'));
  assert.equal(calls.length,before); assert.match(dialog.querySelector('.sales-line-record').textContent,/001234567890123/);
  const close = dialog.querySelector('button[aria-label="关闭销货单详情"]'); const summaryElement = dialog.querySelector('.sales-record-metadata>summary');
  const lastAction = dialog.querySelector('.sales-line-record button'); lastAction.focus();
  assert.equal((await key(lastAction,'Tab')).defaultPrevented,false,'Do not wrap before the following native summary');
  summaryElement.focus(); assert.equal(document.activeElement,summaryElement);
  assert.equal((await key(summaryElement,'Tab')).defaultPrevented,true); assert.equal(document.activeElement,close);
  assert.equal((await key(close,'Tab',true)).defaultPrevented,true); assert.equal(document.activeElement,summaryElement);
  await click(close); assert.equal(host.querySelector('.sales-detail-dialog'),null); assert.equal(document.activeElement,trigger); assert.equal(region.scrollTop,73); assert.equal(region.scrollLeft,29);
  console.log('PASS independent DOM/CSS: scoped detail/header flex survives the actual frame+control graph; six fields/10 native columns, historical full labels, gift-excluded counts, readonly actions, local record disclosure with no extra read, native-summary keyboard loop and focus/scroll restoration.');
  holdDetails=true; await click(host.querySelectorAll('.sales-view')[2]); assert.equal(held.length,1);
  await click(host.querySelector('button[aria-label="关闭销货单详情"]')); assert.equal(held[0].signal.aborted,true);
  await act(async()=>held[0].finish()); await settle(); assert.equal(host.querySelector('.sales-detail-dialog'),null);
  await click(host.querySelectorAll('.sales-view')[0]); assert.equal(held.length,2);
  await act(async()=>context.replaceIdentity({accountId:'REPLACEMENT',sessionRevision:'2',permissionRevision:'2'})); await settle();
  assert.equal(held[1].signal.aborted,true); await act(async()=>held[1].finish()); await settle();
  assert.equal(host.querySelector('.sales-detail-dialog'),null); assert.equal(host.querySelectorAll('.sales-list tbody tr').length,0);
  assert.doesNotMatch(host.textContent,/完整历史版型|保存的完整商品/);
  console.log('PASS independent DOM: explicit opens perform one detail read apiece; close and identity replacement abort pending detail and isolate ignored-signal late results.');
  console.log('LIMIT: source and synthetic JSDOM only; no browser pixels, layout measurements, media-query evaluation, native modal/keyboard acceptance, network, server, database, installation, aggregate/full-suite rerun or commit.');
} finally { if(reactRoot) { const {act} = await import('react'); await act(async()=>reactRoot.unmount()); } dom.window.close(); await rm(temp,{recursive:true,force:true}); }
