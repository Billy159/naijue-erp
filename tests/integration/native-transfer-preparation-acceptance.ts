/** Explicit opt-in acceptance helper for an already approved disposable schema10
 * target seeded by seedSyntheticReferences. No pool construction or automatic run.
 * Real PostgreSQL writes, SYNTHETIC session resolver/actors, no production login claim. */
import assert from "node:assert/strict";
import Fastify from "fastify";
import type { Pool } from "pg";
import { PostgresTransferUnitOfWork } from "../../adapters/postgres/src/transfer-unit-of-work.ts";
import { PostgresSalesUnitOfWork } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import { PostgresTransferQueryReader } from "../../adapters/postgres/src/transfer-query-reader.ts";
import { loadNativeTransferSnapshots } from "../../adapters/postgres/src/native-transfer-snapshots.ts";
import { createSourceConfirmedTransferAuthorization, createSourceConfirmedTransferReferences } from "../../packages/application/src/transfer-policy.ts";
import { createAuthenticatedDocumentCommandsPlugin } from "../../apps/api/src/authenticated-document-commands.ts";
import { DomainError } from "../../packages/domain/src/errors.ts";
import { entityId } from "../../packages/domain/src/values.ts";
import { ids, syntheticId, newSyntheticId, transferActor, SYNTHETIC_TIME, SYNTHETIC_SALES_AUTHORIZATION, SYNTHETIC_SALES_RULES } from "./fixtures.ts";

export async function verifyNativeTransferPreparationOnApprovedSyntheticDatabase(pool: Pool): Promise<readonly string[]> {
  const identity = (await pool.query("SELECT current_database() AS db,current_user AS role")).rows[0];
  assert.match(identity.db, /^naijue_erp_test_[a-f0-9]{8,32}$/); assert.equal(identity.role, "naijue_erp_test");
  assert.deepEqual((await pool.query("SELECT version FROM naijue_erp.schema_migration ORDER BY version")).rows.map(row => row.version), [1,2,3,4,5,6,7,8,9,10]);
  const evidence: string[] = [];
  await pool.query("INSERT INTO naijue_erp.sku_barcode(id,barcode,sku_id,barcode_kind,scheme_id,enabled) VALUES($1,'000123-SYNTHETIC-NATIVE',$2,'MAIN',NULL,true)", [syntheticId("barcode", 99001), ids.sku]);
  for (const [name, sql, values] of [
    ["missing MAIN", "UPDATE naijue_erp.sku_barcode SET enabled=false WHERE sku_id=$1", [ids.sku]],
    ["disabled SKU", "UPDATE naijue_erp.sku SET enabled=false WHERE id=$1", [ids.sku]],
    ["cross-group size", "DELETE FROM naijue_erp.size_group_member WHERE size_group_id=$1 AND size_id=$2", [ids.group, ids.size]]
  ] as const) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN"); await client.query(sql, [...values]);
      await assert.rejects(loadNativeTransferSnapshots((query, parameters) => client.query(query, parameters), [ids.sku]),
        error => error instanceof DomainError && error.code === "NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE");
      evidence.push(name + " rejected by actual SQL");
    } finally { await client.query("ROLLBACK"); client.release(); }
  }
  const origin = "https://synthetic-native-transfer.invalid", token = "P".repeat(43); let allowed = true;
  const app = Fastify({ logger: false });
  const authorization = createSourceConfirmedTransferAuthorization();
  app.register(createAuthenticatedDocumentCommandsPlugin({ authentication: { trustedOrigin: origin, service: {
    async resolve(value) { return value === token ? { accountId: ids.account, staffId: ids.staff, loginName: "SYNTHETIC", role: "SALESPERSON", hallId: ids.hall, authVersion: 1 } : null; },
    async login() { throw new Error("Unused synthetic login"); }, async logout() {}, async changeOwnPassword() {}
  } }, nativeManualTransferPreparation: true,
  sales: { unitOfWork: new PostgresSalesUnitOfWork(pool), authorization: SYNTHETIC_SALES_AUTHORIZATION, rules: SYNTHETIC_SALES_RULES, newId: newSyntheticId, now: () => SYNTHETIC_TIME },
  transfers: { unitOfWork: new PostgresTransferUnitOfWork(pool), authorization: { async assertAllowed(...args) {
    if (!allowed) throw new DomainError("FORBIDDEN", "Synthetic revoked scope"); await authorization.assertAllowed(...args);
  } }, references: createSourceConfirmedTransferReferences(), newId: newSyntheticId, now: () => SYNTHETIC_TIME } }));
  try {
    await app.ready();
    const headers = { cookie: `__Host-naijue_session=${token}`, origin, "content-type": "application/json" };
    const proposal = { businessDate: "2026-10-21", note: "SYNTHETIC native preparation", fromWarehouseId: ids.warehouse, toWarehouseId: ids.toWarehouse,
      lines: [{ skuId: ids.sku, quantity: "2" }] };
    const prepare = () => app.inject({ method: "POST", url: "/transfers/prepare-create", headers, payload: proposal });
    const response = await prepare(); assert.equal(response.statusCode, 200); const draft = response.json();
    assert.equal(draft.lines[0].snapshot.barcode, "000123-SYNTHETIC-NATIVE");
    assert.equal((await pool.query("SELECT count(*)::text AS n FROM naijue_erp.transfer_header WHERE id=$1", [draft.header.id])).rows[0].n, "0");
    const post = (requestKey: string, expectedVersion: number | null = null) => app.inject({ method: "POST", url: "/transfers/commands", headers,
      payload: { action: "SAVE", draft, requestKey, expectedVersion } });
    await pool.query("UPDATE naijue_erp.product SET name='SYNTHETIC STALE NAME' WHERE id=$1", [ids.product]);
    assert.equal((await post("native-stale")).json().error.code, "TRANSFER_SNAPSHOT_MISMATCH");
    await pool.query("UPDATE naijue_erp.product SET name=$1 WHERE id=$2", [draft.lines[0].snapshot.productName, ids.product]);
    const saved = await post("native-create"); assert.equal(saved.statusCode, 200);
    assert.deepEqual((await post("native-create")).json(), saved.json());
    assert.equal((await post("native-other-stale")).statusCode, 409);
    const stored = await new PostgresTransferQueryReader(pool).readDetail({ actor: transferActor, scope: { kind: "restricted", clauses: [{ createdByAccountId: ids.account }] },
      parameters: { transferId: entityId("transfer", draft.header.id) }, signal: new AbortController().signal });
    assert.equal(stored.document.lines[0]!.snapshot.barcode, "000123-SYNTHETIC-NATIVE");
    assert.equal(stored.document.header.number, draft.header.number); assert.equal(stored.document.header.version, 1);
    assert.equal(stored.document.header.status, "DRAFT"); assert.equal(stored.document.lines[0]!.quantity, 2n);
    assert.equal((await pool.query("SELECT count(*)::text AS n FROM naijue_erp.operation_receipt WHERE request_key='native-create' AND actor_account_id=$1", [ids.account])).rows[0].n, "1");
    assert.equal((await pool.query("SELECT count(*)::text AS n FROM naijue_erp.inventory_ledger l JOIN naijue_erp.transfer_line tl ON tl.id=l.source_transfer_line_id WHERE tl.transfer_id=$1", [draft.header.id])).rows[0].n, "0");
    allowed = false; assert.equal((await post("native-create")).statusCode, 403); assert.equal((await prepare()).statusCode, 403);
    evidence.push("authenticated HTTP prepare → stale SAVE rejected → SAVE → replay → native detail readback → revoked access rejected");
    assert.equal(app.server.listening, false); return Object.freeze(evidence);
  } finally { await app.close(); }
}
