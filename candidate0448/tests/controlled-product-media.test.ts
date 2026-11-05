/** Synthetic private manifests/files only. No image codec, real media mapping or database proof. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, writeFile, unlink, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { PrivateControlledProductMedia } from "../adapters/media/src/controlled-product-media.ts";
import type { PrivateProductMediaManifest } from "../adapters/media/src/controlled-product-media.ts";
import type { ProductImageMetadata } from "../packages/application/src/product-query-ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const productId = sid("product", 12001), imageId = sid("product", 12002);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=", "base64");
const digest = createHash("sha256").update(png).digest("hex");
const image: ProductImageMetadata = { id: imageId, productId, fileRef: "PRIVATE_ORIGINAL_REF", mime: "image/png", byteSize: BigInt(png.length), displayOrder: 0 };
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const temp = await mkdtemp(path.join(await realpath(tmpdir()), "controlled-media-synthetic-")); t.after(() => rm(temp, { recursive: true, force: true }));
  const original = path.join(temp, "original.png"), thumb = path.join(temp, "thumbnail.png"); await writeFile(original, png); await writeFile(thumb, png);
  let allowed = true, retained = true, auths = 0, reads = 0, mappings = 0;
  let manifest: PrivateProductMediaManifest = { productId, imageId, fileRef: image.fileRef,
    original: { rootKey: "private", relativePath: "original.png", mime: "image/png", byteSize: image.byteSize, sha256: digest },
    thumbnail: { rootKey: "private", relativePath: "thumbnail.png", mime: "image/png", byteSize: image.byteSize, sha256: digest, derivedFromOriginalSha256: digest } };
  const options = { deliveryOrigin: "https://synthetic.invalid", basePath: "/api", privateRoots: { private: temp }, publicRoots: [temp + "-public"],
    manifests: { async resolve() { mappings++; return new Map([[imageId, manifest]]); } },
    authorization: { async authorize() { auths++; if (!allowed) throw new DomainError("FORBIDDEN", "SYNTHETIC"); return { productId }; } },
    reader: { async readCurrentImage() { reads++; return retained ? image : null; } } };
  const provider = new PrivateControlledProductMedia(options), read = { actor, grant: { productId }, productId, images: [image], signal: new AbortController().signal };
  const input = async (variant: "thumbnail" | "original" = "thumbnail") => {
    const link = variant === "thumbnail" ? (await provider.resolveThumbnails(read))[0]! : await provider.resolveOriginal(read);
    return { actor, productId, imageId, revision: new URL(link.url).pathname.split("/").at(-2)!, variant, signal: read.signal };
  };
  return { provider, options, read, input, original, thumb, manifest: () => manifest, setManifest: (m: PrivateProductMediaManifest) => { manifest = m; }, revoke: () => { allowed = false; }, remove: () => { retained = false; }, counts: () => ({ auths, reads, mappings }) };
}
test("W15 media metadata links use one private batch and opaque revision without opening original; thumbnail delivery never falls back", async t => {
  const f = await fixture(t); await unlink(f.original);
  const links = await f.provider.resolveThumbnails(f.read); assert.equal(links.length, 1); assert.equal(f.counts().mappings, 1);
  assert.match(links[0]!.url, /\/api\/products\/media\/[^/]+\/[^/]+\/[a-f0-9]{64}\/thumbnail$/); assert.doesNotMatch(links[0]!.url, /PRIVATE|original\.png|thumbnail\.png/);
  const result = await f.provider.deliver(await f.input()); assert.deepEqual(result.bytes, png); assert.equal(result.mime, "image/png");
  await assert.rejects(f.provider.deliver(await f.input("original")), { code: "PRODUCT_MEDIA_NOT_READY" });
  f.setManifest({ ...f.manifest(), thumbnail: null });
  assert.deepEqual(await f.provider.resolveAvailableThumbnails(f.read), []); await assert.rejects(f.provider.resolveThumbnails(f.read), { code: "PRODUCT_MEDIA_NOT_READY" });
});
test("W15 bytes always reauthorize and reload membership; revoked, removed and stale revisions cannot read", async t => {
  const f = await fixture(t), input = await f.input(); await f.provider.deliver(input); await f.provider.deliver(input);
  assert.equal(f.counts().auths, 2); assert.equal(f.counts().reads, 2);
  await assert.rejects(f.provider.deliver({ ...input, revision: "0".repeat(64) }), { code: "PRODUCT_IMAGE_NOT_FOUND" });
  f.remove(); await assert.rejects(f.provider.deliver(input), { code: "PRODUCT_IMAGE_NOT_FOUND" });
  f.revoke(); const before = f.counts().reads; await assert.rejects(f.provider.deliver(input), { code: "FORBIDDEN" }); assert.equal(f.counts().reads, before);
  const controller = new AbortController(); controller.abort(); await assert.rejects(f.provider.deliver({ ...input, signal: controller.signal }), { code: "PRODUCT_READ_ABORTED" });
});
test("W15 path mapping rejects traversal/public roots/original aliases and symlink escapes", async t => {
  const f = await fixture(t), m = f.manifest();
  assert.throws(() => new PrivateControlledProductMedia({ ...f.options, publicRoots: [f.options.privateRoots.private] }), /separate/);
  for (const relativePath of ["../outside.png", "/tmp/outside.png", "x/../original.png", "https://example/image", "x%2f..", "x\\y"]) {
    f.setManifest({ ...m, original: { ...m.original, relativePath } }); await assert.rejects(f.provider.resolveThumbnails(f.read), { code: "PRODUCT_MEDIA_NOT_READY" });
  }
  f.setManifest({ ...m, thumbnail: { ...m.thumbnail!, relativePath: m.original.relativePath } }); await assert.rejects(f.provider.resolveThumbnails(f.read), { code: "PRODUCT_MEDIA_NOT_READY" });
  f.setManifest(m); await unlink(f.thumb); await symlink(f.original, f.thumb);
  await assert.rejects(f.provider.deliver(await f.input()), { code: "PRODUCT_MEDIA_NOT_READY" });
});
test("W15 changed blob digest, wrong membership and invalid private manifest fail explicitly without repair", async t => {
  const f = await fixture(t), input = await f.input(); await writeFile(f.thumb, Buffer.alloc(png.length, 1));
  await assert.rejects(f.provider.deliver(input), { code: "PRODUCT_MEDIA_NOT_READY" });
  const m = f.manifest(); f.setManifest({ ...m, fileRef: "WRONG_PRIVATE_REF" }); await assert.rejects(f.provider.resolveThumbnails(f.read), { code: "PRODUCT_MEDIA_NOT_READY" });
  f.setManifest(m); await assert.rejects(f.provider.resolveOriginal({ ...f.read, images: [] }), { code: "PRODUCT_MEDIA_NOT_READY" });
  await assert.rejects(f.provider.resolveThumbnails({ ...f.read, grant: { productId: sid("product", 3) } }), { code: "FORBIDDEN" });
  const html = Buffer.from("<html>not an image</html>"); await writeFile(f.thumb, html);
  f.setManifest({ ...m, thumbnail: { ...m.thumbnail!, byteSize: BigInt(html.length), sha256: createHash("sha256").update(html).digest("hex") } });
  await assert.rejects(f.provider.deliver(await f.input()), { code: "PRODUCT_MEDIA_NOT_READY" });
});
