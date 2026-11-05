import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
// Targeted synthetic lifecycle/quantity tests. Geometry below is a declared test
// double; it supplies NO browser measurement, visual, HTTP, PG or performance proof.
const here=path.dirname(fileURLToPath(import.meta.url));
let temp=null,dom=null,root=null,scope=null,replacementScope=null,context=null,primaryError=null;
try{
 temp=await mkdtemp(path.join(here,'.test-'));
 dom=new JSDOM('<!doctype html><body class="inventory-workbench"><div id="root"></div><dialog id="gold-drawer"><div id="gold-drawer-content"></div></dialog></body>',{url:'https://synthetic.test/',pretendToBeVisual:true});
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
 const output=path.join(temp,'entry.mjs');
 await build({stdin:{contents:"export {createElement,StrictMode,act} from 'react';export {createRoot} from 'react-dom/client';export {ProductDetail} from './detail.tsx';export {ReadContext} from '../../../../src/loading/read-scope.ts';export {createProductFullPageHttpReader} from '../../../../src/products/product-page-http-reader.ts';export {createReplicaPreviewTransport} from '../../runtime-preview-transport.ts';export {qaProducts} from '../../qa-reference-fixtures.mts';",resolveDir:here,sourcefile:'entry.tsx',loader:'tsx'},outfile:output,bundle:true,platform:'browser',format:'esm',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},jsx:'automatic',plugins:[{name:'source-css-test-only',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},args=>({path:args.path,namespace:'test-css'}));b.onLoad({filter:/.*/,namespace:'test-css'},()=>({contents:'export default "";',loader:'js'}));}}],logLevel:'warning'});
 const {createElement:h,StrictMode,act,createRoot,ProductDetail,ReadContext,createProductFullPageHttpReader,createReplicaPreviewTransport,qaProducts}=await import(pathToFileURL(output));
 const transport=createReplicaPreviewTransport(),session=await(await transport.http.fetch(transport.http.origin+'/api/auth/session',{method:'GET',credentials:'same-origin'})).json();
 context=new ReadContext({accountId:session.principal.accountId,sessionRevision:'1',permissionRevision:'1'});scope=context.createScope('sku-modal-owner',qaProducts[0].id);
 const host=document.getElementById('root'),product=qaProducts[0],reader=createProductFullPageHttpReader(transport.http,['barcodes']);
 const settle=async(ms=25)=>act(async()=>{await new Promise(r=>setTimeout(r,ms));}),click=async element=>{assert.ok(element,'click target');await act(async()=>element.click());};
 Object.defineProperty(window,'innerWidth',{configurable:true,value:900});Object.defineProperty(document.body,'clientWidth',{configurable:true,get:()=>885});
 // Actual detail-entry.tsx production mount does not add StrictMode. Do not
 // introduce a different modal effect-replay contract into this close regression.
 root=createRoot(host);await act(async()=>root.render(h(ProductDetail,{scope,http:transport.http,product:{id:product.id,label:product.code},reader,onAccessFailure(error){throw error;},onOpenInventory(){throw Error('No inventory action');},close(){throw Error('No route close');}})));await settle(80);
 await click([...host.querySelectorAll('[role=tab]')].find(x=>x.textContent==='条码'));await settle(120);
 const table=host.querySelector('.pc-barcode-table');assert.ok(table);assert.equal(table.querySelectorAll('tbody tr').length,44,'unchanged original QA fixture supplies44 SKU');
 const owner=host.querySelector('.pc-detail-workbench'),trigger=table.querySelector('tbody tr:last-child button'),originalText=table.textContent,originalFooter=host.querySelector('.pc-pagination').textContent;
 // Geometry model ONLY, not a browser measurement: reproduce the installed
 // Arco useOverflowHidden cleanup: restore width first while overflow remains
 // hidden, transiently expand clientWidth675→690, clamp175→160; then unlock.
 let left=175,top=23,clamps=0;const leftWrites=[],styleWrites=[],style=document.body.style;
 Object.defineProperty(table,'scrollWidth',{configurable:true,get:()=>850});
 Object.defineProperty(table,'clientWidth',{configurable:true,get:()=>style.overflow==='hidden'&&style.width===''?690:675});
 Object.defineProperty(table,'scrollLeft',{configurable:true,get:()=>left,set(value){left=Math.min(Math.max(0,Number(value)),850-table.clientWidth);leftWrites.push(left);}});
 Object.defineProperty(table,'scrollTop',{configurable:true,get:()=>top,set(value){top=Number(value);}});
 let proto=style,widthDescriptor;while(proto&&!widthDescriptor){widthDescriptor=Object.getOwnPropertyDescriptor(proto,'width');proto=Object.getPrototypeOf(proto);}assert.ok(widthDescriptor?.get&&widthDescriptor?.set);
 Object.defineProperty(style,'width',{configurable:true,get(){return widthDescriptor.get.call(style);},set(value){widthDescriptor.set.call(style,value);styleWrites.push({width:style.width,overflow:style.overflow});if(table.isConnected&&value===''&&style.overflow==='hidden'){const before=left;table.scrollLeft=left;if(left!==before){clamps++;table.dispatchEvent(new Event('scroll',{bubbles:true}));}}}});
 const modal=()=>document.querySelector('.arco-modal.pc-arco-modal');
 const assertOwner=()=>{assert.equal(host.querySelector('.pc-detail-workbench')===owner,true,'same owner node identity');assert.equal(host.querySelector('.pc-barcode-table')===table,true,'same table node identity');assert.equal(table.textContent,originalText);assert.equal(host.querySelector('.pc-pagination').textContent,originalFooter);assert.equal(table.scrollTop,23);assert.equal(table.scrollLeft,175,'original SKU modal owner must restore175, not retain native close-time clamp160');};
 for(const closeMode of ['footer','icon','footer']){
  table.scrollLeft=175;table.scrollTop=23;table.dispatchEvent(new Event('scroll',{bubbles:true}));
  await click(trigger);await settle(80);assert.ok(modal());assert.equal(modal().querySelectorAll('.pc-modal-body tbody tr').length,2,'original sameSKU MAIN+CONFIRMED_OLD, not fabricatedN+');assert.equal(table.scrollLeft,175,'opening does not alter original offset');
  await click(closeMode==='footer'?modal().querySelector('.pc-modal-foot button'):modal().querySelector('.arco-modal-close-icon'));await settle(40);assert.equal(modal()===null,true,'modal detached');assertOwner();
 }
 assert.equal(clamps,3,'every tested close really exercised installed width-before-overflow transient');assert.ok(styleWrites.some(x=>x.width===''&&x.overflow==='hidden'));
 // Leaving the barcode tab while the modal is removed must not restore a
 // detached/inactive owner. No stale source-table write may follow unmount.
 table.scrollLeft=175;await click(trigger);await settle(60);const beforeLeave=leftWrites.length;
 await click([...host.querySelectorAll('[role=tab]')].find(x=>x.textContent==='基础资料'));await settle(40);assert.equal(host.querySelector('.pc-barcode-table')===null,true,'inactive barcode table absent');assert.equal(leftWrites.slice(beforeLeave).filter(x=>x===175).length,0,'inactive/detached table receives no restoration write');
 // Return through the original component's supported tab lifecycle, then
 // observe a disposed-but-still-connected interval before React commits removal.
 await click([...host.querySelectorAll('[role=tab]')].find(x=>x.textContent==='条码'));await settle(60);
 const disposalTable=host.querySelector('.pc-barcode-table');assert.equal(!!disposalTable,true,'disposal owner exists');
 let disposalLeft=175,disposalTop=23;const disposalWrites=[];
 Object.defineProperty(disposalTable,'scrollLeft',{configurable:true,get:()=>disposalLeft,set(value){disposalLeft=Number(value);disposalWrites.push(disposalLeft);}});Object.defineProperty(disposalTable,'scrollTop',{configurable:true,get:()=>disposalTop,set(value){disposalTop=Number(value);}});
 disposalTable.dispatchEvent(new Event('scroll',{bubbles:true}));await click(disposalTable.querySelector('tbody tr:last-child button'));await settle(60);assert.equal(!!modal(),true,'same original SKU modal opened');
 let connectedImmediatelyAfterDispose=false;const writesBeforeDispose=disposalWrites.length;
 await act(async()=>{scope.dispose();connectedImmediatelyAfterDispose=disposalTable.isConnected;disposalTable.scrollLeft=160;modal()?.querySelector('.pc-modal-foot button')?.click();});await settle(40);
 assert.equal(connectedImmediatelyAfterDispose,true,'scope disposed while owner still connected before React commit');assert.equal(scope.active,false);assert.equal(disposalTable.isConnected,false,'original ProductDetail disposal unmounts old owner');assert.equal(disposalWrites.slice(writesBeforeDispose).filter(value=>value===175).length,0,'no stale175 restoration after disposal');
 await act(async()=>root.unmount());root=null;const oldWritesAfterUnmount=disposalWrites.length;
 // Real host replacement: old scope disposed/root unmounted -> new scope/root
 // and a different original target. Do not invent unkeyed same-root prop changes.
 replacementScope=context.createScope('sku-modal-owner-replacement',qaProducts[1].id);const replacementProduct=qaProducts[1],replacementReader=createProductFullPageHttpReader(transport.http,['barcodes']);
 root=createRoot(host);await act(async()=>root.render(h(ProductDetail,{scope:replacementScope,http:transport.http,product:{id:replacementProduct.id,label:replacementProduct.code},reader:replacementReader,onAccessFailure(error){throw error;},onOpenInventory(){throw Error('No inventory action');},close(){throw Error('No route close');}})));await settle(80);await click([...host.querySelectorAll('[role=tab]')].find(x=>x.textContent==='条码'));await settle(100);
 const replacementOwner=host.querySelector('.pc-detail-workbench'),replacementTable=host.querySelector('.pc-barcode-table');assert.equal(!!replacementOwner&&replacementOwner!==owner,true,'new target has a new owner');assert.equal(!!replacementTable&&replacementTable!==disposalTable,true,'new target has a new table');assert.equal(replacementTable.querySelectorAll('tbody tr').length>0,true,'unchanged original replacement target loaded');replacementTable.scrollLeft=71;replacementTable.scrollTop=19;replacementTable.dispatchEvent(new Event('scroll',{bubbles:true}));await settle(40);
 assert.equal(disposalWrites.length,oldWritesAfterUnmount,'no stale old-owner write across actual root/target replacement');assert.equal(replacementTable.scrollLeft,71,'old modal intent cannot mutate new target horizontal offset');assert.equal(replacementTable.scrollTop,19,'old modal intent cannot mutate new target vertical offset');
 console.log('PASS MODEL ONLY: original exact175/23 footer/icon/repeat recovery; inactive tab owner; disposed-but-connected interval then removal; real dispose/unmount/new-scope/new-target lifecycle with no stale write or cross-target mutation. Scope/product mismatch guard branches remain static-reviewed, not dynamically isolated. No browser/PG/performance proof.');
}catch(error){primaryError=error;throw error;}
finally{
 const cleanupErrors=[];
 for(const [label,cleanup]of [['old-scope',()=>scope?.dispose()],['replacement-scope',()=>replacementScope?.dispose()],['read-context',()=>context?.clear()],['react-root',()=>{if(root){root.unmount();root=null;}}],['jsdom',()=>{if(dom){dom.window.close();dom=null;}}],['tempdir',async()=>{if(temp){await rm(temp,{recursive:true,force:true});temp=null;}}]]){
  try{await cleanup();}catch(error){cleanupErrors.push(new Error('Owned cleanup failed: '+label,{cause:error}));}
 }
 if(cleanupErrors.length)throw new AggregateError(primaryError?[primaryError,...cleanupErrors]:cleanupErrors,'Owned setup/cleanup failure; original error retained');
}
