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
import { createAuthenticationHttpPlugin, createSalesSessionAuthenticator } from "./authentication.ts";
import { createTransferSessionAuthenticator } from "./transfer-authentication.ts";
import { createInventoryHttpPlugin } from "./inventory-http.ts";
import { createInventoryLedgerQueryHttpPlugin } from "./inventory-ledger-query-http.ts";
import { createSalesQueryHttpPlugin } from "./sales-query-http.ts";
import { createTransferQueryHttpPlugin } from "./transfer-query-http.ts";
import { createProductQueryHttpPlugin } from "./product-query-http.ts";
import { createCurrentFormHttpPlugin } from "./current-form-http.ts";

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
    || !Object.hasOwn(options, "productMedia") || (media !== null && (!media || !exactHttpsOrigin(media.deliveryOrigin)
      || typeof media.resolveThumbnails !== "function" || typeof media.resolveOriginal !== "function"))) {
    throw new TypeError("PostgreSQL read API requires explicit trusted HTTPS origin, authentication policy/clock, read authorization and media availability");
  }
  // Capture provider methods and origins before the first await. Changing the caller's
  // configuration object later cannot replace these boundaries or enable a write plugin.
  return {
    trustedOrigin: auth.trustedOrigin, now: auth.now, policy: auth.policy,
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
      now: host.now, policy: host.policy, passwords: createNodeScryptPasswords() });
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
    await app.ready();
    const readyApp = app;
    return Object.freeze({ app: readyApp, close: () => readyApp.close(), get postgresBackgroundFailureCount() { return pool.backgroundFailureCount; } });
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
