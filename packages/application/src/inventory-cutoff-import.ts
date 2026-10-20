import { requireDomain } from "../../domain/src/errors.ts";
import { businessDate, entityId, quantity } from "../../domain/src/values.ts";
import type { BusinessDate, EntityId, Quantity } from "../../domain/src/values.ts";
import { requestHash } from "./request-hash.ts";

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
export type CutoffImportCommand = ImportEnvelope & (
  { readonly action: "IMPORT_STAGE"; readonly sourceName: string; readonly sourceManifestRef: string; readonly sourceHash: string;
    readonly cutoffAt: string; readonly mappingVersion: string; readonly expected: ImportCounts }
  | { readonly action: "IMPORT_CHUNK"; readonly expectedSequence: number; readonly expectedCursor: number; readonly items: readonly CutoffImportItem[] }
  | { readonly action: "IMPORT_PUBLISH"; readonly expectedSequence: number; readonly expectedCursor: number;
    /** Explicit reviewed evidence, not an inferred EOF or same-grand-total check. */
    readonly approval: { readonly completeScope: true; readonly absentMeansZero: true; readonly allFilesVerified: true;
      readonly finalDeltaVerified: true; readonly noUnresolvedExceptions: true; readonly sourceHash: string; readonly sourceManifestRef: string } }
);
export interface CutoffImportResult {
  readonly operationId: EntityId<"operation">; readonly batchId: string; readonly sequence: number; readonly cursor: number;
  readonly status: "STAGED" | "VALIDATING" | "IMPORTED";
  readonly ledgerEntryIds: readonly EntityId<"ledger">[];
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
  entityId("operation", command.batchId); entityId("account", command.actorAccountId);
  requireDomain(nonempty(command.requestKey), "INVALID_REQUEST_KEY", "A stable original import request key is required");
  if (command.action === "IMPORT_STAGE") {
    requireDomain(/^[a-z][a-z0-9_.:-]*$/.test(command.sourceName) && nonempty(command.sourceManifestRef)
      && hash(command.sourceHash) && nonempty(command.mappingVersion)
      && Number.isFinite(Date.parse(command.cutoffAt)) && /(?:Z|[+-]\d\d:\d\d)$/.test(command.cutoffAt),
    "INVALID_IMPORT_MANIFEST", "A fixed source namespace and frozen reviewed manifest are required");
    validateImportCounts(command.expected); return;
  }
  counter(command.expectedSequence); counter(command.expectedCursor);
  if (command.action === "IMPORT_PUBLISH") {
    const a = command.approval;
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
    const snapshot = structuredClone(command); validateCutoffImportCommand(snapshot);
    await dependencies.authorization.assertAllowed(snapshot.actorAccountId, snapshot);
    const now = dependencies.now();
    requireDomain(Number.isFinite(Date.parse(now)) && now.endsWith("Z"), "INVALID_IMPORT_TIME", "Actual UTC processing time is required");
    return dependencies.store.execute(snapshot, now);
  } };
}
