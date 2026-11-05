import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import type { Pool, PoolClient } from "pg";
import { PostgresSalesUnitOfWork } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import type { PgSalesPool } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import { PostgresTransferUnitOfWork } from "../../adapters/postgres/src/transfer-unit-of-work.ts";
import { createSalesService } from "../../packages/application/src/sales-service.ts";
import { createTransferService } from "../../packages/application/src/transfer-service.ts";
import { createSourceConfirmedTransferAuthorization, createSourceConfirmedTransferReferences } from "../../packages/application/src/transfer-policy.ts";
import { actor, newSyntheticId, SYNTHETIC_SALES_AUTHORIZATION, SYNTHETIC_SALES_RULES, SYNTHETIC_TIME } from "./fixtures.ts";

export const salesService = (pool: PgSalesPool) => createSalesService({ unitOfWork: new PostgresSalesUnitOfWork(pool),
  authorization: SYNTHETIC_SALES_AUTHORIZATION, rules: SYNTHETIC_SALES_RULES, newId: newSyntheticId, now: () => SYNTHETIC_TIME });
export const transferService = (pool: PgSalesPool) => createTransferService({ unitOfWork: new PostgresTransferUnitOfWork(pool),
  authorization: createSourceConfirmedTransferAuthorization(), references: createSourceConfirmedTransferReferences(), newId: newSyntheticId, now: () => SYNTHETIC_TIME });

/** Every call reaches the real acquired pg client. There are no fake rows or simulated commits.
 * The callback runs once after a real matching statement, on the SAME connection/transaction. */
export function afterStatement(pool: Pool, match: RegExp, callback: (client: PoolClient) => Promise<void>, beforeStatement?: (sql: string) => void): PgSalesPool {
  let fired = false;
  return { async connect() {
    const client = await pool.connect();
    return { async query(sql, values = []) {
      beforeStatement?.(sql); // Observe attempts, including a COMMIT that the real server rejects.
      const result = await client.query(sql, values);
      if (!fired && match.test(sql)) { fired = true; await callback(client); }
      return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount };
    }, release(error) { client.release(error); } };
  } };
}

export async function balanceRows(pool: Pool): Promise<Record<string, unknown>[]> {
  return (await pool.query(`SELECT warehouse_id,sku_id,quantity::text,version,last_operation_id,
    to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
    FROM naijue_erp.inventory_balance ORDER BY warehouse_id,sku_id`)).rows;
}
export async function commandSnapshot(pool: Pool, kind: "SALES" | "TRANSFER", target: string): Promise<unknown> {
  // Relation names are a closed test-owned union; targets are always driver parameters.
  const table = kind === "SALES" ? "sales_header" : "transfer_header";
  const lineTable = kind === "SALES" ? "sales_line" : "transfer_line";
  const column = kind === "SALES" ? "sales_id" : "transfer_id";
  const header = (await pool.query(`SELECT * FROM naijue_erp.${table} WHERE id=$1`, [target])).rows;
  const lines = (await pool.query(`SELECT * FROM naijue_erp.${lineTable} WHERE ${column}=$1 ORDER BY id`, [target])).rows;
  const receipts = (await pool.query("SELECT * FROM naijue_erp.operation_receipt WHERE target_type=$1 AND target_id=$2 ORDER BY id", [kind, target])).rows;
  const audits = (await pool.query("SELECT * FROM naijue_erp.audit_change WHERE object_type=$1 AND object_id=$2 ORDER BY id", [kind, target])).rows;
  const ledger = (await pool.query(`SELECT l.* FROM naijue_erp.inventory_ledger l JOIN naijue_erp.${lineTable} ln
    ON ln.id=l.${kind === "SALES" ? "source_sales_line_id" : "source_transfer_line_id"} WHERE ln.${column}=$1 ORDER BY l.id`, [target])).rows;
  const settlements = kind === "SALES" ? (await pool.query("SELECT * FROM naijue_erp.sales_settlement WHERE sales_id=$1 ORDER BY id", [target])).rows : [];
  return { header, lines, settlements, receipts, audits, ledger, balances: await balanceRows(pool) };
}
export async function receiptCount(pool: Pool, target: string): Promise<number> {
  return Number((await pool.query("SELECT COUNT(*)::integer AS count FROM naijue_erp.operation_receipt WHERE target_id=$1", [target])).rows[0]?.count);
}
export async function ledgerRows(pool: Pool, operationId: string): Promise<Record<string, unknown>[]> {
  return (await pool.query("SELECT id,event_kind,warehouse_id,sku_id,quantity_delta::text,source_sales_line_id,source_transfer_line_id,endpoint,reverses_entry_id,source_document_version FROM naijue_erp.inventory_ledger WHERE operation_id=$1 ORDER BY endpoint,id", [operationId])).rows;
}

/** Force TWO real backend waits before releasing a transaction-level advisory lock.
 * Resolving equal results alone would not establish that two requests actually contended.
 * The finite observation window is a test assertion deadline, not a retry of an unknown COMMIT. */
export async function contend<T>(pool: Pool, lockIdentity: string, work: () => readonly Promise<T>[]): Promise<PromiseSettledResult<T>[]> {
  const blocker = await pool.connect(); let results: Promise<PromiseSettledResult<T>[]> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [lockIdentity]);
    const requests = work(); assert.equal(requests.length, 2);
    results = Promise.allSettled(requests); // Attach handlers before observing SQL waits.
    const deadline = Date.now() + 2500; let waiters = 0;
    do {
      waiters = Number((await pool.query(`SELECT COUNT(*)::integer AS count FROM pg_catalog.pg_locks
        WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())`)).rows[0]?.count);
      if (waiters >= 2) break;
      await pause(20);
    } while (Date.now() < deadline);
    assert.ok(waiters >= 2, "expected two actual PostgreSQL advisory-lock waiters before releasing the blocker");
  } finally {
    let discard: Error | undefined;
    try { await blocker.query("ROLLBACK"); }
    catch (error) { discard = error instanceof Error ? error : new Error("Integration blocker rollback failed"); throw error; }
    finally {
      // A failed blocker rollback must discard its connection, and cannot skip draining bounded command promises.
      try { blocker.release(discard); } finally { if (results) await results; }
    }
  }
  return results!;
}
export const receiptLock = (requestKey: string): string => `naijue:receipt:${JSON.stringify([actor.accountId, requestKey])}`;
export function successfulPair<T>(results: readonly PromiseSettledResult<T>[]): readonly [T, T] {
  assert.equal(results[0]?.status, "fulfilled"); assert.equal(results[1]?.status, "fulfilled");
  const first = results[0] as PromiseFulfilledResult<T>, second = results[1] as PromiseFulfilledResult<T>;
  assert.deepEqual(first.value, second.value); return [first.value, second.value];
}
export function oneVersionWinner<T>(results: readonly PromiseSettledResult<T>[]): T {
  const passed = results.filter((row): row is PromiseFulfilledResult<T> => row.status === "fulfilled");
  const rejected = results.filter((row): row is PromiseRejectedResult => row.status === "rejected");
  assert.equal(passed.length, 1); assert.equal(rejected.length, 1);
  assert.equal((rejected[0]?.reason as { code?: unknown }).code, "VERSION_CONFLICT");
  return passed[0]!.value;
}
