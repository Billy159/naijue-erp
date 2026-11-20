import type { ActorContext } from "./ports.ts";
import type { MaintenanceEvidenceSession, MaintenanceResult } from "./maintenance-commit-ports.ts";
export type PaymentMaintenanceKind = "PAYMENT_METHOD" | "PAYMENT_ACCOUNT";
export type PaymentMaintenanceAction = "CREATE" | "EDIT" | "DISABLE" | "RESTORE";
export type PaymentValues = { readonly name: string; readonly enabled: boolean };
export interface PaymentAccountValues extends PaymentValues { readonly paymentMethodId: string; readonly hallIds: readonly string[] }
export type PaymentRecord =
  | (PaymentValues & { readonly kind: "PAYMENT_METHOD"; readonly id: string; readonly version: number })
  | (PaymentAccountValues & { readonly kind: "PAYMENT_ACCOUNT"; readonly id: string; readonly version: number });
export type PaymentMaintenanceCommand = { readonly requestKey: string } & (
  { readonly action: "CREATE"; readonly values: PaymentValues | PaymentAccountValues }
  | { readonly action: "EDIT"; readonly id: string; readonly expectedVersion: number; readonly values: PaymentValues | PaymentAccountValues }
  | { readonly action: "DISABLE" | "RESTORE"; readonly id: string; readonly expectedVersion: number }
);
export interface PaymentMaintenanceTransaction {
  readonly evidence: MaintenanceEvidenceSession;
  load(kind: PaymentMaintenanceKind, id: string): Promise<PaymentRecord | undefined>;
  validateChange(previous: PaymentRecord | undefined, next: PaymentRecord): Promise<void>;
  put(previous: PaymentRecord | undefined, next: PaymentRecord): Promise<void>;
}
export interface PaymentMaintenanceUnitOfWork { transaction<T>(work: (tx: PaymentMaintenanceTransaction) => Promise<T>): Promise<T> }
export interface PaymentMaintenanceDependencies {
  readonly unitOfWork: PaymentMaintenanceUnitOfWork; readonly now: () => string;
  readonly newId: (kind: "paymentMethod" | "paymentAccount" | "operation") => string;
}
export interface PaymentMaintenanceService {
  execute(actor: ActorContext, kind: PaymentMaintenanceKind, input: unknown): Promise<MaintenanceResult>;
  receipt(actor: ActorContext, kind: PaymentMaintenanceKind, requestKey: string): Promise<{ readonly requestKey: string; readonly action: string; readonly status: "COMMITTED"; readonly completedAt: string; readonly result: MaintenanceResult }>;
}
