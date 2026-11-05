import { DomainError } from "../../domain/src/errors.ts";
import { businessDate, entityId, quantity } from "../../domain/src/values.ts";
import type { EntityId, EntityKind } from "../../domain/src/values.ts";
import type { InventoryReadScope } from "./inventory-query-contracts.ts";
import { INVENTORY_LEDGER_MAX_PAGE_SIZE, INVENTORY_LEDGER_BUSINESS_TYPES } from "./inventory-ledger-query-contracts.ts";
import type { InventoryLedgerCursor, InventoryLedgerEntry, InventoryLedgerPage, InventoryLedgerQuery, InventoryLedgerSnapshot, InventoryLedgerSource } from "./inventory-ledger-query-contracts.ts";
import { checkedInventoryLedgerBalanceTransition } from "./inventory-ledger-balance-transition.ts";

type Reject = () => never;
export function invalidInventoryLedgerQuery(): never { throw new DomainError("INVALID_INVENTORY_LEDGER_QUERY", "Invalid inventory ledger read parameters"); }
export function invalidInventoryLedgerResponse(): never { throw new DomainError("INVALID_INVENTORY_LEDGER_RESPONSE", "Invalid trusted inventory ledger response"); }
function record(value: unknown, keys: readonly string[], reject: Reject): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) reject();
  const row = value as Record<string, unknown>;
  if (!keys.every(key => Object.hasOwn(row, key)) || Object.keys(row).some(key => !keys.includes(key))) reject();
  return row;
}
function text(value: unknown, reject: Reject, nullable = false): string {
  if (typeof value !== "string" || value.length > 1000 || (!nullable && !value.trim().length) || /[\u0000-\u001f\u007f]/.test(value)) reject();
  return value;
}
function id<K extends EntityKind>(kind: K, value: unknown, reject: Reject): EntityId<K> {
  try { if (typeof value !== "string") reject(); return entityId(kind, value); } catch { return reject(); }
}
export function checkedInventoryLedgerTimestamp(value: unknown, reject: Reject = invalidInventoryLedgerQuery): string {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)) reject();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 23) !== value.slice(0, 23)) reject();
  return value;
}
function cursor(value: unknown, reject: Reject): InventoryLedgerCursor | null {
  if (value === null) return null;
  const row = record(value, ["postedAt", "entryId"], reject);
  return Object.freeze({ postedAt: checkedInventoryLedgerTimestamp(row.postedAt, reject), entryId: id("ledger", row.entryId, reject) });
}
export function parseInventoryLedgerQuery(value: unknown): InventoryLedgerQuery {
  const numbered = value !== null && typeof value === "object" && (Object.hasOwn(value, "page") || Object.hasOwn(value, "filter"));
  const row = record(value, ["warehouseId", "skuId", "pageSize", "after", ...(numbered ? ["page", "filter"] : [])], invalidInventoryLedgerQuery);
  if (typeof row.pageSize !== "number" || !Number.isSafeInteger(row.pageSize) || row.pageSize < 1 || row.pageSize > INVENTORY_LEDGER_MAX_PAGE_SIZE) invalidInventoryLedgerQuery();
  const base = { warehouseId: id("warehouse", row.warehouseId, invalidInventoryLedgerQuery), skuId: id("sku", row.skuId, invalidInventoryLedgerQuery), pageSize: row.pageSize, after: cursor(row.after, invalidInventoryLedgerQuery) };
  if (!numbered) return Object.freeze(base);
  const reject = invalidInventoryLedgerQuery, f = record(row.filter, ["dateFrom", "dateTo", "businessType", "source"], reject);
  const date = (value: unknown): string | null => { if (value === null) return null; if (typeof value !== "string") return reject(); try { return businessDate(value); } catch { return reject(); } };
  const dateFrom = date(f.dateFrom), dateTo = date(f.dateTo);
  if (row.pageSize !== 20 || row.after !== null || !Number.isSafeInteger(row.page) || (row.page as number) < 1
    || (dateFrom !== null && dateTo !== null && dateFrom > dateTo)
    || (f.businessType !== null && !INVENTORY_LEDGER_BUSINESS_TYPES.includes(f.businessType as never))) reject();
  return Object.freeze({ ...base, page: row.page as number, filter: Object.freeze({ dateFrom, dateTo,
    businessType: f.businessType as NonNullable<InventoryLedgerQuery["filter"]>["businessType"], source: text(f.source, reject, true).trim() }) });
}
export function activeInventoryLedgerRead(signal: AbortSignal): void {
  if (signal.aborted) throw new DomainError("INVENTORY_READ_ABORTED", "Inventory ledger read no longer active");
}
export function inventoryLedgerBefore(left: InventoryLedgerCursor, right: InventoryLedgerCursor): boolean {
  return left.postedAt < right.postedAt || (left.postedAt === right.postedAt && left.entryId < right.entryId);
}
function selection(kind: EntityKind, value: unknown) {
  const row = record(value, ["id", "label"], invalidInventoryLedgerResponse);
  return Object.freeze({ id: id(kind, row.id, invalidInventoryLedgerResponse), label: text(row.label, invalidInventoryLedgerResponse) });
}
function source(value: unknown): InventoryLedgerSource {
  const reject: Reject = invalidInventoryLedgerResponse;
  if (!value || typeof value !== "object") reject();
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "SALES") {
    const row = record(value, ["kind", "salesId", "salesLineId", "endpoint"], reject); if (row.endpoint !== "SALES_WAREHOUSE") reject();
    return Object.freeze({ kind, salesId: id("sales", row.salesId, reject), salesLineId: id("salesLine", row.salesLineId, reject), endpoint: "SALES_WAREHOUSE" });
  }
  if (kind === "TRANSFER") {
    const row = record(value, ["kind", "transferId", "transferLineId", "endpoint"], reject); if (row.endpoint !== "FROM" && row.endpoint !== "TO") reject();
    return Object.freeze({ kind, transferId: id("transfer", row.transferId, reject), transferLineId: id("transferLine", row.transferLineId, reject), endpoint: row.endpoint });
  }
  if (kind === "HISTORY_REVISION") {
    if ((value as { documentKind?: unknown }).documentKind === "SALES") {
      const row = record(value, ["kind", "documentKind", "revisionId", "salesId", "salesLineId", "endpoint"], reject); if (row.endpoint !== "SALES_WAREHOUSE") reject();
      return Object.freeze({ kind, documentKind: "SALES", revisionId: id("operation", row.revisionId, reject), salesId: id("sales", row.salesId, reject), salesLineId: id("salesLine", row.salesLineId, reject), endpoint: "SALES_WAREHOUSE" });
    }
    const row = record(value, ["kind", "documentKind", "revisionId", "transferId", "transferLineId", "endpoint"], reject); if (row.documentKind !== "TRANSFER" || row.endpoint !== "FROM" && row.endpoint !== "TO") reject();
    return Object.freeze({ kind, documentKind: "TRANSFER", revisionId: id("operation", row.revisionId, reject), transferId: id("transfer", row.transferId, reject), transferLineId: id("transferLine", row.transferLineId, reject), endpoint: row.endpoint });
  }
  if (kind !== "CUTOFF_BASELINE") reject();
  const row = record(value, ["kind", "importBatchId", "endpoint"], reject); if (row.endpoint !== "IMPORT_BASELINE") reject();
  return Object.freeze({ kind, importBatchId: id("operation", row.importBatchId, reject), endpoint: "IMPORT_BASELINE" });
}
function entry(value: unknown, numbered: boolean): InventoryLedgerEntry {
  const reject: Reject = invalidInventoryLedgerResponse;
  const row = record(value, ["id", "operationId", "eventKind", "quantityDelta", "source", "sourceDocumentVersion", "reversesEntryId", "businessDate", "postedAt", ...(numbered ? ["display"] : [])], reject);
  const provenance = source(row.source);
  if (!["APPROVE", "UNAPPROVE", "CUTOFF_BASELINE", "HISTORY_REVISION"].includes(row.eventKind as string)) reject();
  const eventKind = row.eventKind as InventoryLedgerEntry["eventKind"];
  try { if (quantity(row.quantityDelta as string) === 0n) reject(); } catch { reject(); }
  const reversesEntryId = row.reversesEntryId === null ? null : id("ledger", row.reversesEntryId, reject);
  if ((eventKind === "UNAPPROVE") !== (reversesEntryId !== null) || (eventKind === "CUTOFF_BASELINE") !== (provenance.kind === "CUTOFF_BASELINE")) reject();
  if ((eventKind === "HISTORY_REVISION") !== (provenance.kind === "HISTORY_REVISION")) reject();
  if (eventKind === "CUTOFF_BASELINE" ? row.sourceDocumentVersion !== null : typeof row.sourceDocumentVersion !== "number"
    || !Number.isSafeInteger(row.sourceDocumentVersion) || row.sourceDocumentVersion < (eventKind === "HISTORY_REVISION" ? 2 : 1) || row.sourceDocumentVersion > 2147483647) reject();
  let date; try { if (typeof row.businessDate !== "string") reject(); date = businessDate(row.businessDate); } catch { return reject(); }
  const entryId = id("ledger", row.id, reject); if (reversesEntryId === entryId) reject();
  let display: InventoryLedgerEntry["display"];
  if (numbered) {
    const d = record(row.display, ["date", "businessType", "sourceNumber", "operator", "balanceTransition", "navigation"], reject);
    if (!INVENTORY_LEDGER_BUSINESS_TYPES.includes(d.businessType as never) || d.navigation !== "NOT_CHECKED") reject();
    let date: string; try { if (typeof d.date !== "string") reject(); date = businessDate(d.date); } catch { return reject(); }
    const operator = record(d.operator, ["accountId", "name", "labelBasis"], reject);
    if (operator.labelBasis !== "CURRENT_REFERENCE" || (operator.accountId === null && operator.name !== null)) reject();
    const transition = checkedInventoryLedgerBalanceTransition(d.balanceTransition,
      { eventKind, sourceKind: provenance.kind, quantityDelta: row.quantityDelta as string }, reject);
    display = Object.freeze({ date, businessType: d.businessType as NonNullable<InventoryLedgerEntry["display"]>["businessType"],
      sourceNumber: d.sourceNumber === null ? null : text(d.sourceNumber, reject), operator: Object.freeze({ accountId: operator.accountId === null ? null : id("account", operator.accountId, reject),
        name: operator.name === null ? null : text(operator.name, reject), labelBasis: "CURRENT_REFERENCE" as const }),
      balanceTransition: transition, navigation: "NOT_CHECKED" as const });
  }
  return Object.freeze({ id: entryId, operationId: id("operation", row.operationId, reject), eventKind, quantityDelta: row.quantityDelta as string,
    ...(display ? { display } : {}),
    source: provenance, sourceDocumentVersion: row.sourceDocumentVersion as number | null, reversesEntryId, businessDate: date, postedAt: checkedInventoryLedgerTimestamp(row.postedAt, reject) });
}
export function checkedInventoryLedgerSnapshot(value: unknown, parameters: InventoryLedgerQuery, scope: InventoryReadScope): InventoryLedgerSnapshot {
  const reject: Reject = invalidInventoryLedgerResponse; const snapshot = record(value, ["readReference", "readiness", "data"], reject);
  const readReference = text(snapshot.readReference, reject); if (snapshot.readiness !== "ready" || readReference.length > 200) reject();
  const numbered = parameters.page !== undefined;
  const row = record(snapshot.data, ["pageSize", "labelBasis", "warehouse", "sku", "entries", "nextCursor", ...(numbered ? ["page", "filteredTotal"] : [])], reject);
  if (row.pageSize !== parameters.pageSize || row.labelBasis !== "CURRENT_REFERENCE") reject();
  const w = record(row.warehouse, ["id", "hallId", "label"], reject);
  const warehouse = Object.freeze({ id: id("warehouse", w.id, reject), hallId: id("hall", w.hallId, reject), label: text(w.label, reject) });
  const authorized = scope.warehouses.find(item => item.id === parameters.warehouseId);
  if (!authorized || warehouse.id !== parameters.warehouseId || warehouse.hallId !== authorized.hallId || warehouse.label !== authorized.label || !scope.hallIds.includes(warehouse.hallId)) reject();
  const s = record(row.sku, ["id", "code", "product", "color", "fit", "sizeGroup", "size"], reject);
  const product = record(s.product, ["id", "code", "name"], reject); const fit = record(s.fit, ["id", "code", "label"], reject);
  const size = record(s.size, ["id", "code", "label"], reject);
  const fitCode = text(fit.code, reject); if (!/^[A-Z]$/.test(fitCode)) reject();
  const sku = Object.freeze({ id: id("sku", s.id, reject), code: text(s.code, reject),
    product: Object.freeze({ id: id("product", product.id, reject), code: text(product.code, reject), name: text(product.name, reject) }),
    color: selection("color", s.color), fit: Object.freeze({ id: id("fit", fit.id, reject), code: fitCode, label: text(fit.label, reject) }),
    sizeGroup: selection("sizeGroup", s.sizeGroup), size: Object.freeze({ id: id("size", size.id, reject), code: size.code === null ? null : text(size.code, reject, true), label: text(size.label, reject) }) });
  if (sku.id !== parameters.skuId || !Array.isArray(row.entries) || row.entries.length > parameters.pageSize) reject();
  const entries = row.entries.map(value => entry(value, numbered)); const ids = new Set<string>(); let previous = parameters.after;
  for (const item of entries) {
    const current = { postedAt: item.postedAt, entryId: item.id };
    if (ids.has(item.id) || (previous !== null && !inventoryLedgerBefore(current, previous))) reject();
    ids.add(item.id); previous = current;
  }
  const nextCursor = cursor(row.nextCursor, reject);
  if (numbered) {
    if (row.page !== parameters.page || typeof row.filteredTotal !== "string" || !/^(0|[1-9]\d{0,127})$/.test(row.filteredTotal) || nextCursor !== null) reject();
    const remaining = BigInt(row.filteredTotal) - (BigInt(parameters.page!) - 1n) * 20n;
    if (entries.length !== Number(remaining < 0n ? 0n : remaining > 20n ? 20n : remaining)) reject();
    const f = parameters.filter!;
    for (const item of entries) {
      const d = item.display!;
      if ((f.dateFrom !== null && d.date < f.dateFrom) || (f.dateTo !== null && d.date > f.dateTo)
        || (f.businessType !== null && d.businessType !== f.businessType)) reject();
      // The SQL source predicate uses the database's lowercase rules. Repeating it
      // with JavaScript Unicode lowercase could reject a valid locale-specific match.
    }
  }
  if (nextCursor !== null && (entries.length !== parameters.pageSize || previous === null || nextCursor.postedAt !== previous.postedAt || nextCursor.entryId !== previous.entryId)) reject();
  const data: InventoryLedgerPage = Object.freeze({ pageSize: parameters.pageSize, labelBasis: "CURRENT_REFERENCE", warehouse, sku, entries: Object.freeze(entries), nextCursor,
    ...(numbered ? { page: parameters.page!, filteredTotal: row.filteredTotal as string } : {}) });
  return Object.freeze({ readReference, readiness: "ready", data });
}
