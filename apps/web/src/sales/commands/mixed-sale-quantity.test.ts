import test from 'node:test';
import assert from 'node:assert/strict';
import {draft,detail,uuid} from './fixtures.test-support.ts';
import {validateSalesCommand,draftFromSalesDetail} from './validation.ts';
import {entityId} from '../../../../../packages/domain/src/values.ts';
import {compileSalesForm,salesFormInput} from './form-model.ts';
const mixed=()=>{const source=draft(),first=source.lines[0]!;return {...source,header:{...source.header,businessType:'SALE' as const,grossAmount:'100',orderDiscount:'0',netDue:'100'},lines:[{...first,quantity:'2',dealPrice:'100',referencePrice:'100',lineAmount:'200',allocatedDiscount:'0',pricingRule:'UNIT_PRICE' as const,discountTenths:null,isGift:false,zeroConfirmed:false},{...first,id:uuid(998),lineNo:2,quantity:'-1',dealPrice:'100',referencePrice:'100',lineAmount:'-100',allocatedDiscount:'0',pricingRule:'UNIT_PRICE' as const,discountTenths:null,isGift:false,zeroConfirmed:false}]};};
test('new complete mixed SALE transport accepts quantity signs but rejects discount and pure negative SALE',()=>{
 const d=mixed();assert.deepEqual(validateSalesCommand({action:'SAVE',requestKey:'new:mixed',expectedVersion:null,draft:d}),{action:'SAVE',requestKey:'new:mixed',expectedVersion:null,draft:d});
 assert.throws(()=>validateSalesCommand({action:'SAVE',requestKey:'new:mixed',expectedVersion:null,draft:{...d,header:{...d.header,orderDiscount:'1',netDue:'99'}}}));
 const negative={...d,header:{...d.header,grossAmount:'-100',netDue:'-100'},lines:[d.lines[1]!]};assert.throws(()=>validateSalesCommand({action:'SAVE',requestKey:'new:mixed',expectedVersion:null,draft:negative}));
});
test('saved runtime mixed SALE can reopen and preserve original row identities',()=>{
 const d=mixed(),source=detail(),read={...source,stockBasis:'RUNTIME_LEDGER' as const,document:{...source.document,header:{...source.document.header,businessType:'SALE' as const,grossAmount:d.header.grossAmount,orderDiscount:d.header.orderDiscount,netDue:d.header.netDue},lines:d.lines.map(row=>({...source.document.lines[0]!,id:entityId('salesLine',row.id),lineNo:row.lineNo,quantity:row.quantity,dealPrice:row.dealPrice,referencePrice:row.referencePrice,lineAmount:row.lineAmount,allocatedDiscount:row.allocatedDiscount,pricingRule:row.pricingRule,discountTenths:row.discountTenths,isGift:row.isGift,zeroConfirmed:row.zeroConfirmed})),settlements:source.document.settlements}};
 const loaded=draftFromSalesDetail(read);assert.deepEqual(loaded.lines,d.lines);assert.deepEqual(compileSalesForm(loaded,{...salesFormInput(loaded),note:'mixed memo'}),{ok:true,draft:{...loaded,header:{...loaded.header,note:'mixed memo'}}});
 assert.throws(()=>draftFromSalesDetail({...read,document:{...read.document,header:{...read.document.header,orderDiscount:'1',netDue:'99'}}}));
});
test('editing a positive SALE to mixed keeps both rows and requires zero order discount',()=>{
 const d=mixed(),positive={...d,header:{...d.header,grossAmount:'300',netDue:'300'},lines:d.lines.map(line=>({...line,quantity:'1',lineAmount:'100'}))};positive.header.grossAmount='200';positive.header.netDue='200';
 const input=salesFormInput(positive),result=compileSalesForm(positive,{...input,lines:input.lines.map((row,index)=>({...row,quantity:index?'-1':'1'}))});assert.equal(result.ok,true,JSON.stringify(result));if(result.ok){assert.deepEqual(result.draft.lines.map(row=>row.quantity),['1','-1']);assert.equal(result.draft.header.netDue,'0');}
 const invalid=compileSalesForm(positive,{...input,orderDiscount:'0.01',lines:input.lines.map((row,index)=>({...row,quantity:index?'-1':'1'}))});assert.equal(invalid.ok,false);if(!invalid.ok)assert.match(Object.values(invalid.errors).join(' '),/正负明细.*整单优惠/);
});
