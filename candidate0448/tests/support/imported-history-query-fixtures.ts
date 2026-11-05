import { entityId } from '../../packages/domain/src/values.ts';
import type { ImportedHistoryKind, ImportedHistoryListQuery, ImportedHistoryReadGrant, ImportedHistoryReadIntent, ImportedHistorySalesHeader, ImportedHistoryTransferHeader } from '../../packages/application/src/imported-history-query-ports.ts';
export const historyId = (n: number): string => `10000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
export const historyActor = Object.freeze({ accountId: entityId('account', historyId(1)), hallId: entityId('hall', historyId(2)) });
export function historyListQuery(): ImportedHistoryListQuery {
  return { batchId: null, number: '', businessDateFrom: null, businessDateTo: null, sourceStatus: null, hallId: null, warehouseId: null, customerId: null, salespersonId: null, fromWarehouseId: null, toWarehouseId: null, page: 1, pageSize: 20 };
}
export const historyDetailQuery = () => ({ documentId: historyId(3), linePage: 1, linePageSize: 20 as const, settlementPage: 1, settlementPageSize: 20 as const });
export function historyGrant(intent: ImportedHistoryReadIntent): ImportedHistoryReadGrant {
  return { dataset: 'HISTORY', actorAccountId: historyActor.accountId, kind: intent.kind, operation: intent.operation, targetId: intent.operation === 'detail' ? intent.parameters.documentId : null, scope: { kind: 'ALL' } };
}
export function historyHeader(kind: ImportedHistoryKind): ImportedHistorySalesHeader | ImportedHistoryTransferHeader {
  const base = { dataset: 'HISTORY' as const, documentId: historyId(3), batchId: historyId(4), version: 1, number: '历史-0001', businessDate: null, sourceStatus: 'APPROVED' as const, note: null,
    createdBy: { state: 'UNKNOWN' as const, staffId: null }, approvedBy: { state: 'UNRESOLVED' as const, staffId: null }, responsibleStaffId: null, responsibleName: null, createdHallId: null, createdHallProvenance: 'UNKNOWN' as const,
    createdLocalAt: '2026-10-04T12:00:00.123456', updatedLocalAt: null, approvedLocalAt: null, createdInstant: null, updatedInstant: null, approvedInstant: null };
  return kind === 'sales' ? { ...base, kind, businessType: 'RETURN', hallId: historyActor.hallId!, warehouseId: historyId(5), customerId: historyId(6), salespersonId: null, grossAmount: '-0.12', orderDiscount: '0.00', netDue: '-0.12' } : { ...base, kind, fromWarehouseId: historyId(5), toWarehouseId: historyId(6) };
}
export function historyHeaderRow(kind: ImportedHistoryKind) {
  const h = historyHeader(kind);
  return { id: h.documentId, batch_id: h.batchId, version: h.version, number: h.number, business_date: h.businessDate, source_status: h.sourceStatus, note: h.note,
    created_hall_id: h.createdHallId, created_hall_provenance: h.createdHallProvenance, creator_known: false, approver_known: true, created_by_staff_id: null, approved_by_staff_id: null,
    created_local_at: h.createdLocalAt, updated_local_at: h.updatedLocalAt, approved_local_at: h.approvedLocalAt, created_instant: h.createdInstant, updated_instant: h.updatedInstant, approved_instant: h.approvedInstant,
    ...(h.kind === 'sales' ? { business_type: h.businessType, hall_id: h.hallId, customer_id: h.customerId, warehouse_id: h.warehouseId, salesperson_id: h.salespersonId, gross_amount: h.grossAmount, order_discount: h.orderDiscount, net_due: h.netDue } : { from_warehouse_id: h.fromWarehouseId, to_warehouse_id: h.toWarehouseId }) };
}

/** Finite NEW-revision facts only; this is not an installed SQL/real-source proof. */
export function historyDraftLineSetFacts(rows=23) {
  const groupId=historyId(205),sizeId=historyId(204);
  const nativeGroups=[97,98].map(n=>({revisionId:historyId(n),groupId,name:'创建修订尺码组'+n,sizes:[{sizeId,name:'S',displayOrder:0},{sizeId:historyId(206),name:'M',displayOrder:1}]}));
  const lines=Array.from({length:rows},(_,i)=>({lineId:historyId(300+i),skuId:historyId(102),quantity:String(i+1),origin:{kind:'REVISION' as const,createdRevisionId:historyId(i%2?98:97),identity:{productId:historyId(201),colorId:historyId(202),fitId:historyId(203),sizeId},groupId,snapshot:{productCodeSnapshot:'新原生款号',productNameSnapshot:'本次修订新增'+(i%2?98:97),colorNameSnapshot:'红',fitNameSnapshot:'A',sizeNameSnapshot:'S',barcodeSnapshot:null}}}));
  return {kind:'transfers' as const,documentId:historyId(3),version:3,previousRevisionId:historyId(99),importBatchId:historyId(4),publishedOperationId:historyId(90),documentManifestHash:'a'.repeat(64),sourceStatus:'DRAFT' as const,baselineEffect:'EXCLUDED_NOT_EFFECTIVE' as const,businessDate:'2026-11-01',warehouseId:null,fromWarehouseId:historyId(5),toWarehouseId:historyId(6),lines,totals:null,settlements:[],responsibleStaffId:null,note:null,draftLineSetVersion:1 as const,nativeGroups};
}
