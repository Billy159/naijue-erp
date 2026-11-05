import test from "node:test";
import assert from "node:assert/strict";
import { createPartyReadService } from "../packages/application/src/party-read-service.ts";
import { createSourcePartyReadAuthorization } from "../packages/application/src/party-read-policy.ts";
import type { PartyReadGrant, PartyReadIntent, PartyRecord, PartyActor } from "../packages/application/src/party-read-ports.ts";
import { ids, sid } from "./support/synthetic-fixtures.ts";
import { entityId, version } from "../packages/domain/src/values.ts";
const actor: PartyActor = { accountId: ids.account, hallId: ids.hall, role: "WAREHOUSE" };
const record: PartyRecord = { id: entityId("customer", ids.customer), code: "  原始编码001  ", name: "原名", enabled: true, version: version(1), createdAt: null, updatedAt: null };
const query = { search: "", enabled: "ALL", page: 1, pageSize: 20 };
const signal = () => new AbortController().signal;
const grant = (i: PartyReadIntent): PartyReadGrant => ({ kind: i.kind, operation: i.operation, targetId: i.operation === "DETAIL" ? i.id : null });
const code = (expected: string) => (error: unknown) => error instanceof Error && "code" in error && error.code === expected;
test("party read service preserves nullable original fields and candidate-only projection without write dependencies", async () => {
  const seen: PartyReadIntent[] = [];
  const service = createPartyReadService({ authorization: { async authorize(_a, i) { seen.push(i); return grant(i); } },
    reader: { async search(r) { assert.notEqual(r.intent.operation, "DETAIL"); return { items: [record], total: 1, page: 1, pageSize: 20 }; }, async detail() { return record; } } });
  assert.deepEqual(await service.search(actor, "CUSTOMER", query, false, signal()), { items: [record], total: 1, page: 1, pageSize: 20 });
  assert.deepEqual(await service.detail(actor, "CUSTOMER", ids.customer, signal()), record);
  assert.deepEqual(await service.search(actor, "CUSTOMER", { search: "", page: 1, pageSize: 20 }, true, signal()),
    { items: [{ id: ids.customer, code: record.code, name: record.name }], total: 1, page: 1, pageSize: 20 });
  assert.equal(seen[2]!.operation, "CANDIDATES"); assert.equal(seen[2]!.query.enabled, "ENABLED");
});
test("party grants require exact kind/operation/target and deny before any reader call", async () => {
  for (const wrong of [
    { kind: "SUPPLIER", operation: "DETAIL", targetId: ids.customer }, { kind: "CUSTOMER", operation: "LIST", targetId: ids.customer },
    { kind: "CUSTOMER", operation: "DETAIL", targetId: sid("customer", 900) }, { kind: "CUSTOMER", operation: "DETAIL", targetId: ids.customer, extra: true },
  ]) {
    let reads = 0; const service = createPartyReadService({ authorization: { async authorize() { return wrong as PartyReadGrant; } },
      reader: { async search(): Promise<never> { reads++; throw Error(); }, async detail(): Promise<never> { reads++; throw Error(); } } });
    await assert.rejects(service.detail(actor, "CUSTOMER", ids.customer, signal()), code("FORBIDDEN")); assert.equal(reads, 0);
  }
});
test("party service rejects invalid ID/input, aborted requests, missing detail and invalid trusted candidate output", async () => {
  let calls = 0, missing = false;
  const service = createPartyReadService({ authorization: { async authorize(_a, i) { calls++; return grant(i); } },
    reader: { async search() { return { items: [{ ...record, enabled: false }], total: 1, page: 1, pageSize: 20 }; }, async detail() { return missing ? undefined : { ...record, id: entityId("customer", sid("customer", 900)) }; } } });
  await assert.rejects(service.detail(actor, "CUSTOMER", "invalid", signal()), code("INVALID_ID"));
  await assert.rejects(service.search(actor, "CUSTOMER", { ...query, unknown: 1 }, false, signal()), code("INVALID_PARTY_INPUT"));
  const c = new AbortController();c.abort(); await assert.rejects(service.detail(actor, "CUSTOMER", ids.customer, c.signal), code("PARTY_READ_ABORTED")); assert.equal(calls, 0);
  await assert.rejects(service.detail(actor, "CUSTOMER", ids.customer, signal()), /trusted party/i);
  missing = true; await assert.rejects(service.detail(actor, "CUSTOMER", ids.customer, signal()), code("PARTY_NOT_FOUND"));
  await assert.rejects(service.search(actor, "CUSTOMER", { search: "", page: 1, pageSize: 20 }, true, signal()), /trusted party/i);
});
test("explicit party read role policy preserves old LIST/DETAIL roles and candidate permissions", async () => {
  const policy = createSourcePartyReadAuthorization();
  for (const role of ["ADMIN", "WAREHOUSE", "SALESPERSON"] as const) for (const kind of ["CUSTOMER", "SUPPLIER"] as const) {
    const current = { ...actor, role };
    const list: PartyReadIntent = { kind, operation: "LIST", query: { ...query, enabled: "ALL", pageSize: 20 } };
    const detail: PartyReadIntent = { kind, operation: "DETAIL", id: sid(kind === "CUSTOMER" ? "customer" : "supplier", 701) };
    if (role === "SALESPERSON") { await assert.rejects(policy.authorize(current, list, signal()), code("FORBIDDEN")); await assert.rejects(policy.authorize(current, detail, signal()), code("FORBIDDEN")); }
    else { assert.deepEqual(await policy.authorize(current, list, signal()), grant(list)); assert.deepEqual(await policy.authorize(current, detail, signal()), grant(detail)); }
    const candidates: PartyReadIntent = { kind, operation: "CANDIDATES", query: { search: "", enabled: "ENABLED", page: 1, pageSize: 20 } };
    assert.deepEqual(await policy.authorize(current, candidates, signal()), grant(candidates));
  }
});
