import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256, TABLE_SCHEMAS } from '../packages/application/src/unified-import-contract.ts';
import { repinSyntheticPackage } from './fixtures/unified-import/synthetic-package.ts';
import { splitFixture } from './fixtures/unified-import/mixed-split-synthetic.ts';
import { MIXED_SPLIT_EVIDENCE_VERSION, mixedSplitFactKeys, isMixedSplitReceiverSchemaSupported, validateMixedSplitEvidenceV1 } from '../tools/unified-import/mixed-split-evidence.mjs';
import type { MixedSplitTable } from '../tools/unified-import/mixed-split-evidence.mjs';

function fixture() {
  const p = splitFixture();
  for (const t of ['sales_line', 'sales_settlement']) for (const [i, row] of p.records[t]!.entries()) {
    row.source_refs = [{ ...row.source_refs[0]!, row: i + 2 }];
    p.registry.find(r => r.target_id === row.fields.id)!.source_refs = structuredClone(row.source_refs);
  }
  repinSyntheticPackage(p);
  const facts = (t: MixedSplitTable, fields: Record<string, unknown>) => Object.fromEntries(mixedSplitFactKeys[t].map((k: string) => [k, fields[k]]));
  const header = p.records.sales_header![0]!;
  const originalHeader = { source_key: 'SYNTHETIC-original-mixed', source_refs: structuredClone(header.source_refs),
    fields: { ...facts('sales_header', header.fields), number: 'SYNTHETIC-original-number', gross_amount: '16.00', order_discount: '4.00', net_due: '12.00' } as Record<string, unknown> };
  const mapped = (t: MixedSplitTable) => p.records[t]!.map((r, i) => ({ source_key: `SYNTHETIC-original-${t}-${i}`,
    source_refs: structuredClone(r.source_refs), original_line_no: i + 1, output_id: r.fields.id, fields: facts(t, r.fields) }));
  const e = { format_version: MIXED_SPLIT_EVIDENCE_VERSION, output_manifest_sha256: sha256(JSON.stringify(p.manifest)),
    original_counts: { sales_header: 1, sales_line: 2, sales_settlement: 17 },
    output_counts: { sales_header: 2, sales_line: 2, sales_settlement: 17 },
    groups: [{ group_key: 'SYNTHETIC-mixed-1', original_header: originalHeader,
      output_header_ids: p.records.sales_header!.map(r => r.fields.id), lines: mapped('sales_line'), settlements: mapped('sales_settlement') }] };
  return { p, e };
}
const run = ({ p, e }: ReturnType<typeof fixture>) => validateMixedSplitEvidenceV1(p, JSON.stringify(e), { allowSynthetic: true });
test('successor separates one original header from two outputs and binds exact immutable declaration bytes', () => {
  const f = fixture(), before = JSON.stringify(f), result = run(f);
  assert.equal(result.valid, true, JSON.stringify(result));
  assert.equal(result.evidence_sha256, sha256(JSON.stringify(f.e)));
  assert.equal(result.import_admission_ready, false);
  assert.equal(result.database_proof_verified, false);
  assert.equal(result.source_truth_verified, false);
  assert.equal(JSON.stringify(f), before);
  assert.equal(validateMixedSplitEvidenceV1(f.p, JSON.stringify(f.e)).valid, false, 'synthetic acceptance must be explicit');
});
for (const [name, mutate, code] of [
  ['wrong output binding', (f: ReturnType<typeof fixture>) => { f.e.output_manifest_sha256 = 'a'.repeat(64); }, 'OUTPUT_MANIFEST_BINDING'],
  ['source count pretends two originals', (f: ReturnType<typeof fixture>) => { f.e.original_counts.sales_header = 2; }, 'ORIGINAL_OUTPUT_COUNT_MISMATCH'],
  ['wrong output count', (f: ReturnType<typeof fixture>) => { f.e.output_counts.sales_line = 3; }, 'OUTPUT_COUNT_MISMATCH'],
  ['missing original number', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.original_header.fields.number = ''; }, 'ORIGINAL_NUMBER_REQUIRED'],
  ['missing original line', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.lines.pop(); }, 'GROUP_OUTPUT_ROWS_UNACCOUNTED'],
  ['missing original refund', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.settlements.pop(); }, 'GROUP_OUTPUT_ROWS_UNACCOUNTED'],
  ['duplicate group', (f: ReturnType<typeof fixture>) => { f.e.groups.push(structuredClone(f.e.groups[0]!)); }, 'GROUP_CONTRACT_OR_DUPLICATE'],
  ['duplicate line source key', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.lines[1]!.source_key = f.e.groups[0]!.lines[0]!.source_key; }, 'SOURCE_ID_REUSED'],
  ['duplicate source locator', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.lines[1]!.source_refs = structuredClone(f.e.groups[0]!.lines[0]!.source_refs); }, 'SOURCE_LOCATOR_REUSED'],
  ['duplicate output', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.lines[1]!.output_id = f.e.groups[0]!.lines[0]!.output_id; }, 'OUTPUT_ID_MISSING_OR_REUSED'],
  ['unaccounted original line numbering', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.lines[1]!.original_line_no = 1; }, 'ORIGINAL_LINE_NUMBER_REUSED'],
  ['original price changed', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.lines[0]!.fields.deal_price = '2.00'; }, 'ROW_FACT_CHANGED'],
  ['refund direction changed', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.settlements.at(-1)!.fields.direction = 'RECEIVE'; }, 'ROW_FACT_CHANGED'],
  ['payment account changed', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.settlements[0]!.fields.payment_account_id = 'foreign'; }, 'ROW_FACT_CHANGED'],
  ['unknown snapshot replaced by default', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.lines[0]!.fields.is_gift = false; }, 'ROW_FACT_CHANGED'],
  ['original total changed a penny', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.original_header.fields.net_due = '12.01'; }, 'ORIGINAL_GROUP_ECONOMIC_MISMATCH'],
  ['unresolved numeric original total', (f: ReturnType<typeof fixture>) => { (f.e.groups[0]!.original_header.fields as Record<string, unknown>).net_due = null; }, 'INVALID_EXACT_MONEY'],
  ['unknown original field', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.lines[0]!.fields.guessed_allocation = true; }, 'SOURCE_FACT_KEYS'],
  ['foreign evidence hash', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.lines[0]!.source_refs[0]!.file_sha256 = 'a'.repeat(64); }, 'INVALID_SOURCE_REFERENCE'],
  ['missing source evidence', (f: ReturnType<typeof fixture>) => { f.e.groups[0]!.lines[0]!.source_refs = []; }, 'SOURCE_REFERENCES_REQUIRED'],
] as const) test(name + ' rejects', () => {
  const f = fixture(); mutate(f); const result = run(f);
  assert.equal(result.valid, false); assert.equal(result.code, code, JSON.stringify(result));
});

test('balanced output mutation no longer passes original group conservation', () => {
  const f = fixture();
  f.p.records.sales_header![0]!.fields.order_discount = '3.00';
  f.p.records.sales_header![0]!.fields.net_due = '17.00';
  f.p.records.sales_line![0]!.fields.allocated_discount = '3.00';
  f.p.records.sales_settlement![0]!.fields.amount = '2.00';
  repinSyntheticPackage(f.p); f.e.output_manifest_sha256 = sha256(JSON.stringify(f.p.manifest));
  assert.equal(run(f).code, 'ROW_FACT_CHANGED');
  // Even rewriting the declared row facts to match cannot evade the original header total.
  f.e.groups[0]!.lines[0]!.fields.allocated_discount = '3.00';
  f.e.groups[0]!.settlements[0]!.fields.amount = '2.00';
  assert.equal(run(f).code, 'ORIGINAL_GROUP_ECONOMIC_MISMATCH');
});

test('evidence must be strict JSON with no duplicate fields; failures do not echo source contents', () => {
  const f = fixture();
  for (const raw of ['{"format_version":"one","format_version":"two"}', '{"private-source":', 'null']) {
    const result = validateMixedSplitEvidenceV1(f.p, raw, { allowSynthetic: true });
    assert.equal(result.valid, false); assert.equal(JSON.stringify(result).includes('private-source'), false);
  }
});

test('source locator must remain on the exact output row, not merely in the package', () => {
  const f = fixture(); f.e.groups[0]!.lines[0]!.source_refs[0]!.row = 999;
  assert.equal(run(f).code, 'OUTPUT_SOURCE_TRACE_MISSING');
});
test('original header identity/actor facts are not replaced by defaults', () => {
  const f = fixture(); f.e.groups[0]!.original_header.fields.created_by_staff_id = 'invented-person';
  assert.equal(run(f).code, 'HEADER_FACT_CHANGED');
});
test('unknown discount allocations require evidence instead of zero or proportional allocation', () => {
  const f = fixture(); f.p.records.sales_line![0]!.fields.allocated_discount = null;
  f.e.groups[0]!.lines[0]!.fields.allocated_discount = null;
  repinSyntheticPackage(f.p); f.e.output_manifest_sha256 = sha256(JSON.stringify(f.p.manifest));
  assert.equal(run(f).code, 'ALLOCATION_EVIDENCE_REQUIRED');
});
test('byte binding detects a changed output package even when economics still validate', () => {
  const f = fixture(); f.p.records.sales_header![0]!.fields.number = 'SYNTHETIC-new-number';
  repinSyntheticPackage(f.p);
  assert.equal(run(f).code, 'OUTPUT_MANIFEST_BINDING');
});
test('exact amounts beyond Number safe integer preserve penny differences', () => {
  const f = fixture(), g = f.e.groups[0]!;
  Object.assign(f.p.records.sales_header![0]!.fields, { gross_amount: '9007199254740993.00', net_due: '9007199254740989.00' });
  Object.assign(f.p.records.sales_line![0]!.fields, { quantity: '9007199254740993', line_amount: '9007199254740993.00' });
  f.p.records.sales_settlement![0]!.fields.amount = '9007199254740974.00';
  Object.assign(g.lines[0]!.fields, { quantity: '9007199254740993', line_amount: '9007199254740993.00' });
  g.settlements[0]!.fields.amount = '9007199254740974.00';
  Object.assign(g.original_header.fields, { gross_amount: '9007199254740989.00', net_due: '9007199254740985.00' });
  repinSyntheticPackage(f.p); f.e.output_manifest_sha256 = sha256(JSON.stringify(f.p.manifest));
  assert.equal(run(f).valid, true, JSON.stringify(run(f)));
  g.original_header.fields.net_due = '9007199254740985.01';
  assert.equal(run(f).code, 'ORIGINAL_GROUP_ECONOMIC_MISMATCH');
});
test('non-JSON objects and oversized evidence reject without echo or interpretation', () => {
  const f = fixture();
  for (const evidence of [f.e, ' '.repeat(16 * 1024 * 1024 + 1)]) {
    const result = validateMixedSplitEvidenceV1(f.p, evidence, { allowSynthetic: true });
    assert.equal(result.code, 'EVIDENCE_SIZE_OR_TYPE');
  }
});

for (const bad of ['\u0000', '   ', '\ud800', 'SYNTHETIC\nnumber']) {
  for (const field of ['original-number', 'group-key', 'source-key', 'sheet']) test(`${field} rejects unsafe text ${JSON.stringify(bad)}`, () => {
    const f = fixture(), g = f.e.groups[0]!;
    if (field === 'original-number') g.original_header.fields.number = bad;
    if (field === 'group-key') g.group_key = bad;
    if (field === 'source-key') g.original_header.source_key = bad;
    if (field === 'sheet') g.original_header.source_refs[0]!.sheet = bad;
    assert.equal(run(f).valid, false);
  });
}
test('V1 frozen fact keys reject a successor receiving schema without mutating the frozen original', () => {
  assert.equal(isMixedSplitReceiverSchemaSupported(TABLE_SCHEMAS), true);
  const changed = { ...TABLE_SCHEMAS, sales_line: { ...TABLE_SCHEMAS.sales_line, synthetic_future_field: { kind: 'text', nullable: true } } };
  assert.equal(isMixedSplitReceiverSchemaSupported(changed), false);
  assert.equal(Object.isFrozen(mixedSplitFactKeys), true);
  assert.equal(Object.values(mixedSplitFactKeys).every(Object.isFrozen), true);
  assert.equal(run(fixture()).valid, true);
});
