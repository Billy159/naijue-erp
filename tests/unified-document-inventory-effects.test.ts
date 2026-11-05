import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalDocumentInventorySnapshot, documentInventoryEffects, diffDocumentInventoryEffects,
  planDocumentInventoryMigration, planDocumentInventoryTransition, planInventoryEffectBalances,
} from "../packages/domain/src/document-inventory-effects.ts";
import type {
  DocumentInventorySnapshot, DocumentInventoryMigrationInput, DocumentInventoryLedgerEvidence,
  DocumentInventoryTransitionInput,
} from "../packages/domain/src/document-inventory-effects.ts";
import { businessDate, entityId, quantity, version, QUANTITY_MIN, QUANTITY_MAX } from "../packages/domain/src/values.ts";
import type { EntityKind } from "../packages/domain/src/values.ts";

// Every identity and fact in this file is synthetic. No PG, real source, actor, or inventory is read.
const id = <K extends EntityKind>(kind: K, n: number) => entityId(kind, `70000000-0000-0000-0000-${n.toString().padStart(12, "0")}`);
const salesId = id("sales", 1), transferId = id("transfer", 2), whA = id("warehouse", 3), whB = id("warehouse", 4), whC = id("warehouse", 5);
const skuA = id("sku", 6), skuB = id("sku", 7), actor = id("account", 8), migrateOp = id("operation", 9);
const date = businessDate("2026-11-02"), time = "2026-11-02T09:00:00Z", sha = "a".repeat(64);
function sales(status: "DRAFT" | "APPROVED" | "VOID" = "APPROVED", q = "10", v = 4,
  businessType: "SALE" | "RETURN" | "EXCHANGE" = "SALE"): Extract<DocumentInventorySnapshot, { kind: "SALES" }> {
  return { kind: "SALES", header: { id: salesId, businessType, businessDate: date, warehouseId: whA, status, version: version(v) },
    lines: [{ id: id("salesLine", 10), salesId, lineNo: 1, skuId: skuA, quantity: quantity(q), isCurrent: true }] };
}
function transfer(status: "DRAFT" | "APPROVED" | "VOID" = "APPROVED", q = "10", v = 4): Extract<DocumentInventorySnapshot, { kind: "TRANSFER" }> {
  return { kind: "TRANSFER", header: { id: transferId, businessDate: date, fromWarehouseId: whA, toWarehouseId: whB, status, version: version(v) },
    lines: [{ id: id("transferLine", 11), transferId, lineNo: 1, skuId: skuA, quantity: quantity(q), isCurrent: true }] };
}
function next<T extends DocumentInventorySnapshot>(snapshot: T, status: T["header"]["status"]): T {
  return { ...snapshot, header: { ...snapshot.header, status, version: version(snapshot.header.version + 1) } };
}
function migrationInput(snapshot: DocumentInventorySnapshot = sales()): DocumentInventoryMigrationInput {
  return { snapshot, source: { batchId: "70000000-0000-0000-0000-000000000020", sourceRecordId: "70000000-0000-0000-0000-000000000021",
    sourceSystem: "SYNTHETIC_ERP", sourceEntityType: snapshot.kind, sourceKey: "synthetic-original-document", sourceRecordSha256: sha },
    receipt: { id: migrateOp, action: "MIGRATE_DOCUMENT", status: "COMMITTED", targetKind: snapshot.kind,
      targetId: snapshot.header.id, targetVersion: snapshot.header.version, actorAccountId: actor, completedAt: time },
    audit: { operationId: migrateOp, actorAccountId: actor, occurredAt: time, oldVersion: null, newVersion: snapshot.header.version },
    coverage: { state: "CONFIRMED", baselineBatchId: "70000000-0000-0000-0000-000000000022", baselineManifestSha256: sha,
      cutoffAt: "2026-11-02T08:00:00Z", snapshotKey: canonicalDocumentInventorySnapshot(snapshot) } };
}
function op(n: number) { return id("operation", 100 + n); }
function transition(action: DocumentInventoryTransitionInput["action"], before: DocumentInventorySnapshot | null,
  after: DocumentInventorySnapshot, n: number, priorEvidence?: DocumentInventoryTransitionInput["priorEvidence"]) {
  return planDocumentInventoryTransition({ action, before, after, operationId: op(n), ...(priorEvidence === undefined ? {} : { priorEvidence }) });
}
function ledger(plan: ReturnType<typeof planDocumentInventoryTransition>, n: number): readonly DocumentInventoryLedgerEvidence[] {
  return plan.ledgerIntents.map((intent, i) => ({ ...intent, id: id("ledger", n + i), postedAt: time }));
}
function balances(plan: { readonly balanceDeltas: ReturnType<typeof diffDocumentInventoryEffects> }, quantities: readonly [typeof whA, typeof skuA, string][]) {
  return planInventoryEffectBalances(plan.balanceDeltas, quantities.map(([warehouseId, skuId, q]) => ({ warehouseId, skuId, state: "KNOWN", quantity: quantity(q) })));
}

test("SYNTHETIC: migration has a real anchor but zero replay, ledger, or historical balances", () => {
  const input = migrationInput(), original = structuredClone(input), plan = planDocumentInventoryMigration(input);
  assert.equal(plan.anchor.receipt.action, "MIGRATE_DOCUMENT");
  assert.equal(plan.anchor.receipt.id, migrateOp); assert.deepEqual(plan.ledgerIntents, []); assert.deepEqual(plan.balanceDeltas, []);
  assert.deepEqual(plan.anchor.baselineEffects.map(e => e.quantityDelta), [-10n]);
  assert.equal("quantityBefore" in plan.anchor, false); assert.equal("quantityAfter" in plan.anchor, false);
  assert.deepEqual(input, original);
});

test("SYNTHETIC: 100 → import100 → unapprove110 → draft12 unchanged → approve98 → runtime reversal110", () => {
  const approved = sales(), imported = planDocumentInventoryMigration(migrationInput(approved));
  const draft = next(approved, "DRAFT"), u = transition("UNAPPROVE", approved, draft, 1, { kind: "BASELINE_ANCHOR", anchor: imported.anchor, entries: [] });
  assert.equal(u.ledgerIntents[0]?.quantityDelta, 10n); assert.equal(u.ledgerIntents[0]?.baselineAnchorOperationId, migrateOp);
  assert.equal(u.ledgerIntents[0]?.reversesEntryId, null); assert.equal(balances(u, [[whA, skuA, "100"]])[0]?.quantityAfter, 110n);
  const edited = { ...sales("DRAFT", "12", 6) }, s = transition("SAVE", draft, edited, 2);
  assert.deepEqual(s.ledgerIntents, []); assert.deepEqual(s.balanceDeltas, []);
  const reapproved = next(edited, "APPROVED"), a = transition("APPROVE", edited, reapproved, 3);
  assert.equal(balances(a, [[whA, skuA, "110"]])[0]?.quantityAfter, 98n);
  assert.equal(a.ledgerIntents[0]?.baselineAnchorOperationId, null); assert.equal(a.ledgerIntents[0]?.reversesEntryId, null);
  const history = [...ledger(u, 200), ...ledger(a, 210)];
  const u2 = transition("UNAPPROVE", reapproved, next(reapproved, "DRAFT"), 4, { kind: "RUNTIME_LEDGER", entries: history });
  assert.equal(u2.ledgerIntents[0]?.reversesEntryId, history[1]?.id); assert.equal(u2.ledgerIntents[0]?.baselineAnchorOperationId, null);
  assert.equal(balances(u2, [[whA, skuA, "98"]])[0]?.quantityAfter, 110n);
  assert.deepEqual(diffDocumentInventoryEffects(approved, reapproved).map(e => e.quantityDelta), [-2n]);
});

test("SYNTHETIC: imported draft edits freely and first approval has full ordinary effect", () => {
  const draft = sales("DRAFT"), input = migrationInput(draft);
  const imported = planDocumentInventoryMigration({ ...input, coverage: { state: "UNKNOWN", reason: "Synthetic extraction not bound to a baseline" } });
  assert.equal(imported.anchor.coverage.state, "UNKNOWN"); assert.deepEqual(imported.anchor.baselineEffects, []);
  const edited = sales("DRAFT", "12", 5); assert.deepEqual(transition("SAVE", draft, edited, 1).ledgerIntents, []);
  const a = transition("APPROVE", edited, next(edited, "APPROVED"), 2);
  assert.equal(balances(a, [[whA, skuA, "100"]])[0]?.quantityAfter, 88n);
});

test("SYNTHETIC: repeated same input yields stable operation intents, never generates IDs or consumes an anchor", () => {
  const before = sales(), after = next(before, "DRAFT"), anchor = planDocumentInventoryMigration(migrationInput(before)).anchor;
  const args = { action: "UNAPPROVE", before, after, operationId: op(1), priorEvidence: { kind: "BASELINE_ANCHOR", anchor, entries: [] } } as const;
  const copy = structuredClone(args); assert.deepEqual(planDocumentInventoryTransition(args), planDocumentInventoryTransition(args));
  assert.deepEqual(args, copy); assert.equal(planDocumentInventoryTransition(args).ledgerIntents.length, 1);
  assert.notEqual(transition("UNAPPROVE", before, after, 2, args.priorEvidence).ledgerIntents[0]?.intentKey,
    planDocumentInventoryTransition(args).ledgerIntents[0]?.intentKey);
});

test("SYNTHETIC: transfer import50/70 → unapprove60/60 → edit12 → approve48/72 conserves each endpoint", () => {
  const before = transfer(), anchor = planDocumentInventoryMigration(migrationInput(before)).anchor, draft = next(before, "DRAFT");
  const u = transition("UNAPPROVE", before, draft, 1, { kind: "BASELINE_ANCHOR", anchor, entries: [] });
  assert.deepEqual(balances(u, [[whA, skuA, "50"], [whB, skuA, "70"]]).map(x => x.quantityAfter), [60n, 60n]);
  const edited = transfer("DRAFT", "12", 6), a = transition("APPROVE", edited, next(edited, "APPROVED"), 2);
  assert.deepEqual(balances(a, [[whA, skuA, "60"], [whB, skuA, "60"]]).map(x => x.quantityAfter), [48n, 72n]);
  assert.equal(a.ledgerIntents.reduce((sum, row) => sum + row.quantityDelta, 0n), 0n);
  assert.deepEqual(diffDocumentInventoryEffects(before, next(edited, "APPROVED")).map(x => x.quantityDelta), [-2n, 2n]);
});

test("SYNTHETIC: warehouse/SKU union retains old and new keys; telescoping and transfer conservation hold", () => {
  const a = transfer(), b = { ...transfer("APPROVED", "12", 8), header: { ...transfer().header, version: version(8), toWarehouseId: whC },
    lines: transfer().lines.map(l => ({ ...l, skuId: skuB, quantity: quantity("12") })) };
  const deltas = diffDocumentInventoryEffects(a, b);
  assert.deepEqual(deltas.map(x => [x.warehouseId, x.skuId, x.quantityDelta]), [[whA, skuA, 10n], [whA, skuB, -12n], [whB, skuA, -10n], [whC, skuB, 12n]]);
  const mid = next(a, "DRAFT"), summed = new Map<string, bigint>();
  for (const d of [...diffDocumentInventoryEffects(a, mid), ...diffDocumentInventoryEffects(mid, b)]) {
    const key = `${d.warehouseId}/${d.skuId}`; summed.set(key, (summed.get(key) ?? 0n) + d.quantityDelta);
  }
  assert.deepEqual(deltas.map(d => summed.get(`${d.warehouseId}/${d.skuId}`)), deltas.map(d => d.quantityDelta));
  assert.equal(deltas.reduce((sum, row) => sum + row.quantityDelta, 0n), 0n);
});

for (const type of ["RETURN", "EXCHANGE"] as const) for (const q of ["-3", "3"]) {
  test(`SYNTHETIC: ${type} preserves existing nonzero signed quantity ${q} without abs`, () => {
    const before = sales("APPROVED", q, 4, type), anchor = planDocumentInventoryMigration(migrationInput(before)).anchor;
    assert.equal(documentInventoryEffects(before)[0]?.quantityDelta, -BigInt(q));
    const u = transition("UNAPPROVE", before, next(before, "DRAFT"), 1, { kind: "BASELINE_ANCHOR", anchor, entries: [] });
    assert.equal(u.ledgerIntents[0]?.quantityDelta, BigInt(q));
  });
}

test("SYNTHETIC: repeated SKU lines remain distinct; inactive retained lines have no effect; order is deterministic", () => {
  const one = sales(), two = { ...one.lines[0]!, id: id("salesLine", 30), lineNo: 2, quantity: quantity("2") };
  const inactive = { ...one.lines[0]!, id: id("salesLine", 31), lineNo: 3, quantity: quantity("999"), isCurrent: false };
  const doc = { ...one, lines: [two, inactive, ...one.lines] };
  assert.equal(documentInventoryEffects(doc).length, 2); assert.equal(diffDocumentInventoryEffects(next(doc, "DRAFT"), doc)[0]?.quantityDelta, -12n);
  assert.deepEqual(documentInventoryEffects(doc), documentInventoryEffects({ ...doc, lines: [...doc.lines].reverse() }));
});

test("SYNTHETIC: ordinary state machine rejects approved edits, draft unapprove, void revival, implicit version jumps, and action edits", () => {
  const approved = sales(), draft = sales("DRAFT"), voided = sales("VOID");
  const invalid: [DocumentInventoryTransitionInput["action"], DocumentInventorySnapshot | null, DocumentInventorySnapshot][] = [
    ["SAVE", approved, sales("DRAFT", "12", 5)], ["UNAPPROVE", draft, next(draft, "DRAFT")], ["APPROVE", approved, next(approved, "APPROVED")],
    ["VOID", approved, next(approved, "VOID")], ["SAVE", voided, next(voided, "DRAFT")], ["APPROVE", draft, sales("APPROVED", "10", 9)],
    ["APPROVE", draft, sales("APPROVED", "12", 5)], ["SAVE", null, sales("DRAFT", "10", 2)],
  ];
  for (const [action, before, after] of invalid) assert.throws(() => transition(action, before, after, 1));
  assert.deepEqual(transition("SAVE", null, sales("DRAFT", "10", 1), 1).ledgerIntents, []);
  assert.deepEqual(transition("VOID", draft, next(draft, "VOID"), 1).ledgerIntents, []);
});

test("SYNTHETIC: unknown coverage only blocks stock-dependent anchor reversal, not migration/save/void", () => {
  const approved = sales(), input = migrationInput(approved), anchor = planDocumentInventoryMigration({ ...input,
    coverage: { state: "UNKNOWN", reason: "Synthetic cutoff inclusion not established" } }).anchor;
  assert.throws(() => transition("UNAPPROVE", approved, next(approved, "DRAFT"), 1, { kind: "BASELINE_ANCHOR", anchor, entries: [] }), { code: "BASELINE_COVERAGE_UNKNOWN" });
  assert.deepEqual(transition("SAVE", sales("DRAFT"), sales("DRAFT", "12", 5), 1).balanceDeltas, []);
  assert.deepEqual(transition("VOID", sales("DRAFT"), sales("VOID", "10", 5), 1).balanceDeltas, []);
});

test("SYNTHETIC: anchor validates receipt/audit/source/baseline and exact effective snapshot, not just UUID", () => {
  const input = migrationInput(), good = planDocumentInventoryMigration(input).anchor;
  const badInputs: DocumentInventoryMigrationInput[] = [
    { ...input, receipt: { ...input.receipt, targetId: id("sales", 777) } },
    { ...input, audit: { ...input.audit, actorAccountId: id("account", 777) } },
    { ...input, audit: { ...input.audit, newVersion: version(5) } },
    { ...input, source: { ...input.source, sourceRecordSha256: "unknown" } },
    { ...input, coverage: { ...input.coverage, state: "CONFIRMED", baselineBatchId: "invalid", baselineManifestSha256: sha,
      cutoffAt: time, snapshotKey: canonicalDocumentInventorySnapshot(input.snapshot) } },
    { ...input, snapshot: sales("APPROVED", "11") },
  ];
  for (const bad of badInputs) assert.throws(() => planDocumentInventoryMigration(bad));
  assert.throws(() => transition("UNAPPROVE", sales("APPROVED", "11"), sales("DRAFT", "11", 5), 1,
    { kind: "BASELINE_ANCHOR", anchor: good, entries: [] }), { code: "MISSING_POSTING_PROVENANCE" });
  assert.throws(() => transition("UNAPPROVE", sales(), sales("DRAFT", "10", 5), 1), { code: "MISSING_POSTING_PROVENANCE" });
});

test("SYNTHETIC: runtime reversal requires complete exact active original rows and rejects duplicates/mismatch", () => {
  const draft = sales("DRAFT"), approved = next(draft, "APPROVED"), a = transition("APPROVE", draft, approved, 1), original = ledger(a, 300)[0]!;
  const badSets: readonly (readonly DocumentInventoryLedgerEvidence[])[] = [[], [original, original], [{ ...original, quantityDelta: quantity("-9") }],
    [{ ...original, warehouseId: whB }], [{ ...original, sourceDocumentVersion: version(4) }],
    [{ ...original, baselineAnchorOperationId: migrateOp }], [{ ...original, source: { kind: "SALES", salesId, salesLineId: id("salesLine", 888), endpoint: "SALES_WAREHOUSE" } }]];
  for (const entries of badSets) assert.throws(() => transition("UNAPPROVE", approved, next(approved, "DRAFT"), 2, { kind: "RUNTIME_LEDGER", entries }), { code: "MISSING_POSTING_PROVENANCE" });
  const u = transition("UNAPPROVE", approved, next(approved, "DRAFT"), 2, { kind: "RUNTIME_LEDGER", entries: [original] });
  assert.throws(() => transition("UNAPPROVE", approved, next(approved, "DRAFT"), 3, { kind: "RUNTIME_LEDGER", entries: [original, ...ledger(u, 301)] }), { code: "MISSING_POSTING_PROVENANCE" });
  assert.throws(() => transition("UNAPPROVE", sales(), sales("DRAFT", "10", 5), 3,
    { kind: "BASELINE_ANCHOR", anchor: planDocumentInventoryMigration(migrationInput()).anchor, entries: [original] }), { code: "MISSING_POSTING_PROVENANCE" });
});

test("SYNTHETIC: exact bigint math checks input, negation, aggregate, delta and balance overflow", () => {
  assert.throws(() => documentInventoryEffects(sales("APPROVED", QUANTITY_MIN.toString(), 4, "RETURN")), { code: "QUANTITY_OVERFLOW" });
  const invalid = sales(); assert.throws(() => documentInventoryEffects({ ...invalid, lines: invalid.lines.map(l => ({ ...l, quantity: (QUANTITY_MAX + 1n) as typeof l.quantity })) }), { code: "QUANTITY_OVERFLOW" });
  const max = sales("APPROVED", QUANTITY_MAX.toString()), overflow = { ...max, lines: [...max.lines, { ...max.lines[0]!, id: id("salesLine", 99), lineNo: 2, quantity: quantity("2") }] };
  assert.throws(() => diffDocumentInventoryEffects(sales("DRAFT"), overflow), { code: "QUANTITY_OVERFLOW" });
  assert.throws(() => diffDocumentInventoryEffects(sales("APPROVED", QUANTITY_MAX.toString(), 4, "EXCHANGE"), sales("APPROVED", `-${QUANTITY_MAX}`, 5, "EXCHANGE")), { code: "QUANTITY_OVERFLOW" });
  const a = transition("APPROVE", sales("DRAFT"), sales("APPROVED", "10", 5), 1);
  assert.throws(() => balances(a, [[whA, skuA, QUANTITY_MIN.toString()]]), { code: "QUANTITY_OVERFLOW" });
  assert.equal(balances(a, [[whA, skuA, "0"]])[0]?.quantityAfter, -10n, "Existing negative-stock allowance is preserved");
});

test("SYNTHETIC: missing/unknown/failed balance reads never become historical zero, published zero must be explicit", () => {
  const a = transition("APPROVE", sales("DRAFT"), sales("APPROVED", "10", 5), 1);
  for (const state of ["UNKNOWN", "NOT_READY", "MISSING", "NO_SUCH_SKU", "FAILED"] as const) {
    assert.throws(() => planInventoryEffectBalances(a.balanceDeltas, [{ warehouseId: whA, skuId: skuA, state, reason: "SYNTHETIC" }]));
  }
  assert.throws(() => planInventoryEffectBalances(a.balanceDeltas, []), { code: "INVENTORY_NOT_READY" });
  assert.equal(planInventoryEffectBalances(a.balanceDeltas, [{ warehouseId: whA, skuId: skuA, state: "PUBLISHED_ZERO",
    baselineBatchId: "70000000-0000-0000-0000-000000000022", baselineManifestSha256: sha }])[0]?.quantityAfter, -10n);
  assert.deepEqual(planInventoryEffectBalances([], []), []);
});

test("SYNTHETIC: line/endpoint identity rules stay ordinary, exact, and fail closed", () => {
  for (const type of ["SALE", "RETURN", "EXCHANGE"] as const) assert.throws(() => documentInventoryEffects(sales("APPROVED", "0", 4, type)), { code: "INVALID_SALES_QUANTITY" });
  assert.throws(() => documentInventoryEffects(sales("APPROVED", "-1")), { code: "INVALID_SALES_QUANTITY" });
  assert.throws(() => documentInventoryEffects(transfer("APPROVED", "-1")), { code: "INVALID_TRANSFER_LINE" });
  const t = transfer(); assert.throws(() => documentInventoryEffects({ ...t, header: { ...t.header, toWarehouseId: whA } }), { code: "SAME_WAREHOUSE" });
  const s = sales(); assert.throws(() => documentInventoryEffects({ ...s, lines: [s.lines[0]!, s.lines[0]!] }), { code: "INVALID_LINE" });
  assert.throws(() => documentInventoryEffects({ ...s, lines: s.lines.map(l => ({ ...l, salesId: id("sales", 999) })) }), { code: "INVALID_LINE" });
});

test("SYNTHETIC: transfer reversal rejects half sets, duplicated endpoints, wrong SKU, mixed operation or stale version", () => {
  const draft = transfer("DRAFT"), approved = next(draft, "APPROVED"), a = transition("APPROVE", draft, approved, 1), originals = ledger(a, 400);
  assert.equal(originals.length, 2);
  const first = originals[0]!, second = originals[1]!;
  const badSets = [[first], [first, { ...first, id: id("ledger", 999) }], [first, { ...second, skuId: skuB }],
    [first, { ...second, operationId: op(9) }], [first, { ...second, sourceDocumentVersion: version(4) }],
    [first, { ...second, quantityDelta: quantity("9") }], [first, { ...second, warehouseId: whC }]];
  for (const entries of badSets) assert.throws(() => transition("UNAPPROVE", approved, next(approved, "DRAFT"), 2, { kind: "RUNTIME_LEDGER", entries }), { code: "MISSING_POSTING_PROVENANCE" });
  assert.equal(transition("UNAPPROVE", approved, next(approved, "DRAFT"), 2, { kind: "RUNTIME_LEDGER", entries: originals }).ledgerIntents.length, 2);
});

test("SYNTHETIC: first anchor reversal requires the entire unchanged multi-line two-end exposure", () => {
  const one = transfer(), before = { ...one, lines: [...one.lines, { ...one.lines[0]!, id: id("transferLine", 450), lineNo: 2, skuId: skuB, quantity: quantity("4") }] };
  const good = planDocumentInventoryMigration(migrationInput(before)).anchor;
  assert.equal(good.baselineEffects.length, 4);
  const bad = [{ ...good, baselineEffects: good.baselineEffects.slice(0, 3) },
    { ...good, baselineEffects: good.baselineEffects.map((row, i) => i === 0 ? { ...row, warehouseId: whC } : row) },
    { ...good, snapshot: { ...before, lines: before.lines.map((l, i) => i === 0 ? { ...l, id: id("transferLine", 451) } : l) } }];
  for (const anchor of bad) assert.throws(() => transition("UNAPPROVE", before, next(before, "DRAFT"), 1, { kind: "BASELINE_ANCHOR", anchor, entries: [] }));
});

test("SYNTHETIC: returning3→unapprove→draft returning2→reapprove yields baseline net -1, never abs", () => {
  const before = sales("APPROVED", "-3", 4, "RETURN"), anchor = planDocumentInventoryMigration(migrationInput(before)).anchor;
  const u = transition("UNAPPROVE", before, next(before, "DRAFT"), 1, { kind: "BASELINE_ANCHOR", anchor, entries: [] });
  const edited = sales("DRAFT", "-2", 6, "RETURN"), a = transition("APPROVE", edited, next(edited, "APPROVED"), 2);
  assert.equal(balances(u, [[whA, skuA, "100"]])[0]?.quantityAfter, 97n);
  assert.equal(balances(a, [[whA, skuA, "97"]])[0]?.quantityAfter, 99n);
  assert.deepEqual(diffDocumentInventoryEffects(before, next(edited, "APPROVED")).map(r => r.quantityDelta), [-1n]);
});

test("SYNTHETIC: after unapprove, ordinary draft warehouse/SKU replacement reapproves at new keys only", () => {
  const before = sales(), draft = next(before, "DRAFT"), anchor = planDocumentInventoryMigration(migrationInput(before)).anchor;
  const u = transition("UNAPPROVE", before, draft, 1, { kind: "BASELINE_ANCHOR", anchor, entries: [] });
  assert.deepEqual(u.balanceDeltas.map(r => [r.warehouseId, r.skuId, r.quantityDelta]), [[whA, skuA, 10n]]);
  const base = sales("DRAFT", "12", 6), edited = { ...base, header: { ...base.header, warehouseId: whC }, lines: base.lines.map(l => ({ ...l, skuId: skuB })) };
  assert.deepEqual(transition("SAVE", draft, edited, 2).balanceDeltas, []);
  const a = transition("APPROVE", edited, next(edited, "APPROVED"), 3);
  assert.deepEqual(a.balanceDeltas.map(r => [r.warehouseId, r.skuId, r.quantityDelta]), [[whC, skuB, -12n]]);
  assert.deepEqual(diffDocumentInventoryEffects(before, next(edited, "APPROVED")).map(r => [r.warehouseId, r.skuId, r.quantityDelta]), [[whA, skuA, 10n], [whC, skuB, -12n]]);
});

test("SYNTHETIC: signed boundary accepts exact MAX and negative stock, but rejects malformed coercion and MIN negation", () => {
  assert.equal(documentInventoryEffects(sales("APPROVED", QUANTITY_MAX.toString()))[0]?.quantityDelta, -QUANTITY_MAX);
  assert.equal(documentInventoryEffects(sales("APPROVED", `-${QUANTITY_MAX}`, 4, "RETURN"))[0]?.quantityDelta, QUANTITY_MAX);
  assert.deepEqual(documentInventoryEffects(transfer("APPROVED", QUANTITY_MAX.toString())).map(r => r.quantityDelta), [-QUANTITY_MAX, QUANTITY_MAX]);
  const s = sales();
  for (const q of [10, "10", null, undefined]) assert.throws(() => documentInventoryEffects({ ...s, lines: s.lines.map(l => ({ ...l, quantity: q as never })) }), { code: "QUANTITY_OVERFLOW" });
  const d = [{ warehouseId: whA, skuId: skuA, quantityDelta: quantity("1") }];
  assert.equal(planInventoryEffectBalances(d, [{ warehouseId: whA, skuId: skuA, state: "KNOWN", quantity: quantity(QUANTITY_MIN.toString()) }])[0]?.quantityAfter, QUANTITY_MIN + 1n);
  assert.throws(() => planInventoryEffectBalances(d, [{ warehouseId: whA, skuId: skuA, state: "KNOWN", quantity: quantity(QUANTITY_MAX.toString()) }]), { code: "QUANTITY_OVERFLOW" });
});

test("SYNTHETIC: two runtime approval cycles preserve actual ledger identities and never reuse baseline anchor", () => {
  const initial = sales(), anchor = planDocumentInventoryMigration(migrationInput(initial)).anchor;
  let current: DocumentInventorySnapshot = next(initial, "DRAFT");
  const all: DocumentInventoryLedgerEvidence[] = [...ledger(transition("UNAPPROVE", initial, current, 1, { kind: "BASELINE_ANCHOR", anchor, entries: [] }), 500)];
  for (let cycle = 0; cycle < 2; cycle++) {
    const approved: DocumentInventorySnapshot = next(current, "APPROVED");
    const a = transition("APPROVE", current, approved, 2 + cycle * 2), original = ledger(a, 510 + cycle * 10);
    all.push(...original); current = next(approved, "DRAFT");
    const u = transition("UNAPPROVE", approved, current, 3 + cycle * 2, { kind: "RUNTIME_LEDGER", entries: all });
    assert.equal(u.ledgerIntents[0]?.reversesEntryId, original[0]?.id);
    assert.equal(u.ledgerIntents[0]?.baselineAnchorOperationId, null); all.push(...ledger(u, 511 + cycle * 10));
  }
  assert.equal(all.filter(row => row.baselineAnchorOperationId !== null).length, 1);
  assert.equal(all.reduce((sum, row) => sum + row.quantityDelta, 0n), 10n);
});

test("SYNTHETIC: actual operation IDs cannot masquerade as migration or original approval receipt", () => {
  const before = sales(), anchor = planDocumentInventoryMigration(migrationInput(before)).anchor;
  assert.throws(() => planDocumentInventoryTransition({ action: "UNAPPROVE", before, after: next(before, "DRAFT"), operationId: migrateOp,
    priorEvidence: { kind: "BASELINE_ANCHOR", anchor, entries: [] } }), { code: "MISSING_POSTING_PROVENANCE" });
  const draft = sales("DRAFT"), approved = next(draft, "APPROVED"), a = transition("APPROVE", draft, approved, 1);
  assert.throws(() => transition("UNAPPROVE", approved, next(approved, "DRAFT"), 1, { kind: "RUNTIME_LEDGER", entries: ledger(a, 600) }), { code: "MISSING_POSTING_PROVENANCE" });
});

test("SYNTHETIC REVIEW F1: all actions reject known posting and baseline anchor operation identity collisions", () => {
  const initial = sales(), anchor = planDocumentInventoryMigration(migrationInput(initial)).anchor, draft = next(initial, "DRAFT");
  const u = ledger(transition("UNAPPROVE", initial, draft, 1, { kind: "BASELINE_ANCHOR", anchor, entries: [] }), 700);
  const approved = next(draft, "APPROVED"), a = ledger(transition("APPROVE", draft, approved, 2), 710);
  for (const action of ["SAVE", "APPROVE", "VOID"] as const) {
    const after = next(draft, action === "APPROVE" ? "APPROVED" : action === "VOID" ? "VOID" : "DRAFT");
    for (const operationId of [migrateOp, op(1)]) assert.throws(() => planDocumentInventoryTransition({ action, before: draft, after, operationId,
      priorEvidence: { kind: "RUNTIME_LEDGER", entries: u } }), { code: "MISSING_POSTING_PROVENANCE" });
  }
  assert.throws(() => planDocumentInventoryTransition({ action: "UNAPPROVE", before: approved, after: next(approved, "DRAFT"), operationId: migrateOp,
    priorEvidence: { kind: "RUNTIME_LEDGER", entries: [...u, ...a] } }), { code: "MISSING_POSTING_PROVENANCE" });
});

test("SYNTHETIC REVIEW F2: zero-net touched keys are explicitly exposed and readiness checked without zero mutation", () => {
  const one = sales("DRAFT", "5", 4, "EXCHANGE"), draft = { ...one, lines: [...one.lines, { ...one.lines[0]!, id: id("salesLine", 800), lineNo: 2, quantity: quantity("-5") }] };
  const p = transition("APPROVE", draft, next(draft, "APPROVED"), 1);
  assert.deepEqual(p.balanceDeltas, []); assert.equal(p.ledgerIntents.length, 2);
  assert.deepEqual(p.touchedKeys, [{ warehouseId: whA, skuId: skuA }]);
  for (const state of ["UNKNOWN", "FAILED", "MISSING"] as const) {
    const knowledge = [{ warehouseId: whA, skuId: skuA, state }];
    assert.throws(() => planInventoryEffectBalances(p.ledgerIntents, knowledge));
    assert.throws(() => planInventoryEffectBalances(p.balanceDeltas, knowledge, p.touchedKeys));
  }
  assert.throws(() => planInventoryEffectBalances(p.balanceDeltas, [], p.touchedKeys), { code: "INVENTORY_NOT_READY" });
  assert.deepEqual(planInventoryEffectBalances(p.balanceDeltas, [{ warehouseId: whA, skuId: skuA, state: "KNOWN", quantity: quantity("100") }], p.touchedKeys), []);
});

test("SYNTHETIC REVIEW F3: every retired transfer event retains both endpoints, one version/date and complete reversal set", () => {
  const draft = transfer("DRAFT"), approved = next(draft, "APPROVED"), a = ledger(transition("APPROVE", draft, approved, 1), 810);
  const unapproved = next(approved, "DRAFT"), u = ledger(transition("UNAPPROVE", approved, unapproved, 2, { kind: "RUNTIME_LEDGER", entries: a }), 820);
  const current = next(unapproved, "APPROVED"), a2 = ledger(transition("APPROVE", unapproved, current, 3), 830);
  const invalid = [[a[0]!, u[0]!, ...a2], [...a, ...u.map((row, i) => i ? { ...row, sourceDocumentVersion: version(7) } : row), ...a2],
    [...a, ...u, ...a2.map(row => ({ ...row, operationId: op(1) }))],
    [...a, ...u.map((row, i) => i ? { ...row, businessDate: businessDate("2026-11-01") } : row), ...a2]];
  for (const entries of invalid) assert.throws(() => transition("UNAPPROVE", current, next(current, "DRAFT"), 4, { kind: "RUNTIME_LEDGER", entries }), { code: "MISSING_POSTING_PROVENANCE" });
});

test("SYNTHETIC REVIEW F4: public planners materialize accessor-owned input once before validation", () => {
  const input = migrationInput(), changed = sales("APPROVED", "999"); let reads = 0;
  const result = planDocumentInventoryMigration({ ...input, get snapshot() { return ++reads === 1 ? input.snapshot : changed; } });
  assert.equal(reads, 1); assert.doesNotThrow(() => planDocumentInventoryMigration({ ...result.anchor, source: input.source }));
  const draft = sales("DRAFT"), after = next(draft, "APPROVED"); let transitionReads = 0;
  const plan = planDocumentInventoryTransition({ action: "APPROVE", before: draft, operationId: op(1),
    get after() { return ++transitionReads === 1 ? after : sales("APPROVED", "999", 5); } });
  assert.equal(transitionReads, 1); assert.equal(plan.ledgerIntents[0]?.quantityDelta, -10n);
});

test('historical signed SALE baseline reversal and reapproval retain signed stock without relaxing new SALE',()=>{
 const approved=sales('APPROVED','-2'),input=migrationInput(approved);
 const anchor=planDocumentInventoryMigration(input).anchor;
 const draft=next(approved,'DRAFT');
 const unapprove=planDocumentInventoryTransition({action:'UNAPPROVE',operationId:op(31),before:approved,after:draft,stockBasis:'CUTOFF_HISTORY',priorEvidence:{kind:'BASELINE_ANCHOR',anchor,entries:[]}});
 assert.equal(unapprove.balanceDeltas[0]!.quantityDelta,-2n);assert.equal(balances(unapprove,[[whA,skuA,'100']])[0]!.quantityAfter,98n);
 const after=next(draft,'APPROVED');
 const reapprove=planDocumentInventoryTransition({action:'APPROVE',operationId:op(32),before:draft,after,stockBasis:'CUTOFF_HISTORY',priorEvidence:{kind:'RUNTIME_LEDGER',entries:ledger(unapprove,900)}});
 assert.equal(reapprove.balanceDeltas[0]!.quantityDelta,2n);
 assert.throws(()=>planDocumentInventoryTransition({action:'APPROVE',operationId:op(33),before:draft,after}),{code:'INVALID_SALES_QUANTITY'});
});

test('published ordinary audit anchor needs no offline source identity; first reversal is not replay', async()=>{
  const {planPublishedDocumentInventoryAnchor}=await import('../packages/domain/src/document-inventory-effects.ts');
  const {source,...ordinary}=migrationInput();
  const anchor=planPublishedDocumentInventoryAnchor(ordinary);
  assert.equal('source' in anchor,false);
  const before=ordinary.snapshot, after=next(before,'DRAFT');
  const reversal=transition('UNAPPROVE',before,after,90,{kind:'BASELINE_ANCHOR',anchor,entries:[]});
  assert.deepEqual(reversal.ledgerIntents.map(x=>x.quantityDelta),[10n]);
  assert.throws(()=>transition('UNAPPROVE',before,after,91,{kind:'BASELINE_ANCHOR',anchor,entries:ledger(reversal,900)}));
  assert.throws(()=>planPublishedDocumentInventoryAnchor({...ordinary,coverage:{state:'UNKNOWN',reason:'not established'}}));
});
test('published audit sales and transfer unapprove/reapprove retain exact inventory and unknown balances reject',async()=>{
 const {planPublishedDocumentInventoryAnchor}=await import('../packages/domain/src/document-inventory-effects.ts');
 for(const before of [sales(),transfer()]){
  const {source,...ordinary}=migrationInput(before),anchor=planPublishedDocumentInventoryAnchor(ordinary),draft=next(before,'DRAFT');
  const reversal=transition('UNAPPROVE',before,draft,92,{kind:'BASELINE_ANCHOR',anchor,entries:[]});
  const approved=next(draft,'APPROVED'),reapprove=transition('APPROVE',draft,approved,93,{kind:'RUNTIME_LEDGER',entries:ledger(reversal,920)});
  assert.deepEqual(reapprove.balanceDeltas.map(x=>x.quantityDelta),reversal.balanceDeltas.map(x=>-x.quantityDelta));
  assert.throws(()=>planInventoryEffectBalances(reversal.balanceDeltas,[]));
 }
});
