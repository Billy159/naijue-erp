import type { ReadScope } from '../loading/read-scope.ts';
import { DemoPageSizeSelect } from '../demo-controls/page-size-select.tsx';
import { transferCount, transferPageFacts, transferPageSizes, type TransferPageSize } from './format.ts';

const options = transferPageSizes.map(size => ({ value: String(size), label: `${size}张/页` }));

/** Frozen transfer list page choices and compact pager, using exact total math. */
export function TransferPagination(props: { readonly scope: ReadScope; readonly active?: boolean; readonly page: number; readonly pageSize: TransferPageSize; readonly total: string | null; readonly busy: boolean;
  readonly onPage: (page: number) => void; readonly onPageSize: (size: TransferPageSize) => void }) {
  const unavailable = props.busy || props.active === false || !props.scope.active;
  const facts = transferPageFacts(props.page, props.pageSize, props.total);
  const candidates = [1n, BigInt(props.page - 1), BigInt(props.page), BigInt(props.page + 1), facts.pages];
  const numbers = [...new Set(candidates.filter(page => page >= 1n && page <= facts.pages))].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return <footer className="tc-foot tc-list-pagination transfer-pagination"><div className="transfer-page-summary"><DemoPageSizeSelect scope={props.scope} active={props.active !== false} label="每页调拨单数量" value={String(props.pageSize)} options={options} disabled={unavailable} onChange={value => {
      const size = transferPageSizes.find(size => String(size) === value); if (size !== undefined) props.onPageSize(size);
    }} /><span>{props.total === null ? '尚未查询' : `共 ${transferCount(props.total)} 张，当前第 ${facts.first}–${facts.last} 张`}</span></div>
    <nav aria-label="调拨列表分页"><button type="button" className="iw-button transfer-page-step" aria-label="上一页" disabled={unavailable || props.total === null || props.page <= 1} onClick={() => props.onPage(props.page - 1)}>上一页</button>
      {numbers.map((page, index) => <span className="transfer-pager-slot" key={page.toString()}>{index > 0 && page - numbers[index - 1]! > 1n && <span className="muted">…</span>}<button type="button" className="iw-page-button" aria-label={`第${page}页`} aria-current={page === BigInt(props.page) ? 'page' : undefined}
        disabled={unavailable || props.total === null || page > BigInt(Number.MAX_SAFE_INTEGER) || page * BigInt(props.pageSize) > BigInt(Number.MAX_SAFE_INTEGER)} onClick={() => props.onPage(Number(page))}>{page.toString()}</button></span>)}
      <button type="button" className="iw-button transfer-page-step" aria-label="下一页" disabled={unavailable || props.total === null || !facts.canNext} onClick={() => props.onPage(props.page + 1)}>下一页</button><span>第 {props.page} / {facts.pages.toString()} 页</span>
    </nav></footer>;
}
