import { SharedSyntheticInventory } from './synthetic-store.ts';
import type { SharedSyntheticInventoryTables } from './synthetic-store.ts';
/** SYNTHETIC ONLY: no SQL engine, locks, real accounts, dictionaries, or storage durability evidence. */
import { requireDomain } from "../../packages/domain/src/errors.ts";
import { businessDate, quantity, version } from "../../packages/domain/src/values.ts";
import type { EntityId } from "../../packages/domain/src/values.ts";
import type { InventoryBalanceRow, InventoryLedgerRow } from "../../packages/domain/src/inventory.ts";
import type { StoredTransfer, TransferActor, TransferAuditRow, TransferDependencies, TransferDocument, TransferDraft, TransferReceiptRow, TransferSkuFact, TransferTransaction, TransferUnitOfWork, TransferWarehouseFact } from "../../packages/application/src/transfer-ports.ts";
import { createTransferService } from "../../packages/application/src/transfer-service.ts";
import { createSourceConfirmedTransferAuthorization, createSourceConfirmedTransferReferences } from "../../packages/application/src/transfer-policy.ts";
import type { TransferCurrentIdentity } from "../../packages/application/src/transfer-ports.ts";
import { sid, snapshot } from "./synthetic-fixtures.ts";
export { sid };
export const ids = { transfer: sid("transfer", 200), fromWarehouse: sid("warehouse", 201), toWarehouse: sid("warehouse", 202),
  hall: sid("hall", 203), otherHall: sid("hall", 204), account: sid("account", 205), sku: sid("sku", 206), sku2: sid("sku", 207),
  line: sid("transferLine", 208), line2: sid("transferLine", 209) };
export const actor: TransferActor = { accountId: ids.account, hallId: ids.hall, role: "SALESPERSON" };
export const balanceKey = (warehouse: string, sku: string): string => JSON.stringify([warehouse, sku]);
const receiptKey = (account: string, key: string): string => JSON.stringify([account, key]);
export function draft(quantities: readonly string[] = ["2"]): TransferDraft {
  return { header: { id: ids.transfer, number: "SYNTHETIC-TRANSFER-200", businessDate: businessDate("2026-10-20"), fromWarehouseId: ids.fromWarehouse,
    toWarehouseId: ids.toWarehouse, note: "SYNTHETIC ONLY" }, lines: quantities.map((count, index) => ({ id: sid("transferLine", 208 + index), transferId: ids.transfer,
      lineNo: index + 1, skuId: ids.sku, quantity: quantity(count), snapshot, isCurrent: true })) };
}
interface Tables {
  identities: Map<EntityId<"account">, TransferCurrentIdentity>;
  transfers: Map<EntityId<"transfer">, StoredTransfer>;
  balances: Map<string, InventoryBalanceRow>; ledger: InventoryLedgerRow[]; audit: TransferAuditRow[];
  receipts: Map<string, TransferReceiptRow>; warehouses: Map<EntityId<"warehouse">, TransferWarehouseFact>; skus: Map<EntityId<"sku">, TransferSkuFact>;
}
export class SyntheticTransferStore implements TransferUnitOfWork {
  private tables: Tables = { identities: new Map(), transfers: new Map(), balances: new Map(), ledger: [], audit: [], receipts: new Map(), warehouses: new Map(), skus: new Map() };
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly sharedInventory?: SharedSyntheticInventory) {}
  failNextAt: string | undefined;
  snapshot(): Tables { return structuredClone({ ...this.tables, ...(this.sharedInventory?.snapshot() ?? {}) }); }
  seedIdentity(row: TransferCurrentIdentity): void { this.tables.identities.set(row.accountId, structuredClone(row)); }
  seedBalance(row: InventoryBalanceRow): void { if (this.sharedInventory) this.sharedInventory.seed(row); else this.tables.balances.set(balanceKey(row.warehouseId,row.skuId), structuredClone(row)); }
  removeBalance(warehouse: EntityId<"warehouse">, sku: EntityId<"sku">): void { if (this.sharedInventory) this.sharedInventory.remove(warehouse,sku); else this.tables.balances.delete(balanceKey(warehouse,sku)); }
  seedWarehouse(row: TransferWarehouseFact): void { this.tables.warehouses.set(row.id, structuredClone(row)); }
  seedSku(row: TransferSkuFact): void { this.tables.skus.set(row.id, structuredClone(row)); }
  seedDocument(document: TransferDocument, stockBasis: StoredTransfer["stockBasis"] = "RUNTIME_LEDGER"): void { this.tables.transfers.set(document.header.id, structuredClone({ document, stockBasis })); }
  replaceLedger(rows: readonly InventoryLedgerRow[]): void { if (this.sharedInventory) this.sharedInventory.replaceLedger(rows); else this.tables.ledger = structuredClone([...rows]); }
  transaction<T>(work: (tx: TransferTransaction) => Promise<T>): Promise<T> {
    const run = async (inventory?: SharedSyntheticInventoryTables): Promise<T> => {
      const tables = structuredClone(this.tables);
      if (inventory) { tables.balances = inventory.balances; tables.ledger = inventory.ledger; } let active = true; let loaded: EntityId<"transfer"> | undefined; let locked: Set<string> | undefined;
      let receiptActor: EntityId<"account"> | undefined;
      const counts = new Map<string,number>();
      const point = (name: string): void => { requireDomain(active,"TRANSACTION_CLOSED","Closed synthetic transaction"); const n=(counts.get(name)??0)+1; counts.set(name,n);
        if (this.failNextAt===name || this.failNextAt===`${name}:${n}`) { this.failNextAt=undefined; throw new Error(`SYNTHETIC injected failure: ${name}:${n}`); } };
      const tx: TransferTransaction = {
        async getCurrentTransferIdentity(accountId) { point("identity"); requireDomain(receiptActor===accountId && loaded!==undefined,"TRANSACTION_SCOPE","Bind receipt actor and target first"); return structuredClone(tables.identities.get(accountId)); },
        async getTransfer(id) { point("read"); requireDomain(loaded===undefined,"TRANSACTION_SCOPE","Load once"); loaded=id; return structuredClone(tables.transfers.get(id)); },
        async putRuntimeTransfer(document) { point("document"); requireDomain(loaded===document.header.id,"TRANSACTION_SCOPE","Wrong target");
          const previous=tables.transfers.get(loaded); requireDomain(!previous || previous.stockBasis==="RUNTIME_LEDGER","HISTORICAL_POSTING_NOT_IMPLEMENTED","Not runtime");
          requireDomain(document.header.version===(previous ? previous.document.header.version+1:1),"VERSION_CONFLICT","CAS failed");
          for(const l of document.lines) for(const old of tables.transfers.values()) requireDomain(!old.document.lines.some(other=>other.id===l.id && other.transferId!==l.transferId),"FOREIGN_LINE_ID","Wrong line owner");
          tables.transfers.set(loaded,structuredClone({ document,stockBasis:"RUNTIME_LEDGER" })); },
        async getReceipt(account,key) { point("receiptRead"); receiptActor=account; return structuredClone(tables.receipts.get(receiptKey(account,key))); },
        async insertReceipt(row) { point("receipt"); const identity=receiptKey(row.actorAccountId,row.requestKey); requireDomain(!tables.receipts.has(identity),"RECEIPT_UNIQUE","Duplicate original key"); tables.receipts.set(identity,structuredClone(row)); },
        async getWarehouseFact(id) { point("warehouse"); return structuredClone(tables.warehouses.get(id)); },
        async getSkuFact(id) { point("sku"); return structuredClone(tables.skus.get(id)); },
        async lockBalances(keys) { point("lock"); requireDomain(locked===undefined,"TRANSACTION_SCOPE","Lock once"); locked=new Set(keys.map(k=>balanceKey(k.warehouseId,k.skuId))); },
        async getBalance(warehouse,sku) { point("balanceRead"); requireDomain(locked?.has(balanceKey(warehouse,sku)),"TRANSACTION_SCOPE","Not locked"); return structuredClone(tables.balances.get(balanceKey(warehouse,sku))); },
        async putBalance(row) { point("balance"); const key=balanceKey(row.warehouseId,row.skuId); const prev=tables.balances.get(key);
          requireDomain(locked?.has(key)&&prev,"INVENTORY_NOT_READY","Missing coverage"); requireDomain(row.version===prev.version+1,"VERSION_CONFLICT","Balance CAS"); tables.balances.set(key,structuredClone(row)); },
        async listTransferLedger(id) { point("ledgerRead"); return structuredClone(tables.ledger.filter(l=>l.source.kind==="TRANSFER"&&l.source.transferId===id)); },
        async appendLedger(row) { point("ledger"); requireDomain(!tables.ledger.some(old=>old.id===row.id || (old.operationId===row.operationId&&JSON.stringify(old.source)===JSON.stringify(row.source))),"LEDGER_UNIQUE","Duplicate effect");
          requireDomain(row.reversesEntryId===null || !tables.ledger.some(old=>old.reversesEntryId===row.reversesEntryId),"REVERSAL_UNIQUE","Duplicate reversal"); tables.ledger.push(structuredClone(row)); },
        async appendAudit(row) { point("audit"); tables.audit.push(structuredClone(row)); }
      };
      try { const value=await work(tx); const result=structuredClone(value); active=false; this.tables=tables; return result; } catch(error) { active=false; throw error; }
    };
    if (this.sharedInventory) return this.sharedInventory.transaction(run);
    const result=this.tail.then(()=>run()); this.tail=result.catch(()=>undefined); return result;
  }
}
export function fixture(options: { readonly authorization?: TransferDependencies["authorization"]; readonly references?: TransferDependencies["references"] } = {}) {
  const store = new SyntheticTransferStore();
  store.seedIdentity({accountId:ids.account,staffId:sid("staff",241),loginEnabled:true,role:"SALESPERSON",employmentStatus:"在职",hallId:ids.hall,hallEnabled:true});
  for(const warehouseId of [ids.fromWarehouse,ids.toWarehouse]) {
    store.seedWarehouse({ id:warehouseId,hallId:ids.hall,enabled:true,hallEnabled:true,hasNonzeroInventory:false });
    for(const skuId of [ids.sku,ids.sku2]) store.seedBalance({ warehouseId,skuId,quantity:quantity("0"),version:version(1),lastOperationId:null,updatedAt:"2026-10-20T00:00:00Z" });
  }
  for(const id of [ids.sku,ids.sku2]) store.seedSku({ id,enabled:true });
  let allowed=true; let sequence=2000; const source=options.authorization??createSourceConfirmedTransferAuthorization();
  const dependencies: TransferDependencies={ unitOfWork:store,references:options.references??createSourceConfirmedTransferReferences(),
    authorization:{ async assertAllowed(...args) { requireDomain(allowed,"FORBIDDEN","Synthetic permission revoked"); await source.assertAllowed(...args); } },
    now:()=>"2026-10-20T12:00:00Z",newId:kind=>sid(kind,sequence++) };
  return { store,dependencies,service:createTransferService(dependencies),revokeAccess:()=>{allowed=false;},
    document:()=>{const doc=store.snapshot().transfers.get(ids.transfer)?.document; if(!doc) throw new Error("No synthetic transfer"); return doc;},
    balance:(warehouse=ids.fromWarehouse,sku=ids.sku)=>store.snapshot().balances.get(balanceKey(warehouse,sku))?.quantity };
}
