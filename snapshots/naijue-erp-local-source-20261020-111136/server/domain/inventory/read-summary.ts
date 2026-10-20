import type {AuthorizedContext} from '../../security/service.js';
import {SecurityError} from '../../security/errors.js';
import {activeFormalBaselineRun} from './formal-current-baseline.js';
import {activeCurrentExportRun,type CurrentExportRun} from './current-export-store.js';
import {assertSingleCurrentBasis,currentQuantitySql,currentReadSource} from './current-read-sql.js';

export interface InventoryProductUnitTotal {product_id:string;unit:string|null;unknownSkuId:string|null;quantity:string}
export interface InventoryProductUnitSummary {items:InventoryProductUnitTotal[];source:Record<string,unknown>}
async function currentRun(context:AuthorizedContext):Promise<CurrentExportRun|null> {
  return await activeFormalBaselineRun(context.session,context.repo.runtime)??await activeCurrentExportRun(context.session,context.repo.runtime);
}

/** Same global inventory authorization as inventory.query. Counts cells, never net warehouse quantities. */
export async function queryWarehouseOccupancy(context:AuthorizedContext):Promise<Record<string,unknown>> {
  const run=await currentRun(context);
  if(!run)throw new SecurityError('INVENTORY_SUMMARY_CURRENT_BASIS_REQUIRED',409,'当前库存汇总需要有效的当前基准');
  await assertSingleCurrentBasis(context.session,context.repo.runtime);
  const items=(await context.session.query<{warehouseId:string;occupiedCellCount:number}>(`SELECT warehouse_id AS "warehouseId",count(*)::integer AS "occupiedCellCount"
    FROM ${currentQuantitySql(context.repo.runtime,run,'p.run_id=$1')} projection WHERE quantity<>0
    GROUP BY warehouse_id ORDER BY warehouse_id`,[run.id])).rows;
  return {contractVersion:'WAREHOUSE_OCCUPANCY_V1',items,byWarehouse:Object.fromEntries(items.map(row=>[row.warehouseId,row.occupiedCellCount])),source:currentReadSource(run)};
}

/** Null selects the caller's unchanged legacy path. Current projections are aggregated entirely in PostgreSQL. */
export async function readInventoryProductUnitTotals(context:AuthorizedContext):Promise<InventoryProductUnitSummary|null> {
  // productStock historically ignores NON_FINAL calibration; retain that legacy fallback.
  const run=await activeFormalBaselineRun(context.session,context.repo.runtime);if(!run)return null;
  const {session,repo}=context;await assertSingleCurrentBasis(session,repo.runtime);
  // Match productStock identity precedence, deleted filtering and inactive-product visibility exactly.
  const items=(await session.query<InventoryProductUnitTotal>(`WITH skus AS (
    SELECT id,product_id FROM ${repo.source}.variant UNION ALL SELECT id,product_id FROM ${repo.runtime}.variant_overlay ov
      WHERE NOT EXISTS(SELECT 1 FROM ${repo.source}.variant src WHERE src.id=ov.id)), products AS (
    SELECT p.id,coalesce(po.code,p.code) code FROM ${repo.source}.product p LEFT JOIN ${repo.runtime}.product_overlay po ON po.id=p.id WHERE NOT coalesce(po.deleted,false)
    UNION ALL SELECT id,code FROM ${repo.runtime}.product_overlay po WHERE NOT po.deleted AND NOT EXISTS(SELECT 1 FROM ${repo.source}.product p WHERE p.id=po.id))
    SELECT v.product_id,projection.unit,CASE WHEN projection.unit IS NULL THEN projection.sku_id END AS "unknownSkuId",
      round(sum(projection.quantity),4)::text quantity
    FROM ${currentQuantitySql(repo.runtime,run,'p.run_id=$1')} projection JOIN skus v ON v.id=projection.sku_id JOIN products p ON p.id=v.product_id
    GROUP BY v.product_id,projection.unit,CASE WHEN projection.unit IS NULL THEN projection.sku_id END
    ORDER BY v.product_id,projection.unit,"unknownSkuId"`,[run.id])).rows;
  return {items,source:currentReadSource(run)};
}
