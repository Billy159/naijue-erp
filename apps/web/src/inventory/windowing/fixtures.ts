import type { InventoryPage, InventoryPageSize, InventoryProduct, InventoryRow, StockCell, StockTotal } from '../contracts.ts';
import type { InventoryLogicalCell, InventoryWindowLayout, InventoryWindowViewport } from './model.ts';
const total = (quantity: number): StockTotal => ({ knownQuantity: String(quantity), completeness: 'complete', unknownCells: 0 });

/** Synthetic structural fixture only. These metrics are not Demo measurements. */
export const testLayout = (overrides: Partial<InventoryWindowLayout> = {}): InventoryWindowLayout => ({
  heights: { 'section-description': 0, 'section-header': 20, warehouse: 28, 'color-total': 28, 'product-total': 28 },
  sizeWidth: 40, subtotal: false, total: true, collapsedProducts: new Set(), collapsedColors: new Set(), ...overrides,
});
export const testViewport = (overrides: Partial<InventoryWindowViewport> = {}): InventoryWindowViewport => ({
  scrollLeft: 0, scrollTop: 0, width: 400, height: 280, fixedLeadingWidth: 200, fixedTrailingWidth: 40, stickyHeaderOffset: 0, overscanRows: 2, overscanColumns: 1, ...overrides,
});
export function syntheticPage(productCount = 3, groupCount = 2, warehouseCount = 3, sizeCount = 6, onCellRead?: () => void): InventoryPage {
  const sizes = Array.from({ length: sizeCount }, (_,index) => ({ id: `size-${index}`, label: `尺寸${index}` }));
  const products: InventoryProduct[] = Array.from({ length: productCount }, (_, productIndex) => ({
    id: `product-${productIndex}`, code: `CODE-${productIndex}`, name: 'SYNTHETIC 商品', categoryLabel: 'SYNTHETIC 分类', supplierLabel: 'SYNTHETIC 供应商', seasonLabel: 'SYNTHETIC 季节', sizeGroup: { id: 'group-size', label: 'SYNTHETIC 尺码组' }, sizes,
    colorFits: Array.from({ length: groupCount }, (_, groupIndex) => ({
      color: { id: `color-${groupIndex}`, label: `颜色${groupIndex}` }, fit: { id: `fit-${groupIndex}`, label: `FIT${groupIndex}` },
      rows: Array.from({ length: warehouseCount }, (_, warehouseIndex): InventoryRow => {
        const cells: Record<string, StockCell> = Object.fromEntries(sizes.map(size => [size.id, { state: 'known', skuId: `sku-${productIndex}-${groupIndex}-${size.id}`, quantity: '1' }]));
        return { warehouse: { id: `warehouse-${warehouseIndex}`, label: `仓库${warehouseIndex}` }, get cells() { onCellRead?.(); return cells; }, total: total(sizeCount) };
      }), sizeTotals: Object.fromEntries(sizes.map(size => [size.id, total(warehouseCount)])), total: total(warehouseCount * sizeCount),
    })), sizeTotals: Object.fromEntries(sizes.map(size => [size.id, total(groupCount * warehouseCount)])), total: total(groupCount * warehouseCount * sizeCount),
  }));
  return { page: 1, pageSize: (productCount <= 100 ? 100 : productCount <= 200 ? 200 : 500) as InventoryPageSize, exactTotalProducts: productCount, products, warehouseLabels: Array.from({ length: warehouseCount }, (_, index) => `仓库${index}`), allMatchesTotal: total(productCount * groupCount * warehouseCount * sizeCount), readReference: 'synthetic-window-read-1' };
}
export const testAddress = (overrides: Partial<InventoryLogicalCell> = {}): InventoryLogicalCell => ({ productId: 'product-0', colorId: 'color-0', fitId: 'fit-0', warehouseId: 'warehouse-0', sizeId: 'size-0', ...overrides });
