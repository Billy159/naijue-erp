import { Button, Empty, Input, Modal, Table, Tag } from '@arco-design/web-react';
import { IconSearch } from '@arco-design/web-react/icon';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LatestQuery } from '../loading/latest-query.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { DemoSettingsPager, DemoSettingsSingleSelect } from '../settings/demo-settings-controls.tsx';
import { useDialogFocusReturn } from '../components/use-dialog-focus-return.ts';
import { initialAccountSettingsQuery, type AccountIntent, type AccountSettingsProps, type AccountSettingsQuery, type AccountSettingsReader, type AccountSettingsRecord } from './contracts.ts';
import { AccountSettingsController } from './controller.ts';
import { AccountSettingsForm } from './account-form.tsx';
import '../staff-settings/staff-settings.css';
type Queries = { readonly list: LatestQuery<AccountSettingsQuery, Awaited<ReturnType<AccountSettingsReader['readList']>>>; readonly detail: LatestQuery<{ readonly id: string }, AccountSettingsRecord | null> };
const empty = Object.freeze({ phase: 'idle' as const, request: null, success: null, error: null });
const noSubscribe = () => () => {};
export function AccountSettingsPage(props: AccountSettingsProps) {
  const [binding, setBinding] = useState<{ readonly scope: AccountSettingsProps['scope']; readonly reader: AccountSettingsReader; readonly queries: Queries } | null>(null);
  useEffect(() => { if (!props.reader || !props.scope.active) { setBinding(null); return; } const reader = props.reader, queries: Queries = { list: new LatestQuery({ scope: props.scope, execute: read => reader.readList(read) }), detail: new LatestQuery({ scope: props.scope, execute: read => reader.readDetail(read) }) }; setBinding({ scope: props.scope, reader, queries }); void queries.list.run(initialAccountSettingsQuery); return () => { queries.list.dispose(); queries.detail.dispose(); }; }, [props.scope, props.reader]);
  const queries = binding?.scope === props.scope && binding.reader === props.reader ? binding.queries : null;
  return <AccountContent key={JSON.stringify([props.scope.identity, props.scope.routeInstanceId])} {...props} queries={queries} />;
}
function AccountContent(props: AccountSettingsProps & { readonly queries: Queries | null }) {
  const { scope, queries } = props, workspace = props.workspace?.matches(scope) ? props.workspace : undefined;
  const list = useSyncExternalStore(queries?.list.subscribe ?? noSubscribe, queries?.list.getSnapshot ?? (() => empty), queries?.list.getSnapshot ?? (() => empty));
  const detail = useSyncExternalStore(queries?.detail.subscribe ?? noSubscribe, queries?.detail.getSnapshot ?? (() => empty), queries?.detail.getSnapshot ?? (() => empty));
  const sessionEditor = useSyncExternalStore(workspace?.subscribe ?? noSubscribe, workspace?.getSnapshot ?? (() => null), workspace?.getSnapshot ?? (() => null));
  const [localEditor, setLocalEditor] = useState<AccountSettingsController | null>(null), [target, setTarget] = useState<{ readonly id: string; readonly intent: Exclude<AccountIntent, 'CREATE'> } | null>(null);
  const [draft, setDraft] = useState({ ...initialAccountSettingsQuery }); const editor = workspace ? sessionEditor : localEditor;
  const editorState = useSyncExternalStore(editor?.subscribe ?? noSubscribe, editor?.getSnapshot ?? (() => null), editor?.getSnapshot ?? (() => null));
  const focus = useDialogFocusReturn(scope, editor !== null || target !== null), refreshed = useRef<string | null>(null);
  useEffect(() => () => localEditor?.dispose(), [localEditor]);
  const active = scope.active && list.phase !== 'disposed', busy = list.phase === 'loading', applied = list.success?.parameters ?? initialAccountSettingsQuery;
  useEffect(() => { const error = list.error ?? detail.error; if (error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) { if (error.kind === 'forbidden' && workspace?.hasUnresolvedWrite()) return; if (error.kind === 'unauthenticated') workspace?.dispose(); if (scope.active) props.onAccessFailure(error.kind); } }, [list.error, detail.error, scope, workspace, props.onAccessFailure]);
  useEffect(() => { if (!target || !props.canPrepare || detail.phase !== 'success' || detail.success?.parameters.id !== target.id) return; const record = detail.success.data; if (record?.id !== target.id) return; if (workspace) workspace.open(record, target.intent); else setLocalEditor(new AccountSettingsController(scope, record, target.intent)); setTarget(null); }, [target, detail, props.canPrepare, scope, workspace]);
  useEffect(() => { const write = editorState?.write; if (queries && write?.phase === 'committed' && write.result && refreshed.current !== write.result.operationId) { refreshed.current = write.result.operationId; void queries.list.run(applied); } }, [queries, editorState?.write, applied]);
  const run = (query: AccountSettingsQuery) => { if (active) void queries?.list.run(query); };
  const close = () => { if (workspace) { if (!workspace.close()) return; } else { localEditor?.dispose(); setLocalEditor(null); } setTarget(null); queries?.detail.cancel(); focus.request(); };
  const open = (row: AccountSettingsRecord, intent: Exclude<AccountIntent, 'CREATE'>, trigger: HTMLElement) => { if (!active || !queries || editor || target) return; focus.capture(trigger); setTarget({ id: row.id, intent }); void queries.detail.run({ id: row.id }); };
  if (!active) return null;
  const blocked = !props.canPrepare || busy || !!editor || !!target || !!props.workspace && !workspace;
  const columns = [
    { title: '所属员工', render: (_: unknown, row: AccountSettingsRecord) => row.staff.name }, { title: '登录账号', dataIndex: 'loginName' },
    { title: '角色', render: (_: unknown, row: AccountSettingsRecord) => props.roles.find(role => role.value === row.staff.role)?.label ?? '未提供' },
    { title: '员工状态', render: (_: unknown, row: AccountSettingsRecord) => <Tag className={`iw-status ${row.staff.employmentStatus === '在职' ? 'normal' : 'off'}`}>{row.staff.employmentStatus || '未提供'}</Tag> },
    { title: '登录权限', render: (_: unknown, row: AccountSettingsRecord) => <Tag className={`iw-status ${row.loginEnabled ? 'normal' : 'off'}`}>{row.loginEnabled ? '已开通' : '已关闭'}</Tag> },
    { title: '操作', width: 210, render: (_: unknown, row: AccountSettingsRecord) => <div className="bs-row-actions">{(['EDIT', row.loginEnabled ? 'DISABLE' : 'RESTORE', 'RESET_PASSWORD'] as const).map(intent => <Button key={intent} type="text" size="small" disabled={blocked} onClick={event => { if (event.currentTarget instanceof HTMLElement) open(row, intent, event.currentTarget); }}>{intent === 'EDIT' ? '编辑' : intent === 'DISABLE' ? '禁用' : intent === 'RESTORE' ? '启用' : '重置密码'}</Button>)}</div> },
  ];
  return <section className="demo-settings-workbench store-settings-workbench staff-settings-workbench bs-page iw-workbench iw-arco-controls" aria-label="登录账号">
    <header className="bs-head iw-head"><h1>登录账号</h1><div className="bs-head-actions"><Button type="primary" disabled={blocked || !props.staffReader} onClick={event => { if (!active) return; if (event.currentTarget instanceof HTMLElement) focus.capture(event.currentTarget); if (workspace) workspace.open(null); else setLocalEditor(new AccountSettingsController(scope, null)); }}>新增账号</Button></div></header>
    <form className="bs-toolbar" role="search" onSubmit={event => { event.preventDefault(); run({ ...draft, page: 1, pageSize: applied.pageSize }); }}><div className="bs-filter-fields">
      <div className="bs-filter search"><Input className="iw-arco-input iw-search-input" aria-label="搜索登录账号" placeholder="搜索登录账号" maxLength={200} value={draft.search} onChange={search => setDraft(value => ({ ...value, search }))} suffix={<IconSearch />} allowClear /></div>
      <div className="bs-filter"><DemoSettingsSingleSelect scope={scope} label="登录权限筛选" placeholder="全部登录权限" value={draft.status} options={[{ value: 'all', label: '全部登录权限' }, { value: 'normal', label: '已开通' }, { value: 'disabled', label: '已关闭' }]} onChange={status => setDraft(value => ({ ...value, status: status as AccountSettingsQuery['status'] }))} /></div>
    </div><div className="bs-toolbar-actions iw-query-actions"><Button className="btn primary" type="primary" htmlType="submit" disabled={!queries || busy}>查询</Button><Button className="btn iw-reset" disabled={!queries || busy} onClick={() => { const reset = { ...initialAccountSettingsQuery, pageSize: applied.pageSize }; setDraft(reset); run(reset); }}>重置</Button></div></form>
    {!queries && <p className="staff-empty-state" role="status">账号资料读取暂未开放。</p>}{busy && <p role="status" className="settings-note">正在读取账号资料…</p>}
    {list.phase === 'error' && <p role="alert" className="settings-note">账号资料读取失败。<Button onClick={() => run(list.request?.parameters ?? applied)}>重试</Button></p>}
    {list.success && list.phase !== 'success' && <p className="settings-note">下方为上次成功读取的结果。</p>}
    <div className="bs-table-wrap iw-arco-table" aria-busy={busy}><Table size="small" rowKey="id" columns={columns} data={list.success ? [...list.success.data.items] : []} pagination={false} noDataElement={<Empty description={list.success ? '暂无符合条件的数据' : '尚未读到资料'} />} /></div>
    <DemoSettingsPager label="登录账号列表分页" scope={scope} page={applied.page} size={applied.pageSize} total={list.success?.data.total ?? null} busy={busy} onPage={page => run({ ...applied, page })} onSize={pageSize => run({ ...applied, page: 1, pageSize })} />
    {editor && <AccountSettingsForm {...props} controller={editor} close={close} />}
    {target && !editor && <Modal className="bs-modal demo-settings-modal iw-arco-modal iw-arco-controls" autoFocus={false} focusLock visible title="读取账号资料" maskClosable={false} onCancel={close} okText="确定" cancelText="取消" okButtonProps={{ disabled: true }}><p role="status">{detail.phase === 'loading' ? '正在读取当前资料…' : detail.phase === 'success' ? '账号不存在或不可访问。' : '账号读取失败。'}</p>{detail.phase === 'error' && <Button onClick={() => { void queries?.detail.run({ id: target.id }); }}>重试读取</Button>}</Modal>}
  </section>;
}
