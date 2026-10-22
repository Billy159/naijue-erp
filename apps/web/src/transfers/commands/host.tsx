import { UIButton } from '../../components/standard-controls.tsx';
import { useEffect, useState, type ComponentType } from 'react';
import { AsyncLeafRegistry } from '../../loading/async-leaf-registry.ts';
import type { ReadScope } from '../../loading/read-scope.ts';
import type { TransferCommandCapability } from './contracts.ts';
import type { TransferCommandFormProps } from './form.tsx';
import { useTransferOwnedScope } from '../owned-scope.ts';

/** Command editor code/CSS waits explicit activation. The session workspace is
 * deliberately not owned by this transient action scope. */
export function TransferCommandHost(props: { readonly parentScope: ReadScope; readonly transferId: string | null; readonly capability: TransferCommandCapability; readonly loadStyles: () => Promise<unknown>; readonly close: () => void }) {
  const scope = useTransferOwnedScope(props.parentScope, 'transfer-command-form', props.transferId);
  const [leaves] = useState(() => new AsyncLeafRegistry({ form: { load: () => import('./form.tsx'), loadStyles: props.loadStyles } }, { maxRetainedEntries: 1 }));
  const [View, setView] = useState<ComponentType<TransferCommandFormProps> | null>(null), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const [preparing, setPreparing] = useState(false);
  useEffect(() => {
    if (!scope) return; let attached = true; setFailed(false); setView(null);
    void leaves.load('form', scope).then(async module => {
      if (!attached || !scope.active) return;
      const workspace = props.capability.workspace, snapshot = workspace.getSnapshot(), current = snapshot.editor;
      if (props.transferId !== null) {
        if (!workspace.canLeave() && current?.transferId !== props.transferId) throw new Error('Unresolved previous editor');
        if (workspace.canLeave()) void workspace.openExisting(props.transferId);
      } else if (!current || current.mode !== 'CREATE' || snapshot.write.phase === 'committed') {
        if (!props.capability.preparation) throw new Error('Current preparation unavailable');
        if (current && !workspace.discardEditor()) throw new Error('Unresolved previous draft');
        setPreparing(true); const draft = await props.capability.preparation.prepareCreate(scope.signal);
        if (!attached || !scope.active) return;
        if (!workspace.openCreate(draft)) throw new Error('Preparation rejected'); setPreparing(false);
      }
      if (attached && scope.active) setView(() => module.TransferCommandForm);
    }).catch(() => { if (attached && scope.active) { setFailed(true); setPreparing(false); } });
    return () => { attached = false; };
  }, [scope, leaves, attempt, props.transferId, props.capability]);
  const close = () => { if (!props.capability.workspace.canLeave()) return; props.capability.workspace.suspend(); scope?.dispose(); props.close(); };
  if (!props.parentScope.active) return null;
  if (View && scope) return <View capability={props.capability} scope={scope} close={close} />;
  return <section className="tc-workbench transfer-detail-loading" aria-label="调拨编辑准备"><div className="tc-head"><h1>{props.transferId ? '调拨单' : '新增调拨单'}</h1><UIButton type="button" className="iw-text-button" onClick={close}>返回列表</UIButton></div>{failed ? <p role="alert">编辑准备失败，未发送业务命令。<UIButton type="button" className="iw-link" onClick={() => setAttempt(value => value + 1)}>重试准备</UIButton></p> : <p role="status">{preparing ? '正在准备当前可用资料…' : '正在准备调拨编辑…'}</p>}</section>;
}
