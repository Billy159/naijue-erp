import assert from 'node:assert/strict';
import { mkdir,readFile,symlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from '/workspace/shared/naijue-erp-rewrite/node_modules/esbuild/lib/main.js';
import { JSDOM } from '/workspace/shared/naijue-erp-rewrite/node_modules/jsdom/lib/api.js';
const repo='/workspace/shared/naijue-erp-rewrite', dir='/workspace/scratch/f6bee04e937b/evidence/demo-restoration-integration-20261021/dom-runtime';
await mkdir(dir,{recursive:true});try{await symlink(repo+'/node_modules',dir+'/node_modules','dir');}catch(error){if(error.code!=='EEXIST')throw error;}
const frame=await readFile(repo+'/apps/web/src/demo-presentation/frame.css','utf8');
const actionCSS=await readFile(repo+'/apps/web/src/components/inventory-page-size.css','utf8');
const css=(frame+'\n'+actionCSS).replace(/@import[^;]+;/g,'');
const dom=new JSDOM('<!doctype html><style data-inventory-inline>'+css+'</style><div id="root"></div><button id="outside">Outside</button>',{url:'https://synthetic.test/',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
dom.window.matchMedia=query=>({matches:false,media:query,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let network=0;dom.window.fetch=()=>{network++;throw Error('Unexpected external read');};
await build({stdin:{contents:`export {act,createElement,StrictMode} from 'react'; export {createRoot} from 'react-dom/client'; export {DemoFrame} from './src/demo-presentation/demo-frame.tsx'; export {InventoryPagination} from './src/components/pagination.tsx'; export {InventoryMatrix,defaultDisplaySettings} from './src/inventory/inventory-matrix.tsx'; export {makeSyntheticInventoryProduct} from './preview/synthetic-reader.ts'; export {emptyInventoryFilter} from './src/inventory/contracts.ts'; export {ReadContext} from './src/loading/read-scope.ts';`,resolveDir:repo+'/apps/web',loader:'tsx'},outfile:dir+'/entry.mjs',bundle:true,platform:'browser',format:'esm',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);"},jsx:'automatic',loader:{'.css':'empty'},logLevel:'warning'});
const {act,createElement:h,StrictMode,createRoot,DemoFrame,InventoryPagination,InventoryMatrix,defaultDisplaySettings,makeSyntheticInventoryProduct,emptyInventoryFilter,ReadContext}=await import(pathToFileURL(dir+'/entry.mjs'));
const context=new ReadContext({accountId:'INDEPENDENT',sessionRevision:'1',permissionRevision:'1'}),scope=context.createScope('INDEPENDENT-COMBINED');
const product=makeSyntheticInventoryProduct(1,emptyInventoryFilter());const original=JSON.stringify(product);
const data={page:1,pageSize:100,exactTotalProducts:1,products:[product],warehouseLabels:[],allMatchesTotal:product.total,readReference:'independent-read'};
let settings=defaultDisplaySettings,size=100,busy=false;const cellCalls=[],sizeCalls=[];const host=document.getElementById('root'),root=createRoot(host);
const draw=()=>root.render(h(StrictMode,null,h(DemoFrame,{navigation:{inventory:{selected:true}},breadcrumb:'INDEPENDENT',children:h('div',null,h(InventoryMatrix,{data,settings,collapsedProducts:new Set(),collapsedColors:new Set(),toggleProduct(){},toggleColor(){},actions:{onOpenCell:target=>cellCalls.push(target)}}),h(InventoryPagination,{scope,page:1,pageSize:size,total:1,busy,onPage(){},onPageSize:value=>sizeCalls.push(value)}))})));
const render=()=>act(async()=>draw());const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,40));});const click=element=>act(async()=>{assert.ok(element);element.click();});
try{
 await render();assert.ok(host.querySelector('main.demo-page-inventory'));assert.equal(host.querySelector('.arco-select'),null);assert.equal(host.querySelector('select'),null);assert.equal(host.querySelectorAll('.mx-detail-row').length,4);
 const merged=[...host.querySelectorAll('.mx-stock')].find(button=>Number(button.dataset.inventorySourceCount)>1);assert.ok(merged.disabled);await click(merged);assert.equal(cellCalls.length,0);
 await click(host.querySelector('.iw-page-size-trigger'));await settle();assert.equal(host.querySelectorAll('[role=option]').length,3);const control=host.querySelector('.arco-select');assert.equal(document.activeElement,control);assert.ok(control.classList.contains('arco-select-focused'));assert.ok(control.closest('.demo-ui'));assert.equal(control.tabIndex,0);
 const localRule=[...document.styleSheets[0].cssRules].find(rule=>rule.selectorText==='.iw-page-size-arco .arco-select:focus-visible');assert.ok(localRule);assert.match(localRule.style.outline,/^0/);assert.ok(actionCSS.includes('.arco-select.arco-select-focused .arco-select-view'));
 await click([...host.querySelectorAll('[role=option]')][1]);await settle();assert.deepEqual(sizeCalls,[200]);assert.equal(host.querySelector('.ui-single-tag').textContent,'100款/页');
 size=200;busy=true;await render();assert.equal(host.querySelector('.ui-single-tag').textContent,'200款/页');assert.ok(host.querySelector('.arco-select-disabled'));
 settings={...settings,fit:true};await render();assert.equal(host.querySelectorAll('.mx-detail-row').length,8);const negative=host.querySelector('.mx-negative');assert.equal(negative.textContent,'-2');await click(negative);assert.equal(cellCalls.length,1);assert.equal(cellCalls[0].fit.id,'test-fit-Y');assert.equal(cellCalls[0].size.label,'165/S');assert.equal(cellCalls[0].readReference,'independent-read');
 assert.equal(JSON.stringify(product),original);assert.equal(network,0);
 console.log(JSON.stringify({pass:true,combined:'Actual DemoFrame + InventoryMatrix + InventoryPagination under real React19 StrictMode',checks:['idle native/Arco select absent','merged multi-source target cannot invoke ledger','real Arco first-open 3 options and focus transfer inside DemoFrame','local zero outline declaration plus retained focused border','selection remains old applied value until parent commits','busy disable','FIT toggle restores exact real negative SKU target','canonical facts unchanged; no network'],boundary:'Synthetic DOM, source selector and interaction assertions only; not browser computed layout/pixel/performance acceptance.'},null,2));
}finally{await act(async()=>root.unmount());context.clear();dom.window.close();}
