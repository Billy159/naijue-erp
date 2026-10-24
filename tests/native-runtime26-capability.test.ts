/** Protocol fakes and synthetic pinned metadata only; no PostgreSQL or real grant. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, chmodSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createNativeRuntime26Issuer, NATIVE_RUNTIME26_METADATA_PROBE, NATIVE_RUNTIME26_V14_METADATA_PROBE, NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY } from "../adapters/postgres/src/native-import-accounting-capability.ts";
import { PostgresMaintenanceCommandUnitOfWork } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
const digest = "a".repeat(64), hash = (v: string) => createHash("sha256").update(v).digest("hex");
const target = { database: "SYNTHETIC_ONLY", databaseOid: "123", actingRole: "synthetic_owner", sessionUser: "synthetic_session", serverAddress: null, serverPort: null, postmasterStart: "2026-10-23 00:00:00+00" };
function observation() { return { identity: { database: target.database, database_oid: target.databaseOid, database_owner: "synthetic_owner", current_user: target.actingRole,
  session_user: target.sessionUser, server_version_num: "170011", server_addr: null, server_port: null, postmaster_start: target.postmasterStart, replication_role: "origin" },
  migration_versions: Array.from({ length: 26 }, (_, i) => i + 1), catalog_sha256: digest, source_routines_match: true }; }
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "d1-runtime26-synthetic-")), independent = join(directory, "independent.json"), reviewFile = join(directory, "review.json");
  const receipt = JSON.stringify({ result: "PASS", notice: "SYNTHETIC_PROTOCOL_ONLY_NOT_ACTUAL_APPROVAL" }); writeFileSync(independent, receipt, { mode: 0o600 });
  const review = { version: "C_NATIVE_RUNTIME26_REVIEW_V1", decision: "ACCEPT_EXACT_RUNTIME26_TARGET_METADATA", target, catalog: { format: "EXACT26_RUNTIME_CATALOG_EXPORT_V1", sha256: digest, patchLevel: "26_v11_document_specification_save" },
    purposes: ["IMPORT_STAGE", "PRODUCT_SEASONS_READ", "PRODUCT_MAINTENANCE", "CURRENT_CUSTOMER_READ_WRITE"], scope: "EXACT_TARGET_METADATA_ONLY", independentReview: { path: independent, sha256: hash(receipt), result: "PASS" }, realImportExecutionAuthorized: false };
  function options(value: unknown = review) { const body = JSON.stringify(value); writeFileSync(reviewFile, body, { mode: 0o600 }); return { reviewFile, trustedReviewSha256: hash(body) }; }
  return { directory, independent, review, reviewFile, options, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
function scripted(row = observation()) {
  const calls: string[] = [], releases: unknown[] = []; let connects = 0;
  const pool = { async connect() { connects++; return { async query(sql: string) { calls.push(sql); return { rows: sql === NATIVE_RUNTIME26_METADATA_PROBE ? [structuredClone(row)] : [], rowCount: sql === NATIVE_RUNTIME26_METADATA_PROBE ? 1 : 0 }; },
    release(error?: unknown) { releases.push(error); } }; } };
  return { pool, row, calls, releases, connects: () => connects };
}
test("runtime26 independently pinned metadata binds original pool, exact live leases and finite views", async () => {
  const f = fixture(); try {
    const p = scripted(), issuer = await createNativeRuntime26Issuer(p.pool, f.options());
    assert.equal(p.connects(), 1); assert.deepEqual(p.releases, [undefined]); assert.ok(Object.isFrozen(issuer));
    assert.deepEqual(Reflect.ownKeys(issuer.runtime26).sort(), ["assertReady", "contract", "profile"]);
    const client = await issuer.pool.connect(); const n = p.calls.length;
    await issuer.runtime26.assertReady(client, "IMPORT_STAGE"); assert.equal(p.calls.length, n + 1);
    assert.equal(p.calls.at(-1), NATIVE_RUNTIME26_METADATA_PROBE); assert.equal(await issuer.productSeasonArray.assertVerified(issuer.pool), undefined);
    const driver = new PostgresMaintenanceCommandUnitOfWork(issuer.pool);
    issuer.productSeasonArray.assertVerified(driver); issuer.historicalCustomerExclusion.assertVerified(driver); issuer.productMediaWrite.assertVerified(driver);
    assert.throws(() => issuer.productMediaWrite.assertVerified({ ...driver }), { code: "NATIVE_RUNTIME26_NOT_READY" });
    client.release(); await assert.rejects(issuer.runtime26.assertReady(client, "IMPORT_STAGE"), { code: "NATIVE_RUNTIME26_NOT_READY" });
    await assert.rejects(createNativeRuntime26Issuer(p.pool, f.options()), { code: "NATIVE_RUNTIME26_NOT_READY" });
    assert.ok(NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY.includes("17,18,19]")); assert.ok(!NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY.includes("20,21"));
    assert.ok(NATIVE_RUNTIME26_METADATA_PROBE.includes("pg_catalog.sha256(pg_catalog.convert_to((manifest-'identity')::text"));
    assert.ok(!NATIVE_RUNTIME26_METADATA_PROBE.includes("history_closure_encode("));
  } finally { f.cleanup(); }
});
test("runtime26 every target, process, role, full metadata, source and exact prefix mismatch fails admission", async () => {
  const f = fixture(); try {
    const changed: ((r: ReturnType<typeof observation>) => void)[] = [
      r => { r.identity.database = "OTHER"; }, r => { r.identity.database_oid = "124"; }, r => { r.identity.current_user = "OTHER"; }, r => { r.identity.session_user = "OTHER"; },
      r => { Object.assign(r.identity, { server_addr: "127.0.0.1" }); }, r => { Object.assign(r.identity, { server_port: 5432 }); }, r => { r.identity.postmaster_start += "x"; },
      r => { r.identity.replication_role = "replica"; }, r => { r.catalog_sha256 = "b".repeat(64); }, r => { r.source_routines_match = false; },
      r => { r.migration_versions.pop(); }, r => { r.migration_versions.push(27); }, r => { r.migration_versions[0] = 2; },
    ];
    const settings = f.options();
    for (const mutate of changed) { const row = observation(); mutate(row); const p = scripted(row);
      await assert.rejects(createNativeRuntime26Issuer(p.pool, settings), { code: "NATIVE_RUNTIME26_NOT_READY" }); assert.equal(p.connects(), 1); assert.equal(p.calls.length, 1); assert.ok(p.releases[0] instanceof Error);
    }
  } finally { f.cleanup(); }
});
test("runtime26 rejects foreign pool lease, raw client and structural copies without probing them", async () => {
  const f = fixture(); try {
    const settings = f.options(), p = scripted(), q = scripted();
    const a = await createNativeRuntime26Issuer(p.pool, settings), b = await createNativeRuntime26Issuer(q.pool, settings), client = await b.pool.connect();
    const count = p.calls.length + q.calls.length;
    await assert.rejects(a.runtime26.assertReady(client, "IMPORT_STAGE"), { code: "NATIVE_RUNTIME26_NOT_READY" }); assert.equal(p.calls.length + q.calls.length, count); client.release();
    const c = await createNativeRuntime26Issuer(scripted().pool, settings), own = await c.pool.connect();
    await assert.rejects(c.runtime26.assertReady({ ...own }, "IMPORT_STAGE"), { code: "NATIVE_RUNTIME26_NOT_READY" }); own.release();
    const raw = scripted(), d = await createNativeRuntime26Issuer(raw.pool, settings), rawClient = await raw.pool.connect(), n = raw.calls.length;
    await assert.rejects(d.runtime26.assertReady(rawClient, "IMPORT_STAGE"), { code: "NATIVE_RUNTIME26_NOT_READY" }); assert.equal(raw.calls.length, n); rawClient.release();
  } finally { f.cleanup(); }
});
test("runtime26 missing pin, boolean authority, unknown purposes and stale patch fail before pool acquisition", async () => {
  const f = fixture(); try {
    for (const change of [ { realImportExecutionAuthorized: true }, { catalog: { ...f.review.catalog, patchLevel: "26_v6" } }, { purposes: ["IMPORT_STAGE", "IMPORT_STAGE"] },
      { purposes: ["UNREVIEWED"] }, { purposes: [] }, { extra: true }, { independentReview: { ...f.review.independentReview, result: true } } ]) {
      const p = scripted(); await assert.rejects(createNativeRuntime26Issuer(p.pool, f.options({ ...f.review, ...change }))); assert.equal(p.connects(), 0);
    }
    const p = scripted(), settings = f.options();
    await assert.rejects(createNativeRuntime26Issuer(p.pool, { ...settings, trustedReviewSha256: "b".repeat(64) })); assert.equal(p.connects(), 0);
    const accessor = { ...settings }; Object.defineProperty(accessor, "reviewFile", { enumerable: true, get() { throw Error("GETTER_MUST_NOT_RUN"); } });
    await assert.rejects(createNativeRuntime26Issuer(p.pool, accessor), { code: "NATIVE_RUNTIME26_NOT_READY" }); assert.equal(p.connects(), 0);
  } finally { f.cleanup(); }
});
test("runtime26 receipt revocation, permission change and symlink replacement prevent new SQL and COMMIT", async () => {
  for (const change of ["review", "receipt", "mode", "symlink"]) {
    const f = fixture(); try {
      const p = scripted(), issuer = await createNativeRuntime26Issuer(p.pool, f.options()), client = await issuer.pool.connect(), count = p.calls.length;
      if (change === "review") writeFileSync(f.reviewFile, "{}\n");
      if (change === "receipt") writeFileSync(f.independent, "changed");
      if (change === "mode") chmodSync(f.independent, 0o622);
      if (change === "symlink") { unlinkSync(f.reviewFile); symlinkSync(f.independent, f.reviewFile); }
      await assert.rejects(issuer.runtime26.assertReady(client, "IMPORT_STAGE")); assert.equal(p.calls.length, count);
      await assert.rejects(client.query("COMMIT"), { code: "NATIVE_RUNTIME26_NOT_READY" }); await client.query("ROLLBACK"); client.release();
      const connects = p.connects(); await assert.rejects(issuer.pool.connect()); assert.equal(p.connects(), connects); assert.ok(p.releases.at(-1) instanceof Error);
    } finally { f.cleanup(); }
  }
});
test("runtime26 limited review cannot grant another purpose or maintenance driver", async () => {
  const f = fixture(); try {
    const p = scripted(), issuer = await createNativeRuntime26Issuer(p.pool, f.options({ ...f.review, purposes: ["PRODUCT_SEASONS_READ"] }));
    issuer.productSeasonArray.assertVerified(issuer.pool);
    assert.throws(() => issuer.productSeasonArray.assertVerified(new PostgresMaintenanceCommandUnitOfWork(issuer.pool)), { code: "NATIVE_RUNTIME26_NOT_READY" });
    assert.throws(() => issuer.historicalCustomerExclusion.assertVerified(issuer.pool), { code: "NATIVE_RUNTIME26_NOT_READY" });
    const client = await issuer.pool.connect(), count = p.calls.length;
    await assert.rejects(issuer.runtime26.assertReady(client, "IMPORT_PUBLISH"), { code: "NATIVE_RUNTIME26_NOT_READY" }); assert.equal(p.calls.length, count); client.release();
  } finally { f.cleanup(); }
});
test("runtime26 retained-delete view binds only the original managed read pool and existing reviewed PRODUCT_SEASONS_READ purpose", async () => {
  const f = fixture(); try {
    const p = scripted(), q = scripted(), settings = f.options({ ...f.review, purposes: ["PRODUCT_SEASONS_READ"] });
    const issuer = await createNativeRuntime26Issuer(p.pool, settings), foreign = await createNativeRuntime26Issuer(q.pool, settings);
    const view = issuer.catalogueRetainedDelete, count = p.calls.length + q.calls.length;
    assert.equal(view.profile, "catalogue-retained-delete-v22"); assert.deepEqual(Reflect.ownKeys(view).sort(), ["assertVerified", "profile"]);
    assert.ok(Object.isFrozen(view)); assert.equal(view.assertVerified(issuer.pool), undefined);
    for (const target of [p.pool, { ...issuer.pool }, foreign.pool, new PostgresMaintenanceCommandUnitOfWork(issuer.pool), {}])
      assert.throws(() => view.assertVerified(target as never), { code: "NATIVE_RUNTIME26_NOT_READY" });
    assert.equal(p.calls.length + q.calls.length, count);
    const limited = await createNativeRuntime26Issuer(scripted().pool, f.options({ ...f.review, purposes: ["PRODUCT_MAINTENANCE"] }));
    assert.throws(() => limited.catalogueRetainedDelete.assertVerified(limited.pool), { code: "NATIVE_RUNTIME26_NOT_READY" });
  } finally { f.cleanup(); }
});
test("runtime26 retained-delete view checks pinned files synchronously and cannot recover after revocation", async () => {
  const f = fixture(); try {
    const settings = f.options(), p = scripted(), issuer = await createNativeRuntime26Issuer(p.pool, settings), count = p.calls.length;
    const original = JSON.stringify({ result: "PASS", notice: "SYNTHETIC_PROTOCOL_ONLY_NOT_ACTUAL_APPROVAL" });
    writeFileSync(f.independent, "changed");
    assert.throws(() => issuer.catalogueRetainedDelete.assertVerified(issuer.pool), { code: "NATIVE_RUNTIME26_NOT_READY" });
    writeFileSync(f.independent, original);
    assert.throws(() => issuer.catalogueRetainedDelete.assertVerified(issuer.pool), { code: "NATIVE_RUNTIME26_NOT_READY" });
    await assert.rejects(issuer.pool.connect(), { code: "NATIVE_RUNTIME26_NOT_READY" }); assert.equal(p.calls.length, count); assert.equal(p.connects(), 1);
  } finally { f.cleanup(); }
});
test("runtime26 rechecks actual metadata inside the live original transaction and forbids COMMIT after drift", async () => {
  const f = fixture(); try {
    const p = scripted(), issuer = await createNativeRuntime26Issuer(p.pool, f.options()), client = await issuer.pool.connect();
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); p.row.catalog_sha256 = "c".repeat(64); const n = p.calls.length;
    await assert.rejects(issuer.runtime26.assertReady(client, "IMPORT_STAGE"), { code: "NATIVE_RUNTIME26_NOT_READY" }); assert.equal(p.calls.length, n + 1);
    await assert.rejects(client.query("COMMIT"), { code: "NATIVE_RUNTIME26_NOT_READY" }); await client.query("ROLLBACK"); client.release();
    assert.equal(p.calls.at(-1), "ROLLBACK"); assert.ok(p.releases.at(-1) instanceof Error);
  } finally { f.cleanup(); }
});
test("runtime26 concurrent business SQL cannot bypass a pending metadata check", async () => {
  const f = fixture(); try {
    const p = scripted(); let finish: (() => void) | undefined, blocked = false;
    const pool = { async connect() { const raw = await p.pool.connect(); return { async query(sql: string) {
      if (blocked && sql === NATIVE_RUNTIME26_METADATA_PROBE) await new Promise<void>(resolve => { finish = resolve; }); return raw.query(sql);
    }, release: (error?: Error | boolean) => raw.release(error) }; } };
    const issuer = await createNativeRuntime26Issuer(pool, f.options()), client = await issuer.pool.connect(); blocked = true;
    const pending = issuer.runtime26.assertReady(client, "IMPORT_STAGE"); assert.ok(finish);
    await assert.rejects(client.query("UPDATE SYNTHETIC_MUST_NOT_REACH_DRIVER"), { code: "NATIVE_RUNTIME26_NOT_READY" }); finish!();
    await assert.rejects(pending, { code: "NATIVE_RUNTIME26_NOT_READY" });
    await assert.rejects(client.query("COMMIT"), { code: "NATIVE_RUNTIME26_NOT_READY" }); await client.query("ROLLBACK"); client.release();
    assert.ok(!p.calls.some(sql => sql.includes("MUST_NOT_REACH")));
  } finally { f.cleanup(); }
});
for (const changed of ["review", "independentReceipt"] as const) test(`QB92 ${changed} revocation after last successful check blocks COMMIT before original driver`, async () => {
  for (const commitSql of ["COMMIT", " /* bounded comment */ commit work;", "END TRANSACTION;", "SELECT 1; COMMIT;"]) {
    const f = fixture(); try {
      const p = scripted(), issuer = await createNativeRuntime26Issuer(p.pool, f.options()), client = await issuer.pool.connect();
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); await issuer.runtime26.assertReady(client, "IMPORT_STAGE");
      writeFileSync(changed === "review" ? f.reviewFile : f.independent, "{}\n"); const count = p.calls.length;
      await assert.rejects(client.query(commitSql), { code: "NATIVE_RUNTIME26_NOT_READY" });
      assert.equal(p.calls.length, count); assert.ok(!p.calls.includes(commitSql));
      await client.query("ROLLBACK"); client.release(); assert.equal(p.calls.at(-1), "ROLLBACK"); assert.ok(p.releases.at(-1) instanceof Error);
    } finally { f.cleanup(); }
  }
});
test("QB92 valid pins preserve original unknown COMMIT failure and discard without rollback or retry", async () => {
  const f = fixture(); try {
    const p = scripted(), failure = Error("SYNTHETIC_UNKNOWN_COMMIT");
    const pool = { async connect() { const raw = await p.pool.connect(); return { async query(sql: string) {
      const result = await raw.query(sql); if (sql === "COMMIT") throw failure; return result;
    }, release: (error?: Error | boolean) => raw.release(error) }; } };
    const issuer = await createNativeRuntime26Issuer(pool, f.options()), driver = new PostgresMaintenanceCommandUnitOfWork(issuer.pool);
    await assert.rejects(driver.transaction(async () => "SYNTHETIC_ONLY"), error => error === failure);
    assert.equal(p.calls.filter(sql => sql === "COMMIT").length, 1); assert.ok(!p.calls.includes("ROLLBACK")); assert.equal(p.releases.at(-1), failure);
    assert.equal(p.connects(), 2);
  } finally { f.cleanup(); }
});

test("v14 runtime selector uses its exact123-function probe, retains metadata-only scope and independent purposes",async()=>{
 const f=fixture();try{
  const calls:string[]=[];const pool={async connect(){return{async query(sql:string){calls.push(sql);assert.equal(sql,NATIVE_RUNTIME26_V14_METADATA_PROBE);return{rows:[observation()],rowCount:1};},release(){}};}};
  const options=f.options({...f.review,catalog:{...f.review.catalog,patchLevel:'26_v14_core_initialization'}});
  const issuer=await createNativeRuntime26Issuer(pool,options),client=await issuer.pool.connect();
  await issuer.runtime26.assertReady(client,'IMPORT_STAGE');assert.equal(calls.length,3);
  await assert.rejects(issuer.runtime26.assertReady(client,'IMPORT_PUBLISH'),{code:'NATIVE_RUNTIME26_NOT_READY'});client.release();
  const p=scripted();await assert.rejects(createNativeRuntime26Issuer(p.pool,f.options({...f.review,catalog:{...f.review.catalog,patchLevel:'26_v14_core_initialization'},realImportExecutionAuthorized:true})));assert.equal(p.connects(),0);
 }finally{f.cleanup();}
});
test("v14 exact routine pins cover the single approved patch while original v11 probe stays unchanged",()=>{
 const sql=readFileSync(new URL('../adapters/postgres/patches/0026-v14-core-initialization.sql',import.meta.url),'utf8');
 const routines=[...sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION naijue_erp\.(\w+)\([^;]*?AS \$\$(.*?)\$\$;/gs)];assert.equal(routines.length,10);
 for(const m of routines)assert.ok(NATIVE_RUNTIME26_V14_METADATA_PROBE.includes(`('${m[1]}','${hash(m[2]!)}')`),m[1]);
 assert.ok(NATIVE_RUNTIME26_METADATA_PROBE.includes("jsonb_array_length(manifest->'routines')=122"));
 assert.ok(NATIVE_RUNTIME26_V14_METADATA_PROBE.includes("jsonb_array_length(manifest->'routines')=123"));
});
