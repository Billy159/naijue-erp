/** EXPLICIT SYNTHETIC ONLY: no production fallback, database, credentials or real records. */
import type { CustomerRecord, PartyAudit, PartyDependencies, PartyKind, PartyPage, PartyReceipt, PartyRecord, PartySearch, PartyTransaction, SupplierRecord } from "../../packages/application/src/party-maintenance-ports.ts";
import { createSourcePartyAuthorization } from "../../packages/application/src/party-maintenance-policy.ts";
import { requireDomain } from "../../packages/domain/src/errors.ts";
import { entityId } from "../../packages/domain/src/values.ts";
import type { EntityKind } from "../../packages/domain/src/values.ts";

export function partyId<K extends EntityKind>(kind: K, suffix: number) { return entityId(kind, `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`); }
export const partyActor = { accountId: partyId("account", 1), hallId: null, role: "ADMIN" as const };
export function partyFixture() {
  let customers = new Map<string, CustomerRecord>(); let suppliers = new Map<string, SupplierRecord>();
  let receipts = new Map<string, PartyReceipt>(); let audits: PartyAudit[] = []; let sequence = 100;
  let customerSequence = 0; let supplierSequence = 0; let failAt: "AUDIT" | "RECEIPT" | null = null;
  const defaults = new Set<string>(); let tail: Promise<void> = Promise.resolve();
  const dependencies: PartyDependencies = {
    authorization: createSourcePartyAuthorization(), now: () => "2026-10-20T16:00:00.000Z", newId: kind => partyId(kind, ++sequence),
    // Test-only labels deliberately are NOT approved production allocation policy.
    codes: { async allocateCustomerCode() { return `SYNTHETIC-C-${++customerSequence}`; }, async allocateSupplierCode() { return `SYNTHETIC-S-${++supplierSequence}`; } },
    unitOfWork: { async transaction(work) {
      let unlock!: () => void; const lock = new Promise<void>(resolve => { unlock = resolve; }); const previous = tail; tail = lock; await previous;
      const c = structuredClone(customers); const s = structuredClone(suppliers); const r = structuredClone(receipts); const a = structuredClone(audits);
      let active = true;
      const check = () => { requireDomain(active, "TRANSACTION_CLOSED", "Synthetic transaction closed"); };
      function put<T extends PartyRecord>(map: Map<string, T>, row: T) { check(); requireDomain(![...map.values()].some(old => old.id !== row.id && old.code === row.code), "PARTY_CODE_CONFLICT", "Synthetic duplicate code"); map.set(row.id, structuredClone(row)); }
      function search<T extends PartyRecord>(map: Map<string, T>, query: PartySearch): PartyPage<T> { check(); const rows = [...map.values()].filter(row => (row.name.includes(query.search) || row.code.includes(query.search)) && (query.enabled === "ALL" || row.enabled === (query.enabled === "ENABLED"))).sort((x, y) => x.name.localeCompare(y.name) || x.id.localeCompare(y.id)); return { items: structuredClone(rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize)), total: rows.length, page: query.page, pageSize: query.pageSize }; }
      const tx: PartyTransaction = {
        async getReceipt(actor, key, kind) { check(); const found = r.get(JSON.stringify([actor, key])); requireDomain(!found || found.kind === kind, "IDEMPOTENCY_CONFLICT", "Synthetic global key collision"); return structuredClone(found); },
        async getCustomer(id) { check(); return structuredClone(c.get(id)); }, async getSupplier(id) { check(); return structuredClone(s.get(id)); },
        async reserveCustomerCode() { check(); return `KH${String(++customerSequence).padStart(6, "0")}`; },
        async reserveSupplierCode() { check(); return `GYS${String(++supplierSequence).padStart(6, "0")}`; },
        async putCustomer(row) { put(c, row); }, async putSupplier(row) { put(s, row); },
        async customerIsEnabledHallDefault(id) { check(); return defaults.has(id); },
        async searchCustomers(query) { return search(c, query); }, async searchSuppliers(query) { return search(s, query); },
        async appendAudit(row) { check(); if (failAt === "AUDIT") throw new Error("SYNTHETIC AUDIT FAILURE"); a.push(structuredClone(row)); },
        async insertReceipt(row) { check(); if (failAt === "RECEIPT") throw new Error("SYNTHETIC RECEIPT FAILURE"); const key = JSON.stringify([row.actorAccountId, row.requestKey]); requireDomain(!r.has(key), "IDEMPOTENCY_CONFLICT", "Synthetic global key unique"); r.set(key, structuredClone(row)); }
      };
      try { const result = await work(tx); customers = c; suppliers = s; receipts = r; audits = a; return result; }
      finally { active = false; unlock(); }
    } }
  };
  return { dependencies, defaults, customers: () => structuredClone([...customers.values()]), suppliers: () => structuredClone([...suppliers.values()]), audits: () => structuredClone(audits), receipts: () => structuredClone([...receipts.values()]),
    fail: (at: typeof failAt) => { failAt = at; }, seedCustomer: (row: CustomerRecord) => { customers.set(row.id, row); }, seedSupplier: (row: SupplierRecord) => { suppliers.set(row.id, row); },
    seedOtherKindReceipt: (kind: PartyKind) => { const operationId = partyId("operation", 90); receipts.set(JSON.stringify([partyActor.accountId, "global"]), { id: operationId, actorAccountId: partyActor.accountId, requestKey: "global", requestHash: "0".repeat(64), kind, action: "CREATE", targetId: partyId("customer", 90), completedAt: "2026-10-20T16:00:00Z", result: { operationId, kind, partyId: partyId("customer", 90), version: 1 as PartyRecord["version"], code: "SYNTHETIC", enabled: true } }); }
  };
}
