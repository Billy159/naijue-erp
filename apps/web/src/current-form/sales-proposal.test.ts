import test from 'node:test';
import assert from 'node:assert/strict';
import { entityId } from '../../../../packages/domain/src/values.ts';
import type { CurrentFormPage, CurrentFormProduct, CurrentFormSku, CurrentSalesReferenceItem } from '../../../../packages/application/src/current-form-ports.ts';
import { ReadContext } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { SalesProposalSession, type SalesProposalReader } from './sales-proposal.ts';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const hallId = entityId('hall', uuid(1));
const ref = (n: number, more = {}): CurrentSalesReferenceItem => ({ id: uuid(n), name: `TEST reference ${n}`, code: null, hallId: null, hallName: null, paymentMethodId: null, paymentMethodName: null, ...more });
const hall = ref(1, { hallId, hallName: 'TEST hall' }), otherHall = ref(2, { hallId: entityId('hall', uuid(2)), hallName: 'TEST hall 2' });
const product: CurrentFormProduct = { id: entityId('product', uuid(3)), code: 'TEST', name: 'TEST product', retailPrice: '10.05', minimumPriceAvailability: 'UNAVAILABLE' };
const sku: CurrentFormSku = { id: entityId('sku', uuid(4)), skuCode: 'TEST-SKU', productId: product.id, productCode: product.code, productName: product.name, colorId: entityId('color', uuid(5)), colorName: 'TEST red', fitId: entityId('fit', uuid(6)), fitName: 'TEST fit', sizeId: entityId('size', uuid(7)), sizeName: '165/S', sizeGroupId: entityId('sizeGroup', uuid(8)), barcodeAvailability: 'UNAVAILABLE' };
const page = <T>(items: readonly T[]): CurrentFormPage<T> => ({ page: 1, pageSize: 20, exactTotal: BigInt(items.length), items });
function setup(overrides: Partial<SalesProposalReader> = {}, retailPrice: string | null = product.retailPrice) {
  const context = new ReadContext({ accountId: uuid(99), sessionRevision: 'test', permissionRevision: 'test' }); const scope = context.createScope('sales');
  const queries: unknown[] = [];
  const reader: SalesProposalReader = {
    async readSalesReferences(query) {
      queries.push(query); if (query.kind === 'hall') return page([hall, otherHall]);
      assert.equal(query.hallId, hallId);
      if (query.kind === 'warehouse') return page([ref(10, { hallId, hallName: 'TEST hall' })]);
      if (query.kind === 'paymentAccount') { assert.equal(query.paymentMethodId, uuid(12)); return { ...page([ref(13, { paymentMethodId: entityId('paymentMethod', uuid(12)), paymentMethodName: 'TEST method' })]), recommendationAvailability: 'UNAVAILABLE' }; }
      if (query.kind === 'paymentMethod') return page([ref(12)]);
      return page([ref(11)]);
    },
    async readProducts(query) { queries.push(query); assert.deepEqual(query.context, { kind: 'SALES', hallId }); return page([{ ...product, retailPrice }]); },
    async readProductSkus(query) { queries.push(query); assert.equal(query.productId, product.id); return page([sku]); }, ...overrides,
  };
  return { session: new SalesProposalSession(scope, reader), context, scope, queries };
}
async function fill(session: SalesProposalSession) {
  session.setHeader({ businessDate: '2026-10-21' }); await session.openPicker('hall'); await session.select(hall.id);
  await session.openPicker('customer'); await session.select(uuid(11)); await session.openPicker('warehouse'); await session.select(uuid(10));
  await session.openPicker('product'); await session.select(product.id); await session.select(sku.id); session.closePicker();
}
test('SALE proposal only reads explicit current picks; prices are never defaulted from retail and unknown facts retained', async () => {
  const { session, queries } = setup(); assert.equal(queries.length, 0); await session.openPicker('customer'); assert.equal(queries.length, 0);
  await fill(session); assert.equal(session.getSnapshot().draft.lines[0]!.dealPrice, ''); assert.equal(session.validate(), null);
  session.updateLine(sku.id, { dealPrice: '2.35', quantity: '2' }); const draft = session.validate()!;
  assert.equal(draft.businessType, 'SALE'); assert.equal(draft.lines[0]!.sku.barcodeAvailability, 'UNAVAILABLE'); assert.equal(draft.lines[0]!.product.minimumPriceAvailability, 'UNAVAILABLE');
  assert.equal(session.getSnapshot().totals?.netDueMinor, '470'); assert.equal('number' in draft, false); assert.equal('id' in draft, false); assert.ok(Object.isFrozen(draft));
});
test('hall changes never silently retain stale dependent references/lines; confirmed reset is required', async () => {
  const { session } = setup(); await fill(session); await session.openPicker('hall'); assert.equal(await session.select(otherHall.id), false);
  assert.equal(session.getSnapshot().draft.hall?.id, hall.id); assert.equal(session.getSnapshot().draft.lines.length, 1);
  assert.equal(session.reset(), false); assert.equal(session.reset(true), true); await session.openPicker('hall'); assert.equal(await session.select(otherHall.id), true);
  assert.equal(session.getSnapshot().draft.customer, null); assert.equal(session.getSnapshot().draft.warehouse, null); assert.equal(session.getSnapshot().draft.lines.length, 0);
});
test('domain discount uses exact half-up pennies, order discounts bounded by gross, totals invalidate on every edit', async () => {
  const { session } = setup(); await fill(session); session.updateLine(sku.id, { pricingRule: 'DISCOUNT', discount: '5', quantity: '3' });
  assert.ok(session.validate()); assert.equal(session.getSnapshot().totals?.grossMinor, '1509');
  session.setHeader({ orderDiscount: '0.09' }); assert.equal(session.getSnapshot().totals, null); assert.ok(session.validate()); assert.equal(session.getSnapshot().totals?.netDueMinor, '1500');
  session.setHeader({ orderDiscount: '15.10' }); assert.equal(session.validate(), null);
  session.setHeader({ orderDiscount: '0' }); for (const discount of ['10.1', '-1', '5.55', '']) { session.updateLine(sku.id, { discount }); assert.equal(session.validate(), null); }
});
test('unknown reference price cannot become zero or a discount basis; ordinary zero needs confirmation, gifts explicit', async () => {
  const { session } = setup({}, null); await fill(session); session.updateLine(sku.id, { pricingRule: 'DISCOUNT', discount: '5' }); assert.equal(session.validate(), null);
  session.updateLine(sku.id, { pricingRule: 'UNIT_PRICE', dealPrice: '0' }); assert.equal(session.validate(), null);
  session.updateLine(sku.id, { zeroConfirmed: true }); assert.ok(session.validate());
  session.updateLine(sku.id, { zeroConfirmed: false, isGift: true, dealPrice: '' }); assert.ok(session.validate()); assert.equal(session.getSnapshot().totals?.netDueMinor, '0');
  session.updateLine(sku.id, { isGift: false }); assert.equal(session.validate(), null);
});
test('method→account lookup carries selected native method, settlement raw validation and signed balance exact', async () => {
  const { session, queries } = setup(); await fill(session); session.updateLine(sku.id, { dealPrice: '10' });
  await session.openPicker('paymentMethod'); await session.select(uuid(12)); assert.equal((queries.at(-1) as { paymentMethodId: string }).paymentMethodId, uuid(12));
  await session.select(uuid(13)); const key = session.getSnapshot().draft.settlements[0]!.key; assert.equal(session.validate(), null);
  session.updateSettlement(key, { amount: '10.00' }); assert.ok(session.validate()); assert.equal(session.getSnapshot().totals?.balanced, true);
  session.updateSettlement(key, { direction: 'REFUND' }); assert.ok(session.validate()); assert.equal(session.getSnapshot().totals?.settledMinor, '-1000'); assert.equal(session.getSnapshot().totals?.balanced, false);
  session.updateSettlement(key, { amount: '1.001' }); assert.equal(session.validate(), null); session.removeSettlement(key); assert.equal(session.getSnapshot().draft.settlements.length, 0);
});
test('negative/fractional/overflow quantities stay raw and invalid; foreign IDs rejected', async () => {
  const { session } = setup(); await fill(session); await session.openPicker('product'); assert.equal(await session.select(uuid(500)), false);
  session.closePicker(); session.updateLine(sku.id, { dealPrice: '10' });
  for (const quantity of ['0', '-1', '1.5', '9223372036854775808']) { session.updateLine(sku.id, { quantity }); assert.equal(session.getSnapshot().draft.lines[0]!.quantity, quantity); assert.equal(session.validate(), null); }
  session.removeLine(sku.id); assert.equal(session.getSnapshot().draft.lines.length, 0);
});
test('new searches, reset and identity invalidate old readers even if abort is ignored', async () => {
  const pending: { signal: AbortSignal; resolve: (value: CurrentFormPage<CurrentSalesReferenceItem>) => void }[] = [];
  const { session, context } = setup({ readSalesReferences: (_query, signal) => new Promise(resolve => pending.push({ signal, resolve })) });
  const first = session.openPicker('hall'), second = session.search('latest'); assert.equal(pending[0]!.signal.aborted, true);
  pending[1]!.resolve(page([hall])); await second; pending[0]!.resolve(page([otherHall])); await first; assert.equal(session.getSnapshot().picker?.result?.items[0]!.id, hall.id);
  const third = session.search('reset'); session.reset(true); pending[2]!.resolve(page([hall])); await third; assert.equal(session.getSnapshot().picker, null);
  const fourth = session.openPicker('hall'); context.clear(); pending[3]!.resolve(page([hall])); await fourth; assert.equal(session.getSnapshot().disposed, true); assert.equal(session.getSnapshot().picker, null);
});
test('failed lookup does not retry or discard raw input; explicit retry works and auth denial clears it', async () => {
  let calls = 0; const { session } = setup({ async readSalesReferences() { calls++; if (calls === 1) throw Error('secret'); if (calls === 3) throw new HttpQueryError('unauthenticated', 'UNAUTHENTICATED'); return page([hall]); } });
  session.setHeader({ note: 'retained' }); await session.openPicker('hall'); assert.equal(calls, 1); assert.equal(session.getSnapshot().draft.note, 'retained'); assert.equal(session.getSnapshot().picker?.phase, 'error');
  await session.retry(); assert.equal(calls, 2); await session.search('deny'); assert.equal(session.getSnapshot().disposed, true); assert.equal(session.getSnapshot().draft.note, '');
});
test('independent RETURN/EXCHANGE retain signed rows, exact net and zero-only order discount', async () => {
 const second = { ...sku, id: entityId('sku', uuid(44)), skuCode: 'TEST-SECOND' };
 const { session } = setup({ async readProductSkus() { return page([sku, second]); } }); await fill(session);
 session.updateLine(sku.id, { dealPrice:'10.00', quantity:'-2' }); session.setBusinessType('RETURN');
 assert.ok(session.validate()); assert.equal(session.getSnapshot().totals?.netDueMinor,'-2000');
 session.setHeader({orderDiscount:'0.01'}); assert.equal(session.validate(),null);
 session.setBusinessType('EXCHANGE'); await session.openPicker('product');await session.select(product.id);await session.select(second.id);session.closePicker();session.updateLine(second.id,{dealPrice:'5.00',quantity:'3'});
 assert.ok(session.validate()); assert.equal(session.getSnapshot().totals?.netDueMinor,'-500');
 assert.deepEqual(session.getSnapshot().draft.lines.map(row=>row.quantity),['-2','3']);
 session.setBusinessType('SALE');assert.equal(session.validate(),null);assert.equal(session.getSnapshot().draft.lines[0]!.quantity,'-2');
 session.setBusinessType('RETURN');session.updateLine(sku.id,{quantity:'0'});assert.equal(session.validate(),null);
 session.updateLine(sku.id,{quantity:'2'});assert.ok(session.validate()); // RETURN is not negative-only.
});
test('same SKU rows have independent keys, signs and prices; ambiguous SKU edits never touch either row', async () => {
 const {session}=setup();await fill(session);session.setBusinessType('EXCHANGE');
 await session.openPicker('product');await session.select(product.id);assert.equal(await session.select(sku.id),true);session.closePicker();
 const [first,second]=session.getSnapshot().draft.lines;assert.notEqual(first!.key,second!.key);
 assert.equal(session.updateLine(sku.id,{quantity:'99'}),false);assert.equal(session.removeLine(sku.id),false);
 session.updateLine(first!.key,{quantity:'-2',dealPrice:'10.00'});session.updateLine(second!.key,{quantity:'3',dealPrice:'8.00'});
 assert.ok(session.validate());assert.equal(session.getSnapshot().totals?.netDueMinor,'400');
 session.removeLine(first!.key);assert.equal(session.getSnapshot().draft.lines.length,1);assert.equal(session.getSnapshot().draft.lines[0]!.key,second!.key);assert.equal(session.getSnapshot().draft.lines[0]!.dealPrice,'8.00');
 assert.ok(session.validate());assert.equal(session.getSnapshot().totals?.netDueMinor,'2400');
});
