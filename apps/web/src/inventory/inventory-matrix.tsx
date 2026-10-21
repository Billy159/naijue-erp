import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { InventoryActions, InventoryCellTarget, InventoryColorFit, InventoryPage, InventoryProduct, InventoryRow, InventorySize, StockTotal } from './contracts.ts';
import { formatQuantity, totalLabel } from './model.ts';
import { knownDisplaySources, projectInventoryColors, type InventoryDisplayColor, type InventoryDisplayRow } from './display-projection.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { InventoryWindowModel, type InventoryLogicalCell, type InventoryWindowLayout, type InventoryWindowRow, type InventoryWindowViewport } from './windowing/model.ts';
import { createInventoryRenderPlan, inventoryDOMScrollTop, inventoryModelViewport, type InventoryColumnPart } from './windowing/render-plan.ts';

export interface InventoryDisplaySettings {
  readonly category: boolean;
  readonly supplier: boolean;
  readonly fit: boolean;
  readonly sizeGroup: boolean;
  readonly season: boolean;
  readonly subtotal: boolean;
  readonly total: boolean;
  readonly sizeDescription: boolean;
}
/** Frozen workbench defaults; hidden FIT is a read-only display projection, never SKU merging. */
export const defaultDisplaySettings: InventoryDisplaySettings = { category: true, supplier: false, fit: false, sizeGroup: false, season: false, subtotal: false, total: true, sizeDescription: false };

/** Deliberate developer opt-in. No unmeasured/fixed row-height defaults. */
export interface InventoryMatrixWindowing {
  readonly scope: Pick<ReadScope, 'signal'>;
  readonly layout: Omit<InventoryWindowLayout, 'subtotal' | 'total' | 'collapsedProducts' | 'collapsedColors'>;
  readonly viewport: InventoryWindowViewport;
  readonly sectionGap: number;
  readonly onScrollRequest: (position: { readonly scrollTop: number; readonly scrollLeft: number }) => void;
  readonly onInvalidGeometry?: (error: Error) => void;
}
type MatrixProps = {
  readonly data: InventoryPage;
  readonly settings: InventoryDisplaySettings;
  readonly collapsedProducts: ReadonlySet<string>;
  readonly collapsedColors: ReadonlySet<string>;
  readonly toggleProduct: (id: string) => void;
  readonly toggleColor: (id: string) => void;
  readonly actions: InventoryActions;
  readonly windowing?: InventoryMatrixWindowing;
};
/** Column-first geometry follows frozen inventory-matrix-experiment.js, not
 * standalone product-heading rows. Canonical FIT/SKU identities stay separate. */
export function InventoryMatrix(props: MatrixProps) {
  const signal = props.windowing?.scope.signal;
  const aborted = useSyncExternalStore(callback => {
    signal?.addEventListener('abort', callback);
    return () => signal?.removeEventListener('abort', callback);
  }, () => signal?.aborted ?? false, () => signal?.aborted ?? false);
  if (aborted) return null;
  // The opt-in window model addresses canonical single-SKU cells. Until it has
  // measured projection geometry, hidden-FIT views retain the safe eager path.
  return props.windowing && props.settings.fit ? <WindowedInventoryMatrix {...props} windowing={props.windowing} /> : <EagerInventoryMatrix {...props} />;
}
function EagerInventoryMatrix(props: MatrixProps) {
  const sections = new Map<string, InventoryProduct[]>();
  for (const product of props.data.products) {
    const key = JSON.stringify([product.sizeGroup.id, product.sizes.map(size => [size.id, size.label])]);
    const existing = sections.get(key);
    if (existing) existing.push(product); else sections.set(key, [product]);
  }
  return <>{[...sections].map(([key, products]) => {
    const first = products[0]!;
    const width = 300 + 116 + 152 + first.sizes.length * 76 + 76 + 70;
    return <section key={key} className="mx-section" data-size-system={first.sizeGroup.id} style={{ '--mx-table-width': `${width}px` } as CSSProperties} aria-label={`${first.sizeGroup.label}库存矩阵`}>
      {props.settings.sizeDescription && <h3>{first.sizeGroup.label}<small>{first.sizes.map(size => size.label).join(' / ')}</small></h3>}
      <table className="mx-table"><caption className="sr-only">{first.sizeGroup.label}，商品、颜色、版型、仓库及尺码库存；— 表示不存在此规格，合法规格无库存显示 0。</caption>
        <colgroup><col style={{ width: 300 }} /><col style={{ width: 116 }} /><col style={{ width: 152 }} />{first.sizes.map(size => <col key={size.id} style={{ width: 76 }} />)}<col style={{ width: 76 }} /><col style={{ width: 70 }} /></colgroup>
        <thead><tr><th scope="col" className="mx-product">款号／商品名称</th><th scope="col" className="mx-color">颜色</th><th scope="col" className="mx-warehouse">仓库</th>{first.sizes.map(size => <th scope="col" key={size.id} className="mx-size" data-size-id={size.id}>{size.label}</th>)}<th scope="col" className="mx-total-cell">合计</th><th scope="col" className="mx-operation">操作</th></tr></thead>
        <tbody>{products.map(product => <ProductRows key={product.id} product={product} {...props} />)}</tbody>
      </table>
    </section>;
  })}</>;
}
const spacer = <span className="mx-fold-spacer" aria-hidden="true" />;
function Fold(props: { readonly expanded: boolean; readonly label: string; readonly toggle: () => void }) {
  return <button type="button" className="mx-fold" aria-expanded={props.expanded} aria-label={`${props.expanded ? '折叠' : '展开'}${props.label}`} onClick={props.toggle}>{props.expanded ? '▾' : '▸'}</button>;
}
function Indent(props: { readonly control: ReactNode; readonly children: ReactNode }) {
  return <div className="mx-indent">{props.control}<span>{props.children}</span></div>;
}
function ProductIdentity(props: { readonly product: InventoryProduct; readonly settings: InventoryDisplaySettings; readonly showMeta: boolean; readonly fit?: string }) {
  const { product, settings } = props;
  return <><div className="mx-product-identity"><strong>{product.code}</strong><span title={product.name}>{product.name}</span></div>{props.showMeta && <div className="mx-meta">
    {settings.category && <span><em>分类</em> {product.categoryLabel}</span>}{settings.supplier && <span><em>供应商</em> {product.supplierLabel}</span>}{settings.fit && props.fit && <span><em>版型</em> {props.fit}</span>}{settings.sizeGroup && <span><em>尺码组</em> {product.sizeGroup.label}</span>}{settings.season && <span><em>季节</em> {product.seasonLabel}</span>}
  </div>}</>;
}
function ViewProduct(props: { readonly product: InventoryProduct; readonly actions: InventoryActions }) {
  return <button type="button" className="mx-view" disabled={!props.actions.onViewProduct} title={props.actions.onViewProduct ? '查看当前商品' : '商品只读抽屉尚未接入'} aria-label={`打开${props.product.code}商品资料`} onClick={event => { event.currentTarget.focus(); props.actions.onViewProduct?.({ id: props.product.id, label: `${props.product.code} ${props.product.name}` }); }}>查看</button>;
}
function ProductRows(props: MatrixProps & { readonly product: InventoryProduct }) {
  const { product } = props;
  const groups = useMemo(() => props.settings.fit ? product.colorFits : projectInventoryColors(product), [product, props.settings.fit]);
  const collapsed = props.collapsedProducts.has(product.id);
  const productFold = <Fold expanded={!collapsed} label={`商品${product.code}`} toggle={() => props.toggleProduct(product.id)} />;
  if (collapsed) return <TotalRow {...props} kind="product" folded first identity color={<Indent control={productFold}>所有颜色</Indent>} warehouse={<Indent control={spacer}>所有库存</Indent>} totals={product.sizeTotals} total={product.total} />;
  return <>{groups.map((group, index) => <ColorRows key={JSON.stringify([group.color.id, group.fit?.id ?? null])} {...props} group={group} firstGroup={index === 0} productFold={productFold} />)}
    {props.settings.total && <TotalRow {...props} kind="product" label="商品合计" totals={product.sizeTotals} total={product.total} />}
  </>;
}
type MatrixColor = InventoryColorFit | InventoryDisplayColor;
type MatrixRow = InventoryRow | InventoryDisplayRow;
function ColorRows(props: MatrixProps & { readonly product: InventoryProduct; readonly group: MatrixColor; readonly firstGroup: boolean; readonly productFold: ReactNode }) {
  const { group, product } = props;
  const key = JSON.stringify([product.id, group.color.id, group.fit?.id ?? null]);
  const folded = props.collapsedColors.has(key);
  const colorFold = <Fold expanded={!folded} label={`${product.code}${group.color.label}${group.fit?.label ?? ''}`} toggle={() => props.toggleColor(key)} />;
  if (folded) return <><TotalRow {...props} kind="color" folded first={props.firstGroup} identity {...(group.fit ? { fit: group.fit.label } : {})} color={<Indent control={props.firstGroup ? props.productFold : spacer}>{group.color.label}</Indent>} warehouse={<Indent control={colorFold}>所有库存</Indent>} totals={group.sizeTotals} total={group.total} /></>;
  return <>
    {group.rows.map((row, index) => <WarehouseRow key={row.warehouse.id} {...props} row={row} first={props.firstGroup && index === 0} firstInGroup={index === 0} colorFold={colorFold} />)}
    {props.settings.subtotal && <TotalRow {...props} kind="color" label="颜色小计" totals={group.sizeTotals} total={group.total} />}
  </>;
}
type RowWindow = {
  readonly columns: readonly InventoryColumnPart[];
  readonly row: InventoryWindowRow;
  readonly sectionStart: number;
  readonly bindCell: (address: InventoryLogicalCell) => {
    readonly ref: (element: HTMLButtonElement | null) => void;
    readonly onFocus: () => void;
    readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  };
};
function ColumnCells(props: { readonly product: InventoryProduct; readonly window?: RowWindow; readonly render: (size: InventorySize, index: number) => ReactNode }) {
  if (!props.window) return <>{props.product.sizes.map((size, index) => props.render(size, index))}</>;
  return <>{props.window.columns.map(part => part.kind === 'gap' ? <td key={`gap-${part.start}`} colSpan={part.count} aria-hidden="true" style={{ width: part.width, minWidth: 0, padding: 0, border: 0 }} /> : props.render(part.column.size, part.column.index))}</>;
}
function rowAttributes(window: RowWindow | undefined) {
  return window ? { 'aria-rowindex': window.row.index - window.sectionStart + 1, 'data-window-row-height': window.row.height, style: { height: window.row.height } } : {};
}
function WarehouseRow(props: MatrixProps & { readonly product: InventoryProduct; readonly group: MatrixColor; readonly row: MatrixRow; readonly first: boolean; readonly firstInGroup: boolean; readonly productFold: ReactNode; readonly colorFold: ReactNode; readonly window?: RowWindow }) {
  const { product, group, row, first } = props;
  const fitLabel = group.fit?.label ?? '';
  return <tr {...rowAttributes(props.window)} data-inventory-product={product.id} data-inventory-row={JSON.stringify([product.id, group.color.id, group.fit?.id ?? null, row.warehouse.id])} className={`mx-detail-row${first ? ' mx-product-row' : ''}`}>
    <td className="mx-product" aria-colindex={props.window ? 1 : undefined}><ProductIdentity product={product} settings={props.settings} showMeta={first || props.settings.fit && props.firstInGroup} fit={fitLabel} />{group.fit && <span className="sr-only">{fitLabel}</span>}</td>
    <td className="mx-color" aria-colindex={props.window ? 2 : undefined}><Indent control={first ? props.productFold : spacer}>{group.color.label}</Indent></td>
    <td className="mx-warehouse" aria-colindex={props.window ? 3 : undefined} title={[row.warehouse.label, fitLabel].filter(Boolean).join(' · ')}><Indent control={props.firstInGroup ? props.colorFold : spacer}>{row.warehouse.label}</Indent></td>
    <ColumnCells product={product} {...(props.window ? { window: props.window } : {})} render={(size, index) => {
      const cell = row.cells[size.id]!;
      const address = props.window && group.fit ? { productId: product.id, colorId: group.color.id, fitId: group.fit.id, warehouseId: row.warehouse.id, sizeId: size.id } : null;
      if (cell.state === 'not-applicable') return <td key={size.id} className="mx-number" aria-colindex={props.window ? index + 4 : undefined}><span className="mx-absent" aria-label="不存在此规格">—</span></td>;
      const sources = 'sources' in cell ? knownDisplaySources(cell) : null;
      const source = sources?.length === 1 ? sources[0]! : null;
      const target: InventoryCellTarget | null = sources
        ? source ? { productId: source.productId, productLabel: `${product.code} ${product.name}`, color: source.color, fit: source.fit, size: source.size, warehouse: source.warehouse, skuId: source.cell.skuId, readReference: props.data.readReference } : null
        : group.fit && 'skuId' in cell ? { productId: product.id, productLabel: `${product.code} ${product.name}`, color: group.color, fit: group.fit, size, warehouse: row.warehouse, skuId: cell.skuId, readReference: props.data.readReference } : null;
      const multipleSources = !!sources && sources.length > 1;
      const explanation = multipleSources ? '跨版型汇总包含多个 SKU，请在显示设置中显示版型后查看各自库存流水' : props.actions.onOpenCell ? `查看该仓库 / SKU 库存流水${target ? ` · ${target.fit.label}` : ''}` : '库存流水尚未接入';
      return <td key={size.id} className="mx-number" aria-colindex={props.window ? index + 4 : undefined}><button type="button" className={`mx-stock${cell.quantity.startsWith('-') ? ' mx-negative' : cell.quantity === '0' ? ' mx-zero' : ''}`} {...(address ? props.window?.bindCell(address) : {})} data-stock-address={props.window ? JSON.stringify(address) : undefined} data-inventory-source-count={sources?.length ?? 1} disabled={!props.actions.onOpenCell || !target} title={explanation} aria-label={`${product.code} ${group.color.label} ${fitLabel} ${row.warehouse.label} ${size.label} 库存${cell.quantity}${multipleSources ? `，${explanation}` : ''}`} onClick={() => { if (target) props.actions.onOpenCell?.(target); }}>{formatQuantity(cell.quantity)}</button></td>;
    }} /><td className="mx-total-cell" aria-colindex={props.window ? product.sizes.length + 4 : undefined} title={totalLabel(row.total)}>{totalLabel(row.total)}</td><td className="mx-operation" aria-colindex={props.window ? product.sizes.length + 5 : undefined}><ViewProduct product={product} actions={props.actions} /></td>
  </tr>;
}
function TotalRow(props: MatrixProps & { readonly product: InventoryProduct; readonly label?: string; readonly fit?: string; readonly color?: ReactNode; readonly warehouse?: ReactNode; readonly totals: Readonly<Record<string, StockTotal>>; readonly total: StockTotal; readonly kind: 'product' | 'color'; readonly folded?: boolean; readonly first?: boolean; readonly identity?: boolean; readonly window?: RowWindow }) {
  return <tr {...rowAttributes(props.window)} data-inventory-product={props.product.id} className={`mx-${props.kind === 'product' ? 'total mx-product-total' : 'subtotal mx-color-total'}${props.folded ? ' mx-folded' : ''}${props.first ? ' mx-product-row' : ''}`}>
    <td className="mx-product">{props.identity ? <ProductIdentity product={props.product} settings={props.settings} showMeta={!!props.first || props.settings.fit} {...(props.fit ? { fit: props.fit } : {})} /> : props.label}{props.fit && <span className="sr-only">{props.fit}</span>}</td><td className="mx-color">{props.color}</td><td className="mx-warehouse">{props.warehouse}</td>
    <ColumnCells product={props.product} {...(props.window ? { window: props.window } : {})} render={(size, index) => <td key={size.id} className="mx-number" aria-colindex={props.window ? index + 4 : undefined} title={totalLabel(props.totals[size.id]!)}>{formatQuantity(props.totals[size.id]!.knownQuantity)}</td>} /><td className="mx-total-cell" title={totalLabel(props.total)}>{totalLabel(props.total)}</td><td className="mx-operation">{props.identity && <ViewProduct product={props.product} actions={props.actions} />}</td>
  </tr>;
}

function WindowedInventoryMatrix(props: MatrixProps & { readonly windowing: InventoryMatrixWindowing }) {
  const { windowing } = props;
  const aborted = useSyncExternalStore(callback => {
    windowing.scope.signal.addEventListener('abort', callback);
    return () => windowing.scope.signal.removeEventListener('abort', callback);
  }, () => windowing.scope.signal.aborted, () => windowing.scope.signal.aborted);
  const prepared = useMemo(() => {
    try {
      // Identity/total widths are the existing frozen matrix CSS, not a new look.
      if (windowing.viewport.fixedLeadingWidth !== 568 || windowing.viewport.fixedTrailingWidth !== 146) throw new RangeError('Measured sticky widths do not match the existing matrix.');
      if (props.settings.sizeDescription !== (windowing.layout.heights['section-description'] > 0)) throw new RangeError('The optional section description needs its own current measurement.');
      const model = new InventoryWindowModel(props.data, { ...windowing.layout, subtotal: props.settings.subtotal, total: props.settings.total, collapsedProducts: props.collapsedProducts, collapsedColors: props.collapsedColors });
      for (const section of model.sections) {
        for (let index = 0; index < section.sizes.length; index++) {
          if (model.column(section.index, index)!.width !== 76) throw new RangeError('Measured size widths do not match the existing matrix.');
        }
      }
      return { model, error: null };
    } catch (error) { return { model: null, error: error instanceof Error ? error : new Error('Invalid matrix geometry.') }; }
  }, [props.data, props.settings.subtotal, props.settings.total, props.settings.sizeDescription, props.settings.category, props.settings.supplier, props.settings.fit, props.settings.sizeGroup, props.settings.season, props.collapsedProducts, props.collapsedColors, windowing.layout, windowing.viewport.fixedLeadingWidth, windowing.viewport.fixedTrailingWidth, windowing.scope.signal]);
  const model = prepared.model;
  const [focus, setFocus] = useState<{ readonly data: InventoryPage; readonly signal: AbortSignal; readonly address: InventoryLogicalCell } | null>(null);
  const [failure, setFailure] = useState<{ readonly model: InventoryWindowModel; readonly error: Error } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLButtonElement>());
  const pending = useRef<{ readonly model: InventoryWindowModel; readonly address: InventoryLogicalCell; readonly scrollTop: number; readonly scrollLeft: number } | null>(null);
  const planResult = useMemo(() => {
    if (!model) return { plan: null, error: null };
    try { return { plan: createInventoryRenderPlan(model, windowing.viewport, windowing.sectionGap, focus?.data === props.data && focus.signal === windowing.scope.signal ? focus.address : null), error: null }; }
    catch (error) { return { plan: null, error: error instanceof Error ? error : new Error('Invalid matrix viewport.') }; }
  }, [model, windowing.viewport, windowing.sectionGap, focus, props.data, windowing.scope.signal]);
  const error = prepared.error ?? planResult.error ?? (failure?.model === model ? failure.error : null);
  useEffect(() => { if (error) windowing.onInvalidGeometry?.(error); }, [error, windowing.onInvalidGeometry]);
  useLayoutEffect(() => {
    const request = pending.current;
    if (!request || request.model !== model || aborted || error) { pending.current = null; return; }
    if (Math.abs(windowing.viewport.scrollTop - request.scrollTop) > 0.5 || Math.abs(windowing.viewport.scrollLeft - request.scrollLeft) > 0.5) return;
    elements.current.get(JSON.stringify(request.address))?.focus({ preventScroll: true });
    pending.current = null;
  }, [model, planResult, windowing.viewport, aborted, error]);
  useLayoutEffect(() => {
    if (!model || error || aborted || !host.current) return;
    const nodes = Array.from(host.current.querySelectorAll<HTMLElement>('[data-window-row-height],[data-window-column-width]'));
    const check = () => {
      for (const node of nodes) {
        const rectangle = node.getBoundingClientRect();
        const actual = node.dataset.windowColumnWidth ? rectangle.width : rectangle.height;
        const expected = Number(node.dataset.windowColumnWidth ?? node.dataset.windowRowHeight);
        // jsdom has no layout. Zero is not proof of a browser measurement.
        if (actual > 0 && Math.abs(actual - expected) > 1) {
          setFailure({ model, error: new Error('Mounted matrix content no longer matches supplied row measurements; retained eager rendering.') });
          return;
        }
      }
    };
    check();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(check) : null;
    nodes.forEach(node => observer?.observe(node));
    return () => observer?.disconnect();
  }, [model, planResult, error, aborted]);
  if (aborted || windowing.scope.signal.aborted) return null;
  if (!model || !planResult.plan || error) return <EagerInventoryMatrix {...props} />;
  const plan = planResult.plan;
  const bindCell = (address: InventoryLogicalCell) => ({
    ref: (element: HTMLButtonElement | null) => { const key = JSON.stringify(address); if (element) elements.current.set(key, element); else elements.current.delete(key); },
    onFocus: () => {
      pending.current = null;
      setFocus(current => current?.data === props.data && current.signal === windowing.scope.signal && JSON.stringify(current.address) === JSON.stringify(address) ? current : { data: props.data, signal: windowing.scope.signal, address });
    },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const directions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Home: 'row-start', End: 'row-end' } as const;
      const direction = directions[event.key as keyof typeof directions];
      if (!direction) return;
      const next = model.moveFocus(address, direction);
      if (!next) return;
      const scroll = model.scrollToCell(next, inventoryModelViewport(model, windowing.viewport, windowing.sectionGap));
      if (!scroll || scroll.kind !== 'visible') return;
      event.preventDefault();
      const position = { scrollTop: inventoryDOMScrollTop(model, scroll.scrollTop, windowing.sectionGap), scrollLeft: scroll.scrollLeft };
      pending.current = { model, address: next, ...position };
      setFocus({ data: props.data, signal: windowing.scope.signal, address: next });
      windowing.onScrollRequest(position);
    },
  });
  return <div ref={host} data-inventory-windowed="opt-in" style={{ height: plan.height, position: 'relative', minWidth: '100%', width: '100%' }} onFocusCapture={event => {
    if (!(event.target instanceof HTMLElement) || !event.target.closest('[data-stock-address]')) { pending.current = null; setFocus(null); }
  }} onBlurCapture={event => {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) { pending.current = null; setFocus(null); }
  }}>
    <p className="sr-only">当前矩阵按可见范围呈现。库存单元格可用方向键及 Home、End 导航；商品与颜色折叠按钮仍可使用 Tab 访问。</p>
    {plan.sections.map(entry => {
      const first = entry.section.products[0]!;
      const tableWidth = 714 + entry.section.sizeExtent;
      const rowWindow = (row: InventoryWindowRow): RowWindow => ({ columns: entry.columns, row, sectionStart: entry.section.headerRow, bindCell });
      return <section key={entry.section.key} className="mx-section" data-size-system={first.sizeGroup.id} style={{ '--mx-table-width': `${tableWidth}px`, position: 'absolute', top: entry.top, margin: 0 } as CSSProperties} aria-label={`${first.sizeGroup.label}库存矩阵`}>
        {props.settings.sizeDescription && <h3 data-window-row-height={entry.section.headerTop - entry.section.top}>{first.sizeGroup.label}<small>{first.sizes.map(size => size.label).join(' / ')}</small></h3>}
        <table className="mx-table" aria-rowcount={entry.section.endRow - entry.section.headerRow} aria-colcount={first.sizes.length + 5}><caption className="sr-only">{first.sizeGroup.label}，商品、颜色、版型、仓库及尺码库存；— 表示不存在此规格，合法规格无库存显示 0。</caption>
          <colgroup><col style={{ width: 300 }} /><col style={{ width: 116 }} /><col style={{ width: 152 }} />{entry.columns.map(part => part.kind === 'gap' ? <col key={`gap-${part.start}`} span={part.count} style={{ width: part.width / part.count }} /> : <col key={part.column.size.id} style={{ width: part.column.width }} />)}<col style={{ width: 76 }} /><col style={{ width: 70 }} /></colgroup>
          <thead><tr aria-rowindex={1} data-window-row-height={entry.section.headerHeight}><th scope="col" aria-colindex={1} className="mx-product" data-window-column-width={300} style={{ top: windowing.viewport.stickyHeaderOffset }}>款号／商品名称</th><th scope="col" aria-colindex={2} className="mx-color" data-window-column-width={116} style={{ top: windowing.viewport.stickyHeaderOffset }}>颜色</th><th scope="col" aria-colindex={3} className="mx-warehouse" data-window-column-width={152} style={{ top: windowing.viewport.stickyHeaderOffset }}>仓库</th>{entry.columns.map(part => part.kind === 'gap' ? <th key={`gap-${part.start}`} colSpan={part.count} aria-hidden="true" style={{ width: part.width, minWidth: 0, padding: 0, border: 0, top: windowing.viewport.stickyHeaderOffset }} /> : <th scope="col" key={part.column.size.id} aria-colindex={part.column.index + 4} className="mx-size" data-size-id={part.column.size.id} data-window-column-width={part.column.width} style={{ top: windowing.viewport.stickyHeaderOffset }}>{part.column.size.label}</th>)}<th scope="col" aria-colindex={first.sizes.length + 4} className="mx-total-cell" data-window-column-width={76} style={{ top: windowing.viewport.stickyHeaderOffset }}>合计</th><th scope="col" aria-colindex={first.sizes.length + 5} className="mx-operation" data-window-column-width={70} style={{ top: windowing.viewport.stickyHeaderOffset }}>操作</th></tr></thead>
          <tbody>{entry.body.map(part => {
            if (part.kind === 'gap') return <tr key={`gap-${part.start}`} aria-hidden="true"><td colSpan={first.sizes.length + 5} style={{ height: part.height, minWidth: 0, padding: 0, border: 0 }} /></tr>;
            return <WindowRow key={part.row.key} {...props} row={part.row} window={rowWindow(part.row)} />;
          })}</tbody>
        </table>
      </section>;
    })}
  </div>;
}
function WindowRow(props: MatrixProps & { readonly row: InventoryWindowRow; readonly window: RowWindow }) {
  const { row } = props;
  if (!('product' in row)) return null;
  const productFold = <Fold expanded={!props.collapsedProducts.has(row.product.id)} label={`商品${row.product.code}`} toggle={() => props.toggleProduct(row.product.id)} />;
  if (row.kind === 'warehouse') {
    const colorFold = <Fold expanded label={`${row.product.code}${row.group.color.label}${row.group.fit.label}`} toggle={() => props.toggleColor(row.groupKey)} />;
    return <WarehouseRow {...props} product={row.product} group={row.group} row={row.source} first={row.firstInProduct} firstInGroup={row.firstInColorFit} productFold={productFold} colorFold={colorFold} />;
  }
  if (row.kind === 'product-total') return row.reason === 'collapsed'
    ? <TotalRow {...props} product={row.product} kind="product" folded first identity color={<Indent control={productFold}>所有颜色</Indent>} warehouse={<Indent control={spacer}>所有库存</Indent>} totals={row.product.sizeTotals} total={row.product.total} />
    : <TotalRow {...props} product={row.product} kind="product" label="商品合计" totals={row.product.sizeTotals} total={row.product.total} />;
  const colorFold = <Fold expanded={false} label={`${row.product.code}${row.group.color.label}${row.group.fit.label}`} toggle={() => props.toggleColor(row.groupKey)} />;
  return row.reason === 'collapsed'
    ? <TotalRow {...props} product={row.product} kind="color" folded first={row.firstInProduct} identity fit={row.group.fit.label} color={<Indent control={row.firstInProduct ? productFold : spacer}>{row.group.color.label}</Indent>} warehouse={<Indent control={colorFold}>所有库存</Indent>} totals={row.group.sizeTotals} total={row.group.total} />
    : <TotalRow {...props} product={row.product} kind="color" label="颜色小计" totals={row.group.sizeTotals} total={row.group.total} />;
}
