import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import inject from "light-my-request";
import type { IncomingMessage } from "node:http";
import { createPartyReadHttpPlugin } from "./party-read-http.ts";
import { createSourcePartyReadAuthorization } from "../../../packages/application/src/party-read-policy.ts";
import { entityId, version } from "../../../packages/domain/src/values.ts";
import { ids } from "../../../tests/support/synthetic-fixtures.ts";
import type { PartyActor } from "../../../packages/application/src/party-read-ports.ts";
async function fixture() {
  const app = Fastify({ logger: false }); let actor: PartyActor | null = { accountId: ids.account, hallId: ids.hall, role: "WAREHOUSE" }, reads = 0;
  const row = { id: entityId("customer", ids.customer), code: "原编码", name: "原名", enabled: true, version: version(1), createdAt: null, updatedAt: null };
  app.register(createPartyReadHttpPlugin({ authenticate: async () => actor, dependencies: { authorization: createSourcePartyReadAuthorization(), reader: {
    async search(read) { reads++; assert.notEqual(read.intent.operation, "DETAIL"); if (read.intent.operation === "DETAIL") throw Error();
      return { items: [row], total: 1, page: read.intent.query.page, pageSize: read.intent.query.pageSize }; }, async detail() { reads++; return row; },
  } } })); await app.ready();
  return { app, reads: () => reads, actor(value: PartyActor | null) { actor = value; } };
}
test("party read plugin exposes six GET only with original JSON, nullable dates, candidate projection and no-store", async () => {
  const f = await fixture();
  try {
    for (const path of ["customers", "suppliers"]) {
      for (const url of [`/${path}`, `/${path}/candidates`, `/${path}/:id`]) assert.equal(f.app.hasRoute({ method: "GET", url }), true);
      assert.equal((await f.app.inject({ method: "POST", url: `/${path}/commands`, payload: {} })).statusCode, 404);
      assert.equal((await f.app.inject({ method: "GET", url: `/${path}/receipts/KEY` })).statusCode, 404);
      const list = await f.app.inject(`/${path}?search=&enabled=ALL&page=1&pageSize=20`); assert.equal(list.statusCode, 200);
      assert.equal(list.headers["cache-control"], "no-store"); assert.equal(list.json().items[0].createdAt, null);
      const candidates = await f.app.inject(`/${path}/candidates?search=&page=1&pageSize=20`); assert.equal(candidates.statusCode, 200);
      assert.deepEqual(candidates.json().items, [{ id: ids.customer, code: "原编码", name: "原名" }]);
      assert.equal((await f.app.inject(`/${path}/${ids.customer}`)).statusCode, 200);
    }
  } finally { await f.app.close(); }
});
test("party GET authentication/role checks and malformed query reject before reading", async () => {
  const f = await fixture();
  try {
    f.actor(null); assert.equal((await f.app.inject("/customers?search=&enabled=ALL&page=1&pageSize=20")).statusCode, 401);
    f.actor({ accountId: ids.account, hallId: ids.hall, role: "SALESPERSON" });
    assert.equal((await f.app.inject("/customers?search=&enabled=ALL&page=1&pageSize=20")).statusCode, 403);
    assert.equal((await f.app.inject(`/customers/${ids.customer}`)).statusCode, 403); assert.equal(f.reads(), 0);
    assert.equal((await f.app.inject("/customers/candidates?search=&page=1&pageSize=20")).statusCode, 200);
    const before = f.reads();
    for (const url of ["/customers?search=&enabled=ALL&page=1&pageSize=20&unknown=x", "/customers?search=&enabled=ALL&page=1&page=2&pageSize=20",
      "/customers/candidates?search=&enabled=ALL&page=1&pageSize=20", `/customers/${ids.customer}?unknown=1`, "/customers/not-an-id"]) {
      assert.equal((await f.app.inject(url)).statusCode, 400, url);
    }
    assert.equal(f.reads(), before);
  } finally { await f.app.close(); }
});
test("synthetic abort during trusted authentication prevents party authorization/reader and leaves a sibling request active", async () => {
  const app = Fastify({ logger: false }); let authenticateCalls = 0, authorizations = 0, reads = 0, enter!: () => void, resume!: () => void;
  const entered = new Promise<void>(r => { enter = r; }), hold = new Promise<void>(r => { resume = r; });
  const actor: PartyActor = { accountId: ids.account, hallId: ids.hall, role: "WAREHOUSE" };
  app.register(createPartyReadHttpPlugin({ async authenticate() { if (++authenticateCalls === 1) { enter(); await hold; } return actor; }, dependencies: {
    authorization: { async authorize(_actor, intent) { authorizations++; return { kind: intent.kind, operation: intent.operation, targetId: null }; } },
    reader: { async search() { reads++; return { items: [], total: 0, page: 1, pageSize: 20 }; }, async detail(): Promise<never> { throw Error("unused"); } },
  } })); await app.ready();
  let raw: IncomingMessage | undefined;
  const cancelled = inject((request, response) => { raw = request; app.routing(request, response); }, { method: "GET", url: "/customers?search=&enabled=ALL&page=1&pageSize=20" });
  try {
    await entered; raw!.emit("aborted");
    assert.equal((await app.inject("/customers?search=&enabled=ALL&page=1&pageSize=20")).statusCode, 200);
    resume(); assert.equal((await cancelled).statusCode, 408); assert.equal(authorizations, 1); assert.equal(reads, 1);
  } finally { resume(); await app.close(); }
});
