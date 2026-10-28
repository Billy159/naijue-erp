import {qaPrincipal,qaCurrentProducts,qaCurrentSkus,qaSkus,qaSalesReferences,qaHalls,qaCustomers,qaWarehouses,qaPaymentAccounts,qaMethods,qaStaff,qaSalesDocuments,type QaReferenceProfile} from '../demo-replica/frontend/qa-reference-fixtures.mts';
import { detail as seedFixtureDetail, summary as seedFixtureSummary } from '../src/sales/tests/fixtures.ts';
import { detail as fixtureDetail } from '../src/sales/commands/fixtures.test-support.ts';
import type { SalesDraftDto } from '../src/sales/commands/contracts.ts';
import type { NativeSalesCreateProposal } from '../../../packages/application/src/native-sales-preparation.ts';
import { sourceConfirmedCreateDocumentNumber } from '../../../packages/application/src/source-confirmed-document-number.ts';
import { allocateSalesDiscount, discountUnitPrice } from '../../../packages/domain/src/sales-money.ts';
import { minorAmount } from '../../../packages/domain/src/values.ts';
import type { SyntheticTransactionFailure } from './types.ts';
/** Extracted acceptance-only protocol from the existing transaction harness.
 * Native preparation/price functions and new SAVE/receipt boundary are preserved.
 * No import-time DOM, actual network, stock command or production host. */
export function createSyntheticSalesTransport(onRecord: (message: string) => void = () => {}, dataset?:QaReferenceProfile) {
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const base = fixtureDetail(), documents = new Map<string, SalesDraftDto>(), receipts = new Map<string, unknown>();
const seedSource = seedFixtureDetail(), seed = { ...seedSource, stockBasis: 'CUTOFF_HISTORY' as const, document: { ...seedSource.document, header: { ...seedSource.document.header, number: 'SYN-HISTORY-XS-001', note: '合成只读历史示例（非正式）' } } };
const seedSummary = { ...seedFixtureSummary(), number: seed.document.header.number };

const principal = dataset?qaPrincipal:{ accountId: uuid(900), staffId: uuid(950), loginName: 'SYNTHETIC-SALE-ONLY', role: 'ADMIN', hallId: null, authVersion: 1 };
const product = dataset?qaCurrentProducts()[0]!:{ id: uuid(40), code: 'SYN-001', name: '合成验收衬衫（非真实商品）', retailPrice: '39.90', minimumPriceAvailability: 'UNAVAILABLE' };
const skus = dataset?qaCurrentSkus():[70, 71].map((n, index) => ({ id: uuid(n), skuCode: `SYN-SKU-${n}`, productId: product.id, productCode: product.code, productName: product.name, colorId: uuid(41), colorName: '合成红色', fitId: uuid(42), fitName: 'Y版（修身）', sizeId: uuid(60 + index), sizeName: index ? '170/M' : '165/S', sizeGroupId: uuid(50), barcodeAvailability: 'UNAVAILABLE' }));
const ref = (id: string, name: string, extra = {}) => ({ id, name, code: null, hallId: null, hallName: null, paymentMethodId: null, paymentMethodName: null, ...extra });
const references: Record<string, unknown[]> = dataset?qaSalesReferences:{
 hall: [ref(uuid(10), '合成营业厅', { hallId: uuid(10), hallName: '合成营业厅' })], customer: [ref(uuid(11), '合成客户', { code: 'SYN-CUSTOMER' })], salesperson: [ref(uuid(12), '合成营业员', { hallId: uuid(10), hallName: '合成营业厅' })],
 warehouse: [ref(uuid(20), '合成销货仓', { hallId: uuid(10), hallName: '合成营业厅' })], paymentMethod: [ref(uuid(30), '合成现金')], paymentAccount: [ref(uuid(31), '合成收款账户', { paymentMethodId: uuid(30), paymentMethodName: '合成现金' })],
};
let failure = 'none', delayMs = 0, writes = 0;
const record = onRecord;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const deny = (status: number, code: string) => json({ error: { code, message: 'Explicit synthetic failure; no real proof or database' } }, status);
const page = (items: readonly unknown[], body: {page:number;pageSize:number}) => json({ page: body.page, pageSize: body.pageSize, exactTotal: String(items.length), items: items.slice((body.page-1)*body.pageSize,body.page*body.pageSize) });
const money = (yuan: string) => { const [w, f=''] = yuan.split('.'); return minorAmount((BigInt(w!) * 100n + BigInt(f.padEnd(2,'0'))).toString()); };
function prepare(body: NativeSalesCreateProposal) {
 const id = crypto.randomUUID();
 const lines = body.lines.map((row,index) => {
  const sku = skus.find(s => s.id === row.skuId); if (!sku) throw Error('Unknown synthetic SKU');
  const dealPrice = row.isGift ? 0n : row.pricingRule === 'DISCOUNT' ? discountUnitPrice(dataset?money(qaCurrentProducts().find(p=>p.id===sku.productId)!.retailPrice):minorAmount('3990'), row.discountTenths!) : money(row.dealPrice!);
  return { id: crypto.randomUUID(), salesId:id, lineNo:index+1, skuId:row.skuId, quantity:row.quantity, referencePrice:dataset?money(qaCurrentProducts().find(p=>p.id===sku.productId)!.retailPrice).toString():'3990', dealPrice:dealPrice.toString(), pricingRule:row.pricingRule, discountTenths:row.discountTenths, zeroConfirmed:row.zeroConfirmed, isGift:row.isGift, lineAmount:(dealPrice*BigInt(row.quantity)).toString(), allocatedDiscount:'0', isCurrent:true, snapshot:{ productCode:sku.productCode,productName:sku.productName,colorName:sku.colorName,fitName:sku.fitName,sizeName:sku.sizeName,barcode:dataset?qaSkus.find(s=>s.id===sku.id)!.barcode:`SYNTHETIC-MAIN-${sku.skuCode}` } };
 });
 const orderDiscount = money(body.orderDiscount), gross = lines.reduce((sum,row)=>sum+BigInt(row.lineAmount),0n), shares=body.businessType==='SALE'?allocateSalesDiscount(lines.map(row=>minorAmount(row.lineAmount)),orderDiscount):lines.map(()=>minorAmount('0'));
 return { header:{id,number:sourceConfirmedCreateDocumentNumber('SALE',id),businessType:body.businessType,businessDate:body.businessDate,note:body.note,hallId:body.hallId,customerId:body.customerId,salespersonId:body.salespersonId,warehouseId:body.warehouseId,orderDiscount:orderDiscount.toString(),grossAmount:gross.toString(),netDue:(gross-orderDiscount).toString()}, lines:lines.map((row,index)=>({...row,allocatedDiscount:shares[index]!.toString()})), settlements:body.settlements.map((row,index)=>({...row,id:crypto.randomUUID(),salesId:id,lineNo:index+1,amount:money(row.amount).toString()})) };
}
const names = dataset?{hallName:qaHalls[0]!.name,customerName:qaCustomers[0]!.name,warehouseName:qaWarehouses[0]!.name,salespersonName:null}:{hallName:'合成营业厅',customerName:'合成客户',warehouseName:'合成销货仓',salespersonName:null};
const namesFor=(draft:SalesDraftDto)=>dataset?{hallName:qaHalls.find(x=>x.id===draft.header.hallId)!.name,customerName:qaCustomers.find(x=>x.id===draft.header.customerId)!.name,warehouseName:qaWarehouses.find(x=>x.id===draft.header.warehouseId)!.name,salespersonName:qaStaff.find(x=>x.id===draft.header.salespersonId)?.name??null,createdByName:qaPrincipal.loginName,responsibleName:null}:names;
const currentDetail = (draft:SalesDraftDto) => ({...base,referenceNames:namesFor(draft),settlementNames:draft.settlements.map(row=>({settlementId:row.id,paymentAccountId:row.paymentAccountId,accountNameSnapshot:dataset?qaPaymentAccounts.find(x=>x.id===row.paymentAccountId)!.name:'合成收款账户',methodNameSnapshot:dataset?qaMethods.find(x=>x.id===row.paymentMethodId)!.name:'合成现金',currentAccountName:dataset?qaPaymentAccounts.find(x=>x.id===row.paymentAccountId)!.name:'合成收款账户',currentMethodName:dataset?qaMethods.find(x=>x.id===row.paymentMethodId)!.name:'合成现金'})),document:{header:{...base.document.header,...draft.header,status:'DRAFT',version:1,createdByAccountId:principal.accountId},lines:draft.lines,settlements:draft.settlements}});
const http = {origin:'https://synthetic-management.invalid',basePath:'/api',fetch:async(url:string,init:RequestInit):Promise<Response>=>{
 const body=init.body?JSON.parse(String(init.body)):null, endpoint=new URL(url).pathname.replace('/api',''); record(`${init.method} ${endpoint}`);
 if(endpoint==='/auth/session') return json({principal}); if(endpoint==='/auth/logout') return json({ok:true});
 if(endpoint.startsWith('/current-form/') && failure==='candidate403') return deny(403,'FORBIDDEN');
 if(endpoint==='/current-form/sales-references/query') { const items=references[body.kind]??[]; return json({page:body.page,pageSize:body.pageSize,exactTotal:String(items.length),items,...(body.kind==='paymentAccount'?{recommendationAvailability:'UNAVAILABLE'}:{})}); }
 if(endpoint==='/current-form/products/query') return page(dataset?qaCurrentProducts():[product],body);
 if(endpoint==='/current-form/product-skus/query') return page(dataset?skus.filter(s=>s.productId===body.productId):skus,body);
 if(endpoint==='/sales/prepare-create') {
  if(delayMs) await new Promise(resolve=>setTimeout(resolve,delayMs));
  if(failure==='prepare403') return deny(403,'FORBIDDEN');
  if(failure==='proofMissing') return deny(409,'NATIVE_CATALOGUE_FACTS_UNAVAILABLE');
  if(failure==='prepareUnavailable') return deny(503,'SERVICE_UNAVAILABLE');
  return json(prepare(body));
 }
 if(endpoint==='/sales/commands') {
  if(body.action!=='SAVE'||body.expectedVersion!==null) return deny(409,'INVALID_STATE');
  if(receipts.has(body.requestKey)) return json((receipts.get(body.requestKey) as {result:unknown}).result);
  documents.set(body.draft.header.id,body.draft); writes++;
  const result={salesId:body.draft.header.id,operationId:crypto.randomUUID(),version:1,status:'DRAFT',ledgerEntryIds:[]};
  receipts.set(body.requestKey,{requestKey:body.requestKey,action:'SAVE',status:'COMMITTED',completedAt:new Date().toISOString(),result});
  record(`SYNTHETIC ONLY: ${writes} SAVE(s), page memory only; no database/proof writes.`);
  if(failure==='saveUncertain') throw Error('Synthetic lost response after memory save'); return json(result);
 }
 if(endpoint.startsWith('/sales/receipts/')) { const receipt=receipts.get(decodeURIComponent(endpoint.split('/').at(-1)!));return receipt?json(receipt):deny(404,'RECEIPT_NOT_FOUND'); }
 if(endpoint==='/sales/query') return page([...(dataset?qaSalesDocuments.map(d=>({id:d.document.header.id,number:d.document.header.number})): [seedSummary]),...[...documents.values()].map(draft=>({id:draft.header.id,number:draft.header.number,businessType:draft.header.businessType,businessDate:draft.header.businessDate,hallId:draft.header.hallId,customerId:draft.header.customerId,warehouseId:draft.header.warehouseId,salespersonId:draft.header.salespersonId,status:'DRAFT',version:1,grossAmount:draft.header.grossAmount,orderDiscount:draft.header.orderDiscount,netDue:draft.header.netDue,...namesFor(draft),quantity:draft.lines.reduce((s,r)=>s+BigInt(r.quantity),0n).toString(),incomingQuantity:draft.lines.reduce((s,r)=>s+(BigInt(r.quantity)<0n?-BigInt(r.quantity):0n),0n).toString(),outgoingQuantity:draft.lines.reduce((s,r)=>s+(BigInt(r.quantity)>0n?BigInt(r.quantity):0n),0n).toString(),updatedAt:new Date().toISOString()}))],body);
 if(endpoint==='/sales/detail/query') {if(dataset){const sample=qaSalesDocuments.find(d=>d.document.header.id===body.salesId);if(sample)return json(sample);}if(!dataset&&body.salesId===seed.document.header.id)return json(seed);const draft=documents.get(body.salesId);return draft?json(currentDetail(draft)):deny(404,'DOCUMENT_NOT_FOUND');}
 if(endpoint==='/sales/references/query') return page([],body);
 throw Error(`Unsupported synthetic endpoint: ${endpoint}`);
}};

return Object.freeze({http, savedCount: () => writes,
 setFailure(value: SyntheticTransactionFailure) { failure = value; },
 setPreparationDelay(milliseconds: number) { if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > 5000) throw new TypeError('Invalid synthetic preparation delay'); delayMs = milliseconds; },
});
}
