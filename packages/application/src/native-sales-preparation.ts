import { SALES_PREPARE_MAX_REQUEST_BYTES, SALES_PREPARE_MAX_LINES, SALES_PREPARE_MAX_NOTE_LENGTH, salesJsonByteLength, salesPreparedDraftFitsSaveBudget } from "./sales-payload-budget.ts";
import type { SalesDraft, SalesLineRow } from "../../domain/src/documents.ts";
import { requireDomain } from "../../domain/src/errors.ts";
import { allocateSalesDiscount, discountUnitPrice } from "../../domain/src/sales-money.ts";
import { businessDate, decimalToMinor, entityId, minorAmount, multiplyMoney, quantity } from "../../domain/src/values.ts";
import type { ActorContext, SalesDependencies, SalesBusinessRules, SalesTransaction } from "./ports.ts";
import { createNativeTransactionSalesBusinessRules } from "./sales-native-facts.ts";
import { sourceConfirmedCreateDocumentNumber } from "./source-confirmed-document-number.ts";
import { parseDocumentSkuSelection } from './document-specification.ts';
import type { DocumentSkuSelection } from './document-specification.ts';
import type { StoredSales } from './ports.ts';
import type { EntityId } from '../../domain/src/values.ts';

function responsibleKeys(value: unknown): string[] {
  return value !== null && typeof value === 'object' && Object.hasOwn(value, 'responsibleStaffId') ? ['responsibleStaffId'] : [];
}
function responsibleIntent(row: Record<string, unknown>): { readonly responsibleStaffId?: string } {
  return Object.hasOwn(row, 'responsibleStaffId') ? { responsibleStaffId: entityId('staff', row.responsibleStaffId as string) } : {};
}
/** Manual sales/independent-return/exchange proposal: IDs and explicit pricing intent, never labels,
 * barcode, reference/minimum-price authority, calculated totals or document IDs.
 * RETURN/EXCHANGE reuse independent signed economics: nonzero ± rows, no original
 * sale association, zero whole discount/allocation. Settlement equality is APPROVE-only. */
export interface NativeSalesCreateProposal {
  readonly responsibleStaffId?: string;
  readonly businessType: "SALE" | "RETURN" | "EXCHANGE"; readonly businessDate: string; readonly note: string | null;
  readonly hallId: string; readonly customerId: string; readonly salespersonId: string | null; readonly warehouseId: string;
  readonly orderDiscount: string;
  readonly lines: readonly { readonly skuId: string; readonly quantity: string; readonly dealPrice: string | null;
    readonly pricingRule: "UNIT_PRICE" | "DISCOUNT"; readonly discountTenths: number | null;
    readonly isGift: boolean; readonly zeroConfirmed: boolean }[];
  readonly settlements: readonly { readonly paymentAccountId: string; readonly paymentMethodId: string;
    readonly direction: "RECEIVE" | "REFUND"; readonly amount: string }[];
}
export interface NativeSalesExistingProposal extends Omit<NativeSalesCreateProposal, "lines" | "settlements"> {
  readonly salesId: string; readonly expectedVersion: number;
  readonly lines: readonly (NativeSalesCreateProposal["lines"][number] & { readonly existingLineId: string | null })[];
  readonly settlements: readonly (NativeSalesCreateProposal["settlements"][number] & { readonly existingSettlementId: string | null })[];
}
export interface NativeSalesExistingPrepared { readonly expectedVersion: number; readonly draft: SalesDraft }
export interface NativeSalesSaveProposal extends Omit<NativeSalesCreateProposal,'lines'|'settlements'> {
  readonly salesId:string|null;
  readonly lines:readonly (DocumentSkuSelection & Omit<NativeSalesExistingProposal['lines'][number],'skuId'>)[];
  readonly settlements:NativeSalesExistingProposal['settlements'];
}
export const NATIVE_SALES_PREPARE_MAX_LINES = SALES_PREPARE_MAX_LINES;
function money(value: unknown) {
  requireDomain(typeof value === "string" && value.length <= 19 && /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value), "INVALID_MONEY", "Exact nonnegative yuan text required");
  return decimalToMinor(value, { scale: 2, maxAbsMinor: 999999999999999999n });
}
/** Explicit manual-SKU SAVE profile. Existing unchanged line observations remain
 * historical; new/replaced snapshots must still be the actual current MAIN.
 * Reference snapshots on newly created lines must be current product prices. */
export function createNativeManualSalesBusinessRules(): SalesBusinessRules {
  const native = createNativeTransactionSalesBusinessRules();
  return Object.freeze({
    async assertDraftChange(previous, draft, tx) {
      await native.assertDraftChange(previous, draft, tx);
      const prior = new Map((previous?.lines ?? []).map(row => [row.id, row]));
      const keys = ["productCode", "productName", "colorName", "fitName", "sizeName", "barcode"] as const;
      const changed = draft.lines.filter(row => row.isCurrent && !(prior.get(row.id)?.skuId === row.skuId
        && prior.get(row.id)!.referencePrice === row.referencePrice && keys.every(key => prior.get(row.id)!.snapshot[key] === row.snapshot[key])));
      if (changed.length === 0) return;
      requireDomain(tx?.getCurrentSalesSnapshots && tx.getCurrentSalesReferenceFacts, "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Original transaction native snapshots required");
      const snapshots = await tx.getCurrentSalesSnapshots(changed.map(row => row.skuId));
      const facts = await tx.getCurrentSalesReferenceFacts(draft);
      for (const row of changed) {
        const snapshot = snapshots.get(row.skuId), sku = facts.skus.find(sku => sku.id === row.skuId);
        const product = sku && facts.products.find(product => product.id === sku.productId);
        requireDomain(snapshot && keys.every(key => snapshot[key] === row.snapshot[key]), "SALES_SNAPSHOT_MISMATCH", "Manual sales requires current MAIN snapshot");
        requireDomain(product && product.referencePrice === row.referencePrice, "SALES_SNAPSHOT_MISMATCH", "New line reference snapshot must match current product price");
      }
    },
    assertReferencesAndEconomics: native.assertReferencesAndEconomics,
    inventoryDelta: native.inventoryDelta
  } satisfies SalesBusinessRules);
}

/** Preparation never creates business documents, receipts, audit or stock. PG20+
 * reserves a number only AFTER current authorization and native references pass;
 * its own acknowledged transaction persists that mapping independently of SAVE.
 * SAVE still uses its own request key, expectedVersion:null and revalidation.
 * Legacy transaction compositions retain the old parity helper only.
 * Host must install native transaction rules on SAVE; this function never enables a route. */
export function createNativeSalesPreparation(dependencies: SalesDependencies) {
  const nativeRules = createNativeManualSalesBusinessRules();
  return Object.freeze({ async prepareCreate(actorInput: ActorContext, input: NativeSalesCreateProposal): Promise<SalesDraft> {
    const actor = structuredClone(actorInput), proposal = structuredClone(input);
    requireDomain(proposal && typeof proposal === "object" && (proposal.businessType === "SALE" || proposal.businessType === "RETURN" || proposal.businessType === "EXCHANGE")
      && (proposal.note === null || typeof proposal.note === "string" && proposal.note.length <= SALES_PREPARE_MAX_NOTE_LENGTH)
      && Array.isArray(proposal.lines) && proposal.lines.length > 0 && proposal.lines.length <= NATIVE_SALES_PREPARE_MAX_LINES
      && Array.isArray(proposal.settlements) && proposal.settlements.length <= 3, "INVALID_HTTP_INPUT", "Bounded native sales proposal required");
    requireDomain(salesJsonByteLength(proposal) <= SALES_PREPARE_MAX_REQUEST_BYTES, "SALES_PAYLOAD_TOO_LARGE", "Preparation exceeds request budget");
    const used = new Set<string>();
    const nextId: SalesDependencies["newId"] = kind => {
      const value = entityId(kind, dependencies.newId(kind));
      requireDomain(!used.has(value), "INVALID_ID", "Generated identities must be distinct"); used.add(value); return value;
    };
    const id = nextId("sales"), zero = minorAmount("0");
    const header = { id, number: sourceConfirmedCreateDocumentNumber("SALE", id), businessType: proposal.businessType,
      businessDate: businessDate(proposal.businessDate), hallId: entityId("hall", proposal.hallId), customerId: entityId("customer", proposal.customerId),
      salespersonId: proposal.salespersonId === null ? null : entityId("staff", proposal.salespersonId), warehouseId: entityId("warehouse", proposal.warehouseId),
      note: proposal.note, ...(proposal.responsibleStaffId === undefined ? {} : { responsibleStaffId: entityId("staff", proposal.responsibleStaffId) }), orderDiscount: money(proposal.orderDiscount), grossAmount: zero, netDue: zero };
    requireDomain(header.businessType === "SALE" || header.orderDiscount === 0n, "INDEPENDENT_RETURN_DISCOUNT",
      "Independent return/exchange requires zero whole-document discount");
    const lines: SalesLineRow[] = proposal.lines.map((line, index) => {
      requireDomain(line && (line.pricingRule === "UNIT_PRICE" || line.pricingRule === "DISCOUNT")
        && typeof line.isGift === "boolean" && typeof line.zeroConfirmed === "boolean", "UNKNOWN_PRICING_FACTS", "Explicit pricing intent required");
      requireDomain(line.pricingRule === "UNIT_PRICE" ? line.discountTenths === null && (line.isGift || line.dealPrice !== null)
        : line.dealPrice === null && Number.isInteger(line.discountTenths) && line.discountTenths! >= 0 && line.discountTenths! <= 100,
      "INVALID_LINE_DISCOUNT", "Direct price and discount intent must be unambiguous");
      const count = quantity(line.quantity); requireDomain(count !== 0n && (header.businessType !== "SALE" || count > 0n), "INVALID_SALES_QUANTITY", "SALE requires positive quantity; independent return/exchange accepts nonzero signed quantity");
      return { id: nextId("salesLine"), salesId: id, lineNo: index + 1, skuId: entityId("sku", line.skuId), quantity: count,
        referencePrice: null, dealPrice: line.dealPrice === null ? zero : money(line.dealPrice), pricingRule: line.pricingRule,
        discountTenths: line.discountTenths, zeroConfirmed: line.zeroConfirmed, lineAmount: zero, allocatedDiscount: zero,
        isGift: line.isGift, snapshot: { productCode: "", productName: "", colorName: "", fitName: "", sizeName: "", barcode: null }, isCurrent: true };
    });
    const settlements = proposal.settlements.map((row, index) => {
      requireDomain(row && (row.direction === "RECEIVE" || row.direction === "REFUND"), "INVALID_SETTLEMENT", "Explicit settlement direction required");
      return { id: nextId("settlement"), salesId: id, lineNo: index + 1, paymentAccountId: entityId("paymentAccount", row.paymentAccountId),
        paymentMethodId: entityId("paymentMethod", row.paymentMethodId), direction: row.direction, amount: money(row.amount) };
    });
    const skeleton: SalesDraft = { header, lines, settlements };
    return dependencies.unitOfWork.transaction(async tx => {
      // Bind the existing adapter's receipt/actor scope without writing a receipt.
      // Generated request identity is private to this preparation, never reused by SAVE.
      requireDomain(!await tx.getReceipt(actor.accountId, `prepare-sales:${nextId("operation")}`), "IDEMPOTENCY_CONFLICT", "Preparation identity already exists");
      requireDomain(!await tx.getSales(id), "VERSION_CONFLICT", "Generated sales identity already exists");
      await dependencies.authorization.assertAllowed(actor, "SAVE", skeleton, tx);
      requireDomain(tx.getCurrentSalesSnapshots && tx.getCurrentSalesReferenceFacts,
        "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Native transaction preparation capabilities required");
      const snapshots = await tx.getCurrentSalesSnapshots(lines.map(row => row.skuId));
      const selected: SalesDraft = { ...skeleton, lines: lines.map(row => {
        const snapshot = snapshots.get(row.skuId); requireDomain(snapshot, "SKU_UNAVAILABLE", "Actual native MAIN snapshot required");
        return { ...row, snapshot: { ...snapshot } };
      }) };
      const facts = await tx.getCurrentSalesReferenceFacts(selected);
      const skus = new Map(facts.skus.map(row => [row.id, row])), products = new Map(facts.products.map(row => [row.id, row]));
      const priced = selected.lines.map(row => {
        const sku = skus.get(row.skuId), product = sku && products.get(sku.productId);
        requireDomain(product && product.referencePrice !== undefined, "PRODUCT_PRICING_UNAVAILABLE", "Complete current product reference price required");
        let dealPrice = row.dealPrice;
        if (row.isGift) { requireDomain(dealPrice === 0n, "INVALID_GIFT_PRICE", "Gift price must be explicitly zero or absent"); dealPrice = zero; }
        else if (row.pricingRule === "DISCOUNT") {
          requireDomain(product.referencePrice !== null, "PRODUCT_PRICING_UNAVAILABLE", "Discount requires actual reference price");
          dealPrice = discountUnitPrice(product.referencePrice, row.discountTenths!);
        }
        return { ...row, referencePrice: product.referencePrice, dealPrice, lineAmount: multiplyMoney(dealPrice, row.quantity) };
      });
      const allocations = header.businessType === "SALE"
        ? allocateSalesDiscount(priced.map(row => row.lineAmount), header.orderDiscount) : priced.map(() => zero);
      const grossAmount = minorAmount(priced.reduce((sum, row) => sum + row.lineAmount, 0n).toString());
      requireDomain(grossAmount >= -999999999999999999n && grossAmount <= 999999999999999999n
        && priced.every(row => row.lineAmount >= -999999999999999999n && row.lineAmount <= 999999999999999999n),
        "MONEY_STORAGE_OVERFLOW", "Calculated amounts must fit existing decimal(18,2) storage");
      const draft: SalesDraft = { header: { ...header, grossAmount, netDue: minorAmount((grossAmount - header.orderDiscount).toString()) },
        lines: priced.map((row, index) => ({ ...row, allocatedDiscount: allocations[index]! })), settlements };
      await nativeRules.assertDraftChange(undefined, draft, tx);
      await dependencies.rules.assertDraftChange(undefined, draft, tx);
      const prepared: SalesDraft = tx.reserveRuntimeDocumentNumber ? { ...draft, header: { ...draft.header,
        number: await tx.reserveRuntimeDocumentNumber({ kind: "SALES", documentId: id, actorAccountId: actor.accountId }) } } : draft;
      requireDomain(salesPreparedDraftFitsSaveBudget(prepared),
        "SALES_PAYLOAD_TOO_LARGE", "Prepared draft exceeds SAVE request budget");
      return structuredClone(prepared);
    });
  } });
}

function existingData(input: unknown, keys: readonly string[]): Record<string, unknown> {
  requireDomain(input !== null && typeof input === "object" && Object.getPrototypeOf(input) === Object.prototype
    && Reflect.ownKeys(input).length === keys.length, "INVALID_HTTP_INPUT", "Exact existing sales proposal required");
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    requireDomain(d && "value" in d && d.enumerable, "INVALID_HTTP_INPUT", "Own proposal data properties required"); result[key] = d.value;
  }
  return result;
}
function existingArray(input: unknown, minimum: number, maximum: number): unknown[] {
  requireDomain(Array.isArray(input) && Object.getPrototypeOf(input) === Array.prototype && input.length >= minimum && input.length <= maximum
    && Reflect.ownKeys(input).length === input.length + 1, "INVALID_HTTP_INPUT", "Bounded dense proposal array required");
  return Array.from({ length: input.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(input, String(i)); requireDomain(d && "value" in d && d.enumerable, "INVALID_HTTP_INPUT", "Own array values required"); return d.value;
  });
}
/** Separate closed successor parser; the original CREATE parser/hash is untouched. */
export function parseNativeSalesExistingProposal(input: unknown): NativeSalesExistingProposal {
  const p = existingData(input, ["salesId", "expectedVersion", "businessType", "businessDate", "note", "hallId", "customerId", "salespersonId", "warehouseId", "orderDiscount", "lines", "settlements", ...responsibleKeys(input)]);
  const text = (v: unknown): string => { requireDomain(typeof v === "string", "INVALID_HTTP_INPUT", "Explicit proposal text required"); return v; };
  const pointer = (v: unknown, kind: "salesLine" | "settlement"): string | null => v === null ? null : entityId(kind, text(v));
  requireDomain(typeof p.expectedVersion === "number" && Number.isInteger(p.expectedVersion) && p.expectedVersion > 0 && p.expectedVersion <= 2147483647,
    "INVALID_VERSION", "Existing native integer version required");
  requireDomain(p.businessType === "SALE" || p.businessType === "RETURN" || p.businessType === "EXCHANGE", "INVALID_HTTP_INPUT", "Explicit business type required");
  const note = p.note === null ? null : text(p.note);
  requireDomain(note === null || note.length <= SALES_PREPARE_MAX_NOTE_LENGTH, "INVALID_HTTP_INPUT", "Bounded note required");
  const lines = existingArray(p.lines, 1, SALES_PREPARE_MAX_LINES).map((value): NativeSalesExistingProposal["lines"][number] => {
    const line = existingData(value, ["existingLineId", "skuId", "quantity", "dealPrice", "pricingRule", "discountTenths", "isGift", "zeroConfirmed"]);
    requireDomain((line.pricingRule === "UNIT_PRICE" || line.pricingRule === "DISCOUNT") && typeof line.isGift === "boolean" && typeof line.zeroConfirmed === "boolean",
      "INVALID_HTTP_INPUT", "Explicit pricing and confirmation intent required");
    requireDomain(line.pricingRule === "UNIT_PRICE" ? line.discountTenths === null && (line.isGift || line.dealPrice !== null)
      : line.dealPrice === null && typeof line.discountTenths === "number" && Number.isInteger(line.discountTenths) && line.discountTenths >= 0 && line.discountTenths <= 100,
    "INVALID_LINE_DISCOUNT", "Unambiguous explicit pricing intent required");
    const q = text(line.quantity), price = line.dealPrice === null ? null : text(line.dealPrice);
    requireDomain(quantity(q) !== 0n && (p.businessType !== "SALE" || quantity(q) > 0n), "INVALID_SALES_QUANTITY", "Actual nonzero signed quantity required");
    if (price !== null) money(price);
    return { existingLineId: pointer(line.existingLineId, "salesLine"), skuId: entityId("sku", text(line.skuId)), quantity: q, dealPrice: price,
      pricingRule: line.pricingRule, discountTenths: line.discountTenths as number | null, isGift: line.isGift, zeroConfirmed: line.zeroConfirmed };
  });
  const settlements = existingArray(p.settlements, 0, 3).map((value): NativeSalesExistingProposal["settlements"][number] => {
    const row = existingData(value, ["existingSettlementId", "paymentAccountId", "paymentMethodId", "direction", "amount"]);
    requireDomain(row.direction === "RECEIVE" || row.direction === "REFUND", "INVALID_HTTP_INPUT", "Explicit settlement direction required");
    const amount = text(row.amount); money(amount);
    return { existingSettlementId: pointer(row.existingSettlementId, "settlement"), paymentAccountId: entityId("paymentAccount", text(row.paymentAccountId)),
      paymentMethodId: entityId("paymentMethod", text(row.paymentMethodId)), direction: row.direction, amount };
  });
  const proposal: NativeSalesExistingProposal = { salesId: entityId("sales", text(p.salesId)), expectedVersion: p.expectedVersion, businessType: p.businessType,
    businessDate: businessDate(text(p.businessDate)), note, hallId: entityId("hall", text(p.hallId)), customerId: entityId("customer", text(p.customerId)),
    salespersonId: p.salespersonId === null ? null : entityId("staff", text(p.salespersonId)), warehouseId: entityId("warehouse", text(p.warehouseId)), orderDiscount: text(p.orderDiscount), lines, settlements, ...responsibleIntent(p) };
  money(proposal.orderDiscount);
  requireDomain(proposal.businessType === "SALE" || money(proposal.orderDiscount) === 0n, "INDEPENDENT_RETURN_DISCOUNT", "Independent return/exchange whole discount must be zero");
  requireDomain(salesJsonByteLength(proposal) <= SALES_PREPARE_MAX_REQUEST_BYTES, "SALES_PAYLOAD_TOO_LARGE", "Preparation exceeds request budget"); return proposal;
}

export function parseNativeSalesSaveProposal(input:unknown):NativeSalesSaveProposal {
  const p=existingData(input,['salesId','businessType','businessDate','note','hallId','customerId','salespersonId','warehouseId','orderDiscount','lines','settlements', ...responsibleKeys(input)]);
  requireDomain(p.businessType==='SALE'||p.businessType==='RETURN'||p.businessType==='EXCHANGE','INVALID_HTTP_INPUT','Explicit sales type required');
  requireDomain(p.salesId===null||typeof p.salesId==='string','INVALID_HTTP_INPUT','Actual target or explicit new target required');
  requireDomain(p.note===null||typeof p.note==='string'&&p.note.length<=SALES_PREPARE_MAX_NOTE_LENGTH,'INVALID_HTTP_INPUT','Bounded note required');
  const lines=existingArray(p.lines,1,SALES_PREPARE_MAX_LINES).map(value=>{
    requireDomain(value!==null&&typeof value==='object','INVALID_HTTP_INPUT','Actual line required');
    const which=Object.hasOwn(value,'skuId')?'skuId':'spec';
    const l=existingData(value,['existingLineId',which,'quantity','dealPrice','pricingRule','discountTenths','isGift','zeroConfirmed']);
    requireDomain(typeof l.quantity==='string'&&quantity(l.quantity)!==0n&&(p.businessType!=='SALE'||quantity(l.quantity)>0n),'INVALID_SALES_QUANTITY','Actual signed quantity required');
    requireDomain(typeof l.isGift==='boolean'&&typeof l.zeroConfirmed==='boolean','UNKNOWN_PRICING_FACTS','Actual pricing intent required');
    requireDomain(l.pricingRule==='UNIT_PRICE'?l.discountTenths===null&&(l.isGift||typeof l.dealPrice==='string'):
      l.pricingRule==='DISCOUNT'&&l.dealPrice===null&&typeof l.discountTenths==='number'&&Number.isInteger(l.discountTenths)&&l.discountTenths>=0&&l.discountTenths<=100,'INVALID_LINE_DISCOUNT','Unambiguous pricing intent required');
    if(l.dealPrice!==null)money(l.dealPrice);
    return {...parseDocumentSkuSelection({[which]:l[which]}),existingLineId:l.existingLineId===null?null:entityId('salesLine',l.existingLineId as string),
      quantity:l.quantity,dealPrice:l.dealPrice as string|null,pricingRule:l.pricingRule as 'UNIT_PRICE'|'DISCOUNT',discountTenths:l.discountTenths as number|null,isGift:l.isGift,zeroConfirmed:l.zeroConfirmed};
  });
  const settlements=existingArray(p.settlements,0,3).map(value=>{
    const s=existingData(value,['existingSettlementId','paymentAccountId','paymentMethodId','direction','amount']);
    requireDomain(s.direction==='RECEIVE'||s.direction==='REFUND','INVALID_SETTLEMENT','Actual settlement direction required');
    return {existingSettlementId:s.existingSettlementId===null?null:entityId('settlement',s.existingSettlementId as string),paymentAccountId:entityId('paymentAccount',s.paymentAccountId as string),
      paymentMethodId:entityId('paymentMethod',s.paymentMethodId as string),direction:s.direction as 'RECEIVE'|'REFUND',amount:(money(s.amount),s.amount as string)};
  });
  const proposal:NativeSalesSaveProposal={salesId:p.salesId===null?null:entityId('sales',p.salesId as string),businessType:p.businessType,businessDate:businessDate(p.businessDate as string),
    note:p.note as string|null,hallId:entityId('hall',p.hallId as string),customerId:entityId('customer',p.customerId as string),salespersonId:p.salespersonId===null?null:entityId('staff',p.salespersonId as string),
    warehouseId:entityId('warehouse',p.warehouseId as string),orderDiscount:(money(p.orderDiscount),p.orderDiscount as string),lines,settlements,...responsibleIntent(p)};
  requireDomain(proposal.salesId!==null||lines.every(l=>l.existingLineId===null)&&settlements.every(s=>s.existingSettlementId===null),'INVALID_HTTP_INPUT','New document cannot adopt old rows');
  requireDomain(proposal.businessType==='SALE'||money(proposal.orderDiscount)===0n,'INDEPENDENT_RETURN_DISCOUNT','Independent return/exchange whole discount must be zero');
  requireDomain(salesJsonByteLength(proposal)<=SALES_PREPARE_MAX_REQUEST_BYTES,'SALES_PAYLOAD_TOO_LARGE','Bounded proposal required');return proposal;
}

/** Original pure money rules/current facts on the already-bound outer SAVE transaction. */
export async function prepareNativeSalesOnTransaction(dependencies:SalesDependencies,tx:SalesTransaction,actor:ActorContext,
  proposal:NativeSalesSaveProposal,documentId:string,stored:StoredSales|undefined,skuIds:readonly string[]):Promise<SalesDraft>{
  const previous=stored?.document,zero=minorAmount('0');
  requireDomain(!previous||previous.header.status==='DRAFT','INVALID_STATE','Only actual drafts can be edited');
  requireDomain(skuIds.length===proposal.lines.length,'INVALID_LINES','Resolved selections must retain current rows');
  const header={id:entityId('sales',documentId),number:previous?.header.number??sourceConfirmedCreateDocumentNumber('SALE',entityId('sales',documentId)),
    businessType:proposal.businessType,businessDate:businessDate(proposal.businessDate),hallId:entityId('hall',proposal.hallId),customerId:entityId('customer',proposal.customerId),
    salespersonId:proposal.salespersonId===null?null:entityId('staff',proposal.salespersonId),warehouseId:entityId('warehouse',proposal.warehouseId),note:proposal.note,orderDiscount:money(proposal.orderDiscount),grossAmount:zero,netDue:zero};
  const used=new Set<string>([documentId,...(previous?.lines.map(l=>l.id)??[]),...(previous?.settlements.map(s=>s.id)??[])]),pointers=new Set<string>(),fresh=new Set<string>();
  const nextId=<K extends 'salesLine'|'settlement'>(kind:K):EntityId<K>=>{const id=entityId(kind,dependencies.newId(kind));requireDomain(!used.has(id),'INVALID_ID','Distinct generated row identity required');used.add(id);return id;};
  const lines:SalesLineRow[]=proposal.lines.map((row,i)=>{
    const old=row.existingLineId===null?undefined:previous?.lines.find(l=>l.id===row.existingLineId);
    requireDomain(row.existingLineId===null||old?.isCurrent&&!pointers.has(row.existingLineId),'INVALID_HTTP_INPUT','Unique current owned line pointer required');
    if(row.existingLineId!==null)pointers.add(row.existingLineId);
    const skuId=entityId('sku',skuIds[i]!),retain=old?.skuId===skuId,id=retain?old.id:nextId('salesLine');if(!retain)fresh.add(id);
    return {id,salesId:header.id,lineNo:i+1,skuId,quantity:quantity(row.quantity),referencePrice:retain?old.referencePrice:null,
      dealPrice:row.dealPrice===null?zero:money(row.dealPrice),pricingRule:row.pricingRule,discountTenths:row.discountTenths,zeroConfirmed:row.zeroConfirmed,isGift:row.isGift,
      lineAmount:zero,allocatedDiscount:zero,isCurrent:true,snapshot:retain?{...old.snapshot}:{productCode:'',productName:'',colorName:'',fitName:'',sizeName:'',barcode:null}};
  });
  pointers.clear();
  const settlements=proposal.settlements.map((row,i)=>{
    const old=row.existingSettlementId===null?undefined:previous?.settlements.find(s=>s.id===row.existingSettlementId);
    requireDomain(row.existingSettlementId===null||old!==undefined&&!pointers.has(row.existingSettlementId),'INVALID_HTTP_INPUT','Unique owned settlement pointer required');
    if(row.existingSettlementId!==null)pointers.add(row.existingSettlementId);
    const retain=old?.paymentAccountId===row.paymentAccountId;
    if(retain)requireDomain(old.paymentMethodId===row.paymentMethodId,'IMMUTABLE_SETTLEMENT_METHOD','Retained method cannot change');
    return {id:retain?old.id:nextId('settlement'),salesId:header.id,lineNo:i+1,paymentAccountId:entityId('paymentAccount',row.paymentAccountId),paymentMethodId:entityId('paymentMethod',row.paymentMethodId),direction:row.direction,amount:money(row.amount)};
  });
  requireDomain(tx.getCurrentSalesSnapshots&&tx.getCurrentSalesReferenceFacts,'NATIVE_CATALOGUE_FACTS_UNAVAILABLE','Original current native facts required');
  const wanted=lines.filter(l=>fresh.has(l.id)),snapshots=wanted.length?await tx.getCurrentSalesSnapshots(wanted.map(l=>l.skuId)):new Map();
  const selected:SalesDraft={header,settlements,lines:lines.map(l=>{if(!fresh.has(l.id))return l;const snapshot=snapshots.get(l.skuId);requireDomain(snapshot,'SKU_UNAVAILABLE','Actual native snapshot required');return {...l,snapshot:{...snapshot}};})};
  const facts=await tx.getCurrentSalesReferenceFacts(selected);
  const priced=selected.lines.map(l=>{
    const sku=facts.skus.find(s=>s.id===l.skuId),product=sku&&facts.products.find(p=>p.id===sku.productId);
    requireDomain(product&&product.referencePrice!==undefined,'PRODUCT_PRICING_UNAVAILABLE','Complete current pricing required');
    const referencePrice=fresh.has(l.id)?product.referencePrice:l.referencePrice;let dealPrice=l.dealPrice;
    if(l.isGift){requireDomain(dealPrice===0n,'INVALID_GIFT_PRICE','Gift price must be zero');dealPrice=zero;}
    else if(l.pricingRule==='DISCOUNT'){requireDomain(referencePrice!==null,'PRODUCT_PRICING_UNAVAILABLE','Discount needs actual reference');dealPrice=discountUnitPrice(referencePrice,l.discountTenths!);}
    return {...l,referencePrice,dealPrice,lineAmount:multiplyMoney(dealPrice,l.quantity)};
  });
  const allocations=header.businessType==='SALE'?allocateSalesDiscount(priced.map(l=>l.lineAmount),header.orderDiscount):priced.map(()=>zero);
  const grossAmount=minorAmount(priced.reduce((s,l)=>s+l.lineAmount,0n).toString());
  requireDomain(grossAmount>=-999999999999999999n&&grossAmount<=999999999999999999n&&priced.every(l=>l.lineAmount>=-999999999999999999n&&l.lineAmount<=999999999999999999n),'MONEY_STORAGE_OVERFLOW','Actual amounts must fit storage');
  const draft:SalesDraft={header:{...header,grossAmount,netDue:minorAmount((grossAmount-header.orderDiscount).toString())},settlements,lines:priced.map((l,i)=>({...l,allocatedDiscount:allocations[i]!}))};
  await createNativeManualSalesBusinessRules().assertDraftChange(previous,draft,tx);await dependencies.rules.assertDraftChange(previous,draft,tx);
  const result=!previous&&tx.reserveRuntimeDocumentNumber?{...draft,header:{...draft.header,number:await tx.reserveRuntimeDocumentNumber({kind:'SALES',documentId:header.id,actorAccountId:actor.accountId})}}:draft;
  requireDomain(salesPreparedDraftFitsSaveBudget(result),'SALES_PAYLOAD_TOO_LARGE','Prepared SAVE exceeds original budget');return result;
}

/** No write or number-allocation port reaches either policy through this view.
 * A caught mutation attempt also poisons preparation; it cannot become success. */
function existingReadTransaction(original: SalesTransaction) {
  let active = true, attemptedWrite = false;
  const check = () => requireDomain(active, "TRANSACTION_CLOSED", "Preparation context closed");
  const denied = (): never => { attemptedWrite = true; throw Error("Existing sales preparation is read-only"); };
  const tx: SalesTransaction = Object.freeze({
    getCurrentSalesIdentity: (id: Parameters<SalesTransaction["getCurrentSalesIdentity"]>[0]) => { check(); return original.getCurrentSalesIdentity(id); },
    getSales: (id: Parameters<SalesTransaction["getSales"]>[0]) => { check(); return original.getSales(id); },
    getReceipt: (...args: Parameters<SalesTransaction["getReceipt"]>) => { check(); return original.getReceipt(...args); },
    getCurrentSalesSnapshots: (ids: Parameters<NonNullable<SalesTransaction["getCurrentSalesSnapshots"]>>[0]) => {
      check(); requireDomain(original.getCurrentSalesSnapshots, "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Native snapshot capability required"); return original.getCurrentSalesSnapshots(ids);
    },
    getCurrentSalesReferenceFacts: (document: Parameters<NonNullable<SalesTransaction["getCurrentSalesReferenceFacts"]>>[0]) => {
      check(); requireDomain(original.getCurrentSalesReferenceFacts, "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Native reference capability required"); return original.getCurrentSalesReferenceFacts(document);
    },
    putRuntimeSales: denied, insertReceipt: denied, putBalance: denied, appendLedger: denied, appendAudit: denied,
    reserveRuntimeDocumentNumber: denied, assertRuntimeDocumentNumber: denied, getBalance: denied, listSalesLedger: denied
  });
  return { tx, finish() { check(); requireDomain(!attemptedWrite, "NATIVE_CATALOGUE_FACTS_UNAVAILABLE", "Preparation policy attempted a forbidden write"); }, close() { active = false; } };
}

/** Independent opt-in provider. READ COMMITTED row/advisory locks are permitted;
 * this claims zero business DML, not a PostgreSQL READ ONLY transaction. */
export function createNativeSalesExistingPreparation(dependencies: SalesDependencies) {
  const nativeRules = createNativeManualSalesBusinessRules();
  return Object.freeze({ async prepareExisting(actorInput: ActorContext, input: NativeSalesExistingProposal): Promise<NativeSalesExistingPrepared> {
    const proposal = parseNativeSalesExistingProposal(input), actor = structuredClone(actorInput), salesId = entityId("sales", proposal.salesId), zero = minorAmount("0");
    return dependencies.unitOfWork.transaction(async original => {
      const scope = existingReadTransaction(original), tx = scope.tx, used = new Set<string>([salesId]);
      const nextId: SalesDependencies["newId"] = kind => {
        const id = entityId(kind, dependencies.newId(kind)); requireDomain(!used.has(id), "INVALID_ID", "New native preparation ids must be distinct from all retained identities"); used.add(id); return id;
      };
      try {
        requireDomain(!await tx.getReceipt(actor.accountId, `prepare-existing-sales:${nextId("operation")}`), "IDEMPOTENCY_CONFLICT", "Private preparation nonce already exists");
        const stored = await tx.getSales(salesId); requireDomain(stored, "DOCUMENT_NOT_FOUND", "Existing sales document unavailable");
        const previous = stored.document;
        await dependencies.authorization.assertAllowed(actor, "SAVE", previous, tx);
        requireDomain(stored.stockBasis === "RUNTIME_LEDGER", "HISTORICAL_POSTING_NOT_IMPLEMENTED", "Historical projections remain read-only history");
        requireDomain(previous.header.status === "DRAFT", "INVALID_STATE", "Only an existing draft may be prepared for SAVE");
        requireDomain(previous.header.version === proposal.expectedVersion, "VERSION_CONFLICT", "Existing document version changed");
        for (const row of [...previous.lines, ...previous.settlements]) used.add(row.id);
        const oldLines = new Map(previous.lines.map(row => [row.id as string, row])), oldSettlements = new Map(previous.settlements.map(row => [row.id as string, row]));
        const linePointers = new Set<string>(), settlementPointers = new Set<string>(), fresh = new Set<string>();
        const header = { id: salesId, number: previous.header.number, businessType: proposal.businessType, businessDate: businessDate(proposal.businessDate),
          hallId: entityId("hall", proposal.hallId), customerId: entityId("customer", proposal.customerId), salespersonId: proposal.salespersonId === null ? null : entityId("staff", proposal.salespersonId),
          warehouseId: entityId("warehouse", proposal.warehouseId), note: proposal.note, ...(proposal.responsibleStaffId === undefined ? {} : { responsibleStaffId: entityId("staff", proposal.responsibleStaffId) }), orderDiscount: money(proposal.orderDiscount), grossAmount: zero, netDue: zero };
        const lines: SalesLineRow[] = proposal.lines.map((row, index) => {
          const old = row.existingLineId === null ? undefined : oldLines.get(row.existingLineId);
          requireDomain(row.existingLineId === null || old?.salesId === salesId && old.isCurrent && !linePointers.has(row.existingLineId), "INVALID_HTTP_INPUT", "Existing line pointer must be unique, current and owned by this document");
          if (row.existingLineId !== null) linePointers.add(row.existingLineId);
          const retain = old?.skuId === row.skuId, id = retain ? old.id : nextId("salesLine"); if (!retain) fresh.add(id);
          return { id, salesId, lineNo: index + 1, skuId: entityId("sku", row.skuId), quantity: quantity(row.quantity),
            referencePrice: retain ? old.referencePrice : null, dealPrice: row.dealPrice === null ? zero : money(row.dealPrice), pricingRule: row.pricingRule,
            discountTenths: row.discountTenths, zeroConfirmed: row.zeroConfirmed, isGift: row.isGift, isCurrent: true,
            lineAmount: zero, allocatedDiscount: zero, snapshot: retain ? { ...old.snapshot } : { productCode: "", productName: "", colorName: "", fitName: "", sizeName: "", barcode: null } };
        });
        const settlements = proposal.settlements.map((row, index) => {
          const old = row.existingSettlementId === null ? undefined : oldSettlements.get(row.existingSettlementId);
          requireDomain(row.existingSettlementId === null || old?.salesId === salesId && !settlementPointers.has(row.existingSettlementId), "INVALID_HTTP_INPUT", "Existing settlement pointer must be unique and owned by this document");
          if (row.existingSettlementId !== null) settlementPointers.add(row.existingSettlementId);
          const retain = old?.paymentAccountId === row.paymentAccountId;
          if (retain) requireDomain(old.paymentMethodId !== null && old.paymentMethodId === row.paymentMethodId, "IMMUTABLE_SETTLEMENT_METHOD", "Retained same-account method cannot be replaced or inferred");
          return { id: retain ? old.id : nextId("settlement"), salesId, lineNo: index + 1, paymentAccountId: entityId("paymentAccount", row.paymentAccountId),
            paymentMethodId: entityId("paymentMethod", row.paymentMethodId), direction: row.direction, amount: money(row.amount) };
        });
        const skeleton: SalesDraft = { header, lines, settlements };
        await dependencies.authorization.assertAllowed(actor, "SAVE", skeleton, tx);
        const freshLines = lines.filter(row => fresh.has(row.id));
        const snapshots = freshLines.length ? await tx.getCurrentSalesSnapshots!(freshLines.map(row => row.skuId)) : new Map();
        const selected: SalesDraft = { ...skeleton, lines: lines.map(row => {
          if (!fresh.has(row.id)) return row; const snapshot = snapshots.get(row.skuId);
          requireDomain(snapshot, "SKU_UNAVAILABLE", "New or replaced line requires actual native MAIN snapshot"); return { ...row, snapshot: { ...snapshot } };
        }) };
        const facts = await tx.getCurrentSalesReferenceFacts!(selected), skus = new Map(facts.skus.map(row => [row.id, row])), products = new Map(facts.products.map(row => [row.id, row]));
        const priced = selected.lines.map(row => {
          const sku = skus.get(row.skuId), product = sku && products.get(sku.productId);
          requireDomain(product && product.referencePrice !== undefined, "PRODUCT_PRICING_UNAVAILABLE", "Current complete pricing facts required");
          const referencePrice = fresh.has(row.id) ? product.referencePrice : row.referencePrice; let dealPrice = row.dealPrice;
          if (row.isGift) { requireDomain(dealPrice === 0n, "INVALID_GIFT_PRICE", "Gift price must be explicit zero or absent"); dealPrice = zero; }
          else if (row.pricingRule === "DISCOUNT") { requireDomain(referencePrice !== null, "PRODUCT_PRICING_UNAVAILABLE", "Discount requires actual reference snapshot"); dealPrice = discountUnitPrice(referencePrice, row.discountTenths!); }
          return { ...row, referencePrice, dealPrice, lineAmount: multiplyMoney(dealPrice, row.quantity) };
        });
        const allocations = header.businessType === "SALE" ? allocateSalesDiscount(priced.map(row => row.lineAmount), header.orderDiscount) : priced.map(() => zero);
        const grossAmount = minorAmount(priced.reduce((sum, row) => sum + row.lineAmount, 0n).toString());
        requireDomain(grossAmount >= -999999999999999999n && grossAmount <= 999999999999999999n
          && priced.every(row => row.lineAmount >= -999999999999999999n && row.lineAmount <= 999999999999999999n), "MONEY_STORAGE_OVERFLOW", "Calculated amounts must fit existing decimal storage");
        const draft: SalesDraft = { header: { ...header, grossAmount, netDue: minorAmount((grossAmount - header.orderDiscount).toString()) }, lines: priced.map((row, index) => ({ ...row, allocatedDiscount: allocations[index]! })), settlements };
        await nativeRules.assertDraftChange(previous, draft, tx); await dependencies.rules.assertDraftChange(previous, draft, tx);
        requireDomain(salesPreparedDraftFitsSaveBudget(draft), "SALES_PAYLOAD_TOO_LARGE", "Prepared existing draft exceeds SAVE budget"); scope.finish();
        return structuredClone({ expectedVersion: previous.header.version, draft });
      } finally { scope.close(); }
    });
  } });
}
