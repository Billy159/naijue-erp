/** Actual/source comparison for this finite setup, not history/native import adoption. */
import {buildLegacyCutoffFixture,need,freeze} from './fixture.mjs';
import {requestHash} from '../../../../packages/application/src/request-hash.ts';
const byId=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id,'en'));
export const NATIVE_SOURCE_QUERIES=Object.freeze({
 warehouse:'/* opt02-legacy:source-warehouses */ SELECT id,hall_id,name,enabled,version,created_operation_id FROM naijue_erp.warehouse ORDER BY id',
 sku:'/* opt02-legacy:source-skus */ SELECT id,product_id,color_id,fit_id,size_id,sku_code,enabled,version,created_operation_id FROM naijue_erp.sku ORDER BY id',
 members:'/* opt02-legacy:source-members */ SELECT size_group_id,size_id,display_order FROM naijue_erp.size_group_member ORDER BY size_group_id,size_id',
 sourceRows:'/* opt02-legacy:no-history-source */ SELECT count(*)::text n FROM naijue_erp.import_source_row'
});
export async function verifyFiniteNativeSource(query){const f=buildLegacyCutoffFixture();
 const actualWarehouses=(await query(NATIVE_SOURCE_QUERIES.warehouse)).rows,actualSkus=(await query(NATIVE_SOURCE_QUERIES.sku)).rows;
 need(requestHash(actualWarehouses)===requestHash(byId(f.warehouses)),'ACTUAL_ALL_WAREHOUSES_DIFFER_FROM_FROZEN_SOURCE');need(requestHash(actualSkus)===requestHash(byId(f.skus)),'ACTUAL_ALL_SKU_TUPLES_DIFFER_FROM_FROZEN_SOURCE');
 const expectedMembers=[...f.reference.members].sort((a,b)=>a.size_group_id.localeCompare(b.size_group_id,'en')||a.size_id.localeCompare(b.size_id,'en'));
 const members=(await query(NATIVE_SOURCE_QUERIES.members)).rows;need(requestHash(members)===requestHash(expectedMembers),'ACTUAL_GROUP_MEMBERS_DIFFER_FROM_FROZEN_SOURCE');const sources=(await query(NATIVE_SOURCE_QUERIES.sourceRows)).rows;need(sources.length===1&&sources[0].n==='0','LEGACY_COMPONENT_CANNOT_CLAIM_TYPED_PRODUCT_OR_HISTORY_SOURCE');
 return freeze({warehouses:actualWarehouses.length,skus:actualSkus.length,members:members.length,sourceRows:0,matchedOriginalSource:true,notV2HistoryProof:true});
}
export const PUBLISHED_BALANCES_SQL='/* opt02-legacy:source-balances */ SELECT warehouse_id,sku_id,quantity::text,version,last_operation_id FROM naijue_erp.inventory_balance ORDER BY warehouse_id,sku_id';
export async function verifyPublishedBalances(query){const f=buildLegacyCutoffFixture(),expected=f.baselines.map(b=>({warehouse_id:b.warehouseId,sku_id:b.skuId,quantity:b.quantity,version:1,last_operation_id:f.expectedResults[2].operationId})).sort((a,b)=>a.warehouse_id.localeCompare(b.warehouse_id,'en')||a.sku_id.localeCompare(b.sku_id,'en'));const rows=(await query(PUBLISHED_BALANCES_SQL)).rows;need(requestHash(rows)===requestHash(expected),'ACTUAL_NONZERO_BALANCES_DIFFER_FROM_COMPLETE_SOURCE');return freeze({actualNonzeroBalances:rows.length,explicitAbsentZeroPairs:f.zeroPairs.length,sourceOracle:true});}
