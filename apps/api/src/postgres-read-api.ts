import { validateCoreSourceMembers } from "../../../packages/application/src/inventory-cutoff-import.ts";
import type { CoreSourceMembers } from "../../../packages/application/src/inventory-cutoff-import.ts";
import type { NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { createSettingsAuditHttpPlugin } from "./settings-audit-http.ts";
import { PostgresSettingsAuditUnitOfWork } from "../../../adapters/postgres/src/settings-audit-reader.ts";
import type { SettingsAuditCoreReadCapability } from "../../../adapters/postgres/src/settings-audit-reader.ts";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { isAbsolute, resolve } from "node:path";
import { BoundedPostgresPool } from "../../../adapters/postgres/src/bounded-pool.ts";
import type { BoundedPostgresConfig, PostgresPoolDriverFactory } from "../../../adapters/postgres/src/bounded-pool.ts";
import { PostgresAuthenticationStore } from "../../../adapters/postgres/src/auth-store.ts";
import { PostgresInventoryQueryReader } from "../../../adapters/postgres/src/inventory-query-reader.ts";
import { PostgresInventoryLedgerQueryReader } from "../../../adapters/postgres/src/inventory-ledger-query-reader.ts";
import { PostgresSalesQueryReader } from "../../../adapters/postgres/src/sales-query-reader.ts";
import { PostgresTransferQueryReader } from "../../../adapters/postgres/src/transfer-query-reader.ts";
import { PostgresProductQueryReader } from "../../../adapters/postgres/src/product-query-reader.ts";
import { PostgresCurrentFormReader } from "../../../adapters/postgres/src/current-form-reader.ts";
import { createSourceConfirmedPostgresReadAuthorization } from "../../../adapters/postgres/src/source-confirmed-read-authorization.ts";
import type { InventoryQueryAuthorization } from "../../../packages/application/src/inventory-query-contracts.ts";
import type { SalesQueryAuthorization } from "../../../packages/application/src/sales-query-ports.ts";
import type { TransferQueryAuthorization } from "../../../packages/application/src/transfer-query-ports.ts";
import type { CurrentFormAuthorization } from "../../../packages/application/src/current-form-ports.ts";
import { createSourceConfirmedTransferQueryAuthorization } from "../../../packages/application/src/transfer-query-service.ts";
import type { ControlledProductMedia, ProductQueryAuthorization } from "../../../packages/application/src/product-query-ports.ts";
import type { AuthenticationPolicy } from "../../../packages/authentication/src/ports.ts";
import { createAuthenticationService } from "../../../packages/authentication/src/service.ts";
import { createNodeScryptPasswords } from "../../../packages/authentication/src/passwords.ts";
import { createNodeMigratedLegacyPasswords } from "../../../packages/authentication/src/legacy-passwords.ts";
import { createAuthenticationHttpPlugin, createSalesSessionAuthenticator } from "./authentication.ts";
import { createTransferSessionAuthenticator } from "./transfer-authentication.ts";
import { createInventoryHttpPlugin } from "./inventory-http.ts";
import type { InventoryOutputSpoolOptions } from "./inventory-http.ts";
import { createInventoryLedgerQueryHttpPlugin } from "./inventory-ledger-query-http.ts";
import { createSalesQueryHttpPlugin } from "./sales-query-http.ts";
import { createTransferQueryHttpPlugin } from "./transfer-query-http.ts";
import { createProductQueryHttpPlugin } from "./product-query-http.ts";
import { createCurrentFormHttpPlugin } from "./current-form-http.ts";
import { createAuthenticatedDocumentCommandsPlugin } from "./authenticated-document-commands.ts";
import { createStoreSettingsReadHttpPlugin } from "./store-settings-read-http.ts";
import { PostgresStoreSettingsReadReader } from "../../../adapters/postgres/src/store-settings-read-reader.ts";
import { PostgresSalesUnitOfWork } from "../../../adapters/postgres/src/sales-unit-of-work.ts";
import type { PgSalesPool } from "../../../adapters/postgres/src/sales-unit-of-work.ts";
import { PostgresTransferUnitOfWork } from "../../../adapters/postgres/src/transfer-unit-of-work.ts";
import type { NativeCatalogueCompletenessVerifier } from "../../../adapters/postgres/src/sales-native-facts.ts";
import type { SalesDependencies } from "../../../packages/application/src/ports.ts";
import type { TransferDependencies } from "../../../packages/application/src/transfer-ports.ts";
import type { StoreSettingsReadAuthorization, StoreSettingsCoreReadCapability, StoreSettingsScope } from "../../../packages/application/src/store-settings-read-ports.ts";
import type { ProductManagementQueryAuthorization } from "../../../packages/application/src/product-management-query-ports.ts";
import type { CatalogueSettingsReadAuthorization } from "../../../packages/application/src/catalogue-settings-read-ports.ts";
import type { DictionaryReadAuthorization } from "../../../packages/application/src/dictionary-read-ports.ts";
import { PostgresProductManagementQueryReader } from "../../../adapters/postgres/src/product-management-query-reader.ts";
import { PostgresCatalogueSettingsReadReader } from "../../../adapters/postgres/src/catalogue-settings-read-reader.ts";
import { PostgresDictionaryReadReader } from "../../../adapters/postgres/src/dictionary-read-reader.ts";
import { createProductManagementQueryHttpPlugin } from "./product-management-query-http.ts";
import { createCatalogueSettingsReadHttpPlugin } from "./catalogue-settings-read-http.ts";
import { createDictionaryReadHttpPlugin } from "./dictionary-read-http.ts";
import type { PartyReadAuthorization } from "../../../packages/application/src/party-read-ports.ts";
import { PostgresPartyReadReader } from "../../../adapters/postgres/src/party-read-reader.ts";
import { createPartyReadHttpPlugin } from "./party-read-http.ts";
import { createPartySessionAuthenticator } from "./party-authentication.ts";
import type { ImportedHistoryReadAuthorization } from "../../../packages/application/src/imported-history-query-ports.ts";
import { PostgresImportedHistoryQueryReader } from "../../../adapters/postgres/src/imported-history-query-reader.ts";
import { createImportedHistoryQueryHttpPlugin } from "./imported-history-query-http.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { PgReadAuthorizationPool } from "../../../adapters/postgres/src/source-confirmed-read-authorization.ts";
import type { ProductDetailsQueryAuthorization } from "../../../packages/application/src/product-details-query-ports.ts";
import { createProductDetailsQueryHttpPlugin } from "./product-details-query-http.ts";
import { PostgresProductDetailsQueryReader } from "../../../adapters/postgres/src/product-details-query-reader.ts";
import { PostgresProductWarehouseStockReader } from "../../../adapters/postgres/src/product-warehouse-stock-reader.ts";
import { PostgresMaintenanceCommandUnitOfWork, maintenanceContextClient } from "../../../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import { PostgresCatalogueMaintenanceUnitOfWork } from "../../../adapters/postgres/src/catalogue-maintenance-store.ts";
import { createCatalogueMaintenanceHttpPlugin } from "./catalogue-maintenance-http.ts";
import { PostgresOrganizationMaintenanceReadUnitOfWork } from "../../../adapters/postgres/src/organization-maintenance-store.ts";
import { createOrganizationMaintenanceReadHttpPlugin } from "./organization-maintenance-http.ts";
import { createNativeRuntime26Issuer } from "../../../adapters/postgres/src/native-import-accounting-capability.ts";
import { PrivateProductMediaStage } from "../../../adapters/media/src/product-media-stage.ts";
import { PrivateControlledProductMedia } from "../../../adapters/media/src/controlled-product-media.ts";
import { SharpProductImageCodec } from "../../../adapters/media/src/sharp-product-image-codec.ts";
import { PostgresProductMaintenanceUnitOfWork } from "../../../adapters/postgres/src/product-maintenance-store.ts";
import { authorizeProductMaintenance } from "../../../packages/application/src/product-maintenance-authorization.ts";
import { activeProductRead } from "../../../packages/application/src/product-query-validation.ts";
import type { ProductMaintenanceTransaction, ProductMaintenanceUnitOfWork } from "../../../packages/application/src/product-maintenance-ports.ts";
import { createProductMaintenanceHttpPlugin } from "./product-maintenance-http.ts";
import { createProductMediaHttpPlugin } from "./product-media-http.ts";

export interface PostgresReadApiExplicitAuthorization {
  readonly mode?: never;
  readonly inventory: InventoryQueryAuthorization;
  readonly sales: SalesQueryAuthorization;
  readonly transfers: TransferQueryAuthorization;
  readonly products: ProductQueryAuthorization;
}
export interface PostgresReadApiNativeAuthorization {
  readonly mode: "source-confirmed-native";
  readonly inventory?: never;
  readonly sales?: never;
  readonly transfers?: never;
  readonly products?: never;
}
export type PostgresReadApiAuthorization = PostgresReadApiExplicitAuthorization | PostgresReadApiNativeAuthorization;

export interface PostgresReadApiOptions {
  /** Trusted host-only private output resources; absence keeps output unavailable. */
  readonly inventoryOutputSpool?: InventoryOutputSpoolOptions;
  /** Explicit target, TLS choice and finite resource settings; never URI/env/pgpass discovery. */
  readonly postgres: BoundedPostgresConfig;
  readonly authentication: {
    readonly trustedOrigin: string;
    readonly now: () => string;
    readonly policy: AuthenticationPolicy;
    /** Trusted host opt-in only; absent keeps the original scrypt-only codec. */
    readonly credentialCompatibility?: "legacy-pbkdf2-v1";
  };
  /** Trusted host-only selection: explicit providers OR the closed source-confirmed native profile.
   * No default, mixed overrides, request-selected mode, invented or widened hall grants. */
  readonly authorization: PostgresReadApiAuthorization;
  /** Required explicit availability. null keeps existing media-unavailable failures honest. */
  readonly productMedia: ControlledProductMedia | null;
  /** Separate trusted opt-in: absence (including native profile alone) installs no CURRENT routes.
   * Proposals only; grants never enable commands or create a listener. */
  readonly currentForms?: { readonly authorization: CurrentFormAuthorization };
}
export interface PostgresReadApi {
  /** Ready for inject or an explicitly configured host. Never listening on return. */
  readonly app: FastifyInstance;
  /** Delegates to Fastify shutdown, then disposes this API's one owned bounded pool. */
  close(): Promise<void>;
  readonly postgresBackgroundFailureCount: number;
}
export interface PostgresApplicationApi extends PostgresReadApi { readonly trustedOrigin: string }
export interface PostgresDocumentCommandsCapability {
  readonly sales: Omit<SalesDependencies, "unitOfWork" | "now">;
  readonly transfers: Omit<TransferDependencies, "unitOfWork" | "now">;
  readonly catalogueCompleteness: NativeCatalogueCompletenessVerifier;
  readonly nativeManualSalesPreparation: true;
  readonly nativeManualTransferPreparation: true;
}
export interface CommittedCoreReadBinding {
  readonly profile: "COMMITTED_CORE_SETTINGS_V14"; readonly batchId: string; readonly operationId: string; readonly coreSourceDigest: string;
}
export interface PostgresApplicationApiOptions extends PostgresReadApiOptions {
  readonly coreInitializationRead?: CommittedCoreReadBinding;
  /** Closed trusted production selector. It installs independently defined read
   * policies below, never commands or a fallback from LIVE to HISTORY. */
  readonly nativeReadExtensions?: { readonly profile: "source-confirmed-r1-v1" };
  readonly documentCommands?: PostgresDocumentCommandsCapability;
  readonly storeSettingsRead?: { readonly authorization: StoreSettingsReadAuthorization };
  readonly productManagementRead?: { readonly authorization: ProductManagementQueryAuthorization };
  readonly catalogueSettingsRead?: { readonly authorization: CatalogueSettingsReadAuthorization };
  readonly dictionaryRead?: { readonly authorization: DictionaryReadAuthorization };
  readonly partyRead?: { readonly authorization: PartyReadAuthorization };
  /** Explicit historical policy only. Native/LIVE authorization never enables this dataset. */
  readonly importedHistoryRead?: { readonly authorization: ImportedHistoryReadAuthorization };
}
type ApplicationCapabilities = { readonly coreInitializationRead: CommittedCoreReadBinding | null; readonly commands: PostgresDocumentCommandsCapability | null;
  readonly nativeReadExtensions: boolean;
  readonly settings: StoreSettingsReadAuthorization | null;
  readonly productManagement: ProductManagementQueryAuthorization | null;
  readonly catalogueSettings: CatalogueSettingsReadAuthorization | null;
  readonly dictionary: DictionaryReadAuthorization | null;
  readonly party: PartyReadAuthorization | null;
  readonly importedHistory: ImportedHistoryReadAuthorization | null };
function ownData(value: object, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  if (!descriptor || !("value" in descriptor)) throw new TypeError("Application capabilities require own data properties");
  return descriptor.value;
}
function exactBag(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || Reflect.ownKeys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k)))
    throw new TypeError("Application capability has missing or unknown fields");
  return Object.fromEntries(keys.map(k => [k, ownData(value, k)]));
}
function method<T extends (...args: never[]) => unknown>(value: unknown, name: string): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Explicit application provider required");
  let current: object | null = value;
  while (current && current !== Object.prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) {
      if (!("value" in descriptor) || typeof descriptor.value !== "function") throw new TypeError("Application provider method must be a data function");
      return descriptor.value.bind(value) as T;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  throw new TypeError("Complete application provider methods required");
}
function checkedApplicationCapabilities(options: PostgresApplicationApiOptions): ApplicationCapabilities {
  let coreInitializationRead: CommittedCoreReadBinding | null = null;
  if ("coreInitializationRead" in options) {
    const core = exactBag(ownData(options, "coreInitializationRead"), ["profile", "batchId", "operationId", "coreSourceDigest"]);
    entityId("operation", core.batchId as string); entityId("operation", core.operationId as string);
    if (core.profile !== "COMMITTED_CORE_SETTINGS_V14" || typeof core.coreSourceDigest !== "string" || !/^[a-f0-9]{64}$/.test(core.coreSourceDigest)
      || options.authorization.mode !== "source-confirmed-native" || options.productMedia !== null
      || ["inventoryOutputSpool", "nativeReadExtensions", "documentCommands", "currentForms", "storeSettingsRead", "productManagementRead", "catalogueSettingsRead", "dictionaryRead", "partyRead", "importedHistoryRead"].some(k => k in options))
      throw new TypeError("CORE host mounts only original authentication and exact committed member settings reads");
    coreInitializationRead = Object.freeze(core as unknown as CommittedCoreReadBinding);
  }
  const nativeReadExtensions = "nativeReadExtensions" in options;
  if (nativeReadExtensions) {
    const extension = exactBag(ownData(options, "nativeReadExtensions"), ["profile"]);
    if (extension.profile !== "source-confirmed-r1-v1" || options.authorization?.mode !== "source-confirmed-native"
      || ["storeSettingsRead", "productManagementRead", "catalogueSettingsRead", "dictionaryRead", "partyRead", "importedHistoryRead"].some(k => k in options))
      throw new TypeError("Native read extensions require only their exact trusted profile and native identity policy");
  }
  let commands: PostgresDocumentCommandsCapability | null = null, settings: StoreSettingsReadAuthorization | null = null;
  let productManagement: ProductManagementQueryAuthorization | null = null,
    catalogueSettings: CatalogueSettingsReadAuthorization | null = null, dictionary: DictionaryReadAuthorization | null = null,
    party: PartyReadAuthorization | null = null, importedHistory: ImportedHistoryReadAuthorization | null = null;
  if ("documentCommands" in options) {
    const bag = exactBag(ownData(options, "documentCommands"), ["sales", "transfers", "catalogueCompleteness", "nativeManualSalesPreparation", "nativeManualTransferPreparation"]);
    if (bag.nativeManualSalesPreparation !== true || bag.nativeManualTransferPreparation !== true)
      throw new TypeError("Application commands require explicit native preparation for both document types");
    const sales = exactBag(bag.sales, ["rules", "authorization", "newId"]), transfers = exactBag(bag.transfers, ["references", "authorization", "newId"]);
    const salesRules = Object.freeze({
      assertDraftChange: method<SalesDependencies["rules"]["assertDraftChange"]>(sales.rules, "assertDraftChange"),
      assertReferencesAndEconomics: method<SalesDependencies["rules"]["assertReferencesAndEconomics"]>(sales.rules, "assertReferencesAndEconomics"),
      inventoryDelta: method<SalesDependencies["rules"]["inventoryDelta"]>(sales.rules, "inventoryDelta"),
    });
    commands = Object.freeze({ sales: Object.freeze({ rules: salesRules,
      authorization: Object.freeze({ assertAllowed: method<SalesDependencies["authorization"]["assertAllowed"]>(sales.authorization, "assertAllowed") }),
      newId: method<SalesDependencies["newId"]>(bag.sales, "newId") }),
      transfers: Object.freeze({ references: Object.freeze({ assertValid: method<TransferDependencies["references"]["assertValid"]>(transfers.references, "assertValid") }),
        authorization: Object.freeze({ assertAllowed: method<TransferDependencies["authorization"]["assertAllowed"]>(transfers.authorization, "assertAllowed") }),
        newId: method<TransferDependencies["newId"]>(bag.transfers, "newId") }),
      catalogueCompleteness: Object.freeze({ assertComplete: method<NativeCatalogueCompletenessVerifier["assertComplete"]>(bag.catalogueCompleteness, "assertComplete") }),
      nativeManualSalesPreparation: true, nativeManualTransferPreparation: true });
  }
  if ("storeSettingsRead" in options) {
    const bag = exactBag(ownData(options, "storeSettingsRead"), ["authorization"]);
    settings = Object.freeze({ authorize: method<StoreSettingsReadAuthorization["authorize"]>(bag.authorization, "authorize") });
  }
  if ("productManagementRead" in options) {
    const bag = exactBag(ownData(options, "productManagementRead"), ["authorization"]);
    productManagement = Object.freeze({ authorize: method<ProductManagementQueryAuthorization["authorize"]>(bag.authorization, "authorize") });
  }
  if ("catalogueSettingsRead" in options) {
    const bag = exactBag(ownData(options, "catalogueSettingsRead"), ["authorization"]);
    catalogueSettings = Object.freeze({ authorize: method<CatalogueSettingsReadAuthorization["authorize"]>(bag.authorization, "authorize") });
  }
  if ("dictionaryRead" in options) {
    const bag = exactBag(ownData(options, "dictionaryRead"), ["authorization"]);
    dictionary = Object.freeze({ authorize: method<DictionaryReadAuthorization["authorize"]>(bag.authorization, "authorize") });
  }
  if ("partyRead" in options) {
    const bag = exactBag(ownData(options, "partyRead"), ["authorization"]);
    party = Object.freeze({ authorize: method<PartyReadAuthorization["authorize"]>(bag.authorization, "authorize") });
  }
  if ("importedHistoryRead" in options) {
    const bag = exactBag(ownData(options, "importedHistoryRead"), ["authorization"]);
    importedHistory = Object.freeze({ authorize: method<ImportedHistoryReadAuthorization["authorize"]>(bag.authorization, "authorize") });
  }
  return Object.freeze({ coreInitializationRead, commands, nativeReadExtensions, settings, productManagement, catalogueSettings, dictionary, party, importedHistory });
}

export interface SourceConfirmedApplicationReadAuthorization {
  readonly settings: StoreSettingsReadAuthorization; readonly productManagement: ProductManagementQueryAuthorization;
  readonly catalogueSettings: CatalogueSettingsReadAuthorization; readonly dictionary: DictionaryReadAuthorization;
  readonly party: PartyReadAuthorization; readonly importedHistory: ImportedHistoryReadAuthorization;
  readonly productDetails: ProductDetailsQueryAuthorization;
}
/** Explicit operation policies, based on formal server/security/policies.ts:
 * masters.list=>ADMIN/WAREHOUSE, masters.candidates=>all current roles,
 * productMasters.list/barcodes.scheme=>all, products.list/detail and inventory
 * =>all. Each tab/directory/HISTORY grant is constructed separately here.
 * HISTORY sales uses exact current hall; restricted transfer remains closed. */
export function createSourceConfirmedApplicationReadAuthorization(pool: PgReadAuthorizationPool): SourceConfirmedApplicationReadAuthorization {
  if (typeof pool?.connect !== "function") throw new TypeError("Explicit shared native read pool required");
  const allowed = (condition: unknown): void => requireDomain(condition, "FORBIDDEN", "Current native read authority unavailable");
  async function current(actor: ActorContext, signal: AbortSignal): Promise<"ADMIN" | "WAREHOUSE" | "SALESPERSON"> {
    allowed(!signal.aborted); entityId("account", actor.accountId); if (actor.hallId !== null) entityId("hall", actor.hallId);
    const client = await pool.connect();
    try {
      allowed(!signal.aborted);
      const rows = (await client.query(`/* application-read:identity */ SELECT a.id account_id,a.staff_id,a.login_enabled,
        s.role,s.employment_status,s.hall_id,h.id native_hall_id,h.enabled hall_enabled
        FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE a.id=$1::uuid LIMIT 2`, [actor.accountId])).rows;
      allowed(!signal.aborted && rows.length === 1); const row = rows[0]!;
      allowed(row.account_id === actor.accountId && typeof row.staff_id === "string" && row.login_enabled === true
        && row.employment_status === "在职" && (row.role === "ADMIN" || row.role === "WAREHOUSE" || row.role === "SALESPERSON"));
      entityId("staff", row.staff_id as string);
      allowed(row.hall_id === actor.hallId && (row.role !== "SALESPERSON" || actor.hallId !== null)
        && (actor.hallId === null ? row.native_hall_id === null && row.hall_enabled === null : row.native_hall_id === actor.hallId && row.hall_enabled === true));
      if ("role" in actor) allowed(actor.role === row.role);
      return row.role as "ADMIN" | "WAREHOUSE" | "SALESPERSON";
    } finally { client.release(); }
  }
  return Object.freeze({
    settings: Object.freeze<StoreSettingsReadAuthorization>({ async authorize(actor, intent, signal) {
      allowed((intent.kind === "stores" || intent.kind === "warehouses") && (intent.operation === "list" || intent.operation === "detail"));
      allowed(await current(actor, signal) !== "SALESPERSON");
      return { kind: intent.kind, operation: intent.operation, scope: { kind: "ALL" }, references: "REFERENCES", targetId: intent.operation === "detail" ? intent.parameters.id : null };
    } }),
    productManagement: Object.freeze<ProductManagementQueryAuthorization>({ async authorize(actor, intent, signal) {
      allowed(intent.kind === "list" || intent.kind === "candidates"); await current(actor, signal);
      return { kind: "all", totalStock: "all-warehouses" };
    } }),
    catalogueSettings: Object.freeze<CatalogueSettingsReadAuthorization>({ async authorize(actor, intent, signal) {
      allowed(intent.kind === "categories" ? intent.operation === "tree" : (intent.kind === "colors" || intent.kind === "fits") && intent.operation === "list");
      await current(actor, signal); return intent.kind === "categories" ? { kind: "categories", operation: "tree", productCounts: "ALL" } : { kind: intent.kind, operation: "list" };
    } }),
    dictionary: Object.freeze<DictionaryReadAuthorization>({ async authorize(actor, intent, signal) {
      allowed((intent.kind === "size-groups" || intent.kind === "seasons" || intent.kind === "barcode-schemes")
        && (intent.operation === "list" || intent.kind === "barcode-schemes" && intent.operation === "detail"));
      await current(actor, signal); return { kind: intent.kind, targetId: intent.operation === "detail" ? intent.parameters.schemeId : null };
    } }),
    party: Object.freeze<PartyReadAuthorization>({ async authorize(actor, intent, signal) {
      allowed((intent.kind === "CUSTOMER" || intent.kind === "SUPPLIER") && ["LIST", "DETAIL", "CANDIDATES"].includes(intent.operation));
      const role = await current(actor, signal); allowed(intent.operation === "CANDIDATES" || role !== "SALESPERSON");
      return { kind: intent.kind, operation: intent.operation, targetId: intent.operation === "DETAIL" ? intent.id : null };
    } }),
    importedHistory: Object.freeze<ImportedHistoryReadAuthorization>({ async authorize(actor, intent, signal) {
      allowed((intent.kind === "sales" || intent.kind === "transfers") && (intent.operation === "list" || intent.operation === "detail"));
      const role = await current(actor, signal); allowed(role !== "SALESPERSON" || intent.kind === "sales" && actor.hallId !== null);
      return { dataset: "HISTORY", actorAccountId: actor.accountId, kind: intent.kind, operation: intent.operation,
        targetId: intent.operation === "detail" ? intent.parameters.documentId : null,
        scope: role === "SALESPERSON" ? { kind: "HALL_IDS", hallIds: [actor.hallId!] } : { kind: "ALL" } };
    } }),
    productDetails: Object.freeze<ProductDetailsQueryAuthorization>({ async authorize(actor, intent, signal) {
      allowed(["prices", "barcodes", "stock"].includes(intent.kind)); await current(actor, signal);
      return { kind: intent.kind, productId: entityId("product", intent.parameters.productId) };
    } })
  });
}

function exactHttpsOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.protocol === "https:" && url.origin === value && !url.username && !url.password; }
  catch { return false; }
}
type CapturedAuthorization = { readonly kind: "source-confirmed-native" }
  | { readonly kind: "providers"; readonly providers: PostgresReadApiExplicitAuthorization };
function checkedAuthorization(value: PostgresReadApiAuthorization): CapturedAuthorization {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Explicit PostgreSQL read authorization is required");
  if ("mode" in value) {
    // A closed, own-key selector is not a provider bag. Reject unknown modes and
    // every override (including undefined/non-enumerable/symbol properties).
    const prototype = Object.getPrototypeOf(value);
    if (!Object.hasOwn(value, "mode") || value.mode !== "source-confirmed-native" || Reflect.ownKeys(value).length !== 1
      || (prototype !== null && prototype !== Object.prototype))
      throw new TypeError("Native PostgreSQL read authorization requires only its explicit source-confirmed-native mode");
    return Object.freeze({ kind: "source-confirmed-native" });
  }
  if (typeof value.inventory?.authorize !== "function" || typeof value.sales?.authorize !== "function"
    || typeof value.transfers?.authorize !== "function" || typeof value.products?.authorize !== "function")
    throw new TypeError("Explicit PostgreSQL read authorization providers are required");
  return Object.freeze({ kind: "providers", providers: Object.freeze({
    inventory: Object.freeze({ authorize: value.inventory.authorize.bind(value.inventory) }),
    sales: Object.freeze({ authorize: value.sales.authorize.bind(value.sales) }),
    transfers: Object.freeze({ authorize: value.transfers.authorize.bind(value.transfers) }),
    products: Object.freeze({ authorize: value.products.authorize.bind(value.products) })
  }) });
}
function checkedHost(options: PostgresReadApiOptions) {
  const auth = options?.authentication; const media = options?.productMedia;
  if (!exactHttpsOrigin(auth?.trustedOrigin) || typeof auth?.now !== "function" || !auth.policy
    || ("credentialCompatibility" in auth && (!Object.hasOwn(auth, "credentialCompatibility") || auth.credentialCompatibility !== "legacy-pbkdf2-v1"))
    || !Object.hasOwn(options, "productMedia") || (media !== null && (!media || !exactHttpsOrigin(media.deliveryOrigin)
      || typeof media.resolveThumbnails !== "function" || typeof media.resolveOriginal !== "function"))) {
    throw new TypeError("PostgreSQL read API requires explicit trusted HTTPS origin, authentication policy/clock, read authorization and media availability");
  }
  const inventoryOutputSpool = Object.hasOwn(options, "inventoryOutputSpool")
    ? Object.freeze({ ...exactBag(options.inventoryOutputSpool, ["directory", "maxBytes", "maxConcurrent", "maxDurationMs"]) }) as unknown as InventoryOutputSpoolOptions : undefined;
  // Capture provider methods and origins before the first await. Changing the caller's
  // configuration object later cannot replace these boundaries or enable a write plugin.
  return {
    inventoryOutputSpool, trustedOrigin: auth.trustedOrigin, now: auth.now, policy: auth.policy, credentialCompatibility: auth.credentialCompatibility,
    authorization: checkedAuthorization(options.authorization), currentForms: checkedCurrentForms(options),
    media: media === null ? null : Object.freeze({ deliveryOrigin: media.deliveryOrigin,
      resolveThumbnails: media.resolveThumbnails.bind(media), resolveOriginal: media.resolveOriginal.bind(media),
      ...(media.resolveAvailableThumbnails === undefined ? {} : { resolveAvailableThumbnails: media.resolveAvailableThumbnails.bind(media) }) })
  };
}
function checkedCurrentForms(options: PostgresReadApiOptions): CurrentFormAuthorization | null {
  if (!("currentForms" in options)) return null;
  const forms = options.currentForms;
  if (!Object.hasOwn(options, "currentForms") || !forms || typeof forms !== "object" || Array.isArray(forms)
    || Reflect.ownKeys(forms).length !== 1 || !Object.hasOwn(forms, "authorization")
    || (Object.getPrototypeOf(forms) !== Object.prototype && Object.getPrototypeOf(forms) !== null))
    throw new TypeError("Current forms require an explicit trusted authorization provider");
  const authorization = forms.authorization;
  if (!authorization || typeof authorization !== "object" || Array.isArray(authorization))
    throw new TypeError("Current forms require an explicit trusted authorization provider");
  const authorize = authorization?.authorize;
  if (typeof authorize !== "function") throw new TypeError("Current forms require an explicit trusted authorization provider");
  return Object.freeze({ authorize: authorize.bind(authorization) });
}

/** Explicit, opt-in auth + native read composition. Import/construction never connects or listens.
 * Authentication may persist/revoke sessions or change the authenticated user's own password.
 * No sales/transfer/party commands, admin/account maintenance, migrations, imports or seeds are enabled.
 * The optional trusted driver seam is for protocol-double tests, not an alternate production provider. */
export async function createPostgresReadApi(options: PostgresReadApiOptions, createDriver?: PostgresPoolDriverFactory): Promise<PostgresReadApi> {
  return composePostgresApi(options, createDriver, null);
}
/** Independent opt-in application entry; all plugins share one auth/pool and register before ready. */
export async function createPostgresApplicationApi(options: PostgresApplicationApiOptions, createDriver?: PostgresPoolDriverFactory): Promise<PostgresApplicationApi> {
  if (!options || typeof options !== "object") throw new TypeError("Explicit application configuration required");
  const capabilities = checkedApplicationCapabilities(options);
  return await composePostgresApi(options, createDriver, capabilities) as PostgresApplicationApi;
}
/** Separate exact26 R1 entry, never an ambient upgrade of the legacy factory.
 * The only runtime authority input is a closed independently pinned file pair;
 * callers cannot supply a pool, issuer, capability callback or command provider. */
export async function createPostgresRuntime26ApplicationApi(options: PostgresApplicationApiOptions,
  review: { readonly reviewFile: string; readonly trustedReviewSha256: string }, createDriver?: PostgresPoolDriverFactory): Promise<PostgresApplicationApi> {
  if (!options || typeof options !== "object" || "documentCommands" in options || (!("currentForms" in options) && !("coreInitializationRead" in options)))
    throw new TypeError("Exact26 R1 requires explicit current forms and no document commands");
  const pin = exactBag(review, ["reviewFile", "trustedReviewSha256"]);
  if (typeof pin.reviewFile !== "string" || !isAbsolute(pin.reviewFile) || resolve(pin.reviewFile) !== pin.reviewFile
    || typeof pin.trustedReviewSha256 !== "string" || !/^[0-9a-f]{64}$/.test(pin.trustedReviewSha256))
    throw new TypeError("Closed exact26 independent metadata review pin required");
  const capabilities = checkedApplicationCapabilities(options);
  if (!capabilities.nativeReadExtensions && capabilities.coreInitializationRead === null) throw new TypeError("Exact26 R1 requires the source-confirmed read policies");
  return await composePostgresApi(options, createDriver, capabilities,
    Object.freeze({ reviewFile: pin.reviewFile, trustedReviewSha256: pin.trustedReviewSha256 })) as PostgresApplicationApi;
}
export interface Runtime26ExistingPreparation { readonly sales: boolean; readonly transfers: boolean }
/** Independent R2 successor. Original command providers and catalogue proof are
 * mandatory; only the existing-prepare selectors are new, explicitly per kind. */
export async function createPostgresRuntime26DocumentApplicationApi(options: PostgresApplicationApiOptions,
  review: { readonly reviewFile: string; readonly trustedReviewSha256: string }, existingPreparation: Runtime26ExistingPreparation,
  createDriver?: PostgresPoolDriverFactory): Promise<PostgresApplicationApi> {
  return composeRuntime26DocumentApplicationApi(options, review, existingPreparation, createDriver);
}
/** R3 mounts the existing product/media leaves with the same owned pool and issuer.
 * Private storage configuration is supplied by the production host, never HTTP. */
export interface Runtime26ProductMediaConfiguration {
  readonly root: string; readonly rootKey: string; readonly publicRoots: readonly string[];
}
export async function createPostgresRuntime26MediaApplicationApi(options: PostgresApplicationApiOptions,
  review: { readonly reviewFile: string; readonly trustedReviewSha256: string }, existingPreparation: Runtime26ExistingPreparation,
  media: Runtime26ProductMediaConfiguration, createDriver?: PostgresPoolDriverFactory): Promise<PostgresApplicationApi> {
  if (options.productMedia !== null || !media || !isAbsolute(media.root) || resolve(media.root) !== media.root
    || !/^[A-Za-z0-9_-]{1,100}$/.test(media.rootKey) || !Array.isArray(media.publicRoots) || media.publicRoots.length === 0
    || media.publicRoots.some(root => typeof root !== "string" || !isAbsolute(root)))
    throw new TypeError("Explicit original private media root and public build roots required");
  return composeRuntime26DocumentApplicationApi(options, review, existingPreparation, createDriver,
    Object.freeze({ root: media.root, rootKey: media.rootKey, publicRoots: Object.freeze([...media.publicRoots]) }));
}
async function composeRuntime26DocumentApplicationApi(options: PostgresApplicationApiOptions,
  review: { readonly reviewFile: string; readonly trustedReviewSha256: string }, existingPreparation: Runtime26ExistingPreparation,
  createDriver?: PostgresPoolDriverFactory, media?: Runtime26ProductMediaConfiguration): Promise<PostgresApplicationApi> {
  if (!options || typeof options !== "object" || !("documentCommands" in options) || !("currentForms" in options))
    throw new TypeError("Exact26 R2 requires explicit native document commands and current forms");
  const pin = exactBag(review, ["reviewFile", "trustedReviewSha256"]), preparation = exactBag(existingPreparation, ["sales", "transfers"]);
  if (typeof pin.reviewFile !== "string" || !isAbsolute(pin.reviewFile) || resolve(pin.reviewFile) !== pin.reviewFile
    || typeof pin.trustedReviewSha256 !== "string" || !/^[0-9a-f]{64}$/.test(pin.trustedReviewSha256)
    || typeof preparation.sales !== "boolean" || typeof preparation.transfers !== "boolean")
    throw new TypeError("Closed exact26 review and independent boolean existing-preparation selectors required");
  const capabilities = checkedApplicationCapabilities(options);
  if (!capabilities.nativeReadExtensions || capabilities.commands === null) throw new TypeError("Exact26 R2 requires native policies and complete original command proof providers");
  return await composePostgresApi(options, createDriver, capabilities,
    Object.freeze({ reviewFile: pin.reviewFile, trustedReviewSha256: pin.trustedReviewSha256 }),
    Object.freeze({ sales: preparation.sales, transfers: preparation.transfers }), media) as PostgresApplicationApi;
}
async function composePostgresApi(options: PostgresReadApiOptions, createDriver: PostgresPoolDriverFactory | undefined,
  capabilities: ApplicationCapabilities | null, runtime26Review?: { readonly reviewFile: string; readonly trustedReviewSha256: string },
  runtime26ExistingPreparation?: Runtime26ExistingPreparation, runtime26ProductMedia?: Runtime26ProductMediaConfiguration): Promise<PostgresReadApi | PostgresApplicationApi> {
  const host = checkedHost(options);
  const ownedPool = new BoundedPostgresPool(options.postgres, createDriver);
  let app: FastifyInstance | undefined;
  try {
    const issuer = runtime26Review === undefined ? null : await createNativeRuntime26Issuer(ownedPool, runtime26Review);
    const pool = issuer === null ? ownedPool : issuer.pool;
    if (issuer !== null) {
      const admission = await pool.connect();
      try {
        for (const purpose of capabilities?.coreInitializationRead ? ["CURRENT_FORM_READ"] as const : ["PRODUCT_SEASONS_READ", "CURRENT_CUSTOMER_READ_WRITE", "CURRENT_FORM_READ", "HISTORY_READ", "INVENTORY_ADMISSION"] as const)
          await issuer.runtime26.assertReady(admission, purpose);
      } finally { admission.release(); }
    }
    const policies = host.authorization.kind === "source-confirmed-native"
      ? Object.freeze({ ...createSourceConfirmedPostgresReadAuthorization(pool), transfers: createSourceConfirmedTransferQueryAuthorization() })
      : host.authorization.providers;
    const extensions = capabilities?.nativeReadExtensions ? createSourceConfirmedApplicationReadAuthorization(pool) : null;
    app = Fastify({ logger: false, trustProxy: false, bodyLimit: 65_536 });
    app.addHook("onClose", async () => { await ownedPool.dispose(); });
    const service = createAuthenticationService({ store: new PostgresAuthenticationStore(pool),
      now: host.now, policy: host.policy, passwords: host.credentialCompatibility === "legacy-pbkdf2-v1"
        ? createNodeMigratedLegacyPasswords() : createNodeScryptPasswords() });
    const authentication = Object.freeze({ service, trustedOrigin: host.trustedOrigin });
    const authenticate = createSalesSessionAuthenticator(authentication);
    const authenticateTransfer = createTransferSessionAuthenticator(authentication);
    if (capabilities?.coreInitializationRead) {
      if (!issuer) throw new TypeError("CORE settings require the original independently reviewed issuer");
      const core = createCommittedCoreSettingsRead(pool, issuer.runtime26, capabilities.coreInitializationRead);
      app.register(createAuthenticationHttpPlugin(authentication));
      app.register(createStoreSettingsReadHttpPlugin({ authenticate, dependencies: { authorization: core.authorization,
        reader: new PostgresStoreSettingsReadReader(pool, core.capability) } }));
      app.register(createSettingsAuditHttpPlugin({ authenticate,
        reader: new PostgresSettingsAuditUnitOfWork(new PostgresMaintenanceCommandUnitOfWork(pool), null, core.auditCapability) }));
      await app.ready(); const readyApp = app;
      return Object.freeze({ app: readyApp, close: () => readyApp.close(), trustedOrigin: host.trustedOrigin,
        get postgresBackgroundFailureCount() { return ownedPool.backgroundFailureCount; } });
    }
    if (issuer?.categoryOrderWrite) {
      app.register(createCatalogueMaintenanceHttpPlugin({ authenticate, categoryOnly: true,
        dependencies: { unitOfWork: new PostgresCatalogueMaintenanceUnitOfWork(new PostgresMaintenanceCommandUnitOfWork(pool), issuer.categoryOrderWrite),
          now: host.now, newId: () => randomUUID() } }));
    }
    const productReader = new PostgresProductQueryReader(pool, issuer?.catalogueRetainedDelete ?? null, issuer?.productSeasonArray ?? null);
    let productMedia = host.media;
    if (runtime26ProductMedia !== undefined) {
      if (issuer === null) throw new TypeError("R3 requires the original exact26 issuer");
      const driver = new PostgresMaintenanceCommandUnitOfWork(pool);
      const originalWork = new PostgresProductMaintenanceUnitOfWork(driver, { deletionGuard: null,
        seasonCapability: issuer.productSeasonArray, mediaWriteCapability: issuer.productMediaWrite, imageColorSwapCapability: issuer.imageColorSwap });
      // consume runs within the original product transaction. It must not acquire
      // a second lease (including when the configured pool has just one slot).
      const currentWork = new AsyncLocalStorage<{ tx: ProductMaintenanceTransaction; active: boolean }>();
      const unitOfWork: ProductMaintenanceUnitOfWork = { seasonContract: "product-season-array-v1", transaction: work => originalWork.transaction(async tx => {
        const scope = { tx, active: true };
        try { return await currentWork.run(scope, () => work(tx)); } finally { scope.active = false; }
      }) };
      const stage = new PrivateProductMediaStage({ ...runtime26ProductMedia, codec: new SharpProductImageCodec(), now: () => new Date(host.now()),
        async authorize(input, signal) {
          activeProductRead(signal);
          const action = input.productId === null ? "CREATE" : "EDIT";
          if (input.purpose === "CONSUME") {
            const scope = currentWork.getStore();
            requireDomain(scope?.active, "PRODUCT_MEDIA_NOT_READY", "Original active product transaction required");
            await authorizeProductMaintenance(scope.tx.evidence, input.actor, action);
          } else await originalWork.transaction(async tx => {
            await authorizeProductMaintenance(tx.evidence, input.actor, action);
            if (input.productId !== null) {
              const product = await tx.load(input.productId);
              requireDomain(product !== undefined, "PRODUCT_NOT_FOUND", "Product unavailable");
              requireDomain(product.product.deletedAt === null, "PRODUCT_DELETED", "Deleted product is read-only");
            }
          });
          activeProductRead(signal);
        } });
      const media = new PrivateControlledProductMedia({ deliveryOrigin: host.trustedOrigin, basePath: "/api",
        privateRoots: { [runtime26ProductMedia.rootKey]: runtime26ProductMedia.root }, publicRoots: runtime26ProductMedia.publicRoots,
        manifests: stage.createManifestResolver(), authorization: policies.products, reader: productReader });
      productMedia = media;
      app.register(createProductMaintenanceHttpPlugin({ authenticate, dependencies: { unitOfWork, now: host.now,
        newId: () => randomUUID(), newImageId: () => randomUUID(), imageStage: stage, media } }));
      app.register(createProductMediaHttpPlugin({ authenticate, provider: media, imageStage: stage }));
    }
    // Each register call deliberately preserves the existing plugin's Fastify encapsulation:
    // independent error handlers, per-request identity and independent abort controllers.
    app.register(createAuthenticationHttpPlugin(authentication));
    app.register(createInventoryHttpPlugin({ authenticate, ...(host.inventoryOutputSpool === undefined ? {} : { outputSpool: host.inventoryOutputSpool }), dependencies: { authorization: policies.inventory, reader: new PostgresInventoryQueryReader(pool, issuer?.productSeasonArray ?? null, issuer?.runtime26) } }));
    app.register(createInventoryLedgerQueryHttpPlugin({ authenticate, dependencies: { authorization: policies.inventory, reader: new PostgresInventoryLedgerQueryReader(pool, issuer?.runtime26) } }));
    app.register(createSalesQueryHttpPlugin({ authenticate, dependencies: { authorization: policies.sales, reader: new PostgresSalesQueryReader(pool) } }));
    app.register(createTransferQueryHttpPlugin({ authenticate: authenticateTransfer, dependencies: { authorization: policies.transfers, reader: new PostgresTransferQueryReader(pool) } }));
    app.register(createProductQueryHttpPlugin({ authenticate, dependencies: { authorization: policies.products, reader: productReader, media: productMedia } }));
    if (host.currentForms !== null) app.register(createCurrentFormHttpPlugin({ authenticate,
      reader: new PostgresCurrentFormReader(pool, host.currentForms, issuer === null ? undefined : { runtime26: issuer.runtime26, historicalCustomerExclusion: issuer.historicalCustomerExclusion }) }));
    if (extensions) {
      app.register(createStoreSettingsReadHttpPlugin({ authenticate, dependencies: { authorization: extensions.settings, reader: new PostgresStoreSettingsReadReader(pool) } }));
      app.register(createProductManagementQueryHttpPlugin({ authenticate, dependencies: { authorization: extensions.productManagement, reader: new PostgresProductManagementQueryReader(pool, issuer?.catalogueRetainedDelete ?? null, issuer?.productSeasonArray ?? null, issuer?.runtime26) } }));
      app.register(createCatalogueSettingsReadHttpPlugin({ authenticate, dependencies: { authorization: extensions.catalogueSettings, reader: new PostgresCatalogueSettingsReadReader(pool) } }));
      app.register(createDictionaryReadHttpPlugin({ authenticate, dependencies: { authorization: extensions.dictionary, reader: new PostgresDictionaryReadReader(pool) } }));
      app.register(createPartyReadHttpPlugin({ authenticate: createPartySessionAuthenticator(authentication), dependencies: { authorization: extensions.party, reader: new PostgresPartyReadReader(pool, issuer?.historicalCustomerExclusion ?? null) } }));
      app.register(createImportedHistoryQueryHttpPlugin({ authenticate, dependencies: { authorization: extensions.importedHistory, reader: new PostgresImportedHistoryQueryReader(pool, issuer === null ? undefined : { runtime26: issuer.runtime26 }) } }));
      app.register(createProductDetailsQueryHttpPlugin({ authenticate, dependencies: { authorization: extensions.productDetails, reader: new PostgresProductDetailsQueryReader(pool, issuer?.catalogueRetainedDelete ?? null, issuer?.runtime26), stockReader: new PostgresProductWarehouseStockReader(pool, policies.inventory, null, issuer?.runtime26) } }));
      app.register(createOrganizationMaintenanceReadHttpPlugin({ authenticate, unitOfWork: new PostgresOrganizationMaintenanceReadUnitOfWork(new PostgresMaintenanceCommandUnitOfWork(pool)) }));
      app.register(createSettingsAuditHttpPlugin({ authenticate, reader: new PostgresSettingsAuditUnitOfWork(new PostgresMaintenanceCommandUnitOfWork(pool)) }));
    }
    if (capabilities?.settings) app.register(createStoreSettingsReadHttpPlugin({ authenticate,
      dependencies: { authorization: capabilities.settings, reader: new PostgresStoreSettingsReadReader(pool) } }));
    if (capabilities?.productManagement) app.register(createProductManagementQueryHttpPlugin({ authenticate,
      dependencies: { authorization: capabilities.productManagement, reader: new PostgresProductManagementQueryReader(pool) } }));
    if (capabilities?.catalogueSettings) app.register(createCatalogueSettingsReadHttpPlugin({ authenticate,
      dependencies: { authorization: capabilities.catalogueSettings, reader: new PostgresCatalogueSettingsReadReader(pool) } }));
    if (capabilities?.dictionary) app.register(createDictionaryReadHttpPlugin({ authenticate,
      dependencies: { authorization: capabilities.dictionary, reader: new PostgresDictionaryReadReader(pool) } }));
    if (capabilities?.party) app.register(createPartyReadHttpPlugin({ authenticate: createPartySessionAuthenticator(authentication),
      dependencies: { authorization: capabilities.party, reader: new PostgresPartyReadReader(pool) } }));
    if (capabilities?.importedHistory) app.register(createImportedHistoryQueryHttpPlugin({ authenticate,
      dependencies: { authorization: capabilities.importedHistory, reader: new PostgresImportedHistoryQueryReader(pool) } }));
    if (capabilities?.commands) {
      const c = capabilities.commands;
      if (issuer !== null && runtime26ExistingPreparation === undefined) throw new TypeError("Exact26 commands require the independent R2 selector");
      app.register(createAuthenticatedDocumentCommandsPlugin({ authentication,
        sales: { ...c.sales, now: host.now, unitOfWork: new PostgresSalesUnitOfWork(pool, { catalogueCompleteness: c.catalogueCompleteness,
          ...(issuer === null ? {} : { runtime26: issuer.runtime26, historicalCustomerExclusion: issuer.historicalCustomerExclusion }) }) },
        transfers: { ...c.transfers, now: host.now, unitOfWork: new PostgresTransferUnitOfWork(pool, issuer === null ? undefined : { runtime26: issuer.runtime26 }) },
        nativeManualSalesPreparation: true, nativeManualTransferPreparation: true,
        ...(runtime26ExistingPreparation?.sales === true ? { nativeExistingSalesPreparation: true } : {}),
        ...(runtime26ExistingPreparation?.transfers === true ? { nativeExistingTransferPreparation: true } : {}) }));
    }
    await app.ready();
    const readyApp = app;
    return Object.freeze({ app: readyApp, close: () => readyApp.close(), get postgresBackgroundFailureCount() { return ownedPool.backgroundFailureCount; },
      ...(capabilities === null ? {} : { trustedOrigin: host.trustedOrigin }) });
  } catch (error) {
    // Even failed registration owns its pool. Both operations are idempotent; explicitly
    // dispose as a fallback if Fastify fails before reaching the close hook.
    const failures: unknown[] = [error];
    try { await app?.close(); } catch (closeError) { failures.push(closeError); }
    try { await ownedPool.dispose(); } catch (disposeError) { if (!failures.includes(disposeError)) failures.push(disposeError); }
    if (failures.length > 1) throw new AggregateError(failures, "PostgreSQL read API construction failed; resource cleanup is not confirmed");
    throw error;
  }
}

/** Proof-derived CORE directory policy. The reader rechecks on its original RR client before any data query. */
export function createCommittedCoreSettingsRead(pool: PgSalesPool, runtime26: NativeRuntime26Capability, binding: CommittedCoreReadBinding): {
  readonly authorization: StoreSettingsReadAuthorization; readonly capability: StoreSettingsCoreReadCapability; readonly auditCapability: SettingsAuditCoreReadCapability;
} {
  const fixed = Object.freeze(structuredClone(binding));
  const permit = (value: unknown): void => requireDomain(value, "FORBIDDEN", "Committed CORE member authority unavailable");
  async function scopeOn(client: object, actor: ActorContext, signal: AbortSignal): Promise<Extract<StoreSettingsScope, { kind: "CORE_MEMBERS" }>> {
    permit(!signal.aborted && fixed.profile === "COMMITTED_CORE_SETTINGS_V14");
    await runtime26.assertReady(client, "CURRENT_FORM_READ");
    const query = method<(sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(client, "query");
    const rows = (await query(`/* core-settings:committed-proof */ SELECT a.after_values,r.actor_account_id,
      NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a.after_values->'coreSourceMembers'->'parties') m
        WHERE NOT EXISTS(SELECT 1 FROM naijue_erp.native_party_import_evidence e JOIN naijue_erp.import_source_row sr ON sr.batch_id=e.batch_id AND sr.id=e.source_row_id
          WHERE e.batch_id=r.target_id AND e.source_row_id=(m->>'sourceRowId')::uuid AND e.entity_type=m->>'entity' AND e.source_key=m->>'sourceKey'
            AND e.native_id=(m->>'nativeId')::uuid AND to_jsonb(sr)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.source_snapshot)))) AS sources_match,
      (SELECT count(*)=22 FROM naijue_erp.import_record_accounting_claim c JOIN naijue_erp.import_record rec ON rec.id=c.import_record_id
        JOIN naijue_erp.native_party_import_evidence e ON e.batch_id=c.import_batch_id AND e.entity_type='WAREHOUSE' AND e.native_id=c.target_id
        WHERE c.operation_id=r.id AND c.import_batch_id=r.target_id AND c.target_type='WAREHOUSE' AND c.checkpoint_sequence=1
          AND rec.import_batch_id=c.import_batch_id AND rec.target_id=c.target_id AND rec.status='IMPORTED' AND rec.id=(e.warehouse_record->>'id')::uuid) AS claims_match
      FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id
      JOIN naijue_erp.import_batch b ON b.id=r.target_id
      WHERE r.id=$1::uuid AND r.target_id=$2::uuid AND r.target_type='IMPORT' AND r.action='IMPORT_CORE_STAGE' AND r.status='COMMITTED'
        AND a.action=r.action AND a.object_type='IMPORT' AND a.object_id=r.target_id AND a.actor_account_id=r.actor_account_id
        AND a.old_version=1 AND a.new_version=2 AND a.after_values->>'coreSourceDigest'=$3
        AND a.after_values->>'phase'='CORE_INITIALIZED_V1' AND a.after_values->'fullFrozen'='false'::jsonb
        AND r.result_data->>'coreSourceDigest'=$3 AND r.result_data->>'phase'='CORE_INITIALIZED_V1'
        AND b.mapping_version='V2_HISTORY_NULLABLE_1' LIMIT 2`, [fixed.operationId, fixed.batchId, fixed.coreSourceDigest])).rows;
    permit(rows.length === 1 && rows[0]!.sources_match === true && rows[0]!.claims_match === true);
    const birth = rows[0]!.after_values as { coreSourceMembers: CoreSourceMembers };
    validateCoreSourceMembers(birth.coreSourceMembers);
    const identity = (await query(`/* core-settings:current-identity */ SELECT a.id,a.staff_id,a.login_enabled,s.role,s.employment_status,s.hall_id,h.enabled AS hall_enabled
      FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE a.id=$1::uuid LIMIT 2`, [actor.accountId])).rows;
    const current = identity[0];
    permit(!signal.aborted && identity.length === 1 && current?.login_enabled === true && current.employment_status === "在职"
      && (current.role === "ADMIN" || current.role === "WAREHOUSE") && current.hall_id === actor.hallId
      && (current.hall_id === null || current.hall_enabled === true)
      && birth.coreSourceMembers.accounts.some(account => account.id === current.id && account.staff_id === current.staff_id));
    return Object.freeze({ kind: "CORE_MEMBERS", hallIds: Object.freeze(birth.coreSourceMembers.parties.filter(row => row.entity === "HALL").map(row => row.nativeId).sort()),
      warehouseIds: Object.freeze(birth.coreSourceMembers.parties.filter(row => row.entity === "WAREHOUSE").map(row => row.nativeId).sort()) });
  }
  return Object.freeze({
    authorization: Object.freeze<StoreSettingsReadAuthorization>({ async authorize(actor, intent, signal) {
      const client = await pool.connect();
      try {
        const scope = await scopeOn(client, actor, signal);
        return { kind: intent.kind, operation: intent.operation, scope, references: "REFERENCES", targetId: intent.operation === "detail" ? intent.parameters.id : null };
      } finally { client.release(); }
    } }),
    capability: Object.freeze<StoreSettingsCoreReadCapability>({ profile: "COMMITTED_CORE_SETTINGS_V14", async assertReady(client, read) {
      const actual = await scopeOn(client, read.actor, read.signal), proposed = read.grant.scope;
      permit(proposed.kind === "CORE_MEMBERS" && JSON.stringify([...proposed.hallIds].sort()) === JSON.stringify(actual.hallIds)
        && JSON.stringify([...proposed.warehouseIds].sort()) === JSON.stringify(actual.warehouseIds));
    } }),
    auditCapability: Object.freeze<SettingsAuditCoreReadCapability>({ profile: "COMMITTED_CORE_SETTINGS_V14", async assertReady(context, actor, signal) {
      const actual = await scopeOn(maintenanceContextClient(context, pool), actor, signal);
      maintenanceContextClient(context, pool);
      return Object.freeze({ hallIds: actual.hallIds, warehouseIds: actual.warehouseIds });
    } })
  });
}
