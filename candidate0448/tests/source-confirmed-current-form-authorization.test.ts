/** SYNTHETIC pure source-policy checks only. No PostgreSQL, HTTP, listener or actual data. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { CurrentFormAuthorization, CurrentFormContext, CurrentFormIdentity, CurrentFormIntent } from "../packages/application/src/current-form-ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { createSourceConfirmedCurrentFormAuthorization } from "../packages/application/src/source-confirmed-current-form-authorization.ts";
import { ids, sid } from "./support/synthetic-fixtures.ts";

const signal = new AbortController().signal;
const foreignHall = sid("hall", 201);
const context = (role: CurrentFormIdentity["role"] = "SALESPERSON", hallId: CurrentFormIdentity["hallId"] = ids.hall) => Object.freeze({
  actor: Object.freeze({ accountId: ids.account, hallId }),
  identity: Object.freeze({ accountId: ids.account, staffId: sid("staff", 202), role, hallId })
});
const productId = sid("product", 204);
const paymentMethodId = sid("paymentMethod", 205);
const sales = Object.freeze({ kind: "SALES" as const, hallId: ids.hall });
const transfer = Object.freeze({ kind: "TRANSFER" as const });
function intents(target: CurrentFormContext): CurrentFormIntent[] {
  return [
    { kind: "products", parameters: { context: target, search: "", page: 1, pageSize: 20 } },
    { kind: "product-skus", parameters: { context: target, productId: productId, page: 1, pageSize: 20 } },
    { kind: "sku-batch", parameters: { context: target, skuIds: [ids.sku] } }
  ];
}
const salesIntents = (): CurrentFormIntent[] => [
  { kind: "sales-references", parameters: { kind: "hall", hallId: null, search: "", page: 1, pageSize: 20 } },
  ...(["customer", "salesperson", "warehouse", "paymentMethod"] as const).map(kind => ({
    kind: "sales-references" as const, parameters: { kind, hallId: ids.hall, search: "", page: 1, pageSize: 20 as const } })),
  { kind: "sales-references", parameters: { kind: "paymentAccount", hallId: ids.hall, paymentMethodId: paymentMethodId, search: "", page: 1, pageSize: 20 } },
  ...intents(sales)
];
const transferIntents = (): CurrentFormIntent[] => [
  ...(["FROM", "TO"] as const).map(direction => ({ kind: "transfer-warehouses" as const,
    parameters: { direction, search: "", page: 1, pageSize: 20 as const } })), ...intents(transfer)
];
const forbidden = (error: unknown) => error instanceof DomainError && error.code === "FORBIDDEN";
test("SYNTHETIC CURRENT policy: salesperson sales is own-hall scoped, shared facts are not record-owned", async () => {
  const policy = createSourceConfirmedCurrentFormAuthorization(); assert.equal(Object.isFrozen(policy), true);
  for (const intent of salesIntents()) {
    const grant = await policy.authorize(context(), intent, signal);
    assert.deepEqual(grant, { kind: "halls", hallIds: [ids.hall] }); assert.equal(Object.isFrozen(grant), true);
    if (grant.kind === "halls") assert.equal(Object.isFrozen(grant.hallIds), true);
  }
  for (const intent of intents({ kind: "SALES", hallId: foreignHall })) await assert.rejects(policy.authorize(context(), intent, signal), forbidden);
  for (const kind of ["customer", "salesperson", "warehouse", "paymentMethod", "paymentAccount"] as const) {
    const parameters = { kind, hallId: foreignHall, search: "", page: 1, pageSize: 20 as const,
      ...(kind === "paymentAccount" ? { paymentMethodId: paymentMethodId } : {}) };
    await assert.rejects(policy.authorize(context(), { kind: "sales-references", parameters } as CurrentFormIntent, signal), forbidden);
  }
});
test("SYNTHETIC CURRENT policy: all canonical roles may propose cross-hall transfer endpoints/products", async () => {
  const policy = createSourceConfirmedCurrentFormAuthorization();
  for (const role of ["ADMIN", "WAREHOUSE", "SALESPERSON"] as const) {
    for (const intent of transferIntents()) assert.deepEqual(await policy.authorize(context(role), intent, signal), { kind: "all" });
    if (role !== "SALESPERSON") for (const intent of [...salesIntents(), ...intents({ kind: "SALES", hallId: foreignHall })])
      assert.deepEqual(await policy.authorize(context(role, null), intent, signal), { kind: "all" });
  }
});
test("SYNTHETIC CURRENT policy: malformed/mismatched identities, unknown roles and intents fail closed", async () => {
  const policy = createSourceConfirmedCurrentFormAuthorization(); const valid = context(); const intent = transferIntents()[0]!;
  const contexts: unknown[] = [null, {}, { ...valid, extra: true },
    { ...valid, actor: { accountId: "invalid", hallId: ids.hall } },
    ...[{ role: "AUDITOR" }, { role: "admin" }, { role: undefined }, { accountId: sid("account", 203) },
      { hallId: foreignHall }, { staffId: "invalid" }, { staffId: null }, { hallId: undefined }, { grants: { kind: "all" } }]
      .map(change => ({ ...valid, identity: { ...valid.identity, ...change } })),
    context("SALESPERSON", null)];
  for (const value of contexts) await assert.rejects(policy.authorize(value as Parameters<CurrentFormAuthorization["authorize"]>[0], intent, signal), forbidden);
  const invalid: unknown[] = [null, {}, { kind: "admin", parameters: {} }, { ...intent, extra: undefined },
    { kind: "transfer-warehouses", parameters: { direction: "OWN_HALL", search: "", page: 1, pageSize: 20 } },
    ...intents(transfer).map(value => ({ ...value, parameters: { ...value.parameters, context: { kind: "TRANSFER", hallId: ids.hall } } })),
    { kind: "products", parameters: { context: { kind: "SALES", hallId: "invalid" }, search: "", page: 1, pageSize: 20 } },
    { kind: "sales-references", parameters: { kind: "hall", hallId: ids.hall, search: "", page: 1, pageSize: 20 } },
    { kind: "products", parameters: { context: transfer, search: "", page: 1, pageSize: 20, role: "ADMIN" } }];
  for (const value of invalid) await assert.rejects(policy.authorize(valid, value as CurrentFormIntent, signal), forbidden);
});
test("SYNTHETIC CURRENT policy: cancellation precedes grants; pure module cannot allocate another identity connection", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createSourceConfirmedCurrentFormAuthorization().authorize(context(), transferIntents()[0]!, controller.signal),
    (error: unknown) => error instanceof DomainError && error.code === "CURRENT_FORM_READ_ABORTED");
  const source = readFileSync(new URL("../packages/application/src/source-confirmed-current-form-authorization.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.connect\s*\(|BoundedPostgresPool|from ["']pg["']|\.register\s*\(|\.listen\s*\(/);
});
