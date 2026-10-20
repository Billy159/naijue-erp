import { applyInventoryEntry, assertPostingCoverage } from "./inventory-posting.ts";
import { requireDomain } from "../../domain/src/errors.ts";
import { planTransferEffects } from "../../domain/src/inventory.ts";
import type { InventoryLedgerRow } from "../../domain/src/inventory.ts";
import { negateQuantity, nextVersion, version } from "../../domain/src/values.ts";
import type { EntityId } from "../../domain/src/values.ts";
import { requestHash } from "./request-hash.ts";
import type { TransferAuditValues, TransferCommand, TransferDependencies, TransferDocument, TransferDraft, TransferResult } from "./transfer-ports.ts";

function auditValues(document: TransferDocument, changedLineIds: ReadonlySet<string>): TransferAuditValues {
  const { number, businessDate, fromWarehouseId, toWarehouseId, status, version, note } = document.header;
  return { header: { number, businessDate, fromWarehouseId, toWarehouseId, status, version, note },
    lines: document.lines.filter(line => changedLineIds.has(line.id)).map(({ transferId: _owner, ...line }) => line) };
}
function validateDraft(draft: TransferDraft): void {
  requireDomain(draft.header.number.length > 0, "INVALID_NUMBER", "Document number cannot be empty");
  requireDomain(draft.lines.length > 0 && draft.lines.every(line => line.isCurrent), "INVALID_LINES", "Transfer saves contain actual current lines only");
  // The approved UI input range is not the signed bigint storage boundary. Zero is not an actual saved line.
  planTransferEffects({ ...draft.header, status: "DRAFT", version: version(1) }, draft.lines);
}
function activeOriginals(document: TransferDocument, ledger: readonly InventoryLedgerRow[]): readonly InventoryLedgerRow[] {
  const reversed = new Set(ledger.flatMap(row => row.reversesEntryId === null ? [] : [row.reversesEntryId]));
  const active = ledger.filter(row => row.eventKind === "APPROVE" && !reversed.has(row.id));
  const expected = planTransferEffects({ ...document.header, status: "DRAFT" }, document.lines);
  const endpoints = new Set<string>();
  requireDomain(active.length === expected.length && expected.length > 0 && active.every(row => {
    if (row.source.kind !== "TRANSFER" || row.source.transferId !== document.header.id || row.sourceDocumentVersion !== document.header.version) return false;
    const identity = JSON.stringify([row.source.transferLineId, row.source.endpoint]);
    if (endpoints.has(identity)) return false;
    endpoints.add(identity);
    return expected.some(effect => effect.source.transferLineId === (row.source.kind === "TRANSFER" ? row.source.transferLineId : null)
      && effect.source.endpoint === row.source.endpoint && effect.warehouseId === row.warehouseId && effect.skuId === row.skuId
      && effect.quantityDelta === row.quantityDelta && row.businessDate === document.header.businessDate && row.reversesEntryId === null);
  }), "MISSING_POSTING_PROVENANCE", "Cannot reverse an incomplete or mismatched original two-ended runtime posting");
  return active;
}
export function createTransferService(dependencies: TransferDependencies): { execute(command: TransferCommand): Promise<TransferResult> } {
  const { unitOfWork, authorization, references, now, newId } = dependencies;
  if (typeof unitOfWork?.transaction !== "function" || typeof authorization?.assertAllowed !== "function" || typeof references?.assertValid !== "function"
    || typeof now !== "function" || typeof newId !== "function") throw new TypeError("Transfer requires explicit trusted policy, references and storage");
  return { async execute(input) {
    // Hash and execute the identical isolated snapshot before the first await.
    const command = structuredClone(input);
    requireDomain(command.requestKey.length > 0, "INVALID_REQUEST_KEY", "An original operation key is required");
    // Authorization context may legitimately change between retries. Original content
    // is bound to the authenticated account, not its transient role/hall.
    const fingerprint = requestHash({ ...command, actor: { accountId: command.actor.accountId } });
    return unitOfWork.transaction(async tx => {
      const receipt = await tx.getReceipt(command.actor.accountId, command.requestKey);
      if (receipt) {
        requireDomain(receipt.requestHash === fingerprint, "IDEMPOTENCY_CONFLICT", "The original key has different content");
        const current = await tx.getTransfer(receipt.targetTransferId);
        requireDomain(current, "DOCUMENT_NOT_FOUND", "Committed target is unavailable");
        await authorization.assertAllowed(command.actor, command.action, current.document, undefined, tx);
        return receipt.result;
      }
      const transferId = command.action === "SAVE" ? command.draft.header.id : command.transferId;
      const stored = await tx.getTransfer(transferId);
      requireDomain(!stored || stored.stockBasis === "RUNTIME_LEDGER", "HISTORICAL_POSTING_NOT_IMPLEMENTED", "Historical baseline contribution reversal is not enabled by runtime transfer commands");
      const previous = stored?.document;
      requireDomain(previous || command.action === "SAVE", "DOCUMENT_NOT_FOUND", "Transfer does not exist");
      requireDomain(command.expectedVersion === (previous?.header.version ?? null), "VERSION_CONFLICT", "Expected version does not match");
      const target = previous ?? (command.action === "SAVE" ? command.draft : undefined);
      requireDomain(target, "DOCUMENT_NOT_FOUND", "Transfer does not exist");
      await authorization.assertAllowed(command.actor, command.action, target, undefined, tx);
      if (previous && command.action === "SAVE") await authorization.assertAllowed(command.actor, "SAVE", command.draft, previous, tx);
      const proposed = command.action === "SAVE" ? command.draft : target;
      await references.assertValid(tx, command.actor, command.action, previous, proposed);
      const timestamp = now();
      requireDomain(!Number.isNaN(Date.parse(timestamp)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp), "INVALID_ACTION_TIME", "A real action time with timezone is required");
      const operationId = newId("operation");
      const ledgerEntryIds: EntityId<"ledger">[] = [];
      let next: TransferDocument;
      if (command.action === "SAVE") {
        requireDomain(!previous || previous.header.status === "DRAFT", "INVALID_STATE", "Only draft transfers may be edited");
        validateDraft(command.draft);
        const currentIds = new Set(command.draft.lines.map(line => line.id));
        next = { header: { ...command.draft.header, status: "DRAFT", version: previous ? nextVersion(previous.header.version) : version(1),
          createdByAccountId: previous?.header.createdByAccountId ?? command.actor.accountId,
          createdHallId: previous ? previous.header.createdHallId : command.actor.hallId,
          createdRole: previous?.header.createdRole ?? command.actor.role, createdAt: previous?.header.createdAt ?? timestamp,
          updatedAt: timestamp, approvedByAccountId: null, approvedAt: null },
          lines: [...(previous?.lines ?? []).filter(line => !currentIds.has(line.id)).map(line => ({ ...line, isCurrent: false })), ...command.draft.lines] };
      } else {
        requireDomain(previous, "DOCUMENT_NOT_FOUND", "Transfer does not exist");
        const nextDocumentVersion = nextVersion(previous.header.version);
        let effects: readonly InventoryLedgerRow[] = [];
        if (command.action === "APPROVE") {
          requireDomain(previous.header.status === "DRAFT", "INVALID_STATE", "Only a draft may be approved");
          validateDraft({ header: previous.header, lines: previous.lines.filter(line => line.isCurrent) });
          effects = planTransferEffects(previous.header, previous.lines).map(effect => ({ ...effect, id: newId("ledger"), operationId,
            eventKind: "APPROVE" as const, sourceDocumentVersion: nextDocumentVersion, reversesEntryId: null,
            businessDate: previous.header.businessDate, postedAt: timestamp }));
        } else if (command.action === "UNAPPROVE") {
          requireDomain(previous.header.status === "APPROVED", "INVALID_STATE", "Only an approved transfer may be unapproved");
          effects = activeOriginals(previous, await tx.listTransferLedger(transferId)).map(original => ({ ...original, id: newId("ledger"), operationId,
            eventKind: "UNAPPROVE" as const, quantityDelta: negateQuantity(original.quantityDelta), sourceDocumentVersion: nextDocumentVersion,
            reversesEntryId: original.id, postedAt: timestamp }));
        } else requireDomain(previous.header.status === "DRAFT", "INVALID_STATE", "Only a saved draft may be voided");
        if (effects.length > 0) {
          await tx.lockBalances(effects);
          await assertPostingCoverage(tx, effects);
          for (const effect of effects) { await applyInventoryEntry(tx, effect); ledgerEntryIds.push(effect.id); }
        }
        next = { ...previous, header: { ...previous.header, status: command.action === "APPROVE" ? "APPROVED" : command.action === "VOID" ? "VOID" : "DRAFT",
          version: nextDocumentVersion, updatedAt: timestamp, approvedByAccountId: command.action === "APPROVE" ? command.actor.accountId : null,
          approvedAt: command.action === "APPROVE" ? timestamp : null } };
      }
      await tx.putRuntimeTransfer(next);
      // Only actual row changes belong in audit evidence. Retained inactive rows remain
      // native provenance, not another full-document snapshot on every draft/action.
      const oldLines = new Map(previous?.lines.map(line => [line.id, line]) ?? []);
      const changedLineIds = new Set(next.lines.filter(line => {
        const old = oldLines.get(line.id);
        return old === undefined || requestHash(old) !== requestHash(line);
      }).map(line => line.id));
      await tx.appendAudit({ id: newId("audit"), operationId, actorAccountId: command.actor.accountId, transferId, action: command.action,
        occurredAt: timestamp, before: previous ? auditValues(previous, changedLineIds) : null, after: auditValues(next, changedLineIds) });
      const result: TransferResult = { operationId, transferId, version: next.header.version, status: next.header.status, ledgerEntryIds };
      await tx.insertReceipt({ id: operationId, actorAccountId: command.actor.accountId, requestKey: command.requestKey, requestHash: fingerprint,
        action: command.action, targetTransferId: transferId, status: "COMMITTED", result, completedAt: timestamp });
      return result;
    });
  } };
}