import { Pagination } from '@arco-design/web-react';
import { useEffect, useState } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import { UIButton, UIInput } from './standard-controls.tsx';
import './standard-pagination.css';

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
export interface StandardPaginationProps {
  readonly label: string;
  readonly scope?: ReadScope;
  readonly active?: boolean;
  readonly page: number;
  readonly pageSize: number;
  readonly total: string | number | null;
  readonly disabled: boolean;
  readonly hideOnSinglePage?: boolean;
  readonly showJump?: boolean;
  readonly stepText?: boolean;
  /** Safe known local totals may retain a previous/next presentation. Arco's
   * simple mode has showJumper=false here, so it adds no editable page field. */
  readonly simple?: boolean;
  readonly requireSafePageEnd?: boolean;
  readonly pageSummary?: string;
  readonly onPage: (page: number) => void;
}

/** Arco's total is a JS number. Keep unknown totals absent and large exact
 * totals on an explicit BigInt adapter; never round or invent a total. Domain
 * wrappers retain their page-size choices, range text and executed queries. */
export function StandardPagination(props: StandardPaginationProps) {
  const [jump, setJump] = useState(String(props.page));
  useEffect(() => setJump(String(props.page)), [props.page]);
  if (!Number.isSafeInteger(props.pageSize) || props.pageSize < 1 || !Number.isSafeInteger(props.page) || props.page < 1) throw new TypeError('Invalid pagination page or size');
  if (typeof props.total === 'number' && (!Number.isSafeInteger(props.total) || props.total < 0)) throw new TypeError('Numeric pagination total must be an exact safe integer');
  if (typeof props.total === 'string' && !/^(0|[1-9]\d*)$/.test(props.total)) throw new TypeError('Pagination total must be canonical exact integer text');
  const total = props.total === null ? null : BigInt(props.total);
  const size = BigInt(props.pageSize), current = BigInt(props.page);
  const pages = total === null ? null : total === 0n ? 1n : (total + size - 1n) / size;
  const unavailable = () => props.disabled || props.active === false || props.scope?.active === false;
  const canPage = (page: bigint) => pages !== null && page >= 1n && page <= pages && page <= MAX_SAFE
    && (props.requireSafePageEnd ? page * size : (page - 1n) * size) <= MAX_SAFE;
  const go = (page: bigint) => { if (!unavailable() && canPage(page)) props.onPage(Number(page)); };
  const target = /^[1-9]\d{0,15}$/.test(jump) ? BigInt(jump) : 0n;
  if (total === null || pages === null || (props.simple && total === 0n) || (props.hideOnSinglePage !== false && pages <= 1n)) return null;
  const exactFallback = total > MAX_SAFE, emptyPage = total === 0n && current === 1n;
  const numbers = [...new Set([1n, current - 1n, current, current + 1n, pages].filter(page => page >= 1n && page <= pages))].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return <nav className="erp-pagination iw-actions iw-pager-actions" aria-label={props.label} data-pagination-mode={exactFallback ? 'exact-bigint' : emptyPage ? 'empty-current-page' : 'arco-safe-total'}>
    {exactFallback || emptyPage ? <div className="erp-exact-pagination" aria-label={emptyPage ? props.label : '精确大计数分页'}>
      <UIButton type="button" className={emptyPage && props.stepText ? 'iw-text-button' : 'iw-page-button'} aria-label="上一页" disabled={unavailable() || !canPage(current - 1n)} onClick={() => go(current - 1n)}>{emptyPage && props.stepText ? '上一页' : '‹'}</UIButton>
      {numbers.map((page, index) => <span className="erp-pagination-slot" key={page.toString()}>{index > 0 && page - numbers[index - 1]! > 1n && <span>…</span>}<UIButton type="button" className="iw-page-button" aria-label={`第${page}页`} aria-current={page === current ? 'page' : undefined} disabled={unavailable() || !canPage(page)} onClick={() => { if (!emptyPage) go(page); }}>{page.toString()}</UIButton></span>)}
      <UIButton type="button" className={emptyPage && props.stepText ? 'iw-text-button' : 'iw-page-button'} aria-label="下一页" disabled={unavailable() || !canPage(current + 1n)} onClick={() => go(current + 1n)}>{emptyPage && props.stepText ? '下一页' : '›'}</UIButton>
    </div> : <Pagination current={props.page} pageSize={props.pageSize} total={Number(total)} disabled={unavailable()} size="small" bufferSize={1} simple={props.simple === true} showJumper={false} sizeCanChange={false}
      onChange={page => { if (Number.isSafeInteger(page)) go(BigInt(page)); }}
      itemRender={(_page, type, original) => props.stepText && (type === 'prev' || type === 'next') ? <span>{type === 'prev' ? '上一页' : '下一页'}</span> : original} />}
    {props.pageSummary && <span>{props.pageSummary}</span>}
    {props.showJump !== false && <><label className="iw-jump">跳至 <UIInput aria-label="目标页码" inputMode="numeric" value={jump} disabled={unavailable()} onChange={setJump} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); go(target); } }} /> 页</label><UIButton type="button" className="iw-text-button iw-jump-go" disabled={unavailable() || !canPage(target)} onClick={() => go(target)}>跳转</UIButton></>}
  </nav>;
}
