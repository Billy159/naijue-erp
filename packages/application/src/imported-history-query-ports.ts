import type { ActorContext } from './ports.ts';

export const importedHistoryPageSizes = [20, 50, 100, 200] as const;
export type ImportedHistoryPageSize = typeof importedHistoryPageSizes[number];
export type ImportedHistoryKind = 'sales' | 'transfers';
export interface ImportedHistoryListQuery {
  readonly batchId: string | null;
  readonly number: string;
  readonly businessDateFrom: string | null;
  readonly businessDateTo: string | null;
  readonly sourceStatus: 'DRAFT' | 'APPROVED' | 'VOID' | null;
  readonly hallId: string | null;
  readonly warehouseId: string | null;
  readonly customerId: string | null;
  readonly salespersonId: string | null;
  readonly fromWarehouseId: string | null;
  readonly toWarehouseId: string | null;
  readonly page: number;
  readonly pageSize: ImportedHistoryPageSize;
}
export interface ImportedHistoryDetailQuery {
  readonly documentId: string;
  readonly linePage: number;
  readonly linePageSize: ImportedHistoryPageSize;
  readonly settlementPage: number;
  readonly settlementPageSize: ImportedHistoryPageSize;
}
export type ImportedHistoryReadIntent =
  | { readonly kind: ImportedHistoryKind; readonly operation: 'list'; readonly parameters: ImportedHistoryListQuery }
  | { readonly kind: ImportedHistoryKind; readonly operation: 'detail'; readonly parameters: ImportedHistoryDetailQuery };
export type ImportedHistoryScope = { readonly kind: 'ALL' } | { readonly kind: 'HALL_IDS'; readonly hallIds: readonly string[] }
  | { readonly kind: 'TRANSFER_HALL_IDS'; readonly hallIds: readonly string[] };
/** Explicit historical policy only. No role/LIVE/native-profile fallback. Sales
 * HALL_IDS never authorizes transfers; TRANSFER_HALL_IDS requires the original
 * source-bound warehouse/creator proof on the reader's own snapshot. */
export interface ImportedHistoryReadGrant {
  readonly dataset: 'HISTORY';
  readonly actorAccountId: string;
  readonly kind: ImportedHistoryKind;
  readonly operation: 'list' | 'detail';
  readonly targetId: string | null;
  readonly scope: ImportedHistoryScope;
}
export interface ImportedHistoryPerson {
  readonly state: 'UNKNOWN' | 'UNRESOLVED' | 'BOUND';
  readonly staffId: string | null;
}
interface ImportedHistoryHeaderBase {
  readonly dataset: 'HISTORY'; readonly kind: ImportedHistoryKind;
  readonly batchId: string; readonly documentId: string; readonly version: number;
  readonly number: string; readonly businessDate: string | null;
  readonly sourceStatus: 'DRAFT' | 'APPROVED' | 'VOID'; readonly note: string | null;
  readonly createdBy: ImportedHistoryPerson; readonly approvedBy: ImportedHistoryPerson;
  readonly responsibleStaffId: string | null; readonly responsibleName: string | null;
  readonly createdHallId: string | null;
  readonly createdHallProvenance: 'ORIGINAL' | 'MIGRATION_DERIVED' | 'UNKNOWN';
  readonly createdLocalAt: string | null; readonly updatedLocalAt: string | null; readonly approvedLocalAt: string | null;
  readonly createdInstant: string | null; readonly updatedInstant: string | null; readonly approvedInstant: string | null;
}
export interface ImportedHistorySalesHeader extends ImportedHistoryHeaderBase {
  readonly kind: 'sales'; readonly businessType: 'SALE' | 'RETURN' | 'EXCHANGE';
  readonly hallId: string; readonly customerId: string; readonly warehouseId: string; readonly salespersonId: string | null;
  readonly grossAmount: string; readonly orderDiscount: string; readonly netDue: string;
}
export interface ImportedHistoryTransferHeader extends ImportedHistoryHeaderBase {
  readonly kind: 'transfers'; readonly fromWarehouseId: string; readonly toWarehouseId: string;
}
export type ImportedHistoryHeader = ImportedHistorySalesHeader | ImportedHistoryTransferHeader;
export interface ImportedHistoryLine {
  readonly id: string; readonly lineNo: number; readonly skuId: string; readonly quantity: string;
  readonly productCodeSnapshot: string | null; readonly productNameSnapshot: string | null;
  readonly colorNameSnapshot: string | null; readonly fitNameSnapshot: string | null;
  readonly sizeNameSnapshot: string | null; readonly barcodeSnapshot: string | null;
}
export interface ImportedHistorySalesLine extends ImportedHistoryLine {
  readonly referencePrice: string | null; readonly dealPrice: string; readonly lineAmount: string;
  readonly allocatedDiscount: string | null; readonly isGift: boolean | null;
  readonly pricingMethodSource: string | null; readonly discountTenths: number | null; readonly ordinaryZeroConfirmed: boolean | null;
}
export interface ImportedHistorySettlement {
  readonly id: string; readonly lineNo: number; readonly paymentAccountId: string;
  readonly direction: 'RECEIVE' | 'REFUND'; readonly amount: string;
  readonly accountNameSnapshot: string | null; readonly methodNameSnapshot: string | null;
  readonly paymentMethodIdSnapshot: string | null;
}
export interface ImportedHistoryPage<T> {
  readonly page: number; readonly pageSize: ImportedHistoryPageSize;
  /** Exact count, including values beyond JavaScript safe integers. */
  readonly total: string; readonly items: readonly T[];
}
export interface ImportedHistoryList { readonly dataset: 'HISTORY'; readonly kind: ImportedHistoryKind; readonly documents: ImportedHistoryPage<ImportedHistoryHeader> }
export interface ImportedHistoryDetail {
  readonly dataset: 'HISTORY'; readonly kind: ImportedHistoryKind; readonly document: ImportedHistoryHeader | null;
  readonly lines: ImportedHistoryPage<ImportedHistoryLine | ImportedHistorySalesLine>;
  readonly settlements: ImportedHistoryPage<ImportedHistorySettlement>;
}
export interface ImportedHistoryReadAuthorization {
  authorize(actor: ActorContext, intent: ImportedHistoryReadIntent, signal: AbortSignal): Promise<ImportedHistoryReadGrant>;
}
export interface ImportedHistoryScopedRead {
  readonly actor: ActorContext; readonly intent: ImportedHistoryReadIntent;
  readonly grant: ImportedHistoryReadGrant; readonly signal: AbortSignal;
}
export interface ImportedHistoryReader {
  readList(read: ImportedHistoryScopedRead): Promise<ImportedHistoryList>;
  readDetail(read: ImportedHistoryScopedRead): Promise<ImportedHistoryDetail>;
}
export interface ImportedHistoryReadDependencies { readonly authorization: ImportedHistoryReadAuthorization; readonly reader: ImportedHistoryReader }
