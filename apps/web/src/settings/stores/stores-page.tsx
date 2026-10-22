import { SettingsAuditEntry } from '../audit/audit-entry.tsx';
import { StoreCommandForm } from './maintenance-form.tsx';
import { StoreMaintenanceHost } from './maintenance-host.tsx';
import { UIButton } from '../../components/standard-controls.tsx';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useDialogFocusReturn } from '../../components/use-dialog-focus-return.ts';
import type { ReadScope } from '../../loading/read-scope.ts';
import type { StoreSettingsKind, StoreSettingsListQuery, StoreSettingsPageProps } from './contracts.ts';
import { initialStoreSettingsQuery, StoreSettingsReadController } from './controller.ts';
import { StoreSettingsReadState } from './read-state.tsx';
import { storeSettingsReferenceLabel } from './detail-modal.tsx';
import { DemoStoreView } from './demo-store-view.tsx';
import './source-store-settings.css';

const noEditors = Object.freeze({ stores: null, warehouses: null });
const noSubscribe = () => () => {};
interface StoreQueryUi {
  draft: StoreSettingsListQuery; applied: StoreSettingsListQuery;
  hallSelection: { id: string; name: string } | null;
}
interface StoreRouteUi {
  readonly reader: StoreSettingsPageProps['reader'];
  readonly workspace: import('./maintenance-controller.ts').StoreMaintenanceWorkspace | undefined;
  readonly tabs: Record<StoreSettingsKind, StoreQueryUi>;
}
// Query controls only: two tabs per explicit route scope, never rows/results,
// permissions, commands or credentials. Read-only keyed mounts share the same
// route UI; every return still creates a new read owner and fresh native query.
const routeQueryUi = new WeakMap<ReadScope, StoreRouteUi>();
function queryUi(props: StoreSettingsPageProps, kind: StoreSettingsKind): StoreQueryUi {
  let state = routeQueryUi.get(props.scope);
  if (!state || state.reader !== props.reader || state.workspace !== props.maintenance?.workspace) {
    const empty = (): StoreQueryUi => ({ draft: { ...initialStoreSettingsQuery }, applied: { ...initialStoreSettingsQuery }, hallSelection: null });
    state = { reader: props.reader, workspace: props.maintenance?.workspace, tabs: { stores: empty(), warehouses: empty() } };
    routeQueryUi.set(props.scope, state);
    props.scope.signal.addEventListener('abort', () => routeQueryUi.delete(props.scope), { once: true });
  }
  return state.tabs[kind];
}
export function StoresPage(props: StoreSettingsPageProps) { return <StoreSettingsPage {...props} kind="stores" />; }
export function StoreSettingsPage(props: StoreSettingsPageProps & { readonly kind: StoreSettingsKind }) {
  const ui = queryUi(props, props.kind);
  const [owner, setOwner] = useState<StoreSettingsReadController | null>(null);
  useEffect(() => {
    const controller = new StoreSettingsReadController(props, props.kind); setOwner(controller);
    queueMicrotask(() => { if (controller.scope.active) void controller.queryList(ui.applied); });
    return () => controller.dispose();
  }, [props.scope, props.reader, props.kind, props.onAccessFailure, props.allowHallDirectoryRead, props.maintenance?.workspace]);
  return owner && owner.props.scope === props.scope && owner.props.reader === props.reader && owner.kind === props.kind && owner.props.onAccessFailure === props.onAccessFailure && owner.props.allowHallDirectoryRead === props.allowHallDirectoryRead && owner.props.maintenance?.workspace === props.maintenance?.workspace ? <StoreSettingsContent key={owner.scope.routeInstanceId} {...props} controller={owner} ui={ui} /> : null;
}
function StoreSettingsContent(props: StoreSettingsPageProps & { readonly kind: StoreSettingsKind; readonly controller: StoreSettingsReadController; readonly ui: StoreQueryUi }) {
  const { controller } = props, { list, scope } = controller, snapshot = useSyncExternalStore(list.subscribe, list.getSnapshot, list.getSnapshot), hallSnapshot = useSyncExternalStore(controller.hallDirectory.subscribe, controller.hallDirectory.getSnapshot, controller.hallDirectory.getSnapshot);
  const [draft, setDraftState] = useState<StoreSettingsListQuery>(() => ({ ...props.ui.draft })), [hallSelection, setHallSelectionState] = useState(props.ui.hallSelection);
  const setDraft = (next: StoreSettingsListQuery | ((value: StoreSettingsListQuery) => StoreSettingsListQuery)) => {
    const exact = typeof next === 'function' ? next(draft) : next; props.ui.draft = exact; setDraftState(exact);
  };
  const setHallSelection = (next: { id: string; name: string } | null) => { props.ui.hallSelection = next; setHallSelectionState(next); };
  const [editTarget, setEditTarget] = useState<{ id: string | null } | null>(null);
  const workspace = props.maintenance?.workspace?.matches(props.scope) ? props.maintenance.workspace : null;
  const editors = useSyncExternalStore(workspace?.subscribe ?? noSubscribe, workspace?.getSnapshot ?? (() => noEditors), workspace?.getSnapshot ?? (() => noEditors));
  const editor = workspace ? editors[props.kind] : null;
  const write = useSyncExternalStore(editor?.subscribe ?? noSubscribe, editor?.getSnapshot ?? (() => null), editor?.getSnapshot ?? (() => null))?.write;
  const refreshed = useRef<string | null>(null);

  const focus = useDialogFocusReturn(scope, editTarget !== null || editor !== null), label = props.kind === 'stores' ? '营业厅' : '仓库';
  const success = snapshot.success, result = success?.data, displayed = success?.parameters ?? props.ui.applied, busy = snapshot.phase === 'loading';
  const run = (parameters: StoreSettingsListQuery) => { if (scope.active) { props.ui.applied = { ...parameters }; void controller.queryList(parameters); } };
  const retry = () => run(snapshot.request?.parameters ?? { ...draft, page: 1 });
  useEffect(() => {
    if (scope.active && write?.phase === 'committed' && write.result && refreshed.current !== write.result.operationId) {
      refreshed.current = write.result.operationId; props.ui.applied = { ...displayed }; void controller.queryList(displayed);
    }
  }, [controller, scope, write, displayed]);
  const closeEditor = () => { if (workspace && !workspace.close(props.kind)) return; setEditTarget(null); focus.request(); };
  const commandForm = editor && <StoreCommandForm scope={props.scope} kind={props.kind} record={editor.record} controller={editor} directory={props.maintenance?.directory} close={closeEditor} />;
  const editBlocked = !!editor || !!editTarget || !!props.maintenance?.workspace && !workspace;
  const changeTab = (kind: StoreSettingsKind) => {
    if (!scope.active || kind === props.kind || editTarget) return;
    if (editor && !editor.requestClose()) return;
    if (workspace) workspace.close(props.kind);
    props.onTab?.(kind);
  };
  const state = <StoreSettingsReadState snapshot={snapshot} accessFailure={controller.accessFailure} retry={retry} cancel={() => list.cancel()} />;
  if (snapshot.phase === 'disposed') return <section className="store-settings-workbench">{state}{commandForm}</section>;
  const hallRead = hallSnapshot.success, hallOptions = (hallRead?.data.items ?? []).map(item => ({ value: item.id, label: item.name }));
  if (hallSelection && !hallOptions.some(option => option.value === hallSelection.id)) hallOptions.push({ value: hallSelection.id, label: hallSelection.name });
  const halls = (search = '', page = 1) => { if (scope.active) void controller.queryHalls({ ...initialStoreSettingsQuery, status: 'all', search, page }); };
  const maintenanceTitle = workspace?.writesEnabled() ? '维护资料' : props.maintenance ? '可填写表单；此版本暂未开放保存' : `${label}维护暂未接入`;
  const staleState = success && (busy || snapshot.phase === 'error' || draft.search !== displayed.search || draft.status !== displayed.status || draft.hallId !== displayed.hallId)
    ? <p className="settings-note" role="status">下方仍为上次成功读取的资料（搜索：{displayed.search || '全部'}；状态：{displayed.status === 'normal' ? '正常' : displayed.status === 'disabled' ? '已停用' : '全部'}；第{displayed.page}页），不是待查条件的新结果。</p> : null;
  return <DemoStoreView scope={scope} kind={props.kind} draft={draft} displayed={displayed} result={result ?? null} busy={busy}
    emptyText={!result ? busy ? '正在读取资料' : snapshot.phase === 'error' ? '当前查询失败' : '等待查询' : result.total ? '此页没有数据，请返回有效页' : '暂无符合条件的数据'}
    allowedTabs={props.allowedTabs} focusTab={props.focusTab} onTab={props.onTab ? changeTab : undefined}
    createDisabled={!props.maintenance || editBlocked} editDisabled={!props.maintenance || busy || editBlocked} maintenanceTitle={maintenanceTitle}
    onCreate={button => { if (scope.active && props.maintenance) { focus.capture(button); if (workspace) workspace.open(props.kind, null); else setEditTarget({ id: null }); } }}
    onEdit={(row, button) => { if (scope.active && props.maintenance) { focus.capture(button); setEditTarget({ id: row.id }); } }}
    onDraft={patch => setDraft(value => ({ ...value, ...patch }))}
    onQuery={() => run({ ...draft, page: 1, pageSize: displayed.pageSize })}
    onReset={() => { const reset = { ...initialStoreSettingsQuery, pageSize: displayed.pageSize }; setDraft(reset); setHallSelection(null); run(reset); }}
    onPage={page => run({ ...displayed, page })} onPageSize={pageSize => run({ ...displayed, page: 1, pageSize })}
    referenceLabel={storeSettingsReferenceLabel} readState={state} staleState={staleState}
    audit={<SettingsAuditEntry scope={props.scope} {...(props.audit ? { capability: props.audit } : {})} onAccessFailure={props.onAccessFailure} localHasUnresolvedWrite={() => props.maintenance?.workspace?.hasUnresolvedWrite() ?? false} />}
    halls={{ enabled: !!props.allowHallDirectoryRead, loading: hallSnapshot.phase === 'loading', options: hallOptions, onOpen: () => halls(), onSearch: search => halls(search),
      onChange: value => { const item = hallOptions.find(option => option.value === value); setHallSelection(value && item ? { id: value, name: item.label } : null); setDraft(previous => ({ ...previous, hallId: value || null })); },
      footer: <div className="settings-directory-footer"><StoreSettingsReadState snapshot={hallSnapshot} accessFailure={controller.accessFailure} retry={() => halls(hallSnapshot.request?.parameters.search ?? '', hallSnapshot.request?.parameters.page ?? 1)} cancel={() => controller.hallDirectory.cancel()} />
        {hallRead && <><span>目录共{hallRead.data.total}个，第{hallRead.parameters.page}页（仅显示本页）</span><UIButton type="button" disabled={hallSnapshot.phase === 'loading' || hallRead.parameters.page <= 1} onClick={() => halls(hallRead.parameters.search, hallRead.parameters.page - 1)}>上一页</UIButton><UIButton type="button" disabled={hallSnapshot.phase === 'loading' || hallRead.parameters.page * hallRead.parameters.pageSize >= hallRead.data.total} onClick={() => halls(hallRead.parameters.search, hallRead.parameters.page + 1)}>下一页</UIButton></>}
      </div> }}>
    {editTarget && <StoreMaintenanceHost key={editTarget.id ?? 'new'} {...props} scope={props.scope} kind={props.kind} targetId={editTarget.id} onPrepared={() => setEditTarget(null)} close={() => { setEditTarget(null); focus.request(); }} />}
    {commandForm}
  </DemoStoreView>;
}
