import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const repo='/workspace/shared/naijue-erp-rewrite';
const base='/workspace/shared/naijue-erp-rewrite/evidence/inventory-lifecycle-fix-20261021';
const require=createRequire(`${repo}/package.json`);
const { build }=require('esbuild'); const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><style data-inventory-inline></style><div id="root"></div><button id="outside">outside</button>',{url:'https://synthetic.test/',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLDialogElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.matchMedia=query=>({matches:false,media:query,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true}});
await build({entryPoints:[`${base}/probe-entry.tsx`],outfile:`${base}/probe-bundle.mjs`,absWorkingDir:repo,nodePaths:[`${repo}/node_modules`],bundle:true,platform:'node',format:'esm',banner:{js:`import { createRequire as __createRequire } from 'node:module'; const require=__createRequire(${JSON.stringify(repo+'/package.json')});`},jsx:'automatic',loader:{'.css':'empty'},logLevel:'warning'});
const {act,createElement:h,StrictMode,createRoot,CandidateSelector,InventoryPageView,ReadContext,createSyntheticInventoryReader,createSyntheticProductReader}=await import(pathToFileURL(`${base}/probe-bundle.mjs`).href);
const host=document.getElementById('root'); let root;
const findings=[]; const log=(name,data)=>{console.log(`${name}: ${JSON.stringify(data)}`);findings.push({name,...data})};
const settle=async(ms=35)=>await act(async()=>await new Promise(resolve=>setTimeout(resolve,ms)));
const click=async element=>{assert.ok(element);await act(async()=>element.click());await settle()};
const button=text=>[...host.querySelectorAll('button')].find(x=>x.textContent.trim()===text);
const makeScope=name=>new ReadContext({accountId:'SELF-CHECK',sessionRevision:'1',permissionRevision:'1'}).createScope(name);
try{
  // Actual inventory candidate on its own, isolating StrictMode from page ownership.
  for(const strict of [false,true]){
    root=createRoot(host);let reads=0;const scope=makeScope(`candidate-${strict}`);
    const selector=h(CandidateSelector,{scope,kind:'product',label:'商品',multiple:true,selected:[],categoryId:null,onChange(){},reader:{readInventory(){throw Error('Unexpected main query')},readCandidates:async read=>{reads++;return{page:read.parameters.page,exactTotal:1,items:[{id:'canonical-product-id',label:'可选择商品'}]}}}});
    await act(async()=>root.render(strict?h(StrictMode,null,selector):selector));await click(host.querySelector('.iw-control'));await settle(80);
    const outcome={strict,reads,popupCount:host.querySelectorAll('[role=dialog]').length,optionCount:host.querySelectorAll('.iw-option-list input').length,text:host.querySelector('[role=dialog]')?.textContent};
    log('inventory-candidate-strictmode',outcome);
    assert.equal(reads,1);assert.equal(outcome.optionCount,1);
    await act(async()=>root.unmount());root=null;scope.dispose();
  }
  // Production-default (not StrictMode) InventoryPageView.
  root=createRoot(host);const scope=makeScope('inventory-default');const reads=[];
  await act(async()=>root.render(h(InventoryPageView,{scope,reader:createSyntheticInventoryReader({delayMs:0,onRead:e=>reads.push(e)}),productReader:createSyntheticProductReader({delayMs:0})})));
  const settings=button('显示设置');settings.focus();await click(settings);
  const openFocus={triggerFocused:document.activeElement===settings,insidePopup:!!host.querySelector('.iw-settings')?.contains(document.activeElement)};
  const escape=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});await act(async()=>settings.dispatchEvent(escape));
  const afterEscape=!!host.querySelector('.iw-settings');
  const outside=document.getElementById('outside');await act(async()=>outside.dispatchEvent(new Event('pointerdown',{bubbles:true})));await click(outside);
  const afterOutside=!!host.querySelector('.iw-settings');
  log('inventory-settings-dismissal',{...openFocus,afterEscape,escapePrevented:escape.defaultPrevented,afterOutside,reads:reads.length});assert.equal(afterEscape,true);assert.equal(afterOutside,true);
  // Candidate input still sits inside the inventory query form; Enter must now cancel native default.
  await click(host.querySelector('.iw-product-field .iw-control'));await settle(60);
  const input=host.querySelector('.iw-product-field .iw-search');input.focus();let reachedForm=false;
  const form=input.closest('form');const observer=event=>{if(event.key==='Enter')reachedForm=true};form.addEventListener('keydown',observer);
  const enter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});await act(async()=>input.dispatchEvent(enter));
  log('inventory-candidate-enter',{insideMainQueryForm:form.getAttribute('aria-label'),enterPrevented:enter.defaultPrevented,reachedMainQueryForm:reachedForm,mainSubmitButtons:form.querySelectorAll('button[type=submit]').length,inventoryReadsFromSyntheticKeyOnly:reads.filter(x=>x.kind==='inventory').length});
  assert.equal(enter.defaultPrevented,true);assert.equal(reachedForm,true);form.removeEventListener('keydown',observer);
  await act(async()=>root.unmount());root=null;scope.dispose();
  // The page must now retain a live form across StrictMode effect replay.
  root=createRoot(host);const strictScope=makeScope('inventory-page-strict');const strictReads=[];
  await act(async()=>root.render(h(StrictMode,null,h(InventoryPageView,{scope:strictScope,reader:createSyntheticInventoryReader({delayMs:0,onRead:e=>strictReads.push(e)}),productReader:createSyntheticProductReader({delayMs:0})}))));await settle();
  log('inventory-page-strictmode',{scopeActive:strictScope.active,formPresent:!!host.querySelector('form'),text:host.textContent,reads:strictReads.length});
  assert.ok(host.querySelector('form'));assert.equal(strictScope.active,true);
  await act(async()=>root.unmount());root=null;strictScope.dispose();
  await fs.writeFile(`${base}/observations.json`,JSON.stringify(findings,null,2)+'\n');
}finally{if(root)await act(async()=>root.unmount());dom.window.close()}
// Snapshot assertions and evidence writes are complete. The fully bundled
// probe otherwise retains Node resources after JSDOM cleanup; production is not
// changed. The ordinary lifecycle regression runs without forced process exit.
console.log('PASS preserved probes: all snapshot assertions and evidence writes completed.');
process.exit(0);
