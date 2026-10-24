import type { SalesDetailDto, SalesReader, SalesReferenceReader, SalesSummaryDto } from '../src/sales/contracts.ts';
import { account, customer, date, fixtureVersion, hall, product, salesperson, sid, sku, skuSnapshot, stamp, syntheticRead, warehouses, type ReportRead } from './catalog.ts';

function document(index: number): SalesDetailDto {
  const returned = index === 1; const id = sid('sales', 200 + index); const settlementId = sid('settlement', 220 + index); const paymentAccountId = sid('paymentAccount', 230);
  return { responsibleStaffId: null, responsibleName: null, stockBasis: 'RUNTIME_LEDGER', referenceNames: { hallName: hall.label, warehouseName: warehouses[0].label, customerName: customer.label, salespersonName: salesperson.label }, settlementNames: [{ settlementId, paymentAccountId, accountNameSnapshot: '合成收退账户（非真实账户）', methodNameSnapshot: '合成测试方式', currentAccountName: '合成收退账户（非真实账户）', currentMethodName: '合成测试方式' }], document: {
    header: { responsibleStaffId: null, id, number: returned ? 'SYNTH-RETURN-001' : 'SYNTH-SALE-001', businessType: returned ? 'RETURN' : 'SALE', businessDate: date, hallId: hall.id, salespersonId: salesperson.id, customerId: customer.id, warehouseId: warehouses[0].id, status: 'APPROVED', version: fixtureVersion, grossAmount: returned ? '-12345' : '24690', orderDiscount: '0', netDue: returned ? '-12345' : '24690', note: 'SYNTHETIC ONLY：合成数量和金额，不是业务记录。', createdByAccountId: account, createdHallId: hall.id, createdAt: stamp, updatedAt: stamp, approvedByAccountId: account, approvedAt: stamp },
    lines: [{ id: sid('salesLine', 210 + index), salesId: id, lineNo: 1, skuId: sku(0, 1), quantity: returned ? '-1' : '2', referencePrice: '15000', dealPrice: '12345', pricingRule: 'UNIT_PRICE', discountTenths: null, zeroConfirmed: false, lineAmount: returned ? '-12345' : '24690', allocatedDiscount: '0', isGift: false, snapshot: skuSnapshot(0, 1), isCurrent: true }],
    settlements: [{ id: settlementId, salesId: id, lineNo: 1, paymentAccountId, paymentMethodId: sid('paymentMethod', 231), direction: returned ? 'REFUND' : 'RECEIVE', amount: returned ? '12345' : '24690' }],
  } };
}
function summary(index: number): SalesSummaryDto {
  const data = document(index); const h = data.document.header;
  return { responsibleStaffId: null, responsibleName: null, id: h.id, number: h.number, businessType: h.businessType, businessDate: h.businessDate, hallId: h.hallId, salespersonId: h.salespersonId, customerId: h.customerId, warehouseId: h.warehouseId, status: h.status, version: h.version, grossAmount: h.grossAmount, orderDiscount: h.orderDiscount, netDue: h.netDue, updatedAt: h.updatedAt, ...data.referenceNames, quantity: index === 1 ? '-1' : '2', incomingQuantity: index === 1 ? '1' : '0', outgoingQuantity: index === 1 ? '0' : '2' };
}
/** Bounded generated documents only. No writes/history/catalog enumeration. */
export function createSalesFixture(report: ReportRead): { reader: SalesReader; references: SalesReferenceReader } {
  return { reader: {
    async readList(read) {
      await syntheticRead(read.signal, report, 'salesList'); const f = read.parameters.filter;
      const items = [summary(0), summary(1)].filter(row => (!f.startDate || row.businessDate >= f.startDate) && (!f.endDate || row.businessDate <= f.endDate)
        && (f.statuses.length === 0 || f.statuses.includes(row.status)) && (f.businessTypes.length === 0 || f.businessTypes.includes(row.businessType))
        && (f.hallIds.length === 0 || f.hallIds.includes(row.hallId))
        && (f.salespersonIds.length === 0 || (row.salespersonId !== null && f.salespersonIds.includes(row.salespersonId)))
        && (f.customerIds.length === 0 || f.customerIds.includes(row.customerId)) && (f.warehouseIds.length === 0 || f.warehouseIds.includes(row.warehouseId))
        && (!f.number || row.number.toLowerCase().includes(f.number.toLowerCase())));
      const offset = (read.parameters.page - 1) * read.parameters.pageSize;
      return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: String(items.length), items: items.slice(offset, offset + read.parameters.pageSize) };
    },
    async readDetail(read) { const index = [0, 1].find(index => sid('sales', 200 + index) === read.parameters.salesId); if (index === undefined) throw new Error('SYNTHETIC ONLY：单据不在夹具范围。'); await syntheticRead(read.signal, report, 'salesDetail'); return document(index); },
  }, references: { async readReferences(read) {
    await syntheticRead(read.signal, report, 'salesReferences');
    const item = ({ hall, salesperson, customer, warehouse: warehouses[0] } as const)[read.parameters.kind];
    const items = item.label.toLowerCase().includes(read.parameters.search.toLowerCase()) ? [item] : [];
    return { page: read.parameters.page, exactTotal: String(items.length), items: items.slice((read.parameters.page - 1) * 20, read.parameters.page * 20) };
  } } };
}
