import {CapacityAdmissionRejected} from './capacity-admission.ts';
// Controlled transport-only test lease, no real capacity probe.
const testCapacity = () => ({async acquire(){return {assertValid(){},release(){}};},close(){}});
/** Injected byte-provider protocol only; no listener, real session, storage or codec. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createProductMediaHttpPlugin } from "./product-media-http.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";
import type { ProductMediaUploadInput } from "../../../adapters/media/src/product-media-stage.ts";
import type { ProductImageMime } from "../../../packages/application/src/product-query-ports.ts";
const url = `/products/media/${sid("product", 12001)}/${sid("product", 12002)}/${"a".repeat(64)}/thumbnail`;
test("W15 media HTTP authenticates every byte request and emits bounded no-store/nosniff bytes only", async t => {
  let auths = 0, deliveries = 0; const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createProductMediaHttpPlugin({ authenticate: async () => { auths++; return actor; }, provider: { async deliver(input) { deliveries++; assert.equal(input.variant, "thumbnail"); assert.equal(input.actor.accountId, actor.accountId); return { bytes: Buffer.from([1, 2, 3]), mime: "image/png" }; } } }));
  for (let i = 0; i < 2; i++) { const r = await app.inject(url); assert.equal(r.statusCode, 200); assert.equal(r.headers["content-type"], "image/png"); assert.equal(r.headers["cache-control"], "no-store"); assert.equal(r.headers["x-content-type-options"], "nosniff"); assert.deepEqual(r.rawPayload, Buffer.from([1, 2, 3])); }
  assert.equal(auths, 2); assert.equal(deliveries, 2);
  assert.equal((await app.inject(url + "?path=PRIVATE")).statusCode, 400);
  assert.equal((await app.inject(url.replace(/thumbnail$/, "originals"))).statusCode, 404); assert.equal(deliveries, 2);
  assert.equal((await app.inject({ method: "POST", url: "/products/media/uploads", headers: { "content-type": "image/png", "x-command-key": "original-command", "x-upload-key": "original-file" }, payload: Buffer.from([1]) })).statusCode, 503); assert.equal(app.server.listening, false);
});
test("W15 media HTTP null provider, denied/replaced/missing and internal failures are explicit sanitized failures", async t => {
  for (const mode of ["unauthenticated", "unavailable", "forbidden", "removed", "failure"] as const) {
    let deliveries = 0; const app = Fastify({ logger: false }); t.after(() => app.close());
    app.register(createProductMediaHttpPlugin({ authenticate: async () => mode === "unauthenticated" ? null : actor, provider: mode === "unavailable" ? null : { async deliver() {
      deliveries++; if (mode === "forbidden") throw new DomainError("FORBIDDEN", "PRIVATE_ROOT"); if (mode === "removed") throw new DomainError("PRODUCT_IMAGE_NOT_FOUND", "PRIVATE_SQL"); throw Error("PRIVATE_FILE_REF");
    } } }));
    const r = await app.inject(url); assert.equal(r.statusCode, mode === "unauthenticated" ? 401 : mode === "unavailable" ? 503 : mode === "forbidden" ? 403 : mode === "removed" ? 404 : 500);
    assert.doesNotMatch(r.body, /PRIVATE/); assert.equal(r.headers["cache-control"], "no-store"); if (mode === "unauthenticated" || mode === "unavailable") assert.equal(deliveries, 0);
  }
});

const uploadUrl = "/products/media/uploads";
const uploadHeaders = { "content-type": "image/png", "x-command-key": "original-command", "x-upload-key": "original-file" };
const uploaded = { uploadId: sid("product", 12003), mime: "image/png" as const, byteSize: "1", expiresAt: "2026-10-24T01:00:00.000Z" };
test('A02 media low-water rejection occurs before raw-body parsing or codec/stage, while GET ignores capacity',async t=>{
  let admissions=0,parsed=0,staged=0;const app=Fastify();t.after(()=>app.close());
  app.addHook('preParsing',async(_req,_reply,payload)=>{parsed++;return payload;});
  app.register(createProductMediaHttpPlugin({authenticate:async()=>actor,provider:{async deliver(){return {bytes:Buffer.from([1]),mime:'image/png'};}},
    capacityAdmission:{async acquire(){admissions++;throw new CapacityAdmissionRejected('LOW_WATER',3);},close(){}},imageStage:{async stage(){staged++;return uploaded;}}}));
  const response=await app.inject({method:'POST',url:uploadUrl,headers:uploadHeaders,payload:Buffer.from([1])});
  assert.equal(response.statusCode,503);assert.equal(response.headers['retry-after'],'3');assert.equal(response.json().error.code,'CAPACITY_ADMISSION_UNAVAILABLE');
  assert.equal(parsed,0);assert.equal(staged,0);assert.equal(admissions,1);assert.equal((await app.inject(url)).statusCode,200);assert.equal(admissions,1);
});
test('A02 upload admission is checked again after body parsing and parser rejection returns the lease once',async t=>{
  for(const oversized of [false,true]){
    let valid=true,releases=0,staged=0;const app=Fastify();t.after(()=>app.close());
    app.addHook('preValidation',async()=>{valid=false;});
    app.register(createProductMediaHttpPlugin({authenticate:async()=>actor,provider:null,
      capacityAdmission:{async acquire(){return {assertValid(){if(!valid)throw new CapacityAdmissionRejected('PROBE_UNAVAILABLE',2);},release(){releases++;}};},close(){}},
      imageStage:{async stage(){staged++;return uploaded;}}}));
    const response=await app.inject({method:'POST',url:uploadUrl,headers:uploadHeaders,payload:Buffer.alloc(oversized?8388609:1)});
    assert.equal(response.statusCode,oversized?413:503);assert.equal(staged,0);assert.equal(releases,1);
  }
});
test('A02 premature reply close aborts upload but retains its capacity lease until the physical stage settles',async t=>{
  let releases=0,response!:import('node:http').ServerResponse,signal:AbortSignal|undefined,entered!:()=>void,settle!:()=>void;
  const started=new Promise<void>(done=>{entered=done;}),worker=new Promise<void>(done=>{settle=done;});
  const app=Fastify();t.after(()=>app.close());app.addHook('preHandler',async(_request,reply)=>{response=reply.raw;});
  app.register(createProductMediaHttpPlugin({authenticate:async()=>actor,provider:null,
    capacityAdmission:{async acquire(){return {assertValid(){},release(){releases++;}};},close(){}},
    imageStage:{async stage(input){signal=input.signal;entered();await worker;return uploaded;}}}));
  const pending=app.inject({method:'POST',url:uploadUrl,headers:uploadHeaders,payload:Buffer.from([1])});
  const disconnected=assert.rejects(pending,e=>e instanceof Error && (e as Error & {code?:string}).code==='LIGHT_ECONNRESET');await started;
  response.emit('close');assert.equal(signal?.aborted,true);assert.equal(releases,0);
  await disconnected;assert.equal(releases,0);settle();await new Promise<void>(done=>setImmediate(done));assert.equal(releases,1);
});
test('A02 abort during pre-body capacity wait releases a late lease without entering parser/stage',async t=>{
  let raw!:import('node:http').IncomingMessage,entered!:()=>void,admit!:(v:{assertValid():void;release():void})=>void,releases=0,parsed=0,staged=0;
  const started=new Promise<void>(done=>{entered=done;}),gate=new Promise<{assertValid():void;release():void}>(done=>{admit=done;});
  const app=Fastify();t.after(()=>app.close());app.addHook('onRequest',async request=>{raw=request.raw;});
  app.addHook('preParsing',async(_req,_reply,payload)=>{parsed++;return payload;});
  app.register(createProductMediaHttpPlugin({authenticate:async()=>actor,provider:null,
    capacityAdmission:{async acquire(){entered();return gate;},close(){}},imageStage:{async stage(){staged++;return uploaded;}}}));
  const request=app.inject({method:'POST',url:uploadUrl,headers:uploadHeaders,payload:Buffer.from([1])});await started;raw.emit('aborted');
  admit({assertValid(){},release(){releases++;}});assert.equal((await request).statusCode,408);
  assert.equal(releases,1);assert.equal(parsed,0);assert.equal(staged,0);
});
// The real stage/Sharp/PG evidence is C40. These tests isolate only the new HTTP
// transport and reuse the existing stage port without decoding fixture images.
test("media upload HTTP sends exact raw bytes and trusted actor/original keys for existing product or explicit draft", async t => {
  const inputs: ProductMediaUploadInput[] = [], app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createProductMediaHttpPlugin({ authenticate: async () => actor, provider: null, capacityAdmission:testCapacity(), imageStage: { async stage(input) {
    inputs.push(input); return { ...uploaded, mime: input.declaredMime as ProductImageMime, byteSize: input.bytes.byteLength.toString(), fileRef: "PRIVATE_MUST_NOT_LEAK" };
  } } }));
  const bytes = Buffer.from([0, 255, 13, 10, 128]);
  for (const mime of ["image/png", "image/jpeg", "image/webp"] as const) {
    const headers = mime === "image/webp" ? { ...uploadHeaders, "content-type": mime } : { ...uploadHeaders, "content-type": mime, "x-product-id": sid("product", 12001) };
    const response = await app.inject({ method: "POST", url: uploadUrl, headers, payload: bytes });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { ...uploaded, mime, byteSize: "5" });
    assert.equal(response.headers["cache-control"], "no-store"); assert.equal(response.headers["x-content-type-options"], "nosniff");
    const input = inputs.at(-1)!; assert.equal(input.actor, actor); assert.deepEqual(input.bytes, bytes); assert.ok(Buffer.isBuffer(input.bytes));
    assert.equal(input.productId, mime === "image/webp" ? null : sid("product", 12001));
    assert.equal(input.commandKey, uploadHeaders["x-command-key"]); assert.equal(input.uploadKey, uploadHeaders["x-upload-key"]);
    assert.equal(input.declaredMime, mime); assert.ok(input.signal instanceof AbortSignal); assert.equal(input.signal.aborted, false);
  }
  assert.equal(inputs.length, 3); assert.equal(app.server.listening, false);
});
test("media upload HTTP enforces the original 8MiB raw-body boundary, MIME, headers and session before stage", async t => {
  let calls = 0, current = true; const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createProductMediaHttpPlugin({ authenticate: async () => current ? actor : null, provider: null, capacityAdmission:testCapacity(), imageStage: { async stage(input) { calls++; return { ...uploaded, byteSize: input.bytes.byteLength.toString() }; } } }));
  assert.equal((await app.inject({ method: "POST", url: uploadUrl, headers: uploadHeaders, payload: Buffer.alloc(8388608) })).statusCode, 200);
  const large = await app.inject({ method: "POST", url: uploadUrl, headers: uploadHeaders, payload: Buffer.alloc(8388609) });
  assert.equal(large.statusCode, 413); assert.equal(large.json().error.code, "BODY_TOO_LARGE"); assert.equal(calls, 1);
  for (const headers of [{ "content-type": "image/png", "x-upload-key": "file" }, { ...uploadHeaders, "x-upload-key": "" },
    { ...uploadHeaders, "x-product-id": "null" }, { ...uploadHeaders, "x-product-id": "" }])
    assert.equal((await app.inject({ method: "POST", url: uploadUrl, headers, payload: Buffer.from([1]) })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: uploadUrl + "?path=PRIVATE", headers: uploadHeaders, payload: Buffer.from([1]) })).statusCode, 400);
  for (const type of ["application/json", "multipart/form-data", "image/gif"])
    assert.equal((await app.inject({ method: "POST", url: uploadUrl, headers: { ...uploadHeaders, "content-type": type }, payload: Buffer.from("not-json-or-an-image") })).statusCode, 415);
  current = false; assert.equal((await app.inject({ method: "POST", url: uploadUrl, headers: uploadHeaders, payload: Buffer.from([1]) })).statusCode, 401);
  assert.equal(calls, 1);
});
test("media upload HTTP preserves stage refusal/conflict/cancellation errors and never converts unknown failures to success", async t => {
  for (const [code, status] of [["INVALID_UPLOAD", 400], ["FORBIDDEN", 403], ["PRODUCT_NOT_FOUND", 404], ["PRODUCT_DELETED", 409], ["IDEMPOTENCY_CONFLICT", 409], ["MEDIA_TOO_LARGE", 413],
    ["PRODUCT_MEDIA_NOT_READY", 503], ["PRODUCT_READ_ABORTED", 408], ["UNEXPECTED", 500]] as const) {
    const app = Fastify({ logger: false }); t.after(() => app.close());
    app.register(createProductMediaHttpPlugin({ authenticate: async () => actor, provider: null, capacityAdmission:testCapacity(), imageStage: { async stage() {
      if (code === "UNEXPECTED") throw Error("PRIVATE_ROOT_OR_INTERNAL"); throw new DomainError(code, "PRIVATE_STAGE_FACTS");
    } } }));
    const response = await app.inject({ method: "POST", url: uploadUrl, headers: uploadHeaders, payload: Buffer.from([1]) });
    assert.equal(response.statusCode, status); assert.equal(response.json().error.code, code === "UNEXPECTED" ? "INTERNAL_ERROR" : code); assert.doesNotMatch(response.body, /PRIVATE/);
  }
  const unavailable = Fastify({ logger: false }); t.after(() => unavailable.close());
  unavailable.register(createProductMediaHttpPlugin({ authenticate: async () => actor, provider: null, imageStage: null }));
  assert.equal((await unavailable.inject({ method: "POST", url: uploadUrl, headers: uploadHeaders, payload: Buffer.from([1]) })).statusCode, 503);
});
test("media upload HTTP aborts the existing stage signal and removes request/response cancellation listeners", async t => {
  const app = Fastify({ logger: false }); t.after(() => app.close());
  let raw: import("node:http").IncomingMessage, response: import("node:http").ServerResponse, stageSignal: AbortSignal;
  let requestBefore: Function[] = [], responseBefore: Function[] = [], requestAdded: Function[] = [], responseAdded: Function[] = [];
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  app.addHook("onRequest", async (request, reply) => { raw = request.raw; response = reply.raw; requestBefore = raw.listeners("aborted"); responseBefore = response.listeners("close"); });
  app.register(createProductMediaHttpPlugin({ authenticate: async () => actor, provider: null, capacityAdmission:testCapacity(), imageStage: { async stage(input) {
    stageSignal = input.signal; requestAdded = raw.listeners("aborted").filter(fn => !requestBefore.includes(fn)); responseAdded = response.listeners("close").filter(fn => !responseBefore.includes(fn));
    return new Promise((_resolve, reject) => { input.signal.addEventListener("abort", () => reject(new DomainError("PRODUCT_READ_ABORTED", "cancelled")), { once: true }); entered(); });
  } } }));
  const pending = app.inject({ method: "POST", url: uploadUrl, headers: uploadHeaders, payload: Buffer.from([1]) }); await started;
  assert.equal(requestAdded.length, 1); assert.equal(responseAdded.length, 1); raw!.emit("aborted");
  assert.equal((await pending).statusCode, 408); assert.equal(stageSignal!.aborted, true);
  for (const fn of requestAdded) assert.ok(!raw!.listeners("aborted").includes(fn));
  for (const fn of responseAdded) assert.ok(!response!.listeners("close").includes(fn));
});
