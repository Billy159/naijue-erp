import React, {memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Alert, Button, Drawer, Input, Select, Switch} from '@arco-design/web-react';
import {IconDown, IconRight} from '@arco-design/web-react/icon';
import {CategoryPicker, InventoryFilterBar, InventoryMatrix, InventoryPagination, LoadState, MatrixSection, PageLayout,
  ProductPicker, usePageRequest, usePageServices, usePageState, usePageViewport, WarehousePicker} from './page-foundation.jsx';
import {inventoryBlockRows, inventoryMatrixMarkup, inventoryMatrixReport, projectInventoryMatrix, sourceCaption} from './inventory-matrix-view.mjs';
import {CorrectionTargetPanel, LedgerPanel, MemberPanel, OutputPanel, ProductPanel, SourcePanel, pickerOptions} from './inventory-page-panels.jsx';
import './inventory-page-react.css';

const EMPTY = Object.freeze({});
const copy = value => structuredClone(value);
const values = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
const recordId = row => typeof row === 'object' ? String(row.value ?? row.id ?? row.uuid ?? row.code ?? '') : String(row ?? '');
const recordLabel = row => typeof row === 'object' ? String(row.name ?? row.label ?? row.title ?? row.code ?? recordId(row)) : String(row ?? '');
const toOptions = rows => (rows || []).map(row => ({value: recordId(row), label: recordLabel(row)})).filter(row => row.value);
const nameOptions = rows => (rows || []).map(row => ({value: recordLabel(row), label: recordLabel(row)})).filter(row => row.value);
function toTree(rows = []) {
  const byId = new Map(rows.map(row => {const id = recordId(row); return [id, {key: id, value: id, title: recordLabel(row), children: []}];}));
  const roots = [];
  for (const row of rows) {
    const node = byId.get(recordId(row)), parent = byId.get(String(row.parentId ?? row.parent_id ?? row.parent ?? ''));
    if (parent && parent !== node) parent.children.push(node); else if (node.value) roots.push(node);
  }
  return roots;
}
function initialDraft(warehouses) {
  return {products: [], keyword: '', categories: [], warehouses: warehouses.map(recordId).filter(Boolean),
    more: {supplierId: [], fitId: [], season: []}, unit: '', nonzero: false, view: 'original'};
}
function initialPageState(warehouses) {
  return {draft: initialDraft(warehouses), applied: null, page: 1, size: 100, revision: 0, requestVersion: null,
    advanced: false, settingsOpen: false, scopeOpen: false, totalsOpen: false,
    display: {category: true, supplierId: false, fitId: false, groupId: false, season: false, subtotal: false, total: true, sizeDescription: false},
    productOptions: [], foldedBlocks: {}, foldedColors: {}, scrolls: {}, lastSnapshot: null, lastProjection: null,
    lastApplied: null, lastPage: 1, lastSize: 100, lastRequestKey: null, snapshotScope: null};
}
const versionToken = snapshot => snapshot ? [snapshot.readVersion, snapshot.catalogVersion, snapshot.source] : null;
const snapshotScope = (owner, snapshot) => JSON.stringify([owner, versionToken(snapshot), snapshot.query, snapshot.page, snapshot.size]);
function normalizeDraft(draft) {
  return {products: [...new Set(values(draft.products).map(String))], keyword: String(draft.keyword || '').trim(),
    categories: [...new Set(values(draft.categories).map(String))], warehouses: [...new Set(values(draft.warehouses).map(String))],
    more: Object.fromEntries(['supplierId', 'fitId', 'season'].map(key => [key, [...new Set(values(draft.more?.[key]).map(String))]])),
    unit: String(draft.unit || ''), nonzero: draft.nonzero === true, view: draft.view === 'standard' ? 'standard' : 'original'};
}
function FilterSelect({label, value, options, onChange}) {
  return <div className="erp-inventory-advanced-field"><span>{label}</span><Select aria-label={label} mode="multiple" allowClear allowSearch maxTagCount={1}
    value={value} options={options} onChange={onChange} placeholder={'全部' + label}/></div>;
}
function RangeSummary({snapshot, query, references, open, onExpand, totalsOpen, onTotals}) {
  const warehouses = new Map(references.warehouses.map(row => [recordId(row), recordLabel(row)]));
  return <div className="erp-inventory-summary-content">
    <div className="erp-page-summary"><strong>查询结果</strong><span>共 {snapshot.productCount} 款商品</span><span>{query.warehouses.length} 个仓库</span>
      <span>当前页 {snapshot.originalCells.length} 个原库存单元</span><span>全部匹配 {snapshot.rowCount} 个原库存单元</span>
      <Button type="text" onClick={() => onExpand(!open)}>查看范围</Button><Button type="text" onClick={() => onTotals(!totalsOpen)}>全范围单位合计</Button></div>
    {open && <div className="erp-inventory-scope" aria-label="已执行范围"><span>仓库：{query.warehouses.map(id => warehouses.get(id) || id).join('、')}</span>
      <span>商品：{query.products.length ? query.products.length + ' 个指定身份' : query.keyword || '全部匹配商品'}</span>
      <span>展示：{snapshot.view === 'standard' ? '标准展示' : '原始规格'}；负数 {snapshot.negative} 个，单位未知 {snapshot.unknown} 个</span>
      <span>分类：{query.categories.length ? query.categories.map(id => (references.categories || []).find(row => recordId(row) === id)?.name || id).join('、') : '全部分类'}</span>
      <span>高级条件：{[['供应商',query.more.supplierId,references.suppliers],['版型',query.more.fitId,references.fits],['季节',query.more.season,references.seasons]].map(([label,ids,rows]) =>
        label + '：' + (ids.length ? ids.map(id => (rows || []).find(row => recordId(row) === id || recordLabel(row) === id)?.name || id).join('、') : '全部')).join('；')}；单位：{query.unit || '全部'}；{query.nonzero ? '仅非零' : '含零单元'}</span>
      <span>{sourceCaption(snapshot.source)}</span></div>}
    {totalsOpen && <div className="erp-inventory-unit-totals"><strong>以下为服务端全部匹配范围合计，包含其他商品页</strong>
      <div className="erp-inventory-unit-total-list">{snapshot.unitTotals.map((row, index) => <span key={JSON.stringify([row.unit, row.unknownSkuId, index])}>
        {row.unit || '单位待核实'}：{row.quantity == null ? '未知' : String(row.quantity)}{row.unknownSkuId ? '（独立原 SKU ' + row.unknownSkuId + '）' : ''}</span>)}</div></div>}
    <p className="erp-inventory-source-caption">{sourceCaption(snapshot.source)}</p>
    {snapshot.unresolved?.length > 0 && <p className="erp-inventory-unresolved">有 {snapshot.unresolved.length} 项商品资料未补齐，仍按已核原库存单元展示。</p>}
  </div>;
}
const ProductBlock = memo(function ProductBlock({block, display, expanded, foldedColors, viewport, pinnedFocus, onExpand, onColor, onViewport, onQuantity, onProduct}) {
  const host = useRef(null), scroll = useRef(viewport), timer = useRef(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined' || pinnedFocus?.includes(block.key));
  useEffect(() => {
    if (!expanded || visible) return;
    const observer = new IntersectionObserver(entries => {if (entries.some(entry => entry.isIntersecting)) {setVisible(true); observer.disconnect();}}, {rootMargin: '240px'});
    observer.observe(host.current); return () => observer.disconnect();
  }, [expanded, visible]);
  useEffect(() => () => {clearTimeout(timer.current); if (scroll.current) onViewport(block.key, scroll.current);}, [block.key, onViewport]);
  const rows = useMemo(() => visible && expanded ? inventoryBlockRows(block, {foldedColors, subtotal: display.subtotal, total: display.total}) : [],
    [block, visible, expanded, foldedColors, display.subtotal, display.total]);
  useLayoutEffect(() => {
    if (!visible || !expanded || !viewport) return;
    const body = host.current?.querySelector('.arco-table-body') || host.current?.querySelector('.arco-table-content');
    if (body) {body.scrollTop = viewport.top || 0; body.scrollLeft = viewport.left || 0;}
  }, [visible, expanded, block]);
  const columns = useMemo(() => [
    {title: '款号 / 商品名称', width: 190, fixed: 'left', render: (_, row) => <button className="erp-inventory-product-link" data-focus-key={'inventory:' + block.key + ':product:' + row.key}
      onClick={() => onProduct(block.members[0])}><strong>{block.code}</strong><span>{block.name}</span></button>},
    ...(display.category ? [{title: '商品分类', width: 100, render: () => block.categoryLabel}] : []),
    ...(display.supplierId ? [{title: '供应商', width: 120, render: () => block.supplierLabel}] : []),
    ...(display.fitId ? [{title: '版型', width: 70, render: () => block.fitLabel}] : []),
    ...(display.groupId ? [{title: '尺码组', width: 100, render: () => block.groupLabel}] : []),
    ...(display.season ? [{title: '季节', width: 80, render: () => block.seasonLabel}] : []),
    {title: '颜色', dataIndex: 'colorLabel', width: 100}, {title: '仓库', dataIndex: 'warehouseLabel', width: 180},
    {title: '单位', dataIndex: 'unitLabel', width: 90},
  ], [block, display, onProduct]);
  const sizes = useMemo(() => block.sizeColumns.map(column => ({...column, label: column.label + (display.sizeDescription && column.code && column.code !== column.label ? ' / ' + column.code : '')})), [block, display.sizeDescription]);
  return <div ref={host} className="erp-inventory-product-block" data-inventory-block={block.key} data-focus-key={'inventory:' + block.key + ':fold'} onScrollCapture={event => {
    const node = event.target;
    if (!(node instanceof HTMLElement) || !node.className?.toString().includes('arco-table')) return;
    scroll.current = {top: node.scrollTop, left: node.scrollLeft}; clearTimeout(timer.current);
    timer.current = setTimeout(() => onViewport(block.key, scroll.current), 180);
  }}>
    <MatrixSection title={block.code + ' · ' + block.name + ' · ' + block.fitLabel + ' · ' + (block.unit || '单位待核实') + ' · ' + block.groupLabel}
      expanded={expanded} onExpand={value => onExpand(block.key, value)}
      summary={<span className="erp-inventory-block-summary">已核 {block.quantity ?? '未知'} {block.unit || '单位待核实'} · {block.members.length} 原单元
        <Button type="text" onClick={() => onProduct(block.members[0])} data-focus-key={'inventory:' + block.key + ':details'}>资料</Button></span>}>
      {visible ? <><div className="erp-inventory-color-folds">{block.colors.map(color => <Button key={color.key} type="text" data-focus-key={'inventory:' + block.key + ':color:' + color.key}
        onClick={() => onColor(block.key, color.key)}>{foldedColors[color.key] ? <IconRight/> : <IconDown/>}{color.label}</Button>)}</div>
        <InventoryMatrix rows={rows} sizeColumns={sizes} identityColumns={columns} onOpenCell={onQuantity} total={display.total}
          height={block.rowCount > 80 ? 460 : undefined} rowClassName={row => 'erp-inventory-row-' + row.kind}/>
      </> : <div className="erp-inventory-deferred-matrix" aria-hidden style={{height: Math.min(480, 36 * block.rowCount + 40)}}/>}
    </MatrixSection>
  </div>;
});
export default function InventoryPage() {
  const services = usePageServices(), owner = services.scope(), context = services.getContext();
  const references = useMemo(() => context.getReferences(), [context, owner]);
  const warehouses = references.warehouses || [];
  const warehouseOptions = useMemo(() => toOptions(warehouses), [warehouses]);
  const categoryTree = useMemo(() => toTree(references.categories), [references.categories]);
  const supplierOptions = useMemo(() => toOptions(references.suppliers), [references.suppliers]);
  const fitOptions = useMemo(() => toOptions(references.fits), [references.fits]);
  const seasonOptions = useMemo(() => nameOptions(references.seasons), [references.seasons]);
  const unitOptions = useMemo(() => nameOptions(references.units), [references.units]);
  const [state, update] = usePageState('inventory', () => initialPageState(warehouses));
  const stateRef = useRef(state), live = useRef(true), outputController = useRef(null), trigger = useRef(null), settingsTrigger = useRef(null), frameRef = useRef(null);
  stateRef.current = state;
  const [overlay, setOverlay] = useState(null), [actionError, setActionError] = useState(null);
  const optionCache = useRef({owner, values: new Map()});
  if (optionCache.current.owner !== owner) optionCache.current = {owner, values: new Map()};
  useEffect(() => {live.current = true; return () => {live.current = false; outputController.current?.abort();};}, []);
  const requestKey = state.applied ? JSON.stringify([state.applied, state.page, state.size, state.revision, state.requestVersion]) : 'inventory:not-queried';
  const read = usePageRequest(requestKey, async ({signal}) => {
    const snapshot = await context.inventoryReader.read(state.applied, state.page, state.size, {signal});
    return {snapshot, projection: projectInventoryMatrix(snapshot, references)};
  }, [], {enabled: Boolean(state.applied && state.lastRequestKey !== requestKey)});
  useEffect(() => {
    if (!read.data || read.requestKey !== requestKey || read.loading || read.error) return;
    update(previous => {
      if (previous.lastRequestKey === requestKey) return previous;
      const {snapshot, projection} = read.data, changed = previous.lastSnapshot && JSON.stringify(versionToken(previous.lastSnapshot)) !== JSON.stringify(versionToken(snapshot));
      return {...previous, lastSnapshot: snapshot, lastProjection: projection, lastApplied: copy(state.applied), lastPage: state.page, lastSize: state.size, lastRequestKey: requestKey,
        snapshotScope: snapshotScope(owner, snapshot), ...(changed ? {foldedBlocks: {}, foldedColors: {}, scrolls: {}} : {})};
    });
  }, [read.data, read.requestKey, read.loading, read.error, requestKey, state.applied, state.page, state.size, owner, update]);
  useEffect(() => {
    if (overlay && overlay.scope !== state.snapshotScope && !['correction-target'].includes(overlay.kind)) {outputController.current?.abort(); setOverlay(null);}
  }, [state.snapshotScope]);
  useEffect(() => {
    const refresh = () => update(previous => previous.applied ? {...previous, revision: previous.revision + 1, requestVersion: versionToken(previous.lastSnapshot)} : previous);
    window.addEventListener('inventory-correction-confirmed', refresh);
    return () => window.removeEventListener('inventory-correction-confirmed', refresh);
  }, [update]);
  usePageViewport('inventory', Boolean(state.lastSnapshot));
  const savedFocus = services.store.page('viewport:inventory', {}).getSnapshot().focusKey;
  const closeOverlay = useCallback(() => {
    outputController.current?.abort(); setOverlay(null);
    requestAnimationFrame(() => {if (trigger.current?.isConnected) trigger.current.focus({preventScroll: true});});
  }, []);
  const open = useCallback(item => {
    if(document.querySelector('#react-page-host')?.contains(document.activeElement))trigger.current=document.activeElement;
    setActionError(null); setOverlay({...item, scope: stateRef.current.snapshotScope, catalogVersion: stateRef.current.lastSnapshot?.catalogVersion});
  }, []);
  const closeSettings = useCallback(() => {update(previous => ({...previous, settingsOpen: false}));
    requestAnimationFrame(() => {if(settingsTrigger.current?.isConnected)settingsTrigger.current.focus({preventScroll:true});});}, [update]);
  const onProduct = useCallback(member => open({kind: 'product', identity: member}), [open]);
  const onLedger = useCallback(member => setOverlay({kind: 'ledger', member, page: 1, filters: {}, scope: stateRef.current.snapshotScope}), []);
  const onQuantity = useCallback(cell => {
    if (!cell.members.length) return;
    if (cell.members.length === 1 && cell.members[0].unit) open({kind: 'ledger', member: cell.members[0], page: 1, filters: {}});
    else open({kind: 'members', members: cell.members});
  }, [open]);
  const onCorrect = useCallback(async member => {
    try {const captured = services.scope();setOverlay(null); const opened = await context.openCorrection(member,{returnFocusTarget:trigger.current});
      if (!opened) throw new Error('当前账号或校正入口不可用');
      if (services.scope() !== captured) throw Object.assign(new Error('校正入口范围已变化'), {stale: true});
    } catch (error) {if (!error.stale && live.current) setActionError(error); throw error;}
  }, [services, context, closeOverlay]);
  const onExpand = useCallback((block, expanded) => update(previous => ({...previous, foldedBlocks: {...previous.foldedBlocks, [block]: !expanded}})), [update]);
  const onColor = useCallback((block, color) => update(previous => ({...previous, foldedColors: {...previous.foldedColors,
    [block]: {...previous.foldedColors?.[block], [color]: !previous.foldedColors?.[block]?.[color]}}})), [update]);
  const onViewport = useCallback((block, viewport) => {
    if (services.scope() !== owner) return;
    update(previous => ({...previous, scrolls: {...previous.scrolls, [block]: viewport}}));
  }, [services, owner, update]);
  async function loadProductPage({q, page, size, signal}) {
    const captured = services.scope(), result = await context.productReader.list({filters: {q: String(q || '').trim()}, page, size, purpose: 'picker'});
    if (signal.aborted || captured !== services.scope()) throw Object.assign(new Error('商品搜索范围已变化'), {stale: true});
    const items = pickerOptions(result); optionCache.current.values = new Map(items.map(item => [item.value, item])); return {items, total: result.total};
  }
  function selectProducts(next) {
    const labels = new Map([...state.productOptions, ...optionCache.current.values.values()].map(option => [option.value, option]));
    update(previous => ({...previous, draft: {...previous.draft, products: next, keyword: next.length ? '' : previous.draft.keyword},
      productOptions: next.map(value => labels.get(value) || {value, label: '已选商品（名称待核实）'})}));
  }
  const setDraft = (field, value) => update(previous => ({...previous, draft: {...previous.draft, [field]: value}}));
  const setMore = (field, value) => update(previous => ({...previous, draft: {...previous.draft, more: {...previous.draft.more, [field]: values(value)}}}));
  function runQuery(nextDraft = state.draft) {
    const query = normalizeDraft(nextDraft);
    if (!query.warehouses.length || query.warehouses.some(id => !warehouseOptions.some(option => option.value === id))) {
      update(previous => ({...previous, validationError: '请选择当前授权资料中的至少一个仓库'})); return;
    }
    update(previous => ({...previous, validationError: '', draft: copy(nextDraft), applied: query, page: 1, requestVersion: versionToken(previous.lastSnapshot), revision: previous.revision + 1}));
  }
  function changeView(view) {
    update(previous => ({...previous, draft: {...previous.draft, view},
      ...(previous.lastApplied ? {applied: {...previous.lastApplied, view}, page: 1, requestVersion: versionToken(previous.lastSnapshot), revision: previous.revision + 1} : {})}));
  }
  async function runOutput() {
    const job = overlay, snapshot = stateRef.current.lastSnapshot, query = stateRef.current.lastApplied;
    const capturedOwner = services.scope(), capturedScope = stateRef.current.snapshotScope, controller = new AbortController();
    outputController.current?.abort(); outputController.current = controller;
    const guard = () => live.current && !controller.signal.aborted && services.scope() === capturedOwner && stateRef.current.snapshotScope === capturedScope;
    setOverlay(previous => ({...previous, busy: true, error: null}));
    try {
      const full = await context.inventoryReader.all(query, 100, {signal: controller.signal, guard});
      if (!guard() || JSON.stringify(versionToken(full)) !== JSON.stringify(versionToken(snapshot))) throw new Error('库存在查询后已变化，请刷新并重新输出');
      if (job.kind === 'export') {
        const rows = job.template === 'yintai' ? context.inventoryYintaiReport(full) : inventoryMatrixReport(full, references);
        await window.MATRIX_REPORT.download(rows, job.template === 'yintai' ? '银泰库存状况' : '库存状况', {signal: controller.signal, guard});
        if (guard()) closeOverlay();
      } else {
        const content = inventoryMatrixMarkup(full, references, stateRef.current.display);
        const html = window.MATRIX_REPORT.inventoryPrintDocument({content, caption: sourceCaption(full.source), productCount: full.productCount, cellCount: full.rowCount});
        if (guard()) setOverlay(previous => ({...previous, html, busy: false}));
      }
    } catch (error) {
      if (guard()) setOverlay(previous => ({...previous, busy: false, error}));
    }
  }
  const draft = state.draft, dirty = !state.lastApplied || JSON.stringify(normalizeDraft(draft)) !== JSON.stringify(state.lastApplied);
  const busy = read.loading || Boolean(overlay?.busy), snapshot = state.lastSnapshot, projection = state.lastProjection;
  const hasOldRead = snapshot && (read.loading || read.error || state.lastRequestKey !== requestKey);
  const filters = <InventoryFilterBar expanded={state.advanced} onExpand={advanced => update(previous => ({...previous, advanced}))}
    onQuery={() => runQuery()} onReset={() => runQuery(initialDraft(warehouses))} busy={busy} dirty={dirty}
    advanced={<><FilterSelect label="供应商" value={draft.more.supplierId} options={supplierOptions} onChange={value => setMore('supplierId', value)}/>
      <FilterSelect label="版型" value={draft.more.fitId} options={fitOptions} onChange={value => setMore('fitId', value)}/>
      <FilterSelect label="季节" value={draft.more.season} options={seasonOptions} onChange={value => setMore('season', value)}/>
      <div className="erp-inventory-advanced-field"><span>计量单位</span><Select aria-label="计量单位" allowClear allowSearch value={draft.unit || undefined} options={unitOptions}
        onChange={value => setDraft('unit', value || '')} placeholder="全部单位"/></div>
      <div className="erp-inventory-advanced-field"><span>库存关键词</span><Input aria-label="款号或商品名称" data-focus-key="inventory:keyword" value={draft.keyword} allowClear disabled={busy} placeholder="输入款号或名称后查询"
        onChange={value => update(previous => ({...previous, draft: {...previous.draft, keyword: value, products: value ? [] : previous.draft.products}, productOptions: value ? [] : previous.productOptions}))}/></div>
      <div className="erp-inventory-switch"><Switch checked={draft.nonzero} onChange={value => setDraft('nonzero', value)}/> 仅看非零库存</div></>}>
    <div data-focus-key="inventory:products" className="erp-inventory-product-field"><ProductPicker value={draft.products} selectedOptions={state.productOptions}
      onChange={selectProducts} loadPage={loadProductPage} cacheKey={'inventory-products:' + owner + ':' + (snapshot?.catalogVersion || '')} size={20} disabled={busy}/></div>
    <div data-focus-key="inventory:category" className="erp-inventory-category-field"><CategoryPicker value={draft.categories} treeData={categoryTree} onChange={value => setDraft('categories', values(value))} disabled={busy}/></div>
    <div data-focus-key="inventory:warehouses" className="erp-inventory-warehouse-field"><WarehousePicker value={draft.warehouses} options={warehouseOptions} onChange={value => setDraft('warehouses', values(value))} disabled={busy}/></div>
  </InventoryFilterBar>;
  const actions = <>{window.T27_OUTPUT_ENTRY && <a className="erp-inventory-output-link" href={window.T27_OUTPUT_ENTRY.href('inventory', 'inventory', 'inventory')}>完整导出</a>}
    {context.canCorrect() && <Button onClick={() => open({kind: 'correction-target'})} disabled={busy}>库存校正</Button>}
    <Button disabled={!snapshot || busy} onClick={() => open({kind: 'export', template: 'matrix'})}>导出</Button>
    <Button disabled={!state.applied || busy} onClick={() => update(previous => ({...previous, revision: previous.revision + 1, requestVersion: versionToken(previous.lastSnapshot)}))}>刷新</Button>
    <Button disabled={!snapshot || busy} onClick={() => open({kind: 'print'})}>打印</Button></>;
  const result = snapshot ? <><RangeSummary snapshot={snapshot} query={state.lastApplied} references={references} open={state.scopeOpen} onExpand={scopeOpen => update(previous => ({...previous, scopeOpen}))}
    totalsOpen={state.totalsOpen} onTotals={totalsOpen => update(previous => ({...previous, totalsOpen}))}/>
    <div className="erp-inventory-result-controls"><Button type={snapshot.view === 'original' ? 'primary' : 'text'} disabled={busy} onClick={() => changeView('original')}>原始规格</Button>
      <Button type={snapshot.view === 'standard' ? 'primary' : 'text'} disabled={busy} onClick={() => changeView('standard')}>标准展示</Button>
    <Button type="text" data-focus-key="inventory:display-settings" onClick={() => {settingsTrigger.current=document.activeElement;update(previous => ({...previous, settingsOpen: true}));}}>显示设置</Button></div>
    {projection?.blocks.length ? projection.blocks.map(block => <ProductBlock key={block.key} block={block} display={state.display} expanded={!state.foldedBlocks?.[block.key]}
      foldedColors={state.foldedColors?.[block.key] || EMPTY} viewport={state.scrolls?.[block.key]} pinnedFocus={savedFocus}
      onExpand={onExpand} onColor={onColor} onViewport={onViewport} onQuantity={onQuantity} onProduct={onProduct}/>)
      : <div className="erp-inventory-first-query">当前范围没有已核实的库存单元。</div>}
  </> : state.applied ? null : <div className="erp-inventory-first-query" role="status">请选择查询条件后点击“查询”。</div>;
  const canCorrect = context.canCorrect();
  return <>
    <PageLayout title="库存状况表" actions={actions} filters={filters} footer={snapshot && <InventoryPagination page={state.lastPage} size={state.lastSize} total={snapshot.productCount} disabled={busy || Boolean(read.error)}
      onChange={(page, size) => update(previous => ({...previous, page, size, requestVersion: versionToken(previous.lastSnapshot)}))}/>}>
      {state.validationError && <Alert type="error" content={state.validationError}/>}
      {actionError && <Alert type="error" content={actionError.message}/>}
      {hasOldRead && <p className="erp-inventory-applied-caption">下方保留上一次成功查询的范围；新请求尚未成功。</p>}
      <LoadState loading={read.loading} error={read.error} retry={read.retry}>{result}</LoadState>
    </PageLayout>
    {state.settingsOpen && <Drawer visible title="显示设置" className="erp-foundation-popup" width={360} footer={<Button onClick={() => update(previous => ({...previous, display: initialPageState(warehouses).display}))}>恢复默认</Button>}
      getPopupContainer={() => document.body} unmountOnExit onCancel={closeSettings}>
      <div className="erp-inventory-settings">{Object.entries({category: '商品分类', supplierId: '供应商', fitId: '版型', groupId: '尺码组', season: '季节', subtotal: '颜色小计', total: '已核单元合计', sizeDescription: '尺码说明'}).map(([key, label]) =>
        <div key={key}><span>{label}</span><Switch checked={state.display[key]} onChange={checked => update(previous => ({...previous, display: {...previous.display, [key]: checked}}))}/></div>)}</div>
    </Drawer>}
    {overlay?.kind === 'members' && <MemberPanel members={overlay.members} onClose={closeOverlay} onLedger={onLedger} onProduct={onProduct} onCorrect={member => onCorrect(member).catch(() => {})} canCorrect={canCorrect}/>}
    {overlay?.kind === 'ledger' && <LedgerPanel {...overlay} source={snapshot.source} onClose={closeOverlay} canCorrect={canCorrect} onCorrect={member => onCorrect(member).catch(() => {})}
      onState={change => setOverlay(previous => ({...previous, ...change}))} onSource={entry => setOverlay(previous => ({kind: 'source', entry, parent: previous, scope: previous.scope}))}/>}
    {overlay?.kind === 'source' && <SourcePanel {...overlay} onClose={closeOverlay} onBack={() => setOverlay(overlay.parent)}/>}
    {overlay?.kind === 'product' && <ProductPanel {...overlay} onClose={closeOverlay}/>}
    {overlay?.kind === 'correction-target' && <CorrectionTargetPanel scope={owner} warehouses={warehouses} onClose={closeOverlay} onCorrect={onCorrect}/>}
    {overlay && ['export', 'print'].includes(overlay.kind) && <OutputPanel job={overlay} onChange={change => setOverlay(previous => ({...previous, ...change}))} onRun={runOutput} onClose={closeOverlay} frameRef={frameRef}/>}
  </>;
}
