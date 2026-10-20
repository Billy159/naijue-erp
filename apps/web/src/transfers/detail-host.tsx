import { useEffect, useState, type ComponentType } from 'react';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { TransferProductCapability, TransferReader } from './contracts.ts';
import type { TransferDetailContentProps } from './detail-content.tsx';
import { transferTarget } from './model.ts';
import { useTransferOwnedScope } from './owned-scope.ts';

export interface TransferDetailActivation {
  readonly parentScope: ReadScope; readonly transferId: string; readonly reader: TransferReader;
  /** Required action-only CSS owner. Resolve only after detail CSS is usable. */
  readonly loadDetailStyles: () => Promise<unknown>;
  readonly product?: TransferProductCapability;
  readonly close: () => void;
}
/** Source full-page document, not a modal. List stays mounted but hidden by its
 * owner. Close works during import/style/query waits and detaches late work. */
export function TransferDetailHost(props: TransferDetailActivation) {
  const scope = useTransferOwnedScope(props.parentScope, 'transfer-detail', transferTarget(props.transferId).transferId);
  const [leaves] = useState(() => new AsyncLeafRegistry({ detail: { load: () => import('./detail-content.tsx'), loadStyles: props.loadDetailStyles } }, { maxRetainedEntries: 1 }));
  const [View, setView] = useState<ComponentType<TransferDetailContentProps> | null>(null); const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  const close = () => { scope?.dispose(); props.close(); };
  useEffect(() => {
    if (!scope) return; let attached = true; setView(null); setFailed(false);
    void leaves.load('detail', scope).then(module => { if (attached && scope.active) setView(() => module.TransferDetailContent); }, () => { if (attached && scope.active) setFailed(true); });
    return () => { attached = false; };
  }, [scope, attempt, leaves]);
  if (!props.parentScope.active) return null;
  if (View && scope) return <View scope={scope} accessScope={props.parentScope} reader={props.reader} transferId={props.transferId} close={close} {...(props.product ? { product: props.product } : {})} />;
  return <section className="tc-workbench transfer-detail-loading" aria-label="调拨单详情"><div className="tc-head"><h1>查看调拨单</h1><button type="button" className="iw-text-button" onClick={close}>返回列表</button></div>
    {failed ? <p role="alert" className="iw-inline-state">详情组件或样式加载失败。<button type="button" className="iw-link" onClick={() => setAttempt(value => value + 1)}>重试加载</button></p> : <p role="status" className="iw-inline-state">正在准备调拨单查看…</p>}</section>;
}
