import { reconcileHistoryTypedPublication } from "../adapters/postgres/src/history-typed-publication.ts";
import { reconcileNativeImportStockConservation } from "../adapters/postgres/src/native-import-record-accounting.ts";
import { accountingBatch, accountingTime } from "./support/native-record-accounting-fixtures.ts";
import { stableImportId } from "../packages/application/src/inventory-cutoff-import.ts";
/** MAIN/configuration boundaries only. No database/publication acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { HISTORY_COUNT_KEYS } from "../packages/application/src/history-storage-contract.ts";
import { HISTORY_CLOSURE_SOURCE_ENTITIES, HISTORY_TYPED_CLOSURE_VERSION } from "../packages/application/src/history-typed-closure.ts";
import type { HistoryTypedClosurePlan } from "../packages/application/src/history-typed-closure.ts";
import { authorizeNativeImportAccountingCommand, hasNativeImportAccountingMetadata,
  nativeImportAccountingRequestHash, validateNativeImportAccountingCommand } from "../packages/application/src/native-import-record-accounting.ts";
import { assertNativeImportAccountingGuards, assertNativeImportAccountingSchema19Guards,
  HISTORY18_CLOSURE_CAPABILITY, HISTORY19_CLOSURE_CAPABILITY,
  NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY, NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY } from "../adapters/postgres/src/native-import-accounting-capability.ts";
import type { PgSalesClient } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { accountingChunk, accountingPublish } from "./support/native-record-accounting-fixtures.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";

function plan(): HistoryTypedClosurePlan {
  return { version: HISTORY_TYPED_CLOSURE_VERSION, selectionSha256: "a".repeat(64), authorizedPayloadHash: "b".repeat(64),
    sourceManifestSha256: "c".repeat(64), typedManifestSha256: "d".repeat(64), documentManifestSha256: "e".repeat(64),
    expectedCounts: Object.fromEntries(HISTORY_COUNT_KEYS.map(k => [k, 0])) as HistoryTypedClosurePlan["expectedCounts"],
    sourceEntityCounts: Object.fromEntries(HISTORY_CLOSURE_SOURCE_ENTITIES.map(k => [k, 0])) as HistoryTypedClosurePlan["sourceEntityCounts"], documentCount: 0 };
}
test("entire optional closure enters MAIN hash; omission preserves old command while CHUNK forbids the field", () => {
  const original = accountingPublish(), command = { ...original, historyClosure: plan() };
  assert.equal(nativeImportAccountingRequestHash(original), requestHash(original));
  assert.doesNotThrow(() => validateNativeImportAccountingCommand(command));
  assert.notEqual(nativeImportAccountingRequestHash(command), nativeImportAccountingRequestHash(original));
  for (const key of ["selectionSha256", "authorizedPayloadHash", "sourceManifestSha256", "typedManifestSha256", "documentManifestSha256"] as const) {
    const altered = { ...command, historyClosure: { ...plan(), [key]: "f".repeat(64) } };
    assert.notEqual(nativeImportAccountingRequestHash(altered), nativeImportAccountingRequestHash(command), key);
  }
  assert.throws(() => validateNativeImportAccountingCommand({ ...accountingChunk(), historyClosure: plan() }));
  assert.equal(hasNativeImportAccountingMetadata({ historyClosure: undefined }), true);
});
test("root/nested descriptors and invalid plans fail before cloning or source authorization", async () => {
  let getterCalls = 0, authorizations = 0;
  const top = Object.defineProperty(accountingPublish(), "historyClosure", { enumerable: true, get() { getterCalls++; return plan(); } });
  const nested = Object.defineProperty(plan(), "typedManifestSha256", { enumerable: true, get() { getterCalls++; return "f".repeat(64); } });
  const invalid: unknown[] = [top, ...[undefined, nested, { ...plan(), [Symbol("unhashed")]: true }, { ...plan(), extra: true },
    { ...plan(), sourceEntityCounts: { ...plan().sourceEntityCounts, SALES_HEADER: 1 } }, { ...plan(), documentCount: -0 }]
    .map(historyClosure => ({ ...accountingPublish(), historyClosure }))];
  for (const value of invalid) await assert.rejects(authorizeNativeImportAccountingCommand(value as ReturnType<typeof accountingPublish>,
    { async assertAllowed() { authorizations++; } }));
  assert.equal(authorizations, 0); assert.equal(getterCalls, 0);
});
test("complete command is independently authorized on every call and provider mutation cannot change the captured plan", async () => {
  const command = { ...accountingPublish(), historyClosure: plan() };
  let calls = 0, allowed = true;
  const policy = { async assertAllowed(_actor: string, copy: typeof command) {
    calls++; if (!allowed) throw Error("SYNTHETIC source grant revoked");
    assert.deepEqual(copy, command);
    (copy.historyClosure as unknown as { typedManifestSha256: string }).typedManifestSha256 = "f".repeat(64);
  } };
  // The policy contract accepts all accounting commands, so narrow only inside its assertion.
  const authorization = { assertAllowed: policy.assertAllowed as Parameters<typeof authorizeNativeImportAccountingCommand>[1]["assertAllowed"] };
  assert.deepEqual(await authorizeNativeImportAccountingCommand(command, authorization), command);
  assert.deepEqual(await authorizeNativeImportAccountingCommand(command, authorization), command);
  allowed = false;
  await assert.rejects(authorizeNativeImportAccountingCommand(command, authorization), /revoked/); assert.equal(calls, 3);
});
test("new19 metadata probe keeps every old18 capability except the explicit publication body and takes no write lock", () => {
  assert.equal(HISTORY19_CLOSURE_CAPABILITY.replace("8f949220a449bd0184b995d95a7c6334", "2fa571b4582b80c131b45efeb8f76d48"), HISTORY18_CLOSURE_CAPABILITY);
  assert.match(NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY, /ARRAY\[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19\]/);
  assert.doesNotMatch(NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY, /FOR UPDATE|LOCK TABLE|SELECT naijue_erp\.assert_history_typed_closure\(/);
  assert.match(NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY, /validate_import_accounting_final_record_commit/);
  assert.doesNotMatch(NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY, /8f949220a449bd0184b995d95a7c6334/);
});
test("legacy guard path stays exact; fallback only accepts the separate complete19 result and direct19 rejects closed18", async () => {
  function client(legacy: boolean, next: boolean) {
    const queries: string[] = [];
    return { queries, value: { release() {}, async query(sql: string) { queries.push(sql);
      if (sql === NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY) return { rows: [{ accounting_guards_present: legacy }], rowCount: 1 };
      if (sql === NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY) return { rows: [{ accounting_guards_present: next }], rowCount: 1 };
      return { rows: [{ integrity_guards_present: true }], rowCount: 1 };
    } } as PgSalesClient };
  }
  const old = client(true, false); await assertNativeImportAccountingGuards(old.value); assert.equal(old.queries.length, 2);
  const fresh = client(false, true); await assertNativeImportAccountingGuards(fresh.value); assert.equal(fresh.queries.length, 3);
  const missing = client(false, false); await assert.rejects(assertNativeImportAccountingGuards(missing.value), { code: "NATIVE_IMPORT_GUARDS_NOT_READY" });
  await assert.rejects(assertNativeImportAccountingSchema19Guards(old.value), { code: "NATIVE_IMPORT_GUARDS_NOT_READY" });
});

test("publication26 rechecks exact runtime and immutable/deep/count closures on the original client before returning observed facts",async()=>{
 const p=plan(),base=accountingBatch(),batch={...base,sourceHash:p.selectionSha256,historyMetadata:{payloadHash:p.authorizedPayloadHash,expectedCounts:p.expectedCounts}},versions=Array.from({length:26},(_,i)=>i+1);
 for(const fault of ["", "manifest", "deep", "counts"]) {
  const calls:string[]=[],client:PgSalesClient={release(){assert.fail("not owner");},async query(sql){calls.push(sql);
   if(sql.includes("history-publication:manifest"))return {rows:[{exact:fault!=="manifest"}],rowCount:1};
   if(sql.includes("history-publication:documents"))return {rows:[],rowCount:0};
   if(sql.includes("history-publication:deep-readback")){if(fault==="deep")throw Error("SYNTHETIC actual deep mismatch");return {rows:[],rowCount:1};}
   if(sql.includes("history-publication:counts"))return {rows:[{manifest_counts:p.expectedCounts,actual_counts:{...p.expectedCounts,...(fault==="counts"?{barcodes:1}:{})}}],rowCount:1};
   throw Error("Unexpected publication26 SQL");
  }};let checks=0;const runtime={profile:"EXACT26" as const,contract:"NATIVE_RUNTIME26_V1" as const,async assertReady(c:object,purpose:string){assert.equal(c,client);assert.equal(purpose,"IMPORT_PUBLISH");checks++;}};
  if(fault)await assert.rejects(reconcileHistoryTypedPublication(client,batch,p,versions,runtime));
  else assert.deepEqual((await reconcileHistoryTypedPublication(client,batch,p,versions,runtime)).actualCounts,p.expectedCounts);
  assert.equal(checks,1);assert.ok(calls.every(sql=>!/^BEGIN|^COMMIT|^ROLLBACK|^INSERT|^UPDATE/.test(sql)));
 }
});
test("publication26 and conservation26 revoked runtime cannot become a legacy fallback or successful receipt",async()=>{
 const calls:string[]=[],client:PgSalesClient={release(){assert.fail("not owner");},async query(sql){calls.push(sql);throw Error("must not query");}},p=plan(),base=accountingBatch(),batch={...base,sourceHash:p.selectionSha256,historyMetadata:{payloadHash:p.authorizedPayloadHash,expectedCounts:p.expectedCounts}},versions=Array.from({length:26},(_,i)=>i+1);
 const runtime={profile:"EXACT26" as const,contract:"NATIVE_RUNTIME26_V1" as const,async assertReady(c:object,purpose:string){assert.equal(c,client);assert.equal(purpose,"IMPORT_PUBLISH");throw Error("SYNTHETIC revoked");}};
 await assert.rejects(reconcileHistoryTypedPublication(client,batch,p,versions,runtime),/revoked/);
 await assert.rejects(reconcileHistoryTypedPublication(client,batch,p,versions));
 await assert.rejects(reconcileHistoryTypedPublication(client,batch,p,versions.slice(0,25),runtime));
 const command=accountingPublish(),b=accountingBatch();const transaction={command,batch:{...b,status:"VALIDATING" as const,checkpoint:{...b.checkpoint,sequence:1,cursor:3,counts:{WAREHOUSE:1,SKU:1,INVENTORY_LEDGER:1,IMPORT_BATCH:0}}},operationId:stableImportId("operation",command.actorAccountId,command.requestKey),commandHash:nativeImportAccountingRequestHash(command),now:accountingTime};
 await assert.rejects(reconcileNativeImportStockConservation(client,transaction,runtime),/revoked/);assert.equal(calls.length,0);
});
