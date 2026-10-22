import { StandardBreadcrumb } from '../components/standard-breadcrumb.tsx';
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { UIButton } from '../components/standard-controls.tsx';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import { ReadScope } from '../loading/read-scope.ts';
import type { Selection } from '../inventory/contracts.ts';
import type { ProductFullPageConfiguration, ProductFullPageReadOnlyReader } from './product-page-contracts.ts';
const leaves = new AsyncLeafRegistry({ page: { load: () => import('./product-page-view.tsx') } }, { maxRetainedEntries: 1 });
interface ViewProps { readonly scope: ReadScope; readonly configuration: ProductFullPageConfiguration; readonly reader: ProductFullPageReadOnlyReader }
export function ProductFullPageHost(props: { readonly parent: ReadScope; readonly target: Selection; readonly configuration: ProductFullPageConfiguration; readonly reader: ProductFullPageReadOnlyReader; readonly close: () => void }) {
  const sequence = useRef(0), heading = useRef<HTMLHeadingElement>(null), [attempt, setAttempt] = useState(0);
  const [attachment, setAttachment] = useState<{ parent: ReadScope; scope: ReadScope; View: ComponentType<ViewProps> | null; error: boolean } | null>(null);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const scope = new ReadScope(props.parent.identity, `${props.parent.routeInstanceId}:full-product:${++sequence.current}`, props.target.id, () => {});
    const next = { parent: props.parent, scope, View: null as ComponentType<ViewProps> | null, error: false }; let attached = true;
    const dispose = () => { scope.dispose(); if (attached) setAttachment(value => value?.scope === scope ? null : value); };
    props.parent.signal.addEventListener('abort', dispose, { once: true });
    if (props.parent.active) { setAttachment(next); void Promise.all([leaves.load('page', scope), Promise.resolve().then(() => props.configuration.stylesheet.load())]).then(([module]) => {
      if (attached && scope.active) setAttachment({ ...next, View: module.ProductFullPageView });
    }, () => { if (attached && scope.active) setAttachment({ ...next, error: true }); }); } else dispose();
    return () => { attached = false; props.parent.signal.removeEventListener('abort', dispose); scope.dispose(); };
  }, [props.parent, props.target.id, props.configuration, attempt]);
  const current = attachment?.parent === props.parent && attachment.scope.entityId === props.target.id && attachment.scope.active ? attachment : null;
  if (!props.parent.active) return null;
  return <section className="product-full-page" aria-label="商品只读整页"><div className="product-page-header"><StandardBreadcrumb label="商品查看路径" segments={[{ id: 'list', label: '商品信息' }, { id: 'target', label: props.target.label }, { id: 'mode', label: '只读' }]} />
    <div className="product-page-title"><h1 ref={heading} tabIndex={-1}>{props.target.label}</h1><span>只读</span><UIButton onClick={props.close}>返回商品信息</UIButton></div></div>
    {current?.View ? <current.View scope={current.scope} configuration={props.configuration} reader={props.reader} /> : current?.error ? <p role="alert">商品整页组件或样式未准备完成，尚未读取商品资料。<UIButton onClick={() => setAttempt(value => value + 1)}>重试商品整页</UIButton></p> : <p role="status">正在准备商品只读整页…</p>}
  </section>;
}
