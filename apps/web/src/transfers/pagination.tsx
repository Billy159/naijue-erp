import { StandardPagination } from '../components/standard-pagination.tsx';
import type { ReadScope } from '../loading/read-scope.ts';
import { DemoPageSizeSelect } from '../demo-controls/page-size-select.tsx';
import { transferCount, transferPageFacts, transferPageSizes, type TransferPageSize } from './format.ts';

const options = transferPageSizes.map(size => ({ value: String(size), label: `${size}张/页` }));

/** Frozen transfer list page choices and compact pager, using exact total math. */
export function TransferPagination(props: { readonly scope: ReadScope; readonly active?: boolean; readonly page: number; readonly pageSize: TransferPageSize; readonly total: string | null; readonly busy: boolean;
  readonly onPage: (page: number) => void; readonly onPageSize: (size: TransferPageSize) => void }) {
  const unavailable = props.busy || props.active === false || !props.scope.active;
  const facts = transferPageFacts(props.page, props.pageSize, props.total);
  return <footer className="tc-foot tc-list-pagination transfer-pagination"><div className="transfer-page-summary"><DemoPageSizeSelect scope={props.scope} active={props.active !== false} label="每页调拨单数量" value={String(props.pageSize)} options={options} disabled={unavailable} onChange={value => {
      const size = transferPageSizes.find(size => String(size) === value); if (size !== undefined) props.onPageSize(size);
    }} /><span>{props.total === null ? '尚未查询' : `共 ${transferCount(props.total)} 张，当前第 ${facts.first}–${facts.last} 张`}</span></div>
    <StandardPagination {...props} label="调拨列表分页" disabled={unavailable} hideOnSinglePage={false} showJump={false} stepText requireSafePageEnd pageSummary={`第 ${props.page} / ${facts.pages.toString()} 页`} /></footer>;
}
