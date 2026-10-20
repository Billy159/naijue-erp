import type { DocumentStatus } from "../../domain/src/documents.ts";
import type { BusinessDate, EntityId } from "../../domain/src/values.ts";
import type { RuntimeTransferHeader, TransferActor, TransferDocument, TransferRole } from "./transfer-ports.ts";

/** Technical response bound only. Transfer Demo page-size choices remain unconfirmed. */
export const TRANSFER_QUERY_MAX_PAGE_SIZE = 200;
export interface TransferQueryFilter {
  readonly startDate: BusinessDate | null; readonly endDate: BusinessDate | null;
  readonly status: DocumentStatus | null;
  readonly fromWarehouseId: EntityId<"warehouse"> | null; readonly toWarehouseId: EntityId<"warehouse"> | null;
  /** Literal, case-sensitive substring, never a SQL LIKE pattern. Matching policy is provisional. */
  readonly number: string | null;
}
export interface TransferListQuery { readonly filter: TransferQueryFilter; readonly page: number; readonly pageSize: number }
export interface TransferDetailQuery { readonly transferId: EntityId<"transfer"> }
export type TransferReadIntent = { readonly kind: "list"; readonly parameters: TransferListQuery }
  | { readonly kind: "detail"; readonly parameters: TransferDetailQuery };
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
/** Names are current reference names, not inferred historical names or line-catalog hydration. */
export interface TransferReferenceNames {
  readonly fromWarehouseName: string; readonly toWarehouseName: string;
  readonly fromHallName: string; readonly toHallName: string;
  readonly createdByName: string; readonly approvedByName: string | null;
}
export type TransferSummary = Pick<RuntimeTransferHeader, "id" | "number" | "businessDate" | "fromWarehouseId" | "toWarehouseId" | "status" | "version" | "createdByAccountId" | "createdAt"> & TransferReferenceNames;
/** Exact count is serialized as a decimal string, not an unsafe JS number. */
export interface TransferListPage { readonly page: number; readonly pageSize: number; readonly exactTotal: bigint; readonly items: readonly TransferSummary[] }
export interface TransferDetail {
  /** Current actual lines only, retaining native SKU identity and persisted display snapshots. */
  readonly document: TransferDocument; readonly stockBasis: "RUNTIME_LEDGER" | "CUTOFF_HISTORY";
  readonly references: TransferReferenceNames;
}
/** One consistent read snapshot per call. Apply authorization before count, paging, and child reads.
 * Fixed-count native relation queries only: no legacy projections, eager catalog, N+1 or write commands.
 * Abort checks stop subsequent work, not an already-running driver query. */
export interface TrustedTransferSnapshotReader {
  readList(read: TransferScopedRead<TransferListQuery>): Promise<TransferListPage>;
  readDetail(read: TransferScopedRead<TransferDetailQuery>): Promise<TransferDetail>;
}
export interface TransferQueryDependencies { readonly authorization: TransferQueryAuthorization; readonly reader: TrustedTransferSnapshotReader }
