import { UIButton } from '../components/standard-controls.tsx';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ProductFullPageConfiguration } from './product-page-contracts.ts';
import { captureProductFullPageConfiguration } from './product-page-configuration.ts';
import { guardedProductPageReader } from './product-page-reader.ts';
import { ProductFullPageHost } from './product-page-host.tsx';
import type { ProductEditorCapability, ProductEditorProps } from './product-editor-contracts.ts';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import type { ComponentType } from 'react';
import { ReadScope } from '../loading/read-scope.ts';
import { useDialogFocusReturn } from '../components/use-dialog-focus-return.ts';
import { ProductDrawerHost } from '../inventory/product-drawer-host.tsx';
import type { InventoryReader, Selection } from '../inventory/contracts.ts';
import { CandidateSelector } from '../components/candidate-selector.tsx';
import { InventoryPagination } from '../components/pagination.tsx';
import { useProductsFilterPopupHost } from './popup-host.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { formatQuantity } from '../inventory/model.ts';
import { Empty } from '@arco-design/web-react';
import { ProductFilterControl } from './filter-control.tsx';
import { createProductManagementQuery, guardedProductManagementReader } from './query-controller.ts';
import { emptyProductFilter, productFilterParameters, type ProductFilterDraft, type ProductManagementCandidateKind, type ProductManagementPageSize, type ProductManagementProductCapability, type ProductManagementReader, type ProductReturnContext, type ProductInventoryNavigationRequest } from './contracts.ts';

export interface ProductsPageProps {
  readonly openInventory?: (request: ProductInventoryNavigationRequest) => Promise<boolean>;
  /** Fresh route mount only; host binds this UI-only snapshot to the same identity/revision. */
  readonly receiveReturnContext?: ProductReturnContext;
  readonly scope: ReadScope; readonly reader: ProductManagementReader;
  readonly product?: ProductManagementProductCapability;
  readonly fullPage?: ProductFullPageConfiguration;
  readonly maintenance?: ProductEditorCapability;
  readonly onCanLeaveChange?: (guard: (() => boolean) | null) => void;
  /** Trusted host decides global identity invalidation; local scope is already cleared. */
  readonly onAccessFailure: (error: HttpQueryError) => void;
}
const editorLeaves = new AsyncLeafRegistry({ editor: { load: () => import('./product-editor.tsx') } }, { maxRetainedEntries: 1 });
let attachmentSequence = 0;
/** Source list loads its default first page on activation (not construction). Each effect owns fresh scope/query,
 * including React StrictMode replay and same-account permission revision changes. */
export function ProductsPageView(props: ProductsPageProps) {
  const [owner, setOwner] = useState<{ parent: ReadScope; source: ProductManagementReader; scope: ReadScope; reader: ProductManagementReader; query: ReturnType<typeof createProductManagementQuery> } | null>(null);
  useEffect(() => {
    const scope = new ReadScope(props.scope.identity, `${props.scope.routeInstanceId}:products:${++attachmentSequence}`, null, () => {});
    const abort = () => scope.dispose(); props.scope.signal.addEventListener('abort', abort, { once: true }); if (!props.scope.active) abort();
    const reader = guardedProductManagementReader(scope, props.reader, props.onAccessFailure), query = createProductManagementQuery(scope, reader);
    setOwner({ parent: props.scope, source: props.reader, scope, reader, query });
    // StrictMode discards its first attachment before this bounded initial read.
    const initial = props.receiveReturnContext ? props.receiveReturnContext.appliedQuery : { filter: productFilterParameters(emptyProductFilter()), page: 1, pageSize: 100 as const };
    queueMicrotask(() => { if (scope.active && initial) void query.run(initial); });
    return () => { props.scope.signal.removeEventListener('abort', abort); scope.dispose(); query.dispose(); };
  }, [props.scope, props.reader, props.onAccessFailure, props.receiveReturnContext]);
  return owner?.parent === props.scope && owner.source === props.reader ? <ProductsPageContent key={owner.scope.routeInstanceId} {...props} scope={owner.scope} reader={owner.reader} query={owner.query} /> : null;
}
const labels: Readonly<Record<ProductManagementCandidateKind, string>> = Object.freeze({ product: '商品', category: '商品分类', year: '年份', season: '季节', supplier: '供应商', fit: '版型', thickness: '厚薄', shape: '领型 / 裤型' });
const noCategories: readonly string[] = Object.freeze([]);
function ProductsPageContent(props: ProductsPageProps & { readonly query: ReturnType<typeof createProductManagementQuery> }) {
  const { scope, reader, query } = props;
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const [draft, setDraft] = useState<ProductFilterDraft>(()=>props.receiveReturnContext?.filterDraft??emptyProductFilter()), [advanced, setAdvanced] = useState(props.receiveReturnContext?.advanced??false), [initialSize, setInitialSize] = useState<ProductManagementPageSize>(props.receiveReturnContext?.initialPageSize??100);
  const [selectedProduct, setSelectedProduct] = useState<{ readonly target: Selection; readonly capability: ProductManagementProductCapability }|null>(null);
  const fullPage = useMemo(() => props.fullPage ? captureProductFullPageConfiguration(props.receiveReturnContext?.view==='read-only'&&props.fullPage.allowedTabs.includes('stock')?{...props.fullPage,initialTab:'stock'}:props.fullPage) : undefined, [props.fullPage,props.receiveReturnContext]);
  const [fullTarget, setFullTarget] = useState<{ readonly target: Selection; readonly configuration: ProductFullPageConfiguration } | null>(()=>props.receiveReturnContext?.view==='read-only'&&fullPage?.allowedTabs.includes('stock')?{target:props.receiveReturnContext.product,configuration:fullPage}:null);
  const fullActive = !!fullTarget && fullTarget.configuration === fullPage;
  const maintenance = props.maintenance && props.onCanLeaveChange ? props.maintenance : undefined;
  const [editTarget, setEditTarget] = useState<{ id: string | null; sequence: number; initialTab?: 'stock' } | null>(()=>props.receiveReturnContext?.view==='editor'&&maintenance?{id:props.receiveReturnContext.product.id,sequence:1,initialTab:'stock'}:null), editSequence = useRef(1), savedEdit = useRef(false);
  const editing = !!editTarget && !!maintenance;
  const list = useRef<HTMLDivElement>(null), visible = useRef(true); visible.current = !fullActive && !editing;
  const returnToList = useRef<{ trigger: HTMLElement; scroll: readonly { element: Element; top: number; left: number }[] } | null>(null);
  const restoredListScroll=useRef(props.receiveReturnContext??null),previousFullPage=useRef(fullPage);
  const fullReader = useMemo(() => fullPage ? guardedProductPageReader(scope, fullPage.reader, props.onAccessFailure) : null, [scope, fullPage, props.onAccessFailure]);
  const popupHost = useProductsFilterPopupHost(scope, !fullActive && !editing);
  const productFocus = useDialogFocusReturn(scope, !!selectedProduct);
  useEffect(() => { setSelectedProduct(null); }, [props.product]);
  useEffect(() => { if(previousFullPage.current!==fullPage){previousFullPage.current=fullPage;setFullTarget(null);} }, [fullPage]);
  useLayoutEffect(() => {
    if (fullActive || editing || !scope.active) return;
    if(restoredListScroll.current&&(snapshot.phase==='success'||restoredListScroll.current.appliedQuery===null)){
      const restored=restoredListScroll.current;restoredListScroll.current=null;
      for(const position of restored.listScroll){let element:Element|null=list.current;for(let depth=0;element&&depth<position.ancestorDepth;depth++)element=element.parentElement;if(element){element.scrollTop=position.top;element.scrollLeft=position.left;}}
      const table=list.current?.querySelector('.pm-table-scroll');if(table){table.scrollTop=restored.tableScroll.top;table.scrollLeft=restored.tableScroll.left;}
    }
    if(!returnToList.current)return;
    const saved = returnToList.current; returnToList.current = null;
    for (const value of saved.scroll) { value.element.scrollTop = value.top; value.element.scrollLeft = value.left; }
    const active = saved.trigger.ownerDocument.activeElement;
    if (active && active !== document.body && active.isConnected && active !== saved.trigger) return;
    if (saved.trigger.isConnected && !saved.trigger.matches(':disabled') && !saved.trigger.closest('[hidden],[inert]')) saved.trigger.focus({ preventScroll: true });
    else list.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [fullActive, editing, scope, snapshot.phase, snapshot.success]);
  const openFullPage = (target: Selection, trigger: HTMLElement) => {
    if (!scope.active || !fullPage || !visible.current) return;
    const scroll: { element: Element; top: number; left: number }[] = [];
    for (let element: Element | null = list.current; element; element = element.parentElement) scroll.push({ element, top: element.scrollTop, left: element.scrollLeft });
    const root = document.scrollingElement; if (root && !scroll.some(value => value.element === root)) scroll.push({ element: root, top: root.scrollTop, left: root.scrollLeft });
    visible.current = false; popupHost?.controller.close(); query.cancel(); setSelectedProduct(null);
    returnToList.current = { trigger, scroll }; setFullTarget({ target, configuration: fullPage });
    for (const value of scroll) { value.element.scrollTop = 0; value.element.scrollLeft = 0; }
  };
  const openEditor = (id: string | null, trigger: HTMLElement) => {
    if (!scope.active || !maintenance || !visible.current) return;
    const scroll: { element: Element; top: number; left: number }[] = [];
    for (let element: Element | null = list.current; element; element = element.parentElement) scroll.push({ element, top: element.scrollTop, left: element.scrollLeft });
    const root = document.scrollingElement; if (root && !scroll.some(value => value.element === root)) scroll.push({ element: root, top: root.scrollTop, left: root.scrollLeft });
    returnToList.current = { trigger, scroll }; savedEdit.current = false;
    visible.current = false; popupHost?.controller.close(); query.cancel(); setSelectedProduct(null);
    setEditTarget({ id, sequence: ++editSequence.current });
    for (const value of scroll) { value.element.scrollTop = 0; value.element.scrollLeft = 0; }
  };
  const closeEditor = () => {
    setEditTarget(null);
    const success = query.getSnapshot().success;
    if (savedEdit.current && success && scope.active) void query.run(success.parameters);
  };
  const navigateInventory = async (product:Selection,view:'editor'|'read-only') => {
    if(!scope.active||!props.openInventory)return false;
    const elements:Element[]=[];for(let element:Element|null=list.current;element;element=element.parentElement)elements.push(element);
    const saved=returnToList.current?.scroll;
    const scroll=restoredListScroll.current?.listScroll??elements.map((element,ancestorDepth)=>{const position=saved?.find(value=>value.element===element);return {ancestorDepth,top:position?.top??element.scrollTop,left:position?.left??element.scrollLeft};});
    const table=list.current?.querySelector('.pm-table-scroll');
    const returnContext:ProductReturnContext={version:1,product,view,tab:'stock',filterDraft:draft,appliedQuery:query.getSnapshot().success?.parameters??null,advanced,initialPageSize:initialSize,listScroll:scroll,tableScroll:restoredListScroll.current?.tableScroll??{top:table?.scrollTop??0,left:table?.scrollLeft??0}};
    return props.openInventory({product,returnContext});
  };
  const productSearchReader = useMemo<InventoryReader>(() => ({
    readInventory: async () => { throw new TypeError('Product search presentation has no inventory query capability.'); },
    readCandidates: async read => {
      if (!visible.current) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
      if (read.parameters.kind !== 'product') throw new TypeError('Only product search presentation is supported.');
      const data = await reader.readCandidates({ ...read, parameters: { kind: 'product', search: read.parameters.search, selectedIds: [], page: read.parameters.page, pageSize: 20 } });
      return { page: data.page, exactTotal: data.exactTotal, items: data.items };
    },
  }), [reader]);
  const success = snapshot.success, result = success?.data, busy = snapshot.phase === 'loading';
  const pageSize = success?.parameters.pageSize ?? initialSize, pendingSize = snapshot.request?.parameters.pageSize;
  const dirty = !!success && JSON.stringify(productFilterParameters(draft)) !== JSON.stringify(success.parameters.filter);
  const setSelection = (kind: ProductManagementCandidateKind, selected: readonly Selection[]) => { if (scope.active && visible.current) setDraft(value => ({ ...value, [kind]: selected })); };
  const sourceFilterHosts = { category:'product-arco-category', year:'product-arco-years', season:'product-arco-seasons', supplier:'product-arco-supplierId', fit:'product-arco-fitId', thickness:'product-arco-thickness', shape:'product-arco-shapeCode' };
  const filter = (kind: Exclude<ProductManagementCandidateKind,'product'>) => <ProductFilterControl key={kind} scope={scope} reader={reader} kind={kind} label={labels[kind]} selected={draft[kind]} popupHost={popupHost} sourceHost={{id:sourceFilterHosts[kind],className:kind==='category'?'iw-category-select-host':'iw-filter-host',ariaLabel:labels[kind]}} onChange={selected => setSelection(kind, selected)} />;
  const closeProduct = () => { productFocus.request(); setSelectedProduct(null); };
  if (snapshot.phase === 'disposed' || !scope.active) return <div className="iw-empty" role="status"><strong>当前读取范围已关闭</strong><p>权限或身份已变化，请重新进入商品信息。旧身份结果已清除。</p></div>;
  return <div className="products-workspace"><div ref={list} hidden={fullActive || editing} inert={fullActive || editing} className="pm-products pc-workbench pc-products">
    <div className="pm-head gold-head iw-head pc-page-head"><h1 tabIndex={-1}>商品信息</h1><div className="actions iw-head-actions"><button type="button" className="btn primary" disabled={!maintenance?.allowedActions.includes('CREATE')} title={maintenance?.allowedActions.includes('CREATE') ? '新增商品' : '商品新增维护尚未接入或当前无权操作'} data-pc="new-product" onClick={event => openEditor(null, event.currentTarget)}>新增商品</button></div></div>
    <form id="pc-filter" className="toolbar pc-master-filters iw-query" aria-label="商品信息筛选" onSubmit={event => { event.preventDefault(); if (visible.current) void query.run({ filter: productFilterParameters(draft), page: 1, pageSize }); }}>
      <div className="pc-filter-row iw-query-row"><CandidateSelector sourceHost={{id:"product-arco-search",className:"iw-product-select-host",ariaLabel:"商品搜索"}} scope={scope} reader={productSearchReader} popupHost={popupHost} kind="product" label="商品" selected={draft.product} categoryIds={noCategories} multiple placeholder="商品款号 / 名称 / 系统货号" {...(props.product ? { productReader: props.product.reader } : {})} onChange={selected => setSelection('product', selected)} />
        {filter('category')}{filter('year')}{filter('season')}
        <button type="button" className="btn ghost pc-more-toggle iw-filter-toggle" aria-expanded={advanced} data-pc="more-filters" aria-controls="pc-more-filters" onClick={() => setAdvanced(value => !value)}><span className="iw-filter-icon" aria-hidden>☷</span>{advanced?'收起筛选':'高级筛选'}<span aria-hidden>{advanced?'▴':'▾'}</span></button>
        <button type="submit" className="btn primary">查询</button><button type="button" className="btn ghost" data-pc="reset-filter" onClick={() => setDraft(emptyProductFilter())}>重置</button></div>
      {advanced && <div className="pc-filter-row pc-more-filters" id="pc-more-filters">{filter('supplier')}{filter('fit')}{filter('thickness')}{filter('shape')}</div>}
      {dirty && <p className="iw-query-note iw-dirty">条件已修改，点击「查询」后生效；当前仍显示上次已执行条件。</p>}
    </form>
    {busy && <div className="iw-loading-note" role="status">{result ? `正在读取${pendingSize !== pageSize ? ` ${pendingSize} 款/页` : ''}，以下保留上次成功结果。` : '正在读取商品信息…'}<UIButton type="button" className="iw-link" onClick={() => query.cancel()}>取消本次读取</UIButton></div>}
    {snapshot.phase === 'error' && <div className="iw-alert" role="alert">商品查询未完成，请重试或调整条件。{result && '以下保留上次成功结果，并非本次新结果。'}{pendingSize !== pageSize && `本次 ${pendingSize} 款/页读取失败，当前仍为 ${pageSize} 款/页。`}<UIButton type="button" className="iw-link" onClick={() => { if (snapshot.request) void query.run(snapshot.request.parameters); }}>重试</UIButton></div>}
    <section className="pc-list-table" aria-busy={busy}><div className="pm-table-scroll table-scroll" tabIndex={0} role="region" aria-label="商品列表，可横向滚动"><table className="pc-data-table" aria-label="商品信息"><thead><tr>{['款号','商品名称','商品分类','年份 / 季节','供应商','版型','厚薄','零售价','总库存','操作'].map((title,index)=><th key={title} className={index===7||index===8?'ui-number':undefined}>{title}</th>)}</tr></thead><tbody>{(result?.items??[]).map(item=><tr key={item.id}>
 <td><strong className="pc-product-code">{item.code}</strong></td><td title={item.name}>{item.name}</td><td title={item.categoryLabel??'未提供'}>{item.categoryLabel??''}</td><td>{[item.year,item.seasonLabel].filter(value=>value!==null).join(' / ')}</td><td>{item.supplierLabel??''}</td><td>{item.fits.map(fit=>fit.label).join('、')}</td><td>{item.thickness??''}</td><td className="num ui-number">{item.retailPrice??''}</td>
 <td className="num ui-number" title={item.totalStock===null?'全仓总库存未授权或未提供；未知不能按零展示':'已授权完整全仓范围的精确总库存'}>{item.totalStock===null?'未提供':formatQuantity(item.totalStock)}</td><td>{maintenance?.allowedActions.includes('EDIT')?<button type="button" className="btn ghost" data-pc="open-product" data-id={item.id} onClick={event=>openEditor(item.id,event.currentTarget)}>编辑</button>:<><button type="button" className="btn ghost" disabled={!props.product} title={props.product?'只读查看':'商品查看暂不可用'} onClick={event=>{if(!scope.active||!props.product)return;productFocus.capture(event.currentTarget);setSelectedProduct({target:{id:item.id,label:`${item.code} · ${item.name}`},capability:props.product});}}>查看</button>{fullPage&&<button type="button" className="btn ghost" aria-label={`整页查看商品：${item.code}`} onClick={event=>openFullPage({id:item.id,label:`${item.code} · ${item.name}`},event.currentTarget)}>只读整页</button>}</>}</td>
 </tr>)}</tbody></table>
      {!result?.items.length && <div id="pc-products-empty" className="iw-empty-host" data-state={result?'no-results':busy?'loading':snapshot.phase==='error'?'error':'idle'}><Empty description={<div className="inv-empty-copy"><strong>{result?'暂无符合条件的商品':busy?'正在查询':snapshot.phase==='error'?'查询未完成':'等待查询'}</strong><span>{result?'调整筛选条件后重新查询。':'选择筛选条件后，点击「查询」查看商品信息。'}</span></div>}/></div>}
    </div></section>
    <InventoryPagination className="pc-pagination" label="商品列表分页" selectAria="商品每页款数" scope={scope} page={result?.page ?? 1} pageSize={pageSize} total={result?.exactTotal ?? null} busy={busy}
      onPage={page => { if (success && visible.current) void query.run({ ...success.parameters, page }); }} onPageSize={size => { if (!visible.current) return; if (success) void query.run({ ...success.parameters, page: 1, pageSize: size }); else setInitialSize(size); }} />
    {selectedProduct && props.product && selectedProduct.capability === props.product && <ProductDrawerHost key={selectedProduct.target.id} parentScope={scope} product={selectedProduct.target} reader={props.product.reader} loadStyles={props.product.loadStyles} close={closeProduct} />}
  </div>{editing && maintenance && editTarget && props.onCanLeaveChange && <ProductEditorLeaf key={editTarget.sequence} parent={scope} productId={editTarget.id} capability={maintenance} onAccessFailure={props.onAccessFailure} onCanLeaveChange={props.onCanLeaveChange} {...(editTarget.initialTab?{initialTab:editTarget.initialTab}: {})} {...(props.openInventory?{onOpenInventory:(product:Selection)=>navigateInventory(product,'editor')}: {})} onClose={closeEditor} onSaved={() => { savedEdit.current = true; }} />}{fullActive && fullPage && fullReader && <ProductFullPageHost key={fullTarget.target.id} parent={scope} target={fullTarget.target} configuration={fullPage} reader={fullReader} {...(props.openInventory?{openInventory:()=>navigateInventory(fullTarget.target,'read-only')}: {})} close={() => setFullTarget(null)} />}</div>;
}

function ProductEditorLeaf(props: ProductEditorProps) {
  const style=useRef<{capability:ProductEditorCapability;promise:Promise<unknown>}|null>(null);
  const [attempt,setAttempt]=useState(0),[leaf,setLeaf]=useState<{parent:ReadScope;capability:ProductEditorCapability;View:ComponentType<ProductEditorProps>|null;error:boolean}|null>(null);
  useEffect(()=>{let attached=true;const next={parent:props.parent,capability:props.capability,View:null as ComponentType<ProductEditorProps>|null,error:false};setLeaf(next);
    if(style.current?.capability!==props.capability){const pending=Promise.resolve().then(()=>props.capability.loadStyles());style.current={capability:props.capability,promise:pending};void pending.catch(()=>{if(style.current?.promise===pending)style.current=null;});}
    void Promise.all([editorLeaves.load('editor',props.parent),style.current.promise]).then(([module])=>{if(attached&&props.parent.active)setLeaf({...next,View:module.ProductEditor});},()=>{if(attached&&props.parent.active)setLeaf({...next,error:true});});
    return()=>{attached=false;};
  },[props.parent,props.capability,attempt]);
  if(!props.parent.active)return null;
  const current=leaf?.parent===props.parent&&leaf.capability===props.capability?leaf:null;
  return current?.View?<current.View {...props}/>:<div className="product-editor-loading-head"><UIButton onClick={props.onClose}>返回商品信息</UIButton>{current?.error?<p role="alert">商品表单或样式未加载，尚未读取编辑资料。<UIButton onClick={()=>setAttempt(value=>value+1)}>重试</UIButton></p>:<p role="status">正在准备商品表单…</p>}</div>;
}
