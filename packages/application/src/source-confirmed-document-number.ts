import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";

/** CREATE-only parity with frozen server/domain/transactions/command.ts:227–245.
 * This is not daily sequencing, a number reservation, a uniqueness guarantee, an
 * authorization grant or a prepared document. Preserve the stored number on SAVE.
 * The caller must retain the same document ID and resulting number across retries.
 * Prefix matching deliberately precedes trimming, exactly as in the frozen source.
 */
export function sourceConfirmedCreateDocumentNumber(
  kind: "SALE" | "TRANSFER", documentId: string, sourceNumber?: unknown
): string {
  requireDomain(kind === "SALE" || kind === "TRANSFER", "INVALID_BUSINESS_TYPE", "Unsupported document kind");
  entityId(kind === "SALE" ? "sales" : "transfer", documentId);
  return typeof sourceNumber === "string" && sourceNumber.trim() && !/^(?:unsaved-|草稿-)/.test(sourceNumber)
    ? sourceNumber.trim() : `V2-${kind === "SALE" ? "XS" : "DB"}-${documentId.slice(0, 8)}`;
}
