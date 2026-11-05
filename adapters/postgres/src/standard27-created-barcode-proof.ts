import { entityId } from '../../../packages/domain/src/values.ts';
import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { CATALOGUE_PRICE_KEYS } from '../../../packages/application/src/catalogue-price-input.ts';
import { decodeStandard27AuditJson } from '../../../packages/application/src/standard27-audit-exact-decoder.ts';
import { standardRootProofSql } from './standard-catalogue-completeness27.ts';
import { modelStandard27ProductCapacity, modelStandard27CreatedProductCapacity } from '../../../packages/application/src/standard27-product-capacity-model.ts';
type Query=(sql:string,values?:unknown[])=>Promise<{rows:readonly Record<string,unknown>[]}>;
const fail=(v:unknown):void=>requireDomain(v,'CURRENT_FORM_READ_UNAVAILABLE','Created product aggregate evidence unavailable');
const ROOT=['id','product_code','name','category_id','supplier_id','season_id','size_group_id','year','system_item_code','thickness','collar_pants_type','default_barcode_scheme_id','enabled','version','deleted_at',...CATALOGUE_PRICE_KEYS] as const;
/** Same-snapshot, bounded SELECT-only CREATE aggregate reconstruction. This is a
 * consumer, not an issuer: before use, host must independently prove exact
 * catalog, unfiltered RLS/effective SELECT, immutable guards, published baseline
 * and original repeatable-read read-only client. No DB proof or host issuer is
 * asserted here. Image-bearing aggregates conservatively remain unavailable. */
async function assertStandard27BarcodeAggregate(query:Query,productId:string,bindingId:string,skuId:string, mode:'CREATED'|'IMPORTED'):Promise<void>{
 entityId('product',productId);entityId('barcode',bindingId);entityId('sku',skuId);
 const projection=ROOT.map(k=>CATALOGUE_PRICE_KEYS.includes(k as typeof CATALOGUE_PRICE_KEYS[number])?`${k}::text AS ${k}`:k==='deleted_at'?`to_char(deleted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS deleted_at`:k).join(',');
 const roots=(await query(`/* barcode27-created:root */ SELECT ${projection},to_jsonb(p) ? 'season_ids' AS has_season_ids,to_jsonb(p)->'season_ids' AS season_ids FROM naijue_erp.product p WHERE id=$1::uuid LIMIT 2`,[productId])).rows;
 fail(roots.length===1&&roots[0]!.id===productId&&typeof roots[0]!.has_season_ids==='boolean');
 const {has_season_ids,season_ids,...product}=roots[0]!;if(has_season_ids===true)product.season_ids=season_ids;
 const skus=(await query(`/* barcode27-created:skus */ SELECT id,product_id,color_id,fit_id,size_id,sku_code,enabled,version,created_operation_id FROM naijue_erp.sku WHERE product_id=$1::uuid ORDER BY id LIMIT 5001`,[productId])).rows;
 const barcodes=(await query(`/* barcode27-created:barcodes */ SELECT b.id,b.barcode,b.sku_id,b.barcode_kind,b.scheme_id,b.enabled FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.product_id=$1::uuid ORDER BY b.id LIMIT 20001`,[productId])).rows;
 const images=(await query(`/* barcode27-created:images */ SELECT id FROM naijue_erp.product_image WHERE product_id=$1::uuid LIMIT 1`,[productId])).rows;
 fail(skus.length<=5000&&barcodes.length<=20000&&images.length===0&&skus.some(s=>s.id===skuId&&s.product_id===productId)&&barcodes.some(b=>b.id===bindingId&&b.sku_id===skuId));
 const records=(await query(`/* barcode27-created:audit */ WITH a AS MATERIALIZED (SELECT * FROM naijue_erp.audit_change WHERE object_type='PRODUCT' AND object_id=$1::uuid ORDER BY new_version,id LIMIT 1025),
 r AS MATERIALIZED (SELECT * FROM naijue_erp.operation_receipt WHERE target_type='PRODUCT' AND target_id=$1::uuid ORDER BY id LIMIT 1025),
 paired AS (SELECT a.id audit_id,a.operation_id,a.object_type,a.object_id,a.action,a.old_version,a.new_version,a.actor_account_id,
 to_char(a.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') occurred_at,a.before_values,a.after_values,
 r.id receipt_id,r.status,r.target_type,r.target_id,r.action receipt_action,r.actor_account_id receipt_actor,r.request_hash,
 to_char(r.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') completed_at FROM a FULL OUTER JOIN r ON r.id=a.operation_id),
 sized AS (SELECT *,count(*) OVER() total_rows,sum(octet_length(coalesce(before_values::text,''))+octet_length(coalesce(after_values::text,''))) OVER() total_bytes FROM paired)
 SELECT audit_id,operation_id,object_type,object_id,action,old_version,new_version,actor_account_id,occurred_at,receipt_id,status,target_type,target_id,receipt_action,receipt_actor,request_hash,completed_at,total_rows::text,total_bytes::text,
 CASE WHEN total_rows<=1024 AND total_bytes<=16777216 THEN before_values::text END before_values,CASE WHEN total_rows<=1024 AND total_bytes<=16777216 THEN after_values::text END after_values FROM sized ORDER BY new_version,audit_id`,[productId])).rows;
 fail(records.length>0&&records.length<=1024);const operations=new Set<string>();
 const steps=records.map(row=>{
  fail(row.total_rows===String(records.length)&&typeof row.total_bytes==='string'&&/^(0|[1-9][0-9]*)$/.test(row.total_bytes)&&BigInt(row.total_bytes)<=16777216n&&row.total_bytes===records[0]!.total_bytes);
  fail(typeof row.operation_id==='string'&&!operations.has(row.operation_id)&&row.receipt_id===row.operation_id&&row.object_id===productId&&row.target_id===productId&&row.object_type==='PRODUCT'&&row.target_type==='PRODUCT'&&row.action===row.receipt_action&&row.actor_account_id===row.receipt_actor&&row.occurred_at===row.completed_at&&row.status==='COMMITTED'&&typeof row.after_values==='string');operations.add(row.operation_id as string);
  const after_values=decodeStandard27AuditJson(row.after_values as string),before_values=row.before_values===null?null:decodeStandard27AuditJson(row.before_values as string);
  const receipt={id:row.receipt_id,status:row.status,target_type:row.target_type,target_id:row.target_id,action:row.receipt_action,actor_account_id:row.receipt_actor,request_hash:row.request_hash,completed_at:row.completed_at};
  const audit={operation_id:row.operation_id,object_type:row.object_type,object_id:row.object_id,action:row.action,old_version:row.old_version,new_version:row.new_version,actor_account_id:row.actor_account_id,occurred_at:row.occurred_at,before_values,after_values};return {receipt,audit};
 });
 const actual={product:product as never,skus:skus as never,barcodes:barcodes as never,images:[]};
 if(mode==='CREATED') {
  fail(steps[0]!.audit.action==='CREATE'&&steps[0]!.audit.before_values===null&&steps[0]!.audit.old_version===null);
  try { modelStandard27CreatedProductCapacity({productId,create:steps[0] as never,chain:steps.slice(1) as never,actual}); }
  catch { requireDomain(false,'CURRENT_FORM_READ_UNAVAILABLE','Created product aggregate chain mismatch'); }
 } else {
  let baselineBytes=0;
  const imported=async(kind:'PRODUCT'|'SKU'|'SKU_BARCODE',ids:string[])=>{
   if(!ids.length)return [];
   const source=(await query(`/* barcode27-imported:source-ids */ SELECT target_id FROM naijue_erp.import_record WHERE target_type=$1::text AND target_id=ANY($2::uuid[]) ORDER BY target_id LIMIT $3`,[kind,ids,ids.length+1])).rows;
   fail(source.length<=ids.length);const sourceIds=source.map(x=>x.target_id);fail(sourceIds.every(x=>typeof x==='string'&&ids.includes(x))&&new Set(sourceIds).size===sourceIds.length);
   if(!source.length)return [];
   let sql=standardRootProofSql(kind==='SKU_BARCODE'?'SKU':kind);
   const once=(old:string,next:string)=>{fail(sql.split(old).length===2);sql=sql.replace(old,next);};
   once(' FOR SHARE OF p','');
   once(`AND to_jsonb(p)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.${kind==='SKU_BARCODE'?'sku':kind.toLowerCase()},item->'fields'))`,'');
   if(kind==='SKU_BARCODE'){fail(sql.split('naijue_erp.sku').length===2&&sql.split("'SKU'").length===4);sql=sql.replaceAll('naijue_erp.sku','naijue_erp.sku_barcode').replaceAll("'SKU'","'SKU_BARCODE'");once('p.id AS sku_id, p.product_id,','p.id AS barcode_id, p.sku_id,');}
   once("AS source_prices,", "AS source_prices, b.id::text AS source_batch_id, (item->'fields')::text AS baseline_fields,");
   once('/* standard-catalogue27:exact-imported-','/* barcode27-imported:baseline standard-catalogue27:exact-imported-');
   sql=`WITH bounded_proof AS MATERIALIZED (${sql}), sized_proof AS (SELECT *,sum(octet_length(baseline_fields)) OVER() total_bytes FROM bounded_proof) SELECT root_id,proof_valid,source_batch_id,total_bytes::text,CASE WHEN total_bytes<=16777216 THEN baseline_fields ELSE NULL END baseline_fields FROM sized_proof`;
   const rows=(await query(sql,[sourceIds,sourceIds.length+1,[]])).rows;fail(rows.length===sourceIds.length);const seen=new Set<string>();
   return rows.map((row,index)=>{fail(typeof row.root_id==='string'&&sourceIds.includes(row.root_id)&&!seen.has(row.root_id)&&row.proof_valid===true&&typeof row.baseline_fields==='string'&&typeof row.total_bytes==='string'&&/^(0|[1-9][0-9]*)$/.test(row.total_bytes)&&row.total_bytes===rows[0]!.total_bytes);seen.add(row.root_id as string);if(index===0){baselineBytes+=Number(row.total_bytes);fail(Number.isSafeInteger(baselineBytes)&&baselineBytes<=16777216);}const field=decodeStandard27AuditJson(row.baseline_fields as string);fail(field.id===row.root_id&&typeof row.source_batch_id==='string');return {field,batchId:row.source_batch_id as string};});
  };
  const baselineProduct=await imported('PRODUCT',[productId]);fail(baselineProduct.length===1);
  const batchId=baselineProduct[0]!.batchId;entityId('operation',batchId);
  const enumerate=async(kind:'SKU'|'SKU_BARCODE',parentIds:string[])=>{
   if(!parentIds.length)return [];
   const rows=(await query(`/* barcode27-imported:enumerate */ SELECT i.target_id,item->'fields'->>$4::text parent_id FROM naijue_erp.import_record i
    JOIN naijue_erp.operation_receipt r ON r.id=(i.decision_reason::jsonb->>'operationId')::uuid
    JOIN naijue_erp.audit_change a ON a.operation_id=r.id
    CROSS JOIN LATERAL jsonb_array_elements(a.after_values->'records') item
    WHERE i.import_batch_id=$1::uuid AND i.target_type=$2::text AND item->>'id'=i.id::text AND item->'fields'->>$4::text=ANY($3::text[])
    ORDER BY i.target_id LIMIT $5`,[batchId,kind,parentIds,kind==='SKU'?'product_id':'sku_id',kind==='SKU'?5001:20001])).rows;
   fail(rows.length<=(kind==='SKU'?5000:20000));const seen=new Set<string>();return rows.map(row=>{fail(typeof row.target_id==='string'&&typeof row.parent_id==='string'&&parentIds.includes(row.parent_id)&&!seen.has(row.target_id));seen.add(row.target_id as string);return row.target_id as string;});
  };
  const baselineSkuIds=await enumerate('SKU',[productId]);const baselineBarcodeIds=await enumerate('SKU_BARCODE',baselineSkuIds);
  const baselineSkus=await imported('SKU',baselineSkuIds);const baselineBarcodes=await imported('SKU_BARCODE',baselineBarcodeIds);
  fail([...baselineSkus,...baselineBarcodes].every(x=>x.batchId===batchId));
  try { modelStandard27ProductCapacity({productId,baseline:{kind:'PUBLISHED_STANDARD_PRODUCT',product:baselineProduct[0]!.field as never,skus:baselineSkus.map(x=>x.field) as never,barcodes:baselineBarcodes.map(x=>x.field) as never,images:[]},chain:steps as never,actual}); }
  catch { requireDomain(false,'CURRENT_FORM_READ_UNAVAILABLE','Imported product aggregate chain mismatch'); }
 }
}

export const assertStandard27CreatedBarcodeAggregate=(query:Query,productId:string,bindingId:string,skuId:string)=>assertStandard27BarcodeAggregate(query,productId,bindingId,skuId,'CREATED');
export const assertStandard27ImportedBarcodeAggregate=(query:Query,productId:string,bindingId:string,skuId:string)=>assertStandard27BarcodeAggregate(query,productId,bindingId,skuId,'IMPORTED');
