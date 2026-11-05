// DOM focus structure only; native keyboard evidence comes from remaining-tab-browser.py.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.editor-popup-exit-'));
const dom=new JSDOM('<div id="root"></div>',{url:'https://editor-popup-exit.test',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});dom.window.matchMedia=media=>({matches:false,media,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.innerWidth=1400;globalThis.innerHeight=900;globalThis.pageXOffset=0;globalThis.pageYOffset=0;HTMLElement.prototype.scrollTo=function(){};
const {act,createElement:h,useState}=await import('react'),{createRoot}=await import('react-dom/client');let root;
const deep=(selector,node=document)=>[...node.querySelectorAll(selector),...[...node.querySelectorAll('*')].flatMap(el=>el.shadowRoot?deep(selector,el.shadowRoot):[])];
const settle=async()=>act(async()=>{await new Promise(r=>setTimeout(r,50));});
try{
 const output=path.join(temp,'entry.mjs');await build({stdin:{contents:"export {EditorChoice} from '../products/editor-fields.tsx';export {ReadContext} from '../../../../src/loading/read-scope.ts';",resolveDir:here,loader:'tsx'},outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'css',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({loader:'js',contents:'export default "";'}));}}]});
 const {EditorChoice,ReadContext}=await import(pathToFileURL(output).href),host=document.getElementById('root');
 const context=new ReadContext({accountId:'synthetic',sessionRevision:'1',permissionRevision:'1'}),failures=[];
 for(const name of ['outside-exit','inside-footer-then-exit','pointer-option-selection','null-blur-option-selection']){
  const scope=context.createScope(name),changes=[],reads=[];
  const reader={readCandidates:async read=>{reads.push(read.parameters);return {items:[{id:'retained',name:'原值'},{id:'new',name:'新值'}],page:read.parameters.page,pageSize:20,total:60};}};
  function Harness(){const [value,setValue]=useState('retained');return h('div',null,h('button',{'data-before':true},'外部前置'),h(EditorChoice,{scope,reader,kind:'suppliers',label:'供应商',value,labels:new Map([['retained','原值'],['new','新值']]),change:ids=>{changes.push(ids);setValue(ids[0]??'');},disabled:false,denied:error=>{throw error;}}),h('button',{'data-after':true},'外部后置'),h('output',{'data-draft':true},value));}
  try{
   root=createRoot(host);await act(async()=>root.render(h(Harness)));await settle();
   const view=deep('[role="combobox"]')[0];assert.ok(view);
   await act(async()=>view.click());await settle();
   const input=view.querySelector('input');assert.ok(input);await act(async()=>input.focus());await settle();assert.equal(view.getAttribute('aria-expanded'),'true');assert.ok(reads.length);assert.equal(host.querySelector('[data-draft]').textContent,'retained');
   const outside=host.querySelector('[data-before]');
   if(name==='outside-exit'){
    await act(async()=>outside.focus());await settle();assert.equal(view.getAttribute('aria-expanded'),'false','actual outside focus closes popup');assert.equal(document.activeElement,outside,'close does not steal outside focus');assert.deepEqual(changes,[]);assert.equal(host.querySelector('[data-draft]').textContent,'retained');
    await act(async()=>view.click());await settle();assert.equal(view.getAttribute('aria-expanded'),'true','reopening remains available');await act(async()=>input.focus());await act(async()=>host.querySelector('[data-after]').focus());await settle();assert.equal(view.getAttribute('aria-expanded'),'false','repeated forward-side exit closes');
   }else if(name==='inside-footer-then-exit'){
    const next=deep('button').find(node=>node.textContent==='下一页');assert.ok(next);await act(async()=>next.focus());await settle();assert.equal(view.getAttribute('aria-expanded'),'true','own shadow-portal footer focus must not close popup');
    await act(async()=>next.click());await settle();assert.equal(reads.at(-1).page,2,'footer click still loads next page');assert.equal(view.getAttribute('aria-expanded'),'true');
    assert.ok(next.isConnected,'page-two footer must remain mounted before testing its blur');assert.equal(next.getRootNode().activeElement,next,'outside-focus test must actually start from the portal footer');
    await act(async()=>outside.focus());await settle();assert.equal(view.getAttribute('aria-expanded'),'false','outside focus from the portal footer also closes');assert.equal(document.activeElement,outside);assert.deepEqual(changes,[]);
   }else{
    if(name==='null-blur-option-selection'){await act(async()=>input.blur());await settle();assert.equal(view.getAttribute('aria-expanded'),'true','null-relatedTarget blur must not preempt option click');}
    const option=deep('.arco-select-option').find(node=>node.textContent==='新值');assert.ok(option);
    const down=new MouseEvent('mousedown',{bubbles:true,cancelable:true});await act(async()=>option.dispatchEvent(down));assert.equal(down.defaultPrevented,true,'installed Arco option list retains focus on mousedown');
    await act(async()=>{option.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true}));option.click();});await settle();
    assert.deepEqual(changes,[['new']],'one pointer choice changes exact ID once');assert.equal(host.querySelector('[data-draft]').textContent,'new');assert.equal(view.getAttribute('aria-expanded'),'false','normal single selection still dismisses popup');
   }
   console.log('PASS DOM editor popup',name);
  }catch(error){failures.push({name,error});console.error('FAIL DOM editor popup',name,error.message);}
  finally{if(root){await act(async()=>root.unmount());root=null;}scope.dispose();}
 }
 if(failures.length)throw new AggregateError(failures.map(item=>item.error),failures.map(item=>item.name).join(', '));
 console.log('PASS EditorChoice outside-focus dismissal and pointer/portal preservation. DOM only, not native Tab/browser acceptance.');
}finally{if(root)await act(async()=>root.unmount());dom.window.close();await rm(temp,{recursive:true,force:true});}
