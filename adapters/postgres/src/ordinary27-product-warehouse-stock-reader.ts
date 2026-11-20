import { randomUUID } from 'node:crypto';
import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { entityId, quantity } from '../../../packages/domain/src/values.ts';
import { checkedInventoryActor } from '../../../packages/application/src/inventory-query-service.ts';
import { checkedInventoryScope } from '../../../packages/application/src/inventory-query-validation.ts';
import { checkedProductDetailsScope, checkedProductStockPage, parseProductDetailsPageQuery, checkedProductStockOverviewScope, parseProductStockOverviewQuery, checkedProductStockOverviewResult } from '../../../packages/application/src/product-details-query-validation.ts';
import type { ProductDetailsPageQuery, ProductDetailsScopedRead, ProductStockOverviewScopedRead, ProductWarehouseStockReader } from '../../../packages/application/src/product-details-query-ports.ts';
import type { InventoryQuery, InventoryQueryAuthorization } from '../../../packages/application/src/inventory-query-contracts.ts';
import type { PgSalesPool, PgSalesClient } from './sales-unit-of-work.ts';
import type { OrdinaryDocumentRuntime27Capability } from './ordinary-document-list-reader.ts';
const must=(ok:unknown,code='INVENTORY_INTEGRITY_FAILED')=>requireDomain(ok,code,'Product warehouse inventory unavailable');
const uint=(v:unknown):bigint=>{must(typeof v==='string'&&/^(0|[1-9]\d*)$/.test(v));return BigInt(v as string)};
const signed=(v:unknown):bigint=>{must(typeof v==='string'&&/^(0|[1-9]\d*|-[1-9]\d*)$/.test(v)&&v.length<=100);return BigInt(v as string)};
/** Ordinary V27 business facts: an existing validated balance is known; a
 * missing balance is known zero only with the original exact-key import proof. */
export class Ordinary27ProductWarehouseStockReader implements ProductWarehouseStockReader {
 private readonly pool:PgSalesPool; private readonly authorization:InventoryQueryAuthorization; private readonly runtime:OrdinaryDocumentRuntime27Capability;
 constructor(pool:PgSalesPool,authorization:InventoryQueryAuthorization,runtime:OrdinaryDocumentRuntime27Capability){
  if(typeof pool?.connect!=='function'||typeof authorization?.authorize!=='function'||runtime?.profile!=='EXACT27'||runtime.contract!=='UNIFIED_ORDINARY_RUNTIME27_V1'||typeof runtime.assertReady!=='function')throw TypeError('Ordinary V27 pool, authorization and runtime required');
  this.pool=pool;this.authorization=authorization;this.runtime=runtime;
 }
 private async read<T>(actorInput:Parameters<InventoryQueryAuthorization['authorize']>[0], productId:string, signal:AbortSignal, work:(query:PgSalesClient['query'],warehouses:readonly {id:string;hallId:string;label:string}[],hallIds:readonly string[],skuCount:bigint)=>Promise<T>):Promise<T|null>{
  const active=()=>must(!signal.aborted,'INVENTORY_READ_ABORTED'),actor=checkedInventoryActor(actorInput);entityId('product',productId);
  const request:InventoryQuery={page:1,pageSize:100,filter:{productIds:[entityId('product',productId)],categoryIds:[],warehouseIds:[],supplierIds:[],fitIds:[],seasonIds:[]}};
  const scope=checkedInventoryScope(await this.authorization.authorize(actor,{kind:'inventory',parameters:request},signal));active();
  const client=await this.pool.connect();let began=false,committing=false,committed=false,discard:Error|undefined;
  const query:PgSalesClient['query']=async(sql,values)=>{active();const r=await client.query(sql,values);active();return r;};
  try{
   await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;await this.runtime.assertReady(client,'ORDINARY_DOCUMENT_READ');active();
   const products=(await query('/* ordinary-stock:product */ SELECT id FROM naijue_erp.product WHERE id=$1::uuid LIMIT 2',[productId])).rows;must(products.length<=1);
   if(products.length===0){await this.runtime.assertReady(client,'ORDINARY_DOCUMENT_READ');committing=true;await query('COMMIT');committed=true;return null;}must(products[0]!.id===productId);
   const warehouses=(await query('/* ordinary-stock:warehouses */ SELECT w.id,w.hall_id,w.name FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id=w.hall_id WHERE w.id=ANY($1::uuid[]) AND w.hall_id=ANY($2::uuid[]) ORDER BY array_position($1::uuid[],w.id)',[scope.warehouses.map(w=>w.id),scope.hallIds])).rows;
   must(warehouses.length===scope.warehouses.length);warehouses.forEach((w,i)=>{const e=scope.warehouses[i]!;must(w.id===e.id&&w.hall_id===e.hallId&&w.name===e.label)});
   const counts=(await query(`/* ordinary-stock:count */ SELECT count(*)::text total,coalesce(bool_and(EXISTS(SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id=p.size_group_id AND m.size_id=s.size_id)),true) valid_sizes FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id WHERE s.product_id=$1::uuid`,[productId])).rows;
   must(counts.length===1&&counts[0]!.valid_sizes===true);const count=uint(counts[0]!.total);must(count*BigInt(warehouses.length)<=1000000n,'INVENTORY_READ_TOO_LARGE');
   const result=await work(query,scope.warehouses,scope.hallIds,count);active();await this.runtime.assertReady(client,'ORDINARY_DOCUMENT_READ');active();committing=true;await query('COMMIT');committed=true;return result;
  }catch(error){if(!committed&&(!began||committing))discard=error instanceof Error?error:Error('Stock outcome unknown');if(began&&!committing)try{await client.query('ROLLBACK')}catch(e){discard=e instanceof Error?e:Error('Rollback failed');throw new AggregateError([error,e],'Stock read and rollback failed')}throw error;}finally{client.release(discard)}
 }
 async readStock(read:ProductDetailsScopedRead<ProductDetailsPageQuery>){
  checkedProductDetailsScope(read);must(read.intent.kind==='stock','FORBIDDEN');const p=parseProductDetailsPageQuery(read.parameters),id=entityId('product',p.productId);
  return this.read(read.actor,id,read.signal,async(query,warehouses,halls,count)=>{
   const total=count*BigInt(warehouses.length);must(total<=BigInt(Number.MAX_SAFE_INTEGER),'INVENTORY_READ_TOO_LARGE');
   const rows=(await query(`/* ordinary-stock:page */ SELECT w.id warehouse_id,w.name warehouse_name,s.id sku_id,b.warehouse_id IS NOT NULL balance_present,b.quantity::text quantity,b.version,b.last_operation_id,CASE WHEN b.warehouse_id IS NULL THEN naijue_erp.standard_inventory_key_proof(w.id,s.id)->>'state' ELSE NULL END zero_proof_state,EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=w.id AND l.sku_id=s.id) ledger_present FROM naijue_erp.sku s CROSS JOIN naijue_erp.warehouse w LEFT JOIN naijue_erp.inventory_balance b ON b.warehouse_id=w.id AND b.sku_id=s.id WHERE s.product_id=$1::uuid AND w.id=ANY($2::uuid[]) AND w.hall_id=ANY($3::uuid[]) ORDER BY array_position($2::uuid[],w.id),s.sku_code COLLATE "C",s.id LIMIT $4 OFFSET $5::bigint`,[id,warehouses.map(w=>w.id),halls,p.pageSize,String((p.page-1)*p.pageSize)])).rows;
   must(rows.length===Math.min(p.pageSize,Math.max(0,Number(total)-(p.page-1)*p.pageSize)));const seen=new Set<string>();
   const items=rows.map(r=>{entityId('sku',r.sku_id as string);const w=warehouses.find(w=>w.id===r.warehouse_id);must(w&&r.warehouse_name===w.label&&typeof r.balance_present==='boolean'&&typeof r.ledger_present==='boolean');const key=`${r.warehouse_id}:${r.sku_id}`;must(!seen.has(key));seen.add(key);
    if(r.balance_present){must(r.ledger_present===true&&typeof r.quantity==='string'&&Number.isSafeInteger(r.version)&&Number(r.version)>0);quantity(r.quantity as string);entityId('operation',r.last_operation_id as string)}else must(r.quantity===null&&r.version===null&&r.last_operation_id===null&&r.ledger_present===false&&['UNKNOWN','EXPLICIT_ZERO'].includes(r.zero_proof_state as string));
    return {warehouseId:w!.id,warehouseName:w!.label,skuId:r.sku_id as string,quantity:r.balance_present?r.quantity as string:r.zero_proof_state==='EXPLICIT_ZERO'?'0':null,state:r.balance_present||r.zero_proof_state==='EXPLICIT_ZERO'?'KNOWN' as const:'UNKNOWN' as const};});
   return checkedProductStockPage({productId:id,page:p.page,pageSize:p.pageSize,total:Number(total),items},p);
  });
 }
 async readOverview(read:ProductStockOverviewScopedRead){
  checkedProductStockOverviewScope(read);const p=parseProductStockOverviewQuery(read.parameters),id=entityId('product',p.productId);
  return this.read(read.actor,id,read.signal,async(query,warehouses,halls,count)=>{
   must(count>0n,'INVENTORY_NOT_READY');const ids=warehouses.map(w=>w.id);
   const coverage=(await query('/* ordinary-stock:coverage */ SELECT NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse w WHERE NOT(w.id=ANY($1::uuid[]) AND w.hall_id=ANY($2::uuid[]))) full_coverage',[ids,halls])).rows;must(coverage.length===1&&typeof coverage[0]!.full_coverage==='boolean');
   const rows=(await query(`/* ordinary-stock:overview */ WITH facts AS (SELECT w.id warehouse_id,w.name warehouse_name,s.id sku_id,b.warehouse_id IS NOT NULL present,b.quantity,b.version,b.last_operation_id,CASE WHEN b.warehouse_id IS NULL THEN naijue_erp.standard_inventory_key_proof(w.id,s.id)->>'state' ELSE NULL END zero_proof_state,EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=w.id AND l.sku_id=s.id) ledger_present FROM naijue_erp.warehouse w CROSS JOIN naijue_erp.sku s LEFT JOIN naijue_erp.inventory_balance b ON b.warehouse_id=w.id AND b.sku_id=s.id WHERE s.product_id=$1::uuid AND w.id=ANY($2::uuid[]) AND w.hall_id=ANY($3::uuid[])) SELECT warehouse_id,warehouse_name,count(*)::text key_count,count(*) FILTER(WHERE NOT present AND zero_proof_state IS DISTINCT FROM 'EXPLICIT_ZERO')::text unknown_keys,coalesce(sum(quantity),0)::text known_quantity,bool_or((present AND (NOT ledger_present OR quantity IS NULL OR version IS NULL OR version<=0 OR last_operation_id IS NULL)) OR (NOT present AND (ledger_present OR quantity IS NOT NULL OR version IS NOT NULL OR last_operation_id IS NOT NULL OR zero_proof_state IS NULL OR zero_proof_state NOT IN ('UNKNOWN','EXPLICIT_ZERO')))) invalid FROM facts GROUP BY warehouse_id,warehouse_name ORDER BY array_position($2::uuid[],warehouse_id)`,[id,ids,halls])).rows;
   must(rows.length===warehouses.length);let unknown=0,total=0n;const all=rows.map((r,i)=>{const w=warehouses[i]!;must(r.warehouse_id===w.id&&r.warehouse_name===w.label&&r.invalid===false&&uint(r.key_count)===count);const n=uint(r.unknown_keys);must(n<=count);unknown+=Number(n);const v=signed(r.known_quantity);total+=v;return {warehouseId:w.id,warehouseName:w.label,state:n===0n?'KNOWN' as const:'UNKNOWN' as const,quantity:n===0n?v.toString():null,unknownSkuCount:Number(n)}});
   const nonzero=all.filter(x=>x.state==='KNOWN'&&x.quantity!=='0').length,missing=all.filter(x=>x.state==='UNKNOWN').length,items=p.warehouseMode==='ALL'?all:all.filter(x=>x.state==='UNKNOWN'||x.quantity!=='0');
   return checkedProductStockOverviewResult({kind:'PRODUCT_STOCK_OVERVIEW_V1',productId:id,warehouseMode:p.warehouseMode,readReference:`product-stock:${randomUUID()}`,coverage:coverage[0]!.full_coverage?'ALL_BUSINESS_WAREHOUSES':'AUTHORIZED_SUBSET',counts:{authorizedWarehouses:warehouses.length,nonZeroWarehouses:nonzero,zeroWarehouses:warehouses.length-nonzero-missing,unknownWarehouses:missing,returnedWarehouses:items.length},total:{state:unknown===0?'KNOWN':'UNKNOWN',quantity:unknown===0?total.toString():null,unknownSkuWarehouseKeys:unknown},items},p);
  });
 }
}
