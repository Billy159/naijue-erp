import { businessDate, entityId, version } from '../../../../../packages/domain/src/values.ts';
import type { EntityKind } from '../../../../../packages/domain/src/values.ts';
import type { TransferDetailDto, TransferSummaryDto, TransferWarehouse } from '../contracts.ts';

export const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const id = <K extends EntityKind>(kind: K, n: number) => entityId(kind, uuid(n));
export const warehouse = (n = 20): TransferWarehouse => ({ id: id('warehouse', n), name: `TEST 完整仓库 ${n}`, hallId: id('hall', 10), hallName: 'TEST 当前营业厅', enabled: false, hallEnabled: true });
export function detail(n = 1): TransferDetailDto {
  return { document: { header: { id: id('transfer', n), number: `TEST-TR-${n}`, businessDate: businessDate('2026-10-20'), fromWarehouseId: id('warehouse', 20), toWarehouseId: id('warehouse', 21), status: 'DRAFT', version: version(1),
    note: 'TEST 原生备注', createdByAccountId: id('account', 30), createdHallId: id('hall', 10), createdRole: 'ADMIN', createdAt: '2026-10-20T00:00:00.000000Z', updatedAt: '2026-10-20T20:34:00.000000Z', approvedByAccountId: null, approvedAt: null },
    lines: [{ id: id('transferLine', 100 + n * 2), transferId: id('transfer', n), lineNo: 1, skuId: id('sku', 70), quantity: '9007199254740993', isCurrent: true,
      snapshot: { productCode: 'TEST 保存款号', productName: `TEST 保存名称 ${n}`, colorName: 'TEST 原红色', fitName: 'TEST 原Y版（修身）', sizeName: '165/S 原保存全名', barcode: '001234567890123' } },
      { id: id('transferLine', 101 + n * 2), transferId: id('transfer', n), lineNo: 2, skuId: id('sku', 71), quantity: '2', isCurrent: true,
        snapshot: { productCode: 'TEST 保存款号', productName: `TEST 保存名称 ${n}`, colorName: 'TEST 原红色', fitName: 'TEST 原Y版（修身）', sizeName: '170/M 原保存全名', barcode: null } }] },
    stockBasis: 'RUNTIME_LEDGER', references: { fromWarehouseName: 'TEST 当前调出仓库完整名称', toWarehouseName: 'TEST 当前调入仓库完整名称', fromHallName: 'TEST 当前调出厅', toHallName: 'TEST 当前调入厅', createdByName: 'TEST 当前创建者', approvedByName: null },
    catalog: { skus: [60, 61, 62].map((size, index) => ({ skuId: id('sku', 70 + index), productId: id('product', 40), productCode: 'TEST 当前款号', productName: `TEST 当前商品 ${n}`, colorId: id('color', 41), colorName: 'TEST 当前红色', fitId: id('fit', 42), fitName: 'Y版（修身）完整名称', sizeId: id('size', size), sizeGroupId: id('sizeGroup', 50) })),
      sizeGroups: [{ sizeGroupId: id('sizeGroup', 50), code: 'TEST-SIZE-GROUP', name: 'TEST 完整规范尺码组', members: ['165/S', '170/M', '175/L', '180/XL'].map((name, index) => ({ sizeId: id('size', 60 + index), code: index === 0 ? null : `SIZE-${index}`, name, displayOrder: index - 2 })) }] } };
}
export function summary(n = 1): TransferSummaryDto {
  const d = detail(n); const h = d.document.header;
  return { id: h.id, number: h.number, businessDate: h.businessDate, fromWarehouseId: h.fromWarehouseId, toWarehouseId: h.toWarehouseId, status: h.status, version: h.version,
    createdByAccountId: h.createdByAccountId, createdAt: h.createdAt, updatedAt: h.updatedAt, totalQuantity: '9007199254740995', ...d.references };
}
