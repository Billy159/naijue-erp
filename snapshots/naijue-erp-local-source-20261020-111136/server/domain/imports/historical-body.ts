import {Pool, types, type PoolClient, type QueryResultRow} from 'pg';
import {isAbsolute, resolve} from 'node:path';
import {lstatSync, readFileSync} from 'node:fs';
import {assertIsolatedTarget, databaseIdentifier as ident, readDatabaseConfig, type DatabaseConfig} from '../../database/config.js';
import {identityAssertionSql} from '../../database/identity.js';
import {passwordProvider} from '../../database/credentials.js';
import {databaseError} from '../../database/access-errors.js';
import {loadMigrations} from '../../database/migrations.js';
import {historyDigest, validateT31Inputs, type T31Inputs, type HistoryArtifact, type HistoryEvidence} from '../inventory/history-plan.js';
import {verifyHistoryArtifacts} from '../inventory/history-store.js';
import {parseBusinessDay, parseScaled} from '../transactions/decimal.js';
import {canonicalJson} from '../idempotency/index.js';
import {assertProductionAdmission, assertProductionSession, productionTarget, type ProductionAdmission} from '../../database/production-admission.js';
import type {DataSession,SqlValue} from '../../database/session.js';

type Row = Record<string, unknown>;
export class HistoricalBodyError extends Error {
  constructor(readonly code:string) {super(code); this.name='HistoricalBodyError';}
}
export interface HistoricalBodyTarget {
  readonly database:string; readonly environment:string; readonly instanceId:string; readonly clusterId:string;
  readonly host:string; readonly port:number; readonly maintenanceUser:string; readonly schemas:DatabaseConfig['schemas'];
}
export const historicalBodyTarget=(c:DatabaseConfig):HistoricalBodyTarget=>({database:c.database,environment:c.environment,
  instanceId:c.instanceId,clusterId:c.clusterId,host:c.host,port:c.port,maintenanceUser:c.roles.migrator,schemas:{...c.schemas}});
export interface HistoricalBodyInput {
  readonly schemaVersion:'T32-HISTORICAL-BODY-IMPORT-v1'; readonly dataClass:'SYNTHETIC_PROGRAM_ONLY'|'NON_FINAL';
  readonly batchId:string; readonly t32BatchId:string; readonly t30BatchId:string;
  readonly documentId:string; readonly sourceRevision:number; readonly bodySha256:string;
  readonly body:{readonly header:Row; readonly lines:readonly Row[]; readonly fundsRecords:readonly Row[]};
  readonly sourceIdentity:Row; readonly sourceDocument:Row; readonly sourceLines:readonly Row[]; readonly sourceSettlements:readonly Row[];
  readonly artifacts:readonly HistoryArtifact[];
  readonly provenance:{readonly archive:HistoryEvidence; readonly document:HistoryEvidence;
    readonly lines:readonly HistoryEvidence[]; readonly settlements:readonly HistoryEvidence[];
    readonly identity:HistoryEvidence; readonly selectedState:HistoryEvidence; readonly sourceBatchManifest:HistoryEvidence};
  readonly selectedState:T31Inputs; readonly effectIdentity:string|null;
  readonly importOperatorId:string; readonly productionAuthorized:false;
}
/** Source facts shared by distinct QA and formally admitted maintenance contracts. */
export type HistoricalBodyRecords = Omit<HistoricalBodyInput,'schemaVersion'|'dataClass'|'productionAuthorized'>;
export interface ProductionHistoricalBodyInput {
  readonly schemaVersion:'T32-PRODUCTION-HISTORICAL-BODY-v1';
  readonly dataClass:'REAL_USER_APPROVED_CURRENT_SOURCE'; readonly productionAuthorized:true;
  readonly approvalManifest:{readonly file:string;readonly sha256:string};
  readonly records:HistoricalBodyRecords;
}
export interface ProductionHistoricalBodyManifest {
  readonly schemaVersion:'T32-PRODUCTION-HISTORICAL-BODY-MANIFEST-v1';
  readonly dataClass:'REAL_USER_APPROVED_CURRENT_SOURCE'; readonly productionAuthorized:true;
  readonly target:ReturnType<typeof productionTarget>;
  readonly t30BatchId:string; readonly t32BatchId:string;
  readonly originalSourceSha256s:readonly string[];
  readonly documents:readonly {documentId:string;sourceRevision:number;bodySha256:string;recordsSha256:string}[];
}

const documentColumns=('batch_id source_dataset source_id target_document_id document_kind source_number business_date source_business_type_code source_business_type_name source_party_id source_department_id source_employee_id source_warehouse_id source_from_warehouse_id source_to_warehouse_id line_count quantity_total amount_total read_only audit_status audited_by audited_at created_by created_at runtime_audit_replay_allowed stock_effect source_sha256 source_record_sha256 source_payload').split(' ');
const lineColumns=('batch_id source_dataset source_id target_line_id source_document_id target_document_id line_kind product_id color_id size_id sku_id warehouse_id from_warehouse_id to_warehouse_id source_product_code source_product_name source_color_code source_color_name source_size_code source_size_name source_quantity stock_quantity_contribution amount unit_price unit stock_effect read_only source_sha256 source_record_sha256 source_lineage').split(' ');
const fundColumns=('batch_id source_id settlement_id source_document_id target_document_id payment_method_id fund_account_id source_payment_method_code source_payment_method_name source_fund_account_code source_fund_account_name amount direction source_business_date settled_at read_only runtime_funds_effect source_sha256 source_record_sha256 source_payload').split(' ');
const fail=(code:string):never=>{throw new HistoricalBodyError(code);};
const same=(a:unknown,b:unknown):boolean=>canonicalJson(a)===canonicalJson(b);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
function requireRow(row:Row,columns:readonly string[]):void {
  if(!row || !same(Object.keys(row).sort(),[...columns].sort()))fail('COMPLETE_SOURCE_ROW_REQUIRED');
}
function exactFields(source:Row,body:Row,fields:readonly string[]):void {
  for(const field of fields)if(!Object.hasOwn(body,field)||!same(source[field],body[field]))fail('SOURCE_BODY_FIELD_MISMATCH');
}
function decimal(value:unknown,scale:2|4):void {
  if(value===null)return;
  if(typeof value!=='string'||! /^-?\d+(?:\.\d+)?$/.test(value)||(value.split('.')[1]?.length??0)>scale)fail('SOURCE_DECIMAL_PRECISION_REQUIRED');
  parseScaled(value,scale,false);
}
/** Complete bound records; no truncation, money recomputation, or legacy save API. */
export function validateHistoricalBody(root:string,input:HistoricalBodyInput):void {
  if(input.schemaVersion!=='T32-HISTORICAL-BODY-IMPORT-v1'||!['SYNTHETIC_PROGRAM_ONLY','NON_FINAL'].includes(input.dataClass)
    ||input.productionAuthorized!==false)fail('HISTORICAL_IMPORT_CONTRACT_REQUIRED');
  validateHistoricalBodyRecords(root,input);
}
/** Complete originals only. This validator grants no database access or write authority. */
export function validateHistoricalBodyRecords(root:string,input:HistoricalBodyRecords):void {
  if(!input.batchId||input.batchId.length>128||!sha(input.t32BatchId)||!sha(input.t30BatchId)
    ||!uuid(input.documentId)||!Number.isSafeInteger(input.sourceRevision)||input.sourceRevision<1
    ||!input.importOperatorId||input.importOperatorId.length>128)fail('HISTORICAL_IMPORT_CONTRACT_REQUIRED');
  verifyHistoryArtifacts(root,input.artifacts);
  const bound=(ref:HistoryEvidence):unknown=>{
    if(!input.artifacts.some(a=>a.file===ref.file&&a.sha256===ref.sha256)||typeof ref.row!=='number'||!Number.isSafeInteger(ref.row)||ref.row<1)fail('UNBOUND_HISTORICAL_ROW');
    const parsed:unknown=JSON.parse(readFileSync(resolve(root,ref.file),'utf8'));
    return Array.isArray(parsed)?parsed[(ref.row as number)-1]:ref.row===1?parsed:fail('UNBOUND_HISTORICAL_ROW');
  };
  if(!same(bound(input.provenance.archive),{documentId:input.documentId,sourceRevision:input.sourceRevision,originalImported:true,body:input.body})
    ||!same(bound(input.provenance.document),input.sourceDocument)
    ||input.provenance.lines.length!==input.sourceLines.length||input.provenance.settlements.length!==input.sourceSettlements.length
    ||input.sourceLines.some((r,i)=>!same(bound(input.provenance.lines[i]!),r))
    ||input.sourceSettlements.some((r,i)=>!same(bound(input.provenance.settlements[i]!),r)))fail('ARCHIVE_OR_FULL_SOURCE_RECORD_NOT_BOUND');
  if(!sha(input.bodySha256)||historyDigest(input.body)!==input.bodySha256)fail('IMMUTABLE_BODY_HASH_MISMATCH');
  const {header,lines,fundsRecords}=input.body;
  if(!header||!Array.isArray(lines)||!lines.length||!Array.isArray(fundsRecords)
    ||lines.length!==input.sourceLines.length||fundsRecords.length!==input.sourceSettlements.length)fail('ALL_LINES_AND_SETTLEMENTS_REQUIRED');
  requireRow(input.sourceDocument,documentColumns);
  const document=input.sourceDocument;
  if(document['batch_id']!==input.batchId||document['target_document_id']!==input.documentId
    ||!['sale','transfer','purchase'].includes(String(document['document_kind']))||document['line_count']!==lines.length
    ||!sha(document['source_sha256'])||!sha(document['source_record_sha256'])
    ||typeof document['source_number']!=='string'||!document['source_number'])fail('SOURCE_DOCUMENT_IDENTITY_REQUIRED');
  exactFields(document,header,['source_number','business_date','source_warehouse_id','source_from_warehouse_id','source_to_warehouse_id',
    'source_party_id','source_department_id','source_employee_id','created_by','created_at','audited_by','audited_at','source_payload']);
  if(header['source_document_id']!==input.documentId||header['business_type']!==String(document['document_kind']).toUpperCase())fail('SOURCE_HEADER_TYPE_OR_ID_MISMATCH');
  parseBusinessDay(String(header['business_date']));decimal(document['quantity_total'],4);decimal(document['amount_total'],2);
  const identities=bound(input.provenance.identity) as {t32BatchId?:string;skuIds?:unknown[];warehouseIds?:unknown[]};
  if(identities.t32BatchId!==input.t32BatchId||!Array.isArray(identities.skuIds)||!Array.isArray(identities.warehouseIds))fail('APPROVED_IDENTITY_BINDING_REQUIRED');
  const skuIds=identities.skuIds as unknown[], warehouseIds=identities.warehouseIds as unknown[];
  const manifest=bound(input.provenance.sourceBatchManifest) as {batchId?:string;t30BatchId?:string;t32BatchId?:string;documentIds?:unknown[]};
  if(manifest.batchId!==input.batchId||manifest.t30BatchId!==input.t30BatchId||manifest.t32BatchId!==input.t32BatchId
    ||!manifest.documentIds?.includes(input.documentId))fail('SOURCE_BATCH_MANIFEST_REQUIRED');
  const seen=new Set<string>();
  for(const [i,row] of input.sourceLines.entries()) {
    requireRow(row,lineColumns);const body=lines[i]!;
    if(row['batch_id']!==input.batchId||row['target_document_id']!==input.documentId||row['source_document_id']!==document['source_id']
      ||row['line_kind']!==document['document_kind']||typeof row['source_id']!=='string'||seen.has(row['source_id'])
      ||!skuIds.includes(row['sku_id'])||!uuid(row['sku_id'])||!sha(row['source_sha256'])||!sha(row['source_record_sha256']))fail('SOURCE_LINE_IDENTITY_REQUIRED');
    seen.add(row['source_id'] as string);
    exactFields(row,body,['source_id','sku_id','warehouse_id','from_warehouse_id','to_warehouse_id','source_quantity',
      'stock_quantity_contribution','unit_price','amount','unit','source_product_code','source_product_name','source_color_name','source_size_name']);
    for(const field of ['warehouse_id','from_warehouse_id','to_warehouse_id'])if(row[field]!==null&&!warehouseIds.includes(row[field]))fail('UNADMITTED_SOURCE_WAREHOUSE');
    for(const field of ['source_quantity','stock_quantity_contribution','unit_price'])decimal(row[field],4);
    decimal(row['amount'],2);
  }
  seen.clear();
  for(const [i,row] of input.sourceSettlements.entries()) {
    requireRow(row,fundColumns);
    if(row['batch_id']!==input.batchId||row['target_document_id']!==input.documentId||row['source_document_id']!==document['source_id']
      ||typeof row['settlement_id']!=='string'||seen.has(row['settlement_id'])||!sha(row['source_sha256'])||!sha(row['source_record_sha256']))fail('SOURCE_SETTLEMENT_IDENTITY_REQUIRED');
    seen.add(row['settlement_id'] as string);decimal(row['amount'],2);
    exactFields(row,fundsRecords[i]!,['source_id','settlement_id','payment_method_id','fund_account_id',
      'source_payment_method_code','source_payment_method_name','source_fund_account_code','source_fund_account_name',
      'amount','direction','settled_at','source_payload']);
  }
  if(!same(bound(input.provenance.selectedState),input.selectedState))fail('SELECTED_STATE_NOT_BOUND');
  validateT31Inputs(input.selectedState,input.selectedState.stateDecision.cutoff,input.artifacts,4);
  if(input.selectedState.family!==String(document['document_kind']).toUpperCase()
    ||(input.selectedState.stateDecision.stateAtCutoff==='EFFECTIVE')!==(input.effectIdentity!==null)
    ||input.effectIdentity!==null&&!input.effectIdentity.startsWith('baseline:'))fail('SELECTED_RUNTIME_STATE_REQUIRED');
  const actual=new Map<string,bigint>(), selected=new Map<string,bigint>();
  const add=(map:Map<string,bigint>,warehouse:unknown,sku:unknown,unit:unknown,q:bigint):void=>{
    const key=canonicalJson([warehouse,sku,unit]);map.set(key,(map.get(key)??0n)+q);
  };
  for(const row of input.sourceLines){
    if(document['document_kind']==='transfer'){
      add(actual,row['from_warehouse_id'],row['sku_id'],row['unit'],-parseScaled(row['source_quantity'],4,false));
      add(actual,row['to_warehouse_id'],row['sku_id'],row['unit'],parseScaled(row['source_quantity'],4,false));
    } else add(actual,row['warehouse_id'],row['sku_id'],row['unit'],parseScaled(row['stock_quantity_contribution'],4,false));
  }
  for(const leg of input.selectedState.legs)add(selected,leg.warehouseId,leg.originalSkuId,leg.measurementUnit,parseScaled(leg.candidateQuantity,4,false));
  const totals=(map:Map<string,bigint>)=>[...map].filter(([,q])=>q!==0n).map(([k,q])=>[k,q.toString()]).sort(([a],[b])=>a!.localeCompare(b!));
  if(!same(totals(actual),totals(selected)))fail('SELECTED_SOURCE_CONTRIBUTION_MISMATCH');
}

function validatedConfig(c:DatabaseConfig):DatabaseConfig {
  const config=explicitConfig(c);
  assertIsolatedTarget(config);
  if(!isAbsolute(config.host))fail('PRIVATE_LOCAL_HISTORICAL_IMPORT_TARGET_REQUIRED');
  const socket=lstatSync(config.host);
  if(!socket.isDirectory()||socket.isSymbolicLink()||(socket.mode&0o077)||process.getuid&&socket.uid!==process.getuid())fail('PRIVATE_LOCAL_HISTORICAL_IMPORT_TARGET_REQUIRED');
  return config;
}
function explicitConfig(c:DatabaseConfig):DatabaseConfig {
  const config=readDatabaseConfig({APP_ENV:c.environment,POSTGRES_HOST:c.host,POSTGRES_PORT:String(c.port),POSTGRES_DB:c.database,
    POSTGRES_USER:c.user,POSTGRES_ROLE_PREFIX:c.roles.app.replace(/_app$/,''),POSTGRES_INSTANCE_ID:c.instanceId,POSTGRES_CLUSTER_ID:c.clusterId,
    POSTGRES_SOURCE_SCHEMA:c.schemas.source,POSTGRES_RUNTIME_SCHEMA:c.schemas.runtime,POSTGRES_AUTH_SCHEMA:c.schemas.auth,
    POSTGRES_CONTROL_SCHEMA:c.schemas.control,POSTGRES_SSLMODE:c.sslmode,...(c.passfile?{POSTGRES_PASSFILE:c.passfile}:{})});
  if(!same(config.roles,c.roles))fail('MAINTENANCE_ROLE_CONFIG_MISMATCH');
  return config;
}
/** A signed batch SHA authorizes only the listed exact original records, never a QA packet. */
export function validateProductionHistoricalBody(c:DatabaseConfig,admission:ProductionAdmission,root:string,input:ProductionHistoricalBodyInput):void {
  const config=explicitConfig(c);
  if(config.environment!=='production')fail('EXPLICIT_PRODUCTION_HISTORICAL_TARGET_REQUIRED');
  if(!input||input.schemaVersion!=='T32-PRODUCTION-HISTORICAL-BODY-v1'
    ||input.dataClass!=='REAL_USER_APPROVED_CURRENT_SOURCE'||input.productionAuthorized!==true
    ||!input.approvalManifest||!sha(input.approvalManifest.sha256))fail('FORMAL_HISTORICAL_SOURCE_CONTRACT_REQUIRED');
  // Opaque T09 capability includes actual G5/T48/T49 and the exact signed batch source SHA.
  assertProductionAdmission(config,admission,'historical-import',input.approvalManifest.sha256);
  verifyHistoryArtifacts(root,[{...input.approvalManifest,role:'HISTORY_SOURCE'}]);
  const manifest=JSON.parse(readFileSync(resolve(root,input.approvalManifest.file),'utf8')) as ProductionHistoricalBodyManifest;
  const records=input.records;
  if(!records||['schemaVersion','dataClass','productionAuthorized'].some(k=>Object.hasOwn(records,k)))fail('QA_BODY_PACKET_NOT_FORMAL_SOURCE');
  if(manifest.schemaVersion!=='T32-PRODUCTION-HISTORICAL-BODY-MANIFEST-v1'
    ||manifest.dataClass!=='REAL_USER_APPROVED_CURRENT_SOURCE'||manifest.productionAuthorized!==true
    ||!same(manifest.target,productionTarget(config)))fail('FORMAL_HISTORICAL_MANIFEST_TARGET_MISMATCH');
  if(manifest.t30BatchId!==records.t30BatchId||manifest.t32BatchId!==records.t32BatchId
    ||!Array.isArray(manifest.originalSourceSha256s)||!manifest.originalSourceSha256s.length
    ||manifest.originalSourceSha256s.some(v=>!sha(v))||!Array.isArray(manifest.documents))fail('FORMAL_HISTORICAL_BATCH_BINDING_REQUIRED');
  const matches=manifest.documents.filter(d=>d.documentId===records.documentId);
  if(matches.length!==1||matches[0]!.sourceRevision!==records.sourceRevision||matches[0]!.bodySha256!==records.bodySha256
    ||matches[0]!.recordsSha256!==historyDigest(records))fail('FORMAL_ORIGINAL_REVISION_NOT_APPROVED');
  const rows=[records.sourceDocument,...records.sourceLines,...records.sourceSettlements];
  const refs=[records.provenance.archive,records.provenance.document,...records.provenance.lines,
    ...records.provenance.settlements,records.provenance.identity,records.provenance.selectedState,records.provenance.sourceBatchManifest];
  if(records.sourceIdentity['dataClass']==='SYNTHETIC_PROGRAM_ONLY'||records.sourceIdentity['synthetic']===true
    ||refs.some(ref=>ref.kind==='SYNTHETIC_PROGRAM_ONLY')
    ||rows.some(row=>!manifest.originalSourceSha256s.includes(String(row['source_sha256']))
      ||/^SYNTHETIC(?:[-_]|$)/i.test(String(row['source_dataset']??''))
      ||(row['source_payload'] as Row|null)?.['synthetic']===true))fail('SYNTHETIC_BODY_NOT_FORMAL_BUSINESS_SOURCE');
  validateHistoricalBodyRecords(root,records);
}
async function insert(client:PoolClient,schema:string,table:string,columns:readonly string[],row:Row):Promise<void> {
  // Columns are compiled constants. User values travel only through extended-protocol parameters.
  const statement={text:`INSERT INTO ${schema}.${ident(table)}(${columns.map(ident).join(',')}) VALUES(${columns.map((_,i)=>'$'+(i+1)).join(',')})`,
    values:columns.map(k=>row[k]),queryMode:'extended'};
  await client.query(statement);
}
const normalized=(value:unknown,key:string):unknown=>{
  if(value instanceof Date)return key==='business_date'||key==='source_business_date'?value.toISOString().slice(0,10):value.toISOString();
  if(value!==null&&['quantity_total','source_quantity','stock_quantity_contribution','unit_price','amount_total','amount'].includes(key))
    return parseScaled(String(value),key==='amount'||key==='amount_total'?2:4,false).toString();
  return value;
};
function storedMatches(actual:Row,expected:Row,columns:readonly string[]):boolean {
  return columns.every(k=>same(normalized(actual[k],k),normalized(expected[k],k)));
}
export interface HistoricalBodyReceipt {
  readonly schemaVersion:'T32-HISTORICAL-BODY-RECEIPT-v1'; readonly applied:boolean; readonly writes:number;
  readonly inputSha256:string; readonly target:HistoricalBodyTarget;
  readonly documentBinding:{documentId:string;revision:number;bodySha256:string;effectIdentity:string|null};
  readonly selectedT31EventId:string; readonly lineCount:number; readonly settlementCount:number;
  readonly sourceRevision:number; readonly sourceRowsReadBack:boolean;
}

/** Maintenance-only one-document atomic import. No HTTP route, schema creation, or posting. */
export async function importHistoricalBody(c:DatabaseConfig,target:HistoricalBodyTarget,artifactRoot:string,raw:HistoricalBodyInput):Promise<HistoricalBodyReceipt> {
  const config=validatedConfig(c), input=structuredClone(raw);
  if(!same(historicalBodyTarget(config),target))fail('DECLARED_HISTORICAL_TARGET_MISMATCH');
  validateHistoricalBody(artifactRoot,input);
  return importBoundHistoricalBody(config,target,input,historyDigest(input),input.schemaVersion);
}
export interface ProductionHistoricalBodyReceipt extends Omit<HistoricalBodyReceipt,'schemaVersion'> {
  readonly schemaVersion:'T32-PRODUCTION-HISTORICAL-BODY-RECEIPT-v1';
  readonly approvedManifestSha256:string; readonly exactProductionTarget:ReturnType<typeof productionTarget>;
}
/** Dedicated formal maintenance operation. A QA contract never reaches this entry. */
export async function importProductionHistoricalBody(c:DatabaseConfig,admission:ProductionAdmission,artifactRoot:string,raw:ProductionHistoricalBodyInput):Promise<ProductionHistoricalBodyReceipt> {
  const config=explicitConfig(c),input=structuredClone(raw);
  validateProductionHistoricalBody(config,admission,artifactRoot,input);
  const receipt=await importBoundHistoricalBody(config,historicalBodyTarget(config),input.records,historyDigest(input),input.schemaVersion,
    {admission,sourceSha256:input.approvalManifest.sha256});
  return {...receipt,schemaVersion:'T32-PRODUCTION-HISTORICAL-BODY-RECEIPT-v1',
    approvedManifestSha256:input.approvalManifest.sha256,exactProductionTarget:productionTarget(config)};
}
async function importBoundHistoricalBody(config:DatabaseConfig,target:HistoricalBodyTarget,input:HistoricalBodyRecords,inputSha256:string,
  schemaVersion:string,formal?:{admission:ProductionAdmission;sourceSha256:string}):Promise<HistoricalBodyReceipt> {
  if(formal)assertProductionAdmission(config,formal.admission,'historical-import',formal.sourceSha256);
  else assertIsolatedTarget(config);
  const expectedVersions=loadMigrations(config).map((m,i)=>({position:i+1,id:m.id,checksum:m.checksum}));
  const pool=new Pool({host:config.host,port:config.port,database:config.database,user:config.roles.migrator,
    password:passwordProvider({...config,user:config.roles.migrator}),
    ssl:formal&&config.sslmode==='verify-full'?{rejectUnauthorized:true}:false,sslnegotiation:'postgres',max:1,connectionTimeoutMillis:5000,
    statement_timeout:15000,lock_timeout:5000,idle_in_transaction_session_timeout:15000,
    // PostgreSQL DATE is a calendar string, not an instant in the Node process timezone.
    types:{getTypeParser:(oid:number,format:'text'|'binary'='text')=>oid===1082&&format==='text'?(value:string)=>value:types.getTypeParser(oid,format)},
    options:'-c search_path=pg_catalog -c timezone=UTC',application_name:'naijue-t32-historical-body-import'});
  const s=ident(config.schemas.source),r=ident(config.schemas.runtime),control=ident(config.schemas.control);
  const doc=input.sourceDocument, effective=input.selectedState.stateDecision.stateAtCutoff==='EFFECTIVE';
  const status=effective?'APPROVED':input.selectedState.stateDecision.stateAtCutoff==='VOID'?'DELETED':'UNAUDITED';
  let client:PoolClient|undefined;
  try {
    client=await pool.connect();await client.query('BEGIN');
    await client.query(identityAssertionSql(config,'migrator'));
    const environment=(await client.query<{listen:string;versions:unknown}>(`SELECT current_setting('listen_addresses') listen,
      (SELECT jsonb_agg(jsonb_build_object('position',position,'id',id,'checksum',checksum) ORDER BY position) FROM ${control}.schema_version) versions`)).rows[0];
    if(!environment||(!formal&&environment.listen!=='')||!same(environment.versions,expectedVersions))fail('HISTORICAL_TARGET_NOT_READY');
    // Share the existing document lock namespace with all official consumers.
    for(const key of ['0:idempotency:historical-body:'+input.batchId,'1:document:'+input.documentId])
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[config.instanceId+':'+key]);
    if(formal){
      // The shared checker reads the live maintenance identity on this same connection.
      const checked:Pick<DataSession,'query'>={async query<Row extends QueryResultRow>(text:string,values:readonly SqlValue[]=[]) {
        const statement={text,values:[...values],queryMode:'extended'};return client!.query<Row>(statement);
      }};
      await assertProductionSession(checked,config,formal.admission,'historical-import',formal.sourceSha256,'migrator');
    }
    await client.query(`SET LOCAL ROLE ${ident(config.roles.runtime)}`);
    const operator=(await client.query(`SELECT id FROM ${r}.operator WHERE id=$1 AND enabled AND role='ADMIN'`,[input.importOperatorId])).rows[0];
    if(!operator)fail('EXPLICIT_MAINTENANCE_OPERATOR_REQUIRED');
    for(const line of input.sourceLines) {
      const known=(await client.query<{sku:boolean;warehouse:boolean}>(`SELECT EXISTS(SELECT 1 FROM ${s}.variant WHERE id=$1::uuid AND product_id=$3::uuid UNION ALL SELECT 1 FROM ${r}.variant_overlay WHERE id=$1::uuid AND product_id=$3::uuid) sku,
        NOT EXISTS(SELECT x FROM unnest($2::uuid[]) x WHERE NOT EXISTS(SELECT 1 FROM ${s}.warehouse w WHERE w.id=x UNION ALL SELECT 1 FROM ${r}.master_reference_overlay w WHERE w.kind='warehouses' AND w.id=x)) warehouse`,
        [line['sku_id'],['warehouse_id','from_warehouse_id','to_warehouse_id'].map(k=>line[k]).filter(v=>v!==null),line['product_id']])).rows[0];
      if(!known?.sku||!known.warehouse)fail('ACTUAL_TARGET_SOURCE_IDENTITIES_MISSING');
    }
    const prior=(await client.query<Row>(`SELECT d.*,v.body,v.actor_id,v.original_imported FROM ${r}.document d LEFT JOIN ${r}.revision v ON v.document_id=d.id AND v.revision=$2 WHERE d.id=$1::uuid`,[input.documentId,input.sourceRevision])).rows[0];
    const sourceIdentity={...input.sourceIdentity,historicalBodyImport:{inputSha256,batchId:input.batchId,t32BatchId:input.t32BatchId,
      t30BatchId:input.t30BatchId,target,sourceRevision:input.sourceRevision,bodySha256:input.bodySha256,
      provenance:input.provenance,importOperatorId:input.importOperatorId,
      ...(formal?{approvedManifestSha256:formal.sourceSha256,exactProductionTarget:productionTarget(config)}:{})}};
    let writes=0;
    if(prior) {
      const origin=prior['source_identity'] as {historicalBodyImport?:{inputSha256:string;target:unknown}};
      if(origin?.historicalBodyImport?.inputSha256!==inputSha256||!same(origin.historicalBodyImport.target,target)
        ||prior['current_revision']!==input.sourceRevision||prior['version']!==1||!prior['original_imported']
        ||historyDigest(prior['body'])!==input.bodySha256||prior['actor_id']!==input.body.header['created_by']
        ||prior['status']!==status||prior['active_effect_identity']!==input.effectIdentity)fail('HISTORICAL_DOCUMENT_OR_VERSION_ALREADY_BOUND');
    } else {
      await client.query('RESET ROLE');await client.query(`SET LOCAL ROLE ${ident(config.roles.source)}`);
      const priorBatch=(await client.query<Row>(`SELECT * FROM ${s}.tplus_import_run WHERE batch_id=$1`,[input.batchId])).rows[0];
      if(priorBatch&&(priorBatch['status']!=='COMMITTED'||priorBatch['manifest_sha256']!==input.provenance.sourceBatchManifest.sha256
        ||priorBatch['database_name']!==config.database||priorBatch['schema_name']!==config.schemas.source))fail('HISTORICAL_BATCH_ALREADY_BOUND');
      const counts={schemaVersion,inputSha256,t32BatchId:input.t32BatchId,t30BatchId:input.t30BatchId,
        documentId:input.documentId,sourceRevision:input.sourceRevision,bodySha256:input.bodySha256,provenance:input.provenance};
      if(!priorBatch){await client.query(`INSERT INTO ${s}.tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,committed_at,git_sha,workspace_state_sha256,success_count,counts)
        VALUES($1,$2,$3,$4,$5,$6,$1,'T32-HISTORICAL-BODY-v1','COMMITTED',transaction_timestamp(),$7,$8,$9,$10::jsonb)`,
        [input.batchId,'EXPLICIT_SEALED_HISTORICAL_BODY',config.schemas.source,config.database,input.provenance.sourceBatchManifest.file,input.provenance.sourceBatchManifest.sha256,
          String(input.sourceIdentity['gitSha']??'UNKNOWN'),String(input.sourceIdentity['workspaceStateSha256']??'UNKNOWN'),
          1+input.sourceLines.length+input.sourceSettlements.length,JSON.stringify(counts)]);writes++;}
      for(const [table,columns,rows] of [['tplus_history_document',documentColumns,[doc]],['tplus_history_line',lineColumns,input.sourceLines],
        ['tplus_sales_fund',fundColumns,input.sourceSettlements]] as const)for(const row of rows){
        const old=(await client.query<Row>(`SELECT * FROM ${s}.${ident(table)} WHERE batch_id=$1 AND source_id=$2${table==='tplus_sales_fund'?'':' AND source_dataset=$3'}`,
          table==='tplus_sales_fund'?[input.batchId,row['source_id']]:[input.batchId,row['source_id'],row['source_dataset']])).rows[0];
        if(old){if(!storedMatches(old,row,columns))fail('IMMUTABLE_EXISTING_SOURCE_ROW_CHANGED');}
        else{await insert(client,s,table,columns,row);writes++;}
      }
      await client.query('RESET ROLE');await client.query(`SET LOCAL ROLE ${ident(config.roles.runtime)}`);
      await client.query(`INSERT INTO ${r}.document(id,document_type,number,source_identity,status,baseline_was_included,current_effect_active,
        active_effect_identity,active_effect_revision,current_revision,version,business_day,original_auditor,original_audited_at)
        VALUES($1::uuid,$2,$3,$4::jsonb,$5,false,$6,$7,$8,$9,1,$10::date,$11,$12::timestamptz)`,
        [input.documentId,String(doc['document_kind']).toUpperCase(),doc['source_number'],JSON.stringify(sourceIdentity),status,effective,
          input.effectIdentity,effective?input.sourceRevision:null,input.sourceRevision,doc['business_date'],doc['audited_by'],doc['audited_at']]);writes++;
      await client.query(`INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id) VALUES($1::uuid,$2,true,$3::jsonb,$4)`,
        [input.documentId,input.sourceRevision,JSON.stringify(input.body),doc['created_by']]);writes++;
    }
    const actualDocument=(await client.query<Row>(`SELECT * FROM ${s}.tplus_history_document WHERE batch_id=$1 AND source_dataset=$2 AND source_id=$3`,[input.batchId,doc['source_dataset'],doc['source_id']])).rows[0];
    const actualLines=(await client.query<Row>(`SELECT * FROM ${s}.tplus_history_line WHERE batch_id=$1 AND target_document_id=$2::uuid`,[input.batchId,input.documentId])).rows;
    const actualFunds=(await client.query<Row>(`SELECT * FROM ${s}.tplus_sales_fund WHERE batch_id=$1 AND target_document_id=$2::uuid`,[input.batchId,input.documentId])).rows;
    if(!actualDocument||!storedMatches(actualDocument,doc,documentColumns))fail('FULL_SOURCE_HEADER_READBACK_MISMATCH');
    if(actualLines.length!==input.sourceLines.length||input.sourceLines.some(row=>!actualLines.some(a=>storedMatches(a,row,lineColumns))))fail('FULL_SOURCE_LINES_READBACK_MISMATCH');
    if(actualFunds.length!==input.sourceSettlements.length||input.sourceSettlements.some(row=>!actualFunds.some(a=>storedMatches(a,row,fundColumns))))fail('FULL_SOURCE_SETTLEMENTS_READBACK_MISMATCH');
    const revision=(await client.query<Row>(`SELECT body,original_imported,actor_id FROM ${r}.revision WHERE document_id=$1::uuid AND revision=$2`,[input.documentId,input.sourceRevision])).rows[0];
    if(!revision?.['original_imported']||historyDigest(revision['body'])!==input.bodySha256||revision['actor_id']!==doc['created_by'])fail('IMMUTABLE_RUNTIME_BODY_READBACK_MISMATCH');
    if(formal)assertProductionAdmission(config,formal.admission,'historical-import',formal.sourceSha256);
    await client.query('COMMIT');
    return {schemaVersion:'T32-HISTORICAL-BODY-RECEIPT-v1',applied:writes>0,writes,inputSha256,target,
      documentBinding:{documentId:input.documentId,revision:input.sourceRevision,bodySha256:input.bodySha256,effectIdentity:input.effectIdentity},
      selectedT31EventId:input.selectedState.eventId,lineCount:input.sourceLines.length,settlementCount:input.sourceSettlements.length,
      sourceRevision:input.sourceRevision,sourceRowsReadBack:true};
  } catch(error) {if(client)await client.query('ROLLBACK').catch(()=>undefined);
    if(error instanceof HistoricalBodyError)throw error;throw databaseError(error);}
  finally {client?.release();await pool.end();}
}
