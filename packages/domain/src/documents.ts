import type { BusinessDate, EntityId, MinorAmount, Quantity, Version } from "./values.ts";

export type DocumentStatus = "DRAFT" | "APPROVED" | "VOID";
export type SalesBusinessType = "SALE" | "RETURN" | "EXCHANGE";
export type SalesPricingRule = "UNIT_PRICE" | "DISCOUNT";
export interface SkuSnapshot {
  readonly productCode: string; readonly productName: string; readonly colorName: string;
  readonly fitName: string; readonly sizeName: string; readonly barcode: string | null;
}
export interface SalesHeaderRow {
  readonly id: EntityId<"sales">; readonly number: string; readonly businessType: SalesBusinessType;
  readonly businessDate: BusinessDate; readonly hallId: EntityId<"hall">; readonly customerId: EntityId<"customer">;
  readonly salespersonId: EntityId<"staff"> | null; readonly warehouseId: EntityId<"warehouse">;
  readonly status: DocumentStatus; readonly version: Version;
  readonly grossAmount: MinorAmount; readonly orderDiscount: MinorAmount; readonly netDue: MinorAmount;
  readonly note: string | null; readonly createdByAccountId: EntityId<"account">;
  readonly createdHallId: EntityId<"hall"> | null; readonly createdAt: string; readonly updatedAt: string;
  readonly approvedByAccountId: EntityId<"account"> | null; readonly approvedAt: string | null;
}
/** Signed integer quantity. Candidate adapter maps RETURN and EXCHANGE to independent signed-row economics. */
export interface SalesLineRow {
  readonly id: EntityId<"salesLine">; readonly salesId: EntityId<"sales">; readonly lineNo: number;
  readonly skuId: EntityId<"sku">; readonly quantity: Quantity; readonly referencePrice: MinorAmount | null;
  readonly dealPrice: MinorAmount;
  /** Null marks pre-0002 unknown metadata, never inferred confirmation or pricing intent. New active commands require explicit values. */
  readonly pricingRule: SalesPricingRule | null; readonly discountTenths: number | null; readonly zeroConfirmed: boolean | null;
  /** Gross = signed quantity × deal price; net is lineAmount − allocatedDiscount. */
  readonly lineAmount: MinorAmount; readonly allocatedDiscount: MinorAmount;
  readonly isGift: boolean; readonly snapshot: SkuSnapshot; readonly isCurrent: boolean;
}
export interface SalesSettlementRow {
  readonly id: EntityId<"settlement">; readonly salesId: EntityId<"sales">; readonly lineNo: number;
  readonly paymentAccountId: EntityId<"paymentAccount">;
  /** Original selected method identity; NULL only represents unknown stored history, never runtime intent. */
  readonly paymentMethodId: EntityId<"paymentMethod"> | null; readonly direction: "RECEIVE" | "REFUND";
  readonly amount: MinorAmount;
}
export interface SalesDocument {
  readonly header: SalesHeaderRow;
  readonly lines: readonly SalesLineRow[];
  readonly settlements: readonly SalesSettlementRow[];
}
export type SalesDraftHeader = Omit<SalesHeaderRow, "status" | "version" | "createdByAccountId" | "createdHallId" | "createdAt" | "updatedAt" | "approvedByAccountId" | "approvedAt">;
export interface SalesDraft { readonly header: SalesDraftHeader; readonly lines: readonly SalesLineRow[]; readonly settlements: readonly SalesSettlementRow[] }

export interface TransferHeaderRow {
  readonly id: EntityId<"transfer">; readonly number: string; readonly businessDate: BusinessDate;
  readonly fromWarehouseId: EntityId<"warehouse">; readonly toWarehouseId: EntityId<"warehouse">;
  readonly status: DocumentStatus; readonly version: Version;
}
export interface TransferLineRow {
  readonly id: EntityId<"transferLine">; readonly transferId: EntityId<"transfer">; readonly lineNo: number;
  readonly skuId: EntityId<"sku">; readonly quantity: Quantity; readonly snapshot: SkuSnapshot; readonly isCurrent: boolean;
}
