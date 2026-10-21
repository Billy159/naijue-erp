import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const repo='/workspace/shared/naijue-erp-rewrite',base='/workspace/scratch/f6bee04e937b/evidence/frontend-selfcheck-20261021';
const require=createRequire(`${repo}/package.json`);const{build}=require('esbuild');const{JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><div id="root"></div><button id="outside">outside</button>',{url:'https://synthetic.test/',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
await build({entryPoints:[`${base}/sales-probe-entry.tsx`],outfile:`${base}/sales-probe-bundle.mjs`,absWorkingDir:repo,nodePaths:[`${repo}/node_modules`],bundle:true,platform:'node',format:'esm',banner:{js:`import { createRequire as __createRequire } from 'node:module'; const require=__createRequire(${JSON.stringify(repo+'/package.json')});`},jsx:'automatic',loader:{'.css':'empty'},logLevel:'warning'});
const{act,createElement:h,createRoot,SalesReferenceSelector,ReadContext}=await import(pathToFileURL(`${base}/sales-probe-bundle.mjs`).href);
const host=document.getElementById('root'),root=createRoot(host);const context=new ReadContext({accountId:'SELF-CHECK',sessionRevision:'1',permissionRevision:'1'}),scope=context.createScope('sales-reference');
const held=[];const reader={readReferences:read=>new Promise(resolve=>held.push({read,resolve}))};
const settle=async()=>await act(async()=>await new Promise(resolve=>setTimeout(resolve,30)));const click=async element=>{assert.ok(element);await act(async()=>element.click());await settle()};
try{
await act(async()=>root.render(h('div',null,...[['hall','营业厅'],['salesperson','营业员']].map(([kind,label])=>h(SalesReferenceSelector,{key:kind,parentScope:scope,reader,kind,label,value:null,onChange(){}})))));await settle();
await click(host.querySelector('[aria-label="营业厅"]'));assert.equal(held.length,1);
await act(async()=>document.getElementById('outside').dispatchEvent(new Event('pointerdown',{bubbles:true})));await click(document.getElementById('outside'));
const afterOutside={popupCount:host.querySelectorAll('[role=dialog]').length,requestAborted:held[0].read.signal.aborted};
await click(host.querySelector('[aria-label="营业员"]'));
const afterSecond={popupCount:host.querySelectorAll('[role=dialog]').length,transportStarts:held.length,firstRequestAborted:held[0].read.signal.aborted,secondRequestAborted:held[1].read.signal.aborted};
assert.equal(afterOutside.popupCount,1);assert.equal(afterOutside.requestAborted,false);assert.equal(afterSecond.popupCount,2);assert.equal(afterSecond.firstRequestAborted,false);
await act(async()=>context.clear());await settle();
const afterRevocation={popupCount:host.querySelectorAll('[role=dialog]').length,allRequestsAborted:held.every(x=>x.read.signal.aborted)};assert.equal(afterRevocation.popupCount,0);assert.equal(afterRevocation.allRequestsAborted,true);
const outcome={afterOutside,afterSecond,afterRevocation};console.log(JSON.stringify(outcome,null,2));await fs.writeFile(`${base}/sales-observations.json`,JSON.stringify(outcome,null,2)+'\n');
}finally{await act(async()=>root.unmount());dom.window.close()}

process.exit(0);
