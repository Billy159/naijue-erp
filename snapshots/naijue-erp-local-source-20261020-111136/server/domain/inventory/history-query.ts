import type {AuthorizedContext} from '../../security/service.js';
import {SecurityError} from '../../security/errors.js';
import {queryInventory,type LedgerFilters} from './query.js';

/** Read-only unit ledger. Source T31 quantity is retained alongside its zero runtime replay contribution. */
export async function historyInventoryLedger(context:AuthorizedContext,f:LedgerFilters):Promise<Record<string,unknown>> {
  const {session,repo}=context,r=repo.runtime;
  const balance=await queryInventory(context,{...f,page:1,size:200,nonzero:false,q:'',productId:null});
  if(!f.unit && Number(balance['total'])>1)throw new SecurityError('UNIT_REQUIRED',409,'同一原SKU含多个计量单位，请指定单位');
  const items=balance['items'] as Record<string,unknown>[],unit=f.unit ?? items[0]?.['unit'] ?? null;
  const data=(await session.query<{data:Record<string,unknown>}>(`WITH events AS (
    SELECT 'history-basis:'||c.run_id id,'HISTORY_ACCUMULATION' kind,0 phase,run.created_at time,
      substring(run.body #>> '{input,cutoff,at}',1,10) business_day,c.quantity quantity,c.quantity stock_delta,false historical_only,NULL::uuid posting_id,
      NULL::uuid document_id,NULL::integer revision,
      jsonb_build_object('runId',c.run_id,'manifestSha256',run.manifest_sha256,'cutoff',run.body #> '{input,cutoff}',
        'quantityMethod',coalesce(run.body->>'quantityMethod','SOURCE_ORIGINAL_OPENING'),
        'inventoryReportIsQuantityInput',run.body->'inventoryReportIsQuantityInput',
        'openingKind',coalesce(c.proof->>'openingKind',c.proof #>> '{opening,kind}'),
        'openingQuantity',coalesce(c.proof->>'derivedOpeningQuantity',c.proof->>'originalOpeningQuantity'),
        'originalOpeningQuantity',c.proof->>'originalOpeningQuantity','derivedOpeningQuantity',c.proof->>'derivedOpeningQuantity',
        'derivedAudit',c.proof->'derivedAudit','validInboundQuantity',c.proof->>'validInboundQuantity',
        'validOutboundQuantity',c.proof->>'validOutboundQuantity','sourceRecord',c.proof) source
      FROM ${r}.inventory_history_cell c JOIN ${r}.inventory_history_run run ON run.id=c.run_id WHERE c.warehouse_id=$1::uuid AND c.sku_id=$2::uuid AND c.unit=$3
    UNION ALL SELECT 'counted:'||l.event_id||':'||l.contribution_id,'COUNTED_HISTORY',-1,run.created_at,
      substring(run.body #>> '{input,cutoff,at}',1,10),l.quantity,0::numeric,true,NULL::uuid,
      e.document_id,(e.body #>> '{documentBinding,revision}')::integer,
      jsonb_build_object('eventId',l.event_id,'contributionId',l.contribution_id,'stateDecision',e.body #> '{atCutoff,stateDecision}',
        'sourceNumbers',e.body->'sourceNumbers','sourceAliases',e.body #> '{atCutoff,sourceAliases}','originalLeg',l.proof)
      FROM ${r}.inventory_history_event_leg l JOIN ${r}.inventory_history_run run ON run.id=l.run_id
        JOIN ${r}.inventory_history_event e ON e.run_id=l.run_id AND e.event_id=l.event_id
      WHERE l.boundary='CUTOFF' AND l.warehouse_id=$1::uuid AND l.sku_id=$2::uuid AND l.unit=$3
    UNION ALL SELECT m.identity||':'||m.leg_index,'MOVEMENT',1,m.created_at,
      to_char(m.created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD'),m.quantity,m.quantity,false,m.posting_id,NULL::uuid,NULL::integer,m.proof
      FROM ${r}.inventory_history_movement m WHERE m.warehouse_id=$1::uuid AND m.sku_id=$2::uuid AND m.unit=$3
    ), calculated AS (SELECT *,sum(stock_delta) OVER(ORDER BY phase,time,id ROWS UNBOUNDED PRECEDING) period_after FROM events),
    matches AS (SELECT * FROM calculated WHERE ($4::text IS NULL OR business_day>=$4) AND ($5::text IS NULL OR business_day<=$5)),
    slice AS (SELECT * FROM matches ORDER BY phase DESC,time DESC,id DESC LIMIT $6 OFFSET $7)
    SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'time',time,'businessDay',business_day,
      'unit',$3,'quantity',quantity::text,'stockDelta',stock_delta::text,'historicalOnly',historical_only,
      'before',CASE WHEN historical_only THEN NULL ELSE (period_after-stock_delta)::text END,'after',CASE WHEN historical_only THEN NULL ELSE period_after::text END,
      'postingId',posting_id,'documentId',document_id,'revision',revision,'source',source) ORDER BY phase DESC,time DESC,id DESC) FROM slice),'[]'::jsonb),
      'total',(SELECT count(*)::int FROM matches),'page',$7::int/$6::int+1,'size',$6::int,'unit',$3,
      'reconstructedQuantity',(SELECT coalesce(sum(stock_delta),0)::text FROM events)) data`,
    [f.warehouseId,f.skuId,String(unit),f.start,f.end,f.size,(f.page-1)*f.size])).rows[0]?.data;
  if(!data)throw new SecurityError('INVENTORY_READ_FAILED',503,'历史累计库存流水无法回读');
  return {...data,balance};
}
