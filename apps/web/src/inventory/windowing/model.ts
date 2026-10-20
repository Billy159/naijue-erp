import type { InventoryCellTarget, InventoryColorFit, InventoryPage, InventoryProduct, InventoryRow, InventorySize, StockCell } from '../contracts.ts';

/** Geometry is supplied by the verified renderer, never inferred from the Demo. */
export interface InventoryWindowLayout {
  readonly heights: Readonly<Record<InventoryWindowRow['kind'], number>>;
  /** Optional cached per-row measurement, e.g. first-row product metadata wrap. */
  readonly measuredRowHeight?: (row: InventoryWindowRowContent) => number | undefined;
  readonly sizeWidth: number | ((size: InventorySize, index: number, sectionKey: string) => number);
  readonly subtotal: boolean;
  readonly total: boolean;
  readonly collapsedProducts: ReadonlySet<string>;
  /** Same JSON [product ID, color ID, FIT ID] keys as the canonical matrix. */
  readonly collapsedColors: ReadonlySet<string>;
}
interface RowBase { readonly key: string; readonly index: number; readonly sectionIndex: number; readonly top: number; readonly height: number }
export type InventoryWindowRow =
  | (RowBase & { readonly kind: 'section-description' | 'section-header' })
  | (RowBase & { readonly kind: 'warehouse'; readonly product: InventoryProduct; readonly group: InventoryColorFit; readonly source: InventoryRow; readonly groupKey: string; readonly rowIndexInGroup: number; readonly firstInProduct: boolean; readonly firstInColorFit: boolean })
  | (RowBase & { readonly kind: 'color-total'; readonly product: InventoryProduct; readonly group: InventoryColorFit; readonly groupKey: string; readonly reason: 'collapsed' | 'subtotal'; readonly firstInProduct: boolean; readonly firstInColorFit: boolean })
  | (RowBase & { readonly kind: 'product-total'; readonly product: InventoryProduct; readonly reason: 'collapsed' | 'total'; readonly firstInProduct: boolean });
export interface InventoryWindowSection {
  readonly key: string;
  readonly index: number;
  readonly products: readonly InventoryProduct[];
  readonly sizes: readonly InventorySize[];
  readonly startRow: number;
  readonly endRow: number;
  readonly top: number;
  readonly height: number;
  readonly headerHeight: number;
  readonly headerRow: number;
  readonly headerTop: number;
  readonly sizeExtent: number;
}
export interface InventoryWindowViewport {
  /** Horizontal scroll is the moving size axis, excluding the fixed areas. */
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly width: number;
  readonly height: number;
  readonly fixedLeadingWidth: number;
  readonly fixedTrailingWidth: number;
  /** Existing chrome above the matrix, inside this viewport. */
  readonly stickyHeaderOffset: number;
  readonly overscanRows: number;
  readonly overscanColumns: number;
}
export interface AxisWindow {
  /** Half-open logical range [start, end). No data is removed from the model. */
  readonly start: number;
  readonly end: number;
  readonly before: number;
  readonly after: number;
  readonly totalExtent: number;
}
export interface InventoryWindowColumn { readonly index: number; readonly size: InventorySize; readonly left: number; readonly width: number }
export interface InventorySectionWindow {
  readonly section: InventoryWindowSection;
  readonly range: AxisWindow;
  readonly columns: readonly InventoryWindowColumn[];
  readonly fixedLeadingWidth: number;
  readonly fixedTrailingWidth: number;
}
export interface InventoryViewportWindow {
  readonly range: AxisWindow;
  readonly rows: readonly InventoryWindowRow[];
  readonly sections: readonly InventorySectionWindow[];
  /** Optional single pinned section header; top includes next-section push-off. */
  readonly stickyHeader: { readonly row: InventoryWindowRow; readonly section: InventoryWindowSection; readonly top: number } | null;
}
export interface InventoryLogicalCell {
  readonly productId: string;
  readonly colorId: string;
  readonly fitId: string;
  readonly warehouseId: string;
  readonly sizeId: string;
}
export interface InventoryCellLocation {
  readonly address: InventoryLogicalCell;
  readonly product: InventoryProduct;
  readonly group: InventoryColorFit;
  readonly source: InventoryRow;
  readonly size: InventorySize;
  readonly cell: StockCell;
  readonly sectionIndex: number;
  readonly columnIndex: number;
  /** Null when its owning product or color/FIT is collapsed. */
  readonly rowIndex: number | null;
  readonly reveal: { readonly productId: string | null; readonly colorFitKey: string | null };
}
export type InventoryScrollPlan =
  | { readonly kind: 'hidden'; readonly location: InventoryCellLocation }
  | { readonly kind: 'visible'; readonly location: InventoryCellLocation; readonly scrollTop: number; readonly scrollLeft: number };
export type ScrollAlignment = 'nearest' | 'start' | 'center' | 'end';
export type InventoryFocusDirection = 'left' | 'right' | 'up' | 'down' | 'row-start' | 'row-end';
export interface InventoryScrollAnchor {
  readonly rowKey: string;
  readonly sectionKey: string;
  readonly productId: string | null;
  readonly colorFitKey: string | null;
  readonly offsetWithinRow: number;
  /** Captured visible header occlusion below chrome, including section push-off. */
  readonly insetBelowChrome: number;
  /** Preserve transition context, while remeasuring fully pinned headers. */
  readonly headerContext: { readonly sectionKey: string; readonly mode: 'pinned' | 'push-off' } | null;
}

/** Overscan is a technical safety boundary, not a business page-size limit. */
export const MAX_INVENTORY_OVERSCAN = 100;
/** Validate caller geometry before adapters translate coordinate systems. */
export function validateInventoryWindowViewport(viewport: InventoryWindowViewport): void { validateViewport(viewport); }
export const inventoryColorFitKey = (productId: string, colorId: string, fitId: string): string => JSON.stringify([productId, colorId, fitId]);
export const inventorySectionKey = (product: InventoryProduct): string => JSON.stringify([product.sizeGroup.id, product.sizes.map(size => [size.id, size.label])]);
const warehouseKey = (groupKey: string, warehouseId: string): string => JSON.stringify([groupKey, warehouseId]);
interface SectionIndex { readonly section: InventoryWindowSection; readonly offsets: readonly number[]; readonly sizeIndices: ReadonlyMap<string, number>; readonly warehouseRows: readonly number[] }
interface GroupIndex { readonly product: InventoryProduct; readonly group: InventoryColorFit; readonly sectionIndex: number; readonly warehouses: ReadonlyMap<string, InventoryRow> }

/**
 * Index only row/group/column metadata. It never traverses row.cells or copies
 * warehouse × SKU cells, and never derives an exact total from a visible slice.
 * Input must already have passed the canonical inventory response validator.
 */
export class InventoryWindowModel {
  readonly data: InventoryPage;
  readonly rows: readonly InventoryWindowRow[];
  readonly sections: readonly InventoryWindowSection[];
  readonly totalHeight: number;
  readonly metadata: { readonly productCount: number; readonly groupCount: number; readonly indexedWarehouseRows: number; readonly rowCount: number; readonly columnCount: number; readonly allocatedCellDescriptors: 0 };
  readonly #rowOffsets: readonly number[];
  readonly #sectionIndices: readonly SectionIndex[];
  readonly #groups: ReadonlyMap<string, GroupIndex>;
  readonly #visibleWarehouses: ReadonlyMap<string, number>;
  readonly #rowIndices: ReadonlyMap<string, number>;
  readonly #productFirstRows: ReadonlyMap<string, number>;
  readonly #collapsedProducts: ReadonlySet<string>;
  readonly #collapsedColors: ReadonlySet<string>;

  constructor(data: InventoryPage, layout: InventoryWindowLayout) {
    for (const kind of ['section-header', 'warehouse', 'color-total', 'product-total'] as const) positive(layout.heights[kind], 'row height');
    nonnegative(layout.heights['section-description'], 'optional section description height');
    this.data = data;
    this.#collapsedProducts = new Set(layout.collapsedProducts);
    this.#collapsedColors = new Set(layout.collapsedColors);
    const grouped = new Map<string, InventoryProduct[]>();
    for (const product of data.products) {
      const key = inventorySectionKey(product);
      const products = grouped.get(key);
      if (products) products.push(product); else grouped.set(key, [product]);
    }
    const rows: InventoryWindowRow[] = [];
    const offsets = [0];
    const sectionIndices: SectionIndex[] = [];
    const groups = new Map<string, GroupIndex>();
    const visibleWarehouses = new Map<string, number>();
    const productFirstRows = new Map<string, number>();
    let indexedWarehouseRows = 0;
    let columnCount = 0;
    const append = (sectionIndex: number, row: InventoryWindowRowContent) => {
      const height = layout.measuredRowHeight?.(row) ?? layout.heights[row.kind];
      positive(height, 'row height');
      const top = offsets[offsets.length - 1]!;
      const bottom = top + height;
      if (!Number.isSafeInteger(Math.ceil(bottom))) throw new RangeError('Row extent exceeds safe geometry.');
      rows.push(Object.freeze({ ...row, index: rows.length, sectionIndex, top, height }) as InventoryWindowRow);
      offsets.push(bottom);
    };
    for (const [key, products] of grouped) {
      const index = sectionIndices.length;
      const startRow = rows.length;
      const top = offsets[offsets.length - 1]!;
      const sizes = products[0]!.sizes;
      const sizeOffsets = [0];
      const sizeIndices = new Map<string, number>();
      for (const [sizeIndex, size] of sizes.entries()) {
        const width = typeof layout.sizeWidth === 'number' ? layout.sizeWidth : layout.sizeWidth(size, sizeIndex, key);
        positive(width, 'size width');
        const right = sizeOffsets[sizeOffsets.length - 1]! + width;
        if (!Number.isSafeInteger(Math.ceil(right))) throw new RangeError('Column extent exceeds safe geometry.');
        sizeOffsets.push(right);
        sizeIndices.set(size.id, sizeIndex);
      }
      columnCount += sizes.length;
      const warehouseRows: number[] = [];
      if (layout.heights['section-description'] > 0) append(index, { kind: 'section-description', key: JSON.stringify(['section-description', key]) });
      const headerRow = rows.length;
      const headerTop = offsets[offsets.length - 1]!;
      append(index, { kind: 'section-header', key: JSON.stringify(['section', key]) });
      for (const product of products) {
        const collapsed = this.#collapsedProducts.has(product.id);
        const productStart = rows.length;
        for (const group of product.colorFits) {
          const groupKey = inventoryColorFitKey(product.id, group.color.id, group.fit.id);
          groups.set(groupKey, { product, group, sectionIndex: index, warehouses: new Map(group.rows.map(row => [row.warehouse.id, row])) });
          indexedWarehouseRows += group.rows.length;
          if (collapsed) continue;
          if (this.#collapsedColors.has(groupKey)) {
            append(index, { kind: 'color-total', key: JSON.stringify(['color-total', groupKey]), product, group, groupKey, reason: 'collapsed', firstInProduct: rows.length === productStart, firstInColorFit: true });
          } else {
            for (const [rowIndexInGroup, source] of group.rows.entries()) {
              visibleWarehouses.set(warehouseKey(groupKey, source.warehouse.id), rows.length);
              warehouseRows.push(rows.length);
              append(index, { kind: 'warehouse', key: JSON.stringify(['warehouse', product.id, group.color.id, group.fit.id, source.warehouse.id]), product, group, source, groupKey, rowIndexInGroup, firstInProduct: rows.length === productStart, firstInColorFit: rowIndexInGroup === 0 });
            }
            if (layout.subtotal) append(index, { kind: 'color-total', key: JSON.stringify(['color-total', groupKey]), product, group, groupKey, reason: 'subtotal', firstInProduct: rows.length === productStart, firstInColorFit: group.rows.length === 0 });
          }
        }
        if (collapsed || layout.total) append(index, { kind: 'product-total', key: JSON.stringify(['product-total', product.id]), product, reason: collapsed ? 'collapsed' : 'total', firstInProduct: rows.length === productStart });
        if (rows.length > productStart) productFirstRows.set(product.id, productStart);
      }
      const section = Object.freeze({ key, index, products: Object.freeze(products), sizes, startRow, endRow: rows.length, top, height: offsets[offsets.length - 1]! - top, headerHeight: rows[headerRow]!.height, headerRow, headerTop, sizeExtent: sizeOffsets[sizeOffsets.length - 1]! });
      sectionIndices.push({ section, offsets: sizeOffsets, sizeIndices, warehouseRows });
    }
    this.rows = Object.freeze(rows);
    this.sections = Object.freeze(sectionIndices.map(entry => entry.section));
    this.totalHeight = offsets[offsets.length - 1]!;
    this.#rowOffsets = offsets;
    this.#sectionIndices = sectionIndices;
    this.#groups = groups;
    this.#visibleWarehouses = visibleWarehouses;
    this.#rowIndices = new Map(rows.map(row => [row.key, row.index]));
    this.#productFirstRows = productFirstRows;
    this.metadata = Object.freeze({ productCount: data.products.length, groupCount: groups.size, indexedWarehouseRows, rowCount: rows.length, columnCount, allocatedCellDescriptors: 0 });
  }

  window(viewport: InventoryWindowViewport): InventoryViewportWindow {
    validateViewport(viewport);
    const range = axisWindow(this.#rowOffsets, viewport.scrollTop, viewport.height, viewport.overscanRows);
    const rows = this.rows.slice(range.start, range.end);
    const pinned = this.#stickyHeader(viewport);
    const sectionIds = new Set(rows.map(row => row.sectionIndex));
    if (pinned) sectionIds.add(pinned.section.index);
    const sections = [...sectionIds].sort((a, b) => a - b).map(index => {
      const entry = this.#sectionIndices[index]!;
      const range = axisWindow(entry.offsets, viewport.scrollLeft, Math.max(0, viewport.width - viewport.fixedLeadingWidth - viewport.fixedTrailingWidth), viewport.overscanColumns);
      const columns: InventoryWindowColumn[] = [];
      for (let index = range.start; index < range.end; index++) columns.push({ index, size: entry.section.sizes[index]!, left: entry.offsets[index]!, width: entry.offsets[index + 1]! - entry.offsets[index]! });
      return { section: entry.section, range, columns, fixedLeadingWidth: viewport.fixedLeadingWidth, fixedTrailingWidth: viewport.fixedTrailingWidth };
    });
    return { range, rows, sections, stickyHeader: pinned };
  }

  /** O(1) column geometry for retaining one focused cell outside a window. */
  column(sectionIndex: number, index: number): InventoryWindowColumn | null {
    const entry = this.#sectionIndices[sectionIndex];
    const size = entry?.section.sizes[index];
    if (!entry || !size) return null;
    return { index, size, left: entry.offsets[index]!, width: entry.offsets[index + 1]! - entry.offsets[index]! };
  }

  resolveCell(address: InventoryLogicalCell): InventoryCellLocation | null {
    const groupKey = inventoryColorFitKey(address.productId, address.colorId, address.fitId);
    const entry = this.#groups.get(groupKey);
    if (!entry) return null;
    const source = entry.warehouses.get(address.warehouseId);
    const columnIndex = this.#sectionIndices[entry.sectionIndex]!.sizeIndices.get(address.sizeId);
    if (!source || columnIndex === undefined) return null;
    const cell = source.cells[address.sizeId];
    if (!cell) throw new TypeError('Unvalidated inventory cell: missing is never zero.');
    return { address, product: entry.product, group: entry.group, source, size: entry.product.sizes[columnIndex]!, cell, sectionIndex: entry.sectionIndex, columnIndex, rowIndex: this.#visibleWarehouses.get(warehouseKey(groupKey, address.warehouseId)) ?? null, reveal: { productId: this.#collapsedProducts.has(address.productId) ? address.productId : null, colorFitKey: this.#collapsedColors.has(groupKey) ? groupKey : null } };
  }

  cellTarget(address: InventoryLogicalCell): InventoryCellTarget | null {
    const cell = this.resolveCell(address);
    if (!cell || cell.cell.state === 'not-applicable') return null;
    return { productId: cell.product.id, productLabel: `${cell.product.code} ${cell.product.name}`, color: cell.group.color, fit: cell.group.fit, size: cell.size, warehouse: cell.source.warehouse, skuId: cell.cell.skuId, readReference: this.data.readReference };
  }

  /** No key bindings are imposed. Up/down stay in this section and retain size ID. */
  moveFocus(address: InventoryLogicalCell, direction: InventoryFocusDirection, steps = 1): InventoryLogicalCell | null {
    if (!Number.isSafeInteger(steps) || steps < 1) throw new RangeError('Focus steps must be a positive integer.');
    const location = this.resolveCell(address);
    if (!location || location.rowIndex === null) return null;
    const section = this.#sectionIndices[location.sectionIndex]!;
    let current = address;
    for (let step = 0; step < steps; step++) {
      let next: InventoryLogicalCell | null = null;
      if (direction === 'left' || direction === 'right' || direction === 'row-start' || direction === 'row-end') {
        const from = section.sizeIndices.get(current.sizeId)!;
        const reverse = direction === 'left' || direction === 'row-end';
        const start = direction === 'row-start' ? 0 : direction === 'row-end' ? section.section.sizes.length - 1 : from + (reverse ? -1 : 1);
        for (let index = start; index >= 0 && index < section.section.sizes.length; index += reverse ? -1 : 1) {
          const candidate = { ...current, sizeId: section.section.sizes[index]!.id };
          if (this.resolveCell(candidate)!.cell.state !== 'not-applicable') { next = candidate; break; }
        }
      } else {
        const rowIndex = this.resolveCell(current)!.rowIndex!;
        const start = lowerBound(section.warehouseRows, rowIndex);
        const delta = direction === 'up' ? -1 : 1;
        for (let index = start + delta; index >= 0 && index < section.warehouseRows.length; index += delta) {
          const row = this.rows[section.warehouseRows[index]!]!;
          if (row.kind !== 'warehouse') throw new Error('Invalid warehouse row index.');
          const candidate = { productId: row.product.id, colorId: row.group.color.id, fitId: row.group.fit.id, warehouseId: row.source.warehouse.id, sizeId: current.sizeId };
          if (this.resolveCell(candidate)!.cell.state !== 'not-applicable') { next = candidate; break; }
        }
      }
      if (!next) break;
      current = next;
    }
    return current;
  }

  scrollToCell(address: InventoryLogicalCell, viewport: InventoryWindowViewport, alignment: ScrollAlignment = 'nearest'): InventoryScrollPlan | null {
    validateViewport(viewport);
    const location = this.resolveCell(address);
    if (!location) return null;
    if (location.rowIndex === null) return { kind: 'hidden', location };
    const row = this.rows[location.rowIndex]!;
    const section = this.#sectionIndices[location.sectionIndex]!;
    const verticalInset = viewport.stickyHeaderOffset + section.section.headerHeight;
    const scrollTop = alignScroll(viewport.scrollTop, row.top, row.height, viewport.height, verticalInset, this.totalHeight, alignment);
    const width = Math.max(0, viewport.width - viewport.fixedLeadingWidth - viewport.fixedTrailingWidth);
    const left = section.offsets[location.columnIndex]!;
    const scrollLeft = alignScroll(viewport.scrollLeft, left, section.offsets[location.columnIndex + 1]! - left, width, 0, section.section.sizeExtent, alignment);
    return { kind: 'visible', location, scrollTop, scrollLeft };
  }

  /** Capture the first row at the usable body edge, not an ephemeral DOM index. */
  captureScrollAnchor(viewport: InventoryWindowViewport): InventoryScrollAnchor | null {
    validateViewport(viewport);
    if (!this.rows.length || viewport.height === 0) return null;
    const header = this.#stickyHeader(viewport);
    // A pushed header can expose part of the following section's description.
    // Keep the actual viewport edge and its context, not a full header height
    // inferred later from whichever logical row happens to cross that edge.
    const bodyEdge = Math.max(viewport.stickyHeaderOffset, header ? header.top + header.section.headerHeight : 0);
    const position = viewport.scrollTop + bodyEdge;
    const index = Math.min(this.rows.length - 1, Math.max(0, upperBound(this.#rowOffsets, position) - 1));
    const row = this.rows[index]!;
    return { rowKey: row.key, sectionKey: this.sections[row.sectionIndex]!.key, productId: 'product' in row ? row.product.id : null, colorFitKey: row.kind === 'warehouse' || row.kind === 'color-total' ? row.groupKey : null, offsetWithinRow: Math.min(row.height, Math.max(0, position - row.top)), insetBelowChrome: bodyEdge - viewport.stickyHeaderOffset, headerContext: header ? { sectionKey: header.section.key, mode: header.top < viewport.stickyHeaderOffset ? 'push-off' : 'pinned' } : null };
  }

  /** Hidden/removed row fallback: its color total, first product row, then section. */
  restoreScrollAnchor(anchor: InventoryScrollAnchor, viewport: InventoryWindowViewport): number | null {
    validateViewport(viewport);
    nonnegative(anchor.offsetWithinRow, 'anchor offset');
    nonnegative(anchor.insetBelowChrome, 'anchor inset');
    let index = this.#rowIndices.get(anchor.rowKey);
    const exact = index !== undefined;
    if (index === undefined && anchor.colorFitKey) index = this.#rowIndices.get(JSON.stringify(['color-total', anchor.colorFitKey]));
    if (index === undefined && anchor.productId) index = this.#productFirstRows.get(anchor.productId);
    if (index === undefined) index = this.sections.find(section => section.key === anchor.sectionKey)?.startRow;
    if (index === undefined) return null;
    const row = this.rows[index]!;
    const header = anchor.headerContext ? this.sections.find(section => section.key === anchor.headerContext!.sectionKey) ?? this.sections[row.sectionIndex]! : null;
    const headerInset = !header ? 0 : anchor.headerContext!.mode === 'pinned' ? header.headerHeight : Math.min(anchor.insetBelowChrome, header.headerHeight);
    const inset = viewport.stickyHeaderOffset + headerInset;
    const offset = exact ? Math.min(row.height, anchor.offsetWithinRow) : 0;
    return Math.min(Math.max(0, this.totalHeight - viewport.height), Math.max(0, row.top + offset - inset));
  }

  #stickyHeader(viewport: InventoryWindowViewport): InventoryViewportWindow['stickyHeader'] {
    const position = viewport.scrollTop + viewport.stickyHeaderOffset;
    let low = 0;
    let high = this.sections.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.sections[mid]!.top <= position) low = mid + 1; else high = mid;
    }
    const section = this.sections[low - 1];
    if (!section || position < section.headerTop || position >= section.top + section.height || viewport.height === 0) return null;
    return { row: this.rows[section.headerRow]!, section, top: Math.min(viewport.stickyHeaderOffset, section.top + section.height - viewport.scrollTop - section.headerHeight) };
  }
}

export type InventoryWindowRowContent = InventoryWindowRow extends infer Row ? Row extends InventoryWindowRow ? Omit<Row, keyof RowBase> & Pick<Row, 'key'> : never : never;
function positive(value: number, name: string): void { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive.`); }
function nonnegative(value: number, name: string): void { if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative.`); }
function validateViewport(viewport: InventoryWindowViewport): void {
  for (const field of ['scrollLeft', 'scrollTop', 'width', 'height', 'fixedLeadingWidth', 'fixedTrailingWidth', 'stickyHeaderOffset'] as const) nonnegative(viewport[field], field);
  for (const value of [viewport.overscanRows, viewport.overscanColumns]) if (!Number.isSafeInteger(value) || value < 0 || value > MAX_INVENTORY_OVERSCAN) throw new RangeError(`Overscan must be an integer from 0 to ${MAX_INVENTORY_OVERSCAN}.`);
}
function lowerBound(values: readonly number[], target: number): number {
  let low = 0; let high = values.length;
  while (low < high) { const mid = (low + high) >>> 1; if (values[mid]! < target) low = mid + 1; else high = mid; }
  return low;
}
function upperBound(values: readonly number[], target: number): number {
  let low = 0; let high = values.length;
  while (low < high) { const mid = (low + high) >>> 1; if (values[mid]! <= target) low = mid + 1; else high = mid; }
  return low;
}
/** All offsets are prefix boundaries; zero viewport never mounts overscan alone. */
function axisWindow(offsets: readonly number[], scroll: number, viewport: number, overscan: number): AxisWindow {
  const count = offsets.length - 1;
  const totalExtent = offsets[count]!;
  const position = Math.min(scroll, totalExtent);
  const visibleStart = Math.min(count, Math.max(0, upperBound(offsets, position) - 1));
  if (!count || viewport === 0 || position >= totalExtent) return { start: visibleStart, end: visibleStart, before: offsets[visibleStart]!, after: totalExtent - offsets[visibleStart]!, totalExtent };
  const visibleEnd = Math.min(count, lowerBound(offsets, Math.min(totalExtent, position + viewport)));
  const start = Math.max(0, visibleStart - overscan);
  const end = Math.min(count, visibleEnd + overscan);
  return { start, end, before: offsets[start]!, after: totalExtent - offsets[end]!, totalExtent };
}
function alignScroll(current: number, start: number, extent: number, viewport: number, inset: number, total: number, alignment: ScrollAlignment): number {
  const available = Math.max(0, viewport - inset);
  let target = current;
  if (alignment === 'start' || extent > available) target = start - inset;
  else if (alignment === 'center') target = start - inset - (available - extent) / 2;
  else if (alignment === 'end') target = start + extent - viewport;
  else if (start < current + inset) target = start - inset;
  else if (start + extent > current + viewport) target = start + extent - viewport;
  return Math.min(Math.max(0, total - viewport), Math.max(0, target));
}
