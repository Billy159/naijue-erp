/** Dormant P01 real-PG acceptance function, imported by the original T45 host.
 * No Pool construction, env/credential reads, fixture seeding, DDL or auto-run.
 * The old schema11 fixture is NOT a current exact26 preparation mechanism.
 * Host wiring: real raw pool -> observeSalesFactsPgPool -> genuine exact26
 * issuer -> runSalesSaveFactsCacheIntegration with issuer.pool/runtime26.
 */
import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import Fastify from "fastify";
import { createAuthenticatedDocumentCommandsPlugin } from "../../apps/api/src/authenticated-document-commands.ts";
import { PostgresSalesUnitOfWork } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import type { PgSalesPool, PgSalesResult } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import { PostgresSalesQueryReader } from "../../adapters/postgres/src/sales-query-reader.ts";
import { PostgresTransferUnitOfWork } from "../../adapters/postgres/src/transfer-unit-of-work.ts";
import { PostgresImportedCatalogueCompletenessVerifier } from "../../adapters/postgres/src/catalogue-completeness.ts";
import type { NativeRuntime26Capability } from "../../packages/application/src/native-import-schema-contract.ts";
import { checkedNativeRuntime26Capability } from "../../packages/application/src/native-import-schema-contract.ts";
import { parseNativeSalesSaveProposal } from "../../packages/application/src/native-sales-preparation.ts";
import type { NativeSalesSaveProposal } from "../../packages/application/src/native-sales-preparation.ts";
import { createNativeTransactionSalesBusinessRules } from "../../packages/application/src/sales-native-facts.ts";
import { createSalesActionAuthorization } from "../../packages/application/src/sales-authorization.ts";
import { createSourceConfirmedTransferAuthorization, createSourceConfirmedTransferReferences } from "../../packages/application/src/transfer-policy.ts";
import type { ActorContext, SalesResult } from "../../packages/application/src/ports.ts";
import type { DocumentSpecification } from "../../packages/application/src/document-specification.ts";
import { parseDocumentSkuSelection } from "../../packages/application/src/document-specification.ts";
import type { SkuSnapshot, SalesDocument } from "../../packages/domain/src/documents.ts";
import type { EntityKind } from "../../packages/domain/src/values.ts";
import { decimalToMinor, entityId, minorAmount } from "../../packages/domain/src/values.ts";

export const SALES_FACTS_PG_SHAPES = [1, 20, 200] as const;
export interface SalesFactsPgFixture {
  /** Supplied only by the original host's separately approved, synthetic setup. */
  readonly syntheticOnly: true;
  readonly database: string;
  readonly actor: ActorContext;
  readonly now: string;
  readonly baseProductId: string;
  /** Exactly one existing SKU, quantity=1, explicit direct price, zero discount.
   * A single RECEIVE settlement is scaled independently for each row count. */
  readonly baseProposal: NativeSalesSaveProposal;
  readonly expectedSnapshot: SkuSnapshot;
  readonly expectedReferencePriceMinor: string;
  readonly append: {
    readonly spec: DocumentSpecification;
    readonly dealPrice: string;
    readonly expectedSnapshot: SkuSnapshot;
    readonly expectedReferencePriceMinor: string;
  };
}
interface Observation {
  name: string;
  acquireCount: number;
  acquireWallMs: number;
  releases: number;
  discards: number;
  statements: number;
  failures: number;
  queryWallMs: number;
  transactionWallMs: number[];
  sqlByTag: Record<string, { count: number; rows: number; driverWallMs: number }>;
}
/** Observation sits BELOW the genuine issuer; wrapping its issued client above
 * the issuer would violate the runtime's original-client identity. All results
 * and errors below are returned directly by the real driver, without substitution.
 * These wall times include client/transport/waits, not pure server CPU time. */
export function observeSalesFactsPgPool(original: PgSalesPool) {
  let active: Observation | undefined, pending = 0, leases = 0;
  const pool: PgSalesPool = { async connect() {
    const sample = active, started = performance.now();
    const raw = await original.connect();
    if (sample) { sample.acquireCount++; sample.acquireWallMs += performance.now() - started; leases++; }
    let beganAt: number | undefined;
    return { async query(sql: string, values?: unknown[]): Promise<PgSalesResult> {
      const start = performance.now(); let rows = 0, failed = false;
      const tag = sql.startsWith("INSERT INTO naijue_erp.sku(") ? "INSERT:sku" : /\/\* ([^*]+) \*\//.exec(sql)?.[1] ?? sql.split(/\s/)[0]!;
      if (sample) pending++;
      try {
        const result = await raw.query(sql, values); rows = result.rows.length;
        if (sql.startsWith("BEGIN")) beganAt = performance.now();
        return result;
      } catch (error) { failed = true; throw error; }
      finally {
        if (sample) {
          pending--; const ms = performance.now() - start;
          sample.statements++; sample.queryWallMs += ms; if (failed) sample.failures++;
          const item = sample.sqlByTag[tag] ?? { count: 0, rows: 0, driverWallMs: 0 };
          item.count++; item.rows += rows; item.driverWallMs += ms; sample.sqlByTag[tag] = item;
          if ((sql === "COMMIT" || sql === "ROLLBACK") && beganAt !== undefined) {
            sample.transactionWallMs.push(performance.now() - beganAt); beganAt = undefined;
          }
        }
      }
    }, release(error?: Error | boolean) {
      if (sample) { sample.releases++; if (error) sample.discards++; leases--; }
      raw.release(error);
    } };
  } };
  return Object.freeze({ pool,
    start(name: string) {
      assert.equal(active, undefined, "Only one finite real request observation at a time");
      assert.equal(pending, 0); assert.equal(leases, 0);
      active = { name, acquireCount: 0, acquireWallMs: 0, releases: 0, discards: 0, statements: 0, failures: 0,
        queryWallMs: 0, transactionWallMs: [], sqlByTag: {} };
    },
    finish(): Observation {
      assert.ok(active, "A real observation must be started"); assert.equal(pending, 0); assert.equal(leases, 0);
      const result = active; active = undefined; return result;
    }
  });
}
type PgObservation = ReturnType<typeof observeSalesFactsPgPool>;
export interface SalesFactsPgContext {
  readonly pool: PgSalesPool;
  readonly runtime26: NativeRuntime26Capability;
  readonly observation: PgObservation;
  readonly fixture: SalesFactsPgFixture;
}
const textMoney = (amount: bigint): string => {
  assert.ok(amount >= 0n); return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
};
const money = (value: string) => decimalToMinor(value, { scale: 2, maxAbsMinor: 999999999999999999n });
const factLoads = (sample: Observation) => sample.sqlByTag["native-sales-facts:schema"]?.count ?? 0;
const snapshotLoads = (sample: Observation) => sample.sqlByTag["native-transfer-snapshots:schema"]?.count ?? 0;

/** Required current fixture is validated before borrowing any connection. Missing
 * host/refs never fall back to schema11 seeds, an empty verifier, zero inventory,
 * fabricated identities or a boolean runtime. The host owns pool shutdown and any
 * uncertain COMMIT recovery; this function never retries an unknown request. */
export async function runSalesSaveFactsCacheIntegration(t: TestContext, context: SalesFactsPgContext): Promise<void> {
  assert.ok(context?.pool && context.runtime26 && context.observation && context.fixture, "Original exact26 host, real observation and explicit synthetic fixture required");
  const { pool, observation } = context, f = structuredClone(context.fixture), runtime26 = checkedNativeRuntime26Capability(context.runtime26);
  assert.ok(runtime26, "Original exact26 runtime required");
  assert.equal(f.syntheticOnly, true); assert.ok(f.database.length > 0);
  assert.ok(Number.isFinite(Date.parse(f.now)) && /Z$/.test(f.now), "Explicit actual trusted fixture time required");
  entityId("account", f.actor.accountId); assert.ok(f.actor.hallId); entityId("hall", f.actor.hallId);
  entityId("product", f.baseProductId);
  const base = parseNativeSalesSaveProposal(f.baseProposal);
  assert.equal(base.salesId, null); assert.equal(base.businessType, "SALE"); assert.equal(money(base.orderDiscount), 0n);
  assert.equal(base.hallId, f.actor.hallId); assert.ok(base.salespersonId);
  assert.equal(base.lines.length, 1); assert.ok("skuId" in base.lines[0]!);
  const line = base.lines[0]!; assert.equal(line.existingLineId, null); assert.equal(line.quantity, "1");
  assert.equal(line.pricingRule, "UNIT_PRICE"); assert.equal(line.discountTenths, null); assert.equal(line.isGift, false); assert.ok(line.dealPrice !== null);
  const unit = money(line.dealPrice); assert.ok(unit > 0n && unit * 200n <= 999999999999999999n, "All three explicit shapes must fit the existing money storage bound"); assert.ok(minorAmount(f.expectedReferencePriceMinor) >= 0n);
  assert.equal(base.settlements.length, 1); const settlement = base.settlements[0]!;
  assert.equal(settlement.existingSettlementId, null); assert.equal(settlement.direction, "RECEIVE"); assert.equal(money(settlement.amount), unit);
  parseDocumentSkuSelection({ spec: f.append.spec }); assert.ok(money(f.append.dealPrice) > 0n && money(f.append.dealPrice) < 999999999999999999n); assert.ok(minorAmount(f.append.expectedReferencePriceMinor) >= 0n);
  for (const snapshot of [f.expectedSnapshot, f.append.expectedSnapshot]) {
    for (const key of ["productCode", "productName", "colorName", "fitName", "sizeName"] as const) assert.ok(typeof snapshot[key] === "string" && snapshot[key].length > 0);
    assert.ok(snapshot.barcode === null || typeof snapshot.barcode === "string");
  }
  const read = async (sql: string, values: unknown[] = []) => {
    const client = await pool.connect();
    try { await runtime26.assertReady(client, "INVENTORY_ADMISSION"); return (await client.query(sql, values)).rows; }
    finally { client.release(); }
  };
  const identity = (await read(`SELECT current_database() AS db,current_user AS role,session_user AS session_role,
    current_setting('server_version_num') AS server_version,
    r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls AS elevated,
    EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='naijue_erp' AND c.relname=ANY($1::text[]) AND c.relowner=r.oid) AS owns_affected
    FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`, [["product", "sku", "sku_barcode", "sales_header", "sales_line", "sales_settlement", "operation_receipt", "audit_change", "inventory_balance", "inventory_ledger"]]))[0]!;
  assert.equal(identity.db, f.database); assert.equal(identity.role, identity.session_role); assert.equal(identity.elevated, false); assert.equal(identity.owns_affected, false);
  const accounts = await read(`SELECT a.staff_id,a.login_name,a.login_enabled,a.auth_version,s.role,s.employment_status,s.hall_id
    FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id WHERE a.id=$1::uuid`, [f.actor.accountId]);
  assert.equal(accounts.length, 1); const account = accounts[0]!;
  assert.equal(account.login_enabled, true); assert.equal(account.employment_status, "在职"); assert.equal(account.hall_id, f.actor.hallId);
  assert.ok(account.role === "ADMIN" || account.role === "WAREHOUSE", "The append fixture actor must have actual product-maintenance permission; a synthetic session cannot supply it");
  assert.equal(typeof account.login_name, "string"); assert.ok(Number.isSafeInteger(account.auth_version));
  const sourceSku = await read("SELECT product_id FROM naijue_erp.sku WHERE id=$1::uuid", [line.skuId]);
  assert.equal(sourceSku.length, 1); assert.equal(sourceSku[0]!.product_id, f.baseProductId);
  const tupleValues = [f.append.spec.productId, f.append.spec.colorId, f.append.spec.fitId, f.append.spec.sizeId];
  const tupleSql = "SELECT id,enabled FROM naijue_erp.sku WHERE product_id=$1::uuid AND color_id=$2::uuid AND fit_id=$3::uuid AND size_id=$4::uuid";
  assert.equal((await read(tupleSql, tupleValues)).length, 0, "Host must supply an actually missing lawful specification");
  const sizes: Record<string, string> = {};
  for (const table of ["product", "sku", "sku_barcode", "sales_header", "sales_line", "sales_settlement", "operation_receipt", "audit_change", "inventory_balance", "inventory_ledger"]) {
    const rows = await read(`SELECT count(*)::text AS n FROM naijue_erp.${table}`); assert.equal(typeof rows[0]!.n, "string"); sizes[table] = rows[0]!.n as string;
  }
  t.diagnostic(JSON.stringify({ kind: "REAL_PG_TARGET_SCALE", database: identity.db, role: identity.role, serverVersion: identity.server_version, rows: sizes,
    currentLineShapes: SALES_FACTS_PG_SHAPES, distinctBaseSkusPerShape: 1, samplesPerShape: 1,
    syntheticSession: true, passwordLogin: "NOT_TESTED", latencySlo: "NOT_EVALUATED", serverCpuAndLockWaitMs: "NOT_MEASURED" }));
  const stockState = async () => {
    const result: Record<string, string[]> = {};
    for (const table of ["inventory_balance", "inventory_ledger"]) {
      const rows = await read(`SELECT to_jsonb(x)::text AS row FROM naijue_erp.${table} x
        WHERE warehouse_id=$1::uuid AND sku_id IN(SELECT id FROM naijue_erp.sku WHERE product_id=ANY($2::uuid[]))
        ORDER BY to_jsonb(x)::text LIMIT 20001`, [base.warehouseId, [...new Set([f.baseProductId, f.append.spec.productId])]]);
      assert.ok(rows.length < 20001); result[table] = rows.map(row => row.row as string);
    }
    return result;
  };
  const stockBefore = await stockState(), generatedSales: string[] = [];
  const newId = <K extends EntityKind>(kind: K) => {
    const id = entityId(kind, randomUUID()); if (kind === "sales") generatedSales.push(id); return id;
  };
  const app = Fastify({ logger: false }), token = "S".repeat(43), origin = "https://synthetic-p01.invalid";
  const nativeAuthorization = createSalesActionAuthorization();
  app.register(createAuthenticatedDocumentCommandsPlugin({ authentication: { trustedOrigin: origin, service: {
    async resolve(value) { return value === token ? { accountId: f.actor.accountId, staffId: entityId("staff", account.staff_id as string),
      loginName: account.login_name as string, role: account.role as "ADMIN" | "WAREHOUSE" | "SALESPERSON", hallId: f.actor.hallId, authVersion: account.auth_version as number } : null; },
    async login() { throw Error("Synthetic session; password login is outside this runner"); }, async logout() {}, async changeOwnPassword() {}
  } }, nativeManualSalesPreparation: true,
  sales: { unitOfWork: new PostgresSalesUnitOfWork(pool, { catalogueCompleteness: new PostgresImportedCatalogueCompletenessVerifier(), runtime26,
      catalogueReadProof: { profile: "MAINTAINED_CATALOGUE26_V1" } }), rules: createNativeTransactionSalesBusinessRules(), now: () => f.now, newId,
    authorization: { async assertAllowed(actor, action, document, tx) {
      await nativeAuthorization.assertAllowed(actor, action, document, tx);
      assert.equal(document.header.hallId, base.hallId); assert.equal(document.header.warehouseId, base.warehouseId); assert.equal(document.header.customerId, base.customerId);
      assert.ok(document.settlements.every(s => s.paymentAccountId === settlement.paymentAccountId && s.paymentMethodId === settlement.paymentMethodId));
    } } },
  transfers: { unitOfWork: new PostgresTransferUnitOfWork(pool, { runtime26 }), authorization: createSourceConfirmedTransferAuthorization(),
    references: createSourceConfirmedTransferReferences(), now: () => f.now, newId }
  }));
  const headers = { cookie: `__Host-naijue_session=${token}`, origin, "content-type": "application/json" };
  const keyPrefix = `P01_${randomUUID()}`;
  const request = async (name: string, body: unknown) => {
    observation.start(name); const started = performance.now(); let finished = false;
    const originalRequestKey = (body as { requestKey: string }).requestKey;
    try {
      const response = await app.inject({ method: "POST", url: "/sales/commands", headers, payload: body as object });
      const wallMs = performance.now() - started, sample = observation.finish(); finished = true;
      assert.ok(sample.acquireCount > 0 && sample.statements > 0, "Missing original-driver observer wiring below exact26 issuer");
      t.diagnostic(JSON.stringify({ kind: "REAL_PG_REQUEST", request: name, originalRequestKey, status: response.statusCode,
        responseBytes: Buffer.byteLength(response.body, "utf8"), serviceInjectWallMs: wallMs, ...sample }));
      return { response, sample };
    } catch (error) { // Never retry an uncertain result; caller retains the original key.
      t.diagnostic(JSON.stringify({ kind: "REAL_PG_REQUEST_ABORTED", request: name, originalRequestKey, originalKeyRetained: true, ...(!finished ? { observation: observation.finish() } : {}) })); throw error;
    }
  };
  const detail = async (salesId: string) => (await new PostgresSalesQueryReader(pool).readDetail({ actor: f.actor,
    scope: { kind: "restricted", clauses: [{ hallId: f.actor.hallId!, createdByAccountId: f.actor.accountId }] },
    parameters: { salesId: entityId("sales", salesId) }, signal: new AbortController().signal })).document;
  const state = async (salesId: string, keys: string[]) => {
    const result: Record<string, string[]> = {};
    for (const table of ["sales_header", "sales_line", "sales_settlement"] as const) {
      const rows = await read(`SELECT to_jsonb(x)::text AS row FROM naijue_erp.${table} x WHERE ${table === "sales_header" ? "id" : "sales_id"}=$1::uuid ORDER BY id LIMIT 2002`, [salesId]);
      assert.ok(rows.length < 2002); result[table] = rows.map(row => row.row as string);
    }
    for (const [label, sql, values, limit] of [
      ["receipts", "SELECT to_jsonb(x)::text AS row FROM naijue_erp.operation_receipt x WHERE actor_account_id=$1::uuid AND request_key=ANY($2::text[]) ORDER BY id LIMIT 20", [f.actor.accountId, keys], 20],
      ["audits", "SELECT to_jsonb(x)::text AS row FROM naijue_erp.audit_change x WHERE object_id=$1::uuid ORDER BY id LIMIT 20", [salesId], 20],
      ["stock", "SELECT to_jsonb(x)::text AS row FROM naijue_erp.inventory_ledger x WHERE source_sales_line_id IN(SELECT id FROM naijue_erp.sales_line WHERE sales_id=$1::uuid) ORDER BY id LIMIT 2002", [salesId], 2002]
    ] as const) {
      const rows = await read(sql, [...values]); assert.ok(rows.length < limit); result[label] = rows.map(row => row.row as string);
    }
    return result;
  };
  const assertStored = (document: SalesDocument, count: number, snapshot: SkuSnapshot, reference: string, deal: bigint) => {
    assert.equal(document.header.status, "DRAFT"); assert.equal(document.header.hallId, base.hallId);
    assert.equal(document.header.customerId, base.customerId); assert.equal(document.header.warehouseId, base.warehouseId); assert.equal(document.header.salespersonId, base.salespersonId);
    assert.equal(document.header.createdByAccountId, f.actor.accountId); assert.equal(document.header.createdHallId, f.actor.hallId);
    assert.equal(document.lines.length, count); assert.equal(new Set(document.lines.map(l => l.id)).size, count);
    assert.equal(document.header.grossAmount, BigInt(count) * deal);
    assert.equal(document.header.netDue, BigInt(count) * deal); assert.equal(document.header.orderDiscount, 0n);
    for (const [index, row] of document.lines.entries()) {
      assert.equal(row.salesId, document.header.id); assert.equal(row.isCurrent, true); assert.equal(row.lineNo, index + 1);
      assert.equal(row.quantity, 1n); assert.equal(row.referencePrice, minorAmount(reference)); assert.equal(row.dealPrice, deal);
      assert.equal(row.lineAmount, deal); assert.equal(row.allocatedDiscount, 0n); assert.deepEqual(row.snapshot, snapshot);
    }
    assert.equal(document.settlements.length, 1); assert.equal(document.settlements[0]!.salesId, document.header.id); assert.equal(document.settlements[0]!.direction, "RECEIVE");
    assert.equal(document.settlements[0]!.amount, BigInt(count) * deal);
    assert.equal(document.settlements[0]!.paymentAccountId, settlement.paymentAccountId); assert.equal(document.settlements[0]!.paymentMethodId, settlement.paymentMethodId);
  };
  // node:test child failures do not reject their returned promise by default.
  // Stop dependent scenarios explicitly; an uncertain SAVE must not be followed
  // by more commands or automatic original-key retry.
  const scenario = async (name: string, work: () => Promise<void>) => {
    let failed = false, failure: unknown;
    await t.test(name, async () => { try { await work(); } catch (error) { failed = true; failure = error; throw error; } });
    if (failed) throw failure;
  };
  try {
    await app.ready();
    for (const count of SALES_FACTS_PG_SHAPES) await scenario(`REAL_PG ${count} lines: SAVE, exact replay, memo SAVE, stale CAS rollback`, async () => {
      const proposal: NativeSalesSaveProposal = { ...base, lines: Array.from({ length: count }, () => ({ ...line })),
        settlements: [{ ...settlement, amount: textMoney(unit * BigInt(count)) }] };
      const originalKey = `${keyPrefix}_${count}`, body = { action: "SAVE", expectedVersion: null, requestKey: originalKey, proposal };
      const saved = await request(`${count}_new`, body); assert.equal(saved.response.statusCode, 200, saved.response.body);
      assert.equal(factLoads(saved.sample), 1); assert.equal(snapshotLoads(saved.sample), 1);
      assert.equal(saved.sample.sqlByTag["maintained-catalogue26:roots"]?.count, 1);
      const result = saved.response.json<SalesResult>(); assert.equal(result.version, 1); assert.equal(result.status, "DRAFT"); assert.deepEqual(result.ledgerEntryIds, []);
      const document = await detail(result.salesId); assert.equal(document.header.version, 1); assertStored(document, count, f.expectedSnapshot, f.expectedReferencePriceMinor, unit);
      const keys = [originalKey, `${originalKey}_memo`, `${originalKey}_stale`];
      const beforeReplay = await state(result.salesId, keys);
      assert.equal(beforeReplay.sales_header!.length, 1); assert.equal(beforeReplay.sales_line!.length, count);
      assert.equal(beforeReplay.sales_settlement!.length, 1); assert.equal(beforeReplay.receipts!.length, 1); assert.equal(beforeReplay.audits!.length, 1); assert.equal(beforeReplay.stock!.length, 0);
      const receipt = JSON.parse(beforeReplay.receipts![0]!) as Record<string, unknown>, audit = JSON.parse(beforeReplay.audits![0]!) as Record<string, unknown>;
      assert.equal(receipt.actor_account_id, f.actor.accountId); assert.equal(receipt.request_key, originalKey); assert.equal(receipt.status, "COMMITTED");
      assert.equal(receipt.target_id, result.salesId); assert.deepEqual(receipt.result_data, result); assert.equal(audit.operation_id, result.operationId);
      assert.equal(audit.object_id, result.salesId); assert.equal(audit.old_version, null); assert.equal(audit.new_version, 1);
      const replay = await request(`${count}_same_key`, body);
      assert.equal(replay.response.statusCode, 200); assert.equal(replay.response.body, saved.response.body);
      assert.equal(factLoads(replay.sample), 0); assert.equal(snapshotLoads(replay.sample), 0); assert.deepEqual(await state(result.salesId, keys), beforeReplay);
      const memo: NativeSalesSaveProposal = { ...proposal, salesId: result.salesId, note: "SYNTHETIC P01 memo",
        lines: proposal.lines.map((l, i) => ({ ...l, existingLineId: document.lines[i]!.id })),
        settlements: proposal.settlements.map((s, i) => ({ ...s, existingSettlementId: document.settlements[i]!.id })) };
      const changed = await request(`${count}_memo`, { action: "SAVE", expectedVersion: 1, requestKey: keys[1], proposal: memo });
      assert.equal(changed.response.statusCode, 200, changed.response.body); assert.equal(changed.response.json<SalesResult>().version, 2);
      assert.equal(factLoads(changed.sample), 1); assert.equal(snapshotLoads(changed.sample), 0);
      const current = await detail(result.salesId); assert.equal(current.header.version, 2); assert.equal(current.header.note, memo.note); assertStored(current, count, f.expectedSnapshot, f.expectedReferencePriceMinor, unit);
      assert.deepEqual(current.lines, document.lines); assert.deepEqual(current.settlements, document.settlements);
      const beforeStale = await state(result.salesId, keys), stale = await request(`${count}_stale`, { action: "SAVE", expectedVersion: 1, requestKey: keys[2], proposal: memo });
      assert.equal(stale.response.statusCode, 409); assert.equal(stale.response.json().error.code, "VERSION_CONFLICT");
      assert.equal(stale.sample.sqlByTag.ROLLBACK?.count, 1); assert.deepEqual(await state(result.salesId, keys), beforeStale);
      assert.deepEqual(await stockState(), stockBefore);
    });
    await scenario("REAL_PG missing specification: failed SAVE rolls back append; corrected original key commits once", async () => {
      const appendLine = { existingLineId: null, spec: f.append.spec, quantity: "1", dealPrice: f.append.dealPrice,
        pricingRule: "UNIT_PRICE" as const, discountTenths: null, isGift: false, zeroConfirmed: false };
      const appendProposal: NativeSalesSaveProposal = { ...base, lines: [appendLine], settlements: [{ ...settlement, amount: f.append.dealPrice }] };
      const productState = async () => {
        const productId = f.append.spec.productId, result: Record<string, string[]> = {};
        for (const [name, sql, limit] of [
          ["product", "SELECT to_jsonb(x)::text AS row FROM naijue_erp.product x WHERE id=$1::uuid ORDER BY id LIMIT 2", 2],
          ["skus", "SELECT to_jsonb(x)::text AS row FROM naijue_erp.sku x WHERE product_id=$1::uuid ORDER BY id LIMIT 5001", 5001],
          ["barcodes", "SELECT to_jsonb(x)::text AS row FROM naijue_erp.sku_barcode x WHERE sku_id IN(SELECT id FROM naijue_erp.sku WHERE product_id=$1::uuid) ORDER BY id LIMIT 20001", 20001],
          ["audits", "SELECT to_jsonb(x)::text AS row FROM naijue_erp.audit_change x WHERE object_type='PRODUCT' AND object_id=$1::uuid ORDER BY id LIMIT 1025", 1025],
          ["receipts", "SELECT to_jsonb(x)::text AS row FROM naijue_erp.operation_receipt x WHERE target_type='PRODUCT' AND target_id=$1::uuid ORDER BY id LIMIT 1025", 1025]
        ] as const) { const rows = await read(sql, [productId]); assert.ok(rows.length < limit); result[name] = rows.map(row => row.row as string); }
        return result;
      };
      const appendKey = `${keyPrefix}_append`, before = await productState();
      const rejected = await request("append_then_economics_reject", { action: "SAVE", expectedVersion: null, requestKey: appendKey,
        proposal: { ...appendProposal, orderDiscount: textMoney(money(f.append.dealPrice) + 1n) } });
      assert.equal(rejected.response.statusCode, 422); assert.equal(rejected.response.json().error.code, "INVALID_ORDER_DISCOUNT");
      assert.equal(rejected.sample.sqlByTag.ROLLBACK?.count, 1); assert.equal(rejected.sample.sqlByTag["INSERT:sku"]?.count, 1);
      assert.deepEqual(await productState(), before);
      assert.ok(generatedSales.length > 0); const rolledBack = await state(generatedSales.at(-1)!, [appendKey]);
      for (const rows of Object.values(rolledBack)) assert.equal(rows.length, 0);
      assert.equal((await read(tupleSql, tupleValues)).length, 0);
      assert.equal((await read("SELECT id FROM naijue_erp.operation_receipt WHERE actor_account_id=$1::uuid AND request_key=$2", [f.actor.accountId, appendKey])).length, 0);
      const body = { action: "SAVE", expectedVersion: null, requestKey: appendKey, proposal: appendProposal };
      const saved = await request("append_save", body); assert.equal(saved.response.statusCode, 200, saved.response.body);
      assert.equal(factLoads(saved.sample), 1); assert.equal(snapshotLoads(saved.sample), 1); assert.equal(saved.sample.sqlByTag["INSERT:sku"]?.count, 1);
      const result = saved.response.json<SalesResult>(), document = await detail(result.salesId);
      assertStored(document, 1, f.append.expectedSnapshot, f.append.expectedReferencePriceMinor, money(f.append.dealPrice));
      const tuple = await read(tupleSql, tupleValues); assert.equal(tuple.length, 1); assert.equal(document.lines[0]!.skuId, tuple[0]!.id);
      const after = await productState(), unchanged = await state(result.salesId, [appendKey]);
      const replay = await request("append_same_key", body); assert.equal(replay.response.statusCode, 200); assert.equal(replay.response.body, saved.response.body);
      assert.deepEqual(await productState(), after); assert.deepEqual(await state(result.salesId, [appendKey]), unchanged);
      assert.deepEqual(await stockState(), stockBefore);
    });
    t.diagnostic("REAL_PG finite current-source SAVE evidence only. One sample per shape, one repeated SKU across 1/20/200 real rows; no before-source PG timing, percentiles/SLO, password login, network, contention or production acceptance. Unknown COMMIT is never retried. Host retains target/cleanup/recovery ownership.");
  } finally { await app.close(); }
}

// A bare node --test invocation must never count a dormant imported module as
// successful real-PG acceptance. Only the original prepared T45 host calls it.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  throw new Error("P01 real PG not executed: import runSalesSaveFactsCacheIntegration from the original exact26 T45 host with current A01/P02 fixture; no connection attempted");
