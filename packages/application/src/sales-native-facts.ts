import type { SalesDocument, SalesDraft, SalesLineRow } from "../../domain/src/documents.ts";
import { requireDomain } from "../../domain/src/errors.ts";
import { negateQuantity } from "../../domain/src/values.ts";
import type { EntityId } from "../../domain/src/values.ts";
import type { SalesBusinessRules, SalesTransaction } from "./ports.ts";
import { createCandidateSalesBusinessRules } from "./sales-business-rules.ts";
import type { ProductSalesPricingFacts, SalesRuleFactResolver } from "./sales-business-rules.ts";

/** Bounded request-local facts, not a form proposal or a cross-request authorization cache. */
export const SALES_NATIVE_FACT_MAX_LINES = 2000;
export const SALES_NATIVE_FACT_QUERY_BATCH_SIZE = 200;
export interface NativeSalesReferenceFacts {
  readonly salesId: EntityId<"sales">;
  readonly hall: { readonly id: EntityId<"hall">; readonly enabled: boolean };
  readonly warehouse: { readonly id: EntityId<"warehouse">; readonly hallId: EntityId<"hall">; readonly enabled: boolean };
  readonly customer: { readonly id: EntityId<"customer">; readonly enabled: boolean };
  readonly salesperson: { readonly id: EntityId<"staff">; readonly employmentStatus: string } | null;
  readonly paymentAccounts: readonly { readonly id: EntityId<"paymentAccount">; readonly enabled: boolean;
    readonly methodId: EntityId<"paymentMethod">; readonly methodEnabled: boolean }[];
  readonly skus: readonly { readonly id: EntityId<"sku">; readonly productId: EntityId<"product">; readonly enabled: boolean;
    readonly snapshot: Omit<SalesLineRow["snapshot"], "barcode"> }[];
  readonly products: readonly ProductSalesPricingFacts[];
  readonly barcodes: readonly { readonly raw: string; readonly skuId: EntityId<"sku">; readonly enabled: boolean }[];
  /** Loaded native snapshots only. A caller cannot grant retained status by resending labels. */
  readonly retainedLines: readonly Pick<SalesLineRow, "id" | "skuId" | "snapshot">[];
}
const fields = ["productCode", "productName", "colorName", "fitName", "sizeName", "barcode"] as const;
function resolver(document: SalesDraft | SalesDocument, facts: NativeSalesReferenceFacts): SalesRuleFactResolver {
  const skus = new Map(facts.skus.map(row => [row.id, row])); const products = new Map(facts.products.map(row => [row.id, row]));
  const accounts = new Map(facts.paymentAccounts.map(row => [row.id, row])); const retained = new Map(facts.retainedLines.map(row => [row.id, row]));
  requireDomain(skus.size === facts.skus.length && products.size === facts.products.length && accounts.size === facts.paymentAccounts.length
    && retained.size === facts.retainedLines.length, "INVALID_NATIVE_SALES_FACTS", "Repeated native fact identities are not accepted");
  return {
    sku: id => skus.get(id), productPricing: id => products.get(id),
    assertDocumentReferences(proposed) {
      const h = proposed.header;
      requireDomain(h.id === document.header.id && h.id === facts.salesId && h.hallId === facts.hall.id && facts.hall.enabled === true
        && h.warehouseId === facts.warehouse.id && facts.warehouse.enabled === true && facts.warehouse.hallId === h.hallId
        && h.customerId === facts.customer.id && facts.customer.enabled === true,
      "SALES_REFERENCE_UNAVAILABLE", "Native sales hall, same-hall warehouse and customer must remain enabled");
      requireDomain(h.salespersonId === null ? facts.salesperson === null
        : facts.salesperson?.id === h.salespersonId && facts.salesperson.employmentStatus === "在职",
      "SALES_REFERENCE_UNAVAILABLE", "Optional native staff must remain in employment; no invented role or staff-hall restriction");
      for (const settlement of proposed.settlements) {
        const account = accounts.get(settlement.paymentAccountId);
        requireDomain(account?.enabled === true && account.methodEnabled === true,
          "SALES_REFERENCE_UNAVAILABLE", "Settlement account and its actual method must remain enabled");
        requireDomain(settlement.paymentMethodId !== null && settlement.paymentMethodId === account.methodId,
          "SETTLEMENT_METHOD_MISMATCH", "Selected payment-method identity must match the locked account actual method");
      }
      for (const line of proposed.lines.filter(row => row.isCurrent)) {
        const current = skus.get(line.skuId); requireDomain(current?.enabled === true, "SKU_UNAVAILABLE", "Current formal SKU facts are unavailable");
        const old = retained.get(line.id);
        if (old?.skuId === line.skuId && fields.every(key => old.snapshot[key] === line.snapshot[key])) continue;
        requireDomain(fields.filter(key => key !== "barcode").every(key => line.snapshot[key] === current.snapshot[key as keyof typeof current.snapshot]),
          "SALES_SNAPSHOT_MISMATCH", "New or replaced snapshot labels must match the selected native SKU");
        requireDomain(line.snapshot.barcode === null || facts.barcodes.some(binding => binding.raw === line.snapshot.barcode && binding.skuId === line.skuId && binding.enabled),
          "BARCODE_UNAVAILABLE", "An observed raw barcode must have its current enabled canonical SKU binding");
      }
    }
  };
}
async function facts(tx: SalesTransaction | undefined, document: SalesDraft | SalesDocument): Promise<NativeSalesReferenceFacts> {
  requireDomain(tx && typeof tx.getCurrentSalesReferenceFacts === "function", "NATIVE_CATALOGUE_FACTS_UNAVAILABLE",
    "Native sales rules require complete trusted facts from the original command transaction");
  return tx.getCurrentSalesReferenceFacts(document);
}
/** Explicit opt-in economics/reference provider. Command action/reference scope
 * authorization remains separate and mandatory. No host, readiness or facts default. */
export function createNativeTransactionSalesBusinessRules(): SalesBusinessRules {
  return Object.freeze<SalesBusinessRules>({
    async assertDraftChange(previous, draft, tx) {
      const current = await facts(tx, draft); await createCandidateSalesBusinessRules(resolver(draft, current)).assertDraftChange(previous, draft);
    },
    async assertReferencesAndEconomics(document, tx) {
      const current = await facts(tx, document); await createCandidateSalesBusinessRules(resolver(document, current)).assertReferencesAndEconomics(document);
    },
    inventoryDelta(document, line) {
      requireDomain(line.quantity !== 0n && (document.header.businessType !== "SALE" || line.quantity > 0n), "INVALID_SALES_QUANTITY", "Stock effect follows validated signed business quantity");
      return negateQuantity(line.quantity);
    }
  });
}
