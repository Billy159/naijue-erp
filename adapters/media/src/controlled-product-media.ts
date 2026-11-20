import { productImageSignatureMatches } from "./product-image-signature.ts";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { activeProductRead, checkedProductActor, checkedProductGrant, parseProductImageQuery } from "../../../packages/application/src/product-query-validation.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { ControlledProductMedia, ControlledProductMediaLink, ProductImageMime, ProductMediaRead, ProductQueryAuthorization, CurrentProductImageSnapshotReader } from "../../../packages/application/src/product-query-ports.ts";

export interface PrivateProductMediaBlob {
  readonly rootKey: string; readonly relativePath: string; readonly mime: ProductImageMime;
  readonly byteSize: bigint; readonly sha256: string;
}
/** Trusted private index, never accepted from HTTP. Producer must certify real existing blobs.
 * A thumbnail needs its own artifact and original digest; this reader creates no thumbnails. */
export interface PrivateProductMediaManifest {
  readonly productId: string; readonly imageId: string; readonly fileRef: string;
  readonly original: PrivateProductMediaBlob;
  readonly thumbnail: (PrivateProductMediaBlob & { readonly derivedFromOriginalSha256: string }) | null;
}
export interface PrivateProductMediaManifestResolver {
  /** One metadata batch. Missing entries are unavailable; errors must reject, never become empty. */
  resolve(read: ProductMediaRead): Promise<ReadonlyMap<string, PrivateProductMediaManifest>>;
}
export interface ControlledProductMediaDelivery {
  readonly actor: ActorContext; readonly productId: string; readonly imageId: string;
  readonly revision: string; readonly variant: "thumbnail" | "original"; readonly signal: AbortSignal;
}
export interface ControlledProductMediaBytes { readonly bytes: Buffer; readonly mime: ProductImageMime }
export interface ControlledProductMediaProvider extends ControlledProductMedia {
  deliver(input: ControlledProductMediaDelivery): Promise<ControlledProductMediaBytes>;
}
export interface PrivateControlledProductMediaOptions {
  readonly deliveryOrigin: string; readonly basePath: string;
  readonly privateRoots: Readonly<Record<string, string>>; readonly publicRoots: readonly string[];
  readonly manifests: PrivateProductMediaManifestResolver;
  readonly authorization: ProductQueryAuthorization; readonly reader: CurrentProductImageSnapshotReader;
}
function available(ok: unknown): asserts ok { requireDomain(ok, "PRODUCT_MEDIA_NOT_READY", "Controlled product media is unavailable"); }
function inside(root: string, file: string): boolean { const r = path.relative(root, file); return r === "" || r !== ".." && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r); }
const fingerprint = (manifest: PrivateProductMediaManifest): string => createHash("sha256").update(JSON.stringify([
  manifest.productId, manifest.imageId, manifest.fileRef,
  ...[manifest.original, manifest.thumbnail].map(b => b === null ? null : [b.rootKey, b.relativePath, b.mime, b.byteSize.toString(), b.sha256])
])).digest("hex");
type BatchWaiter = {
  readonly signal: AbortSignal;
  readonly resolve: (bytes: Buffer) => void;
  readonly reject: (error: unknown) => void;
  readonly abort: () => void;
};
type PendingByteBatch = { readonly controller: AbortController; readonly waiters: Set<BatchWaiter> };
const maxWaitersPerByteBatch = 8;

/** Read-only controlled delivery. No upload, codec, migration, public fallback or file deletion.
 * Link resolution consults only the explicit private manifest index, never original bytes. */
export class PrivateControlledProductMedia implements ControlledProductMediaProvider {
  readonly deliveryOrigin: string;
  private readonly basePath: string; private readonly roots: Readonly<Record<string, string>>; private readonly publicRoots: readonly string[];
  private readonly manifests: PrivateProductMediaManifestResolver; private readonly authorization: ProductQueryAuthorization;
  private readonly reader: CurrentProductImageSnapshotReader;
  private readonly pendingByteBatches = new Map<string, PendingByteBatch>();
  constructor(options: PrivateControlledProductMediaOptions) {
    let origin: URL; try { origin = new URL(options.deliveryOrigin); } catch { throw TypeError("Explicit HTTPS media origin required"); }
    if (origin.protocol !== "https:" || origin.origin !== options.deliveryOrigin || origin.username || origin.password
      || typeof options.basePath !== "string" || !/^(?:\/[A-Za-z0-9_-]+)*$/.test(options.basePath)
      || !options.privateRoots || !Object.keys(options.privateRoots).length || !Array.isArray(options.publicRoots) || !options.publicRoots.length
      || typeof options.manifests?.resolve !== "function" || typeof options.authorization?.authorize !== "function" || typeof options.reader?.readCurrentImage !== "function")
      throw TypeError("Explicit private roots, manifest index and current delivery authorization required");
    const roots: Record<string, string> = {};
    for (const [key, value] of Object.entries(options.privateRoots)) {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(key) || typeof value !== "string" || !path.isAbsolute(value)) throw TypeError("Explicit absolute private roots required"); roots[key] = path.resolve(value);
    }
    const publicRoots = options.publicRoots.map(p => { if (typeof p !== "string" || !path.isAbsolute(p)) throw TypeError("Explicit public roots required"); return path.resolve(p); });
    if (Object.values(roots).some(r => publicRoots.some(p => inside(p, r) || inside(r, p)))) throw TypeError("Private media must be separate from public trees");
    this.deliveryOrigin = origin.origin; this.basePath = options.basePath; this.roots = Object.freeze(roots); this.publicRoots = Object.freeze(publicRoots);
    this.manifests = options.manifests; this.authorization = options.authorization; this.reader = options.reader;
  }
  private checkedRead(read: ProductMediaRead): void {
    checkedProductActor(read.actor); activeProductRead(read.signal); entityId("product", read.productId);
    checkedProductGrant(read.grant, { productId: entityId("product", read.productId) });
    available(Array.isArray(read.images) && read.images.length <= 1000 && new Set(read.images.map(i => i.id)).size === read.images.length);
    for (const i of read.images) { entityId("product", i.id); available(i.productId === read.productId && typeof i.fileRef === "string" && i.fileRef.length > 0
      && typeof i.byteSize === "bigint" && i.byteSize > 0n && i.byteSize <= 8388608n && ["image/png", "image/jpeg", "image/webp"].includes(i.mime)); }
  }
  private checkedBlob(blob: PrivateProductMediaBlob): PrivateProductMediaBlob {
    available(blob && Object.hasOwn(this.roots, blob.rootKey) && typeof blob.relativePath === "string" && blob.relativePath.length > 0 && blob.relativePath.length <= 4096
      && !path.isAbsolute(blob.relativePath) && !/[\\\x00-\x1f%?#:]/.test(blob.relativePath)
      && blob.relativePath.split("/").every(s => s.length > 0 && s !== "." && s !== "..")
      && ["image/png", "image/jpeg", "image/webp"].includes(blob.mime) && typeof blob.byteSize === "bigint" && blob.byteSize > 0n && blob.byteSize <= 8388608n
      && typeof blob.sha256 === "string" && /^[a-f0-9]{64}$/.test(blob.sha256));
    return Object.freeze({ rootKey: blob.rootKey, relativePath: blob.relativePath, mime: blob.mime, byteSize: blob.byteSize, sha256: blob.sha256 });
  }
  private async mapped(read: ProductMediaRead): Promise<ReadonlyMap<string, PrivateProductMediaManifest>> {
    this.checkedRead(read); const raw = await this.manifests.resolve(read); activeProductRead(read.signal);
    available(raw instanceof Map && raw.size <= read.images.length); const result = new Map<string, PrivateProductMediaManifest>();
    // Index large manifest batches once. Single-item media deliveries keep the existing direct scan.
    const imagesById = raw.size > 1 ? new Map<string, ProductMediaRead["images"][number]>() : null;
    if (imagesById !== null) {
      for (const image of read.images) if (!imagesById.has(image.id)) imagesById.set(image.id, image);
    }
    for (const [id, input] of raw) {
      const image = imagesById === null ? read.images.find(i => i.id === id) : imagesById.get(id);
      available(image && input && input.imageId === id && input.productId === image.productId && input.fileRef === image.fileRef);
      const original = this.checkedBlob(input.original); available(original.mime === image.mime && original.byteSize === image.byteSize);
      let thumbnail: PrivateProductMediaManifest["thumbnail"] = null;
      if (input.thumbnail !== null) {
        const blob = this.checkedBlob(input.thumbnail);
        available(input.thumbnail.derivedFromOriginalSha256 === original.sha256 && (blob.rootKey !== original.rootKey || blob.relativePath !== original.relativePath));
        thumbnail = Object.freeze({ ...blob, derivedFromOriginalSha256: original.sha256 });
      }
      result.set(id, Object.freeze({ productId: image.productId, imageId: id, fileRef: image.fileRef, original, thumbnail }));
    }
    return result;
  }
  private link(manifest: PrivateProductMediaManifest, variant: "thumbnail" | "original"): ControlledProductMediaLink {
    return { imageId: manifest.imageId, variant, url: `${this.deliveryOrigin}${this.basePath}/products/media/${manifest.productId}/${manifest.imageId}/${fingerprint(manifest)}/${variant}` };
  }
  async resolveAvailableThumbnails(read: ProductMediaRead): Promise<readonly ControlledProductMediaLink[]> {
    const mapped = await this.mapped(read); return read.images.flatMap(i => { const m = mapped.get(i.id); return m?.thumbnail ? [this.link(m, "thumbnail")] : []; });
  }
  async resolveThumbnails(read: ProductMediaRead): Promise<readonly ControlledProductMediaLink[]> {
    const links = await this.resolveAvailableThumbnails(read); available(links.length === read.images.length); return links;
  }
  async resolveOriginal(read: ProductMediaRead): Promise<ControlledProductMediaLink> {
    available(read.images.length === 1); const mapped = await this.mapped(read), manifest = mapped.get(read.images[0]!.id); available(manifest); return this.link(manifest, "original");
  }
  private async bytes(blob: PrivateProductMediaBlob, signal: AbortSignal): Promise<Buffer> {
    activeProductRead(signal); const configured = this.roots[blob.rootKey]!;
    const root = await realpath(configured), rootInfo = await lstat(configured);
    available(!rootInfo.isSymbolicLink() && rootInfo.isDirectory() && (rootInfo.mode & 0o022) === 0 && root === configured);
    for (const publicRoot of this.publicRoots) {
      let canonical = publicRoot; try { canonical = await realpath(publicRoot); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
      available(!inside(canonical, root) && !inside(root, canonical));
    }
    let file = root; const segments = blob.relativePath.split("/");
    for (let n = 0; n < segments.length; n++) {
      file = path.join(file, segments[n]!); const info = await lstat(file); available(!info.isSymbolicLink() && inside(root, file));
      if (n < segments.length - 1) available(info.isDirectory() && (info.mode & 0o022) === 0); else available(info.isFile() && info.size === Number(blob.byteSize));
    }
    available(inside(root, await realpath(file))); const expected = await lstat(file);
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await handle.stat(); available(before.isFile() && before.dev === expected.dev && before.ino === expected.ino && before.size === Number(blob.byteSize));
      const result = Buffer.alloc(Number(blob.byteSize) + 1); let length = 0;
      while (length < result.length) { activeProductRead(signal); const chunk = await handle.read(result, length, result.length - length, length); if (chunk.bytesRead === 0) break; length += chunk.bytesRead; }
      const after = await handle.stat(), current = await lstat(file);
      available(length === Number(blob.byteSize) && after.size === before.size && after.mtimeMs === before.mtimeMs && after.ino === current.ino && after.dev === current.dev
        && !current.isSymbolicLink() && inside(root, await realpath(file)) && createHash("sha256").update(result.subarray(0, length)).digest("hex") === blob.sha256
        && productImageSignatureMatches(result.subarray(0, length), blob.mime));
      activeProductRead(signal); return result.subarray(0, length);
    } finally { await handle.close(); }
  }
  private async flushByteBatch(key: string, batch: PendingByteBatch, blob: PrivateProductMediaBlob): Promise<void> {
    // Seal before ANY filesystem path/descriptor verification. Later arrivals must start a new read.
    this.pendingByteBatches.delete(key);
    if (batch.waiters.size === 0) return;
    try {
      const bytes = await this.bytes(blob, batch.controller.signal);
      for (const waiter of batch.waiters) {
        // Keep the current waiter registered until its copy succeeds so the catch path can reject it.
        const result = batch.waiters.size === 1 ? bytes : Buffer.from(bytes);
        batch.waiters.delete(waiter);
        waiter.signal.removeEventListener("abort", waiter.abort);
        waiter.resolve(result);
      }
    } catch (error) {
      for (const waiter of batch.waiters) {
        waiter.signal.removeEventListener("abort", waiter.abort);
        waiter.reject(error);
      }
      batch.waiters.clear();
    }
  }
  private batchedBytes(key: string, blob: PrivateProductMediaBlob, signal: AbortSignal): Promise<Buffer> {
    activeProductRead(signal);
    let batch = this.pendingByteBatches.get(key);
    if (batch?.waiters.size === maxWaitersPerByteBatch) return this.bytes(blob, signal);
    if (!batch) {
      const next: PendingByteBatch = { controller: new AbortController(), waiters: new Set() };
      this.pendingByteBatches.set(key, next);
      setImmediate(() => { void this.flushByteBatch(key, next, blob); });
      batch = next;
    }
    const current = batch;
    return new Promise((resolve, reject) => {
      const waiter: BatchWaiter = {
        signal, resolve, reject, abort: () => {
          current.waiters.delete(waiter);
          // Before sealing a new valid waiter can still arrive; after sealing nobody can join.
          if (current.waiters.size === 0 && this.pendingByteBatches.get(key) !== current) current.controller.abort();
          try { activeProductRead(signal); } catch (error) { reject(error); }
        },
      };
      current.waiters.add(waiter);
      signal.addEventListener("abort", waiter.abort, { once: true });
    });
  }
  async deliver(input: ControlledProductMediaDelivery): Promise<ControlledProductMediaBytes> {
    const actor = checkedProductActor(input.actor), parameters = parseProductImageQuery({ productId: input.productId, imageId: input.imageId }); activeProductRead(input.signal);
    requireDomain(/^[a-f0-9]{64}$/.test(input.revision) && (input.variant === "thumbnail" || input.variant === "original"), "PRODUCT_IMAGE_NOT_FOUND", "Product image is unavailable");
    const grant = checkedProductGrant(await this.authorization.authorize(actor, { kind: "image", parameters }, input.signal), parameters); activeProductRead(input.signal);
    const image = await this.reader.readCurrentImage({ actor, grant, parameters, signal: input.signal }); activeProductRead(input.signal);
    requireDomain(image && image.id === parameters.imageId && image.productId === parameters.productId, "PRODUCT_IMAGE_NOT_FOUND", "Product image is unavailable");
    const mapped = await this.mapped({ actor, grant, productId: parameters.productId, images: [image], signal: input.signal }), manifest = mapped.get(image.id); available(manifest);
    requireDomain(fingerprint(manifest) === input.revision, "PRODUCT_IMAGE_NOT_FOUND", "Product image revision is unavailable");
    const blob = input.variant === "original" ? manifest.original : manifest.thumbnail; available(blob);
    // Only requests that independently passed the current grant, membership and mapping checks can join.
    const key = JSON.stringify([actor.accountId, actor.hallId, input.revision, input.variant, blob.rootKey,
      blob.relativePath, blob.mime, blob.byteSize.toString(), blob.sha256]);
    try {
      const bytes = await this.batchedBytes(key, blob, input.signal);
      activeProductRead(input.signal);
      return { mime: blob.mime, bytes };
    }
    catch (error) { if ((error as { code?: string }).code === "PRODUCT_READ_ABORTED") throw error; available(false); }
  }
}
