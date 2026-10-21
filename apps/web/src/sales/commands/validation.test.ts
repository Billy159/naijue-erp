import assert from 'node:assert/strict';
import test from 'node:test';
import { salesCommandUiActivation } from './contracts.ts';
import { draftFromSalesDetail, settlementBalanced, validateSalesCommand, validateSalesDraft, validateSalesReceipt, validateSalesResult } from './validation.ts';
import { detail, draft, receipt, result, save, stateCommand, uuid } from './fixtures.test-support.ts';

test('wire contracts exactly preserve native SAVE, command and receipt shape with deep isolation', () => {
  const original = structuredClone(save()), snapshot = validateSalesCommand(original);
  assert.deepEqual(snapshot, original); assert.notEqual(snapshot, original); assert.ok(Object.isFrozen(snapshot));
  assert.ok(snapshot.action === 'SAVE' && Object.isFrozen(snapshot.draft.lines[0]?.snapshot));
  if (original.action === 'SAVE') Object.assign(original.draft.lines[0]!.snapshot, { barcode: 'CHANGED' });
  assert.equal(snapshot.action === 'SAVE' && snapshot.draft.lines[0]?.snapshot.barcode, '001234567890123');
  for (const command of [save(null), save(2), stateCommand('APPROVE'), stateCommand('UNAPPROVE'), stateCommand('VOID')]) {
    assert.deepEqual(validateSalesResult(result(command), command), result(command));
    assert.deepEqual(validateSalesReceipt(receipt(command), command), receipt(command));
  }
  assert.deepEqual(salesCommandUiActivation, { available: false, reason: 'NATIVE_FORM_PROVIDERS_UNAVAILABLE' });
});
test('draft projection excludes server managed/name facts and never invents missing old pricing intent', () => {
  const value = detail(); assert.deepEqual(draftFromSalesDetail(value), draft());
  assert.equal('version' in draft().header, false); assert.equal('referenceNames' in draft(), false);
  assert.throws(() => draftFromSalesDetail({ ...value, document: { ...value.document, lines: value.document.lines.map(line => ({ ...line, pricingRule: null })) } }));
  assert.throws(() => draftFromSalesDetail({ ...value, document: { ...value.document, lines: value.document.lines.map(line => ({ ...line, zeroConfirmed: null })) } }));
});
test('runtime settlements require an explicit canonical intended method and reject old or unknown request shapes', () => {
  const value = draft(), original = value.settlements[0]!;
  assert.equal(original.paymentMethodId, uuid(25));
  const { paymentMethodId: _method, ...oldShape } = original;
  for (const settlement of [oldShape, { ...original, paymentMethodId: null }, { ...original, paymentMethodId: undefined },
    { ...original, paymentMethodId: '' }, { ...original, paymentMethodId: 25 }, { ...original, paymentMethodId: ` ${uuid(25)}` },
    { ...oldShape, originalPaymentMethodId: uuid(25) }, { ...original, currentPaymentMethodId: uuid(26) }]) {
    assert.throws(() => validateSalesDraft({ ...value, settlements: [settlement] }));
    assert.throws(() => validateSalesCommand({ ...save(), draft: { ...value, settlements: [settlement] } }));
  }
  const native = detail();
  const renamed = { ...native, settlementNames: native.settlementNames.map(row => ({ ...row, methodNameSnapshot: 'TEST 历史显示名', currentMethodName: 'TEST 当前改名' })) };
  assert.equal(draftFromSalesDetail(renamed).settlements[0]?.paymentMethodId, uuid(25));
  assert.throws(() => draftFromSalesDetail({ ...renamed, document: { ...renamed.document, settlements: renamed.document.settlements.map(row => ({ ...row, paymentMethodId: null })) } }));
});
test('strict native command parser rejects extensions, missing fields, actor, coerced CAS and alternate route fields', () => {
  const command = save();
  for (const invalid of [{ ...command, actor: { accountId: uuid(99) } }, { ...command, expectedVersion: '2' }, { ...command, requestKey: ' trimmed ' },
    { ...command, expectedVersion: 0 }, { ...command, action: 'CREATE' }, { ...command, salesId: uuid(1) }, { action: 'APPROVE', requestKey: 'TEST', salesId: uuid(1), expectedVersion: null }]) assert.throws(() => validateSalesCommand(invalid));
  const value = draft();
  for (const invalid of [{ ...value, originalSaleId: uuid(99) }, { ...value, header: { ...value.header, status: 'DRAFT' } },
    { ...value, header: { ...value.header, netDue: -1 } }, { ...value, lines: value.lines.map(line => ({ ...line, quantity: '1.5' })) },
    { ...value, lines: value.lines.map(line => ({ ...line, quantity: '-9223372036854775809' })) }, { ...value, lines: value.lines.map(line => ({ ...line, referencePrice: '-1' })) },
    { ...value, lines: [...value.lines, value.lines[0]] }, { ...value, settlements: [value.settlements[0], value.settlements[0]] }]) assert.throws(() => validateSalesDraft(invalid));
});
test('independent return and exchange are signed, exact and original-sale-free, while SALE is positive only', () => {
  const value = draft(); assert.equal(value.header.netDue, '-900719925474099301'); assert.equal(settlementBalanced(value), true);
  assert.equal(settlementBalanced({ ...value, settlements: [] }), false);
  assert.doesNotThrow(() => validateSalesDraft({ ...value, header: { ...value.header, businessType: 'EXCHANGE' } }));
  const positive = { ...value, header: { ...value.header, businessType: 'RETURN' as const, grossAmount: '900719925474099301', netDue: '900719925474099301' },
    lines: value.lines.map(line => ({ ...line, quantity: '1', lineAmount: '900719925474099301' })) };
  assert.doesNotThrow(() => validateSalesDraft(positive));
  assert.doesNotThrow(() => validateSalesDraft({ ...positive, header: { ...positive.header, businessType: 'SALE' } }));
  assert.throws(() => validateSalesDraft({ ...value, header: { ...value.header, businessType: 'SALE' } }));
  assert.throws(() => validateSalesDraft({ ...value, header: { ...value.header, orderDiscount: '1', netDue: '-900719925474099302' } }));
});
test('native gift, zero-confirmation, half-up discount and allocation arithmetic are not coerced', () => {
  const value = draft(); const zero = { ...value, header: { ...value.header, grossAmount: '0', netDue: '0' }, lines: value.lines.map(line => ({ ...line, dealPrice: '0', lineAmount: '0' })) };
  assert.throws(() => validateSalesDraft(zero));
  assert.doesNotThrow(() => validateSalesDraft({ ...zero, lines: zero.lines.map(line => ({ ...line, zeroConfirmed: true })) }));
  assert.doesNotThrow(() => validateSalesDraft({ ...zero, lines: zero.lines.map(line => ({ ...line, isGift: true })) }));
  const discount = { ...value, header: { ...value.header, grossAmount: '-1', netDue: '-1' }, lines: value.lines.map(line => ({ ...line, referencePrice: '1', pricingRule: 'DISCOUNT', discountTenths: 50, dealPrice: '1', lineAmount: '-1' })) };
  assert.doesNotThrow(() => validateSalesDraft(discount));
  assert.throws(() => validateSalesDraft({ ...discount, lines: discount.lines.map(line => ({ ...line, discountTenths: 101 })) }));
  assert.throws(() => validateSalesDraft({ ...value, lines: value.lines.map(line => ({ ...line, allocatedDiscount: '1' })) }));
});
test('result and receipt require exact key/action/target/CAS/status and posting identity agreement', () => {
  const command = stateCommand(); const response = result(command), completed = receipt(command);
  for (const invalid of [{ ...response, salesId: uuid(2) }, { ...response, version: 4 }, { ...response, status: 'DRAFT' }, { ...response, ledgerEntryIds: [] },
    { ...response, ledgerEntryIds: [uuid(101), uuid(101)] }, { ...response, extra: 'secret' }]) assert.throws(() => validateSalesResult(invalid, command));
  for (const invalid of [{ ...completed, requestKey: 'DIFFERENT' }, { ...completed, action: 'SAVE' }, { ...completed, completedAt: '2026-10-20' },
    { ...completed, result: { ...response, salesId: uuid(2) } }, { ...completed, actor: 'secret' }]) assert.throws(() => validateSalesReceipt(invalid, command));
});

test('native largest-remainder allocation preserves persisted row order and never merges equal SKUs', () => {
  const value = draft(), template = value.lines[0]!;
  const lines = [1, 2, 3].map((lineNo, index) => ({ ...template, id: uuid(200 + index), lineNo, quantity: '1', referencePrice: '1', dealPrice: '1', lineAmount: '1', allocatedDiscount: index < 2 ? '1' : '0' }));
  const sale = { ...value, header: { ...value.header, businessType: 'SALE', grossAmount: '3', orderDiscount: '2', netDue: '1' }, lines, settlements: [] };
  assert.equal(validateSalesDraft(sale).lines.length, 3);
  assert.throws(() => validateSalesDraft({ ...sale, lines: [...lines].reverse() }));
  assert.throws(() => validateSalesDraft({ ...sale, lines: lines.map((line, index) => ({ ...line, allocatedDiscount: index > 0 ? '1' : '0' })) }));
});
