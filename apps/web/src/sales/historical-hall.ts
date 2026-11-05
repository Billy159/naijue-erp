import { parseHistoricalSalesHallEvidence, type HistoricalSalesHallEvidence } from '../../../../packages/application/src/historical-sales-hall-evidence.ts';

export function historicalHallFields(value: unknown): string[] {
  return value !== null && typeof value === 'object' && Object.hasOwn(value, 'historicalHallEvidence') ? ['historicalHallEvidence', 'historicalHallDiffersFromCurrent'] : [];
}
/** Readback validation only. A browser projection cannot authorize a command. */
export function validateHistoricalHall(value: unknown, hallId: unknown, warehouseId: unknown, differsFromCurrent: unknown): HistoricalSalesHallEvidence {
  const evidence = parseHistoricalSalesHallEvidence(value);
  if (typeof differsFromCurrent !== 'boolean' || differsFromCurrent !== (evidence.selected_hall_id !== hallId || evidence.warehouse_id !== warehouseId)) throw new TypeError('Historical hall difference does not match the document.');
  return evidence;
}
export function salesHallLabel(name: string | null | undefined, hallId: string | null, evidence?: HistoricalSalesHallEvidence, historical = false, differsFromCurrent = false): string {
  const label = hallId === null ? '未记录' : name || hallId;
  if (!evidence) return hallId === null ? '未记录（待核）' : historical ? `${label}（取值依据未记录）` : label;
  if (differsFromCurrent) return `${label}（已调整，与导入取值不同）`;
  if (evidence.basis === 'PENDING_REVIEW') return '营业厅待核（仓库归属未明确）';
  if (evidence.format_version === 'HISTORICAL_SALES_HALL_EVIDENCE_V2' && evidence.has_difference && !evidence.review_required) return `${label}（按已确认仓库归属推定）`;
  if (evidence.has_difference) return `${label}（保留原厅，归属差异待核）`;
  if (evidence.review_required) return `${label}（保留原厅，仓库归属待核）`;
  return evidence.basis === 'MIGRATION_DERIVED' ? `${label}（按仓所属厅推定）` : `${label}（原单记录）`;
}
export function historicalHallFacts(evidence: HistoricalSalesHallEvidence): readonly (readonly [string, string | null])[] {
  if (evidence.format_version === 'HISTORICAL_SALES_HALL_EVIDENCE_V2') return [
    ['营业厅取值依据', '迁移派生：沿已确认仓库关系推定，并非原始记录'],
    ['原单营业厅编号', evidence.original_hall_id], ['采用营业厅编号', evidence.selected_hall_id],
    ['取值仓库编号', evidence.warehouse_id], ['目标仓库所属厅编号', evidence.target_snapshot.hall_id],
    ['目标仓库版本', String(evidence.target_snapshot.version)], ['目标仓库采集时间', evidence.target_snapshot.captured_at],
    ['来源仓库编号', evidence.source_capture.runtime_warehouse_id],
    ['来源原生版本', evidence.source_capture.source_native_version === null ? null : String(evidence.source_capture.source_native_version)],
    ['来源有效版本', String(evidence.source_capture.effective_version)],
    ['来源仓库所属厅编号', evidence.source_capture.runtime_hall_ids.join('、')],
    ['来源归属采集时间', evidence.source_capture.captured_at],
    ['营业厅差异', evidence.has_difference ? evidence.review_required ? '来源存在多厅，待核' : '来源存在多厅，按已确认单厅关系采用' : '无已知差异'],
    ['营业厅复核状态', evidence.review_required ? '待核' : evidence.resolution === null ? '无需差异复核' : '已有明确归属裁决'],
  ];
  return [
    ['营业厅取值依据', evidence.basis === 'MIGRATION_DERIVED' ? '迁移派生：按仓库采集时所属厅推定，并非原始记录' : evidence.basis === 'ORIGINAL' ? '保留原单营业厅' : '待核：原厅及仓库所属厅均未明确'],
    ['原单营业厅编号', evidence.original_hall_id], ['采用营业厅编号', evidence.selected_hall_id],
    ['取值仓库编号', evidence.warehouse_id], ['仓库采集时所属厅编号', evidence.warehouse_hall_id_at_capture],
    ['仓库采集版本', evidence.warehouse_version === null ? null : String(evidence.warehouse_version)], ['仓库归属采集时间', evidence.captured_at],
    ['营业厅差异', evidence.has_difference ? '原厅与仓库所属厅不同，保留原值，待核' : '无已知差异'], ['营业厅复核状态', evidence.review_required ? '待核' : '无需差异复核'],
  ];
}
