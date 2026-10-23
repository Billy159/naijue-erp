import { Button, Empty, Input, Modal, Table, Tag } from '@arco-design/web-react';
import { IconSearch } from '@arco-design/web-react/icon';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LatestQuery } from '../loading/latest-query.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { DemoSettingsPager, DemoSettingsSingleSelect } from '../settings/demo-settings-controls.tsx';
import { useDialogFocusReturn } from '../components/use-dialog-focus-return.ts';
import { initialAccountSettingsQuery, type AccountIntent, type AccountSettingsProps, type AccountSettingsQuery, type AccountSettingsReader, type AccountSettingsRecord } from './contracts.ts';
import { createAccountSettingsViewState, AccountSettingsController, type AccountSettingsViewState } from './controller.ts';
import { AccountSettingsForm } from './account-form.tsx';
import '../staff-settings/staff-settings.css';
type Queries = { readonly list: LatestQuery<AccountSettingsQuery, Awaited<ReturnType<AccountSettingsReader['readList']>>>; readonly detail: LatestQuery<{ readonly id: string }, AccountSettingsRecord | null> };
const empty = Object.freeze({ phase: 'idle' as const, request: null, success: null, error: null });
const noSubscribe = () => () => {};
export function AccountSettingsPage(props: AccountSettingsProps) {
  const owner = props.workspace?.matches(props.scope) ? props.workspace : null;
  const viewBinding = useRef<{ readonly scope: AccountSettingsProps['scope']; readonly owner: typeof owner; readonly view: AccountSettingsViewState } | null>(null);
  if (!viewBinding.current || viewBinding.current.scope !== props.scope || viewBinding.current.owner !== owner) viewBinding.current = { scope: props.scope, owner, view: owner?.getViewState() ?? createAccountSettingsViewState() };
  const view = viewBinding.current.view;
  const [binding, setBinding] = useState<{ readonly scope: AccountSettingsProps['scope']; readonly reader: AccountSettingsReader; readonly view: AccountSettingsViewState; readonly queries: Queries } | null>(null);
  useEffect(() => { if (!props.reader || !props.scope.active) { setBinding(null); return; } const reader = props.reader, queries: Queries = { list: new LatestQuery({ scope: props.scope, execute: read => reader.readList(read) }), detail: new LatestQuery({ scope: props.scope, execute: read => reader.readDetail(read) }) }; setBinding({ scope: props.scope, reader, view, queries }); void queries.list.run(view.executed); return () => { queries.list.dispose(); queries.detail.dispose(); }; }, [props.scope, props.reader, view]);
  const queries = binding?.scope === props.scope && binding.reader === props.reader && binding.view === view ? binding.queries : null;
  return <AccountContent key={JSON.stringify([props.scope.identity, props.scope.routeInstanceId])} {...props} queries={queries} view={view} />;
}
function AccountContent(props: AccountSettingsProps & { readonly queries: Queries | null; readonly view: AccountSettingsViewState }) {
  const { scope, queries } = props, workspace = props.workspace?.matches(scope) ? props.workspace : undefined;
  const list = useSyncExternalStore(queries?.list.subscribe ?? noSubscribe, queries?.list.getSnapshot ?? (() => empty), queries?.list.getSnapshot ?? (() => empty));
  const detail = useSyncExternalStore(queries?.detail.subscribe ?? noSubscribe, queries?.detail.getSnapshot ?? (() => empty), queries?.detail.getSnapshot ?? (() => empty));
  const sessionEditor = useSyncExternalStore(workspace?.subscribe ?? noSubscribe, workspace?.getSnapshot ?? (() => null), workspace?.getSnapshot ?? (() => null));
  const [localEditor, setLocalEditor] = useState<AccountSettingsController | null>(null), [target, setTarget] = useState<{ readonly id: string; readonly intent: Exclude<AccountIntent, 'CREATE'> } | null>(null);
  const { view } = props, draft = view.draft;
  const [, refresh] = useState(0);
  const setDraft = (change: (current: AccountSettingsQuery) => AccountSettingsQuery) => { if (scope.active) { view.draft = change(view.draft); refresh(value => value + 1); } };
  const editor = workspace ? sessionEditor : localEditor;
  const editorState = useSyncExternalStore(editor?.subscribe ?? noSubscribe, editor?.getSnapshot ?? (() => null), editor?.getSnapshot ?? (() => null));
  const focus = useDialogFocusReturn(scope, editor !== null || target !== null), refreshed = useRef<string | null>(null);
  useEffect(() => () => localEditor?.dispose(), [localEditor]);
  const active = scope.active && list.phase !== 'disposed', busy = list.phase === 'loading', applied = list.success?.parameters ?? view.executed;
  useEffect(() => { const error = list.error ?? detail.error; if (error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) { if (error.kind === 'forbidden' && workspace?.hasUnresolvedWrite()) return; if (error.kind === 'unauthenticated') workspace?.dispose(); if (scope.active) props.onAccessFailure(error.kind); } }, [list.error, detail.error, scope, workspace, props.onAccessFailure]);
  useEffect(() => { if (!target || !props.canPrepare || detail.phase !== 'success' || detail.success?.parameters.id !== target.id) return; const record = detail.success.data; if (record?.id !== target.id) return; if (workspace) workspace.open(record, target.intent); else setLocalEditor(new AccountSettingsController(scope, record, target.intent)); setTarget(null); }, [target, detail, props.canPrepare, scope, workspace]);
  useEffect(() => { const write = editorState?.write; if (queries && write?.phase === 'committed' && write.result && refreshed.current !== write.result.operationId) { refreshed.current = write.result.operationId; void queries.list.run(applied); } }, [queries, editorState?.write, applied]);
  const run = (query: AccountSettingsQuery) => { if (active && queries) { view.executed = query; void queries.list.run(query); } };
  const close = () => { if (workspace) { if (!workspace.close()) return; } else { localEditor?.dispose(); setLocalEditor(null); } setTarget(null); queries?.detail.cancel(); focus.request(); };
  const open = (row: AccountSettingsRecord, intent: Exclude<AccountIntent, 'CREATE'>, trigger: HTMLElement) => { if (!active || !queries || editor || target) return; focus.capture(trigger); setTarget({ id: row.id, intent }); void queries.detail.run({ id: row.id }); };
  const table = useRef<HTMLDivElement>(null), scrollReady = useRef(false), result = list.success?.data;
  useLayoutEffect(() => {
    scrollReady.current = false;
    if (!table.current || !active || !result) return;
    table.current.scrollTop = view.tableScroll.top; table.current.scrollLeft = view.tableScroll.left;
    view.tableScroll.top = table.current.scrollTop; view.tableScroll.left = table.current.scrollLeft; scrollReady.current = true;
  }, [scope, active, result, view]);
  if (!active) return null;
  const blocked = !props.canPrepare || busy || !!editor || !!target || !!props.workspace && !workspace;
  const columns = [
    { title: '所属员工', render: (_: unknown, row: AccountSettingsRecord) => row.staff.name }, { title: '登录账号', dataIndex: 'loginName' },
    { title: '角色', render: (_: unknown, row: AccountSettingsRecord) => props.roles.find(role => role.value === row.staff.role)?.label ?? '未提供' },
    { title: '员工状态', render: (_: unknown, row: AccountSettingsRecord) => <Tag className={`iw-status ${row.staff.employmentStatus === '在职' ? 'normal' : 'off'}`}>{row.staff.employmentStatus || '未提供'}</Tag> },
    { title: '登录权限', render: (_: unknown, row: AccountSettingsRecord) => <Tag className={`iw-status ${row.loginEnabled ? 'normal' : 'off'}`}>{row.loginEnabled ? '已开通' : '已关闭'}</Tag> },
    { title: '操作', width: 210, render: (_: unknown, row: AccountSettingsRecord) => <div className="bs-row-actions">{(['EDIT', row.loginEnabled ? 'DISABLE' : 'RESTORE', 'RESET_PASSWORD'] as const).map(intent => <Button key={intent} type="text" size="small" disabled={blocked} onClick={event => { if (event.currentTarget instanceof HTMLElement) open(row, intent, event.currentTarget); }}>{intent === 'EDIT' ? '编辑' : intent === 'DISABLE' ? '禁用' : intent === 'RESTORE' ? '启用' : '重置密码'}</Button>)}</div> },
  ];
  return <section className="demo-settings-workbench account-settings-workbench bs-page iw-workbench iw-arco-controls" aria-label="登录账号">
    <header className="bs-head iw-head"><h1>登录账号</h1><div className="bs-head-actions"><Button type="primary" disabled={blocked || !props.staffReader} onClick={event => { if (!active) return; if (event.currentTarget instanceof HTMLElement) focus.capture(event.currentTarget); if (workspace) workspace.open(null); else setLocalEditor(new AccountSettingsController(scope, null)); }}>新增账号</Button></div></header>
    <Filters {...props} filter={draft} busy={busy} ready={queries !== null} onDraft={patch => setDraft(value => ({ ...value, ...patch }))}
      apply={() => run({ ...draft, page: 1, pageSize: applied.pageSize })}
      reset={() => { const reset = { ...initialAccountSettingsQuery, pageSize: applied.pageSize }; setDraft(() => reset); run(reset); }} />
    {!queries && <p className="staff-empty-state" role="status">账号资料读取暂未开放。</p>}{busy && <p role="status" className="settings-note">正在读取账号资料…</p>}
    {list.phase === 'error' && <p role="alert" className="settings-note">账号资料读取失败。<Button onClick={() => run(list.request?.parameters ?? applied)}>重试</Button></p>}
    {list.success && list.phase !== 'success' && <p className="settings-note">下方为上次成功读取的结果。</p>}
    <div ref={table} className="bs-table-wrap iw-arco-table" aria-busy={busy} onScroll={event => { if (scrollReady.current && active && result) { view.tableScroll.top = event.currentTarget.scrollTop; view.tableScroll.left = event.currentTarget.scrollLeft; } }}><Table size="small" rowKey="id" columns={columns} data={list.success ? [...list.success.data.items] : []} pagination={false} noDataElement={<Empty description={list.success ? '暂无符合条件的数据' : '尚未读到资料'} />} /></div>
    <DemoSettingsPager label="登录账号列表分页" scope={scope} page={applied.page} size={applied.pageSize} total={list.success?.data.total ?? null} busy={busy} onPage={page => run({ ...applied, page })} onSize={pageSize => run({ ...applied, page: 1, pageSize })} />
    {editor && <AccountSettingsForm {...props} controller={editor} close={close} />}
    {target && !editor && <Modal className="demo-ui bs-modal demo-settings-modal account-settings-modal iw-arco-modal iw-arco-controls" autoFocus={false} focusLock visible title="读取账号资料" maskClosable={false} onCancel={close} okText="确定" cancelText="取消" okButtonProps={{ disabled: true }}><p role="status">{detail.phase === 'loading' ? '正在读取当前资料…' : detail.phase === 'success' ? '账号不存在或不可访问。' : '账号读取失败。'}</p>{detail.phase === 'error' && <Button onClick={() => { void queries?.detail.run({ id: target.id }); }}>重试读取</Button>}</Modal>}
  </section>;
}

// Same frozen Filters carrier for the approved standalone account extension.
function Filters(props: AccountSettingsProps & { readonly filter: AccountSettingsQuery; readonly busy: boolean; readonly ready: boolean; readonly onDraft: (patch: Partial<AccountSettingsQuery>) => void; readonly apply: () => void; readonly reset: () => void }) {
  const filter = props.filter, fields = [], apply = () => { if (props.ready && !props.busy) props.apply(); };
  fields.push(<div className="bs-filter search" key="q"><Input className="iw-arco-input iw-search-input" size="default" aria-label="搜索登录账号" value={filter.search} onChange={search => props.onDraft({ search })} placeholder="搜索登录账号" suffix={<IconSearch />} allowClear maxLength={200} onPressEnter={apply} /></div>);
  fields.push(<div className="bs-filter" key="status"><DemoSettingsSingleSelect scope={props.scope} label="登录权限筛选" placeholder="全部登录权限" value={filter.status} options={[{ label: '全部登录权限', value: 'all' }, { label: '已开通', value: 'normal' }, { label: '已关闭', value: 'disabled' }]} onChange={status => props.onDraft({ status: status as AccountSettingsQuery['status'] })} /></div>);
  return <div className="bs-toolbar"><div className="bs-filter-fields">{fields}</div><div className="bs-toolbar-actions iw-query-actions"><Button className="btn primary" type="primary" onClick={apply} disabled={!props.ready || props.busy}>查询</Button><Button className="btn iw-reset" onClick={props.reset} disabled={!props.ready || props.busy}>重置</Button></div></div>;
}
