/** Real codec + disposable private files. Authorization is synthetic; no real account, DB or host. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, readdir, readFile, writeFile, lstat, chmod, symlink, unlink, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { PrivateProductMediaStage, PRODUCT_MEDIA_STAGE_EXPIRY_SECONDS } from "../adapters/media/src/product-media-stage.ts";
import type { ProductMediaStageAuthorization, ProductMediaUploadInput } from "../adapters/media/src/product-media-stage.ts";
import { SharpProductImageCodec } from "../adapters/media/src/sharp-product-image-codec.ts";
import { PrivateControlledProductMedia } from "../adapters/media/src/controlled-product-media.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const productId = sid("product", 16001), nativeImageId = sid("product", 16002);
const signal = () => new AbortController().signal;
const fixtureImage = (colour = "#123456", format: "png" | "jpeg" | "webp" = "png") => sharp({ create: { width: 80, height: 40, channels: 3, background: colour } }).toFormat(format).toBuffer();
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), "media-stage-synthetic-")); t.after(() => rm(root, { recursive: true, force: true }));
  let now = new Date("2026-10-22T12:00:00.000Z"), allowed = true;
  const authorizations: { actor: string; productId: string | null; commandKey: string; purpose: string }[] = [];
  const authorize: ProductMediaStageAuthorization = async (input, signal) => { assert.ok(!signal.aborted); authorizations.push({ actor: input.actor.accountId, productId: input.productId, commandKey: input.commandKey, purpose: input.purpose }); if (!allowed) throw new DomainError("FORBIDDEN", "SYNTHETIC_CURRENT_ROLE_DENIED"); };
  const options = { root, rootKey: "synthetic", publicRoots: [root + "-public"], codec: new SharpProductImageCodec(), authorize, now: () => now };
  const store = new PrivateProductMediaStage(options), bytes = await fixtureImage();
  const input: ProductMediaUploadInput = { actor, productId, commandKey: "original-command-1", uploadKey: "original-file-1", declaredMime: "image/png", bytes, signal: signal() };
  const consume = (uploadId: string) => store.consume({ actor, productId, commandKey: input.commandKey, uploadId, signal: signal() });
  return { root, options, store, input, consume, authorizations, advance: (milliseconds: number) => { now = new Date(now.getTime() + milliseconds); }, revoke: () => { allowed = false; } };
}
test("W16 stage actual PNG JPEG WEBP writes private durable facts and exact public DTO; consumption rereads immutable files", async t => {
  const f = await fixture(t);
  for (const format of ["png", "jpeg", "webp"] as const) {
    const bytes = await fixtureImage("#123456", format), request = { ...f.input, uploadKey: `file-${format}`, declaredMime: `image/${format}`, bytes };
    const uploaded = await f.store.stage(request); assert.deepEqual(Object.keys(uploaded).sort(), ["byteSize", "expiresAt", "mime", "uploadId"]);
    assert.equal(uploaded.byteSize, bytes.length.toString()); assert.equal(uploaded.mime, request.declaredMime); assert.equal(uploaded.expiresAt, "2026-10-23T12:00:00.000Z");
    assert.doesNotMatch(JSON.stringify(uploaded), /original-command|fileRef|sha256|relativePath|actor|stages/);
    const prepared = await f.consume(uploaded.uploadId); assert.equal(prepared.actorAccountId, actor.accountId); assert.equal(prepared.productId, productId);
    assert.equal(prepared.commandKey, f.input.commandKey); assert.notEqual(prepared.uploadId, nativeImageId); assert.ok(!Object.hasOwn(prepared, "imageId"));
    assert.equal(prepared.thumbnail.derivedFromOriginalSha256, prepared.original.sha256); assert.equal(prepared.thumbnail.mime, "image/webp");
    assert.equal(prepared.original.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.deepEqual(await readFile(path.join(f.root, prepared.original.relativePath)), bytes);
    assert.equal((await lstat(path.join(f.root, "stages", uploaded.uploadId))).mode & 0o777, 0o700);
    for (const name of ["manifest.json", "original.bin", "thumbnail.webp"]) assert.equal((await lstat(path.join(f.root, "stages", uploaded.uploadId, name))).mode & 0o777, 0o600);
    assert.ok(Object.isFrozen(prepared) && Object.isFrozen(prepared.original));
  }
  assert.ok(f.authorizations.some(a => a.purpose === "UPLOAD") && f.authorizations.some(a => a.purpose === "CONSUME"));
});
test("W16 same-key replay rereads winner; concurrent instances publish one consumable identity and changed scope/content conflicts", async t => {
  const f = await fixture(t), other = new PrivateProductMediaStage(f.options);
  const [a, b] = await Promise.all([f.store.stage(f.input), other.stage(f.input)]); assert.deepEqual(a, b);
  assert.deepEqual(await f.store.stage(f.input), a); assert.equal((await readdir(path.join(f.root, "keys"))).length, 1);
  for (const change of [{ bytes: await fixtureImage("#cc5511") }, { productId: null }, { declaredMime: "image/jpeg" }])
    await assert.rejects(f.store.stage({ ...f.input, ...change }), { code: "IDEMPOTENCY_CONFLICT" });
  for (const uploadId of await readdir(path.join(f.root, "stages"))) if (uploadId !== a.uploadId)
    await assert.rejects(f.consume(uploadId), { code: "PRODUCT_MEDIA_NOT_READY" });
});
test("W16 original stage binding separates actor/root/draft/command and rechecks current authorization before consuming", async t => {
  const f = await fixture(t), uploaded = await f.store.stage(f.input);
  for (const change of [{ actor: { ...actor, accountId: sid("account", 16999) } }, { productId: sid("product", 16998) }, { productId: null }, { commandKey: "other-command" }])
    await assert.rejects(f.store.consume({ actor, productId, commandKey: f.input.commandKey, uploadId: uploaded.uploadId, signal: signal(), ...change }), { code: "MEDIA_SCOPE_MISMATCH" });
  const draft = await f.store.stage({ ...f.input, productId: null, commandKey: "new-create-original-key" });
  const prepared = await f.store.consume({ actor, productId: null, commandKey: "new-create-original-key", uploadId: draft.uploadId, signal: signal() }); assert.equal(prepared.productId, null);
  f.revoke(); await assert.rejects(f.consume(uploaded.uploadId), { code: "FORBIDDEN" }); await assert.rejects(f.store.stage(f.input), { code: "FORBIDDEN" });
});
test("W16 expiry retains original/thumbnail/manifest/index and never creates replacement under the old key", async t => {
  const f = await fixture(t), uploaded = await f.store.stage(f.input), directory = path.join(f.root, "stages", uploaded.uploadId);
  const original = await readFile(path.join(directory, "original.bin")), before = await readdir(directory), indexes = await readdir(path.join(f.root, "keys"));
  f.advance(PRODUCT_MEDIA_STAGE_EXPIRY_SECONDS * 1000);
  await assert.rejects(f.consume(uploaded.uploadId), { code: "UPLOAD_EXPIRED" }); await assert.rejects(f.store.stage(f.input), { code: "UPLOAD_EXPIRED" });
  assert.deepEqual(await readdir(directory), before); assert.deepEqual(await readdir(path.join(f.root, "keys")), indexes); assert.deepEqual(await readFile(path.join(directory, "original.bin")), original);
});
test("W16 before-save reread rejects corrupt blobs/manifest or missing publication and keeps every retained file", async t => {
  for (const fault of ["original", "thumbnail", "manifest", "unpublished"] as const) {
    const f = await fixture(t), uploaded = await f.store.stage(f.input), directory = path.join(f.root, "stages", uploaded.uploadId);
    if (fault === "original" || fault === "thumbnail") await writeFile(path.join(directory, fault === "original" ? "original.bin" : "thumbnail.webp"), Buffer.from("PRIVATE_CORRUPTION"));
    if (fault === "manifest") { const file = path.join(directory, "manifest.json"), record = JSON.parse((await readFile(file)).toString()); record.actorAccountId = "BAD_ID"; await writeFile(file, JSON.stringify(record)); }
    if (fault === "unpublished") for (const name of await readdir(path.join(f.root, "keys"))) await unlink(path.join(f.root, "keys", name));
    await assert.rejects(f.consume(uploaded.uploadId), { code: "PRODUCT_MEDIA_NOT_READY" }); assert.equal((await readdir(directory)).length, 3);
  }
});
test("W16 private roots and nofollow checks reject public aliases, symlinked file/directory and unsafe modes", async t => {
  const f = await fixture(t); assert.throws(() => new PrivateProductMediaStage({ ...f.options, publicRoots: [f.root] }), /separate/);
  const uploaded = await f.store.stage(f.input), directory = path.join(f.root, "stages", uploaded.uploadId), thumbnail = path.join(directory, "thumbnail.webp");
  await unlink(thumbnail); await symlink(path.join(directory, "original.bin"), thumbnail); await assert.rejects(f.consume(uploaded.uploadId), { code: "PRODUCT_MEDIA_NOT_READY" });
  const g = await fixture(t); await chmod(g.root, 0o755); await assert.rejects(g.store.stage(g.input), { code: "PRODUCT_MEDIA_NOT_READY" });
  const h = await fixture(t), alias = h.root + "-public-alias"; await symlink(h.root, alias); t.after(() => unlink(alias));
  await assert.rejects(new PrivateProductMediaStage({ ...h.options, publicRoots: [alias] }).stage(h.input), { code: "PRODUCT_MEDIA_NOT_READY" });
});
test("W16 cancelled/invalid uploads and non-authorizing callbacks never manufacture a successful stage", async t => {
  const f = await fixture(t), controller = new AbortController(); controller.abort();
  await assert.rejects(f.store.stage({ ...f.input, signal: controller.signal }), { code: "PRODUCT_READ_ABORTED" });
  assert.deepEqual(await readdir(f.root), []);
  await assert.rejects(f.store.stage({ ...f.input, bytes: Buffer.from("<svg>not an approved image</svg>") }), { code: "INVALID_MEDIA_TYPE" });
  assert.deepEqual(await readdir(path.join(f.root, "keys")), []); assert.deepEqual(await readdir(path.join(f.root, "stages")), []);
  await assert.rejects(f.store.stage({ ...f.input, uploadKey: "../path" }), { code: "INVALID_UPLOAD" });
  const falseAuthority = new PrivateProductMediaStage({ ...f.options, authorize: (async () => true) as unknown as ProductMediaStageAuthorization });
  await assert.rejects(falseAuthority.stage(f.input), { code: "PRODUCT_MEDIA_NOT_READY" });
});
test("W16 prepared stage blobs interoperate with controlled delivery without copying upload UUID into native image identity", async t => {
  const f = await fixture(t), uploaded = await f.store.stage(f.input), prepared = await f.consume(uploaded.uploadId);
  const image = { id: nativeImageId, productId, fileRef: prepared.fileRef, mime: prepared.original.mime, byteSize: prepared.original.byteSize, displayOrder: 0 };
  const manifest = { imageId: nativeImageId, productId, fileRef: prepared.fileRef, original: prepared.original, thumbnail: prepared.thumbnail };
  let grants = 0;
  const provider = new PrivateControlledProductMedia({ deliveryOrigin: "https://synthetic.invalid", basePath: "/api", privateRoots: { synthetic: f.root }, publicRoots: f.options.publicRoots,
    manifests: { async resolve() { return new Map([[nativeImageId, manifest]]); } }, authorization: { async authorize() { grants++; return { productId }; } }, reader: { async readCurrentImage() { return image; } } });
  const read = { actor, productId, grant: { productId }, images: [image], signal: signal() };
  for (const variant of ["thumbnail", "original"] as const) {
    const link = variant === "thumbnail" ? (await provider.resolveThumbnails(read))[0]! : await provider.resolveOriginal(read), revision = new URL(link.url).pathname.split("/").at(-2)!;
    const result = await provider.deliver({ actor, productId, imageId: nativeImageId, revision, variant, signal: signal() });
    assert.equal(result.mime, variant === "thumbnail" ? "image/webp" : "image/png"); if (variant === "original") assert.deepEqual(result.bytes, f.input.bytes);
  }
  assert.equal(grants, 2); assert.notEqual(nativeImageId, uploaded.uploadId);
});
test("W16 stage captures original upload input before awaits and consumption is nondestructive for original-key recovery", async t => {
  const f = await fixture(t), original = Buffer.from(f.input.bytes), mutable = { ...f.input }, pending = f.store.stage(mutable);
  (mutable.bytes as Buffer).fill(0); mutable.declaredMime = "image/jpeg";
  const uploaded = await pending, a = await f.consume(uploaded.uploadId), b = await f.consume(uploaded.uploadId);
  assert.deepEqual(a, b); assert.equal(uploaded.mime, "image/png"); assert.equal(a.original.sha256, createHash("sha256").update(original).digest("hex"));
  assert.deepEqual(await readFile(path.join(f.root, a.original.relativePath)), original);
});
test("W16 upload authorization revoked during full decode stops publication and retains a closed stage index", async t => {
  const f = await fixture(t); let checks = 0;
  const store = new PrivateProductMediaStage({ ...f.options, authorize: async () => { if (++checks > 1) throw new DomainError("FORBIDDEN", "SYNTHETIC_CURRENT_REVOCATION"); } });
  await assert.rejects(store.stage(f.input), { code: "FORBIDDEN" }); assert.equal(checks, 2);
  assert.deepEqual(await readdir(path.join(f.root, "keys")), []); assert.deepEqual(await readdir(path.join(f.root, "stages")), []);
});
test("W16 two independent processes publish only one original-key stage identity", async t => {
  const f = await fixture(t), barrier = path.join(f.root, "synthetic-child-barrier"); await mkdir(barrier, { mode: 0o700 });
  const stageUrl = new URL("../adapters/media/src/product-media-stage.ts", import.meta.url).href, codecUrl = new URL("../adapters/media/src/sharp-product-image-codec.ts", import.meta.url).href;
  const script = `import {PrivateProductMediaStage} from ${JSON.stringify(stageUrl)};
import {SharpProductImageCodec} from ${JSON.stringify(codecUrl)};
import {writeFile,readdir} from 'node:fs/promises';
const root=process.argv[1], tag=process.argv[2], actor=${JSON.stringify(actor)}, productId=${JSON.stringify(productId)};
let calls=0;
const store=new PrivateProductMediaStage({root,rootKey:'synthetic',publicRoots:[root+'-public'],codec:new SharpProductImageCodec(),now:()=>new Date('2026-10-22T12:00:00.000Z'),authorize:async()=>{
 if(++calls!==1)return;
 await writeFile(root+'/synthetic-child-barrier/'+tag,'ready',{mode:0o600,flag:'wx'});
 const deadline=Date.now()+5000;
 while((await readdir(root+'/synthetic-child-barrier')).length<2){if(Date.now()>deadline)throw Error('SYNTHETIC_BARRIER_TIMEOUT');await new Promise(r=>setTimeout(r,10));}
}});
const result=await store.stage({actor,productId,commandKey:'original-command-1',uploadKey:'original-file-1',declaredMime:'image/png',bytes:Buffer.from(${JSON.stringify(Buffer.from(f.input.bytes).toString("base64"))},'base64'),signal:new AbortController().signal});
process.stdout.write(JSON.stringify(result));`;
  const run = promisify(execFile), results = await Promise.all(["a", "b"].map(tag => run(process.execPath, ["--input-type=module", "-e", script, f.root, tag], { timeout: 15000, maxBuffer: 16384 })));
  const [a, b] = results.map(r => JSON.parse(r.stdout)); assert.deepEqual(a, b); assert.equal((await readdir(path.join(f.root, "keys"))).length, 1);
  assert.equal((await f.consume(a.uploadId)).uploadId, a.uploadId);
  for (const uploadId of await readdir(path.join(f.root, "stages"))) if (uploadId !== a.uploadId) await assert.rejects(f.consume(uploadId), { code: "PRODUCT_MEDIA_NOT_READY" });
});
test("QB80-F01 published-stage recovery fsyncs keys before success on prior completed and EEXIST winner paths", async t => {
  const f = await fixture(t), keys = path.join(f.root, "keys");
  type FaultSeam = { syncDirectory(directory: string): Promise<void>; published(index: string, signal: AbortSignal): Promise<unknown> };
  const first = f.store as unknown as FaultSeam, initialSync = first.syncDirectory.bind(f.store); let failInitial = true;
  t.mock.method(first, "syncDirectory", async (directory: string) => {
    if (directory === keys && failInitial) { failInitial = false; throw Object.assign(Error("SYNTHETIC_KEYS_FSYNC_FAILURE"), { code: "EIO" }); }
    return initialSync(directory);
  });
  await assert.rejects(f.store.stage(f.input), { code: "PRODUCT_MEDIA_NOT_READY" });
  const indexNames = await readdir(keys); assert.equal(indexNames.length, 1);
  const winner = JSON.parse((await readFile(path.join(keys, indexNames[0]!))).toString()), original = await readFile(path.join(f.root, "stages", winner.uploadId, "original.bin"));
  for (const [branch, skippedProbes] of [["prior", 0], ["completed", 1], ["winner", 2]] as const) {
    const store = new PrivateProductMediaStage(f.options), seam = store as unknown as FaultSeam;
    const realSync = seam.syncDirectory.bind(store), realPublished = seam.published.bind(store);
    let probes = 0, keysAttempts = 0, keysDurable = 0, failKeys = true;
    t.mock.method(seam, "published", async (index: string, signal: AbortSignal) => ++probes <= skippedProbes ? null : realPublished(index, signal));
    t.mock.method(seam, "syncDirectory", async (directory: string) => {
      if (directory === keys) { keysAttempts++; if (failKeys) throw Object.assign(Error(`SYNTHETIC_${branch}_KEYS_FSYNC_FAILURE`), { code: "EIO" }); }
      await realSync(directory); if (directory === keys) keysDurable++;
    });
    await assert.rejects(store.stage(f.input), { code: "PRODUCT_MEDIA_NOT_READY" }, `${branch} cannot succeed while keys fsync fails`);
    assert.equal(keysAttempts, 1, branch); assert.equal(keysDurable, 0, branch);
    failKeys = false; probes = 0;
    const recovered = await store.stage(f.input); assert.equal(recovered.uploadId, winner.uploadId, branch); assert.equal(keysDurable, 1, branch);
    assert.equal((await readdir(keys)).length, 1, branch); assert.deepEqual(await readFile(path.join(f.root, "stages", winner.uploadId, "original.bin")), original);
  }
});
