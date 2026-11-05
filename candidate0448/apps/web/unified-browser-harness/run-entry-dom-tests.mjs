import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {JSDOM} from 'jsdom';
import {buildUnifiedHarness} from './build.mjs';
const temporary=await mkdtemp(path.join(os.tmpdir(),'unified-entry-'));
let dom;
try{
 const built=await buildUnifiedHarness({outdir:temporary});dom=new JSDOM(await readFile(built.filename,'utf8'),{url:'https://synthetic-management.invalid/',runScripts:'outside-only',pretendToBeVisual:true});const{window:w}=dom,d=w.document;
 for(const key of ['Response','Request','Headers','AbortController','AbortSignal','TextEncoder','TextDecoder'])w[key]=globalThis[key];
 // Plain JSON DTOs only; preserve browser realm for strict native object validators.
 w.structuredClone=w.eval('(value)=>JSON.parse(JSON.stringify(value))');w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.matchMedia=query=>({matches:false,media:query,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){const wasOpen=this.hasAttribute('open');this.removeAttribute('open');if(wasOpen){d.body.tabIndex=-1;d.body.focus();}};
 let network=0;w.fetch=async()=>{network++;throw new Error('No actual fetch permitted');};const errors=[];w.addEventListener('error',event=>errors.push(event.error??event.message));
 const script=d.scripts[0];assert.equal(d.scripts.length,1);w.eval(script.textContent.replaceAll('import.meta.url',JSON.stringify('https://synthetic-management.invalid/synthetic-unified.html')));
 const until=async(test,label)=>{for(let i=0;i<160;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,20));}assert.ok(test(),label);};
 await until(()=>d.querySelector('.auth-form input[type=password]')?.disabled,'Fixture disables password before use');assert.equal(d.getElementById('unified-entry').hidden,false);assert.equal(d.getElementById('unified-root').hidden,true);assert.equal(d.querySelector('.unified-debug').open,false);
 d.getElementById('enter').click();await until(()=>!d.getElementById('unified-root').hidden&&d.querySelector('.demo-frame'),'Single explicit enter opens actual Application');assert.equal(d.getElementById('unified-entry').hidden,true);assert.equal(d.querySelectorAll('.demo-frame').length,1);
 for(const label of ['库存状况表','销货单列表','调拨单列表','客户','供应商','商品信息','商品分类','商品设置','条码方案'])assert.ok([...d.querySelectorAll('a.nav')].some(el=>el.textContent===label),label);
 [...d.querySelectorAll('a.nav')].find(el=>el.textContent==='商品信息').click();await until(()=>d.querySelectorAll('.pm-products tbody tr').length===100,'Actual bundle and inline CSS transport mount product page');assert.equal(d.querySelector('.unified-debug').open,false);assert.equal(d.querySelectorAll('iframe').length,0);assert.equal(network,0);assert.deepEqual(errors,[]);
 d.getElementById('revoke').click();await until(()=>d.getElementById('unified-root').hidden&&!d.getElementById('unified-entry').hidden,'Identity revocation returns same passwordless entry');assert.equal(d.querySelector('.demo-frame'),null);assert.equal(network,0);
 w.dispatchEvent(new w.Event('pagehide'));console.log('PASS final single-HTML entry DOM: actual bundled script parses, one explicit enter, nine source menu routes, one actual app/frame, closed synthetic products read, folded debug and revoke; global fetch = 0. Not browser/visual acceptance.');
}finally{dom?.window.close();await rm(temporary,{recursive:true,force:true});}
