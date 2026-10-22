import { Button, Modal } from '@arco-design/web-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LatestQuery } from '../../loading/latest-query.ts';
import { HttpQueryError } from '../../transport/http-query.ts';
import type { StoreSettingsDetail, StoreSettingsDetailQuery, StoreSettingsKind, StoreSettingsPageProps } from './contracts.ts';
import type { SettingsDirectoryReader } from './maintenance-contracts.ts';
import { StoreMaintenanceForm } from './maintenance-form.tsx';
import type { StoreMaintenanceWorkspace } from './maintenance-controller.ts';
import { StoreSettingsPage } from './stores-page.tsx';

/** Optional authenticated-session workspace; without it the original preparation remains read-only. */
export function StoreSettingsMaintenanceHost(props: StoreSettingsPageProps & {
  readonly allowedTabs: readonly StoreSettingsKind[]; readonly initialTab: StoreSettingsKind;
  readonly directory?: SettingsDirectoryReader; readonly workspace?: StoreMaintenanceWorkspace;
}) {
  const [tab, setTab] = useState(() => {
    const workspace = props.workspace ?? props.maintenance?.workspace;
    if (!workspace?.matches(props.scope)) return props.initialTab;
    const editors = workspace.getSnapshot();
    return props.allowedTabs.find(kind => editors[kind]?.hasUnresolvedWrite)
      ?? props.allowedTabs.find(kind => editors[kind]?.getSnapshot().dirty) ?? props.initialTab;
  }), focusTab = useRef(false);
  if (!props.allowedTabs.includes(props.initialTab)) throw new TypeError('Initial settings tab must be explicitly allowed');
  return <StoreSettingsPage {...props} kind={tab} focusTab={focusTab.current} maintenance={{ ...props.maintenance, ...(props.directory ? { directory: props.directory } : {}), ...(props.workspace ? { workspace: props.workspace } : {}) }} onTab={next => { if (props.scope.active && props.allowedTabs.includes(next)) { focusTab.current = true; setTab(next); } }} />;
}
export function StoreMaintenanceHost(props: StoreSettingsPageProps & {
  readonly kind: StoreSettingsKind; readonly targetId: string | null; readonly close: () => void; readonly onPrepared?: () => void;
}) {
  const [query, setQuery] = useState<LatestQuery<StoreSettingsDetailQuery, StoreSettingsDetail> | null>(null);
  useEffect(() => {
    if (props.targetId === null) return;
    const next = new LatestQuery<StoreSettingsDetailQuery, StoreSettingsDetail>({ scope: props.scope, execute: read => props.reader.readDetail(props.kind, read) });
    setQuery(next); void next.run({ id: props.targetId }); return () => next.dispose();
  }, [props.scope, props.reader, props.kind, props.targetId]);
  if (!props.scope.active) return null;
  if (props.targetId === null) return <StoreMaintenanceForm scope={props.scope} kind={props.kind} record={null} directory={props.maintenance?.directory} close={props.close} />;
  return query ? <ExistingStorePreparation {...props} query={query} /> : null;
}
function ExistingStorePreparation(props: Parameters<typeof StoreMaintenanceHost>[0] & { readonly query: LatestQuery<StoreSettingsDetailQuery, StoreSettingsDetail> }) {
  const snapshot = useSyncExternalStore(props.query.subscribe, props.query.getSnapshot, props.query.getSnapshot);
  useEffect(() => {
    const workspace = props.maintenance?.workspace;
    if (snapshot.error instanceof HttpQueryError && snapshot.error.kind === 'forbidden' && workspace?.matches(props.scope) && workspace.hasUnresolvedWrite()) return;
    if (snapshot.error instanceof HttpQueryError && snapshot.error.kind === 'unauthenticated' && workspace?.matches(props.scope)) workspace.dispose();
    if (snapshot.phase === 'error' && props.scope.active && snapshot.error instanceof HttpQueryError && (snapshot.error.kind === 'unauthenticated' || snapshot.error.kind === 'forbidden')) props.onAccessFailure(snapshot.error.kind);
  }, [snapshot, props.scope, props.onAccessFailure, props.maintenance?.workspace]);
  if (snapshot.phase === 'disposed' || !props.scope.active) return null;
  const item = snapshot.phase === 'success' && snapshot.success?.parameters.id === props.targetId ? snapshot.success.data.item : null;
  if (item && item.kind === props.kind && item.id === props.targetId && props.maintenance?.workspace) return <PrepareStoreCommand {...props} item={item} />;
  if (item && item.kind === props.kind && item.id === props.targetId) return <StoreMaintenanceForm scope={props.scope} kind={props.kind} record={item} directory={props.maintenance?.directory} close={props.close} />;
  return <Modal className="demo-ui bs-modal demo-store-modal iw-arco-modal iw-arco-controls" autoFocus={false} focusLock visible title={`编辑${props.kind === 'stores' ? '营业厅' : '仓库'}`} maskClosable={false} okText="确定" cancelText="取消" okButtonProps={{ disabled: true }} onCancel={props.close}>
    <p role="status">{snapshot.phase === 'loading' ? '正在读取当前资料…' : snapshot.phase === 'success' ? '记录不存在或不可访问。' : '当前资料读取失败，暂不能编辑。'}</p>
    {snapshot.phase === 'error' && <Button onClick={() => { if (props.targetId) void props.query.run({ id: props.targetId }); }}>重试读取</Button>}
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
