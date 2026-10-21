import { useEffect, useState, type ComponentType } from 'react';
import type { ReadScope } from '../../loading/read-scope.ts';
import { AsyncLeafRegistry } from '../../loading/async-leaf-registry.ts';
import type { TransferNewDocumentSession } from '../../current-form/transfer-create.ts';
import type { TransferCommandCapability } from './contracts.ts';
import { useTransferOwnedScope } from '../owned-scope.ts';
type ViewProps = { readonly session: TransferNewDocumentSession; readonly scope: ReadScope; readonly close: () => void };
/** Loads actual proposal/editor and action styles only after NEW is clicked. */
export function TransferManualCreateHost(props: { readonly parentScope: ReadScope; readonly capability: NonNullable<TransferCommandCapability['manualCreate']>; readonly loadStyles: () => Promise<unknown>; readonly close: () => void }) {
  const scope = useTransferOwnedScope(props.parentScope, 'transfer-manual-create', null);
  const [leaves] = useState(() => new AsyncLeafRegistry({ form: { load: () => import('../../current-form/transfer-new-document-form.tsx'), loadStyles: props.loadStyles } }, { maxRetainedEntries: 1 }));
  const [ready, setReady] = useState<{ View: ComponentType<ViewProps>; session: TransferNewDocumentSession } | null>(null);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!scope) return; let attached = true; let session: TransferNewDocumentSession | null = null; setReady(null); setFailed(false);
    void leaves.load('form', scope).then(async module => {
      if (!attached || !scope.active) return;
      session = await props.capability.open();
      if (attached && scope.active) setReady({ View: module.TransferNewDocumentForm, session });
    }).catch(() => { if (attached && scope.active) setFailed(true); });
    return () => { attached = false; session?.cancelPreparation(); session?.proposal.closePicker(); };
  }, [scope, leaves, props.capability, attempt]);
  const close = () => {
    if (ready) {
      if (ready.session.workspace.hasUnresolvedWrite) return;
      ready.session.proposal.reset(true); ready.session.proposal.dispose(); ready.session.dispose();
    }
    scope?.dispose(); props.close();
  };
  if (!props.parentScope.active) return null;
  if (ready && scope) return <ready.View session={ready.session} scope={scope} close={close} />;
  return <section aria-label="新增调拨准备"><h1>新增调拨单</h1><button type="button" onClick={close}>返回列表</button>{failed ? <p role="alert">新建界面准备失败，未发送保存命令。<button type="button" onClick={() => setAttempt(value => value + 1)}>重试界面</button></p> : <p role="status">正在准备新建界面…</p>}</section>;
}
