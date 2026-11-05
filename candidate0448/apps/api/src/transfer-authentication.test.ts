/** SYNTHETIC session/actor tests only. No listener, network, database or credential source. */
import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticationPrincipal } from "../../../packages/authentication/src/ports.ts";
import type { AuthenticationService } from "../../../packages/authentication/src/service.ts";
import { createSourceConfirmedTransferQueryAuthorization } from "../../../packages/application/src/transfer-query-service.ts";
import type { TransferQueryAuthenticationInput } from "./transfer-query-http.ts";
import { createTransferSessionAuthenticator } from "./transfer-authentication.ts";
import { ids, sid } from "../../../tests/support/synthetic-fixtures.ts";

const ORIGIN = "https://synthetic-erp.invalid";
const TOKEN = Buffer.alloc(32, 17).toString("base64url");
const identity = (): AuthenticationPrincipal => ({ accountId: ids.account, staffId: sid("staff", 101), loginName: "SYNTHETIC.employee",
  role: "SALESPERSON", hallId: ids.hall, authVersion: 1 });
function fixture() {
  let principal: AuthenticationPrincipal | null = identity(); let calls = 0;
  const service: AuthenticationService = {
    async resolve(token) { calls++; assert.equal(token, TOKEN); return principal; },
    async login() { throw new Error("SYNTHETIC unused operation"); }, async logout() {}, async changeOwnPassword() {}
  };
  const authenticate = createTransferSessionAuthenticator({ service, trustedOrigin: ORIGIN });
  const input = (headers: TransferQueryAuthenticationInput["headers"] = {}): TransferQueryAuthenticationInput => ({ method: "POST", url: "/transfers/query", ip: "127.0.0.1",
    headers: { cookie: `__Host-naijue_session=${TOKEN}`, origin: ORIGIN, ...headers } });
  return { authenticate, input, calls: () => calls, setPrincipal: (value: AuthenticationPrincipal | null) => { principal = value; } };
}
test("SYNTHETIC transfer session: current authenticated role/hall maps to exact canonical read scope, not request headers", async () => {
  const f = fixture(); const policy = createSourceConfirmedTransferQueryAuthorization();
  const actor = await f.authenticate(f.input({ "x-role": "ADMIN", "x-hall-id": sid("hall", 999) }));
  assert.deepEqual(actor, { accountId: ids.account, hallId: ids.hall, role: "SALESPERSON" }); assert.ok(Object.isFrozen(actor));
  assert.deepEqual(await policy.authorize(actor!, { kind: "detail", parameters: { transferId: sid("transfer", 102) } }, new AbortController().signal),
    { kind: "restricted", clauses: [{ fromHallId: ids.hall }, { toHallId: ids.hall }, { createdHallId: ids.hall, createdRole: "SALESPERSON" }] });
  const changedHall = sid("hall", 103); f.setPrincipal({ ...identity(), hallId: changedHall });
  assert.deepEqual(await f.authenticate(f.input()), { accountId: ids.account, hallId: changedHall, role: "SALESPERSON" });
  for (const role of ["ADMIN", "WAREHOUSE"] as const) {
    f.setPrincipal({ ...identity(), role, hallId: null });
    const current = await f.authenticate(f.input()); assert.deepEqual(current, { accountId: ids.account, hallId: null, role });
    assert.deepEqual(await policy.authorize(current!, { kind: "detail", parameters: { transferId: sid("transfer", 102) } }, new AbortController().signal), { kind: "all" });
  }
  // This all-scope is the explicitly selected canonical policy, not an authenticator fallback.
  assert.equal(f.calls(), 4);
});
test("SYNTHETIC transfer session: cookie-only exact HTTPS Origin checks reject credentials before storage", async () => {
  const f = fixture();
  for (const headers of [{ origin: "https://other.invalid" }, { origin: undefined }, { authorization: `Bearer ${TOKEN}` },
    { "sec-fetch-site": "cross-site" }, { cookie: "" }, { cookie: `__Host-naijue_session=${TOKEN}; __Host-naijue_session=${TOKEN}` },
    { cookie: "__Host-naijue_session=invalid" }]) assert.equal(await f.authenticate(f.input(headers)), null);
  assert.equal(await f.authenticate({ ...f.input(), url: "//other.invalid/transfers/query" }), null);
  assert.equal(f.calls(), 0);
});
test("SYNTHETIC transfer session: no role fallback, stale session or hall-less salesperson identity", async () => {
  const f = fixture(); f.setPrincipal(null); assert.equal(await f.authenticate(f.input()), null);
  f.setPrincipal({ ...identity(), hallId: null }); assert.equal(await f.authenticate(f.input()), null);
  f.setPrincipal({ ...identity(), role: "UNKNOWN" }); await assert.rejects(f.authenticate(f.input()), /Invalid trusted party role/);
  f.setPrincipal({ ...identity(), accountId: "not-an-account" } as AuthenticationPrincipal); await assert.rejects(f.authenticate(f.input()), /Invalid trusted party actor identity/);
  f.setPrincipal({ ...identity(), hallId: "not-a-hall" } as AuthenticationPrincipal); await assert.rejects(f.authenticate(f.input()), /Invalid trusted party actor identity/);
});
test("SYNTHETIC transfer session: explicit trusted configuration and provider failures are not hidden", async () => {
  const service: AuthenticationService = { async resolve() { throw new Error("SYNTHETIC unavailable auth store"); },
    async login() { throw new Error("SYNTHETIC unused operation"); }, async logout() {}, async changeOwnPassword() {} };
  for (const trustedOrigin of ["http://synthetic.invalid", `${ORIGIN}/`, `${ORIGIN}/path`, "https://name:password@synthetic.invalid", "not-an-origin"])
    assert.throws(() => createTransferSessionAuthenticator({ trustedOrigin, service }), /trusted HTTPS origin|authentication service/);
  const authenticate = createTransferSessionAuthenticator({ trustedOrigin: ORIGIN, service });
  await assert.rejects(authenticate(fixture().input()), /SYNTHETIC unavailable auth store/);
});
test("SYNTHETIC transfer session: caller mutation cannot replace captured HTTPS origin or trusted resolver", async () => {
  let originalCalls = 0; let replacedCalls = 0;
  const service: AuthenticationService = { async resolve() { originalCalls++; return identity(); },
    async login() { throw new Error("SYNTHETIC unused operation"); }, async logout() {}, async changeOwnPassword() {} };
  const options = { service, trustedOrigin: ORIGIN }; const authenticate = createTransferSessionAuthenticator(options);
  options.trustedOrigin = "http://other.invalid";
  service.resolve = async () => { replacedCalls++; return { ...identity(), role: "ADMIN", hallId: null }; };
  assert.equal(await authenticate(fixture().input({ origin: "http://other.invalid" })), null);
  assert.deepEqual(await authenticate(fixture().input()), { accountId: ids.account, hallId: ids.hall, role: "SALESPERSON" });
  assert.equal(originalCalls, 1); assert.equal(replacedCalls, 0);
});
