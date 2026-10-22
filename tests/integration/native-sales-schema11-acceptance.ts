/** Genuine PostgreSQL native SALE acceptance, only on the separately guarded
 * schema11 target. Synthetic session and lawful test-only published prerequisite;
 * NOT password login, browser/TLS, real intake or historical import acceptance. */
import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { Pool } from "pg";
import Fastify from "fastify";
import { createAuthenticatedDocumentCommandsPlugin } from "../../apps/api/src/authenticated-document-commands.ts";
import { PostgresSalesUnitOfWork } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import { PostgresSalesQueryReader } from "../../adapters/postgres/src/sales-query-reader.ts";
import { PostgresTransferUnitOfWork } from "../../adapters/postgres/src/transfer-unit-of-work.ts";
import { PostgresImportedCatalogueCompletenessVerifier } from "../../adapters/postgres/src/catalogue-completeness.ts";
import { createSalesActionAuthorization } from "../../packages/application/src/sales-authorization.ts";
import { createNativeManualSalesBusinessRules } from "../../packages/application/src/native-sales-preparation.ts";
import { createSourceConfirmedTransferAuthorization, createSourceConfirmedTransferReferences } from "../../packages/application/src/transfer-policy.ts";
import type { SalesResult } from "../../packages/application/src/ports.ts";
import type { SalesDraft } from "../../packages/domain/src/documents.ts";
import { entityId } from "../../packages/domain/src/values.ts";
import { verifyCatalogueCompletenessOnApprovedDisposable } from "./catalogue-completeness-acceptance.ts";
import { saleActor, saleIds, SALE_TIME, SALE_HISTORY_COUNTS, seedNativeSalesSchema11Fixture, publishNativeSalesSchema11Fixture } from "./native-sales-schema11-fixture.ts";
import { syntheticId } from "./fixtures.ts";

export const NATIVE_SALE_SCHEMA11_SCENARIOS = [
  "staged exact-nine source cannot authorize preparation; no business writes",
  "original schema11 publication guards accept real counted source/native bindings and exact-nine proof",
  "published exact-nine verifier rejects changed version/nullable price and immutable source edits",
  "native authenticated SALE preparation is read-only and captures real MAIN/reference/method facts",
  "stale source version, stale native label and forged MAIN/reference snapshots reject without writes",
  "native SALE SAVE commits once; identical replay is byte-equal and altered original-key content rejects",
  "native detail, receipt and audit readback preserve exact draft facts; SAVE creates no stock effects",
  "current stored identity revocation denies preparation, replay and receipt disclosure without writes"
] as const;
type MutableJson<T> = T extends string ? string : T extends number ? number : T extends bigint ? string : T extends readonly (infer U)[] ? MutableJson<U>[]
  : T extends object ? { -readonly [K in keyof T]: MutableJson<T[K]> } : T;
/** CREATE evidence is a change projection, not a serialized document header.
 * Frozen SalesAuditValues deliberately omits header.id/creator fields; identity
 * lives in audit object/operation/actor columns and reciprocal receipt FKs.
 * Expected payload below is independent of the production evidence serializer. */
export function assertNativeSaleCreateEvidence(input: {
  readonly draft: MutableJson<SalesDraft>; readonly saved: MutableJson<SalesResult>;
  readonly audit: Readonly<Record<string, unknown>>; readonly receipt: Readonly<Record<string, unknown>>;
  readonly actorAccountId: string; readonly time: string;
}): void {
  const { draft, saved, audit, receipt, actorAccountId, time } = input, h = draft.header;
  assert.equal(saved.salesId, h.id); assert.equal(saved.status, "DRAFT"); assert.equal(saved.version, 1);
  assert.ok(typeof audit.id === "string"); entityId("audit", audit.id);
  assert.ok(draft.lines.every(row => row.salesId === h.id), "each expected line belongs to this native document");
  assert.ok(draft.settlements.every(row => row.salesId === h.id), "each expected settlement belongs to this native document");
  const after = { header: { version: 1, number: h.number, businessType: h.businessType, businessDate: h.businessDate,
    hallId: h.hallId, salespersonId: h.salespersonId, customerId: h.customerId, warehouseId: h.warehouseId, status: "DRAFT",
    grossAmount: h.grossAmount, orderDiscount: h.orderDiscount, netDue: h.netDue, note: h.note,
    updatedAt: time, approvedByAccountId: null, approvedAt: null },
  lines: draft.lines.map(row => ({ id: row.id, lineNo: row.lineNo, skuId: row.skuId, quantity: row.quantity,
    referencePrice: row.referencePrice, dealPrice: row.dealPrice, pricingRule: row.pricingRule, discountTenths: row.discountTenths,
    zeroConfirmed: row.zeroConfirmed, lineAmount: row.lineAmount, allocatedDiscount: row.allocatedDiscount, isGift: row.isGift,
    snapshot: { productCode: row.snapshot.productCode, productName: row.snapshot.productName, colorName: row.snapshot.colorName,
      fitName: row.snapshot.fitName, sizeName: row.snapshot.sizeName, barcode: row.snapshot.barcode }, isCurrent: row.isCurrent })),
  settlements: draft.settlements.map(row => ({ id: row.id, salesId: row.salesId, lineNo: row.lineNo,
    paymentAccountId: row.paymentAccountId, paymentMethodId: row.paymentMethodId, direction: row.direction, amount: row.amount })) };
  assert.deepEqual(receipt, { id: saved.operationId, actor_account_id: actorAccountId, request_key: "SALE_NATIVE_CREATE",
    action: "SAVE", target_type: "SALES", target_id: h.id, target_sales_id: h.id, target_transfer_id: null,
    status: "COMMITTED", result_data: saved, completed_at: new Date(time) });
  assert.deepEqual(audit, { id: audit.id, operation_id: saved.operationId, actor_account_id: actorAccountId,
    object_type: "SALES", object_id: h.id, object_sales_id: h.id, object_transfer_id: null, action: "SAVE",
    old_version: null, new_version: 1, occurred_at: new Date(time), before_values: null, after_values: after });
  // Both directions match the original deferred receipt/audit kind+target union.
  assert.deepEqual([audit.operation_id, audit.actor_account_id, audit.object_type, audit.object_id, audit.action],
    [receipt.id, receipt.actor_account_id, receipt.target_type, receipt.target_id, receipt.action]);
}
const wireFacts = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString() : item));
const BUSINESS_TABLES = ["sales_header", "sales_line", "sales_settlement", "operation_receipt", "audit_change", "inventory_balance", "inventory_ledger"] as const;
async function businessState(pool: Pool) {
  return Promise.all(BUSINESS_TABLES.map(async table => (await pool.query(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS digest FROM naijue_erp.${table} t`)).rows[0]!.digest));
}
export async function runNativeSalesSchema11Acceptance(t: TestContext, pool: Pool): Promise<void> {
  const source = await seedNativeSalesSchema11Fixture(pool);
  const nativeAuthorization = createSalesActionAuthorization(); let sequence = 120000;
  const app = Fastify({ logger: false });
  const origin = "https://synthetic-sale-schema11.invalid", token = "S".repeat(43);
  app.register(createAuthenticatedDocumentCommandsPlugin({ authentication: { trustedOrigin: origin, service: {
    async resolve(value) { return value === token ? { accountId: saleIds.account, staffId: saleIds.staff, loginName: "SYNTHETIC_NONPASSWORD",
      role: "SALESPERSON", hallId: saleIds.hall, authVersion: 1 } : null; },
    async login() { throw new Error("Synthetic session only; password login is not tested"); }, async logout() {}, async changeOwnPassword() {}
  } }, nativeManualSalesPreparation: true,
    sales: { unitOfWork: new PostgresSalesUnitOfWork(pool, { catalogueCompleteness: new PostgresImportedCatalogueCompletenessVerifier() }),
      rules: createNativeManualSalesBusinessRules(), now: () => SALE_TIME, newId: kind => syntheticId(kind, sequence++),
      authorization: { async assertAllowed(actor, action, document, tx) {
        await nativeAuthorization.assertAllowed(actor, action, document, tx);
        assert.deepEqual(actor, saleActor); assert.equal(document.header.hallId, saleIds.hall);
        assert.equal(document.header.warehouseId, saleIds.warehouse); assert.equal(document.header.customerId, saleIds.customer);
        assert.ok(document.lines.every(row => row.skuId === saleIds.sku));
        assert.ok(document.settlements.every(row => row.paymentAccountId === saleIds.payment));
      } } },
    transfers: { unitOfWork: new PostgresTransferUnitOfWork(pool), authorization: createSourceConfirmedTransferAuthorization(),
      references: createSourceConfirmedTransferReferences(), now: () => SALE_TIME, newId: kind => syntheticId(kind, sequence++) }
  }));
  const headers = { cookie: `__Host-naijue_session=${token}`, origin, "content-type": "application/json" };
  const proposal = { businessType: "SALE", businessDate: "2026-10-21", note: "SYNTHETIC native SALE published-source proof",
    hallId: saleIds.hall, warehouseId: saleIds.warehouse, customerId: saleIds.customer, salespersonId: null, orderDiscount: "0.00",
    lines: [{ skuId: saleIds.sku, quantity: "2", dealPrice: "1.25", pricingRule: "UNIT_PRICE", discountTenths: null, isGift: false, zeroConfirmed: false }],
    settlements: [{ paymentAccountId: saleIds.payment, paymentMethodId: saleIds.method, direction: "RECEIVE", amount: "2.50" }] };
  const prepare = () => app.inject({ method: "POST", url: "/sales/prepare-create", headers, payload: proposal });
  let draft: MutableJson<SalesDraft>;
  let saved: MutableJson<SalesResult>;
  let savedBody = "";
  const post = (requestKey: string, proposed = draft) => app.inject({ method: "POST", url: "/sales/commands", headers,
    payload: { action: "SAVE", draft: proposed, requestKey, expectedVersion: null } });
  const rejected = async (work: () => ReturnType<typeof prepare>, status: number, code: string) => {
    const before = await businessState(pool), response = await work();
    assert.equal(response.statusCode, status); assert.equal(response.json().error.code, code);
    assert.deepEqual(await businessState(pool), before, "rejected request must not change native documents/receipts/audits/stock");
  };
  try {
    await app.ready();
    await t.test(NATIVE_SALE_SCHEMA11_SCENARIOS[0], async () => {
      assert.equal((await pool.query("SELECT status FROM naijue_erp.import_batch WHERE id=$1", [saleIds.batch])).rows[0]!.status, "VALIDATING");
      await rejected(prepare, 409, "NATIVE_CATALOGUE_FACTS_UNAVAILABLE");
    });
    await t.test(NATIVE_SALE_SCHEMA11_SCENARIOS[1], async () => {
      await publishNativeSalesSchema11Fixture(pool, source);
      const row = (await pool.query(`SELECT p.purchase_price::text,p.retail_price::text,p.wholesale6_price::text,p.wholesale7_price::text,p.minimum_price::text,
        s.source_file_sha256,s.row_sha256,s.raw_fields,s.field_provenance FROM naijue_erp.product p JOIN naijue_erp.import_source_row s
        ON s.field_provenance->>'native_product_id'=p.id::text WHERE p.id=$1`, [saleIds.product])).rows[0]!;
      assert.equal(row.purchase_price, "0.75"); assert.equal(row.retail_price, "1.25"); assert.equal(row.wholesale6_price, "0.00");
      assert.equal(row.wholesale7_price, null); assert.equal(row.minimum_price, null);
      assert.equal(row.source_file_sha256, source.sourceFileSha256); assert.equal(row.row_sha256, source.product.rowSha256);
      assert.deepEqual(row.raw_fields, source.product.raw); assert.equal(row.raw_fields["七级批发价（批发价）"], "");
      assert.equal(row.field_provenance.product_input_proof.blank_price_policy, "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET");
      assert.equal(Object.keys(row.field_provenance.product_input_proof.prices).length, 9);
      assert.deepEqual((await pool.query("SELECT history_actual_counts FROM naijue_erp.import_batch WHERE id=$1", [saleIds.batch])).rows[0]!.history_actual_counts, SALE_HISTORY_COUNTS);
    });
    await t.test(NATIVE_SALE_SCHEMA11_SCENARIOS[2], async () => {
      const evidence = await verifyCatalogueCompletenessOnApprovedDisposable(pool, saleIds.product);
      assert.equal(evidence.length, 4); for (const item of evidence) t.diagnostic(item);
    });
    await t.test(NATIVE_SALE_SCHEMA11_SCENARIOS[3], async () => {
      const before = await businessState(pool), response = await prepare();
      assert.equal(response.statusCode, 200); draft = response.json<MutableJson<SalesDraft>>();
      assert.deepEqual(await businessState(pool), before);
      assert.equal(draft.header.grossAmount, "250"); assert.equal(draft.header.netDue, "250");
      assert.equal(draft.lines[0]!.referencePrice, "125"); assert.equal(draft.lines[0]!.dealPrice, "125");
      assert.equal(draft.lines[0]!.snapshot.productName, source.product.raw["商品名称"]);
      assert.equal(draft.lines[0]!.snapshot.barcode, source.barcode.raw["条码"]);
      assert.equal(draft.settlements[0]!.paymentMethodId, saleIds.method);
      assert.equal((await pool.query("SELECT count(*)::integer AS n FROM naijue_erp.sales_header WHERE id=$1", [draft.header.id])).rows[0]!.n, 0);
    });
    await t.test(NATIVE_SALE_SCHEMA11_SCENARIOS[4], async () => {
      await pool.query("UPDATE naijue_erp.product SET version=version+1 WHERE id=$1", [saleIds.product]);
      try { await rejected(() => post("SALE_STALE_PROOF"), 409, "NATIVE_CATALOGUE_FACTS_UNAVAILABLE"); }
      finally { await pool.query("UPDATE naijue_erp.product SET version=version-1 WHERE id=$1", [saleIds.product]); }
      await pool.query("UPDATE naijue_erp.product SET name='SYNTHETIC STALE SALE LABEL' WHERE id=$1", [saleIds.product]);
      try { await rejected(() => post("SALE_STALE_LABEL"), 409, "SALES_SNAPSHOT_MISMATCH"); }
      finally { await pool.query("UPDATE naijue_erp.product SET name=$2 WHERE id=$1", [saleIds.product, source.product.raw["商品名称"]]); }
      const forgedBarcode = structuredClone(draft); forgedBarcode.lines[0]!.snapshot.barcode = null;
      await rejected(() => post("SALE_FORGED_MAIN", forgedBarcode), 409, "SALES_SNAPSHOT_MISMATCH");
      const forgedReference = structuredClone(draft); forgedReference.lines[0]!.referencePrice = "999";
      await rejected(() => post("SALE_FORGED_REFERENCE", forgedReference), 409, "SALES_SNAPSHOT_MISMATCH");
    });
    await t.test(NATIVE_SALE_SCHEMA11_SCENARIOS[5], async () => {
      const response = await post("SALE_NATIVE_CREATE"); assert.equal(response.statusCode, 200); savedBody = response.body; saved = response.json();
      assert.equal(saved.salesId, draft.header.id); assert.equal(saved.version, 1); assert.equal(saved.status, "DRAFT"); assert.deepEqual(saved.ledgerEntryIds, []);
      const beforeReplay = await businessState(pool), replay = await post("SALE_NATIVE_CREATE");
      assert.equal(replay.statusCode, 200); assert.equal(replay.body, savedBody); assert.deepEqual(await businessState(pool), beforeReplay);
      const changed = structuredClone(draft); changed.header.note = "DIFFERENT CONTENT";
      await rejected(() => post("SALE_NATIVE_CREATE", changed), 409, "IDEMPOTENCY_CONFLICT");
      await rejected(() => post("SALE_OTHER_STALE_CREATE"), 409, "VERSION_CONFLICT");
    });
    await t.test(NATIVE_SALE_SCHEMA11_SCENARIOS[6], async () => {
      const stored = await new PostgresSalesQueryReader(pool).readDetail({ actor: saleActor,
        scope: { kind: "restricted", clauses: [{ hallId: saleIds.hall, createdByAccountId: saleIds.account }] },
        parameters: { salesId: entityId("sales", draft.header.id) }, signal: new AbortController().signal });
      assert.equal(stored.stockBasis, "RUNTIME_LEDGER"); assert.equal(stored.document.header.status, "DRAFT");
      assert.equal(stored.document.header.version, 1); assert.equal(stored.document.header.number, draft.header.number);
      assert.equal(stored.document.header.createdByAccountId, saleIds.account); assert.equal(stored.document.header.createdHallId, saleIds.hall);
      assert.equal(stored.document.header.grossAmount, 250n); assert.equal(stored.document.header.netDue, 250n);
      assert.equal(stored.document.lines.length, 1); assert.equal(stored.document.lines[0]!.quantity, 2n);
      assert.equal(stored.document.lines[0]!.referencePrice, 125n); assert.equal(stored.document.lines[0]!.dealPrice, 125n);
      assert.deepEqual(stored.document.lines[0]!.snapshot, draft.lines[0]!.snapshot);
      assert.equal(stored.document.settlements[0]!.paymentMethodId, saleIds.method); assert.equal(stored.document.settlements[0]!.amount, 250n);
      assert.equal(stored.settlementNames[0]!.accountNameSnapshot, "SYNTHETIC SALE PAYMENT");
      assert.equal(stored.settlementNames[0]!.methodNameSnapshot, "SYNTHETIC SALE METHOD");
      assert.deepEqual(wireFacts(stored.document.lines), draft.lines, "native line IDs, owner, pricing and complete observations match the prepared draft");
      assert.deepEqual(wireFacts(stored.document.settlements), draft.settlements, "native settlement IDs, owner, method and exact minor amount match");
      const receipts = (await pool.query(`SELECT id,actor_account_id,request_key,action,target_type,target_id,target_sales_id,target_transfer_id,
        status,result_data,completed_at FROM naijue_erp.operation_receipt WHERE actor_account_id=$1 AND request_key='SALE_NATIVE_CREATE'`, [saleIds.account])).rows;
      const audits = (await pool.query(`SELECT id,operation_id,actor_account_id,object_type,object_id,object_sales_id,object_transfer_id,action,
        old_version,new_version,occurred_at,before_values,after_values FROM naijue_erp.audit_change WHERE operation_id=$1`, [saved!.operationId])).rows;
      assert.equal(receipts.length, 1); assert.equal(audits.length, 1);
      assertNativeSaleCreateEvidence({ draft, saved: saved!, audit: audits[0]!, receipt: receipts[0]!, actorAccountId: saleIds.account, time: SALE_TIME });
      const receipt = await app.inject({ method: "GET", url: "/sales/receipts/SALE_NATIVE_CREATE", headers });
      assert.equal(receipt.statusCode, 200);
      const received = receipt.json(); assert.equal(typeof received.completedAt, "string");
      assert.deepEqual({ ...received, completedAt: new Date(received.completedAt).toISOString() },
        { requestKey: "SALE_NATIVE_CREATE", action: "SAVE", status: "COMMITTED", completedAt: SALE_TIME, result: saved! });
      for (const table of ["inventory_balance", "inventory_ledger"]) assert.equal((await pool.query(`SELECT count(*)::integer AS n FROM naijue_erp.${table}`)).rows[0]!.n, 0);
      assert.equal((await pool.query("SELECT count(*)::integer AS n FROM naijue_erp.sales_header")).rows[0]!.n, 1);
    });
    await t.test(NATIVE_SALE_SCHEMA11_SCENARIOS[7], async () => {
      await pool.query("UPDATE naijue_erp.user_account SET login_enabled=false WHERE id=$1", [saleIds.account]);
      await rejected(prepare, 403, "FORBIDDEN"); await rejected(() => post("SALE_NATIVE_CREATE"), 403, "FORBIDDEN");
      await rejected(() => app.inject({ method: "GET", url: "/sales/receipts/SALE_NATIVE_CREATE", headers }), 403, "FORBIDDEN");
    });
    assert.equal(app.server.listening, false);
    t.diagnostic("Native SALE only; real PostgreSQL proof and save/replay/readback. Synthetic session and native catalogue/source fixture; formal V2 stage/publish metadata. Historical/native import lifecycle, login/browser/TLS, real data and APPROVE/stock posting: NOT_RUN.");
  } finally { await app.close(); }
}
