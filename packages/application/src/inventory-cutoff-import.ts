import { requireDomain } from "../../domain/src/errors.ts";
import { businessDate, entityId, quantity } from "../../domain/src/values.ts";
import type { BusinessDate, EntityId, Quantity } from "../../domain/src/values.ts";
import { requestHash } from "./request-hash.ts";
import { historyImportStageMetadata } from "./history-import-lifecycle.ts";
import type { HistoryImportStageMetadata } from "./history-import-lifecycle.ts";
import { hasNativeImportAccountingMetadata, validateNativeImportAccountingCommand } from "./native-import-record-accounting.ts";

/** Approved import metadata only. No source file is opened on the runtime read path. */
export const CUTOFF_IMPORT_CHUNK_LIMIT = 500;
export const COMPLETE_SCOPE_DECISION = "COMPLETE_SCOPE;ABSENT_IS_ZERO;ALL_FILES_VERIFIED;FINAL_DELTA_VERIFIED;NO_UNRESOLVED_EXCEPTIONS";
export type ImportTarget = "WAREHOUSE" | "SKU" | "INVENTORY_LEDGER" | "IMPORT_BATCH";
export type ImportCounts = Readonly<Record<ImportTarget, number>>;
export interface ImportCheckpoint {
  readonly sequence: number; readonly cursor: number; readonly counts: ImportCounts; readonly expected: ImportCounts;
}
export interface CutoffImportBatch {
  readonly id: string; readonly sourceName: string; readonly sourceManifestRef: string; readonly sourceHash: string;
  readonly cutoffAt: string; readonly mappingVersion: string; readonly inventoryMode: "CUTOFF_STOCK_BASELINE";
  readonly status: "STAGED" | "VALIDATING" | "PASSED" | "IMPORTED" | "FAILED";
  readonly checkpoint: ImportCheckpoint; readonly createdAt: string; readonly completedAt: string | null;
  readonly historyMetadata?: HistoryImportStageMetadata;
}
export interface ApprovedSourceIdentity {
  readonly sourceEntityType: string; readonly sourceKey: string; readonly sourceRecordHash: string; readonly sourceFileRef: string;
}
export type CutoffImportItem = ApprovedSourceIdentity & (
  { readonly targetType: "WAREHOUSE"; readonly targetId: EntityId<"warehouse"> }
  | { readonly targetType: "SKU"; readonly targetId: EntityId<"sku"> }
  | { readonly targetType: "INVENTORY_LEDGER"; readonly warehouseId: EntityId<"warehouse">; readonly skuId: EntityId<"sku">;
    readonly quantity: Quantity; readonly businessDate: BusinessDate }
);
interface ImportEnvelope {
  readonly actorAccountId: EntityId<"account">; readonly requestKey: string; readonly batchId: string;
}
export type CompleteCutoffImportCommand = ImportEnvelope & (
  { readonly action: "IMPORT_STAGE"; readonly sourceName: string; readonly sourceManifestRef: string; readonly sourceHash: string;
    readonly cutoffAt: string; readonly mappingVersion: string; readonly expected: ImportCounts;
    /** Mandatory only for V2; independently authorized with the complete frozen command. */
    readonly historyMetadata?: HistoryImportStageMetadata }
  | { readonly action: "IMPORT_CHUNK"; readonly expectedSequence: number; readonly expectedCursor: number; readonly items: readonly CutoffImportItem[] }
  | { readonly action: "IMPORT_PUBLISH"; readonly expectedSequence: number; readonly expectedCursor: number;
    /** Explicit reviewed evidence, not an inferred EOF or same-grand-total check. */
    readonly approval: { readonly completeScope: true; readonly absentMeansZero: true; readonly allFilesVerified: true;
      readonly finalDeltaVerified: true; readonly noUnresolvedExceptions: true; readonly sourceHash: string; readonly sourceManifestRef: string } }
);
/** Approved v14: source birth evidence stays immutable when the full source is bound later. */
export type CorePartyEntity = "STAFF" | "HALL" | "WAREHOUSE" | "CUSTOMER";
export interface CoreSourceMember { readonly sourceRowId: string; readonly entity: CorePartyEntity; readonly sourceKey: string; readonly nativeId: string }
export interface CoreAccountSnapshot {
  readonly id: string; readonly staff_id: string; readonly login_enabled: boolean; readonly auth_version: 1; readonly version: 1;
  readonly created_at: string; readonly updated_at: string;
}
export interface CoreSourceMembers { readonly parties: readonly CoreSourceMember[]; readonly accounts: readonly CoreAccountSnapshot[] }
export const CORE_INITIALIZATION_COUNTS = Object.freeze({ STAFF: 49, HALL: 22, WAREHOUSE: 22, CUSTOMER: 22, USER_ACCOUNT: 49 } as const);
export interface CoreAuthority {
  readonly account_capture_sha256: string; readonly account_decisions_sha256: string; readonly identity_review_sha256: string;
  readonly bootstrap_execution_review_sha256: string; readonly source_identity_facts_sha256: string; readonly approved_employee_plan_sha256: string;
  readonly old_source_batch_id: string; readonly old_source_manifest_sha256: string;
}
export interface CoreInitializationMetadata {
  readonly scopeVersion: "CORE_INITIALIZATION_26_V1"; readonly coreSourceDigest: string;
  readonly coreCounts: typeof CORE_INITIALIZATION_COUNTS; readonly coreSourceMembers: CoreSourceMembers; readonly authority: CoreAuthority;
  readonly target: { readonly database: string; readonly role: string; readonly serverAddress: string | null; readonly serverPort: number | null; readonly postmasterStartedAt: string };
  readonly bootstrapAt: string;
}
export interface CoreWarehouseItem extends ApprovedSourceIdentity {
  readonly targetType: "WAREHOUSE"; readonly targetId: EntityId<"warehouse">;
  readonly nativeRecord: { readonly id: string; readonly reviewedAt: string; readonly decisionReason: string };
}
export interface CoreImportCheckpoint { readonly sequence: number; readonly cursor: number; readonly counts: ImportCounts; readonly expected: Readonly<Record<string, never>> }
export type CoreStageCommand = ImportEnvelope & {
  readonly action: "IMPORT_CORE_STAGE"; readonly sourceName: string; readonly sourceManifestRef: string; readonly sourceHash: string;
  readonly cutoffAt: string; readonly mappingVersion: "V2_HISTORY_NULLABLE_1"; readonly coreInitialization: CoreInitializationMetadata;
  readonly accountingVersion: "NATIVE_IMPORT_RECORD_ACCOUNTING_V1"; readonly expectedSequence: 0; readonly expectedCursor: 0;
  readonly items: readonly CoreWarehouseItem[];
};
export interface CoreMaintenanceMember extends CoreSourceMember {
  readonly version: number; readonly nativeSnapshot: Readonly<Record<string, unknown>>;
  readonly operations: readonly { readonly operationId: string; readonly fromVersion: number; readonly toVersion: number }[];
}
export interface CoreFullSourceBinding {
  readonly authorizedPayloadHash: string; readonly historyExpectedCounts: HistoryImportStageMetadata["expectedCounts"];
  readonly inventoryExpectedCounts: ImportCounts; readonly sourceClosurePins: readonly { readonly group: string; readonly sha256: string }[];
  readonly coreReceiptId: string; readonly coreSourceDigest: string;
  readonly coreMaintenanceBinding: { readonly version: "CORE_MAINTENANCE_BINDING_V1"; readonly members: readonly CoreMaintenanceMember[] };
}
export type BindFullSourceCommand = ImportEnvelope & {
  readonly action: "IMPORT_BIND_FULL_SOURCE"; readonly expectedSequence: number; readonly expectedCursor: number; readonly fullBinding: CoreFullSourceBinding;
};
export type CoreImportCommand = CoreStageCommand | BindFullSourceCommand;
export interface BarcodeSchemeSnapshot {
  readonly id: string; readonly name: string; readonly barcode_type: string; readonly rule_description: string;
  readonly code_length: number | null; readonly rule_version: string; readonly status: "CURRENT" | "HISTORICAL";
}
export type BarcodeSchemeInitializationCommand = ImportEnvelope & {
  readonly action: "IMPORT_INITIALIZE_BARCODE_SCHEMES"; readonly expectedSequence: number; readonly expectedCursor: number;
  readonly schemeInitialization: {
    readonly version: "BARCODE_SCHEME_INITIALIZATION_V19"; readonly coreReceiptId: string; readonly coreSourceDigest: string;
    readonly fixedSourceNamespace: string; readonly selectionSha256: string; readonly cutoffAt: string;
    readonly target: CoreInitializationMetadata["target"];
    readonly approvalPins: { readonly proposalSha256: string; readonly approvalSha256: string; readonly writeContractReplySha256: string };
    readonly schemes: readonly { readonly sourceSchemeKey: string; readonly native: BarcodeSchemeSnapshot }[];
  };
};
export type CutoffImportCommand = CompleteCutoffImportCommand | CoreImportCommand | BarcodeSchemeInitializationCommand;
export function isCoreImportCommand(command: CutoffImportCommand): command is CoreImportCommand {
  return command.action === "IMPORT_CORE_STAGE" || command.action === "IMPORT_BIND_FULL_SOURCE";
}
export interface CutoffImportResult {
  readonly operationId: EntityId<"operation">; readonly batchId: string; readonly sequence: number; readonly cursor: number;
  readonly status: "STAGED" | "VALIDATING" | "IMPORTED";
  readonly ledgerEntryIds: readonly EntityId<"ledger">[];
  readonly phase?: "CORE_INITIALIZED_V1" | "FULL_SOURCE_BOUND_V1"; readonly coreSourceDigest?: string; readonly coreCounts?: typeof CORE_INITIALIZATION_COUNTS;
}
export interface CutoffImportStore {
  /** Atomic receipt+native data+checkpoint+audit, serialized batch/source/key identities. Never automatic retry after unknown COMMIT. */
  execute(command: CutoffImportCommand, now: string): Promise<CutoffImportResult>;
}
export interface CutoffImportDependencies {
  readonly store: CutoffImportStore; readonly now: () => string;
  /** Must validate the exact approved manifest and FIXED source namespace, not just an actor role. No implicit default. */
  readonly authorization: { assertAllowed(actorAccountId: EntityId<"account">, command: CutoffImportCommand): Promise<void> };
}
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const hash = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
function counter(value: unknown): asserts value is number {
  requireDomain(typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < 2147483646,
    "INVALID_IMPORT_CHECKPOINT", "Import counters must be bounded nonnegative integers");
}
export function validateImportCounts(value: ImportCounts): void {
  requireDomain(typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === "IMPORT_BATCH,INVENTORY_LEDGER,SKU,WAREHOUSE", "INVALID_IMPORT_COUNTS", "Expected exact approved import target counters");
  for (const count of Object.values(value)) counter(count);
  requireDomain(value.IMPORT_BATCH === 1, "INVALID_IMPORT_COUNTS", "Exactly one explicit final complete-scope approval is required");
}
/** Stable identities depend on the fixed namespace + category + original key, never a renameable file. */
export function stableImportId(purpose: string, ...identity: readonly string[]): string {
  const h = requestHash(["naijue-cutoff-v1", purpose, ...identity]).slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function validateCutoffImportCommand(command: CutoffImportCommand): void {
  requireDomain(typeof command === "object" && command !== null && !Array.isArray(command), "INVALID_IMPORT_COMMAND", "Expected an explicit import command");
  if (command.action === "IMPORT_INITIALIZE_BARCODE_SCHEMES") { validateBarcodeSchemeInitializationCommand(command); return; }
  entityId("operation", command.batchId); entityId("account", command.actorAccountId);
  const forbidden = ["validationPassed", "historyValidationPassed", "history_validation_passed", "historyActualCounts", "history_actual_counts"];
  requireDomain(forbidden.every(k => !Object.hasOwn(command, k)), "CALLER_HISTORY_VALIDATION_FORBIDDEN", "History validation is a same-transaction SQL result, never a caller flag");
  if (isCoreImportCommand(command)) { validateCoreImportCommand(command); return; }
  if (command.action !== "IMPORT_STAGE") requireDomain(!Object.hasOwn(command, "historyMetadata"), "INVALID_HISTORY_IMPORT_METADATA", "Only STAGE may freeze history metadata");
  requireDomain(nonempty(command.requestKey), "INVALID_REQUEST_KEY", "A stable original import request key is required");
  if (command.action === "IMPORT_STAGE") {
    requireDomain(/^[a-z][a-z0-9_.:-]*$/.test(command.sourceName) && nonempty(command.sourceManifestRef)
      && hash(command.sourceHash) && nonempty(command.mappingVersion)
      && Number.isFinite(Date.parse(command.cutoffAt)) && /(?:Z|[+-]\d\d:\d\d)$/.test(command.cutoffAt),
    "INVALID_IMPORT_MANIFEST", "A fixed source namespace and frozen reviewed manifest are required");
    validateImportCounts(command.expected); historyImportStageMetadata(command.mappingVersion, command.historyMetadata); return;
  }
  counter(command.expectedSequence); counter(command.expectedCursor);
  if (command.action === "IMPORT_PUBLISH") {
    const a = command.approval;
    requireDomain(a === null || typeof a !== "object" || forbidden.every(k => !Object.hasOwn(a, k)), "CALLER_HISTORY_VALIDATION_FORBIDDEN", "Approval cannot carry a history-validation bypass flag");
    requireDomain(typeof a === "object" && a !== null && a.completeScope === true && a.absentMeansZero === true && a.allFilesVerified === true
      && a.finalDeltaVerified === true && a.noUnresolvedExceptions === true && hash(a.sourceHash) && nonempty(a.sourceManifestRef),
    "INCOMPLETE_IMPORT_SCOPE", "Every complete-scope and final-delta attestation must be explicitly approved");
    return;
  }
  requireDomain(command.action === "IMPORT_CHUNK" && Array.isArray(command.items) && command.items.length > 0
    && command.items.length <= CUTOFF_IMPORT_CHUNK_LIMIT, "INVALID_IMPORT_CHUNK", "Import chunks must contain 1 through 500 source records");
  const identities = new Set<string>(); const targets = new Set<string>();
  for (const item of command.items) {
    requireDomain(typeof item === "object" && item !== null && nonempty(item.sourceEntityType) && nonempty(item.sourceKey) && hash(item.sourceRecordHash) && nonempty(item.sourceFileRef),
      "INVALID_IMPORT_SOURCE", "Every item needs an approved stable identity and immutable original reference");
    const identity = JSON.stringify([item.sourceEntityType, item.sourceKey]);
    requireDomain(!identities.has(identity), "DUPLICATE_IMPORT_SOURCE", "Duplicate original source identity in one chunk"); identities.add(identity);
    let target: string;
    if (item.targetType === "INVENTORY_LEDGER") {
      requireDomain(item.sourceEntityType === "INVENTORY_BASELINE" && typeof item.quantity === "bigint" && item.quantity !== 0n,
        "INVALID_SPARSE_BASELINE", "Only approved nonzero baseline quantities create balances or ledger rows");
      quantity(item.quantity.toString()); entityId("warehouse", item.warehouseId); entityId("sku", item.skuId); businessDate(item.businessDate);
      target = JSON.stringify([item.targetType, item.warehouseId, item.skuId]);
    } else {
      requireDomain(item.targetType === "WAREHOUSE" || item.targetType === "SKU", "INVALID_IMPORT_TARGET", "Unsupported import target");
      entityId(item.targetType === "WAREHOUSE" ? "warehouse" : "sku", item.targetId);
      target = JSON.stringify([item.targetType, item.targetId]);
    }
    requireDomain(!targets.has(target), "DUPLICATE_IMPORT_TARGET", "Duplicate formal target or baseline key in one chunk"); targets.add(target);
  }
}
export function createCutoffImportService(dependencies: CutoffImportDependencies): { execute(command: CutoffImportCommand): Promise<CutoffImportResult> } {
  return { async execute(command) {
    if (!isCoreImportCommand(command) && hasNativeImportAccountingMetadata(command)) validateNativeImportAccountingCommand(command);
    if (command.action === "IMPORT_INITIALIZE_BARCODE_SCHEMES") validateBarcodeSchemeInitializationCommand(command);
    const snapshot = structuredClone(command); validateCutoffImportCommand(snapshot);
    await dependencies.authorization.assertAllowed(snapshot.actorAccountId, snapshot);
    const now = dependencies.now();
    requireDomain(Number.isFinite(Date.parse(now)) && now.endsWith("Z"), "INVALID_IMPORT_TIME", "Actual UTC processing time is required");
    return dependencies.store.execute(snapshot, now);
  } };
}

const coreKeys = (value: unknown, names: readonly string[]): value is Record<string, unknown> => value !== null && typeof value === "object"
  && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).sort().join(",") === [...names].sort().join(",");
const coreCheck = (value: unknown): void => requireDomain(value, "INVALID_CORE_IMPORT_COMMAND", "Exact approved CORE initialization or once-only full binding required");
export function validateCoreSourceMembers(value: CoreSourceMembers): void {
  coreCheck(coreKeys(value, ["parties", "accounts"]) && Array.isArray(value.parties) && value.parties.length === 115 && Array.isArray(value.accounts) && value.accounts.length === 49);
  const ids = new Set<string>(), keys = new Set<string>(), counts = { STAFF: 0, HALL: 0, WAREHOUSE: 0, CUSTOMER: 0 };
  for (const row of value.parties) {
    coreCheck(coreKeys(row, ["sourceRowId", "entity", "sourceKey", "nativeId"]) && Object.hasOwn(counts, row.entity) && nonempty(row.sourceKey));
    entityId("operation", row.sourceRowId); entityId("operation", row.nativeId);
    coreCheck(!ids.has(row.sourceRowId) && !ids.has(row.nativeId) && !keys.has(JSON.stringify([row.entity, row.sourceKey])));
    ids.add(row.sourceRowId); ids.add(row.nativeId); keys.add(JSON.stringify([row.entity, row.sourceKey])); counts[row.entity]++;
  }
  coreCheck(Object.entries(counts).every(([k, v]) => v === CORE_INITIALIZATION_COUNTS[k as keyof typeof counts]));
  const accounts = new Set<string>(), staff = new Set<string>();
  for (const account of value.accounts) {
    coreCheck(coreKeys(account, ["id", "staff_id", "login_enabled", "auth_version", "version", "created_at", "updated_at"])
      && typeof account.login_enabled === "boolean" && account.auth_version === 1 && account.version === 1
      && account.created_at === account.updated_at && Number.isFinite(Date.parse(account.created_at)));
    entityId("account", account.id); entityId("staff", account.staff_id);
    coreCheck(!ids.has(account.id) && !accounts.has(account.id) && !staff.has(account.staff_id)
      && value.parties.some(row => row.entity === "STAFF" && row.nativeId === account.staff_id));
    accounts.add(account.id); staff.add(account.staff_id);
  }
}
export function validateCoreImportCommand(command: CoreImportCommand): void {
  const seen = new Set<object>();
  function data(value: unknown): void {
    if (value === null || typeof value !== "object") { coreCheck(["string", "number", "boolean"].includes(typeof value) || value === null); return; }
    coreCheck(!seen.has(value) && (Array.isArray(value) ? Object.getPrototypeOf(value) === Array.prototype : Object.getPrototypeOf(value) === Object.prototype));
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === "length") continue;
      const field = Object.getOwnPropertyDescriptor(value, key)!;
      coreCheck(typeof key === "string" && field.enumerable && Object.hasOwn(field, "value")); data(field.value);
    }
    seen.delete(value);
  }
  data(command); requestHash(command); entityId("account", command.actorAccountId); entityId("operation", command.batchId); coreCheck(nonempty(command.requestKey));
  const envelope = ["action", "actorAccountId", "requestKey", "batchId", "expectedSequence", "expectedCursor"];
  if (command.action === "IMPORT_CORE_STAGE") {
    coreCheck(coreKeys(command, [...envelope, "sourceName", "sourceManifestRef", "sourceHash", "cutoffAt", "mappingVersion", "coreInitialization", "accountingVersion", "items"])
      && /^[a-z][a-z0-9_.:-]*$/.test(command.sourceName) && nonempty(command.sourceManifestRef) && hash(command.sourceHash)
      && command.mappingVersion === "V2_HISTORY_NULLABLE_1" && Number.isFinite(Date.parse(command.cutoffAt))
      && command.accountingVersion === "NATIVE_IMPORT_RECORD_ACCOUNTING_V1" && command.expectedSequence === 0 && command.expectedCursor === 0);
    const core = command.coreInitialization;
    coreCheck(coreKeys(core, ["scopeVersion", "coreSourceDigest", "coreCounts", "coreSourceMembers", "authority", "target", "bootstrapAt"])
      && core.scopeVersion === "CORE_INITIALIZATION_26_V1" && hash(core.coreSourceDigest)
      && requestHash(core.coreCounts) === requestHash(CORE_INITIALIZATION_COUNTS)
      && typeof core.bootstrapAt === "string" && new Date(core.bootstrapAt).toISOString() === core.bootstrapAt);
    validateCoreSourceMembers(core.coreSourceMembers);
    coreCheck(core.coreSourceMembers.accounts.every(account => account.created_at === core.bootstrapAt));
    const authorityKeys = ["account_capture_sha256", "account_decisions_sha256", "identity_review_sha256", "bootstrap_execution_review_sha256", "source_identity_facts_sha256", "approved_employee_plan_sha256", "old_source_batch_id", "old_source_manifest_sha256"];
    coreCheck(coreKeys(core.authority, authorityKeys) && Object.entries(core.authority).every(([k, v]) => k === "old_source_batch_id" ? nonempty(v) : hash(v)));
    coreCheck(coreKeys(core.target, ["database", "role", "serverAddress", "serverPort", "postmasterStartedAt"])
      && nonempty(core.target.database) && nonempty(core.target.role) && nonempty(core.target.postmasterStartedAt)
      && (core.target.serverAddress === null ? core.target.serverPort === null : nonempty(core.target.serverAddress) && Number.isInteger(core.target.serverPort)));
    coreCheck(Array.isArray(command.items) && command.items.length === 22);
    const records = new Set<string>(), warehouses = new Set<string>();
    for (const item of command.items) {
      coreCheck(coreKeys(item, ["targetType", "targetId", "sourceEntityType", "sourceKey", "sourceRecordHash", "sourceFileRef", "nativeRecord"])
        && item.targetType === "WAREHOUSE" && item.sourceEntityType === "WAREHOUSE" && hash(item.sourceRecordHash) && nonempty(item.sourceFileRef)
        && coreKeys(item.nativeRecord, ["id", "reviewedAt", "decisionReason"]) && nonempty(item.nativeRecord.decisionReason) && Number.isFinite(Date.parse(item.nativeRecord.reviewedAt)));
      entityId("operation", item.nativeRecord.id); entityId("warehouse", item.targetId);
      coreCheck(!records.has(item.nativeRecord.id) && !warehouses.has(item.targetId) && core.coreSourceMembers.parties.some(row => row.entity === "WAREHOUSE" && row.nativeId === item.targetId && row.sourceKey === item.sourceKey));
      records.add(item.nativeRecord.id); warehouses.add(item.targetId);
    }
    return;
  }
  coreCheck(command.action === "IMPORT_BIND_FULL_SOURCE" && coreKeys(command, [...envelope, "fullBinding"])); counter(command.expectedSequence); counter(command.expectedCursor);
  const full = command.fullBinding;
  coreCheck(coreKeys(full, ["authorizedPayloadHash", "historyExpectedCounts", "inventoryExpectedCounts", "sourceClosurePins", "coreReceiptId", "coreSourceDigest", "coreMaintenanceBinding"])
    && hash(full.authorizedPayloadHash) && hash(full.coreSourceDigest)); entityId("operation", full.coreReceiptId);
  validateImportCounts(full.inventoryExpectedCounts); historyImportStageMetadata("V2_HISTORY_NULLABLE_1", { expectedCounts: full.historyExpectedCounts, payloadHash: full.authorizedPayloadHash });
  coreCheck(Array.isArray(full.sourceClosurePins) && full.sourceClosurePins.length === 11 && new Set(full.sourceClosurePins.map(p => p.group)).size === 11
    && full.sourceClosurePins.every(p => coreKeys(p, ["group", "sha256"]) && nonempty(p.group) && hash(p.sha256)));
  const maintenance = full.coreMaintenanceBinding;
  coreCheck(coreKeys(maintenance, ["version", "members"]) && maintenance.version === "CORE_MAINTENANCE_BINDING_V1" && Array.isArray(maintenance.members) && maintenance.members.length === 115);
  const members = new Set<string>();
  for (const member of maintenance.members) {
    coreCheck(coreKeys(member, ["sourceRowId", "entity", "sourceKey", "nativeId", "version", "nativeSnapshot", "operations"])
      && ["STAFF", "HALL", "WAREHOUSE", "CUSTOMER"].includes(member.entity) && nonempty(member.sourceKey)
      && Number.isSafeInteger(member.version) && member.version >= 1 && member.nativeSnapshot !== null && typeof member.nativeSnapshot === "object"
      && member.nativeSnapshot.id === member.nativeId && member.nativeSnapshot.version === member.version && Array.isArray(member.operations));
    entityId("operation", member.sourceRowId); entityId("operation", member.nativeId); coreCheck(!members.has(member.sourceRowId)); members.add(member.sourceRowId);
    let version = 1;
    for (const operation of member.operations) {
      coreCheck(coreKeys(operation, ["operationId", "fromVersion", "toVersion"]) && operation.fromVersion === version && operation.toVersion === version + 1);
      entityId("operation", operation.operationId); version++;
    }
    coreCheck(version === member.version);
  }
}

/** Approved v19 independent component action; never an empty accounting CHUNK. */
export function validateBarcodeSchemeInitializationCommand(command: BarcodeSchemeInitializationCommand): void {
  const check = (value: unknown): void => requireDomain(value, "INVALID_BARCODE_SCHEME_INITIALIZATION", "Exact six approved source-bound schemes and original CORE authority required");
  const seen = new Set<object>();
  function data(value: unknown): void {
    if (value === null || typeof value !== "object") { check(value === null || ["string", "number", "boolean"].includes(typeof value)); return; }
    check(!seen.has(value) && Object.getPrototypeOf(value) === (Array.isArray(value) ? Array.prototype : Object.prototype)); seen.add(value);
    if (Array.isArray(value)) check(Reflect.ownKeys(value).length === value.length + 1 && value.every((_, i) => Object.hasOwn(value, i)));
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === "length") continue;
      const field = Object.getOwnPropertyDescriptor(value, key)!;
      check(typeof key === "string" && field.enumerable && Object.hasOwn(field, "value")); data(field.value);
    }
    seen.delete(value);
  }
  data(command); requestHash(command);
  check(coreKeys(command, ["action", "actorAccountId", "requestKey", "batchId", "expectedSequence", "expectedCursor", "schemeInitialization"])
    && command.action === "IMPORT_INITIALIZE_BARCODE_SCHEMES" && nonempty(command.requestKey));
  entityId("account", command.actorAccountId); entityId("operation", command.batchId); counter(command.expectedSequence); counter(command.expectedCursor);
  check(command.expectedSequence > 0);
  const i = command.schemeInitialization;
  check(coreKeys(i, ["version", "coreReceiptId", "coreSourceDigest", "fixedSourceNamespace", "selectionSha256", "cutoffAt", "target", "approvalPins", "schemes"])
    && i.version === "BARCODE_SCHEME_INITIALIZATION_V19" && hash(i.coreSourceDigest) && hash(i.selectionSha256)
    && typeof i.fixedSourceNamespace === "string" && /^[a-z][a-z0-9_.:-]*$/.test(i.fixedSourceNamespace)
    && typeof i.cutoffAt === "string" && Number.isFinite(Date.parse(i.cutoffAt)) && /(?:Z|[+-]\d\d:\d\d)$/.test(i.cutoffAt));
  entityId("operation", i.coreReceiptId);
  check(coreKeys(i.target, ["database", "role", "serverAddress", "serverPort", "postmasterStartedAt"])
    && nonempty(i.target.database) && nonempty(i.target.role) && nonempty(i.target.postmasterStartedAt)
    && (i.target.serverAddress === null ? i.target.serverPort === null : nonempty(i.target.serverAddress)
      && Number.isInteger(i.target.serverPort) && i.target.serverPort! > 0 && i.target.serverPort! <= 65535));
  check(coreKeys(i.approvalPins, ["proposalSha256", "approvalSha256", "writeContractReplySha256"]) && Object.values(i.approvalPins).every(hash));
  check(Array.isArray(i.schemes) && i.schemes.length === 6);
  const keys = new Set<string>(), ids = new Set<string>();
  for (const item of i.schemes) {
    check(coreKeys(item, ["sourceSchemeKey", "native"]) && nonempty(item.sourceSchemeKey));
    const n = item.native;
    check(coreKeys(n, ["id", "name", "barcode_type", "rule_description", "code_length", "rule_version", "status"])
      && [n.name, n.barcode_type, n.rule_description, n.rule_version].every(nonempty)
      && (n.code_length === null || Number.isSafeInteger(n.code_length) && n.code_length > 0)
      && (n.status === "CURRENT" || n.status === "HISTORICAL")); entityId("operation", n.id);
    check(!keys.has(item.sourceSchemeKey) && !ids.has(n.id)); keys.add(item.sourceSchemeKey); ids.add(n.id);
  }
  check([...keys].sort().join(",") === "2018,2020,2021,2021fit,2023,2026"
    && i.schemes.every(s => s.native.status === (s.sourceSchemeKey === "2026" ? "CURRENT" : "HISTORICAL")));
}
