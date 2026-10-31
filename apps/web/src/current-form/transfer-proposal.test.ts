import test from 'node:test';
import assert from 'node:assert/strict';
import { entityId } from '../../../../packages/domain/src/values.ts';
import type { CurrentFormPage, CurrentFormProduct, CurrentFormSku, CurrentTransferWarehouse } from '../../../../packages/application/src/current-form-ports.ts';
import { ReadContext } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { TransferProposalSession, transferProposalRowKey, type TransferProposalReader } from './transfer-proposal.ts';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const warehouse = (n: number): CurrentTransferWarehouse => ({ id: entityId('warehouse', uuid(n)), name: `TEST warehouse ${n}`, hallId: entityId('hall', uuid(90)), hallName: 'TEST hall', enabled: true, hallEnabled: true, hasNonzeroInventory: false });
const product: CurrentFormProduct = { id: entityId('product', uuid(3)), code: 'TEST', name: 'TEST product', sizeGroupId: entityId('sizeGroup', uuid(8)), retailPrice: null, minimumPriceAvailability: 'UNAVAILABLE' };
const sku: CurrentFormSku = { id: entityId('sku', uuid(4)), skuCode: 'TEST-SKU', productId: product.id, productCode: product.code, productName: product.name, colorId: entityId('color', uuid(5)), colorName: 'TEST red', fitId: entityId('fit', uuid(6)), fitName: 'TEST fit', sizeId: entityId('size', uuid(7)), sizeName: '165/S', sizeGroupId: entityId('sizeGroup', uuid(8)), barcodeAvailability: 'UNAVAILABLE' };
const page = <T>(items: readonly T[], n = 1, total = BigInt(items.length)): CurrentFormPage<T> => ({ page: n, pageSize: 20, exactTotal: total, items });
function setup(overrides: Partial<TransferProposalReader> = {}) {
  const context = new ReadContext({ accountId: uuid(99), sessionRevision: 'test', permissionRevision: 'test' });
  const scope = context.createScope('test'); const calls: string[] = [];
  const reader: TransferProposalReader = {
    async readTransferWarehouses(query) { calls.push(query.direction); return page([warehouse(1), warehouse(2)]); },
    async readProducts() { calls.push('product'); return page([product]); },
    async readProductSkus(query) { calls.push('sku'); assert.equal(query.productId, product.id); return page([sku]); }, ...overrides,
  };
  return { session: new TransferProposalSession(scope, reader), context, scope, calls };
}
async function fill(session: TransferProposalSession) {
  session.setHeader({ businessDate: '2026-10-21', note: 'SYNTHETIC' });
  await session.openPicker('FROM'); await session.select(uuid(1)); await session.openPicker('TO'); await session.select(uuid(2));
  await session.openPicker('PRODUCT'); await session.select(product.id); await session.select(sku.id);
}
test('proposal is inert; real candidate selections preserve full SKU and unavailable facts, never create a command', async () => {
  const { session, calls } = setup(); assert.deepEqual(calls, []); await fill(session);
  const draft = session.validate()!; assert.ok(draft); assert.ok(draft.lines[0]!.sku); assert.equal(draft.lines[0]!.sku.sizeName, '165/S');
  assert.equal(draft.lines[0]!.sku.barcodeAvailability, 'UNAVAILABLE'); assert.equal('barcode' in draft.lines[0]!.sku, false);
  assert.equal('number' in draft, false); assert.equal('id' in draft, false); assert.ok(Object.isFrozen(draft.lines));
  assert.match(session.getSnapshot().notice!, /尚未保存/); assert.equal(session.getSnapshot().dirty, true);
  assert.deepEqual(calls, ['FROM', 'TO', 'product', 'sku']);
});
test('candidate-bound selection rejects arbitrary IDs, same warehouses and duplicates; removal remains explicit', async () => {
  const { session } = setup(); await session.openPicker('FROM'); assert.equal(await session.select(uuid(555)), false);
  await session.select(uuid(1)); await session.openPicker('TO'); assert.equal(await session.select(uuid(1)), false); assert.equal(session.getSnapshot().draft.to, null);
  await session.select(uuid(2)); await session.openPicker('PRODUCT'); await session.select(product.id); await session.select(sku.id);
  assert.equal(await session.select(sku.id), false); assert.equal(session.getSnapshot().draft.lines.length, 1);
  assert.equal(session.removeLine('missing'), false); assert.equal(session.removeLine(sku.id), true); assert.equal(session.getSnapshot().draft.lines.length, 0);
});
test('invalid raw input retained, exact bigint bounds and actual dates enforced, no false ready state', async () => {
  const { session } = setup(); assert.equal(session.validate(), null); await fill(session);
  for (const value of ['', '0', '-1', '1.5', '01', '9223372036854775808']) {
    session.setQuantity(sku.id, value); assert.equal(session.getSnapshot().draft.lines[0]!.quantity, value); assert.equal(session.validate(), null);
  }
  session.setQuantity(sku.id, '9223372036854775807'); assert.ok(session.validate());
  session.setHeader({ businessDate: '2026-02-30' }); assert.equal(session.validate(), null);
  session.setHeader({ businessDate: '2026-10-21', note: 'x'.repeat(10001) }); assert.equal(session.validate(), null);
});
test('reset/cancel require explicit discard, cancel clears and blocks further editing', async () => {
  const { session } = setup(); await fill(session); assert.equal(session.reset(), false); assert.equal(session.cancel(), false);
  assert.equal(session.reset(true), true); assert.equal(session.getSnapshot().draft.lines.length, 0); assert.equal(session.getSnapshot().dirty, false);
  session.setHeader({ note: 'bad input' }); assert.equal(session.cancel(true), true); assert.equal(session.setHeader({ note: 'resurrection' }), false);
  assert.equal(session.validate(), null); assert.equal(session.getSnapshot().draft.note, '');
});
test('latest search wins even when a reader ignores abort; closing/reset invalidates pending response', async () => {
  const pending: { signal: AbortSignal; resolve: (value: CurrentFormPage<CurrentFormProduct>) => void }[] = [];
  const { session } = setup({ readProducts: (_query, signal) => new Promise(resolve => pending.push({ signal, resolve })) });
  const first = session.openPicker('PRODUCT'), second = session.search('latest'); assert.equal(pending[0]!.signal.aborted, true);
  pending[1]!.resolve(page([product])); await second; pending[0]!.resolve(page([])); await first;
  assert.equal(session.getSnapshot().picker?.search, 'latest'); assert.equal(session.getSnapshot().picker?.result?.items.length, 1);
  const third = session.search('closed'); session.closePicker(); pending[2]!.resolve(page([product])); await third; assert.equal(session.getSnapshot().picker, null);
  const fourth = session.openPicker('PRODUCT'); session.reset(true); pending[3]!.resolve(page([product])); await fourth; assert.equal(session.getSnapshot().picker, null);
});
test('identity/permission invalidation clears draft immediately and late response cannot repopulate', async () => {
  let resolve!: (value: CurrentFormPage<CurrentFormProduct>) => void;
  const { session, context } = setup({ readProducts: () => new Promise(done => { resolve = done; }) });
  session.setHeader({ note: 'private synthetic' }); const waiting = session.openPicker('PRODUCT'); context.clear();
  resolve(page([product])); await waiting; assert.equal(session.getSnapshot().disposed, true); assert.equal(session.getSnapshot().draft.note, ''); assert.equal(session.getSnapshot().picker, null);
});
test('read failures retain draft, clear old candidates and retry only explicitly; forbidden clears scope', async () => {
  let calls = 0; const { session, scope } = setup({ async readProducts() { calls++; if (calls === 1) throw Error('secret'); if (calls === 3) throw new HttpQueryError('forbidden', 'FORBIDDEN'); return page([product]); } });
  session.setHeader({ note: 'retained' }); await session.openPicker('PRODUCT'); assert.equal(calls, 1); assert.equal(session.getSnapshot().picker?.phase, 'error');
  assert.equal(session.getSnapshot().draft.note, 'retained'); assert.doesNotMatch(session.getSnapshot().notice!, /secret/);
  await session.retry(); assert.equal(calls, 2); assert.equal(session.getSnapshot().picker?.phase, 'ready');
  await session.search('deny'); assert.equal(scope.active, false); assert.equal(session.getSnapshot().disposed, true);
});
test('pagination preserves search, uses 20-item server pages, blocks invalid/out-of-range requests', async () => {
  const queries: { search: string; page: number; pageSize: number }[] = [];
  const { session } = setup({ async readProducts(query) { queries.push(query); return page([product], query.page, 21n); } });
  await session.openPicker('PRODUCT'); await session.search('TEST'); await session.page(2); assert.equal(session.getSnapshot().picker?.page, 2);
  await session.page(3); await session.page(0); await session.page(1.5); assert.equal(queries.length, 3);
  assert.deepEqual(queries.map(row => [row.search, row.page, row.pageSize]), [['', 1, 20], ['TEST', 1, 20], ['TEST', 2, 20]]);
});

const matrixGroup = { id: sku.sizeGroupId, name: 'TEST group', sizes: [{id:sku.sizeId,name:sku.sizeName,displayOrder:1}] };
test('B04 scanned SKU-only matrix edits preserve raw and exact scanner boundaries', async () => {
 const {session}=setup({async readBarcode(query){return {state:'FOUND',barcode:query.barcode,binding:{id:uuid(89),kind:'MAIN'},sku};}});
 session.setHeader({businessDate:'2026-10-28'});
 await session.openPicker('FROM');await session.select(uuid(1));await session.openPicker('TO');await session.select(uuid(2));
 const scanner=session.createScanner();assert.equal(await scanner.scan('TEST-BARCODE'),true);
 const key=transferProposalRowKey(sku);assert.equal(session.getSnapshot().draft.lines[0]!.product,undefined);
 assert.equal(session.setMatrixSizeQuantity(key,matrixGroup,sku.sizeId,'8'),true);
 assert.equal(session.validate()!.lines[0]!.quantity,'8');assert.equal(await scanner.scan('TEST-BARCODE'),true);
 assert.equal(session.getSnapshot().draft.lines[0]!.quantity,'9');
 for(const raw of ['', '0','01','1.5','9223372036854775808','9223372036854775807']){
  assert.equal(session.setMatrixSizeQuantity(key,matrixGroup,sku.sizeId,raw),true);
  assert.equal(session.getSnapshot().draft.lines[0]!.quantity,raw);
  assert.equal(!!session.validate(),raw==='9223372036854775807');
  assert.equal(await scanner.scan('TEST-BARCODE'),false);assert.equal(session.getSnapshot().draft.lines[0]!.quantity,raw);
 }
 const before=session.getSnapshot().draft;
 for(const [row,group,id] of [[key,{...matrixGroup,id:uuid(80)},sku.sizeId],[key,matrixGroup,uuid(81)],['wrong',matrixGroup,sku.sizeId]] as const){
  assert.equal(session.setMatrixSizeQuantity(row,group,id,'8'),false);assert.equal(session.getSnapshot().draft,before);assert.match(session.getSnapshot().notice!,/规格|商品/);
 }
 assert.equal(session.setMatrixSizeQuantity(key,{...matrixGroup,sizes:[...matrixGroup.sizes,{id:uuid(82),name:'new',displayOrder:2}]},uuid(82),'8'),false);
 scanner.dispose();session.cancel(true);
});
test('B04 reopened SKU-only matrix keeps existing line and source snapshot', () => {
 const {session}=setup();
 const snapshot={productCode:'OLD',productName:'old product',colorName:'old red',fitName:'old fit',sizeName:'old size',barcode:null};
 assert.equal(session.initializeFromSaved({businessDate:'2026-10-28',note:'unsaved note',from:warehouse(1),to:warehouse(2),lines:[{sku,quantity:'1',existingLineId:uuid(85),sourceSnapshot:snapshot}]}),true);
 assert.equal(session.setMatrixSizeQuantity(transferProposalRowKey(sku),matrixGroup,sku.sizeId,'8'),true);
 const row=session.validate()!.lines[0]!;assert.equal(row.quantity,'8');assert.equal(row.existingLineId,uuid(85));assert.deepEqual(row.sourceSnapshot,snapshot);assert.equal(row.sku!.id,sku.id);
 assert.equal(session.cancel(),false);assert.equal(session.getSnapshot().draft.note,'unsaved note');
});

test('PF01 pending product reads complete bounded SKU pages once; incomplete responses keep pending error',async()=>{
 for(const broken of [false,true]){const calls:number[]=[],size=41;let active=0,peak=0;
 const {session}=setup({async readProducts(){return page([product]);},async readProductSkus(query){calls.push(query.page);active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;return page(Array.from({length:broken&&query.page===2?0:Math.min(20,size-(query.page-1)*20)},(_,i)=>({...sku,id:entityId('sku',uuid(1000+(query.page-1)*20+i)),sizeId:entityId('size',uuid(2000+(query.page-1)*20+i))})),query.page,BigInt(size));}});
 await session.openPicker('PRODUCT');await session.selectPendingProduct(product.id);assert.equal(session.getSnapshot().pending.phase,broken?'error':'ready');if(!broken){assert.equal(session.getSnapshot().pending.skus.length,size);assert.deepEqual([...calls].sort((a,b)=>a-b),[1,2,3]);assert.ok(peak<=4);}session.dispose();}
});

const matrixM:CurrentFormSku={...sku,id:entityId('sku',uuid(204)),skuCode:'TEST-M',sizeId:entityId('size',uuid(207)),sizeName:'170/M'};
const matrixSM={...matrixGroup,sizes:[...matrixGroup.sizes,{id:matrixM.sizeId,name:matrixM.sizeName,displayOrder:2}]};
const savedLabels={productCode:'OLD',productName:'old product',colorName:'old red',fitName:'old fit',sizeName:'old size',barcode:null};
function scanMatrixSetup(target:CurrentFormSku=matrixM,lines= [{sku,product,quantity:'1',existingLineId:uuid(85),sourceSnapshot:savedLabels}]){
 const h=setup({async readBarcode(query){return {state:'FOUND',barcode:query.barcode,binding:{id:uuid(89),kind:'MAIN'},sku:target};},async readSizeGroups(){return {page:1,pageSize:100,total:1,items:[matrixSM]};}});
 assert.equal(h.session.initializeFromSaved({businessDate:'2026-10-28',note:'retained',from:warehouse(1),to:warehouse(2),lines}),true);return h;
}
test('F06 empty saved M cell 5 plus real barcode is one atomic quantity 6 and SAVE coordinate',async()=>{
 const h=scanMatrixSetup(),s=h.session,scanner=s.createScanner();try{
  assert.equal(s.getSnapshot().entry,null);const key=transferProposalRowKey(sku),cell=JSON.stringify([key,matrixM.sizeId]);assert.equal(s.setMatrixSizeQuantity(key,matrixSM,matrixM.sizeId,'5'),true);
  const old=s.getSnapshot().draft.lines[0]!,states:ReturnType<typeof s.getSnapshot>[]=[];const stop=s.subscribe(()=>states.push(s.getSnapshot()));
  assert.equal(await scanner.scan('TEST-M'),true);stop();const after=s.getSnapshot(),m=after.draft.lines.filter(r=>r.sku?.id===matrixM.id);assert.equal(m.length,1);assert.equal(m[0]!.quantity,'6');assert.equal(Object.hasOwn(after.matrixQuantities,cell),false);assert.equal(after.draft.lines[0],old);assert.deepEqual(old.sourceSnapshot,savedLabels);assert.equal(old.existingLineId,uuid(85));
  assert.equal(states.some(x=>x.draft.lines.some(r=>r.sku?.id===matrixM.id)&&Object.hasOwn(x.matrixQuantities,cell)),false,'no duplicate intermediate publication');
  const command=s.saveProposal(uuid(70));assert.ok(command);assert.equal(command.lines.filter(r=>'skuId' in r&&r.skuId===matrixM.id).length,1);assert.equal(command.lines.find(r=>'skuId' in r&&r.skuId===matrixM.id)!.quantity,'6');
 }finally{scanner.dispose();h.context.clear();}
});
test('F06 matrix invalid raw and overflow stay identical; zero consumes once',async()=>{
 for(const raw of ['01','1.5','-1','9223372036854775808','9223372036854775807','0','']){
  const h=scanMatrixSetup(),s=h.session,scanner=s.createScanner();try{s.setMatrixSizeQuantity(transferProposalRowKey(sku),matrixSM,matrixM.sizeId,raw);const before=s.getSnapshot();const ok=await scanner.scan('TEST-M');assert.equal(ok,raw==='0'||raw==='',raw);
   if(ok){assert.equal(s.getSnapshot().draft.lines.find(r=>r.sku?.id===matrixM.id)!.quantity,'1');assert.equal(Object.keys(s.getSnapshot().matrixQuantities).length,0);}else{assert.equal(s.getSnapshot().draft,before.draft);assert.equal(s.getSnapshot().matrixQuantities,before.matrixQuantities);assert.equal(Object.values(s.getSnapshot().matrixQuantities)[0]!.quantity,raw);}
  }finally{scanner.dispose();h.context.clear();}
 }
});
test('F06 conflicting real SKU coordinates reject; existing line at 200 increments but new line cannot exceed cap',async()=>{
 for(const count of [199,200]){
  const lines=Array.from({length:count},(_,i)=>({sku:{...sku,id:entityId('sku',uuid(1000+i)),sizeId:entityId('size',uuid(2000+i))},product,quantity:'1',existingLineId:uuid(3000+i),sourceSnapshot:savedLabels}));
  const h=scanMatrixSetup(matrixM,lines),s=h.session,scanner=s.createScanner();try{s.setMatrixSizeQuantity(transferProposalRowKey(sku),matrixSM,matrixM.sizeId,'5');const before=s.getSnapshot();assert.equal(await scanner.scan('TEST-M'),count===199);if(count===199){assert.equal(s.getSnapshot().draft.lines.length,200);assert.equal(s.getSnapshot().draft.lines.at(-1)!.quantity,'6');}else{assert.equal(s.getSnapshot().draft,before.draft);assert.equal(s.getSnapshot().matrixQuantities,before.matrixQuantities);}}finally{scanner.dispose();h.context.clear();}
  const existing=scanMatrixSetup(lines[0]!.sku,lines),scan=existing.session.createScanner();try{assert.equal(await scan.scan('TEST-EXISTING'),true);assert.equal(existing.session.getSnapshot().draft.lines.length,count);assert.equal(existing.session.getSnapshot().draft.lines[0]!.quantity,'2');assert.equal(existing.session.getSnapshot().draft.lines[0]!.existingLineId,lines[0]!.existingLineId);}finally{scan.dispose();existing.context.clear();}
 }
 const other={...sku,id:entityId('sku',uuid(333))};const h=scanMatrixSetup(other),scanner=h.session.createScanner();try{const before=h.session.getSnapshot();assert.equal(await scanner.scan('TEST-CONFLICT'),false);assert.equal(h.session.getSnapshot().draft,before.draft);}finally{scanner.dispose();h.context.clear();}
});

test('F06 local specification promotion keeps original pointer and only matching saved SKU provenance',async()=>{
 for(const sameSku of [true,false]){
  const original={...matrixM,id:entityId('sku',uuid(sameSku?204:444))};
  const h=setup({async readProductSkus(){return page([sku]);},async readSizeGroups(){return {page:1,pageSize:100,total:1,items:[matrixSM]};},async readBarcode(query){return {state:'FOUND',barcode:query.barcode,binding:{id:uuid(89),kind:'MAIN'},sku:matrixM};}}),s=h.session,scanner=s.createScanner();
  try{
   assert.equal(s.initializeFromSaved({businessDate:'2026-10-28',note:'retained',from:warehouse(1),to:warehouse(2),lines:[{sku:original,product,quantity:'5',existingLineId:uuid(85),sourceSnapshot:savedLabels}]}),true);
   await s.readSizeGroups({search:'',page:1,pageSize:100},new AbortController().signal);
   assert.equal(s.beginReplacement(transferProposalRowKey(original)),true);await s.readPendingSkus();assert.equal(s.commitPending(),true);const local=s.getSnapshot().draft.lines[0]!;assert.equal(local.sku,null);assert.equal(local.existingLineId,uuid(85));assert.equal(local.sourceSnapshot,undefined);
   assert.equal(await scanner.scan('TEST-M'),true);const row=s.getSnapshot().draft.lines[0]!;assert.equal(s.getSnapshot().draft.lines.length,1);assert.equal(row.sku?.id,matrixM.id);assert.equal(row.quantity,'6');assert.equal(row.existingLineId,uuid(85));assert.equal('specification' in row,false);assert.equal(row.product,local.product);assert.deepEqual(row.sourceSnapshot,sameSku?savedLabels:undefined);assert.ok(s.saveProposal(uuid(70)));
  }finally{scanner.dispose();h.context.clear();}
 }
});
