import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { FastifyInstance } from 'fastify';
// Explicit route templates only: never copy paths containing IDs into diagnostics.
const readRoutes=new Set([
 '/accounts/receipts/:requestKey',
 '/catalogue-settings-read/categories/query',
 '/catalogue-settings-read/colors/query',
 '/catalogue-settings-read/fits/query',
 '/current-form/barcode/query',
 '/current-form/product-skus/query',
 '/current-form/products/query',
 '/current-form/sales-references/query',
 '/current-form/sku-batch/query',
 '/current-form/transfer-warehouses/query',
 '/dictionary-read/barcode-scheme/query',
 '/dictionary-read/barcode-schemes/query',
 '/dictionary-read/seasons/query',
 '/dictionary-read/size-groups/query',
 '/inventory/candidates/query',
 '/inventory/ledger/query',
 '/inventory/output/query',
 '/inventory/query',
 '/product-management/candidates/query',
 '/product-management/query',
 '/products/barcodes/query',
 '/products/basics/query',
 '/products/image/query',
 '/products/images/query',
 '/products/maintenance/candidates/query',
 '/products/maintenance/detail/query',
 '/products/maintenance/images/query',
 '/products/maintenance/v2/detail/query',
 '/products/prices/query',
 '/products/receipts/:requestKey',
 '/products/specifications/query',
 '/products/stock-overview/query',
 '/products/stock/query',
 '/sales/detail/query',
 '/sales/history/query',
 '/sales/query',
 '/sales/receipts/:requestKey',
 '/sales/references/query',
 '/sales/settlement-statistics/query',
 '/settings/audit/query',
 '/staff/receipts/:requestKey',
 '/transfers/detail/query',
 '/transfers/history/query',
 '/transfers/query',
 '/transfers/receipts/:requestKey',
 '/transfers/warehouses/query',
 '/auth/session'
]);
const routes=new Set([...readRoutes,'/auth/login','/auth/logout','/auth/change-password','/sales/commands','/transfers/commands','/products/commands','/product-maintenance/commands','/staff/commands','/accounts/commands','/products/v2/commands','/healthz','/readyz']);
const codes=new Set(['UNAUTHENTICATED','FORBIDDEN','NOT_FOUND','INTERNAL_ERROR','CAPACITY_ADMISSION_UNAVAILABLE','LOGIN_ADMISSION_BUSY','PASSWORD_WORK_BUSY','PG_POOL_OVERLOADED','PG_POOL_CLOSED','PG_ACQUIRE_TIMEOUT','PG_ACQUIRE_FAILED','PG_CLIENT_CLOSED','PG_QUERY_IN_PROGRESS','PG_QUERY_FAILED','PG_RELEASE_FAILED','PRODUCT_MANAGEMENT_READ_TIMEOUT','PRODUCT_MANAGEMENT_READ_ABORTED','PRODUCT_MANAGEMENT_STOCK_NOT_READY']);
export type DiagnosticStage='HOST_VALIDATION'|'AUTHENTICATION'|'VALIDATION'|'HANDLER'|'POOL_ACQUIRE'|'DB_QUERY'|'SERIALIZE'|'COMPLETE';
export interface RequestDiagnostic {readonly requestId:string;routeTemplate:string;operation:'READ'|'WRITE';stage:DiagnosticStage;errorCode:string|null;failureStage:DiagnosticStage|null;poolRejections:number;admissionRejections:number}
const contexts=new WeakMap<IncomingMessage,RequestDiagnostic>(),local=new AsyncLocalStorage<RequestDiagnostic>();
export function createRequestDiagnostic(request:IncomingMessage,requestId=randomUUID()):RequestDiagnostic{
 const value:RequestDiagnostic={requestId,routeTemplate:'OTHER',operation:request.method==='GET'||request.method==='HEAD'?'READ':'WRITE',stage:'HOST_VALIDATION',errorCode:null,failureStage:null,poolRejections:0,admissionRejections:0};
 const pathname=(request.url??'').split('?',1)[0]!.replace(/^\/api(?=\/|$)/,'')||'/';
 if(routes.has(pathname)){value.routeTemplate=pathname;if(readRoutes.has(pathname))value.operation='READ';}
 contexts.set(request,value);return value;
}
export function requestDiagnostic(request:IncomingMessage){return contexts.get(request);}
export function withRequestDiagnostic<T>(context:RequestDiagnostic,work:()=>T):T{return local.run(context,work);}
export function observeRequestStage(stage:DiagnosticStage,error?:unknown):void{
 const context=local.getStore();if(!context)return;context.stage=stage;
 if(error!==undefined){
  const descriptor=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'code'):undefined;
  const raw=descriptor&&'value'in descriptor?descriptor.value:undefined;
  const code=raw==='57014'?'DB_TIMEOUT':raw==='40P01'?'DB_DEADLOCK':typeof raw==='string'&&codes.has(raw)?raw:'UNKNOWN_FAILURE';
  if(!context.errorCode){context.errorCode=code;context.failureStage=stage;}
  // Per-request category indicators, not hook/event counts: propagated errors must not inflate totals.
  if(code==='PG_POOL_OVERLOADED'||code==='PG_ACQUIRE_TIMEOUT')context.poolRejections=1;
  if(code==='CAPACITY_ADMISSION_UNAVAILABLE'||code==='LOGIN_ADMISSION_BUSY'||code==='PASSWORD_WORK_BUSY')context.admissionRejections=1;
 }
}
export function installRequestDiagnostics(app:FastifyInstance):void{
 app.addHook('onRequest',(request,_reply,done)=>{
  const context=requestDiagnostic(request.raw)??createRequestDiagnostic(request.raw);
  const template=request.routeOptions.url;if(template && routes.has(template)){context.routeTemplate=template;if(readRoutes.has(template))context.operation='READ';}
  withRequestDiagnostic(context,()=>{observeRequestStage('AUTHENTICATION');done();});
 });
 app.addHook('preValidation',async()=>{observeRequestStage('VALIDATION');});
 app.addHook('preHandler',async()=>{observeRequestStage('HANDLER');});
 app.addHook('onError',async(_request,_reply,error)=>{observeRequestStage(local.getStore()?.stage??'HANDLER',error);});
 app.addHook('onSend',async(_request,_reply,payload)=>{
  // Only bounded error envelopes are inspected; never record payload or messages.
  if(typeof payload==='string'&&payload.length<=2048)try{const value=JSON.parse(payload);if(value?.error?.code)observeRequestStage(local.getStore()?.stage??'HANDLER',{code:value.error.code});}catch{/* Not an error envelope. */}
  observeRequestStage('SERIALIZE');return payload;
 });
}
