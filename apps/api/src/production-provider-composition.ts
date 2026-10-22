import { randomUUID } from "node:crypto";
import { PostgresImportedCatalogueCompletenessVerifier } from "../../../adapters/postgres/src/catalogue-completeness.ts";
import type { BoundedPostgresConfig, PostgresPoolDriverFactory } from "../../../adapters/postgres/src/bounded-pool.ts";
import { createSalesActionAuthorization } from "../../../packages/application/src/sales-authorization.ts";
import { createNativeTransactionSalesBusinessRules } from "../../../packages/application/src/sales-native-facts.ts";
import { createSourceConfirmedTransferAuthorization, createSourceConfirmedTransferReferences } from "../../../packages/application/src/transfer-policy.ts";
import { createSourceConfirmedCurrentFormAuthorization } from "../../../packages/application/src/source-confirmed-current-form-authorization.ts";
import { createSourceAuthenticationPolicy } from "../../../packages/authentication/src/source-policy.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { createPostgresApplicationApi } from "./postgres-read-api.ts";
import type { PostgresApplicationApiOptions, PostgresApplicationApi } from "./postgres-read-api.ts";

export const PRODUCTION_PUBLIC_ORIGIN = "https://1n5635n614.goho.co";
export interface ProductionRuntimeConfiguration {
  readonly schemaVersion: 1;
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
  const c = bag(input, ["schemaVersion", "profile", "documentCommands", "publicOrigin", "http", "assets", "build", "postgres", "authentication"]);
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
  return structuredClone(c) as unknown as ProductionRuntimeConfiguration;
}

export function productionApplicationOptions(input: unknown): PostgresApplicationApiOptions {
  const config = parseProductionRuntimeConfiguration(input);
  return {
    postgres: config.postgres, productMedia: null, authorization: { mode: "source-confirmed-native" },
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
