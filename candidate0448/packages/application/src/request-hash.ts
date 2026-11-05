import { createHash } from "node:crypto";
import { canonicalRequestValue } from "./canonical-request-value.ts";

/** Backend-only idempotency fingerprint: unchanged SHA256 over the exact typed
 * canonical encoding. Shared/browser validation must import the pure encoder. */
export function requestHash(value: unknown): string {
  return createHash("sha256").update(canonicalRequestValue(value)).digest("hex");
}
