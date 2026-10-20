import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {DatabaseConfig} from '../../database/config.js';
import {assertProductionAdmission,productionTarget,withProductionNativeCodeImport,type ProductionAdmission,
  type ProductionNativeCodeSession,type ProductionNativeCodeTable} from '../../database/production-admission.js';
import type {SqlValue} from '../../database/session.js';
import {DataAccessError} from '../../database/access-errors.js';
import {currentExportArtifactPath,currentExportLines,type CurrentExportArtifact} from '../inventory/current-export-plan.js';
import type {CurrentQuantityIdentity} from '../inventory/current-export-identity.js';
import {historyDigest} from '../inventory/history-plan.js';
import {readCodeOnlySkuEntityRoutes,type CodeOnlySkuEntityBinding,type CodeOnlySkuEntityRoute} from '../inventory/formal-current-baseline.js';
import {currentSourceContractSha256,type ApprovedCurrentSourceBodies,type CurrentSourceOriginalVariantMaterial} from './current-source-body.js';

type Row=Readonly<Record<string,unknown>>;
export const approvedCurrentCodeCoreSha256='29fb21e48e63d3472d6c12f22d4adc143f2e552320a6d0e487f62ae2132fe626';
export class CurrentSourceCodeError extends Error {
  constructor(readonly code:string){super(code);this.name='CurrentSourceCodeError';}
}
function fail(code:string):never {throw new CurrentSourceCodeError(code);}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&!v.includes('\0');
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export interface ApprovedCoreCode extends Row {
  readonly key:string;readonly kind:'PRIMARY'|'RETIRED_PRIMARY'|'PRODUCT';readonly code:string;
  readonly active:boolean;readonly productKey:string;readonly skuKey:string|null;readonly source:Row;
}
interface CoreEntity extends Row {readonly kind:string;readonly key:string;readonly id:string|null;readonly code:string|null;readonly body:Row}
export interface CurrentSourceCodeCore {readonly codes:readonly ApprovedCoreCode[];readonly entities:readonly CoreEntity[]}
export interface OriginalPrimaryCode extends Row {
  readonly barcode:string;readonly sku_id:string;readonly product_id:string;readonly scheme_id:string;
  readonly evidence:string|Row;readonly created_at:string;readonly kind:'PRIMARY';readonly identityVerified:true;readonly recomputed:false;
}
export interface CurrentSourceCodePlan {
  readonly schemaVersion:'T32-APPROVED-CURRENT-SOURCE-CODES-v1';readonly core:CurrentExportArtifact;
  readonly originalPrimaryCodes:CurrentExportArtifact;readonly currentSkuIdentities:CurrentExportArtifact;
  /** An existing retained original import batch is a storage FK, never a fabricated new T+ import. */
  readonly sourceProductCodeBatchId:string;
  readonly counts:{readonly PRIMARY:number;readonly RETIRED_PRIMARY:number;readonly PRODUCT:number};
}
export interface CurrentSourceCodeBinding {
  readonly coreSkuKey:string;readonly productId:string;readonly skuId:string;readonly originalSkuId:null;
  readonly targetKey:string;
}
export interface CurrentSourceCodeBindings {
  readonly schemaVersion:'T33-ACTUAL-CURRENT-CODE-SKU-BINDINGS-v1';readonly target:ReturnType<typeof productionTarget>;
  readonly bodyApprovalManifestSha256:string;readonly coreSha256:string;readonly currentSkuIdentitiesSha256:string;
  readonly bindings:readonly CurrentSourceCodeBinding[];
}
interface CodeProjection {
  readonly original:ApprovedCoreCode;readonly productId:string;readonly productCode:string;
  readonly skuId:string|null;readonly skuKey:string|null;readonly originalSkuId:string|null;
  readonly schemeId:string|null;readonly schemeMeaning:string|null;readonly originalPrimary:OriginalPrimaryCode|null;
}
export interface PreparedCurrentSourceCodes {
  readonly approval:CurrentExportArtifact;readonly target:ReturnType<typeof productionTarget>;
  readonly plan:CurrentSourceCodePlan;readonly rows:readonly CodeProjection[];
  readonly currentIdentities:readonly CurrentQuantityIdentity[];readonly late:CurrentSourceCodeBindings;
  readonly codeOnlyBinding:CodeOnlySkuEntityBinding;readonly codeOnlyRoutes:readonly CodeOnlySkuEntityRoute[];
}
const preparedCodes=new WeakMap<object,{readonly admission:ProductionAdmission;readonly value:PreparedCurrentSourceCodes}>();
/** No ID or barcode allocation. The exact core supplies code kinds; identity aliases are never consumed. */
export function projectCurrentSourceCodes(core:CurrentSourceCodeCore,primary:readonly OriginalPrimaryCode[],
  late:readonly CurrentSourceCodeBinding[],primaryArtifact:CurrentExportArtifact):readonly CodeProjection[] {
  const products=new Map(core.entities.filter(e=>e.kind==='product').map(e=>[e.key,e]));
  const skus=new Map(core.entities.filter(e=>e.kind==='sku').map(e=>[e.key,e]));
  const originals=new Map(primary.map(p=>[p.barcode,p])),actual=new Map(late.map(b=>[b.coreSkuKey,b]));
  if(originals.size!==primary.length||actual.size!==late.length)fail('CURRENT_CODE_INPUT_IDENTITY_DUPLICATE');
  const codes=new Set<string>(),keys=new Set<string>(),usedLate=new Set<string>();
  const result:CodeProjection[]=[];
  for(const c of core.codes){
    const p=products.get(c.productKey),s=c.skuKey===null?undefined:skus.get(c.skuKey);
    if(!['PRIMARY','RETIRED_PRIMARY','PRODUCT'].includes(c.kind)||!text(c.code)||c.code.length>80||!text(c.key)
      ||codes.has(c.code)||keys.has(c.key)||!p||!uuid(p.id)||!text(p.code)||!c.source
      ||c.active!==(c.kind!=='RETIRED_PRIMARY')||(c.kind==='PRODUCT'?c.skuKey!==null:!s))fail('CURRENT_CODE_EXACT_CORE_RECORD_REQUIRED');
    codes.add(c.code);keys.add(c.key);
    let skuId:string|null=null,originalSkuId:string|null=null;
    if(s){
      if(s.body['productKey']!==c.productKey)fail('CURRENT_CODE_PRODUCT_SKU_BINDING_CHANGED');
      if(s.id!==null){if(!uuid(s.id)||actual.has(s.key))fail('CURRENT_CODE_ORIGINAL_SKU_REPLACED');skuId=s.id;originalSkuId=s.id;}
      else{
        const a=actual.get(s.key);
        if(c.kind!=='PRIMARY'||!a||!uuid(a.skuId)||a.productId!==p.id||a.originalSkuId!==null
          ||a.targetKey!=='CATALOG:'+s.key)fail('CURRENT_CODE_ACTUAL_CURRENT_SKU_BINDING_REQUIRED');
        skuId=a.skuId;usedLate.add(s.key);
      }
    }
    let originalPrimary:OriginalPrimaryCode|null=null,schemeId:string|null=null,schemeMeaning:string|null=null;
    if(c.kind==='PRIMARY'&&c.source['path']===primaryArtifact.file){
      const raw=originals.get(c.code);
      if(c.source['sha256']!==primaryArtifact.sha256||!raw||raw.sku_id!==skuId||raw.product_id!==p.id
        ||raw.kind!=='PRIMARY'||raw.identityVerified!==true||raw.recomputed!==false
        ||!text(raw.scheme_id)||!Number.isFinite(Date.parse(raw.created_at)))fail('CURRENT_CODE_ORIGINAL_PRIMARY_CHANGED');
      originalPrimary=raw;schemeId=raw.scheme_id;schemeMeaning='PRESERVED_NATIVE_ORIGINAL_SCHEME_ID';
    }else if(c.kind==='PRIMARY'){
      const fields=p.body['approvedCurrentMasterFields'] as Row|undefined;
      if(!sha(c.source['sha256'])||!Number.isSafeInteger(c.source['row'])||!fields||!text(fields['schemeId']))fail('CURRENT_CODE_EXPLICIT_CORRECTION_EVIDENCE_REQUIRED');
      schemeId=fields['schemeId'];schemeMeaning='EXPLICIT_APPROVED_CURRENT_PRODUCT_SCHEME_ID';
    }else if(c.kind==='RETIRED_PRIMARY'){
      if(!sha(c.source['sourceSha256'])||!text(c.source['schemeName'])||c.source['generated']!==false
        ||c.source['originalBarcode']!==c.code)fail('CURRENT_CODE_EXACT_RETIRED_SOURCE_REQUIRED');
      // The supplied scheme label is preserved verbatim; it is not claimed as a missing native scheme ID.
      schemeId=c.source['schemeName'];schemeMeaning='PRESERVED_SOURCE_SCHEME_LABEL_NOT_NATIVE_SCHEME_ID';
    }else if(!sha(c.source['sourceSha256'])||!Number.isSafeInteger(c.source['row']))fail('CURRENT_CODE_EXACT_PRODUCT_SOURCE_REQUIRED');
    result.push({original:structuredClone(c),productId:p.id,productCode:p.code,skuId,skuKey:c.skuKey,originalSkuId,
      schemeId,schemeMeaning,originalPrimary:originalPrimary?structuredClone(originalPrimary):null});
  }
  if(usedLate.size!==late.length||new Set(result.filter(r=>r.original.kind==='PRIMARY').map(r=>r.skuId)).size!==result.filter(r=>r.original.kind==='PRIMARY').length)
    fail('CURRENT_CODE_EXTRA_OR_MERGED_SKU_BINDINGS');
  return result;
}
/** Source bytes and symbolic identities are frozen before allocation; actual bindings remain a separate receipt. */
export async function prepareApprovedCurrentSourceCodes(c:DatabaseConfig,admission:ProductionAdmission,root:string,
  approval:CurrentExportArtifact,late:CurrentSourceCodeBindings):Promise<PreparedCurrentSourceCodes> {
  assertProductionAdmission(c,admission,'historical-import',approval.sha256);
  const manifest=JSON.parse(readFileSync(await currentExportArtifactPath(root,approval),'utf8')) as ApprovedCurrentSourceBodies
    & {readonly codeMaterial:CurrentExportArtifact;readonly codeOnlySkuEntities:CodeOnlySkuEntityBinding};
  if(manifest.schemaVersion!=='T32-APPROVED-CURRENT-SOURCE-BODIES-v1'||manifest.contractSha256!==currentSourceContractSha256
    ||manifest.dataClass!=='USER_APPROVED_CURRENT_SOURCE'||manifest.productionAuthorized!==true
    ||historyDigest(manifest.target)!==historyDigest(productionTarget(c))||!manifest.codeMaterial)fail('CURRENT_CODE_SIGNED_BODY_MATERIAL_REQUIRED');
  const plan=JSON.parse(readFileSync(await currentExportArtifactPath(root,manifest.codeMaterial),'utf8')) as CurrentSourceCodePlan;
  if(plan.schemaVersion!=='T32-APPROVED-CURRENT-SOURCE-CODES-v1'||plan.core.sha256!==approvedCurrentCodeCoreSha256
    ||!text(plan.sourceProductCodeBatchId)||!plan.counts||Object.values(plan.counts).some(n=>!Number.isSafeInteger(n)||n<0))fail('CURRENT_CODE_EXACT_APPROVED_PLAN_REQUIRED');
  if(late.schemaVersion!=='T33-ACTUAL-CURRENT-CODE-SKU-BINDINGS-v1'||historyDigest(late.target)!==historyDigest(manifest.target)
    ||late.bodyApprovalManifestSha256!==approval.sha256||late.coreSha256!==plan.core.sha256
    ||late.currentSkuIdentitiesSha256!==plan.currentSkuIdentities.sha256)fail('CURRENT_CODE_LATE_BINDING_NOT_FROM_FROZEN_PLAN');
  const core=JSON.parse(gunzipSync(readFileSync(await currentExportArtifactPath(root,plan.core))).toString('utf8')) as CurrentSourceCodeCore;
  const primary:OriginalPrimaryCode[]=[];
  for await(const {row} of currentExportLines(await currentExportArtifactPath(root,plan.originalPrimaryCodes)))primary.push(row as OriginalPrimaryCode);
  // The raw source path belongs to the original evidence; the frozen artifact may live elsewhere on the admitted target.
  const sourcePath=core.codes.find(x=>x.kind==='PRIMARY'&&x.source['sha256']===plan.originalPrimaryCodes.sha256)?.source['path'];
  if(!text(sourcePath))fail('CURRENT_CODE_ORIGINAL_PRIMARY_SOURCE_PIN_REQUIRED');
  const rows=projectCurrentSourceCodes(core,primary,late.bindings,{file:sourcePath,sha256:plan.originalPrimaryCodes.sha256});
  for(const kind of ['PRIMARY','RETIRED_PRIMARY','PRODUCT'] as const)if(rows.filter(r=>r.original.kind===kind).length!==plan.counts[kind])fail('CURRENT_CODE_COVERAGE_CHANGED');
  const currentIdentities:CurrentQuantityIdentity[]=[];
  for await(const {row} of currentExportLines(await currentExportArtifactPath(root,plan.currentSkuIdentities)))currentIdentities.push(row as CurrentQuantityIdentity);
  const codeOnlyBinding=manifest.codeOnlySkuEntities;
  if(!codeOnlyBinding||codeOnlyBinding.approvedMasterCore.sha256!==plan.core.sha256
    ||codeOnlyBinding.counts.records!==102||codeOnlyBinding.counts.originalIds!==88||codeOnlyBinding.counts.newCurrentSpecs!==14)
    fail('CURRENT_CODE_ONLY_ENTITY_PROOF_REQUIRED');
  const codeOnlyRoutes=await readCodeOnlySkuEntityRoutes(root,codeOnlyBinding);
  const newCodeOnly=codeOnlyRoutes.filter(x=>x.existingSkuId===null);
  if(new Set(currentIdentities.map(x=>x.targetKey)).size!==currentIdentities.length||currentIdentities.length+newCodeOnly.length!==late.bindings.length)
    fail('CURRENT_CODE_SYMBOLIC_SKU_PLAN_COVERAGE_CHANGED');
  for(const b of late.bindings){const p=currentIdentities.find(x=>x.targetKey===b.targetKey);
    if(!p){if(!newCodeOnly.some(x=>x.skuEntityKey===b.coreSkuKey&&x.product.id===b.productId))fail('CURRENT_CODE_SYMBOLIC_CURRENT_SKU_REQUIRED');continue;}
    if(p.kind!=='SKU'||p.existingId!==null||!sha(p.evidenceSha256)||p.body['identityKind']!=='T03_CORRECTED_CURRENT_SPEC')
      fail('CURRENT_CODE_SYMBOLIC_CURRENT_SKU_REQUIRED');}
  const prepared={approval:structuredClone(approval),target:manifest.target,plan,rows,currentIdentities,
    late:structuredClone(late),codeOnlyBinding,codeOnlyRoutes};
  preparedCodes.set(prepared,{admission,value:structuredClone(prepared)});
  return prepared;
}
interface Occupancy {barcode:string;product_id:string;sku_id:string|null;kind:string}
export function validateCurrentCodeOccupancy(rows:readonly CodeProjection[],occupied:readonly Occupancy[]):void {
  const byCode=new Map(rows.map(r=>[r.original.code,r]));
  for(const old of occupied){const row=byCode.get(old.barcode);
    if(!row||old.product_id!==row.productId||old.sku_id!==row.skuId||old.kind!==row.original.kind)fail('CURRENT_CODE_OCCUPIED_OR_KIND_CHANGED');}
}
function chunks<T>(rows:readonly T[]):T[][] {
  const result:T[][]=[];let part:T[]=[],bytes=2;
  for(const row of rows){const size=Buffer.byteLength(JSON.stringify(row));if(size+2>262144)fail('CURRENT_CODE_RECORD_TOO_LARGE');
    if(part.length===256||bytes+size+1>262144){result.push(part);part=[];bytes=2;}part.push(row);bytes+=size+1;}
  if(part.length)result.push(part);return result;
}
/** Both code tables use timestamptz: compare explicit instants with complete microseconds, never strip offsets. */
function sameStoredCodeTime(actual:string|null,original:string):boolean {
  return sameOriginalVariantTime(actual,original);
}
/** Lossless PostgreSQL microseconds. An absent offset remains a wall-clock fact, never an inferred timezone. */
function sameOriginalVariantTime(actual:unknown,original:unknown):boolean {
  const parse=(value:unknown):{micros:bigint;offsetKnown:boolean}|null=>{
    if(typeof value!=='string')return null;
    const m=value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:(Z)|([+-])(\d{2})(?::?(\d{2}))?(?::?(\d{2}))?)?$/i);
    if(!m)return null;
    const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]),hour=Number(m[4]),minute=Number(m[5]),second=Number(m[6]);
    if(!year||month<1||month>12||hour>23||minute>59||second>59)return null;
    const leap=year%4===0&&(year%100!==0||year%400===0),monthDays=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    if(day<1||day>monthDays[month-1]!)return null;
    const prior=BigInt(year-1),beforeMonth=monthDays.slice(0,month-1).reduce((a,b)=>a+b,0);
    const days=prior*365n+prior/4n-prior/100n+prior/400n+BigInt(beforeMonth+day-1);
    const offsetHour=Number(m[10]??0),offsetMinute=Number(m[11]??0),offsetSecond=Number(m[12]??0);
    if(offsetHour>15||offsetMinute>59||offsetSecond>59)return null;
    const offset=BigInt((m[9]==='-'?-1:1)*(offsetHour*3600+offsetMinute*60+offsetSecond));
    const micros=(days*86400n+BigInt(hour*3600+minute*60+second)-offset)*1000000n+BigInt((m[7]??'').padEnd(6,'0'));
    return {micros,offsetKnown:!!(m[8]||m[9])};
  };
  const a=parse(actual),b=parse(original);
  return a!==null&&b!==null&&a.offsetKnown===b.offsetKnown&&a.micros===b.micros;
}
export interface CurrentSourceRuntimeCodeRow {
  readonly sku_id:string;readonly product_id:string;readonly barcode:string;readonly scheme_id:string;
  readonly evidence:Row;readonly created_at:string|null;
}
/** Exact active/retired row readback, shared with the native consumer; normalization changes only time representation. */
export function validateCurrentRuntimeCodeReadback(expectedRows:readonly CurrentSourceRuntimeCodeRow[],stored:readonly CurrentSourceRuntimeCodeRow[]):void {
  if(stored.length!==expectedRows.length)fail('CURRENT_CODE_EXACT_NATIVE_READBACK_DIFFERS');
  for(const expected of expectedRows){const actual=stored.filter(x=>x.barcode===expected.barcode);
    if(actual.length!==1||actual[0]!.sku_id!==expected.sku_id||actual[0]!.product_id!==expected.product_id
      ||actual[0]!.scheme_id!==expected.scheme_id||historyDigest(actual[0]!.evidence)!==historyDigest(expected.evidence)
      ||expected.created_at!==null&&!sameStoredCodeTime(actual[0]!.created_at,expected.created_at))
      fail('CURRENT_CODE_EXACT_NATIVE_READBACK_DIFFERS');
  }
}
export interface CurrentSourceProductCodeRow {
  readonly batch_id:string;readonly source_id:string;readonly product_id:string;readonly barcode:string;
  readonly unit:null;readonly is_default:false;readonly binding_scope:'PRODUCT';readonly sku_id:null;
  readonly sku_binding_known:false;readonly source_payload:Row;
}
/** Fixed code-related methods only. T09 owns authenticity, live guard, role switching and transaction lifecycle. */
export interface CurrentSourceCodePort {
  assertContext(target:ReturnType<typeof productionTarget>,sourceSha256:string):Promise<void>;
  currentSkuIdentities(keys:readonly string[]):Promise<readonly {target_key:string;id:string;generated_in_target:boolean;evidence_sha256:string;body:unknown}[]>;
  sourceVariantIds(ids:readonly string[]):Promise<readonly string[]>;
  products(ids:readonly string[]):Promise<readonly {id:string;code:string}[]>;
  skus(ids:readonly string[]):Promise<readonly {id:string;product_id:string}[]>;
  occupiedCodes(codes:readonly string[]):Promise<readonly Occupancy[]>;
  codeSkuEntityProfiles(ids:readonly string[]):Promise<readonly {product_id:string;body:unknown}[]>;
  codeOnlyVariants(ids:readonly string[]):Promise<readonly CurrentSourceOriginalVariantMaterial[]>;
  retainedSourceBatchExists(batchId:string):Promise<boolean>;
  appendRuntimeCodes(kind:'PRIMARY'|'RETIRED_PRIMARY',rows:readonly CurrentSourceRuntimeCodeRow[]):Promise<readonly CurrentSourceRuntimeCodeRow[]>;
  appendProductCodes(rows:readonly CurrentSourceProductCodeRow[]):Promise<readonly CurrentSourceProductCodeRow[]>;
}
/** Adapt T09's finite, table/column restricted lease; no raw query or role escape is introduced. */
export function adaptCurrentSourceCodePort(native:ProductionNativeCodeSession,c:DatabaseConfig,sourceSha256:string):CurrentSourceCodePort {
  const unique=<T>(rows:readonly T[]):T[]=>[...new Map(rows.map(row=>[historyDigest(row),row])).values()];
  return {
    async assertContext(target,source){
      const witness=await native.witness();
      if(historyDigest(target)!==historyDigest(productionTarget(c))||source!==sourceSha256
        ||witness.database!==c.database||witness.user!==c.roles.migrator||witness.sourceSha256!==source)
        fail('CURRENT_CODE_NATIVE_PORT_CONTEXT_MISMATCH');
    },
    async currentSkuIdentities(keys){return (await native.select<Awaited<ReturnType<CurrentSourceCodePort['currentSkuIdentities']>>[number]>(
      'runtime.inventory_quantity_identity',{kind:'SKU',target_key:keys},['target_key','id','generated_in_target','evidence_sha256','body'])).rows;},
    async sourceVariantIds(ids){return (await native.select<{id:string}>('source.variant',{id:ids},['id'])).rows.map(x=>x.id);},
    async products(ids){return unique([...(await native.select<{id:string;code:string}>('source.product',{id:ids},['id','code'])).rows,
      ...(await native.select<{id:string;code:string}>('runtime.product_overlay',{id:ids,deleted:false},['id','code'])).rows]);},
    async skus(ids){return unique([...(await native.select<{id:string;product_id:string}>('source.variant',{id:ids},['id','product_id'])).rows,
      ...(await native.select<{id:string;product_id:string}>('runtime.variant_overlay',{id:ids},['id','product_id'])).rows]);},
    async occupiedCodes(codes){
      const rows:Occupancy[]=[];
      const source=(await native.select<{barcode:string;product_id:string;sku_id:string|null;binding_scope:string;is_default:boolean;sku_binding_known:boolean}>(
        'source.tplus_product_barcode',{barcode:codes},['barcode','product_id','sku_id','binding_scope','is_default','sku_binding_known'])).rows;
      for(const x of source)rows.push({barcode:x.barcode,product_id:x.product_id,sku_id:x.sku_id,
        kind:x.sku_id===null&&x.binding_scope==='PRODUCT'?'PRODUCT':x.sku_id!==null&&x.is_default&&x.sku_binding_known?'PRIMARY':'SOURCE_OTHER'});
      for(const [table,kind] of [['runtime.generated_barcode','PRIMARY'],['runtime.generated_barcode_retired','RETIRED_PRIMARY'],
        ['runtime.product_barcode_alias','MANUAL_OR_OTHER_ALIAS'],['runtime.product_barcode_alias_retired','RETIRED_ALIAS']] as const)
        for(const x of (await native.select<Omit<Occupancy,'kind'>>(table,{barcode:codes},['barcode','product_id','sku_id'])).rows)rows.push({...x,kind});
      return rows;
    },
    async codeSkuEntityProfiles(ids){return (await native.select<{product_id:string;body:unknown}>(
      'runtime.product_profile_overlay',{product_id:ids},['product_id','body'])).rows;},
    async codeOnlyVariants(ids){return (await native.select<CurrentSourceOriginalVariantMaterial>('runtime.variant_overlay',{id:ids})).rows;},
    async retainedSourceBatchExists(batchId){return (await native.select('source.tplus_import_run',{batch_id:batchId,status:'COMMITTED'},['batch_id'])).rows.length===1;},
    async appendRuntimeCodes(kind,rows){
      const table:ProductionNativeCodeTable=kind==='PRIMARY'?'runtime.generated_barcode':'runtime.generated_barcode_retired';
      const prior=(await native.select<CurrentSourceRuntimeCodeRow>(table,{barcode:rows.map(x=>x.barcode)})).rows;
      const absent=rows.filter(x=>!prior.some(old=>old.barcode===x.barcode));
      for(const preserveCreated of [true,false]){
        const selected=absent.filter(x=>(x.created_at!==null)===preserveCreated);
        if(!selected.length)continue;
        const input:Readonly<Record<string,SqlValue>>[]=selected.map(x=>({sku_id:x.sku_id,product_id:x.product_id,barcode:x.barcode,
          scheme_id:x.scheme_id,evidence:JSON.stringify(x.evidence),...(preserveCreated?{created_at:x.created_at!}:{})}));
        await native.insertBatch(table,input);
      }
      return (await native.select<CurrentSourceRuntimeCodeRow>(table,{barcode:rows.map(x=>x.barcode)})).rows;
    },
    async appendProductCodes(rows){
      const columns=['batch_id','source_id','product_id','barcode','unit','is_default','binding_scope','sku_id','sku_binding_known','source_payload'];
      const prior=(await native.select<CurrentSourceProductCodeRow>('source.tplus_product_barcode',
        {batch_id:rows[0]!.batch_id,source_id:rows.map(x=>x.source_id)},columns)).rows;
      const absent=rows.filter(x=>!prior.some(old=>old.source_id===x.source_id));
      if(absent.length)await native.insertBatch('source.tplus_product_barcode',absent.map(x=>({...x,source_payload:JSON.stringify(x.source_payload)})));
      return (await native.select<CurrentSourceProductCodeRow>('source.tplus_product_barcode',
        {batch_id:rows[0]!.batch_id,source_id:rows.map(x=>x.source_id)},columns)).rows;
    },
  };
}
/** T50's only entry: prepare exact signed inputs, then use the T09-owned native lifecycle once. */
export async function registerApprovedCurrentSourceCodes(c:DatabaseConfig,admission:ProductionAdmission,root:string,
  approval:CurrentExportArtifact,late:CurrentSourceCodeBindings):Promise<Awaited<ReturnType<typeof consumeApprovedCurrentSourceCodes>>> {
  const prepared=await prepareApprovedCurrentSourceCodes(c,admission,root,approval,late);
  let rejected:CurrentSourceCodeError|undefined;
  try{return await withProductionNativeCodeImport(c,admission,approval.sha256,async native=>{
    try{return await consumeApprovedCurrentSourceCodes(adaptCurrentSourceCodePort(native,c,approval.sha256),c,admission,prepared);}
    catch(error){if(error instanceof CurrentSourceCodeError)rejected=error;throw error;}
  });}catch(error){
    // Preserve a callback's exact rejection after lifecycle rollback; never mask commit/connection uncertainty.
    if(rejected&&error instanceof DataAccessError&&error.code==='DATABASE_OPERATION_FAILED')throw rejected;
    throw error;
  }
}
/** Frozen code-only source proofs and actual variant fields stay separate from quantity identities. */
export function validateCurrentCodeOnlyEntities(binding:CodeOnlySkuEntityBinding,routes:readonly CodeOnlySkuEntityRoute[],
  late:readonly CurrentSourceCodeBinding[],profiles:readonly {product_id:string;body:unknown}[],
  variantsReadback:readonly CurrentSourceOriginalVariantMaterial[]):void {
  for(const route of routes){
    const profile=profiles.filter(x=>x.product_id===route.product.id);
    const entities=(profile[0]?.body as Row|undefined)?.['codeOnlySkuEntities'] as Readonly<Record<string,Row>>|undefined;
    const actual=entities?.[route.skuEntityKey],id=route.existingSkuId??late.find(x=>x.coreSkuKey===route.skuEntityKey)?.skuId;
    const proof={coreSha256:binding.approvedMasterCore.sha256,prerequisitesSha256:binding.prerequisites.sha256,
      codeRecordSha256:historyDigest(route.exactCodeRecord),entitySha256:historyDigest(route.exactApprovedSkuEntity),
      unit:route.unit,productId:route.product.id,originalSkuId:route.existingSkuId,originalVariant:route.originalVariant,
      currentSpec:route.currentSpec,quantityContribution:null,newBusinessEnabled:false};
    if(profile.length!==1||!actual||!uuid(id)||actual['runtimeSkuId']!==id||actual['generatedInTarget']!==(route.existingSkuId===null)
      ||historyDigest(actual['proof'])!==historyDigest(proof))fail('CURRENT_CODE_ONLY_ENTITY_NOT_ACTUALLY_BOUND_TO_FROZEN_SOURCE');
    const variants=variantsReadback.filter(x=>x.id===id),v=variants[0];
    if(variants.length!==1||!v||v.product_id!==route.product.id)fail('CURRENT_CODE_ONLY_ACTUAL_VARIANT_DIFFERS');
    if(route.originalVariant){
      for(const field of ['id','product_id','color_id','size_id','size_name','group_name','fit_id','size_code'] as const)
        if(v[field]!==route.originalVariant[field])fail('CURRENT_CODE_ONLY_ORIGINAL_VARIANT_FIELDS_CHANGED');
      if(!sameOriginalVariantTime(v.created_at,route.originalVariant.created_at))fail('CURRENT_CODE_ONLY_ORIGINAL_VARIANT_FIELDS_CHANGED');
    }else{
      const spec=route.currentSpec!;
      if(v.color_id!==spec.color.id||v.fit_id!==spec.fit||v.size_name!==spec.size.name
        ||v.size_code!==spec.size.registeredBarcodeSizeSegment||v.group_name!==''||!uuid(v.size_id))
        fail('CURRENT_CODE_ONLY_APPROVED_SPEC_FIELDS_CHANGED');
    }
  }
}
/** No SQL, connection, role or commit API is available to this callback. */
export async function consumeApprovedCurrentSourceCodes(port:CurrentSourceCodePort,c:DatabaseConfig,
  admission:ProductionAdmission,p:PreparedCurrentSourceCodes):Promise<{codes:number;counts:CurrentSourceCodePlan['counts'];approvalManifestSha256:string;target:ReturnType<typeof productionTarget>}> {
  const signed=preparedCodes.get(p);
  if(!signed||signed.admission!==admission)fail('CURRENT_CODE_PREPARED_MATERIAL_NOT_AUTHENTIC');
  p=signed.value;
  const check=async():Promise<void>=>{
    assertProductionAdmission(c,admission,'historical-import',p.approval.sha256);
    await port.assertContext(p.target,p.approval.sha256);
  };
  await check();
  const allocated=await port.currentSkuIdentities(p.currentIdentities.map(b=>b.targetKey));
  if(allocated.length!==p.currentIdentities.length)fail('CURRENT_CODE_SKU_NOT_ACTUALLY_ALLOCATED_FROM_FROZEN_PLAN');
  for(const expected of p.currentIdentities){const b=p.late.bindings.find(x=>x.targetKey===expected.targetKey)!,actual=allocated.find(x=>x.target_key===b.targetKey);
    if(!actual||actual.id!==b.skuId||actual.generated_in_target!==true||actual.evidence_sha256!==expected.evidenceSha256
      ||historyDigest(actual.body)!==historyDigest(expected.body))fail('CURRENT_CODE_SKU_NOT_ACTUALLY_ALLOCATED_FROM_FROZEN_PLAN');}
  const profiles=await port.codeSkuEntityProfiles([...new Set(p.codeOnlyRoutes.map(x=>x.product.id))]);
  const codeOnlyIds=p.codeOnlyRoutes.map(route=>route.existingSkuId??p.late.bindings.find(x=>x.coreSkuKey===route.skuEntityKey)?.skuId);
  if(!codeOnlyIds.every(uuid))fail('CURRENT_CODE_ONLY_ACTUAL_SKU_REQUIRED');
  const codeOnlyVariants=await port.codeOnlyVariants(codeOnlyIds);
  validateCurrentCodeOnlyEntities(p.codeOnlyBinding,p.codeOnlyRoutes,p.late.bindings,profiles,codeOnlyVariants);
  if((await port.sourceVariantIds(p.late.bindings.map(b=>b.skuId))).length)fail('CURRENT_CODE_NEW_SKU_COLLIDES_WITH_ORIGINAL_SOURCE');
  if(!await port.retainedSourceBatchExists(p.plan.sourceProductCodeBatchId))fail('CURRENT_CODE_RETAINED_SOURCE_STORAGE_BATCH_REQUIRED');
  for(const batch of chunks(p.rows)){
    const productIds=[...new Set(batch.map(x=>x.productId))],skuIds=batch.flatMap(x=>x.skuId?[x.skuId]:[]);
    const products=await port.products(productIds),skus=await port.skus(skuIds);
    for(const row of batch)if(products.filter(v=>v.id===row.productId).length!==1
      ||products.find(v=>v.id===row.productId)?.code!==row.productCode
      ||row.skuId&&(skus.filter(v=>v.id===row.skuId).length!==1||skus.find(v=>v.id===row.skuId)?.product_id!==row.productId))
      fail('CURRENT_CODE_ACTUAL_PRODUCT_OR_SKU_ENTITY_MISSING');
    validateCurrentCodeOccupancy(batch,await port.occupiedCodes(batch.map(x=>x.original.code)));
  }
  const evidence=(row:CodeProjection)=>({namespace:'APPROVED_CURRENT_SOURCE_CODE',codeKind:row.original.kind,active:row.original.active,
    coreSha256:p.plan.core.sha256,originalCoreCode:row.original,originalPrimary:row.originalPrimary,sourceSkuIdentity:row.originalSkuId,
    actualSkuId:row.skuId,bodyApprovalManifestSha256:p.approval.sha256,schemeStorageMeaning:row.schemeMeaning,
    codeRecomputed:false,currentSkuPromotedAsHistorical:false,
    createdAtMeaning:row.originalPrimary?'PRESERVED_NATIVE_SOURCE_TIME':'CURRENT_IMPORT_STORAGE_TIME_NOT_HISTORICAL'});
  for(const kind of ['PRIMARY','RETIRED_PRIMARY'] as const){
    const values:CurrentSourceRuntimeCodeRow[]=p.rows.filter(x=>x.original.kind===kind).map(x=>({sku_id:x.skuId!,product_id:x.productId,
      barcode:x.original.code,scheme_id:x.schemeId!,evidence:evidence(x),created_at:x.originalPrimary?.created_at??null}));
    for(const batch of chunks(values)){
      await check();const stored=await port.appendRuntimeCodes(kind,batch);
      validateCurrentRuntimeCodeReadback(batch,stored);
    }
  }
  const productRows:CurrentSourceProductCodeRow[]=p.rows.filter(x=>x.original.kind==='PRODUCT').map(x=>({batch_id:p.plan.sourceProductCodeBatchId,
    source_id:x.original.key,product_id:x.productId,barcode:x.original.code,unit:null,is_default:false,binding_scope:'PRODUCT',
    sku_id:null,sku_binding_known:false,source_payload:{...evidence(x),sourceIdMeaning:'APPROVED_CORE_CODE_KEY_STORAGE_ID_NOT_RAW_TPLUS_BARCODE_ID',
      originalRawTplusBarcodeId:null,retainedBatchUsedAsStorageFkOnly:true}}));
  for(const batch of chunks(productRows)){
    await check();const stored=await port.appendProductCodes(batch);
    if(stored.length!==batch.length)fail('CURRENT_CODE_EXACT_PRODUCT_SCOPE_READBACK_DIFFERS');
    for(const expected of batch){const actual=stored.filter(x=>x.batch_id===expected.batch_id&&x.source_id===expected.source_id);
      if(actual.length!==1||historyDigest(actual[0])!==historyDigest(expected))fail('CURRENT_CODE_EXACT_PRODUCT_SCOPE_READBACK_DIFFERS');}
  }
  await check();
  return {codes:p.rows.length,counts:p.plan.counts,approvalManifestSha256:p.approval.sha256,target:p.target};
}
