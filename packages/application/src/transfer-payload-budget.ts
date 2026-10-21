/** Bounded shared transport policy for native manual-transfer preparation.
 * 128 KiB accommodates 200 canonical SKU/quantity selections and a 10,000-code-
 * unit note even when JSON escapes every unit. 512 KiB allows ordinary expanded
 * snapshots without unbounded transport. Long native labels are admitted by
 * actual serialized UTF-8 bytes, not guessed character sizes or truncation. */
export const TRANSFER_PREPARE_MAX_REQUEST_BYTES = 131_072;
export const TRANSFER_COMMAND_MAX_REQUEST_BYTES = 524_288;
export const TRANSFER_PREPARED_RESPONSE_MAX_BYTES = TRANSFER_COMMAND_MAX_REQUEST_BYTES - 1_024;
export const TRANSFER_PREPARE_MAX_LINES = 200;
export const TRANSFER_PREPARE_MAX_NOTE_LENGTH = 10_000;

export function transferJsonByteLength(value: unknown): number {
  const json = JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString() : item);
  if (json === undefined) throw new TypeError("Transfer payload must be JSON serializable");
  return new TextEncoder().encode(json).byteLength;
}
/** Use the maximum accepted ASCII request key and numeric version. The bound
 * covers CREATE (null) and later SAVE envelope overhead, independent of key order.
 * No request key is generated here; these bytes are only an admission calculation. */
export function transferPreparedDraftFitsSaveBudget(draft: unknown): boolean {
  return transferJsonByteLength(draft) <= TRANSFER_PREPARED_RESPONSE_MAX_BYTES
    && transferJsonByteLength({ action: "SAVE", requestKey: "K".repeat(200), expectedVersion: Number.MAX_SAFE_INTEGER, draft }) <= TRANSFER_COMMAND_MAX_REQUEST_BYTES;
}
