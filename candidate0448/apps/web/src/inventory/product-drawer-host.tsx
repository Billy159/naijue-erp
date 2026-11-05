import { UIButton } from '../components/standard-controls.tsx';
import { useEffect, useId, useRef, useState, type ComponentType } from 'react';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import { ReadScope } from '../loading/read-scope.ts';
import type { Selection } from './contracts.ts';
import type { ProductReadOnlyReader } from './product-contracts.ts';
import type { ProductDrawerContentProps } from './product-drawer.tsx';

let defaultStyles: Promise<void> | null = null;
function loadDefaultStyles(): Promise<void> {
  if (document.querySelector('[data-inventory-inline],link[data-product-drawer-ready]')) return Promise.resolve();
  if (defaultStyles) return defaultStyles;
  defaultStyles = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = new URL('./product-drawer.css', import.meta.url).href;
    link.onload = () => { link.dataset.productDrawerReady = ''; defaultStyles = null; resolve(); };
    link.onerror = () => { link.remove(); defaultStyles = null; reject(new Error('商品查看样式加载失败，请重试。')); };
    document.head.append(link);
  });
  return defaultStyles;
}
// Only module code is shared. Each attachment must await its configured style owner;
// a ready module can never bypass a different owner's pending or failed stylesheet.
const leaves = new AsyncLeafRegistry({ drawer: { load: () => import('./product-drawer.tsx') } }, { maxRetainedEntries: 1 });

/** Mounted only by an explicit 查看 click. Close detaches pending imports, cancels reads and clears entity facts. */
export function ProductDrawerHost(props: { readonly parentScope: ReadScope; readonly product: Selection; readonly reader: ProductReadOnlyReader; readonly close: () => void; readonly loadStyles?: () => Promise<unknown> }) {
  const id = useId();
  const attachmentId = useRef(0);
  const [attachment, setAttachment] = useState<{ readonly parentScope: ReadScope; readonly scope: ReadScope } | null>(null);
  const [leaf, setLeaf] = useState<{ readonly scope: ReadScope; readonly View: ComponentType<ProductDrawerContentProps> | null; readonly error: boolean } | null>(null);
  const scope = attachment?.parentScope === props.parentScope && attachment.scope.entityId === props.product.id && attachment.scope.active ? attachment.scope : null;
  const View = leaf?.scope === scope ? leaf.View : null;
  const error = leaf?.scope === scope && leaf.error;
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    // Effects may detach and reattach without a new render in StrictMode. Each
    // attachment owns a fresh scope; a disposed instance is never reused.
    const next = new ReadScope(props.parentScope.identity, `${props.parentScope.routeInstanceId}:product:${id}:${++attachmentId.current}`, props.product.id, () => {});
    const current = { parentScope: props.parentScope, scope: next };
    const dispose = () => { next.dispose(); setAttachment(value => value === current ? null : value); };
    props.parentScope.signal.addEventListener('abort', dispose, { once: true });
    if (props.parentScope.active) setAttachment(current); else dispose();
    return () => { props.parentScope.signal.removeEventListener('abort', dispose); next.dispose(); };
  }, [props.parentScope, props.product.id, id]);
  useEffect(() => {
    if (!scope) return;
    let attached = true;
    setLeaf({ scope, View: null, error: false });
    const styles = Promise.resolve().then(() => (props.loadStyles ?? loadDefaultStyles)());
    void Promise.all([leaves.load('drawer', scope), styles]).then(([module]) => { if (attached && scope.active) setLeaf({ scope, View: module.ProductDrawerContent, error: false }); }, () => { if (attached && scope.active) setLeaf({ scope, View: null, error: true }); });
    return () => { attached = false; };
  }, [scope, attempt, props.loadStyles]);
  return <StandardOverlay kind="drawer" className="erp-product-drawer" title={<div className="iw-product-drawer-title"><h2 id={`${id}-title`}>{props.product.label}</h2><small>只读</small></div>}
    label={props.product.label} closeLabel="关闭商品资料" close={props.close} maskClosable width="min(660px,100vw)">
    <div className="iw-product-drawer-body">{View && scope ? <View key={scope.routeInstanceId} scope={scope} reader={props.reader} /> : error ? <div className="iw-inline-state" role="alert">商品查看组件未加载。<UIButton type="button" className="iw-link" onClick={() => setAttempt(value => value + 1)}>重试加载</UIButton></div> : <p className="iw-inline-state" role="status">正在准备商品查看…</p>}</div>
  </StandardOverlay>;
}
