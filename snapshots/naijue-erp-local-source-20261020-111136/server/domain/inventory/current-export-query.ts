import type {AuthorizedContext} from '../../security/service.js';
import type {InventoryFilters,LedgerFilters} from './query.js';
import {SecurityError} from '../../security/errors.js';
import {HistoryError} from './history-plan.js';
import {activeCurrentExportRun,type CurrentExportRun} from './current-export-store.js';
import {inventorySkuDisplaySql} from './sku-display-sql.js';
import {activeFormalBaselineRun} from './formal-current-baseline.js';
import {assertSingleCurrentBasis as assertSingleBasis,formalCurrentRun as formal,currentDisplaySql as projectionSql,currentInventoryScope} from './current-read-sql.js';

export interface CurrentExportReadRow {
  source_key:string;warehouse_id:string;sku_id:string;unit:string;quantity:string;confirmed_opening:string;source_net:string;
  endpoint_count:number;proof:Record<string,unknown>;
}
/** Shared application-level readback uses the same quantity projection and admitted source keys as the inventory page. */
export async function readCurrentExportApplicationRows(context:AuthorizedContext,after:string|null,limit=1000):Promise<CurrentExportReadRow[]> {
  if (!Number.isSafeInteger(limit)||limit<1||limit>2000) throw new HistoryError('CURRENT_EXPORT_READ_LIMIT_REQUIRED');
  const {session,repo}=context,run=await activeFormalBaselineRun(session,repo.runtime)??await activeCurrentExportRun(session,repo.runtime);
  if (!run) throw new HistoryError('CURRENT_EXPORT_BASELINE_REQUIRED');await assertSingleBasis(session,repo.runtime);
  return (await session.query<CurrentExportReadRow>(`SELECT source_key,warehouse_id,sku_id,unit,quantity::text,confirmed_opening::text,source_net::text,endpoint_count,proof
    FROM ${projectionSql(repo.source,repo.runtime,run)} projection WHERE run_id=$1 AND ($2::text IS NULL OR source_key>$2)
    ORDER BY source_key LIMIT $3`,[run.id,after,limit])).rows;
}
export async function queryCurrentExportInventory(context:AuthorizedContext,f:InventoryFilters,run:CurrentExportRun):Promise<Record<string,unknown>> {
  const {session,repo}=context;await assertSingleBasis(session,repo.runtime);
  const scoped=f.warehouseId!==null||f.skuId!==null||f.productId!==null||!!f.q||f.unit!==null||f.nonzero;
  const projection=projectionSql(repo.source,repo.runtime,run,scoped?currentInventoryScope(repo.source,repo.runtime,run):'true'),dataClass=formal(run)?'USER_APPROVED_FORMAL_BASELINE':'NON_FINAL',
    kind=formal(run)?'APPROVED_FORMAL_CURRENT_BASELINE':'CURRENT_EXPORT_CALIBRATION';
  if (f.view==='standard') return queryCurrentExportStandardInventory(context,f,run);
  const row=(await session.query<{data:Record<string,unknown>}>(`WITH matches AS (
    SELECT * FROM ${projection} projection WHERE run_id=$1
      AND ($2::uuid IS NULL OR warehouse_id=$2::uuid) AND ($3::uuid IS NULL OR sku_id=$3::uuid)
      AND ($4::text IS NULL OR proof #>> '{binding,display,productId}'=$4)
      AND ($5='' OR position(lower($5) in lower(proof #>> '{binding,display}'))>0)
      AND ($6::text IS NULL OR unit=$6) AND (NOT $7::boolean OR quantity<>0)
    ), slice AS (SELECT * FROM matches ORDER BY warehouse_id,sku_id,unit LIMIT $8 OFFSET $9)
    SELECT jsonb_build_object('view',$10::text,'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'warehouseId',warehouse_id,'skuId',sku_id,'unit',unit,'quantity',quantity::text,
      'warehouseCode',proof #>> '{binding,sourceQuantityKey,0}','warehouseName',proof #>> '{binding,display,warehouseName}',
      'productId',proof #>> '{binding,display,productId}','productCode',proof #>> '{binding,display,productCode}',
      'productName',proof #>> '{binding,display,productName}','original',proof #> '{binding,display,original}',
      'sourceQuantityKey',proof #> '{binding,sourceQuantityKey}','identityKind',proof #>> '{binding,identityKind}',
      'sourceMissing',coalesce(proof->>'kind'='POST_ACTIVATION_NEW_QUANTITY_KEY',false),'unitConflict',false,'basis',jsonb_build_object('kind','${kind}','runId',run_id,
        'openingQuantity',confirmed_opening::text,'selectedSourceNet',source_net::text,'currentDelta',current_delta::text,'difference','0.0000','reconciled',true),
      'quantityMethod','DERIVED_FROM_TARGET_INVENTORY','historicalTimelineCompletenessClaimed',false,'dataClass','${dataClass}')
      ORDER BY warehouse_id,sku_id,unit) FROM slice),'[]'::jsonb),'total',(SELECT count(*)::integer FROM matches),
      'originalCellCount',(SELECT count(*)::integer FROM matches),'page',$9::integer/$8::integer+1,'size',$8::integer,
      'unitTotals',coalesce((SELECT jsonb_agg(t ORDER BY t->>'unit') FROM (SELECT jsonb_build_object('unit',unit,'quantity',sum(quantity)::text,
        'cellCount',count(*)::integer,'nonzeroCellCount',count(*) FILTER(WHERE quantity<>0)::integer) t FROM matches GROUP BY unit) totals),'[]'::jsonb),
      'reconciled',true,'sourceQuantityPolicy','USER_CONFIRMED_CURRENT_EXPORT_TARGET_CALIBRATION',
      'quantityMethod','DERIVED_FROM_TARGET_INVENTORY','dataClass','${dataClass}','historicalTimelineCompletenessClaimed',false) data`,
    [run.id,f.warehouseId,f.skuId,f.productId,f.q,f.unit,f.nonzero,f.size,(f.page-1)*f.size,f.view])).rows[0]?.data;
  if (!row) throw new SecurityError('INVENTORY_READ_FAILED',503,'当前导出校准库存无法回读');return row;
}

/** Standard groups are display projections over the admitted original quantity cells, never replacement stock keys. */
async function queryCurrentExportStandardInventory(context:AuthorizedContext,f:InventoryFilters,run:CurrentExportRun):Promise<Record<string,unknown>> {
  const {session,repo}=context;
  const scoped=f.warehouseId!==null||f.skuId!==null||f.productId!==null||!!f.q||f.unit!==null||f.nonzero;
  const projection=projectionSql(repo.source,repo.runtime,run,scoped?currentInventoryScope(repo.source,repo.runtime,run):'true'),dataClass=formal(run)?'USER_APPROVED_FORMAL_BASELINE':'NON_FINAL',
    kind=formal(run)?'APPROVED_FORMAL_CURRENT_BASELINE':'CURRENT_EXPORT_CALIBRATION';
  const row=(await session.query<{data:Record<string,unknown>}>(`WITH matches AS MATERIALIZED (
    SELECT * FROM ${projection} projection WHERE run_id=$1
      AND ($2::uuid IS NULL OR warehouse_id=$2::uuid) AND ($3::uuid IS NULL OR sku_id=$3::uuid)
      AND ($4::text IS NULL OR proof #>> '{binding,display,productId}'=$4)
      AND ($5='' OR position(lower($5) in lower(proof #>> '{binding,display}'))>0)
      AND ($6::text IS NULL OR unit=$6) AND (NOT $7::boolean OR quantity<>0)
    ), ${inventorySkuDisplaySql(repo.source,repo.runtime)}, projected AS (
      SELECT c.*,c.proof #>> '{binding,display,productId}' product_id,v.options #>> '{COLOR,id}' color_id,
        v.standard_group,v.standard_fit,v.standard_size,v.standard_code,v.mapping_status,v.mapping_revision,v.mapping_pack_sha256
      FROM matches c LEFT JOIN skus v ON v.id=c.sku_id AND v.product_id::text=c.proof #>> '{binding,display,productId}'
    ), cells AS (
      SELECT *,CASE WHEN standard_group IS NULL OR standard_fit IS NULL OR standard_size IS NULL OR standard_code IS NULL
        OR unit IS NULL OR color_id IS NULL OR product_id IS NULL THEN sku_id END unmapped_sku
      FROM projected
    ), display AS (
      SELECT warehouse_id,product_id,color_id,unit,standard_group,standard_fit,standard_size,standard_code,unmapped_sku,
        sum(quantity) quantity,jsonb_build_array(warehouse_id,product_id,color_id,unit,standard_group,standard_fit,standard_size,standard_code,unmapped_sku) group_key
      FROM cells GROUP BY warehouse_id,product_id,color_id,unit,standard_group,standard_fit,standard_size,standard_code,unmapped_sku
    ), group_page AS MATERIALIZED (
      SELECT * FROM display ORDER BY warehouse_id,product_id,color_id,unit,standard_group,standard_fit,standard_size,standard_code,unmapped_sku LIMIT $8 OFFSET $9
    ), page_cells AS (
      SELECT c.*,g.group_key FROM cells c JOIN group_page g ON jsonb_build_array(c.warehouse_id,c.product_id,c.color_id,c.unit,c.standard_group,c.standard_fit,c.standard_size,c.standard_code,c.unmapped_sku)=g.group_key
    ), members AS (
      SELECT group_key,jsonb_agg(jsonb_build_object(
          'warehouseId',warehouse_id,'skuId',sku_id,'unit',unit,'quantity',quantity::text,
          'warehouseCode',proof #>> '{binding,sourceQuantityKey,0}','warehouseName',proof #>> '{binding,display,warehouseName}',
          'productId',proof #>> '{binding,display,productId}','productCode',proof #>> '{binding,display,productCode}',
          'productName',proof #>> '{binding,display,productName}','original',proof #> '{binding,display,original}',
          'standard',jsonb_build_object('mappingStatus',coalesce(mapping_status,'UNMAPPED'),'group',standard_group,'fit',standard_fit,
            'size',standard_size,'code',standard_code,'mappingRevision',mapping_revision,'packSha256',mapping_pack_sha256),
          'sourceQuantityKey',proof #> '{binding,sourceQuantityKey}','identityKind',proof #>> '{binding,identityKind}',
          'sourceMissing',coalesce(proof->>'kind'='POST_ACTIVATION_NEW_QUANTITY_KEY',false),'unitConflict',false,'basis',jsonb_build_object('kind','${kind}','runId',run_id,
            'openingQuantity',confirmed_opening::text,'selectedSourceNet',source_net::text,'currentDelta',current_delta::text,'difference','0.0000','reconciled',true),
          'quantityMethod','DERIVED_FROM_TARGET_INVENTORY','historicalTimelineCompletenessClaimed',false,'dataClass','${dataClass}')
          ORDER BY sku_id) members FROM page_cells GROUP BY group_key
    ), slice AS (
      SELECT jsonb_build_object('warehouseId',warehouse_id,'productId',product_id,'colorId',color_id,'unit',unit,
        'standard',jsonb_build_object('group',standard_group,'fit',standard_fit,'size',standard_size,'code',standard_code),
        'unmappedSkuId',unmapped_sku,'quantity',g.quantity::text,'members',m.members,
        'quantityMethod','DERIVED_FROM_TARGET_INVENTORY','historicalTimelineCompletenessClaimed',false,'dataClass','${dataClass}') item,
        warehouse_id,product_id,color_id,unit,standard_group,standard_fit,standard_size,standard_code,unmapped_sku
      FROM group_page g JOIN members m ON m.group_key=g.group_key
    ) SELECT jsonb_build_object('view',$10::text,'items',coalesce((SELECT jsonb_agg(item
      ORDER BY warehouse_id,product_id,color_id,unit,standard_group,standard_fit,standard_size,standard_code,unmapped_sku) FROM slice),'[]'::jsonb),
      'total',(SELECT count(*)::integer FROM display),'originalCellCount',(SELECT count(*)::integer FROM matches),
      'page',$9::integer/$8::integer+1,'size',$8::integer,
      'unitTotals',coalesce((SELECT jsonb_agg(t ORDER BY t->>'unit') FROM (SELECT jsonb_build_object('unit',unit,'quantity',sum(quantity)::text,
        'cellCount',count(*)::integer,'nonzeroCellCount',count(*) FILTER(WHERE quantity<>0)::integer) t FROM matches GROUP BY unit) totals),'[]'::jsonb),
      'reconciled',true,'sourceQuantityPolicy','USER_CONFIRMED_CURRENT_EXPORT_TARGET_CALIBRATION',
      'quantityMethod','DERIVED_FROM_TARGET_INVENTORY','dataClass','${dataClass}','historicalTimelineCompletenessClaimed',false) data`,
    [run.id,f.warehouseId,f.skuId,f.productId,f.q,f.unit,f.nonzero,f.size,(f.page-1)*f.size,f.view])).rows[0]?.data;
  if (!row) throw new SecurityError('INVENTORY_READ_FAILED',503,'当前导出校准库存无法回读');return row;
}
export async function currentExportInventoryLedger(context:AuthorizedContext,f:LedgerFilters,run:CurrentExportRun):Promise<Record<string,unknown>> {
  if(formal(run))return formalBaselineLedger(context,f,run);
  const balance=await queryCurrentExportInventory(context,{...f,page:1,size:200,nonzero:false,q:'',productId:null},run);
  const items=balance['items'] as Record<string,unknown>[];
  if (!f.unit&&items.length>1) throw new SecurityError('UNIT_REQUIRED',409,'请指定当前数量单位');
  const unit=f.unit??items[0]?.['unit'];
  const rows=(await context.session.query<CurrentExportReadRow>(`SELECT source_key,warehouse_id,sku_id,unit,quantity::text,confirmed_opening::text,
    source_net::text,endpoint_count,proof FROM ${context.repo.runtime}.inventory_current_export_projection WHERE warehouse_id=$1::uuid AND sku_id=$2::uuid AND unit=$3`,
    [f.warehouseId,f.skuId,String(unit)])).rows;
  return {balance,items:rows.map(row=>({kind:'CURRENT_EXPORT_CALIBRATION',unit:row.unit,quantity:row.quantity,confirmedOpening:row.confirmed_opening,
    selectedSourceNet:row.source_net,sourceEndpointCount:row.endpoint_count,source:row.proof,time:null,documentId:null,revision:null,
    historicalTimelineCompletenessClaimed:false})),total:rows.length,page:1,size:f.size,unit,
    dataClass:'NON_FINAL',quantityMethod:'DERIVED_FROM_TARGET_INVENTORY',historicalTimelineCompletenessClaimed:false,dateFilteredTimelineAvailable:false};
}
async function formalBaselineLedger(context:AuthorizedContext,f:LedgerFilters,run:CurrentExportRun):Promise<Record<string,unknown>> {
  const {session,repo}=context;
  const balance=await queryCurrentExportInventory(context,{...f,page:1,size:200,nonzero:false,q:'',productId:null},run);
  const rows=(balance['items']??[]) as Record<string,unknown>[];
  if(!f.unit&&rows.length>1)throw new SecurityError('UNIT_REQUIRED',409,'请指定库存数量单位');
  const unit=f.unit??rows[0]?.['unit'];
  const data=(await session.query<{data:Record<string,unknown>}>(`WITH events AS (
    SELECT 'baseline:'||c.run_id id,'APPROVED_FORMAL_BASELINE' kind,NULL::timestamptz time,NULL::uuid document_id,
      NULL::integer revision,NULL::text actor_id,c.confirmed_opening+c.source_net quantity,c.proof source
      FROM ${repo.runtime}.inventory_formal_baseline_cell c WHERE run_id=$1 AND warehouse_id=$2::uuid AND sku_id=$3::uuid AND unit=$4
    UNION ALL SELECT 'posting:'||m.posting_id||':'||m.leg_index,'REAL_POST_ACTIVATION_MOVEMENT',p.created_at,p.document_id,p.revision,p.actor_id,m.quantity,m.proof
      FROM ${repo.runtime}.inventory_formal_baseline_movement m JOIN ${repo.runtime}.posting p ON p.id=m.posting_id
      JOIN ${repo.runtime}.revision v ON v.document_id=p.document_id AND v.revision=p.revision
      WHERE m.run_id=$1 AND m.warehouse_id=$2::uuid AND m.sku_id=$3::uuid AND m.unit=$4
        AND ($5::date IS NULL OR (v.body #>> '{header,business_date}')::date>=$5)
        AND ($6::date IS NULL OR (v.body #>> '{header,business_date}')::date<=$6)
    ), page AS(SELECT * FROM events ORDER BY time NULLS FIRST,id LIMIT $7 OFFSET $8)
    SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'time',time,'documentId',document_id,
      'revision',revision,'actorId',actor_id,'quantity',quantity::text,'unit',$4::text,'source',source) ORDER BY time NULLS FIRST,id) FROM page),'[]'),
      'total',(SELECT count(*)::integer FROM events)) data`,[run.id,f.warehouseId,f.skuId,String(unit),f.start,f.end,f.size,(f.page-1)*f.size])).rows[0]?.data;
  if(!data)throw new SecurityError('INVENTORY_READ_FAILED',503,'正式基准库存账本无法回读');
  return {...data,balance,page:f.page,size:f.size,unit,dataClass:'USER_APPROVED_FORMAL_BASELINE',quantityMethod:'DERIVED_FROM_TARGET_INVENTORY',
    historicalTimelineCompletenessClaimed:false,dateFilteredTimelineAvailable:false,postActivationDateFilterApplied:!!(f.start||f.end),
    stockAnchor:run.id,historicalLedgerAddedAgain:false};
}
