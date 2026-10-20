import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {createHash, pbkdf2Sync, randomBytes, randomUUID} from 'node:crypto';
import {chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {join, isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root, writeJson, fileRecords} from './files.mjs';
import {runDatabaseCommand} from '../server/database/cli.ts';
import {readDatabaseConfig, assertIsolatedTarget, databaseIdentifier as ident} from '../server/database/config.ts';
import {bootstrapAssertionSql} from '../server/database/identity.ts';
import {sqlLiteral as literal} from '../server/database/sql.ts';
import {readConfig} from '../server/config.ts';
import {readInventoryBalance} from '../server/domain/transactions/inventory.ts';
import {activateOpeningSnapshot, openingManifestDigest} from '../server/domain/transactions/opening.ts';
import {exerciseSaleBridge} from './t21-bridge-harness.mjs';
import {verifySaleHallVisibility} from './t21-hall-checks.mjs';

const pg=process.env.T21_PG_BIN;
if(!pg||!isAbsolute(pg))throw Error('T21_PG_BIN must explicitly select local PostgreSQL 17');
const evidenceRun=process.env.T21_EVIDENCE_RUN;
if(evidenceRun!==undefined&&!/^[a-z0-9][a-z0-9-]{0,63}$/.test(evidenceRun))throw Error('Invalid T21 evidence run');
const out=join(root,'outputs/T21',evidenceRun??''),logs=join(root,'logs/T21',evidenceRun??'');
mkdirSync(out,{recursive:true});mkdirSync(logs,{recursive:true});chmodSync(logs,0o700);
const suite=mkdtempSync(join(logs,'postgres-suite-'));chmodSync(suite,0o700);
const compiled=join(suite,'compiled');
const compilation=spawnSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'-p',join(root,'tsconfig.json'),'--outDir',compiled],{encoding:'utf8'});
writeFileSync(join(suite,'typecheck-snapshot.log'),(compilation.stdout??'')+(compilation.stderr??''));assert.equal(compilation.status,0,'Private strict backend compilation failed');
cpSync(join(root,'server/database/sql'),join(compiled,'database/sql'),{recursive:true});
const {createApp}=await import(pathToFileURL(join(compiled,'app.js')).href);
const data=join(suite,'data'),socket=mkdtempSync(join(tmpdir(),'naijue-t21-socket-')),admin='t21_bootstrap',port='55495';
chmodSync(socket,0o700);
assert.ok(Buffer.byteLength(join(socket,'.s.PGSQL.'+port))<104);assert.equal(existsSync(join(socket,'.s.PGSQL.'+port)),false);
const digest=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const checks=[],denials=[],targets=[],result={task:'T21',status:'RUNNING',startedAt:new Date().toISOString(),suite,socket,checks,denials,targets,
 evidenceRun:evidenceRun??null,executableBackend:{strictCompilation:true,path:compiled,files:fileRecords(compiled),sources:fileRecords(join(root,'server'))},
 productionConnections:0,existingBusinessConnections:0,serverOperations:0,realCredentialsUsed:false};
let app=null,config=null,started=false;
function tool(name,args,file){
 const run=spawnSync(join(pg,name),args,{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C',PGPASSFILE:'/dev/null'},maxBuffer:8*1024*1024});
 writeFileSync(join(suite,file),(run.stdout??'')+(run.stderr??''),{mode:0o600});assert.equal(run.status,0,name+' failed; see '+file);return run.stdout.trim();
}
const conn=database=>['-h',socket,'-p',port,'-U',admin,'-d',database];
function adminSql(sql){
 assertIsolatedTarget(config);
 assert.equal(config.host,socket);assert.equal(config.database,databaseName);
 const run=spawnSync(join(pg,'psql'),['-X','-w','-qAt','-v','ON_ERROR_STOP=1',...conn(config.database)],{input:bootstrapAssertionSql(config,admin)+'\n'+sql,
  encoding:'utf8',maxBuffer:16*1024*1024,env:{PATH:process.env.PATH,PGPASSFILE:'/dev/null',PGOPTIONS:'-c search_path=pg_catalog -c timezone=UTC'}});
 if(run.status!==0){const error=(run.stderr??'').split(/\r?\n/).find(l=>l.startsWith('ERROR:'))??'SQL_FAILED';writeFileSync(join(suite,'fixture-errors.log'),error+'\n',{flag:'a',mode:0o600});throw Error(error);}
 return run.stdout.trim();
}
const value=sql=>JSON.parse(adminSql(sql));
async function maintenance(command){
 let capture='';const logger=console.log;console.log=(...args)=>{capture+=args.join(' ')+'\n';};
 try{await runDatabaseCommand([command],env);}finally{console.log=logger;writeFileSync(join(suite,'qa-'+command+'.log'),capture,{mode:0o600});}
 return JSON.parse(capture.trim());
}
const checked=(id,details={})=>{const {id:documentId,...facts}=details;checks.push({id,status:'PASS',...(documentId?{documentId}:{}),...facts});console.log('PASS: '+id);};
const uid=n=>`21000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const w1=uid(201),w2=uid(202),hall=uid(301),otherHall=uid(302),method=uid(501),account=uid(502),otherMethod=uid(503),otherAccount=uid(504),retiredAccount=uid(505);
const p1=uid(101),p2=uid(102),decimalProduct=uid(103),sku1=uid(111),sku2=uid(112),decimalSku=uid(113),historicalZero=uid(401),historicalFive=uid(402);
const colorDimension=uid(601),colorId=uid(602),sizeDimension=uid(603),sizeId=uid(604);
const suffix=randomUUID().replaceAll('-','').slice(0,8),prefix='t21qa_'+suffix,databaseName='demo_8877_t21_qa_'+suffix;
const env={APP_ENV:'qa',APP_DATABASE_MODE:'required',POSTGRES_HOST:socket,POSTGRES_PORT:port,POSTGRES_DB:databaseName,
 POSTGRES_USER:prefix+'_app',POSTGRES_ROLE_PREFIX:prefix,POSTGRES_SOURCE_SCHEMA:'t21_source',POSTGRES_RUNTIME_SCHEMA:'t21_runtime',
 POSTGRES_AUTH_SCHEMA:'t21_auth',POSTGRES_CONTROL_SCHEMA:'t21_control',POSTGRES_INSTANCE_ID:randomUUID(),POSTGRES_CLUSTER_ID:'',POSTGRES_BOOTSTRAP_USER:admin,
 PSQL_BIN:join(pg,'psql'),SESSION_ORIGIN:'https://t21.invalid',SESSION_SECRET_FILE:join(suite,'synthetic-session.key'),MEDIA_STORAGE_ROOT:join(suite,'media')};
const actors={admin:{id:'t21-admin',name:'Synthetic Admin',role:'管理员',operatorRole:'ADMIN'},warehouse:{id:'t21-warehouse',name:'Synthetic Warehouse',role:'仓库人员',operatorRole:'WAREHOUSE'},
 sales:{id:'t21-sales',name:'Synthetic Sales',role:'营业员',operatorRole:'SALESPERSON',storeId:hall},peerSales:{id:'t21-peer-sales',name:'Synthetic Peer Sales',role:'营业员',operatorRole:'SALESPERSON',storeId:hall},otherSales:{id:'t21-other-sales',name:'Synthetic Other Sales',role:'营业员',operatorRole:'SALESPERSON',storeId:otherHall}};
const password=randomUUID()+'-synthetic-only';
const line=(id,price='10.00',q='1',sku=sku1,extra={})=>({source_id:id,sku_id:sku,warehouse_id:w1,source_quantity:q,unit_price:price,gift:false,...extra});
const fund=(id,amount,extra={})=>({source_id:id,settlement_id:id,payment_method_id:method,fund_account_id:account,amount,direction:Number(amount)>0?'receipt':Number(amount)<0?'refund':'zero',...extra});
const body=(lines,funds=[],extra={})=>({header:{business_date:'2026-10-02',business_type:'SALE',hall_id:hall,source_warehouse_id:w1,adjustment:'0.00',note:'synthetic',...extra},lines,fundsRecords:funds});
const historicalBody=(zero=false)=>body([line(zero?'H0-L1':'H5-L1',zero?'0.0000':'12.3456',zero?'1.0000':'2.0000',sku1,
 {amount:zero?'0.00':'24.69',gift:zero,unit:'件',stock_quantity_contribution:zero?'-1':'-2',product_id:p1,color_id:colorId,size_id:sizeId,source_product_code:'P1',source_product_name:'Historical original name',source_color_name:'蓝色',source_size_name:'M',source_lineage:{fixture:'T21',sourceLine:zero?'H0-L1':'H5-L1'}})],
 zero?[]:['1.00','2.00','3.00','4.00','14.69'].map((amount,i)=>fund('H5-F'+i,amount,{fund_account_id:retiredAccount,source_payment_method_name:'Historical original method',source_fund_account_name:'Historical original account',source_payload:{historicalRow:i}})),
 {business_date:'2026-10-01',source_payload:{sourceAuditor:null,sourceCreatedBy:null}});

function seed(){
 const s=ident(config.schemas.source),r=ident(config.schemas.runtime),a=ident(config.schemas.auth);
 const masters=[['halls',hall,{name:'Synthetic Hall',enabled:true}],['halls',otherHall,{name:'Synthetic Other Hall',enabled:true}],
  ...[w1,w2].map((id,i)=>['warehouses',id,{name:'Synthetic Warehouse '+i,enabled:true,type:'WAREHOUSE',hallRelations:[hall,otherHall],sourceOwnershipUnknown:false}]),
  ['payments',method,{name:'Current method',enabled:true}],['payments',otherMethod,{name:'Other method',enabled:true}],
  ['fundAccounts',account,{name:'Current account',enabled:true,primaryPaymentMethodId:method,sourceFacts:{hallIds:[otherHall]}}],
  ['fundAccounts',otherAccount,{name:'Other account',enabled:true,primaryPaymentMethodId:otherMethod}],
  ['fundAccounts',retiredAccount,{name:'Renamed retired account',enabled:false,primaryPaymentMethodId:otherMethod}]];
 adminSql(`SET ROLE ${ident(config.roles.source)};
 INSERT INTO ${s}.category(id,code,code_normalized,name) VALUES(${literal(p1)},'T21','T21','Synthetic category');
 INSERT INTO ${s}.unit(id,code,code_normalized,name,quantity_scale) VALUES(${literal(p1)},'PIECE','PIECE','件',0),(${literal(decimalProduct)},'METRE','METRE','米',2);
 INSERT INTO ${s}.spec_dimension(id,code,code_normalized,name) VALUES(${literal(colorDimension)},'COLOR','COLOR','颜色'),(${literal(sizeDimension)},'SIZE','SIZE','尺码');
 INSERT INTO ${s}.spec_value(id,dimension_id,code,code_normalized,name) VALUES(${literal(colorId)},${literal(colorDimension)},'BLUE','BLUE','蓝色'),(${literal(sizeId)},${literal(sizeDimension)},'M','M','M');
 ${[[p1,sku1,'P1',p1],[p2,sku2,'P2',p1],[decimalProduct,decimalSku,'P3',decimalProduct]].map(([p,sku,code,u])=>`
 INSERT INTO ${s}.product(id,code,code_normalized,name,category_id,unit_id) VALUES(${literal(p)},${literal(code)},${literal(code)},'Synthetic product',${literal(p1)},${literal(u)});
 INSERT INTO ${s}.variant(id,product_id,option_key) VALUES(${literal(sku)},${literal(p)},${literal('T21-'+code)});`).join('\n')}
 INSERT INTO ${s}.variant_option(variant_id,dimension_id,spec_value_id) VALUES(${literal(sku1)},${literal(colorDimension)},${literal(colorId)}),(${literal(sku1)},${literal(sizeDimension)},${literal(sizeId)});
 ${[w1,w2].map((id,i)=>`INSERT INTO ${s}.warehouse(id,code,code_normalized,name,type,enabled) VALUES(${literal(id)},'W${i}','W${i}','Synthetic warehouse','WAREHOUSE',true);`).join('\n')}
 INSERT INTO ${s}.tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,git_sha,workspace_state_sha256)
 VALUES('T21','SYNTHETIC',${literal(config.schemas.source)},${literal(config.database)},'SYNTHETIC-T21',repeat('0',64),'SYNTHETIC','T21-fixture','COMMITTED','SYNTHETIC',repeat('0',64));
 RESET ROLE; SET ROLE ${ident(config.roles.runtime)};
 ${Object.values(actors).map(actor=>`INSERT INTO ${r}.operator(id,name,role,enabled) VALUES(${literal(actor.id)},${literal(actor.name)},${literal(actor.operatorRole)},true);`).join('\n')}
 INSERT INTO ${r}.master_data_entity(kind,id,body,source_facts,version,updated_by) VALUES
 ${masters.map(([kind,id,b])=>`(${literal(kind)},${literal(id)},${literal(JSON.stringify(b))}::jsonb,'{"fixture":"T21"}',1,'T21-fixture')`).join(',')};
 ${[[historicalZero,true],[historicalFive,false]].map(([id,zero])=>`
 INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,active_effect_identity,active_effect_revision,current_revision,version,business_day)
 VALUES(${literal(id)},'SALE',${literal(zero?'H0':'H5')},'APPROVED',true,true,${literal('baseline:'+id)},1,1,1,'2026-10-01');
 INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id) VALUES(${literal(id)},1,true,${literal(JSON.stringify(historicalBody(zero)))}::jsonb,NULL);`).join('\n')}
 RESET ROLE;`);
 for(const actor of Object.values(actors)){
  const salt=randomBytes(24).toString('hex'),hash=pbkdf2Sync(password,salt,210000,32,'sha256').toString('hex');
  const b={name:actor.name,role:actor.role,employmentStatus:'在职',enabled:true,loginEnabled:true,loginName:actor.id,...(actor.storeId?{storeId:actor.storeId,hallId:actor.storeId}:{})};
  adminSql(`SET ROLE ${ident(config.roles.auth)};INSERT INTO ${a}.employee_login(id,login_name,body,password_salt,password_hash)
   VALUES(${literal(actor.id)},${literal(actor.id)},${literal(JSON.stringify(b))}::jsonb,${literal(salt)},${literal(hash)});RESET ROLE;`);
 }
}
function fingerprint(){
 const schemas=Object.values(config.schemas);
 const relations=value(`SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind) ORDER BY n.nspname,c.relname),'[]'::jsonb)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY(ARRAY[${schemas.map(literal).join(',')}]) AND c.relkind IN ('r','p','S')`);
 const parts=relations.map(row=>{const table=ident(row.schema)+'.'+ident(row.name),key=literal(row.schema+'.'+row.name);return row.kind==='S'
  ?`SELECT ${key} key,jsonb_build_object('lastValue',last_value,'isCalled',is_called) value FROM ${table}`
  :`SELECT ${key} key,jsonb_build_object('rows',count(*),'md5',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'))) value FROM ${table} t`;});
 return value(`SELECT jsonb_object_agg(key,value ORDER BY key) FROM (${parts.join(' UNION ALL ')}) items`);
}
function success(response,label){assert.equal(response.statusCode,200,label+': '+response.body);assert.equal(response.json().ok,true);return response.json().data;}
async function login(actor){const response=await app.inject({method:'POST',url:'/api/runtime/session',headers:{origin:env.SESSION_ORIGIN,'content-type':'application/json'},payload:{loginName:actor.id,password}});
 const data=success(response,'login '+actor.id),cookie=response.headers['set-cookie'];return {cookie:cookie.split(';')[0],csrf:data.csrfToken};}
const command=(session,input)=>app.inject({method:'POST',url:'/api/runtime/command',headers:{origin:env.SESSION_ORIGIN,'content-type':'application/json',cookie:session.cookie,'x-csrf-token':session.csrf,'x-request-id':input.requestKey},payload:input});
const get=(session,path)=>app.inject({method:'GET',url:path,headers:{cookie:session.cookie}});
const post=(session,path,payload)=>app.inject({method:'POST',url:path,headers:{origin:env.SESSION_ORIGIN,'content-type':'application/json',cookie:session.cookie,'x-csrf-token':session.csrf},payload});
const work=(session,input)=>app.inject({method:'POST',url:'/api/sales/work',headers:{origin:env.SESSION_ORIGIN,'content-type':'application/json',cookie:session.cookie,'x-csrf-token':session.csrf},payload:input});
const request=(id,operation,version,b)=>({documentId:id,documentType:'SALE',operation,expectedVersion:version,requestKey:'T21-'+randomUUID(),...(b?{body:b}:{})});
async function balance(sku=sku1,w=w1){return app.dataAccess.read(session=>readInventoryBalance(session,ident(config.schemas.runtime),w,sku));}
async function rejection(id,run,expectedCode,expectedStatus=400){
 const before=fingerprint(),response=await run(),after=fingerprint();
 assert.equal(response.statusCode,expectedStatus,id+': '+response.body);assert.equal(response.json().error.code,expectedCode);assert.deepEqual(after,before,id+' wrote data');
 const proof={id,statusCode:response.statusCode,code:expectedCode,before,after,databaseUnchanged:true};denials.push(proof);writeJson(join(suite,id+'.json'),proof);checked(id,{databaseUnchanged:true});return response;
}
try{
 assert.match(tool('postgres',['--version'],'version.log'),/PostgreSQL\) 17\./);
 tool('initdb',['-D',data,'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C','--wal-segsize=1','--set','min_wal_size=2MB','--set','max_wal_size=8MB'],'initdb.log');
 tool('pg_ctl',['-D',data,'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c min_wal_size=2MB -c max_wal_size=8MB -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'],'start.log');started=true;
 const cluster=JSON.parse(tool('psql',['-X','-w','-qAt',...conn('postgres'),'-c',"SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"],'identity.log'));
 assert.equal(cluster.dataDirectory,data);assert.equal(cluster.listenAddresses,'');env.POSTGRES_CLUSTER_ID=cluster.clusterId;result.cluster=cluster;
 tool('createdb',['-h',socket,'-p',port,'-U',admin,'-T','template0',databaseName],'create.log');
 writeFileSync(env.SESSION_SECRET_FILE,randomBytes(48),{mode:0o600});chmodSync(env.SESSION_SECRET_FILE,0o600);
 config=readDatabaseConfig(env);assertIsolatedTarget(config);targets.push({environment:'qa',database:databaseName,instanceId:config.instanceId,clusterId:cluster.clusterId});
 await maintenance('bootstrap');const migrations=await maintenance('migrate');result.migrations=migrations.versions;
 seed();app=createApp(readConfig(env));
 app.addHook('onError',async(_request,_reply,error)=>{writeFileSync(join(suite,'application-errors.log'),JSON.stringify({name:error.name,code:error.code,sqlState:error.sqlState,message:error.message})+'\n',{flag:'a',mode:0o600});});
 const sessions={};for(const [name,actor] of Object.entries(actors))sessions[name]=await login(actor);
 const r=ident(config.schemas.runtime),s=ident(config.schemas.source),baselineBodies=value(`SELECT jsonb_object_agg(document_id::text,body) FROM ${r}.revision WHERE original_imported`);
 const cells=[w1,w2].flatMap((w,i)=>[[sku1,'件'],[sku2,'件'],[decimalSku,'米']].map(([sku,u])=>({warehouseId:w,skuId:sku,quantity:i===0?'100.0000':'0.0000',unit:u,sourceCell:'SYNTHETIC:'+w+':'+sku,sourceRecord:{fixture:'T21'}})));
 const basePlan={revision:'T21-SYNTHETIC-OPENING',businessDay:'2026-10-01',sourceSha256:digest('T21-source'),sourceFile:'SYNTHETIC:T21',rulesSha256:digest('T21-rules'),standardPackSha256:digest('T21-pack'),expectedActiveRevision:null,
  expectedCellCount:cells.length,expectedCoveredBaselineDocumentCount:2,manifestSha256:'',issues:[],cells,coveredBaselineDocuments:[historicalZero,historicalFive].map(id=>({documentId:id,revision:1,effectIdentity:'baseline:'+id}))};
 const plan={...basePlan,manifestSha256:openingManifestDigest(basePlan)};
 await app.dataAccess.transaction(session=>activateOpeningSnapshot(session,{runtime:r,source:s},plan));
 result.opening=plan;checked('private-qa-cluster',{database:databaseName,listenAddresses:'',migrationVersions:result.migrations.map(m=>m.id)});

 // Same SKU / different price, distinct original SKU, gift, reference conflict and a truly equivalent pair.
 const mixedId=randomUUID(),mixedBody=body([line('A','10.00','1'),line('B','10.00','2'),line('C','11.00','1'),line('D','0.00','1',sku1,{gift:true}),
  line('E','10.00','1',sku2),line('F','10.00','1',sku1,{source_payload:{v2_reference_price_cents:1500}})], [fund('MIXED-PAY','60.99')],{adjustment:'0.01'});
 const mixedRequest=request(mixedId,'create',0,mixedBody),mixed=success(await command(sessions.admin,mixedRequest),'mixed create').document;
 assert.equal(mixed.body.lines.length,5);assert.deepEqual(mixed.body.lines[0].merged_source_ids,['A','B']);assert.equal(mixed.body.lines[0].source_quantity,'3.0000');
 assert.deepEqual(mixed.body.lines.map(l=>l.unit_price),['10.00','11.00','0.00','10.00','10.00']);assert.equal(mixed.body.salesFacts.grossCents,'6100');assert.equal(mixed.body.salesFacts.dueCents,'6099');
 assert.equal(mixed.body.salesFacts.inputLines.length,6);assert.equal(mixed.body.lines.reduce((n,l)=>n+BigInt(l.discount_cents),0n),1n);
 assert.equal(mixed.body.lines.reduce((n,l)=>n+BigInt(l.net_cents),0n),6099n);assert.equal(mixed.body.lines[0].discount_cents,'1');
 assert.equal(await balance(),'100.0000');assert.equal(mixed.body.fundsRecords[0].source_fund_account_name,'Current account');
 const repeatBefore=fingerprint();assert.deepEqual(success(await command(sessions.admin,mixedRequest),'create retry').document,mixed);assert.deepEqual(fingerprint(),repeatBefore);
 checked('identity-price-gift-merge-and-cent-conservation',{id:mixedId,lines:mixed.body.lines,totals:mixed.body.salesFacts,unchangedDraftInventory:'100.0000',outOfHallAccountAccepted:true});
 const audit=request(mixedId,'approve',1),audited=success(await command(sessions.admin,audit),'mixed approve').document;
 assert.equal(await balance(),'94.0000');assert.equal(await balance(sku2),'99.0000');
 const auditFingerprint=fingerprint();assert.deepEqual(success(await command(sessions.admin,audit),'audit retry').document,audited);assert.deepEqual(fingerprint(),auditFingerprint);
 await rejection('same-key-different-body',()=>command(sessions.admin,{...mixedRequest,body:{...mixedBody,header:{...mixedBody.header,note:'changed'}}}),'IDEMPOTENCY_CONFLICT',409);
 const reversed=success(await command(sessions.warehouse,request(mixedId,'unapprove',2)),'mixed unapprove').document;
 assert.equal(await balance(),'100.0000');assert.equal(await balance(sku2),'100.0000');assert.deepEqual(reversed.body,audited.body);
 assert.deepEqual(reversed.body.fundsRecords,mixed.body.fundsRecords);const again=success(await command(sessions.admin,request(mixedId,'approve',3)),'mixed reapprove').document;
 assert.equal(await balance(),'94.0000');assert.equal(again.currentRevision,1);
 const sourceProof=value(`SELECT jsonb_build_object('postings',(SELECT count(*) FROM ${r}.posting WHERE document_id=${literal(mixedId)}::uuid),'movements',(SELECT count(*) FROM ${r}.movement WHERE posting_id IN(SELECT id FROM ${r}.posting WHERE document_id=${literal(mixedId)}::uuid)),'versions',(SELECT count(*) FROM ${r}.version_history WHERE document_id=${literal(mixedId)}::uuid))`);
 assert.equal(sourceProof.postings,3);checked('audit-unapprove-reapprove-only-quantity',{id:mixedId,balances:['100.0000','94.0000','100.0000','94.0000'],settlementsPreserved:true,...sourceProof});
 const recover=success(await get(sessions.admin,'/api/requests/result?requestKey='+audit.requestKey+'&operationId=sales.approve'),'request recovery');assert.equal(recover.resolution,'COMMITTED');assert.deepEqual(recover.originalResponse.document,audited);checked('original-request-readback',{requestKey:audit.requestKey,resolution:recover.resolution});

 const unbalancedId=randomUUID(),unbalanced=body([line('170','170.00')],[fund('100','100.00'),fund('50','50.00')]);
 const unbalancedDoc=success(await command(sessions.sales,request(unbalancedId,'create',0,unbalanced)),'unbalanced draft').document;
 assert.equal(unbalancedDoc.status,'UNAUDITED');assert.equal(unbalancedDoc.body.salesFacts.differenceCents,'2000');
 const savedUnbalanced=success(await command(sessions.sales,request(unbalancedId,'save',1,unbalanced)),'save unbalanced again').document;
 assert.equal(savedUnbalanced.body.salesFacts.differenceCents,'2000');
 await rejection('unbalanced-audit-is-atomic',()=>command(sessions.sales,request(unbalancedId,'approve',2)),'FUNDS');
 const corrected=structuredClone(unbalanced);corrected.fundsRecords[1]=fund('50','70.00');success(await command(sessions.sales,request(unbalancedId,'save',2,corrected)),'save balanced');
 success(await command(sessions.sales,request(unbalancedId,'approve',3)),'salesperson own approval');
 await rejection('salesperson-cannot-unapprove',()=>command(sessions.sales,request(unbalancedId,'unapprove',4)),'FORBIDDEN',403);
 await rejection('other-hall-document-denied',()=>get(sessions.otherSales,'/api/sales/document/'+unbalancedId),'SCOPE',403);
 const scoped=success(await get(sessions.otherSales,'/api/sales/documents?type=SALE&page=1&size=20'),'other hall list');assert.equal(scoped.total,0);
 checked('draft-unbalanced-save-then-precisely-balanced-audit',{id:unbalancedId,dueCents:'17000',draftSettlementCents:'15000',correctedSettlementCents:'17000'});
 const workBalance=await balance(),draftKey='unsaved-'+randomUUID(),event={eventId:'SCAN-ONE',code:'000001',lineId:'170',before:1,after:2};
 success(await work(sessions.sales,{type:'work',docId:draftKey,record:event}),'actor owned scan draft');
 const scanFingerprint=fingerprint();assert.equal(success(await work(sessions.sales,{type:'work',docId:draftKey,record:event}),'duplicate scan').duplicate,true);assert.deepEqual(fingerprint(),scanFingerprint);
 assert.equal(success(await work(sessions.otherSales,{type:'logs',docId:draftKey}),'other actor draft logs').items.length,0);
 await rejection('same-scan-event-cannot-add-quantity',()=>work(sessions.sales,{type:'work',docId:draftKey,record:{...event,after:3}}),'IDEMPOTENCY_CONFLICT',409);
 success(await work(sessions.sales,{type:'work',docId:draftKey,record:{...event,undone:true}}),'scan undo fact');
 const undoFingerprint=fingerprint();assert.equal(success(await work(sessions.sales,{type:'work',docId:draftKey,record:{...event,undone:true}}),'scan undo duplicate').duplicate,true);assert.deepEqual(fingerprint(),undoFingerprint);
 await rejection('saved-work-outside-hall-denied',()=>work(sessions.otherSales,{type:'logs',docId:unbalancedId}),'SCOPE',403);
 success(await work(sessions.sales,{type:'work',docId:unbalancedId,record:{...event,eventId:'SAVED-SCAN'}}),'saved scan');
 const savedLogs=success(await work(sessions.sales,{type:'logs',docId:unbalancedId}),'saved scan logs');assert.equal(savedLogs.items.length,1);assert.equal(savedLogs.items[0].actor.id,actors.sales.id);
 assert.equal(await balance(),workBalance);checked('scan-work-is-actor-bound-idempotent-and-stock-neutral',{beforeBalance:workBalance,afterBalance:await balance()});
 const linkedDraftId=randomUUID(),linkedDraftBody=body([line('SCAN-LINK')]);linkedDraftBody.header.source_payload={v2_draft_key:draftKey};
 success(await command(sessions.sales,request(linkedDraftId,'create',0,linkedDraftBody)),'link own scan work');
 const linkedLogs=success(await work(sessions.sales,{type:'logs',docId:linkedDraftId}),'linked scan logs').items;assert.equal(linkedLogs.length,1);assert.equal(linkedLogs[0].draftId,draftKey);assert.equal(linkedLogs[0].undone,true);
 assert.equal(value(`SELECT count(*) FROM ${r}.work_event WHERE document_key=${literal('sale:'+linkedDraftId)}`),1);checked('new-sale-atomically-links-own-draft-scan-and-undo-facts');

 const invalids=[
  ['price-amount-tampering',body([line('BAD','10.00','2',sku1,{amount:'19.99'})]),'VALIDATION'],
  ['gift-with-paid-price',body([line('BAD','1.00','1',sku1,{gift:true})]),'VALIDATION'],
  ['ordinary-zero-without-confirmation',body([line('BAD','0.00')]),'VALIDATION'],
  ['pieces-fractional-quantity',body([line('BAD','10.00','1.5')]),'VALIDATION'],
  ['zero-quantity',body([line('BAD','10.00','0')]),'VALIDATION'],
  ['excess-quantity',body([line('BAD','10.00','100000')]),'VALIDATION'],
  ['numeric-floating-money-rejected',body([line('BAD',10.01)]),'VALIDATION'],
  ['extra-price-precision',body([line('BAD','10.001')]),'VALIDATION'],
  ['negative-price',body([line('BAD','-1.00')]),'VALIDATION'],
  ['max-price',body([line('BAD','1000000000.00')]),'VALIDATION'],
  ['unsafe-total',body([line('BAD','999999999.99','99999')]),'VALIDATION'],
  ['duplicate-line-id',body([line('SAME'),line('SAME')]),'VALIDATION'],
  ['discount-formula-tampering',body([line('BAD','8.99','1',sku1,{source_payload:{v2_pricing_rule:'discount',v2_reference_price_cents:1000,v2_discount_tenths:90}})]),'VALIDATION'],
  ['discount-range',body([line('BAD','10.00','1',sku1,{source_payload:{v2_pricing_rule:'discount',v2_reference_price_cents:1000,v2_discount_tenths:101}})]),'VALIDATION'],
  ['oversized-header-discount',body([line('BAD')],[],{adjustment:'10.01'}),'VALIDATION'],
  ['account-method-mismatch',body([line('BAD')],[fund('F','10.00',{fund_account_id:otherAccount})]),'FUNDS'],
  ['disabled-account-new-use',body([line('BAD')],[fund('F','10.00',{fund_account_id:retiredAccount})]),'FUNDS'],
  ['direction-sign-mismatch',body([line('BAD')],[fund('F','-10.00',{direction:'receipt'})]),'FUNDS'],
  ['duplicate-fund-id',body([line('BAD')],[fund('SAME','5.00'),fund('SAME','5.00')]),'VALIDATION'],
  ['new-four-settlements',body([line('BAD')],[1,2,3,4].map(i=>fund('F'+i,'2.50'))),'FUNDS'],
  ['sku-identity-tampering',body([line('BAD','10.00','1',sku1,{product_id:p2})]),'SPEC'],
  ['product-snapshot-tampering',body([line('BAD','10.00','1',sku1,{source_product_name:'Another product'})]),'SPEC'],
  ['ordinary-negative-quantity',body([line('BAD','10.00','-1')]),'VALIDATION'],
 ];
 for(const [label,input,code]of invalids)await rejection(label,()=>command(sessions.admin,request(randomUUID(),'create',0,input)),code);
 const minimumBody=body([line('MIN','9.99')]);adminSql(`SET ROLE ${ident(config.roles.runtime)};INSERT INTO ${r}.product_profile_overlay(product_id,body) VALUES(${literal(p1)},'{"minimumPrice":"10.00"}');RESET ROLE;`);
 await rejection('minimum-unit-price',()=>command(sessions.admin,request(randomUUID(),'create',0,minimumBody)),'VALIDATION');
 success(await command(sessions.admin,request(randomUUID(),'create',0,body([line('GIFT','0.00','1',sku1,{gift:true})]))),'gift minimum exemption');
 adminSql(`SET ROLE ${ident(config.roles.runtime)};UPDATE ${r}.product_profile_overlay SET body='{"minimumPrice":null}' WHERE product_id=${literal(p1)}::uuid;RESET ROLE;`);
 const discountId=randomUUID();const discount=success(await command(sessions.admin,request(discountId,'create',0,body([line('DISC','0.02','1',sku1,{source_payload:{v2_reference_price_cents:3,v2_pricing_rule:'discount',v2_discount_tenths:50}})],[fund('D','0.02')]))),'discount half cent').document;
 assert.equal(discount.body.lines[0].unit_price,'0.02');success(await command(sessions.admin,request(discountId,'approve',1)),'discount approve');checked('discount-half-cent-and-gift-minimum-exemption');
 const decimalId=randomUUID(),decimal=success(await command(sessions.admin,request(decimalId,'create',0,body([line('DEC-A','0.01','0.50',decimalSku),line('DEC-B','0.01','0.50',decimalSku)],[fund('DEC','0.02')]))),'decimal quantity').document;
 assert.equal(decimal.body.lines.length,2);assert.equal(decimal.body.salesFacts.grossCents,'2');success(await command(sessions.admin,request(decimalId,'approve',1)),'decimal approve');assert.equal(await balance(decimalSku),'99.0000');checked('confirmed-decimal-unit-and-rounding-before-merge',{lines:2,grossCents:'2',balance:'99.0000'});
 const tie=success(await command(sessions.admin,request(randomUUID(),'create',0,body([line('TIE-A','0.01'),line('TIE-B','0.01','1',sku2),line('TIE-C','0.01','1',decimalSku)],[fund('TIE','0.01')],{adjustment:'0.02'}))),'equal remainder tie').document;
 assert.deepEqual(tie.body.lines.map(l=>l.discount_cents),['1','1','0']);checked('stable-allocation-tie',{shares:['1','1','0']});
 const zeroId=randomUUID();success(await command(sessions.admin,request(zeroId,'create',0,body([line('Z','0.00','1',sku1,{zero_confirmed:true})]))),'zero due draft');success(await command(sessions.admin,request(zeroId,'approve',1)),'zero due no funds');checked('zero-due-with-zero-settlement-records',{id:zeroId});
 const signedId=randomUUID(),signed=body([line('RET','200.00','-2',sku1,{direction:'RETURN_IN'}),line('OUT','300.00','1',sku2,{direction:'SALE_OUT'})],[fund('REFUND','-100.00')],{business_type:'RETURN_EXCHANGE'});
 const signedDoc=success(await command(sessions.admin,request(signedId,'create',0,signed)),'signed settlement').document;assert.equal(signedDoc.body.salesFacts.dueCents,'-10000');checked('signed-facts-seam',{dueCents:'-10000',refundCents:'-10000',scope:'T22 owns dual-side business/association acceptance'});
 const sameSkuSigns=success(await command(sessions.admin,request(randomUUID(),'create',0,body([line('RETURN','10.00','-1',sku1,{direction:'RETURN_IN'}),line('OUTGOING','10.00','1',sku1,{direction:'SALE_OUT'})],[],{business_type:'RETURN_EXCHANGE'}))),'same SKU opposite signs').document;
 assert.equal(sameSkuSigns.body.lines.length,2);assert.equal(sameSkuSigns.body.salesFacts.dueCents,'0');checked('same-sku-opposite-directions-retain-two-facts');
 await rejection('new-linked-facts-cannot-bypass-retired-entry',()=>command(sessions.admin,request(randomUUID(),'create',0,
  body([line('LINK-A','10.00','1',sku1,{original_line_id:'O-A'}),line('LINK-B','10.00','1',sku1,{original_line_id:'O-B'})]))),'HISTORICAL_ONLY',409);
 const spoofId=randomUUID(),spoofBody=body([line('SPOOF','10.00','1',sku1,{stock_quantity_contribution:'999'})],[fund('SP','10.00')]);
 spoofBody.salesFacts={stockEffects:[{skuId:sku1,warehouseId:w1,quantity:'999'}]};
 const spoofDraft=success(await command(sessions.admin,request(spoofId,'create',0,spoofBody)),'spoof draft').document;
 assert.equal(spoofDraft.body.salesFacts.stockEffects[0].quantity,'-1.0000');const spoofBefore=await balance();success(await command(sessions.admin,request(spoofId,'approve',1)),'spoof approve');assert.equal(await balance(),(Number(spoofBefore)-1).toFixed(4));checked('client-derived-stock-effects-ignored');

 // Imported 0..N and source 4-place prices survive note-only revisions, current master changes and reapproval.
 adminSql(`SET ROLE ${ident(config.roles.runtime)};UPDATE ${r}.product_profile_overlay SET body='{"enabled":false,"minimumPrice":"99999.00"}' WHERE product_id=${literal(p1)}::uuid;RESET ROLE;`);
 await rejection('disabled-product-new-use',()=>command(sessions.admin,request(randomUUID(),'create',0,body([line('DISABLED')]))),'SPEC',409);
 const oldFive=success(await get(sessions.admin,'/api/sales/document/'+historicalFive),'history five');assert.equal(oldFive.body.fundsRecords.length,5);assert.equal(oldFive.creator,null);assert.equal(oldFive.source_imported,true);assert.equal(oldFive.history[0].operation,'import');assert.equal(oldFive.history[0].actor_id,null);assert.equal(oldFive.history[0].created_at,null);assert.ok(oldFive.history[0].imported_at);
 success(await command(sessions.admin,request(historicalFive,'unapprove',1)),'history unapprove');
 const afterHistoricalReverse=await balance();const noteBody=structuredClone(historicalBody(false));noteBody.header.note='legitimate note revision';
 const changed=success(await command(sessions.admin,request(historicalFive,'save',2,noteBody)),'history note save').document;
 assert.equal(changed.body.lines[0].unit_price,'12.3456');assert.deepEqual(changed.body.fundsRecords,historicalBody(false).fundsRecords);
 const appended=structuredClone(noteBody);appended.fundsRecords.push(fund('NEW-HISTORY-INPUT','0.00'));
 await rejection('history-five-cannot-hide-new-sixth-input',()=>command(sessions.admin,request(historicalFive,'save',3,appended)),'FUNDS');
 const beforeHistoricalReapprove=await balance(),historicalReaudit=request(historicalFive,'approve',3);success(await command(sessions.admin,historicalReaudit),'history reapprove');assert.equal(await balance(),(Number(beforeHistoricalReapprove)-2).toFixed(4));
 const reauditFingerprint=fingerprint();success(await command(sessions.admin,historicalReaudit),'history reaudit retry');assert.deepEqual(fingerprint(),reauditFingerprint);
 const zeroReversal=request(historicalZero,'unapprove',1);success(await command(sessions.admin,zeroReversal),'zero history reversal');const historicalZeroBefore=await balance();
 const zeroReaudit=request(historicalZero,'approve',2);success(await command(sessions.admin,zeroReaudit),'zero history reaudit');assert.equal(await balance(),(Number(historicalZeroBefore)-1).toFixed(4));
 const zeroFingerprint=fingerprint();success(await command(sessions.admin,zeroReaudit),'zero history reaudit retry');assert.deepEqual(fingerprint(),zeroFingerprint);
 const originalAfter=value(`SELECT jsonb_object_agg(document_id::text,body) FROM ${r}.revision WHERE original_imported`);assert.deepEqual(originalAfter,baselineBodies);
 const historyZero=success(await get(sessions.admin,'/api/sales/document/'+historicalZero),'history zero');assert.equal(historyZero.body.fundsRecords.length,0);
 const fiveRead=success(await get(sessions.admin,'/api/sales/document/'+historicalFive),'history five after edits');assert.equal(fiveRead.body.fundsRecords.length,5);
 const actorsUnknown=value(`SELECT jsonb_agg(jsonb_build_object('id',d.id,'creator',first.actor_id,'originalAuditor',d.original_auditor,'originalAuditedAt',d.original_audited_at) ORDER BY d.id)
 FROM ${r}.document d JOIN ${r}.revision first ON first.document_id=d.id AND first.revision=1 WHERE d.id IN(${literal(historicalZero)}::uuid,${literal(historicalFive)}::uuid)`);
 assert.ok(actorsUnknown.every(d=>d.creator===null&&d.originalAuditor===null&&d.originalAuditedAt===null));
 checked('history-zero-to-many-and-source-precision',{documents:[historicalZero,historicalFive],fundCounts:[0,5],sourceUnitPrice:'12.3456',sourceAmount:'24.69',afterHistoricalReverse,beforeHistoricalReapprove,afterHistoricalReapprove:await balance(),originalRevisionsUnchanged:true,unknownActors:actorsUnknown});
 adminSql(`SET ROLE ${ident(config.roles.runtime)};UPDATE ${r}.product_profile_overlay SET body='{"enabled":true,"minimumPrice":null}' WHERE product_id=${literal(p1)}::uuid;RESET ROLE;`);
 const copiedHistory=historicalBody(false);copiedHistory.lines[0].source_product_name='Synthetic product';
 await rejection('copied-history-is-not-new-input-authority',()=>command(sessions.admin,request(randomUUID(),'create',0,copiedHistory)),'VALIDATION');
 const importedUnapprovedId=randomUUID(),unknownBody=historicalBody(true);
 adminSql(`SET ROLE ${ident(config.roles.runtime)};INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision,version,business_day)
  VALUES(${literal(importedUnapprovedId)},'SALE','H-UNKNOWN','UNAUDITED',false,false,1,1,'2026-10-01');INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id)
  VALUES(${literal(importedUnapprovedId)},1,true,${literal(JSON.stringify(unknownBody))}::jsonb,NULL);RESET ROLE;`);
 success(await command(sessions.admin,request(importedUnapprovedId,'approve',1)),'imported unapproved approval');
 const unknownProof=value(`SELECT jsonb_build_object('originalAuditor',original_auditor,'originalAuditedAt',original_audited_at) FROM ${r}.document WHERE id=${literal(importedUnapprovedId)}::uuid`);
 assert.deepEqual(unknownProof,{originalAuditor:null,originalAuditedAt:null});checked('imported-unknown-auditor-not-backfilled-on-runtime-approval',{id:importedUnapprovedId,...unknownProof});
 const largeHistoryId=randomUUID(),largeBody=body(Array.from({length:1001},(_,i)=>line('LARGE-HISTORY-'+i,'10.0000','1.0000',sku1,{amount:'10.00',unit:'件',stock_quantity_contribution:'-1'})));
 adminSql(`SET ROLE ${ident(config.roles.runtime)};INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision,version,business_day)
  VALUES(${literal(largeHistoryId)},'SALE','H-LARGE','UNAUDITED',false,false,1,1,'2026-10-01');INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id)
  VALUES(${literal(largeHistoryId)},1,true,${literal(JSON.stringify(largeBody))}::jsonb,NULL);RESET ROLE;`);
 const largeSaved=success(await command(sessions.admin,request(largeHistoryId,'save',1,largeBody)),'1001 historical lines').document;assert.equal(largeSaved.body.lines.length,1001);
 const largeChanged=structuredClone(largeBody);largeChanged.lines[0].source_quantity='2.0000';
 await rejection('large-history-cannot-bypass-new-line-limit',()=>command(sessions.admin,request(largeHistoryId,'save',2,largeChanged)),'VALIDATION');
 checked('historical-row-count-not-cropped-or-merged',{id:largeHistoryId,sourceLines:1001,savedLines:largeSaved.body.lines.length});

 const failId=randomUUID();success(await command(sessions.admin,request(failId,'create',0,body([line('FAULT')],[fund('FAULT-PAY','10.00')]))),'fault draft');
 const faultRequest=request(failId,'approve',1);adminSql(`CREATE FUNCTION ${r}.t21_reject_movement() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN RAISE EXCEPTION 'T21_SYNTHETIC_FAULT'; END $fault$;CREATE TRIGGER t21_fault BEFORE INSERT ON ${r}.movement FOR EACH ROW EXECUTE FUNCTION ${r}.t21_reject_movement();`);
 await rejection('posting-failure-rolls-back-all-layers',()=>command(sessions.admin,faultRequest),'ROLLED_BACK',409);
 adminSql(`DROP TRIGGER t21_fault ON ${r}.movement;DROP FUNCTION ${r}.t21_reject_movement();`);success(await command(sessions.admin,faultRequest),'same fault key after rollback');checked('same-key-after-rolled-back-posting-can-succeed');
 const concurrencyId=randomUUID();success(await command(sessions.admin,request(concurrencyId,'create',0,body([line('CONCURRENT')],[fund('CPAY','10.00')]))),'concurrent draft');
 const concurrentRequest=request(concurrencyId,'approve',1),outcomes=await Promise.all([command(sessions.admin,concurrentRequest),command(sessions.admin,concurrentRequest)]);
 assert.deepEqual(success(outcomes[0],'concurrent same key'),success(outcomes[1],'concurrent same key second'));
 await rejection('stale-version-denied',()=>command(sessions.admin,request(concurrencyId,'approve',1)),'VERSION_CONFLICT',409);
 assert.equal(value(`SELECT count(*) FROM ${r}.posting WHERE document_id=${literal(concurrencyId)}::uuid`),1);checked('concurrent-retries-one-posting',{id:concurrencyId});
 const differentKeysId=randomUUID();success(await command(sessions.admin,request(differentKeysId,'create',0,body([line('TWO-DEVICES')],[fund('DPAY','10.00')]))),'two devices draft');
 const differentKeys=await Promise.all([command(sessions.admin,request(differentKeysId,'approve',1)),command(sessions.warehouse,request(differentKeysId,'approve',1))]);
 assert.deepEqual(differentKeys.map(r=>r.statusCode).sort(),[200,409]);assert.equal(differentKeys.find(r=>r.statusCode===409).json().error.code,'VERSION_CONFLICT');
 assert.equal(value(`SELECT count(*) FROM ${r}.posting WHERE document_id=${literal(differentKeysId)}::uuid`),1);checked('two-actors-same-version-only-one-approval');
 const allBefore=fingerprint();success(await get(sessions.admin,'/api/sales/documents?type=SALE&page=1&size=200&filters='+encodeURIComponent(JSON.stringify({start:'',end:'',status:[],businessType:[],storeId:[],salespersonId:[],number:'',customerId:[],warehouseId:[]}))),'list with existing UI filters');success(await get(sessions.admin,'/api/sales/history/'+mixedId),'history read');assert.deepEqual(fingerprint(),allBefore);checked('list-detail-history-read-only-and-ui-filter-contract');
 const exactUrl='/api/sales/documents?type=SALE&size=2&filters='+encodeURIComponent(JSON.stringify({exactNumber:'H5'}));
 const exact=success(await get(sessions.admin,exactUrl),'historical number exact lookup');assert.equal(exact.total,1);assert.equal(exact.items[0].id,historicalFive);
 const outOfHall=success(await get(sessions.otherSales,exactUrl),'out of hall number lookup');assert.equal(outOfHall.total,0);
 const noPrefix=success(await get(sessions.admin,'/api/sales/documents?filters='+encodeURIComponent(JSON.stringify({exactNumber:'H'}))),'exact lookup excludes prefixes');assert.equal(noPrefix.total,0);
 assert.deepEqual(fingerprint(),allBefore);checked('direct-historical-number-exact-and-hall-scoped');
 const bridgeBefore=await balance();result.bridge=await exerciseSaleBridge({root,app,session:sessions.admin,origin:env.SESSION_ORIGIN,warehouseIds:[w1,w2],hallId:hall,productId:p1,skuId:sku1,colorId,sizeId,methodId:method,accountId:account,actor:actors.admin,historicalNumber:'H5'});
 assert.equal(await balance(),bridgeBefore);writeJson(join(out,'bridge-verification.json'),result.bridge);checked('real-sales-bridge-command-readback-and-response-recovery',{responseRecoveryPostedAgain:false,modifiedLineAmountCents:303,historicalSettlementCount:5});
 // T22 keeps the original-sale entry retired. The positive T21 identity case uses a
 // trusted imported return and real, independently identified original sale lines.
 const parentId=randomUUID(),linkedId=randomUUID();
 success(await command(sessions.admin,request(parentId,'create',0,body([
  line('O-A','10.00','2',sku1,{source_lineage:{fixture:'T21-original-A'}}),
  line('O-B','10.00','2',sku1,{source_lineage:{fixture:'T21-original-B'}})]))),'original identities');
 const linkedBody=body(['A','B'].map(key=>line('LINK-'+key,'10.0000','-1.0000',sku1,
  {original_line_id:'O-'+key,direction:'RETURN_IN',amount:'-10.00',unit:'件',stock_quantity_contribution:'1'})),[],
  {business_type:'RETURN_EXCHANGE',original_document_id:parentId});
 adminSql(`SET ROLE ${ident(config.roles.runtime)};INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision,version,business_day)
  VALUES(${literal(linkedId)},'SALE','T21-HISTORY-LINKED','UNAUDITED',false,false,1,1,'2026-10-02');INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id)
  VALUES(${literal(linkedId)},1,true,${literal(JSON.stringify(linkedBody))}::jsonb,NULL);RESET ROLE;`);
 const linked=success(await command(sessions.admin,request(linkedId,'save',1,linkedBody)),'trusted linked facts').document;
 assert.equal(linked.body.lines.length,2);assert.deepEqual(linked.body.lines.map(l=>l.original_line_id),['O-A','O-B']);
 assert.deepEqual(value(`SELECT body FROM ${r}.revision WHERE document_id=${literal(linkedId)}::uuid AND original_imported`),linkedBody);
 checked('linked-original-line-identities-not-collapsed',{id:linkedId,ids:linked.body.lines.map(l=>l.original_line_id),trustedImportedFixture:true,originalRevisionUnchanged:true});
 if(process.env.T21_HALL_ACCEPTANCE==='1')result.hallVisibility=await verifySaleHallVisibility({config,adminSql,command,get,post,work,success,request,
  actors,sessions,login,hall,otherHall,w1,w2,sku1,line,fund,body,fingerprint,checked,evidencePath:join(out,'hall-visibility-evidence.json')});
 result.finalFingerprint=fingerprint();result.status='PASS';result.completedAt=new Date().toISOString();
 writeJson(join(suite,'RESULT.json'),result);
}catch(error){result.status='FAIL';result.failure=error instanceof Error?error.message:'T21_VERIFY_FAILED';result.completedAt=new Date().toISOString();writeJson(join(suite,'RESULT.json'),result);throw error;
}finally{
 if(app)await app.close();
 if(started){const stop=spawnSync(join(pg,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C'},maxBuffer:1024*1024});
  writeFileSync(join(suite,'stop.log'),(stop.stdout??'')+(stop.stderr??''),{mode:0o600});result.clusterStopped=stop.status===0;
  writeJson(join(suite,'RESULT.json'),result);writeJson(join(out,'database-verification.json'),result);assert.equal(stop.status,0,'T21_PRIVATE_CLUSTER_STOP_FAILED');}
}
