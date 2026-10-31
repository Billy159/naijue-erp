/** TEST ONLY: original payment HTTP/service + one bounded serial synthetic UOW.
 * No listener, PG, credential, production fallback or alternate business API. */
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {createPaymentMaintenanceHttpPlugin} from '../../../api/src/payment-maintenance-http.ts';
import {requireDomain} from '../../../../packages/domain/src/errors.ts';
import {qaMethods,qaPaymentAccounts,qaHalls,qaPrincipal,QA_REFERENCE_PROFILE} from '../frontend/qa-reference-fixtures.mts';
import {createSettingsPreviewTransport} from '../frontend/runtime/settings/synthetic-preview-transport.ts';
export async function createPaymentMaintenanceFixture(){
 let rows=new Map([...qaMethods.map(r=>[r.id,{kind:'PAYMENT_METHOD',id:r.id,name:r.name,enabled:r.enabled,version:r.version}]),...qaPaymentAccounts.map(r=>[r.id,{kind:'PAYMENT_ACCOUNT',id:r.id,name:r.name,enabled:r.enabled,version:r.version,paymentMethodId:r.paymentMethod.id,hallIds:r.halls.map(h=>h.id)}])]);
 let receipts=new Map(),audit=[],tail=Promise.resolve(),sequence=990000,allowed=true,fault=false;
 const actor={accountId:qaPrincipal.accountId,hallId:qaPrincipal.hallId},key=(account,kind,requestKey)=>JSON.stringify([account,kind,requestKey]);
 const authorize=(context,kind,action)=>requireDomain(allowed&&context.accountId===actor.accountId&&['PAYMENT_METHOD','PAYMENT_ACCOUNT'].includes(kind)&&['CREATE','EDIT','DISABLE','RESTORE','RECEIPT'].includes(action),'FORBIDDEN','Synthetic payment maintenance scope only');
 const dependencies={now:()=> '2026-10-31T00:00:00Z',newId:kind=>{assert.ok(['paymentMethod','paymentAccount','operation'].includes(kind));return `00000000-0000-4000-8000-${String(sequence++).padStart(12,'0')}`;},unitOfWork:{transaction(work){const result=tail.then(async()=>{
  const nextRows=structuredClone(rows),nextReceipts=structuredClone(receipts),nextAudit=structuredClone(audit);let prepared;
  const value=await work({evidence:{async assertAllowed(context,kind,action){authorize(context,kind,action);},async getReceipt(accountId,requestKey,kind){authorize({accountId},kind,'RECEIPT');return structuredClone(nextReceipts.get(key(accountId,kind,requestKey)));},async prepare(c){assert.equal(prepared,undefined);prepared=structuredClone(c);},async complete(c){assert.deepEqual(c,prepared);assert.equal(nextRows.get(c.targetId)?.version,c.newVersion);if(fault)throw Error('SYNTHETIC_PAYMENT_COMPLETE_FAULT');const k=key(c.actorAccountId,c.kind,c.requestKey);assert.equal(nextReceipts.has(k),false);const result={operationId:c.operationId,kind:c.kind,targetId:c.targetId,version:c.newVersion};nextReceipts.set(k,{result,requestHash:c.requestHash,action:c.action,completedAt:c.completedAt});nextAudit.push(structuredClone(c));return result;}},
   async load(kind,id){const row=nextRows.get(id);return row?.kind===kind?structuredClone(row):undefined;},
   async validateChange(previous,next){if(next.kind==='PAYMENT_ACCOUNT'){const method=nextRows.get(next.paymentMethodId);requireDomain(method?.kind==='PAYMENT_METHOD'&&method.enabled,'PAYMENT_REFERENCE_UNAVAILABLE','Enabled synthetic method required');requireDomain(next.hallIds.every(id=>qaHalls.some(h=>h.id===id)),'PAYMENT_REFERENCE_UNAVAILABLE','Unknown synthetic hall');}},
   async put(previous,next){assert.ok(prepared);assert.equal(prepared.targetId,next.id);assert.equal(nextRows.get(next.id)?.version,previous?.version);nextRows.set(next.id,structuredClone(next));}});
  rows=nextRows;receipts=nextReceipts;audit=nextAudit;return value;
 });tail=result.then(()=>{},()=>{});return result;}}};
 const reads=createSettingsPreviewTransport(QA_REFERENCE_PROFILE,kind=>{
  if(!['PAYMENT_METHOD','PAYMENT_ACCOUNT'].includes(kind))return undefined;
  return [...rows.values()].filter(r=>r.kind===kind).map(r=>({kind,id:r.id,name:r.name,enabled:r.enabled,version:r.version,createdAt:null,updatedAt:null,...(kind==='PAYMENT_ACCOUNT'?{paymentMethod:{id:r.paymentMethodId,name:rows.get(r.paymentMethodId).name,enabled:rows.get(r.paymentMethodId).enabled},halls:r.hallIds.map(id=>{const h=qaHalls.find(h=>h.id===id);return {id,name:h.name,enabled:h.enabled};})}:{})}));
 });
 const app=Fastify({logger:false});app.register(createPaymentMaintenanceHttpPlugin({authenticate:async()=>actor,dependencies}));await app.ready();
 return {actor,dependencies,revoke(){allowed=false;},failCompletion(value=true){fault=value;},snapshot(){return structuredClone({rows,receipts,audit});},async close(){await app.close();},
  canHandle(path,method){return method==='POST'&&/^\/api\/payment\/(?:methods|accounts)\/(?:commands|query|detail\/query)$/.test(path)||method==='GET'&&/^\/api\/payment\/(?:methods|accounts)\/receipts\/[^/]+$/.test(path);},
  async request(request){const url=new URL(request.url),method=request.method??'GET';assert.equal(url.origin,'https://synthetic-management.invalid');assert.ok(this.canHandle(url.pathname,method));
   if(url.pathname.endsWith('/query')){try{authorize(actor,url.pathname.includes('/methods/')?'PAYMENT_METHOD':'PAYMENT_ACCOUNT','RECEIPT');}catch{return {status:403,headers:{'content-type':'application/json'},body:JSON.stringify({error:{code:'FORBIDDEN',message:'Synthetic payment scope revoked'}})};}const response=await reads.request(url,{method,body:request.body,headers:request.headers});return {status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()};}
   const response=await app.inject({method,url:url.pathname.slice(4)+url.search,headers:request.headers,payload:request.body});return {status:response.statusCode,headers:response.headers,body:response.body};
  }};
}
