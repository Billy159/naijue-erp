/** SYNTHETIC HTTP injection only. No listener, real account, media bytes, PostgreSQL or production policy. */
import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import Fastify from "fastify";
import { createProductQueryHttpPlugin } from "./product-query-http.ts";
import type { ProductQueryHttpOptions } from "./product-query-http.ts";
import { createSalesSessionAuthenticator } from "./authentication.ts";
import type { AuthenticationService } from "../../../packages/authentication/src/service.ts";
import type { ProductQueryAuthorization, ProductQueryDependencies, ProductReadIntent, TrustedProductSnapshotReader } from "../../../packages/application/src/product-query-ports.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";

const productId = sid("product", 901), imageId = sid("product", 902);
const parameters = { productId }; const imageParameters = { productId, imageId };
const routes = ["/products/basics/query", "/products/specifications/query", "/products/images/query", "/products/image/query"] as const;
async function setup(t: TestContext, options: { authenticate?: ProductQueryHttpOptions["authenticate"]; authorize?: ProductQueryAuthorization["authorize"]; failure?: Error; missing?: boolean; media?: boolean } = {}) {
  let policyCalls = 0, readCalls = 0, thumbnails = 0, originals = 0; let currentActor: ActorContext | null = actor; const intents: ProductReadIntent[] = [];
  const check = () => { readCalls++; if (options.failure) throw options.failure; };
  const image = { id: imageId, productId, fileRef: "SYNTHETIC/private-file-reference", mime: "image/jpeg" as const, byteSize: 123n, displayOrder: 1 };
  const reader: TrustedProductSnapshotReader = {
    async readBasics() { check(); return options.missing ? null : { productId, code: "SYNTHETIC ORIGINAL CODE", name: "SYNTHETIC PRODUCT", categoryLabel: "完整分类名称", yearLabel: null, seasonLabel: null, supplierLabel: null, systemCode: null }; },
    async readSpecifications() { check(); return options.missing ? null : { productId, sizeGroup: { id: sid("sizeGroup", 903), label: "完整组名" }, colors: [{ id: sid("color", 904), label: "完整颜色名称" }], fits: [{ id: sid("fit", 905), label: "Y版（修身）" }], sizes: [{ id: sid("size", 906), label: "165/S" }], skus: [{ id: sid("sku", 907), colorId: sid("color", 904), fitId: sid("fit", 905), sizeId: sid("size", 906) }] }; },
    async readImages() { check(); return options.missing ? null : { productId, productName: "SYNTHETIC PRODUCT", images: [image] }; },
    async readImage() { check(); return options.missing ? null : image; }
  };
  const dependencies: ProductQueryDependencies = { reader, authorization: { async authorize(context, intent, signal) { policyCalls++; intents.push(intent); assert.deepEqual(context, actor); assert.ok(signal instanceof AbortSignal);
    return options.authorize ? options.authorize(context, intent, signal) : { productId }; } }, media: options.media === false ? null : {
      deliveryOrigin: "https://synthetic.example", async resolveThumbnails(read) { thumbnails++; assert.equal(read.images[0]!.fileRef, image.fileRef); return [{ imageId, variant: "thumbnail", url: "https://synthetic.example/opaque-thumbnail" }]; },
      async resolveOriginal() { originals++; return { imageId, variant: "original", url: "https://synthetic.example/opaque-original" }; }
    } };
  const app = Fastify({ logger: false }); app.register(createProductQueryHttpPlugin({ authenticate: options.authenticate ?? (async () => currentActor), dependencies })); t.after(() => app.close()); await app.ready();
  return { app, intents, counts: () => ({ policyCalls, readCalls, thumbnails, originals }), authenticateAs: (value: ActorContext | null) => { currentActor = value; },
    post: (url: string, payload: unknown) => app.inject({ method: "POST", url, payload: JSON.stringify(payload), headers: { "content-type": "application/json" } }) };
}
test("SYNTHETIC product HTTP: four DTO-compatible read routes use current trusted policy; thumbnails and originals are separate", async t => {
  const f = await setup(t); assert.equal(f.app.server.listening, false);
  const basics = await f.post(routes[0], parameters); assert.equal(basics.statusCode, 200); assert.equal(basics.json().yearLabel, null); assert.equal(basics.json().systemCode, null);
  assert.equal(basics.headers["cache-control"], "no-store"); assert.equal(basics.headers.pragma, "no-cache");
  const specs = await f.post(routes[1], parameters); assert.equal(specs.statusCode, 200); assert.equal(specs.json().sizes[0].label, "165/S"); assert.equal(specs.json().fits[0].label, "Y版（修身）");
  const images = await f.post(routes[2], parameters); assert.equal(images.statusCode, 200); assert.equal(images.json().images[0].thumbnailUrl, "https://synthetic.example/opaque-thumbnail");
  assert.ok(!images.body.includes("fileRef") && !images.body.includes("private-file-reference") && !images.body.includes("opaque-original")); assert.equal(f.counts().originals, 0);
  const original = await f.post(routes[3], imageParameters); assert.equal(original.statusCode, 200); assert.equal(original.json().url, "https://synthetic.example/opaque-original");
  assert.deepEqual(f.intents.map(intent => intent.kind), ["basics", "specifications", "images", "image"]); assert.deepEqual(f.counts(), { policyCalls: 4, readCalls: 4, thumbnails: 1, originals: 1 }); assert.equal(f.app.server.listening, false);
});
test("SYNTHETIC product HTTP: all detail/image routes require current authentication before policy/storage", async t => {
  assert.throws(() => createProductQueryHttpPlugin({} as ProductQueryHttpOptions), /explicit trusted authentication/);
  assert.throws(() => createProductQueryHttpPlugin({ authenticate: async () => actor } as unknown as ProductQueryHttpOptions), /explicit trusted authorization/);
  const f = await setup(t); f.authenticateAs(null);
  for (const url of routes) assert.equal((await f.post(url, url === routes[3] ? imageParameters : parameters)).statusCode, 401);
  assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0, thumbnails: 0, originals: 0 });
  for (const authenticate of [async () => ({ accountId: "fake", hallId: null }) as never, async () => { throw new DomainError("FORBIDDEN", "PRIVATE AUTH"); }]) {
    const g = await setup(t, { authenticate }); const response = await g.post(routes[3], imageParameters); assert.equal(response.statusCode, 500); assert.ok(!response.body.includes("PRIVATE")); assert.equal(g.counts().readCalls, 0);
  }
});
test("SYNTHETIC product HTTP: client actor/roles/scope/URLs and noncanonical or missing IDs are rejected before policy", async t => {
  const f = await setup(t);
  for (const payload of [{ ...parameters, actor }, { ...parameters, role: "ADMIN" }, { ...parameters, scope: { productId } }, { ...parameters, fileRef: "private" }, { productId: "../../secret" }, { productId: 123 }, {}, null,
    { productId: "00000000-0000-4000-8000-000000000ABC" }]) assert.equal((await f.post(routes[0], payload)).statusCode, 400);
  for (const payload of [{ ...imageParameters, url: "https://attacker.example" }, { ...imageParameters, variant: "original" }, { productId, imageId: "fake" }, parameters]) assert.equal((await f.post(routes[3], payload)).statusCode, 400);
  assert.equal(f.counts().policyCalls, 0); assert.equal(f.counts().readCalls, 0);
});
test("SYNTHETIC product HTTP: policy denial/mismatched grant denies images before metadata or media; revocation is current", async t => {
  for (const authorize of [async () => { throw new DomainError("FORBIDDEN", "PRIVATE POLICY"); }, async () => ({ productId: sid("product", 999) })]) {
    const f = await setup(t, { authorize }); const response = await f.post(routes[3], imageParameters); assert.equal(response.statusCode, 403); assert.ok(!response.body.includes("PRIVATE")); assert.equal(f.counts().readCalls, 0);
  }
  let allowed = true; const f = await setup(t, { authorize: async () => { if (!allowed) throw new DomainError("FORBIDDEN", "Revoked"); return { productId }; } });
  assert.equal((await f.post(routes[2], parameters)).statusCode, 200); allowed = false; assert.equal((await f.post(routes[3], imageParameters)).statusCode, 403); assert.equal(f.counts().originals, 0);
});
test("SYNTHETIC product HTTP: missing product is JSON null; missing image is 404; no media storage/delivery is an explicit 501", async t => {
  const f = await setup(t, { missing: true });
  for (const url of routes.slice(0, 3)) { const response = await f.post(url, parameters); assert.equal(response.statusCode, 200); assert.equal(response.body, "null"); }
  assert.equal((await f.post(routes[3], imageParameters)).statusCode, 404);
  const g = await setup(t, { media: false }); for (const url of routes.slice(2)) { const response = await g.post(url, url === routes[3] ? imageParameters : parameters); assert.equal(response.statusCode, 501); assert.equal(response.json().error.code, "PRODUCT_MEDIA_NOT_IMPLEMENTED"); assert.match(response.json().error.message, /not implemented/); assert.ok(!response.body.includes("private-file-reference")); }
});
test("SYNTHETIC product HTTP: only allowlisted safe errors escape; SQL/provider internals stay redacted", async t => {
  for (const [error, expected] of [[new DomainError("PRODUCT_READ_TOO_LARGE", "PRIVATE LIMIT"), 413], [new DomainError("PRODUCT_READ_ABORTED", "PRIVATE ABORT"), 408],
    [new DomainError("INVALID_DATABASE_VALUE", "PRIVATE VALUE"), 500], [new Error("PRIVATE SQL postgresql://credentials"), 500]] as const) {
    const f = await setup(t, { failure: error }); const response = await f.post(routes[0], parameters); assert.equal(response.statusCode, expected); assert.ok(!response.body.includes("PRIVATE") && !response.body.includes("credentials")); assert.equal(response.headers["cache-control"], "no-store");
  }
});
test("SYNTHETIC product HTTP: query strings, malformed/empty JSON, unsupported media and body overflow fail before policy", async t => {
  const f = await setup(t); assert.equal((await f.post(routes[0] + "?role=ADMIN", parameters)).statusCode, 400);
  for (const payload of ["{", ""]) assert.equal((await f.app.inject({ method: "POST", url: routes[0], headers: { "content-type": "application/json" }, payload })).statusCode, 400);
  assert.equal((await f.app.inject({ method: "POST", url: routes[0], headers: { "content-type": "text/plain" }, payload: "not JSON" })).statusCode, 415);
  assert.equal((await f.post(routes[0], { data: "x".repeat(8192) })).statusCode, 413); assert.equal(f.counts().policyCalls, 0);
});
test("SYNTHETIC product HTTP: existing session authenticator accepts matching POST Origin and rejects missing/cross-site origins before session lookup", async t => {
  let resolutions = 0, active = true;
  const service: AuthenticationService = { async login() { throw new Error("Not used"); }, async logout() {}, async changeOwnPassword() {}, async resolve() {
    resolutions++; return active ? { ...actor, staffId: sid("staff", 998), loginName: "SYNTHETIC", role: "SYNTHETIC", authVersion: 1 } : null;
  } };
  const f = await setup(t, { authenticate: createSalesSessionAuthenticator({ service, trustedOrigin: "https://synthetic.example" }) });
  const cookie = `__Host-naijue_session=${"a".repeat(43)}`;
  for (const headers of [{ cookie }, { cookie, origin: "https://attacker.example" }, { cookie, origin: "https://synthetic.example", "sec-fetch-site": "cross-site" }]) {
    const response = await f.app.inject({ method: "POST", url: routes[3], headers: { ...headers, "content-type": "application/json" }, payload: imageParameters }); assert.equal(response.statusCode, 401);
  }
  assert.equal(resolutions, 0); assert.equal(f.counts().readCalls, 0);
  const post = () => f.app.inject({ method: "POST", url: routes[3], headers: { cookie, origin: "https://synthetic.example", "sec-fetch-site": "same-origin", "content-type": "application/json" }, payload: imageParameters });
  assert.equal((await post()).statusCode, 200); active = false; assert.equal((await post()).statusCode, 401); assert.equal(resolutions, 2); assert.equal(f.counts().originals, 1);
});
