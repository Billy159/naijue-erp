import type { ActorContext } from "./ports.ts";
import type { ControlledProductMedia, ControlledProductMediaLink, ProductImageDto, ProductImageMetadata, ProductImagesDto, ProductQuery, ProductQueryDependencies, ProductReadIntent, ProductScopedRead } from "./product-query-ports.ts";
import { activeProductRead, checkedProductActor, checkedProductGrant, parseProductImageQuery, parseProductQuery } from "./product-query-validation.ts";
import { DomainError } from "../../domain/src/errors.ts";

function mediaOrigin(media: ControlledProductMedia): string {
  let origin: URL;
  try { origin = new URL(media.deliveryOrigin); } catch { throw new TypeError("Product media requires an explicit trusted HTTPS delivery origin"); }
  if (origin.protocol !== "https:" || origin.origin !== media.deliveryOrigin || origin.username || origin.password
    || typeof media.resolveThumbnails !== "function" || typeof media.resolveOriginal !== "function") throw new TypeError("Product media requires explicit controlled providers and a trusted HTTPS delivery origin");
  return origin.origin;
}
function link(value: ControlledProductMediaLink, metadata: ProductImageMetadata, variant: "thumbnail" | "original", origin: string): string {
  try {
    if (!value || value.imageId !== metadata.id || value.variant !== variant || typeof value.url !== "string" || /[\s\\]/.test(value.url)) throw new Error();
    const url = new URL(value.url);
    if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password || url.hash || url.href !== value.url) throw new Error();
    // A provider must issue opaque delivery references, not echo either a storage URL or storage path.
    if (value.url === metadata.fileRef || decodeURIComponent(url.pathname + url.search).includes(metadata.fileRef)) throw new Error();
    return value.url;
  } catch { throw new Error("Invalid trusted controlled product media link"); }
}
/** Genuine read service. No source data, policy, media URL or permissive production fallback exists. */
export function createProductQueryService(dependencies: ProductQueryDependencies) {
  if (typeof dependencies?.authorization?.authorize !== "function" || typeof dependencies?.reader?.readBasics !== "function"
    || typeof dependencies?.reader?.readSpecifications !== "function" || typeof dependencies?.reader?.readImages !== "function"
    || typeof dependencies?.reader?.readImage !== "function" || !Object.hasOwn(dependencies, "media")) {
    throw new TypeError("Product queries require explicit trusted authorization, snapshot reader and media availability");
  }
  const reader = dependencies.reader; const media = dependencies.media;
  const origin = media === null ? null : mediaOrigin(media);
  const authorize = dependencies.authorization.authorize.bind(dependencies.authorization);
  async function read<P extends ProductQuery, R extends { readonly productId: string } | null>(actor: ActorContext, parameters: P, intent: ProductReadIntent, signal: AbortSignal, work: (read: ProductScopedRead<P>) => Promise<R>): Promise<R> {
    const trustedActor = checkedProductActor(actor); activeProductRead(signal);
    const grant = checkedProductGrant(await authorize(trustedActor, Object.freeze(intent), signal), parameters); activeProductRead(signal);
    const result = await work(Object.freeze({ actor: trustedActor, grant, parameters, signal })); activeProductRead(signal);
    if (result !== null && result.productId !== parameters.productId) throw new Error("Mismatched trusted product response");
    return result;
  }
  return Object.freeze({
    readBasics(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseProductQuery(input);
      return read(actor, parameters, { kind: "basics", parameters }, signal, reader.readBasics.bind(reader));
    },
    readSpecifications(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseProductQuery(input);
      return read(actor, parameters, { kind: "specifications", parameters }, signal, reader.readSpecifications.bind(reader));
    },
    readImages(actor: ActorContext, input: unknown, signal: AbortSignal): Promise<ProductImagesDto | null> {
      const parameters = parseProductQuery(input);
      return read(actor, parameters, { kind: "images", parameters }, signal, async scoped => {
        const result = await reader.readImages(scoped); activeProductRead(signal);
        if (result === null) return null;
        if (result.productId !== parameters.productId || result.images.some(image => image.productId !== parameters.productId)) throw new Error("Mismatched trusted product image metadata");
        if (!result.images.length) return { productId: result.productId, images: [] };
        if (media === null || origin === null) throw new DomainError("PRODUCT_MEDIA_NOT_IMPLEMENTED", "Controlled product media storage/delivery is not implemented");
        const links = await media.resolveThumbnails({ ...scoped, productId: parameters.productId, images: result.images }); activeProductRead(signal);
        if (!Array.isArray(links) || links.length !== result.images.length || new Set(links.map(value => value.imageId)).size !== links.length) throw new Error("Invalid trusted thumbnail batch");
        const byId = new Map(links.map(value => [value.imageId, value]));
        return { productId: result.productId, images: result.images.map(image => {
          const resolved = byId.get(image.id); if (!resolved) throw new Error("Missing trusted thumbnail link");
          // Accessible label comes from the stored product name, not an invented image filename.
          return { id: image.id, label: result.productName, thumbnailUrl: link(resolved, image, "thumbnail", origin),
            ...(image.classification === undefined ? {} : { role: image.classification.role, colorId: image.classification.colorId }) };
        }) };
      });
    },
    readImage(actor: ActorContext, input: unknown, signal: AbortSignal): Promise<ProductImageDto> {
      const parameters = parseProductImageQuery(input);
      return read(actor, parameters, { kind: "image", parameters }, signal, async scoped => {
        const image = await reader.readImage(scoped); activeProductRead(signal);
        if (image === null) throw new DomainError("PRODUCT_IMAGE_NOT_FOUND", "Product image is unavailable");
        if (image.productId !== parameters.productId || image.id !== parameters.imageId) throw new Error("Mismatched trusted product image metadata");
        if (media === null || origin === null) throw new DomainError("PRODUCT_MEDIA_NOT_IMPLEMENTED", "Controlled product media storage/delivery is not implemented");
        const resolved = await media.resolveOriginal({ ...scoped, productId: parameters.productId, images: [image] }); activeProductRead(signal);
        return { productId: parameters.productId, imageId: parameters.imageId, url: link(resolved, image, "original", origin) };
      });
    }
  });
}
