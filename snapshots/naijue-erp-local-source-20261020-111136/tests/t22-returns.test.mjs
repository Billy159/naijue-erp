import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {linkedReturnCents,validateReturnWarehouses} from '../dist/server/domain/sales/returns.js';
import {returnBasis} from '../dist/server/domain/sales/money.js';
import {buildSaleBody} from '../frontend/sales-transport.mjs';

const sku='22000000-0000-4000-8000-000000000111',p={id:'P1',uuid:'22000000-0000-4000-8000-000000000101',fitId:'A',name:'Product',unit:'件',skuByCell:{'C|S':sku}};
const line={id:'IN',productId:'P1',colorId:'C',sizeId:'S',fitId:'A',quantity:-2,priceCents:20000,gift:false,referenceCents:null,pricingRule:'unit-price',discountTenths:null};
test('T22 independent exchange transports each side warehouse and refund sign',()=>{
 const d={id:'unsaved-x',date:'2026-10-02',businessType:'退货/换货',warehouseId:'OUT-W',returnWarehouseId:'IN-W',storeId:'H',adjustmentCents:0,
  lines:[line,{...line,id:'OUT',quantity:1,priceCents:30000}],fundsRecords:[{id:'F',methodId:'M',accountId:'A',amountCents:-10000}]};
 const b=buildSaleBody(d,()=>p,product=>product.id);
 assert.deepEqual(b.lines.map(l=>[l.warehouse_id,l.source_quantity,l.direction]),[['IN-W','-2','RETURN_IN'],['OUT-W','1','SALE_OUT']]);
 assert.equal(b.header.return_warehouse_id,'IN-W');assert.equal(b.header.outgoing_warehouse_id,'OUT-W');assert.equal(b.fundsRecords[0].amount,'-100.00');assert.equal(b.fundsRecords[0].direction,'refund');
 assert.equal(b.header.original_document_id,undefined);validateReturnWarehouses(b);
 assert.throws(()=>validateReturnWarehouses({...b,header:{...b.header,return_warehouse_id:'OUT-W'}}));
});
test('T22 original discount remainder is conserved over every one-piece prefix',()=>{
 for(let count=1n;count<=9n;count++)for(let net=0n;net<=100n;net++){
  const original={source_quantity:count.toString(),amount:(net/100n)+'.'+String(net%100n).padStart(2,'0'),return_basis:returnBasis(net,count*10000n)};
  let refunded=0n;for(let start=0n;start<count;start++){const refund=linkedReturnCents(original,start*10000n,10000n);assert.ok(refund>=0n);refunded+=refund;}
  assert.equal(refunded,net);assert.equal(linkedReturnCents(original,0n,count*10000n),net);
  assert.throws(()=>linkedReturnCents(original,count*10000n,10000n));
 }
 const fractional={source_quantity:'1.5',amount:'0.05',return_basis:returnBasis(5n,15000n)};
 assert.equal(linkedReturnCents(fractional,0n,5000n)+linkedReturnCents(fractional,5000n,5000n)+linkedReturnCents(fractional,10000n,5000n),5n);
 assert.throws(()=>linkedReturnCents({source_quantity:'3',amount:'5.99'},0n,10000n));
});
test('T22 UI merge retains historical relation and price-reference identities',()=>{
 const ctx={structuredClone,crypto:globalThis.crypto,SALES_CORE:{},PRODUCT_FINDER:{specs(){},search(){}}};ctx.window=ctx;vm.createContext(ctx);
 vm.runInContext(readFileSync(new URL('../frontend/sales-model.js',import.meta.url),'utf8'),ctx);
 const model=ctx.SALES_MODEL,base={...line,quantity:-1,skuId:sku,originalLineId:'ORIGINAL',warehouseId:'W'};
 const d={lines:[{...base,id:'R1'},{...base,id:'R2'}]};assert.equal(model.collapse(d).ok,true);assert.equal(d.lines.length,2);
 const refs={lines:[{...line,id:'A',referenceCents:21000},{...line,id:'B',referenceCents:22000}]};model.collapse(refs);assert.equal(refs.lines.length,2);
 const ordinary={lines:[{...line,id:'A'},{...line,id:'B'}]};model.collapse(ordinary);assert.equal(ordinary.lines.length,1);assert.equal(ordinary.lines[0].quantity,-4);
});
test('T22 pure return and pure outgoing require only the warehouse used by their side',()=>{
 const common={id:'unsaved-x',date:'2026-10-02',businessType:'退货/换货',storeId:'H',adjustmentCents:0,fundsRecords:[]};
 const ret=buildSaleBody({...common,warehouseId:'',returnWarehouseId:'IN-W',lines:[line]},()=>p,product=>product.id);
 assert.equal(ret.header.source_warehouse_id,'IN-W');assert.equal(ret.header.return_warehouse_id,'IN-W');assert.equal(ret.header.outgoing_warehouse_id,undefined);
 const out=buildSaleBody({...common,warehouseId:'OUT-W',returnWarehouseId:'OLD-IN-W',lines:[{...line,quantity:1}]},()=>p,product=>product.id);
 assert.equal(out.header.source_warehouse_id,'OUT-W');assert.equal(out.header.return_warehouse_id,undefined);assert.equal(out.header.outgoing_warehouse_id,'OUT-W');
});
test('T22 actual editor exposes both warehouse controls and keeps legacy actions read-only',async()=>{
 const {JSDOM}=await import('jsdom'),dom=new JSDOM('<main id="page"></main>'),source=readFileSync(new URL('../frontend/sales-current.js',import.meta.url),'utf8');
 const extract=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
 const warehouses=[{id:'IN-W',name:'退入仓 QA'},{id:'OUT-W',name:'换出仓 QA'}],d={id:'DOC',date:'2026-10-02',status:'未审核',businessType:'退货/换货',warehouseId:'OUT-W',returnWarehouseId:'IN-W',lines:[line],revision:1,note:''};
 const ctx={document:dom.window.document,U:{doc:d,editing:true},D:{warehouses},S:{session:{permissions:['save']},catalog:{stores:[],staff:[],customers:[]}},
  A:{type:x=>x.businessType,audited:x=>x.status==='已审核',canAudit:()=>true,canReverse:()=>true},K:{},
  h:x=>String(x??''),b:(text,a,attrs='')=>`<button data-sale="${a}" ${attrs}>${text}</button>`,dirty:()=>false,stateClass:()=>'',statusLabel:x=>x.status,
  ENTITY_SELECT:{text:(xs,id,fallback)=>xs.find(x=>x.id===id)?.name||fallback},SALES_FUNDS_UI:{field:()=>''},adjustmentField:()=>'',dueField:()=>'',entrySections:()=>'',summary:()=>''};
 vm.createContext(ctx);vm.runInContext(extract('const canEdit=','let workTail=')+extract('function select(','function salesFacts(')+extract('function businessTypeField(','function changeType(')+extract('function editor(){','function update(){'),ctx);
 const page=dom.window.document.querySelector('#page');page.innerHTML=ctx.editor();
 assert.equal(page.querySelector('[data-sale-entity="returnWarehouseId"]').textContent,'退入仓 QA');assert.equal(page.querySelector('[data-sale-entity="warehouseId"]').textContent,'换出仓 QA');
 ctx.U.editing=false;d.readonly=true;d.status='已审核';d.auditWorkflow=true;page.innerHTML=ctx.editor();
 for(const action of ['save','audit','unaudit','delete-doc','edit','edit-linked-note'])assert.equal(page.querySelector(`[data-sale="${action}"]`),null);
 d.readonly=false;d.associationProtected=true;page.innerHTML=ctx.editor();assert.ok(page.querySelector('[data-sale="edit-linked-note"]'));
 dom.window.close();
});
