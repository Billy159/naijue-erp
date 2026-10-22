import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { validateCutoffImportCommand, validateImportCounts } from "./inventory-cutoff-import.ts";
import type { CutoffImportCommand, CutoffImportItem, ImportCheckpoint, ImportTarget } from "./inventory-cutoff-import.ts";
import { requestHash } from "./request-hash.ts";
import { assertReviewedNativeImportSchema } from "./native-import-schema-contract.ts";
import type { HistoryTypedClosurePlan } from "./history-typed-closure.ts";
import { captureHistoryTypedClosurePlan } from "./history-typed-publication.ts";

/** New command metadata, NOT a new receipt action or an authorization grant. */
export const NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION = "NATIVE_IMPORT_RECORD_ACCOUNTING_V1";
export const NATIVE_IMPORT_STOCK_CONSERVATION_VERSION = "NATIVE_IMPORT_STOCK_CONSERVATION_V1";
// Original15 constant remains frozen; validator delegates only to explicitly reviewed15/16/17/18 profiles.
export const NATIVE_IMPORT_RECORD_ACCOUNTING_SCHEMA = Object.freeze(Array.from({ length: 15 }, (_, index) => index + 1));
export interface NativeAccountingRecord {
  readonly id: string;
  /** Exact canonical text from the authorized creator plan, never reconstructed from timestamptz. */
  readonly reviewedAt: string;
  readonly decisionReason: string;
}
export type NativeAccountingMembershipItem = Exclude<CutoffImportItem, { targetType: "INVENTORY_LEDGER" }>
  & { readonly nativeRecord: NativeAccountingRecord };
export type NativeAccountingBaselineItem = Extract<CutoffImportItem, { targetType: "INVENTORY_LEDGER" }>;
export type NativeAccountingChunkCommand = Omit<Extract<CutoffImportCommand, { action: "IMPORT_CHUNK" }>, "items">
  & { readonly accountingVersion: typeof NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION;
    readonly items: readonly (NativeAccountingMembershipItem | NativeAccountingBaselineItem)[] };
export type NativeAccountingPublishCommand = Extract<CutoffImportCommand, { action: "IMPORT_PUBLISH" }>
  & { readonly accountingVersion: typeof NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION;
    /** Required by the independent full-scope conservation gate; MAIN-command metadata, never an unhashed sidecar. */
    readonly stockConservation?: NativeStockConservationPlan;
    /** Complete source-authorized plan in the original MAIN hash; presence alone grants nothing. */
    readonly historyClosure?: HistoryTypedClosurePlan };
export type NativeImportAccountingCommand = NativeAccountingChunkCommand | NativeAccountingPublishCommand;
export interface NativeImportRecordClaim {
  readonly batchId: string; readonly importRecordId: string; readonly targetType: ImportTarget; readonly targetId: string;
  readonly operationId: string; readonly checkpointSequence: number;
}
export interface NativeStockConservationPlan {
  readonly version: typeof NATIVE_IMPORT_STOCK_CONSERVATION_VERSION;
  readonly selectionSha256: string; readonly effectiveStockCsvSha256: string; readonly contributorLineageCsvSha256: string;
  readonly contributorCount: number; readonly effectiveGroupCount: number;
  readonly contributorsManifestHash: string; readonly effectiveGroupsManifestHash: string;
  /** Exact authorized complete catalogue scope, including explicitly authorized empty warehouses. */
  readonly warehouses: readonly { readonly sourceKey: string; readonly nativeId: string; readonly signedQuantity: string }[];
  /** Exact observed-source unit partitions; a missing/unknown partition is not an empty zero. */
  readonly warehouseUnits: readonly { readonly warehouseSourceKey: string; readonly sourceUnit: string; readonly signedQuantity: string }[];
}
export interface NativeStockContributorObservation {
  readonly sourceRowId: string; readonly sourceKey: string; readonly sourceFileSha256: string; readonly rowSha256: string;
  readonly fileRef: string; readonly sheet: string; readonly rowNo: string;
  readonly warehouseSourceKey: string; readonly canonicalSkuSourceKey: string; readonly oldSkuSourceId: string;
  readonly canonicalStockSourceKey: string; readonly warehouseId: string; readonly skuId: string;
  readonly signedQuantity: string; readonly sourceUnit: string;
}
export interface NativeStockEffectiveGroupObservation {
  readonly canonicalStockSourceKey: string; readonly warehouseSourceKey: string; readonly canonicalSkuSourceKey: string;
  readonly warehouseId: string; readonly skuId: string; readonly signedQuantity: string; readonly sourceUnit: string;
  readonly contributorCount: number; readonly effectiveRowHash: string;
}
/** Exact canonical integer totals may exceed bigint after summation; no floating point or unit conversion. */
export const isNativeStockSignedTotal = (value: unknown): value is string => typeof value === "string"
  && /^(?:0|-?[1-9]\d{0,127})$/.test(value);
const keys = (value: object, expected: readonly string[]): boolean => Object.keys(value).sort().join(",") === [...expected].sort().join(",");
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0
  && value.length <= 65536 && !value.includes("\0");
const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object"
  && Object.getPrototypeOf(value) === Object.prototype
  && Reflect.ownKeys(value).every(key => typeof key === "string" && Object.getOwnPropertyDescriptor(value, key)?.enumerable === true
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, "value"));
const dense = (value: unknown): value is unknown[] => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
  && Reflect.ownKeys(value).length === value.length + 1
  && Object.keys(value).length === value.length
  && Object.keys(value).every((key, index) => key === String(index)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, "value"));
/** Detect only owned metadata without invoking root/item/array getters. Shared
 * service and original store then apply the SAME raw data-only validator. */
export function hasNativeImportAccountingMetadata(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (["accountingVersion", "nativeRecord", "stockConservation", "historyClosure"].some(key => Object.hasOwn(value, key))) return true;
  const descriptor = Object.getOwnPropertyDescriptor(value, "items");
  const items: unknown = descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  if (!Array.isArray(items)) return false;
  for (const key of Reflect.ownKeys(items)) {
    const itemDescriptor = Object.getOwnPropertyDescriptor(items, key);
    if (!itemDescriptor || !Object.hasOwn(itemDescriptor, "value")) continue;
    const item: unknown = itemDescriptor.value;
    if (item !== null && typeof item === "object" && Object.hasOwn(item, "nativeRecord")) return true;
  }
  return false;
}
export function validateNativeStockConservationPlan(value: unknown): asserts value is NativeStockConservationPlan {
  const hash = (v: unknown): boolean => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
  const count = (v: unknown): boolean => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v < 2147483646;
  requireDomain(plain(value) && keys(value, ["version", "selectionSha256", "effectiveStockCsvSha256", "contributorLineageCsvSha256",
    "contributorCount", "effectiveGroupCount", "contributorsManifestHash", "effectiveGroupsManifestHash", "warehouses", "warehouseUnits"])
    && value.version === NATIVE_IMPORT_STOCK_CONSERVATION_VERSION
    && [value.selectionSha256, value.effectiveStockCsvSha256, value.contributorLineageCsvSha256,
      value.contributorsManifestHash, value.effectiveGroupsManifestHash].every(hash)
    && count(value.contributorCount) && count(value.effectiveGroupCount)
    && dense(value.warehouses) && value.warehouses.length <= 10000
    && dense(value.warehouseUnits) && value.warehouseUnits.length <= 100000,
  "INVALID_NATIVE_STOCK_CONSERVATION_PLAN", "Exact versioned authorized complete scope, artifact identities and manifest observations required");
  const warehouseKeys = new Set<string>(), warehouseIds = new Set<string>(), partitions = new Set<string>();
  for (const row of value.warehouses) {
    requireDomain(plain(row) && keys(row, ["sourceKey", "nativeId", "signedQuantity"]) && text(row.sourceKey)
      && typeof row.nativeId === "string" && isNativeStockSignedTotal(row.signedQuantity)
      && !warehouseKeys.has(row.sourceKey) && !warehouseIds.has(row.nativeId),
    "INVALID_NATIVE_STOCK_CONSERVATION_PLAN", "Full warehouse identity and explicit signed quantity are required, never unknown-as-zero");
    entityId("warehouse", row.nativeId); warehouseKeys.add(row.sourceKey); warehouseIds.add(row.nativeId);
  }
  for (const row of value.warehouseUnits) {
    requireDomain(plain(row) && keys(row, ["warehouseSourceKey", "sourceUnit", "signedQuantity"])
      && text(row.warehouseSourceKey) && warehouseKeys.has(row.warehouseSourceKey) && text(row.sourceUnit)
      && isNativeStockSignedTotal(row.signedQuantity), "INVALID_NATIVE_STOCK_CONSERVATION_PLAN", "Exact known warehouse/unit partition and signed sum required");
    const key = JSON.stringify([row.warehouseSourceKey, row.sourceUnit]);
    requireDomain(!partitions.has(key), "INVALID_NATIVE_STOCK_CONSERVATION_PLAN", "Duplicate authorized warehouse/unit partition"); partitions.add(key);
  }
}
/** The independently authenticated source reader must construct these SAME versioned logical observations. */
export function nativeStockContributorsManifestHash(rows: readonly NativeStockContributorObservation[]): string {
  return requestHash({ version: "NATIVE_STOCK_CONTRIBUTOR_MANIFEST_V1", rows: [...rows].sort((a, b) => a.sourceRowId < b.sourceRowId ? -1 : a.sourceRowId > b.sourceRowId ? 1 : 0) });
}
export function nativeStockEffectiveGroupsManifestHash(rows: readonly NativeStockEffectiveGroupObservation[]): string {
  return requestHash({ version: "NATIVE_STOCK_EFFECTIVE_GROUP_MANIFEST_V1", rows: [...rows].sort((a, b) => a.canonicalStockSourceKey < b.canonicalStockSourceKey ? -1 : a.canonicalStockSourceKey > b.canonicalStockSourceKey ? 1 : 0) });
}
/** Six fractional digits retain PostgreSQL microsecond precision, including meaningful zeroes. */
export function isCanonicalNativeRecordReviewTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value)) return false;
  const milliseconds = `${value.slice(0, 23)}Z`;
  const parsed = Date.parse(milliseconds);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === milliseconds;
}
export function assertNativeRecordAccountingSchema(value: unknown): void {
  assertReviewedNativeImportSchema(value, { minimumVersion: 15, errorCode: "NATIVE_RECORD_ACCOUNTING_SCHEMA_NOT_READY" });
}
export function validateNativeImportAccountingCommand(value: unknown): asserts value is NativeImportAccountingCommand {
  requireDomain(plain(value), "INVALID_NATIVE_RECORD_ACCOUNTING_COMMAND", "A plain data-only MAIN command object is required");
  if (value.action === "IMPORT_CHUNK") requireDomain(dense(value.items) && value.items.every(plain),
    "INVALID_NATIVE_RECORD_ACCOUNTING_ITEM", "Dense plain data-only items required; array named properties must not escape the MAIN hash");
  if (value.action === "IMPORT_PUBLISH") requireDomain(plain(value.approval),
    "INVALID_NATIVE_RECORD_ACCOUNTING_COMMAND", "A plain data-only final approval object is required");
  validateCutoffImportCommand(value as unknown as CutoffImportCommand);
  const command = value as NativeImportAccountingCommand;
  const envelope = ["action", "actorAccountId", "requestKey", "batchId", "expectedSequence", "expectedCursor", "accountingVersion"];
  requireDomain(command.accountingVersion === NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION
    && (command.action === "IMPORT_CHUNK" || command.action === "IMPORT_PUBLISH")
    && keys(command, [...envelope, command.action === "IMPORT_CHUNK" ? "items" : "approval",
      ...(command.action === "IMPORT_PUBLISH" && Object.hasOwn(command, "stockConservation") ? ["stockConservation"] : []),
      ...(command.action === "IMPORT_PUBLISH" && Object.hasOwn(command, "historyClosure") ? ["historyClosure"] : [])]),
  "INVALID_NATIVE_RECORD_ACCOUNTING_COMMAND", "Explicit versioned original CHUNK/PUBLISH command required; no unhashed sidecar or new receipt action");
  if (command.action === "IMPORT_PUBLISH") {
    requireDomain(keys(command.approval, ["completeScope", "absentMeansZero", "allFilesVerified", "finalDeltaVerified",
      "noUnresolvedExceptions", "sourceHash", "sourceManifestRef"]), "INVALID_NATIVE_RECORD_ACCOUNTING_COMMAND", "Exact original final approval required");
    if (Object.hasOwn(command, "stockConservation")) validateNativeStockConservationPlan(command.stockConservation);
    if (Object.hasOwn(command, "historyClosure")) captureHistoryTypedClosurePlan(command.historyClosure);
    return;
  }
  const recordIds = new Set<string>();
  for (const item of command.items) {
    const sourceKeys = ["sourceEntityType", "sourceKey", "sourceRecordHash", "sourceFileRef", "targetType"];
    if (item.targetType === "INVENTORY_LEDGER") {
      requireDomain(keys(item, [...sourceKeys, "warehouseId", "skuId", "quantity", "businessDate"]),
        "INVALID_NATIVE_RECORD_ACCOUNTING_ITEM", "A baseline must be newly created, never adopted through nativeRecord metadata");
    } else {
      const record = item.nativeRecord;
      requireDomain(keys(item, [...sourceKeys, "targetId", "nativeRecord"]) && item.sourceEntityType === item.targetType
        && plain(record)
        && keys(record, ["id", "reviewedAt", "decisionReason"]) && text(record.decisionReason)
        && isCanonicalNativeRecordReviewTime(record.reviewedAt),
      "INVALID_NATIVE_RECORD_ACCOUNTING_ITEM", "Exact creator-plan record ID/reason/original canonical UTC review text required for WAREHOUSE/SKU");
      entityId("operation", record.id);
      requireDomain(!recordIds.has(record.id), "DUPLICATE_NATIVE_RECORD_ACCOUNTING_ITEM", "One canonical native record may occur only once in a chunk");
      recordIds.add(record.id);
    }
  }
}
/** Authenticator must independently verify the selected creator plans AND exact command.
 * A caller-provided hash, SQL count, row existence or these shape checks is not authority. */
export async function authorizeNativeImportAccountingCommand(input: NativeImportAccountingCommand, authorization: {
  assertAllowed(actorAccountId: NativeImportAccountingCommand["actorAccountId"], command: NativeImportAccountingCommand): Promise<void>;
}): Promise<NativeImportAccountingCommand> {
  validateNativeImportAccountingCommand(input);
  const command = structuredClone(input); validateNativeImportAccountingCommand(command);
  await authorization.assertAllowed(command.actorAccountId, structuredClone(command));
  return command;
}
/** Only successful new INSERT RETURNING claims enter this calculation. DB deferred guards independently check every delta. */
export function checkpointFromNativeImportClaims(before: ImportCheckpoint, command: NativeImportAccountingCommand,
  operationId: string, claims: readonly NativeImportRecordClaim[]): ImportCheckpoint {
  validateNativeImportAccountingCommand(command); entityId("operation", operationId);
  requireDomain(plain(before) && keys(before, ["sequence", "cursor", "counts", "expected"]) && plain(before.expected),
    "INVALID_IMPORT_CHECKPOINT", "Plain exact original checkpoint metadata required");
  validateImportCounts(before.expected);
  requireDomain(plain(before.counts) && keys(before.counts, ["WAREHOUSE", "SKU", "INVENTORY_LEDGER", "IMPORT_BATCH"])
    && Object.entries(before.counts).every(([type, count]) => Number.isSafeInteger(count) && count >= 0 && count < 2147483646
      && count <= before.expected[type as ImportTarget])
    && Number.isSafeInteger(before.sequence) && before.sequence >= 0 && before.sequence < 2147483646
    && Number.isSafeInteger(before.cursor) && before.cursor >= 0 && before.cursor < 2147483646
    && Object.values(before.counts).reduce((sum, count) => sum + count, 0) === before.cursor,
  "INVALID_IMPORT_CHECKPOINT", "Exact bounded four-key prior progress with cursor=sum(counts) required");
  requireDomain(before.sequence === command.expectedSequence && before.cursor === command.expectedCursor,
    "IMPORT_CHECKPOINT_CONFLICT", "Claim accounting must replace the exact original checkpoint");
  const expectedClaims = command.action === "IMPORT_CHUNK" ? command.items.length : 1;
  const counts = { ...before.counts }; const records = new Set<string>();
  requireDomain(claims.length === expectedClaims, "INCOMPLETE_NATIVE_RECORD_ACCOUNTING", "Every command item requires one new owned claim");
  for (const claim of claims) {
    requireDomain(claim.batchId === command.batchId && claim.operationId === operationId
      && claim.checkpointSequence === before.sequence + 1 && !records.has(claim.importRecordId)
      && Object.hasOwn(counts, claim.targetType), "INVALID_NATIVE_RECORD_ACCOUNTING_CLAIM", "Claim ownership/sequence/type or unique record differs");
    entityId("operation", claim.importRecordId); entityId("operation", claim.targetId); records.add(claim.importRecordId);
    requireDomain(command.action === "IMPORT_PUBLISH" ? claim.targetType === "IMPORT_BATCH" && claim.targetId === command.batchId
      : claim.targetType !== "IMPORT_BATCH", "INVALID_NATIVE_RECORD_ACCOUNTING_CLAIM", "Only original PUBLISH may account the one final approval");
    counts[claim.targetType]++;
    requireDomain(Number.isSafeInteger(counts[claim.targetType]) && counts[claim.targetType] <= before.expected[claim.targetType],
      "IMPORT_EXPECTED_COUNT_EXCEEDED", "New claims exceed the frozen native target scope");
  }
  if (command.action === "IMPORT_CHUNK") {
    for (const item of command.items.filter((item): item is NativeAccountingMembershipItem => item.targetType !== "INVENTORY_LEDGER"))
      requireDomain(claims.filter(claim => claim.targetType === item.targetType && claim.targetId === item.targetId
        && claim.importRecordId === item.nativeRecord.id).length === 1,
      "INVALID_NATIVE_RECORD_ACCOUNTING_CLAIM", "Every native membership claim must bind the exact MAIN-command type, target and record ID");
    for (const type of ["WAREHOUSE", "SKU", "INVENTORY_LEDGER"] as const)
      requireDomain(claims.filter(claim => claim.targetType === type).length === command.items.filter(item => item.targetType === type).length,
        "INVALID_NATIVE_RECORD_ACCOUNTING_CLAIM", "Per-target claim multiplicity must equal the exact MAIN-command items");
  } else requireDomain(before.counts.IMPORT_BATCH === 0
    && (["WAREHOUSE", "SKU", "INVENTORY_LEDGER"] as const).every(type => before.counts[type] === before.expected[type]),
  "INCOMPLETE_IMPORT_SCOPE", "FINAL may increment only after all frozen native target counts are complete");
  const checkpoint = { ...before, expected: { ...before.expected }, sequence: before.sequence + 1, cursor: before.cursor + claims.length, counts };
  requireDomain(checkpoint.sequence < 2147483646 && checkpoint.cursor < 2147483646,
    "IMPORT_COUNTER_OVERFLOW", "Claim checkpoint exceeds the original bounded audit capacity");
  return checkpoint;
}
/** The hash is of the MAIN command including accountingVersion/nativeRecord, not auxiliary metadata. */
export function nativeImportAccountingRequestHash(command: NativeImportAccountingCommand): string {
  validateNativeImportAccountingCommand(command); return requestHash(command);
}
