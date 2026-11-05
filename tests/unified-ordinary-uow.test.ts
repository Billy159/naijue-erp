/** SCRIPTED PG PROTOCOL ONLY: no server, PostgreSQL parsing, locks or durability. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresSalesUnitOfWork } from '../adapters/postgres/src/sales-unit-of-work.ts';
import type { PgSalesClient, PgSalesResult } from '../adapters/postgres/src/sales-unit-of-work.ts';
import { createSalesService } from '../packages/application/src/sales-service.ts';
import type { SalesTransaction } from '../packages/application/src/ports.ts';
import { actor, ids, sid, syntheticDraft, SYNTHETIC_RULES } from './support/synthetic-fixtures.ts';
import { version, quantity } from '../packages/domain/src/values.ts';
import { moneyToSql } from '../adapters/postgres/src/codec.ts';
import { readDocumentInventoryAnchor } from '../adapters/postgres/src/document-inventory-anchor-reader.ts';
import { canonicalDocumentInventorySnapshot } from '../packages/domain/src/document-inventory-effects.ts';
import { PostgresPostingBalances } from '../adapters/postgres/src/inventory-posting-balances.ts';
import { PostgresTransferUnitOfWork } from '../adapters/postgres/src/transfer-unit-of-work.ts';
import { createTransferService } from '../packages/application/src/transfer-service.ts';
import { ids as transferIds, actor as transferActor, draft as transferDraft } from './support/synthetic-transfer.ts';

const at='2026-11-02T00:00:00.000000Z';
function salesRow(unknown=false):Record<string,unknown>{
  const h=syntheticDraft().header;
  return {id:h.id,number:h.number,business_type:h.businessType,business_date:h.businessDate,hall_id:h.hallId,customer_id:h.customerId,
    salesperson_id:h.salespersonId,warehouse_id:h.warehouseId,responsible_staff_id:null,status:'DRAFT',version:1,
    gross_amount:moneyToSql(h.grossAmount),order_discount:moneyToSql(h.orderDiscount),net_due:moneyToSql(h.netDue),note:null,
    created_by_account_id:unknown?null:actor.accountId,created_hall_id:null,created_by_staff_id:null,approved_by_staff_id:null,
    created_at:unknown?null:at,updated_at:unknown?null:at,approved_by_account_id:null,approved_at:null,stock_basis:'CUTOFF_HISTORY'};
}
class Client implements PgSalesClient {
  readonly calls:{sql:string;values:unknown[]}[]=[];
  readonly row:Record<string,unknown>; readonly settlements:Record<string,unknown>[];
  lines:Record<string,unknown>[]=[]; anchors:Record<string,unknown>[]=[]; balances:Record<string,unknown>[]=[]; ledger:Record<string,unknown>[]=[];
  constructor(row:Record<string,unknown>,settlements:Record<string,unknown>[]=[]){this.row=row;this.settlements=settlements;}
  async query(sql:string,values:unknown[]=[]):Promise<PgSalesResult>{
    this.calls.push({sql,values:structuredClone(values)});
    let rows:Record<string,unknown>[]=[];
    // These fixtures model a sealed import with no later native audit events.
    if(sql.includes('sales-retained-approval:history'))rows=[];
    else if(sql.includes('document-inventory:anchor'))rows=this.anchors;
    else if(sql.includes('FROM naijue_erp.operation_receipt WHERE actor_account_id'))rows=[];
    else if(sql.includes('sales:current-schema'))rows=[{current_sales_schema_ready:true}];
    else if(sql.includes('FROM naijue_erp.sales_header WHERE id = $1 FOR UPDATE'))rows=[this.row];
    else if(sql.includes('FROM naijue_erp.sales_line WHERE sales_id'))rows=this.lines;
    else if(sql.includes('FROM naijue_erp.transfer_header WHERE id = $1 FOR UPDATE'))rows=[this.row];
    else if(sql.includes('FROM naijue_erp.transfer_line WHERE transfer_id'))rows=this.lines;
    else if(sql.includes('FROM naijue_erp.inventory_ledger l JOIN'))rows=this.ledger;
    else if(sql.includes('ORDER BY b.warehouse_id, b.sku_id FOR UPDATE OF b'))rows=this.balances;
    else if(sql.includes('posting:publication'))rows=[];
    else if(sql.includes('sales-authorization:identity'))rows=[{account_id:actor.accountId,staff_id:sid('staff',810),login_enabled:true,role:'ADMIN',employment_status:'在职',hall_id:null}];
    else if(sql.includes('FROM naijue_erp.sales_settlement WHERE sales_id'))rows=this.settlements;
    else if(!/^(BEGIN |COMMIT$|ROLLBACK$|SELECT pg_advisory|SELECT naijue_erp.inventory_key_lock|UPDATE naijue_erp.(sales_header|transfer_header|inventory_balance)|INSERT INTO naijue_erp.inventory_ledger|INSERT INTO naijue_erp.audit_change|INSERT INTO naijue_erp.operation_receipt)/.test(sql))throw new Error(`Unexpected protocol SQL ${sql}`);
    return {rows,rowCount:1};
  }
  release():void{}
}
const uow=(client:Client)=>new PostgresSalesUnitOfWork({async connect(){return client;}});
test('unified UOW protocol: converted unknown creator and historical times stay null',async()=>{
  const c=new Client(salesRow(true));
  const stored=await uow(c).transaction(tx=>tx.getSales(ids.sales));
  assert.equal(stored?.document.header.createdByAccountId,null);
  assert.equal(stored?.document.header.createdAt,null);
  assert.equal(stored?.document.header.updatedAt,null);
});
test('unified UOW protocol: all seventeen settlement occurrences are decoded without a display cap',async()=>{
  const settlements=Array.from({length:17},(_,i)=>({id:sid('settlement',700+i),sales_id:ids.sales,line_no:i+1,payment_account_id:ids.payment,
    payment_method_id_snapshot:null,direction:'RECEIVE',amount:'0.00'}));
  const c=new Client(salesRow(),settlements);
  assert.equal((await uow(c).transaction(tx=>tx.getSales(ids.sales)))?.document.settlements.length,17);
  assert.ok(c.calls.filter(x=>x.sql.includes('FROM naijue_erp.sales_settlement')).every(x=>! /LIMIT/i.test(x.sql)));
});
test('unified UOW protocol: unverified cutoff origin fails closed before any ordinary write',async()=>{
  const c=new Client(salesRow());
  await assert.rejects(uow(c).transaction(async tx=>{
    const previous=(await tx.getSales(ids.sales))!.document;
    await tx.putRuntimeSales({...previous,header:{...previous.header,version:version(2),updatedAt:at,note:'reviewed edit'}});
  }),{code:'MISSING_POSTING_PROVENANCE'});
  assert.equal(c.calls.some(x=>/^UPDATE|^INSERT|^DELETE/.test(x.sql)),false);
});

function salesLines():Record<string,unknown>[] {
  return syntheticDraft().lines.map(l=>({id:l.id,sales_id:l.salesId,line_no:l.lineNo,sku_id:l.skuId,quantity:l.quantity.toString(),
    reference_price:moneyToSql(l.referencePrice!),deal_price:moneyToSql(l.dealPrice),line_amount:moneyToSql(l.lineAmount),allocated_discount:null,is_gift:null,
    pricing_rule:null,discount_tenths:null,zero_confirmed:null,is_current:l.isCurrent,
    product_code_snapshot:null,product_name_snapshot:null,color_name_snapshot:null,fit_name_snapshot:null,size_name_snapshot:null,barcode_snapshot:null}));
}
function sealedRow(kind:'SALES'|'TRANSFER',header:Record<string,unknown>,lines:Record<string,unknown>[],settlements:Record<string,unknown>[]=[]):Record<string,unknown>{
  const operation=sid('operation',810),batch=sid('operation',811),source=sid('operation',812),baseline=sid('operation',813);
  return {id:operation,target_type:kind,target_id:header.id,actor_account_id:actor.accountId,target_version:header.version,
    completed_at:at,occurred_at:at,audit_operation_id:operation,audit_actor:actor.accountId,old_version:null,new_version:header.version,
    snapshot:{header:{...header,import_batch_id:batch},lines,settlements},batch_id:batch,source_record_id:source,
    source_system:'synthetic_only',source_entity_type:kind==='SALES'?'SALES_HEADER':'TRANSFER_HEADER',source_key:'original/001',source_record_hash:'1'.repeat(64),
    baseline_batch_id:baseline,baseline_manifest_sha256:'2'.repeat(64),cutoff_at:at,schema_ready:true,anchor_valid:true};
}
test('unified anchor protocol: PG full-snapshot digest is checked before deriving a different inventory-only kernel key',async()=>{
  const h={...salesRow(true),status:'APPROVED',version:4},lines=salesLines(),row=sealedRow('SALES',h,lines);
  let sql='';
  const anchor=await readDocumentInventoryAnchor(async(text,values)=>{sql=text;assert.deepEqual(values,['SALES',ids.sales]);return {rows:[row],rowCount:1};},'SALES',ids.sales);
  assert.ok(anchor);assert.equal(anchor.coverage.state,'CONFIRMED');
  if(anchor.coverage.state==='CONFIRMED'){
    assert.equal(anchor.coverage.snapshotKey,canonicalDocumentInventorySnapshot(anchor.snapshot));
    assert.notEqual(anchor.coverage.snapshotKey,'2'.repeat(64));assert.ok(anchor.coverage.snapshotKey.startsWith('[['));
  }
  assert.deepEqual(anchor.baselineEffects.map(e=>e.quantityDelta),[-2n]);
  assert.match(sql,/encode\(sha256\(convert_to\(r.snapshot::text,'UTF8'\)\),'hex'\)/);
  assert.match(sql,/r.result_data->'baseline'=r.coverage/);assert.match(sql,/baseline.status='IMPORTED'/);
  assert.match(sql,/r.current_header->>'import_batch_id'=b.id::text/);
});
for(const corrupt of ['schema_ready','anchor_valid','target_id','audit_actor','target_version','snapshot'] as const){
  test(`unified anchor protocol: malformed ${corrupt} never becomes confirmed inventory provenance`,async()=>{
    const h={...salesRow(),status:'APPROVED',version:4},row=sealedRow('SALES',h,salesLines());
    const bad={...row,[corrupt]:corrupt==='schema_ready'||corrupt==='anchor_valid'?false:corrupt==='snapshot'?{header:h,lines:null,settlements:[]}:corrupt==='target_version'?5:sid('operation',999)};
    await assert.rejects(readDocumentInventoryAnchor(async()=>({rows:[bad],rowCount:1}),'SALES',ids.sales));
  });
}
test('unified UOW protocol: imported DRAFT memo save keeps unknown facts and every settlement without touching stock',async()=>{
  const settlements=Array.from({length:17},(_,i)=>({id:sid('settlement',700+i),sales_id:ids.sales,line_no:i+1,payment_account_id:ids.payment,
    payment_method_id_snapshot:null,direction:'RECEIVE',amount:i===0?'2.50':'0.00'}));
  const c=new Client({...salesRow(true),unified_staff_columns:true},settlements);c.lines=salesLines();c.anchors=[sealedRow('SALES',c.row,c.lines,settlements)];
  const draft=(await uow(c).transaction(tx=>tx.getSales(ids.sales)))!.document;
  c.calls.length=0;let n=900;
  const service=createSalesService({unitOfWork:uow(c),rules:SYNTHETIC_RULES,authorization:{async assertAllowed(){}},now:()=>at,newId:kind=>sid(kind,n++)});
  const result=await service.execute({action:'SAVE',actor,requestKey:'synthetic-converted-memo',expectedVersion:version(1),draft:{...draft,header:{...draft.header,note:'memo'}}});
  assert.equal(result.version,2);assert.deepEqual(result.ledgerEntryIds,[]);
  assert.equal(c.calls.filter(x=>x.sql.includes('sales-retained-approval:history')).length,1);
  assert.ok(c.calls.every(x=>!/inventory_key_lock|INSERT INTO naijue_erp.inventory|UPDATE naijue_erp.inventory|DELETE FROM naijue_erp.sales_settlement|INSERT INTO naijue_erp.sales_settlement/.test(x.sql)));
  const update=c.calls.find(x=>/^UPDATE naijue_erp.sales_header/.test(x.sql))!;
  assert.equal(update.values[14],null);assert.equal(update.values[16],null);assert.match(update.sql,/stock_basis = 'CUTOFF_HISTORY'/);
  assert.equal(c.calls.filter(x=>x.sql.includes('document-inventory:anchor')).length,1);
});
test('unified UOW protocol: imported draft void preserves unknown economics without pricing-history reads',async()=>{
  const settlements=[{id:sid('settlement',799),sales_id:ids.sales,line_no:1,payment_account_id:ids.payment,
    payment_method_id_snapshot:null,direction:'RECEIVE',amount:'2.50'}];
  const c=new Client({...salesRow(true),unified_staff_columns:true},settlements);c.lines=salesLines();c.anchors=[sealedRow('SALES',c.row,c.lines,settlements)];
  let n=1200;const service=createSalesService({unitOfWork:uow(c),rules:SYNTHETIC_RULES,authorization:{async assertAllowed(){}},now:()=>at,newId:kind=>sid(kind,n++)});
  const result=await service.execute({action:'VOID',actor,requestKey:'synthetic-import-void',salesId:ids.sales,expectedVersion:version(1)});
  assert.equal(result.status,'VOID');assert.deepEqual(result.ledgerEntryIds,[]);
  assert.equal(c.calls.some(x=>x.sql.includes('sales-retained-approval:history')),false);
  assert.equal(c.calls.filter(x=>x.sql.includes('document-inventory:anchor')).length,1);
  const update=c.calls.find(x=>/^UPDATE naijue_erp.sales_header/.test(x.sql))!;
  const h=c.row;
  assert.deepEqual(update.values,[h.id,h.number,h.business_type,h.business_date,h.hall_id,h.customer_id,h.salesperson_id,h.warehouse_id,
    'VOID',2,h.gross_amount,h.order_discount,h.net_due,h.note,h.created_by_account_id,h.created_hall_id,h.created_at,at,
    h.approved_by_account_id,h.approved_at,h.responsible_staff_id,1]);
  assert.equal(c.calls.at(-1)?.sql,'COMMIT');
  assert.ok(c.calls.every(x=>!/inventory_key_lock|INSERT INTO naijue_erp.inventory|UPDATE naijue_erp.inventory|(?:DELETE FROM|INSERT INTO|UPDATE) naijue_erp.sales_(line|settlement)/.test(x.sql)));
});
test('unified UOW protocol: first imported approval reversal uses real migration anchor, current balance and no fake APPROVE history',async()=>{
  const c=new Client({...salesRow(true),status:'APPROVED',version:4,unified_staff_columns:true});c.lines=salesLines();c.anchors=[sealedRow('SALES',c.row,c.lines)];
  c.balances=[{warehouse_id:ids.warehouse,sku_id:ids.sku,quantity:'41',version:9,last_operation_id:null,updated_at:at}];
  let n=1000;const service=createSalesService({unitOfWork:uow(c),rules:SYNTHETIC_RULES,authorization:{async assertAllowed(){}},now:()=>at,newId:kind=>sid(kind,n++)});
  const result=await service.execute({action:'UNAPPROVE',actor,requestKey:'synthetic-first-reversal',salesId:ids.sales,expectedVersion:version(4)});
  assert.equal(result.status,'DRAFT');assert.equal(result.ledgerEntryIds.length,1);
  assert.equal(c.calls.some(x=>x.sql.includes('sales-retained-approval:history')),false);
  const ledger=c.calls.filter(x=>/^INSERT INTO naijue_erp.inventory_ledger/.test(x.sql));assert.equal(ledger.length,1);
  assert.equal(ledger[0]!.values[2],'UNAPPROVE');assert.equal(ledger[0]!.values[8],null);assert.deepEqual(ledger[0]!.values.slice(11),['41','43',sid('operation',810)]);
  assert.match(ledger[0]!.sql,/baseline_anchor_operation_id/);
  assert.equal(c.calls.filter(x=>x.sql.includes('document-inventory:anchor')).length,1);
  assert.equal(c.calls.find(x=>/^INSERT INTO naijue_erp.operation_receipt/.test(x.sql))!.values[4],'UNAPPROVE');
});
test('unified UOW protocol: nonempty malformed runtime history rejects without reading baseline anchor or writing stock',async()=>{
  const c=new Client({...salesRow(true),status:'APPROVED',version:4});c.lines=salesLines();c.anchors=[sealedRow('SALES',c.row,c.lines)];
  c.ledger=[{id:sid('ledger',300),operation_id:sid('operation',301),event_kind:'APPROVE',warehouse_id:ids.warehouse,sku_id:ids.sku,
    quantity_delta:'-999',sales_id:ids.sales,sales_line_id:ids.line,source_document_version:4,reverses_entry_id:null,business_date:'2026-10-20',posted_at:at}];
  let n=1000;const service=createSalesService({unitOfWork:uow(c),rules:SYNTHETIC_RULES,authorization:{async assertAllowed(){}},now:()=>at,newId:kind=>sid(kind,n++)});
  await assert.rejects(service.execute({action:'UNAPPROVE',actor,requestKey:'synthetic-malformed',salesId:ids.sales,expectedVersion:version(4)}),{code:'MISSING_POSTING_PROVENANCE'});
  assert.equal(c.calls.some(x=>x.sql.includes('document-inventory:anchor')),false);
  assert.equal(c.calls.some(x=>x.sql.includes('sales-retained-approval:history')),false);
  assert.equal(c.calls.some(x=>/^INSERT|^UPDATE|^DELETE/.test(x.sql)),false);
  assert.equal(c.calls.at(-1)?.sql,'ROLLBACK');
  assert.equal(c.calls.some(x=>x.sql==='COMMIT'),false);
});
function transferRow():Record<string,unknown>{const h=transferDraft().header;return {id:h.id,number:h.number,business_date:h.businessDate,
  from_warehouse_id:h.fromWarehouseId,to_warehouse_id:h.toWarehouseId,status:'APPROVED',version:7,note:null,responsible_staff_id:null,
  created_by_account_id:null,created_by_staff_id:sid('staff',899),created_hall_id:null,created_role:null,created_at:null,updated_at:null,
  approved_by_account_id:null,approved_by_staff_id:null,approved_at:null,stock_basis:'CUTOFF_HISTORY',unified_staff_columns:true};}
function transferLines():Record<string,unknown>[]{return transferDraft().lines.map(l=>({id:l.id,transfer_id:l.transferId,line_no:l.lineNo,sku_id:l.skuId,quantity:l.quantity.toString(),is_current:true,
  product_code_snapshot:null,product_name_snapshot:null,color_name_snapshot:null,fit_name_snapshot:null,size_name_snapshot:null,barcode_snapshot:null}));}
test('unified transfer UOW protocol: null original account/time/role and known historical staff survive first anchor reversal on both endpoints',async()=>{
  const c=new Client(transferRow());c.lines=transferLines();c.anchors=[sealedRow('TRANSFER',c.row,c.lines)];
  c.balances=[transferIds.fromWarehouse,transferIds.toWarehouse].map((warehouse_id,i)=>({warehouse_id,sku_id:transferIds.sku,quantity:i===0?'20':'8',version:9,last_operation_id:null,updated_at:at}));
  let n=1000;const service=createTransferService({unitOfWork:new PostgresTransferUnitOfWork({async connect(){return c;}}),
    authorization:{async assertAllowed(){}},references:{async assertValid(){}},now:()=>at,newId:kind=>sid(kind,n++)});
  const result=await service.execute({actor:transferActor,action:'UNAPPROVE',transferId:transferIds.transfer,expectedVersion:version(7),requestKey:'synthetic-transfer-first'});
  assert.equal(result.version,8);assert.equal(result.ledgerEntryIds.length,2);
  const ledger=c.calls.filter(x=>/^INSERT INTO naijue_erp.inventory_ledger/.test(x.sql));
  assert.deepEqual(ledger.map(x=>x.values.slice(12)),[['20','22',sid('operation',810)],['8','6',sid('operation',810)]]);
  assert.ok(ledger.every(x=>x.values[2]==='UNAPPROVE'&&x.values[9]===null));
  const update=c.calls.find(x=>/^UPDATE naijue_erp.transfer_header/.test(x.sql))!;
  assert.deepEqual(update.values.slice(8,12),[null,null,null,null]);
  assert.match(update.sql,/stock_basis = 'CUTOFF_HISTORY'/);
});

function knownSalesLines(draft=syntheticDraft()):Record<string,unknown>[]{return draft.lines.map(l=>({id:l.id,sales_id:l.salesId,line_no:l.lineNo,sku_id:l.skuId,quantity:l.quantity.toString(),
  reference_price:l.referencePrice===null?null:moneyToSql(l.referencePrice),deal_price:moneyToSql(l.dealPrice),line_amount:moneyToSql(l.lineAmount),allocated_discount:l.allocatedDiscount===null?null:moneyToSql(l.allocatedDiscount),is_gift:l.isGift,
  pricing_rule:l.pricingRule,discount_tenths:l.discountTenths,zero_confirmed:l.zeroConfirmed,is_current:l.isCurrent,product_code_snapshot:l.snapshot.productCode,product_name_snapshot:l.snapshot.productName,
  color_name_snapshot:l.snapshot.colorName,fit_name_snapshot:l.snapshot.fitName,size_name_snapshot:l.snapshot.sizeName,barcode_snapshot:l.snapshot.barcode}));}
for(const mismatched of [false,true])test(`unified ordinary UOW protocol: seventeen retained settlements ${mismatched?'still require exact approval net':'approve without a three-row display cap'}`,async()=>{
  const settlements=Array.from({length:17},(_,i)=>({id:sid('settlement',700+i),sales_id:ids.sales,line_no:i+1,payment_account_id:ids.payment,
    payment_method_id_snapshot:sid('paymentMethod',31),direction:'RECEIVE',amount:i===0?(mismatched?'2.49':'2.50'):'0.00'}));
  const c=new Client({...salesRow(),stock_basis:'RUNTIME_LEDGER'},settlements);c.lines=knownSalesLines();
  c.balances=[{warehouse_id:ids.warehouse,sku_id:ids.sku,quantity:'7',version:1,last_operation_id:null,updated_at:at}];
  let n=1100;const service=createSalesService({unitOfWork:uow(c),rules:SYNTHETIC_RULES,authorization:{async assertAllowed(){}},now:()=>at,newId:kind=>sid(kind,n++)});
  const command={actor,action:'APPROVE' as const,salesId:ids.sales,expectedVersion:version(1),requestKey:'synthetic-all-settlements'};
  if(mismatched){await assert.rejects(service.execute(command),{code:'SETTLEMENT_MISMATCH'});assert.equal(c.calls.some(x=>/^INSERT|^UPDATE|^DELETE/.test(x.sql)),false);}
  else{assert.equal((await service.execute(command)).status,'APPROVED');assert.equal(c.calls.filter(x=>/^INSERT INTO naijue_erp.inventory_ledger/.test(x.sql)).length,1);}
  assert.equal(c.calls.some(x=>/DELETE FROM naijue_erp.sales_settlement|INSERT INTO naijue_erp.sales_settlement/.test(x.sql)),false);
});
for(const known of [true,false])test(`unified ordinary UOW protocol: zero-net same-SKU events ${known?'lock and preserve both actual sources':'reject unknown stock before any event write'}`,async()=>{
  const source=syntheticDraft('EXCHANGE',['2','-2']),draft={...source,lines:source.lines.map(l=>({...l,skuId:ids.sku}))};
  const c=new Client({...salesRow(),business_type:'EXCHANGE',gross_amount:'0.00',net_due:'0.00',stock_basis:'RUNTIME_LEDGER'});c.lines=knownSalesLines(draft);
  if(known)c.balances=[{warehouse_id:ids.warehouse,sku_id:ids.sku,quantity:'7',version:1,last_operation_id:null,updated_at:at}];
  let n=1100;const service=createSalesService({unitOfWork:uow(c),rules:{...SYNTHETIC_RULES,assertReferencesAndEconomics(){}},authorization:{async assertAllowed(){}},now:()=>at,newId:kind=>sid(kind,n++)});
  const command={actor,action:'APPROVE' as const,salesId:ids.sales,expectedVersion:version(1),requestKey:'synthetic-zero-net'};
  if(!known){await assert.rejects(service.execute(command),{code:'INVENTORY_NOT_READY'});assert.equal(c.calls.some(x=>/^INSERT|^UPDATE|^DELETE/.test(x.sql)),false);}
  else{assert.equal((await service.execute(command)).ledgerEntryIds.length,2);assert.deepEqual(c.calls.filter(x=>/^INSERT INTO naijue_erp.inventory_ledger/.test(x.sql)).map(x=>x.values.slice(11)),[['7','5'],['5','7']]);}
  assert.equal(c.calls.filter(x=>/inventory_key_lock/.test(x.sql)).length,1);
});
test('unified posting manager protocol: an unready second touched key blocks the first append even when its own balance is known',async()=>{
  const manager=new PostgresPostingBalances(async sql=>({rows:sql.includes('ORDER BY b.warehouse_id')?[{warehouse_id:ids.warehouse,sku_id:ids.sku,quantity:'7',version:1,last_operation_id:null,updated_at:at}]:[],rowCount:1}));
  await manager.lock([{warehouseId:ids.warehouse,skuId:ids.sku},{warehouseId:ids.warehouse,skuId:ids.sku2}]);
  assert.throws(()=>manager.prepareLiveAppend({id:sid('ledger',1199),operationId:sid('operation',1198),eventKind:'APPROVE',warehouseId:ids.warehouse,skuId:ids.sku,
    quantityDelta:quantity('-2'),source:{kind:'SALES',salesId:ids.sales,salesLineId:ids.line,endpoint:'SALES_WAREHOUSE'},sourceDocumentVersion:version(2),reversesEntryId:null,businessDate:syntheticDraft().header.businessDate,postedAt:at}),{code:'INVENTORY_NOT_READY'});
});
test('unified posting manager protocol: a first anchored UNAPPROVE may materialize only independently published sparse zero, never a generic missing balance',async()=>{
  const calls:string[]=[],batch=sid('operation',9900);
  const manager=new PostgresPostingBalances(async sql=>{
    calls.push(sql);let rows:Record<string,unknown>[]=[];
    if(sql.includes('posting:publication'))rows=[{id:batch,completed:true,final_approval:true,checkpoint:{sequence:2,cursor:3,
      expected:{WAREHOUSE:1,SKU:1,INVENTORY_LEDGER:0,IMPORT_BATCH:1},counts:{WAREHOUSE:1,SKU:1,INVENTORY_LEDGER:0,IMPORT_BATCH:1}}}];
    else if(sql.includes('posting:guards'))rows=[{integrity_guards_present:true}];
    else if(sql.includes('posting:zero-key'))rows=[{warehouse_id:ids.warehouse,sku_id:ids.sku,warehouse_published:true,sku_published:true,balance_absent:true,ledger_absent:true,valid_size:true}];
    return {rows,rowCount:1};
  });
  await manager.lock([{warehouseId:ids.warehouse,skuId:ids.sku}]);
  const row={id:sid('ledger',1199),operationId:sid('operation',1198),eventKind:'UNAPPROVE' as const,warehouseId:ids.warehouse,skuId:ids.sku,
    quantityDelta:quantity('2'),source:{kind:'SALES' as const,salesId:ids.sales,salesLineId:ids.line,endpoint:'SALES_WAREHOUSE' as const},
    sourceDocumentVersion:version(5),reversesEntryId:null,baselineAnchorOperationId:sid('operation',810),businessDate:syntheticDraft().header.businessDate,postedAt:at};
  assert.throws(()=>manager.prepareLiveAppend(row),{code:'INVENTORY_NOT_READY'});
  await manager.assertZero(ids.warehouse,ids.sku);
  assert.throws(()=>manager.prepareLiveAppend({...row,baselineAnchorOperationId:null,reversesEntryId:sid('ledger',1197)}),{code:'INVENTORY_NOT_READY'});
  const token=manager.prepareLiveAppend(row);assert.equal(token.quantityBefore,0n);assert.equal(token.quantityAfter,2n);
  manager.didAppendLive(token);
  await manager.put({warehouseId:ids.warehouse,skuId:ids.sku,quantity:quantity('2'),version:version(1),lastOperationId:row.operationId,updatedAt:at});
  manager.assertLiveComplete();
  assert.equal(calls.filter(sql=>/^INSERT INTO naijue_erp.inventory_balance/.test(sql)).length,1);
  assert.ok(calls.every(sql=>!/VALUES.*\b0\b/.test(sql)));
});
test('unified UOW anchor protocol: target/lifetime scope is strict and cached anchors are defensive copies',async()=>{
  const c=new Client(salesRow(true));c.lines=salesLines();c.anchors=[sealedRow('SALES',c.row,c.lines)];
  let leaked:SalesTransaction|undefined;
  await uow(c).transaction(async tx=>{
    leaked=tx;
    await assert.rejects(tx.getDocumentInventoryAnchor!('SALES',ids.sales),{code:'TRANSACTION_SCOPE'});
    await tx.getSales(ids.sales);
    await assert.rejects(tx.getDocumentInventoryAnchor!('TRANSFER',transferIds.transfer),{code:'TRANSACTION_SCOPE'});
    const first=(await tx.getDocumentInventoryAnchor!('SALES',ids.sales))!;
    Reflect.set(first.snapshot.header,'version',99);
    const second=(await tx.getDocumentInventoryAnchor!('SALES',ids.sales))!;
    assert.equal(second.snapshot.header.version,1);
    assert.equal(c.calls.filter(call=>call.sql.includes('document-inventory:anchor')).length,1);
  });
  await assert.rejects(leaked!.getDocumentInventoryAnchor!('SALES',ids.sales),{code:'TRANSACTION_SCOPE'});
});
test('unified UOW anchor protocol: a first reversal cannot bind another document migration operation',async()=>{
  const c=new Client({...salesRow(true),status:'APPROVED',version:4});c.lines=salesLines();c.anchors=[sealedRow('SALES',c.row,c.lines)];
  c.balances=[{warehouse_id:ids.warehouse,sku_id:ids.sku,quantity:'7',version:1,last_operation_id:null,updated_at:at}];
  await assert.rejects(uow(c).transaction(async tx=>{
    await tx.getSales(ids.sales);await tx.lockBalances!([{warehouseId:ids.warehouse,skuId:ids.sku}]);
    await tx.appendLedger({id:sid('ledger',1199),operationId:sid('operation',1198),eventKind:'UNAPPROVE',warehouseId:ids.warehouse,skuId:ids.sku,
      quantityDelta:quantity('2'),source:{kind:'SALES',salesId:ids.sales,salesLineId:ids.line,endpoint:'SALES_WAREHOUSE'},sourceDocumentVersion:version(5),reversesEntryId:null,
      baselineAnchorOperationId:sid('operation',999),businessDate:syntheticDraft().header.businessDate,postedAt:at});
  }),{code:'INVALID_BASELINE_ANCHOR'});
  assert.equal(c.calls.some(call=>/^INSERT|^UPDATE|^DELETE/.test(call.sql)),false);
});
for(const suspendedAt of ['KEY_LOCK','RUNTIME_PROOF'] as const)test(`unified posting lock protocol: caller mutation during ${suspendedAt} cannot alter the captured sorted complete key set`,async()=>{
  const keys=[{warehouseId:ids.warehouse,skuId:ids.sku2},{warehouseId:ids.warehouse,skuId:ids.sku},{warehouseId:ids.warehouse,skuId:ids.sku2}];
  const replacement=sid('sku',3999),otherWarehouse=sid('warehouse',3998);
  let resume!:()=>void,entered!:()=>void;
  const waiting=new Promise<void>(resolve=>{resume=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
  const calls:{sql:string;values:unknown[]}[]=[];let first=true;
  const client:PgSalesClient={async query(sql,values=[]){
    calls.push({sql,values:structuredClone(values)});
    if(suspendedAt==='KEY_LOCK'&&first){first=false;entered();await waiting;}
    return {rows:[],rowCount:0};
  },release(){}};
  const manager=suspendedAt==='KEY_LOCK'?new PostgresPostingBalances((sql,values)=>client.query(sql,values)):
    PostgresPostingBalances.forRuntime26(client,{profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(target,purpose){
      assert.equal(target,client);assert.equal(purpose,'INVENTORY_ADMISSION');entered();await waiting;
    }},()=>{});
  const locking=manager.lock(keys);await started;
  keys[0]!.skuId=replacement;keys[1]!.warehouseId=otherWarehouse;keys[2]!.skuId=replacement;keys.splice(2,1);keys.push({warehouseId:otherWarehouse,skuId:replacement});
  resume();await locking;
  assert.deepEqual(calls.filter(call=>call.sql.startsWith('SELECT naijue_erp.inventory_key_lock')).map(call=>call.values),[[ids.warehouse,ids.sku],[ids.warehouse,ids.sku2]]);
  assert.deepEqual(calls.at(-1)!.values,[[ids.warehouse,ids.warehouse],[ids.sku,ids.sku2]]);
  assert.equal(manager.get(ids.warehouse,ids.sku2),undefined);
  assert.throws(()=>manager.get(ids.warehouse,replacement),{code:'TRANSACTION_SCOPE'});
});
test('unified posting lock protocol: every primitive tuple is validated before runtime proof or any SQL call',async()=>{
  let proofCalls=0,queries=0;
  const client:PgSalesClient={async query(){queries++;return {rows:[],rowCount:0};},release(){}};
  const manager=PostgresPostingBalances.forRuntime26(client,{profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(){proofCalls++;}},()=>{});
  await assert.rejects(manager.lock([{warehouseId:ids.warehouse,skuId:ids.sku},{warehouseId:ids.warehouse,skuId:'not-a-canonical-uuid'}] as never),{code:'INVALID_ID'});
  assert.equal(proofCalls,0);assert.equal(queries,0);
});
