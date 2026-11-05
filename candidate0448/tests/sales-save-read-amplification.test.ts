/** SYNTHETIC Fastify -> original service/UOW/native proof. SQL counts are not PG timings. */
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createAuthenticatedDocumentCommandsPlugin } from "../apps/api/src/authenticated-document-commands.ts";
import { createNativeTransactionSalesBusinessRules } from "../packages/application/src/sales-native-facts.ts";
import type { AuthenticationService } from "../packages/authentication/src/service.ts";
import { fixture as transferFixture } from "./support/synthetic-transfer.ts";
import { ids, sid } from "./support/synthetic-fixtures.ts";
import { h06, salesFactsFixture } from "./support/sales-facts-cache-fixture.ts";

test("formal SAVE existing-SKU composition preserves nine rule facts/four snapshot calls while sharing successful reads", async t => {
  const f = salesFactsFixture(), base = createNativeTransactionSalesBusinessRules();
  let seq = 12000, ruleCalls = 0, accessCalls = 0;
  const origin = "https://synthetic-sales.invalid", token = "S".repeat(43);
  const service: AuthenticationService = {
    async resolve() { return { accountId: ids.account, staffId: sid("staff", 16), loginName: "SYNTHETIC", role: "ADMIN", hallId: ids.hall, authVersion: 1 }; },
    async login() { throw Error("unused"); }, async logout() {}, async changeOwnPassword() {}
  };
  const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createAuthenticatedDocumentCommandsPlugin({ authentication: { service, trustedOrigin: origin }, nativeManualSalesPreparation: true,
    sales: { unitOfWork: f.unitOfWork, rules: { ...base, async assertDraftChange(...args) { ruleCalls++; await base.assertDraftChange(...args); } },
      authorization: { async assertAllowed(actor, _action, _document, tx) { accessCalls++; assert.ok(await tx!.getCurrentSalesIdentity!(actor.accountId)); } },
      newId: kind => sid(kind, seq++), now: () => "2026-10-29T00:00:00Z" }, transfers: transferFixture().dependencies
  }));
  const response = await app.inject({ method: "POST", url: "/sales/commands", headers: { origin, cookie: `__Host-naijue_session=${token}`, "content-type": "application/json" }, payload: {
    action: "SAVE", requestKey: "synthetic-count", expectedVersion: null,
    proposal: { salesId: null, businessType: "SALE", businessDate: "2026-10-29", note: "SYNTHETIC", hallId: ids.hall, warehouseId: ids.warehouse, customerId: ids.customer, salespersonId: sid("staff", 16), orderDiscount: "0",
      lines: [{ existingLineId: null, skuId: h06.sku, quantity: "1", dealPrice: "1.25", pricingRule: "UNIT_PRICE", discountTenths: null, isGift: false, zeroConfirmed: false }], settlements: [] }
  } });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(f.logical, { facts: 9, snapshots: 4 });
  assert.equal(ruleCalls, 2); assert.equal(accessCalls, 2);
  const measured = { logical: f.logical, fullFacts: f.count("native-sales-facts:schema"), snapshots: f.count("native-transfer-snapshots:schema"), proof: f.count("maintained-catalogue26:roots") };
  const sqlByTag: Record<string, number> = {};
  for (const sql of f.calls) { const tag = /\/\* ([^*]+) \*\//.exec(sql)?.[1] ?? sql.split(" ")[0]!; sqlByTag[tag] = (sqlByTag[tag] ?? 0) + 1; }
  t.diagnostic(JSON.stringify({ ...measured, sqlStatements: f.calls.length, sqlByTag }));
  t.diagnostic("SYNTHETIC_EQUIVALENCE=" + JSON.stringify({ response: response.json(), writes: f.writes }));
  assert.equal(measured.fullFacts, 1); assert.equal(measured.snapshots, 1); assert.equal(measured.proof, 1);
  assert.equal(f.calls.filter(sql => sql === "COMMIT").length, 1);
});
