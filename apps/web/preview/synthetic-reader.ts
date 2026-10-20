import type { QueryRead } from '../src/loading/latest-query.ts';
import type { Candidate, CandidateKind, CandidatePage, CandidateParameters, InventoryColorFit, InventoryFilter, InventoryPage, InventoryParameters, InventoryProduct, InventoryReader, InventoryRow, Selection, StockCell, StockTotal } from '../src/inventory/contracts.ts';
import { totalOf } from '../src/inventory/model.ts';

/** TEST ONLY. Generated fixture, never a business/default reader or production fallback. */
const sizes = ['160/XS', '165/S', '170/M', '175/L', '180/XL', '185/2XL', '190/3XL', '195/4XL', '200/5XL', '205/6XL', '无尺码'].map((label, index) => ({ id: `test-size-${index}`, label }));
const fits: readonly Selection[] = [
  { id: 'test-fit-Y', label: 'Y版（修身）' }, { id: 'test-fit-A', label: 'A版（标准）' },
  { id: 'test-fit-B', label: 'B版（宽松）' }, { id: 'test-fit-C', label: 'C版（加肥）' },
  { id: 'test-fit-D', label: 'D版（加肥加大）' }, { id: 'test-fit-E', label: 'E版（特体）' },
];
const warehouses: readonly Selection[] = [{ id: 'test-warehouse-main', label: '测试总仓' }, { id: 'test-warehouse-store', label: '测试门店仓' }];
const colors: readonly Selection[] = [{ id: 'test-color-blue', label: '测试蓝' }, { id: 'test-color-gray', label: '测试灰' }];
const categories: readonly Candidate[] = [{ id: 'test-category-clothing', label: '测试服装', depth: 0 }, { id: 'test-category-top', label: '测试上衣', depth: 1, parentLabel: '测试服装' }];
const suppliers = [{ id: 'test-supplier-1', label: '测试供应商甲' }, { id: 'test-supplier-2', label: '测试供应商乙' }];
const seasons = [{ id: 'test-season-spring', label: '测试春季' }, { id: 'test-season-autumn', label: '测试秋季' }];
const productSelection = (index: number): Selection => ({ id: `test-product-${index}`, label: `TEST-${String(index).padStart(3, '0')} 测试上衣${index}` });
const selectionMatches = (selected: readonly Selection[], value: Selection): boolean => !selected.length || selected.some(item => item.id === value.id);
function sumTotals(values: readonly StockTotal[]): StockTotal {
  const unknownCells = values.reduce((sum, value) => sum + value.unknownCells, 0);
  return { knownQuantity: String(values.reduce((sum, value) => sum + BigInt(value.knownQuantity), 0n)), unknownCells, completeness: unknownCells ? 'incomplete' : 'complete' };
}
function makeProduct(index: number, filter: InventoryFilter): InventoryProduct {
  const product = productSelection(index);
  const groups: InventoryColorFit[] = [];
  const visibleWarehouses = warehouses.filter(value => selectionMatches(filter.warehouses, value));
  const visibleFits = fits.slice(0, index === 1 ? 2 : 1).filter(value => selectionMatches(filter.fits, value));
  for (const [colorIndex, color] of colors.slice(0, index === 1 ? 2 : 1).entries()) {
    for (const [fitIndex, fit] of visibleFits.entries()) {
      const rows: InventoryRow[] = visibleWarehouses.map((warehouse, warehouseIndex) => {
        const cells: Record<string, StockCell> = {};
        for (const [sizeIndex, size] of sizes.entries()) {
          // Only explicit legal fixture SKUs are generated; absent specs have no SKU identity.
          const skuId = `test-sku-${index}-${color.id}-${fit.id}-${size.id}`;
          cells[size.id] = sizeIndex >= 7 ? { state: 'not-applicable' }
            : index === 1 && colorIndex === 0 && fitIndex === 0 && warehouseIndex === 0 && sizeIndex === 3 ? { state: 'unknown', skuId, reason: 'TEST ONLY：模拟此合法 SKU 数量未返回，不能补零。' }
              : { state: 'known', skuId, quantity: String(index === 1 && colorIndex === 0 && fitIndex === 0 && warehouseIndex === 0 && sizeIndex === 1 ? -2 : (index + sizeIndex + colorIndex + fitIndex + warehouseIndex) % 7) };
        }
        return { warehouse, cells, total: totalOf(Object.values(cells)) };
      });
      const sizeTotals = Object.fromEntries(sizes.map(size => [size.id, totalOf(rows.map(row => row.cells[size.id]!))]));
      groups.push({ color, fit, rows, sizeTotals, total: sumTotals(rows.map(row => row.total)) });
    }
  }
  return { id: product.id, code: `TEST-${String(index).padStart(3, '0')}`, name: `测试上衣${index}`, categoryLabel: '测试服装 / 测试上衣', supplierLabel: suppliers[(index - 1) % 2]!.label, seasonLabel: seasons[(index - 1) % 2]!.label, sizeGroup: { id: 'test-size-group-top', label: '男装上衣（测试）' }, sizes, colorFits: groups, sizeTotals: Object.fromEntries(sizes.map(size => [size.id, sumTotals(groups.map(group => group.sizeTotals[size.id]!))])), total: sumTotals(groups.map(group => group.total)) };
}
function matches(index: number, filter: InventoryFilter): boolean {
  return selectionMatches(filter.products, productSelection(index))
    && (!filter.category || categories.some(value => value.id === filter.category?.id))
    && selectionMatches(filter.suppliers, suppliers[(index - 1) % 2]!)
    && selectionMatches(filter.seasons, seasons[(index - 1) % 2]!)
    && (!filter.fits.length || fits.slice(0, index === 1 ? 2 : 1).some(fit => selectionMatches(filter.fits, fit)))
    && (!filter.warehouses.length || warehouses.some(warehouse => selectionMatches(filter.warehouses, warehouse)));
}
function wait(signal: AbortSignal, milliseconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('测试读取已取消')); return; }
    const abort = () => { clearTimeout(timer); reject(new Error('测试读取已取消')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export interface SyntheticReadEvent { readonly kind: 'inventory' | CandidateKind; readonly page: number; readonly pageSize: number; readonly search?: string }
export function createSyntheticInventoryReader(options: { readonly productCount?: number; readonly delayMs?: number; readonly onRead?: (event: SyntheticReadEvent) => void } = {}): InventoryReader & { failNextInventory(): void; failNextCandidates(): void } {
  const count = options.productCount ?? 3;
  if (!Number.isSafeInteger(count) || count < 0 || count > 1000) throw new Error('TEST ONLY fixture count must be 0–1000.');
  let failInventory = false;
  let failCandidates = false;
  return {
    failNextInventory() { failInventory = true; },
    failNextCandidates() { failCandidates = true; },
    async readInventory(read: QueryRead<InventoryParameters>): Promise<InventoryPage> {
      options.onRead?.({ kind: 'inventory', page: read.parameters.page, pageSize: read.parameters.pageSize });
      const shouldFail = failInventory; failInventory = false;
      await wait(read.signal, options.delayMs ?? 240);
      if (shouldFail) throw new Error('TEST ONLY：模拟库存读取失败，未连接真实数据库。');
      const indexes = Array.from({ length: count }, (_, index) => index + 1).filter(index => matches(index, read.parameters.filter));
      const offset = (read.parameters.page - 1) * read.parameters.pageSize;
      const products = indexes.slice(offset, offset + read.parameters.pageSize).map(index => makeProduct(index, read.parameters.filter));
      // This fixture acts as a SERVER: only the bounded page is returned. Full-filter summary is separate.
      const allMatchesTotal = sumTotals(indexes.map(index => makeProduct(index, read.parameters.filter).total));
      return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotalProducts: indexes.length, products, warehouseLabels: warehouses.filter(value => selectionMatches(read.parameters.filter.warehouses, value)).map(value => value.label), allMatchesTotal, readReference: 'TEST-ONLY-SYNTHETIC-READ' };
    },
    async readCandidates(read: QueryRead<CandidateParameters>): Promise<CandidatePage> {
      options.onRead?.({ kind: read.parameters.kind, page: read.parameters.page, pageSize: 20, search: read.parameters.search });
      const shouldFail = failCandidates; failCandidates = false;
      await wait(read.signal, options.delayMs ?? 140);
      if (shouldFail) throw new Error('TEST ONLY candidate read failure');
      const source: readonly Candidate[] = read.parameters.kind === 'product' ? Array.from({ length: count }, (_, index) => productSelection(index + 1)) : ({ category: categories, warehouse: warehouses, supplier: suppliers, fit: fits, season: seasons } as const)[read.parameters.kind];
      const matching = source.filter(item => item.label.toLocaleLowerCase().includes(read.parameters.search.toLocaleLowerCase()));
      return { items: matching.slice((read.parameters.page - 1) * 20, read.parameters.page * 20), exactTotal: matching.length, page: read.parameters.page };
    },
  };
}
