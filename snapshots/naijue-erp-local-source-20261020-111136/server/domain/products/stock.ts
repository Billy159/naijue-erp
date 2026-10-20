import type {AuthorizedContext} from '../../security/service.js';
import {readInventoryProjection} from '../transactions/inventory.js';
import {formatScaled,parseScaled} from '../transactions/decimal.js';
import {readInventoryProductUnitTotals} from '../inventory/read-summary.js';

interface StockRow {warehouse_id:string;variant_id:string;product_id:string;product_code:string;unit:string|null;quantity:string}
/** Product and sales consumers use the same original, unit-separated effective cells as inventory. */
export async function productStock(context:AuthorizedContext,codes?:readonly string[]):Promise<StockRow[]> {
  if(codes?.length===0)return [];
  const {session,repo}=context;
  const identities=(await session.query<{id:string;product_id:string;product_code:string}>(`WITH skus AS (
    SELECT id,product_id FROM ${repo.source}.variant UNION ALL SELECT id,product_id FROM ${repo.runtime}.variant_overlay ov
      WHERE NOT EXISTS(SELECT 1 FROM ${repo.source}.variant src WHERE src.id=ov.id)), products AS (
    SELECT p.id,coalesce(po.code,p.code) code FROM ${repo.source}.product p LEFT JOIN ${repo.runtime}.product_overlay po ON po.id=p.id WHERE NOT coalesce(po.deleted,false)
    UNION ALL SELECT id,code FROM ${repo.runtime}.product_overlay po WHERE NOT po.deleted AND NOT EXISTS(SELECT 1 FROM ${repo.source}.product p WHERE p.id=po.id))
    SELECT v.id,v.product_id,p.code product_code FROM skus v JOIN products p ON p.id=v.product_id WHERE ($1::text[] IS NULL OR p.code=ANY($1::text[]))`,[codes??null])).rows;
  if(!identities.length)return [];
  const bySku=new Map(identities.map(row=>[row.id,row]));
  const cells=await readInventoryProjection(session,repo.runtime,repo.source,[],codes?identities.map(row=>row.id):[]);
  return cells.flatMap(cell=>{const identity=bySku.get(cell.skuId);return identity?[{warehouse_id:cell.warehouseId,variant_id:cell.skuId,
    product_id:identity.product_id,product_code:identity.product_code,unit:cell.unit,quantity:formatScaled(parseScaled(cell.quantity,4,false),4)}]:[];});
}
export async function productTotals(context:AuthorizedContext):Promise<{product_id:string;unit:string|null;unknownSkuId:string|null;quantity:string}[]> {
  const current=await readInventoryProductUnitTotals(context);
  if(current!==null)return current.items;
  const totals=new Map<string,{product_id:string;unit:string|null;unknownSkuId:string|null;quantity:bigint}>();
  for(const cell of await productStock(context)){
    const unknownSkuId=cell.unit===null?cell.variant_id:null,key=JSON.stringify([cell.product_id,cell.unit,unknownSkuId]);
    const total=totals.get(key)??{product_id:cell.product_id,unit:cell.unit,unknownSkuId,quantity:0n};
    total.quantity+=parseScaled(cell.quantity,4,false);totals.set(key,total);
  }
  return [...totals.values()].map(row=>({...row,quantity:formatScaled(row.quantity,4)}));
}
