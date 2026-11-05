import { productImageSignatureMatches } from "./product-image-signature.ts";
import sharp from "sharp";
import type { Sharp, SharpOptions } from "sharp";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { DomainError, requireDomain } from "../../../packages/domain/src/errors.ts";
import type { ProductImageMime } from "../../../packages/application/src/product-query-ports.ts";

export const PRODUCT_IMAGE_CODEC_PROFILE = "SHARP_0_35_5_FULL_DECODE_V1" as const;
export const PRODUCT_IMAGE_CODEC_LIMITS = Object.freeze({ inputBytesMax: 8388608, dimensionMax: 8192, decodedPixelsMax: 20_000_000,
  channelsMax: 4, decodedBytesMax: 80_000_000, thumbnailWidthMax: 320, thumbnailHeightMax: 320, thumbnailBytesMax: 262144,
  processingSecondsMax: 10, activeCodecsMax: 1, queuedCodecsMax: 2 });
export interface ValidatedProductImage {
  readonly profile: typeof PRODUCT_IMAGE_CODEC_PROFILE;
  readonly original: { readonly bytes: Buffer; readonly mime: ProductImageMime; readonly byteSize: bigint; readonly sha256: string;
    readonly width: number; readonly height: number; readonly channels: number };
  readonly thumbnail: { readonly bytes: Buffer; readonly mime: "image/webp"; readonly byteSize: bigint; readonly sha256: string;
    readonly width: number; readonly height: number; readonly derivedFromOriginalSha256: string };
}
const limits = PRODUCT_IMAGE_CODEC_LIMITS;
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const failure = (code: string, message: string) => new DomainError(code, message);
function active(signal: AbortSignal): void { requireDomain(signal instanceof AbortSignal && !signal.aborted, "PRODUCT_READ_ABORTED", "Image processing cancelled"); }
function valid(ok: unknown, code = "INVALID_UPLOAD"): asserts ok { requireDomain(ok, code, "Image input is invalid or exceeds the frozen media contract"); }

// One shared gate across instances. A cancelled native operation keeps its lease until it settles.
type Waiter = { signal: AbortSignal; resolve(release: () => void): void; reject(error: Error): void; abort(): void };
const waiting: Waiter[] = []; let occupied = false;
/** Same module-global codec lease/queue, without input identities or mutation. */
export function productImageCodecSnapshot(): {readonly active: number; readonly queued: number} {
  return Object.freeze({active: occupied ? 1 : 0, queued: waiting.length});
}
function lease(): () => void {
  let released = false;
  return () => {
    if (released) return; released = true; occupied = false;
    while (waiting.length) {
      const next = waiting.shift()!; next.signal.removeEventListener("abort", next.abort);
      if (next.signal.aborted) { next.reject(failure("PRODUCT_READ_ABORTED", "Image processing cancelled")); continue; }
      occupied = true; next.resolve(lease()); break;
    }
  };
}
async function acquire(signal: AbortSignal): Promise<() => void> {
  active(signal); if (!occupied) { occupied = true; return lease(); }
  requireDomain(waiting.length < limits.queuedCodecsMax, "PRODUCT_MEDIA_NOT_READY", "Image processing capacity unavailable");
  return new Promise((resolve, reject) => {
    const waiter: Waiter = { signal, resolve, reject, abort() { const index = waiting.indexOf(waiter); if (index >= 0) waiting.splice(index, 1); signal.removeEventListener("abort", waiter.abort); reject(failure("PRODUCT_READ_ABORTED", "Image processing cancelled")); } };
    waiting.push(waiter); signal.addEventListener("abort", waiter.abort, { once: true }); if (signal.aborted) waiter.abort();
  });
}
function binaryFormat(bytes: Buffer): ProductImageMime {
  if (productImageSignatureMatches(bytes, "image/png")) {
    let offset = 8, ended = false;
    while (offset < bytes.length) {
      valid(offset + 12 <= bytes.length); const length = bytes.readUInt32BE(offset), type = bytes.toString("ascii", offset + 4, offset + 8);
      valid(length <= bytes.length - offset - 12); valid(type !== "acTL"); offset += length + 12;
      if (type === "IEND") { ended = true; break; }
    }
    valid(ended && offset === bytes.length); return "image/png";
  }
  if (productImageSignatureMatches(bytes, "image/jpeg")) {
    // Reject multi-picture JPEG containers rather than silently decoding their first image.
    let offset = 2;
    while (offset < bytes.length) {
      valid(bytes[offset] === 255); while (bytes[offset] === 255) offset++; const marker = bytes[offset++]; valid(marker !== undefined);
      if (marker === 218 || marker === 217) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      valid(offset + 2 <= bytes.length); const length = bytes.readUInt16BE(offset); valid(length >= 2 && offset + length <= bytes.length);
      valid(!(marker === 226 && bytes.toString("ascii", offset + 2, offset + 6) === "MPF\0")); offset += length;
    }
    return "image/jpeg";
  }
  if (productImageSignatureMatches(bytes, "image/webp")) {
    valid(bytes.readUInt32LE(4) + 8 === bytes.length); let offset = 12;
    while (offset < bytes.length) {
      valid(offset + 8 <= bytes.length); const type = bytes.toString("ascii", offset, offset + 4), length = bytes.readUInt32LE(offset + 4);
      valid(length <= bytes.length - offset - 8 && type !== "ANIM" && type !== "ANMF");
      if (type === "VP8X") valid(length >= 1 && (bytes[offset + 8]! & 2) === 0);
      offset += 8 + length + (length % 2);
    }
    valid(offset === bytes.length); return "image/webp";
  }
  throw failure("INVALID_MEDIA_TYPE", "Only binary PNG, JPEG and WEBP are supported");
}
/** Exact frozen Sharp implementation. No replaceable metadata-only decoder, global cache mutation,
 * filesystem or original re-encoding. Native operations have input bounds and a shared deadline. */
export class SharpProductImageCodec {
  readonly profile = PRODUCT_IMAGE_CODEC_PROFILE;
  constructor() {
    if (sharp.versions.sharp !== "0.35.5" || !["png", "jpeg", "webp"].every(f => sharp.format[f as "png"].input.buffer && sharp.format[f as "png"].output.buffer))
      throw TypeError("The frozen Sharp0.35.5 binary codecs are unavailable");
  }
  async decode(input: Uint8Array, declaredMime: string, signal: AbortSignal): Promise<ValidatedProductImage> {
    active(signal); valid(input instanceof Uint8Array && input.byteLength > 0); valid(input.byteLength <= limits.inputBytesMax, "MEDIA_TOO_LARGE");
    valid(["image/png", "image/jpeg", "image/webp"].includes(declaredMime), "INVALID_MEDIA_TYPE");
    const bytes = Buffer.from(input); valid(binaryFormat(bytes) === declaredMime, "INVALID_MEDIA_TYPE");
    const release = await acquire(signal), deadline = performance.now() + limits.processingSecondsMax * 1000;
    const pipelines = new Set<Sharp>(); let stopped: DomainError | undefined, rejectStop: (error: Error) => void = () => {};
    const stop = (error: DomainError) => { if (stopped) return; stopped = error; for (const pipeline of pipelines) pipeline.destroy(); rejectStop(error); };
    const check = () => { active(signal); if (stopped) throw stopped; requireDomain(performance.now() < deadline, "PRODUCT_MEDIA_NOT_READY", "Image processing deadline exceeded"); };
    const pipeline = (source: Buffer, options: SharpOptions) => {
      check(); const p = sharp(source, { ...options, failOn: "warning", limitInputChannels: limits.channelsMax, unlimited: false }).timeout({ seconds: Math.max(1, Math.ceil((deadline - performance.now()) / 1000)) }); pipelines.add(p); return p;
    };
    const stoppedPromise = new Promise<never>((_resolve, reject) => { rejectStop = reject; });
    const abort = () => stop(failure("PRODUCT_READ_ABORTED", "Image processing cancelled"));
    const timer = setTimeout(() => stop(failure("PRODUCT_MEDIA_NOT_READY", "Image processing deadline exceeded")), limits.processingSecondsMax * 1000);
    signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
    const work = (async (): Promise<ValidatedProductImage> => {
      try {
        check();
        // Header metadata is only preflight. No successful result exists until full raw decode below.
        const metadata = await pipeline(bytes, { limitInputPixels: false }).metadata(); check();
        const expectedFormat = declaredMime === "image/jpeg" ? "jpeg" : declaredMime.slice(6);
        valid(metadata.format === expectedFormat, "INVALID_MEDIA_TYPE");
        valid((metadata.pages ?? 1) === 1 && metadata.delay === undefined && metadata.loop === undefined);
        const { width, height, channels } = metadata;
        valid(Number.isSafeInteger(width) && width > 0 && width <= limits.dimensionMax && Number.isSafeInteger(height) && height > 0 && height <= limits.dimensionMax
          && width * height <= limits.decodedPixelsMax && Number.isSafeInteger(channels) && channels >= 1 && channels <= limits.channelsMax, "INVALID_MEDIA_DIMENSIONS");
        const depthBytes = ({ uchar: 1, char: 1, ushort: 2, short: 2, uint: 4, int: 4, float: 4, double: 8, complex: 8, dpcomplex: 16 } as Readonly<Record<string, number>>)[metadata.depth];
        valid(depthBytes !== undefined && width * height * channels * depthBytes <= limits.decodedBytesMax, "INVALID_MEDIA_DIMENSIONS");
        const decoded = await pipeline(bytes, { limitInputPixels: limits.decodedPixelsMax }).autoOrient().toColourspace("srgb").raw({ depth: "uchar" }).toBuffer({ resolveWithObject: true }); check();
        valid(decoded.info.width > 0 && decoded.info.width <= limits.dimensionMax && decoded.info.height > 0 && decoded.info.height <= limits.dimensionMax
          && decoded.info.channels >= 1 && decoded.info.channels <= limits.channelsMax && decoded.data.length === decoded.info.width * decoded.info.height * decoded.info.channels
          && decoded.data.length <= limits.decodedBytesMax, "INVALID_MEDIA_DIMENSIONS");
        const thumbnail = await pipeline(decoded.data, { limitInputPixels: limits.decodedPixelsMax, raw: { width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels } })
          .resize({ width: limits.thumbnailWidthMax, height: limits.thumbnailHeightMax, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true }); check();
        valid(thumbnail.info.format === "webp" && thumbnail.info.width > 0 && thumbnail.info.width <= Math.min(limits.thumbnailWidthMax, decoded.info.width)
          && thumbnail.info.height > 0 && thumbnail.info.height <= Math.min(limits.thumbnailHeightMax, decoded.info.height)
          && thumbnail.data.length > 0 && thumbnail.data.length <= limits.thumbnailBytesMax, "MEDIA_TOO_LARGE");
        const sha256 = hash(bytes);
        return Object.freeze({ profile: this.profile, original: Object.freeze({ bytes, mime: declaredMime as ProductImageMime, byteSize: BigInt(bytes.length), sha256, width, height, channels }),
          thumbnail: Object.freeze({ bytes: thumbnail.data, mime: "image/webp" as const, byteSize: BigInt(thumbnail.data.length), sha256: hash(thumbnail.data), width: thumbnail.info.width,
            height: thumbnail.info.height, derivedFromOriginalSha256: sha256 }) });
      } catch (error) { if (stopped) throw stopped; if (error instanceof DomainError) throw error; throw failure("INVALID_UPLOAD", "Image could not be fully decoded"); }
    })();
    const settled = work.finally(() => { clearTimeout(timer); signal.removeEventListener("abort", abort); for (const p of pipelines) p.destroy(); release(); });
    void settled.catch(() => {});
    // Abort/timeout replies promptly; the native job retains the shared lease until settled.
    return Promise.race([settled, stoppedPromise]);
  }
}
