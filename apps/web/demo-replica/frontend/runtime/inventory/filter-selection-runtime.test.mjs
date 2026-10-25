import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
// Targeted synthetic lifecycle/quantity tests. Geometry below is a declared test
// double; it supplies NO browser measurement, visual, HTTP, PG or performance proof.
const here=path.dirname(fileURLToPath(import.meta.url));const temp=await mkdtemp(path.join(here,'.test-'));
const dom=new JSDOM('<!doctype html><body class="inventory-workbench"><div id="root"></div><dialog id="gold-drawer"><div id="gold-drawer-content"></div></dialog></body>',{url:'https://synthetic.test/',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLDialogElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','localStorage'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.pageXOffset=0;globalThis.pageYOffset=0;window.scrollTo=()=>{};globalThis.innerWidth=1470;globalThis.innerHeight=724;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.matchMedia=q=>({matches:false,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
class ResizeObserver {observe(){}unobserve(){}disconnect(){}}globalThis.ResizeObserver=window.ResizeObserver=ResizeObserver;
Object.defineProperty(HTMLElement.prototype,'clientWidth',{configurable:true,get(){return this.id==='iw-results'?1200:300;}});Object.defineProperty(HTMLElement.prototype,'clientHeight',{configurable:true,get(){return 400;}});
HTMLElement.prototype.getBoundingClientRect=function(){let width=300;if(this.tagName==='TH')width=[300,116,152][this.cellIndex]??(this.cellIndex===this.parentElement.children.length-1?70:76);const height=this.tagName==='TR'?(this.dataset.probeRow?.startsWith('["meta"')?54:36):this.tagName==='H3'?32:32;return {x:0,y:0,top:0,left:0,right:width,bottom:height,width,height,toJSON(){return this;}};};
HTMLElement.prototype.scrollTo=function({top=0,left=0}){this.scrollTop=top;this.scrollLeft=left;};
HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
globalThis.URL.createObjectURL=()=> 'blob:synthetic-output';globalThis.URL.revokeObjectURL=()=>{};window.HTMLAnchorElement.prototype.click=function(){};
window.HTMLCanvasElement.prototype.getContext=()=>({measureText:text=>({width:String(text).length*7})});
let root;
try{
 const output=path.join(temp,'entry.mjs');await build({stdin:{contents:"export {createElement,useState,act} from 'react';export {createRoot} from 'react-dom/client';export {CandidateSelect} from './candidates.tsx';export {ProductFilter} from '../products/filters.tsx';export {ReadContext} from '../../../../src/loading/read-scope.ts';",resolveDir:here,sourcefile:'entry.tsx',loader:'tsx'},outfile:output,bundle:true,platform:'browser',format:'esm',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},jsx:'automatic',plugins:[{name:'source-css-test-only',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},args=>({path:args.path,namespace:'test-css'}));b.onLoad({filter:/.*/,namespace:'test-css'},()=>({contents:'export default "";',loader:'js'}));}}],logLevel:'warning'});

 const {createElement:h,useState,act,createRoot,CandidateSelect,ProductFilter,ReadContext}=await import(pathToFileURL(output));
 const uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');const context=new ReadContext({accountId:uid(1),sessionRevision:'1',permissionRevision:'1'}),host=document.getElementById('root');
 const settle=async()=>act(async()=>{await new Promise(r=>setTimeout(r,50));});const click=async el=>{assert.ok(el,'native click target exists');await act(async()=>el.click());await settle();};
 const candidates=Array.from({length:21},(_,n)=>({id:uid(n+10),label:'候选'+n}));
 for(const [family,kind]of [['inventory','category'],['inventory','warehouse'],['inventory','supplier'],['inventory','fit'],['inventory','season'],['products','year']]){
  const scope=context.createScope('all-filter-'+family+kind),reads=[];let value=null;
  const reader={readCandidates:async read=>{reads.push(read);const page=read.parameters.page;return {page,pageSize:20,exactTotal:21,items:candidates.slice((page-1)*20,page*20)};}};
  function Harness(){const [selected,setSelected]=useState(null);value=selected;return family==='inventory'?h(CandidateSelect,{kind,value:selected,categoryIds:[],scope,reader,productReader:{},onAccessFailure(){throw new Error('unexpected denial');},onChange:setSelected}):h(ProductFilter,{kind,value:selected,scope,reader,productReader:{},denied(){throw new Error('unexpected denial');},change:setSelected});}
  root=createRoot(host);await act(async()=>root.render(h(Harness)));await settle();const shadow=host.firstElementChild.shadowRoot;await click(shadow.querySelector('.arco-tree-select-view'));
  const nodes=()=>[...shadow.querySelectorAll('.arco-tree-node')];const allNode=()=>nodes().find(n=>n.querySelector('.arco-tree-node-title')?.textContent.startsWith('全部'));const itemNode=()=>nodes().find(n=>n.querySelector('.arco-tree-node-title')?.textContent==='候选0');const checked=node=>!!node.querySelector('.arco-checkbox-checked');
  assert.equal(nodes().length,21);assert.ok(nodes().every(checked),family+kind+' All checks every loaded child');
  await click(allNode().querySelector('.arco-checkbox'));assert.deepEqual(value,[]);assert.ok(nodes().every(n=>!checked(n)));
  await click(allNode().querySelector('.arco-checkbox'));assert.equal(value,null);assert.ok(nodes().every(checked));
  await click(itemNode().querySelector('.arco-checkbox'));assert.equal(value.length,20);assert.equal(value.some(x=>x.id===candidates[0].id),false);assert.equal(value.some(x=>x.id===candidates[20].id),true,'unloaded later-page candidate retained');assert.ok(reads.some(x=>x.parameters.page===2));assert.equal(checked(allNode()),false);assert.equal(checked(itemNode()),false);
  await click(allNode().querySelector('.arco-checkbox'));assert.equal(value,null);await click(shadow.querySelector('.arco-tag-close-btn'));assert.deepEqual(value,[],'All tag close clears the same selection');
  await act(async()=>root.unmount());root=null;scope.dispose();
 }
 console.log('PASS: actual Arco TreeSelect inventory5 kinds and product-year All/children check together, All click toggles, deselect from All keeps page2 candidates, All tag close clears. Synthetic DOM only.');
}finally{if(root)root.unmount();dom.window.close();await rm(temp,{recursive:true,force:true});}
