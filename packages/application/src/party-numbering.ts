import { requireDomain } from "../../domain/src/errors.ts";
import type { PartyCodeAllocator, PartyKind, PartyTransaction } from "./party-maintenance-ports.ts";

/** Technical PostgreSQL bigint sequence boundary, NOT an invented business code cap. */
export const PARTY_SEQUENCE_MAX = 9223372036854775807n;
const prefix = (kind: PartyKind): "KH" | "GYS" => {
  requireDomain(kind === "CUSTOMER" || kind === "SUPPLIER", "INVALID_PARTY_INPUT", "Unknown party numbering kind");
  return kind === "CUSTOMER" ? "KH" : "GYS";
};
function suffixNumber(digits: string): bigint {
  const canonical = digits.replace(/^0+/, "") || "0";
  const limit = PARTY_SEQUENCE_MAX.toString();
  requireDomain(canonical.length < limit.length || canonical.length === limit.length && canonical <= limit,
    "PARTY_CODE_EXHAUSTED", "Existing code or counter exhausts the technical signed-bigint sequence storage");
  return BigInt(canonical);
}
/** Pure exact-number calculation. The pg transaction must hold its matching kind lock. */
export function nextApprovedPartyNumber(kind: PartyKind, lastValue: string, isCalled: boolean, highestExistingCode: string | null): bigint {
  const expectedPrefix = prefix(kind);
  requireDomain(typeof lastValue === "string" && /^[1-9]\d*$/.test(lastValue) && typeof isCalled === "boolean", "INVALID_DATABASE_VALUE", "Invalid native sequence state");
  let next = suffixNumber(lastValue) + (isCalled ? 1n : 0n);
  if (highestExistingCode !== null) {
    requireDomain(typeof highestExistingCode === "string" && new RegExp(`^${expectedPrefix}[0-9]+$`).test(highestExistingCode), "INVALID_DATABASE_VALUE", "Wrong exact-prefix existing code supplied for allocation");
    const existing = suffixNumber(highestExistingCode.slice(expectedPrefix.length));
    if (existing >= next) next = existing + 1n;
  }
  requireDomain(next >= 1n && next <= PARTY_SEQUENCE_MAX, "PARTY_CODE_EXHAUSTED", "Party code sequence technical storage is exhausted; it cannot wrap");
  return next;
}
export function formatApprovedPartyCode(kind: PartyKind, number: bigint): string {
  const codePrefix = prefix(kind);
  requireDomain(typeof number === "bigint" && number >= 1n && number <= PARTY_SEQUENCE_MAX, "PARTY_CODE_EXHAUSTED", "Party code must fit the technical sequence storage without wrapping");
  return codePrefix + number.toString().padStart(6, "0");
}
/** Explicit host wiring for the user's approved independent KH/GYS scheme.
 * The transaction adapter, not request JSON, owns persistent reservation and concurrency. */
export function createApprovedPartyCodeAllocator(): PartyCodeAllocator {
  return Object.freeze({
    allocateCustomerCode: (tx: PartyTransaction) => tx.reserveCustomerCode(),
    allocateSupplierCode: (tx: PartyTransaction) => tx.reserveSupplierCode()
  });
}
