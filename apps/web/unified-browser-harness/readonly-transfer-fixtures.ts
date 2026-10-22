import { detail, uuid } from '../src/transfers/tests/fixtures.ts';
import { entityId } from '../../../packages/domain/src/values.ts';
import type { TransferDetailDto, TransferSummaryDto } from '../src/transfers/contracts.ts';
import type { ProductBasics, ProductSpecifications, ProductImages } from '../src/inventory/product-contracts.ts';

/** Explicit acceptance-only facts. Constructed only for transfer-readonly;
 * repeated SKUs never imply repeated actual line identities. No IO or writes. */
export function createReadonlyTransferFixtures() {
  const details: readonly TransferDetailDto[] = [40, 83, 2000].map(count => {
    const base = detail(600000 + count), header = { ...base.document.header, number: `SYN-RO-TR-${count}`, note: '合成只读宽明细；不是正式单据、库存或业务权限。' };
    const group = { ...base.catalog.sizeGroups[0]!, name: '合成完整规范尺码组（200项）', members: Array.from({ length: 200 }, (_, index) => ({ sizeId: entityId('size', uuid(60 + index)), code: index === 0 ? null : `SYN-SIZE-${index}`, name: `合成当前尺码 ${index + 1}`, displayOrder: index })) };
    const skus = base.catalog.skus.map(sku => ({ ...sku, productCode: 'SYN-RO-001', productName: '合成当前规范商品（非正式）', colorName: '合成当前红色', fitName: '合成当前标准版' }));
    return { ...base, stockBasis: 'CUTOFF_HISTORY', document: { header, lines: Array.from({ length: count }, (_, index) => ({ ...base.document.lines[0]!, id: entityId('transferLine', uuid(7000000 + count * 3000 + index)), transferId: header.id, lineNo: index + 1, quantity: index === 0 ? '9007199254740993' : '1', snapshot: { productCode: `SYN-SAVED-${index + 1}`, productName: `合成保存名称 ${index + 1}`, colorName: '合成原保存颜色', fitName: '合成原保存版型', sizeName: '合成原保存尺码', barcode: index % 3 === 0 ? null : index % 3 === 1 ? '' : '000001234567890123' } })) }, catalog: { skus, sizeGroups: [group] } };
  });
  const summaries: readonly TransferSummaryDto[] = details.map(data => {
    const h = data.document.header;
    return { id: h.id, number: h.number, businessDate: h.businessDate, fromWarehouseId: h.fromWarehouseId, toWarehouseId: h.toWarehouseId, status: h.status, version: h.version, createdByAccountId: h.createdByAccountId, createdAt: h.createdAt, updatedAt: h.updatedAt, ...data.references, totalQuantity: data.document.lines.reduce((sum, line) => sum + BigInt(line.quantity), 0n).toString() };
  });
  const catalog = details[0]!.catalog, sku = catalog.skus[0]!, group = catalog.sizeGroups[0]!;
  const basics: ProductBasics = { productId: sku.productId, code: sku.productCode, name: sku.productName, categoryLabel: null, yearLabel: null, seasonLabel: null, supplierLabel: null, systemCode: null, retailPrice: null };
  const specifications: ProductSpecifications = { productId: sku.productId, sizeGroup: { id: group.sizeGroupId, label: group.name }, colors: [{ id: sku.colorId, label: sku.colorName }], fits: [{ id: sku.fitId, label: sku.fitName }], sizes: group.members.map(size => ({ id: size.sizeId, label: size.name })), skus: catalog.skus.map(row => ({ id: row.skuId, colorId: row.colorId, fitId: row.fitId, sizeId: row.sizeId })) };
  const images: ProductImages = { productId: sku.productId, images: [] };
  return { details, summaries, basics, specifications, images };
}
