import './historical-hall-note.css';
import type { HistoricalSalesHallEvidence } from '../../../../packages/application/src/historical-sales-hall-evidence.ts';
import { historicalHallFacts } from './historical-hall.ts';
export function HistoricalHallNote({ evidence, differsFromCurrent = false }: { readonly evidence?: HistoricalSalesHallEvidence | undefined; readonly differsFromCurrent?: boolean | undefined }) {
  if (!evidence) return null;
  return <details className="sale-historical-hall-evidence" data-hall-evidence={evidence.basis}><summary>{differsFromCurrent ? '当前厅或仓已调整，导入取值依据仍保留' : evidence.has_difference ? '营业厅归属存在差异，待核' : evidence.review_required ? '营业厅归属待核' : evidence.basis === 'MIGRATION_DERIVED' ? '营业厅为推定值，查看取值依据' : '查看营业厅原值与取值依据'}</summary>{differsFromCurrent && <p>当前营业厅或仓库与导入时采用的值不同；以下为保留的导入依据，不表示当前值仍为原值或推定值。</p>}<dl>{historicalHallFacts(evidence).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '未记录'}</dd></div>)}</dl></details>;
}
