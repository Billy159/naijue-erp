import test from 'node:test';
import assert from 'node:assert/strict';
import { entityId } from '../../../../packages/domain/src/values.ts';
import type { NativeSalesCreateProposal } from '../../../../packages/application/src/native-sales-preparation.ts';
import type { CurrentFormProduct, CurrentFormSku, CurrentSalesReferenceItem } from '../../../../packages/application/src/current-form-ports.ts';
import { ReadContext } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { SalesEditorSession } from '../sales/commands/editor-session.ts';
import { SalesCommandError, type SalesCommandDto, type SalesDraftDto } from '../sales/commands/contracts.ts';
import { draft as fixtureDraft, detail, result, receipt, uuid, deferred } from '../sales/commands/fixtures.test-support.ts';
import { SalesProposalSession } from './sales-proposal.ts';
import { SalesNewDocumentSession, createSalesPreparationHttpClient, salesPreparationIntent, type SalesCreatePreparation } from './sales-create.ts';
const original = fixtureDraft();
const native: SalesDraftDto = { header: { ...original.header, businessType: 'SALE', grossAmount: '1000', netDue: '1000', orderDiscount: '0' },
  lines: [{ ...original.lines[0]!, quantity: '1', referencePrice: '1005', dealPrice: '1000', lineAmount: '1000', allocatedDiscount: '0' }],
  settlements: [{ ...original.settlements[0]!, direction: 'RECEIVE', amount: '1000' }] };
const product: CurrentFormProduct = { id: entityId('product', uuid(50)), code: 'TEST', name: 'TEST product', retailPrice: '10.05', minimumPriceAvailability: 'UNAVAILABLE' };
const sku: CurrentFormSku = { id: entityId('sku', native.lines[0]!.skuId), skuCode: 'TEST-SKU', productId: product.id, productCode: product.code, productName: product.name, colorId: entityId('color', uuid(5)), colorName: 'TEST red', fitId: entityId('fit', uuid(6)), fitName: 'TEST fit', sizeId: entityId('size', uuid(7)), sizeName: '165/S', sizeGroupId: entityId('sizeGroup', uuid(8)), barcodeAvailability: 'UNAVAILABLE' };
const ref = (id: string, more = {}): CurrentSalesReferenceItem => ({ id, name: 'TEST reference', code: null, hallId: null, hallName: null, paymentMethodId: null, paymentMethodName: null, ...more });
const page = <T>(items: readonly T[]) => ({ page: 1, pageSize: 20 as const, exactTotal: BigInt(items.length), items });
async function setup(preparation?: SalesCreatePreparation, uncertain = false, extraSku?: CurrentFormSku) {
  const principal = { accountId: entityId('account', uuid(900)), staffId: entityId('staff', uuid(950)), loginName: 'TEST', role: 'ADMIN', hallId: null, authVersion: 1 };
  const context = new ReadContext({ accountId: principal.accountId, sessionRevision: '1', permissionRevision: '1' }), scope = context.createScope('new-sale');
  const commands: SalesCommandDto[] = [], intents: NativeSalesCreateProposal[] = []; let access = 0;
  const onAccessFailure = () => { access++; context.clear(); };
  const proposal = new SalesProposalSession(scope, {
    async readSalesReferences(query) {
      const h = native.header, s = native.settlements[0]!;
      if (query.kind === 'hall') return page([ref(h.hallId, { hallId: h.hallId, hallName: 'TEST hall' })]);
      if (query.kind === 'customer') return page([ref(h.customerId, { code: 'TEST-C' })]);
      if (query.kind === 'warehouse') return page([ref(h.warehouseId, { hallId: h.hallId, hallName: 'TEST hall' })]);
      if (query.kind === 'paymentMethod') return page([ref(s.paymentMethodId)]);
      if (query.kind === 'paymentAccount') return page([ref(s.paymentAccountId, { paymentMethodId: s.paymentMethodId, paymentMethodName: 'TEST method' })]);
      return page([]);
    }, async readProducts() { return page([product]); }, async readProductSkus() { return page(extraSku ? [sku, extraSku] : [sku]); },
  }, onAccessFailure);
  const editor = new SalesEditorSession({ scope, principal, reader: { async readDetail() { return detail(); } }, newRequestKey: () => 'TEST.new-sale', onAccessFailure, client: {
    async execute(command) { commands.push(command); if (uncertain) throw new SalesCommandError('network', 'NETWORK', 'uncertain'); return result(command); }, async receipt(command) { return receipt(command); },
  } });
  const session = new SalesNewDocumentSession({ scope, proposal, editor, preparation: preparation ?? { async prepareCreate(intent) { intents.push(intent); return native; } }, onAccessFailure });
  proposal.setHeader({ businessDate: native.header.businessDate, note: native.header.note! });
  for (const [kind, id] of [['hall', native.header.hallId], ['customer', native.header.customerId], ['warehouse', native.header.warehouseId]] as const) { await proposal.openPicker(kind); await proposal.select(id); }
  await proposal.openPicker('product'); await proposal.select(product.id); await proposal.select(sku.id); proposal.closePicker(); proposal.updateLine(sku.id, { dealPrice: '10.00' });
  await proposal.openPicker('paymentMethod'); await proposal.select(native.settlements[0]!.paymentMethodId); await proposal.select(native.settlements[0]!.paymentAccountId);
  proposal.updateSettlement(proposal.getSnapshot().draft.settlements[0]!.key, { amount: '10' });
  return { session, proposal, editor, context, scope, commands, intents, get access() { return access; } };
}
test('SALE proposal→native preparation→existing editor SAVE/null CAS; no snapshots/minimums or local IDs sent', async () => {
  const h = await setup(); assert.equal(h.commands.length, 0); assert.equal(await h.session.save(), true);
  const intent = h.intents[0]!; assert.deepEqual(intent.lines, [{ skuId: sku.id, quantity: '1', dealPrice: '10.00', pricingRule: 'UNIT_PRICE', discountTenths: null, isGift: false, zeroConfirmed: false }]);
  assert.equal('number' in intent, false); assert.equal('key' in intent.settlements[0]!, false); assert.equal(h.commands.length, 1);
  const command = h.commands[0]!; if (command.action !== 'SAVE') throw Error(); assert.equal(command.expectedVersion, null); assert.equal(command.draft.lines[0]!.snapshot.barcode, native.lines[0]!.snapshot.barcode);
  assert.equal(h.editor.getSnapshot().command.write.phase, 'committed'); assert.equal(await h.session.save(), false);
});
test('canonical yuan intent does not infer absent price and discounts serialize one unambiguous rule', async () => {
  const h = await setup(); h.proposal.updateLine(sku.id, { dealPrice: '' }); assert.equal(await h.session.save(), false); assert.equal(h.intents.length, 0);
  h.proposal.updateLine(sku.id, { pricingRule: 'DISCOUNT', discount: '5.5' }); const intent = salesPreparationIntent(h.proposal.validate()!);
  assert.equal(intent.lines[0]!.dealPrice, null); assert.equal(intent.lines[0]!.discountTenths, 55);
  h.proposal.updateLine(sku.id, { pricingRule: 'UNIT_PRICE', isGift: true, dealPrice: '' }); assert.equal(salesPreparationIntent(h.proposal.validate()!).lines[0]!.dealPrice, '0.00');
});
test('duplicate clicks/edit/reset/cancel/identity reject even abort-ignoring preparation responses', async () => {
  for (const mode of ['edit', 'type', 'reset', 'cancel', 'identity'] as const) {
    const pending = deferred<SalesDraftDto>(); let signal!: AbortSignal; const h = await setup({ async prepareCreate(_intent, current) { signal = current; return pending.promise; } });
    const saving = h.session.save(); assert.equal(await h.session.save(), false);
    if (mode === 'edit') h.proposal.setHeader({ note: 'edited raw input' }); else if (mode === 'type') h.proposal.setBusinessType('RETURN'); else if (mode === 'reset') h.proposal.reset(true); else if (mode === 'cancel') h.session.cancelPreparation(); else h.context.clear();
    assert.equal(signal.aborted, true); pending.resolve(native); assert.equal(await saving, false); assert.equal(h.commands.length, 0); assert.equal(h.editor.getSnapshot().command.editor, null);
  }
});
test('missing price proof/invalid native snapshot rejected, raw proposal retained and explicit retry possible', async () => {
  let ready = false; const h = await setup({ async prepareCreate() { if (!ready) throw new HttpQueryError('conflict', 'NATIVE_CATALOGUE_FACTS_UNAVAILABLE'); return native; } });
  assert.equal(await h.session.save(), false); assert.equal(h.commands.length, 0); assert.match(h.session.getSnapshot().notice!, /九价完整性/); assert.equal(h.proposal.getSnapshot().draft.lines.length, 1);
  ready = true; assert.equal(await h.session.save(), true); assert.equal(h.commands.length, 1);
});
test('discount reference changes cannot silently change the price accepted on Save', async () => {
  const changed: SalesDraftDto = { ...native, header: { ...native.header, grossAmount: '1000', netDue: '1000' }, lines: [{ ...native.lines[0]!, pricingRule: 'DISCOUNT', discountTenths: 50, referencePrice: '2000' }] };
  const h = await setup({ async prepareCreate() { return changed; } }); h.proposal.updateLine(sku.id, { pricingRule: 'DISCOUNT', discount: '5' });
  assert.equal(await h.session.save(), false); assert.equal(h.commands.length, 0); assert.equal(h.editor.getSnapshot().command.editor, null);
});
test('uncertain SAVE retained by native workspace; no new prep or operation; same original receipt recovers', async () => {
  const h = await setup(undefined, true); assert.equal(await h.session.save(), false); assert.equal(h.editor.getSnapshot().command.write.phase, 'uncertain');
  assert.equal(await h.session.save(), false); h.session.cancelPreparation(); assert.equal(h.editor.canLeave(), false); assert.equal(h.intents.length, 1);
  assert.equal(await h.editor.commands.checkReceipt(), true); assert.equal(h.editor.getSnapshot().command.write.phase, 'committed');
});
test('current403 invokes application access-failure hook; cross-identity composition rejected', async () => {
  const h = await setup({ async prepareCreate() { throw new HttpQueryError('forbidden', 'FORBIDDEN'); } }); assert.equal(await h.session.save(), false); assert.equal(h.access, 1); assert.equal(h.editor.getSnapshot().command.disposed, true);
  const other = await setup(); const foreign = new ReadContext({ accountId: 'other', sessionRevision: '1', permissionRevision: '1' }).createScope('foreign');
  assert.throws(() => new SalesNewDocumentSession({ scope: foreign, proposal: other.proposal, editor: other.editor, preparation: { async prepareCreate() { return native; } } }));
});
test('preparation HTTP inert exact native endpoint and strict correlated result; forged facts never fetch', async () => {
  const h = await setup(), intent = salesPreparationIntent(h.proposal.validate()!); let calls = 0;
  const client = createSalesPreparationHttpClient({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => { calls++; assert.equal(url, 'https://synthetic.test/api/sales/prepare-create'); assert.equal(init.credentials, 'same-origin'); assert.deepEqual(JSON.parse(init.body as string), intent); return new Response(JSON.stringify(native), { headers: { 'content-type': 'application/json' } }); } });
  assert.equal(calls, 0); assert.equal((await client.prepareCreate(intent, new AbortController().signal)).header.id, native.header.id);
  assert.throws(() => client.prepareCreate({ ...intent, referencePrice: '0' } as never, new AbortController().signal)); assert.equal(calls, 1);
  const wrong = createSalesPreparationHttpClient({ origin: 'https://synthetic.test', basePath: '', fetch: async () => new Response(JSON.stringify({ ...native, header: { ...native.header, customerId: uuid(999) } }), { headers: { 'content-type': 'application/json' } }) });
  await assert.rejects(() => wrong.prepareCreate(intent, new AbortController().signal), { kind: 'malformed-response' });
});
test('shared SALE UTF8 budgets accept 200 rows/escaped note and retain exact native SAVE payload; oversize never dispatches', async () => {
  const { SALES_PREPARE_MAX_REQUEST_BYTES, SALES_COMMAND_MAX_REQUEST_BYTES, SALES_PREPARED_RESPONSE_MAX_BYTES } = await import('../../../../packages/application/src/sales-payload-budget.ts');
  const { createSalesCommandHttpClient } = await import('../sales/commands/http-client.ts');
  const large: SalesDraftDto = { header: { ...native.header, note: '\u0001'.repeat(10000), grossAmount: '200000', netDue: '200000' }, lines: Array.from({ length: 200 }, (_, index) => ({ ...native.lines[0]!, id: uuid(1000 + index), skuId: uuid(2000 + index), lineNo: index + 1, snapshot: { ...native.lines[0]!.snapshot, productName: '合成商品'.repeat(30) } })), settlements: [] };
  const intent: NativeSalesCreateProposal = { businessType: 'SALE', businessDate: large.header.businessDate, note: large.header.note, hallId: large.header.hallId, customerId: large.header.customerId, salespersonId: large.header.salespersonId, warehouseId: large.header.warehouseId, orderDiscount: '0.00', lines: large.lines.map(row => ({ skuId: row.skuId, quantity: '1', dealPrice: '10.00', pricingRule: 'UNIT_PRICE', discountTenths: null, isGift: false, zeroConfirmed: false })), settlements: [] };
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  assert.ok(bytes(intent) > 65536 && bytes(intent) < SALES_PREPARE_MAX_REQUEST_BYTES); assert.ok(bytes(large) < SALES_PREPARED_RESPONSE_MAX_BYTES);
  const client = createSalesPreparationHttpClient({ origin: 'https://synthetic.test', basePath: '', fetch: async () => new Response(JSON.stringify(large), { headers: { 'content-type': 'application/json' } }) });
  const prepared = await client.prepareCreate(intent, new AbortController().signal); const command: SalesCommandDto = { action: 'SAVE', requestKey: 'TEST.large', expectedVersion: null, draft: prepared };
  assert.ok(bytes(command) > 65536 && bytes(command) < SALES_COMMAND_MAX_REQUEST_BYTES); let writes = 0;
  const writer = createSalesCommandHttpClient({ origin: 'https://synthetic.test', basePath: '', fetch: async (_url, init) => { writes++; assert.deepEqual(JSON.parse(init.body as string), command); return new Response(JSON.stringify(result(command)), { headers: { 'content-type': 'application/json' } }); } });
  assert.equal((await writer.execute(command, new AbortController().signal)).status, 'DRAFT'); assert.equal(writes, 1);
  await assert.rejects(() => writer.execute({ ...command, draft: { ...prepared, header: { ...prepared.header, note: '界'.repeat(SALES_COMMAND_MAX_REQUEST_BYTES) } } }, new AbortController().signal), error => error instanceof SalesCommandError && error.outcome === 'not-sent'); assert.equal(writes, 1);
});
test('resolved native editor discarded through another route cannot revive original proposal as a second NEW', async () => {
  const h = await setup(); assert.equal(await h.session.save(), true); assert.equal(h.editor.discardEditor(), true);
  assert.equal(h.session.getSnapshot().nativeHandoff, true); assert.equal(await h.session.save(), false); assert.equal(h.intents.length, 1); assert.equal(h.commands.length, 1);
});
test('native RETURN negative and EXCHANGE mixed signs use existing null-CAS SAVE without original-sale linkage', async () => {
 for (const businessType of ['RETURN','EXCHANGE'] as const) {
  const second = {...sku,id:entityId('sku',uuid(777)),skuCode:'TEST-SECOND'};
  const h=await setup({async prepareCreate(intent){
   assert.equal(intent.businessType,businessType);assert.equal(intent.orderDiscount,'0.00');assert.equal('originalSalesId' in intent,false);
   const lines=intent.lines.map((row,index)=>({...native.lines[0]!,id:uuid(800+index),lineNo:index+1,skuId:row.skuId,quantity:row.quantity,lineAmount:(BigInt(row.quantity)*1000n).toString()}));
   const total=lines.reduce((sum,row)=>sum+BigInt(row.lineAmount),0n).toString();
   return {...native,header:{...native.header,businessType,grossAmount:total,netDue:total},lines,settlements:native.settlements.map(row=>({...row,direction:'REFUND'}))};
  }},false,second);
  h.proposal.setBusinessType(businessType);h.proposal.updateLine(sku.id,{quantity:'-2'});
  if(businessType==='EXCHANGE'){await h.proposal.openPicker('product');await h.proposal.select(product.id);await h.proposal.select(second.id);h.proposal.closePicker();h.proposal.updateLine(second.id,{dealPrice:'10.00',quantity:'1'});}
  h.proposal.updateSettlement(h.proposal.getSnapshot().draft.settlements[0]!.key,{direction:'REFUND'});
  assert.equal(await h.session.save(),true);assert.equal(h.commands.length,1);const command=h.commands[0]!;if(command.action!=='SAVE')throw Error();
  assert.equal(command.expectedVersion,null);assert.equal(command.draft.header.businessType,businessType);assert.deepEqual(command.draft.lines.map(row=>row.quantity),businessType==='RETURN'?['-2']:['-2','1']);
 }
});
test('EXCHANGE same SKU opposing different-price rows preserve order and independent IDs through prepare→SAVE', async () => {
 let captured:NativeSalesCreateProposal|null=null;
 const h=await setup({async prepareCreate(intent){
  captured=intent;assert.deepEqual(intent.lines.map(row=>[row.skuId,row.quantity,row.dealPrice]),[[sku.id,'-2','10.00'],[sku.id,'3','8.00']]);
  const lines=intent.lines.map((row,index)=>({...native.lines[0]!,id:uuid(820+index),lineNo:index+1,quantity:row.quantity,dealPrice:index===0?'1000':'800',lineAmount:index===0?'-2000':'2400'}));
  return {...native,header:{...native.header,businessType:'EXCHANGE',grossAmount:'400',netDue:'400'},lines};
 }});
 h.proposal.setBusinessType('EXCHANGE');await h.proposal.openPicker('product');await h.proposal.select(product.id);await h.proposal.select(sku.id);h.proposal.closePicker();
 const [a,b]=h.proposal.getSnapshot().draft.lines;h.proposal.updateLine(a!.key,{quantity:'-2',dealPrice:'10.00'});h.proposal.updateLine(b!.key,{quantity:'3',dealPrice:'8.00'});
 assert.equal(await h.session.save(),true);assert.ok(captured);const command=h.commands[0]!;if(command.action!=='SAVE')throw Error();
 assert.equal(command.draft.lines.length,2);assert.notEqual(command.draft.lines[0]!.id,command.draft.lines[1]!.id);assert.deepEqual(command.draft.lines.map(row=>row.lineNo),[1,2]);assert.equal(command.draft.header.netDue,'400');
});
