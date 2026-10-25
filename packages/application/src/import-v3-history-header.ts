import { IMPORT_V2_TABLES } from './import-v2-contract.ts';
import { HISTORY_MAPPING_VERSION } from './history-storage-contract.ts';
import type { HistorySalesHeader, HistoryTransferHeader, ImportSourceEvidence, JsonObject } from './history-storage-contract.ts';
import { mapHistoryTemporal } from './history-temporal-mapping.ts';
import type { ExcelTemporalEvidence, HistoryTemporalResult } from './history-temporal-mapping.ts';
import { v2Cents, v2ApprovedCents } from './import-v2.ts';
import type { MoneyApproval } from './import-v2.ts';
import { stableImportId } from './inventory-cutoff-import.ts';
import { requestHash } from './request-hash.ts';
export type HistoryHeaderEntity = 'SALES_HEADER' | 'TRANSFER_HEADER';
export interface HistoryHeaderSelection {
  baseManifestSha256:string; selectionSha256:string; approvalSha256:string; entity:HistoryHeaderEntity;
  source:'BASE_V2'; path:'business/13历史销货单头.csv'|'business/16历史调拨单头.csv'; csvSha256:string;
}
export interface HeaderNativeBinding { sourceKey:string; nativeId:string }
/** Per-document decision authenticated by the original source-window owner. */
export interface HistoryBusinessHallOverlay {
  version:'USER_CONFIRMED_HISTORY_BUSINESS_HALL_OVERLAY_1';
  batchId:string;fixedSourceNamespace:string;selectionSha256:string;sourceKey:string;
  warehouseSourceKey:string;targetHallSourceKey:string;targetHallNativeId:string;
  sourceFileRef:string;sourceFileSha256:string;sheet:string;rowNo:string;originalBusinessHall:'';
  provenance:'MIGRATION_DERIVED';reason:'USER_CONFIRMED_WAREHOUSE_TO_BUSINESS_HALL';evidenceRef:string;
  decisionSource:{threadId:string;humanMessageId:string;continueMessageId:string;adoptionOwner:'C';
    scope:'ALL2471_WAREHOUSE_TO_BUSINESS_HALL_MAPPING_USER_CONFIRMED';originalBlankNotClaimedHistoricalFact:true};
}
export interface CreatorHallOverlay {
  evidenceRef:string; file:string; sheet:string; row:string; sourceId:string; documentNumber:string;
  personField:'营业员来源编号'|'原制单账号编号'; personId:string; uploadedWarehouseDerivedHall:string;
  candidateCreatorHall:string; provenance:'MIGRATION_DERIVED'|'UNKNOWN'; reason:string;
}
export interface HistoryHeaderInput {
  batchId:string; fixedSourceNamespace:string; selection:HistoryHeaderSelection; source:ImportSourceEvidence;
  /** Row-level authorizer must resolve these source IDs against this same selected batch. */
  bindings:Readonly<Record<string,HeaderNativeBinding|undefined>>;
  temporalEvidence?:Readonly<Record<string,ExcelTemporalEvidence|undefined>>;
  creatorHallOverlay:CreatorHallOverlay;
  /** Only the independently authenticated exact 32-cell approval set, not a blanket rounding flag. */
  moneyApprovals?:ReadonlyMap<string,MoneyApproval>;
  businessHallOverlay?:HistoryBusinessHallOverlay;
}
export interface PreparedHistoryHeader {
  batchId:string; fixedSourceNamespace:string; mappingVersion:typeof HISTORY_MAPPING_VERSION;
  selection:HistoryHeaderSelection; source:ImportSourceEvidence;
  entity:HistoryHeaderEntity; header:HistorySalesHeader|HistoryTransferHeader;
  /** Derived mapper metadata, separate so the authorizer can hash the exact unchanged source DTO. */
  fieldProvenance:JsonObject;
  temporal:Readonly<Record<string,HistoryTemporalResult>>; businessDateResolved:boolean;
  fingerprint:string; importReady:false; published:false;
}
const fail=(ok:unknown,code:string):void=>{if(!ok)throw Error(code);};
const uuid=(v:unknown):boolean=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const hash=(v:unknown):boolean=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const nonempty=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&!v.includes('\0');
const centsText=(n:bigint):string=>`${n<0n?'-':''}${(n<0n?-n:n)/100n}.${((n<0n?-n:n)%100n).toString().padStart(2,'0')}`;
function checkBusinessHallOverlay(s:ImportSourceEvidence,selection:HistoryHeaderSelection,namespace:string,o:HistoryBusinessHallOverlay):void {
  fail(o?.version==='USER_CONFIRMED_HISTORY_BUSINESS_HALL_OVERLAY_1'&&o.provenance==='MIGRATION_DERIVED'
    &&o.reason==='USER_CONFIRMED_WAREHOUSE_TO_BUSINESS_HALL'&&s.entityType==='SALES_HEADER'&&selection.entity==='SALES_HEADER'
    &&o.batchId===s.batchId&&o.fixedSourceNamespace===namespace&&o.selectionSha256===selection.selectionSha256
    &&o.sourceKey===s.sourceKey&&s.rawFields['来源编号']===s.sourceKey&&s.normalizedFields['来源编号']===s.sourceKey
    &&o.originalBusinessHall===''&&s.rawFields['所属厅来源编号']===''
    &&o.warehouseSourceKey===s.rawFields['仓库来源编号']&&o.warehouseSourceKey===s.normalizedFields['仓库来源编号']
    &&o.sourceFileRef===s.fileRef&&o.sourceFileSha256===s.sourceFileSha256&&o.sheet===s.sheet&&o.rowNo===s.rowNo
    &&nonempty(o.targetHallSourceKey)&&uuid(o.targetHallNativeId)&&nonempty(o.evidenceRef)
    &&nonempty(o.decisionSource?.threadId)&&nonempty(o.decisionSource?.humanMessageId)&&nonempty(o.decisionSource?.continueMessageId)
    &&o.decisionSource.adoptionOwner==='C'&&o.decisionSource.scope==='ALL2471_WAREHOUSE_TO_BUSINESS_HALL_MAPPING_USER_CONFIRMED'
    &&o.decisionSource.originalBlankNotClaimedHistoricalFact===true
    &&o.evidenceRef==='USER_DECISION:'+o.decisionSource.threadId+':'+o.decisionSource.humanMessageId+'#'+s.sourceKey,
    'HISTORY_HEADER_BUSINESS_HALL_OVERLAY');
}
/** New selected projection only. The canonical/raw cells and original IDs/hashes
 * stay unchanged; neither current warehouse hall nor creator is consulted. */
export function deriveApprovedBusinessHallSource(source:ImportSourceEvidence,selection:HistoryHeaderSelection,namespace:string,overlay:HistoryBusinessHallOverlay):ImportSourceEvidence {
  checkBusinessHallOverlay(source,selection,namespace,overlay);
  fail(source.normalizedFields['所属厅来源编号']==='','HISTORY_HEADER_BUSINESS_HALL_ALREADY_KNOWN');
  const derived=structuredClone(source);derived.normalizedFields['所属厅来源编号']=overlay.targetHallSourceKey;return derived;
}
/** Pure mapper only. It does not authenticate files, resolve identities, write SQL or publish. */
export function prepareV3HistoryHeader(input:HistoryHeaderInput):PreparedHistoryHeader {
  const {source:s,selection,batchId,fixedSourceNamespace}=structuredClone(input), n=s.normalizedFields, raw=s.rawFields;
  const entity=selection.entity, table=IMPORT_V2_TABLES.find(t=>t.entity===entity);
  fail(table&&['SALES_HEADER','TRANSFER_HEADER'].includes(entity)&&selection.path===table.file&&selection.source==='BASE_V2'
    &&[selection.baseManifestSha256,selection.selectionSha256,selection.approvalSha256,selection.csvSha256].every(hash),'HISTORY_HEADER_SELECTION');
  fail(uuid(batchId)&&s.batchId===batchId&&uuid(s.id)&&s.entityType===entity&&nonempty(fixedSourceNamespace)
    &&hash(s.sourceFileSha256)&&hash(s.rowSha256)&&nonempty(s.fileRef)&&nonempty(s.sheet)&&typeof s.rowNo==='string'&&/^[1-9]\d*$/.test(s.rowNo)
    &&BigInt(s.rowNo)<=9223372036854775807n,'HISTORY_HEADER_SOURCE');
  fail(Object.keys(n).length===table!.columns.length&&table!.columns.every(c=>Object.hasOwn(n,c.name)&&typeof n[c.name]==='string'
    &&(n[c.name] as string).length<=65536&&!(n[c.name] as string).includes('\0')&&(!c.required||c.logicalType==='DATE'||n[c.name]!=='')),'HISTORY_HEADER_COLUMNS');
  fail(n['来源编号']===s.sourceKey&&raw['来源编号']===s.sourceKey,'HISTORY_HEADER_ORIGINAL_ID');
  const businessHallOverlay=input.businessHallOverlay;
  if(businessHallOverlay){checkBusinessHallOverlay(s,selection,fixedSourceNamespace,businessHallOverlay);
    fail(n['所属厅来源编号']===businessHallOverlay.targetHallSourceKey,'HISTORY_HEADER_BUSINESS_HALL_DERIVATION');}
  const value=(field:string):string=>n[field] as string, nullable=(field:string):string|null=>value(field)===''?null:value(field);
  fail(s.fieldProvenance.schema_version===1&&s.fieldProvenance.fields&&typeof s.fieldProvenance.fields==='object'&&!Array.isArray(s.fieldProvenance.fields),'HISTORY_HEADER_PROVENANCE');
  const fields:JsonObject={};
  for(const c of table!.columns) {
    if(['创建厅归属来源','创建厅归属原因','原创建厅编号'].includes(c.name))continue;
    const original=raw[c.name];
    if(c.logicalType!=='MONEY')fail(original===n[c.name]||(!Object.hasOwn(raw,c.name)&&(!c.required||c.logicalType==='DATE')&&n[c.name]==='')
      ||(c.name==='所属厅来源编号'&&businessHallOverlay!==undefined&&original===''&&n[c.name]===businessHallOverlay.targetHallSourceKey),'HISTORY_HEADER_RAW_CHANGED');
    fields[c.name]={origin:original===undefined||original===''?'UNKNOWN':'ORIGINAL',reason:original===undefined?'ORIGINAL_KEY_ABSENT':original===''?'SOURCE_EMPTY':'SOURCE_PRESERVED',raw:original??null};
    if(c.name==='所属厅来源编号'&&businessHallOverlay)fields[c.name]={origin:'MIGRATION_DERIVED',reason:businessHallOverlay.reason,raw:'',evidence_ref:businessHallOverlay.evidenceRef,parsed:businessHallOverlay.targetHallSourceKey};
  }
  const binding=(field:string,optional=false):string|null=>{
    const key=value(field), b=input.bindings[field];
    if(key===''&&optional){fail(b===undefined,'HISTORY_HEADER_UNEXPECTED_BINDING');return null;}
    fail(key!==''&&b&&b.sourceKey===key&&uuid(b.nativeId),`HISTORY_HEADER_BINDING:${field}`);return b!.nativeId;
  };
  const statuses={'未审核':'DRAFT','已审核':'APPROVED','已作废':'VOID'} as const;
  fail(Object.hasOwn(statuses,value('原审核状态')),'HISTORY_HEADER_STATUS');
  const status=statuses[value('原审核状态') as keyof typeof statuses];
  const overlay=input.creatorHallOverlay, personField=entity==='SALES_HEADER'?'营业员来源编号':'原制单账号编号';
  fail(overlay&&nonempty(overlay.evidenceRef)&&overlay.file===s.fileRef&&overlay.sheet===s.sheet&&overlay.row===s.rowNo
    &&overlay.sourceId===s.sourceKey&&overlay.documentNumber===value('原单号')&&overlay.personField===personField
    &&overlay.personId===value(personField)&&overlay.uploadedWarehouseDerivedHall===(raw['原创建厅编号']??'')
    &&overlay.candidateCreatorHall===value('原创建厅编号')&&overlay.provenance===value('创建厅归属来源')
    &&overlay.reason===value('创建厅归属原因')&&nonempty(overlay.reason)
    &&['MIGRATION_DERIVED','UNKNOWN'].includes(overlay.provenance)
    &&((overlay.provenance==='UNKNOWN')===(overlay.candidateCreatorHall==='')),'HISTORY_HEADER_CREATOR_OVERLAY');
  const createdHall=binding('原创建厅编号',true);
  fields.created_hall_id={origin:overlay.provenance,reason:overlay.reason,raw:raw['原创建厅编号']??null,evidence_ref:overlay.evidenceRef,parsed:createdHall};
  const temporal:Record<string,HistoryTemporalResult>={};
  for(const field of ['业务日期','原创建时间','原修改时间','原审核时间']) {
    const evidence=input.temporalEvidence?.[field];
    if(evidence)fail(evidence.sourceFileSha256===s.sourceFileSha256&&evidence.sheet===s.sheet&&evidence.rowNo===s.rowNo
      &&evidence.field===field&&evidence.raw===value(field)&&evidence.cellRef.match(/[0-9]+$/)?.[0]===s.rowNo,'HISTORY_HEADER_TEMPORAL_EVIDENCE');
    const parsed=mapHistoryTemporal(value(field),field==='业务日期'?'DATE':'DATETIME',evidence);temporal[field]=parsed;
    fields[field]={origin:parsed.state==='UNKNOWN'?'UNKNOWN':'ORIGINAL',reason:parsed.reason,raw:parsed.raw,
      parse_state:parsed.state,precision:parsed.precision,encoding:parsed.encoding,parsed_date:parsed.date,
      parsed_local:parsed.local,parsed_instant:parsed.instant,evidence_ref:parsed.evidenceRef};
  }
  const money=(field:string):string=>{
    const normalized=value(field), original=raw[field];fail(typeof original==='string','HISTORY_HEADER_MONEY_ORIGINAL_REQUIRED');
    let cents:bigint;
    if(original===normalized)cents=v2Cents(normalized);
    else {
      fail(input.moneyApprovals,'HISTORY_HEADER_MONEY_APPROVAL_REQUIRED');
      cents=v2ApprovedCents({fileSha256:s.sourceFileSha256,sheet:s.sheet,row:s.rowNo,sourceId:s.sourceKey,field,rawValue:original as string,exactCentValue:normalized},input.moneyApprovals!);
      fields[field]={origin:'MIGRATION_DERIVED',reason:'EXACT_APPROVED_MONEY_CELL',raw:original as string,evidence_ref:'provenance/approved-money-tail-overlay.csv',parsed:centsText(cents)};
    }
    return centsText(cents);
  };
  const common={id:stableImportId(entity==='SALES_HEADER'?'history-sales-header':'history-transfer-header',fixedSourceNamespace,s.sourceKey),batchId,sourceRowId:s.id,
    version:1,number:value('原单号'),businessDate:temporal['业务日期']!.date,sourceStatus:status,note:nullable('备注'),
    createdBySourceKey:nullable('原制单账号编号'),approvedBySourceKey:nullable('原审核账号编号'),createdHallId:createdHall,
    createdHallProvenance:overlay.provenance,createdHallReason:overlay.reason,
    createdLocalAt:temporal['原创建时间']!.local,updatedLocalAt:temporal['原修改时间']!.local,approvedLocalAt:temporal['原审核时间']!.local,
    createdInstant:temporal['原创建时间']!.instant,updatedInstant:temporal['原修改时间']!.instant,approvedInstant:temporal['原审核时间']!.instant};
  let header:HistorySalesHeader|HistoryTransferHeader;
  if(entity==='SALES_HEADER') {
    const businessTypes={'销售':'SALE','退货':'RETURN','换货':'EXCHANGE'} as const;fail(Object.hasOwn(businessTypes,value('单据类型')),'HISTORY_HEADER_BUSINESS_TYPE');
    const businessType=businessTypes[value('单据类型') as keyof typeof businessTypes];
    header={...common,businessType,hallId:binding('所属厅来源编号')!,customerId:binding('客户来源编号')!,warehouseId:binding('仓库来源编号')!,salespersonId:binding('营业员来源编号',true),grossAmount:money('优惠前金额'),orderDiscount:money('整单优惠'),netDue:money('应结金额')};
    if(businessHallOverlay)fail(header.hallId===businessHallOverlay.targetHallNativeId,'HISTORY_HEADER_BUSINESS_HALL_NATIVE_BINDING');
  }else {
    const from=binding('调出仓来源编号')!,to=binding('调入仓来源编号')!;fail(from!==to,'HISTORY_HEADER_CONTRADICTORY_WAREHOUSE');
    header={...common,fromWarehouseId:from,toWarehouseId:to,createdRoleSource:nullable('原制单角色')};
  }
  const fieldProvenance:JsonObject={...s.fieldProvenance,schema_version:1,fields:{...(s.fieldProvenance.fields as JsonObject|undefined),...fields},history_header_mapping:{validator_version:'V3_HISTORY_HEADER_1',selection:selection as unknown as JsonObject},
    ...(businessHallOverlay?{business_hall_overlay:structuredClone(businessHallOverlay) as unknown as JsonObject}:{})};
  const source=s;
  return {batchId,fixedSourceNamespace,mappingVersion:HISTORY_MAPPING_VERSION,selection,source,entity,header,fieldProvenance,temporal,businessDateResolved:header.businessDate!==null,
    fingerprint:requestHash({selection,source,header,fieldProvenance,temporal}),importReady:false,published:false};
}
