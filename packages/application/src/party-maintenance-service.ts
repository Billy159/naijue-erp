import { requireDomain } from "../../domain/src/errors.ts";
import { entityId, nextVersion, version } from "../../domain/src/values.ts";
import type { CustomerRecord, PartyActor, PartyAuditValues, PartyCommand, PartyDependencies, PartyKind, PartyPage, PartyRecord, PartyResult, PartyTransaction, SupplierRecord } from "./party-maintenance-ports.ts";
import { assertAllocatedPartyCode, checkedPartyActor, parsePartyCommand, parsePartySearch, partyKind, partyRequestKey } from "./party-maintenance-validation.ts";
import { requestHash } from "./request-hash.ts";

function load(tx: PartyTransaction, kind: PartyKind, id: string): Promise<PartyRecord | undefined> {
  return kind === "CUSTOMER" ? tx.getCustomer(entityId("customer", id)) : tx.getSupplier(entityId("supplier", id));
}
function auditValues(row: PartyRecord, previous?: PartyRecord): PartyAuditValues {
  return { version: row.version, ...(!previous || row.code !== previous.code ? { code: row.code } : {}),
    ...(!previous || row.name !== previous.name ? { name: row.name } : {}), ...(!previous || row.enabled !== previous.enabled ? { enabled: row.enabled } : {}) };
}
export function createPartyMaintenanceService(dependencies: PartyDependencies) {
  const { unitOfWork, authorization, codes, now, newId } = dependencies ?? {};
  if (typeof unitOfWork?.transaction !== "function" || typeof authorization?.assertAllowed !== "function"
    || typeof codes?.allocateCustomerCode !== "function" || typeof codes?.allocateSupplierCode !== "function" || typeof now !== "function" || typeof newId !== "function") {
    throw new TypeError("Party maintenance requires explicit current authorization, trusted split-code allocators, storage, clock and identifiers");
  }
  async function execute(input: PartyCommand): Promise<PartyResult> {
    const isolated = structuredClone(input); const actor = checkedPartyActor(isolated.actor); const kind = partyKind(isolated.kind);
    const { actor: _actor, kind: _kind, ...body } = isolated;
    const command = parsePartyCommand(body, actor, kind);
    const fingerprint = requestHash({ ...command, actor: { accountId: actor.accountId } });
    return unitOfWork.transaction(async tx => {
      // Authorize before any receipt/record disclosure and again for an exact replay below.
      await authorization.assertAllowed(actor, kind, command.action, tx);
      const receipt = await tx.getReceipt(actor.accountId, command.requestKey, kind);
      if (receipt) {
        requireDomain(receipt.requestHash === fingerprint, "IDEMPOTENCY_CONFLICT", "Original operation key has different content");
        requireDomain(await load(tx, kind, receipt.targetId), "PARTY_NOT_FOUND", "Committed party is unavailable");
        await authorization.assertAllowed(actor, kind, command.action, tx);
        return structuredClone(receipt.result);
      }
      let previous: PartyRecord | undefined; let next: PartyRecord;
      const timestamp = now();
      requireDomain(typeof timestamp === "string" && !Number.isNaN(Date.parse(timestamp)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp), "INVALID_ACTION_TIME", "Real system time with timezone is required");
      if (command.action === "CREATE") {
        const id = newId(kind === "CUSTOMER" ? "customer" : "supplier");
        requireDomain(!(await load(tx, kind, id)), "VERSION_CONFLICT", "New party identity already exists");
        const code = kind === "CUSTOMER" ? await codes.allocateCustomerCode(tx) : await codes.allocateSupplierCode(tx); assertAllocatedPartyCode(code);
        const values = { code, name: command.name, enabled: true, version: version(1), createdAt: timestamp, updatedAt: timestamp };
        next = kind === "CUSTOMER" ? { id: entityId("customer", id), ...values } : { id: entityId("supplier", id), ...values };
      } else {
        previous = await load(tx, kind, command.id);
        requireDomain(previous, "PARTY_NOT_FOUND", "Party is unavailable");
        requireDomain(previous.version === command.expectedVersion, "VERSION_CONFLICT", "Expected version does not match");
        requireDomain(previous.version < 2147483647, "VERSION_STORAGE_OVERFLOW", "Version storage exhausted");
        if (command.action === "EDIT") requireDomain(command.name !== previous.name, "NO_PARTY_CHANGE", "No name change supplied");
        if (command.action === "DISABLE") {
          requireDomain(previous.enabled, "INVALID_PARTY_STATE", "Party is already disabled");
          if (kind === "CUSTOMER") requireDomain(!(await tx.customerIsEnabledHallDefault(entityId("customer", previous.id))), "CUSTOMER_DEFAULT_IN_USE", "An enabled hall still uses this default customer");
        }
        if (command.action === "RESTORE") requireDomain(!previous.enabled, "INVALID_PARTY_STATE", "Party is already enabled");
        next = { ...previous, name: command.action === "EDIT" ? command.name : previous.name,
          enabled: command.action === "DISABLE" ? false : command.action === "RESTORE" ? true : previous.enabled,
          version: nextVersion(previous.version), updatedAt: timestamp };
      }
      if (kind === "CUSTOMER") await tx.putCustomer(next as CustomerRecord); else await tx.putSupplier(next as SupplierRecord);
      const operationId = newId("operation");
      await tx.appendAudit({ id: newId("audit"), operationId, actorAccountId: actor.accountId, kind, targetId: next.id, action: command.action,
        before: previous ? auditValues(previous, next) : null, after: auditValues(next, previous), occurredAt: timestamp });
      const result: PartyResult = { operationId, kind, partyId: next.id, version: next.version, code: next.code, enabled: next.enabled };
      await tx.insertReceipt({ id: operationId, actorAccountId: actor.accountId, requestKey: command.requestKey, requestHash: fingerprint,
        kind, action: command.action, targetId: next.id, result, completedAt: timestamp });
      return result;
    });
  }
  async function search(actorInput: PartyActor, kindInput: PartyKind, input: unknown, candidates = false) {
    const actor = checkedPartyActor(actorInput); const kind = partyKind(kindInput); const query = parsePartySearch(input, candidates);
    return unitOfWork.transaction(async tx => {
      await authorization.assertAllowed(actor, kind, candidates ? "CANDIDATES" : "LIST", tx);
      const result: PartyPage<PartyRecord> = kind === "CUSTOMER" ? await tx.searchCustomers(query) : await tx.searchSuppliers(query);
      return candidates ? { ...result, items: result.items.map(({ id, code, name }) => ({ id, code, name })) } : result;
    });
  }
  return Object.freeze({ execute, search,
    async detail(actorInput: PartyActor, kindInput: PartyKind, id: string) {
      const actor = checkedPartyActor(actorInput); const kind = partyKind(kindInput); entityId(kind === "CUSTOMER" ? "customer" : "supplier", id);
      return unitOfWork.transaction(async tx => { await authorization.assertAllowed(actor, kind, "DETAIL", tx); const row = await load(tx, kind, id); requireDomain(row, "PARTY_NOT_FOUND", "Party is unavailable"); return row; });
    },
    async receipt(actorInput: PartyActor, kindInput: PartyKind, requestKeyInput: string) {
      const actor = checkedPartyActor(actorInput); const kind = partyKind(kindInput); const requestKey = partyRequestKey(requestKeyInput);
      return unitOfWork.transaction(async tx => {
        await authorization.assertAllowed(actor, kind, "RECEIPT", tx); const row = await tx.getReceipt(actor.accountId, requestKey, kind);
        requireDomain(row, "RECEIPT_NOT_FOUND", "Receipt is unavailable");
        requireDomain(await load(tx, kind, row.targetId), "PARTY_NOT_FOUND", "Committed party is unavailable");
        await authorization.assertAllowed(actor, kind, row.action, tx);
        return { requestKey: row.requestKey, action: row.action, status: "COMMITTED" as const, completedAt: row.completedAt, result: row.result };
      });
    }
  });
}
