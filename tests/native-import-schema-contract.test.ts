import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { assertReviewedNativeImportSchema, REVIEWED_NATIVE_IMPORT_SCHEMA_CONTRACTS } from "../packages/application/src/native-import-schema-contract.ts";
test("reviewed native import schemas are explicit complete 11–18 prefixes, never a >= version shortcut", () => {
  const check = (versions: unknown, minimumVersion = 11) => assertReviewedNativeImportSchema(versions, { minimumVersion, errorCode: "SYNTHETIC_SCHEMA_REFUSED" });
  const v11 = [1,2,3,4,5,6,7,8,9,10,11], v12 = [...v11,12], v13 = [...v12,13], v14 = [...v13,14], v15 = [...v14,15], v16 = [...v15,16], v17 = [...v16,17];
  for (const [versions, id] of [[v11, "NATIVE_IMPORT_SCHEMA_11_V1"], [v12, "NATIVE_IMPORT_SCHEMA_12_V1"],
    [v13, "NATIVE_IMPORT_SCHEMA_13_V1"], [v14, "NATIVE_IMPORT_SCHEMA_14_V1"], [v15, "NATIVE_IMPORT_SCHEMA_15_V1"], [v16, "NATIVE_IMPORT_SCHEMA_16_V1"], [v17, "NATIVE_IMPORT_SCHEMA_17_V1"]] as const)
    assert.equal(check(versions).id, id);
  assert.equal(check(v14, 11).id, "NATIVE_IMPORT_SCHEMA_14_V1");
  assert.equal(check(v14, 12).id, "NATIVE_IMPORT_SCHEMA_14_V1");
  assert.equal(check(v14, 13).id, "NATIVE_IMPORT_SCHEMA_14_V1");
  assert.equal(check(v14, 14).id, "NATIVE_IMPORT_SCHEMA_14_V1");
  assert.equal(check(v15, 15).id, "NATIVE_IMPORT_SCHEMA_15_V1");
  const v18 = [...v17,18]; assert.equal(check(v18,18).id,"NATIVE_IMPORT_SCHEMA_18_V1");
  for (const versions of [null, [], [11], v14.filter(v => v !== 11), v14.filter(v => v !== 13),
    [...v18,19], [...v18,18], v18.filter(v=>v!==16), [...v17,17], v17.filter(v => v !== 16), [...v14,999], [...v14,14], v14.map(String), [...v13,14.5],
    [...v13, "14"], [...v13, null], [...v13, true], [...v13, {}]])
    assert.throws(() => check(versions), { code: "SYNTHETIC_SCHEMA_REFUSED" });
  assert.throws(() => check(v11,12), { code: "SYNTHETIC_SCHEMA_REFUSED" });
  assert.throws(() => check(v12,13), { code: "SYNTHETIC_SCHEMA_REFUSED" });
  assert.throws(() => check(v13,14), { code: "SYNTHETIC_SCHEMA_REFUSED" });
  assert.throws(() => check(v14,15), { code: "SYNTHETIC_SCHEMA_REFUSED" });
});
test("reviewed12–18 extensions pin final DDL bytes rather than silently accepting revised SQL", async () => {
  for (const contract of REVIEWED_NATIVE_IMPORT_SCHEMA_CONTRACTS.slice(1)) {
    assert.deepEqual(contract.extensions.map(extension => extension.version), contract.versions.slice(11));
    for (const extension of contract.extensions) {
      const bytes = await readFile(new URL(`../adapters/postgres/migrations/${extension.file}`, import.meta.url));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), extension.sha256);
    }
  }
});
test("registry raw prefix inspection rejects getters, symbols, holes and inherited indexes without executing accessors",()=>{
 let reads=0;const prefix=Array.from({length:18},(_,i)=>i+1), getter=[...prefix];
 Object.defineProperty(getter,"0",{get(){reads++;return 1;},enumerable:true});
 const symbol=[...prefix];Object.defineProperty(symbol,Symbol("hidden"),{value:1});
 const hole=[...prefix];delete hole[3];
 const inherited=[...prefix];Object.setPrototypeOf(inherited,Object.create(Array.prototype));
 for(const value of [getter,symbol,hole,inherited])assert.throws(()=>assertReviewedNativeImportSchema(value,{minimumVersion:11,errorCode:"SYNTHETIC_SCHEMA_REFUSED"}),{code:"SYNTHETIC_SCHEMA_REFUSED"});
 assert.equal(reads,0);
});
