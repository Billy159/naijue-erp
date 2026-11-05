import { StandardPagination } from '../components/standard-pagination.tsx';
import { partyPageSizes, type PartyPageSize } from './contracts.ts';
import { PartySingleSelect } from './party-single-select.tsx';
/** Frozen INVENTORY_PAGER.markup numeric-window policy, actual settings20/50/100.
 * Reuses the same source Select presentation without its global HTML/DOM bridge. */
export function PartyPagination(props: { readonly page: number; readonly pageSize: PartyPageSize; readonly total: number | null; readonly busy: boolean; readonly onPage: (page: number) => void; readonly onPageSize: (size: PartyPageSize) => void }) {
  return <div className="iw-pagination party-pagination"><PartySingleSelect label="每页数量" pagination value={String(props.pageSize)} disabled={props.busy} options={partyPageSizes.map(size => ({ value: String(size), label: `${size}条/页` }))} onChange={value => props.onPageSize(Number(value) as PartyPageSize)} /><span>{props.total === null ? '正在读取' : `共 ${props.total.toLocaleString('zh-CN')} 条${props.total ? `，当前第 ${(props.page - 1) * props.pageSize + 1}–${Math.min(props.page * props.pageSize, props.total)} 条` : ''}`}</span><StandardPagination {...props} label="客户供应商列表分页" disabled={props.busy} /></div>;
}
