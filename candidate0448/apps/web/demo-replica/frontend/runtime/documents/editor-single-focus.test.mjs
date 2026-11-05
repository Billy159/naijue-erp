// DOM focus structure only; native keyboard evidence comes from remaining-tab-browser.py.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.editor-single-focus-'));
const dom=new JSDOM('<div id="root"></div>',{url:'https://editor-focus.test',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});dom.window.matchMedia=media=>({matches:false,media,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.innerWidth=1400;globalThis.innerHeight=900;globalThis.pageXOffset=0;globalThis.pageYOffset=0;HTMLElement.prototype.scrollTo=function(){};
const {act,createElement:h}=await import('react'),{createRoot}=await import('react-dom/client');let root;
const deep=(selector,node=document)=>[...node.querySelectorAll(selector),...[...node.querySelectorAll('*')].flatMap(el=>el.shadowRoot?deep(selector,el.shadowRoot):[])];
const settle=async()=>act(async()=>{await new Promise(r=>setTimeout(r,50));});
try{
 const output=path.join(temp,'entry.mjs');await build({stdin:{contents:"export {EditorChoice} from '../products/editor-fields.tsx';export {ReadContext} from '../../../../src/loading/read-scope.ts';",resolveDir:here,loader:'tsx'},outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'css',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({loader:'js',contents:'export default "";'}));}}]});
 const {EditorChoice,ReadContext}=await import(pathToFileURL(output).href),host=document.getElementById('root');
 const context=new ReadContext({accountId:'synthetic',sessionRevision:'1',permissionRevision:'1'}),failures=[];
 const cases=[...['years','suppliers','thicknesses','collar-pants-types','size-groups','barcode-schemes'], 'branches-unchanged'];
 for(const name of cases){
  const scope=context.createScope(name);let changes=0,reads=0;
  const changed=()=>changes++,denied=error=>{throw error;},read=async()=>{reads++;return {items:[],page:1,pageSize:20,total:0,exactTotal:0n};};
  const element=(kind,multiple=false)=>h(EditorChoice,{scope,reader:{readCandidates:read},kind,label:kind,value:multiple?['retained']:'retained',labels:new Map([['retained','保留名称']]),change:changed,disabled:false,multiple,denied});
  try{
   if(name==='branches-unchanged'){
    // Scope guard, not an endorsement of native tab behavior in these distinct controls.
    for(const [kind,multiple,selector] of [['seasons',true,'.arco-select'],['categories',false,'.arco-cascader']]){
     root=createRoot(host);const rendered=element(kind,multiple);await act(async()=>root.render(rendered));await settle();
     const view=deep('[role="combobox"]')[0];assert.ok(view,kind+' actual combobox exists');assert.ok(view.matches(selector),kind+' retains its original component branch');
     const prior=view.tabIndex;assert.equal(prior,0,kind+' original wrapper is tabbable');
     await act(async()=>view.focus());await settle();assert.equal(view.tabIndex,prior,kind+' must not receive the single-Select tab-stop adapter');
     assert.equal(changes,0,'branch focus cannot change value');assert.equal(reads,0,'branch focus alone must not query');
     await act(async()=>root.unmount());root=null;
    }
   }else{
    root=createRoot(host);const rendered=element(name);await act(async()=>root.render(rendered));await settle();
    const view=deep('[role="combobox"]')[0];assert.ok(view,name+' actual Select exists');await act(async()=>view.focus());await settle();
    const input=view.querySelector('input');assert.ok(input);assert.equal(view.getRootNode().activeElement,input,name+' focuses actual input');assert.equal(view.tabIndex,-1,name+' wrapper must not trap reverse Tab');assert.equal(input.tabIndex,0,name+' input remains tabbable');
    assert.equal(changes,0,'focus cannot select/change business value');assert.equal(reads,0,'closed focus alone must not query');
    await act(async()=>root.render(rendered));await settle();assert.equal(view.tabIndex,-1,'stable rerender preserves one tab stop');
   }
   console.log('PASS DOM editor',name);
  }catch(error){failures.push({name,error});console.error('FAIL DOM editor',name,error.message);}
  finally{if(root){await act(async()=>root.unmount());root=null;}scope.dispose();}
 }

 if(failures.length)throw new AggregateError(failures.map(item=>item.error),failures.map(item=>item.name).join(', '));
 console.log('PASS six EditorChoice single-focus contracts and unchanged multiple/Cascader branch guard; not native Tab/browser acceptance.');
}finally{if(root)await act(async()=>root.unmount());dom.window.close();await rm(temp,{recursive:true,force:true});}
