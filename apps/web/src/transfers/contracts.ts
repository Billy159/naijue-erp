import type { TransferDetail, TransferDetailQuery, TransferListPage, TransferListQuery, TransferSummary, TransferWarehouseQuery, TransferWarehouseReference, TransferWarehousePage as NativeWarehousePage } from '../../../../packages/application/src/transfer-query-ports.ts';
import type { QueryRead } from '../loading/latest-query.ts';
import type { ProductReadOnlyReader } from '../inventory/product-contracts.ts';

/** exactJson recursively serializes bigint as a decimal string, never Number. */
export type TransferWire<T> = T extends bigint ? string : T extends string | number | boolean | null | undefined ? T : T extends readonly (infer U)[] ? readonly TransferWire<U>[] : T extends object ? { readonly [K in keyof T]: TransferWire<T[K]> } : T;
export type TransferListDto = TransferWire<TransferListPage>;
export type TransferSummaryDto = TransferWire<TransferSummary>;
export type TransferDetailDto = TransferWire<TransferDetail>;
export interface TransferReader {
  readList(read: QueryRead<TransferListQuery>): Promise<TransferListDto>;
  readDetail(read: QueryRead<TransferDetailQuery>): Promise<TransferDetailDto>;
}
export interface TransferProductCapability {
  readonly reader: ProductReadOnlyReader;
  /** All shared drawer frame/body CSS, action-only and usable on resolution. */
  readonly loadStyles: () => Promise<void>;
}
/** Bounded historical filter facts only, not create/edit warehouse eligibility. */
export type TransferWarehouseParameters = TransferWarehouseQuery;
export type TransferWarehouse = TransferWarehouseReference;
export type TransferWarehousePage = TransferWire<NativeWarehousePage>;
export interface TransferWarehouseReader {
  readWarehouses(read: QueryRead<TransferWarehouseParameters>): Promise<TransferWarehousePage>;
}
export interface TransferFilterDraft {
  readonly startDate: string; readonly endDate: string;
  readonly statuses: readonly ('DRAFT' | 'APPROVED' | 'VOID')[];
  readonly from: readonly TransferWarehouse[]; readonly to: readonly TransferWarehouse[]; readonly number: string;
}
export const emptyTransferFilter = (): TransferFilterDraft => ({ startDate: '', endDate: '', statuses: [], from: [], to: [], number: '' });
export type { TransferListQuery, TransferDetailQuery };
