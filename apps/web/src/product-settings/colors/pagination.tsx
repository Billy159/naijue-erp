import { UIButton } from '../../components/standard-controls.tsx';
import { StandardPagination } from '../../components/standard-pagination.tsx';
import { DemoPageSizeSelect } from '../../demo-controls/page-size-select.tsx';
import type { ReadScope } from '../../loading/read-scope.ts';
import type { CatalogueSettingsListQuery } from './contracts.ts';
type CataloguePageSize = CatalogueSettingsListQuery['pageSize'];
import '../../demo-controls/page-size-shell.css';
export function CataloguePagination(props: { readonly scope: ReadScope; readonly page: number; readonly pageSize: CataloguePageSize; readonly total: number | null; readonly busy: boolean; readonly onPage: (page: number) => void; readonly onPageSize: (size: CataloguePageSize) => void }) {
  const start = props.total !== null && props.total > 0 ? (props.page - 1) * props.pageSize + 1 : 0;
  return <div className="iw-pagination pc-pagination catalogue-pagination"><DemoPageSizeSelect scope={props.scope} label="商品设置每页条数" value={String(props.pageSize)} disabled={props.busy} options={[20, 50, 100].map(size => ({ value: String(size), label: `${size}条/页` }))} onChange={value => props.onPageSize(Number(value) as CataloguePageSize)} /><span>{props.total === null ? (props.busy ? '正在读取' : '尚未读取') : `共 ${props.total.toLocaleString('zh-CN')} 条${start && start <= props.total ? `，当前第 ${start}–${Math.min(props.page * props.pageSize, props.total)} 条` : ''}`}</span><StandardPagination {...props} label="商品颜色版型分页" disabled={props.busy} />{props.total !== null && props.page > Math.max(1, Math.ceil(props.total / props.pageSize)) && <UIButton type="button" disabled={props.busy || !props.scope.active} onClick={() => props.onPage(1)}>返回第一页</UIButton>}</div>;
}
