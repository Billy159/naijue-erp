import type { ActorContext } from "./ports.ts";
import type { MaintenanceEvidenceSession } from "./maintenance-commit-ports.ts";
/** B05 shared settings reads; physical party tables keep their existing independent APIs. */
export type OrganizationMaintenanceKind = "HALL" | "WAREHOUSE" | "STAFF" | "ACCOUNT" | "PAYMENT_METHOD" | "PAYMENT_ACCOUNT";
export interface OrganizationListQuery {
  readonly search: string; readonly status: "normal" | "disabled" | "all"; readonly hallId: string | null;
  readonly page: number; readonly pageSize: 20 | 50 | 100;
}
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
  readList(kind: OrganizationMaintenanceKind, query: OrganizationListQuery): Promise<OrganizationMaintenancePage>;
  readDetail(kind: OrganizationMaintenanceKind, id: string): Promise<OrganizationMaintenanceRecord | null>;
}
export interface OrganizationReadUnitOfWork { transaction<T>(work: (tx: OrganizationReadTransaction) => Promise<T>): Promise<T> }
export interface OrganizationReadService {
  list(actor: ActorContext, kind: OrganizationMaintenanceKind, input: unknown): Promise<OrganizationMaintenancePage>;
  detail(actor: ActorContext, kind: OrganizationMaintenanceKind, input: unknown): Promise<OrganizationMaintenanceRecord | null>;
}
