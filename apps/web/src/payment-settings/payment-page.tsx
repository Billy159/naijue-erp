import { Button, Empty, Input, Modal, Table, Tag } from '@arco-design/web-react';
import { IconSearch } from '@arco-design/web-react/icon';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LatestQuery } from '../loading/latest-query.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { StandardTabs } from '../components/standard-tabs.tsx';
import { useDialogFocusReturn } from '../components/use-dialog-focus-return.ts';
import { StoreSettingsSingleSelect } from '../settings/stores/single-select.tsx';
import { StoreSettingsPagination } from '../settings/stores/pagination.tsx';
import { SettingsReferenceSelect } from '../settings/stores/maintenance-form.tsx';
import { settingsReferenceName, settingsSaveUnavailable } from '../settings/stores/maintenance-contracts.ts';
import type { SettingsReference } from '../settings/stores/maintenance-contracts.ts';
import { initialPaymentSettingsQuery } from './contracts.ts';
import type { PaymentSettingsPage as PageData, PaymentSettingsProps, PaymentSettingsQuery, PaymentSettingsKind, PaymentSettingsRecord } from './contracts.ts';
import { PaymentSettingsController } from './controller.ts';
import { PaymentMethodForm } from './payment-method-form.tsx';
import { PaymentAccountForm } from './payment-account-form.tsx';
import './payment-settings.css';

type Queries = { readonly list: LatestQuery<PaymentSettingsQuery, PageData>; readonly detail: LatestQuery<{ readonly id: string }, PaymentSettingsRecord | null> };
const emptyRead = Object.freeze({ phase: 'idle' as const, request: null, success: null, error: null });
const noSubscribe = () => () => {};
const noEditors = Object.freeze({ methods: null, accounts: null });
type PaymentTabViewProps = PaymentSettingsProps & { readonly kind: PaymentSettingsKind; readonly onTab: (kind: PaymentSettingsKind) => void;
  readonly filterDraft: PaymentSettingsQuery; readonly onFilterDraft: (query: PaymentSettingsQuery) => void;
  readonly lastQuery: PaymentSettingsQuery; readonly onExecuted: (query: PaymentSettingsQuery) => void;
  readonly selectedMethod: SettingsReference | null; readonly onSelectedMethod: (method: SettingsReference | null) => void };
export function PaymentSettingsPage(props: PaymentSettingsProps) {
  const identity = props.scope.identity;
  return <PaymentTabView key={JSON.stringify([identity.accountId, identity.sessionRevision, identity.permissionRevision, props.scope.routeInstanceId])} {...props} />;
}
function PaymentTabView(props: PaymentSettingsProps) {
  const [tab, setTab] = useState<PaymentSettingsKind>(props.initialTab ?? 'methods');
  const [drafts, setDrafts] = useState<Record<PaymentSettingsKind, PaymentSettingsQuery>>({ methods: { ...initialPaymentSettingsQuery }, accounts: { ...initialPaymentSettingsQuery } });
  const [executed, setExecuted] = useState<Record<PaymentSettingsKind, PaymentSettingsQuery>>({ methods: { ...initialPaymentSettingsQuery }, accounts: { ...initialPaymentSettingsQuery } });
  const [method, setMethod] = useState<SettingsReference | null>(null);
  return <PaymentContent key={tab} {...props} kind={tab} onTab={setTab} filterDraft={drafts[tab]}
    onFilterDraft={query => setDrafts(value => ({ ...value, [tab]: query }))} lastQuery={executed[tab]}
    onExecuted={query => setExecuted(value => ({ ...value, [tab]: query }))} selectedMethod={method} onSelectedMethod={setMethod} />;
}
function PaymentContent(props: PaymentTabViewProps) {
  const [queries, setQueries] = useState<Queries | null>(null);
  useEffect(() => {
    if (!props.reader || !props.scope.active) { setQueries(null); return; }
    const reader = props.reader, current: Queries = {
      list: new LatestQuery({ scope: props.scope, execute: read => reader.readList(props.kind, read) }),
      detail: new LatestQuery({ scope: props.scope, execute: read => reader.readDetail(props.kind, read) }),
    };
    setQueries(current); void current.list.run(props.lastQuery);
    return () => { current.list.dispose(); current.detail.dispose(); };
  }, [props.scope, props.reader, props.kind]);
  return <PaymentList {...props} queries={queries} />;
}
function PaymentList(props: Parameters<typeof PaymentContent>[0] & { readonly queries: Queries | null }) {
  const { queries, scope } = props, label = props.kind === 'methods' ? '收款方式' : '资金账户';
  const list = useSyncExternalStore(queries?.list.subscribe ?? noSubscribe, queries?.list.getSnapshot ?? (() => emptyRead), queries?.list.getSnapshot ?? (() => emptyRead));
  const detail = useSyncExternalStore(queries?.detail.subscribe ?? noSubscribe, queries?.detail.getSnapshot ?? (() => emptyRead), queries?.detail.getSnapshot ?? (() => emptyRead));
  const draft = props.filterDraft, method = props.selectedMethod;
  const setDraft = (change: (current: PaymentSettingsQuery) => PaymentSettingsQuery) => props.onFilterDraft(change(draft));
  const setMethod = props.onSelectedMethod;
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
  const applied = list.success?.parameters ?? initialPaymentSettingsQuery, busy = list.phase === 'loading';
  const run = (query: PaymentSettingsQuery) => { if (active && queries) { const exact = { ...query, paymentMethodId: props.kind === 'methods' ? null : query.paymentMethodId }; props.onExecuted(exact); void queries.list.run(exact); } };
  const close = () => { if (workspace) { if (!workspace.close(props.kind)) return; } else { if (editor && !editor.discard()) return; setEditor(null); } setEditingId(null); queries?.detail.cancel(); focus.request(); };
  const changeTab = (kind: PaymentSettingsKind) => { if (kind === props.kind) return; if (editor && !editor.requestClose()) return; if (workspace) workspace.close(props.kind); else setEditor(null); props.onTab(kind); };
  if (!active) return null;
  const statusColumn = { title: '状态', width: 100, render: (_: unknown, row: PaymentSettingsRecord) => <Tag className={`iw-status ${row.enabled ? 'normal' : 'off'}`}>{row.enabled ? '正常' : '已停用'}</Tag> };
  const actionColumn = { title: '操作', width: 76, render: (_: unknown, row: PaymentSettingsRecord) => <div className="bs-row-actions"><Button type="text" size="small" disabled={!props.canPrepare || busy || editor !== null} onClick={event => { if (active && queries) { if (event.currentTarget instanceof HTMLElement) focus.capture(event.currentTarget); setEditingId(row.id); void queries.detail.run({ id: row.id }); } }}>编辑</Button></div> };
  const columns = props.kind === 'methods' ? [{ title: '名称', dataIndex: 'name' }, statusColumn, actionColumn]
    : [{ title: '账户名称', dataIndex: 'name' }, { title: '所属收款方式', render: (_: unknown, row: PaymentSettingsRecord) => row.kind === 'accounts' ? settingsReferenceName(row.paymentMethod) : '' },
      statusColumn, actionColumn];
  return <section className="store-settings-workbench payment-settings-workbench bs-page iw-workbench iw-arco-controls" aria-label="收款配置">
    <header className="bs-head iw-head"><h1>收款配置</h1><div className="bs-head-actions"><Button type="text" disabled title="操作记录暂未开放">操作记录</Button><Button type="primary" disabled={!props.canPrepare || editor !== null} onClick={event => { if (active) { if (event.currentTarget instanceof HTMLElement) focus.capture(event.currentTarget); openEditor(null); } }}>新增{label}</Button></div></header>
    <StandardTabs label="收款配置" value={props.kind} className="erp-store-tabs" items={[{ key: 'methods', label: '收款方式' }, { key: 'accounts', label: '资金账户' }]} onChange={changeTab}>
      <form className="bs-toolbar" role="search" onSubmit={event => { event.preventDefault(); run({ ...draft, page: 1, pageSize: applied.pageSize }); }}>
        <div className="bs-filter-fields"><div className="bs-filter search"><Input className="iw-arco-input iw-search-input" aria-label={props.kind === 'methods' ? '搜索收款方式' : '搜索账户名称'} placeholder={props.kind === 'methods' ? '搜索收款方式' : '搜索账户名称'} maxLength={200} value={draft.search} onChange={search => setDraft(value => ({ ...value, search }))} suffix={<IconSearch />} allowClear /></div>
          {props.kind === 'accounts' && <div className="bs-filter" title={props.reader?.supportsPaymentMethodFilter ? undefined : '当前版本暂不支持按收款方式筛选'}><SettingsReferenceSelect scope={scope} disabled={!props.reader?.supportsPaymentMethodFilter} reader={props.directory} kind="payment-methods" label="全部收款方式" selected={method ? [method] : []} onChange={items => { setMethod(items[0] ?? null); setDraft(value => ({ ...value, paymentMethodId: items[0]?.id ?? null })); }} /></div>}
          <div className="bs-filter"><StoreSettingsSingleSelect scope={scope} label="状态" value={draft.status} options={[{ value: 'normal', label: '正常' }, { value: 'disabled', label: '已停用' }, { value: 'all', label: '全部' }]} onChange={status => setDraft(value => ({ ...value, status: status as PaymentSettingsQuery['status'] }))} /></div>
        </div><div className="bs-toolbar-actions iw-query-actions"><Button className="btn primary" type="primary" htmlType="submit" disabled={!queries || busy}>查询</Button><Button className="btn iw-reset" disabled={!queries || busy} onClick={() => { const reset = { ...initialPaymentSettingsQuery, pageSize: applied.pageSize }; props.onFilterDraft(reset); setMethod(null); run(reset); }}>重置</Button></div>
      </form>
      {!queries && <p className="payment-empty-state" role="status">{label}资料读取暂未开放。{settingsSaveUnavailable}</p>}
      {list.phase === 'loading' && <p className="settings-note" role="status">正在读取资料…</p>}
      {list.phase === 'error' && <p className="settings-note" role="alert">资料读取失败。<Button type="text" onClick={() => run(list.request?.parameters ?? applied)}>重试</Button></p>}
      {result && list.phase !== 'success' && <p className="settings-note">下方为上次成功读取的结果。</p>}
      <div className="bs-table-wrap iw-arco-table" aria-busy={busy}><Table size="small" rowKey="id" columns={columns} data={result ? [...result.items] : []} pagination={false} noDataElement={<Empty description={!queries ? '资料暂不可用' : !result ? '尚未读到资料' : '暂无符合条件的数据'} />} /></div>
      <div className="bs-pager"><StoreSettingsPagination scope={scope} page={applied.page} pageSize={applied.pageSize} total={result?.total ?? null} busy={busy} onPage={page => run({ ...applied, page })} onPageSize={pageSize => run({ ...applied, page: 1, pageSize })} /></div>
    </StandardTabs>
    {editor && (props.kind === 'methods' ? <PaymentMethodForm controller={editor} close={close} /> : <PaymentAccountForm {...props} controller={editor} close={close} />)}
    {editingId && !editor && <Modal className="store-settings-modal iw-arco-controls" visible title={`编辑${label}`} maskClosable={false} onCancel={close} okText="确定" cancelText="取消" okButtonProps={{ disabled: true }}><p role="status">{detail.phase === 'loading' ? '正在读取当前资料…' : detail.phase === 'success' ? '记录不存在或不可访问。' : '当前资料读取失败。'}</p>{detail.phase === 'error' && <Button onClick={() => { void queries?.detail.run({ id: editingId }); }}>重试读取</Button>}</Modal>}
  </section>;
}
