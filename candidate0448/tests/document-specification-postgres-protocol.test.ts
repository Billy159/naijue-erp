/** SYNTHETIC protocol only: real adapters, scripted original client; no SQL engine. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNativeDocumentSpecifications } from '../adapters/postgres/src/native-document-specification.ts';
import { createStandardCatalogue27TransactionProof } from '../adapters/postgres/src/standard-catalogue-completeness27.ts';
import { createMaintainedCatalogue26TransactionProof } from '../adapters/postgres/src/catalogue-completeness.ts';
import type { PgSalesClient, PgSalesPool } from '../adapters/postgres/src/sales-unit-of-work.ts';
import type { NativeRuntime26Capability } from '../packages/application/src/native-import-schema-contract.ts';
import { PRODUCT_MAINTENANCE_MAX_SKUS, PRODUCT_MAINTENANCE_MAX_BARCODES } from '../packages/application/src/product-maintenance-validation.ts';
import { COMPLETE_SCOPE_DECISION } from '../packages/application/src/inventory-cutoff-import.ts';
import { CATALOGUE_PRICE_KEYS } from '../packages/application/src/catalogue-price-input.ts';
import { actor, ids, sid } from './support/synthetic-fixtures.ts';
const p=sid('product',610),group=sid('sizeGroup',614),category=sid('category',613),oldOperation=sid('operation',619);
const spec={productId:p,colorId:sid('color',615),fitId:sid('fit',616),sizeId:sid('size',617)};
type Row=Record<string,unknown>;
function fixture(options:{zeroSku?:boolean;outsideGroup?:boolean;uncommitted?:boolean;disabledSku?:boolean;role?:string;fail?:string;groupTwo?:boolean;groupCount?:number;barcode?:boolean;denyBarcode?:boolean;denySchema?:boolean}={}){
  const calls:string[]=[],ready:string[]=[];let active=true,sequence=1000;
  const root:Row={id:p,product_code:'SYNTHETIC',name:'Native product',category_id:category,supplier_id:null,season_id:null,size_group_id:group,
    year:null,system_item_code:options.barcode?'0000123':null,thickness:null,collar_pants_type:null,default_barcode_scheme_id:options.barcode?'0e70e45e-1a51-4d44-afe8-0002cf3fb7ef':null,enabled:true,version:1,deleted_at:null,
    ...Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k=>[k,k==='retail_price'?'1.25':null])),season_ids:[]};
  const oldSku:Row={id:ids.sku,product_id:p,color_id:spec.colorId,fit_id:spec.fitId,size_id:spec.sizeId,sku_code:'ORIGINAL_CODE',enabled:!options.disabledSku,version:1,created_operation_id:oldOperation};
  const barcodes:Row[]=[];
  const skus:Row[]=options.zeroSku?[]:[oldSku],audits:Row[]=[{id:sid('audit',801),operation_id:oldOperation,actor_account_id:actor.accountId,
    object_type:'PRODUCT',object_id:p,action:'CREATE',old_version:null,new_version:1,before_values:null,after_values:{...structuredClone(root),skus:structuredClone(skus),barcodes:[]},
    occurred_at:'2026-10-22T00:00:00.000Z',receipt_id:oldOperation,receipt_actor:actor.accountId,target_type:'PRODUCT',target_id:p,receipt_action:'CREATE',status:'COMMITTED',
    request_key:'SYNTHETIC-ORIGINAL',request_hash:'a'.repeat(64),result_data:{operationId:oldOperation,kind:'PRODUCT',targetId:p,version:1},completed_at:'2026-10-22T00:00:00.000000Z',committed_before:!options.uncommitted}];
  const client:PgSalesClient={async query(sql,values=[]){calls.push(sql);if(options.fail && sql.includes(options.fail))throw Object.assign(Error('SYNTHETIC injected'),{code:'23505'});
    let rows:Row[]=[];
    if(sql.includes('business-catalogue27:append-baseline'))rows=[{id:p,version:root.version}];
    else if(sql.includes('business-catalogue27:products'))rows=[{product_id:p}];
    else if(sql.includes('business-catalogue27:skus'))rows=skus.filter(s=>(values[0] as string[]).includes(s.id as string)).map(s=>({sku_id:s.id,product_id:s.product_id}));
    else if(sql.includes('document-specification:group-sizes'))rows=(options.groupCount?Array.from({length:options.groupCount},(_,i)=>i===0?spec.sizeId:sid('size',10000+i)):options.groupTwo?[spec.sizeId,sid('size',618)]:[spec.sizeId]).map(size_id=>({size_id}));
    else if(sql.includes('document-specification:product'))rows=[{...root}];
    else if(sql.includes('document-specification:member'))rows=options.outsideGroup?[]:[{id:p}];
    else if(sql.includes('document-specification:existing-sizes'))rows=skus.filter(s=>s.product_id===values[0]&&s.color_id===values[1]&&s.fit_id===values[2]&&(values[3] as string[]).includes(s.size_id as string)).map(s=>({id:s.id,size_id:s.size_id,enabled:s.enabled}));
    else if(sql.includes('document-specification:tuple'))rows=skus.filter(s=>s.product_id===values[0]&&s.color_id===values[1]&&s.fit_id===values[2]&&s.size_id===values[3]).map(s=>({id:s.id,enabled:s.enabled}));
    else if(sql.includes('maintained-catalogue26:roots'))rows=[{...root,committed_before:root.version===1&&!options.uncommitted}];
    else if(sql.includes('maintained-catalogue26:product-source'))rows=[];
    else if(sql.includes('maintained-catalogue26:chain'))rows=audits;
    else if(sql.includes('maintained-catalogue26:skus'))rows=skus.map(s=>({facts:s,native_creation_valid:true,committed_before:s.created_operation_id===oldOperation&&!options.uncommitted}));
    else if(sql.includes('maintained-catalogue26:barcodes'))rows=barcodes.map(facts=>({facts,committed_before:false}));
    else if(sql.includes('maintained-catalogue26:images'))rows=[];
    else if(sql.includes('document-append:barcode-successor-v1'))rows=[{guards:!options.denySchema,reference_guards:true,root_before_guard:true,root_final_guard:true,sku_write_guard:true,sku_insert_columns:true,product_version_update:true,insert_columns:!options.denyBarcode,deferred_guard:true,actor_guard:true,sku_guard:true,barcode_guard:true,barcode_identity:true}];
    else if(sql.includes('product-barcode:scheme'))rows=[{id:values[0],status:'CURRENT',code_length:15}];
    else if(sql.includes('product-barcode:codes'))rows=(values[0] as string[]).map(id=>({id,code:sql.includes('naijue_erp.color')?'504':sql.includes('naijue_erp.fit')?'5':id===sid('size',618)?'208':'207'}));
    else if(sql.includes('product-barcode:existing-values'))rows=[];
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
    else if(sql.startsWith('INSERT INTO naijue_erp.sku_barcode')){const keys=['id','barcode','sku_id','barcode_kind','scheme_id','enabled'];barcodes.push(Object.fromEntries(keys.map((k,i)=>[k,values[i]])));return {rows:[],rowCount:1};}
    else if(sql.startsWith('INSERT INTO naijue_erp.sku(')){const keys=['id','product_id','sku_code','color_id','fit_id','size_id','enabled','version','created_operation_id'];skus.push(Object.fromEntries(keys.map((k,i)=>[k,values[i]])));return {rows:[],rowCount:1};}
    else if(sql.includes('FROM naijue_erp.product WHERE id=$1::uuid FOR UPDATE'))rows=[{...root}];
    else if(sql.startsWith('SELECT id, product_id, sku_code, color_id, fit_id, size_id, enabled, version, created_operation_id\n      FROM naijue_erp.sku WHERE product_id=$1::uuid AND ')){
      assert.match(sql,/ ORDER BY id LIMIT \$2 FOR UPDATE$/);assert.deepEqual(values,[p,PRODUCT_MAINTENANCE_MAX_SKUS+1,COMPLETE_SCOPE_DECISION]);
      for(const predicate of (sql.includes("ordinary-business-skus")?[]:["native_creation_operation_valid('SKU',sku.id,sku.created_operation_id)","b.status='IMPORTED'","m.validator_version='HISTORY_TYPED_CLOSURE_V1'","r.action='IMPORT_PUBLISH'","r.status='COMMITTED'",'f.decision_reason=$3::text','pg_current_xact_id_if_assigned()']))assert.ok(sql.includes(predicate),predicate);
      rows=skus;
    }
    else if(sql.startsWith('SELECT bc.id,bc.barcode,bc.sku_id,bc.barcode_kind,bc.scheme_id,bc.enabled FROM naijue_erp.sku_barcode bc\n      WHERE bc.sku_id=ANY($4::uuid[]) AND ')){
      assert.match(sql,/ ORDER BY bc.id LIMIT \$2 FOR UPDATE OF bc$/);assert.deepEqual(values,[p,PRODUCT_MAINTENANCE_MAX_BARCODES+1,COMPLETE_SCOPE_DECISION,skus.map(row=>row.id)]);
      for(const predicate of (sql.includes("ordinary-business-barcodes")?[]:["s.entity_type='BARCODE'","b.status='IMPORTED'","r.action='IMPORT_PUBLISH'","a.action IN ('CREATE','EDIT')","r.status='COMMITTED'",'pg_current_xact_id_if_assigned()']))assert.ok(sql.includes(predicate),predicate);
      rows=[];
    }
    else if(sql.includes('FROM naijue_erp.barcode_scheme WHERE'))rows=(values[0] as string[]).map(id=>({id}));
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
  return {root,skus,barcodes,audits,calls,ready,client,catalogue,scope,context:{pool,client,runtime,assertBound,catalogue},newId:(kind:'sku'|'operation'|'barcode')=>sid(kind,sequence++),close(){active=false;}};
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
function v27(f:ReturnType<typeof fixture>){const runtime={profile:'EXACT27' as const,contract:'STANDARD_RUNTIME27_COMMAND_V1' as const,async assertReady(c:object){assert.equal(c,f.client);}};return {...f.context,runtime,catalogue:createStandardCatalogue27TransactionProof(f.client,runtime,f.context.assertBound)};}
test('document creation expands the selected color-fit across the complete size group', async () => {
  const f = fixture({zeroSku:true,groupTwo:true});
  const out = await resolveNativeDocumentSpecifications(v27(f), {scope:f.scope, selections:[{spec}], newId:f.newId});
  assert.equal(out.length, 1);
  assert.deepEqual(new Set(f.skus.map(s => s.size_id)), new Set([spec.sizeId, sid('size',618)]));
});

test('document append writes generated barcode in the original transaction and records exact facts', async () => {
  const f=fixture({zeroSku:true,barcode:true});
  await resolveNativeDocumentSpecifications(v27(f),{scope:f.scope,selections:[{spec}],newId:f.newId});
  assert.equal(f.barcodes.length,1); assert.equal(f.barcodes[0]!.barcode,'550000123504207');
  assert.equal(f.barcodes[0]!.sku_id,f.skus[0]!.id);
  assert.deepEqual((f.audits[1]!.after_values as Row).barcodes,f.barcodes);
  assert.ok(!f.calls.some(s=>/\b(?:BEGIN|COMMIT|ROLLBACK)\b/.test(s)));
});

test('document append without installed barcode successor fails before any product or SKU write', async () => {
  const f=fixture({zeroSku:true,barcode:true,denyBarcode:true});
  await assert.rejects(resolveNativeDocumentSpecifications(v27(f),{scope:f.scope,selections:[{spec}],newId:f.newId}),{code:'DOCUMENT_BARCODE_SCHEMA_NOT_READY'});
  assert.equal(f.skus.length,0); assert.equal(f.barcodes.length,0); assert.equal(f.root.version,1);
  assert.ok(!f.calls.some(s=>s.includes('maintenance:audit')));
});

test('runtime27 document append uses normal business rows on the original transaction', async () => {
 const f=fixture({zeroSku:true,barcode:true,groupTwo:true});
 const runtime={profile:'EXACT27' as const,contract:'STANDARD_RUNTIME27_COMMAND_V1' as const,async assertReady(c:object){assert.equal(c,f.client);}};
 const catalogue=createStandardCatalogue27TransactionProof(f.client,runtime,f.context.assertBound);
 const ids=await resolveNativeDocumentSpecifications({...f.context,runtime,catalogue},{scope:f.scope,selections:[{spec}],newId:f.newId});
 assert.equal(ids.length,1); assert.equal(f.skus.length,2); assert.equal(f.barcodes.length,2);
 assert.ok(!f.calls.some(s=>/import_record|import_source_row|maintained-catalogue26/.test(s)));
 assert.equal(f.audits.length,2);
});
test('existing selected SKU still fills other missing sizes of the same selected color-fit', async () => {
  const f=fixture({groupTwo:true});
  const out=await resolveNativeDocumentSpecifications(v27(f),{scope:f.scope,selections:[{spec}],newId:f.newId});
  assert.equal(out[0],ids.sku); assert.deepEqual(new Set(f.skus.map(s=>s.size_id)),new Set([spec.sizeId,sid('size',618)]));
  assert.equal(f.skus.find(s=>s.id===ids.sku)!.sku_code,'ORIGINAL_CODE');
});

test('document append without barcode still checks full-group guard before SKU write',async()=>{
 const f=fixture({zeroSku:true,denySchema:true});
 await assert.rejects(resolveNativeDocumentSpecifications(v27(f),{scope:f.scope,selections:[{spec}],newId:f.newId}),{code:'DOCUMENT_BARCODE_SCHEMA_NOT_READY'});
 assert.equal(f.skus.length,0);assert.equal(f.root.version,1);assert.ok(!f.calls.some(s=>s.includes('maintenance:audit')));
});
test('missing barcode data does not require barcode INSERT privilege to save SKU',async()=>{
 const f=fixture({zeroSku:true,denyBarcode:true});
 const result=await resolveNativeDocumentSpecifications(v27(f),{scope:f.scope,selections:[{spec}],newId:f.newId});
 assert.equal(result.length,1);assert.equal(f.skus.length,1);assert.equal(f.barcodes.length,0);
});
test('EXACT26 retains the original selected-SKU-only append without requiring V27 successor',async()=>{
 const f=fixture({zeroSku:true});const result=await resolveNativeDocumentSpecifications(f.context,{scope:f.scope,selections:[{spec}],newId:f.newId});
 assert.equal(result.length,1);assert.equal(f.skus.length,1);assert.equal(f.barcodes.length,0);assert.ok(!f.calls.some(s=>s.includes('document-append:barcode-successor-v1')));f.close();
});

test('runtime27 appends a 201-size group atomically without a 200-SKU cutoff',async()=>{const f=fixture({zeroSku:true,groupCount:201});const out=await resolveNativeDocumentSpecifications(v27(f),{scope:f.scope,selections:[{spec}],newId:f.newId});assert.equal(out.length,1);assert.equal(f.skus.length,201);assert.equal(f.audits.length,2);assert.equal(f.calls.filter(s=>s.includes('document-specification:existing-sizes')).length,1);assert.ok(f.calls.filter(s=>s.includes('document-specification:tuple')).length<=1);});
