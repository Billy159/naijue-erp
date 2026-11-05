import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
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
 const {ProposalTrigger,ProposalPopup}=await import(pathToFileURL(output).href),host=document.getElementById('root');
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
 // jsdom has no layout. Supply the fixed 1440x1000 viewport and a bottom-row
 // anchor, while retaining real Arco positioning and the source menu CSS. This
 // checks the containing-block regression; headed click/scroll remains QF's job.
 const css=await readFile(path.join(here,'../../styles/shared/surface-controls.css'),'utf8');
 const style=document.createElement('style');style.textContent=css.split('\n').filter(line=>line.startsWith('.mx-spec-menu')).join('\n');document.head.append(style);
 Object.defineProperty(document.documentElement,'clientHeight',{configurable:true,value:1000});Object.defineProperty(document.documentElement,'clientWidth',{configurable:true,value:1440});
 const proto=HTMLElement.prototype,originalRect=proto.getBoundingClientRect,originalRects=proto.getClientRects,originalHeight=Object.getOwnPropertyDescriptor(proto,'offsetHeight'),originalWidth=Object.getOwnPropertyDescriptor(proto,'offsetWidth');
 Object.defineProperty(host,'scrollHeight',{configurable:true,value:1200});
 let anchorTop=846;
 const rect=(x,y,width,height)=>({x,y,left:x,top:y,width,height,right:x+width,bottom:y+height,toJSON(){return this;}});
 proto.getBoundingClientRect=function(){if(this.hasAttribute('data-bottom-trigger'))return rect(728,anchorTop,70,32);return originalRect.call(this);};
 proto.getClientRects=function(){return this.hasAttribute('data-bottom-trigger')?[this.getBoundingClientRect()]:originalRects.call(this);};
 Object.defineProperty(proto,'offsetHeight',{configurable:true,get(){const menu=this.matches('.mx-spec-menu')?this:this.querySelector('.mx-spec-menu');if(menu)return this===menu||getComputedStyle(menu).position!=='fixed'?288:0;return this.hasAttribute('data-bottom-trigger')?32:0;}});
 Object.defineProperty(proto,'offsetWidth',{configurable:true,get(){return this.matches('.mx-spec-menu')||this.querySelector('.mx-spec-menu')?250:this.hasAttribute('data-bottom-trigger')?70:0;}});
 try{
  const sizes=['160/XS','165/S','170/M','175/L','180/XL','185/2XL','190/3XL','195/4XL','200/5XL','205/6XL','无尺码'].map((name,i)=>({id:'size-'+i,name}));let chosen=null;
  const session={getSnapshot:()=>({sizeGroups:{groups:[{sizes}]}}),closePicker(){}};
  function BottomHarness(){const [visible,setVisible]=useState(false);return createElement(ProposalTrigger,{spec:true,visible,close:()=>setVisible(false),popup:()=>createElement(ProposalPopup,{session,picker:{phase:'ready'},spec:'size',selection:{},choose:id=>{chosen=id;setVisible(false);}})},createElement('button',{'data-bottom-trigger':true,'aria-expanded':visible,onClick:()=>setVisible(v=>!v)},'尺码'));}
  root=createRoot(host);await act(async()=>root.render(createElement(BottomHarness)));const trigger=host.querySelector('[data-bottom-trigger]');await act(async()=>trigger.click());await settle();
  const menu=document.querySelector('.mx-spec-menu');assert.equal(getComputedStyle(menu).position,'relative','menu must contribute height to its actual Arco positioning wrapper');assert.equal(menu.style.width,'100%');assert.equal(document.querySelectorAll('[data-mx-spec-option]').length,11);
  const popup=menu.closest('.arco-trigger');assert.ok(popup,'real Arco popup wrapper');assert.ok(parseFloat(popup.style.top)<anchorTop,'actual Arco must flip full-height menu above bottom anchor: '+popup.getAttribute('style'));
  const oldTop=parseFloat(popup.style.top);anchorTop=700;await act(async()=>host.dispatchEvent(new Event('scroll')));await settle();assert.ok(parseFloat(popup.style.top)<oldTop,'scroll must reposition the open spec menu');
  await key(trigger,'ArrowUp');let options=[...document.querySelectorAll('[role=option]')];assert.equal(document.activeElement,options.at(-1));await key(options.at(-1),'ArrowUp');assert.equal(document.activeElement,options.at(-2));await key(options.at(-2),'Escape');assert.equal(document.activeElement,trigger);assert.equal(chosen,null);
  await act(async()=>trigger.click());await settle();options=[...document.querySelectorAll('[role=option]')];await act(async()=>options[7].click());await settle();assert.equal(chosen,'size-7');assert.equal(trigger.getAttribute('aria-expanded'),'false');
  console.log('PASS bottom-row 11-size actual ProposalPopup/Arco: in-flow height, upward placement, scroll reposition, keyboard/Escape and 195/4XL pointer handler (jsdom geometry; headed reachability untested)');
 }finally{if(root){await act(async()=>root.unmount());root=null;}proto.getBoundingClientRect=originalRect;proto.getClientRects=originalRects;Object.defineProperty(proto,'offsetHeight',originalHeight);Object.defineProperty(proto,'offsetWidth',originalWidth);style.remove();}
}finally{if(root)await act(async()=>root.unmount());dom.window.close();await rm(temp,{recursive:true,force:true});}
