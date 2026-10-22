import { Button, Empty, Input, Select, Table, Tag } from '@arco-design/web-react';
import { IconSearch } from '@arco-design/web-react/icon';
import { Fragment, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode, type ComponentProps, type ComponentType } from 'react';
import { DemoPageSizeSelect } from '../../demo-controls/page-size-select.tsx';
import type { ReadScope } from '../../loading/read-scope.ts';
import type { StoreSettingsEntry, StoreSettingsKind, StoreSettingsListQuery, StoreSettingsPage, StoreSettingsReference } from './contracts.ts';
import '../../demo-controls/page-size-shell.css';
import './demo-store-ui.css';

// Arco 2.66 accepts controlled undefined (Select/select.js getValidValue),
// while exactOptionalPropertyTypes exposes its narrower published value type.
const SourceSingleSelect = Select as ComponentType<Omit<ComponentProps<typeof Select>, 'value'> & { readonly value: ComponentProps<typeof Select>['value'] }>;

/** Complete App / Filters / Pager presentation from frozen basic-settings-v2.
 * Formal reads, permission decisions and command ownership stay in the caller. */
export function DemoStoreView(props: {
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
  readonly halls: { readonly enabled: boolean; readonly loading: boolean; readonly options: readonly { readonly value: string; readonly label: string }[];
    readonly onOpen: () => void; readonly onSearch: (search: string) => void; readonly onChange: (value: string) => void; readonly footer: ReactNode };
}) {
  const label = props.kind === 'stores' ? '营业厅' : '仓库', tabs = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!props.focusTab) return;
    const frame = requestAnimationFrame(() => {
      const host = tabs.current, active = host?.ownerDocument.activeElement;
      if (!props.scope.active || !host?.isConnected || active && active !== host.ownerDocument.body && active.isConnected && !host.contains(active)) return;
      host.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const allowed = (kind: StoreSettingsKind) => kind === props.kind || !!props.onTab && !!props.allowedTabs?.includes(kind);
  const choose = (kind: StoreSettingsKind) => { if (props.scope.active && allowed(kind) && kind !== props.kind) props.onTab?.(kind); };
  const statusColumn = { title: '状态', width: 100, render: (_: unknown, row: StoreSettingsEntry) => <Tag className={`iw-status ${row.enabled ? 'normal' : 'off'}`}>{row.enabled ? '正常' : '已停用'}</Tag> };
  const actionColumn = { title: '操作', width: 76, render: (_: unknown, row: StoreSettingsEntry) => <div className="bs-row-actions"><Button type="text" size="small" disabled={props.editDisabled} title={props.maintenanceTitle} onClick={event => { if (event.currentTarget instanceof HTMLButtonElement) props.onEdit(row, event.currentTarget); }}>编辑</Button></div> };
  const columns = props.kind === 'stores'
    ? [{ title: '名称', dataIndex: 'name' }, { title: '默认零售客户', render: (_: unknown, row: StoreSettingsEntry) => row.kind === 'stores' ? props.referenceLabel(row.defaultCustomer) : '' }, { title: '默认出库仓', render: (_: unknown, row: StoreSettingsEntry) => row.kind === 'stores' ? props.referenceLabel(row.defaultWarehouse) : '' }, statusColumn, actionColumn]
    : [{ title: '仓库名称', dataIndex: 'name' }, { title: '所属营业厅', render: (_: unknown, row: StoreSettingsEntry) => row.kind === 'warehouses' ? props.referenceLabel(row.hall) : '' }, statusColumn, actionColumn];
  return <section className="demo-store-workbench store-settings-workbench bs-page iw-workbench iw-arco-controls" aria-label="营业厅与仓库">
    <header className="bs-head iw-head"><h1>营业厅与仓库</h1><div className="bs-head-actions">{props.audit}<Button type="primary" disabled={props.createDisabled} title={props.maintenanceTitle} onClick={event => { if (event.currentTarget instanceof HTMLButtonElement) props.onCreate(event.currentTarget); }}>新增{label}</Button></div></header>
    <nav ref={tabs} className="bs-tabs" role="tablist" aria-label="营业厅与仓库">{(['stores', 'warehouses'] as const).map(kind => <button type="button" role="tab" aria-selected={props.kind === kind} tabIndex={props.kind === kind ? 0 : -1} disabled={!allowed(kind)} key={kind} onClick={() => choose(kind)} onKeyDown={event => {
      const enabled = (['stores', 'warehouses'] as const).filter(allowed), index = enabled.indexOf(kind);
      const next = event.key === 'ArrowRight' ? enabled[(index + 1) % enabled.length] : event.key === 'ArrowLeft' ? enabled[(index + enabled.length - 1) % enabled.length] : event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1) : undefined;
      if (next) { event.preventDefault(); choose(next); }
    }}>{kind === 'stores' ? '营业厅' : '仓库'}</button>)}</nav>
    <form className="bs-toolbar" role="search" onSubmit={event => { event.preventDefault(); props.onQuery(); }}>
      <div className="bs-filter-fields"><div className="bs-filter search"><Input className="iw-arco-input iw-search-input" size="default" aria-label={`搜索${label}名称`} placeholder={`搜索${label}名称`} maxLength={200} value={props.draft.search} onChange={search => props.onDraft({ search })} suffix={<IconSearch />} allowClear /></div>
        {props.kind === 'warehouses' && <div className="bs-filter" title={props.halls.enabled ? undefined : '所属营业厅目录暂未开放'}><DemoStoreSingleSelect scope={props.scope} label="全部营业厅" placeholder="全部营业厅" value={props.draft.hallId ?? ''} options={props.halls.options} disabled={!props.halls.enabled || props.busy} search clear loading={props.halls.loading} onOpen={props.halls.onOpen} onSearch={props.halls.onSearch} onChange={props.halls.onChange} footer={props.halls.footer} /></div>}
        <div className="bs-filter"><DemoStoreSingleSelect scope={props.scope} label="状态" placeholder="状态" value={props.draft.status} options={[{ label: '正常', value: 'normal' }, { label: '已停用', value: 'disabled' }, { label: '全部', value: 'all' }]} onChange={status => props.onDraft({ status: status as StoreSettingsListQuery['status'] })} /></div>
      </div><div className="bs-toolbar-actions iw-query-actions"><Button className="btn primary" type="primary" htmlType="submit" disabled={props.busy}>查询</Button><Button className="btn iw-reset" disabled={props.busy} onClick={props.onReset}>重置</Button></div>
    </form>
    {props.readState}{props.staleState}
    <div className="bs-table-wrap iw-arco-table" aria-busy={props.busy}><Table size="small" rowKey="id" columns={columns} data={props.result ? [...props.result.items] : []} pagination={false} noDataElement={<Empty description={props.emptyText} />} /></div>
    <DemoStorePager scope={props.scope} page={props.displayed.page} size={props.displayed.pageSize} total={props.result?.total ?? null} busy={props.busy} onPage={props.onPage} onSize={props.onPageSize} />
    {props.children}
  </section>;
}

/** SmallSelect / unified-single-select: local React host replaces global mounts
 * and ShadowRoot; directory fetching and real pagination remain explicit props. */
function DemoStoreSingleSelect(props: {
  readonly scope: ReadScope; readonly label: string; readonly placeholder: string; readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly disabled?: boolean; readonly loading?: boolean; readonly search?: boolean; readonly clear?: boolean;
  readonly onOpen?: () => void; readonly onSearch?: (search: string) => void;
  readonly onChange: (value: string) => void; readonly footer?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null), [open, setOpen] = useState(false), [mounted, setMounted] = useState(false), [, refreshPortal] = useReducer((value: number) => value + 1, 0);
  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  useEffect(() => {
    const close = () => setOpen(false); props.scope.signal.addEventListener('abort', close, { once: true });
    if (props.disabled || !props.scope.active) close();
    return () => props.scope.signal.removeEventListener('abort', close);
  }, [props.scope, props.disabled]);
  useEffect(() => { if (!mounted || !open || props.disabled) return; let active = true; queueMicrotask(() => { if (active) refreshPortal(); }); return () => { active = false; }; }, [mounted, open, props.disabled]);
  return <div ref={host} className="ui-single-host bs-single demo-store-single"><SourceSingleSelect className="ui-flat-select" aria-label={props.label} placeholder={props.placeholder} value={props.value || undefined} options={[...props.options]} showSearch={!!props.search} filterOption={props.search ? false : true} allowClear={!!props.clear} disabled={!!props.disabled || !props.scope.active} loading={props.loading ?? false}
    popupVisible={mounted && open && !props.disabled && props.scope.active} unmountOnExit getPopupContainer={() => { if (!host.current) throw new Error('Store select host not mounted'); return host.current; }}
    triggerProps={{ position: 'bl', autoAlignPopupWidth: false, popupStyle: { width: Math.max(180, host.current?.getBoundingClientRect().width ?? 0) } }}
    renderFormat={(_, selected) => <span className="ui-single-tag">{props.options.find(item => item.value === selected)?.label ?? '名称未提供'}</span>}
    dropdownRender={menu => <>{menu}{props.footer}</>}
    onVisibleChange={visible => { if (!props.scope.active || props.disabled) return; setOpen(visible); if (visible) props.onOpen?.(); }}
    onSearch={search => { if (props.scope.active && open && !props.disabled) props.onSearch?.(search); }}
    onChange={(value: string | undefined) => {
      if (!props.scope.active || props.disabled || value === undefined && !props.clear || value !== undefined && (!open || !props.options.some(option => option.value === value))) return;
      setOpen(false); props.onChange(value ?? '');
    }} /></div>;
}

/** inventory-workbench.paginationMarkup + basic-settings.Pager, translated as
 * React markup/events. Unknown totals and out-of-range recovery are formal data adaptations. */
function DemoStorePager(props: { readonly scope: ReadScope; readonly page: number; readonly size: StoreSettingsListQuery['pageSize']; readonly total: number | null; readonly busy: boolean; readonly onPage: (page: number) => void; readonly onSize: (size: StoreSettingsListQuery['pageSize']) => void }) {
  const [jump, setJump] = useState(String(props.page));
  useEffect(() => setJump(String(props.page)), [props.page]);
  const pages = props.total === null ? null : Math.max(1, Math.ceil(props.total / props.size));
  const numbers = pages === null ? [] : [...new Set([1, pages, props.page - 1, props.page, props.page + 1].filter(n => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const disabled = props.busy || !props.scope.active, start = (props.page - 1) * props.size + 1;
  const go = (next: number) => { if (!disabled && pages !== null && Number.isSafeInteger(next) && next >= 1 && next <= pages) props.onPage(next); };
  return <div className="bs-pager"><div className="iw-pagination" aria-label="厅仓列表分页"><DemoPageSizeSelect scope={props.scope} label="每页数量" value={String(props.size)} disabled={disabled} options={[20, 50, 100].map(size => ({ value: String(size), label: `${size}条/页` }))} onChange={value => { if (!disabled && ['20', '50', '100'].includes(value)) props.onSize(Number(value) as StoreSettingsListQuery['pageSize']); }} />
    <span>{props.total === null ? props.busy ? '正在读取' : '尚未读取' : `共 ${props.total.toLocaleString('zh-CN')} 条${props.total && start <= props.total ? `，当前第 ${start}–${Math.min(props.page * props.size, props.total)} 条` : ''}`}</span>
    {pages !== null && pages > 1 && <div className="actions"><button type="button" className="btn iw-page-arrow" disabled={disabled || props.page <= 1} aria-label="上一页" onClick={() => go(props.page - 1)}>‹</button>{numbers.map((page, index) => <Fragment key={page}>{index > 0 && page - numbers[index - 1]! > 1 && <span className="iw-page-ellipsis">…</span>}<button type="button" className="btn iw-page-number" disabled={disabled} aria-label={`第${page}页`} aria-current={page === props.page ? 'page' : undefined} onClick={() => go(page)}>{page}</button></Fragment>)}<button type="button" className="btn iw-page-arrow" disabled={disabled || props.page >= pages} aria-label="下一页" onClick={() => go(props.page + 1)}>›</button><label className="iw-jump">跳至 <input type="text" inputMode="numeric" aria-label="目标页码" value={jump} disabled={disabled} onChange={event => setJump(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); go(Number(jump)); } }} /> 页</label><button type="button" className="btn iw-jump-go" disabled={disabled} onClick={() => go(Number(jump))}>跳转</button></div>}
    {pages !== null && props.page > pages && <button type="button" className="btn" disabled={disabled} onClick={() => go(1)}>返回第一页</button>}
  </div></div>;
}
