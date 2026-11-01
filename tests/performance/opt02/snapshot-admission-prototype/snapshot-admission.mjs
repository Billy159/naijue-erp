/** TEST-ONLY SQL/flow prototype. No pool/transaction/issuer/permission authority.
 * The future original reader must supply its SAME already-authorized RR query.
 * No runtime import of this prototype, schema change or benchmark is implied. */
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { captureData } from '../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { DomainError, requireDomain } from '../../../../packages/domain/src/errors.ts';
import { entityId } from '../../../../packages/domain/src/values.ts';
import { COMPLETE_SCOPE_DECISION } from '../../../../packages/application/src/inventory-cutoff-import.ts';
import { checkedProductManagementGrant, parseProductManagementListQuery, activeProductManagementRead } from '../../../../packages/application/src/product-management-query-validation.ts';
import { checkedProductManagementListPage } from '../../../../packages/application/src/product-management-query-validation.ts';
import { awaitRead } from '../../../../packages/application/src/read-resource.ts';
import { decodeImportCheckpoint } from '../../../../adapters/postgres/src/inventory-cutoff-import-store.ts';
import { booleanValue, stringValue } from '../../../../adapters/postgres/src/codec.ts';
import { GUARD_CAPABILITY } from '../../../../adapters/postgres/src/inventory-publication-guards.ts';
const H=x=>createHash('sha256').update(x).digest('hex');
export const SOURCE_PINS=Object.freeze({ reader:'7021ca6733160465e726b55fde62bf164de780ccdb302ff92a589d1babf872d1', admission:'18ad09f32567dcd5a7fe57681a5f741d617805b2e76b3334c6a0b71f738a0f65' });
const sourceBundles=new WeakSet();
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const integrity=(ok,message)=>requireDomain(ok,'PRODUCT_MANAGEMENT_INTEGRITY_FAILED',message);
const one=rows=>{integrity(rows.length===1,'Expected one product management evidence row');return rows[0];};
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
function extract(sql,tag){const m=sql.match(new RegExp('query\\(`(/\\* '+tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' \\*/[\\s\\S]*?)`'));need(m,'EXACT_ORIGINAL_QUERY_TEMPLATE_REQUIRED:'+tag);return m[1];}
function matchedSql(text,retainedDelete,seasonArray){
 need(typeof retainedDelete==='boolean'&&typeof seasonArray==='boolean','EXPLICIT_ORIGINAL_READER_FLAGS_REQUIRED');
 const scope=text.match(/const scope = \(retainedDelete: boolean\) => `([\s\S]*?)`;/)[1]
  .replace('${retainedDelete ? "p.deleted_at IS NULL AND " : ""}',retainedDelete?'p.deleted_at IS NULL AND ':'');
 return text.match(/const matched = \(retainedDelete: boolean, seasonArray: boolean\) => `([\s\S]*?)`;/)[1]
  .replace('${scope(retainedDelete)}',scope)
  .replace('${seasonArray ? "p.season_ids && $6::uuid[]" : "p.season_id = ANY($6::uuid[])"}',seasonArray?'p.season_ids && $6::uuid[]':'p.season_id = ANY($6::uuid[])');
}
// These CTEs factor the original23 dimensional decisions, not stock arithmetic.
// No enabled/deleted/hall restriction is added to the original admission facts.
const warehouseFacts=`witness_sku AS MATERIALIZED (
 SELECT s.id,s.created_operation_id,EXISTS(SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id=p.size_group_id AND m.size_id=s.size_id) AS size_valid,
 EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=$1::uuid AND r.status='IMPORTED' AND r.target_type='SKU' AND r.target_id=s.id) AS cutoff_member
 FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id JOIN naijue_erp.color c ON c.id=s.color_id
 JOIN naijue_erp.fit f ON f.id=s.fit_id JOIN naijue_erp.size z ON z.id=s.size_id WHERE s.id=$2::uuid
), warehouse_facts AS MATERIALIZED (
 SELECT u.id,w.created_operation_id,h.id IS NOT NULL AS warehouse_valid FROM uncovered u
 JOIN naijue_erp.warehouse w ON w.id=u.id LEFT JOIN naijue_erp.hall h ON h.id=w.hall_id
), witness_basis AS MATERIALIZED (
 SELECT s.*,CASE WHEN s.size_valid AND EXISTS(SELECT 1 FROM warehouse_facts w WHERE w.warehouse_valid) THEN
 CASE WHEN s.cutoff_member THEN 'CUTOFF_MEMBER' WHEN naijue_erp.native_creation_operation_valid('SKU',s.id,s.created_operation_id) IS TRUE THEN 'POST_CUTOFF_CREATED' END END AS sku_basis FROM witness_sku s
), warehouse_basis AS MATERIALIZED (
 SELECT w.*,CASE WHEN w.warehouse_valid AND EXISTS(SELECT 1 FROM witness_sku s WHERE s.size_valid) THEN
 CASE WHEN naijue_erp.native_creation_operation_valid('WAREHOUSE',w.id,w.created_operation_id) IS TRUE THEN 'POST_CUTOFF_CREATED' END END AS warehouse_basis FROM warehouse_facts w
), admission_decisions AS MATERIALIZED (
 SELECT w.id AS key_id,((w.warehouse_valid AND s.size_valid) AND w.warehouse_basis IS NOT NULL AND s.sku_basis IS NOT NULL) IS TRUE AS admitted,
 $1::uuid AS published_batch_id,CASE WHEN w.warehouse_valid AND s.size_valid THEN w.warehouse_basis END AS warehouse_basis,
 CASE WHEN w.warehouse_valid AND s.size_valid THEN s.sku_basis END AS sku_basis,
 CASE WHEN w.warehouse_valid THEN w.created_operation_id END AS warehouse_created_operation_id,
 CASE WHEN w.warehouse_valid THEN s.created_operation_id END AS sku_created_operation_id
 FROM warehouse_basis w LEFT JOIN witness_basis s ON true
)`;
const skuFacts=`warehouse_witness AS MATERIALIZED (
 SELECT w.id,w.created_operation_id,h.id IS NOT NULL AS warehouse_valid,
 EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=$11::uuid AND r.status='IMPORTED' AND r.target_type='WAREHOUSE' AND r.target_id=w.id) AS cutoff_member
 FROM naijue_erp.warehouse w LEFT JOIN naijue_erp.hall h ON h.id=w.hall_id WHERE w.id=$12::uuid
), sku_facts AS MATERIALIZED (
 SELECT u.id,s.created_operation_id,EXISTS(SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id=p.size_group_id AND m.size_id=s.size_id) AS size_valid
 FROM uncovered u JOIN naijue_erp.sku s ON s.id=u.id JOIN naijue_erp.product p ON p.id=s.product_id JOIN naijue_erp.color c ON c.id=s.color_id
 JOIN naijue_erp.fit f ON f.id=s.fit_id JOIN naijue_erp.size z ON z.id=s.size_id
), warehouse_basis AS MATERIALIZED (
 SELECT w.*,CASE WHEN w.warehouse_valid AND EXISTS(SELECT 1 FROM sku_facts s WHERE s.size_valid) THEN
 CASE WHEN w.cutoff_member THEN 'CUTOFF_MEMBER' WHEN naijue_erp.native_creation_operation_valid('WAREHOUSE',w.id,w.created_operation_id) IS TRUE THEN 'POST_CUTOFF_CREATED' END END AS warehouse_basis FROM warehouse_witness w
), sku_basis AS MATERIALIZED (
 SELECT s.*,CASE WHEN s.size_valid AND EXISTS(SELECT 1 FROM warehouse_witness w WHERE w.warehouse_valid) THEN
 CASE WHEN naijue_erp.native_creation_operation_valid('SKU',s.id,s.created_operation_id) IS TRUE THEN 'POST_CUTOFF_CREATED' END END AS sku_basis FROM sku_facts s
), admission_decisions AS MATERIALIZED (
 SELECT u.id AS key_id,((w.warehouse_valid AND s.size_valid) AND w.warehouse_basis IS NOT NULL AND s.sku_basis IS NOT NULL) IS TRUE AS admitted,
 $11::uuid AS published_batch_id,CASE WHEN w.warehouse_valid AND s.size_valid THEN w.warehouse_basis END AS warehouse_basis,
 CASE WHEN w.warehouse_valid AND s.size_valid THEN s.sku_basis END AS sku_basis,
 CASE WHEN w.warehouse_valid THEN w.created_operation_id END AS warehouse_created_operation_id,
 CASE WHEN w.warehouse_valid THEN s.created_operation_id END AS sku_created_operation_id
 FROM uncovered u LEFT JOIN sku_basis s ON s.id=u.id LEFT JOIN warehouse_basis w ON true
)`;
// Avoid an O(N^2) correlated rescan over the materialized decision set. Keep
// the original count/shape/scope expressions, grouped by the original ordinal.
function aggregateDecisionSet(sql){
 const pattern=/SELECT u\.ordinal,\(u\.ordinal-1\)\/1000 AS legacy_batch,d\.\* FROM uncovered u CROSS JOIN LATERAL \(\n([\s\S]*?)FROM admission_decisions a WHERE a\.key_id=u\.id\n\s*\) d/;
 const match=sql.match(pattern);need(match,'EXACT_ORIGINAL_AGGREGATE_BOUNDARY_REQUIRED');
 const expressions=match[1].trim().replace(/^SELECT count\(\*\)/,'count(a.key_id)');
 need(expressions!==match[1].trim(),'SOURCE_DECISION_COUNT_REQUIRED');
 return sql.replace(pattern,()=> 'SELECT u.ordinal,(u.ordinal-1)/1000 AS legacy_batch, '+expressions+'\n FROM uncovered u LEFT JOIN admission_decisions a ON a.key_id=u.id GROUP BY u.ordinal');
}
export function createPrototypeSources(input){
 const {readerSourceText,admissionSourceText}=captureData(input,['readerSourceText','admissionSourceText']);
 need(typeof readerSourceText==='string'&&typeof admissionSourceText==='string'&&H(readerSourceText)===SOURCE_PINS.reader&&H(admissionSourceText)===SOURCE_PINS.admission,'PINNED_ORIGINAL_ADMISSION_AND_READER_SOURCE_REQUIRED');
 const shape=readerSourceText.match(/const admissionShape = `([\s\S]*?)`;/)[1];
 const originalWarehouse=extract(readerSourceText,'product-management:stock-additional-warehouse-proof').replaceAll('${admissionShape}',shape);
 const originalSku=extract(readerSourceText,'product-management:stock-additional-sku-proof').replaceAll('${admissionShape}',shape);
 const warehouseSql=aggregateDecisionSet(originalWarehouse.replace('), decisions AS MATERIALIZED (','), '+warehouseFacts+', decisions AS MATERIALIZED (')
  .replace('FROM naijue_erp.inventory_key_admission(u.id,$2::uuid) a','FROM admission_decisions a WHERE a.key_id=u.id'));
 const b=freeze({publicationSql:extract(readerSourceText,'product-management:publication'),coverageTemplate:extract(readerSourceText,'product-management:stock-coverage'),
  skuWitnessSql:extract(readerSourceText,'product-management:stock-sku-witness'),nativeSkuWitnessSql:extract(readerSourceText,'product-management:stock-native-sku-witness'),
  warehouseWitnessSql:extract(readerSourceText,'product-management:stock-warehouse-witness'),warehouseSql,
  skuTemplate:aggregateDecisionSet(originalSku.replace('), decisions AS MATERIALIZED (','), '+skuFacts+', decisions AS MATERIALIZED (').replace('FROM naijue_erp.inventory_key_admission($12::uuid,u.id) a','FROM admission_decisions a WHERE a.key_id=u.id')),
  readerSourceText,originalWarehouse,originalSku});
 sourceBundles.add(b);return b;
}
export function prototypeStatements(sources,{retainedDelete,seasonArray}){
 need(sourceBundles.has(sources),'ORIGINAL_PROTOTYPE_SOURCE_BUNDLE_REQUIRED');const matched=matchedSql(sources.readerSourceText,retainedDelete,seasonArray);
 return freeze({publication:sources.publicationSql,guards:GUARD_CAPABILITY,coverage:sources.coverageTemplate.replace('${matchedSql}',matched),
  skuWitness:sources.skuWitnessSql,nativeSkuWitness:sources.nativeSkuWitnessSql,warehouseWitness:sources.warehouseWitnessSql,
  warehouses:sources.warehouseSql,skus:sources.skuTemplate.replace('${matchedSql}',matched)});
}
function additions(rows){const row=one(rows);integrity(typeof row.identity_count==='string'&&(row.first_issue===null||row.first_issue==='INTEGRITY'||row.first_issue==='NOT_READY'),'Malformed native inventory admission aggregate');
 integrity(/^[1-9]\d*$/.test(row.identity_count),'A nonempty exact uncovered native identity set is required');
 integrity(row.first_issue!=='INTEGRITY','Native admission evidence, creation basis or witness is inconsistent');
 requireDomain(row.first_issue!=='NOT_READY','PRODUCT_MANAGEMENT_STOCK_NOT_READY','New native inventory creation is not qualified');}
/** Flow MOCK/prototype only. Caller owns real RR/READ ONLY, original actor grant,
 * issuer.assertReady/same lease/globalfence/budget/release. This issues none. */
export async function runPrototypeSnapshot(input){
 const a=captureData(input,['sources','query','signal','grant','parameters','retainedDelete','seasonArray','runtime26Present']);
 need(typeof a.query==='function'&&typeof a.runtime26Present==='boolean','EXPLICIT_TEST_QUERY_AND_RUNTIME_PRESENCE_REQUIRED');
 const grant=checkedProductManagementGrant(a.grant),p=parseProductManagementListQuery(a.parameters),sql=prototypeStatements(a.sources,a);
 need(grant.totalStock==='all-warehouses','ALL_WAREHOUSE_PROTOTYPE_ONLY');
 const values=[grant.kind==='all',grant.kind==='products'?grant.productIds:[],p.filter.productIds,p.filter.categoryIds,p.filter.years,p.filter.seasonIds,p.filter.supplierIds,p.filter.fitIds,p.filter.thicknesses,p.filter.shapeCodes];
 const active=()=>activeProductManagementRead(a.signal),query=async(text,bindings=[])=>{active();const result=await awaitRead(Promise.resolve().then(()=>{active();return a.query(text,bindings);}),a.signal,()=>new DomainError('PRODUCT_MANAGEMENT_READ_ABORTED','Product management read cancelled'));active();return result;};
 // A local variable, not a cross-read cache or a caller-produced approval token.
 const publications=(await query(sql.publication,[COMPLETE_SCOPE_DECISION])).rows;
 requireDomain(publications.length>0,'PRODUCT_MANAGEMENT_STOCK_NOT_READY','Complete all-warehouse inventory publication is unavailable');
 integrity(publications.length===1,'Multiple published inventory scopes');const publication=publications[0],batchId=entityId('operation',stringValue(publication.id));
 integrity(booleanValue(publication.completed)&&booleanValue(publication.final_approval),'Final complete inventory approval is unavailable');
 const checkpoint=decodeImportCheckpoint(publication.checkpoint);
 integrity(checkpoint.sequence>0&&Object.entries(checkpoint.expected).every(([k,v])=>checkpoint.counts[k]===v)&&checkpoint.cursor===Object.values(checkpoint.counts).reduce((x,y)=>x+y,0),'Published inventory checkpoint is incomplete');
 integrity(booleanValue(one((await query(sql.guards)).rows).integrity_guards_present),'Sparse inventory guards are unavailable');
 const coverage=one((await query(sql.coverage,[...values,batchId])).rows),warehouses=booleanValue(coverage.uncovered_warehouse),skus=booleanValue(coverage.uncovered_sku);
 if(warehouses||skus){requireDomain(a.runtime26Present,'PRODUCT_MANAGEMENT_STOCK_NOT_READY','Requested all-warehouse stock is outside the complete published scope');
  if(warehouses){let witness=(await query(sql.skuWitness,[batchId])).rows,basis='CUTOFF_MEMBER',operation=null;
   if(!witness.length){witness=(await query(sql.nativeSkuWitness)).rows;basis='POST_CUTOFF_CREATED';}
   requireDomain(witness.length>0,'PRODUCT_MANAGEMENT_STOCK_NOT_READY','No retained native SKU witness is available for warehouse qualification');
   const row=one(witness),skuId=entityId('sku',stringValue(row.id));if(basis==='POST_CUTOFF_CREATED')operation=entityId('operation',stringValue(row.created_operation_id));
   additions((await query(sql.warehouses,[batchId,skuId,basis,operation])).rows);
  }
  if(skus){const w=entityId('warehouse',stringValue(one((await query(sql.warehouseWitness)).rows).id));additions((await query(sql.skus,[...values,batchId,w])).rows);}
 }
 integrity(!booleanValue(coverage.invalid_size)&&!booleanValue(coverage.missing_sizes)&&!booleanValue(coverage.invalid_balance),'Native inventory facts are inconsistent');active();
 return freeze({status:'PROTOTYPE_QUALIFICATION_ONLY_NOT_STOCK_OR_AUTHORITY',batchId,scope:'ENTIRE_MATCHED_PRODUCTS_AND_ALL_NATIVE_WAREHOUSES',authority:'NONE',stockValue:null,actualSnapshotProved:false});
}
/** Preserve complete IDs/order/page/count/money/stock including unknown NULL. */
export function assertExactUnchangedPage(before,after){assert.deepEqual(checkedProductManagementListPage(after),checkedProductManagementListPage(before));}
