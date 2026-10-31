// Limited synthetic adapter: formal service/HTTP, copy-on-write transactions.
// Only existing PRODUCT name/prices EDIT. Never production, PG, media or SKU generation.
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {createProductMaintenanceService} from '../../../../packages/application/src/product-maintenance-service.ts';
import {createProductMaintenanceHttpPlugin} from '../../../api/src/product-maintenance-http.ts';
import {requireDomain} from '../../../../packages/domain/src/errors.ts';
import {createReplicaPreviewTransport} from '../frontend/runtime-preview-transport.ts';
import {createProductEditorSeed,productEditorReferences} from './product-editor-read-fixture.mjs';
import {qaPrincipal,qaStaff,qaGroups,qaColors,qaFits,qaReferenceRead} from '../frontend/qa-reference-fixtures.mts';
export async function createProductEditFixture(){
 let rows=createProductEditorSeed(),receipts=new Map(),audit=[],tail=Promise.resolve(),allowed=true,fault=null,sequence=890000;
 const key=(actor,request)=>JSON.stringify([actor,request]);
 const authorize=(actor,kind,action)=>{const staff=qaStaff.find(s=>s.account.id===actor.accountId);requireDomain(allowed&&kind==='PRODUCT'&&['EDIT','DETAIL','CANDIDATES','RECEIPT'].includes(action)&&staff?.employmentStatus==='在职'&&staff.account.loginEnabled&&['ADMIN','WAREHOUSE'].includes(staff.role)&&actor.hallId===(staff.hall?.id??null),'FORBIDDEN','Limited synthetic product authority denied');};
 const unchanged=(a,b)=>{try{assert.deepEqual(a,b);}catch{requireDomain(false,'FORBIDDEN','Only existing synthetic product name/prices may change');}};
 const dependencies={now:()=> '2026-10-29T00:00:00Z',newId:kind=>{requireDomain(kind==='operation','FORBIDDEN','No new product/SKU/barcode IDs');return '00000000-0000-4000-8000-'+String(sequence++).padStart(12,'0');},unitOfWork:{seasonContract:'product-season-array-v1',transaction(work){const result=tail.then(async()=>{
  const nextRows=structuredClone(rows),nextReceipts=structuredClone(receipts),nextAudit=structuredClone(audit);let prepared,active=true,boundActor;
  const live=()=>assert.ok(active,'Transaction already closed');
  const tx={evidence:{async assertAllowed(actor,kind,action){live();authorize(actor,kind,action);if(boundActor)assert.deepEqual(boundActor,actor);else boundActor=structuredClone(actor);},async getReceipt(accountId,requestKey,kind){live();assert.equal(boundActor?.accountId,accountId);authorize(boundActor,kind,'RECEIPT');return structuredClone(nextReceipts.get(key(accountId,requestKey)));},async prepare(c){live();assert.equal(prepared,undefined);requireDomain(c.kind==='PRODUCT'&&c.action==='EDIT'&&nextRows.has(c.targetId),'FORBIDDEN','Only existing product edit');if(fault==='prepare')throw Error('SYNTHETIC_PREPARE_FAULT');prepared=structuredClone(c);},async complete(c){live();assert.deepEqual(c,prepared);assert.equal(c.actorAccountId,boundActor?.accountId);authorize(boundActor,'PRODUCT','EDIT');assert.equal(nextRows.get(c.targetId).product.version,c.newVersion);if(fault==='complete')throw Error('SYNTHETIC_COMPLETE_FAULT');const k=key(c.actorAccountId,c.requestKey);assert.equal(nextReceipts.has(k),false);const result={operationId:c.operationId,kind:c.kind,targetId:c.targetId,version:c.newVersion};nextReceipts.set(k,{requestHash:c.requestHash,action:c.action,completedAt:c.completedAt,result});nextAudit.push(structuredClone(c));return result;}},
   async assertPendingCapacity(c){live();requireDomain(nextReceipts.size<100&&Buffer.byteLength(JSON.stringify(c))<=1048576,'PRODUCT_EVIDENCE_CAPACITY_EXCEEDED','Bounded synthetic capacity');},
   async load(id){live();return structuredClone(nextRows.get(id));},async readReferences(p){live();return productEditorReferences(p);},async readCandidates(q){live();const response=qaReferenceRead('/products/maintenance/candidates/query',q);assert.ok(response);return response.json();},
   async readSkuSelectionSizes(id,groupId,selection){live();const current=nextRows.get(id);requireDomain(current?.product.sizeGroupId===groupId&&selection.colorIds.every(id=>qaColors.some(c=>c.id===id&&c.enabled))&&selection.fitIds.every(id=>qaFits.some(f=>f.id===id&&f.enabled)),'PRODUCT_REFERENCE_UNAVAILABLE','Finite actual synthetic references');const group=qaGroups.find(g=>g.id===groupId);requireDomain(group,'PRODUCT_REFERENCE_UNAVAILABLE','Unknown group');return group.sizes.map(s=>s.id);},
   async validateReferences(previous,next){live();requireDomain(previous,'FORBIDDEN','No product creation');const omit=p=>{const {name,prices,version,...rest}=p;return rest;};unchanged(omit(previous.product),omit(next.product));unchanged(previous.skus,next.skus);unchanged(previous.barcodes,next.barcodes);},
   async putProduct(next,previous){live();assert.ok(prepared);assert.equal(prepared.targetId,next.id);assert.equal(prepared.oldVersion,previous.version);assert.equal(prepared.newVersion,next.version);requireDomain(nextRows.get(next.id)?.product.version===previous.version,'VERSION_CONFLICT','Synthetic CAS');nextRows.set(next.id,{...nextRows.get(next.id),product:structuredClone(next)});},
   async putSku(){live();requireDomain(false,'FORBIDDEN','SKU writes outside limited scope');},async putBarcode(){live();requireDomain(false,'FORBIDDEN','Barcode writes outside limited scope');},
   async readImageSnapshot(id){live();const row=nextRows.get(id);return row?{productId:id,version:row.product.version,images:[]}:null;}
  };
  try{const value=await work(tx);rows=nextRows;receipts=nextReceipts;audit=nextAudit;return value;}finally{active=false;}
 });tail=result.then(()=>{},()=>{});return result;}}};
 const reads=createReplicaPreviewTransport();
 const readPaths=new Set(['/products/basics/query','/products/prices/query','/product-management/query']);
 const nativePaths=new Set(['/products/v2/commands','/products/maintenance/v2/detail/query','/products/maintenance/images/query','/products/maintenance/candidates/query']);
 const canHandle=(path,method)=>method==='POST'&&(nativePaths.has(path.slice(4))||readPaths.has(path.slice(4)))||method==='GET'&&/^\/api\/products\/receipts\/[0-9a-f-]{36}$/.test(path);
 const response=(status,body)=>({status,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const service=createProductMaintenanceService(dependencies),app=Fastify({logger:false});app.register(createProductMaintenanceHttpPlugin({authenticate:async()=>qaPrincipal,dependencies}));await app.ready();
 return {service,dependencies,revoke(){allowed=false;},fail(stage){fault=stage;},snapshot(){return structuredClone({rows,receipts,audit});},async close(){await app.close();},async inject(request){return app.inject(request);},canHandle,async request(request){
  const url=new URL(request.url),method=request.method??'GET';if(url.origin!=='https://synthetic-management.invalid'||!canHandle(url.pathname,method))return response(501,{error:{code:'SYNTHETIC_SCOPE_UNSUPPORTED',message:'Limited product fixture only'}});
  const path=url.pathname.slice(4);
  if(!readPaths.has(path)){const r=await app.inject({method,url:path+url.search,headers:request.headers,payload:request.body});return {status:r.statusCode,headers:r.headers,body:r.body};}
  try{authorize(qaPrincipal,'PRODUCT','DETAIL');const q=JSON.parse(request.body??'{}');
   const base=await reads.http.fetch(request.url,{method,credentials:'same-origin',headers:request.headers,body:request.body,signal:new AbortController().signal});const body=await base.json();authorize(qaPrincipal,'PRODUCT','DETAIL');if(!base.ok)return response(base.status,body);
   // Explicit current-only projection. No historical documents are rewritten.
   if(path==='/products/prices/query'){const p=rows.get(q.productId)?.product;return p?response(200,{productId:p.id,version:p.version,prices:structuredClone(p.prices)}):response(404,{error:{code:'PRODUCT_NOT_FOUND',message:'Unknown synthetic target'}});}
   if(path==='/products/basics/query'&&body){const p=rows.get(q.productId)?.product;if(p){body.name=p.name;body.retailPrice=p.prices.retail_price;}}
   if(path==='/product-management/query')for(const item of body.items){const p=rows.get(item.id)?.product;if(p){item.name=p.name;item.retailPrice=p.prices.retail_price;}}
   return response(base.status,body);
  }catch(e){return response(e.code==='FORBIDDEN'?403:500,{error:{code:e.code??'INTERNAL_ERROR',message:'Synthetic product read rejected'}});}
 }};
}
