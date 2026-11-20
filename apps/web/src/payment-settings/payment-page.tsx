import { SettingsAuditEntry } from '../settings/audit/audit-entry.tsx';
import { Button, Empty, Input, Modal, Table, Tag } from '@arco-design/web-react';
import { IconSearch } from '@arco-design/web-react/icon';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LatestQuery } from '../loading/latest-query.ts';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { DemoSettingsTabs, DemoSettingsPager, DemoSettingsSingleSelect } from '../settings/demo-settings-controls.tsx';
import { useDialogFocusReturn } from '../components/use-dialog-focus-return.ts';
import { SettingsReferenceSelect } from '../settings/stores/maintenance-form.tsx';
import { settingsReferenceName, settingsSaveUnavailable } from '../settings/stores/maintenance-contracts.ts';
import type { SettingsReference } from '../settings/stores/maintenance-contracts.ts';
import { initialPaymentSettingsQuery } from './contracts.ts';
import type { PaymentSettingsPage as PageData, PaymentSettingsProps, PaymentSettingsQuery, PaymentSettingsKind, PaymentSettingsRecord } from './contracts.ts';
import { createPaymentSettingsViewState, PaymentSettingsController, type PaymentSettingsViewState } from './controller.ts';
import './payment-settings.css';

const paymentForms = new AsyncLeafRegistry({ 'payment-maintenance': { load: async () => {
  const [method, account] = await Promise.all([import('./payment-method-form.tsx'), import('./payment-account-form.tsx')]);
  return { PaymentMethodForm: method.PaymentMethodForm, PaymentAccountForm: account.PaymentAccountForm };
} } }, { maxRetainedEntries: 1 });
type PaymentFormViews = Awaited<ReturnType<typeof paymentForms.load<'payment-maintenance'>>>;
type Queries = { readonly list: LatestQuery<PaymentSettingsQuery, PageData>; readonly detail: LatestQuery<{ readonly id: string }, PaymentSettingsRecord | null> };
const emptyRead = Object.freeze({ phase: 'idle' as const, request: null, success: null, error: null });
const noSubscribe = () => () => {};
const noEditors = Object.freeze({ methods: null, accounts: null });
interface PaymentTableScroll { top: number; left: number }
type PaymentTabViewProps = PaymentSettingsProps & { readonly kind: PaymentSettingsKind; readonly onTab: (kind: PaymentSettingsKind) => void;
  readonly tableScroll: PaymentTableScroll;
  readonly restoreFocus: boolean; readonly filterDraft: PaymentSettingsQuery; readonly onFilterDraft: (query: PaymentSettingsQuery) => void;
  readonly lastQuery: PaymentSettingsQuery; readonly onExecuted: (query: PaymentSettingsQuery) => void;
  readonly selectedMethod: SettingsReference | null; readonly onSelectedMethod: (method: SettingsReference | null) => void };
export function PaymentSettingsPage(props: PaymentSettingsProps) {
  const identity = props.scope.identity;
  return <PaymentTabView key={JSON.stringify([identity.accountId, identity.sessionRevision, identity.permissionRevision, props.scope.routeInstanceId])} {...props} />;
}
function PaymentTabView(props: PaymentSettingsProps) {
  const owner = props.workspace?.matches(props.scope) ? props.workspace : null;
  const binding = useRef<{ readonly scope: PaymentSettingsProps['scope']; readonly owner: typeof owner; readonly view: PaymentSettingsViewState } | null>(null);
  if (!binding.current || binding.current.scope !== props.scope || binding.current.owner !== owner) {
    binding.current = { scope: props.scope, owner, view: owner?.getViewState(props.initialTab) ?? createPaymentSettingsViewState(props.initialTab) };
  }
  const ui = binding.current.view, tab = ui.tab, focusTab = useRef(false), [, refresh] = useState(0);
  const update = (change: () => void) => { if (props.scope.active) { change(); refresh(value => value + 1); } };
  return <PaymentContent key={tab} {...props} kind={tab} tableScroll={ui.tableScroll} restoreFocus={focusTab.current}
    onTab={next => update(() => { focusTab.current = true; ui.tab = next; })} filterDraft={ui.drafts[tab]}
    onFilterDraft={query => update(() => { ui.drafts[tab] = query; })} lastQuery={ui.executed[tab]}
    onExecuted={query => update(() => { ui.executed[tab] = query; })} selectedMethod={ui.method}
    onSelectedMethod={method => update(() => { ui.method = method; })} />;
}
function PaymentContent(props: PaymentTabViewProps) {
  const [binding, setBinding] = useState<{ readonly scope: PaymentSettingsProps['scope']; readonly reader: PaymentSettingsProps['reader']; readonly kind: PaymentSettingsKind; readonly queries: Queries } | null>(null);
  useEffect(() => {
    if (!props.reader || !props.scope.active) { setBinding(null); return; }
    const reader = props.reader, current: Queries = {
      list: new LatestQuery({ scope: props.scope, execute: read => reader.readList(props.kind, read) }),
      detail: new LatestQuery({ scope: props.scope, execute: read => reader.readDetail(props.kind, read) }),
    };
    setBinding({ scope: props.scope, reader, kind: props.kind, queries: current }); void current.list.run(props.lastQuery);
    return () => { current.list.dispose(); current.detail.dispose(); };
  }, [props.scope, props.reader, props.kind]);
  const queries = binding?.scope === props.scope && binding.reader === props.reader && binding.kind === props.kind ? binding.queries : null;
  return <PaymentList {...props} queries={queries} />;
}
function PaymentList(props: Parameters<typeof PaymentContent>[0] & { readonly queries: Queries | null }) {
  const { queries, scope } = props, label = props.kind === 'methods' ? '收款方式' : '资金账户';
  const list = useSyncExternalStore(queries?.list.subscribe ?? noSubscribe, queries?.list.getSnapshot ?? (() => emptyRead), queries?.list.getSnapshot ?? (() => emptyRead));
  const detail = useSyncExternalStore(queries?.detail.subscribe ?? noSubscribe, queries?.detail.getSnapshot ?? (() => emptyRead), queries?.detail.getSnapshot ?? (() => emptyRead));
  const draft = props.filterDraft;
  const [localEditor, setEditor] = useState<PaymentSettingsController | null>(null), [editingId, setEditingId] = useState<string | null>(null);
  const workspace = props.workspace?.matches(scope) ? props.workspace : null;
  const editors = useSyncExternalStore(workspace?.subscribe ?? noSubscribe, workspace?.getSnapshot ?? (() => noEditors), workspace?.getSnapshot ?? (() => noEditors));
  const editor = workspace ? editors[props.kind] : localEditor;
  const openEditor = (record: PaymentSettingsRecord | null) => { if (props.workspace && !workspace) return; if (workspace) workspace.open(props.kind, record); else setEditor(new PaymentSettingsController(scope, props.kind, record)); };
  const write = useSyncExternalStore(editor?.subscribe ?? noSubscribe, editor?.getSnapshot ?? (() => null), editor?.getSnapshot ?? (() => null))?.write;
  const refreshed = useRef<string | null>(null);
  const focus = useDialogFocusReturn(scope, editor !== null || editingId !== null);
  useEffect(() => () => localEditor?.dispose(), [localEditor]);
  useEffect(() => { if (queries && write?.phase === 'committed' && write.result && refreshed.current !== write.result.operationId) { refreshed.current = write.result.operationId; void queries.list.run(props.lastQuery); } }, [queries, write, props.lastQuery]);
  useEffect(() => {
    const error = list.error ?? detail.error;
    if (error instanceof HttpQueryError && error.kind === 'forbidden' && workspace?.hasUnresolvedWrite()) return;
    if (scope.active && error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) props.onAccessFailure(error.kind);
  }, [list.error, detail.error, scope, props.onAccessFailure, workspace]);
  useEffect(() => {
    if (!editingId || !props.canPrepare || detail.phase !== 'success' || detail.success?.parameters.id !== editingId) return;
    const record = detail.success.data;
    if (record?.id === editingId && record.kind === props.kind) { openEditor(record); setEditingId(null); }
  }, [editingId, detail, scope, props.kind, props.canPrepare]);
  const active = scope.active && list.phase !== 'disposed', result = list.success?.data;
  const applied = list.success?.parameters ?? props.lastQuery, busy = list.phase === 'loading';
  const run = (query: PaymentSettingsQuery) => { if (active && queries) { const exact = { ...query, paymentMethodId: props.kind === 'methods' ? null : query.paymentMethodId }; props.onExecuted(exact); void queries.list.run(exact); } };
  const close = () => { if (workspace) { if (!workspace.close(props.kind)) return; } else { if (editor && !editor.discard()) return; setEditor(null); } setEditingId(null); queries?.detail.cancel(); focus.request(); };
  const changeTab = (kind: PaymentSettingsKind) => { if (kind === props.kind) return; if (editor && !editor.requestClose()) return; if (workspace) workspace.close(props.kind); else setEditor(null); props.onTab(kind); };
  const table = useRef<HTMLDivElement>(null), scrollReady = useRef(false);
  useLayoutEffect(() => {
    scrollReady.current = false;
    const node = table.current;
    // Frozen App changes columns inside one viewport. Retain only its UI
    // position across keyed tabs; the new tab still performs a fresh read.
    if (!node || !active || !result) return;
    node.scrollTop = props.tableScroll.top; node.scrollLeft = props.tableScroll.left;
    props.tableScroll.top = node.scrollTop; props.tableScroll.left = node.scrollLeft;
    scrollReady.current = true;
  }, [scope, active, result, props.tableScroll]);
  if (!active) return null;
  const statusColumn = { title: '状态', width: 100, render: (_: unknown, row: PaymentSettingsRecord) => <Status row={row} /> };
  const preparing = editingId !== null, unavailableOwner = !!props.workspace && !workspace;
  const actionColumn = { title: '操作', width: 76, render: (_: unknown, row: PaymentSettingsRecord) => <div className="bs-row-actions"><Button type="text" size="small" disabled={!props.canPrepare || busy || editor !== null || preparing || unavailableOwner} onClick={event => { if (active && queries && !editor && !editingId) { if (event.currentTarget instanceof HTMLElement) focus.capture(event.currentTarget); setEditingId(row.id); void queries.detail.run({ id: row.id }); } }}>编辑</Button></div> };
  const columns = props.kind === 'methods' ? [{ title: '名称', dataIndex: 'name' }, statusColumn, actionColumn]
    : [{ title: '账户名称', dataIndex: 'name' }, { title: '所属收款方式', render: (_: unknown, row: PaymentSettingsRecord) => row.kind === 'accounts' ? settingsReferenceName(row.paymentMethod) : '' },
      statusColumn, actionColumn];
  return <section className="demo-settings-workbench payment-settings-workbench bs-page iw-workbench iw-arco-controls" aria-label="收款配置">
    <header className="bs-head iw-head"><h1>收款配置</h1><div className="bs-head-actions"><SettingsAuditEntry scope={scope} {...(props.audit ? { capability: props.audit } : {})} onAccessFailure={props.onAccessFailure} localHasUnresolvedWrite={() => props.workspace?.hasUnresolvedWrite() ?? editor?.hasUnresolvedWrite ?? false} /><Button type="primary" disabled={!props.canPrepare || editor !== null || preparing || unavailableOwner} onClick={event => { if (active && !editor && !editingId) { if (event.currentTarget instanceof HTMLElement) focus.capture(event.currentTarget); openEditor(null); } }}>新增{label}</Button></div></header>
    <DemoSettingsTabs scope={scope} label="收款配置" value={props.kind} restoreFocus={props.restoreFocus} items={[{ value: 'methods', label: '收款方式' }, { value: 'accounts', label: '资金账户' }]} onChange={changeTab} />
    <Filters {...props} busy={busy} ready={queries !== null}
      apply={() => run({ ...draft, page: 1, pageSize: applied.pageSize })}
      reset={() => { const reset = { ...initialPaymentSettingsQuery, pageSize: applied.pageSize }; props.onFilterDraft(reset); props.onSelectedMethod(null); run(reset); }} />
      {!queries && <p className="payment-empty-state" role="status">{props.reader ? '正在准备资料…' : `${label}资料读取暂未开放。${settingsSaveUnavailable}`}</p>}
      {list.phase === 'loading' && <p className="settings-note" role="status">正在读取资料…</p>}
      {list.phase === 'error' && <p className="settings-note" role="alert">资料读取失败。<Button type="text" onClick={() => run(list.request?.parameters ?? applied)}>重试</Button></p>}
      {result && list.phase !== 'success' && <p className="settings-note">下方为上次成功读取的结果。</p>}
      <div ref={table} className="bs-table-wrap iw-arco-table" aria-busy={busy} onScroll={event => {
        if (scrollReady.current && active && result) { props.tableScroll.top = event.currentTarget.scrollTop; props.tableScroll.left = event.currentTarget.scrollLeft; }
      }}><Table size="small" rowKey="id" columns={columns} data={result ? [...result.items] : []} pagination={false} noDataElement={<Empty description={!queries ? '资料暂不可用' : !result ? '尚未读到资料' : '暂无符合条件的数据'} />} /></div>
      <DemoSettingsPager label="收款配置列表分页" scope={scope} page={applied.page} size={applied.pageSize} total={result?.total ?? null} busy={busy} onPage={page => run({ ...applied, page })} onSize={pageSize => run({ ...applied, page: 1, pageSize })} />
    {editor && <PaymentMaintenanceForm scope={scope} {...(props.directory ? { directory: props.directory } : {})} controller={editor} close={close} />}
    {editingId && !editor && <Modal className="demo-ui bs-modal demo-settings-modal payment-settings-modal iw-arco-modal iw-arco-controls" autoFocus={false} focusLock visible title={`编辑${label}`} maskClosable={false} onCancel={close} okText="确定" cancelText="取消" okButtonProps={{ disabled: true }}><p role="status">{detail.phase === 'loading' ? '正在读取当前资料…' : detail.phase === 'success' ? '记录不存在或不可访问。' : '当前资料读取失败。'}</p>{detail.phase === 'error' && <Button onClick={() => { void queries?.detail.run({ id: editingId }); }}>重试读取</Button>}</Modal>}
  </section>;
}

// Frozen basic-settings-v2.jsx Status / Filters. Native adapters supply the
// executed query and paged directory; there is no Demo store or global mount.
function Status({ row }: { readonly row: PaymentSettingsRecord }) {
  const text = row.enabled ? '正常' : '已停用';
  return <Tag className={'iw-status ' + (text === '正常' ? 'normal' : 'off')}>{text}</Tag>;
}
function Filters(props: PaymentTabViewProps & { readonly busy: boolean; readonly ready: boolean; readonly apply: () => void; readonly reset: () => void }) {
  const filter = props.filterDraft, fields = [];
  const apply = () => { if (props.ready && !props.busy) props.apply(); };
  const input = (placeholder: string) => fields.push(<div className="bs-filter search" key="q"><Input className="iw-arco-input iw-search-input" size="default" aria-label={placeholder} value={filter.search} onChange={search => props.onFilterDraft({ ...filter, search })} placeholder={placeholder} suffix={<IconSearch />} allowClear maxLength={200} onPressEnter={apply} /></div>);
  const state = [{ label: '正常', value: 'normal' }, { label: '已停用', value: 'disabled' }, { label: '全部', value: 'all' }];
  if (props.kind === 'methods') input('搜索收款方式');
  if (props.kind === 'accounts') {
    input('搜索账户名称');
    fields.push(<div className="bs-filter" key="methodId" title={props.reader?.supportsPaymentMethodFilter ? undefined : '当前版本暂不支持按收款方式筛选'}><SettingsReferenceSelect flatValue placeholder="全部收款方式" scope={props.scope} disabled={!props.reader?.supportsPaymentMethodFilter} reader={props.directory} kind="payment-methods" label="全部收款方式" selected={props.selectedMethod ? [props.selectedMethod] : []} onChange={items => { props.onSelectedMethod(items[0] ?? null); props.onFilterDraft({ ...filter, paymentMethodId: items[0]?.id ?? null }); }} /></div>);
  }
  fields.push(<div className="bs-filter" key="status"><DemoSettingsSingleSelect scope={props.scope} label="状态" placeholder="状态" value={filter.status} options={state} onChange={status => props.onFilterDraft({ ...filter, status: status as PaymentSettingsQuery['status'] })} /></div>);
  return <div className="bs-toolbar"><div className="bs-filter-fields">{fields}</div><div className="bs-toolbar-actions iw-query-actions"><Button className="btn primary" type="primary" onClick={apply} disabled={!props.ready || props.busy}>查询</Button><Button className="btn iw-reset" onClick={props.reset} disabled={!props.ready || props.busy}>重置</Button></div></div>;
}

/** Only code is retained between openings. Queries and subscriptions belong to
 * the mounted form; the authenticated workspace remains the draft owner. */
function PaymentMaintenanceForm(props: Pick<PaymentSettingsProps, 'scope' | 'directory'> & { readonly controller: PaymentSettingsController; readonly close: () => void }) {
  const { controller, scope } = props;
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [views, setViews] = useState<PaymentFormViews | null>(null), [failed, setFailed] = useState(false), [attempt, retry] = useState(0);
  useEffect(() => {
    let current = true;
    setFailed(false);
    void paymentForms.load('payment-maintenance', scope).then(loaded => {
      if (current && scope.active && !controller.getSnapshot().disposed) setViews(loaded);
    }, () => { if (current && scope.active && !controller.getSnapshot().disposed) setFailed(true); });
    return () => { current = false; };
  }, [scope, controller, attempt]);
  if (!scope.active || state.disposed) return null;
  if (views) return controller.kind === 'methods'
    ? <views.PaymentMethodForm controller={controller} close={props.close} />
    : <views.PaymentAccountForm {...props} />;
  return <Modal className="demo-ui bs-modal demo-settings-modal payment-settings-modal iw-arco-modal iw-arco-controls" visible
    title={`${controller.record ? '编辑' : '新增'}${controller.kind === 'methods' ? '收款方式' : '资金账户'}`} maskClosable={false} autoFocus={false} focusLock
    okText="确定" cancelText="取消" okButtonProps={{ disabled: true }} onCancel={() => { if (controller.discard()) props.close(); }}>
    {failed ? <p className="settings-note" role="alert">维护表单暂未加载。<Button onClick={() => retry(value => value + 1)}>重试加载表单</Button></p>
      : <p className="settings-note" role="status">正在准备维护表单…</p>}
  </Modal>;
}
