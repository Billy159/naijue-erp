import { businessDate, quantity } from '../../../../../packages/domain/src/values.ts';
import { parseNativeTransferSaveProposal } from '../../../../../packages/application/src/native-transfer-preparation.ts';
import type { TransferDetailDto } from '../contracts.ts';
import type { TransferCommandDto, TransferCommandReceiptDto, TransferCommandResultDto, TransferDraftDto, TransferFormInput } from './contracts.ts';
function invalid(): never { throw new TypeError('Invalid native transfer command contract.'); }
export function frozenSnapshot<T>(value: T): T { const copy = structuredClone(value); const freeze = (item: unknown): void => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } }; freeze(copy); return copy; }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid(); const row = value as Record<string, unknown>; if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) invalid(); return row; }
export function validTransferId(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value); }
export function validRequestKey(value: unknown): value is string { return typeof value === 'string' && value !== '.' && value !== '..' && /^[A-Za-z0-9._:-]{1,200}$/.test(value); }
const version = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
function text(value: unknown): asserts value is string { if (typeof value !== 'string') invalid(); }
function id(value: unknown): asserts value is string { if (!validTransferId(value)) invalid(); }
function array(value: unknown, maximum: number): readonly unknown[] { if (!Array.isArray(value) || value.length > maximum) invalid(); return value; }
export function validateTransferDraft(value: unknown): TransferDraftDto {
  const copy: unknown = structuredClone(value), root = object(copy, ['header', 'lines']);
  const h = object(root.header, ['id', 'number', 'businessDate', 'fromWarehouseId', 'toWarehouseId', 'note', ...(typeof root.header === 'object' && root.header !== null && Object.hasOwn(root.header, 'responsibleStaffId') ? ['responsibleStaffId'] : [])]);
  if (Object.hasOwn(h, 'responsibleStaffId')) id(h.responsibleStaffId);
  id(h.id); text(h.number); if (!h.number.trim()) invalid(); text(h.businessDate); businessDate(h.businessDate); id(h.fromWarehouseId); id(h.toWarehouseId);
  if (h.fromWarehouseId === h.toWarehouseId) invalid(); if (h.note !== null) text(h.note);
  const lines = array(root.lines, 2000); if (!lines.length) invalid(); const seen = new Set<string>(), positions = new Set<number>();
  for (const value of lines) {
    const row = object(value, ['id', 'transferId', 'lineNo', 'skuId', 'quantity', 'snapshot', 'isCurrent']); id(row.id); id(row.skuId);
    text(row.quantity); if (!/^[1-9]\d*$/.test(row.quantity) || row.quantity.length > 19 || quantity(row.quantity) <= 0n) invalid();
    if (row.transferId !== h.id || row.isCurrent !== true || seen.has(row.id) || !version(row.lineNo) || positions.has(row.lineNo)) invalid(); seen.add(row.id); positions.add(row.lineNo);
    const s = object(row.snapshot, ['productCode', 'productName', 'colorName', 'fitName', 'sizeName', 'barcode']); [s.productCode, s.productName, s.colorName, s.fitName, s.sizeName].forEach(text); if (s.barcode !== null) text(s.barcode);
  }
  return frozenSnapshot(copy as TransferDraftDto);
}
export function validateTransferCommand(value: unknown): TransferCommandDto {
  const copy: unknown = structuredClone(value), action = (copy as { action?: unknown } | null)?.action;
  if (!['SAVE', 'APPROVE', 'UNAPPROVE', 'VOID'].includes(action as string)) invalid();
  const proposal = action === 'SAVE' && Object.hasOwn(copy as object, 'proposal');
  const row = object(copy, ['action', 'requestKey', 'expectedVersion', action === 'SAVE' ? proposal ? 'proposal' : 'draft' : 'transferId']); if (!validRequestKey(row.requestKey)) invalid();
  if (action === 'SAVE') {
    if (row.expectedVersion !== null && !version(row.expectedVersion)) invalid();
    if (proposal) { const parsed = parseNativeTransferSaveProposal(row.proposal); if ((parsed.transferId === null) !== (row.expectedVersion === null)) invalid(); row.proposal = parsed; }
    else row.draft = validateTransferDraft(row.draft);
  }
  else { if (!version(row.expectedVersion)) invalid(); id(row.transferId); } return frozenSnapshot(copy as TransferCommandDto);
}
export function validateTransferResult(value: unknown, command: TransferCommandDto): TransferCommandResultDto {
  const row = object(value, ['operationId', 'transferId', 'version', 'status', 'ledgerEntryIds']); id(row.operationId); id(row.transferId);
  const target = command.action === 'SAVE' ? 'proposal' in command ? command.proposal.transferId : command.draft.header.id : command.transferId, next = command.expectedVersion === null ? 1 : command.expectedVersion + 1;
  if (!Number.isSafeInteger(next) || target !== null && row.transferId !== target || row.version !== next || row.status !== ({ SAVE: 'DRAFT', APPROVE: 'APPROVED', UNAPPROVE: 'DRAFT', VOID: 'VOID' } as const)[command.action]) invalid();
  const entries = array(row.ledgerEntryIds, 4000); entries.forEach(id);
  if (new Set(entries).size !== entries.length || (command.action === 'SAVE' || command.action === 'VOID' ? entries.length !== 0 : entries.length === 0 || entries.length % 2 !== 0)) invalid();
  return frozenSnapshot(value as TransferCommandResultDto);
}
export function validateTransferReceipt(value: unknown, command: TransferCommandDto): TransferCommandReceiptDto {
  const row = object(value, ['requestKey', 'action', 'status', 'completedAt', 'result']);
  if (row.requestKey !== command.requestKey || row.action !== command.action || row.status !== 'COMMITTED' || typeof row.completedAt !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(row.completedAt) || !Number.isFinite(Date.parse(row.completedAt))) invalid();
  return frozenSnapshot({ requestKey: command.requestKey, action: command.action, status: 'COMMITTED', completedAt: row.completedAt, result: validateTransferResult(row.result, command) });
}
export function draftFromTransferDetail(detail: TransferDetailDto): TransferDraftDto { const h = detail.document.header; return validateTransferDraft({ header: { id: h.id, number: h.number, businessDate: h.businessDate, fromWarehouseId: h.fromWarehouseId, toWarehouseId: h.toWarehouseId, note: h.note }, lines: detail.document.lines }); }
export function inputFromTransferDraft(draft: TransferDraftDto): TransferFormInput { return frozenSnapshot({ businessDate: draft.header.businessDate, note: draft.header.note ?? '', quantities: Object.fromEntries(draft.lines.map(line => [line.id, line.quantity])) }); }
/** Narrow existing-line edit: never mutates endpoints, SKU identities or snapshots. */
export function draftFromTransferInput(base: TransferDraftDto, input: TransferFormInput): TransferDraftDto {
  const row = object(input, ['businessDate', 'note', 'quantities']); text(row.businessDate); text(row.note); const quantities = object(row.quantities, base.lines.map(line => line.id));
  return validateTransferDraft({ header: { ...base.header, businessDate: row.businessDate, note: row.note === '' && base.header.note === null ? null : row.note }, lines: base.lines.map(line => ({ ...line, quantity: quantities[line.id] })) });
}
