/** Real schema-stage runner. Only branded captured native client enters apply.
 * Test dispatch model below never creates an installed/approved result. */
import {open,mkdir,lstat,realpath,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {captureData,literal,identifier} from '../../../tests/integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import {unifiedInstallPlanData,describeUnifiedInstallPlan,assertUnifiedInstallSources,sourceFile,ROOT,hash,freeze,need} from './source-plan.mjs';
import {assertFreshTarget,targetDescriptor,freshTargetGuard} from './target-contract.mjs';
import {assertUnifiedInstallAdapter,assertInstallAdapterSources,installQuery,closeUnifiedInstallClient} from './physical-adapter.mjs';
const programs=new WeakMap();
function zeroSentinel(t){const role=literal(t.intent.sentinel);return `DO $unified_zero$ BEGIN IF
 EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='naijue_erp' AND has_schema_privilege(${role},oid,'USAGE'))
 OR EXISTS(SELECT 1 FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace CROSS JOIN(VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(priv) WHERE n.nspname='naijue_erp' AND r.relkind IN('r','p') AND has_table_privilege(${role},r.oid,p.priv))
 OR EXISTS(SELECT 1 FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped CROSS JOIN(VALUES('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(priv) WHERE n.nspname='naijue_erp' AND r.relkind IN('r','p') AND has_column_privilege(${role},r.oid,a.attnum,p.priv))
 OR EXISTS(SELECT 1 FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace CROSS JOIN(VALUES('SELECT'),('USAGE'),('UPDATE')) p(priv) WHERE n.nspname='naijue_erp' AND r.relkind='S' AND has_sequence_privilege(${role},r.oid,p.priv))
 THEN RAISE EXCEPTION 'UNIFIED_SENTINEL_RIGHTS_NOT_ZERO'; END IF; END $unified_zero$;`;}
export function compileUnifiedSchemaProgram(input){
 const a=captureData(input,['plan','target']),s=unifiedInstallPlanData(a.plan);assertFreshTarget(a.target);const t=targetDescriptor(a.target),v=s.plan.v22;
 need(s.descriptor.requestedScope==='SCHEMA_ONLY','ACL_SCOPE_UNREVIEWED_NO_SCHEMA_APPLY');need(v.parents.length===131&&hash(v.definition)===v.definitionSha256,'EXACT_131_PARENT_ORIGINAL_MEMBER_REQUIRED');
 const guard=freshTargetGuard(a.target,{requireEmpty:false}),zero=zeroSentinel(t),i=t.intent;
 const carrier=`BEGIN; SET LOCAL search_path=pg_catalog;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='45s';
${guard}\n${zero}\nSET LOCAL ROLE ${identifier(i.owner)};
GRANT UPDATE(history_expected_counts,history_payload_hash) ON naijue_erp.import_batch TO ${identifier(i.sentinel)};
DO $unified_parent$ DECLARE expected jsonb:=${literal(JSON.stringify(v.parents))}::jsonb;f jsonb; BEGIN
 IF current_user<>${literal(i.owner)} OR session_user<>${literal(i.admin)} OR (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY(SELECT generate_series(1,26)) OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='naijue_erp' AND p.prokind IN('f','p'))<>131 OR NOT has_column_privilege(${literal(i.sentinel)},'naijue_erp.import_batch','history_expected_counts','UPDATE') OR NOT has_column_privilege(${literal(i.sentinel)},'naijue_erp.import_batch','history_payload_hash','UPDATE') THEN RAISE EXCEPTION 'UNIFIED_V22_131_TWO_CELL_PARENT_REQUIRED'; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(expected) LOOP IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f->>'signature') AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=f->>'body' AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=f->>'definition') THEN RAISE EXCEPTION 'UNIFIED_V22_FULL_PARENT_MISMATCH'; END IF;END LOOP;END $unified_parent$;
${v.definition}
REVOKE UPDATE(history_expected_counts,history_payload_hash) ON naijue_erp.import_batch FROM ${identifier(i.sentinel)};
RESET ROLE;\n${zero}\n${guard}\nCOMMIT;`;
 const commitCheckpoints=s.plan.files.flatMap((file,i)=>file.path===s.cohort.sourcePlan.V22?[{fileOrdinal:i+1,statementIndex:null,commitKey:(i+1)+':carrier:'+hash(carrier),sqlSha256:hash(carrier)}]:file.statements.filter(x=>x.kind==='COMMIT').map(x=>({fileOrdinal:i+1,statementIndex:x.index,commitKey:(i+1)+':'+x.index+':'+x.statementSha256,sqlSha256:x.statementSha256})));
 const descriptor=freeze({format:'UNIFIED_SCHEMA_PROGRAM_V1',planSha256:s.descriptor.planSha256,targetSha256:hash(JSON.stringify(t)),carrierSha256:hash(carrier),originalMemberSha256:v.definitionSha256,sourceFiles:40,ordinaryStatements:714,carrierTransactions:1,commitCheckpoints,scope:'SCHEMA_ONLY_NOT_ACL_NOT_AUTHENTICATION',authority:'NONE'});
 const token=Object.freeze({profile:'UNIFIED_SCHEMA_PROGRAM_V1'});programs.set(token,{...a,...s,installPlan:a.plan,t,guard,carrier,descriptor});return token;
}
export function describeUnifiedSchemaProgram(program){need(programs.has(program),'GENUINE_UNIFIED_SCHEMA_PROGRAM_REQUIRED');return programs.get(program).descriptor;}
export async function schemaProgramAllowedQueries(program,plan,target){
 need(programs.has(program),'GENUINE_UNIFIED_SCHEMA_PROGRAM_REQUIRED');const p=programs.get(program);need(p.installPlan===plan&&p.target===target,'SAME_SCHEMA_PROGRAM_PLAN_TARGET_REQUIRED');
 const sql=new Set(p.plan.ledger.filter(s=>s.path!==p.cohort.sourcePlan.V22).map(s=>s.sql));
 for(const text of [p.carrier,p.guard,freshTargetGuard(target,{requireEmpty:true}),"SET LOCAL search_path=pg_catalog;SET LOCAL lock_timeout='3s'",`SET LOCAL ROLE ${identifier(p.t.intent.owner)}`,'RESET ROLE','ROLLBACK','BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','COMMIT'])sql.add(text);
 const observer=(await sourceFile(p.cohort.root,'tests/integration/runtime26-baseline/schema-objects-only/observer.mjs')).toString('utf8');
 for(const m of observer.matchAll(/query\((?:`([^]*?)`|'([^']*)')\)/g)){
  const text=m[1]??m[2];if(text.includes('${identifier(table.name)}'))for(const t of p.plan.inventory.profiles.HISTORY.schema.tables)sql.add(text.replace('${identifier(table.name)}',identifier(t.name)));
  else{need(!text.includes('${'),'UNKNOWN_SOURCE_OBSERVER_SQL_TEMPLATE');sql.add(text);}
 }
 const native=await import('../../../adapters/postgres/src/native-import-accounting-capability.ts');const {renderSequenceSystemCanonicalObservation}=await import('../../../tests/performance/opt02/current-native-stock/sequence-system-successor-observation.mjs');
 sql.add(renderSequenceSystemCanonicalObservation({successorSourceText:(await sourceFile(ROOT,'adapters/postgres/src/native-import-accounting-capability.ts')).toString('utf8'),successorProbeText:native.NATIVE_RUNTIME26_HISTORY_DRAFT_SEQUENCE_SYSTEM_METADATA_PROBE}).sql);
 return Object.freeze([...sql]);
}
async function drive(program,io){
 need(programs.has(program),'GENUINE_UNIFIED_SCHEMA_PROGRAM_REQUIRED');const p=programs.get(program);let transaction=false,submitted=0;
 for(const method of ['query','commit','emit','assertSources','quarantined'])need(typeof io[method]==='function','SOURCE_DRIVER_OPERATIONS_REQUIRED');
 try{
  for(const [ordinal,file]of p.plan.files.entries()){
   await io.assertSources();await io.emit({phase:'FILE_PENDING',fileOrdinal:ordinal+1,path:file.path,fileSha256:file.sha256});
   if(file.path===p.cohort.sourcePlan.V22){
    const commitKey=(ordinal+1)+':carrier:'+hash(p.carrier);await io.emit({phase:'COMMIT_PENDING',fileOrdinal:ordinal+1,path:file.path,commitKey,sqlSha256:hash(p.carrier),carrier:true});
    await io.commit(p.carrier);await io.emit({phase:'COMMIT_ACKNOWLEDGED',fileOrdinal:ordinal+1,path:file.path,commitKey,sqlSha256:hash(p.carrier),fileSha256:file.sha256,carrier:true,originalMemberSha256:p.plan.v22.definitionSha256});continue;
   }
   for(const statement of file.statements){
    if(statement.kind==='BEGIN'){need(!transaction,'NESTED_SOURCE_TRANSACTION');await io.query(statement.sql);transaction=true;await io.query("SET LOCAL search_path=pg_catalog;SET LOCAL lock_timeout='3s'");await io.query(p.guard);await io.query(`SET LOCAL ROLE ${identifier(p.t.intent.owner)}`);}
    else if(statement.kind==='COMMIT'){
     need(transaction,'UNPAIRED_SOURCE_COMMIT');await io.assertSources();await io.query('RESET ROLE');await io.query(p.guard);
     const commitKey=(ordinal+1)+':'+statement.index+':'+statement.statementSha256;
     await io.emit({phase:'COMMIT_PENDING',fileOrdinal:ordinal+1,path:file.path,statementIndex:statement.index,commitKey,sqlSha256:statement.statementSha256});
     await io.commit(statement.sql);transaction=false;
     await io.emit({phase:'COMMIT_ACKNOWLEDGED',fileOrdinal:ordinal+1,path:file.path,statementIndex:statement.index,commitKey,sqlSha256:statement.statementSha256,fileSha256:file.sha256});
    }else{need(transaction,'SOURCE_SQL_OUTSIDE_ORIGINAL_TRANSACTION');await io.query(statement.sql);}
    submitted++;await io.emit({phase:'SOURCE_STATEMENT_ACKNOWLEDGED',fileOrdinal:ordinal+1,path:file.path,index:statement.index,kind:statement.kind,statementSha256:statement.statementSha256});
   }
  }
  need(!transaction&&submitted===714,'EXACT_SOURCE_DISPATCH_COUNT_REQUIRED');await io.assertSources();return {submittedOriginalStatements:714,sourceFiles:40,originalRoutineBodies:137};
 }catch(error){
  if(transaction&&!io.quarantined())try{await io.query('ROLLBACK',true);}catch(rollback){throw new AggregateError([error,rollback],'SOURCE_INSTALL_AND_ROLLBACK_FAILED',{cause:error});}
  throw error;
 }
}
/** Explicit test hook: driver fault/state model, NEVER a real installed result. */
export async function modelUnifiedSchemaDispatchForTests(program,operations){const result=await drive(program,operations);return freeze({...result,status:'SCRIPTED_DISPATCH_MODEL_NOT_DATABASE_INSTALLATION',installed:false});}
export async function createInstallJournal(directory,program){
 const d=describeUnifiedSchemaProgram(program);need(path.isAbsolute(directory)&&path.resolve(directory)===directory,'CANONICAL_FRESH_JOURNAL_PATH_REQUIRED');for(const root of [path.resolve(ROOT),programs.get(program).cohort.root])need(directory!==root&&!directory.startsWith(root+path.sep),'JOURNAL_MUST_BE_OUTSIDE_SOURCE_ROOTS');const parent=path.dirname(directory),ps=await lstat(parent);need(ps.isDirectory()&&!ps.isSymbolicLink()&&await realpath(parent)===parent,'CANONICAL_EXISTING_JOURNAL_PARENT_REQUIRED');await mkdir(directory,{mode:0o700});
 let index=0,previous=null;const events=[];
 return Object.freeze({async append(event){const record={format:'UNIFIED_SCHEMA_STAGE_EVENT_V1',index:++index,previousSha256:previous,program:d,atUtc:new Date().toISOString(),event};const bytes=Buffer.from(JSON.stringify(record)+'\n');const fd=await open(path.join(directory,String(index).padStart(6,'0')+'.json'),'wx',0o400);try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}previous=hash(bytes);events.push({index,sha256:previous,event});return previous;},summary(){return freeze({directory,lastSha256:previous,events:[...events]});}});
}
export async function runUnifiedSchemaInstall(input){
 const a=captureData(input,['program','adapter','journalDirectory']);need(programs.has(a.program),'GENUINE_UNIFIED_SCHEMA_PROGRAM_REQUIRED');const p=programs.get(a.program),native=assertUnifiedInstallAdapter(a.adapter,p.installPlan,p.target);
 let journal,primary,result,close,observing=false,observingCommit=false;
 try{
  journal=await createInstallJournal(a.journalDirectory,a.program);
  await journal.append({phase:'SOURCE_INSTALLING',emptyTargetPreviouslyGuarded:true});
  const dispatch=await drive(a.program,{query:(sql,cleanup=false)=>installQuery(a.adapter,p.installPlan,p.target,sql,{cleanup}),commit:sql=>installQuery(a.adapter,p.installPlan,p.target,sql,{commit:true}),emit:e=>journal.append(e),assertSources:()=>assertInstallAdapterSources(a.adapter,p.installPlan,p.target),quarantined:()=>native.quarantined()});
  await journal.append({phase:'SOURCE_OBSERVATION_PENDING'});
  await installQuery(a.adapter,p.installPlan,p.target,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');observing=true;
  const observation=await p.cohort.sourceObserver.observe(sql=>installQuery(a.adapter,p.installPlan,p.target,sql),p.plan);
  const nativeModule=await import('../../../adapters/postgres/src/native-import-accounting-capability.ts');
  const {renderSequenceSystemCanonicalObservation,inspectSequenceSystemCanonicalObservation}=await import('../../../tests/performance/opt02/current-native-stock/sequence-system-successor-observation.mjs');
  const catalogQuery=renderSequenceSystemCanonicalObservation({successorSourceText:(await sourceFile(ROOT,p.descriptor.metadataSource?.path??'adapters/postgres/src/native-import-accounting-capability.ts')).toString('utf8'),successorProbeText:nativeModule.NATIVE_RUNTIME26_HISTORY_DRAFT_SEQUENCE_SYSTEM_METADATA_PROBE});
  const catalogResult=await installQuery(a.adapter,p.installPlan,p.target,catalogQuery.sql);need(catalogResult.rowCount===1&&catalogResult.rows.length===1,'ONE_ADMIN_SCHEMA_CATALOG_OBSERVATION_REQUIRED');const catalog=catalogResult.rows[0];
  need(typeof catalog.observed_canonical_text==='string'&&catalog.source_routines_match===true,'SOURCE_MATCHED_RAW_SCHEMA_TEXT_REQUIRED');
  // Preserve the actual PostgreSQL UTF8 text, never reserialize/normalize it.
  await writeFile(path.join(a.journalDirectory,'catalog-canonical-UTF8.txt'),Buffer.from(catalog.observed_canonical_text,'utf8'),{flag:'wx',mode:0o400});
  await writeFile(path.join(a.journalDirectory,'catalog-observation.json'),JSON.stringify({scope:'ADMIN_SCHEMA_OBSERVATION_NOT_ORDINARY_RUNTIME_READY',row:catalog},null,2)+'\n',{flag:'wx',mode:0o400});
  const parity=inspectSequenceSystemCanonicalObservation({observed_canonical_text:catalog.observed_canonical_text,catalog_sha256:catalog.catalog_sha256});
  await installQuery(a.adapter,p.installPlan,p.target,p.guard);await assertUnifiedInstallSources(p.installPlan);
  await journal.append({phase:'READONLY_OBSERVATION_COMMIT_PENDING'});observingCommit=true;await installQuery(a.adapter,p.installPlan,p.target,'COMMIT',{commit:true});observing=false;observingCommit=false;await journal.append({phase:'READONLY_OBSERVATION_COMMIT_ACKNOWLEDGED'});
  result=freeze({...dispatch,status:'SCHEMA_INSTALLED_SOURCE_CHECKED_NOT_RUNTIME_READY',observation,catalog:{path:path.join(a.journalDirectory,'catalog-canonical-UTF8.txt'),sha256:hash(catalog.observed_canonical_text),bytes:Buffer.byteLength(catalog.observed_canonical_text),parity,scope:'ADMIN_CATALOG_ONLY_ACL_NOT_ORDINARY_RUNTIME_APPROVAL'},ordinaryRuntimeLogin:false,employeeLogin:false,productionAuthorized:false});
  await journal.append({phase:'SCHEMA_SOURCE_CHECKED_NOT_RUNTIME_APPROVED',observationStatus:observation.status});
 }catch(error){primary=error;if(observing&&!observingCommit&&!native.quarantined())try{await installQuery(a.adapter,p.installPlan,p.target,'ROLLBACK',{cleanup:true});}catch(rollback){primary=new AggregateError([error,rollback],'OBSERVATION_AND_ROLLBACK_FAILED',{cause:error});}
  if(journal)try{await journal.append({phase:native.quarantined()?'UNKNOWN_COMMIT_QUARANTINED_NO_REPLAY':'FAILED_PARTIAL_PRESERVED_NO_REPLAY',errorCode:typeof error?.code==='string'?error.code:error?.name??'UNKNOWN_ERROR'});}catch(journalError){primary=new AggregateError([primary,journalError],'INSTALL_AND_JOURNAL_FAILED',{cause:primary});}}
 finally{close=await closeUnifiedInstallClient(a.adapter);if(journal)try{await journal.append({phase:'CLIENT_CLOSED',confirmed:close.confirmed,databaseAndRolesPreserved:true});}catch(error){primary=primary?new AggregateError([primary,error],'INSTALL_AND_CLOSE_JOURNAL_FAILED',{cause:primary}):error;}}
 if(!close.confirmed){const e=new Error('INSTALL_CLIENT_CLOSE_UNCONFIRMED');primary=primary?new AggregateError([primary,e],'INSTALL_AND_CLOSE_UNCONFIRMED',{cause:primary}):e;}
 if(primary)throw primary;return freeze({result,close,journal:journal.summary()});
}
export function inspectInstallRecovery(program,events){
 const p=describeUnifiedSchemaProgram(program);need(Array.isArray(events)&&events.length<=4096,'BOUNDED_ORIGINAL_STAGE_EVENTS_REQUIRED');
 for(const e of events)need(e&&JSON.stringify(e.program)===JSON.stringify(p),'RECOVERY_ORIGINAL_SOURCE_TARGET_KEYS_REQUIRED');
 const pending=events.filter(e=>e.event?.phase==='COMMIT_PENDING'),ack=events.filter(e=>e.event?.phase==='COMMIT_ACKNOWLEDGED');
 for(const e of [...pending,...ack])need(p.commitCheckpoints.some(c=>c.commitKey===e.event.commitKey&&c.fileOrdinal===e.event.fileOrdinal&&c.sqlSha256===e.event.sqlSha256),'EXACT_ORIGINAL_COMMIT_CHECKPOINT_REQUIRED');
 need(new Set(pending.map(e=>e.event.commitKey)).size===pending.length&&new Set(ack.map(e=>e.event.commitKey)).size===ack.length&&ack.every(e=>pending.some(x=>x.event.commitKey===e.event.commitKey&&x.index<e.index)),'ORIGINAL_PENDING_THEN_ACK_NO_DUPLICATE_REQUIRED');
 return freeze({status:'READ_ONLY_ORIGINAL_KEY_READBACK_REQUIRED_NO_REPLAY',planSha256:p.planSha256,targetSha256:p.targetSha256,acknowledgedCommits:ack.map(e=>e.event.commitKey),unresolvedCommitFiles:pending.filter(e=>!ack.some(x=>x.event.commitKey===e.event.commitKey)).map(e=>e.event.fileOrdinal),automaticResumeAuthorized:false,requires:['SAME_BIRTH_SYSTEM_ID_DB_OID_POSTMASTER','ORIGINAL_FILE_AND_SOURCE_BODY_CHECKPOINT_READBACK','INDEPENDENT_CHECKPOINT_REVIEW_AND_NEW_REMAINING_ONLY_APPROVAL'],schemaOrAclApproval:false});
}
