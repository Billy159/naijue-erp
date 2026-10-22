import type { SalesProductCapability } from '../document-presentation.tsx';
import { UIButton } from '../../components/standard-controls.tsx';
import { useEffect, useState, type ComponentType } from 'react';
import type { ReadScope } from '../../loading/read-scope.ts';
import { AsyncLeafRegistry } from '../../loading/async-leaf-registry.ts';
import type { SalesNewDocumentSession } from '../../current-form/sales-create.ts';
import type { SalesManualCreateCapability } from './contracts.ts';
import { useTransferOwnedScope } from '../../transfers/owned-scope.ts';
import type { SalesHistoryReader } from '../history-http-reader.ts';
type ViewProps = { readonly session: SalesNewDocumentSession; readonly scope: ReadScope; readonly close: () => void; readonly historyReader?: SalesHistoryReader; readonly product?: SalesProductCapability };
/** Loads actual proposal/editor and action styles only after NEW is clicked. */
export function SalesManualCreateHost(props: { readonly parentScope: ReadScope; readonly capability: SalesManualCreateCapability; readonly loadStyles: () => Promise<unknown>; readonly close: () => void; readonly historyReader?: SalesHistoryReader; readonly product?: SalesProductCapability }) {
  const scope = useTransferOwnedScope(props.parentScope, 'sales-manual-create', null);
  const [leaves] = useState(() => new AsyncLeafRegistry({ form: { load: () => import('../../current-form/sales-new-document-form.tsx'), loadStyles: props.loadStyles } }, { maxRetainedEntries: 1 }));
  const [ready, setReady] = useState<{ View: ComponentType<ViewProps>; session: SalesNewDocumentSession } | null>(null);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!scope) return; let attached = true; let session: SalesNewDocumentSession | null = null; setReady(null); setFailed(false);
    void leaves.load('form', scope).then(async module => {
      if (!attached || !scope.active) return;
      session = await props.capability.open();
      if (attached && scope.active) setReady({ View: module.SalesNewDocumentForm, session });
    }).catch(() => { if (attached && scope.active) setFailed(true); });
    return () => { attached = false; session?.cancelPreparation(); session?.proposal.closePicker(); };
  }, [scope, leaves, props.capability, attempt]);
  const close = () => {
    if (ready) {
      if (ready.session.editor.commands.hasUnresolvedWrite) return;
      ready.session.proposal.reset(true); ready.session.proposal.dispose(); ready.session.dispose();
    }
    scope?.dispose(); props.close();
  };
  if (!props.parentScope.active) return null;
  if (ready && scope) return <ready.View session={ready.session} scope={scope} close={close} {...(props.product ? { product: props.product } : {})} {...(props.historyReader ? { historyReader: props.historyReader } : {})} />;
  return <section aria-label="新增销售准备"><h1>新增销售单</h1><UIButton type="button" onClick={close}>返回列表</UIButton>{failed ? <p role="alert">新建界面准备失败，未发送保存命令。<UIButton type="button" onClick={() => setAttempt(value => value + 1)}>重试界面</UIButton></p> : <p role="status">正在准备新建界面…</p>}</section>;
}
