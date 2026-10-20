import {createHash} from 'node:crypto';
import {Pool,type PoolClient,type QueryResultRow} from 'pg';
import {databaseIdentifier as ident,readDatabaseConfig} from '../../database/config.js';
import {identityAssertionSql} from '../../database/identity.js';
import {passwordProvider} from '../../database/credentials.js';
import {databaseError} from '../../database/access-errors.js';
import {assertProductionSession} from '../../database/production-admission.js';
import type {CurrentQuantityIdentity} from '../inventory/current-export-identity.js';
import {createReadStream,readFileSync,writeFileSync,mkdtempSync,chmodSync,lstatSync,realpathSync} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {isAbsolute,resolve,join,relative,parse,dirname} from 'node:path';
import {historyDigest} from '../inventory/history-plan.js';
import {currentExportArtifactPath,currentExportLines,currentExportMethod,currentExportPolicy,type CurrentExportArtifact,type CurrentQuantityKey,type CurrentQuantityMapping} from '../inventory/current-export-plan.js';
import {assertProductionAdmission,productionTarget,type ProductionAdmission} from '../../database/production-admission.js';
import type {DatabaseConfig} from '../../database/config.js';
import {parseBusinessDay} from '../transactions/decimal.js';

type ObjectRow=Readonly<Record<string,unknown>>;
export const currentSourceContract=Object.freeze({schemaVersion:'T32-APPROVED-CURRENT-SOURCE-BINDING-v1',
  quantityPolicy:currentExportPolicy,quantityMethod:currentExportMethod,bindingKey:'sourceEndpointId',
  originalCanonicalNullable:true,originalUnknownSkuNullable:true,exactHistoricalTimelineClaimed:false,
  exactHistoricalCutoffClaimed:false,allInheritedCurrentSourceReadonly:true,auditAllowed:false,
  allocationOrder:'SIGNED_SYMBOLIC_PLAN_THEN_SAME_TARGET_ACTUAL_MAPPING_AND_DOCUMENT_RECEIPTS',
  modes:['SOURCE_ROW_OBSERVATION','BOUND_READONLY_CURRENT_DOCUMENT'],
  specNamespaces:['ORIGINAL_HISTORY','CURRENT_OBSERVED','CURRENT_CORRECTED']});
export const currentSourceContractSha256=historyDigest(currentSourceContract);
/** Additive material seam. Target allocation and physical entity writes belong to T33. */
export const currentSourceEntityMaterialContract=Object.freeze({schemaVersion:'T32-CURRENT-SOURCE-ENTITY-MATERIAL-v1',
  materialOwner:'T32',actualEntityOwner:'T33',input:'T50-EXACT-CURRENT-ENTITY-ATTRIBUTES-v1',
  identityBodyField:'entityAttributeRecord',proofBodyField:'entityAttributeEvidence',
  currentIdsAllocatedByMaterial:false,unknownFitDefaulted:false,unknownGroupInferred:false,
  registryIsPhysicalEntity:false,originalIdentityBodyPreserved:true});
export const currentSourceEntityMaterialContractSha256=historyDigest(currentSourceEntityMaterialContract);
export class CurrentSourceBodyError extends Error {
  constructor(readonly code:string){super(code);this.name='CurrentSourceBodyError';}
}
function fail(code:string):never {throw new CurrentSourceBodyError(code);}
/** Complete approved documents can contain many source rows. The cap includes the final LF. */
export const approvedCurrentSourceDocumentRowMaxBytes=16*1024*1024;
/** Only consume document/complete-archive references from the approved body manifest here. */
export async function* readApprovedCurrentSourceDocumentLines(root:string,artifact:CurrentExportArtifact):AsyncGenerator<{line:string;row:unknown;ordinal:number}> {
  yield* boundedCurrentSourceLines(root,artifact,approvedCurrentSourceDocumentRowMaxBytes,
    'CURRENT_SOURCE_DOCUMENT_ROW_TOO_LARGE_OR_EMPTY','CURRENT_SOURCE_DOCUMENT_JSONL_FINAL_NEWLINE_REQUIRED');
}
async function* boundedCurrentSourceLines(root:string,artifact:CurrentExportArtifact,maxBytes:number,oversizeCode:string,finalNewlineCode:string,
  onVerified?:(path:string,signature:string)=>void):AsyncGenerator<{line:string;row:unknown;ordinal:number}> {
  const path=await currentExportArtifactPath(root,artifact);
  const signature=streamFileSignature(path);
  const readDigest=createHash('sha256');
  const source=createReadStream(path),stream=path.endsWith('.gz')?source.pipe(createGunzip()):source;
  source.on('data',value=>readDigest.update(value as Buffer));
  source.on('error',error=>stream.destroy(error));
  const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});let parts:Buffer[]=[],bytes=0,ordinal=0;
  try {
    for await(const value of stream){
      const chunk=value as Buffer;let start=0;
      while(start<chunk.length){
        const end=chunk.indexOf(10,start),stop=end<0?chunk.length:end;
        const part=chunk.subarray(start,stop);
        if(bytes+part.length+1>maxBytes)fail(oversizeCode);
        if(part.length){parts.push(part);bytes+=part.length;}
        if(end<0)break;
        if(!bytes)fail(oversizeCode);
        const line=decoder.decode(Buffer.concat(parts,bytes))+'\n';parts=[];bytes=0;
        yield {line,row:JSON.parse(line) as unknown,ordinal:++ordinal};start=end+1;
      }
    }
    if(bytes)fail(finalNewlineCode);
    if(readDigest.digest('hex')!==artifact.sha256)fail('ORIGINAL_ARTIFACT_HASH_CHANGED');
    if(streamFileSignature(path)!==signature)fail('ORIGINAL_ARTIFACT_HASH_CHANGED');onVerified?.(path,signature);
  }finally{parts=[];stream.destroy();source.destroy();}
}
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const same=(a:unknown,b:unknown):boolean=>historyDigest(a)===historyDigest(b);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&!v.includes('\0');
const family=(v:unknown):boolean=>['SALE','TRANSFER_IN','TRANSFER_OUT','PURCHASE','STOCKTAKING_IN','STOCKTAKING_OUT'].includes(String(v));
export interface CurrentSourceProductMaterial extends ObjectRow {
  readonly id:string;readonly code:string;readonly key:string;readonly kind:string;readonly body:ObjectRow;
  readonly creationEvidence:ObjectRow|null;
}
export interface CurrentSourceOriginalVariantMaterial extends ObjectRow {
  readonly id:string;readonly product_id:string;readonly color_id:string;readonly size_id:string;
  readonly size_name:string;readonly group_name:string;readonly fit_id:string;readonly size_code:string;readonly created_at:string;
}
interface CurrentEntityAttributeBase extends ObjectRow {
  readonly kind:'SKU'|'WAREHOUSE';readonly targetKey:string;readonly existingId:string|null;
  readonly identityPlanOriginalEvidenceSha256:string;
}
export interface CurrentSourceRetainedVariantAttributes extends CurrentEntityAttributeBase {
  readonly kind:'SKU';readonly existingId:string;readonly stage:'KNOWN_ORIGINAL_ENTITY_REQUIRED_BEFORE_REGISTRY_ALLOCATION';
  readonly originalRuntimeVariant:CurrentSourceOriginalVariantMaterial;readonly originalRuntimeVariantEvidence:ObjectRow;
  readonly originalApprovalSha256:string;readonly newSkuIdRequired:false;readonly product:CurrentSourceProductMaterial;
  readonly productAlreadyInPhysicalSource:boolean;readonly oldFieldsOrIdsRewritten:false;
}
export interface CurrentSourceWarehouseEntityMaterial extends ObjectRow {
  readonly kind:'CURRENT_WAREHOUSE';readonly code:string;readonly name:string;readonly originalName:string;
  readonly hallCodes:readonly string[];readonly sourceEvidence:ObjectRow;readonly creationEvidence:ObjectRow;
  readonly originalWarehouseId:null;readonly hallIds:null;readonly hallIdsRequireActualNamespaceReadback:true;
}
interface CurrentSkuEntityMaterial extends ObjectRow {
  readonly productId:string;readonly productCode:string;readonly colorId:string;readonly colorCode:string;readonly colorName:string;
  readonly sizeId:string|null;readonly sizeCode:string;readonly sizeName:string;readonly sourceGroupLabel:string;
  readonly sourceGroupId:null;readonly fitId:'A'|'B'|null;readonly fitInferred:false;readonly newBusinessEnabled:false;
  readonly measurementUnits:readonly string[];
}
export interface CurrentSourceObservedEntityMaterial extends CurrentSkuEntityMaterial {
  readonly kind:'CURRENT_OBSERVED_SKU';readonly sizeId:string;readonly fitId:null;
  readonly fitSource:'NOT_EXPLICITLY_PROVIDED_FOR_THIS_SOURCE_SPEC';readonly originalSourceFacts:ObjectRow;
  readonly originalSourceProvidedSkuId:null;readonly t30CandidateDeterministicSkuId:string;
  readonly candidateIdOrigin:'T30_CLEANER_GENERATED_CANDIDATE_NOT_RAW_TPLUS_DATABASE_ID';readonly candidateMayBeUsedAsActualSkuId:false;
  readonly exactSourceColorDefinition:ObjectRow;readonly exactSourceSizeDefinition:ObjectRow;
  readonly exactSkuGroupIdentityInferredFromDisplay:false;
}
export interface CurrentSourceCorrectedEntityMaterial extends CurrentSkuEntityMaterial {
  readonly kind:'CURRENT_CORRECTED_SKU';readonly sizeId:null;readonly fitId:'A'|'B';readonly fitSource:'USER_APPROVED_T03_CURRENT_SPEC';
  readonly groupResolutionState:'SOURCE_LABEL_RETAINED_NO_GROUP_INFERENCE';readonly sourceLabelColumn:string;
  readonly exactPrimaryBarcode:string;readonly approvedCurrentSpecification:ObjectRow;readonly correctedSpec:ObjectRow;
  readonly previousOriginalFactsKeptSeparate:ObjectRow|null;readonly sizeUuidMustBeActualCurrentEntityStorageCoordinate:true;
  readonly previousHistoricalSkuOrDisplaySizeIdMaySubstitute:false;
}
interface CurrentNewEntityAttributeBase extends CurrentEntityAttributeBase {
  readonly existingId:null;readonly stage:'AFTER_T33_ACTUAL_REGISTRY_ALLOCATION_READBACK';readonly newTargetId:null;
  readonly originalHistoricalSkuId:null;readonly sourceIdentityRewritten:false;readonly currentIdentityPromotedAsHistorical:false;
}
export interface CurrentSourceWarehouseAttributes extends CurrentNewEntityAttributeBase {
  readonly kind:'WAREHOUSE';readonly entityMaterialization:CurrentSourceWarehouseEntityMaterial;
}
export interface CurrentSourceSkuAttributes extends CurrentNewEntityAttributeBase {
  readonly kind:'SKU';readonly identityKind:'CURRENT_TPLUS_SOURCE_SPEC_OBSERVATION'|'T03_CORRECTED_CURRENT_SPEC';
  readonly entityMaterialization:CurrentSourceObservedEntityMaterial|CurrentSourceCorrectedEntityMaterial;
  readonly canonicalProduct:CurrentSourceProductMaterial;readonly productAlreadyInPhysicalSource:boolean;
  readonly sourceQuantitySpecKey:string;readonly sourceEvidence:ObjectRow;readonly creationEvidence:ObjectRow|null;
  readonly oldWrapperAuthorizationFlagsUnchanged:true;
}
export type CurrentSourceEntityAttributes=CurrentSourceRetainedVariantAttributes|CurrentSourceWarehouseAttributes|CurrentSourceSkuAttributes;
export interface CurrentSourceEntityAttributeEvidence {
  readonly schemaVersion:'T32-CURRENT-SOURCE-ENTITY-ATTRIBUTE-EVIDENCE-v1';readonly contractSha256:string;
  readonly artifact:CurrentExportArtifact;readonly record:number;readonly recordSha256:string;readonly originalIdentityEvidenceSha256:string;
}
export interface CurrentSourceProductPrerequisites {
  readonly schemaVersion:'T50-APPROVED-CURRENT-PRODUCT-PREREQUISITES-v1';readonly products:readonly CurrentSourceProductMaterial[];
  readonly actualBusinessEntitiesMaterialized:false;readonly originalSourceFieldsUnchanged:true;readonly unknownFieldsNotDefaulted:true;
}
/** Pure, pre-allocation material validation. The caller must verify the signed artifact bytes first. */
export function validateCurrentSourceEntityAttributes(identity:CurrentQuantityIdentity,a:CurrentSourceEntityAttributes):void {
  if(a.kind!==identity.kind||a.targetKey!==identity.targetKey||a.existingId!==identity.existingId
    ||a.identityPlanOriginalEvidenceSha256!==identity.evidenceSha256||!sha(identity.evidenceSha256))fail('CURRENT_ENTITY_ATTRIBUTE_IDENTITY_MISMATCH');
  if(a.stage==='KNOWN_ORIGINAL_ENTITY_REQUIRED_BEFORE_REGISTRY_ALLOCATION'){
    const v=a.originalRuntimeVariant;
    if(!uuid(a.existingId)||!v||v.id!==a.existingId||![v.product_id,v.color_id,v.size_id].every(uuid)
      ||a.newSkuIdRequired!==false||a.oldFieldsOrIdsRewritten!==false||!sha(a.originalApprovalSha256)
      ||!a.product||a.product.id!==v.product_id||!a.originalRuntimeVariantEvidence)fail('CURRENT_ENTITY_RETAINED_ORIGINAL_CHANGED');
    return;
  }
  if(a.stage!=='AFTER_T33_ACTUAL_REGISTRY_ALLOCATION_READBACK'||a.existingId!==null||a.newTargetId!==null
    ||a.originalHistoricalSkuId!==null||a.sourceIdentityRewritten!==false||a.currentIdentityPromotedAsHistorical!==false)
    fail('CURRENT_ENTITY_GENERATED_ID_OR_HISTORY_CLAIM_REJECTED');
  if(a.kind==='WAREHOUSE'){
    const m=a.entityMaterialization;
    if(m.kind!=='CURRENT_WAREHOUSE'||identity.targetKey!=='WAREHOUSE:'+m.code||!text(m.code)||!text(m.name)
      ||identity.body['identityKind']!=='CONFIRMED_CURRENT_WAREHOUSE'
      ||m.originalWarehouseId!==null||m.hallIds!==null||m.hallIdsRequireActualNamespaceReadback!==true
      ||!Array.isArray(m.hallCodes)||!m.hallCodes.length||!m.hallCodes.every(text)||!m.sourceEvidence||!m.creationEvidence)
      fail('CURRENT_ENTITY_WAREHOUSE_MATERIAL_REQUIRED');
    return;
  }
  const m=a.entityMaterialization;
  if(!a.canonicalProduct||a.canonicalProduct.id!==m.productId||a.canonicalProduct.code!==m.productCode
    ||!uuid(m.productId)||!uuid(m.colorId)||!text(m.sizeName)||!text(m.sizeCode)||!text(m.sourceGroupLabel)
    ||m.sourceGroupId!==null||m.fitInferred!==false||m.newBusinessEnabled!==false
    ||!Array.isArray(m.measurementUnits)||!m.measurementUnits.length||!m.measurementUnits.every(text)
    ||!['CURRENT_TPLUS_SOURCE_SPEC_OBSERVATION','T03_CORRECTED_CURRENT_SPEC'].includes(a.identityKind)
    ||identity.body['identityKind']!==a.identityKind)fail('CURRENT_ENTITY_SKU_EXACT_ATTRIBUTES_REQUIRED');
  if(a.identityKind==='CURRENT_TPLUS_SOURCE_SPEC_OBSERVATION'){
    if(m.kind!=='CURRENT_OBSERVED_SKU'||m.fitId!==null||m.fitSource!=='NOT_EXPLICITLY_PROVIDED_FOR_THIS_SOURCE_SPEC'
      ||!uuid(m.sizeId)||m.originalSourceProvidedSkuId!==null||m.candidateMayBeUsedAsActualSkuId!==false
      ||m.candidateIdOrigin!=='T30_CLEANER_GENERATED_CANDIDATE_NOT_RAW_TPLUS_DATABASE_ID'
      ||m.exactSkuGroupIdentityInferredFromDisplay!==false||!same(m.originalSourceFacts,identity.body['sourceOriginalFacts'])
      ||m.originalSourceFacts['product']!==m.productCode||m.originalSourceFacts['color']!==m.colorCode
      ||m.originalSourceFacts['sourceCode']!==m.sizeCode||m.originalSourceFacts['sourceSize']!==m.sizeName
      ||m.originalSourceFacts['sourceGroup']!==m.sourceGroupLabel
      ||m.t30CandidateDeterministicSkuId!==identity.body['t30CandidateDeterministicSkuId']
      ||!m.exactSourceColorDefinition||!m.exactSourceSizeDefinition
      ||m.exactSourceColorDefinition['id']!==m.colorId||m.exactSourceColorDefinition['code']!==m.colorCode
      ||m.exactSourceColorDefinition['name']!==m.colorName||m.exactSourceSizeDefinition['id']!==m.sizeId
      ||m.exactSourceSizeDefinition['code']!==m.sizeCode||m.exactSourceSizeDefinition['name']!==m.sizeName)
      fail('CURRENT_ENTITY_OBSERVED_UNKNOWN_OR_SOURCE_FACTS_CHANGED');
  }else{
    if(m.kind!=='CURRENT_CORRECTED_SKU'||m.sizeId!==null||!['A','B'].includes(m.fitId)
      ||m.fitSource!=='USER_APPROVED_T03_CURRENT_SPEC'||m.groupResolutionState!=='SOURCE_LABEL_RETAINED_NO_GROUP_INFERENCE'
      ||m.sizeUuidMustBeActualCurrentEntityStorageCoordinate!==true||m.previousHistoricalSkuOrDisplaySizeIdMaySubstitute!==false
      ||!m.approvedCurrentSpecification||!m.correctedSpec||m.approvedCurrentSpecification['fit']!==m.fitId||m.correctedSpec['fit']!==m.fitId
      ||m.correctedSpec['newBarcode']!==m.exactPrimaryBarcode||m.correctedSpec['productId']!==m.productId
      ||!text(m.exactPrimaryBarcode)||!same(m.previousOriginalFactsKeptSeparate,identity.body['sourceOriginalFacts']))
      fail('CURRENT_ENTITY_APPROVED_CORRECTION_CHANGED');
    const color=m.approvedCurrentSpecification['color'] as ObjectRow|undefined,size=m.approvedCurrentSpecification['size'] as ObjectRow|undefined;
    if(!color||!size||color['id']!==m.colorId||color['code']!==m.colorCode||color['name']!==m.colorName
      ||size['name']!==m.sizeName||size['registeredBarcodeSizeSegment']!==m.sizeCode
      ||m.approvedCurrentSpecification['nativeGroupId']!==null||m.correctedSpec['color']!==m.colorName
      ||m.correctedSpec['size']!==m.sizeName||m.correctedSpec['productCode']!==m.productCode)
      fail('CURRENT_ENTITY_APPROVED_COLOR_OR_SIZE_CHANGED');
  }
}
/** Create a successor identity body; original files/evidence and all source fields remain separate and unchanged. */
export function attachCurrentSourceEntityAttributes(identity:CurrentQuantityIdentity,a:CurrentSourceEntityAttributes,
  artifact:CurrentExportArtifact,record:number):CurrentQuantityIdentity {
  validateCurrentSourceEntityAttributes(identity,a);
  if(!text(artifact.file)||!sha(artifact.sha256)||!Number.isSafeInteger(record)||record<1
    ||Object.hasOwn(identity.body,'entityAttributeRecord')||Object.hasOwn(identity.body,'entityAttributeEvidence'))fail('CURRENT_ENTITY_EXACT_INPUT_REFERENCE_REQUIRED');
  const proof:CurrentSourceEntityAttributeEvidence={schemaVersion:'T32-CURRENT-SOURCE-ENTITY-ATTRIBUTE-EVIDENCE-v1',
    contractSha256:currentSourceEntityMaterialContractSha256,artifact:structuredClone(artifact),record,
    recordSha256:historyDigest(a),originalIdentityEvidenceSha256:identity.evidenceSha256};
  const body={...structuredClone(identity.body),entityAttributeRecord:structuredClone(a),entityAttributeEvidence:proof};
  return {...structuredClone(identity),body,evidenceSha256:historyDigest(body)};
}
/** T33 consumes exactly the frozen attributes; this return value is never an actual entity receipt. */
export function readCurrentSourceEntityAttributes(identity:CurrentQuantityIdentity):CurrentSourceEntityAttributes {
  const a=identity.body['entityAttributeRecord'] as CurrentSourceEntityAttributes|undefined;
  const e=identity.body['entityAttributeEvidence'] as CurrentSourceEntityAttributeEvidence|undefined;
  if(!a||!e||e.schemaVersion!=='T32-CURRENT-SOURCE-ENTITY-ATTRIBUTE-EVIDENCE-v1'
    ||e.contractSha256!==currentSourceEntityMaterialContractSha256||historyDigest(identity.body)!==identity.evidenceSha256
    ||historyDigest(a)!==e.recordSha256||!sha(e.artifact?.sha256)||!text(e.artifact.file)
    ||!Number.isSafeInteger(e.record)||e.record<1)fail('CURRENT_ENTITY_FROZEN_ATTRIBUTE_MATERIAL_REQUIRED');
  validateCurrentSourceEntityAttributes({...identity,evidenceSha256:e.originalIdentityEvidenceSha256},a);
  return structuredClone(a);
}
export interface CurrentSourceEndpoint extends ObjectRow {
  readonly schemaVersion:'T35-SELECTED-SOURCE-ENDPOINT-v1';readonly sourceEndpointId:string;readonly lineId:string;
  readonly sourceCanonicalEventId:string|null;readonly sourceFamily:string;
  readonly quantityDimensionKey:CurrentQuantityKey;readonly originalSourceDimensionKey:CurrentQuantityKey;
  readonly measurementUnit:string;readonly currentObservedState:string|null;
  readonly historicalStateTimelineConfirmed:false;readonly historicalStateAtExactCutoffConfirmed:false;
  readonly quantitySelectionPolicy:string;readonly missingHistoricalEventIdentityFabricated:false;readonly sourceForeignKeyChanged:false;
  readonly source:ObjectRow;readonly sourceNumber?:string|null;
}
export type CurrentSpecNamespace='ORIGINAL_HISTORY'|'CURRENT_OBSERVED'|'CURRENT_CORRECTED';
export interface CurrentQuantityReference {
  readonly sourceQuantityKey:CurrentQuantityKey;readonly runtimeWarehouseKey:string;readonly runtimeSkuKey:string;
  readonly identityKind:CurrentQuantityMapping['identityKind'];readonly warehouseHistoricalOriginalId:string|null;
  readonly sourceHistoricalOriginalSkuId:string|null;
}
export interface CurrentSourceDocumentReference {
  readonly sourceGroupKey:string;readonly archiveRevision:number;readonly bodySha256:string;readonly documentProofSha256:string;
}
export interface CurrentSourceBindingPlan {
  readonly schemaVersion:'T32-CURRENT-SOURCE-ENDPOINT-BINDING-PLAN-v1';readonly sourceEndpointId:string;readonly lineId:string;
  readonly sourceCanonicalEventId:string|null;readonly sourceFamily:string;readonly sourceEndpointSha256:string;
  readonly originalHistoricalSkuId:string|null;readonly specNamespace:CurrentSpecNamespace;
  readonly quantityReference:CurrentQuantityReference;
  readonly mode:'SOURCE_ROW_OBSERVATION'|'BOUND_READONLY_CURRENT_DOCUMENT';readonly document:CurrentSourceDocumentReference|null;
  readonly readonly:true;readonly auditAllowed:false;readonly uncertainties:readonly string[];
}
export interface CurrentSourceDocumentPlan {
  readonly schemaVersion:'T32-CURRENT-SOURCE-DOCUMENT-PLAN-v1';readonly sourceGroupKey:string;
  readonly documentType:'SALE'|'TRANSFER'|'PURCHASE';readonly sourceNumber:string;readonly businessDate:string|null;
  readonly originalDocumentId:string|null;readonly originalHistoricalRevision:string|null;
  readonly currentObservedState:string|null;readonly archiveRevision:number;readonly bodySha256:string;
  readonly body:{readonly header:ObjectRow;readonly lines:readonly ObjectRow[];readonly fundsRecords:readonly ObjectRow[]};
  readonly sourceEndpointIds:readonly string[];readonly lineIds:readonly string[];
  readonly groupingEvidence:CurrentExportArtifact & {readonly row:number;readonly kind:'CONFIRMED_COMPLETE_CURRENT_EXPORT_GROUP'};
  readonly originalArchiveEvidence:CurrentExportArtifact & {readonly row:number};
  readonly completeSourceLinesAndSettlements:true;readonly historicalStateTimelineConfirmed:false;
  readonly historicalStateAtExactCutoffConfirmed:false;readonly readonly:true;readonly auditAllowed:false;
}
export interface CurrentSourceObservation {
  readonly schemaVersion:'T32-CURRENT-SOURCE-ROW-v1';readonly endpoint:CurrentSourceEndpoint;
  readonly originalFields:ObjectRow;readonly originalFieldsSha256:string;
}
export interface ApprovedCurrentSourceBodies {
  readonly schemaVersion:'T32-APPROVED-CURRENT-SOURCE-BODIES-v1';readonly dataClass:'USER_APPROVED_CURRENT_SOURCE';
  readonly productionAuthorized:true;readonly contractSha256:string;readonly target:ReturnType<typeof productionTarget>;
  readonly t30BatchId:string;readonly t32BatchId:string;readonly sourceEndpoints:CurrentExportArtifact;
  readonly bindings:CurrentExportArtifact;readonly observations:CurrentExportArtifact;readonly documents:CurrentExportArtifact;
  readonly quantityIdentityPlan:CurrentExportArtifact;readonly retainedMasterMaterial:CurrentExportArtifact;
  readonly counts:{readonly sourceEndpoints:number;readonly quantityKeys:number;readonly observations:number;readonly documents:number};
}
export interface CurrentSourceMaterialization {
  readonly schemaVersion:'T32-CURRENT-SOURCE-LATE-MATERIALIZATION-v1';readonly target:ReturnType<typeof productionTarget>;
  readonly bodyApprovalManifestSha256:string;readonly quantityIdentityPlanSha256:string;
  readonly quantityMappings:readonly CurrentQuantityMapping[];
}
export interface CurrentSourceActualDocument {
  readonly sourceGroupKey:string;readonly documentId:string;readonly revision:number;readonly bodySha256:string;
  readonly effectIdentity:string|null;readonly approvalManifestSha256:string;readonly target:ReturnType<typeof productionTarget>;
}
export interface CurrentSourceMaterializedBinding extends CurrentSourceBindingPlan {
  readonly quantityMapping:CurrentQuantityMapping;readonly actualDocument:CurrentSourceActualDocument|null;
}
export function currentSourceQuantityReference(m:CurrentQuantityMapping):CurrentQuantityReference {
  return {sourceQuantityKey:m.sourceQuantityKey,runtimeWarehouseKey:m.runtimeWarehouseKey,runtimeSkuKey:m.runtimeSkuKey,
    identityKind:m.identityKind,warehouseHistoricalOriginalId:m.warehouseHistoricalOriginalId,sourceHistoricalOriginalSkuId:m.sourceHistoricalOriginalSkuId};
}
function namespace(m:CurrentQuantityMapping):CurrentSpecNamespace {
  if(m.identityKind==='CONFIRMED_HISTORICAL_SKU')return 'ORIGINAL_HISTORY';
  if(m.identityKind==='CURRENT_TPLUS_SOURCE_SPEC_OBSERVATION')return 'CURRENT_OBSERVED';
  if(m.identityKind==='T03_CORRECTED_CURRENT_SPEC')return 'CURRENT_CORRECTED';
  return fail('CURRENT_SOURCE_SPEC_NAMESPACE_REQUIRED');
}
/** Original endpoint and quantity values are checked by equality, never selected or recomputed here. */
export function validateCurrentSourceBinding(endpoint:CurrentSourceEndpoint,plan:CurrentSourceBindingPlan,mapping:CurrentQuantityMapping,
  document?:CurrentSourceDocumentPlan):CurrentSourceMaterializedBinding {
  return materializeCurrentSourceBinding(endpoint,plan,mapping,document);
}
interface ValidatedCurrentSourceDocument {
  readonly sha256:string;readonly remainingEndpoints:Set<string>;readonly lineIds:ReadonlySet<string>;
}
type CurrentSourceDocumentBindingMetadata=Pick<CurrentSourceDocumentPlan,'sourceGroupKey'|'documentType'|'sourceNumber'|'currentObservedState'|'archiveRevision'|'bodySha256'>;
/** Fast path is private and receives only plans/mappings/documents owned by the approved preparation. */
function materializeCurrentSourceBinding(endpoint:CurrentSourceEndpoint,plan:CurrentSourceBindingPlan,mapping:CurrentQuantityMapping,
  document?:CurrentSourceDocumentPlan|CurrentSourceDocumentBindingMetadata,validated?:ValidatedCurrentSourceDocument,owned=false):CurrentSourceMaterializedBinding {
  if(endpoint.schemaVersion!=='T35-SELECTED-SOURCE-ENDPOINT-v1'||!family(endpoint.sourceFamily)||!text(endpoint.lineId)
    ||!sha(endpoint.sourceEndpointId)||!endpoint.source||endpoint.quantitySelectionPolicy!==currentExportPolicy
    ||endpoint.historicalStateTimelineConfirmed!==false||endpoint.historicalStateAtExactCutoffConfirmed!==false
    ||endpoint.missingHistoricalEventIdentityFabricated!==false||endpoint.sourceForeignKeyChanged!==false
    ||endpoint.sourceCanonicalEventId!==null&&!text(endpoint.sourceCanonicalEventId))fail('ORIGINAL_CURRENT_ENDPOINT_FACTS_REQUIRED');
  if(plan.schemaVersion!=='T32-CURRENT-SOURCE-ENDPOINT-BINDING-PLAN-v1'||plan.sourceEndpointId!==endpoint.sourceEndpointId
    ||plan.lineId!==endpoint.lineId||plan.sourceCanonicalEventId!==endpoint.sourceCanonicalEventId||plan.sourceFamily!==endpoint.sourceFamily
    ||plan.sourceEndpointSha256!==historyDigest(endpoint)||plan.readonly!==true||plan.auditAllowed!==false
    ||!Array.isArray(plan.uncertainties))fail('CURRENT_SOURCE_ENDPOINT_CHANGED_OR_ACTIONABILITY_FABRICATED');
  const original=endpoint.originalSourceDimensionKey[1];
  if(plan.originalHistoricalSkuId!==(uuid(original)?original:null)||!same(mapping.sourceQuantityKey,endpoint.quantityDimensionKey)
    ||!same(plan.quantityReference,currentSourceQuantityReference(mapping))||plan.specNamespace!==namespace(mapping)
    ||!uuid(mapping.runtimeSkuId)||!uuid(mapping.runtimeWarehouseId)||mapping.currentIdentityPromotedAsHistorical!==false
    ||endpoint.measurementUnit!==endpoint.quantityDimensionKey[2]
    ||endpoint.originalSourceDimensionKey[0]!==endpoint.quantityDimensionKey[0]
    ||endpoint.originalSourceDimensionKey[2]!==endpoint.measurementUnit)fail('CURRENT_SOURCE_ORIGINAL_AND_RUNTIME_IDENTITIES_MUST_STAY_DISTINCT');
  if(plan.specNamespace==='ORIGINAL_HISTORY'&&(!uuid(original)||mapping.runtimeSkuId!==original
    ||mapping.sourceHistoricalOriginalSkuId!==original||endpoint.quantityDimensionKey[1]!==original))fail('CURRENT_SOURCE_ORIGINAL_SKU_CHANGED');
  if(plan.specNamespace!=='ORIGINAL_HISTORY'&&mapping.sourceHistoricalOriginalSkuId!==null)fail('CURRENT_SOURCE_CURRENT_ID_CLAIMED_AS_ORIGINAL');
  if(plan.mode==='SOURCE_ROW_OBSERVATION'){
    if(plan.document!==null||document)fail('CURRENT_SOURCE_ROW_IS_NOT_AN_INDEPENDENT_DOCUMENT');
  }else if(plan.mode==='BOUND_READONLY_CURRENT_DOCUMENT'){
    if(!plan.document||!document)fail('CURRENT_SOURCE_COMPLETE_DOCUMENT_PROOF_REQUIRED');
    if(!validated)validateDocumentPlan(document as CurrentSourceDocumentPlan);
    if(plan.document.sourceGroupKey!==document.sourceGroupKey||plan.document.archiveRevision!==document.archiveRevision
      ||plan.document.bodySha256!==document.bodySha256||plan.document.documentProofSha256!==(validated?.sha256??historyDigest(document))
      ||!(validated?validated.remainingEndpoints.has(endpoint.sourceEndpointId):(document as CurrentSourceDocumentPlan).sourceEndpointIds.includes(endpoint.sourceEndpointId))
      ||!(validated?validated.lineIds.has(endpoint.lineId):(document as CurrentSourceDocumentPlan).lineIds.includes(endpoint.lineId))
      ||document.currentObservedState!==endpoint.currentObservedState
      ||endpoint.sourceNumber!==undefined&&endpoint.sourceNumber!==null&&endpoint.sourceNumber!==document.sourceNumber
      ||(document.documentType==='TRANSFER'?!endpoint.sourceFamily.startsWith('TRANSFER_'):endpoint.sourceFamily!==document.documentType))fail('CURRENT_SOURCE_DOCUMENT_MEMBERSHIP_NOT_PROVEN');
  }else fail('CURRENT_SOURCE_BINDING_MODE_REQUIRED');
  return owned?{...plan,quantityMapping:mapping,actualDocument:null}:{...structuredClone(plan),quantityMapping:structuredClone(mapping),actualDocument:null};
}
function validateDocumentPlan(d:CurrentSourceDocumentPlan):void {
  if(d.schemaVersion!=='T32-CURRENT-SOURCE-DOCUMENT-PLAN-v1'||!text(d.sourceGroupKey)
    ||!['SALE','TRANSFER','PURCHASE'].includes(d.documentType)||!text(d.sourceNumber)||!/[\p{L}\p{N}]/u.test(d.sourceNumber)
    ||!Number.isSafeInteger(d.archiveRevision)||d.archiveRevision<1||!sha(d.bodySha256)||historyDigest(d.body)!==d.bodySha256
    ||!Array.isArray(d.body.lines)||!d.body.lines.length||!Array.isArray(d.body.fundsRecords)
    ||d.completeSourceLinesAndSettlements!==true||d.historicalStateTimelineConfirmed!==false||d.historicalStateAtExactCutoffConfirmed!==false
    ||d.readonly!==true||d.auditAllowed!==false||!d.sourceEndpointIds.length||!d.lineIds.length
    ||d.groupingEvidence.kind!=='CONFIRMED_COMPLETE_CURRENT_EXPORT_GROUP'||d.originalDocumentId!==null&&!text(d.originalDocumentId)
    ||d.originalHistoricalRevision!==null&&!text(d.originalHistoricalRevision))fail('CURRENT_SOURCE_DOCUMENT_GROUP_NOT_COMPLETE_OR_IS_PLACEHOLDER');
  if(Object.hasOwn(d.body.header,'source_number')&&d.body.header['source_number']!==null&&d.body.header['source_number']!==d.sourceNumber)fail('CURRENT_SOURCE_ORIGINAL_NUMBER_CHANGED');
  if(d.businessDate!==null)parseBusinessDay(d.businessDate);
  if(new Set(d.sourceEndpointIds).size!==d.sourceEndpointIds.length||new Set(d.lineIds).size!==d.lineIds.length)fail('CURRENT_SOURCE_DOCUMENT_MEMBERSHIP_DUPLICATED');
}
export interface PreparedCurrentSourceBodies {
  readonly manifest:ApprovedCurrentSourceBodies;readonly manifestSha256:string;
  readonly observations:readonly CurrentSourceObservation[];readonly bindings:readonly CurrentSourceMaterializedBinding[];
  readonly documents:readonly CurrentSourceDocumentPlan[];readonly materialization:CurrentSourceMaterialization;
}
async function artifactRecord(root:string,ref:CurrentExportArtifact & {row:number},cache:Map<string,unknown[]>,completeDocumentArchive=false):Promise<unknown> {
  if(!Number.isSafeInteger(ref.row)||ref.row<1)fail('CURRENT_SOURCE_RECORD_REFERENCE_REQUIRED');
  const key=(completeDocumentArchive?'COMPLETE_DOCUMENT:':'SOURCE_ROW:')+ref.file+':'+ref.sha256;let rows=cache.get(key);
  if(!rows){rows=[];
    if(completeDocumentArchive&&!/\.json$/.test(ref.file)){for await(const item of readApprovedCurrentSourceDocumentLines(root,ref))rows.push(item.row);}
    else{const path=await currentExportArtifactPath(root,ref);
      if(/\.json$/.test(ref.file)){const value:unknown=JSON.parse(readFileSync(path,'utf8'));rows=Array.isArray(value)?value:[value];}
      else for await(const item of currentExportLines(path))rows.push(item.row);
    }
    cache.set(key,rows);
  }
  if(ref.row>rows.length)fail('CURRENT_SOURCE_RECORD_REFERENCE_REQUIRED');return rows[ref.row-1];
}
/** Frozen plans contain no newly allocated IDs. Late receipts are untrusted until checked in the maintenance transaction. */
export async function readApprovedCurrentSourceBodies(config:DatabaseConfig,admission:ProductionAdmission,root:string,
  approval:CurrentExportArtifact,late:CurrentSourceMaterialization):Promise<PreparedCurrentSourceBodies> {
  assertProductionAdmission(config,admission,'historical-import',approval.sha256);
  const path=await currentExportArtifactPath(root,approval),manifest=JSON.parse(readFileSync(path,'utf8')) as ApprovedCurrentSourceBodies;
  if(manifest.schemaVersion!=='T32-APPROVED-CURRENT-SOURCE-BODIES-v1'||manifest.dataClass!=='USER_APPROVED_CURRENT_SOURCE'
    ||manifest.productionAuthorized!==true||manifest.contractSha256!==currentSourceContractSha256||!same(manifest.target,productionTarget(config))
    ||!sha(manifest.t30BatchId)||!sha(manifest.t32BatchId)||!manifest.counts
    ||Object.values(manifest.counts).some(n=>!Number.isSafeInteger(n)||n<0))fail('CURRENT_SOURCE_SIGNED_PLAN_REQUIRED');
  if(late.schemaVersion!=='T32-CURRENT-SOURCE-LATE-MATERIALIZATION-v1'||!same(late.target,manifest.target)
    ||late.bodyApprovalManifestSha256!==approval.sha256||late.quantityIdentityPlanSha256!==manifest.quantityIdentityPlan.sha256)fail('CURRENT_SOURCE_LATE_MAPPING_NOT_FROM_SAME_FROZEN_PLAN');
  await currentExportArtifactPath(root,manifest.quantityIdentityPlan);await currentExportArtifactPath(root,manifest.retainedMasterMaterial);
  const materialization=structuredClone(late),mappings=new Map(materialization.quantityMappings.map(m=>[JSON.stringify(m.sourceQuantityKey),m]));
  if(mappings.size!==materialization.quantityMappings.length)fail('CURRENT_SOURCE_MAPPING_KEYS_DUPLICATED');
  const documents:CurrentSourceDocumentPlan[]=[],docs=new Map<string,CurrentSourceDocumentPlan>(),recordCache=new Map<string,unknown[]>();
  const validatedDocuments=new Map<string,ValidatedCurrentSourceDocument>();
  for await(const {row} of readApprovedCurrentSourceDocumentLines(root,manifest.documents)){
    const d=row as CurrentSourceDocumentPlan;validateDocumentPlan(d);if(docs.has(d.sourceGroupKey))fail('CURRENT_SOURCE_GROUP_DUPLICATED');
    const archived=await artifactRecord(root,d.originalArchiveEvidence,recordCache,true);
    const archive=archived as ObjectRow;
    if(!archive||!same(archive['body'],d.body)||(archive['archiveRevision']??archive['sourceRevision'])!==d.archiveRevision)fail('CURRENT_SOURCE_ARCHIVE_BODY_CHANGED');
    const proof=await artifactRecord(root,d.groupingEvidence,recordCache) as ObjectRow;
    if(!proof||proof['sourceGroupKey']!==d.sourceGroupKey||proof['sourceNumber']!==d.sourceNumber
      ||proof['currentExportGroupConfirmed']!==true||proof['completeLinesAndSettlements']!==true
      ||!same(proof['lineIds'],d.lineIds)||!same(proof['sourceEndpointIds'],d.sourceEndpointIds))fail('CURRENT_SOURCE_GROUP_EVIDENCE_NOT_BOUND');
    docs.set(d.sourceGroupKey,d);documents.push(d);
    validatedDocuments.set(d.sourceGroupKey,{sha256:historyDigest(d),remainingEndpoints:new Set(d.sourceEndpointIds),lineIds:new Set(d.lineIds)});
    // Archive and grouping evidence are only needed for the current document, never for later bindings.
    recordCache.clear();
  }
  const plans=new Map<string,CurrentSourceBindingPlan>();
  for await(const {row} of currentExportLines(await currentExportArtifactPath(root,manifest.bindings))){
    const p=row as CurrentSourceBindingPlan;if(plans.has(p.sourceEndpointId))fail('CURRENT_SOURCE_ENDPOINT_BOUND_TWICE');plans.set(p.sourceEndpointId,p);
  }
  const plannedEndpointCount=plans.size;
  const observations:CurrentSourceObservation[]=[],bindings:CurrentSourceMaterializedBinding[]=[];const endpoints=new Map<string,CurrentSourceEndpoint>();
  for await(const {row} of currentExportLines(await currentExportArtifactPath(root,manifest.observations))){
    const o=row as CurrentSourceObservation;if(o.schemaVersion!=='T32-CURRENT-SOURCE-ROW-v1'||!o.endpoint||!o.originalFields
      ||o.originalFieldsSha256!==historyDigest(o.originalFields)||endpoints.has(o.endpoint.sourceEndpointId))fail('CURRENT_SOURCE_ORIGINAL_ROW_BODY_NOT_BOUND');
    const p=plans.get(o.endpoint.sourceEndpointId),m=mappings.get(JSON.stringify(o.endpoint.quantityDimensionKey));
    if(!p||!m)fail('CURRENT_SOURCE_ENDPOINT_OR_QUANTITY_REFERENCE_MISSING');
    const d=p.document?docs.get(p.document.sourceGroupKey):undefined;
    const validated=p.document?validatedDocuments.get(p.document.sourceGroupKey):undefined;
    bindings.push(materializeCurrentSourceBinding(o.endpoint,p,m,d,validated,true));observations.push(o);endpoints.set(o.endpoint.sourceEndpointId,o.endpoint);
    plans.delete(o.endpoint.sourceEndpointId);validated?.remainingEndpoints.delete(p.sourceEndpointId);
  }
  // Exact source equality includes nulls, row/file/index evidence and already-selected quantities; no recalculation.
  let n=0;
  for await(const {row} of currentExportLines(await currentExportArtifactPath(root,manifest.sourceEndpoints))){
    const e=row as CurrentSourceEndpoint,original=endpoints.get(e.sourceEndpointId);
    if(!original||!same(e,original))fail('CURRENT_SOURCE_ENDPOINT_DROPPED_OR_REWRITTEN');
    endpoints.delete(e.sourceEndpointId);n++;
  }
  if(n!==manifest.counts.sourceEndpoints||observations.length!==manifest.counts.observations||plannedEndpointCount!==n||plans.size!==0||endpoints.size!==0
    ||documents.length!==manifest.counts.documents||mappings.size!==manifest.counts.quantityKeys)fail('CURRENT_SOURCE_SOURCE_COVERAGE_INCOMPLETE');
  for(const proof of validatedDocuments.values())if(proof.remainingEndpoints.size)fail('CURRENT_SOURCE_DOCUMENT_GROUP_PARTIALLY_BOUND');
  validatedDocuments.clear();docs.clear();mappings.clear();
  return {manifest,manifestSha256:approval.sha256,observations,bindings,documents,materialization};
}
export interface ApprovedCurrentSourceStream {
  readonly kind:'T32-VALIDATED-CURRENT-SOURCE-STREAM-v1';readonly manifest:ApprovedCurrentSourceBodies;readonly manifestSha256:string;
  readonly materializationHeader:Omit<CurrentSourceMaterialization,'quantityMappings'>;readonly counts:ApprovedCurrentSourceBodies['counts'];
}
export interface CurrentSourceStreamObservation {
  readonly observation:CurrentSourceObservation;readonly binding:CurrentSourceMaterializedBinding;readonly storageOrdinal:number;
  readonly observationSha256:string;readonly bindingSha256:string;
}
export interface CurrentSourceStreamDocument {
  readonly document:CurrentSourceDocumentPlan;readonly documentProofSha256:string;readonly bindings:AsyncIterable<CurrentSourceMaterializedBinding>;
}
export const currentSourceStreamLimits=Object.freeze({sqliteCacheBytes:32*1024*1024,indexBytes:8*1024*1024*1024,
  rawRowBytes:262144,documentRowBytes:approvedCurrentSourceDocumentRowMaxBytes,jsonProofBytes:64*1024*1024,
  documentBindingsBytes:128*1024*1024});
interface CurrentSourceStreamState {
  db:DatabaseSync;readonly statements:Map<string,ReturnType<DatabaseSync['prepare']>>;readonly indexPath:string;readonly config:DatabaseConfig;readonly admission:ProductionAdmission;readonly root:string;
  readonly approval:CurrentExportArtifact;indexSignature:string;readonly manifest:ApprovedCurrentSourceBodies;
  readonly manifestSha256:string;readonly header:Omit<CurrentSourceMaterialization,'quantityMappings'>;
  mappingsConsumed:boolean;observationsConsumed:boolean;documentsConsumed:boolean;disposed:boolean;
  progressStage:string;progressRows:number;
}
const currentSourceStreams=new WeakMap<ApprovedCurrentSourceStream,CurrentSourceStreamState>();
function streamFileSignature(path:string):string {
  const st=lstatSync(path,{bigint:true});
  if(!st.isFile()||st.isSymbolicLink()||realpathSync(path)!==path)fail('ARTIFACT_PATH_REJECTED');
  return [st.dev,st.ino,st.size,st.mtimeNs,st.ctimeNs,st.mode].join(':');
}
function streamState(p:ApprovedCurrentSourceStream):CurrentSourceStreamState {
  const st=currentSourceStreams.get(p);if(!st||st.disposed)fail('CURRENT_SOURCE_STREAM_CAPABILITY_REQUIRED');
  if(streamFileSignature(st.indexPath)!==st.indexSignature)fail('CURRENT_SOURCE_STREAM_INDEX_CHANGED');return st;
}
function frozenStreamValue<T>(value:T):T {
  if(value&&typeof value==='object'){for(const item of Object.values(value))frozenStreamValue(item);Object.freeze(value);}return value;
}
function streamStatement(st:CurrentSourceStreamState,sql:string):ReturnType<DatabaseSync['prepare']> {
  let statement=st.statements.get(sql);if(!statement){if(st.statements.size>=64)fail('CURRENT_SOURCE_STREAM_STATEMENT_LIMIT');
    statement=st.db.prepare(sql);st.statements.set(sql,statement);}return statement;
}
function rememberStreamArtifact(st:CurrentSourceStreamState,ref:CurrentExportArtifact,signature:string):void {
  const old=streamStatement(st,'SELECT sha,signature FROM artifacts WHERE file=?').get(ref.file);
  if(old&&(old['sha']!==ref.sha256||old['signature']!==signature))fail('ORIGINAL_ARTIFACT_HASH_CHANGED');
  if(!old)streamStatement(st,'INSERT INTO artifacts(file,sha,signature) VALUES(?,?,?)').run(ref.file,ref.sha256,signature);
}
async function verifyStreamArtifact(st:CurrentSourceStreamState,ref:CurrentExportArtifact):Promise<void> {
  const path=await currentExportArtifactPath(st.root,ref);rememberStreamArtifact(st,ref,streamFileSignature(path));
}
async function* streamArtifactLines(st:CurrentSourceStreamState,ref:CurrentExportArtifact,documents=false):AsyncGenerator<{row:unknown;ordinal:number}> {
  yield* boundedCurrentSourceLines(st.root,ref,documents?currentSourceStreamLimits.documentRowBytes:currentSourceStreamLimits.rawRowBytes,
    documents?'CURRENT_SOURCE_DOCUMENT_ROW_TOO_LARGE_OR_EMPTY':'CURRENT_EXPORT_SOURCE_ROW_TOO_LARGE_OR_EMPTY',
    documents?'CURRENT_SOURCE_DOCUMENT_JSONL_FINAL_NEWLINE_REQUIRED':'CURRENT_EXPORT_JSONL_FINAL_NEWLINE_REQUIRED',
    (_path,signature)=>rememberStreamArtifact(st,ref,signature));
}
async function streamArtifactRecord(st:CurrentSourceStreamState,ref:CurrentExportArtifact&{row:number},documents=false):Promise<unknown> {
  if(!Number.isSafeInteger(ref.row)||ref.row<1)fail('CURRENT_SOURCE_RECORD_REFERENCE_REQUIRED');
  if(/\.json$/.test(ref.file)){
    const path=await currentExportArtifactPath(st.root,ref),signature=streamFileSignature(path);
    const limit=documents?currentSourceStreamLimits.documentRowBytes:currentSourceStreamLimits.jsonProofBytes;
    if(lstatSync(path).size>limit)fail('CURRENT_SOURCE_JSON_EVIDENCE_TOO_LARGE');
    const bytes=readFileSync(path);
    if(currentSourceBytesSha256(bytes)!==ref.sha256||streamFileSignature(path)!==signature)fail('ORIGINAL_ARTIFACT_HASH_CHANGED');
    const value:unknown=JSON.parse(bytes.toString('utf8'));rememberStreamArtifact(st,ref,signature);
    if(Array.isArray(value)){if(ref.row>value.length)fail('CURRENT_SOURCE_RECORD_REFERENCE_REQUIRED');return value[ref.row-1];}
    if(ref.row!==1)fail('CURRENT_SOURCE_RECORD_REFERENCE_REQUIRED');return value;
  }
  let selected:unknown;
  // Complete EOF is still required for the original artifact SHA; retain only the referenced row.
  for await(const item of streamArtifactLines(st,ref,documents))if(item.ordinal===ref.row)selected=item.row;
  if(selected===undefined)fail('CURRENT_SOURCE_RECORD_REFERENCE_REQUIRED');return selected;
}
function indexCount(st:CurrentSourceStreamState,sql:string):number {return Number(streamStatement(st,sql).get()?.['n']);}
function streamIndexCheckpoint(st:CurrentSourceStreamState):void {
  st.db.exec('COMMIT');if(lstatSync(st.indexPath).size>currentSourceStreamLimits.indexBytes)fail('CURRENT_SOURCE_STREAM_INDEX_TOO_LARGE');
  writeFileSync(join(dirname(st.indexPath),'progress.json'),JSON.stringify({schemaVersion:'T32-CURRENT-SOURCE-STREAM-PROGRESS-v1',
    stage:st.progressStage,rows:st.progressRows,observedAtUTC:new Date().toISOString(),memory:process.memoryUsage(),
    businessValuesExported:false,productionWritesStarted:false})+'\n',{mode:0o600});st.db.exec('BEGIN');
}
function bindingFromStreamIndex(st:CurrentSourceStreamState,planRow:Record<string,unknown>):CurrentSourceMaterializedBinding {
  const plan=JSON.parse(String(planRow['json'])) as CurrentSourceBindingPlan;
  const row=streamStatement(st,'SELECT json FROM quantities WHERE key=?').get(JSON.stringify(plan.quantityReference.sourceQuantityKey));
  if(!row)fail('CURRENT_SOURCE_ENDPOINT_OR_QUANTITY_REFERENCE_MISSING');
  const binding={...plan,quantityMapping:JSON.parse(String(row['json'])) as CurrentQuantityMapping,actualDocument:null};
  if(historyDigest(binding)!==planRow['binding_sha'])fail('CURRENT_SOURCE_STREAM_BINDING_CHANGED');return binding;
}
/** Complete preflight into a bounded private disk index; no raw observation or whole document collection is returned. */
export async function prepareApprovedCurrentSourceStream(config:DatabaseConfig,admission:ProductionAdmission,root:string,
  approval:CurrentExportArtifact,late:CurrentSourceMaterialization,options:{readonly workRoot?:string}={}):Promise<ApprovedCurrentSourceStream> {
  assertProductionAdmission(config,admission,'historical-import',approval.sha256);
  const path=await currentExportArtifactPath(root,approval),manifestSignature=streamFileSignature(path),bytes=readFileSync(path);
  if(currentSourceBytesSha256(bytes)!==approval.sha256||streamFileSignature(path)!==manifestSignature)fail('ORIGINAL_ARTIFACT_HASH_CHANGED');
  const manifest=JSON.parse(bytes.toString('utf8')) as ApprovedCurrentSourceBodies;
  if(manifest.schemaVersion!=='T32-APPROVED-CURRENT-SOURCE-BODIES-v1'||manifest.dataClass!=='USER_APPROVED_CURRENT_SOURCE'
    ||manifest.productionAuthorized!==true||manifest.contractSha256!==currentSourceContractSha256||!same(manifest.target,productionTarget(config))
    ||!sha(manifest.t30BatchId)||!sha(manifest.t32BatchId)||!manifest.counts
    ||Object.values(manifest.counts).some(n=>!Number.isSafeInteger(n)||n<0))fail('CURRENT_SOURCE_SIGNED_PLAN_REQUIRED');
  if(late.schemaVersion!=='T32-CURRENT-SOURCE-LATE-MATERIALIZATION-v1'||!same(late.target,manifest.target)
    ||late.bodyApprovalManifestSha256!==approval.sha256||late.quantityIdentityPlanSha256!==manifest.quantityIdentityPlan.sha256
    ||!Array.isArray(late.quantityMappings))fail('CURRENT_SOURCE_LATE_MAPPING_NOT_FROM_SAME_FROZEN_PLAN');
  const workRoot=options.workRoot??process.env['CURRENT_SOURCE_STREAM_WORK_ROOT'];
  if(!workRoot||!isAbsolute(workRoot)||resolve(workRoot)!==workRoot||realpathSync(workRoot)!==workRoot||workRoot===parse(workRoot).root
    ||!lstatSync(workRoot).isDirectory()||(lstatSync(workRoot).mode&0o077)!==0||!relative(root,workRoot).startsWith('..'))
    fail('CURRENT_SOURCE_PRIVATE_DISK_WORK_ROOT_REQUIRED');
  const directory=mkdtempSync(join(workRoot,'t32-validation-'));chmodSync(directory,0o700);const indexPath=join(directory,'index.sqlite');
  const db=new DatabaseSync(indexPath);chmodSync(indexPath,0o600);
  const {quantityMappings,...originalHeader}=late;
  const header=frozenStreamValue(structuredClone(originalHeader));
  const st:CurrentSourceStreamState={db,statements:new Map(),indexPath,config,admission,root,approval:{...approval},indexSignature:'',manifest,
    manifestSha256:approval.sha256,header,mappingsConsumed:false,observationsConsumed:false,documentsConsumed:false,disposed:false,
    progressStage:'QUANTITY_MAPPINGS',progressRows:0};
  try {
    db.exec(`PRAGMA page_size=4096; PRAGMA max_page_count=2097152; PRAGMA cache_size=-32768; PRAGMA mmap_size=0;
      PRAGMA journal_mode=DELETE; PRAGMA synchronous=OFF; PRAGMA temp_store=FILE;
      CREATE TABLE artifacts(file TEXT PRIMARY KEY,sha TEXT NOT NULL,signature TEXT NOT NULL);
      CREATE TABLE quantities(key TEXT PRIMARY KEY,ordinal INTEGER UNIQUE NOT NULL,json TEXT NOT NULL,sha TEXT NOT NULL);
      CREATE TABLE documents(group_key TEXT PRIMARY KEY,ordinal INTEGER UNIQUE NOT NULL,sha TEXT NOT NULL,meta TEXT NOT NULL,members INTEGER NOT NULL,binding_bytes INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE members(endpoint_id TEXT PRIMARY KEY,group_key TEXT NOT NULL,seen INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX members_group ON members(group_key);
      CREATE TABLE lines(group_key TEXT NOT NULL,line_id TEXT NOT NULL,PRIMARY KEY(group_key,line_id));
      CREATE TABLE plans(id TEXT PRIMARY KEY,ordinal INTEGER UNIQUE NOT NULL,json TEXT NOT NULL,group_key TEXT,
        observation_ordinal INTEGER UNIQUE,observation_sha TEXT,endpoint_sha TEXT,binding_sha TEXT,source_seen INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX plans_group_observation ON plans(group_key,observation_ordinal);
      BEGIN;`);
    rememberStreamArtifact(st,approval,manifestSignature);
    await verifyStreamArtifact(st,manifest.quantityIdentityPlan);await verifyStreamArtifact(st,manifest.retainedMasterMaterial);
    const putQuantity=streamStatement(st,'INSERT INTO quantities(key,ordinal,json,sha) VALUES(?,?,?,?)');let qn=0;
    for(const mapping of quantityMappings){
      const key=JSON.stringify(mapping.sourceQuantityKey);
      if(streamStatement(st,'SELECT 1 FROM quantities WHERE key=?').get(key))fail('CURRENT_SOURCE_MAPPING_KEYS_DUPLICATED');
      putQuantity.run(key,++qn,JSON.stringify(mapping),historyDigest(mapping));st.progressRows=qn;if(qn%1000===0)streamIndexCheckpoint(st);
    }
    const putDocument=streamStatement(st,'INSERT INTO documents(group_key,ordinal,sha,meta,members) VALUES(?,?,?,?,?)');
    const putMember=streamStatement(st,'INSERT INTO members(endpoint_id,group_key) VALUES(?,?)'),putLine=streamStatement(st,'INSERT INTO lines(group_key,line_id) VALUES(?,?)');
    let dn=0;
    st.progressStage='COMPLETE_DOCUMENTS';st.progressRows=0;
    for await(const {row,ordinal} of streamArtifactLines(st,manifest.documents,true)){
      const d=row as CurrentSourceDocumentPlan;validateDocumentPlan(d);
      if(streamStatement(st,'SELECT 1 FROM documents WHERE group_key=?').get(d.sourceGroupKey))fail('CURRENT_SOURCE_GROUP_DUPLICATED');
      const archived=await streamArtifactRecord(st,d.originalArchiveEvidence,true) as ObjectRow;
      if(!archived||historyDigest(archived['body'])!==d.bodySha256||(archived['archiveRevision']??archived['sourceRevision'])!==d.archiveRevision)
        fail('CURRENT_SOURCE_ARCHIVE_BODY_CHANGED');
      const proof=await streamArtifactRecord(st,d.groupingEvidence) as ObjectRow;
      if(!proof||proof['sourceGroupKey']!==d.sourceGroupKey||proof['sourceNumber']!==d.sourceNumber||proof['currentExportGroupConfirmed']!==true
        ||proof['completeLinesAndSettlements']!==true||!same(proof['lineIds'],d.lineIds)||!same(proof['sourceEndpointIds'],d.sourceEndpointIds))
        fail('CURRENT_SOURCE_GROUP_EVIDENCE_NOT_BOUND');
      const meta:CurrentSourceDocumentBindingMetadata={sourceGroupKey:d.sourceGroupKey,documentType:d.documentType,sourceNumber:d.sourceNumber,
        currentObservedState:d.currentObservedState,archiveRevision:d.archiveRevision,bodySha256:d.bodySha256};
      putDocument.run(d.sourceGroupKey,ordinal,historyDigest(d),JSON.stringify(meta),d.sourceEndpointIds.length);dn++;
      for(const id of d.sourceEndpointIds){if(!sha(id)||streamStatement(st,'SELECT 1 FROM members WHERE endpoint_id=?').get(id))fail('CURRENT_SOURCE_DOCUMENT_GROUP_PARTIALLY_BOUND');putMember.run(id,d.sourceGroupKey);}
      for(const id of d.lineIds){if(!text(id))fail('CURRENT_SOURCE_DOCUMENT_GROUP_PARTIALLY_BOUND');putLine.run(d.sourceGroupKey,id);}
      st.progressRows=dn;if(dn%500===0)streamIndexCheckpoint(st);
    }
    const putPlan=streamStatement(st,'INSERT INTO plans(id,ordinal,json,group_key) VALUES(?,?,?,?)');let pn=0;
    st.progressStage='BINDING_PLANS';st.progressRows=0;
    for await(const {row,ordinal} of streamArtifactLines(st,manifest.bindings)){
      const p=row as CurrentSourceBindingPlan;
      if(!sha(p.sourceEndpointId)||streamStatement(st,'SELECT 1 FROM plans WHERE id=?').get(p.sourceEndpointId))fail('CURRENT_SOURCE_ENDPOINT_BOUND_TWICE');
      putPlan.run(p.sourceEndpointId,ordinal,JSON.stringify(p),p.document?.sourceGroupKey??null);pn++;st.progressRows=pn;if(pn%1000===0)streamIndexCheckpoint(st);
    }
    const observationPlan=streamStatement(st,'SELECT json,observation_sha FROM plans WHERE id=?'),quantity=streamStatement(st,'SELECT json FROM quantities WHERE key=?');
    const document=streamStatement(st,'SELECT sha,meta FROM documents WHERE group_key=?'),member=streamStatement(st,'SELECT group_key,seen FROM members WHERE endpoint_id=?');
    const hasLine=streamStatement(st,'SELECT 1 FROM lines WHERE group_key=? AND line_id=?');
    const consumePlan=streamStatement(st,'UPDATE plans SET observation_ordinal=?,observation_sha=?,endpoint_sha=?,binding_sha=? WHERE id=? AND observation_sha IS NULL');
    const consumeMember=streamStatement(st,'UPDATE members SET seen=1 WHERE endpoint_id=? AND group_key=? AND seen=0');let on=0;
    const addBindingBytes=streamStatement(st,'UPDATE documents SET binding_bytes=binding_bytes+? WHERE group_key=?');
    const bindingBytes=streamStatement(st,'SELECT binding_bytes FROM documents WHERE group_key=?');
    st.progressStage='ORIGINAL_OBSERVATIONS';st.progressRows=0;
    for await(const {row,ordinal} of streamArtifactLines(st,manifest.observations)){
      const o=row as CurrentSourceObservation;
      if(o.schemaVersion!=='T32-CURRENT-SOURCE-ROW-v1'||!o.endpoint||!o.originalFields||o.originalFieldsSha256!==historyDigest(o.originalFields))
        fail('CURRENT_SOURCE_ORIGINAL_ROW_BODY_NOT_BOUND');
      const pr=observationPlan.get(o.endpoint.sourceEndpointId);
      if(pr?.['observation_sha']!==null&&pr?.['observation_sha']!==undefined)fail('CURRENT_SOURCE_ORIGINAL_ROW_BODY_NOT_BOUND');
      const qr=quantity.get(JSON.stringify(o.endpoint.quantityDimensionKey));if(!pr||!qr)fail('CURRENT_SOURCE_ENDPOINT_OR_QUANTITY_REFERENCE_MISSING');
      const p=JSON.parse(String(pr['json'])) as CurrentSourceBindingPlan,m=JSON.parse(String(qr['json'])) as CurrentQuantityMapping;
      let meta:CurrentSourceDocumentBindingMetadata|undefined,validated:ValidatedCurrentSourceDocument|undefined;
      if(p.document){
        const dr=document.get(p.document.sourceGroupKey),mr=member.get(o.endpoint.sourceEndpointId);
        if(dr){meta=JSON.parse(String(dr['meta'])) as CurrentSourceDocumentBindingMetadata;
          validated={sha256:String(dr['sha']),remainingEndpoints:new Set(mr?.['group_key']===p.document.sourceGroupKey&&mr['seen']===0?[o.endpoint.sourceEndpointId]:[]),
            lineIds:new Set(hasLine.get(p.document.sourceGroupKey,o.endpoint.lineId)?[o.endpoint.lineId]:[])};}
      }
      const binding=materializeCurrentSourceBinding(o.endpoint,p,m,meta,validated,true);
      if(Number(consumePlan.run(ordinal,historyDigest(o),p.sourceEndpointSha256,historyDigest(binding),o.endpoint.sourceEndpointId).changes)!==1)
        fail('CURRENT_SOURCE_ORIGINAL_ROW_BODY_NOT_BOUND');
      if(p.document&&Number(consumeMember.run(o.endpoint.sourceEndpointId,p.document.sourceGroupKey).changes)!==1)fail('CURRENT_SOURCE_DOCUMENT_MEMBERSHIP_NOT_PROVEN');
      if(p.document){addBindingBytes.run(Buffer.byteLength(JSON.stringify(binding))+1,p.document.sourceGroupKey);
        if(Number(bindingBytes.get(p.document.sourceGroupKey)?.['binding_bytes'])>currentSourceStreamLimits.documentBindingsBytes)
          fail('CURRENT_SOURCE_DOCUMENT_BINDINGS_TOO_LARGE');}
      on++;st.progressRows=on;if(on%1000===0)streamIndexCheckpoint(st);
    }
    const endpointPlan=streamStatement(st,'SELECT endpoint_sha,source_seen FROM plans WHERE id=?'),consumeEndpoint=streamStatement(st,'UPDATE plans SET source_seen=1 WHERE id=? AND source_seen=0');let en=0;
    st.progressStage='ORIGINAL_SOURCE_ENDPOINTS';st.progressRows=0;
    for await(const {row} of streamArtifactLines(st,manifest.sourceEndpoints)){
      const e=row as CurrentSourceEndpoint,expected=endpointPlan.get(e.sourceEndpointId);
      if(!expected||expected['source_seen']!==0||expected['endpoint_sha']!==historyDigest(e))fail('CURRENT_SOURCE_ENDPOINT_DROPPED_OR_REWRITTEN');
      if(Number(consumeEndpoint.run(e.sourceEndpointId).changes)!==1)fail('CURRENT_SOURCE_ENDPOINT_DROPPED_OR_REWRITTEN');en++;st.progressRows=en;if(en%1000===0)streamIndexCheckpoint(st);
    }
    if(en!==manifest.counts.sourceEndpoints||on!==manifest.counts.observations||pn!==en||dn!==manifest.counts.documents||qn!==manifest.counts.quantityKeys
      ||indexCount(st,'SELECT count(*) n FROM plans WHERE observation_sha IS NULL OR source_seen=0')!==0)fail('CURRENT_SOURCE_SOURCE_COVERAGE_INCOMPLETE');
    if(indexCount(st,'SELECT count(*) n FROM members WHERE seen=0')!==0)fail('CURRENT_SOURCE_DOCUMENT_GROUP_PARTIALLY_BOUND');
    db.exec('COMMIT');assertProductionAdmission(config,admission,'historical-import',approval.sha256);
    if(lstatSync(indexPath).size>currentSourceStreamLimits.indexBytes)fail('CURRENT_SOURCE_STREAM_INDEX_TOO_LARGE');db.close();st.statements.clear();chmodSync(indexPath,0o400);
    st.db=new DatabaseSync(indexPath,{readOnly:true});st.db.exec('PRAGMA cache_size=-32768; PRAGMA mmap_size=0; PRAGMA query_only=ON');
    st.indexSignature=streamFileSignature(indexPath);
    const p:ApprovedCurrentSourceStream=Object.freeze({kind:'T32-VALIDATED-CURRENT-SOURCE-STREAM-v1',manifest:frozenStreamValue(manifest),
      manifestSha256:approval.sha256,materializationHeader:header,counts:Object.freeze({...manifest.counts})});currentSourceStreams.set(p,st);return p;
  }catch(error){try{st.db.close();}catch{/* Already closed after validation failure. */}throw error;}
}
export async function* iterateApprovedCurrentSourceMappings(p:ApprovedCurrentSourceStream):AsyncGenerator<CurrentQuantityMapping> {
  const st=streamState(p);assertProductionAdmission(st.config,st.admission,'historical-import',st.approval.sha256);st.mappingsConsumed=false;let n=0;
  for(const row of streamStatement(st,'SELECT json,sha FROM quantities ORDER BY ordinal').iterate()){
    const value=JSON.parse(String(row['json'])) as CurrentQuantityMapping;if(historyDigest(value)!==row['sha'])fail('CURRENT_SOURCE_STREAM_MAPPING_CHANGED');
    if(++n%1000===0)streamState(p);yield frozenStreamValue(value);
  }
  if(n!==p.counts.quantityKeys)fail('CURRENT_SOURCE_SOURCE_COVERAGE_INCOMPLETE');streamState(p);st.mappingsConsumed=true;
}
export async function* iterateApprovedCurrentSourceObservations(p:ApprovedCurrentSourceStream):AsyncGenerator<CurrentSourceStreamObservation> {
  const st=streamState(p);assertProductionAdmission(st.config,st.admission,'historical-import',st.approval.sha256);st.observationsConsumed=false;let n=0;
  const plan=streamStatement(st,'SELECT json,observation_ordinal,observation_sha,binding_sha FROM plans WHERE id=?');
  // Index artifacts are immutable; consumption must not call the preparation-only artifact recorder.
  for await(const {row,ordinal} of boundedCurrentSourceLines(st.root,st.manifest.observations,currentSourceStreamLimits.rawRowBytes,
    'CURRENT_EXPORT_SOURCE_ROW_TOO_LARGE_OR_EMPTY','CURRENT_EXPORT_JSONL_FINAL_NEWLINE_REQUIRED')){
    const observation=row as CurrentSourceObservation,pr=plan.get(observation.endpoint.sourceEndpointId);
    if(!pr||pr['observation_ordinal']!==ordinal||pr['observation_sha']!==historyDigest(observation))fail('CURRENT_SOURCE_STREAM_OBSERVATION_CHANGED');
    const binding=bindingFromStreamIndex(st,pr);n++;if(n%1000===0)streamState(p);
    yield Object.freeze({observation:frozenStreamValue(observation),binding:frozenStreamValue(binding),storageOrdinal:ordinal,
      observationSha256:String(pr['observation_sha']),bindingSha256:String(pr['binding_sha'])});
  }
  if(n!==p.counts.observations)fail('CURRENT_SOURCE_SOURCE_COVERAGE_INCOMPLETE');streamState(p);st.observationsConsumed=true;
}
async function* currentSourceDocumentBindings(p:ApprovedCurrentSourceStream,key:string,onComplete:()=>void):AsyncGenerator<CurrentSourceMaterializedBinding> {
  const st=streamState(p),doc=streamStatement(st,'SELECT members FROM documents WHERE group_key=?').get(key);if(!doc)fail('CURRENT_SOURCE_COMPLETE_DOCUMENT_PROOF_REQUIRED');let n=0;
  for(const row of streamStatement(st,'SELECT json,binding_sha FROM plans WHERE group_key=? ORDER BY observation_ordinal').iterate(key)){
    const binding=bindingFromStreamIndex(st,row);if(binding.document?.sourceGroupKey!==key)fail('CURRENT_SOURCE_DOCUMENT_MEMBERSHIP_NOT_PROVEN');
    if(++n%1000===0)streamState(p);yield frozenStreamValue(binding);
  }
  if(n!==doc['members'])fail('CURRENT_SOURCE_DOCUMENT_GROUP_PARTIALLY_BOUND');streamState(p);onComplete();
}
export async function* iterateApprovedCurrentSourceDocuments(p:ApprovedCurrentSourceStream):AsyncGenerator<CurrentSourceStreamDocument> {
  const st=streamState(p);assertProductionAdmission(st.config,st.admission,'historical-import',st.approval.sha256);st.documentsConsumed=false;let n=0;
  const lookup=streamStatement(st,'SELECT ordinal,sha FROM documents WHERE group_key=?');
  for await(const {row,ordinal} of readApprovedCurrentSourceDocumentLines(st.root,st.manifest.documents)){
    const document=row as CurrentSourceDocumentPlan,expected=lookup.get(document.sourceGroupKey);
    if(!expected||expected['ordinal']!==ordinal||expected['sha']!==historyDigest(document))fail('CURRENT_SOURCE_STREAM_DOCUMENT_CHANGED');
    let membersConsumed=false;n++;
    yield Object.freeze({document:frozenStreamValue(document),documentProofSha256:String(expected['sha']),
      bindings:currentSourceDocumentBindings(p,document.sourceGroupKey,()=>{membersConsumed=true;})});
    if(!membersConsumed)fail('CURRENT_SOURCE_DOCUMENT_BINDINGS_NOT_CONSUMED');if(n%500===0)streamState(p);
  }
  if(n!==p.counts.documents)fail('CURRENT_SOURCE_SOURCE_COVERAGE_INCOMPLETE');streamState(p);st.documentsConsumed=true;
}
/** Must run before the existing native/session COMMIT guard; complete consumption and every validated original are required. */
export async function assertApprovedCurrentSourceStreamUnchanged(p:ApprovedCurrentSourceStream,keepAlive?:()=>Promise<void>):Promise<void> {
  const st=streamState(p);assertProductionAdmission(st.config,st.admission,'historical-import',st.approval.sha256);
  if(!st.mappingsConsumed||!st.observationsConsumed||!st.documentsConsumed)fail('CURRENT_SOURCE_STREAM_NOT_FULLY_CONSUMED');
  let lastHeartbeat=Date.now();
  for(const row of streamStatement(st,'SELECT file,signature FROM artifacts').iterate()){
    if(streamFileSignature(resolve(st.root,String(row['file'])))!==row['signature'])fail('ORIGINAL_ARTIFACT_HASH_CHANGED');
    if(Date.now()-lastHeartbeat>=2000){if(keepAlive)await keepAlive();lastHeartbeat=Date.now();}
  }
  await currentExportArtifactPath(st.root,st.approval);streamState(p);
}
export function disposeApprovedCurrentSourceStream(p:ApprovedCurrentSourceStream):void {
  const st=currentSourceStreams.get(p);if(!st||st.disposed)return;st.disposed=true;currentSourceStreams.delete(p);st.db.close();
}

export const currentSourceBytesSha256=(bytes:Buffer):string=>createHash('sha256').update(bytes).digest('hex');

export interface CurrentSourceImportReceipt {
  readonly schemaVersion:'T32-CURRENT-SOURCE-IMPORT-RECEIPT-v1';readonly approvalManifestSha256:string;
  readonly target:ReturnType<typeof productionTarget>;readonly writes:number;readonly observations:number;
  readonly documents:readonly CurrentSourceActualDocument[];readonly readonly:true;readonly auditAllowed:false;
}
async function checkedSession(client:PoolClient,c:DatabaseConfig,admission:ProductionAdmission,sourceSha:string):Promise<void> {
  await assertProductionSession({async query<Row extends QueryResultRow>(sql:string,values=[]) {
    const statement={text:sql,values:[...values],queryMode:'extended'};return client.query<Row>(statement);
  }},c,admission,'historical-import',sourceSha,'migrator');
}
/** Actual mapping rows and physical entities, not an unsigned late-receipt claim, authorize body references. */
async function verifyLateMappings(client:PoolClient,c:DatabaseConfig,root:string,p:Pick<PreparedCurrentSourceBodies,'manifest'>,mappings:AsyncIterable<CurrentQuantityMapping>):Promise<void> {
  const path=await currentExportArtifactPath(root,p.manifest.quantityIdentityPlan),plans=new Map<string,CurrentQuantityIdentity>();
  for await(const {row} of currentExportLines(path)){const v=row as CurrentQuantityIdentity;const key=v.kind+':'+v.targetKey;
    if(plans.has(key))fail('CURRENT_SOURCE_IDENTITY_PLAN_DUPLICATED');plans.set(key,v);}
  const r=ident(c.schemas.runtime),s=ident(c.schemas.source);
  const actual=(await client.query<{kind:string;target_key:string;id:string;generated_in_target:boolean;evidence_sha256:string}>(
    `SELECT kind,target_key,id,generated_in_target,evidence_sha256 FROM ${r}.inventory_quantity_identity`)).rows;
  const identities=new Map(actual.map(v=>[v.kind+':'+v.target_key,v]));
  const skus=new Set((await client.query<{id:string}>(`SELECT id FROM ${s}.variant UNION SELECT id FROM ${r}.variant_overlay`)).rows.map(x=>x.id));
  const warehouses=new Set((await client.query<{id:string}>(`SELECT id FROM ${s}.warehouse UNION SELECT id FROM ${r}.master_reference_overlay WHERE kind='warehouses'`)).rows.map(x=>x.id));
  for await(const mapping of mappings){
    for(const [kind,key,id] of [['WAREHOUSE',mapping.runtimeWarehouseKey,mapping.runtimeWarehouseId],['SKU',mapping.runtimeSkuKey,mapping.runtimeSkuId]] as const){
      const plan=plans.get(kind+':'+key),row=identities.get(kind+':'+key);
      if(!plan||!row||row.id!==id||row.evidence_sha256!==plan.evidenceSha256
        ||(plan.existingId===null?row.generated_in_target!==true:row.generated_in_target!==false||plan.existingId!==id))fail('CURRENT_SOURCE_LATE_ID_NOT_ACTUALLY_CREATED_FROM_SIGNED_PLAN');
    }
    if(!skus.has(mapping.runtimeSkuId)||!warehouses.has(mapping.runtimeWarehouseId))fail('CURRENT_SOURCE_ACTUAL_QUANTITY_ENTITY_MISSING');
  }
}
/** Original modes are untouched; current inherited source is immutable observation or a proved readonly document. */
export async function importApprovedCurrentSourceBodies(c:DatabaseConfig,admission:ProductionAdmission,root:string,
  approval:CurrentExportArtifact,late:CurrentSourceMaterialization,importOperatorId:string):Promise<CurrentSourceImportReceipt> {
  const config=readDatabaseConfig({APP_ENV:c.environment,POSTGRES_HOST:c.host,POSTGRES_PORT:String(c.port),POSTGRES_DB:c.database,
    POSTGRES_USER:c.user,POSTGRES_ROLE_PREFIX:c.roles.app.replace(/_app$/,''),POSTGRES_INSTANCE_ID:c.instanceId,POSTGRES_CLUSTER_ID:c.clusterId,
    POSTGRES_SOURCE_SCHEMA:c.schemas.source,POSTGRES_RUNTIME_SCHEMA:c.schemas.runtime,POSTGRES_AUTH_SCHEMA:c.schemas.auth,
    POSTGRES_CONTROL_SCHEMA:c.schemas.control,POSTGRES_SSLMODE:c.sslmode,...(c.passfile?{POSTGRES_PASSFILE:c.passfile}:{})});
  if(!same(config.roles,c.roles)||!text(importOperatorId))fail('CURRENT_SOURCE_EXPLICIT_MAINTENANCE_CONFIG_REQUIRED');
  const p=await prepareApprovedCurrentSourceStream(config,admission,root,approval,late);
  const pool=new Pool({host:config.host,port:config.port,database:config.database,user:config.roles.migrator,
    password:passwordProvider({...config,user:config.roles.migrator}),ssl:config.sslmode==='verify-full'?{rejectUnauthorized:true}:false,
    sslnegotiation:'postgres',max:1,connectionTimeoutMillis:5000,statement_timeout:30000,lock_timeout:5000,
    idle_in_transaction_session_timeout:15000,options:'-c search_path=pg_catalog -c timezone=UTC',application_name:'naijue-t32-approved-current-source'});
  const s=ident(config.schemas.source),r=ident(config.schemas.runtime),actualDocuments:CurrentSourceActualDocument[]=[];
  let client:PoolClient|undefined,writes=0;
  try{
    client=await pool.connect();await client.query('BEGIN');await client.query(identityAssertionSql(config,'migrator'));
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[config.instanceId+':0:idempotency:current-source:'+approval.sha256]);
    await checkedSession(client,config,admission,approval.sha256);
    await client.query(`SET LOCAL ROLE ${ident(config.roles.runtime)}`);
    const actor=(await client.query(`SELECT id FROM ${r}.operator WHERE id=$1 AND role='ADMIN' AND enabled`,[importOperatorId])).rows[0];
    if(!actor)fail('CURRENT_SOURCE_REAL_ERP_MAINTENANCE_OPERATOR_REQUIRED');
    await verifyLateMappings(client,config,root,p,iterateApprovedCurrentSourceMappings(p));
    await client.query('RESET ROLE');await client.query(`SET LOCAL ROLE ${ident(config.roles.source)}`);
    const prior=(await client.query<{id:string;status:string}>(`SELECT id,status FROM ${s}.import_batch WHERE sha256=$1 AND importer_version=$2`,
      [approval.sha256,currentSourceContract.schemaVersion])).rows;
    if(prior.length>1)fail('CURRENT_SOURCE_IMPORT_BATCH_CONFLICT');
    let batchId=prior[0]?.id;
    if(!batchId){batchId=(await client.query<{id:string}>(`INSERT INTO ${s}.import_batch(file_name,sha256,importer_version,status,committed_at)
      VALUES($1,$2,$3,'COMMITTED',transaction_timestamp()) RETURNING id`,[approval.file,approval.sha256,currentSourceContract.schemaVersion])).rows[0]?.id;writes++;}
    if(!batchId||prior[0]&&prior[0].status!=='COMMITTED')fail('CURRENT_SOURCE_IMPORT_BATCH_CONFLICT');
    let chunk:Record<string,unknown>[]=[],bytes=2;
    const flush=async():Promise<void>=>{
      if(!chunk.length)return;
      await client!.query(`INSERT INTO ${s}.source_record(batch_id,source_type,sheet_name,row_number,raw_value,source_key)
        SELECT $1::uuid,'CURRENT_SOURCE_ROW_OBSERVATION',x.sheet,x.row,x.body,x.key
        FROM jsonb_to_recordset($2::jsonb) x(sheet text,row integer,body jsonb,key text)
        WHERE NOT EXISTS(SELECT 1 FROM ${s}.source_record old WHERE old.batch_id=$1::uuid AND old.source_key=x.key)`,[batchId,JSON.stringify(chunk)]);
      const stored=(await client!.query<{source_key:string;raw_value:unknown}>(`SELECT source_key,raw_value FROM ${s}.source_record
        WHERE batch_id=$1::uuid AND source_key=ANY($2::text[])`,[batchId,chunk.map(x=>x['key'])])).rows;
      const rows=new Map(stored.map(x=>[x.source_key,x.raw_value]));
      if(chunk.some(x=>!same(rows.get(String(x['key'])),x['body'])))fail('CURRENT_SOURCE_OBSERVATION_READBACK_CHANGED');
      writes++;chunk=[];bytes=2;
    };
    for await(const {storageOrdinal,observation,binding} of iterateApprovedCurrentSourceObservations(p)){
      const row={sheet:'CURRENT_SOURCE_ENDPOINT_OBSERVATIONS',row:storageOrdinal,
        key:observation.endpoint.sourceEndpointId,body:{namespace:'CURRENT_SOURCE_ROW_OBSERVATION',approvalManifestSha256:approval.sha256,
          readonly:true,auditAllowed:false,storageOrdinal,storageRowNumberSemantic:'IMPORT_OBSERVATION_ORDER_NOT_ORIGINAL_WORKSHEET_ROW',
          observation,binding,importOperatorId}};
      const n=Buffer.byteLength(JSON.stringify(row));if(n+2>262144)fail('CURRENT_SOURCE_OBSERVATION_TOO_LARGE');
      if(bytes+n>262144)await flush();chunk.push(row);bytes+=n+1;
    }
    await flush();await client.query('RESET ROLE');await client.query(`SET LOCAL ROLE ${ident(config.roles.runtime)}`);
    // One scalar-only lookup prevents a full source_identity scan for every imported document.
    const knownGroups=new Map<string,{id:string;revision:number}[]>();
    const approvedGroupKeys:string[]=[];for(const row of streamStatement(streamState(p),'SELECT group_key FROM documents').iterate())approvedGroupKeys.push(String(row['group_key']));
    const existingGroups=(await client.query<{id:string;current_revision:number;source_group_key:string}>(`SELECT id,current_revision,
      source_identity->'currentSourceBinding'->>'sourceGroupKey' source_group_key FROM ${r}.document
      WHERE source_identity->'currentSourceBinding'->>'sourceGroupKey'=ANY($1::text[])`,[approvedGroupKeys])).rows;
    for(const row of existingGroups){const values=knownGroups.get(row.source_group_key)??[];values.push({id:row.id,revision:row.current_revision});knownGroups.set(row.source_group_key,values);}
    for await(const {document,bindings:documentBindings} of iterateApprovedCurrentSourceDocuments(p)){
      const membership:CurrentSourceMaterializedBinding[]=[];for await(const binding of documentBindings)membership.push(binding);
      const sourceIdentity={currentSourceBinding:{schemaVersion:currentSourceContract.schemaVersion,contractSha256:currentSourceContractSha256,
        sourceGroupKey:document.sourceGroupKey,approvalManifestSha256:approval.sha256,target:productionTarget(config),readonly:true,auditAllowed:false,
        mode:'BOUND_READONLY_CURRENT_DOCUMENT',originalDocumentId:document.originalDocumentId,originalHistoricalRevision:document.originalHistoricalRevision,
        sourceCanonicalEventIds:[...new Set(membership.map(b=>b.sourceCanonicalEventId))],currentObservedState:document.currentObservedState,
        historicalStateTimelineConfirmed:false,historicalStateAtExactCutoffConfirmed:false,
        statusSemantic:'CURRENT_IMPORTED_READONLY_CONTAINER',documentProofSha256:historyDigest(document),
        originalArchiveEvidence:document.originalArchiveEvidence,groupingEvidence:document.groupingEvidence,
        bindings:membership.map(b=>({sourceEndpointId:b.sourceEndpointId,lineId:b.lineId,originalHistoricalSkuId:b.originalHistoricalSkuId,
          specNamespace:b.specNamespace,quantityMapping:b.quantityMapping}))}};
      const effective=document.currentObservedState==='生效',effectIdentity=effective?'baseline:current-source:'+historyDigest([approval.sha256,document.sourceGroupKey]):null;
      const status=effective?'APPROVED':['作废','废弃','已废弃'].includes(document.currentObservedState??'')?'DELETED':'UNAUDITED';
      const known=knownGroups.get(document.sourceGroupKey)??[];if(known.length>1)fail('CURRENT_SOURCE_RUNTIME_GROUP_AMBIGUOUS');
      const current=known.length?(await client.query<{id:string;body:unknown;source_identity:unknown;current_revision:number}>(`SELECT d.id,d.source_identity,d.current_revision,v.body
        FROM ${r}.document d JOIN ${r}.revision v ON v.document_id=d.id AND v.revision=d.current_revision
        WHERE d.id=$1::uuid`,[known[0]!.id])).rows:[];
      if(known.length&&(current.length!==1||current[0]!.current_revision!==known[0]!.revision))fail('CURRENT_SOURCE_IMPORTED_DOCUMENT_IMMUTABLE');
      if(current.length>1)fail('CURRENT_SOURCE_RUNTIME_GROUP_AMBIGUOUS');
      let id=current[0]?.id;
      if(id){if(current[0]!.current_revision!==document.archiveRevision||!same(current[0]!.body,document.body)||!same(current[0]!.source_identity,sourceIdentity))fail('CURRENT_SOURCE_IMPORTED_DOCUMENT_IMMUTABLE');}
      else{
        id=(await client.query<{id:string}>(`INSERT INTO ${r}.document(id,document_type,number,source_identity,status,baseline_was_included,current_effect_active,
          active_effect_identity,active_effect_revision,current_revision,version,business_day,original_auditor,original_audited_at)
          VALUES(gen_random_uuid(),$1,$2,$3::jsonb,$4,false,$5,$6,$7,$8,1,$9::date,$10,NULL) RETURNING id`,
          [document.documentType,document.sourceNumber,JSON.stringify(sourceIdentity),status,effective,effectIdentity,effective?document.archiveRevision:null,
            document.archiveRevision,document.businessDate,typeof document.body.header['audited_by']==='string'?document.body.header['audited_by']:null])).rows[0]?.id;
        if(!id)fail('CURRENT_SOURCE_RUNTIME_DOCUMENT_NOT_CREATED');
        await client.query(`INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id) VALUES($1::uuid,$2,true,$3::jsonb,NULL)`,
          [id,document.archiveRevision,JSON.stringify(document.body)]);writes+=2;
      }
      const body=(await client.query<{body:unknown}>(`SELECT body FROM ${r}.revision WHERE document_id=$1::uuid AND revision=$2`,[id,document.archiveRevision])).rows[0]?.body;
      if(!same(body,document.body))fail('CURRENT_SOURCE_ORIGINAL_FINANCIAL_BODY_CHANGED');
      actualDocuments.push({sourceGroupKey:document.sourceGroupKey,documentId:id,revision:document.archiveRevision,bodySha256:document.bodySha256,
        effectIdentity,approvalManifestSha256:approval.sha256,target:productionTarget(config)});
    }
    await client.query('RESET ROLE');
    await assertApprovedCurrentSourceStreamUnchanged(p,()=>checkedSession(client!,config,admission,approval.sha256));
    await checkedSession(client,config,admission,approval.sha256);
    await client.query('COMMIT');return {schemaVersion:'T32-CURRENT-SOURCE-IMPORT-RECEIPT-v1',approvalManifestSha256:approval.sha256,
      target:productionTarget(config),writes,observations:p.counts.observations,documents:actualDocuments,readonly:true,auditAllowed:false};
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>undefined);if(error instanceof CurrentSourceBodyError)throw error;throw databaseError(error);}
  finally{client?.release();try{disposeApprovedCurrentSourceStream(p);}finally{await pool.end();}}
}

const currentSourceMasterTables=new Set(['unit','brand','category','counterparty','fit','spec_dimension','spec_value','size_group','size_group_item',
  'barcode_scheme','barcode_scheme_version','barcode_scheme_segment','barcode_encoding_mapping','product','variant','variant_option','warehouse',
  'tplus_import_run','tplus_department','tplus_hall','tplus_employee','tplus_fund_account','tplus_party_role','tplus_payment_method','tplus_product_source']);
export interface CurrentSourceMasterMaterial {
  readonly schemaVersion:'T32-APPROVED-CURRENT-SOURCE-MASTERS-v1';
  readonly tables:readonly {table:string;columns:readonly string[];rows:number;file:string;sha256:string}[];
}
/** Catalogue name[] is not decoded by the pinned driver. Only complete text arrays authorize original-row registration. */
export function validateCurrentSourceMasterSchema(meta:unknown,expectedColumns:readonly string[]):readonly string[] {
  if(!meta||typeof meta!=='object')fail('CURRENT_SOURCE_ACTUAL_MASTER_SCHEMA_DIFFERS');
  const value=meta as {columns:unknown;primary_key:unknown};
  if(!Array.isArray(value.columns)||!Array.isArray(value.primary_key)||!value.primary_key.length
    ||!value.columns.every(text)||!value.primary_key.every(text)||!Array.isArray(expectedColumns)||!expectedColumns.every(text))
    fail('CURRENT_SOURCE_ACTUAL_MASTER_SCHEMA_DIFFERS');
  const columns=value.columns,primaryKey=value.primary_key;
  if(new Set(columns).size!==columns.length||new Set(primaryKey).size!==primaryKey.length
    ||!primaryKey.every(k=>columns.includes(k))||!same([...columns].sort(),[...expectedColumns].sort()))
    fail('CURRENT_SOURCE_ACTUAL_MASTER_SCHEMA_DIFFERS');
  return [...primaryKey];
}
/** Ordered physical source registration before T33 allocation; no generated historical or quantity IDs. */
export async function registerApprovedCurrentSourceMasters(c:DatabaseConfig,admission:ProductionAdmission,root:string,
  approval:CurrentExportArtifact):Promise<{registeredTables:number;registeredRows:number;target:ReturnType<typeof productionTarget>;approvalManifestSha256:string}> {
  assertProductionAdmission(c,admission,'historical-import',approval.sha256);
  const manifest=JSON.parse(readFileSync(await currentExportArtifactPath(root,approval),'utf8')) as ApprovedCurrentSourceBodies;
  if(manifest.schemaVersion!=='T32-APPROVED-CURRENT-SOURCE-BODIES-v1'||manifest.contractSha256!==currentSourceContractSha256
    ||manifest.dataClass!=='USER_APPROVED_CURRENT_SOURCE'||manifest.productionAuthorized!==true||!same(manifest.target,productionTarget(c)))fail('CURRENT_SOURCE_SIGNED_PLAN_REQUIRED');
  const material=JSON.parse(readFileSync(await currentExportArtifactPath(root,manifest.retainedMasterMaterial),'utf8')) as CurrentSourceMasterMaterial;
  if(material.schemaVersion!=='T32-APPROVED-CURRENT-SOURCE-MASTERS-v1'||!Array.isArray(material.tables)
    ||new Set(material.tables.map(t=>t.table)).size!==material.tables.length
    ||material.tables.some(t=>!currentSourceMasterTables.has(t.table)||!t.columns.length||!Number.isSafeInteger(t.rows)||t.rows<0))fail('CURRENT_SOURCE_ONLY_APPROVED_PHYSICAL_MASTERS_ALLOWED');
  const inputs:{table:string;columns:readonly string[];rows:ObjectRow[]}[]=[];
  for(const t of material.tables){const rows:ObjectRow[]=[];
    for await(const {row} of currentExportLines(await currentExportArtifactPath(root,{file:t.file,sha256:t.sha256}))){
      const value=row as ObjectRow;if(!same(Object.keys(value).sort(),[...t.columns].sort()))fail('CURRENT_SOURCE_ORIGINAL_MASTER_COLUMNS_CHANGED');rows.push(value);}
    if(rows.length!==t.rows)fail('CURRENT_SOURCE_ORIGINAL_MASTER_ROWS_CHANGED');inputs.push({table:t.table,columns:t.columns,rows});
  }
  const order=['tplus_import_run','unit','brand','fit','category','counterparty','spec_dimension','spec_value','size_group','size_group_item','barcode_scheme','barcode_scheme_version','barcode_scheme_segment','barcode_encoding_mapping','product','variant','variant_option','warehouse','tplus_department','tplus_payment_method','tplus_fund_account','tplus_hall','tplus_employee','tplus_party_role','tplus_product_source'];
  inputs.sort((a,b)=>order.indexOf(a.table)-order.indexOf(b.table));
  const pool=new Pool({host:c.host,port:c.port,database:c.database,user:c.roles.migrator,password:passwordProvider({...c,user:c.roles.migrator}),
    ssl:c.sslmode==='verify-full'?{rejectUnauthorized:true}:false,sslnegotiation:'postgres',max:1,connectionTimeoutMillis:5000,
    statement_timeout:30000,lock_timeout:5000,idle_in_transaction_session_timeout:15000,options:'-c search_path=pg_catalog -c timezone=UTC'});
  let client:PoolClient|undefined,count=0;
  try{
    client=await pool.connect();await client.query('BEGIN');await client.query(identityAssertionSql(c,'migrator'));
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[c.instanceId+':current-source-master-registration']);
    await checkedSession(client,c,admission,approval.sha256);await client.query(`SET LOCAL ROLE ${ident(c.roles.source)}`);
    const schema=ident(c.schemas.source);
    for(const table of inputs){
      const meta=(await client.query<{columns:unknown;primary_key:unknown}>(`SELECT
        ARRAY(SELECT attname::text FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum) columns,
        ARRAY(SELECT a.attname::text FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,n)
          JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY k.n) primary_key`,
        [schema+'.'+ident(table.table)])).rows[0];
      const primaryKey=validateCurrentSourceMasterSchema(meta,table.columns);
      const name=schema+'.'+ident(table.table),columns=table.columns.map(ident).join(',');
      // Typed source rows provide every column, including nullable and original ID fields; defaults cannot invent identities.
      const key=primaryKey.map(k=>`to_jsonb(stored)->${'$'+(primaryKey.indexOf(k)+2)}=to_jsonb(expected)->${'$'+(primaryKey.indexOf(k)+2)}`).join(' AND ');
      if(table.rows.length){
        await client.query(`INSERT INTO ${name}(${columns}) SELECT ${columns} FROM jsonb_populate_recordset(NULL::${name},$1::jsonb) ON CONFLICT DO NOTHING`,[JSON.stringify(table.rows)]);
        const invalid=(await client.query<{n:string}>(`SELECT count(*)::text n FROM jsonb_populate_recordset(NULL::${name},$1::jsonb) expected
          LEFT JOIN ${name} stored ON ${key} WHERE to_jsonb(stored) IS DISTINCT FROM to_jsonb(expected)`,[JSON.stringify(table.rows),...primaryKey])).rows[0]?.n;
        if(invalid!=='0')fail('CURRENT_SOURCE_ORIGINAL_MASTER_READBACK_DIFFERS');count+=table.rows.length;
      }
    }
    await client.query('RESET ROLE');await checkedSession(client,c,admission,approval.sha256);await client.query('COMMIT');
    return {registeredTables:inputs.length,registeredRows:count,target:productionTarget(c),approvalManifestSha256:approval.sha256};
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>undefined);if(error instanceof CurrentSourceBodyError)throw error;throw databaseError(error);}
  finally{client?.release();await pool.end();}
}
