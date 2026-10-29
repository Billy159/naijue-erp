/** Scripted database boundary only: no actual PostgreSQL lock race or persistent writes. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresTransferUnitOfWork } from "../adapters/postgres/src/transfer-unit-of-work.ts";
import type { PgSalesClient, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { createTransferService } from "../packages/application/src/transfer-service.ts";
import { createSourceConfirmedTransferAuthorization, createSourceConfirmedTransferReferences } from "../packages/application/src/transfer-policy.ts";
import type { TransferActor, TransferCommand, TransferDocument, TransferResult, TransferTransaction } from "../packages/application/src/transfer-ports.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";
import { version } from "../packages/domain/src/values.ts";
import { draft, ids, sid } from "./support/synthetic-transfer.ts";

const now = "2026-10-23T09:00:00Z";
const actor: TransferActor = { accountId: ids.account, hallId: ids.hall, role: "ADMIN" };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function scenario(options: { action?: "SAVE" | "APPROVE" | "UNAPPROVE"; replay?: boolean;
  role?: TransferActor["role"]; hallId?: TransferActor["hallId"]; wait?: "key" | "document" } = {}) {
  const action = options.action ?? "SAVE", who: TransferActor = { ...actor, role: options.role ?? actor.role,
    hallId: options.hallId === undefined ? actor.hallId : options.hallId };
  const value = draft();
  const document: TransferDocument = { header: { ...value.header, responsibleStaffId: value.header.responsibleStaffId ?? null,
    status: action === "UNAPPROVE" ? options.replay ? "DRAFT" : "APPROVED" : action === "APPROVE" && options.replay ? "APPROVED" : "DRAFT",
    version: version(options.replay ? action === "UNAPPROVE" ? 3 : 2 : action === "UNAPPROVE" ? 2 : 1),
    createdByAccountId: actor.accountId, createdHallId: actor.hallId, createdRole: actor.role,
    createdAt: now, updatedAt: now, approvedByAccountId: null, approvedAt: null }, lines: value.lines };
  const current: { account_id: string; staff_id: string; login_enabled: boolean; role: string; employment_status: string; hall_id: TransferActor["hallId"] } = {
    account_id: who.accountId, staff_id: sid("staff", 9200), login_enabled: true,
    role: who.role, employment_status: "在职", hall_id: who.hallId };
  const command: TransferCommand = action === "SAVE"
    ? { actor: who, action, expectedVersion: version(1), requestKey: "SPEC02_SAVE", draft: value }
    : { actor: who, action, expectedVersion: version(action === "UNAPPROVE" ? 2 : 1), requestKey: "SPEC02_" + action, transferId: ids.transfer };
  const original: TransferResult = { operationId: sid("operation", 9400), transferId: ids.transfer,
    version: version(action === "UNAPPROVE" ? 3 : 2), status: action === "APPROVE" ? "APPROVED" : "DRAFT", ledgerEntryIds: [] };
  let identityPresent = true, hallEnabled = true, connections = 0;
  const blocked = deferred(), resume = deferred(), calls: string[] = [], writes: string[] = [];
  const releases: unknown[] = [];
  const client: PgSalesClient = { async query(sql, values = []): Promise<PgSalesResult> {
    calls.push(sql);
    let rows: Record<string, unknown>[] = [];
    if (sql.startsWith("SELECT pg_advisory_xact_lock")) {
      if (String(values[0]).startsWith(options.wait === "key" ? "naijue:receipt:" : "naijue:transfer:")) { blocked.resolve(); await resume.promise; }
    } else if (sql.includes("FROM naijue_erp.operation_receipt")) {
      rows = options.replay ? [{ id: original.operationId, actor_account_id: who.accountId, request_key: command.requestKey,
        request_hash: requestHash({ ...command, actor: { accountId: who.accountId } }), action, target_type: "TRANSFER",
        target_id: ids.transfer, status: "COMMITTED", result_data: original, completed_at: now }] : [];
    } else if (sql.includes("FROM naijue_erp.transfer_header WHERE")) {
      const h = document.header;
      rows = [{ id: h.id, number: h.number, business_date: h.businessDate, from_warehouse_id: h.fromWarehouseId,
        to_warehouse_id: h.toWarehouseId, status: h.status, version: h.version, note: h.note,
        created_by_account_id: h.createdByAccountId, created_hall_id: h.createdHallId, created_role: h.createdRole,
        created_at: h.createdAt, updated_at: h.updatedAt, approved_by_account_id: h.approvedByAccountId,
        approved_at: h.approvedAt, stock_basis: "RUNTIME_LEDGER" }];
    } else if (sql.includes("FROM naijue_erp.transfer_line WHERE")) {
      rows = document.lines.map(l => ({ id: l.id, transfer_id: l.transferId, line_no: l.lineNo, sku_id: l.skuId,
        quantity: l.quantity.toString(), is_current: l.isCurrent, product_code_snapshot: l.snapshot.productCode,
        product_name_snapshot: l.snapshot.productName, color_name_snapshot: l.snapshot.colorName,
        fit_name_snapshot: l.snapshot.fitName, size_name_snapshot: l.snapshot.sizeName, barcode_snapshot: l.snapshot.barcode }));
    } else if (sql.includes("FROM naijue_erp.user_account a JOIN naijue_erp.staff s")) {
      rows = identityPresent ? [{ ...current }] : [];
    } else if (sql.includes("FROM naijue_erp.hall WHERE")) {
      rows = [{ id: values[0], enabled: hallEnabled }];
    } else if (sql.includes("FROM naijue_erp.warehouse w JOIN naijue_erp.hall h")) {
      rows = [{ id: values[0], hall_id: ids.hall, enabled: true, hall_enabled: true, has_nonzero_inventory: false }];
    } else if (sql.includes("FROM naijue_erp.sku s JOIN naijue_erp.product p")) {
      rows = [{ id: values[0], enabled: true }];
    } else if (/^(UPDATE|INSERT INTO) naijue_erp\./.test(sql)) {
      writes.push(sql);
    } else if (!/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) {
      throw new Error("Unexpected scripted SQL: " + sql.slice(0, 100));
    }
    return { rows, rowCount: rows.length || (/^(UPDATE|INSERT INTO)/.test(sql) ? 1 : 0) };
  }, release(error) { releases.push(error); } };
  let sequence = 9300;
  const unitOfWork = new PostgresTransferUnitOfWork({ async connect() { connections++; return client; } });
  const service = createTransferService({ unitOfWork,
    authorization: createSourceConfirmedTransferAuthorization(), references: createSourceConfirmedTransferReferences(),
    now: () => now, newId: kind => sid(kind, sequence++) });
  return { service, unitOfWork, command, current, original, blocked, resume, calls, writes, releases,
    connections: () => connections, removeIdentity: () => { identityPresent = false; }, disableHall: () => { hallEnabled = false; } };
}

test("transfer current identity: an authenticated ADMIN cannot SAVE after login closes during the document-lock wait", async () => {
  const f = scenario(), result = f.service.execute(f.command);
  await f.blocked.promise;
  f.current.login_enabled = false;
  f.resume.resolve();
  await assert.rejects(result, { code: "FORBIDDEN" });
  assert.deepEqual(f.writes, []);
  assert.equal(f.calls.at(-1), "ROLLBACK");
  assert.equal(f.releases.length, 1);
});

for (const entry of [
  { action: "APPROVE", role: "ADMIN", wait: "key", replay: false, change: "role" },
  { action: "UNAPPROVE", role: "WAREHOUSE", wait: "document", replay: false, change: "departed" },
  { action: "SAVE", role: "ADMIN", wait: "key", replay: true, change: "login" },
  { action: "APPROVE", role: "WAREHOUSE", wait: "document", replay: true, change: "unknown-role" },
  { action: "UNAPPROVE", role: "ADMIN", wait: "key", replay: true, change: "hall" }
] as const) test(`transfer current identity: ${entry.action} ${entry.replay ? "original-key replay" : "command"} rejects ${entry.change} after ${entry.wait} wait`, async () => {
  const f = scenario(entry), result = f.service.execute(f.command);
  await f.blocked.promise;
  if (entry.change === "role") f.current.role = "SALESPERSON";
  if (entry.change === "departed") f.current.employment_status = "离职";
  if (entry.change === "login") f.current.login_enabled = false;
  if (entry.change === "unknown-role") f.current.role = "UNKNOWN";
  if (entry.change === "hall") f.current.hall_id = ids.otherHall;
  f.resume.resolve();
  await assert.rejects(result, { code: "FORBIDDEN" });
  assert.deepEqual(f.writes, []);
  assert.equal(f.calls.at(-1), "ROLLBACK");
  assert.equal(f.connections(), 1);
});

test("transfer current identity: missing current account/staff cannot fall back to the authenticated ADMIN", async () => {
  const f = scenario(), result = f.service.execute(f.command);
  await f.blocked.promise; f.removeIdentity(); f.resume.resolve();
  await assert.rejects(result, { code: "FORBIDDEN" });
  assert.deepEqual(f.writes, []);
});
test("transfer current identity: a disabled current hall rejects a salesperson before writes", async () => {
  const f = scenario({ role: "SALESPERSON" }), result = f.service.execute(f.command);
  await f.blocked.promise; f.disableHall(); f.resume.resolve();
  await assert.rejects(result, { code: "FORBIDDEN" });
  assert.deepEqual(f.writes, []);
});
test("transfer current identity: current ADMIN and WAREHOUSE with no assigned hall retain SAVE permission", async () => {
  for (const role of ["ADMIN", "WAREHOUSE"] as const) {
    const f = scenario({ role, hallId: null }), result = f.service.execute(f.command);
    await f.blocked.promise; f.resume.resolve();
    assert.equal((await result).status, "DRAFT");
    assert.equal(f.writes.filter(sql => sql.startsWith("INSERT INTO naijue_erp.operation_receipt")).length, 1);
    assert.equal(f.writes.filter(sql => sql.startsWith("INSERT INTO naijue_erp.audit_change")).length, 1);
    assert.equal(f.calls.at(-1), "COMMIT");
  }
});
test("transfer current identity: a freshly authenticated current role recovers an unchanged original-key result without duplicate writes", async () => {
  const f = scenario({ replay: true });
  f.current.role = "WAREHOUSE"; f.current.hall_id = ids.otherHall;
  const result = f.service.execute({ ...f.command, actor: { ...f.command.actor, role: "WAREHOUSE", hallId: ids.otherHall } });
  await f.blocked.promise; f.resume.resolve();
  assert.deepEqual(await result, f.original);
  assert.deepEqual(f.writes, []);
  assert.equal(f.calls.at(-1), "COMMIT");
});
test("transfer current identity: one bound client locks current account/staff then hall and a cached identity cannot escape its transaction", async () => {
  const f = scenario();
  let leaked: TransferTransaction | undefined;
  const result = f.unitOfWork.transaction(async tx => {
    leaked = tx;
    await assert.rejects(tx.getCurrentTransferIdentity!(actor.accountId), { code: "TRANSACTION_SCOPE" });
    await tx.getReceipt(actor.accountId, "scope");
    await tx.getTransfer(ids.transfer);
    const first = await tx.getCurrentTransferIdentity!(actor.accountId);
    assert.equal(first?.loginEnabled, true);
    assert.equal((await tx.getCurrentTransferIdentity!(actor.accountId))?.staffId, first?.staffId);
    await assert.rejects(tx.getCurrentTransferIdentity!(sid("account", 9999)), { code: "TRANSACTION_SCOPE" });
  });
  await f.blocked.promise; f.resume.resolve(); await result;
  const identity = f.calls.findIndex(sql => sql.includes("transfer-authorization:identity"));
  const hall = f.calls.findIndex(sql => sql.includes("transfer-authorization:hall"));
  assert.match(f.calls[identity]!, /FOR SHARE OF a, s/);
  assert.match(f.calls[hall]!, /FOR SHARE/);
  assert.ok(identity > f.calls.findIndex(sql => sql.includes("FROM naijue_erp.transfer_header WHERE")));
  assert.ok(hall > identity);
  assert.equal(f.calls.filter(sql => sql.includes("transfer-authorization:identity")).length, 1);
  const before = f.calls.length;
  await assert.rejects(leaked!.getCurrentTransferIdentity!(actor.accountId), { code: "TRANSACTION_CLOSED" });
  assert.equal(f.calls.length, before);
  assert.equal(f.connections(), 1); assert.equal(f.releases.length, 1);
});
