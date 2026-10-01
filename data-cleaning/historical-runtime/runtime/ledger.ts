import {transaction,SOURCE} from './db.ts';
import {RUNTIME} from './runtime.ts';
export async function ledger(input:any){
 const {sku,warehouse,filters={}}=input,page=Number(input.page||1);
 if(!/^[a-f0-9-]{36}$/.test(sku)||!/^[a-f0-9-]{36}$/.test(warehouse)||!Number.isSafeInteger(page)||page<1)throw Error('INVALID_LEDGER_QUERY');
 return transaction(RUNTIME,async tx=>(await tx.query(`WITH events AS (
 SELECT 'source:'||l.source_id id,h.business_date::text time,
 CASE h.document_kind WHEN 'sale' THEN CASE WHEN l.stock_quantity_contribution>0 THEN '销售退货' ELSE '销货' END WHEN 'purchase' THEN '进货' ELSE CASE WHEN l.to_warehouse_id=$2::uuid THEN '调拨入' ELSE '调拨出' END END type,
 CASE WHEN h.document_kind='transfer' AND l.from_warehouse_id=$2::uuid THEN -l.stock_quantity_contribution ELSE l.stock_quantity_contribution END delta,
 h.source_number source,h.target_document_id document_id,upper(h.document_kind) document_type,1 version,'—' "user",0 phase
 FROM ${SOURCE}.tplus_history_line l JOIN ${SOURCE}.tplus_history_document h ON h.target_document_id=l.target_document_id
 WHERE l.sku_id=$1::uuid AND (l.warehouse_id=$2::uuid OR l.from_warehouse_id=$2::uuid OR l.to_warehouse_id=$2::uuid)
 UNION ALL
 SELECT p.id||':'||m.line_index,p.created_at::text,
 CASE WHEN p.reason='REVISION_APPROVAL' THEN '审核' ELSE '弃审' END,m.quantity,d.number,d.id,d.document_type,p.revision,o.name,1
 FROM movement m JOIN posting p ON p.id=m.posting_id JOIN document d ON d.id=p.document_id JOIN operator o ON o.id=p.actor_id
 WHERE m.sku_id=$1::uuid AND m.warehouse_id=$2::uuid
 ), balances AS (SELECT *,sum(delta) OVER(ORDER BY phase,time,id ROWS UNBOUNDED PRECEDING) AS after FROM events),
 matches AS (SELECT *,after-delta AS before FROM balances WHERE ($3='' OR left(time,10)>=$3) AND ($4='' OR left(time,10)<=$4) AND ($5='' OR type=$5) AND ($6='' OR position(lower($6) in lower(source))>0)),
 slice AS (SELECT * FROM matches ORDER BY phase DESC,time DESC,id DESC LIMIT 20 OFFSET ${(page-1)*20})
 SELECT json_build_object('items',coalesce((SELECT json_agg(slice) FROM slice),'[]'::json),'total',(SELECT count(*) FROM matches),'types',(SELECT json_agg(DISTINCT type) FROM events),'quantity',(SELECT coalesce(sum(delta),0) FROM events)) data`,[sku,warehouse,filters.start||'',filters.end||'',filters.type||'',filters.source||''])).rows[0].data);
}
