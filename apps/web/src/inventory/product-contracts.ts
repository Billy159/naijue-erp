import type { QueryRead } from '../loading/latest-query.ts';
import type { Selection } from './contracts.ts';

/** Target-only, read-only DTOs. A host must inject this port; there is no API or fixture fallback. */
export interface ProductParameters { readonly productId: string }
export interface ProductBasics {
  readonly productId: string;
  readonly code: string;
  readonly name: string;
  readonly categoryLabel: string | null;
  readonly yearLabel: string | null;
  readonly seasonLabel: string | null;
  readonly supplierLabel: string | null;
  readonly systemCode: string | null;
  /** Existing product fields; legacy read projections may omit them. */
  readonly thickness?: string | null;
  readonly collarPantsType?: string | null;
  /** Exact decimal(18,2) source text. Null means unavailable, never zero. */
  readonly retailPrice: string | null;
}
export interface ProductSku {
  readonly id: string;
  readonly colorId: string;
  readonly fitId: string;
  readonly sizeId: string;
}
export interface ProductSpecifications {
  readonly productId: string;
  readonly sizeGroup: Selection | null;
  /** Authorized source order and full labels, never inferred from a code. */
  readonly colors: readonly Selection[];
  readonly fits: readonly Selection[];
  readonly sizes: readonly Selection[];
  /** Only actual legal four-dimensional SKUs, never a browser-generated cross product. */
  readonly skus: readonly ProductSku[];
}
export interface ProductImageSummary {
  readonly id: string;
  readonly label: string;
  /** Thumbnail only. The reader must not return an original in this field. */
  readonly thumbnailUrl: string;
  /** Ordinary readonly projection; absence does not imply a role or color. */
  readonly role?: 'MAIN' | 'WHITE_BACKGROUND' | 'HANG_TAG' | 'DETAIL' | 'COLOR' | null;
  readonly colorId?: string | null;
}
export interface ProductImages {
  readonly productId: string;
  readonly images: readonly ProductImageSummary[];
}
export interface ProductImageParameters extends ProductParameters { readonly imageId: string }
export interface ProductImage {
  readonly productId: string;
  readonly imageId: string;
  readonly url: string;
}
export interface ProductReadOnlyReader {
  readProductBasics(read: QueryRead<ProductParameters>): Promise<ProductBasics | null>;
  readProductSpecifications(read: QueryRead<ProductParameters>): Promise<ProductSpecifications | null>;
  readProductImages(read: QueryRead<ProductParameters>): Promise<ProductImages | null>;
  /** Called only when the user explicitly requests one image preview. */
  readProductImage(read: QueryRead<ProductImageParameters>): Promise<ProductImage>;
}
