import { createNativeSalesExistingPreparation, createNativeSalesPreparation, createNativeManualSalesBusinessRules } from "../../../packages/application/src/native-sales-preparation.ts";
import { createNativeTransferExistingPreparation, createNativeTransferPreparation, createNativeManualTransferReferences } from "../../../packages/application/src/native-transfer-preparation.ts";
import type { FastifyPluginAsync } from "fastify";
import type { SalesDependencies } from "../../../packages/application/src/ports.ts";
import type { TransferDependencies } from "../../../packages/application/src/transfer-ports.ts";
import type { AuthenticationHttpOptions } from "./authentication.ts";
import { createSalesSessionAuthenticator } from "./authentication.ts";
import { createTransferSessionAuthenticator } from "./transfer-authentication.ts";
import { createSalesHttpPlugin } from "./sales-http.ts";
import { createTransferHttpPlugin } from "./transfer-http.ts";

export interface AuthenticatedDocumentCommandsOptions {
  readonly authentication: AuthenticationHttpOptions;
  /** Explicit complete command dependencies; never inferred from read grants. */
  readonly sales: SalesDependencies;
  readonly transfers: TransferDependencies;
  /** Explicit manual-SKU profile: installs preparation AND transaction revalidation. */
  readonly nativeManualTransferPreparation?: true;
  /** Installs native preparation AND native SAVE/APPROVE fact revalidation. */
  readonly nativeManualSalesPreparation?: true;
  /** Separate host opt-ins. CREATE preparation never implies existing editing. */
  readonly nativeExistingSalesPreparation?: true;
  readonly nativeExistingTransferPreparation?: true;
}
function existingOptIn(options: AuthenticatedDocumentCommandsOptions, name: "nativeExistingSalesPreparation" | "nativeExistingTransferPreparation"): boolean {
  if (!(name in options)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(options, name);
  if (!descriptor?.enumerable || !("value" in descriptor) || descriptor.value !== true)
    throw new TypeError("Existing native preparation requires its independent own-data true opt-in");
  return true;
}

/** Opt-in composition for a trusted host. No listener, pool, demo provider, schema
 * change or implicit registration in the read-only API. All writes/receipts retain
 * existing transaction, current authorization, version and idempotency checks.
 * This seam accepts complete drafts, not untrusted CURRENT-form proposals.
 */
export function createAuthenticatedDocumentCommandsPlugin(options: AuthenticatedDocumentCommandsOptions): FastifyPluginAsync {
  const auth = options?.authentication;
  const service = auth?.service;
  if (!service || typeof service.resolve !== "function" || typeof service.login !== "function"
    || typeof service.logout !== "function" || typeof service.changeOwnPassword !== "function")
    throw new TypeError("Document commands require explicit trusted session authentication");
  const authentication = Object.freeze({ trustedOrigin: auth.trustedOrigin, service: Object.freeze({
    resolve: service.resolve.bind(service), login: service.login.bind(service),
    logout: service.logout.bind(service), changeOwnPassword: service.changeOwnPassword.bind(service)
  }) });
  const existingSales = existingOptIn(options, "nativeExistingSalesPreparation"), existingTransfers = existingOptIn(options, "nativeExistingTransferPreparation");
  if (options.nativeManualSalesPreparation !== undefined && options.nativeManualSalesPreparation !== true)
    throw new TypeError("Native manual sales preparation requires explicit true opt-in");
  const nativeSalesRules = createNativeManualSalesBusinessRules();
  const originalSalesRules = options.sales.rules;
  const salesDependencies: SalesDependencies = options.nativeManualSalesPreparation === true || existingSales ? { ...options.sales, rules: {
    async assertDraftChange(...args) { await originalSalesRules.assertDraftChange(...args); await nativeSalesRules.assertDraftChange(...args); },
    async assertReferencesAndEconomics(...args) { await originalSalesRules.assertReferencesAndEconomics(...args); await nativeSalesRules.assertReferencesAndEconomics(...args); },
    inventoryDelta: nativeSalesRules.inventoryDelta
  } } : options.sales;
  const sales = createSalesHttpPlugin({ authenticate: createSalesSessionAuthenticator(authentication), dependencies: salesDependencies,
    ...(options.nativeManualSalesPreparation === true ? { preparation: createNativeSalesPreparation(salesDependencies) } : {}),
    ...(existingSales ? { existingPreparation: createNativeSalesExistingPreparation(salesDependencies) } : {}) });
  if (options.nativeManualTransferPreparation !== undefined && options.nativeManualTransferPreparation !== true)
    throw new TypeError("Native manual transfer preparation requires explicit true opt-in");
  if (typeof options.transfers?.references?.assertValid !== "function")
    throw new TypeError("Document commands require complete transfer reference validation");
  const nativeReferences = createNativeManualTransferReferences();
  const originalReferences = options.transfers?.references;
  const transferDependencies: TransferDependencies = options.nativeManualTransferPreparation === true || existingTransfers
    ? { ...options.transfers, references: { async assertValid(...args) {
      await originalReferences.assertValid(...args);
      await nativeReferences.assertValid(...args);
    } } } : options.transfers;
  const transfers = createTransferHttpPlugin({ authenticate: createTransferSessionAuthenticator(authentication), dependencies: transferDependencies,
    ...(options.nativeManualTransferPreparation === true ? { preparation: createNativeTransferPreparation(transferDependencies) } : {}),
    ...(existingTransfers ? { existingPreparation: createNativeTransferExistingPreparation(transferDependencies) } : {}) });
  return async app => { app.register(sales); app.register(transfers); };
}
