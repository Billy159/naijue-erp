import { SettingsAuditEntry, type SettingsAuditCapability } from '../settings/audit/audit-entry.tsx';
import type { SettingsAuditDrawerProps } from '../settings/audit/contracts.ts';
import { Input, Button, Table, Tag, Empty } from '@arco-design/web-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { IconSearch } from '@arco-design/web-react/icon';
import '@arco-design/web-react/dist/css/arco.css';
import '../demo-presentation/controls.css';
import './source-settings.css';
import './parties.css';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import { partyLabels, type PartyKind, type PartyPageSize, type PartyRecord, type PartySearch } from './contracts.ts';
import type { PartyMaintenanceController, PartyWorkspace } from './controller.ts';
import { PartyPagination } from './party-pagination.tsx';
import { PartySingleSelect } from './party-single-select.tsx';


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
  const [notice, setNotice] = useState(''); const container = useRef<HTMLElement>(null); const trigger = useRef<HTMLElement | null>(null); const region = useRef<HTMLDivElement>(null); const scroll = useRef({ top: 0, left: 0 }); const wasEditor = useRef(false); const focusPending = useRef<string | null>(null); const attached = useRef(false);
  useEffect(() => {
    let current = true; attached.current = true;
    // The explicit route activation loads only its current first page, as in the
    // frozen settings App. Nothing is loaded by inert construction or hidden routes.
    queueMicrotask(() => { if (current && controller.scope.active && controller.list.getSnapshot().phase === 'idle') void controller.queryList({ search: '', enabled: 'ENABLED', page: 1, pageSize: 20 }); });
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
  if (state.disposed || !controller.scope.active) return <p role="status" className="iw-inline-state">身份或权限已改变，旧身份结果与草稿已清除。</p>;
  const busy = query.phase === 'loading'; const blocked = state.editor !== null;
  const run = () => { if (!blocked && !busy) { setNotice(''); void controller.queryList({ search: search.trim(), enabled, page: 1, pageSize: applied?.pageSize ?? size }); } };
  const page = (page: number, pageSize = applied?.pageSize ?? size) => { if (applied && !busy && !blocked) void controller.queryList({ ...applied, page, pageSize }); };
  const activate = (element: EventTarget | null, action: () => void) => { if (!(element instanceof HTMLElement)) return; trigger.current = element; scroll.current = { top: region.current?.scrollTop ?? 0, left: region.current?.scrollLeft ?? 0 }; setNotice(''); action(); };
  const readOnlyTitle = readOnly ? '当前页面仅开放只读，资料维护写入能力未开放' : undefined;
  const columns = [{ title: '名称', dataIndex: 'name' }, { title: '编码', dataIndex: 'code', render: (value: string) => <span className="party-code">{value}</span> }, { title: '状态', width: 100, render: (_: unknown, row: PartyRecord) => <Tag className={`iw-status ${row.enabled ? 'normal' : 'off'}`}>{row.enabled ? '正常' : '已停用'}</Tag> }, { title: '操作', width: 76, render: (_: unknown, row: PartyRecord) => <div className="bs-row-actions"><Button type="text" size="small" className="party-edit" data-party-id={row.id} disabled={readOnly || busy || blocked} title={readOnlyTitle} onClick={event => { if (!readOnly) activate(event.currentTarget, () => { void controller.openExisting(row.id, 'EDIT'); }); }}>编辑</Button></div> }];
  return <section className="bs-page iw-workbench iw-arco-controls party-workbench" aria-label={`${label}维护`} ref={container}>
    <header className="bs-head iw-head"><h1>{label}{readOnly && <small className="party-readonly">（只读）</small>}</h1><div className="bs-head-actions"><SettingsAuditEntry scope={controller.scope} {...(audit ? { capability: audit, onAccessFailure: audit.onAccessFailure } : {})} localHasUnresolvedWrite={() => controller.hasUnresolvedWrite} /><Button type="primary" disabled={readOnly || blocked} title={readOnlyTitle} onClick={event => { if (!readOnly) activate(event.currentTarget, () => { controller.openCreate(); }); }}>新增{label}</Button></div></header>
    <form className="bs-toolbar" onSubmit={event => { event.preventDefault(); run(); }}><div className="bs-filter-fields"><div className="bs-filter search"><Input className="iw-arco-input iw-search-input" aria-label="搜索名称或编码" value={search} disabled={blocked} maxLength={200} onChange={value => controller.setFilterDraft({ search: value, enabled })} placeholder="搜索名称或编码" suffix={<IconSearch />} allowClear /></div><div className="bs-filter"><PartySingleSelect label={`${label}状态`} value={enabled} disabled={blocked} options={[{ label: '正常', value: 'ENABLED' }, { label: '已停用', value: 'DISABLED' }, { label: '全部', value: 'ALL' }]} onChange={value => controller.setFilterDraft({ search, enabled: value as PartySearch['enabled'] })} /></div></div><div className="bs-toolbar-actions iw-query-actions"><Button className="btn primary" type="primary" htmlType="submit" disabled={busy || blocked}>查询</Button><Button className="btn iw-reset" disabled={busy || blocked} onClick={() => { controller.setFilterDraft({ search: '', enabled: 'ENABLED' }); setNotice(''); void controller.queryList({ search: '', enabled: 'ENABLED', page: 1, pageSize: applied?.pageSize ?? size }); }}>重置</Button></div></form>
    {notice && <p className="party-notice" role="status">{notice}</p>}
    {busy && <p className="party-read-state" role="status">正在读取{label}…{data ? '下方保留上次已执行结果。' : ''}<Button type="text" size="small" onClick={() => controller.list.cancel()}>取消本次读取</Button></p>}
    {query.phase === 'error' && <p className="bs-error party-read-state" role="alert">当前查询失败，未得到新结果。{data ? '下方仍为上次成功结果。' : ''}<Button type="text" disabled={blocked} onClick={() => { if (query.request) void controller.queryList(query.request.parameters); }}>重试查询</Button></p>}
    {state.listStale && !busy && <p className="party-read-state" role="status">资料已变更，列表为先前结果。<Button type="text" disabled={blocked} onClick={() => controller.refreshList()}>刷新已执行查询</Button></p>}
    <div className="bs-table-wrap iw-arco-table party-results" ref={region} aria-busy={busy}><Table className="party-list" size="small" rowKey="id" columns={columns} data={data ? [...data.items] : []} pagination={false} noDataElement={<Empty description={!data ? busy ? '正在读取资料' : query.phase === 'error' ? '当前查询失败' : '等待查询' : '暂无符合条件的数据'} />} /></div>
    <div className="bs-pager"><PartyPagination page={applied?.page ?? 1} pageSize={applied?.pageSize ?? size} total={data?.total ?? null} busy={busy || blocked} onPage={value => page(value)} onPageSize={value => { if (applied) page(1, value); else setSize(value); }} /></div>
    {!readOnly && state.editor && <PartyFormLeaf controller={controller} getPopupContainer={() => container.current ?? document.body} />}
  </section>;
}
function PartyFormLeaf(props: { readonly controller: PartyMaintenanceController; readonly getPopupContainer: () => HTMLElement }) {
  const { controller } = props; const [module, setModule] = useState<Awaited<ReturnType<typeof forms.load<'form'>>> | null>(null); const [error, setError] = useState(false); const [retry, setRetry] = useState(0);
  useEffect(() => { let attached = true; setError(false); void forms.load('form', controller.scope).then(value => { if (attached && controller.scope.active) setModule(value); }, () => { if (attached && controller.scope.active) setError(true); }); return () => { attached = false; }; }, [controller, retry]);
  if (!controller.scope.active) return null;
  return module ? <module.PartyForm {...props} /> : <div className="party-modal-backdrop"><section className="arco-modal bs-modal iw-arco-modal iw-arco-controls party-modal" role="dialog" aria-modal="true" aria-label="准备资料表单"><header className="arco-modal-header"><strong>资料表单</strong><Button type="text" onClick={() => controller.requestClose()}>关闭</Button></header><div className="arco-modal-content"><p role={error ? 'alert' : 'status'}>{error ? '表单暂不可加载。' : '正在准备表单…'}{error && <Button type="text" onClick={() => setRetry(value => value + 1)}>重试表单</Button>}</p>{controller.getSnapshot().editor?.closePrompt && <div role="alert"><p>尚有未保存内容，放弃本次填写？</p><Button onClick={() => controller.keepEditing()}>继续填写</Button><Button onClick={() => controller.discardEditor()}>放弃本次填写</Button></div>}</div></section></div>;
}
