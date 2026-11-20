import type { ActorContext } from "./ports.ts";

export type ProductManagementPageSize = 100 | 200 | 500;
export interface ProductManagementFilter {
  readonly productIds: readonly string[]; readonly categoryIds: readonly string[];
  readonly years: readonly string[]; readonly seasonIds: readonly string[];
  readonly supplierIds: readonly string[]; readonly fitIds: readonly string[];
  readonly thicknesses: readonly string[]; readonly shapeCodes: readonly string[];
}
export interface ProductManagementListQuery { readonly filter: ProductManagementFilter; readonly page: number; readonly pageSize: ProductManagementPageSize }
export type ProductManagementCandidateKind = "product" | "category" | "year" | "season" | "supplier" | "fit" | "thickness" | "shape";
export interface ProductManagementCandidateQuery {
  readonly kind: ProductManagementCandidateKind; readonly search: string; readonly selectedIds: readonly string[];
  readonly page: number; readonly pageSize: 20;
}
export interface ProductManagementSelection { readonly id: string; readonly label: string }
export interface ProductManagementListItem {
  readonly id: string; readonly code: string; readonly name: string; readonly categoryLabel: string | null;
  readonly year: number | null; readonly seasonLabel: string | null; readonly supplierLabel: string | null;
  readonly fits: readonly ProductManagementSelection[]; readonly thickness: string | null;
  /** Exact native decimal(18,2) text. NULL is not a zero price. */
  readonly retailPrice: string | null;
  /** Exact complete ALL-warehouse quantity only; NULL means this read cannot provide it.
   * An authorized warehouse subset must NEVER be labeled as a product's total stock. */
  readonly totalStock: string | null;
}
export interface ProductManagementListPage {
  readonly page: number; readonly pageSize: ProductManagementPageSize; readonly exactTotal: number;
  readonly items: readonly ProductManagementListItem[];
}
export interface ProductManagementCandidate extends ProductManagementSelection {
  readonly code?: string; readonly name?: string; readonly parentId?: string | null;
  readonly parentLabel?: string; readonly depth?: 0 | 1;
}
export interface ProductManagementCandidatePage {
  readonly page: number; readonly pageSize: 20; readonly exactTotal: number; readonly items: readonly ProductManagementCandidate[];
}
export type ProductManagementReadIntent = { readonly kind: "list"; readonly parameters: ProductManagementListQuery }
  | { readonly kind: "candidates"; readonly parameters: ProductManagementCandidateQuery };
/** Current trusted policy must explicitly grant catalogue access. No role, route, selected ID,
 * trading-candidate permission or drawer permission implies a catalogue grant. Stock visibility is
 * separate: all-warehouses is deliberate global stock authority, NEVER a warehouse subset. */
export type ProductManagementReadGrant =
  | { readonly kind: "all"; readonly totalStock: "unavailable" | "all-warehouses" }
  | { readonly kind: "products"; readonly productIds: readonly string[]; readonly totalStock: "unavailable" | "all-warehouses" };
export interface ProductManagementQueryAuthorization {
  authorize(actor: ActorContext, intent: ProductManagementReadIntent, signal: AbortSignal): Promise<ProductManagementReadGrant>;
}
export interface ProductManagementScopedRead<P> {
  readonly actor: ActorContext; readonly grant: ProductManagementReadGrant; readonly parameters: P; readonly signal: AbortSignal;
}
/** Each invocation obtains count, rows and aggregates from one READ ONLY consistent snapshot;
 * the grant constrains before count/paging/options. Options derive only from authorized products.
 * No whole catalogue materialization, per-product query or implicit missing-balance zero. */
export interface TrustedProductManagementSnapshotReader {
  readList(read: ProductManagementScopedRead<ProductManagementListQuery>): Promise<ProductManagementListPage>;
  readCandidates(read: ProductManagementScopedRead<ProductManagementCandidateQuery>): Promise<ProductManagementCandidatePage>;
}
export interface ProductManagementQueryDependencies {
  readonly authorization: ProductManagementQueryAuthorization; readonly reader: TrustedProductManagementSnapshotReader;
}
