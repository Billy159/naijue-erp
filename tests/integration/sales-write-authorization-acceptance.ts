/** DORMANT genuine-PG sales ACTION authorization preparation, appended after the existing 22-test evidence.
 * GET-receipt inject uses EXPLICIT TEST-ONLY AUTHENTICATION, not a session/write-host/browser acceptance.
 * No new account/password/session, listener, pool, operator, migration or production provider is created here. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type { TestContext } from "node:test";
import type { Pool, PoolClient } from "pg";
import Fastify from "fastify";
import { createSalesHttpPlugin } from "../../apps/api/src/sales-http.ts";
import { PostgresSalesUnitOfWork } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import type { PgSalesPool } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import { createSalesActionAuthorization } from "../../packages/application/src/sales-authorization.ts";
import { createSalesService } from "../../packages/application/src/sales-service.ts";
import type { ActorContext, SalesCommand, SalesDependencies } from "../../packages/application/src/ports.ts";
import { version } from "../../packages/domain/src/values.ts";
import { afterStatement } from "./adapter-helpers.ts";
import { ids, newSyntheticId, salesDraft, syntheticId, SYNTHETIC_SALES_RULES, SYNTHETIC_TIME } from "./fixtures.ts";
import { SALES_WRITE_AUTHORIZATION_SCENARIOS } from "./migration-manifest.ts";

// Existing native-profile fixture accounts only; no credential field is selected or new account seeded.
const salesperson: ActorContext = { accountId: syntheticId("account", 6000), hallId: ids.hall };
const foreign: ActorContext = { accountId: syntheticId("account", 6002), hallId: ids.otherHall };
const admin: ActorContext = { accountId: syntheticId("account", 6004), hallId: null };
const warehouse: ActorContext = { accountId: syntheticId("account", 6006), hallId: null };
const salespersonStaff = syntheticId("staff", 6001), adminStaff = syntheticId("staff", 6005);
const allowedDocuments = new Set([7000, 7001, 7002, 7003, 7004, 7005, 7100, 7101, 7102, 7200, 7201, 7300].map(number => syntheticId("sales", number)));
const ok = (condition: boolean, message: string): void => { assert.equal(condition, true, message); };
function safeCode(error: unknown): string | undefined {
  const code = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
  return typeof code === "string" && (["FORBIDDEN", "INVALID_STATE", "VERSION_CONFLICT", "SETTLEMENT_MISMATCH"].includes(code)
    || /^[0-9A-Z]{5}$/u.test(code)) ? code : undefined;
}
type Outcome<T> = { readonly status: "fulfilled"; readonly value: T } | { readonly status: "rejected"; readonly code: string | undefined };
const outcome = <T>(promise: Promise<T>): Promise<Outcome<T>> => promise.then(value => ({ status: "fulfilled", value }), error => ({ status: "rejected", code: safeCode(error) }));
function fulfilled<T>(result: Outcome<T>, message: string): T {
  ok(result.status === "fulfilled", message);
  if (result.status !== "fulfilled") throw new Error("Expected successful synthetic command; provider detail omitted");
  return result.value;
}
function json(response: { readonly body: string }): ReturnType<typeof JSON.parse> {
  try { return JSON.parse(response.body); } catch { throw new Error("Test-only receipt response was not JSON; response detail omitted"); }
}
async function bounded<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}
function gate() {
  let enter!: (pid: number) => void; let release!: () => void;
  const entered = new Promise<number>(resolve => { enter = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  return { entered, held, enter, release };
}
async function pid(client: PoolClient): Promise<number> {
  const value = (await client.query("SELECT pg_backend_pid()::integer AS pid")).rows[0]?.pid;
  ok(Number.isInteger(value) && value > 0, "one exact real backend PID is required"); return value as number;
}
/** Only known backend identities and lock metadata, never query text, credentials or global lock counts.
 * A finite observation loop is evidence gathering, not a delay-based guess or command/query retry. */
async function blockedBy(pool: Pool, waiter: number, blocker: number): Promise<void> {
  const deadline = performance.now() + 2500;
  while (performance.now() < deadline) {
    const row = (await pool.query(`SELECT wait_event_type, $2::integer = ANY(pg_blocking_pids(pid)) AS expected_blocker
      FROM pg_catalog.pg_stat_activity WHERE pid=$1::integer AND datname=current_database()`, [waiter, blocker])).rows[0];
    if (row?.wait_event_type === "Lock" && row.expected_blocker === true) return;
    await delay(20);
  }
  throw new Error("Specified real backend did not demonstrably wait for the specified blocker before the deadline");
}
/** Controlled identity maintenance only. Raw failing-row diagnostics could contain an existing hash: omit them. */
async function maintenance(target: Pool | PoolClient, sql: string, values: unknown[] = []): Promise<void> {
  try { await target.query(sql, values); }
  catch { throw new Error("Controlled synthetic identity maintenance failed; database detail omitted"); }
}
/** Real driver forwards every statement. The BEGIN checkpoint only records the SAME transaction's PID. */
const tracked = (pool: Pool, checkpoint: ReturnType<typeof gate>): PgSalesPool => afterStatement(pool, /^BEGIN ISOLATION LEVEL READ COMMITTED$/u,
  async client => { checkpoint.enter(await pid(client)); });
const draft = (number: number, hallId = ids.hall) => {
  const original = salesDraft(number, { quantities: ["1"] });
  return { ...original, header: { ...original.header, number: `SYNTHETIC_ACTION_PG_${number}`, hallId,
    warehouseId: hallId === ids.hall ? ids.warehouse : ids.toWarehouse,
    // A selected business salesperson is deliberately not a creator grant.
    salespersonId: hallId === ids.hall ? salespersonStaff : syntheticId("staff", 6003) } };
};
const save = (number: number, actor: ActorContext = salesperson, hallId = ids.hall): SalesCommand => ({ actor, action: "SAVE",
  expectedVersion: null, requestKey: `SYNTHETIC_ACTION_${number}_SAVE`, draft: draft(number, hallId) });
function dependencies(pool: PgSalesPool): SalesDependencies {
  const native = createSalesActionAuthorization();
  return { unitOfWork: new PostgresSalesUnitOfWork(pool), rules: SYNTHETIC_SALES_RULES, newId: newSyntheticId, now: () => SYNTHETIC_TIME,
    // Native ACTION authorization plus a bounded synthetic reference fixture, NOT complete production write authorization.
    authorization: { async assertAllowed(actor, action, document, tx) {
      await native.assertAllowed(actor, action, document, tx);
      const h = document.header;
      ok(allowedDocuments.has(h.id) && [salesperson.accountId, foreign.accountId, admin.accountId, warehouse.accountId].includes(actor.accountId)
        && [ids.hall, ids.otherHall].includes(h.hallId) && h.warehouseId === (h.hallId === ids.hall ? ids.warehouse : ids.toWarehouse)
        && h.customerId === ids.customer && document.lines.every(line => line.skuId === ids.sku)
        && document.settlements.every(row => row.paymentAccountId === ids.payment), "exact synthetic reference/economics scope, separate from native action grant");
    } } };
}
/** Exact finite fixture business rows. Identity/account/staff/hall maintenance is intentionally outside this snapshot. */
async function business(pool: Pool): Promise<string[]> {
  const result: string[] = [];
  for (const table of ["sales_header", "sales_line", "sales_settlement", "operation_receipt", "audit_change", "inventory_ledger", "inventory_balance"] as const) {
    const digest = (await pool.query(`SELECT md5(coalesce(jsonb_agg(to_jsonb(facts) ORDER BY to_jsonb(facts)::text)::text,'[]')) AS digest FROM naijue_erp.${table} facts`)).rows[0]?.digest;
    if (typeof digest !== "string") throw new Error("Synthetic business-state comparison unavailable"); result.push(digest);
  }
  return result;
}
async function sameBusiness(pool: Pool, before: readonly string[]): Promise<void> {
  const after = await business(pool);
  ok(after.length === before.length && after.every((value, index) => value === before[index]), "no unauthorized header/line/settlement/receipt/audit/ledger/balance facts");
}
async function denied(pool: Pool, work: () => Promise<unknown>, code = "FORBIDDEN"): Promise<void> {
  const before = await business(pool), result = await outcome(work());
  assert.equal(result.status, "rejected"); assert.equal(result.status === "rejected" ? result.code : undefined, code);
  await sameBusiness(pool, before);
}
async function restore(pool: Pool): Promise<void> {
  await maintenance(pool, "UPDATE naijue_erp.user_account SET login_enabled=true WHERE id=ANY($1::uuid[])", [[salesperson.accountId, admin.accountId]]);
  await maintenance(pool, "UPDATE naijue_erp.staff SET role='SALESPERSON',employment_status='在职',hall_id=$2 WHERE id=$1", [salespersonStaff, ids.hall]);
  await maintenance(pool, "UPDATE naijue_erp.staff SET role='ADMIN',employment_status='在职',hall_id=NULL WHERE id=$1", [adminStaff]);
  await maintenance(pool, "UPDATE naijue_erp.hall SET enabled=true WHERE id=$1", [ids.hall]);
}
/** Always release the checkpoint, drain finite server-bounded operations, roll back unfinished maintenance, and release its client.
 * No automatic retry of a command, mutation, failed query or uncertain COMMIT. */
async function cleanup(pool: Pool, checkpoint: ReturnType<typeof gate>, client: PoolClient | undefined,
  began: boolean, committed: boolean, pending: readonly Promise<unknown>[]): Promise<void> {
  checkpoint.release();
  const drained = await Promise.allSettled(pending.map(promise => bounded(promise, 20000, "Synthetic command/maintenance drain deadline exceeded")));
  let failed = drained.some(result => result.status === "rejected");
  try {
    if (client && began && !committed) try { await maintenance(client, "ROLLBACK"); } catch { failed = true; }
  } finally {
    try { client?.release(failed || (began && !committed)); }
    finally { try { await restore(pool); } catch { failed = true; } }
  }
  if (failed) throw new Error("Synthetic concurrency cleanup was not confirmed; provider detail omitted");
}

export async function runSalesWriteAuthorizationAcceptance(t: TestContext, pool: Pool): Promise<void> {
  const service = createSalesService(dependencies(pool));
  const facts = (await pool.query(`SELECT a.id,a.login_enabled,s.role,s.employment_status,s.hall_id FROM naijue_erp.user_account a
    JOIN naijue_erp.staff s ON s.id=a.staff_id WHERE a.id=ANY($1::uuid[]) ORDER BY a.id`,
  [[salesperson.accountId, foreign.accountId, admin.accountId, warehouse.accountId]])).rows;
  ok(facts.length === 4 && facts.every(row => row.login_enabled === true && row.employment_status === "在职"
    && row.role === (row.id === admin.accountId ? "ADMIN" : row.id === warehouse.accountId ? "WAREHOUSE" : "SALESPERSON")
    && row.hall_id === (row.id === salesperson.accountId ? ids.hall : row.id === foreign.accountId ? ids.otherHall : null)),
  "existing canonical action fixtures are current; no new accounts or secrets");

  await t.test(SALES_WRITE_AUTHORIZATION_SCENARIOS[0], async subtest => {
    const ownSave = save(7000), original = await service.execute(ownSave);
    await service.execute(save(7001, admin));
    await service.execute({ actor: salesperson, action: "SAVE", expectedVersion: version(1), requestKey: "SYNTHETIC_ACTION_OTHER_A_EDIT", draft: draft(7001) });
    await denied(pool, () => service.execute({ actor: salesperson, action: "APPROVE", expectedVersion: version(2), requestKey: "SYNTHETIC_ACTION_OTHER_A_APPROVE_DENIED", salesId: syntheticId("sales", 7001) }));
    await service.execute({ actor: salesperson, action: "VOID", expectedVersion: version(2), requestKey: "SYNTHETIC_ACTION_OTHER_A_VOID", salesId: syntheticId("sales", 7001) });
    const creator = (await pool.query("SELECT created_by_account_id FROM naijue_erp.sales_header WHERE id=$1", [syntheticId("sales", 7001)])).rows[0]?.created_by_account_id;
    ok(creator === admin.accountId, "selected salesperson and later same-hall editor never replace true creator");
    await service.execute({ actor: salesperson, action: "APPROVE", expectedVersion: version(1), requestKey: "SYNTHETIC_ACTION_OWN_APPROVE", salesId: syntheticId("sales", 7000) });
    await denied(pool, () => service.execute({ actor: salesperson, action: "UNAPPROVE", expectedVersion: version(2), requestKey: "SYNTHETIC_ACTION_OWN_UNAPPROVE_DENIED", salesId: syntheticId("sales", 7000) }));
    await denied(pool, () => service.execute({ actor: salesperson, action: "VOID", expectedVersion: version(2), requestKey: "SYNTHETIC_ACTION_APPROVED_VOID_DENIED", salesId: syntheticId("sales", 7000) }), "INVALID_STATE");
    await denied(pool, () => service.execute({ ...save(7000), expectedVersion: version(2), requestKey: "SYNTHETIC_ACTION_APPROVED_EDIT_DENIED" }), "INVALID_STATE");
    await denied(pool, () => service.execute(save(7005, salesperson, ids.otherHall)));
    await service.execute(save(7002, foreign, ids.otherHall));
    for (const action of ["APPROVE", "VOID"] as const) await denied(pool, () => service.execute({ actor: salesperson, action, expectedVersion: version(1),
      requestKey: `SYNTHETIC_ACTION_FOREIGN_${action}_DENIED`, salesId: syntheticId("sales", 7002) }));
    await service.execute({ actor: admin, action: "APPROVE", expectedVersion: version(1), requestKey: "SYNTHETIC_ACTION_ADMIN_FOREIGN_APPROVE", salesId: syntheticId("sales", 7002) });
    await service.execute({ actor: warehouse, action: "UNAPPROVE", expectedVersion: version(2), requestKey: "SYNTHETIC_ACTION_WAREHOUSE_FOREIGN_UNAPPROVE", salesId: syntheticId("sales", 7002) });
    const warehouseVoided = await service.execute({ actor: warehouse, action: "VOID", expectedVersion: version(3), requestKey: "SYNTHETIC_ACTION_WAREHOUSE_FOREIGN_VOID", salesId: syntheticId("sales", 7002) });
    ok(warehouseVoided.status === "VOID" && warehouseVoided.version === 4, "WAREHOUSE cross-hall unapprove/void chain reaches its actual terminal state");
    await service.execute(save(7003, admin, ids.otherHall)); await service.execute(save(7004, warehouse, ids.otherHall));
    await service.execute({ actor: warehouse, action: "APPROVE", expectedVersion: version(1), requestKey: "SYNTHETIC_ACTION_WAREHOUSE_FOREIGN_APPROVE", salesId: syntheticId("sales", 7003) });
    await service.execute({ actor: admin, action: "UNAPPROVE", expectedVersion: version(2), requestKey: "SYNTHETIC_ACTION_ADMIN_FOREIGN_UNAPPROVE", salesId: syntheticId("sales", 7003) });
    const adminVoided = await service.execute({ actor: admin, action: "VOID", expectedVersion: version(3), requestKey: "SYNTHETIC_ACTION_ADMIN_FOREIGN_VOID", salesId: syntheticId("sales", 7003) });
    ok(adminVoided.status === "VOID" && adminVoided.version === 4, "ADMIN cross-hall unapprove/void chain reaches its actual terminal state");
    await denied(pool, () => service.execute({ actor: admin, action: "APPROVE", expectedVersion: version(1), requestKey: "SYNTHETIC_ACTION_STALE_CAS", salesId: syntheticId("sales", 7000) }), "VERSION_CONFLICT");
    const beforeReplay = await business(pool), replay = await service.execute(ownSave);
    ok(replay.operationId === original.operationId && replay.version === 1 && replay.status === "DRAFT", "original SAVE replay survives later APPROVED state without re-execution");
    await sameBusiness(pool, beforeReplay);
    const app = Fastify({ logger: false, trustProxy: false });
    // EXPLICIT TEST-ONLY AUTHENTICATION SEAM: exercises actual GET-receipt PG authorization, not session security.
    app.register(createSalesHttpPlugin({ authenticate: async () => salesperson, dependencies: dependencies(pool) }));
    subtest.after(() => app.close()); await app.ready();
    const receipt = await app.inject({ method: "GET", url: "/sales/receipts/SYNTHETIC_ACTION_7000_SAVE" });
    assert.equal(receipt.statusCode, 200);
    ok(json(receipt).result.operationId === original.operationId && json(receipt).result.version === 1, "test-only-auth GET receipt restores original SAVE after approval");
    await sameBusiness(pool, beforeReplay);
    try {
      await maintenance(pool, "UPDATE naijue_erp.user_account SET login_enabled=false WHERE id=$1", [salesperson.accountId]);
      await denied(pool, () => service.execute(ownSave));
      const rejected = await app.inject({ method: "GET", url: "/sales/receipts/SYNTHETIC_ACTION_7000_SAVE" });
      assert.equal(rejected.statusCode, 403); ok(json(rejected).error.code === "FORBIDDEN", "test-only-auth GET receipt rechecks current native identity");
      await sameBusiness(pool, beforeReplay);
    } finally { await restore(pool); }
    assert.equal(app.server.listening, false); await app.close();
  });

  await t.test(SALES_WRITE_AUTHORIZATION_SCENARIOS[1], async () => {
    const changes = [
      { sql: "UPDATE naijue_erp.user_account SET login_enabled=false WHERE id=$1", values: [salesperson.accountId] },
      { sql: "UPDATE naijue_erp.staff SET role='WAREHOUSE' WHERE id=$1", values: [salespersonStaff] },
      { sql: "UPDATE naijue_erp.hall SET enabled=false WHERE id=$1", values: [ids.hall] }
    ];
    for (const [index, change] of changes.entries()) {
      const checkpoint = gate(); let client: PoolClient | undefined, began = false, committed = false;
      const pending: Promise<unknown>[] = [];
      try {
        const held = afterStatement(pool, /\/\* sales-authorization:hall \*\//u, async worker => { checkpoint.enter(await pid(worker)); await checkpoint.held; });
        const command = outcome(createSalesService(dependencies(held)).execute(save(7100 + index))); pending.push(command);
        const commandPid = await bounded(checkpoint.entered, 3000, "Native identity lock checkpoint was not reached");
        client = await pool.connect(); const updaterPid = await pid(client); await maintenance(client, "BEGIN"); began = true;
        const update = outcome(maintenance(client, change.sql, change.values)); pending.push(update);
        await blockedBy(pool, updaterPid, commandPid); // Must observe a real row-lock wait while command locks remain held.
        checkpoint.release();
        const written = fulfilled(await bounded(command, 15000, "Authorized command completion deadline exceeded"), "authorized command completes before metadata mutation");
        ok(written.version === 1 && written.status === "DRAFT", "one intended SAVE committed under held native identity locks");
        fulfilled(await bounded(update, 15000, "Metadata update did not drain after command commit"), "metadata update unblocks only after command transaction ends");
        await maintenance(client, "COMMIT"); committed = true;
      } finally { await cleanup(pool, checkpoint, client, began, committed, pending); }
    }
  });

  await t.test(SALES_WRITE_AUTHORIZATION_SCENARIOS[2], async () => {
    for (const kind of ["disable", "role"] as const) {
      if (kind === "role") {
        await service.execute(save(7201));
        await maintenance(pool, "UPDATE naijue_erp.staff SET hall_id=$2 WHERE id=$1", [adminStaff, ids.hall]);
      }
      const checkpoint = gate(); let client: PoolClient | undefined, began = false, committed = false;
      const pending: Promise<unknown>[] = [];
      try {
        const before = await business(pool);
        client = await pool.connect(); const blockerPid = await pid(client); await maintenance(client, "BEGIN"); began = true;
        if (kind === "disable") await maintenance(client, "UPDATE naijue_erp.user_account SET login_enabled=false WHERE id=$1", [salesperson.accountId]);
        else await maintenance(client, "UPDATE naijue_erp.staff SET role='SALESPERSON' WHERE id=$1", [adminStaff]);
        const command: SalesCommand = kind === "disable" ? save(7200) : { actor: { accountId: admin.accountId, hallId: ids.hall }, action: "APPROVE",
          expectedVersion: version(1), requestKey: "SYNTHETIC_ACTION_WAIT_ROLE_APPROVE_DENIED", salesId: syntheticId("sales", 7201) };
        const waiting = outcome(createSalesService(dependencies(tracked(pool, checkpoint))).execute(command)); pending.push(waiting);
        const waiterPid = await bounded(checkpoint.entered, 3000, "Waiting command backend was not identified");
        await blockedBy(pool, waiterPid, blockerPid);
        await maintenance(client, "COMMIT"); committed = true;
        const result = await bounded(waiting, 15000, "Waiting identity command did not finish after metadata commit");
        assert.equal(result.status, "rejected"); assert.equal(result.status === "rejected" ? result.code : undefined, "FORBIDDEN");
        await sameBusiness(pool, before);
      } finally { await cleanup(pool, checkpoint, client, began, committed, pending); }
    }
  });

  await t.test(SALES_WRITE_AUTHORIZATION_SCENARIOS[3], async () => {
    const checkpoint = gate(); let client: PoolClient | undefined, began = false, committed = false;
    const pending: Promise<unknown>[] = [];
    try {
      const before = await business(pool);
      client = await pool.connect(); const blockerPid = await pid(client); await maintenance(client, "BEGIN"); began = true;
      await maintenance(client, "SELECT id FROM naijue_erp.staff WHERE id=$1 FOR UPDATE", [salespersonStaff]);
      const waiting = outcome(createSalesService(dependencies(tracked(pool, checkpoint))).execute(save(7300))); pending.push(waiting);
      const waiterPid = await bounded(checkpoint.entered, 3000, "Hall-freshness command backend was not identified");
      await blockedBy(pool, waiterPid, blockerPid);
      // Change the hall only AFTER the identity SELECT has actually begun waiting on staff.
      await maintenance(client, "UPDATE naijue_erp.hall SET enabled=false WHERE id=$1", [ids.hall]);
      await maintenance(client, "COMMIT"); committed = true;
      const result = await bounded(waiting, 15000, "Separate hall-check command did not finish after metadata commit");
      assert.equal(result.status, "rejected"); assert.equal(result.status === "rejected" ? result.code : undefined, "FORBIDDEN");
      await sameBusiness(pool, before);
    } finally { await cleanup(pool, checkpoint, client, began, committed, pending); }
  });
  t.diagnostic("Native sales ACTION authorization/lock assertions are actual engine evidence only after the exact guarded fresh-PG backend suite executes. Explicit fixture actors/references/economics; GET-receipt uses TEST-ONLY AUTHENTICATION with inject, not a session-authorized write host, browser/TLS or production acceptance. Known-PID row waits and separate READ COMMITTED hall statements are new evidence; earlier 22 groups retain their original boundaries. No new account, secret or production write-provider assembly.");
}
