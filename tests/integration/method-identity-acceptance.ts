/** DORMANT CURRENT10 genuine-PG method-identity scenarios. Source preparation is NOT engine proof.
 * All mutations are bounded synthetic fixture metadata. No production provider, migration, real file or login is supplied here. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type { TestContext } from "node:test";
import type { Pool, PoolClient } from "pg";
import { PostgresSalesUnitOfWork } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import type { PgSalesPool } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import { PostgresSalesQueryReader } from "../../adapters/postgres/src/sales-query-reader.ts";
import { PostgresCurrentFormReader } from "../../adapters/postgres/src/current-form-reader.ts";
import { readCurrentRecentAccount } from "../../adapters/postgres/src/current-account-recommendations.ts";
import { createNativeTransactionSalesBusinessRules } from "../../packages/application/src/sales-native-facts.ts";
import { createSalesService } from "../../packages/application/src/sales-service.ts";
import type { LegacySalesCommand, SalesResult } from "../../packages/application/src/ports.ts";
import type { SalesDraft } from "../../packages/domain/src/documents.ts";
import type { EntityId } from "../../packages/domain/src/values.ts";
import { version } from "../../packages/domain/src/values.ts";
import { commandSnapshot, receiptCount } from "./adapter-helpers.ts";
import { actor, ids, newSyntheticId, salesDraft, syntheticId, SYNTHETIC_PASSWORD_SENTINEL, SYNTHETIC_TIME } from "./fixtures.ts";
import { METHOD_IDENTITY_SCENARIOS } from "./migration-manifest.ts";

const m1 = syntheticId("paymentMethod", 7800), m2 = syntheticId("paymentMethod", 7801);
const a = syntheticId("paymentAccount", 7802), b = syntheticId("paymentAccount", 7803), c = syntheticId("paymentAccount", 7804);
const readerAccount = syntheticId("account", 7805), readerStaff = syntheticId("staff", 7806);
const readerActor = { accountId: readerAccount, hallId: null };
const nameM1 = "SYNTHETIC IDENTITY METHOD ONE", nameM2 = "SYNTHETIC IDENTITY METHOD TWO";
const signal = () => new AbortController().signal;
const makeDraft = (number: number, accountId = a, methodId = m1): SalesDraft => {
  const draft = salesDraft(number);
  return { ...draft, settlements: draft.settlements.map(row => ({ ...row, paymentAccountId: accountId, paymentMethodId: methodId })) };
};
const save = (draft: SalesDraft, requestKey: string, expectedVersion: number | null = null): LegacySalesCommand => ({ actor, action: "SAVE", draft,
  requestKey, expectedVersion: expectedVersion === null ? null : version(expectedVersion) });
const approve = (salesId: EntityId<"sales">, requestKey: string, expectedVersion: number): LegacySalesCommand => ({ actor, action: "APPROVE", salesId, requestKey, expectedVersion: version(expectedVersion) });

/** Explicit fixture-only completeness provenance: all requested products must be the one synthetic nine-key fixture,
 * and the same original command transaction must re-read its exact persisted values. NOT a production/import verifier. */
function nativeService(pool: PgSalesPool) {
  return createSalesService({ unitOfWork: new PostgresSalesUnitOfWork(pool, { catalogueCompleteness: { async assertComplete(context) {
    assert.deepEqual(context.productIds, [ids.product]);
    const rows = (await context.query(`/* SYNTHETIC-ONLY:nine-key-fixture-completeness */ SELECT id, supplier_id,
      retail_price::text,purchase_price::text,wholesale5_price::text,wholesale6_price::text,wholesale7_price::text,
      wholesale8_price::text,wholesale9_price::text,wholesale10_price::text,minimum_price::text
      FROM naijue_erp.product WHERE id=$1::uuid`, [ids.product])).rows;
    assert.deepEqual(rows, [{ id: ids.product, supplier_id: ids.supplier, retail_price: "1.25", purchase_price: "0.75",
      wholesale5_price: "1.10", wholesale6_price: "1.05", wholesale7_price: null, wholesale8_price: null,
      wholesale9_price: null, wholesale10_price: null, minimum_price: null }]);
  } } }), rules: createNativeTransactionSalesBusinessRules(), now: () => SYNTHETIC_TIME, newId: newSyntheticId,
  // TEST-ONLY exact synthetic action scope. Native runtime reference/economics rules above, not this fixture grant, check method identity.
  authorization: { async assertAllowed(context, _action, document) {
    assert.deepEqual(context, actor); assert.equal(document.header.hallId, ids.hall);
    assert.equal(document.header.warehouseId, ids.warehouse); assert.equal(document.header.customerId, ids.customer);
    assert.ok(document.settlements.every(row => [a, b, c].includes(row.paymentAccountId)));
  } } });
}
async function detail(pool: Pool, salesId: EntityId<"sales">) {
  return new PostgresSalesQueryReader(pool).readDetail({ actor, scope: { kind: "restricted", clauses: [{ hallId: ids.hall, createdByAccountId: ids.account }] },
    parameters: { salesId }, signal: signal() });
}
async function recent(pool: Pool, method: EntityId<"paymentMethod">) {
  return readCurrentRecentAccount(async (sql, values = []) => { const result = await pool.query(sql, values); return { rows: result.rows, rowCount: result.rowCount }; }, ids.hall, method);
}
async function eligible(pool: Pool, method: EntityId<"paymentMethod">) {
  const reader = new PostgresCurrentFormReader(pool, { async authorize(context, intent) {
    assert.deepEqual(context.actor, readerActor); assert.equal(context.identity.role, "WAREHOUSE"); assert.equal(intent.kind, "sales-references");
    return { kind: "halls", hallIds: [ids.hall] };
  } });
  return reader.readSalesReferences(readerActor, { kind: "paymentAccount", hallId: ids.hall, paymentMethodId: method,
    search: "SYNTHETIC IDENTITY ACCOUNT", page: 1, pageSize: 20 }, signal());
}
async function unchangedRejection(pool: Pool, service: ReturnType<typeof nativeService>, command: LegacySalesCommand, code: string) {
  const salesId = command.action === "SAVE" ? command.draft.header.id : command.salesId;
  const before = await commandSnapshot(pool, "SALES", salesId);
  await assert.rejects(service.execute(command), { code });
  assert.deepEqual(await commandSnapshot(pool, "SALES", salesId), before, "rejection leaves exact header/lines/settlements/receipt/audit/ledger/balances unchanged");
}
function checkpoint() {
  let entered!: (pid: number) => void, release!: () => void;
  return { entered: new Promise<number>(resolve => { entered = resolve; }), released: new Promise<void>(resolve => { release = resolve; }),
    mark(pid: number) { entered(pid); }, release() { release(); } };
}
function tracked(pool: Pool, point: ReturnType<typeof checkpoint>, marker: "payment_account" | "payment_method", pauseAfter: boolean): PgSalesPool {
  let observed = false;
  return { async connect() {
    const client = await pool.connect();
    return { async query(sql, values = []) {
      const matches = !observed && sql.includes(`native-sales-facts:${marker} */`);
      if (matches && !pauseAfter) { observed = true; point.mark(Number((await client.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid)); }
      const result = await client.query(sql, values);
      if (matches && pauseAfter) {
        observed = true; point.mark(Number((await client.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid)); await point.released;
      }
      return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount };
    }, release(error) { client.release(error); } };
  } };
}
async function bounded<T>(promise: Promise<T>, millis: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), millis); })]); }
  finally { if (timer) clearTimeout(timer); }
}
async function blockedBy(pool: Pool, waiter: number, blocker: number) {
  assert.ok(Number.isInteger(waiter) && Number.isInteger(blocker) && waiter !== blocker);
  const deadline = performance.now() + 2500;
  do {
    const row = (await pool.query(`SELECT wait_event_type, $2::integer=ANY(pg_blocking_pids(pid)) AS expected_blocker
      FROM pg_catalog.pg_stat_activity WHERE pid=$1`, [waiter, blocker])).rows[0];
    if (row?.wait_event_type === "Lock" && row.expected_blocker === true) return;
    await delay(20);
  } while (performance.now() < deadline);
  assert.fail(`No actual PostgreSQL lock wait on expected synthetic PID pair ${waiter}/${blocker}`);
}
const outcome = async <T>(promise: Promise<T>) => {
  try { return { status: "fulfilled" as const, value: await promise }; }
  catch (error) { return { status: "rejected" as const, code: error && typeof error === "object" && "code" in error ? error.code : undefined }; }
};
const mutations = [
  { label: "account actual-method non-key update", marker: "payment_account" as const,
    sql: "UPDATE naijue_erp.payment_account SET payment_method_id=$2 WHERE id=$1", values: [b, m1], code: "SETTLEMENT_METHOD_MISMATCH" },
  { label: "account enabled non-key update", marker: "payment_account" as const,
    sql: "UPDATE naijue_erp.payment_account SET enabled=false WHERE id=$1", values: [b], code: "SALES_REFERENCE_UNAVAILABLE" },
  { label: "method enabled non-key update", marker: "payment_method" as const,
    sql: "UPDATE naijue_erp.payment_method SET enabled=false WHERE id=$1", values: [m2], code: "SALES_REFERENCE_UNAVAILABLE" }
];

export async function runMethodIdentityAcceptance(t: TestContext, pool: Pool): Promise<void> {
  const service = nativeService(pool);
  await t.test("CURRENT10 method fixture: two methods, three accounts and a non-login-sentinel current-reader identity", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO naijue_erp.payment_method(id,name,enabled,version) VALUES($1,$2,true,1),($3,$4,true,1)", [m1, nameM1, m2, nameM2]);
      await client.query(`INSERT INTO naijue_erp.payment_account(id,name,payment_method_id,enabled,version)
        VALUES($1,'SYNTHETIC IDENTITY ACCOUNT A',$2,true,1),($3,'SYNTHETIC IDENTITY ACCOUNT B',$4,true,1),($5,'SYNTHETIC IDENTITY ACCOUNT C',$2,true,1)`, [a, m1, b, m2, c]);
      // No account-hall hints: recent proof must stand on genuine runtime effects, not a fixture recommendation shortcut.
      await client.query("INSERT INTO naijue_erp.staff(id,name,hall_id,role,employment_status,version) VALUES($1,'SYNTHETIC CURRENT READER',NULL,'WAREHOUSE','在职',1)", [readerStaff]);
      await client.query(`INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
        VALUES($1,$2,'SYNTHETIC_IDENTITY_READER_NOT_A_LOGIN',$3,true,1,1,$4,$4)`, [readerAccount, readerStaff, SYNTHETIC_PASSWORD_SENTINEL, SYNTHETIC_TIME]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });

  await t.test(METHOD_IDENTITY_SCENARIOS[0], async () => {
    const draft = makeDraft(7800), command = save(draft, "SYNTHETIC_METHOD_CAPTURE_M1_A");
    const created = await service.execute(command); assert.equal(created.version, 1);
    assert.equal((await detail(pool, draft.header.id)).document.settlements[0]?.paymentMethodId, m1);
    await pool.query("UPDATE naijue_erp.payment_method SET name='SYNTHETIC IDENTITY RENAMED METHOD ONE' WHERE id=$1", [m1]);
    await pool.query("UPDATE naijue_erp.payment_account SET name='SYNTHETIC IDENTITY ACCOUNT A RENAMED' WHERE id=$1", [a]);
    await service.execute(save({ ...draft, header: { ...draft.header, note: "SYNTHETIC MEMO ONLY" } }, "SYNTHETIC_METHOD_RENAMED_MEMO", 1));
    await service.execute(approve(draft.header.id, "SYNTHETIC_METHOD_CAPTURE_APPROVE", 2));
    const stored = await detail(pool, draft.header.id);
    assert.equal(stored.document.settlements[0]?.paymentMethodId, m1);
    assert.equal(stored.settlementNames[0]?.methodNameSnapshot, nameM1);
    assert.equal(stored.settlementNames[0]?.accountNameSnapshot, "SYNTHETIC IDENTITY ACCOUNT A");
    assert.equal(stored.settlementNames[0]?.currentMethodName, "SYNTHETIC IDENTITY RENAMED METHOD ONE");
    assert.equal(await recent(pool, m1), a);
    const candidates = await eligible(pool, m1); assert.equal(candidates.recommendationAvailability, "AVAILABLE");
    assert.ok(candidates.items.some(row => row.id === a && row.paymentMethodId === m1));
    const before = await commandSnapshot(pool, "SALES", draft.header.id);
    assert.deepEqual(await service.execute(command), created, "original key replays immutable result even after later versions");
    assert.deepEqual(await commandSnapshot(pool, "SALES", draft.header.id), before);
  });

  await t.test(METHOD_IDENTITY_SCENARIOS[1], async () => {
    const draft = makeDraft(7801), command = save(draft, "SYNTHETIC_METHOD_BEFORE_REASSIGN");
    const created = await service.execute(command);
    assert.equal((await pool.query("SELECT payment_method_id FROM naijue_erp.payment_account WHERE id=$1", [a])).rows[0]?.payment_method_id, m1);
    const neverSaved = makeDraft(7809, a, m1); // selected M1/A intent is frozen before the actual account reassignment.
    await pool.query("UPDATE naijue_erp.payment_account SET payment_method_id=$2 WHERE id=$1", [a, m2]);
    await unchangedRejection(pool, service, save(neverSaved, "SYNTHETIC_METHOD_FIRST_UNSAVED_STALE_PAIR"), "SETTLEMENT_METHOD_MISMATCH");
    assert.equal(await receiptCount(pool, neverSaved.header.id), 0, "first stale-pair SAVE consumes no key or document identity");
    const stored = await detail(pool, draft.header.id); assert.equal(stored.document.settlements[0]?.paymentMethodId, m1);
    assert.equal(stored.settlementNames[0]?.currentMethodName, nameM2);
    await unchangedRejection(pool, service, save(draft, "SYNTHETIC_METHOD_OLD_INTENT_SAVE", 1), "SETTLEMENT_METHOD_MISMATCH");
    await unchangedRejection(pool, service, approve(draft.header.id, "SYNTHETIC_METHOD_OLD_INTENT_APPROVE", 1), "SETTLEMENT_METHOD_MISMATCH");
    const forged = { ...draft, settlements: draft.settlements.map(row => ({ ...row, paymentMethodId: m2 })) };
    await unchangedRejection(pool, service, save(forged, "SYNTHETIC_METHOD_FORGED_SAME_ROW", 1), "IMMUTABLE_SETTLEMENT_METHOD");
    assert.equal(await recent(pool, m1), null); assert.equal(await recent(pool, m2), null, "old M1 approved receipt cannot become an M2 recommendation");
    assert.ok((await eligible(pool, m2)).items.some(row => row.id === a), "current pair eligibility is distinct from historical recency");
    const before = await commandSnapshot(pool, "SALES", draft.header.id);
    assert.deepEqual(await service.execute(command), created); assert.deepEqual(await commandSnapshot(pool, "SALES", draft.header.id), before);
  });

  await t.test(METHOD_IDENTITY_SCENARIOS[2], async () => {
    const draft = makeDraft(7801);
    const replacement = { ...draft, settlements: draft.settlements.map(row => ({ ...row, id: syntheticId("settlement", 789001), paymentAccountId: b, paymentMethodId: m2 })) };
    await service.execute(save(replacement, "SYNTHETIC_METHOD_EXPLICIT_NEW_PAIR", 1));
    await service.execute(approve(draft.header.id, "SYNTHETIC_METHOD_NEW_PAIR_APPROVE", 2));
    const stored = await detail(pool, draft.header.id);
    assert.equal(stored.document.settlements.length, 1); assert.equal(stored.document.settlements[0]?.id, syntheticId("settlement", 789001));
    assert.equal(stored.document.settlements[0]?.paymentAccountId, b); assert.equal(stored.document.settlements[0]?.paymentMethodId, m2);
    assert.equal(stored.settlementNames[0]?.methodNameSnapshot, nameM2); assert.equal(await recent(pool, m2), b);
  });

  await t.test(METHOD_IDENTITY_SCENARIOS[3], async () => {
    const draft = makeDraft(7802, c, m1); await service.execute(save(draft, "SYNTHETIC_METHOD_UNKNOWN_SETUP"));
    await service.execute(approve(draft.header.id, "SYNTHETIC_METHOD_UNKNOWN_SETUP_APPROVE", 1));
    // Explicit negative-fixture emulation of stored pre-0010 unknown identity. NOT an upgrade/backfill test or normal write API.
    await pool.query("UPDATE naijue_erp.sales_settlement SET payment_method_id_snapshot=NULL WHERE sales_id=$1", [draft.header.id]);
    assert.equal((await detail(pool, draft.header.id)).document.settlements[0]?.paymentMethodId, null);
    assert.equal(await recent(pool, m1), null, "valid runtime effects plus name/current account do not infer an unknown original method");
    assert.ok((await eligible(pool, m1)).items.some(row => row.id === c), "unknown history does not remove a currently eligible account");
    await service.execute({ actor, action: "UNAPPROVE", salesId: draft.header.id, expectedVersion: version(2), requestKey: "SYNTHETIC_METHOD_UNKNOWN_UNAPPROVE" });
    assert.equal((await detail(pool, draft.header.id)).document.settlements[0]?.paymentMethodId, null, "status-only reversal preserves unknown");
    await unchangedRejection(pool, service, save(draft, "SYNTHETIC_METHOD_UNKNOWN_CANNOT_INFER", 3), "IMMUTABLE_SETTLEMENT_METHOD");
    await unchangedRejection(pool, service, approve(draft.header.id, "SYNTHETIC_METHOD_UNKNOWN_CANNOT_APPROVE", 3), "INVALID_SETTLEMENT");
  });

  await t.test(METHOD_IDENTITY_SCENARIOS[4], async () => {
    for (const [index, mutation] of mutations.entries()) {
      const point = checkpoint(); const command = save(makeDraft(7810 + index, b, m2), `SYNTHETIC_METHOD_SHARE_LOCK_${index}`);
      let maintenance: PoolClient | undefined, active = false;
      const pending = outcome(nativeService(tracked(pool, point, "payment_method", true)).execute(command));
      let update: ReturnType<typeof outcome> | undefined;
      try {
        const commandPid = await bounded(point.entered, 3000, "Native account+method row locks were not acquired");
        maintenance = await pool.connect(); await maintenance.query("BEGIN"); active = true;
        const updaterPid = Number((await maintenance.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid);
        update = outcome(maintenance.query(mutation.sql, mutation.values));
        await blockedBy(pool, updaterPid, commandPid);
        t.diagnostic(`ACTUAL FOR SHARE non-key block: ${mutation.label}; waiter=${updaterPid}; blocker=${commandPid}`);
        point.release();
        const result = await bounded(pending, 15000, "Native command did not finish after releasing the fixture checkpoint");
        assert.equal(result.status, "fulfilled");
        assert.equal((await bounded(update, 5000, "Metadata update did not unblock after native COMMIT")).status, "fulfilled");
        await maintenance.query("ROLLBACK"); active = false;
        const stored = await detail(pool, syntheticId("sales", 7810 + index));
        assert.equal(stored.document.settlements[0]?.paymentMethodId, m2, "native selected method is captured, never silently retargeted");
        assert.equal(await receiptCount(pool, stored.document.header.id), 1);
      } finally {
        point.release();
        try { if (maintenance && active) await maintenance.query("ROLLBACK"); }
        finally { maintenance?.release(); await pending; if (update) await update; }
      }
    }
  });

  await t.test(METHOD_IDENTITY_SCENARIOS[5], async () => {
    for (const [index, mutation] of mutations.entries()) {
      const point = checkpoint(), draft = makeDraft(7820 + index, b, m2);
      const command = save(draft, `SYNTHETIC_METHOD_WAIT_RECHECK_${index}`);
      const before = await commandSnapshot(pool, "SALES", draft.header.id);
      let maintenance: PoolClient | undefined, active = false;
      let pending: Promise<Awaited<ReturnType<typeof outcome<SalesResult>>>> | undefined;
      try {
        maintenance = await pool.connect(); await maintenance.query("BEGIN"); active = true;
        const updaterPid = Number((await maintenance.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid);
        await maintenance.query(mutation.sql, mutation.values);
        pending = outcome(nativeService(tracked(pool, point, mutation.marker, false)).execute(command));
        const commandPid = await bounded(point.entered, 3000, "Waiting native metadata query was not identified");
        await blockedBy(pool, commandPid, updaterPid);
        t.diagnostic(`ACTUAL native metadata wait/recheck: ${mutation.label}; waiter=${commandPid}; blocker=${updaterPid}`);
        await maintenance.query("COMMIT"); active = false;
        const rejected = await bounded(pending, 15000, "Native command did not finish after metadata COMMIT");
        assert.equal(rejected.status, "rejected"); assert.equal(rejected.status === "rejected" ? rejected.code : undefined, mutation.code);
        assert.deepEqual(await commandSnapshot(pool, "SALES", draft.header.id), before, "actual wait then reject leaves no business effect or consumed key");
      } finally {
        point.release();
        try { if (maintenance && active) await maintenance.query("ROLLBACK"); }
        finally { maintenance?.release(); if (pending) await pending; }
        // Restore only these owned synthetic metadata facts, after the command has a known completed outcome.
        await pool.query("UPDATE naijue_erp.payment_account SET payment_method_id=$2,enabled=true WHERE id=$1", [b, m2]);
        await pool.query("UPDATE naijue_erp.payment_method SET enabled=true WHERE id=$1", [m2]);
      }
      const retried = await service.execute(command);
      assert.deepEqual(await service.execute(command), retried, "original rejected key is reusable after known rollback; successful replay stays exact");
      assert.equal((await detail(pool, draft.header.id)).document.settlements[0]?.paymentMethodId, m2);
      assert.equal(await receiptCount(pool, draft.header.id), 1);
    }
  });
}
