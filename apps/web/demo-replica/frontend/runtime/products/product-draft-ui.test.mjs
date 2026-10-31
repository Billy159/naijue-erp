/** Isolated synthetic DOM only. Does not prove real host/API/DB/browser connection. */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.draft-ui-'));
const dom=new JSDOM('<div id="host"></div>',{url:'https://synthetic.invalid',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLDialogElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLIFrameElement','HTMLFormElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
dom.window.matchMedia=media=>({matches:false,media,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
globalThis.pageXOffset=0;globalThis.pageYOffset=0;globalThis.innerWidth=1470;globalThis.innerHeight=724;dom.window.scrollTo=()=>{};
class ResizeObserver{observe(){}unobserve(){}disconnect(){}}globalThis.ResizeObserver=dom.window.ResizeObserver=ResizeObserver;
dom.window.HTMLCanvasElement.prototype.getContext=()=>({measureText:text=>({width:String(text).length*7})});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root;
try{
 const target=path.join(temp,'test.mjs');await build({stdin:{contents:"export {createElement,act} from 'react';export {createRoot} from 'react-dom/client';export {EditorBarcodes} from './editor-barcodes.tsx';export {SpecSelection} from './editor-fields.tsx';export {ProductPhotos} from './photos.tsx';export {ProductCandidatePreview} from './preview.tsx';export {ReadContext} from '../../../../src/loading/read-scope.ts';",resolveDir:here,sourcefile:'test.tsx',loader:'tsx'},outfile:target,bundle:true,platform:'browser',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'test-css',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({loader:'js',contents:'export default "";'}));}}],logLevel:'warning'});
 const {createElement:h,act,createRoot,EditorBarcodes,SpecSelection,ProductPhotos,ProductCandidatePreview,ReadContext}=await import(pathToFileURL(target).href);
 const host=document.getElementById('host'),context=new ReadContext({accountId:'00000000-0000-4000-8000-000000000001',sessionRevision:'1',permissionRevision:'1'}),scope=context.createScope('draft-ui');
 const settle=async()=>{for(let i=0;i<4;i++)await act(async()=>new Promise(r=>setTimeout(r,20)));};
 const mount=async element=>{root=createRoot(host);await act(async()=>root.render(element));await settle();};
 const unmount=async()=>{await act(async()=>root.unmount());root=null;};
 let writes=0;const names=new Map([['c','上青色'],['f','A版（标准）'],...Array.from({length:11},(_,i)=>['s'+i,i===10?'无尺码':'尺码'+i])]);
 const axes={colorIds:['c'],fitIds:['f'],sizeIds:Array.from({length:11},(_,i)=>'s'+i)},before=JSON.stringify(axes);
 await mount(h(EditorBarcodes,{active:true,canSupplement:false,skus:[],barcodes:[],draft:[],names,change:()=>writes++,preview:axes}));
 assert.equal(host.querySelectorAll('tbody tr[data-draft-spec]').length,11,'selected draft combinations render before SAVE');
 for(const row of host.querySelectorAll('tbody tr')){assert.equal(row.children[3].textContent,'未生成');assert.equal(row.children[4].textContent,'—');assert.equal(row.querySelector('button'),null,'draft tuples have no persisted-SKU operations');}
 assert.equal(JSON.stringify(axes),before);assert.equal(writes,0);assert.doesNotMatch(host.textContent,/共 0 条/);await unmount();
 // Existing persisted tuples and raw barcodes remain exactly on the original path.
 const native={id:'native',expectedVersion:4,skuCode:'ORIGINAL',colorId:'c',fitId:'f',sizeId:'s0',enabled:true},barcode={id:'old',barcode:'0000123 ',colorId:'c',fitId:'f',sizeId:'s0',kind:'MAIN',schemeId:null,enabled:false};
 await mount(h(EditorBarcodes,{active:true,skus:[native],barcodes:[barcode],draft:[],names,change:()=>writes++}));assert.equal(host.querySelector('tbody tr').dataset.draftSpec,undefined);assert.match(host.textContent,/0000123 /);assert.match(host.textContent,/停用/);assert.equal(writes,0);await unmount();
 await mount(h(SpecSelection,{scope,reader:{readCandidates:async read=>({...read.parameters,total:182,items:[{id:'c',name:'上青色',code:'01',parentId:null,version:1}]})},kind:'colors',denied(){},value:['c'],labels:names,close(){},save(){writes++;}}));
 const create=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='新增颜色');assert.ok(create,'frozen source footer entry is never hidden');assert.equal(create.disabled,true);assert.match(create.title,/未提供|未接通/);assert.ok([...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='加载更多'),'paging is separate from creation');assert.equal(writes,0);await unmount();
 await mount(h(ProductPhotos,{images:[],colors:[{id:'c',label:'上青色'}],scope,readOriginal:async()=>{throw Error('not requested');},denied(){},unavailableEditReason:'当前入口未接通图片暂存能力'}));
 const tiles=host.querySelectorAll('button[data-photo-add]');assert.equal(tiles.length,5);assert.ok([...tiles].every(tile=>tile.disabled));assert.equal(host.querySelector('input[type=file]'),null,'no capability means no upload input');assert.equal(writes,0);await unmount();
 const reads=[];await mount(h(ProductCandidatePreview,{productId:'p',scope,portal:host,onAccessFailure(){},reader:{readProductBasics:async read=>{reads.push(['basic',read]);return {productId:'p',code:'SYN',name:'合成',categoryLabel:'西服',yearLabel:null,seasonLabel:'秋',supplierLabel:'合成供应商',systemCode:null,retailPrice:'568.00'};},readProductImages:async read=>{reads.push(['images',read]);return {productId:'p',images:[]};},readProductSpecifications:async read=>{reads.push(['specs',read]);return {productId:'p',sizeGroup:null,colors:[{id:'c',label:'青'}],fits:[{id:'f',label:'A版（标准）'}],sizes:[],skus:[]};},readProductImage:async()=>{throw Error('original not requested');}}}));
 assert.deepEqual(reads.map(x=>x[0]).sort(),['basic','images','specs']);assert.ok(reads.every(x=>x[1].parameters.productId==='p'&&x[1].identity.accountId===scope.identity.accountId));
 const fields=[...host.querySelectorAll('.inv-preview-field')];assert.deepEqual(fields.slice(0,8).map(row=>row.querySelector('small').textContent),['款号','商品名称','颜色','商品分类','季节','版型','供应商','零售价']);assert.match(fields[2].textContent,/1 色/);assert.match(fields[5].textContent,/A版（标准）/);assert.match(fields[7].textContent,/568.00/);assert.match(host.querySelector('style').textContent,/data-product-candidate-preview[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);await unmount();
 scope.dispose();context.clear();console.log('PASS synthetic draft tuples, native barcode preservation, closed visible color/photo entry and scoped real-spec read. Not host/API/DB/browser evidence.');
}finally{if(root)root.unmount();dom.window.close();await rm(temp,{recursive:true,force:true});}
