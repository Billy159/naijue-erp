/** H03 delta only: real P01 UOW/proof/policy over existing synthetic protocol.
 * No PostgreSQL, ACL, lock scheduling, release certificate or performance claim. */
import test from "node:test";
import assert from "node:assert/strict";
import { salesFactsFixture, cacheDraft, h06 } from "./support/sales-facts-cache-fixture.ts";
import { actor, ids, sid } from "./support/synthetic-fixtures.ts";
import { createSalesActionAuthorization } from "../packages/application/src/sales-authorization.ts";
import { createMaintainedCatalogue26TransactionProof } from "../adapters/postgres/src/catalogue-completeness.ts";
import type { SalesTransaction } from "../packages/application/src/ports.ts";
import type { MaintenanceCompletion } from "../packages/application/src/maintenance-commit-ports.ts";
import type { NativeRuntime26Capability } from "../packages/application/src/native-import-schema-contract.ts";
import type { PgSalesClient } from "../adapters/postgres/src/sales-unit-of-work.ts";

type Exit = "ROLLBACK" | "UNKNOWN_COMMIT";
type Next = "unchanged" | "source-ambiguous" | "version-gap" | "revoked-account";
async function transition(exit: Exit, next: Next, warmed: boolean) {
  const f = salesFactsFixture(), draft = cacheDraft(), policy = createSalesActionAuthorization();
  const originalQuery = f.client.query.bind(f.client), originalRelease = f.client.release.bind(f.client);
  const terminal = Object.assign(Error("SYNTHETIC_H03_TERMINAL"), { code: exit });
  const releases: (Error | boolean | undefined)[] = [];
  let later = false, failCommit = exit === "UNKNOWN_COMMIT", escaped: SalesTransaction | undefined;
  f.client.release = error => { releases.push(error); originalRelease(error); };
  f.client.query = async (sql, values) => {
    const result = await originalQuery(sql, values);
    if (sql === "COMMIT" && failCommit) { failCommit = false; throw terminal; }
    if (!later) return result;
    if (next === "source-ambiguous" && sql.includes("maintained-catalogue26:product-source"))
      return { rows: [{ id: sid("product", 30001) }, { id: sid("product", 30002) }], rowCount: 2 };
    if (next === "version-gap" && sql.includes("maintained-catalogue26:roots"))
      return { ...result, rows: result.rows.map(row => ({ ...row, version: 2 })) };
    if (next === "revoked-account" && sql.includes("sales-authorization:identity"))
      return { ...result, rows: result.rows.map(row => ({ ...row, login_enabled: false })) };
    return result;
  };
  const bind = async (tx: SalesTransaction) => {
    await tx.getReceipt(ids.account, "SYNTHETIC-H03"); await tx.getSales(ids.sales);
    await policy.assertAllowed(actor, "SAVE", draft, tx);
  };
  await assert.rejects(f.original.transaction(async tx => {
    escaped = tx; await bind(tx);
    if (warmed) {
      const a = await tx.getCurrentSalesReferenceFacts!(draft);
      assert.equal(await tx.getCurrentSalesReferenceFacts!(draft), a);
      await tx.getCurrentSalesSnapshots!([h06.sku]);
    }
    if (exit === "ROLLBACK") throw terminal;
  }), error => error === terminal);
  assert.equal(f.count("ROLLBACK"), exit === "ROLLBACK" ? 1 : 0, "Unknown COMMIT cannot be claimed rolled back");
  assert.equal(releases[0], exit === "UNKNOWN_COMMIT" ? terminal : undefined);
  const closedAt = f.calls.length;
  await assert.rejects(escaped!.getCurrentSalesReferenceFacts!(draft), { code: "TRANSACTION_SCOPE" });
  await assert.rejects(escaped!.getCurrentSalesSnapshots!([h06.sku]), { code: "TRANSACTION_SCOPE" });
  assert.equal(f.calls.length, closedAt);
  later = true;
  const identities = f.count("sales-authorization:identity"), proofs = f.count("maintained-catalogue26:chain");
  let outcome: unknown;
  try {
    outcome = await f.original.transaction(async tx => { await bind(tx); return await tx.getCurrentSalesReferenceFacts!(draft); });
  } catch (error) {
    assert.ok(error !== null && typeof error === "object" && "code" in error);
    outcome = { rejected: error.code };
  }
  assert.equal(f.count("sales-authorization:identity"), identities + 1, "Next callback must read current locked identity");
  if (next === "unchanged" || next === "version-gap") assert.equal(f.count("maintained-catalogue26:chain"), proofs + 1);
  if (next === "revoked-account") assert.equal(f.count("maintained-catalogue26:chain"), proofs, "Current denial precedes fact reuse");
  assert.equal(f.writes.length, 0);
  return outcome;
}
for (const exit of ["ROLLBACK", "UNKNOWN_COMMIT"] as const) {
  test(`H03 ${exit}: warm reuse and cold path have the same next-request refusal set`, async () => {
    for (const next of ["unchanged", "source-ambiguous", "version-gap", "revoked-account"] as const) {
      const cold = await transition(exit, next, false), warm = await transition(exit, next, true);
      assert.deepEqual(warm, cold, `${exit}/${next}: reuse must not change results`);
      if (next !== "unchanged") assert.deepEqual(warm, { rejected: next === "revoked-account" ? "FORBIDDEN" : "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" });
      else assert.ok(warm !== null && typeof warm === "object" && !("rejected" in warm));
    }
  });
}

test("H03 an already admitted capacity operation cannot hide a later runtime revocation", async () => {
  let revoked = false, queries = 0;
  const client: PgSalesClient = { async query() { queries++; return { rows: [{ occupied: false }], rowCount: 1 }; }, release() {} };
  const runtime: NativeRuntime26Capability = { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady(actual) {
    assert.equal(actual, client);
    if (revoked) throw Object.assign(Error("SYNTHETIC_REVOKED_RUNTIME"), { code: "NATIVE_RUNTIME26_NOT_READY" });
  } };
  const proof = createMaintainedCatalogue26TransactionProof(client, runtime, () => {});
  const completion: MaintenanceCompletion = { operationId: sid("operation", 30003), actorAccountId: ids.account, requestKey: "SYNTHETIC-H03-CREATE",
    requestHash: "a".repeat(64), kind: "PRODUCT", action: "CREATE", targetId: h06.product, oldVersion: null, newVersion: 1,
    beforeValues: null, afterValues: { version: 1, name: "SYNTHETIC-H03" }, completedAt: "2026-10-29T00:00:00Z" };
  await proof.assertPendingCapacity(completion); await proof.assertPendingCapacity(completion); assert.equal(queries, 1);
  revoked = true;
  await assert.rejects(proof.assertPendingCapacity(completion), { code: "NATIVE_RUNTIME26_NOT_READY" });
  assert.equal(queries, 1, "A cached exact operation must still check its current original runtime authority");
});
