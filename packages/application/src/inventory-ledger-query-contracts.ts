import type { BusinessDate, EntityId } from "../../domain/src/values.ts";
import type { InventoryQueryAuthorization, InventoryReadScope, InventorySelection } from "./inventory-query-contracts.ts";
import type { ActorContext } from "./ports.ts";

/** Technical response bound, not a business history or quantity limit. */
export const INVENTORY_LEDGER_MAX_PAGE_SIZE = 200;
export interface InventoryLedgerCursor { readonly postedAt: string; readonly entryId: EntityId<"ledger"> }
export const INVENTORY_LEDGER_BUSINESS_TYPES = ["BASELINE", "TRANSFER_IN", "TRANSFER_OUT", "SALE", "RETURN", "EXCHANGE", "UNKNOWN"] as const;
export type InventoryLedgerBusinessType = typeof INVENTORY_LEDGER_BUSINESS_TYPES[number];
export interface InventoryLedgerFilter {
  /** Display date: baseline businessDate; otherwise postedAt in Asia/Shanghai. Inclusive. */
  readonly dateFrom: string | null; readonly dateTo: string | null;
  readonly businessType: InventoryLedgerBusinessType | null;
  /** Literal case-insensitive source-number substring; PostgreSQL lower uses the DB locale. */
  readonly source: string;
}
export interface InventoryLedgerQuery {
  readonly warehouseId: EntityId<"warehouse">; readonly skuId: EntityId<"sku">;
  readonly pageSize: number; readonly after: InventoryLedgerCursor | null;
  /** Original endpoint numbered mode; page/filter occur together, pageSize=20 and after=null. */
  readonly page?: number; readonly filter?: InventoryLedgerFilter;
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
  | { readonly kind: "HISTORY_REVISION"; readonly documentKind: "SALES"; readonly revisionId: EntityId<"operation">; readonly salesId: EntityId<"sales">; readonly salesLineId: EntityId<"salesLine">; readonly endpoint: "SALES_WAREHOUSE" }
  | { readonly kind: "HISTORY_REVISION"; readonly documentKind: "TRANSFER"; readonly revisionId: EntityId<"operation">; readonly transferId: EntityId<"transfer">; readonly transferLineId: EntityId<"transferLine">; readonly endpoint: "FROM" | "TO" }
  | { readonly kind: "CUTOFF_BASELINE"; readonly importBatchId: string; readonly endpoint: "IMPORT_BASELINE" };
export interface InventoryLedgerEntry {
  readonly id: EntityId<"ledger">; readonly operationId: EntityId<"operation">; readonly eventKind: "APPROVE" | "UNAPPROVE" | "CUTOFF_BASELINE" | "HISTORY_REVISION";
  readonly quantityDelta: string; readonly source: InventoryLedgerSource; readonly sourceDocumentVersion: number | null;
  readonly reversesEntryId: EntityId<"ledger"> | null; readonly businessDate: BusinessDate;
  /** Exact PostgreSQL UTC timestamp, always six fractional digits; never JS Date/millisecond truncation. */
  readonly postedAt: string;
  /** Present only for numbered mode; missing transition facts never become inferred zeroes. */
  readonly display?: {
    readonly date: string; readonly businessType: InventoryLedgerBusinessType;
    readonly sourceNumber: string | null;
    readonly operator: { readonly accountId: string | null; readonly name: string | null; readonly labelBasis: "CURRENT_REFERENCE" };
    readonly balanceTransition: { readonly state: "UNKNOWN"; readonly before: null; readonly after: null; readonly reason: "NO_RECORDED_BALANCE_TRANSITION" };
    /** Provenance does not confer document visibility. The destination must independently authorize. */
    readonly navigation: "NOT_CHECKED";
  };
}
export interface InventoryLedgerPage {
  readonly pageSize: number; readonly labelBasis: "CURRENT_REFERENCE";
  readonly warehouse: InventorySelection & { readonly hallId: EntityId<"hall"> };
  readonly sku: InventoryLedgerSku; readonly entries: readonly InventoryLedgerEntry[];
  readonly nextCursor: InventoryLedgerCursor | null;
  readonly page?: number; readonly filteredTotal?: string;
}
export interface InventoryLedgerSnapshot { readonly readReference: string; readonly readiness: "ready"; readonly data: InventoryLedgerPage }
export interface InventoryLedgerScopedRead {
  readonly actor: ActorContext; readonly scope: InventoryReadScope; readonly parameters: InventoryLedgerQuery; readonly signal: AbortSignal;
}
/** Single exact authorized warehouse+SKU. One RR READ ONLY snapshot must verify native target identity,
 * published cutoff/key coverage, then read at most pageSize+1 native ledger rows. No whole-history preload,
 * reconstructed legacy effects or inferred zero. Numbered mode counts the same filtered key in this snapshot.
 * Keyset order is (posted_at DESC,id DESC). Cursors constrain only this exact target, never authorize it.
 * Signal checks prevent subsequent work; they do not claim cancellation of an already-running SQL query. */
export interface TrustedInventoryLedgerSnapshotReader { readLedger(read: InventoryLedgerScopedRead): Promise<InventoryLedgerSnapshot> }
export interface InventoryLedgerQueryDependencies {
  /** The SAME explicit inventory warehouse/hall policy provider. Service invokes it with one warehouse,
   * no catalogue filters, page 1, size 100; never with client labels or client actor/scope. */
  readonly authorization: InventoryQueryAuthorization;
  readonly reader: TrustedInventoryLedgerSnapshotReader;
}
