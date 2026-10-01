import {transaction,SOURCE} from './db.ts';
import {RUNTIME} from './runtime.ts';

// A confirmed Demo snapshot starts a new balance period. Older movements remain
// available for history, but their quantities are not added to that snapshot.
export const LEDGER_TYPES=['库存初始化 / 期初','调拨入','调拨出','销货出库','退货入库','进货'];
export async function ledger(input:any,schema=RUNTIME){
 const {sku,warehouse,filters={}}=input,page=Number(input.page||1);
 if(!/^[a-f0-9-]{36}$/.test(sku)||!/^[a-f0-9-]{36}$/.test(warehouse)||!Number.isSafeInteger(page)||page<1)throw Error('INVALID_LEDGER_QUERY');
 return transaction(schema,async tx=>(await tx.query(`WITH active_opening AS (SELECT * FROM inventory_opening_run WHERE active), events AS (
 SELECT 'source:'||l.source_id id,h.business_date::text time,
 CASE h.document_kind
  WHEN 'sale' THEN CASE WHEN l.stock_quantity_contribution>0 THEN '退货入库' ELSE '销货出库' END
  WHEN 'purchase' THEN CASE WHEN l.stock_quantity_contribution<0 THEN '采购退货出库' ELSE '进货' END
  WHEN 'transfer' THEN CASE WHEN l.to_warehouse_id=$2::uuid THEN '调拨入' ELSE '调拨出' END
  WHEN 'opening' THEN '库存初始化 / 期初'
  ELSE coalesce(nullif(h.source_business_type_name,''),h.document_kind) END type,
 CASE WHEN h.document_kind='transfer' AND l.from_warehouse_id=$2::uuid THEN -l.stock_quantity_contribution ELSE l.stock_quantity_contribution END delta,
 h.source_number source,h.target_document_id document_id,upper(h.document_kind) document_type,1 version,
 coalesce(nullif(h.created_by,''),nullif(h.audited_by,''),'历史导入') "user",0 phase,
 EXISTS(SELECT 1 FROM active_opening) historical_only,
 CASE WHEN EXISTS(SELECT 1 FROM active_opening) THEN 0 ELSE CASE WHEN h.document_kind='transfer' AND l.from_warehouse_id=$2::uuid THEN -l.stock_quantity_contribution ELSE l.stock_quantity_contribution END END stock_delta,
 CASE WHEN d.id IS NOT NULL AND d.document_type IN ('SALE','TRANSFER') THEN
  CASE d.document_type WHEN 'SALE' THEN 'sales/doc/' ELSE 'transfer/doc/' END||d.number END source_route
 FROM ${SOURCE}.tplus_history_line l JOIN ${SOURCE}.tplus_history_document h ON h.target_document_id=l.target_document_id
 LEFT JOIN document d ON d.id=h.target_document_id
 WHERE l.sku_id=$1::uuid AND (l.warehouse_id=$2::uuid OR l.from_warehouse_id=$2::uuid OR l.to_warehouse_id=$2::uuid)
 UNION ALL
 SELECT p.id||':'||m.line_index,p.created_at::text,
 CASE WHEN p.reason='REVISION_APPROVAL' THEN
  CASE d.document_type
   WHEN 'TRANSFER' THEN CASE WHEN m.quantity>0 THEN '调拨入' ELSE '调拨出' END
   WHEN 'SALE' THEN CASE WHEN m.quantity>0 THEN '退货入库' ELSE '销货出库' END
   WHEN 'PURCHASE' THEN CASE WHEN m.quantity>0 THEN '进货' ELSE '采购退货出库' END
   WHEN 'OPENING' THEN '库存初始化 / 期初'
   ELSE d.document_type END
 ELSE
  CASE d.document_type
   WHEN 'TRANSFER' THEN CASE WHEN m.quantity>0 THEN '调拨弃审入库' ELSE '调拨弃审出库' END
   WHEN 'SALE' THEN CASE WHEN m.quantity>0 THEN '销货弃审入库' ELSE '退货弃审出库' END
   WHEN 'PURCHASE' THEN CASE WHEN m.quantity>0 THEN '采购退货弃审入库' ELSE '进货弃审出库' END
   ELSE d.document_type||'弃审' END END,
 m.quantity,d.number,d.id,d.document_type,p.revision,coalesce(o.name,p.actor_id),
 CASE WHEN NOT EXISTS(SELECT 1 FROM active_opening) THEN 1 WHEN EXISTS(SELECT 1 FROM inventory_opening_prior_posting old JOIN active_opening a ON a.id=old.run_id WHERE old.posting_id=p.id) THEN 0 ELSE 2 END,
 EXISTS(SELECT 1 FROM inventory_opening_prior_posting old JOIN active_opening a ON a.id=old.run_id WHERE old.posting_id=p.id),
 CASE WHEN EXISTS(SELECT 1 FROM inventory_opening_prior_posting old JOIN active_opening a ON a.id=old.run_id WHERE old.posting_id=p.id) THEN 0 ELSE m.quantity END,
 CASE WHEN d.document_type IN ('SALE','TRANSFER') THEN
  CASE d.document_type WHEN 'SALE' THEN 'sales/doc/' ELSE 'transfer/doc/' END||d.number END
 FROM movement m JOIN posting p ON p.id=m.posting_id JOIN document d ON d.id=p.document_id LEFT JOIN operator o ON o.id=p.actor_id
 WHERE m.sku_id=$1::uuid AND m.warehouse_id=$2::uuid
 UNION ALL
 SELECT 'opening:'||a.id,a.activated_at::text,'库存初始化 / 期初',coalesce(c.quantity,0),
 'T+库存状况表 · Demo期初',NULL::uuid,'OPENING',0,'库存导入',1,false,coalesce(c.quantity,0),NULL::text
 FROM active_opening a LEFT JOIN inventory_opening_cell c ON c.run_id=a.id AND c.sku_id=$1::uuid AND c.warehouse_id=$2::uuid
 ), balances AS (SELECT *,sum(stock_delta) OVER(ORDER BY phase,time,id ROWS UNBOUNDED PRECEDING) AS period_after FROM events),
 matches AS (SELECT *,CASE WHEN historical_only THEN NULL ELSE period_after END AS after,CASE WHEN historical_only THEN NULL ELSE period_after-stock_delta END AS before FROM balances WHERE ($3='' OR left(time,10)>=$3) AND ($4='' OR left(time,10)<=$4) AND ($5='' OR type=$5) AND ($6='' OR position(lower($6) in lower(source))>0)),
 slice AS (SELECT * FROM matches ORDER BY phase DESC,time DESC,id DESC LIMIT 20 OFFSET ${(page-1)*20})
 SELECT json_build_object('items',coalesce((SELECT json_agg(slice) FROM slice),'[]'::json),'total',(SELECT count(*) FROM matches),'types',(SELECT json_agg(DISTINCT type) FROM events),'quantity',(SELECT coalesce(sum(stock_delta),0) FROM events),'openingMode',(SELECT mode FROM active_opening)) data`,[sku,warehouse,filters.start||'',filters.end||'',filters.type||'',filters.source||''])).rows[0].data)
 .then(result=>({...result,types:[...LEDGER_TYPES,...(result.types||[]).filter((type:string)=>!LEDGER_TYPES.includes(type)).sort()]}));
}
