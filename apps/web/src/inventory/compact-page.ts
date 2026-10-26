import type { InventoryParameters, Selection, StockTotal } from './contracts.ts';
import { entityId } from '../../../../packages/domain/src/values.ts';
import { INVENTORY_SCOPE_MAX_ITEMS } from '../../../../packages/application/src/inventory-query-contracts.ts';
import { parseInventoryQuery } from '../../../../packages/application/src/inventory-query-validation.ts';
import { HttpQueryError } from '../transport/http-query.ts';

/** Candidate D3 profile only. No transport, version issuer or cross-request cache.
 * A decoded version string does not establish the server's durable version proof. */
export interface CompactSizeGroup extends Selection { readonly sizes: readonly Selection[] }
export interface CompactProduct {
  readonly id: string; readonly code: string; readonly name: string;
  readonly categoryLabel: string; readonly supplierLabel: string; readonly seasonLabel: string;
  readonly sizeGroupId: string; readonly total: StockTotal;
}
export interface CompactSku { readonly skuId: string; readonly productId: string; readonly colorId: string; readonly fitId: string; readonly sizeId: string }
export interface CompactBalance { readonly warehouseId: string; readonly skuId: string; readonly quantity: string }
export interface CompactInventoryPage {
  readonly version: 'INVENTORY_COMPACT_PAGE_V1'; readonly readReference: string; readonly readVersion: string;
  readonly page: number; readonly pageSize: 100 | 200 | 500; readonly exactTotalProducts: number; readonly allMatchesTotal: StockTotal;
  readonly dictionary: { readonly warehouses: readonly Selection[]; readonly sizeGroups: readonly CompactSizeGroup[]; readonly colors: readonly Selection[]; readonly fits: readonly Selection[] };
  readonly products: readonly CompactProduct[]; readonly skuCoordinates: readonly CompactSku[]; readonly balances: readonly CompactBalance[];
  readonly coverage: { readonly state: 'complete'; readonly pageSkuCoordinates: 'complete'; readonly authorizedWarehouses: 'complete'; readonly balanceKeys: 'complete'; readonly absentBalance: 'KNOWN_ZERO_FOR_EXISTING_PAGE_SKU_ONLY' };
}
const invalid = (): never => { throw new HttpQueryError('malformed-response', 'INVALID_INVENTORY_COMPACT_PAGE'); };
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) return invalid();
  return row;
}
function text(value: unknown, blank = false): string {
  if (typeof value !== 'string' || value.length > 1000 || (!blank && !value.trim()) || /[\u0000-\u001f\u007f]/.test(value)) return invalid();
  return value;
}
function id(value: unknown): string { try { return entityId('product', text(value)); } catch { return invalid(); } }
function count(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid(); return value; }
function quantity(value: unknown): string { if (typeof value !== 'string' || value.length > 100 || !/^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(value)) return invalid(); return value; }
function array(value: unknown, limit: number): readonly unknown[] { if (!Array.isArray(value) || value.length > limit || Object.keys(value).length !== value.length) return invalid(); return value; }
function unique<T>(rows: readonly T[], key: (row: T) => string): void { if (new Set(rows.map(key)).size !== rows.length) invalid(); }
function total(value: unknown): StockTotal { const row = object(value, ['knownQuantity', 'completeness', 'unknownCells']); if (row.completeness !== 'complete' || row.unknownCells !== 0) return invalid(); return Object.freeze({ knownQuantity: quantity(row.knownQuantity), completeness: 'complete', unknownCells: 0 }); }
function selection(value: unknown): Selection { const row = object(value, ['id', 'label']); return Object.freeze({ id: id(row.id), label: text(row.label) }); }
const frozen = <T>(rows: T[]): readonly T[] => Object.freeze(rows);

/** Whole-response validation; no partial cells or fallback zero can escape failure. */
export function decodeCompactInventoryPage(value: unknown, parameters: InventoryParameters): CompactInventoryPage {
  try {
    const query = parseInventoryQuery(parameters);
    const row = object(value, ['version', 'readReference', 'readVersion', 'page', 'pageSize', 'exactTotalProducts', 'allMatchesTotal', 'dictionary', 'products', 'skuCoordinates', 'balances', 'coverage']);
    if (row.version !== 'INVENTORY_COMPACT_PAGE_V1' || row.page !== query.page || row.pageSize !== query.pageSize) return invalid();
    const readReference = text(row.readReference), readVersion = text(row.readVersion), exactTotalProducts = count(row.exactTotalProducts), allMatchesTotal = total(row.allMatchesTotal);
    const coverage = object(row.coverage, ['state', 'pageSkuCoordinates', 'authorizedWarehouses', 'balanceKeys', 'absentBalance']);
    if (coverage.state !== 'complete' || coverage.pageSkuCoordinates !== 'complete' || coverage.authorizedWarehouses !== 'complete' || coverage.balanceKeys !== 'complete' || coverage.absentBalance !== 'KNOWN_ZERO_FOR_EXISTING_PAGE_SKU_ONLY') return invalid();
    const dict = object(row.dictionary, ['warehouses', 'sizeGroups', 'colors', 'fits']);
    const warehouses = frozen(array(dict.warehouses, INVENTORY_SCOPE_MAX_ITEMS).map(selection)), colors = frozen(array(dict.colors, 50000).map(selection)), fits = frozen(array(dict.fits, 50000).map(selection));
    let membershipRows = 0;
    const sizeGroups = frozen(array(dict.sizeGroups, query.pageSize).map(value => {
      const group = object(value, ['id', 'label', 'sizes']), sizes = frozen(array(group.sizes, 1000).map(selection));
      if (!sizes.length || (membershipRows += sizes.length) > 50000) return invalid();
      unique(sizes, size => size.id); return Object.freeze({ id: id(group.id), label: text(group.label), sizes });
    }));
    for (const selections of [warehouses, colors, fits, sizeGroups]) unique(selections, item => item.id);
    const warehouseIds = new Set(warehouses.map(w => w.id)), colorIds = new Set(colors.map(c => c.id)), fitIds = new Set(fits.map(f => f.id)), groups = new Map(sizeGroups.map(g => [g.id, g]));
    if (query.filter.warehouseIds.length && (query.filter.warehouseIds.length !== warehouses.length || query.filter.warehouseIds.some(id => !warehouseIds.has(id)))) return invalid();
    const products = frozen(array(row.products, query.pageSize).map(value => {
      const p = object(value, ['id', 'code', 'name', 'categoryLabel', 'supplierLabel', 'seasonLabel', 'sizeGroupId', 'total']);
      return Object.freeze({ id: id(p.id), code: text(p.code), name: text(p.name), categoryLabel: text(p.categoryLabel, true), supplierLabel: text(p.supplierLabel, true), seasonLabel: text(p.seasonLabel, true), sizeGroupId: id(p.sizeGroupId), total: total(p.total) });
    }));
    unique(products, p => p.id);
    if (products.length !== Math.min(query.pageSize, Math.max(0, exactTotalProducts - (query.page - 1) * query.pageSize))) return invalid();
    const productById = new Map(products.map(p => [p.id, p])), usedGroups = new Set(products.map(p => p.sizeGroupId));
    if (usedGroups.size !== groups.size || products.some(p => !groups.has(p.sizeGroupId)) || query.filter.productIds.length && (exactTotalProducts > query.filter.productIds.length || products.some(p => !query.filter.productIds.some(id => id === p.id)))) return invalid();
    const groupSizes = new Map(sizeGroups.map(g => [g.id, new Set(g.sizes.map(s => s.id))]));
    const skuCoordinates = frozen(array(row.skuCoordinates, 50000).map(value => {
      const s = object(value, ['skuId', 'productId', 'colorId', 'fitId', 'sizeId']);
      return Object.freeze({ skuId: id(s.skuId), productId: id(s.productId), colorId: id(s.colorId), fitId: id(s.fitId), sizeId: id(s.sizeId) });
    }));
    unique(skuCoordinates, s => s.skuId); unique(skuCoordinates, s => JSON.stringify([s.productId, s.colorId, s.fitId, s.sizeId]));
    const usedColors = new Set<string>(), usedFits = new Set<string>(), variants = new Map<string, Set<string>>();
    for (const sku of skuCoordinates) {
      const p = productById.get(sku.productId);
      if (!p || !colorIds.has(sku.colorId) || !fitIds.has(sku.fitId) || !groupSizes.get(p.sizeGroupId)!.has(sku.sizeId) || query.filter.fitIds.length && !query.filter.fitIds.some(id => id === sku.fitId)) return invalid();
      usedColors.add(sku.colorId); usedFits.add(sku.fitId);
      const key = JSON.stringify([sku.colorId, sku.fitId]), set = variants.get(p.id) ?? new Set<string>(); set.add(key); variants.set(p.id, set);
    }
    if (usedColors.size !== colors.length || usedFits.size !== fits.length || [...usedColors].some((id, index) => colors[index]!.id !== id) || [...usedFits].some((id, index) => fits[index]!.id !== id)) return invalid();
    let work = 0;
    for (const p of products) { const variantCount = variants.get(p.id)?.size ?? 0; if (variantCount > 10000) return invalid(); work += variantCount * groups.get(p.sizeGroupId)!.sizes.length * warehouses.length; if (work > 1000000) return invalid(); }
    const skuById = new Map(skuCoordinates.map(s => [s.skuId, s])), sums = new Map<string, bigint>();
    const balances = frozen(array(row.balances, 250000).map(value => {
      const b = object(value, ['warehouseId', 'skuId', 'quantity']), warehouseId = id(b.warehouseId), skuId = id(b.skuId), q = quantity(b.quantity), sku = skuById.get(skuId);
      if (!warehouseIds.has(warehouseId) || !sku) return invalid();
      sums.set(sku.productId, (sums.get(sku.productId) ?? 0n) + BigInt(q));
      return Object.freeze({ warehouseId, skuId, quantity: q });
    }));
    unique(balances, b => JSON.stringify([b.warehouseId, b.skuId]));
    let pageSum = 0n;
    for (const p of products) { const sum = sums.get(p.id) ?? 0n; if (sum.toString() !== p.total.knownQuantity) return invalid(); pageSum += sum; }
    if (exactTotalProducts === products.length && pageSum.toString() !== allMatchesTotal.knownQuantity) return invalid();
    return Object.freeze({ version: 'INVENTORY_COMPACT_PAGE_V1', readReference, readVersion, page: query.page, pageSize: query.pageSize, exactTotalProducts, allMatchesTotal, dictionary: Object.freeze({ warehouses, sizeGroups, colors, fits }), products, skuCoordinates, balances, coverage: Object.freeze({ state: 'complete', pageSkuCoordinates: 'complete', authorizedWarehouses: 'complete', balanceKeys: 'complete', absentBalance: 'KNOWN_ZERO_FOR_EXISTING_PAGE_SKU_ONLY' }) });
  } catch { return invalid(); }
}
