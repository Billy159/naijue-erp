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
  await session.openPicker('salesperson'); await session.select(uuid(11));
  await session.openPicker('customer'); await session.select(uuid(11)); await session.openPicker('warehouse'); await session.select(uuid(10));
  await session.openPicker('product'); await session.select(product.id); await session.select(sku.id); session.closePicker();
}
test('SALE proposal only reads explicit current picks; prices are never defaulted from retail and unknown facts retained', async () => {
  const { session, queries } = setup(); assert.equal(queries.length, 0); await session.openPicker('customer'); assert.equal(queries.length, 0);
  await fill(session); assert.equal(session.getSnapshot().draft.lines[0]!.dealPrice, ''); assert.equal(session.validate(), null);
  session.updateLine(sku.id, { dealPrice: '2.35', quantity: '2' }); const draft = session.validate()!;
  assert.ok(draft.lines[0]!.sku);
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

test('trusted current employee default is fresh-only/CAS and cannot refill after touch, clear, saved NULL or disposal', async () => {
  const h=setup(), employee=ref(15); const initial=h.session.getSnapshot().draft;
  assert.equal(h.session.applyDefaultSalesperson(employee,uuid(16),initial),false);
  h.session.setHeader({note:'keep user input'});
  assert.equal(h.session.applyDefaultSalesperson(employee,uuid(15),initial),false);
  assert.equal(h.session.applyDefaultSalesperson(employee,uuid(15),h.session.getSnapshot().draft),true);
  assert.equal(h.session.getSnapshot().draft.note,'keep user input'); assert.equal(h.session.getSnapshot().draft.salesperson?.id,uuid(15));
  h.session.clearSalesperson(); assert.equal(h.session.applyDefaultSalesperson(employee,uuid(15),h.session.getSnapshot().draft),false);
  const touched=setup(); touched.session.clearSalesperson(); assert.equal(touched.session.applyDefaultSalesperson(employee,uuid(15),touched.session.getSnapshot().draft),false);
  const picked=setup(); await picked.session.openPicker('hall'); await picked.session.select(hall.id); await picked.session.openPicker('salesperson'); picked.session.closePicker();
  assert.equal(picked.session.applyDefaultSalesperson(employee,uuid(15),picked.session.getSnapshot().draft),false);
  const old=setup(); const value=setup(); await fill(value.session); value.session.updateLine(sku.id,{dealPrice:'1.00'});
  assert.equal(old.session.initializeFromSaved({...value.session.getSnapshot().draft,salesperson:null}),true);
  assert.equal(old.session.applyDefaultSalesperson(employee,uuid(15),old.session.getSnapshot().draft),false);
  const gone=setup();gone.context.clear();assert.equal(gone.session.applyDefaultSalesperson(employee,uuid(15),gone.session.getSnapshot().draft),false);
});
test('both new SAVE proposal paths require salesperson while leaving original empty input visible',async()=>{
 const h=setup();await fill(h.session);h.session.updateLine(sku.id,{dealPrice:'1.00'});h.session.clearSalesperson();
 assert.equal(h.session.validate(),null);assert.ok(h.session.getSnapshot().errors.includes('请选择在职营业员。'));
 assert.equal(h.session.saveProposal(null),null);assert.ok(h.session.getSnapshot().errors.includes('请选择在职营业员。'));assert.equal(h.session.getSnapshot().draft.salesperson,null);
});

test('atomic SAVE quotes exact displayed discounted prices for missing specifications in new and saved drafts', async () => {
 const {salesProposalMoney}=await import('./sales-proposal.ts');
 const sized={...product,sizeGroupId:sku.sizeGroupId,retailPrice:'100.00'},missing=uuid(71);
 const overrides:Partial<SalesProposalReader>={
  async readProducts(){return page([sized]);},
  async readSizeGroups(){return {page:1,pageSize:100,total:1,items:[{id:sku.sizeGroupId,name:'TEST sizes',sizes:[{id:sku.sizeId,name:sku.sizeName,displayOrder:0},{id:missing,name:'170/M',displayOrder:1}]}]};},
 };
 for(const existing of [false,true]){
  let h=setup(overrides);await fill(h.session);h.session.updateLine(sku.id,{dealPrice:'12.34'});
  const originalKey=uuid(77);
  if(existing){
   const seed=h.session.validate()!;h.context.clear();h=setup(overrides);
   assert.equal(h.session.initializeFromSaved({...seed,lines:seed.lines.map(row=>({...row,key:originalKey}))}),true);
  }else h.session.removeLine(sku.id);
  const session=h.session;
  const entryKey=session.getSnapshot().entries.OUT.at(-1)!.key;
  await session.openEntryPicker('OUT','product',entryKey);assert.equal(await session.select(product.id),true);
  for(const [kind,id] of [['color',sku.colorId],['fit',sku.fitId],['size',missing]] as const){await session.openEntryPicker('OUT','sku',entryKey);assert.equal(session.selectSpec(kind,id),true,kind+': '+JSON.stringify(session.getSnapshot().picker)+' '+session.getSnapshot().notice);}
  session.updateEntry('OUT',{pricingRule:'DISCOUNT',discount:'8',quantity:'2',dealPrice:'raw-unrelated'},entryKey);
  const before=session.getSnapshot(),display=salesProposalMoney({...before.draft,lines:session.pricingLines!});
  const proposal=session.saveProposal(existing?uuid(78):null,existing?new Set([originalKey]):new Set());assert.ok(proposal);
  const line=proposal.lines.at(-1)!;assert.ok('spec' in line);assert.equal(line.dealPrice,'80.00');assert.equal(line.discountTenths,80);
  assert.equal(display?.grossMinor,existing?'17234':'16000');assert.equal(session.getSnapshot().entries,before.entries,'serialization preserves raw specification input');
  if(existing)assert.equal(proposal.lines[0]!.existingLineId,originalKey);
  else{
   const {SalesCommandWorkspace}=await import('../sales/commands/controller.ts');
   const {createSalesCommandHttpClient}=await import('../sales/commands/http-client.ts');let calls=0;
   const client=createSalesCommandHttpClient({origin:'https://synthetic.test',basePath:'/api',fetch:async(_url,init)=>{calls++;const body=JSON.parse(init.body as string);assert.equal(body.proposal.lines[0].dealPrice,'80.00');return Response.json({error:{code:'SALES_DISPLAYED_PRICE_CHANGED',message:'quoted80 differs from locked96'}},{status:409});}});
   const owner=new SalesCommandWorkspace({scope:h.scope,client,reader:{async readDetail(){throw Error('No read after rejection');}},newRequestKey:()=> 'TEST.spec-quote',onAccessFailure(){throw Error('No access failure');}});
   assert.equal(await owner.submitProposal(proposal),false);assert.equal(owner.getSnapshot().write.phase,'rejected');assert.equal(calls,1);
   assert.equal(session.getSnapshot().entries,before.entries,'known price rejection preserves original screen input');assert.equal(owner.getSnapshot().write.command?.requestKey,'TEST.spec-quote');
  }
  h.context.clear();
 }
});
test('SAVE discount quote uses integer pennies for large amounts, signed returns and confirmed zero without changing gift semantics',async()=>{
 const h=setup({},'90071992547409.93');await fill(h.session);h.session.updateLine(sku.id,{pricingRule:'DISCOUNT',discount:'8'});
 assert.equal(h.session.saveProposal(null)?.lines[0]!.dealPrice,'72057594037927.94');
 h.session.setBusinessType('RETURN');h.session.updateLine(sku.id,{quantity:'-2'});assert.equal(h.session.saveProposal(null)?.lines[0]!.dealPrice,'72057594037927.94');
 h.session.updateLine(sku.id,{discount:'0'});assert.equal(h.session.saveProposal(null),null);
 h.session.updateLine(sku.id,{zeroConfirmed:true});assert.equal(h.session.saveProposal(null)?.lines[0]!.dealPrice,'0.00');
 h.session.updateLine(sku.id,{isGift:true,zeroConfirmed:false});assert.equal(h.session.saveProposal(null)?.lines[0]!.dealPrice,null);
 h.context.clear();
});

test('exchange price display follows discount/unit price/gift exactly while preserving original SAVE intent and cancel',async()=>{
 const {salesProposalPriceDisplay,salesProposalMoney}=await import('./sales-proposal.ts');const h=setup({},'239.00');await fill(h.session);const key=h.session.getSnapshot().draft.lines[0]!.key;
 h.session.setBusinessType('RETURN');h.session.updateLine(key,{quantity:'-1',dealPrice:'239',pricingRule:'DISCOUNT',discount:'5'});
 let row=h.session.getSnapshot().draft.lines[0]!;assert.deepEqual(salesProposalPriceDisplay(row),{dealPrice:'119.50',discount:'5'});assert.equal(salesProposalMoney({...h.session.getSnapshot().draft,lines:[row]})?.grossMinor,'-11950');assert.equal(h.session.saveProposal(null)!.lines[0]!.dealPrice,'119.50');assert.equal(row.dealPrice,'239','display never overwrites original input');
 h.session.updateLine(key,{dealPrice:'200',pricingRule:'UNIT_PRICE'});row=h.session.getSnapshot().draft.lines[0]!;assert.deepEqual(salesProposalPriceDisplay(row),{dealPrice:'200',discount:'8.4'});
 h.session.updateLine(key,{isGift:true});assert.deepEqual(salesProposalPriceDisplay(h.session.getSnapshot().draft.lines[0]!),{dealPrice:'0.00',discount:'0'});
 h.session.updateLine(key,{isGift:false});assert.equal(salesProposalPriceDisplay(h.session.getSnapshot().draft.lines[0]!).dealPrice,'200');
 const before=h.session.getSnapshot().draft;assert.equal(h.session.beginLineEdit(key),true);h.session.updateLineEdit({pricingRule:'DISCOUNT',discount:'0'});assert.equal(salesProposalPriceDisplay(h.session.getSnapshot().lineEdit!).dealPrice,'0.00');h.session.cancelLineEdit();assert.equal(h.session.getSnapshot().draft,before);
 h.session.setBusinessType('SALE');h.session.updateLine(key,{quantity:'2',pricingRule:'DISCOUNT',discount:'5'});assert.equal(h.session.saveProposal(null)!.lines[0]!.dealPrice,'119.50');
 h.session.updateLine(key,{discount:'5.'});assert.equal(salesProposalPriceDisplay(h.session.getSnapshot().draft.lines[0]!).dealPrice,'');assert.equal(h.session.saveProposal(null),null);
 const large={...row,product:{...row.product,retailPrice:'90071992547409.93'},pricingRule:'DISCOUNT' as const,discount:'8'};assert.equal(salesProposalPriceDisplay(large).dealPrice,'72057594037927.94');
 h.context.clear();
});
test('actual proposal form keeps both filled exchange sections visible and renders linked price/gift fields',async()=>{
 const {build}=await import('esbuild'),{mkdtemp,rm}=await import('node:fs/promises'),{pathToFileURL}=await import('node:url'),{resolve,join}=await import('node:path');
 const temp=await mkdtemp(resolve('apps/web/src/current-form/.exchange-form-'));
 try{
  const output=join(temp,'form.mjs');await build({entryPoints:['apps/web/demo-replica/frontend/runtime/documents/proposal-form.tsx'],outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],plugins:[{name:'nonvisual-picker-only',setup(b){b.onLoad({filter:/source-controls\.tsx$/},()=>({loader:'tsx',contents:'export const SourceDate=()=>null;export const SourceSingle=()=>null;'}));b.onLoad({filter:/proposal-picker\.tsx$/},()=>({loader:'tsx',contents:'export const ProposalReference=()=>null;export const ProposalPopup=()=>null;export const ProposalTrigger=p=>p.children;'}));b.onLoad({filter:/native-dialog\.tsx$/},()=>({loader:'tsx',contents:'export const SaleDialog=p=><div>{p.children}{p.footer}</div>;'}));}}]});
  const {SalesProposalForm}=await import(pathToFileURL(output).href),{createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
  const {createRequire}=await import('node:module');const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string)=>{window:{document:Document;close:()=>void}}};
  const h=setup();await fill(h.session);h.session.setBusinessType('EXCHANGE');const key=h.session.getSnapshot().draft.lines[0]!.key;h.session.updateLine(key,{quantity:'-1',dealPrice:'10'});
  for(const dir of ['IN','OUT'] as const){const k=h.session.getSnapshot().entries[dir].at(-1)!.key;await h.session.openEntryPicker(dir,'product',k);await h.session.select(product.id);h.session.updateEntry(dir,{dealPrice:'10'},k);}
  const render=()=>new JSDOM(renderToStaticMarkup(createElement(SalesProposalForm,{session:h.session,scope:h.scope,productReader:{},denied(){},actions:null,busy:false})));
  let dom=render();assert.equal(dom.window.document.querySelectorAll('[data-business-section=out] [data-entry-row]').length,1,'filled inactive entry remains visible');assert.equal(dom.window.document.querySelectorAll('[data-business-section=in] [data-entry-row]').length,3,'saved line, filled entry and active blank input');dom.window.close();
  h.session.updateLine(key,{pricingRule:'DISCOUNT',discount:'5',isGift:true});dom=render();const row=dom.window.document.querySelector(`[data-entry-row="${key}"]`)!;assert.equal(row.querySelector('input[aria-label="本行成交单价"]')?.getAttribute('value'),'0.00');assert.equal(row.querySelector('input[aria-label="本行折扣"]')?.getAttribute('value'),'0');assert.equal(row.querySelector('.sale-gift')?.textContent,'赠品');dom.window.close();h.context.clear();
 }finally{await rm(temp,{recursive:true,force:true});}
});

test('payment display ignores only unused blank rows, preserves exact paid/refund sums and keeps partial/invalid input unknown',async()=>{
 const {salesProposalMoney}=await import('./sales-proposal.ts');const h=setup();await fill(h.session);h.session.updateLine(sku.id,{quantity:'1',dealPrice:'100'});
 await h.session.openPicker('paymentMethod');await h.session.select(uuid(12));await h.session.select(uuid(13));const first=h.session.getSnapshot().draft.settlements[0]!.key;h.session.updateSettlement(first,{amount:'100'});
 const money=()=>salesProposalMoney(h.session.getSnapshot().draft)!;
 assert.equal(money().balanced,true);assert.equal(h.session.addSettlement(),true);const blank=h.session.getSnapshot().draft.settlements.at(-1)!;
 assert.equal(money().settledMinor,'10000');assert.equal(money().balanced,true);assert.equal(h.session.saveProposal(null),null,'blank UI row does not weaken SAVE requirements');
 h.session.updateSettlement(blank.key,{amount:'oops'});assert.equal(money().settledMinor,null);assert.equal(h.session.getSnapshot().draft.settlements.at(-1)!.amount,'oops');
 h.session.updateSettlement(blank.key,{amount:'0'});assert.equal(money().settledMinor,null,'an explicit unbound zero is not an unused row');
 h.session.updateSignedSettlement(blank.key,'-');assert.equal(money().settledMinor,null,'incomplete negative input is not silently zero');h.session.removeSettlement(blank.key);
 h.session.clearReference('paymentAccount',first);assert.equal(money().settledMinor,null);assert.equal(h.session.getSnapshot().draft.settlements[0]!.amount,'100');
 await h.session.openPicker('paymentMethod');await h.session.select(uuid(12));await h.session.select(uuid(13));h.session.removeSettlement(first);
 const retained=h.session.getSnapshot().draft.settlements[0]!.key;h.session.setBusinessType('RETURN');h.session.updateLine(sku.id,{quantity:'-1',dealPrice:'90071992547409.93'});h.session.updateSignedSettlement(retained,'-90071992547409.93');
 assert.equal(money().settledMinor,'-9007199254740993');assert.equal(money().differenceMinor,'0');assert.equal(h.session.addSettlement(),true);assert.equal(money().balanced,true);h.context.clear();
});
test('payment draft add follows Demo amount-only rule, rejects invalid amount with feedback and never bypasses formal references',async()=>{
 const h=setup();await fill(h.session);h.session.updateLine(sku.id,{dealPrice:'10'});
 assert.equal(h.session.updateSignedSettlement(null,'10'),true);const first=h.session.getSnapshot().draft.settlements[0]!;
 assert.equal(first.method,null);assert.equal(h.session.addSettlement(),true,'valid amount can add even before account selection');
 const second=h.session.getSnapshot().draft.settlements[1]!;assert.equal(h.session.addSettlement(),false);assert.match(h.session.getSnapshot().notice??'',/有效金额/);assert.equal(h.session.getSnapshot().draft.settlements.length,2);
 h.session.updateSettlement(second.key,{amount:'1.001'});assert.equal(h.session.addSettlement(),false);assert.equal(h.session.getSnapshot().draft.settlements[1]!.amount,'1.001');
 h.session.updateSettlement(second.key,{amount:'0'});assert.equal(h.session.addSettlement(),true);assert.equal(h.session.getSnapshot().draft.settlements.length,3);assert.equal(h.session.saveProposal(null),null);assert.equal(h.session.validate(),null);
 assert.equal(h.session.addSettlement(),false);assert.match(h.session.getSnapshot().notice??'',/最多.*3/);h.context.clear();
});
