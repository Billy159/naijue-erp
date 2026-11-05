import { createHash } from "node:crypto";
import type { CutoffImportBatch, CutoffImportCommand, CutoffImportItem, CutoffImportResult, CutoffImportStore, ImportCheckpoint, ImportCounts, ImportTarget, CoreImportCommand, CoreStageCommand, CoreImportCheckpoint, BarcodeSchemeInitializationCommand } from "../../../packages/application/src/inventory-cutoff-import.ts";
import { COMPLETE_SCOPE_DECISION, stableImportId, validateCutoffImportCommand, validateImportCounts, isCoreImportCommand, validateBarcodeSchemeInitializationCommand } from "../../../packages/application/src/inventory-cutoff-import.ts";
import { requestHash } from "../../../packages/application/src/request-hash.ts";
import { HISTORY_MAPPING_VERSION } from "../../../packages/application/src/history-storage-contract.ts";
import { historyImportStageMetadata } from "../../../packages/application/src/history-import-lifecycle.ts";
import type { HistoryImportReconciliation } from "../../../packages/application/src/history-import-lifecycle.ts";
import type { NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import { checkedNativeRuntime26Capability, assertReviewedNativeImportSchema } from "../../../packages/application/src/native-import-schema-contract.ts";
import { reconcileHistoryImport } from "./history-import-lifecycle.ts";
import { reconcileHistoryTypedPublication } from "./history-typed-publication.ts";
import type { HistoryTypedClosurePlan } from "../../../packages/application/src/history-typed-closure.ts";
import { authorizeNativeImportAccountingCommand, hasNativeImportAccountingMetadata, validateNativeImportAccountingCommand } from "../../../packages/application/src/native-import-record-accounting.ts";
import type { NativeImportAccountingCommand } from "../../../packages/application/src/native-import-record-accounting.ts";
import { createNativeImportRecordAccountant, reconcileNativeImportStockConservation, claimNativeCoreWarehouseRecords } from "./native-import-record-accounting.ts";
import type { NewBaselineInsertResults } from "./native-import-record-accounting.ts";
import { assertNativeImportAccountingGuards } from "./native-import-accounting-capability.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { auditJson, integerValue, jsonObject, nullableString, stringValue } from "./codec.ts";
import type { PgSalesClient, PgSalesPool, PgSalesResult } from "./sales-unit-of-work.ts";
import { captureCoreStagedPrefixBinding22, verifyCoreStagedPrefix22 } from "./native-core-staged-prefix-bind.ts";
import type { CoreStagedPrefixBinding22 } from "./native-core-staged-prefix-bind.ts";

const stamp = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const targets: readonly ImportTarget[] = ["WAREHOUSE", "SKU", "INVENTORY_LEDGER", "IMPORT_BATCH"];
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const zeroCounts = (): ImportCounts => ({ WAREHOUSE: 0, SKU: 0, INVENTORY_LEDGER: 0, IMPORT_BATCH: 0 });
function counts(value: unknown, expected: boolean): ImportCounts {
  const row = jsonObject(value);
  const result = Object.fromEntries(targets.map(target => [target, integerValue(row[target])])) as unknown as ImportCounts;
  requireDomain(Object.keys(row).length === 4 && Object.values(result).every(v => v >= 0 && v < 2147483646), "INVALID_DATABASE_VALUE", "Invalid persisted import counts");
  if (expected) validateImportCounts(result);
  return result;
}
export function decodeImportCheckpoint(value: unknown): ImportCheckpoint {
  const row = jsonObject(value);
  const result = { sequence: integerValue(row.sequence), cursor: integerValue(row.cursor), counts: counts(row.counts, false), expected: counts(row.expected, true) };
  requireDomain(Object.keys(row).length === 4 && result.sequence >= 0 && result.sequence < 2147483646 && result.cursor >= 0
    && result.cursor < 2147483646 && targets.every(target => result.counts[target] <= result.expected[target]),
  "INVALID_DATABASE_VALUE", "Invalid persisted import checkpoint");
  return result;
}
function decodeResult(value: unknown): CutoffImportResult {
  const row = jsonObject(value); const sequence = integerValue(row.sequence); const cursor = integerValue(row.cursor);
  const core = row.phase === "CORE_INITIALIZED_V1" || row.phase === "FULL_SOURCE_BOUND_V1";
  requireDomain(Object.keys(row).length === (core ? 9 : 6) && (!core || typeof row.coreSourceDigest === "string" && /^[a-f0-9]{64}$/.test(row.coreSourceDigest) && requestHash(row.coreCounts) === requestHash({ STAFF:49,HALL:22,WAREHOUSE:22,CUSTOMER:22,USER_ACCOUNT:49 })) && sequence >= 0 && cursor >= 0 && Array.isArray(row.ledgerEntryIds)
    && (row.status === "STAGED" || row.status === "VALIDATING" || row.status === "IMPORTED"), "INVALID_DATABASE_VALUE", "Invalid persisted import receipt");
  return { operationId: entityId("operation", stringValue(row.operationId)), batchId: entityId("operation", stringValue(row.batchId)), sequence, cursor, status: row.status,
    ledgerEntryIds: row.ledgerEntryIds.map(value => entityId("ledger", stringValue(value))),
    ...(core ? { phase: row.phase as "CORE_INITIALIZED_V1" | "FULL_SOURCE_BOUND_V1", coreSourceDigest: stringValue(row.coreSourceDigest), coreCounts: row.coreCounts as CoreStageCommand["coreInitialization"]["coreCounts"] } : {}) };
}
async function historySchema(client: PgSalesClient, runtime26?: NativeRuntime26Capability, purpose: "IMPORT_STAGE" | "IMPORT_PUBLISH" = "IMPORT_STAGE"): Promise<readonly number[]> {
  if (runtime26) await runtime26.assertReady(client, purpose);
  const rows = (await client.query("/* history-lifecycle:schema */ SELECT array_agg(version ORDER BY version) AS versions FROM naijue_erp.schema_migration")).rows;
  requireDomain(rows.length === 1, "HISTORY_IMPORT_SCHEMA_NOT_READY", "One reviewed complete schema prefix required");
  if (runtime26) {
    const versions = rows[0]!.versions;
    requireDomain(Array.isArray(versions) && versions.length === 26 && versions.every((v, i) => v === i + 1),
      "HISTORY_IMPORT_SCHEMA_NOT_READY", "Exact26 complete registry and actual runtime required");
    return versions as number[];
  }
  return assertReviewedNativeImportSchema(rows[0]!.versions, { minimumVersion: 11, errorCode: "HISTORY_IMPORT_SCHEMA_NOT_READY" }).versions;
}
function decodeBatch(row: Record<string, unknown>): CutoffImportBatch {
  requireDomain(row.inventory_mode === "CUTOFF_STOCK_BASELINE" && ["STAGED", "VALIDATING", "PASSED", "IMPORTED", "FAILED"].includes(stringValue(row.status)),
    "INVALID_DATABASE_VALUE", "Unexpected persisted import batch kind or state");
  const mapping = stringValue(row.mapping_version);
  const metadata = mapping === HISTORY_MAPPING_VERSION ? historyImportStageMetadata(mapping, { expectedCounts: row.history_expected_counts, payloadHash: row.history_payload_hash }) : undefined;
  return { ...(metadata ? { historyMetadata: metadata } : {}), id: entityId("operation", stringValue(row.id)), sourceName: stringValue(row.source_name), sourceManifestRef: stringValue(row.source_manifest_ref), sourceHash: stringValue(row.source_hash),
    cutoffAt: stringValue(row.cutoff_at), mappingVersion: stringValue(row.mapping_version), inventoryMode: "CUTOFF_STOCK_BASELINE", status: row.status as CutoffImportBatch["status"],
    checkpoint: decodeImportCheckpoint(row.checkpoint), createdAt: stringValue(row.created_at), completedAt: nullableString(row.completed_at) };
}
// Exact reviewed first-STAGE SQL, including finite table/column expansions from
// native-bootstrap, native-party-import and history-header-reference plus the
// three original capability probes. No caller-supplied SQL registration and no
// runtime source-file hashing. Any provider query change requires a new review.
// Fixed query text includes its comments/whitespace; values are data only.
const bootstrapStatements: ReadonlyMap<string, number> = new Map([
  ["a7218f6aff8ea5327103354bcd8f5af0ff8c3a75c71956b5baea41d24d7afaa4", 0], // native-bootstrap:target
  ["6aa91314bcf074cb4042787e9bd82beaf72d73ae524bf39373eb15844e367b30", 1], // native-bootstrap:one-new-batch
  ["03194e26025d2bac14bedb2ba29cd9ac2e99500a70c331cfd31be1f60ab184ba", 0], // native-bootstrap:empty-domain
  ["483816d24177e9588ecdd11c15b56f3e1ef1d53cb0c550b6a1d1f757afb85806", 6], // native-bootstrap:account
  ["e8e78055d84484ad506ec1a34f6e619fdc77c36d28379c3cc60a5766eff280d6", 0], // native-party-import:global-lock
  ["083ee215dd40071c8898d74e51e25616c98e60be5e1f1bc6829293ba626b8066", 0], // native-party-import:schema
  ["ea2ee0278fcb8c2a59f1ccb4e6679ef2a81bcff6d8fb40886f9cbdffb1641bc7", 1], // native-party-import:batch
  ["b3feac7182ef5f86083502c4df2a633883c063730103be8b374dfd3266be120f", 1], // native-party-import:target
  ["d6bdd0e9b229f3fd3d7d1687226b5f161489982ce29a16186b6fdc257b75c792", 2], // native-party-import:target
  ["b0b7369c61b7cbd78103817c0757ae7b211c51af1ccfab94a7082a4b2259955f", 2], // native-party-import:target
  ["0c14b1db81097982735ea2db820d318905fea7955750bcca123d53f0540fdb2f", 1], // native-party-import:target
  ["9a2030ca3a925fdd9ea349a80e2a5111bcd6d33b73328166d8787de65e7652c9", 1], // native-party-import:target
  ["cfe63e08ce20bb93317e28ec427e7f958d7efb619bdd3be917619e860b888bd8", 1], // native-party-import:relation-native
  ["ef67b1917d98f373e158ce733f3bfd55b34280fdd28f55c9bb8486561dd1fb48", 1], // native-party-import:relation-native
  ["af0c910608cb91311c3c998c545623da0caa13795b58af29d877860466b9a1c7", 1], // native-party-import:relation-native
  ["29e3ae9eaa3df6db68c2b936b2e9ebadcaaedd5e180bf6c04f9b2c2122cc88c6", 7], // native-party-import:replay
  ["96664957b6f0703edeeaf5ae411c78461f400b2fdbf44ca2847a4b7af575b7e5", 1], // native-party-import:intent
  ["a09c3ed3e76f52a4a421db60bb7fa181447de1247ca5fd41252d231007794d7f", 1], // native-party-import:create
  ["6d365453b94a9c51048b2920617ea40ce116a17e62e757b4dab978ac055277f6", 1], // native-party-import:create
  ["8b889902aa4c3feea84fd6726ecfb6095199a584c0095a783efebe94316c685b", 1], // native-party-import:create
  ["40a6fe685bddf1d884429475c3e442be52fac47738bc678092365162b111e249", 1], // native-party-import:create
  ["c6fb7401505bd39dce9ddbd8efe16444bc700ccaea23b9857b3ec581a46dd77d", 1], // native-party-import:create
  ["45026f1b506e9628bc07dcf0df93443bb6f9e42e2f599a368668c39033ac0e85", 3], // native-party-import:complete-new-hall
  ["c9a4f7ea7730f353ebda588e66d2a330b39bf20dc3b1addb5027ca172673dae0", 7], // native-party-import:new-source-identity
  ["b721f5d7121ecfe4e9f3512b78585888f0b64a7b8ec9ae4863606952b52359c7", 2], // native-party-import:replay-complete
  ["4158f5ffe6ce0db557fd3589bee63318b1b32aa04a3ee5ce8442f59f6fdceb04", 8], // native-party-import:supplier-source-replay
  ["50a14e9bfb513577e06c52658bfb316cc56c40ea60f59ef07f11c4784eea05bf", 1], // native-party-import:supplier-source
  ["78f9aee098ed667a0cf3a26c88b914ef05cf662c6f492cf18b45750b910f9f38", 6], // native-party-import:warehouse-record-replay
  ["c06e5f3d29cbcdc06a80615b70db06eb780d153de5242bafbcb3eacb0cead669", 1], // native-party-import:warehouse-record
  ["829e5ba3616daef45fd9075fcfba148bf9fbc4d7df5446b04fe1f75cb03df356", 0], // history-header-reference:global-lock
  ["2be743bdeb9e00364bcf043bb9903545d0c1e4a88b4293ff15400173bf204830", 1], // history-header-reference:batch
  ["78f8eef4ec5bf36aa0504473359ca8e6d38a94eac6881558d5e4b9182e6fae7c", 2], // history-header-reference:native
  ["cd903c961803fdcb0fde02bff607a2181b24d5d947e6d9aa4bd70e6530155e60", 2], // history-header-reference:native
  ["bdaf6620770db7fa326d267245ffc23129cfa77abad2b404c4f3269a4d6e780a", 2], // history-header-reference:native
  ["e5a455b0a343ef25e873332b31b669c2fc2085f5cbaa9ca478f1d7e76017b433", 1], // history-header-reference:relation-native
  ["accda680cbeb37651bb4ef2c1dc834cf23ed1726701db54842bb9cb3fd5d1061", 1], // history-header-reference:relation-native
  ["a3f112c0949f73b683c4d3efbdca9e83449a2ce7fb23ae800a30fc632505bcc2", 1], // history-header-reference:relation-native
  ["233dc9b9f30d7479ca8d898c6201a01164f41c9a0bbb1bb139349b626b725590", 9], // history-header-reference:replay
  ["d287c38019ea79374863710e63d7a6b1eca89b827c8601fcc7faf4fbe4c6a230", 3], // history-header-reference:relation
  ["cfd6030814aa8fb45601d2a89684753cdeb8eeac657b24a02d1d90f48c0a3ab4", 4], // history-header-reference:relation
  ["ca4791954b02d20efcce0917ff1d9a20dc0eb7ac52266245b51911d88f4638c4", 4], // history-header-reference:relation
  ["d3cf564a4cfe45463e52da2c4b464884a300175dfef8f0971218a7b15e7cfdf3", 1], // history-header-reference:source
  ["963b0302f8b09969c479946b039869e2d1ea86dd9b5f143079afcb271127ad8a", 1], // history-header-reference:reference
  ["b4364d9b6926e95e3f2cc8769a766b415c8f5772aa0079a2bdc3d4817a7a02e6", 0], // inventory:guards
  ["6da5b8ef0f0461533414a955399c377b1e6638689f6ad4b98dbd63a82a23ed29", 0], // native-accounting:guards
  ["065d247b878f75b3962b07c774b6a19cb83cc75cf0878151ef55b36c88aff5ff", 0], // native-accounting:guards
]);
// Explicit successor finite set: four fixed26 bootstrap statements plus the
// unchanged39 party/header texts. No legacy capability probes or runtime registration.
const bootstrap26Statements: ReadonlyMap<string, number> = new Map([
  ["a1bf9838e8c5a97e02703b2476f537c92d52ad975cfab2b95693dd55b13acf5b", 0], // native-bootstrap26:target
  ["0371318234a91b006a6d292ded9a546d99b4073dbbb5fd391038b59d0b2903a7", 1], // native-bootstrap26:oneNewBatch
  ["ba0d02dcf3fed54bcacdac9822a665dd1e84ff1b4015f466471562b919252969", 0], // native-bootstrap26:emptyDomain
  ["e74d52d6daf4da53e7c9eb8d199f653b039e393fab3feed800f4dbd978bd5260", 6], // native-bootstrap26:account
  ["e8e78055d84484ad506ec1a34f6e619fdc77c36d28379c3cc60a5766eff280d6", 0], // native-party-import:global-lock
  ["083ee215dd40071c8898d74e51e25616c98e60be5e1f1bc6829293ba626b8066", 0], // native-party-import:schema
  ["ea2ee0278fcb8c2a59f1ccb4e6679ef2a81bcff6d8fb40886f9cbdffb1641bc7", 1], // native-party-import:batch
  ["b3feac7182ef5f86083502c4df2a633883c063730103be8b374dfd3266be120f", 1], // native-party-import:target
  ["d6bdd0e9b229f3fd3d7d1687226b5f161489982ce29a16186b6fdc257b75c792", 2], // native-party-import:target
  ["b0b7369c61b7cbd78103817c0757ae7b211c51af1ccfab94a7082a4b2259955f", 2], // native-party-import:target
  ["0c14b1db81097982735ea2db820d318905fea7955750bcca123d53f0540fdb2f", 1], // native-party-import:target
  ["9a2030ca3a925fdd9ea349a80e2a5111bcd6d33b73328166d8787de65e7652c9", 1], // native-party-import:target
  ["cfe63e08ce20bb93317e28ec427e7f958d7efb619bdd3be917619e860b888bd8", 1], // native-party-import:relation-native
  ["ef67b1917d98f373e158ce733f3bfd55b34280fdd28f55c9bb8486561dd1fb48", 1], // native-party-import:relation-native
  ["af0c910608cb91311c3c998c545623da0caa13795b58af29d877860466b9a1c7", 1], // native-party-import:relation-native
  ["29e3ae9eaa3df6db68c2b936b2e9ebadcaaedd5e180bf6c04f9b2c2122cc88c6", 7], // native-party-import:replay
  ["96664957b6f0703edeeaf5ae411c78461f400b2fdbf44ca2847a4b7af575b7e5", 1], // native-party-import:intent
  ["a09c3ed3e76f52a4a421db60bb7fa181447de1247ca5fd41252d231007794d7f", 1], // native-party-import:create
  ["6d365453b94a9c51048b2920617ea40ce116a17e62e757b4dab978ac055277f6", 1], // native-party-import:create
  ["8b889902aa4c3feea84fd6726ecfb6095199a584c0095a783efebe94316c685b", 1], // native-party-import:create
  ["40a6fe685bddf1d884429475c3e442be52fac47738bc678092365162b111e249", 1], // native-party-import:create
  ["c6fb7401505bd39dce9ddbd8efe16444bc700ccaea23b9857b3ec581a46dd77d", 1], // native-party-import:create
  ["45026f1b506e9628bc07dcf0df93443bb6f9e42e2f599a368668c39033ac0e85", 3], // native-party-import:complete-new-hall
  ["c9a4f7ea7730f353ebda588e66d2a330b39bf20dc3b1addb5027ca172673dae0", 7], // native-party-import:new-source-identity
  ["b721f5d7121ecfe4e9f3512b78585888f0b64a7b8ec9ae4863606952b52359c7", 2], // native-party-import:replay-complete
  ["4158f5ffe6ce0db557fd3589bee63318b1b32aa04a3ee5ce8442f59f6fdceb04", 8], // native-party-import:supplier-source-replay
  ["50a14e9bfb513577e06c52658bfb316cc56c40ea60f59ef07f11c4784eea05bf", 1], // native-party-import:supplier-source
  ["78f9aee098ed667a0cf3a26c88b914ef05cf662c6f492cf18b45750b910f9f38", 6], // native-party-import:warehouse-record-replay
  ["c06e5f3d29cbcdc06a80615b70db06eb780d153de5242bafbcb3eacb0cead669", 1], // native-party-import:warehouse-record
  ["829e5ba3616daef45fd9075fcfba148bf9fbc4d7df5446b04fe1f75cb03df356", 0], // history-header-reference:global-lock
  ["2be743bdeb9e00364bcf043bb9903545d0c1e4a88b4293ff15400173bf204830", 1], // history-header-reference:batch
  ["78f8eef4ec5bf36aa0504473359ca8e6d38a94eac6881558d5e4b9182e6fae7c", 2], // history-header-reference:native
  ["cd903c961803fdcb0fde02bff607a2181b24d5d947e6d9aa4bd70e6530155e60", 2], // history-header-reference:native
  ["bdaf6620770db7fa326d267245ffc23129cfa77abad2b404c4f3269a4d6e780a", 2], // history-header-reference:native
  ["e5a455b0a343ef25e873332b31b669c2fc2085f5cbaa9ca478f1d7e76017b433", 1], // history-header-reference:relation-native
  ["accda680cbeb37651bb4ef2c1dc834cf23ed1726701db54842bb9cb3fd5d1061", 1], // history-header-reference:relation-native
  ["a3f112c0949f73b683c4d3efbdca9e83449a2ce7fb23ae800a30fc632505bcc2", 1], // history-header-reference:relation-native
  ["233dc9b9f30d7479ca8d898c6201a01164f41c9a0bbb1bb139349b626b725590", 9], // history-header-reference:replay
  ["d287c38019ea79374863710e63d7a6b1eca89b827c8601fcc7faf4fbe4c6a230", 3], // history-header-reference:relation
  ["cfd6030814aa8fb45601d2a89684753cdeb8eeac657b24a02d1d90f48c0a3ab4", 4], // history-header-reference:relation
  ["ca4791954b02d20efcce0917ff1d9a20dc0eb7ac52266245b51911d88f4638c4", 4], // history-header-reference:relation
  ["d3cf564a4cfe45463e52da2c4b464884a300175dfef8f0971218a7b15e7cfdf3", 1], // history-header-reference:source
  ["963b0302f8b09969c479946b039869e2d1ea86dd9b5f143079afcb271127ad8a", 1], // history-header-reference:reference
]);

function checkedBootstrapValues(sql: string, values: unknown[] | undefined, exact26 = false): unknown[] {
  const arity = typeof sql === "string" ? (exact26 ? bootstrap26Statements : bootstrapStatements).get(createHash("sha256").update(sql).digest("hex")) : undefined;
  requireDomain(arity !== undefined, "TRANSACTION_SCOPE", "Bootstrap requires an exact reviewed statement");
  const input = values === undefined ? [] : values;
  requireDomain(Array.isArray(input) && Object.getPrototypeOf(input) === Array.prototype && input.length === arity
    && Reflect.ownKeys(input).length === arity + 1, "TRANSACTION_SCOPE", "Bootstrap requires exact plain parameter values");
  const result: unknown[] = [];
  for (let i = 0; i < arity; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
    requireDomain(descriptor !== undefined && Object.hasOwn(descriptor, "value"), "TRANSACTION_SCOPE", "Bootstrap parameters cannot be accessors");
    const value: unknown = descriptor.value;
    requireDomain(value === null || typeof value === "string" || typeof value === "boolean"
      || typeof value === "bigint" || (typeof value === "number" && Number.isFinite(value)),
      "TRANSACTION_SCOPE", "Bootstrap parameters are scalar data, not executable adapters");
    result.push(value);
  }
  return result;
}

export interface ImportStageBootstrap {
  /** Trusted private source provider only. Independently binds the exact reviewed
   * first STAGE and real original actor, creates source-owned native party rows
   * plus evidence then that actor account. No invented ADMIN/adoption/default.
   * The enclosing service still authorizes EVERY original command/replay.
   * This method runs once after batch INSERT, before the first audit/receipt.
   * No credential/secret is added to MAIN payload, receipt or journal. */
  stageNewBatch(client: Pick<PgSalesClient, "query">, input: {
    readonly command: Extract<CutoffImportCommand, { readonly action: "IMPORT_STAGE" }>;
    readonly now: string; readonly operationId: string;
  }): Promise<void>;
}
export interface ImportStageBootstrap26 {
  /** Independently source-authorized26 provider only. Runtime is derived by the
   * original transaction, scoped to this exact borrowed client and callback. */
  stageNewBatch26(client: Pick<PgSalesClient, "query">, input: { readonly command: Extract<CutoffImportCommand, { action: "IMPORT_STAGE" }> | CoreStageCommand; readonly now: string; readonly operationId: string },
    runtime26: NativeRuntime26Capability): Promise<void>;
}
/** D3 source-owned exact data only, borrowed from the original transaction. No pool or receipt ownership. */
export interface BarcodeSchemeInitialization26 {
  assertAllowed(actorAccountId: BarcodeSchemeInitializationCommand["actorAccountId"], command: BarcodeSchemeInitializationCommand): Promise<void>;
  initializeSchemes26(client: Pick<PgSalesClient, "query">, input: {
    readonly command: BarcodeSchemeInitializationCommand; readonly now: string; readonly operationId: string;
  }, runtime26: NativeRuntime26Capability): Promise<void>;
}
/** Pure protocol adapter: constructing it does not connect, migrate, seed, or start a server. */
export class PostgresCutoffImportStore implements CutoffImportStore {
  private readonly pool: PgSalesPool;
  private readonly nativeAccountingAuthorization: Parameters<typeof authorizeNativeImportAccountingCommand>[1] | undefined;
  private readonly stageBootstrap: ImportStageBootstrap | undefined;
  private readonly runtime26: NativeRuntime26Capability | undefined;
  private readonly coreAuthorization: { assertAllowed(actorAccountId: CoreImportCommand["actorAccountId"], command: CoreImportCommand): Promise<void> } | undefined;
  private readonly stageBootstrap26: ImportStageBootstrap26 | undefined;
  private readonly barcodeSchemeInitialization26: BarcodeSchemeInitialization26 | undefined;
  private readonly stagedPrefixBinding26: CoreStagedPrefixBinding22 | undefined;
  constructor(pool: PgSalesPool, options: {
    readonly nativeAccountingAuthorization?: Parameters<typeof authorizeNativeImportAccountingCommand>[1];
    readonly stageBootstrap?: ImportStageBootstrap;
    readonly runtime26?: NativeRuntime26Capability;
    readonly stageBootstrap26?: ImportStageBootstrap26;
    readonly barcodeSchemeInitialization26?: BarcodeSchemeInitialization26;
    readonly stagedPrefixBinding26?: CoreStagedPrefixBinding22;
    coreAuthorization?: { assertAllowed(actorAccountId: CoreImportCommand["actorAccountId"], command: CoreImportCommand): Promise<void> };
  } = {}) {
    this.pool = pool;
    const coreAuthorization = options.coreAuthorization;
    requireDomain(coreAuthorization === undefined || typeof coreAuthorization.assertAllowed === "function", "NATIVE_IMPORT_AUTHORIZATION_REQUIRED", "Exact CORE source authorizer required");
    this.coreAuthorization = coreAuthorization === undefined ? undefined : Object.freeze({ assertAllowed: coreAuthorization.assertAllowed.bind(coreAuthorization) });
    this.runtime26 = checkedNativeRuntime26Capability(options.runtime26);
    requireDomain(options.stagedPrefixBinding26 === undefined || this.runtime26 !== undefined,
      "IMPORT_BOOTSTRAP_REQUIRED", "Staged prefix binding requires the original exact26 runtime");
    this.stagedPrefixBinding26 = captureCoreStagedPrefixBinding22(options.stagedPrefixBinding26);
    const schemeInitialization = options.barcodeSchemeInitialization26;
    if (schemeInitialization !== undefined) {
      requireDomain(this.runtime26 && Object.getPrototypeOf(schemeInitialization) === Object.prototype && Reflect.ownKeys(schemeInitialization).length === 2,
        "BARCODE_SCHEME_INITIALIZATION_REQUIRED", "Two explicit trusted scheme source methods and exact26 runtime required");
      for (const key of ["assertAllowed", "initializeSchemes26"] as const) {
        const field = Object.getOwnPropertyDescriptor(schemeInitialization, key);
        requireDomain(field?.enumerable && Object.hasOwn(field, "value") && typeof field.value === "function",
          "BARCODE_SCHEME_INITIALIZATION_REQUIRED", "Captured own-data scheme source methods required");
      }
      this.barcodeSchemeInitialization26 = Object.freeze({ assertAllowed: schemeInitialization.assertAllowed.bind(schemeInitialization),
        initializeSchemes26: schemeInitialization.initializeSchemes26.bind(schemeInitialization) });
    }

    const successor = options.stageBootstrap26;
    if (successor !== undefined) {
      const d = Object.getOwnPropertyDescriptor(successor, "stageNewBatch26");
      requireDomain(this.runtime26 && Object.getPrototypeOf(successor) === Object.prototype && Reflect.ownKeys(successor).length === 1
        && d?.enumerable && Object.hasOwn(d, "value") && typeof d.value === "function",
        "IMPORT_BOOTSTRAP_REQUIRED", "Exact26 bootstrap requires one explicit own-data method and verified runtime");
      this.stageBootstrap26 = Object.freeze({ stageNewBatch26: d.value.bind(successor) });
    }
    requireDomain(!this.runtime26 || options.stageBootstrap === undefined, "IMPORT_BOOTSTRAP_REQUIRED", "Legacy bootstrap cannot run under exact26");
    const authorization = options.nativeAccountingAuthorization;
    requireDomain(authorization === undefined || typeof authorization?.assertAllowed === "function",
      "NATIVE_IMPORT_AUTHORIZATION_REQUIRED", "Explicit independent whole-command native source authorization required");
    this.nativeAccountingAuthorization = authorization === undefined ? undefined
      : Object.freeze({ assertAllowed: authorization.assertAllowed.bind(authorization) });
    const bootstrap = options.stageBootstrap;
    requireDomain(bootstrap === undefined || typeof bootstrap?.stageNewBatch === "function", "IMPORT_BOOTSTRAP_REQUIRED", "Explicit private source stage bootstrap required");
    this.stageBootstrap = bootstrap === undefined ? undefined : Object.freeze({ stageNewBatch: bootstrap.stageNewBatch.bind(bootstrap) });
  }
  async execute(command: CutoffImportCommand, now: string): Promise<CutoffImportResult> {
    if (command.action === "IMPORT_INITIALIZE_BARCODE_SCHEMES") validateBarcodeSchemeInitializationCommand(command);
    const nativeRequested = !isCoreImportCommand(command) && hasNativeImportAccountingMetadata(command);
    if (nativeRequested) {
      // Validate before clone: accessors/symbols/array named properties may not disappear before MAIN hashing.
      validateNativeImportAccountingCommand(command);
      requireDomain(this.nativeAccountingAuthorization !== undefined, "NATIVE_IMPORT_AUTHORIZATION_REQUIRED",
        "Native accounting has no permissive default authorizer");
    }
    const snapshot = structuredClone(command); validateCutoffImportCommand(snapshot);
    if (this.runtime26) {
      requireDomain(snapshot.action === "IMPORT_INITIALIZE_BARCODE_SCHEMES" ? !!this.barcodeSchemeInitialization26 : isCoreImportCommand(snapshot) ? !!this.runtime26 && !!this.coreAuthorization && (snapshot.action !== "IMPORT_CORE_STAGE" || !!this.stageBootstrap26) : snapshot.action === "IMPORT_STAGE" ? snapshot.mappingVersion === HISTORY_MAPPING_VERSION && snapshot.historyMetadata !== undefined && this.stageBootstrap26
        : nativeRequested, "IMPORT_BOOTSTRAP_REQUIRED", "Exact26 requires genuine first-stage source bootstrap or native accounting MAIN command");
      if (snapshot.action === "IMPORT_PUBLISH") requireDomain(Object.hasOwn(snapshot, "historyClosure"), "HISTORY_PUBLICATION_PLAN_MISMATCH", "Exact26 publication requires complete independently authorized typed closure");
    }
    requireDomain(Number.isFinite(Date.parse(now)) && now.endsWith("Z"), "INVALID_IMPORT_TIME", "Actual UTC processing time is required");
    const client = await this.pool.connect(); let began = false; let commitAttempted = false; let discard: Error | undefined;
    try {
      if (this.runtime26) await this.runtime26.assertReady(client, snapshot.action === "IMPORT_PUBLISH" ? "IMPORT_PUBLISH" : "IMPORT_STAGE");
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      const result = await this.executeInTransaction(client, snapshot, now, nativeRequested ? snapshot as NativeImportAccountingCommand : undefined);
      commitAttempted = true; await client.query("COMMIT"); return result;
    } catch (error) {
      if (!began || commitAttempted) discard = error instanceof Error ? error : new Error("Import transaction failed");
      if (began && !commitAttempted) try { await client.query("ROLLBACK"); } catch (rollbackError) {
        discard = rollbackError instanceof Error ? rollbackError : new Error("Import rollback failed");
        throw new AggregateError([error, rollbackError], "Import transaction and rollback failed; connection discarded");
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async executeInTransaction(client: PgSalesClient, command: CutoffImportCommand, now: string,
    nativeCommand: NativeImportAccountingCommand | undefined): Promise<CutoffImportResult> {
    if (this.runtime26) await this.runtime26.assertReady(client, command.action === "IMPORT_PUBLISH" ? "IMPORT_PUBLISH" : "IMPORT_STAGE");
    const digest = requestHash(command);
    const operationId = entityId("operation", stableImportId("operation", command.actorAccountId, command.requestKey));
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:receipt:${JSON.stringify([command.actorAccountId, command.requestKey])}`]);
    if (command.action === "IMPORT_INITIALIZE_BARCODE_SCHEMES")
      return this.executeBarcodeSchemeInitializationInTransaction(client, command, now, operationId, digest);
    const previous = (await client.query(`SELECT request_hash, target_type, target_id, action, result_data FROM naijue_erp.operation_receipt
      WHERE actor_account_id = $1 AND request_key = $2`, [command.actorAccountId, command.requestKey])).rows[0];
    if (previous) {
      requireDomain(previous.request_hash === digest && previous.target_type === "IMPORT" && previous.target_id === command.batchId && previous.action === command.action,
        "IDEMPOTENCY_CONFLICT", "Original account/key belongs to different content or target");
    }
    // Current independent source authorization is required even on an exact receipt replay.
    // The authorizer receives a separate complete clone and cannot mutate this transaction's MAIN command.
    if (isCoreImportCommand(command)) {
      requireDomain(this.coreAuthorization !== undefined, "NATIVE_IMPORT_AUTHORIZATION_REQUIRED", "CORE commands require independent exact source authorization");
      await this.coreAuthorization.assertAllowed(command.actorAccountId, structuredClone(command));
    } else if (nativeCommand) await authorizeNativeImportAccountingCommand(nativeCommand, this.nativeAccountingAuthorization!);
    if (previous) return decodeResult(previous.result_data);
    await client.query("SELECT naijue_erp.cutoff_import_lock()");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:import-batch:${command.batchId}`]);
    const found = (await client.query(`SELECT id, source_name, source_manifest_ref, source_hash, ${stamp("cutoff_at")} AS cutoff_at,
      mapping_version, inventory_mode, status, checkpoint, ${stamp("created_at")} AS created_at, ${stamp("completed_at")} AS completed_at,
      to_jsonb(import_batch)->'history_expected_counts' AS history_expected_counts, to_jsonb(import_batch)->>'history_payload_hash' AS history_payload_hash
      FROM naijue_erp.import_batch WHERE id = $1 FOR UPDATE`, [command.batchId])).rows[0];
    let historyReconciliation: HistoryImportReconciliation | undefined;
    let batch: CutoffImportBatch; let before: ImportCheckpoint | null; let checkpoint: ImportCheckpoint; let status: CutoffImportResult["status"];
    if (isCoreImportCommand(command)) return this.executeCoreInTransaction(client, command, now, operationId, digest, found);
    if (command.action === "IMPORT_STAGE") {
      requireDomain(found === undefined, "IMPORT_BATCH_EXISTS", "Resume the original batch with its original request keys");
      const metadata = historyImportStageMetadata(command.mappingVersion, command.historyMetadata);
      if (metadata) {
        const versions = await historySchema(client, this.runtime26, "IMPORT_STAGE");
        if (!this.runtime26 && (versions.length === 15 || versions.length === 16 || versions.length === 17 || versions.length === 18 || versions.length === 19)) await assertNativeImportAccountingGuards(client);
      }
      checkpoint = { sequence: 0, cursor: 0, counts: zeroCounts(), expected: command.expected }; before = null; status = "STAGED";
      batch = { ...(metadata ? { historyMetadata: metadata } : {}), id: command.batchId, sourceName: command.sourceName, sourceManifestRef: command.sourceManifestRef, sourceHash: command.sourceHash,
        cutoffAt: command.cutoffAt, mappingVersion: command.mappingVersion, inventoryMode: "CUTOFF_STOCK_BASELINE", status,
        checkpoint, createdAt: now, completedAt: null };
      const inserted = await client.query(`INSERT INTO naijue_erp.import_batch (id, source_name, source_manifest_ref, source_hash, cutoff_at, mapping_version,
        inventory_mode, status, checkpoint, created_at, completed_at${metadata ? ", history_expected_counts, history_payload_hash, history_actual_counts, history_validation_passed" : ""})
        VALUES ($1, $2, $3, $4, $5::timestamptz, $6, 'CUTOFF_STOCK_BASELINE', 'STAGED', $7::jsonb, $8::timestamptz, NULL${metadata ? ", $9::jsonb, $10, NULL, false" : ""})`,
      [batch.id, batch.sourceName, batch.sourceManifestRef, batch.sourceHash, batch.cutoffAt, batch.mappingVersion, auditJson(checkpoint), now,
        ...(metadata ? [JSON.stringify(metadata.expectedCounts), metadata.payloadHash] : [])]);
      requireDomain(inserted.rowCount === 1, "IMPORT_INSERT_FAILED", "Staged batch was not inserted");
      if (this.stageBootstrap26 && this.runtime26) await this.runBootstrap26(client, command, now, operationId, digest);
      if (this.stageBootstrap) {
        requireDomain(metadata !== undefined && command.mappingVersion === HISTORY_MAPPING_VERSION,
          "IMPORT_BOOTSTRAP_SOURCE_REQUIRED", "Bootstrap requires the exact reviewed native history/source STAGE");
        const frozen = Object.freeze({ command: structuredClone(command), now, operationId }); let active = true;
        const pending = new Set<Promise<PgSalesResult>>(); let queryFailure: unknown;
        const borrowed = Object.freeze({ query: (sql: string, values?: unknown[]): Promise<PgSalesResult> => {
          requireDomain(active, "TRANSACTION_CLOSED", "Stage bootstrap query cannot escape its original callback");
          let parameters: unknown[];
          try {
            requireDomain(pending.size === 0, "TRANSACTION_SCOPE", "Stage bootstrap queries must be sequential and awaited");
            parameters = checkedBootstrapValues(sql, values);
          } catch (error) { queryFailure ??= error; throw error; }
          const request = client.query(sql, parameters); pending.add(request);
          void request.then(() => pending.delete(request), error => { pending.delete(request); queryFailure ??= error; });
          return request;
        } });
        try {
          await this.stageBootstrap.stageNewBatch(borrowed, frozen);
          requireDomain(pending.size === 0, "TRANSACTION_SCOPE", "Stage bootstrap must await all original-client work");
          if (queryFailure !== undefined) throw queryFailure;
          requireDomain(requestHash(frozen.command) === digest, "IMPORT_BOOTSTRAP_COMMAND_MUTATION", "Bootstrap cannot change the original frozen MAIN stage");
        } finally { active = false; if (pending.size) await Promise.allSettled([...pending]); }
      }
    } else {
      requireDomain(found !== undefined, "IMPORT_BATCH_NOT_FOUND", "Stage an approved frozen manifest before importing data"); batch = decodeBatch(found);
      requireDomain(batch.status === "STAGED" || batch.status === "VALIDATING", "IMPORT_BATCH_FROZEN", "Published, passed, or failed batches cannot accept data");
      before = batch.checkpoint;
      requireDomain(before.sequence === command.expectedSequence && before.cursor === command.expectedCursor, "IMPORT_CHECKPOINT_CONFLICT", "Resume only from the committed stable checkpoint");
      if (nativeCommand) {
        if (this.runtime26) await this.runtime26.assertReady(client, command.action === "IMPORT_PUBLISH" ? "IMPORT_PUBLISH" : "IMPORT_STAGE");
        else await assertNativeImportAccountingGuards(client);
      }
      const nextCounts = { ...before.counts };
      if (command.action === "IMPORT_CHUNK") {
        if (nativeCommand?.action === "IMPORT_CHUNK") {
          const accountant = await createNativeImportRecordAccountant(client, {
            command: nativeCommand, batch, operationId, commandHash: digest, now,
          }, this.runtime26);
          const ordered = [...nativeCommand.items].sort((a, b) => targets.indexOf(a.targetType) - targets.indexOf(b.targetType)
            || compare(JSON.stringify([a.sourceEntityType, a.sourceKey]), JSON.stringify([b.sourceEntityType, b.sourceKey])));
          for (const item of ordered) {
            if (item.targetType === "INVENTORY_LEDGER")
              await accountant.claimBaseline(item, await this.insertNativeBaseline(client, batch, item, operationId, now));
            else await accountant.claimMembership(item);
          }
          checkpoint = accountant.checkpoint(); status = "VALIDATING";
        } else {
        if (batch.historyMetadata) {
          const versions = await historySchema(client, this.runtime26, "IMPORT_STAGE");
          requireDomain(versions.length < 15, "NATIVE_RECORD_ACCOUNTING_REQUIRED",
            "Schema15 V2 progress requires the versioned native accounting MAIN command, never a legacy duplicate source INSERT");
        }
        // Source identity locks are deterministic; membership records precede baseline records.
        const ordered = [...command.items].sort((a, b) => targets.indexOf(a.targetType) - targets.indexOf(b.targetType)
          || compare(JSON.stringify([a.sourceEntityType, a.sourceKey]), JSON.stringify([b.sourceEntityType, b.sourceKey])));
        const sourceOrder = [...ordered].sort((a, b) => compare(JSON.stringify([a.sourceEntityType, a.sourceKey]), JSON.stringify([b.sourceEntityType, b.sourceKey])));
        // Acquire cross-batch source locks in a global order BEFORE the INSERT statements.
        // The next READ COMMITTED statement sees the preceding owner's committed identity.
        for (const item of sourceOrder) await client.query("SELECT naijue_erp.import_source_key_lock($1, $2, $3)", [batch.sourceName, item.sourceEntityType, item.sourceKey]);
        const keys = ordered.filter((item): item is Extract<CutoffImportItem, { targetType: "INVENTORY_LEDGER" }> => item.targetType === "INVENTORY_LEDGER")
          .map(item => [item.warehouseId, item.skuId] as const).sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
        for (const [warehouseId, skuId] of keys) await client.query("SELECT naijue_erp.inventory_key_lock($1::uuid, $2::uuid)", [warehouseId, skuId]);
        for (const item of ordered) {
          nextCounts[item.targetType]++;
          requireDomain(nextCounts[item.targetType] <= before.expected[item.targetType], "IMPORT_EXPECTED_COUNT_EXCEEDED", "Source count exceeds the frozen reviewed manifest");
          await this.insertItem(client, batch, item, operationId, now);
        }
        checkpoint = { ...before, sequence: before.sequence + 1, cursor: before.cursor + command.items.length, counts: nextCounts }; status = "VALIDATING";
        }
      } else {
        const historyClosure = nativeCommand?.action === "IMPORT_PUBLISH" && Object.hasOwn(nativeCommand, "historyClosure")
          ? (nativeCommand as NativeImportAccountingCommand & { readonly historyClosure: HistoryTypedClosurePlan }).historyClosure : undefined;
        requireDomain(historyClosure === undefined || batch.historyMetadata !== undefined, "HISTORY_PUBLICATION_PLAN_MISMATCH",
          "History closure is only valid for the exact historical mapping and metadata");
        requireDomain(command.approval.sourceHash === batch.sourceHash && command.approval.sourceManifestRef === batch.sourceManifestRef,
          "IMPORT_MANIFEST_CONFLICT", "Final approval must refer to the exact frozen reviewed manifest");
        requireDomain(targets.filter(target => target !== "IMPORT_BATCH").every(target => batch.checkpoint.counts[target] === batch.checkpoint.expected[target])
          && before.counts.IMPORT_BATCH === 0, "INCOMPLETE_IMPORT_SCOPE", "Every expected source and nonzero baseline must be reconciled before publication");
        if (batch.historyMetadata) {
          const versions = await historySchema(client, this.runtime26, command.action === "IMPORT_PUBLISH" ? "IMPORT_PUBLISH" : "IMPORT_STAGE");
          requireDomain(versions.length < 15 || nativeCommand?.action === "IMPORT_PUBLISH", "NATIVE_RECORD_ACCOUNTING_REQUIRED",
            "Schema15 V2 publication requires once-only FINAL and full conservation, never legacy progress");
          historyReconciliation = historyClosure === undefined
            ? await reconcileHistoryImport(client, batch.id, batch.historyMetadata, versions)
            : await reconcileHistoryTypedPublication(client, batch, historyClosure, versions, this.runtime26);
        }
        const finalSource = { sourceEntityType: "INVENTORY_SCOPE_APPROVAL", sourceKey: "FINAL_COMPLETE_SCOPE",
          sourceRecordHash: batch.sourceHash, sourceFileRef: batch.sourceManifestRef };
        if (nativeCommand?.action === "IMPORT_PUBLISH") {
          const transaction = { command: nativeCommand, batch, operationId, commandHash: digest, now };
          // The full selected source/effective/native warehouse-and-unit gate precedes
          // the first FINAL write. Its plan belongs to the authorized MAIN hash.
          await reconcileNativeImportStockConservation(client, transaction, this.runtime26);
          const accountant = await createNativeImportRecordAccountant(client, transaction, this.runtime26);
          const created = await this.insertRecord(client, batch, finalSource, "IMPORT_BATCH", batch.id, COMPLETE_SCOPE_DECISION, now, true);
          await accountant.claimFinalApproval(created); checkpoint = accountant.checkpoint();
        } else {
          await this.insertRecord(client, batch, finalSource, "IMPORT_BATCH", batch.id, COMPLETE_SCOPE_DECISION, now);
          nextCounts.IMPORT_BATCH = 1; checkpoint = { ...before, sequence: before.sequence + 1, cursor: before.cursor + 1, counts: nextCounts };
        }
        status = "IMPORTED";
      }
      requireDomain(checkpoint.sequence < 2147483646 && checkpoint.cursor < 2147483646, "IMPORT_COUNTER_OVERFLOW", "Import checkpoint exceeds integer audit capacity");
      const update = await client.query(`UPDATE naijue_erp.import_batch SET status = $2, checkpoint = $3::jsonb,
        completed_at = $4::timestamptz${historyReconciliation ? ", history_actual_counts=$7::jsonb, history_validation_passed=true" : ""} WHERE id = $1 AND checkpoint->>'sequence' = $5 AND checkpoint->>'cursor' = $6 AND status IN ('STAGED', 'VALIDATING')`,
      [batch.id, status, auditJson(checkpoint), status === "IMPORTED" ? now : null, String(before.sequence), String(before.cursor),
        ...(historyReconciliation ? [JSON.stringify(historyReconciliation.actualCounts)] : [])]);
      requireDomain(update.rowCount === 1, "IMPORT_CHECKPOINT_CONFLICT", "Atomic import checkpoint compare-and-swap failed");
    }
    const ledgerEntryIds = command.action === "IMPORT_CHUNK" ? command.items.filter(item => item.targetType === "INVENTORY_LEDGER")
      .map(item => entityId("ledger", stableImportId("baseline", batch.sourceName, item.sourceEntityType, item.sourceKey))).sort() : [];
    const result: CutoffImportResult = { operationId, batchId: batch.id, sequence: checkpoint.sequence, cursor: checkpoint.cursor, status, ledgerEntryIds };
    const auditInsert = await client.query(`INSERT INTO naijue_erp.audit_change (id, operation_id, actor_account_id, object_type, object_id, action,
      old_version, new_version, before_values, after_values, occurred_at) VALUES ($1, $2, $3, 'IMPORT', $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::timestamptz)`,
    [stableImportId("audit", operationId), operationId, command.actorAccountId, batch.id, command.action, before === null ? null : before.sequence + 1,
      checkpoint.sequence + 1, before === null ? null : auditJson(before), auditJson(checkpoint), now]);
    requireDomain((nativeCommand === undefined && !(command.action === "IMPORT_STAGE" && (this.stageBootstrap || this.stageBootstrap26))) || auditInsert.rowCount === 1, "NATIVE_IMPORT_EVIDENCE_INSERT",
      "Native accounting requires its one actual original audit insert before receipt/COMMIT");
    const receiptInsert = await client.query(`INSERT INTO naijue_erp.operation_receipt (id, actor_account_id, request_key, request_hash, action, target_type, target_id,
      status, result_data, created_at, completed_at) VALUES ($1, $2, $3, $4, $5, 'IMPORT', $6, 'COMMITTED', $7::jsonb, $8::timestamptz, $8::timestamptz)`,
    [operationId, command.actorAccountId, command.requestKey, digest, command.action, batch.id, auditJson(result), now]);
    requireDomain((nativeCommand === undefined && !(command.action === "IMPORT_STAGE" && (this.stageBootstrap || this.stageBootstrap26))) || receiptInsert.rowCount === 1, "NATIVE_IMPORT_EVIDENCE_INSERT",
      "Native accounting requires its one actual original receipt insert before COMMIT");
    return result;
  }
  private async runBootstrap26(client: PgSalesClient, command: Extract<CutoffImportCommand, { action: "IMPORT_STAGE" }> | CoreStageCommand,
    now: string, operationId: string, digest: string): Promise<void> {
    requireDomain(this.stageBootstrap26 && this.runtime26, "IMPORT_BOOTSTRAP_REQUIRED", "Original exact26 bootstrap required");
        const frozen = Object.freeze({ command: structuredClone(command), now, operationId }); let active = true;
        const pending = new Set<Promise<unknown>>(); let failure: unknown;
        const track = <T>(run: () => Promise<T>): Promise<T> => {
          try {
            requireDomain(active, "TRANSACTION_CLOSED", "Exact26 bootstrap callback expired");
            requireDomain(pending.size === 0, "TRANSACTION_SCOPE", "Exact26 bootstrap work must be sequential and awaited");
            const request = run(); pending.add(request);
            void request.then(() => pending.delete(request), error => { pending.delete(request); failure ??= error; });
            return request;
          } catch (error) { failure ??= error; throw error; }
        };
        const borrowed = Object.freeze({ query: (sql: string, values?: unknown[]): Promise<PgSalesResult> =>
          track(() => client.query(sql, checkedBootstrapValues(sql, values, true))) });
        const runtime = this.runtime26;
        const callbackRuntime: NativeRuntime26Capability = Object.freeze({ profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1",
          assertReady: (target: object, purpose: Parameters<NativeRuntime26Capability["assertReady"]>[1]): Promise<void> => track(async () => {
            requireDomain(target === borrowed && purpose === "IMPORT_STAGE", "TRANSACTION_SCOPE", "Exact26 bootstrap runtime is bound only to its original borrowed stage client");
            await runtime.assertReady(client, "IMPORT_STAGE");
          }) });
        try {
          const result: unknown = await this.stageBootstrap26.stageNewBatch26(borrowed, frozen, callbackRuntime);
          requireDomain(result === undefined && pending.size === 0, "TRANSACTION_SCOPE", "Exact26 bootstrap must await all work and complete without boolean substitute");
          if (failure !== undefined) throw failure;
          requireDomain(requestHash(frozen.command) === digest, "IMPORT_BOOTSTRAP_COMMAND_MUTATION", "Bootstrap cannot change original stage command");
        } finally { active = false; if (pending.size) await Promise.allSettled([...pending]); }
  }
  private async executeBarcodeSchemeInitializationInTransaction(client: PgSalesClient, command: BarcodeSchemeInitializationCommand,
    now: string, operationId: string, digest: string): Promise<CutoffImportResult> {
    const provider = this.barcodeSchemeInitialization26, runtime = this.runtime26;
    requireDomain(provider && runtime, "BARCODE_SCHEME_INITIALIZATION_REQUIRED", "Original exact26 transaction and source initializer required");
    const allowed: unknown = await provider.assertAllowed(command.actorAccountId, structuredClone(command));
    requireDomain(allowed === undefined, "NATIVE_IMPORT_AUTHORIZATION_REQUIRED", "Independent scheme source authority must explicitly complete");
    await client.query("SELECT naijue_erp.cutoff_import_lock()");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:import-batch:${command.batchId}`]);
    // All approved scheme INSERTs enter only this borrowed-client callback under the
    // original global cutoff transaction lock. Different keys/batches cannot observe
    // an empty scheme table concurrently; COMMIT/ROLLBACK releases that serialization.
    // C/T45 retain the sole-owner rule: no arbitrary owner/raw-SQL scheme writer is
    // authorized alongside initialization. This is not a predicate lock for such writers.
    // Keep the existing seven-field row FOR SHARE checks, without broader table-lock ACLs.
    const i = command.schemeInitialization;
    const actors = (await client.query(`/* barcode-init:actor */ SELECT u.id FROM naijue_erp.user_account u
      JOIN naijue_erp.staff s ON s.id=u.staff_id LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id
      WHERE u.id=$1::uuid AND u.login_enabled AND s.employment_status='在职' AND s.role='ADMIN'
        AND (s.hall_id IS NULL OR h.enabled) FOR SHARE OF u,s`, [command.actorAccountId])).rows;
    requireDomain(actors.length === 1, "IMPORT_ACTOR_NOT_ALLOWED", "Current active source-authorized ADMIN required even on replay");
    const actual = (await client.query(`/* barcode-init:target */ SELECT current_database()::text AS database,current_user::text AS role,
      inet_server_addr()::text AS "serverAddress",inet_server_port() AS "serverPort",pg_postmaster_start_time()::text AS "postmasterStartedAt"`)).rows;
    requireDomain(actual.length === 1 && requestHash(actual[0]) === requestHash(i.target), "IMPORT_TARGET_CONFLICT", "Original exact process and acting role required");
    const batches = (await client.query(`/* barcode-init:batch */ SELECT *, ${stamp("cutoff_at")} AS cutoff_at FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`, [command.batchId])).rows;
    const b = batches[0];
    requireDomain(batches.length === 1 && b?.mapping_version === HISTORY_MAPPING_VERSION && b.source_name === i.fixedSourceNamespace
      && b.source_hash === i.selectionSha256 && Date.parse(stringValue(b.cutoff_at)) === Date.parse(i.cutoffAt)
      && (b.status === "STAGED" || b.status === "VALIDATING") && b.completed_at === null && b.history_validation_passed === false,
      "IMPORT_MANIFEST_CONFLICT", "Exact original open unpublished source batch required");
    const publications = (await client.query(`/* barcode-init:publication */ SELECT id FROM naijue_erp.import_batch WHERE status='IMPORTED' LIMIT 1`)).rows;
    requireDomain(publications.length === 0, "IMPORT_ALREADY_PUBLISHED", "Scheme initialization precedes business publication");
    const previous = (await client.query(`/* barcode-init:receipt */ SELECT id,request_hash,target_type,target_id,action,status,result_data
      FROM naijue_erp.operation_receipt WHERE actor_account_id=$1::uuid AND request_key=$2 FOR SHARE`, [command.actorAccountId,command.requestKey])).rows[0];
    if (previous) {
      requireDomain(previous.id === operationId && previous.request_hash === digest && previous.target_type === "IMPORT"
        && previous.target_id === command.batchId && previous.action === command.action && previous.status === "COMMITTED",
        "IDEMPOTENCY_CONFLICT", "Original actor/key is immutable and belongs to exact scheme initialization");
      const proof = (await client.query(`/* barcode-init:replay-proof */ SELECT a.before_values,a.after_values FROM naijue_erp.audit_change a
        WHERE a.operation_id=$1::uuid AND a.object_type='IMPORT' AND a.object_id=$2::uuid AND a.action=$3`, [operationId,command.batchId,command.action])).rows;
      requireDomain(proof.length === 1 && requestHash(jsonObject(proof[0]!.after_values).schemeInitialization) === requestHash(i),
        "IDEMPOTENCY_CONFLICT", "Original committed exact scheme payload must match paired audit");
      await client.query("SELECT naijue_erp.assert_barcode_scheme_initialization_v19($1::uuid,$2::uuid)", [command.batchId,operationId]);
      return decodeResult(previous.result_data);
    }
    const cp = jsonObject(b.checkpoint);
    requireDomain(Object.keys(cp).sort().join(",") === "counts,cursor,expected,sequence" && cp.sequence === command.expectedSequence && cp.cursor === command.expectedCursor,
      "IMPORT_CHECKPOINT_CONFLICT", "Exact original checkpoint required; do not change key after a conflict");
    const existing = (await client.query(`/* barcode-init:existing */ SELECT id FROM naijue_erp.operation_receipt
      WHERE target_type='IMPORT' AND target_id=$1::uuid AND action=$2 LIMIT 1`, [command.batchId,command.action])).rows;
    const effects = (await client.query(`/* barcode-init:effects */ SELECT
      EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=$1::uuid AND entity_type='BARCODE') AS barcode_source,
      EXISTS(SELECT 1 FROM naijue_erp.sku_barcode) AS barcode_rows,
      EXISTS(SELECT 1 FROM naijue_erp.barcode_scheme) AS scheme_rows`, [command.batchId])).rows[0];
    requireDomain(existing.length === 0 && effects?.barcode_source === false && effects.barcode_rows === false && effects.scheme_rows === false,
      "BARCODE_SCHEME_INITIALIZATION_CONFLICT", "First whole-table empty initialization before any barcode effect only");
    // The callback only inserts the exact six scheme rows. All commands stay on the original borrowed lease.
    let active = true, pending: Promise<unknown> | undefined;
    const borrowed = Object.freeze({ query: async (sql: string, values?: unknown[]): Promise<PgSalesResult> => {
      requireDomain(active && pending === undefined && typeof sql === "string" && !/;/.test(sql)
        && (/^\s*(?:\/\*[^]*?\*\/\s*)?SELECT\b/i.test(sql) || /^\s*(?:\/\*[^]*?\*\/\s*)?INSERT INTO naijue_erp\.barcode_scheme\s*\(id,name,barcode_type,rule_description,code_length,rule_version,status\)\s*VALUES\s*\(\$1::uuid,\$2,\$3,\$4,\$5,\$6,\$7\)\s*RETURNING id\s*$/i.test(sql)),
        "BARCODE_SCHEME_CALLBACK_SCOPE", "Only one borrowed-client scheme insert/read at a time");
      // SELECT is further bounded to scheme rows; no functions or unrelated relations are callback authority.
      if (/^\s*(?:\/\*[^]*?\*\/\s*)?SELECT\b/i.test(sql)) requireDomain(
        /^\s*(?:\/\*[^]*?\*\/\s*)?SELECT id,name,barcode_type,rule_description,code_length,rule_version,status FROM naijue_erp\.barcode_scheme ORDER BY id FOR SHARE\s*$/i.test(sql),
        "BARCODE_SCHEME_CALLBACK_SCOPE", "Only complete original seven-field scheme readback permitted");
      const result = client.query(sql, values); pending = result;
      try { return await result; } finally { pending = undefined; }
    } });
    try {
      const callbackRuntime: NativeRuntime26Capability = Object.freeze({ profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1",
        async assertReady(value: unknown, purpose: Parameters<NativeRuntime26Capability["assertReady"]>[1]): Promise<void> {
          requireDomain(active && pending === undefined && value === borrowed && purpose === "IMPORT_STAGE", "BARCODE_SCHEME_CALLBACK_SCOPE", "Original idle borrowed scheme client and purpose only");
          const verification = runtime.assertReady(client,purpose); pending = verification;
          try { await verification; } finally { pending = undefined; }
        } });
      const returned: unknown = await provider.initializeSchemes26(borrowed, { command: structuredClone(command),now,operationId }, callbackRuntime);
      requireDomain(returned === undefined && pending === undefined, "BARCODE_SCHEME_CALLBACK_SCOPE", "Initializer must await every borrowed query and return void");
    } finally { active = false; if (pending) await Promise.allSettled([pending]); }
    const schemes = (await client.query(`/* barcode-init:readback */ SELECT id,name,barcode_type,rule_description,code_length,rule_version,status
      FROM naijue_erp.barcode_scheme ORDER BY id FOR SHARE`)).rows;
    const expected = [...i.schemes].map(s => s.native).sort((a,c) => compare(a.id,c.id));
    requireDomain(requestHash(schemes) === requestHash(expected), "BARCODE_SCHEME_INITIALIZATION_CONFLICT", "Entire scheme table must equal approved six rows");
    const checkpoint = { ...cp, sequence: command.expectedSequence + 1 };
    const before = { checkpoint: cp, schemes: [] };
    const after = { checkpoint, schemeInitialization: i, commandHash: digest };
    const updated = await client.query(`/* barcode-init:checkpoint */ UPDATE naijue_erp.import_batch SET checkpoint=$2::jsonb
      WHERE id=$1::uuid AND checkpoint=$3::jsonb AND status=$4`, [command.batchId,auditJson(checkpoint),auditJson(cp),b.status]);
    requireDomain(updated.rowCount === 1, "IMPORT_CHECKPOINT_CONFLICT", "One unchanged-count checkpoint CAS required");
    const result: CutoffImportResult = { operationId: entityId("operation",operationId),batchId: command.batchId,sequence: command.expectedSequence+1,
      cursor: command.expectedCursor,status: b.status,ledgerEntryIds: [] };
    const audit = await client.query(`INSERT INTO naijue_erp.audit_change
      (id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
      VALUES ($1::uuid,$2::uuid,$3::uuid,'IMPORT',$4::uuid,$5,$6,$7,$8::jsonb,$9::jsonb,$10::timestamptz)`,
    [stableImportId("audit",operationId),operationId,command.actorAccountId,command.batchId,command.action,command.expectedSequence+1,command.expectedSequence+2,auditJson(before),auditJson(after),now]);
    requireDomain(audit.rowCount === 1, "NATIVE_IMPORT_EVIDENCE_INSERT", "One original paired scheme audit required");
    const receipt = await client.query(`INSERT INTO naijue_erp.operation_receipt
      (id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,created_at,completed_at)
      VALUES ($1::uuid,$2::uuid,$3,$4,$5,'IMPORT',$6::uuid,'COMMITTED',$7::jsonb,$8::timestamptz,$8::timestamptz)`,
    [operationId,command.actorAccountId,command.requestKey,digest,command.action,command.batchId,auditJson(result),now]);
    requireDomain(receipt.rowCount === 1, "NATIVE_IMPORT_EVIDENCE_INSERT", "One original six-field scheme receipt required");
    await client.query("SELECT naijue_erp.assert_barcode_scheme_initialization_v19($1::uuid,$2::uuid)", [command.batchId,operationId]);
    return result;
  }
  private async executeCoreInTransaction(client: PgSalesClient, command: CoreImportCommand, now: string, operationId: string,
    digest: string, found: Record<string, unknown> | undefined): Promise<CutoffImportResult> {
    requireDomain(this.runtime26 !== undefined, "IMPORT_BOOTSTRAP_REQUIRED", "CORE requires independently reviewed exact26 runtime");
    let checkpoint: CoreImportCheckpoint | ImportCheckpoint; let before: unknown; let after: unknown;
    let coreSourceDigest: string; let coreCounts: CoreStageCommand["coreInitialization"]["coreCounts"];
    if (command.action === "IMPORT_CORE_STAGE") {
      requireDomain(found === undefined && now === command.coreInitialization.bootstrapAt, "IMPORT_BATCH_EXISTS", "CORE creates only the first batch at its original source time");
      const zero: CoreImportCheckpoint = { sequence: 0, cursor: 0, counts: zeroCounts(), expected: {} }; before = zero;
      const inserted = await client.query(`/* native-core:stage */ INSERT INTO naijue_erp.import_batch
        (id,source_name,source_manifest_ref,source_hash,cutoff_at,mapping_version,inventory_mode,status,checkpoint,created_at,completed_at,history_expected_counts,history_payload_hash,history_actual_counts,history_validation_passed)
        VALUES ($1::uuid,$2,$3,$4,$5::timestamptz,$6,'CUTOFF_STOCK_BASELINE','STAGED',$7::jsonb,$8::timestamptz,NULL,NULL,NULL,NULL,false)`,
      [command.batchId, command.sourceName, command.sourceManifestRef, command.sourceHash, command.cutoffAt, command.mappingVersion, auditJson(zero), now]);
      requireDomain(inserted.rowCount === 1, "IMPORT_INSERT_FAILED", "CORE zero batch insert required");
      await this.runBootstrap26(client, command, now, operationId, digest);
      checkpoint = await claimNativeCoreWarehouseRecords(client, { command, operationId, now }, this.runtime26);
      const update = await client.query(`/* native-core:checkpoint */ UPDATE naijue_erp.import_batch SET checkpoint=$2::jsonb
        WHERE id=$1::uuid AND status='STAGED' AND checkpoint=$3::jsonb AND history_payload_hash IS NULL AND history_expected_counts IS NULL`,
      [command.batchId, auditJson(checkpoint), auditJson(zero)]);
      requireDomain(update.rowCount === 1, "IMPORT_CHECKPOINT_CONFLICT", "CORE original zero checkpoint CAS required");
      const core = command.coreInitialization; coreSourceDigest = core.coreSourceDigest; coreCounts = core.coreCounts;
      after = { schemaVersion: 1, phase: "CORE_INITIALIZED_V1", coreSourceDigest, coreCounts, coreSourceMembers: core.coreSourceMembers,
        authority: { ...core.authority, target: core.target, actorAccountId: command.actorAccountId, batchId: command.batchId,
          namespace: command.sourceName, selectionSha256: command.sourceHash, cutoffAt: command.cutoffAt, bootstrapAt: core.bootstrapAt, commandHash: digest, operationId },
        checkpoint, fullBinding: null, fullFrozen: false };
    } else {
      requireDomain(found !== undefined && found.status === "STAGED" && found.history_payload_hash === null && found.history_expected_counts === null,
        "IMPORT_BATCH_FROZEN", "Only the original unbound CORE batch can bind its complete source once");
      const current = jsonObject(found.checkpoint);
      requireDomain(current.sequence === command.expectedSequence && current.cursor === command.expectedCursor && Object.keys(jsonObject(current.expected)).length === 0,
        "IMPORT_CHECKPOINT_CONFLICT", "Full binding must retain exact current CORE progress");
      const core = (await client.query(`/* native-core:birth */ SELECT a.after_values,r.id FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id
        WHERE r.id=$1::uuid AND r.target_type='IMPORT' AND r.target_id=$2::uuid AND r.action='IMPORT_CORE_STAGE' AND r.status='COMMITTED' FOR SHARE OF r,a`,
      [command.fullBinding.coreReceiptId, command.batchId])).rows;
      requireDomain(core.length === 1, "IMPORT_BATCH_NOT_FOUND", "Original committed CORE receipt required");
      const birth = jsonObject(core[0]!.after_values);
      requireDomain(birth.coreSourceDigest === command.fullBinding.coreSourceDigest && birth.phase === "CORE_INITIALIZED_V1", "IMPORT_MANIFEST_CONFLICT", "Original CORE input digest is immutable");
      coreSourceDigest = command.fullBinding.coreSourceDigest; coreCounts = birth.coreCounts as CoreStageCommand["coreInitialization"]["coreCounts"];
      const counted = counts(current.counts, false);
      requireDomain(targets.every(type => counted[type] <= command.fullBinding.inventoryExpectedCounts[type]), "IMPORT_EXPECTED_COUNT_EXCEEDED", "Full scope must include existing genuine CORE claims");
      const stagedPrefixProof = this.stagedPrefixBinding26 === undefined ? undefined : await verifyCoreStagedPrefix22(client, command,
        { source_name: found.source_name, source_hash: found.source_hash, cutoff_at: found.cutoff_at }, this.stagedPrefixBinding26);
      checkpoint = { sequence: command.expectedSequence + 1, cursor: command.expectedCursor, counts: counted, expected: command.fullBinding.inventoryExpectedCounts };
      before = { checkpoint: current, fullBinding: null, fullFrozen: false, coreReceiptId: command.fullBinding.coreReceiptId, coreSourceDigest };
      after = { schemaVersion: 1, phase: "FULL_SOURCE_BOUND_V1", coreSourceDigest, coreReceiptId: command.fullBinding.coreReceiptId,
        checkpoint, fullBinding: command.fullBinding, fullFrozen: true, ...(stagedPrefixProof === undefined ? {} : { stagedPrefixProof }) };
      const update = await client.query(`/* native-core:bind-full */ UPDATE naijue_erp.import_batch SET checkpoint=$2::jsonb,history_expected_counts=$3::jsonb,history_payload_hash=$4
        WHERE id=$1::uuid AND status='STAGED' AND checkpoint=$5::jsonb AND history_expected_counts IS NULL AND history_payload_hash IS NULL AND NOT history_validation_passed`,
      [command.batchId, auditJson(checkpoint), JSON.stringify(command.fullBinding.historyExpectedCounts), command.fullBinding.authorizedPayloadHash, auditJson(current)]);
      requireDomain(update.rowCount === 1, "IMPORT_CHECKPOINT_CONFLICT", "One exact full-source binding CAS required");
    }
    const result: CutoffImportResult = { operationId: entityId("operation", operationId), batchId: command.batchId, sequence: checkpoint.sequence,
      cursor: checkpoint.cursor, status: "STAGED", ledgerEntryIds: [], phase: command.action === "IMPORT_CORE_STAGE" ? "CORE_INITIALIZED_V1" : "FULL_SOURCE_BOUND_V1", coreSourceDigest, coreCounts };
    const audit = await client.query(`INSERT INTO naijue_erp.audit_change (id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
      VALUES ($1::uuid,$2::uuid,$3::uuid,'IMPORT',$4::uuid,$5,$6,$7,$8::jsonb,$9::jsonb,$10::timestamptz)`,
    [stableImportId("audit", operationId), operationId, command.actorAccountId, command.batchId, command.action,
      checkpoint.sequence, checkpoint.sequence + 1, auditJson(before), auditJson(after), now]);
    requireDomain(audit.rowCount === 1, "NATIVE_IMPORT_EVIDENCE_INSERT", "One CORE/binding audit required");
    const receipt = await client.query(`INSERT INTO naijue_erp.operation_receipt (id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,created_at,completed_at)
      VALUES ($1::uuid,$2::uuid,$3,$4,$5,'IMPORT',$6::uuid,'COMMITTED',$7::jsonb,$8::timestamptz,$8::timestamptz)`,
    [operationId, command.actorAccountId, command.requestKey, digest, command.action, command.batchId, auditJson(result), now]);
    requireDomain(receipt.rowCount === 1, "NATIVE_IMPORT_EVIDENCE_INSERT", "One CORE/binding receipt required");
    return result;
  }
  private async insertRecord(client: PgSalesClient, batch: CutoffImportBatch, source: Pick<CutoffImportItem, "sourceEntityType" | "sourceKey" | "sourceRecordHash" | "sourceFileRef">,
    targetType: ImportTarget, targetId: string, decisionReason: string | null, now: string, returning = false): Promise<PgSalesResult> {
    await client.query("SELECT naijue_erp.import_source_key_lock($1, $2, $3)", [batch.sourceName, source.sourceEntityType, source.sourceKey]);
    const inserted = await client.query(`INSERT INTO naijue_erp.import_record (id, import_batch_id, source_entity_type, source_key, source_record_hash, source_file_ref,
      target_type, target_id, status, decision_reason, reviewed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'IMPORTED', $9, $10::timestamptz)${returning ? " RETURNING id" : ""}`,
    [stableImportId("source", batch.sourceName, source.sourceEntityType, source.sourceKey), batch.id, source.sourceEntityType, source.sourceKey,
      source.sourceRecordHash, source.sourceFileRef, targetType, targetId, decisionReason, now]);
    requireDomain(inserted.rowCount === 1, "IMPORT_INSERT_FAILED", "Approved source identity was not inserted; checkpoint cannot advance");
    return inserted;
  }
  private async insertNativeBaseline(client: PgSalesClient, batch: CutoffImportBatch,
    item: Extract<CutoffImportItem, { targetType: "INVENTORY_LEDGER" }>, operationId: string, now: string): Promise<NewBaselineInsertResults> {
    const ledgerId = stableImportId("baseline", batch.sourceName, item.sourceEntityType, item.sourceKey);
    const record = await this.insertRecord(client, batch, item, "INVENTORY_LEDGER", ledgerId, null, now, true);
    const ledger = await client.query(`INSERT INTO naijue_erp.inventory_ledger (id, operation_id, event_kind, warehouse_id, sku_id, quantity_delta,
      source_sales_line_id, source_transfer_line_id, source_import_batch_id, source_document_version, endpoint, reverses_entry_id, business_date, posted_at)
      VALUES ($1, $2, 'CUTOFF_BASELINE', $3, $4, $5::bigint, NULL, NULL, $6, NULL, 'IMPORT_BASELINE', NULL, $7::date, $8::timestamptz) RETURNING id`,
    [ledgerId, operationId, item.warehouseId, item.skuId, item.quantity.toString(), batch.id, item.businessDate, now]);
    const balance = await client.query(`INSERT INTO naijue_erp.inventory_balance (warehouse_id, sku_id, quantity, version, last_operation_id, updated_at)
      VALUES ($1, $2, $3::bigint, 1, $4, $5::timestamptz) RETURNING warehouse_id,sku_id`,
    [item.warehouseId, item.skuId, item.quantity.toString(), operationId, now]);
    // Every original occurrence (including zero contributions) remains present. The
    // accountant reads back ALL contributors and exact signed sum on this same client.
    const linked = await client.query(`/* native-accounting:attach-contributors */ UPDATE naijue_erp.import_stock_contributor
      SET baseline_ledger_id=$5::uuid WHERE batch_id=$1::uuid AND warehouse_id=$2::uuid AND canonical_sku_id=$3::uuid
      AND canonical_stock_source_key=$4 AND baseline_ledger_id IS NULL RETURNING source_row_id`,
    [batch.id, item.warehouseId, item.skuId, item.sourceKey, ledgerId]);
    requireDomain(linked.rowCount !== null && linked.rowCount > 0 && linked.rowCount === linked.rows.length,
      "NATIVE_RECORD_ACCOUNTING_CONFLICT", "New signed baseline requires all authenticated original contributor links, never a missing-as-zero group");
    return { record, ledger, balance };
  }
  private async insertItem(client: PgSalesClient, batch: CutoffImportBatch, item: CutoffImportItem, operationId: string, now: string): Promise<void> {
    if (item.targetType !== "INVENTORY_LEDGER") { await this.insertRecord(client, batch, item, item.targetType, item.targetId, null, now); return; }
    const ledgerId = stableImportId("baseline", batch.sourceName, item.sourceEntityType, item.sourceKey);
    await this.insertRecord(client, batch, item, "INVENTORY_LEDGER", ledgerId, null, now);
    const ledger = await client.query(`INSERT INTO naijue_erp.inventory_ledger (id, operation_id, event_kind, warehouse_id, sku_id, quantity_delta,
      source_sales_line_id, source_transfer_line_id, source_import_batch_id, source_document_version, endpoint, reverses_entry_id, business_date, posted_at)
      VALUES ($1, $2, 'CUTOFF_BASELINE', $3, $4, $5::bigint, NULL, NULL, $6, NULL, 'IMPORT_BASELINE', NULL, $7::date, $8::timestamptz)`,
    [ledgerId, operationId, item.warehouseId, item.skuId, item.quantity.toString(), batch.id, item.businessDate, now]);
    requireDomain(ledger.rowCount === 1, "IMPORT_INSERT_FAILED", "Nonzero baseline ledger effect was not inserted");
    // Deliberate INSERT only: no overwrite/upsert of previously used stock, even zero.
    const balance = await client.query(`INSERT INTO naijue_erp.inventory_balance (warehouse_id, sku_id, quantity, version, last_operation_id, updated_at)
      VALUES ($1, $2, $3::bigint, 1, $4, $5::timestamptz)`, [item.warehouseId, item.skuId, item.quantity.toString(), operationId, now]);
    requireDomain(balance.rowCount === 1, "IMPORT_INSERT_FAILED", "Nonzero baseline balance was not inserted");
  }
}
