import type { SalesDocument, SalesHeaderRow, SalesLineRow, SalesSettlementRow } from "../../packages/domain/src/documents.ts";
import type { InventoryBalanceRow, InventoryLedgerRow } from "../../packages/domain/src/inventory.ts";
import { requireDomain } from "../../packages/domain/src/errors.ts";
import type { EntityId } from "../../packages/domain/src/values.ts";
import type { OperationReceiptRow, SalesAuditRow, SalesCurrentIdentity, SalesTransaction, SalesUnitOfWork, StoredSales } from "../../packages/application/src/ports.ts";

interface SyntheticTables {
  identities: Map<EntityId<"account">, SalesCurrentIdentity>;
  headers: Map<EntityId<"sales">, SalesHeaderRow>;
  lines: Map<EntityId<"salesLine">, SalesLineRow>;
  settlements: Map<EntityId<"settlement">, SalesSettlementRow>;
  balances: Map<string, InventoryBalanceRow>;
  ledger: InventoryLedgerRow[];
  audit: SalesAuditRow[];
  receipts: Map<string, OperationReceiptRow>;
  stockBasis: Map<EntityId<"sales">, StoredSales["stockBasis"]>;
}
export const balanceKey = (warehouseId: string, skuId: string): string => JSON.stringify([warehouseId, skuId]);
const receiptKey = (actorId: string, key: string): string => JSON.stringify([actorId, key]);
/** One TEST ONLY copy-on-write inventory owner shared by the original two service stores. */
export interface SharedSyntheticInventoryTables { balances: Map<string, InventoryBalanceRow>; ledger: InventoryLedgerRow[] }
export class SharedSyntheticInventory {
  private state: SharedSyntheticInventoryTables = { balances: new Map(), ledger: [] };
  private tail: Promise<unknown> = Promise.resolve();
  snapshot(): SharedSyntheticInventoryTables { return structuredClone(this.state); }
  seed(row: InventoryBalanceRow): void { const k = balanceKey(row.warehouseId, row.skuId), old = this.state.balances.get(k);
    requireDomain(old === undefined || (old.quantity === row.quantity && old.version === row.version && old.lastOperationId === row.lastOperationId), "INVENTORY_NOT_READY", "Conflicting shared synthetic seed");
    if (!old) this.state.balances.set(k, structuredClone(row)); }
  remove(warehouse: string, sku: string): void { this.state.balances.delete(balanceKey(warehouse, sku)); }
  replaceLedger(rows: readonly InventoryLedgerRow[]): void { this.state.ledger = structuredClone([...rows]); }
  transaction<T>(work: (state: SharedSyntheticInventoryTables) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => { const next = structuredClone(this.state); const value = await work(next); this.state = next; return value; };
    const result = this.tail.then(()=>run()); this.tail = result.catch(() => undefined); return result;
  }
}
/** Synthetic-only serialized copy-on-write reference adapter. NOT a database or evidence of SQL isolation. */
export class SyntheticStore implements SalesUnitOfWork {
  private tables: SyntheticTables = { identities: new Map(), headers: new Map(), lines: new Map(), settlements: new Map(), balances: new Map(), ledger: [], audit: [], receipts: new Map(), stockBasis: new Map() };
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly sharedInventory?: SharedSyntheticInventory) {}
  failNextAt: string | undefined;
  snapshot(): SyntheticTables { return structuredClone({ ...this.tables, ...(this.sharedInventory?.snapshot() ?? {}) }); }
  seedIdentity(identity: SalesCurrentIdentity): void { this.tables.identities.set(identity.accountId, structuredClone(identity)); }
  seedBalance(row: InventoryBalanceRow): void { if (this.sharedInventory) this.sharedInventory.seed(row); else this.tables.balances.set(balanceKey(row.warehouseId, row.skuId), structuredClone(row)); }
  seedCutoffHistory(document: SalesDocument): void {
    this.tables.headers.set(document.header.id, structuredClone(document.header));
    for (const row of document.lines) this.tables.lines.set(row.id, structuredClone(row));
    for (const row of document.settlements) this.tables.settlements.set(row.id, structuredClone(row));
    this.tables.stockBasis.set(document.header.id, "CUTOFF_HISTORY");
  }
  transaction<T>(work: (tx: SalesTransaction) => Promise<T>): Promise<T> {
    const run = async (inventory?: SharedSyntheticInventoryTables): Promise<T> => {
      const draft = structuredClone(this.tables);
      if (inventory) { draft.balances = inventory.balances; draft.ledger = inventory.ledger; }
      const counts = new Map<string, number>();
      const point = (name: string): void => {
        const count = (counts.get(name) ?? 0) + 1; counts.set(name, count);
        if (this.failNextAt === name || this.failNextAt === `${name}:${count}`) {
          this.failNextAt = undefined; throw new Error(`SYNTHETIC injected failure: ${name}:${count}`);
        }
      };
      let active = true; let receiptActor: EntityId<"account"> | undefined; let target: EntityId<"sales"> | undefined;
      const check = (): void => { requireDomain(active, "TRANSACTION_CLOSED", "Synthetic transaction is closed"); };
      const tx: SalesTransaction = {
        async getCurrentSalesIdentity(accountId) {
          check(); requireDomain(receiptActor === accountId && target !== undefined, "TRANSACTION_SCOPE", "Bind synthetic receipt actor and target first");
          return structuredClone(draft.identities.get(accountId));
        },
        async getSales(id) {
          check(); target = id;
          const header = draft.headers.get(id); if (!header) return undefined;
          return structuredClone({ document: { header, lines: [...draft.lines.values()].filter(row => row.salesId === id), settlements: [...draft.settlements.values()].filter(row => row.salesId === id) }, stockBasis: draft.stockBasis.get(id) ?? "RUNTIME_LEDGER" });
        },
        async putRuntimeSales(document) {
          point("document");
          draft.headers.set(document.header.id, structuredClone(document.header));
          for (const line of document.lines) {
            requireDomain(!draft.lines.has(line.id) || draft.lines.get(line.id)?.salesId === document.header.id, "FOREIGN_LINE_ID", "A business line cannot move between documents");
            draft.lines.set(line.id, structuredClone(line));
          }
          for (const [id, row] of draft.settlements) if (row.salesId === document.header.id) draft.settlements.delete(id);
          for (const row of document.settlements) {
            requireDomain(!draft.settlements.has(row.id), "FOREIGN_SETTLEMENT_ID", "Settlement identities cannot belong to multiple documents");
            draft.settlements.set(row.id, structuredClone(row));
          }
          draft.stockBasis.set(document.header.id, "RUNTIME_LEDGER");
        },
        async getReceipt(actorId, key) { check(); receiptActor = actorId; return structuredClone(draft.receipts.get(receiptKey(actorId, key))); },
        async insertReceipt(row) {
          point("receipt"); const key = receiptKey(row.actorAccountId, row.requestKey);
          requireDomain(!draft.receipts.has(key), "RECEIPT_UNIQUE", "Actor and original key must be unique");
          draft.receipts.set(key, structuredClone(row));
        },
        async getBalance(warehouseId, skuId) { return structuredClone(draft.balances.get(balanceKey(warehouseId, skuId))); },
        async putBalance(row) { point("balance"); draft.balances.set(balanceKey(row.warehouseId, row.skuId), structuredClone(row)); },
        async listSalesLedger(salesId) { return structuredClone(draft.ledger.filter(row => row.source.kind === "SALES" && row.source.salesId === salesId)); },
        async appendLedger(row) {
          point("ledger");
          requireDomain(!draft.ledger.some(existing => existing.id === row.id || (existing.operationId === row.operationId
            && JSON.stringify(existing.source) === JSON.stringify(row.source))), "LEDGER_UNIQUE", "A single operation cannot duplicate a source endpoint");
          requireDomain(row.reversesEntryId === null || !draft.ledger.some(existing => existing.reversesEntryId === row.reversesEntryId), "REVERSAL_UNIQUE", "An original effect can be reversed only once");
          draft.ledger.push(structuredClone(row));
        },
        async appendAudit(row) { point("audit"); draft.audit.push(structuredClone(row)); }
      };
      try {
        const result = await work(tx);
        const returned = structuredClone(result); this.tables = draft;
        return returned;
      } finally { active = false; }
    };
    if (this.sharedInventory) return this.sharedInventory.transaction(run);
    const result = this.tail.then(()=>run());
    this.tail = result.catch(() => undefined);
    return result;
  }
}
