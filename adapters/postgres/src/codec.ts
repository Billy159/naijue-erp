import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { decimalToMinor, quantity, version } from "../../../packages/domain/src/values.ts";
import type { MinorAmount, Quantity, Version } from "../../../packages/domain/src/values.ts";

/** Approved catalogue storage: decimal(18,2); domain values remain integer minor units. */
export function moneyToSql(value: MinorAmount): string {
  const magnitude = value < 0n ? -value : value;
  requireDomain(magnitude <= 999999999999999999n, "MONEY_STORAGE_OVERFLOW", "Value exceeds approved decimal(18,2) storage; it must not be rounded or truncated");
  const digits = magnitude.toString().padStart(3, "0");
  return `${value < 0n ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
export function moneyFromSql(value: unknown): MinorAmount {
  requireDomain(typeof value === "string", "INVALID_DATABASE_VALUE", "Exact SQL numeric text is required");
  const amount = decimalToMinor(value, { scale: 2 });
  moneyToSql(amount);
  return amount;
}
export function quantityFromSql(value: unknown): Quantity {
  requireDomain(typeof value === "string", "INVALID_DATABASE_VALUE", "Exact SQL bigint text is required");
  return quantity(value);
}
export function versionToSql(value: Version): number {
  requireDomain(value <= 2147483647, "VERSION_STORAGE_OVERFLOW", "Version exceeds the approved PostgreSQL integer storage boundary");
  return value;
}
export function versionFromSql(value: unknown): Version {
  requireDomain(typeof value === "number", "INVALID_DATABASE_VALUE", "SQL integer version is required");
  return version(versionToSql(version(value)));
}
/** Audit bigint strings are explicitly integer minor units/quantities, never JSON floats. */
export function auditJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString() : item);
}
export function jsonObject(value: unknown): Record<string, unknown> {
  const decoded: unknown = typeof value === "string" ? JSON.parse(value) : value;
  requireDomain(typeof decoded === "object" && decoded !== null && !Array.isArray(decoded), "INVALID_DATABASE_VALUE", "Expected a JSON object");
  return decoded as Record<string, unknown>;
}
export function stringValue(value: unknown): string {
  requireDomain(typeof value === "string", "INVALID_DATABASE_VALUE", "Expected database text");
  return value;
}
export function nullableString(value: unknown): string | null { return value === null ? null : stringValue(value); }
export function booleanValue(value: unknown): boolean {
  requireDomain(typeof value === "boolean", "INVALID_DATABASE_VALUE", "Expected database boolean");
  return value;
}
export function integerValue(value: unknown): number {
  requireDomain(typeof value === "number" && Number.isSafeInteger(value), "INVALID_DATABASE_VALUE", "Expected database integer");
  return value;
}
