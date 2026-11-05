/** Supported successor installer. Invoke only through the fixed pre-Node launcher.
 * Requires a genuine original177 record and an exclusive administrative window.
 * SQL commits atomically before record publication; publication failure is NOT a rollback. */
import {open,lstat,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {constants,readSync,closeSync,fstatSync} from 'node:fs';
import {salesInstallLayout} from './whole-sales-platform-layout.mjs';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
import {TRUSTED_PSQL_PATH} from './trusted-install-path.mjs';
import {assertTrustedSalesPath as assertTrustedRootPath,assertTrustedSalesTree as assertTrustedRootTree} from './whole-sales-trusted-path.mjs';
import {loadWholeCatalogSpec,WHOLE_CATALOG_QUERY,verifyWholeCatalogPacket} from './whole-catalog-gate.mjs';
import {WHOLE_INSTALLATION_RECORD_PATH,validateInstallationRecord} from './whole-installation-record.mjs';
import {loadWholeSalesSpecV1,WHOLE_SALES_CATALOG_QUERY} from './whole-sales-catalog-v1.mjs';
import {WHOLE_SALES_RECORD_V1_PATH,validateWholeSalesRecordV1} from './whole-sales-record-v1.mjs';
import {renderWholeExplicitZeroCandidate} from './whole-explicit-zero-integration-candidate.mjs';
import {publishInstallationRecord} from './publish-installation-record.mjs';
import {validateStageCompletion} from './record-whole-installation.mjs';
const layout=salesInstallLayout(),ROOT=layout.root,CONFIG=layout.config;
const need=(ok,code)=>{if(!ok)throw Error(code)};
const ack=(r,tag)=>{const d=r&&Object.getOwnPropertyDescriptor(r,'command');need(d&&Object.hasOwn(d,'value')&&d.value===tag,'SALES_INSTALL_ACK_REQUIRED')};
const hash=x=>createHash('sha256').update(x).digest('hex');
async function packet(client,query,spec,consume){let begun=false,rollbackAttempted=false;try{ack(await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'),'BEGIN');begun=true;ack(await client.query('SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp'),'SET');const r=await client.query(query,[JSON.stringify(spec.pins)]);ack(r,'SELECT');need(r.rows?.length===1&&typeof r.rows[0].catalog_json==='string'&&Buffer.byteLength(r.rows[0].catalog_json)<=16777216,'SALES_INSTALL_CATALOG_REJECTED');const value=consume(r.rows[0].catalog_json);rollbackAttempted=true;ack(await client.query('ROLLBACK'),'ROLLBACK');begun=false;return value}finally{if(begun&&!rollbackAttempted)ack(await client.query('ROLLBACK'),'ROLLBACK')}}
export async function observeWholeSalesForPublication(client,spec,predecessor){return packet(client,WHOLE_SALES_CATALOG_QUERY,spec,raw=>{const p=parseStrictJson(raw);need(p&&p.identity&&['system_identifier','database_oid','database_name','owner','controller','runtime_login','server_version_num'].every(k=>p.identity[k]===predecessor[k]),'SALES_INSTALL_TARGET_CHANGED');const record={format:'WHOLE_SALES_INSTALLATION_RECORD_V1',installedAt:new Date().toISOString(),predecessorSourceSpecSha256:spec.predecessor_source_spec_sha256,combinedSqlSha256:spec.combined_sql_sha256,sourceProfileSha256:spec.source_profile_sha256,binding:{...p.identity,catalog_sha256:hash(raw),source_spec_sha256:spec.source_spec_sha256}};validateWholeSalesRecordV1(record,spec);return record})}
export function validateSalesIssuerConfig(c,b){need(c&&Object.keys(c).sort().join(',')==='controller,database,host,noConcurrentDdlAclAdminChanges,owner,port'&&c.noConcurrentDdlAclAdminChanges===true,'SALES_INSTALL_EXACT_CONFIG_REQUIRED');need(['127.0.0.1','::1'].includes(c.host)&&Number.isSafeInteger(c.port)&&c.port>1024&&c.port<=65535&&c.database===b.database_name,'SALES_INSTALL_CONFIG_TARGET_DIFFERS');for(const k of ['owner','controller'])need(c[k]&&Object.keys(c[k]).sort().join(',')==='password,user'&&c[k].user===b[k]&&typeof c[k].password==='string'&&c[k].password.length>0,'SALES_INSTALL_ACCOUNT_DIFFERS');return c}
async function rootJson(path,privateFile=false){await assertTrustedRootPath(path);const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await f.stat();need(s.isFile()&&s.uid===0&&s.nlink===1&&(s.mode&(privateFile?0o077:0o022))===0&&s.size>0&&s.size<=65536,'SALES_INSTALL_ROOT_INPUT_UNTRUSTED');const text=await f.readFile('utf8');need(Buffer.byteLength(text)<=65536,'SALES_INSTALL_ROOT_INPUT_UNTRUSTED');return {text,value:parseStrictJson(text)}}finally{await f.close()}}
async function withController(config,work){const {Client}=await import('pg');const c=new Client({host:config.host,port:config.port,database:config.database,user:config.controller.user,password:()=>config.controller.password,ssl:false,application_name:'whole-sales-install-v1',connectionTimeoutMillis:5000,query_timeout:30000,options:'-c search_path=pg_catalog -c statement_timeout=25000 -c lock_timeout=2000'});try{await c.connect();return await work(c)}finally{await c.end()}}
export function bindSalesInstallSql(sql,expected){
 need(/^[0-9]+$/.test(expected.system_identifier)&&/^[0-9]+$/.test(expected.database_oid),'SALES_INSTALL_TARGET_INVALID');
 const literal=x=>"'"+x.replaceAll("'","''")+"'";
 const guard=`DO $sales_physical_guard$ BEGIN IF (SELECT system_identifier::text FROM pg_catalog.pg_control_system())<>${literal(expected.system_identifier)} OR (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database())<>${literal(expected.database_oid)} OR pg_catalog.current_database()<>${literal(expected.database_name)} OR session_user<>${literal(expected.owner)} THEN RAISE EXCEPTION 'SALES_INSTALL_PHYSICAL_TARGET_DIFFERS'; END IF; END $sales_physical_guard$;`;
 need(sql.split('\nBEGIN;\n').length===2,'SALES_INSTALL_TRANSACTION_SHAPE_INVALID');
 return sql.replace('\nBEGIN;\n','\nBEGIN;\n'+guard+'\n');
}
async function installSql(config,sql){const temp=await mkdtemp(join(tmpdir(),'whole-sales-install-'));try{const nonce=randomBytes(24).toString('hex'),path=join(temp,'reviewed.sql');await writeFile(path,sql+`\nSELECT pg_catalog.json_build_object('nonce','${nonce}','database',pg_catalog.current_database(),'user',session_user)::text;\n`,{mode:0o600,flag:'wx'});await new Promise((resolvePromise,reject)=>{const child=spawn(TRUSTED_PSQL_PATH,['-X','-q','-A','-t','--no-password','--host',config.host,'--port',String(config.port),'--dbname',config.database,'--username',config.owner.user,'--set','ON_ERROR_STOP=1','--file',path],{stdio:['ignore','pipe','pipe'],timeout:120000,killSignal:'SIGTERM',env:{PATH:'/usr/bin:/bin',LC_ALL:'C',PGPASSWORD:config.owner.password,PGCONNECT_TIMEOUT:'5',PGOPTIONS:'-c search_path=pg_catalog -c lock_timeout=5000 -c statement_timeout=110000'}});let output='',over=false;child.stdout.on('data',chunk=>{if(over)return;output+=chunk.toString('utf8');if(Buffer.byteLength(output)>16777216){over=true;child.kill('SIGTERM')}});child.stderr.on('data',()=>{});child.once('error',()=>reject(Error('SALES_INSTALL_SQL_OUTCOME_UNKNOWN')));child.once('close',(code,signal)=>{try{need(!signal&&!over,'SALES_INSTALL_SQL_OUTCOME_UNKNOWN');validateStageCompletion(code,output,{nonce,database:config.database,user:config.owner.user});resolvePromise()}catch{reject(Error('SALES_INSTALL_SQL_OUTCOME_UNKNOWN'))}})})}finally{await rm(temp,{recursive:true,force:true})}}
/** Sequence only; callbacks carry no implicit authority and production uses fixed operations. */
export async function completeSalesPublication({install,observe,recheck,publish}){
 let state='INSTALL_OUTCOME_UNKNOWN';
 try{await install();state='COMMITTED_UNPUBLISHED';const record=await observe();await recheck();await publish(record);return record}
 catch(error){const wrapped=Error(error?.message&&/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'SALES_INSTALL_FAILED');wrapped.salesInstallState=error?.message==='INSTALL_RECORD_PUBLISHED_DURABILITY_UNKNOWN'?'PUBLISHED_DURABILITY_UNKNOWN':state;throw wrapped}
}
/** Public receipt only. It conveys no runtime capability; admission still loads the
 * fixed OS-trusted record. Production emits it only after durable publication. */
export function createSalesInstallationReceipt(record,spec){
 const binding=validateWholeSalesRecordV1(record,spec);
 return Object.freeze({format:'WHOLE_SALES_INSTALLATION_RECEIPT_V1',state:'INSTALLED_AND_RECORD_PUBLISHED',
  recordPath:WHOLE_SALES_RECORD_V1_PATH,recordSha256:hash(JSON.stringify(record)+'\n'),installedAt:record.installedAt,
  sourceSpecSha256:spec.source_spec_sha256,combinedSqlSha256:spec.combined_sql_sha256,catalogSha256:binding.catalog_sha256,
  target:Object.freeze({system_identifier:binding.system_identifier,database_oid:binding.database_oid,database_name:binding.database_name}),
  businessImportVerified:false});
}
export function readSalesLaunchHandoff(){
 let ownsHandoff=false;
 try{need(fstatSync(3).isFIFO(),'SALES_INSTALL_PRE_NODE_LAUNCH_REQUIRED');ownsHandoff=true;const bytes=Buffer.alloc(64),length=readSync(3,bytes,0,bytes.length,null);need(bytes.subarray(0,length).toString('utf8')==='WHOLE_SALES_TRUSTED_LAUNCH_V1\n'&&readSync(3,Buffer.alloc(1),0,1,null)===0,'SALES_INSTALL_PRE_NODE_LAUNCH_REQUIRED')}
 catch{throw Error('SALES_INSTALL_PRE_NODE_LAUNCH_REQUIRED')}finally{if(ownsHandoff)try{closeSync(3)}catch{}}
}
async function main(){
 need(process.getuid?.()===0&&process.geteuid?.()===0,'SALES_INSTALL_NATIVE_ROOT_REQUIRED');
 need(process.argv.length===3&&process.argv[2]==='--install-reviewed-sales-v1','SALES_INSTALL_EXPLICIT_INVOCATION_REQUIRED');
 need(!Object.keys(process.env).some(k=>k==='DATABASE_URL'||k.startsWith('PG')||k==='NODE_OPTIONS'||k==='NODE_PATH'||k.startsWith('LD_')||k.startsWith('DYLD_')),'SALES_INSTALL_CLEAN_ENV_REQUIRED');
 need(resolve(fileURLToPath(new URL('../../../',import.meta.url)))===ROOT&&process.execPath===layout.node,'SALES_INSTALL_FIXED_DEPLOYMENT_REQUIRED');
 // Launcher-owned pipe is absent on ordinary direct invocation. It is a launch
 // handoff, not a secret or permission grant; root deployment remains the trust base.
 readSalesLaunchHandoff();
 await assertTrustedRootPath(process.execPath);await assertTrustedRootTree(ROOT);await assertTrustedRootPath(TRUSTED_PSQL_PATH);need(TRUSTED_PSQL_PATH===layout.psql,'SALES_INSTALL_FIXED_DEPLOYMENT_REQUIRED');await assertTrustedRootPath(layout.etc);
 try{await lstat(WHOLE_SALES_RECORD_V1_PATH);throw Error('SALES_INSTALL_RECORD_ALREADY_EXISTS')}catch(e){if(e.code!=='ENOENT')throw e}
 const oldSpec=await loadWholeCatalogSpec(ROOT),oldInput=await rootJson(WHOLE_INSTALLATION_RECORD_PATH),old=validateInstallationRecord(oldInput.value,oldSpec.source_spec_sha256),configInput=await rootJson(CONFIG,true),config=validateSalesIssuerConfig(configInput.value,old),spec=await loadWholeSalesSpecV1(ROOT),candidate=await renderWholeExplicitZeroCandidate(ROOT);
 need(spec.predecessor_source_spec_sha256===oldSpec.source_spec_sha256&&hash(candidate.sql)===spec.combined_sql_sha256,'SALES_INSTALL_SOURCE_DIFFERS');
 await withController(config,c=>packet(c,WHOLE_CATALOG_QUERY,oldSpec,raw=>verifyWholeCatalogPacket(raw,old,oldSpec.source_spec_sha256)));
 const publishedRecord=await completeSalesPublication({
  install:()=>installSql(config,bindSalesInstallSql(candidate.sql,old)),
  observe:()=>withController(config,c=>observeWholeSalesForPublication(c,spec,old)),
  recheck:async()=>{need((await loadWholeSalesSpecV1(ROOT)).source_spec_sha256===spec.source_spec_sha256&&(await rootJson(CONFIG,true)).text===configInput.text&&(await rootJson(WHOLE_INSTALLATION_RECORD_PATH)).text===oldInput.text,'SALES_INSTALL_INPUT_CHANGED')},
  publish:record=>publishInstallationRecord(WHOLE_SALES_RECORD_V1_PATH,JSON.stringify(record)+'\n'),
 });
 process.stdout.write(JSON.stringify(createSalesInstallationReceipt(publishedRecord,spec))+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{if(error?.salesInstallState)process.stderr.write(error.salesInstallState+'\n');if(/^[A-Z][A-Z0-9_]+$/.test(error?.message??''))process.stderr.write(error.message+'\n');process.stderr.write(error?.salesInstallState?'Installation or publication not confirmed. SQL may already be committed; do not rerun or claim rollback. Inspect the target and existing record without logging credentials.\n':'No successor SQL was attempted by this invocation. Inspect the trusted setup without logging credentials.\n');process.exitCode=1});
