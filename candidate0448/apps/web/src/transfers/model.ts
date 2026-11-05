import { parseTransferDetailQuery, parseTransferListQuery } from '../../../../packages/application/src/transfer-query-validation.ts';
import type { DocumentStatus } from '../../../../packages/domain/src/documents.ts';
import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { TransferDetailDto, TransferDetailQuery, TransferFilterDraft, TransferListDto, TransferListQuery, TransferReader } from './contracts.ts';
import type { TransferPageSize } from './format.ts';
import { transferPageSizes } from './format.ts';
import { transferDetailResponse, transferListResponse } from './response-validation.ts';

export const transferStatusLabels: Readonly<Record<DocumentStatus, string>> = { DRAFT: '未审核', APPROVED: '已审核', VOID: '已作废' };
export function transferParameters(draft: TransferFilterDraft, pageSize: TransferPageSize): TransferListQuery {
  if (!transferPageSizes.includes(pageSize)) throw new TypeError('Unsupported transfer page size.');
  return parseTransferListQuery({ filter: { startDate: draft.startDate || null, endDate: draft.endDate || null,
    statuses: [...draft.statuses], fromWarehouseIds: draft.from.map(item => item.id), toWarehouseIds: draft.to.map(item => item.id), number: draft.number.trim() || null }, page: 1, pageSize });
}
export function transferTarget(transferId: string): TransferDetailQuery { return parseTransferDetailQuery({ transferId }); }

/** Access denial is never displayed above retained old-identity data. Clearing the
 * route scope also aborts all detail/candidate children, even stalled transports. */
export async function guardedTransferRead<T>(scope: ReadScope, work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) scope.dispose();
    throw error;
  }
}
export function createTransferListQuery(scope: ReadScope, reader: TransferReader): LatestQuery<TransferListQuery, TransferListDto> {
  return new LatestQuery({ scope, execute: read => guardedTransferRead(scope, async () => transferListResponse(await reader.readList(read), read.parameters)) });
}
export function createTransferDetailQuery(scope: ReadScope, reader: TransferReader, accessScope: ReadScope = scope): LatestQuery<TransferDetailQuery, TransferDetailDto> {
  return new LatestQuery({ scope, execute: read => guardedTransferRead(accessScope, async () => transferDetailResponse(await reader.readDetail(read), read.parameters)), versionOf: data => BigInt(data.document.header.version) });
}
