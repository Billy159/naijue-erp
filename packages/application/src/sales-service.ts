import { parseNativeSalesSaveProposal, prepareNativeSalesOnTransaction } from './native-sales-preparation.ts';
import { sourceConfirmedCreateDocumentNumber } from './source-confirmed-document-number.ts';
import { businessDate } from '../../domain/src/values.ts';
import { applyInventoryEntry, assertPostingCoverage } from "./inventory-posting.ts";
import type { SalesDocument, SalesDraft, SalesLineRow } from "../../domain/src/documents.ts";
import { requireDomain } from "../../domain/src/errors.ts";
import type { InventoryLedgerRow } from "../../domain/src/inventory.ts";
import { addMoney, entityId, minorAmount, negateMoney, negateQuantity, nextVersion, version } from "../../domain/src/values.ts";
import type { EntityId } from "../../domain/src/values.ts";
import type { SalesCommand, LegacySalesCommand, StoredSales, SalesDependencies, SalesResult } from "./ports.ts";
import { requestHash } from "./request-hash.ts";
import { salesChangeEvidence } from "./sales-change-evidence.ts";

function validateDraft(draft: SalesDraft): void {
  requireDomain(draft.header.number.length > 0, "INVALID_NUMBER", "Document number cannot be empty");
  requireDomain(["SALE", "RETURN", "EXCHANGE"].includes(draft.header.businessType), "INVALID_BUSINESS_TYPE", "Unsupported sales business type");
  requireDomain(draft.header.orderDiscount >= 0n, "INVALID_DISCOUNT", "Order discount is nonnegative");
  requireDomain(draft.lines.length > 0 && draft.lines.every(line => line.isCurrent), "INVALID_LINES", "Draft commands contain the actual current lines only");
  const ids = new Set<string>(); const positions = new Set<number>();
  for (const line of draft.lines) {
    requireDomain(line.salesId === draft.header.id && Number.isSafeInteger(line.lineNo) && line.lineNo > 0
      && !ids.has(line.id) && !positions.has(line.lineNo), "INVALID_LINE", "Line identities and positions must be unique and owned by this document");
    requireDomain(line.dealPrice >= 0n && (line.referencePrice === null || line.referencePrice >= 0n)
      && line.allocatedDiscount >= 0n, "INVALID_PRICE", "Prices and allocated discounts must be nonnegative");
    requireDomain((line.pricingRule === "UNIT_PRICE" || line.pricingRule === "DISCOUNT") && typeof line.zeroConfirmed === "boolean"
      && (line.discountTenths === null || (Number.isInteger(line.discountTenths) && line.discountTenths >= 0 && line.discountTenths <= 100)),
    "UNKNOWN_PRICING_FACTS", "Active lines require explicit pricing rule, discount metadata and zero confirmation");
    ids.add(line.id); positions.add(line.lineNo);
  }
  requireDomain(draft.settlements.length <= 3, "SETTLEMENT_LIMIT", "At most three document settlement rows are supported by the observed Demo rule");
  ids.clear(); positions.clear();
  for (const row of draft.settlements) {
    requireDomain(row.salesId === draft.header.id && typeof row.paymentMethodId === "string" && row.amount >= 0n && ["RECEIVE", "REFUND"].includes(row.direction)
      && Number.isSafeInteger(row.lineNo) && row.lineNo > 0 && !ids.has(row.id) && !positions.has(row.lineNo),
    "INVALID_SETTLEMENT", "Expected owned, unique, nonnegative receive/refund rows");
    entityId("paymentMethod", row.paymentMethodId);
    ids.add(row.id); positions.add(row.lineNo);
  }
}
function validateSettlement(document: SalesDocument): void {
  const settled = document.settlements.reduce((sum, row) => addMoney(sum, row.direction === "RECEIVE" ? row.amount : negateMoney(row.amount)), minorAmount("0"));
  requireDomain(settled === document.header.netDue, "SETTLEMENT_MISMATCH", "Approval requires exact receive-minus-refund equality with net due; no credit or balance feature");
}
function mergeRetainedLines(previous: SalesDocument | undefined, incoming: readonly SalesLineRow[]): readonly SalesLineRow[] {
  const currentIds = new Set(incoming.map(line => line.id));
  return [...(previous?.lines ?? []).filter(line => !currentIds.has(line.id)).map(line => ({ ...line, isCurrent: false })), ...incoming];
}

export function createSalesService(dependencies: SalesDependencies): { execute(command: SalesCommand): Promise<SalesResult> } {
  const { unitOfWork, rules, authorization, now, newId } = dependencies;
  return {
    async execute(input) {
      // TypeScript readonly does not freeze caller-owned aliases. Hash and execute
      // the same isolated value snapshot before the first asynchronous boundary.
      const submitted = structuredClone(input);
      if(submitted.action==='SAVE'&&'proposal' in submitted){
        const proposal=parseNativeSalesSaveProposal(submitted.proposal);
        requireDomain((proposal.salesId===null)===(submitted.expectedVersion===null),'INVALID_VERSION','Target and expected version must agree');
      }
      requireDomain(submitted.requestKey.length > 0, "INVALID_REQUEST_KEY", "An original operation key is required");
      // The stable account and exact business command identify a retry. Trusted
      // authorization context can change, but is still rechecked before replay.
      const fingerprint = requestHash({ ...submitted, actor: { accountId: submitted.actor.accountId } });
      return unitOfWork.transaction(async tx => {
        const prior = await tx.getReceipt(submitted.actor.accountId, submitted.requestKey);
        if (prior) {
          requireDomain(prior.requestHash === fingerprint, "IDEMPOTENCY_CONFLICT", "The original key cannot be reused with different content");
          // Recheck access before disclosing a committed result to a now-revoked actor.
          const current = await tx.getSales(prior.targetSalesId);
          requireDomain(current, "DOCUMENT_NOT_FOUND", "Committed operation target is unavailable");
          await authorization.assertAllowed(submitted.actor, submitted.action, current.document, tx);
          return prior.result;
        }
        let command:LegacySalesCommand,proposalHandled=false,resolvedStored:StoredSales|undefined,preparedAt:string|undefined,preparedOperationId:EntityId<'operation'>|undefined;
        if(submitted.action==='SAVE'&&'proposal' in submitted){
          const proposal=parseNativeSalesSaveProposal(submitted.proposal),id=proposal.salesId===null?newId('sales'):entityId('sales',proposal.salesId);
          resolvedStored=await tx.getSales(id);proposalHandled=true;
          requireDomain(!resolvedStored||resolvedStored.stockBasis==='RUNTIME_LEDGER','HISTORICAL_POSTING_NOT_IMPLEMENTED','Historical editing is separate');
          const previous=resolvedStored?.document;
          requireDomain(submitted.expectedVersion===(previous?.header.version??null),'VERSION_CONFLICT','Expected document version differs');
          requireDomain(!previous||previous.header.status==='DRAFT','INVALID_STATE','Only an actual draft may be edited');
          const proposed:SalesDraft={header:{id,number:previous?.header.number??sourceConfirmedCreateDocumentNumber('SALE',id),businessType:proposal.businessType,
            businessDate:businessDate(proposal.businessDate),hallId:entityId('hall',proposal.hallId),customerId:entityId('customer',proposal.customerId),
            salespersonId:proposal.salespersonId===null?null:entityId('staff',proposal.salespersonId),warehouseId:entityId('warehouse',proposal.warehouseId),
            note:proposal.note,orderDiscount:minorAmount('0'),grossAmount:minorAmount('0'),netDue:minorAmount('0')},lines:[],settlements:[]};
          await authorization.assertAllowed(submitted.actor,'SAVE',previous??proposed,tx);
          if(previous)await authorization.assertAllowed(submitted.actor,'SAVE',proposed,tx);
          preparedAt=now();requireDomain(Number.isFinite(Date.parse(preparedAt))&&/(?:Z|[+-]\d{2}:\d{2})$/.test(preparedAt),'INVALID_ACTION_TIME','Actual trusted time required');
          preparedOperationId=newId('operation');
          const selections=proposal.lines.map(l=>'spec' in l?{spec:l.spec!}:{skuId:l.skuId!});
          requireDomain(tx.resolveDocumentSkus,'NATIVE_CATALOGUE_FACTS_UNAVAILABLE','Original document specification resolver required');
          const ids=await tx.resolveDocumentSkus({scope:{kind:'SALES',documentId:id,operationId:preparedOperationId,actor:submitted.actor,completedAt:preparedAt},selections,newId:kind=>newId(kind)});
          const draft=await prepareNativeSalesOnTransaction(dependencies,tx,submitted.actor,proposal,id,resolvedStored,ids);
          command={actor:submitted.actor,action:'SAVE',requestKey:submitted.requestKey,expectedVersion:submitted.expectedVersion,draft};
        }else command=submitted;
        const salesId = command.action === "SAVE" ? command.draft.header.id : command.salesId;
        const stored = proposalHandled ? resolvedStored : await tx.getSales(salesId);
        requireDomain(!stored || stored.stockBasis === "RUNTIME_LEDGER", "HISTORICAL_POSTING_NOT_IMPLEMENTED", "Cutoff history is queryable but baseline-aware historical editing is not enabled in this foundation");
        const previous = stored?.document;
        requireDomain(previous || command.action === "SAVE", "DOCUMENT_NOT_FOUND", "Document does not exist");
        requireDomain(command.expectedVersion === (previous?.header.version ?? null), "VERSION_CONFLICT", "Expected document version does not match");
        await authorization.assertAllowed(command.actor, command.action, previous ?? (command.action === "SAVE" ? command.draft : (() => { throw new Error("Document missing"); })()), tx);
        // Updating an accessible source does not authorize moving its proposed data
        // into a different hall/warehouse/customer/payment-account scope.
        if (previous && command.action === "SAVE") await authorization.assertAllowed(command.actor, "SAVE", command.draft, tx);
        const timestamp = preparedAt ?? now();
        requireDomain(!Number.isNaN(Date.parse(timestamp)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp), "INVALID_ACTION_TIME", "A real time with timezone is required");
        const operationId = preparedOperationId ?? newId("operation");
        let next: SalesDocument;
        const entryIds: EntityId<"ledger">[] = [];
        if (command.action === "SAVE") {
          requireDomain(!previous || previous.header.status === "DRAFT", "INVALID_STATE", "Only a draft can be edited; approved documents must first be unapproved");
          validateDraft(command.draft);
          await rules.assertDraftChange(previous, command.draft, tx);
          if (previous) requireDomain(command.draft.header.number === previous.header.number,
            "DOCUMENT_NUMBER_MISMATCH", "A saved document keeps its original number");
          else if (tx.assertRuntimeDocumentNumber) await tx.assertRuntimeDocumentNumber({ kind: "SALES", documentId: salesId,
            actorAccountId: command.actor.accountId, number: command.draft.header.number });
          next = {
            header: { ...command.draft.header, status: "DRAFT", version: previous ? nextVersion(previous.header.version) : version(1),
              createdByAccountId: previous?.header.createdByAccountId ?? command.actor.accountId,
              createdHallId: previous ? previous.header.createdHallId : command.actor.hallId,
              createdAt: previous?.header.createdAt ?? timestamp, updatedAt: timestamp, approvedByAccountId: null, approvedAt: null },
            lines: mergeRetainedLines(previous, command.draft.lines), settlements: command.draft.settlements
          };
        } else {
          requireDomain(previous, "DOCUMENT_NOT_FOUND", "Document does not exist");
          const nextDocumentVersion = nextVersion(previous.header.version);
          if (command.action === "APPROVE") {
            requireDomain(previous.header.status === "DRAFT", "INVALID_STATE", "Only a draft can be approved");
            validateDraft({ header: previous.header, lines: previous.lines.filter(line => line.isCurrent), settlements: previous.settlements });
            validateSettlement(previous);
            await rules.assertReferencesAndEconomics(previous, tx);
            const effects: InventoryLedgerRow[] = [];
            for (const line of previous.lines.filter(row => row.isCurrent)) {
              const delta = rules.inventoryDelta(previous, line);
              requireDomain(delta !== 0n, "INVALID_STOCK_EFFECT", "A current business line must have a confirmed nonzero stock effect");
              const entry: InventoryLedgerRow = { id: newId("ledger"), operationId, eventKind: "APPROVE", warehouseId: previous.header.warehouseId,
                skuId: line.skuId, quantityDelta: delta, source: { kind: "SALES", salesId, salesLineId: line.id, endpoint: "SALES_WAREHOUSE" },
                sourceDocumentVersion: nextDocumentVersion, reversesEntryId: null, businessDate: previous.header.businessDate, postedAt: timestamp };
              effects.push(entry);
            }
            await assertPostingCoverage(tx, effects);
            for (const entry of effects) { await applyInventoryEntry(tx, entry); entryIds.push(entry.id); }
            next = { ...previous, header: { ...previous.header, status: "APPROVED", version: nextDocumentVersion, updatedAt: timestamp, approvedByAccountId: command.actor.accountId, approvedAt: timestamp } };
          } else if (command.action === "UNAPPROVE") {
            requireDomain(previous.header.status === "APPROVED", "INVALID_STATE", "Only an approved document can be unapproved");
            const ledger = await tx.listSalesLedger(salesId);
            const reversedIds = new Set(ledger.flatMap(row => row.reversesEntryId === null ? [] : [row.reversesEntryId]));
            const active = ledger.filter(row => row.eventKind === "APPROVE" && !reversedIds.has(row.id));
            const currentLineIds = new Set(previous.lines.filter(line => line.isCurrent).map(line => line.id));
            const activeLineIds = new Set(active.flatMap(row => row.source.kind === "SALES" ? [row.source.salesLineId] : []));
            requireDomain(active.length > 0 && active.length === currentLineIds.size && activeLineIds.size === currentLineIds.size
              && [...activeLineIds].every(id => currentLineIds.has(id))
              && active.every(row => row.sourceDocumentVersion === previous.header.version),
            "MISSING_POSTING_PROVENANCE", "Cannot invent a reversal when the complete original runtime posting is missing");
            for (const original of active) {
              const entry: InventoryLedgerRow = { ...original, id: newId("ledger"), operationId, eventKind: "UNAPPROVE", quantityDelta: negateQuantity(original.quantityDelta),
                sourceDocumentVersion: nextDocumentVersion, reversesEntryId: original.id, postedAt: timestamp };
              await applyInventoryEntry(tx, entry); entryIds.push(entry.id);
            }
            next = { ...previous, header: { ...previous.header, status: "DRAFT", version: nextDocumentVersion, updatedAt: timestamp, approvedByAccountId: null, approvedAt: null } };
          } else {
            requireDomain(previous.header.status === "DRAFT", "INVALID_STATE", "Only a saved draft can be voided");
            next = { ...previous, header: { ...previous.header, status: "VOID", version: nextDocumentVersion, updatedAt: timestamp } };
          }
        }
        await tx.putRuntimeSales(next);
        await tx.appendAudit({ id: newId("audit"), operationId, actorAccountId: command.actor.accountId, salesId, action: command.action, occurredAt: timestamp,
          ...salesChangeEvidence(previous, next) });
        const result: SalesResult = { operationId, salesId, version: next.header.version, status: next.header.status, ledgerEntryIds: entryIds };
        await tx.insertReceipt({ id: operationId, actorAccountId: command.actor.accountId, requestKey: command.requestKey, requestHash: fingerprint,
          action: command.action, targetSalesId: salesId, status: "COMMITTED", result, completedAt: timestamp });
        return result;
      });
    }
  };
}
