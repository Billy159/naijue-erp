/** Synthetic DOM/HTTP only; no real server, database, browser geometry or performance evidence. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('original product editor: missing CREATE fields have Chinese feedback and send no command',async()=>{
 const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.product-feedback-'));
 const dom=new JSDOM('<div id="host"></div>',{url:'https://synthetic.test',pretendToBeVisual:true});let root,context;
 for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLDialogElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.innerWidth=1188;globalThis.innerHeight=761;globalThis.pageXOffset=0;globalThis.pageYOffset=0;
 dom.window.matchMedia=q=>({matches:false,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
 class ResizeObserver{observe(){}unobserve(){}disconnect(){}}globalThis.ResizeObserver=dom.window.ResizeObserver=ResizeObserver;
 dom.window.HTMLCanvasElement.prototype.getContext=()=>({measureText:s=>({width:String(s).length*7})});
 try{
  const out=path.join(temp,'entry.mjs');await build({stdin:{contents:`export {createElement,act} from 'react';export {createRoot} from 'react-dom/client';export {ProductEditor} from './apps/web/demo-replica/frontend/runtime/products/editor.tsx';export {ProductEditor as SharedProductEditor} from './apps/web/src/products/product-editor.tsx';export {ProductEditorController} from './apps/web/src/products/product-editor-state.ts';export {ReadContext} from './apps/web/src/loading/read-scope.ts';export {createProductMaintenanceHttpClientV2,validateProductMaintenanceDetailV2} from './apps/web/src/products/product-maintenance-http-client.ts';`,resolveDir:path.resolve(here,'..'),sourcefile:'test.tsx',loader:'tsx'},outfile:out,bundle:true,platform:'browser',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'synthetic-css-only',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'test-css'}));b.onLoad({filter:/.*/,namespace:'test-css'},()=>({loader:'js',contents:'export default "";'}));}}],logLevel:'warning'});
  const {createElement:h,act,createRoot,ProductEditor,SharedProductEditor,ReadContext,ProductEditorController,createProductMaintenanceHttpClientV2,validateProductMaintenanceDetailV2}=await import(pathToFileURL(out).href);
  const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,scheme='0e70e45e-1a51-4d44-afe8-0002cf3fb7ef';
  context=new ReadContext({accountId:id(1),sessionRevision:'1',permissionRevision:'1'});const scope=context.createScope('required-create'),host=document.getElementById('host'),wire=[];
  const client=createProductMaintenanceHttpClientV2({origin:'https://synthetic.test',basePath:'/api',fetch:async(url,init)=>{wire.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({operationId:id(20),targetId:id(2),kind:'PRODUCT',version:1}),{headers:{'content-type':'application/json'}});}});
  const capability={loadStyles:async()=>{},client,allowedActions:['CREATE','EDIT'],newRequestKey:()=>id(90),onRecoveryRequired:()=>assert.fail('no uncertain write'),reader:{contractVersion:2,readDetail:async()=>assert.fail('new unsaved product has no detail'),readCandidates:async read=>({...read.parameters,total:1,items:[{id:id(8),name:'A版（标准）',code:'A',parentId:null,version:1}]})},productReader:{readProductSpecifications:async()=>assert.fail('not opened')},dictionaryReader:{readSizeGroups:async()=>assert.fail('not opened')},barcodeSchemeReader:{readBarcodeScheme:async()=>({id:scheme,status:'CURRENT',name:'2026'})}};
  const options={parent:scope,productId:null,capability,http:{origin:'https://synthetic.test'},onAccessFailure:()=>assert.fail('no access failure'),onCanLeaveChange(){},onClose(){},onSaved:()=>assert.fail('empty draft not saved')};
  root=createRoot(host);await act(async()=>root.render(h(ProductEditor,options)));
  const settle=async()=>{for(let i=0;i<4;i++)await act(async()=>new Promise(r=>setTimeout(r,15)));};await settle();
  const save=[...host.querySelectorAll('button')].find(e=>e.textContent==='保存');assert.ok(save);assert.equal(save.disabled,false,'original default reference reads settled');
  await act(async()=>save.click());await settle();assert.equal(wire.length,0,'original parser rejects before any CREATE transport');
  const feedback=host.querySelector('#pc-editor-error').textContent;
  const requiredCaptions=[...host.querySelectorAll('.pc-base-grid .field')].filter(x=>x.querySelector('.ui-required')).map(x=>x.querySelector('.pc-field-caption').textContent.replace(/\s*\*$/,'').trim());assert.deepEqual(requiredCaptions,['款号','商品名称','商品分类','年份','供应商','系统货号']);
  assert.doesNotMatch(feedback,/Invalid product maintenance command/);
  for(const label of ['款号','商品名称','商品分类','年份','供应商','系统货号','尺码组','颜色'])assert.ok(feedback.includes(label),label+' missing feedback');
  assert.doesNotMatch(feedback,/季节|厚薄|领型/,'V2 season array empty is legal; optional metadata must not be invented');
  assert.match(feedback,/未发送/);
  await act(async()=>root.unmount());root=null;
  // The other existing frontend consumer shares the same feedback without a
  // different validation/transport contract. Its original default year remains.
  root=createRoot(host);await act(async()=>root.render(h(SharedProductEditor,options)));await settle();
  const sharedSave=[...host.querySelectorAll('button')].find(e=>e.textContent==='保存');assert.ok(sharedSave);assert.equal(sharedSave.disabled,false);await act(async()=>sharedSave.click());await settle();
  assert.match(host.querySelector('#pc-editor-error').textContent,/款号.*商品名称.*商品分类.*供应商.*系统货号.*尺码组/);assert.equal(wire.length,0);await act(async()=>root.unmount());root=null;
  // Fill a real contract draft; original controller+HTTP validation persist exactly once,
  // then validate/reopen the authoritative response in the original renderer.
  const prices=Object.fromEntries(['purchase_price','retail_price','wholesale5_price','wholesale6_price','wholesale7_price','wholesale8_price','wholesale9_price','wholesale10_price','minimum_price'].map(k=>[k,k==='retail_price'?'568.00':null]));
  const values={productCode:'SYN-REQUIRED-01',name:'合成必填回归',categoryId:id(3),supplierId:id(4),seasonIds:[],sizeGroupId:id(5),year:2026,systemItemCode:'0000123',thickness:null,collarPantsType:null,defaultBarcodeSchemeId:scheme,enabled:true,prices};
  const skus=[{id:null,expectedVersion:null,skuCode:'SYN-REQUIRED-SKU',colorId:id(7),fitId:id(8),sizeId:id(9),enabled:true}];
  const controller=new ProductEditorController({scope,client,newRequestKey:()=>id(91),onRecoveryRequired:()=>assert.fail(),onAccessFailure:()=>assert.fail()});
  await controller.submit({action:'CREATE',values,skus,barcodes:[]});assert.equal(controller.getSnapshot().phase,'committed');assert.equal(wire.length,1);assert.deepEqual(wire[0].body.values,values);assert.deepEqual(wire[0].body.skus,skus);assert.match(wire[0].url,/\/products\/v2\/commands$/);
  const detail={productId:id(2),version:1,deletedAt:null,values,skus:skus.map(s=>({...s,id:id(6),expectedVersion:1})),barcodes:[],references:{categoryPath:[{id:id(3),name:'合成分类'}],supplier:{id:id(4),name:'合成供应商',enabled:true},seasons:[],sizeGroup:{id:id(5),name:'合成尺码组'},defaultBarcodeScheme:{id:scheme,name:'2026',ruleVersion:'2026',status:'CURRENT'}}};validateProductMaintenanceDetailV2(detail,id(2));
  const reopen=context.createScope('required-reopen',id(2));let details=0;
  root=createRoot(host);await act(async()=>root.render(h(ProductEditor,{...options,parent:reopen,productId:id(2),capability:{...capability,reader:{...capability.reader,readDetail:async()=>{details++;return detail;}}}})));await settle();
  assert.equal(details,1);assert.equal(host.querySelector('input[aria-label="款号"]').value,values.productCode);assert.equal(host.querySelector('input[aria-label="商品名称"]').value,values.name);assert.equal(host.querySelector('input[aria-label="系统货号"]').value,values.systemItemCode);assert.equal(wire.length,1,'reopen sends no duplicate CREATE');assert.deepEqual([...host.querySelectorAll('.pc-base-grid .field')].filter(x=>x.querySelector('.ui-required')).map(x=>x.querySelector('.pc-field-caption').textContent.replace(/\s*\*$/,'').trim()),['款号','商品名称','商品分类']);assert.equal(host.querySelector('#pc-editor-error').textContent,'');
  await act(async()=>{root.unmount();root=null;controller.dispose();reopen.dispose();scope.dispose();});
 }finally{if(root)root.unmount();context?.clear();dom.window.close();await rm(temp,{recursive:true,force:true});}
});

const {productRequiredFeedback}=await import('../apps/web/src/products/product-required-feedback.ts');
const {parseProductMaintenanceCommand,parseProductMaintenanceCommandV2}=await import('../packages/application/src/product-maintenance-validation.ts');
const {DomainError}=await import('../packages/domain/src/errors.ts');
const uid=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const complete=()=>({action:'CREATE',requestKey:'synthetic.required-feedback',values:{productCode:'SYN_01',name:'合成',categoryId:uid(1),supplierId:uid(2),seasonIds:[],sizeGroupId:uid(3),year:2026,systemItemCode:'0000123',thickness:null,collarPantsType:null,defaultBarcodeSchemeId:uid(4),enabled:true,prices:Object.fromEntries(['purchase_price','retail_price','wholesale5_price','wholesale6_price','wholesale7_price','wholesale8_price','wholesale9_price','wholesale10_price','minimum_price'].map(k=>[k,null]))},skus:[],barcodes:[],skuSelection:{colorIds:[uid(5)],fitIds:[uid(6)]}});
for(const [field,value,label]of [['productCode',' ','款号'],['name','','商品名称'],['categoryId','','商品分类'],['sizeGroupId','','尺码组'],['supplierId',null,'供应商'],['year',null,'年份'],['systemItemCode',null,'系统货号'],['defaultBarcodeSchemeId',null,'主条码默认方案']])test('required contract missing '+field,()=>{
 const draft=complete();draft.values[field]=value;const before=JSON.stringify(draft);let error;try{parseProductMaintenanceCommandV2(draft)}catch(e){error=e}assert.ok(error instanceof DomainError);const text=productRequiredFeedback(draft,error);assert.ok(text.includes(label));assert.match(text,/未发送保存请求/);assert.equal(JSON.stringify(draft),before,'feedback does not normalize/mutate original values, prices or selections');
});
test('V2 empty seasons are valid; EDIT nullable metadata is not declared required',()=>{
 const draft=complete();assert.doesNotThrow(()=>parseProductMaintenanceCommandV2(draft));
 const edit={...draft,action:'EDIT',id:uid(7),expectedVersion:1,values:{...draft.values,supplierId:null,year:null,systemItemCode:null,defaultBarcodeSchemeId:null,seasonIds:null}};
 assert.doesNotThrow(()=>parseProductMaintenanceCommandV2(edit));assert.equal(productRequiredFeedback(edit,new DomainError('INVALID_PRODUCT_MAINTENANCE','synthetic unrelated invalid shape')).includes('必填'),false);
});
test('V1 CREATE season differs from V2 empty array; no invented scheme/price/supplier facts',()=>{
 const v2=complete(),{seasonIds,...values}=v2.values,v1={...v2,values:{...values,seasonId:null}};delete v1.skuSelection;v1.skus=[{id:null,expectedVersion:null,skuCode:'SYN',colorId:uid(5),fitId:uid(6),sizeId:uid(8),enabled:true}];let e;try{parseProductMaintenanceCommand(v1)}catch(x){e=x}assert.ok(e);assert.match(productRequiredFeedback(v1,e),/季节/);assert.equal(v1.values.seasonId,null);
});
test('invalid format/unknown seasons remain original parser rejections; other errors are not mislabeled not-sent',()=>{
 for(const patch of [{productCode:'不支持款号'},{seasonIds:null}]){const d=complete();Object.assign(d.values,patch);let error;try{parseProductMaintenanceCommandV2(d)}catch(e){error=e}assert.ok(error);assert.match(productRequiredFeedback(d,error),/未发送保存请求/);}
 assert.equal(productRequiredFeedback(complete(),new Error('transport failure')),null);assert.equal(productRequiredFeedback(complete(),new DomainError('FORBIDDEN','access failure')),null);
 const d=complete();d.skuSelection={colorIds:[],fitIds:[]};let error;try{parseProductMaintenanceCommandV2(d)}catch(e){error=e}assert.match(productRequiredFeedback(d,error),/颜色.*版型/);
});
