import test from 'node:test';import assert from 'node:assert/strict';
import {assertStandard27CreatedBarcodeAggregate} from '../adapters/postgres/src/standard27-created-barcode-proof.ts';
import {sid} from './support/synthetic-fixtures.ts';
const p=sid('product',901),s=sid('sku',902),b=sid('barcode',903),o=sid('operation',904),a=sid('account',905),time='2026-11-03T00:00:00.000000Z';
function fixture(){const root={id:p,version:1,enabled:true,deleted_at:null};const sku={id:s,product_id:p,version:1,created_operation_id:o};const barcode={id:b,sku_id:s,barcode:'0001',barcode_kind:'MAIN',scheme_id:null,enabled:true};const after=JSON.stringify({...root,skus:[sku],barcodes:[barcode],images:[]});return {root:{...root,has_season_ids:false,season_ids:null},sku,barcode,record:{audit_id:o,operation_id:o,object_type:'PRODUCT',object_id:p,action:'CREATE',old_version:null,new_version:1,actor_account_id:a,occurred_at:time,receipt_id:o,status:'COMMITTED',target_type:'PRODUCT',target_id:p,receipt_action:'CREATE',receipt_actor:a,request_hash:'a'.repeat(64),completed_at:time,total_rows:'1',total_bytes:String(Buffer.byteLength(after)),before_values:null,after_values:after}};}
function queryFor(f:ReturnType<typeof fixture>){const calls:string[]=[];const query=async(sql:string,values?:unknown[])=>{calls.push(sql);assert.deepEqual(values,[p]);assert.doesNotMatch(sql,/FOR SHARE|FOR UPDATE|INSERT|DELETE|UPDATE|import_source_row/);if(sql.includes(':root'))return{rows:[f.root]};if(sql.includes(':skus'))return{rows:[f.sku]};if(sql.includes(':barcodes'))return{rows:[f.barcode]};if(sql.includes(':images'))return{rows:[]};if(sql.includes(':audit'))return{rows:[f.record]};throw Error('unexpected');};return{query,calls};}
test('created barcode proof reconstructs same-snapshot aggregate and retains raw binding',async()=>{const f=fixture(),q=queryFor(f);await assertStandard27CreatedBarcodeAggregate(q.query,p,b,s);assert.equal(q.calls.length,5);});
test('created aggregate rejects altered binding, missing CREATE, or unpaired receipt',async()=>{for(const mutate of [(f:ReturnType<typeof fixture>)=>f.barcode.sku_id=sid('sku',999),(f:ReturnType<typeof fixture>)=>f.record.action='EDIT',(f:ReturnType<typeof fixture>)=>f.record.receipt_id=sid('operation',999),(f:ReturnType<typeof fixture>)=>f.record.after_values=f.record.after_values.replace('0001','9999')]){const f=fixture();mutate(f);await assert.rejects(assertStandard27CreatedBarcodeAggregate(queryFor(f).query,p,b,s));}});

test('imported barcode proof reconstructs published source plus exact later EDIT',async()=>{
 const {assertStandard27ImportedBarcodeAggregate}=await import('../adapters/postgres/src/standard27-created-barcode-proof.ts');
 const f:any=fixture(),baseline={id:p,version:1,enabled:true,deleted_at:null,name:'before'},current={...baseline,version:2,name:'after'};f.root={...current,has_season_ids:false,season_ids:null};
 const sku={...f.sku,created_operation_id:null};f.sku=sku;const before=JSON.stringify({name:'before',version:1}),after=JSON.stringify({name:'after',version:2});
 f.record={...f.record,action:'EDIT',receipt_action:'EDIT',old_version:1,new_version:2,before_values:before,after_values:after,total_bytes:String(Buffer.byteLength(before)+Buffer.byteLength(after))};
 const batch=sid('operation',906),baselines:Record<string,Record<string,unknown>>={[p]:baseline,[s]:sku,[b]:f.barcode};const query=async(sql:string,values?:unknown[])=>{
  assert.doesNotMatch(sql,/FOR SHARE|FOR UPDATE|INSERT|DELETE|import_source_row/);
  if(sql.includes('barcode27-imported:enumerate')) return {rows:values![1]==='SKU'?[{target_id:s,parent_id:p}]:[{target_id:b,parent_id:s}]};
  if(sql.includes('source-ids')){const ids=values![1] as string[];return{rows:ids.map(target_id=>({target_id}))};}
  if(sql.includes('barcode27-imported:baseline')){assert.match(sql,/\(item->'fields'\)::text AS baseline_fields/);const ids=values![0] as string[];return{rows:ids.map(id=>({root_id:id,source_batch_id:batch,proof_valid:true,total_bytes:String(ids.reduce((n,id)=>n+Buffer.byteLength(JSON.stringify(baselines[id])),0)),baseline_fields:JSON.stringify(baselines[id])}))};}
  return queryFor(f).query(sql,values);
 };
 await assertStandard27ImportedBarcodeAggregate(query,p,b,s);
 const broken=async(sql:string,values?:unknown[])=>sql.includes('barcode27-imported:baseline')?{rows:[]} :query(sql,values);
 await assert.rejects(assertStandard27ImportedBarcodeAggregate(broken,p,b,s));
 const missingSku=sid('sku',997);const omitted=async(sql:string,values?:unknown[])=>{
  if(sql.includes('barcode27-imported:enumerate')&&values![1]==='SKU')return{rows:[{target_id:s,parent_id:p},{target_id:missingSku,parent_id:p}]};
  if(sql.includes('barcode27-imported:baseline')&&(values![0] as string[]).includes(missingSku))return{rows:[{root_id:s,source_batch_id:batch,proof_valid:true,total_bytes:String(Buffer.byteLength(JSON.stringify(sku))),baseline_fields:JSON.stringify(sku)}]};
  return query(sql,values);
 };
 await assert.rejects(assertStandard27ImportedBarcodeAggregate(omitted,p,b,s));
});
