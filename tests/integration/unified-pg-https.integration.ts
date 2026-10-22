/** Genuine PG + HTTPS application composition with synthetic schema1–11 prerequisites.
 * Actual password/session/native business/reader SQL; no fake driver or auth. Not a browser/real-data/HISTORY import acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { request } from "node:https";
import { mkdtemp, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import type { IncomingHttpHeaders } from "node:http";
import { integrationSettings } from "./safety.ts";
import { openFreshHistoryDatabase } from "./history-database.ts";
import { readNativeSalesSchema11Source, seedNativeSalesSchema11Fixture, publishNativeSalesSchema11Fixture, saleIds, SALE_TIME } from "./native-sales-schema11-fixture.ts";
import { assertNativeSaleCreateEvidence } from "./native-sales-schema11-acceptance.ts";
import { syntheticId } from "./fixtures.ts";
import { createPostgresApplicationApi } from "../../apps/api/src/postgres-read-api.ts";
import type { PostgresApplicationApi } from "../../apps/api/src/postgres-read-api.ts";
import { startLocalHttpsApplicationHost } from "../../apps/api/src/local-https-application-host.ts";
import type { LocalHttpsApplicationHost } from "../../apps/api/src/local-https-application-host.ts";
import { createSourceAuthenticationPolicy } from "../../packages/authentication/src/source-policy.ts";
import { createNodeScryptPasswords } from "../../packages/authentication/src/passwords.ts";
import { createSourceConfirmedCurrentFormAuthorization } from "../../packages/application/src/source-confirmed-current-form-authorization.ts";
import { createSalesActionAuthorization } from "../../packages/application/src/sales-authorization.ts";
import { createNativeManualSalesBusinessRules } from "../../packages/application/src/native-sales-preparation.ts";
import { createSourceConfirmedTransferAuthorization, createSourceConfirmedTransferReferences } from "../../packages/application/src/transfer-policy.ts";
import { PostgresImportedCatalogueCompletenessVerifier } from "../../adapters/postgres/src/catalogue-completeness.ts";
import { createSourcePartyReadAuthorization } from "../../packages/application/src/party-read-policy.ts";
import { requireDomain } from "../../packages/domain/src/errors.ts";
import type { ActorContext } from "../../packages/application/src/ports.ts";

test("fresh PG17 schema1–11 + actual CA-verified HTTPS: password/current/native SALE and management reads", { timeout: 45000 }, async t => {
  assert.equal(process.env.NAIJUE_PG_TEST_SUITE, "unified-https-native-sale-0001-0011", "Exact new PG+TLS suite required before Pool");
  assert.equal(process.env.NAIJUE_LOCAL_HTTPS_TEST, "I_APPROVE_NEW_LOOPBACK_SYNTHETIC_TLS_ONLY");
  const port = Number(process.env.NAIJUE_HTTPS_TEST_PORT);
  assert.ok(Number.isInteger(port) && port >= 55641 && port <= 55648, "Explicit independently reserved loopback HTTPS port required");
  const settings = integrationSettings(process.env), origin = `https://127.0.0.1:${port}`;
  await readNativeSalesSchema11Source(); // Frozen synthetic source bytes, before Pool or migrations.
  const database = await openFreshHistoryDatabase(settings), pool = database.pool;
  let api: PostgresApplicationApi | undefined, host: LocalHttpsApplicationHost | undefined;
  const privateDirectory = await realpath(await mkdtemp(path.join(tmpdir(), "naijue-pg-https-fixture-")));
  let cookie = "", maintainerCookie = "", sequence = 230000;
  let draft: Parameters<typeof assertNativeSaleCreateEvidence>[0]["draft"], saved: Parameters<typeof assertNativeSaleCreateEvidence>[0]["saved"];
  const assetRoot = path.join(privateDirectory, "build"); await mkdir(assetRoot);
  const connections = async () => Number((await pool.query("SELECT count(*)::integer n FROM pg_stat_activity WHERE datname=current_database() AND application_name='naijue-erp'")).rows[0]!.n);
  const state = async () => Promise.all(["sales_header", "sales_line", "sales_settlement", "operation_receipt", "audit_change", "inventory_ledger", "inventory_balance"].map(async table =>
    (await pool.query(`SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]')) digest FROM naijue_erp.${table} r`)).rows[0]!.digest));
  let ca: Buffer;
  const call = (method: "GET" | "POST", route: string, payload?: unknown, identity = cookie, headers: Record<string, string> = {}) => new Promise<{ status: number; body: string; headers: IncomingHttpHeaders }>((resolve, reject) => {
    const bytes = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload));
    const req = request(new URL("/api" + route, origin), { method, ca, rejectUnauthorized: true, headers: {
      origin, ...(identity ? { cookie: identity } : {}), ...(bytes ? { "content-type": "application/json", "content-length": String(bytes.length) } : {}), ...headers,
    } }, response => {
      const chunks: Buffer[] = []; response.on("data", b => chunks.push(Buffer.from(b))); response.once("error", reject);
      response.once("end", () => resolve({ status: response.statusCode!, body: Buffer.concat(chunks).toString(), headers: response.headers }));
    }); req.once("error", reject); req.setTimeout(10000, () => req.destroy(Error("Synthetic HTTPS request timeout"))); req.end(bytes);
  });
  const success = async (route: string, payload?: unknown, identity = cookie, method: "GET" | "POST" = "POST") => {
    const response = await call(method, route, payload, identity); assert.equal(response.status, 200, `${route}: ${response.body}`);
    assert.equal(response.headers["cache-control"], "no-store"); return JSON.parse(response.body);
  };
  try {
    const source = await seedNativeSalesSchema11Fixture(pool); await publishNativeSalesSchema11Fixture(pool, source);
    let password = randomBytes(24).toString("base64url");
    const encoded = await createNodeScryptPasswords().hash(password);
    await pool.query("UPDATE naijue_erp.user_account SET password_hash=$1,login_enabled=true WHERE id=ANY($2::uuid[])", [encoded, [saleIds.account, saleIds.maintainerAccount]]);
    await writeFile(path.join(assetRoot, "index.html"), "<!doctype html><title>Synthetic PG TLS transport only</title>");
    const config = path.join(privateDirectory, "tls.cnf");
    await writeFile(config, "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=127.0.0.1\n[ext]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n");
    execFileSync("/usr/bin/openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-config", config,
      "-keyout", path.join(privateDirectory, "key.pem"), "-out", path.join(privateDirectory, "cert.pem")], { stdio: "ignore" });
    const tls = { key: await readFile(path.join(privateDirectory, "key.pem")), cert: await readFile(path.join(privateDirectory, "cert.pem")) }; ca = tls.cert;
    const directoryAccess = (actor: ActorContext) => requireDomain(actor.accountId === saleIds.maintainerAccount && actor.hallId === null, "FORBIDDEN", "Synthetic independently selected directory reader");
    api = await createPostgresApplicationApi({ postgres: {
      target: { ...settings, ssl: false }, max: 3, maxPendingAcquisitions: 3, connectionTimeoutMillis: 2000, acquisitionTimeoutMillis: 2000,
      queryTimeoutMillis: 5000, statementTimeoutMillis: 4000, lockTimeoutMillis: 2000, idleInTransactionTimeoutMillis: 6000,
      idlePoolTimeoutMillis: 1000, disposeGraceMillis: 100, disposeTimeoutMillis: 3000,
    }, authentication: { trustedOrigin: origin, now: () => SALE_TIME, policy: createSourceAuthenticationPolicy(900) },
      authorization: { mode: "source-confirmed-native" }, productMedia: null,
      currentForms: { authorization: createSourceConfirmedCurrentFormAuthorization() },
      documentCommands: { sales: { authorization: createSalesActionAuthorization(), rules: createNativeManualSalesBusinessRules(), newId: kind => syntheticId(kind, sequence++) },
        transfers: { authorization: createSourceConfirmedTransferAuthorization(), references: createSourceConfirmedTransferReferences(), newId: kind => syntheticId(kind, sequence++) },
        nativeManualSalesPreparation: true, nativeManualTransferPreparation: true, catalogueCompleteness: new PostgresImportedCatalogueCompletenessVerifier() },
      productManagementRead: { authorization: { async authorize(actor) { directoryAccess(actor); return { kind: "all", totalStock: "unavailable" }; } } },
      catalogueSettingsRead: { authorization: { async authorize(actor, intent) { directoryAccess(actor); return intent.kind === "categories"
        ? { kind: "categories", operation: "tree", productCounts: "NONE" } : { kind: intent.kind, operation: "list" }; } } },
      dictionaryRead: { authorization: { async authorize(actor, intent) { directoryAccess(actor); return { kind: intent.kind, targetId: intent.operation === "detail" ? intent.parameters.schemeId : null }; } } },
      storeSettingsRead: { authorization: { async authorize(actor, intent) { directoryAccess(actor); return { kind: intent.kind, operation: intent.operation, scope: { kind: "ALL" },
        targetId: intent.operation === "detail" ? intent.parameters.id : null, references: "REFERENCES" }; } } },
      partyRead: { authorization: createSourcePartyReadAuthorization() },
    });
    assert.equal(await connections(), 0, "API construction remains lazy before actual network requests");
    host = await startLocalHttpsApplicationHost({ api, address: { host: "127.0.0.1", port }, tls, assets: { root: assetRoot, entry: "index.html" } });
    await t.test("actual password login persists secure session; exact Origin and current identity are shared", async () => {
      assert.equal((await call("POST", "/auth/login", { loginName: "SYNTHETIC_SALE_NONPASSWORD", password }, "", { origin: "https://foreign.invalid" })).status, 403);
      for (const [name, accountId] of [["SYNTHETIC_SALE_NONPASSWORD", saleIds.account], ["SYNTHETIC_SALE_MAINTAINER", saleIds.maintainerAccount]]) {
        const response = await call("POST", "/auth/login", { loginName: name, password }, ""); assert.equal(response.status, 200, "Actual scrypt login");
        const header = response.headers["set-cookie"]?.[0]; assert.ok(typeof header === "string" && /; Path=\/; HttpOnly; Secure; SameSite=Strict; Expires=/.test(header));
        const value = header.split(";", 1)[0]!; assert.ok(/^__Host-naijue_session=[A-Za-z0-9_-]{43}$/.test(value));
        assert.equal(response.body.includes(value.split("=")[1]!), false); assert.equal(response.body.includes(password), false);
        if (accountId === saleIds.account) cookie = value; else maintainerCookie = value;
        const session = await success("/auth/session", undefined, value, "GET"); assert.equal(session.principal.accountId, accountId);
      }
      password = "";
      assert.equal((await pool.query("SELECT count(*)::integer n FROM naijue_erp.auth_session")).rows[0]!.n, 2);
    });
    await t.test("CURRENT and independent management/party readers execute real scoped SQL over the same HTTPS auth/pool", async () => {
      const before = await state();
      const current = await success("/current-form/sales-references/query", { kind: "hall", hallId: null, search: "", page: 1, pageSize: 20 });
      assert.ok(current.items.some((row: { id: string }) => row.id === saleIds.hall));
      const product = await success("/product-management/query", { filter: { productIds: [], categoryIds: [], years: [], seasonIds: [], supplierIds: [], fitIds: [], thicknesses: [], shapeCodes: [] }, page: 1, pageSize: 100 }, maintainerCookie);
      assert.equal(product.exactTotal, 1); assert.equal(product.items[0].id, saleIds.product); assert.equal(product.items[0].totalStock, null);
      await success("/product-management/candidates/query", { kind: "product", search: "", selectedIds: [], page: 1, pageSize: 20 }, maintainerCookie);
      const list = { search: "", page: 1, pageSize: 20 };
      const tree = await success("/catalogue-settings-read/categories/query", {}, maintainerCookie); assert.equal(tree.total, 1); assert.equal(tree.items[0].productCount, null);
      for (const route of ["/catalogue-settings-read/colors/query", "/catalogue-settings-read/fits/query", "/dictionary-read/size-groups/query", "/dictionary-read/seasons/query", "/dictionary-read/barcode-schemes/query"])
        await success(route, list, maintainerCookie);
      assert.equal(await success("/dictionary-read/barcode-scheme/query", { schemeId: syntheticId("barcode", 250001) }, maintainerCookie), null);
      for (const [kind, id] of [["stores", saleIds.hall], ["warehouses", saleIds.warehouse]]) {
        const page = await success(`/store-settings-read/${kind}/query`, { ...list, status: "all", hallId: null }, maintainerCookie); assert.equal(page.total, 1);
        assert.equal((await success(`/store-settings-read/${kind}/detail/query`, { id }, maintainerCookie)).item.id, id);
      }
      for (const [kind, id] of [["customers", saleIds.customer], ["suppliers", saleIds.supplier]]) {
        const page = await success(`/${kind}?search=&enabled=ALL&page=1&pageSize=20`, undefined, maintainerCookie, "GET"); assert.equal(page.total, 1);
        assert.equal((await success(`/${kind}/${id}`, undefined, maintainerCookie, "GET")).id, id);
        const candidates = await success(`/${kind}/candidates?search=&page=1&pageSize=20`, undefined, cookie, "GET"); assert.equal(candidates.total, 1);
        assert.equal(Object.hasOwn(candidates.items[0], "createdAt"), false);
        assert.equal((await call("GET", `/${kind}?search=&enabled=ALL&page=1&pageSize=20`)).status, 403);
        assert.equal((await call("POST", `/${kind}/commands`, {})).status, 404);
      }
      assert.equal((await call("POST", "/catalogue-settings-read/categories/query", {})).status, 403);
      assert.deepEqual(await state(), before, "Real query routes change no documents, receipts, audits or stock");
    });
    const proposal = { businessType: "SALE", businessDate: "2026-10-21", note: "SYNTHETIC actual PG HTTPS SALE", hallId: saleIds.hall,
      warehouseId: saleIds.warehouse, customerId: saleIds.customer, salespersonId: null, orderDiscount: "0.00",
      lines: [{ skuId: saleIds.sku, quantity: "2", dealPrice: "1.25", pricingRule: "UNIT_PRICE", discountTenths: null, isGift: false, zeroConfirmed: false }],
      settlements: [{ paymentAccountId: saleIds.payment, paymentMethodId: saleIds.method, direction: "RECEIVE", amount: "2.50" }] };
    const command = () => ({ action: "SAVE", draft, requestKey: "SALE_NATIVE_CREATE", expectedVersion: null });
    await t.test("real published proof prepares read-only; native SAVE commits once, replay is byte equal and altered key conflicts", async () => {
      const before = await state(); draft = await success("/sales/prepare-create", proposal); assert.equal(draft.lines[0]!.referencePrice, "125"); assert.deepEqual(await state(), before);
      assert.equal((await call("POST", "/sales/commands", command(), cookie, { origin: "https://foreign.invalid" })).status, 401);
      assert.deepEqual(await state(), before);
      const response = await call("POST", "/sales/commands", command()); assert.equal(response.status, 200, response.body); saved = JSON.parse(response.body);
      const committed = await state(), replay = await call("POST", "/sales/commands", command()); assert.equal(replay.status, 200); assert.equal(replay.body, response.body); assert.deepEqual(await state(), committed);
      const changed = structuredClone(draft); changed.header.note = "CHANGED CONTENT";
      const rejected = await call("POST", "/sales/commands", { ...command(), draft: changed }); assert.equal(rejected.status, 409); assert.equal(JSON.parse(rejected.body).error.code, "IDEMPOTENCY_CONFLICT"); assert.deepEqual(await state(), committed);
    });
    await t.test("network detail, live audit history and receipt match full independently expected audit/receipt; SAVE has zero stock effects", async () => {
      const detail = await success("/sales/detail/query", { salesId: draft.header.id }); assert.equal(detail.document.header.id, draft.header.id); assert.equal(detail.document.lines[0].quantity, "2");
      const history = await success("/sales/history/query", { salesId: draft.header.id, page: 1, pageSize: 20 }); assert.equal(history.exactTotal, "1"); assert.equal(history.items.length, 1);
      const receipt = await success("/sales/receipts/SALE_NATIVE_CREATE", undefined, cookie, "GET"); assert.deepEqual(receipt.result, saved);
      const audit = (await pool.query("SELECT id,operation_id,actor_account_id,object_type,object_id,object_sales_id,object_transfer_id,action,old_version,new_version,occurred_at,before_values,after_values FROM naijue_erp.audit_change WHERE operation_id=$1", [saved.operationId])).rows[0]!;
      const row = (await pool.query("SELECT id,actor_account_id,request_key,action,target_type,target_id,target_sales_id,target_transfer_id,status,result_data,completed_at FROM naijue_erp.operation_receipt WHERE id=$1", [saved.operationId])).rows[0]!;
      assertNativeSaleCreateEvidence({ draft, saved, audit, receipt: row, actorAccountId: saleIds.account, time: SALE_TIME });
      for (const table of ["inventory_ledger", "inventory_balance"]) assert.equal((await pool.query(`SELECT count(*)::integer n FROM naijue_erp.${table}`)).rows[0]!.n, 0);
      assert.equal((await pool.query("SELECT count(*)::integer n FROM naijue_erp.sales_header")).rows[0]!.n, 1);
    });
    await t.test("current disabled identity refuses prepare/replay/receipt over real sessions; host closes listener and all owned PG backends", async () => {
      await pool.query("UPDATE naijue_erp.user_account SET login_enabled=false WHERE id=$1", [saleIds.account]); const before = await state();
      for (const [method, route, body] of [["POST", "/sales/prepare-create", proposal], ["POST", "/sales/commands", command()], ["GET", "/sales/receipts/SALE_NATIVE_CREATE", undefined]] as const)
        assert.equal((await call(method, route, body)).status, 401, "Real authenticator refuses disabled account before action policy; distinct from synthetic-session action403 evidence");
      assert.deepEqual(await state(), before); assert.ok(await connections() > 0);
      assert.equal(api!.postgresBackgroundFailureCount, 0); await host!.close(); await host!.close();
      const deadline = performance.now() + 2000; while (await connections() && performance.now() < deadline) await delay(25);
      assert.equal(await connections(), 0); await assert.rejects(call("GET", "/auth/session"), /ECONNREFUSED/);
    });
    t.diagnostic("Genuine PG17 + explicit-CA HTTPS, schema1–11 only; synthetic published prerequisite and static entry. Password login/native SALE/current/management/party SQL tested. Live audit history is NOT imported HISTORY. No browser/real frontend/TRANSFER flow/schema15–16 accounting/private-data import/restore/production claim.");
  } finally {
    try { if (host) await host.close(); else await api?.close(); } finally { await database.close(); }
  }
});
