import type { ProductManagementCandidateKind, ProductManagementCandidatePage, ProductManagementCandidateQuery, ProductManagementFilter, ProductManagementListPage, ProductManagementListQuery, ProductManagementPageSize } from '../../../../packages/application/src/product-management-query-ports.ts';
import type { QueryRead } from '../loading/latest-query.ts';
import type { ProductReadOnlyReader } from '../inventory/product-contracts.ts';
import type { Selection } from '../inventory/contracts.ts';

export type { ProductManagementCandidateKind, ProductManagementCandidatePage, ProductManagementCandidateQuery, ProductManagementFilter, ProductManagementListPage, ProductManagementListQuery, ProductManagementPageSize };
export interface ProductManagementReader {
  readList(read: QueryRead<ProductManagementListQuery>): Promise<ProductManagementListPage>;
  readCandidates(read: QueryRead<ProductManagementCandidateQuery>): Promise<ProductManagementCandidatePage>;
}
export interface ProductManagementProductCapability {
  /** Existing target-only read capability, independently authorized for each target/tab. */
  readonly reader: ProductReadOnlyReader;
  readonly loadStyles: () => Promise<unknown>;
}
export type ProductFilterDraft = Readonly<Record<ProductManagementCandidateKind, readonly Selection[]>>;
export const emptyProductFilter = (): ProductFilterDraft => ({ product: [], category: [], year: [], season: [], supplier: [], fit: [], thickness: [], shape: [] });
export function productFilterParameters(draft: ProductFilterDraft): ProductManagementFilter {
  return { productIds: draft.product.map(item => item.id), categoryIds: draft.category.map(item => item.id), years: draft.year.map(item => item.id),
    seasonIds: draft.season.map(item => item.id), supplierIds: draft.supplier.map(item => item.id), fitIds: draft.fit.map(item => item.id),
    thicknesses: draft.thickness.map(item => item.id), shapeCodes: draft.shape.map(item => item.id) };
}
