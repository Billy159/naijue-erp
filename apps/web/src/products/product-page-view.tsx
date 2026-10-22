import { useEffect, useRef, useState, type ComponentType } from 'react';
import { StandardTabs } from '../components/standard-tabs.tsx';
import { UIButton } from '../components/standard-controls.tsx';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import { ReadScope } from '../loading/read-scope.ts';
import { productReadOnlyPageTabs, productPageTabAvailable, type ProductFullPageConfiguration, type ProductFullPageReadOnlyReader, type ProductReadOnlyPageTab } from './product-page-contracts.ts';
import './product-page.css';
export interface ProductPageTabProps { readonly scope: ReadScope; readonly reader: ProductFullPageReadOnlyReader }
const labels = { base: '基础资料', specs: '规格', barcodes: '条码', prices: '价格', images: '图片', stock: '库存' } as const;
type AvailableTab = 'base' | 'specs' | 'images';
const leaves = new AsyncLeafRegistry({ base: { load: () => import('./product-page-base.tsx') }, specs: { load: () => import('./product-page-specs.tsx') }, images: { load: () => import('./product-page-images.tsx') } }, { maxRetainedEntries: 3 });
export function ProductFullPageView(props: ProductPageTabProps & { readonly configuration: ProductFullPageConfiguration }) {
  const [tab, setTab] = useState<ProductReadOnlyPageTab>(props.configuration.initialTab);
  const available = (value: ProductReadOnlyPageTab) => props.configuration.allowedTabs.includes(value) && productPageTabAvailable(props.reader, value);
  return <><StandardTabs label="商品只读整页页签" value={tab} items={productReadOnlyPageTabs.map(key => ({ key, label: `${labels[key]}${available(key) ? '' : '（未接入）'}`, disabled: !available(key) }))} onChange={value => { if (props.scope.active && available(value)) setTab(value); }}>
    <section className="product-page-tab-body">{available(tab) && <ProductPageTab key={tab} {...props} tab={tab as AvailableTab} />}</section>
  </StandardTabs><aside className="product-page-availability" aria-label="商品整页未接入能力"><strong>未接入能力</strong><p>条码：商品默认方案、当前／历史／兼容绑定尚无读取端口。</p><p>价格：完整九价及字段可见性未接入；已有零售价不能代表其他价格可读。</p><p>库存：完整授权仓库范围、逐仓数量与全仓汇总尚未接入；未知不按零展示。</p></aside></>;
}
function ProductPageTab(props: ProductPageTabProps & { readonly tab: AvailableTab }) {
  const sequence = useRef(0), [attempt, setAttempt] = useState(0);
  const [attachment, setAttachment] = useState<{ parent: ReadScope; tab: AvailableTab; scope: ReadScope; View: ComponentType<ProductPageTabProps> | null; error: boolean } | null>(null);
  useEffect(() => {
    const scope = new ReadScope(props.scope.identity, `${props.scope.routeInstanceId}:${props.tab}:${++sequence.current}`, props.scope.entityId, () => {});
    const next = { parent: props.scope, tab: props.tab, scope, View: null as ComponentType<ProductPageTabProps> | null, error: false };
    let attached = true;
    const dispose = () => { scope.dispose(); if (attached) setAttachment(value => value?.scope === scope ? null : value); };
    props.scope.signal.addEventListener('abort', dispose, { once: true });
    if (props.scope.active) { setAttachment(next); void leaves.load(props.tab, scope).then(module => { if (attached && scope.active) setAttachment({ ...next, View: module.View }); }, () => { if (attached && scope.active) setAttachment({ ...next, error: true }); }); } else dispose();
    return () => { attached = false; props.scope.signal.removeEventListener('abort', dispose); scope.dispose(); };
  }, [props.scope, props.tab, attempt]);
  const current = attachment?.parent === props.scope && attachment.tab === props.tab && attachment.scope.active ? attachment : null;
  return current?.View ? <current.View scope={current.scope} reader={props.reader} /> : current?.error ? <p role="alert">当前页签组件未加载。<UIButton onClick={() => setAttempt(value => value + 1)}>重试加载页签</UIButton></p> : <p role="status">正在准备当前页签…</p>;
}
