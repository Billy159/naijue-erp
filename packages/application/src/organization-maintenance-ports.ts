import type { ActorContext } from "./ports.ts";
import type { MaintenanceEvidenceSession, MaintenanceResult } from "./maintenance-commit-ports.ts";
/** B05 shared settings reads; physical party tables keep their existing independent APIs. */
export type OrganizationMaintenanceKind = "HALL" | "WAREHOUSE" | "STAFF" | "ACCOUNT" | "PAYMENT_METHOD" | "PAYMENT_ACCOUNT";
export interface OrganizationListQuery {
  readonly search: string; readonly status: "normal" | "disabled" | "all"; readonly hallId: string | null;
  readonly page: number; readonly pageSize: 20 | 50 | 100;
}
/** Additive STAFF-only role filter; legacy five-field queries remain unchanged. */
export type StaffRoleFilter = "" | "ADMIN" | "WAREHOUSE" | "SALESPERSON";
export interface StaffRoleListQuery extends OrganizationListQuery { readonly role: StaffRoleFilter }
/** PAYMENT_ACCOUNT-only exact existing method identity; null retains all methods. */
export interface PaymentAccountMethodListQuery extends OrganizationListQuery { readonly paymentMethodId: string | null }
export type OrganizationReadListQuery = OrganizationListQuery | StaffRoleListQuery | PaymentAccountMethodListQuery;
export interface OrganizationReference { readonly id: string; readonly name: string; readonly enabled: boolean }
interface Base { readonly id: string; readonly version: number; readonly createdAt: string | null; readonly updatedAt: string | null }
export type OrganizationMaintenanceRecord =
  | (Base & { readonly kind: "HALL"; readonly name: string; readonly enabled: boolean; readonly defaultCustomer: OrganizationReference | null;
    readonly defaultSalesWarehouse: (OrganizationReference & { readonly hallId: string }) | null })
  | (Base & { readonly kind: "WAREHOUSE"; readonly name: string; readonly enabled: boolean; readonly hall: OrganizationReference })
  | (Base & { readonly kind: "STAFF"; readonly name: string; readonly hall: OrganizationReference | null; readonly role: string; readonly contact: string | null;
    readonly employmentStatus: string; readonly account: { readonly id: string; readonly loginName: string; readonly loginEnabled: boolean; readonly authVersion: number; readonly version: number } | null })
  | (Base & { readonly kind: "ACCOUNT"; readonly loginName: string; readonly loginEnabled: boolean; readonly authVersion: number;
    readonly staff: { readonly id: string; readonly name: string; readonly role: string; readonly employmentStatus: string; readonly hallId: string | null } })
  | (Base & { readonly kind: "PAYMENT_METHOD"; readonly name: string; readonly enabled: boolean })
  | (Base & { readonly kind: "PAYMENT_ACCOUNT"; readonly name: string; readonly enabled: boolean; readonly paymentMethod: OrganizationReference;
    readonly halls: readonly OrganizationReference[] });
export interface OrganizationMaintenancePage { readonly kind: OrganizationMaintenanceKind; readonly page: number; readonly pageSize: 20 | 50 | 100; readonly total: number; readonly items: readonly OrganizationMaintenanceRecord[] }
export interface OrganizationReadTransaction {
  readonly evidence: MaintenanceEvidenceSession;
  readList(kind: OrganizationMaintenanceKind, query: OrganizationReadListQuery): Promise<OrganizationMaintenancePage>;
  readDetail(kind: OrganizationMaintenanceKind, id: string): Promise<OrganizationMaintenanceRecord | null>;
}
export interface OrganizationReadUnitOfWork { transaction<T>(work: (tx: OrganizationReadTransaction) => Promise<T>): Promise<T> }
export interface OrganizationReadService {
  list(actor: ActorContext, kind: OrganizationMaintenanceKind, input: unknown): Promise<OrganizationMaintenancePage>;
  detail(actor: ActorContext, kind: OrganizationMaintenanceKind, input: unknown): Promise<OrganizationMaintenanceRecord | null>;
}

/** Hall/warehouse command contract is separate from the frozen six-family read DTO. */
export type OrganizationWriteKind = "HALL" | "WAREHOUSE";
export type OrganizationWriteAction = "CREATE" | "EDIT" | "DISABLE" | "RESTORE";
export interface HallWriteValues { readonly name: string; readonly enabled: boolean; readonly defaultCustomerId: string | null; readonly defaultSalesWarehouseId: string | null }
export interface WarehouseWriteValues { readonly name: string; readonly enabled: boolean; readonly hallId: string }
export type OrganizationWriteRecord =
  | (HallWriteValues & { readonly kind: "HALL"; readonly id: string; readonly version: number })
  | (WarehouseWriteValues & { readonly kind: "WAREHOUSE"; readonly id: string; readonly version: number; readonly createdOperationId: string | null });
export type OrganizationWriteCommand = { readonly requestKey: string } & (
  { readonly action: "CREATE"; readonly values: HallWriteValues | WarehouseWriteValues }
  | { readonly action: "EDIT"; readonly id: string; readonly expectedVersion: number; readonly values: HallWriteValues | WarehouseWriteValues }
  | { readonly action: "DISABLE" | "RESTORE"; readonly id: string; readonly expectedVersion: number }
);
export interface OrganizationWriteTransaction {
  readonly evidence: MaintenanceEvidenceSession;
  /** Serialize topology changes before current identity obtains hall row locks. */
  lockTopology(): Promise<void>;
  load(kind: OrganizationWriteKind, id: string): Promise<OrganizationWriteRecord | undefined>;
  validateChange(previous: OrganizationWriteRecord | undefined, next: OrganizationWriteRecord): Promise<void>;
  put(previous: OrganizationWriteRecord | undefined, next: OrganizationWriteRecord): Promise<void>;
}
export interface OrganizationWriteUnitOfWork { transaction<T>(work: (tx: OrganizationWriteTransaction) => Promise<T>): Promise<T> }
export interface OrganizationWriteDependencies {
  readonly unitOfWork: OrganizationWriteUnitOfWork; readonly now: () => string;
  readonly newId: (kind: "hall" | "warehouse" | "operation") => string;
}
export interface OrganizationWriteService {
  execute(actor: ActorContext, kind: OrganizationWriteKind, input: unknown): Promise<MaintenanceResult>;
  receipt(actor: ActorContext, kind: OrganizationWriteKind, requestKey: string): Promise<{ readonly requestKey: string; readonly action: string; readonly status: "COMMITTED"; readonly completedAt: string; readonly result: MaintenanceResult }>;
}
