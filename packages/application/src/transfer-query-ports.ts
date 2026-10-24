import type { DocumentListIdentity, DocumentHistoryCoverage } from "./sales-query-ports.ts";
import type { DocumentStatus } from "../../domain/src/documents.ts";
import type { BusinessDate, EntityId, Version } from "../../domain/src/values.ts";
import type { RuntimeTransferHeader, TransferAction, TransferActor, TransferDocument, TransferRole } from "./transfer-ports.ts";

/** Technical response bound; frozen UI choices are 20/50/100/200, not additional API business limits. */
export const TRANSFER_QUERY_MAX_PAGE_SIZE = 200;
export interface TransferQueryFilter {
  readonly startDate: BusinessDate | null; readonly endDate: BusinessDate | null;
  readonly statuses: readonly DocumentStatus[];
  readonly fromWarehouseIds: readonly EntityId<"warehouse">[]; readonly toWarehouseIds: readonly EntityId<"warehouse">[];
  /** Literal case-insensitive substring through native lower(), never a SQL LIKE pattern. */
  readonly number: string | null;
}
export interface TransferListQuery { readonly filter: TransferQueryFilter; readonly page: number; readonly pageSize: number }
/** Search and selected-ID lookup are exclusive; IDs narrow references and never grant access. */
export interface TransferWarehouseQuery { readonly search: string; readonly selectedIds: readonly EntityId<"warehouse">[]; readonly page: number; readonly pageSize: number }
export interface TransferWarehouseReference { readonly id: EntityId<"warehouse">; readonly name: string; readonly hallId: EntityId<"hall">; readonly hallName: string; readonly enabled: boolean; readonly hallEnabled: boolean }
export interface TransferWarehousePage { readonly page: number; readonly pageSize: number; readonly exactTotal: bigint; readonly items: readonly TransferWarehouseReference[] }
export interface TransferDetailQuery { readonly transferId: EntityId<"transfer"> }
export interface TransferHistoryQuery { readonly transferId: EntityId<"transfer">; readonly page: number; readonly pageSize: number }
/** Actual audit metadata only. No source HISTORY rows, private JSON or receipt substitution. */
export interface TransferHistoryEntry {
  readonly id: EntityId<"audit">; readonly operationId: EntityId<"operation">; readonly actorAccountId: EntityId<"account">;
  readonly action: TransferAction; readonly occurredAt: string; readonly oldVersion: Version | null; readonly newVersion: Version;
}
export interface TransferHistoryPage extends TransferHistoryQuery { readonly exactTotal: bigint; readonly items: readonly TransferHistoryEntry[] }
export type TransferReadIntent = { readonly kind: "list"; readonly parameters: TransferListQuery }
  | { readonly kind: "history"; readonly parameters: TransferHistoryQuery }
  | { readonly kind: "detail"; readonly parameters: TransferDetailQuery }
  | { readonly kind: "warehouses"; readonly parameters: TransferWarehouseQuery };
/** An intersection of trusted constraints; the full grant is the union of clauses.
 * Endpoint hall facts come from native warehouses; creation role/hall are immutable header snapshots.
 * Request filters cannot grant visibility. No empty clause or implicit global grant is valid. */
export interface TransferReadScopeClause {
  readonly fromHallId?: EntityId<"hall">; readonly toHallId?: EntityId<"hall">;
  readonly fromWarehouseId?: EntityId<"warehouse">; readonly toWarehouseId?: EntityId<"warehouse">;
  readonly createdByAccountId?: EntityId<"account">; readonly createdHallId?: EntityId<"hall">; readonly createdRole?: TransferRole;
}
export type TransferReadScope = { readonly kind: "all" } | { readonly kind: "restricted"; readonly clauses: readonly TransferReadScopeClause[] };
export interface TransferQueryAuthorization { authorize(actor: TransferActor, intent: TransferReadIntent, signal: AbortSignal): Promise<TransferReadScope> }
export interface TransferScopedRead<P> { readonly actor: TransferActor; readonly scope: TransferReadScope; readonly parameters: P; readonly signal: AbortSignal }
/** Names are current native reference names, not inferred historical names or saved line labels. */
export interface TransferReferenceNames {
  readonly fromWarehouseName: string; readonly toWarehouseName: string;
  readonly fromHallName: string; readonly toHallName: string;
  readonly responsibleName: string | null;
  readonly createdByName: string; readonly approvedByName: string | null;
}
export type TransferSummary = Pick<RuntimeTransferHeader, "id" | "number" | "businessDate" | "fromWarehouseId" | "toWarehouseId" | "status" | "version" | "createdByAccountId" | "createdAt" | "updatedAt" | "responsibleStaffId"> & TransferReferenceNames & { readonly totalQuantity: bigint };
/** Exact count is serialized as a decimal string, not an unsafe JS number. */
export interface TransferListPage { readonly page: number; readonly pageSize: number; readonly exactTotal: bigint; readonly items: readonly TransferSummary[] }
/** Explicit exact26 normal-list projection; historical unknowns never weaken LIVE headers. */
export type TransferUnifiedSummary = (TransferSummary & DocumentListIdentity & { readonly dataset: "LIVE"; readonly batchId: null })
  | (Omit<TransferSummary, "businessDate" | "createdByAccountId" | "createdAt" | "updatedAt" | "createdByName" | "fromWarehouseName" | "toWarehouseName" | "fromHallName" | "toHallName" | "totalQuantity"> & DocumentListIdentity & {
    readonly dataset: "HISTORY"; readonly batchId: string; readonly businessDate: BusinessDate | null; readonly createdByAccountId: null;
    readonly createdAt: string | null; readonly updatedAt: string | null; readonly createdLocalAt: string | null; readonly updatedLocalAt: string | null;
    readonly createdByName: string | null; readonly fromWarehouseName: string | null; readonly toWarehouseName: string | null;
    readonly fromHallName: string | null; readonly toHallName: string | null; readonly totalQuantity: bigint | null;
  });
export interface TransferUnifiedListPage {
  readonly page: number; readonly pageSize: number; readonly exactTotal: bigint; readonly items: readonly TransferUnifiedSummary[];
  readonly historyCoverage: DocumentHistoryCoverage; readonly totals: { readonly totalQuantity: bigint | null };
}
/** Current native identities/labels, never replacements for saved line snapshots.
 * Includes every native SKU size in each current-line product/color/FIT tuple, not unrelated tuples. */
export interface TransferCatalogSku {
  readonly skuId: EntityId<"sku">; readonly productId: EntityId<"product">; readonly productCode: string; readonly productName: string;
  readonly colorId: EntityId<"color">; readonly colorName: string; readonly fitId: EntityId<"fit">; readonly fitName: string;
  readonly sizeId: EntityId<"size">; readonly sizeGroupId: EntityId<"sizeGroup">;
}
export interface TransferCatalogSizeGroup {
  readonly sizeGroupId: EntityId<"sizeGroup">; readonly code: string; readonly name: string;
  readonly members: readonly { readonly sizeId: EntityId<"size">; readonly code: string | null; readonly name: string; readonly displayOrder: number }[];
}
export interface TransferDetailCatalog { readonly skus: readonly TransferCatalogSku[]; readonly sizeGroups: readonly TransferCatalogSizeGroup[] }
export interface TransferDetail {
  /** Current actual lines only, retaining native SKU identity and persisted display snapshots. */
  readonly document: TransferDocument; readonly stockBasis: "RUNTIME_LEDGER" | "CUTOFF_HISTORY";
  readonly references: TransferReferenceNames;
  readonly catalog: TransferDetailCatalog;
}
/** One consistent read snapshot per call. Apply authorization before count, paging, and child reads.
 * Fixed-count native relation queries only: no legacy projections, eager catalog, N+1 or write commands.
 * Abort checks stop subsequent work, not an already-running driver query. */
export interface TrustedTransferSnapshotReader {
  /** Older independent readers remain structurally valid; history fails closed when absent. */
  readHistory?(read: TransferScopedRead<TransferHistoryQuery>): Promise<TransferHistoryPage>;
  readList(read: TransferScopedRead<TransferListQuery>): Promise<TransferListPage | TransferUnifiedListPage>;
  readDetail(read: TransferScopedRead<TransferDetailQuery>): Promise<TransferDetail>;
  readWarehouses(read: TransferScopedRead<TransferWarehouseQuery>): Promise<TransferWarehousePage>;
}
export interface TransferQueryDependencies { readonly authorization: TransferQueryAuthorization; readonly reader: TrustedTransferSnapshotReader }
