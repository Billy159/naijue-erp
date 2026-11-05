import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadContext } from '../../loading/read-scope.ts';
import { SalesEditorSession } from './editor-session.ts';
import { detail, receipt, result } from './fixtures.test-support.ts';
import { draftFromSalesDetail, validateSalesCommand } from './validation.ts';
import { compileSalesForm, salesFormInput } from './form-model.ts';
import type { SalesCommandDto } from './contracts.ts';

function historical(unknown: boolean) {
 const source = detail(), line = source.document.lines[0]!, settlement = source.document.settlements[0]!;
 return {...source, stockBasis:'CUTOFF_HISTORY' as const, document:{...source.document,
   header:{...source.document.header,businessType:'SALE' as const,grossAmount:'-200',orderDiscount:'0',netDue:'-200'},
   lines:[{...line,quantity:'-2',referencePrice:'100',dealPrice:'100',lineAmount:'-200',allocatedDiscount:'0',pricingRule:unknown?null:'UNIT_PRICE' as const,zeroConfirmed:unknown?null:false,isGift:unknown?null:false}],
   settlements:[{...settlement,direction:'REFUND' as const,amount:'200'}]}};
}
for(const unknown of [false,true]) test(`ordinary mounted editor retains signed historical facts and submits memo (${unknown?'unknown':'complete'} pricing)`,async()=>{
 const source=historical(unknown), accountId=source.document.header.createdByAccountId!, scope=new ReadContext({accountId,sessionRevision:'1',permissionRevision:'1'}).createScope('signed-sale-editor');
 const sent:SalesCommandDto[]=[];
 const session=new SalesEditorSession({scope,documentListProfile:'source-confirmed-ordinary-documents-v1',principal:{accountId,staffId:source.document.header.salespersonId!,hallId:source.document.header.hallId,loginName:'TEST',role:'ADMIN',authVersion:1},reader:{readDetail:async()=>source},client:{execute:async c=>{sent.push(c);return result(c)},receipt:async c=>receipt(c)},newRequestKey:()=> 'signed:memo',onAccessFailure:()=>{}});
 assert.equal(await session.openExisting(source.document.header.id),true); assert.ok(session.getSnapshot().command.editor?.draft); assert.equal(session.canUseExistingProposal,false);
 session.updateInput({...session.getSnapshot().input!,note:'memo'}); assert.equal(await session.save(),true); const c=sent[0]!; assert.ok(c.action==='SAVE'&&'draft' in c); assert.deepEqual(c.draft.lines,source.document.lines); assert.deepEqual(c.draft.settlements,source.document.settlements); assert.equal(c.draft.header.note,'memo');
 session.dispose();
});
test('signed historical SALE permits explicit economics/settlement edits but cannot become a new SALE',()=>{
 const source=historical(false), base=draftFromSalesDetail(source), input=salesFormInput(base);
 assert.equal(compileSalesForm(base,{...input,lines:input.lines.map(row=>({...row,quantity:'-3'}))}).ok,true);
 assert.equal(compileSalesForm(base,{...input,settlements:input.settlements.map(row=>({...row,amount:'3.00'}))}).ok,true);
 assert.throws(()=>validateSalesCommand({action:'SAVE',requestKey:'new:signed',expectedVersion:null,draft:base}));
 assert.throws(()=>draftFromSalesDetail({...source,stockBasis:'RUNTIME_LEDGER'}));
});
test('mixed signed rows and simultaneous RECEIVE/REFUND keep amounts, order and barcodes',()=>{
 const original=historical(true), first=original.document.lines[0]!, payment=original.document.settlements[0]!;
 const source={...original,document:{...original.document,header:{...original.document.header,grossAmount:'-150',netDue:'-150'},lines:[first,{...first,id:'00000000-0000-4000-8000-000000000042' as typeof first.id,lineNo:2,quantity:'1',referencePrice:'50',dealPrice:'50',lineAmount:'50'}],settlements:[payment,{...payment,id:'00000000-0000-4000-8000-000000000043' as typeof payment.id,lineNo:2,direction:'RECEIVE' as const,amount:'50'}]}};
 const base=draftFromSalesDetail(source),raw=salesFormInput(base),compiled=compileSalesForm(base,{...raw,note:'mixed memo'});assert.ok(compiled.ok);assert.deepEqual(compiled.draft.lines,source.document.lines);assert.deepEqual(compiled.draft.settlements,source.document.settlements);assert.equal(compiled.draft.header.netDue,'-150');
});
