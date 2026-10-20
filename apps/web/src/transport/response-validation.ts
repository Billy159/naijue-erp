import { quantity } from '../../../../packages/domain/src/values.ts';
import type { CandidatePage, CandidateParameters, InventoryPage, InventoryParameters } from '../inventory/contracts.ts';
import { assertInventoryPage } from '../inventory/model.ts';
import type { ProductBasics, ProductImage, ProductImageParameters, ProductImages, ProductParameters, ProductSpecifications } from '../inventory/product-contracts.ts';
import { assertProductBasics, assertProductImage, assertProductImages, assertProductSpecifications } from '../inventory/product-model.ts';

// JSON is untrusted even when the response is HTTP 200. Check the complete DTO before
// using the existing semantic validators. No coercion, default quantities, label rewriting,
// media URL construction, or unrecognized response fields survive this boundary.
function reject(): never { throw new TypeError('Invalid query response.'); }
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) reject();
  const row = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  if (required.some(key => !Object.hasOwn(row, key)) || Object.keys(row).some(key => !allowed.has(key))) reject();
  return row;
}
function string(value: unknown): asserts value is string { if (typeof value !== 'string') reject(); }
function text(value: unknown): asserts value is string { string(value); if (!value.trim()) reject(); }
function integerText(value: unknown): asserts value is string { text(value); if (value.length > 100) reject(); }
function number(value: unknown, minimum: number): asserts value is number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) reject(); }
function array(value: unknown): readonly unknown[] { if (!Array.isArray(value)) reject(); return value; }
function selection(value: unknown): void { const row = record(value, ['id', 'label']); text(row.id); text(row.label); }
function total(value: unknown): void {
  const row = record(value, ['knownQuantity', 'completeness', 'unknownCells']);
  integerText(row.knownQuantity); number(row.unknownCells, 0);
  if (row.completeness !== 'complete' && row.completeness !== 'incomplete') reject();
}
function sizeTotals(value: unknown, sizeIds: readonly string[]): void {
  const row = record(value, sizeIds);
  for (const item of Object.values(row)) total(item);
}
function cell(value: unknown): void {
  const row = record(value, ['state'], ['skuId', 'quantity', 'reason']);
  if (row.state === 'known') { record(value, ['state', 'skuId', 'quantity']); text(row.skuId); integerText(row.quantity); quantity(row.quantity); }
  else if (row.state === 'unknown') { record(value, ['state', 'skuId', 'reason']); text(row.skuId); text(row.reason); }
  else if (row.state === 'not-applicable') record(value, ['state']);
  else reject();
}
export function inventoryResponse(value: unknown, parameters: Readonly<InventoryParameters>): InventoryPage {
  const page = record(value, ['page', 'pageSize', 'exactTotalProducts', 'products', 'warehouseLabels', 'allMatchesTotal', 'readReference']);
  number(page.page, 1); number(page.exactTotalProducts, 0);
  if (![100, 200, 500].includes(page.pageSize as number)) reject();
  text(page.readReference);
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(page.readReference)) reject();
  array(page.warehouseLabels).forEach(text); total(page.allMatchesTotal);
  for (const item of array(page.products)) {
    const product = record(item, ['id', 'code', 'name', 'categoryLabel', 'supplierLabel', 'seasonLabel', 'sizeGroup', 'sizes', 'colorFits', 'sizeTotals', 'total']);
    [product.id, product.code, product.name].forEach(text);
    [product.categoryLabel, product.supplierLabel, product.seasonLabel].forEach(string);
    selection(product.sizeGroup); total(product.total);
    const sizes = array(product.sizes);
    sizes.forEach(selection);
    const ids = sizes.map(item => (item as { id: string }).id);
    sizeTotals(product.sizeTotals, ids);
    for (const item of array(product.colorFits)) {
      const group = record(item, ['color', 'fit', 'rows', 'sizeTotals', 'total']);
      selection(group.color); selection(group.fit); sizeTotals(group.sizeTotals, ids); total(group.total);
      for (const item of array(group.rows)) {
        const row = record(item, ['warehouse', 'cells', 'total']);
        selection(row.warehouse); total(row.total);
        Object.values(record(row.cells, ids)).forEach(cell);
      }
    }
  }
  const data = value as InventoryPage;
  assertInventoryPage(data, parameters);
  inventoryCoordinates(data, parameters);
  return data;
}
/** These cross-row/page facts are checked server-side too, but a malformed HTTP 200
 * must not bypass them merely because row totals happen to add up. This verifies
 * internal consistency, not authorization: only the server owns the trusted scope. */
function inventoryCoordinates(data: InventoryPage, parameters: Readonly<InventoryParameters>): void {
  const productIds = new Set(parameters.filter.products.map(value => value.id));
  const fitIds = new Set(parameters.filter.fits.map(value => value.id));
  const selectedWarehouses = new Set(parameters.filter.warehouses.map(value => value.id));
  if (productIds.size && data.exactTotalProducts > productIds.size) reject();
  const skuCoordinates = new Map<string, string>();
  let warehouseIds: readonly string[] | null = null;
  for (const product of data.products) {
    if (productIds.size && !productIds.has(product.id)) reject();
    for (const group of product.colorFits) {
      if (fitIds.size && !fitIds.has(group.fit.id)) reject();
      if (group.rows.length !== data.warehouseLabels.length || (selectedWarehouses.size && group.rows.length !== selectedWarehouses.size)) reject();
      const ids = group.rows.map(row => row.warehouse.id);
      if (warehouseIds === null) warehouseIds = ids;
      const coordinateSkus = new Map<string, string | null>();
      for (const [index, row] of group.rows.entries()) {
        if (row.warehouse.id !== warehouseIds[index] || row.warehouse.label !== data.warehouseLabels[index]
          || (selectedWarehouses.size && !selectedWarehouses.has(row.warehouse.id))) reject();
        for (const size of product.sizes) {
          const cell = row.cells[size.id]!;
          const sku = cell.state === 'not-applicable' ? null : cell.skuId;
          if (coordinateSkus.has(size.id) && coordinateSkus.get(size.id) !== sku) reject();
          coordinateSkus.set(size.id, sku);
          if (sku !== null) {
            const coordinate = JSON.stringify([product.id, group.color.id, group.fit.id, size.id]);
            if (skuCoordinates.has(sku) && skuCoordinates.get(sku) !== coordinate) reject();
            skuCoordinates.set(sku, coordinate);
          }
        }
      }
    }
  }
}
export function candidatesResponse(value: unknown, parameters: Readonly<CandidateParameters>): CandidatePage {
  const page = record(value, ['items', 'exactTotal', 'page']);
  number(page.exactTotal, 0); number(page.page, 1);
  const items = array(page.items);
  if (page.page !== parameters.page || items.length > parameters.pageSize) reject();
  const expected = Math.min(parameters.pageSize, Math.max(0, page.exactTotal - (parameters.page - 1) * parameters.pageSize));
  if (items.length !== expected) reject();
  const ids = new Set<string>();
  for (const item of items) {
    const row = record(item, ['id', 'label'], ['disabled', 'parentLabel', 'depth']);
    text(row.id); text(row.label);
    if (ids.has(row.id)) reject(); ids.add(row.id);
    if (Object.hasOwn(row, 'disabled') && typeof row.disabled !== 'boolean') reject();
    if (Object.hasOwn(row, 'parentLabel')) text(row.parentLabel);
    if (Object.hasOwn(row, 'depth') && row.depth !== 0 && row.depth !== 1) reject();
  }
  return value as CandidatePage;
}
export function productBasicsResponse(value: unknown, parameters: Readonly<ProductParameters>): ProductBasics | null {
  if (value === null) return null;
  const row = record(value, ['productId', 'code', 'name', 'categoryLabel', 'yearLabel', 'seasonLabel', 'supplierLabel', 'systemCode']);
  [row.productId, row.code, row.name].forEach(text);
  for (const label of [row.categoryLabel, row.yearLabel, row.seasonLabel, row.supplierLabel, row.systemCode]) if (label !== null) text(label);
  const data = value as ProductBasics; assertProductBasics(data, parameters); return data;
}
export function productSpecificationsResponse(value: unknown, parameters: Readonly<ProductParameters>): ProductSpecifications | null {
  if (value === null) return null;
  const row = record(value, ['productId', 'sizeGroup', 'colors', 'fits', 'sizes', 'skus']);
  text(row.productId); if (row.sizeGroup !== null) selection(row.sizeGroup);
  for (const values of [row.colors, row.fits, row.sizes]) array(values).forEach(selection);
  for (const item of array(row.skus)) {
    const sku = record(item, ['id', 'colorId', 'fitId', 'sizeId']);
    [sku.id, sku.colorId, sku.fitId, sku.sizeId].forEach(text);
  }
  const data = value as ProductSpecifications; assertProductSpecifications(data, parameters); return data;
}
export function productImagesResponse(value: unknown, parameters: Readonly<ProductParameters>): ProductImages | null {
  if (value === null) return null;
  const row = record(value, ['productId', 'images']); text(row.productId);
  for (const item of array(row.images)) {
    const image = record(item, ['id', 'label', 'thumbnailUrl']);
    [image.id, image.label, image.thumbnailUrl].forEach(text);
  }
  const data = value as ProductImages; assertProductImages(data, parameters); return data;
}
export function productImageResponse(value: unknown, parameters: Readonly<ProductImageParameters>): ProductImage {
  const row = record(value, ['productId', 'imageId', 'url']);
  [row.productId, row.imageId, row.url].forEach(text);
  const data = value as ProductImage; assertProductImage(data, parameters); return data;
}
