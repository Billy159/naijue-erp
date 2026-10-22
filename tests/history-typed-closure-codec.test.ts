import test from "node:test";
import assert from "node:assert/strict";
import { encodeHistoryClosureValue, historyClosureRowHash, hashHistoryClosureRows } from "../packages/application/src/history-typed-closure.ts";

test("closure byte frames use UTF8 lengths and byte-ordered keys; NULL, missing, empty and literal numeric text remain different", () => {
 assert.equal(encodeHistoryClosureValue({ 中: [null, true, "", 1], a: "\n" }).toString("utf8"), "o2:s1:as1:\ns3:中a4:nts0:i1;");
 assert.equal(encodeHistoryClosureValue({ "\u{10000}": "astral", "\ue000": "bmp" }).toString("utf8"), "o2:s3:\ue000s3:bmps4:\u{10000}s6:astral");
 const values = [null, "", "0", 0, {}, { value: null }, { value: "" }]; assert.equal(new Set(values.map(x => historyClosureRowHash({ relation: "source", key: "one", projection: x }))).size, values.length);
 assert.equal(historyClosureRowHash({ relation: "source", key: "one", projection: { a: "1", b: null } }), historyClosureRowHash({ relation: "source", key: "one", projection: { b: null, a: "1" } }));
});
test("raw closure codec rejects accessors/symbols/hidden keys/cycles/unsafe numeric and malformed unicode without executing getters", () => {
 let reads = 0;const getter = Object.defineProperty({}, "x", { enumerable: true, get() { reads++; return "x"; } });
 const sparse = new Array(1), extra = Object.assign(["x"], { extra: "x" }), cycle: Record<string, unknown> = {};cycle.self = cycle;
 for (const value of [getter, { [Symbol("x")]: "x" }, Object.defineProperty({}, "x", { value: "x" }), sparse, extra, cycle, new Date(), -0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined, "\ud800", "\udfff", "NUL\0"]) assert.throws(() => encodeHistoryClosureValue(value), { code: "INVALID_HISTORY_CLOSURE_ENCODING" });
 assert.equal(reads, 0);
});
test("bounded sorted closure stream covers every row and its target; repeated/out-of-order identities fail rather than cancel", async () => {
 const rows = [{ relation: "source", key: "a", projection: { source: "a", amount: "7.03" } }, { relation: "typed", key: "b", projection: { source: "a", account: "accountA", method: "methodB" } }];
 const full = await hashHistoryClosureRows("document:SALE:one", rows);
 // Independent Python literal byte frames documented in HISTORY_CLOSURE_CODEC_GOLDEN.json.
 assert.equal(historyClosureRowHash(rows[0]!), "0df99a3deb3a6a2334cf0d202c48904f307d314fb5373663a296f7c1492a8b0c");
 assert.equal(historyClosureRowHash(rows[1]!), "2c208f70ba40d3e9f2e0c13467e5826ba43f85d90add796bee3652027dc384b3");
 assert.deepEqual(full, { rows: 2, sha256: "d3c2de5c281251c525e7525d9029693ce517f8dec4d946e5b65ddd054ce11eb6" });
 assert.deepEqual(await hashHistoryClosureRows("document:SALE:one", []), { rows: 0, sha256: "4ea9beaa7fe64995cf45574a469c3727130ca02922abd1180f94b6712d4b5b23" });
 assert.notEqual(full.sha256, (await hashHistoryClosureRows("document:SALE:one", rows.slice(0, 1))).sha256);
 assert.notEqual(full.sha256, (await hashHistoryClosureRows("document:SALE:other", rows)).sha256);
 assert.notEqual(full.sha256, (await hashHistoryClosureRows("document:SALE:one", [rows[0]!, { ...rows[1]!, projection: { source: "a", account: "accountA", method: "methodA" } }])).sha256);
 await assert.rejects(hashHistoryClosureRows("document:SALE:one", [rows[0]!, rows[0]!]), { code: "INVALID_HISTORY_CLOSURE_ORDER" });
 await assert.rejects(hashHistoryClosureRows("document:SALE:one", [...rows].reverse()), { code: "INVALID_HISTORY_CLOSURE_ORDER" });
 async function* brokenSource() { yield rows[0]!; throw Error("SOURCE_DATASET_INCOMPLETE"); }
 await assert.rejects(hashHistoryClosureRows("document:SALE:one", brokenSource()), /SOURCE_DATASET_INCOMPLETE/);
 assert.throws(() => encodeHistoryClosureValue("x".repeat(4 * 1024 * 1024)), { code: "INVALID_HISTORY_CLOSURE_ENCODING" });
});
