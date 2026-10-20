import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {pbkdf2Sync,randomBytes,randomUUID} from 'node:crypto';
import {chmodSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {root,writeJson} from './files.mjs';
import {readDatabaseConfig,assertIsolatedTarget,databaseIdentifier as ident} from '../server/database/config.ts';
import {bootstrapAssertionSql} from '../server/database/identity.ts';
import {runDatabaseCommand} from '../server/database/cli.ts';
import {sqlLiteral as literal} from '../server/database/sql.ts';
import {PgDataAccess} from '../server/database/access.ts';
import {ActionSession} from '../server/database/session.ts';
import {readConfig} from '../server/config.ts';
import {createApp} from '../server/app.ts';
import {calculateHistoryPlan} from '../server/domain/inventory/history-plan.ts';
import {historyImportTarget,importHistoryInventory} from '../server/domain/inventory/history-store.ts';
import {applyHistoryEventChange,historyEventChangeLocks,readHistoryBalance} from '../server/domain/inventory/history-runtime.ts';
import {compareHistoryInventory} from '../server/domain/inventory/history-reconciliation.ts';
import {activateOpeningSnapshot,openingManifestDigest} from '../server/domain/transactions/opening.ts';
import {createHistoryFixture,createRuntimeChange,A,B,SKU,SKU2,SKU3,DOC,PRODUCT,HALL,fixtureId,historicalSaleBody,historicalInactiveTransferBody,cutoff} from './t33/fixtures.mjs';

const pg=process.env.T33_PG_BIN;if(!pg || !isAbsolute(pg))throw Error('T33_PG_BIN must explicitly select a local PostgreSQL 17 installation');
if(Object.keys(process.env).some(k=>/^(?:POSTGRES_|PG(?:HOST|PORT|USER|PASSWORD|DATABASE|SERVICE|PASSFILE)|DATABASE_URL|APP_DATABASE_)/.test(k)))throw Error('T33_AMBIENT_DATABASE_CONFIG_FORBIDDEN');
const out=join(root,'outputs/T33');mkdirSync(out,{recursive:true});mkdirSync(join(root,'logs/T33'),{recursive:true});
const suite=mkdtempSync(join(root,'logs/T33/postgres-suite-')),socket=mkdtempSync(join(tmpdir(),'naijue-t33-')),data=join(suite,'data'),port='55433',admin='t33_bootstrap';
chmodSync(suite,0o700);chmodSync(socket,0o700);
const checks=[],rejections=[],evidence={},dml=[],targets=[];
const result={taskId:'T33',dataClass:'ISOLATED_FIXTURE',status:'RUNNING',suite,socket,checks,rejections,
  productionConnections:0,existingBusinessConnections:0,serverOperations:0,realCredentialsUsed:false,productionActivation:false};
const env={PATH:process.env.PATH,LANG:'C',PGPASSFILE:'/dev/null',PGSSLMODE:'disable'};
const conn=db=>['-h',socket,'-p',port,'-U',admin,'-d',db];
let started=false,app=null,otherAccess=null,config=null;
let label='setup';
const originalQuery=ActionSession.prototype.query;
ActionSession.prototype.query=async function(sql,values){
  const entry=/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(sql)?{label,sql}:null;if(entry)dml.push(entry);
  try{const result=await originalQuery.call(this,sql,values);if(entry)entry.rowCount=result.rowCount;return result;}catch(e){if(entry)entry.failed=true;rejections.push({label,sqlState:e.sqlState??null,sql});throw e;}
};
function noChangedRows(start){const statements=dml.slice(start);assert.ok(statements.every(e=>e.rowCount===0));return {statements:statements.length,affectedRows:0};}
function tool(name,args,file,input){const r=spawnSync(join(pg,name),args,{env,encoding:'utf8',input,maxBuffer:20*1024*1024});
  writeFileSync(join(suite,file),(r.stdout??'')+(r.stderr??''),{flag:'a',mode:0o600});
  writeJson(join(suite,file+'.execution.json'),{binary:join(pg,name),args,exitCode:r.status});assert.equal(r.status,0,name+' failed: '+r.stderr);return r.stdout.trim();}
function adminSql(c,sql){assertIsolatedTarget(c);return tool('psql',['-X','-w','-qAt','-v','ON_ERROR_STOP=1',...conn(c.database)],'fixture-psql.log',bootstrapAssertionSql(c,admin)+'\n'+sql);}
function value(c,sql){return JSON.parse(adminSql(c,sql));}
function fingerprint(c=config){
  const schemas=Object.values(c.schemas),tables=value(c,`SELECT jsonb_agg(jsonb_build_object('s',n.nspname,'t',t.relname) ORDER BY n.nspname,t.relname)
    FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE t.relkind='r' AND n.nspname IN (${schemas.map(literal).join(',')})`);
  const sequences=value(c,`SELECT coalesce(jsonb_agg(jsonb_build_object('s',n.nspname,'t',t.relname) ORDER BY n.nspname,t.relname),'[]'::jsonb)
    FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE t.relkind='S' AND n.nspname IN (${schemas.map(literal).join(',')})`);
  const sql=tables.map(t=>`SELECT jsonb_build_object('schema',${literal(t.s)},'table',${literal(t.t)},'count',count(*),'sha',md5(coalesce(string_agg(h,'' ORDER BY h),'')))
    FROM (SELECT md5(to_jsonb(x)::text) h FROM ${ident(t.s)}.${ident(t.t)} x)y;`).concat(sequences.map(t=>`SELECT jsonb_build_object('sequence',${literal(t.s+'.'+t.t)},'lastValue',last_value::text,'called',is_called) FROM ${ident(t.s)}.${ident(t.t)};`)).join('\n');
  return adminSql(c,sql).split('\n').filter(Boolean).map(x=>JSON.parse(x));
}
const checked=(id,name,details={})=>{checks.push({id,name,status:'PASS',...details});console.log('PASS '+id+': '+name);};
async function rejection(id,work,code){const before=fingerprint(),count=dml.length;let caught;
  try{await work();}catch(e){caught=e;}
  assert.ok(caught,id+' must reject');if(code)assert.equal(caught.code??caught.message,code);
  const after=fingerprint();assert.deepEqual(after,before,id+' changed persistent data');evidence[id]={before,after,dmlAttemptCount:dml.length-count,error:caught.code??caught.message};
  rejections.push({label:id,expected:true,error:caught.code??caught.message});checked(id,'Rejected with all four schemas and sequences unchanged');
}
async function maintenance(e,command,file){let output='';const save=console.log;console.log=(...args)=>{output+=args.join(' ')+'\n';};
  try{await runDatabaseCommand([command],e);}finally{console.log=save;writeFileSync(join(suite,file),output,{mode:0o600});}return JSON.parse(output.trim());}
const accounts=[{id:'t33-admin',role:'管理员',operator:'ADMIN'},{id:'t33-sales',role:'营业员',operator:'SALESPERSON'}],password=randomUUID()+'-ISOLATED-FIXTURE';
function seed(c){const s=ident(c.schemas.source),r=ident(c.schemas.runtime),a=ident(c.schemas.auth),unit=fixtureId(10),pairs=fixtureId(11);
  adminSql(c,`SET ROLE ${ident(c.roles.source)};
    INSERT INTO ${s}.category(id,code,code_normalized,name) VALUES(${literal(PRODUCT)},'T33','T33','Synthetic');
    INSERT INTO ${s}.unit(id,code,code_normalized,name,quantity_scale) VALUES(${literal(unit)},'PIECE','PIECE','件',4),(${literal(pairs)},'PAIR','PAIR','双',4);
    INSERT INTO ${s}.product(id,code,code_normalized,name,category_id,unit_id) VALUES(${literal(PRODUCT)},'T33','T33','Synthetic product',${literal(PRODUCT)},${literal(unit)});
    ${[SKU,SKU2,SKU3].map((id,i)=>`INSERT INTO ${s}.variant(id,product_id,option_key) VALUES(${literal(id)},${literal(PRODUCT)},'T33-${i}');`).join('\n')}
    ${[A,B].map((id,i)=>`INSERT INTO ${s}.warehouse(id,code,code_normalized,name,type,enabled) VALUES(${literal(id)},'W${i}','W${i}','Synthetic ${i}','WAREHOUSE',true);`).join('\n')}
    INSERT INTO ${s}.tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,git_sha,workspace_state_sha256)
      VALUES('T33','ISOLATED_FIXTURE',${literal(c.schemas.source)},${literal(c.database)},'SYNTHETIC',repeat('0',64),'T33','T33','COMMITTED','SYNTHETIC',repeat('0',64));
    INSERT INTO ${s}.tplus_hall(batch_id,id,source_id,source_code,name,warehouse_ids,source_payload) VALUES('T33',${literal(HALL)},'HALL','HALL','Synthetic hall',ARRAY[${literal(A)}::uuid,${literal(B)}::uuid],'{}');
    RESET ROLE;SET ROLE ${ident(c.roles.runtime)};
    ${[A,B].map((id,i)=>`INSERT INTO ${r}.master_data_entity(kind,id,body,source_facts,version,updated_by) VALUES('warehouses',${literal(id)},
      ${literal(JSON.stringify({code:'W'+i,name:'Synthetic '+i,enabled:true,type:'WAREHOUSE',hallRelations:[HALL],sourceOwnershipUnknown:false}))}::jsonb,'{"fixture":"T33"}',1,'T33-FIXTURE');`).join('\n')}
    INSERT INTO ${r}.operator(id,name,role,enabled) VALUES ${accounts.map(a=>`(${literal(a.id)},'Synthetic',${literal(a.operator)},true)`).join(',')};
    INSERT INTO ${r}.master_data_entity(kind,id,body,source_facts,version,updated_by) VALUES
      ('payments',${literal(fixtureId(12))},'{"name":"Synthetic method","enabled":true}','{"fixture":"T33"}',1,'T33-FIXTURE'),
      ('fundAccounts',${literal(fixtureId(13))},${literal(JSON.stringify({name:'Synthetic account',enabled:true,primaryPaymentMethodId:fixtureId(12)}))}::jsonb,'{"fixture":"T33"}',1,'T33-FIXTURE');
    INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,active_effect_identity,active_effect_revision,current_revision,version,business_day)
      VALUES(${literal(DOC)},'SALE','SALE-HISTORY','APPROVED',true,true,'baseline:SALE-HISTORY',1,1,1,'2020-01-20');
    INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id) VALUES(${literal(DOC)},1,true,${literal(JSON.stringify(historicalSaleBody))}::jsonb,NULL);
    INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision,version,business_day)
      VALUES(${literal(fixtureId(9))},'TRANSFER','unapproved-at-t','UNAUDITED',false,false,1,1,'2020-01-10');
    INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id) VALUES(${literal(fixtureId(9))},1,true,${literal(JSON.stringify(historicalInactiveTransferBody))}::jsonb,NULL);
    RESET ROLE;`);
  for(const account of accounts){const salt=randomBytes(24).toString('hex'),hash=pbkdf2Sync(password,salt,210000,32,'sha256').toString('hex'),body={name:'Synthetic',role:account.role,employmentStatus:'在职',loginEnabled:true,loginName:account.id,enabled:true,hallId:HALL,storeId:HALL};
    adminSql(c,`SET ROLE ${ident(c.roles.auth)};INSERT INTO ${a}.employee_login(id,login_name,body,password_salt,password_hash) VALUES(${literal(account.id)},${literal(account.id)},${literal(JSON.stringify(body))}::jsonb,${literal(salt)},${literal(hash)});RESET ROLE;`);}
}
async function login(name,origin){const r=await app.inject({method:'POST',url:'/api/runtime/session',headers:{origin,'content-type':'application/json'},payload:{loginName:name,password}});assert.equal(r.statusCode,200,r.body);
  const cookie=String(r.headers['set-cookie']).split(';')[0];return {cookie,token:cookie.slice(cookie.indexOf('=')+1),csrf:r.json().data.csrfToken};}
const success=r=>{assert.equal(r.statusCode,200,r.body);return r.json().data;};
const get=(session,url)=>app.inject({method:'GET',url,headers:{cookie:session.cookie}});
const command=(s,input,origin)=>app.inject({method:'POST',url:'/api/runtime/command',headers:{cookie:s.cookie,origin,'content-type':'application/json','x-csrf-token':s.csrf,'x-request-id':input.requestKey},payload:input});

try{
  assert.match(tool('postgres',['--version'],'version.log'),/PostgreSQL\) 17\./);
  tool('initdb',['-D',data,'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C'],'initdb.log');
  started=true;tool('pg_ctl',['-D',data,'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'],'start.log');
  const cluster=JSON.parse(tool('psql',['-X','-w','-qAt',...conn('postgres'),'-c',"SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"],'identity.log'));
  assert.equal(cluster.listenAddresses,'');assert.equal(cluster.dataDirectory,data);result.cluster=cluster;
  const suffix=randomUUID().replaceAll('-','').slice(0,8),prefix='t33qa_'+suffix;
  const environment={APP_ENV:'qa',APP_DATABASE_MODE:'required',POSTGRES_HOST:socket,POSTGRES_PORT:port,POSTGRES_DB:'demo_8877_t33_qa_'+suffix,
    POSTGRES_USER:prefix+'_app',POSTGRES_ROLE_PREFIX:prefix,POSTGRES_SOURCE_SCHEMA:'t33_source',POSTGRES_RUNTIME_SCHEMA:'t33_runtime',POSTGRES_AUTH_SCHEMA:'t33_auth',POSTGRES_CONTROL_SCHEMA:'t33_control',
    POSTGRES_INSTANCE_ID:randomUUID(),POSTGRES_CLUSTER_ID:cluster.clusterId,POSTGRES_BOOTSTRAP_USER:admin,PSQL_BIN:join(pg,'psql'),
    SESSION_ORIGIN:'https://t33.invalid',SESSION_SECRET_FILE:join(suite,'synthetic-session.key'),MEDIA_STORAGE_ROOT:join(suite,'media')};
  const origin=environment.SESSION_ORIGIN;
  tool('createdb',[...conn('postgres').slice(0,-2),'-T','template0',environment.POSTGRES_DB],'create.log');
  writeFileSync(environment.SESSION_SECRET_FILE,randomBytes(48),{mode:0o600});config=readDatabaseConfig(environment);targets.push(historyImportTarget(config));
  await maintenance(environment,'bootstrap','bootstrap.json');const migrations=await maintenance(environment,'migrate','migrate.json');assert.equal(migrations.versions.length,12);
  seed(config);app=createApp(readConfig(environment));const fixture=createHistoryFixture(join(out,'fixtures',suffix),{bindSale:true,bindInactiveTransfer:true,duplicate:true}),input=fixture.input,target=historyImportTarget(config),r=ident(config.schemas.runtime);
  const plan=calculateHistoryPlan(input);writeJson(join(out,'fixtures',suffix,'calculated-manifest.json'),plan);result.fixtureDirectory=fixture.dir;
  checked('DB00','Fresh private PostgreSQL 17, QA app/migrator roles, no TCP, synthetic-only data, all 12 migrations');
  const importing=()=>importHistoryInventory(app.dataAccess,config,target,fixture.dir,input);
  label='DB01';await rejection('DB01',()=>importHistoryInventory(app.dataAccess,{...config,environment:'production'},target,fixture.dir,input),'ISOLATED_DATABASE_REQUIRED');
  label='DB20';await rejection('DB20',()=>importHistoryInventory(app.dataAccess,{...config,database:'erp_prod'},target,fixture.dir,input),'ISOLATED_DATABASE_REQUIRED');
  label='DB02';await rejection('DB02',()=>importHistoryInventory(app.dataAccess,config,{...target,database:'demo_8877_other'},fixture.dir,input),'DECLARED_HISTORY_TARGET_MISMATCH');
  label='DB03';await rejection('DB03',()=>importHistoryInventory(app.dataAccess,config,{...target,instanceId:randomUUID()},fixture.dir,input),'DECLARED_HISTORY_TARGET_MISMATCH');
  const original=readFileSync(join(fixture.dir,'source-evidence.json'));writeFileSync(join(fixture.dir,'source-evidence.json'),Buffer.concat([original,Buffer.from(' ')]));
  label='DB04';await rejection('DB04',importing,'ORIGINAL_ARTIFACT_HASH_CHANGED');writeFileSync(join(fixture.dir,'source-evidence.json'),original);
  const altered=structuredClone(input);altered.originalOpenings[0].quantity='11';label='DB05';await rejection('DB05',()=>importHistoryInventory(app.dataAccess,config,target,fixture.dir,altered),'EXCHANGE_DATA_NOT_BOUND_TO_ARTIFACT');
  label='DB26';const unknownFixture=createHistoryFixture(join(out,'fixtures',suffix+'-unknown'),{extraKeys:[{warehouseId:A,originalSkuId:fixtureId(99),measurementUnit:'件'}]});
  await rejection('DB26',()=>importHistoryInventory(app.dataAccess,config,target,unknownFixture.dir,unknownFixture.input),'TARGET_ORIGINAL_IDENTITY_MISSING');
  label='DB30';const wrongBinding=createHistoryFixture(join(out,'fixtures',suffix+'-wrong-binding'),{bindSale:true,adjustEvents:events=>{events.find(e=>e.eventId==='SALE-HISTORY').versions[0].lines[0].quantity='3';}});
  await rejection('DB30',()=>importHistoryInventory(app.dataAccess,config,target,wrongBinding.dir,wrongBinding.input),'RUNTIME_DOCUMENT_CONTRIBUTION_BINDING_MISMATCH');
  const foreignPrefix=prefix+'_other',foreignEnvironment={...environment,POSTGRES_DB:'demo_8877_t33_other_'+suffix,POSTGRES_USER:foreignPrefix+'_app',POSTGRES_ROLE_PREFIX:foreignPrefix,POSTGRES_INSTANCE_ID:randomUUID()};
  tool('createdb',[...conn('postgres').slice(0,-2),'-T','template0',foreignEnvironment.POSTGRES_DB],'foreign-create.log');
  await maintenance(foreignEnvironment,'bootstrap','foreign-bootstrap.json');await maintenance(foreignEnvironment,'migrate','foreign-migrate.json');
  const foreignConfig=readDatabaseConfig(foreignEnvironment);otherAccess=new PgDataAccess(foreignConfig);targets.push(historyImportTarget(foreignConfig));
  label='DB21';const foreignBefore=fingerprint(foreignConfig);await rejection('DB21',()=>importHistoryInventory(otherAccess,config,target,fixture.dir,input),'CONNECTED_HISTORY_TARGET_MISMATCH');assert.deepEqual(fingerprint(foreignConfig),foreignBefore);
  evidence.DB21.foreignBefore=foreignBefore;evidence.DB21.foreignAfter=fingerprint(foreignConfig);
  adminSql(config,`SET ROLE ${ident(config.roles.source)};INSERT INTO ${ident(config.schemas.source)}.tplus_inventory_balance_source(batch_id,source_id,variant_id,warehouse_id,quantity,unit,opening_quantity,cutoff_source_date,snapshot_used,apply_historical_documents_again,source_event_count,components,source_payload)
    VALUES('T33','FORBIDDEN_REPORT_BALANCE',${literal(SKU)},${literal(A)},123,'件',123,'2020-02-01',true,false,0,'{}','{"fixture":"ISOLATED_FIXTURE"}');RESET ROLE;`);
  label='DB22';await rejection('DB22',importing,'NEW_EMPTY_INVENTORY_TARGET_REQUIRED');
  adminSql(config,`SET ROLE ${ident(config.roles.source)};DELETE FROM ${ident(config.schemas.source)}.tplus_inventory_balance_source WHERE source_id='FORBIDDEN_REPORT_BALANCE';RESET ROLE;`);
  adminSql(config,`SET ROLE ${ident(config.roles.runtime)};CREATE FUNCTION ${r}.t33_fail_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_T33_IMPORT_FAILURE'; END $$;
    CREATE TRIGGER t33_fail_import AFTER INSERT ON ${r}.inventory_history_event FOR EACH ROW WHEN (NEW.event_id='out') EXECUTE FUNCTION ${r}.t33_fail_import();RESET ROLE;`);
  label='DB06';await rejection('DB06',importing);assert.ok(evidence.DB06.dmlAttemptCount>5,'Failure must occur after actual writes');
  adminSql(config,`SET ROLE ${ident(config.roles.runtime)};DROP TRIGGER t33_fail_import ON ${r}.inventory_history_event;RESET ROLE;`);
  label='DB07';const first=await importing();assert.equal(first.applied,true);assert.equal(first.eventCount,11);assert.equal(first.cellCount,5);writeJson(join(suite,'first-import.json'),first);
  checked('DB07','Failed import retry commits exactly 5 unit cells, 11 canonical events, all opening/T legs and source aliases');
  label='DB08';const before=fingerprint(),dmlBefore=dml.length,repeat=await importing(),after=fingerprint();assert.equal(repeat.applied,false);assert.equal(repeat.writes,0);assert.equal(dml.length,dmlBefore);assert.deepEqual(after,before);evidence.DB08={before,after,repeat,actualDmlStatements:0};checked('DB08','Duplicate import: zero DML and every table/sequence unchanged');
  label='DB09';const revision={...input,revision:'DIFFERENT-BASE'};await rejection('DB09',()=>importHistoryInventory(app.dataAccess,config,target,fixture.dir,revision),'HISTORY_BASELINE_ALREADY_BOUND');
  const lowPlan={revision:'FORBIDDEN-LEGACY-REPLACEMENT',businessDay:'2020-02-01',sourceSha256:input.artifacts[0].sha256,sourceFile:'ISOLATED_FIXTURE',rulesSha256:input.artifacts[1].sha256,
    standardPackSha256:input.artifacts[2].sha256,expectedActiveRevision:null,expectedCellCount:1,expectedCoveredBaselineDocumentCount:0,manifestSha256:'',issues:[],
    cells:[{warehouseId:A,skuId:SKU,quantity:'999',unit:'件',sourceCell:'SYNTHETIC!A1',sourceRecord:{dataClass:'ISOLATED_FIXTURE'}}],coveredBaselineDocuments:[]};lowPlan.manifestSha256=openingManifestDigest(lowPlan);
  label='DB23';await rejection('DB23',()=>app.dataAccess.transaction(s=>activateOpeningSnapshot(s,{source:ident(config.schemas.source),runtime:r},lowPlan)),'REVISION');
  const adminSession=await login(accounts[0].id,origin),salesSession=await login(accounts[1].id,origin);
  label='DB10';const queryBefore=fingerprint(),all=success(await get(adminSession,'/api/inventory?size=200'));
  assert.equal(all.total,5);assert.equal(all.reconciled,true);assert.deepEqual(new Set(all.items.filter(x=>x.skuId===SKU).map(x=>x.unit)),new Set(['件','双']));assert.equal(all.items.find(x=>x.skuId===SKU2).quantity,'-4.0000');
  const history=success(await get(adminSession,`/api/inventory/ledger?warehouseId=${A}&skuId=${SKU}&unit=件`));assert.ok(history.items.some(x=>x.kind==='COUNTED_HISTORY'&&x.stockDelta==='0'));
  assert.equal((await get(adminSession,`/api/inventory/ledger?warehouseId=${A}&skuId=${SKU}`)).statusCode,409);assert.deepEqual(fingerprint(),queryBefore);evidence.DB10={before:queryBefore,after:fingerprint(),all,history};checked('DB10','T19 reads distinct units, negative inventory and counted-history provenance without writing');
  const base=()=>app.dataAccess.read(s=>readHistoryBalance(s,r,A,SKU3));assert.equal(await base(),'100.0000');
  label='DB11';const deniedBefore=fingerprint();assert.equal((await command(salesSession,{documentId:DOC,documentType:'SALE',operation:'unapprove',expectedVersion:1,requestKey:'sales-denied'},origin)).statusCode,403);assert.deepEqual(fingerprint(),deniedBefore);checked('DB11','T10 refuses unauthorized historical correction with no business mutation');
  label='DB12';const unapprove={documentId:DOC,documentType:'SALE',operation:'unapprove',expectedVersion:1,requestKey:'history-unapprove'};
  success(await command(adminSession,unapprove,origin));assert.equal(await base(),'102.0000');const retryBefore=fingerprint(),unapproveRepeatDml=dml.length;success(await command(adminSession,unapprove,origin));assert.deepEqual(fingerprint(),retryBefore);const unapproveRetry=noChangedRows(unapproveRepeatDml);
  const body={header:{...historicalSaleBody.header,business_date:'2020-02-02'},lines:[{source_id:'SALE-L1',sku_id:SKU3,warehouse_id:A,source_quantity:'3',unit:'件',unit_price:'10.00',amount:'30.00'}],
    fundsRecords:[{source_id:'SYNTHETIC-SETTLEMENT',settlement_id:'SYNTHETIC-SETTLEMENT',payment_method_id:fixtureId(12),fund_account_id:fixtureId(13),amount:'30.00',direction:'receipt'}]};
  success(await command(adminSession,{documentId:DOC,documentType:'SALE',operation:'save',expectedVersion:2,requestKey:'history-save',body},origin));
  const reapproval={documentId:DOC,documentType:'SALE',operation:'approve',expectedVersion:3,requestKey:'history-reapprove',body};success(await command(adminSession,reapproval,origin));assert.equal(await base(),'99.0000');
  const reapproveBefore=fingerprint(),reapproveRepeatDml=dml.length;success(await command(adminSession,reapproval,origin));const reapproveRetry=noChangedRows(reapproveRepeatDml);assert.deepEqual(fingerprint(),reapproveBefore);
  const ledger=success(await get(adminSession,`/api/inventory/ledger?warehouseId=${A}&skuId=${SKU3}&unit=件`));assert.equal(ledger.reconstructedQuantity,'99.0000');
  assert.ok(ledger.items.some(x=>x.before==='100.0000'&&x.after==='102.0000'));assert.ok(ledger.items.some(x=>x.before==='102.0000'&&x.after==='99.0000'));evidence.DB12={ledger,sequence:['100','102','99'],reapproveBefore,reapproveAfter:fingerprint(),unapproveRetry,reapproveRetry};
  assert.equal(value(config,`SELECT jsonb_build_object('actor',actor_id) FROM ${r}.revision WHERE document_id=${literal(DOC)}::uuid AND revision=1`).actor,null);checked('DB12','S10 via real T10/T17: counted history 100 → 102 → 99; retry has zero writes and original unknown actor remains null');
  label='DB13';const replayBefore=fingerprint();const historicalReplay=await command(adminSession,{documentId:randomUUID(),documentType:'TRANSFER',operation:'create',expectedVersion:0,requestKey:'alias-replay',body:{header:{business_date:'2020-02-02',source_number:'DIRECT-3',source_from_warehouse_id:A,source_to_warehouse_id:B},lines:[{sku_id:SKU,from_warehouse_id:A,to_warehouse_id:B,source_quantity:'3',unit:'件'}],fundsRecords:[]}},origin);
  assert.equal(historicalReplay.statusCode,409,historicalReplay.body);assert.deepEqual(fingerprint(),replayBefore);checked('DB13','Already-counted cross-source alias cannot be created as a new runtime document');
  label='DB14';const transferId=randomUUID(),transferBody={header:{business_date:'2020-02-02',source_from_warehouse_id:A,source_to_warehouse_id:B},lines:[{sku_id:SKU,from_warehouse_id:A,to_warehouse_id:B,source_quantity:'1',unit:'件'}],fundsRecords:[]};
  success(await command(adminSession,{documentId:transferId,documentType:'TRANSFER',operation:'create',expectedVersion:0,requestKey:'new-transfer-create',body:transferBody},origin));
  const approval={documentId:transferId,documentType:'TRANSFER',operation:'approve',expectedVersion:1,requestKey:'new-transfer-approve',body:transferBody};success(await command(adminSession,approval,origin));
  const readUnit=(w,u)=>app.dataAccess.read(s=>readHistoryBalance(s,r,w,SKU,u));assert.equal(await readUnit(A,'件'),'1.0000');assert.equal(await readUnit(B,'件'),'4.0000');assert.equal(await readUnit(A,'双'),'1.1250');
  const transferBefore=fingerprint();success(await command(adminSession,approval,origin));assert.deepEqual(fingerprint(),transferBefore);
  success(await command(adminSession,{documentId:transferId,documentType:'TRANSFER',operation:'unapprove',expectedVersion:2,requestKey:'new-transfer-unapprove'},origin));assert.equal(await readUnit(A,'件'),'2.0000');assert.equal(await readUnit(B,'件'),'3.0000');checked('DB14','After-T two-end transfer affects validated 件 only; retry/reversal once, 双 unchanged');
  label='DB15';await rejection('DB15',()=>app.dataAccess.read(s=>readHistoryBalance(s,r,A,SKU)),'EXPLICIT_MEASUREMENT_UNIT_REQUIRED');
  label='DB27';const unitConflictBefore=fingerprint(),conflictBody=structuredClone(transferBody);conflictBody.lines[0].measurement_unit='双';
  const conflictId=randomUUID();success(await command(adminSession,{documentId:conflictId,documentType:'TRANSFER',operation:'create',expectedVersion:0,requestKey:'unit-conflict-create',body:conflictBody},origin));
  const conflictBefore=fingerprint();assert.equal((await command(adminSession,{documentId:conflictId,documentType:'TRANSFER',operation:'approve',expectedVersion:1,requestKey:'unit-conflict-approve',body:conflictBody},origin)).statusCode,400);assert.deepEqual(fingerprint(),conflictBefore);
  assert.ok(unitConflictBefore.length>0);checked('DB27','Conflicting unit/measurement_unit cannot bypass normal transfer unit validation');
  label='DB16';const change=createRuntimeChange(fixture,'source-unapprove','in','UNAPPROVED','2020-02-02T12:00:00+08:00');
  const sourceChange=c=>app.identity.execute(adminSession.token,'imports.referenceCommit',{kind:'reference-import',kinds:['masters']},ctx=>applyHistoryEventChange(ctx,c,fixture.dir),historyEventChangeLocks(c));
  const changed=await sourceChange(change);assert.equal(changed.applied,true);assert.equal(await readUnit(A,'件'),'-5.0000');const changedBefore=fingerprint();assert.equal((await sourceChange(change)).applied,false);assert.deepEqual(fingerprint(),changedBefore);
  const restore=createRuntimeChange(fixture,'source-reapprove','in','EFFECTIVE','2020-02-03T12:00:00+08:00',1);await sourceChange(restore);assert.equal(await readUnit(A,'件'),'2.0000');checked('DB16','Authorized source correction reverses/restores only its counted legs once, without reversing original opening');
  label='DB17';const stale={...restore,requestKey:'source-stale',expectedOrdinal:0};await rejection('DB17',()=>sourceChange(stale),'HISTORY_CHANGE_VERSION_CONFLICT');
  label='DB24';const forged=structuredClone(restore);forged.requestKey='forged-source';forged.expectedOrdinal=2;forged.inputs.legs[0].candidateQuantity='8';forged.inputs.legs[0].contributionQuantity='8';
  await rejection('DB24',()=>sourceChange(forged),'HISTORY_CHANGE_NOT_BOUND_TO_T31_EXCHANGE');
  const newEvent=structuredClone(fixture.rawEvents.find(e=>e.eventId==='after-t-transfer'));newEvent.eventId='NEW-SOURCE-TRANSFER';newEvent.sourceNumber=newEvent.eventId;newEvent.sourceNumbers=[newEvent.eventId];newEvent.sourceAliases=[{dataset:'ISOLATED_FIXTURE',number:newEvent.eventId}];
  for(const v of newEvent.versions)for(const l of v.lines){l.eventId=newEvent.eventId;l.lineId=newEvent.eventId+'-L1';l.quantity='1';}newEvent.transitions=newEvent.transitions.slice(0,1);fixture.rawEvents.push(newEvent);
  label='DB28';const newChange=createRuntimeChange(fixture,'new-source-transfer',newEvent.eventId,'EFFECTIVE','2020-02-04T12:00:00+08:00',0,'NEW_AFTER_CUTOFF');
  const newResult=await sourceChange(newChange);assert.equal(newResult.applied,true);assert.equal(await readUnit(A,'件'),'1.0000');assert.equal(await readUnit(B,'件'),'4.0000');
  const newBefore=fingerprint();assert.equal((await sourceChange(newChange)).applied,false);assert.deepEqual(fingerprint(),newBefore);
  await sourceChange(createRuntimeChange(fixture,'new-source-reverse',newEvent.eventId,'UNAPPROVED','2020-02-05T12:00:00+08:00',1));assert.equal(await readUnit(A,'件'),'2.0000');assert.equal(await readUnit(B,'件'),'3.0000');checked('DB28','Proven post-T source event uses 0-at-baseline proof, both endpoints once, retry zero writes and authorized reversal');
  const badEvent=structuredClone(fixture.rawEvents.find(e=>e.eventId==='transfer'));badEvent.eventId='DISGUISED-OLD-EVENT';badEvent.sourceNumber=badEvent.eventId;badEvent.sourceNumbers=[badEvent.eventId];badEvent.sourceAliases=[];
  for(const v of badEvent.versions)for(const l of v.lines){l.eventId=badEvent.eventId;l.lineId=badEvent.eventId+'-L1';}fixture.rawEvents.push(badEvent);
  label='DB29';const disguised=createRuntimeChange(fixture,'disguised-old-source',badEvent.eventId,'EFFECTIVE','2020-02-06T12:00:00+08:00',0,'NEW_AFTER_CUTOFF');
  await rejection('DB29',()=>sourceChange(disguised),'NEW_EVENT_ALREADY_EFFECTIVE_AT_BASELINE');
  const originalFamily=fixture.rawEvents.find(e=>e.eventId==='in').family;fixture.rawEvents.find(e=>e.eventId==='in').family='STOCKTAKING_GAIN';
  label='DB31';const changedFamily=createRuntimeChange(fixture,'changed-canonical-family','in','EFFECTIVE','2020-02-07T12:00:00+08:00',2);
  await rejection('DB31',()=>sourceChange(changedFamily),'HISTORY_CHANGE_CANONICAL_PACKET_MISMATCH');fixture.rawEvents.find(e=>e.eventId==='in').family=originalFamily;
  const failureDoc=randomUUID();success(await command(adminSession,{documentId:failureDoc,documentType:'TRANSFER',operation:'create',expectedVersion:0,requestKey:'failure-create',body:transferBody},origin));
  adminSql(config,`SET ROLE ${ident(config.roles.runtime)};CREATE FUNCTION ${r}.t33_fail_runtime() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_T33_RUNTIME_FAILURE'; END $$;
    CREATE TRIGGER t33_fail_runtime AFTER INSERT ON ${r}.inventory_history_movement FOR EACH ROW EXECUTE FUNCTION ${r}.t33_fail_runtime();RESET ROLE;`);
  label='DB25';const failedBefore=fingerprint(),failureApproval={documentId:failureDoc,documentType:'TRANSFER',operation:'approve',expectedVersion:1,requestKey:'failure-approve',body:transferBody},attemptedDml=dml.length;
  assert.equal((await command(adminSession,failureApproval,origin)).statusCode,409);assert.deepEqual(fingerprint(),failedBefore);assert.ok(dml.length>attemptedDml);evidence.DB25={before:failedBefore,after:fingerprint(),dmlAttemptCount:dml.length-attemptedDml};
  adminSql(config,`SET ROLE ${ident(config.roles.runtime)};DROP TRIGGER t33_fail_runtime ON ${r}.inventory_history_movement;RESET ROLE;`);
  success(await command(adminSession,failureApproval,origin));success(await command(adminSession,{documentId:failureDoc,documentType:'TRANSFER',operation:'unapprove',expectedVersion:2,requestKey:'failure-unapprove'},origin));
  checked('DB25','Injected unit movement failure rolls back document/revision/posting/idempotency; same request succeeds after repair');
  label='DB32';const inactiveApproval={documentId:fixtureId(9),documentType:'TRANSFER',operation:'approve',expectedVersion:1,requestKey:'inactive-history-approve',body:historicalInactiveTransferBody};
  success(await command(adminSession,inactiveApproval,origin));assert.equal(await readUnit(A,'件'),'1.0000');assert.equal(await readUnit(B,'件'),'4.0000');
  const inactiveBefore=fingerprint(),inactiveRepeatDml=dml.length;success(await command(adminSession,inactiveApproval,origin));assert.deepEqual(fingerprint(),inactiveBefore);const inactiveRetry=noChangedRows(inactiveRepeatDml);
  success(await command(adminSession,{documentId:fixtureId(9),documentType:'TRANSFER',operation:'unapprove',expectedVersion:2,requestKey:'inactive-history-unapprove'},origin));assert.equal(await readUnit(A,'件'),'2.0000');assert.equal(await readUnit(B,'件'),'3.0000');
  evidence.DB32={stateAtBaseline:'UNAPPROVED',baselineContribution:['0','0'],afterApproval:['1','4'],afterReversal:['2','3'],inactiveRetry};
  checked('DB32','Historical inactive document stays zero at T, authorized later T17 approval/retry/reversal each affects both endpoints once');
  const final=success(await get(adminSession,'/api/inventory?size=200'));assert.equal(final.reconciled,true);assert.equal(value(config,`SELECT count(*)::integer FROM ${r}.inventory_delta`),0);checked('DB18','Runtime balances reconcile to unit movements; old two-dimensional delta remains empty');
  const comparison={cutoff,complete:true,rows:plan.cells.map(c=>({warehouseId:c.warehouseId,originalSkuId:c.originalSkuId,measurementUnit:c.measurementUnit,quantity:c.quantity,sourceRowReferences:c.eventReferences}))};
  const mismatch=structuredClone(comparison);[mismatch.rows[0].quantity,mismatch.rows[1].quantity]=[mismatch.rows[1].quantity,mismatch.rows[0].quantity];assert.equal(compareHistoryInventory(comparison,mismatch,comparison).matches,false);checked('DB19','Equal aggregate but swapped key quantities fail reconciliation without balance backfill');
  result.status='PASS';result.completedAt=new Date().toISOString();result.targets=targets;result.finalQuery=final;result.import=first;result.actualDml=dml.length;
}catch(e){result.status='FAIL';result.failure=e instanceof Error?e.message:String(e);result.completedAt=new Date().toISOString();throw e;}
finally{
  if(app)await app.close().catch(()=>{});if(otherAccess)await otherAccess.close().catch(()=>{});
  if(started){const stop=spawnSync(join(pg,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{encoding:'utf8',env});writeFileSync(join(suite,'stop.log'),(stop.stdout??'')+(stop.stderr??''),{mode:0o600});result.clusterStopped=stop.status===0;
    const status=spawnSync(join(pg,'pg_ctl'),['-D',data,'status'],{encoding:'utf8',env});result.stoppedStatusExitCode=status.status;if(stop.status!==0)result.status='FAIL';}
  writeJson(join(suite,'RESULT.json'),result);writeJson(join(suite,'fingerprints.json'),evidence);writeJson(join(suite,'actual-dml.json'),dml);writeJson(join(out,'latest-verification.json'),{suite,status:result.status,fixtureDirectory:result.fixtureDirectory});
  if(result.status==='PASS'){assert.equal(result.clusterStopped,true);assert.equal(result.stoppedStatusExitCode,3);writeJson(join(out,'database-verification.json'),result);}
}
