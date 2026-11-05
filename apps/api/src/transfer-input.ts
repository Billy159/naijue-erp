import type { TransferActor, TransferCommand, TransferDraft } from "../../../packages/application/src/transfer-ports.ts";
import type { SkuSnapshot, TransferLineRow } from "../../../packages/domain/src/documents.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { businessDate, entityId, quantity, version } from "../../../packages/domain/src/values.ts";
import type { EntityId, EntityKind } from "../../../packages/domain/src/values.ts";
import { parseRequestKey } from "./input.ts";
import { parseNativeTransferSaveProposal } from '../../../packages/application/src/native-transfer-preparation.ts';

/** Transport validation only. Warehouse/SKU existence, scope and enablement are trusted server policy. */
function invalid(): never { throw new DomainError("INVALID_HTTP_INPUT", "Request does not match the transfer HTTP contract"); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || !keys.every(key => Object.hasOwn(row, key))) invalid();
  return row;
}
function string(value: unknown): string { if (typeof value !== "string") invalid(); return value; }
function nullableString(value: unknown): string | null { return value === null ? null : string(value); }
function integer(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) invalid(); return value; }
function id<K extends EntityKind>(kind: K, value: unknown): EntityId<K> { return entityId(kind, string(value)); }
function array(value: unknown): unknown[] { if (!Array.isArray(value)) invalid(); return value; }
function choice<const T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) invalid();
  return value as T;
}
function snapshot(value: unknown, retainUnknown: boolean): SkuSnapshot {
  const row = object(value, ["productCode", "productName", "colorName", "fitName", "sizeName", "barcode"]);
  const label = retainUnknown ? nullableString : string;
  return { productCode: label(row.productCode), productName: label(row.productName), colorName: label(row.colorName),
    fitName: label(row.fitName), sizeName: label(row.sizeName), barcode: nullableString(row.barcode) };
}
function line(value: unknown, retainUnknown: boolean): TransferLineRow {
  const row = object(value, ["id", "transferId", "lineNo", "skuId", "quantity", "snapshot", "isCurrent"]);
  if (row.isCurrent !== true) invalid();
  return { id: id("transferLine", row.id), transferId: id("transfer", row.transferId), lineNo: integer(row.lineNo),
    skuId: id("sku", row.skuId), quantity: quantity(string(row.quantity)), snapshot: snapshot(row.snapshot, retainUnknown), isCurrent: true };
}
function draft(value: unknown, retainUnknown: boolean): TransferDraft {
  const row = object(value, ["header", "lines"]);
  const header = object(row.header, ["id", "number", "businessDate", "fromWarehouseId", "toWarehouseId", "note", ...(row.header && typeof row.header === "object" && Object.hasOwn(row.header, "responsibleStaffId") ? ["responsibleStaffId"] : [])]);
  return { header: { id: id("transfer", header.id), number: string(header.number), businessDate: businessDate(string(header.businessDate)),
    fromWarehouseId: id("warehouse", header.fromWarehouseId), toWarehouseId: id("warehouse", header.toWarehouseId), note: nullableString(header.note), ...(Object.hasOwn(header, "responsibleStaffId") ? { responsibleStaffId: header.responsibleStaffId === null ? null : id("staff", header.responsibleStaffId) } : {}) },
    lines: array(row.lines).map(value => line(value, retainUnknown)) };
}
export function parseTransferCommand(body: unknown, actor: TransferActor): TransferCommand {
  // Select the complete key set first. No caller-provided actor, creation facts, defaults or coercion.
  if (body === null || typeof body !== "object" || Array.isArray(body)) invalid();
  const action = choice((body as Record<string, unknown>).action, ["SAVE", "APPROVE", "UNAPPROVE", "VOID"]);
  if(action==='SAVE'&&Object.hasOwn(body,'proposal')){
    const row=object(body,['action','requestKey','expectedVersion','proposal']),proposal=parseNativeTransferSaveProposal(row.proposal);
    const expectedVersion=row.expectedVersion===null?null:version(integer(row.expectedVersion));
    if((proposal.transferId===null)!==(expectedVersion===null))invalid();
    return {actor,action,requestKey:parseRequestKey(row.requestKey),expectedVersion,proposal};
  }
  const row = object(body, ["action", "requestKey", "expectedVersion", action === "SAVE" ? "draft" : "transferId"]);
  const requestKey = parseRequestKey(row.requestKey);
  if (action === "SAVE") {
    const expectedVersion = row.expectedVersion === null ? null : version(integer(row.expectedVersion));
    // Existing-row structural compatibility is not authority to invent unknowns:
    // the locked ordinary service verifies stable line/SKU and exact prior labels.
    return { actor, action, requestKey, expectedVersion, draft: draft(row.draft, expectedVersion !== null) };
  }
  return { actor, action, requestKey, expectedVersion: version(integer(row.expectedVersion)), transferId: id("transfer", row.transferId) };
}
