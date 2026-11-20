import { sameSalesLine } from './sales-change-evidence.ts';
import { isHistoricalSignedSale, retainedSalesApprovalSnapshot } from './sales-retained-approval.ts';
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
/** Display ordering is audited separately; it does not invent pricing facts. */
export function sameSalesLinePricingFacts(left: SalesLineRow, right: SalesLineRow): boolean {
  return sameSalesLine(left, { ...right, lineNo: left.lineNo });
}

/** New mixed SALE keeps both signed rows; discounts are never allocated across returns.
 * Historical callers retain their separately verified original allocation facts. */
export function allocateCurrentSalesDiscount(lines: readonly Pick<SalesLineRow, "quantity" | "lineAmount">[], discount: MinorAmount): readonly MinorAmount[] {
  if (lines.some(line => line.quantity < 0n)) {
    requireDomain(lines.some(line => line.quantity > 0n), "INVALID_SALES_QUANTITY", "A new SALE needs a positive row; negative-only documents use the existing return/exchange types");
    requireDomain(discount === 0n, "MIXED_SALES_ORDER_DISCOUNT", "New mixed sales cannot use a whole-document discount");
    return lines.map(() => minorAmount("0"));
  }
  return allocateSalesDiscount(lines.map(line => line.lineAmount), discount);
}

function validPrice(value: unknown): value is MinorAmount | null {
  return value === null || (typeof value === "bigint" && value >= 0n);
}
function checkPricing(line: SalesLineRow, product: ProductSalesPricingFacts, preservedAllocation = false): void {
  requireDomain(line.pricingRule === "UNIT_PRICE" || line.pricingRule === "DISCOUNT", "UNKNOWN_PRICING_FACTS", "Pricing intent must be explicit, never reconstructed from a price ratio");
  requireDomain(typeof line.isGift === "boolean" && (line.allocatedDiscount !== null || preservedAllocation), "UNKNOWN_PRICING_FACTS", "Gift and discount allocation facts must be explicit for active new economics");
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

/** Prior approved immutable economics retain factual NULLs. Known arithmetic and
 * known contradictory flags still fail; no pricing intent, gift or confirmation is
 * inferred. Current minimum remains applicable unless gift is actually known. */
function checkRetainedPricing(line: SalesLineRow, product: ProductSalesPricingFacts): void {
  requireDomain(line.dealPrice >= 0n && validPrice(line.referencePrice), "INVALID_PRICE", "Retained monetary facts must remain exact and nonnegative");
  if (line.pricingRule === "UNIT_PRICE") requireDomain(line.discountTenths === null, "INVALID_LINE_DISCOUNT", "Direct unit price cannot carry an entered discount");
  if (line.discountTenths !== null) requireDomain(Number.isInteger(line.discountTenths) && line.discountTenths >= 0 && line.discountTenths <= 100,
    "INVALID_LINE_DISCOUNT", "Known retained discount must be valid integer tenths");
  if (line.pricingRule === "DISCOUNT" && line.isGift === false && line.discountTenths !== null && line.referencePrice !== null)
    requireDomain(discountUnitPrice(line.referencePrice, line.discountTenths) === line.dealPrice, "DISCOUNT_PRICE_MISMATCH", "Known retained discount facts must agree");
  requireDomain(line.isGift !== true || line.dealPrice === 0n, "INVALID_GIFT_PRICE", "Known gift unit price must be zero");
  if (line.isGift === false && line.zeroConfirmed === false) requireDomain(line.dealPrice !== 0n, "ZERO_PRICE_NOT_CONFIRMED", "Known ordinary zero-price intent still needs confirmation");
  if (line.isGift !== true) requireDomain(product.minimumPrice === null || line.dealPrice >= product.minimumPrice,
    "BELOW_MINIMUM_PRICE", "Retained approval does not invent a gift exception to the current minimum");
}

/** Untouched factual unknowns may survive ordinary draft metadata edits. This
 * compares exact economics, not source. Any quantity/price/type/line-set change
 * returns false and requires complete newly supplied pricing facts. */
export function preservesUnknownSalesEconomics(previous: SalesDocument | undefined, draft: SalesDraft): boolean {
  if (!previous || previous.header.businessType !== draft.header.businessType || previous.header.grossAmount !== draft.header.grossAmount
    || previous.header.orderDiscount !== draft.header.orderDiscount || previous.header.netDue !== draft.header.netDue) return false;
  const old = previous.lines.filter(line => line.isCurrent), current = draft.lines.filter(line => line.isCurrent);
  if (!old.some(line => line.pricingRule === null || line.zeroConfirmed === null || line.isGift === null || line.allocatedDiscount === null)
    || old.length !== current.length) return false;
  const fields = ["id", "lineNo", "skuId", "quantity", "referencePrice", "dealPrice", "pricingRule", "discountTenths", "zeroConfirmed", "lineAmount", "allocatedDiscount", "isGift"] as const;
  const byId = new Map(old.map(line => [line.id, line]));
  return current.every(line => { const retained = byId.get(line.id); return retained !== undefined && fields.every(field => retained[field] === line[field]); });
}

/** Only trusted stored history may retain signed SALE facts during metadata SAVE.
 * No sign, settlement direction, reference, price or line identity is rewritten. */
export function preservesHistoricalSignedSale(previous: SalesDocument | undefined, draft: SalesDraft, stockBasis?: "RUNTIME_LEDGER" | "CUTOFF_HISTORY"): boolean {
  if(stockBasis!=="CUTOFF_HISTORY" || !previous || previous.header.businessType!=="SALE"
    || !previous.lines.some(l=>l.isCurrent&&l.quantity<0n))return false;
  const headers=["id","number","businessType","businessDate","hallId","customerId","salespersonId","warehouseId","grossAmount","orderDiscount","netDue"] as const;
  if(!headers.every(k=>previous.header[k]===draft.header[k]))return false;
  const old=previous.lines.filter(l=>l.isCurrent), rows=draft.lines.filter(l=>l.isCurrent);
  const fields=["id","salesId","lineNo","skuId","quantity","referencePrice","dealPrice","pricingRule","discountTenths","zeroConfirmed","lineAmount","allocatedDiscount","isGift"] as const;
  if(old.length!==rows.length || !rows.every((l,i)=>fields.every(k=>l[k]===old[i]![k])))return false;
  const settlementFields=["id","salesId","lineNo","paymentAccountId","paymentMethodId","direction","amount"] as const;
  return previous.settlements.length===draft.settlements.length && draft.settlements.every((s,i)=>settlementFields.every(k=>s[k]===previous.settlements[i]![k]));
}

/** Concrete compatibility adapter based on directly inspected candidate source, not
 * frozen-Demo runtime parity. SALE accepts positive rows and mixed positive/negative rows. Both new RETURN and EXCHANGE
 * map to the candidate's SAME independent RETURN_EXCHANGE signed economics: any nonzero
 * signed rows, stock = -q, no original-sale lookup/cap, no nonzero whole discount.
 * UI defaults/sign toggles are intentionally not backend restrictions.
 * Current rows must be in ascending persisted lineNo order, preserving the original
 * calculated array index for discount ties across save/readback. No row merging occurs. */
export function createCandidateSalesBusinessRules(facts: SalesRuleFactResolver): SalesBusinessRules {
  requireDomain(facts && typeof facts.sku === "function" && typeof facts.productPricing === "function"
    && typeof facts.assertDocumentReferences === "function", "MISSING_SALES_FACT_PROVIDER", "Explicit trusted catalogue/reference providers are required");
  function assertEconomics(document: SalesDraft | SalesDocument, retained = false, historicalSigned = false, previous?: SalesDocument, draftIncomplete = false): void {
    const lines = document.lines.filter(line => line.isCurrent);
    facts.assertDocumentReferences({ ...document, lines });
    requireDomain(lines.length > 0, "INVALID_LINES", "At least one actual sales line is required");
    const products = new Map<EntityId<"product">, ProductSalesPricingFacts>();
    for (const [index, line] of lines.entries()) {
      requireDomain(index === 0 || lines[index - 1]!.lineNo < line.lineNo, "INVALID_ALLOCATION_ORDER", "Current row array must preserve ascending persisted lineNo order");
      requireDomain(line.quantity !== 0n && (document.header.businessType !== "SALE" || line.quantity > 0n || lines.some(row => row.quantity > 0n) || historicalSigned),
        "INVALID_SALES_QUANTITY", "SALE needs a positive row; mixed and independent return/exchange rows are nonzero signed quantities");
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
      const unchanged = previous?.lines.some(old => old.isCurrent && sameSalesLinePricingFacts(old, line));
      if (retained || unchanged || draftIncomplete && (line.pricingRule===null || line.isGift===null || line.zeroConfirmed===null)) checkRetainedPricing(line, product); else checkPricing(line, product, historicalSigned && previous?.lines.some(old=>old.id===line.id && old.allocatedDiscount===line.allocatedDiscount));
      requireDomain(line.lineAmount === multiplyMoney(line.dealPrice, line.quantity), "LINE_AMOUNT_MISMATCH", "Line amount is signed gross quantity times discounted unit price");
    }
    const gross = minorAmount(lines.reduce((sum, line) => sum + line.lineAmount, 0n).toString());
    const discount = document.header.orderDiscount;
    requireDomain(["SALE", "RETURN", "EXCHANGE"].includes(document.header.businessType), "INVALID_BUSINESS_TYPE", "Unsupported sales business type");
    requireDomain(document.header.businessType === "SALE" || discount === 0n, "INDEPENDENT_RETURN_DISCOUNT", "Independent return/exchange documents cannot use a whole-document discount");
    const shares = document.header.businessType === "SALE" && !historicalSigned
      ? allocateCurrentSalesDiscount(lines, discount)
      : lines.map(() => minorAmount("0"));
    if (historicalSigned) {
      requireDomain(lines.every(line => { const old=previous?.lines.find(old=>old.id===line.id); return previous ? (old ? line.allocatedDiscount===old.allocatedDiscount : line.allocatedDiscount===0n) : line.allocatedDiscount===null || line.allocatedDiscount>=0n; }), 'DISCOUNT_ALLOCATION_MISMATCH', 'Historical allocation facts remain unchanged; never redistribute the retained whole discount');
    } else requireDomain(lines.every((line, index) => ((retained || previous?.lines.some(old => old.isCurrent && sameSalesLinePricingFacts(old, line))) && line.allocatedDiscount === null) || line.allocatedDiscount === shares[index]), "DISCOUNT_ALLOCATION_MISMATCH", "Allocated discounts must match stable largest-remainder calculation");
    requireDomain(document.header.grossAmount === gross && document.header.netDue === gross - discount,
      "DOCUMENT_AMOUNT_MISMATCH", "Header gross/net must exactly match signed line economics");
    // Settlement equality belongs to APPROVE in the service: drafts may remain unbalanced.
    // RECEIVE/REFUND absolute zero rows both adapt to source signed zero; references still
    // must be valid. Empty settlements also correctly represent a zero-net document.
  }
  return {
    assertDraftChange(previous, draft, tx, stockBasis) {
      if(previous && isHistoricalSignedSale(previous,stockBasis,tx)) {
        requireDomain(draft.header.businessType === 'SALE', 'HISTORICAL_SALE_TYPE_CHANGED', 'Historical original SALE type must remain unchanged');
        if (preservesHistoricalSignedSale(previous,draft,stockBasis)) { facts.assertDocumentReferences(draft); return; }
        requireDomain(draft.header.orderDiscount === previous.header.orderDiscount, 'HISTORICAL_DISCOUNT_CHANGED', 'Preserve the original historical whole discount exactly; never invent a new discount');
        assertEconomics(draft, false, true, previous, true);
      } else if (preservesUnknownSalesEconomics(previous, draft)) facts.assertDocumentReferences(draft);
      else assertEconomics(draft, false, false, previous, true);
    },
    assertReferencesAndEconomics(document, tx, retained, stockBasis) {
      if (retained) retainedSalesApprovalSnapshot(retained, document, tx);
      const historicalSigned=isHistoricalSignedSale(document,stockBasis,tx);
      assertEconomics(document, retained !== undefined || historicalSigned, historicalSigned);
    },
    inventoryDelta(document, line) {
      requireDomain(line.quantity !== 0n, "INVALID_SALES_QUANTITY", "Stock effect follows validated signed business quantity");
      return negateQuantity(line.quantity);
    }
  };
}
