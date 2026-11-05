import test from 'node:test';
import { entityId } from '../../../../packages/domain/src/values.ts';
import assert from 'node:assert/strict';
import { buildHistoricalSalesHallEvidence, buildHistoricalSalesHallEvidenceV2 } from '../../../../packages/application/src/historical-sales-hall-evidence.ts';
import { salesHallLabel, historicalHallFacts, validateHistoricalHall } from './historical-hall.ts';
import { salesDetailResponse, salesListResponse } from './response-validation.ts';
import { salesDocumentOutput } from '../components/document-output-contracts.ts';
import { normalSalesResponse, ordinarySalesResponse } from '../../demo-replica/frontend/runtime/documents/normal-list-reader.ts';
import { detail, result, receipt, uuid } from './commands/fixtures.test-support.ts';
import { summary } from './tests/fixtures.ts';
import { draftFromSalesDetail, validateSalesCommand, validateSalesDraft } from './commands/validation.ts';
import { compileSalesForm, salesFormInput } from './commands/form-model.ts';
import { SalesEditorSession } from './commands/editor-session.ts';
import { ReadContext } from '../loading/read-scope.ts';
import { SalesCommandError, type SalesCommandDto } from './commands/contracts.ts';
import type { SalesDetailDto, SalesListQuery } from './contracts.ts';
const query:SalesListQuery={filter:{startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:null},page:1,pageSize:20};
const evidence=(originalHallId:string|null,warehouseHallId:string|null)=>buildHistoricalSalesHallEvidence({originalHallId,warehouseId:uuid(13),warehouseHallId,warehouseVersion:warehouseHallId===null?null:3,capturedAt:warehouseHallId===null?null:'2026-11-05T03:00:00Z'});
function historical(hallId:string|null=null, proof=true):SalesDetailDto {const d=detail();return {...d,stockBasis:'CUTOFF_HISTORY',referenceNames:{...d.referenceNames,hallName:hallId===null?null:'推定厅'},document:{...d.document,header:{...d.document.header,hallId:hallId as SalesDetailDto['document']['header']['hallId']}},...(proof?{historicalHallEvidence:evidence(null,hallId),historicalHallDiffersFromCurrent:false}:{})};}
test('historical detail preserves null with or without new evidence; runtime null is rejected',()=>{
 for(const proof of [true,false]){const d=historical(null,proof);assert.strictEqual(salesDetailResponse(d,{salesId:d.document.header.id}),d);assert.throws(()=>salesDetailResponse({...d,stockBasis:'RUNTIME_LEDGER'},{salesId:d.document.header.id}));assert.equal(draftFromSalesDetail(d).header.hallId,null);}
 const d=historical(uuid(11));assert.strictEqual(salesDetailResponse(d,{salesId:d.document.header.id}),d);
 for(const patch of [{historicalHallDiffersFromCurrent:true},{historicalHallEvidence:{...d.historicalHallEvidence,original_hall_id:uuid(22)}},{historicalHallDiffersFromCurrent:undefined}])assert.throws(()=>salesDetailResponse({...d,...patch},{salesId:d.document.header.id}));
});
test('capture remains immutable when current pair changes and a truthful difference flag is required',()=>{
 const d=historical(uuid(11)),changed={...d,historicalHallDiffersFromCurrent:true,document:{...d.document,header:{...d.document.header,hallId:uuid(99) as typeof d.document.header.hallId}}};assert.strictEqual(salesDetailResponse(changed,{salesId:d.document.header.id}),changed);assert.equal(changed.historicalHallEvidence?.selected_hall_id,uuid(11));assert.match(salesHallLabel('新厅',uuid(99),d.historicalHallEvidence,true,true),/已调整/);assert.throws(()=>validateHistoricalHall(d.historicalHallEvidence,uuid(99),uuid(13),false));
});
test('normal and ordinary list codecs accept pending hall without relaxing filters or closed shapes',()=>{
 const row={...summary(),hallId:null,hallName:null,historicalHallEvidence:evidence(null,null),historicalHallDiffersFromCurrent:false};const native={page:1,pageSize:20,exactTotal:'1',items:[row]};assert.strictEqual(salesListResponse(native,query),native);
 assert.throws(()=>salesListResponse(native,{...query,filter:{...query.filter,hallIds:[summary().hallId]}}));
 const item={...row,dataset:'LIVE',batchId:null,documentId:row.id,effectiveVersion:row.version,productSummary:{productCount:'0',items:[],hasMore:false},categorySummary:{basis:'CURRENT',metric:'QUANTITY',categoryCount:'1',items:[{categoryId:null,categoryName:null,value:row.quantity}],hasMore:false}};
 const ordinary={profile:'ORDINARY_DOCUMENT_LIST_V1',page:1,pageSize:20,exactTotal:'1',readRevision:'a'.repeat(64),items:[item]};assert.strictEqual(ordinarySalesResponse(ordinary,query),ordinary);
 const totals={quantity:row.quantity,incomingQuantity:row.incomingQuantity,outgoingQuantity:row.outgoingQuantity,grossAmount:row.grossAmount,orderDiscount:row.orderDiscount,netDue:row.netDue};const normal={page:1,pageSize:20,exactTotal:'1',items:[item],historyCoverage:'NOT_PUBLISHED',totals};assert.strictEqual(normalSalesResponse(normal,query),normal);
 assert.throws(()=>ordinarySalesResponse({...ordinary,items:[{...item,actorHallId:uuid(11)}]},query));
});
test('labels and export keep original, derived, conflict, missing and adjusted values distinct',()=>{
 const derived=evidence(null,uuid(11)),conflict=evidence(uuid(99),uuid(11)),original=evidence(uuid(11),uuid(11));
 assert.match(salesHallLabel('A',uuid(11),derived),/推定/);assert.match(salesHallLabel('A',uuid(99),conflict),/保留原厅.*差异待核/);assert.match(salesHallLabel('A',uuid(11),original),/原单记录/);assert.match(salesHallLabel('A',uuid(11),undefined,true),/依据未记录/);assert.doesNotMatch(salesHallLabel('A',uuid(11),undefined,true),/原单记录/);
 assert.equal(historicalHallFacts(derived).find(([label])=>label==='原单营业厅编号')?.[1],null);
 const output=salesDocumentOutput(historical(uuid(11)));assert.match(output.metadata.find(([label])=>label==='营业厅')![1]!,/推定/);assert.ok(output.printMetadata?.some(([label])=>label==='仓库归属采集时间'));
});
function owner(d:SalesDetailDto,role:'ADMIN'|'SALESPERSON'='ADMIN', rejection:string|null=null) {const accountId=d.document.header.createdByAccountId!,scope=new ReadContext({accountId,sessionRevision:'1',permissionRevision:'1'}).createScope('hall-test'),sent:SalesCommandDto[]=[];const session=new SalesEditorSession({scope,documentListProfile:'source-confirmed-ordinary-documents-v1',principal:{accountId,staffId:uuid(90) as never,hallId:uuid(11) as never,loginName:'TEST',role,authVersion:1},reader:{readDetail:async()=>d},client:{execute:async command=>{sent.push(command);if(rejection)throw new SalesCommandError(rejection==='LINE_AMOUNT_MISMATCH'?'invalid-request':'conflict',rejection,'rejected',rejection==='LINE_AMOUNT_MISMATCH'?422:409);return result(command);},receipt:async command=>receipt(command)},newRequestKey:()=> 'hall:metadata',onAccessFailure:()=>{}});return {session,sent};}
test('unknown hall metadata SAVE retains null, exact economics, warehouse and no read evidence authority',async()=>{
 const d=historical(),{session,sent}=owner(d);await session.openExisting(d.document.header.id);assert.equal(session.canUseExistingProposal,false);const input=session.getSnapshot().input!;session.updateInput({...input,note:'备注'});assert.equal(await session.save(),true);const c=sent[0]!;assert.ok(c.action==='SAVE'&&'draft'in c);assert.equal(c.draft.header.hallId,null);assert.equal(c.draft.header.warehouseId,d.document.header.warehouseId);assert.deepEqual(c.draft.lines,d.document.lines);assert.deepEqual(c.draft.settlements,d.document.settlements);assert.equal(Object.hasOwn(c,'historicalHallEvidence'),false);assert.throws(()=>validateSalesCommand({...c,expectedVersion:null}));assert.throws(()=>validateSalesCommand({...c,historicalHallEvidence:d.historicalHallEvidence}));session.dispose();
});
test('unknown hall economics stay unchanged until an explicit valid hall/warehouse pair is selected',async()=>{
 const d=historical(),base=draftFromSalesDetail(d),raw=salesFormInput(base);assert.equal(compileSalesForm(base,{...raw,lines:raw.lines.map(row=>({...row,quantity:'-2'}))}).ok,false);assert.equal(compileSalesForm(base,{...raw,businessDate:'2026-11-05',note:'日期备注'}).ok,true);assert.throws(()=>validateSalesDraft(base));
 const {session,sent}=owner(d);await session.openExisting(d.document.header.id);const hall={id:uuid(11),name:'选择厅',code:null,hallId:entityId('hall',uuid(11)),hallName:'选择厅',paymentMethodId:null,paymentMethodName:null},warehouse={...hall,id:uuid(44),name:'选择仓'};assert.equal(session.applyHistoricalHallWarehouse(hall,{...warehouse,hallId:entityId('hall',uuid(99))}),false);assert.equal(session.applyHistoricalHallWarehouse(hall,warehouse),true);assert.equal(session.hasDirtyDraft,true);assert.equal(await session.save(),true);const c=sent[0]!;assert.ok(c.action==='SAVE'&&'draft'in c);assert.equal(c.draft.header.hallId,hall.id);assert.equal(c.draft.header.warehouseId,warehouse.id);assert.deepEqual(c.draft.lines,d.document.lines);assert.equal(d.document.header.hallId,null);assert.equal(d.historicalHallEvidence?.selected_hall_id,null);session.dispose();
 const denied=owner(d,'SALESPERSON');await denied.session.openExisting(d.document.header.id);assert.equal(denied.session.editable,false);assert.equal(denied.session.applyHistoricalHallWarehouse(hall,warehouse),false);assert.equal(denied.sent.length,0);denied.session.dispose();
});

test('server economic rejections keep explicit hall/warehouse selection and every prior amount without repair or retry',async()=>{
 for(const code of ['LINE_AMOUNT_MISMATCH','UNKNOWN_PRICING_FACTS','HISTORICAL_DISCOUNT_CHANGED']){
  const d=historical(),{session,sent}=owner(d,'ADMIN',code);await session.openExisting(d.document.header.id);
  const hall={id:uuid(11),name:'选择厅',code:null,hallId:entityId('hall',uuid(11)),hallName:'选择厅',paymentMethodId:null,paymentMethodName:null},warehouse={...hall,id:uuid(44),name:'选择仓'};
  assert.equal(session.applyHistoricalHallWarehouse(hall,warehouse),true);session.updateInput({...session.getSnapshot().input!,note:'保留输入'});const before=structuredClone(session.getSnapshot().input);
  assert.equal(await session.save(),false);assert.equal(sent.length,1);assert.equal(session.getSnapshot().command.write.phase,'rejected');assert.equal(session.getSnapshot().command.write.error?.code,code);assert.match(session.getSnapshot().command.notice!,/保留/);assert.deepEqual(session.getSnapshot().input,before);assert.deepEqual(session.getSnapshot().command.editor?.draft?.lines,d.document.lines);assert.equal(session.getSnapshot().command.editor?.draft?.header.hallId,hall.id);assert.equal(session.getSnapshot().command.editor?.draft?.header.warehouseId,warehouse.id);session.dispose();
 }
});

test('V2 readback displays original zero and dual halls separately from target positive version',()=>{
 const capture={capture_evidence_sha256:'a'.repeat(64),source_namespace:'qa:hall-v2',warehouse_source_key:'warehouse:1',runtime_warehouse_id:uuid(50),source_native_version:0,effective_version:0,runtime_hall_ids:[uuid(51),uuid(52)],captured_at:'2026-11-05T03:00:00Z',transaction_snapshot:'1:2:',relation_basis:'VERIFIED_SOURCE_CAPTURE'};
 const v=buildHistoricalSalesHallEvidenceV2({basis:'MIGRATION_DERIVED',original_hall_id:null,selected_hall_id:uuid(11),warehouse_id:uuid(13),target_snapshot:{warehouse_id:uuid(13),hall_id:uuid(11),version:1,captured_at:'2026-11-05T04:00:00Z'},source_capture:capture,identity_bridge:{evidence_sha256:'b'.repeat(64),record_key:'bridge:1'},resolution:{evidence_sha256:'c'.repeat(64),record_key:'resolution:1'},has_difference:true,review_required:false});
 const facts=historicalHallFacts(v),get=(key:string)=>facts.find(([label])=>label===key)?.[1];
 assert.equal(get('原单营业厅编号'),null);assert.equal(get('来源原生版本'),'0');assert.equal(get('来源有效版本'),'0');assert.equal(get('目标仓库版本'),'1');assert.equal(get('来源仓库所属厅编号'),capture.runtime_hall_ids.join('、'));
 assert.match(salesHallLabel('采用厅',uuid(11),v),/已确认.*推定/);assert.doesNotMatch(salesHallLabel('采用厅',uuid(11),v),/保留原厅|待核/);
 assert.match(get('营业厅差异')!,/来源存在多厅/);assert.match(get('营业厅复核状态')!,/已有明确/);
 assert.equal(validateHistoricalHall(v,uuid(11),uuid(13),false).format_version,'HISTORICAL_SALES_HALL_EVIDENCE_V2');
});
