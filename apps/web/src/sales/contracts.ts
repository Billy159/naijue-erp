import type { SalesDetailQuery, SalesListQuery, SalesQueryPageSize, SalesSummary } from '../../../../packages/application/src/sales-query-ports.ts';
import type { SalesDocument, SalesHeaderRow, SalesLineRow, SalesSettlementRow } from '../../../../packages/domain/src/documents.ts';
import type { QueryRead } from '../loading/latest-query.ts';

/** The exactJson HTTP representation, not a lossy Number conversion. */
type ExactWire<T> = { readonly [K in keyof T]: T[K] extends bigint ? string : T[K] extends bigint | null ? string | null : T[K] };
export type SalesSummaryDto = ExactWire<SalesSummary>;
export type SalesHeaderDto = ExactWire<SalesHeaderRow>;
export type SalesLineDto = ExactWire<SalesLineRow>;
export type SalesSettlementDto = ExactWire<SalesSettlementRow>;
export interface SalesListDto { readonly page: number; readonly pageSize: SalesQueryPageSize; readonly exactTotal: string; readonly items: readonly SalesSummaryDto[] }
export interface SalesDetailDto {
  readonly document: Omit<SalesDocument, 'header' | 'lines' | 'settlements'> & {
    readonly header: SalesHeaderDto; readonly lines: readonly SalesLineDto[]; readonly settlements: readonly SalesSettlementDto[];
  };
  readonly stockBasis: 'RUNTIME_LEDGER' | 'CUTOFF_HISTORY';
}
export interface SalesReader {
  readList(read: QueryRead<SalesListQuery>): Promise<SalesListDto>;
  readDetail(read: QueryRead<SalesDetailQuery>): Promise<SalesDetailDto>;
}
export type SalesReferenceKind = 'hall' | 'salesperson' | 'customer' | 'warehouse';
export interface SalesReference { readonly id: string; readonly label: string }
export interface SalesReferenceParameters { readonly kind: SalesReferenceKind; readonly search: string; readonly page: number; readonly pageSize: 20 }
export interface SalesReferencePage { readonly page: number; readonly exactTotal: string; readonly items: readonly SalesReference[] }
/** Required host port. No candidate HTTP route is invented by this slice. The host
 * must provide bounded, authorized reference search, not an eagerly loaded catalog. */
export interface SalesReferenceReader { readReferences(read: QueryRead<SalesReferenceParameters>): Promise<SalesReferencePage> }
export interface SalesFilterDraft {
  readonly startDate: string; readonly endDate: string;
  readonly status: SalesListQuery['filter']['status']; readonly businessType: SalesListQuery['filter']['businessType'];
  readonly hall: SalesReference | null; readonly salesperson: SalesReference | null;
  readonly customer: SalesReference | null; readonly warehouse: SalesReference | null; readonly number: string;
}
export const emptySalesFilter = (): SalesFilterDraft => ({ startDate: '', endDate: '', status: null, businessType: null, hall: null, salesperson: null, customer: null, warehouse: null, number: '' });
export type { SalesDetailQuery, SalesListQuery, SalesQueryPageSize };
