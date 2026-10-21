import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSalesForm, salesFormInput } from './form-model.ts';
import { draft, uuid } from './fixtures.test-support.ts';
import type { SalesDraftDto } from './contracts.ts';

function sale(): SalesDraftDto { const original = draft(); const line = original.lines[0]!; return { ...original,
  header: { ...original.header, businessType: 'SALE', grossAmount: '303', orderDiscount: '0', netDue: '303' },
  lines: [{ ...line, quantity: '3', referencePrice: '101', dealPrice: '101', lineAmount: '303', allocatedDiscount: '0' }], settlements: [] }; }
test('raw form roundtrip preserves exact huge money, native IDs and original barcode', () => {
  const base = draft(); const result = compileSalesForm(base, salesFormInput(base)); assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.draft, base);
});
test('unfinished/invalid prices, decimal quantities and zero quantity never reuse last valid facts', () => {
  const base = sale(), raw = salesFormInput(base);
  for (const price of ['', '1.', '-1', '1e3', '1.234', 'NaN']) assert.equal(compileSalesForm(base, { ...raw, lines: [{ ...raw.lines[0]!, dealPrice: price }] }).ok, false, price);
  for (const quantity of ['0', '-1', '1.5', '1e3', '9223372036854775808']) assert.equal(compileSalesForm(base, { ...raw, lines: [{ ...raw.lines[0]!, quantity }] }).ok, false, quantity);
});
test('explicit discount uses exact half-up per-unit price before multiplying integer quantity', () => {
  const base = sale(), raw = salesFormInput(base), result = compileSalesForm(base, { ...raw, lines: [{ ...raw.lines[0]!, pricingRule: 'DISCOUNT', discount: '5.0' }] });
  assert.equal(result.ok, true); if (result.ok) { assert.equal(result.draft.lines[0]?.dealPrice, '51'); assert.equal(result.draft.lines[0]?.lineAmount, '153'); assert.equal(result.draft.lines[0]?.discountTenths, 50); }
});
test('null reference price is not zero and cannot become discount authority', () => {
  const base = sale(); const without = { ...base, lines: base.lines.map(line => ({ ...line, referencePrice: null })) }; const raw = salesFormInput(without);
  assert.equal(compileSalesForm(without, { ...raw, lines: [{ ...raw.lines[0]!, pricingRule: 'DISCOUNT', discount: '5' }] }).ok, false);
  assert.equal(compileSalesForm(without, raw).ok, true);
});
test('ordinary zero needs explicit confirmation, gifts remain zero without inferred confirmation', () => {
  const base = sale(), raw = salesFormInput(base), zero = { ...raw, lines: [{ ...raw.lines[0]!, dealPrice: '0' }] };
  assert.equal(compileSalesForm(base, zero).ok, false);
  assert.equal(compileSalesForm(base, { ...zero, lines: [{ ...zero.lines[0]!, zeroConfirmed: true }] }).ok, true);
  const gift = compileSalesForm(base, { ...raw, lines: [{ ...raw.lines[0]!, isGift: true }] }); assert.equal(gift.ok, true);
  if (gift.ok) { assert.equal(gift.draft.lines[0]?.dealPrice, '0'); assert.equal(gift.draft.lines[0]?.zeroConfirmed, false); }
  assert.equal(compileSalesForm(base, { ...raw, lines: [{ ...raw.lines[0]!, isGift: true, dealPrice: '1.' }] }).ok, true);
  const nullReference = { ...base, lines: base.lines.map(line => ({ ...line, referencePrice: null })) };
  assert.equal(compileSalesForm(nullReference, { ...raw, lines: [{ ...raw.lines[0]!, isGift: true, pricingRule: 'DISCOUNT', discount: '5.0' }] }).ok, true);
});
test('stable discount allocation preserves original row positions, no SKU merge or reorder', () => {
  const original = sale(), line = original.lines[0]!; const base = { ...original, header: { ...original.header, grossAmount: '606', netDue: '606' }, lines: [line, { ...line, id: uuid(42), lineNo: 2 }] }; const raw = salesFormInput(base);
  const result = compileSalesForm(base, { ...raw, orderDiscount: '0.01' }); assert.equal(result.ok, true);
  if (result.ok) { assert.deepEqual(result.draft.lines.map(row => row.allocatedDiscount), ['1', '0']); assert.equal(result.draft.lines[1]?.skuId, line.skuId); }
  assert.equal(compileSalesForm(base, { ...raw, lines: [...raw.lines].reverse() }).ok, false);
});
test('independent return and exchange preserve signed rows and same native warehouse without original links', () => {
  for (const businessType of ['RETURN', 'EXCHANGE'] as const) {
    const original = sale(), first = original.lines[0]!; const base = { ...original, header: { ...original.header, businessType, grossAmount: '606', netDue: '606' }, lines: [first, { ...first, id: uuid(43), lineNo: 2 }] };
    const raw = salesFormInput(base), result = compileSalesForm(base, { ...raw, lines: [{ ...raw.lines[0]!, quantity: '-2' }, { ...raw.lines[1]!, quantity: '1' }] });
    assert.equal(result.ok, true); if (result.ok) { assert.equal(result.draft.header.netDue, '-101'); assert.equal(result.draft.header.warehouseId, base.header.warehouseId); assert.deepEqual(Object.keys(result.draft).sort(), ['header', 'lines', 'settlements']); }
    assert.equal(compileSalesForm(base, { ...raw, orderDiscount: '0.01' }).ok, false);
  }
});
test('draft settlement can be unbalanced, account identities retained, no balance or credit projection', () => {
  const base = draft(), raw = salesFormInput(base); const result = compileSalesForm(base, { ...raw, settlements: raw.settlements.map(row => ({ ...row, direction: 'RECEIVE', amount: '1.00' })) });
  assert.equal(result.ok, true); if (result.ok) { assert.equal(result.draft.settlements[0]?.paymentAccountId, base.settlements[0]?.paymentAccountId); assert.equal(result.draft.settlements[0]?.paymentMethodId, base.settlements[0]?.paymentMethodId); assert.equal(result.draft.settlements[0]?.amount, '100'); }
});
test('raw settlement edits preserve the intended account/method pair; unknown method cannot compile a runtime draft', () => {
  const base = draft(), raw = salesFormInput(base);
  const changed = compileSalesForm(base, { ...raw, settlements: raw.settlements.map(row => ({ ...row, direction: 'RECEIVE', amount: '2.01' })) });
  assert.equal(changed.ok, true);
  if (changed.ok) { assert.equal(changed.draft.settlements[0]?.paymentMethodId, uuid(25)); assert.equal(changed.draft.settlements[0]?.paymentAccountId, base.settlements[0]?.paymentAccountId); }
  const unknown = { ...base, settlements: base.settlements.map(row => ({ ...row, paymentMethodId: null })) } as unknown as SalesDraftDto;
  assert.throws(() => salesFormInput(unknown)); assert.equal(compileSalesForm(unknown, raw).ok, false);
});
