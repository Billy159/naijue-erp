import assert from "node:assert/strict";
import test from "node:test";
import { assertSalesActionAllowed, createSalesActionAuthorization } from "../packages/application/src/sales-authorization.ts";
import type { ActorContext, SalesAction, SalesCurrentIdentity } from "../packages/application/src/ports.ts";
import type { SalesDocument } from "../packages/domain/src/documents.ts";
import { version } from "../packages/domain/src/values.ts";
import { actor, fixture, ids, sid, syntheticDraft, syntheticSalesIdentity } from "./support/synthetic-fixtures.ts";
import { SyntheticStore } from "./support/synthetic-store.ts";

const actions: readonly SalesAction[] = ["SAVE", "APPROVE", "UNAPPROVE", "VOID"];
const time = "2026-10-20T12:00:00Z";
function document(overrides: Partial<SalesDocument["header"]> = {}): SalesDocument {
  const draft = syntheticDraft();
  return { ...draft, header: { ...draft.header, status: "DRAFT", version: version(1), createdByAccountId: actor.accountId,
    createdHallId: actor.hallId, createdAt: time, updatedAt: time, approvedByAccountId: null, approvedAt: null, ...overrides } };
}
function actionFixture(identity: SalesCurrentIdentity = syntheticSalesIdentity()) {
  const policy = createSalesActionAuthorization();
  const f = fixture({ authorize: policy.assertAllowed }); f.store.seedIdentity(identity); return f;
}
const save = (requestKey = "save") => ({ action: "SAVE" as const, actor, requestKey, expectedVersion: null, draft: syntheticDraft() });

test("sales action policy: exact salesperson hall/creator matrix is independent of document state", () => {
  for (const status of ["DRAFT", "APPROVED", "VOID"] as const) {
    const mine = document({ status }); const other = document({ status, createdByAccountId: sid("account", 99) });
    for (const action of actions) {
      if (action === "UNAPPROVE") assert.throws(() => assertSalesActionAllowed(actor, action, mine, syntheticSalesIdentity()), { code: "FORBIDDEN" });
      else assert.doesNotThrow(() => assertSalesActionAllowed(actor, action, mine, syntheticSalesIdentity()));
      if (action === "APPROVE" || action === "UNAPPROVE") assert.throws(() => assertSalesActionAllowed(actor, action, other, syntheticSalesIdentity()), { code: "FORBIDDEN" });
      else assert.doesNotThrow(() => assertSalesActionAllowed(actor, action, other, syntheticSalesIdentity()));
      assert.throws(() => assertSalesActionAllowed(actor, action, document({ status, hallId: sid("hall", 99) }), syntheticSalesIdentity()), { code: "FORBIDDEN" });
    }
  }
  assert.throws(() => assertSalesActionAllowed(actor, "APPROVE", syntheticDraft(), syntheticSalesIdentity()), { code: "FORBIDDEN" });
  // Salesperson selection is a business reference, never the creator account.
  assert.throws(() => assertSalesActionAllowed(actor, "APPROVE", document({ salespersonId: sid("staff", 16), createdByAccountId: sid("account", 99) }), syntheticSalesIdentity()), { code: "FORBIDDEN" });
});

test("sales action policy: ADMIN and WAREHOUSE may act across halls, including a genuine null current hall", () => {
  for (const role of ["ADMIN", "WAREHOUSE"]) for (const hallId of [ids.hall, null]) {
    const context: ActorContext = { ...actor, hallId };
    const identity = syntheticSalesIdentity({ role, hallId, hallEnabled: hallId === null ? null : true });
    for (const action of actions) assert.doesNotThrow(() => assertSalesActionAllowed(context, action,
      document({ hallId: sid("hall", 99), createdByAccountId: sid("account", 99) }), identity));
  }
});

test("sales action policy: missing, disabled, departed, unknown, mismatched or invalid identity fails closed", () => {
  const invalid: (SalesCurrentIdentity | undefined)[] = [undefined,
    syntheticSalesIdentity({ loginEnabled: false }), syntheticSalesIdentity({ employmentStatus: "离职" }),
    syntheticSalesIdentity({ employmentStatus: "在职 " }), syntheticSalesIdentity({ role: "admin" }), syntheticSalesIdentity({ role: "ROOT" }),
    syntheticSalesIdentity({ accountId: sid("account", 99) }), syntheticSalesIdentity({ staffId: "bad" as SalesCurrentIdentity["staffId"] }),
    syntheticSalesIdentity({ hallId: sid("hall", 99) }), syntheticSalesIdentity({ hallEnabled: false }), syntheticSalesIdentity({ hallEnabled: null }),
    syntheticSalesIdentity({ hallId: null, hallEnabled: null })];
  for (const identity of invalid) for (const action of actions) assert.throws(() => assertSalesActionAllowed(actor, action, document(), identity), { code: "FORBIDDEN" });
  for (const role of ["ADMIN", "WAREHOUSE", "SALESPERSON"]) {
    const identity = syntheticSalesIdentity({ role, hallId: null, hallEnabled: true });
    assert.throws(() => assertSalesActionAllowed({ ...actor, hallId: null }, "SAVE", syntheticDraft(), identity), { code: "FORBIDDEN" });
    assert.throws(() => assertSalesActionAllowed(actor, "SAVE", syntheticDraft(), syntheticSalesIdentity({ role, hallEnabled: false })), { code: "FORBIDDEN" });
  }
});

test("sales transaction authorization: no tx, no seed and leaked synthetic tx never imply ADMIN", async () => {
  const policy = createSalesActionAuthorization();
  await assert.rejects(() => policy.assertAllowed(actor, "SAVE", syntheticDraft()), { code: "FORBIDDEN" });
  const f = fixture({ authorize: policy.assertAllowed });
  await assert.rejects(() => f.service.execute(save()), { code: "FORBIDDEN" }); assert.equal(f.store.snapshot().headers.size, 0);
  const store = new SyntheticStore(); let escaped: Parameters<Parameters<typeof store.transaction>[0]>[0] | undefined;
  await store.transaction(async tx => {
    escaped = tx;
    await assert.rejects(() => tx.getCurrentSalesIdentity(actor.accountId), { code: "TRANSACTION_SCOPE" });
    await tx.getReceipt(actor.accountId, "key"); await tx.getSales(ids.sales);
    assert.equal(await tx.getCurrentSalesIdentity(actor.accountId), undefined);
  });
  await assert.rejects(() => escaped!.getCurrentSalesIdentity(actor.accountId), { code: "TRANSACTION_CLOSED" });
});

test("sales transaction authorization: service preserves true creator, checks proposed hall and reuses the command tx", async () => {
  const calls: unknown[] = []; const policy = createSalesActionAuthorization();
  const f = fixture({ authorize: async (context, action, value, tx) => { assert.ok(tx); calls.push(tx); await policy.assertAllowed(context, action, value, tx); } });
  f.store.seedIdentity(syntheticSalesIdentity());
  // Even a caller-owned excess header value cannot become the stored creator.
  const original = syntheticDraft(); const forged = { ...original, header: { ...original.header, createdByAccountId: sid("account", 99), createdHallId: sid("hall", 99), createdAt: "FORGED" } };
  await f.service.execute({ ...save(), draft: forged }); assert.equal(f.document().header.createdByAccountId, actor.accountId);
  const created = f.document().header;
  await f.service.execute({ action: "SAVE", actor, requestKey: "edit", expectedVersion: version(1), draft: original });
  assert.equal(calls[1], calls[2]); assert.notEqual(calls[0], calls[1]);
  for (const key of ["createdByAccountId", "createdHallId", "createdAt"] as const) assert.equal(f.document().header[key], created[key]);
  const before = f.store.snapshot();
  await assert.rejects(() => f.service.execute({ action: "SAVE", actor, requestKey: "move", expectedVersion: version(2),
    draft: { ...original, header: { ...original.header, hallId: sid("hall", 99) } } }), { code: "FORBIDDEN" });
  assert.deepEqual(f.store.snapshot(), before);
});

test("sales transaction authorization: salesperson can save/void a colleague's draft, never approve or unapprove it", async () => {
  const f = actionFixture(syntheticSalesIdentity({ role: "ADMIN" }));
  const colleague = { ...actor, accountId: sid("account", 99) };
  f.store.seedIdentity(syntheticSalesIdentity({ ...colleague, role: "SALESPERSON" }));
  await f.service.execute({ ...save(), actor: colleague });
  f.store.seedIdentity(syntheticSalesIdentity());
  await f.service.execute({ action: "SAVE", actor, requestKey: "edit", expectedVersion: version(1), draft: syntheticDraft() });
  const before = f.store.snapshot();
  await assert.rejects(() => f.service.execute({ action: "APPROVE", actor, requestKey: "approve", expectedVersion: version(2), salesId: ids.sales }), { code: "FORBIDDEN" });
  assert.deepEqual(f.store.snapshot(), before); assert.equal(f.document().header.createdByAccountId, colleague.accountId);
  await f.service.execute({ action: "VOID", actor, requestKey: "void", expectedVersion: version(2), salesId: ids.sales }); assert.equal(f.balance(), 0n);
});

test("sales transaction authorization: replay remains recoverable after approval, but current identity is rechecked", async () => {
  const f = actionFixture(); const command = save(); const saved = await f.service.execute(command);
  const approved = await f.service.execute({ action: "APPROVE", actor, requestKey: "approve", expectedVersion: version(1), salesId: ids.sales });
  const before = f.store.snapshot(); assert.deepEqual(await f.service.execute(command), saved); assert.deepEqual(f.store.snapshot(), before);
  await assert.rejects(() => f.service.execute({ action: "UNAPPROVE", actor, requestKey: "unapprove", expectedVersion: approved.version, salesId: ids.sales }), { code: "FORBIDDEN" });
  await assert.rejects(() => f.service.execute({ ...command, requestKey: "edit-approved", expectedVersion: approved.version }), { code: "INVALID_STATE" });
  await assert.rejects(() => f.service.execute({ action: "VOID", actor, requestKey: "void-approved", expectedVersion: approved.version, salesId: ids.sales }), { code: "INVALID_STATE" });
  f.store.seedIdentity(syntheticSalesIdentity({ loginEnabled: false })); const revoked = f.store.snapshot();
  await assert.rejects(() => f.service.execute(command), { code: "FORBIDDEN" }); assert.deepEqual(f.store.snapshot(), revoked);
  f.store.seedIdentity(syntheticSalesIdentity({ hallId: sid("hall", 99) }));
  await assert.rejects(() => f.service.execute(command), { code: "FORBIDDEN" });
});

test("sales transaction authorization: cross-hall administrative actions preserve existing state/economics/history guards", async () => {
  for (const role of ["ADMIN", "WAREHOUSE"]) {
    const f = actionFixture(syntheticSalesIdentity({ role })); const draft = syntheticDraft();
    const crossHall = { ...draft, header: { ...draft.header, hallId: sid("hall", 99) } };
    await f.service.execute({ ...save(), draft: crossHall });
    const approved = await f.service.execute({ action: "APPROVE", actor, requestKey: "approve", expectedVersion: version(1), salesId: ids.sales });
    await f.service.execute({ action: "UNAPPROVE", actor, requestKey: "unapprove", expectedVersion: approved.version, salesId: ids.sales });
    assert.equal(f.balance(), 0n);
    f.store.seedCutoffHistory(f.document());
    await assert.rejects(() => f.service.execute({ action: "VOID", actor, requestKey: "historical", expectedVersion: version(3), salesId: ids.sales }), { code: "HISTORICAL_POSTING_NOT_IMPLEMENTED" });
  }
});

test("sales transaction authorization: stable account fingerprint permits authorized ADMIN receipt recovery after current hall changes", async () => {
  const f = actionFixture(syntheticSalesIdentity({ role: "ADMIN" })); const command = save(); const original = await f.service.execute(command);
  const currentActor = { ...actor, hallId: sid("hall", 99) }; f.store.seedIdentity(syntheticSalesIdentity({ role: "ADMIN", hallId: currentActor.hallId }));
  const before = f.store.snapshot(); assert.deepEqual(await f.service.execute({ ...command, actor: currentActor }), original); assert.deepEqual(f.store.snapshot(), before);
});
