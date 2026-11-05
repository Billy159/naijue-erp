import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), temp = await mkdtemp(path.join(here, '.deep-link-'));
const dom = new JSDOM('<div id="app"><nav class="sidebar"><a data-route="product-categories">分类</a></nav><div id="account"></div><div id="breadcrumb"></div><main id="page"></main></div>', {url:'https://catalogue.test/#product-categories',pretendToBeVisual:true});
for(const key of ['window','document','history','location','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLDialogElement','HTMLButtonElement','HTMLIFrameElement','HTMLFormElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
dom.window.matchMedia=media=>({matches:false,media,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=await import('react');
try {
 const output=path.join(temp,'test.mjs');
 await build({stdin:{contents:"export {createProductsFeature} from './feature.ts';export {mountProductDetail} from './detail-entry.tsx';export {ReadScope} from '../../../../src/loading/read-scope.ts';",resolveDir:here,loader:'tsx'},outfile:output,bundle:true,platform:'browser',format:'esm',external:['react','react-dom','react-dom/*'],jsx:'automatic',logLevel:'silent',plugins:[{name:'css',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({contents:'export default "";',loader:'js'}));}}]});
 const {createProductsFeature,mountProductDetail,ReadScope}=await import(pathToFileURL(output).href);
 const identity={accountId:'00000000-0000-4000-8000-000000000001',sessionRevision:1,permissionRevision:1};
 const page=document.getElementById('page');let calls=0;const destinations=[];
 const options={session:{auth:{getSnapshot:()=>({principal:{accountId:identity.accountId}})},http:{origin:'https://catalogue.test',basePath:'/api',fetch:()=>{calls++;throw Error('no request allowed');}}},routes:{products:true,productFullPage:true}};
 const feature=createProductsFeature(options,next=>destinations.push(next),async()=>{}, {commands:async()=>{calls++;}}, {openProductInventory(){}});
 for(const route of ['products/view/not-a-uuid','products/view/%','products/view/','products/edit/not-a-uuid','products/edit/%','products/view/00000000-0000-4000-8000-000000000001/extra']){
  const scope=new ReadScope(identity,route,null,()=>{});let mounted;
  await act(async()=>{mounted=await feature.mount(page,route,scope);});
  assert.match(page.textContent,/商品链接无效/);assert.equal(calls,0);assert.ok(page.querySelector('button'));
  page.querySelector('button').click();assert.equal(destinations.at(-1),'products');mounted.dispose();scope.dispose();page.replaceChildren();
 }
 const scope=new ReadScope(identity,'direct-detail',null,()=>{});let dispose;
 // Defensive leaf boundary must catch a render exception even when entry validation is bypassed.
 await act(async()=>{dispose=await mountProductDetail(page,{scope,product:{id:'invalid',label:'invalid'},reader:{},http:{},onAccessFailure(){},onOpenInventory(){},close:()=>destinations.push('products')});});
 assert.match(page.textContent,/商品页面暂时无法显示/);assert.ok(page.querySelector('button'));
 await act(async()=>page.querySelector('button').click());assert.equal(destinations.at(-1),'products');
 await act(async()=>dispose());scope.dispose();feature.dispose();assert.equal(calls,0);
 console.log('PASS malformed product routes: zero reads/writes, return action, leaf render boundary');
}finally{await rm(temp,{recursive:true,force:true});dom.window.close();}
