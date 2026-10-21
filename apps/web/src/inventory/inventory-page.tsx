import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import type { Selection } from './contracts.ts';
import type { ProductReadOnlyReader } from './product-contracts.ts';
import { ProductDrawerHost } from './product-drawer-host.tsx';
import { EmptyIcon } from '../demo-presentation/icons.tsx';
import { CandidateSelector } from '../components/candidate-selector.tsx';
import { InventoryPagination } from '../components/pagination.tsx';
import { emptyInventoryFilter, type InventoryActions, type InventoryFilter, type InventoryPageSize, type InventoryParameters, type InventoryReader } from './contracts.ts';
import { createInventoryQuery, totalLabel } from './model.ts';
import { defaultDisplaySettings, InventoryMatrix, type InventoryDisplaySettings } from './inventory-matrix.tsx';
import { useInventorySettingsPopup } from './settings-popup.ts';

export interface InventoryPageProps {
  readonly scope: ReadScope;
  readonly reader: InventoryReader;
  readonly productReader: ProductReadOnlyReader;
  readonly actions?: Pick<InventoryActions, 'onOpenCell'>;
}
const names = { products: '商品', category: '商品分类', warehouses: '仓库', suppliers: '供应商', fits: '版型', seasons: '季节' };
function scopeLines(filter: InventoryFilter): string[] {
  return (Object.keys(names) as (keyof typeof names)[]).map(key => {
    const value = filter[key];
    const labels = key === 'category' ? filter.category ? [filter.category.label] : [] : (value as readonly { label: string }[]).map(item => item.label);
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
    return () => query.dispose();
  }, [props.scope, props.reader]);
  return owner?.scope === props.scope && owner.reader === props.reader
    ? <InventoryPageContent {...props} query={owner.query} /> : null;
}

function InventoryPageContent({ scope, reader, productReader, actions = {}, query }: InventoryPageProps & { readonly query: ReturnType<typeof createInventoryQuery> }) {
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const [draft, setDraft] = useState<InventoryFilter>(emptyInventoryFilter);
  // Only pre-query selection is local. After a success, the applied size is the
  // single visible/next-query source of truth; a pending size lives in request.
  const [initialPageSize, setInitialPageSize] = useState<InventoryPageSize>(100);
  const [advanced, setAdvanced] = useState(false);
  const [product, setProduct] = useState<Selection | null>(null);
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
  const scopeDialog = useRef<HTMLDialogElement>(null);
  const scopeTrigger = useRef<HTMLButtonElement>(null);
  const settingsTrigger = settingsPopup.trigger;
  const settingsPosition = settingsPopup.position;
  useEffect(() => {
    if (!scopeOpen) return;
    const dialog = scopeDialog.current;
    if (typeof dialog?.showModal === 'function') dialog.showModal(); else dialog?.setAttribute('open', '');
    return () => { dialog?.close?.(); };
  }, [scopeOpen]);
  const success = snapshot.success;
  const result = success?.data;
  const busy = snapshot.phase === 'loading';
  const displayedPageSize = success?.parameters.pageSize ?? initialPageSize;
  const requestedPageSize = snapshot.request?.parameters.pageSize;
  const sizeChangePending = !!result && requestedPageSize !== undefined && requestedPageSize !== displayedPageSize;
  const dirty = !!success && JSON.stringify(draft) !== JSON.stringify(success.parameters.filter);
  const run = (parameters: InventoryParameters) => { setCollapsedProducts(new Set()); setCollapsedColors(new Set()); void query.run(parameters); };
  const refresh = () => { if (success) run(success.parameters); };
  const setSize = (size: InventoryPageSize) => {
    if (success) run({ ...success.parameters, page: 1, pageSize: size });
    else setInitialPageSize(size);
  };
  const fields = { reader, scope, categoryId: draft.category?.id ?? null };
  const settingLabels: Readonly<Record<keyof InventoryDisplaySettings, string>> = { category: '商品分类', supplier: '供应商', fit: '版型', sizeGroup: '尺码组', season: '季节', subtotal: '颜色小计', total: '商品合计', sizeDescription: '显示尺码组说明' };
  if (snapshot.phase === 'disposed') return <div className="iw-empty" role="status"><strong>当前读取范围已关闭</strong><p>请重新进入库存页。旧身份结果已清除。</p></div>;
  return <div className="iw-workbench">
    <div className="iw-head"><h1>库存状况表</h1><div className="iw-actions iw-head-actions"><button type="button" className="iw-text-button" disabled title="完整查询结果导出尚未接入">导出</button><button type="button" className="iw-text-button" disabled={!result || busy} onClick={refresh}>刷新</button><button type="button" className="iw-text-button" disabled title="完整查询结果打印尚未接入">打印</button></div></div>
    <form className="iw-query" aria-label="库存筛选" onSubmit={event => { event.preventDefault(); run({ filter: draft, page: 1, pageSize: displayedPageSize }); }}>
      <div className="iw-query-row">
        <CandidateSelector {...fields} kind="product" label="商品" selected={draft.products} multiple placeholder="商品款号 / 名称 / 系统货号" onChange={products => setDraft(value => ({ ...value, products }))} />
        <CandidateSelector {...fields} kind="category" label="商品分类" selected={draft.category ? [draft.category] : []} onChange={items => setDraft(value => ({ ...value, category: items[0] ?? null }))} />
        <CandidateSelector {...fields} kind="warehouse" label="仓库" selected={draft.warehouses} multiple onChange={warehouses => setDraft(value => ({ ...value, warehouses }))} />
        <div className="iw-query-actions"><button type="button" className="iw-text-button iw-filter-toggle" aria-expanded={advanced} aria-controls="iw-advanced" onClick={() => setAdvanced(value => !value)}>{advanced ? '收起筛选 ⌃' : '高级筛选 ⌄'}</button><button type="submit" className="iw-button iw-primary">查询</button><button type="button" className="iw-button iw-reset" onClick={() => setDraft(emptyInventoryFilter())}>重置</button></div>
      </div>
      {advanced && <div className="iw-advanced" id="iw-advanced">
        <CandidateSelector {...fields} kind="supplier" label="供应商" selected={draft.suppliers} multiple onChange={suppliers => setDraft(value => ({ ...value, suppliers }))} />
        <CandidateSelector {...fields} kind="fit" label="版型" selected={draft.fits} multiple onChange={fits => setDraft(value => ({ ...value, fits }))} />
        <CandidateSelector {...fields} kind="season" label="季节" selected={draft.seasons} multiple onChange={seasons => setDraft(value => ({ ...value, seasons }))} />
      </div>}
      <p className={`iw-query-note ${dirty ? 'iw-dirty' : ''}`}>{dirty ? '条件已修改，点击「查询」后生效；当前结果仍使用上次已执行条件。' : ''}</p>
    </form>
    <div className="iw-result-tools"><div className="iw-stats"><strong>{busy ? '正在查询' : snapshot.phase === 'error' ? '查询未完成' : result ? '查询结果' : '等待查询'}</strong><span>{result ? `${result.exactTotalProducts.toLocaleString('zh-CN')} 款商品 · ${result.warehouseLabels.length} 个仓库 · 全部匹配库存 ${totalLabel(result.allMatchesTotal)}` : busy ? '正在读取当前查询范围…' : '选择筛选条件后点击查询'}</span>{success && <button ref={scopeTrigger} type="button" className="iw-link" onClick={() => setScopeOpen(true)}>查看范围</button>}</div><div className="iw-actions">{result && result.products.length > 0 && <button type="button" className="iw-text-button" onClick={() => setCollapsedProducts(collapsedProducts.size === result.products.length ? new Set() : new Set(result.products.map(product => product.id)))}>{collapsedProducts.size === result.products.length ? '展开' : '折叠'}</button>}<div className="iw-settings-wrap"><button ref={settingsTrigger} type="button" className="iw-text-button" aria-expanded={settingsOpen} onClick={settingsPopup.toggle}>显示设置</button>{settingsOpen && <div ref={settingsPopup.panel} className="iw-settings" style={settingsPosition} role="dialog" aria-label="库存显示设置"><div className="iw-settings-body"><div className="iw-pop-head"><strong>商品辅助字段</strong></div><div className="iw-settings-grid">{(['category', 'supplier', 'fit', 'sizeGroup', 'season'] as const).map(key => <label key={key}><input type="checkbox" checked={settings[key]} onChange={event => setSettings(value => ({ ...value, [key]: event.target.checked }))} />{settingLabels[key]}</label>)}</div><div className="iw-pop-head"><strong>汇总显示</strong></div><div className="iw-settings-grid">{(['subtotal', 'total', 'sizeDescription'] as const).map(key => <label key={key}><input type="checkbox" checked={settings[key]} onChange={event => setSettings(value => ({ ...value, [key]: event.target.checked }))} />{settingLabels[key]}</label>)}</div><p className="iw-settings-note muted">隐藏版型时只读汇总，显示版型后查看各自库存；SKU 身份不变。</p></div><div className="iw-actions"><button type="button" className="iw-button iw-ghost" onClick={() => setSettings(defaultDisplaySettings)}>恢复默认</button><button type="button" className="iw-button iw-ghost" onClick={settingsPopup.close}>关闭</button></div></div>}</div></div></div>
    {snapshot.phase === 'error' && <div role="alert" className="iw-alert">{snapshot.error instanceof Error ? snapshot.error.message : '库存查询暂不可用。'} {result && '以下保留上次成功结果，并非本次新结果。'}{sizeChangePending && ` 本次 ${requestedPageSize} 款/页读取失败，当前仍显示 ${displayedPageSize} 款/页；重试可重新读取 ${requestedPageSize} 款/页。`}<button type="button" className="iw-link" onClick={() => { if (snapshot.request) run(snapshot.request.parameters); }}>重试</button></div>}
    {busy && <div className="iw-loading-note" role="status">{result ? sizeChangePending ? `正在按 ${requestedPageSize} 款/页更新，以下仍为 ${displayedPageSize} 款/页的上次结果。` : '正在更新，以下为上次已执行范围的结果。' : '正在加载库存…'}<button type="button" className="iw-link" onClick={() => query.cancel()}>取消本次读取</button></div>}
    {<div className="iw-results" tabIndex={0} role="region" aria-label="库存查询结果" aria-busy={busy}>
      {result ? result.products.length ? <InventoryMatrix data={result} settings={settings} collapsedProducts={collapsedProducts} collapsedColors={collapsedColors} toggleProduct={id => setCollapsedProducts(value => toggle(value, id))} toggleColor={id => setCollapsedColors(value => toggle(value, id))} actions={{ ...actions, onViewProduct: openProduct }} /> : <div className="iw-empty"><span className="iw-empty-icon" aria-hidden="true"><EmptyIcon /></span><strong>没有匹配的库存结果</strong><p>本次查询已完成，可调整条件后重新查询。</p></div> : <div className="iw-empty"><span className="iw-empty-icon" aria-hidden="true"><EmptyIcon /></span><strong>{busy ? '正在查询' : snapshot.phase === 'error' ? '查询未完成' : '等待查询'}</strong><p>{busy ? '只读取当前条件的商品页。' : snapshot.phase === 'error' ? '请重试，或调整条件后重新查询。' : '设置筛选条件后，点击「查询」查看库存。'}</p></div>}
    </div>}
    <InventoryPagination scope={scope} page={result?.page ?? 1} pageSize={displayedPageSize} total={result?.exactTotalProducts ?? null} busy={busy} onPage={page => { if (success) run({ ...success.parameters, page }); }} onPageSize={setSize} />
    {product && <ProductDrawerHost key={`${product.id}:${productSequence.current}`} parentScope={scope} product={product} reader={productReader} close={closeProduct} />}
    {scopeOpen && success && <dialog ref={scopeDialog} className="iw-scope-dialog" aria-label="本次查询使用的条件" onCancel={() => { setScopeOpen(false); scopeTrigger.current?.focus(); }} onClose={() => setScopeOpen(false)}><div className="iw-pop-head"><strong>已执行查询范围</strong><button type="button" className="iw-text-button" aria-label="关闭查询范围" onClick={() => { setScopeOpen(false); scopeTrigger.current?.focus(); }}>×</button></div><ul>{scopeLines(success.parameters.filter).map(line => <li key={line}>{line}</li>)}</ul><p className="muted">每页 {success.parameters.pageSize} 款 · 第 {success.parameters.page} 页。当前编辑条件不改变此结果。</p></dialog>}
  </div>;
}
