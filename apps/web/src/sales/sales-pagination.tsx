import { useEffect, useState } from 'react';
import type { SalesQueryPageSize } from './contracts.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { DemoPageSizeSelect } from '../demo-controls/page-size-select.tsx';
import { pageFacts, salesCount, salesPageSizes } from './model.ts';

/** Share only the single-select shell/action, never incompatible total/page math. */
const options = salesPageSizes.map(size => ({ value: String(size), label: `${size}张/页` }));
export function SalesPagination(props: { readonly scope: ReadScope; readonly active?: boolean; readonly page: number; readonly pageSize: SalesQueryPageSize; readonly total: string | null;
  readonly busy: boolean; readonly onPage: (page: number) => void; readonly onPageSize: (size: SalesQueryPageSize) => void }) {
  const unavailable = props.busy || props.active === false || !props.scope.active;
  const [jump, setJump] = useState(String(props.page)); useEffect(() => setJump(String(props.page)), [props.page]);
  const facts = pageFacts(props.page, props.pageSize, props.total);
  const target = /^\d{1,16}$/.test(jump) ? BigInt(jump) : 0n;
  const valid = props.total !== null && target >= 1n && target <= facts.pages && target * BigInt(props.pageSize) <= BigInt(Number.MAX_SAFE_INTEGER);
  const go = () => { if (valid && !unavailable) props.onPage(Number(target)); };
  const current = BigInt(props.page);
  const pages = [...new Set([1n, current - 1n, current, current + 1n, facts.pages].filter(page => page >= 1n && page <= facts.pages))].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return <footer className="iw-pagination tc-foot tc-list-pagination sales-pagination">
    <div className="sale-pagination-count"><DemoPageSizeSelect scope={props.scope} active={props.active !== false} label="每页销货单数" value={String(props.pageSize)} options={options} disabled={unavailable} onChange={value => {
        const size = salesPageSizes.find(size => String(size) === value); if (size !== undefined) props.onPageSize(size);
      }} />
      <span>{props.total === null ? '尚未查询' : `共 ${salesCount(props.total)} 张，当前第 ${facts.first}–${facts.last} 张`}</span></div>
    {props.total !== null && <nav className="iw-actions iw-pager-actions" aria-label="销货单列表分页">
      <button type="button" className="iw-button" aria-label="上一页" disabled={unavailable || props.page <= 1} onClick={() => props.onPage(props.page - 1)}>上一页</button>
      {pages.map((page, index) => <span className="sales-page-item" key={page.toString()}>{index > 0 && page - pages[index - 1]! > 1n && <span className="iw-page-ellipsis">…</span>}<button type="button" className="iw-page-button" aria-label={`第${page}页`} aria-current={page === current ? 'page' : undefined} disabled={unavailable || page * BigInt(props.pageSize) > BigInt(Number.MAX_SAFE_INTEGER)} onClick={() => props.onPage(Number(page))}>{page.toString()}</button></span>)}
      <button type="button" className="iw-button" aria-label="下一页" disabled={unavailable || !facts.canNext} onClick={() => props.onPage(props.page + 1)}>下一页</button>
      <span>第 {props.page} / {salesCount(facts.pages.toString())} 页</span>
      <label className="iw-jump">跳至 <input aria-label="目标页码" inputMode="numeric" value={jump} onChange={event => setJump(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); go(); } }} /> 页</label>
      <button type="button" className="iw-text-button" disabled={unavailable || !valid} onClick={go}>跳转</button>
    </nav>}
  </footer>;
}
