import { TRANSFER_PREPARE_MAX_LINES, TRANSFER_PREPARE_MAX_NOTE_LENGTH, TRANSFER_PREPARE_MAX_REQUEST_BYTES, transferJsonByteLength, transferPreparedDraftFitsSaveBudget } from "./transfer-payload-budget.ts";
import type { SkuSnapshot } from "../../domain/src/documents.ts";
import { requireDomain } from "../../domain/src/errors.ts";
import { businessDate, entityId, quantity } from "../../domain/src/values.ts";
import type { TransferActor, TransferDependencies, TransferDraft, TransferReferences, TransferTransaction } from "./transfer-ports.ts";
import { createSourceConfirmedTransferReferences } from "./transfer-policy.ts";
import { sourceConfirmedCreateDocumentNumber } from "./source-confirmed-document-number.ts";

/** Manual current SKU selection only. No caller-supplied labels, barcode or number. */
export interface NativeTransferCreateProposal {
  readonly businessDate: string; readonly note: string | null;
  readonly fromWarehouseId: string; readonly toWarehouseId: string;
  readonly lines: readonly { readonly skuId: string; readonly quantity: string }[];
}
export interface NativeTransferExistingProposal extends Omit<NativeTransferCreateProposal, "lines"> {
  readonly transferId: string; readonly expectedVersion: number;
  readonly lines: readonly { readonly existingLineId: string | null; readonly skuId: string; readonly quantity: string }[];
}
export interface NativeTransferExistingPrepared { readonly expectedVersion: number; readonly draft: TransferDraft }
const snapshotFields = ["productCode", "productName", "colorName", "fitName", "sizeName", "barcode"] as const;
function sameSnapshot(a: SkuSnapshot, b: SkuSnapshot): boolean { return snapshotFields.every(key => a[key] === b[key]); }

/** Explicit manual-SKU native write policy. Revalidates newly prepared snapshots
 * within SAVE's original transaction, so preparation never grants later access.
 * Existing exact snapshots remain historical facts; changed/new rows require
 * current enabled MAIN facts. Scanned CONFIRMED_OLD creation is not this profile. */
export function createNativeManualTransferReferences(): TransferReferences {
  const source = createSourceConfirmedTransferReferences();
  return Object.freeze({ async assertValid(tx, actor, action, previous, proposed) {
    await source.assertValid(tx, actor, action, previous, proposed);
    if (action !== "SAVE") return;
    const retained = new Map((previous?.lines ?? []).map(line => [line.id, line]));
    const changed = proposed.lines.filter(line => line.isCurrent && !(retained.get(line.id)?.skuId === line.skuId
      && sameSnapshot(retained.get(line.id)!.snapshot, line.snapshot)));
    if (changed.length === 0) return;
    requireDomain(tx.getCurrentTransferSnapshots, "NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE", "Trusted transaction snapshots required");
    const snapshots = await tx.getCurrentTransferSnapshots(changed.map(line => line.skuId));
    for (const line of changed) {
      const snapshot = snapshots.get(line.skuId);
      requireDomain(snapshot && sameSnapshot(snapshot, line.snapshot), "TRANSFER_SNAPSHOT_MISMATCH", "Prepared snapshot is stale or altered");
    }
  } } satisfies TransferReferences);
}

/** No business document/receipt/audit/stock is produced. PG20+ reserves only its
 * database number after authorization/reference checks. A private preparation
 * key binds the trusted actor on the original transaction, never a SAVE receipt.
 * The draft can be sent to SAVE with expectedVersion:null and a stable request key.
 * Host must opt into createNativeManualTransferReferences for SAVE revalidation.
 * Cancellation/transport lifecycle remains the caller's responsibility. */
export function createNativeTransferPreparation(dependencies: TransferDependencies) {
  return Object.freeze({ async prepareCreate(actorInput: TransferActor, input: NativeTransferCreateProposal): Promise<TransferDraft> {
    const actor = structuredClone(actorInput), proposal = structuredClone(input);
    requireDomain(proposal && typeof proposal === "object" && (proposal.note === null || typeof proposal.note === "string")
      && Array.isArray(proposal.lines) && proposal.lines.length > 0 && proposal.lines.length <= TRANSFER_PREPARE_MAX_LINES,
    "INVALID_LINES", "A bounded actual current selection is required");
    requireDomain(proposal.note === null || proposal.note.length <= TRANSFER_PREPARE_MAX_NOTE_LENGTH,
      "INVALID_HTTP_INPUT", "Transfer note exceeds the preparation limit");
    requireDomain(transferJsonByteLength(proposal) <= TRANSFER_PREPARE_MAX_REQUEST_BYTES,
      "TRANSFER_PAYLOAD_TOO_LARGE", "Transfer preparation exceeds its bounded request budget");
    const id = entityId("transfer", dependencies.newId("transfer"));
    const header = { id, number: sourceConfirmedCreateDocumentNumber("TRANSFER", id), businessDate: businessDate(proposal.businessDate),
      fromWarehouseId: entityId("warehouse", proposal.fromWarehouseId), toWarehouseId: entityId("warehouse", proposal.toWarehouseId), note: proposal.note };
    const lineIds = new Set<string>();
    const lines = proposal.lines.map((line, index) => {
      const lineId = entityId("transferLine", dependencies.newId("transferLine"));
      requireDomain(!lineIds.has(lineId) && String(lineId) !== String(id), "INVALID_LINE", "Distinct generated line identities required"); lineIds.add(lineId);
      const amount = quantity(line.quantity); requireDomain(amount > 0n, "INVALID_TRANSFER_LINE", "Transfer quantity must be positive");
      return { id: lineId, transferId: id, lineNo: index + 1, skuId: entityId("sku", line.skuId), quantity: amount, isCurrent: true as const };
    });
    const preparationId = entityId("operation", dependencies.newId("operation"));
    requireDomain(String(preparationId) !== String(id) && !lineIds.has(preparationId), "INVALID_ID", "Distinct private preparation identity required");
    return dependencies.unitOfWork.transaction(async tx => {
      requireDomain(!await tx.getReceipt(actor.accountId, `prepare-transfer:${preparationId}`),
        "IDEMPOTENCY_CONFLICT", "Private preparation identity already exists");
      requireDomain(!await tx.getTransfer(id), "VERSION_CONFLICT", "Generated document identity already exists");
      // Authorization sees only proposed header scope, before sensitive snapshot lookup.
      await dependencies.authorization.assertAllowed(actor, "SAVE", { header, lines: [] }, undefined, tx);
      requireDomain(tx.getCurrentTransferSnapshots, "NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE", "Trusted transaction snapshots required");
      const snapshots = await tx.getCurrentTransferSnapshots(lines.map(line => line.skuId));
      const draft: TransferDraft = { header, lines: lines.map(line => {
        const snapshot = snapshots.get(line.skuId);
        requireDomain(snapshot, "NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE", "Complete current native snapshot required");
        return { ...line, snapshot: { ...snapshot } };
      }) };
      await dependencies.references.assertValid(tx, actor, "SAVE", undefined, draft);
      const prepared: TransferDraft = tx.reserveRuntimeDocumentNumber ? { ...draft, header: { ...draft.header,
        number: await tx.reserveRuntimeDocumentNumber({ kind: "TRANSFER", documentId: id, actorAccountId: actor.accountId }) } } : draft;
      requireDomain(transferPreparedDraftFitsSaveBudget(prepared), "TRANSFER_PAYLOAD_TOO_LARGE",
        "Prepared transfer exceeds the bounded SAVE payload budget");
      return structuredClone(prepared);
    });
  } });
}

function transferExistingData(input: unknown, keys: readonly string[]): Record<string, unknown> {
  requireDomain(input !== null && typeof input === "object" && Object.getPrototypeOf(input) === Object.prototype
    && Reflect.ownKeys(input).length === keys.length, "INVALID_HTTP_INPUT", "Exact existing transfer proposal required");
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(input, key); requireDomain(d && "value" in d && d.enumerable, "INVALID_HTTP_INPUT", "Own proposal data properties required"); result[key] = d.value;
  }
  return result;
}
/** Closed existing-document read proposal, independent of the original CREATE parser. */
export function parseNativeTransferExistingProposal(input: unknown): NativeTransferExistingProposal {
  const row = transferExistingData(input, ["transferId", "expectedVersion", "businessDate", "note", "fromWarehouseId", "toWarehouseId", "lines"]);
  const text = (v: unknown): string => { requireDomain(typeof v === "string", "INVALID_HTTP_INPUT", "Explicit transfer text required"); return v; };
  requireDomain(typeof row.expectedVersion === "number" && Number.isInteger(row.expectedVersion) && row.expectedVersion >= 1 && row.expectedVersion <= 2147483647,
    "INVALID_VERSION", "Actual native integer version required");
  const note = row.note === null ? null : text(row.note);
  requireDomain(note === null || note.length <= TRANSFER_PREPARE_MAX_NOTE_LENGTH, "INVALID_HTTP_INPUT", "Bounded transfer note required");
  const values = row.lines;
  requireDomain(Array.isArray(values) && Object.getPrototypeOf(values) === Array.prototype && values.length >= 1 && values.length <= TRANSFER_PREPARE_MAX_LINES
    && Reflect.ownKeys(values).length === values.length + 1, "INVALID_HTTP_INPUT", "Bounded dense current transfer lines required");
  const lines = Array.from({ length: values.length }, (_, index) => {
    const d = Object.getOwnPropertyDescriptor(values, String(index)); requireDomain(d && "value" in d && d.enumerable, "INVALID_HTTP_INPUT", "Own line entries required");
    const line = transferExistingData(d.value, ["existingLineId", "skuId", "quantity"]), count = text(line.quantity);
    requireDomain(quantity(count) > 0n, "INVALID_TRANSFER_LINE", "Transfer quantities must be positive exact integers");
    return { existingLineId: line.existingLineId === null ? null : entityId("transferLine", text(line.existingLineId)), skuId: entityId("sku", text(line.skuId)), quantity: count };
  });
  const proposal: NativeTransferExistingProposal = { transferId: entityId("transfer", text(row.transferId)), expectedVersion: row.expectedVersion,
    businessDate: businessDate(text(row.businessDate)), note, fromWarehouseId: entityId("warehouse", text(row.fromWarehouseId)), toWarehouseId: entityId("warehouse", text(row.toWarehouseId)), lines };
  requireDomain(transferJsonByteLength(proposal) <= TRANSFER_PREPARE_MAX_REQUEST_BYTES, "TRANSFER_PAYLOAD_TOO_LARGE", "Existing transfer preparation exceeds request budget");
  return proposal;
}
function existingTransferReadScope(original: TransferTransaction) {
  let active = true, attemptedWrite = false;
  const check = () => requireDomain(active, "TRANSACTION_CLOSED", "Existing transfer preparation context closed");
  const denied = (): never => { attemptedWrite = true; throw Error("Existing transfer preparation is read-only"); };
  const tx: TransferTransaction = Object.freeze({
    getTransfer: (id: Parameters<TransferTransaction["getTransfer"]>[0]) => { check(); return original.getTransfer(id); },
    getReceipt: (...args: Parameters<TransferTransaction["getReceipt"]>) => { check(); return original.getReceipt(...args); },
    getWarehouseFact: (id: Parameters<TransferTransaction["getWarehouseFact"]>[0]) => { check(); return original.getWarehouseFact(id); },
    getSkuFact: (id: Parameters<TransferTransaction["getSkuFact"]>[0]) => { check(); return original.getSkuFact(id); },
    getCurrentTransferSnapshots: (ids: Parameters<NonNullable<TransferTransaction["getCurrentTransferSnapshots"]>>[0]) => {
      check(); requireDomain(original.getCurrentTransferSnapshots, "NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE", "Actual native MAIN snapshot capability required"); return original.getCurrentTransferSnapshots(ids);
    },
    putRuntimeTransfer: denied, insertReceipt: denied, putBalance: denied, appendLedger: denied, appendAudit: denied,
    reserveRuntimeDocumentNumber: denied, assertRuntimeDocumentNumber: denied, lockBalances: denied, getBalance: denied, listTransferLedger: denied
  });
  return { tx, finish() { check(); requireDomain(!attemptedWrite, "NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE", "Preparation policy attempted a forbidden write"); }, close() { active = false; } };
}
/** Same original transaction and transfer policy, zero business DML/number effects.
 * Existing locks are permitted; this does not claim a PostgreSQL READ ONLY transaction. */
export function createNativeTransferExistingPreparation(dependencies: TransferDependencies) {
  const nativeReferences = createNativeManualTransferReferences();
  return Object.freeze({ async prepareExisting(actorInput: TransferActor, input: NativeTransferExistingProposal): Promise<NativeTransferExistingPrepared> {
    const actor = structuredClone(actorInput), proposal = parseNativeTransferExistingProposal(input), transferId = entityId("transfer", proposal.transferId);
    return dependencies.unitOfWork.transaction(async original => {
      const scope = existingTransferReadScope(original), tx = scope.tx, used = new Set<string>([transferId]);
      const nextId: TransferDependencies["newId"] = kind => {
        const id = entityId(kind, dependencies.newId(kind)); requireDomain(!used.has(id), "INVALID_ID", "Generated ids must differ from all retained transfer identities"); used.add(id); return id;
      };
      try {
        requireDomain(!await tx.getReceipt(actor.accountId, `prepare-existing-transfer:${nextId("operation")}`), "IDEMPOTENCY_CONFLICT", "Private preparation nonce already exists");
        const stored = await tx.getTransfer(transferId); requireDomain(stored, "DOCUMENT_NOT_FOUND", "Existing transfer unavailable");
        const previous = stored.document;
        await dependencies.authorization.assertAllowed(actor, "SAVE", previous, undefined, tx);
        requireDomain(stored.stockBasis === "RUNTIME_LEDGER", "HISTORICAL_POSTING_NOT_IMPLEMENTED", "Cutoff history cannot become runtime transfer editing");
        requireDomain(previous.header.status === "DRAFT", "INVALID_STATE", "Only an actual draft transfer may be prepared");
        requireDomain(previous.header.version === proposal.expectedVersion, "VERSION_CONFLICT", "Existing transfer version changed");
        for (const row of previous.lines) used.add(row.id);
        const oldLines = new Map(previous.lines.map(row => [row.id as string, row])), pointers = new Set<string>(), fresh = new Set<string>();
        const header: TransferDraft["header"] = { id: transferId, number: previous.header.number, businessDate: businessDate(proposal.businessDate),
          fromWarehouseId: entityId("warehouse", proposal.fromWarehouseId), toWarehouseId: entityId("warehouse", proposal.toWarehouseId), note: proposal.note };
        const lines: TransferDraft["lines"] = proposal.lines.map((row, index) => {
          const old = row.existingLineId === null ? undefined : oldLines.get(row.existingLineId);
          requireDomain(row.existingLineId === null || old?.transferId === transferId && old.isCurrent && !pointers.has(row.existingLineId), "INVALID_HTTP_INPUT", "Line pointer must be unique, current and owned by the actual transfer");
          if (row.existingLineId !== null) pointers.add(row.existingLineId);
          const retained = old?.skuId === row.skuId, id = retained ? old.id : nextId("transferLine"); if (!retained) fresh.add(id);
          return { id, transferId, lineNo: index + 1, skuId: entityId("sku", row.skuId), quantity: quantity(row.quantity), isCurrent: true,
            snapshot: retained ? { ...old.snapshot } : { productCode: "", productName: "", colorName: "", fitName: "", sizeName: "", barcode: null } };
        });
        const skeleton: TransferDraft = { header, lines };
        // Pass the actual previous header so the trusted creation-hall branch is
        // retained for edits; it must never be treated as a newly-created draft.
        await dependencies.authorization.assertAllowed(actor, "SAVE", skeleton, previous, tx);
        const freshLines = lines.filter(row => fresh.has(row.id));
        const snapshots = freshLines.length ? await tx.getCurrentTransferSnapshots!(freshLines.map(row => row.skuId)) : new Map();
        const draft: TransferDraft = { header, lines: lines.map(row => {
          if (!fresh.has(row.id)) return row; const snapshot = snapshots.get(row.skuId);
          requireDomain(snapshot, "NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE", "New or replaced transfer line requires actual current native MAIN"); return { ...row, snapshot: { ...snapshot } };
        }) };
        await nativeReferences.assertValid(tx, actor, "SAVE", previous, draft);
        await dependencies.references.assertValid(tx, actor, "SAVE", previous, draft);
        requireDomain(transferPreparedDraftFitsSaveBudget(draft), "TRANSFER_PAYLOAD_TOO_LARGE", "Prepared existing transfer exceeds SAVE budget"); scope.finish();
        return structuredClone({ expectedVersion: previous.header.version, draft });
      } finally { scope.close(); }
    });
  } });
}
