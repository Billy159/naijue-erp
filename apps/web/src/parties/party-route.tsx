import { SettingsAuditEntry, type SettingsAuditCapability } from '../settings/audit/audit-entry.tsx';
import type { SettingsAuditDrawerProps } from '../settings/audit/contracts.ts';
import { Input, Button, Table, Tag, Empty, Modal } from '@arco-design/web-react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { IconSearch } from '@arco-design/web-react/icon';
import '@arco-design/web-react/dist/css/arco.css';
import '../demo-presentation/controls.css';
import './parties.css';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import { partyLabels, type PartyKind, type PartyPageSize, type PartyRecord, type PartySearch } from './contracts.ts';
import type { PartyMaintenanceController, PartyWorkspace } from './controller.ts';
import { DemoSettingsPager, DemoSettingsSingleSelect } from '../settings/demo-settings-controls.tsx';


const forms = new AsyncLeafRegistry({ form: { load: () => import('./party-form.tsx') } }, { maxRetainedEntries: 1 });
interface PartyHostProps { readonly workspace: PartyWorkspace; readonly readOnly?: true; readonly audit?: SettingsAuditCapability & Pick<SettingsAuditDrawerProps, 'onAccessFailure'> }
export function CustomerPageHost(props: PartyHostProps) { return <PartyPageHost key="CUSTOMER" {...props} kind="CUSTOMER" />; }
export function SupplierPageHost(props: PartyHostProps) { return <PartyPageHost key="SUPPLIER" {...props} kind="SUPPLIER" />; }
export function PartyPageHost(props: PartyHostProps & { readonly kind: PartyKind }) {
  if (!props.workspace.scope.active) return <p role="status" className="iw-inline-state">身份或权限已改变，旧身份结果与草稿已清除。</p>;
  const controller = props.workspace.get(props.kind); return <PartyPage key={controller.instanceId} controller={controller} {...(props.readOnly ? { readOnly: true } : {})} {...(props.audit ? { audit: props.audit } : {})} />;
}
function PartyPage({ controller, readOnly, audit }: { readonly controller: PartyMaintenanceController; readonly readOnly?: true; readonly audit?: PartyHostProps['audit'] }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const query = useSyncExternalStore(controller.list.subscribe, controller.list.getSnapshot, controller.list.getSnapshot);
  const applied = query.success?.parameters; const data = query.success?.data; const label = partyLabels[controller.kind];
  const { search, enabled } = state.filterDraft; const [size, setSize] = useState<PartyPageSize>(applied?.pageSize ?? 20);
  const [notice, setNotice] = useState(''); const container = useRef<HTMLElement>(null); const trigger = useRef<HTMLElement | null>(null); const region = useRef<HTMLDivElement>(null); const scroll = useRef(controller.tableScroll); const scrollReady = useRef(false); const wasEditor = useRef(false); const focusPending = useRef<string | null>(null); const attached = useRef(false);
  useEffect(() => {
    let current = true; attached.current = true;
    // Ordinary menu returns retain only the per-kind presentation context and
    // re-read its executed range. Unsubmitted input never becomes a request.
    queueMicrotask(() => { if (current && controller.scope.active && (!controller.getSnapshot().editor || controller.list.getSnapshot().phase === 'idle')) void controller.queryList(controller.executedQuery); });
    return () => {
      current = false; attached.current = false; controller.suspend();
      // StrictMode immediately reattaches the same instance before this microtask.
      // Only a real leave drops a clean editor; blocked drafts/commands survive.
      queueMicrotask(() => { if (!attached.current) controller.leaveRoute(); });
    };
  }, [controller]);
  useEffect(() => {
    if (state.write.phase === 'committed') {
      setNotice(state.write.receipt === 'found' ? '原操作已确认，正在刷新当前资料。' : '资料已保存。');
      controller.discardEditor(); controller.refreshList();
    }
  }, [state.write.phase, state.write.receipt, controller]);
  useEffect(() => {
    if (wasEditor.current && !state.editor && controller.scope.active) { if (region.current) { region.current.scrollTop = scroll.current.top; region.current.scrollLeft = scroll.current.left; } focusPending.current = trigger.current?.getAttribute('data-party-id') ?? 'CREATE'; }
    wasEditor.current = state.editor !== null;
  }, [state.editor, controller.scope]);
  useEffect(() => {
    if (state.editor || query.phase === 'loading' || !focusPending.current || !controller.scope.active) return;
    const timer = setTimeout(() => {
      const targetId = focusPending.current;
      const target = targetId && targetId !== 'CREATE' ? container.current?.querySelector<HTMLElement>(`[data-party-id="${targetId}"]`) : trigger.current;
      (target?.isConnected ? target : container.current?.querySelector<HTMLElement>('.bs-head-actions button:not(:disabled)'))?.focus();
      if (region.current) { region.current.scrollTop = scroll.current.top; region.current.scrollLeft = scroll.current.left; }
      focusPending.current = null;
    }, 0);
    return () => clearTimeout(timer);
  }, [state.editor, query.phase, query.success, controller.scope]);
  useLayoutEffect(() => {
    scrollReady.current = false;
    if (!region.current || !data || !controller.scope.active) return;
    region.current.scrollTop = scroll.current.top; region.current.scrollLeft = scroll.current.left;
    scroll.current.top = region.current.scrollTop; scroll.current.left = region.current.scrollLeft; scrollReady.current = true;
  }, [controller, data]);
  if (state.disposed || !controller.scope.active) return <p role="status" className="iw-inline-state">身份或权限已改变，旧身份结果与草稿已清除。</p>;
  const busy = query.phase === 'loading'; const blocked = state.editor !== null;
  const run = () => { if (!blocked && !busy) { setNotice(''); void controller.queryList({ search: search.trim(), enabled, page: 1, pageSize: applied?.pageSize ?? size }); } };
  const page = (page: number, pageSize = applied?.pageSize ?? size) => { if (applied && !busy && !blocked) void controller.queryList({ ...applied, page, pageSize }); };
  const activate = (element: EventTarget | null, action: () => void) => { if (!(element instanceof HTMLElement)) return; trigger.current = element; scroll.current.top = region.current?.scrollTop ?? 0; scroll.current.left = region.current?.scrollLeft ?? 0; setNotice(''); action(); };
  const readOnlyTitle = readOnly ? '当前页面仅开放只读，资料维护写入能力未开放' : undefined;
  const columns = [{ title: '名称', dataIndex: 'name' }, { title: '编码', dataIndex: 'code', render: (value: string) => <span className="party-code">{value}</span> }, { title: '状态', width: 100, render: (_: unknown, row: PartyRecord) => <Tag className={`iw-status ${row.enabled ? 'normal' : 'off'}`}>{row.enabled ? '正常' : '已停用'}</Tag> }, { title: '操作', width: 76, render: (_: unknown, row: PartyRecord) => <div className="bs-row-actions"><Button type="text" size="small" className="party-edit" data-party-id={row.id} disabled={readOnly || busy || blocked} title={readOnlyTitle} onClick={event => { if (!readOnly) activate(event.currentTarget, () => { void controller.openExisting(row.id, 'EDIT'); }); }}>编辑</Button></div> }];
  return <section className="demo-settings-workbench bs-page iw-workbench iw-arco-controls party-workbench" aria-label={`${label}维护`} ref={container}>
    <header className="bs-head iw-head"><h1>{label}</h1><div className="bs-head-actions"><SettingsAuditEntry scope={controller.scope} {...(audit ? { capability: audit, onAccessFailure: audit.onAccessFailure } : {})} localHasUnresolvedWrite={() => controller.hasUnresolvedWrite} /><Button type="primary" disabled={readOnly || blocked} title={readOnlyTitle} onClick={event => { if (!readOnly) activate(event.currentTarget, () => { controller.openCreate(); }); }}>新增{label}</Button></div></header>
    <Filters controller={controller} blocked={blocked} busy={busy} apply={run} reset={() => { controller.setFilterDraft({ search: '', enabled: 'ENABLED' }); setNotice(''); void controller.queryList({ search: '', enabled: 'ENABLED', page: 1, pageSize: applied?.pageSize ?? size }); }} />
    {notice && <p className="party-notice" role="status">{notice}</p>}
    {busy && <p className="party-read-state" role="status">正在读取{label}…{data ? '下方保留上次已执行结果。' : ''}<Button type="text" size="small" onClick={() => controller.list.cancel()}>取消本次读取</Button></p>}
    {query.phase === 'error' && <p className="bs-error party-read-state" role="alert">当前查询失败，未得到新结果。{data ? '下方仍为上次成功结果。' : ''}<Button type="text" disabled={blocked} onClick={() => { if (query.request) void controller.queryList(query.request.parameters); }}>重试查询</Button></p>}
    {state.listStale && !busy && <p className="party-read-state" role="status">资料已变更，列表为先前结果。<Button type="text" disabled={blocked} onClick={() => controller.refreshList()}>刷新已执行查询</Button></p>}
    <div className="bs-table-wrap iw-arco-table party-results" ref={region} aria-busy={busy} onScroll={event => { if (scrollReady.current && !blocked && controller.scope.active && data) { scroll.current.top = event.currentTarget.scrollTop; scroll.current.left = event.currentTarget.scrollLeft; } }}><Table className="party-list" size="small" rowKey="id" columns={columns} data={data ? [...data.items] : []} pagination={false} noDataElement={<Empty description={!data ? busy ? '正在读取资料' : query.phase === 'error' ? '当前查询失败' : '等待查询' : '暂无符合条件的数据'} />} /></div>
    <DemoSettingsPager scope={controller.scope} label="客户供应商列表分页" page={applied?.page ?? 1} size={applied?.pageSize ?? size} total={data?.total ?? null} busy={busy || blocked} onPage={value => page(value)} onSize={value => { if (applied) page(1, value); else setSize(value); }} />
    {!readOnly && state.editor && <PartyFormLeaf controller={controller} getPopupContainer={() => container.current ?? document.body} />}
  </section>;
}
// Frozen Filters parties branch. The approved customer/supplier split removes
// only the tag filter; each native controller still owns its independent draft.
function Filters(props: { readonly controller: PartyMaintenanceController; readonly blocked: boolean; readonly busy: boolean; readonly apply: () => void; readonly reset: () => void }) {
  const { controller } = props, filter = controller.getSnapshot().filterDraft, fields = [];
  const apply = () => { if (!props.blocked && !props.busy) props.apply(); };
  fields.push(<div className="bs-filter search" key="q"><Input className="iw-arco-input iw-search-input" size="default" aria-label="搜索名称或编码" value={filter.search} onChange={search => controller.setFilterDraft({ ...filter, search })} placeholder="搜索名称或编码" suffix={<IconSearch />} allowClear maxLength={200} disabled={props.blocked} onPressEnter={apply} /></div>);
  const state = [{ label: '正常', value: 'ENABLED' }, { label: '已停用', value: 'DISABLED' }, { label: '全部', value: 'ALL' }];
  fields.push(<div className="bs-filter" key="status"><DemoSettingsSingleSelect scope={controller.scope} label={`${partyLabels[controller.kind]}状态`} placeholder="状态" value={filter.enabled} options={state} disabled={props.blocked} onChange={enabled => controller.setFilterDraft({ ...filter, enabled: enabled as PartySearch['enabled'] })} /></div>);
  return <div className="bs-toolbar"><div className="bs-filter-fields">{fields}</div><div className="bs-toolbar-actions iw-query-actions"><Button className="btn primary" type="primary" onClick={apply} disabled={props.busy || props.blocked}>查询</Button><Button className="btn iw-reset" onClick={props.reset} disabled={props.busy || props.blocked}>重置</Button></div></div>;
}

function PartyFormLeaf(props: { readonly controller: PartyMaintenanceController; readonly getPopupContainer: () => HTMLElement }) {
  const { controller } = props; const [module, setModule] = useState<Awaited<ReturnType<typeof forms.load<'form'>>> | null>(null); const [error, setError] = useState(false); const [retry, setRetry] = useState(0);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot), editor = state.editor;
  useEffect(() => { let attached = true; setError(false); void forms.load('form', controller.scope).then(value => { if (attached && controller.scope.active) setModule(value); }, () => { if (attached && controller.scope.active) setError(true); }); return () => { attached = false; }; }, [controller, retry]);
  if (!controller.scope.active || state.disposed || !editor) return null;
  const verb = { CREATE: '新增', EDIT: '编辑', DISABLE: '停用', RESTORE: '恢复' }[editor.action];
  return module ? <module.PartyForm {...props} /> : <Modal className="demo-ui demo-settings-modal bs-modal iw-arco-modal iw-arco-controls party-modal" visible title={`${verb}${partyLabels[controller.kind]}`}
    getPopupContainer={props.getPopupContainer} onCancel={() => { controller.discardEditor(); }} okText="确定" cancelText="取消" maskClosable={false} autoFocus={false} focusLock okButtonProps={{ disabled: true }}>
    <p role={error ? 'alert' : 'status'}>{error ? '表单暂不可加载。' : '正在准备表单…'}{error && <Button type="text" onClick={() => setRetry(value => value + 1)}>重试表单</Button>}</p>
    {state.notice && <p className="bs-error" role="alert">{state.notice}</p>}
  </Modal>;
}
