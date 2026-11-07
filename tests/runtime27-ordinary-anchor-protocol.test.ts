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
const guardDigest={
  EXACT27:'fa51aa3c79074a829c685127f6638152e26def788d919c19eb38bfffcb50f961',
  EXACT35:'ff462d6a8a30eadea0d98991818cf15c9fd907db0d00956b3be51193846d3e83',
} as const;
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
  anchorGuardDigest?: string;
  constructor(row:Record<string,unknown>,settlements:Record<string,unknown>[]=[]){this.row=row;this.settlements=settlements;}
  async query(sql:string,values:unknown[]=[]):Promise<PgSalesResult>{
    this.calls.push({sql,values:structuredClone(values)});
    let rows:Record<string,unknown>[]=[];
    if(sql.includes('document-inventory:anchor'))rows=this.anchorGuardDigest===undefined?this.anchors:
      this.anchors.map(row=>({...row,schema_ready:row.schema_ready===true&&values[2]===this.anchorGuardDigest}));
    else if(sql.includes('sales-retained-approval:history'))rows=[];
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
const runtime27=(client:Client)=>({profile:'EXACT27' as const,contract:'STANDARD_RUNTIME27_COMMAND_V1' as const,
  async assertReady(actual:object,purpose:string){assert.equal(actual,client);assert.ok(['DOCUMENT_COMMAND','INVENTORY_ADMISSION','CATALOGUE_READ'].includes(purpose));}});
const uow=(client:Client,profile?:keyof typeof guardDigest)=>
  new PostgresSalesUnitOfWork({async connect(){return client;}},{runtime27:runtime27(client)},profile);
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
for(const profile of ['EXACT27','EXACT35'] as const)test(`${profile} sales UOW uses the selected anchor for the first imported reversal`,async()=>{
  const c=new Client({...salesRow(true),status:'APPROVED',version:4,unified_staff_columns:true});c.lines=salesLines();c.anchors=[sealedRow('SALES',c.row,c.lines)];
  c.anchorGuardDigest=guardDigest[profile];
  c.balances=[{warehouse_id:ids.warehouse,sku_id:ids.sku,quantity:'41',version:9,last_operation_id:null,updated_at:at}];
  let n=1000;const service=createSalesService({unitOfWork:uow(c,profile==='EXACT35'?profile:undefined),rules:SYNTHETIC_RULES,authorization:{async assertAllowed(){}},now:()=>at,newId:kind=>sid(kind,n++)});
  const result=await service.execute({action:'UNAPPROVE',actor,requestKey:'synthetic-first-reversal',salesId:ids.sales,expectedVersion:version(4)});
  assert.equal(result.status,'DRAFT');assert.equal(result.ledgerEntryIds.length,1);
  const ledger=c.calls.filter(x=>/^INSERT INTO naijue_erp.inventory_ledger/.test(x.sql));assert.equal(ledger.length,1);
  assert.equal(ledger[0]!.values[2],'UNAPPROVE');assert.equal(ledger[0]!.values[8],null);assert.deepEqual(ledger[0]!.values.slice(11),['41','43',sid('operation',810)]);
  assert.match(ledger[0]!.sql,/baseline_anchor_operation_id/);
  const anchorCalls=c.calls.filter(x=>x.sql.includes('document-inventory:anchor'));
  assert.equal(anchorCalls.length,1);
  assert.deepEqual(anchorCalls[0]!.values,['SALES',ids.sales,guardDigest[profile]]);
  assert.equal(c.calls.find(x=>/^INSERT INTO naijue_erp.operation_receipt/.test(x.sql))!.values[4],'UNAPPROVE');
});
function transferRow():Record<string,unknown>{const h=transferDraft().header;return {id:h.id,number:h.number,business_date:h.businessDate,
  from_warehouse_id:h.fromWarehouseId,to_warehouse_id:h.toWarehouseId,status:'APPROVED',version:7,note:null,responsible_staff_id:null,
  created_by_account_id:null,created_by_staff_id:sid('staff',899),created_hall_id:null,created_role:null,created_at:null,updated_at:null,
  approved_by_account_id:null,approved_by_staff_id:null,approved_at:null,stock_basis:'CUTOFF_HISTORY',unified_staff_columns:true};}
function transferLines():Record<string,unknown>[]{return transferDraft().lines.map(l=>({id:l.id,transfer_id:l.transferId,line_no:l.lineNo,sku_id:l.skuId,quantity:l.quantity.toString(),is_current:true,
  product_code_snapshot:null,product_name_snapshot:null,color_name_snapshot:null,fit_name_snapshot:null,size_name_snapshot:null,barcode_snapshot:null}));}
for(const profile of ['EXACT27','EXACT35'] as const)test(`${profile} transfer UOW uses the selected anchor on both reversal endpoints`,async()=>{
  const c=new Client(transferRow());c.lines=transferLines();c.anchors=[sealedRow('TRANSFER',c.row,c.lines)];
  c.anchorGuardDigest=guardDigest[profile];
  c.balances=[transferIds.fromWarehouse,transferIds.toWarehouse].map((warehouse_id,i)=>({warehouse_id,sku_id:transferIds.sku,quantity:i===0?'20':'8',version:9,last_operation_id:null,updated_at:at}));
  let n=1000;const service=createTransferService({unitOfWork:new PostgresTransferUnitOfWork({async connect(){return c;}},{runtime27:runtime27(c)},profile==='EXACT35'?profile:undefined),
    authorization:{async assertAllowed(){}},references:{async assertValid(){}},now:()=>at,newId:kind=>sid(kind,n++)});
  const result=await service.execute({actor:transferActor,action:'UNAPPROVE',transferId:transferIds.transfer,expectedVersion:version(7),requestKey:'synthetic-transfer-first'});
  assert.equal(result.version,8);assert.equal(result.ledgerEntryIds.length,2);
  assert.deepEqual(c.calls.find(x=>x.sql.includes('document-inventory:anchor'))?.values,['TRANSFER',transferIds.transfer,guardDigest[profile]]);
  const ledger=c.calls.filter(x=>/^INSERT INTO naijue_erp.inventory_ledger/.test(x.sql));
  assert.deepEqual(ledger.map(x=>x.values.slice(12)),[['20','22',sid('operation',810)],['8','6',sid('operation',810)]]);
  assert.ok(ledger.every(x=>x.values[2]==='UNAPPROVE'&&x.values[9]===null));
  const update=c.calls.find(x=>/^UPDATE naijue_erp.transfer_header/.test(x.sql))!;
  assert.deepEqual(update.values.slice(8,12),[null,null,null,null]);
  assert.match(update.sql,/stock_basis = 'CUTOFF_HISTORY'/);
});

import { CATALOGUE_PRICE_KEYS } from '../packages/application/src/catalogue-price-input.ts';
class CatalogueClient extends Client {
  override async query(sql:string,values:unknown[]=[]):Promise<PgSalesResult>{
    if(sql.includes('document-specification:product')){this.calls.push({sql,values:structuredClone(values)});return {rows:[],rowCount:0};}
    if(sql.includes('business-catalogue27:')){
      this.calls.push({sql,values:structuredClone(values)});
      const prices=Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key=>[key,null]));
      return {rows:sql.includes(':skus')?[{sku_id:ids.sku,product_id:sid('product',1220),proof_valid:true}]
        :[{product_id:sid('product',1220),proof_valid:true,source_prices:prices,...prices}],rowCount:1};
    }
    return super.query(sql,values);
  }
}
for(const spec of [false,true])test(`runtime27 sales SAVE selection ${spec?'rejects missing specification product before write':'uses existing ordinary SKU without source proof'}`,async()=>{
  const c=new CatalogueClient({...salesRow(),stock_basis:'RUNTIME_LEDGER'});
  await uow(c).transaction(async tx=>{
    await tx.getReceipt(actor.accountId,'standard-existing-selection');await tx.getSales(ids.sales);
    const input={scope:{kind:'SALES' as const,documentId:ids.sales,operationId:sid('operation',1200),actor,completedAt:at},
      selections:spec?[{spec:{productId:sid('product',1220),colorId:sid('color',1210),fitId:sid('fit',1211),sizeId:sid('size',1212)}}]:[{skuId:ids.sku}],newId:()=>{throw Error('must not allocate');}};
    if(spec)await assert.rejects(tx.resolveDocumentSkus!(input),{code:'PRODUCT_REFERENCE_UNAVAILABLE'});
    else assert.deepEqual(await tx.resolveDocumentSkus!(input),[ids.sku]);
  });
  assert.equal(c.calls.some(x=>x.sql.includes('business-catalogue27:')), !spec);
  assert.ok(c.calls.every(x=>!x.sql.includes('import_source_row')&&!x.sql.includes('import_history_closure_manifest')&&!/^INSERT|^UPDATE/.test(x.sql)));
});
test('EXACT35 retained approval binds the same anchor and rejects the old catalog on the original transaction',async()=>{
  for(const actualDigest of [guardDigest.EXACT35,guardDigest.EXACT27]){
    const c=new Client({...salesRow(true),status:'APPROVED',version:4,unified_staff_columns:true});
    c.lines=salesLines();c.anchors=[sealedRow('SALES',c.row,c.lines)];c.anchorGuardDigest=actualDigest;
    const read=uow(c,'EXACT35').transaction(async tx=>{
      await tx.getReceipt(actor.accountId,'exact35-retained-approval');
      await tx.getSales(ids.sales);
      const evidence=await tx.getRetainedSalesApprovalHistory!(ids.sales,version(4),true);
      assert.equal(evidence.migrationOrigin?.header.version,4);
    });
    if(actualDigest===guardDigest.EXACT35)await read;
    else{
      await assert.rejects(read,{code:'INVALID_BASELINE_ANCHOR'});
      assert.equal(c.calls.at(-1)?.sql,'ROLLBACK');
    }
    const anchor=c.calls.find(x=>x.sql.includes('document-inventory:anchor'));
    assert.match(anchor!.sql,/guard_unified_document\(\)',\$3::text/);
    assert.deepEqual(anchor?.values,['SALES',ids.sales,guardDigest.EXACT35]);
    assert.ok(c.calls.every(x=>!/^INSERT|^UPDATE/.test(x.sql)));
  }
});

test('published runtime anchor never reads offline source mappings and preserves exact ordinary snapshot',async()=>{
  const {readPublishedDocumentInventoryAnchor}=await import('../adapters/postgres/src/published-document-inventory-anchor-reader.ts');
  const row=sealedRow('SALES',{...salesRow(true),status:'APPROVED',version:4},salesLines());
  for(const key of ['source_record_id','source_system','source_entity_type','source_key','source_record_hash'])delete row[key];
  const anchor=await readPublishedDocumentInventoryAnchor(async sql=>{assert.doesNotMatch(sql,/import_record|source_key|source_record_hash|source_file_ref/);return{rows:[row],rowCount:1};},'SALES',ids.sales);
  assert.equal(anchor && 'basis' in anchor ? anchor.basis : undefined,'PUBLISHED_ORDINARY_AUDIT');assert.equal('source' in anchor!,false);
  await assert.rejects(readPublishedDocumentInventoryAnchor(async()=>({rows:[{...row,anchor_valid:false}],rowCount:1}),'SALES',ids.sales));
});
