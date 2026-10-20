import type { SalesDetailDto } from '../contracts.ts';
import { detail as savedDetail, uuid } from '../tests/fixtures.ts';
import type { SalesCommandDto, SalesCommandReceiptDto, SalesCommandResultDto, SalesDraftDto } from './contracts.ts';
import { draftFromSalesDetail } from './validation.ts';
export { uuid };
/** Explicit synthetic fixtures. No production entry point imports this file. */
export function detail(status: 'DRAFT' | 'APPROVED' | 'VOID' = 'DRAFT', version = 2): SalesDetailDto {
  const value = savedDetail();
  return { ...value, stockBasis: 'RUNTIME_LEDGER', document: { ...value.document, header: { ...value.document.header, status, version: version as SalesDetailDto['document']['header']['version'],
    approvedAt: status === 'APPROVED' ? '2026-10-20T00:00:00.000Z' : null, approvedByAccountId: status === 'APPROVED' ? value.document.header.createdByAccountId : null },
  lines: value.document.lines.map(line => ({ ...line, pricingRule: 'UNIT_PRICE', zeroConfirmed: false })) } };
}
export function draft(): SalesDraftDto { return draftFromSalesDetail(detail()); }
export function save(expectedVersion: number | null = null): SalesCommandDto { return { action: 'SAVE', requestKey: 'TEST.sales:original', expectedVersion, draft: draft() }; }
export function stateCommand(action: 'APPROVE' | 'UNAPPROVE' | 'VOID' = 'APPROVE', expectedVersion = 2): SalesCommandDto { return { action, requestKey: `TEST.sales:${action}`, expectedVersion, salesId: uuid(1) }; }
export function result(command: SalesCommandDto): SalesCommandResultDto {
  return { operationId: uuid(100), salesId: command.action === 'SAVE' ? command.draft.header.id : command.salesId, version: command.expectedVersion === null ? 1 : command.expectedVersion + 1,
    status: command.action === 'APPROVE' ? 'APPROVED' : command.action === 'VOID' ? 'VOID' : 'DRAFT', ledgerEntryIds: command.action === 'APPROVE' || command.action === 'UNAPPROVE' ? [uuid(101)] : [] };
}
export function receipt(command: SalesCommandDto): SalesCommandReceiptDto { return { requestKey: command.requestKey, action: command.action, status: 'COMMITTED', completedAt: '2026-10-20T00:00:00+08:00', result: result(command) }; }
export const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
export function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
export async function flush() { for (let index = 0; index < 8; index++) await Promise.resolve(); }
