import {createHash} from 'node:crypto';
import {createReadStream,lstatSync,readFileSync,realpathSync} from 'node:fs';
import {isAbsolute,relative,resolve} from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {createGunzip} from 'node:zlib';
import {formatScaled,parseScaled} from '../transactions/decimal.js';
import {HistoryError,historyDigest} from './history-plan.js';
import type {HistoryImportTarget} from './history-store.js';

export const currentExportPolicy='USER_CONFIRMED_CURRENT_EXPORT_TARGET_CALIBRATION';
export const currentExportMethod='DERIVED_FROM_TARGET_INVENTORY';
export type CurrentQuantityKey=readonly [string,string,string];
export interface CurrentExportArtifact {readonly file:string; readonly sha256:string}
export interface CurrentQuantityMapping {
  readonly sourceQuantityKey:CurrentQuantityKey;
  readonly runtimeWarehouseId:string; readonly runtimeSkuId:string;
  readonly runtimeWarehouseKey:string; readonly runtimeSkuKey:string;
  readonly warehouseHistoricalOriginalId:string|null; readonly sourceHistoricalOriginalSkuId:string|null;
  readonly identityKind:'CONFIRMED_HISTORICAL_SKU'|'CURRENT_TPLUS_SOURCE_SPEC_OBSERVATION'|'T03_CORRECTED_CURRENT_SPEC';
  readonly currentIdentityPromotedAsHistorical:false;
  readonly sourceEvidence:unknown;
  readonly display?:Readonly<Record<string,unknown>>;
}
export interface CurrentExportInput {
  readonly schemaVersion:'T33-CURRENT-EXPORT-INPUT-v1'; readonly runId:string; readonly dataClass:'NON_FINAL';
  readonly sourceQuantityPolicy:typeof currentExportPolicy; readonly quantityMethod:typeof currentExportMethod;
  readonly historicalTimelineCompletenessClaimed:false; readonly openingVersion:string;
  readonly target:HistoryImportTarget;
  readonly artifacts:{readonly endpoints:CurrentExportArtifact; readonly openings:CurrentExportArtifact;
    readonly fixedOpeningSnapshot:CurrentExportArtifact; readonly userConfirmation:CurrentExportArtifact;
    readonly mappingAdmission:CurrentExportArtifact; readonly mappings:CurrentExportArtifact; readonly ownerAdmission:CurrentExportArtifact};
  readonly counts:{readonly sourceEndpoints:number; readonly quantityKeys:number; readonly included:number; readonly excluded:number;
    readonly nullCanonicalIds:number; readonly fitReplacements:number; readonly nonzeroOpening:number; readonly negativeOpening:number; readonly positiveOpening:number};
}
interface OpeningRow {
  schemaVersion:string; dimensionKey:CurrentQuantityKey; warehouseOriginalId:string|null; sourceHistoricalOriginalSkuId:string|null;
  openingNature:string; confirmedOpeningQuantity:string; targetQuantity:string; targetBasis:string;
  targetIsExplicitSourceCell:boolean; targetSourceRows:readonly unknown[]; negativeQuantityPreserved:boolean;
}
interface FixedOpening {dimensionKey:CurrentQuantityKey; warehouseOriginalId:string|null; originalSkuId:string|null;
  derivedOpening:string; targetClosing:string; targetBasis:string; targetWasNumericReportObservation:boolean}
interface Endpoint {
  schemaVersion:string; sourceEndpointId:string; lineId:string; sourceCanonicalEventId:string|null;
  sourceFamily:string; quantityDimensionKey:CurrentQuantityKey; originalSourceDimensionKey:CurrentQuantityKey;
  measurementUnit:string; signedOriginalQuantity:string; includedInConfirmedBasis:boolean; selectedQuantity:string;
  currentObservedState:string|null; historicalStateTimelineConfirmed:false; historicalStateAtExactCutoffConfirmed:false;
  quantitySelectionPolicy:string; source:unknown; missingHistoricalEventIdentityFabricated:false; sourceForeignKeyChanged:false;
  fitCorrection:{lineId:string;sourceFamily:string;originalDimensionKey:CurrentQuantityKey;correctedDimensionKey:CurrentQuantityKey;
    measurementUnit:string; signedOriginalQuantity:string; included:boolean}|null;
}
export interface CurrentExportCell {
  readonly key:string; readonly mapping:CurrentQuantityMapping; readonly opening:string; readonly net:string;
  readonly endpointCount:number; readonly proof:Readonly<Record<string,unknown>>;
}
export interface PreparedCurrentExport {
  readonly input:CurrentExportInput; readonly manifestSha256:string; readonly body:Readonly<Record<string,unknown>>;
  readonly paths:Record<keyof CurrentExportInput['artifacts'],string>; readonly cells:readonly CurrentExportCell[];
  readonly counts:CurrentExportInput['counts'];
  readonly payloads:Record<'ENDPOINTS'|'OPENINGS'|'MAPPINGS',{sha256:string;bytes:number;rows:number}>;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export const currentExportByteDigest=(v:string):string=>createHash('sha256').update(v).digest('hex');
function reject(code:string):never {throw new HistoryError(code);}
export function currentQuantityKey(value:unknown):string {
  if (!Array.isArray(value) || value.length!==3 || value.some(v=>typeof v!=='string'||!v||v.trim()!==v||v.includes('\0'))
    || (value[2] as string).length>64) reject('CURRENT_EXPORT_QUANTITY_KEY_REQUIRED');
  return JSON.stringify(value);
}
export async function currentExportArtifactPath(root:string,artifact:CurrentExportArtifact):Promise<string> {
  if (!isAbsolute(root)||realpathSync(root)!==resolve(root)||!lstatSync(root).isDirectory()) reject('EXPLICIT_ARTIFACT_ROOT_REQUIRED');
  if (!artifact || typeof artifact.file!=='string' || !artifact.file || isAbsolute(artifact.file)
    || artifact.file.split('/').some(p=>!p||p==='.'||p==='..') || !/^[a-f0-9]{64}$/.test(artifact.sha256)) reject('CURRENT_EXPORT_ARTIFACT_BINDING_REQUIRED');
  const path=resolve(root,artifact.file);
  if (relative(root,path).startsWith('..') || realpathSync(path)!==path || !lstatSync(path).isFile()
    || /(?:^|\/)(?:\.env(?:\.|$)|[^/]*(?:password|secret|credential|passfile)[^/]*$)/i.test(artifact.file)) reject('ARTIFACT_PATH_REJECTED');
  const hash=createHash('sha256');for await(const bytes of createReadStream(path)) hash.update(bytes as Buffer);
  if (hash.digest('hex')!==artifact.sha256) reject('ORIGINAL_ARTIFACT_HASH_CHANGED');return path;
}
/** Bounded streaming input: exact source lines remain available for immutable persistence. */
export async function* currentExportLines(path:string):AsyncGenerator<{line:string;row:unknown;ordinal:number}> {
  const source=createReadStream(path),stream=path.endsWith('.gz')?source.pipe(createGunzip()):source;
  source.on('error',error=>stream.destroy(error));const decoder=new StringDecoder('utf8');let remaining='',ordinal=0;
  try {
    for await (const chunk of stream) {
      remaining+=decoder.write(chunk as Buffer);let end:number;
      while ((end=remaining.indexOf('\n'))>=0) {
        const line=remaining.slice(0,end);remaining=remaining.slice(end+1);
        if (!line || Buffer.byteLength(line+'\n')>262144) reject('CURRENT_EXPORT_SOURCE_ROW_TOO_LARGE_OR_EMPTY');
        yield {line:line+'\n',row:JSON.parse(line) as unknown,ordinal:++ordinal};
      }
      if (Buffer.byteLength(remaining)>262144) reject('CURRENT_EXPORT_SOURCE_ROW_TOO_LARGE_OR_EMPTY');
    }
    remaining+=decoder.end();if (remaining) reject('CURRENT_EXPORT_JSONL_FINAL_NEWLINE_REQUIRED');
  } finally {stream.destroy();source.destroy();}
}
/** Current state selection is explicit; missing history never becomes a forged T31 packet. */
export function selectCurrentExportEndpoint(value:unknown):{row:Endpoint;key:string;quantity:bigint;replaced:boolean} {
  const row=value as Endpoint;
  if (!row || row.schemaVersion!=='T35-SELECTED-SOURCE-ENDPOINT-v1' || typeof row.lineId!=='string' || !row.lineId
    || row.quantitySelectionPolicy!==currentExportPolicy || row.historicalStateTimelineConfirmed!==false
    || row.historicalStateAtExactCutoffConfirmed!==false || row.missingHistoricalEventIdentityFabricated!==false
    || row.sourceForeignKeyChanged!==false || !row.source || row.sourceCanonicalEventId!==null&&typeof row.sourceCanonicalEventId!=='string') reject('CURRENT_EXPORT_PROVENANCE_REQUIRED');
  const key=currentQuantityKey(row.quantityDimensionKey),original=currentQuantityKey(row.originalSourceDimensionKey);
  if (row.quantityDimensionKey[0]!==row.originalSourceDimensionKey[0] || row.quantityDimensionKey[2]!==row.originalSourceDimensionKey[2]
    || row.measurementUnit!==row.quantityDimensionKey[2]) reject('CURRENT_EXPORT_WAREHOUSE_OR_UNIT_CHANGED');
  if (row.sourceEndpointId!==currentExportByteDigest(JSON.stringify([row.lineId,row.sourceFamily])+'\n')) reject('CURRENT_EXPORT_ENDPOINT_ID_NOT_SOURCE_ROW_BOUND');
  const signed=parseScaled(row.signedOriginalQuantity,4,false);
  let included:boolean;
  if (['SALE','TRANSFER_IN','TRANSFER_OUT'].includes(row.sourceFamily)) {
    if (!['生效','未审','作废','废弃','已废弃'].includes(row.currentObservedState??'')) reject('CURRENT_EXPORT_STATE_REQUIRED');
    included=row.currentObservedState==='生效';
  } else if (['PURCHASE','STOCKTAKING_IN','STOCKTAKING_OUT'].includes(row.sourceFamily)) {
    if (row.currentObservedState!==null) reject('CURRENT_EXPORT_UNPROVEN_STATE');included=true;
  } else reject('CURRENT_EXPORT_FAMILY_REQUIRED');
  const quantity=included?signed:0n;
  if (row.includedInConfirmedBasis!==included || parseScaled(row.selectedQuantity,4,false)!==quantity) reject('CURRENT_EXPORT_SOURCE_SELECTION_MISMATCH');
  if (row.sourceFamily.startsWith('TRANSFER_')&&!row.sourceCanonicalEventId) reject('CURRENT_EXPORT_TRANSFER_SOURCE_ID_REQUIRED');
  if (key!==original) {
    const correction=row.fitCorrection;
    if (!correction || correction.lineId!==row.lineId || correction.sourceFamily!==row.sourceFamily
      || currentQuantityKey(correction.originalDimensionKey)!==original || currentQuantityKey(correction.correctedDimensionKey)!==key
      || correction.measurementUnit!==row.measurementUnit || parseScaled(correction.signedOriginalQuantity,4,false)!==signed
      || correction.included!==included) reject('CURRENT_EXPORT_SPEC_REPLACEMENT_NOT_BOUND');
  } else if (row.fitCorrection) reject('CURRENT_EXPORT_UNEXPECTED_SPEC_REPLACEMENT');
  return {row,key,quantity,replaced:key!==original};
}
function validateMapping(mapping:CurrentQuantityMapping,fixed:FixedOpening):void {
  const key=currentQuantityKey(mapping.sourceQuantityKey);
  if (key!==currentQuantityKey(fixed.dimensionKey) || !uuid(mapping.runtimeWarehouseId) || !uuid(mapping.runtimeSkuId)
    || mapping.runtimeWarehouseKey!=='WAREHOUSE:'+mapping.sourceQuantityKey[0] || typeof mapping.runtimeSkuKey!=='string' || !mapping.runtimeSkuKey
    || mapping.warehouseHistoricalOriginalId!==fixed.warehouseOriginalId || mapping.sourceHistoricalOriginalSkuId!==fixed.originalSkuId
    || mapping.currentIdentityPromotedAsHistorical!==false || !mapping.sourceEvidence) reject('CURRENT_EXPORT_MAPPING_ADMISSION_REQUIRED');
  if (fixed.warehouseOriginalId!==null&&mapping.runtimeWarehouseId!==fixed.warehouseOriginalId) reject('CURRENT_EXPORT_ORIGINAL_WAREHOUSE_CHANGED');
  if (fixed.originalSkuId!==null) {
    if (mapping.identityKind!=='CONFIRMED_HISTORICAL_SKU'||mapping.runtimeSkuId!==fixed.originalSkuId||mapping.sourceQuantityKey[1]!==fixed.originalSkuId) reject('CURRENT_EXPORT_ORIGINAL_SKU_CHANGED');
  } else if (!['CURRENT_TPLUS_SOURCE_SPEC_OBSERVATION','T03_CORRECTED_CURRENT_SPEC'].includes(mapping.identityKind)) reject('CURRENT_EXPORT_CURRENT_ID_PROMOTED_AS_HISTORICAL');
}
export async function prepareCurrentExport(root:string,input:CurrentExportInput):Promise<PreparedCurrentExport> {
  input=structuredClone(input);
  if (!input || input.schemaVersion!=='T33-CURRENT-EXPORT-INPUT-v1' || input.dataClass!=='NON_FINAL' || !input.runId || input.runId.length>200
    || input.sourceQuantityPolicy!==currentExportPolicy || input.quantityMethod!==currentExportMethod || input.historicalTimelineCompletenessClaimed!==false
    || !input.openingVersion || !input.target || Object.values(input.counts??{}).some(n=>!Number.isSafeInteger(n)||n<0)) reject('EXPLICIT_NON_FINAL_CURRENT_EXPORT_INPUT_REQUIRED');
  const paths={} as PreparedCurrentExport['paths'];
  for (const name of ['endpoints','openings','fixedOpeningSnapshot','userConfirmation','mappingAdmission','mappings','ownerAdmission'] as const) paths[name]=await currentExportArtifactPath(root,input.artifacts[name]);
  const confirmation=JSON.parse(readFileSync(paths.userConfirmation,'utf8')) as Record<string,unknown>;
  if (confirmation['userConfirmedCurrentOpeningAmounts']!==true || confirmation['openingNature']!==currentExportMethod
    || confirmation['version']!==input.openingVersion || confirmation['fullHistoricalStateTimelineProven']!==false
    || confirmation['productionWriteAuthorizedByThisSave']!==false) reject('CURRENT_EXPORT_FIXED_USER_CONFIRMATION_REQUIRED');
  const admission=JSON.parse(readFileSync(paths.mappingAdmission,'utf8')) as Record<string,unknown>;
  if (admission['quantityImportAuthorized']!==true || admission['sourceQuantityPolicy']!==currentExportPolicy || !admission['admissionEvidence']
    || historyDigest(admission['target'])!==historyDigest(input.target) || admission['runId']!==input.runId
    || admission['ownerAdmissionSha256']!==input.artifacts.ownerAdmission.sha256
    || admission['mappingArtifactSha256']!==input.artifacts.mappings.sha256) reject('CURRENT_EXPORT_TARGET_BOUND_ADMISSION_REQUIRED');
  const owner=JSON.parse(readFileSync(paths.ownerAdmission,'utf8')) as Record<string,unknown>;
  if (owner['quantityImportAuthorized']!==true || owner['sourceQuantityPolicy']!==currentExportPolicy || !owner['admissionEvidence']) reject('CURRENT_EXPORT_T32_OWNER_ADMISSION_REQUIRED');
  const fixed=new Map<string,FixedOpening>();
  const payloadHashes={ENDPOINTS:createHash('sha256'),OPENINGS:createHash('sha256'),MAPPINGS:createHash('sha256')};
  const payloads={ENDPOINTS:{sha256:'',bytes:0,rows:0},OPENINGS:{sha256:'',bytes:0,rows:0},MAPPINGS:{sha256:'',bytes:0,rows:0}};
  const payload=(kind:keyof typeof payloads,line:string):void=>{payloadHashes[kind].update(line);payloads[kind].bytes+=Buffer.byteLength(line);payloads[kind].rows++;};
  for await (const {row:value} of currentExportLines(paths.fixedOpeningSnapshot)) {
    const row=value as FixedOpening,key=currentQuantityKey(row.dimensionKey);
    if (fixed.has(key)||row.warehouseOriginalId!==null&&!uuid(row.warehouseOriginalId)||row.originalSkuId!==null&&!uuid(row.originalSkuId)) reject('CURRENT_EXPORT_FIXED_OPENING_IDENTITY_REQUIRED');
    parseScaled(row.derivedOpening,4,false);fixed.set(key,row);
  }
  const mappings=new Map<string,CurrentQuantityMapping>(),runtimeKeys=new Set<string>();
  for await (const {row:value,line} of currentExportLines(paths.mappings)) {
    payload('MAPPINGS',line);
    const mapping=value as CurrentQuantityMapping,key=currentQuantityKey(mapping.sourceQuantityKey),prior=fixed.get(key);
    if (!prior||mappings.has(key)) reject('CURRENT_EXPORT_MAPPING_COVERAGE_MISMATCH');validateMapping(mapping,prior);
    const runtime=currentQuantityKey([mapping.runtimeWarehouseId,mapping.runtimeSkuId,mapping.sourceQuantityKey[2]]);
    if (runtimeKeys.has(runtime)) reject('CURRENT_EXPORT_RUNTIME_IDENTITY_MERGE_REJECTED');runtimeKeys.add(runtime);mappings.set(key,mapping);
  }
  if (fixed.size!==input.counts.quantityKeys||mappings.size!==fixed.size) reject('CURRENT_EXPORT_MAPPING_COVERAGE_MISMATCH');
  const totals=new Map<string,{quantity:bigint;count:number;included:number;ids:string[];family:Map<string,bigint>}>(),seen=new Set<string>();
  const transfers=new Map<string,bigint>();
  const counts={sourceEndpoints:0,quantityKeys:0,included:0,excluded:0,nullCanonicalIds:0,fitReplacements:0,nonzeroOpening:0,negativeOpening:0,positiveOpening:0};
  for await (const {row:value,line} of currentExportLines(paths.endpoints)) {
    payload('ENDPOINTS',line);
    const {row,key,quantity,replaced}=selectCurrentExportEndpoint(value);
    if (seen.has(row.sourceEndpointId)) reject('CURRENT_EXPORT_DUPLICATE_SOURCE_ENDPOINT');seen.add(row.sourceEndpointId);
    if (!fixed.has(key)) reject('CURRENT_EXPORT_ENDPOINT_OUTSIDE_FIXED_COVERAGE');
    let total=totals.get(key);if (!total) {total={quantity:0n,count:0,included:0,ids:[],family:new Map()};totals.set(key,total);}
    total.quantity+=quantity;total.count++;total.included+=Number(row.includedInConfirmedBasis);total.ids.push(row.sourceEndpointId);
    total.family.set(row.sourceFamily,(total.family.get(row.sourceFamily)??0n)+quantity);
    counts.sourceEndpoints++;counts[row.includedInConfirmedBasis?'included':'excluded']++;counts.nullCanonicalIds+=Number(row.sourceCanonicalEventId===null);counts.fitReplacements+=Number(replaced);
    if (row.sourceFamily.startsWith('TRANSFER_')) {
      const transfer=JSON.stringify([row.sourceCanonicalEventId,row.quantityDimensionKey[1],row.measurementUnit]);transfers.set(transfer,(transfers.get(transfer)??0n)+quantity);
    }
  }
  if ([...transfers.values()].some(n=>n!==0n)) reject('CURRENT_EXPORT_TRANSFER_NOT_CONSERVED');
  const cells:CurrentExportCell[]=[],opened=new Set<string>();
  for await (const {row:value,line,ordinal} of currentExportLines(paths.openings)) {
    payload('OPENINGS',line);
    const row=value as OpeningRow,key=currentQuantityKey(row.dimensionKey),prior=fixed.get(key),mapping=mappings.get(key);
    if (!prior||!mapping||opened.has(key)||row.schemaVersion!=='T35-CONFIRMED-OPENING-CONSUMPTION-v1'||row.openingNature!==currentExportMethod
      || row.warehouseOriginalId!==prior.warehouseOriginalId||row.sourceHistoricalOriginalSkuId!==prior.originalSkuId
      || parseScaled(row.confirmedOpeningQuantity,4,false)!==parseScaled(prior.derivedOpening,4,false)
      || parseScaled(row.targetQuantity,4,false)!==parseScaled(prior.targetClosing,4,false)
      || row.targetBasis!==prior.targetBasis || row.targetIsExplicitSourceCell!==prior.targetWasNumericReportObservation
      || row.targetIsExplicitSourceCell&&!row.targetSourceRows?.length || row.negativeQuantityPreserved!==true) reject('CURRENT_EXPORT_FIXED_OPENING_OR_TARGET_CHANGED');
    opened.add(key);const opening=parseScaled(row.confirmedOpeningQuantity,4,false),total=totals.get(key),net=total?.quantity??0n;
    // Target comparison is an audit; the saved opening is never recalculated from it.
    if (opening+net!==parseScaled(row.targetQuantity,4,false)) reject('CURRENT_EXPORT_FIXED_OPENING_SOURCE_TARGET_DIFFERENCE');
    const proof={quantityMethod:currentExportMethod,sourceQuantityPolicy:currentExportPolicy,openingVersion:input.openingVersion,
      historicalTimelineCompletenessClaimed:false,binding:mapping,
      openingEvidence:{artifact:input.artifacts.openings,ordinal,sourceRowSha256:currentExportByteDigest(line),fixedSnapshot:input.artifacts.fixedOpeningSnapshot},
      sourceEvidence:{artifact:input.artifacts.endpoints,endpointCount:total?.count??0,endpointIdsSha256:historyDigest(total?.ids??[]),
        includedCount:total?.included??0,excludedCount:(total?.count??0)-(total?.included??0)},
      sourceFamilyTotals:Object.fromEntries([...(total?.family??[])].map(([family,q])=>[family,formatScaled(q,4)])),
      targetQuantity:row.targetQuantity,targetBasis:row.targetBasis,targetIsExplicitSourceCell:row.targetIsExplicitSourceCell};
    cells.push({key,mapping,opening:formatScaled(opening,4),net:formatScaled(net,4),endpointCount:total?.count??0,proof});
    counts.quantityKeys++;counts.nonzeroOpening+=Number(opening!==0n);counts.negativeOpening+=Number(opening<0n);counts.positiveOpening+=Number(opening>0n);
  }
  if (opened.size!==fixed.size || historyDigest(counts)!==historyDigest(input.counts)) reject('CURRENT_EXPORT_SOURCE_COVERAGE_COUNT_MISMATCH');
  for (const kind of ['ENDPOINTS','OPENINGS','MAPPINGS'] as const) payloads[kind].sha256=payloadHashes[kind].digest('hex');
  const body={schemaVersion:'T33-CURRENT-EXPORT-MANIFEST-v1',dataClass:'NON_FINAL',sourceQuantityPolicy:currentExportPolicy,quantityMethod:currentExportMethod,
    historicalTimelineCompletenessClaimed:false,cutoff:null,originalHistoricalOpeningProven:false,inventoryReportIsQuantityInput:true,
    openingVersion:input.openingVersion,inputSha256:historyDigest(input),artifacts:input.artifacts,counts,
    selection:'CURRENT_SALE_AND_TRANSFER_EFFECTIVE; PURCHASE_AND_STOCKTAKING_CURRENT_STATE_UNKNOWN_ASSUMPTION',
    fixedOpeningRecomputed:false,sourceEndpointIdsAreHistoricalBusinessIds:false,quantityKeyMappingsSha256:input.artifacts.mappings.sha256,payloads};
  return {input,body,manifestSha256:historyDigest({input,body}),paths,cells,counts,payloads};
}
