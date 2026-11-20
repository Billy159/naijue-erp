import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode, type Ref } from 'react';
import { ProductDetailTabs } from '../components/standard-tabs.tsx';
import { UIButton } from '../components/standard-controls.tsx';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import { ReadScope } from '../loading/read-scope.ts';
import { LatestQuery, type QueryRead } from '../loading/latest-query.ts';
import { StandardPagination } from '../components/standard-pagination.tsx';
import { ProductPanelActivity, useProductPanelActive, useProductQueryActivity, ProductReadState } from '../inventory/product-tab-state.tsx';
import { parseProductDetailsPageQuery } from '../../../../packages/application/src/product-details-query-validation.ts';
import type { ProductDetailsPageQuery } from '../../../../packages/application/src/product-details-query-ports.ts';
import { productReadOnlyPageTabs, productPageTabAvailable, type ProductFullPageConfiguration, type ProductFullPageReadOnlyReader, type ProductReadOnlyPageTab } from './product-page-contracts.ts';
import './product-page.css';
export interface ProductPageTabProps { readonly scope: ReadScope; readonly reader: ProductFullPageReadOnlyReader; readonly openInventory?: () => Promise<boolean>; readonly navigationDisabled?: boolean }
const labels = { base: '基础资料', specs: '规格', barcodes: '条码', prices: '价格', images: '图片', stock: '库存' } as const;
type AvailableTab = ProductReadOnlyPageTab;
const leaves = new AsyncLeafRegistry({ base: { load: () => import('./product-page-base.tsx') }, specs: { load: () => import('./product-page-specs.tsx') }, images: { load: () => import('./product-page-images.tsx') }, barcodes: { load: () => import('./product-page-barcodes.tsx') }, prices: { load: () => import('./product-page-prices.tsx') }, stock: { load: () => import('./product-page-stock.tsx') } }, { maxRetainedEntries: 6 });
export function ProductFullPageView(props: ProductPageTabProps & { readonly configuration: ProductFullPageConfiguration;readonly heading:ReactNode;readonly actions:ReactNode;readonly headerRef:Ref<HTMLDivElement> }) {
  const [tab, setTab] = useState<ProductReadOnlyPageTab>(props.configuration.initialTab);
  const available = (value: ProductReadOnlyPageTab) => props.configuration.allowedTabs.includes(value) && productPageTabAvailable(props.reader, value);
  const bodies=useRef<Partial<Record<ProductReadOnlyPageTab,HTMLElement>>>({}),positions=useRef<Partial<Record<ProductReadOnlyPageTab,{top:number;left:number}>>>({});
  const select=(value:ProductReadOnlyPageTab)=>{if(!props.scope.active||!available(value))return;const scroll=bodies.current[tab]?.closest<HTMLElement>('.demo-page');if(scroll)positions.current[tab]={top:scroll.scrollTop,left:scroll.scrollLeft};setTab(value);};
  useLayoutEffect(()=>{const scroll=bodies.current[tab]?.closest<HTMLElement>('.demo-page');if(scroll){const position=positions.current[tab];scroll.scrollTop=position?.top??0;scroll.scrollLeft=position?.left??0;}},[tab]);
  return <><ProductDetailTabs heading={props.heading} actions={props.actions} headerRef={props.headerRef} className="product-readonly-tabs" label="商品只读整页页签" value={tab} items={productReadOnlyPageTabs.map(key => ({ key, label: `${labels[key]}${available(key) ? '' : '（未接入）'}`, disabled: !available(key) }))} onChange={select}
    panels={Object.fromEntries(productReadOnlyPageTabs.map(key=>[key,({active}:{readonly active:boolean})=><ProductPanelActivity value={active}><div style={{display:'contents'}} ref={element=>{if(element)bodies.current[key]=element;else delete bodies.current[key];}}>{available(key)&&<ProductPageTab {...props} tab={key}/>}</div></ProductPanelActivity>]))}/>
    {productReadOnlyPageTabs.some(key => !available(key)) && <p className="product-page-availability" role="status">部分商品资料暂不可查看。</p>}</>;
}

function ProductPageTab(props: ProductPageTabProps & { readonly tab: AvailableTab }) {
  const active=useProductPanelActive(),[started,setStarted]=useState(false);
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
  useEffect(()=>{if(active&&current?.View)setStarted(true);},[active,current]);
  if (!props.scope.active) return null;
  return current?.View && (active||started) ? <current.View scope={current.scope} reader={props.reader} {...(props.openInventory?{openInventory:props.openInventory}: {})} {...(props.navigationDisabled!==undefined?{navigationDisabled:props.navigationDisabled}:{})} /> : current?.error ? <p role="alert">当前页签组件未加载。<UIButton onClick={() => setAttempt(value => value + 1)}>重试加载页签</UIButton></p> : <p role="status">正在准备当前页签…</p>;
}

/** Bounded server pages for the selected product/tab; no prefetch or client full-catalogue sum. */
export function ProductPagedRead<T extends { readonly page: number; readonly pageSize: number; readonly total: number }>(props: {
  readonly scope: ReadScope;
  readonly read: (read: QueryRead<ProductDetailsPageQuery>) => Promise<T | null>;
  readonly validate: (value: unknown, parameters: ProductDetailsPageQuery) => T | null;
  readonly label: string;
  readonly children: (data: T) => ReactNode;
}) {
  const [owner, setOwner] = useState<{ readonly scope: ReadScope; readonly query: LatestQuery<ProductDetailsPageQuery, T | null> } | null>(null);
  useEffect(() => {
    const query = new LatestQuery<ProductDetailsPageQuery, T | null>({ scope: props.scope, execute: async read => props.validate(await props.read(read), read.parameters) });
    const value = { scope: props.scope, query };
    setOwner(value);
    return () => { query.dispose(); };
  }, [props.scope, props.read, props.validate]);
  const query=owner?.scope===props.scope?owner.query:null;
  useProductQueryActivity(query,props.scope.entityId?parseProductDetailsPageQuery({productId:props.scope.entityId,page:1,pageSize:50}):null);
  return owner?.scope === props.scope && props.scope.active ? <ProductPagedResults {...props} query={owner.query} /> : null;
}
function ProductPagedResults<T extends { readonly page: number; readonly pageSize: number; readonly total: number }>(props: {
  readonly scope: ReadScope; readonly query: LatestQuery<ProductDetailsPageQuery, T | null>; readonly label: string; readonly children: (data: T) => ReactNode;
}) {
  const active=useProductPanelActive();
  const snapshot = useSyncExternalStore(props.query.subscribe, props.query.getSnapshot, props.query.getSnapshot), [cancelled, setCancelled] = useState(false);
  const data = snapshot.success?.data, parameters = snapshot.request?.parameters;
  const retry = () => {
    if(!active)return;
    setCancelled(false);
    if (parameters) void props.query.run(parameters);
    else if (props.scope.entityId) void props.query.run(parseProductDetailsPageQuery({ productId: props.scope.entityId, page: 1, pageSize: 50 }));
  };
  return <ProductReadState phase={snapshot.phase} retry={retry} cancelled={cancelled} cancel={() => { setCancelled(true); props.query.cancel(); }} empty={!data}>
    {data && <>{props.children(data)}<StandardPagination label={props.label} scope={props.scope} page={data.page} pageSize={data.pageSize} total={data.total} disabled={snapshot.phase === 'loading'} onPage={page => { if (active && snapshot.success) void props.query.run({ ...snapshot.success.parameters, page }); }} /></>}
  </ProductReadState>;
}
