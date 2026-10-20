/** DORMANT actual PostgreSQL + Fastify.inject acceptance. Only the already-gated backend runner may call this.
 * No socket/browser/TLS acceptance. Every identity/policy fact below is synthetic, NOT a production provider. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { TestContext } from "node:test";
import type { Pool } from "pg";
import { createPostgresReadApi } from "../../apps/api/src/postgres-read-api.ts";
import type { PostgresReadApi, PostgresReadApiOptions } from "../../apps/api/src/postgres-read-api.ts";
import type { BoundedPostgresConfig } from "../../adapters/postgres/src/bounded-pool.ts";
import type { ActorContext } from "../../packages/application/src/ports.ts";
import { createNodeScryptPasswords } from "../../packages/authentication/src/passwords.ts";
import { sessionTokenHash } from "../../packages/authentication/src/service.ts";
import { DomainError } from "../../packages/domain/src/errors.ts";
import { ids, syntheticId, SYNTHETIC_TIME } from "./fixtures.ts";
import { HTTP_READ_SCENARIOS } from "./migration-manifest.ts";
import type { IntegrationSettings } from "./safety.ts";

/** Parsing failures must not let Node include any credential-bearing response excerpt in TAP. */
function json(response: { readonly body: string }): ReturnType<typeof JSON.parse> {
  try { return JSON.parse(response.body); }
  catch { throw new Error("Synthetic HTTP response was not valid JSON; response detail omitted"); }
}

const ORIGIN = "https://synthetic-inject-only.invalid";
const LOGIN = "SYNTHETIC_HTTP_ONLY_DISPOSABLE_LOGIN";
const EMPLOYMENT = "SYNTHETIC_HTTP_ACTIVE_ONLY";
const accountId = syntheticId("account", 4700), staffId = syntheticId("staff", 4701);
const salesId = syntheticId("sales", 4400), transferId = syntheticId("transfer", 4600);
const salesInput = () => ({ filter: { startDate: null, endDate: null, status: null, businessType: null,
  hallId: null, salespersonId: null, customerId: null, warehouseId: null, number: "SYNTHETIC_PG_SALES_4400" }, page: 1, pageSize: 20 });
const transferInput = () => ({ filter: { startDate: null, endDate: null, statuses: [], fromWarehouseIds: [],
  toWarehouseIds: [], number: "SYNTHETIC_PG_TRANSFER_4600" }, page: 1, pageSize: 20 });
const inventoryInput = (warehouseId = ids.warehouse) => ({ filter: { products: [{ id: ids.product, label: "SYNTHETIC ONLY PRODUCT" }],
  category: null, warehouses: [{ id: warehouseId, label: "CLIENT LABEL IS NOT A GRANT" }], suppliers: [], fits: [], seasons: [] }, page: 1, pageSize: 100 });

/** Caller supplies the SAME validated target after all existing runner/freshness/hash gates.
 * No env, URL, ambient driver setting, discovery or default target is consulted here. */
function boundedTarget(settings: IntegrationSettings): BoundedPostgresConfig {
  return { target: { host: settings.host, port: settings.port, database: settings.database, user: settings.user,
    password: settings.password, ssl: false }, max: 2, maxPendingAcquisitions: 4, connectionTimeoutMillis: 3000,
    acquisitionTimeoutMillis: 5000, queryTimeoutMillis: 15000, statementTimeoutMillis: 12000, lockTimeoutMillis: 4000,
    idleInTransactionTimeoutMillis: 20000, idlePoolTimeoutMillis: 1000, disposeGraceMillis: 1000, disposeTimeoutMillis: 5000 };
}

/** Explicit fixture policy, not role/business authorization approval. The alternate fixed hall tests native scope exclusion.
 * Never derive a grant from client labels, request actor/role, selected IDs, headers or an unknown account. */
function fixtureOptions(settings: IntegrationSettings, hidden = false, recordAuthorization: () => void): PostgresReadApiOptions {
  const verifyActor = (actor: ActorContext): void => {
    if (actor.accountId !== accountId || actor.hallId !== ids.hall) throw new DomainError("FORBIDDEN", "Synthetic fixture identity rejected");
    recordAuthorization();
  };
  return { postgres: boundedTarget(settings), authentication: { trustedOrigin: ORIGIN, now: () => SYNTHETIC_TIME,
    policy: { sessionTtlSeconds: 900, activeEmploymentStatuses: [EMPLOYMENT], roleHallScopes: { SALESPERSON: "REQUIRED_HALL" },
      assertNewPassword() { throw new Error("Password changes are outside this synthetic read acceptance"); } } },
    authorization: {
      inventory: { async authorize(actor) { verifyActor(actor); return { hallIds: [ids.hall],
        warehouses: [{ id: ids.warehouse, hallId: ids.hall, label: "SYNTHETIC ONLY FROM" }] }; } },
      sales: { async authorize(actor) { verifyActor(actor); return { kind: "restricted", clauses: [{ hallId: hidden ? ids.otherHall : ids.hall }] }; } },
      transfers: { async authorize(actor) { verifyActor(actor);
        if (actor.role !== "SALESPERSON") throw new DomainError("FORBIDDEN", "Synthetic fixture role rejected");
        return { kind: "restricted", clauses: [{ fromHallId: hidden ? ids.otherHall : ids.hall }] }; } },
      products: { async authorize(actor, intent) { verifyActor(actor);
        if (hidden || intent.parameters.productId !== ids.product) throw new DomainError("FORBIDDEN", "Synthetic fixture product rejected");
        return { productId: ids.product }; } }
    }, productMedia: null };
}

/** Only INSERT this separate test account; the earlier disabled fixture remains untouched.
 * Generated password exists only in this test process. Only the actual scrypt hash goes to ordinary auth storage.
 * Sanitize setup errors because PostgreSQL constraint detail could otherwise include a hash in a failing row. */
async function seedDisposableLogin(pool: Pool, password: string): Promise<void> {
  const passwordHash = await createNodeScryptPasswords().hash(password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO naijue_erp.staff(id,name,hall_id,role,employment_status,version)
      VALUES($1,'SYNTHETIC HTTP ONLY STAFF',$2,'SALESPERSON',$3,1)`, [staffId, ids.hall, EMPLOYMENT]);
    await client.query(`INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
      VALUES($1,$2,$3,$4,true,1,1,$5,$5)`, [accountId, staffId, LOGIN, passwordHash, SYNTHETIC_TIME]);
    await client.query("COMMIT");
  } catch {
    try { await client.query("ROLLBACK"); } catch { /* Discarded below; never retain driver text or a failing row. */ }
    throw new Error("Synthetic HTTP account setup failed; database detail omitted");
  } finally { client.release(true); }
}

async function apiConnections(pool: Pool): Promise<number> {
  return (await pool.query(`SELECT count(*)::integer AS count FROM pg_catalog.pg_stat_activity
    WHERE datname=current_database() AND application_name='naijue-erp'`)).rows[0]?.count as number;
}
/** pg-pool end can settle before PostgreSQL has removed its backend from pg_stat_activity.
 * Observe only that disconnect drain, for a finite interval. Never retry a close, write or failed query. */
async function assertApiDisconnected(pool: Pool): Promise<void> {
  const deadline = performance.now() + 3000;
  let remaining = await apiConnections(pool);
  while (remaining !== 0 && performance.now() < deadline) {
    await delay(25);
    remaining = await apiConnections(pool);
  }
  assert.equal(remaining, 0, "all API-owned actual PostgreSQL connections are closed");
}
/** Fixed finite synthetic fixture tables only, not a production/preload path. Exclude auth accounts/sessions on purpose.
 * Digest exact row contents as well as membership, so existing lines, quantities or balances cannot change unnoticed.
 * The SQL contains only these reviewed constant table identifiers; never a request/config-supplied identifier. */
async function businessSnapshot(pool: Pool): Promise<readonly string[]> {
  const digests: string[] = [];
  for (const table of ["sales_header", "sales_line", "sales_settlement", "transfer_header", "transfer_line", "inventory_balance",
    "inventory_ledger", "operation_receipt", "audit_change", "product", "sku", "product_image", "import_batch", "import_record"] as const) {
    const row = (await pool.query(`SELECT md5(coalesce(jsonb_agg(to_jsonb(facts) ORDER BY to_jsonb(facts)::text)::text,'[]')) AS digest
      FROM naijue_erp.${table} facts`)).rows[0]!;
    if (typeof row.digest !== "string") throw new Error("Synthetic business snapshot was unavailable");
    digests.push(row.digest);
  }
  return digests;
}

export async function runHttpReadAcceptance(t: TestContext, pool: Pool, settings: IntegrationSettings): Promise<void> {
  // Neither credential is fixed, taken from another account, sent in argv nor persisted in a source/evidence file.
  let password = randomBytes(32).toString("base64url"), cookie = "", tokenHash = "";
  let authorizationCalls = 0, loginVerified = false;
  const owned: PostgresReadApi[] = [];
  const closeOwned = async (): Promise<void> => {
    const results = await Promise.allSettled(owned.map(async api => { await api.close(); }));
    if (results.some(result => result.status === "rejected")) throw new Error("Synthetic HTTP API cleanup failed; provider detail omitted");
  };
  t.after(closeOwned);
  t.after(() => { password = ""; cookie = ""; tokenHash = ""; });
  const before = await businessSnapshot(pool);
  const post = (api: PostgresReadApi, url: string, payload: unknown, headers: Record<string, string> = {}) => api.app.inject({
    method: "POST", url, payload: JSON.stringify(payload), headers: { "content-type": "application/json", origin: ORIGIN, cookie, ...headers }
  });
  // This assertion never serializes a response, credential-bearing header or connection configuration on failure.
  const ok = (value: boolean, message: string): void => { assert.equal(value, true, message); };
  const successful = async (api: PostgresReadApi, url: string, payload: unknown) => {
    const response = await post(api, url, payload); assert.equal(response.statusCode, 200, `${url} status`);
    ok(response.headers["cache-control"] === "no-store" && response.headers.pragma === "no-cache", `${url} private response headers`);
    return response;
  };

  let api!: PostgresReadApi;
  await t.test(HTTP_READ_SCENARIOS[0], async () => {
    assert.equal(await apiConnections(pool), 0);
    await seedDisposableLogin(pool, password);
    // Intentionally NO driver-factory argument: the composition uses its actual pg-backed bounded pool.
    api = await createPostgresReadApi(fixtureOptions(settings, false, () => { authorizationCalls++; })); owned.push(api);
    assert.equal(api.app.server.listening, false); assert.equal(await apiConnections(pool), 0);
    const absent = await api.app.inject({ method: "GET", url: "/auth/session" });
    assert.equal(absent.statusCode, 200); ok(json(absent).principal === null, "no ambient login");
    const wrong = await post(api, "/auth/login", { loginName: LOGIN, password: randomBytes(32).toString("base64url") });
    assert.equal(wrong.statusCode, 401); ok(json(wrong).error.code === "INVALID_CREDENTIALS", "actual codec rejects wrong password");
    assert.equal((await pool.query("SELECT count(*)::integer AS count FROM naijue_erp.auth_session WHERE account_id=$1", [accountId])).rows[0]?.count, 0);
    const disabled = await post(api, "/auth/login", { loginName: "SYNTHETIC_DISABLED_NONLOGIN_ACCOUNT", password });
    assert.equal(disabled.statusCode, 401);
    const login = await post(api, "/auth/login", { loginName: LOGIN, password });
    assert.equal(login.statusCode, 200);
    const setCookie = login.headers["set-cookie"];
    ok(typeof setCookie === "string" && /; Path=\/; HttpOnly; Secure; SameSite=Strict; Expires=/.test(setCookie)
      && !/(?:^|;\s*)Domain=/i.test(setCookie), "secure host-only session cookie");
    cookie = typeof setCookie === "string" ? setCookie.split(";")[0]! : "";
    const token = cookie.slice(cookie.indexOf("=") + 1);
    ok(/^__Host-naijue_session=[A-Za-z0-9_-]{43}$/.test(cookie), "opaque cookie format");
    const hash = sessionTokenHash(token); ok(typeof hash === "string", "actual token hash format"); tokenHash = hash!;
    ok(!login.body.includes(token) && !login.body.includes(password), "login JSON must not disclose a credential");
    ok(json(login).principal.accountId === accountId && json(login).principal.staffId === staffId
      && json(login).principal.hallId === ids.hall && json(login).principal.role === "SALESPERSON", "current synthetic principal");
    const current = await api.app.inject({ method: "GET", url: "/auth/session", headers: { cookie } });
    assert.equal(current.statusCode, 200); ok(json(current).principal.accountId === accountId, "persisted session resolves through actual store");
    const stored = (await pool.query(`SELECT count(*)::integer AS count FROM naijue_erp.auth_session
      WHERE account_id=$1 AND token_hash=$2 AND auth_version=1 AND revoked_at IS NULL`, [accountId, tokenHash])).rows[0]?.count;
    assert.equal(stored, 1); assert.equal(authorizationCalls, 0);
    password = "";
    loginVerified = true;
  });

  // An earlier failed prerequisite must never produce misleading successful read acceptance.
  if (!loginVerified || !api || !cookie) throw new Error("Synthetic HTTP login prerequisite failed; reads were not attempted");

  await t.test(HTTP_READ_SCENARIOS[1], async () => {
    const inventory = await successful(api, "/inventory/query", inventoryInput()); const data = json(inventory);
    ok(inventory.headers["x-inventory-readiness"] === "ready" && typeof inventory.headers["x-inventory-read-reference"] === "string", "published inventory snapshot headers");
    ok(data.exactTotalProducts === 1 && data.products.length === 1 && data.products[0].id === ids.product, "bounded native product matrix");
    ok(data.warehouseLabels.length === 1 && data.warehouseLabels[0] === "SYNTHETIC ONLY FROM", "trusted warehouse names, not client label");
    ok(data.allMatchesTotal.knownQuantity === "0" && data.allMatchesTotal.completeness === "complete", "exact restored synthetic inventory total");
    const variants = data.products[0].colorFits;
    ok(variants.length === 2 && variants.every((variant: { rows: { warehouse: { id: string } }[] }) => variant.rows.length === 1
      && variant.rows[0]?.warehouse.id === ids.warehouse), "no out-of-scope warehouse matrix rows");
    const candidates = await successful(api, "/inventory/candidates/query", { kind: "warehouse", search: "", page: 1, pageSize: 20, selectedIds: [], categoryId: null });
    ok(json(candidates).exactTotal === 1 && json(candidates).items.length === 1 && json(candidates).items[0].id === ids.warehouse, "bounded scoped warehouse candidates");
    const ledger = await successful(api, "/inventory/ledger/query", { warehouseId: ids.warehouse, skuId: ids.sku, pageSize: 2, after: null });
    const page = json(ledger);
    ok(page.warehouse.id === ids.warehouse && page.sku.id === ids.sku && page.entries.length === 2 && page.nextCursor !== null, "bounded real ledger keyset page");
    const next = await successful(api, "/inventory/ledger/query", { warehouseId: ids.warehouse, skuId: ids.sku, pageSize: 2, after: page.nextCursor });
    ok(json(next).entries.length > 0 && json(next).entries.length <= 2 && json(next).entries.every((entry: { id: string }) => !page.entries.some((previous: { id: string }) => previous.id === entry.id)), "ledger next page does not replay previous entries");
  });

  await t.test(HTTP_READ_SCENARIOS[2], async () => {
    const sales = await successful(api, "/sales/query", salesInput());
    ok(json(sales).exactTotal === "1" && json(sales).items.length === 1 && json(sales).items[0].id === salesId && json(sales).items[0].netDue === "625", "exact bounded sales list and bigint serialization");
    const detail = await successful(api, "/sales/detail/query", { salesId });
    ok(json(detail).document.header.id === salesId && json(detail).document.lines.length === 2 && json(detail).document.header.version === 3, "current saved sales detail");
    const history = await successful(api, "/sales/history/query", { salesId, page: 1, pageSize: 20 });
    ok(json(history).exactTotal === "3" && json(history).items.length === 3, "actual audit history through HTTP");
    const references = await successful(api, "/sales/references/query", { kind: "warehouse", search: "", page: 1, pageSize: 20 });
    ok(json(references).exactTotal === "1" && json(references).items.length === 1 && json(references).items[0].id === ids.warehouse, "sales reference candidates stay within readable documents");
    const statistics = await successful(api, "/sales/settlement-statistics/query", salesInput());
    ok(json(statistics).exactApprovedDocuments === "0" && json(statistics).received === "0" && json(statistics).refunded === "0", "unapproved flow excluded from statistics");
    const transfers = await successful(api, "/transfers/query", transferInput());
    ok(json(transfers).exactTotal === "1" && json(transfers).items.length === 1 && json(transfers).items[0].id === transferId, "bounded native transfer list");
    const transfer = await successful(api, "/transfers/detail/query", { transferId });
    ok(json(transfer).document.header.id === transferId && json(transfer).document.header.version === 2 && json(transfer).document.lines.length === 2, "current swapped transfer detail");
    const warehouses = await successful(api, "/transfers/warehouses/query", { search: "", selectedIds: [], page: 1, pageSize: 20 });
    ok(json(warehouses).exactTotal === "2" && json(warehouses).items.length === 2
      && json(warehouses).items.every((item: { id: string }) => [ids.warehouse, ids.toWarehouse].includes(item.id as typeof ids.warehouse)), "transfer references are endpoints of readable documents");
    const basics = await successful(api, "/products/basics/query", { productId: ids.product });
    ok(json(basics).productId === ids.product && json(basics).yearLabel === "2026", "native product basics");
    const specs = await successful(api, "/products/specifications/query", { productId: ids.product });
    ok(json(specs).skus.length === 3 && json(specs).sizes.length === 2, "bounded native product specifications");
    const unavailable = await post(api, "/products/images/query", { productId: ids.product });
    assert.equal(unavailable.statusCode, 501); ok(json(unavailable).error.code === "PRODUCT_MEDIA_NOT_IMPLEMENTED", "metadata does not invent media delivery");
    const original = await post(api, "/products/image/query", { productId: ids.product, imageId: ids.image });
    assert.equal(original.statusCode, 501); ok(json(original).error.code === "PRODUCT_MEDIA_NOT_IMPLEMENTED", "native image metadata is not an original-media delivery implementation");
    const beyond = await successful(api, "/sales/query", { ...salesInput(), page: 2 });
    ok(json(beyond).exactTotal === "1" && json(beyond).items.length === 0, "page beyond end preserves exact total");
  });

  await t.test(HTTP_READ_SCENARIOS[3], async () => {
    assert.equal((await post(api, "/inventory/query", inventoryInput(ids.toWarehouse))).statusCode, 403);
    assert.equal((await post(api, "/inventory/ledger/query", { warehouseId: ids.toWarehouse, skuId: ids.sku, pageSize: 20, after: null })).statusCode, 403);
    assert.equal((await post(api, "/products/basics/query", { productId: syntheticId("product", 4799) })).statusCode, 403);
    const hidden = await createPostgresReadApi(fixtureOptions(settings, true, () => { authorizationCalls++; })); owned.push(hidden);
    const hiddenSales = await successful(hidden, "/sales/query", salesInput());
    ok(json(hiddenSales).exactTotal === "0" && json(hiddenSales).items.length === 0, "native sales scope precedes count/page");
    assert.equal((await post(hidden, "/sales/detail/query", { salesId })).statusCode, 404);
    assert.equal((await post(hidden, "/sales/history/query", { salesId, page: 1, pageSize: 20 })).statusCode, 404);
    const hiddenTransfers = await successful(hidden, "/transfers/query", transferInput());
    ok(json(hiddenTransfers).exactTotal === "0" && json(hiddenTransfers).items.length === 0, "native transfer scope precedes count/page");
    assert.equal((await post(hidden, "/transfers/detail/query", { transferId })).statusCode, 404);
    await hidden.close();
    const policyCount = authorizationCalls;
    for (const headers of [{ cookie: "" }, { cookie: "__Host-naijue_session=bad" }, { authorization: "Bearer SYNTHETIC_NOT_A_TOKEN" },
      { origin: "https://spoofed.invalid" }, { origin: "" }, { "sec-fetch-site": "cross-site" },
      { cookie: `${cookie}; ${cookie}` }, { origin: "https://spoofed.invalid", host: "synthetic-inject-only.invalid", "x-forwarded-host": "synthetic-inject-only.invalid", "x-forwarded-proto": "https" }]) {
      assert.equal((await post(api, "/products/basics/query", { productId: ids.product }, headers)).statusCode, 401);
    }
    assert.equal(authorizationCalls, policyCount, "spoofed authentication must not reach business policy");
    assert.equal((await post(api, "/sales/query", { ...salesInput(), actor: { accountId: ids.account, hallId: ids.otherHall }, role: "ADMIN" })).statusCode, 400);
    assert.equal((await post(api, "/transfers/query", { ...transferInput(), scope: { kind: "all" } })).statusCode, 400);
    const crossOrigin = await post(api, "/auth/logout", {}, { origin: "https://spoofed.invalid" });
    assert.equal(crossOrigin.statusCode, 403);
    const stillCurrent = await api.app.inject({ method: "GET", url: "/auth/session", headers: { cookie } });
    ok(json(stillCurrent).principal?.accountId === accountId, "rejected cross-origin logout cannot revoke session");
  });

  await t.test(HTTP_READ_SCENARIOS[4], async () => {
    const logout = await post(api, "/auth/logout", {}); assert.equal(logout.statusCode, 204);
    ok(typeof logout.headers["set-cookie"] === "string" && logout.headers["set-cookie"].includes("Max-Age=0"), "logout clears host cookie after confirmed revocation");
    const revoked = (await pool.query(`SELECT count(*)::integer AS count FROM naijue_erp.auth_session
      WHERE account_id=$1 AND token_hash=$2 AND revoked_at IS NOT NULL`, [accountId, tokenHash])).rows[0]?.count;
    assert.equal(revoked, 1);
    const current = await api.app.inject({ method: "GET", url: "/auth/session", headers: { cookie } });
    ok(json(current).principal === null, "revoked stored session no longer authenticates");
    const count = authorizationCalls;
    for (const [url, payload] of [["/inventory/query", inventoryInput()], ["/sales/query", salesInput()], ["/transfers/query", transferInput()],
      ["/products/basics/query", { productId: ids.product }]] as const) assert.equal((await post(api, url, payload)).statusCode, 401);
    assert.equal(authorizationCalls, count, "revoked session cannot reach any read policy");
    const after = await businessSnapshot(pool);
    ok(after.length === before.length && after.every((digest, index) => digest === before[index]), "native business fixture facts, receipts, audits and balances remain unchanged");
    assert.equal(api.postgresBackgroundFailureCount, 0);
    await closeOwned(); await closeOwned();
    await assertApiDisconnected(pool);
    ok(owned.every(value => value.app.server.listening === false), "no listening socket was opened");
    cookie = ""; tokenHash = "";
  });
  t.diagnostic("Actual auth-service/scrypt + native PostgreSQL HTTP-plugin assertions count as engine evidence only when this explicit suite runs. Fastify.inject only; synthetic test policies, no listening socket/browser/TLS, production grants, real data/media, performance or deployment acceptance.");
}
