/** Actual private D1 context/Evidence with scripted SQL; no PostgreSQL or real approval. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createNativeRuntime26Issuer, NATIVE_RUNTIME26_METADATA_PROBE } from "../adapters/postgres/src/native-import-accounting-capability.ts";
import { PostgresMaintenanceCommandUnitOfWork } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import type { MaintenancePgContext } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import type { ProductMaintenanceEvidence } from "../packages/application/src/product-maintenance-ports.ts";
import { entityId } from "../packages/domain/src/values.ts";
const account = entityId("account", "00000000-0000-4000-8000-000000000001"), product = "00000000-0000-4000-8000-000000000002", operation = "00000000-0000-4000-8000-000000000003";
const actor = { accountId: account, hallId: null }, hash = (v: string) => createHash("sha256").update(v).digest("hex");
const completion = (): Parameters<ProductMaintenanceEvidence["complete"]>[0] => ({ operationId: operation, actorAccountId: account, requestKey: "synthetic-media-key", requestHash: "b".repeat(64), kind: "PRODUCT", action: "EDIT", targetId: product,
  oldVersion: 1, newVersion: 2, beforeValues: { version: 1, images: [{ id: "00000000-0000-4000-8000-000000000004", version: 1, file_ref: "SYNTHETIC_PRIVATE_ONLY", color_id: "old" }] },
  afterValues: { version: 2, images: [{ id: "00000000-0000-4000-8000-000000000004", version: 2, file_ref: "SYNTHETIC_PRIVATE_ONLY", color_id: "new" }] }, completedAt: "2026-10-23T00:00:00Z" });
async function fixture(zeroAudit = false) {
  const directory = mkdtempSync(join(tmpdir(), "d1-media-proof-synthetic-")), receiptPath = join(directory, "receipt.json"), reviewFile = join(directory, "review.json"), digest = "a".repeat(64);
  const receipt = '{"result":"PASS","notice":"SYNTHETIC_PROTOCOL_ONLY"}'; writeFileSync(receiptPath, receipt, { mode: 0o600 });
  const target = { database: "SYNTHETIC_ONLY", databaseOid: "123", actingRole: "synthetic_owner", sessionUser: "synthetic_session", serverAddress: null, serverPort: null, postmasterStart: "2026-10-23 00:00:00+00" };
  const review = JSON.stringify({ version: "C_NATIVE_RUNTIME26_REVIEW_V1", decision: "ACCEPT_EXACT_RUNTIME26_TARGET_METADATA", target, catalog: { format: "EXACT26_RUNTIME_CATALOG_EXPORT_V1", sha256: digest, patchLevel: "26_v9_empty_history_publication_dispatch" },
    purposes: ["PRODUCT_MAINTENANCE"], scope: "EXACT_TARGET_METADATA_ONLY", independentReview: { path: receiptPath, sha256: hash(receipt), result: "PASS" }, realImportExecutionAuthorized: false });
  writeFileSync(reviewFile, review, { mode: 0o600 }); const calls: string[] = [], releases: unknown[] = [];
  const pool = { async connect() { return { async query(sql: string, values: unknown[] = []) { calls.push(sql);
    const rows = sql === NATIVE_RUNTIME26_METADATA_PROBE ? [{ identity: { database: target.database, database_oid: target.databaseOid, database_owner: "synthetic_owner", current_user: target.actingRole, session_user: target.sessionUser,
      server_version_num: "170011", server_addr: null, server_port: null, postmaster_start: target.postmasterStart, replication_role: "origin" }, migration_versions: Array.from({ length: 26 }, (_, i) => i + 1), catalog_sha256: digest, source_routines_match: true }]
      : sql.includes("maintenance:identity") ? [{ account_id: account, staff_id: "00000000-0000-4000-8000-000000000005", login_enabled: true, role: "ADMIN", employment_status: "在职", hall_id: null }]
        : sql.includes("maintenance:complete") ? [{ result_data: JSON.parse(values[7] as string) }] : [];
    return { rows, rowCount: sql.includes("maintenance:audit") ? zeroAudit ? 0 : 1 : rows.length };
  }, release(error?: unknown) { releases.push(error); } }; } };
  try { const issuer = await createNativeRuntime26Issuer(pool, { reviewFile, trustedReviewSha256: hash(review) });
    return { issuer, calls, releases, driver: new PostgresMaintenanceCommandUnitOfWork(issuer.pool), cleanup: () => rmSync(directory, { recursive: true, force: true }) };
  } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
}
async function prepareIdentity(context: MaintenancePgContext) { await context.evidence.getReceipt(account, "synthetic-media-key", "PRODUCT"); await context.evidence.assertAllowed(actor, "PRODUCT", "EDIT"); }
test("media proof requires actual inserted audit and the complete unchanged original completion on the original context", async () => {
  const f = await fixture(); try {
    f.issuer.productMediaWrite.assertVerified(f.driver); f.issuer.imageColorSwap.assertVerified(f.driver);
    assert.deepEqual(Reflect.ownKeys(f.issuer.productMediaWrite).sort(), ["assertPrepared", "assertReady", "assertVerified", "profile"]);
    assert.deepEqual(Reflect.ownKeys(f.issuer.imageColorSwap).sort(), ["assertReady", "assertVerified", "profile"]);
    await f.driver.transaction(async context => {
      await prepareIdentity(context); await f.issuer.productMediaWrite.assertReady(context); const value = completion(), count = f.calls.length;
      await assert.rejects(f.issuer.productMediaWrite.assertPrepared(context, value), { code: "PRODUCT_MEDIA_NOT_READY" }); assert.equal(f.calls.length, count);
      await context.evidence.prepare!(value); const preparedAt = f.calls.lastIndexOf(f.calls.find(s => s.includes("maintenance:audit"))!);
      await f.issuer.productMediaWrite.assertPrepared(context, structuredClone(value)); await f.issuer.imageColorSwap.assertReady(context, value);
      assert.ok(f.calls.lastIndexOf(NATIVE_RUNTIME26_METADATA_PROBE) > preparedAt);
      const tampered = { ...value, afterValues: { ...value.afterValues, images: [] } }, n = f.calls.length;
      await assert.rejects(f.issuer.productMediaWrite.assertPrepared(context, tampered), { code: "PRODUCT_MEDIA_NOT_READY" }); assert.equal(f.calls.length, n);
      await context.evidence.complete(value);
      await assert.rejects(f.issuer.productMediaWrite.assertPrepared(context, value), { code: "TRANSACTION_SCOPE" });
    }); assert.equal(f.calls.at(-1), "COMMIT");
  } finally { f.cleanup(); }
});
test("media proof rejects copies, foreign and expired contexts with no external registration path", async () => {
  const f = await fixture(), other = await fixture(); let escaped: MaintenancePgContext | undefined;
  try {
    assert.throws(() => f.issuer.productMediaWrite.assertVerified(other.driver), { code: "NATIVE_RUNTIME26_NOT_READY" });
    await f.driver.transaction(async context => {
      escaped = context; await prepareIdentity(context); await context.evidence.prepare!(completion());
      await assert.rejects(f.issuer.productMediaWrite.assertReady({ ...context }), { code: "NATIVE_RUNTIME26_NOT_READY" });
      await assert.rejects(other.issuer.productMediaWrite.assertPrepared(context, completion()), { code: "NATIVE_RUNTIME26_NOT_READY" });
      await f.issuer.productMediaWrite.assertPrepared(context, completion());
    }); const n = f.calls.length;
    await assert.rejects(f.issuer.productMediaWrite.assertReady(escaped!), { code: "NATIVE_RUNTIME26_NOT_READY" });
    await assert.rejects(f.issuer.imageColorSwap.assertReady(escaped!, completion()), { code: "NATIVE_RUNTIME26_NOT_READY" }); assert.equal(f.calls.length, n);
  } finally { f.cleanup(); other.cleanup(); }
});
test("media proof cannot turn an existing prepare method or failed audit INSERT into prepared authorization", async () => {
  const f = await fixture(true); try {
    await assert.rejects(f.driver.transaction(async context => {
      await prepareIdentity(context); assert.equal(typeof context.evidence.prepare, "function");
      await assert.rejects(context.evidence.prepare!(completion()), { code: "INVALID_DATABASE_VALUE" });
      await f.issuer.productMediaWrite.assertPrepared(context, completion());
    }), { code: "PRODUCT_MEDIA_NOT_READY" });
    assert.equal(f.calls.at(-1), "ROLLBACK"); assert.ok(!f.calls.includes("COMMIT"));
  } finally { f.cleanup(); }
});
test("media proof rejects incomplete changed image sets even if an audit was inserted", async () => {
  const f = await fixture(); try {
    await assert.rejects(f.driver.transaction(async context => {
      await prepareIdentity(context); const value = { ...completion(), beforeValues: { version: 1 } };
      await context.evidence.prepare!(value); await f.issuer.imageColorSwap.assertReady(context, value);
    }), { code: "PRODUCT_MEDIA_NOT_READY" }); assert.equal(f.calls.at(-1), "ROLLBACK");
  } finally { f.cleanup(); }
});
