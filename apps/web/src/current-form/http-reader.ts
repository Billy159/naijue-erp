import type { CurrentFormBarcodeQuery, CurrentFormBarcodeResult, CurrentFormPage, CurrentFormProduct, CurrentFormProductQuery, CurrentFormProductSkuQuery, CurrentFormSku,
  CurrentFormSkuBatchQuery, CurrentSalesReferenceItem, CurrentSalesReferenceQuery, CurrentTransferWarehouse, CurrentTransferWarehouseQuery } from '../../../../packages/application/src/current-form-ports.ts';
import { parseCurrentSalesReferenceQuery, parseCurrentTransferWarehouseQuery, parseCurrentFormProductQuery,
  parseCurrentFormProductSkuQuery, parseCurrentFormSkuBatchQuery, parseCurrentFormBarcodeQuery } from '../../../../packages/application/src/current-form-validation.ts';
import { entityId } from '../../../../packages/domain/src/values.ts';
import type { EntityKind, EntityId } from '../../../../packages/domain/src/values.ts';
import { createHttpJsonQuery } from '../transport/http-query.ts';
import type { HttpQueryOptions } from '../transport/http-query.ts';

function invalid(): never { throw new TypeError('Invalid current form response.'); }
function object(value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const row = value as Record<string, unknown>;
  if (keys.some(key => !Object.hasOwn(row, key)) || Reflect.ownKeys(row).some(key => typeof key !== 'string' || !keys.includes(key) && !optional.includes(key))) invalid();
  return row;
}
function id<K extends EntityKind>(kind: K, value: unknown): EntityId<K> {
  if (typeof value !== 'string') invalid(); return entityId(kind, value);
}
function text(value: unknown): string { if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f\x7f]/.test(value)) invalid(); return value; }
function nullableText(value: unknown): string | null { return value === null ? null : text(value); }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') invalid(); return value; }
function array(value: unknown): readonly unknown[] { if (!Array.isArray(value)) invalid(); return value; }
function price(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(value)) invalid(); return value;
}
function page<T extends { readonly id: string }>(value: unknown, parameters: { readonly page: number; readonly pageSize: 20 },
  decode: (row: unknown) => T, account = false): CurrentFormPage<T> {
  const row = object(value, ['page', 'pageSize', 'exactTotal', 'items'], account ? ['recommendationAvailability'] : []);
  if (row.page !== parameters.page || row.pageSize !== 20 || typeof row.exactTotal !== 'string' || !/^(?:0|[1-9]\d{0,19})$/.test(row.exactTotal)) invalid();
  const total = BigInt(row.exactTotal); const remaining = total - BigInt((parameters.page - 1) * 20);
  const expected = remaining < 0n ? 0 : remaining > 20n ? 20 : Number(remaining);
  const input = array(row.items); if (input.length !== expected) invalid();
  const items = input.map(decode); if (new Set(items.map(item => item.id)).size !== items.length) invalid();
  if (account && row.recommendationAvailability !== 'AVAILABLE' && row.recommendationAvailability !== 'UNAVAILABLE') invalid();
  return Object.freeze({ page: parameters.page, pageSize: 20, exactTotal: total, items: Object.freeze(items),
    ...(account ? { recommendationAvailability: row.recommendationAvailability as 'AVAILABLE' | 'UNAVAILABLE' } : {}) });
}
function salesReference(value: unknown, parameters: CurrentSalesReferenceQuery): CurrentSalesReferenceItem {
  const row = object(value, ['id', 'name', 'code', 'hallId', 'hallName', 'paymentMethodId', 'paymentMethodName']);
  const kind = ({ hall: 'hall', customer: 'customer', salesperson: 'staff', warehouse: 'warehouse', paymentMethod: 'paymentMethod', paymentAccount: 'paymentAccount' } as const)[parameters.kind];
  const nativeId = id(kind, row.id), hallId = row.hallId === null ? null : id('hall', row.hallId), hallName = nullableText(row.hallName);
  const paymentMethodId = row.paymentMethodId === null ? null : id('paymentMethod', row.paymentMethodId), paymentMethodName = nullableText(row.paymentMethodName);
  if ((hallId === null) !== (hallName === null) || (paymentMethodId === null) !== (paymentMethodName === null)) invalid();
  if (parameters.kind === 'hall' ? hallId !== nativeId : parameters.kind === 'warehouse' ? hallId !== parameters.hallId : parameters.kind === 'salesperson' ? false : hallId !== null) invalid();
  if (parameters.kind === 'paymentAccount' ? paymentMethodId !== parameters.paymentMethodId : paymentMethodId !== null) invalid();
  if (parameters.kind === 'customer' ? row.code === null : row.code !== null) invalid();
  return Object.freeze({ id: nativeId, name: text(row.name), code: nullableText(row.code), hallId, hallName, paymentMethodId, paymentMethodName });
}
function warehouse(value: unknown, parameters: CurrentTransferWarehouseQuery): CurrentTransferWarehouse {
  const row = object(value, ['id', 'name', 'hallId', 'hallName', 'enabled', 'hallEnabled', 'hasNonzeroInventory']);
  const enabled = boolean(row.enabled), hasNonzeroInventory = boolean(row.hasNonzeroInventory);
  if (parameters.direction === 'TO' ? !enabled : !enabled && !hasNonzeroInventory) invalid();
  return Object.freeze({ id: id('warehouse', row.id), name: text(row.name), hallId: id('hall', row.hallId), hallName: text(row.hallName),
    enabled, hallEnabled: boolean(row.hallEnabled), hasNonzeroInventory });
}
function product(value: unknown): CurrentFormProduct {
  const row = object(value, ['id', 'code', 'name', 'retailPrice', 'minimumPriceAvailability'], ['category']);
  if (row.minimumPriceAvailability !== 'UNAVAILABLE') invalid();
  const category = Object.hasOwn(row, 'category') ? object(row.category, ['id', 'label']) : null;
  return Object.freeze({ id: id('product', row.id), code: text(row.code), name: text(row.name), retailPrice: price(row.retailPrice), minimumPriceAvailability: 'UNAVAILABLE', ...(category ? { category: Object.freeze({ id: id('category', category.id), label: nullableText(category.label) }) } : {}) });
}
function sku(value: unknown): CurrentFormSku {
  const row = object(value, ['id', 'skuCode', 'productId', 'productCode', 'productName', 'colorId', 'colorName', 'fitId', 'fitName', 'sizeId', 'sizeName', 'sizeGroupId', 'barcodeAvailability']);
  if (row.barcodeAvailability !== 'UNAVAILABLE') invalid();
  return Object.freeze({ id: id('sku', row.id), skuCode: text(row.skuCode), productId: id('product', row.productId), productCode: text(row.productCode), productName: text(row.productName),
    colorId: id('color', row.colorId), colorName: text(row.colorName), fitId: id('fit', row.fitId), fitName: text(row.fitName), sizeId: id('size', row.sizeId), sizeName: text(row.sizeName),
    sizeGroupId: id('sizeGroup', row.sizeGroupId), barcodeAvailability: 'UNAVAILABLE' });
}
/** Browser proposal client, never an actor/grant/command source. Uses bounded same-origin
 * session transport, no retries/cache/mock fallback and no network until a read. */
export function createCurrentFormHttpReader(options: HttpQueryOptions) {
  const http = createHttpJsonQuery(options);
  return Object.freeze({
    readBarcode(parameters: CurrentFormBarcodeQuery, signal: AbortSignal): Promise<CurrentFormBarcodeResult> {
      const parsed = parseCurrentFormBarcodeQuery(parameters);
      return http.post('/current-form/barcode/query', parsed, signal, value => {
        const row = object(value, ['state', 'barcode', 'binding', 'sku']);
        if (row.barcode !== parsed.barcode) invalid();
        if (row.state === 'FOUND') {
          const binding = object(row.binding, ['id', 'kind']);
          if (binding.kind !== 'MAIN' && binding.kind !== 'CONFIRMED_OLD') invalid();
          return Object.freeze({ state: 'FOUND', barcode: parsed.barcode,
            binding: Object.freeze({ id: id('barcode', binding.id), kind: binding.kind }), sku: sku(row.sku) });
        }
        if ((row.state !== 'NOT_FOUND' && row.state !== 'UNAVAILABLE') || row.binding !== null || row.sku !== null) invalid();
        return Object.freeze({ state: row.state, barcode: parsed.barcode, binding: null, sku: null });
      });
    },
    readSalesReferences(parameters: CurrentSalesReferenceQuery, signal: AbortSignal) {
      const parsed = parseCurrentSalesReferenceQuery(parameters);
      return http.post('/current-form/sales-references/query', parsed, signal, value => page(value, parsed, row => salesReference(row, parsed), parsed.kind === 'paymentAccount'));
    },
    readTransferWarehouses(parameters: CurrentTransferWarehouseQuery, signal: AbortSignal) {
      const parsed = parseCurrentTransferWarehouseQuery(parameters);
      return http.post('/current-form/transfer-warehouses/query', parsed, signal, value => page(value, parsed, row => warehouse(row, parsed)));
    },
    readProducts(parameters: CurrentFormProductQuery, signal: AbortSignal) {
      const parsed = parseCurrentFormProductQuery(parameters);
      return http.post('/current-form/products/query', parsed, signal, value => page(value, parsed, product));
    },
    readProductSkus(parameters: CurrentFormProductSkuQuery, signal: AbortSignal) {
      const parsed = parseCurrentFormProductSkuQuery(parameters);
      return http.post('/current-form/product-skus/query', parsed, signal, value => page(value, parsed, row => {
        const result = sku(row); if (result.productId !== parsed.productId) invalid(); return result;
      }));
    },
    readSkuBatch(parameters: CurrentFormSkuBatchQuery, signal: AbortSignal) {
      const parsed = parseCurrentFormSkuBatchQuery(parameters);
      return http.post('/current-form/sku-batch/query', parsed, signal, value => {
        const rows = array(value); if (rows.length !== parsed.skuIds.length) invalid();
        const items = rows.map(sku); if (items.some((item, index) => item.id !== parsed.skuIds[index])) invalid();
        return Object.freeze(items);
      });
    }
  });
}
