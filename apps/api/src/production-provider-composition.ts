import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgresImportedCatalogueCompletenessVerifier } from "../../../adapters/postgres/src/catalogue-completeness.ts";
import type { BoundedPostgresConfig, PostgresPoolDriverFactory } from "../../../adapters/postgres/src/bounded-pool.ts";
import { createSalesActionAuthorization } from "../../../packages/application/src/sales-authorization.ts";
import { createNativeTransactionSalesBusinessRules } from "../../../packages/application/src/sales-native-facts.ts";
import { createSourceConfirmedTransferAuthorization, createSourceConfirmedTransferReferences } from "../../../packages/application/src/transfer-policy.ts";
import { createSourceConfirmedCurrentFormAuthorization } from "../../../packages/application/src/source-confirmed-current-form-authorization.ts";
import { createSourceAuthenticationPolicy } from "../../../packages/authentication/src/source-policy.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { createPostgresApplicationApi } from "./postgres-read-api.ts";
import { createPostgresRuntime26ApplicationApi } from "./postgres-read-api.ts";
import { createPostgresRuntime26MediaApplicationApi, createPostgresRuntime26DocumentApplicationApi } from "./postgres-read-api.ts";
import { createPostgresRuntime26HistoryRevisionApplicationApi } from "./postgres-read-api.ts";
import type { CredentialRequestTag } from "../../../packages/application/src/maintenance-commit-ports.ts";
import type { Runtime26HistoryRevisionConfiguration } from "./postgres-read-api.ts";
import type { InventoryOutputSpoolOptions } from "./inventory-http.ts";
import { checkedCoreReadModules } from "./postgres-read-api.ts";
import type { CoreReadModule, PostgresApplicationApiOptions, PostgresApplicationApi, CommittedCoreReadBinding } from "./postgres-read-api.ts";

export const PRODUCTION_PUBLIC_ORIGIN = "https://1n5635n614.goho.co";
export interface ProductionRuntimeConfiguration {
  readonly schemaVersion: 1;
  readonly inventoryOutputSpool?: InventoryOutputSpoolOptions;
  readonly profile: "source-confirmed-native-v1";
  /** R1 must select DISABLED. Opening command routes is a separate explicit deployment choice. */
  readonly documentCommands: "DISABLED" | "NATIVE_RUNTIME";
  readonly publicOrigin: typeof PRODUCTION_PUBLIC_ORIGIN;
  readonly http: { readonly host: "0.0.0.0"; readonly port: 3000; readonly acceptedHosts: readonly string[] };
  readonly assets: { readonly root: string; readonly entry: string };
  readonly build: { readonly sourceCommit: string; readonly buildId: string };
  readonly postgres: BoundedPostgresConfig;
  readonly authentication: {
    readonly sessionTtlSeconds: number;
    readonly policy: "source-confirmed-v1";
  };
}
function bag(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)
      || !("value" in Object.getOwnPropertyDescriptor(value, key)!))) throw new TypeError("Incomplete or unknown production configuration fields");
  return value as Record<string, unknown>;
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(value); }
function integer(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max; }

/** JSON data only, with no environment, URI, credential or policy defaults. Validation
 * precedes driver creation. The pool additionally validates every finite PG setting. */
export function parseProductionRuntimeConfiguration(input: unknown): ProductionRuntimeConfiguration {
  const c = bag(input, ["schemaVersion", "profile", "documentCommands", "publicOrigin", "http", "assets", "build", "postgres", "authentication", ...(input !== null && typeof input === "object" && Object.hasOwn(input, "inventoryOutputSpool") ? ["inventoryOutputSpool"] : [])]);
  const http = bag(c.http, ["host", "port", "acceptedHosts"]), assets = bag(c.assets, ["root", "entry"]), build = bag(c.build, ["sourceCommit", "buildId"]);
  const auth = bag(c.authentication, ["sessionTtlSeconds", "policy"]);
  const pg = bag(c.postgres, ["target", "max", "maxPendingAcquisitions", "connectionTimeoutMillis", "acquisitionTimeoutMillis", "queryTimeoutMillis", "statementTimeoutMillis",
    "lockTimeoutMillis", "idleInTransactionTimeoutMillis", "idlePoolTimeoutMillis", "disposeGraceMillis", "disposeTimeoutMillis"]);
  const target = bag(pg.target, ["host", "port", "database", "user", "password", "ssl"]);
  if (target.ssl !== false) {
    const ssl = bag(target.ssl, target.ssl && typeof target.ssl === "object" && Object.hasOwn(target.ssl, "ca") ? ["rejectUnauthorized", "ca"] : ["rejectUnauthorized"]);
    if (ssl.rejectUnauthorized !== true || ("ca" in ssl && !text(ssl.ca))) throw new TypeError("Explicit verified database TLS configuration required");
  }
  if (c.schemaVersion !== 1 || c.profile !== "source-confirmed-native-v1" || c.publicOrigin !== PRODUCTION_PUBLIC_ORIGIN
    || (c.documentCommands !== "DISABLED" && c.documentCommands !== "NATIVE_RUNTIME")
    || http.host !== "0.0.0.0" || http.port !== 3000 || !Array.isArray(http.acceptedHosts) || http.acceptedHosts.length < 1 || http.acceptedHosts.length > 8
    || !http.acceptedHosts.every((v: unknown) => typeof v === "string" && /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[1-9]\d{0,4})?$/.test(v))
    || new Set(http.acceptedHosts).size !== http.acceptedHosts.length || !text(assets.root) || !text(assets.entry)
    || typeof build.sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(build.sourceCommit) || !text(build.buildId) || build.buildId.length > 100
    || !integer(auth.sessionTtlSeconds, 1, 2147483647) || auth.policy !== "source-confirmed-v1") throw new TypeError("Invalid explicit production host or authentication configuration");
  if (Object.hasOwn(c, "inventoryOutputSpool")) {
    const spool = bag(c.inventoryOutputSpool, ["directory", "maxBytes", "maxConcurrent", "maxDurationMs"]);
    if (spool.directory !== "/private/inventory-exports" || spool.maxBytes !== 536870912 || spool.maxConcurrent !== 1 || spool.maxDurationMs !== 120000)
      throw new TypeError("Only the approved bounded private inventory output configuration is supported");
  }
  return structuredClone(c) as unknown as ProductionRuntimeConfiguration;
}

export function productionApplicationOptions(input: unknown): PostgresApplicationApiOptions {
  const config = parseProductionRuntimeConfiguration(input);
  return {
    ...(config.inventoryOutputSpool === undefined ? {} : { inventoryOutputSpool: config.inventoryOutputSpool }),
    postgres: config.postgres, productMedia: null, authorization: { mode: "source-confirmed-native" },
    nativeReadExtensions: { profile: "source-confirmed-r1-v1" },
    authentication: { trustedOrigin: config.publicOrigin, now: () => new Date().toISOString(), credentialCompatibility: "legacy-pbkdf2-v1",
      policy: createSourceAuthenticationPolicy(config.authentication.sessionTtlSeconds) },
    currentForms: { authorization: createSourceConfirmedCurrentFormAuthorization() },
    ...(config.documentCommands === "DISABLED" ? {} : { documentCommands: {
      sales: { authorization: createSalesActionAuthorization(), rules: createNativeTransactionSalesBusinessRules(), newId: kind => entityId(kind, randomUUID()) },
      transfers: { authorization: createSourceConfirmedTransferAuthorization(), references: createSourceConfirmedTransferReferences(), newId: kind => entityId(kind, randomUUID()) },
      catalogueCompleteness: new PostgresImportedCatalogueCompletenessVerifier(), nativeManualSalesPreparation: true, nativeManualTransferPreparation: true
    } })
  };
}
/** A single owned bounded pool is constructed inside the existing application
 * factory. All native facts/completeness checks run on the original command tx.
 * No fixtures, migrations, seeds, fake authentication or retry loop are composed. */
export async function createProductionApplicationApi(input: unknown, driver?: PostgresPoolDriverFactory): Promise<PostgresApplicationApi> {
  return createPostgresApplicationApi(productionApplicationOptions(input), driver);
}

/** Independent R1 successor. The old closed nine-field parser/factory/profile
 * above remain unchanged and reject this profile. No command enablement here. */
export interface ProductionRuntime26Configuration extends Omit<ProductionRuntimeConfiguration, "profile" | "documentCommands"> {
  readonly profile: "source-confirmed-native-exact26-r1-v1";
  readonly documentCommands: "DISABLED";
  readonly runtime26Review: { readonly reviewFile: string; readonly trustedReviewSha256: string };
  /** Approved v14 only: real committed CORE identity, supplied by the deployment owner. */
  readonly coreInitializationRead?: CommittedCoreReadBinding;
  readonly coreReadModules?: readonly CoreReadModule[];
  readonly catalogueMaintenance?: true;
  readonly paymentMaintenance?: true;
  readonly partyMaintenance?: true;
  readonly staffMaintenance?: true;
}
export function parseProductionRuntime26Configuration(input: unknown): ProductionRuntime26Configuration {
  const coreSelected = input !== null && typeof input === "object" && Object.hasOwn(input, "coreInitializationRead");
  const c = bag(input, ["schemaVersion", "profile", "documentCommands", "publicOrigin", "http", "assets", "build", "postgres", "authentication", "runtime26Review", ...(coreSelected ? ["coreInitializationRead"] : []), ...(input !== null && typeof input === "object" && Object.hasOwn(input, "staffMaintenance") ? ["staffMaintenance"] : []), ...(input !== null && typeof input === "object" && Object.hasOwn(input, "partyMaintenance") ? ["partyMaintenance"] : []), ...(input !== null && typeof input === "object" && Object.hasOwn(input, "paymentMaintenance") ? ["paymentMaintenance"] : []), ...(input !== null && typeof input === "object" && Object.hasOwn(input, "catalogueMaintenance") ? ["catalogueMaintenance"] : []), ...(input !== null && typeof input === "object" && Object.hasOwn(input, "coreReadModules") ? ["coreReadModules"] : []), ...(input !== null && typeof input === "object" && Object.hasOwn(input, "inventoryOutputSpool") ? ["inventoryOutputSpool"] : [])]);
  const review = bag(c.runtime26Review, ["reviewFile", "trustedReviewSha256"]);
  if (c.profile !== "source-confirmed-native-exact26-r1-v1" || c.documentCommands !== "DISABLED"
    || !text(review.reviewFile) || !path.isAbsolute(review.reviewFile) || path.resolve(review.reviewFile) !== review.reviewFile
    || typeof review.trustedReviewSha256 !== "string" || !/^[0-9a-f]{64}$/.test(review.trustedReviewSha256))
    throw new TypeError("Explicit exact26 R1 profile, disabled commands and closed independent review pin required");
  let coreInitializationRead: CommittedCoreReadBinding | undefined;
  if (coreSelected) {
    if (Object.hasOwn(c, "inventoryOutputSpool")) throw new TypeError("CORE settings profile does not mount inventory output");
    const core = bag(c.coreInitializationRead, ["profile", "batchId", "operationId", "coreSourceDigest"]);
    entityId("operation", core.batchId as string); entityId("operation", core.operationId as string);
    if (core.profile !== "COMMITTED_CORE_SETTINGS_V14" || typeof core.coreSourceDigest !== "string" || !/^[a-f0-9]{64}$/.test(core.coreSourceDigest))
      throw new TypeError("Exact committed CORE receipt, batch and input digest required");
    coreInitializationRead = structuredClone(core) as unknown as CommittedCoreReadBinding;
  }
  if (Object.hasOwn(c, "catalogueMaintenance") && c.catalogueMaintenance !== true) throw new TypeError("Explicit catalogue maintenance selection required");
  if (Object.hasOwn(c, "paymentMaintenance") && c.paymentMaintenance !== true) throw new TypeError("Explicit payment maintenance selection required");
  if (Object.hasOwn(c, "partyMaintenance") && c.partyMaintenance !== true) throw new TypeError("Explicit party maintenance selection required");
  if (Object.hasOwn(c, "staffMaintenance") && c.staffMaintenance !== true) throw new TypeError("Explicit staff maintenance selection required");
  const coreReadModules = Object.hasOwn(c, "coreReadModules") ? checkedCoreReadModules(c.coreReadModules) : undefined;
  if (coreReadModules !== undefined && !coreSelected) throw new TypeError("CORE modules require the committed CORE profile");
  const { runtime26Review: _review, coreInitializationRead: _core, coreReadModules: _modules, catalogueMaintenance: _catalogue, paymentMaintenance: _payment, partyMaintenance: _party, staffMaintenance: _staff, ...base } = c;
  const checked = parseProductionRuntimeConfiguration({ ...base, profile: "source-confirmed-native-v1" });
  return { ...checked, profile: "source-confirmed-native-exact26-r1-v1", documentCommands: "DISABLED",
    runtime26Review: { reviewFile: review.reviewFile, trustedReviewSha256: review.trustedReviewSha256 },
    ...(c.catalogueMaintenance === true ? { catalogueMaintenance: true as const } : {}),
    ...(c.paymentMaintenance === true ? { paymentMaintenance: true as const } : {}),
    ...(c.partyMaintenance === true ? { partyMaintenance: true as const } : {}),
    ...(c.staffMaintenance === true ? { staffMaintenance: true as const } : {}),
    ...(coreInitializationRead === undefined ? {} : { coreInitializationRead }), ...(coreReadModules === undefined ? {} : { coreReadModules }) };
}
/** Host-only adaptation after explicit successor validation. The metadata review
 * never enters public build/health output or the legacy application factory. */
export function productionRuntime26HostConfiguration(input: unknown): ProductionRuntimeConfiguration {
  const { runtime26Review: _review, coreInitializationRead: _core, coreReadModules: _modules, catalogueMaintenance: _catalogue, paymentMaintenance: _payment, partyMaintenance: _party, staffMaintenance: _staff, ...base } = parseProductionRuntime26Configuration(input);
  return parseProductionRuntimeConfiguration({ ...base, profile: "source-confirmed-native-v1" });
}
export async function createProductionRuntime26ApplicationApi(input: unknown, driver?: PostgresPoolDriverFactory,
  staffCredentialRequestTag: CredentialRequestTag | null = null): Promise<PostgresApplicationApi> {
  const config = parseProductionRuntime26Configuration(input);
  if (staffCredentialRequestTag !== null && (typeof staffCredentialRequestTag !== "function" || config.staffMaintenance !== true))
    throw new TypeError("Stable staff credential capability requires explicit staff maintenance selection");
  const options = { ...productionApplicationOptions(productionRuntime26HostConfiguration(config)),
    ...(config.catalogueMaintenance === true ? { catalogueMaintenance: true as const } : {}),
    ...(config.paymentMaintenance === true ? { paymentMaintenance: true as const } : {}),
    ...(config.partyMaintenance === true ? { partyMaintenance: true as const } : {}),
    ...(config.staffMaintenance === true ? { staffMaintenance: { credentialRequestTag: staffCredentialRequestTag } } : {}) };
  if (config.coreInitializationRead !== undefined) {
    const { nativeReadExtensions: _extensions, currentForms: _forms, ...coreOptions } = options;
    return createPostgresRuntime26ApplicationApi({ ...coreOptions, coreInitializationRead: config.coreInitializationRead, ...(config.coreReadModules === undefined ? {} : { coreReadModules: config.coreReadModules }) }, config.runtime26Review, driver);
  }
  return createPostgresRuntime26ApplicationApi(options, config.runtime26Review, driver);
}

/** Explicit trusted host entry. The existing private R1 configuration is reused;
 * the separately supplied HISTORY authorization never comes from JSON/HTTP. */
export async function createProductionRuntime26HistoryRevisionApplicationApi(input: unknown,
  history: Runtime26HistoryRevisionConfiguration, driver?: PostgresPoolDriverFactory): Promise<PostgresApplicationApi> {
  const config = parseProductionRuntime26Configuration(input);
  if (config.coreInitializationRead !== undefined) throw new TypeError("CORE initialization does not enable historical document writes");
  return createPostgresRuntime26HistoryRevisionApplicationApi(
    productionApplicationOptions(productionRuntime26HostConfiguration(config)), config.runtime26Review, history, driver);
}

/** Explicit R2 command entry. Neither old19 nor R1 accepts these selectors. */
export interface ProductionRuntime26R2Configuration extends Omit<ProductionRuntimeConfiguration, "profile" | "documentCommands"> {
  readonly profile: "source-confirmed-native-exact26-r2-v1";
  readonly documentCommands: "NATIVE_RUNTIME";
  readonly runtime26Review: ProductionRuntime26Configuration["runtime26Review"];
  readonly existingPreparation: { readonly sales: boolean; readonly transfers: boolean };
}
export function parseProductionRuntime26R2Configuration(input: unknown): ProductionRuntime26R2Configuration {
  const c = bag(input, ["schemaVersion", "profile", "documentCommands", "publicOrigin", "http", "assets", "build", "postgres", "authentication", "runtime26Review", "existingPreparation", ...(input !== null && typeof input === "object" && Object.hasOwn(input, "inventoryOutputSpool") ? ["inventoryOutputSpool"] : [])]);
  const preparation = bag(c.existingPreparation, ["sales", "transfers"]);
  if (c.profile !== "source-confirmed-native-exact26-r2-v1" || c.documentCommands !== "NATIVE_RUNTIME"
    || typeof preparation.sales !== "boolean" || typeof preparation.transfers !== "boolean")
    throw new TypeError("Explicit R2 native commands and independent existing-preparation selectors required");
  const { existingPreparation: _preparation, ...metadata } = c;
  const checked = parseProductionRuntime26Configuration({ ...metadata, profile: "source-confirmed-native-exact26-r1-v1", documentCommands: "DISABLED" });
  return { ...checked, profile: "source-confirmed-native-exact26-r2-v1", documentCommands: "NATIVE_RUNTIME",
    existingPreparation: { sales: preparation.sales, transfers: preparation.transfers } };
}
export function productionRuntime26R2HostConfiguration(input: unknown): ProductionRuntimeConfiguration {
  const { runtime26Review: _review, existingPreparation: _preparation, ...base } = parseProductionRuntime26R2Configuration(input);
  return parseProductionRuntimeConfiguration({ ...base, profile: "source-confirmed-native-v1" });
}
export async function createProductionRuntime26R2ApplicationApi(input: unknown, driver?: PostgresPoolDriverFactory): Promise<PostgresApplicationApi> {
  const config = parseProductionRuntime26R2Configuration(input);
  return createPostgresRuntime26DocumentApplicationApi(productionApplicationOptions(productionRuntime26R2HostConfiguration(config)),
    config.runtime26Review, config.existingPreparation, driver);
}

/** R3 uses the original media implementation with an explicit private root.
 * R1/R2 remain closed to these fields and never acquire maintenance routes. */
export interface ProductionRuntime26R3Configuration extends Omit<ProductionRuntime26R2Configuration, "profile"> {
  readonly profile: "source-confirmed-native-exact26-r3-v1";
  readonly productMedia: { readonly root: string; readonly rootKey: string };
}
export function parseProductionRuntime26R3Configuration(input: unknown): ProductionRuntime26R3Configuration {
  const c = bag(input, ["schemaVersion", "profile", "documentCommands", "publicOrigin", "http", "assets", "build", "postgres", "authentication", "runtime26Review", "existingPreparation", "productMedia", ...(input !== null && typeof input === "object" && Object.hasOwn(input, "inventoryOutputSpool") ? ["inventoryOutputSpool"] : [])]);
  const media = bag(c.productMedia, ["root", "rootKey"]);
  if (c.profile !== "source-confirmed-native-exact26-r3-v1" || !text(media.root) || !path.isAbsolute(media.root)
    || path.resolve(media.root) !== media.root || typeof media.rootKey !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(media.rootKey))
    throw new TypeError("Explicit R3 private product media root and key required");
  const { productMedia: _media, ...base } = c;
  const checked = parseProductionRuntime26R2Configuration({ ...base, profile: "source-confirmed-native-exact26-r2-v1" });
  return { ...checked, profile: "source-confirmed-native-exact26-r3-v1", productMedia: { root: media.root, rootKey: media.rootKey } };
}
export function productionRuntime26R3HostConfiguration(input: unknown): ProductionRuntimeConfiguration {
  const { productMedia: _media, ...base } = parseProductionRuntime26R3Configuration(input);
  return productionRuntime26R2HostConfiguration({ ...base, profile: "source-confirmed-native-exact26-r2-v1" });
}
export async function createProductionRuntime26R3ApplicationApi(input: unknown, driver?: PostgresPoolDriverFactory): Promise<PostgresApplicationApi> {
  const config = parseProductionRuntime26R3Configuration(input);
  return createPostgresRuntime26MediaApplicationApi(productionApplicationOptions(productionRuntime26R3HostConfiguration(config)),
    config.runtime26Review, config.existingPreparation, { ...config.productMedia, publicRoots: [config.assets.root] }, driver);
}
