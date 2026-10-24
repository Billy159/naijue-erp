import { EventEmitter } from "node:events";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { BoundedPostgresPool, PostgresQueryError, PostgresResourceError, isKnownPostgresTransportQueryError } from "../adapters/postgres/src/bounded-pool.ts";
import { PostgresSalesUnitOfWork } from "../adapters/postgres/src/sales-unit-of-work.ts";
/** Protocol fakes and synthetic pinned metadata only; no PostgreSQL or real grant. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, chmodSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createNativeRuntime26Issuer, NATIVE_RUNTIME26_METADATA_PROBE, NATIVE_RUNTIME26_V14_METADATA_PROBE, NATIVE_RUNTIME26_V15_METADATA_PROBE, NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY } from "../adapters/postgres/src/native-import-accounting-capability.ts";
import { PostgresMaintenanceCommandUnitOfWork } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import type { MaintenancePgContext } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import type { MaintenanceCompletion } from "../packages/application/src/maintenance-commit-ports.ts";
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

test("runtime performance: unchanged review files are hashed once per issuer while every original lease and explicit verification still probes actual metadata", async () => {
 const f=fixture(),settings=f.options(),original=fs.readFileSync;let contentReads=0;
 fs.readFileSync=function(...args:unknown[]){if(typeof args[0]==='number')contentReads++;return Reflect.apply(original,fs,args);} as typeof fs.readFileSync;syncBuiltinESMExports();
 try {
  const p=scripted(),issuer=await createNativeRuntime26Issuer(p.pool,settings);assert.equal(contentReads,2);
  const client=await issuer.pool.connect();await issuer.runtime26.assertReady(client,'IMPORT_STAGE');
  await client.query('BEGIN');await issuer.runtime26.assertReady(client,'IMPORT_STAGE');await client.query('COMMIT');client.release();
  const next=await issuer.pool.connect();await issuer.runtime26.assertReady(next,'IMPORT_STAGE');next.release();
  assert.equal(contentReads,2);assert.equal(p.calls.filter(sql=>sql===NATIVE_RUNTIME26_METADATA_PROBE).length,6);
 }finally{fs.readFileSync=original;syncBuiltinESMExports();f.cleanup();}
});
test("runtime availability: timeout transport and bounded resource failures poison only the current lease; a new request must fully reverify without automatic retries",async()=>{
 for(const failure of [new PostgresQueryError({code:'57014'}),await boundedSanitizedFailure(Object.assign(Error('SYNTHETIC_TRANSPORT'),{code:'ECONNRESET'})),new PostgresResourceError('PG_CLIENT_CLOSED')]){
  const f=fixture();try{
   const calls:string[]=[],releases:unknown[]=[];let nextFailure:Error|undefined;
   const pool={async connect(){return{async query(sql:string){calls.push(sql);if(sql===NATIVE_RUNTIME26_METADATA_PROBE&&nextFailure){const current=nextFailure;nextFailure=undefined;throw current;}return{rows:sql===NATIVE_RUNTIME26_METADATA_PROBE?[observation()]:[],rowCount:sql===NATIVE_RUNTIME26_METADATA_PROBE?1:0};},release(error?:unknown){releases.push(error);}};}};
   const issuer=await createNativeRuntime26Issuer(pool,f.options()),client=await issuer.pool.connect();await client.query('BEGIN');
   const count=calls.filter(sql=>sql===NATIVE_RUNTIME26_METADATA_PROBE).length;nextFailure=failure;
   await assert.rejects(issuer.runtime26.assertReady(client,'IMPORT_STAGE'),error=>error===failure);
   assert.equal(calls.filter(sql=>sql===NATIVE_RUNTIME26_METADATA_PROBE).length,count+1);
   const before=calls.length;await assert.rejects(client.query('COMMIT'),{code:'NATIVE_RUNTIME26_NOT_READY'});
   await assert.rejects(issuer.runtime26.assertReady(client,'IMPORT_STAGE'),{code:'NATIVE_RUNTIME26_NOT_READY'});assert.equal(calls.length,before);
   await client.query('ROLLBACK');client.release();assert.equal(releases.at(-1),failure);
   const recovered=await issuer.pool.connect();assert.equal(calls.filter(sql=>sql===NATIVE_RUNTIME26_METADATA_PROBE).length,count+2);
   await issuer.runtime26.assertReady(recovered,'IMPORT_STAGE');await recovered.query('SELECT SYNTHETIC_NEW_REQUEST');recovered.release();
   assert.ok(calls.includes('SELECT SYNTHETIC_NEW_REQUEST'));assert.equal(calls.filter(sql=>sql==='COMMIT').length,0);
  }finally{f.cleanup();}
 }
});
test("runtime availability: a failed borrow is discarded and recovery cannot reuse old catalog or accept a real mismatch",async()=>{
 const f=fixture();try{
  let failure:Error|undefined;const row=observation(),calls:string[]=[],releases:unknown[]=[];
  const pool={async connect(){return{async query(sql:string){calls.push(sql);if(failure){const error=failure;failure=undefined;throw error;}return{rows:[structuredClone(row)],rowCount:1};},release(error?:unknown){releases.push(error);}};}};
  const issuer=await createNativeRuntime26Issuer(pool,f.options());failure=new PostgresQueryError({code:'57014'});
  await assert.rejects(issuer.pool.connect(),{code:'57014'});assert.ok(releases.at(-1) instanceof Error);
  row.catalog_sha256='b'.repeat(64);const before=calls.length;
  await assert.rejects(issuer.pool.connect(),{code:'NATIVE_RUNTIME26_NOT_READY'});assert.equal(calls.length,before+1);
  row.catalog_sha256=digest;await assert.rejects(issuer.pool.connect(),{code:'NATIVE_RUNTIME26_NOT_READY'});assert.equal(calls.length,before+1);
 }finally{f.cleanup();}
});
test("sales runtime performance: one same-client in-transaction check plus original precommit check; drift and unknown commit remain closed",async()=>{
 for(const outcome of ['success','catalogDrift','unknownCommit']){
  const f=fixture();try{
   const row=observation(),calls:string[]=[],releases:unknown[]=[];const unknown=Error('SYNTHETIC_SALES_UNKNOWN_COMMIT');
   const pool={async connect(){return{async query(sql:string){calls.push(sql);if(sql==='COMMIT'&&outcome==='unknownCommit')throw unknown;
    const rows=sql===NATIVE_RUNTIME26_METADATA_PROBE?[structuredClone(row)]:sql.includes('sales:current-schema')?[{current_sales_schema_ready:true}]:[];return{rows,rowCount:rows.length};},release(error?:unknown){releases.push(error);}};}};
   const issuer=await createNativeRuntime26Issuer(pool,f.options({...f.review,purposes:['INVENTORY_ADMISSION']}));
   const driver=new PostgresSalesUnitOfWork(issuer.pool,{runtime26:issuer.runtime26,catalogueCompleteness:{async assertComplete(){throw Error('Not part of this protocol');}}});
   const start=calls.length;const run=driver.transaction(async()=>{if(outcome==='catalogDrift')row.catalog_sha256='b'.repeat(64);return'SYNTHETIC_SALES_WORK';});
   if(outcome==='success')assert.equal(await run,'SYNTHETIC_SALES_WORK');else await assert.rejects(run,error=>outcome==='unknownCommit'?error===unknown:(error as {code?:string}).code==='NATIVE_RUNTIME26_NOT_READY');
   const tx=calls.slice(start);assert.equal(tx.filter(sql=>sql===NATIVE_RUNTIME26_METADATA_PROBE).length,3);
   assert.equal(tx[0],NATIVE_RUNTIME26_METADATA_PROBE);assert.match(tx[1]!,/^BEGIN/);assert.equal(tx[2],NATIVE_RUNTIME26_METADATA_PROBE);
   if(outcome==='catalogDrift'){assert.ok(!tx.includes('COMMIT'));assert.equal(tx.at(-1),'ROLLBACK');}
   if(outcome==='unknownCommit'){assert.equal(tx.filter(sql=>sql==='COMMIT').length,1);assert.ok(!tx.includes('ROLLBACK'));assert.equal(releases.at(-1),unknown);}
  }finally{f.cleanup();}
 }
});
test("runtime performance: identical-byte rewrite with restored mtime still revokes the original file pin before COMMIT",async()=>{
 const f=fixture();try{
  const settings=f.options(),p=scripted(),issuer=await createNativeRuntime26Issuer(p.pool,settings),client=await issuer.pool.connect();
  await client.query('BEGIN');const original=fs.readFileSync(f.independent),before=fs.statSync(f.independent);
  fs.writeFileSync(f.independent,original);fs.utimesSync(f.independent,before.atime,before.mtime);
  const count=p.calls.length;await assert.rejects(client.query('COMMIT'),{code:'NATIVE_RUNTIME26_NOT_READY'});
  assert.equal(p.calls.length,count);await client.query('ROLLBACK');client.release();
  await assert.rejects(issuer.pool.connect(),{code:'NATIVE_RUNTIME26_NOT_READY'});
 }finally{f.cleanup();}
});

/** Exercise the actual bounded query catch, not a class reconstructed by a test. */
async function boundedSanitizedFailure(failure: unknown): Promise<PostgresQueryError> {
 const raw=Object.assign(new EventEmitter(),{async query(){throw failure;},release(){}});
 const driver=Object.assign(new EventEmitter(),{async connect(){return raw;},async end(){}});
 const pool=new BoundedPostgresPool({target:{host:'synthetic.invalid',port:55432,database:'SYNTHETIC_F01',user:'SYNTHETIC_F01',password:'SYNTHETIC_ONLY',ssl:false},
  max:1,maxPendingAcquisitions:1,connectionTimeoutMillis:100,acquisitionTimeoutMillis:50,queryTimeoutMillis:200,statementTimeoutMillis:100,
  lockTimeoutMillis:30,idleInTransactionTimeoutMillis:300,idlePoolTimeoutMillis:100,disposeGraceMillis:0,disposeTimeoutMillis:100},()=>driver);
 const client=await pool.connect();
 try {
  await client.query('SELECT SYNTHETIC_F01_FAILURE');throw Error('Expected bounded driver failure');
 }catch(error){assert.ok(error instanceof PostgresQueryError);return error;}
 finally{client.release();await pool.dispose();}
}
test('F01 sanitizer provenance: only actual known transport retains private origin; unknown SQLSTATE TypeError and forged tags stay unclassified and sanitized',async()=>{
 const cases:[unknown,boolean][]=[
  [Object.assign(Error('RAW-SECRET private_password'),{code:'ECONNRESET'}),true],
  [Object.assign(Error('RAW-SECRET private_password'),{code:'EPIPE'}),true],
  [Object.assign(Error('RAW-SECRET private_password'),{code:'ZZ001'}),false],
  [new TypeError('RAW-SECRET private_password'),false],
  [Object.assign(Error('RAW-SECRET private_password'),{knownTransport:true,transport:true}),false],
  [Object.assign(Error('RAW-SECRET private_password'),{code:'42501'}),false]
 ];
 for(const [raw,expected]of cases){const safe=await boundedSanitizedFailure(raw);assert.equal(isKnownPostgresTransportQueryError(safe),expected);
  assert.ok(!JSON.stringify(safe).includes('RAW-SECRET')&&!String(safe).includes('private_password'));assert.equal((safe as {cause?:unknown}).cause,undefined);
 }
 assert.equal(isKnownPostgresTransportQueryError(new PostgresQueryError({code:'ECONNRESET'})),false);
 assert.equal(isKnownPostgresTransportQueryError({knownTransport:true,transport:true}),false);
 assert.equal(isKnownPostgresTransportQueryError(Object.create(PostgresQueryError.prototype)),false);
});
test('F01 issuer lifecycle: real sanitizer handoff recovers genuine transport cancellation or closed client, but wrapped unknown failures permanently revoke',async()=>{
 const cases:[unknown,boolean][]=[
  [await boundedSanitizedFailure(Object.assign(Error('SYNTHETIC_TRANSPORT'),{code:'ECONNRESET'})),true],
  [await boundedSanitizedFailure(Object.assign(Error('SYNTHETIC_CANCEL'),{code:'57014'})),true],
  [new PostgresResourceError('PG_CLIENT_CLOSED'),true],
  [await boundedSanitizedFailure(Object.assign(Error('SYNTHETIC_UNKNOWN_STATE'),{code:'ZZ001'})),false],
  [await boundedSanitizedFailure(new TypeError('SYNTHETIC_UNKNOWN_DRIVER')),false],
  [await boundedSanitizedFailure(Object.assign(Error('SYNTHETIC_PERMISSION'),{code:'42501'})),false],
  [new PostgresQueryError({code:'ECONNRESET',knownTransport:true}),false],
  [Object.assign(Error('SYNTHETIC_FORGED_TAG'),{knownTransport:true}),false]
 ];
 for(const [error,recoverable]of cases){
  const f=fixture();try{
   let pending:unknown;const calls:string[]=[],releases:unknown[]=[];
   const pool={async connect(){return{async query(sql:string){calls.push(sql);if(pending){const failure=pending;pending=undefined;throw failure;}return{rows:sql===NATIVE_RUNTIME26_METADATA_PROBE?[observation()]:[],rowCount:sql===NATIVE_RUNTIME26_METADATA_PROBE?1:0};},release(reason?:unknown){releases.push(reason);}};}};
   const issuer=await createNativeRuntime26Issuer(pool,f.options()),lease=await issuer.pool.connect();await lease.query('BEGIN');pending=error;
   await assert.rejects(issuer.runtime26.assertReady(lease,'IMPORT_STAGE'),actual=>actual===error);
   const before=calls.length;await assert.rejects(lease.query('COMMIT'),{code:'NATIVE_RUNTIME26_NOT_READY'});assert.equal(calls.length,before);
   await lease.query('ROLLBACK');lease.release();assert.equal(releases.at(-1),error);
   const at=calls.length;
   if(recoverable){const next=await issuer.pool.connect();assert.equal(calls.length,at+1);next.release();}
   else{await assert.rejects(issuer.pool.connect(),{code:'NATIVE_RUNTIME26_NOT_READY'});assert.equal(calls.length,at);}
  }finally{f.cleanup();}
 }
});

test("v15 exact routine pins preserve v14 and every original non-category routine branch", () => {
  const sql = readFileSync(new URL('../adapters/postgres/patches/0026-category-reorder-undo.sql', import.meta.url), 'utf8');
  const original = readFileSync(new URL('../adapters/postgres/migrations/0021_native_maintenance_receipts.sql', import.meta.url), 'utf8');
  const routines = [...sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION naijue_erp\.(\w+)\([^;]*?AS \$\$(.*?)\$\$;/gs)];
  assert.equal(routines.length, 4);
  for (const m of routines) assert.ok(NATIVE_RUNTIME26_V15_METADATA_PROBE.includes(`('${m[1]}','${hash(m[2]!)}')`), m[1]);
  assert.ok(NATIVE_RUNTIME26_V15_METADATA_PROBE.includes("jsonb_array_length(manifest->'routines')=124"));
  assert.ok(NATIVE_RUNTIME26_V14_METADATA_PROBE.includes("jsonb_array_length(manifest->'routines')=123"));
  assert.ok(NATIVE_RUNTIME26_METADATA_PROBE.includes("jsonb_array_length(manifest->'routines')=122"));
  const body = (source: string, name: string) => new RegExp(`CREATE(?: OR REPLACE)? FUNCTION naijue_erp\\.${name}\\([^;]*?AS \\$\\$(.*?)\\$\\$;`, 's').exec(source)![1]!;
  assert.equal(body(sql, 'maintenance_action_allowed'), body(original, 'maintenance_action_allowed').replace("WHEN 'CATEGORY' THEN action IN ('CREATE','EDIT','DELETE')", "WHEN 'CATEGORY' THEN action IN ('CREATE','EDIT','DELETE','REORDER','UNDO_REORDER')"));
  const oldRoot = body(original, 'validate_maintenance_root_commit'), newRoot = body(sql, 'validate_maintenance_root_commit');
  const rootMarker = '  SELECT * INTO a FROM naijue_erp.audit_change WHERE object_type=family AND object_id=NEW.id AND new_version=NEW.version;';
  assert.ok(newRoot.startsWith(oldRoot.slice(0, oldRoot.indexOf(rootMarker))));
  assert.ok(newRoot.endsWith(oldRoot.slice(oldRoot.indexOf(rootMarker))));
  assert.equal(body(sql, 'validate_maintenance_receipt_commit').replace(/  IF NEW.target_type='CATEGORY' AND NEW.action IN \('REORDER','UNDO_REORDER'\) THEN.*?  END IF;\n/s, ''), body(original, 'validate_maintenance_receipt_commit'));
  assert.ok(sql.includes('cmin::text::bigint<=audit_command'));
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION naijue_erp.maintenance_check_category_order(naijue_erp.audit_change) FROM PUBLIC'));
  assert.equal((sql.match(/CREATE TRIGGER|DROP TRIGGER|DISABLE TRIGGER|ADD COLUMN|CREATE TABLE|CREATE INDEX/g) ?? []).length, 0);
});
test("v15 category capability is absent for old profiles and unreviewed maintenance purpose", async () => {
  const f = fixture(); try {
    for (const patchLevel of ['26_v11_document_specification_save', '26_v14_core_initialization', '26_v15_category_order_undo']) {
      const probe = patchLevel.includes('v11') ? NATIVE_RUNTIME26_METADATA_PROBE : patchLevel.includes('v14') ? NATIVE_RUNTIME26_V14_METADATA_PROBE : NATIVE_RUNTIME26_V15_METADATA_PROBE;
      const pool = { async connect() { return { async query(sql: string) { assert.equal(sql, probe); return { rows: [observation()], rowCount: 1 }; }, release() {} }; } };
      const issuer = await createNativeRuntime26Issuer(pool, f.options({ ...f.review, catalog: { ...f.review.catalog, patchLevel }, purposes: ['IMPORT_STAGE'] }));
      assert.equal(Object.hasOwn(issuer, 'categoryOrderWrite'), false);
    }
    const p = scripted(), issuer = await createNativeRuntime26Issuer(p.pool, f.options()); assert.equal(issuer.categoryOrderWrite, undefined);
  } finally { f.cleanup(); }
});
test("v15 category original context unwraps the real managed lease and rechecks exact metadata before COMMIT", async () => {
  for (const drift of [false, true]) {
    const f = fixture(); try {
      const actorId = '00000000-0000-4000-8000-000000000001', id = '00000000-0000-4000-8000-000000000002', other = '00000000-0000-4000-8000-000000000004', op = '00000000-0000-4000-8000-000000000003';
      const calls: string[] = [], releases: unknown[] = []; let saved = false;
      const pool = { async connect() { return { async query(sql: string, values: unknown[] = []) {
        calls.push(sql);
        if (sql === NATIVE_RUNTIME26_V15_METADATA_PROBE) return { rows: [{ ...observation(), source_routines_match: !(saved && drift) }], rowCount: 1 };
        const rows = sql.includes('maintenance:identity') ? [{ account_id: actorId, staff_id: other, login_enabled: true, role: 'ADMIN', employment_status: '在职', hall_id: null }]
          : sql.includes('maintenance:complete') ? [{ result_data: JSON.parse(values[7] as string) }] : [];
        if (sql.includes('maintenance:complete')) saved = true;
        return { rows, rowCount: sql.includes('maintenance:audit') ? 1 : rows.length };
      }, release(error?: unknown) { releases.push(error); } }; } };
      const issuer = await createNativeRuntime26Issuer(pool, f.options({ ...f.review, catalog: { ...f.review.catalog, patchLevel: '26_v15_category_order_undo' } }));
      assert.deepEqual(Reflect.ownKeys(issuer.categoryOrderWrite!).sort(), ['assertReady', 'profile']);
      const uow = new PostgresMaintenanceCommandUnitOfWork(issuer.pool); let escaped: MaintenancePgContext | undefined;
      const save = uow.transaction(async context => {
        escaped = context; const before = calls.length;
        await assert.rejects(issuer.categoryOrderWrite!.assertReady({ ...context }), { code: 'NATIVE_RUNTIME26_NOT_READY' }); assert.equal(calls.length, before);
        await issuer.categoryOrderWrite!.assertReady(context); assert.equal(calls.length, before + 1);
        await context.evidence.assertAllowed({ accountId: actorId as never, hallId: null }, 'CATEGORY', 'REORDER');
        await context.evidence.getReceipt(actorId, 'v15-original-key', 'CATEGORY');
        const metadata = (after: boolean) => ({ parent_id: null, moved_id: other, undo_of_operation_id: null,
          rows: [{ id, version: after ? 2 : 1, display_order: after ? 1 : 10 }, { id: other, version: after ? 2 : 1, display_order: after ? 0 : 10 }] });
        const completion: MaintenanceCompletion = { operationId: op, actorAccountId: actorId, requestKey: 'v15-original-key', requestHash: 'a'.repeat(64), kind: 'CATEGORY', action: 'REORDER',
          targetId: id, oldVersion: 1, newVersion: 2, completedAt: '2026-10-24T00:00:00Z', beforeValues: { version: 1, display_order: 10, category_order: metadata(false) },
          afterValues: { version: 2, display_order: 1, category_order: metadata(true) } };
        await context.evidence.prepare!(completion); await context.client.query('/* synthetic:category-leaf */ UPDATE SYNTHETIC_ONLY'); return context.evidence.complete(completion);
      });
      if (drift) { await assert.rejects(save, { code: 'NATIVE_RUNTIME26_NOT_READY' }); assert.ok(!calls.includes('COMMIT')); assert.equal(calls.filter(s => s === 'ROLLBACK').length, 1); assert.ok(releases.at(-1) instanceof Error); }
      else { await save; assert.equal(calls.filter(s => s === NATIVE_RUNTIME26_V15_METADATA_PROBE).length, 4); assert.equal(calls.filter(s => s === 'COMMIT').length, 1); assert.deepEqual(releases, [undefined, undefined]); }
      const at = calls.length; await assert.rejects(issuer.categoryOrderWrite!.assertReady(escaped!), { code: 'NATIVE_RUNTIME26_NOT_READY' }); assert.equal(calls.length, at);
    } finally { f.cleanup(); }
  }
});
