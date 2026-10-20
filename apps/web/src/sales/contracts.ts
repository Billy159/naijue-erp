import type { SalesDetail, SalesDetailQuery, SalesListQuery, SalesQueryPageSize, SalesSummary, SalesFilterReferenceKind, SalesFilterReference, SalesFilterReferenceQuery, SalesFilterReferencePage } from '../../../../packages/application/src/sales-query-ports.ts';
import type { SalesDocument, SalesHeaderRow, SalesLineRow, SalesSettlementRow } from '../../../../packages/domain/src/documents.ts';
import type { QueryRead } from '../loading/latest-query.ts';

/** The exactJson HTTP representation, not a lossy Number conversion. */
type ExactWire<T> = { readonly [K in keyof T]: T[K] extends bigint ? string : T[K] extends bigint | null ? string | null : T[K] };
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
export interface SalesFilterDraft {
  readonly startDate: string; readonly endDate: string;
  readonly status: SalesListQuery['filter']['status']; readonly businessType: SalesListQuery['filter']['businessType'];
  readonly hall: SalesReference | null; readonly salesperson: SalesReference | null;
  readonly customer: SalesReference | null; readonly warehouse: SalesReference | null; readonly number: string;
}
export const emptySalesFilter = (): SalesFilterDraft => ({ startDate: '', endDate: '', status: null, businessType: null, hall: null, salesperson: null, customer: null, warehouse: null, number: '' });
export type { SalesDetailQuery, SalesListQuery, SalesQueryPageSize };
