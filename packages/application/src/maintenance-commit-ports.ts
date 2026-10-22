import type { ActorContext } from "./ports.ts";
export const maintenanceKinds = ["PRODUCT", "CATEGORY", "COLOR", "FIT", "HALL", "WAREHOUSE", "STAFF", "ACCOUNT", "PAYMENT_METHOD", "PAYMENT_ACCOUNT"] as const;
export type MaintenanceKind = typeof maintenanceKinds[number];
export const maintenanceReadIntents = Object.freeze(["RECEIPT", "DETAIL", "CANDIDATES", "LIST"] as const);
export type MaintenanceJsonValue = string | number | boolean | null | readonly MaintenanceJsonValue[] | { readonly [key: string]: MaintenanceJsonValue };
export interface MaintenanceJsonObject { readonly [key: string]: MaintenanceJsonValue }
export interface MaintenanceResult { readonly operationId: string; readonly kind: MaintenanceKind; readonly targetId: string; readonly version: number }
export interface MaintenanceReceipt { readonly requestHash: string; readonly action: string; readonly result: MaintenanceResult; readonly completedAt: string }
export interface MaintenanceCompletion {
  readonly operationId: string; readonly actorAccountId: string; readonly requestKey: string; readonly requestHash: string;
  readonly kind: MaintenanceKind; readonly action: string; readonly targetId: string;
  readonly oldVersion: number | null; readonly newVersion: number;
  readonly beforeValues: MaintenanceJsonObject | null; readonly afterValues: MaintenanceJsonObject; readonly completedAt: string;
}
export interface MaintenanceEvidenceSession {
  assertAllowed(actor: ActorContext, kind: MaintenanceKind, action: string): Promise<void>;
  getReceipt(actorAccountId: string, requestKey: string, kind: MaintenanceKind): Promise<MaintenanceReceipt | undefined>;
  complete(input: MaintenanceCompletion): Promise<MaintenanceResult>;
}
export const maintenanceActions: Readonly<Record<MaintenanceKind, readonly string[]>> = Object.freeze({
  PRODUCT: ["CREATE", "EDIT", "DISABLE", "RESTORE", "DELETE"], CATEGORY: ["CREATE", "EDIT", "DELETE"],
  COLOR: ["CREATE", "EDIT", "DISABLE", "RESTORE", "DELETE"], FIT: ["CREATE", "EDIT", "DISABLE", "RESTORE", "DELETE"],
  HALL: ["CREATE", "EDIT", "DISABLE", "RESTORE"], WAREHOUSE: ["CREATE", "EDIT", "DISABLE", "RESTORE"],
  STAFF: ["CREATE", "EDIT", "LEAVE", "REINSTATE"], ACCOUNT: ["CREATE", "EDIT", "DISABLE", "RESTORE", "RESET_PASSWORD"],
  PAYMENT_METHOD: ["CREATE", "EDIT", "DISABLE", "RESTORE"], PAYMENT_ACCOUNT: ["CREATE", "EDIT", "DISABLE", "RESTORE"]
});
for (const actions of Object.values(maintenanceActions)) Object.freeze(actions);
