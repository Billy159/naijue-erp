/** OFFLINE LAYER1 CANDIDATE: scripted manager/pure contracts only. No PostgreSQL,
 * real locks, DDL, persistence, HTTP version negotiation or deployment evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PostgresPostingBalances } from "../adapters/postgres/src/inventory-posting-balances.ts";
import type { InventoryBalanceRow, InventoryLedgerRow } from "../packages/domain/src/inventory.ts";
import { businessDate, quantity, version } from "../packages/domain/src/values.ts";
import { checkedInventoryLedgerSnapshot } from "../packages/application/src/inventory-ledger-query-validation.ts";
import { inventoryScope, inventoryId, ledgerDisplayEntry, ledgerNumberedParameters, ledgerRead, ledgerSnapshot } from "./support/synthetic-inventory-ledger-query.ts";
import { actor, fixture, ids, sid, syntheticDraft } from "./support/synthetic-fixtures.ts";

interface Token { readonly quantityBefore: InventoryBalanceRow["quantity"]; readonly quantityAfter: InventoryBalanceRow["quantity"] }
interface CandidateMethods { prepareLiveAppend(row: InventoryLedgerRow): Token; didAppendLive(token: Token): void }
function feature(manager: PostgresPostingBalances): PostgresPostingBalances & CandidateMethods {
  const candidate = manager as PostgresPostingBalances & Partial<CandidateMethods>;
  assert.equal(typeof candidate.prepareLiveAppend, "function", "Missing feature: original locked-balance manager must prepare exact native before/after facts");
  assert.equal(typeof candidate.didAppendLive, "function", "Missing feature: ledger acknowledgement must bind the prepared manager token");
  return manager as PostgresPostingBalances & CandidateMethods;
}
const at = "2026-10-30T12:00:00.000000Z", batch = sid("operation", 30000);
const key = { warehouseId: ids.warehouse, skuId: ids.sku };
function entry(delta = "-2", n = 1, overrides: Partial<InventoryLedgerRow> = {}): InventoryLedgerRow {
  return { id: sid("ledger", 31000+n), operationId: sid("operation", 32000), eventKind: "APPROVE", ...key,
    quantityDelta: quantity(delta), source: { kind: "SALES", salesId: ids.sales, salesLineId: sid("salesLine", 33000+n), endpoint: "SALES_WAREHOUSE" },
    sourceDocumentVersion: version(2), reversesEntryId: null, businessDate: businessDate("2026-10-30"), postedAt: at, ...overrides };
}
function stored(amount = "100", v = 7): InventoryBalanceRow {
  return { ...key, quantity: quantity(amount), version: version(v), lastOperationId: sid("operation", 31999), updatedAt: at };
}
async function harness(initial: readonly InventoryBalanceRow[] = [stored()], runtime: ConstructorParameters<typeof PostgresPostingBalances>[1] = null) {
  const calls: { sql: string; values: unknown[] }[] = [];
  let failUpdate = false;
  let writeError: Error | undefined;
  let deferredWrite: { readonly entered: () => void; readonly wait: Promise<void> } | undefined;
  const manager = new PostgresPostingBalances(async (sql, values = []) => {
    calls.push({ sql, values: structuredClone(values) });
    if (sql.startsWith("SELECT naijue_erp.inventory_key_lock")) return { rows: [], rowCount: 1 };
    if (sql.includes("FOR UPDATE OF b")) return { rows: initial.map(row => ({ warehouse_id: row.warehouseId, sku_id: row.skuId,
      quantity: row.quantity.toString(), version: row.version, last_operation_id: row.lastOperationId, updated_at: row.updatedAt })), rowCount: initial.length };
    if (sql.includes("posting:publication")) {
      const counts = { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 0, IMPORT_BATCH: 1 };
      return { rows: [{ id: batch, completed: true, final_approval: true, checkpoint: { sequence: 1, cursor: 3, expected: counts, counts } }], rowCount: 1 };
    }
    if (sql.includes("posting:guards")) return { rows: [{ integrity_guards_present: true }], rowCount: 1 };
    if (sql.includes("posting:zero-key")) return { rows: [{ warehouse_id: key.warehouseId, sku_id: key.skuId,
      warehouse_published: true, sku_published: true, balance_absent: true, ledger_absent: true, valid_size: true }], rowCount: 1 };
    if (sql.startsWith("UPDATE naijue_erp.inventory_balance") || sql.startsWith("INSERT INTO naijue_erp.inventory_balance")) {
      const gate = deferredWrite; deferredWrite = undefined;
      if (gate) { gate.entered(); await gate.wait; }
      if (writeError) throw writeError;
      return { rows: [], rowCount: failUpdate ? 0 : 1 };
    }
    assert.fail(`Unexpected scripted manager query: ${sql}`);
  }, runtime);
  await manager.lock(initial.length ? initial : [key]);
  return { manager, calls, loseNextWrite: () => { failUpdate = true; }, restoreWrites: () => { failUpdate = false; writeError = undefined; },
    throwOnWrite: (error: Error) => { writeError = error; }, deferNextWrite: () => {
    assert.equal(deferredWrite, undefined);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    deferredWrite = { entered, wait }; return { started, release };
  } };
}
function next(previous: InventoryBalanceRow | undefined, effect: InventoryLedgerRow, token: Token): InventoryBalanceRow {
  return { warehouseId: effect.warehouseId, skuId: effect.skuId, quantity: token.quantityAfter,
    version: version((previous?.version ?? 0)+1), lastOperationId: effect.operationId, updatedAt: effect.postedAt };
}
const writes = (h: Awaited<ReturnType<typeof harness>>) => h.calls.filter(call => /^(INSERT|UPDATE|DELETE)/.test(call.sql));

test("LIVE layer1 RED existing seam: repeated real lines capture sequential actual locked balances without writing during prepare", async () => {
  const h = await harness(), m = feature(h.manager), first = entry(), original = m.get(key.warehouseId,key.skuId)!;
  const a = m.prepareLiveAppend(first);
  assert.deepEqual(a, { quantityBefore: quantity("100"), quantityAfter: quantity("98") }); assert.ok(Object.isFrozen(a));
  assert.equal(writes(h).length, 0); assert.equal(m.get(key.warehouseId,key.skuId)!.quantity, quantity("100"));
  m.didAppendLive(a); await m.put(next(original, first, a));
  const second = entry("-3",2), b = m.prepareLiveAppend(second);
  assert.deepEqual(b, { quantityBefore: quantity("98"), quantityAfter: quantity("95") });
  m.didAppendLive(b); await m.put(next(m.get(key.warehouseId,key.skuId),second,b));
  assert.equal(m.get(key.warehouseId,key.skuId)!.version,9); assert.equal(writes(h).length,2);
});
test("LIVE layer1 RED existing seam: reversal uses current83→85, never original100→98 snapshot copied on the row", async () => {
  const h = await harness([stored("83")]), m = feature(h.manager);
  const reverse = entry("2",2,{eventKind:"UNAPPROVE",reversesEntryId:sid("ledger",31001)});
  Object.assign(reverse,{quantityBefore:quantity("100"),quantityAfter:quantity("98")});
  const a = m.prepareLiveAppend(reverse);
  assert.deepEqual(a,{quantityBefore:quantity("83"),quantityAfter:quantity("85")});
  m.didAppendLive(a); await m.put(next(stored("83"),reverse,a)); assert.equal(m.get(key.warehouseId,key.skuId)!.quantity,quantity("85"));
});
test("LIVE layer1 RED existing seam: two transfer endpoints keep independent pending/running balances across repeated SKU lines", async () => {
  const otherWarehouse=sid("warehouse",34000),from=stored("10"),to={...stored("4"),warehouseId:otherWarehouse};
  const h=await harness([from,to]),m=feature(h.manager);
  const source={kind:"TRANSFER" as const,transferId:sid("transfer",34001),transferLineId:sid("transferLine",34002)};
  const out=entry("-3",1,{source:{...source,endpoint:"FROM"}}),inside=entry("3",2,{warehouseId:otherWarehouse,source:{...source,endpoint:"TO"}});
  const a=m.prepareLiveAppend(out),b=m.prepareLiveAppend(inside);
  assert.deepEqual(a,{quantityBefore:quantity("10"),quantityAfter:quantity("7")});assert.deepEqual(b,{quantityBefore:quantity("4"),quantityAfter:quantity("7")});
  assert.equal(writes(h).length,0);m.didAppendLive(a);m.didAppendLive(b);await m.put(next(from,out,a));await m.put(next(to,inside,b));
  const c=m.prepareLiveAppend(entry("-2",3,{source:{...source,transferLineId:sid("transferLine",34003),endpoint:"FROM"}}));
  const d=m.prepareLiveAppend(entry("2",4,{warehouseId:otherWarehouse,source:{...source,transferLineId:sid("transferLine",34003),endpoint:"TO"}}));
  assert.deepEqual(c,{quantityBefore:quantity("7"),quantityAfter:quantity("5")});assert.deepEqual(d,{quantityBefore:quantity("7"),quantityAfter:quantity("9")});
});
test("LIVE layer1 RED existing seam: absent is not zero; only original explicit proof permits first0→-2", async () => {
  const h = await harness([]), m = feature(h.manager), e = entry();
  assert.throws(()=>m.prepareLiveAppend(e),{code:"INVENTORY_NOT_READY"}); assert.equal(writes(h).length,0);
  await m.assertZero(key.warehouseId,key.skuId);
  const a=m.prepareLiveAppend(e); assert.deepEqual(a,{quantityBefore:quantity("0"),quantityAfter:quantity("-2")});
  m.didAppendLive(a); await m.put(next(undefined,e,a)); assert.equal(writes(h).length,1);
  assert.match(writes(h)[0]!.sql,/^INSERT INTO naijue_erp.inventory_balance/); assert.equal(writes(h)[0]!.values[2],"-2");
  const absent=await harness([]), reverse=feature(absent.manager);
  assert.throws(()=>reverse.prepareLiveAppend(entry("2",2,{eventKind:"UNAPPROVE",reversesEntryId:sid("ledger",31001)})),{code:"INVENTORY_NOT_READY"});
});
test("LIVE layer1 RED existing seam: pending acknowledgement is exact-token/key/operation/time/version bound and cannot bypass append→put", async () => {
  const h=await harness(),m=feature(h.manager),e=entry(),a=m.prepareLiveAppend(e),expected=next(stored(),e,a);
  assert.throws(()=>m.prepareLiveAppend(entry("-3",2)),{code:"TRANSACTION_SCOPE"});
  await assert.rejects(m.put(expected),{code:"INVENTORY_INTEGRITY_FAILED"});
  assert.throws(()=>m.didAppendLive({...a}),{code:"TRANSACTION_SCOPE"});
  const other=feature((await harness()).manager);assert.throws(()=>other.didAppendLive(a),{code:"TRANSACTION_SCOPE"});
  assert.throws(()=>m.didAppend(e),{code:"TRANSACTION_SCOPE"});m.didAppendLive(a);
  assert.throws(()=>m.didAppendLive(a),{code:"TRANSACTION_SCOPE"});
  for(const bad of [{...expected,quantity:quantity("97")},{...expected,version:version(9)},
    {...expected,lastOperationId:sid("operation",32001)},{...expected,updatedAt:"2026-10-30T12:00:01.000000Z"}])
    await assert.rejects(m.put(bad),{code:"INVENTORY_INTEGRITY_FAILED"});
  assert.equal(writes(h).length,0);await m.put(expected);assert.throws(()=>m.didAppendLive(a),{code:"TRANSACTION_SCOPE"});
});
test("LIVE layer1 RED existing seam: prepare clones caller input; CAS failure does not advance balance or release pending transition", async () => {
  const h=await harness(),m=feature(h.manager),e=entry(),a=m.prepareLiveAppend(e);
  const expected=next(stored(),e,a);Object.assign(e,{quantityDelta:quantity("-50"),operationId:sid("operation",32002),postedAt:"2026-10-30T13:00:00.000000Z"});
  m.didAppendLive(a);h.loseNextWrite();await assert.rejects(m.put(expected),{code:"VERSION_CONFLICT"});
  assert.equal(m.get(key.warehouseId,key.skuId)!.quantity,quantity("100"));assert.throws(()=>m.prepareLiveAppend(entry("-3",2)),{code:"TRANSACTION_SCOPE"});
});
for (const mode of ["UPDATE", "FIRST_INSERT"] as const) {
  test(`LIVE layer1 r2 RED private balance copy: deferred ${mode} caller mutation cannot poison acknowledged SQL/cache/next snapshot`, async () => {
    const fresh = mode === "FIRST_INSERT", h = await harness(fresh ? [] : [stored()]), m = feature(h.manager), e = entry();
    if (fresh) await m.assertZero(key.warehouseId, key.skuId);
    const token = m.prepareLiveAppend(e), previous = m.get(key.warehouseId, key.skuId);
    m.didAppendLive(token);
    const submitted = next(previous, e, token), expected = structuredClone(submitted), gate = h.deferNextWrite();
    const writing = m.put(submitted);
    await gate.started;
    const sqlWrite = writes(h).at(-1)!;
    assert.equal(sqlWrite.values[0], key.warehouseId); assert.equal(sqlWrite.values[1], key.skuId);
    assert.equal(sqlWrite.values[2], expected.quantity.toString()); assert.equal(sqlWrite.values[3], expected.version);
    assert.equal(sqlWrite.values[4], expected.lastOperationId); assert.equal(sqlWrite.values[5], expected.updatedAt);
    Object.assign(submitted, { warehouseId: sid("warehouse", 35000), skuId: sid("sku", 35001), quantity: quantity("777"),
      version: version(900), lastOperationId: sid("operation", 35002), updatedAt: "2026-10-30T14:00:00.000000Z" });
    gate.release(); await writing;
    assert.deepEqual(m.get(key.warehouseId, key.skuId), expected, "Cache must contain the private pre-await row that SQL acknowledged, not later caller values");
    const later = m.prepareLiveAppend(entry("-3", 2));
    assert.equal(later.quantityBefore, expected.quantity); assert.equal(later.quantityAfter, quantity((expected.quantity - 3n).toString()));
    assert.equal(sqlWrite.values[2], expected.quantity.toString());
  });
}
test("LIVE layer1 RED existing seam: int64 endpoints stay exact above2^53 and overflow fails before any acknowledgement/write", async () => {
  const h=await harness([stored("9007199254740993")]),m=feature(h.manager),a=m.prepareLiveAppend(entry("2"));
  assert.deepEqual(a,{quantityBefore:quantity("9007199254740993"),quantityAfter:quantity("9007199254740995")});
  const boundary=await harness([stored("9223372036854775807")]),b=feature(boundary.manager);
  assert.throws(()=>b.prepareLiveAppend(entry("1")),{code:"QUANTITY_OVERFLOW"});assert.equal(writes(boundary).length,0);
  assert.equal(b.prepareLiveAppend(entry("-1")).quantityAfter,quantity("9223372036854775806"));
});
test("LIVE layer1 RED existing seam: existing history batch context cannot prepare LIVE snapshots even when current balance is known", async () => {
  const h=await harness([stored()],{profile:"EXACT24",async assertReady(){}}),m=feature(h.manager);
  assert.throws(()=>m.prepareLiveAppend(entry()),{code:"TRANSACTION_SCOPE"});
  m.assertCanAppend({...entry(),eventKind:"HISTORY_REVISION"});assert.equal(writes(h).length,0);
});

function knownPage(before="9007199254740993",after="9007199254740995") {
  const q=ledgerNumberedParameters(),read=ledgerRead(q),e=ledgerDisplayEntry(1),s=ledgerSnapshot(read,[e]);
  Object.assign(e.display!,{balanceTransition:{state:"KNOWN",before,after,reason:"RECORDED_BALANCE_TRANSITION"}});
  return {q,s:{...s,data:{...s.data,page:1,filteredTotal:"1"}}};
}
test("LIVE layer1 RED original reader contract: valid native KNOWN exact strings accepted, immutable, no Number conversion", () => {
  const {q,s}=knownPage(),checked=checkedInventoryLedgerSnapshot(s,q,inventoryScope),t=checked.data.entries[0]!.display!.balanceTransition;
  assert.deepEqual(t,{state:"KNOWN",before:"9007199254740993",after:"9007199254740995",reason:"RECORDED_BALANCE_TRANSITION"});assert.ok(Object.isFrozen(t));
});
test("LIVE layer1 original reader contract: old native/history/baseline stay UNKNOWN; known history is rejected even when arithmetic fits", () => {
  for(const kind of ["SALES","CUTOFF_BASELINE","HISTORY_REVISION"] as const) {
    const {q,s}=knownPage(),e=s.data.entries[0]!;
    Object.assign(e.display!,{balanceTransition:{state:"UNKNOWN",before:null,after:null,reason:"NO_RECORDED_BALANCE_TRANSITION"}});
    if(kind==="CUTOFF_BASELINE")Object.assign(e,{eventKind:kind,sourceDocumentVersion:null,source:{kind,importBatchId:inventoryId("operation",450),endpoint:"IMPORT_BASELINE"}});
    if(kind==="HISTORY_REVISION")Object.assign(e,{eventKind:kind,source:{kind,documentKind:"SALES",revisionId:inventoryId("operation",451),salesId:inventoryId("sales",452),salesLineId:inventoryId("salesLine",453),endpoint:"SALES_WAREHOUSE"}});
    assert.equal(checkedInventoryLedgerSnapshot(s,q,inventoryScope).data.entries[0]!.display!.balanceTransition.before,null);
    if(kind!=="SALES"){
      Object.assign(e.display!,{balanceTransition:{state:"KNOWN",before:"1",after:"3",reason:"RECORDED_BALANCE_TRANSITION"}});
      assert.throws(()=>checkedInventoryLedgerSnapshot(s,q,inventoryScope),{code:"INVALID_INVENTORY_LEDGER_RESPONSE"});
    }
  }
});
test("LIVE layer1 original reader contract: partial/malformed/overflow/mismatched/invented-zero pairs are never silently UNKNOWN", () => {
  for(const transition of [
    {state:"KNOWN",before:null,after:"3",reason:"RECORDED_BALANCE_TRANSITION"},
    {state:"KNOWN",before:"1",after:3,reason:"RECORDED_BALANCE_TRANSITION"},
    {state:"KNOWN",before:"01",after:"3",reason:"RECORDED_BALANCE_TRANSITION"},
    {state:"KNOWN",before:"-0",after:"2",reason:"RECORDED_BALANCE_TRANSITION"},
    {state:"KNOWN",before:"9223372036854775808",after:"9223372036854775810",reason:"RECORDED_BALANCE_TRANSITION"},
    {state:"KNOWN",before:"1",after:"4",reason:"RECORDED_BALANCE_TRANSITION"},
    {state:"KNOWN",before:"1",after:"3",reason:"NO_RECORDED_BALANCE_TRANSITION"},
    {state:"UNKNOWN",before:"0",after:"2",reason:"NO_RECORDED_BALANCE_TRANSITION"},
    {state:"KNOWN",before:"1",after:"3",reason:"RECORDED_BALANCE_TRANSITION",currentBalance:"3"},
  ]){const {q,s}=knownPage();Object.assign(s.data.entries[0]!.display!,{balanceTransition:transition});assert.throws(()=>checkedInventoryLedgerSnapshot(s,q,inventoryScope),{code:"INVALID_INVENTORY_LEDGER_RESPONSE"});}
});
test("LIVE layer1 RED future raw-pair decoder: only explicit NULL/NULL unknown; missing/number/partial/history-known all reject", async () => {
  const {decodeInventoryLedgerBalancePair:decode}=await import("../packages/application/src/inventory-ledger-balance-transition.ts");
  const c={eventKind:"APPROVE" as const,sourceKind:"SALES" as const,quantityDelta:"2"};
  assert.deepEqual(decode(null,null,c),{state:"UNKNOWN",before:null,after:null,reason:"NO_RECORDED_BALANCE_TRANSITION"});
  assert.deepEqual(decode("-2","0",c),{state:"KNOWN",before:"-2",after:"0",reason:"RECORDED_BALANCE_TRANSITION"});
  for(const [before,after]of [[undefined,undefined],[null,"2"],["0",null],[0,2],["+0","2"],["0","2.0"]])
    assert.throws(()=>decode(before,after,c),{code:"INVALID_INVENTORY_LEDGER_RESPONSE"});
  assert.throws(()=>decode("0","2",{...c,eventKind:"HISTORY_REVISION",sourceKind:"HISTORY_REVISION"}),{code:"INVALID_INVENTORY_LEDGER_RESPONSE"});
  assert.deepEqual(decode("9223372036854775807","-1",{...c,quantityDelta:"-9223372036854775808"}),
    {state:"KNOWN",before:"9223372036854775807",after:"-1",reason:"RECORDED_BALANCE_TRANSITION"});
});
test("LIVE layer1 original receipt regression: same actor/key replay never reapplies stock or rewrites facts from later balance", async () => {
  const f=fixture(),save={actor,action:"SAVE" as const,requestKey:"layer1-save",expectedVersion:null,draft:syntheticDraft()};
  const saved=await f.service.execute(save),approve={actor,action:"APPROVE" as const,requestKey:"layer1-approve",salesId:ids.sales,expectedVersion:saved.version};
  const original=await f.service.execute(approve),before=f.store.snapshot();
  f.store.seedBalance({...stored("83"),version:version(99)});
  assert.deepEqual(await f.service.execute(approve),original);
  const after=f.store.snapshot();assert.deepEqual(after.ledger,before.ledger);assert.equal(f.balance(),quantity("83"));assert.deepEqual(after.receipts,before.receipts);
});
test("LIVE layer1 SOURCE ONLY: historical revision and baseline insertion paths still omit snapshot columns", () => {
  const posting=readFileSync(new URL("../adapters/postgres/src/inventory-posting-balances.ts",import.meta.url),"utf8");
  const history=posting.slice(posting.indexOf("/* history-posting:ledger */"),posting.indexOf("const actualIds="));
  assert.ok(history.length>100);assert.doesNotMatch(history,/quantity_before|quantity_after/);
  const importer=readFileSync(new URL("../adapters/postgres/src/inventory-cutoff-import-store.ts",import.meta.url),"utf8");
  assert.doesNotMatch(importer,/quantity_before|quantity_after/);
});

// Layer4A is a separate inactive callback-completion contract, not SQL proof.
function completion(manager: PostgresPostingBalances): PostgresPostingBalances & { assertLiveComplete(): void } {
  const m = manager as PostgresPostingBalances & { assertLiveComplete?: () => void };
  assert.equal(typeof m.assertLiveComplete, "function", "Missing feature: pending live tokens must block transaction completion");
  return m as PostgresPostingBalances & { assertLiveComplete(): void };
}
test("LIVE layer4A RED completion: idle and exact acknowledged put complete, prepare/ack alone never complete", async () => {
  const h = await harness(), m = completion(h.manager), e = entry(); m.assertLiveComplete();
  const token = m.prepareLiveAppend(e); assert.throws(() => m.assertLiveComplete(), {code:"INVENTORY_INTEGRITY_FAILED"});
  m.didAppendLive(token); assert.throws(() => m.assertLiveComplete(), {code:"INVENTORY_INTEGRITY_FAILED"});
  await m.put(next(stored(),e,token)); m.assertLiveComplete();
});
for (const failure of ["ZERO_ROWS", "DRIVER_THROW"] as const) {
  test(`LIVE layer4A RED sticky ${failure}: caught live put failure cannot be retried or cleared into a commit`, async () => {
    const h=await harness(),m=completion(h.manager),e=entry(),token=m.prepareLiveAppend(e),row=next(stored(),e,token);
    m.didAppendLive(token); const broken=new Error("SYNTHETIC layer4A live put failure");
    if(failure==="ZERO_ROWS")h.loseNextWrite();else h.throwOnWrite(broken);
    await assert.rejects(m.put(row),failure==="ZERO_ROWS"?{code:"VERSION_CONFLICT"}:broken);
    const count=writes(h).length;h.restoreWrites();
    await assert.rejects(m.put(row),{code:"INVENTORY_INTEGRITY_FAILED"});assert.equal(writes(h).length,count);
    assert.throws(()=>m.prepareLiveAppend(entry("-3",2)),{code:"TRANSACTION_SCOPE"});
    assert.throws(()=>m.assertLiveComplete(),{code:"INVENTORY_INTEGRITY_FAILED"});
    assert.equal(m.get(key.warehouseId,key.skuId)!.quantity,quantity("100"));
  });
}
