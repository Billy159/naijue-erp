import { useEffect, useId, useRef, useState, type ComponentType } from 'react';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import { ReadScope } from '../loading/read-scope.ts';
import type { Selection } from './contracts.ts';
import type { ProductReadOnlyReader } from './product-contracts.ts';
import type { ProductDrawerContentProps } from './product-drawer.tsx';

function loadStyles(): Promise<void> {
  if (document.querySelector('[data-inventory-inline],link[data-product-drawer-ready]')) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = new URL('./product-drawer.css', import.meta.url).href;
    link.onload = () => { link.dataset.productDrawerReady = ''; resolve(); };
    link.onerror = () => { link.remove(); reject(new Error('商品查看样式加载失败，请重试。')); };
    document.head.append(link);
  });
}
const leaves = new AsyncLeafRegistry({ drawer: { load: () => import('./product-drawer.tsx'), loadStyles } }, { maxRetainedEntries: 1 });

/** Mounted only by an explicit 查看 click. Close detaches pending imports, cancels reads and clears entity facts. */
export function ProductDrawerHost(props: { readonly parentScope: ReadScope; readonly product: Selection; readonly reader: ProductReadOnlyReader; readonly close: () => void }) {
  const id = useId();
  const [scope] = useState(() => new ReadScope(props.parentScope.identity, `${props.parentScope.routeInstanceId}:product:${id}`, props.product.id, () => {}));
  const [View, setView] = useState<ComponentType<ProductDrawerContentProps> | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dispose = () => scope.dispose();
    props.parentScope.signal.addEventListener('abort', dispose, { once: true });
    if (!props.parentScope.active) dispose();
    const element = dialog.current;
    if (typeof element?.showModal === 'function') element.showModal(); else element?.setAttribute('open', '');
    closeButton.current?.focus();
    return () => { props.parentScope.signal.removeEventListener('abort', dispose); scope.dispose(); element?.close?.(); };
  }, [props.parentScope, scope]);
  useEffect(() => {
    let attached = true;
    setError(false);
    void leaves.load('drawer', scope).then(module => { if (attached && scope.active) setView(() => module.ProductDrawerContent); }, () => { if (attached && scope.active) setError(true); });
    return () => { attached = false; };
  }, [scope, attempt]);
  return <dialog ref={dialog} className="iw-product-drawer" aria-modal="true" aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); props.close(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) props.close(); } }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.close(); }
    if (event.key !== 'Tab') return;
    const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')).filter(element => element.tabIndex >= 0 && !element.closest('[hidden]'));
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className="iw-product-drawer-head"><div><h2 id={`${id}-title`}>商品资料 · 只读</h2><p>{props.product.label}</p></div><button ref={closeButton} type="button" className="iw-text-button" aria-label="关闭商品资料" onClick={props.close}>×</button></header>
    <div className="iw-product-drawer-body">{View ? <View scope={scope} reader={props.reader} /> : error ? <div className="iw-inline-state" role="alert">商品查看组件未加载。<button type="button" className="iw-link" onClick={() => setAttempt(value => value + 1)}>重试加载</button></div> : <p className="iw-inline-state" role="status">正在准备商品查看…</p>}</div>
  </dialog>;
}
