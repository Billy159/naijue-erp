import type { InventoryColorFit, InventoryProduct, InventoryRow, InventorySize, Selection, StockCell, StockTotal } from './contracts.ts';
import { totalOf } from './model.ts';

/** A display source is a real, complete warehouse/SKU fact, never a writable group identity. */
export interface InventoryDisplaySource {
  readonly productId: string;
  readonly color: Selection;
  readonly fit: Selection;
  readonly warehouse: Selection;
  readonly size: InventorySize;
  readonly cell: StockCell;
}
export type InventoryDisplayCell =
  | { readonly state: 'known'; readonly quantity: string; readonly sources: readonly InventoryDisplaySource[] }
  | { readonly state: 'not-applicable'; readonly sources: readonly InventoryDisplaySource[] };
export interface InventoryDisplayRow {
  readonly warehouse: Selection;
  readonly cells: Readonly<Record<string, InventoryDisplayCell>>;
  readonly total: StockTotal;
  readonly sources: readonly { readonly group: InventoryColorFit; readonly row: InventoryRow }[];
}
export interface InventoryDisplayColor {
  readonly color: Selection;
  /** Null means FIT is hidden in this read-only view, not a synthetic canonical FIT. */
  readonly fit: null;
  readonly rows: readonly InventoryDisplayRow[];
  readonly sizeTotals: Readonly<Record<string, StockTotal>>;
  readonly total: StockTotal;
  readonly sources: readonly InventoryColorFit[];
}
export type InventoryKnownDisplaySource = InventoryDisplaySource & { readonly cell: Extract<StockCell, { state: 'known' }> };
export function knownDisplaySources(cell: InventoryDisplayCell): readonly InventoryKnownDisplaySource[] {
  return cell.sources.filter((source): source is InventoryKnownDisplaySource => source.cell.state === 'known');
}

/**
 * Project ONE canonical product identity across FIT for display only. Never group
 * products by matching names/codes, alter paging, manufacture SKUs or cross-join
 * warehouses. All source cells, including explicit non-applicable states, remain
 * available; a missing/unknown source is rejected, not converted to zero.
 */
export function projectInventoryColors(product: InventoryProduct): readonly InventoryDisplayColor[] {
  const colors = new Map<string, InventoryColorFit[]>();
  for (const group of product.colorFits) {
    const parts = colors.get(group.color.id);
    if (parts) parts.push(group); else colors.set(group.color.id, [group]);
  }
  return [...colors.values()].map(groups => {
    const warehouses = new Map<string, { readonly group: InventoryColorFit; readonly row: InventoryRow }[]>();
    for (const group of groups) for (const row of group.rows) {
      const parts = warehouses.get(row.warehouse.id);
      if (parts) parts.push({ group, row }); else warehouses.set(row.warehouse.id, [{ group, row }]);
    }
    const rows: InventoryDisplayRow[] = [...warehouses.values()].map(parts => {
      const cells: Record<string, InventoryDisplayCell> = {};
      for (const size of product.sizes) {
        const sources = parts.map(({ group, row }): InventoryDisplaySource => ({ productId: product.id, color: group.color, fit: group.fit, warehouse: row.warehouse, size, cell: row.cells[size.id]! }));
        const total = totalOf(sources.map(source => source.cell));
        // totalOf rejects unknown/missing states before inspecting source identities.
        for (const source of sources) if (source.cell.state === 'known' && !source.cell.skuId?.trim()) throw new TypeError('库存来源 SKU 身份缺失。');
        cells[size.id] = sources.some(source => source.cell.state === 'known')
          ? { state: 'known', quantity: total.knownQuantity, sources }
          : { state: 'not-applicable', sources };
      }
      return { warehouse: parts[0]!.row.warehouse, cells, total: totalOf(parts.flatMap(({ row }) => product.sizes.map(size => row.cells[size.id]!))), sources: parts };
    });
    return {
      color: groups[0]!.color, fit: null, rows, sources: groups,
      sizeTotals: Object.fromEntries(product.sizes.map(size => [size.id, totalOf(groups.flatMap(group => group.rows.map(row => row.cells[size.id]!)))])),
      total: totalOf(groups.flatMap(group => group.rows.flatMap(row => product.sizes.map(size => row.cells[size.id]!)))),
    };
  });
}
