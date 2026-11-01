/** EXPLICIT SYNTHETIC test host. This file is not part of the pinned runtime. */
import {createReplicaSession,mountNormalReplica,createReplicaWorkbook} from '../../../../apps/web/demo-replica/frontend/runtime/entry.tsx';
import {configureReplicaStyleAssetBase,prepareReplicaCommonStyles,prepareReplicaStyles} from '../../../../apps/web/demo-replica/frontend/runtime-styles.ts';
import {parseProductionHostConfiguration} from '../../../../apps/web/src/production-host/configuration.ts';
import {inspectEditReady} from './readiness.mjs';
import {resolveObservedAction,isObservedTargetRoute,createObservationGate,summarizeReadPhases} from './action-boundary.mjs';

const match=/^\/(sales|transfer)\/(few|distinct30|lines200)$/.exec(location.pathname);
if(!match||location.hostname!=='127.0.0.1'||location.protocol!=='http:')throw Error('Explicit isolated loopback test profile required');
const kind=match[1] as 'sales'|'transfer',shape=match[2],prefix=`/profiles/${kind}/${shape}`,nativeFetch=window.fetch.bind(window);
const bootstrap=await nativeFetch(prefix+'/__bootstrap',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Synthetic bootstrap failed');return response.json();});
const output=document.querySelector<HTMLOutputElement>('#sample-state')!,sampleSelect=document.querySelector<HTMLSelectElement>('#sample-id')!,actionModeSelect=document.querySelector<HTMLSelectElement>('#action-mode')!,armButton=document.querySelector<HTMLButtonElement>('#arm-sample')!,gate=createObservationGate();
const calls:any[]=[],dictionaryGroups=new Set<string>();
let sample:any=null,armed:any=null,pendingTicket:any=null,checking=false,observationDeadline:ReturnType<typeof setTimeout>|null=null;
const status=(text:string)=>{output.textContent=text;};
const http={origin:'https://synthetic-opt00.invalid',basePath:'/api',fetch:async(input:string,init:RequestInit)=>{
  const url=new URL(input);if(url.origin!=='https://synthetic-opt00.invalid'||!url.pathname.startsWith('/api/'))throw Error('Closed test transport origin');
  const call:any={index:calls.length,endpoint:url.pathname.slice(4),started:performance.now(),body:init.body?JSON.parse(String(init.body)):null,phase:'pending'};calls.push(call);
  try{
    const response=await nativeFetch(prefix+url.pathname,{...init,cache:'no-store'});call.status=response.status;call.serverRequestId=response.headers.get('x-opt00-request-id');call.headersAt=performance.now();
    if(!response.body){call.phase='completed';call.completed=performance.now();return new Response(null,{status:response.status,headers:response.headers});}
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
    // Preserve the original reader's streamed body, status and limits. This
    // test adapter only counts actual received bytes; no response is fabricated.
    const body=new ReadableStream<Uint8Array>({async pull(controller){try{const part=await reader.read();if(part.done){call.phase='completed';call.completed=performance.now();call.bytes=bytes;
      if(call.endpoint==='/dictionary-read/size-groups/query'&&response.ok){const merged=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.length;}const page=JSON.parse(new TextDecoder().decode(merged));for(const group of page.items??[])dictionaryGroups.add(group.id);}
      controller.close();queueMicrotask(()=>{if(!response.ok)void failSample('Original HTTP '+response.status,'FAILED');else void checkReady();});return;}bytes+=part.value.byteLength;if(call.endpoint==='/dictionary-read/size-groups/query')chunks.push(part.value);controller.enqueue(part.value);}catch(error){call.phase='failed';controller.error(error);queueMicrotask(()=>{void failSample('Original streamed response failed','FAILED');});}},cancel(reason){call.phase='aborted';queueMicrotask(()=>{void failSample('Original stream cancelled','ABORTED');});return reader.cancel(reason);}});
    // A new Response has no transport URL; this is the existing explicit local
    // adapter pattern, not a relaxation of the original redirect guard.
    return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  }catch(error){call.phase=init.signal?.aborted?'aborted':'failed';call.completed=performance.now();queueMicrotask(()=>{void failSample('Original transport '+call.phase,call.phase==='aborted'?'ABORTED':'FAILED');});throw error;}
}};
const config=parseProductionHostConfiguration(JSON.parse(document.getElementById('naijue-erp-production-configuration')!.textContent!).configuration);
const session=createReplicaSession({...config.http,fetch:http.fetch});
configureReplicaStyleAssetBase(config.assets.basePath);
if(!location.hash)history.replaceState(null,'','#'+(kind==='sales'?'sales':'transfer'));
await prepareReplicaCommonStyles(new AbortController().signal);
const required=(selector:string)=>{const node=document.querySelector<HTMLElement>(selector);if(!node)throw Error('Missing canonical shell '+selector);return node;};
const owner=mountNormalReplica({session,routes:config.routes,newRequestKey:()=>crypto.randomUUID(),inventory:{ledgerDialog:document.getElementById('gold-drawer') as HTMLDialogElement,createWorkbook:createReplicaWorkbook},catalogue:{onChanged:()=>{}},page:required('#page'),accountHost:required('.basic-account'),app:required('.app'),breadcrumb:required('#breadcrumb'),transportMode:'approved-synthetic',prepareRoute:prepareReplicaStyles});
document.documentElement.removeAttribute('data-replica-starting');document.getElementById('replica-startup')?.remove();document.getElementById('replica-startup-style')?.remove();
status('首次场景：在原列表准备计时后点击目标单号或查看；不要预热编辑。暖修改为独立场景。');
const actionFor=(button:Element|null,mode:string)=>resolveObservedAction({root:document.getElementById('page'),button,kind,documentId:bootstrap.documentId,documentNumber:bootstrap.documentNumber,hash:location.hash,mode});
armButton.addEventListener('click',async()=>{const actionMode=actionModeSelect.value;if(![...document.querySelectorAll<HTMLButtonElement>('#page button')].some(button=>actionFor(button,actionMode))||calls.some(call=>call.phase==='pending')){status('等待目标原列表/只读单据及其读取完成；首次场景不得先进入编辑。');return;}const ticket=gate.begin(actionMode);if(!ticket){status('已有观测正在准备/运行；重复ARM未发送请求');return;}pendingTicket=ticket;armButton.disabled=true;try{
  const response=await nativeFetch(prefix+'/__sample/before',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({sampleId:sampleSelect.value,actionMode})});if(!response.ok)throw Error('Sample boundary rejected');
  armed={...await response.json(),clientCursor:calls.length,ticket};if(!gate.confirm(ticket,armed)){await failSample('Cancelled while ARM boundary was pending','ABORTED');return;}status(actionMode==='FIRST_LIST_OPEN'?'已验证同数据，点击原列表目标单号/查看开始实际计时':'暖修改：点击原只读页“修改”；不冒首次冷编辑');
}catch(error){gate.complete(ticket);status(String(error));}finally{pendingTicket=null;armButton.disabled=false;}});
document.addEventListener('click',event=>{const capturedAt=performance.now(),button=(event.target as Element)?.closest('button');if(!armed)return;const action=actionFor(button,armed.actionMode),ticket=gate.consume(action);if(!ticket)return;
  dictionaryGroups.clear();sample={sampleId:armed.sampleId,actionMode:armed.actionMode,action,ticket,resetBefore:armed,started:capturedAt,callCursor:calls.length,observedAt:new Date().toISOString(),finished:false};armed=null;status('计时中：原动作→全部原行/规格字典+帧就绪；包含全部detail请求');queueMicrotask(checkReady);
  observationDeadline=setTimeout(()=>{void failSample('OBSERVATION_DEADLINE_60000_MS; no edit-ready claim','FAILED');},60_000);
},true);
async function failSample(reason:string,terminal:'FAILED'|'ABORTED'){
  gate.cancel();const current=sample&&!sample.finished?sample:armed?{sampleId:armed.sampleId,actionMode:armed.actionMode,ticket:armed.ticket,callCursor:armed.clientCursor,started:null,observedAt:new Date().toISOString(),finished:false}:null;if(!current)return;
  current.finished=true;sample=current;armed=null;if(observationDeadline!==null)clearTimeout(observationDeadline);
  const evidence={format:'opt00-browser-host-raw-v2-A3',status:terminal,reason,sampleId:current.sampleId,actionMode:current.actionMode,action:current.action??null,kind,shape,profileSha256:bootstrap.profileSha256,logicalDataSha256:bootstrap.logicalDataSha256,observedAt:current.observedAt,started:current.started,editReadyMs:null,timingWindows:null,readyObservation:{ready:false,reason},actualCalls:calls.slice(current.callCursor),viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},realDatabaseTiming:null};
  try{const response=await nativeFetch(prefix+'/__sample/after',{method:'POST',cache:'no-store',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify(evidence)});if(!response.ok)throw Error('Terminal evidence receipt rejected');const receipt=await response.json();gate.complete(current.ticket);status(`${terminal}: ${reason}; ${receipt.path}; NO measured editReadyMs`);}catch(error){status(`${terminal}: ${reason}; terminal receipt failure: ${String(error)}`);}
}
document.getElementById('abort-sample')!.addEventListener('click',()=>{if(pendingTicket)gate.cancel();void failSample('Explicit harness observation cancellation; original business state not modified','ABORTED');});
async function checkReady(){
  if(checking||!sample||sample.finished)return;const current=sample;
  if(isObservedTargetRoute(kind,bootstrap.documentId,location.hash))current.targetEntered=true;else if(current.targetEntered||location.hash!==current.action.fromHash){await failSample('Native navigation left the exact observed document before ready','ABORTED');return;}
  const observation=inspectEditReady({document,kind,lines:bootstrap.lines,dictionaryGroupIds:[...dictionaryGroups],wantedGroupIds:bootstrap.wantedGroupIds,wantedSizeIds:bootstrap.wantedSizeIds,wantedGroups:bootstrap.wantedGroups});
  if(!current.targetEntered||!observation.ready||calls.slice(current.callCursor).some(call=>call.phase==='pending'))return;
  checking=true;try{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));if(sample!==current||current.finished)return;
    const final=inspectEditReady({document,kind,lines:bootstrap.lines,dictionaryGroupIds:[...dictionaryGroups],wantedGroupIds:bootstrap.wantedGroupIds,wantedSizeIds:bootstrap.wantedSizeIds,wantedGroups:bootstrap.wantedGroups});if(!isObservedTargetRoute(kind,bootstrap.documentId,location.hash)||!final.ready||calls.slice(current.callCursor).some(call=>call.phase!=='completed'||call.status!==200))return;
    const ready=performance.now();current.finished=true;if(observationDeadline!==null)clearTimeout(observationDeadline);const actualCalls=calls.slice(current.callCursor),timingWindows=summarizeReadPhases(actualCalls,current.started,ready,kind);const evidence={format:'opt00-browser-host-raw-v2-A3',status:'READY',sampleId:current.sampleId,actionMode:current.actionMode,action:current.action,kind,shape,profileSha256:bootstrap.profileSha256,logicalDataSha256:bootstrap.logicalDataSha256,observedAt:current.observedAt,started:current.started,ready,editReadyMs:ready-current.started,timingWindows,readyObservation:final,lines:bootstrap.lines,actualCalls,resourceEntries:performance.getEntriesByType('resource').map((entry:any)=>({name:entry.name,startTime:entry.startTime,duration:entry.duration,transferSize:entry.transferSize,encodedBodySize:entry.encodedBodySize,decodedBodySize:entry.decodedBodySize})),viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},cachePolicy:'client/server no-store; independent browser-context provenance requires external native-window evidence, never inferred from cold-1 label',mainThreadMs:null,realDatabaseTiming:null};
    const response=await nativeFetch(prefix+'/__sample/after',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(evidence)});if(!response.ok)throw Error('Raw evidence receipt failed');const receipt=await response.json();gate.complete(current.ticket);status(`RAW ${current.actionMode}/${current.sampleId}: ${evidence.editReadyMs.toFixed(1)}ms · ${evidence.actualCalls.length} HTTP请求 · receipt ${receipt.path}; 不是P95或PG性能验收`);
  }catch(error){status(String(error));}finally{checking=false;}
}
new MutationObserver(()=>{if(sample&&!sample.finished){const alert=[...document.querySelectorAll('#page [role="alert"]')].find(node=>node.textContent?.trim());if(alert){void failSample('Original page exposed an error before edit-ready','FAILED');return;}}void checkReady();}).observe(document.getElementById('page')!,{subtree:true,childList:true,attributes:true});
window.addEventListener('pagehide',()=>{void failSample('Application document hidden/unloaded before edit-ready','ABORTED');owner.dispose();},{once:true});
