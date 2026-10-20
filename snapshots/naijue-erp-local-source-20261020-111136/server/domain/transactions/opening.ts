import {createHash} from 'node:crypto';
import type {DataSession} from '../../database/session.js';
import {SecurityError} from '../../security/errors.js';
import {canonicalJson} from '../idempotency/index.js';
import {parseBusinessDay, parseScaled} from './decimal.js';
import {activeHistoryRun} from '../inventory/history-store.js';
import {assertCurrentExportReadOnly} from '../inventory/current-export-store.js';

export interface OpeningCell {
  readonly warehouseId: string;
  readonly skuId: string;
  readonly quantity: string;
  readonly unit: string;
  readonly sourceCell: string;
  readonly sourceRecord: Readonly<Record<string, unknown>>;
}

export interface CoveredBaselineDocument {
  readonly documentId: string;
  readonly revision: number;
  readonly effectIdentity: string;
}

/** Hash-bound low-level input. T33 must still produce and approve the source manifest. */
export interface OpeningSnapshotPlan {
  readonly revision: string;
  readonly businessDay: string;
  readonly sourceSha256: string;
  readonly sourceFile: string;
  readonly rulesSha256: string;
  readonly standardPackSha256: string;
  readonly expectedActiveRevision: string | null;
  readonly expectedCellCount: number;
  readonly expectedCoveredBaselineDocumentCount: number;
  readonly manifestSha256: string;
  readonly issues: readonly string[];
  readonly cells: readonly OpeningCell[];
  readonly coveredBaselineDocuments: readonly CoveredBaselineDocument[];
}

export interface OpeningTarget {
  readonly runtime: string;
  readonly source: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/;
const id = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const key = (warehouseId: string, skuId: string): string => `${warehouseId}:${skuId}`;
const digest = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');

function manifestFor(plan: OpeningSnapshotPlan): Record<string, unknown> {
  return {revision: plan.revision, businessDay: plan.businessDay, sourceSha256: plan.sourceSha256, sourceFile: plan.sourceFile,
    rulesSha256: plan.rulesSha256, standardPackSha256: plan.standardPackSha256, expectedActiveRevision: plan.expectedActiveRevision,
    expectedCellCount: plan.expectedCellCount, expectedCoveredBaselineDocumentCount: plan.expectedCoveredBaselineDocumentCount};
}

function validatePlan(plan: OpeningSnapshotPlan): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(plan.revision) || plan.revision.trim() !== plan.revision
    || !sha256.test(plan.sourceSha256) || !sha256.test(plan.rulesSha256) || !sha256.test(plan.standardPackSha256)
    || !sha256.test(plan.manifestSha256) || !plan.sourceFile.trim() || plan.sourceFile.length > 512
    || plan.expectedActiveRevision !== null && (typeof plan.expectedActiveRevision !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(plan.expectedActiveRevision))
    || !Number.isSafeInteger(plan.expectedCellCount) || plan.expectedCellCount < 1
    || !Number.isSafeInteger(plan.expectedCoveredBaselineDocumentCount) || plan.expectedCoveredBaselineDocumentCount < 0
    || !Array.isArray(plan.issues) || plan.issues.length !== 0 || !Array.isArray(plan.cells) || !Array.isArray(plan.coveredBaselineDocuments)
    || plan.expectedCellCount !== plan.cells.length || plan.expectedCoveredBaselineDocumentCount !== plan.coveredBaselineDocuments.length
    || digest(manifestFor(plan)) !== plan.manifestSha256) {
    throw new SecurityError('VALIDATION', 400, '期初清单或来源摘要无效');
  }
  const cells = new Set<string>();
  for (const cell of plan.cells) {
    if (!id(cell.warehouseId) || !id(cell.skuId) || typeof cell.unit !== 'string' || !cell.unit.trim() || cell.unit.length > 64
      || typeof cell.sourceCell !== 'string' || !cell.sourceCell.trim() || cell.sourceCell.length > 256
      || !cell.sourceRecord || typeof cell.sourceRecord !== 'object' || Array.isArray(cell.sourceRecord)) {
      throw new SecurityError('VALIDATION', 400, '期初单元缺少仓库、SKU、单位或来源身份');
    }
    try {parseScaled(cell.quantity, 4, false);} catch {throw new SecurityError('VALIDATION', 400, '期初数量精度或范围无效');}
    const identity = key(cell.warehouseId, cell.skuId);
    if (cells.has(identity)) throw new SecurityError('VALIDATION', 400, '期初单元重复');
    cells.add(identity);
  }
  const documents = new Set<string>();
  for (const document of plan.coveredBaselineDocuments) {
    if (!id(document.documentId) || !Number.isSafeInteger(document.revision) || document.revision < 1
      || typeof document.effectIdentity !== 'string' || !document.effectIdentity.startsWith('baseline:') || document.effectIdentity.length > 256) {
      throw new SecurityError('VALIDATION', 400, '被期初覆盖的历史单据身份无效');
    }
    const identity = `${document.documentId}:${document.revision}:${document.effectIdentity}`;
    if (documents.has(identity)) throw new SecurityError('VALIDATION', 400, '被期初覆盖的历史单据重复');
    documents.add(identity);
  }
  try {parseBusinessDay(plan.businessDay);} catch {throw new SecurityError('VALIDATION', 400, '期初业务截止日无效');}
}

/**
 * Activates an explicitly verified cutover plan inside an already authorized T09 transaction.
 * This is intentionally not an HTTP route: T33 owns manifest/Gate authorization and supplies
 * this primitive only after its source, rule, standard package and target database checks pass.
 */
export async function activateOpeningSnapshot(session: DataSession, target: OpeningTarget, plan: OpeningSnapshotPlan): Promise<{applied: boolean; revision: string; cells: number; coveredBaselineDocuments: number}> {
  validatePlan(plan);
  if (!/^"[a-z][a-z0-9_]{0,62}"$/.test(target.runtime) || !/^"[a-z][a-z0-9_]{0,62}"$/.test(target.source)) {
    throw new SecurityError('VALIDATION',400,'期初目标schema无效');
  }
  await session.lock([{scope: 'reference', key: 'inventory-opening-snapshot'}, {scope: 'inventory', key: 'posting-ledger'}]);
  const runtime = target.runtime, source = target.source;
  await assertCurrentExportReadOnly(session,runtime);
  if (await activeHistoryRun(session,runtime)) throw new SecurityError('REVISION',409,'已绑定历史累计基准，拒绝覆盖为旧期初');
  const existing = (await session.query<{id: string; source_sha256: string; source_file: string; mode: string; body: Record<string, unknown>; active: boolean}>(
    `SELECT id,source_sha256,source_file,mode,body,active FROM ${runtime}.inventory_opening_run WHERE id=$1 FOR UPDATE`, [plan.revision])).rows[0];
  if (existing?.active) {
    if (existing.source_sha256 !== plan.sourceSha256 || existing.source_file !== plan.sourceFile || existing.mode !== 'CONFIRMED_CUTOVER'
      || existing.body['manifestSha256'] !== plan.manifestSha256) throw new SecurityError('REVISION', 409, '期初版本已存在且内容不同');
    return {applied: false, revision: plan.revision, cells: plan.cells.length, coveredBaselineDocuments: plan.coveredBaselineDocuments.length};
  }
  if (existing) throw new SecurityError('REVISION', 409, '期初版本已经使用过，不能重新激活');
  const active = (await session.query<{id: string}>(`SELECT id FROM ${runtime}.inventory_opening_run WHERE active FOR UPDATE`)).rows[0]?.id ?? null;
  if (active !== plan.expectedActiveRevision) throw new SecurityError('REVISION', 409, '当前期初版本已变化，请重新核对');

  const cellPayload = plan.cells.map(cell => ({warehouseId: cell.warehouseId, skuId: cell.skuId}));
  const knownSkus = (await session.query<{count: string}>(`WITH wanted AS (SELECT (x->>'skuId')::uuid id FROM jsonb_array_elements($1::jsonb) x), known AS (
    SELECT id FROM ${source}.variant UNION ALL SELECT id FROM ${runtime}.variant_overlay)
    SELECT count(*)::text count FROM wanted w JOIN known k USING(id)`, [JSON.stringify(cellPayload)])).rows[0]?.count;
  const knownWarehouses = (await session.query<{count: string}>(`WITH wanted AS (SELECT DISTINCT (x->>'warehouseId')::uuid id FROM jsonb_array_elements($1::jsonb) x), known AS (
    SELECT id FROM ${source}.warehouse UNION SELECT id FROM ${runtime}.master_reference_overlay WHERE kind='warehouses')
    SELECT count(*)::text count FROM wanted w JOIN known k USING(id)`, [JSON.stringify(cellPayload)])).rows[0]?.count;
  if (knownSkus !== String(plan.cells.length) || knownWarehouses !== String(new Set(plan.cells.map(cell => cell.warehouseId)).size)) {
    throw new SecurityError('VALIDATION', 400, '期初包含未知或重复的SKU/仓库身份');
  }

  const undatedBaseline = (await session.query<{count: string}>(`SELECT count(*)::text count FROM ${runtime}.document
    WHERE baseline_was_included AND current_effect_active AND active_effect_identity LIKE 'baseline:%' AND business_day IS NULL`)).rows[0]?.count;
  if (undatedBaseline !== '0') throw new SecurityError('VALIDATION',409,'有效历史贡献缺少业务日期，期初截止范围无法核实');
  const actualBaseline = (await session.query<CoveredBaselineDocument>(`SELECT id AS "documentId",active_effect_revision AS revision,active_effect_identity AS "effectIdentity"
    FROM ${runtime}.document WHERE baseline_was_included AND current_effect_active AND active_effect_identity LIKE 'baseline:%'
      AND business_day <= $1::date ORDER BY id`, [plan.businessDay])).rows;
  const expectedBaseline = [...plan.coveredBaselineDocuments].sort((a,b) => a.documentId.localeCompare(b.documentId));
  if (actualBaseline.length !== expectedBaseline.length || actualBaseline.some((row,index) => {
    const expected = expectedBaseline[index];
    return !expected || row.documentId !== expected.documentId || row.revision !== expected.revision || row.effectIdentity !== expected.effectIdentity;
  })) throw new SecurityError('VALIDATION', 409, '期初覆盖的历史贡献与当前有效单据不一致');

  const storedPlan = {...manifestFor(plan), manifestSha256: plan.manifestSha256};
  await session.query(`INSERT INTO ${runtime}.inventory_opening_run(id,source_sha256,source_file,mode,body,active)
    VALUES($1,$2,$3,'CONFIRMED_CUTOVER',$4::jsonb,false) RETURNING id`, [plan.revision,plan.sourceSha256,plan.sourceFile,JSON.stringify(storedPlan)]);
  await session.query(`INSERT INTO ${runtime}.inventory_opening_cell(run_id,warehouse_id,sku_id,quantity,unit,source_cell,source_record)
    SELECT $1,(x->>'warehouseId')::uuid,(x->>'skuId')::uuid,(x->>'quantity')::numeric(18,4),x->>'unit',x->>'sourceCell',x->'sourceRecord'
    FROM jsonb_array_elements($2::jsonb) x RETURNING source_cell`, [plan.revision,JSON.stringify(plan.cells)]);
  await session.query(`INSERT INTO ${runtime}.inventory_opening_delta_checkpoint(run_id,warehouse_id,sku_id,quantity)
    SELECT $1,warehouse_id,sku_id,quantity FROM ${runtime}.inventory_delta RETURNING sku_id`, [plan.revision]);
  await session.query(`INSERT INTO ${runtime}.inventory_opening_prior_posting(run_id,posting_id)
    SELECT $1,id FROM ${runtime}.posting RETURNING posting_id`, [plan.revision]);
  await session.query(`INSERT INTO ${runtime}.inventory_opening_prior_document(run_id,document_id,revision,effect_identity)
    SELECT $1,(x->>'documentId')::uuid,(x->>'revision')::integer,x->>'effectIdentity'
    FROM jsonb_array_elements($2::jsonb) x RETURNING document_id`, [plan.revision,JSON.stringify(plan.coveredBaselineDocuments)]);
  await session.query(`UPDATE ${runtime}.inventory_opening_run SET active=false WHERE active RETURNING id`);
  await session.query(`UPDATE ${runtime}.inventory_opening_run SET active=true WHERE id=$1 RETURNING id`, [plan.revision]);

  const mismatch = (await session.query<{count: string}>(`WITH actual AS (
      SELECT warehouse_id,variant_id AS sku_id,quantity FROM ${runtime}.inventory_balance_base
      UNION ALL SELECT warehouse_id,sku_id,quantity FROM ${runtime}.inventory_delta
    ), balances AS (SELECT warehouse_id,sku_id,sum(quantity) quantity FROM actual GROUP BY warehouse_id,sku_id),
    wanted AS (SELECT warehouse_id,sku_id,quantity FROM ${runtime}.inventory_opening_cell WHERE run_id=$1)
    SELECT count(*)::text count FROM balances b FULL JOIN wanted w USING(warehouse_id,sku_id)
    WHERE coalesce(b.quantity,0)<>coalesce(w.quantity,0)`, [plan.revision])).rows[0]?.count;
  if (mismatch !== '0') throw new SecurityError('ROLLED_BACK', 409, '期初激活后的库存投影与完整清单不一致，操作已回滚');
  return {applied: true, revision: plan.revision, cells: plan.cells.length, coveredBaselineDocuments: plan.coveredBaselineDocuments.length};
}

export const openingManifestDigest = (plan: OpeningSnapshotPlan): string => digest(manifestFor(plan));
