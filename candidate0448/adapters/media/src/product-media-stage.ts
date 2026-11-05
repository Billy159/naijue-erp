import { productImageSignatureMatches } from "./product-image-signature.ts";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, realpath } from "node:fs/promises";
import path from "node:path";
import { DomainError, requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { checkedProductActor, checkedProductGrant } from "../../../packages/application/src/product-query-validation.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { ProductImageMime, ProductMediaRead } from "../../../packages/application/src/product-query-ports.ts";
import type { PrivateProductMediaBlob, PrivateProductMediaManifest, PrivateProductMediaManifestResolver } from "./controlled-product-media.ts";
import { SharpProductImageCodec, PRODUCT_IMAGE_CODEC_PROFILE, PRODUCT_IMAGE_CODEC_LIMITS } from "./sharp-product-image-codec.ts";
import type { ValidatedProductImage } from "./sharp-product-image-codec.ts";

export const PRODUCT_MEDIA_STAGE_PROFILE = "PRIVATE_PRODUCT_MEDIA_STAGE_V1" as const;
export const PRODUCT_MEDIA_STAGE_EXPIRY_SECONDS = 86400;
export interface ProductMediaStageAuthorization {
  (input: { readonly actor: ActorContext; readonly productId: string | null; readonly commandKey: string; readonly purpose: "UPLOAD" | "CONSUME" }, signal: AbortSignal): Promise<void>;
}
export interface ProductMediaStageOptions {
  readonly root: string; readonly rootKey: string; readonly publicRoots: readonly string[];
  readonly codec: SharpProductImageCodec; readonly authorize: ProductMediaStageAuthorization; readonly now: () => Date;
}
export interface ProductMediaUploadInput {
  readonly actor: ActorContext; readonly productId: string | null; readonly commandKey: string; readonly uploadKey: string;
  readonly declaredMime: string; readonly bytes: Uint8Array; readonly signal: AbortSignal;
}
export interface ProductMediaUploadDto { readonly uploadId: string; readonly mime: ProductImageMime; readonly byteSize: string; readonly expiresAt: string }
export interface ProductMediaConsumeInput {
  readonly actor: ActorContext; readonly productId: string | null; readonly commandKey: string; readonly uploadId: string; readonly signal: AbortSignal;
}
/** Private command-side facts only. Never serialize these storage references as upload/HTTP output.
 * Native image ID and same-client image audit/receipt remain the actual root writer's responsibility. */
export interface PreparedProductMediaStage {
  readonly profile: typeof PRODUCT_MEDIA_STAGE_PROFILE; readonly uploadId: string; readonly fileRef: string;
  readonly actorAccountId: string; readonly productId: string | null; readonly commandKey: string; readonly uploadKey: string;
  readonly createdAt: string; readonly expiresAt: string; readonly original: PrivateProductMediaBlob;
  readonly thumbnail: PrivateProductMediaBlob & { readonly mime: "image/webp"; readonly derivedFromOriginalSha256: string };
}
type Binding = { actor: ActorContext; productId: string | null; commandKey: string };
type StoredBlob = { mime: ProductImageMime; byteSize: string; sha256: string; width: number; height: number; channels?: number; derivedFromOriginalSha256?: string };
type StoredStage = { format: typeof PRODUCT_MEDIA_STAGE_PROFILE; codecProfile: typeof PRODUCT_IMAGE_CODEC_PROFILE; uploadId: string; fileRef: string;
  actorAccountId: string; productId: string | null; commandKey: string; uploadKey: string; createdAt: string; expiresAt: string;
  original: StoredBlob & { channels: number }; thumbnail: StoredBlob & { mime: "image/webp"; derivedFromOriginalSha256: string } };
const limits = PRODUCT_IMAGE_CODEC_LIMITS;
function active(signal: AbortSignal): void { requireDomain(signal instanceof AbortSignal && !signal.aborted, "PRODUCT_READ_ABORTED", "Private media staging cancelled"); }
function ready(ok: unknown): asserts ok { requireDomain(ok, "PRODUCT_MEDIA_NOT_READY", "Private media staging is unavailable"); }
function input(ok: unknown): asserts ok { requireDomain(ok, "INVALID_UPLOAD", "Invalid original media upload binding"); }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  ready(value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);
  const r = value as Record<string, unknown>; ready(Reflect.ownKeys(r).length === keys.length && keys.every(k => Object.hasOwn(r, k))); return r;
}
const hash = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const key = (value: unknown): string => { input(typeof value === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(value)); return value; };
const scope = (value: unknown): string | null => { if (value === null) return null; input(typeof value === "string"); return entityId("product", value); };
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";
const contained = (root: string, target: string): boolean => { const rel = path.relative(root, target); return rel === "" || rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };
const stageKey = (actor: string, commandKey: string, uploadKey: string): string => hash(JSON.stringify([actor, commandKey, uploadKey]));
const storedId = (value: unknown): void => { ready(typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)); };

/** Private staging only: no product mutations, public mount, implicit grant, retry, delete or cleanup.
 * A complete immutable per-upload directory is fsynced before its manifest is exclusively hard-linked
 * into the original-key index. Concurrent losers remain private orphans; only the one indexed upload
 * is consumable. A replay re-reads the winning files rather than trusting an in-memory result. */
export class PrivateProductMediaStage {
  readonly profile = PRODUCT_MEDIA_STAGE_PROFILE;
  private readonly root: string; private readonly rootKey: string; private readonly publicRoots: readonly string[];
  private readonly codec: SharpProductImageCodec; private readonly authorize: ProductMediaStageAuthorization; private readonly now: () => Date;
  constructor(options: ProductMediaStageOptions) {
    if (!options || typeof options.root !== "string" || !path.isAbsolute(options.root) || path.resolve(options.root) !== options.root
      || typeof options.rootKey !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(options.rootKey)
      || !Array.isArray(options.publicRoots) || !options.publicRoots.length || options.publicRoots.some(p => typeof p !== "string" || !path.isAbsolute(p))
      || !(options.codec instanceof SharpProductImageCodec) || options.codec.profile !== PRODUCT_IMAGE_CODEC_PROFILE
      || typeof options.authorize !== "function" || typeof options.now !== "function") throw TypeError("Explicit private root, real codec, clock and actual scope authorization required");
    this.root = options.root; this.rootKey = options.rootKey; this.publicRoots = Object.freeze(options.publicRoots.map(p => path.resolve(p)));
    if (this.publicRoots.some(p => contained(p, this.root) || contained(this.root, p))) throw TypeError("Private staging must be separate from public trees");
    this.codec = options.codec; this.authorize = options.authorize; this.now = options.now;
  }
  private instant(): Date { const now = this.now(); ready(now instanceof Date && Number.isFinite(now.getTime())); return new Date(now.getTime()); }
  private async allowed(binding: Binding, purpose: "UPLOAD" | "CONSUME", signal: AbortSignal): Promise<void> {
    active(signal); const result: unknown = await this.authorize(Object.freeze({ ...binding, purpose }), signal); active(signal); ready(result === undefined);
  }
  private async privateDirectory(directory: string): Promise<void> {
    ready(contained(this.root, directory)); const info = await lstat(directory);
    ready(info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o777) === 0o700 && (typeof process.getuid !== "function" || info.uid === process.getuid()) && await realpath(directory) === directory);
  }
  private async syncDirectory(directory: string): Promise<void> {
    await this.privateDirectory(directory); const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await handle.sync(); } finally { await handle.close(); }
  }
  private async layout(signal: AbortSignal, create: boolean): Promise<void> {
    active(signal); await this.privateDirectory(this.root);
    for (const p of this.publicRoots) { let canonical = p; try { canonical = await realpath(p); } catch (e) { if (!isMissing(e)) throw e; } ready(!contained(canonical, this.root) && !contained(this.root, canonical)); }
    for (const name of ["stages", "keys"]) {
      const directory = path.join(this.root, name);
      if (create) try { await mkdir(directory, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
      await this.privateDirectory(directory);
    }
    if (create) await this.syncDirectory(this.root); active(signal);
  }
  private async immutableFile(file: string, bytes: Buffer, signal: AbortSignal): Promise<void> {
    active(signal); await this.privateDirectory(path.dirname(file));
    const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); const info = await handle.stat(); ready(info.isFile() && info.size === bytes.length && (info.mode & 0o777) === 0o600); active(signal); }
    finally { await handle.close(); }
  }
  private async boundedFile(file: string, maximum: number, signal: AbortSignal): Promise<Buffer> {
    active(signal); await this.privateDirectory(path.dirname(file)); const expected = await lstat(file);
    ready(expected.isFile() && !expected.isSymbolicLink() && (expected.mode & 0o777) === 0o600 && expected.size > 0 && expected.size <= maximum
      && (typeof process.getuid !== "function" || expected.uid === process.getuid()) && contained(this.root, await realpath(file)));
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await handle.stat(); ready(before.isFile() && before.dev === expected.dev && before.ino === expected.ino && before.size === expected.size);
      const buffer = Buffer.alloc(before.size + 1); let length = 0;
      while (length < buffer.length) { active(signal); const part = await handle.read(buffer, length, buffer.length - length, length); if (!part.bytesRead) break; length += part.bytesRead; }
      const after = await handle.stat(), current = await lstat(file);
      ready(length === before.size && after.size === before.size && after.mtimeMs === before.mtimeMs && after.ino === current.ino && after.dev === current.dev
        && !current.isSymbolicLink() && contained(this.root, await realpath(file))); active(signal); return buffer.subarray(0, length);
    } finally { await handle.close(); }
  }
  private record(bytes: Buffer): StoredStage {
    let parsed: unknown; try { parsed = JSON.parse(bytes.toString("utf8")); } catch { ready(false); }
    const r = exact(parsed, ["format", "codecProfile", "uploadId", "fileRef", "actorAccountId", "productId", "commandKey", "uploadKey", "createdAt", "expiresAt", "original", "thumbnail"]);
    ready(r.format === PRODUCT_MEDIA_STAGE_PROFILE && r.codecProfile === PRODUCT_IMAGE_CODEC_PROFILE); storedId(r.uploadId); storedId(r.actorAccountId); if (r.productId !== null) storedId(r.productId);
    ready(typeof r.commandKey === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(r.commandKey) && typeof r.uploadKey === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(r.uploadKey)
      && r.fileRef === `staged-product-media:${r.uploadId}` && typeof r.createdAt === "string" && typeof r.expiresAt === "string");
    const created = Date.parse(r.createdAt), expires = Date.parse(r.expiresAt);
    ready(Number.isFinite(created) && Number.isFinite(expires) && new Date(created).toISOString() === r.createdAt && new Date(expires).toISOString() === r.expiresAt
      && expires - created === PRODUCT_MEDIA_STAGE_EXPIRY_SECONDS * 1000);
    const o = exact(r.original, ["mime", "byteSize", "sha256", "width", "height", "channels"]), t = exact(r.thumbnail, ["mime", "byteSize", "sha256", "width", "height", "derivedFromOriginalSha256"]);
    for (const [b, maximum, dimension] of [[o, limits.inputBytesMax, limits.dimensionMax], [t, limits.thumbnailBytesMax, 320]] as const) {
      ready(["image/png", "image/jpeg", "image/webp"].includes(b.mime as string) && typeof b.byteSize === "string" && /^[1-9]\d{0,7}$/.test(b.byteSize) && BigInt(b.byteSize) <= BigInt(maximum)
        && typeof b.sha256 === "string" && /^[a-f0-9]{64}$/.test(b.sha256) && typeof b.width === "number" && Number.isSafeInteger(b.width) && b.width > 0 && b.width <= dimension
        && typeof b.height === "number" && Number.isSafeInteger(b.height) && b.height > 0 && b.height <= dimension);
    }
    ready(typeof o.channels === "number" && Number.isSafeInteger(o.channels) && o.channels >= 1 && o.channels <= 4 && (o.width as number) * (o.height as number) <= limits.decodedPixelsMax
      && t.mime === "image/webp" && t.derivedFromOriginalSha256 === o.sha256 && (t.width as number) * (t.height as number) <= (o.width as number) * (o.height as number));
    return r as unknown as StoredStage;
  }
  private async published(index: string, signal: AbortSignal): Promise<{ bytes: Buffer; record: StoredStage } | null> {
    try { const bytes = await this.boundedFile(path.join(this.root, "keys", `${index}.json`), 16384, signal); const record = this.record(bytes);
      ready(stageKey(record.actorAccountId, record.commandKey, record.uploadKey) === index); return { bytes, record };
    } catch (error) { if (isMissing(error)) return null; throw error; }
  }
  /** Read-only path index for trusted native DB metadata. This is not an attachment or access grant.
   * Upload expiry only limits future attachment: existing committed native images remain readable.
   * The controlled byte provider MUST still freshly authorize/read native membership on every GET.
   * Resolving this batch reads only manifests/index JSON, never original or thumbnail bytes. */
  createManifestResolver(): PrivateProductMediaManifestResolver {
    return Object.freeze({ resolve: (read: ProductMediaRead) => this.resolveNativeManifests(read) });
  }
  private async resolveNativeManifests(read: ProductMediaRead): Promise<ReadonlyMap<string, PrivateProductMediaManifest>> {
    active(read.signal); checkedProductActor(read.actor); const productId = entityId("product", read.productId); checkedProductGrant(read.grant, { productId });
    ready(Array.isArray(read.images) && read.images.length <= 1000 && new Set(read.images.map(i => i.id)).size === read.images.length);
    const references = new Map<string, string>();
    for (const image of read.images) {
      entityId("product", image.id); ready(image.productId === productId && typeof image.fileRef === "string" && typeof image.byteSize === "bigint"
        && image.byteSize > 0n && image.byteSize <= BigInt(limits.inputBytesMax) && ["image/png", "image/jpeg", "image/webp"].includes(image.mime));
      if (!image.fileRef.startsWith("staged-product-media:")) continue; // Legacy refs require their own explicitly approved mapping.
      const uploadId = image.fileRef.slice("staged-product-media:".length); storedId(uploadId); references.set(image.id, uploadId);
    }
    const result = new Map<string, PrivateProductMediaManifest>(); if (!references.size) return result;
    try {
      await this.layout(read.signal, false); const cached = new Map<string, StoredStage>(), missingThumbnails = new Set<string>();
      for (const image of read.images) {
        const uploadId = references.get(image.id); if (!uploadId) continue;
        let record = cached.get(uploadId);
        if (!record) {
          const bytes = await this.boundedFile(path.join(this.root, "stages", uploadId, "manifest.json"), 16384, read.signal); record = this.record(bytes);
          const indexed = await this.published(stageKey(record.actorAccountId, record.commandKey, record.uploadKey), read.signal);
          ready(record.uploadId === uploadId && indexed?.record.uploadId === uploadId && indexed.bytes.equals(bytes));
          try {
            const thumbnail = await lstat(path.join(this.root, "stages", uploadId, "thumbnail.webp"));
            ready(thumbnail.isFile() && !thumbnail.isSymbolicLink() && (thumbnail.mode & 0o777) === 0o600 && BigInt(thumbnail.size).toString() === record.thumbnail.byteSize
              && (typeof process.getuid !== "function" || thumbnail.uid === process.getuid()));
          } catch (error) { if (!isMissing(error)) throw error; missingThumbnails.add(uploadId); }
          cached.set(uploadId, record);
        }
        ready(record.fileRef === image.fileRef && (record.productId === null || record.productId === productId)
          && record.original.mime === image.mime && BigInt(record.original.byteSize) === image.byteSize);
        result.set(image.id, Object.freeze({ productId, imageId: image.id, fileRef: image.fileRef,
          original: Object.freeze({ rootKey: this.rootKey, relativePath: `stages/${uploadId}/original.bin`, mime: record.original.mime, byteSize: BigInt(record.original.byteSize), sha256: record.original.sha256 }),
          thumbnail: missingThumbnails.has(uploadId) ? null : Object.freeze({ rootKey: this.rootKey, relativePath: `stages/${uploadId}/thumbnail.webp`, mime: "image/webp" as const, byteSize: BigInt(record.thumbnail.byteSize), sha256: record.thumbnail.sha256, derivedFromOriginalSha256: record.original.sha256 }) }));
      }
      active(read.signal); return result;
    } catch (error) { if (error instanceof DomainError) throw error; throw new DomainError("PRODUCT_MEDIA_NOT_READY", "Native image private mapping could not be verified"); }
  }
  private async verified(record: StoredStage, bytes: Buffer, signal: AbortSignal): Promise<PreparedProductMediaStage> {
    active(signal); const now = this.instant().getTime(); ready(now >= Date.parse(record.createdAt));
    requireDomain(now < Date.parse(record.expiresAt), "UPLOAD_EXPIRED", "Original staged media expired");
    const directory = path.join(this.root, "stages", record.uploadId); await this.privateDirectory(directory);
    const manifest = await this.boundedFile(path.join(directory, "manifest.json"), 16384, signal); ready(manifest.equals(bytes));
    const indexed = await this.published(stageKey(record.actorAccountId, record.commandKey, record.uploadKey), signal); ready(indexed?.bytes.equals(bytes) && indexed.record.uploadId === record.uploadId);
    const original = await this.boundedFile(path.join(directory, "original.bin"), limits.inputBytesMax, signal), thumbnail = await this.boundedFile(path.join(directory, "thumbnail.webp"), limits.thumbnailBytesMax, signal);
    ready(BigInt(original.length).toString() === record.original.byteSize && hash(original) === record.original.sha256 && BigInt(thumbnail.length).toString() === record.thumbnail.byteSize && hash(thumbnail) === record.thumbnail.sha256);
    const mime = record.original.mime;
    ready(productImageSignatureMatches(original, mime));
    ready(productImageSignatureMatches(thumbnail, "image/webp"));
    active(signal); const verifiedAt = this.instant().getTime(); ready(verifiedAt >= Date.parse(record.createdAt));
    requireDomain(verifiedAt < Date.parse(record.expiresAt), "UPLOAD_EXPIRED", "Original staged media expired");
    return Object.freeze({ profile: this.profile, uploadId: record.uploadId, fileRef: record.fileRef, actorAccountId: record.actorAccountId, productId: record.productId,
      commandKey: record.commandKey, uploadKey: record.uploadKey, createdAt: record.createdAt, expiresAt: record.expiresAt,
      original: Object.freeze({ rootKey: this.rootKey, relativePath: `stages/${record.uploadId}/original.bin`, mime: record.original.mime, byteSize: BigInt(record.original.byteSize), sha256: record.original.sha256 }),
      thumbnail: Object.freeze({ rootKey: this.rootKey, relativePath: `stages/${record.uploadId}/thumbnail.webp`, mime: "image/webp" as const, byteSize: BigInt(record.thumbnail.byteSize), sha256: record.thumbnail.sha256, derivedFromOriginalSha256: record.original.sha256 }) });
  }
  private matches(record: StoredStage, binding: Binding): void {
    requireDomain(record.actorAccountId === binding.actor.accountId && record.productId === binding.productId && record.commandKey === binding.commandKey, "MEDIA_SCOPE_MISMATCH", "Original media stage belongs to another command scope");
  }
  private async durableResult(prepared: PreparedProductMediaStage, signal: AbortSignal): Promise<ProductMediaUploadDto> {
    // Every success, including recovery of an already-linked index, must persist that directory.
    active(signal); await this.syncDirectory(path.join(this.root, "keys")); active(signal);
    return { uploadId: prepared.uploadId, mime: prepared.original.mime, byteSize: prepared.original.byteSize.toString(), expiresAt: prepared.expiresAt };
  }
  private stored(binding: Binding, uploadKey: string, uploadId: string, decoded: ValidatedProductImage): StoredStage {
    const created = this.instant(), expires = new Date(created.getTime() + PRODUCT_MEDIA_STAGE_EXPIRY_SECONDS * 1000); ready(Number.isFinite(expires.getTime()));
    return { format: this.profile, codecProfile: decoded.profile, uploadId, fileRef: `staged-product-media:${uploadId}`, actorAccountId: binding.actor.accountId,
      productId: binding.productId, commandKey: binding.commandKey, uploadKey, createdAt: created.toISOString(), expiresAt: expires.toISOString(),
      original: { mime: decoded.original.mime, byteSize: decoded.original.byteSize.toString(), sha256: decoded.original.sha256, width: decoded.original.width, height: decoded.original.height, channels: decoded.original.channels },
      thumbnail: { mime: "image/webp", byteSize: decoded.thumbnail.byteSize.toString(), sha256: decoded.thumbnail.sha256, width: decoded.thumbnail.width,
        height: decoded.thumbnail.height, derivedFromOriginalSha256: decoded.thumbnail.derivedFromOriginalSha256 } };
  }
  async stage(value: ProductMediaUploadInput): Promise<ProductMediaUploadDto> {
    const signal = value.signal, declaredMime = value.declaredMime;
    const binding = { actor: checkedProductActor(value.actor), productId: scope(value.productId), commandKey: key(value.commandKey) }, uploadKey = key(value.uploadKey); active(signal);
    input(value.bytes instanceof Uint8Array && value.bytes.byteLength > 0);
    requireDomain(["image/png", "image/jpeg", "image/webp"].includes(declaredMime), "INVALID_MEDIA_TYPE", "Only supported binary image MIME is accepted");
    requireDomain(value.bytes.byteLength <= limits.inputBytesMax, "MEDIA_TOO_LARGE", "Original image exceeds storage limit");
    const bytes = Buffer.from(value.bytes), digest = hash(bytes), index = stageKey(binding.actor.accountId, binding.commandKey, uploadKey);
    await this.allowed(binding, "UPLOAD", signal);
    try {
      await this.layout(signal, true);
      const replay = async (winner: { record: StoredStage; bytes: Buffer }) => {
        const r = winner.record;
        requireDomain(r.actorAccountId === binding.actor.accountId && r.commandKey === binding.commandKey && r.uploadKey === uploadKey && r.productId === binding.productId
          && r.original.sha256 === digest && r.original.byteSize === bytes.length.toString() && r.original.mime === declaredMime, "IDEMPOTENCY_CONFLICT", "Original upload key has different content or scope");
        return await this.durableResult(await this.verified(r, winner.bytes, signal), signal);
      };
      const prior = await this.published(index, signal); if (prior) return await replay(prior);
      const decoded = await this.codec.decode(bytes, declaredMime, signal); active(signal);
      ready(decoded.profile === PRODUCT_IMAGE_CODEC_PROFILE && decoded.original.sha256 === digest && decoded.original.bytes.equals(bytes) && decoded.thumbnail.derivedFromOriginalSha256 === digest);
      await this.allowed(binding, "UPLOAD", signal);
      const completed = await this.published(index, signal); if (completed) return await replay(completed);
      const uploadId = randomUUID(), record = this.stored(binding, uploadKey, uploadId, decoded), directory = path.join(this.root, "stages", uploadId);
      await mkdir(directory, { mode: 0o700 }); await this.privateDirectory(directory);
      await this.immutableFile(path.join(directory, "original.bin"), decoded.original.bytes, signal);
      await this.immutableFile(path.join(directory, "thumbnail.webp"), decoded.thumbnail.bytes, signal);
      const manifest = Buffer.from(JSON.stringify(record)); await this.immutableFile(path.join(directory, "manifest.json"), manifest, signal);
      await this.syncDirectory(directory); await this.syncDirectory(path.join(this.root, "stages")); active(signal);
      try { await link(path.join(directory, "manifest.json"), path.join(this.root, "keys", `${index}.json`)); }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        const winner = await this.published(index, signal); ready(winner); return await replay(winner);
      }
      await this.syncDirectory(this.root);
      return await this.durableResult(await this.verified(record, manifest, signal), signal);
    } catch (error) { if (error instanceof DomainError) throw error; throw new DomainError("PRODUCT_MEDIA_NOT_READY", "Private media stage could not be verified"); }
  }
  async consume(value: ProductMediaConsumeInput): Promise<PreparedProductMediaStage> {
    const signal = value.signal, uploadId = value.uploadId;
    const binding = { actor: checkedProductActor(value.actor), productId: scope(value.productId), commandKey: key(value.commandKey) }; active(signal);
    input(typeof uploadId === "string"); entityId("product", uploadId); await this.allowed(binding, "CONSUME", signal);
    try {
      await this.layout(signal, false); const directory = path.join(this.root, "stages", uploadId);
      let bytes: Buffer;
      try { bytes = await this.boundedFile(path.join(directory, "manifest.json"), 16384, signal); }
      catch (error) { if (isMissing(error)) throw new DomainError("INVALID_UPLOAD", "Original upload is unavailable"); throw error; }
      const record = this.record(bytes); ready(record.uploadId === uploadId); this.matches(record, binding);
      return await this.verified(record, bytes, signal);
    } catch (error) { if (error instanceof DomainError) throw error; throw new DomainError("PRODUCT_MEDIA_NOT_READY", "Private media stage could not be verified"); }
  }
}
