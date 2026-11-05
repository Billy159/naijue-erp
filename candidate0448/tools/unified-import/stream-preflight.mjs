import {occurrenceStorage,closeOccurrenceEvidence} from './source-occurrence-reader.mjs';
import {writeOccurrenceReport} from './source-occurrence-report.mjs';
import {validateHistoricalSalesHallEvidence,historicalSalesHallApprovalMatchesSource,historicalSalesHallApprovalWire} from '../../packages/application/src/unified-historical-sales-hall-evidence.ts';
import {reconcileSourceOccurrenceEvidence} from '../../packages/application/src/unified-import-source-reconciliation.ts';
import {currentEffectiveAlignmentDescriptor} from '../../packages/application/src/unified-current-effective-alignment.ts';
import {historicalLineAmountEvidenceMatchesSource,historicalLineAmountEvidenceWire} from '../../packages/application/src/unified-historical-line-amount-evidence.ts';
import {explicitZeroApproved,explicitZeroApprovalDescriptor} from '../../packages/application/src/unified-explicit-zero-approval.ts';
import {historicalStaffHallApprovalWire,historicalStaffHallApprovalMatchesSource} from '../../packages/application/src/unified-historical-staff-hall-approval.ts';
import {validateZeroAmountArchive} from '../../packages/application/src/unified-zero-amount-archive.ts';
import {isRetainedHistoricalSale,isRetainedHistoricalSalesDocument} from '../../packages/application/src/unified-import-historical-sales.ts';
import {createMetadataChecker} from './stream-package-metadata.mjs';
import {initializeRelationIndex,validateStreamRelations} from './stream-relations.mjs';
import {constants} from 'node:fs';
import {open,lstat,realpath,mkdir,writeFile,opendir} from 'node:fs/promises';
import {resolve,join,sep,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {TABLE_SCHEMAS,SCHEMA_DECLARATIONS_SHA256,NUMERIC_FIT_TABLE_SCHEMAS,NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256,STAFF_DEPARTURE_TABLE_SCHEMAS,STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256,isHistoricalSalesHallSourceProfile,historicalSalesHallEvidenceMatchesProfile,isHistoricalSalesSourceProfile,HISTORICAL_SALES_SOURCE_TABLE_SCHEMAS,UNIFIED_PACKAGE_VERSION,safePackagePath,findCredentialPath,parseStrictJson,decodeUtf8,sha256,validateStandardImportField} from '../../packages/application/src/unified-import-contract.ts';
const MAX_LINE=1024*1024,MAX_TOTAL=8*1024**3,MAX_ROWS=5_000_000,MAX_ISSUES=100_000;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x);
/** Offline standard JSONL intake only. SQLite is a private scratch index, not a business database.
 * No target connection, credentials, planning or execution. Offline reconciliation uses the original standard contract; execution admission remains separate. */
export async function streamPreflight(directory,reportDirectory,{expectedManifestSha256,allowSynthetic=false,historicalStaffHallApproval,explicitZeroApproval,historicalLineAmountEvidence,currentEffectiveAlignmentEvidence,sourceOccurrenceEvidence,historicalSalesHallApproval}={}) {
 const started=performance.now(),timings={};let readMs=0,parseMs=0;
 const root=await realpath(directory), requestedReport=resolve(reportDirectory);
 const report=join(await realpath(dirname(requestedReport)),basename(requestedReport));
 if(report===root||report.startsWith(root+sep)||root.startsWith(report+sep))throw new Error('REPORT_MUST_BE_SEPARATE');
 if(!/^[a-f0-9]{64}$/.test(expectedManifestSha256??''))throw new Error('MANIFEST_PIN_REQUIRED');
 await mkdir(report,{mode:0o700}); // exclusive: never overwrite prior evidence
 const issueFile=await open(join(report,'issues.jsonl'),'wx',0o600);
 const differenceFile=await open(join(report,'historical-line-amount-differences.jsonl'),'wx',0o600);let differenceCount=0,differenceBytes=0;const differenceDigest=createHash('sha256');
 const indexFile=await open(join(report,'index.sqlite'),'wx',0o600);await indexFile.close();
 const db=new DatabaseSync(join(report,'index.sqlite'));
 db.exec(`PRAGMA journal_mode=DELETE; PRAGMA cache_size=-4096; PRAGMA temp_store=FILE;
 CREATE TABLE registry_rows(ordinal INTEGER PRIMARY KEY,file TEXT,line INTEGER,raw_json TEXT NOT NULL);
 CREATE TABLE identities(entity TEXT,key TEXT,id TEXT,file TEXT,line INTEGER,identity_basis TEXT NOT NULL,PRIMARY KEY(entity,key),UNIQUE(id));
 CREATE TABLE identity_keys(entity TEXT,key TEXT,id TEXT,PRIMARY KEY(entity,key));
 CREATE TABLE rows_seen(entity TEXT,key TEXT,id TEXT,file TEXT,line INTEGER,PRIMARY KEY(entity,key),UNIQUE(entity,id));
 CREATE TABLE refs(entity TEXT,id TEXT,file TEXT,line INTEGER,field TEXT);
 CREATE TABLE positions(entity TEXT,parent TEXT,position INTEGER,PRIMARY KEY(entity,parent,position));
 CREATE INDEX refs_target ON refs(entity,id);
 CREATE TABLE transfer_parents(id TEXT PRIMARY KEY,file TEXT,line INTEGER);
 CREATE TABLE transfer_children(parent TEXT,file TEXT,line INTEGER);
 CREATE INDEX child_parent ON transfer_children(parent);`);
 initializeRelationIndex(db);
 db.exec("ALTER TABLE facts ADD COLUMN explicit_zero_evidence TEXT; ALTER TABLE facts ADD COLUMN zero_amount_archive TEXT; ALTER TABLE facts ADD COLUMN historical_hall_evidence TEXT");
 const registryRow=db.prepare('INSERT INTO registry_rows VALUES(?,?,?,?)');
 const registryLookup=db.prepare('SELECT id FROM identity_keys WHERE entity=? AND key=?');
 const insertFact=db.prepare('INSERT INTO facts(entity,id,source_key,file,line,fields,source_refs,zero_amount_archive,explicit_zero_evidence,historical_hall_evidence) VALUES(?,?,?,?,?,?,?,?,?,?)');
 const identity=db.prepare('INSERT INTO identities VALUES(?,?,?,?,?,?)'), identityKey=db.prepare('INSERT INTO identity_keys VALUES(?,?,?)'), seen=db.prepare('INSERT INTO rows_seen VALUES(?,?,?,?,?)'),ref=db.prepare('INSERT INTO refs VALUES(?,?,?,?,?)'),position=db.prepare('INSERT INTO positions VALUES(?,?,?)');
 let issueCount=0,total=0,rows=0,peakRss=process.memoryUsage().rss;
 const counts={};let finished=false,dbClosed=false;let location={file:'manifest.json',row:null,field:'$'};
 const issue=async(code,file,row,field)=>{if(++issueCount>MAX_ISSUES)throw new Error('ISSUE_LIMIT');await issueFile.write(JSON.stringify({code,file,row,field})+'\n');};
 async function fileHandle(path){
  if(!safePackagePath(path))throw new Error('UNSAFE_PATH');let p=root, expected;
  for(const c of path.split('/')){p=join(p,c);expected=await lstat(p);if(expected.isSymbolicLink())throw new Error('SYMLINK_FORBIDDEN');}
  if(!(await realpath(p)).startsWith(root+sep))throw new Error('UNSAFE_PATH');
  const h=await open(p,constants.O_RDONLY|constants.O_NOFOLLOW);const st=await h.stat();if(!st.isFile()){await h.close();throw new Error('NOT_REGULAR');}if(st.dev!==expected.dev||st.ino!==expected.ino){await h.close();throw new Error('FILE_CHANGED');}return {h,st};
 }
 async function readBounded(path,limit){location={file:path,row:null,field:'$'};const {h,st}=await fileHandle(path);try{if(st.size>limit)throw new Error('METADATA_SIZE_LIMIT');const buffer=Buffer.alloc(st.size+1);let offset=0;while(offset<buffer.length){const {bytesRead}=await h.read(buffer,offset,buffer.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;total+=bytesRead;if(total>MAX_TOTAL)throw new Error('TOTAL_BYTE_LIMIT');}const after=await h.stat();if(offset!==st.size||after.size!==st.size||after.mtimeMs!==st.mtimeMs||after.ctimeMs!==st.ctimeMs)throw new Error('FILE_CHANGED');return buffer.subarray(0,offset);}finally{await h.close();}}
 async function scanBinary(pin){location={file:pin.relative_path,row:null,field:'$'};const {h,st}=await fileHandle(pin.relative_path);let bytes=0,head=Buffer.alloc(0);const hash=createHash('sha256');try{if(st.size>8388608)throw new Error('ASSET_SIZE_LIMIT');const b=Buffer.alloc(65536);for(;;){const {bytesRead}=await h.read(b,0,b.length,null);if(!bytesRead)break;const chunk=b.subarray(0,bytesRead);if(!bytes)head=Buffer.from(chunk.subarray(0,12));bytes+=bytesRead;if(bytes>8388608)throw new Error('ASSET_SIZE_LIMIT');total+=bytesRead;if(total>MAX_TOTAL)throw new Error('TOTAL_BYTE_LIMIT');hash.update(chunk);}const after=await h.stat();if(bytes!==st.size||after.size!==st.size||after.mtimeMs!==st.mtimeMs||after.ctimeMs!==st.ctimeMs)throw new Error('FILE_CHANGED');return {bytes,sha256:hash.digest('hex'),head};}finally{await h.close();}}

 async function scan(pin,consume){
  location={file:pin.relative_path,row:null,field:'$'};
  const {h,st}=await fileHandle(pin.relative_path);let line=0,bytes=0,pending=Buffer.alloc(0);const digest=createHash('sha256');
  try{const buffer=Buffer.alloc(65536);for(;;){const readStarted=performance.now();const {bytesRead}=await h.read(buffer,0,buffer.length,null);readMs+=performance.now()-readStarted;if(!bytesRead)break;bytes+=bytesRead;total+=bytesRead;if(total>MAX_TOTAL)throw new Error('TOTAL_BYTE_LIMIT');const chunk=buffer.subarray(0,bytesRead);digest.update(chunk);pending=Buffer.concat([pending,chunk]);let start=0,end;
    while((end=pending.indexOf(10,start))!==-1){line++;location={file:pin.relative_path,row:line,field:'$'};if(++rows>MAX_ROWS)throw new Error('ROW_LIMIT');const raw=pending.subarray(start,end);if(raw.length>MAX_LINE)throw new Error('LINE_BYTE_LIMIT');let value;const parseStarted=performance.now();try{const text=decodeUtf8(raw);if(!text.trim())throw new Error();value=parseStrictJson(text);parseMs+=performance.now()-parseStarted;if(findCredentialPath(value)){await issue('FORBIDDEN_CREDENTIAL',pin.relative_path,line,'$');start=end+1;continue;}}catch{await issue('INVALID_JSONL',pin.relative_path,line,'$');start=end+1;continue;}await consume(value,pin.relative_path,line);start=end+1;}
    pending=Buffer.from(pending.subarray(start));if(pending.length>MAX_LINE){location={file:pin.relative_path,row:line+1,field:'$'};throw new Error('LINE_BYTE_LIMIT');}peakRss=Math.max(peakRss,process.memoryUsage().rss);
   }
   if(pending.length)await issue('MISSING_FINAL_LF',pin.relative_path,line+1,'$');
   const after=await h.stat();if(after.size!==st.size||after.mtimeMs!==st.mtimeMs||after.ctimeMs!==st.ctimeMs)throw new Error('FILE_CHANGED');
   if(bytes!==pin.bytes||digest.digest('hex')!==pin.sha256||line!==pin.row_count)await issue('FILE_PIN_MISMATCH',pin.relative_path,null,'$');return line;
  }finally{await h.close();}
 }
 try{
  const manifestBytes=await readBounded('manifest.json',2*1024*1024);if(sha256(manifestBytes)!==expectedManifestSha256)throw new Error('MANIFEST_PIN_MISMATCH');const manifest=parseStrictJson(decodeUtf8(manifestBytes));if(findCredentialPath(manifest))throw new Error('FORBIDDEN_CREDENTIAL');
  if(!object(manifest)||manifest.format_version!==UNIFIED_PACKAGE_VERSION||!['READY','CLEANED'].includes(manifest.stage)||!Array.isArray(manifest.files)||manifest.files.length>128||!object(manifest.identity_registry))throw new Error('INVALID_MANIFEST');
  const profile=manifest.schema_contract?.source_declarations_sha256;
  if(profile!==undefined&&![SCHEMA_DECLARATIONS_SHA256,NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256,STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256].includes(profile))throw new Error('UNKNOWN_SCHEMA_PROFILE');
  const schemas=isHistoricalSalesSourceProfile(profile)?HISTORICAL_SALES_SOURCE_TABLE_SCHEMAS:profile===STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256?STAFF_DEPARTURE_TABLE_SCHEMAS:profile===NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256?NUMERIC_FIT_TABLE_SCHEMAS:TABLE_SCHEMAS;
  const paths=new Set(['manifest.json']),tables=new Set();
  for(const pin of [manifest.identity_registry,...manifest.files]){if(!object(pin)||!safePackagePath(pin.relative_path)||paths.has(pin.relative_path)||!Number.isSafeInteger(pin.bytes)||pin.bytes<0||!Number.isSafeInteger(pin.row_count)||pin.row_count<0||!/^[a-f0-9]{64}$/.test(pin.sha256))throw new Error('INVALID_FILE_PIN');paths.add(pin.relative_path);}
  const metadata=await createMetadataChecker({manifest,issue,readBounded,scanJsonl:scan,scanBinary,counts,db,allowSynthetic,currentEffectiveAlignmentEvidence});
  timings.metadata_ms=performance.now()-started;const registryStarted=performance.now();
  db.exec('BEGIN');
  await scan(manifest.identity_registry,async(r,file,line)=>{
   if(!await metadata.checkRegistry(r,file,line))return;
   registryRow.run(line,file,line,JSON.stringify(r));
   if(!object(r)||typeof r.entity_type!=='string'||(r.entity_type!=='USER_ACCOUNT'&&!Object.hasOwn(TABLE_SCHEMAS,r.entity_type.toLowerCase()))||typeof r.canonical_source_key!=='string'||!r.canonical_source_key||!uuid(r.target_id)){await issue('REGISTRY_SHAPE',file,line,'target_id');return;}
   try{identity.run(r.entity_type.toLowerCase(),r.canonical_source_key,r.target_id,file,line,r.identity_basis);}catch{await issue('DUPLICATE_REGISTRY_IDENTITY',file,line,'canonical_source_key');}
   if(r.aliases!==undefined&&(!Array.isArray(r.aliases)||!r.aliases.every(x=>typeof x==='string'&&x.length>0))){await issue('REGISTRY_SHAPE',file,line,'aliases');return;}
   for(const key of [r.canonical_source_key,...(r.aliases??[])])try{identityKey.run(r.entity_type.toLowerCase(),key,r.target_id);}catch{await issue('DUPLICATE_REGISTRY_ALIAS',file,line,'aliases');}
  });
  timings.registry_ms=performance.now()-registryStarted;const recordsStarted=performance.now();
  for(const pin of manifest.files){
   if(typeof pin.table!=='string'||!Object.hasOwn(TABLE_SCHEMAS,pin.table)||tables.has(pin.table))throw new Error('UNKNOWN_OR_DUPLICATE_TABLE');tables.add(pin.table);const schema=schemas[pin.table],expectedFields=Object.entries(schema).filter(([,rule])=>manifest.stage==='READY'||!rule.generated);
   counts[pin.table]=await scan(pin,async(r,file,line)=>{
    if(!object(r)||Object.keys(r).sort().join(',')!==['fields','source_key','source_refs',...(Object.hasOwn(r,'explicit_zero_evidence')?['explicit_zero_evidence']:[]),...(Object.hasOwn(r,'zero_amount_archive')?['zero_amount_archive']:[]),...(Object.hasOwn(r,'historical_hall_evidence')?['historical_hall_evidence']:[])].sort().join(',')||!validateStandardImportField(r.source_key,{kind:'text',nullable:false},manifest.stage)||!object(r.fields)||!Array.isArray(r.source_refs)){await issue('RECORD_SHAPE',file,line,'$');return;}
    await metadata.checkSourceRefs(r.source_refs,file,line);
    const f=r.fields;let fieldsValid=true;let validHallEvidence=false;
    if(pin.table==='sales_header'&&isRetainedHistoricalSalesDocument(r,manifest.stage==='CLEANED'&&isHistoricalSalesSourceProfile(profile))&&(historicalSalesHallApproval!==undefined||isHistoricalSalesHallSourceProfile(profile))&&!Object.hasOwn(r,'historical_hall_evidence')){fieldsValid=false;await issue('HISTORICAL_HALL_EVIDENCE_REQUIRED',file,line,'historical_hall_evidence');}
    if(Object.hasOwn(r,'historical_hall_evidence')){try{if(!isHistoricalSalesHallSourceProfile(profile))throw Error('HISTORICAL_HALL_PROFILE_REQUIRED');if(!historicalSalesHallEvidenceMatchesProfile(r.historical_hall_evidence,profile))throw Error('HISTORICAL_HALL_PROFILE_VERSION');if(pin.table!=='sales_header'||!isRetainedHistoricalSalesDocument(r,manifest.stage==='CLEANED'&&isHistoricalSalesSourceProfile(profile)))throw Error('HISTORICAL_HALL_SOURCE_REQUIRED');validateHistoricalSalesHallEvidence(r.historical_hall_evidence,{sourceNamespace:manifest.source_namespace,sourceKey:r.source_key,targetId:registryLookup.get(pin.table,r.source_key)?.id,sourceRefs:r.source_refs,fields:f,approval:historicalSalesHallApproval});validHallEvidence=true;}catch(error){fieldsValid=false;await issue(/^[A-Z_]+$/.test(error.message)?error.message:'HISTORICAL_HALL_EVIDENCE_INVALID',file,line,'historical_hall_evidence');}}
    if(Object.hasOwn(r,'explicit_zero_evidence')&&(pin.table!=='inventory_baseline'||!explicitZeroApproved(explicitZeroApproval,manifest.source_namespace,manifest.inventory_source.source_file_sha256,manifest.inventory_source.cutoff_at,r))){fieldsValid=false;await issue('EXPLICIT_ZERO_APPROVAL_REQUIRED',file,line,'explicit_zero_evidence');}
    if(Object.hasOwn(r,"zero_amount_archive")){try{if(pin.table!=="sales_header"||!isRetainedHistoricalSale(r,isHistoricalSalesSourceProfile(profile)))throw new Error("ZERO_ARCHIVE_HISTORICAL_SALE_REQUIRED");validateZeroAmountArchive(r.zero_amount_archive,{sourceNamespace:manifest.source_namespace,salesSourceKey:r.source_key,sourceFileHashes:new Set(manifest.source_files.map(x=>x.sha256))});}catch(error){fieldsValid=false;await issue(error.message,file,line,"zero_amount_archive");}}
    for(const [key,rule] of expectedFields){let valid=false;try{valid=Object.hasOwn(f,key)&&((pin.table==='sales_header'&&key==='hall_id'&&f[key]===null&&validHallEvidence)||validateStandardImportField(f[key],rule,manifest.stage));}catch{}if(!valid){fieldsValid=false;await issue(Object.hasOwn(f,key)?'FIELD_TYPE':'FIELD_MISSING',file,line,key);}
      else if(rule.reference&&f[key]!==null)for(const v of Array.isArray(f[key])?f[key]:[f[key]])ref.run(rule.reference,v,file,line,key);
    }
    for(const key of Object.keys(f))if(!Object.hasOwn(schema,key)||(manifest.stage==='CLEANED'&&schema[key].generated)){fieldsValid=false;await issue('FIELD_UNKNOWN',file,line,key);}
    const registered=registryLookup.get(pin.table,r.source_key);
    if(schema.id&&(!registered||(manifest.stage==='READY'&&f.id!==registered.id)))await issue('REGISTRY_TARGET_MISMATCH',file,line,'id');
    try{seen.run(pin.table,r.source_key,registered?.id??null,file,line);}catch{await issue('DUPLICATE_ROW_IDENTITY',file,line,'source_key');}
    if(pin.table==='product_image')await metadata.checkAssetRef(f,file,line);
    if(fieldsValid)insertFact.run(pin.table,registered?.id??null,r.source_key,file,line,JSON.stringify(f),JSON.stringify(r.source_refs),Object.hasOwn(r,"zero_amount_archive")?JSON.stringify(r.zero_amount_archive):null,Object.hasOwn(r,"explicit_zero_evidence")?JSON.stringify(r.explicit_zero_evidence):null,Object.hasOwn(r,"historical_hall_evidence")?JSON.stringify(r.historical_hall_evidence):null);
   });
  }
  timings.records_ms=performance.now()-recordsStarted;const relationsStarted=performance.now();
  for(const t of Object.keys(TABLE_SCHEMAS))if(!tables.has(t))await issue('TABLE_FILE_REQUIRED','manifest.json',null,t);
  for(const r of db.prepare('SELECT r.* FROM refs r LEFT JOIN identities i ON i.entity=r.entity AND i.id=r.id WHERE i.id IS NULL').iterate())await issue('REGISTRY_UNRESOLVED',r.file,r.line,r.field);
  for(const r of db.prepare("SELECT i.* FROM identities i WHERE i.entity!='user_account' AND NOT EXISTS(SELECT 1 FROM facts f WHERE f.entity=i.entity AND f.id=i.id)").iterate())await issue('REGISTRY_TARGET_ROW_MISSING',r.file,r.line,'target_id');
  await metadata.finish();
  const declared=new Set(['manifest.json',manifest.identity_registry.relative_path,...manifest.files.map(p=>p.relative_path),...manifest.assets.map(p=>p.relative_path),...manifest.reports.map(p=>p.relative_path)]);let entries=0;
  async function scanDirectory(relative='',depth=0){if(depth>16)throw new Error('DIRECTORY_LIMIT');for await(const entry of await opendir(join(root,relative))){if(++entries>4096)throw new Error('DIRECTORY_LIMIT');const path=relative?relative+'/'+entry.name:entry.name;if(entry.isDirectory())await scanDirectory(path,depth+1);else if(entry.isSymbolicLink())await issue('SYMLINK_FORBIDDEN',path,null,'$');else if(!declared.has(path))await issue('UNDECLARED_PACKAGE_FILE',path,null,'$');}}
  await scanDirectory();
  if(historicalStaffHallApproval&&!historicalStaffHallApprovalMatchesSource(historicalStaffHallApproval,manifest.source_namespace,new Set(manifest.source_files.map(f=>f.sha256))))await issue("STAFF_HALL_APPROVAL_SOURCE","manifest.json",null,"source_files");
  if(historicalLineAmountEvidence&&!historicalLineAmountEvidenceMatchesSource(historicalLineAmountEvidence,manifest.source_namespace,new Set(manifest.source_files.map(f=>f.sha256))))await issue("HISTORICAL_LINE_AMOUNT_EVIDENCE_SOURCE","manifest.json",null,"source_files");
  if(isHistoricalSalesHallSourceProfile(profile)&&!historicalSalesHallApprovalMatchesSource(historicalSalesHallApproval,manifest.source_namespace,new Set(manifest.source_files.map(f=>f.sha256))))await issue('HISTORICAL_HALL_APPROVAL_REQUIRED','manifest.json',null,'source_files');
  if(historicalSalesHallApproval&&!isHistoricalSalesHallSourceProfile(profile))await issue('HISTORICAL_HALL_PROFILE_REQUIRED','manifest.json',null,'schema_contract');
  if(historicalSalesHallApproval){if(!historicalSalesHallApprovalMatchesSource(historicalSalesHallApproval,manifest.source_namespace,new Set(manifest.source_files.map(f=>f.sha256))))await issue('HISTORICAL_HALL_APPROVAL_SOURCE','manifest.json',null,'source_files');else if(db.prepare("SELECT count(*) AS n FROM facts WHERE entity='sales_header' AND historical_hall_evidence IS NOT NULL").get().n!==historicalSalesHallApproval.records.length)await issue('HISTORICAL_HALL_APPROVAL_SET_INCOMPLETE','manifest.json',null,'sales_header');}
  if(explicitZeroApproval){const counts=db.prepare("SELECT count(*) AS n,count(DISTINCT json_extract(explicit_zero_evidence,'$.approval_row')) AS distinct_n FROM facts WHERE entity='inventory_baseline' AND explicit_zero_evidence IS NOT NULL").get();if(counts.n!==explicitZeroApproval.facts.length||counts.n!==counts.distinct_n)await issue('EXPLICIT_ZERO_APPROVAL_SET_INCOMPLETE','manifest.json',null,'inventory_baseline');}
  await validateStreamRelations(db,{stage:manifest.stage,explicitZeroApproval,inventoryCutoff:manifest.inventory_source?.cutoff_at,sourceNamespace:manifest.source_namespace,historicalStaffHallApproval,sourceProfile:isHistoricalSalesSourceProfile(profile),schemaProfile:profile,inventorySourceSha256:manifest.inventory_source?.source_file_sha256??'',issue,historicalSalesHallApproval,historicalLineAmountEvidence,onHistoricalLineAmountDifference:async difference=>{differenceCount++;const bytes=JSON.stringify(difference)+'\n';differenceBytes+=Buffer.byteLength(bytes);differenceDigest.update(bytes);await differenceFile.write(bytes);}});
  if(historicalLineAmountEvidence&&historicalLineAmountEvidenceMatchesSource(historicalLineAmountEvidence,manifest.source_namespace,new Set(manifest.source_files.map(f=>f.sha256)))&&differenceCount!==historicalLineAmountEvidence.lines.length)await issue('HISTORICAL_LINE_AMOUNT_EVIDENCE_SET_INCOMPLETE','manifest.json',null,'sales_line');
  let sourceOccurrenceReconciliation;
  if(sourceOccurrenceEvidence&&issueCount===0){
   try{
    function* records(table){for(const r of db.prepare('SELECT * FROM facts WHERE entity=? ORDER BY rowid').iterate(table))yield {source_key:r.source_key,fields:JSON.parse(r.fields),source_refs:JSON.parse(r.source_refs),...(r.historical_hall_evidence?{historical_hall_evidence:JSON.parse(r.historical_hall_evidence)}:{}),...(r.explicit_zero_evidence?{explicit_zero_evidence:JSON.parse(r.explicit_zero_evidence)}:{}),...(r.zero_amount_archive?{zero_amount_archive:JSON.parse(r.zero_amount_archive)}:{})};}
    function* registry(){for(const r of db.prepare('SELECT raw_json FROM registry_rows ORDER BY ordinal').iterate())yield JSON.parse(r.raw_json);}
    const reconciled=reconcileSourceOccurrenceEvidence(sourceOccurrenceEvidence,{manifest,registry:registry(),records,storage:occurrenceStorage(sourceOccurrenceEvidence),...(explicitZeroApproval?{explicitZeroApproval}:{})});
    const reportHash=await writeOccurrenceReport(join(report,'source-occurrence-reconciliation.json'),reconciled);
    sourceOccurrenceReconciliation={evidence_sha256:reconciled.evidence_sha256,report_sha256:reportHash,counts:reconciled.counts,state:reconciled.state};
   }catch(error){await issue(error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'SOURCE_RECONCILIATION_REJECTED','source_occurrence_evidence',null,'$');}
  }
  timings.relations_and_reconciliation_ms=performance.now()-relationsStarted;
  db.exec('COMMIT');finished=true;db.close();dbClosed=true;
  peakRss=Math.max(peakRss,process.memoryUsage().rss);
  const hashStarted=performance.now();const indexHash=createHash('sha256'),indexReader=await open(join(report,'index.sqlite'),'r');let indexBytes=0;try{const b=Buffer.alloc(65536);for(;;){const {bytesRead}=await indexReader.read(b,0,b.length,null);if(!bytesRead)break;indexBytes+=bytesRead;indexHash.update(b.subarray(0,bytesRead));}}finally{await indexReader.close();}
  timings.index_hash_ms=performance.now()-hashStarted;timings.total_ms=performance.now()-started;timings.jsonl_read_ms=readMs;timings.jsonl_decode_parse_ms=parseMs;peakRss=Math.max(peakRss,process.resourceUsage().maxRSS*1024);
  let historicalAmountEvidencePin;
  if(historicalLineAmountEvidence&&historicalLineAmountEvidenceMatchesSource(historicalLineAmountEvidence,manifest.source_namespace,new Set(manifest.source_files.map(f=>f.sha256)))){const wire=historicalLineAmountEvidenceWire(historicalLineAmountEvidence);await writeFile(join(report,'historical-line-amount-evidence.json'),wire.utf8,{flag:'wx',mode:0o600});historicalAmountEvidencePin={relative_path:'historical-line-amount-evidence.json',bytes:Buffer.byteLength(wire.utf8),sha256:wire.sha256};}
  const result={...(historicalSalesHallApproval?{historical_hall_approval:historicalSalesHallApprovalWire(historicalSalesHallApproval)}:{}),...(sourceOccurrenceReconciliation?{source_occurrence_reconciliation:sourceOccurrenceReconciliation}:{}),...(currentEffectiveAlignmentEvidence?{current_effective_alignment:currentEffectiveAlignmentDescriptor(currentEffectiveAlignmentEvidence)}:{}),...(differenceCount?{historical_line_amount_differences:differenceCount,historical_line_amount_execution_boundary:'OFFLINE_ARCHIVE_ONLY',historical_line_amount_report:{relative_path:'historical-line-amount-differences.jsonl',row_count:differenceCount,bytes:differenceBytes,sha256:differenceDigest.digest('hex')},historical_line_amount_evidence:historicalAmountEvidencePin}:{}),...(explicitZeroApproval?{explicit_zero_approval:explicitZeroApprovalDescriptor(explicitZeroApproval)}:{}),...(historicalStaffHallApproval?{historical_staff_hall_approval:historicalStaffHallApprovalWire(historicalStaffHallApproval)}:{}),timings_ms:timings,source_namespace:manifest.source_namespace,schema_declarations_sha256:profile,package_stage:manifest.stage,manifest_sha256:expectedManifestSha256,index_schema_version:'UNIFIED_STREAM_FACTS_V3',index_sha256:indexHash.digest('hex'),index_bytes:indexBytes,validation_scope:'STANDARD_PACKAGE_OFFLINE_V1',state:'STREAM_PREFLIGHT_COMPLETE',checks_passed:issueCount===0,complete_package_validation:true,import_eligible:false,business_database_writes:false,counts,issue_count:issueCount,bytes_scanned:total,peak_rss_bytes:peakRss,limits:{line_bytes:MAX_LINE,total_bytes:MAX_TOTAL,rows:MAX_ROWS,issues:MAX_ISSUES,sqlite_cache_kib:4096},remaining_checks:['source truth beyond declared evidence','target authorization, live database state and execution']};
  await differenceFile.sync();await issueFile.sync();await writeFile(join(report,'summary.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});return result;
 }catch(error){const allowed=new Set(['MANIFEST_LIMIT','METADATA_SIZE_LIMIT','ASSET_SIZE_LIMIT','DIRECTORY_LIMIT','MANIFEST_PIN_MISMATCH','FORBIDDEN_CREDENTIAL','INVALID_MANIFEST','UNKNOWN_SCHEMA_PROFILE','INVALID_FILE_PIN','UNKNOWN_OR_DUPLICATE_TABLE','UNSAFE_PATH','SYMLINK_FORBIDDEN','NOT_REGULAR','TOTAL_BYTE_LIMIT','ROW_LIMIT','LINE_BYTE_LIMIT','FILE_CHANGED','ISSUE_LIMIT']);const code=allowed.has(error?.message)?error.message:'PREFLIGHT_IO_OR_FORMAT_FAILURE';await issueFile.write(JSON.stringify({code,...location})+'\n');await issueFile.sync();throw error;}
 finally{closeOccurrenceEvidence(sourceOccurrenceEvidence);if(!finished)try{db.exec('ROLLBACK');}catch{}if(!dbClosed)db.close();await issueFile.close();await differenceFile.close();}
}
