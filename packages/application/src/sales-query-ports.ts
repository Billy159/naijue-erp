import type { ActorContext, SalesAction } from "./ports.ts";
import type { DocumentStatus, SalesBusinessType, SalesDocument, SalesHeaderRow } from "../../domain/src/documents.ts";
import type { BusinessDate, EntityId, MinorAmount, Version } from "../../domain/src/values.ts";

export type SalesQueryPageSize = 20 | 50 | 100 | 200;
/** Request bound, not a business master-data or authorization limit. */
export const SALES_QUERY_MAX_FILTER_IDS = 1000;
export interface SalesQueryFilter {
  readonly startDate: BusinessDate | null; readonly endDate: BusinessDate | null;
  /** OR within each unique selection list, AND across dimensions and trusted scope.
   * Empty lists add no restriction. Native business types remain distinct; the
   * Demo's 退货/换货 selection projects to [RETURN, EXCHANGE] at the UI boundary. */
  readonly statuses: readonly DocumentStatus[]; readonly businessTypes: readonly SalesBusinessType[];
  readonly hallIds: readonly EntityId<"hall">[]; readonly salespersonIds: readonly EntityId<"staff">[];
  readonly customerIds: readonly EntityId<"customer">[]; readonly warehouseIds: readonly EntityId<"warehouse">[];
  /** Case-insensitive literal substring, not a SQL LIKE pattern. PostgreSQL lower
   * follows its database locale; exact browser Unicode lowercase equivalence is
   * not promised. The original parameter text is preserved, never a SQL pattern. */
  readonly number: string | null;
}
export interface SalesListQuery { readonly filter: SalesQueryFilter; readonly page: number; readonly pageSize: SalesQueryPageSize }
/** Historical SALES FILTER candidates only, not create/edit business-form eligibility.
 * Candidates are DISTINCT references observed on authorized sales headers, including disabled
 * historical references. Unused/unauthorized master records are never enumerated. */
export type SalesFilterReferenceKind = "hall" | "salesperson" | "customer" | "warehouse";
export interface SalesFilterReferenceQuery {
  readonly kind: SalesFilterReferenceKind;
  /** Literal name substring; customer search also includes the native customer code. */
  readonly search: string; readonly page: number; readonly pageSize: 20;
}
export interface SalesFilterReference { readonly id: string; readonly label: string }
export interface SalesFilterReferencePage { readonly page: number; readonly exactTotal: bigint; readonly items: readonly SalesFilterReference[] }
export interface SalesDetailQuery { readonly salesId: EntityId<"sales"> }
export interface SalesHistoryQuery extends SalesDetailQuery { readonly page: number; readonly pageSize: SalesQueryPageSize }
export type SalesReadIntent =
  | { readonly kind: "list" | "settlement-statistics"; readonly parameters: SalesListQuery }
  | { readonly kind: "detail"; readonly parameters: SalesDetailQuery }
  | { readonly kind: "history"; readonly parameters: SalesHistoryQuery };
/** A clause is an intersection; the clauses are a union. At least one explicit constraint per clause.
 * These are trusted policy facts, not request filters. The adapter never infers roles or hall grants.
 * The explicit all variant is only for a trusted policy that actually grants full business visibility. */
export interface SalesReadScopeClause {
  readonly hallId?: EntityId<"hall">; readonly warehouseId?: EntityId<"warehouse">;
  readonly salespersonId?: EntityId<"staff">; readonly createdByAccountId?: EntityId<"account">;
  readonly createdHallId?: EntityId<"hall">;
}
export type SalesReadScope = { readonly kind: "all" } | { readonly kind: "restricted"; readonly clauses: readonly SalesReadScopeClause[] };
export interface SalesQueryAuthorization { authorize(actor: ActorContext, intent: SalesReadIntent, signal: AbortSignal): Promise<SalesReadScope> }
export interface SalesScopedRead<P> { readonly actor: ActorContext; readonly scope: SalesReadScope; readonly parameters: P; readonly signal: AbortSignal }
/** Current actual, non-gift signed row quantities only. These sums are not bounded by
 * one bigint persistence row. Incoming/outgoing are independent absolute totals;
 * quantity = outgoingQuantity - incomingQuantity, not an inferred business type. */
export interface SalesSummaryQuantities {
  readonly quantity: bigint; readonly incomingQuantity: bigint; readonly outgoingQuantity: bigint;
}
export type SalesSummary = Pick<SalesHeaderRow, "id" | "number" | "businessType" | "businessDate" | "hallId" | "salespersonId" | "customerId" | "warehouseId" | "status" | "version" | "grossAmount" | "orderDiscount" | "netDue" | "updatedAt"> & SalesSummaryQuantities & {
  readonly hallName: string; readonly warehouseName: string; readonly customerName: string; readonly salespersonName: string | null;
};
// The native line snapshot has no historical category. No category summary is
// exposed or reconstructed from today's product catalog.
/** Exact bigint counts serialize as decimal strings at the HTTP boundary, never unsafe JS numbers. */
export interface SalesListPage { readonly page: number; readonly pageSize: SalesQueryPageSize; readonly exactTotal: bigint; readonly items: readonly SalesSummary[] }
export interface SalesSettlementNames {
  readonly settlementId: EntityId<"settlement">; readonly paymentAccountId: EntityId<"paymentAccount">;
  /** Authoritative historical display, captured by the document write, not refreshed from master names. */
  readonly accountNameSnapshot: string; readonly methodNameSnapshot: string;
  /** Current master names in the same snapshot, explicitly not historical display facts. */
  readonly currentAccountName: string; readonly currentMethodName: string;
}
export interface SalesDetail {
  /** Current actual lines only. Inactive provenance remains in persistence, not the editable detail. */
  readonly document: SalesDocument; readonly stockBasis: "RUNTIME_LEDGER" | "CUTOFF_HISTORY";
  /** Current master names, including disabled references, in this document's authorized snapshot. */
  readonly referenceNames: Pick<SalesSummary, "hallName" | "salespersonName" | "customerName" | "warehouseName">;
  readonly settlementNames: readonly SalesSettlementNames[];
}
/** Operation history is metadata, not arbitrary persisted JSON or a document-catalog projection.
 * Native before/after audit evidence remains append-only in storage; no private request hashes are exposed. */
export interface SalesHistoryEntry {
  readonly id: EntityId<"audit">; readonly operationId: EntityId<"operation">; readonly actorAccountId: EntityId<"account">;
  readonly action: SalesAction; readonly occurredAt: string; readonly oldVersion: Version | null; readonly newVersion: Version;
}
export interface SalesHistoryPage { readonly salesId: EntityId<"sales">; readonly page: number; readonly pageSize: SalesQueryPageSize; readonly exactTotal: bigint; readonly items: readonly SalesHistoryEntry[] }
export interface SalesSettlementAccountTotal { readonly paymentAccountId: EntityId<"paymentAccount">; readonly received: MinorAmount; readonly refunded: MinorAmount }
export interface SalesSettlementStatistics {
  readonly page: number; readonly pageSize: SalesQueryPageSize; readonly exactTotalAccounts: bigint; readonly exactApprovedDocuments: bigint;
  /** Full authorized/filter scope, not just this account page. These are document flows, NOT account balances. */
  readonly received: MinorAmount; readonly refunded: MinorAmount; readonly accounts: readonly SalesSettlementAccountTotal[];
}
/** Each invocation must apply policy scope BEFORE count, pagination and sums, using one consistent
 * read snapshot. Page native relations directly and fetch detail facts in bounded set queries.
 * No eager product catalog, document hydration loop, per-document queries or implicit global role.
 * Signal checks bound callback work; they do not assert the driver cancels an already-running SQL query. */
export interface TrustedSalesSnapshotReader {
  /** Reuses current LIST authorization with a neutral bounded query. No new role/hall grants or
   * master-catalog permissions. Scope precedes count, search, DISTINCT and pagination. */
  readReferences(read: SalesScopedRead<SalesFilterReferenceQuery>): Promise<SalesFilterReferencePage>;
  readList(read: SalesScopedRead<SalesListQuery>): Promise<SalesListPage>;
  readDetail(read: SalesScopedRead<SalesDetailQuery>): Promise<SalesDetail>;
  readHistory(read: SalesScopedRead<SalesHistoryQuery>): Promise<SalesHistoryPage>;
  readSettlementStatistics(read: SalesScopedRead<SalesListQuery>): Promise<SalesSettlementStatistics>;
}
export interface SalesQueryDependencies { readonly authorization: SalesQueryAuthorization; readonly reader: TrustedSalesSnapshotReader }
