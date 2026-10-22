import { SettingsAuditEntry } from '../settings/audit/audit-entry.tsx';
import { Button, Empty, Input, Modal, Table, Tag } from '@arco-design/web-react';
import { IconSearch } from '@arco-design/web-react/icon';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LatestQuery } from '../loading/latest-query.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { DemoSettingsPager, DemoSettingsSingleSelect } from '../settings/demo-settings-controls.tsx';
import { SettingsReferenceSelect } from '../settings/stores/maintenance-form.tsx';
import { settingsReferenceName, settingsSaveUnavailable } from '../settings/stores/maintenance-contracts.ts';
import type { SettingsReference } from '../settings/stores/maintenance-contracts.ts';
import { useDialogFocusReturn } from '../components/use-dialog-focus-return.ts';
import { initialStaffSettingsQuery } from './contracts.ts';
import type { StaffSettingsPage as PageData, StaffSettingsProps, StaffSettingsQuery, StaffSettingsRecord } from './contracts.ts';
import { StaffSettingsController, type StaffEditorIntent } from './controller.ts';
import { StaffSettingsForm } from './staff-form.tsx';
import './staff-settings.css';

type Queries = { readonly list: LatestQuery<StaffSettingsQuery, PageData>; readonly detail: LatestQuery<{ readonly id: string }, StaffSettingsRecord | null> };
const emptyRead = Object.freeze({ phase: 'idle' as const, request: null, success: null, error: null });
const noSubscribe = () => () => {};
export function StaffSettingsPage(props: StaffSettingsProps) {
  const [binding, setBinding] = useState<{ readonly scope: StaffSettingsProps['scope']; readonly reader: StaffSettingsProps['reader']; readonly queries: Queries } | null>(null);
  useEffect(() => {
    if (!props.reader || !props.scope.active) { setBinding(null); return; }
    const reader = props.reader, queries: Queries = {
      list: new LatestQuery({ scope: props.scope, execute: read => reader.readList(read) }),
      detail: new LatestQuery({ scope: props.scope, execute: read => reader.readDetail(read) }),
    };
    setBinding({ scope: props.scope, reader, queries }); void queries.list.run(initialStaffSettingsQuery);
    return () => { queries.list.dispose(); queries.detail.dispose(); };
  }, [props.scope, props.reader]);
  const queries = binding?.scope === props.scope && binding.reader === props.reader ? binding.queries : null;
  return <StaffContent key={JSON.stringify([props.scope.identity.accountId, props.scope.identity.sessionRevision, props.scope.identity.permissionRevision, props.scope.routeInstanceId])} {...props} queries={queries} />;
}
function StaffContent(props: StaffSettingsProps & { readonly queries: Queries | null }) {
  const { queries, scope } = props;
  const list = useSyncExternalStore(queries?.list.subscribe ?? noSubscribe, queries?.list.getSnapshot ?? (() => emptyRead), queries?.list.getSnapshot ?? (() => emptyRead));
  const detail = useSyncExternalStore(queries?.detail.subscribe ?? noSubscribe, queries?.detail.getSnapshot ?? (() => emptyRead), queries?.detail.getSnapshot ?? (() => emptyRead));
  const [draft, setDraft] = useState({ ...initialStaffSettingsQuery }), [selectedHall, setSelectedHall] = useState<SettingsReference | null>(null);
  const workspace = props.workspace?.matches(scope) ? props.workspace : undefined;
  const sessionEditor = useSyncExternalStore(workspace?.subscribe ?? noSubscribe, workspace?.getSnapshot ?? (() => null), workspace?.getSnapshot ?? (() => null));
  const [localEditor, setLocalEditor] = useState<StaffSettingsController | null>(null), [editingId, setEditingId] = useState<string | null>(null);
  const [intent, setIntent] = useState<StaffEditorIntent>('edit');
  const editor = workspace ? sessionEditor : localEditor;
  const focus = useDialogFocusReturn(scope, editor !== null || editingId !== null);
  useEffect(() => () => localEditor?.dispose(), [localEditor]);
  useEffect(() => {
    const error = list.error ?? detail.error;
    if (error instanceof HttpQueryError && error.kind === 'forbidden' && workspace?.hasUnresolvedWrite()) return;
    if (error instanceof HttpQueryError && error.kind === 'unauthenticated') workspace?.dispose();
    if (scope.active && error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) props.onAccessFailure(error.kind);
  }, [list.error, detail.error, scope, props.onAccessFailure, workspace]);
  useEffect(() => {
    if (!editingId || !props.canPrepare || detail.phase !== 'success' || detail.success?.parameters.id !== editingId) return;
    const record = detail.success.data;
    if (record?.id === editingId) { if (workspace) workspace.open(record, intent); else setLocalEditor(new StaffSettingsController(scope, record, props.roles, undefined, intent)); setEditingId(null); }
  }, [editingId, detail, scope, props.roles, props.canPrepare, workspace, intent]);
  const active = scope.active && list.phase !== 'disposed', result = list.success?.data;
  const searchLabel = props.reader?.capabilities?.loginNameSearch ? '搜索姓名或登录账号' : '搜索姓名';
  const applied = list.success?.parameters ?? initialStaffSettingsQuery, busy = list.phase === 'loading';
  const run = (query: StaffSettingsQuery) => { if (active) void queries?.list.run(query); };
  const editorState = useSyncExternalStore(editor?.subscribe ?? noSubscribe, editor?.getSnapshot ?? (() => null), editor?.getSnapshot ?? (() => null));
  const refreshed = useRef<string | null>(null), write = editorState?.write;
  useEffect(() => {
    if (queries && write?.phase === 'committed' && write.result && refreshed.current !== write.result.operationId) {
      refreshed.current = write.result.operationId; void queries.list.run(applied);
    }
  }, [queries, write, applied]);
  const close = () => { if (workspace) { if (!workspace.close()) return; } else { localEditor?.dispose(); setLocalEditor(null); } setEditingId(null); queries?.detail.cancel(); focus.request(); };
  const openDetail = (row: StaffSettingsRecord, action: StaffEditorIntent, trigger: HTMLElement) => {
    if (!active || !queries || editor || editingId) return;
    focus.capture(trigger); setIntent(action); setEditingId(row.id); void queries.detail.run({ id: row.id });
  };
  if (!active) return null;
  const columns = [
    { title: '姓名', dataIndex: 'name' },
    { title: '登录账号', render: (_: unknown, row: StaffSettingsRecord) => row.account?.loginName ?? '未开通' },
    { title: '角色', render: (_: unknown, row: StaffSettingsRecord) => props.roles.find(role => role.value === row.role)?.label ?? '未配置' },
    { title: '所属营业厅', render: (_: unknown, row: StaffSettingsRecord) => settingsReferenceName(row.hall) },
    { title: '员工状态', width: 95, render: (_: unknown, row: StaffSettingsRecord) => <Tag className={`iw-status ${row.employmentStatus === '在职' ? 'normal' : 'off'}`}>{row.employmentStatus || '未提供'}</Tag> },
    { title: '登录权限', width: 95, render: (_: unknown, row: StaffSettingsRecord) => <Tag className={`iw-status ${row.account?.loginEnabled ? 'normal' : 'off'}`}>{row.account?.loginEnabled ? '已开通' : '已关闭'}</Tag> },
    { title: '操作', width: 158, render: (_: unknown, row: StaffSettingsRecord) => <div className="bs-row-actions"><Button type="text" size="small" disabled={!props.canPrepare || busy || !!editor || !!editingId} onClick={event => { if (event.currentTarget instanceof HTMLElement) openDetail(row, 'edit', event.currentTarget); }}>编辑</Button>
      <Button type="text" size="small" disabled={!props.canPrepare || busy || !!editor || !!editingId || !['在职','离职'].includes(row.employmentStatus)} onClick={event => { if (event.currentTarget instanceof HTMLElement) openDetail(row, row.employmentStatus === '离职' ? 'REINSTATE' : 'LEAVE', event.currentTarget); }}>{row.employmentStatus === '离职' ? '恢复在职' : '办理离职'}</Button></div> },
  ];
  return <section className="demo-settings-workbench store-settings-workbench staff-settings-workbench bs-page iw-workbench iw-arco-controls" aria-label="员工与账号">
    <header className="bs-head iw-head"><h1>员工与账号</h1><div className="bs-head-actions"><SettingsAuditEntry scope={scope} {...(props.audit ? { capability: props.audit } : {})} onAccessFailure={props.onAccessFailure} localHasUnresolvedWrite={() => props.workspace?.hasUnresolvedWrite() ?? editor?.hasUnresolvedWrite ?? false} /><Button type="primary" disabled={!props.canPrepare || !!editor || !!editingId} onClick={event => { if (active) { if (event.currentTarget instanceof HTMLElement) focus.capture(event.currentTarget); if (workspace) workspace.open(null); else setLocalEditor(new StaffSettingsController(scope, null, props.roles)); } }}>新增员工</Button></div></header>
    <form className="bs-toolbar" role="search" onSubmit={event => { event.preventDefault(); run({ ...draft, page: 1, pageSize: applied.pageSize }); }}>
      <div className="bs-filter-fields">
        <div className="bs-filter search"><Input className="iw-arco-input iw-search-input" aria-label={searchLabel} placeholder={searchLabel} maxLength={200} value={draft.search} onChange={search => setDraft(value => ({ ...value, search }))} suffix={<IconSearch />} allowClear /></div>
        <div className="bs-filter" title={props.reader?.capabilities?.roleFilter ? undefined : '当前版本暂不支持按角色筛选'}><DemoSettingsSingleSelect scope={scope} disabled={!props.reader?.capabilities?.roleFilter} label="全部角色" placeholder="全部角色" value={draft.role} options={[{ value: '', label: '全部角色' }, ...props.roles]} onChange={role => setDraft(value => ({ ...value, role }))} /></div>
        <div className="bs-filter"><SettingsReferenceSelect flatValue placeholder="全部营业厅" scope={scope} reader={props.directory} kind="halls" label="全部营业厅" selected={selectedHall ? [selectedHall] : []} onChange={items => { setSelectedHall(items[0] ?? null); setDraft(value => ({ ...value, hallId: items[0]?.id ?? null })); }} /></div>
        <div className="bs-filter"><DemoSettingsSingleSelect scope={scope} label="员工状态" placeholder="员工状态" value={draft.employmentStatus} options={[{ value: '在职', label: '在职' }, { value: '离职', label: '离职' }, { value: 'all', label: '全部' }]} onChange={employmentStatus => setDraft(value => ({ ...value, employmentStatus: employmentStatus as StaffSettingsQuery['employmentStatus'] }))} /></div>
        <div className="bs-filter" title={props.reader?.capabilities?.loginStatusFilter ? undefined : '当前版本暂不支持按登录权限筛选'}><DemoSettingsSingleSelect scope={scope} disabled={!props.reader?.capabilities?.loginStatusFilter} label="全部登录权限" placeholder="全部登录权限" value={draft.loginStatus} options={[{ value: '', label: '全部' }, { value: 'open', label: '已开通' }, { value: 'closed', label: '已关闭' }]} onChange={loginStatus => setDraft(value => ({ ...value, loginStatus: loginStatus as StaffSettingsQuery['loginStatus'] }))} /></div>
      </div>
      <div className="bs-toolbar-actions iw-query-actions"><Button className="btn primary" type="primary" htmlType="submit" disabled={!queries || busy}>查询</Button><Button className="btn iw-reset" disabled={!queries || busy} onClick={() => { const reset = { ...initialStaffSettingsQuery, pageSize: applied.pageSize }; setDraft(reset); setSelectedHall(null); run(reset); }}>重置</Button></div>
    </form>
    {!queries && <p className="staff-empty-state" role="status">员工资料读取暂未开放。{settingsSaveUnavailable}</p>}
    {list.phase === 'loading' && <p role="status" className="settings-note">正在读取员工资料…</p>}
    {list.phase === 'error' && <p role="alert" className="settings-note">员工资料读取失败。<Button type="text" onClick={() => run(list.request?.parameters ?? applied)}>重试</Button></p>}
    {result && list.phase !== 'success' && <p className="settings-note">下方为上次成功读取的结果。</p>}
    <div className="bs-table-wrap iw-arco-table" aria-busy={busy}><Table size="small" rowKey="id" columns={columns} data={result ? [...result.items] : []} pagination={false} noDataElement={<Empty description={!queries ? '资料暂不可用' : !result ? '尚未读到资料' : '暂无符合条件的数据'} />} /></div>
    <DemoSettingsPager label="员工列表分页" scope={scope} page={applied.page} size={applied.pageSize} total={result?.total ?? null} busy={busy} onPage={page => run({ ...applied, page })} onSize={pageSize => run({ ...applied, page: 1, pageSize })} />
    {editor && <StaffSettingsForm {...props} controller={editor} close={close} />}
    {editingId && !editor && <Modal className="demo-ui bs-modal demo-settings-modal iw-arco-modal iw-arco-controls" autoFocus={false} focusLock visible title={intent === 'edit' ? '编辑员工' : intent === 'LEAVE' ? '确认办理离职' : '确认恢复在职'} maskClosable={false} onCancel={close} okText="确定" cancelText="取消" okButtonProps={{ disabled: true }}><p role="status">{detail.phase === 'loading' ? '正在读取当前资料…' : detail.phase === 'success' ? '员工不存在或不可访问。' : '员工资料读取失败。'}</p>{detail.phase === 'error' && <Button onClick={() => { void queries?.detail.run({ id: editingId }); }}>重试读取</Button>}</Modal>}

  </section>;
}
