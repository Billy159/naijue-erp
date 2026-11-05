import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url));
const temp=await mkdtemp(path.join(here,'.stock-unknown-'));
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://synthetic.test/',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLDialogElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
dom.window.matchMedia=q=>({matches:false,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,act;
try {
 const output=path.join(temp,'entry.mjs');
 await build({entryPoints:[path.join(here,'entry-list.tsx')],outfile:output,bundle:true,platform:'browser',format:'esm',external:['react','react-dom','react-dom/*'],banner:{js:"import { createRequire } from 'node:module'; const require=createRequire(import.meta.url);"},jsx:'automatic',loader:{'.css':'empty'},logLevel:'warning'});
 const {createElement:h,StrictMode,createRoot,ProductsPageView,ReadContext,act:a}=await import(pathToFileURL(output).href); act=a;
 const scope=new ReadContext({accountId:'SYN',sessionRevision:'1',permissionRevision:'1'}).createScope('PRODUCTS');
 const items=[null,'0','-5'].map((totalStock,i)=>({id:`${String(i+1).padStart(8,'0')}-1111-4111-8111-111111111111`,code:`P-${i}`,name:`合成商品${i}`,categoryLabel:null,year:2026,seasonLabel:null,supplierLabel:null,fits:[],thickness:null,retailPrice:null,totalStock}));
 const reader={readList:async read=>({page:read.parameters.page,pageSize:read.parameters.pageSize,exactTotal:items.length,items}),readCandidates:async()=>{throw Error('unexpected candidates');}};
 root=createRoot(document.getElementById('root'));await act(async()=>{root.render(h(StrictMode,null,h(ProductsPageView,{scope,reader,onAccessFailure(){}})));await new Promise(r=>setTimeout(r,100));});
 await act(async()=>{await new Promise(r=>setTimeout(r,100));});
 const rows=[...document.querySelectorAll('tbody tr')];assert.equal(rows.length,3);assert.deepEqual(rows.map(row=>row.children[8].textContent),['未知','0','-5']);
 console.log('PASS product list: null remains unknown, known zero and negative remain numeric. Synthetic DOM only.');
} finally {if(root&&act)await act(async()=>root.unmount());dom.window.close();await rm(temp,{recursive:true,force:true});}
