import React, {createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {Alert, Button, ConfigProvider, Drawer, Empty, Pagination, Select, Spin, Table, TreeSelect} from '@arco-design/web-react';
import {IconDown, IconRight, IconSearch} from '@arco-design/web-react/icon';
import '@arco-design/web-react/dist/css/arco.css';
import './page-foundation.css';
import {createScopedPageStore, createScopedReadClient, inventoryMemberKey, quantityText} from './page-state.mjs';

export {createScopedPageStore, createScopedReadClient, inventoryMemberKey, quantityText};
const Services = createContext(null), roots = new WeakMap();

export function createPageServices({scope, request, getContext}) {
  return {scope, getContext, reads: createScopedReadClient({scope, request}), store: createScopedPageStore({scope})};
}
export function usePageServices() {
  const value = useContext(Services);
  if (!value) throw new Error('页面未接入公共宿主');
  return value;
}
export function usePageState(key, initial) {
  const services = usePageServices();
  const handle = useMemo(() => services.store.page(key, initial), [services, key]);
  const state = useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot);
  return [state, handle.update, handle];
}

export function savePageViewport(host, services, key) {
  if (!host) return;
  const field = host.contains(document.activeElement) ? document.activeElement.closest('[data-focus-key]') : null;
  services.store.page('viewport:' + key, {}).update({top: host.scrollTop, left: host.scrollLeft,
    windowTop: window.scrollY, windowLeft: window.scrollX, focusKey: field?.getAttribute('data-focus-key') || null});
}
export function restorePageViewport(host, services, key) {
  if (!host) return;
  const value = services.store.page('viewport:' + key, {}).getSnapshot();
  if (value.top == null) return;
  host.scrollTop = value.top; host.scrollLeft = value.left;
  window.scrollTo(value.windowLeft, value.windowTop);
  const field = value.focusKey && [...host.querySelectorAll('[data-focus-key]')].find(node => node.getAttribute('data-focus-key') === value.focusKey);
  const target = field?.matches('input,button,[tabindex]') ? field : field?.querySelector('input,button,[tabindex]');
  target?.focus({preventScroll: true});
}
/** Call with ready=true only after the real page data has produced its layout. */
export function usePageViewport(key, ready = true) {
  const services = usePageServices(), owner = services.scope();
  useLayoutEffect(() => {
    if (!ready) return;
    const host = document.querySelector('#react-page-host');
    const frame = requestAnimationFrame(() => restorePageViewport(host, services, key));
    return () => {cancelAnimationFrame(frame); if (owner === services.scope()) savePageViewport(host, services, key);};
  }, [services, owner, key, ready]);
}

/** Previous successful data is kept while a replacement read is pending. The
 * consumer supplies immutable data and the applied-query caption separately. */
export function usePageRequest(key, reader, dependencies = [], {enabled = true, cacheMs = 0} = {}) {
  const services = usePageServices(), readerRef = useRef(reader), generation = useRef(0);
  readerRef.current = reader;
  const retryKey = useRef(null);
  const [revision, retry] = useState(0), [state, setState] = useState({data: null, requestKey: null, loading: false, error: null});
  const owner = services.scope();
  useEffect(() => {
    if (!enabled) {setState(previous => ({...previous, loading: false})); return;}
    const current = ++generation.current, controller = new AbortController();
    const currentReader = readerRef.current;
    setState(previous => ({...previous, loading: true, error: null}));
    services.reads.read(key, control => currentReader(control), {signal: controller.signal, cacheMs, refresh: retryKey.current === key})
      .then(data => {if (current === generation.current && !controller.signal.aborted) {retryKey.current = null; setState({data, requestKey: key, loading: false, error: null});}})
      .catch(error => {if (current === generation.current && !controller.signal.aborted && !error.stale) setState(previous => ({...previous, loading: false, error}));});
    return () => {generation.current++; controller.abort();};
  }, [services, owner, key, enabled, cacheMs, revision, ...dependencies]);
  return {...state, retry: useCallback(() => {retryKey.current = key; retry(value => value + 1);}, [key])};
}

export function LoadState({loading = false, error, empty = false, retry, children}) {
  const alert = error && <Alert type="error" title="读取未完成" content={error.message || String(error)} action={retry && <Button onClick={retry}>重试</Button>}/>;
  // A failed replacement read must not remove the last successful table, filter
  // hosts or focus. The applied-range caption remains owned by the page state.
  if (children !== null && children !== undefined && children !== false) return <div className="erp-read-state">{alert}<Spin loading={loading} style={{display: 'block'}}>{children}</Spin></div>;
  if (error) return alert;
  if (loading && !children) return <div className="erp-page-status" role="status"><Spin/><span>正在读取当前页面资料…</span></div>;
  if (empty) return <Empty description="当前范围没有查询结果"/>;
  return <Spin loading={loading} style={{display: 'block'}}>{children}</Spin>;
}

class PageBoundary extends React.Component {
  state = {error: null};
  static getDerivedStateFromError(error) {return {error};}
  render() {
    if (this.state.error) return <LoadState error={this.state.error} retry={() => this.setState({error: null})}/>;
    return this.props.children;
  }
}
const stopLegacyBubble = event => event.stopPropagation();
export function mount(host, {route, scope, Component, props = {}, services}) {
  if (!host || typeof Component !== 'function' || !scope || !services) throw new TypeError('Page root, component and scoped services are required');
  let record = roots.get(host);
  if (!record) {
    // React's delegated root handlers still run; unrelated document bubble
    // handlers cannot interpret events from a modern page as legacy actions.
    const root = createRoot(host);
    for (const type of ['click', 'change', 'input', 'keydown', 'submit']) host.addEventListener(type, stopLegacyBubble);
    record = {root}; roots.set(host, record);
  }
  record.route = route; record.scope = scope; record.services = services;
  host.hidden = false;
  record.root.render(<ConfigProvider size="small" getPopupContainer={() => host}>
    <Services.Provider value={services}><div className="erp-page-foundation">
      <PageBoundary key={JSON.stringify([route, scope])}><Component {...props} route={route}/></PageBoundary>
    </div></Services.Provider>
  </ConfigProvider>);
}
export function unmount(host) {
  const record = host && roots.get(host);
  if (record) {
    if (record.scope === record.services.scope()) savePageViewport(host, record.services, record.route);
    record.root.unmount(); roots.delete(host);
    for (const type of ['click', 'change', 'input', 'keydown', 'submit']) host.removeEventListener(type, stopLegacyBubble);
  }
  if (host) host.hidden = true;
}

export function PageLayout({title, actions, filters, summary, children, footer}) {
  return <section className="erp-page-layout"><div className="erp-page-heading"><h1>{title}</h1><div className="erp-page-actions">{actions}</div></div>
    {filters}{summary && <div className="erp-page-summary">{summary}</div>}{children}{footer && <footer className="erp-page-footer">{footer}</footer>}
  </section>;
}
export function InventoryFilterBar({children, advanced, expanded = false, onExpand, onQuery, onReset, busy = false, dirty = false}) {
  return <section className="erp-inventory-filters" aria-label="库存查询条件"><div className="erp-filter-row">
    <div className="erp-filter-fields">{children}</div><div className="erp-filter-actions">
      {advanced && <Button type="text" data-focus-key="inventory:advanced" onClick={() => onExpand?.(!expanded)} aria-expanded={expanded}>高级筛选 <IconDown/></Button>}
      <Button type="primary" data-focus-key="inventory:query" onClick={onQuery} loading={busy}>查询</Button><Button data-focus-key="inventory:reset" onClick={onReset} disabled={busy}>重置</Button>
    </div></div>{expanded && <div className="erp-filter-advanced">{advanced}</div>}
    {dirty && <p className="erp-filter-pending" role="status">查询条件已修改，点击“查询”后更新结果。</p>}
  </section>;
}
export function WarehousePicker({value, options = [], onChange, disabled, placeholder = '选择仓库'}) {
  const rootKey = '__erp_inventory_all_warehouses__';
  const selected = value || [], all = options.length > 0 && options.every(option => selected.includes(option.value)) && selected.length === options.length;
  const treeData = [{key: rootKey, value: rootKey, title: '全部仓库', children: options.map(option => ({key: option.value, value: option.value, title: option.label}))}];
  return <TreeSelect aria-label="仓库" className="erp-warehouse-picker" treeCheckable treeCheckStrictly={false} treeCheckedStrategy="parent"
    allowClear allowSearch value={all ? [rootKey] : selected} treeData={treeData} disabled={disabled} placeholder={placeholder} maxTagCount={1}
    onChange={next => onChange(next.includes(rootKey) ? options.map(option => option.value) : next.filter(id => options.some(option => option.value === id)))}/>;
}
export function CategoryPicker({value, treeData, onChange, disabled}) {
  return <TreeSelect aria-label="商品分类" className="erp-category-picker" treeCheckable allowClear allowSearch value={value} treeData={treeData} onChange={onChange} disabled={disabled} placeholder="全部分类" maxTagCount={1}/>;
}

/** Server supplies explicit opaque value/label items. A missing cache entry is
 * never interpreted as a missing product; remote search/paging remains primary. */
export function ProductPicker({value, selectedOptions = [], onChange, loadPage, cacheKey = 'inventory-products', size = 20, disabled = false}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [page, setPage] = useState(1);
  const selected = useRef(new Map());
  const services = usePageServices(), previousOwner = useRef(services.scope());
  const owner = services.scope();
  if (previousOwner.current !== owner) {previousOwner.current = owner; selected.current = new Map();}
  for (const option of selectedOptions) selected.current.set(option.value, option);
  const requestKey = JSON.stringify([cacheKey, query, page, size]);
  const read = usePageRequest(requestKey, async control => {
    const result = await loadPage({q: query, page, size, signal: control.signal});
    if (!Array.isArray(result?.items) || !Number.isSafeInteger(result.total) || result.total < 0 || result.items.some(item => typeof item.value !== 'string' || !item.value || item.label == null)) throw new Error('商品搜索结果缺少已核实的身份');
    return result;
  }, [], {enabled: open});
  const current = read.requestKey === requestKey ? read.data?.items || [] : [];
  const resultTotal = read.requestKey === requestKey ? read.data?.total : null;
  // Keep labels for selected identities across remote pages without collecting
  // the entire catalogue. Unselected pages are discarded.
  for (const item of current) if (value.includes(item.value)) selected.current.set(item.value, item);
  for (const key of selected.current.keys()) if (!value.includes(key)) selected.current.delete(key);
  const options = [...new Map([...current, ...value.map(key => selected.current.get(key) || {value: key, label: '已选商品（详情待加载）'})].map(item => [item.value, item])).values()];
  return <Select aria-label="商品" className="erp-product-picker" mode="multiple" value={value} options={options} disabled={disabled}
    placeholder="输入款号或商品名称" allowClear allowSearch filterOption={false} inputValue={query} maxTagCount={1}
    prefix={<IconSearch/>} loading={read.loading} onVisibleChange={setOpen}
    onSearch={text => {setQuery(text); setPage(1);}}
    onChange={next => {for (const item of current) if (next.includes(item.value)) selected.current.set(item.value, item); onChange(next);}}
    dropdownRender={menu => <div className="erp-product-options">{read.error ? <LoadState error={read.error} retry={read.retry}/> : menu}
      <div className="erp-product-option-footer"><span>{read.loading ? '正在搜索…' : resultTotal == null ? '尚未取得查询结果' : `共 ${resultTotal} 款`}</span>
        <Pagination simple current={page} pageSize={size} total={resultTotal || 0} onChange={setPage} disabled={read.loading || resultTotal == null}/></div>
    </div>}/>;
}

export function InventoryPagination({page, size, total, onChange, disabled = false}) {
  return <div className="erp-inventory-pagination"><Pagination current={page} pageSize={size} total={total} sizeCanChange
    sizeOptions={[20, 50, 100, 200, 500]} disabled={disabled} onChange={next => onChange(next, size)} onPageSizeChange={next => onChange(1, next)}
    showTotal={count => `共 ${count} 款`}/></div>;
}
export const QuantityCell = memo(function QuantityCell({cell, onOpen, focusKey}) {
  const known = cell?.quantity == null && cell?.knownQuantity != null;
  const quantity = known ? '已核 ' + quantityText(cell.knownQuantity) : quantityText(cell?.quantity), members = cell?.members || [], keys = members.map(inventoryMemberKey);
  if (new Set(keys).size !== keys.length) throw new Error('数量单元重复引用了原库存身份');
  const className = 'erp-quantity' + (quantity === '未知' ? ' is-unknown' : String(cell?.quantity ?? cell?.knownQuantity).startsWith('-') ? ' is-negative' : '');
  const props = {'data-original-members': JSON.stringify(keys), 'data-focus-key': focusKey, className, title: known ? '仍有未知格，显示的是已核原单元数量' : undefined};
  if (!onOpen || !members.length) return <span {...props}>{quantity}</span>;
  return <button {...props} type="button" onClick={() => onOpen({quantity: cell.quantity, members, keys})} aria-label={`查看 ${quantity} 的原库存来源`}>{quantity}</button>;
});
export function InventoryMatrix({rows, sizeColumns, onOpenCell, identityColumns, loading = false, height, rowClassName, total = true}) {
  const keys = rows.map(row => row.key);
  if (keys.some(key => typeof key !== 'string' || !key) || new Set(keys).size !== keys.length) throw new Error('矩阵行缺少唯一身份');
  const columns = useMemo(() => [
    ...(identityColumns || [
      {title: '款号 / 商品名称', dataIndex: 'productLabel', width: 190, fixed: 'left'},
      {title: '颜色', dataIndex: 'colorLabel', width: 100},
      {title: '仓库', dataIndex: 'warehouseLabel', width: 170},
      {title: '单位', dataIndex: 'unitLabel', width: 60},
    ]),
    ...sizeColumns.map(column => ({title: column.label, dataIndex: `cells.${column.key}`, width: column.width || 74, align: 'right',
      render: (_, row) => <QuantityCell cell={row.cells?.[column.key]} focusKey={'inventory:' + (row.blockKey || '') + ':cell:' + row.key + ':' + column.key} onOpen={onOpenCell && (value => onOpenCell({...value, row, column}))}/>})),
    ...(total ? [{title: '已核单元合计', width: 100, align: 'right', render: (_, row) => <QuantityCell cell={row.cells?.total} focusKey={'inventory:' + (row.blockKey || '') + ':cell:' + row.key + ':total'} onOpen={onOpenCell && (value => onOpenCell({...value, row, column: {key: 'total', label: '已核单元合计'}}))}/>}]: []),
  ], [identityColumns, sizeColumns, onOpenCell, total]);
  return <Table className="erp-inventory-matrix" rowKey="key" columns={columns} data={rows} pagination={false} size="small" border={{cell: true}}
    rowClassName={rowClassName} loading={loading} virtualized={Boolean(height)} virtualListProps={{itemHeight: 36, buffer: 5}}
    scroll={{x: 'max-content', ...(height ? {y: height} : {})}} noDataElement={<Empty description="当前页无库存结果"/>}/>;
}
export function MatrixSection({title, expanded, onExpand, children, summary}) {
  return <section className="erp-matrix-section"><div className="erp-matrix-section-heading"><Button type="text" onClick={() => onExpand(!expanded)} aria-expanded={expanded}>
    {expanded ? <IconDown/> : <IconRight/>}{title}</Button>{summary}</div>{expanded && children}</section>;
}

function DetailContent({load, render, requestKey}) {
  const read = usePageRequest(requestKey, load);
  return <LoadState loading={read.loading} error={read.error} retry={read.retry}>{read.data != null && render(read.data)}</LoadState>;
}
export function DetailHost({visible, title, requestKey, load, render, onClose, width = 680}) {
  const trigger = useRef(null);
  useEffect(() => {if (visible) trigger.current = document.activeElement;}, [visible]);
  return <Drawer className="erp-foundation-popup" visible={visible} title={title} width={width} onCancel={onClose} unmountOnExit focusLock
    getPopupContainer={() => document.body} afterClose={() => {if (trigger.current?.isConnected) trigger.current.focus();}}>
    {visible && <DetailContent key={requestKey} requestKey={requestKey} load={load} render={render}/>}
  </Drawer>;
}

const api = {mount, unmount, createPageServices, usePageServices, usePageState, usePageRequest, usePageViewport, savePageViewport, restorePageViewport, LoadState, PageLayout, InventoryFilterBar,
  WarehousePicker, CategoryPicker, ProductPicker, InventoryPagination, InventoryMatrix, MatrixSection, QuantityCell, DetailHost,
  quantityText, inventoryMemberKey, createScopedPageStore, createScopedReadClient};
if (typeof window !== 'undefined') window.ERP_PAGE_FOUNDATION = Object.freeze(api);
export default api;
