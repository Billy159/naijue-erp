/** Injected byte-provider protocol only; no listener, real session, storage or codec. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createProductMediaHttpPlugin } from "./product-media-http.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";
const url = `/products/media/${sid("product", 12001)}/${sid("product", 12002)}/${"a".repeat(64)}/thumbnail`;
test("W15 media HTTP authenticates every byte request and emits bounded no-store/nosniff bytes only", async t => {
  let auths = 0, deliveries = 0; const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createProductMediaHttpPlugin({ authenticate: async () => { auths++; return actor; }, provider: { async deliver(input) { deliveries++; assert.equal(input.variant, "thumbnail"); assert.equal(input.actor.accountId, actor.accountId); return { bytes: Buffer.from([1, 2, 3]), mime: "image/png" }; } } }));
  for (let i = 0; i < 2; i++) { const r = await app.inject(url); assert.equal(r.statusCode, 200); assert.equal(r.headers["content-type"], "image/png"); assert.equal(r.headers["cache-control"], "no-store"); assert.equal(r.headers["x-content-type-options"], "nosniff"); assert.deepEqual(r.rawPayload, Buffer.from([1, 2, 3])); }
  assert.equal(auths, 2); assert.equal(deliveries, 2);
  assert.equal((await app.inject(url + "?path=PRIVATE")).statusCode, 400);
  assert.equal((await app.inject(url.replace(/thumbnail$/, "originals"))).statusCode, 404); assert.equal(deliveries, 2);
  assert.equal((await app.inject({ method: "POST", url: "/products/media/uploads", payload: Buffer.from([1]) })).statusCode, 404); assert.equal(app.server.listening, false);
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
