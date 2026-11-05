/** Source integrity of the approved additive repair, separate from actual PostgreSQL evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { HISTORY_TYPED_SCHEMA16_MIGRATIONS, NATIVE_IMPORT_SCHEMA15_MIGRATIONS } from "./integration/migration-manifest.ts";
import { NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY } from "../adapters/postgres/src/native-import-accounting-capability.ts";
test("additive16 keeps frozen0011 and schema15 suite, changes exactly two polymorphic table dispatch boundaries", async () => {
  const old = await readFile(new URL("../adapters/postgres/migrations/0011_history_storage.sql", import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(old).digest("hex"), "67d9cb6df4e46c6807330b7ed7dd22305a4d331b111b85275f900caaf5d14965");
  const next = await readFile(new URL("../adapters/postgres/migrations/0016_history_insert_dispatch.sql", import.meta.url), "utf8");
  const body = (s: string) => /guard_history_insert\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/.exec(s)![1]!;
  const original = body(old), actual = body(next);
  const expected = original.replace(
    "  IF TG_TABLE_NAME = 'import_sku_alias' AND source.source_key IS DISTINCT FROM NEW.old_source_sku_id THEN\n    RAISE EXCEPTION 'alias must retain its original source identity' USING ERRCODE = '23514'; END IF;",
    "  IF TG_TABLE_NAME = 'import_sku_alias' THEN\n    IF source.source_key IS DISTINCT FROM NEW.old_source_sku_id THEN\n      RAISE EXCEPTION 'alias must retain its original source identity' USING ERRCODE = '23514'; END IF;\n  END IF;").replace(
    "  IF TG_TABLE_NAME = 'import_stock_contributor' AND NOT EXISTS (\n    SELECT 1 FROM naijue_erp.import_sku_alias WHERE batch_id = NEW.batch_id AND old_source_sku_id = NEW.old_source_sku_id AND canonical_sku_id = NEW.canonical_sku_id) THEN\n    RAISE EXCEPTION 'contributor alias target differs' USING ERRCODE = '23514'; END IF;",
    "  IF TG_TABLE_NAME = 'import_stock_contributor' THEN\n    IF NOT EXISTS (SELECT 1 FROM naijue_erp.import_sku_alias WHERE batch_id = NEW.batch_id\n      AND old_source_sku_id = NEW.old_source_sku_id AND canonical_sku_id = NEW.canonical_sku_id) THEN\n      RAISE EXCEPTION 'contributor alias target differs' USING ERRCODE = '23514'; END IF;\n  END IF;");
  assert.notEqual(actual, original); assert.equal(actual, expected, "Every other original guard predicate must remain byte-exact");
  assert.ok(next.includes(createHash("md5").update(original).digest("hex")), "Migration must refuse an unreviewed original function body");
  assert.ok(NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY.includes(createHash("md5").update(actual).digest("hex")), "Schema16 capability must require actual fixed dispatch body");
  assert.equal(NATIVE_IMPORT_SCHEMA15_MIGRATIONS.length, 15);
  assert.deepEqual(HISTORY_TYPED_SCHEMA16_MIGRATIONS.slice(0, 15), NATIVE_IMPORT_SCHEMA15_MIGRATIONS);
  assert.equal(HISTORY_TYPED_SCHEMA16_MIGRATIONS.at(-1)![2], createHash("sha256").update(next).digest("hex"));
});
