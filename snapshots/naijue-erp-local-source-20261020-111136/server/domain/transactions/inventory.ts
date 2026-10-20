import type {DataSession} from '../../database/session.js';
import {SecurityError} from '../../security/errors.js';
import {activeHistoryRun} from '../inventory/history-store.js';
import {readHistoryBalance} from '../inventory/history-runtime.js';
import {HistoryError} from '../inventory/history-plan.js';
import {parseScaled} from './decimal.js';
import {readFormalBaselineBalance,readFormalBaselineProjection} from '../inventory/formal-current-baseline.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InventoryProjectionRow {readonly warehouseId: string; readonly skuId: string; readonly quantity: string; readonly unit: string | null}

function assertTarget(runtime: string, warehouseId?: string, skuId?: string): void {
  if (!/^"[a-z][a-z0-9_]{0,62}"$/.test(runtime) || warehouseId !== undefined && !uuid.test(warehouseId)
    || skuId !== undefined && !uuid.test(skuId)) throw new SecurityError('VALIDATION',400,'库存投影目标无效');
}

/** Exact point projection: the immutable opening/source basis plus current-period delta. */
export async function readInventoryBalance(session: DataSession, runtime: string, warehouseId: string, skuId: string, unit?: string): Promise<string> {
  assertTarget(runtime,warehouseId,skuId);
  const formal=await readFormalBaselineBalance(session,runtime,warehouseId,skuId,unit);
  if (formal!==null) return formal;
  let history:string|null;
  try {history = await readHistoryBalance(session,runtime,warehouseId,skuId,unit);}
  catch(error){if(error instanceof HistoryError)throw new SecurityError('UNIT_REQUIRED',409,error.code);throw error;}
  if (history !== null) return history;
  const row = (await session.query<{quantity: string}>(`SELECT coalesce(sum(quantity),0)::text quantity FROM (
      SELECT quantity FROM ${runtime}.inventory_balance_base WHERE warehouse_id=$1::uuid AND variant_id=$2::uuid
      UNION ALL SELECT quantity FROM ${runtime}.inventory_delta WHERE warehouse_id=$1::uuid AND sku_id=$2::uuid
    ) projection`,[warehouseId,skuId])).rows[0];
  if (!row) throw new SecurityError('ROLLED_BACK',409,'库存投影无法回读');
  return row.quantity;
}

/** Exact multi-cell projection for an authorized inventory query. */
export async function readInventoryProjection(session: DataSession, runtime: string, source: string, warehouseIds: readonly string[] = [], skuIds: readonly string[] = []): Promise<InventoryProjectionRow[]> {
  assertTarget(runtime);
  assertTarget(source);
  if (warehouseIds.some(id => !uuid.test(id)) || skuIds.some(id => !uuid.test(id)) || warehouseIds.length > 1000 || skuIds.length > 10000) {
    throw new SecurityError('VALIDATION',400,'库存投影筛选无效');
  }
  const formal=await readFormalBaselineProjection(session,runtime,warehouseIds,skuIds);
  if (formal!==null) return formal;
  const history = await activeHistoryRun(session,runtime);
  const openings = (await session.query<{n:string}>(`SELECT count(*)::text n FROM ${runtime}.inventory_opening_run WHERE active`)).rows[0]?.n;
  if (!['0','1'].includes(openings ?? '') || history && openings !== '0') throw new SecurityError('INVENTORY_BASIS_CONFLICT',409,'库存基准需核实');
  if (history) {
    const rows = (await session.query<{warehouse_id:string;sku_id:string;unit:string;quantity:string;reconciled:boolean}>(`SELECT warehouse_id,sku_id,unit,quantity::text,reconciliation_difference=0 reconciled
      FROM ${runtime}.inventory_history_projection WHERE (cardinality($1::uuid[])=0 OR warehouse_id=ANY($1::uuid[]))
        AND (cardinality($2::uuid[])=0 OR sku_id=ANY($2::uuid[])) ORDER BY warehouse_id,sku_id,unit`,[warehouseIds,skuIds])).rows;
    if (rows.some(row => !row.reconciled)) throw new SecurityError('INVENTORY_BASIS_CONFLICT',409,'库存累计与流水不一致');
    return rows.map(row=>({warehouseId:row.warehouse_id,skuId:row.sku_id,unit:row.unit,quantity:row.quantity}));
  }
  // The legacy two-dimensional ledger can identify one proven unit only. Ambiguity stays unknown.
  const rows = (await session.query<{warehouse_id: string; sku_id: string; quantity: string; unit:string|null}>(`WITH active AS (SELECT id FROM ${runtime}.inventory_opening_run WHERE active),
    units AS (SELECT c.warehouse_id,c.sku_id,c.unit FROM ${runtime}.inventory_opening_cell c JOIN active a ON a.id=c.run_id
      UNION ALL SELECT warehouse_id,variant_id,unit FROM ${source}.tplus_inventory_balance_source WHERE NOT EXISTS(SELECT 1 FROM active)),
    basis_units AS (SELECT warehouse_id,sku_id,CASE WHEN count(DISTINCT unit)=1 THEN nullif(min(unit),'') END unit,count(DISTINCT unit)>1 conflict
      FROM units GROUP BY warehouse_id,sku_id), skus AS (SELECT id,product_id FROM ${source}.variant
      UNION ALL SELECT id,product_id FROM ${runtime}.variant_overlay ov WHERE NOT EXISTS(SELECT 1 FROM ${source}.variant v WHERE v.id=ov.id)), contributions AS (
      SELECT warehouse_id,variant_id AS sku_id,quantity FROM ${runtime}.inventory_balance_base
      UNION ALL SELECT warehouse_id,sku_id,quantity FROM ${runtime}.inventory_delta
    ), balances AS (SELECT warehouse_id,sku_id,sum(quantity)::text quantity FROM contributions
      WHERE (cardinality($1::uuid[])=0 OR warehouse_id=ANY($1::uuid[]))
        AND (cardinality($2::uuid[])=0 OR sku_id=ANY($2::uuid[]))
      GROUP BY warehouse_id,sku_id)
    SELECT b.*,CASE WHEN bu.conflict THEN NULL ELSE coalesce(bu.unit,u.name,pp.body->>'unit',po.body->>'unit') END unit
      FROM balances b LEFT JOIN basis_units bu USING(warehouse_id,sku_id) LEFT JOIN skus v ON v.id=b.sku_id
      LEFT JOIN ${source}.product p ON p.id=v.product_id LEFT JOIN ${source}.unit u ON u.id=p.unit_id
      LEFT JOIN ${runtime}.product_profile_overlay pp ON pp.product_id=v.product_id LEFT JOIN ${runtime}.product_overlay po ON po.id=v.product_id
      ORDER BY warehouse_id,sku_id`,[warehouseIds,skuIds])).rows;
  return rows.map(row => ({warehouseId:row.warehouse_id,skuId:row.sku_id,unit:row.unit,quantity:row.quantity}));
}

/** Occupancy is per original cell, never a net total across SKUs or units. */
export async function hasNonzeroInventory(session:DataSession,runtime:string,source:string,warehouseIds:readonly string[]=[],skuIds:readonly string[]=[]):Promise<boolean> {
  return (await readInventoryProjection(session,runtime,source,warehouseIds,skuIds)).some(cell=>parseScaled(cell.quantity,4,false)!==0n);
}
