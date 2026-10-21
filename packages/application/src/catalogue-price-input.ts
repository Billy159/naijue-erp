import { requireDomain } from "../../domain/src/errors.ts";
import { decimalToMinor } from "../../domain/src/values.ts";

/** Approved product-level storage keys. An absent key is unknown, not unset. */
export const CATALOGUE_PRICE_KEYS = Object.freeze([
  "purchase_price", "retail_price", "wholesale5_price", "wholesale6_price", "wholesale7_price",
  "wholesale8_price", "wholesale9_price", "wholesale10_price", "minimum_price"
] as const);
export type CataloguePriceKey = typeof CATALOGUE_PRICE_KEYS[number];
export type CompleteCataloguePrices = Readonly<Record<CataloguePriceKey, string | null>>;
export const CATALOGUE_PRICE_VALIDATOR_VERSION = "NINE_PRICE_EXPLICIT_V1";
/** decimal(18,2) is the existing SQL boundary, not an invented business cap. */
export function validateCompleteCataloguePrices(input: unknown): CompleteCataloguePrices {
  requireDomain(input !== null && typeof input === "object" && !Array.isArray(input),
    "INCOMPLETE_CATALOGUE_PRICE_INPUT", "Explicit nine-key price input is required");
  const record = input as Record<string, unknown>;
  requireDomain(Object.keys(record).length === CATALOGUE_PRICE_KEYS.length && CATALOGUE_PRICE_KEYS.every(key => Object.hasOwn(record, key)),
    "INCOMPLETE_CATALOGUE_PRICE_INPUT", "All and only nine approved price keys must be supplied");
  const result = {} as Record<CataloguePriceKey, string | null>;
  for (const key of CATALOGUE_PRICE_KEYS) {
    const value = record[key];
    if (value === null) { result[key] = null; continue; }
    requireDomain(typeof value === "string" && value.length <= 19 && /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value),
      "INVALID_CATALOGUE_PRICE_INPUT", "Price must be explicit null or an exact nonnegative decimal string");
    const minor = decimalToMinor(value, { scale: 2, maxAbsMinor: 999999999999999999n });
    result[key] = `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`;
  }
  return Object.freeze(result);
}
