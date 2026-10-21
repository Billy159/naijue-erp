import { createApplication, createDemoFrameWorkspaceRenderer } from '../src/application/index.tsx';
import { detail as fixtureDetail } from '../src/sales/commands/fixtures.test-support.ts';
import type { SalesDraftDto } from '../src/sales/commands/contracts.ts';
import type { NativeSalesCreateProposal } from '../../../packages/application/src/native-sales-preparation.ts';
import { sourceConfirmedCreateDocumentNumber } from '../../../packages/application/src/source-confirmed-document-number.ts';
import { allocateSalesDiscount, discountUnitPrice } from '../../../packages/domain/src/sales-money.ts';
import { minorAmount } from '../../../packages/domain/src/values.ts';
import '../src/sales/detail.css';
import '../src/demo-controls/single-select.css';
import '../src/demo-controls/multi-select.css';
import '../src/components/product-candidate-action.css';
import './harness.css';
// Synthetic-only browser host. No global fetch, credentials, server or database.
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const base = fixtureDetail(), documents = new Map<string, SalesDraftDto>(), receipts = new Map<string, unknown>();
const principal = { accountId: uuid(900), staffId: uuid(950), loginName: 'SYNTHETIC-SALE-ONLY', role: 'ADMIN', hallId: null, authVersion: 1 };
const product = { id: uuid(40), code: 'SYN-001', name: '合成验收衬衫（非真实商品）', retailPrice: '39.90', minimumPriceAvailability: 'UNAVAILABLE' };
const skus = [70, 71].map((n, index) => ({ id: uuid(n), skuCode: `SYN-SKU-${n}`, productId: product.id, productCode: product.code, productName: product.name, colorId: uuid(41), colorName: '合成红色', fitId: uuid(42), fitName: 'Y版（修身）', sizeId: uuid(60 + index), sizeName: index ? '170/M' : '165/S', sizeGroupId: uuid(50), barcodeAvailability: 'UNAVAILABLE' }));
const ref = (id: string, name: string, extra = {}) => ({ id, name, code: null, hallId: null, hallName: null, paymentMethodId: null, paymentMethodName: null, ...extra });
const references: Record<string, unknown[]> = {
 hall: [ref(uuid(10), '合成营业厅', { hallId: uuid(10), hallName: '合成营业厅' })], customer: [ref(uuid(11), '合成客户', { code: 'SYN-CUSTOMER' })], salesperson: [ref(uuid(12), '合成营业员', { hallId: uuid(10), hallName: '合成营业厅' })],
 warehouse: [ref(uuid(20), '合成销货仓', { hallId: uuid(10), hallName: '合成营业厅' })], paymentMethod: [ref(uuid(30), '合成现金')], paymentAccount: [ref(uuid(31), '合成收款账户', { paymentMethodId: uuid(30), paymentMethodName: '合成现金' })],
};
let failure = 'none', delay = false, writes = 0;
const log = document.getElementById('calls')!;
function record(message: string) { log.textContent = `${new Date().toISOString().slice(11,19)} ${message}\n${log.textContent ?? ''}`.slice(0,10000); }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const deny = (status: number, code: string) => json({ error: { code, message: 'Explicit synthetic failure; no real proof or database' } }, status);
const page = (items: readonly unknown[], body: {page:number;pageSize:number}) => json({ page: body.page, pageSize: body.pageSize, exactTotal: String(items.length), items: items.slice((body.page-1)*body.pageSize,body.page*body.pageSize) });
const money = (yuan: string) => { const [w, f=''] = yuan.split('.'); return minorAmount((BigInt(w!) * 100n + BigInt(f.padEnd(2,'0'))).toString()); };
function prepare(body: NativeSalesCreateProposal) {
 const id = crypto.randomUUID();
 const lines = body.lines.map((row,index) => {
  const sku = skus.find(s => s.id === row.skuId); if (!sku) throw Error('Unknown synthetic SKU');
  const dealPrice = row.isGift ? 0n : row.pricingRule === 'DISCOUNT' ? discountUnitPrice(minorAmount('3990'), row.discountTenths!) : money(row.dealPrice!);
  return { id: crypto.randomUUID(), salesId:id, lineNo:index+1, skuId:row.skuId, quantity:row.quantity, referencePrice:'3990', dealPrice:dealPrice.toString(), pricingRule:row.pricingRule, discountTenths:row.discountTenths, zeroConfirmed:row.zeroConfirmed, isGift:row.isGift, lineAmount:(dealPrice*BigInt(row.quantity)).toString(), allocatedDiscount:'0', isCurrent:true, snapshot:{ productCode:sku.productCode,productName:sku.productName,colorName:sku.colorName,fitName:sku.fitName,sizeName:sku.sizeName,barcode:`SYNTHETIC-MAIN-${sku.skuCode}` } };
 });
 const orderDiscount = money(body.orderDiscount), gross = lines.reduce((sum,row)=>sum+BigInt(row.lineAmount),0n), shares=body.businessType==='SALE'?allocateSalesDiscount(lines.map(row=>minorAmount(row.lineAmount)),orderDiscount):lines.map(()=>minorAmount('0'));
 return { header:{id,number:sourceConfirmedCreateDocumentNumber('SALE',id),businessType:body.businessType,businessDate:body.businessDate,note:body.note,hallId:body.hallId,customerId:body.customerId,salespersonId:body.salespersonId,warehouseId:body.warehouseId,orderDiscount:orderDiscount.toString(),grossAmount:gross.toString(),netDue:(gross-orderDiscount).toString()}, lines:lines.map((row,index)=>({...row,allocatedDiscount:shares[index]!.toString()})), settlements:body.settlements.map((row,index)=>({...row,id:crypto.randomUUID(),salesId:id,lineNo:index+1,amount:money(row.amount).toString()})) };
}
const names = {hallName:'合成营业厅',customerName:'合成客户',warehouseName:'合成销货仓',salespersonName:null};
const currentDetail = (draft:SalesDraftDto) => ({...base,referenceNames:names,settlementNames:draft.settlements.map(row=>({settlementId:row.id,paymentAccountId:row.paymentAccountId,accountNameSnapshot:'合成收款账户',methodNameSnapshot:'合成现金',currentAccountName:'合成收款账户',currentMethodName:'合成现金'})),document:{header:{...base.document.header,...draft.header,status:'DRAFT',version:1,createdByAccountId:principal.accountId},lines:draft.lines,settlements:draft.settlements}});
const http = {origin:'https://synthetic.invalid',basePath:'/api',fetch:async(url:string,init:RequestInit):Promise<Response>=>{
 const body=init.body?JSON.parse(String(init.body)):null, endpoint=new URL(url).pathname.replace('/api',''); record(`${init.method} ${endpoint}`);
 if(endpoint==='/auth/session') return json({principal}); if(endpoint==='/auth/logout') return json({ok:true});
 if(endpoint.startsWith('/current-form/') && failure==='candidate403') return deny(403,'FORBIDDEN');
 if(endpoint==='/current-form/sales-references/query') { const items=references[body.kind]??[]; return json({page:body.page,pageSize:body.pageSize,exactTotal:String(items.length),items,...(body.kind==='paymentAccount'?{recommendationAvailability:'UNAVAILABLE'}:{})}); }
 if(endpoint==='/current-form/products/query') return page([product],body);
 if(endpoint==='/current-form/product-skus/query') return page(skus,body);
 if(endpoint==='/sales/prepare-create') {
  if(delay) await new Promise(resolve=>setTimeout(resolve,5000));
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
 if(endpoint==='/sales/query') return page([...documents.values()].map(draft=>({id:draft.header.id,number:draft.header.number,businessType:draft.header.businessType,businessDate:draft.header.businessDate,hallId:draft.header.hallId,customerId:draft.header.customerId,warehouseId:draft.header.warehouseId,salespersonId:draft.header.salespersonId,status:'DRAFT',version:1,grossAmount:draft.header.grossAmount,orderDiscount:draft.header.orderDiscount,netDue:draft.header.netDue,...names,quantity:draft.lines.reduce((s,r)=>s+BigInt(r.quantity),0n).toString(),incomingQuantity:draft.lines.reduce((s,r)=>s+(BigInt(r.quantity)<0n?-BigInt(r.quantity):0n),0n).toString(),outgoingQuantity:draft.lines.reduce((s,r)=>s+(BigInt(r.quantity)>0n?BigInt(r.quantity):0n),0n).toString(),updatedAt:new Date().toISOString()})),body);
 if(endpoint==='/sales/detail/query') {const draft=documents.get(body.salesId);return draft?json(currentDetail(draft)):deny(404,'DOCUMENT_NOT_FOUND');}
 if(endpoint==='/sales/references/query') return page([],body);
 throw Error(`Unsupported synthetic endpoint: ${endpoint}`);
}};
const styles=()=>({async load(){},dispose(){}});
const app=createApplication({http,presentation:{renderWorkspace:createDemoFrameWorkspaceRenderer(),renderRouteState:({state})=><p>合成销货验收：{state.phase}。页面内存接口，无真实数据库或九价凭据。</p>},routes:{sales:{stylesheet:styles(),detailStylesheet:styles(),commands:{newRequestKey:()=>crypto.randomUUID(),manualCreate:true}}}});
app.mount(document.getElementById('root')!);
document.getElementById('authorize')!.addEventListener('click',()=>{failure='none';(document.getElementById('failure') as HTMLSelectElement).value='none';void app.controller.authentication.resolveSession();});
document.getElementById('home')!.addEventListener('click',()=>{void app.controller.navigate(null);});
document.getElementById('sale')!.addEventListener('click',()=>{void app.controller.navigate('sales');});
document.getElementById('failure')!.addEventListener('change',event=>{failure=(event.target as HTMLSelectElement).value;record(`Synthetic behavior: ${failure}`);});
document.getElementById('delay')!.addEventListener('change',event=>{delay=(event.target as HTMLInputElement).checked;});
record('SYNTHETIC SALE READY. No network/PG; click 模拟授权 then 打开销货单列表.');
