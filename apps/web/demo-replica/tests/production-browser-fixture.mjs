// Closed synthetic stdio profiles. Never a production fallback or listener.
import {createInterface} from 'node:readline';
import {createReplicaPreviewTransport} from '../frontend/runtime-preview-transport.ts';
const documentPagination=process.argv.includes('--document-pagination');
if(documentPagination&&(process.argv.filter(flag=>['--sales-chain','--transfer-chain'].includes(flag)).length!==1||process.argv.slice(2).some(flag=>!['--document-pagination','--sales-chain','--transfer-chain'].includes(flag))))throw Error('Document pagination requires exactly one original document chain');
const productEntryProfile=process.argv.includes('--product-entry-service');
if(productEntryProfile&&(process.argv.slice(2).length!==1||process.argv[2]!=='--product-entry-service'))throw Error('Product entry service fixture requires its own consistent isolated profile');
if(process.argv.includes('--category-overflow')){const {installCategoryOverflowFixture}=await import('./category-overflow-fixture.mjs');installCategoryOverflowFixture();}
if(process.argv.includes('--customer-recommendation')){const {installCustomerRecommendationFixture}=await import('./customer-recommendation-fixture.mjs');installCustomerRecommendationFixture();}
if(process.argv.includes('--sales-chain')&&process.argv.includes('--transfer-chain'))throw Error('Independent sales and transfer stores cannot share a preview');
if(process.argv.includes('--product-edit')&&['--sales-chain','--transfer-chain','--staff-edit','--product-editor-read'].some(flag=>process.argv.includes(flag)))throw Error('Product edit fixture requires its own consistent isolated profile');
const productEntry=productEntryProfile?await(await import('../../../../tests/support/product-entry-service-host-fixture.mjs')).createProductEntryServiceHost({syntheticOnly:true,productWrite:true,colorWrite:true,categoryWrite:true,mediaStage:true}):null;
const transport=productEntryProfile?null:createReplicaPreviewTransport();
const productEdit=process.argv.includes('--product-edit')?await(await import('./product-edit-fixture.mjs')).createProductEditFixture():null;
const productRead=process.argv.includes('--product-editor-read')?(await import('./product-editor-read-fixture.mjs')).createProductEditorReadFixture():null;
const transfer=process.argv.includes('--transfer-chain')?await(await import('./transfer-chain-fixture.mjs')).createTransferChainFixture({responsibleStaffValidation:true,pagination:documentPagination}):null;
const sales=process.argv.includes('--sales-chain')?await(await import('./sales-chain-fixture.mjs')).createSalesChainFixture({pagination:documentPagination}):null;
if(process.argv.includes('--sales-preview')){if(!sales)throw Error('Sales preview requires actual service chain');await(await import('./sales-preview-seed.mjs')).seedSalesPreview(sales);}
if(process.argv.includes('--payment-maintenance')&&['--product-entry-service','--product-edit','--sales-chain','--transfer-chain','--staff-edit'].some(flag=>process.argv.includes(flag)))throw Error('Payment maintenance requires its own isolated writer profile');
const payment=process.argv.includes('--payment-maintenance')?await(await import('./payment-maintenance-fixture.mjs')).createPaymentMaintenanceFixture():null;
const staff=process.argv.includes('--staff-edit')?await(await import('./staff-edit-fixture.mjs')).createStaffEditFixture():null;
try{
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{
  const request=JSON.parse(line),url=new URL(request.url),method=request.method??'GET';
  if(productEntry){
   // This profile never consults the static transport, including unknown routes.
   if(url.origin!=='https://synthetic-product-entry.invalid'||url.username||url.password||!url.pathname.startsWith('/api/')||url.search||url.hash){process.stdout.write(JSON.stringify({status:501,headers:{'content-type':'application/json'},body:JSON.stringify({error:'SYNTHETIC_PRODUCT_ENTRY_ONLY'})})+'\n');continue;}
   let body=request.body;
   if(Object.hasOwn(request,'binaryBase64')){
    const encoded=request.binaryBase64;
    if(Object.hasOwn(request,'body')||typeof encoded!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)||Buffer.from(encoded,'base64').toString('base64')!==encoded){process.stdout.write(JSON.stringify({status:400,headers:{'content-type':'application/json'},body:JSON.stringify({error:'INVALID_SYNTHETIC_BINARY'})})+'\n');continue;}
    body=Buffer.from(encoded,'base64');
   }
   const response=await productEntry.http.fetch(request.url,{method,credentials:'same-origin',headers:request.headers??{},...(body===undefined?{}:{body}),signal:new AbortController().signal}),headers=Object.fromEntries(response.headers.entries());
   const text=/^(?:text\/|application\/(?:json|[^;]+\+json)(?:;|$))/i.test(response.headers.get('content-type')??'');
   process.stdout.write(JSON.stringify({status:response.status,headers,...(text?{body:await response.text()}:{binaryBase64:Buffer.from(await response.arrayBuffer()).toString('base64')})})+'\n');continue;
  }
  if(productEdit&&url.origin==='https://synthetic-management.invalid'&&productEdit.canHandle(url.pathname,method)){process.stdout.write(JSON.stringify(await productEdit.request(request))+'\n');continue;}
  if(productRead&&url.origin==='https://synthetic-management.invalid'&&productRead.canHandle(url.pathname,method)){process.stdout.write(JSON.stringify(await productRead.request(request))+'\n');continue;}
  if(transfer&&url.origin==='https://synthetic-management.invalid'&&transfer.canHandle(url.pathname,method)){process.stdout.write(JSON.stringify(await transfer.request(request))+'\n');continue;}
  if(sales&&url.origin==='https://synthetic-management.invalid'&&sales.canHandle(url.pathname,method)){process.stdout.write(JSON.stringify(await sales.request(request))+'\n');continue;}
  if(payment&&url.origin==='https://synthetic-management.invalid'&&payment.canHandle(url.pathname,method)){process.stdout.write(JSON.stringify(await payment.request(request))+'\n');continue;}
  if(staff&&url.origin==='https://synthetic-management.invalid'&&staff.canHandle(url.pathname,method)){process.stdout.write(JSON.stringify(await staff.request(request))+'\n');continue;}
  const partyRead=method==='GET'&&/^\/api\/(?:customers|suppliers)(?:\/(?:candidates|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?$/.test(url.pathname);
  if(url.origin!=='https://synthetic-management.invalid'||!(partyRead||method==='GET'&&url.pathname==='/api/auth/session'||method==='POST'&&url.pathname.startsWith('/api/')&&url.pathname.endsWith('/query'))){process.stdout.write(JSON.stringify({status:501,headers:{'content-type':'application/json'},body:JSON.stringify({error:'SYNTHETIC_READ_ONLY'})})+'\n');continue;}
  const response=await transport.http.fetch(transport.http.origin+url.pathname+url.search,{method,credentials:'same-origin',headers:request.headers??{},...(request.body?{body:request.body}:{}),signal:new AbortController().signal});
  process.stdout.write(JSON.stringify({status:response.status,headers:Object.fromEntries(response.headers.entries()),body:await response.text()})+'\n');
 }catch(error){process.stdout.write(JSON.stringify({status:500,headers:{'content-type':'application/json'},body:JSON.stringify({error:String(error)})})+'\n');}
}

}finally{
 try{await productEntry?.close();}finally{await productEdit?.close();await payment?.close();await staff?.close();await sales?.close();await transfer?.close();}
}
