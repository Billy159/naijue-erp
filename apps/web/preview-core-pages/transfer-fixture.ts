import type { TransferDetailDto, TransferReader, TransferSummaryDto, TransferWarehouseReader } from '../src/transfers/contracts.ts';
import { account, color, date, fits, fixtureVersion, hall, product, sid, sizes, sizeGroup, sku, skuSnapshot, stamp, syntheticRead, warehouses, type ReportRead } from './catalog.ts';

const transferId = sid('transfer', 300);
function detail(): TransferDetailDto {
  return { stockBasis: 'RUNTIME_LEDGER', references: { fromWarehouseName: warehouses[0].label, toWarehouseName: warehouses[1].label, fromHallName: hall.label, toHallName: hall.label, createdByName: '合成测试创建者（非真人）', approvedByName: '合成测试审核者（非真人）' }, document: {
    header: { id: transferId, number: 'SYNTH-TRANSFER-001', businessDate: date, fromWarehouseId: warehouses[0].id, toWarehouseId: warehouses[1].id, status: 'APPROVED', version: fixtureVersion, note: 'SYNTHETIC ONLY：本单数量不代表实时库存，不含任何真实单据。', createdByAccountId: account, createdHallId: hall.id, createdRole: 'WAREHOUSE', createdAt: stamp, updatedAt: stamp, approvedByAccountId: account, approvedAt: stamp },
    lines: [{ id: sid('transferLine', 310), transferId, lineNo: 1, skuId: sku(0, 0), quantity: '3', snapshot: skuSnapshot(0, 0), isCurrent: true }, { id: sid('transferLine', 311), transferId, lineNo: 2, skuId: sku(1, 1), quantity: '2', snapshot: skuSnapshot(1, 1), isCurrent: true }],
  }, catalog: { skus: fits.flatMap((fit, fitIndex) => sizes.slice(0, 3).map((size, sizeIndex) => ({ skuId: sku(fitIndex, sizeIndex), productId: product.id, productCode: product.code, productName: product.name, colorId: color.id, colorName: color.label, fitId: fit.id, fitName: fit.label, sizeId: size.id, sizeGroupId: sizeGroup.id }))), sizeGroups: [{ sizeGroupId: sizeGroup.id, code: 'SYNTH-SIZES', name: sizeGroup.label, members: sizes.map((size, displayOrder) => ({ sizeId: size.id, code: null, name: size.label, displayOrder })) }] } };
}
function summary(): TransferSummaryDto {
  const data = detail(); const h = data.document.header;
  return { id: h.id, number: h.number, businessDate: h.businessDate, fromWarehouseId: h.fromWarehouseId, toWarehouseId: h.toWarehouseId, status: h.status, version: h.version, createdByAccountId: h.createdByAccountId, createdAt: h.createdAt, updatedAt: h.updatedAt, ...data.references, totalQuantity: '5' };
}
/** Native transfer DTO only, bounded to one generated document per page. */
export function createTransferFixture(report: ReportRead): { reader: TransferReader; references: TransferWarehouseReader } {
  return { reader: {
    async readList(read) {
      await syntheticRead(read.signal, report, 'transferList'); const row = summary(); const f = read.parameters.filter;
      const visible = (!f.startDate || row.businessDate >= f.startDate) && (!f.endDate || row.businessDate <= f.endDate) && (f.statuses.length === 0 || f.statuses.includes(row.status)) && (f.fromWarehouseIds.length === 0 || f.fromWarehouseIds.includes(row.fromWarehouseId)) && (f.toWarehouseIds.length === 0 || f.toWarehouseIds.includes(row.toWarehouseId)) && (!f.number || row.number.toLowerCase().includes(f.number.toLowerCase()));
      return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: visible ? '1' : '0', items: visible && read.parameters.page === 1 ? [row] : [] };
    },
    async readDetail(read) { if (read.parameters.transferId !== transferId) throw new Error('SYNTHETIC ONLY：调拨单不在夹具范围。'); await syntheticRead(read.signal, report, 'transferDetail'); return detail(); },
  }, references: { async readWarehouses(read) {
    await syntheticRead(read.signal, report, 'transferWarehouses');
    const items = warehouses.filter(row => (read.parameters.selectedIds.length === 0 || read.parameters.selectedIds.includes(row.id)) && (row.label.includes(read.parameters.search) || hall.label.includes(read.parameters.search))).map(row => ({ id: row.id, name: row.label, hallId: hall.id, hallName: hall.label, enabled: true, hallEnabled: true }));
    return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: String(items.length), items: items.slice((read.parameters.page - 1) * read.parameters.pageSize, read.parameters.page * read.parameters.pageSize) };
  } } };
}
