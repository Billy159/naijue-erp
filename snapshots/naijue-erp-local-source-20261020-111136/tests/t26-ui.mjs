import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {build} from 'vite';
export async function verifyReferenceImportUI({suite,batch,actorId,inject}){
 const built=join(suite,'ui-assets');await build({configFile:fileURLToPath(new URL('../frontend/vite.reference-import.config.mjs',import.meta.url)),build:{outDir:built,emptyOutDir:false},logLevel:'silent'});
 const dom=new JSDOM('<!doctype html><html><body><button data-reference-import-open>必要资料导入</button></body></html>',{url:'https://t26.invalid',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,errors=[];
 w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));
 w.MASTER_DATA={current:()=>({id:actorId})};w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
 w.fetch=async(url,opts={})=>{const response=await inject(url,opts.method||'GET',opts.body?JSON.parse(opts.body):undefined,opts.headers||{});return {ok:response.statusCode<400,status:response.statusCode,json:async()=>response.json()};};
 w.eval(readFileSync(new URL('../frontend/service-client.js',import.meta.url),'utf8'));
 // Existing session reload obtains CSRF through the actual client before the modal runs.
 await w.ERP_API.request('/runtime/session');
 w.eval(readFileSync(join(built,'reference-import.bundle.js'),'utf8'));
 const shadow=w.document.getElementById('reference-import-host').shadowRoot;
 const wait=async(fn)=>{const end=Date.now()+10000;while(!fn()){if(Date.now()>end)throw new Error('UI wait timed out: '+shadow.textContent.slice(-1200));await new Promise(r=>setTimeout(r,10));}};
 const click=text=>{const b=[...shadow.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(text));assert(b,'button '+text);assert(!b.disabled,'enabled '+text);b.click();};
 try{w.document.querySelector('[data-reference-import-open]').click();await wait(()=>shadow.querySelector('input[type=file]'));
 const upload=shadow.querySelector('input[type=file]');Object.defineProperty(upload,'files',{value:[{size:JSON.stringify(batch).length,text:async()=>JSON.stringify(batch)}],configurable:true});upload.dispatchEvent(new w.Event('change',{bubbles:true}));
 await wait(()=>w.REFERENCE_IMPORT.state.batch);click('预检资料');await wait(()=>w.REFERENCE_IMPORT.state.preview&&!w.REFERENCE_IMPORT.state.busy);
 assert(shadow.textContent.includes('资料类型不支持'));assert(shadow.textContent.includes(batch.source.name));assert.equal(w.REFERENCE_IMPORT.state.selected.length,1);
 const submit=[...shadow.querySelectorAll('button')].find(b=>b.textContent.includes('确认提交'));assert(submit.disabled,'explicit confirmation required');
 const confirmation=[...shadow.querySelectorAll('label')].find(l=>l.textContent.includes('已核对选中行'));assert(confirmation);confirmation.click();await wait(()=>!submit.disabled);click('确认提交');await wait(()=>w.REFERENCE_IMPORT.state.result&&!w.REFERENCE_IMPORT.state.busy);
 assert(shadow.textContent.includes('已提交'));assert.deepEqual(Array.from(w.REFERENCE_IMPORT.state.result.rows,r=>r.status),['COMMITTED','FAILED']);
 assert.equal(w.ERP_API.pending().length,0);assert.deepEqual(errors,[]);
 return {status:'PASS',driver:'JSDOM actual built Arco modal + real service-client + private QA API',sourceVisible:true,failureVisible:true,confirmationRequired:true,rows:['COMMITTED','FAILED'],busyCleared:true,errors};
 }finally{w.close();}
}
