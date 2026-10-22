/** Synthetic controlled rows only; not a database or business acceptance result. */
import test from "node:test";
import assert from "node:assert/strict";
import { parseSettingsAuditQuery, projectSettingsAuditItem, settingsAuditModulesFor } from "../packages/application/src/settings-audit-validation.ts";
import { createSettingsAuditService } from "../packages/application/src/settings-audit-service.ts";
import { SETTINGS_AUDIT_FIELDS } from "../packages/application/src/settings-audit-ports.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const query = { module: "ALL", objectId: null, objectSearch: "", actorSearch: "", action: "ALL", dateFrom: null, dateTo: null, page: 1, pageSize: 20 };
const row = () => ({ id: sid("product", 9001), operation_id: sid("product", 9002), module: "PRODUCT", object_id: sid("product", 9003), object_name: "SYNTHETIC", object_code: "0001", actor_account_id: null, actor_staff_id: null, actor_name: null, actor_login_name: null, action: "EDIT", old_version: 1, new_version: 2, occurred_at: "2026-10-22T00:00:00.123456Z", before_values: { name: null, enabled: true }, after_values: { name: "", enabled: false, retail_price: "0.00", year: 0, season_ids: [], skus: { rowCount: 0 } }, credential_actions: [] });
test("W13 exact query rejects extra authority, unsafe offsets, invalid dates and wildcards remain literal", () => {
  const parsed = parseSettingsAuditQuery({ ...query, objectSearch: "%_'", dateFrom: "2024-02-29", dateTo: "2024-02-29" });
  assert.equal(parsed.objectSearch, "%_'");
  for (const patch of [{ role: "ADMIN" }, { objectId: sid("product", 1) }, { dateFrom: "2023-02-29" }, { dateFrom: "0000-01-01" }, { dateFrom: "2026-10-23", dateTo: "2026-10-22" }, { page: Number.MAX_SAFE_INTEGER }, { pageSize: "20" }, { actorSearch: "x\0" }, { action: "SAVE" }])
    assert.throws(() => parseSettingsAuditQuery({ ...query, ...patch }), { code: "INVALID_SETTINGS_AUDIT_QUERY" });
  assert.throws(() => parseSettingsAuditQuery({}), { code: "INVALID_SETTINGS_AUDIT_QUERY" });
  assert.equal(settingsAuditModulesFor("ADMIN", parsed).length, 12);
  assert.equal(settingsAuditModulesFor("WAREHOUSE", parsed).length, 10);
  assert.throws(() => settingsAuditModulesFor("WAREHOUSE", { ...parsed, module: "ACCOUNT" }), { code: "FORBIDDEN" });
  assert.throws(() => settingsAuditModulesFor("SALESPERSON", parsed), { code: "FORBIDDEN" });
});
test("W13 safe projection preserves unknown versus sparse missing, false/zero and exact money; rejects nested secrets", () => {
  const item = projectSettingsAuditItem(row()), changes = Object.fromEntries(item.changes.map(c => [c.field, c]));
  assert.equal(item.occurredAt, "2026-10-22T00:00:00.123456Z"); assert.equal(item.actor.accountId, null);
  assert.deepEqual(changes.name!.before, { state: "NULL" }); assert.deepEqual(changes.name!.after, { state: "VALUE", value: "" });
  assert.deepEqual(changes.retail_price!.before, { state: "ABSENT" }); assert.deepEqual(changes.retail_price!.after, { state: "VALUE", value: "0.00" });
  assert.deepEqual(changes.enabled!.after, { state: "VALUE", value: false }); assert.deepEqual(changes.skus!.after, { state: "ROW_COUNT", value: 0 });
  assert.deepEqual(changes.season_ids!.after, { state: "IDS", value: [] });
  for (const after of [{ name: { password: "PRIVATE" } }, { retail_price: 0 }, { enabled: "false" }, { season_ids: ["not-uuid"] }, { skus: [{ file_ref: "PRIVATE" }] }, { password_hash: "PRIVATE" }])
    assert.throws(() => projectSettingsAuditItem({ ...row(), after_values: after }), { code: "INVALID_SETTINGS_AUDIT_DATA" });
  assert.throws(() => projectSettingsAuditItem({ ...row(), occurred_at: "2026-02-30T00:00:00Z" }), { code: "INVALID_SETTINGS_AUDIT_DATA" });
  assert.ok(!Object.values(SETTINGS_AUDIT_FIELDS).flat().some(f => /password|file_ref|token|secret|hash/.test(f.key)));
  const account = projectSettingsAuditItem({ ...row(), module: "ACCOUNT", before_values: null, after_values: { login_name: "SYNTHETIC" }, credential_actions: ["RESET_PASSWORD"] });
  assert.deepEqual(account.credentialActions, ["RESET_PASSWORD"]);
  assert.throws(() => projectSettingsAuditItem({ ...row(), credential_actions: ["RESET_PASSWORD"] }), { code: "INVALID_SETTINGS_AUDIT_DATA" });
});
test("W13 service validates count, module/object scope and abort; provider failure never becomes empty", async () => {
  const signal = new AbortController().signal;
  const service = createSettingsAuditService({ async read() { return { role: "ADMIN", total: "1", items: [row()] }; } });
  const result = await service.query(actor, query, signal); assert.equal(result.total, 1); assert.equal(result.items.length, 1);
  for (const raw of [{ role: "ADMIN", total: "1", items: [] }, { role: "ADMIN", total: "01", items: [row()] }, { role: "WAREHOUSE", total: "1", items: [{ ...row(), module: "ACCOUNT", before_values: null, after_values: {} }] }, { role: "ADMIN", total: "2", items: [row(), row()] }] as const) {
    const invalid = createSettingsAuditService({ async read() { return raw; } }); await assert.rejects(invalid.query(actor, query, signal), { code: "INVALID_SETTINGS_AUDIT_DATA" });
  }
  await assert.rejects(service.query(actor, { ...query, module: "PRODUCT", objectId: sid("product", 99) }, signal), { code: "INVALID_SETTINGS_AUDIT_DATA" });
  const controller = new AbortController(); controller.abort(); await assert.rejects(service.query(actor, query, controller.signal), { code: "SETTINGS_AUDIT_ABORTED" });
  const failure = Error("SYNTHETIC SQL FAILURE"); await assert.rejects(createSettingsAuditService({ async read() { throw failure; } }).query(actor, query, signal), error => error === failure);
});
