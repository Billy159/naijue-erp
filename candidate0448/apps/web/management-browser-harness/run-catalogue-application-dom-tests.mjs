import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
// Actual Application + explicit synthetic-only HTTP. No browser rendering, network,
// PostgreSQL execution or production grant is supplied by this test.
const here=path.dirname(fileURLToPath(import.meta.url)),temporary=await mkdtemp(path.join(here,'.catalogue-application-dom-'));
const dom=new JSDOM('<!doctype html><style data-management-harness-style data-harness-style data-inventory-inline data-demo-single-select-inline data-demo-multi-select-inline data-inventory-product-select-inline></style><header>合成演示数据 / 非正式 / 不输入真实密码</header><div id="management-root"></div>',{url:'https://synthetic-management.invalid/',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLDialogElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});dom.window.matchMedia=query=>({matches:false,media:query,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}});
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
// Native close may move focus before React unmounts the old dialog. A close of
// an already-closed native dialog is a no-op; don't manufacture a second close.
dom.window.HTMLDialogElement.prototype.close=function(){const wasOpen=this.hasAttribute('open');this.removeAttribute('open');if(wasOpen){document.body.tabIndex=-1;document.body.focus();}};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const originalFetch=globalThis.fetch;let accidentalNetwork=0;globalThis.fetch=async()=>{accidentalNetwork++;throw new Error('Synthetic harness must never call global fetch');};
let harness,act;
try{
  const output=path.join(temporary,'entry.mjs');await build({entryPoints:[path.join(here,'application-entry.tsx')],outfile:output,bundle:true,platform:'browser',format:'esm',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},jsx:'automatic',loader:{'.css':'empty'},logLevel:'warning'});
  const module=await import(pathToFileURL(output).href);({act}=module);const root=document.getElementById('management-root');
  const settle=async(ms=20)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});
  const wait=async(check,label)=>{for(let index=0;index<80;index++){if(check())return;await settle();}assert.ok(check(),`Timed out waiting for ${label}`);};
  const click=async element=>{assert.ok(element,'Expected clickable control');await act(async()=>{element.focus?.();element.click();});};
  const key=async(element,value)=>{await act(async()=>element.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));await settle();};
  const type=async(input,value)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
  const button=text=>[...root.querySelectorAll('button')].find(element=>element.textContent.trim()===text),nav=text=>[...root.querySelectorAll('a.nav')].find(element=>element.textContent.trim()===text);
  const count=path=>harness.transport.calls().filter(call=>call.path===path).length;
  const openSettings=async label=>{if(harness.app.controller.getSnapshot().route!=='product-settings'||harness.app.controller.getSnapshot().phase!=='ready'){await click(nav('商品设置'));await wait(()=>root.querySelector('table[aria-label="尺码组"]'),'settings initial groups');}await click(button(label));await wait(()=>root.querySelectorAll(`table[aria-label="${label}"] tbody tr`).length===20,`${label} first page`);};
  await act(async()=>{harness=module.mountManagementHarness(root);});await act(async()=>harness.enter('product-categories'));await wait(()=>root.querySelector('[role=tree]'),'category tree');
  assert.equal(nav('商品分类').getAttribute('aria-current'),'page');assert.match(root.querySelector('.breadcrumb').textContent,/商品管理.*商品分类/);assert.equal(count('/catalogue-settings-read/categories/query'),1);
  for(const caption of ['新增一级分类','新增下级分类','撤销排序','取消','保存','删除分类'])assert.equal(button(caption).disabled,true,`No fake category write: ${caption}`);
  assert.equal(root.querySelector('[data-category-product-count]').textContent,'未提供');assert.match(root.textContent,/未提供不表示 0/);assert.match(root.querySelector('.pc-category-facts').textContent,/下级分类数量2 个/);assert.equal(root.querySelector('.pc-category-facts input').readOnly,true);
  const beforeTreeSearch=count('/catalogue-settings-read/categories/query');await type(root.querySelector('input[aria-label="搜索分类"]'),'合成便帽');
  assert.equal(root.querySelectorAll('[role=treeitem]').length,3);const leaf=[...root.querySelectorAll('[role=treeitem]')].find(row=>row.textContent.includes('合成便帽'));assert.equal(leaf.getAttribute('aria-level'),'3');await click(leaf);
  assert.match(root.querySelector('.pc-category-facts').textContent,/合成配饰 \/ 合成帽饰 \/ 合成便帽/);assert.equal(count('/catalogue-settings-read/categories/query'),beforeTreeSearch,'Tree search only filters the complete granted synthetic directory');
  await key(leaf,'Home');assert.equal(document.activeElement.getAttribute('aria-level'),'1');await click(root.querySelector('button[aria-label="清除分类搜索"]'));
  harness.transport.setNextDelay(120);harness.transport.setNextFailure('empty');await click(button('刷新'));await click(button('取消本次读取'));await settle(160);assert.ok(root.querySelector('[role=tree]'));assert.doesNotMatch(root.textContent,/没有分类资料/);
  harness.transport.setNextDelay(120);harness.transport.setNextFailure('forbidden');await click(button('刷新'));await click(button('取消本次读取'));await settle(160);assert.equal(harness.app.controller.getSnapshot().phase,'ready','Cancelled late403 cannot revoke current category scope');
  harness.transport.setNextFailure('forbidden');await click(button('刷新'));await wait(()=>harness.app.controller.getSnapshot().phase==='error','current category denial');assert.ok(root.querySelector('[role=tree]')===null,'Previous page/target must be absent');assert.ok(root.querySelector('.pc-category-facts')===null,'Previous page/target must be absent');
  const categoryRetry=button('重试当前只读页面');categoryRetry.focus();await settle();assert.ok(document.activeElement===categoryRetry,'Denial recovery control keeps its own focus');await click(categoryRetry);await wait(()=>root.querySelector('[role=tree]'),'category retry');
  harness.transport.setNextDelay(120);await click(button('刷新'));await act(async()=>harness.revoke());await settle(160);assert.ok(root.querySelector('[role=tree]')===null,'Previous page/target must be absent');assert.ok(root.querySelector('.pc-category-detail form')===null,'Old category detail form must clear; the hidden authentication form is a separate owner');
  console.log('PASS actual categories: explicit source menu, complete native-depth tree/local ancestor search, null product count, true child count, disabled writes, cancel/late403/current403/retry and identity clear.');

  await act(async()=>harness.enter('product-settings'));await wait(()=>root.querySelector('table[aria-label="尺码组"]'),'four-tab settings');
  for(const caption of ['颜色','尺码组','版型','季节'])assert.equal(button(caption).disabled,false,`Explicit ${caption} read capability`);
  for(const [kind,label] of [['colors','颜色'],['fits','版型']]){
    await openSettings(label);const endpoint=`/catalogue-settings-read/${kind}/query`;
    assert.equal(harness.app.controller.getSnapshot().route,'product-settings');assert.equal(button(label).getAttribute('aria-selected'),'true');assert.deepEqual([...root.querySelectorAll(`table[aria-label="${label}"] th`)].map(node=>node.textContent),['名称','编码','操作']);
    assert.equal(button(`新增${label}`).disabled,true);assert.ok([...root.querySelectorAll(`table[aria-label="${label}"] button`)].filter(node=>node.textContent.trim()==='编辑').every(node=>node.disabled));
    const trigger=root.querySelector(`button[aria-label^="查看${label}："]`);await click(trigger);await wait(()=>root.querySelector('dialog'),'entry modal');const dialog=root.querySelector('dialog');const facts=dialog.querySelectorAll('input[readonly]'),firstRow=root.querySelector(`table[aria-label="${label}"] tbody tr`);assert.equal(facts.length,2);assert.equal(facts[0].value,firstRow.children[0].textContent);assert.equal(facts[1].value,firstRow.children[1].textContent);assert.match(facts[0].value,new RegExp(`合成${label}`));assert.match(dialog.textContent,/启用/);assert.match(dialog.textContent,/版本：1/);assert.equal(button('确定').disabled,true);assert.equal(button('删除').disabled,true);
    await key(dialog,'Escape');assert.ok(root.querySelector('dialog')===null,'Previous page/target must be absent');assert.ok(document.activeElement===trigger,`${label} Escape restores real focused trigger after native close→BODY`);
    await click(root.querySelector('button[aria-label="下一页"]'));await wait(()=>root.querySelectorAll(`table[aria-label="${label}"] tbody tr`).length===3,`${label} 20+3 page`);assert.match(root.textContent,/当前第 21–23 条/);
    const search=root.querySelector(`input[aria-label="搜索${label}名称或编码"]`),beforeSearch=count(endpoint);await type(search,'23');await settle(220);await wait(()=>root.querySelectorAll(`table[aria-label="${label}"] tbody tr`).length===1,`${label} server search`);assert.equal(count(endpoint),beforeSearch+1);assert.match(root.querySelector(`table[aria-label="${label}"] tbody`).textContent,/23/);
    await type(search,'');await settle(220);await wait(()=>root.querySelectorAll(`table[aria-label="${label}"] tbody tr`).length===20,`${label} search reset`);
    harness.transport.setNextDelay(120);harness.transport.setNextFailure('empty');await click(button('刷新'));await click(button('取消本次读取'));await settle(160);assert.equal(root.querySelectorAll(`table[aria-label="${label}"] tbody tr`).length,20,'Cancelled empty late response must not erase prior rows');
    harness.transport.setNextDelay(120);harness.transport.setNextFailure('forbidden');await click(button('刷新'));await click(button('取消本次读取'));await settle(160);assert.equal(harness.app.controller.getSnapshot().phase,'ready','Cancelled late denial must not clear fresh scope');
    harness.transport.setNextFailure('forbidden');await click(button('刷新'));await wait(()=>harness.app.controller.getSnapshot().phase==='error',`${label} current denial`);assert.ok(root.querySelector('table')===null,'Previous page/target must be absent');assert.ok(root.querySelector('dialog')===null,'Previous page/target must be absent');
    const retry=button('重试当前只读页面');retry.focus();await settle();assert.ok(document.activeElement===retry,'Current403 must not move focus to a stale target');await click(retry);await wait(()=>root.querySelector('table[aria-label="尺码组"]'),'explicit retry resets initial tab');await openSettings(label);
    const identityTrigger=root.querySelector(`button[aria-label^="查看${label}："]`);await click(identityTrigger);assert.ok(root.querySelector('dialog'));await act(async()=>harness.revoke());await settle();assert.ok(root.querySelector('table')===null,'Previous page/target must be absent');assert.ok(root.querySelector('dialog')===null,'Previous page/target must be absent');assert.ok(document.activeElement!==identityTrigger,'Revoked target must never regain focus');
    await act(async()=>harness.enter('product-settings'));await wait(()=>root.querySelector('table[aria-label="尺码组"]'),'fresh new identity settings');assert.ok(root.querySelector('dialog')===null,'Previous page/target must be absent');
    console.log(`PASS actual ${kind}: explicit four-tab route, 20+3 paging/search, native code/status/version, all writes disabled, modal Escape focus, cancel/late403/current403/retry and identity/modal clear.`);
  }
  // Newer tab identity wins over an abort-ignoring prior list response.
  await openSettings('颜色');harness.transport.setNextDelay(120);harness.transport.setNextFailure('empty');await click(button('刷新'));await click(button('版型'));await wait(()=>root.querySelectorAll('table[aria-label="版型"] tbody tr').length===20,'new fit tab');await settle(160);assert.ok(root.querySelector('table[aria-label="颜色"]')===null,'Previous page/target must be absent');assert.equal(button('版型').getAttribute('aria-selected'),'true');assert.equal(accidentalNetwork,0);
  console.log('PASS actual cross-tab stale protection: newer fit tab survives cancelled old color response; global fetch remains zero.');
  await act(async()=>harness.dispose());harness=null;assert.equal(root.childElementCount,0);
}finally{if(harness&&act)await act(async()=>harness.dispose());globalThis.fetch=originalFetch;dom.window.close();await rm(temporary,{recursive:true,force:true});}
