import { InventoryWindowModel, validateInventoryWindowViewport, type InventoryLogicalCell, type InventoryWindowColumn, type InventoryWindowRow, type InventoryWindowSection, type InventoryWindowViewport } from './model.ts';

export type InventoryColumnPart = { readonly kind: 'column'; readonly column: InventoryWindowColumn } | { readonly kind: 'gap'; readonly start: number; readonly count: number; readonly width: number };
export type InventoryBodyPart = { readonly kind: 'row'; readonly row: InventoryWindowRow } | { readonly kind: 'gap'; readonly start: number; readonly height: number };
export interface InventoryRenderSection {
  readonly section: InventoryWindowSection;
  readonly top: number;
  readonly columns: readonly InventoryColumnPart[];
  readonly body: readonly InventoryBodyPart[];
}
export interface InventoryRenderPlan {
  readonly height: number;
  readonly sections: readonly InventoryRenderSection[];
}

/** Preserve existing section margins without pretending they are table rows. */
export function inventoryModelViewport(model: InventoryWindowModel, viewport: InventoryWindowViewport, sectionGap: number): InventoryWindowViewport {
  validateGap(model, sectionGap);
  validateInventoryWindowViewport(viewport);
  if (!Number.isFinite(viewport.scrollTop + viewport.height)) throw new RangeError('Viewport extent must remain finite.');
  const top = toModelPosition(model, viewport.scrollTop, sectionGap);
  return { ...viewport, scrollTop: top, height: Math.max(0, toModelPosition(model, viewport.scrollTop + viewport.height, sectionGap) - top) };
}
export function inventoryDOMScrollTop(model: InventoryWindowModel, top: number, sectionGap: number): number {
  validateGap(model, sectionGap);
  if (!Number.isFinite(top) || top < 0) throw new RangeError('Scroll position must be finite and nonnegative.');
  let index = 0;
  for (const section of model.sections) { if (section.top > top) break; index = section.index; }
  const result = top + index * sectionGap;
  if (!Number.isSafeInteger(Math.ceil(result))) throw new RangeError('Scroll extent exceeds safe geometry.');
  return result;
}

/** A native-table plan: visible rows/columns plus at most one retained focus. */
export function createInventoryRenderPlan(model: InventoryWindowModel, viewport: InventoryWindowViewport, sectionGap: number, focus: InventoryLogicalCell | null = null): InventoryRenderPlan {
  const window = model.window(inventoryModelViewport(model, viewport, sectionGap));
  const focused = focus ? model.resolveCell(focus) : null;
  const sectionIndices = new Set(window.sections.map(entry => entry.section.index));
  if (focused?.rowIndex !== null && focused?.rowIndex !== undefined) sectionIndices.add(focused.sectionIndex);
  const sections = [...sectionIndices].sort((a, b) => a - b).map(index => {
    const section = model.sections[index]!;
    const visible = window.sections.find(entry => entry.section.index === index);
    const columns = new Map(visible?.columns.map(column => [column.index, column]));
    if (focused?.sectionIndex === index && focused.rowIndex !== null) {
      const column = model.column(index, focused.columnIndex)!;
      columns.set(column.index, column);
    }
    const parts: InventoryColumnPart[] = [];
    let nextColumn = 0, left = 0;
    for (const column of [...columns.values()].sort((a, b) => a.index - b.index)) {
      if (column.index > nextColumn) parts.push({ kind: 'gap', start: nextColumn, count: column.index - nextColumn, width: column.left - left });
      parts.push({ kind: 'column', column });
      nextColumn = column.index + 1; left = column.left + column.width;
    }
    if (nextColumn < section.sizes.length) parts.push({ kind: 'gap', start: nextColumn, count: section.sizes.length - nextColumn, width: section.sizeExtent - left });
    const rows = new Map(window.rows.filter(row => row.sectionIndex === index && row.index > section.headerRow).map(row => [row.index, row]));
    if (focused?.sectionIndex === index && focused.rowIndex !== null) rows.set(focused.rowIndex, model.rows[focused.rowIndex]!);
    const body: InventoryBodyPart[] = [];
    let top = section.headerTop + section.headerHeight, nextRow = section.headerRow + 1;
    for (const row of [...rows.values()].sort((a, b) => a.index - b.index)) {
      if (row.top > top) body.push({ kind: 'gap', start: nextRow, height: row.top - top });
      body.push({ kind: 'row', row });
      top = row.top + row.height; nextRow = row.index + 1;
    }
    if (top < section.top + section.height) body.push({ kind: 'gap', start: nextRow, height: section.top + section.height - top });
    return { section, top: section.top + index * sectionGap, columns: parts, body };
  });
  return { height: model.totalHeight + model.sections.length * sectionGap, sections };
}
function validateGap(model: InventoryWindowModel, gap: number): void {
  if (!Number.isFinite(gap) || gap < 0) throw new RangeError('Measured section gap must be finite and nonnegative.');
  if (!Number.isSafeInteger(Math.ceil(model.totalHeight + model.sections.length * gap))) throw new RangeError('Section extent exceeds safe geometry.');
}
function toModelPosition(model: InventoryWindowModel, top: number, gap: number): number {
  // Sections, not products or stock cells. Margin pixels never become inventory.
  let low = 0, high = model.sections.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2), section = model.sections[middle]!;
    if (section.top + middle * gap <= top) low = middle + 1; else high = middle;
  }
  const section = model.sections[Math.max(0, low - 1)];
  return section ? Math.min(section.top + section.height, Math.max(section.top, top - section.index * gap)) : 0;
}
