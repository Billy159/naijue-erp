import { StandardPagination } from '../components/standard-pagination.tsx';
import type { SalesQueryPageSize } from './contracts.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { DemoPageSizeSelect } from '../demo-controls/page-size-select.tsx';
import { pageFacts, salesCount, salesPageSizes } from './model.ts';

/** Domain range/size semantics remain local; shared pager preserves exact totals. */
const options = salesPageSizes.map(size => ({ value: String(size), label: `${size}张/页` }));
export function SalesPagination(props: { readonly scope: ReadScope; readonly active?: boolean; readonly page: number; readonly pageSize: SalesQueryPageSize; readonly total: string | null;
  readonly busy: boolean; readonly onPage: (page: number) => void; readonly onPageSize: (size: SalesQueryPageSize) => void }) {
  const unavailable = props.busy || props.active === false || !props.scope.active;
  const facts = pageFacts(props.page, props.pageSize, props.total);
  return <footer className="iw-pagination tc-foot tc-list-pagination sales-pagination">
    <div className="sale-pagination-count"><DemoPageSizeSelect scope={props.scope} active={props.active !== false} label="每页销货单数" value={String(props.pageSize)} options={options} disabled={unavailable} onChange={value => {
        const size = salesPageSizes.find(size => String(size) === value); if (size !== undefined) props.onPageSize(size);
      }} />
      <span>{props.total === null ? '尚未查询' : `共 ${salesCount(props.total)} 张，当前第 ${facts.first}–${facts.last} 张`}</span></div>
    <StandardPagination {...props} label="销货单列表分页" disabled={unavailable} hideOnSinglePage={false} showJump={false} stepText requireSafePageEnd pageSummary={`第 ${props.page} / ${salesCount(facts.pages.toString())} 页`} />
  </footer>;
}
