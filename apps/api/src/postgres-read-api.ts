import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
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
import { createInventoryLedgerQueryHttpPlugin } from "./inventory-ledger-query-http.ts";
import { createSalesQueryHttpPlugin } from "./sales-query-http.ts";
import { createTransferQueryHttpPlugin } from "./transfer-query-http.ts";
import { createProductQueryHttpPlugin } from "./product-query-http.ts";
import { createCurrentFormHttpPlugin } from "./current-form-http.ts";
import { createAuthenticatedDocumentCommandsPlugin } from "./authenticated-document-commands.ts";
import { createStoreSettingsReadHttpPlugin } from "./store-settings-read-http.ts";
import { PostgresStoreSettingsReadReader } from "../../../adapters/postgres/src/store-settings-read-reader.ts";
import { PostgresSalesUnitOfWork } from "../../../adapters/postgres/src/sales-unit-of-work.ts";
import { PostgresTransferUnitOfWork } from "../../../adapters/postgres/src/transfer-unit-of-work.ts";
import type { NativeCatalogueCompletenessVerifier } from "../../../adapters/postgres/src/sales-native-facts.ts";
import type { SalesDependencies } from "../../../packages/application/src/ports.ts";
import type { TransferDependencies } from "../../../packages/application/src/transfer-ports.ts";
import type { StoreSettingsReadAuthorization } from "../../../packages/application/src/store-settings-read-ports.ts";
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
export interface PostgresApplicationApiOptions extends PostgresReadApiOptions {
  readonly documentCommands?: PostgresDocumentCommandsCapability;
  readonly storeSettingsRead?: { readonly authorization: StoreSettingsReadAuthorization };
  readonly productManagementRead?: { readonly authorization: ProductManagementQueryAuthorization };
  readonly catalogueSettingsRead?: { readonly authorization: CatalogueSettingsReadAuthorization };
  readonly dictionaryRead?: { readonly authorization: DictionaryReadAuthorization };
  readonly partyRead?: { readonly authorization: PartyReadAuthorization };
  /** Explicit historical policy only. Native/LIVE authorization never enables this dataset. */
  readonly importedHistoryRead?: { readonly authorization: ImportedHistoryReadAuthorization };
}
type ApplicationCapabilities = { readonly commands: PostgresDocumentCommandsCapability | null;
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
  return Object.freeze({ commands, settings, productManagement, catalogueSettings, dictionary, party, importedHistory });
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
  // Capture provider methods and origins before the first await. Changing the caller's
  // configuration object later cannot replace these boundaries or enable a write plugin.
  return {
    trustedOrigin: auth.trustedOrigin, now: auth.now, policy: auth.policy, credentialCompatibility: auth.credentialCompatibility,
    authorization: checkedAuthorization(options.authorization), currentForms: checkedCurrentForms(options),
    media: media === null ? null : Object.freeze({ deliveryOrigin: media.deliveryOrigin,
      resolveThumbnails: media.resolveThumbnails.bind(media), resolveOriginal: media.resolveOriginal.bind(media) })
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
async function composePostgresApi(options: PostgresReadApiOptions, createDriver: PostgresPoolDriverFactory | undefined,
  capabilities: ApplicationCapabilities | null): Promise<PostgresReadApi | PostgresApplicationApi> {
  const host = checkedHost(options);
  const pool = new BoundedPostgresPool(options.postgres, createDriver);
  let app: FastifyInstance | undefined;
  try {
    const policies = host.authorization.kind === "source-confirmed-native"
      ? Object.freeze({ ...createSourceConfirmedPostgresReadAuthorization(pool), transfers: createSourceConfirmedTransferQueryAuthorization() })
      : host.authorization.providers;
    app = Fastify({ logger: false, trustProxy: false, bodyLimit: 65_536 });
    app.addHook("onClose", async () => { await pool.dispose(); });
    const service = createAuthenticationService({ store: new PostgresAuthenticationStore(pool),
      now: host.now, policy: host.policy, passwords: host.credentialCompatibility === "legacy-pbkdf2-v1"
        ? createNodeMigratedLegacyPasswords() : createNodeScryptPasswords() });
    const authentication = Object.freeze({ service, trustedOrigin: host.trustedOrigin });
    const authenticate = createSalesSessionAuthenticator(authentication);
    const authenticateTransfer = createTransferSessionAuthenticator(authentication);
    // Each register call deliberately preserves the existing plugin's Fastify encapsulation:
    // independent error handlers, per-request identity and independent abort controllers.
    app.register(createAuthenticationHttpPlugin(authentication));
    app.register(createInventoryHttpPlugin({ authenticate, dependencies: { authorization: policies.inventory, reader: new PostgresInventoryQueryReader(pool) } }));
    app.register(createInventoryLedgerQueryHttpPlugin({ authenticate, dependencies: { authorization: policies.inventory, reader: new PostgresInventoryLedgerQueryReader(pool) } }));
    app.register(createSalesQueryHttpPlugin({ authenticate, dependencies: { authorization: policies.sales, reader: new PostgresSalesQueryReader(pool) } }));
    app.register(createTransferQueryHttpPlugin({ authenticate: authenticateTransfer, dependencies: { authorization: policies.transfers, reader: new PostgresTransferQueryReader(pool) } }));
    app.register(createProductQueryHttpPlugin({ authenticate, dependencies: { authorization: policies.products, reader: new PostgresProductQueryReader(pool), media: host.media } }));
    if (host.currentForms !== null) app.register(createCurrentFormHttpPlugin({ authenticate,
      reader: new PostgresCurrentFormReader(pool, host.currentForms) }));
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
      app.register(createAuthenticatedDocumentCommandsPlugin({ authentication,
        sales: { ...c.sales, now: host.now, unitOfWork: new PostgresSalesUnitOfWork(pool, { catalogueCompleteness: c.catalogueCompleteness }) },
        transfers: { ...c.transfers, now: host.now, unitOfWork: new PostgresTransferUnitOfWork(pool) },
        nativeManualSalesPreparation: true, nativeManualTransferPreparation: true }));
    }
    await app.ready();
    const readyApp = app;
    return Object.freeze({ app: readyApp, close: () => readyApp.close(), get postgresBackgroundFailureCount() { return pool.backgroundFailureCount; },
      ...(capabilities === null ? {} : { trustedOrigin: host.trustedOrigin }) });
  } catch (error) {
    // Even failed registration owns its pool. Both operations are idempotent; explicitly
    // dispose as a fallback if Fastify fails before reaching the close hook.
    const failures: unknown[] = [error];
    try { await app?.close(); } catch (closeError) { failures.push(closeError); }
    try { await pool.dispose(); } catch (disposeError) { if (!failures.includes(disposeError)) failures.push(disposeError); }
    if (failures.length > 1) throw new AggregateError(failures, "PostgreSQL read API construction failed; resource cleanup is not confirmed");
    throw error;
  }
}
