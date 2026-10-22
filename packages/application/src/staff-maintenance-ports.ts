import type { ActorContext } from "./ports.ts";
import type { MaintenanceEvidenceSession, MaintenanceResult } from "./maintenance-commit-ports.ts";
import type { AccountMaintenanceCredentials, AccountMaintenanceRecord } from "./account-maintenance-ports.ts";
export interface StaffWriteValues { readonly name: string; readonly role: "ADMIN" | "WAREHOUSE" | "SALESPERSON"; readonly hallId: string | null; readonly contact: string | null }
export interface StaffMaintenanceRecord { readonly id: string; readonly name: string; readonly role: string; readonly hallId: string | null; readonly contact: string | null; readonly employmentStatus: string; readonly version: number }
export interface StaffMaintenanceAggregate { readonly staff: StaffMaintenanceRecord; readonly account: AccountMaintenanceRecord | null }
export interface StaffAccountInput { readonly id: string | null; readonly expectedVersion: number | null; readonly loginName: string; readonly loginEnabled: boolean; readonly password: string | null }
export type StaffMaintenanceCommand = { readonly requestKey: string } & (
  { readonly action: "CREATE"; readonly values: StaffWriteValues; readonly account: StaffAccountInput | null }
  | { readonly action: "EDIT"; readonly id: string; readonly expectedVersion: number; readonly values: StaffWriteValues; readonly account: StaffAccountInput | null }
  | { readonly action: "LEAVE" | "REINSTATE"; readonly id: string; readonly expectedVersion: number }
);
export interface StaffMaintenanceTransaction {
  readonly evidence: MaintenanceEvidenceSession;
  load(id: string): Promise<StaffMaintenanceAggregate | undefined>;
  validateChange(previous: StaffMaintenanceAggregate | undefined, next: StaffMaintenanceAggregate): Promise<void>;
  putStaff(previous: StaffMaintenanceRecord | undefined, next: StaffMaintenanceRecord): Promise<void>;
  putAccount(previous: AccountMaintenanceRecord | null, next: AccountMaintenanceRecord, passwordHash: string | null): Promise<void>;
}
export interface StaffMaintenanceUnitOfWork { transaction<T>(work: (tx: StaffMaintenanceTransaction) => Promise<T>): Promise<T> }
export interface StaffMaintenanceDependencies {
  readonly unitOfWork: StaffMaintenanceUnitOfWork; readonly now: () => string; readonly credentials: AccountMaintenanceCredentials | null;
  readonly newId: (kind: "staff" | "account" | "operation") => string;
}
export interface StaffMaintenanceService {
  execute(actor: ActorContext, input: unknown): Promise<MaintenanceResult>;
  receipt(actor: ActorContext, requestKey: string): Promise<{ readonly requestKey: string; readonly action: string; readonly status: "COMMITTED"; readonly completedAt: string; readonly result: MaintenanceResult }>;
}
