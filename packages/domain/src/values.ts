import { requireDomain } from "./errors.ts";

declare const entityIdBrand: unique symbol;
export type EntityKind = "product" | "category" | "color" | "fit" | "size" | "sizeGroup" | "season"
  | "sku" | "barcode" | "customer" | "supplier" | "hall" | "warehouse" | "staff" | "account"
  | "paymentMethod" | "paymentAccount" | "sales" | "salesLine" | "settlement" | "transfer"
  | "transferLine" | "ledger" | "operation" | "audit";
export type EntityId<K extends EntityKind> = string & { readonly [entityIdBrand]: K };

export function entityId<K extends EntityKind>(_kind: K, value: string): EntityId<K> {
  requireDomain(typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value),
    "INVALID_ID", "Expected a lowercase canonical UUID-shaped internal identifier; no identifier is generated here");
  return value as EntityId<K>;
}

declare const quantityBrand: unique symbol;
export type Quantity = bigint & { readonly [quantityBrand]: true };
export const QUANTITY_MIN = -(2n ** 63n);
export const QUANTITY_MAX = 2n ** 63n - 1n;
const canonicalInteger = /^(?:0|[1-9]\d*|-[1-9]\d*)$/;

export function quantity(value: string): Quantity {
  requireDomain(typeof value === "string" && canonicalInteger.test(value), "INVALID_QUANTITY", "Quantity must be an exact canonical integer string");
  return checkedQuantity(BigInt(value));
}

export function checkedQuantity(value: bigint): Quantity {
  requireDomain(typeof value === "bigint" && value >= QUANTITY_MIN && value <= QUANTITY_MAX,
    "QUANTITY_OVERFLOW", "Quantity exceeds the signed bigint storage boundary");
  return value as Quantity;
}

export function addQuantity(a: Quantity, b: Quantity): Quantity { return checkedQuantity(a + b); }
export function negateQuantity(value: Quantity): Quantity { return checkedQuantity(-value); }

declare const moneyBrand: unique symbol;
/** Exact minor-unit integer. Scale/monetary cap are not silently selected by this type. */
export type MinorAmount = bigint & { readonly [moneyBrand]: true };
export function minorAmount(value: string): MinorAmount {
  requireDomain(typeof value === "string" && canonicalInteger.test(value), "INVALID_MONEY", "Amount must be an exact canonical minor-unit integer string");
  return BigInt(value) as MinorAmount;
}
export function addMoney(a: MinorAmount, b: MinorAmount): MinorAmount { return (a + b) as MinorAmount; }
export function negateMoney(value: MinorAmount): MinorAmount { return (-value) as MinorAmount; }
export function multiplyMoney(price: MinorAmount, count: Quantity): MinorAmount { return (price * count) as MinorAmount; }

/** Caller supplies a confirmed scale; optional cap belongs to that confirmed boundary, not a guessed business maximum. */
export function decimalToMinor(value: string, policy: { readonly scale: number; readonly maxAbsMinor?: bigint }): MinorAmount {
  requireDomain(Number.isSafeInteger(policy.scale) && policy.scale >= 0 && policy.scale <= 20,
    "INVALID_MONEY_SCALE", "Utility scale must be an integer from 0 to 20; no production scale is configured");
  requireDomain(policy.maxAbsMinor === undefined || policy.maxAbsMinor >= 0n, "INVALID_MONEY_LIMIT", "An explicit amount limit cannot be negative");
  requireDomain(typeof value === "string" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value), "INVALID_MONEY", "Expected an exact decimal string without exponent notation");
  const negative = value.startsWith("-");
  const [whole = "", fraction = ""] = (negative ? value.slice(1) : value).split(".");
  requireDomain(fraction.length <= policy.scale, "MONEY_PRECISION", "Extra precision must be rejected, never rounded");
  const magnitude = BigInt(whole) * 10n ** BigInt(policy.scale) + BigInt(fraction.padEnd(policy.scale, "0") || "0");
  requireDomain(policy.maxAbsMinor === undefined || magnitude <= policy.maxAbsMinor, "MONEY_OVERFLOW", "Amount exceeds the caller's explicit boundary");
  return (negative ? -magnitude : magnitude) as MinorAmount;
}

declare const versionBrand: unique symbol;
export type Version = number & { readonly [versionBrand]: true };
export function version(value: number): Version {
  requireDomain(Number.isSafeInteger(value) && value >= 1, "INVALID_VERSION", "Expected a positive safe integer version");
  return value as Version;
}
export function nextVersion(value: Version): Version { return version(value + 1); }

declare const dateBrand: unique symbol;
export type BusinessDate = string & { readonly [dateBrand]: true };
export function businessDate(value: string): BusinessDate {
  requireDomain(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"))
    && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value,
  "INVALID_BUSINESS_DATE", "Expected an actual ISO calendar date");
  return value as BusinessDate;
}
