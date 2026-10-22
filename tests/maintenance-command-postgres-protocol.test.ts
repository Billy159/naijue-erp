/** Scripted protocol only; no PostgreSQL, real identities or durability evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresMaintenanceCommandUnitOfWork } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import type { MaintenancePgContext } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import { maintenanceKinds, maintenanceActions } from "../packages/application/src/maintenance-commit-ports.ts";
import type { MaintenanceCompletion, MaintenanceResult } from "../packages/application/src/maintenance-commit-ports.ts";
import { entityId } from "../packages/domain/src/values.ts";
import type { PgProductMaintenanceDriver } from "../adapters/postgres/src/product-maintenance-store.ts";
import { createNodeCredentialRequestTag } from "../packages/authentication/src/passwords.ts";
const d2DriverCompatibility: PostgresMaintenanceCommandUnitOfWork extends PgProductMaintenanceDriver ? true : never = true;
void d2DriverCompatibility;
const account = entityId("account", "00000000-0000-4000-8000-000000000001"), target = "00000000-0000-4000-8000-000000000002", operation = "00000000-0000-4000-8000-000000000003";
const actor = { accountId: account, hallId: null };
const completion = (): MaintenanceCompletion => ({ operationId: operation, actorAccountId: account, requestKey: "original-key", requestHash: "a".repeat(64), kind: "PRODUCT", action: "CREATE", targetId: target,
  oldVersion: null, newVersion: 1, beforeValues: null, afterValues: { id: target, version: 1, name: "SYNTHETIC" }, completedAt: "2026-10-22T00:00:00Z" });
function scripted(options: { role?: string; failAt?: string; prior?: boolean; priorKind?: string; enabled?: boolean; zeroAudit?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [], released: unknown[] = []; let connects = 0;
  const failure = Error("SYNTHETIC_" + options.failAt);
  const expected: MaintenanceResult = { operationId: operation, kind: "PRODUCT", targetId: target, version: 1 };
  const pool = { async connect() { connects++; return { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values }); if (options.failAt && (options.failAt === "COMMIT" ? sql === "COMMIT" : sql.includes(options.failAt))) throw failure;
    const rows = sql.includes("maintenance:identity") ? [{ account_id: account, staff_id: "00000000-0000-4000-8000-000000000004", login_enabled: options.enabled ?? true, role: options.role ?? "ADMIN", employment_status: "在职", hall_id: null }]
      : sql.includes("maintenance:receipt") && options.prior ? [{ id: operation, request_hash: "a".repeat(64), action: "CREATE", target_type: options.priorKind ?? "PRODUCT", target_id: target, result_data: expected, completed_at: "2026-10-22T00:00:00.000000Z" }]
        : sql.includes("maintenance:complete") ? [{ result_data: JSON.parse(values[7] as string) }] : [];
    return { rows, rowCount: sql.includes("maintenance:audit") ? options.zeroAudit ? 0 : 1 : rows.length };
  }, release(error?: unknown) { released.push(error); } }; } };
  return { uow: new PostgresMaintenanceCommandUnitOfWork(pool), calls, released, failure, connects: () => connects, expected };
}
async function command(p: ReturnType<typeof scripted>) {
  return p.uow.transaction(async ({ client, evidence }) => {
    assert.equal(await evidence.getReceipt(account, "original-key", "PRODUCT"), undefined);
    await evidence.assertAllowed(actor, "PRODUCT", "CREATE"); await client.query("/* synthetic:leaf-write */ UPDATE SYNTHETIC_ONLY");
    return evidence.complete(completion());
  });
}
test("maintenance same lease owns global key, current identity, leaf write, sparse audit and exact receipt", async () => {
  const p = scripted(); assert.deepEqual(await command(p), p.expected); assert.equal(p.connects(), 1); assert.deepEqual(p.released, [undefined]);
  const index = (s: string) => p.calls.findIndex(c => c.sql.includes(s));
  assert.ok(index("naijue:receipt") === -1); // Lock namespace is a parameter, never executable interpolation.
  const lock = p.calls.find(c => c.sql.includes("pg_advisory_xact_lock"))!;
  assert.deepEqual(lock.values, [`naijue:receipt:${JSON.stringify([account, "original-key"])}`]);
  assert.ok(index("pg_advisory_xact_lock") < index("maintenance:identity"));
  assert.ok(index("synthetic:leaf-write") < index("maintenance:audit")); assert.ok(index("maintenance:audit") < index("maintenance:complete"));
  assert.ok(index("maintenance:complete") < p.calls.findIndex(c => c.sql === "COMMIT"));
  const audit = p.calls.find(c => c.sql.includes("maintenance:audit"))!;
  assert.equal(audit.values[7], null); assert.deepEqual(JSON.parse(audit.values[8] as string), completion().afterValues);
});
test("maintenance uncertain COMMIT preserves original failure and discards without rollback/retry", async () => {
  const p = scripted({ failAt: "COMMIT" }); await assert.rejects(command(p), error => error === p.failure);
  assert.equal(p.connects(), 1); assert.deepEqual(p.released, [p.failure]); assert.equal(p.calls.filter(c => c.sql === "COMMIT").length, 1);
  assert.equal(p.calls.some(c => c.sql === "ROLLBACK"), false); assert.equal(p.calls.filter(c => c.sql.includes("maintenance:complete")).length, 1);
});
test("maintenance failure before COMMIT rolls back original leaf/audit work; never reports success", async () => {
  const p = scripted({ failAt: "maintenance:complete" }); await assert.rejects(command(p), error => error === p.failure);
  assert.equal(p.calls.filter(c => c.sql === "ROLLBACK").length, 1); assert.equal(p.calls.some(c => c.sql === "COMMIT"), false); assert.deepEqual(p.released, [undefined]);
});
test("maintenance original receipt requires current authority and cross-kind global keys conflict", async () => {
  const p = scripted({ prior: true }); const r = await p.uow.transaction(async ({ evidence }) => {
    const receipt = await evidence.getReceipt(account, "original-key", "PRODUCT"); await evidence.assertAllowed(actor, "PRODUCT", "CREATE"); return receipt;
  }); assert.deepEqual(r!.result, p.expected); assert.ok(!p.calls.some(c => c.sql.includes("INSERT")));
  const other = scripted({ prior: true, priorKind: "SALES" }); await assert.rejects(other.uow.transaction(({ evidence }) => evidence.getReceipt(account, "original-key", "PRODUCT")), { code: "IDEMPOTENCY_CONFLICT" });
  const revoked = scripted({ prior: true, enabled: false }); await assert.rejects(revoked.uow.transaction(({ evidence }) => evidence.getReceipt(account, "original-key", "PRODUCT")), { code: "FORBIDDEN" });
  assert.ok(!revoked.calls.some(c => c.sql.includes("maintenance:receipt")));
});
test("maintenance ten-family role/action matrix is server-derived and rejects stale hall or unknown action", async () => {
  for (const family of maintenanceKinds) {
    const admin = scripted(); await admin.uow.transaction(({ evidence }) => evidence.assertAllowed(actor, family, maintenanceActions[family][0]!));
    const warehouse = scripted({ role: "WAREHOUSE" }); const attempt = warehouse.uow.transaction(({ evidence }) => evidence.assertAllowed(actor, family, maintenanceActions[family][0]!));
    if (family === "STAFF" || family === "ACCOUNT") await assert.rejects(attempt, { code: "FORBIDDEN" }); else await attempt;
  }
  const stale = scripted(); await assert.rejects(stale.uow.transaction(({ evidence }) => evidence.assertAllowed({ ...actor, hallId: entityId("hall", target) }, "PRODUCT", "CREATE")), { code: "FORBIDDEN" });
  const unknown = scripted(); await assert.rejects(unknown.uow.transaction(({ evidence }) => evidence.assertAllowed(actor, "PRODUCT", "PUBLISH")), { code: "FORBIDDEN" });
  assert.equal(Object.isFrozen(maintenanceActions.PRODUCT), true);
});
test("maintenance rejects credential evidence, false version and unbound completion before audit insert", async () => {
  for (const after of [{ version: 1, password_hash: "SYNTHETIC_FORBIDDEN" }, { version: 2 }]) {
    const p = scripted(); await assert.rejects(p.uow.transaction(async ({ evidence }) => {
      await evidence.getReceipt(account, "original-key", "PRODUCT"); await evidence.assertAllowed(actor, "PRODUCT", "CREATE");
      return evidence.complete({ ...completion(), afterValues: after });
    }), { code: "INVALID_MAINTENANCE_EVIDENCE" }); assert.ok(!p.calls.some(c => c.sql.includes("maintenance:audit")));
  }
  const p = scripted(); await assert.rejects(p.uow.transaction(({ evidence }) => evidence.complete(completion())), { code: "TRANSACTION_SCOPE" });
});
test("maintenance escaped query and even cached identity capabilities close at callback boundary", async () => {
  const p = scripted(); let escaped: MaintenancePgContext | undefined;
  await p.uow.transaction(async context => { escaped = context; await context.evidence.assertAllowed(actor, "PRODUCT", "CREATE"); }); const count = p.calls.length;
  await assert.rejects(escaped!.evidence.assertAllowed(actor, "PRODUCT", "CREATE"), { code: "TRANSACTION_CLOSED" });
  assert.throws(() => escaped!.client.query("SELECT 1"), { code: "TRANSACTION_CLOSED" }); assert.equal(p.calls.length, count);
});
test("maintenance read intents use current role/hall without gaining write completion or receipt actions", async () => {
  for (const action of ["DETAIL", "CANDIDATES", "LIST"]) {
    const p = scripted({ role: "WAREHOUSE" }); await p.uow.transaction(async ({ evidence }) => {
      await evidence.assertAllowed(actor, "PRODUCT", action);
      await assert.rejects(evidence.complete({ ...completion(), action }), { code: "TRANSACTION_SCOPE" });
    }); assert.ok(!p.calls.some(c => c.sql.includes("INSERT"))); assert.equal(maintenanceActions.PRODUCT.includes(action), false);
    const denied = scripted({ role: "WAREHOUSE" }); await assert.rejects(denied.uow.transaction(({ evidence }) => evidence.assertAllowed(actor, "STAFF", action)), { code: "FORBIDDEN" });
    const admin = scripted(); await admin.uow.transaction(({ evidence }) => evidence.assertAllowed(actor, "ACCOUNT", action));
  }
});
test("credential request tags use an explicit stable isolated HMAC key and preserve exact password text", () => {
  const originalKey = new Uint8Array(32).fill(7), retained = new Uint8Array(originalKey);
  const tag = createNodeCredentialRequestTag(originalKey); originalKey.fill(0);
  assert.match(tag("SYNTHETIC-Password"), /^[a-f0-9]{64}$/);
  assert.equal(tag("SYNTHETIC-Password"), createNodeCredentialRequestTag(retained)("SYNTHETIC-Password"));
  assert.notEqual(tag("SYNTHETIC-Password"), createNodeCredentialRequestTag(new Uint8Array(32).fill(8))("SYNTHETIC-Password"));
  assert.notEqual(tag("SYNTHETIC-Password"), tag("SYNTHETIC-Password "));
  assert.throws(() => createNodeCredentialRequestTag(new Uint8Array(31)), /32-byte/);
  assert.throws(() => tag("")); assert.throws(() => tag("界".repeat(342)));
});
test("administrator safety lock precedes original key and current identity locks for both account and staff", async () => {
  for (const family of ["ACCOUNT", "STAFF"] as const) {
    const p = scripted(); await p.uow.transaction(async ({ evidence }) => {
      await evidence.getReceipt(account, "original-key", family); await evidence.assertAllowed(actor, family, "EDIT");
    });
    const admin = p.calls.findIndex(c => c.sql.includes("maintenance:administrator-lock")), identity = p.calls.findIndex(c => c.sql.includes("maintenance:identity"));
    assert.ok(admin > 0 && admin < identity); assert.equal(p.calls.filter(c => c.sql.includes("maintenance:administrator-lock")).length, 1);
    assert.deepEqual(p.calls[admin]!.values, ["naijue:maintenance:available-admin:v1"]);
    assert.ok(admin < p.calls.findIndex(c => c.values[0] === `naijue:receipt:${JSON.stringify([account, "original-key"])}`));
  }
  const p = scripted(); await assert.rejects(p.uow.transaction(async ({ evidence }) => {
    await evidence.assertAllowed(actor, "PRODUCT", "DETAIL"); await evidence.assertAllowed(actor, "ACCOUNT", "EDIT");
  }), { code: "TRANSACTION_SCOPE" });
  assert.equal(p.calls.filter(c => c.sql.includes("maintenance:administrator-lock")).length, 0);
});
test("prepared audit precedes actual root/children while complete writes one unchanged receipt only", async () => {
  const p = scripted(); await p.uow.transaction(async ({ client, evidence }) => {
    await evidence.getReceipt(account, "original-key", "PRODUCT"); await evidence.assertAllowed(actor, "PRODUCT", "CREATE");
    const prepared = completion(); await evidence.prepare!(prepared);
    await client.query("/* synthetic:prepared-root-child-write */ UPDATE SYNTHETIC_ONLY");
    assert.deepEqual(await evidence.complete(structuredClone(prepared)), p.expected);
  });
  const index = (s: string) => p.calls.findIndex(c => c.sql.includes(s));
  assert.ok(index("maintenance:audit") < index("synthetic:prepared-root-child-write"));
  assert.ok(index("synthetic:prepared-root-child-write") < index("maintenance:complete"));
  assert.equal(p.calls.filter(c => c.sql.includes("maintenance:audit")).length, 1);
  assert.equal(p.calls.filter(c => c.sql.includes("maintenance:complete")).length, 1);
});
test("prepared completion rejects changed actual evidence and repeated preparation before receipt", async () => {
  for (const change of ["evidence", "operation", "time", "repeat"] as const) {
    const p = scripted(); await assert.rejects(p.uow.transaction(async ({ evidence }) => {
      await evidence.getReceipt(account, "original-key", "PRODUCT"); await evidence.assertAllowed(actor, "PRODUCT", "CREATE");
      const prepared = completion(); await evidence.prepare!(prepared);
      if (change === "repeat") return evidence.prepare!(prepared);
      return evidence.complete(change === "evidence" ? { ...prepared, afterValues: { ...prepared.afterValues, name: "CHANGED" } }
        : change === "time" ? { ...prepared, completedAt: "2026-10-22T00:00:01Z" }
        : { ...prepared, operationId: "00000000-0000-4000-8000-000000000099" });
    }));
    assert.ok(!p.calls.some(c => c.sql.includes("maintenance:complete"))); assert.equal(p.calls.at(-1)!.sql, "ROLLBACK");
  }
});
test("prepared failure/zero audit insert rolls back; unknown prepared COMMIT discards without rollback", async () => {
  const zero = scripted({ zeroAudit: true }); await assert.rejects(zero.uow.transaction(async ({ evidence }) => {
    await evidence.getReceipt(account, "original-key", "PRODUCT"); await evidence.assertAllowed(actor, "PRODUCT", "CREATE"); await evidence.prepare!(completion());
  }), { code: "INVALID_DATABASE_VALUE" }); assert.ok(!zero.calls.some(c => c.sql.includes("maintenance:complete")));
  for (const failAt of ["synthetic:prepared-leaf-failure", "COMMIT"]) {
    const p = scripted({ failAt }); await assert.rejects(p.uow.transaction(async ({ client, evidence }) => {
      await evidence.getReceipt(account, "original-key", "PRODUCT"); await evidence.assertAllowed(actor, "PRODUCT", "CREATE"); await evidence.prepare!(completion());
      await client.query("/* synthetic:prepared-leaf-failure */ UPDATE SYNTHETIC_ONLY"); return evidence.complete(completion());
    }), error => error === p.failure);
    assert.equal(p.calls.filter(c => c.sql === "ROLLBACK").length, failAt === "COMMIT" ? 0 : 1);
    assert.deepEqual(p.released, [failAt === "COMMIT" ? p.failure : undefined]);
  }
});
test("prepared audit capability closes after callback even when retained by a leaf", async () => {
  const p = scripted(); let escaped: MaintenancePgContext | undefined;
  await p.uow.transaction(async ctx => { escaped = ctx; await ctx.evidence.getReceipt(account, "original-key", "PRODUCT"); await ctx.evidence.assertAllowed(actor, "PRODUCT", "CREATE"); });
  const count = p.calls.length; await assert.rejects(escaped!.evidence.prepare!(completion()), { code: "TRANSACTION_CLOSED" }); assert.equal(p.calls.length, count);
});

test("hall maintenance acquires the shared administrator mutex before key identity and hall locks", async () => {
  const p = scripted(); await p.uow.transaction(async ({ evidence }) => {
    await evidence.getReceipt(account, "hall-original-key", "HALL"); await evidence.assertAllowed(actor, "HALL", "DISABLE");
  });
  const admin = p.calls.findIndex(c => c.sql.includes("maintenance:administrator-lock"));
  assert.ok(admin > 0 && admin < p.calls.findIndex(c => c.sql.includes("maintenance:identity")));
  assert.ok(admin < p.calls.findIndex(c => c.values[0] === `naijue:receipt:${JSON.stringify([account, "hall-original-key"])}`));
  assert.deepEqual(p.calls[admin]!.values, ["naijue:maintenance:available-admin:v1"]);
  assert.equal(p.calls.filter(c => c.sql.includes("maintenance:administrator-lock")).length, 1);
});
