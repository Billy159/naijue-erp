// Explicit ROOT-RUNTIME provider. Preparation source only; NOT imported/executed here.
// Original TransferService + Fastify memory transaction fixture, not PG or production auth.
import path from 'node:path';
import {realpath} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const ORIGIN='https://synthetic-management.invalid';
const own=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const refusal=(status,code)=>new Response(JSON.stringify({error:{code,message:'Explicit isolated transfer responsibility provider rejected this route.'}}),{status,headers:{'content-type':'application/json','x-data-source':'SYNTHETIC-ORIGINAL-TRANSFER-SERVICE-MEMORY-NOT-PG'}});
export async function createTransferResponsibilityTransport({sourceRoot}){
 if(!path.isAbsolute(sourceRoot??''))throw Error('Explicit absolute reviewed sourceRoot required');
 const source=await realpath(sourceRoot),from=relative=>import(pathToFileURL(path.join(source,relative)).href);
 const [fixtureModule,readonlyModule,qa]=await Promise.all([from('apps/web/demo-replica/tests/transfer-chain-fixture.mjs'),from('apps/web/demo-replica/frontend/runtime-preview-transport.ts'),from('apps/web/demo-replica/frontend/qa-reference-fixtures.mts')]);
 const chain=await fixtureModule.createTransferChainFixture({responsibleStaffValidation:true});
 try{
  if(chain.responsibilityProfile!=='FINITE_QA_STAFF_SQL_BOUNDARY_MEMORY_V1')throw Error('Paired source fixture lacks reviewed opt-in responsible validation; apply the fixture candidate first');
  const identity=chain.snapshot().identities.get(qa.qaPrincipal.accountId);
  if(chain.actor.accountId!==qa.qaPrincipal.accountId||identity?.staffId!==qa.qaPrincipal.staffId||identity?.role!=='ADMIN'||qa.qaStaff.find(row=>row.id===identity.staffId)?.account?.id!==identity.accountId)throw Error('Original finite QA account/staff graph mismatch');
  const readonly=readonlyModule.createReplicaPreviewTransport();
  if(readonly.http.origin!==ORIGIN)throw Error('Original readonly provider origin mismatch');
  const actualResponse=result=>new Response(result.body,{status:result.status,headers:result.headers});
  const fetch=async(input,init={})=>{
   const url=new URL(String(input)),method=init.method??'GET',signal=init.signal,active=()=>{if(signal?.aborted)throw new DOMException('Original synthetic read aborted','AbortError');};active();
   if(url.origin!==ORIGIN||url.username||url.password||url.hash||!url.pathname.startsWith('/api/')||init.credentials!=='same-origin')return refusal(403,'FORBIDDEN');
   const current=chain.snapshot().identities.get(qa.qaPrincipal.accountId);
   if(!current?.loginEnabled||current.staffId!==qa.qaPrincipal.staffId||current.role!=='ADMIN')return refusal(403,'FORBIDDEN');
   const pathname=url.pathname;
   if(method==='POST'&&pathname==='/api/transfers/commands'){
    let command;try{command=JSON.parse(String(init.body));}catch{return refusal(400,'INVALID_TRANSFER_COMMAND');}
    if(!own(command)||command.action!=='SAVE'||!(command.expectedVersion===null||Number.isSafeInteger(command.expectedVersion)&&command.expectedVersion>=1))return refusal(501,'RESPONSIBILITY_PROFILE_SAVE_ONLY');
    // No command/body rewriting: original HTTP parser, CAS, policy, preparation,
    // transaction, audit and receipt remain the only mutation authority.
    const response=actualResponse(await chain.request({url:url.href,method,headers:Object.fromEntries(new Headers(init.headers)),body:String(init.body)}));active();return response;
   }
   if(chain.canHandle(pathname,method)){
    const response=actualResponse(await chain.request({url:url.href,method,headers:Object.fromEntries(new Headers(init.headers)),...(init.body===undefined?{}:{body:String(init.body)})}));active();return response;
   }
   const reads=method==='POST'&&pathname.endsWith('/query')||method==='GET'&&(pathname==='/api/auth/session'||/^\/api\/(?:customers|suppliers)(?:\/(?:candidates|[0-9a-f-]{36}))?$/.test(pathname));
   // Never let an owned transfer document query fall through into QA preview
   // document storage. Only reference/warehouse reads may use the readonly port.
   if(pathname.startsWith('/api/transfers/')&&pathname!=='/api/transfers/warehouses/query')return refusal(501,'TRANSFER_SOURCE_ROUTE_UNAVAILABLE');
   if(!reads)return refusal(501,'READONLY_REFERENCE_PORT_ONLY');
   const response=await readonly.http.fetch(url.href,{...init,method,credentials:'same-origin'});active();return response;
  };
  return Object.freeze({sourceRoot:source,scope:'ORIGINAL_TRANSFER_HTTP_SERVICE_MEMORY_WITH_READONLY_QA_REFERENCES_NOT_PG',http:Object.freeze({origin:ORIGIN,basePath:'/api',fetch}),snapshot:()=>chain.snapshot(),revoke:()=>chain.revoke(),close:()=>chain.close()});
 }catch(error){await chain.close();throw error;}
}
