import { requireDomain } from '../../domain/src/errors.ts';
import { TRANSFER_PREPARE_MAX_LINES, TRANSFER_PREPARE_MAX_NOTE_LENGTH } from './transfer-payload-budget.ts';
import { requestHash } from './request-hash.ts';
import { businessDate } from '../../domain/src/values.ts';
import { isExactHistoryMoney, isHistoryQuantity } from './history-storage-contract.ts';
import { checkedImportedHistoryActor } from './imported-history-query-validation.ts';
import type { ActorContext } from './ports.ts';
import type { HistoryRevisionCommand, HistoryRevisionCurrent, HistoryRevisionDependencies, HistoryRevisionEffect, HistoryRevisionGrant,
  HistoryRevisionHeaderChange, HistoryRevisionLineChange, HistoryRevisionPlan, HistoryRevisionReceipt, HistoryRevisionTotals, HistoryRevisionDraftLineInput, HistoryRevisionResolvedDraftLineSet, HistoryRevisionLineOrigin } from './history-revision-contracts.ts';

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
function same(a: unknown, b: unknown): boolean { return requestHash(a) === requestHash(b); }
export function checkedHistoryRevisionDraftLineSet(facts: HistoryRevisionResolvedDraftLineSet): void {
  object(facts,['lines','nativeGroups']);
  array(facts.lines,TRANSFER_PREPARE_MAX_LINES);array(facts.nativeGroups,TRANSFER_PREPARE_MAX_LINES);
  must(facts.lines.length > 0);
  const ids = new Set<string>(), groups = new Set<string>();
  for (const group of facts.nativeGroups) {
    object(group,['revisionId','groupId','name','sizes']);array(group.sizes,1000);
    must(uuid(group.revisionId) && uuid(group.groupId) && typeof group.name === 'string' && group.name.trim().length > 0);
    const key = group.revisionId + ':' + group.groupId; must(!groups.has(key)); groups.add(key);
    must(group.sizes.length > 0 && group.sizes.length <= 1000 && new Set(group.sizes.map(s => s.sizeId)).size === group.sizes.length);
    for (const size of group.sizes) {object(size,['sizeId','name','displayOrder']);must(uuid(size.sizeId) && typeof size.name === 'string' && size.name.trim().length > 0 && Number.isSafeInteger(size.displayOrder));}
    for(let i=1;i<group.sizes.length;i++){const a=group.sizes[i-1]!,b=group.sizes[i]!;must(a.displayOrder < b.displayOrder || a.displayOrder === b.displayOrder && a.sizeId < b.sizeId);}
  }
  const used = new Set<string>();
  for (const row of facts.lines) {
    object(row,['lineId','skuId','quantity','origin']);
    must(uuid(row.lineId) && uuid(row.skuId) && !ids.has(row.lineId) && positiveDraftQuantity(row.quantity)); ids.add(row.lineId);
    const origin = row.origin;
    if (origin.kind === 'SOURCE') {object(origin,['kind','sourceLineId']);must(uuid(origin.sourceLineId) && origin.sourceLineId === row.lineId);}
    else {
      object(origin,['kind','createdRevisionId','identity','groupId','snapshot']);
      object(origin.identity,['productId','colorId','fitId','sizeId']);object(origin.snapshot,['productCodeSnapshot','productNameSnapshot','colorNameSnapshot','fitNameSnapshot','sizeNameSnapshot','barcodeSnapshot']);
      must(origin.kind === 'REVISION' && uuid(origin.createdRevisionId) && uuid(origin.groupId));
      for (const value of Object.values(origin.identity)) must(uuid(value));
      must(Object.keys(origin.identity).length === 4 && ['productId','colorId','fitId','sizeId'].every(k => Object.hasOwn(origin.identity,k)));
      for (const key of ['productCodeSnapshot','productNameSnapshot','colorNameSnapshot','fitNameSnapshot','sizeNameSnapshot'] as const) must(typeof origin.snapshot[key] === 'string' && origin.snapshot[key].trim().length > 0);
      must(origin.snapshot.barcodeSnapshot === null || typeof origin.snapshot.barcodeSnapshot === 'string');
      const key = origin.createdRevisionId + ':' + origin.groupId, group = facts.nativeGroups.find(g => g.revisionId === origin.createdRevisionId && g.groupId === origin.groupId);
      must(group && group.sizes.some(s => s.sizeId === origin.identity.sizeId && s.name === origin.snapshot.sizeNameSnapshot)); used.add(key);
    }
  }
  must(used.size === groups.size && [...groups].every(k => used.has(k)));
  for (let i=1;i<facts.nativeGroups.length;i++) { const a=facts.nativeGroups[i-1]!,b=facts.nativeGroups[i]!; must(a.revisionId < b.revisionId || a.revisionId === b.revisionId && a.groupId < b.groupId); }
}

/** Pure diff planner; callers MUST invoke it from the locked source/effective transaction. */
export function planHistoryRevision(current: HistoryRevisionCurrent, input: HistoryRevisionCommand, revisionId: string, resolved?: HistoryRevisionResolvedDraftLineSet): HistoryRevisionPlan {
  const command = parseHistoryRevisionCommand(input), before = structuredClone(current), after = structuredClone(current);
  const responsible = current.responsibleStaffId === undefined ? null : current.responsibleStaffId;
  must(responsible === null || uuid(responsible), 'HISTORY_REVISION_BASELINE_UNPROVEN');
  Object.assign(before, { responsibleStaffId: responsible }); Object.assign(after, { responsibleStaffId: responsible });
  if (before.kind === 'transfers') {
    const note = current.note === undefined ? null : current.note;
    must(note === null || typeof note === 'string', 'HISTORY_REVISION_BASELINE_UNPROVEN');
    Object.assign(before, {note}); Object.assign(after, {note});
  }
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
  if (before.draftLineSetVersion !== undefined) {
    must(before.kind === 'transfers' && before.sourceStatus === 'DRAFT' && before.draftLineSetVersion === 1 && before.nativeGroups !== undefined);
    checkedHistoryRevisionDraftLineSet({lines: before.lines as HistoryRevisionResolvedDraftLineSet['lines'],nativeGroups:before.nativeGroups!});
  }
  const lineIndexes = new Map<string, number>(), settlementIndexes = new Map<string, number>();
  for (const [index, l] of before.lines.entries()) {
    must(uuid(l.lineId) && uuid(l.skuId) && !lineIndexes.has(l.lineId) && isHistoryQuantity(l.quantity)); lineIndexes.set(l.lineId, index);
    if (before.kind === 'sales') { money(l.dealPrice, true); money(l.lineAmount); must(l.allocatedDiscount === null || isExactHistoryMoney(l.allocatedDiscount)); }
  }
  for (const [index, s] of before.settlements.entries()) { must(uuid(s.settlementId) && !settlementIndexes.has(s.settlementId) && ['RECEIVE', 'REFUND'].includes(s.direction)); money(s.amount, true); settlementIndexes.set(s.settlementId, index); }
  const effects: HistoryRevisionEffect[] = []; let anyChanged = false, moneyChanged = false;
  if (command.header !== undefined) {
    must(before.sourceStatus === 'DRAFT' && before.baselineEffect === 'EXCLUDED_NOT_EFFECTIVE');
    for (const key of ['businessDate', 'fromWarehouseId', 'toWarehouseId', 'responsibleStaffId', 'note'] as const) {
      if (Object.hasOwn(command.header, key)) {
        const value = command.header[key]; if (before[key] !== value) anyChanged = true;
        Object.assign(after, { [key]: value });
      }
    }
    if (after.kind === 'transfers') must(after.fromWarehouseId !== after.toWarehouseId);
  }
  if (command.lineSet !== undefined) {
    must(before.kind === 'transfers' && before.sourceStatus === 'DRAFT' && before.baselineEffect === 'EXCLUDED_NOT_EFFECTIVE');
    must(after.businessDate !== null, 'HISTORY_REVISION_BUSINESS_DATE_UNKNOWN');
    must(resolved !== undefined, 'HISTORY_REVISION_RESOLVED_LINE_SET_REQUIRED');
    checkedHistoryRevisionDraftLineSet(resolved!); must(resolved!.lines.length === command.lineSet.length);
    for (const [index, proposal] of command.lineSet.entries()) {
      const row = resolved!.lines[index]!, old = proposal.lineId === null ? undefined : before.lines.find(l=>l.lineId===proposal.lineId);
      must(proposal.lineId === null || old !== undefined, 'HISTORY_REVISION_FOREIGN_ROW');
      must(row.skuId === proposal.skuId && row.quantity === proposal.quantity);
      if (old && old.skuId === proposal.skuId) {
        const origin: HistoryRevisionLineOrigin = old.origin ?? {kind:'SOURCE',sourceLineId:old.lineId};
        must(row.lineId === old.lineId && same(row.origin,origin));
      } else must(!lineIndexes.has(row.lineId) && row.lineId !== before.documentId && row.lineId !== revisionId && row.lineId !== before.previousRevisionId
        && row.origin.kind === 'REVISION' && row.origin.createdRevisionId === revisionId);
    }
    for (const group of resolved!.nativeGroups) if (group.revisionId !== revisionId) must(before.nativeGroups?.some(old=>same(old,group)));
    Object.assign(after,{draftLineSetVersion:1,lines:structuredClone(resolved!.lines),nativeGroups:structuredClone(resolved!.nativeGroups)});
    anyChanged = before.draftLineSetVersion !== 1 || !same(before.lines,after.lines) || !same(before.nativeGroups,after.nativeGroups) || anyChanged;
  } else must(resolved === undefined);
  const effect = (lineId: string, warehouseId: string, skuId: string, endpoint: HistoryRevisionEffect['endpoint'], delta: bigint) => {
    if (delta === 0n) return; must(isHistoryQuantity(delta.toString()), 'HISTORY_REVISION_QUANTITY_OVERFLOW');
    effects.push({ lineId, warehouseId, skuId, endpoint, quantityDelta: delta.toString() });
  };
  for (const patch of command.lines) {
    const index = lineIndexes.get(patch.lineId); must(index !== undefined, 'HISTORY_REVISION_FOREIGN_ROW');
    if (before.draftLineSetVersion === 1 && patch.quantity !== undefined) must(positiveDraftQuantity(patch.quantity));
    const old = before.lines[index!]!, next = { ...old, ...patch }; (after.lines as typeof next[])[index!] = next;
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
    const index = settlementIndexes.get(patch.settlementId); must(index !== undefined, 'HISTORY_REVISION_FOREIGN_ROW');
    const old = before.settlements[index!]!; if (changed(old.amount, patch.amount)) { anyChanged = true; moneyChanged = true; }
    (after.settlements as { settlementId: string; direction: 'RECEIVE' | 'REFUND'; amount: string }[])[index!] = { ...old, amount: patch.amount };
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
