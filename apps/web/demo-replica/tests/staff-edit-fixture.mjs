/** TEST ONLY: real application HTTP/service, bounded synthetic EDIT persistence.
 * No socket, database, credentials, access changes, or production fallback. */
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {createStaffMaintenanceHttpPlugin} from '../../../api/src/staff-maintenance-http.ts';
import {parseStaffMaintenanceCommand} from '../../../../packages/application/src/staff-maintenance-validation.ts';
import {requireDomain} from '../../../../packages/domain/src/errors.ts';
import {qaStaff,qaAccounts,qaPrincipal,QA_REFERENCE_PROFILE} from '../frontend/qa-reference-fixtures.mts';
import {createSettingsPreviewTransport} from '../frontend/runtime/settings/synthetic-preview-transport.ts';
export async function createStaffEditFixture(){
 let rows=new Map(qaStaff.map(s=>{const a=qaAccounts.find(a=>a.staff.id===s.id);return [s.id,{staff:{id:s.id,name:s.name,role:s.role,hallId:s.hall?.id??null,contact:s.contact,employmentStatus:s.employmentStatus,version:s.version},account:a?{id:a.id,staffId:s.id,loginName:a.loginName,loginEnabled:a.loginEnabled,authVersion:a.authVersion,version:a.version,createdAt:a.createdAt,updatedAt:a.updatedAt}:null}];}));
 let receipts=new Map(),audit=[],tail=Promise.resolve(),sequence=980000,allowed=true,fault=false;
 const actor={accountId:qaPrincipal.accountId,hallId:qaPrincipal.hallId};
 const key=(account,kind,requestKey)=>JSON.stringify([account,kind,requestKey]);
 const authorize=(context,kind,action)=>{const admin=[...rows.values()].find(row=>row.account?.id===context.accountId);requireDomain(allowed&&kind==='STAFF'&&['EDIT','RECEIPT'].includes(action)&&admin?.staff.role==='ADMIN'&&admin.staff.employmentStatus==='在职'&&admin.account.loginEnabled,'FORBIDDEN','Synthetic staff basic-edit scope only');};
 const dependencies={credentials:null,now:()=> '2026-10-29T00:00:00Z',newId:kind=>{assert.equal(kind,'operation');return `00000000-0000-4000-8000-${String(sequence++).padStart(12,'0')}`;},unitOfWork:{transaction(work){
  const result=tail.then(async()=>{
   const nextRows=structuredClone(rows),nextReceipts=structuredClone(receipts),nextAudit=structuredClone(audit);let prepared;
   const value=await work({evidence:{
    async assertAllowed(context,kind,action){requireDomain(context.hallId===qaPrincipal.hallId,'FORBIDDEN','Synthetic current hall mismatch');authorize(context,kind,action);},
    async getReceipt(accountId,requestKey,kind){authorize({accountId},kind,'RECEIPT');return structuredClone(nextReceipts.get(key(accountId,kind,requestKey)));},
    async prepare(completion){assert.equal(prepared,undefined);prepared=structuredClone(completion);},
    async complete(completion){assert.deepEqual(completion,prepared);assert.equal(nextRows.get(completion.targetId)?.staff.version,completion.newVersion);if(fault)throw Error('SYNTHETIC_COMPLETE_FAULT');
     const receiptKey=key(completion.actorAccountId,completion.kind,completion.requestKey);assert.equal(nextReceipts.has(receiptKey),false);
     const result={operationId:completion.operationId,kind:completion.kind,targetId:completion.targetId,version:completion.newVersion};
     nextReceipts.set(receiptKey,{result,requestHash:completion.requestHash,action:completion.action,completedAt:completion.completedAt});nextAudit.push(structuredClone(completion));return result;
    }
   },async load(id){return structuredClone(nextRows.get(id));},
   async validateChange(previous,next){requireDomain(previous&&previous.staff.id===next.staff.id&&previous.staff.role===next.staff.role&&previous.staff.hallId===next.staff.hallId&&previous.staff.employmentStatus===next.staff.employmentStatus,'FORBIDDEN','Only synthetic name/contact edits allowed');assert.deepEqual(previous.account,next.account);},
   async putStaff(previous,next){assert.ok(prepared);assert.equal(prepared.targetId,next.id);assert.equal(nextRows.get(next.id)?.staff.version,previous?.version);nextRows.set(next.id,{staff:structuredClone(next),account:nextRows.get(next.id).account});},
   async putAccount(){throw Error('Synthetic credential/access mutation prohibited');}});
   rows=nextRows;receipts=nextReceipts;audit=nextAudit;return value;
  });tail=result.then(()=>{},()=>{});return result;
 }}};
 const reads=createSettingsPreviewTransport(QA_REFERENCE_PROFILE,kind=>{
  if(kind==='STAFF')return qaStaff.map(seed=>{const row=rows.get(seed.id);return {...structuredClone(seed),...row.staff,hall:structuredClone(seed.hall),account:row.account?{id:row.account.id,loginName:row.account.loginName,loginEnabled:row.account.loginEnabled,authVersion:row.account.authVersion,version:row.account.version}:null};}).map(({hallId,...row})=>row);
  if(kind==='ACCOUNT')return qaAccounts.map(seed=>({...structuredClone(seed),staff:{...seed.staff,name:rows.get(seed.staff.id).staff.name}}));
  return undefined;
 });
 const app=Fastify({logger:false});app.register(createStaffMaintenanceHttpPlugin({authenticate:async()=>actor,dependencies}));await app.ready();
 return {dependencies,actor,revoke(){allowed=false;},failCompletion(){fault=true;},snapshot(){return structuredClone({rows,receipts,audit});},async close(){await app.close();},
  canHandle(path,method){return method==='POST'&&['/api/staff/commands','/api/staff/query','/api/staff/detail/query','/api/accounts/query','/api/accounts/detail/query'].includes(path)||method==='GET'&&path.startsWith('/api/staff/receipts/');},
  async request(request){const url=new URL(request.url),method=request.method??'GET';assert.equal(url.origin,'https://synthetic-management.invalid');assert.ok(this.canHandle(url.pathname,method));
   if(url.pathname==='/api/staff/commands'){
    // Scope restriction precedes actual service; malformed commands retain real parser/HTTP errors.
    try{const command=parseStaffMaintenanceCommand(JSON.parse(request.body));if(command.action!=='EDIT'||command.account!==null)return {status:403,headers:{'content-type':'application/json'},body:JSON.stringify({error:{code:'FORBIDDEN',message:'Synthetic basic staff edit only'}})};}catch{/* Real HTTP parser/service rejects malformed input below. */}
   }
   if(url.pathname.endsWith('/query')){try{authorize(actor,'STAFF','RECEIPT');}catch{return {status:403,headers:{'content-type':'application/json'},body:JSON.stringify({error:{code:'FORBIDDEN',message:'Synthetic identity no longer authorized'}})};}const response=await reads.request(url,{method,body:request.body,headers:request.headers});return {status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()};}
   const response=await app.inject({method,url:url.pathname.slice(4)+url.search,headers:request.headers,payload:request.body});return {status:response.statusCode,headers:response.headers,body:response.body};
  }};
}
