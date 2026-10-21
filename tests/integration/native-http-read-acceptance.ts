/** DORMANT real-PG preparation for the explicit source-confirmed-native profile.
 * Append-only acceptance coverage: never replace the earlier explicit-test-policy proof.
 * Fastify.inject is not a listening socket, browser/TLS, real-data or production acceptance. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { TestContext } from "node:test";
import type { Pool } from "pg";
import type { LightMyRequestResponse } from "fastify";
import { createPostgresReadApi } from "../../apps/api/src/postgres-read-api.ts";
import type { PostgresReadApi, PostgresReadApiOptions } from "../../apps/api/src/postgres-read-api.ts";
import { PostgresSalesUnitOfWork } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import { PostgresTransferUnitOfWork } from "../../adapters/postgres/src/transfer-unit-of-work.ts";
import { createSourceConfirmedPostgresReadAuthorization } from "../../adapters/postgres/src/source-confirmed-read-authorization.ts";
import { createSalesService } from "../../packages/application/src/sales-service.ts";
import { createTransferService } from "../../packages/application/src/transfer-service.ts";
import { createSourceConfirmedTransferReferences } from "../../packages/application/src/transfer-policy.ts";
import type { ActorContext } from "../../packages/application/src/ports.ts";
import type { SalesListQuery } from "../../packages/application/src/sales-query-ports.ts";
import type { SalesDraft } from "../../packages/domain/src/documents.ts";
import type { TransferRole } from "../../packages/application/src/transfer-ports.ts";
import type { EntityId } from "../../packages/domain/src/values.ts";
import { version } from "../../packages/domain/src/values.ts";
import { createNodeScryptPasswords } from "../../packages/authentication/src/passwords.ts";
import { createSourceAuthenticationPolicy } from "../../packages/authentication/src/source-policy.ts";
import { ids, newSyntheticId, salesDraft, syntheticId, SYNTHETIC_SALES_RULES, SYNTHETIC_TIME, transferDraft } from "./fixtures.ts";
import { NATIVE_POLICY_SCENARIOS } from "./migration-manifest.ts";
import type { IntegrationSettings } from "./safety.ts";

const ORIGIN = "https://synthetic-native-profile.invalid";
const PREFIX = "SYNTHETIC_NATIVE_SCOPE_";
const ownSalesId = syntheticId("sales", 6100), foreignSalesId = syntheticId("sales", 6101);
const hiddenTransferId = syntheticId("transfer", 6200);
const thirdWarehouseId = syntheticId("warehouse", 6201);
interface LoginFixture {
  readonly label: string; readonly login: string; readonly accountId: EntityId<"account">; readonly staffId: EntityId<"staff">;
  readonly role: TransferRole; readonly hallId: EntityId<"hall"> | null;
  password: string; cookie: string;
}
function fixtures(): [LoginFixture, LoginFixture, LoginFixture, LoginFixture] {
  const make = (label: string, id: number, role: TransferRole, hallId: EntityId<"hall"> | null): LoginFixture => ({ label,
    login: `SYNTHETIC_NATIVE_${label}`, accountId: syntheticId("account", id), staffId: syntheticId("staff", id + 1),
    role, hallId, password: randomBytes(32).toString("base64url"), cookie: "" });
  return [make("SELLER_A", 6000, "SALESPERSON", ids.hall), make("SELLER_B", 6002, "SALESPERSON", ids.otherHall),
    make("ADMIN", 6004, "ADMIN", null), make("WAREHOUSE", 6006, "WAREHOUSE", null)];
}
const actor = (fixture: LoginFixture): ActorContext => ({ accountId: fixture.accountId, hallId: fixture.hallId });
const ok = (condition: boolean, message: string): void => { assert.equal(condition, true, message); };
function json(response: { readonly body: string }): ReturnType<typeof JSON.parse> {
  try { return JSON.parse(response.body); }
  catch { throw new Error("Native-profile response JSON was unavailable; response detail omitted"); }
}
function nativeOptions(settings: IntegrationSettings): PostgresReadApiOptions {
  return { postgres: { target: { host: settings.host, port: settings.port, database: settings.database, user: settings.user,
    password: settings.password, ssl: false }, max: 2, maxPendingAcquisitions: 4, connectionTimeoutMillis: 3000,
    acquisitionTimeoutMillis: 5000, queryTimeoutMillis: 15000, statementTimeoutMillis: 12000, lockTimeoutMillis: 4000,
    idleInTransactionTimeoutMillis: 20000, idlePoolTimeoutMillis: 1000, disposeGraceMillis: 1000, disposeTimeoutMillis: 5000 },
    authentication: { trustedOrigin: ORIGIN, now: () => SYNTHETIC_TIME, policy: createSourceAuthenticationPolicy(900) },
    authorization: { mode: "source-confirmed-native" }, productMedia: null };
}
const salesInput = (): SalesListQuery => ({ filter: { startDate: null, endDate: null, statuses: [], businessTypes: [], hallIds: [], salespersonIds: [], customerIds: [], warehouseIds: [], number: PREFIX }, page: 1, pageSize: 20 });
const transferInput = () => ({ filter: { startDate: null, endDate: null, statuses: [], fromWarehouseIds: [], toWarehouseIds: [],
  number: "SYNTHETIC_NATIVE_TRANSFER_" }, page: 1, pageSize: 20 });
const inventoryInput = () => ({ filter: { products: [{ id: ids.product, label: "CLIENT PRODUCT LABEL" }], category: null,
  warehouses: [], suppliers: [], fits: [], seasons: [] }, page: 1, pageSize: 100 });

/** Explicit fixture maintenance only. Sanitize raw failing-row details, which can include a stored password hash.
 * These are not public routes, production account maintenance, or a production command authorization provider. */
async function fixtureSql(pool: Pool, sql: string, values: unknown[] = []): Promise<void> {
  try { await pool.query(sql, values); }
  catch { throw new Error("Native synthetic fixture maintenance failed; database detail omitted"); }
}
async function seedAccounts(pool: Pool, accounts: readonly LoginFixture[]): Promise<void> {
  const passwords = createNodeScryptPasswords();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const fixture of accounts) {
      const hash = await passwords.hash(fixture.password);
      await client.query(`INSERT INTO naijue_erp.staff(id,name,hall_id,role,employment_status,version)
        VALUES($1,$2,$3,$4,'在职',1)`, [fixture.staffId, `SYNTHETIC NATIVE ${fixture.label}`, fixture.hallId, fixture.role]);
      await client.query(`INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
        VALUES($1,$2,$3,$4,true,1,1,$5,$5)`, [fixture.accountId, fixture.staffId, fixture.login, hash, SYNTHETIC_TIME]);
    }
    await client.query("COMMIT");
  } catch {
    try { await client.query("ROLLBACK"); } catch { /* Drop the connection without recording driver fields. */ }
    throw new Error("Native synthetic account setup failed; database detail omitted");
  } finally { client.release(true); }
}

/** Genuine service-written A/B business facts. The narrow fixture policy is SETUP ONLY.
 * This read-only API never receives this command policy and never registers business commands. */
async function seedSales(pool: Pool, own: LoginFixture, foreign: LoginFixture): Promise<void> {
  const drafts = [own, foreign].map((fixture, index): { fixture: LoginFixture; draft: SalesDraft } => {
    const base = salesDraft(6100 + index, { quantities: [index === 0 ? "1" : "2"] });
    return { fixture, draft: { ...base, header: { ...base.header, number: `${PREFIX}${fixture.label}`,
      hallId: fixture.hallId!, warehouseId: index === 0 ? ids.warehouse : ids.toWarehouse, salespersonId: fixture.staffId } } };
  });
  const service = createSalesService({ unitOfWork: new PostgresSalesUnitOfWork(pool), rules: SYNTHETIC_SALES_RULES,
    newId: newSyntheticId, now: () => SYNTHETIC_TIME, authorization: { async assertAllowed(context, action, document) {
      const fact = drafts.find(candidate => candidate.draft.header.id === document.header.id);
      ok(Boolean(fact) && (action === "SAVE" || action === "APPROVE"), "only reviewed native sales fixture setup actions");
      ok(context.accountId === fact!.fixture.accountId && context.hallId === fact!.fixture.hallId
        && document.header.hallId === fact!.draft.header.hallId && document.header.warehouseId === fact!.draft.header.warehouseId,
      "exact native sales fixture actor and target");
    } } });
  try {
    await fixtureSql(pool, "INSERT INTO naijue_erp.payment_account_hall(payment_account_id,hall_id) VALUES($1,$2)", [ids.payment, ids.otherHall]);
    for (const { fixture, draft } of drafts) {
      await service.execute({ actor: actor(fixture), action: "SAVE", expectedVersion: null, requestKey: `SYNTHETIC_NATIVE_${fixture.label}_SAVE`, draft });
      await service.execute({ actor: actor(fixture), action: "APPROVE", expectedVersion: version(1), requestKey: `SYNTHETIC_NATIVE_${fixture.label}_APPROVE`, salesId: draft.header.id });
    }
  } catch { throw new Error("Native synthetic sales setup failed; provider detail omitted"); }
  const facts = (await pool.query(`SELECT id,hall_id,created_by_account_id,created_hall_id,status FROM naijue_erp.sales_header
    WHERE id=ANY($1::uuid[]) ORDER BY id`, [[ownSalesId, foreignSalesId]])).rows;
  ok(facts.length === 2 && facts.every(row => { const fixture = row.id === ownSalesId ? own : foreign;
    return row.hall_id === fixture.hallId && row.created_by_account_id === fixture.accountId && row.created_hall_id === fixture.hallId
      && row.status === "APPROVED"; }), "service captured genuine A/B sales creator facts");
}

/** A third B warehouse is deliberately introduced AFTER published-scope inventory assertions.
 * No invented publication membership or stock baseline is added for this transfer-draft-only reference. */
async function seedTransfers(pool: Pool, foreign: LoginFixture): Promise<void> {
  await fixtureSql(pool, "INSERT INTO naijue_erp.warehouse(id,hall_id,name,enabled,version) VALUES($1,$2,'SYNTHETIC NATIVE B SECOND',true,1)", [thirdWarehouseId, ids.otherHall]);
  const base = transferDraft(6200, ["1"]);
  const draft = { ...base, header: { ...base.header, number: "SYNTHETIC_NATIVE_TRANSFER_SELLER_B",
    fromWarehouseId: ids.toWarehouse, toWarehouseId: thirdWarehouseId } };
  const service = createTransferService({ unitOfWork: new PostgresTransferUnitOfWork(pool), newId: newSyntheticId,
    now: () => SYNTHETIC_TIME, references: createSourceConfirmedTransferReferences(), authorization: { async assertAllowed(context, action, document) {
      ok(action === "SAVE" && document.header.id === hiddenTransferId, "only reviewed native transfer fixture SAVE");
      ok(context.accountId === foreign.accountId && context.hallId === foreign.hallId && context.role === foreign.role
        && document.header.fromWarehouseId === ids.toWarehouse && document.header.toWarehouseId === thirdWarehouseId,
      "exact native transfer fixture actor and endpoints");
    } } });
  try {
    await service.execute({ actor: { ...actor(foreign), role: foreign.role }, action: "SAVE", expectedVersion: null,
      requestKey: "SYNTHETIC_NATIVE_TRANSFER_SELLER_B_SAVE", draft });
  } catch { throw new Error("Native synthetic transfer setup failed; provider detail omitted"); }
  const facts = (await pool.query(`SELECT id,from_warehouse_id,to_warehouse_id,created_by_account_id,created_hall_id,created_role
    FROM naijue_erp.transfer_header WHERE id=$1`, [hiddenTransferId])).rows;
  ok(facts.length === 1 && facts[0]?.from_warehouse_id === ids.toWarehouse && facts[0]?.to_warehouse_id === thirdWarehouseId
    && facts[0]?.created_by_account_id === foreign.accountId && facts[0]?.created_hall_id === foreign.hallId && facts[0]?.created_role === foreign.role,
  "service captured genuine B-only endpoint and creator facts");
}

/** Fixed finite fixture-state comparison, not a production preload or authorization provider. No credential tables. */
async function snapshot(pool: Pool): Promise<string[]> {
  const result: string[] = [];
  for (const table of ["sales_header", "sales_line", "sales_settlement", "transfer_header", "transfer_line", "inventory_balance", "inventory_ledger",
    "operation_receipt", "audit_change", "product", "sku", "product_image", "import_batch", "import_record", "warehouse", "hall"] as const) {
    const digest = (await pool.query(`SELECT md5(coalesce(jsonb_agg(to_jsonb(facts) ORDER BY to_jsonb(facts)::text)::text,'[]')) AS digest
      FROM naijue_erp.${table} facts`)).rows[0]?.digest;
    if (typeof digest !== "string") throw new Error("Native synthetic business snapshot unavailable");
    result.push(digest);
  }
  return result;
}
async function unchanged(pool: Pool, before: readonly string[], message = "native-profile reads leave exact business fixture state unchanged"): Promise<void> {
  const after = await snapshot(pool);
  ok(after.length === before.length && after.every((digest, index) => digest === before[index]), message);
}
async function apiConnections(pool: Pool): Promise<number> {
  return (await pool.query(`SELECT count(*)::integer AS count FROM pg_catalog.pg_stat_activity
    WHERE datname=current_database() AND application_name='naijue-erp'`)).rows[0]?.count as number;
}
async function disconnected(pool: Pool): Promise<void> {
  const deadline = performance.now() + 3000; let count = await apiConnections(pool);
  while (count !== 0 && performance.now() < deadline) { await delay(25); count = await apiConnections(pool); }
  assert.equal(count, 0, "native-profile API-owned backend disconnects drained");
}

export async function runNativeHttpReadAcceptance(t: TestContext, pool: Pool, settings: IntegrationSettings): Promise<void> {
  const accounts = fixtures(); const [own, foreign, admin, warehouse] = accounts;
  let api: PostgresReadApi | undefined, ready = false;
  const close = async (): Promise<void> => { try { await api?.close(); } catch { throw new Error("Native-profile API cleanup failed; provider detail omitted"); } };
  t.after(close); t.after(() => { for (const fixture of accounts) { fixture.password = ""; fixture.cookie = ""; } });
  const post = (fixture: LoginFixture, url: string, payload: unknown, headers: Record<string, string> = {}) => api!.app.inject({
    method: "POST", url, payload: JSON.stringify(payload), headers: { "content-type": "application/json", origin: ORIGIN, cookie: fixture.cookie, ...headers } });
  const success = async (fixture: LoginFixture, url: string, payload: unknown) => {
    const response = await post(fixture, url, payload); assert.equal(response.statusCode, 200, `${url} status`);
    ok(response.headers["cache-control"] === "no-store" && response.headers.pragma === "no-cache", "native-profile response is private");
    return json(response);
  };

  await t.test(NATIVE_POLICY_SCENARIOS[0], async () => {
    assert.equal(await apiConnections(pool), 0);
    await seedAccounts(pool, accounts); await seedSales(pool, own, foreign);
    // No optional driver seam and no explicit provider bag: one genuine API-owned bounded pool selects the native profile.
    api = await createPostgresReadApi(nativeOptions(settings));
    assert.equal(api.app.server.listening, false); assert.equal(await apiConnections(pool), 0);
    for (const fixture of accounts) {
      const response = await post(fixture, "/auth/login", { loginName: fixture.login, password: fixture.password });
      assert.equal(response.statusCode, 200, "canonical-role native fixture login");
      const header = response.headers["set-cookie"];
      ok(typeof header === "string" && /; Path=\/; HttpOnly; Secure; SameSite=Strict; Expires=/.test(header)
        && !/(?:^|;\s*)Domain=/i.test(header), "native-profile secure host-only cookie");
      fixture.cookie = typeof header === "string" ? header.split(";")[0]! : "";
      ok(/^__Host-naijue_session=[A-Za-z0-9_-]{43}$/.test(fixture.cookie), "native-profile opaque cookie");
      const body = json(response);
      ok(body.principal.accountId === fixture.accountId && body.principal.role === fixture.role && body.principal.hallId === fixture.hallId,
        "actual authentication captured current canonical role and hall");
      ok(!response.body.includes(fixture.password) && !response.body.includes(fixture.cookie.split("=")[1]!), "native login JSON does not expose credentials");
      const session: LightMyRequestResponse = await api.app.inject({ method: "GET", url: "/auth/session", headers: { cookie: fixture.cookie } });
      assert.equal(session.statusCode, 200); ok(json(session).principal.accountId === fixture.accountId, "native role session persisted");
      fixture.password = "";
    }
    ready = true;
  });
  if (!ready || !api) throw new Error("Native-profile login/setup prerequisite failed; later native assertions not attempted");

  await t.test(NATIVE_POLICY_SCENARIOS[1], async () => {
    const before = await snapshot(pool);
    for (const fixture of accounts) {
      const restricted = fixture === own || fixture === foreign;
      const expectedId = fixture === foreign ? foreignSalesId : ownSalesId;
      const page = await success(fixture, "/sales/query", salesInput());
      ok(page.exactTotal === (restricted ? "1" : "2") && page.items.length === (restricted ? 1 : 2)
        && (!restricted || page.items[0].id === expectedId), "nonempty A/B native sales scope before count and page");
      const detail = await success(fixture, "/sales/detail/query", { salesId: expectedId });
      ok(detail.document.header.id === expectedId && detail.document.header.status === "APPROVED", "readable native sales detail");
      const history = await success(fixture, "/sales/history/query", { salesId: expectedId, page: 1, pageSize: 20 });
      ok(history.exactTotal === "2" && history.items.length === 2, "readable actual SAVE/APPROVE history");
      const references = await success(fixture, "/sales/references/query", { kind: "hall", search: "", page: 1, pageSize: 20 });
      ok(references.exactTotal === (restricted ? "1" : "2") && references.items.length === (restricted ? 1 : 2)
        && (!restricted || references.items[0].id === fixture.hallId), "native sales references exclude actual foreign-hall facts");
      const statistics = await success(fixture, "/sales/settlement-statistics/query", salesInput());
      ok(statistics.exactApprovedDocuments === (restricted ? "1" : "2")
        && statistics.received === (fixture === own ? "125" : fixture === foreign ? "250" : "375") && statistics.refunded === "0",
      "nonempty approved A/B sales amounts are scoped before statistics");
      // Prepared engine coverage only until this gated isolated suite is executed.
      // A's values deliberately occur second, so dropping to first cannot pass.
      const multi: SalesListQuery = { ...salesInput(), filter: { ...salesInput().filter,
        statuses: ["VOID", "APPROVED"], businessTypes: ["EXCHANGE", "SALE"], hallIds: [ids.otherHall, ids.hall],
        salespersonIds: [foreign.staffId, own.staffId], customerIds: [syntheticId("customer", 6990), ids.customer],
        warehouseIds: [ids.toWarehouse, ids.warehouse] } };
      const selected = await success(fixture, "/sales/query", multi);
      ok(selected.exactTotal === page.exactTotal && selected.items.length === page.items.length
        && (!restricted || selected.items[0].id === expectedId), "all six multi-select dimensions intersect unchanged native scope");
      const selectedStatistics = await success(fixture, "/sales/settlement-statistics/query", multi);
      ok(selectedStatistics.exactApprovedDocuments === statistics.exactApprovedDocuments
        && selectedStatistics.received === statistics.received && selectedStatistics.refunded === statistics.refunded,
      "multi-select list and statistics share the exact native authorized scope");
      const mismatch = { ...multi, filter: { ...multi.filter, businessTypes: ["RETURN", "EXCHANGE"] } };
      const mismatchedList = await success(fixture, "/sales/query", mismatch);
      const mismatchedStatistics = await success(fixture, "/sales/settlement-statistics/query", mismatch);
      ok(mismatchedList.exactTotal === "0" && mismatchedList.items.length === 0
        && mismatchedStatistics.exactApprovedDocuments === "0" && mismatchedStatistics.received === "0",
      "one unmatched dimension excludes sales from list and approved statistics alike");
      if (!restricted) ok((await success(fixture, "/sales/detail/query", { salesId: foreignSalesId })).document.header.id === foreignSalesId,
        "ADMIN/WAREHOUSE native grant includes actual other-hall sales");
    }
    for (const [fixture, hidden] of [[own, foreignSalesId], [foreign, ownSalesId]] as const) {
      assert.equal((await post(fixture, "/sales/detail/query", { salesId: hidden })).statusCode, 404);
      assert.equal((await post(fixture, "/sales/history/query", { salesId: hidden, page: 1, pageSize: 20 })).statusCode, 404);
    }
    const overridden = await success(own, "/sales/query", { ...salesInput(), filter: { ...salesInput().filter, hallIds: [ids.otherHall] } });
    ok(overridden.exactTotal === "0" && overridden.items.length === 0, "request foreign-hall filter never expands native grant");
    await unchanged(pool, before);
  });

  await t.test(NATIVE_POLICY_SCENARIOS[2], async () => {
    // Controlled fixture maintenance, outside all read-only state comparisons. The caller's own A hall stays active.
    await fixtureSql(pool, "UPDATE naijue_erp.warehouse SET enabled=false WHERE id=$1", [ids.toWarehouse]);
    await fixtureSql(pool, "UPDATE naijue_erp.hall SET enabled=false WHERE id=$1", [ids.otherHall]);
    try {
      const before = await snapshot(pool);
      for (const fixture of [own, admin, warehouse]) {
        const inventory = await success(fixture, "/inventory/query", inventoryInput());
        ok(inventory.exactTotalProducts === 1 && inventory.products.length === 1 && inventory.warehouseLabels.length === 2
          && inventory.allMatchesTotal.knownQuantity === "4", "all-warehouse native inventory includes actual A/B quantities");
        ok(inventory.products[0].colorFits.every((variant: { rows: { warehouse: { id: string } }[] }) => variant.rows.length === 2
          && variant.rows.some(row => row.warehouse.id === ids.toWarehouse)), "salesperson retains other-hall disabled historical warehouse rows");
        const candidates = await success(fixture, "/inventory/candidates/query", { kind: "warehouse", search: "", page: 1, pageSize: 20, selectedIds: [], categoryId: null });
        ok(candidates.exactTotal === 2 && candidates.items.length === 2 && candidates.items.some((item: { id: string }) => item.id === ids.toWarehouse),
          "native candidates retain disabled other-hall warehouse identity");
        const ledger = await success(fixture, "/inventory/ledger/query", { warehouseId: ids.toWarehouse, skuId: ids.sku, pageSize: 20, after: null });
        ok(ledger.warehouse.id === ids.toWarehouse && ledger.entries.some((entry: { source: { kind: string; salesId?: string } }) => entry.source.kind === "SALES"
          && entry.source.salesId === foreignSalesId), "native salesperson can read actual other-hall ledger provenance");
        const basics = await success(fixture, "/products/basics/query", { productId: ids.product });
        const specs = await success(fixture, "/products/specifications/query", { productId: ids.product });
        ok(basics.productId === ids.product && specs.productId === ids.product && specs.skus.length === 3, "shared business-page product reads use exact native target");
        for (const [url, payload] of [["/products/images/query", { productId: ids.product }], ["/products/image/query", { productId: ids.product, imageId: ids.image }]] as const)
          assert.equal((await post(fixture, url, payload)).statusCode, 501);
      }
      assert.equal((await post(foreign, "/products/basics/query", { productId: ids.product })).statusCode, 401, "disabled own hall rejects current HTTP identity");
      const absent = await success(own, "/products/basics/query", { productId: syntheticId("product", 6399) });
      ok(absent === null, "exact native product query does not invent a nonexistent target");
      assert.equal((await post(own, "/products/image/query", { productId: ids.product, imageId: syntheticId("product", 6398) })).statusCode, 404);
      assert.equal((await post(own, "/products/image/query", { productId: syntheticId("product", 6399), imageId: ids.image })).statusCode, 404,
        "an existing image cannot be borrowed through a different exact product target");
      await unchanged(pool, before);
    } finally {
      await fixtureSql(pool, "UPDATE naijue_erp.hall SET enabled=true WHERE id=$1", [ids.otherHall]);
      await fixtureSql(pool, "UPDATE naijue_erp.warehouse SET enabled=true WHERE id=$1", [ids.toWarehouse]);
    }
  });

  await t.test(NATIVE_POLICY_SCENARIOS[3], async () => {
    await seedTransfers(pool, foreign);
    const before = await snapshot(pool);
    for (const fixture of accounts) {
      const page = await success(fixture, "/transfers/query", transferInput());
      ok(page.exactTotal === (fixture === own ? "0" : "1") && page.items.length === (fixture === own ? 0 : 1),
        "canonical transfer scope excludes an actual B-only draft from A while other authorized roles see it");
      if (fixture !== own) {
        const visible = await success(fixture, "/transfers/detail/query", { transferId: hiddenTransferId });
        ok(visible.document.header.fromWarehouseId === ids.toWarehouse && visible.document.header.toWarehouseId === thirdWarehouseId,
          "actual B-only transfer detail endpoints, not an empty foreign scope");
      }
      const references = await success(fixture, "/transfers/warehouses/query", { search: "", selectedIds: [thirdWarehouseId], page: 1, pageSize: 20 });
      ok(references.exactTotal === (fixture === own ? "0" : "1") && references.items.length === (fixture === own ? 0 : 1)
        && (fixture === own || references.items[0].id === thirdWarehouseId), "canonical readable-transfer reference scope uses actual endpoints");
    }
    assert.equal((await post(own, "/transfers/detail/query", { transferId: hiddenTransferId })).statusCode, 404);
    ok((await success(own, "/transfers/detail/query", { transferId: syntheticId("transfer", 4600) })).document.header.id === syntheticId("transfer", 4600),
      "canonical own-endpoint branch remains visible independently of the B-only fixture");
    // The unchanged reader explicitly rejects an authorized warehouse absent from the immutable published scope.
    const notReady = await post(own, "/inventory/query", inventoryInput());
    assert.equal(notReady.statusCode, 503);
    ok(json(notReady).error.code === "INVENTORY_NOT_READY", "all-warehouse grant does not invent readiness for later unpublished transfer-only warehouse");
    await unchanged(pool, before);
  });

  await t.test(NATIVE_POLICY_SCENARIOS[4], async () => {
    const before = await snapshot(pool);
    const stale = Object.freeze(actor(own)); // Capture the authenticated A identity before controlled fixture changes.
    const rejectHttp = async (): Promise<void> => {
      for (const [url, payload] of [["/sales/query", salesInput()], ["/inventory/query", inventoryInput()], ["/products/basics/query", { productId: ids.product }],
        ["/transfers/query", transferInput()]] as const) assert.equal((await post(own, url, payload)).statusCode, 401);
    };
    try {
      await fixtureSql(pool, "UPDATE naijue_erp.user_account SET login_enabled=false WHERE id=$1", [own.accountId]); await rejectHttp();
      await fixtureSql(pool, "UPDATE naijue_erp.user_account SET login_enabled=true WHERE id=$1", [own.accountId]);
      await fixtureSql(pool, "UPDATE naijue_erp.staff SET employment_status='SYNTHETIC_NOT_ACTIVE' WHERE id=$1", [own.staffId]); await rejectHttp();
      await fixtureSql(pool, "UPDATE naijue_erp.staff SET employment_status='在职',role='SYNTHETIC_UNKNOWN' WHERE id=$1", [own.staffId]); await rejectHttp();
      await fixtureSql(pool, "UPDATE naijue_erp.staff SET role='SALESPERSON',hall_id=$2 WHERE id=$1", [own.staffId, ids.otherHall]);
      // SUPPLEMENTAL ADAPTER CASE ONLY: the captured A actor was authenticated before this controlled hall change.
      // Genuine PG policy on the guarded harness pool must reject it; this is not public HTTP race coverage.
      const policies = createSourceConfirmedPostgresReadAuthorization(pool);
      const signal = new AbortController().signal;
      for (const attempt of [() => policies.sales.authorize(stale, { kind: "list", parameters: salesInput() }, signal),
        () => policies.inventory.authorize(stale, { kind: "inventory", parameters: { page: 1, pageSize: 100,
          filter: { productIds: [], categoryId: null, warehouseIds: [], supplierIds: [], fitIds: [], seasonIds: [] } } }, signal),
        () => policies.products.authorize(stale, { kind: "basics", parameters: { productId: ids.product } }, signal)]) {
        let rejected = false;
        try { await attempt(); } catch (error) { rejected = error instanceof Error && "code" in error && error.code === "FORBIDDEN"; }
        ok(rejected, "genuine-PG native policy rejects explicitly stale captured hall without leaking provider errors");
      }
      await fixtureSql(pool, "UPDATE naijue_erp.staff SET hall_id=$2 WHERE id=$1", [own.staffId, ids.hall]);
      await fixtureSql(pool, "UPDATE naijue_erp.hall SET enabled=false WHERE id=$1", [ids.hall]); await rejectHttp();
    } finally {
      await fixtureSql(pool, "UPDATE naijue_erp.hall SET enabled=true WHERE id=$1", [ids.hall]);
      await fixtureSql(pool, "UPDATE naijue_erp.staff SET employment_status='在职',role='SALESPERSON',hall_id=$2 WHERE id=$1", [own.staffId, ids.hall]);
      await fixtureSql(pool, "UPDATE naijue_erp.user_account SET login_enabled=true WHERE id=$1", [own.accountId]);
    }
    const restored: LightMyRequestResponse = await api!.app.inject({ method: "GET", url: "/auth/session", headers: { cookie: own.cookie } });
    assert.equal(restored.statusCode, 200);
    ok(json(restored).principal?.accountId === own.accountId && json(restored).principal.hallId === ids.hall
      && json(restored).principal.role === "SALESPERSON", "controlled identity maintenance restores the original current authenticated fixture");
    await unchanged(pool, before, "controlled identity/hall maintenance has restored the terminal business-reference snapshot; not a write-free interval claim");
  });

  await t.test(NATIVE_POLICY_SCENARIOS[5], async () => {
    const before = await snapshot(pool);
    for (const fixture of accounts) {
      const logout = await post(fixture, "/auth/logout", {}); assert.equal(logout.statusCode, 204);
      const session = await api!.app.inject({ method: "GET", url: "/auth/session", headers: { cookie: fixture.cookie } });
      assert.equal(session.statusCode, 200); ok(json(session).principal === null, "native-profile logout revokes each actual role session");
      for (const [url, payload] of [["/sales/query", salesInput()], ["/inventory/query", inventoryInput()],
        ["/transfers/query", transferInput()], ["/products/basics/query", { productId: ids.product }]] as const)
        assert.equal((await post(fixture, url, payload)).statusCode, 401);
    }
    assert.equal((await pool.query(`SELECT count(*)::integer AS count FROM naijue_erp.auth_session
      WHERE account_id=ANY($1::uuid[]) AND revoked_at IS NOT NULL`, [accounts.map(fixture => fixture.accountId)])).rows[0]?.count, 4);
    await unchanged(pool, before); assert.equal(api!.postgresBackgroundFailureCount, 0);
    await close(); await close(); await disconnected(pool);
    assert.equal(api!.app.server.listening, false);
  });
  t.diagnostic("Native source-confirmed profile assertions are actual policy-engine evidence only after this exact guarded fresh-PG suite executes. Original explicit-test-policy groups remain separate. Synthetic facts; Fastify.inject only. Supplemental stale-actor cases call genuine PG adapters, not a public HTTP race. No successful inventory readiness claim after the later unpublished transfer-only warehouse, and no listener/browser/TLS/real-data/media/performance/production acceptance.");
}
