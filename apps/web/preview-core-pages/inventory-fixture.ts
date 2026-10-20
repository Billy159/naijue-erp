import type { Candidate, CandidateKind, InventoryFilter, InventoryProduct, InventoryReader, Selection, StockCell, StockTotal } from '../src/inventory/contracts.ts';
import { account, category, color, fits, product, season, sizes, sizeGroup, sku, supplier, syntheticRead, warehouses, type ReportRead } from './catalog.ts';

const total = (values: readonly string[]): StockTotal => ({ completeness: 'complete', unknownCells: 0, knownQuantity: values.reduce((sum, value) => sum + BigInt(value), 0n).toString() });
const matches = (selected: readonly Selection[], value: Selection) => selected.length === 0 || selected.some(item => item.id === value.id);
function syntheticProduct(filter: InventoryFilter): InventoryProduct {
  const colorFits = fits.flatMap((fit, fitIndex) => !matches(filter.fits, fit) ? [] : [{ color, fit, ...(() => {
    const rows = warehouses.filter(warehouse => matches(filter.warehouses, warehouse)).map(warehouse => {
      // Complete finite fixture source: exactly 3 legal sizes per FIT. Explicit
      // zero is a known cell; unsupported sizes remain not-applicable, not zero.
      const cells: Record<string, StockCell> = Object.fromEntries(sizes.map((size, sizeIndex) => [size.id, sizeIndex > 2 ? { state: 'not-applicable' } : { state: 'known', skuId: sku(fitIndex, sizeIndex), quantity: ['-2', '0', '7'][sizeIndex] === '-2' && (fitIndex !== 0 || warehouse.id !== warehouses[0].id) ? '3' : ['-2', '0', '7'][sizeIndex]! }]));
      return { warehouse, cells, total: total(Object.values(cells).flatMap(cell => cell.state === 'known' ? [cell.quantity] : [])) };
    });
    const sizeTotals = Object.fromEntries(sizes.map(size => [size.id, total(rows.flatMap(row => { const cell = row.cells[size.id]!; return cell.state === 'known' ? [cell.quantity] : []; }))]));
    return { rows, sizeTotals, total: total(rows.map(row => row.total.knownQuantity)) };
  })() }]);
  return { ...product, categoryLabel: category.label, supplierLabel: supplier.label, seasonLabel: season.label, sizeGroup, sizes, colorFits, sizeTotals: Object.fromEntries(sizes.map(size => [size.id, total(colorFits.map(group => group.sizeTotals[size.id]!.knownQuantity))])), total: total(colorFits.map(group => group.total.knownQuantity)) };
}
/** No I/O at construction. Every returned DTO is explicit generated test data. */
export function createInventoryFixture(report: ReportRead): InventoryReader {
  return {
    async readInventory(read) {
      await syntheticRead(read.signal, report, 'inventory');
      const { filter, page, pageSize } = read.parameters;
      const visible = matches(filter.products, { id: product.id, label: `${product.code} ${product.name}` }) && (!filter.category || filter.category.id === category.id) && matches(filter.suppliers, supplier) && matches(filter.seasons, season) && (filter.fits.length === 0 || fits.some(fit => matches(filter.fits, fit))) && (filter.warehouses.length === 0 || warehouses.some(warehouse => matches(filter.warehouses, warehouse)));
      const item = syntheticProduct(filter);
      return { page, pageSize, exactTotalProducts: visible ? 1 : 0, products: visible && page === 1 ? [item] : [], warehouseLabels: warehouses.filter(warehouse => matches(filter.warehouses, warehouse)).map(warehouse => warehouse.label), allMatchesTotal: visible ? item.total : total([]), readReference: `SYNTHETIC-ONLY-COMPLETE-${account}` };
    },
    async readCandidates(read) {
      await syntheticRead(read.signal, report, 'inventoryCandidates');
      const options: Record<CandidateKind, readonly Candidate[]> = { product: [{ id: product.id, label: `${product.code} ${product.name}` }], category: [{ ...category, depth: 0 }], warehouse: warehouses, supplier: [supplier], fit: fits, season: [season] };
      const matching = options[read.parameters.kind].filter(item => item.label.toLowerCase().includes(read.parameters.search.toLowerCase()));
      return { page: read.parameters.page, exactTotal: matching.length, items: matching.slice((read.parameters.page - 1) * 20, read.parameters.page * 20) };
    },
  };
}
