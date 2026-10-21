import type { SalesDetail, SalesDetailQuery, SalesListQuery, SalesQueryPageSize, SalesSummary, SalesFilterReferenceKind, SalesFilterReference, SalesFilterReferenceQuery, SalesFilterReferencePage } from '../../../../packages/application/src/sales-query-ports.ts';
import type { DocumentStatus, SalesDocument, SalesHeaderRow, SalesLineRow, SalesSettlementRow } from '../../../../packages/domain/src/documents.ts';
import type { QueryRead } from '../loading/latest-query.ts';

/** The exactJson HTTP representation, not a lossy Number conversion. */
type ExactWire<T> = { readonly [K in keyof T]: T[K] extends bigint ? string : T[K] extends bigint | null ? string | null : T[K] };
/** Includes exact current non-gift signed/directional sums and the native header
 * update timestamp. No measurement unit or fabricated historical category. */
export type SalesSummaryDto = ExactWire<SalesSummary>;
export type SalesHeaderDto = ExactWire<SalesHeaderRow>;
export type SalesLineDto = ExactWire<SalesLineRow>;
export type SalesSettlementDto = ExactWire<SalesSettlementRow>;
export interface SalesListDto { readonly page: number; readonly pageSize: SalesQueryPageSize; readonly exactTotal: string; readonly items: readonly SalesSummaryDto[] }
export interface SalesDetailDto extends Pick<SalesDetail, 'stockBasis' | 'referenceNames' | 'settlementNames'> {
  readonly document: Omit<SalesDocument, 'header' | 'lines' | 'settlements'> & {
    readonly header: SalesHeaderDto; readonly lines: readonly SalesLineDto[]; readonly settlements: readonly SalesSettlementDto[];
  };
}
export interface SalesReader {
  readList(read: QueryRead<SalesListQuery>): Promise<SalesListDto>;
  readDetail(read: QueryRead<SalesDetailQuery>): Promise<SalesDetailDto>;
}
export type SalesReferenceKind = SalesFilterReferenceKind;
export type SalesReference = SalesFilterReference;
export type SalesReferenceParameters = SalesFilterReferenceQuery;
export interface SalesReferencePage extends Omit<SalesFilterReferencePage, 'exactTotal'> { readonly exactTotal: string }
/** Historical SALES FILTER references only. Never create/edit eligibility, and no
 * unused catalog enumeration. The concrete reader uses /sales/references/query. */
export interface SalesReferenceReader { readReferences(read: QueryRead<SalesReferenceParameters>): Promise<SalesReferencePage> }
/** Presentation groups remain distinct from native persisted business types. */
export type SalesBusinessTypeGroup = 'SALE' | 'RETURN_EXCHANGE';
export interface SalesFilterDraft {
  readonly startDate: string; readonly endDate: string;
  readonly statuses: readonly DocumentStatus[]; readonly businessTypes: readonly SalesBusinessTypeGroup[];
  readonly hall: readonly SalesReference[]; readonly salesperson: readonly SalesReference[];
  readonly customer: readonly SalesReference[]; readonly warehouse: readonly SalesReference[]; readonly number: string;
}
export const emptySalesFilter = (): SalesFilterDraft => ({ startDate: '', endDate: '', statuses: [], businessTypes: [], hall: [], salesperson: [], customer: [], warehouse: [], number: '' });
export type { SalesDetailQuery, SalesListQuery, SalesQueryPageSize };
