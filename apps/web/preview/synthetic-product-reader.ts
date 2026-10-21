import { makeSyntheticInventoryProduct } from './synthetic-reader.ts';
import { emptyInventoryFilter } from '../src/inventory/contracts.ts';
import type { QueryRead } from '../src/loading/latest-query.ts';
import type { ProductBasics, ProductImage, ProductImageParameters, ProductImages, ProductParameters, ProductReadOnlyReader, ProductSpecifications } from '../src/inventory/product-contracts.ts';

/** TEST ONLY. Generated target-only facts, not real catalog/media/API responses. */
export interface SyntheticProductReadEvent { readonly kind: 'base' | 'specs' | 'images' | 'original'; readonly productId: string; readonly imageId?: string }
// Deliberately tiny PNG thumbnail/original fixtures, not photographs or private records.
const thumbnail = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOwq/78HwAFUwKs5SlCvgAAAABJRU5ErkJggg==';
const original = thumbnail;
function indexOf(productId: string): number {
  const match = /^test-product-([1-9]\d*)$/.exec(productId);
  if (!match) throw new Error('TEST ONLY：不是本隔离夹具的商品身份。');
  const index = Number(match[1]);
  if (!Number.isSafeInteger(index) || index > 1000) throw new Error('TEST ONLY：测试商品身份超出夹具范围。');
  return index;
}
function wait(signal: AbortSignal, delay: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('TEST ONLY：读取已取消。')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, delay);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); }
  });
}
export function createSyntheticProductReader(options: { readonly delayMs?: number; readonly onRead?: (event: SyntheticProductReadEvent) => void } = {}): ProductReadOnlyReader & { failNext(kind: SyntheticProductReadEvent['kind']): void } {
  let failure: SyntheticProductReadEvent['kind'] | null = null;
  async function prepare(kind: SyntheticProductReadEvent['kind'], read: QueryRead<ProductParameters>, imageId?: string): Promise<number> {
    options.onRead?.(imageId === undefined ? { kind, productId: read.parameters.productId } : { kind, productId: read.parameters.productId, imageId });
    const shouldFail = failure === kind; if (shouldFail) failure = null;
    await wait(read.signal, options.delayMs ?? 180);
    if (shouldFail) throw new Error('TEST ONLY：模拟商品页签读取失败。');
    return indexOf(read.parameters.productId);
  }
  return {
    failNext(kind) { failure = kind; },
    async readProductBasics(read): Promise<ProductBasics> {
      const index = await prepare('base', read);
      return { productId: read.parameters.productId, code: `TEST-${String(index).padStart(3, '0')}`, name: `测试上衣${index}`, categoryLabel: '测试服装 / 测试上衣', yearLabel: '2026（测试）', seasonLabel: index % 2 ? '测试春季' : '测试秋季', supplierLabel: index % 2 ? '测试供应商甲' : '测试供应商乙', systemCode: `TEST-SYSTEM-${index}`, retailPrice: null };
    },
    async readProductSpecifications(read): Promise<ProductSpecifications> {
      const index = await prepare('specs', read);
      const product = makeSyntheticInventoryProduct(index, emptyInventoryFilter());
      const colors = [...new Map(product.colorFits.map(group => [group.color.id, group.color])).values()];
      const fits = [...new Map(product.colorFits.map(group => [group.fit.id, group.fit])).values()];
      const skus = product.colorFits.flatMap(group => Object.entries(group.rows[0]!.cells).flatMap(([sizeId, cell]) => cell.state === 'not-applicable' ? [] : [{ id: cell.skuId, colorId: group.color.id, fitId: group.fit.id, sizeId }]));
      return { productId: product.id, sizeGroup: product.sizeGroup, colors, fits, sizes: product.sizes, skus };
    },
    async readProductImages(read): Promise<ProductImages> {
      const index = await prepare('images', read);
      return { productId: read.parameters.productId, images: index === 1 ? [{ id: 'test-image-1', label: 'TEST ONLY 像素图（非商品照片）', thumbnailUrl: thumbnail }] : [] };
    },
    async readProductImage(read: QueryRead<ProductImageParameters>): Promise<ProductImage> {
      const index = await prepare('original', read, read.parameters.imageId);
      if (index !== 1 || read.parameters.imageId !== 'test-image-1') throw new Error('TEST ONLY：该测试商品没有此图片。');
      return { productId: read.parameters.productId, imageId: read.parameters.imageId, url: original };
    },
  };
}
