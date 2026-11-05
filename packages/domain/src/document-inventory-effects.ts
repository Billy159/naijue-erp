import type { DocumentStatus, SalesHeaderRow, SalesLineRow, TransferHeaderRow, TransferLineRow } from "./documents.ts";
import { requireDomain } from "./errors.ts";
import type { InventoryLedgerRow, InventorySource } from "./inventory.ts";
import { businessDate, checkedQuantity, entityId, nextVersion, version } from "./values.ts";
import type { BusinessDate, EntityId, Quantity, Version } from "./values.ts";

/** Inventory-only structural views of the SAME ordinary documents. Full ordinary
 * aggregates are assignable; price/payment/unknown historical actor facts are not
 * prerequisites for computing existing exposure or reversing it. No source flag
 * selects a business workflow. Authorization, money rules, locks and persistence
 * remain the ordinary command transaction's responsibility. */
export type DocumentInventorySnapshot = {
  readonly kind: "SALES";
  readonly header: Pick<SalesHeaderRow, "id" | "businessType" | "businessDate" | "warehouseId" | "status" | "version">;
  readonly lines: readonly Pick<SalesLineRow, "id" | "salesId" | "lineNo" | "skuId" | "quantity" | "isCurrent">[];
} | {
  readonly kind: "TRANSFER";
  readonly header: Pick<TransferHeaderRow, "id" | "businessDate" | "fromWarehouseId" | "toWarehouseId" | "status" | "version">;
  readonly lines: readonly Pick<TransferLineRow, "id" | "transferId" | "lineNo" | "skuId" | "quantity" | "isCurrent">[];
};
export interface DocumentInventoryEffect {
  readonly warehouseId: EntityId<"warehouse">;
  readonly skuId: EntityId<"sku">;
  readonly quantityDelta: Quantity;
  readonly source: InventorySource;
}
export interface DocumentInventoryDelta {
  readonly warehouseId: EntityId<"warehouse">;
  readonly skuId: EntityId<"sku">;
  readonly quantityDelta: Quantity;
}
export interface DocumentInventoryLedgerIntent extends DocumentInventoryEffect {
  /** Stable per operation + original line + endpoint; not a generated ledger ID.
   * Persistence MUST lock/replay the actor/request receipt and enforce uniqueness.
   * A pure function cannot itself make a repeated external write idempotent. */
  readonly intentKey: string;
  readonly operationId: EntityId<"operation">;
  readonly eventKind: "APPROVE" | "UNAPPROVE";
  readonly sourceDocumentVersion: Version;
  readonly businessDate: BusinessDate;
  readonly reversesEntryId: EntityId<"ledger"> | null;
  readonly baselineAnchorOperationId: EntityId<"operation"> | null;
}
/** Compatible with existing runtime rows until the explicitly assigned storage
 * seam adds the nullable anchor FK. Older rows mean null, never an inferred anchor. */
export interface DocumentInventoryLedgerEvidence extends InventoryLedgerRow {
  readonly baselineAnchorOperationId?: EntityId<"operation"> | null;
}
export interface DocumentInventoryMigrationReceipt {
  readonly id: EntityId<"operation">;
  readonly action: "MIGRATE_DOCUMENT";
  readonly status: "COMMITTED";
  readonly targetKind: DocumentInventorySnapshot["kind"];
  readonly targetId: EntityId<"sales"> | EntityId<"transfer">;
  readonly targetVersion: Version;
  readonly actorAccountId: EntityId<"account">;
  readonly completedAt: string;
}
export interface DocumentInventoryMigrationAudit {
  readonly operationId: EntityId<"operation">;
  readonly actorAccountId: EntityId<"account">;
  readonly occurredAt: string;
  readonly oldVersion: null;
  readonly newVersion: Version;
}
export interface DocumentInventorySourceEvidence {
  readonly batchId: string;
  readonly sourceRecordId: string;
  readonly sourceSystem: string;
  readonly sourceEntityType: string;
  readonly sourceKey: string;
  readonly sourceRecordSha256: string;
}
export type DocumentInventoryBaselineCoverage = {
  readonly state: "CONFIRMED";
  readonly baselineBatchId: string;
  readonly baselineManifestSha256: string;
  readonly cutoffAt: string;
  /** Bound by a separately verified package to THIS document's effective snapshot
   * at THIS cutoff. A stock file date alone does not establish this assertion. */
  readonly snapshotKey: string;
} | { readonly state: "UNKNOWN"; readonly reason: string };
export interface DocumentInventoryMigrationInput {
  readonly snapshot: DocumentInventorySnapshot;
  readonly source: DocumentInventorySourceEvidence;
  readonly receipt: DocumentInventoryMigrationReceipt;
  readonly audit: DocumentInventoryMigrationAudit;
  readonly coverage: DocumentInventoryBaselineCoverage;
}
export type PublishedDocumentInventoryInput = Omit<DocumentInventoryMigrationInput, "source"> & { readonly basis: "PUBLISHED_ORDINARY_AUDIT"; readonly source?: never };
export type DocumentInventoryAnchor = (DocumentInventoryMigrationInput | PublishedDocumentInventoryInput) & {
  readonly kind: "BASELINE_ANCHOR";
  /** Mathematical E0, not proof of baseline inclusion when coverage is UNKNOWN. */
  readonly baselineEffects: readonly DocumentInventoryEffect[];
}
export type DocumentInventoryPriorEvidence = {
  readonly kind: "RUNTIME_LEDGER";
  /** Complete immutable document ledger, including reversals. */
  readonly entries: readonly DocumentInventoryLedgerEvidence[];
} | {
  readonly kind: "BASELINE_ANCHOR";
  readonly anchor: DocumentInventoryAnchor;
  /** Must be empty: anchor-backed reversal is only the first stock operation. */
  readonly entries: readonly DocumentInventoryLedgerEvidence[];
} | { readonly kind: "UNKNOWN"; readonly reason: string };
export interface DocumentInventoryTransitionInput {
  /** Trusted persisted document basis; never copied from a submitted draft. */
  readonly stockBasis?: "RUNTIME_LEDGER" | "CUTOFF_HISTORY";
  readonly action: "SAVE" | "APPROVE" | "UNAPPROVE" | "VOID";
  readonly operationId: EntityId<"operation">;
  readonly before: DocumentInventorySnapshot | null;
  readonly after: DocumentInventorySnapshot;
  readonly priorEvidence?: DocumentInventoryPriorEvidence;
}
export interface DocumentInventoryKey { readonly warehouseId: EntityId<"warehouse">; readonly skuId: EntityId<"sku"> }
export interface DocumentInventoryTransitionPlan {
  /** ALL posting keys, including zero-net keys. Lock and establish readiness for every key before any ledger write. */
  readonly touchedKeys: readonly DocumentInventoryKey[];
  readonly ledgerIntents: readonly DocumentInventoryLedgerIntent[];
  readonly balanceDeltas: readonly DocumentInventoryDelta[];
}

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const keyOf = (row: { readonly warehouseId: string; readonly skuId: string }): string => JSON.stringify([row.warehouseId, row.skuId]);
const sourceKey = (source: InventorySource): string => source.kind === "SALES"
  ? JSON.stringify([source.kind, source.salesId, source.salesLineId, source.endpoint])
  : JSON.stringify([source.kind, source.transferId, source.transferLineId, source.endpoint]);
const effectKey = (effect: DocumentInventoryEffect): string => JSON.stringify([sourceKey(effect.source), effect.warehouseId, effect.skuId, effect.quantityDelta.toString()]);
function actualTime(value: string): boolean {
  return typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
function uuid(value: string): boolean {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}
function digest(value: string): boolean { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); }
function validateHeader(snapshot: DocumentInventorySnapshot): void {
  requireDomain(snapshot.kind === "SALES" || snapshot.kind === "TRANSFER", "INVALID_DOCUMENT_KIND", "Expected ordinary sales or transfer");
  entityId(snapshot.kind === "SALES" ? "sales" : "transfer", snapshot.header.id);
  version(snapshot.header.version); businessDate(snapshot.header.businessDate);
  requireDomain(["DRAFT", "APPROVED", "VOID"].includes(snapshot.header.status), "INVALID_STATE", "Unsupported ordinary status");
  if (snapshot.kind === "SALES") {
    entityId("warehouse", snapshot.header.warehouseId);
    requireDomain(["SALE", "RETURN", "EXCHANGE"].includes(snapshot.header.businessType), "INVALID_BUSINESS_TYPE", "Unsupported sales business type");
  } else {
    entityId("warehouse", snapshot.header.fromWarehouseId); entityId("warehouse", snapshot.header.toWarehouseId);
    requireDomain(snapshot.header.fromWarehouseId !== snapshot.header.toWarehouseId, "SAME_WAREHOUSE", "Transfer endpoints must differ");
  }
}

/** Deterministic exact inventory snapshot (NOT a cryptographic digest). It includes
 * stable active line IDs and signed quantities, never prices or inferred actors.
 * A trusted package/archive verifier binds this value to the selected baseline. */
export function canonicalDocumentInventorySnapshot(input: DocumentInventorySnapshot): string {
  const snapshot = structuredClone(input);
  validateHeader(snapshot);
  const header = snapshot.kind === "SALES"
    ? [snapshot.kind, snapshot.header.id, snapshot.header.businessType, snapshot.header.businessDate, snapshot.header.warehouseId, snapshot.header.status, snapshot.header.version]
    : [snapshot.kind, snapshot.header.id, snapshot.header.businessDate, snapshot.header.fromWarehouseId, snapshot.header.toWarehouseId, snapshot.header.status, snapshot.header.version];
  const lines = snapshot.lines.filter(line => line.isCurrent).map(line => {
    checkedQuantity(line.quantity);
    return [line.id, "salesId" in line ? line.salesId : line.transferId, line.lineNo, line.skuId, line.quantity.toString()];
  }).sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
  return JSON.stringify([header, lines]);
}

/** E(document): APPROVED sales=-signed quantity; transfer FROM=-q, TO=+q.
 * DRAFT/VOID have no exposure. No financial or actor values are fabricated here. */
export function documentInventoryEffects(input: DocumentInventorySnapshot, stockBasis?: "RUNTIME_LEDGER" | "CUTOFF_HISTORY"): readonly DocumentInventoryEffect[] {
  const snapshot = structuredClone(input);
  validateHeader(snapshot);
  if (snapshot.header.status !== "APPROVED") return [];
  const current = snapshot.lines.filter(line => line.isCurrent);
  requireDomain(current.length > 0, "EMPTY_DOCUMENT", "Approved exposure requires actual current lines");
  const ids = new Set<string>(), positions = new Set<number>();
  const effects: DocumentInventoryEffect[] = [];
  for (const line of current) {
    const owned = snapshot.kind === "SALES" ? "salesId" in line && line.salesId === snapshot.header.id
      : "transferId" in line && line.transferId === snapshot.header.id;
    const code = snapshot.kind === "SALES" ? "INVALID_LINE" : "INVALID_TRANSFER_LINE";
    requireDomain(owned && Number.isSafeInteger(line.lineNo) && line.lineNo > 0 && !ids.has(line.id) && !positions.has(line.lineNo),
      code, "Expected unique owned current line identities and positions");
    entityId(snapshot.kind === "SALES" ? "salesLine" : "transferLine", line.id); entityId("sku", line.skuId);
    ids.add(line.id); positions.add(line.lineNo); const q = checkedQuantity(line.quantity);
    if (snapshot.kind === "SALES") {
      requireDomain(q !== 0n && (snapshot.header.businessType !== "SALE" || q > 0n || current.some(row => row.quantity > 0n) || stockBasis === "CUTOFF_HISTORY"), "INVALID_SALES_QUANTITY", "SALE needs a positive row; mixed SALE and independent RETURN/EXCHANGE keep nonzero signed quantities");
      effects.push({ warehouseId: snapshot.header.warehouseId, skuId: line.skuId, quantityDelta: checkedQuantity(-q),
        source: { kind: "SALES", salesId: snapshot.header.id, salesLineId: entityId("salesLine", line.id), endpoint: "SALES_WAREHOUSE" } });
    } else {
      requireDomain(q > 0n, "INVALID_TRANSFER_LINE", "Ordinary transfer quantity must be positive, never abs-converted");
      const transferLineId = entityId("transferLine", line.id);
      effects.push({ warehouseId: snapshot.header.fromWarehouseId, skuId: line.skuId, quantityDelta: checkedQuantity(-q),
        source: { kind: "TRANSFER", transferId: snapshot.header.id, transferLineId, endpoint: "FROM" } },
      { warehouseId: snapshot.header.toWarehouseId, skuId: line.skuId, quantityDelta: q,
        source: { kind: "TRANSFER", transferId: snapshot.header.id, transferLineId, endpoint: "TO" } });
    }
  }
  // Check each final per-key aggregate, even when all individual lines fit bigint.
  aggregate(effects);
  return effects.sort((a, b) => compare(sourceKey(a.source), sourceKey(b.source)));
}
function aggregate(rows: readonly DocumentInventoryDelta[]): readonly DocumentInventoryDelta[] {
  const byKey = new Map<string, { warehouseId: EntityId<"warehouse">; skuId: EntityId<"sku">; amount: bigint }>();
  for (const row of rows) {
    entityId("warehouse", row.warehouseId); entityId("sku", row.skuId); checkedQuantity(row.quantityDelta);
    const key = keyOf(row), found = byKey.get(key);
    if (found) found.amount += row.quantityDelta;
    else byKey.set(key, { warehouseId: row.warehouseId, skuId: row.skuId, amount: row.quantityDelta });
  }
  return [...byKey.entries()].sort(([a], [b]) => compare(a, b)).map(([, row]) => ({ warehouseId: row.warehouseId, skuId: row.skuId,
    quantityDelta: checkedQuantity(row.amount) })).filter(row => row.quantityDelta !== 0n);
}
/** Exact vector difference on old-key UNION new-key. This mathematical primitive
 * also supports reconciliation; the ordinary action planner below still forbids
 * direct editing of approved documents. Bigint subtraction is checked at its final
 * storage boundary, not by negating an intermediate MIN quantity. */
export function diffDocumentInventoryEffects(beforeInput: DocumentInventorySnapshot | null, afterInput: DocumentInventorySnapshot, stockBasis?: "RUNTIME_LEDGER" | "CUTOFF_HISTORY"): readonly DocumentInventoryDelta[] {
  const { before, after } = structuredClone({ before: beforeInput, after: afterInput });
  if (before) requireDomain(before.kind === after.kind && before.header.id === after.header.id, "DOCUMENT_ID_MISMATCH", "A transition must retain ordinary document identity");
  const old = before === null ? [] : aggregate(documentInventoryEffects(before, stockBasis)), current = aggregate(documentInventoryEffects(after, stockBasis));
  const union = new Map<string, { warehouseId: EntityId<"warehouse">; skuId: EntityId<"sku">; amount: bigint }>();
  for (const row of old) union.set(keyOf(row), { warehouseId: row.warehouseId, skuId: row.skuId, amount: -row.quantityDelta });
  for (const row of current) {
    const key = keyOf(row), found = union.get(key);
    if (found) found.amount += row.quantityDelta;
    else union.set(key, { warehouseId: row.warehouseId, skuId: row.skuId, amount: row.quantityDelta });
  }
  return [...union.entries()].sort(([a], [b]) => compare(a, b)).map(([, row]) => ({ warehouseId: row.warehouseId, skuId: row.skuId,
    quantityDelta: checkedQuantity(row.amount) })).filter(row => row.quantityDelta !== 0n);
}
function validateMigration(input: DocumentInventoryMigrationInput | PublishedDocumentInventoryInput): void {
  const { snapshot, receipt, audit, source, coverage } = input;
  validateHeader(snapshot); canonicalDocumentInventorySnapshot(snapshot); documentInventoryEffects(snapshot, "CUTOFF_HISTORY");
  entityId("operation", receipt.id); entityId("account", receipt.actorAccountId);
  requireDomain(receipt.action === "MIGRATE_DOCUMENT" && receipt.status === "COMMITTED" && receipt.targetKind === snapshot.kind
    && receipt.targetId === snapshot.header.id && receipt.targetVersion === snapshot.header.version && actualTime(receipt.completedAt),
  "INVALID_BASELINE_ANCHOR", "Anchor must be the real committed migration receipt for this exact ordinary document version");
  requireDomain(audit.operationId === receipt.id && audit.actorAccountId === receipt.actorAccountId && audit.occurredAt === receipt.completedAt
    && audit.oldVersion === null && audit.newVersion === snapshot.header.version, "INVALID_BASELINE_ANCHOR", "Real migration audit must match receipt, actor, time and initialized version");
  if ("basis" in input) requireDomain(input.basis === "PUBLISHED_ORDINARY_AUDIT" && source === undefined && coverage.state === "CONFIRMED", "INVALID_BASELINE_ANCHOR", "Published ordinary audit requires confirmed baseline coverage, not fabricated source identity");
  else requireDomain(source !== undefined && uuid(source.batchId) && uuid(source.sourceRecordId) && typeof source.sourceSystem === "string" && source.sourceSystem.length > 0
    && typeof source.sourceEntityType === "string" && source.sourceEntityType.length > 0 && typeof source.sourceKey === "string" && source.sourceKey.length > 0
    && digest(source.sourceRecordSha256), "INVALID_BASELINE_ANCHOR", "Anchor requires immutable exact source identity and content hash");
  if (coverage.state === "CONFIRMED") requireDomain(uuid(coverage.baselineBatchId) && digest(coverage.baselineManifestSha256)
    && actualTime(coverage.cutoffAt) && coverage.snapshotKey === canonicalDocumentInventorySnapshot(snapshot),
  "INVALID_BASELINE_ANCHOR", "Confirmed cutoff coverage must bind the selected baseline to the exact effective snapshot");
  else requireDomain(coverage.state === "UNKNOWN" && typeof coverage.reason === "string" && coverage.reason.length > 0,
    "INVALID_BASELINE_ANCHOR", "Unknown coverage must remain explicit, not invented as confirmed zero");
}
/** Represents validation of a real migration operation, NOT issuing a receipt or
 * writing a database. The caller persists/verifies the actual receipt+audit in the
 * common UOW. Unknown coverage is preservable in CLEANED preparation; READY must
 * establish coverage before activating stock-sensitive imported approved exposure. */
export function planDocumentInventoryMigration(input: DocumentInventoryMigrationInput): {
  readonly anchor: DocumentInventoryAnchor;
  readonly ledgerIntents: readonly [];
  readonly balanceDeltas: readonly [];
  readonly touchedKeys: readonly [];
} {
  const stable = structuredClone(input);
  validateMigration(stable);
  return { anchor: { ...stable, kind: "BASELINE_ANCHOR", baselineEffects: documentInventoryEffects(stable.snapshot, "CUTOFF_HISTORY") },
    ledgerIntents: [], balanceDeltas: [], touchedKeys: [] };
}
/** Runtime projection of an already validated immutable ordinary receipt/audit.
 * Source-file identities remain an import-time responsibility, not runtime data. */
export function planPublishedDocumentInventoryAnchor(input: Omit<DocumentInventoryMigrationInput, "source">): DocumentInventoryAnchor {
  const stable: PublishedDocumentInventoryInput = { ...structuredClone(input), basis: "PUBLISHED_ORDINARY_AUDIT" };
  requireDomain(!("source" in stable), "INVALID_BASELINE_ANCHOR", "Published business projection must not carry source data");
  validateMigration(stable);
  return { ...stable, kind: "BASELINE_ANCHOR", baselineEffects: documentInventoryEffects(stable.snapshot, "CUTOFF_HISTORY") };
}
function sameInventoryContent(before: DocumentInventorySnapshot, after: DocumentInventorySnapshot): boolean {
  const normal = (s: DocumentInventorySnapshot) => canonicalDocumentInventorySnapshot({ ...s, header: { ...s.header, status: "DRAFT", version: version(1) } } as DocumentInventorySnapshot);
  return normal(before) === normal(after);
}
function validateState(input: DocumentInventoryTransitionInput): void {
  const { before, after, action } = input;
  validateHeader(after); entityId("operation", input.operationId);
  requireDomain(["SAVE", "APPROVE", "UNAPPROVE", "VOID"].includes(action), "INVALID_ACTION", "Unsupported ordinary command");
  if (before === null) {
    requireDomain(action === "SAVE" && after.header.status === "DRAFT" && after.header.version === 1,
      "INVALID_STATE", "An ordinary document starts as a version-1 saved draft");
    return;
  }
  validateHeader(before);
  requireDomain(before.kind === after.kind && before.header.id === after.header.id, "DOCUMENT_ID_MISMATCH", "Ordinary identity cannot change");
  requireDomain(after.header.version === nextVersion(before.header.version), "VERSION_CONFLICT", "Every real command increments the current version once");
  const status: DocumentStatus = action === "APPROVE" ? "APPROVED" : action === "VOID" ? "VOID" : "DRAFT";
  requireDomain(before.header.status === (action === "UNAPPROVE" ? "APPROVED" : "DRAFT") && after.header.status === status,
    "INVALID_STATE", "Use the ordinary draft→approve→unapprove→edit/reapprove lifecycle; only drafts can be voided");
  requireDomain(action === "SAVE" || sameInventoryContent(before, after), "ACTION_CONTENT_MISMATCH", "Approval, unapproval and void do not implicitly edit document inventory facts");
}
/** Verify the COMPLETE supplied history, not only the active last approval. */
function validateRuntimeHistory(snapshot: DocumentInventorySnapshot, entries: readonly DocumentInventoryLedgerEvidence[]): readonly DocumentInventoryLedgerEvidence[] {
  const provenance = (condition: unknown): void => requireDomain(condition, "MISSING_POSTING_PROVENANCE", "Complete exact ordinary posting operation/version/endpoint evidence is required");
  const byId = new Map<string, DocumentInventoryLedgerEvidence>();
  const groups = new Map<string, DocumentInventoryLedgerEvidence[]>(), byVersion = new Map<number, string>();
  const groupSources = new Map<string, Set<string>>();
  const reversed = new Set<string>(), anchorIds = new Set<string>();
  for (const row of entries) {
    provenance(uuid(row.id) && uuid(row.operationId) && !byId.has(row.id) && Number.isSafeInteger(row.sourceDocumentVersion)
      && row.sourceDocumentVersion > 0 && row.sourceDocumentVersion <= snapshot.header.version && typeof row.quantityDelta === "bigint"
      && row.quantityDelta !== 0n && row.quantityDelta >= -(2n ** 63n) && row.quantityDelta <= 2n ** 63n - 1n
      && uuid(row.warehouseId) && uuid(row.skuId) && actualTime(row.postedAt));
    provenance(row.source.kind === snapshot.kind && (row.source.kind === "SALES"
      ? row.source.salesId === snapshot.header.id && uuid(row.source.salesLineId) && row.source.endpoint === "SALES_WAREHOUSE"
      : row.source.transferId === snapshot.header.id && uuid(row.source.transferLineId) && ["FROM", "TO"].includes(row.source.endpoint)));
    // ISO day validation is kept under the provenance error boundary.
    provenance(typeof row.businessDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.businessDate)
      && Number.isFinite(Date.parse(row.businessDate + "T00:00:00Z"))
      && new Date(row.businessDate + "T00:00:00Z").toISOString().slice(0, 10) === row.businessDate);
    const anchor = row.baselineAnchorOperationId ?? null;
    provenance((row.eventKind === "APPROVE" && row.reversesEntryId === null && anchor === null)
      || (row.eventKind === "UNAPPROVE" && ((row.reversesEntryId !== null) !== (anchor !== null))));
    if (anchor !== null) { provenance(uuid(anchor)); anchorIds.add(anchor); }
    const group = groups.get(row.operationId);
    const sources = groupSources.get(row.operationId) ?? new Set<string>();
    provenance(!sources.has(sourceKey(row.source))); sources.add(sourceKey(row.source)); groupSources.set(row.operationId, sources);
    if (group) {
      const first = group[0]!;
      provenance(first.eventKind === row.eventKind && first.sourceDocumentVersion === row.sourceDocumentVersion
        && first.businessDate === row.businessDate && first.postedAt === row.postedAt);
      group.push(row);
    } else groups.set(row.operationId, [row]);
    const atVersion = byVersion.get(row.sourceDocumentVersion);
    provenance(atVersion === undefined || atVersion === row.operationId); byVersion.set(row.sourceDocumentVersion, row.operationId);
    byId.set(row.id, row);
  }
  provenance(anchorIds.size <= 1 && [...anchorIds].every(anchor => !groups.has(anchor)));
  const ordered = [...groups.values()].sort((a, b) => a[0]!.sourceDocumentVersion - b[0]!.sourceDocumentVersion);
  let priorEvent: "APPROVE" | "UNAPPROVE" | undefined;
  for (let index = 0; index < ordered.length; index++) {
    const rows = ordered[index]!, first = rows[0]!;
    provenance(first.eventKind !== priorEvent); priorEvent = first.eventKind;
    if (snapshot.kind === "TRANSFER") {
      const pairs = new Map<string, DocumentInventoryLedgerEvidence[]>();
      for (const row of rows) {
        provenance(row.source.kind === "TRANSFER");
        if (row.source.kind !== "TRANSFER") continue;
        const pair = pairs.get(row.source.transferLineId) ?? []; pair.push(row); pairs.set(row.source.transferLineId, pair);
      }
      const fromWarehouses = new Set<string>(), toWarehouses = new Set<string>();
      for (const pair of pairs.values()) {
        const from = pair.find(row => row.source.endpoint === "FROM"), to = pair.find(row => row.source.endpoint === "TO");
        provenance(pair.length === 2 && from && to && from.skuId === to.skuId && from.warehouseId !== to.warehouseId
          && from.quantityDelta + to.quantityDelta === 0n
          && (first.eventKind === "APPROVE" ? from.quantityDelta < 0n && to.quantityDelta > 0n : from.quantityDelta > 0n && to.quantityDelta < 0n));
        if (from && to) { fromWarehouses.add(from.warehouseId); toWarehouses.add(to.warehouseId); }
      }
      provenance(fromWarehouses.size === 1 && toWarehouses.size === 1);
    } else provenance(new Set(rows.map(row => row.warehouseId)).size === 1);
    if (first.eventKind === "UNAPPROVE") {
      const anchors = new Set(rows.map(row => row.baselineAnchorOperationId ?? null));
      if (first.baselineAnchorOperationId != null) {
        provenance(index === 0 && anchors.size === 1 && rows.every(row => row.reversesEntryId === null));
      } else {
        provenance(anchors.size === 1 && anchors.has(null));
        const originals: DocumentInventoryLedgerEvidence[] = [];
        for (const row of rows) {
          const original = row.reversesEntryId === null ? undefined : byId.get(row.reversesEntryId);
          provenance(original && original.eventKind === "APPROVE" && !reversed.has(original.id)
            && original.sourceDocumentVersion + 1 === row.sourceDocumentVersion && original.operationId !== row.operationId
            && original.businessDate === row.businessDate
            && original.quantityDelta === -row.quantityDelta
            && effectKey({ ...row, quantityDelta: original.quantityDelta }) === effectKey(original));
          if (original) { reversed.add(original.id); originals.push(original); }
        }
        const originalOperations = new Set(originals.map(row => row.operationId));
        provenance(originalOperations.size === 1 && originals.length === (groups.get(originals[0]?.operationId ?? "")?.length ?? -1));
      }
    }
  }
  return entries.filter(row => row.eventKind === "APPROVE" && !reversed.has(row.id));
}
function assertCurrentOriginals(snapshot: DocumentInventorySnapshot, active: readonly DocumentInventoryLedgerEvidence[], expected: readonly DocumentInventoryEffect[]): readonly DocumentInventoryLedgerEvidence[] {
  const expectedBySource = new Map(expected.map(effect => [sourceKey(effect.source), effectKey(effect)]));
  requireDomain(active.length === expected.length && expected.length > 0 && new Set(active.map(row => row.operationId)).size === 1
    && active.every(row => row.sourceDocumentVersion === snapshot.header.version && row.businessDate === snapshot.header.businessDate
      && expectedBySource.get(sourceKey(row.source)) === effectKey(row)),
  "MISSING_POSTING_PROVENANCE", "Current active approval must match the entire exact effective line/endpoint set");
  return [...active].sort((a, b) => compare(sourceKey(a.source), sourceKey(b.source)));
}
function touchedInventoryKeys(rows: readonly DocumentInventoryKey[]): readonly DocumentInventoryKey[] {
  const keys = new Map<string, DocumentInventoryKey>();
  for (const row of rows) {
    entityId("warehouse", row.warehouseId); entityId("sku", row.skuId);
    keys.set(keyOf(row), { warehouseId: row.warehouseId, skuId: row.skuId });
  }
  return [...keys.entries()].sort(([a], [b]) => compare(a, b)).map(([, value]) => value);
}

/** One ordinary status machine and inventory algorithm for both document types.
 * Receipt replay, whole-set atomicity, CAS and anchor-once uniqueness MUST still
 * be enforced by the persistence transaction; the plan does not claim a PG run. */
export function planDocumentInventoryTransition(submitted: DocumentInventoryTransitionInput): DocumentInventoryTransitionPlan {
  const input = structuredClone(submitted);
  validateState(input);
  const { before, after, action, operationId } = input;
  const evidence = input.priorEvidence;
  let active: readonly DocumentInventoryLedgerEvidence[] = [];
  if (evidence && evidence.kind !== "UNKNOWN") {
    if (evidence.kind === "BASELINE_ANCHOR") {
      validateMigration(evidence.anchor);
      requireDomain(evidence.anchor.receipt.id !== operationId, "MISSING_POSTING_PROVENANCE", "A new command cannot reuse its migration operation identity");
    }
    requireDomain(evidence.entries.every(row => row.operationId !== operationId && row.baselineAnchorOperationId !== operationId),
      "MISSING_POSTING_PROVENANCE", "Known posting and migration identities cannot be reused; committed retries replay their receipt");
    active = validateRuntimeHistory(before ?? after, evidence.entries);
    if (action !== "UNAPPROVE") requireDomain(active.length === 0, "MISSING_POSTING_PROVENANCE", "A draft operation cannot retain an active prior approval");
  }
  const balanceDeltas = diffDocumentInventoryEffects(before, after, input.stockBasis);
  if (action === "SAVE" || action === "VOID") return { ledgerIntents: [], balanceDeltas, touchedKeys: [] };
  let effects: readonly DocumentInventoryEffect[];
  let originals: readonly DocumentInventoryLedgerEvidence[] = [];
  let anchorId: EntityId<"operation"> | null = null;
  if (action === "APPROVE") effects = documentInventoryEffects(after, input.stockBasis);
  else {
    requireDomain(before, "INVALID_STATE", "Unapproval requires an existing approved document");
    const expected = documentInventoryEffects(before, input.stockBasis);
    requireDomain(evidence && evidence.kind !== "UNKNOWN", "MISSING_POSTING_PROVENANCE", "Unapproval requires actual prior runtime effects or a verified baseline anchor");
    if (evidence.kind === "BASELINE_ANCHOR") {
      const { anchor } = evidence; validateMigration(anchor);
      requireDomain(anchor.kind === "BASELINE_ANCHOR" && anchor.receipt.id !== operationId && evidence.entries.length === 0
        && canonicalDocumentInventorySnapshot(anchor.snapshot) === canonicalDocumentInventorySnapshot(before)
        && anchor.baselineEffects.length === expected.length && anchor.baselineEffects.every((e, i) => effectKey(e) === effectKey(expected[i]!)),
      "MISSING_POSTING_PROVENANCE", "Anchor is only valid for the complete unchanged initial approved effect set, before any runtime posting");
      requireDomain(anchor.coverage.state === "CONFIRMED", "BASELINE_COVERAGE_UNKNOWN", "The selected stock baseline must explicitly cover this exact effective document version");
      anchorId = anchor.receipt.id;
    } else {
      requireDomain(evidence.entries.every(row => row.operationId !== operationId), "MISSING_POSTING_PROVENANCE", "A new reversal cannot reuse a prior operation identity; committed retries replay their receipt");
      originals = assertCurrentOriginals(before, active, expected);
    }
    effects = expected.map(effect => ({ ...effect, quantityDelta: checkedQuantity(-effect.quantityDelta) }));
  }
  const originalBySource = new Map(originals.map(row => [sourceKey(row.source), row]));
  const ledgerIntents = effects.map(effect => {
    const original = originalBySource.get(sourceKey(effect.source));
    return { ...effect, intentKey: JSON.stringify([operationId, action, sourceKey(effect.source)]), operationId,
      eventKind: action, sourceDocumentVersion: after.header.version, businessDate: after.header.businessDate,
      reversesEntryId: original?.id ?? null, baselineAnchorOperationId: anchorId };
  });
  requireDomain(JSON.stringify(aggregate(ledgerIntents).map(x => [keyOf(x), x.quantityDelta.toString()]))
    === JSON.stringify(balanceDeltas.map(x => [keyOf(x), x.quantityDelta.toString()])), "INVENTORY_EFFECT_MISMATCH", "Every planned line/endpoint must exactly account for the whole vector difference");
  return { ledgerIntents, balanceDeltas, touchedKeys: touchedInventoryKeys(ledgerIntents) };
}

export type InventoryEffectBalanceKnowledge = {
  readonly warehouseId: EntityId<"warehouse">; readonly skuId: EntityId<"sku">;
} & ({ readonly state: "KNOWN"; readonly quantity: Quantity } | {
  /** Trusted transaction proof of complete publication + exact SKU membership +
   * no prior ledger, not a client claim or a default for a missing row. */
  readonly state: "PUBLISHED_ZERO"; readonly baselineBatchId: string; readonly baselineManifestSha256: string;
} | { readonly state: "UNKNOWN" | "NOT_READY" | "MISSING" | "NO_SUCH_SKU" | "FAILED"; readonly reason?: string });
export interface InventoryEffectBalancePlan extends DocumentInventoryDelta {
  readonly quantityBefore: Quantity;
  readonly quantityAfter: Quantity;
}
/** Current real-event balance math only. It never fills historical before/after.
 * Negative balances remain allowed by existing ordinary rules. The transaction
 * must hold the sorted full key set, revalidate coverage, and persist atomically. */
export function planInventoryEffectBalances(deltaInput: readonly DocumentInventoryDelta[], knowledgeInput: readonly InventoryEffectBalanceKnowledge[],
  touchedInput: readonly DocumentInventoryKey[] = []): readonly InventoryEffectBalancePlan[] {
  const { deltas, knowledge, touched } = structuredClone({ deltas: deltaInput, knowledge: knowledgeInput, touched: touchedInput });
  const byKey = new Map<string, InventoryEffectBalanceKnowledge>();
  for (const row of knowledge) {
    requireDomain(!byKey.has(keyOf(row)), "DUPLICATE_INVENTORY_KEY", "Each inventory key needs one unambiguous locked read"); byKey.set(keyOf(row), row);
  }
  const quantities = new Map<string, Quantity>();
  // Validate ALL touched keys BEFORE dropping zero-net deltas. When the caller
  // supplies only plan.balanceDeltas it MUST also pass plan.touchedKeys.
  for (const key of touchedInventoryKeys([...deltas, ...touched])) {
    const found = byKey.get(keyOf(key));
    requireDomain(found, "INVENTORY_NOT_READY", "No read/coverage proof exists for an affected inventory key");
    requireDomain(found.state !== "FAILED", "INVENTORY_READ_FAILED", "An inventory read failure is not a zero balance");
    requireDomain(found.state === "KNOWN" || found.state === "PUBLISHED_ZERO", "INVENTORY_NOT_READY", "Unknown, missing or absent stock must not become zero");
    if (found.state === "PUBLISHED_ZERO") requireDomain(uuid(found.baselineBatchId) && digest(found.baselineManifestSha256),
      "INVENTORY_NOT_READY", "Published zero requires exact baseline identity and manifest proof");
    quantities.set(keyOf(key), found.state === "KNOWN" ? checkedQuantity(found.quantity) : checkedQuantity(0n));
  }
  return aggregate(deltas).map(delta => {
    const quantityBefore = quantities.get(keyOf(delta))!;
    return { ...delta, quantityBefore, quantityAfter: checkedQuantity(quantityBefore + delta.quantityDelta) };
  });
}
