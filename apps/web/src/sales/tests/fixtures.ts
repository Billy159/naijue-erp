import type { SalesDetailDto, SalesSummaryDto } from '../contracts.ts';
import { entityId, businessDate, version } from '../../../../../packages/domain/src/values.ts';
/** Only synthetic fixtures. Never exported by the production entry point. */
export const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const summary = (n = 1): SalesSummaryDto => ({ id: entityId('sales', uuid(n)), number: `TEST-SALES-${n}`, businessType: 'RETURN', businessDate: businessDate('2026-10-20'),
  hallId: entityId('hall', uuid(11)), salespersonId: null, customerId: entityId('customer', uuid(12)), warehouseId: entityId('warehouse', uuid(13)), status: 'DRAFT', version: version(2),
  grossAmount: '-900719925474099301', orderDiscount: '0', netDue: '-900719925474099301', hallName: 'TEST 厅', warehouseName: 'TEST 仓', customerName: 'TEST 客户', salespersonName: null });
export const detail = (n = 1): SalesDetailDto => {
  const { hallName: _h, warehouseName: _w, customerName: _c, salespersonName: _s, ...header } = summary(n);
  return { stockBasis: 'CUTOFF_HISTORY', referenceNames: { hallName: 'TEST 当前营业厅', salespersonName: null, customerName: 'TEST 当前客户', warehouseName: 'TEST 当前出库仓' }, settlementNames: [{ settlementId: entityId('settlement', uuid(23)), paymentAccountId: entityId('paymentAccount', uuid(24)), accountNameSnapshot: 'TEST 保存账户', methodNameSnapshot: 'TEST 保存方式', currentAccountName: 'TEST 现账户', currentMethodName: 'TEST 现方式' }], document: { header: { ...header, note: 'TEST 独立退货', createdByAccountId: entityId('account', uuid(14)), createdHallId: null,
    createdAt: '2026-10-20T00:00:00.000000Z', updatedAt: '2026-10-20T00:00:00.000000Z', approvedByAccountId: null, approvedAt: null },
    lines: [{ id: entityId('salesLine', uuid(21)), salesId: header.id, lineNo: 1, skuId: entityId('sku', uuid(22)), quantity: '-1', referencePrice: '900719925474099301', dealPrice: '900719925474099301', pricingRule: null,
      discountTenths: null, zeroConfirmed: null, lineAmount: '-900719925474099301', allocatedDiscount: '0', isGift: false, isCurrent: true,
      snapshot: { productCode: 'TEST-SNAPSHOT', productName: `TEST 保存商品 ${n}`, colorName: 'TEST 保存颜色', fitName: 'Y版（修身）', sizeName: '165/S', barcode: '001234567890123' } }],
    settlements: [{ id: entityId('settlement', uuid(23)), salesId: header.id, lineNo: 1, paymentAccountId: entityId('paymentAccount', uuid(24)), direction: 'REFUND', amount: '900719925474099301' }] } };
};
