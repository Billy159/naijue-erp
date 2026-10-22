import type { ActorContext } from "./ports.ts";
import type { MaintenanceEvidenceSession, MaintenanceResult } from "./maintenance-commit-ports.ts";
export type CatalogueMaintenanceKind = "CATEGORY" | "COLOR" | "FIT";
export type CatalogueMaintenanceAction = "CREATE" | "EDIT" | "DISABLE" | "RESTORE" | "DELETE";
export interface CategoryWriteValues { readonly name: string; readonly parentId: string | null; readonly displayOrder: number }
export interface CatalogueEntryWriteValues { readonly name: string; readonly code: string; readonly enabled: boolean }
export type CatalogueWriteRecord = { readonly id: string; readonly version: number; readonly deletedAt: string | null } & (
  (CategoryWriteValues & { readonly kind: "CATEGORY" }) | (CatalogueEntryWriteValues & { readonly kind: "COLOR" | "FIT" })
);
export type CatalogueMaintenanceCommand = { readonly requestKey: string } & (
  { readonly action: "CREATE"; readonly values: CategoryWriteValues | CatalogueEntryWriteValues }
  | { readonly action: "EDIT"; readonly id: string; readonly expectedVersion: number; readonly values: CategoryWriteValues | CatalogueEntryWriteValues }
  | { readonly action: "DISABLE" | "RESTORE" | "DELETE"; readonly id: string; readonly expectedVersion: number }
);
export interface CatalogueMaintenanceTransaction {
  readonly evidence: MaintenanceEvidenceSession;
  lockDirectory(): Promise<void>;
  load(kind: CatalogueMaintenanceKind, id: string): Promise<CatalogueWriteRecord | undefined>;
  validateChange(previous: CatalogueWriteRecord | undefined, next: CatalogueWriteRecord): Promise<void>;
  assertUnreferenced(record: CatalogueWriteRecord): Promise<void>;
  put(previous: CatalogueWriteRecord | undefined, next: CatalogueWriteRecord): Promise<void>;
}
export interface CatalogueMaintenanceUnitOfWork { transaction<T>(work: (tx: CatalogueMaintenanceTransaction) => Promise<T>): Promise<T> }
export interface CatalogueMaintenanceDependencies {
  readonly unitOfWork: CatalogueMaintenanceUnitOfWork; readonly now: () => string;
  readonly newId: (kind: "category" | "color" | "fit" | "operation") => string;
}
export interface CatalogueMaintenanceService {
  execute(actor: ActorContext, kind: CatalogueMaintenanceKind, input: unknown): Promise<MaintenanceResult>;
  receipt(actor: ActorContext, kind: CatalogueMaintenanceKind, requestKey: string): Promise<{ readonly requestKey: string; readonly action: string; readonly status: "COMMITTED"; readonly completedAt: string; readonly result: MaintenanceResult }>;
}
