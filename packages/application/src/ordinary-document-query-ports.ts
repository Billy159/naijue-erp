import type { DocumentCategorySummary, DocumentProductSummary, SalesQueryFilter, SalesSummary, SalesSummaryQuantities } from './sales-query-ports.ts';
import type { TransferQueryFilter, TransferSummary } from './transfer-query-ports.ts';
/** Ordinary business rows only. Historical oracle contracts remain independent. */
export interface OrdinaryDocumentIdentity {
  readonly dataset: 'LIVE'; readonly batchId: null; readonly documentId: string; readonly effectiveVersion: number;
  readonly productSummary: DocumentProductSummary; readonly categorySummary: DocumentCategorySummary;
}
export type OrdinarySalesSummary = SalesSummary & OrdinaryDocumentIdentity;
export type OrdinaryTransferSummary = TransferSummary & OrdinaryDocumentIdentity;
export interface OrdinaryDocumentPage<T> {
  readonly profile: 'ORDINARY_DOCUMENT_LIST_V1'; readonly page: number; readonly pageSize: number;
  readonly exactTotal: bigint; readonly readRevision: string; readonly items: readonly T[];
}
export interface OrdinarySalesTotalsQuery { readonly filter: SalesQueryFilter; readonly expectedRevision: string }
export interface OrdinaryTransferTotalsQuery { readonly filter: TransferQueryFilter; readonly expectedRevision: string }
export interface OrdinarySalesTotals extends SalesSummaryQuantities { readonly grossAmount: bigint; readonly orderDiscount: bigint; readonly netDue: bigint }
export interface OrdinaryDocumentTotals<T> {
  readonly profile: 'ORDINARY_DOCUMENT_TOTALS_V1'; readonly readRevision: string; readonly exactTotal: bigint; readonly totals: T;
}
