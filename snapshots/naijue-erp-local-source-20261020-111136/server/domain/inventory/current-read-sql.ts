import type {DataSession} from '../../database/session.js';
import type {CurrentExportRun} from './current-export-store.js';
import {SecurityError} from '../../security/errors.js';

export const formalCurrentRun = (run:CurrentExportRun):boolean => run.body['dataClass']==='USER_APPROVED_FORMAL_BASELINE';

export async function assertSingleCurrentBasis(session:DataSession,runtime:string):Promise<void> {
  const n=(await session.query<{n:string}>(`SELECT ((SELECT count(*) FROM ${runtime}.inventory_history_run)
    +(SELECT count(*) FROM ${runtime}.inventory_opening_run WHERE active))::text n`)).rows[0]?.n;
  if(n!=='0')throw new SecurityError('INVENTORY_BASIS_CONFLICT',409,'当前导出校准与其他库存基准同时存在');
}

/** Predicate text is repository-owned SQL. All request values remain bound parameters. */
export function currentQuantitySql(runtime:string,run:CurrentExportRun,predicate:string):string {
  return formalCurrentRun(run)
    ? `(SELECT p.* FROM ${runtime}.inventory_formal_baseline_projection p WHERE ${predicate})`
    : `(SELECT p.*,0::numeric current_delta FROM ${runtime}.inventory_current_export_projection p${predicate==='true'?'':' WHERE '+predicate})`;
}

/** Filter positions are the current inventory read contract, never caller-provided SQL. */
export function currentInventoryScope(source:string,runtime:string,run:CurrentExportRun):string {
  const productMatch=formalCurrentRun(run)
    ? `CASE WHEN p.proof ? 'binding' THEN p.proof #>> '{binding,display,productId}'=$4 ELSE EXISTS(
        SELECT 1 FROM ${source}.variant v WHERE v.id=p.sku_id AND v.product_id::text=$4
        UNION ALL SELECT 1 FROM ${runtime}.variant_overlay v WHERE v.id=p.sku_id AND v.product_id::text=$4) END`
    : `p.proof #>> '{binding,display,productId}'=$4`;
  return `p.run_id=$1 AND ($2::uuid IS NULL OR p.warehouse_id=$2::uuid) AND ($3::uuid IS NULL OR p.sku_id=$3::uuid)
    AND ($4::text IS NULL OR ${productMatch}) AND ($6::text IS NULL OR p.unit=$6) AND (NOT $7::boolean OR p.quantity<>0)
    AND ($5::text='' OR NOT(p.proof ? 'binding') OR position(lower($5) in lower(p.proof #>> '{binding,display}'))>0)`;
}

/** Persisted bindings are immutable; only post-activation cells acquire current master display facts. */
export function currentDisplaySql(source:string,runtime:string,run:CurrentExportRun,predicate='true'):string {
  if(!formalCurrentRun(run))return currentQuantitySql(runtime,run,predicate);
  return `(SELECT p.run_id,p.source_key,p.warehouse_id,p.sku_id,p.unit,p.confirmed_opening,p.source_net,p.endpoint_count,p.current_delta,p.quantity,
    CASE WHEN p.proof ? 'binding' THEN p.proof ELSE p.proof||jsonb_build_object('binding',jsonb_build_object(
      'sourceQuantityKey',jsonb_build_array(coalesce(wm.body->>'code',w.code,p.warehouse_id::text),p.sku_id::text,p.unit),
      'identityKind','POST_ACTIVATION_BUSINESS_SKU','display',jsonb_build_object('productId',v.product_id,
        'productCode',coalesce(po.code,pr.code),'productName',coalesce(pp.body->>'name',po.body->>'name',pr.name),
        'warehouseName',coalesce(wm.body->>'name',wo.name,w.name)))) END proof
    FROM ${predicate==='true'?runtime+'.inventory_formal_baseline_projection':currentQuantitySql(runtime,run,predicate)} p
    LEFT JOIN(SELECT id,product_id FROM ${source}.variant UNION SELECT id,product_id FROM ${runtime}.variant_overlay) v ON v.id=p.sku_id
    LEFT JOIN ${source}.product pr ON pr.id=v.product_id LEFT JOIN ${runtime}.product_overlay po ON po.id=v.product_id
    LEFT JOIN ${runtime}.product_profile_overlay pp ON pp.product_id=v.product_id
    LEFT JOIN ${source}.warehouse w ON w.id=p.warehouse_id
    LEFT JOIN ${runtime}.master_reference_overlay wo ON wo.kind='warehouses' AND wo.id=p.warehouse_id
    LEFT JOIN ${runtime}.master_data_entity wm ON wm.kind='warehouses' AND wm.id=p.warehouse_id::text)`;
}

export function currentReadSource(run:CurrentExportRun):Record<string,unknown> {
  return {kind:formalCurrentRun(run)?'APPROVED_FORMAL_CURRENT_BASELINE':'CURRENT_EXPORT_CALIBRATION',runId:run.id,
    dataClass:formalCurrentRun(run)?'USER_APPROVED_FORMAL_BASELINE':'NON_FINAL',quantityMethod:'DERIVED_FROM_TARGET_INVENTORY',
    historicalTimelineCompletenessClaimed:false};
}
