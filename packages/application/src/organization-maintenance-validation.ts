import { DomainError, requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import type { OrganizationListQuery, OrganizationMaintenanceKind, OrganizationMaintenanceRecord, OrganizationReference } from "./organization-maintenance-ports.ts";
const kinds: readonly string[] = ["HALL", "WAREHOUSE", "STAFF", "ACCOUNT", "PAYMENT_METHOD", "PAYMENT_ACCOUNT"];
function invalid(): never { throw new DomainError("INVALID_ORGANIZATION_QUERY", "Invalid settings read parameters"); }
function bag(value: unknown): Record<string, unknown> { requireDomain(value !== null && typeof value === "object" && !Array.isArray(value), "INVALID_DATABASE_VALUE", "Invalid trusted settings record"); return value as Record<string, unknown>; }
function uuid(value: unknown): string { requireDomain(typeof value === "string", "INVALID_DATABASE_VALUE", "Missing native reference id"); return entityId("hall", value); }
function text(value: unknown): string { requireDomain(typeof value === "string" && value.trim().length > 0, "INVALID_DATABASE_VALUE", "Missing native label"); return value; }
function bool(value: unknown): boolean { requireDomain(typeof value === "boolean", "INVALID_DATABASE_VALUE", "Missing native state"); return value; }
function version(value: unknown): number { requireDomain(typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 2147483647, "INVALID_DATABASE_VALUE", "Invalid native version"); return value; }
function stamp(value: unknown): string | null { requireDomain(value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)) && /Z$/.test(value)), "INVALID_DATABASE_VALUE", "Invalid real account timestamp"); return value; }
function ref(value: unknown): OrganizationReference { const r = bag(value); return { id: uuid(r.id), name: text(r.name), enabled: bool(r.enabled) }; }
export function organizationKind(value: unknown): OrganizationMaintenanceKind { if (typeof value !== "string" || !kinds.includes(value)) invalid(); return value as OrganizationMaintenanceKind; }
export function parseOrganizationDetailQuery(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype
    || Reflect.ownKeys(input).length !== 1 || !Object.hasOwn(input, "id")) invalid();
  try { return uuid((input as Record<string, unknown>).id); } catch { return invalid(); }
}
export function parseOrganizationListQuery(input: unknown, kind: OrganizationMaintenanceKind): OrganizationListQuery {
  organizationKind(kind);
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) invalid();
  const r = input as Record<string, unknown>, keys = ["search", "status", "hallId", "page", "pageSize"];
  if (Reflect.ownKeys(r).length !== keys.length || !keys.every(k => Object.hasOwn(r, k)) || typeof r.search !== "string" || r.search.length > 200 || r.search.includes("\0")
    || !["normal", "disabled", "all"].includes(r.status as string) || typeof r.page !== "number" || !Number.isSafeInteger(r.page) || r.page < 1
    || (r.pageSize !== 20 && r.pageSize !== 50 && r.pageSize !== 100) || !Number.isSafeInteger((r.page - 1) * r.pageSize)) invalid();
  let hallId: string | null = null;
  try { if (r.hallId !== null) { if (typeof r.hallId !== "string") invalid(); hallId = entityId("hall", r.hallId); } } catch { invalid(); }
  if (kind === "PAYMENT_METHOD" && hallId !== null) invalid();
  return { search: r.search, status: r.status as OrganizationListQuery["status"], hallId, page: r.page, pageSize: r.pageSize };
}
/** Projection rejects malformed facts and removes provider-only fields, including credentials. */
export function projectOrganizationRecord(input: unknown, kind: OrganizationMaintenanceKind): OrganizationMaintenanceRecord {
  const r = bag(input); requireDomain(r.kind === kind, "INVALID_DATABASE_VALUE", "Mismatched settings kind");
  const base = { id: uuid(r.id), version: version(r.version), createdAt: stamp(r.createdAt), updatedAt: stamp(r.updatedAt) };
  if (kind !== "ACCOUNT") requireDomain(base.createdAt === null && base.updatedAt === null, "INVALID_DATABASE_VALUE", "Native settings table has no creation timestamp");
  switch (kind) {
    case "HALL": {
      const warehouse = r.defaultSalesWarehouse === null ? null : bag(r.defaultSalesWarehouse);
      return { ...base, kind, name: text(r.name), enabled: bool(r.enabled), defaultCustomer: r.defaultCustomer === null ? null : ref(r.defaultCustomer),
        defaultSalesWarehouse: warehouse === null ? null : { ...ref(warehouse), hallId: uuid(warehouse.hallId) } };
    }
    case "WAREHOUSE": return { ...base, kind, name: text(r.name), enabled: bool(r.enabled), hall: ref(r.hall) };
    case "STAFF": {
      const a = r.account === null ? null : bag(r.account);
      requireDomain(r.contact === null || typeof r.contact === "string", "INVALID_DATABASE_VALUE", "Invalid staff contact");
      return { ...base, kind, name: text(r.name), hall: r.hall === null ? null : ref(r.hall), role: text(r.role), contact: r.contact as string | null, employmentStatus: text(r.employmentStatus),
        account: a === null ? null : { id: uuid(a.id), loginName: text(a.loginName), loginEnabled: bool(a.loginEnabled), authVersion: version(a.authVersion), version: version(a.version) } };
    }
    case "ACCOUNT": {
      const s = bag(r.staff); requireDomain(base.createdAt !== null && base.updatedAt !== null, "INVALID_DATABASE_VALUE", "Actual account timestamps required");
      return { ...base, kind, loginName: text(r.loginName), loginEnabled: bool(r.loginEnabled), authVersion: version(r.authVersion), staff: {
        id: uuid(s.id), name: text(s.name), role: text(s.role), employmentStatus: text(s.employmentStatus), hallId: s.hallId === null ? null : uuid(s.hallId) } };
    }
    case "PAYMENT_METHOD": return { ...base, kind, name: text(r.name), enabled: bool(r.enabled) };
    case "PAYMENT_ACCOUNT": {
      requireDomain(Array.isArray(r.halls) && r.halls.length <= 5000, "INVALID_DATABASE_VALUE", "Invalid bounded account hall references");
      const halls = r.halls.map(ref), ids = new Set(halls.map(h => h.id)); requireDomain(ids.size === halls.length, "INVALID_DATABASE_VALUE", "Duplicate account/hall relation");
      return { ...base, kind, name: text(r.name), enabled: bool(r.enabled), paymentMethod: ref(r.paymentMethod), halls };
    }
  }
}
