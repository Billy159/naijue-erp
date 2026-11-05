import type { InventoryColorFit, InventoryPage, InventoryParameters, InventoryProduct, StockCell, StockTotal } from './contracts.ts';
import { decodeCompactInventoryPage } from './compact-page.ts';
import { HttpQueryError } from '../transport/http-query.ts';

const key = (...ids: string[]) => JSON.stringify(ids);
const outside = (): never => { throw new HttpQueryError('invalid-request', 'COMPACT_CELL_OUTSIDE_LOADED_PAGE'); };
function record<T>(ids: readonly string[], resolve: (id: string) => T): Readonly<Record<string, T>> {
  const members = new Set(ids);
  return new Proxy({} as Record<string, T>, {
    get: (_target, id) => typeof id === 'string' && members.has(id) ? resolve(id) : undefined,
    ownKeys: () => [...ids],
    getOwnPropertyDescriptor: (_target, id) => typeof id === 'string' && members.has(id) ? { configurable: true, enumerable: true, get: () => resolve(id) } : undefined,
  });
}
/** Operation-local adapter for an entirely decoded page. No networking or cache.
 * Lazy records preserve the existing window/matrix shape without a dense cell copy.
 * Do not route this into production until the real same-RR version provider exists. */
export function createCompactInventoryModel(value: unknown, parameters: InventoryParameters) {
  const wire = decodeCompactInventoryPage(value, parameters);
  const groups = new Map(wire.dictionary.sizeGroups.map(g => [g.id, g])), colors = new Map(wire.dictionary.colors.map(c => [c.id, c])), fits = new Map(wire.dictionary.fits.map(f => [f.id, f]));
  const warehouses = new Set(wire.dictionary.warehouses.map(w => w.id)), products = new Map(wire.products.map(p => [p.id, p]));
  const coordinates = new Map(wire.skuCoordinates.map(s => [key(s.productId, s.colorId, s.fitId, s.sizeId), s.skuId])), skuById = new Map(wire.skuCoordinates.map(s => [s.skuId, s]));
  const balances = new Map(wire.balances.map(b => [key(b.warehouseId, b.skuId), b.quantity]));
  const variants = new Map<string, Map<string, { colorId: string; fitId: string }>>();
  for (const s of wire.skuCoordinates) { const map = variants.get(s.productId) ?? new Map(); map.set(key(s.colorId, s.fitId), { colorId: s.colorId, fitId: s.fitId }); variants.set(s.productId, map); }
  const rowSums = new Map<string, bigint>(), variantSums = new Map<string, bigint>(), variantSizeSums = new Map<string, bigint>(), productSizeSums = new Map<string, bigint>();
  const add = (map: Map<string, bigint>, id: string, value: bigint) => map.set(id, (map.get(id) ?? 0n) + value);
  for (const b of wire.balances) {
    const s = skuById.get(b.skuId)!, q = BigInt(b.quantity);
    add(rowSums, key(s.productId, s.colorId, s.fitId, b.warehouseId), q);
    add(variantSums, key(s.productId, s.colorId, s.fitId), q);
    add(variantSizeSums, key(s.productId, s.colorId, s.fitId, s.sizeId), q);
    add(productSizeSums, key(s.productId, s.sizeId), q);
  }
  const total = (value: bigint | undefined): StockTotal => ({ knownQuantity: (value ?? 0n).toString(), completeness: 'complete', unknownCells: 0 });
  const sizeMembers = new Map(wire.dictionary.sizeGroups.map(g => [g.id, new Set(g.sizes.map(s => s.id))]));
  const resolveCell = (address: { productId: string; colorId: string; fitId: string; warehouseId: string; sizeId: string }): StockCell => {
    const { productId, colorId, fitId, warehouseId, sizeId } = address, product = products.get(productId);
    if (!product || !warehouses.has(warehouseId) || !variants.get(productId)?.has(key(colorId, fitId)) || !sizeMembers.get(product.sizeGroupId)!.has(sizeId)) return outside();
    const skuId = coordinates.get(key(productId, colorId, fitId, sizeId));
    if (!skuId) return { state: 'not-applicable' };
    // Decoder required all five coverage discriminators before this model exists.
    return { state: 'known', skuId, quantity: balances.get(key(warehouseId, skuId)) ?? '0' };
  };
  const pageProducts: InventoryProduct[] = wire.products.map(p => {
    const sizeGroup = groups.get(p.sizeGroupId)!, sizes = sizeGroup.sizes, sizeIds = sizes.map(s => s.id);
    const colorFits: InventoryColorFit[] = [...(variants.get(p.id)?.values() ?? [])].map(v => ({
      color: colors.get(v.colorId)!, fit: fits.get(v.fitId)!,
      rows: wire.dictionary.warehouses.map(warehouse => ({
        warehouse, cells: record(sizeIds, sizeId => resolveCell({ productId: p.id, colorId: v.colorId, fitId: v.fitId, warehouseId: warehouse.id, sizeId })),
        total: total(rowSums.get(key(p.id, v.colorId, v.fitId, warehouse.id))),
      })),
      sizeTotals: record(sizeIds, sizeId => total(variantSizeSums.get(key(p.id, v.colorId, v.fitId, sizeId)))),
      total: total(variantSums.get(key(p.id, v.colorId, v.fitId))),
    }));
    return { id: p.id, code: p.code, name: p.name, categoryLabel: p.categoryLabel, supplierLabel: p.supplierLabel, seasonLabel: p.seasonLabel, sizeGroup: { id: sizeGroup.id, label: sizeGroup.label }, sizes, colorFits,
      sizeTotals: record(sizeIds, sizeId => total(productSizeSums.get(key(p.id, sizeId)))), total: p.total };
  });
  const page: InventoryPage = { page: wire.page, pageSize: wire.pageSize, exactTotalProducts: wire.exactTotalProducts, allMatchesTotal: wire.allMatchesTotal, products: pageProducts, warehouseLabels: wire.dictionary.warehouses.map(w => w.label), readReference: wire.readReference };
  return { page, readVersion: wire.readVersion, resolveCell };
}
