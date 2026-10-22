import { Button, Empty, Input, Modal, Table, Tag } from '@arco-design/web-react';
import { IconSearch } from '@arco-design/web-react/icon';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { LatestQuery } from '../loading/latest-query.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { StoreSettingsSingleSelect } from '../settings/stores/single-select.tsx';
import { StoreSettingsPagination } from '../settings/stores/pagination.tsx';
import { SettingsReferenceSelect } from '../settings/stores/maintenance-form.tsx';
import { settingsReferenceName, settingsSaveUnavailable } from '../settings/stores/maintenance-contracts.ts';
import type { SettingsReference } from '../settings/stores/maintenance-contracts.ts';
import { useDialogFocusReturn } from '../components/use-dialog-focus-return.ts';
import { initialStaffSettingsQuery } from './contracts.ts';
import type { StaffSettingsPage as PageData, StaffSettingsProps, StaffSettingsQuery, StaffSettingsRecord } from './contracts.ts';
import { StaffSettingsController } from './controller.ts';
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
  const [editor, setEditor] = useState<StaffSettingsController | null>(null), [editingId, setEditingId] = useState<string | null>(null);
  const [employment, setEmployment] = useState<StaffSettingsRecord | null>(null);
  const focus = useDialogFocusReturn(scope, editor !== null || editingId !== null || employment !== null);
  useEffect(() => () => editor?.dispose(), [editor]);
  useEffect(() => {
    const error = list.error ?? detail.error;
    if (scope.active && error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) props.onAccessFailure(error.kind);
  }, [list.error, detail.error, scope, props.onAccessFailure]);
  useEffect(() => {
    if (!editingId || !props.canPrepare || detail.phase !== 'success' || detail.success?.parameters.id !== editingId) return;
    const record = detail.success.data;
    if (record?.id === editingId) { setEditor(new StaffSettingsController(scope, record, props.roles)); setEditingId(null); }
  }, [editingId, detail, scope, props.roles, props.canPrepare]);
  const active = scope.active && list.phase !== 'disposed', result = list.success?.data;
  const applied = list.success?.parameters ?? initialStaffSettingsQuery, busy = list.phase === 'loading';
  const run = (query: StaffSettingsQuery) => { if (active) void queries?.list.run(query); };
  const close = () => { editor?.dispose(); setEditor(null); setEditingId(null); queries?.detail.cancel(); focus.request(); };
  if (!active) return null;
  const columns = [
    { title: '姓名', dataIndex: 'name' },
    { title: '登录账号', render: (_: unknown, row: StaffSettingsRecord) => row.account?.loginName ?? '未开通' },
    { title: '角色', render: (_: unknown, row: StaffSettingsRecord) => props.roles.find(role => role.value === row.role)?.label ?? '未配置' },
    { title: '所属营业厅', render: (_: unknown, row: StaffSettingsRecord) => settingsReferenceName(row.hall) },
    { title: '员工状态', width: 95, render: (_: unknown, row: StaffSettingsRecord) => <Tag className={`iw-status ${row.employmentStatus === '在职' ? 'normal' : 'off'}`}>{row.employmentStatus || '未提供'}</Tag> },
    { title: '登录权限', width: 95, render: (_: unknown, row: StaffSettingsRecord) => <Tag className={`iw-status ${row.account?.loginEnabled ? 'normal' : 'off'}`}>{row.account?.loginEnabled ? '已开通' : '已关闭'}</Tag> },
    { title: '操作', width: 158, render: (_: unknown, row: StaffSettingsRecord) => <div className="bs-row-actions"><Button type="text" size="small" disabled={!props.canPrepare || busy} onClick={event => { if (active && queries) { if (event.currentTarget instanceof HTMLElement) focus.capture(event.currentTarget); setEditingId(row.id); void queries.detail.run({ id: row.id }); } }}>编辑</Button>
      <Button type="text" size="small" disabled={!props.canPrepare || !['在职','离职'].includes(row.employmentStatus)} onClick={event => { if (event.currentTarget instanceof HTMLElement) focus.capture(event.currentTarget); setEmployment(row); }}>{row.employmentStatus === '离职' ? '恢复在职' : '办理离职'}</Button></div> },
  ];
  return <section className="store-settings-workbench staff-settings-workbench bs-page iw-workbench iw-arco-controls" aria-label="员工与账号">
    <header className="bs-head iw-head"><h1>员工与账号</h1><div className="bs-head-actions"><Button type="text" disabled title="操作记录暂未开放">操作记录</Button><Button type="primary" disabled={!props.canPrepare} onClick={event => { if (active) { if (event.currentTarget instanceof HTMLElement) focus.capture(event.currentTarget); setEditor(new StaffSettingsController(scope, null, props.roles)); } }}>新增员工</Button></div></header>
    <form className="bs-toolbar" role="search" onSubmit={event => { event.preventDefault(); run({ ...draft, page: 1, pageSize: applied.pageSize }); }}>
      <div className="bs-filter-fields">
        <div className="bs-filter search"><Input className="iw-arco-input iw-search-input" aria-label="搜索姓名或登录账号" placeholder="搜索姓名或登录账号" value={draft.search} onChange={search => setDraft(value => ({ ...value, search }))} suffix={<IconSearch />} allowClear /></div>
        <div className="bs-filter"><StoreSettingsSingleSelect scope={scope} label="角色" value={draft.role} options={[{ value: '', label: '全部角色' }, ...props.roles]} onChange={role => setDraft(value => ({ ...value, role }))} /></div>
        <div className="bs-filter"><SettingsReferenceSelect scope={scope} reader={props.directory} kind="halls" label="所属营业厅" selected={selectedHall ? [selectedHall] : []} onChange={items => { setSelectedHall(items[0] ?? null); setDraft(value => ({ ...value, hallId: items[0]?.id ?? null })); }} /></div>
        <div className="bs-filter"><StoreSettingsSingleSelect scope={scope} label="员工状态" value={draft.employmentStatus} options={[{ value: '在职', label: '在职' }, { value: '离职', label: '离职' }, { value: 'all', label: '全部' }]} onChange={employmentStatus => setDraft(value => ({ ...value, employmentStatus: employmentStatus as StaffSettingsQuery['employmentStatus'] }))} /></div>
        <div className="bs-filter"><StoreSettingsSingleSelect scope={scope} label="登录权限" value={draft.loginStatus} options={[{ value: '', label: '全部登录权限' }, { value: 'open', label: '已开通' }, { value: 'closed', label: '已关闭' }]} onChange={loginStatus => setDraft(value => ({ ...value, loginStatus: loginStatus as StaffSettingsQuery['loginStatus'] }))} /></div>
      </div>
      <div className="bs-toolbar-actions iw-query-actions"><Button className="btn primary" type="primary" htmlType="submit" disabled={!queries || busy}>查询</Button><Button className="btn iw-reset" disabled={!queries || busy} onClick={() => { const reset = { ...initialStaffSettingsQuery, pageSize: applied.pageSize }; setDraft(reset); setSelectedHall(null); run(reset); }}>重置</Button></div>
    </form>
    {!queries && <p className="staff-empty-state" role="status">员工资料读取暂未开放。{settingsSaveUnavailable}</p>}
    {list.phase === 'loading' && <p role="status" className="settings-note">正在读取员工资料…</p>}
    {list.phase === 'error' && <p role="alert" className="settings-note">员工资料读取失败。<Button type="text" onClick={() => run(list.request?.parameters ?? applied)}>重试</Button></p>}
    {result && list.phase !== 'success' && <p className="settings-note">下方为上次成功读取的结果。</p>}
    <div className="bs-table-wrap iw-arco-table" aria-busy={busy}><Table size="small" rowKey="id" columns={columns} data={result ? [...result.items] : []} pagination={false} noDataElement={<Empty description={!queries ? '资料暂不可用' : !result ? '尚未读到资料' : '暂无符合条件的数据'} />} /></div>
    <div className="bs-pager"><StoreSettingsPagination scope={scope} page={applied.page} pageSize={applied.pageSize} total={result?.total ?? null} busy={busy} onPage={page => run({ ...applied, page })} onPageSize={pageSize => run({ ...applied, page: 1, pageSize })} /></div>
    {editor && <StaffSettingsForm {...props} controller={editor} close={close} />}
    {editingId && !editor && <Modal className="store-settings-modal iw-arco-controls" visible title="编辑员工" maskClosable={false} onCancel={close} okText="确定" cancelText="取消" okButtonProps={{ disabled: true }}><p role="status">{detail.phase === 'loading' ? '正在读取当前资料…' : detail.phase === 'success' ? '员工不存在或不可访问。' : '员工资料读取失败。'}</p>{detail.phase === 'error' && <Button onClick={() => { void queries?.detail.run({ id: editingId }); }}>重试读取</Button>}</Modal>}
    {employment && <Modal className="store-settings-modal iw-arco-controls" visible title={employment.employmentStatus === '离职' ? '确认恢复在职' : '确认办理离职'} maskClosable={false} onCancel={() => { setEmployment(null); focus.request(); }} okText="确定" cancelText="取消" okButtonProps={{ disabled: true }}>
      <p>{employment.employmentStatus === '离职' ? `确定恢复「${employment.name}」在职？登录权限仍保持关闭，需要登录时请在编辑员工中手工开通。` : `确定为「${employment.name}」办理离职？办理后登录权限关闭，员工资料、登录账号和历史单据继续保留。恢复在职后登录权限仍保持关闭。`}</p><p className="settings-note">此版本暂未开放此操作。</p>
    </Modal>}
  </section>;
}
