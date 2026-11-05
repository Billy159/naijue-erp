/** SOURCE TEXT + SCRIPTED CONTRACT ONLY. No PostgreSQL parser, DDL, ACL, real locks, persistence or issuer proof. */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const storage=new URL("../adapters/postgres/patches/0026-live-ledger-balance-pairs.sql",import.meta.url);
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
function bodies(s:string):Map<string,string>{
  return new Map([...s.matchAll(/CREATE (?:OR REPLACE )?FUNCTION naijue_erp\.(\w+)\(\).*?AS (\$[a-zA-Z_]*\$)(.*?)\2;/gs)].map(m=>["naijue_erp."+m[1]+"()",m[3]!]));
}
test("LIVE layer4B RED SOURCE ONLY storage: exact additive nullable pair shape and mechanically retained predecessor body pins",()=>{
  const s=readFileSync(storage,"utf8");
  assert.equal((s.match(/ADD COLUMN/g)??[]).length,2);assert.match(s,/ADD COLUMN quantity_before bigint,/);assert.match(s,/ADD COLUMN quantity_after bigint,/);
  assert.doesNotMatch(s,/ADD COLUMN quantity_(?:before|after) bigint[^,\n]*(?:DEFAULT|NOT NULL)/i);
  assert.match(s,/ADD CONSTRAINT ledger_recorded_balance_pair CHECK/);assert.match(s,/quantity_after::numeric-quantity_before::numeric=quantity_delta::numeric/);
  assert.match(s,/quantity_before IS NULL AND quantity_after IS NULL/);assert.match(s,/source_history_revision_id IS NULL/);
  assert.equal((s.match(/^CREATE FUNCTION/gm)??[]).length,2);assert.doesNotMatch(s,/CREATE OR REPLACE|^\s*(?:DROP|GRANT|UPDATE|INSERT INTO|DELETE|TRUNCATE)\b/m);
  const old=readFileSync(new URL("../adapters/postgres/patches/0026-history-revision-set-guards-successor.sql",import.meta.url),"utf8");
  const pins=(x:string)=>JSON.parse(/\$pins\$(\[.*?\])\$pins\$/s.exec(x)![1]!)as{signature:string;sha256:string}[];
  const expected=new Map(pins(old).map(p=>[p.signature,p.sha256]));for(const [name,body]of bodies(old))expected.set(name,sha(body));
  const actual=new Map(pins(s).map(p=>[p.signature,p.sha256]));assert.equal(expected.size,135);assert.equal(actual.size,135);assert.deepEqual(actual,expected);
  assert.match(s,/prokind IN \('f','p'\)\)<>135/);assert.match(s,/ARRAY\[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26\]/);
});
test("LIVE layer4B RED SOURCE ONLY storage: late no-new-lock comparison and aggregate-only native closure retain history/import lanes",()=>{
  const s=readFileSync(storage,"utf8"),all=bodies(s),pair=all.get("naijue_erp.guard_recorded_live_balance_pair()")!,closure=all.get("naijue_erp.validate_recorded_live_balance_commit()")!;
  assert.equal(sha(pair),"58700e3775442434c910b94fa66110d0880189c530bf7fdd839131f1ca8ad63e");assert.equal(sha(closure),"b32828510d3b85ae04c9d3849bcc494abe3cf337f0908996d72142fc171fb523");
  assert.match(s,/CREATE TRIGGER zz_live_ledger_balance_snapshot BEFORE INSERT ON naijue_erp.inventory_ledger/);
  // Keep the original direct-lock bans. Relation reads need exact FROM/JOIN
  // table tokens: the legitimate WHERE sku_id must not mean a SKU table query.
  assert.doesNotMatch(pair,/FOR UPDATE|FOR SHARE|inventory_key_lock|pg_advisory/i);
  const upstreamTableRead=/\b(?:FROM|JOIN|TABLE)\s+(?:ONLY\s+)?(?:(?:"(?:[^"]|"")+"|[a-z_][a-z0-9_$]*)\s*\.\s*)?(?:"(?:sales_header|transfer_header|product|sku)"|(?:sales_header|transfer_header|product|sku)(?![a-z0-9_$]))/i;
  assert.doesNotMatch(pair,upstreamTableRead);
  assert.doesNotMatch("SELECT quantity FROM naijue_erp.inventory_balance WHERE sku_id=NEW.sku_id",upstreamTableRead);
  for(const query of ["SELECT id FROM naijue_erp.sku WHERE id=NEW.sku_id",'SELECT id FROM "naijue_erp"."sku"',
    "SELECT b.quantity FROM naijue_erp.inventory_balance b JOIN\nnaijue_erp.product p ON p.id=b.sku_id",
    "SELECT id FROM sales_header", "SELECT id FROM naijue_erp.transfer_header"]){
    assert.match(query,upstreamTableRead,"Negative control must recognize a real upstream relation read");
    assert.throws(()=>assert.doesNotMatch(query,upstreamTableRead),{code:"ERR_ASSERTION"},"Real SKU/product/header table reads must still be rejected");
  }
  assert.match(pair,/SELECT quantity INTO current_quantity/);assert.match(pair,/NEW.quantity_before IS DISTINCT FROM current_quantity/);
  assert.match(pair,/NEW.event_kind<>'APPROVE' OR NEW.reverses_entry_id IS NOT NULL OR NEW.quantity_before<>0/);
  assert.match(pair,/inventory_runtime_key_admitted\(NEW.warehouse_id,NEW.sku_id\) IS DISTINCT FROM true/);
  assert.match(pair,/EXISTS\(SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id\)/);
  assert.match(closure,/quantity_before IS NOT NULL AND quantity_after IS NOT NULL/);assert.match(closure,/sum\(quantity_delta::numeric\),count\(\*\)/);
  assert.match(closure,/xmin::text::bigint=mod\(pg_current_xact_id\(\)::text::numeric,4294967296\)::bigint/);
  assert.ok(closure.indexOf("SELECT * INTO STRICT r")<closure.indexOf("OLD.last_operation_id IS NOT DISTINCT"));
  assert.match(s,/DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_recorded_live_balance_commit/);
  assert.equal((s.match(/^REVOKE ALL ON FUNCTION/gm)??[]).length,2);
  const posting=readFileSync(new URL("../adapters/postgres/src/inventory-posting-balances.ts",import.meta.url),"utf8");
  const history=posting.slice(posting.indexOf("/* history-posting:ledger */"),posting.indexOf("const actualIds="));assert.ok(history.length>100);assert.doesNotMatch(history,/quantity_before|quantity_after/);
  assert.doesNotMatch(readFileSync(new URL("../adapters/postgres/src/inventory-cutoff-import-store.ts",import.meta.url),"utf8"),/quantity_before|quantity_after/);
});
