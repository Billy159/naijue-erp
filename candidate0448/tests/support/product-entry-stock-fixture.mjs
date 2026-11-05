/** TEST ONLY. Explicit finite inventory declarations, never PG admission or missing-as-zero. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {requireDomain} from '../../packages/domain/src/errors.ts';
import {quantity} from '../../packages/domain/src/values.ts';
import {checkedInventoryScope} from '../../packages/application/src/inventory-query-validation.ts';
import {checkedProductDetailsScope,checkedProductStockOverviewScope,checkedProductStockOverviewResult,checkedProductStockPage} from '../../packages/application/src/product-details-query-validation.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const SYNTHETIC_STOCK_WAREHOUSES=Object.freeze([1,2].map(n=>Object.freeze({id:id(9000+n),hallId:id(9000),label:`TEST ONLY inventory warehouse ${n}`})));
const key=(warehouse,sku)=>JSON.stringify([warehouse,sku]);
export function createProductEntryStockFixture({syntheticOnly,getProduct,authorizeInventory}){
 assert.equal(syntheticOnly,true);assert.equal(typeof getProduct,'function');assert.equal(typeof authorizeInventory,'function');
 const scenes=new Map();let reads=0,fault=null;
 const active=signal=>requireDomain(signal instanceof AbortSignal&&!signal.aborted,'PRODUCT_READ_ABORTED','Synthetic inventory read aborted');
 async function snapshot(read,overview){
  if(overview)checkedProductStockOverviewScope(read);else checkedProductDetailsScope(read);
  active(read.signal);
  const intent={kind:'inventory',parameters:{page:1,pageSize:100,filter:{productIds:[read.parameters.productId],categoryIds:[],warehouseIds:[],supplierIds:[],fitIds:[],seasonIds:[]}}};
  const scope=checkedInventoryScope(await authorizeInventory(read.actor,intent,read.signal));active(read.signal);
  assert.ok(scope.warehouses.every(w=>SYNTHETIC_STOCK_WAREHOUSES.some(d=>d.id===w.id&&d.hallId===w.hallId&&d.label===w.label)));
  reads++;if(fault==='NOT_READY')requireDomain(false,'INVENTORY_NOT_READY','Synthetic inventory source not ready');if(fault==='FAIL')throw Error('SYNTHETIC_INVENTORY_SOURCE_FAILURE');
  const product=structuredClone(getProduct(read.parameters.productId));if(!product)return null;
  requireDomain(product.product.id===read.parameters.productId&&product.skus.length>0,'INVENTORY_NOT_READY','Actual saved product SKU snapshot required');
  const scene=structuredClone(scenes.get(product.product.id)??new Map()),rows=[];
  for(const w of scope.warehouses)for(const sku of product.skus){const fact=scene.get(key(w.id,sku.id)),known=fact?.admitted===true;rows.push({warehouseId:w.id,warehouseName:w.label,skuId:sku.id,state:known?'KNOWN':'UNKNOWN',quantity:known?fact.quantity:null});}
  active(read.signal);return {product,scope,rows};
 }
 const reader={
  async readStock(read){const s=await snapshot(read,false);if(!s)return null;const q=read.parameters;return checkedProductStockPage({productId:q.productId,page:q.page,pageSize:q.pageSize,total:s.rows.length,items:s.rows.slice((q.page-1)*q.pageSize,q.page*q.pageSize)},q);},
  async readOverview(read){const s=await snapshot(read,true);if(!s)return null;let unknownKeys=0,total=0n;const all=s.scope.warehouses.map(w=>{const rows=s.rows.filter(r=>r.warehouseId===w.id),unknown=rows.filter(r=>r.state!=='KNOWN').length;unknownKeys+=unknown;const sum=rows.filter(r=>r.state==='KNOWN').reduce((n,r)=>n+BigInt(r.quantity),0n);total+=sum;return {warehouseId:w.id,warehouseName:w.label,state:unknown?'UNKNOWN':'KNOWN',quantity:unknown?null:String(sum),unknownSkuCount:unknown};});
   const q=read.parameters,items=q.warehouseMode==='ALL'?all:all.filter(r=>r.state==='UNKNOWN'||r.quantity!=='0'),unknown=all.filter(r=>r.state==='UNKNOWN').length,nonzero=all.filter(r=>r.state==='KNOWN'&&r.quantity!=='0').length;
   return checkedProductStockOverviewResult({kind:'PRODUCT_STOCK_OVERVIEW_V1',productId:q.productId,warehouseMode:q.warehouseMode,readReference:`synthetic-product-stock:${randomUUID()}`,coverage:s.scope.warehouses.length===SYNTHETIC_STOCK_WAREHOUSES.length?'ALL_BUSINESS_WAREHOUSES':'AUTHORIZED_SUBSET',counts:{authorizedWarehouses:all.length,nonZeroWarehouses:nonzero,zeroWarehouses:all.length-unknown-nonzero,unknownWarehouses:unknown,returnedWarehouses:items.length},total:{state:unknownKeys?'UNKNOWN':'KNOWN',quantity:unknownKeys?null:String(total),unknownSkuWarehouseKeys:unknownKeys},items},q);
  }
 };
 return {reader,setScene({productId,entries}){const product=getProduct(productId);assert.ok(product,'Scene requires actual saved product');assert.ok(Array.isArray(entries));const next=new Map();for(const fact of entries){assert.deepEqual(Object.keys(fact).sort(),['admitted','basis','quantity','skuId','warehouseId']);assert.ok(SYNTHETIC_STOCK_WAREHOUSES.some(w=>w.id===fact.warehouseId));assert.ok(product.skus.some(s=>s.id===fact.skuId));assert.equal(typeof fact.admitted,'boolean');const k=key(fact.warehouseId,fact.skuId);assert.ok(!next.has(k),'Duplicate synthetic inventory key');if(fact.admitted){assert.equal(typeof fact.quantity,'string');quantity(fact.quantity);assert.equal(String(BigInt(fact.quantity)),fact.quantity);assert.equal(fact.basis,fact.quantity==='0'?'EXPLICIT_SYNTHETIC_KNOWN_ZERO':'EXPLICIT_SYNTHETIC_QUANTITY');}else{assert.equal(fact.quantity,null);assert.equal(fact.basis,'EXPLICIT_SYNTHETIC_UNADMITTED');}next.set(k,structuredClone(fact));}scenes.set(productId,next);},setFault(value){assert.ok([null,'FAIL','NOT_READY'].includes(value));fault=value;},snapshot:()=>({reads})};
}
