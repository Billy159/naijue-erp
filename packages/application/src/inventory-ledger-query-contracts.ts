import type { BusinessDate, EntityId } from "../../domain/src/values.ts";
import type { InventoryQueryAuthorization, InventoryReadScope, InventorySelection } from "./inventory-query-contracts.ts";
import type { ActorContext } from "./ports.ts";

/** Technical response bound, not a business history or quantity limit. */
export const INVENTORY_LEDGER_MAX_PAGE_SIZE = 200;
export interface InventoryLedgerCursor { readonly postedAt: string; readonly entryId: EntityId<"ledger"> }
export interface InventoryLedgerQuery {
  readonly warehouseId: EntityId<"warehouse">; readonly skuId: EntityId<"sku">;
  readonly pageSize: number; readonly after: InventoryLedgerCursor | null;
}
export interface InventoryLedgerSku {
  readonly id: EntityId<"sku">; readonly code: string;
  readonly product: { readonly id: EntityId<"product">; readonly code: string; readonly name: string };
  readonly color: InventorySelection; readonly fit: InventorySelection & { readonly code: string };
  readonly sizeGroup: InventorySelection; readonly size: InventorySelection & { readonly code: string | null };
}
/** IDs are native provenance, not a grant to read the source document. No imported private payload is included.
 * The existing entity-ID vocabulary has no importBatch brand; importBatchId remains a validated UUID string. */
export type InventoryLedgerSource =
  | { readonly kind: "SALES"; readonly salesId: EntityId<"sales">; readonly salesLineId: EntityId<"salesLine">; readonly endpoint: "SALES_WAREHOUSE" }
  | { readonly kind: "TRANSFER"; readonly transferId: EntityId<"transfer">; readonly transferLineId: EntityId<"transferLine">; readonly endpoint: "FROM" | "TO" }
  | { readonly kind: "CUTOFF_BASELINE"; readonly importBatchId: string; readonly endpoint: "IMPORT_BASELINE" };
export interface InventoryLedgerEntry {
  readonly id: EntityId<"ledger">; readonly operationId: EntityId<"operation">; readonly eventKind: "APPROVE" | "UNAPPROVE" | "CUTOFF_BASELINE";
  readonly quantityDelta: string; readonly source: InventoryLedgerSource; readonly sourceDocumentVersion: number | null;
  readonly reversesEntryId: EntityId<"ledger"> | null; readonly businessDate: BusinessDate;
  /** Exact PostgreSQL UTC timestamp, always six fractional digits; never JS Date/millisecond truncation. */
  readonly postedAt: string;
}
export interface InventoryLedgerPage {
  readonly pageSize: number; readonly labelBasis: "CURRENT_REFERENCE";
  readonly warehouse: InventorySelection & { readonly hallId: EntityId<"hall"> };
  readonly sku: InventoryLedgerSku; readonly entries: readonly InventoryLedgerEntry[];
  readonly nextCursor: InventoryLedgerCursor | null;
}
export interface InventoryLedgerSnapshot { readonly readReference: string; readonly readiness: "ready"; readonly data: InventoryLedgerPage }
export interface InventoryLedgerScopedRead {
  readonly actor: ActorContext; readonly scope: InventoryReadScope; readonly parameters: InventoryLedgerQuery; readonly signal: AbortSignal;
}
/** Single exact authorized warehouse+SKU. One RR READ ONLY snapshot must verify native target identity,
 * published cutoff/key coverage, then read at most pageSize+1 native ledger rows. No whole-history preload,
 * reconstructed legacy effects, inferred zero, count/summary or source document detail read is required.
 * Keyset order is (posted_at DESC,id DESC). Cursors constrain only this exact target, never authorize it.
 * Signal checks prevent subsequent work; they do not claim cancellation of an already-running SQL query. */
export interface TrustedInventoryLedgerSnapshotReader { readLedger(read: InventoryLedgerScopedRead): Promise<InventoryLedgerSnapshot> }
export interface InventoryLedgerQueryDependencies {
  /** The SAME explicit inventory warehouse/hall policy provider. Service invokes it with one warehouse,
   * no catalogue filters, page 1, size 100; never with client labels or client actor/scope. */
  readonly authorization: InventoryQueryAuthorization;
  readonly reader: TrustedInventoryLedgerSnapshotReader;
}
