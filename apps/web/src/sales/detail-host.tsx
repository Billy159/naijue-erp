import { SalesDocumentPresentation, type SalesProductCapability } from './document-presentation.tsx';
import { UIButton } from '../components/standard-controls.tsx';
import { useEffect, useState, type ComponentType } from 'react';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { SalesReader } from './contracts.ts';
import type { SalesDetailContentProps } from './detail-content.tsx';
import { SalesDetailHeader } from './detail-header.tsx';
import { salesTarget } from './model.ts';
import { useSalesOwnedScope } from './owned-scope.ts';

export interface SalesDetailActivation {
  readonly product?: SalesProductCapability;
  readonly parentScope: ReadScope; readonly salesId: string; readonly reader: SalesReader;
  /** Explicit action-only trusted CSS owner. Resolve only when CSS is usable. */
  readonly loadDetailStyles: () => Promise<unknown>;
  readonly close: () => void;
}
/** Full-page document, not a modal. The owner retains its hidden list. Both code
 * and action CSS must be ready before mounting the detail's scoped query. */
export function SalesDetailHost(props: SalesDetailActivation) {
  if (typeof props.loadDetailStyles !== 'function') throw new TypeError('An explicit action-only sales detail stylesheet loader is required.');
  const scope = useSalesOwnedScope(props.parentScope, 'sales-detail', salesTarget(props.salesId).salesId);
  const [leaves] = useState(() => new AsyncLeafRegistry({ detail: { load: () => import('./detail-content.tsx'), loadStyles: props.loadDetailStyles } }, { maxRetainedEntries: 1 }));
  const [View, setView] = useState<ComponentType<SalesDetailContentProps> | null>(null); const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  const close = () => { scope?.dispose(); props.close(); };
  useEffect(() => {
    if (!scope) return;
    let attached = true; setView(null); setFailed(false);
    void leaves.load('detail', scope).then(module => { if (attached && scope.active) setView(() => module.SalesDetailContent); }, () => { if (attached && scope.active) setFailed(true); });
    return () => { attached = false; };
  }, [scope, attempt, leaves]);
  if (!props.parentScope.active) return null;
  if (View && scope) return <View scope={scope} reader={props.reader} salesId={props.salesId} close={close} {...(props.product ? { product: props.product } : {})} />;
  return <section className="sales-workbench sales-detail-loading" aria-label="销货单详情"><SalesDocumentPresentation
    header={<SalesDetailHeader close={close} />}
    status={failed ? <p role="alert" className="iw-inline-state">详情组件或样式加载失败。<UIButton type="button" className="iw-link" onClick={() => setAttempt(value => value + 1)}>重试加载</UIButton></p> : <p role="status" className="iw-inline-state">正在准备销货单查看…</p>}
  /></section>;
}
