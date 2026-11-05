import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import type { EntityId } from "../../domain/src/values.ts";

export type RuntimeDocumentKind = "SALES" | "TRANSFER";
export interface RuntimeDocumentNumberInput {
  readonly kind: RuntimeDocumentKind;
  readonly documentId: EntityId<"sales"> | EntityId<"transfer">;
  readonly actorAccountId: EntityId<"account">;
}
/** Optional only for legacy source/test compositions. Production PG20+ adapters
 * supply this capability. Reserve after current reference checks, on preparation's
 * original transaction; a later SAVE validates its persisted mapping again. */
export interface RuntimeDocumentNumberTransaction {
  reserveRuntimeDocumentNumber?(input: RuntimeDocumentNumberInput): Promise<string>;
  assertRuntimeDocumentNumber?(input: RuntimeDocumentNumberInput & { readonly number: string }): Promise<void>;
}
export function checkedRuntimeDocumentNumberInput(input: RuntimeDocumentNumberInput): RuntimeDocumentNumberInput {
  requireDomain(input?.kind === "SALES" || input?.kind === "TRANSFER", "INVALID_DOCUMENT_NUMBER", "Known document number family required");
  return Object.freeze({ kind: input.kind, documentId: input.kind === "SALES" ? entityId("sales", input.documentId) : entityId("transfer", input.documentId),
    actorAccountId: entityId("account", input.actorAccountId) });
}
export function checkedAllocatedDocumentNumber(kind: RuntimeDocumentKind, value: unknown): string {
  requireDomain(kind === "SALES" || kind === "TRANSFER", "INVALID_DOCUMENT_NUMBER", "Known document number family required");
  const prefix = kind === "SALES" ? "V2-XS-" : "V2-DB-";
  requireDomain(typeof value === "string" && value.startsWith(prefix), "INVALID_DOCUMENT_NUMBER", "Expected database document number prefix");
  const digits = value.slice(prefix.length);
  requireDomain(/^\d{12,19}$/.test(digits) && BigInt(digits) > 0n && BigInt(digits) <= 9223372036854775807n
    && digits === BigInt(digits).toString().padStart(12, "0"), "INVALID_DOCUMENT_NUMBER", "Full positive bigint suffix with minimum twelve digits required");
  return value;
}
