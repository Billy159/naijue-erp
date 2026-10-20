import test from 'node:test';
import assert from 'node:assert/strict';
import {transferLines,inventoryCells,stockRows,warehouseOccupancy} from '../frontend/transfer-contract.mjs';
import {transfer} from '../frontend/legacy-adapter.mjs';
import * as Adapter from '../frontend/legacy-adapter.mjs';
import * as InventoryUnitView from '../frontend/inventory-unit-view.mjs';
import {centsText} from '../frontend/sales-transport.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const sku='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const p={id:'P',uuid:'product',name:'Product',colorIds:['blue'],sizeIds:['44'],colors:['蓝色'],sizes:['44'],skuByCell:{'blue|44':sku}};
const old=Array.from({length:34},(_,i)=>({source_id:'source-'+i,sku_id:sku,product_id:'product',color_id:'blue',size_id:'44',source_quantity:String(i===33?2:1),from_warehouse_id:'A',to_warehouse_id:'B',unit:'件',source_payload:{fact:i},source_lineage:{row:i}}));
test('unchanged 34-row historical transfer survives matrix round trip with all facts',()=>{
 const d={from:'A',to:'B',q:{'P|0|0':35},items:['P'],_runtime:{body:{lines:old}}};
 assert.deepEqual(transferLines(d,()=>p),old);
 const changed=transferLines({...d,q:{'P|0|0':36}},()=>p);
 assert.equal(changed.length,1);assert.equal(changed[0].source_lineage.originalLines.length,34);
 assert.equal(old.length,34);assert.equal(old[33].source_quantity,'2');
});
test('two source SKUs in one apparent display cell cannot be silently assigned to the same inventory identity',()=>{
 const header={line_count:1,target_document_id:'d',source_number:'n',source_payload:{}};
 assert.throws(()=>transfer(header,[{...old[0],sku_id:other,target_document_id:'d'}],[p]),/PRODUCT_NOT_LOADED/);
 assert.throws(()=>transfer(header,[{...old[0],size_id:'43',target_document_id:'d'}],[p]),/SKU_NOT_LOADED/);
});
test('invalid input is not rounded, defaulted or dropped by the transfer serializer',()=>{
 for(const n of ['',-1,'NaN','1.00001'])assert.throws(()=>transferLines({from:'A',to:'B',q:{'P|0|0':n}},()=>p));
 assert.equal(transferLines({from:'A',to:'B',q:{'P|0|0':0}},()=>p).length,0);
});
test('sub-unit decimal quantities retain all four places and exact historical rows',()=>{
 const pair={...p,sourceUnit:'双'},draft={from:'A',to:'B',q:{'P|0|0':'0.0001'}};
 assert.equal(transferLines(draft,()=>pair)[0].source_quantity,'0.0001');
 const rows=['0.1','0.2'].map((q,i)=>({...old[i],unit:'双',source_quantity:q}));
 assert.deepEqual(transferLines({...draft,q:{'P|0|0':'0.3000'},_runtime:{body:{lines:rows}}},()=>pair),rows);
 assert.equal(transferLines({...draft,q:{'P|0|0':'0.0000'}},()=>pair).length,0);
});
test('formal inventory pagination retains original cells and warehouse occupancy counts nonzero cells',async()=>{
 const calls=[],rows=[{skuId:sku,warehouseId:'A',productId:'product',quantity:'-1.0000'},{skuId:other,warehouseId:'A',productId:'product',quantity:'1.0000'}];
 const api=async url=>{calls.push(url);const page=Number(new URL('https://fixture'+url).searchParams.get('page'));return {items:[rows[page-1]],total:2};};
 assert.deepEqual(await inventoryCells(api),rows);assert.equal(calls.length,2);
 assert.deepEqual(await warehouseOccupancy(api),{A:2});
 const stock=await stockRows(api,['P'],()=>p);assert.deepEqual(stock.map(s=>s.variant_id),[sku,other]);assert.deepEqual(stock.map(s=>s.quantity),['-1.0000','1.0000']);
});
test('transfer business dates survive bridge reads, writes and historical snapshots without UTC drift',()=>{
 const events=new EventTarget();
 const source=readFileSync(new URL('../frontend/real-data-bridge.mjs',import.meta.url),'utf8').split('async function bootstrap()')[0].replace(/^import .*;\n/gm,'');
 const ctx={Adapter,transferLines,centsText,...InventoryUnitView,structuredClone,location:{hash:'#transfer'},history:{replaceState(){}},document:{querySelector:()=>({})},
  ERP_DEMO:{products:[p]},PRODUCT_CATALOG:{businessVariants:()=>[p],businessProduct:()=>p},PRODUCT_UI:{openReadOnly(){}},MASTER_DATA:{data:{staff:[]}},SALES_SERVICE:{},TRANSFER_SERVICE:{},GOLD:{},render(){}};
 ctx.addEventListener=events.addEventListener.bind(events);ctx.removeEventListener=events.removeEventListener.bind(events);ctx.dispatchEvent=events.dispatchEvent.bind(events);
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source+'\nrefs.halls=[];window.dateProbe={doc,bodyFrom};',ctx);
 const body={header:{business_date:'2026-10-02',source_from_warehouse_id:'A',source_to_warehouse_id:'B'},lines:[old[0]],fundsRecords:[]};
 const row={id:'document',document_type:'TRANSFER',number:'transfer',body,version:1,current_revision:1,status:'UNAUDITED',business_day:'2026-10-01T16:00:00.000Z',history:[]};
 const d=ctx.dateProbe.doc(row,false);
 assert.equal(d.date,'2026-10-02','detail must use the revision business date, not a timezone-shifted SQL date');
 assert.equal(ctx.dateProbe.bodyFrom(d,'TRANSFER').header.business_date,'2026-10-02');
 const past={...structuredClone(body),header:{...body.header,business_date:'2026-09-30'}};
 const withHistory=ctx.dateProbe.doc({...row,history:[{version:1,revision:1,operation:'save',body:past}]},false);
 assert.equal(withHistory.history[0].after.date,'2026-09-30','history must use its own revision date, not the current document date');
 const unknownPast={...past,header:{...past.header,business_date:undefined}};
 assert.equal(ctx.dateProbe.doc({...row,history:[{version:1,revision:1,operation:'save',body:unknownPast}]},false).history[0].after.date,'','a missing historical date must not inherit the current date');
 assert.equal(ctx.dateProbe.bodyFrom({...d,date:'2026-10-03'},'TRANSFER').header.business_date,'2026-10-03','an explicit business-date edit must still work');
 assert.equal(ctx.dateProbe.doc({...row,body:{...body,header:{...body.header,business_date:undefined}},business_day:'2026-10-02'},false).date,'2026-10-02');
});

test('transfer adjustment serializes integer cents as an exact decimal string',()=>{
 const source=readFileSync(new URL('../frontend/real-data-bridge.mjs',import.meta.url),'utf8');
 const start=source.indexOf('function bodyFrom('),end=source.indexOf('// Pending command bodies',start);
 const ctx=vm.createContext({copy:structuredClone,centsText,transferLines,C:{businessProduct:()=>p},D:{products:[p]}});
 vm.runInContext(source.slice(start,end)+';globalThis.writeBody=bodyFrom;',ctx);
 const draft={date:'2026-10-02',from:'A',to:'B',q:{'P|0|0':'1'}};
 for(const [amountCents,decimal] of [[undefined,'0.00'],[0,'0.00'],[1,'0.01'],[-1,'-0.01'],[Number.MAX_SAFE_INTEGER,'90071992547409.91']]) {
  const body=ctx.writeBody({...draft,adjustmentCents:amountCents},'TRANSFER');
  assert.equal(body.header.adjustment,decimal);
  assert.equal(body.lines[0].source_quantity,'1');
 }
 for(const amountCents of [0.1,NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>ctx.writeBody({...draft,adjustmentCents:amountCents},'TRANSFER'));
});
