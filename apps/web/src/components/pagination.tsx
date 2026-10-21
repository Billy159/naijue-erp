import { useEffect, useState } from 'react';
import type { InventoryPageSize } from '../inventory/contracts.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { InventoryPageSizeSelect } from './inventory-page-size.tsx';

export function InventoryPagination(props: {
  readonly scope: ReadScope;
  readonly page: number;
  readonly pageSize: InventoryPageSize;
  readonly total: number | null;
  readonly busy: boolean;
  readonly onPage: (page: number) => void;
  readonly onPageSize: (size: InventoryPageSize) => void;
}) {
  const [jump, setJump] = useState(String(props.page));
  useEffect(() => setJump(String(props.page)), [props.page]);
  const pages = Math.max(1, Math.ceil((props.total ?? 0) / props.pageSize));
  const numbers = [...new Set([1, props.page - 1, props.page, props.page + 1, pages].filter(page => page >= 1 && page <= pages))].sort((a, b) => a - b);
  const validJump = /^\d+$/.test(jump) && Number.isSafeInteger(Number(jump)) && Number(jump) >= 1 && Number(jump) <= pages;
  return <div className="iw-pagination">
    <InventoryPageSizeSelect scope={props.scope} value={props.pageSize} disabled={props.busy} onChange={props.onPageSize} />
    <span>{props.total === null ? '尚未查询' : `共 ${props.total.toLocaleString('zh-CN')} 款${props.total ? `，当前第 ${(props.page - 1) * props.pageSize + 1}–${Math.min(props.page * props.pageSize, props.total)} 款` : ''}`}</span>
    {pages > 1 && <div className="iw-actions iw-pager-actions">
      <button type="button" className="iw-page-button" aria-label="上一页" disabled={props.busy || props.page <= 1} onClick={() => props.onPage(props.page - 1)}>‹</button>
      {numbers.map((page, index) => <span className="iw-actions" key={page}>{index > 0 && page - numbers[index - 1]! > 1 && <span className="iw-page-ellipsis muted">…</span>}<button type="button" className="iw-page-button" aria-label={`第${page}页`} aria-current={page === props.page ? 'page' : undefined} disabled={props.busy} onClick={() => props.onPage(page)}>{page}</button></span>)}
      <button type="button" className="iw-page-button" aria-label="下一页" disabled={props.busy || props.page >= pages} onClick={() => props.onPage(props.page + 1)}>›</button>
      <label className="iw-jump">跳至 <input aria-label="目标页码" inputMode="numeric" value={jump} onChange={event => setJump(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && validJump && !props.busy) props.onPage(Number(jump)); }} /> 页</label>
      <button type="button" className="iw-text-button iw-jump-go" disabled={props.busy || !validJump} onClick={() => props.onPage(Number(jump))}>跳转</button>
    </div>}
  </div>;
}
