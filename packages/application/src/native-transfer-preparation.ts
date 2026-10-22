import { TRANSFER_PREPARE_MAX_LINES, TRANSFER_PREPARE_MAX_NOTE_LENGTH, TRANSFER_PREPARE_MAX_REQUEST_BYTES, transferJsonByteLength, transferPreparedDraftFitsSaveBudget } from "./transfer-payload-budget.ts";
import type { SkuSnapshot } from "../../domain/src/documents.ts";
import { requireDomain } from "../../domain/src/errors.ts";
import { businessDate, entityId, quantity } from "../../domain/src/values.ts";
import type { TransferActor, TransferDependencies, TransferDraft, TransferReferences } from "./transfer-ports.ts";
import { createSourceConfirmedTransferReferences } from "./transfer-policy.ts";
import { sourceConfirmedCreateDocumentNumber } from "./source-confirmed-document-number.ts";

/** Manual current SKU selection only. No caller-supplied labels, barcode or number. */
export interface NativeTransferCreateProposal {
  readonly businessDate: string; readonly note: string | null;
  readonly fromWarehouseId: string; readonly toWarehouseId: string;
  readonly lines: readonly { readonly skuId: string; readonly quantity: string }[];
}
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

/** No writes or receipt are produced. The returned complete draft can be sent to
 * the existing SAVE command with expectedVersion:null and a stable request key.
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
    return dependencies.unitOfWork.transaction(async tx => {
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
