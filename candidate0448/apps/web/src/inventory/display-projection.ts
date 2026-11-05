import type { InventoryColorFit, InventoryProduct, InventoryRow, InventorySize, Selection, StockCell, StockTotal } from './contracts.ts';
import { sumTotals, totalOf } from './model.ts';

/** A display source retains a real coordinate and its explicit known/unknown state. */
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
  | { readonly state: 'unknown'; readonly knownQuantity: string; readonly unknownCells: number; readonly sources: readonly InventoryDisplaySource[] }
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
export type InventoryIdentifiedDisplaySource = InventoryDisplaySource & { readonly cell: Extract<StockCell, { state: 'known' | 'unknown' }> };
export function identifiedDisplaySources(cell: InventoryDisplayCell): readonly InventoryIdentifiedDisplaySource[] { return cell.sources.filter((source): source is InventoryIdentifiedDisplaySource => source.cell.state !== 'not-applicable'); }
export function knownDisplaySources(cell: InventoryDisplayCell): readonly InventoryKnownDisplaySource[] {
  return cell.sources.filter((source): source is InventoryKnownDisplaySource => source.cell.state === 'known');
}

/**
 * Project ONE canonical product identity across FIT for display only. Never group
 * products by matching names/codes, alter paging, manufacture SKUs or cross-join
 * warehouses. All source cells, including unknown and non-applicable states, remain
 * available; unknown quantities are never converted to zero.
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
    const sizes = new Map(product.sizes.map(size => [size.id, size]));
    const sum = sumTotals;
    // The canonical page has already validated its totals. Keep row references,
    // not a second warehouse×size matrix or retained per-cell source arrays.
    const rows: InventoryDisplayRow[] = [...warehouses.values()].map(parts => {
      const readCell = (id: string): InventoryDisplayCell | undefined => {
        const size = sizes.get(id); if (!size) return undefined;
        const cells = parts.map(({ row }) => row.cells[id]!);
        const total = totalOf(cells);
        for (const cell of cells) if (cell.state !== 'not-applicable' && !cell.skuId?.trim()) throw new TypeError('库存来源 SKU 身份缺失。');
        const sources = () => parts.map(({ group, row }): InventoryDisplaySource => ({ productId: product.id, color: group.color, fit: group.fit, warehouse: row.warehouse, size, cell: row.cells[id]! }));
        return total.unknownCells ? { state: 'unknown', knownQuantity: total.knownQuantity, unknownCells: total.unknownCells, get sources() { return sources(); } } : cells.some(cell => cell.state === 'known')
          ? { state: 'known', quantity: total.knownQuantity, get sources() { return sources(); } }
          : { state: 'not-applicable', get sources() { return sources(); } };
      };
      const cells = new Proxy({} as Record<string, InventoryDisplayCell>, {
        get: (_target, id) => typeof id === 'string' ? readCell(id) : undefined,
        ownKeys: () => [...sizes.keys()],
        getOwnPropertyDescriptor: (_target, id) => typeof id === 'string' && sizes.has(id) ? { configurable: true, enumerable: true, get: () => readCell(id) } : undefined,
      });
      return { warehouse: parts[0]!.row.warehouse, cells, get total() { return sum(parts.map(({ row }) => row.total)); }, sources: parts };
    });
    const sizeTotals = new Proxy({} as Record<string, StockTotal>, {
      get: (_target, id) => typeof id === 'string' && sizes.has(id) ? sum(groups.map(group => group.sizeTotals[id]!)) : undefined,
      ownKeys: () => [...sizes.keys()],
      getOwnPropertyDescriptor: (_target, id) => typeof id === 'string' && sizes.has(id) ? { configurable: true, enumerable: true, get: () => sum(groups.map(group => group.sizeTotals[id]!)) } : undefined,
    });
    return { color: groups[0]!.color, fit: null, rows, sources: groups, sizeTotals, get total() { return sum(groups.map(group => group.total)); } };
  });
}
