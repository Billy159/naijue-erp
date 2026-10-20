import type { QueryRead } from '../loading/latest-query.ts';

/** Read DTO only. No URL, authentication token, mutable cache, write or stock adjustment. */
export type InventoryPageSize = 100 | 200 | 500;
export type CandidateKind = 'product' | 'category' | 'warehouse' | 'supplier' | 'fit' | 'season';
export interface Selection { readonly id: string; readonly label: string }
export interface InventoryFilter {
  readonly products: readonly Selection[];
  readonly category: Selection | null;
  readonly warehouses: readonly Selection[];
  readonly suppliers: readonly Selection[];
  readonly fits: readonly Selection[];
  readonly seasons: readonly Selection[];
}
export interface InventoryParameters {
  readonly filter: InventoryFilter;
  readonly page: number;
  readonly pageSize: InventoryPageSize;
}
export interface CandidateParameters {
  readonly kind: CandidateKind;
  readonly search: string;
  readonly page: number;
  readonly pageSize: 20;
  readonly selectedIds: readonly string[];
  readonly categoryId: string | null;
}
export interface Candidate extends Selection {
  readonly disabled?: boolean;
  readonly parentLabel?: string;
  readonly depth?: 0 | 1;
}
export interface CandidatePage {
  readonly items: readonly Candidate[];
  readonly exactTotal: number;
  readonly page: number;
}
export type StockCell =
  | { readonly state: 'known'; readonly skuId: string; readonly quantity: string }
  | { readonly state: 'unknown'; readonly skuId: string; readonly reason: string }
  | { readonly state: 'not-applicable' };
export interface StockTotal {
  readonly knownQuantity: string;
  readonly completeness: 'complete' | 'incomplete';
  readonly unknownCells: number;
}
export interface InventorySize extends Selection {}
export interface InventoryRow {
  readonly warehouse: Selection;
  /** Every column has an explicit state. Missing keys are invalid, not zero. */
  readonly cells: Readonly<Record<string, StockCell>>;
  readonly total: StockTotal;
}
export interface InventoryColorFit {
  readonly color: Selection;
  readonly fit: Selection;
  readonly rows: readonly InventoryRow[];
  readonly sizeTotals: Readonly<Record<string, StockTotal>>;
  readonly total: StockTotal;
}
export interface InventoryProduct {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly categoryLabel: string;
  readonly supplierLabel: string;
  readonly seasonLabel: string;
  readonly sizeGroup: Selection;
  /** Source order and full labels (e.g. 165/S), never inferred from a code. */
  readonly sizes: readonly InventorySize[];
  readonly colorFits: readonly InventoryColorFit[];
  readonly sizeTotals: Readonly<Record<string, StockTotal>>;
  readonly total: StockTotal;
}
export interface InventoryPage {
  readonly page: number;
  readonly pageSize: InventoryPageSize;
  readonly exactTotalProducts: number;
  readonly products: readonly InventoryProduct[];
  readonly warehouseLabels: readonly string[];
  /** Server-authorized full-filter summary. Never summed from the current page DOM. */
  readonly allMatchesTotal: StockTotal;
  readonly readReference: string;
}
export interface InventoryReader {
  readInventory(read: QueryRead<InventoryParameters>): Promise<InventoryPage>;
  readCandidates(read: QueryRead<CandidateParameters>): Promise<CandidatePage>;
}
export interface InventoryCellTarget {
  readonly productId: string;
  readonly productLabel: string;
  readonly color: Selection;
  readonly fit: Selection;
  readonly size: Selection;
  readonly warehouse: Selection;
  readonly skuId: string;
  readonly readReference: string;
}
export interface InventoryActions {
  /** Only a clicked valid warehouse + SKU. The host authorizes and loads its ledger. */
  readonly onOpenCell?: (target: InventoryCellTarget) => void;
  readonly onViewProduct?: (product: Selection) => void;
}
export function emptyInventoryFilter(): InventoryFilter {
  return { products: [], category: null, warehouses: [], suppliers: [], fits: [], seasons: [] };
}
