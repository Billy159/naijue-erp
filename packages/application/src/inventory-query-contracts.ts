import type { ActorContext } from "./ports.ts";
import type { EntityId } from "../../domain/src/values.ts";

/** Structurally matches the web inventory DTO, without importing UI/runtime code. */
export type InventoryPageSize = 100 | 200 | 500;
export type InventoryCandidateKind = "product" | "category" | "warehouse" | "supplier" | "fit" | "season";
export interface InventorySelection { readonly id: string; readonly label: string }
export type InventoryStockCell =
  | { readonly state: "known"; readonly skuId: string; readonly quantity: string }
  | { readonly state: "not-applicable" };
export interface InventoryStockTotal {
  readonly knownQuantity: string;
  readonly completeness: "complete";
  readonly unknownCells: 0;
}
export interface InventoryQueryRow {
  readonly warehouse: InventorySelection;
  readonly cells: Readonly<Record<string, InventoryStockCell>>;
  readonly total: InventoryStockTotal;
}
export interface InventoryQueryColorFit {
  readonly color: InventorySelection;
  readonly fit: InventorySelection;
  readonly rows: readonly InventoryQueryRow[];
  readonly sizeTotals: Readonly<Record<string, InventoryStockTotal>>;
  readonly total: InventoryStockTotal;
}
export interface InventoryQueryProduct {
  readonly id: string; readonly code: string; readonly name: string;
  readonly categoryLabel: string; readonly supplierLabel: string; readonly seasonLabel: string;
  readonly sizeGroup: InventorySelection;
  /** Exact source membership/order/full labels; never derive display size from code. */
  readonly sizes: readonly InventorySelection[];
  readonly colorFits: readonly InventoryQueryColorFit[];
  readonly sizeTotals: Readonly<Record<string, InventoryStockTotal>>;
  readonly total: InventoryStockTotal;
}
export interface InventoryQueryPage {
  readonly page: number; readonly pageSize: InventoryPageSize;
  readonly exactTotalProducts: number; readonly products: readonly InventoryQueryProduct[];
  readonly warehouseLabels: readonly string[];
  readonly allMatchesTotal: InventoryStockTotal;
  readonly readReference: string;
}
export interface InventoryOutputSummary {
  readonly kind: "summary"; readonly readReference: string; readonly exactTotalProducts: number;
  readonly warehouseLabels: readonly string[]; readonly allMatchesTotal: InventoryStockTotal;
}
export type InventoryOutputFrame = InventoryOutputSummary
  | { readonly kind: "product"; readonly product: InventoryQueryProduct }
  | { readonly kind: "complete"; readonly readReference: string; readonly exactTotalProducts: number;
      readonly emittedProducts: number; readonly allMatchesTotal: InventoryStockTotal };
// Existing DTO validation bounds, shared with the output decoder. These are
// per-product/chunk work bounds, never a maximum number of output products.
export const INVENTORY_MATRIX_CHUNK_MAX_UNITS = 1_000_000;
export const INVENTORY_PRODUCT_MAX_SIZES = 1000;
export const INVENTORY_PRODUCT_MAX_VARIANTS = 10000;
export const INVENTORY_TEXT_MAX_CHARS = 1000;
export const INVENTORY_TOTAL_MAX_CHARS = 100;
export const INVENTORY_SCOPE_MAX_ITEMS = 1000;
const outputWorstText = String.fromCharCode(0xd800).repeat(INVENTORY_TEXT_MAX_CHARS);
const outputWorstId = "00000000-0000-0000-0000-000000000000";
const outputWorstTotal = { knownQuantity: "9".repeat(INVENTORY_TOTAL_MAX_CHARS), unknownCells: 0, completeness: "complete" };
// These templates serialize to ASCII, including escaped unpaired surrogates:
// JSON string length is therefore its exact UTF-8 byte length.
const outputJsonBytes = (value: unknown): number => JSON.stringify(value).length;
const outputSelectionBytes = outputJsonBytes({ id: outputWorstId, label: outputWorstText });
const outputTotalEntryBytes = outputJsonBytes(outputWorstId) + 1 + outputJsonBytes(outputWorstTotal) + 1;
const outputCellEntryBytes = outputJsonBytes(outputWorstId) + 1 + outputJsonBytes({ state: "known", skuId: outputWorstId, quantity: "9".repeat(INVENTORY_TOTAL_MAX_CHARS) }) + 1;
const outputProductFixedBytes = outputJsonBytes({ id: outputWorstId, code: outputWorstText, name: outputWorstText, categoryLabel: outputWorstText, supplierLabel: outputWorstText, seasonLabel: outputWorstText,
  sizeGroup: { id: outputWorstId, label: outputWorstText }, sizes: [], colorFits: [], sizeTotals: {}, total: outputWorstTotal });
const outputVariantFixedBytes = outputJsonBytes({ color: { id: outputWorstId, label: outputWorstText }, fit: { id: outputWorstId, label: outputWorstText }, rows: [], sizeTotals: {}, total: outputWorstTotal }) + 1;
const outputRowFixedBytes = outputJsonBytes({ warehouse: { id: outputWorstId, label: outputWorstText }, cells: {}, total: outputWorstTotal }) + 1;
/** UTF-8 bytes excluding LF. Conservative mathematical bounds, not allocation
 * targets. Every row costs at least two work units (row plus one size cell),
 * and every variant size-total has at least one corresponding warehouse cell.
 * JSON escaping can use six bytes per UTF-16 code unit; an ordinary 8/32MiB
 * response limit cannot be substituted for this entire-output contract. */
export const INVENTORY_OUTPUT_FRAME_MAX_BYTES = Object.freeze({
  summary: outputJsonBytes({ kind: "summary", readReference: "r".repeat(200), exactTotalProducts: Number.MAX_SAFE_INTEGER, warehouseLabels: [], allMatchesTotal: outputWorstTotal })
    + INVENTORY_SCOPE_MAX_ITEMS * (outputJsonBytes(outputWorstText) + 1),
  product: outputJsonBytes({ kind: "product", product: {} }) + outputProductFixedBytes
    + INVENTORY_PRODUCT_MAX_SIZES * (outputSelectionBytes + 1 + outputTotalEntryBytes)
    + INVENTORY_PRODUCT_MAX_VARIANTS * outputVariantFixedBytes
    + Math.floor(INVENTORY_MATRIX_CHUNK_MAX_UNITS / 2) * outputRowFixedBytes
    + INVENTORY_MATRIX_CHUNK_MAX_UNITS * (outputCellEntryBytes + outputTotalEntryBytes),
  complete: outputJsonBytes({ kind: "complete", readReference: "r".repeat(200), exactTotalProducts: Number.MAX_SAFE_INTEGER, emittedProducts: Number.MAX_SAFE_INTEGER, allMatchesTotal: outputWorstTotal })
});
export function encodeInventoryOutputFrame(frame: InventoryOutputFrame): string { return JSON.stringify(frame) + "\n"; }
export interface InventoryQueryCandidate extends InventorySelection {
  readonly disabled?: boolean; readonly parentLabel?: string; readonly depth?: 0 | 1;
  /** Required only for product candidates; native projection, never parsed from label. */
  readonly code?: string; readonly name?: string;
  /** Required only for category candidates; null denotes a root. */
  readonly parentId?: string | null;
}
export interface InventoryCandidatePage {
  readonly items: readonly InventoryQueryCandidate[]; readonly exactTotal: number; readonly page: number;
}
/** Normalized immutable IDs only. Client selection labels never become reference or permission facts.
 * Every array is a positive OR selection; dimensions combine with AND inside the authorized scope.
 * Category IDs match their own category or its native direct children; [] adds no category predicate. */
export interface InventoryQuery {
  readonly filter: {
    readonly productIds: readonly EntityId<"product">[];
    readonly categoryIds: readonly EntityId<"category">[];
    readonly warehouseIds: readonly EntityId<"warehouse">[];
    readonly supplierIds: readonly EntityId<"supplier">[];
    readonly fitIds: readonly EntityId<"fit">[];
    readonly seasonIds: readonly EntityId<"season">[];
  };
  readonly page: number; readonly pageSize: InventoryPageSize;
}
export interface InventoryCandidateQuery {
  readonly kind: InventoryCandidateKind; readonly search: string;
  readonly page: number; readonly pageSize: 20;
  readonly selectedIds: readonly string[]; readonly categoryIds: readonly EntityId<"category">[];
}
export type InventoryReadIntent =
  | { readonly kind: "inventory"; readonly parameters: InventoryQuery }
  | { readonly kind: "candidates"; readonly parameters: InventoryCandidateQuery };
export interface InventoryAuthorizedWarehouse {
  readonly id: EntityId<"warehouse">; readonly hallId: EntityId<"hall">; readonly label: string;
}
/** Explicit finite scope, from trusted current policy/reference facts, never from request identity/labels.
 * hallIds and warehouses are an intersection, not an OR or a grant to an entire catalog.
 * Order is the authorized business warehouse display order. No empty/global/admin shortcut. */
export interface InventoryReadScope {
  readonly hallIds: readonly EntityId<"hall">[];
  readonly warehouses: readonly InventoryAuthorizedWarehouse[];
}
export interface InventoryQueryAuthorization {
  authorize(actor: ActorContext, intent: InventoryReadIntent, signal: AbortSignal): Promise<InventoryReadScope>;
}
export interface InventoryReadSnapshot<T> {
  /** Opaque bounded non-secret reference to this read. Never a credential or an import identifier guessed by the caller. */
  readonly readReference: string;
  /** Ready certifies the entire filtered authorized data scope, not just this page.
   * Incomplete import/coverage or unavailable facts must reject with INVENTORY_NOT_READY, never return partial data. */
  readonly readiness: "ready";
  readonly data: T;
}
export interface InventoryScopedRead<P> {
  readonly actor: ActorContext; readonly scope: InventoryReadScope;
  readonly parameters: P; readonly signal: AbortSignal;
}
/** Required production seam, NOT an in-memory production fallback.
 * Each invocation must obtain page, exact count, warehouse labels, readiness and FULL FILTER summary
 * in one consistent read snapshot (e.g. PostgreSQL read-only REPEATABLE READ). Apply the supplied
 * hall/warehouse intersection and all ID filters BEFORE count, paging, aggregates and candidates.
 * Inventory is paged by distinct product with stable (product_code COLLATE "C",id) ordering. Candidate ordering
 * must be stable for its exact filter; selectedIds is selection context, not an extra page or a grant.
 * Fetch page matrix facts in bounded set queries; never preload all products or issue per-product reads.
 * Publish only after proving the entire authorized filtered catalog and stock dataset complete.
 * In that verified published scope, an existing SKU with no stock/balance is exact zero; an absent
 * four-dimensional SKU is not-applicable. Unproven absence, missing proof, incomplete imports,
 * corruption and failed reads must reject the whole query, never become zero or partial cells.
 * This proof belongs to this trusted reader, not to the client. Preserve negative quantities and source size order.
 * The current minimal schema has no approved baseline-coverage/readiness persistence; this contract
 * does not assert a PostgreSQL implementation exists. Signal forwarding does NOT prove SQL cancellation.
 */
export interface TrustedInventorySnapshotReader {
  readInventory(read: InventoryScopedRead<InventoryQuery>): Promise<InventoryReadSnapshot<InventoryQueryPage>>;
  readCandidates(read: InventoryScopedRead<InventoryCandidateQuery>): Promise<InventoryReadSnapshot<InventoryCandidatePage>>;
  /** Complete executed filter in one RR snapshot, with bounded native product batches.
   * The final complete frame is emitted only after confirmed read COMMIT.
   * Ordinary page-only providers may omit output; absence never grants a partial export. */
  readInventoryOutput?(read: InventoryScopedRead<InventoryQuery>): AsyncIterable<InventoryOutputFrame>;
}
export interface InventoryQueryDependencies {
  readonly authorization: InventoryQueryAuthorization;
  readonly reader: TrustedInventorySnapshotReader;
}
