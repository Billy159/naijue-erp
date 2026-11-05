/** Finite PRE-CUTOFF setup/read contract. Inert: no driver, network or filesystem. */
import { createHash } from 'node:crypto';
import { CATALOGUE_PRICE_KEYS, validateCompleteCataloguePrices } from '../../../../packages/application/src/catalogue-price-input.ts';
import { captureData, need, identifier } from '../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
const freeze = value => { if(value && typeof value==='object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const SCOPE='OPT01_PRE_CUTOFF_REFERENCE_CURRENT_FORM_DICTIONARY_ONLY';
export const ORIGINAL_SOURCE_FINGERPRINT='726d84f1303bcb5deb599c19de89f8cdfad89c8f365e34fa36ca4de49051bcbb';
export const RAW_PRICES=freeze({retail_price:'1.25',purchase_price:'0.75',wholesale5_price:null,wholesale6_price:null,wholesale7_price:null,wholesale8_price:null,wholesale9_price:null,wholesale10_price:null,minimum_price:null});
// Actual canonical keys are checked below: a renamed/missing price fails, never defaults.
export const READ_COLUMNS=freeze({
 user_account:['id','staff_id','login_enabled'], staff:['id','role','employment_status','hall_id'], hall:['id','enabled'],
 product:['id','product_code','name','retail_price','enabled','size_group_id','category_id','system_item_code'], product_category:['id','name'],
 sku:['id','sku_code','product_id','color_id','fit_id','size_id','enabled'], color:['id','code','name','enabled'], fit:['id','code','name','enabled'],
 size:['id','name'], size_group:['id','code','name'], size_group_member:['size_group_id','size_id','display_order'],
 import_batch:['id','status'], import_source_row:['batch_id','entity_type','field_provenance'], sku_barcode:['sku_id','enabled','barcode_kind','barcode']
});
export const SETUP_COLUMNS=freeze({
 hall:['id','name','default_customer_id','default_sales_warehouse_id','enabled','version'],
 staff:['id','name','hall_id','role','contact','employment_status','version'],
 user_account:['id','staff_id','login_name','password_hash','login_enabled','auth_version','version','created_at','updated_at'],
 product_category:['id','parent_id','name','display_order','version'], color:['id','code','name','enabled','version'], fit:['id','code','name','enabled','version'],
 size:['id','code','name'], size_group:['id','code','name'], size_group_member:['size_group_id','size_id','display_order'],
 product:['id','product_code','name','category_id','supplier_id','season_id','size_group_id',...CATALOGUE_PRICE_KEYS,'enabled','version','system_item_code'],
 sku:['id','product_id','color_id','fit_id','size_id','sku_code','enabled','version','created_operation_id']
});
export const FORBIDDEN_ROWS=freeze(['import_batch','import_source_row','audit_change','operation_receipt','inventory_balance','inventory_ledger','sales_header','transfer_header']);
export function buildFixture(input) {
 const {id}=captureData(input,['id']);need(typeof id==='string'&&/^[a-f0-9]{13}$/.test(id)&&!['c20261031e001','c20261031e002','c20261031e003'].includes(id),'NEW_COMPONENT_PRIMITIVE_ID_REQUIRED');
 const uuid=(kind,n=0)=>{const h=createHash('sha256').update('synthetic:opt01:precutoff:'+id+':'+kind+':'+n).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
 const groups=Array.from({length:22},(_,i)=>({id:uuid('group',i),code:i===21?'ZTARGET':'G'+String(i).padStart(2,'0'),name:'SYNTHETIC OPT01 GROUP '+i}));
 const sizes=Array.from({length:23},(_,i)=>({id:uuid('size',i),code:String(900+i),name:'SYNTHETIC SIZE '+String(i).padStart(2,'0')}));
 const members=[...groups.slice(0,21).map(g=>({size_group_id:g.id,size_id:sizes[0].id,display_order:0})),...sizes.map((s,i)=>({size_group_id:groups[21].id,size_id:s.id,display_order:i}))];
 return freeze({format:'FINITE_SYNTHETIC_REFERENCE_V1',scope:SCOPE,id,actor:{accountId:uuid('account'),hallId:null},hallId:uuid('hall'),staffId:uuid('staff'),categoryId:uuid('category'),colorId:uuid('color'),fitId:uuid('fit'),productId:uuid('product'),disabledProductId:uuid('product',1),skuIds:[uuid('sku'),uuid('sku',1)],groups,sizes,members,targetGroupId:groups[21].id,timestamp:'2026-10-31T00:00:00.000Z',counts:{hall:1,staff:1,user_account:1,product_category:1,color:1,fit:1,size:23,size_group:22,size_group_member:44,product:2,sku:2},expectedProductCode:'PGOPT01-'+id,rawPrices:RAW_PRICES});
}
export function readerGrants(role) { identifier(role);need(/^dot_opt01_read_[a-f0-9]{13}$/.test(role),'FINITE_READER_ROLE_REQUIRED');return Object.entries(READ_COLUMNS).map(([table,cols])=>`GRANT SELECT (${cols.map(identifier).join(',')}) ON naijue_erp.${identifier(table)} TO ${identifier(role)}`); }
export function setupInsert(table,values) {need(Object.hasOwn(SETUP_COLUMNS,table)&&Array.isArray(values)&&values.length===SETUP_COLUMNS[table].length,'EXACT_SETUP_INSERT_REQUIRED');return freeze({text:`INSERT INTO naijue_erp.${identifier(table)} (${SETUP_COLUMNS[table].map(identifier).join(',')}) VALUES (${values.map((_,i)=>'$'+(i+1)).join(',')})`,values:[...values]});}
export function checkPriceContract() { need(JSON.stringify(Object.keys(RAW_PRICES).sort())===JSON.stringify([...CATALOGUE_PRICE_KEYS].sort()),'EXACT_ORIGINAL_NINE_PRICE_KEYS_REQUIRED');return validateCompleteCataloguePrices(RAW_PRICES); }
