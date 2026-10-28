/** v23: source-owned expected rows, verified on the caller's RR client. No writes or lease ownership. */
import { historySettlementRequestHash } from '../../../packages/application/src/import-v3-history-settlement.ts';
import { requestHash } from '../../../packages/application/src/request-hash.ts';
import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { prepareNativePartyImportChunk, nativePartyStandaloneImportSource, NATIVE_PARTY_IMPORT_VERSION } from '../../../packages/application/src/native-party-import.ts';
import type { PreparedNativePartyImportRow } from '../../../packages/application/src/native-party-import.ts';
import { prepareNativeCatalogueImportChunk, prepareNativeCatalogueImportChunk26, nativeCatalogueSourceEvidence, NATIVE_CATALOGUE_IMPORT_VERSION_26 } from '../../../packages/application/src/native-catalogue-import.ts';
import type { PreparedNativeCatalogueImportRow, NativeCatalogueSelection } from '../../../packages/application/src/native-catalogue-import.ts';
import { validatePreparedNativeBarcode, nativeBarcodeSourceEvidence } from '../../../packages/application/src/native-barcode-import.ts';
import type { PreparedNativeBarcode } from '../../../packages/application/src/native-barcode-import.ts';
import { historyHeaderNativeReferenceEvidence } from './import-v3-history-header-native-reference-store.ts';
import { nativeCatalogueBindingEvidence } from './native-catalogue-import.ts';
import type { PgSalesClient } from './sales-unit-of-work.ts';

export const NATIVE_STAGE_CONTINUATION_VERSION26 = 'NATIVE_STAGE_CONTINUATION_26_V1' as const;
export interface NativeStageContinuationContext26 {
 readonly binding: Readonly<Record<string, unknown>>;
 readonly checkpoint: unknown;
 readonly bind: { readonly operationId: string; readonly requestKey: string; readonly requestHash: string };
}
export interface NativeStagePreparation26 {
 readonly inputDigest: string; readonly manifestSha256: string;
 readonly original148Refs: readonly { readonly path: string; readonly sha256: string }[];
 readonly original201Refs: readonly { readonly path: string; readonly sha256: string }[];
}
export type NativeStageGroups26 = readonly [
 { readonly name: 'PARTIES'; readonly members: readonly PreparedNativePartyImportRow[] },
 { readonly name: 'CATALOGUE'; readonly members: readonly PreparedNativeCatalogueImportRow[] },
 { readonly name: 'BARCODES'; readonly members: readonly PreparedNativeBarcode[] }
];
export interface NativeStagePrefixProof26 extends NativeStageContinuationContext26 {
 readonly version: 1; readonly preparation: NativeStagePreparation26;
 readonly groups: readonly { readonly name: 'PARTIES' | 'CATALOGUE' | 'BARCODES'; readonly rows: number; readonly sha256: string }[];
}
export interface NativeStageContinuationCapture26 {
 readonly preparation: NativeStagePreparation26; readonly groups: NativeStageGroups26;
 readonly onVerified: (progress: unknown) => Promise<void>;
}
export interface NativeStageContinuationAuthority26 {
 readonly version: typeof NATIVE_STAGE_CONTINUATION_VERSION26;
 capture(context: NativeStageContinuationContext26): Promise<NativeStageContinuationCapture26>;
 assertVerifiedContinuation(progress: unknown): Promise<void>;
}
const must = (v: unknown, message: string): void => requireDomain(v, 'NATIVE_STAGE_CONTINUATION_CONFLICT', message);
const names = ['PARTIES','CATALOGUE','BARCODES'] as const;
const counts = [515,344,15018] as const;
const hash = (v: unknown): boolean => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function own(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
 must(value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value as object).length === keys.length, 'Exact private continuation shape required');
 for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key); must(d && Object.hasOwn(d,'value') && d.enumerable, 'Own data fields required'); }
}
/** Shared original descriptor-only canonical codec. Member order is part of source authority. */
export function nativeStageContinuationCommitments26(groups: NativeStageGroups26): NativeStagePrefixProof26['groups'] {
 return groups.map((g,i) => {
  own(g,['name','members']); must(g.name === names[i] && Array.isArray(g.members), 'Exact original ordered three groups required');
  return {name:g.name,rows:g.members.length,sha256:historySettlementRequestHash(g.members)};
 });
}
export function captureNativeStageContinuationInput26(value: NativeStageContinuationCapture26): NativeStageContinuationCapture26 {
 own(value,['preparation','groups','onVerified']); must(typeof value.onVerified === 'function', 'Private onVerified callback required');
 historySettlementRequestHash({preparation:value.preparation,groups:value.groups});
 const detached = structuredClone({preparation:value.preparation,groups:value.groups});
 own(detached.preparation,['inputDigest','manifestSha256','original148Refs','original201Refs']);
 must(hash(detached.preparation.inputDigest) && hash(detached.preparation.manifestSha256), 'Original preparation digests required');
 for (const refs of [detached.preparation.original148Refs,detached.preparation.original201Refs]) {
  must(Array.isArray(refs) && refs.length > 0 && refs.length <= 1000, 'Original finite source references required');
  const seen = new Set<string>();
  for (const ref of refs) { own(ref,['path','sha256']); must(typeof ref.path === 'string' && ref.path.length > 0 && !ref.path.includes('\0') && hash(ref.sha256) && !seen.has(ref.path), 'Exact unique original file references required'); seen.add(ref.path); }
 }
 must(Array.isArray(detached.groups) && detached.groups.length === 3, 'Only three additional groups permitted');
 nativeStageContinuationCommitments26(detached.groups);
 detached.groups.forEach((g,i)=>must(g.members.length===counts[i], 'Full original515/344/15018 membership required'));
 return {...detached,onVerified:value.onVerified.bind(value)};
}
const nativeTables = {HALL:'hall',CUSTOMER:'customer',SUPPLIER:'supplier',STAFF:'staff',WAREHOUSE:'warehouse',CATEGORY:'product_category',COLOR:'color',FIT:'fit',SIZE:'size',SIZE_GROUP:'size_group',SEASON:'season',SIZE_GROUP_MEMBER:'size_group_member'} as const;
const sourceExact = "(to_jsonb(s)||jsonb_build_object('row_no',s.row_no::text))=e->'source'";
const sourcePredicate = "s.id=(e->'source'->>'id')::uuid OR (s.batch_id=(e->'source'->>'batch_id')::uuid AND ((s.entity_type=e->'source'->>'entity_type' AND s.source_key=e->'source'->>'source_key') OR (s.source_file_sha256=e->'source'->>'source_file_sha256' AND s.sheet=e->'source'->>'sheet' AND s.row_no=(e->'source'->>'row_no')::bigint)))";
function exactlyOne(from: string, predicate: string): string { return `(SELECT count(*)=1 AND bool_and(${predicate}) FROM ${from})`; }
function existsNative(entity: string, id: string, entities: readonly (keyof typeof nativeTables)[]): string {
 return `EXISTS(${entities.map(k=>`SELECT 1 FROM naijue_erp.${nativeTables[k]} n WHERE ${entity}='${k}' AND n.id=(${id})::uuid`).join(' UNION ALL ')})`;
}
const partyNative = `(${(['HALL','CUSTOMER','SUPPLIER','STAFF','WAREHOUSE'] as const).map(k=>
 `SELECT n.id::text id FROM naijue_erp.${nativeTables[k]} n WHERE e->>'entity'='${k}' AND (n.id=(e->'native'->>'id')::uuid${['CUSTOMER','SUPPLIER'].includes(k)?" OR n.code=e->'native'->>'code'":''})`).join(' UNION ALL ')}) n`;
const partyChecks = [
 exactlyOne(partyNative,"n.id=e->'native'->>'id'"),
 exactlyOne(`naijue_erp.native_party_import_evidence p WHERE p.source_row_id=(e->'source'->>'id')::uuid OR (p.batch_id=(e->'source'->>'batch_id')::uuid AND p.entity_type=e->>'entity' AND (p.source_key=e->'source'->>'source_key' OR p.native_id=(e->'native'->>'id')::uuid)) OR (p.entity_type=e->>'entity' AND p.source_key=e->'source'->>'source_key' AND EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=p.batch_id AND b.source_name=e->>'namespace'))`,"(to_jsonb(p)-ARRAY['creation_xid','imported_at','native_hall_id','native_customer_id','native_supplier_id','native_staff_id','native_warehouse_id'])=e->'intent'"),
 exactlyOne(`naijue_erp.import_source_row s WHERE ${sourcePredicate}`,sourceExact),
 `(e->'reference'='null'::jsonb OR ${exactlyOne("naijue_erp.import_header_native_reference r WHERE r.batch_id=(e->'source'->>'batch_id')::uuid AND r.source_row_id=(e->'source'->>'id')::uuid","to_jsonb(r)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_header_native_reference,e->'reference'))")})`,
 `NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e->'references') ref WHERE NOT ${existsNative("ref->>'entity'","ref->>'id'",['HALL','CUSTOMER','WAREHOUSE'])})`,
 `(e->'warehouseRecord'='null'::jsonb OR ${exactlyOne("naijue_erp.import_record r JOIN naijue_erp.import_batch b ON b.id=r.import_batch_id WHERE r.id=(e->'warehouseRecord'->>'id')::uuid OR (b.source_name=e->>'namespace' AND r.source_entity_type='WAREHOUSE' AND r.source_key=e->'source'->>'source_key') OR (r.import_batch_id=(e->'source'->>'batch_id')::uuid AND r.target_type='WAREHOUSE' AND r.target_id=(e->'native'->>'id')::uuid)","to_jsonb(r)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_record,e->'warehouseRecord'))")})`
];
const catalogueChecks = [
 `(${(['CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SEASON'] as const).map(k=>`(e->>'entity'='${k}' AND EXISTS(SELECT 1 FROM naijue_erp.${nativeTables[k]} n WHERE n.id=(e->'native'->>'id')::uuid))`).join(' OR ')} OR (e->>'entity'='SIZE_GROUP_MEMBER' AND EXISTS(SELECT 1 FROM naijue_erp.size_group_member n WHERE n.size_group_id=(e->'native'->>'size_group_id')::uuid AND n.size_id=(e->'native'->>'size_id')::uuid)))`,
 exactlyOne(`naijue_erp.import_native_catalogue_binding b WHERE b.batch_id=(e->'source'->>'batch_id')::uuid AND ((b.entity_type=e->>'entity' AND b.source_key=e->'source'->>'source_key') OR b.source_row_id=(e->'source'->>'id')::uuid OR ${(['category_id','color_id','fit_id','size_id','size_group_id','season_id'] as const).map(c=>`(e->'binding'->>'${c}' IS NOT NULL AND b.${c}=(e->'binding'->>'${c}')::uuid)`).join(' OR ')} OR (b.member_group_id=(e->'binding'->>'member_group_id')::uuid AND b.member_size_id=(e->'binding'->>'member_size_id')::uuid))`,"to_jsonb(b)=e->'binding'"),
 exactlyOne(`naijue_erp.import_source_row s WHERE ${sourcePredicate}`,sourceExact),
 `NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e->'references') ref WHERE NOT (${existsNative("ref->>'entity'","ref->>'nativeId'",['CATEGORY','SIZE','SIZE_GROUP'])} AND ${exactlyOne("naijue_erp.import_native_catalogue_binding b WHERE b.batch_id=(e->'source'->>'batch_id')::uuid AND b.entity_type=ref->>'entity' AND b.source_key=ref->>'sourceKey'","b.native_snapshot=ref->'nativeSnapshot'")}))`
];
const barcodeChecks = [
 exactlyOne("naijue_erp.sku_barcode b WHERE b.id=(e->'native'->>'id')::uuid OR b.barcode=e->'native'->>'barcode'","to_jsonb(b)=e->'native'"),
 exactlyOne("naijue_erp.barcode_scheme b WHERE b.id=(e->'scheme'->>'id')::uuid","to_jsonb(b)=e->'scheme'->'snapshot'"),
 exactlyOne("naijue_erp.sku k JOIN naijue_erp.import_record r ON r.import_batch_id=(e->'source'->>'batch_id')::uuid AND r.source_entity_type='SKU' AND r.source_key=e->'sku'->>'canonicalSourceKey' AND r.target_type='SKU' AND r.target_id=k.id AND r.status='IMPORTED' JOIN naijue_erp.import_sku_alias a ON a.batch_id=r.import_batch_id AND a.canonical_sku_id=k.id AND a.canonical_source_key=r.source_key AND a.old_source_sku_id=e->'sku'->>'oldSourceSkuKey' WHERE k.id=(e->'sku'->>'nativeId')::uuid","true"),
 exactlyOne(`naijue_erp.import_source_row s WHERE s.id=(e->'source'->>'id')::uuid OR (s.batch_id=(e->'source'->>'batch_id')::uuid AND ((s.entity_type='BARCODE' AND (s.source_key=e->'source'->>'source_key' OR s.field_provenance->>'native_barcode'=e->'native'->>'barcode')) OR (s.source_file_sha256=e->'source'->>'source_file_sha256' AND s.sheet=e->'source'->>'sheet' AND s.row_no=(e->'source'->>'row_no')::bigint)))`,sourceExact),
 `(NOT ((e->'native'->>'enabled')::boolean AND e->'native'->>'barcode_kind'='MAIN') OR ${exactlyOne("naijue_erp.sku_barcode b WHERE b.sku_id=(e->'native'->>'sku_id')::uuid AND b.barcode_kind='MAIN' AND b.enabled","b.id=(e->'native'->>'id')::uuid")})`
];
function memberSql(name: typeof names[number], checks: readonly string[]): string {
 return `/* native-stage26:${name} */ WITH expected AS (SELECT (value->>'ordinal')::integer ordinal,value e FROM jsonb_array_elements($1::jsonb)) SELECT ordinal,(${checks.join(' AND ')}) AS exact FROM expected ORDER BY ordinal`;
}
const queries = [memberSql('PARTIES',partyChecks),memberSql('CATALOGUE',catalogueChecks),memberSql('BARCODES',barcodeChecks)];
type Packet = Record<string, unknown>;
function partyPacket(row: PreparedNativePartyImportRow): Packet {
 const rebuilt=prepareNativePartyImportChunk([row.input]).rows[0]!;
 must(requestHash(rebuilt)===requestHash(row),'Original prepared party changed');
 const pair=row.headerReference?historyHeaderNativeReferenceEvidence(row.headerReference,0):null;
 const source=pair?.source??nativePartyStandaloneImportSource(row),s=row.input.source;
 const warehouseRecord=row.input.warehouseRecord?{id:row.input.warehouseRecord.id,import_batch_id:s.batchId,source_entity_type:'WAREHOUSE',source_key:s.sourceKey,source_record_hash:s.rowSha256,source_file_ref:s.fileRef,target_type:'WAREHOUSE',target_id:row.nativeId,status:'IMPORTED',decision_reason:row.input.warehouseRecord.decisionReason,reviewed_at:row.input.warehouseRecord.reviewedAt}:null;
 return {entity:row.entity,namespace:row.input.fixedSourceNamespace,source,native:row.nativeSnapshot,reference:pair?.reference??null,warehouseRecord,
  references:Object.entries(row.input.bindings).filter(([,v])=>v).map(([key,v])=>({entity:key==='默认客户来源编号'?'CUSTOMER':key==='默认销货仓来源编号'?'WAREHOUSE':'HALL',id:v!.nativeId})),
  intent:{batch_id:s.batchId,source_row_id:s.id,entity_type:row.entity,source_key:s.sourceKey,native_id:row.nativeId,native_snapshot:row.nativeSnapshot,source_snapshot:source,selection:row.input.selection,warehouse_record:row.input.warehouseRecord??null,authorization:row.authorization,row_fingerprint:row.fingerprint,validator_version:NATIVE_PARTY_IMPORT_VERSION}};
}
function cataloguePacket(row: PreparedNativeCatalogueImportRow, namespace: string): Packet {
 const selection=row.evidence.selection as unknown as NativeCatalogueSelection;
 const raw={source:row.source,sourceKeyField:row.sourceKeyField,nativeId:row.nativeId,decisions:row.decisions,references:row.references};
 const input={batchId:row.source.batchId,fixedSourceNamespace:namespace,selection,rows:[raw]};
 const rebuilt=(row.evidence.schema_profile==='EXACT26'?prepareNativeCatalogueImportChunk26({...input,schemaProfile:'EXACT26',validatorVersion:NATIVE_CATALOGUE_IMPORT_VERSION_26}):prepareNativeCatalogueImportChunk(input)).rows[0]!;
 must(requestHash(rebuilt)===requestHash(row),'Original prepared catalogue changed');
 return {entity:row.entity,source:nativeCatalogueSourceEvidence(row),native:row.nativeSnapshot,binding:nativeCatalogueBindingEvidence(row),references:Object.values(row.references)};
}
function barcodePacket(row: PreparedNativeBarcode): Packet { validatePreparedNativeBarcode(row); return {entity:'BARCODE',source:nativeBarcodeSourceEvidence(row),native:row.nativeBarcode,sku:row.sku,scheme:row.scheme}; }
/** Exactly161 bounded member-summary queries for the approved full3 groups. RR snapshot and batch locks are owned by caller.
 * Native current data is observed as-of this snapshot. No across-COMMIT locks or lasting current-state authorization are claimed. */
export async function verifyCommittedNativeStagePrefix26(client: Pick<PgSalesClient,'query'>, context: NativeStageContinuationContext26,
 captured: NativeStageContinuationCapture26): Promise<NativeStagePrefixProof26> {
 const {groups,preparation}=captured;
 must(Array.isArray(groups)&&groups.length===3,'Complete three-group input required');
 groups.forEach((g,i)=>must(g.members.length===counts[i],'Full original515/344/15018 membership required'));
 const commitments=nativeStageContinuationCommitments26(groups);
 const packets: Packet[][]=[groups[0].members.map(partyPacket),groups[1].members.map(r=>cataloguePacket(r,String(context.binding.fixedSourceNamespace))),groups[2].members.map(barcodePacket)];
 const sourceIds=new Set<string>(),keys=new Set<string>(),positions=new Set<string>(),targets=new Set<string>();
 for (let i=0;i<packets.length;i++) for (const [ordinal,packet] of packets[i]!.entries()) {
  const s=packet.source as Record<string,unknown>,n=packet.native as Record<string,unknown>;
  must(s.batch_id===context.binding.batchId,'Foreign batch member');
  const original=groups[i]!.members[ordinal]!;
  const selected=i===0?(original as PreparedNativePartyImportRow).input.selection:i===1?(original as PreparedNativeCatalogueImportRow).evidence.selection:(original as PreparedNativeBarcode).selection;
  must((selected as Record<string,unknown>).selectionSha256===context.binding.selectionSha256,'Foreign source selection');
  if(i!==1)must((i===0?(original as PreparedNativePartyImportRow).input.fixedSourceNamespace:(original as PreparedNativeBarcode).fixedSourceNamespace)===context.binding.fixedSourceNamespace,'Foreign source namespace');
  const key=requestHash([s.entity_type,s.source_key]),position=requestHash([s.source_file_sha256,s.sheet,s.row_no]);
  const target=requestHash([packet.entity,n.id??[n.size_group_id,n.size_id]]);
  must(!sourceIds.has(String(s.id))&&!keys.has(key)&&!positions.has(position)&&!targets.has(target),'Duplicate original source/position/native membership');
  sourceIds.add(String(s.id));keys.add(key);positions.add(position);targets.add(target);
 }
 for(let i=0;i<packets.length;i++) for(let offset=0;offset<packets[i]!.length;offset+=100){
  const page=packets[i]!.slice(offset,offset+100).map((p,j)=>({...p,ordinal:offset+j}));
  const result=await client.query(queries[i]!,[JSON.stringify(page)]);
  must(result.rows.length===page.length,'Complete member summaries required');
  result.rows.forEach((r,j)=>must(r.ordinal===offset+j&&r.exact===true,'Missing, partial or conflicting original stage member'));
 }
 return {version:1,...structuredClone(context),preparation:structuredClone(preparation),groups:commitments};
}
