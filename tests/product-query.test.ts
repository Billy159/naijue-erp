/** SYNTHETIC service providers only; not production authorization, image storage or database evidence. */
import assert from "node:assert/strict";
import test from "node:test";
import { createProductQueryService } from "../packages/application/src/product-query-service.ts";
import type { ControlledProductMedia, ProductImageMetadata, ProductQueryDependencies, ProductReadIntent, TrustedProductSnapshotReader } from "../packages/application/src/product-query-ports.ts";
import type { ProductBasics, ProductImage, ProductImages, ProductSpecifications } from "../apps/web/src/inventory/product-contracts.ts";
import type { ProductBasicsDto, ProductImageDto, ProductImagesDto, ProductSpecificationsDto } from "../packages/application/src/product-query-ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";

// Compile-time proof that responses match the frozen web DTOs, without production importing the app.
const wireCompatibility: [ProductBasicsDto extends ProductBasics ? true : never, ProductSpecificationsDto extends ProductSpecifications ? true : never,
  ProductImagesDto extends ProductImages ? true : never, ProductImageDto extends ProductImage ? true : never] = [true, true, true, true]; void wireCompatibility;
const productId = sid("product", 601); const imageId = sid("product", 602); const other = sid("product", 603);
const parameters = { productId }; const imageParameters = { productId, imageId };
const image: ProductImageMetadata = { id: imageId, productId, fileRef: "SYNTHETIC/private-object-key", mime: "image/png", byteSize: 500n, displayOrder: 7 };
const signal = () => new AbortController().signal;
function fixture(options: { missing?: boolean; empty?: boolean; media?: ControlledProductMedia | null; authorize?: ProductQueryDependencies["authorization"]["authorize"] } = {}) {
  const intents: ProductReadIntent[] = []; let reads = 0; let thumbnails = 0; let originals = 0;
  const reader: TrustedProductSnapshotReader = {
    async readBasics() { reads++; return options.missing ? null : { productId, code: "SYNTHETIC", name: "SYNTHETIC PRODUCT", categoryLabel: "SYNTHETIC CATEGORY", yearLabel: null, seasonLabel: null, supplierLabel: null, systemCode: null, retailPrice: null }; },
    async readSpecifications() { reads++; return options.missing ? null : { productId, sizeGroup: null, colors: [], fits: [], sizes: [], skus: [] }; },
    async readImages() { reads++; return options.missing ? null : { productId, productName: "SYNTHETIC PRODUCT", images: options.empty ? [] : [image] }; },
    async readImage() { reads++; return options.missing ? null : image; }
  };
  const media: ControlledProductMedia = { deliveryOrigin: "https://synthetic.example", async resolveThumbnails(read) {
    thumbnails++; assert.equal(read.images.length, 1); assert.equal(read.grant.productId, productId); assert.deepEqual(read.actor, actor);
    return [{ imageId, variant: "thumbnail", url: "https://synthetic.example/opaque-thumbnail" }];
  }, async resolveOriginal(read) { originals++; assert.equal(read.images[0]!.id, imageId); return { imageId, variant: "original", url: "https://synthetic.example/opaque-original" }; } };
  const dependencies: ProductQueryDependencies = { reader, media: Object.hasOwn(options, "media") ? options.media! : media,
    authorization: { async authorize(context, intent, readSignal) { intents.push(intent); assert.deepEqual(context, actor); assert.ok(readSignal instanceof AbortSignal);
      return options.authorize ? options.authorize(context, intent, readSignal) : { productId }; } } };
  return { service: createProductQueryService(dependencies), dependencies, reader, media, intents, counts: () => ({ reads, thumbnails, originals }) };
}
test("SYNTHETIC product service: four explicit reads reauthorize; image list resolves one thumbnail batch, original only explicit", async () => {
  const f = fixture();
  const basics = await f.service.readBasics(actor, parameters, signal()); assert.equal(basics!.yearLabel, null); assert.equal(basics!.systemCode, null);
  await f.service.readSpecifications(actor, parameters, signal());
  const images = await f.service.readImages(actor, parameters, signal());
  assert.deepEqual(images, { productId, images: [{ id: imageId, label: "SYNTHETIC PRODUCT", thumbnailUrl: "https://synthetic.example/opaque-thumbnail" }] });
  assert.deepEqual(f.counts(), { reads: 3, thumbnails: 1, originals: 0 }); assert.ok(!JSON.stringify(images).includes(image.fileRef));
  assert.deepEqual(await f.service.readImage(actor, imageParameters, signal()), { productId, imageId, url: "https://synthetic.example/opaque-original" });
  assert.deepEqual(f.intents.map(intent => intent.kind), ["basics", "specifications", "images", "image"]); assert.deepEqual(f.counts(), { reads: 4, thumbnails: 1, originals: 1 });
});
test("SYNTHETIC product service: missing/empty actual targets stay null/empty; missing image is 404, never generated", async () => {
  const f = fixture({ missing: true });
  assert.equal(await f.service.readBasics(actor, parameters, signal()), null); assert.equal(await f.service.readSpecifications(actor, parameters, signal()), null);
  assert.equal(await f.service.readImages(actor, parameters, signal()), null); await assert.rejects(() => f.service.readImage(actor, imageParameters, signal()), { code: "PRODUCT_IMAGE_NOT_FOUND" });
  assert.equal(f.counts().thumbnails + f.counts().originals, 0);
  const empty = fixture({ empty: true, media: null }); assert.deepEqual(await empty.service.readImages(actor, parameters, signal()), { productId, images: [] });
});
test("SYNTHETIC product service: strict exact UUID inputs never reach policy or reader", async () => {
  const f = fixture();
  for (const input of [null, [], {}, { productId: "fake" }, { productId: "00000000-0000-4000-8000-000000000ABC" }, { productId, actor }, { productId, scope: "all" }, { productId, imageId }, { productId: null }, { productId: 1 }, Object.create({ productId })]) {
    assert.throws(() => f.service.readBasics(actor, input, signal()), { code: "INVALID_PRODUCT_QUERY" });
  }
  for (const input of [{ productId, imageId: "00000000-0000-4000-8000-000000000ABC" }, { productId, imageId, variant: "original" }, { productId }, { imageId }]) assert.throws(() => f.service.readImage(actor, input, signal()), { code: "INVALID_PRODUCT_QUERY" });
  assert.deepEqual(f.counts(), { reads: 0, thumbnails: 0, originals: 0 }); assert.equal(f.intents.length, 0);
});
test("SYNTHETIC product service: denied/revoked/malformed/mismatched grants do not read target or media", async () => {
  for (const [authorize, code] of [[async () => { throw new DomainError("FORBIDDEN", "DENIED"); }, "FORBIDDEN"], [async () => ({ productId: other }), "FORBIDDEN"],
    [async () => null as never, undefined], [async () => ({ productId, all: true }) as never, undefined]] as const) {
    const f = fixture({ authorize });
    await assert.rejects(() => f.service.readImage(actor, imageParameters, signal()), error => error instanceof Error && (code === undefined || (error as DomainError).code === code));
    assert.deepEqual(f.counts(), { reads: 0, thumbnails: 0, originals: 0 });
  }
  let allowed = true; const f = fixture({ authorize: async () => { if (!allowed) throw new DomainError("FORBIDDEN", "Revoked"); return { productId }; } });
  await f.service.readImages(actor, parameters, signal()); allowed = false;
  await assert.rejects(() => f.service.readImage(actor, imageParameters, signal()), { code: "FORBIDDEN" }); assert.equal(f.counts().originals, 0);
});
test("SYNTHETIC product service: missing trusted providers/media availability fails closed; unavailable delivery is explicit", async () => {
  assert.throws(() => createProductQueryService({} as ProductQueryDependencies), /explicit trusted authorization/);
  const f = fixture({ media: null });
  await assert.rejects(() => f.service.readImages(actor, parameters, signal()), { code: "PRODUCT_MEDIA_NOT_IMPLEMENTED" });
  await assert.rejects(() => f.service.readImage(actor, imageParameters, signal()), { code: "PRODUCT_MEDIA_NOT_IMPLEMENTED" });
  assert.equal(f.counts().originals + f.counts().thumbnails, 0);
  assert.throws(() => createProductQueryService({ ...f.dependencies, media: undefined } as never));
  assert.throws(() => createProductQueryService({ ...f.dependencies, media: { ...f.media, deliveryOrigin: "http://synthetic.example" } }), /HTTPS/);
});
test("SYNTHETIC product service: media links enforce target/variant/HTTPS configured origin and do not echo file references", async () => {
  for (const resolved of [{ imageId, variant: "original", url: "https://synthetic.example/original" }, { imageId: other, variant: "thumbnail", url: "https://synthetic.example/opaque" },
    { imageId, variant: "thumbnail", url: "javascript:alert(1)" }, { imageId, variant: "thumbnail", url: "https://other.example/opaque" },
    { imageId, variant: "thumbnail", url: `https://synthetic.example/${image.fileRef}` }, { imageId, variant: "thumbnail", url: "https://user:secret@synthetic.example/opaque" }]) {
    const f = fixture(); const media = { ...f.media, async resolveThumbnails() { return [resolved] as never; } };
    const service = createProductQueryService({ ...f.dependencies, media }); await assert.rejects(() => service.readImages(actor, parameters, signal()), /trusted/);
  }
  for (const links of [[], [{ imageId: other, variant: "thumbnail", url: "https://synthetic.example/opaque" }]]) {
    const f = fixture(); const service = createProductQueryService({ ...f.dependencies, media: { ...f.media, async resolveThumbnails() { return links as never; } } });
    await assert.rejects(() => service.readImages(actor, parameters, signal()));
  }
});
test("SYNTHETIC product service: pending authorization cannot mutate captured actor/parameters; abort blocks reader/media", async () => {
  const input = { productId }; const context = { ...actor }; const controller = new AbortController();
  let continuePolicy!: () => void; const pending = new Promise<void>(resolve => { continuePolicy = resolve; });
  const f = fixture({ authorize: async (seenActor, intent) => { await pending; assert.equal(intent.parameters.productId, productId); assert.equal(seenActor.accountId, actor.accountId); return { productId }; } });
  const result = f.service.readBasics(context, input, controller.signal); input.productId = other; context.accountId = sid("account", 999); controller.abort(); continuePolicy();
  await assert.rejects(() => result, { code: "PRODUCT_READ_ABORTED" }); assert.equal(f.counts().reads, 0);
  const pre = new AbortController(); pre.abort(); await assert.rejects(() => f.service.readImages(actor, parameters, pre.signal), { code: "PRODUCT_READ_ABORTED" });
  assert.equal(f.intents.length, 1);
});

test("SYNTHETIC product service: wrong-target trusted metadata and aborted media response are never disclosed", async () => {
  const f = fixture();
  const wrong = createProductQueryService({ ...f.dependencies, reader: { ...f.reader, async readImage() { return { ...image, productId: other }; } } });
  await assert.rejects(() => wrong.readImage(actor, imageParameters, signal()), /Mismatched trusted/); assert.equal(f.counts().originals, 0);
  const controller = new AbortController();
  const aborted = createProductQueryService({ ...f.dependencies, media: { ...f.media, async resolveThumbnails() { controller.abort(); return [{ imageId, variant: "thumbnail", url: "https://synthetic.example/opaque" }]; } } });
  await assert.rejects(() => aborted.readImages(actor, parameters, controller.signal), { code: "PRODUCT_READ_ABORTED" });
});
