/** Finite read policy from original stock SELECTs and the cutoff-only invoker path.
 * No catalogue from an actual target is used to create this policy. */
import {buildLegacyCutoffFixture,freeze,need,CASE_ID} from './fixture.mjs';
import {identifier} from '../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
export const READ_COLUMNS=freeze({
 user_account:['id','staff_id','login_enabled'],staff:['id','role','employment_status','hall_id'],hall:['id','enabled'],
 product:['id','product_code','name','category_id','supplier_id','season_id','size_group_id','retail_price','enabled','version','year','system_item_code','thickness','collar_pants_type','purchase_price','wholesale5_price','wholesale6_price','wholesale7_price','wholesale8_price','wholesale9_price','wholesale10_price','minimum_price','deleted_at','default_barcode_scheme_id','season_ids'],
 product_category:['id','parent_id','name'],sku:['id','product_id','color_id','fit_id','size_id','created_operation_id'],fit:['id','name','code'],color:['id'],size:['id'],size_group_member:['size_group_id','size_id'],season:['id','name'],supplier:['id','name'],warehouse:['id','hall_id','created_operation_id'],inventory_balance:['warehouse_id','sku_id','quantity','version','last_operation_id'],
 import_batch:['id','source_name','source_manifest_ref','source_hash','cutoff_at','mapping_version','inventory_mode','status','checkpoint','created_at','completed_at','history_expected_counts','history_payload_hash','history_actual_counts','history_validation_passed'],
 import_record:['import_batch_id','status','target_type','target_id','source_entity_type','source_key','decision_reason','source_record_hash','source_file_ref']
});
export function finiteGrants(role){need(typeof role==='string'&&role==='dot_opt02_read_'+CASE_ID,'EXACT_FINITE_READER_ROLE_REQUIRED');return Object.entries(READ_COLUMNS).map(([table,cols])=>`GRANT SELECT (${cols.map(identifier).join(',')}) ON naijue_erp.${identifier(table)} TO ${identifier(role)}`);}
export function assertFiniteColumnMatrix(rows){
 need(Array.isArray(rows),'ACTUAL_COLUMN_OBSERVATIONS_REQUIRED');const expected=new Set(Object.entries(READ_COLUMNS).flatMap(([table,cols])=>cols.map(col=>table+'.'+col))),seen=new Set();
 for(const r of rows){need(typeof r.table_name==='string'&&typeof r.column_name==='string','EXACT_COLUMN_IDENTITY_REQUIRED');const key=r.table_name+'.'+r.column_name;need(!seen.has(key),'NO_DUPLICATE_COLUMN_OBSERVATION');seen.add(key);need(r.can_select===expected.has(key),'UNEXPECTED_EFFECTIVE_SELECT:'+key);for(const k of ['can_insert','can_update','can_references'])need(r[k]===false,'NO_READER_COLUMN_WRITES:'+key);}
 need([...expected].every(key=>seen.has(key)),'MISSING_REQUIRED_SOURCE_COLUMN');return freeze({exactSelectCells:expected.size,observedCells:rows.length,noColumnWrites:true});
}
const emptyFilter=()=>({productIds:[],categoryIds:[],years:[],seasonIds:[],supplierIds:[],fitIds:[],thicknesses:[],shapeCodes:[]});
export function readCases(){const f=buildLegacyCutoffFixture(),parameters=(ids=[],page=1)=>({filter:{...emptyFilter(),productIds:ids},page,pageSize:100});return freeze([
 {name:'wide-all3-products',parameters:parameters(),expectedTotal:3,expectedStocks:f.expectedProductStocks},
 {name:'narrow-base-product',parameters:parameters([f.reference.productId]),expectedTotal:1,expectedStocks:[f.expectedProductStocks[0]]},
 {name:'narrow-alternate-product',parameters:parameters([f.alternateProduct.id]),expectedTotal:1,expectedStocks:[f.expectedProductStocks[2]]},
 {name:'confirmed-zero-disabled-product-with-no-SKU',parameters:parameters([f.reference.disabledProductId]),expectedTotal:1,expectedStocks:[f.expectedProductStocks[1]]},
 {name:'deep-empty-page-retains-total3',parameters:parameters([],2),expectedTotal:3,expectedStocks:[]}
]);}
export function assertStockPage(actual,expected){need(actual&&actual.exactTotal===expected.expectedTotal&&actual.page===expected.parameters.page&&actual.pageSize===100&&Array.isArray(actual.items),'EXACT_SOURCE_PRODUCT_PAGE_REQUIRED');const wanted=new Map(expected.expectedStocks.map(p=>[p.id,p.quantity]));need(actual.items.length===wanted.size&&new Set(actual.items.map(p=>p.id)).size===wanted.size,'EXACT_PAGE_SCOPE_REQUIRED');for(const p of actual.items)need(wanted.has(p.id)&&p.totalStock===wanted.get(p.id),'SOURCE_STOCK_STRING_NOT_ZERO_OR_UNKNOWN_FALLBACK');return{case:expected.name,exactTotal:actual.exactTotal,pageItems:actual.items.length};}
/** This original function's cutoff-member branch may read whole import_batch;
 * it does not read receipt/audit if both exact memberships exist. Unknown target
 * is a genuine returned denial, not an invented approved post-cutoff creation. */
export const ADMISSION_SQL='/* opt02-legacy:cutoff-admission */ SELECT admitted,published_batch_id,warehouse_basis,sku_basis,warehouse_created_operation_id,sku_created_operation_id FROM naijue_erp.inventory_key_admission($1::uuid,$2::uuid)';
export function admissionCases(){const f=buildLegacyCutoffFixture();return freeze(f.warehouses.flatMap(w=>f.skus.map(s=>({warehouseId:w.id,skuId:s.id,expected:{admitted:true,published_batch_id:f.batchId,warehouse_basis:'CUTOFF_MEMBER',sku_basis:'CUTOFF_MEMBER',warehouse_created_operation_id:null,sku_created_operation_id:null}}))));}
export function assertCutoffAdmission(rows,expected){need(Array.isArray(rows)&&rows.length===1,'ONE_ADMISSION_DECISION_REQUIRED');const r=rows[0];for(const [key,value]of Object.entries(expected))need(r[key]===value,'EXACT_SOURCE_CUTOFF_ADMISSION_REQUIRED:'+key);return{admitted:r.admitted,warehouseBasis:r.warehouse_basis,skuBasis:r.sku_basis};}
