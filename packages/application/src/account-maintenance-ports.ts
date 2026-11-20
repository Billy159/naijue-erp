import type { ActorContext } from "./ports.ts";
import type { PasswordCodec, AuthenticationPolicy } from "../../authentication/src/ports.ts";
import type { CredentialRequestTag, MaintenanceEvidenceSession, MaintenanceResult } from "./maintenance-commit-ports.ts";
export interface AccountMaintenanceRecord {
  readonly id: string; readonly staffId: string; readonly loginName: string; readonly loginEnabled: boolean;
  readonly authVersion: number; readonly version: number; readonly createdAt: string; readonly updatedAt: string;
}
export type AccountMaintenanceCommand = { readonly requestKey: string } & (
  { readonly action: "CREATE"; readonly values: { readonly staffId: string; readonly loginName: string; readonly loginEnabled: boolean; readonly password: string } }
  | { readonly action: "EDIT"; readonly id: string; readonly expectedVersion: number; readonly values: { readonly loginName: string; readonly loginEnabled: boolean } }
  | { readonly action: "DISABLE" | "RESTORE"; readonly id: string; readonly expectedVersion: number }
  | { readonly action: "RESET_PASSWORD"; readonly id: string; readonly expectedVersion: number; readonly password: string }
);
export interface AccountMaintenanceTransaction {
  readonly evidence: MaintenanceEvidenceSession;
  load(id: string): Promise<AccountMaintenanceRecord | undefined>;
  validateChange(previous: AccountMaintenanceRecord | undefined, next: AccountMaintenanceRecord): Promise<void>;
  /** Password encoding is transient input only, never returned or part of audit/receipt. */
  put(previous: AccountMaintenanceRecord | undefined, next: AccountMaintenanceRecord, passwordHash: string | null): Promise<void>;
}
export interface AccountMaintenanceUnitOfWork { transaction<T>(work: (tx: AccountMaintenanceTransaction) => Promise<T>): Promise<T> }
export interface AccountMaintenanceCredentials {
  readonly passwords: PasswordCodec; readonly credentialRequestTag: CredentialRequestTag;
  readonly assertNewPassword: AuthenticationPolicy["assertNewPassword"];
}
export interface AccountMaintenanceDependencies {
  readonly unitOfWork: AccountMaintenanceUnitOfWork; readonly now: () => string;
  readonly newId: (kind: "account" | "operation") => string; readonly credentials: AccountMaintenanceCredentials | null;
}
export interface AccountMaintenanceService {
  execute(actor: ActorContext, input: unknown): Promise<MaintenanceResult>;
  receipt(actor: ActorContext, requestKey: string): Promise<{ readonly requestKey: string; readonly action: string; readonly status: "COMMITTED"; readonly completedAt: string; readonly result: MaintenanceResult }>;
}
