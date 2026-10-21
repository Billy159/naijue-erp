/** SYNTHETIC ONLY: finite visual scenarios, no I/O, persistence, credentials or writes. */
import type { Candidate, CandidateKind, InventoryFilter, InventoryProduct, InventoryReader, Selection, StockCell, StockTotal } from '../src/inventory/contracts.ts';
import type { ProductReadOnlyReader } from '../src/inventory/product-contracts.ts';
import { category, color, fits, hall, product, season, sid, sizes, sizeGroup, sku, supplier, syntheticRead, warehouses, type ReportRead } from '../preview-core-pages/catalog.ts';
import { createSalesFixture } from '../preview-core-pages/sales-fixture.ts';
import { createTransferFixture } from '../preview-core-pages/transfer-fixture.ts';
export const acceptanceWarehouses = [...warehouses, ...Array.from({ length: 4 }, (_, index) => ({ id: sid('warehouse', 500 + index), label: `合成测试分仓 ${index + 3}` }))];
export const acceptanceCategories: readonly Candidate[] = [
  { ...category, parentId: null, depth: 0 },
  { id: sid('category', 400), label: '合成测试上衣', parentId: category.id, parentLabel: category.label, depth: 1 },
  { id: sid('category', 401), label: '合成测试裤装', parentId: category.id, parentLabel: category.label, depth: 1 },
];
export const acceptanceProducts = [
  { ...product, categoryId: acceptanceCategories[1]!.id, categoryLabel: acceptanceCategories[1]!.label, retailPrice: null },
  { id: sid('product', 2), code: 'SYNTH-002', name: '合成测试零价上衣（非业务商品）', categoryId: acceptanceCategories[1]!.id, categoryLabel: acceptanceCategories[1]!.label, retailPrice: '0.00' },
  { id: sid('product', 3), code: 'SYNTH-003', name: '合成测试长裤（非业务商品）', categoryId: acceptanceCategories[2]!.id, categoryLabel: acceptanceCategories[2]!.label, retailPrice: '128.50' },
] as const;
const skuId = (productIndex: number, fit: number, size: number) => productIndex === 0 ? sku(fit, size) : sid('sku', 1000 + productIndex * 100 + fit * 10 + size);
const matches = (selected: readonly Selection[], value: Selection) => !selected.length || selected.some(item => item.id === value.id);
const categoryMatches = (ids: readonly string[], product: typeof acceptanceProducts[number]) => !ids.length || ids.includes(category.id) || ids.includes(product.categoryId);
const total = (values: readonly string[]): StockTotal => ({ knownQuantity: values.reduce((sum, value) => sum + BigInt(value), 0n).toString(), completeness: 'complete', unknownCells: 0 });
function inventoryProduct(item: typeof acceptanceProducts[number], productIndex: number, filter: InventoryFilter): InventoryProduct {
  const colorFits = fits.flatMap((fit, fitIndex) => !matches(filter.fits, fit) ? [] : [{ color, fit, ...(() => {
    const rows = acceptanceWarehouses.filter(warehouse => matches(filter.warehouses, warehouse)).map(warehouse => {
      const warehouseIndex = acceptanceWarehouses.findIndex(item => item.id === warehouse.id);
      const cells: Record<string, StockCell> = Object.fromEntries(sizes.map((size, sizeIndex) => [size.id, sizeIndex >= 3 ? { state: 'not-applicable' } : {
        state: 'known', skuId: skuId(productIndex, fitIndex, sizeIndex), quantity: sizeIndex === 1 ? '0' : productIndex === 0 && fitIndex === 0 && warehouseIndex === 0 && sizeIndex === 0 ? '-2' : String(productIndex + sizeIndex + warehouseIndex + 1),
      }]));
      return { warehouse, cells, total: total(Object.values(cells).flatMap(cell => cell.state === 'known' ? [cell.quantity] : [])) };
    });
    return { rows, sizeTotals: Object.fromEntries(sizes.map(size => [size.id, total(rows.flatMap(row => { const cell = row.cells[size.id]!; return cell.state === 'known' ? [cell.quantity] : []; }))])), total: total(rows.map(row => row.total.knownQuantity)) };
  })() }]);
  return { id: item.id, code: item.code, name: item.name, categoryLabel: item.categoryLabel, supplierLabel: supplier.label, seasonLabel: season.label,
    sizeGroup, sizes, colorFits, sizeTotals: Object.fromEntries(sizes.map(size => [size.id, total(colorFits.map(group => group.sizeTotals[size.id]!.knownQuantity))])), total: total(colorFits.map(group => group.total.knownQuantity)) };
}
export function createAcceptanceInventory(report: ReportRead): InventoryReader {
  return {
    async readInventory(read) {
      await syntheticRead(read.signal, report, 'inventory');
      const { filter, page, pageSize } = read.parameters;
      const items = acceptanceProducts.flatMap((item, index) => matches(filter.products, { id: item.id, label: item.name }) && categoryMatches(filter.categories.map(value => value.id), item)
        && matches(filter.suppliers, supplier) && matches(filter.seasons, season) && (!filter.fits.length || fits.some(fit => matches(filter.fits, fit)))
        && (!filter.warehouses.length || acceptanceWarehouses.some(warehouse => matches(filter.warehouses, warehouse))) ? [inventoryProduct(item, index, filter)] : []);
      return { page, pageSize, exactTotalProducts: items.length, products: items.slice((page - 1) * pageSize, page * pageSize),
        warehouseLabels: acceptanceWarehouses.filter(warehouse => matches(filter.warehouses, warehouse)).map(warehouse => warehouse.label), allMatchesTotal: total(items.map(item => item.total.knownQuantity)), readReference: 'SYNTHETIC-ONLY-FINITE-3-PRODUCTS-6-WAREHOUSES' };
    },
    async readCandidates(read) {
      await syntheticRead(read.signal, report, 'inventoryCandidates');
      const options: Record<CandidateKind, readonly Candidate[]> = { product: acceptanceProducts.filter(item => categoryMatches(read.parameters.categoryIds, item)).map(item => ({ id: item.id, code: item.code, name: item.name, label: `${item.code} ${item.name}` })),
        category: acceptanceCategories, warehouse: acceptanceWarehouses, supplier: [supplier], fit: fits, season: [season] };
      const items = options[read.parameters.kind].filter(item => item.label.toLowerCase().includes(read.parameters.search.toLowerCase()));
      return { page: read.parameters.page, exactTotal: items.length, items: items.slice((read.parameters.page - 1) * read.parameters.pageSize, read.parameters.page * read.parameters.pageSize) };
    },
  };
}
export function createAcceptanceProducts(report: ReportRead): ProductReadOnlyReader {
  const target = (id: string) => { const index = acceptanceProducts.findIndex(item => item.id === id); if (index < 0) throw new Error('SYNTHETIC ONLY：商品超出有限夹具。'); return { item: acceptanceProducts[index]!, index }; };
  return {
    async readProductBasics(read) { const { item } = target(read.parameters.productId); await syntheticRead(read.signal, report, 'productBasics'); return { productId: item.id, code: item.code, name: item.name, categoryLabel: item.categoryLabel, yearLabel: '2026（合成测试）', seasonLabel: season.label, supplierLabel: supplier.label, systemCode: `SYNTHETIC-ONLY-${item.code}`, retailPrice: item.retailPrice }; },
    async readProductSpecifications(read) { const { item, index } = target(read.parameters.productId); await syntheticRead(read.signal, report, 'productSpecifications'); return { productId: item.id, sizeGroup, colors: [color], fits, sizes, skus: fits.flatMap((fit, fitIndex) => sizes.slice(0, 3).map((size, sizeIndex) => ({ id: skuId(index, fitIndex, sizeIndex), colorId: color.id, fitId: fit.id, sizeId: size.id }))) }; },
    async readProductImages(read) { const { item } = target(read.parameters.productId); await syntheticRead(read.signal, report, 'productImages'); return { productId: item.id, images: [] }; },
    async readProductImage(read) { target(read.parameters.productId); await syntheticRead(read.signal, report, 'productOriginal'); throw new Error('SYNTHETIC ONLY：无图片或原图。'); },
  };
}
export function createAcceptanceSales(report: ReportRead) {
  const fixture = createSalesFixture(report);
  return { ...fixture, references: { async readReferences(read: Parameters<typeof fixture.references.readReferences>[0]) {
    if (read.parameters.kind !== 'warehouse') return fixture.references.readReferences(read);
    await syntheticRead(read.signal, report, 'salesReferences');
    const items = acceptanceWarehouses.filter(item => item.label.includes(read.parameters.search));
    return { page: read.parameters.page, exactTotal: String(items.length), items: items.slice((read.parameters.page - 1) * 20, read.parameters.page * 20) };
  } } };
}
export function createAcceptanceTransfers(report: ReportRead) {
  const fixture = createTransferFixture(report);
  return { ...fixture, references: { async readWarehouses(read: Parameters<typeof fixture.references.readWarehouses>[0]) {
    await syntheticRead(read.signal, report, 'transferWarehouses');
    const items = acceptanceWarehouses.filter(item => (!read.parameters.selectedIds.length || read.parameters.selectedIds.includes(item.id)) && (item.label.includes(read.parameters.search) || hall.label.includes(read.parameters.search)))
      .map(item => ({ id: item.id, name: item.label, hallId: hall.id, hallName: hall.label, enabled: true, hallEnabled: true }));
    return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: String(items.length), items: items.slice((read.parameters.page - 1) * read.parameters.pageSize, read.parameters.page * read.parameters.pageSize) };
  } } };
}
