import {createSyntheticPackage,repinSyntheticPackage} from './synthetic-package.ts';
import {registryTargetId,sha256,STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256} from '../../../packages/application/src/unified-import-contract.ts';
import {stableImportId} from '../../../packages/application/src/inventory-cutoff-import.ts';
import {compileStandardWholePackageProfile} from '../../../packages/application/src/unified-import-whole-package-profile.ts';
import {isNodeScryptPasswordHash} from '../../../packages/authentication/src/passwords.ts';
import type {StandardImportTarget,StandardImportStep} from '../../../packages/application/src/unified-import-execution.ts';
/** A small fully synthetic fixture only. Caller separately verifies its isolated
 * target and provisions reviewed schema/roles; this never connects or installs. */
export function buildSyntheticWholePackageFixture(target:StandardImportTarget,encodedScrypt:string,variant:'default'|'large-document'|'departure-null'|'departure-date'|'zero-unknown'='default'){
 if(!isNodeScryptPasswordHash(encodedScrypt))throw TypeError('SYNTHETIC_SCRYPT_REQUIRED');
 const pkg=createSyntheticPackage();if(pkg.manifest.package_kind!=='SYNTHETIC')throw Error('SYNTHETIC_PACKAGE_REQUIRED');
 if(variant==='zero-unknown'){
  const template=structuredClone(pkg.records.warehouse![0]!), registry=structuredClone(pkg.registry.find(x=>x.entity_type==='WAREHOUSE')!);
  template.source_key='warehouse:03'; template.fields.id=registryTargetId(pkg.manifest.source_namespace,'WAREHOUSE',template.source_key);template.fields.name='SYNTHETIC uncovered warehouse';
  registry.canonical_source_key=template.source_key;registry.target_id=template.fields.id as string;pkg.records.warehouse!.push(template);pkg.registry.push(registry);
  (pkg.reports['reconciliation.json'] as {tables:Record<string,unknown>}).tables.warehouse={source_rows:3,retained_rows:3,rejected_rows:0};repinSyntheticPackage(pkg);
 }
 if(variant==='departure-null'||variant==='departure-date'){pkg.manifest.schema_contract.source_declarations_sha256=STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256;for(const row of pkg.records.staff!)row.fields.departure_date=variant==='departure-null'?null:'2024-02-29';repinSyntheticPackage(pkg);}
 if(variant==='large-document'){
  for(let n=2;n<=501;n++){const template=pkg.records.sales_line![0]!,source_key=`SYNTHETIC-WHOLE-LINE-${n}`,id=stableImportId('SYNTHETIC-WHOLE-LARGE-DOC',String(n));pkg.records.sales_line!.push({...structuredClone(template),source_key,fields:{...template.fields,id,line_no:n}});pkg.registry.push({...structuredClone(pkg.registry.find(r=>r.entity_type==='SALES_LINE')!),canonical_source_key:source_key,target_id:id,identity_basis:'EXISTING_VERIFIED'});}
  Object.assign(pkg.records.sales_header![0]!.fields,{status:'DRAFT',gross_amount:'8016.00',net_due:'8016.00'});(pkg.reports['reconciliation.json'] as {tables:Record<string,unknown>}).tables.sales_line={source_rows:501,retained_rows:501,rejected_rows:0};repinSyntheticPackage(pkg);
 }

 const admin={staff_id:stableImportId('SYNTHETIC_V2_COMPAT','staff'),account_id:stableImportId('SYNTHETIC_V2_COMPAT','account'),login_name:'synthetic-v1-compat',staff_name:'SYNTHETIC V1 compatibility ADMIN'};
 const manifestBytes=Buffer.from(JSON.stringify(pkg.manifest,null,2)+'\n'),program=compileStandardWholePackageProfile({pkg,manifestBytes,expectedManifestSha256:sha256(manifestBytes),allowSynthetic:true,target,initialization_identity:admin});
 const constraintFailureAt=program.steps.findIndex(s=>s.method==='masterChunk'&&Array.isArray(s.request.payload.rows)&&(s.request.payload.rows as Record<string,unknown>[]).some(r=>r.entity_type==='COLOR'));
 if(constraintFailureAt<0)throw Error('SYNTHETIC_COLOR_ROW_REQUIRED');
 const constraintFailureStep:StandardImportStep=structuredClone(program.steps[constraintFailureAt]!);const rows=constraintFailureStep.request.payload.rows as {entity_type:string;fields:Record<string,unknown>}[];const color=rows.find(r=>r.entity_type==='COLOR');if(!color)throw Error('SYNTHETIC_COLOR_ROW_REQUIRED');color.fields.code=null;
 const sealedAppendAfter=program.steps.findIndex(s=>s.method==='documentChunk'&&s.request.payload.mode==='CHUNK'&&Array.isArray(s.request.payload.documents)&&s.request.payload.documents.length>0);
 if(sealedAppendAfter<0)throw Error('SYNTHETIC_SEALED_DOCUMENT_REQUIRED');
 const sealedAppendStep:StandardImportStep=structuredClone(program.steps[sealedAppendAfter]!);const appendPayload=sealedAppendStep.request.payload;const appendRows=appendPayload.rows as Record<string,unknown>[];if(!appendRows.length)throw Error('SYNTHETIC_DOCUMENT_ROW_REQUIRED');
 const appendOp=stableImportId('SYNTHETIC_SEALED_APPEND',sealedAppendStep.request.operation_id);sealedAppendStep.request.operation_id=appendOp;sealedAppendStep.request.request_key=appendOp;appendPayload.expected_sequence=Number(appendPayload.expected_sequence)+1;appendPayload.rows=[appendRows[0]!];appendPayload.documents=[];
 return {packageKind:'SYNTHETIC' as const,program,syntheticWarehouseRows:pkg.records.warehouse!.map(x=>({id:x.fields.id as string,hallId:x.fields.hall_id as string,label:x.fields.name as string})),syntheticSkuId:pkg.records.sku![0]!.fields.id as string,documentBatchId:program.initialize.payload.document_batch_id,constraintFailureAt,constraintFailureStep,sealedAppendAfter,sealedAppendStep};
}

/** Actual isolated-PG observer helpers. They accept an already verified client,
 * never connect, mutate or return table contents/credentials. The test runner
 * must guarantee a dedicated synthetic database and no concurrent writers. */
export interface SyntheticObserver {query(sql:string,values?:unknown[]):Promise<{rows:readonly Record<string,unknown>[]}>}
const safeName=(v:unknown):v is string=>typeof v==='string'&&/^[a-z_][a-z_0-9]*$/.test(v);
export async function snapshotSyntheticDatabase(observer:SyntheticObserver){
 const rels=(await observer.query("SELECT relname FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind IN ('r','p') ORDER BY relname")).rows;
 const names=rels.map(r=>r.relname);if(names.length<35||names.length>100||!names.every(safeName)||new Set(names).size!==names.length||!['product','sku','sku_barcode','import_batch','import_record','operation_receipt','audit_change'].every(n=>names.includes(n)))throw Error('SYNTHETIC_SCHEMA_SCOPE_INVALID');
 const tables:Record<string,{count:string;sha256:string}>={};for(const n of names as string[]){const rows=(await observer.query(`SELECT count(*)::text AS count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') AS sha256 FROM (SELECT * FROM naijue_erp."${n}" LIMIT 10001) t`)).rows;if(rows.length!==1||typeof rows[0]!.count!=='string'||!/^[0-9]+$/.test(rows[0]!.count)||Number(rows[0]!.count)>10000||typeof rows[0]!.sha256!=='string'||!/^[a-f0-9]{64}$/.test(rows[0]!.sha256))throw Error('SYNTHETIC_SNAPSHOT_INVALID');tables[n]={count:rows[0]!.count,sha256:rows[0]!.sha256};}
 const seqs=(await observer.query("SELECT relname FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind='S' ORDER BY relname")).rows;const seqNames=seqs.map(r=>r.relname);if(seqNames.length>50||!seqNames.every(safeName)||new Set(seqNames).size!==seqNames.length)throw Error('SYNTHETIC_SEQUENCE_SCOPE_INVALID');const sequences:Record<string,{value:string;called:boolean}>={};for(const n of seqNames as string[]){const rows=(await observer.query(`SELECT last_value::text AS value,is_called AS called FROM naijue_erp."${n}"`)).rows;if(rows.length!==1||typeof rows[0]!.value!=='string'||!/^\d+$/.test(rows[0]!.value)||typeof rows[0]!.called!=='boolean')throw Error('SYNTHETIC_SEQUENCE_INVALID');sequences[n]={value:rows[0]!.value,called:rows[0]!.called};}
 return {tables,sequences};
}
export async function assertSyntheticPublished(observer:SyntheticObserver,baselineId:string,documentId:string,summary:unknown){
 if(!summary||typeof summary!=='object'||Array.isArray(summary)||(summary as Record<string,unknown>).phase!=='DOCUMENT_PUBLISH')throw Error('SYNTHETIC_SUMMARY_INVALID');
 const rows=(await observer.query('SELECT id,status FROM naijue_erp.import_batch WHERE id=ANY($1::uuid[]) ORDER BY id',[[baselineId,documentId]])).rows;
 if(rows.length!==2||new Set(rows.map(r=>r.id)).size!==2||!rows.every(r=>typeof r.id==='string'&&[baselineId,documentId].includes(r.id)&&r.status==='IMPORTED'))throw Error('SYNTHETIC_PUBLICATION_INVALID');
}
