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
  if (evidence.has_difference) return `${label}（保留原厅，归属差异待核）`;
  if (evidence.review_required) return `${label}（保留原厅，仓库归属待核）`;
  return evidence.basis === 'MIGRATION_DERIVED' ? `${label}（按仓所属厅推定）` : `${label}（原单记录）`;
}
export function historicalHallFacts(evidence: HistoricalSalesHallEvidence): readonly (readonly [string, string | null])[] {
  return [
    ['营业厅取值依据', evidence.basis === 'MIGRATION_DERIVED' ? '迁移派生：按仓库采集时所属厅推定，并非原始记录' : evidence.basis === 'ORIGINAL' ? '保留原单营业厅' : '待核：原厅及仓库所属厅均未明确'],
    ['原单营业厅编号', evidence.original_hall_id], ['采用营业厅编号', evidence.selected_hall_id],
    ['取值仓库编号', evidence.warehouse_id], ['仓库采集时所属厅编号', evidence.warehouse_hall_id_at_capture],
    ['仓库采集版本', evidence.warehouse_version === null ? null : String(evidence.warehouse_version)], ['仓库归属采集时间', evidence.captured_at],
    ['营业厅差异', evidence.has_difference ? '原厅与仓库所属厅不同，保留原值，待核' : '无已知差异'], ['营业厅复核状态', evidence.review_required ? '待核' : '无需差异复核'],
  ];
}
