/** SYNTHETIC protocol only: real adapters, scripted original client; no SQL engine. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNativeDocumentSpecifications } from '../adapters/postgres/src/native-document-specification.ts';
import { createMaintainedCatalogue26TransactionProof } from '../adapters/postgres/src/catalogue-completeness.ts';
import type { PgSalesClient, PgSalesPool } from '../adapters/postgres/src/sales-unit-of-work.ts';
import type { NativeRuntime26Capability } from '../packages/application/src/native-import-schema-contract.ts';
import { CATALOGUE_PRICE_KEYS } from '../packages/application/src/catalogue-price-input.ts';
import { actor, ids, sid } from './support/synthetic-fixtures.ts';
const p=sid('product',610),group=sid('sizeGroup',614),category=sid('category',613),oldOperation=sid('operation',619);
const spec={productId:p,colorId:sid('color',615),fitId:sid('fit',616),sizeId:sid('size',617)};
type Row=Record<string,unknown>;
function fixture(options:{zeroSku?:boolean;outsideGroup?:boolean;uncommitted?:boolean;disabledSku?:boolean;role?:string;fail?:string}={}){
  const calls:string[]=[],ready:string[]=[];let active=true,sequence=1000;
  const root:Row={id:p,product_code:'SYNTHETIC',name:'Native product',category_id:category,supplier_id:null,season_id:null,size_group_id:group,
    year:null,system_item_code:null,thickness:null,collar_pants_type:null,default_barcode_scheme_id:null,enabled:true,version:1,deleted_at:null,
    ...Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k=>[k,k==='retail_price'?'1.25':null])),season_ids:[]};
  const oldSku:Row={id:ids.sku,product_id:p,color_id:spec.colorId,fit_id:spec.fitId,size_id:spec.sizeId,sku_code:'ORIGINAL_CODE',enabled:!options.disabledSku,version:1,created_operation_id:oldOperation};
  const skus:Row[]=options.zeroSku?[]:[oldSku],audits:Row[]=[{id:sid('audit',801),operation_id:oldOperation,actor_account_id:actor.accountId,
    object_type:'PRODUCT',object_id:p,action:'CREATE',old_version:null,new_version:1,before_values:null,after_values:{...structuredClone(root),skus:structuredClone(skus),barcodes:[]},
    occurred_at:'2026-10-22T00:00:00.000Z',receipt_id:oldOperation,receipt_actor:actor.accountId,target_type:'PRODUCT',target_id:p,receipt_action:'CREATE',status:'COMMITTED',
    request_key:'SYNTHETIC-ORIGINAL',request_hash:'a'.repeat(64),result_data:{operationId:oldOperation,kind:'PRODUCT',targetId:p,version:1},completed_at:'2026-10-22T00:00:00.000000Z',committed_before:!options.uncommitted}];
  const client:PgSalesClient={async query(sql,values=[]){calls.push(sql);if(options.fail && sql.includes(options.fail))throw Object.assign(Error('SYNTHETIC injected'),{code:'23505'});
    let rows:Row[]=[];
    if(sql.includes('document-specification:product'))rows=[{...root}];
    else if(sql.includes('document-specification:member'))rows=options.outsideGroup?[]:[{id:p}];
    else if(sql.includes('document-specification:tuple'))rows=skus.filter(s=>s.product_id===values[0]&&s.color_id===values[1]&&s.fit_id===values[2]&&s.size_id===values[3]).map(s=>({id:s.id,enabled:s.enabled}));
    else if(sql.includes('maintained-catalogue26:roots'))rows=[{...root,committed_before:root.version===1&&!options.uncommitted}];
    else if(sql.includes('maintained-catalogue26:product-source'))rows=[];
    else if(sql.includes('maintained-catalogue26:chain'))rows=audits;
    else if(sql.includes('maintained-catalogue26:skus'))rows=skus.map(s=>({facts:s,native_creation_valid:true,committed_before:s.created_operation_id===oldOperation&&!options.uncommitted}));
    else if(sql.includes('maintained-catalogue26:barcodes')||sql.includes('maintained-catalogue26:images'))rows=[];
    else if(sql.includes('maintained-catalogue26:reference:'))rows=(values[0] as string[]).map(id=>({facts:{id}}));
    else if(sql.includes('maintained-catalogue26:category'))rows=[{id:category,parent_id:null,deleted_at:null}];
    else if(sql.includes('maintained-catalogue26:membership'))rows=(values[1] as string[]).map(size_id=>({size_group_id:group,size_id}));
    else if(sql.includes('maintenance:identity'))rows=[{account_id:actor.accountId,staff_id:sid('staff',900),login_enabled:true,employment_status:'在职',role:options.role??'SALESPERSON',hall_id:actor.hallId}];
    else if(sql.includes('maintenance:hall'))rows=[{id:actor.hallId,enabled:true}];
    else if(sql.includes('maintenance:receipt'))rows=[];
    else if(sql.includes('maintenance:audit')){audits.push({id:values[0],operation_id:values[0],actor_account_id:values[1],object_type:values[2],object_id:values[3],action:values[4],old_version:values[5],new_version:values[6],
      before_values:JSON.parse(values[7] as string),after_values:JSON.parse(values[8] as string),occurred_at:values[9],committed_before:false});return {rows:[],rowCount:1};}
    else if(sql.includes('maintenance:complete')){const a=audits.at(-1)!;Object.assign(a,{receipt_id:values[0],receipt_actor:values[1],request_key:values[2],request_hash:values[3],receipt_action:values[4],target_type:values[5],target_id:values[6],
      status:'COMMITTED',result_data:JSON.parse(values[7] as string),completed_at:values[8]});rows=[{result_data:a.result_data}];}
    else if(sql.startsWith('UPDATE naijue_erp.product SET')){for(const m of sql.split('WHERE')[0]!.matchAll(/(\w+)=\$(\d+)/g))root[m[1]!]=values[Number(m[2])-1];return {rows:[],rowCount:1};}
    else if(sql.startsWith('INSERT INTO naijue_erp.sku(')){const keys=['id','product_id','sku_code','color_id','fit_id','size_id','enabled','version','created_operation_id'];skus.push(Object.fromEntries(keys.map((k,i)=>[k,values[i]])));return {rows:[],rowCount:1};}
    else if(sql.includes('FROM naijue_erp.product WHERE id=$1::uuid FOR UPDATE'))rows=[{...root}];
    else if(sql.includes('FROM naijue_erp.sku WHERE product_id=$1::uuid ORDER BY id'))rows=skus;
    else if(sql.includes('FROM naijue_erp.sku_barcode b'))rows=[];
    else if(sql.includes('FROM naijue_erp.product_category WHERE'))rows=[{id:category}];
    else if(sql.includes('FROM naijue_erp.size_group WHERE'))rows=[{id:group}];
    else if(sql.includes('FROM naijue_erp.size_group_member WHERE'))rows=(values[1] as string[]).map(size_id=>({size_id}));
    else if(sql.includes('deleted_at IS NULL AS retained'))rows=(values[0] as string[]).map(id=>({id,enabled:true,retained:true}));
    else if(!sql.includes('pg_advisory_xact_lock'))throw Error('Unexpected synthetic SQL '+sql);
    rows=structuredClone(rows);return {rows,rowCount:rows.length};
  },release(){throw Error('Borrowed resolver must never release client');}};
  const pool:PgSalesPool={async connect(){throw Error('Borrowed resolver must not connect');}};
  const runtime:NativeRuntime26Capability={profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(actual,purpose){assert.equal(actual,client);ready.push(purpose);}};
  const assertBound=()=>assert.ok(active,'SYNTHETIC closed original SAVE'),catalogue=createMaintainedCatalogue26TransactionProof(client,runtime,assertBound);
  const scope={kind:'SALES' as const,documentId:sid('sales',901),operationId:sid('operation',902),actor,completedAt:'2026-10-23T12:00:00.000Z'};
  return {root,skus,audits,calls,ready,client,catalogue,scope,context:{pool,client,runtime,assertBound,catalogue},newId:(kind:'sku'|'operation')=>sid(kind,sequence++),close(){active=false;}};
}
test('v11 actual tuple reuse preserves original UUID/code and never emits maintenance writes',async()=>{
  const f=fixture(),out=await resolveNativeDocumentSpecifications(f.context,{scope:f.scope,selections:[{spec},{spec}],newId:()=>{throw Error('Do not generate for reuse');}});
  assert.deepEqual(out,[ids.sku,ids.sku]);assert.equal(f.skus[0]!.sku_code,'ORIGINAL_CODE');assert.ok(!f.calls.some(s=>/INSERT|UPDATE naijue_erp/.test(s)));
});
test('v11 missing in-group tuple appends once through actual D2 helper and private same-client proof from committed empty baseline',async()=>{
  const f=fixture({zeroSku:true}),before=structuredClone(f.root);
  const out=await resolveNativeDocumentSpecifications(f.context,{scope:f.scope,selections:[{spec},{spec}],newId:f.newId});
  assert.equal(out[0],out[1]);assert.equal(f.skus.length,1);assert.equal(f.root.version,2);
  assert.deepEqual({...f.root,version:1},before);assert.equal(f.skus[0]!.sku_code,`NJNEW-${out[0]!.replaceAll('-','')}`);
  assert.equal(f.audits.length,2);assert.equal(f.calls.filter(s=>s.includes('maintenance:audit')).length,1);assert.equal(f.calls.filter(s=>s.includes('maintenance:complete')).length,1);
  assert.ok(f.calls.findIndex(s=>s.includes('maintained-catalogue26:roots'))<f.calls.findIndex(s=>s.includes('maintenance:audit')));
  assert.ok(!f.calls.some(s=>/\b(?:BEGIN|COMMIT|ROLLBACK)\b/.test(s)));assert.ok(f.ready.includes('PRODUCT_SEASONS_READ'));
  await f.catalogue.verifier.assertComplete({productIds:[p],query:f.catalogue.query});
  const append=f.audits[1]!, originalKey=append.request_key, newSku=f.skus[0]!, originalCode=newSku.sku_code;
  append.request_key='another-command';await assert.rejects(f.catalogue.verifier.assertComplete({productIds:[p],query:f.catalogue.query}),{code:'NATIVE_CATALOGUE_FACTS_UNAVAILABLE'});append.request_key=originalKey;
  newSku.sku_code='UNRECORDED';await assert.rejects(f.catalogue.verifier.assertComplete({productIds:[p],query:f.catalogue.query}),{code:'NATIVE_CATALOGUE_FACTS_UNAVAILABLE'});newSku.sku_code=originalCode;
  f.skus.push({...newSku,id:sid('sku',9999)});await assert.rejects(f.catalogue.verifier.assertComplete({productIds:[p],query:f.catalogue.query}),{code:'NATIVE_CATALOGUE_FACTS_UNAVAILABLE'});f.skus.pop();
  // Current xid is not a blanket permit: retained root/SKU/audit facts must still replay exactly.
  f.root.name='UNRECORDED';await assert.rejects(f.catalogue.verifier.assertComplete({productIds:[p],query:f.catalogue.query}),{code:'NATIVE_CATALOGUE_FACTS_UNAVAILABLE'});
});
test('v11 foreign group, disabled tuple, uncommitted prior baseline and unique collision reject without successful append',async()=>{
  for(const options of [{outsideGroup:true},{disabledSku:true},{zeroSku:true,uncommitted:true},{zeroSku:true,fail:'INSERT INTO naijue_erp.sku('}]){
    const f=fixture(options);await assert.rejects(resolveNativeDocumentSpecifications(f.context,{scope:f.scope,selections:[{spec}],newId:f.newId}));
    if(!options.fail)assert.ok(!f.calls.some(s=>s.includes('maintenance:audit')));
  }
});
test('v11 forged append tokens, fresh unregistered proof pair and closed original callback never authorize current xid',async()=>{
  const f=fixture({zeroSku:true});assert.throws(()=>f.catalogue.registerDocumentAppend({purpose:'DOCUMENT_SKU_APPEND_V1'}),{code:'TRANSACTION_SCOPE'});
  const out=await resolveNativeDocumentSpecifications(f.context,{scope:f.scope,selections:[{spec}],newId:f.newId});assert.equal(out.length,1);
  const fresh=createMaintainedCatalogue26TransactionProof(f.client,f.context.runtime,()=>{});
  await assert.rejects(fresh.verifier.assertComplete({productIds:[p],query:fresh.query}),{code:'NATIVE_CATALOGUE_FACTS_UNAVAILABLE'});
  f.close();await assert.rejects(f.catalogue.captureDocumentAppendBaseline([p]));
});
