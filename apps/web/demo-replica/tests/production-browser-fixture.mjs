// Recovery harness: closed synthetic read-only transport. Never a production fallback.
import {createInterface} from 'node:readline';
import {createReplicaPreviewTransport} from '../frontend/runtime-preview-transport.ts';
if(process.argv.includes('--category-overflow')){const {installCategoryOverflowFixture}=await import('./category-overflow-fixture.mjs');installCategoryOverflowFixture();}
if(process.argv.includes('--customer-recommendation')){const {installCustomerRecommendationFixture}=await import('./customer-recommendation-fixture.mjs');installCustomerRecommendationFixture();}
if(process.argv.includes('--sales-chain')&&process.argv.includes('--transfer-chain'))throw Error('Independent sales and transfer stores cannot share a preview');
if(process.argv.includes('--product-edit')&&['--sales-chain','--transfer-chain','--staff-edit','--product-editor-read'].some(flag=>process.argv.includes(flag)))throw Error('Product edit fixture requires its own consistent isolated profile');
const transport=createReplicaPreviewTransport();
const productEdit=process.argv.includes('--product-edit')?await(await import('./product-edit-fixture.mjs')).createProductEditFixture():null;
const productRead=process.argv.includes('--product-editor-read')?(await import('./product-editor-read-fixture.mjs')).createProductEditorReadFixture():null;
const transfer=process.argv.includes('--transfer-chain')?await(await import('./transfer-chain-fixture.mjs')).createTransferChainFixture():null;
const sales=process.argv.includes('--sales-chain')?await(await import('./sales-chain-fixture.mjs')).createSalesChainFixture():null;
if(process.argv.includes('--sales-preview')){if(!sales)throw Error('Sales preview requires actual service chain');await(await import('./sales-preview-seed.mjs')).seedSalesPreview(sales);}
const staff=process.argv.includes('--staff-edit')?await(await import('./staff-edit-fixture.mjs')).createStaffEditFixture():null;
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{
  const request=JSON.parse(line),url=new URL(request.url),method=request.method??'GET';
  if(productEdit&&url.origin==='https://synthetic-management.invalid'&&productEdit.canHandle(url.pathname,method)){process.stdout.write(JSON.stringify(await productEdit.request(request))+'\n');continue;}
  if(productRead&&url.origin==='https://synthetic-management.invalid'&&productRead.canHandle(url.pathname,method)){process.stdout.write(JSON.stringify(await productRead.request(request))+'\n');continue;}
  if(transfer&&url.origin==='https://synthetic-management.invalid'&&transfer.canHandle(url.pathname,method)){process.stdout.write(JSON.stringify(await transfer.request(request))+'\n');continue;}
  if(sales&&url.origin==='https://synthetic-management.invalid'&&sales.canHandle(url.pathname,method)){process.stdout.write(JSON.stringify(await sales.request(request))+'\n');continue;}
  if(staff&&url.origin==='https://synthetic-management.invalid'&&staff.canHandle(url.pathname,method)){process.stdout.write(JSON.stringify(await staff.request(request))+'\n');continue;}
  const partyRead=method==='GET'&&/^\/api\/(?:customers|suppliers)(?:\/(?:candidates|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?$/.test(url.pathname);
  if(url.origin!=='https://synthetic-management.invalid'||!(partyRead||method==='GET'&&url.pathname==='/api/auth/session'||method==='POST'&&url.pathname.startsWith('/api/')&&url.pathname.endsWith('/query'))){process.stdout.write(JSON.stringify({status:501,headers:{'content-type':'application/json'},body:JSON.stringify({error:'SYNTHETIC_READ_ONLY'})})+'\n');continue;}
  const response=await transport.http.fetch(transport.http.origin+url.pathname+url.search,{method,credentials:'same-origin',headers:request.headers??{},...(request.body?{body:request.body}:{}),signal:new AbortController().signal});
  process.stdout.write(JSON.stringify({status:response.status,headers:Object.fromEntries(response.headers.entries()),body:await response.text()})+'\n');
 }catch(error){process.stdout.write(JSON.stringify({status:500,headers:{'content-type':'application/json'},body:JSON.stringify({error:String(error)})})+'\n');}
}

await productEdit?.close();await staff?.close();await sales?.close();await transfer?.close();
