import { UIButton } from '../components/standard-controls.tsx';
import { StandardTabs } from '../components/standard-tabs.tsx';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import { ReadScope } from '../loading/read-scope.ts';
import type { ProductReadOnlyReader } from './product-contracts.ts';
import './product-drawer.css';
export interface ProductDrawerContentProps { readonly scope: ReadScope; readonly reader: ProductReadOnlyReader }
const tabs = { base: '基础资料', specs: '规格', images: '图片' } as const;
type Tab = keyof typeof tabs;
const leaves = new AsyncLeafRegistry({
  base: { load: () => import('./product-tab-basics.tsx') },
  specs: { load: () => import('./product-tab-specifications.tsx') },
  images: { load: () => import('./product-tab-images.tsx') },
}, { maxRetainedEntries: 3 });

export function ProductDrawerContent(props: ProductDrawerContentProps) {
  const [tab, setTab] = useState<Tab>('base');
  return <StandardTabs className="erp-product-tabs" label="商品只读资料" value={tab} items={(Object.keys(tabs) as Tab[]).map(key=>({key,label:tabs[key]}))} onChange={setTab}><section className="pd-panel"><ProductTabLeaf key={tab} {...props} tab={tab} /></section></StandardTabs>;
}
function ProductTabLeaf(props: ProductDrawerContentProps & { readonly tab: Tab }) {
  const attachmentId = useRef(0);
  const [attachment, setAttachment] = useState<{ readonly parentScope: ReadScope; readonly tab: Tab; readonly scope: ReadScope } | null>(null);
  const [leaf, setLeaf] = useState<{ readonly scope: ReadScope; readonly View: ComponentType<ProductDrawerContentProps> | null; readonly error: boolean } | null>(null);
  const scope = attachment?.parentScope === props.scope && attachment.tab === props.tab && attachment.scope.active ? attachment.scope : null;
  const View = leaf?.scope === scope ? leaf.View : null;
  const error = leaf?.scope === scope && leaf.error;
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const next = new ReadScope(props.scope.identity, `${props.scope.routeInstanceId}:${props.tab}:${++attachmentId.current}`, props.scope.entityId, () => {});
    const current = { parentScope: props.scope, tab: props.tab, scope: next };
    const dispose = () => { next.dispose(); setAttachment(value => value === current ? null : value); };
    props.scope.signal.addEventListener('abort', dispose, { once: true });
    if (props.scope.active) setAttachment(current); else dispose();
    return () => { props.scope.signal.removeEventListener('abort', dispose); next.dispose(); };
  }, [props.scope, props.tab]);
  useEffect(() => {
    if (!scope) return;
    let attached = true;
    setLeaf({ scope, View: null, error: false });
    void leaves.load(props.tab, scope).then(module => { if (attached && scope.active) setLeaf({ scope, View: module.ProductTab, error: false }); }, () => { if (attached && scope.active) setLeaf({ scope, View: null, error: true }); });
    return () => { attached = false; };
  }, [props.tab, scope, attempt]);
  return View && scope ? <View key={scope.routeInstanceId} scope={scope} reader={props.reader} /> : error ? <div className="iw-inline-state" role="alert">页签组件未加载。<UIButton type="button" className="iw-link" onClick={() => setAttempt(value => value + 1)}>重试页签</UIButton></div> : <p className="iw-inline-state" role="status">正在准备{tabs[props.tab]}…</p>;
}
