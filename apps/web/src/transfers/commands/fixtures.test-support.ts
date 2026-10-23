import { version, entityId } from '../../../../../packages/domain/src/values.ts';
import { detail as baseDetail, uuid } from '../tests/fixtures.ts';
import type { TransferDetailDto } from '../contracts.ts';
import type { TransferCommandDto, TransferCommandReceiptDto, TransferCommandResultDto } from './contracts.ts';
import { draftFromTransferDetail } from './validation.ts';
export { uuid };
export function detail(status: 'DRAFT' | 'APPROVED' | 'VOID' = 'DRAFT', v = 2): TransferDetailDto {
  const d = baseDetail();
  return { ...d, document: { ...d.document, header: { ...d.document.header, status, version: version(v), approvedAt: status === 'APPROVED' ? '2026-10-20T21:00:00.000000Z' : null, approvedByAccountId: status === 'APPROVED' ? entityId('account', uuid(30)) : null } }, references: { ...d.references, approvedByName: status === 'APPROVED' ? 'TEST 审核人' : null } };
}
export const draft = () => draftFromTransferDetail(detail());
export function result(command: TransferCommandDto, count = 4): TransferCommandResultDto {
  const target = command.action === 'SAVE' ? 'proposal' in command ? command.proposal.transferId : command.draft.header.id : command.transferId;
  if (target === null) throw new TypeError('New proposal tests must supply an explicit server result, not fabricate a document ID.');
  return { transferId: entityId('transfer', target), operationId: entityId('operation', uuid(400)), version: version(command.expectedVersion === null ? 1 : command.expectedVersion + 1),
    status: ({ SAVE: 'DRAFT', APPROVE: 'APPROVED', UNAPPROVE: 'DRAFT', VOID: 'VOID' } as const)[command.action],
    ledgerEntryIds: command.action === 'SAVE' || command.action === 'VOID' ? [] : Array.from({ length: count }, (_, index) => entityId('ledger', uuid(500 + index))) };
}
export const receipt = (command: TransferCommandDto): TransferCommandReceiptDto => ({ requestKey: command.requestKey, action: command.action, status: 'COMMITTED', completedAt: '2026-10-21T00:00:00Z', result: result(command) });
export function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason?: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
export const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
