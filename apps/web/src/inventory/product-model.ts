import { LatestQuery } from '../loading/latest-query.ts';
import type { QueryRead } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { Selection } from './contracts.ts';
import type { ProductBasics, ProductImage, ProductImageParameters, ProductImages, ProductParameters, ProductSpecifications } from './product-contracts.ts';

function text(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('商品身份或显示标签缺失。');
}
function target(productId: string, parameters: Readonly<ProductParameters>): void {
  text(productId); text(parameters.productId);
  if (productId !== parameters.productId) throw new TypeError('商品响应与当前查看目标不一致。');
}
function selections(values: readonly Selection[]): Set<string> {
  if (!Array.isArray(values)) throw new TypeError('商品规格资料无效。');
  for (const value of values) { text(value.id); text(value.label); }
  const ids = new Set(values.map(value => value.id));
  if (ids.size !== values.length) throw new TypeError('商品规格身份重复。');
  return ids;
}
export function assertProductBasics(value: ProductBasics | null, parameters: Readonly<ProductParameters>): void {
  if (value === null) return;
  target(value.productId, parameters); text(value.code); text(value.name);
  for (const label of [value.categoryLabel, value.yearLabel, value.seasonLabel, value.supplierLabel, value.systemCode]) if (label !== null) text(label);
}
export function assertProductSpecifications(value: ProductSpecifications | null, parameters: Readonly<ProductParameters>): void {
  if (value === null) return;
  target(value.productId, parameters);
  if (value.sizeGroup !== null) selections([value.sizeGroup]);
  const colors = selections(value.colors), fits = selections(value.fits), sizes = selections(value.sizes);
  if (!Array.isArray(value.skus)) throw new TypeError('商品 SKU 资料无效。');
  const ids = new Set<string>(), coordinates = new Set<string>();
  for (const sku of value.skus) {
    text(sku.id);
    if (!colors.has(sku.colorId) || !fits.has(sku.fitId) || !sizes.has(sku.sizeId)) throw new TypeError('商品 SKU 缺少明确颜色、版型或尺码。');
    const coordinate = JSON.stringify([sku.colorId, sku.fitId, sku.sizeId]);
    if (ids.has(sku.id) || coordinates.has(coordinate)) throw new TypeError('商品 SKU 身份或四维坐标重复。');
    ids.add(sku.id); coordinates.add(coordinate);
  }
}
export function assertProductImageUrl(url: string): void {
  text(url);
  // Never render executable SVG/HTML or arbitrary URL schemes from a read response.
  if (!/^https:\/\/[^\s]+$/i.test(url) && !/^blob:https?:\/\/[^\s]+$/i.test(url) && !/^data:image\/(?:png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(url)) throw new TypeError('商品图片地址无效。');
}
export function assertProductImages(value: ProductImages | null, parameters: Readonly<ProductParameters>): void {
  if (value === null) return;
  target(value.productId, parameters);
  if (!Array.isArray(value.images)) throw new TypeError('商品图片清单无效。');
  const ids = new Set<string>();
  for (const image of value.images) {
    text(image.id); text(image.label); assertProductImageUrl(image.thumbnailUrl);
    if (ids.has(image.id)) throw new TypeError('商品图片身份重复。');
    ids.add(image.id);
  }
}
export function assertProductImage(value: ProductImage, parameters: Readonly<ProductImageParameters>): void {
  target(value.productId, parameters); text(value.imageId);
  if (value.imageId !== parameters.imageId) throw new TypeError('商品图片响应与当前预览目标不一致。');
  assertProductImageUrl(value.url);
}
export function createProductQuery<T>(scope: ReadScope, execute: (read: QueryRead<ProductParameters>) => Promise<T>, validate: (data: T, parameters: Readonly<ProductParameters>) => void): LatestQuery<ProductParameters, T> {
  return new LatestQuery({ scope, execute: async read => {
    const data = await execute(read);
    validate(data, read.parameters);
    return data;
  } });
}
