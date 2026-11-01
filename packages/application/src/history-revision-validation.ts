/** Browser-safe HISTORY command validation. No persistence, authorization or hashing. */
import { requireDomain } from '../../domain/src/errors.ts';
import { TRANSFER_PREPARE_MAX_LINES, TRANSFER_PREPARE_MAX_NOTE_LENGTH } from './transfer-payload-budget.ts';
import { businessDate } from '../../domain/src/values.ts';
import { isExactHistoryMoney, isHistoryQuantity } from './history-storage-contract.ts';
import type { HistoryRevisionCommand, HistoryRevisionHeaderChange, HistoryRevisionLineChange, HistoryRevisionTotals, HistoryRevisionDraftLineInput } from './history-revision-contracts.ts';

const must = (ok: unknown, code = 'HISTORY_REVISION_INVALID'): void => requireDomain(ok, code, 'Historical correction rejected');
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  must(value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype);
  const keys = Reflect.ownKeys(value as object), result: Record<string, unknown> = {};
  must(keys.every(k => typeof k === 'string' && [...required, ...optional].includes(k)) && required.every(k => keys.includes(k)));
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(value, k)!;
    must(typeof k === 'string' && d.enumerable && Object.hasOwn(d, 'value')); result[k as string] = d.value;
  }
  return result;
}
function array(value: unknown, limit = 10000): unknown[] {
  must(Array.isArray(value) && value.length <= limit);
  const rows = value as unknown[];
  must(Reflect.ownKeys(rows).length === rows.length + 1);
  const result: unknown[] = [];
  for (let i = 0; i < rows.length; i++) { const d = Object.getOwnPropertyDescriptor(rows, String(i)); must(d && Object.hasOwn(d, 'value') && d.enumerable); result.push(d!.value); }
  return result;
}
function money(value: unknown, nonnegative = false): string {
  must(isExactHistoryMoney(value) && (!nonnegative || !value.startsWith('-'))); return value as string;
}
function totals(value: unknown): HistoryRevisionTotals {
  const r = object(value, ['grossAmount', 'orderDiscount', 'netDue']);
  return { grossAmount: money(r.grossAmount), orderDiscount: money(r.orderDiscount, true), netDue: money(r.netDue) };
}

export function parseHistoryRevisionCommand(value: unknown): HistoryRevisionCommand {
  const r = object(value, ['kind', 'documentId', 'expectedVersion', 'requestKey', 'reason', 'lines', 'totals', 'settlements'], ['header', 'lineSet']);
  must((r.kind === 'sales' || r.kind === 'transfers') && uuid(r.documentId)
    && Number.isSafeInteger(r.expectedVersion) && (r.expectedVersion as number) > 0 && (r.expectedVersion as number) < 2147483647);
  for (const [v, limit] of [[r.requestKey, 200], [r.reason, 2000]] as const) must(typeof v === 'string' && v.trim().length > 0 && v.length <= limit && !v.includes('\0'));
  const seen = new Set<string>();
  const lines: HistoryRevisionLineChange[] = array(r.lines).map(value => {
    const row = object(value, ['lineId'], r.kind === 'sales' ? ['quantity', 'dealPrice', 'lineAmount', 'allocatedDiscount'] : ['quantity']);
    must(uuid(row.lineId) && !seen.has(row.lineId) && Object.keys(row).length > 1); seen.add(row.lineId as string);
    if (Object.hasOwn(row, 'quantity')) must(isHistoryQuantity(row.quantity));
    if (Object.hasOwn(row, 'dealPrice')) money(row.dealPrice, true);
    if (Object.hasOwn(row, 'lineAmount')) money(row.lineAmount);
    if (Object.hasOwn(row, 'allocatedDiscount') && row.allocatedDiscount !== null) money(row.allocatedDiscount, true);
    return row as unknown as HistoryRevisionLineChange;
  });
  const settled = new Set<string>(), settlements = array(r.settlements).map(value => {
    const row = object(value, ['settlementId', 'amount']); must(uuid(row.settlementId) && !settled.has(row.settlementId)); settled.add(row.settlementId as string);
    return { settlementId: row.settlementId as string, amount: money(row.amount, true) };
  });
  must(r.kind === 'sales' || (r.totals === null && settlements.length === 0));
  const head = r.totals === null ? null : totals(r.totals);
  let header: HistoryRevisionHeaderChange | undefined;
  if (Object.hasOwn(r, 'header')) {
    const h = object(r.header, [], r.kind === 'sales' ? ['businessDate'] : ['businessDate', 'fromWarehouseId', 'toWarehouseId', 'responsibleStaffId', 'note']);
    must(Object.keys(h).length > 0, 'HISTORY_REVISION_EMPTY');
    if (Object.hasOwn(h, 'businessDate')) { try { businessDate(h.businessDate as string); } catch { must(false); } }
    for (const key of ['fromWarehouseId', 'toWarehouseId']) if (Object.hasOwn(h, key)) must(uuid(h[key]));
    if (Object.hasOwn(h, 'responsibleStaffId')) must(h.responsibleStaffId === null || uuid(h.responsibleStaffId));
    if (Object.hasOwn(h, 'note')) must(h.note === null || typeof h.note === 'string' && h.note.length <= TRANSFER_PREPARE_MAX_NOTE_LENGTH);
    header = h as HistoryRevisionHeaderChange;
  }
  let lineSet: HistoryRevisionDraftLineInput[] | undefined;
  if (Object.hasOwn(r, 'lineSet')) {
    must(r.kind === 'transfers' && lines.length === 0);
    const ids = new Set<string>();
    lineSet = array(r.lineSet, TRANSFER_PREPARE_MAX_LINES).map(value => {
      const row = object(value, ['lineId', 'skuId', 'quantity']);
      must((row.lineId === null || uuid(row.lineId) && !ids.has(row.lineId)) && uuid(row.skuId) && positiveDraftQuantity(row.quantity));
      if (row.lineId !== null) ids.add(row.lineId as string);
      return row as unknown as HistoryRevisionDraftLineInput;
    });
    must(lineSet.length > 0);
  }
  must(lineSet !== undefined || lines.length > 0 || head !== null || settlements.length > 0 || header !== undefined, 'HISTORY_REVISION_EMPTY');
  return structuredClone({ kind: r.kind, documentId: r.documentId, expectedVersion: r.expectedVersion, requestKey: r.requestKey,
    reason: r.reason, lines, totals: head, settlements, ...(header === undefined ? {} : { header }), ...(lineSet === undefined ? {} : { lineSet }) }) as HistoryRevisionCommand;
}


function positiveDraftQuantity(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}
