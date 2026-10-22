import { checkedProductStockOverviewResult } from '../../../../packages/application/src/product-details-query-validation.ts';
import { entityId, quantity } from '../../../../packages/domain/src/values.ts';
import { CATALOGUE_PRICE_KEYS } from '../../../../packages/application/src/catalogue-price-input.ts';
import type { ProductBarcodePage, ProductDetailsPageQuery, ProductPriceDetails, ProductWarehouseStockPage, ProductStockOverviewQuery, ProductStockOverviewResult } from '../../../../packages/application/src/product-details-query-ports.ts';
import type { ProductParameters } from '../inventory/product-contracts.ts';
import { HttpQueryError } from '../transport/http-query.ts';

const invalid = (): never => { throw new HttpQueryError('malformed-response', 'INVALID_PRODUCT_DETAILS_RESPONSE'); };
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalid();
  const row = value as Record<string, unknown>;
  if (Reflect.ownKeys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) return invalid();
  return row;
}
function id(value: unknown): string { try { if (typeof value !== 'string') return invalid(); return entityId('operation', value); } catch { return invalid(); } }
function text(value: unknown): void { if (typeof value !== 'string' || !value.length || value.length > 1000 || /[\u0000-\u001f\u007f]/.test(value)) invalid(); }
function target(row: Record<string, unknown>, parameters: ProductParameters, version: boolean): void {
  if (id(row.productId) !== parameters.productId) invalid();
  if (version && (typeof row.version !== 'number' || !Number.isSafeInteger(row.version) || row.version < 1 || row.version > 2147483647)) invalid();
}
function paged(row: Record<string, unknown>, parameters: ProductDetailsPageQuery): unknown[] {
  if (row.page !== parameters.page || row.pageSize !== parameters.pageSize || typeof row.total !== 'number' || !Number.isSafeInteger(row.total) || row.total < 0
    || !Array.isArray(row.items) || row.items.length !== Math.min(parameters.pageSize, Math.max(0, row.total - (parameters.page - 1) * parameters.pageSize))) invalid();
  return row.items as unknown[];
}
export function productPricesResponse(value: unknown, parameters: ProductParameters): ProductPriceDetails | null {
  if (value === null) return null;
  const row = object(value, ['productId', 'version', 'prices']); target(row, parameters, true);
  const prices = object(row.prices, CATALOGUE_PRICE_KEYS);
  for (const key of CATALOGUE_PRICE_KEYS) if (prices[key] !== null && (typeof prices[key] !== 'string' || !/^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(prices[key] as string))) invalid();
  return value as ProductPriceDetails;
}
export function productBarcodesResponse(value: unknown, parameters: ProductDetailsPageQuery): ProductBarcodePage | null {
  if (value === null) return null;
  const row = object(value, ['productId', 'version', 'page', 'pageSize', 'total', 'items', 'defaultScheme']); target(row, parameters, true);
  const scheme = object(row.defaultScheme, ['state', 'reason']);
  if (scheme.state !== 'UNAVAILABLE' || scheme.reason !== 'NO_PRODUCT_SCHEME_FIELD') invalid();
  const ids = new Set<string>(), barcodes = new Set<string>();
  for (const value of paged(row, parameters)) {
    const item = object(value, ['id', 'barcode', 'skuId', 'skuCode', 'colorId', 'fitId', 'sizeId', 'kind', 'schemeId', 'enabled']);
    const key = id(item.id); text(item.barcode); text(item.skuCode);
    for (const field of ['skuId', 'colorId', 'fitId', 'sizeId']) id(item[field]);
    if (item.schemeId !== null) id(item.schemeId);
    if (!['MAIN', 'CONFIRMED_OLD'].includes(item.kind as string) || typeof item.enabled !== 'boolean' || ids.has(key) || barcodes.has(item.barcode as string)) invalid();
    ids.add(key); barcodes.add(item.barcode as string);
  }
  return value as ProductBarcodePage;
}
export function productStockResponse(value: unknown, parameters: ProductDetailsPageQuery): ProductWarehouseStockPage | null {
  if (value === null) return null;
  const row = object(value, ['productId', 'page', 'pageSize', 'total', 'items']); target(row, parameters, false);
  const keys = new Set<string>();
  for (const value of paged(row, parameters)) {
    const item = object(value, ['warehouseId', 'warehouseName', 'skuId', 'quantity', 'state']);
    const key = JSON.stringify([id(item.warehouseId), id(item.skuId)]); text(item.warehouseName);
    if (keys.has(key)) invalid(); keys.add(key);
    if (item.state === 'KNOWN') { if (typeof item.quantity !== 'string') invalid(); try { quantity(item.quantity as string); } catch { invalid(); } }
    else if (!['UNKNOWN', 'MISSING', 'UNMAPPED', 'READ_FAILED'].includes(item.state as string) || item.quantity !== null) invalid();
  }
  return value as ProductWarehouseStockPage;
}

export function productStockOverviewResponse(value: unknown, parameters: ProductStockOverviewQuery): ProductStockOverviewResult | null {
  if(value===null)return null;
  try{return checkedProductStockOverviewResult(value,parameters);}catch{return invalid();}
}
