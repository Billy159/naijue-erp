/** Source contracts only: no PostgreSQL parser/engine, migration or actual data execution. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseSalesCommand } from "../apps/api/src/input.ts";
import { actor, syntheticDraft } from "./support/synthetic-fixtures.ts";
const ddl = await readFile(new URL("../adapters/postgres/migrations/0010_sales_settlement_method_snapshot.sql", import.meta.url), "utf8");
const sql = ddl.replace(/--[^\n]*/g, "");
test("method snapshot schema source: only approved nullable original-method FK, exact1–9 prefix and no guessed history backfill/default", () => {
  assert.equal(createHash("sha256").update(ddl).digest("hex"), "e7e80a1ddb24b4c6aa622aa7e0eff10b4e57670dc77ad148e7b99a27029acc1f");
  assert.match(sql, /^\s*BEGIN;/); assert.match(sql, /COMMIT;\s*$/); assert.match(sql, /installed IS DISTINCT FROM ARRAY\[1,2,3,4,5,6,7,8,9\]/);
  assert.match(sql, /ADD COLUMN payment_method_id_snapshot uuid REFERENCES naijue_erp.payment_method\(id\);/);
  assert.equal((sql.match(/ADD COLUMN/g) ?? []).length, 1);
  assert.ok(!/CREATE TABLE|UPDATE naijue_erp|DEFAULT|NOT NULL|COALESCE|method_name_snapshot|DELETE|TRUNCATE/.test(sql));
});
test("method snapshot command source: intended canonical ID is mandatory, NULL/missing/label cannot fall back to current account", () => {
  const wire = JSON.parse(JSON.stringify({ action: "SAVE", requestKey: "method-intent", expectedVersion: null, draft: syntheticDraft() }, (_key, value) => typeof value === "bigint" ? value.toString() : value));
  assert.equal(parseSalesCommand(wire, actor).action, "SAVE");
  for (const value of [null, undefined, "SYNTHETIC method name", "00000000-0000-0000-0000-00000000001F"]) {
    const input = structuredClone(wire); if (value === undefined) delete input.draft.settlements[0].paymentMethodId; else input.draft.settlements[0].paymentMethodId = value;
    assert.throws(() => parseSalesCommand(input, actor));
  }
});
