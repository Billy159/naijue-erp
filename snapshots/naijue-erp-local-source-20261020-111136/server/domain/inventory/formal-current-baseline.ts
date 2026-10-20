import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {DataAccess} from '../../database/access.js';
import type {DataSession} from '../../database/session.js';
import {databaseIdentifier as ident,type DatabaseConfig} from '../../database/config.js';
import {identityAssertionSql} from '../../database/identity.js';
import {renderSql} from '../../database/migrations.js';
import {sqlBlock,sqlLiteral} from '../../database/sql.js';
import {assertProductionAdmission,assertProductionSession,readProductionAdmission,productionTarget,executeProductionDdl,type ProductionAdmission,type ProductionAdmissionFiles} from '../../database/production-admission.js';
import {formatScaled,parseScaled} from '../transactions/decimal.js';
import type {HistoryEffect} from './history-runtime.js';
import {HistoryError,historyDigest} from './history-plan.js';
import {historyImportTarget,type HistoryImportTarget} from './history-store.js';
import {currentExportArtifactPath,currentExportLines,currentExportMethod,currentExportPolicy,prepareCurrentExport,
  type CurrentExportArtifact,type CurrentExportInput,type PreparedCurrentExport} from './current-export-plan.js';
import {assertMappingTargets,persistCells,persistPayload,verifyCurrentExportStoredPayloads,verifyStoredRun,type CurrentExportRun} from './current-export-store.js';
import type {CurrentQuantityIdentity,CurrentQuantityIdentityRow} from './current-export-identity.js';
import {prepareApprovedCurrentSourceStream,iterateApprovedCurrentSourceMappings,iterateApprovedCurrentSourceObservations,
  iterateApprovedCurrentSourceDocuments,assertApprovedCurrentSourceStreamUnchanged,disposeApprovedCurrentSourceStream,
  currentSourceContract,currentSourceContractSha256,readCurrentSourceEntityAttributes,
  type ApprovedCurrentSourceStream,type CurrentSourceMaterialization,type CurrentSourceEntityAttributes,
  type CurrentSourceEntityAttributeEvidence,type CurrentSourceProductMaterial,type CurrentSourceProductPrerequisites,
  type CurrentSourceOriginalVariantMaterial,type ApprovedCurrentSourceBodies} from '../imports/current-source-body.js';

const sha=(bytes:string|Buffer):string=>createHash('sha256').update(bytes).digest('hex');
const template=():string=>readFileSync(new URL('../../database/sql/0013-formal-current-baseline.sql',import.meta.url),'utf8');
export const formalBaselineComponentSha256=():string=>sha(template());
const locks=[{scope:'reference' as const,key:'inventory-opening-snapshot'},{scope:'inventory' as const,key:'posting-ledger'}];
function fail(code:string):never {throw new HistoryError(code);}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);

interface FormalBaselineSourceCommon {
  readonly baselineVersion:string;
  readonly quantityMethod:typeof currentExportMethod;
  readonly historicalTimelineCompletenessClaimed:false;
  readonly identityCount:number;
  readonly counts:CurrentExportInput['counts'];
}
export interface FormalHistoricalBaselineSource extends FormalBaselineSourceCommon {
  readonly schemaVersion:'T33-APPROVED-BASELINE-SOURCES-v1';
  readonly artifacts:Pick<CurrentExportInput['artifacts'],'endpoints'|'openings'|'fixedOpeningSnapshot'|'userConfirmation'|'ownerAdmission'>
  & {readonly quantityIdentities:CurrentExportArtifact;readonly historicalBodyApproval:CurrentExportArtifact;readonly historicalDocumentBindings:CurrentExportArtifact};
}
export interface FormalCurrentSourceBaseline extends FormalBaselineSourceCommon {
  readonly schemaVersion:'T33-APPROVED-BASELINE-SOURCES-v2';
  readonly bodyBindingKind:'APPROVED_CURRENT_SOURCE';
  readonly artifacts:Pick<CurrentExportInput['artifacts'],'endpoints'|'openings'|'fixedOpeningSnapshot'|'userConfirmation'|'ownerAdmission'>
  & {readonly quantityIdentities:CurrentExportArtifact;readonly currentSourceBodiesApproval:CurrentExportArtifact;
    readonly currentProductPrerequisites?:CurrentExportArtifact};
}
export type FormalBaselineSource=FormalHistoricalBaselineSource|FormalCurrentSourceBaseline;
const bodyApproval=(source:FormalBaselineSource):CurrentExportArtifact=>source.schemaVersion==='T33-APPROVED-BASELINE-SOURCES-v2'
  ?source.artifacts.currentSourceBodiesApproval:source.artifacts.historicalBodyApproval;
export interface FormalBaselineInput {
  readonly schemaVersion:'T33-APPROVED-FORMAL-BASELINE-INPUT-v1';
  readonly dataClass:'USER_APPROVED_FORMAL_BASELINE';
  readonly productionAuthorized:true;
  readonly source:CurrentExportArtifact;
  readonly calculation:CurrentExportInput;
  readonly currentSourceMaterialization?:CurrentSourceMaterialization;
}
export interface FormalBaselineRun extends CurrentExportRun {source_sha256:string;activated:boolean}

/** Transaction script stays private: only T09's lifecycle-checked executor may submit it. */
function formalBaselineSchemaScript(config:DatabaseConfig):string {
  const runtime=ident(config.schemas.runtime),component=formalBaselineComponentSha256();
  const sql=renderSql(config,template().replaceAll('__COMPONENT_SHA256__',component));
  return `BEGIN;SELECT pg_advisory_xact_lock(hashtextextended(${sqlLiteral(config.instanceId+':schema-migrations')},0));
    ${identityAssertionSql(config,'migrator')} SET LOCAL ROLE ${ident(config.roles.runtime)};
    DO $component$ BEGIN
      IF to_regclass(${sqlLiteral(runtime+'.inventory_formal_baseline_schema')}) IS NULL THEN
        IF to_regclass(${sqlLiteral(runtime+'.inventory_formal_baseline_run')}) IS NOT NULL THEN RAISE EXCEPTION 'FORMAL_COMPONENT_PARTIAL';END IF;
        EXECUTE ${sqlBlock(sql)};
      ELSE
        IF (SELECT component_sha256 FROM ${runtime}.inventory_formal_baseline_schema WHERE singleton) IS DISTINCT FROM ${sqlLiteral(component)}
          THEN RAISE EXCEPTION 'FORMAL_COMPONENT_CHANGED';END IF;
      END IF;
    END $component$;RESET ROLE;COMMIT;`;
}
/** Old raw production SQL entrypoint is fail-closed; T48 must use the controlled installer. */
export function formalBaselineSchemaSql(config:DatabaseConfig,admission:ProductionAdmission):string {
  assertProductionAdmission(config,admission,'database-migrate');
  return fail('PRODUCTION_FORMAL_SCHEMA_REQUIRES_CONTROLLED_INSTALLER');
}
/** T09 owns the same connection, complete locks, live rechecks, rollback and final COMMIT. */
export async function installFormalBaselineSchema(config:DatabaseConfig,admission:ProductionAdmission):Promise<void> {
  assertProductionAdmission(config,admission,'database-migrate');
  await executeProductionDdl(config,admission,{operation:'database-migrate',script:formalBaselineSchemaScript(config)});
}
async function componentReady(session:DataSession,runtime:string,required=false):Promise<boolean> {
  if (!/^"[a-z][a-z0-9_]{0,62}"$/.test(runtime)) fail('INVALID_FORMAL_BASELINE_SCHEMA');
  const relation=(await session.query<{schema_exists:boolean;run_exists:boolean}>(`SELECT to_regclass($1) IS NOT NULL schema_exists,to_regclass($2) IS NOT NULL run_exists`,
    [runtime+'.inventory_formal_baseline_schema',runtime+'.inventory_formal_baseline_run'])).rows[0];
  if (!relation?.schema_exists) {
    if (required||relation?.run_exists) fail('FORMAL_BASELINE_COMPONENT_REQUIRED');return false;
  }
  const ready=(await session.query<{ready:boolean}>(`SELECT component_sha256=$1
    AND NOT EXISTS(SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$2
      AND t.relname=ANY($3::text[]) AND (has_table_privilege(session_user,t.oid,'UPDATE,DELETE,TRUNCATE') OR has_any_column_privilege(session_user,t.oid,'UPDATE')))
    AND (SELECT count(*) FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$2 AND t.relname=ANY($3::text[]))=8
    AND (SELECT count(*) FROM pg_trigger tr JOIN pg_class t ON t.oid=tr.tgrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=$2 AND t.relname=ANY($3::text[]) AND tr.tgname IN ('formal_baseline_immutable','formal_baseline_no_truncate')
        AND NOT tr.tgisinternal AND tr.tgenabled='O')=16 AS ready FROM ${runtime}.inventory_formal_baseline_schema WHERE singleton`,
    [formalBaselineComponentSha256(),runtime.slice(1,-1),['inventory_formal_baseline_schema','inventory_formal_baseline_run','inventory_formal_baseline_chunk',
      'inventory_formal_baseline_cell','inventory_formal_baseline_activation','inventory_formal_baseline_document',
      'inventory_formal_baseline_document_leg','inventory_formal_baseline_movement']])).rows[0];
  if (ready?.ready!==true) fail('FORMAL_BASELINE_COMPONENT_MISMATCH');return true;
}
export async function activeFormalBaselineRun(session:DataSession,runtime:string):Promise<FormalBaselineRun|null> {
  if (!await componentReady(session,runtime)) return null;
  return (await session.query<FormalBaselineRun>(`SELECT r.id,r.manifest_sha256,r.source_sha256,r.body,r.target,
    EXISTS(SELECT 1 FROM ${runtime}.inventory_formal_baseline_activation a WHERE a.run_id=r.id AND a.manifest_sha256=r.manifest_sha256
      AND a.source_sha256=r.source_sha256 AND a.target=r.target) activated FROM ${runtime}.inventory_formal_baseline_run r`)).rows[0]??null;
}
export async function assertFormalBaselineBusinessReady(session:DataSession,runtime:string):Promise<void> {
  const run=await activeFormalBaselineRun(session,runtime);
  if (run&&!run.activated) fail('APPROVED_FORMAL_BASELINE_MAINTENANCE_ONLY');
}
/** Current-export archives are source evidence. No request field can make them writable. */
export async function assertFormalCurrentSourceDocumentWritable(session:DataSession,runtime:string,documentId:string):Promise<void> {
  if(!/^"[a-z][a-z0-9_]{0,62}"$/.test(runtime))fail('INVALID_FORMAL_BASELINE_SCHEMA');
  const row=(await session.query<{source_identity:Record<string,unknown>|null}>(`SELECT source_identity FROM ${runtime}.document WHERE id=$1::uuid`,[documentId])).rows[0];
  if(row?.source_identity?.['currentSourceBinding']!==undefined&&row.source_identity['currentSourceBinding']!==null)
    fail('APPROVED_CURRENT_SOURCE_DOCUMENT_IS_READ_ONLY');
}
async function sourceInput(root:string,source:CurrentExportArtifact):Promise<FormalBaselineSource> {
  const path=await currentExportArtifactPath(root,source),value=JSON.parse(readFileSync(path,'utf8')) as FormalBaselineSource;
  if (!['T33-APPROVED-BASELINE-SOURCES-v1','T33-APPROVED-BASELINE-SOURCES-v2'].includes(value.schemaVersion)
    ||value.schemaVersion==='T33-APPROVED-BASELINE-SOURCES-v2'&&value.bodyBindingKind!=='APPROVED_CURRENT_SOURCE'||value.quantityMethod!==currentExportMethod
    ||value.historicalTimelineCompletenessClaimed!==false||!value.baselineVersion||!Number.isSafeInteger(value.identityCount)||value.identityCount<1) fail('FROZEN_FORMAL_BASELINE_SOURCE_REQUIRED');
  return value;
}
async function noOtherBasis(session:DataSession,c:DatabaseConfig):Promise<void> {
  const r=ident(c.schemas.runtime),s=ident(c.schemas.source);
  const n=(await session.query<{n:string}>(`SELECT ((SELECT count(*) FROM ${r}.inventory_current_export_run)
    +(SELECT count(*) FROM ${r}.inventory_history_run)+(SELECT count(*) FROM ${r}.inventory_opening_run)
    +(SELECT count(*) FROM ${r}.inventory_delta)+(SELECT count(*) FROM ${r}.posting)+(SELECT count(*) FROM ${r}.movement)
    +(SELECT count(*) FROM ${s}.tplus_inventory_balance_source))::text n`)).rows[0]?.n;
  if (n!=='0') fail('NEW_FORMAL_TARGET_WITHOUT_EXISTING_INVENTORY_ACTIVITY_REQUIRED');
}
function target(config:DatabaseConfig,declared:HistoryImportTarget):void {
  if (historyDigest(historyImportTarget(config))!==historyDigest(declared)) fail('FORMAL_BASELINE_DECLARED_TARGET_MISMATCH');
}
/** Identity plan is frozen before allocation. Every generated ID is created here, never supplied by a QA receipt. */
export async function installFormalQuantityIdentities(access:DataAccess,c:DatabaseConfig,admission:ProductionAdmission,
  root:string,source:CurrentExportArtifact):Promise<{writes:number;rows:CurrentQuantityIdentityRow[];target:HistoryImportTarget;sourceSha256:string}> {
  assertProductionAdmission(c,admission,'baseline-import',source.sha256);
  const manifest=await sourceInput(root,source),path=await currentExportArtifactPath(root,manifest.artifacts.quantityIdentities),records:CurrentQuantityIdentity[]=[];
  const keys=new Set<string>(),ids=new Set<string>();
  for await (const {row} of currentExportLines(path)) {
    const value=row as CurrentQuantityIdentity,key=value.kind+':'+value.targetKey;
    if (!['WAREHOUSE','SKU'].includes(value.kind)||!value.targetKey||keys.has(key)||!value.body||!/^[a-f0-9]{64}$/.test(value.evidenceSha256)
      ||value.existingId!==null&&!uuid(value.existingId)) fail('FORMAL_FROZEN_IDENTITY_PLAN_REQUIRED');
    if(value.existingId!==null){const id=value.kind+':'+value.existingId;if(ids.has(id)) fail('FORMAL_IDENTITY_MERGE_REJECTED');ids.add(id);}
    keys.add(key);records.push(value);
  }
  if(records.length!==manifest.identityCount) fail('FORMAL_IDENTITY_PLAN_COUNT_MISMATCH');
  const r=ident(c.schemas.runtime),s=ident(c.schemas.source);
  return access.transaction(async session=>{
    await session.lock([...locks,{scope:'reference',key:'current-quantity-identities'}]);
    await assertProductionSession(session,c,admission,'baseline-import',source.sha256);await componentReady(session,r,true);
    await noOtherBasis(session,c);if(await activeFormalBaselineRun(session,r)) fail('FORMAL_BASELINE_ALREADY_IMPORTED');
    const prior=(await session.query<CurrentQuantityIdentityRow>(`SELECT kind,target_key,id,generated_in_target,evidence_sha256,body FROM ${r}.inventory_quantity_identity ORDER BY kind,target_key`)).rows;
    if(prior.length){
      const byKey=new Map(prior.map(x=>[x.kind+':'+x.target_key,x]));
      if(prior.length!==records.length||records.some(x=>{const p=byKey.get(x.kind+':'+x.targetKey);
        return !p||p.evidence_sha256!==x.evidenceSha256||historyDigest(p.body)!==historyDigest(x.body)
          ||(x.existingId===null?!p.generated_in_target:p.generated_in_target||p.id!==x.existingId);})) fail('FORMAL_IDENTITY_PLAN_CHANGED');
      return {writes:0,rows:prior,target:historyImportTarget(c),sourceSha256:source.sha256};
    }
    for(const record of records.filter(x=>x.existingId!==null)){
      const physical=record.kind==='SKU'?`SELECT id FROM ${s}.variant UNION SELECT id FROM ${r}.variant_overlay`
        :`SELECT id FROM ${s}.warehouse UNION SELECT id FROM ${r}.master_reference_overlay WHERE kind='warehouses'`;
      const exists=(await session.query<{known:boolean}>(`SELECT EXISTS(SELECT 1 FROM (${physical}) p WHERE id=$1::uuid) known`,[record.existingId])).rows[0]?.known;
      if(!exists) fail('FORMAL_EXISTING_ID_NOT_PRESENT_IN_ACTUAL_MASTER');
    }
    let batch:string[]=[],bytes=2,writes=0;
    const flush=async():Promise<void>=>{
      if(!batch.length)return;await session.query(`INSERT INTO ${r}.inventory_quantity_identity(kind,target_key,id,generated_in_target,evidence_sha256,body)
        SELECT x.kind,x.target_key,coalesce(x.id,gen_random_uuid()),x.id IS NULL,x.evidence_sha256,x.body
        FROM jsonb_to_recordset($1::jsonb) x(kind text,target_key text,id uuid,evidence_sha256 text,body jsonb)`,['['+batch.join(',')+']']);
      writes++;batch=[];bytes=2;
    };
    for(const x of records){const row=JSON.stringify({kind:x.kind,target_key:x.targetKey,id:x.existingId,evidence_sha256:x.evidenceSha256,body:x.body}),size=Buffer.byteLength(row);
      if(size+2>262144)fail('FORMAL_IDENTITY_ROW_TOO_LARGE');if(bytes+size+(batch.length?1:0)>262144)await flush();bytes+=size+(batch.length?1:0);batch.push(row);}
    await flush();const rows=(await session.query<CurrentQuantityIdentityRow>(`SELECT kind,target_key,id,generated_in_target,evidence_sha256,body FROM ${r}.inventory_quantity_identity ORDER BY kind,target_key`)).rows;
    if(rows.length!==records.length)fail('FORMAL_IDENTITY_READBACK_MISMATCH');
    await assertProductionSession(session,c,admission,'baseline-import',source.sha256);
    return {writes,rows,target:historyImportTarget(c),sourceSha256:source.sha256};
  });
}
interface CurrentEntityPlan {
  plans:CurrentQuantityIdentity[];
  attributes:Map<string,CurrentSourceEntityAttributes>;
  products:readonly CurrentSourceProductMaterial[];
}
async function currentEntityPlan(root:string,manifest:FormalBaselineSource):Promise<CurrentEntityPlan> {
  if(manifest.schemaVersion!=='T33-APPROVED-BASELINE-SOURCES-v2'||!manifest.artifacts.currentProductPrerequisites)
    fail('EXPLICIT_CURRENT_ENTITY_SOURCE_REQUIRED');
  const path=await currentExportArtifactPath(root,manifest.artifacts.quantityIdentities),plans:CurrentQuantityIdentity[]=[];
  const attributes=new Map<string,CurrentSourceEntityAttributes>(),witnesses=new Map<string,Map<number,unknown>>(),keys=new Set<string>();
  for await(const {row} of currentExportLines(path)){
    const p=row as CurrentQuantityIdentity,key=p.kind+':'+p.targetKey;
    if(keys.has(key))fail('CURRENT_ENTITY_IDENTITY_PLAN_DUPLICATE');
    keys.add(key);plans.push(p);
    if(!Object.hasOwn(p.body,'entityAttributeRecord')){
      if(p.existingId===null)fail('FROZEN_CURRENT_ENTITY_DESCRIPTOR_REQUIRED');continue;
    }
    const a=readCurrentSourceEntityAttributes(p),e=p.body['entityAttributeEvidence'] as CurrentSourceEntityAttributeEvidence;
    const reference=historyDigest(e.artifact);let rows=witnesses.get(reference);
    if(!rows){rows=new Map();const evidencePath=await currentExportArtifactPath(root,e.artifact);
      for await(const item of currentExportLines(evidencePath))rows.set(item.ordinal,item.row);witnesses.set(reference,rows);}
    if(historyDigest(rows.get(e.record))!==e.recordSha256)fail('CURRENT_ENTITY_ATTRIBUTES_NOT_BOUND_TO_FROZEN_EVIDENCE');
    attributes.set(key,a);
  }
  if(plans.length!==manifest.identityCount)fail('FORMAL_IDENTITY_PLAN_COUNT_MISMATCH');
  const productPath=await currentExportArtifactPath(root,manifest.artifacts.currentProductPrerequisites);
  const productInput=JSON.parse(readFileSync(productPath,'utf8')) as CurrentSourceProductPrerequisites;
  if(productInput.schemaVersion!=='T50-APPROVED-CURRENT-PRODUCT-PREREQUISITES-v1'||!Array.isArray(productInput.products)
    ||productInput.actualBusinessEntitiesMaterialized!==false||productInput.originalSourceFieldsUnchanged!==true
    ||productInput.unknownFieldsNotDefaulted!==true)fail('CURRENT_PRODUCT_PREREQUISITES_REQUIRED');
  const products=new Map<string,CurrentSourceProductMaterial>();
  for(const a of attributes.values())if(a.kind==='SKU'){
    const product=a.stage==='KNOWN_ORIGINAL_ENTITY_REQUIRED_BEFORE_REGISTRY_ALLOCATION'?a.product:a.canonicalProduct;
    if(products.has(product.id)&&historyDigest(products.get(product.id))!==historyDigest(product))fail('CURRENT_PRODUCT_ATTRIBUTES_CONFLICT');
    products.set(product.id,product);
  }
  const productKeys=new Set<string>();
  for(const p of productInput.products){
    if(!uuid(p.id)||!p.code||!p.body||productKeys.has(p.id)||historyDigest(products.get(p.id))!==historyDigest(p))fail('CURRENT_PRODUCT_PREREQUISITES_NOT_FROM_ENTITY_PLAN');
    productKeys.add(p.id);
  }
  return {plans,attributes,products:productInput.products};
}
async function beginCurrentEntityWrite(session:DataSession,c:DatabaseConfig,admission:ProductionAdmission,source:CurrentExportArtifact):Promise<void> {
  await session.lock([...locks,{scope:'reference',key:'current-quantity-identities'},{scope:'reference',key:'approved-current-entities'}]);
  await assertProductionSession(session,c,admission,'baseline-import',source.sha256);await componentReady(session,ident(c.schemas.runtime),true);
  await noOtherBasis(session,c);if(await activeFormalBaselineRun(session,ident(c.schemas.runtime)))fail('FORMAL_BASELINE_ALREADY_IMPORTED');
}
async function currentProduct(session:DataSession,c:DatabaseConfig,p:CurrentSourceProductMaterial):Promise<number> {
  const r=ident(c.schemas.runtime),s=ident(c.schemas.source);
  const original=(await session.query<{code:string}>(`SELECT code FROM ${s}.product WHERE id=$1::uuid`,[p.id])).rows[0];
  if(original){if(original.code!==p.code)fail('CURRENT_PRODUCT_SOURCE_ID_CONFLICT');return 0;}
  // Empty text is a physical representation of the supplied unknown, never the library's default A.
  const fit=p.body['fitId']??p.body['sourceDefaultFit']??'';
  if(typeof fit!=='string')fail('CURRENT_PRODUCT_EXPLICIT_OR_UNKNOWN_FIT_REQUIRED');
  const body={...p.body,fitId:fit,
    currentSourceProduct:{namespace:'APPROVED_CURRENT_PRODUCT',originalMaterial:p,unknownFitRepresentedByEmptyText:fit===''}};
  const expected={id:p.id,code:p.code,body,deleted:false};
  const prior=(await session.query<Record<string,unknown>>(`SELECT id,code,body,deleted FROM ${r}.product_overlay WHERE id=$1::uuid`,[p.id])).rows[0];
  if(prior&&historyDigest(prior)!==historyDigest(expected))fail('CURRENT_ENTITY_ALREADY_BOUND_TO_DIFFERENT_ATTRIBUTES');
  if(!prior)await session.query(`INSERT INTO ${r}.product_overlay(id,code,body,deleted) VALUES($1::uuid,$2,$3::jsonb,false)`,[p.id,p.code,JSON.stringify(body)]);
  const readback=(await session.query<Record<string,unknown>>(`SELECT id,code,body,deleted FROM ${r}.product_overlay WHERE id=$1::uuid`,[p.id])).rows[0];
  if(historyDigest(readback)!==historyDigest(expected))fail('CURRENT_ENTITY_ACTUAL_READBACK_MISMATCH');
  return prior?0:1;
}
async function currentColor(session:DataSession,c:DatabaseConfig,id:string,code:string,name:string):Promise<number> {
  const r=ident(c.schemas.runtime),s=ident(c.schemas.source);
  const original=(await session.query<{code:string;name:string}>(`SELECT code,name FROM ${s}.spec_value WHERE id=$1::uuid`,[id])).rows[0];
  if(original?.code===code&&original.name===name)return 0;
  const prior=(await session.query<{body:Record<string,unknown>;deleted:boolean}>(`SELECT body,deleted FROM ${r}.product_master_overlay WHERE kind='colors' AND id=$1`,[id])).rows[0];
  if(prior&&(prior.deleted||prior.body['code']!==code||prior.body['name']!==name))fail('CURRENT_ENTITY_ALREADY_BOUND_TO_DIFFERENT_ATTRIBUTES');
  const body={code,name,enabled:true,namespace:'APPROVED_CURRENT_COLOR',originalHistoricalIdentityClaimed:false};
  if(!prior)await session.query(`INSERT INTO ${r}.product_master_overlay(kind,id,body,deleted,version) VALUES('colors',$1,$2::jsonb,false,1)`,[id,JSON.stringify(body)]);
  const actual=(await session.query<{body:Record<string,unknown>;deleted:boolean}>(`SELECT body,deleted FROM ${r}.product_master_overlay WHERE kind='colors' AND id=$1`,[id])).rows[0];
  if(!actual||actual.deleted||actual.body['code']!==code||actual.body['name']!==name)fail('CURRENT_ENTITY_ACTUAL_READBACK_MISMATCH');
  return prior?0:1;
}
type CurrentPhysicalVariant=Pick<CurrentSourceOriginalVariantMaterial,'id'|'product_id'|'color_id'|'size_id'|'size_name'|'group_name'|'fit_id'|'size_code'> & {created_at?:string};
async function currentVariant(session:DataSession,c:DatabaseConfig,v:CurrentPhysicalVariant):Promise<number> {
  const r=ident(c.schemas.runtime),s=ident(c.schemas.source);
  if((await session.query<{found:boolean}>(`SELECT EXISTS(SELECT 1 FROM ${s}.variant WHERE id=$1::uuid) found`,[v.id])).rows[0]?.found)
    fail('CURRENT_ENTITY_ID_COLLIDES_WITH_SOURCE_ORIGINAL');
  const fields='id,product_id,color_id,size_id,size_name,group_name,fit_id,size_code';
  const expected={id:v.id,product_id:v.product_id,color_id:v.color_id,size_id:v.size_id,size_name:v.size_name,group_name:v.group_name,fit_id:v.fit_id,size_code:v.size_code};
  const prior=(await session.query<Record<string,unknown>>(`SELECT ${fields} FROM ${r}.variant_overlay WHERE id=$1::uuid`,[v.id])).rows[0];
  if(prior&&historyDigest(prior)!==historyDigest(expected))fail('CURRENT_ENTITY_ALREADY_BOUND_TO_DIFFERENT_ATTRIBUTES');
  if(!prior){const values=[v.id,v.product_id,v.color_id,v.size_id,v.size_name,v.group_name,v.fit_id,v.size_code];
    if(v.created_at){if(!Number.isFinite(Date.parse(v.created_at)))fail('RETAINED_VARIANT_ORIGINAL_TIME_REQUIRED');
      await session.query(`INSERT INTO ${r}.variant_overlay(${fields},created_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$9::timestamptz)`,[...values,v.created_at]);}
    else await session.query(`INSERT INTO ${r}.variant_overlay(${fields}) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8)`,values);
  }
  const actual=(await session.query<Record<string,unknown>>(`SELECT ${fields} FROM ${r}.variant_overlay WHERE id=$1::uuid`,[v.id])).rows[0];
  if(historyDigest(actual)!==historyDigest(expected))fail('CURRENT_ENTITY_ACTUAL_READBACK_MISMATCH');
  if(v.created_at){const row=(await session.query<{same:boolean}>(`SELECT created_at=$2::timestamptz same FROM ${r}.variant_overlay WHERE id=$1::uuid`,[v.id,v.created_at])).rows[0];
    if(!row?.same)fail('CURRENT_ENTITY_ACTUAL_READBACK_MISMATCH');}
  return prior?0:1;
}
export interface CodeOnlySkuEntityBinding {
  readonly schemaVersion:'T33-APPROVED-CODE-ONLY-SKU-ENTITIES-v1';
  readonly approvedMasterCore:CurrentExportArtifact;
  readonly prerequisites:CurrentExportArtifact;
  readonly counts:{readonly records:number;readonly originalIds:number;readonly newCurrentSpecs:number};
  readonly quantityChanges:false;
}
export interface CodeOnlySkuEntityRoute {
  readonly coreCodeOrdinal:number;readonly exactCodeRecord:Readonly<Record<string,unknown>>;
  readonly skuEntityKey:string;readonly existingSkuId:string|null;
  readonly product:CurrentSourceProductMaterial;readonly unit:string;
  readonly exactApprovedSkuEntity:Readonly<Record<string,unknown>>;
  readonly originalVariant:CurrentSourceOriginalVariantMaterial|null;
  readonly currentSpec:{readonly color:{readonly id:string;readonly code:string;readonly name:string};readonly fit:'A'|'B';
    readonly nativeGroupId:null;readonly size:{readonly name:string;readonly registeredBarcodeSizeSegment:string}}|null;
  readonly route:'RESTORE_RETAINED_ORIGINAL_RUNTIME'|'ALLOCATE_APPROVED_CODE_ONLY_CURRENT_SPEC';
}
interface CodeOnlyPrerequisites {
  schemaVersion:string;coreSha256:string;knownOriginalIdsPreserved:boolean;actualNewIdsAllocated:number;quantityChanges:boolean;approvedEntityIsNotPhysicalReadback:boolean;
  missingCodeRecords:{coreCodeOrdinal:number;exactCodeRecord:Record<string,unknown>;productEntityKey:string;productId:string;
    skuEntityKey:string;skuEntityId:string|null;exactApprovedSkuEntity:Record<string,unknown>;newActualSkuIdNotAllocated:boolean}[];
}
/** Pure preparation binds exact code ordinals and SKU/product bodies; it is not a write capability. */
export async function readCodeOnlySkuEntityRoutes(root:string,binding:CodeOnlySkuEntityBinding):Promise<readonly CodeOnlySkuEntityRoute[]> {
  if(binding.schemaVersion!=='T33-APPROVED-CODE-ONLY-SKU-ENTITIES-v1'||binding.quantityChanges!==false)
    fail('EXPLICIT_CODE_ONLY_SKU_ENTITY_BINDING_REQUIRED');
  const inputPath=await currentExportArtifactPath(root,binding.prerequisites),corePath=await currentExportArtifactPath(root,binding.approvedMasterCore);
  const decode=(path:string):unknown=>JSON.parse((path.endsWith('.gz')?gunzipSync(readFileSync(path)):readFileSync(path)).toString('utf8')) as unknown;
  const input=decode(inputPath) as CodeOnlyPrerequisites,core=decode(corePath) as {entities:CurrentSourceProductMaterial[];codes:Record<string,unknown>[]};
  if(input.schemaVersion!=='T32-EXACT-APPROVED-CODE-SKU-PREREQUISITES-v1'||input.coreSha256!==binding.approvedMasterCore.sha256
    ||input.knownOriginalIdsPreserved!==true||input.actualNewIdsAllocated!==0||input.quantityChanges!==false||input.approvedEntityIsNotPhysicalReadback!==true
    ||!Array.isArray(input.missingCodeRecords)||!Array.isArray(core.entities)||!Array.isArray(core.codes))fail('EXACT_APPROVED_CODE_ONLY_MATERIAL_REQUIRED');
  const entities=new Map(core.entities.map(x=>[x.key,x])),keys=new Set<string>(),codes=new Set<string>(),originalIds=new Set<string>(),routes:CodeOnlySkuEntityRoute[]=[];
  for(const x of input.missingCodeRecords){
    const product=entities.get(x.productEntityKey),sku=entities.get(x.skuEntityKey),originalCode=core.codes[x.coreCodeOrdinal-1];
    if(!Number.isSafeInteger(x.coreCodeOrdinal)||x.coreCodeOrdinal<1||!originalCode||!product||!sku||product.kind!=='product'||sku.kind!=='sku'
      ||product.id!==x.productId||sku.id!==x.skuEntityId||!uuid(product.id)||typeof product.body['unit']!=='string'||!product.body['unit'].trim()
      ||historyDigest(originalCode)!==historyDigest(x.exactCodeRecord)||historyDigest(sku)!==historyDigest(x.exactApprovedSkuEntity)
      ||originalCode['skuKey']!==x.skuEntityKey||originalCode['productKey']!==x.productEntityKey||!['PRIMARY','RETIRED_PRIMARY'].includes(String(originalCode['kind']))
      ||typeof originalCode['code']!=='string'||!originalCode['code']||keys.has(x.skuEntityKey)||codes.has(originalCode['code'])
      ||sku.body['productKey']!==product.key||sku.body['quantityContribution']!==null||sku.body['newBusinessEnabled']!==false)
      fail('CODE_ONLY_SKU_ROUTE_OR_PARENT_CHANGED');
    keys.add(x.skuEntityKey);codes.add(originalCode['code']);
    let originalVariant:CurrentSourceOriginalVariantMaterial|null=null,currentSpec:CodeOnlySkuEntityRoute['currentSpec']=null;
    if(x.skuEntityId!==null){
      const retained=sku.body['retainedRecord'] as Record<string,unknown>|undefined,v=retained?.['originalVariant'] as CurrentSourceOriginalVariantMaterial|undefined;
      if(!uuid(x.skuEntityId)||originalIds.has(x.skuEntityId)||!v||v.id!==x.skuEntityId||v.product_id!==product.id
        ||![v.color_id,v.size_id].every(uuid)||!['size_name','group_name','fit_id','size_code','created_at'].every(k=>typeof v[k]==='string'&&v[k])
        ||!Number.isFinite(Date.parse(v.created_at))||retained?.['skuId']!==v.id||retained['productId']!==product.id
        ||sku.body['retainedNotDeleted']!==true||x.newActualSkuIdNotAllocated!==false)fail('CODE_ONLY_ORIGINAL_VARIANT_FACTS_REQUIRED');
      originalVariant=v;originalIds.add(x.skuEntityId);
    }else{
      const spec=sku.body['explicitCatalogSpecification'] as Record<string,unknown>|undefined;
      const color=spec?.['color'] as Record<string,unknown>|undefined,size=spec?.['size'] as Record<string,unknown>|undefined;
      if(!spec||!color||!size||!uuid(color['id'])||!['code','name'].every(k=>typeof color[k]==='string'&&color[k])
        ||!['A','B'].includes(String(spec['fit']))||spec['nativeGroupId']!==null||spec['groupResolutionState']!=='SOURCE_LABEL_RETAINED_NO_GROUP_INFERENCE'
        ||!['name','registeredBarcodeSizeSegment'].every(k=>typeof size[k]==='string'&&size[k])
        ||sku.body['historicalSkuMerged']!==false||x.newActualSkuIdNotAllocated!==true)fail('CODE_ONLY_EXPLICIT_SPEC_WITHOUT_FAKE_ID_REQUIRED');
      currentSpec={color:{id:color['id'],code:color['code'] as string,name:color['name'] as string},fit:spec['fit'] as 'A'|'B',nativeGroupId:null,
        size:{name:size['name'] as string,registeredBarcodeSizeSegment:size['registeredBarcodeSizeSegment'] as string}};
    }
    routes.push({coreCodeOrdinal:x.coreCodeOrdinal,exactCodeRecord:structuredClone(originalCode),skuEntityKey:x.skuEntityKey,existingSkuId:x.skuEntityId,
      product,unit:product.body['unit'],exactApprovedSkuEntity:structuredClone(sku),originalVariant,currentSpec,
      route:x.skuEntityId===null?'ALLOCATE_APPROVED_CODE_ONLY_CURRENT_SPEC':'RESTORE_RETAINED_ORIGINAL_RUNTIME'});
  }
  if(routes.length!==binding.counts.records||originalIds.size!==binding.counts.originalIds
    ||routes.length-originalIds.size!==binding.counts.newCurrentSpecs)fail('CODE_ONLY_ENTITY_COUNTS_MISMATCH');
  return routes;
}
export interface CodeOnlySkuEntityReadback {
  readonly skuEntityKey:string;readonly runtimeSkuId:string;readonly originalSkuId:string|null;readonly generatedInTarget:boolean;
  readonly productId:string;readonly unit:string;readonly coreCodeOrdinal:number;readonly codeRecordSha256:string;
  readonly entitySha256:string;readonly originalVariantFieldsPreserved:boolean;readonly quantityContribution:null;
}
/** Runtime entities only: standard admitted app DataAccess is sufficient; the T32 code writer owns its separate migrator route. */
export async function registerApprovedCodeOnlySkuEntities(access:DataAccess,c:DatabaseConfig,admission:ProductionAdmission,
  root:string,approval:CurrentExportArtifact):Promise<{writes:number;readbacks:readonly CodeOnlySkuEntityReadback[];approvalManifestSha256:string;target:ReturnType<typeof productionTarget>}> {
  assertProductionAdmission(c,admission,'historical-import',approval.sha256);
  const manifest=JSON.parse(readFileSync(await currentExportArtifactPath(root,approval),'utf8')) as ApprovedCurrentSourceBodies & {codeOnlySkuEntities:CodeOnlySkuEntityBinding};
  if(manifest.schemaVersion!=='T32-APPROVED-CURRENT-SOURCE-BODIES-v1'||manifest.contractSha256!==currentSourceContractSha256
    ||manifest.dataClass!=='USER_APPROVED_CURRENT_SOURCE'||manifest.productionAuthorized!==true
    ||historyDigest(manifest.target)!==historyDigest(productionTarget(c)))fail('CODE_ONLY_SOURCE_ADMISSION_MANIFEST_REQUIRED');
  const routes=await readCodeOnlySkuEntityRoutes(root,manifest.codeOnlySkuEntities),r=ident(c.schemas.runtime),s=ident(c.schemas.source);
  return access.transaction(async session=>{
    await session.lock([{scope:'reference',key:'approved-current-entities'},{scope:'reference',key:'code-only-sku-entities'},
      ...[...new Set(routes.map(x=>x.product.id))].map(key=>({scope:'product' as const,key}))]);
    await assertProductionSession(session,c,admission,'historical-import',approval.sha256);
    let writes=0;const readbacks:CodeOnlySkuEntityReadback[]=[];
    for(const route of routes){
      writes+=await currentProduct(session,c,route.product);
      const unitRows=(await session.query<{unit:string}>(`SELECT u.name unit FROM ${s}.product p JOIN ${s}.unit u ON u.id=p.unit_id WHERE p.id=$1::uuid
        UNION ALL SELECT p.body->>'unit' unit FROM ${r}.product_overlay p WHERE p.id=$1::uuid AND NOT p.deleted
        AND NOT EXISTS(SELECT 1 FROM ${s}.product original WHERE original.id=p.id)`,[route.product.id])).rows;
      if(unitRows.length!==1||unitRows[0]?.unit!==route.unit)fail('CODE_ONLY_ACTUAL_PRODUCT_UNIT_DIFFERS');
      const productId=route.product.id,prior=(await session.query<{body:Record<string,unknown>;version:number}>(`SELECT body,version FROM ${r}.product_profile_overlay WHERE product_id=$1::uuid FOR UPDATE`,[productId])).rows[0];
      const old=prior?.body??{},entities=(old['codeOnlySkuEntities']??{}) as Record<string,Record<string,unknown>>;
      const bound=entities[route.skuEntityKey],proof={coreSha256:manifest.codeOnlySkuEntities.approvedMasterCore.sha256,
        prerequisitesSha256:manifest.codeOnlySkuEntities.prerequisites.sha256,codeRecordSha256:historyDigest(route.exactCodeRecord),
        entitySha256:historyDigest(route.exactApprovedSkuEntity),unit:route.unit,productId,originalSkuId:route.existingSkuId,
        originalVariant:route.originalVariant,currentSpec:route.currentSpec,quantityContribution:null,newBusinessEnabled:false};
      if(bound&&historyDigest(bound['proof'])!==historyDigest(proof))fail('CODE_ONLY_EXISTING_ENTITY_PROOF_CHANGED');
      let id=route.existingSkuId;
      if(id!==null){
        const v=route.originalVariant!;
        const color=(await session.query<{known:boolean}>(`SELECT EXISTS(SELECT id FROM ${s}.spec_value WHERE id=$1::uuid UNION ALL SELECT id::uuid FROM ${r}.product_master_overlay WHERE kind='colors' AND id=$1::text AND NOT deleted) known`,[v.color_id])).rows[0];
        if(!color?.known)fail('CODE_ONLY_RETAINED_COLOR_ORIGINAL_MASTER_REQUIRED');
        const sourceSize=(await session.query<{known:boolean}>(`SELECT EXISTS(SELECT 1 FROM ${s}.spec_value WHERE id=$1::uuid) known`,[v.size_id])).rows[0]?.known;
        if(!sourceSize){const actual=(await session.query<{group_name:string;name:string}>(`SELECT group_name,name FROM ${r}.size_overlay WHERE id=$1::uuid`,[v.size_id])).rows[0];
          // The supplied original variant proves its reference ID, not an absent original size-table row.
          // Per-SKU labels remain exactly on each variant, even when several variants share this reference.
          const expected=actual??{group_name:'@RETAINED_CODE_ONLY_SIZE_COORDINATE:'+v.size_id,name:'@REFERENCE:'+v.size_id};
          if(!actual){await session.query(`INSERT INTO ${r}.size_overlay(id,group_name,name) VALUES($1::uuid,$2,$3)`,[v.size_id,expected.group_name,expected.name]);writes++;}
          const back=(await session.query<{group_name:string;name:string}>(`SELECT group_name,name FROM ${r}.size_overlay WHERE id=$1::uuid`,[v.size_id])).rows[0];
          if(historyDigest(back)!==historyDigest(expected))fail('CODE_ONLY_RETAINED_SIZE_FIELDS_CHANGED');}
        writes+=await currentVariant(session,c,v);
        if(bound?.['runtimeSkuId']&&bound['runtimeSkuId']!==id)fail('CODE_ONLY_ORIGINAL_SKU_ID_CHANGED');
      }else{
        const spec=route.currentSpec!;writes+=await currentColor(session,c,spec.color.id,spec.color.code,spec.color.name);
        const sizeScope='@CODE_ONLY_UNKNOWN_GROUP:'+manifest.codeOnlySkuEntities.approvedMasterCore.sha256;
        let size=(await session.query<{id:string}>(`SELECT id FROM ${r}.size_overlay WHERE group_name=$1 AND name=$2`,[sizeScope,spec.size.name])).rows[0];
        if(!size){size=(await session.query<{id:string}>(`INSERT INTO ${r}.size_overlay(group_name,name) VALUES($1,$2) RETURNING id`,[sizeScope,spec.size.name])).rows[0];writes++;}
        if(!size||!uuid(size.id))fail('CODE_ONLY_ACTUAL_CURRENT_SIZE_REQUIRED');
        if(bound){if(!uuid(bound['runtimeSkuId']))fail('CODE_ONLY_ACTUAL_SKU_READBACK_REQUIRED');id=bound['runtimeSkuId'];
          writes+=await currentVariant(session,c,{id,product_id:productId,color_id:spec.color.id,size_id:size.id,size_name:spec.size.name,
            group_name:'',fit_id:spec.fit,size_code:spec.size.registeredBarcodeSizeSegment});}
        else{
          const generated=(await session.query<{id:string}>(`INSERT INTO ${r}.variant_overlay(product_id,color_id,size_id,size_name,group_name,fit_id,size_code)
            VALUES($1::uuid,$2::uuid,$3::uuid,$4,'',$5,$6) RETURNING id`,[productId,spec.color.id,size.id,spec.size.name,spec.fit,spec.size.registeredBarcodeSizeSegment])).rows[0];
          if(!generated||!uuid(generated.id))fail('CODE_ONLY_ACTUAL_SKU_READBACK_REQUIRED');id=generated.id;writes++;
          await currentVariant(session,c,{id,product_id:productId,color_id:spec.color.id,size_id:size.id,size_name:spec.size.name,
            group_name:'',fit_id:spec.fit,size_code:spec.size.registeredBarcodeSizeSegment});}
        const sizeBack=(await session.query<{group_name:string;name:string}>(`SELECT group_name,name FROM ${r}.size_overlay WHERE id=$1::uuid`,[size.id])).rows[0];
        if(sizeBack?.group_name!==sizeScope||sizeBack.name!==spec.size.name)fail('CODE_ONLY_CURRENT_SIZE_READBACK_DIFFERS');
      }
      const body={...old,codeOnlySkuEntities:{...entities,[route.skuEntityKey]:{runtimeSkuId:id,generatedInTarget:route.existingSkuId===null,proof}},
        disabledSkuIds:[...new Set([...(Array.isArray(old['disabledSkuIds'])?old['disabledSkuIds'] as string[]:[]),id])].sort()};
      if(historyDigest(body)!==historyDigest(old)){
        if(prior)await session.query(`UPDATE ${r}.product_profile_overlay SET body=$2::jsonb,version=version+1,updated_at=now() WHERE product_id=$1::uuid AND version=$3`,[productId,JSON.stringify(body),prior.version]);
        else await session.query(`INSERT INTO ${r}.product_profile_overlay(product_id,body,version) VALUES($1::uuid,$2::jsonb,1)`,[productId,JSON.stringify(body)]);writes++;
      }
      const profile=(await session.query<{body:unknown}>(`SELECT body,version FROM ${r}.product_profile_overlay WHERE product_id=$1::uuid FOR UPDATE`,[productId])).rows[0];
      if(historyDigest(profile?.body)!==historyDigest(body))fail('CODE_ONLY_ENTITY_PROFILE_READBACK_DIFFERS');
      readbacks.push({skuEntityKey:route.skuEntityKey,runtimeSkuId:id,originalSkuId:route.existingSkuId,generatedInTarget:route.existingSkuId===null,
        productId,unit:route.unit,coreCodeOrdinal:route.coreCodeOrdinal,codeRecordSha256:proof.codeRecordSha256,entitySha256:proof.entitySha256,
        originalVariantFieldsPreserved:route.originalVariant!==null,quantityContribution:null});
    }
    await assertProductionSession(session,c,admission,'historical-import',approval.sha256);
    return {writes,readbacks,approvalManifestSha256:approval.sha256,target:productionTarget(c)};
  });
}
/** Before allocation: exact approved current products and the 18 independently proved original runtime variants. */
export async function registerFormalCurrentEntityPrerequisites(access:DataAccess,c:DatabaseConfig,admission:ProductionAdmission,
  root:string,source:CurrentExportArtifact):Promise<{writes:number;products:number;retainedVariants:number;target:HistoryImportTarget;sourceSha256:string}> {
  assertProductionAdmission(c,admission,'baseline-import',source.sha256);
  const plan=await currentEntityPlan(root,await sourceInput(root,source)),r=ident(c.schemas.runtime),s=ident(c.schemas.source);
  return access.transaction(async session=>{
    await beginCurrentEntityWrite(session,c,admission,source);let writes=0,retainedVariants=0;
    for(const p of plan.products)writes+=await currentProduct(session,c,p);
    for(const a of plan.attributes.values())if(a.kind==='SKU'){
      const p=a.stage==='KNOWN_ORIGINAL_ENTITY_REQUIRED_BEFORE_REGISTRY_ALLOCATION'?a.product:a.canonicalProduct;
      const known=(await session.query<{found:boolean}>(`SELECT EXISTS(SELECT id FROM ${s}.product WHERE id=$1::uuid UNION ALL SELECT id FROM ${r}.product_overlay WHERE id=$1::uuid AND NOT deleted) found`,[p.id])).rows[0];
      if(!known?.found)fail('CURRENT_SKU_REGISTERED_PRODUCT_REQUIRED');
      if(a.stage!=='KNOWN_ORIGINAL_ENTITY_REQUIRED_BEFORE_REGISTRY_ALLOCATION')continue;
      const v=a.originalRuntimeVariant,color=(await session.query<{found:boolean}>(`SELECT EXISTS(SELECT id FROM ${s}.spec_value WHERE id=$1::uuid UNION ALL SELECT id::uuid FROM ${r}.product_master_overlay WHERE kind='colors' AND id=$1::text AND NOT deleted) found`,[v.color_id])).rows[0];
      if(!color?.found){const definition=p.body['currentColor'] as {id?:string;code?:string;name?:string}|undefined;
        if(definition?.id!==v.color_id||!definition.code||!definition.name)fail('RETAINED_VARIANT_COLOR_ENTITY_REQUIRED');
        writes+=await currentColor(session,c,v.color_id,definition.code,definition.name);}
      const originalSize=(await session.query<{found:boolean}>(`SELECT EXISTS(SELECT 1 FROM ${s}.spec_value WHERE id=$1::uuid) found`,[v.size_id])).rows[0]?.found;
      if(!originalSize){const size=(await session.query<{group_name:string;name:string}>(`SELECT group_name,name FROM ${r}.size_overlay WHERE id=$1::uuid`,[v.size_id])).rows[0];
        if(size&&(size.group_name!==v.group_name||size.name!==v.size_name))fail('CURRENT_ENTITY_ALREADY_BOUND_TO_DIFFERENT_ATTRIBUTES');
        if(!size){await session.query(`INSERT INTO ${r}.size_overlay(id,group_name,name) VALUES($1::uuid,$2,$3)`,[v.size_id,v.group_name,v.size_name]);writes++;}
        const actual=(await session.query<{group_name:string;name:string}>(`SELECT group_name,name FROM ${r}.size_overlay WHERE id=$1::uuid`,[v.size_id])).rows[0];
        if(actual?.group_name!==v.group_name||actual.name!==v.size_name)fail('CURRENT_ENTITY_ACTUAL_READBACK_MISMATCH');}
      writes+=await currentVariant(session,c,v);retainedVariants++;
    }
    await assertProductionSession(session,c,admission,'baseline-import',source.sha256);
    return {writes,products:plan.products.length,retainedVariants,target:historyImportTarget(c),sourceSha256:source.sha256};
  });
}
async function currentSkuProfile(session:DataSession,c:DatabaseConfig,productId:string,id:string,facts:Record<string,unknown>):Promise<number> {
  const r=ident(c.schemas.runtime);
  const prior=(await session.query<{body:Record<string,unknown>;version:number}>(`SELECT body,version FROM ${r}.product_profile_overlay WHERE product_id=$1::uuid FOR UPDATE`,[productId])).rows[0];
  const old=prior?.body??{},entities=(old['currentQuantityEntities']??{}) as Record<string,unknown>;
  if(entities[id]&&historyDigest(entities[id])!==historyDigest(facts))fail('CURRENT_ENTITY_ALREADY_BOUND_TO_DIFFERENT_ATTRIBUTES');
  const disabled=Array.isArray(old['disabledSkuIds'])?old['disabledSkuIds'] as string[]:[];
  if(entities[id]&&disabled.includes(id))return 0;
  const body={...old,disabledSkuIds:[...new Set([...disabled,id])].sort(),currentQuantityEntities:{...entities,[id]:facts}};
  if(prior)await session.query(`UPDATE ${r}.product_profile_overlay SET body=$2::jsonb,version=version+1,updated_at=now() WHERE product_id=$1::uuid AND version=$3`,[productId,JSON.stringify(body),prior.version]);
  else await session.query(`INSERT INTO ${r}.product_profile_overlay(product_id,body,version) VALUES($1::uuid,$2::jsonb,1)`,[productId,JSON.stringify(body)]);
  const actual=(await session.query<{body:Record<string,unknown>}>(`SELECT body,version FROM ${r}.product_profile_overlay WHERE product_id=$1::uuid FOR UPDATE`,[productId])).rows[0];
  if(historyDigest(actual?.body)!==historyDigest(body))fail('CURRENT_ENTITY_ACTUAL_READBACK_MISMATCH');return 1;
}
/** After allocation: actual current entity IDs come exclusively from this target's registry. */
export async function materializeFormalCurrentQuantityEntities(access:DataAccess,c:DatabaseConfig,admission:ProductionAdmission,
  root:string,source:CurrentExportArtifact):Promise<{writes:number;entities:number;correctedSizeCoordinates:number;target:HistoryImportTarget;sourceSha256:string;readbacks:readonly Record<string,unknown>[]}> {
  assertProductionAdmission(c,admission,'baseline-import',source.sha256);
  const manifest=await sourceInput(root,source),plan=await currentEntityPlan(root,manifest),r=ident(c.schemas.runtime),s=ident(c.schemas.source);
  return access.transaction(async session=>{
    await beginCurrentEntityWrite(session,c,admission,source);
    const actual=(await session.query<CurrentQuantityIdentityRow>(`SELECT kind,target_key,id,generated_in_target,evidence_sha256,body FROM ${r}.inventory_quantity_identity ORDER BY kind,target_key`)).rows;
    const identities=new Map(actual.map(x=>[x.kind+':'+x.target_key,x]));
    if(actual.length!==plan.plans.length)fail('CURRENT_ENTITY_IDENTITY_PLAN_NOT_ACTUALLY_ALLOCATED');
    for(const p of plan.plans){const a=identities.get(p.kind+':'+p.targetKey);
      if(!a||!uuid(a.id)||a.evidence_sha256!==p.evidenceSha256||historyDigest(a.body)!==historyDigest(p.body)
        ||(p.existingId===null?!a.generated_in_target:a.generated_in_target||a.id!==p.existingId))fail('CURRENT_ENTITY_IDENTITY_PLAN_NOT_ACTUALLY_ALLOCATED');}
    let writes=0,correctedSizeCoordinates=0;const readbacks:Record<string,unknown>[]=[];
    for(const p of plan.plans.filter(x=>x.existingId===null)){
      const a=plan.attributes.get(p.kind+':'+p.targetKey)!,id=identities.get(p.kind+':'+p.targetKey)!.id;
      if(a.stage!=='AFTER_T33_ACTUAL_REGISTRY_ALLOCATION_READBACK')fail('CURRENT_ENTITY_GENERATED_ID_OR_HISTORY_CLAIM_REJECTED');
      if(a.kind==='SKU'){
        const m=a.entityMaterialization;
        if(id===m.productId||m.kind==='CURRENT_OBSERVED_SKU'&&id===m.t30CandidateDeterministicSkuId)fail('CURRENT_ENTITY_ID_NOT_ACTUAL_NEW_COORDINATE');
        const product=(await session.query<{found:boolean}>(`SELECT EXISTS(SELECT id FROM ${s}.product WHERE id=$1::uuid UNION ALL SELECT id FROM ${r}.product_overlay WHERE id=$1::uuid AND NOT deleted) found`,[m.productId])).rows[0];
        if(!product?.found)fail('CURRENT_SKU_REGISTERED_PRODUCT_REQUIRED');
        writes+=await currentColor(session,c,m.colorId,m.colorCode,m.colorName);let sizeId:string;
        if(m.kind==='CURRENT_OBSERVED_SKU'){
          const size=(await session.query<{code:string;name:string}>(`SELECT code,name FROM ${s}.spec_value WHERE id=$1::uuid`,[m.sizeId])).rows[0];
          if(size?.code!==m.sizeCode||size.name!==m.sizeName)fail('CURRENT_OBSERVED_ORIGINAL_SIZE_ENTITY_REQUIRED');sizeId=m.sizeId;
        }else{
          // This column is an explicit storage namespace, not an asserted native size group.
          const sizeNamespace='@CURRENT_SOURCE_UNKNOWN_GROUP:'+source.sha256;
          let size=(await session.query<{id:string}>(`SELECT id FROM ${r}.size_overlay WHERE group_name=$1 AND name=$2`,[sizeNamespace,m.sizeName])).rows[0];
          if(!size){size=(await session.query<{id:string}>(`INSERT INTO ${r}.size_overlay(group_name,name) VALUES($1,$2) RETURNING id`,[sizeNamespace,m.sizeName])).rows[0];writes++;}
          if(!size||!uuid(size.id))fail('CURRENT_CORRECTED_SIZE_ACTUAL_COORDINATE_REQUIRED');sizeId=size.id;correctedSizeCoordinates++;
          const back=(await session.query<{group_name:string;name:string}>(`SELECT group_name,name FROM ${r}.size_overlay WHERE id=$1::uuid`,[sizeId])).rows[0];
          if(back?.group_name!==sizeNamespace||back.name!==m.sizeName)fail('CURRENT_ENTITY_ACTUAL_READBACK_MISMATCH');
        }
        writes+=await currentVariant(session,c,{id,product_id:m.productId,color_id:m.colorId,size_id:sizeId,size_name:m.sizeName,
          group_name:'',fit_id:m.fitId??'',size_code:m.sizeCode});
        const facts={namespace:m.kind==='CURRENT_OBSERVED_SKU'?'CURRENT_OBSERVED':'CURRENT_CORRECTED',originalHistoricalIdentityClaimed:false,
          sourceSha256:source.sha256,identityEvidenceSha256:p.evidenceSha256,originalAttributes:a,fitId:m.fitId,nativeGroupId:null,
          physicalUnknownFit:'EMPTY_TEXT_IS_UNKNOWN_NOT_A',physicalUnknownNativeGroup:'EMPTY_TEXT_IS_UNKNOWN_NOT_INFERRED',actualSizeId:sizeId,
          currentSizeStorageNamespaceIsNotNativeGroup:m.kind==='CURRENT_CORRECTED_SKU',newBusinessEnabled:false,actualEntityId:id};
        writes+=await currentSkuProfile(session,c,m.productId,id,facts);readbacks.push(facts);
      }else{
        const m=a.entityMaterialization;
        if((await session.query<{found:boolean}>(`SELECT EXISTS(SELECT 1 FROM ${s}.warehouse WHERE id=$1::uuid) found`,[id])).rows[0]?.found)
          fail('CURRENT_ENTITY_ID_COLLIDES_WITH_SOURCE_ORIGINAL');
        const halls=(await session.query<{id:string;code:string}>(`SELECT id,body->>'code' code FROM ${r}.master_data_entity WHERE kind='halls' AND body->>'code'=ANY($1::text[])
          AND coalesce((body->>'enabled')::boolean,false) UNION ALL SELECT h.id::text,h.source_code FROM ${s}.tplus_hall h
          WHERE h.source_code=ANY($1::text[]) AND h.batch_id=(SELECT batch_id FROM ${s}.tplus_import_run WHERE status='COMMITTED' ORDER BY committed_at DESC NULLS LAST,started_at DESC LIMIT 1)
          AND NOT EXISTS(SELECT 1 FROM ${r}.master_data_entity e WHERE e.kind='halls' AND e.id=h.id::text)`,[m.hallCodes])).rows;
        const hallIds=m.hallCodes.map(code=>{const matches=halls.filter(h=>h.code===code);if(matches.length!==1||!uuid(matches[0]?.id))fail('CURRENT_WAREHOUSE_ACTUAL_HALL_ID_REQUIRED');return matches[0]!.id;});
        const body={code:m.code,name:m.name,enabled:true,type:'WAREHOUSE',hallRelations:[...new Set(hallIds)].sort(),sourceOwnershipUnknown:false};
        const facts={namespace:'CONFIRMED_CURRENT_WAREHOUSE',originalHistoricalIdentityClaimed:false,sourceSha256:source.sha256,
          identityEvidenceSha256:p.evidenceSha256,originalAttributes:a,originalWarehouseId:null,currentContainerEnabled:true,currentContainerType:'WAREHOUSE'};
        const expected={id,name:m.name,enabled:true,method_id:null};
        const prior=(await session.query<Record<string,unknown>>(`SELECT id,name,enabled,method_id FROM ${r}.master_reference_overlay WHERE kind='warehouses' AND id=$1::uuid`,[id])).rows[0];
        if(prior&&historyDigest(prior)!==historyDigest(expected))fail('CURRENT_ENTITY_ALREADY_BOUND_TO_DIFFERENT_ATTRIBUTES');
        if(!prior){await session.query(`INSERT INTO ${r}.master_reference_overlay(kind,id,name,enabled,method_id) VALUES('warehouses',$1::uuid,$2,true,NULL)`,[id,m.name]);writes++;}
        const entity=(await session.query<{body:unknown;source_facts:unknown}>(`SELECT body,source_facts FROM ${r}.master_data_entity WHERE kind='warehouses' AND id=$1`,[id])).rows[0];
        if(entity&&(historyDigest(entity.body)!==historyDigest(body)||historyDigest(entity.source_facts)!==historyDigest(facts)))fail('CURRENT_ENTITY_ALREADY_BOUND_TO_DIFFERENT_ATTRIBUTES');
        if(!entity){await session.query(`INSERT INTO ${r}.master_data_entity(kind,id,body,source_facts,version,updated_by)
          VALUES('warehouses',$1,$2::jsonb,$3::jsonb,1,'T33_APPROVED_CURRENT_SOURCE')`,[id,JSON.stringify(body),JSON.stringify(facts)]);writes++;}
        const back=(await session.query<Record<string,unknown>>(`SELECT id,name,enabled,method_id FROM ${r}.master_reference_overlay WHERE kind='warehouses' AND id=$1::uuid`,[id])).rows[0];
        const entityBack=(await session.query<{body:unknown;source_facts:unknown}>(`SELECT body,source_facts FROM ${r}.master_data_entity WHERE kind='warehouses' AND id=$1`,[id])).rows[0];
        if(historyDigest(back)!==historyDigest(expected)||historyDigest(entityBack?.body)!==historyDigest(body)||historyDigest(entityBack?.source_facts)!==historyDigest(facts))fail('CURRENT_ENTITY_ACTUAL_READBACK_MISMATCH');
        readbacks.push({actualEntityId:id,namespace:'CONFIRMED_CURRENT_WAREHOUSE',originalWarehouseId:null,hallIds:body.hallRelations,originalAttributes:a});
      }
    }
    await assertProductionSession(session,c,admission,'baseline-import',source.sha256);
    return {writes,entities:readbacks.length,correctedSizeCoordinates,target:historyImportTarget(c),sourceSha256:source.sha256,readbacks};
  });
}
async function businessMasters(session:DataSession,c:DatabaseConfig,plan:PreparedCurrentExport):Promise<void> {
  const r=ident(c.schemas.runtime),s=ident(c.schemas.source);
  for(let at=0;at<plan.cells.length;at+=500){const wanted=plan.cells.slice(at,at+500).map(x=>({warehouse:x.mapping.runtimeWarehouseId,sku:x.mapping.runtimeSkuId}));
    const missing=(await session.query<{n:string}>(`WITH w AS(SELECT id FROM ${s}.warehouse UNION SELECT id FROM ${r}.master_reference_overlay WHERE kind='warehouses'),
      v AS(SELECT id FROM ${s}.variant UNION SELECT id FROM ${r}.variant_overlay)
      SELECT count(*)::text n FROM jsonb_to_recordset($1::jsonb) x(warehouse uuid,sku uuid)
      LEFT JOIN w ON w.id=x.warehouse LEFT JOIN v ON v.id=x.sku WHERE w.id IS NULL OR v.id IS NULL`,[JSON.stringify(wanted)])).rows[0]?.n;
    if(missing!=='0')fail('FORMAL_QUANTITY_IDENTITY_REQUIRES_REAL_BUSINESS_MASTER');}
}
export function formalDocumentStockTerms(type:string,body:Record<string,unknown>):string {
  if(!Array.isArray(body['lines']))fail('FORMAL_HISTORICAL_STOCK_TERMS_REQUIRED');
  return historyDigest({type,lines:(body['lines'] as Record<string,unknown>[]).map(x=>({sku:x['sku_id'],warehouse:x['warehouse_id']??null,
    from:x['from_warehouse_id']??null,to:x['to_warehouse_id']??null,unit:x['unit']??x['measurement_unit']??null,
    quantity:formatScaled(parseScaled(x['source_quantity'],4,false),4),
    originalContribution:x['stock_quantity_contribution']===undefined||x['stock_quantity_contribution']===null?null:formatScaled(parseScaled(x['stock_quantity_contribution'],4,false),4)}))});
}
async function bindHistoricalDocuments(session:DataSession,c:DatabaseConfig,admission:ProductionAdmission,root:string,manifest:FormalHistoricalBaselineSource,plan:PreparedCurrentExport):Promise<number> {
  assertProductionAdmission(c,admission,'historical-import',bodyApproval(manifest).sha256);
  const approvalPath=await currentExportArtifactPath(root,manifest.artifacts.historicalBodyApproval);
  const approval=JSON.parse(readFileSync(approvalPath,'utf8')) as {schemaVersion:string;productionAuthorized:boolean;target:unknown;t30BatchId?:string;t32BatchId?:string;
    documents:{documentId:string;sourceRevision:number;bodySha256:string;recordsSha256?:string}[]};
  if(approval.schemaVersion!=='T32-PRODUCTION-HISTORICAL-BODY-MANIFEST-v1'||approval.productionAuthorized!==true
    ||historyDigest(approval.target)!==historyDigest(productionTarget(c))||!Array.isArray(approval.documents))fail('FORMAL_T32_HISTORICAL_OWNER_APPROVAL_REQUIRED');
  const approved=new Map(approval.documents.map(x=>[x.documentId,x]));
  const bindingsPath=await currentExportArtifactPath(root,manifest.artifacts.historicalDocumentBindings);
  const bindings=new Map<string,{sourceCanonicalEventId:string;documentId:string;revision:number;bodySha256:string;effectIdentity?:string|null}>();
  const documentIds=new Set<string>();
  for await(const {row} of currentExportLines(bindingsPath)){
    const x=row as {sourceCanonicalEventId:string;documentId:string;revision:number;bodySha256:string;effectIdentity?:string|null},expected=approved.get(x.documentId);
    if(!x.sourceCanonicalEventId||bindings.has(x.sourceCanonicalEventId)||!uuid(x.documentId)||documentIds.has(x.documentId)||!expected
      ||x.revision!==expected.sourceRevision||x.bodySha256!==expected.bodySha256)fail('FORMAL_FROZEN_SOURCE_DOCUMENT_BINDING_REQUIRED');
    bindings.set(x.sourceCanonicalEventId,x);documentIds.add(x.documentId);
  }
  const legs=new Map<string,(HistoryEffect & {counted:bigint})[]>(),includedDocuments=new Set<string>(),mapped=new Map(plan.cells.map(x=>[x.key,x.mapping]));
  for await(const {row} of currentExportLines(plan.paths.endpoints)){
    const x=row as {sourceFamily:string;sourceCanonicalEventId:string|null;quantityDimensionKey:readonly string[];selectedQuantity:string;signedOriginalQuantity:string;includedInConfirmedBasis:boolean};
    if(!['SALE','TRANSFER_IN','TRANSFER_OUT'].includes(x.sourceFamily))continue;
    if(!x.sourceCanonicalEventId||!bindings.has(x.sourceCanonicalEventId))fail('FORMAL_BUSINESS_SOURCE_EVENT_NOT_BOUND_TO_IMPORTED_DOCUMENT');
    if(x.includedInConfirmedBasis)includedDocuments.add(x.sourceCanonicalEventId);
    const m=mapped.get(JSON.stringify(x.quantityDimensionKey));if(!m)fail('FORMAL_SOURCE_LEG_MAPPING_REQUIRED');
    const list=legs.get(x.sourceCanonicalEventId)??[];
    list.push({index:list.length,warehouse:m.runtimeWarehouseId,sku:m.runtimeSkuId,unit:x.quantityDimensionKey[2]!,
      quantity:parseScaled(x.signedOriginalQuantity,4,false),counted:parseScaled(x.selectedQuantity,4,false)});
    legs.set(x.sourceCanonicalEventId,list);
  }
  const r=ident(c.schemas.runtime);let writes=0;
  for(const binding of bindings.values()){
    const current=(await session.query<{document_type:string;current_revision:number;baseline_was_included:boolean;current_effect_active:boolean;
      status:string;version:number;active_effect_revision:number|null;active_effect_identity:string|null;source_identity:Record<string,unknown>|null;original_imported:boolean;body:Record<string,unknown>}>(
      `SELECT d.document_type,d.current_revision,d.baseline_was_included,d.current_effect_active,d.status,d.version,d.active_effect_revision,
        d.active_effect_identity,d.source_identity,v.original_imported,v.body FROM ${r}.document d
        JOIN ${r}.revision v ON v.document_id=d.id AND v.revision=d.current_revision WHERE d.id=$1::uuid FOR UPDATE OF d`,[binding.documentId])).rows[0];
    if(!current||current.current_revision!==binding.revision||historyDigest(current.body)!==binding.bodySha256)fail('FORMAL_ACTUAL_IMPORTED_HISTORICAL_BODY_CHANGED');
    const contribution=legs.get(binding.sourceCanonicalEventId)??[];
    const included=includedDocuments.has(binding.sourceCanonicalEventId);
    if(current.current_effect_active!==included||current.baseline_was_included&&!included)fail('FORMAL_IMPORTED_STATE_DIFFERS_FROM_APPROVED_CURRENT_SOURCE');
    const conflict=(await session.query<{conflict:boolean}>(`SELECT EXISTS(SELECT 1 FROM ${r}.inventory_formal_baseline_document WHERE document_id=$1::uuid) conflict`,[binding.documentId])).rows[0]?.conflict;
    if(conflict!==false)fail('FORMAL_HISTORICAL_CONSUMPTION_ALREADY_BOUND');
    let firstInclusion:Record<string,unknown>|undefined;
    if(included&&!current.baseline_was_included){
      const origin=current.source_identity?.['historicalBodyImport'] as {approvedManifestSha256?:string;exactProductionTarget?:unknown;
        t30BatchId?:string;t32BatchId?:string;sourceRevision?:number;bodySha256?:string;inputSha256?:string}|undefined;
      const expected=approved.get(binding.documentId)!;
      if(!current.original_imported||current.version!==1||current.status!=='APPROVED'||current.active_effect_revision!==binding.revision
        ||typeof binding.effectIdentity!=='string'||!binding.effectIdentity.startsWith('baseline:')||current.active_effect_identity!==binding.effectIdentity
        ||!origin||origin.approvedManifestSha256!==manifest.artifacts.historicalBodyApproval.sha256||!origin.exactProductionTarget
        ||historyDigest(origin.exactProductionTarget)!==historyDigest(productionTarget(c))||origin.sourceRevision!==binding.revision||origin.bodySha256!==binding.bodySha256
        ||typeof approval.t30BatchId!=='string'||typeof approval.t32BatchId!=='string'||origin.t30BatchId!==approval.t30BatchId||origin.t32BatchId!==approval.t32BatchId
        ||typeof expected.recordsSha256!=='string'||!/^[a-f0-9]{64}$/.test(expected.recordsSha256)
        ||typeof origin.inputSha256!=='string'||!/^[a-f0-9]{64}$/.test(origin.inputSha256))fail('FORMAL_FIRST_INCLUSION_SOURCE_NOT_BOUND');
      assertProductionAdmission(c,admission,'historical-import',manifest.artifacts.historicalBodyApproval.sha256);
      const updated=await session.query(`UPDATE ${r}.document SET baseline_was_included=true WHERE id=$1::uuid
        AND NOT baseline_was_included AND current_effect_active AND status='APPROVED' AND version=1
        AND current_revision=$2 AND active_effect_revision=$2 AND active_effect_identity=$3 AND source_identity=$4::jsonb RETURNING id`,
        [binding.documentId,binding.revision,binding.effectIdentity,JSON.stringify(current.source_identity)]);
      if(updated.rowCount!==1)fail('FORMAL_FIRST_INCLUSION_STATE_CHANGED');writes++;
      firstInclusion={kind:'FIRST_FORMAL_IMPORTED_EFFECT_INCLUDED',previousBaselineWasIncluded:false,
        effectIdentity:binding.effectIdentity,sourceRevision:binding.revision,bodySha256:binding.bodySha256,
        recordsSha256:expected.recordsSha256,t32ImportInputSha256:origin.inputSha256};
    }
    await session.query(`INSERT INTO ${r}.inventory_formal_baseline_document(run_id,document_id,source_canonical_id,imported_revision,imported_body_sha256,stock_terms_sha256,leg_count,proof)
      VALUES($1,$2::uuid,$3,$4,$5,$6,$7,$8::jsonb)`,[plan.input.runId,binding.documentId,binding.sourceCanonicalEventId,binding.revision,binding.bodySha256,
      formalDocumentStockTerms(current.document_type,current.body),contribution.length,JSON.stringify({kind:'FROZEN_CURRENT_SOURCE_CONSUMPTION_ANCHOR',
        historicalBodyApprovalSha256:manifest.artifacts.historicalBodyApproval.sha256,bindingsSha256:manifest.artifacts.historicalDocumentBindings.sha256,
        ...(firstInclusion?{firstFormalInclusion:firstInclusion}:{})})]);writes++;
    let batch:string[]=[],bytes=2;
    const flush=async():Promise<void>=>{if(!batch.length)return;
      await session.query(`INSERT INTO ${r}.inventory_formal_baseline_document_leg(run_id,document_id,ordinal,warehouse_id,sku_id,unit,counted_quantity,approval_quantity)
        SELECT $1,$2::uuid,x.ordinal,x.warehouse,x.sku,x.unit,x.counted,x.approval FROM jsonb_to_recordset($3::jsonb)
        x(ordinal integer,warehouse uuid,sku uuid,unit text,counted numeric,approval numeric)`,[plan.input.runId,binding.documentId,'['+batch.join(',')+']']);
      writes++;batch=[];bytes=2;};
    for(const x of contribution){const row=JSON.stringify({ordinal:x.index,warehouse:x.warehouse,sku:x.sku,unit:x.unit,
      counted:formatScaled(x.counted,4),approval:formatScaled(x.quantity,4)}),size=Buffer.byteLength(row);
      if(bytes+size+(batch.length?1:0)>262144)await flush();bytes+=size+(batch.length?1:0);batch.push(row);}
    await flush();
  }
  const unbound=(await session.query<{n:string}>(`SELECT count(*)::text n FROM ${r}.document d
    WHERE (baseline_was_included OR current_effect_active) AND NOT EXISTS(SELECT 1 FROM ${r}.inventory_formal_baseline_document b
      WHERE b.run_id=$1 AND b.document_id=d.id)`,[plan.input.runId])).rows[0]?.n;
  if(unbound!=='0')fail('FORMAL_ACTIVE_HISTORICAL_DOCUMENT_NOT_CONSUMPTION_BOUND');
  return writes;
}
/** Current observations are counted by the unchanged quantity plan; readonly archives get no reversal legs. */
async function bindApprovedCurrentSource(session:DataSession,c:DatabaseConfig,p:ApprovedCurrentSourceStream,runId:string):Promise<number> {
  const s=ident(c.schemas.source),r=ident(c.schemas.runtime);
  const same=(a:unknown,b:unknown):boolean=>a!==undefined&&b!==undefined&&historyDigest(a)===historyDigest(b);
  const batches=(await session.query<{id:string;status:string}>(`SELECT id,status FROM ${s}.import_batch WHERE sha256=$1 AND importer_version=$2`,
    [p.manifestSha256,currentSourceContract.schemaVersion])).rows;
  if(batches.length!==1||batches[0]?.status!=='COMMITTED'||!uuid(batches[0].id))fail('CURRENT_SOURCE_APPROVED_ROWS_NOT_IMPORTED');
  const documentKeys=new Map<string,{id:string;revision:number}>();
  const indexed=(await session.query<{id:string;current_revision:number;source_group_key:string}>(`SELECT id,current_revision,
    source_identity->'currentSourceBinding'->>'sourceGroupKey' source_group_key FROM ${r}.document
    WHERE source_identity->'currentSourceBinding'->>'sourceGroupKey' IS NOT NULL`)).rows;
  for(const row of indexed){
    if(!uuid(row.id)||!Number.isSafeInteger(row.current_revision)||row.current_revision<1||documentKeys.has(row.source_group_key))
      fail('CURRENT_SOURCE_ACTUAL_READONLY_DOCUMENT_CHANGED');
    documentKeys.set(row.source_group_key,{id:row.id,revision:row.current_revision});
  }
  let observed=0,bytes=0;
  let batch:{sourceEndpointId:string;storageOrdinal:number;observationSha256:string;bindingSha256:string}[]=[];
  const flush=async():Promise<void>=>{
    if(!batch.length)return;const keys=batch.map(x=>x.sourceEndpointId);
    const rows=(await session.query<{source_key:string;source_type:string;raw_value:Record<string,unknown>}>(`SELECT source_key,source_type,raw_value FROM ${s}.source_record
      WHERE batch_id=$1::uuid AND source_key=ANY($2::text[])`,[batches[0]!.id,keys])).rows;
    const stored=new Map(rows.map(x=>[x.source_key,x]));
    if(rows.length!==keys.length||stored.size!==keys.length)fail('CURRENT_SOURCE_APPROVED_ROW_COVERAGE_MISMATCH');
    for(const expected of batch){
      const row=stored.get(expected.sourceEndpointId),body=row?.raw_value;
      if(row?.source_type!=='CURRENT_SOURCE_ROW_OBSERVATION'||body?.['namespace']!=='CURRENT_SOURCE_ROW_OBSERVATION'
        ||body['approvalManifestSha256']!==p.manifestSha256||body['readonly']!==true||body['auditAllowed']!==false
        ||body['storageOrdinal']!==expected.storageOrdinal||body['storageRowNumberSemantic']!=='IMPORT_OBSERVATION_ORDER_NOT_ORIGINAL_WORKSHEET_ROW'
        ||body['observation']===undefined||historyDigest(body['observation'])!==expected.observationSha256
        ||body['binding']===undefined||historyDigest(body['binding'])!==expected.bindingSha256)
        fail('CURRENT_SOURCE_IMPORTED_ROW_OR_MAPPING_CHANGED');
    }
    batch=[];bytes=0;
  };
  for await(const item of iterateApprovedCurrentSourceObservations(p)){
    if(item.storageOrdinal!==++observed||item.binding.sourceEndpointId!==item.observation.endpoint.sourceEndpointId)
      fail('CURRENT_SOURCE_IMPORTED_ROW_OR_MAPPING_CHANGED');
    const size=Buffer.byteLength(JSON.stringify(item.observation))+Buffer.byteLength(JSON.stringify(item.binding))+512;
    if(batch.length&&(batch.length>=500||bytes+size>262144))await flush();
    batch.push({sourceEndpointId:item.observation.endpoint.sourceEndpointId,storageOrdinal:item.storageOrdinal,
      observationSha256:item.observationSha256,bindingSha256:item.bindingSha256});bytes+=size;
    if(batch.length>=500||bytes>=262144)await flush();
  }
  await flush();
  const count=(await session.query<{n:string}>(`SELECT count(*)::text n FROM ${s}.source_record WHERE batch_id=$1::uuid`,[batches[0].id])).rows[0]?.n;
  if(observed!==p.counts.observations||count!==String(observed))fail('CURRENT_SOURCE_APPROVED_ROW_COVERAGE_MISMATCH');
  let writes=0;
  let documentCount=0;
  for await(const frame of iterateApprovedCurrentSourceDocuments(p)){
    const document=frame.document;documentCount++;
    const indexedDocument=documentKeys.get(document.sourceGroupKey);
    if(!indexedDocument)fail('CURRENT_SOURCE_ACTUAL_READONLY_DOCUMENT_CHANGED');
    const rows=(await session.query<{id:string;document_type:string;number:string;status:string;version:number;current_revision:number;
      baseline_was_included:boolean;current_effect_active:boolean;active_effect_identity:string|null;active_effect_revision:number|null;
      source_identity:Record<string,unknown>;original_imported:boolean;body:Record<string,unknown>}>(
      `SELECT d.id,d.document_type,d.number,d.status,d.version,d.current_revision,d.baseline_was_included,d.current_effect_active,
        d.active_effect_identity,d.active_effect_revision,d.source_identity,v.original_imported,v.body FROM ${r}.document d
        JOIN ${r}.revision v ON v.document_id=d.id AND v.revision=d.current_revision
        WHERE d.id=$1::uuid AND d.current_revision=$2
          AND d.source_identity->'currentSourceBinding'->>'sourceGroupKey'=$3 FOR UPDATE OF d`,
      [indexedDocument.id,indexedDocument.revision,document.sourceGroupKey])).rows;
    const d=rows[0],meta=d?.source_identity?.['currentSourceBinding'] as Record<string,unknown>|undefined;
    const effective=document.currentObservedState==='生效';
    const status=effective?'APPROVED':['作废','废弃','已废弃'].includes(document.currentObservedState??'')?'DELETED':'UNAUDITED';
    const identity=effective?'baseline:current-source:'+historyDigest([p.manifestSha256,document.sourceGroupKey]):null;
    if(rows.length!==1||!d||!uuid(d.id)||d.document_type!==document.documentType||d.number!==document.sourceNumber||d.version!==1
      ||d.current_revision!==document.archiveRevision||!d.original_imported||historyDigest(d.body)!==document.bodySha256
      ||d.baseline_was_included!==false||d.current_effect_active!==effective||d.status!==status||d.active_effect_identity!==identity
      ||d.active_effect_revision!==(effective?document.archiveRevision:null)||!meta
      ||meta['schemaVersion']!==currentSourceContract.schemaVersion||meta['contractSha256']!==currentSourceContractSha256
      ||meta['approvalManifestSha256']!==p.manifestSha256||!same(meta['target'],productionTarget(c))
      ||meta['readonly']!==true||meta['auditAllowed']!==false||meta['mode']!=='BOUND_READONLY_CURRENT_DOCUMENT'
      ||meta['originalDocumentId']!==document.originalDocumentId||meta['originalHistoricalRevision']!==document.originalHistoricalRevision
      ||meta['historicalStateTimelineConfirmed']!==false||meta['historicalStateAtExactCutoffConfirmed']!==false
      ||meta['currentObservedState']!==document.currentObservedState||meta['statusSemantic']!=='CURRENT_IMPORTED_READONLY_CONTAINER'
      ||meta['documentProofSha256']!==frame.documentProofSha256
      ||!same(meta['originalArchiveEvidence'],document.originalArchiveEvidence)
      ||!same(meta['groupingEvidence'],document.groupingEvidence)||!Array.isArray(meta['bindings']))
      fail('CURRENT_SOURCE_ACTUAL_READONLY_DOCUMENT_CHANGED');
    const actualMembers=meta['bindings'] as unknown[],canonicalEvents:(string|null)[]=[],canonicalSeen=new Set<string|null>();let members=0,lastHeartbeat=Date.now();
    for await(const binding of frame.bindings){
      if(!same(actualMembers[members],{sourceEndpointId:binding.sourceEndpointId,lineId:binding.lineId,
        originalHistoricalSkuId:binding.originalHistoricalSkuId,specNamespace:binding.specNamespace,quantityMapping:binding.quantityMapping}))
        fail('CURRENT_SOURCE_ACTUAL_READONLY_DOCUMENT_CHANGED');
      members++;if(!canonicalSeen.has(binding.sourceCanonicalEventId)){canonicalSeen.add(binding.sourceCanonicalEventId);canonicalEvents.push(binding.sourceCanonicalEventId);}
      if(Date.now()-lastHeartbeat>=2000){await session.query('SELECT 1 AS current_source_stream_keepalive');lastHeartbeat=Date.now();}
    }
    if(actualMembers.length!==members||!same(meta['sourceCanonicalEventIds'],canonicalEvents))fail('CURRENT_SOURCE_ACTUAL_READONLY_DOCUMENT_CHANGED');
    const conflict=(await session.query<{conflict:boolean}>(`SELECT EXISTS(SELECT 1 FROM ${r}.inventory_formal_baseline_document WHERE document_id=$1::uuid) conflict`,[d.id])).rows[0]?.conflict;
    if(conflict!==false)fail('FORMAL_HISTORICAL_CONSUMPTION_ALREADY_BOUND');
    const storageKey='CURRENT_SOURCE_READONLY:'+historyDigest([p.manifestSha256,document.sourceGroupKey]);
    await session.query(`INSERT INTO ${r}.inventory_formal_baseline_document(run_id,document_id,source_canonical_id,imported_revision,imported_body_sha256,stock_terms_sha256,leg_count,proof)
      VALUES($1,$2::uuid,$3,$4,$5,$6,0,$7::jsonb)`,[runId,d.id,storageKey,document.archiveRevision,document.bodySha256,
      historyDigest({kind:'READONLY_CURRENT_SOURCE_ARCHIVE',bodySha256:document.bodySha256}),JSON.stringify({kind:'APPROVED_CURRENT_SOURCE_READONLY_ARCHIVE',
        readonly:true,auditAllowed:false,storageKeyNamespace:'CURRENT_SOURCE_READONLY_NOT_ORIGINAL_CANONICAL_ID',sourceGroupKey:document.sourceGroupKey,
        approvalManifestSha256:p.manifestSha256,contractSha256:currentSourceContractSha256,documentProofSha256:frame.documentProofSha256,
        sourceCanonicalEventIds:meta['sourceCanonicalEventIds'],historicalStateTimelineConfirmed:false,historicalStateAtExactCutoffConfirmed:false,
        quantityInclusion:'UNCHANGED_APPROVED_ENDPOINT_BASELINE_ONLY',noReversalLegs:true})]);writes++;
  }
  if(documentCount!==p.counts.documents)fail('CURRENT_SOURCE_APPROVED_ROW_COVERAGE_MISMATCH');
  const unbound=(await session.query<{n:string}>(`SELECT count(*)::text n FROM ${r}.document d
    WHERE (baseline_was_included OR current_effect_active) AND NOT EXISTS(SELECT 1 FROM ${r}.inventory_formal_baseline_document b
      WHERE b.run_id=$1 AND b.document_id=d.id)`,[runId])).rows[0]?.n;
  if(unbound!=='0')fail('FORMAL_ACTIVE_HISTORICAL_DOCUMENT_NOT_CONSUMPTION_BOUND');
  return writes;
}
async function consumeCurrentSourceReplay(session:DataSession,p:ApprovedCurrentSourceStream):Promise<void> {
  let lastHeartbeat=Date.now();
  const keepAlive=async():Promise<void>=>{await session.query('SELECT 1 AS current_source_stream_keepalive');lastHeartbeat=Date.now();};
  for await(const observation of iterateApprovedCurrentSourceObservations(p)){
    void observation;if(Date.now()-lastHeartbeat>=2000)await keepAlive();
  }
  for await(const frame of iterateApprovedCurrentSourceDocuments(p))for await(const binding of frame.bindings){
    void binding;if(Date.now()-lastHeartbeat>=2000)await keepAlive();
  }
  await assertApprovedCurrentSourceStreamUnchanged(p,keepAlive);
}
export async function importApprovedFormalBaseline(access:DataAccess,c:DatabaseConfig,admission:ProductionAdmission,root:string,input:FormalBaselineInput):Promise<{applied:boolean;writes:number;runId:string;manifestSha256:string;sourceSha256:string;cellCount:number}> {
  if(input.schemaVersion!=='T33-APPROVED-FORMAL-BASELINE-INPUT-v1'||input.dataClass!=='USER_APPROVED_FORMAL_BASELINE'||input.productionAuthorized!==true)fail('EXPLICIT_NEW_FORMAL_INPUT_REQUIRED');
  assertProductionAdmission(c,admission,'baseline-import',input.source.sha256);target(c,input.calculation.target);
  const manifest=await sourceInput(root,input.source);
  assertProductionAdmission(c,admission,'historical-import',bodyApproval(manifest).sha256);
  for(const name of ['endpoints','openings','fixedOpeningSnapshot','userConfirmation','ownerAdmission'] as const)
    if(historyDigest(manifest.artifacts[name])!==historyDigest(input.calculation.artifacts[name]))fail('FORMAL_SOURCE_NOT_BOUND_TO_FROZEN_MANIFEST');
  if(historyDigest(manifest.counts)!==historyDigest(input.calculation.counts))fail('FORMAL_SOURCE_COUNTS_CHANGED');
  const calculated=await prepareCurrentExport(root,input.calculation);
  let currentSource:ApprovedCurrentSourceStream|undefined;
  try {
    if(manifest.schemaVersion==='T33-APPROVED-BASELINE-SOURCES-v2'){
      if(!input.currentSourceMaterialization)fail('CURRENT_SOURCE_LATE_MATERIALIZATION_REQUIRED');
      currentSource=await prepareApprovedCurrentSourceStream(c,admission,root,manifest.artifacts.currentSourceBodiesApproval,input.currentSourceMaterialization);
      const m=currentSource.manifest,remainingMappings=new Map(calculated.cells.map(x=>[x.key,x.mapping]));let mappings=0;
      if(historyDigest(m.sourceEndpoints)!==historyDigest(manifest.artifacts.endpoints)||historyDigest(m.quantityIdentityPlan)!==historyDigest(manifest.artifacts.quantityIdentities)
        ||currentSource.counts.sourceEndpoints!==manifest.counts.sourceEndpoints||currentSource.counts.quantityKeys!==manifest.counts.quantityKeys)
        fail('CURRENT_SOURCE_PLAN_NOT_BOUND_TO_APPROVED_BASELINE');
      for await(const mapping of iterateApprovedCurrentSourceMappings(currentSource)){
        const key=JSON.stringify(mapping.sourceQuantityKey),expected=remainingMappings.get(key);
        if(!expected||historyDigest(mapping)!==historyDigest(expected))fail('CURRENT_SOURCE_PLAN_NOT_BOUND_TO_APPROVED_BASELINE');
        remainingMappings.delete(key);mappings++;
      }
      if(remainingMappings.size!==0||mappings!==calculated.cells.length)fail('CURRENT_SOURCE_PLAN_NOT_BOUND_TO_APPROVED_BASELINE');
    }
    const body={...calculated.body,dataClass:'USER_APPROVED_FORMAL_BASELINE',
      formalInputSha256:historyDigest(input),sourceSha256:input.source.sha256,baselineVersion:manifest.baselineVersion,componentSha256:formalBaselineComponentSha256(),
      stockAnchor:'IMMUTABLE_APPROVED_BASELINE_PLUS_ONLY_EXPLICIT_POST_ACTIVATION_POSTINGS',historicalLedgerAddedAgain:false,
      ...(currentSource?{currentSource:{contractSha256:currentSourceContractSha256,bodyApprovalManifestSha256:currentSource.manifestSha256,
        endpointCoverage:currentSource.counts.sourceEndpoints,readonlyDocuments:currentSource.counts.documents,allInheritedSourceReadonly:true,auditAllowed:false,
        sourceCanonicalIdsUnchanged:true,exactHistoricalCutoffClaimed:false,exactHistoricalTimelineClaimed:false}}:{})};
    const digest=historyDigest({input,body}),plan={...calculated,body,manifestSha256:digest},r=ident(c.schemas.runtime);
    return await access.transaction(async session=>{
      await session.lock(locks);await assertProductionSession(session,c,admission,'baseline-import',input.source.sha256);await componentReady(session,r,true);
      const result=(applied:boolean,writes:number)=>({applied,writes,runId:input.calculation.runId,manifestSha256:digest,sourceSha256:input.source.sha256,cellCount:plan.cells.length});
      const prior=await activeFormalBaselineRun(session,r);
      if(prior){if(prior.activated)fail('ACTIVATED_FORMAL_BASELINE_CANNOT_BE_REIMPORTED');
        if(prior.id!==plan.input.runId||prior.manifest_sha256!==digest||prior.source_sha256!==input.source.sha256||historyDigest(prior.target)!==historyDigest(input.calculation.target))fail('FORMAL_BASELINE_ALREADY_BOUND');
        await verifyCurrentExportStoredPayloads(session,r,prior,'FORMAL');await verifyStoredRun(session,r,plan,'FORMAL');
        if(currentSource)await consumeCurrentSourceReplay(session,currentSource);return result(false,0);}
      await noOtherBasis(session,c);await assertMappingTargets(session,r,plan);await businessMasters(session,c,plan);
      await session.query(`INSERT INTO ${r}.inventory_formal_baseline_run(id,manifest_sha256,source_sha256,body,target) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)`,
        [plan.input.runId,digest,input.source.sha256,JSON.stringify(body),JSON.stringify(input.calculation.target)]);
      let writes=1;for(const kind of ['ENDPOINTS','OPENINGS','MAPPINGS'] as const)writes+=await persistPayload(session,r,plan,kind,'FORMAL');
      writes+=await persistCells(session,r,plan,'FORMAL');
      if(manifest.schemaVersion==='T33-APPROVED-BASELINE-SOURCES-v1')writes+=await bindHistoricalDocuments(session,c,admission,root,manifest,plan);
      else writes+=await bindApprovedCurrentSource(session,c,currentSource!,plan.input.runId);
      await verifyStoredRun(session,r,plan,'FORMAL');
      if(currentSource)await assertApprovedCurrentSourceStreamUnchanged(currentSource,async()=>{await session.query('SELECT 1 AS current_source_stream_keepalive');});
      await assertProductionSession(session,c,admission,'baseline-import',input.source.sha256);return result(true,writes);
    });
  }finally{if(currentSource)disposeApprovedCurrentSourceStream(currentSource);}
}
export interface FormalBaselineActivation {
  readonly runId:string;readonly manifestSha256:string;readonly sourceSha256:string;readonly authorityFiles:ProductionAdmissionFiles;
}
export async function activateApprovedFormalBaseline(access:DataAccess,c:DatabaseConfig,admission:ProductionAdmission,input:FormalBaselineActivation):Promise<{applied:boolean;runId:string;manifestSha256:string}> {
  assertProductionAdmission(c,admission,'baseline-activation',input.sourceSha256);
  const witnessed=readProductionAdmission(c,input.authorityFiles);assertProductionAdmission(c,witnessed,'baseline-activation',input.sourceSha256);
  const authorizationSha256=sha(readFileSync(input.authorityFiles.admissionFile)),r=ident(c.schemas.runtime);
  return access.transaction(async session=>{
    await session.lock(locks);await assertProductionSession(session,c,admission,'baseline-activation',input.sourceSha256);
    await assertProductionSession(session,c,witnessed,'baseline-activation',input.sourceSha256);
    const run=await activeFormalBaselineRun(session,r);
    if(!run||run.id!==input.runId||run.manifest_sha256!==input.manifestSha256||run.source_sha256!==input.sourceSha256
      ||historyDigest(run.target)!==historyDigest(historyImportTarget(c)))fail('FORMAL_ACTIVATION_BASELINE_BINDING_MISMATCH');
    const result=(applied:boolean)=>({applied,runId:run.id,manifestSha256:run.manifest_sha256});
    if(run.activated)return result(false);
    await noOtherBasis(session,c);await verifyCurrentExportStoredPayloads(session,r,run,'FORMAL');
    await session.query(`INSERT INTO ${r}.inventory_formal_baseline_activation(run_id,manifest_sha256,source_sha256,authorization_sha256,target,evidence)
      VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,[run.id,run.manifest_sha256,run.source_sha256,authorizationSha256,JSON.stringify(run.target),
      JSON.stringify({kind:'T09_VERIFIED_SIGNED_BUSINESS_ACTIVE',stockAnchor:run.id,priorBusinessPostings:0,historicalLedgerAddedAgain:false,
        userApprovalQuantityMethod:currentExportMethod,sourceQuantityPolicy:currentExportPolicy})]);
    return result(true);
  });
}
/** No timestamps or imported ledgers are used to select new effects: the explicit activation FK is the anchor. */
export async function recordFormalBaselinePosting(session:DataSession,runtime:string,postingId:string,effects:readonly HistoryEffect[]):Promise<boolean> {
  const run=await activeFormalBaselineRun(session,runtime);if(!run)return false;if(!run.activated)fail('APPROVED_FORMAL_BASELINE_MAINTENANCE_ONLY');
  const source=ident(run.target.schemas.source);
  const posting=(await session.query<{document_id:string;revision:number;reason:string}>(`SELECT document_id,revision,reason FROM ${runtime}.posting WHERE id=$1::uuid`,[postingId])).rows[0];
  if(!posting)fail('FORMAL_REAL_AUTHORIZED_POSTING_REQUIRED');
  const rows:{warehouse:string;sku:string;unit:string;quantity:string}[]=[];
  for(const effect of effects){
    let unit=effect.unit;
    if(!unit){const units=(await session.query<{unit:string}>(`SELECT DISTINCT unit FROM ${runtime}.inventory_formal_baseline_cell WHERE sku_id=$1::uuid
      UNION SELECT DISTINCT unit FROM ${runtime}.inventory_formal_baseline_movement WHERE sku_id=$1::uuid`,[effect.sku])).rows;
      if(units.length>1)fail('EXPLICIT_FORMAL_POSTING_UNIT_REQUIRED');unit=units[0]?.unit;}
    const businessUnit=(await session.query<{unit:string|null}>(`SELECT coalesce(pp.body->>'unit',po.body->>'unit',u.name) unit
      FROM(SELECT id,product_id FROM ${source}.variant UNION SELECT id,product_id FROM ${runtime}.variant_overlay) v
      LEFT JOIN ${source}.product p ON p.id=v.product_id LEFT JOIN ${source}.unit u ON u.id=p.unit_id
      LEFT JOIN ${runtime}.product_overlay po ON po.id=v.product_id LEFT JOIN ${runtime}.product_profile_overlay pp ON pp.product_id=v.product_id WHERE v.id=$1::uuid`,[effect.sku])).rows[0]?.unit;
    unit??=businessUnit??undefined;
    if(!unit||unit.trim()!==unit||unit.length>64||unit.includes('\0'))fail('FORMAL_REAL_UNIT_REQUIRED');
    const proven=(await session.query<{known:boolean}>(`SELECT EXISTS(SELECT 1 FROM ${source}.unit WHERE name=$1)
      OR EXISTS(SELECT 1 FROM ${runtime}.inventory_formal_baseline_cell WHERE sku_id=$2::uuid AND unit=$1) known`,[unit,effect.sku])).rows[0]?.known;
    if(!businessUnit||!proven)fail('FORMAL_RUNTIME_SKU_OR_UNIT_NOT_PROVEN');
    rows.push({warehouse:effect.warehouse,sku:effect.sku,unit,quantity:formatScaled(effect.quantity,4)});
  }
  const stored=(await session.query<{warehouse:string;sku:string;unit:string;quantity:string}>(`SELECT warehouse_id warehouse,sku_id sku,unit,quantity::text FROM ${runtime}.inventory_formal_baseline_movement
    WHERE run_id=$1 AND posting_id=$2::uuid ORDER BY leg_index`,[run.id,postingId])).rows;
  if(stored.length){if(historyDigest(stored)!==historyDigest(rows))fail('FORMAL_POSTING_REPLAY_CHANGED');return true;}
  for(let i=0;i<rows.length;i++){const row=rows[i]!;
    await session.query(`INSERT INTO ${runtime}.inventory_formal_baseline_movement(run_id,posting_id,leg_index,warehouse_id,sku_id,unit,quantity,proof)
      VALUES($1,$2::uuid,$3,$4::uuid,$5::uuid,$6,$7::numeric,$8::jsonb)`,[run.id,postingId,i,row.warehouse,row.sku,row.unit,row.quantity,
      JSON.stringify({kind:'T17_REAL_POST_ACTIVATION_EFFECT',baselineManifestSha256:run.manifest_sha256,stockAnchor:run.id,postingId,...posting})]);}
  return true;
}
export async function formalBaselinePostingEffects(session:DataSession,runtime:string,postingId:string):Promise<HistoryEffect[]|null> {
  const run=await activeFormalBaselineRun(session,runtime);if(!run)return null;
  const rows=(await session.query<{warehouse:string;sku:string;unit:string;quantity:string}>(`SELECT warehouse_id warehouse,sku_id sku,unit,quantity::text
    FROM ${runtime}.inventory_formal_baseline_movement WHERE run_id=$1 AND posting_id=$2::uuid ORDER BY leg_index`,[run.id,postingId])).rows;
  if(!rows.length)fail('FORMAL_POSTING_EFFECTS_REQUIRED');
  return rows.map((x,index)=>({...x,index,quantity:-parseScaled(x.quantity,4,false)}));
}
/** Unchanged historical stock terms reuse only their exact selected and resolved baseline legs. */
export async function formalHistoricalDocumentEffects(session:DataSession,runtime:string,documentId:string,type:string,body:Record<string,unknown>,invert=false):Promise<HistoryEffect[]|null> {
  const run=await activeFormalBaselineRun(session,runtime);if(!run)return null;
  await assertFormalCurrentSourceDocumentWritable(session,runtime,documentId);
  const row=(await session.query<{stock_terms_sha256:string;leg_count:number}>(
    `SELECT stock_terms_sha256,leg_count FROM ${runtime}.inventory_formal_baseline_document WHERE run_id=$1 AND document_id=$2::uuid`,[run.id,documentId])).rows[0];
  if(!row){if(invert)fail('FORMAL_HISTORICAL_REVERSAL_NOT_BOUND');return null;}
  if(row.stock_terms_sha256!==formalDocumentStockTerms(type,body)){if(invert)fail('FORMAL_COUNTED_STOCK_TERMS_CHANGED');return null;}
  const legs=(await session.query<{warehouse:string;sku:string;unit:string;quantity:string}>(`SELECT warehouse_id warehouse,sku_id sku,unit,
    ${invert?'counted_quantity':'approval_quantity'}::text quantity FROM ${runtime}.inventory_formal_baseline_document_leg
    WHERE run_id=$1 AND document_id=$2::uuid ORDER BY ordinal`,[run.id,documentId])).rows;
  if(legs.length!==row.leg_count)fail('FORMAL_HISTORICAL_LEGS_INCOMPLETE');
  return legs.map((x,index)=>({...x,index,quantity:parseScaled(x.quantity,4,false)*(invert?-1n:1n)}));
}
export async function formalHistoricalRevisionReversal(session:DataSession,runtime:string,documentId:string,type:string,revision:number):Promise<HistoryEffect[]|null> {
  if(!await activeFormalBaselineRun(session,runtime))return null;
  const body=(await session.query<{body:Record<string,unknown>}>(`SELECT body FROM ${runtime}.revision WHERE document_id=$1::uuid AND revision=$2`,[documentId,revision])).rows[0]?.body;
  if(!body)fail('FORMAL_COUNTED_REVISION_REQUIRED');
  return formalHistoricalDocumentEffects(session,runtime,documentId,type,body,true);
}
export async function readFormalBaselineBalance(session:DataSession,runtime:string,warehouse:string,sku:string,unit?:string):Promise<string|null> {
  if(!await activeFormalBaselineRun(session,runtime))return null;
  const rows=(await session.query<{quantity:string;unit:string}>(`SELECT quantity::text,unit FROM ${runtime}.inventory_formal_baseline_projection
    WHERE warehouse_id=$1::uuid AND sku_id=$2::uuid AND ($3::text IS NULL OR unit=$3)`,[warehouse,sku,unit??null])).rows;
  if(rows.length>1)fail('EXPLICIT_FORMAL_BALANCE_UNIT_REQUIRED');return rows[0]?.quantity??'0.0000';
}
export async function readFormalBaselineProjection(session:DataSession,runtime:string,warehouses:readonly string[],skus:readonly string[]):Promise<{warehouseId:string;skuId:string;unit:string;quantity:string}[]|null> {
  if(!await activeFormalBaselineRun(session,runtime))return null;
  return (await session.query<{warehouseId:string;skuId:string;unit:string;quantity:string}>(`SELECT warehouse_id "warehouseId",sku_id "skuId",unit,quantity::text
    FROM ${runtime}.inventory_formal_baseline_projection WHERE (cardinality($1::uuid[])=0 OR warehouse_id=ANY($1::uuid[]))
      AND (cardinality($2::uuid[])=0 OR sku_id=ANY($2::uuid[])) ORDER BY warehouse_id,sku_id,unit`,[warehouses,skus])).rows;
}
