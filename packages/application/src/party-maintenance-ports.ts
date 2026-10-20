import type { EntityId, EntityKind, Version } from "../../domain/src/values.ts";
import type { ActorContext } from "./ports.ts";

/** A closed pair of physically independent master tables, never a dual-role subject. */
export type PartyKind = "CUSTOMER" | "SUPPLIER";
export type PartyAction = "CREATE" | "EDIT" | "DISABLE" | "RESTORE";
export type PartyRole = "ADMIN" | "WAREHOUSE" | "SALESPERSON";
export interface PartyActor extends ActorContext { readonly role: PartyRole }
export interface CustomerRecord { readonly id: EntityId<"customer">; readonly code: string; readonly name: string; readonly enabled: boolean; readonly version: Version; readonly createdAt: string | null; readonly updatedAt: string | null }
export interface SupplierRecord { readonly id: EntityId<"supplier">; readonly code: string; readonly name: string; readonly enabled: boolean; readonly version: Version; readonly createdAt: string | null; readonly updatedAt: string | null }
export type PartyRecord = CustomerRecord | SupplierRecord;
export type PartyCommand = { readonly kind: PartyKind; readonly actor: PartyActor; readonly requestKey: string } & (
  { readonly action: "CREATE"; readonly name: string }
  | { readonly action: "EDIT"; readonly id: string; readonly expectedVersion: Version; readonly name: string }
  | { readonly action: "DISABLE" | "RESTORE"; readonly id: string; readonly expectedVersion: Version }
);
export interface PartyResult { readonly operationId: EntityId<"operation">; readonly kind: PartyKind; readonly partyId: string; readonly version: Version; readonly code: string; readonly enabled: boolean }
export interface PartyReceipt { readonly id: EntityId<"operation">; readonly actorAccountId: EntityId<"account">; readonly requestKey: string; readonly requestHash: string; readonly kind: PartyKind; readonly action: PartyAction; readonly targetId: string; readonly result: PartyResult; readonly completedAt: string }
/** Only native values that changed. version is always included; creation has four initial values. */
export interface PartyAuditValues { readonly version: Version; readonly code?: string; readonly name?: string; readonly enabled?: boolean }
export interface PartyAudit { readonly id: EntityId<"audit">; readonly operationId: EntityId<"operation">; readonly actorAccountId: EntityId<"account">; readonly kind: PartyKind; readonly targetId: string; readonly action: PartyAction; readonly before: PartyAuditValues | null; readonly after: PartyAuditValues; readonly occurredAt: string }
export interface PartySearch { readonly search: string; readonly enabled: "ALL" | "ENABLED" | "DISABLED"; readonly page: number; readonly pageSize: 20 | 50 | 100 }
export interface PartyPage<T> { readonly items: readonly T[]; readonly total: number; readonly page: number; readonly pageSize: 20 | 50 | 100 }
export interface PartyCandidate { readonly id: string; readonly code: string; readonly name: string }
export interface PartyTransaction {
  /** Global actor/key lock shared with sales and transfer. Other kinds cause IDEMPOTENCY_CONFLICT. */
  getReceipt(actor: EntityId<"account">, requestKey: string, kind: PartyKind): Promise<PartyReceipt | undefined>;
  getCustomer(id: EntityId<"customer">): Promise<CustomerRecord | undefined>;
  getSupplier(id: EntityId<"supplier">): Promise<SupplierRecord | undefined>;
  /** Reserve one approved KH/GYS code for the loaded new row. Counters may gap on rollback. */
  reserveCustomerCode(): Promise<string>;
  reserveSupplierCode(): Promise<string>;
  putCustomer(row: CustomerRecord): Promise<void>;
  putSupplier(row: SupplierRecord): Promise<void>;
  /** Must be a trusted current dependency check in the command transaction. */
  customerIsEnabledHallDefault(id: EntityId<"customer">): Promise<boolean>;
  searchCustomers(query: PartySearch): Promise<PartyPage<CustomerRecord>>;
  searchSuppliers(query: PartySearch): Promise<PartyPage<SupplierRecord>>;
  appendAudit(row: PartyAudit): Promise<void>;
  insertReceipt(row: PartyReceipt): Promise<void>;
}
export interface PartyUnitOfWork { transaction<T>(work: (tx: PartyTransaction) => Promise<T>): Promise<T> }
export type PartyIntent = PartyAction | "LIST" | "DETAIL" | "CANDIDATES" | "RECEIPT";
export interface PartyAuthorization { assertAllowed(actor: PartyActor, kind: PartyKind, intent: PartyIntent, tx: PartyTransaction): Promise<void> }
/** Explicit trusted server allocator. createApprovedPartyCodeAllocator wires the user-approved
 * independent KH/GYS counters. Test providers remain explicit, never production defaults.
 * Reservations may leave rollback gaps; existing codes are immutable. */
export interface PartyCodeAllocator { allocateCustomerCode(tx: PartyTransaction): Promise<string>; allocateSupplierCode(tx: PartyTransaction): Promise<string> }
export interface PartyDependencies { readonly unitOfWork: PartyUnitOfWork; readonly authorization: PartyAuthorization; readonly codes: PartyCodeAllocator; readonly now: () => string; readonly newId: <K extends EntityKind>(kind: K) => EntityId<K> }
