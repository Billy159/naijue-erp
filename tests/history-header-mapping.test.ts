import test from 'node:test';
import assert from 'node:assert/strict';
import { mapHistoryTemporal } from '../packages/application/src/history-temporal-mapping.ts';
import type { ExcelTemporalEvidence } from '../packages/application/src/history-temporal-mapping.ts';
import { prepareV3HistoryHeader,deriveApprovedBusinessHallSource } from '../packages/application/src/import-v3-history-header.ts';
import type { HistoryHeaderInput,HistoryBusinessHallOverlay } from '../packages/application/src/import-v3-history-header.ts';
import { prepareV3HistoryHeaderChunk,validatePreparedHistoryHeaderChunk } from '../packages/application/src/import-v3-history-header-staging.ts';
import { v2MoneyApprovalSet } from '../packages/application/src/import-v2.ts';
import { IMPORT_V2_TABLES } from '../packages/application/src/import-v2-contract.ts';
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const hash='a'.repeat(64);
function excel(raw:string,field='业务日期'):ExcelTemporalEvidence{return {encoding:'EXCEL_SERIAL',dateSystem:'1900',cellType:'NUMBER',sourceFileSha256:hash,sheet:'header',rowNo:'2',field,raw,cellRef:'C2',styleIndex:5,numberFormat:field==='业务日期'?'yyyy-mm-dd':'yyyy-mm-dd hh:mm:ss',evidenceRef:'verified-xlsx-cell:original.xlsx!C2'};}
function fixture(entity:'SALES_HEADER'|'TRANSFER_HEADER'='TRANSFER_HEADER'):HistoryHeaderInput {
  const table=IMPORT_V2_TABLES.find(t=>t.entity===entity)!;
  const n:Record<string,string>=Object.fromEntries(table.columns.map(c=>[c.name,'']));
  Object.assign(n,{'来源编号':'legacy-doc','原单号':'0000123','业务日期':'2024-02-29','原审核状态':'已审核','创建厅归属来源':'UNKNOWN','创建厅归属原因':'UNKNOWN_ORIGINAL_CREATOR_UNMATCHED'});
  const bindings:HistoryHeaderInput['bindings']={};
  if(entity==='TRANSFER_HEADER')Object.assign(n,{'调出仓来源编号':'old-from','调入仓来源编号':'old-to','原制单角色':'旧角色不属当前角色'});
  else Object.assign(n,{'单据类型':'销售','所属厅来源编号':'old-hall','客户来源编号':'old-customer','仓库来源编号':'old-wh','优惠前金额':'10.00','整单优惠':'1','应结金额':'8.50'});
  for(const [i,field] of (entity==='TRANSFER_HEADER'?['调出仓来源编号','调入仓来源编号']:['所属厅来源编号','客户来源编号','仓库来源编号']).entries())Object.assign(bindings,{[field]:{sourceKey:n[field]!,nativeId:id(10+i)}});
  const raw:Record<string,string>={...n,'原创建厅编号':'uploaded-warehouse-derived-hall'};delete raw['创建厅归属来源'];delete raw['创建厅归属原因'];
  return {batchId:id(1),fixedSourceNamespace:'fixture',selection:{baseManifestSha256:hash,selectionSha256:hash,approvalSha256:hash,csvSha256:hash,source:'BASE_V2',entity,path:table.file as HistoryHeaderInput['selection']['path']},source:{id:id(2),batchId:id(1),entityType:entity,sourceKey:'legacy-doc',fileRef:'original.xlsx',sheet:'header',rowNo:'2',sourceFileSha256:hash,rowSha256:hash,rawFields:raw,normalizedFields:n,fieldProvenance:{schema_version:1,fields:{}}},bindings,creatorHallOverlay:{evidenceRef:'approved-creator-overlay.csv#row2',file:'original.xlsx',sheet:'header',row:'2',sourceId:'legacy-doc',documentNumber:'0000123',personField:entity==='SALES_HEADER'?'营业员来源编号':'原制单账号编号',personId:'',uploadedWarehouseDerivedHall:'uploaded-warehouse-derived-hall',candidateCreatorHall:'',provenance:'UNKNOWN',reason:'UNKNOWN_ORIGINAL_CREATOR_UNMATCHED'}};
}
const replace=(input:HistoryHeaderInput,field:string,value:string)=>{input.source.rawFields[field]=value;input.source.normalizedFields[field]=value;};
function businessHall(input:HistoryHeaderInput):HistoryBusinessHallOverlay {
  const s=input.source;
  return {version:'USER_CONFIRMED_HISTORY_BUSINESS_HALL_OVERLAY_1',batchId:input.batchId,fixedSourceNamespace:input.fixedSourceNamespace,
    selectionSha256:input.selection.selectionSha256,sourceKey:s.sourceKey,warehouseSourceKey:s.normalizedFields['仓库来源编号'] as string,
    targetHallSourceKey:'old-hall',targetHallNativeId:id(10),sourceFileRef:s.fileRef,sourceFileSha256:s.sourceFileSha256,sheet:s.sheet,rowNo:s.rowNo,
    originalBusinessHall:'',provenance:'MIGRATION_DERIVED',reason:'USER_CONFIRMED_WAREHOUSE_TO_BUSINESS_HALL',
    decisionSource:{threadId:'synthetic-human-thread',humanMessageId:'synthetic-decision',continueMessageId:'synthetic-continue',adoptionOwner:'C',scope:'ALL2471_WAREHOUSE_TO_BUSINESS_HALL_MAPPING_USER_CONFIRMED',originalBlankNotClaimedHistoricalFact:true},
    evidenceRef:'USER_DECISION:synthetic-human-thread:synthetic-decision#'+s.sourceKey};
}
test('approved business hall overlay derives normalized hall only, preserves raw identity/unknown creator, and survives original chunk revalidation',()=>{
  const input=fixture('SALES_HEADER');replace(input,'所属厅来源编号','');const original=structuredClone(input),overlay=businessHall(input);
  input.source=deriveApprovedBusinessHallSource(input.source,input.selection,input.fixedSourceNamespace,overlay);input.businessHallOverlay=overlay;
  const result=prepareV3HistoryHeader(input);assert.ok('hallId' in result.header);assert.equal(result.header.hallId,id(10));
  assert.equal(result.source.rawFields['所属厅来源编号'],'');assert.equal(result.source.normalizedFields['所属厅来源编号'],'old-hall');
  assert.equal(original.source.normalizedFields['所属厅来源编号'],'');assert.equal(result.source.id,original.source.id);assert.equal(result.source.rowSha256,original.source.rowSha256);
  assert.equal(result.header.createdHallId,null);assert.equal(result.header.createdBySourceKey,null);assert.equal(result.header.createdInstant,null);
  const fields=result.fieldProvenance.fields as Record<string,unknown>;assert.deepEqual(fields['所属厅来源编号'],{origin:'MIGRATION_DERIVED',reason:overlay.reason,raw:'',evidence_ref:overlay.evidenceRef,parsed:'old-hall'});
  const chunk=prepareV3HistoryHeaderChunk([input]);validatePreparedHistoryHeaderChunk(chunk);assert.equal(chunk.rows[0]!.prepared.fingerprint,result.fingerprint);
  assert.deepEqual(chunk.rows[0]!.input.businessHallOverlay,overlay);
});
test('approved business hall overlay refuses wrong source/warehouse/file position/UUID, known-hall overwrite and unrelated raw rewrites',()=>{
  for(const change of [(o:HistoryBusinessHallOverlay)=>o.sourceKey='OTHER',(o:HistoryBusinessHallOverlay)=>o.warehouseSourceKey='OTHER',
    (o:HistoryBusinessHallOverlay)=>o.rowNo='3',(o:HistoryBusinessHallOverlay)=>o.sourceFileSha256='b'.repeat(64),
    (o:HistoryBusinessHallOverlay)=>o.selectionSha256='b'.repeat(64)]){
    const input=fixture('SALES_HEADER');replace(input,'所属厅来源编号','');const o=businessHall(input);change(o);
    assert.throws(()=>deriveApprovedBusinessHallSource(input.source,input.selection,input.fixedSourceNamespace,o),/BUSINESS_HALL_OVERLAY/);
  }
  const known=fixture('SALES_HEADER');assert.throws(()=>deriveApprovedBusinessHallSource(known.source,known.selection,known.fixedSourceNamespace,businessHall(known)),/BUSINESS_HALL_OVERLAY/);
  const input=fixture('SALES_HEADER');replace(input,'所属厅来源编号','');const o=businessHall(input);input.source=deriveApprovedBusinessHallSource(input.source,input.selection,input.fixedSourceNamespace,o);input.businessHallOverlay=o;
  const missing=structuredClone(input);delete missing.businessHallOverlay;assert.throws(()=>prepareV3HistoryHeader(missing),/RAW_CHANGED/);
  const wrong=structuredClone(input);wrong.businessHallOverlay!.targetHallNativeId=id(999);assert.throws(()=>prepareV3HistoryHeader(wrong),/NATIVE_BINDING/);
  input.source.normalizedFields['备注']='UNAPPROVED';assert.throws(()=>prepareV3HistoryHeader(input),/RAW_CHANGED/);
});
test('calendar dates validate leap days and never infer midnight for DATETIME',()=>{
  assert.equal(mapHistoryTemporal('2024-02-29','DATE').date,'2024-02-29');
  assert.equal(mapHistoryTemporal('2023-02-29','DATE').state,'POLICY_REQUIRED');
  const approval=mapHistoryTemporal('2024-02-29','DATETIME');assert.equal(approval.state,'DATE_ONLY');assert.equal(approval.date,'2024-02-29');assert.equal(approval.local,null);assert.equal(approval.instant,null);
});
test('local timestamp never becomes UTC while explicit offset remains explicit',()=>{
  assert.equal(mapHistoryTemporal('2024-01-01 12:13:14.123456','DATETIME').instant,null);
  assert.equal(mapHistoryTemporal('2024-01-01T12:13:14+08:00','DATETIME').instant,'2024-01-01T12:13:14+08:00');
  assert.equal(mapHistoryTemporal('2024-01-01T12:13:14+14:30','DATETIME').state,'POLICY_REQUIRED');
  assert.equal(mapHistoryTemporal('2024-01-01T00:00:00','DATE').date,null);
});
test('Excel 1900 leap bug, 1904 epoch and missing cell evidence are explicit',()=>{
  assert.equal(mapHistoryTemporal('61','DATE',excel('61')).date,'1900-03-01');
  assert.equal(mapHistoryTemporal('59','DATE',excel('59')).date,'1900-02-28');
  assert.equal(mapHistoryTemporal('60','DATE',excel('60')).reason,'EXCEL_1900_FICTITIOUS_LEAP_DAY');
  assert.equal(mapHistoryTemporal('0','DATE',{...excel('0'),dateSystem:'1904'}).date,'1904-01-01');
  assert.equal(mapHistoryTemporal('45292','DATE').reason,'EXCEL_CELL_ENCODING_EVIDENCE_REQUIRED');
});
test('exact fractional serials decode locally, ambiguous precision and date fractions do not round',()=>{
  assert.equal(mapHistoryTemporal('45292.5','DATETIME',excel('45292.5','原创建时间')).local,'2024-01-01T12:00:00');
  assert.equal(mapHistoryTemporal('45292.5','DATE',excel('45292.5')).reason,'DATE_SERIAL_HAS_TIME_FRACTION');
  assert.equal(mapHistoryTemporal('45292.00000000001','DATETIME',excel('45292.00000000001','原创建时间')).reason,'SUBMICROSECOND_PRECISION_REQUIRES_DECISION');
  assert.equal(mapHistoryTemporal('2024-01-01T00:00:00.1234567','DATETIME').local,null);
  assert.equal(mapHistoryTemporal('2024-01-01T00:00:00.1234560','DATETIME').local,'2024-01-01T00:00:00.123456');
});
test('date-only Excel format does not fabricate a DATETIME time of day',()=>{
  const result=mapHistoryTemporal('45292','DATETIME',excel('45292'));
  assert.equal(result.state,'DATE_ONLY');assert.equal(result.local,null);assert.equal(result.date,'2024-01-01');
});
test('approved historical transfer keeps unknown actors/times/hall NULL and retains original role',()=>{
  const input=fixture(), original=structuredClone(input), result=prepareV3HistoryHeader(input);
  assert.equal(result.header.sourceStatus,'APPROVED');assert.equal(result.header.createdBySourceKey,null);assert.equal(result.header.approvedBySourceKey,null);
  assert.equal(result.header.createdHallId,null);assert.equal(result.header.approvedLocalAt,null);assert.equal(result.header.createdInstant,null);
  assert.equal('createdRoleSource' in result.header&&result.header.createdRoleSource,'旧角色不属当前角色');assert.equal(result.header.number,'0000123');
  assert.deepEqual(input,original);assert.equal(result.source.rawFields['原创建厅编号'],'uploaded-warehouse-derived-hall');assert.equal(result.importReady,false);
});
test('sales mapper preserves historical imbalance and nullable salesperson, no live recalculation',()=>{
  const result=prepareV3HistoryHeader(fixture('SALES_HEADER'));assert.ok('grossAmount' in result.header);
  assert.equal(result.header.grossAmount,'10.00');assert.equal(result.header.orderDiscount,'1.00');assert.equal(result.header.netDue,'8.50');assert.equal(result.header.salespersonId,null);
});
test('date-only approval preserves date provenance without blocking resolved business date',()=>{
  const input=fixture();replace(input,'原审核时间','2024-02-29');const result=prepareV3HistoryHeader(input);
  assert.equal(result.businessDateResolved,true);assert.equal(result.header.approvedLocalAt,null);assert.equal(result.temporal['原审核时间']!.date,'2024-02-29');
});
test('unresolved serial date stays NULL with targeted issue; verified cell evidence enables exact date',()=>{
  const input=fixture();replace(input,'业务日期','45292');let result=prepareV3HistoryHeader(input);assert.equal(result.header.businessDate,null);
  input.temporalEvidence={'业务日期':excel('45292')};result=prepareV3HistoryHeader(input);assert.equal(result.header.businessDate,'2024-01-01');
  input.temporalEvidence={'业务日期':{...excel('45292'),rowNo:'3'}};assert.throws(()=>prepareV3HistoryHeader(input),/TEMPORAL_EVIDENCE/);
});
test('unknown status/business enums, including prototype keys, are rejected rather than defaulted',()=>{
  for(const value of ['APPROVED','审核','__proto__']){const input=fixture();replace(input,'原审核状态',value);assert.throws(()=>prepareV3HistoryHeader(input),/STATUS/);}
  const input=fixture('SALES_HEADER');replace(input,'单据类型','__proto__');assert.throws(()=>prepareV3HistoryHeader(input),/BUSINESS_TYPE/);
});
test('binding mismatch, missing required sales hall, contradictory warehouses and stale overlay fail closed',()=>{
  const input=fixture();Object.assign(input.bindings,{'调入仓来源编号':input.bindings['调出仓来源编号']});assert.throws(()=>prepareV3HistoryHeader(input),/BINDING/);
  const same=fixture();Object.assign(same.bindings,{'调入仓来源编号':{sourceKey:'old-to',nativeId:id(10)}});assert.throws(()=>prepareV3HistoryHeader(same),/CONTRADICTORY_WAREHOUSE/);
  const sales=fixture('SALES_HEADER');replace(sales,'所属厅来源编号','');assert.throws(()=>prepareV3HistoryHeader(sales),/BINDING/);
  const stale=fixture();stale.creatorHallOverlay.row='3';assert.throws(()=>prepareV3HistoryHeader(stale),/CREATOR_OVERLAY/);
});
test('unapproved money tail and original field change cannot silently normalize',()=>{
  const input=fixture('SALES_HEADER');input.source.rawFields['优惠前金额']='10.00000001';assert.throws(()=>prepareV3HistoryHeader(input),/MONEY_APPROVAL/);
  const changed=fixture();changed.source.normalizedFields['原单号']='changed';assert.throws(()=>prepareV3HistoryHeader(changed),/RAW_CHANGED/);
});

test('missing business date remains unknown and not publishable rather than fabricated',()=>{
  const input=fixture();replace(input,'业务日期','');delete input.source.rawFields['业务日期'];
  const result=prepareV3HistoryHeader(input);assert.equal(result.header.businessDate,null);assert.equal(result.businessDateResolved,false);assert.equal(result.temporal['业务日期']!.state,'UNKNOWN');
});
test('approved creator hall carries migration-derived evidence, not a warehouse-derived fallback',()=>{
  const input=fixture('SALES_HEADER');replace(input,'营业员来源编号','old-person');
  input.source.normalizedFields['原创建厅编号']='old-creator-hall';input.source.normalizedFields['创建厅归属来源']='MIGRATION_DERIVED';
  input.source.normalizedFields['创建厅归属原因']='MIGRATION_DERIVED_CURRENT_EMPLOYEE_HALL';
  Object.assign(input.bindings,{'营业员来源编号':{sourceKey:'old-person',nativeId:id(20)},'原创建厅编号':{sourceKey:'old-creator-hall',nativeId:id(21)}});
  Object.assign(input.creatorHallOverlay,{personId:'old-person',candidateCreatorHall:'old-creator-hall',provenance:'MIGRATION_DERIVED',reason:'MIGRATION_DERIVED_CURRENT_EMPLOYEE_HALL'});
  const result=prepareV3HistoryHeader(input);assert.equal(result.header.createdHallId,id(21));assert.equal(result.header.createdHallProvenance,'MIGRATION_DERIVED');
  assert.equal((result.fieldProvenance.fields as Record<string,Record<string,unknown>>).created_hall_id!.evidence_ref,'approved-creator-overlay.csv#row2');
});
test('only exact independently matched 32-cell approval can carry a money tail',()=>{
  const input=fixture('SALES_HEADER');input.source.rawFields['优惠前金额']='10.00000000001';
  const approved={fileSha256:hash,sheet:'header',row:'2',sourceId:'legacy-doc',field:'优惠前金额',rawValue:'10.00000000001',exactCentValue:'10.00'};
  const approvals=[approved,...Array.from({length:31},(_,i)=>({...approved,row:String(i+3),sourceId:`other-${i}`}))];
  input.moneyApprovals=v2MoneyApprovalSet(approvals,approvals);const result=prepareV3HistoryHeader(input);
  assert.ok('grossAmount' in result.header);assert.equal(result.header.grossAmount,'10.00');assert.equal(result.source.rawFields['优惠前金额'],'10.00000000001');
  input.source.rawFields['优惠前金额']='10.00000000002';assert.throws(()=>prepareV3HistoryHeader(input),/MONEY_CELL_NOT_APPROVED/);
});
