import test from 'node:test';
import assert from 'node:assert/strict';
import { validateUnifiedPackage } from '../packages/application/src/unified-import-contract.ts';
import { repinSyntheticPackage } from './fixtures/unified-import/synthetic-package.ts';
import { splitFixture } from './fixtures/unified-import/mixed-split-synthetic.ts';

test('explicit synthetic SALE and RETURN facts can be received without changing stock baseline or provenance', () => {
  const p = splitFixture(), before = JSON.stringify(p);
  const result = validateUnifiedPackage(p, { allowSynthetic: true });
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  assert.equal(JSON.stringify(p), before);
  assert.deepEqual(p.records.sales_header![0]!.source_refs, p.records.sales_header![1]!.source_refs);
  assert.deepEqual(p.records.sales_header!.map(r => r.fields.net_due), ['16.00', '-4.00']);
  assert.deepEqual(p.records.inventory_baseline!.map(r => r.fields.quantity), ['100', '0']);
  assert.equal(p.records.sales_settlement!.length, 17);
});

for (const [name, mutate, code] of [
  ['missing original source locator', (p: ReturnType<typeof splitFixture>) => { p.records.sales_header![1]!.source_refs = []; }, 'SOURCE_REFS_REQUIRED'],
  ['refund incorrectly inferred as receipt', (p: ReturnType<typeof splitFixture>) => { p.records.sales_settlement!.at(-1)!.fields.direction = 'RECEIVE'; }, 'SETTLEMENT_MISMATCH'],
  ['return discount is not silently redistributed', (p: ReturnType<typeof splitFixture>) => { p.records.sales_header![1]!.fields.order_discount = '1.00'; }, 'INDEPENDENT_RETURN_DISCOUNT'],
  ['allocated discount mismatch', (p: ReturnType<typeof splitFixture>) => { p.records.sales_line![0]!.fields.allocated_discount = '3.00'; }, 'DISCOUNT_ALLOCATION_MISMATCH'],
] as const) test(name, () => {
  const p = splitFixture(); mutate(p);
  const result = validateUnifiedPackage(repinSyntheticPackage(p), { allowSynthetic: true });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(i => i.code === code), JSON.stringify(result.issues));
});

test('current reconciliation cannot represent one original header expanded to two retained headers', () => {
  const p = splitFixture();
  const report = p.reports['reconciliation.json'] as { tables: Record<string, { source_rows: number }> };
  report.tables.sales_header!.source_rows = 1;
  const result = validateUnifiedPackage(repinSyntheticPackage(p), { allowSynthetic: true });
  assert.ok(result.issues.some(i => i.code === 'INVALID_RECONCILIATION'));
});

test('current receiver does not prove original mixed-document aggregate from shared source references', () => {
  const p = splitFixture();
  // Keep each output document internally balanced but change its original-group total.
  // This accepted case documents a MISSING group proof, not desired final acceptance.
  p.records.sales_header![0]!.fields.order_discount = '3.00';
  p.records.sales_header![0]!.fields.net_due = '17.00';
  p.records.sales_line![0]!.fields.allocated_discount = '3.00';
  p.records.sales_settlement![0]!.fields.amount = '2.00';
  const result = validateUnifiedPackage(repinSyntheticPackage(p), { allowSynthetic: true });
  assert.equal(result.valid, true, JSON.stringify(result.issues));
});
