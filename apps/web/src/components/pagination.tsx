import { StandardPagination } from './standard-pagination.tsx';
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
  return <div className="iw-pagination">
    <InventoryPageSizeSelect scope={props.scope} value={props.pageSize} disabled={props.busy} onChange={props.onPageSize} />
    <span>{props.total === null ? '尚未查询' : `共 ${props.total.toLocaleString('zh-CN')} 款${props.total ? `，当前第 ${(props.page - 1) * props.pageSize + 1}–${Math.min(props.page * props.pageSize, props.total)} 款` : ''}`}</span>
    <StandardPagination {...props} label="库存列表分页" disabled={props.busy} />
  </div>;
}
