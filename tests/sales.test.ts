import assert from "node:assert/strict";
import test from "node:test";
import type { SalesCommand } from "../packages/application/src/ports.ts";
import { summarizeApprovedSettlements } from "../packages/application/src/settlement-statistics.ts";
import { minorAmount, quantity, QUANTITY_MIN, version } from "../packages/domain/src/values.ts";
import { requireDomain } from "../packages/domain/src/errors.ts";
import { actor, fixture, ids, sid, syntheticDraft } from "./support/synthetic-fixtures.ts";

for (const businessType of ["SALE", "RETURN", "EXCHANGE"] as const) {
  test(`SYNTHETIC ${businessType}: independent same-warehouse save/approve/unapprove has exact effects without original-sale links`, async () => {
    const f = fixture(); const draft = syntheticDraft(businessType);
    const saved = await f.service.execute({ action: "SAVE", actor, requestKey: "save", expectedVersion: null, draft });
    assert.equal(saved.status, "DRAFT"); assert.equal(f.balance(), 0n); assert.equal(f.store.snapshot().ledger.length, 0);
    const approved = await f.service.execute({ action: "APPROVE", actor, requestKey: "approve", expectedVersion: saved.version, salesId: ids.sales });
    assert.equal(approved.status, "APPROVED");
    for (const line of draft.lines) assert.equal(f.balance(line.skuId), -line.quantity);
    assert.ok(f.store.snapshot().ledger.every(row => row.warehouseId === ids.warehouse));
    assert.deepEqual(f.document().settlements, draft.settlements);
    const unapproved = await f.service.execute({ action: "UNAPPROVE", actor, requestKey: "unapprove", expectedVersion: approved.version, salesId: ids.sales });
    assert.equal(unapproved.status, "DRAFT"); assert.equal(f.balance(), 0n); assert.equal(f.balance(ids.sku2), 0n);
    assert.equal(f.store.snapshot().ledger.length, draft.lines.length * 2);
    assert.deepEqual(f.document().settlements, draft.settlements);
    assert.equal(f.store.snapshot().audit.length, 3);
    assert.ok(f.store.snapshot().ledger.filter(row => row.eventKind === "UNAPPROVE").every(row => row.reversesEntryId !== null));
  });
}
test("SYNTHETIC: negative stock is a legal exact fact, not insufficient-stock rejection or zero truncation", async () => {
  const f = fixture(); await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: syntheticDraft() });
  await f.service.execute({ action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales });
  assert.equal(f.balance(), -2n);
});
test("SYNTHETIC: exact replay after a lost response returns original result without repeat stock/audit/settlements", async () => {
  const f = fixture(); const save: SalesCommand = { action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: syntheticDraft() };
  assert.deepEqual(await f.service.execute(save), await f.service.execute(save));
  const approve: SalesCommand = { action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales };
  const first = await f.service.execute(approve); const before = f.store.snapshot();
  assert.deepEqual(await f.service.execute(approve), first); assert.deepEqual(f.store.snapshot(), before); assert.equal(f.balance(), -2n);
});
test("SYNTHETIC: concurrent identical commands commit exactly once in the serialized reference adapter", async () => {
  const f = fixture(); await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: syntheticDraft() });
  const command: SalesCommand = { action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales };
  const results = await Promise.all([f.service.execute(command), f.service.execute(command), f.service.execute(command)]);
  assert.deepEqual(results[0], results[2]); assert.equal(f.store.snapshot().ledger.length, 1); assert.equal(f.balance(), -2n);
});
test("SYNTHETIC: same key changed content is conflict, not another write", async () => {
  const f = fixture(); const draft = syntheticDraft(); await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft });
  const before = f.store.snapshot();
  await assert.rejects(f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: { ...draft, header: { ...draft.header, note: "CHANGED SYNTHETIC" } } }), { code: "IDEMPOTENCY_CONFLICT" });
  assert.deepEqual(f.store.snapshot(), before);
});
test("SYNTHETIC: stale expected version cannot approve or overwrite", async () => {
  const f = fixture(); const draft = syntheticDraft(); await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft });
  await f.service.execute({ action: "SAVE", actor, requestKey: "s2", expectedVersion: version(1), draft });
  const before = f.store.snapshot();
  await assert.rejects(f.service.execute({ action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales }), { code: "VERSION_CONFLICT" });
  assert.deepEqual(f.store.snapshot(), before);
});
test("SYNTHETIC: approved quantity/amount cannot be edited or directly voided; must first unapprove", async () => {
  const f = fixture(); const draft = syntheticDraft(); await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft });
  await f.service.execute({ action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales });
  for (const command of [
    { action: "SAVE", actor, requestKey: "edit", expectedVersion: version(2), draft },
    { action: "VOID", actor, requestKey: "void", expectedVersion: version(2), salesId: ids.sales },
    { action: "APPROVE", actor, requestKey: "again", expectedVersion: version(2), salesId: ids.sales }
  ] as const) await assert.rejects(f.service.execute(command), { code: "INVALID_STATE" });
  assert.equal(f.balance(), -2n);
});
test("SYNTHETIC: saved draft void changes no inventory, retains detail, becomes immutable", async () => {
  const f = fixture(); const draft = syntheticDraft(); await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft });
  await f.service.execute({ action: "VOID", actor, requestKey: "v", expectedVersion: version(1), salesId: ids.sales });
  assert.equal(f.document().header.status, "VOID"); assert.deepEqual(f.document().settlements, draft.settlements); assert.equal(f.store.snapshot().ledger.length, 0);
  assert.deepEqual(summarizeApprovedSettlements([f.document()]), []);
  await assert.rejects(f.service.execute({ action: "SAVE", actor, requestKey: "edit", expectedVersion: version(2), draft }), { code: "INVALID_STATE" });
});
test("SYNTHETIC: exact settlement mismatch including underpayment blocks approval atomically", async () => {
  for (const amount of ["249", "251", "0"]) {
    const f = fixture(); const draft = syntheticDraft();
    await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: { ...draft, settlements: draft.settlements.map(row => ({ ...row, amount: minorAmount(amount) })) } });
    const before = f.store.snapshot();
    await assert.rejects(f.service.execute({ action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales }), { code: "SETTLEMENT_MISMATCH" });
    assert.deepEqual(f.store.snapshot(), before);
  }
});
test("SYNTHETIC: refund uses direction plus nonnegative actual amount, never negative payment/account balance", async () => {
  const f = fixture(); const draft = syntheticDraft("RETURN");
  assert.equal(draft.settlements[0]?.amount, 250n); assert.equal(draft.settlements[0]?.direction, "REFUND");
  await assert.rejects(f.service.execute({ action: "SAVE", actor, requestKey: "bad", expectedVersion: null,
    draft: { ...draft, settlements: draft.settlements.map(row => ({ ...row, amount: minorAmount("-250") })) } }), { code: "INVALID_SETTLEMENT" });
  assert.equal(f.store.snapshot().headers.size, 0);
});
test("SYNTHETIC: same SKU real lines remain separate, including gift and different price", async () => {
  const f = fixture(); const base = syntheticDraft("EXCHANGE", ["1", "1"]);
  const line1 = base.lines[0]!; const line2 = { ...base.lines[1]!, skuId: line1.skuId, dealPrice: minorAmount("0"), lineAmount: minorAmount("0"), isGift: true };
  const draft = { ...base, header: { ...base.header, grossAmount: minorAmount("125"), netDue: minorAmount("125") }, lines: [line1, line2], settlements: base.settlements.map(row => ({ ...row, amount: minorAmount("125") })) };
  await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft });
  await f.service.execute({ action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales });
  assert.equal(f.document().lines.length, 2); assert.equal(f.store.snapshot().ledger.length, 2); assert.equal(f.balance(), -2n);
});
test("SYNTHETIC: unapprove/edit/reapprove uses immutable original effects and retains removed referenced lines", async () => {
  const f = fixture(); await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: syntheticDraft() });
  await f.service.execute({ action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales });
  const original = f.store.snapshot().ledger[0];
  await f.service.execute({ action: "UNAPPROVE", actor, requestKey: "u", expectedVersion: version(2), salesId: ids.sales });
  const next = syntheticDraft("SALE", ["5"]); const changed = { ...next, lines: next.lines.map(row => ({ ...row, id: ids.line2 })) };
  await f.service.execute({ action: "SAVE", actor, requestKey: "s2", expectedVersion: version(3), draft: changed });
  assert.equal(f.document().lines.find(row => row.id === ids.line)?.isCurrent, false);
  await f.service.execute({ action: "APPROVE", actor, requestKey: "a2", expectedVersion: version(4), salesId: ids.sales });
  assert.equal(f.balance(), -5n); assert.deepEqual(f.store.snapshot().ledger[0], original);
  const change = f.store.snapshot().audit[3];
  assert.equal(change?.before?.lines[0]?.quantity, 2n); assert.ok(change?.after.lines.some(row => row.quantity === 5n));
});
test("SYNTHETIC: duplicate unapprove cannot reverse one original effect twice", async () => {
  const f = fixture(); await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: syntheticDraft() });
  await f.service.execute({ action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales });
  const command: SalesCommand = { action: "UNAPPROVE", actor, requestKey: "u", expectedVersion: version(2), salesId: ids.sales };
  assert.deepEqual(await f.service.execute(command), await f.service.execute(command));
  await assert.rejects(f.service.execute({ ...command, requestKey: "u2", expectedVersion: version(3) }), { code: "INVALID_STATE" });
  assert.equal(f.store.snapshot().ledger.length, 2); assert.equal(f.balance(), 0n);
});
for (const failAt of ["balance:2", "document", "audit", "receipt"]) {
  test(`SYNTHETIC: injected ${failAt} failure rolls back all effects, and original key safely retries`, async () => {
    const f = fixture(); await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: syntheticDraft("EXCHANGE") });
    const before = f.store.snapshot(); f.store.failNextAt = failAt;
    const command: SalesCommand = { action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales };
    await assert.rejects(f.service.execute(command), /SYNTHETIC injected failure/); assert.deepEqual(f.store.snapshot(), before);
    assert.equal((await f.service.execute(command)).status, "APPROVED"); assert.equal(f.store.snapshot().ledger.length, 2);
  });
}
test("SYNTHETIC: missing inventory coverage cannot be invented as zero", async () => {
  const f = fixture(); const draft = syntheticDraft(); const missingWarehouse = sid("warehouse", 999);
  await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: { ...draft, header: { ...draft.header, warehouseId: missingWarehouse } } });
  const before = f.store.snapshot();
  await assert.rejects(f.service.execute({ action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales }), { code: "INVENTORY_NOT_READY" });
  assert.deepEqual(f.store.snapshot(), before);
});
test("SYNTHETIC: stock overflow aborts instead of wrapping or partially posting", async () => {
  const f = fixture(); f.store.seedBalance({ warehouseId: ids.warehouse, skuId: ids.sku, quantity: quantity(QUANTITY_MIN.toString()), version: version(1), lastOperationId: null, updatedAt: "2026-10-20T00:00:00Z" });
  await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: syntheticDraft() }); const before = f.store.snapshot();
  await assert.rejects(f.service.execute({ action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales }), { code: "QUANTITY_OVERFLOW" }); assert.deepEqual(f.store.snapshot(), before);
});
test("SYNTHETIC: authorization is mandatory on writes and idempotent result recovery", async () => {
  const f = fixture(); const command: SalesCommand = { action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: syntheticDraft() };
  await f.service.execute(command); const before = f.store.snapshot(); f.revokeAccess();
  await assert.rejects(f.service.execute(command), { code: "FORBIDDEN" });
  await assert.rejects(f.service.execute({ action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales }), { code: "FORBIDDEN" });
  assert.deepEqual(f.store.snapshot(), before);
});
test("SYNTHETIC: imported cutoff history never falls through runtime reversal/edit logic", async () => {
  const f = fixture(); await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: syntheticDraft() });
  const historical = { ...f.document(), header: { ...f.document().header, status: "APPROVED" as const } }; f.store.seedCutoffHistory(historical); const before = f.store.snapshot();
  await assert.rejects(f.service.execute({ action: "UNAPPROVE", actor, requestKey: "u", expectedVersion: version(1), salesId: ids.sales }), { code: "HISTORICAL_POSTING_NOT_IMPLEMENTED" });
  assert.deepEqual(f.store.snapshot(), before);
});
test("SYNTHETIC: only approved documents enter settlement statistics; unapprove exits, reapprove reenters once", async () => {
  const f = fixture(); await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: syntheticDraft() });
  assert.deepEqual(summarizeApprovedSettlements([f.document()]), []);
  await f.service.execute({ action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales });
  assert.equal(summarizeApprovedSettlements([f.document()])[0]?.received, 250n);
  await f.service.execute({ action: "UNAPPROVE", actor, requestKey: "u", expectedVersion: version(2), salesId: ids.sales });
  assert.deepEqual(summarizeApprovedSettlements([f.document()]), []);
  await f.service.execute({ action: "APPROVE", actor, requestKey: "a2", expectedVersion: version(3), salesId: ids.sales });
  assert.equal(summarizeApprovedSettlements([f.document()])[0]?.received, 250n);
});
test("SYNTHETIC: true null creating-hall snapshot remains null after a different current hall saves", async () => {
  const f = fixture(); const draft = syntheticDraft(); await f.service.execute({ action: "SAVE", actor: { ...actor, hallId: null }, requestKey: "s", expectedVersion: null, draft });
  await f.service.execute({ action: "SAVE", actor, requestKey: "s2", expectedVersion: version(1), draft });
  assert.equal(f.document().header.createdHallId, null);
});
test("SYNTHETIC: existing SAVE checks both source and proposed destination scopes before any mutation", async () => {
  for (const deniedReference of ["hall", "warehouse", "customer", "paymentAccount"] as const) {
    const observed: string[] = [];
    const f = fixture({ authorize: async (_context, _action, document) => {
      observed.push(document.header.hallId);
      requireDomain(document.header.hallId === ids.hall && document.header.warehouseId === ids.warehouse
        && document.header.customerId === ids.customer && document.settlements.every(row => row.paymentAccountId === ids.payment),
      "DESTINATION_SCOPE_FORBIDDEN", "Synthetic destination reference scope is not authorized");
    } });
    const draft = syntheticDraft();
    await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft });
    observed.length = 0;
    const changed = { ...draft, header: { ...draft.header,
      ...(deniedReference === "hall" ? { hallId: sid("hall", 990) } : {}),
      ...(deniedReference === "warehouse" ? { warehouseId: sid("warehouse", 991) } : {}),
      ...(deniedReference === "customer" ? { customerId: sid("customer", 992) } : {}) },
      settlements: draft.settlements.map(row => ({ ...row, ...(deniedReference === "paymentAccount" ? { paymentAccountId: sid("paymentAccount", 993) } : {}) })) };
    const before = f.store.snapshot();
    await assert.rejects(f.service.execute({ action: "SAVE", actor, requestKey: "move", expectedVersion: version(1), draft: changed }), { code: "DESTINATION_SCOPE_FORBIDDEN" });
    assert.equal(observed.length, 2, "Source and proposed record must both be checked");
    assert.deepEqual(f.store.snapshot(), before, `Denied ${deniedReference} change must not mutate any table`);
  }
});
test("SYNTHETIC: duplicate documents cannot silently double-count settlement statistics", async () => {
  const f = fixture(); await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: syntheticDraft() });
  await f.service.execute({ action: "APPROVE", actor, requestKey: "a", expectedVersion: version(1), salesId: ids.sales });
  assert.throws(() => summarizeApprovedSettlements([f.document(), f.document()]), { code: "DUPLICATE_STATISTICS_DOCUMENT" });
});
test("SYNTHETIC: changing a caller alias while execute waits cannot change the data bound to the original request hash", async () => {
  const f = fixture(); const draft = syntheticDraft();
  const command: SalesCommand = { action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft };
  const original = structuredClone(command);
  const pending = f.service.execute(command);
  (draft.header as { note: string | null }).note = "CHANGED AFTER EXECUTE";
  const first = await pending;
  assert.equal(f.document().header.note, "SYNTHETIC ONLY");
  assert.deepEqual(await f.service.execute(original), first);
  await assert.rejects(f.service.execute(command), { code: "IDEMPOTENCY_CONFLICT" });
});
test("SYNTHETIC: audit retains every permitted mutable header field and business line price/display snapshot", async () => {
  const f = fixture(); const draft = syntheticDraft();
  await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft });
  const edited = { ...draft, header: { ...draft.header, number: "SYNTHETIC-CHANGED-NUMBER", hallId: sid("hall", 994), salespersonId: sid("staff", 995) },
    lines: draft.lines.map(row => ({ ...row, referencePrice: minorAmount("999"), snapshot: { ...row.snapshot, sizeName: "SYNTHETIC-SNAPSHOT-CHANGED" } })) };
  await f.service.execute({ action: "SAVE", actor, requestKey: "s2", expectedVersion: version(1), draft: edited });
  const audit = f.store.snapshot().audit[1]!;
  assert.equal(audit.before?.header.number, draft.header.number); assert.equal(audit.after.header.number, edited.header.number);
  assert.equal(audit.before?.header.hallId, ids.hall); assert.equal(audit.after.header.hallId, edited.header.hallId);
  assert.equal(audit.before?.header.salespersonId, null); assert.equal(audit.after.header.salespersonId, edited.header.salespersonId);
  assert.equal(audit.before?.lines[0]?.referencePrice, 125n); assert.equal(audit.after.lines[0]?.referencePrice, 999n);
  assert.equal(audit.before?.lines[0]?.snapshot.sizeName, "SYNTHETIC_SIZE_A");
  assert.equal(audit.after.lines[0]?.snapshot.sizeName, "SYNTHETIC-SNAPSHOT-CHANGED");
});
test("SYNTHETIC: operation keys are scoped by authenticated actor, not globally shared", async () => {
  const f = fixture(); await f.service.execute({ action: "SAVE", actor, requestKey: "same-key", expectedVersion: null, draft: syntheticDraft() });
  const otherActor = { ...actor, accountId: sid("account", 996) };
  await f.service.execute({ action: "APPROVE", actor: otherActor, requestKey: "same-key", expectedVersion: version(1), salesId: ids.sales });
  assert.equal(f.store.snapshot().receipts.size, 2); assert.equal(f.balance(), -2n);
});
test("SYNTHETIC: duplicate/foreign lines and more than three settlement rows fail before persistence", async () => {
  const draft = syntheticDraft();
  const cases = [
    { ...draft, lines: [draft.lines[0]!, draft.lines[0]!] },
    { ...draft, lines: draft.lines.map(line => ({ ...line, salesId: sid("sales", 997) })) },
    { ...draft, settlements: Array.from({ length: 4 }, (_, index) => ({ ...draft.settlements[0]!, id: sid("settlement", 998 + index), lineNo: index + 1 })) }
  ];
  for (const invalid of cases) {
    const f = fixture();
    await assert.rejects(f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: invalid }));
    assert.equal(f.store.snapshot().headers.size, 0); assert.equal(f.store.snapshot().receipts.size, 0);
  }
});

test("SYNTHETIC: memo-only evidence is constant size, with no unchanged current or retained business rows", async () => {
  const sizes: number[] = [];
  for (const count of [1, 250]) {
    const f = fixture(); const base = syntheticDraft();
    const lines = Array.from({ length: count }, (_, index) => ({ ...base.lines[0]!, id: sid("salesLine", 3000 + index), lineNo: index + 1 }));
    const total = minorAmount(String(250 * count));
    const draft = { ...base, lines, header: { ...base.header, grossAmount: total, netDue: total }, settlements: base.settlements.map(row => ({ ...row, amount: total })) };
    await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft });
    await f.service.execute({ action: "SAVE", actor, requestKey: "memo", expectedVersion: version(1), draft: { ...draft, header: { ...draft.header, note: "CHANGED MEMO" } } });
    const evidence = f.store.snapshot().audit[1]!;
    assert.deepEqual(evidence.before, { header: { version: version(1), note: "SYNTHETIC ONLY" }, lines: [], settlements: [] });
    assert.deepEqual(evidence.after, { header: { version: version(2), note: "CHANGED MEMO" }, lines: [], settlements: [] });
    assert.equal(evidence.actorAccountId, actor.accountId); assert.equal(evidence.salesId, ids.sales);
    assert.equal(evidence.operationId, [...f.store.snapshot().receipts.values()][1]?.result.operationId);
    sizes.push(JSON.stringify(evidence).length);
    // Removing a line retains native provenance; later memo edits must not copy it.
    if (count > 1) {
      await f.service.execute({ action: "SAVE", actor, requestKey: "remove", expectedVersion: version(2), draft: { ...draft, lines: lines.slice(1) } });
      await f.service.execute({ action: "SAVE", actor, requestKey: "retained-memo", expectedVersion: version(3), draft: { ...draft, lines: lines.slice(1), header: { ...draft.header, note: "RETAINED MEMO" } } });
      const retainedEdit = f.store.snapshot().audit[3]!;
      assert.deepEqual(retainedEdit.before?.lines, []); assert.deepEqual(retainedEdit.after.lines, []);
      assert.equal(f.document().lines.find(row => row.id === lines[0]?.id)?.isCurrent, false);
    }
  }
  assert.equal(sizes[0], sizes[1]); assert.ok(sizes[0]! < 600);
});

test("SYNTHETIC: edited, removed and added lines have complete evidence while unchanged siblings stay native", async () => {
  const f = fixture(); const base = syntheticDraft();
  const lines = [0, 1, 2].map(index => ({ ...base.lines[0]!, id: sid("salesLine", 4000 + index), lineNo: index + 1 }));
  const draft = { ...base, lines, header: { ...base.header, grossAmount: minorAmount("750"), netDue: minorAmount("750") }, settlements: base.settlements.map(row => ({ ...row, amount: minorAmount("750") })) };
  await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft });
  const edited = { ...lines[0]!, quantity: quantity("3"), lineAmount: minorAmount("375"), referencePrice: minorAmount("250"), snapshot: { ...lines[0]!.snapshot, barcode: "CHANGED-BARCODE" } };
  const added = { ...lines[1]!, id: sid("salesLine", 4003), quantity: quantity("1"), lineAmount: minorAmount("125") };
  await f.service.execute({ action: "SAVE", actor, requestKey: "edit", expectedVersion: version(1), draft: { ...draft, lines: [edited, added, lines[2]!] } });
  const audit = f.store.snapshot().audit[1]!;
  assert.deepEqual(audit.before?.lines.map(row => row.id), [lines[0]!.id, lines[1]!.id]);
  assert.deepEqual(new Set(audit.after.lines.map(row => row.id)), new Set([edited.id, lines[1]!.id, added.id]));
  assert.equal(audit.before?.lines.find(row => row.id === edited.id)?.quantity, 2n);
  assert.equal(audit.after.lines.find(row => row.id === edited.id)?.quantity, 3n);
  assert.equal(audit.after.lines.find(row => row.id === edited.id)?.snapshot.barcode, "CHANGED-BARCODE");
  assert.equal(audit.before?.lines.find(row => row.id === lines[1]!.id)?.isCurrent, true);
  assert.equal(audit.after.lines.find(row => row.id === lines[1]!.id)?.isCurrent, false);
  assert.deepEqual(f.document().lines.find(row => row.id === lines[2]!.id), lines[2]);
  assert.deepEqual(audit.before?.settlements, []); assert.deepEqual(audit.after.settlements, []);
});

test("SYNTHETIC: settlement additions, removals and changed account/direction/amount retain exact sparse evidence", async () => {
  const f = fixture(); const base = syntheticDraft();
  const settlements = [0, 1, 2].map(index => ({ ...base.settlements[0]!, id: sid("settlement", 5000 + index), lineNo: index + 1, amount: minorAmount("100") }));
  const draft = { ...base, settlements };
  await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft });
  const changed = { ...settlements[0]!, paymentAccountId: sid("paymentAccount", 5003), direction: "REFUND" as const, amount: minorAmount("99") };
  const added = { ...settlements[1]!, id: sid("settlement", 5004) };
  await f.service.execute({ action: "SAVE", actor, requestKey: "edit", expectedVersion: version(1), draft: { ...draft, settlements: [changed, added, settlements[2]!] } });
  const audit = f.store.snapshot().audit[1]!;
  assert.deepEqual(audit.before?.settlements, settlements.slice(0, 2));
  assert.deepEqual(audit.after.settlements, [changed, added]);
  assert.deepEqual(audit.before?.lines, []); assert.deepEqual(audit.after.lines, []);
  assert.deepEqual(audit.before?.header, { version: version(1) }); assert.deepEqual(audit.after.header, { version: version(2) });
});

test("SYNTHETIC: APPROVE, UNAPPROVE and VOID carry workflow evidence without unchanged lines or settlements", async () => {
  const f = fixture();
  await f.service.execute({ action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: syntheticDraft() });
  for (const [index, action] of (["APPROVE", "UNAPPROVE", "VOID"] as const).entries()) {
    await f.service.execute({ action, actor, requestKey: action, expectedVersion: version(index + 1), salesId: ids.sales });
    const audit = f.store.snapshot().audit[index + 1]!;
    assert.deepEqual(audit.before?.lines, []); assert.deepEqual(audit.after.lines, []);
    assert.deepEqual(audit.before?.settlements, []); assert.deepEqual(audit.after.settlements, []);
    assert.equal(audit.before?.header.version, index + 1); assert.equal(audit.after.header.version, index + 2);
    assert.equal(audit.before?.header.grossAmount, undefined); assert.equal(audit.after.header.number, undefined);
    assert.equal(audit.after.header.status, action === "APPROVE" ? "APPROVED" : action === "VOID" ? "VOID" : "DRAFT");
    if (action === "APPROVE") assert.equal(audit.after.header.approvedByAccountId, actor.accountId);
    if (action === "UNAPPROVE") assert.equal(audit.after.header.approvedAt, null);
  }
});

test("SYNTHETIC: original account/key/body survives trusted hall changes but current access is rechecked", async () => {
  const seen: (typeof actor.hallId)[] = [];
  const f = fixture({ authorize: async context => { seen.push(context.hallId); } });
  const command: SalesCommand = { action: "SAVE", actor, requestKey: "s", expectedVersion: null, draft: syntheticDraft() };
  const saved = await f.service.execute(command); const before = f.store.snapshot();
  const currentActor = { ...actor, hallId: sid("hall", 6000) };
  assert.deepEqual(await f.service.execute({ ...command, actor: currentActor }), saved);
  assert.equal(seen.at(-1), currentActor.hallId); assert.deepEqual(f.store.snapshot(), before);
  await assert.rejects(f.service.execute({ ...command, actor: currentActor, draft: { ...command.draft, header: { ...command.draft.header, note: "DIFFERENT BUSINESS BODY" } } }), { code: "IDEMPOTENCY_CONFLICT" });
  f.revokeAccess();
  await assert.rejects(f.service.execute({ ...command, actor: { ...actor, hallId: null } }), { code: "FORBIDDEN" });
  assert.deepEqual(f.store.snapshot(), before);
});
