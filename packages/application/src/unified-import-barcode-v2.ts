import {isProxy,isSharedArrayBuffer,isUint8Array} from 'node:util/types';
import {buildUnifiedImportPlan,compileStandardImportProgram} from './unified-import-execution.ts';
import type {BuildUnifiedImportPlanInput,StandardImportCurrentAdmin} from './unified-import-execution.ts';
import {decodeUtf8,parseStrictJson,sha256} from './unified-import-contract.ts';
import type {SourceRef,StandardRecord} from './unified-import-contract.ts';
import {parseHistoricalBarcodeAttestation} from './historical-barcode-attestation.ts';
import type {HistoricalBarcodeAttestation} from './historical-barcode-attestation.ts';
import {generateSkuBarcode} from './barcode-generation.ts';
import {requestHash} from './request-hash.ts';
import {stableImportId} from './inventory-cutoff-import.ts';

/** Additive sidecar document. The receiving SQL/API is NOT implemented by this
 * compiler. Never pass these records to the unchanged STANDARD_IMPORT_SQL_V1. */
export const BARCODE_PACKAGE_V2='STANDARD_PACKAGE_WITH_HISTORICAL_BARCODE_ATTESTATIONS_V2' as const;
export interface BarcodePackageV2Input {base:BuildUnifiedImportPlanInput;sidecarBytes:Uint8Array;expectedSidecarSha256:string;}
type RawAttestation=Omit<HistoricalBarcodeAttestation,'verification'>;
function fail(code:string):never{throw new Error(`BARCODE_PACKAGE_V2_${code}`);}
/** One owned snapshot before validation. Reject getters/proxies rather than
 * observing a different package or byte buffer between validation and hashing. */
function snapshot<T>(input:T):T{
 const active=new WeakSet<object>();let nodes=0,bytes=0;
 const typedPrototype=Object.getPrototypeOf(Uint8Array.prototype) as object;
 const bufferGetter=Object.getOwnPropertyDescriptor(typedPrototype,'buffer')!.get!;
 const lengthGetter=Object.getOwnPropertyDescriptor(typedPrototype,'length')!.get!;
 function copy(v:unknown,depth:number):unknown{
  if(++nodes>2_000_000||depth>64)fail('INPUT_BOUND');
  if(v===null||typeof v==='string'||typeof v==='boolean'||v===undefined)return v;
  if(typeof v==='number'){if(!Number.isSafeInteger(v))fail('INPUT_NUMBER');return v;}
  if(typeof v!=='object'||isProxy(v))fail('INPUT_DESCRIPTOR');
  if(isUint8Array(v)){
   const proto=Object.getPrototypeOf(v);if(proto!==Uint8Array.prototype&&proto!==Buffer.prototype)fail('INPUT_BYTES');
   const buffer=bufferGetter.call(v);if(isSharedArrayBuffer(buffer))fail('SHARED_BYTES');
   const length=lengthGetter.call(v) as number;bytes+=length;if(bytes>256*1024*1024)fail('INPUT_BOUND');
   const out=new Uint8Array(length);Uint8Array.prototype.set.call(out,v);return out;
  }
  if(active.has(v))fail('INPUT_CYCLE');active.add(v);
  const array=Array.isArray(v),proto=Object.getPrototypeOf(v);if(proto!==(array?Array.prototype:Object.prototype))fail('INPUT_DESCRIPTOR');
  const descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(v);
  if(array){const length=descriptors.length?.value as unknown;if(!Number.isSafeInteger(length)||Number(length)<0||keys.length!==Number(length)+1)fail('INPUT_DESCRIPTOR');const out:unknown[]=[];
   for(let i=0;i<Number(length);i++){const d=descriptors[String(i)];if(!d||!d.enumerable||!Object.hasOwn(d,'value'))fail('INPUT_DESCRIPTOR');out.push(copy(d.value,depth+1));}active.delete(v);return out;}
  const out:Record<string,unknown>={};for(const key of keys){if(typeof key!=='string')fail('INPUT_DESCRIPTOR');const d=descriptors[key]!;if(!d.enumerable||!Object.hasOwn(d,'value'))fail('INPUT_DESCRIPTOR');Object.defineProperty(out,key,{value:copy(d.value,depth+1),enumerable:true,writable:true,configurable:true});}active.delete(v);return out;
 }
 return copy(input,0) as T;
}
function exact(v:unknown,keys:readonly string[]):Record<string,unknown>{if(v===null||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).sort().join(',')!==[...keys].sort().join(','))return fail('SHAPE');return v as Record<string,unknown>;}
function freeze<T>(v:T):T{if(v!==null&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function matches(ref:SourceRef,record:StandardRecord):boolean{return record.source_refs.some(r=>r.file_sha256===ref.file_sha256&&r.sheet===ref.sheet&&r.row===ref.row);}
/** Validates cleaned declarations and artifact pins, NOT original spreadsheet
 * bytes or independent source truth. Coordinate IDs, not global codes or SKU IDs,
 * preserve size-group/source distinctions (including historic/new code 910). */
export function parseUnifiedImportBarcodeV2(input:BarcodePackageV2Input){return parseSnapshot(snapshot(input));}
function parseSnapshot(input:BarcodePackageV2Input){
 if(!(input.sidecarBytes instanceof Uint8Array)||input.sidecarBytes.byteLength>16*1024*1024||!/^([a-f0-9]{64})$/.test(input.expectedSidecarSha256)||sha256(input.sidecarBytes)!==input.expectedSidecarSha256)fail('SIDECAR_HASH_OR_BOUND');
 const raw=exact(parseStrictJson(decodeUtf8(input.sidecarBytes)),['format_version','base_manifest_sha256','source_namespace','source_files','product_records']);
 const basePlan=buildUnifiedImportPlan(input.base),pkg=input.base.pkg;
 if(raw.format_version!==BARCODE_PACKAGE_V2||raw.base_manifest_sha256!==input.base.expectedManifestSha256||raw.source_namespace!==basePlan.source_namespace||requestHash(raw.source_files)!==requestHash(pkg.manifest.source_files))fail('BASE_BINDING');
 if(!Array.isArray(raw.product_records)||raw.product_records.length===0||raw.product_records.length>20000)fail('PRODUCT_RECORDS');
 const pins=new Set(pkg.manifest.source_files.map(p=>p.sha256)),seen=new Set<string>(),barcodeCoordinates=new Map<string,string>();
 const records=raw.product_records.map(value=>{
  const row=exact(value,['entity_type','source_key','historical_barcode_attestation']);
  if(row.entity_type!=='PRODUCT'||typeof row.source_key!=='string'||seen.has(row.source_key))fail('PRODUCT_IDENTITY');seen.add(row.source_key);
  const occurrences=basePlan.master_rows.filter(r=>r.table==='product'&&r.record.source_key===row.source_key);
  if(occurrences.length!==1)fail('PRODUCT_IDENTITY');const occurrence=occurrences[0]!,product=occurrence.record;
  const parsed=parseHistoricalBarcodeAttestation(row.historical_barcode_attestation,String(product.fields.id),pins);
  if(parsed.product_source_key!==product.source_key)fail('PRODUCT_SOURCE_KEY');
  const segment=parsed.entries[0]!.product_segment;
  const coordinate_intents=parsed.entries.map(entry=>{
   if(entry.scheme_id!==product.fields.default_barcode_scheme_id||entry.product_segment!==segment)fail('PRODUCT_SCHEME_OR_SEGMENT_CONFLICT');
   if(!matches(entry.sources.product,product))fail('PRODUCT_SOURCE_REF');
   for(const dimension of ['color','fit','size'] as const){const id=entry[`${dimension}_id`],targets=pkg.records[dimension]!.filter(r=>r.fields.id===id);if(targets.length!==1||!matches(entry.sources[dimension],targets[0]!))fail('COORDINATE_SOURCE_REF');}
   // Future SKU coordinates must preserve the same product size-group context
   // enforced for existing V1 SKU rows. A matching source pin or display code
   // alone does not authorize a size from a different group.
   if(!pkg.records.size_group_member!.some(r=>r.fields.size_group_id===product.fields.size_group_id&&r.fields.size_id===entry.size_id))fail('COORDINATE_SIZE_GROUP');
   const barcode=generateSkuBarcode({schemeId:entry.scheme_id,productSegment:entry.product_segment,fitCode:null,colorCode:entry.color_code,sizeCode:entry.size_code});
   for(const existing of pkg.records.sku_barcode!.filter(r=>r.fields.barcode===barcode)){
    const sku=pkg.records.sku!.filter(r=>r.fields.id===existing.fields.sku_id);
    if(sku.length!==1||existing.fields.scheme_id!==entry.scheme_id||sku[0]!.fields.product_id!==parsed.product_id||sku[0]!.fields.color_id!==entry.color_id||sku[0]!.fields.fit_id!==entry.fit_id||sku[0]!.fields.size_id!==entry.size_id)fail('EXISTING_BARCODE_CONFLICT');
    // Package-known state only. A later live preflight must independently check
    // retained DB bindings; never infer enabled or restore a disabled barcode.
    if(existing.fields.enabled!==true)fail('EXISTING_BARCODE_DISABLED');
   }
   const coordinate=requestHash([parsed.product_id,entry.color_id,entry.fit_id,entry.size_id]),previous=barcodeCoordinates.get(barcode);
   if(previous!==undefined&&previous!==coordinate)fail('BARCODE_COORDINATE_CONFLICT');barcodeCoordinates.set(barcode,coordinate);
   return{product_id:parsed.product_id,scheme_id:entry.scheme_id,color_id:entry.color_id,fit_id:entry.fit_id,size_id:entry.size_id,barcode};
  });
  // Keep the exact unmarked declaration as audit sidecar, not a physical field.
  const historical_barcode_attestation=structuredClone(row.historical_barcode_attestation) as RawAttestation;
  if(occurrence.identity===null)fail('PRODUCT_REGISTRY_REQUIRED');
  const original_record={target_id:occurrence.identity.target_id,identity_basis:occurrence.identity.identity_basis,record_id:occurrence.source_record_id,entity_type:'PRODUCT',source_key:product.source_key,file_ref:basePlan.table_files.product!,source_refs:structuredClone(product.source_refs),fields:structuredClone(product.fields)};
  const bound={entity_type:'PRODUCT' as const,source_record_id:occurrence.source_record_id,original_record,historical_barcode_attestation,coordinate_intents};
  const record_sha256=requestHash({format_version:BARCODE_PACKAGE_V2,source_namespace:basePlan.source_namespace,source_files:pkg.manifest.source_files,...bound});
  return{...bound,record_sha256};
 });
 return freeze({format_version:BARCODE_PACKAGE_V2,verification:'LOCAL_DECLARATION_ONLY' as const,base_plan:basePlan,sidecar_sha256:input.expectedSidecarSha256,source_files:structuredClone(pkg.manifest.source_files),product_records:records});
}
/** Distinct offline result. Original V1 program/keys stay byte-equivalent. A
 * future reviewed V2 recipient must consume each bound sidecar atomically with
 * its original PRODUCT record and resolve the actual SKU in that transaction. */
export function compileUnifiedImportBarcodeV2(input:BarcodePackageV2Input,admin:StandardImportCurrentAdmin){
 const owned=snapshot({input,admin});input=owned.input;admin=owned.admin;
 const parsed=parseSnapshot(input),base_program=compileStandardImportProgram(parsed.base_plan,admin);
 const v2_requests=base_program.steps.filter(step=>step.method==='masterChunk').flatMap(step=>{
  const rows=step.request.payload.rows as Record<string,unknown>[];
  const product_records=parsed.product_records.filter(record=>rows.some(row=>row.record_id===record.source_record_id));
  if(product_records.length===0)return[];
  for(const record of product_records){const matches=rows.filter(row=>row.record_id===record.source_record_id);if(matches.length!==1||requestHash(matches[0])!==requestHash(record.original_record))fail('ORIGINAL_WIRE_RECORD_MISMATCH');}
  const operation_id=stableImportId('standard-historical-barcode-master-v2',step.request.operation_id);
  const request={protocol:'STANDARD_IMPORT_SQL_V2' as const,operation_id,request_key:`standard-barcode-v2:${operation_id}`,command_phase:'MASTER' as const,
   receipt_hash_contract:'SHA256_UTF8_PHASE_COLON_JSONB_TEXT' as const,original_request:step.request,product_records,source_files:parsed.source_files,
   base_manifest_sha256:input.base.expectedManifestSha256,sidecar_sha256:parsed.sidecar_sha256,verification:'LOCAL_DECLARATION_ONLY' as const};
  // This JS typed digest is NOT the PostgreSQL jsonb::text receipt digest.
  // The future V2 SQL entry must hash phase + ':' + this ENTIRE request::text.
  return[{method:'masterChunk' as const,request,request_sha256:requestHash(request)}];
 });
 if(v2_requests.reduce((n,v)=>n+v.request.product_records.length,0)!==parsed.product_records.length)fail('SIDECAR_COVERAGE');
 const payload={format_version:'STANDARD_IMPORT_WITH_HISTORICAL_BARCODE_ATTESTATIONS_V2' as const,execution_scope:'OFFLINE_COMPILER_ONLY' as const,verification:parsed.verification,base_plan_sha256:parsed.base_plan.plan_sha256,base_manifest_sha256:input.base.expectedManifestSha256,sidecar_sha256:parsed.sidecar_sha256,source_files:parsed.source_files,base_program,product_records:parsed.product_records,v2_requests};
 return freeze({...payload,program_sha256:requestHash(payload)});
}

/** Owned exact-byte transport for a future separately reviewed V2 preflight.
 * PostgreSQL bytea hex strings are immutable; no input/output typed-array storage
 * is shared. A real driver/server round trip is still required before wiring it.
 * Never log these values: they contain the complete source-sidecar/manifest data. */
export function compileUnifiedImportBarcodeV2Transport(input:BarcodePackageV2Input,admin:StandardImportCurrentAdmin){
 const owned=snapshot({input,admin});
 const program=compileUnifiedImportBarcodeV2(owned.input,owned.admin);
 function bytea(bytes:Uint8Array,expectedHash:string){
  const digest=sha256(bytes);if(digest!==expectedHash)fail('TRANSPORT_BYTE_HASH_DRIFT');
  const hex=`\\x${Buffer.from(bytes).toString('hex')}`;
  return{encoding:'POSTGRES_BYTEA_HEX' as const,hex,byte_length:bytes.byteLength,sha256:digest};
 }
 const manifest_bytes=bytea(owned.input.base.manifestBytes,program.base_manifest_sha256);
 const sidecar_bytes=bytea(owned.input.sidecarBytes,program.sidecar_sha256);
 for(const item of program.v2_requests)if(item.request.base_manifest_sha256!==manifest_bytes.sha256||item.request.sidecar_sha256!==sidecar_bytes.sha256)fail('TRANSPORT_REQUEST_PIN_MISMATCH');
 return freeze({format_version:'STANDARD_IMPORT_BARCODE_EXACT_BYTES_TRANSPORT_V1' as const,execution_scope:'OFFLINE_UNWIRED_TRANSPORT' as const,program,manifest_bytes,sidecar_bytes});
}

type BarcodeWholePhase='INITIALIZE'|'MASTER'|'KEYS'|'BASELINE_PUBLISH'|'DOCUMENT_STAGE'|'DOCUMENT'|'FINAL_PUBLISH';
/** Optional root commitment only. It does not execute chunks, replace old defaults,
 * or claim that existing atomic SQL understands this new envelope. */
export function compileUnifiedImportBarcodeWholePackage(input:BarcodePackageV2Input,admin:StandardImportCurrentAdmin,packageKey:string){
 const owned=snapshot({input,admin,packageKey});input=owned.input;admin=owned.admin;packageKey=owned.packageKey;
 if(typeof packageKey!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(packageKey))fail('WHOLE_PACKAGE_KEY');
 if(input.base.target===undefined)fail('WHOLE_TARGET_REQUIRED');
 const transport=compileUnifiedImportBarcodeV2Transport(input,admin),source_program=transport.program,target=structuredClone(input.base.target);
 const namespace=source_program.base_program.initialize.namespace;
 const root_operation=stableImportId('standard-barcode-whole-package-v1',target.system_identifier,target.database_oid,target.database_name,namespace,packageKey);
 const originals=[{method:'initialize' as const,request:source_program.base_program.initialize},...source_program.base_program.steps];
 if(originals.length>1000)fail('WHOLE_CHILD_BOUND');
 const overlays=new Map(source_program.v2_requests.map(v=>[v.request.original_request.operation_id,v]));
 if(overlays.size!==source_program.v2_requests.length)fail('WHOLE_OVERLAY_DUPLICATE');
 const seenOriginal=new Set<string>(),seenEffective=new Set<string>();let overlayCount=0;
 const children=originals.map((step,ordinal)=>{
  let phase:BarcodeWholePhase;
  if(step.method==='initialize')phase='INITIALIZE';
  else if(step.method==='masterChunk')phase='MASTER';
  else if(step.method==='baselineKeys')phase='KEYS';
  else if(step.method==='documentChunk'){if(step.request.payload.mode==='STAGE')phase='DOCUMENT_STAGE';else if(step.request.payload.mode==='CHUNK')phase='DOCUMENT';else return fail('WHOLE_PHASE');}
  else if(step.method==='publish'){if(step.request.payload.phase==='BASELINE')phase='BASELINE_PUBLISH';else if(step.request.payload.phase==='DOCUMENTS')phase='FINAL_PUBLISH';else return fail('WHOLE_PHASE');}
  else return fail('WHOLE_PHASE');
  const overlay=overlays.get(step.request.operation_id);
  if(overlay&&(phase!=='MASTER'||requestHash(overlay.request.original_request)!==requestHash(step.request)))fail('WHOLE_OVERLAY_MISMATCH');
  if(overlay)overlayCount++;
  const request=overlay?overlay.request:step.request;
  if(seenOriginal.has(step.request.operation_id)||seenEffective.has(request.operation_id))fail('WHOLE_OPERATION_DUPLICATE');
  seenOriginal.add(step.request.operation_id);seenEffective.add(request.operation_id);
  const child_operation_id=stableImportId('standard-barcode-whole-package-child-v1',root_operation,String(ordinal),phase,step.request.operation_id);
  const leaf={ordinal,phase,method:step.method,child_operation_id,request_kind:overlay?'V2_MASTER_WITH_ATTESTATION' as const:'V1_CANONICAL_INTENT' as const,
   original_request:step.request,original_request_sha256:requestHash(step.request),request,request_sha256:requestHash(request)};
  return{...leaf,leaf_sha256:requestHash(leaf)};
 });
 const order:Record<BarcodeWholePhase,number>={INITIALIZE:0,MASTER:1,KEYS:2,BASELINE_PUBLISH:3,DOCUMENT_STAGE:4,DOCUMENT:5,FINAL_PUBLISH:6};
 if(overlayCount!==overlays.size||children[0]?.phase!=='INITIALIZE'||children.at(-1)?.phase!=='FINAL_PUBLISH'
  ||children.some((c,i)=>i>0&&order[c.phase]<order[children[i-1]!.phase])
  ||(['INITIALIZE','BASELINE_PUBLISH','DOCUMENT_STAGE','FINAL_PUBLISH'] as const).some(p=>children.filter(c=>c.phase===p).length!==1))fail('WHOLE_ORDER_OR_COVERAGE');
 const publication_targets=children.filter(c=>c.phase==='BASELINE_PUBLISH'||c.phase==='FINAL_PUBLISH').map(c=>({phase:c.phase,ordinal:c.ordinal,
  child_operation_id:c.child_operation_id,operation_id:c.original_request.operation_id,batch_id:c.original_request.batch_id,
  expected_sequence:c.original_request.payload.expected_sequence,approval_record_id:c.original_request.payload.approval_record_id}));
 const body={format_version:'STANDARD_IMPORT_BARCODE_WHOLE_PACKAGE_V1' as const,execution_protocol:'STANDARD_BARCODE_WHOLE_PACKAGE_SQL_V1' as const,
  execution_scope:'OFFLINE_ROOT_COMMITMENT_ONLY' as const,transaction_profile:'TWO_CAPABILITY_NEW_EMPTY_V1' as const,commit_policy:'ONE_PHYSICAL_CLIENT_ONE_TRANSACTION' as const,
  verification:'LOCAL_DECLARATION_ONLY' as const,package_key:packageKey,root_operation,request_key:`standard-barcode-whole-v1:${root_operation}`,target,namespace,
  base_manifest_sha256:transport.manifest_bytes.sha256,sidecar_sha256:transport.sidecar_bytes.sha256,source_program_sha256:source_program.program_sha256,
  source_program,child_count:children.length,children,publication_targets};
 const envelope=freeze({...body,root_sha256:requestHash(body)});
 // Enforce the same combined structural budget used by the host recompile check.
 snapshot({envelope,input,admin,packageKey});
 return freeze({format_version:'STANDARD_IMPORT_BARCODE_WHOLE_PACKAGE_TRANSPORT_V1' as const,execution_scope:'OFFLINE_UNWIRED_TRANSPORT' as const,envelope,manifest_bytes:transport.manifest_bytes,sidecar_bytes:transport.sidecar_bytes});
}
/** Host recompile check. This is NOT a substitute for the future SQL root,
 * receipt/effect/actor/xid/ordered-publication proof or final deferred closure. */
export function assertUnifiedImportBarcodeWholePackage(envelope:unknown,input:BarcodePackageV2Input,admin:StandardImportCurrentAdmin,packageKey:string):void{
 const owned=snapshot({envelope,input,admin,packageKey});
 const expected=compileUnifiedImportBarcodeWholePackage(owned.input,owned.admin,owned.packageKey).envelope;
 if(requestHash(owned.envelope)!==requestHash(expected))fail('WHOLE_RECOMPILE_MISMATCH');
}
