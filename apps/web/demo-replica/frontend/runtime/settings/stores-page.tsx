import { Button, Empty, Input, Modal, Table, Tag } from '@arco-design/web-react';
import { IconSearch } from '@arco-design/web-react/icon';
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import type { StoreSettingsEntry, StoreSettingsKind, StoreSettingsPageProps } from '../../../../src/settings/stores/contracts.ts';
import { StoreSettingsReadController } from '../../../../src/settings/stores/controller.ts';
import { createStoreSettingsViewState, StoreMaintenanceController } from '../../../../src/settings/stores/maintenance-controller.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import type { StoreMaintenanceWorkspace } from '../../../../src/settings/stores/maintenance-controller.ts';
import { Pager, readMessage, ReferenceSelect, SmallSelect } from './controls.tsx';
import '../../basic-settings-v2.css';
import './settings-runtime.css';

const names = { stores: '营业厅', warehouses: '仓库' } as const;
const emptyWorkspace = Object.freeze({ stores: null, warehouses: null });
const noSubscribe = () => () => {};

/** Normal replica route. The host supplies its current session and existing clients. */
export function StoreSettingsRuntime(props: StoreSettingsPageProps) {
  return <StoresPage key={`${props.scope.routeInstanceId}:${props.scope.identity.accountId}:${props.scope.identity.sessionRevision}:${props.scope.identity.permissionRevision}`} {...props}/>;
}
function StoresPage(props: StoreSettingsPageProps) {
  const workspace = props.maintenance?.workspace?.matches(props.scope) ? props.maintenance.workspace : undefined;
  const [view] = useState(() => workspace?.getViewState() ?? createStoreSettingsViewState());
  const [tab, setTab] = useState<StoreSettingsKind>(() => view && (!props.allowedTabs || props.allowedTabs.includes(view.tab)) ? view.tab : props.allowedTabs?.[0] ?? 'stores');
  if (!view || props.allowedTabs?.length === 0) return null;
  const activeTab = props.allowedTabs && !props.allowedTabs.includes(tab) ? props.allowedTabs[0]! : tab;
  return <div id="basic-settings-v2"><StoreTab key={activeTab} {...props} workspace={workspace} view={view} kind={activeTab} onTab={kind => { view.tab = kind; setTab(kind); props.onTab?.(kind); }}/></div>;
}
function StoreTab(props: StoreSettingsPageProps & { workspace: StoreMaintenanceWorkspace | undefined; view: ReturnType<typeof createStoreSettingsViewState>; kind: StoreSettingsKind; onTab: (kind: StoreSettingsKind) => void }) {
  const [binding, setBinding] = useState<{ scope: StoreSettingsPageProps['scope']; reader: StoreSettingsPageProps['reader']; controller: StoreSettingsReadController } | null>(null);
  useEffect(() => {
    const controller = new StoreSettingsReadController(props, props.kind);
    setBinding({ scope: props.scope, reader: props.reader, controller });
    return () => controller.dispose();
  }, [props.scope, props.reader, props.kind, props.workspace, props.allowHallDirectoryRead]);
  return binding?.scope === props.scope && binding.reader === props.reader && binding.controller.scope.active ? <StoreTabBody {...props} controller={binding.controller}/> : <p className="iw-loading" role="status">正在读取基础资料…</p>;
}
function StoreTabBody(props: Parameters<typeof StoreTab>[0] & { controller: StoreSettingsReadController }) {
  const { kind, workspace } = props;
  const { controller } = props;
  const state = useSyncExternalStore(controller.list.subscribe, controller.list.getSnapshot, controller.list.getSnapshot);
  const editors = useSyncExternalStore(workspace?.subscribe ?? noSubscribe, workspace?.getSnapshot ?? (() => emptyWorkspace), workspace?.getSnapshot ?? (() => emptyWorkspace));
  const [localEditor, setLocalEditor] = useState<StoreMaintenanceController | null>(null);
  const [detail, setDetail] = useState<ReturnType<StoreSettingsReadController['openDetail']> | null>(null);
  const [auditOpen, setAuditOpen] = useState(false), [, refresh] = useReducer(value => value+1, 0);
  const [redacted, setRedacted] = useState(false);
  const [formModule, setFormModule] = useState<typeof import('./store-form.tsx') | null>(null), [formFailed, setFormFailed] = useState(false), [formAttempt, retryForm] = useReducer(value => value+1, 0);
  const [auditModule, setAuditModule] = useState<typeof import('./audit-drawer.tsx') | null>(null), [auditFailed, setAuditFailed] = useState(false), [auditAttempt, retryAudit] = useReducer(value => value+1, 0);
  const table = useRef<HTMLDivElement>(null), trigger = useRef<HTMLElement | null>(null);
  const ui = props.view.tabs[kind], editor = workspace ? editors[kind] : localEditor;
  const needsForm = !!(editor || detail);
  useEffect(() => {
    if (!needsForm || formModule) return;
    let active = true; setFormFailed(false);
    void import('./store-form.tsx').then(module => { if (active && props.scope.active) setFormModule(module); }, () => { if (active && props.scope.active) setFormFailed(true); });
    return () => { active = false; };
  }, [needsForm, formModule, formAttempt, props.scope]);
  useEffect(() => {
    if (!auditOpen || auditModule) return;
    let active = true; setAuditFailed(false);
    void import('./audit-drawer.tsx').then(module => { if (active && props.scope.active) setAuditModule(module); }, () => { if (active && props.scope.active) setAuditFailed(true); });
    return () => { active = false; };
  }, [auditOpen, auditModule, auditAttempt, props.scope]);
  const capture = () => { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; };
  const restoreFocus = () => queueMicrotask(() => { if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true }); });
  useEffect(() => { void controller.queryList(ui.applied); }, [controller]);
  useEffect(() => () => localEditor?.dispose(), [localEditor]);
  useLayoutEffect(() => { if (table.current && state.phase === 'success') { table.current.scrollTop = ui.tableScroll.top; table.current.scrollLeft = ui.tableScroll.left; } }, [state.phase, state.success]);
  const run = (parameters = ui.applied) => { ui.applied = { ...parameters }; void controller.queryList(ui.applied); refresh(); };
  const openEditor = (record: StoreSettingsEntry | null) => {
    controller.closeDetail(); setDetail(null);
    if (workspace) workspace.open(kind, record);
    else setLocalEditor(new StoreMaintenanceController(props.scope, kind, record));
  };
  const close = () => {
    if (editor && !editor.getSnapshot().disposed && !editor.canLeave()) return;
    if (workspace) workspace.close(kind); else { localEditor?.dispose(); setLocalEditor(null); }
    controller.closeDetail(); setDetail(null); restoreFocus();
  };
  const denied = state.phase === 'error' && state.error instanceof HttpQueryError && (state.error.kind === 'forbidden' || state.error.kind === 'unauthenticated');
  useEffect(() => { if (denied) setRedacted(true); else if (state.phase === 'success') setRedacted(false); }, [denied, state.phase]);
  const current = redacted || denied ? null : state.success;
  const data = current?.data;
  useEffect(() => {
    const success = state.phase === 'success' ? state.success : null;
    if (success && success.parameters.page > Math.max(1, Math.ceil(success.data.total / success.parameters.pageSize))) run({ ...success.parameters, page: Math.max(1, Math.ceil(success.data.total / success.parameters.pageSize)) });
  }, [state.success, state.phase]);
  const applied = state.request?.parameters ?? ui.applied;
  const busy = state.phase === 'loading';
  const options = useMemo(() => [{ label: '正常', value: 'normal' }, { label: '已停用', value: 'disabled' }, { label: '全部', value: 'all' }], []);
  if (!props.scope.active || state.phase === 'disposed') return null;
  const columns = kind === 'stores'
    ? [{ title: '名称', dataIndex: 'name' }, { title: '默认零售客户', render: (_: unknown, row: StoreSettingsEntry) => row.kind === 'stores' ? row.defaultCustomer?.name ?? (row.defaultCustomer ? '名称未提供' : '') : '' }, { title: '默认出库仓', render: (_: unknown, row: StoreSettingsEntry) => row.kind === 'stores' ? row.defaultWarehouse?.name ?? (row.defaultWarehouse ? '名称未提供' : '') : '' }]
    : [{ title: '仓库名称', dataIndex: 'name' }, { title: '所属营业厅', render: (_: unknown, row: StoreSettingsEntry) => row.kind === 'warehouses' ? row.hall.name ?? '名称未提供' : '' }];
  return <section className="bs-page iw-workbench iw-arco-controls runtime-settings"><header className="bs-head iw-head"><h1>营业厅与仓库</h1><div className="bs-head-actions"><Button type="text" disabled={!props.audit} onClick={() => { capture(); setAuditOpen(true); }}>操作记录</Button><Button type="primary" onClick={() => { capture(); openEditor(null); }}>新增{names[kind]}</Button></div></header>
    <nav className="bs-tabs" role="tablist">{(['stores','warehouses'] as const).filter(id => !props.allowedTabs || props.allowedTabs.includes(id)).map(id => <button type="button" role="tab" aria-selected={id === kind} key={id} onClick={() => props.onTab(id)}>{names[id]}</button>)}</nav>
    <div className="bs-toolbar"><div className="bs-filter-fields"><div className="bs-filter search"><Input className="iw-arco-input iw-search-input" size="default" aria-label={`搜索${names[kind]}名称`} placeholder={`搜索${names[kind]}名称`} value={ui.draft.search} onChange={search => { ui.draft = { ...ui.draft, search }; refresh(); }} suffix={<IconSearch/>} allowClear/></div>
      {kind === 'warehouses' && <div className="bs-filter"><ReferenceSelect scope={controller.scope} reader={props.allowHallDirectoryRead ? props.maintenance?.directory : undefined} kind="halls" label="全部营业厅" placeholder="全部营业厅" selected={ui.hallSelection} onChange={hall => { ui.hallSelection = hall ? { id: hall.id, name: hall.name ?? '名称未提供' } : null; ui.draft = { ...ui.draft, hallId: hall?.id ?? null }; refresh(); }}/></div>}
      <div className="bs-filter"><SmallSelect label="状态" value={ui.draft.status} items={options} onChange={status => { if (status === 'normal' || status === 'disabled' || status === 'all') { ui.draft = { ...ui.draft, status }; refresh(); } }}/></div></div>
      <div className="bs-toolbar-actions iw-query-actions"><Button className="btn primary" type="primary" onClick={() => { ui.tableScroll.top = 0; run({ ...ui.draft, page: 1, pageSize: ui.applied.pageSize }); }}>查询</Button><Button className="btn iw-reset" onClick={() => { ui.draft = { search: '', status: 'normal', hallId: null, page: 1, pageSize: ui.applied.pageSize }; ui.hallSelection = null; ui.tableScroll.top = 0; run(ui.draft); }}>重置</Button></div></div>
    {!workspace && <p className="runtime-settings-note" role="status">维护保存尚未接入，当前可查看和准备资料。</p>}
    {state.phase === 'error' && <div className="runtime-settings-note" role="alert">{readMessage(state.error)}{current && ' 仍显示上一次查询结果。'}<Button type="text" onClick={() => run(applied)}>重试</Button></div>}
    <div ref={table} className="bs-table-wrap iw-arco-table" onScroll={event => { ui.tableScroll.top = event.currentTarget.scrollTop; ui.tableScroll.left = event.currentTarget.scrollLeft; }}><Table<StoreSettingsEntry> size="small" rowKey="id" loading={busy} columns={[...columns, { title: '状态', width: 100, render: (_, row) => <Tag className={`iw-status ${row.enabled ? 'normal' : 'off'}`}>{row.enabled ? '正常' : '已停用'}</Tag> }, { title: '操作', width: 76, render: (_, row) => <div className="bs-row-actions"><Button type="text" size="small" disabled={busy} onClick={() => { capture(); setDetail(controller.openDetail(row.id)); }}>编辑</Button></div> }]} data={[...(data?.items ?? [])]} pagination={false} noDataElement={<Empty description={state.phase === 'idle' ? '正在准备资料…' : state.phase === 'error' ? '资料尚未读取' : '暂无符合条件的数据'}/>}/></div>
    <Pager total={data?.total ?? 0} page={current?.parameters.page ?? applied.page} size={current?.parameters.pageSize ?? applied.pageSize} disabled={busy} onPage={page => run({ ...(current?.parameters ?? ui.applied), page })} onSize={pageSize => run({ ...(current?.parameters ?? ui.applied), page: 1, pageSize })}/>
    {needsForm && (formModule ? <formModule.default scope={props.scope} kind={kind} editor={editor ?? null} detail={detail} directory={props.maintenance?.directory} onRecord={openEditor} onSaved={() => run()} close={close}/> : <PendingForm kind={kind} editor={editor ?? null} failed={formFailed} retry={retryForm} close={close}/>)}
    {auditOpen && props.audit && (auditModule ? <auditModule.default scope={props.scope} capability={props.audit} onAccessFailure={props.onAccessFailure} close={() => { setAuditOpen(false); restoreFocus(); }}/> : <Modal visible title="基础设置操作记录" maskClosable={false} footer={<Button onClick={() => { setAuditOpen(false); restoreFocus(); }}>取消</Button>} onCancel={() => { setAuditOpen(false); restoreFocus(); }}><p role={auditFailed ? 'alert' : 'status'}>{auditFailed ? '操作记录暂未加载。' : '正在读取操作记录…'}{auditFailed && <Button type="text" onClick={retryAudit}>重试加载</Button>}</p></Modal>)}
  </section>;
}
const emptyEditor = Object.freeze({ closePrompt: false });
function PendingForm(props: { kind: StoreSettingsKind; editor: StoreMaintenanceController | null; failed: boolean; retry: () => void; close: () => void }) {
  const state = useSyncExternalStore<{ readonly closePrompt: boolean }>(props.editor?.subscribe ?? noSubscribe, props.editor?.getSnapshot ?? (() => emptyEditor), props.editor?.getSnapshot ?? (() => emptyEditor));
  const cancel = () => { if (!props.editor || props.editor.requestClose()) props.close(); };
  return <Modal visible className="bs-modal iw-arco-modal iw-arco-controls" title={`${props.editor && !props.editor.record ? '新增' : '编辑'}${names[props.kind]}`} footer={<Button onClick={cancel}>取消</Button>} onCancel={cancel} maskClosable={false} autoFocus={false}>
    <p role={props.failed ? 'alert' : 'status'}>{props.failed ? '维护表单暂未加载，资料和输入已保留。' : '正在准备维护表单…'}{props.failed && <Button type="text" onClick={props.retry}>重试加载表单</Button>}</p>
    {state.closePrompt && <section role="alert"><p>本次填写尚未保存，是否离开？</p><Button onClick={() => props.editor?.keepEditing()}>继续填写</Button><Button onClick={() => { if (props.editor?.discard()) props.close(); }}>放弃本次填写</Button></section>}
  </Modal>;
}
export default StoreSettingsRuntime;
