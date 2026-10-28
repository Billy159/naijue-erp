/** Actual Sharp PNG/JPEG/WEBP encoding + full decode in isolated memory. No business files or host. */
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { SharpProductImageCodec, PRODUCT_IMAGE_CODEC_LIMITS, productImageCodecSnapshot } from "../adapters/media/src/sharp-product-image-codec.ts";
const signal = () => new AbortController().signal;
const encoded = async (format: "png" | "jpeg" | "webp", width = 64, height = 32) => sharp({ create: { width, height, channels: 4, background: { r: 42, g: 80, b: 120, alpha: 0.5 } } }).toFormat(format).toBuffer();
test('A02 codec snapshot is immutable and directly observes original active/queued cancellation and settle',async()=>{
  const codec=new SharpProductImageCodec(),bytes=await encoded('png'),before=productImageCodecSnapshot();assert.deepEqual(before,{active:0,queued:0});
  const first=codec.decode(bytes,'image/png',signal()),abort=new AbortController(),second=codec.decode(bytes,'image/png',abort.signal);
  const rejected=assert.rejects(second,{code:'PRODUCT_READ_ABORTED'}),held=productImageCodecSnapshot();assert.deepEqual(held,{active:1,queued:1});
  assert.throws(()=>{(held as {active:number}).active=0;},TypeError);abort.abort();await rejected;await first;
  assert.deepEqual(productImageCodecSnapshot(),{active:0,queued:0});assert.deepEqual(held,{active:1,queued:1});assert.deepEqual(before,{active:0,queued:0});
});
test("W16 codec actual PNG JPEG WEBP fully decode, preserve originals and derive independent bounded WEBP thumbnails", async () => {
  const codec = new SharpProductImageCodec();
  for (const format of ["png", "jpeg", "webp"] as const) {
    const bytes = await encoded(format), original = Buffer.from(bytes), mime = `image/${format}`;
    const result = await codec.decode(bytes, mime, signal());
    assert.deepEqual(bytes, original); assert.deepEqual(result.original.bytes, original); assert.equal(result.original.mime, mime);
    assert.equal(result.original.byteSize, BigInt(bytes.length)); assert.equal(result.original.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(result.thumbnail.derivedFromOriginalSha256, result.original.sha256); assert.notEqual(result.thumbnail.bytes, result.original.bytes);
    const meta = await sharp(result.thumbnail.bytes).metadata(); assert.equal(meta.format, "webp"); assert.equal(meta.width, 64); assert.equal(meta.height, 32);
    const full = await sharp(result.thumbnail.bytes, { failOn: "warning" }).raw().toBuffer(); assert.ok(full.length > 0); assert.ok(result.thumbnail.byteSize <= 262144n);
  }
});
test("W16 codec respects auto-orientation and fit-inside without enlarging or altering EXIF original", async () => {
  const bytes = await sharp({ create: { width: 640, height: 160, channels: 3, background: "#123456" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const result = await new SharpProductImageCodec().decode(bytes, "image/jpeg", signal()); assert.deepEqual(result.original.bytes, bytes);
  assert.equal(result.original.width, 640); assert.equal(result.original.height, 160); assert.equal(result.thumbnail.width, 80); assert.equal(result.thumbnail.height, 320);
});
test("W16 codec rejects mislabeled magic, unsupported files and valid-header corrupt/truncated pixel data", async () => {
  const codec = new SharpProductImageCodec(), png = await encoded("png"), jpeg = await encoded("jpeg");
  await assert.rejects(codec.decode(png, "image/jpeg", signal()), { code: "INVALID_MEDIA_TYPE" });
  await assert.rejects(codec.decode(Buffer.from("<svg></svg>"), "image/png", signal()), { code: "INVALID_MEDIA_TYPE" });
  await assert.rejects(codec.decode(jpeg.subarray(0, Math.floor(jpeg.length * 0.75)), "image/jpeg", signal()), { code: "INVALID_UPLOAD" });
  const corrupt = Buffer.from(png); const idat = corrupt.indexOf(Buffer.from("IDAT")); assert.ok(idat > 0); corrupt[idat + 5] = corrupt[idat + 5]! ^ 255;
  await assert.rejects(codec.decode(corrupt, "image/png", signal()), { code: "INVALID_UPLOAD" });
});
test("W16 codec rejects animated/multi-page WEBP and over-dimension/pixel/input bounds", async () => {
  const codec = new SharpProductImageCodec();
  const frames = Buffer.from([...Array.from({ length: 4 }, () => [255, 0, 0, 255]).flat(), ...Array.from({ length: 4 }, () => [0, 0, 255, 255]).flat()]);
  const animated = await sharp(frames, { raw: { width: 2, height: 4, channels: 4, pageHeight: 2 } }).webp({ lossless: true, loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2);
  await assert.rejects(codec.decode(animated, "image/webp", signal()), { code: "INVALID_UPLOAD" });
  await assert.rejects(codec.decode(await encoded("png", 8193, 1), "image/png", signal()), { code: "INVALID_MEDIA_DIMENSIONS" });
  await assert.rejects(codec.decode(await encoded("png", 5000, 4001), "image/png", signal()), { code: "INVALID_MEDIA_DIMENSIONS" });
  await assert.rejects(codec.decode(Buffer.alloc(PRODUCT_IMAGE_CODEC_LIMITS.inputBytesMax + 1), "image/png", signal()), { code: "MEDIA_TOO_LARGE" });
});
test("W16 codec shared active1/queue2 bound and queued/active cancellation never report successful late output", async () => {
  const bytes = await encoded("png", 1024, 1024), a = new SharpProductImageCodec(), b = new SharpProductImageCodec();
  const queued = new AbortController(), running = new AbortController();
  const first = a.decode(bytes, "image/png", running.signal), second = b.decode(bytes, "image/png", queued.signal), third = a.decode(bytes, "image/png", signal());
  const secondRejected = assert.rejects(second, { code: "PRODUCT_READ_ABORTED" }), firstRejected = assert.rejects(first, { code: "PRODUCT_READ_ABORTED" });
  await assert.rejects(b.decode(bytes, "image/png", signal()), { code: "PRODUCT_MEDIA_NOT_READY" });
  queued.abort(); running.abort(); await Promise.all([firstRejected, secondRejected]); await third;
  const aborted = new AbortController(); aborted.abort(); await assert.rejects(a.decode(bytes, "image/png", aborted.signal), { code: "PRODUCT_READ_ABORTED" });
});
test("W16 codec deadline rejects rather than returning a late native result", async t => {
  const bytes = await encoded("png", 512, 512); t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = new SharpProductImageCodec().decode(bytes, "image/png", signal());
  const rejected = assert.rejects(pending, { code: "PRODUCT_MEDIA_NOT_READY" });
  await Promise.resolve(); t.mock.timers.tick(10_000); await rejected;
});
