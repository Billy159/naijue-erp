import {requestHash} from '../../../packages/application/src/request-hash.ts';
import {readHistoricalSettlementRetentionApproval} from '../../../packages/application/src/unified-historical-settlement-retention.ts';
import type {HistoricalSettlementRetentionApproval} from '../../../packages/application/src/unified-historical-settlement-retention.ts';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256} from '../../../packages/application/src/unified-import-contract.ts';
import {buildHistoricalSalesHallEvidenceV2,buildHistoricalSalesHallInitializationIntent,readHistoricalSalesHallApproval} from '../../../packages/application/src/unified-historical-sales-hall-evidence.ts';
import {readHistoricalLineAmountEvidence} from '../../../packages/application/src/unified-historical-line-amount-evidence.ts';
import {assertWholeSalesAdmissionV1} from '../../../scripts/release/unified-install/whole-sales-admission-v1.mjs';
import {streamPreflight} from '../../../tools/unified-import/stream-preflight.mjs';
import {prepareStreamPlan} from '../../../tools/unified-import/stream-plan.mjs';
import {buildStreamProgram} from '../../../tools/unified-import/stream-program.mjs';
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

export const SYNTHETIC_FRESH35_HISTORICAL_ANCHOR_SALE = 'SYNTHETIC-FRESH35-HISTORICAL-ANCHOR';

/** Fresh35 A-V2 + amount-successor business input only. All source observations,
 * identities, amounts and decisions here are explicitly synthetic. No database
 * identity, connection, permission, or installation receipt is invented. */
export function createSyntheticFresh35WholePackageInput(targetCapturedAt:string|null,variant:'default'|'settlement-retention25'|'historical-anchor'='default'){
 if(variant!=='default'&&variant!=='settlement-retention25'&&variant!=='historical-anchor')throw Error('SYNTHETIC_FRESH35_VARIANT_REQUIRED');
 const pkg=createSyntheticPackage(),namespace=pkg.manifest.source_namespace;
 const header=pkg.records.sales_header![0]!,warehouse=pkg.records.warehouse![0]!,hall=pkg.records.hall![0]!;
 const secondHall=structuredClone(hall);secondHall.source_key='hall:02';secondHall.fields.id=registryTargetId(namespace,'HALL',secondHall.source_key);secondHall.fields.name='SYNTHETIC alternate captured hall';secondHall.fields.default_customer_id=null;secondHall.fields.default_sales_warehouse_id=null;pkg.records.hall!.push(secondHall);
 pkg.registry.push({entity_type:'HALL',source_namespace:namespace,canonical_source_key:secondHall.source_key,target_id:secondHall.fields.id as string,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:structuredClone(secondHall.source_refs)});
 pkg.manifest.schema_contract.source_declarations_sha256=HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256;
 for(const row of pkg.records.staff!)row.fields.departure_date=null;
 const runtimeWarehouse=stableImportId('SYNTHETIC_FRESH35_SOURCE_RUNTIME','warehouse'),runtimeHalls=[stableImportId('SYNTHETIC_FRESH35_SOURCE_RUNTIME','hall-1'),stableImportId('SYNTHETIC_FRESH35_SOURCE_RUNTIME','hall-2')];
 const capture={capture_evidence_sha256:'',source_namespace:'SYNTHETIC_ONLY_RUNTIME_CAPTURE',warehouse_source_key:'SYNTHETIC-WAREHOUSE-CODE',runtime_warehouse_id:runtimeWarehouse,source_native_version:0,effective_version:0,runtime_hall_ids:runtimeHalls,captured_at:'2026-11-02T08:00:00Z',transaction_snapshot:'SYNTHETIC_ONLY:1:2',relation_basis:'SYNTHETIC_FIXTURE_OBSERVATION_NOT_REAL_RUNTIME'};
 // These three source files state their synthetic status in their own bytes.
 const {capture_evidence_sha256:_ownDigest,...captureObservation}=capture;
 const captureText=JSON.stringify({synthetic_only:true,observation:captureObservation})+'\n';capture.capture_evidence_sha256=sha256(captureText);
 const bridgeRecord={record_key:'SYNTHETIC-WAREHOUSE-BRIDGE',entity_type:'WAREHOUSE' as const,source_namespace:capture.source_namespace,warehouse_source_key:capture.warehouse_source_key,runtime_warehouse_id:runtimeWarehouse,target_namespace:namespace,target_warehouse_id:warehouse.fields.id as string,source_capture_sha256:capture.capture_evidence_sha256,hall_links:runtimeHalls.map((id,i)=>({runtime_hall_id:id,target_hall_id:(i===0?hall:secondHall).fields.id as string})),source_refs:structuredClone(warehouse.source_refs),scope:'FIXED_CAPTURE_SCOPE_ONLY' as const};
 const resolutionRecord={record_key:'SYNTHETIC-DUAL-HALL-RESOLUTION',source_namespace:capture.source_namespace,warehouse_source_key:capture.warehouse_source_key,runtime_warehouse_id:runtimeWarehouse,target_namespace:namespace,target_warehouse_id:warehouse.fields.id as string,source_capture_sha256:capture.capture_evidence_sha256,selected_target_hall_id:hall.fields.id as string,runtime_hall_ids:runtimeHalls,source_refs:structuredClone(warehouse.source_refs),scope:'FIXED_CAPTURE_SCOPE_ONLY' as const};
 const sourceTexts={capture:captureText,bridge:JSON.stringify({synthetic_only:true,record:bridgeRecord})+'\n',resolution:JSON.stringify({synthetic_only:true,record:resolutionRecord})+'\n'};
 const sourcePins=Object.entries(sourceTexts).map(([name,text])=>({relative_path:'SYNTHETIC-FRESH35-'+name+'.txt',bytes:Buffer.byteLength(text),sha256:sha256(text)}));pkg.manifest.source_files.push(...sourcePins);
 const bridge={evidence_sha256:sourcePins[1]!.sha256,...bridgeRecord},resolution={evidence_sha256:sourcePins[2]!.sha256,...resolutionRecord};
 const hallInput={basis:'MIGRATION_DERIVED',original_hall_id:null,selected_hall_id:hall.fields.id as string,warehouse_id:warehouse.fields.id as string,target_snapshot:{warehouse_id:warehouse.fields.id as string,hall_id:hall.fields.id as string,version:Number(warehouse.fields.version),captured_at:targetCapturedAt},source_capture:capture,identity_bridge:{evidence_sha256:bridge.evidence_sha256,record_key:bridge.record_key},resolution:{evidence_sha256:resolution.evidence_sha256,record_key:resolution.record_key},has_difference:true,review_required:false};
 header.historical_hall_evidence=targetCapturedAt===null?buildHistoricalSalesHallInitializationIntent({...hallInput,basis:'MIGRATION_DERIVED',original_hall_id:null,target_snapshot:{...hallInput.target_snapshot,captured_at:null}}):buildHistoricalSalesHallEvidenceV2({...hallInput,basis:'MIGRATION_DERIVED',original_hall_id:null,target_snapshot:{...hallInput.target_snapshot,captured_at:targetCapturedAt}});
 header.fields.hall_id=hall.fields.id;
 // Same six discrepancy shapes as the existing amount fixture, with exact
 // original strings retained. They are not copied from the six real records.
 const examples=[['3','1.01','3.04'],['-3','1.01','-3.02'],['1','90071992547409.91','90071992547409.92'],['16','1.00','15.99'],['1','0.00','0.01'],['-1','5.00','-4.99']] as const;
 const line=pkg.records.sales_line![0]!;pkg.registry=pkg.registry.filter(r=>r.entity_type!=='SALES_LINE'&&r.entity_type!=='SALES_SETTLEMENT');
 pkg.records.sales_line=examples.map(([quantity,deal_price,line_amount],i)=>{const source_key='SYNTHETIC-FRESH35-AMOUNT-'+(i+1),id=registryTargetId(namespace,'SALES_LINE',source_key),source_refs=[{...line.source_refs[0]!,row:100+i}];pkg.registry.push({entity_type:'SALES_LINE',source_namespace:namespace,canonical_source_key:source_key,target_id:id,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:structuredClone(source_refs)});return{source_key,source_refs,fields:{...structuredClone(line.fields),id,line_no:i+1,quantity,deal_price,line_amount}};});
 const total=pkg.records.sales_line.reduce((sum,r)=>sum+BigInt((r.fields.line_amount as string).replace('.','')),0n),gross=`${total/100n}.${(total%100n).toString().padStart(2,'0')}`;
 header.fields.gross_amount=gross;header.fields.net_due=gross;
 const settlement=structuredClone(pkg.records.sales_settlement![0]!);settlement.fields.amount=gross;pkg.records.sales_settlement=[settlement];pkg.registry.push({entity_type:'SALES_SETTLEMENT',source_namespace:namespace,canonical_source_key:settlement.source_key,target_id:settlement.fields.id as string,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:structuredClone(settlement.source_refs)});
 header.zero_amount_archive={profile:'ZERO_AMOUNT_SOURCE_ARCHIVE_V1',records:Array.from({length:22},(_,i)=>({source_key:'SYNTHETIC-FRESH35-ZERO-'+(i+1),amount:'0.00',source_refs:[{...header.source_refs[0]!,row:200+i}],original_values:{amount:'0',description:'SYNTHETIC ONLY zero source, no money or stock action',unknown:null}}))};
 const retainedSalesIds:string[]=[];
 if(variant!=='default'){
  // Artificial facts only. Do not accept an input path, real proof or caller rows.
  if(pkg.manifest.package_kind!=='SYNTHETIC')throw Error('SYNTHETIC_FRESH35_INPUT_REQUIRED');
  pkg.records.warehouse!.find(row=>row.source_key==='warehouse:02')!.fields.hall_id=secondHall.fields.id;
  for(let i=0;i<25;i++){
   const returned=i>=22,zeroDue=i===21,source_key='SYNTHETIC-FRESH35-RETENTION-'+(i+1),id=registryTargetId(namespace,'SALES_HEADER',source_key),source_refs=[{...header.source_refs[0]!,row:300+i}];
   const h={...structuredClone(header),source_key,source_refs,fields:{...structuredClone(header.fields),id,number:source_key,business_type:returned?'RETURN':'SALE',gross_amount:zeroDue?'0.00':returned?'-16.00':'16.00',order_discount:'0.00',net_due:zeroDue?'0.00':returned?'-16.00':'16.00'}};delete h.zero_amount_archive;
   pkg.records.sales_header!.push(h);retainedSalesIds.push(id);pkg.registry.push({entity_type:'SALES_HEADER',source_namespace:namespace,canonical_source_key:source_key,target_id:id,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:structuredClone(source_refs)});
   const line_key=source_key+'-LINE',line_id=registryTargetId(namespace,'SALES_LINE',line_key);
   pkg.records.sales_line!.push({source_key:line_key,source_refs:structuredClone(source_refs),fields:{...structuredClone(line.fields),id:line_id,sales_id:id,line_no:1,quantity:returned?'-1':'1',deal_price:zeroDue?'0.00':'16.00',line_amount:h.fields.gross_amount,allocated_discount:null}});
   pkg.registry.push({entity_type:'SALES_LINE',source_namespace:namespace,canonical_source_key:line_key,target_id:line_id,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:structuredClone(source_refs)});
   for(let j=0;j<(i<2?2:1);j++){
    const key=source_key+'-SETTLEMENT-'+(j+1),sid=registryTargetId(namespace,'SALES_SETTLEMENT',key),refs=[{...source_refs[0]!,row:400+i*2+j}];
    pkg.records.sales_settlement!.push({source_key:key,source_refs:refs,fields:{...structuredClone(settlement.fields),id:sid,sales_id:id,line_no:j+1,direction:returned?'REFUND':'RECEIVE',amount:i<11||returned||zeroDue?'1.00':'17.00'}});
    pkg.registry.push({entity_type:'SALES_SETTLEMENT',source_namespace:namespace,canonical_source_key:key,target_id:sid,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:structuredClone(refs)});
   }
  }
 }
 if(variant==='historical-anchor'){
  // Add one re-approvable historical sale. Preserve every amount/settlement
  // discrepancy fixture and the original transfer and cutoff keys.
  const source_key=SYNTHETIC_FRESH35_HISTORICAL_ANCHOR_SALE;
  const id=registryTargetId(namespace,'SALES_HEADER',source_key),source_refs=[{...header.source_refs[0]!,row:501}];
  const sale={...structuredClone(header),source_key,source_refs,fields:{...structuredClone(header.fields),
   id,number:source_key,version:2,gross_amount:'2.00',net_due:'2.00'}};
  delete sale.zero_amount_archive;
  pkg.records.sales_header!.push(sale);
  pkg.registry.push({entity_type:'SALES_HEADER',source_namespace:namespace,canonical_source_key:source_key,target_id:id,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs});
  for(const [i,quantity,line_amount] of [[1,'3','3.00'],[2,'-1','-1.00']] as const){
   const key=source_key+'-LINE-'+i,lineId=registryTargetId(namespace,'SALES_LINE',key),refs=[{...source_refs[0]!,row:501+i}];
   pkg.records.sales_line!.push({source_key:key,source_refs:refs,fields:{...structuredClone(line.fields),id:lineId,sales_id:id,line_no:i,quantity,
    reference_price:'1.00',deal_price:'1.00',line_amount,allocated_discount:'0.00',is_gift:false,pricing_rule:'UNIT_PRICE',discount_tenths:null,zero_confirmed:false}});
   pkg.registry.push({entity_type:'SALES_LINE',source_namespace:namespace,canonical_source_key:key,target_id:lineId,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:refs});
  }
  const key=source_key+'-SETTLEMENT',settlementId=registryTargetId(namespace,'SALES_SETTLEMENT',key),refs=[{...source_refs[0]!,row:504}];
  pkg.records.sales_settlement!.push({source_key:key,source_refs:refs,fields:{...structuredClone(settlement.fields),
   id:settlementId,sales_id:id,amount:'2.00',payment_method_id_snapshot:pkg.records.payment_method![0]!.fields.id!}});
  pkg.registry.push({entity_type:'SALES_SETTLEMENT',source_namespace:namespace,canonical_source_key:key,target_id:settlementId,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:refs});
 }
 const sourceHashes=new Set(pkg.manifest.source_files.map(f=>f.sha256));
 const hallBytes=Buffer.from(JSON.stringify({format_version:'HISTORICAL_SALES_HALL_APPROVAL_V2',source_namespace:namespace,evidence_sha256:sourcePins[0]!.sha256,records:pkg.records.sales_header!.map(h=>({source_key:h.source_key,target_id:h.fields.id,source_refs:h.source_refs,evidence:h.historical_hall_evidence,...(targetCapturedAt===null?{target_initialization:{warehouse_source_key:warehouse.source_key}}:{})})),source_captures:[capture],identity_bridges:[bridge],resolutions:[resolution]}));
 const historicalSalesHallApproval=readHistoricalSalesHallApproval({bytes:hallBytes,trustedSha256:sha256(hallBytes),sourceNamespace:namespace,sourceHashes});
 const amountBytes=Buffer.from(JSON.stringify({format_version:'HISTORICAL_LINE_AMOUNT_EVIDENCE_V1',source_namespace:namespace,evidence_sha256:pkg.manifest.source_files[0]!.sha256,lines:pkg.records.sales_line.filter(row=>row.fields.sales_id===header.fields.id).map(row=>({sales_source_key:header.source_key,sales_id:header.fields.id,sales_source_refs:header.source_refs,line_source_key:row.source_key,line_id:row.fields.id,source_refs:row.source_refs,quantity:row.fields.quantity,deal_price:row.fields.deal_price,line_amount:row.fields.line_amount}))}));
 const historicalLineAmountEvidence=readHistoricalLineAmountEvidence({bytes:amountBytes,trustedSha256:sha256(amountBytes),sourceNamespace:namespace,sourceHashes});
 let historicalSettlementRetentionApproval:HistoricalSettlementRetentionApproval|undefined;
 if(variant!=='default'){
  const documents=pkg.records.sales_header!.filter(h=>retainedSalesIds.includes(h.fields.id as string)).map(h=>({sales_source_key:h.source_key,sales_id:h.fields.id,source_refs:h.source_refs,...Object.fromEntries(['business_type','status','gross_amount','order_discount','net_due'].map(k=>[k,h.fields[k]])),settlements:pkg.records.sales_settlement!.filter(r=>r.fields.sales_id===h.fields.id)}));
  // SHA binds generated SYNTHETIC bytes only, never a production approval.
  // Its source reference is already in this fixed synthetic manifest; no batch cycle.
  const bytes=Buffer.from(JSON.stringify({format_version:'HISTORICAL_SETTLEMENT_RETENTION_V1',source_namespace:namespace,evidence_sha256:header.source_refs[0]!.file_sha256,documents}));
  historicalSettlementRetentionApproval=readHistoricalSettlementRetentionApproval({bytes,trustedSha256:sha256(bytes),sourceNamespace:namespace,sourceHashes});
 }
 const reconciliation=pkg.reports['reconciliation.json'] as {tables:Record<string,unknown>};for(const table of ['hall','sales_header','sales_line','sales_settlement']){const n=pkg.records[table]!.length;reconciliation.tables[table]={source_rows:n,retained_rows:n,rejected_rows:0};}
 repinSyntheticPackage(pkg);
 const manifestBytes=Buffer.from(JSON.stringify(pkg.manifest,null,2)+'\n');
 const admin={staff_id:stableImportId('SYNTHETIC_FRESH35_CURRENT_ADMIN','staff'),account_id:stableImportId('SYNTHETIC_FRESH35_CURRENT_ADMIN','account'),login_name:'synthetic-fresh35-admin',staff_name:'SYNTHETIC Fresh35 fixture ADMIN'};
 return{packageKind:'SYNTHETIC' as const,sourceProfileSha256:HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256,pkg,manifestBytes,expectedManifestSha256:sha256(manifestBytes),admin,historicalSalesHallApproval,historicalLineAmountEvidence,historicalSettlementRetentionApproval,retainedSalesIds,syntheticSourceFiles:Object.fromEntries(sourcePins.map((p,i)=>[p.relative_path,Object.values(sourceTexts)[i]!])),syntheticWarehouseRows:pkg.records.warehouse!.map(r=>({id:r.fields.id as string,hallId:r.fields.hall_id as string,label:r.fields.name as string})),syntheticSkuId:pkg.records.sku![0]!.fields.id as string,targetSnapshotBasis:'SYNTHETIC_INITIALIZATION_REQUEST_MUST_BE_CHECKED_AGAINST_ACTUAL_ROW_IN_SAME_TRANSACTION' as const};
}

/** Call ONLY inside the existing verified Fresh35 host callback with its actual
 * V2 admission and caller-bound physical target. This fixture issues no host or
 * capability. The repeatable steps keep original keys for the existing replay. */
export async function buildSyntheticFresh35WholePackageFixture(target:StandardImportTarget,encodedScrypt:string,options:{historicalSalesAdmission:object;workspaceDirectory:string;targetCapturedAt:string|null;variant?:'default'|'settlement-retention25'|'historical-anchor'}){
 if(!isNodeScryptPasswordHash(encodedScrypt))throw TypeError('SYNTHETIC_SCRYPT_REQUIRED');
 if(assertWholeSalesAdmissionV1(options.historicalSalesAdmission,target)!==HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256)throw Error('SYNTHETIC_FRESH35_V2_ADMISSION_REQUIRED');
 const input=createSyntheticFresh35WholePackageInput(options.targetCapturedAt,options.variant);
 if((options.variant==='settlement-retention25'||options.variant==='historical-anchor')&&!/^synthetic_fresh35_[0-9]{8}_r[1-9][0-9]*$/.test(target.database_name))throw Error('SYNTHETIC_FRESH35_TARGET_REQUIRED');
 const scratch=await mkdtemp(join(options.workspaceDirectory,'fresh35-synthetic-fixture-')),packageDirectory=join(scratch,'package'),reportDirectory=join(scratch,'report'),syntheticEvidenceDirectory=join(scratch,'synthetic-evidence');
 let plan:Awaited<ReturnType<typeof prepareStreamPlan>>|undefined,disposed=false;
 const dispose=async()=>{if(disposed)return;disposed=true;try{await plan?.dispose()}finally{await rm(scratch,{recursive:true,force:true})}};
 try{
  await mkdir(packageDirectory);await mkdir(syntheticEvidenceDirectory);for(const [path,bytes] of Object.entries(input.pkg.artifacts)){await mkdir(dirname(join(packageDirectory,path)),{recursive:true});await writeFile(join(packageDirectory,path),bytes,{flag:'wx'});}for(const [path,text]of Object.entries(input.syntheticSourceFiles))await writeFile(join(syntheticEvidenceDirectory,path),text,{flag:'wx'});await writeFile(join(packageDirectory,'manifest.json'),input.manifestBytes,{flag:'wx'});
  const validation={...(input.historicalSettlementRetentionApproval?{historicalSettlementRetentionApproval:input.historicalSettlementRetentionApproval}:{}),allowSynthetic:true,historicalSalesHallApproval:input.historicalSalesHallApproval,historicalLineAmountEvidence:input.historicalLineAmountEvidence};
  const summary=await streamPreflight(packageDirectory,reportDirectory,{...validation,expectedManifestSha256:input.expectedManifestSha256});
  if(!summary.checks_passed||!summary.complete_package_validation)throw Error('SYNTHETIC_FRESH35_PREFLIGHT_REJECTED');
  const indexPath=join(reportDirectory,'index.sqlite');plan=await prepareStreamPlan(indexPath,summary,input.manifestBytes,{...validation,target,initialization_identity:input.admin,historicalSalesAdmission:options.historicalSalesAdmission});
  const native=await buildStreamProgram(plan,indexPath,summary,input.admin),storedSteps:StandardImportStep[]=[];
  for await(const step of native.steps)storedSteps.push(structuredClone(step));
  // Only this fixed small fixture is materialized; the production stream path
  // and its limits stay unchanged. Each iteration returns original keyed data.
  const steps={async *[Symbol.asyncIterator](){if(disposed)throw Error('SYNTHETIC_FRESH35_FIXTURE_DISPOSED');for(const step of storedSteps)yield structuredClone(step)}};
  return{packageKind:'SYNTHETIC' as const,sourceProfileSha256:input.sourceProfileSha256,targetSnapshotBasis:input.targetSnapshotBasis,program:{identity:native.identity,initialize:native.initialize,steps},identity:native.identity,expectedCounts:summary.counts,totals:plan.totals,stepCount:storedSteps.length,packageDirectory,reportDirectory,syntheticEvidenceDirectory,syntheticWarehouseRows:input.syntheticWarehouseRows,syntheticSkuId:input.syntheticSkuId,documentBatchId:native.identity.documentBatchId,fixtureBinding:{manifestSha256:input.expectedManifestSha256,planSha256:native.identity.planSha256,initializerSha256:requestHash(options.variant==='settlement-retention25'?{initialize:native.initialize,encodedScrypt}:native.initialize),stepsSha256:requestHash(storedSteps)},historicalSettlementRetentionApproval:input.historicalSettlementRetentionApproval,retainedSalesIds:input.retainedSalesIds,dispose};
 }catch(error){await dispose();throw error}
}
