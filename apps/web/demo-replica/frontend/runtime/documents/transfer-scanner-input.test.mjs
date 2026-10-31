import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.scanner-input-'));
const dom=new JSDOM('<div id="root"></div><button id="anchor">扫码</button>',{url:'https://scanner.test',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','Node','Event','KeyboardEvent','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {act,createElement}=await import('react'),{createRoot}=await import('react-dom/client');let root;
try{
 const out=path.join(temp,'scanner.mjs');await build({entryPoints:[path.join(here,'transfer-scanner.tsx')],outfile:out,bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react-dom','react-dom/*']});
 const {default:Scanner}=await import(pathToFileURL(out).href);let enabled=false,calls=[];const snapshot={phase:'idle'},proposal={draft:{lines:[]}};
 const controller={subscribe:()=>()=>{},getSnapshot:()=>snapshot,scan:async code=>{calls.push(code);return true;},dispose(){}};
 const session={subscribe:()=>()=>{},getSnapshot:()=>proposal,get canScan(){return enabled;}};
 const props={session,controller,anchor:document.getElementById('anchor'),busy:false,close(){}};
 root=createRoot(document.getElementById('root'));await act(async()=>root.render(createElement(Scanner,props)));let input=document.getElementById('transfer-scan-input');assert.equal(input.disabled,false);
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'000123');input.dispatchEvent(new Event('input',{bubbles:true}));});
 const enter=()=>act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
 await enter();assert.deepEqual(calls,[]);assert.equal(input.value,'000123','missing warehouse does not lose pending raw barcode');
 enabled=true;await act(async()=>root.render(createElement(Scanner,{...props})));assert.equal(input.value,'000123');await enter();assert.deepEqual(calls,['000123']);assert.equal(input.value,'');
 console.log('PASS actual TransferScanner DOM: preinput without warehouses, no unauthorized scan, retained input after context ready, single scan then clear');
}finally{if(root)await act(async()=>root.unmount());dom.window.close();await rm(temp,{recursive:true,force:true});}
