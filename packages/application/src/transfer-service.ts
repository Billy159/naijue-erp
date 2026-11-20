import { parseNativeTransferSaveProposal, prepareNativeTransferOnTransaction } from './native-transfer-preparation.ts';
import { sourceConfirmedCreateDocumentNumber } from './source-confirmed-document-number.ts';
import { businessDate, entityId } from '../../domain/src/values.ts';
import { applyInventoryEntry, assertPostingCoverage } from "./inventory-posting.ts";
import { requireDomain } from "../../domain/src/errors.ts";
import { planDocumentInventoryTransition } from "../../domain/src/document-inventory-effects.ts";
import type { DocumentInventoryPriorEvidence } from "../../domain/src/document-inventory-effects.ts";
import { planTransferEffects } from "../../domain/src/inventory.ts";
import type { InventoryLedgerRow } from "../../domain/src/inventory.ts";
import { nextVersion, version } from "../../domain/src/values.ts";
import type { EntityId } from "../../domain/src/values.ts";
import { requestHash } from "./request-hash.ts";
import type { TransferAuditValues, LegacyTransferCommand, StoredTransfer, TransferCommand, TransferDependencies, TransferDocument, TransferDraft, TransferResult } from "./transfer-ports.ts";

function auditValues(document: TransferDocument, changedLineIds: ReadonlySet<string>): TransferAuditValues {
  const { number, businessDate, fromWarehouseId, toWarehouseId, status, version, note, responsibleStaffId, createdByStaffId, approvedByStaffId } = document.header;
  return { header: { number, businessDate, fromWarehouseId, toWarehouseId, status, version, note, responsibleStaffId,
      ...(createdByStaffId === undefined ? {} : { createdByStaffId }), ...(approvedByStaffId === undefined ? {} : { approvedByStaffId }) },
    lines: document.lines.filter(line => changedLineIds.has(line.id)).map(({ transferId: _owner, ...line }) => line) };
}
function validateDraft(draft: TransferDraft, previous?: TransferDocument): void {
  requireDomain(draft.header.number.length > 0, "INVALID_NUMBER", "Document number cannot be empty");
  requireDomain(draft.lines.length > 0 && draft.lines.every(line => line.isCurrent), "INVALID_LINES", "Transfer saves contain actual current lines only");
  const snapshotFields = ["productCode", "productName", "colorName", "fitName", "sizeName", "barcode"] as const;
  const priorLines = new Map(previous?.lines.filter(line => line.isCurrent).map(line => [line.id, line]) ?? []);
  for (const line of draft.lines) {
    const retained = priorLines.get(line.id);
    requireDomain(snapshotFields.filter(field => field !== "barcode").every(field => typeof line.snapshot[field] === "string")
      || (retained !== undefined && retained.skuId === line.skuId && snapshotFields.every(field => retained.snapshot[field] === line.snapshot[field])),
    "UNKNOWN_SNAPSHOT_FACTS", "Unknown original labels may be preserved exactly, never invented on new or replaced transfer lines");
  }
  // The approved UI input range is not the signed bigint storage boundary. Zero is not an actual saved line.
  planTransferEffects({ ...draft.header, status: "DRAFT", version: version(1) }, draft.lines);
}
export function createTransferService(dependencies: TransferDependencies): { execute(command: TransferCommand): Promise<TransferResult> } {
  const { unitOfWork, authorization, references, now, newId } = dependencies;
  if (typeof unitOfWork?.transaction !== "function" || typeof authorization?.assertAllowed !== "function" || typeof references?.assertValid !== "function"
    || typeof now !== "function" || typeof newId !== "function") throw new TypeError("Transfer requires explicit trusted policy, references and storage");
  return { async execute(input) {
    // Hash and execute the identical isolated snapshot before the first await.
    const submitted = structuredClone(input);
    if(submitted.action==='SAVE'&&'proposal' in submitted){const proposal=parseNativeTransferSaveProposal(submitted.proposal);requireDomain((proposal.transferId===null)===(submitted.expectedVersion===null),'INVALID_VERSION','Target and expected version must agree');}
    requireDomain(submitted.requestKey.length > 0, "INVALID_REQUEST_KEY", "An original operation key is required");
    // Authorization context may legitimately change between retries. Original content
    // is bound to the authenticated account, not its transient role/hall.
    const fingerprint = requestHash({ ...submitted, actor: { accountId: submitted.actor.accountId } });
    return unitOfWork.transaction(async tx => {
      const receipt = await tx.getReceipt(submitted.actor.accountId, submitted.requestKey);
      if (receipt) {
        requireDomain(receipt.requestHash === fingerprint, "IDEMPOTENCY_CONFLICT", "The original key has different content");
        const current = await tx.getTransfer(receipt.targetTransferId);
        requireDomain(current, "DOCUMENT_NOT_FOUND", "Committed target is unavailable");
        await authorization.assertAllowed(submitted.actor, submitted.action, current.document, undefined, tx);
        return receipt.result;
      }
      let command:LegacyTransferCommand,proposalHandled=false,resolvedStored:StoredTransfer|undefined,preparedAt:string|undefined,preparedOperationId:EntityId<'operation'>|undefined;
      if(submitted.action==='SAVE'&&'proposal' in submitted){
        const proposal=parseNativeTransferSaveProposal(submitted.proposal),id=proposal.transferId===null?newId('transfer'):entityId('transfer',proposal.transferId);
        resolvedStored=await tx.getTransfer(id);proposalHandled=true;
        const previous=resolvedStored?.document;
        requireDomain(submitted.expectedVersion===(previous?.header.version??null),'VERSION_CONFLICT','Expected document version differs');
        requireDomain(!previous||previous.header.status==='DRAFT','INVALID_STATE','Only an actual draft may be edited');
        const proposed:TransferDraft={header:{id,number:previous?.header.number??sourceConfirmedCreateDocumentNumber('TRANSFER',id),businessDate:businessDate(proposal.businessDate),
          fromWarehouseId:entityId('warehouse',proposal.fromWarehouseId),toWarehouseId:entityId('warehouse',proposal.toWarehouseId),note:proposal.note},lines:[]};
        await authorization.assertAllowed(submitted.actor,'SAVE',previous??proposed,undefined,tx);
        if(previous)await authorization.assertAllowed(submitted.actor,'SAVE',proposed,previous,tx);
        preparedAt=now();requireDomain(Number.isFinite(Date.parse(preparedAt))&&/(?:Z|[+-]\d{2}:\d{2})$/.test(preparedAt),'INVALID_ACTION_TIME','Actual trusted time required');
        preparedOperationId=newId('operation');
        const selections=proposal.lines.map(l=>'spec' in l?{spec:l.spec!}:{skuId:l.skuId!});
        requireDomain(tx.resolveDocumentSkus,'NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE','Original document specification resolver required');
        const ids=await tx.resolveDocumentSkus({scope:{kind:'TRANSFER',documentId:id,operationId:preparedOperationId,actor:submitted.actor,completedAt:preparedAt},selections,newId:kind=>newId(kind)});
        const draft=await prepareNativeTransferOnTransaction(dependencies,tx,submitted.actor,proposal,id,resolvedStored,ids);
        command={actor:submitted.actor,action:'SAVE',requestKey:submitted.requestKey,expectedVersion:submitted.expectedVersion,draft:{...draft,header:{...draft.header,...(proposal.responsibleStaffId===undefined?{}:{responsibleStaffId:proposal.responsibleStaffId===null?null:entityId('staff',proposal.responsibleStaffId)})}}};
      }else command=submitted;
      const transferId = command.action === "SAVE" ? command.draft.header.id : command.transferId;
      const stored = proposalHandled ? resolvedStored : await tx.getTransfer(transferId);
      const previous = stored?.document;
      requireDomain(previous || command.action === "SAVE", "DOCUMENT_NOT_FOUND", "Transfer does not exist");
      requireDomain(command.expectedVersion === (previous?.header.version ?? null), "VERSION_CONFLICT", "Expected version does not match");
      const target = previous ?? (command.action === "SAVE" ? command.draft : undefined);
      requireDomain(target, "DOCUMENT_NOT_FOUND", "Transfer does not exist");
      await authorization.assertAllowed(command.actor, command.action, target, undefined, tx);
      if (previous && command.action === "SAVE") await authorization.assertAllowed(command.actor, "SAVE", command.draft, previous, tx);
      const proposed = command.action === "SAVE" ? command.draft : target;
      await references.assertValid(tx, command.actor, command.action, previous, proposed);
      const timestamp = preparedAt ?? now();
      requireDomain(!Number.isNaN(Date.parse(timestamp)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp), "INVALID_ACTION_TIME", "A real action time with timezone is required");
      const operationId = preparedOperationId ?? newId("operation");
      const actionStaffId = (command.action === "APPROVE" || (command.action === "SAVE" && previous === undefined))
        ? (await tx.getCurrentTransferIdentity?.(command.actor.accountId))?.staffId ?? null : null;
      const ledgerEntryIds: EntityId<"ledger">[] = [];
      let next: TransferDocument;
      if (command.action === "SAVE") {
        requireDomain(!previous || previous.header.status === "DRAFT", "INVALID_STATE", "Only draft transfers may be edited");
        validateDraft(command.draft, previous);
        if (previous) requireDomain(command.draft.header.number === previous.header.number,
          "DOCUMENT_NUMBER_MISMATCH", "A saved document keeps its original number");
        else if (tx.assertRuntimeDocumentNumber) await tx.assertRuntimeDocumentNumber({ kind: "TRANSFER", documentId: transferId,
          actorAccountId: command.actor.accountId, number: command.draft.header.number });
        const currentIds = new Set(command.draft.lines.map(line => line.id));
        next = { header: { ...command.draft.header, responsibleStaffId: Object.hasOwn(command.draft.header, "responsibleStaffId")
            ? command.draft.header.responsibleStaffId === null ? null : entityId("staff", command.draft.header.responsibleStaffId as string) : previous?.header.responsibleStaffId ?? null, status: "DRAFT", version: previous ? nextVersion(previous.header.version) : version(1),
          createdByAccountId: previous ? previous.header.createdByAccountId : command.actor.accountId,
          createdByStaffId: previous ? previous.header.createdByStaffId ?? null : actionStaffId, approvedByStaffId: null,
          createdHallId: previous ? previous.header.createdHallId : command.actor.hallId,
          createdRole: previous ? previous.header.createdRole : command.actor.role, createdAt: previous ? previous.header.createdAt : timestamp,
          updatedAt: timestamp, approvedByAccountId: null, approvedAt: null },
          lines: [...(previous?.lines ?? []).filter(line => !currentIds.has(line.id)).map(line => ({ ...line, isCurrent: false })), ...command.draft.lines] };
      } else {
        requireDomain(previous, "DOCUMENT_NOT_FOUND", "Transfer does not exist");
        const nextDocumentVersion = nextVersion(previous.header.version);
        if (command.action === "APPROVE") {
          requireDomain(previous.header.status === "DRAFT", "INVALID_STATE", "Only a draft may be approved");
          validateDraft({ header: previous.header, lines: previous.lines.filter(line => line.isCurrent) }, previous);
        } else if (command.action === "UNAPPROVE") {
          requireDomain(previous.header.status === "APPROVED", "INVALID_STATE", "Only an approved transfer may be unapproved");
        } else requireDomain(previous.header.status === "DRAFT", "INVALID_STATE", "Only a saved draft may be voided");
        next = { ...previous, header: { ...previous.header, status: command.action === "APPROVE" ? "APPROVED" : command.action === "VOID" ? "VOID" : "DRAFT",
          version: nextDocumentVersion, updatedAt: timestamp, approvedByAccountId: command.action === "APPROVE" ? command.actor.accountId : null,
          approvedByStaffId: command.action === "APPROVE" ? actionStaffId : null,
          approvedAt: command.action === "APPROVE" ? timestamp : null } };
      }
      let priorEvidence: DocumentInventoryPriorEvidence | undefined;
      if (previous && (command.action === "APPROVE" || command.action === "UNAPPROVE")) {
        const entries = await tx.listTransferLedger(transferId);
        if (entries.length > 0 || command.action === "APPROVE") priorEvidence = { kind: "RUNTIME_LEDGER", entries };
        else {
          const anchor = await tx.getDocumentInventoryAnchor?.("TRANSFER", transferId);
          requireDomain(anchor, "MISSING_POSTING_PROVENANCE", "Unapproval needs a complete original runtime posting or real baseline migration anchor");
          priorEvidence = { kind: "BASELINE_ANCHOR", anchor, entries };
        }
      }
      const posting = planDocumentInventoryTransition({ action: command.action, operationId, before: previous ? { kind: "TRANSFER", ...previous } : null,
        after: { kind: "TRANSFER", ...next }, ...(priorEvidence === undefined ? {} : { priorEvidence }) });
      const effects: readonly InventoryLedgerRow[] = posting.ledgerIntents.map(({ intentKey: _intentKey, ...intent }) => ({ ...intent, id: newId("ledger"), postedAt: timestamp }));
      if (effects.length > 0) {
        await tx.lockBalances(posting.touchedKeys);
        await assertPostingCoverage(tx, effects);
        for (const effect of effects) { await applyInventoryEntry(tx, effect); ledgerEntryIds.push(effect.id); }
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
