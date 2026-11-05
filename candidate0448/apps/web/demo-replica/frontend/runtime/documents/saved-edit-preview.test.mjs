/** Actual approved synthetic factories/strict clients and saved sessions. No listener, browser, PG or commands except the original finite SAVE/receipt regression. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createReplicaPreviewTransport} from '../../runtime-preview-transport.ts';
import {createSyntheticDocumentPreviewTransport} from './synthetic-preview-transport.ts';
import {qaCurrentSkus,qaSalesDocuments,qaTransferDocuments,qaWarehouses} from '../../qa-reference-fixtures.mts';
import {createCurrentFormHttpReader} from '../../../../src/current-form/http-reader.ts';
import {SalesExistingDocumentSession} from '../../../../src/current-form/sales-existing-document.ts';
import {TransferExistingDocumentSession} from '../../../../src/current-form/transfer-existing-document.ts';
import {ReadScope} from '../../../../src/loading/read-scope.ts';
import {salesFormInput,salesInputMoney} from '../../../../src/sales/commands/form-model.ts';
import {draftFromSalesDetail} from '../../../../src/sales/commands/validation.ts';
import {inputFromTransferDraft} from '../../../../src/transfers/commands/validation.ts';
import {detail as declaredDetail,uuid} from '../../../../src/transfers/tests/fixtures.ts';
const origin='https://synthetic-management.invalid',route='/current-form/saved-edit-sku-batch-v2/query';
const signal=()=>new AbortController().signal;
const post=(transport,path,body,stop=signal())=>transport.http.fetch(origin+'/api'+path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:stop});
const page=(query,rows)=>({page:query.page,pageSize:20,exactTotal:String(rows.length),items:rows.slice((query.page-1)*20,query.page*20)});
function native({missingGroup=false,conflictingGroup=false,status=0,wait=null,foreignHall=null,skuCount=3}={}){
 const declared=declaredDetail(),productId=missingGroup?uuid(400):uuid(40),groupId=uuid(50);
 const source=skuCount===3?declared.catalog.skus:Array.from({length:skuCount},(_,i)=>({...declared.catalog.skus[i%3],skuId:uuid(1000+i),sizeId:uuid(5000+i)}));
 const skus=source.map(row=>({id:row.skuId,skuCode:'FINITE-'+row.skuId.slice(-3),productId,productCode:'FINITE',productName:'Finite declared product',colorId:row.colorId,colorName:row.colorName,fitId:row.fitId,fitName:row.fitName,sizeId:row.sizeId,sizeName:declared.catalog.sizeGroups[0].members.find(size=>size.sizeId===row.sizeId)?.name??'Finite size '+row.sizeId.slice(-4),sizeGroupId:groupId,barcodeAvailability:'UNAVAILABLE'}));
 const products=[{id:productId,code:'FINITE',name:'Finite declared product',retailPrice:'19.00',minimumPriceAvailability:'UNAVAILABLE',...(conflictingGroup?{sizeGroupId:uuid(999)}:{})}],calls=[];
 const adapter=createSyntheticDocumentPreviewTransport({syntheticOnly:true,origin,existingFetch:async(input,init)=>{
  const path=new URL(input).pathname.slice(4);calls.push({path,body:init.body?JSON.parse(String(init.body)):null});
  if(path==='/auth/session')return Response.json(status===401?{error:{code:'UNAUTHENTICATED'}}:{principal:{accountId:uuid(30),loginName:'Finite account'}},{status:status===401?401:200});
  const query=JSON.parse(String(init.body));
  if(status===403||foreignHall&&query.context?.kind==='SALES'&&query.context.hallId!==foreignHall)return Response.json({error:{code:'FORBIDDEN'}},{status:403});
  if(wait)await wait;
  if(path==='/current-form/products/query')return Response.json(page(query,products.filter(p=>p.code.includes(query.search)||p.name.includes(query.search))));
  if(path==='/current-form/product-skus/query')return Response.json(page(query,skus.filter(s=>s.productId===query.productId)));
  throw new Error('No network/unknown original provider path '+path);
 }});
 return {adapter,skus,products,calls,http:{origin,basePath:'/api',fetch:(input,init)=>adapter.request(input,init)}};
}
async function oldProduct(reader,sku,context){for(let n=1;;n++){const p=await reader.readProducts({context,search:sku.productCode,page:n,pageSize:20},signal()),found=p.items.find(row=>row.id===sku.productId);if(found)return found;if(BigInt(n)*20n>=p.exactTotal)return null;}}
async function compareOld(transport,query){
 const reader=createCurrentFormHttpReader(transport.http),old=await reader.readSkuBatch(query,signal()),before=transport.providerCalls?.().length,actual=await reader.readSavedEditSkuBatch(query,signal());
 if(before!==undefined)assert.deepEqual(transport.providerCalls().slice(before).map(c=>c.path),['/auth/session'],'QA exact-ID SKU and admitted product facts stay on the original pure fixture, with no alternate base provider/catalog SKU scan');
 assert.deepEqual(actual.skus,old,'all thirteen original values and caller order must survive');
 const products=[];for(const id of new Set(old.map(s=>s.productId))){const sku=old.find(s=>s.productId===id),p=await oldProduct(reader,sku,query.context);products.push(p?.sizeGroupId?{productId:id,state:'ELIGIBLE',sizeGroupId:p.sizeGroupId}:{productId:id,state:'UNAVAILABLE'});}
 assert.deepEqual(actual.products,products,'metadata must match the original admitted product/group projection, not derive admission from SKU group');return actual;
}
test('actual approved wrapper accepts STRING v2 and matches original QA SKU/product reads for1 and all192 original ordered rows',async()=>{
 const rows=qaCurrentSkus();assert.equal(rows.length,192);
 for(const n of [1,rows.length]){const transport=createReplicaPreviewTransport(),query={context:{kind:'TRANSFER'},skuIds:rows.slice(0,n).reverse().map(s=>s.id)},actual=await compareOld(transport,query);assert.equal(actual.skus.length,n);assert.equal(transport.providerCalls().some(c=>c.path===route),false,'new route is consumed in document layer, never forwarded to base');}
});
test('datasetundefined native factory matches old SKU/product reads and explicit declared catalog group',async()=>{
 const transport=native(),actual=await compareOld(transport,{context:{kind:'TRANSFER'},skuIds:transport.skus.map(s=>s.id).reverse()});assert.deepEqual(actual.products,[{productId:uuid(40),state:'ELIGIBLE',sizeGroupId:uuid(50)}]);assert.equal(transport.calls.some(c=>c.path===route),false);
});
test('finite native original reader and new wire preserve all200 distinct SKU tuples without truncation',async()=>{
 const transport=native({skuCount:200}),actual=await compareOld(transport,{context:{kind:'TRANSFER'},skuIds:transport.skus.map(s=>s.id).reverse()});assert.equal(actual.skus.length,200);
});
test('readable product with unknown group remains UNAVAILABLE although every actual SKU has a group',async()=>{
 const transport=native({missingGroup:true}),actual=await compareOld(transport,{context:{kind:'TRANSFER'},skuIds:[transport.skus[0].id]});assert.deepEqual(actual.products,[{productId:uuid(400),state:'UNAVAILABLE'}]);
});
test('new registration is exact POST-only, closed-origin and never forwards missing/duplicate/invalid-context requests',async()=>{
 const transport=native(),query={context:{kind:'TRANSFER'},skuIds:[transport.skus[0].id]};
 assert.equal(transport.adapter.canHandle(route,'POST'),true);assert.equal(transport.adapter.canHandle(route,'GET'),false);assert.equal(transport.adapter.canHandle(route+'/unknown','POST'),false);
 for(const body of [{...query,skuIds:[uuid(999)]},{...query,skuIds:[query.skuIds[0],query.skuIds[0]]},{...query,context:{kind:'TRANSFER',hallId:uuid(1)}}]){const response=await post(transport,route,body);assert.ok([400,501].includes(response.status));}
 await assert.rejects(transport.adapter.request('https://foreign.invalid/api'+route,{method:'POST',body:JSON.stringify(query)}),{name:'TypeError'});
 await assert.rejects(transport.adapter.request(origin+'/api'+route+'/unknown',{method:'POST',body:JSON.stringify(query)}),{name:'TypeError'});
 assert.equal(transport.calls.some(c=>c.path===route),false);
});
test('target product group conflict is rejected rather than treating its SKU group as eligibility',async()=>{
 const transport=native({missingGroup:true,conflictingGroup:true}),reader=createCurrentFormHttpReader(transport.http);await assert.rejects(reader.readSavedEditSkuBatch({context:{kind:'TRANSFER'},skuIds:[transport.skus[0].id]},signal()),error=>error.status===501);assert.equal(transport.calls.some(c=>c.path===route),false);
});
test('original401/403 and same-context denial remain failures, with no automatic legacy/new-route fallback',async()=>{
 for(const status of [401,403]){const transport=native({status}),reader=createCurrentFormHttpReader(transport.http);await assert.rejects(reader.readSavedEditSkuBatch({context:{kind:'TRANSFER'},skuIds:[transport.skus[0].id]},signal()),error=>error.status===status);assert.equal(transport.calls.some(c=>c.path===route),false);}
 const transport=native({foreignHall:uuid(10)}),reader=createCurrentFormHttpReader(transport.http);await assert.rejects(reader.readSavedEditSkuBatch({context:{kind:'SALES',hallId:uuid(11)},skuIds:[transport.skus[0].id]},signal()),error=>error.status===403);assert.deepEqual(transport.calls.find(c=>c.path==='/current-form/products/query').body.context,{kind:'SALES',hallId:uuid(11)});
});
test('aborted and late original finite reads cannot return a successful new response',async()=>{
 let release;const wait=new Promise(resolve=>{release=resolve;}),transport=native({wait}),reader=createCurrentFormHttpReader(transport.http),stop=new AbortController();
 const pending=reader.readSavedEditSkuBatch({context:{kind:'TRANSFER'},skuIds:[transport.skus[0].id]},stop.signal),rejected=assert.rejects(pending,error=>error.kind==='aborted');await new Promise(resolve=>setImmediate(resolve));stop.abort();release();await rejected;
 const before=transport.calls.length;await assert.rejects(reader.readSavedEditSkuBatch({context:{kind:'TRANSFER'},skuIds:[transport.skus[0].id]},stop.signal),error=>error.kind==='aborted');assert.equal(transport.calls.length,before);
});
for(const [kind,lineCount] of [['sales',3],['transfer',3],['sales',200]])test('actual QA wrapper + strict client initializes '+kind+' '+lineCount+' saved lines and independent transfer dictionary',async()=>{
 const transport=createReplicaPreviewTransport(),reader=createCurrentFormHttpReader(transport.http),original=structuredClone((kind==='sales'?qaSalesDocuments:qaTransferDocuments).find(d=>d.document.header.status==='DRAFT'));
 if(lineCount===200){const rows=original.document.lines;original.document.lines=Array.from({length:200},(_,i)=>({...structuredClone(rows[i%rows.length]),id:uuid(900000+i),lineNo:i+1}));const gross=original.document.lines.reduce((sum,row)=>sum+BigInt(row.lineAmount),0n);original.document.header.grossAmount=original.document.header.netDue=String(gross);original.document.settlements.forEach((row,i)=>{row.amount=String(i===0?gross/2n:gross-gross/2n);});}
 const input=kind==='sales'?salesFormInput(draftFromSalesDetail(original)):inputFromTransferDraft(original.document),before=JSON.stringify(input),scope=new ReadScope({accountId:uuid(30),sessionRevision:'preview',permissionRevision:'preview'},'preview-'+kind,original.document.header.id,()=>{});
 const owner=kind==='sales'?{getSnapshot:()=>({input,command:{write:{phase:'idle'}}}),commands:{getSnapshot:()=>({write:{phase:'idle'}})},expireExistingIdentity(){throw Error('Unexpected expiry');}}:{getSnapshot:()=>({editor:{input},write:{phase:'idle'}}),expireExistingIdentity(){throw Error('Unexpected expiry');}};
 const Session=kind==='sales'?SalesExistingDocumentSession:TransferExistingDocumentSession,session=new Session({owner,scope,reader,original,input,dirty:false,preparation:{prepareExisting(){throw Error('Initialization must not prepare/save');}}});
 try{await session.initialize();assert.equal(session.getSnapshot().phase,'ready');const proposal=session.getSnapshot().proposal,draft=proposal.getSnapshot().draft;assert.equal(draft.lines.length,original.document.lines.length);assert.equal(JSON.stringify(input),before);if(kind==='sales')assert.deepEqual(draft.lines.map(row=>row.key),original.document.lines.map(row=>row.id));
  draft.lines.forEach((line,i)=>{assert.deepEqual(line.sourceSnapshot,original.document.lines[i].snapshot);assert.equal(line.quantity,kind==='sales'?input.lines[i].quantity:input.quantities[original.document.lines[i].id]);if(kind==='sales'){assert.equal(line.dealPrice,input.lines[i].dealPrice);assert.equal(line.product.retailPrice,original.document.lines[i].referencePrice===null?null:salesInputMoney(original.document.lines[i].referencePrice));}});
  if(kind==='transfer'){const page=await proposal.readSizeGroups({search:'',page:1,pageSize:100},signal());for(const line of draft.lines)assert.ok(page.items.find(g=>g.id===line.sku.sizeGroupId)?.sizes.some(s=>s.id===line.sku.sizeId));}
  assert.equal(transport.calls().some(c=>/prepare-|commands|receipts/.test(c.path)),false);
 }finally{session.dispose();scope.dispose();}
});
test('original finite SAVE and receipt store remain usable and independent of the new read',async()=>{
 const transport=createReplicaPreviewTransport(),sku=qaCurrentSkus()[0];await compareOld(transport,{context:{kind:'TRANSFER'},skuIds:[sku.id]});
 const prepared=await post(transport,'/transfers/prepare-create',{businessDate:'2020-01-01',fromWarehouseId:qaWarehouses[0].id,toWarehouseId:qaWarehouses[1].id,note:null,lines:[{skuId:sku.id,quantity:'1'}]});assert.equal(prepared.status,200);const draft=await prepared.json(),requestKey='SYNTHETIC.saved-edit-v2.original-receipt';
 const saved=await post(transport,'/transfers/commands',{action:'SAVE',expectedVersion:null,requestKey,draft});assert.equal(saved.status,200);const value=await saved.json();const receipt=await transport.http.fetch(origin+'/api/transfers/receipts/'+requestKey,{method:'GET',credentials:'same-origin'});assert.equal(receipt.status,200);assert.equal((await receipt.json()).result.transferId,value.transferId);
});
