import { Button, Modal } from '@arco-design/web-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LatestQuery } from '../../loading/latest-query.ts';
import { AsyncLeafRegistry } from '../../loading/async-leaf-registry.ts';
import { HttpQueryError } from '../../transport/http-query.ts';
import type { StoreSettingsDetail, StoreSettingsDetailQuery, StoreSettingsKind, StoreSettingsPageProps } from './contracts.ts';
import type { SettingsDirectoryReader, StoreMaintenanceFormProps } from './maintenance-contracts.ts';
import type { StoreMaintenanceController, StoreMaintenanceWorkspace } from './maintenance-controller.ts';
import { StoreSettingsPage } from './stores-page.tsx';

const maintenanceForms = new AsyncLeafRegistry({ 'store-maintenance': { load: () => import('./maintenance-form.tsx') } }, { maxRetainedEntries: 1 });
type StoreFormViews = Awaited<ReturnType<typeof maintenanceForms.load<'store-maintenance'>>>;
const noSubscribe = () => () => {};
const noEditor = Object.freeze({ disposed: false, closePrompt: false });
type StoreFormViewProps = StoreMaintenanceFormProps & { readonly controller?: StoreMaintenanceController };
function useStoreMaintenanceModule(scope: StoreFormViewProps['scope'], active = true) {
  const [binding, setBinding] = useState<{ readonly scope: StoreFormViewProps['scope']; readonly views: StoreFormViews } | null>(null);
  const [failed, setFailed] = useState(false), [attempt, retry] = useState(0);
  useEffect(() => {
    let current = true;
    if (!scope.active || !active) return;
    setFailed(false);
    void maintenanceForms.load('store-maintenance', scope).then(views => {
      if (current && scope.active) setBinding({ scope, views });
    }, () => { if (current && scope.active) setFailed(true); });
    return () => { current = false; };
  }, [scope, active, attempt]);
  return { views: active && binding?.scope === scope ? binding.views : null, failed, retry: () => retry(value => value + 1) };
}
/** Code-only loading; a command draft remains with its authenticated workspace. */
export function StoreMaintenanceFormView(props: StoreFormViewProps) {
  const { scope, controller } = props, forms = useStoreMaintenanceModule(scope);
  const state = useSyncExternalStore<{ readonly disposed: boolean; readonly closePrompt: boolean }>(controller?.subscribe ?? noSubscribe, controller?.getSnapshot ?? (() => noEditor), controller?.getSnapshot ?? (() => noEditor));
  if (!scope.active || state.disposed) return null;
  const views = forms.views;
  if (views) return controller ? <views.StoreCommandForm {...props} controller={controller} /> : <views.StoreMaintenanceForm {...props} />;
  return <StoreFormPreparation {...props} failed={forms.failed} retry={forms.retry} />;
}
function StoreFormPreparation(props: StoreFormViewProps & { readonly failed: boolean; readonly retry: () => void }) {
  const controller = props.controller;
  const state = useSyncExternalStore<{ readonly disposed: boolean; readonly closePrompt: boolean }>(controller?.subscribe ?? noSubscribe, controller?.getSnapshot ?? (() => noEditor), controller?.getSnapshot ?? (() => noEditor));
  if (!props.scope.active || state.disposed) return null;
  return <Modal className="demo-ui bs-modal demo-store-modal iw-arco-modal iw-arco-controls" visible title={`${props.record ? '编辑' : '新增'}${props.kind === 'stores' ? '营业厅' : '仓库'}`}
    maskClosable={false} autoFocus={false} focusLock okText="确定" cancelText="取消" okButtonProps={{ disabled: true }} onCancel={() => { if (!controller || controller.requestClose()) props.close(); }}>
    {props.failed ? <p className="settings-note" role="alert">维护表单暂未加载。<Button onClick={props.retry}>重试加载表单</Button></p> : <p className="settings-note" role="status">正在准备维护表单…</p>}
    {controller && state.closePrompt && <section className="settings-close-prompt" role="alert"><strong>放弃本次填写？</strong><p>关闭后将清除本次未保存的内容。</p><div className="bs-row-actions">
      <Button onClick={() => controller.keepEditing()}>继续填写</Button><Button onClick={() => { if (controller.discard()) props.close(); }}>放弃本次填写</Button>
    </div></section>}
  </Modal>;
}

/** Optional authenticated-session workspace; without it the original preparation remains read-only. */
export function StoreSettingsMaintenanceHost(props: StoreSettingsPageProps & {
  readonly allowedTabs: readonly StoreSettingsKind[]; readonly initialTab: StoreSettingsKind;
  readonly directory?: SettingsDirectoryReader; readonly workspace?: StoreMaintenanceWorkspace;
}) {
  const [tab, setTab] = useState(() => {
    const workspace = props.workspace ?? props.maintenance?.workspace;
    if (!workspace?.matches(props.scope)) return props.initialTab;
    const editors = workspace.getSnapshot(), view = workspace.getViewState(props.initialTab);
    return props.allowedTabs.find(kind => editors[kind]?.hasUnresolvedWrite)
      ?? props.allowedTabs.find(kind => editors[kind]?.getSnapshot().dirty)
      ?? (view && props.allowedTabs.includes(view.tab) ? view.tab : props.initialTab);
  }), focusTab = useRef(false);
  if (!props.allowedTabs.includes(props.initialTab)) throw new TypeError('Initial settings tab must be explicitly allowed');
  return <StoreSettingsPage {...props} kind={tab} focusTab={focusTab.current} maintenance={{ ...props.maintenance, ...(props.directory ? { directory: props.directory } : {}), ...(props.workspace ? { workspace: props.workspace } : {}) }} onTab={next => { if (props.scope.active && props.allowedTabs.includes(next)) {
    const workspace = props.workspace ?? props.maintenance?.workspace;
    const view = workspace?.matches(props.scope) ? workspace.getViewState(props.initialTab) : null;
    if (view) view.tab = next;
    focusTab.current = true; setTab(next);
  } }} />;
}
export function StoreMaintenanceHost(props: StoreSettingsPageProps & {
  readonly kind: StoreSettingsKind; readonly targetId: string | null; readonly close: () => void; readonly onPrepared?: () => void;
}) {
  // Both are required by the explicit edit action, with no data dependency.
  const forms = useStoreMaintenanceModule(props.scope, props.targetId !== null);
  const [binding, setBinding] = useState<{ readonly scope: StoreSettingsPageProps['scope']; readonly reader: StoreSettingsPageProps['reader']; readonly kind: StoreSettingsKind; readonly targetId: string; readonly query: LatestQuery<StoreSettingsDetailQuery, StoreSettingsDetail> } | null>(null);
  useEffect(() => {
    if (props.targetId === null || !props.scope.active) return;
    const next = new LatestQuery<StoreSettingsDetailQuery, StoreSettingsDetail>({ scope: props.scope, execute: read => props.reader.readDetail(props.kind, read) });
    setBinding({ scope: props.scope, reader: props.reader, kind: props.kind, targetId: props.targetId, query: next }); void next.run({ id: props.targetId }); return () => next.dispose();
  }, [props.scope, props.reader, props.kind, props.targetId]);
  if (!props.scope.active) return null;
  if (props.targetId === null) return <StoreMaintenanceFormView scope={props.scope} kind={props.kind} record={null} directory={props.maintenance?.directory} close={props.close} />;
  const query = binding?.scope === props.scope && binding.reader === props.reader && binding.kind === props.kind && binding.targetId === props.targetId ? binding.query : null;
  return query ? <ExistingStorePreparation {...props} query={query} forms={forms} /> : <StoreReadPreparation kind={props.kind} close={props.close} loading />;
}
function ExistingStorePreparation(props: Parameters<typeof StoreMaintenanceHost>[0] & { readonly query: LatestQuery<StoreSettingsDetailQuery, StoreSettingsDetail>; readonly forms: ReturnType<typeof useStoreMaintenanceModule> }) {
  const snapshot = useSyncExternalStore(props.query.subscribe, props.query.getSnapshot, props.query.getSnapshot);
  useEffect(() => {
    const workspace = props.maintenance?.workspace;
    if (snapshot.error instanceof HttpQueryError && snapshot.error.kind === 'forbidden' && workspace?.matches(props.scope) && workspace.hasUnresolvedWrite()) return;
    if (snapshot.error instanceof HttpQueryError && snapshot.error.kind === 'unauthenticated' && workspace?.matches(props.scope)) workspace.dispose();
    if (snapshot.phase === 'error' && props.scope.active && snapshot.error instanceof HttpQueryError && (snapshot.error.kind === 'unauthenticated' || snapshot.error.kind === 'forbidden')) props.onAccessFailure(snapshot.error.kind);
  }, [snapshot, props.scope, props.onAccessFailure, props.maintenance?.workspace]);
  if (snapshot.phase === 'disposed' || !props.scope.active) return null;
  const item = snapshot.phase === 'success' && snapshot.success?.parameters.id === props.targetId ? snapshot.success.data.item : null;
  if (item && item.kind === props.kind && item.id === props.targetId && !props.forms.views) return <StoreFormPreparation scope={props.scope} kind={props.kind} record={item} directory={props.maintenance?.directory} close={props.close} failed={props.forms.failed} retry={props.forms.retry} />;
  if (item && item.kind === props.kind && item.id === props.targetId && props.maintenance?.workspace) return <PrepareStoreCommand {...props} item={item} />;
  if (item && item.kind === props.kind && item.id === props.targetId && props.forms.views) return <props.forms.views.StoreMaintenanceForm scope={props.scope} kind={props.kind} record={item} directory={props.maintenance?.directory} close={props.close} />;
  return <StoreReadPreparation kind={props.kind} close={props.close} loading={snapshot.phase === 'loading'} missing={snapshot.phase === 'success'}
    {...(snapshot.phase === 'error' ? { retry: () => { if (props.targetId && props.scope.active) void props.query.run({ id: props.targetId }); } } : {})} />;
}
function StoreReadPreparation(props: { readonly kind: StoreSettingsKind; readonly close: () => void; readonly loading?: boolean; readonly missing?: boolean; readonly retry?: () => void }) {
  return <Modal className="demo-ui bs-modal demo-store-modal iw-arco-modal iw-arco-controls" autoFocus={false} focusLock visible title={`编辑${props.kind === 'stores' ? '营业厅' : '仓库'}`} maskClosable={false} okText="确定" cancelText="取消" okButtonProps={{ disabled: true }} onCancel={props.close}>
    <p role="status">{props.loading ? '正在读取当前资料…' : props.missing ? '记录不存在或不可访问。' : '当前资料读取失败，暂不能编辑。'}</p>
    {props.retry && <Button onClick={props.retry}>重试读取</Button>}
  </Modal>;
}

function PrepareStoreCommand(props: Parameters<typeof ExistingStorePreparation>[0] & { readonly item: import('./contracts.ts').StoreSettingsEntry }) {
  const prepared = useRef(false), workspace = props.maintenance?.workspace;
  useEffect(() => {
    if (prepared.current || !workspace?.matches(props.scope)) return;
    prepared.current = true;
    if (workspace.open(props.kind, props.item)) props.onPrepared?.();
  }, [workspace, props.scope, props.kind, props.item, props.onPrepared]);
  return null;
}
