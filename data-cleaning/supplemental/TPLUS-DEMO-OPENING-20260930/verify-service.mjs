import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {currentSizeGroups} from '../../../frontend/product-size-groups.mjs';

const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const plan=await json('./opening-plan.json');
const original=await json('../../../server/runtime/excel-barcode-authority-20260930.json');
const supplement=await json('../../../server/runtime/barcode-scheme-supplement-20260930.json');
const origin='http://127.0.0.1:8877',root=process.env.QA_API_ROOT||'http://127.0.0.1:8880';
assert.equal(root,'http://127.0.0.1:8880','HTTP snapshot verification uses the isolated QA service');
assert(process.env.QA_LOGIN_NAME&&process.env.QA_LOGIN_PASSWORD,'Use generated isolated fixture credentials');
const denied=await fetch(root+'/runtime/command',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({role:'ADMIN'})});assert.equal(denied.status,401);
const noCredentials=await fetch(root+'/runtime/session',{method:'POST',headers:{Origin:origin}});assert.equal(noCredentials.status,401);
const session=await fetch(root+'/runtime/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({loginName:process.env.QA_LOGIN_NAME,password:process.env.QA_LOGIN_PASSWORD})});
assert.equal(session.status,200);
const cookie=session.headers.get('set-cookie')?.split(';')[0];
const request=async(path,body)=>{
 const response=await fetch(root+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal(response.status,200,path);const payload=await response.json();assert.equal(payload.ok,true,path);return payload.data;
};
const catalog=await request('/runtime/catalog');
const products=new Map(catalog.products.map(p=>[p.id,p]));
const skuProducts=new Map(catalog.skus.map(s=>[s.id,s.product_id]));
const expectedCodes=new Map([...original.records,...supplement.records].filter(r=>r.status==='ACTIVE').map(r=>[r.skuId,r]));
assert.equal(catalog.barcodes.length,14960);assert(catalog.aliases.every(a=>a.origin==='MANUAL')); assert.equal(new Set(catalog.barcodes.map(b=>b.barcode)).size,14960);
for(const barcode of catalog.barcodes){const record=expectedCodes.get(barcode.sku_id);assert(record);assert.equal(barcode.barcode,record.barcode);assert.equal(barcode.product_id,record.productId);}
assert.equal(catalog.skus.filter(s=>s.barcodeAuthority?.status==='NOT_REQUIRED').length,10);
const women=catalog.skus.filter(s=>s.options.SIZE?.currentGroupId==='WOMEN');assert(women.length>0);
const womenSmall=women.find(s=>s.id==='4150bd33-f5f2-99dc-61f0-4c0f22c07add');assert(womenSmall);
assert.equal(womenSmall.options.SIZE.sourceCode,'772');assert.equal(womenSmall.options.SIZE.sourceName,'155/82B S');
assert.equal(womenSmall.options.SIZE.name,'155/S');assert.equal(womenSmall.options.SIZE.code,'252');
const womenLarge=women.find(s=>s.id==='ff992176-8e0f-49c2-6573-b99147b095c2');assert(womenLarge);
assert.equal(womenLarge.options.SIZE.name,'175/2XL');assert.equal(womenLarge.options.SIZE.code,'256');
const groups=currentSizeGroups();assert.deepEqual(groups.map(g=>g.name),['男装上衣尺码','男装裤子尺码','女装尺码组','鞋码','童装尺码','配饰均码']);
const womenSizes=new Map(groups.find(g=>g.id==='WOMEN').sizes.map(s=>[s.name,s.code]));
for(const sku of women){assert(womenSizes.has(sku.options.SIZE.name));if(sku.options.SIZE.sourceCode!=='910')assert.equal(sku.options.SIZE.code,womenSizes.get(sku.options.SIZE.name));}
const historicalNoSize=catalog.skus.filter(s=>s.options.SIZE?.sourceCode==='910'&&s.options.SIZE?.sourceName==='无尺码');assert(historicalNoSize.length>0);assert(historicalNoSize.every(s=>s.options.SIZE.name==='无尺码'));
const expectedTotals=new Map();
for(const cell of plan.cells){const id=skuProducts.get(cell.skuId);assert(id);expectedTotals.set(id,(expectedTotals.get(id)||0)+Number(cell.quantity));}
const actualTotals=await request('/runtime/product-totals');
for(const row of actualTotals){assert.equal(Number(row.quantity),expectedTotals.get(row.product_id)||0,products.get(row.product_id)?.code);expectedTotals.delete(row.product_id);}
assert([...expectedTotals.values()].every(q=>q===0));
const wantedWarehouses=new Map();
for(const cell of plan.cells){const w=wantedWarehouses.get(cell.warehouseId)||{net:0,absolute:0,count:0};w.net+=Number(cell.quantity);w.absolute+=Math.abs(Number(cell.quantity));w.count++;wantedWarehouses.set(cell.warehouseId,w);}
const warehouseStock=await request('/runtime/warehouse-stock');
for(const row of warehouseStock){const w=wantedWarehouses.get(row.id)||{net:0,absolute:0,count:0};assert.equal(Number(row.net_quantity),w.net);assert.equal(Number(row.absolute_quantity),w.absolute);assert.equal(row.nonzero_skus,w.count);wantedWarehouses.delete(row.id);}
assert.equal(wantedWarehouses.size,0);
const sampleCodes=[...new Set([...plan.cells.slice(0,12).map(c=>c.sourceProductCode),...women.slice(0,5).map(s=>products.get(s.product_id).code),'运费','503KZ3369857'])];
const sampleRows=await request('/runtime/stock?products='+encodeURIComponent(JSON.stringify(sampleCodes)));
const sampleExpected=new Map(plan.cells.filter(c=>sampleCodes.includes(c.sourceProductCode)).map(c=>[c.warehouseId+'|'+c.skuId,Number(c.quantity)]));
for(const row of sampleRows){const key=row.warehouse_id+'|'+row.variant_id;assert.equal(Number(row.quantity),sampleExpected.get(key)||0);sampleExpected.delete(key);}
assert.equal(sampleExpected.size,0);
const warehouseIds=[...new Set(plan.cells.map(c=>c.warehouseId))];
const matrix=await request('/runtime/inventory?size=500&unit=product',{products:sampleCodes,warehouses:warehouseIds});
const matrixWanted=plan.cells.filter(c=>sampleCodes.includes(c.sourceProductCode)).reduce((n,c)=>n+Number(c.quantity),0);assert.equal(Number(matrix.total),matrixWanted);
for(const cell of [plan.cells[0],plan.cells.find(c=>Number(c.quantity)<0)]){
 const ledger=await request('/runtime/ledger?query='+encodeURIComponent(JSON.stringify({sku:cell.skuId,warehouse:cell.warehouseId})));
 assert.equal(ledger.openingMode,'DEMO_ONLY');assert.equal(Number(ledger.quantity),Number(cell.quantity));
 assert(ledger.items.some(row=>row.document_type==='OPENING'&&Number(row.after)===Number(cell.quantity)));
 assert(ledger.items.filter(row=>row.historical_only).every(row=>row.after===null&&row.before===null));
}
const result={at:new Date().toISOString(),status:'PASS',openingRevision:plan.revision,mode:'DEMO_ONLY',allProductTotalsMatch:true,allWarehouseTotalsMatch:true,sampleStockKeys:sampleRows.length,sampleInventoryMatrixTotal:matrixWanted,positiveAndNegativeLedgerMatch:true,womenMappedSkus:women.length,historical910NoSizeSkus:historicalNoSize.length,activeUniqueBarcodes:14960,noBarcodeRequired:10,aliases:catalog.aliases.length,credentialFreeAdminRejected:true,clientRoleEscalationRejected:true,currentGroups:groups.map(g=>g.name)};
await writeFile(new URL('./service-verification.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
