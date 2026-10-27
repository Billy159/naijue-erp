import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.picker-keys-'));
const dom=new JSDOM('<div id="root"></div>',{url:'https://keyboard.test',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});dom.window.matchMedia=media=>({matches:false,media,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {act,createElement,useState}=await import('react'),{createRoot}=await import('react-dom/client');let root;
try{
 const output=path.join(temp,'picker.mjs');await build({entryPoints:[path.join(here,'proposal-picker.tsx')],outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'no-product-preview-read',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({loader:'js',contents:'export default '+JSON.stringify('')+';'}));b.onLoad({filter:/products\/preview\.tsx$/},()=>({loader:'tsx',contents:'export const ProductCandidatePreview=()=>null;'}));}}]});
 const {ProposalTrigger}=await import(pathToFileURL(output).href),host=document.getElementById('root');
 const settle=async()=>{for(let i=0;i<3;i++)await act(async()=>{await new Promise(r=>setTimeout(r,15));});};
 const key=async(el,key)=>{await act(async()=>el.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})));await settle();};
 for(const label of ['调拨颜色','调拨版型','销售颜色','销售版型','销售尺码']){
  let chosen='',closeCount=0;const draft={quantity:'-2',price:'200',spec:'original'};
  function Harness(){const [visible,setVisible]=useState(false);return createElement(ProposalTrigger,{spec:true,visible,close:()=>{closeCount++;setVisible(false);},popup:()=>createElement('div',{role:'listbox'},['甲','乙'].map(name=>createElement('button',{key:name,role:'option',onClick:()=>{chosen=name;setVisible(false);}},name)))},createElement('button',{'data-trigger':true,'aria-label':label,'aria-expanded':visible,onClick:()=>setVisible(v=>!v),onKeyDown:e=>{if(['Enter',' ','ArrowDown'].includes(e.key)){e.preventDefault();setVisible(false);setVisible(true);}}},label));}
  root=createRoot(host);await act(async()=>root.render(createElement(Harness)));const trigger=host.querySelector('[data-trigger]');trigger.focus();
  await act(async()=>trigger.click());await settle();assert.equal(document.activeElement,trigger);assert.ok(document.querySelector('[role=listbox]'),'real Arco Portal mounted');
  await key(trigger,'Escape');assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(document.activeElement,trigger);assert.equal(chosen,'');assert.equal(closeCount,1);assert.deepEqual(draft,{quantity:'-2',price:'200',spec:'original'});
  await key(trigger,'ArrowDown');let options=[...document.querySelectorAll('[role=option]')];assert.equal(document.activeElement,options[0]);await key(options[0],'ArrowDown');assert.equal(document.activeElement,options[1]);await key(options[1],'ArrowUp');assert.equal(document.activeElement,options[0]);
  await key(options[0],'Escape');assert.equal(document.activeElement,trigger);assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(chosen,'');
  await key(trigger,'ArrowUp');options=[...document.querySelectorAll('[role=option]')];assert.equal(document.activeElement,options.at(-1));await key(options.at(-1),'Enter');assert.equal(chosen,'乙');assert.equal(trigger.getAttribute('aria-expanded'),'false');
  trigger.focus();await key(trigger,'Enter');options=[...document.querySelectorAll('[role=option]')];assert.equal(document.activeElement,options[0]);await act(async()=>options[0].click());await settle();assert.equal(chosen,'甲');assert.equal(trigger.getAttribute('aria-expanded'),'false');
  await act(async()=>root.unmount());root=null;console.log('PASS '+label+': trigger/option Escape, focus return, ArrowDown/Up, Enter and pointer using actual Arco Portal');
 }
}finally{if(root)await act(async()=>root.unmount());dom.window.close();await rm(temp,{recursive:true,force:true});}
