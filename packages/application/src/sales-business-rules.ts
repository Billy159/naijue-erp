import type { SalesDocument, SalesDraft, SalesLineRow } from "../../domain/src/documents.ts";
import type { SkuRow } from "../../domain/src/catalog.ts";
import { requireDomain } from "../../domain/src/errors.ts";
import { allocateSalesDiscount, discountUnitPrice } from "../../domain/src/sales-money.ts";
import { minorAmount, multiplyMoney, negateQuantity } from "../../domain/src/values.ts";
import type { EntityId, MinorAmount } from "../../domain/src/values.ts";
import type { SalesBusinessRules } from "./ports.ts";

/** Facts must come from a trusted server-side product catalogue, not request prices.
 * null explicitly means known absent; missing/undefined facts are NOT zero or no minimum.
 * Product identity, not SKU, is the sole catalogue-price authority. */
export interface ProductSalesPricingFacts {
  readonly id: EntityId<"product">; readonly enabled: boolean;
  readonly referencePrice: MinorAmount | null; readonly minimumPrice: MinorAmount | null;
}
export interface SalesRuleFactResolver {
  sku(skuId: EntityId<"sku">): Pick<SkuRow, "id" | "productId" | "enabled"> | undefined;
  productPricing(productId: EntityId<"product">): ProductSalesPricingFacts | undefined;
  /** Trusted existence/enabled/identity check for hall, same-hall warehouse, customer,
   * optional salesperson, current line snapshots, and payment account with its enabled method.
   * Authorization scope remains the separate SalesAuthorization responsibility. */
  assertDocumentReferences(document: SalesDraft | SalesDocument): void;
}
function validPrice(value: unknown): value is MinorAmount | null {
  return value === null || (typeof value === "bigint" && value >= 0n);
}
function checkPricing(line: SalesLineRow, product: ProductSalesPricingFacts): void {
  requireDomain(line.pricingRule === "UNIT_PRICE" || line.pricingRule === "DISCOUNT", "UNKNOWN_PRICING_FACTS", "Pricing intent must be explicit, never reconstructed from a price ratio");
  requireDomain(typeof line.zeroConfirmed === "boolean", "UNKNOWN_PRICING_FACTS", "Zero confirmation must be explicit, never inferred from an old zero amount");
  requireDomain(line.dealPrice >= 0n && validPrice(line.referencePrice), "INVALID_PRICE", "Deal and reference prices must be nonnegative exact minor units");
  if (line.pricingRule === "UNIT_PRICE") {
    requireDomain(line.discountTenths === null, "INVALID_LINE_DISCOUNT", "A direct unit price cannot carry an entered discount");
  } else {
    requireDomain(typeof line.discountTenths === "number" && Number.isInteger(line.discountTenths)
      && line.discountTenths >= 0 && line.discountTenths <= 100, "INVALID_LINE_DISCOUNT", "Discount mode requires explicit integer tenths from 0 through 100");
    // Candidate validation.ts:63 deliberately skips discount-price equality for gifts.
    if (!line.isGift) requireDomain(line.referencePrice !== null
      && discountUnitPrice(line.referencePrice, line.discountTenths) === line.dealPrice,
    "DISCOUNT_PRICE_MISMATCH", "Deal price must equal half-up reference-snapshot discount before quantity multiplication");
  }
  requireDomain(!line.isGift || line.dealPrice === 0n, "INVALID_GIFT_PRICE", "Gift unit price must be zero");
  if (!line.isGift) {
    requireDomain(line.dealPrice !== 0n || line.zeroConfirmed === true, "ZERO_PRICE_NOT_CONFIRMED", "An ordinary zero-price line needs explicit confirmation");
    requireDomain(product.minimumPrice === null || line.dealPrice >= product.minimumPrice, "BELOW_MINIMUM_PRICE", "Zero confirmation does not bypass the product minimum price");
  }
  // A stored reference snapshot need not equal today's catalogue price. Product-uniform
  // catalogue prices do not impose equality of separately negotiated document deal prices.
}

/** Concrete compatibility adapter based on directly inspected candidate source, not
 * frozen-Demo runtime parity. SALE uses positive quantities. Both new RETURN and EXCHANGE
 * map to the candidate's SAME independent RETURN_EXCHANGE signed economics: any nonzero
 * signed rows, stock = -q, no original-sale lookup/cap, no nonzero whole discount.
 * UI defaults/sign toggles are intentionally not backend restrictions.
 * Current rows must be in ascending persisted lineNo order, preserving the original
 * calculated array index for discount ties across save/readback. No row merging occurs. */
export function createCandidateSalesBusinessRules(facts: SalesRuleFactResolver): SalesBusinessRules {
  requireDomain(facts && typeof facts.sku === "function" && typeof facts.productPricing === "function"
    && typeof facts.assertDocumentReferences === "function", "MISSING_SALES_FACT_PROVIDER", "Explicit trusted catalogue/reference providers are required");
  function assertEconomics(document: SalesDraft | SalesDocument): void {
    const lines = document.lines.filter(line => line.isCurrent);
    facts.assertDocumentReferences({ ...document, lines });
    requireDomain(lines.length > 0, "INVALID_LINES", "At least one actual sales line is required");
    const products = new Map<EntityId<"product">, ProductSalesPricingFacts>();
    for (const [index, line] of lines.entries()) {
      requireDomain(index === 0 || lines[index - 1]!.lineNo < line.lineNo, "INVALID_ALLOCATION_ORDER", "Current row array must preserve ascending persisted lineNo order");
      requireDomain(line.quantity !== 0n && (document.header.businessType !== "SALE" || line.quantity > 0n),
        "INVALID_SALES_QUANTITY", "SALE requires positive quantity; independent return/exchange accepts nonzero signed quantity");
      const sku = facts.sku(line.skuId);
      requireDomain(sku && sku.id === line.skuId && sku.enabled === true && typeof sku.productId === "string", "SKU_UNAVAILABLE", "An existing enabled SKU and product association are required");
      let product = products.get(sku.productId);
      if (!product) {
        product = facts.productPricing(sku.productId);
        requireDomain(product && product.id === sku.productId && product.enabled === true
          && validPrice(product.referencePrice) && validPrice(product.minimumPrice),
        "PRODUCT_PRICING_UNAVAILABLE", "Trusted product price facts are unavailable or incomplete; missing is not zero");
        products.set(sku.productId, product);
      }
      checkPricing(line, product);
      requireDomain(line.lineAmount === multiplyMoney(line.dealPrice, line.quantity), "LINE_AMOUNT_MISMATCH", "Line amount is signed gross quantity times discounted unit price");
    }
    const gross = minorAmount(lines.reduce((sum, line) => sum + line.lineAmount, 0n).toString());
    const discount = document.header.orderDiscount;
    requireDomain(["SALE", "RETURN", "EXCHANGE"].includes(document.header.businessType), "INVALID_BUSINESS_TYPE", "Unsupported sales business type");
    requireDomain(document.header.businessType === "SALE" || discount === 0n, "INDEPENDENT_RETURN_DISCOUNT", "Independent return/exchange documents cannot use a whole-document discount");
    const shares = document.header.businessType === "SALE"
      ? allocateSalesDiscount(lines.map(line => line.lineAmount), discount)
      : lines.map(() => minorAmount("0"));
    requireDomain(lines.every((line, index) => line.allocatedDiscount === shares[index]), "DISCOUNT_ALLOCATION_MISMATCH", "Allocated discounts must match stable largest-remainder calculation");
    requireDomain(document.header.grossAmount === gross && document.header.netDue === gross - discount,
      "DOCUMENT_AMOUNT_MISMATCH", "Header gross/net must exactly match signed line economics");
    // Settlement equality belongs to APPROVE in the service: drafts may remain unbalanced.
    // RECEIVE/REFUND absolute zero rows both adapt to source signed zero; references still
    // must be valid. Empty settlements also correctly represent a zero-net document.
  }
  return {
    assertDraftChange(_previous, draft) { assertEconomics(draft); },
    assertReferencesAndEconomics(document) { assertEconomics(document); },
    inventoryDelta(document, line) {
      requireDomain(line.quantity !== 0n && (document.header.businessType !== "SALE" || line.quantity > 0n), "INVALID_SALES_QUANTITY", "Stock effect follows validated signed business quantity");
      return negateQuantity(line.quantity);
    }
  };
}
