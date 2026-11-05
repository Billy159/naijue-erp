import test from 'node:test';
import assert from 'node:assert/strict';
import { detail, uuid } from './fixtures.test-support.ts';
import { draftFromSalesDetail } from './validation.ts';
import { compileSalesForm, salesFormInput } from './form-model.ts';
function source(unknown=false, discount='0') {
 const d=detail(), first=d.document.lines[0]!;
 return {...d,stockBasis:'CUTOFF_HISTORY' as const,historicalSaleOrigin:{kind:'SIGNED_SALE' as const,originalOrderDiscount:discount},document:{...d.document,header:{...d.document.header,businessType:'SALE' as const,grossAmount:'700',orderDiscount:discount,netDue:(700n-BigInt(discount)).toString()},lines:[{...first,quantity:'10',dealPrice:'100',lineAmount:'1000',referencePrice:'100',allocatedDiscount:discount},{...first,id:entityId('salesLine',uuid(992)),lineNo:2,quantity:'-3',dealPrice:'100',lineAmount:'-300',referencePrice:null,allocatedDiscount:'0',...(unknown?{pricingRule:null,isGift:null,zeroConfirmed:null}: {})}],settlements:[{...d.document.settlements[0]!,direction:'RECEIVE' as const,amount:'700'}]}};
}
test('historical SALE changes one complete row while preserving another unknown signed row and actual net receipt',()=>{
 const base=draftFromSalesDetail(source(true)),input=salesFormInput(base);
 const result=compileSalesForm(base,{...input,lines:input.lines.map((row,i)=>i?row:{...row,quantity:'11'})});
 assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)return;
 assert.equal(result.draft.header.businessType,'SALE');assert.equal(result.draft.header.netDue,'800');
 assert.deepEqual(result.draft.lines[1],base.lines[1]);assert.deepEqual(result.draft.settlements,base.settlements);
});
test('historical signed SALE edits signed quantity and price without changing row identities',()=>{
 const base=draftFromSalesDetail(source()),input=salesFormInput(base);
 const result=compileSalesForm(base,{...input,lines:input.lines.map((row,i)=>i?{...row,quantity:'-4',dealPrice:'2.00'}:row)});
 assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)return;
 assert.equal(result.draft.header.netDue,'200');assert.deepEqual(result.draft.lines.map(x=>x.id),base.lines.map(x=>x.id));
});
test('historical signed discount remains exact on memo save without invented allocation',()=>{
 const base=draftFromSalesDetail(source(true,'25')),input=salesFormInput(base);
 const result=compileSalesForm(base,{...input,note:'保留原抹零'});assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)return;
 assert.equal(result.draft.header.orderDiscount,'25');assert.equal(result.draft.header.netDue,'675');assert.deepEqual(result.draft.lines,base.lines);
});
import { SalesProposalSession, salesProposalMoney } from '../../current-form/sales-proposal.ts';
import { ReadContext } from '../../loading/read-scope.ts';
import { entityId } from '../../../../../packages/domain/src/values.ts';
test('saved signed SALE proposal exposes economic edits, retains unknown line facts and missing method',()=>{
 const base=source(true), line=base.document.lines[0]!, ref=(id:string)=>({id,name:'合成',code:null,hallId:null,hallName:null,paymentMethodId:null,paymentMethodName:null});
 const scope=new ReadContext({accountId:uuid(1),sessionRevision:'1',permissionRevision:'1'}).createScope('signed');
 const session=new SalesProposalSession(scope,{} as never);
 const draft={historicalSaleOrigin:base.historicalSaleOrigin,businessType:'SALE' as const,businessDate:base.document.header.businessDate,note:'',orderDiscount:'0.00',hall:ref(base.document.header.hallId),customer:ref(base.document.header.customerId),salesperson:ref(base.document.header.salespersonId!),warehouse:{...ref(base.document.header.warehouseId),hallId:base.document.header.hallId},
 lines:base.document.lines.map(l=>({key:l.id,sourceLine:l,sourceSnapshot:l.snapshot,sku:{id:l.skuId,productId:entityId('product',uuid(900))},product:{id:entityId('product',uuid(900)),code:'合成',name:'合成',retailPrice:null,minimumPriceAvailability:'UNAVAILABLE' as const},quantity:l.quantity,dealPrice:'1.00',pricingRule:l.pricingRule,discount:'',isGift:l.isGift,zeroConfirmed:l.zeroConfirmed})),settlements:[]};
 assert.equal(session.initializeFromSaved(draft as never),true);session.updateLine(line.id,{quantity:'11'});
 const p=session.saveProposal(base.document.header.id,new Set(base.document.lines.map(l=>l.id)),new Set());assert.ok(p,JSON.stringify(session.getSnapshot().errors));
 assert.equal(p.businessType,'SALE');assert.equal(p.lines[1]!.pricingRule,null);assert.equal(p.lines[1]!.isGift,null);assert.equal(p.lines[0]!.quantity,'11');assert.deepEqual(p.settlements,[]);
 assert.equal(salesProposalMoney(session.getSnapshot().draft)?.netDueMinor,'800');session.dispose();scope.dispose();
});
test('approved historical discount ruling: economic edits keep original discount without guessed allocation',()=>{
 const base=draftFromSalesDetail(source(true,'25')),input=salesFormInput(base);
 const result=compileSalesForm(base,{...input,lines:input.lines.map((row,i)=>i?row:{...row,quantity:'11'})});assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)return;
 assert.equal(result.draft.header.netDue,'775');assert.equal(result.draft.header.orderDiscount,'25');assert.deepEqual(result.draft.lines.map(x=>x.allocatedDiscount),base.lines.map(x=>x.allocatedDiscount));
 assert.deepEqual(result.draft.settlements,base.settlements);
 assert.equal(compileSalesForm(base,{...input,orderDiscount:'0.00'}).ok,false);
});
test('historical missing settlement is shown unknown, never as zero or settled',()=>{
 const money=salesProposalMoney({businessType:'SALE',businessDate:'2026-11-02',note:'',orderDiscount:'0.00',hall:null,customer:null,salesperson:null,warehouse:null,lines:[],settlements:[],settlementFactsMissing:true});
 assert.equal(money?.settledMinor,null);assert.equal(money?.balanced,false);
});
test('changed historical unknown pricing saves explicit-price draft without invented intent',()=>{
 const base=source(true), ref=(id:string)=>({id,name:'合成',code:null,hallId:null,hallName:null,paymentMethodId:null,paymentMethodName:null});
 const scope=new ReadContext({accountId:uuid(1),sessionRevision:'1',permissionRevision:'1'}).createScope('incomplete-draft');
 const session=new SalesProposalSession(scope,{} as never);
 const draft={historicalSaleOrigin:base.historicalSaleOrigin,businessType:'SALE' as const,businessDate:base.document.header.businessDate,note:'',orderDiscount:'0.00',hall:ref(base.document.header.hallId),customer:ref(base.document.header.customerId),salesperson:null,warehouse:{...ref(base.document.header.warehouseId),hallId:base.document.header.hallId},
 lines:base.document.lines.map(l=>({key:l.id,sourceLine:l,sourceSnapshot:l.snapshot,sku:{id:l.skuId,productId:entityId('product',uuid(900))},product:{id:entityId('product',uuid(900)),code:'合成',name:'合成',retailPrice:null,minimumPriceAvailability:'UNAVAILABLE' as const},quantity:l.quantity,dealPrice:'1.00',pricingRule:l.pricingRule,discount:'',isGift:l.isGift,zeroConfirmed:l.zeroConfirmed})),settlements:[],settlementFactsMissing:true};
 assert.equal(session.initializeFromSaved(draft as never),true);session.updateLine(base.document.lines[1]!.id,{quantity:'-4'});
 assert.equal(salesProposalMoney(session.getSnapshot().draft)?.netDueMinor,'600');
 const p=session.saveProposal(base.document.header.id,new Set(base.document.lines.map(l=>l.id)),new Set());assert.ok(p,JSON.stringify(session.getSnapshot().errors));
 assert.equal(p.lines[1]!.quantity,'-4');assert.equal(p.lines[1]!.dealPrice,'1.00');assert.equal(p.lines[1]!.pricingRule,null);assert.equal(p.lines[1]!.isGift,null);assert.equal(p.lines[1]!.zeroConfirmed,null);assert.deepEqual(p.settlements,[]);
 assert.equal(salesProposalMoney(session.getSnapshot().draft)?.settledMinor,null);session.dispose();scope.dispose();
});
import { SalesEditorSession } from './editor-session.ts';
import { result, receipt } from './fixtures.test-support.ts';
for(const reopened of [false,true])test(`real existing editor ${reopened?'reopens all-positive origin':'initializes signed unknown rows'} and sends economic SAVE through ordinary proposal command`,async()=>{
 const original=source(true,reopened?'1500':'25');
 const base=reopened?{...original,document:{...original.document,header:{...original.document.header,grossAmount:'1300',netDue:'-200'},lines:original.document.lines.map((l,i)=>i?{...l,quantity:'3',lineAmount:'300'}:l)}}:original;
 // Active synthetic authentication is independent of nullable historical actor facts.
 const accountId=entityId('account',uuid(990)),staffId=entityId('staff',uuid(991));
 const scope=new ReadContext({accountId,sessionRevision:'1',permissionRevision:'1'}).createScope('existing-signed');
 const sent:any[]=[];let legacyPrepares=0;
 const sku={id:base.document.lines[0]!.skuId,productId:entityId('product',uuid(900)),productCode:'SYNTHETIC',productName:'Synthetic',colorId:uuid(901),colorName:'Synthetic color',fitId:uuid(902),fitName:'Synthetic fit',sizeId:uuid(903),sizeName:'Synthetic size',barcodeAvailability:'UNAVAILABLE'};
 const editor=new SalesEditorSession({scope,documentListProfile:'source-confirmed-ordinary-documents-v1',principal:{accountId,staffId,hallId:base.document.header.hallId,loginName:'TEST',role:'ADMIN',authVersion:1},reader:{readDetail:async()=>base} as never,
 existingReader:{readSavedEditSkuBatch:async()=>({skus:[sku],products:[]})} as never,existingPreparation:{prepareExisting:async()=>{legacyPrepares++;throw Error('Historical SAVE must use native ordinary proposal');}},
 client:{execute:async command=>{sent.push(command);return result(command);},receipt:async command=>receipt(command)},newRequestKey:()=> 'signed-ui:existing',onAccessFailure:()=>{}});
 assert.equal(await editor.openExisting(base.document.header.id),true);assert.equal(editor.canUseExistingProposal,true);
 const model=editor.prepareExistingDocument();assert.ok(model);await model.initialize();assert.equal(model.getSnapshot().phase,'ready');const proposal=model.getSnapshot().proposal!;
 assert.equal(proposal.preservesHistoricalSale,true);proposal.updateLine(base.document.lines[0]!.id,{quantity:'11',dealPrice:'2.00'});
 assert.equal(await model.save(),true,JSON.stringify(model.getSnapshot().notice));assert.equal(sent.length,1);assert.equal(legacyPrepares,0);
 assert.equal(sent[0].action,'SAVE');assert.equal(sent[0].expectedVersion,base.document.header.version);assert.equal(sent[0].proposal.businessType,'SALE');assert.equal(sent[0].proposal.orderDiscount,reopened?'15.00':'0.25');assert.equal(sent[0].proposal.lines[0].quantity,'11');assert.equal(sent[0].proposal.lines[0].dealPrice,'2.00');assert.equal(sent[0].proposal.lines[1].pricingRule,null);assert.equal(sent[0].proposal.lines[1].existingLineId,base.document.lines[1]!.id);assert.equal(sent[0].proposal.settlements.length,1);assert.equal(sent[0].proposal.settlements[0].amount,'7.00');
 editor.dispose();scope.dispose();
});
function historicalProposalForOrigin(reopened=false){
 const d=source(false,'500'),ref=(id:string)=>({id,name:'Synthetic',code:null,hallId:null,hallName:null,paymentMethodId:null,paymentMethodName:null});
 const lines=(reopened?[{...d.document.lines[0]!,quantity:'1',lineAmount:'100'}]:d.document.lines).map(l=>({key:l.id,sourceLine:l,sourceSnapshot:l.snapshot,sku:{id:l.skuId,productId:entityId('product',uuid(900))},product:{id:entityId('product',uuid(900)),code:'Synthetic',name:'Synthetic',retailPrice:null,minimumPriceAvailability:'UNAVAILABLE'},quantity:l.quantity,dealPrice:'1.00',pricingRule:l.pricingRule,discount:'',isGift:l.isGift,zeroConfirmed:l.zeroConfirmed}));
 return {businessType:'SALE',businessDate:d.document.header.businessDate,note:'',orderDiscount:'5.00',historicalSaleOrigin:{kind:'SIGNED_SALE',originalOrderDiscount:'500'},hall:ref(d.document.header.hallId),customer:ref(d.document.header.customerId),salesperson:null,warehouse:{...ref(d.document.header.warehouseId),hallId:d.document.header.hallId},lines,settlements:[],settlementFactsMissing:true};
}
for(const reopened of [false,true])test(`original signed-sale discount survives all-positive ${reopened?'reopen':'edit'} below retained discount`,()=>{
 const scope=new ReadContext({accountId:uuid(1),sessionRevision:'1',permissionRevision:'1'}).createScope('origin'),session=new SalesProposalSession(scope,{} as never),draft=historicalProposalForOrigin(reopened);
 assert.equal(session.initializeFromSaved(draft as never),true);if(!reopened){session.removeLine(draft.lines[1]!.key);session.updateLine(draft.lines[0]!.key,{quantity:'1'});}
 assert.equal(session.preservesHistoricalSale,true);assert.equal(salesProposalMoney(session.getSnapshot().draft)?.netDueMinor,'-400');
 assert.equal(session.setBusinessMode('RETURN_EXCHANGE'),false);assert.equal(session.setBusinessType('EXCHANGE'),false);
 const p=session.saveProposal(source().document.header.id,new Set(draft.lines.map(l=>l.key)),new Set());assert.ok(p,JSON.stringify(session.getSnapshot().errors));assert.equal(p.orderDiscount,'5.00');assert.equal(p.businessType,'SALE');assert.equal('historicalSaleOrigin' in p,false);
 session.setHeader({orderDiscount:'0.00'});assert.equal(session.saveProposal(source().document.header.id,new Set(draft.lines.map(l=>l.key)),new Set()),null);session.dispose();scope.dispose();
});
test('authenticated detail origin permits reopening preserved discount larger than all-positive subtotal, wrong origin rejected',()=>{
 const d=source(false,'500'),line={...d.document.lines[0]!,quantity:'1',lineAmount:'100'};
 const reopened={...d,document:{...d.document,header:{...d.document.header,grossAmount:'100',netDue:'-400'},lines:[line]}};
 const parsed=draftFromSalesDetail(reopened);assert.equal(parsed.header.netDue,'-400');assert.equal(parsed.header.orderDiscount,'500');
 assert.throws(()=>draftFromSalesDetail({...reopened,historicalSaleOrigin:{kind:'SIGNED_SALE',originalOrderDiscount:'499'}}));
 const {historicalSaleOrigin,...unproven}=reopened;assert.throws(()=>draftFromSalesDetail(unproven));
});
import { salesDetailResponse } from '../response-validation.ts';
test('historical origin detail wire accepts exact server projection only and never grants runtime or altered-discount exceptions',()=>{
 const d=source(false,'500'),query={salesId:d.document.header.id};
 assert.equal(salesDetailResponse(d,query).historicalSaleOrigin?.originalOrderDiscount,'500');
 for(const bad of [null,{kind:'SIGNED_SALE',originalOrderDiscount:'499'},{kind:'SIGNED_SALE',originalOrderDiscount:'0500'},{kind:'SIGNED_SALE',originalOrderDiscount:'500',allow:true},{kind:'ANY',originalOrderDiscount:'500'}])assert.throws(()=>salesDetailResponse({...d,historicalSaleOrigin:bad},query));
 assert.throws(()=>salesDetailResponse({...d,stockBasis:'RUNTIME_LEDGER'},query));
 assert.throws(()=>salesDetailResponse({...d,document:{...d.document,header:{...d.document.header,businessType:'EXCHANGE'}}},query));
 const {historicalSaleOrigin,...legacy}=d;assert.equal(salesDetailResponse(legacy,query).historicalSaleOrigin,undefined);
});
