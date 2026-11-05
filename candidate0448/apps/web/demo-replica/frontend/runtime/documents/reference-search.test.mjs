import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.reference-search-'));
const dom=new JSDOM('<div id="root"></div>',{url:'https://references.test',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});dom.window.matchMedia=media=>({matches:false,media,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.innerWidth=1400;globalThis.innerHeight=900;globalThis.pageXOffset=0;globalThis.pageYOffset=0;HTMLElement.prototype.scrollTo=function(){};
const {act,createElement:h,useState}=await import('react'),{createRoot}=await import('react-dom/client');let root;
const deep=(selector,node=document)=>[...node.querySelectorAll(selector),...[...node.querySelectorAll('*')].flatMap(el=>el.shadowRoot?deep(selector,el.shadowRoot):[])];
const settle=async()=>act(async()=>{await new Promise(r=>setTimeout(r,50));});
try{
 const output=path.join(temp,'entry.mjs');await build({stdin:{contents:"export {SourceMulti} from './source-controls.tsx';export {ProposalReference} from './proposal-picker.tsx';export {ReferenceSelect,SmallSelect} from '../settings/controls.tsx';export {CurrentWarehouseSelect} from './current-warehouse-select.tsx';export {ReadContext} from '../../../../src/loading/read-scope.ts';",resolveDir:here,loader:'tsx'},outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'css',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({loader:'js',contents:'export default "";'}));}}]});
 const {SourceMulti,ProposalReference,ReferenceSelect,SmallSelect,CurrentWarehouseSelect,ReadContext}=await import(pathToFileURL(output).href),host=document.getElementById('root');
 let resetEmpty;function MultiHarness(){const [selected,setSelected]=useState([]),[reset,setReset]=useState(0);resetEmpty=()=>setReset(n=>n+1);return h(SourceMulti,{label:'客户',resetKey:reset,selected,items:[{id:'one',label:'客户一'}],change:setSelected});}
 root=createRoot(host);await act(async()=>root.render(h(MultiHarness)));await settle();await act(async()=>deep('.arco-tree-select-view')[0].click());await settle();let all=deep('.arco-tree-node').find(n=>n.querySelector('.arco-tree-node-title')?.textContent==='全部客户');assert.ok(all.querySelector('.arco-checkbox-checked'));await act(async()=>all.querySelector('.arco-checkbox').click());await settle();assert.equal(all.querySelector('.arco-checkbox-checked'),null,'zero-selection draft must not immediately turn back to ALL');await act(async()=>resetEmpty());await settle();assert.ok(all.querySelector('.arco-checkbox-checked'),'query/reset intent returns empty wire range to ALL');await act(async()=>root.unmount());root=null;
 const context=new ReadContext({accountId:'a',sessionRevision:'1',permissionRevision:'1'}),scope=context.createScope('search');
 // DOM structural regression only; native reverse Tab has a separate browser test.
 for(const search of [true,false]){
  let changes=0;
  root=createRoot(host);await act(async()=>root.render(h(SmallSelect,{value:'one',items:[{value:'one',label:'保留选择'}],label:'焦点回归',search,onChange(){changes++;}})));await settle();
  const view=deep('[role="combobox"]')[0];assert.ok(view);await act(async()=>view.focus());await settle();
  if(search){const input=view.querySelector('input');assert.ok(input);assert.equal(view.getRootNode().activeElement,input);assert.equal(view.tabIndex,-1,'searchable settings wrapper must not trap backward Tab');assert.equal(input.tabIndex,0);}
  else{assert.equal(view.tabIndex,0,'non-search settings wrapper retains its tab stop');assert.equal(view.getRootNode().activeElement,view);}
  assert.equal(changes,0,'focus does not choose an option');
  await act(async()=>root.unmount());root=null;
 }

 let recommendationPicker={kind:'customer',search:'',page:1,phase:'ready',result:{page:1,pageSize:20,exactTotal:2n,recommendationAvailability:'AVAILABLE',items:[{id:'not-default',name:'同名客户',code:'C1',paymentMethodId:null,isRecommended:false},{id:'hall-default',name:'同名客户',code:'C2',paymentMethodId:null,isRecommended:true}]}};
 const selectedIds=[],referenceSession={getSnapshot:()=>({picker:recommendationPicker}),async select(id){selectedIds.push(id);return true;}};
 const renderRecommendation=()=>h(ProposalReference,{session:referenceSession,picker:recommendationPicker,active:true,label:'客户',selected:null,disabled:false,open(){},close(){}});
 root=createRoot(host);await act(async()=>root.render(renderRecommendation()));await settle();assert.equal(selectedIds.length,0,'showing default recommendation must not select it');assert.ok(deep('.arco-select-group-title').some(el=>el.textContent==='推荐客户'));
 const recommendedOption=deep('.arco-select-option')[0];assert.ok(recommendedOption);await act(async()=>recommendedOption.click());await settle();assert.deepEqual(selectedIds,['hall-default']);
 recommendationPicker={...recommendationPicker,result:{...recommendationPicker.result,items:recommendationPicker.result.items.map(row=>({...row,isRecommended:row.id==='not-default'}))}};
 await act(async()=>root.render(renderRecommendation()));await settle();assert.equal(selectedIds.length,1,'changing hall hint must not auto-select');await act(async()=>deep('.arco-select-option')[0].click());await settle();assert.deepEqual(selectedIds,['hall-default','not-default'],'same-name option uses the new hall default real ID');
 await act(async()=>root.unmount());root=null;
 const selected={id:'old',name:'原选择',code:'',paymentMethodId:null};
 for(const items of [[],[{...selected,id:'new',name:'匹配选项'}]]){
  const picker={kind:'customer',search:'搜索',page:1,phase:'ready',result:{items,page:1,pageSize:20,exactTotal:BigInt(items.length)}};
  root=createRoot(host);await act(async()=>root.render(h(ProposalReference,{session:{getSnapshot:()=>({picker})},picker,active:true,label:'客户',selected,disabled:false,open(){},close(){}})));await settle();
  assert.equal(deep('.arco-select-view-input')[0].placeholder,'原选择');assert.equal(deep('.arco-select-option').some(el=>el.textContent.includes('原选择')),false,'selected label never injected into menu');assert.equal(deep('.arco-select-option').length,items.length);
  await act(async()=>root.unmount());root=null;
 }
 let queries=[];root=createRoot(host);await act(async()=>root.render(h(ReferenceSelect,{scope,kind:'halls',reader:{read:async(kind,p)=>{queries.push(p);return {items:[],total:0,page:1,pageSize:20};}},label:'营业厅',includeAll:true,allLabel:'全部营业厅',selected:null,onChange(){}})));await settle();await act(async()=>deep('.arco-select-view')[0].click());await settle();assert.ok(deep('.arco-select-option').some(x=>x.textContent==='全部营业厅'));
 const hallView=deep('[role="combobox"]')[0];await act(async()=>hallView.querySelector('input').focus());assert.equal(hallView.tabIndex,-1,'ReferenceSelect uses the same searchable settings focus adapter');
 const input=deep('input')[0];await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'ZZZ');input.dispatchEvent(new Event('input',{bubbles:true}));});await settle();assert.equal(queries.at(-1).search,'ZZZ');assert.equal(deep('.arco-select-option').length,0,'ALL is not an unmatched search result');await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,bubbles:true})));await settle();assert.match(deep('.arco-select-view')[0].textContent,/全部营业厅/);await act(async()=>root.unmount());root=null;
 root=createRoot(host);await act(async()=>root.render(h(CurrentWarehouseSelect,{scope,reader:{readTransferWarehouses:async()=>({items:[],page:1,pageSize:20,exactTotal:0n})},direction:'FROM',selected:{id:'old',name:'原仓库'},opposite:'other',disabled:false,change(){},denied(){}})));await settle();await act(async()=>deep('.arco-select-view')[0].click());await settle();assert.equal(deep('.arco-select-option').length,0);assert.equal(deep('.arco-select-view-input')[0].placeholder,'原仓库');
 console.log('PASS actual reference components: selected label retained, unmatched selected option excluded, ALL hidden only during search, warehouse empty result retained. DOM synthetic, not browser/HTTP.');
}finally{if(root)await act(async()=>root.unmount());dom.window.close();await rm(temp,{recursive:true,force:true});}
