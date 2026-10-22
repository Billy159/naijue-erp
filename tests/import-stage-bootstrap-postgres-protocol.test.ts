/** Original store/service + scripted client only; not PG/bootstrap source/data evidence. */
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { GUARD_CAPABILITY } from "../adapters/postgres/src/inventory-publication-guards.ts";
import { NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY, NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY } from "../adapters/postgres/src/native-import-accounting-capability.ts";
import assert from "node:assert/strict";
import { PostgresCutoffImportStore } from "../adapters/postgres/src/inventory-cutoff-import-store.ts";
import type { ImportStageBootstrap, ImportStageBootstrap26 } from "../adapters/postgres/src/inventory-cutoff-import-store.ts";
import { createCutoffImportService, stableImportId } from "../packages/application/src/inventory-cutoff-import.ts";
import { HISTORY_MAPPING_VERSION } from "../packages/application/src/history-storage-contract.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";
import { cutoffStage, cutoffTime } from "./support/synthetic-cutoff-fixtures.ts";
const stage = { ...cutoffStage, mappingVersion: HISTORY_MAPPING_VERSION, historyMetadata: { payloadHash: "b".repeat(64),
  expectedCounts: { import_source_row: 0, import_sku_alias: 0, history_sales_header: 0, history_transfer_header: 0,
    history_sales_line: 0, history_transfer_line: 0, history_sales_settlement: 0, import_stock_contributor: 0, barcodes: 0 } } };
const allowedProbe = "/* native-party-import:schema */ SELECT array_agg(version ORDER BY version) AS installed_versions FROM naijue_erp.schema_migration";
function protocol(options: { failure?: string; zero?: string; pending?: string; successor?: boolean; runtimeFailureAt?: number; pendingRuntime?: boolean } = {}) {
  let runtimeChecks = 0;
  const calls: { sql: string; values: unknown[] }[] = [], released: unknown[] = []; let connects = 0, allowed = true, authorizations = 0;
  let receipt: Record<string, unknown> | undefined, batchExists = false;
  const failure = Error("SYNTHETIC_" + options.failure);
  const pool = { async connect() { connects++; return { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values }); let rows: Record<string, unknown>[] = [], rowCount = 1;
    if (options.failure && (options.failure === "COMMIT" ? sql === "COMMIT" : sql.includes(options.failure))) throw failure;
    if (options.pending && sql === options.pending) await new Promise<void>(resolve => setImmediate(resolve));
    if (sql.includes("history-lifecycle:schema")) rows = [{ versions: Array.from({ length: options.successor ? 26 : 19 }, (_, i) => i + 1) }];
    else if (sql.includes("inventory:guards")) rows = [{ integrity_guards_present: true }];
    else if (sql.includes("accounting_guards_present")) rows = [{ accounting_guards_present: true }];
    else if (sql.includes("FROM naijue_erp.operation_receipt")) rows = receipt ? [receipt] : [];
    else if (sql.includes("FROM naijue_erp.import_batch WHERE id = $1 FOR UPDATE")) rows = batchExists ? [{ id: stage.batchId }] : [];
    else if (sql.startsWith("INSERT INTO naijue_erp.import_batch")) batchExists = true;
    else if (sql.startsWith("INSERT INTO naijue_erp.operation_receipt")) receipt = { request_hash: values[3], target_type: "IMPORT", target_id: values[5], action: values[4], result_data: JSON.parse(values[6] as string) };
    if (options.zero && sql.startsWith("INSERT INTO naijue_erp." + options.zero)) rowCount = 0;
    return { rows, rowCount };
  }, release(error?: unknown) { released.push(error); } }; } };
  function service(bootstrap: ImportStageBootstrap) { return createCutoffImportService({ now: () => cutoffTime,
    authorization: { async assertAllowed() { authorizations++; if (!allowed) throw Object.assign(Error("SYNTHETIC_REVOKED"), { code: "FORBIDDEN" }); } },
    store: new PostgresCutoffImportStore(pool, { stageBootstrap: bootstrap }) }); }
  function service26(bootstrap: ImportStageBootstrap26) { return createCutoffImportService({ now: () => cutoffTime,
    authorization: { async assertAllowed() { authorizations++; if (!allowed) throw Object.assign(Error("SYNTHETIC_REVOKED"), { code: "FORBIDDEN" }); } },
    store: new PostgresCutoffImportStore(pool, { stageBootstrap26: bootstrap, runtime26: { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady(client, purpose) {
      assert.equal(typeof (client as { release?:unknown }).release, "function"); assert.equal(purpose, "IMPORT_STAGE"); runtimeChecks++;
      if (runtimeChecks === options.runtimeFailureAt) throw Error("SYNTHETIC exact26 runtime rejected");
      if (options.pendingRuntime) await new Promise<void>(resolve => setImmediate(resolve));
    } } }) }); }
  return { calls, released, failure, service, service26, runtimeChecks: () => runtimeChecks, connects: () => connects, authCount: () => authorizations, revoke: () => { allowed = false; } };
}
test("first source STAGE bootstrap uses only the original query lease after batch creation and before audit/receipt", async () => {
  const p = protocol(); let called = 0, escaped: Parameters<ImportStageBootstrap["stageNewBatch"]>[0] | undefined;
  const service = p.service({ async stageNewBatch(client, input) {
    called++; escaped = client; assert.deepEqual(Reflect.ownKeys(client), ["query"]); assert.deepEqual(input.command, stage);
    assert.equal(input.now, cutoffTime); assert.equal(input.operationId, stableImportId("operation", stage.actorAccountId, stage.requestKey));
    assert.equal(p.calls.at(-1)!.sql.startsWith("INSERT INTO naijue_erp.import_batch"), true);
    await client.query(allowedProbe);
  } });
  const result = await service.execute(stage); assert.equal(result.status, "STAGED"); assert.equal(called, 1); assert.equal(p.connects(), 1);
  const index = (name: string) => p.calls.findIndex(c => c.sql.includes(name));
  assert.ok(index("native-party-import:schema") < index("INSERT INTO naijue_erp.audit_change"));
  assert.ok(index("INSERT INTO naijue_erp.audit_change") < index("INSERT INTO naijue_erp.operation_receipt"));
  assert.equal(p.calls.filter(c => c.sql === "COMMIT").length, 1); assert.deepEqual(p.released, [undefined]);
  assert.throws(() => escaped!.query("SELECT 1"), { code: "TRANSACTION_CLOSED" });
});
test("original-key STAGE replay reauthorizes before return and never reruns bootstrap; changed payload and revoked actor fail", async () => {
  const p = protocol(); let called = 0;
  const service = p.service({ async stageNewBatch() { called++; } });
  const first = await service.execute(stage), count = p.calls.length;
  assert.deepEqual(await service.execute(stage), first); assert.equal(called, 1); assert.equal(p.authCount(), 2);
  assert.ok(p.calls.slice(count).every(c => !/^(?:INSERT|UPDATE)/.test(c.sql)));
  await assert.rejects(service.execute({ ...stage, sourceManifestRef: "changed-exact-source" }), { code: "IDEMPOTENCY_CONFLICT" });
  p.revoke(); const before = p.connects(); await assert.rejects(service.execute(stage), { code: "FORBIDDEN" }); assert.equal(p.connects(), before); assert.equal(called, 1);
});
test("bootstrap failure rolls back original stage and performs no audit/receipt insert", async () => {
  const p = protocol(), failure = Error("SYNTHETIC_BOOTSTRAP_FAILURE");
  await assert.rejects(p.service({ async stageNewBatch(client) { await client.query(allowedProbe); throw failure; } }).execute(stage), error => error === failure);
  assert.equal(p.calls.at(-1)!.sql, "ROLLBACK"); assert.ok(p.calls.every(c => !c.sql.startsWith("INSERT INTO naijue_erp.audit_change") && !c.sql.startsWith("INSERT INTO naijue_erp.operation_receipt")));
});
test("bootstrap cannot commit, release, run multiple statements, mutate original command or ignore query failure", async () => {
  for (const sql of ["COMMIT", "ROLLBACK", "BEGIN", "/* comment */ COMMIT", "SELECT 1; COMMIT", "SET ROLE owner"]) {
    const p = protocol(); await assert.rejects(p.service({ async stageNewBatch(client) { await client.query(sql); } }).execute(stage), { code: "TRANSACTION_SCOPE" });
    if (sql === "ROLLBACK") assert.equal(p.calls.filter(c => c.sql === sql).length, 1); // Enclosing owner's legitimate cleanup only.
    else assert.ok(p.calls.every(c => c.sql !== sql));
    assert.equal(p.calls.at(-1)!.sql, "ROLLBACK");
  }
  const changed = protocol(); await assert.rejects(changed.service({ async stageNewBatch(_client, input) {
    (input.command.expected as { SKU: number }).SKU++;
  } }).execute(stage), { code: "IMPORT_BOOTSTRAP_COMMAND_MUTATION" });
  const ignored = protocol({ failure: allowedProbe }); await assert.rejects(ignored.service({ async stageNewBatch(client) {
    await client.query(allowedProbe).catch(() => undefined);
  } }).execute(stage), error => error === ignored.failure);
});
test("bootstrap stage requires actual audit and receipt insert counts; unknown COMMIT only discards", async () => {
  for (const zero of ["audit_change", "operation_receipt"]) {
    const p = protocol({ zero }); await assert.rejects(p.service({ async stageNewBatch() {} }).execute(stage), { code: "NATIVE_IMPORT_EVIDENCE_INSERT" });
    assert.equal(p.calls.at(-1)!.sql, "ROLLBACK");
  }
  const p = protocol({ failure: "COMMIT" }); await assert.rejects(p.service({ async stageNewBatch() {} }).execute(stage), error => error === p.failure);
  assert.deepEqual(p.released, [p.failure]); assert.equal(p.calls.filter(c => c.sql === "ROLLBACK").length, 0); assert.equal(p.connects(), 1);
  assert.ok(p.calls.some(c => c.sql.startsWith("INSERT INTO naijue_erp.operation_receipt"))); // Failure is truly after evidence, not READ COMMITTED's BEGIN.
  assert.equal(requestHash(stage), requestHash(structuredClone(stage)));
});
test("unawaited in-flight bootstrap work is drained then rejected before the owner rolls back", async () => {
  const p = protocol({ pending: allowedProbe }); await assert.rejects(p.service({ async stageNewBatch(client) {
    void client.query(allowedProbe);
  } }).execute(stage), { code: "TRANSACTION_SCOPE" });
  assert.equal(p.calls.at(-1)!.sql, "ROLLBACK"); assert.ok(p.calls.every(c => !c.sql.startsWith("INSERT INTO naijue_erp.audit_change")));
});

function actualBootstrapStatements(): readonly string[] {
 const queries: string[]=[];
 const paths=['scripts/import-v3/native-bootstrap.mjs','adapters/postgres/src/native-party-import.ts','adapters/postgres/src/import-v3-history-header-native-reference-store.ts'];
for(const path of paths) {
 const content=readFileSync(new URL('../'+path,import.meta.url),'utf8'), sf=ts.createSourceFile(path,content,ts.ScriptTarget.Latest,true);
 let tables: string[]=[];
 function arrays(n: ts.Node) { if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='EMPTY_TABLES') tables=JSON.parse(n.initializer!.getText(sf).replaceAll("'",'"')); ts.forEachChild(n,arrays); } arrays(sf);
 function visit(n: ts.Node) {
  if(ts.isCallExpression(n)&&n.expression.getText(sf)==='client.query') {
   const arg=n.arguments[0]!; let variants: string[]=[];
   if(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg)) variants=[arg.text];
   else if(ts.isTemplateExpression(arg)) {
    const tag=arg.head.text;
    const names=tag.includes('history-header-reference:native')?['hall','customer','staff']
      :tag.includes('relation-native')?['hall','customer','warehouse']:['hall','customer','supplier','staff','warehouse'];
    const needsTable=arg.templateSpans.some(s=>['table(row)','relation.table','target.table'].includes(s.expression.getText(sf)));
    const needsColumn=arg.templateSpans.some(s=>s.expression.getText(sf)==='column');
    for(const table of needsTable?names:['']) for(const column of needsColumn?['native_customer_id','native_hall_id']:['']) {
     let sql=arg.head.text;
     for(const span of arg.templateSpans) {
      const expression=span.expression.getText(sf); let value;
      if(['table(row)','relation.table','target.table'].includes(expression)) value=table;
      else if(expression==="party ? ' OR code=$2' : ''") value=['customer','supplier'].includes(table)?' OR code=$2':'';
      else if(expression==='column') value=column;
      else if(expression==="EMPTY_TABLES.map(name => `EXISTS(SELECT 1 FROM naijue_erp.${name})`).join(' OR ')") value=tables.map(name=>`EXISTS(SELECT 1 FROM naijue_erp.${name})`).join(' OR ');
      else throw Error('Unreviewed SQL interpolation '+expression);
      sql+=value+span.literal.text;
     } variants.push(sql);
    }
   } else throw Error('Unreviewed SQL expression '+arg.getText(sf));
   for(const sql of variants) if(sql.startsWith('/*')) queries.push(sql);
  } ts.forEachChild(n,visit);
 } visit(sf);
}
 queries.push(GUARD_CAPABILITY,NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY,NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY);
 return [...new Set(queries)];
}

test("finite bootstrap boundary accepts every actual reviewed provider statement with exact arity", async () => {
  const queries = actualBootstrapStatements(); assert.equal(queries.length, 46);
  const p = protocol();
  await p.service({ async stageNewBatch(client) {
    for (const sql of queries) {
      const arity = Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1])));
      await client.query(sql, Array.from({length: arity}, () => "SYNTHETIC_DATA_ONLY"));
    }
  } }).execute(stage);
  for (const sql of queries) assert.ok(p.calls.some(call => call.sql === sql));
  assert.equal(p.calls.at(-1)!.sql, "COMMIT");
});
test("finite bootstrap boundary rejects direct parameterized CTE and disguised session effects before driver", async () => {
  const attempts: readonly [string, unknown[]][] = [
    ["SELECT set_config($1::text,$2::text,false)", ["statement_timeout", "0"]],
    ["SELECT pg_catalog.set_config('role','owner',false)", []],
    ["WITH s AS (SELECT set_config($1,$2,false)) SELECT * FROM s", ["search_path", "public"]],
    ["SELECT (SELECT set_config($1,$2,false))", ["application_name", "changed"]],
    [allowedProbe + "; SELECT set_config($1,$2,false)", ["statement_timeout", "0"]],
    [allowedProbe.replace("array_agg(version ORDER BY version)", "set_config('statement_timeout','0',false)"), []],
    [allowedProbe + " -- unchanged prefix cannot authorize more text", []],
    ["SELECT pg_advisory_lock(1)", []], ["SELECT pg_notify($1,$2)", ["channel", "payload"]],
    [allowedProbe, ["EXTRA_PARAMETER"]]
  ];
  for (const [sql, values] of attempts) {
    const p = protocol();
    await assert.rejects(p.service({ async stageNewBatch(client) {
      try { await client.query(sql, values); } catch {} // Rejection poisons this callback even if swallowed.
    } }).execute(stage), { code: "TRANSACTION_SCOPE" });
    assert.ok(p.calls.every(call => call.sql !== sql));
    assert.equal(p.calls.at(-1)!.sql, "ROLLBACK");
    assert.ok(p.calls.every(call => !call.sql.startsWith("INSERT INTO naijue_erp.audit_change")));
  }
});
test("finite bootstrap boundary passes hostile parameter text only as data and rejects executable parameter objects", async () => {
  const sql = actualBootstrapStatements().find(q => q.startsWith("/* native-bootstrap:one-new-batch */"))!;
  const payload = "'; SELECT set_config('statement_timeout','0',false); --";
  const p = protocol(); await p.service({async stageNewBatch(client) { await client.query(sql, [payload]); }}).execute(stage);
  assert.deepEqual(p.calls.find(c => c.sql === sql)!.values, [payload]);
  for (const value of [{toPostgres() { throw Error("must not execute"); }}, undefined]) {
    const rejected = protocol(); await assert.rejects(rejected.service({async stageNewBatch(client) {
      await client.query(sql, [value]);
    }}).execute(stage), {code: "TRANSACTION_SCOPE"});
    assert.ok(rejected.calls.every(c => c.sql !== sql));
  }
});

const target26 = `/* native-bootstrap26:target */ SELECT current_database()::text database,current_user::text role,
        inet_server_addr()::text server_address,inet_server_port() server_port,pg_postmaster_start_time()::text postmaster_started_at,
        (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) versions`;
test("cutoff26 first stage derives same-underlying-client callback runtime and separate finite SQL, then original audit receipt commit",async()=>{
 const p=protocol({successor:true});let called=0,escaped:Parameters<ImportStageBootstrap26["stageNewBatch26"]>[0]|undefined,cap:Parameters<ImportStageBootstrap26["stageNewBatch26"]>[2]|undefined;
 const service=p.service26({async stageNewBatch26(client,input,runtime){called++;escaped=client;cap=runtime;assert.deepEqual(Reflect.ownKeys(client),["query"]);assert.deepEqual(input.command,stage);
  await runtime.assertReady(client,"IMPORT_STAGE");await client.query(target26);await client.query(allowedProbe);
 }});
 assert.equal((await service.execute(stage)).status,"STAGED");assert.equal(called,1);assert.equal(p.runtimeChecks(),4);assert.equal(p.connects(),1);
 const index=(x:string)=>p.calls.findIndex(c=>c.sql.includes(x));assert.ok(index("native-bootstrap26:target")<index("INSERT INTO naijue_erp.audit_change"));assert.equal(p.calls.at(-1)!.sql,"COMMIT");
 assert.ok(!p.calls.some(c=>c.sql.includes("inventory:guards")||c.sql.includes("accounting_guards_present")));
 assert.throws(()=>escaped!.query(target26),{code:"TRANSACTION_CLOSED"});assert.throws(()=>cap!.assertReady(escaped!,"IMPORT_STAGE"),{code:"TRANSACTION_CLOSED"});
 const before=p.calls.length;assert.equal((await service.execute(stage)).status,"STAGED");assert.equal(called,1);assert.ok(p.calls.slice(before).every(c=>!/^INSERT|^UPDATE/.test(c.sql)));
});
test("cutoff26 callback runtime wrong-client wrong-purpose or deniedSQL poisons original transaction even if provider catches",async()=>{
 for(const mode of ["client","purpose","legacyGuard","sql","arity"]){
  const p=protocol({successor:true});await assert.rejects(p.service26({async stageNewBatch26(client,_input,runtime){
   try {
    if(mode==="client")await runtime.assertReady({query:client.query},"IMPORT_STAGE");
    else if(mode==="purpose")await runtime.assertReady(client,"IMPORT_PUBLISH");
    else await client.query(mode==="legacyGuard"?GUARD_CAPABILITY:mode==="sql"?"/* native-bootstrap26:target */ SELECT 1":target26,mode==="arity"?[1]:[]);
   }catch{}
  }}).execute(stage));
  assert.equal(p.calls.at(-1)!.sql,"ROLLBACK");assert.ok(!p.calls.some(c=>c.sql.startsWith("INSERT INTO naijue_erp.audit_change")));
 }
});
test("cutoff26 runtime denial/unawaited verification cannot issue receipt; no cap or mixed bootstrap rejects",async()=>{
 for(const runtimeFailureAt of [1,2,3]){
  const p=protocol({successor:true,runtimeFailureAt});await assert.rejects(p.service26({async stageNewBatch26(){assert.fail("not reached");}}).execute(stage),/runtime rejected/);
  assert.ok(!p.calls.some(c=>c.sql.startsWith("INSERT INTO naijue_erp.audit_change")));if(runtimeFailureAt===1)assert.equal(p.calls.length,0);
 }
 const pending=protocol({successor:true,pendingRuntime:true});await assert.rejects(pending.service26({async stageNewBatch26(client,_input,runtime){void runtime.assertReady(client,"IMPORT_STAGE");}}).execute(stage));
 assert.equal(pending.calls.at(-1)!.sql,"ROLLBACK");
 assert.throws(()=>new PostgresCutoffImportStore({async connect(){throw Error("no connection");}},{stageBootstrap26:{async stageNewBatch26(){}}}),{code:"IMPORT_BOOTSTRAP_REQUIRED"});
});
test("cutoff26 exact audit/receipt insert counts remain mandatory and unknown commit never retries or rolls back",async()=>{
 for(const zero of ["audit_change","operation_receipt"]){const p=protocol({successor:true,zero});await assert.rejects(p.service26({async stageNewBatch26(){}}).execute(stage),{code:"NATIVE_IMPORT_EVIDENCE_INSERT"});assert.equal(p.calls.at(-1)!.sql,"ROLLBACK");}
 const p=protocol({successor:true,failure:"COMMIT"});await assert.rejects(p.service26({async stageNewBatch26(){}}).execute(stage),error=>error===p.failure);
 assert.equal(p.calls.at(-1)!.sql,"COMMIT");assert.equal(p.calls.filter(c=>c.sql==="ROLLBACK").length,0);assert.equal(p.connects(),1);assert.deepEqual(p.released,[p.failure]);
 const old=protocol({successor:true});await assert.rejects(old.service({async stageNewBatch(){assert.fail("old bootstrap must not run26");}}).execute(stage));assert.ok(!old.calls.some(c=>c.sql.startsWith("INSERT INTO naijue_erp.import_batch")));
});
