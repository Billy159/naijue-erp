import { parseSalesDetailQuery, parseSalesListQuery } from '../../../../packages/application/src/sales-query-validation.ts';
import type { DocumentStatus, SalesBusinessType } from '../../../../packages/domain/src/documents.ts';
import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { SalesDetailDto, SalesDetailQuery, SalesFilterDraft, SalesListDto, SalesListQuery, SalesQueryPageSize, SalesReader } from './contracts.ts';

export const salesStatusLabels: Readonly<Record<DocumentStatus, string>> = { DRAFT: '未审核', APPROVED: '已审核', VOID: '已作废' };
export const salesTypeLabels: Readonly<Record<SalesBusinessType, string>> = { SALE: '销售', RETURN: '退货', EXCHANGE: '换货' };
export const salesTypeGroupLabels = { SALE: '销售', RETURN_EXCHANGE: '退货/换货' } as const;
export const salesPageSizes = [20, 50, 100, 200] as const;
export function salesParameters(draft: SalesFilterDraft, pageSize: SalesQueryPageSize): SalesListQuery {
  if (draft.businessType !== null && !Object.hasOwn(salesTypeGroupLabels, draft.businessType)) throw new TypeError('Invalid sales business type group.');
  return parseSalesListQuery({ filter: { startDate: draft.startDate || null, endDate: draft.endDate || null,
    statuses: draft.status === null ? [] : [draft.status],
    businessTypes: draft.businessType === 'RETURN_EXCHANGE' ? ['RETURN', 'EXCHANGE'] : draft.businessType === null ? [] : [draft.businessType],
    hallIds: draft.hall === null ? [] : [draft.hall.id], salespersonIds: draft.salesperson === null ? [] : [draft.salesperson.id],
    customerIds: draft.customer === null ? [] : [draft.customer.id], warehouseIds: draft.warehouse === null ? [] : [draft.warehouse.id],
    number: draft.number.trim() || null }, page: 1, pageSize });
}
export function createSalesListQuery(scope: ReadScope, reader: SalesReader): LatestQuery<SalesListQuery, SalesListDto> {
  return new LatestQuery({ scope, execute: read => reader.readList(read) });
}
export function createSalesDetailQuery(scope: ReadScope, reader: SalesReader): LatestQuery<SalesDetailQuery, SalesDetailDto> {
  return new LatestQuery({ scope, execute: read => reader.readDetail(read), versionOf: data => BigInt(data.document.header.version) });
}
export const salesTarget = (salesId: string): SalesDetailQuery => parseSalesDetailQuery({ salesId });
/** Committed PostgreSQL sales codec uses scale 2. No floating point arithmetic,
 * locale Number conversion, rounding, currency guess or absolute-value coercion. */
export function salesMoney(value: string): string {
  if (!/^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(value)) throw new TypeError('Invalid exact sales amount.');
  const negative = value.startsWith('-'); const digits = negative ? value.slice(1) : value;
  const padded = digits.padStart(3, '0');
  return `${negative ? '-' : ''}${padded.slice(0, -2)}.${padded.slice(-2)}`;
}
export function salesCount(value: string): string {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new TypeError('Invalid exact count.');
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
/** BigInt page math; only bounded page indexes ever become safe JS numbers. */
export function pageFacts(page: number, pageSize: SalesQueryPageSize, exactTotal: string | null) {
  const total = BigInt(exactTotal ?? '0'); const size = BigInt(pageSize); const offset = BigInt(page - 1) * size;
  const pages = total === 0n ? 1n : (total + size - 1n) / size;
  return { pages, first: total > offset ? offset + 1n : 0n, last: total > offset ? (total < offset + size ? total : offset + size) : 0n,
    canNext: BigInt(page) < pages && Number.isSafeInteger((page + 1) * pageSize) };
}
