import { Fragment, useEffect, useState } from 'react';
import { DemoPageSizeSelect } from '../../demo-controls/page-size-select.tsx';
import type { ReadScope } from '../../loading/read-scope.ts';
import type { CatalogueSettingsListQuery } from './contracts.ts';
import '../../demo-controls/page-size-shell.css';
type CataloguePageSize = CatalogueSettingsListQuery['pageSize'];

// Frozen settings pagination: server total and page only, same existing selector.
export function CataloguePagination(props: { readonly scope: ReadScope; readonly page: number; readonly pageSize: CataloguePageSize; readonly total: number | null; readonly busy: boolean; readonly onPage: (page: number) => void; readonly onPageSize: (size: CataloguePageSize) => void }) {
  const [jump, setJump] = useState(String(props.page));
  useEffect(() => setJump(String(props.page)), [props.page]);
  const pages = props.total === null ? null : Math.max(1, Math.ceil(props.total / props.pageSize));
  const numbers = pages === null ? [] : [...new Set([1, pages, props.page - 1, props.page, props.page + 1].filter(page => page >= 1 && page <= pages))].sort((a, b) => a - b);
  const unavailable = props.busy || !props.scope.active;
  const go = (page: number) => { if (!unavailable && Number.isSafeInteger(page) && pages !== null && page >= 1 && page <= pages) props.onPage(page); };
  const target = /^[1-9]\d{0,15}$/.test(jump) ? Number(jump) : 0;
  const start = props.total !== null && props.total > 0 ? (props.page - 1) * props.pageSize + 1 : 0;
  return <div className="iw-pagination pc-pagination pc-settings-pagination catalogue-pagination">
    <DemoPageSizeSelect scope={props.scope} label="商品设置每页条数" value={String(props.pageSize)} disabled={unavailable} options={[20, 50, 100].map(size => ({ value: String(size), label: `${size}条/页` }))} onChange={value => props.onPageSize(Number(value) as CataloguePageSize)} />
    <span>{props.total === null ? (props.busy ? '正在读取' : '尚未读取') : `共 ${props.total.toLocaleString('zh-CN')} 条${start && start <= props.total ? `，当前第 ${start}–${Math.min(props.page * props.pageSize, props.total)} 条` : ''}`}</span>
    {pages !== null && pages > 1 && <div className="actions" aria-label="商品颜色版型分页">
      <button type="button" className="btn iw-page-arrow" aria-label="上一页" disabled={unavailable || props.page <= 1} onClick={() => go(props.page - 1)}>‹</button>
      {numbers.map((page, index) => <Fragment key={page}>{index > 0 && page - numbers[index - 1]! > 1 && <span className="iw-page-ellipsis">…</span>}<button type="button" className="btn iw-page-number" aria-label={`第${page}页`} aria-current={page === props.page ? 'page' : undefined} disabled={unavailable} onClick={() => go(page)}>{page}</button></Fragment>)}
      <button type="button" className="btn iw-page-arrow" aria-label="下一页" disabled={unavailable || props.page >= pages} onClick={() => go(props.page + 1)}>›</button>
      <label className="iw-jump">跳至 <input id="pc-setting-jump" type="text" inputMode="numeric" aria-label="目标页码" value={jump} disabled={unavailable} onChange={event => setJump(event.currentTarget.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); go(target); } }} /> 页</label>
      <button type="button" className="btn iw-jump-go" disabled={unavailable || !Number.isSafeInteger(target) || target < 1 || target > pages} onClick={() => go(target)}>跳转</button>
    </div>}
    {pages !== null && props.page > pages && <button type="button" className="btn" disabled={unavailable} onClick={() => go(1)}>返回第一页</button>}
  </div>;
}
