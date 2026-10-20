import { useEffect, useId, useRef, useState, type ComponentType } from 'react';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { SalesReader } from './contracts.ts';
import type { SalesDetailContentProps } from './detail-content.tsx';
import { salesTarget } from './model.ts';
import { useSalesOwnedScope } from './owned-scope.ts';

const leaves = new AsyncLeafRegistry({ detail: { load: () => import('./detail-content.tsx') } }, { maxRetainedEntries: 1 });
/** Mount only for explicit 查看/number activation or an authorized detail deep link.
 * The lightweight frame stays closeable while the action code is loading. */
export function SalesDetailHost(props: { readonly parentScope: ReadScope; readonly salesId: string;
  readonly reader: SalesReader; readonly close: () => void }) {
  const instance = useId();
  const scope = useSalesOwnedScope(props.parentScope, 'sales-detail', salesTarget(props.salesId).salesId);
  const [View, setView] = useState<ComponentType<SalesDetailContentProps> | null>(null); const [error, setError] = useState(false); const [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null); const closeButton = useRef<HTMLButtonElement>(null);
  const close = () => { scope?.dispose(); props.close(); };
  useEffect(() => {
    if (!scope) return;
    const element = dialog.current; if (scope.active) { if (typeof element?.showModal === 'function') element.showModal(); else element?.setAttribute('open', ''); closeButton.current?.focus(); }
    return () => { element?.close?.(); };
  }, [props.parentScope, scope]);
  useEffect(() => {
    if (!scope) return;
    let attached = true; setView(null); setError(false);
    void leaves.load('detail', scope).then(module => { if (attached && scope.active) setView(() => module.SalesDetailContent); }, () => { if (attached && scope.active) setError(true); });
    return () => { attached = false; };
  }, [scope, attempt]);
  if (!props.parentScope.active) return null;
  return <dialog ref={dialog} className="sales-detail-dialog" aria-modal="true" aria-labelledby={`${instance}-title`} onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),details>summary,[tabindex="0"]')).filter(element => (element.tabIndex >= 0 || element.matches('details>summary')) && !element.closest('[hidden]'));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className="sales-detail-title"><h2 id={`${instance}-title`}>查看销货单</h2><button ref={closeButton} type="button" className="iw-text-button" aria-label="关闭销货单详情" onClick={close}>返回列表</button></header>
    <div className="sales-detail-body">{View && scope ? <View scope={scope} reader={props.reader} salesId={props.salesId} /> : error ? <p role="alert" className="iw-inline-state">详情组件加载失败。<button type="button" className="iw-link" onClick={() => setAttempt(value => value + 1)}>重试加载</button></p> : <p role="status" className="iw-inline-state">正在准备销货单查看…</p>}</div>
  </dialog>;
}
