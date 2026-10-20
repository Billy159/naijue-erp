import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type { TestContext } from "node:test";
import { createPartyMaintenanceHttpPlugin } from "./party-maintenance-http.ts";
import type { PartyHttpOptions } from "./party-maintenance-http.ts";
import { createPartySessionAuthenticator } from "./party-authentication.ts";
import type { AuthenticationHttpOptions } from "./authentication.ts";
import type { PartyActor } from "../../../packages/application/src/party-maintenance-ports.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { partyActor, partyFixture } from "../../../tests/support/party-synthetic-store.ts";

async function setup(t: TestContext, authenticate?: PartyHttpOptions["authenticate"]) {
  const f = partyFixture(); let current: PartyActor | null = partyActor; const app = Fastify({ logger: false });
  app.register(createPartyMaintenanceHttpPlugin({ dependencies: f.dependencies, authenticate: authenticate ?? (async () => current) }));
  t.after(() => app.close()); await app.ready();
  const post = (body: unknown, path = "customers", suffix = "") => app.inject({ method: "POST", url: `/${path}/commands${suffix}`, headers: { "content-type": "application/json" }, payload: JSON.stringify(body) });
  return { ...f, app, post, auth: (actor: PartyActor | null) => { current = actor; } };
}
const create = { action: "CREATE", requestKey: "create", name: "SYNTHETIC NAME" };
test("SYNTHETIC party HTTP: separate route lifecycle, original replay and minimal safe receipts; no listener", async t => {
  const f = await setup(t); assert.equal(f.app.server.listening, false);
  const saved = await f.post(create); assert.equal(saved.statusCode, 200, saved.body); const first = saved.json();
  const supplier = await f.post({ ...create, requestKey: "supplier" }, "suppliers"); assert.equal(supplier.statusCode, 200); assert.equal(supplier.json().kind, "SUPPLIER");
  assert.equal((await f.post({ action: "EDIT", requestKey: "edit", id: first.partyId, expectedVersion: 1, enabled: true, name: "CHANGED" })).statusCode, 200);
  assert.equal((await f.post({ action: "DISABLE", requestKey: "disable", id: first.partyId, expectedVersion: 2 })).statusCode, 200);
  assert.equal((await f.post({ action: "RESTORE", requestKey: "restore", id: first.partyId, expectedVersion: 3 })).statusCode, 200);
  assert.deepEqual((await f.post(create)).json(), first);
  const receipt = await f.app.inject(`/customers/receipts/create`); assert.equal(receipt.statusCode, 200); assert.equal(receipt.json().result.version, 1);
  assert.deepEqual(Object.keys(receipt.json()).sort(), ["action", "completedAt", "requestKey", "result", "status"]);
  assert.equal((await f.app.inject(`/customers/${first.partyId}`)).json().version, 4);
  const list = await f.app.inject("/customers?search=&enabled=ALL&page=1&pageSize=20"); assert.equal(list.statusCode, 200); assert.equal(list.json().total, 1);
  assert.equal((await f.app.inject("/suppliers?search=&enabled=ALL&page=1&pageSize=20")).json().total, 1);
  assert.equal(f.app.server.listening, false);
});
test("SYNTHETIC party HTTP: writes reject code/dual-role/client actor/hidden fields and unknown queries", async t => {
  const f = await setup(t);
  for (const extra of [{ code: "CUSTOM" }, { kind: "SUPPLIER" }, { usage: ["customer", "supplier"] }, { tags: ["customer"] }, { actor: partyActor }, { enabled: false }, { expectedVersion: null }]) assert.equal((await f.post({ ...create, ...extra })).statusCode, 400);
  for (const name of ["", 123, null, "\0"]) assert.equal((await f.post({ ...create, name })).statusCode, 400);
  assert.equal((await f.post(create, "customers", "?extra=1")).statusCode, 400);
  assert.equal((await f.post({ ...create, action: "DELETE" })).statusCode, 400);
  assert.equal((await f.app.inject({ method: "DELETE", url: "/customers/00000000-0000-4000-8000-000000000001" })).statusCode, 404);
  assert.equal((await f.app.inject("/parties")).statusCode, 404); assert.equal(f.receipts().length, 0);
});
test("SYNTHETIC party HTTP: authentication/maintenance authorization and current role apply to all routes", async t => {
  const f = await setup(t); f.auth(null);
  for (const url of ["/customers", "/customers/candidates", "/customers/receipts/create", "/suppliers"]) { const res = await f.app.inject(url); assert.equal(res.statusCode, 401); assert.equal(res.headers["cache-control"], "no-store"); }
  assert.equal((await f.post(create)).statusCode, 401); assert.equal(f.receipts().length, 0);
  f.auth({ ...partyActor, role: "WAREHOUSE" }); assert.equal((await f.post(create)).statusCode, 200);
  f.auth({ ...partyActor, role: "SALESPERSON" });
  assert.equal((await f.post(create)).statusCode, 403);
  assert.equal((await f.app.inject("/customers?search=&enabled=ALL&page=1&pageSize=20")).statusCode, 403);
  const candidates = await f.app.inject("/customers/candidates?search=&page=1&pageSize=20"); assert.equal(candidates.statusCode, 200); assert.deepEqual(Object.keys(candidates.json().items[0]).sort(), ["code", "id", "name"]);
  assert.equal((await f.app.inject("/customers/receipts/create")).statusCode, 403);
});
test("SYNTHETIC party HTTP: strict pagination rejects repeated/unknown/coerced/disabled candidate filters", async t => {
  const f = await setup(t);
  for (const url of ["/customers", "/customers?search=&enabled=ALL&page=01&pageSize=20", "/customers?search=&enabled=ALL&page=1&pageSize=10", "/customers?search=&enabled=ALL&page=1&page=2&pageSize=20", "/customers?search=&enabled=ALL&page=1&pageSize=20&usage=customer", "/customers/candidates?search=&page=1&pageSize=20&enabled=DISABLED"]) assert.equal((await f.app.inject(url)).statusCode, 400, url);
});
test("SYNTHETIC party HTTP: versions, default-customer dependencies and cross-kind request keys are conflicts", async t => {
  const f = await setup(t); const first = (await f.post(create)).json(); f.defaults.add(first.partyId);
  assert.equal((await f.post({ action: "DISABLE", requestKey: "blocked", id: first.partyId, expectedVersion: 1 })).json().error.code, "CUSTOMER_DEFAULT_IN_USE");
  assert.equal((await f.post({ action: "EDIT", requestKey: "stale", id: first.partyId, expectedVersion: 2, enabled: true, name: "NEW" })).json().error.code, "VERSION_CONFLICT");
  assert.equal((await f.post(create, "suppliers")).json().error.code, "IDEMPOTENCY_CONFLICT");
  assert.equal((await f.post({ action: "EDIT", requestKey: "readonly", id: first.partyId, expectedVersion: 1, enabled: true, name: "NEW", code: "CHANGED" })).statusCode, 400);
  assert.equal(f.receipts().length, 1);
});
test("SYNTHETIC party HTTP: provider failures and invalid trusted actors never leak internals", async t => {
  for (const authenticate of [async () => { throw new Error("PRIVATE_SECRET"); }, async () => ({ ...partyActor, role: "root" }) as unknown as PartyActor, async () => ({ ...partyActor, accountId: "INVALID" }) as PartyActor]) {
    const f = await setup(t, authenticate); const result = await f.post(create); assert.equal(result.statusCode, 500); assert.doesNotMatch(result.body, /PRIVATE_SECRET|root|INVALID/); assert.equal(f.receipts().length, 0);
  }
});
test("SYNTHETIC party HTTP: malformed/media/body limits are bounded without storage changes", async t => {
  const f = await setup(t);
  assert.equal((await f.app.inject({ method: "POST", url: "/customers/commands", headers: { "content-type": "application/json" }, payload: "{" })).statusCode, 400);
  assert.equal((await f.app.inject({ method: "POST", url: "/customers/commands", headers: { "content-type": "text/plain" }, payload: "x" })).statusCode, 415);
  assert.equal((await f.post({ ...create, name: "x".repeat(9000) })).statusCode, 413); assert.equal(f.receipts().length, 0);
});
test("SYNTHETIC party sessions: authenticated current principal role retained and cookie/origin ambiguity rejected", async () => {
  let calls = 0; const token = "x".repeat(43);
  const options = { trustedOrigin: "https://erp.example.test", service: { async resolve(value: string) { calls++; assert.equal(value, token); return { ...partyActor, role: "WAREHOUSE" }; } } } as unknown as AuthenticationHttpOptions;
  const authenticate = createPartySessionAuthenticator(options);
  const input = { headers: { cookie: `__Host-naijue_session=${token}`, origin: options.trustedOrigin }, ip: "127.0.0.1", method: "POST", url: "/customers/commands" };
  assert.equal((await authenticate(input))!.role, "WAREHOUSE"); assert.equal(calls, 1);
  for (const headers of [{ cookie: input.headers.cookie }, { ...input.headers, origin: "https://hostile.example" }, { ...input.headers, authorization: "Bearer x" }, { ...input.headers, "sec-fetch-site": "cross-site" }, { ...input.headers, cookie: `${input.headers.cookie};${input.headers.cookie}` }]) assert.equal(await authenticate({ ...input, headers }), null);
  assert.equal(calls, 1);
  assert.equal(await authenticate({ ...input, url: "//evil" }), null);
  assert.throws(() => createPartySessionAuthenticator({ ...options, trustedOrigin: "http://erp.example.test" }), /HTTPS/);
});

test("SYNTHETIC approved party HTTP: technical code exhaustion is explicit and does not persist a party", async t => {
  const f = partyFixture(); const app = Fastify({ logger: false });
  app.register(createPartyMaintenanceHttpPlugin({ authenticate: async () => partyActor, dependencies: { ...f.dependencies, codes: {
    async allocateCustomerCode() { throw new DomainError("PARTY_CODE_EXHAUSTED", "PRIVATE STORAGE DETAIL"); },
    async allocateSupplierCode() { throw new DomainError("PARTY_CODE_EXHAUSTED", "PRIVATE STORAGE DETAIL"); }
  } } })); t.after(() => app.close()); await app.ready();
  const result = await app.inject({ method: "POST", url: "/customers/commands", headers: { "content-type": "application/json" }, payload: JSON.stringify(create) });
  assert.equal(result.statusCode, 409); assert.equal(result.json().error.code, "PARTY_CODE_EXHAUSTED"); assert.doesNotMatch(result.body, /PRIVATE STORAGE/); assert.equal(f.customers().length, 0); assert.equal(f.receipts().length, 0);
});

test("SYNTHETIC atomic party HTTP: EDIT requires name plus boolean enabled and saves/replays the pair once", async t => {
  const f = await setup(t); const first = (await f.post(create)).json();
  const command = { action: "EDIT", requestKey: "pair", id: first.partyId, expectedVersion: 1, name: "ATOMIC HTTP NAME", enabled: false };
  const { enabled: _enabled, ...nameOnly } = command; assert.equal((await f.post(nameOnly)).statusCode, 400);
  for (const enabled of ["false", 0, null]) assert.equal((await f.post({ ...command, enabled })).statusCode, 400);
  const saved = await f.post(command); assert.equal(saved.statusCode, 200, saved.body); assert.equal(saved.json().version, 2); assert.equal(saved.json().enabled, false);
  const detail = (await f.app.inject(`/customers/${first.partyId}`)).json(); assert.equal(detail.name, command.name); assert.equal(detail.enabled, false); assert.equal(detail.version, 2);
  assert.deepEqual((await f.post(command)).json(), saved.json()); assert.equal(f.receipts().length, 2); assert.equal(f.audits().length, 2);
  assert.equal((await f.post({ ...command, enabled: true })).json().error.code, "IDEMPOTENCY_CONFLICT");
  assert.equal((await f.post({ ...command, requestKey: "stale-pair", name: "OTHER", enabled: true })).json().error.code, "VERSION_CONFLICT");
});
test("SYNTHETIC atomic party HTTP: default-customer dependency rejects both edits and status-only save remains atomic", async t => {
  const f = await setup(t); const first = (await f.post(create)).json(); const before = f.customers(); f.defaults.add(first.partyId);
  const blocked = await f.post({ action: "EDIT", requestKey: "blocked-pair", id: first.partyId, expectedVersion: 1, name: "NOT WRITTEN", enabled: false });
  assert.equal(blocked.statusCode, 409); assert.equal(blocked.json().error.code, "CUSTOMER_DEFAULT_IN_USE"); assert.deepEqual(f.customers(), before); assert.equal(f.receipts().length, 1);
  f.defaults.clear(); const statusOnly = await f.post({ action: "EDIT", requestKey: "state-only", id: first.partyId, expectedVersion: 1, name: create.name, enabled: false });
  assert.equal(statusOnly.statusCode, 200); assert.equal(statusOnly.json().version, 2);
  const noop = await f.post({ action: "EDIT", requestKey: "noop", id: first.partyId, expectedVersion: 2, name: create.name, enabled: false });
  assert.equal(noop.statusCode, 409); assert.equal(noop.json().error.code, "NO_PARTY_CHANGE"); assert.equal(f.receipts().length, 2);
});
