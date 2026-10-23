import { StandardOverlay } from '../components/standard-overlay.tsx';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import type { Selection } from './contracts.ts';
import type { ProductReadOnlyReader } from './product-contracts.ts';
import { ProductDrawerHost } from './product-drawer-host.tsx';
import { Empty } from '@arco-design/web-react';
import { useInventoryFilterPopupHost } from '../components/inventory-filter-popup-host.ts';
import { CandidateSelector } from '../components/candidate-selector.tsx';
import { InventoryPagination } from '../components/pagination.tsx';
import { emptyInventoryFilter, type InventoryActions, type InventoryFilter, type InventoryPageSize, type InventoryParameters, type InventoryReader } from './contracts.ts';
import { createInventoryQuery, totalLabel } from './model.ts';
import { defaultDisplaySettings, InventoryMatrix, type InventoryDisplaySettings } from './inventory-matrix.tsx';
import { useInventorySettingsPopup } from './settings-popup.ts';
import type { InventoryLedgerCapability } from './ledger-contracts.ts';
import type { InventoryCellTarget } from './contracts.ts';
import { InventoryLedgerDrawer } from './ledger-drawer.tsx';

export interface InventoryPageProps {
  readonly initialProduct?: Selection;
  readonly returnToProduct?: () => Promise<boolean>;
  readonly scope: ReadScope;
  readonly reader: InventoryReader;
  readonly productReader: ProductReadOnlyReader;
  readonly actions?: Pick<InventoryActions, 'onOpenCell'>;
  readonly ledger?: InventoryLedgerCapability;
}
const names = { products: '商品', categories: '商品分类', warehouses: '仓库', suppliers: '供应商', fits: '版型', seasons: '季节' };
function scopeLines(filter: InventoryFilter): string[] {
  return (Object.keys(names) as (keyof typeof names)[]).map(key => {
    const value = filter[key];
    const labels = (value as readonly { label: string }[]).map(item => item.label);
    return `${names[key]}：${labels.length ? labels.join('、') : '全部'}`;
  });
}
function toggle(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key); return next;
}
/** The mounted owner creates a fresh query for each effect activation. React's
 * setup/cleanup replay must not leave the visible page using a disposed query. */
export function InventoryPageView(props: InventoryPageProps) {
  const [owner, setOwner] = useState<{ scope: ReadScope; reader: InventoryReader; query: ReturnType<typeof createInventoryQuery> } | null>(null);
  useEffect(() => {
    const query = createInventoryQuery(props.scope, props.reader);
    setOwner({ scope: props.scope, reader: props.reader, query });
    if(props.initialProduct){const filter={...emptyInventoryFilter(),products:[props.initialProduct]};queueMicrotask(()=>{if(props.scope.active&&query.getSnapshot().phase!=='disposed')void query.run({filter,page:1,pageSize:100});});}
    return () => query.dispose();
  }, [props.scope, props.reader, props.initialProduct]);
  return owner?.scope === props.scope && owner.reader === props.reader
    ? <InventoryPageContent key={props.scope.routeInstanceId} {...props} query={owner.query} /> : null;
}

function InventoryPageContent({ scope, reader, productReader, actions = {}, ledger, query, initialProduct, returnToProduct }: InventoryPageProps & { readonly query: ReturnType<typeof createInventoryQuery> }) {
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const [draft, setDraft] = useState<InventoryFilter>(()=>({...emptyInventoryFilter(),products:initialProduct?[initialProduct]:[]}));
  const [returning,setReturning]=useState(false),[returnError,setReturnError]=useState('');
  const returnProduct=async()=>{if(!scope.active||returning||!returnToProduct)return;setReturning(true);setReturnError('');try{const moved=await returnToProduct();if(scope.active&&!moved)setReturnError('商品页面暂不可返回，请重试。');}catch{if(scope.active)setReturnError('商品页面暂不可返回，请重试。');}finally{if(scope.active)setReturning(false);}};
  // Only pre-query selection is local. After a success, the applied size is the
  // single visible/next-query source of truth; a pending size lives in request.
  const [initialPageSize, setInitialPageSize] = useState<InventoryPageSize>(100);
  const [advanced, setAdvanced] = useState(false);
  const [product, setProduct] = useState<Selection | null>(null);
  const [ledgerTarget, setLedgerTarget] = useState<InventoryCellTarget | null>(null);
  const productTrigger = useRef<HTMLElement | null>(null);
  const productSequence = useRef(0);
  const openProduct = (target: Selection) => { productTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; productSequence.current++; setProduct(target); };
  const closeProduct = () => { setProduct(null); if (productTrigger.current?.isConnected) productTrigger.current.focus(); };
  const settingsPopup = useInventorySettingsPopup(scope);
  const settingsOpen = settingsPopup.open;
  const [scopeOpen, setScopeOpen] = useState(false);
  const [settings, setSettings] = useState<InventoryDisplaySettings>(defaultDisplaySettings);
  const [collapsedProducts, setCollapsedProducts] = useState<ReadonlySet<string>>(new Set());
  const [collapsedColors, setCollapsedColors] = useState<ReadonlySet<string>>(new Set());
  const scopeTrigger = useRef<HTMLButtonElement>(null);
  const settingsTrigger = settingsPopup.trigger;
  const settingsPosition = settingsPopup.position;
  const success = snapshot.success;
  const result = success?.data;
  // This is the selected, already executed native cell, not a balance reconstructed
  // from a ledger page. A different readReference cannot relabel the old target.
  const ledgerProduct=result?.readReference===ledgerTarget?.readReference?result?.products.find(row=>row.id===ledgerTarget?.productId):undefined;
  const ledgerGroup=ledgerProduct?.colorFits.find(row=>row.color.id===ledgerTarget?.color.id&&row.fit.id===ledgerTarget?.fit.id);
  const ledgerCell=ledgerGroup?.rows.find(row=>row.warehouse.id===ledgerTarget?.warehouse.id)?.cells[ledgerTarget?.size.id??''];
  const ledgerQuantity=ledgerCell?.state==='known'&&ledgerCell.skuId===ledgerTarget?.skuId?ledgerCell.quantity:null;
  const busy = snapshot.phase === 'loading';
  const displayedPageSize = success?.parameters.pageSize ?? initialPageSize;
  const requestedPageSize = snapshot.request?.parameters.pageSize;
  const sizeChangePending = !!result && requestedPageSize !== undefined && requestedPageSize !== displayedPageSize;
  const dirty = !!success && JSON.stringify(draft) !== JSON.stringify(success.parameters.filter);
  const run = (parameters: InventoryParameters) => { setLedgerTarget(null); setCollapsedProducts(new Set()); setCollapsedColors(new Set()); void query.run(parameters); };
  const refresh = () => { if (success) run(success.parameters); };
  const setSize = (size: InventoryPageSize) => {
    if (success) run({ ...success.parameters, page: 1, pageSize: size });
    else setInitialPageSize(size);
  };
  const filterPopupHost = useInventoryFilterPopupHost(scope);
  const fields = { reader, scope, productReader, popupHost: filterPopupHost, categoryIds: draft.categories.map(item => item.id) };
  const settingLabels: Readonly<Record<keyof InventoryDisplaySettings, string>> = { category: '商品分类', supplier: '供应商', fit: '版型', sizeGroup: '尺码组', season: '季节', subtotal: '颜色小计', total: '商品合计', sizeDescription: '显示尺码组说明' };
  if (snapshot.phase === 'disposed') return <div className="iw-empty" role="status"><strong>当前读取范围已关闭</strong><p>请重新进入库存页。旧身份结果已清除。</p></div>;
  // Whole source workbench UI: inventory-workbench.js queryFields/statsBar/results/markup/settings.
  // Only native read facts and existing React state/route callbacks are adapters.
  const moreCount=[draft.suppliers,draft.fits,draft.seasons].filter(values=>values.length).length;
  const summary=[success?.parameters.filter.products.length?`已选${success?.parameters.filter.products.length??0}款商品`:'',success?.parameters.filter.categories.length?`${success.parameters.filter.categories.length}类商品`:'',success?.parameters.filter.warehouses.length?`${success.parameters.filter.warehouses.length}个仓库`:'',success&&[success.parameters.filter.suppliers,success.parameters.filter.fits,success.parameters.filter.seasons].some(values=>values.length)?'附加筛选条件':''].filter(Boolean).join(' · ')||'全部库存';
  const emptyTitle=result?'暂无符合条件的库存':busy?'正在查询库存':snapshot.phase==='error'?'查询未完成':'等待查询';
  const emptyDescription=result?'调整筛选条件后重新查询。':busy?'请稍候，正在整理商品与仓库数据…':snapshot.phase==='error'?'请重试，或调整条件后重新查询。':'设置筛选条件后，点击「查询」查看库存。';
  return <div className="iw-workbench inventory-source-workbench">
    {returnError&&<p role="alert">{returnError}</p>}
    <div className="gold-head iw-head"><h1>库存状况表</h1>{returnToProduct&&<button type="button" className="btn ghost" disabled={returning} onClick={()=>void returnProduct()}>返回商品</button>}<div className="actions iw-head-actions"><button type="button" className="btn iw-head-action" disabled title="完整查询结果导出尚未接入">导出</button><button type="button" className="btn iw-head-action" disabled={!result||busy} onClick={refresh}>刷新</button><button type="button" className="btn iw-head-action" disabled title="完整查询结果打印尚未接入">打印</button></div></div>
    <form className="iw-query" aria-label="库存筛选" onSubmit={event=>{event.preventDefault();run({filter:draft,page:1,pageSize:displayedPageSize});}}>
      <div className="iw-query-row">
        <CandidateSelector {...fields} kind="product" label="商品" selected={draft.products} multiple placeholder="商品款号 / 名称 / 系统货号" onChange={products=>setDraft(value=>({...value,products}))}/>
        <CandidateSelector {...fields} kind="category" label="商品分类" selected={draft.categories} multiple onChange={categories=>setDraft(value=>({...value,categories}))}/>
        <CandidateSelector {...fields} kind="warehouse" label="仓库" selected={draft.warehouses} multiple onChange={warehouses=>setDraft(value=>({...value,warehouses}))}/>
        <div className="iw-query-actions"><button type="button" className="btn ghost iw-filter-toggle" aria-expanded={advanced} aria-controls="iw-extra" onClick={()=>setAdvanced(value=>!value)}><span className="iw-filter-icon" aria-hidden>☷</span>{advanced?'收起筛选':'高级筛选'}{moreCount>0&&<span className="iw-filter-count">{moreCount}</span>}<span aria-hidden>{advanced?'▴':'▾'}</span></button><button type="submit" className="btn primary iw-query-button" disabled={busy}>查询</button><button type="button" className="btn ghost iw-reset" onClick={()=>setDraft(emptyInventoryFilter())}>重置</button></div>
      </div>
      {advanced&&<div className="iw-extra" id="iw-extra"><div className="iw-extra-field"><CandidateSelector {...fields} kind="supplier" label="供应商" selected={draft.suppliers} multiple onChange={suppliers=>setDraft(value=>({...value,suppliers}))}/></div><div className="iw-extra-field"><CandidateSelector {...fields} kind="fit" label="版型" selected={draft.fits} multiple onChange={fits=>setDraft(value=>({...value,fits}))}/></div><div className="iw-extra-field"><CandidateSelector {...fields} kind="season" label="季节" selected={draft.seasons} multiple onChange={seasons=>setDraft(value=>({...value,seasons}))}/></div></div>}
      <div className={`iw-query-note ${dirty?'iw-pending':''}`}>{dirty&&!busy?'条件已修改，点击“查询”更新结果。':''}</div>
    </form>
    <div className="iw-result-tools"><div className="iw-stats"><span className="iw-stats-label">{busy?'正在查询':result?'查询结果':'等待查询'}</span><span>{busy?'正在更新库存结果…':result?<>{summary} · <strong>{result.exactTotalProducts.toLocaleString('zh-CN')}</strong> 款商品 · {result.warehouseLabels.length} 个仓库 · 库存 <strong>{totalLabel(result.allMatchesTotal)}</strong></>:'选择筛选条件后点击查询'}</span>{success&&!busy&&<button ref={scopeTrigger} type="button" className="btn ghost iw-scope-link" title="查看本次查询使用的条件" onClick={()=>setScopeOpen(true)}>查看范围</button>}</div><div className="actions">{result&&result.products.length>0&&!busy&&<button type="button" className="btn ghost iw-plain-action" title={`${collapsedProducts.size===result.products.length?'展开':'折叠'}当前页商品`} onClick={()=>setCollapsedProducts(collapsedProducts.size===result.products.length?new Set():new Set(result.products.map(product=>product.id)))}>{collapsedProducts.size===result.products.length?'展开':'折叠'}</button>}<div className="iw-settings-wrap"><button ref={settingsTrigger} type="button" className="btn ghost iw-plain-action" aria-expanded={settingsOpen} onClick={settingsPopup.toggle}>显示设置</button>{settingsOpen&&<div ref={settingsPopup.panel} className="iw-pop iw-settings inventory-source-settings" data-kind="settings" style={settingsPosition} role="dialog" aria-label="库存显示设置"><div className="iw-pop-head"><strong>商品辅助字段</strong></div><div className="iw-source-settings-grid">{(['category','supplier','fit','sizeGroup','season']as const).map(key=><label key={key}><input type="checkbox" checked={settings[key]} onChange={event=>{const checked=event.currentTarget.checked;setSettings(value=>({...value,[key]:checked}));}}/>{settingLabels[key]}</label>)}</div><div className="iw-pop-head"><strong>汇总显示</strong></div><div className="iw-source-settings-grid">{(['subtotal','total','sizeDescription']as const).map(key=><label key={key}><input type="checkbox" checked={settings[key]} onChange={event=>{const checked=event.currentTarget.checked;setSettings(value=>({...value,[key]:checked}));}}/>{settingLabels[key]}</label>)}</div><footer><button type="button" className="btn ghost" onClick={()=>setSettings(defaultDisplaySettings)}>恢复默认</button><button type="button" className="btn ghost" onClick={settingsPopup.close}>关闭</button></footer></div>}</div></div></div>
    {snapshot.phase==='error'&&<div role="alert" className="iw-state iw-error">{snapshot.error instanceof Error?snapshot.error.message:'库存查询暂不可用。'} {result&&'以下保留上次成功结果，并非本次新结果。'}{sizeChangePending&&` 本次 ${requestedPageSize} 款/页读取失败，当前仍显示 ${displayedPageSize} 款/页；重试可重新读取 ${requestedPageSize} 款/页。`}<button type="button" className="btn ghost" onClick={()=>{if(snapshot.request)run(snapshot.request.parameters);}}>重试</button></div>}
    <div className={`iw-results${result?.products.length?' mx-results':''}`} tabIndex={0} role="region" aria-label="库存查询结果" aria-busy={busy}>
      {busy&&<div className="iw-loading" role="status"><span className="iw-spinner" aria-hidden/><strong>正在查询库存</strong><span>请稍候，正在整理商品与仓库数据…</span><button type="button" className="btn ghost" onClick={()=>query.cancel()}>取消本次读取</button></div>}
      {result?.products.length?<InventoryMatrix data={result} settings={settings} collapsedProducts={collapsedProducts} collapsedColors={collapsedColors} toggleProduct={id=>setCollapsedProducts(value=>toggle(value,id))} toggleColor={id=>setCollapsedColors(value=>toggle(value,id))} actions={{...actions,...(ledger?{onOpenCell:(target:InventoryCellTarget)=>{if(scope.active)setLedgerTarget(target);}}:{}),onViewProduct:openProduct}}/>:!busy&&<div className="iw-empty-host"><Empty description={<div className="inv-empty-copy"><strong>{emptyTitle}</strong><span>{emptyDescription}</span></div>}/></div>}
    </div>
    <InventoryPagination scope={scope} page={result?.page??1} pageSize={displayedPageSize} total={result?.exactTotalProducts??null} busy={busy} onPage={page=>{if(success)run({...success.parameters,page});}} onPageSize={setSize}/>
    {ledger&&ledgerTarget&&<InventoryLedgerDrawer key={`${ledgerTarget.warehouse.id}:${ledgerTarget.skuId}`} parent={scope} target={ledgerTarget} currentQuantity={ledgerQuantity} capability={ledger} close={()=>setLedgerTarget(null)}/>}
    {product&&<ProductDrawerHost key={`${product.id}:${productSequence.current}`} parentScope={scope} product={product} reader={productReader} close={closeProduct}/>}
    {scopeOpen&&success&&<StandardOverlay className="iw-scope-dialog" title="已执行查询范围" label="本次查询使用的条件" closeLabel="关闭查询范围" close={()=>{setScopeOpen(false);scopeTrigger.current?.focus();}} width={480}><ul>{scopeLines(success.parameters.filter).map(line=><li key={line}>{line}</li>)}</ul><p className="muted">每页 {success.parameters.pageSize} 款 · 第 {success.parameters.page} 页。当前编辑条件不改变此结果。</p></StandardOverlay>}
  </div>;
}
