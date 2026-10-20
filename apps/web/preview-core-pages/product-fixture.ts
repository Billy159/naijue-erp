import type { ProductReadOnlyReader } from '../src/inventory/product-contracts.ts';
import { color, fits, product, season, sizes, sizeGroup, sku, supplier, syntheticRead, type ReportRead } from './catalog.ts';

/** Target-only read port. No originals, remote media or credentials exist. */
export function createProductFixture(report: ReportRead): ProductReadOnlyReader {
  const check = (id: string) => { if (id !== product.id) throw new Error('SYNTHETIC ONLY：商品不在合成夹具范围。'); };
  return {
    async readProductBasics(read) { check(read.parameters.productId); await syntheticRead(read.signal, report, 'productBasics'); return { productId: product.id, code: product.code, name: product.name, categoryLabel: '合成测试服装', yearLabel: '2026（合成测试）', seasonLabel: season.label, supplierLabel: supplier.label, systemCode: 'SYNTHETIC-ONLY-SYSTEM-001' }; },
    async readProductSpecifications(read) { check(read.parameters.productId); await syntheticRead(read.signal, report, 'productSpecifications'); return { productId: product.id, sizeGroup, colors: [color], fits, sizes, skus: fits.flatMap((fit, fitIndex) => sizes.slice(0, 3).map((size, sizeIndex) => ({ id: sku(fitIndex, sizeIndex), colorId: color.id, fitId: fit.id, sizeId: size.id }))) }; },
    async readProductImages(read) { check(read.parameters.productId); await syntheticRead(read.signal, report, 'productImages'); return { productId: product.id, images: [] }; },
    async readProductImage(read) { check(read.parameters.productId); await syntheticRead(read.signal, report, 'productOriginal'); throw new Error('SYNTHETIC ONLY：本预览没有商品图片或原图。'); },
  };
}
