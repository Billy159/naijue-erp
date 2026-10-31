/** SYNTHETIC fetch contract only: no API server, cookies, PG, writes or SQL-engine evidence. */
import assert from "node:assert/strict";
import test from "node:test";
import { createStaffSettingsHttpReader } from "../apps/web/src/staff-settings/http-client.ts";
import type { QueryRead } from "../apps/web/src/loading/latest-query.ts";
import { initialStaffSettingsQuery, type StaffSettingsQuery } from "../apps/web/src/staff-settings/contracts.ts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const read = <P>(parameters: P): QueryRead<P> => ({ parameters, signal: new AbortController().signal, identity: { accountId: "NEVER-SEND-IDENTITY", sessionRevision: "1", permissionRevision: "1" }, routeInstanceId: "SYNTHETIC", entityId: null });
// Independent source fixtures; no success DTO is rewritten to manufacture a disabled account.
const staff = [null, true, false].map((enabled, n) => ({ kind: "STAFF", id: id(n + 1), name: `SYNTHETIC ${n}`, role: "WAREHOUSE", hall: null, contact: null, employmentStatus: "在职", version: 1, createdAt: null, updatedAt: null,
  account: enabled === null ? null : { id: id(n + 11), loginName: `login-${n}`, loginEnabled: enabled, authVersion: 1, version: 1 } }));
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
test("native staff reader advertises paired CLOSED support and sends exact same-origin POST while preserving account absence", async () => {
  const requests: { input: string; init: RequestInit }[] = [];
  const reader = createStaffSettingsHttpReader({ origin: "https://synthetic.test", basePath: "/api", fetch: async (input, init) => {
    requests.push({ input, init }); const q = JSON.parse(String(init.body));
    const items = staff.filter(row => q.loginStatus === "" || (q.loginStatus === "open" ? row.account?.loginEnabled === true : row.account?.loginEnabled === false));
    return json({ kind: "STAFF", page: q.page, pageSize: q.pageSize, total: items.length, items });
  } });
  assert.equal(reader.capabilities?.loginStatusFilter, true);
  for (const [loginStatus, expected] of [["", [id(1), id(2), id(3)]], ["open", [id(2)]], ["closed", [id(3)]]] as const) {
    const result = await reader.readList(read({ ...initialStaffSettingsQuery, loginStatus }));
    assert.deepEqual(result.items.map(item => item.id), expected);
    if (loginStatus === "") assert.equal(result.items[0]!.account, null);
    if (loginStatus === "closed") assert.equal(result.items[0]!.account!.loginEnabled, false);
    const request = requests.at(-1)!; assert.equal(request.input, "https://synthetic.test/api/staff/query");
    assert.equal(request.init.method, "POST"); assert.equal(request.init.mode, "same-origin"); assert.equal(request.init.credentials, "same-origin"); assert.equal(request.init.cache, "no-store");
    assert.deepEqual(JSON.parse(String(request.init.body)), { search: "", status: "normal", hallId: null, page: 1, pageSize: 20, role: "", loginStatus });
    assert.doesNotMatch(String(request.init.body), /NEVER-SEND|requestKey|scope|identity/);
  }
  assert.equal(requests.length, 3); assert.ok(requests.every(row => !/commands|receipts/.test(row.input)));
});
test("native staff reader rejects invalid login enums before fetch and malformed account booleans without coercion", async () => {
  let calls = 0;
  const reader = createStaffSettingsHttpReader({ origin: "https://synthetic.test", basePath: "/api", fetch: async () => { calls++; throw Error("Not dispatched"); } });
  for (const loginStatus of [undefined, null, false, 0, "all", "OPEN", "unopened", {}, []])
    await assert.rejects(reader.readList(read({ ...initialStaffSettingsQuery, loginStatus } as unknown as StaffSettingsQuery)), { kind: "invalid-request" });
  assert.equal(calls, 0);
  const disabled = staff[2]!;
  const malformed = createStaffSettingsHttpReader({ origin: "https://synthetic.test", basePath: "/api", fetch: async () => json({ kind: "STAFF", page: 1, pageSize: 20, total: 1, items: [{ ...disabled, account: { ...disabled.account, loginEnabled: null } }] }) });
  await assert.rejects(malformed.readList(read({ ...initialStaffSettingsQuery, loginStatus: "closed" })), { kind: "malformed-response" });
});
