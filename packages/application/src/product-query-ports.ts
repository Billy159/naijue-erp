import type { ActorContext } from "./ports.ts";
import type { EntityId } from "../../domain/src/values.ts";

export interface ProductQuery { readonly productId: EntityId<"product"> }
/** Image relation IDs are UUIDs, but are not SKU/product identities. */
export interface ProductImageQuery extends ProductQuery { readonly imageId: string }
export type ProductReadIntent =
  | { readonly kind: "basics" | "specifications" | "images"; readonly parameters: ProductQuery }
  | { readonly kind: "image"; readonly parameters: ProductImageQuery };
/** A fresh, explicit target grant, never a client role or an implicit global catalogue grant. */
export interface ProductReadGrant { readonly productId: EntityId<"product"> }
export interface ProductQueryAuthorization {
  authorize(actor: ActorContext, intent: ProductReadIntent, signal: AbortSignal): Promise<ProductReadGrant>;
}
export interface ProductScopedRead<P extends ProductQuery> {
  readonly actor: ActorContext; readonly grant: ProductReadGrant; readonly parameters: P; readonly signal: AbortSignal;
}
export interface ProductSelection { readonly id: string; readonly label: string }
/** Wire-compatible with the frozen drawer DTOs; nullable storage is not replaced with invented labels. */
export interface ProductBasicsDto {
  readonly productId: string; readonly code: string; readonly name: string;
  readonly categoryLabel: string | null; readonly yearLabel: string | null; readonly seasonLabel: string | null;
  readonly supplierLabel: string | null; readonly systemCode: string | null;
  /** Nullable native product retail_price; exact nonnegative decimal(18,2) text, not minor units. */
  readonly retailPrice: string | null;
}
export interface ProductSpecificationsDto {
  readonly productId: string; readonly sizeGroup: ProductSelection | null;
  readonly colors: readonly ProductSelection[]; readonly fits: readonly ProductSelection[]; readonly sizes: readonly ProductSelection[];
  readonly skus: readonly { readonly id: string; readonly colorId: string; readonly fitId: string; readonly sizeId: string }[];
}
export type ProductImageMime = "image/png" | "image/jpeg" | "image/webp";
/** Private adapter-to-media facts. Never serialize this object or fileRef to an HTTP response. */
export interface ProductImageMetadata {
  readonly id: string; readonly productId: string; readonly fileRef: string; readonly mime: ProductImageMime;
  readonly byteSize: bigint; readonly displayOrder: number;
}
export interface ProductImageMetadataSet {
  readonly productId: string; readonly productName: string; readonly images: readonly ProductImageMetadata[];
}
export interface ProductImagesDto {
  readonly productId: string; readonly images: readonly { readonly id: string; readonly label: string; readonly thumbnailUrl: string }[];
}
export interface ProductImageDto { readonly productId: string; readonly imageId: string; readonly url: string }
/** Each method reads one target using a bounded, read-only consistent snapshot. */
export interface TrustedProductSnapshotReader {
  readBasics(read: ProductScopedRead<ProductQuery>): Promise<ProductBasicsDto | null>;
  readSpecifications(read: ProductScopedRead<ProductQuery>): Promise<ProductSpecificationsDto | null>;
  readImages(read: ProductScopedRead<ProductQuery>): Promise<ProductImageMetadataSet | null>;
  readImage(read: ProductScopedRead<ProductImageQuery>): Promise<ProductImageMetadata | null>;
}
/** Delivery requires an actual retained-delete-aware reader, distinct from legacy schema19 reads. */
export interface CurrentProductImageSnapshotReader {
  readCurrentImage(read: ProductScopedRead<ProductImageQuery>): Promise<ProductImageMetadata | null>;
}
export interface ControlledProductMediaLink {
  readonly imageId: string; readonly variant: "thumbnail" | "original"; readonly url: string;
}
export interface ProductMediaRead {
  readonly actor: ActorContext; readonly grant: ProductReadGrant; readonly productId: string;
  readonly images: readonly ProductImageMetadata[]; readonly signal: AbortSignal;
}
/** Required trusted boundary for actual storage/thumbnail delivery. No implementation or public-path
 * fallback is supplied here. Implementations MUST produce authenticated, access-controlled opaque
 * delivery URLs on this configured HTTPS origin, not expose fileRef/storage URLs, and enforce current
 * access again when bytes are delivered. Thumbnails must be derived thumbnails, never originals.
 * This port is batch-based to avoid per-image storage/delivery calls from the application layer.
 * Resolving metadata/thumbnails must not fetch original image bytes. Only resolveOriginal may do so. */
export interface ControlledProductMedia {
  readonly deliveryOrigin: string;
  resolveThumbnails(read: ProductMediaRead): Promise<readonly ControlledProductMediaLink[]>;
  resolveOriginal(read: ProductMediaRead): Promise<ControlledProductMediaLink>;
  /** Rich editor only: omitted mappings represent unavailable thumbnails, never original fallback. */
  resolveAvailableThumbnails?(read: ProductMediaRead): Promise<readonly ControlledProductMediaLink[]>;
}
export interface ProductQueryDependencies {
  readonly authorization: ProductQueryAuthorization; readonly reader: TrustedProductSnapshotReader;
  /** Explicit null advertises unavailable media storage/delivery, rather than fabricating URLs. */
  readonly media: ControlledProductMedia | null;
}
