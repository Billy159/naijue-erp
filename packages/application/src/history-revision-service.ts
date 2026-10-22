import { requireDomain } from '../../domain/src/errors.ts';
import { businessDate } from '../../domain/src/values.ts';
import { isExactHistoryMoney, isHistoryQuantity } from './history-storage-contract.ts';
import { checkedImportedHistoryActor } from './imported-history-query-validation.ts';
import type { ActorContext } from './ports.ts';
import type { HistoryRevisionCommand, HistoryRevisionCurrent, HistoryRevisionDependencies, HistoryRevisionEffect, HistoryRevisionGrant,
  HistoryRevisionLineChange, HistoryRevisionPlan, HistoryRevisionReceipt, HistoryRevisionTotals } from './history-revision-contracts.ts';

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
function cents(value: string): bigint { return BigInt(value.replace('.', '')); }
function changed(a: unknown, b: unknown): boolean { return a !== b; }

export function parseHistoryRevisionCommand(value: unknown): HistoryRevisionCommand {
  const r = object(value, ['kind', 'documentId', 'expectedVersion', 'requestKey', 'reason', 'lines', 'totals', 'settlements']);
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
  must(lines.length > 0 || head !== null || settlements.length > 0, 'HISTORY_REVISION_EMPTY');
  return structuredClone({ kind: r.kind, documentId: r.documentId, expectedVersion: r.expectedVersion, requestKey: r.requestKey,
    reason: r.reason, lines, totals: head, settlements }) as HistoryRevisionCommand;
}

/** Pure diff planner; callers MUST invoke it from the locked source/effective transaction. */
export function planHistoryRevision(current: HistoryRevisionCurrent, input: HistoryRevisionCommand, revisionId: string): HistoryRevisionPlan {
  const command = parseHistoryRevisionCommand(input), before = structuredClone(current), after = structuredClone(current);
  must(before.kind === command.kind && before.documentId === command.documentId);
  must(before.version === command.expectedVersion, 'VERSION_CONFLICT');
  must(uuid(revisionId) && revisionId !== before.previousRevisionId);
  must(uuid(before.importBatchId) && uuid(before.publishedOperationId) && /^[a-f0-9]{64}$/.test(before.documentManifestHash)
    && (before.version === 1 ? before.previousRevisionId === null : uuid(before.previousRevisionId)), 'HISTORY_REVISION_BASELINE_UNPROVEN');
  must(['DRAFT', 'APPROVED', 'VOID'].includes(before.sourceStatus)
    && before.baselineEffect === (before.sourceStatus === 'APPROVED' ? 'INCLUDED_APPROVED' : 'EXCLUDED_NOT_EFFECTIVE'), 'HISTORY_REVISION_BASELINE_UNPROVEN');
  if (before.businessDate !== null) businessDate(before.businessDate);
  if (before.kind === 'sales') { must(uuid(before.warehouseId) && before.fromWarehouseId === null && before.toWarehouseId === null && before.totals !== null); totals(before.totals); }
  else must(before.warehouseId === null && uuid(before.fromWarehouseId) && uuid(before.toWarehouseId)
    && before.fromWarehouseId !== before.toWarehouseId && before.totals === null && before.settlements.length === 0);
  const lineIds = new Set<string>(), settlementIds = new Set<string>();
  for (const l of before.lines) {
    must(uuid(l.lineId) && uuid(l.skuId) && !lineIds.has(l.lineId) && isHistoryQuantity(l.quantity)); lineIds.add(l.lineId);
    if (before.kind === 'sales') { money(l.dealPrice, true); money(l.lineAmount); must(l.allocatedDiscount === null || isExactHistoryMoney(l.allocatedDiscount)); }
  }
  for (const s of before.settlements) { must(uuid(s.settlementId) && !settlementIds.has(s.settlementId) && ['RECEIVE', 'REFUND'].includes(s.direction)); money(s.amount, true); settlementIds.add(s.settlementId); }
  const effects: HistoryRevisionEffect[] = []; let anyChanged = false, moneyChanged = false;
  const effect = (lineId: string, warehouseId: string, skuId: string, endpoint: HistoryRevisionEffect['endpoint'], delta: bigint) => {
    if (delta === 0n) return; must(isHistoryQuantity(delta.toString()), 'HISTORY_REVISION_QUANTITY_OVERFLOW');
    effects.push({ lineId, warehouseId, skuId, endpoint, quantityDelta: delta.toString() });
  };
  for (const patch of command.lines) {
    const index = before.lines.findIndex(l => l.lineId === patch.lineId); must(index >= 0, 'HISTORY_REVISION_FOREIGN_ROW');
    const old = before.lines[index]!, next = { ...old, ...patch }; (after.lines as typeof next[])[index] = next;
    for (const key of ['quantity', 'dealPrice', 'lineAmount', 'allocatedDiscount'] as const) if (Object.hasOwn(patch, key) && changed(old[key], next[key])) {
      anyChanged = true; if (key !== 'quantity') moneyChanged = true;
    }
    const difference = BigInt(next.quantity) - BigInt(old.quantity);
    if (before.sourceStatus === 'APPROVED') {
      if (before.kind === 'sales') effect(old.lineId, before.warehouseId!, old.skuId, 'SALES_WAREHOUSE', -difference);
      else { effect(old.lineId, before.fromWarehouseId!, old.skuId, 'FROM', -difference); effect(old.lineId, before.toWarehouseId!, old.skuId, 'TO', difference); }
    }
  }
  if (command.totals !== null) {
    for (const k of ['grossAmount', 'orderDiscount', 'netDue'] as const) if (changed(before.totals![k], command.totals[k])) { anyChanged = true; moneyChanged = true; }
    (after as { totals: HistoryRevisionTotals }).totals = command.totals;
  }
  for (const patch of command.settlements) {
    const index = before.settlements.findIndex(s => s.settlementId === patch.settlementId); must(index >= 0, 'HISTORY_REVISION_FOREIGN_ROW');
    const old = before.settlements[index]!; if (changed(old.amount, patch.amount)) { anyChanged = true; moneyChanged = true; }
    (after.settlements as { settlementId: string; direction: 'RECEIVE' | 'REFUND'; amount: string }[])[index] = { ...old, amount: patch.amount };
  }
  must(anyChanged, 'HISTORY_REVISION_EMPTY');
  must(effects.length === 0 || before.businessDate !== null, 'HISTORY_REVISION_BUSINESS_DATE_UNKNOWN');
  if (moneyChanged) must(after.kind === 'sales' && after.settlements.reduce((sum, s) => sum + (s.direction === 'RECEIVE' ? 1n : -1n) * cents(s.amount), 0n) === cents(after.totals!.netDue), 'SETTLEMENT_MISMATCH');
  (after as { version: number }).version = before.version + 1;
  (after as { previousRevisionId: string }).previousRevisionId = revisionId;
  return { basis: 'CUTOFF_BASELINE_DELTA_V1', revisionId, fromVersion: before.version, toVersion: after.version, before, after, effects, moneyChanged };
}

export function createHistoryRevisionService(dependencies: HistoryRevisionDependencies) {
  if (typeof dependencies?.authorization?.authorize !== 'function' || typeof dependencies?.store?.revise !== 'function' || typeof dependencies?.now !== 'function') throw TypeError('Explicit historical write policy and transactional store required');
  const authorize = dependencies.authorization.authorize.bind(dependencies.authorization), revise = dependencies.store.revise.bind(dependencies.store), now = dependencies.now;
  return Object.freeze({ async execute(actor: ActorContext, value: unknown, signal: AbortSignal): Promise<HistoryRevisionReceipt> {
    const trustedActor = checkedImportedHistoryActor(actor), command = parseHistoryRevisionCommand(value);
    must(!signal.aborted, 'HISTORY_REVISION_ABORTED');
    const raw = object(await authorize(trustedActor, structuredClone(command), signal), ['dataset', 'kind', 'documentId', 'actorAccountId']);
    must(raw.dataset === 'HISTORY' && raw.kind === command.kind && raw.documentId === command.documentId && raw.actorAccountId === trustedActor.accountId, 'FORBIDDEN');
    const grant = raw as unknown as HistoryRevisionGrant, at = now();
    must(typeof at === 'string' && at.endsWith('Z') && Number.isFinite(Date.parse(at)), 'HISTORY_REVISION_TIME');
    must(!signal.aborted, 'HISTORY_REVISION_ABORTED');
    const result = object(await revise(trustedActor, command, grant, at, signal), ['operationId', 'dataset', 'kind', 'documentId', 'revisionId', 'version', 'ledgerEntryIds']);
    const entries = array(result.ledgerEntryIds, 20000);
    must(uuid(result.operationId) && uuid(result.revisionId) && result.dataset === 'HISTORY' && result.kind === command.kind
      && result.documentId === command.documentId && result.version === command.expectedVersion + 1
      && entries.every(uuid) && new Set(entries).size === entries.length, 'HISTORY_REVISION_INVALID_RECEIPT');
    return Object.freeze({ ...result, ledgerEntryIds: Object.freeze([...entries]) }) as unknown as HistoryRevisionReceipt;
  } });
}
