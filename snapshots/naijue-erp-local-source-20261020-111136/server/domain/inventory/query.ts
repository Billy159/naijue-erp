import type {DataSession, SqlValue} from '../../database/session.js';
import type {AuthorizedContext} from '../../security/service.js';
import {identifier, invalid, object, SecurityError} from '../../security/errors.js';
import {parseBusinessDay} from '../transactions/decimal.js';
import {activeHistoryRun} from './history-store.js';
import {historyInventoryLedger} from './history-query.js';
import {activeCurrentExportRun} from './current-export-store.js';
import {activeFormalBaselineRun} from './formal-current-baseline.js';
import {queryCurrentExportInventory,currentExportInventoryLedger} from './current-export-query.js';
import {inventorySkuDisplaySql,inventorySkuIdentitySql,inventorySkuOptionsSql} from './sku-display-sql.js';

export interface InventoryFilters {
  readonly page: number; readonly size: number; readonly warehouseId: string | null;
  readonly skuId: string | null; readonly productId: string | null; readonly q: string;
  readonly unit: string | null; readonly nonzero: boolean; readonly view: 'original' | 'standard';
}
export interface LedgerFilters extends InventoryFilters {readonly start: string | null; readonly end: string | null}
const optionalId = (value: unknown): string | null => value === undefined ? null : identifier(value,true);
function text(value: unknown, limit = 128): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > limit || value.includes('\0')) return invalid();
  return value.trim();
}
function positive(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' && typeof value !== 'number' || !/^[1-9]\d*$/.test(String(value))) return invalid();
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n > maximum) return invalid();
  return n;
}
export function inventoryFilters(input: unknown): InventoryFilters {
  const q = object(input);
  const allowed = ['page','size','warehouseId','skuId','productId','q','unit','nonzero','view','start','end','sku','warehouse'];
  if (Object.keys(q).some(key => !allowed.includes(key))) return invalid();
  if (q['view'] !== undefined && !['original','standard'].includes(String(q['view']))) return invalid();
  if (q['nonzero'] !== undefined && ![true,false,'true','false'].includes(q['nonzero'] as boolean | string)) return invalid();
  if (q['sku'] !== undefined && q['skuId'] !== undefined && q['sku'] !== q['skuId']
    || q['warehouse'] !== undefined && q['warehouseId'] !== undefined && q['warehouse'] !== q['warehouseId']) return invalid();
  return {page:positive(q['page'],1,1000000),size:positive(q['size'],50,200),
    warehouseId:optionalId(q['warehouseId'] ?? q['warehouse']),skuId:optionalId(q['skuId'] ?? q['sku']),productId:optionalId(q['productId']),
    q:text(q['q']) ?? '',unit:text(q['unit']),nonzero:q['nonzero'] === true || q['nonzero'] === 'true',view:q['view'] === 'standard' ? 'standard' : 'original'};
}
function day(value: unknown): string | null {
  const s = text(value,10);
  if (s === null) return null;
  try {parseBusinessDay(s);} catch {return invalid();}
  return s;
}
export function ledgerFilters(input: unknown): LedgerFilters {
  const query = object(input), filters = inventoryFilters(input), start = day(query['start']), end = day(query['end']);
  if (!filters.skuId || !filters.warehouseId || filters.view !== 'original' || start && end && start > end) return invalid();
  return {...filters,start,end};
}

async function openingGuard(session: DataSession, runtime: string): Promise<boolean> {
  const count = (await session.query<{n:string}>(`SELECT count(*)::text n FROM ${runtime}.inventory_opening_run WHERE active`)).rows[0]?.n;
  if (count !== '0' && count !== '1') throw new SecurityError('INVENTORY_BASIS_CONFLICT',409,'存在多个活动期初，库存来源需核实');
  const history = await activeHistoryRun(session,runtime);
  if (history && count !== '0') throw new SecurityError('INVENTORY_BASIS_CONFLICT',409,'历史累计基准与旧期初同时存在');
  return history !== null;
}

/** Balance and reconciliation share the same REPEATABLE READ session as authorization.
 * Historical source balances are an immutable basis, never reconstructed by replaying history.
 * Standard source projections require a persisted pack and six matching source identity fields.
 * Missing or changed mappings retain their original size as separate display members. */
function warehouseQuantitySql(source: string, runtime: string): string {
  // The delta primary key and grouped contributions each contain at most one row per stock key.
  // Full joins retain every key, including cancelled movements and checkpoint-only cells.
  // Only effective movements require a large SUM; there is no per-warehouse range reread.
  return `WITH active AS (SELECT * FROM ${runtime}.inventory_opening_run WHERE active),
    ${inventorySkuIdentitySql(source,runtime)},
    opening AS (
      SELECT c.warehouse_id,c.sku_id,c.quantity,c.unit FROM ${runtime}.inventory_opening_cell c JOIN active a ON a.id=c.run_id
      WHERE ($1::uuid IS NULL OR c.warehouse_id=$1::uuid) AND ($2::uuid IS NULL OR c.sku_id=$2::uuid)
      UNION ALL SELECT b.warehouse_id,b.variant_id,b.quantity,b.unit FROM ${source}.tplus_inventory_balance_source b
      WHERE NOT EXISTS(SELECT 1 FROM active) AND ($1::uuid IS NULL OR b.warehouse_id=$1::uuid) AND ($2::uuid IS NULL OR b.variant_id=$2::uuid)
    ), basis AS (
      SELECT warehouse_id,sku_id,sum(quantity) quantity,
        CASE WHEN count(DISTINCT unit)=1 THEN min(unit) END unit,count(DISTINCT unit)>1 unit_conflict
      FROM opening GROUP BY warehouse_id,sku_id
    ), checkpoint AS (
      SELECT c.warehouse_id,c.sku_id,sum(c.quantity) quantity
      FROM ${runtime}.inventory_opening_delta_checkpoint c JOIN active a ON a.id=c.run_id GROUP BY c.warehouse_id,c.sku_id
    ), effective AS (
      SELECT m.warehouse_id,m.sku_id,sum(m.quantity) quantity FROM ${runtime}.movement m
      WHERE NOT EXISTS(SELECT 1 FROM ${runtime}.inventory_opening_prior_posting old JOIN active a ON a.id=old.run_id WHERE old.posting_id=m.posting_id)
      GROUP BY m.warehouse_id,m.sku_id
    ), sku_units AS (
      -- Source IDs take precedence in sku_identities; all metadata joins have unique keys.
      -- DISTINCT ON exposes that existing one-SKU/one-row property to the outer planner.
      SELECT DISTINCT ON (v.id) v.id,v.product_id,coalesce(u.name,pp.body->>'unit',po.body->>'unit') fallback_unit
      FROM sku_identities v LEFT JOIN ${source}.product p ON p.id=v.product_id LEFT JOIN ${source}.unit u ON u.id=p.unit_id
      LEFT JOIN ${runtime}.product_overlay po ON po.id=v.product_id LEFT JOIN ${runtime}.product_profile_overlay pp ON pp.product_id=v.product_id
      ORDER BY v.id
    ), quantity_sums AS (
      SELECT coalesce(d.warehouse_id,e.warehouse_id,b.warehouse_id,c.warehouse_id) warehouse_id,
        coalesce(d.sku_id,e.sku_id,b.sku_id,c.sku_id) sku_id,b.unit basis_unit,coalesce(b.unit_conflict,false) unit_conflict,
        coalesce(b.quantity,0) opening_quantity,coalesce(d.quantity,0) delta_quantity,
        coalesce(c.quantity,0) checkpoint_quantity,coalesce(e.quantity,0) effective_quantity
      FROM ${runtime}.inventory_delta d FULL JOIN effective e ON e.warehouse_id=d.warehouse_id AND e.sku_id=d.sku_id
      FULL JOIN basis b ON b.warehouse_id=coalesce(d.warehouse_id,e.warehouse_id) AND b.sku_id=coalesce(d.sku_id,e.sku_id)
      FULL JOIN checkpoint c ON c.warehouse_id=coalesce(d.warehouse_id,e.warehouse_id,b.warehouse_id)
        AND c.sku_id=coalesce(d.sku_id,e.sku_id,b.sku_id)
    ), quantity_cells AS (
      SELECT k.warehouse_id,k.sku_id,v.product_id,
        CASE WHEN k.unit_conflict THEN NULL ELSE coalesce(k.basis_unit,v.fallback_unit) END unit,
        k.unit_conflict,k.opening_quantity,k.delta_quantity-k.checkpoint_quantity current_delta,
        k.effective_quantity,k.opening_quantity+k.delta_quantity-k.checkpoint_quantity quantity,
        k.delta_quantity-k.checkpoint_quantity-k.effective_quantity reconciliation_difference,
        (SELECT id FROM active) opening_run_id,false history_mode
      FROM quantity_sums k LEFT JOIN sku_units v ON v.id=k.sku_id
    ), pre_matches AS (
      SELECT * FROM quantity_cells WHERE ($3::uuid IS NULL OR product_id=$3::uuid)
      AND ($5::text IS NULL OR unit=$5) AND (NOT $6::boolean OR quantity<>0)
    )`;
}
function quantitySql(source: string, runtime: string, history: boolean, productFiltered: boolean, warehouseRollup: boolean): string {
  if (warehouseRollup) return warehouseQuantitySql(source,runtime);
  // Only warehouse/SKU/product identity restrictions commute with every quantity aggregation.
  // Unit conflicts, unit fallback, nonzero and keyword matching are resolved after that aggregation.
  const scope = (alias: string, sku = 'sku_id'): string => `($1::uuid IS NULL OR ${alias}.warehouse_id=$1::uuid)
    AND ($2::uuid IS NULL OR ${alias}.${sku}=$2::uuid)${productFiltered ? `
    AND EXISTS(SELECT 1 FROM sku_identities identity WHERE identity.id=${alias}.${sku} AND identity.product_id=$3::uuid)` : ''}`;
  const accounting = history ? `WITH active AS (SELECT * FROM ${runtime}.inventory_history_run),
    ${inventorySkuIdentitySql(source,runtime)},
    basis AS (SELECT warehouse_id,sku_id,unit,quantity,false unit_conflict FROM ${runtime}.inventory_history_cell b WHERE ${scope('b')}),
    quantity_parts AS (
      SELECT warehouse_id,sku_id,unit stock_unit,unit basis_unit,unit_conflict,quantity,'basis'::text kind FROM basis
      UNION ALL SELECT warehouse_id,sku_id,unit,NULL::text,false,quantity,'delta' FROM ${runtime}.inventory_history_delta d WHERE ${scope('d')}
      UNION ALL SELECT warehouse_id,sku_id,unit,NULL::text,false,quantity,'effective' FROM ${runtime}.inventory_history_movement m WHERE ${scope('m')}
    ),`
    : `WITH active AS (SELECT * FROM ${runtime}.inventory_opening_run WHERE active),
    ${inventorySkuIdentitySql(source,runtime)},
    opening AS (
      SELECT c.warehouse_id,c.sku_id,c.quantity,c.unit FROM ${runtime}.inventory_opening_cell c JOIN active a ON a.id=c.run_id
      WHERE ${scope('c')}
      UNION ALL SELECT b.warehouse_id,b.variant_id,b.quantity,b.unit FROM ${source}.tplus_inventory_balance_source b
      WHERE NOT EXISTS(SELECT 1 FROM active) AND ${scope('b','variant_id')}
    ), basis AS (
      SELECT warehouse_id,sku_id,sum(quantity) quantity,
        CASE WHEN count(DISTINCT unit)=1 THEN min(unit) END unit,count(DISTINCT unit)>1 unit_conflict
      FROM opening GROUP BY warehouse_id,sku_id
    ), quantity_parts AS (
      SELECT warehouse_id,sku_id,NULL::text stock_unit,unit basis_unit,unit_conflict,quantity,'basis'::text kind FROM basis
      UNION ALL SELECT c.warehouse_id,c.sku_id,NULL::text,NULL::text,false,c.quantity,'checkpoint'
        FROM ${runtime}.inventory_opening_delta_checkpoint c JOIN active a ON a.id=c.run_id WHERE ${scope('c')}
      UNION ALL SELECT d.warehouse_id,d.sku_id,NULL::text,NULL::text,false,d.quantity,'delta'
        FROM ${runtime}.inventory_delta d WHERE ${scope('d')}
      UNION ALL SELECT m.warehouse_id,m.sku_id,NULL::text,NULL::text,false,m.quantity,'effective'
        FROM ${runtime}.movement m WHERE ${scope('m')}
        AND NOT EXISTS(SELECT 1 FROM ${runtime}.inventory_opening_prior_posting old JOIN active a ON a.id=old.run_id WHERE old.posting_id=m.posting_id)
    ),`;
  // A single narrow rollup replaces a distinct-key union plus four full-size aggregate joins.
  // Every effective movement is still read, including cancellation/zero groups and off-page discrepancies.
  return `${accounting} quantity_sums AS (
      SELECT warehouse_id,sku_id,stock_unit,min(basis_unit) basis_unit,bool_or(unit_conflict) unit_conflict,
        coalesce(sum(quantity) FILTER(WHERE kind='basis'),0) opening_quantity,
        coalesce(sum(quantity) FILTER(WHERE kind='delta'),0) delta_quantity,
        coalesce(sum(quantity) FILTER(WHERE kind='checkpoint'),0) checkpoint_quantity,
        coalesce(sum(quantity) FILTER(WHERE kind='effective'),0) effective_quantity
      FROM quantity_parts GROUP BY warehouse_id,sku_id,stock_unit
    ), quantity_cells AS (
      SELECT k.warehouse_id,k.sku_id,v.product_id,
        CASE WHEN k.unit_conflict THEN NULL ELSE coalesce(k.stock_unit,k.basis_unit,u.name,pp.body->>'unit',po.body->>'unit') END unit,
        k.unit_conflict,k.opening_quantity,k.delta_quantity-k.checkpoint_quantity current_delta,
        k.effective_quantity,k.opening_quantity+k.delta_quantity-k.checkpoint_quantity quantity,
        k.delta_quantity-k.checkpoint_quantity-k.effective_quantity reconciliation_difference,
        (SELECT id FROM active) opening_run_id,${history ? 'true' : 'false'} history_mode
      FROM quantity_sums k LEFT JOIN sku_identities v ON v.id=k.sku_id LEFT JOIN ${source}.product p ON p.id=v.product_id
      LEFT JOIN ${source}.unit u ON u.id=p.unit_id LEFT JOIN ${runtime}.product_overlay po ON po.id=v.product_id
      LEFT JOIN ${runtime}.product_profile_overlay pp ON pp.product_id=v.product_id
    ), pre_matches AS (
      SELECT * FROM quantity_cells WHERE ($3::uuid IS NULL OR product_id=$3::uuid)
      AND ($5::text IS NULL OR unit=$5) AND (NOT $6::boolean OR quantity<>0)
    )`;
}
function cellDetailsSql(source: string, runtime: string, standard: boolean): string {
  return `cells AS (
      SELECT k.warehouse_id,k.sku_id,k.product_id,coalesce(po.code,p.code) product_code,coalesce(pp.body->>'name',po.body->>'name',p.name) product_name,
        coalesce((pp.body->>'enabled')::boolean,(po.body->>'enabled')::boolean,p.enabled,true) AND NOT coalesce(po.deleted,false) product_enabled,
        v.enabled sku_enabled,v.version sku_version,coalesce(pp.version,p.version,1) product_version,
        coalesce(wm.body->>'name',wo.name,w.name) warehouse_name,coalesce(wm.body->>'code',w.code) warehouse_code,
        coalesce((wm.body->>'enabled')::boolean,wo.enabled,w.enabled) warehouse_enabled,coalesce(wm.version,w.version,1) warehouse_version,
        k.unit,k.unit_conflict,v.origin,v.options,v.standard_group,v.standard_fit,v.standard_size,v.standard_code,v.mapping_status,v.mapping_revision,v.mapping_pack_sha256,
        k.opening_quantity,k.current_delta,k.effective_quantity,k.quantity,k.reconciliation_difference,k.opening_run_id,k.history_mode${standard ? ',k.group_key' : ''}
      FROM page_keys k LEFT JOIN skus v ON v.id=k.sku_id LEFT JOIN ${source}.product p ON p.id=k.product_id
      LEFT JOIN ${runtime}.product_overlay po ON po.id=k.product_id LEFT JOIN ${runtime}.product_profile_overlay pp ON pp.product_id=k.product_id
      LEFT JOIN ${source}.warehouse w ON w.id=k.warehouse_id
      LEFT JOIN ${runtime}.master_reference_overlay wo ON wo.kind='warehouses' AND wo.id=k.warehouse_id
      LEFT JOIN ${runtime}.master_data_entity wm ON wm.kind='warehouses' AND wm.id=k.warehouse_id::text
    )`;
}
const cellView = `jsonb_build_object('warehouseId',warehouse_id,'skuId',sku_id,'productId',product_id,'productCode',product_code,'productName',product_name,
  'productEnabled',product_enabled,'skuEnabled',sku_enabled,'warehouseName',warehouse_name,'warehouseCode',warehouse_code,'warehouseEnabled',warehouse_enabled,
  'versions',jsonb_build_object('product',product_version,'sku',sku_version,'warehouse',warehouse_version),'unit',unit,'unitConflict',unit_conflict,
  'original',jsonb_build_object('origin',origin,'color',options->'COLOR','size',options->'SIZE'),
  'standard',jsonb_build_object('mappingStatus',mapping_status,'group',standard_group,'fit',standard_fit,'size',standard_size,'code',standard_code,
    'mappingRevision',mapping_revision,'packSha256',mapping_pack_sha256),
  'quantity',quantity::text,'basis',jsonb_build_object('kind',CASE WHEN history_mode THEN 'HISTORY_ACCUMULATION' WHEN opening_run_id IS NULL THEN 'SOURCE_BALANCE' ELSE 'OPENING_SNAPSHOT' END,
    'runId',opening_run_id,'openingQuantity',opening_quantity::text,'currentDelta',current_delta::text,'effectiveMovementQuantity',effective_quantity::text,
    'reconstructedQuantity',(opening_quantity+effective_quantity)::text,'difference',reconciliation_difference::text,'reconciled',reconciliation_difference=0),
  'sourceMissing',product_id IS NULL OR warehouse_name IS NULL OR options->'SIZE' IS NULL OR unit IS NULL)`;

function compactOriginalSql(source: string, runtime: string): string {
  // Stored contributions are numeric(18,4): multiplying each row by 10000 fits bigint exactly.
  // SUM(bigint) returns numeric, so neither aggregate totals nor original decimal precision are capped.
  // Detail quantities are read only for the page; every movement still contributes to the full rollup.
  return `WITH active AS (SELECT * FROM ${runtime}.inventory_opening_run WHERE active),
    ${inventorySkuIdentitySql(source,runtime)}, opening AS MATERIALIZED (
      SELECT c.warehouse_id,c.sku_id,c.quantity,c.unit FROM ${runtime}.inventory_opening_cell c JOIN active a ON a.id=c.run_id
      WHERE ($1::uuid IS NULL OR c.warehouse_id=$1::uuid) AND ($2::uuid IS NULL OR c.sku_id=$2::uuid)
      UNION ALL SELECT b.warehouse_id,b.variant_id,b.quantity,b.unit FROM ${source}.tplus_inventory_balance_source b
      WHERE NOT EXISTS(SELECT 1 FROM active) AND ($1::uuid IS NULL OR b.warehouse_id=$1::uuid) AND ($2::uuid IS NULL OR b.variant_id=$2::uuid)
    ), basis AS MATERIALIZED (
      SELECT warehouse_id,sku_id,sum(quantity) quantity,
        CASE WHEN count(DISTINCT unit)=1 THEN min(unit) END unit,count(DISTINCT unit)>1 unit_conflict
      FROM opening GROUP BY warehouse_id,sku_id
    ), checkpoint AS MATERIALIZED (
      SELECT c.warehouse_id,c.sku_id,sum(c.quantity) quantity
      FROM ${runtime}.inventory_opening_delta_checkpoint c JOIN active a ON a.id=c.run_id GROUP BY c.warehouse_id,c.sku_id
    ), quantity_parts AS (
      SELECT warehouse_id,sku_id,(quantity*10000)::bigint stock_scaled,0::bigint difference_scaled,true has_stock,false has_difference FROM opening
      UNION ALL SELECT d.warehouse_id,d.sku_id,(d.quantity*10000)::bigint,(d.quantity*10000)::bigint,true,true FROM ${runtime}.inventory_delta d
      UNION ALL SELECT c.warehouse_id,c.sku_id,(-c.quantity*10000)::bigint,(-c.quantity*10000)::bigint,true,true
        FROM ${runtime}.inventory_opening_delta_checkpoint c JOIN active a ON a.id=c.run_id
      UNION ALL SELECT m.warehouse_id,m.sku_id,0::bigint,(-m.quantity*10000)::bigint,false,true FROM ${runtime}.movement m
        WHERE NOT EXISTS(SELECT 1 FROM ${runtime}.inventory_opening_prior_posting old JOIN active a ON a.id=old.run_id WHERE old.posting_id=m.posting_id)
    ), quantity_sums AS (
      SELECT warehouse_id,sku_id,
        CASE WHEN bool_or(has_stock) THEN sum(stock_scaled)*0.0001 ELSE 0::numeric END quantity,
        CASE WHEN bool_or(has_difference) THEN sum(difference_scaled)*0.0001 ELSE 0::numeric END reconciliation_difference
      FROM quantity_parts GROUP BY warehouse_id,sku_id
    ), sku_units AS (
      SELECT DISTINCT ON (v.id) v.id,v.product_id,coalesce(u.name,pp.body->>'unit',po.body->>'unit') fallback_unit
      FROM sku_identities v LEFT JOIN ${source}.product p ON p.id=v.product_id LEFT JOIN ${source}.unit u ON u.id=p.unit_id
      LEFT JOIN ${runtime}.product_overlay po ON po.id=v.product_id LEFT JOIN ${runtime}.product_profile_overlay pp ON pp.product_id=v.product_id ORDER BY v.id
    ), matches AS MATERIALIZED (
      SELECT k.*,v.product_id,CASE WHEN b.unit_conflict THEN NULL ELSE coalesce(b.unit,v.fallback_unit) END unit,
        coalesce(b.unit_conflict,false) unit_conflict
      FROM quantity_sums k LEFT JOIN basis b ON b.warehouse_id=k.warehouse_id AND b.sku_id=k.sku_id
      LEFT JOIN sku_units v ON v.id=k.sku_id WHERE $3::uuid IS NULL AND $4::text='' AND $5::text IS NULL AND NOT $6::boolean
    ), unit_summary AS (
      SELECT unit,CASE WHEN unit IS NULL THEN sku_id END unknown_sku_id,sum(quantity) quantity,count(*)::int cell_count,
        count(*) FILTER(WHERE quantity<>0)::int nonzero_count,bool_or(reconciliation_difference<>0) has_difference
      FROM matches GROUP BY unit,CASE WHEN unit IS NULL THEN sku_id END
    ), balance_summary AS (
      SELECT coalesce(sum(cell_count),0)::int total,NOT coalesce(bool_or(has_difference),false) reconciled,
        coalesce(jsonb_agg(jsonb_build_object('unit',unit,'unknownSkuId',unknown_sku_id,'quantity',quantity::text,
          'cellCount',cell_count,'nonzeroCellCount',nonzero_count) ORDER BY unit,unknown_sku_id::text),'[]'::jsonb) unit_totals
      FROM unit_summary
    ), page_candidates AS MATERIALIZED (
      SELECT * FROM matches ORDER BY warehouse_id,sku_id,unit LIMIT $7 OFFSET $8
    ), page_keys AS MATERIALIZED (
      SELECT k.*,coalesce(b.quantity,0) opening_quantity,coalesce(d.quantity,0)-coalesce(c.quantity,0) current_delta,
        (SELECT coalesce(sum(m.quantity),0) FROM ${runtime}.movement m WHERE m.warehouse_id=k.warehouse_id AND m.sku_id=k.sku_id
          AND NOT EXISTS(SELECT 1 FROM ${runtime}.inventory_opening_prior_posting old JOIN active a ON a.id=old.run_id WHERE old.posting_id=m.posting_id)) effective_quantity,
        (SELECT id FROM active) opening_run_id,false history_mode
      FROM page_candidates k LEFT JOIN basis b ON b.warehouse_id=k.warehouse_id AND b.sku_id=k.sku_id
      LEFT JOIN ${runtime}.inventory_delta d ON d.warehouse_id=k.warehouse_id AND d.sku_id=k.sku_id
      LEFT JOIN checkpoint c ON c.warehouse_id=k.warehouse_id AND c.sku_id=k.sku_id
    ), page_sku_ids AS (SELECT DISTINCT sku_id FROM page_keys),${inventorySkuDisplaySql(source,runtime,'page_sku_ids')},
    ${cellDetailsSql(source,runtime,false)}, slice AS (SELECT ${cellView} item,warehouse_id,sku_id,unit FROM cells)
    SELECT jsonb_build_object('view','original','items',coalesce((SELECT jsonb_agg(item ORDER BY warehouse_id,sku_id,unit) FROM slice),'[]'::jsonb),
      'total',(SELECT total FROM balance_summary),'originalCellCount',(SELECT total FROM balance_summary),
      'page',$8::int/$7::int+1,'size',$7::int,'unitTotals',(SELECT unit_totals FROM balance_summary),'reconciled',(SELECT reconciled FROM balance_summary)) data`;
}

async function inventoryReadPlan<T>(session: DataSession, read: () => Promise<T>): Promise<T> {
  // Only this full-inventory read in an existing read-only transaction changes its planning policy.
  // The MATERIALIZED barrier saves the previous value before the volatile transaction-local change.
  const previous = (await session.query<{previous:string;applied:boolean}>(`WITH previous AS MATERIALIZED (
    SELECT current_setting('jit') previous,current_setting('transaction_read_only')='on' applied
  ) SELECT p.previous,p.applied,CASE WHEN p.applied THEN set_config('jit','off',true) ELSE p.previous END setting FROM previous p`)).rows[0];
  if (!previous) throw new SecurityError('INVENTORY_READ_FAILED',503,'库存无法回读');
  let complete = false;
  try {const result = await read(); complete = true; return result;}
  finally {
    if (previous.applied) {
      const restore = (): Promise<unknown> => session.query("SELECT set_config('jit',$1,true)",[previous.previous]);
      if (complete) await restore();
      else {try {await restore();} catch { /* A failed action rolls back; retain its original error. */ }}
    }
  }
}

export async function queryInventory(context: AuthorizedContext, f: InventoryFilters): Promise<Record<string,unknown>> {
  const {session,repo} = context;
  const formal=await activeFormalBaselineRun(session,repo.runtime);
  if (formal) return queryCurrentExportInventory(context,f,formal);
  const current=await activeCurrentExportRun(session,repo.runtime);
  if (current) return queryCurrentExportInventory(context,f,current);
  const history = await openingGuard(session,repo.runtime);
  const parameters: SqlValue[] = [f.warehouseId,f.skuId,f.productId,f.q,f.unit,f.nonzero,f.size,(f.page-1)*f.size];
  const standard = f.view === 'standard', s = repo.source, r = repo.runtime;
  const warehouseRollup = !history && f.warehouseId===null && f.skuId===null && f.productId===null;
  if (warehouseRollup && !standard && !f.q && f.unit===null && !f.nonzero) {
    return inventoryReadPlan(session,async () => {
      const result = (await session.query<{data:Record<string,unknown>}>(compactOriginalSql(s,r),parameters)).rows[0]?.data;
      if (!result) throw new SecurityError('INVENTORY_READ_FAILED',503,'库存无法回读');
      return result;
    });
  }
  const keywordJoins = `LEFT JOIN ${s}.product p ON p.id=q.product_id LEFT JOIN ${r}.product_overlay po ON po.id=q.product_id
    LEFT JOIN ${r}.product_profile_overlay pp ON pp.product_id=q.product_id`;
  const keyword = `position(lower($4) in lower(coalesce(coalesce(po.code,p.code),'')||' '||
    coalesce(coalesce(pp.body->>'name',po.body->>'name',p.name),'')||' '||coalesce(v.options::text,'')))>0`;
  // Specifications participate before LIMIT only when the search or standard grouping requires them.
  const search = !standard && f.q ? `, search_sku_ids AS (SELECT DISTINCT sku_id FROM pre_matches),
    ${inventorySkuOptionsSql(s,r,'search_sku_ids')}, matches AS MATERIALIZED (
      SELECT q.* FROM pre_matches q LEFT JOIN search_options v ON v.id=q.sku_id ${keywordJoins} WHERE ${keyword})`
    : standard ? `, metadata_sku_ids AS (SELECT DISTINCT sku_id FROM pre_matches),
      ${inventorySkuDisplaySql(s,r,'metadata_sku_ids')}, matches AS MATERIALIZED (
        SELECT q.*,v.options #>> '{COLOR,id}' color_id,v.standard_group,v.standard_fit,v.standard_size,v.standard_code,
          CASE WHEN v.standard_group IS NULL OR q.unit IS NULL OR v.options #>> '{COLOR,id}' IS NULL THEN q.sku_id END unmapped_sku
        FROM pre_matches q LEFT JOIN skus v ON v.id=q.sku_id ${f.q ? keywordJoins+' WHERE '+keyword : "WHERE $4::text=''"})`
      : ", matches AS MATERIALIZED (SELECT * FROM pre_matches WHERE $4::text='')";
  // Unknown units stay separate by SKU. There is deliberately no cross-unit grand quantity.
  const summary = warehouseRollup ? '(SELECT unit_totals FROM balance_summary)' : `coalesce((SELECT jsonb_agg(x ORDER BY x->>'unit',x->>'unknownSkuId') FROM (
    SELECT jsonb_build_object('unit',unit,'unknownSkuId',CASE WHEN unit IS NULL THEN sku_id END,
      'quantity',sum(quantity)::text,'cellCount',count(*)::int,'nonzeroCellCount',count(*) FILTER(WHERE quantity<>0)::int) x
    FROM matches GROUP BY unit,CASE WHEN unit IS NULL THEN sku_id END) totals),'[]'::jsonb)`;
  const dimensions = 'warehouse_id,product_id,color_id,unit,standard_group,standard_fit,standard_size,standard_code,unmapped_sku';
  const groupKey = (alias: string): string => `jsonb_build_array(${dimensions.split(',').map(key=>alias+'.'+key).join(',')})`;
  const grouped = standard ? `, display AS MATERIALIZED (SELECT ${dimensions},sum(quantity) quantity,${groupKey('m')} group_key
      FROM matches m GROUP BY ${dimensions}),
    group_page AS MATERIALIZED (SELECT * FROM display ORDER BY ${dimensions} LIMIT $7 OFFSET $8),
    page_keys AS MATERIALIZED (SELECT m.*,g.group_key FROM matches m JOIN group_page g ON ${groupKey('m')}=g.group_key),
    ${cellDetailsSql(s,r,true)}, members AS (
      SELECT group_key,jsonb_agg(${cellView} ORDER BY sku_id) members FROM cells GROUP BY group_key),
    slice AS (SELECT jsonb_build_object('warehouseId',g.warehouse_id,'productId',g.product_id,'colorId',g.color_id,'unit',g.unit,
      'standard',jsonb_build_object('group',g.standard_group,'fit',g.standard_fit,'size',g.standard_size,'code',g.standard_code),
      'unmappedSkuId',g.unmapped_sku,'quantity',g.quantity::text,'members',m.members) item,
      ${dimensions.split(',').map(key=>'g.'+key).join(',')}
      FROM group_page g JOIN members m ON m.group_key=g.group_key)`
    : `, page_keys AS MATERIALIZED (SELECT * FROM matches ORDER BY warehouse_id,sku_id,unit LIMIT $7 OFFSET $8),
      page_sku_ids AS (SELECT DISTINCT sku_id FROM page_keys),${inventorySkuDisplaySql(s,r,'page_sku_ids')},
      ${cellDetailsSql(s,r,false)}, slice AS (SELECT ${cellView} item,warehouse_id,sku_id,unit FROM cells)`;
  const totals = warehouseRollup ? `, unit_summary AS (
      SELECT unit,CASE WHEN unit IS NULL THEN sku_id END unknown_sku_id,sum(quantity) quantity,count(*)::int cell_count,
        count(*) FILTER(WHERE quantity<>0)::int nonzero_count,bool_or(reconciliation_difference<>0) has_difference
      FROM matches GROUP BY unit,CASE WHEN unit IS NULL THEN sku_id END
    ), balance_summary AS (
      SELECT coalesce(sum(cell_count),0)::int total,NOT coalesce(bool_or(has_difference),false) reconciled,
        coalesce(jsonb_agg(jsonb_build_object('unit',unit,'unknownSkuId',unknown_sku_id,'quantity',quantity::text,
          'cellCount',cell_count,'nonzeroCellCount',nonzero_count) ORDER BY unit,unknown_sku_id::text),'[]'::jsonb) unit_totals
      FROM unit_summary
    )` : `, balance_summary AS (SELECT count(*)::int total,NOT coalesce(bool_or(reconciliation_difference<>0),false) reconciled FROM matches)`;
  const order = standard ? dimensions : 'warehouse_id,sku_id,unit';
  const read = async (): Promise<Record<string,unknown>> => {
    const result = (await session.query<{data:Record<string,unknown>}>(`${quantitySql(s,r,history,f.productId!==null,warehouseRollup)}${search}${totals}${grouped}
    SELECT jsonb_build_object('view',${f.view === 'standard' ? "'standard'" : "'original'"},'items',coalesce((SELECT jsonb_agg(item ORDER BY ${order}) FROM slice),'[]'::jsonb),
      'total',${standard ? '(SELECT count(*)::int FROM display)' : '(SELECT total FROM balance_summary)'},'originalCellCount',(SELECT total FROM balance_summary),
      'page',$8::int/$7::int+1,'size',$7::int,'unitTotals',${summary},'reconciled',(SELECT reconciled FROM balance_summary)) data`,parameters)).rows[0]?.data;
    if (!result) throw new SecurityError('INVENTORY_READ_FAILED',503,'库存无法回读');
    return result;
  };
  return warehouseRollup ? inventoryReadPlan(session,read) : read();
}

export async function inventoryLedger(context: AuthorizedContext, f: LedgerFilters): Promise<Record<string,unknown>> {
  const {session,repo} = context, r = repo.runtime, s = repo.source;
  const formal=await activeFormalBaselineRun(session,r);
  if (formal) return currentExportInventoryLedger(context,f,formal);
  const current=await activeCurrentExportRun(session,r);
  if (current) return currentExportInventoryLedger(context,f,current);
  if (await activeHistoryRun(session,r)) return historyInventoryLedger(context,f);
  // Read the balance in the same snapshot; it is independent of page/date filters.
  const balance = await queryInventory(context,{...f,page:1,size:1,nonzero:false,q:'',unit:null,productId:null});
  const parameters: SqlValue[] = [f.warehouseId,f.skuId,f.start,f.end,f.size,(f.page-1)*f.size];
  const data = (await session.query<{data:Record<string,unknown>}>(`WITH active AS (SELECT * FROM ${r}.inventory_opening_run WHERE active), events AS (
    SELECT 'opening:'||a.id id,'OPENING_SNAPSHOT' kind,0 phase,a.activated_at time,a.body->>'businessDay' business_day,c.quantity quantity,c.quantity stock_delta,false historical_only,
      NULL::uuid posting_id,NULL::uuid document_id,NULL::integer revision,NULL::integer line_index,NULL::text actor_id,
      jsonb_build_object('runId',a.id,'mode',a.mode,'sourceFile',a.source_file,'sourceSha256',a.source_sha256,'sourceCell',c.source_cell,'sourceRecord',c.source_record) source
      FROM active a JOIN ${r}.inventory_opening_cell c ON c.run_id=a.id WHERE c.warehouse_id=$1::uuid AND c.sku_id=$2::uuid
    UNION ALL SELECT 'basis:'||b.batch_id||':'||b.source_id,'SOURCE_BALANCE',0,b.cutoff_source_date::timestamp AT TIME ZONE 'Asia/Shanghai',b.cutoff_source_date::text,b.quantity,b.quantity,false,
      NULL::uuid,NULL::uuid,NULL::integer,NULL::integer,NULL::text,
      jsonb_build_object('batchId',b.batch_id,'sourceId',b.source_id,'openingQuantity',b.opening_quantity::text,'cutoff',b.cutoff_source_date::text,'unit',b.unit,'components',b.components,'sourceRecord',b.source_payload)
      FROM ${s}.tplus_inventory_balance_source b WHERE NOT EXISTS(SELECT 1 FROM active) AND b.warehouse_id=$1::uuid AND b.variant_id=$2::uuid
    UNION ALL SELECT 'movement:'||p.id||':'||m.line_index,'MOVEMENT',1,p.created_at,coalesce(v.body #>> '{header,business_date}',v.body #>> '{header,businessDate}'),m.quantity,
      CASE WHEN EXISTS(SELECT 1 FROM ${r}.inventory_opening_prior_posting old JOIN active a ON a.id=old.run_id WHERE old.posting_id=p.id) THEN 0 ELSE m.quantity END,
      EXISTS(SELECT 1 FROM ${r}.inventory_opening_prior_posting old JOIN active a ON a.id=old.run_id WHERE old.posting_id=p.id),
      p.id,p.document_id,p.revision,m.line_index,p.actor_id,jsonb_build_object('reason',p.reason,'reversedEffectIdentity',p.reversed_effect_identity)
      FROM ${r}.movement m JOIN ${r}.posting p ON p.id=m.posting_id JOIN ${r}.revision v ON v.document_id=p.document_id AND v.revision=p.revision
      WHERE m.warehouse_id=$1::uuid AND m.sku_id=$2::uuid
    UNION ALL SELECT 'history:'||l.batch_id||':'||l.source_dataset||':'||l.source_id,'SOURCE_HISTORY',-1,h.business_date::timestamp AT TIME ZONE 'Asia/Shanghai',h.business_date::text,
      CASE WHEN h.document_kind='transfer' AND l.from_warehouse_id=$1::uuid THEN -l.stock_quantity_contribution ELSE l.stock_quantity_contribution END,0::numeric,true,
      NULL::uuid,h.target_document_id,1,NULL::integer,NULL::text,
      jsonb_build_object('batchId',l.batch_id,'dataset',l.source_dataset,'sourceId',l.source_id,'sourceDocumentId',l.source_document_id,
        'sourceQuantity',l.source_quantity::text,'unit',l.unit,'createdBy',h.created_by,'auditedBy',h.audited_by,'auditedAt',h.audited_at,
        'lineage',l.source_lineage,'sourceSha256',l.source_sha256,'sourceRecordSha256',l.source_record_sha256)
      FROM ${s}.tplus_history_line l JOIN ${s}.tplus_history_document h ON h.batch_id=l.batch_id AND h.source_dataset=l.source_dataset AND h.source_id=l.source_document_id
      WHERE l.sku_id=$2::uuid AND (l.warehouse_id=$1::uuid OR l.from_warehouse_id=$1::uuid OR l.to_warehouse_id=$1::uuid)
    ), calculated AS (SELECT *,sum(stock_delta) OVER(ORDER BY phase,time,id ROWS UNBOUNDED PRECEDING) period_after FROM events),
    matches AS (SELECT * FROM calculated WHERE ($3::text IS NULL OR business_day>=$3) AND ($4::text IS NULL OR business_day<=$4)),
    slice AS (SELECT * FROM matches ORDER BY phase DESC,time DESC,id DESC LIMIT $5 OFFSET $6)
    SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'time',time,'businessDay',business_day,
      'quantity',quantity::text,'stockDelta',stock_delta::text,'historicalOnly',historical_only,
      'before',CASE WHEN historical_only THEN NULL ELSE (period_after-stock_delta)::text END,
      'after',CASE WHEN historical_only THEN NULL ELSE period_after::text END,
      'postingId',posting_id,'documentId',document_id,'revision',revision,'lineIndex',line_index,'actorId',actor_id,'source',source) ORDER BY phase DESC,time DESC,id DESC) FROM slice),'[]'::jsonb),
      'total',(SELECT count(*)::int FROM matches),'page',$6::int/$5::int+1,'size',$5::int,'reconstructedQuantity',(SELECT coalesce(sum(stock_delta),0)::text FROM events)) data`,parameters)).rows[0]?.data;
  if (!data) throw new SecurityError('INVENTORY_READ_FAILED',503,'库存流水无法回读');
  return {...data,balance};
}
