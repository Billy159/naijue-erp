import { useEffect, useState } from 'react';
import type { SalesQueryPageSize } from './contracts.ts';
import { pageFacts, salesCount, salesPageSizes } from './model.ts';

/** InventoryPagination cannot be reused: it requires Number totals and 100/200/500
 * product pages. Keep its shared visual classes, not an incompatible data contract. */
export function SalesPagination(props: { readonly page: number; readonly pageSize: SalesQueryPageSize; readonly total: string | null;
  readonly busy: boolean; readonly onPage: (page: number) => void; readonly onPageSize: (size: SalesQueryPageSize) => void }) {
  const [jump, setJump] = useState(String(props.page)); useEffect(() => setJump(String(props.page)), [props.page]);
  const facts = pageFacts(props.page, props.pageSize, props.total);
  const target = /^\d{1,16}$/.test(jump) ? BigInt(jump) : 0n;
  const valid = props.total !== null && target >= 1n && target <= facts.pages && target * BigInt(props.pageSize) <= BigInt(Number.MAX_SAFE_INTEGER);
  const go = () => { if (valid && !props.busy) props.onPage(Number(target)); };
  return <div className="iw-pagination sales-pagination">
    <select className="iw-select" aria-label="每页销货单数" value={props.pageSize} disabled={props.busy} onChange={event => props.onPageSize(Number(event.target.value) as SalesQueryPageSize)}>{salesPageSizes.map(size => <option value={size} key={size}>{size}张/页</option>)}</select>
    <span>{props.total === null ? '尚未查询' : `共 ${salesCount(props.total)} 张${facts.first ? `，当前第 ${facts.first}–${facts.last} 张` : ''}`}</span>
    {props.total !== null && facts.pages > 1n && <div className="iw-actions iw-pager-actions">
      <button type="button" className="iw-page-button" aria-label="上一页" disabled={props.busy || props.page <= 1} onClick={() => props.onPage(props.page - 1)}>‹</button>
      <span>第 {props.page} / {salesCount(facts.pages.toString())} 页</span>
      <button type="button" className="iw-page-button" aria-label="下一页" disabled={props.busy || !facts.canNext} onClick={() => props.onPage(props.page + 1)}>›</button>
      <label className="iw-jump">跳至 <input aria-label="目标页码" inputMode="numeric" value={jump} onChange={event => setJump(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); go(); } }} /> 页</label>
      <button type="button" className="iw-text-button" disabled={props.busy || !valid} onClick={go}>跳转</button>
    </div>}
  </div>;
}
