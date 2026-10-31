import type { TransferDetailDto } from '../../transfers/contracts.ts';
import { detail, uuid } from '../../transfers/tests/fixtures.ts';
import { entityId } from '../../../../../packages/domain/src/values.ts';
import { transferDetailResponse } from '../../transfers/response-validation.ts';
/** Explicit test graph, not a production read or a current-category inference. */
export function classifiedTransfer(multipleGroups = true): TransferDetailDto {
  const source = detail(), line = source.document.lines[0]!, sku = source.catalog.skus[0]!, group = source.catalog.sizeGroups[0]!;
  const secondGroup = { ...group, sizeGroupId: entityId('sizeGroup', uuid(51)), code: 'TEST-SECOND', name: 'TEST 第二真实尺码组', members: group.members.slice(0, 2) };
  const extraSkus = [0, 1, 2].map(index => ({ ...sku, skuId: entityId('sku', uuid(80 + index)), productId: entityId('product', uuid(140 + index)),
    // Equal labels deliberately test that native IDs, not names, define styles.
    sizeGroupId: multipleGroups && index > 0 ? secondGroup.sizeGroupId : group.sizeGroupId }));
  const repeatedColorSku = { ...sku, skuId: entityId('sku', uuid(83)), colorId: entityId('color', uuid(999)), colorName: 'TEST 第二真实颜色' };
  const input: TransferDetailDto = { ...source, document: { header: { ...source.document.header, status: 'VOID' }, lines: [...source.document.lines,
    ...extraSkus.map((item, index) => ({ ...line, id: entityId('transferLine', uuid(200 + index)), lineNo: 3 + index, skuId: item.skuId, quantity: ['5', '7', '11'][index]! })),
    { ...line, id: entityId('transferLine', uuid(203)), lineNo: 6, skuId: repeatedColorSku.skuId, quantity: '13' }] },
    catalog: { skus: [...source.catalog.skus, ...extraSkus, repeatedColorSku], sizeGroups: multipleGroups ? [group, secondGroup] : [group] },
    categorySummary: { basis: 'CURRENT', metric: 'PRODUCT_COUNT', categoryCount: '4', hasMore: false, items: [
      { categoryId: uuid(1000), categoryName: 'TEST 衬衫', value: '1' },
      { categoryId: uuid(1001), categoryName: 'TEST 同名分类', value: '1' },
      { categoryId: uuid(1002), categoryName: 'TEST 同名分类', value: '1' },
      { categoryId: null, categoryName: null, value: '1' },
    ] } };
  return transferDetailResponse(input, { transferId: input.document.header.id });
}
