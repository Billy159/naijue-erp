import type { ActorContext } from "./ports.ts";
import type { MaintenanceEvidenceSession, MaintenanceResult } from "./maintenance-commit-ports.ts";
export type CatalogueMaintenanceKind = "CATEGORY" | "COLOR" | "FIT";
export type CategoryOrderAction = "REORDER" | "UNDO_REORDER";
export type CatalogueMaintenanceAction = "CREATE" | "EDIT" | "DISABLE" | "RESTORE" | "DELETE" | CategoryOrderAction;
export interface CategoryWriteValues { readonly name: string; readonly parentId: string | null; readonly displayOrder: number }
export interface CatalogueEntryWriteValues { readonly name: string; readonly code: string; readonly enabled: boolean }
export type CatalogueWriteRecord = { readonly id: string; readonly version: number; readonly deletedAt: string | null } & (
  (CategoryWriteValues & { readonly kind: "CATEGORY" }) | (CatalogueEntryWriteValues & { readonly kind: "COLOR" | "FIT" })
);
export interface CategoryOrderExpected { readonly id: string; readonly expectedVersion: number }
export interface CategoryOrderMember { readonly id: string; readonly version: number; readonly displayOrder: number }
export interface CategoryOrderEvidence {
  readonly parent_id: string | null; readonly moved_id: string; readonly undo_of_operation_id: string | null;
  /** Canonical UUID order for immutable evidence; not a second display order. */
  readonly rows: readonly { readonly id: string; readonly version: number; readonly display_order: number }[];
}
export interface CategoryOrderResult extends MaintenanceResult {
  readonly kind: "CATEGORY";
  readonly order: { readonly parentId: string | null; readonly undoOfOperationId: string | null; readonly members: readonly CategoryOrderMember[] };
}
export type CatalogueMaintenanceResult = MaintenanceResult | CategoryOrderResult;
export type CategoryOrderCommand = { readonly requestKey: string; readonly expectedSiblings: readonly CategoryOrderExpected[] } & (
  { readonly action: "REORDER"; readonly parentId: string | null; readonly movedId: string; readonly orderedIds: readonly string[] }
  | { readonly action: "UNDO_REORDER"; readonly originalOperationId: string }
);
export type CatalogueSingleMaintenanceCommand = { readonly requestKey: string } & (
  { readonly action: "CREATE"; readonly values: CategoryWriteValues | CatalogueEntryWriteValues }
  | { readonly action: "EDIT"; readonly id: string; readonly expectedVersion: number; readonly values: CategoryWriteValues | CatalogueEntryWriteValues }
  | { readonly action: "DISABLE" | "RESTORE" | "DELETE"; readonly id: string; readonly expectedVersion: number }
);
export type CatalogueMaintenanceCommand = CatalogueSingleMaintenanceCommand | CategoryOrderCommand;
export type CategoryWriteRecord = Extract<CatalogueWriteRecord, { readonly kind: "CATEGORY" }>;
export interface CategoryOrderOriginal {
  readonly actorAccountId: string; readonly result: CategoryOrderResult;
  readonly before: CategoryOrderEvidence; readonly after: CategoryOrderEvidence;
}
export interface CategoryOrderTransaction {
  assertReady(): Promise<void>;
  loadSiblings(parentId: string | null): Promise<readonly CategoryWriteRecord[]>;
  loadOriginal(operationId: string, actorAccountId: string): Promise<CategoryOrderOriginal | undefined>;
  put(previous: CategoryWriteRecord, next: CategoryWriteRecord): Promise<void>;
}
export interface CatalogueMaintenanceTransaction {
  readonly evidence: MaintenanceEvidenceSession;
  lockDirectory(): Promise<void>;
  load(kind: CatalogueMaintenanceKind, id: string): Promise<CatalogueWriteRecord | undefined>;
  validateChange(previous: CatalogueWriteRecord | undefined, next: CatalogueWriteRecord): Promise<void>;
  assertUnreferenced(record: CatalogueWriteRecord): Promise<void>;
  put(previous: CatalogueWriteRecord | undefined, next: CatalogueWriteRecord): Promise<void>;
  /** Present only when the trusted host supplied the exact v15 write capability. */
  readonly categoryOrder?: CategoryOrderTransaction;
}
export interface CatalogueMaintenanceUnitOfWork { transaction<T>(work: (tx: CatalogueMaintenanceTransaction) => Promise<T>): Promise<T> }
export interface CatalogueMaintenanceDependencies {
  readonly unitOfWork: CatalogueMaintenanceUnitOfWork; readonly now: () => string;
  readonly newId: (kind: "category" | "color" | "fit" | "operation") => string;
}
export interface CatalogueMaintenanceService {
  execute(actor: ActorContext, kind: CatalogueMaintenanceKind, input: unknown): Promise<CatalogueMaintenanceResult>;
  receipt(actor: ActorContext, kind: CatalogueMaintenanceKind, requestKey: string): Promise<{ readonly requestKey: string; readonly action: string; readonly status: "COMMITTED"; readonly completedAt: string; readonly result: CatalogueMaintenanceResult }>;
}
