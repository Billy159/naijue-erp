import { requireDomain } from "../../packages/domain/src/errors.ts";
import type { SalesBusinessType, SalesDocument, SalesDraft, SalesLineRow } from "../../packages/domain/src/documents.ts";
import type { SkuRow } from "../../packages/domain/src/catalog.ts";
import { businessDate, entityId, minorAmount, multiplyMoney, negateQuantity, quantity, version } from "../../packages/domain/src/values.ts";
import type { EntityKind, EntityId } from "../../packages/domain/src/values.ts";
import type { ActorContext, SalesBusinessRules, SalesAuthorization, SalesCurrentIdentity } from "../../packages/application/src/ports.ts";
import { createSalesService } from "../../packages/application/src/sales-service.ts";
import { balanceKey, SyntheticStore } from "./synthetic-store.ts";

/** All IDs/labels/quantities are deliberately synthetic, not imported or inferred real dictionaries. */
export const sid = <K extends EntityKind>(kind: K, number: number): EntityId<K> => entityId(kind, `00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`);
export const ids = { sales: sid("sales", 1), customer: sid("customer", 2), hall: sid("hall", 3), warehouse: sid("warehouse", 4),
  account: sid("account", 5), sku: sid("sku", 6), sku2: sid("sku", 7), line: sid("salesLine", 8), line2: sid("salesLine", 9), payment: sid("paymentAccount", 10) };
export const actor: ActorContext = { accountId: ids.account, hallId: ids.hall };
/** Explicit identity seed helper, never an automatic default in SyntheticStore. */
export function syntheticSalesIdentity(overrides: Partial<SalesCurrentIdentity> = {}): SalesCurrentIdentity {
  return { accountId: actor.accountId, staffId: sid("staff", 16), loginEnabled: true, role: "SALESPERSON", employmentStatus: "在职",
    hallId: actor.hallId, hallEnabled: true, ...overrides };
}
export const snapshot = { productCode: "SYNTHETIC_PRODUCT", productName: "SYNTHETIC ONLY", colorName: "SYNTHETIC_COLOR", fitName: "SYNTHETIC_FIT", sizeName: "SYNTHETIC_SIZE_A", barcode: null };
export function syntheticSku(id = ids.sku, fit = 11): SkuRow {
  return { id, productId: sid("product", 12), colorId: sid("color", 13), fitId: sid("fit", fit), sizeId: sid("size", 14), skuCode: `SYNTHETIC_SKU_${id}`, enabled: true, version: version(1) };
}
export function syntheticDraft(businessType: SalesBusinessType = "SALE", quantities?: readonly string[]): SalesDraft {
  const counts = quantities ?? (businessType === "RETURN" ? ["-2"] : businessType === "EXCHANGE" ? ["-2", "3"] : ["2"]);
  const lines: SalesLineRow[] = counts.map((count, index) => ({ id: index === 0 ? ids.line : ids.line2, salesId: ids.sales, lineNo: index + 1,
    skuId: index === 0 ? ids.sku : ids.sku2, quantity: quantity(count), referencePrice: minorAmount("125"), dealPrice: minorAmount("125"),
    pricingRule: "UNIT_PRICE", discountTenths: null, zeroConfirmed: false,
    lineAmount: multiplyMoney(minorAmount("125"), quantity(count)), allocatedDiscount: minorAmount("0"), isGift: false, snapshot, isCurrent: true }));
  const due = minorAmount(lines.reduce((sum, row) => sum + row.lineAmount, 0n).toString());
  return { header: { id: ids.sales, number: "SYNTHETIC-DOC-0001", businessType, businessDate: businessDate("2026-10-20"), hallId: ids.hall,
    salespersonId: null, customerId: ids.customer, warehouseId: ids.warehouse, grossAmount: due, orderDiscount: minorAmount("0"), netDue: due, note: "SYNTHETIC ONLY" }, lines,
    settlements: due === 0n ? [] : [{ id: sid("settlement", 15), salesId: ids.sales, lineNo: 1, paymentAccountId: ids.payment,
      direction: due < 0n ? "REFUND" : "RECEIVE", amount: minorAmount((due < 0n ? -due : due).toString()) }] };
}
/** EXCLUSIVELY SYNTHETIC convention: outgoing positive, incoming negative, no discounts.
 * Not the approved Demo sign/discount policy and never exported from production packages. */
export const SYNTHETIC_RULES: SalesBusinessRules = {
  assertDraftChange(_previous, _draft) {},
  assertReferencesAndEconomics(document) {
    const current = document.lines.filter(line => line.isCurrent);
    requireDomain(document.header.orderDiscount === 0n, "SYNTHETIC_RULE", "Synthetic policy does not implement discounts");
    for (const line of current) {
      requireDomain([ids.sku, ids.sku2].includes(line.skuId) && line.quantity !== 0n, "SYNTHETIC_RULE", "Synthetic fixture requires known SKU/nonzero quantity");
      requireDomain(document.header.businessType !== "SALE" || line.quantity > 0n, "SYNTHETIC_RULE", "Synthetic sale uses positive quantity");
      requireDomain(document.header.businessType !== "RETURN" || line.quantity < 0n, "SYNTHETIC_RULE", "Synthetic return uses negative quantity");
      requireDomain(line.lineAmount === multiplyMoney(line.dealPrice, line.quantity), "SYNTHETIC_RULE", "Synthetic exact multiplication must agree");
      requireDomain(!line.isGift || line.dealPrice === 0n, "SYNTHETIC_RULE", "Synthetic gift must be zero price");
    }
    requireDomain(document.header.netDue === current.reduce((sum, line) => sum + line.lineAmount, 0n), "SYNTHETIC_RULE", "Synthetic totals must agree");
  },
  inventoryDelta(_document, line) { return negateQuantity(line.quantity); }
};
export function fixture(options: { readonly authorize?: SalesAuthorization["assertAllowed"]; readonly rules?: SalesBusinessRules } = {}) {
  const store = new SyntheticStore();
  for (const skuId of [ids.sku, ids.sku2]) store.seedBalance({ warehouseId: ids.warehouse, skuId, quantity: quantity("0"), version: version(1), lastOperationId: null, updatedAt: "2026-10-20T00:00:00Z" });
  let sequence = 1000;
  let allowed = true;
  const service = createSalesService({ unitOfWork: store, rules: options.rules ?? SYNTHETIC_RULES,
    authorization: { async assertAllowed(context, action, document, tx) {
      requireDomain(allowed, "FORBIDDEN", "Synthetic permission was revoked");
      await options.authorize?.(context, action, document, tx);
    } },
    now: () => "2026-10-20T12:00:00Z", newId: kind => sid(kind, sequence++) });
  return { store, service, revokeAccess: () => { allowed = false; },
    balance: (skuId = ids.sku) => store.snapshot().balances.get(balanceKey(ids.warehouse, skuId))?.quantity,
    document: (): SalesDocument => { const state = store.snapshot(); const header = state.headers.get(ids.sales); if (!header) throw new Error("No synthetic document");
      return { header, lines: [...state.lines.values()].filter(row => row.salesId === ids.sales), settlements: [...state.settlements.values()].filter(row => row.salesId === ids.sales) }; } };
}
