import { Button, Empty, Input, Table, Tag } from '@arco-design/web-react';
import { IconSearch } from '@arco-design/web-react/icon';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { DemoSettingsTabs, DemoSettingsSingleSelect, DemoSettingsPager } from '../demo-settings-controls.tsx';
import type { ReadScope } from '../../loading/read-scope.ts';
import type { StoreSettingsEntry, StoreSettingsKind, StoreSettingsListQuery, StoreSettingsPage, StoreSettingsReference } from './contracts.ts';
import '../../demo-controls/page-size-shell.css';
import './demo-store-ui.css';

/** Complete App / Filters / Pager presentation from frozen basic-settings-v2.
 * Formal reads, permission decisions and command ownership stay in the caller. */
interface DemoStoreViewProps {
  readonly scope: ReadScope; readonly kind: StoreSettingsKind;
  readonly draft: StoreSettingsListQuery; readonly displayed: StoreSettingsListQuery;
  readonly result: StoreSettingsPage | null; readonly busy: boolean; readonly emptyText: string;
  readonly onDraft: (patch: Partial<StoreSettingsListQuery>) => void;
  readonly onQuery: () => void; readonly onReset: () => void;
  readonly onPage: (page: number) => void; readonly onPageSize: (size: StoreSettingsListQuery['pageSize']) => void;
  readonly allowedTabs?: readonly StoreSettingsKind[] | undefined; readonly onTab?: ((kind: StoreSettingsKind) => void) | undefined;
  readonly focusTab?: boolean | undefined; readonly editDisabled: boolean; readonly createDisabled: boolean;
  readonly maintenanceTitle: string; readonly onCreate: (button: HTMLButtonElement) => void;
  readonly onEdit: (row: StoreSettingsEntry, button: HTMLButtonElement) => void;
  readonly referenceLabel: (reference: StoreSettingsReference | null) => string;
  readonly audit: ReactNode; readonly readState: ReactNode; readonly staleState: ReactNode; readonly children: ReactNode;
  readonly tableScroll?: { readonly top: number; readonly left: number };
  readonly onTableScroll?: (position: { readonly top: number; readonly left: number }) => void;
  readonly halls: { readonly enabled: boolean; readonly loading: boolean; readonly options: readonly { readonly value: string; readonly label: string }[];
    readonly onOpen: () => void; readonly onSearch: (search: string) => void; readonly onChange: (value: string) => void; readonly footer: ReactNode };
}
export function DemoStoreView(props: DemoStoreViewProps) {
  const label = props.kind === 'stores' ? '营业厅' : '仓库';
  const table = useRef<HTMLDivElement>(null), scrollReady = useRef(false);
  useLayoutEffect(() => {
    scrollReady.current = false;
    const node = table.current;
    // A remounted tab initially has no facts. Restoring against that empty DOM
    // would clamp to zero and erase the shared viewport before its fresh read.
    if (!node || !props.scope.active || !props.result) return;
    if (props.tableScroll) {
      node.scrollTop = props.tableScroll.top; node.scrollLeft = props.tableScroll.left;
    }
    scrollReady.current = true;
    props.onTableScroll?.({ top: node.scrollTop, left: node.scrollLeft });
  }, [props.scope, props.result, props.tableScroll]);
  const statusColumn = { title: '状态', width: 100, render: (_: unknown, row: StoreSettingsEntry) => <Status row={row} /> };
  const actionColumn = { title: '操作', width: 76, render: (_: unknown, row: StoreSettingsEntry) => <div className="bs-row-actions"><Button type="text" size="small" disabled={props.editDisabled} title={props.maintenanceTitle} onClick={event => { if (event.currentTarget instanceof HTMLButtonElement) props.onEdit(row, event.currentTarget); }}>编辑</Button></div> };
  const columns = props.kind === 'stores'
    ? [{ title: '名称', dataIndex: 'name' }, { title: '默认零售客户', render: (_: unknown, row: StoreSettingsEntry) => row.kind === 'stores' ? props.referenceLabel(row.defaultCustomer) : '' }, { title: '默认出库仓', render: (_: unknown, row: StoreSettingsEntry) => row.kind === 'stores' ? props.referenceLabel(row.defaultWarehouse) : '' }, statusColumn, actionColumn]
    : [{ title: '仓库名称', dataIndex: 'name' }, { title: '所属营业厅', render: (_: unknown, row: StoreSettingsEntry) => row.kind === 'warehouses' ? props.referenceLabel(row.hall) : '' }, statusColumn, actionColumn];
  return <section className="demo-store-workbench store-settings-workbench bs-page iw-workbench iw-arco-controls" aria-label="营业厅与仓库">
    <header className="bs-head iw-head"><h1>营业厅与仓库</h1><div className="bs-head-actions">{props.audit}<Button type="primary" disabled={props.createDisabled} title={props.maintenanceTitle} onClick={event => { if (event.currentTarget instanceof HTMLButtonElement) props.onCreate(event.currentTarget); }}>新增{label}</Button></div></header>
    <DemoSettingsTabs scope={props.scope} label="营业厅与仓库" value={props.kind} restoreFocus={!!props.focusTab}
      items={(['stores', 'warehouses'] as const).map(kind => ({ value: kind, label: kind === 'stores' ? '营业厅' : '仓库', disabled: kind !== props.kind && (!props.onTab || !props.allowedTabs?.includes(kind)) }))}
      onChange={kind => props.onTab?.(kind)} />
    <Filters {...props} />
    {props.readState}{props.staleState}
    <div ref={table} className="bs-table-wrap iw-arco-table" aria-busy={props.busy} onScroll={event => {
      if (scrollReady.current && props.scope.active && props.result) props.onTableScroll?.({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft });
    }}><Table size="small" rowKey="id" columns={columns} data={props.result ? [...props.result.items] : []} pagination={false} noDataElement={<Empty description={props.emptyText} />} /></div>
    <DemoSettingsPager label="厅仓列表分页" scope={props.scope} page={props.displayed.page} size={props.displayed.pageSize} total={props.result?.total ?? null} busy={props.busy} onPage={props.onPage} onSize={props.onPageSize} />
    {props.children}
  </section>;
}

// Frozen basic-settings-v2.jsx Status / Filters; native directory/query adapters
// replace only M rows and global control mounts.
function Status({ row }: { readonly row: StoreSettingsEntry }) {
  const text = row.enabled ? '正常' : '已停用';
  return <Tag className={'iw-status ' + (text === '正常' ? 'normal' : 'off')}>{text}</Tag>;
}
function Filters(props: DemoStoreViewProps) {
  const filter = props.draft, fields = [];
  const apply = () => { if (!props.busy) props.onQuery(); };
  const input = (placeholder: string) => fields.push(<div className="bs-filter search" key="q"><Input className="iw-arco-input iw-search-input" size="default" aria-label={placeholder} value={filter.search} onChange={search => props.onDraft({ search })} placeholder={placeholder} suffix={<IconSearch />} allowClear maxLength={200} onPressEnter={apply} /></div>);
  const state = [{ label: '正常', value: 'normal' }, { label: '已停用', value: 'disabled' }, { label: '全部', value: 'all' }];
  if (props.kind === 'stores') input('搜索营业厅名称');
  if (props.kind === 'warehouses') {
    input('搜索仓库名称');
    fields.push(<div className="bs-filter" key="storeId" title={props.halls.enabled ? undefined : '所属营业厅目录暂未开放'}><DemoSettingsSingleSelect scope={props.scope} label="全部营业厅" placeholder="全部营业厅" value={filter.hallId ?? ''} options={props.halls.options} search clear disabled={!props.halls.enabled || props.busy} loading={props.halls.loading} onOpen={props.halls.onOpen} onSearch={props.halls.onSearch} onChange={props.halls.onChange} footer={props.halls.footer} /></div>);
  }
  fields.push(<div className="bs-filter" key="status"><DemoSettingsSingleSelect scope={props.scope} label="状态" placeholder="状态" value={filter.status} options={state} onChange={status => props.onDraft({ status: status as StoreSettingsListQuery['status'] })} /></div>);
  return <div className="bs-toolbar"><div className="bs-filter-fields">{fields}</div><div className="bs-toolbar-actions iw-query-actions"><Button className="btn primary" type="primary" onClick={apply} disabled={props.busy}>查询</Button><Button className="btn iw-reset" onClick={props.onReset} disabled={props.busy}>重置</Button></div></div>;
}
