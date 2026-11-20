import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode, type Ref } from 'react';
import { UIButton } from '../components/standard-controls.tsx';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import { ReadScope } from '../loading/read-scope.ts';
import type { Selection } from '../inventory/contracts.ts';
import type { ProductFullPageConfiguration, ProductFullPageReadOnlyReader } from './product-page-contracts.ts';
const leaves = new AsyncLeafRegistry({ page: { load: () => import('./product-page-view.tsx') } }, { maxRetainedEntries: 1 });
interface ViewProps { readonly heading:ReactNode;readonly actions:ReactNode;readonly headerRef:Ref<HTMLDivElement>; readonly scope: ReadScope; readonly configuration: ProductFullPageConfiguration; readonly reader: ProductFullPageReadOnlyReader; readonly openInventory?: () => Promise<boolean> }
export interface ProductFullPageHostProps {
  readonly parent: ReadScope; readonly target: Selection;
  readonly configuration: ProductFullPageConfiguration; readonly reader: ProductFullPageReadOnlyReader;
  readonly close: () => void; readonly openInventory?: () => Promise<boolean>;
  readonly returnLabel?: string;
}
export function ProductFullPageHost(props: ProductFullPageHostProps) {
  const sequence = useRef(0), host=useRef<HTMLElement>(null),header=useRef<HTMLDivElement>(null),heading = useRef<HTMLHeadingElement>(null), [attempt, setAttempt] = useState(0);
  const [attachment, setAttachment] = useState<{ parent: ReadScope; scope: ReadScope; View: ComponentType<ViewProps> | null; error: boolean } | null>(null);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useLayoutEffect(()=>{const parent=host.current,title=header.current;if(!parent||!title)return;const measure=()=>{if(props.parent.active&&parent.isConnected)parent.style.setProperty('--product-sticky-title-height',`${title.getBoundingClientRect().height}px`);};measure();const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;observer?.observe(title);window.addEventListener('resize',measure);return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};},[props.parent]);
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
  useLayoutEffect(()=>{if(!current?.View||!props.parent.active)return;const active=document.activeElement;if(!active||active===document.body||!active.isConnected)heading.current?.focus({preventScroll:true});},[current?.View]);
  if (!props.parent.active) return null;
  const title=<h1 ref={heading} tabIndex={-1}>{props.target.label}</h1>,actions=<button type="button" className="btn" onClick={props.close}>{props.returnLabel??'返回商品信息'}</button>;
  return <section ref={host} className="pc-detail-workbench product-full-page product-readonly-page product-source-ui" aria-label="商品只读整页">
    {current?.View ? <current.View heading={title} actions={actions} headerRef={header} scope={current.scope} configuration={props.configuration} reader={props.reader} {...(props.openInventory?{openInventory:props.openInventory}: {})} /> : current?.error ? <><div ref={header} className="product-page-header"><div className="gold-head iw-head pc-page-head">{title}<div className="actions iw-head-actions">{actions}</div></div></div><p role="alert">商品整页组件或样式未准备完成，尚未读取商品资料。<UIButton onClick={() => setAttempt(value => value + 1)}>重试商品整页</UIButton></p></> : <><div ref={header} className="product-page-header"><div className="gold-head iw-head pc-page-head">{title}<div className="actions iw-head-actions">{actions}</div></div></div><p role="status">正在准备商品只读整页…</p></>}
  </section>;
}
