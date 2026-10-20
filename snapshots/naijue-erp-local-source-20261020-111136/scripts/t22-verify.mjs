import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {createHash, pbkdf2Sync, randomBytes, randomUUID} from 'node:crypto';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {join, isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {root, writeJson} from './files.mjs';
import {runDatabaseCommand} from '../server/database/cli.ts';
import {readDatabaseConfig, assertIsolatedTarget, databaseIdentifier as ident} from '../server/database/config.ts';
import {bootstrapAssertionSql} from '../server/database/identity.ts';
import {sqlLiteral as literal} from '../server/database/sql.ts';
import {createApp} from '../server/app.ts';
import {readConfig} from '../server/config.ts';
import {readInventoryBalance} from '../server/domain/transactions/inventory.ts';
import {activateOpeningSnapshot, openingManifestDigest} from '../server/domain/transactions/opening.ts';
import {exerciseReturnBridge} from './t22-bridge-harness.mjs';

const pg=process.env.T22_PG_BIN;
if(!pg||!isAbsolute(pg))throw Error('T22_PG_BIN must explicitly select local PostgreSQL 17');
const evidenceVersion=process.env.T22_EVIDENCE_VERSION;
if(evidenceVersion!==undefined&&!/^repair-current-bridge-\d{8}-r\d{2,}$/.test(evidenceVersion))throw Error('T22_EVIDENCE_VERSION must name a repair-current-bridge-YYYYMMDD-rNN directory');
const out=join(root,'outputs/T22',evidenceVersion??''),logs=join(root,'logs/T22',evidenceVersion??'');
mkdirSync(out,{recursive:true});mkdirSync(logs,{recursive:true});chmodSync(logs,0o700);
const suite=mkdtempSync(join(logs,'postgres-suite-'));chmodSync(suite,0o700);
const data=join(suite,'data'),socket=mkdtempSync(join(tmpdir(),'naijue-t22-socket-')),admin='t22_bootstrap',port='55496';
chmodSync(socket,0o700);
assert.ok(Buffer.byteLength(join(socket,'.s.PGSQL.'+port))<104);assert.equal(existsSync(join(socket,'.s.PGSQL.'+port)),false);
const digest=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const checks=[],denials=[],targets=[],result={task:'T22',status:'RUNNING',startedAt:new Date().toISOString(),suite,socket,checks,denials,targets,
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
const uid=n=>`22000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const w1=uid(201),w2=uid(202),hall=uid(301),otherHall=uid(302),method=uid(501),account=uid(502),otherMethod=uid(503),otherAccount=uid(504),retiredAccount=uid(505);
const p1=uid(101),p2=uid(102),decimalProduct=uid(103),sku1=uid(111),sku2=uid(112),decimalSku=uid(113),historicalZero=uid(401),historicalFive=uid(402);
const colorDimension=uid(601),colorId=uid(602),sizeDimension=uid(603),sizeId=uid(604);
const suffix=randomUUID().replaceAll('-','').slice(0,8),prefix='t22qa_'+suffix,databaseName='demo_8877_t22_qa_'+suffix;
const env={APP_ENV:'qa',APP_DATABASE_MODE:'required',POSTGRES_HOST:socket,POSTGRES_PORT:port,POSTGRES_DB:databaseName,
 POSTGRES_USER:prefix+'_app',POSTGRES_ROLE_PREFIX:prefix,POSTGRES_SOURCE_SCHEMA:'t22_source',POSTGRES_RUNTIME_SCHEMA:'t22_runtime',
 POSTGRES_AUTH_SCHEMA:'t22_auth',POSTGRES_CONTROL_SCHEMA:'t22_control',POSTGRES_INSTANCE_ID:randomUUID(),POSTGRES_CLUSTER_ID:'',POSTGRES_BOOTSTRAP_USER:admin,
 PSQL_BIN:join(pg,'psql'),SESSION_ORIGIN:'https://t22.invalid',SESSION_SECRET_FILE:join(suite,'synthetic-session.key'),MEDIA_STORAGE_ROOT:join(suite,'media')};
const actors={admin:{id:'t22-admin',name:'Synthetic Admin',role:'管理员',operatorRole:'ADMIN'},warehouse:{id:'t22-warehouse',name:'Synthetic Warehouse',role:'仓库人员',operatorRole:'WAREHOUSE'},
 sales:{id:'t22-sales',name:'Synthetic Sales',role:'营业员',operatorRole:'SALESPERSON',storeId:hall},otherSales:{id:'t22-other-sales',name:'Synthetic Other Sales',role:'营业员',operatorRole:'SALESPERSON',storeId:otherHall}};
const password=randomUUID()+'-synthetic-only';
const line=(id,price='10.00',q='1',sku=sku1,extra={})=>({source_id:id,sku_id:sku,warehouse_id:w1,source_quantity:q,unit_price:price,gift:false,...extra});
const fund=(id,amount,extra={})=>({source_id:id,settlement_id:id,payment_method_id:method,fund_account_id:account,amount,direction:Number(amount)>0?'receipt':Number(amount)<0?'refund':'zero',...extra});
const body=(lines,funds=[],extra={})=>({header:{business_date:'2026-10-02',business_type:'SALE',hall_id:hall,source_warehouse_id:w1,adjustment:'0.00',note:'synthetic',...extra},lines,fundsRecords:funds});
const historicalBody=(zero=false)=>body([line(zero?'H0-L1':'H5-L1',zero?'0.0000':'12.3456',zero?'1.0000':'2.0000',sku1,
 {amount:zero?'0.00':'24.69',gift:zero,unit:'件',stock_quantity_contribution:zero?'-1':'-2',product_id:p1,color_id:colorId,size_id:sizeId,source_product_code:'P1',source_product_name:'Historical original name',source_color_name:'蓝色',source_size_name:'M',source_lineage:{fixture:'T22',sourceLine:zero?'H0-L1':'H5-L1'}})],
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
 INSERT INTO ${s}.category(id,code,code_normalized,name) VALUES(${literal(p1)},'T22','T22','Synthetic category');
 INSERT INTO ${s}.unit(id,code,code_normalized,name,quantity_scale) VALUES(${literal(p1)},'PIECE','PIECE','件',0),(${literal(decimalProduct)},'METRE','METRE','米',2);
 INSERT INTO ${s}.spec_dimension(id,code,code_normalized,name) VALUES(${literal(colorDimension)},'COLOR','COLOR','颜色'),(${literal(sizeDimension)},'SIZE','SIZE','尺码');
 INSERT INTO ${s}.spec_value(id,dimension_id,code,code_normalized,name) VALUES(${literal(colorId)},${literal(colorDimension)},'BLUE','BLUE','蓝色'),(${literal(sizeId)},${literal(sizeDimension)},'M','M','M');
 ${[[p1,sku1,'P1',p1],[p2,sku2,'P2',p1],[decimalProduct,decimalSku,'P3',decimalProduct]].map(([p,sku,code,u])=>`
 INSERT INTO ${s}.product(id,code,code_normalized,name,category_id,unit_id) VALUES(${literal(p)},${literal(code)},${literal(code)},'Synthetic product',${literal(p1)},${literal(u)});
 INSERT INTO ${s}.variant(id,product_id,option_key) VALUES(${literal(sku)},${literal(p)},${literal('T22-'+code)});`).join('\n')}
 INSERT INTO ${s}.variant_option(variant_id,dimension_id,spec_value_id) VALUES(${literal(sku1)},${literal(colorDimension)},${literal(colorId)}),(${literal(sku1)},${literal(sizeDimension)},${literal(sizeId)});
 ${[w1,w2].map((id,i)=>`INSERT INTO ${s}.warehouse(id,code,code_normalized,name,type,enabled) VALUES(${literal(id)},'W${i}','W${i}','Synthetic warehouse','WAREHOUSE',true);`).join('\n')}
 INSERT INTO ${s}.tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,git_sha,workspace_state_sha256)
 VALUES('T22','SYNTHETIC',${literal(config.schemas.source)},${literal(config.database)},'SYNTHETIC-T22',repeat('0',64),'SYNTHETIC','T22-fixture','COMMITTED','SYNTHETIC',repeat('0',64));
 RESET ROLE; SET ROLE ${ident(config.roles.runtime)};
 ${Object.values(actors).map(actor=>`INSERT INTO ${r}.operator(id,name,role,enabled) VALUES(${literal(actor.id)},${literal(actor.name)},${literal(actor.operatorRole)},true);`).join('\n')}
 INSERT INTO ${r}.master_data_entity(kind,id,body,source_facts,version,updated_by) VALUES
 ${masters.map(([kind,id,b])=>`(${literal(kind)},${literal(id)},${literal(JSON.stringify(b))}::jsonb,'{"fixture":"T22"}',1,'T22-fixture')`).join(',')};
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
const request=(id,operation,version,b)=>({documentId:id,documentType:'SALE',operation,expectedVersion:version,requestKey:'T22-'+randomUUID(),...(b?{body:b}:{})});
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
 const cells=[w1,w2].flatMap((w,i)=>[[sku1,'件'],[sku2,'件'],[decimalSku,'米']].map(([sku,u])=>({warehouseId:w,skuId:sku,quantity:i===0?'100.0000':'0.0000',unit:u,sourceCell:'SYNTHETIC:'+w+':'+sku,sourceRecord:{fixture:'T22'}})));
 const basePlan={revision:'T22-SYNTHETIC-OPENING',businessDay:'2026-10-01',sourceSha256:digest('T22-source'),sourceFile:'SYNTHETIC:T22',rulesSha256:digest('T22-rules'),standardPackSha256:digest('T22-pack'),expectedActiveRevision:null,
  expectedCellCount:cells.length,expectedCoveredBaselineDocumentCount:2,manifestSha256:'',issues:[],cells,coveredBaselineDocuments:[historicalZero,historicalFive].map(id=>({documentId:id,revision:1,effectIdentity:'baseline:'+id}))};
 const plan={...basePlan,manifestSha256:openingManifestDigest(basePlan)};
 await app.dataAccess.transaction(session=>activateOpeningSnapshot(session,{runtime:r,source:s},plan));
 result.opening=plan;checked('private-qa-cluster',{database:databaseName,listenAddresses:'',migrationVersions:result.migrations.map(m=>m.id)});

 const approve=async(id,version,session=sessions.admin)=>success(await command(session,request(id,'approve',version)),'approve').document;
 const create=async(b,session=sessions.admin)=>{const id=randomUUID();return success(await command(session,request(id,'create',0,b)),'create').document;};
 const exchange=(lines,funds=[],extra={})=>body(lines,funds,{business_type:'RETURN_EXCHANGE',return_warehouse_id:w2,outgoing_warehouse_id:w1,...extra});
 const incoming=(id,price,q='-1',extra={})=>line(id,price,q,sku1,{warehouse_id:w2,direction:'RETURN_IN',product_id:p1,source_product_code:'P1',source_product_name:'Synthetic product',color_id:colorId,size_id:sizeId,source_color_name:'蓝色',source_size_name:'M',...extra});
 const outgoing=(id,price,q='1',extra={})=>line(id,price,q,sku1,{direction:'SALE_OUT',...extra});
 const atStart=[await balance(),await balance(sku1,w2)];
 const ex=await create(exchange([incoming('IN','200.00','-2'),outgoing('OUT','300.00')],[fund('REFUND','-100.00')]));
 assert.equal(ex.body.salesFacts.dueCents,'-10000');assert.deepEqual([await balance(),await balance(sku1,w2)],atStart);
 const approveRequest=request(ex.id,'approve',1),twice=await Promise.all([command(sessions.admin,approveRequest),command(sessions.admin,approveRequest)]);
 assert.deepEqual(success(twice[0],'parallel approval'),success(twice[1],'same key retry'));
 assert.deepEqual([await balance(),await balance(sku1,w2)],['99.0000','2.0000']);
 assert.equal(value(`SELECT count(*) FROM ${r}.posting WHERE document_id=${literal(ex.id)}::uuid`),1);
 assert.equal(value(`SELECT count(*) FROM ${r}.movement WHERE posting_id IN(SELECT id FROM ${r}.posting WHERE document_id=${literal(ex.id)}::uuid)`),2);
 await rejection('stale-dual-side-version',()=>command(sessions.warehouse,request(ex.id,'approve',1)),'VERSION_CONFLICT',409);
 const revoked=success(await command(sessions.warehouse,request(ex.id,'unapprove',2)),'unapprove').document;
 assert.deepEqual(revoked.body,ex.body);assert.deepEqual([await balance(),await balance(sku1,w2)],atStart);
 await approve(ex.id,3);assert.deepEqual([await balance(),await balance(sku1,w2)],['99.0000','2.0000']);
 checked('independent-2x200-for-1x300-refund-100-dual-warehouse',{documentId:ex.id,originalRequired:false,dueCents:'-10000',balances:['99.0000','2.0000'],onePostingTwoMovements:true});
 checked('dual-side-unapprove-reapprove-preserves-facts',{documentId:ex.id,balancesAfterReversal:atStart});
 const lateBefore=fingerprint();assert.deepEqual(success(await command(sessions.admin,approveRequest),'late original approval result'),success(twice[0],'original result'));assert.deepEqual(fingerprint(),lateBefore);checked('late-old-approval-replay-after-reversal-does-not-post',{documentId:ex.id,requestKey:approveRequest.requestKey});
 const zero=await create(exchange([incoming('ZI','200.00','-2',{warehouse_id:w1}),outgoing('ZO','200.00','2')],[],{return_warehouse_id:w1}));
 const zeroBefore=await balance();await approve(zero.id,1);assert.equal(await balance(),zeroBefore);
 const zeroMovements=value(`SELECT jsonb_agg(quantity::text ORDER BY quantity) FROM ${r}.movement WHERE posting_id IN(SELECT id FROM ${r}.posting WHERE document_id=${literal(zero.id)}::uuid)`);
 assert.deepEqual(zeroMovements,['-2.0000','2.0000']);checked('same-warehouse-sku-zero-net-preserves-two-sides',{documentId:zero.id,movements:zeroMovements});
 for(const [name,lines,due] of [['pure-return',[incoming('PURE-IN','3.00','-2')],'-6.00'],['pure-out',[outgoing('PURE-OUT','3.00','2')],'6.00'],['positive-difference',[incoming('POS-IN','2.00'),outgoing('POS-OUT','3.00')],'1.00']]){
  const d=await create(exchange(lines,[fund(name,due)]));await approve(d.id,1);checked(name,{documentId:d.id,due});
 }
 await rejection('warehouse-side-mismatch',()=>command(sessions.admin,request(randomUUID(),'create',0,exchange([incoming('BAD-W','2.00')],[],{return_warehouse_id:w1}))),'LINK',409);
 await rejection('negative-price-not-return-direction',()=>command(sessions.admin,request(randomUUID(),'create',0,exchange([incoming('BAD-P','-2.00')]))),'VALIDATION');
 await rejection('signed-direction-mismatch',()=>command(sessions.admin,request(randomUUID(),'create',0,exchange([incoming('BAD-D','2.00','-1',{direction:'SALE_OUT'})]))),'VALIDATION');
 await rejection('zero-transaction-quantity',()=>command(sessions.admin,request(randomUUID(),'create',0,exchange([incoming('BAD-Q','2.00','0')]))),'VALIDATION');
 await rejection('refund-sign-mismatch',()=>command(sessions.admin,request(randomUUID(),'create',0,exchange([incoming('BAD-F','2.00')],[fund('BAD-F','-2.00',{direction:'receipt'})]))),'FUNDS');
 await rejection('invalid-link-shape-cannot-be-treated-as-independent',()=>command(sessions.admin,request(randomUUID(),'create',0,exchange([incoming('INVALID-LINK','2.00','-1',{original_line_id:123})]))),'LINK',409);
 await rejection('duplicate-input-event-ids',()=>command(sessions.admin,request(randomUUID(),'create',0,exchange([incoming('SAME','2.00'),incoming('SAME','2.00')]))),'VALIDATION');
 const disableWarehouse=enabled=>adminSql(`UPDATE ${r}.master_data_entity SET body=jsonb_set(body,'{enabled}','${enabled}') WHERE kind='warehouses' AND id=${literal(w2)}`);
 disableWarehouse(false);
 await rejection('disabled-incoming-warehouse',()=>command(sessions.admin,request(randomUUID(),'create',0,exchange([incoming('DISABLED','2.00')]))),'SCOPE',403);
 disableWarehouse(true);
 await rejection('salesperson-other-hall-return-denied',()=>command(sessions.otherSales,request(randomUUID(),'create',0,exchange([incoming('OTHER-HALL','2.00')]))),'SCOPE',403);
 const failDoc=await create(exchange([incoming('FAIL-IN','200.00','-2'),outgoing('FAIL-OUT','300.00')],[fund('FAIL-FUND','-100.00')]));
 adminSql(`SET ROLE ${ident(config.roles.runtime)};CREATE FUNCTION ${r}.t22_fail_second() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.line_index=1 THEN RAISE EXCEPTION 'T22_SYNTHETIC_SECOND_SIDE_FAILURE'; END IF;RETURN NEW;END$$;
 CREATE TRIGGER t22_failure BEFORE INSERT ON ${r}.movement FOR EACH ROW EXECUTE FUNCTION ${r}.t22_fail_second();RESET ROLE;`);
 const failedRequest=request(failDoc.id,'approve',1);
 await rejection('second-side-failure-rolls-back-all-layers',()=>command(sessions.admin,failedRequest),'ROLLED_BACK',409);
 adminSql(`SET ROLE ${ident(config.roles.runtime)};DROP TRIGGER t22_failure ON ${r}.movement;DROP FUNCTION ${r}.t22_fail_second();RESET ROLE;`);
 success(await command(sessions.admin,failedRequest),'retry rolled-back key');checked('failed-dual-side-request-can-retry-once',{documentId:failDoc.id});
 const race=await create(exchange([incoming('RACE-IN','200.00','-2'),outgoing('RACE-OUT','300.00')],[fund('RACE-PAY','-100.00')]));
 const raced=await Promise.all([command(sessions.admin,request(race.id,'approve',1)),command(sessions.warehouse,request(race.id,'approve',1))]);
 assert.deepEqual(raced.map(x=>x.statusCode).sort(),[200,409]);assert.equal(raced.find(x=>x.statusCode===409).json().error.code,'VERSION_CONFLICT');
 assert.equal(value(`SELECT count(*) FROM ${r}.posting WHERE document_id=${literal(race.id)}::uuid`),1);checked('two-actors-one-dual-side-approval',{documentId:race.id});
 // Trusted imported linked revisions exercise protection without re-opening an original-sale write flow.
 function imported(id,b,{approved=false,baseline=false}={}){
  adminSql(`SET ROLE ${ident(config.roles.runtime)};INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,active_effect_identity,active_effect_revision,current_revision,version,business_day)
   VALUES(${literal(id)},'SALE',${literal('H-'+id)},${literal(approved?'APPROVED':'UNAUDITED')},${baseline},${approved},${approved?literal('baseline:'+id):'NULL'},${approved?'1':'NULL'},1,1,'2026-10-02');
   INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id) VALUES(${literal(id)},1,true,${literal(JSON.stringify(b))}::jsonb,NULL);RESET ROLE;`);
 }
 const parent=await create(body([line('ORIGINAL','2.00','3')],[fund('ORIGINAL-PAY','5.99')],{adjustment:'0.01'}));await approve(parent.id,1);
 const linked=(id,amount='-2.00',quantity='-1',extra={})=>exchange([incoming(id,'2.00',quantity,{original_line_id:'ORIGINAL',amount,unit:'件',stock_quantity_contribution:String(-Number(quantity)),...extra})],
  [fund(id+'-REFUND',amount)],{original_document_id:parent.id});
 const childA=randomUUID(),childB=randomUUID(),childC=randomUUID();imported(childA,linked('CHILD-A'));imported(childB,linked('CHILD-B'));imported(childC,linked('CHILD-C','-1.99'));
 await rejection('new-original-sale-write-entry-stays-retired',()=>command(sessions.admin,request(randomUUID(),'create',0,linked('NEW-LINK'))),'HISTORICAL_ONLY',409);
 await rejection('original-cannot-unapprove-with-linked-draft',()=>command(sessions.admin,request(parent.id,'unapprove',2)),'LINK',409);
 const parentDetail=success(await get(sessions.admin,'/api/sales/document/'+parent.id),'protected parent');assert.equal(parentDetail.association_protected,true);
 const parentBefore=structuredClone(parentDetail.body),noteBody=structuredClone(parentBefore);noteBody.header.note='memo only';
 const memoBalance=[await balance(),await balance(sku1,w2)],postingsBefore=value(`SELECT count(*) FROM ${r}.posting WHERE document_id=${literal(parent.id)}::uuid`);
 const memo=success(await command(sessions.sales,request(parent.id,'save',2,noteBody)),'approved original memo').document;
 assert.equal(memo.status,'APPROVED');assert.equal(memo.currentEffectActive,true);assert.equal(memo.body.header.note,'memo only');assert.deepEqual(memo.body.lines,parentBefore.lines);assert.deepEqual(memo.body.fundsRecords,parentBefore.fundsRecords);
 assert.deepEqual([await balance(),await balance(sku1,w2)],memoBalance);assert.equal(value(`SELECT count(*) FROM ${r}.posting WHERE document_id=${literal(parent.id)}::uuid`),postingsBefore);
 checked('linked-approved-original-note-is-versioned-without-posting',{documentId:parent.id,version:memo.version,originalBasisPreserved:true,unknownImportedActorsNotInvented:true});
 for(const [field,change] of [['quantity',b=>b.lines[0].source_quantity='2'],['price',b=>b.lines[0].unit_price='3.00'],['sku',b=>b.lines[0].sku_id=sku2],['warehouse',b=>b.lines[0].warehouse_id=w2],['gift',b=>b.lines[0].gift=true],['allocation',b=>b.lines[0].return_basis.unitCents='1'],['discount',b=>b.header.adjustment='0.00'],['remove',b=>b.lines=[]]]){
  const bad=structuredClone(memo.body);change(bad);
  await rejection('linked-original-'+field+'-change-denied',()=>command(sessions.admin,request(parent.id,'save',memo.version,bad)),'LINK',409);
 }
 const over=randomUUID(),overBody=linked('OVER-1','-4.00','-2');overBody.lines.push(incoming('OVER-2','2.00','-2',{original_line_id:'ORIGINAL',amount:'-4.00',unit:'件',stock_quantity_contribution:'2'}));overBody.fundsRecords[0].amount='-8.00';imported(over,overBody);
 await rejection('duplicate-linked-rows-aggregate-overreturn',()=>command(sessions.admin,request(over,'approve',1)),'LINK',409);
 const firstPair=await Promise.all([command(sessions.admin,request(childA,'approve',1)),command(sessions.warehouse,request(childB,'approve',1))]);
 firstPair.forEach(x=>success(x,'two valid one-piece returns'));
 await approve(childC,1);const originalChildren=value(`SELECT count(*) FROM ${r}.document WHERE id=ANY(ARRAY[${[childA,childB,childC].map(literal).join(',')}]::uuid[]) AND current_effect_active`);assert.equal(originalChildren,3);
 checked('original-allocation-remainder-consumed-once',{parentId:parent.id,amounts:['-2.00','-2.00','-1.99'],sumCents:'-599',returnedQuantity:'3'});
 const tooMuch=randomUUID();imported(tooMuch,linked('EXCESS','-2.00'));await rejection('cumulative-linked-quantity-exhausted',()=>command(sessions.admin,request(tooMuch,'approve',1)),'LINK',409);
 success(await command(sessions.admin,request(childC,'unapprove',2)),'reverse linked tail');
 const tailBad=structuredClone(linked('TAIL-WRONG','-2.00')),tailBadId=randomUUID();imported(tailBadId,tailBad);
 await rejection('linked-tail-cent-conflict',()=>command(sessions.admin,request(tailBadId,'approve',1)),'LINK',409);
 const anotherTail=randomUUID();imported(anotherTail,linked('TAIL-OTHER','-1.99'));
 const tails=await Promise.all([command(sessions.admin,request(childC,'approve',3)),command(sessions.warehouse,request(anotherTail,'approve',1))]);
 assert.deepEqual(tails.map(x=>x.statusCode).sort(),[200,409]);assert.equal(tails.find(x=>x.statusCode===409).json().error.code,'LINK');
 const tailPostings=value(`SELECT count(*) FROM ${r}.posting WHERE reason='REVISION_APPROVAL' AND document_id=ANY(ARRAY[${literal(childC)},${literal(anotherTail)}]::uuid[])`);assert.equal(tailPostings,2);
 checked('concurrent-linked-returns-last-piece-only-once',{parentId:parent.id,oneSuccessOneConflict:true});
 const rebound=structuredClone(linked('CHILD-A'));rebound.lines[0].original_line_id='OTHER';await rejection('existing-link-cannot-rebind',()=>command(sessions.admin,request(childA,'save',2,rebound)),'LINK',409);
 const unapprovedOriginal=randomUUID(),unapprovedBody=structuredClone(parentBefore);unapprovedBody.lines[0].source_id='VOID-ORIGINAL';unapprovedBody.lines[0].historical_returned_quantity='1';unapprovedBody.links=[{lineId:'VOID-ORIGINAL',returnedQuantity:'1'}];imported(unapprovedOriginal,unapprovedBody);
 await rejection('linked-unaudited-original-cannot-void',()=>command(sessions.admin,request(unapprovedOriginal,'delete',1)),'LINK',409);

 const duplicateParent=await create(body([line('VALID-DUP-ORIGINAL','2.00','3')],[fund('DUP-ORIG-PAY','6.00')]));await approve(duplicateParent.id,1);
 const duplicateChild=randomUUID(),duplicateBody=exchange(['DUP-A','DUP-B'].map(id=>incoming(id,'2.00','-1',{original_line_id:'VALID-DUP-ORIGINAL',amount:'-2.00',unit:'件',stock_quantity_contribution:'1'})),[fund('DUP-PAY','-4.00')],{original_document_id:duplicateParent.id});
 imported(duplicateChild,duplicateBody);const dupApproved=await approve(duplicateChild,1);assert.equal(dupApproved.body.lines.length,2);
 assert.equal(value(`SELECT count(*) FROM ${r}.movement WHERE posting_id IN(SELECT id FROM ${r}.posting WHERE document_id=${literal(duplicateChild)}::uuid)`),2);
 checked('valid-repeated-original-line-sums-without-double-posting',{parentId:duplicateParent.id,childId:duplicateChild,returnedQuantity:'2',lineCount:2});

 // Source-only associations and legacy immediate return records are not editable through runtime commands.
 const sourceOriginal=randomUUID(),sourceLine=randomUUID(),legacy=randomUUID(),legacyLine=randomUUID(),sourceOrigBody=body([]);
 sourceOrigBody.lines=[line(sourceLine,'2.00','3',sku1,{product_id:p1,source_product_code:'P1',source_product_name:'Synthetic product',amount:'6.00',stock_quantity_contribution:'-3',unit:'件',return_basis:{quantity:'3',netCents:'600',unitCents:'200',extraCentUnits:'0'}})];
 imported(sourceOriginal,sourceOrigBody,{approved:true,baseline:true});imported(legacy,exchange([incoming(legacyLine,'2.00','-1',{amount:'-2.00',stock_quantity_contribution:'1',original_line_id:sourceLine})],[fund('LEGACY-PAY','-2.00')],{original_document_id:sourceOriginal}),{approved:true,baseline:true});
 adminSql(`SET ROLE ${ident(config.roles.source)};INSERT INTO ${s}.business_document(id,number,type,status,document_date,original_document_id) VALUES
  (${literal(sourceOriginal)},'SOURCE-ORIGINAL','SALE','APPROVED','2026-10-02',NULL),(${literal(legacy)},'OLD-RETURN','RETURN_EXCHANGE','COMPLETED','2026-10-02',${literal(sourceOriginal)});
  INSERT INTO ${s}.document_line(id,document_id,variant_id,warehouse_id,direction,product_code,product_name,options_snapshot,unit_name,quantity,unit_price,amount,historical_returned_quantity) VALUES
  (${literal(sourceLine)},${literal(sourceOriginal)},${literal(sku1)},${literal(w1)},'OUT','P1','Historical','{}','件',3,2,6,1),(${literal(legacyLine)},${literal(legacy)},${literal(sku1)},${literal(w2)},'IN','P1','Historical','{}','件',1,2,2,0);
  INSERT INTO ${s}.return_line_reference(return_line_id,original_sale_line_id) VALUES(${literal(legacyLine)},${literal(sourceLine)});RESET ROLE;`);
 await rejection('source-only-original-unapprove-protected',()=>command(sessions.admin,request(sourceOriginal,'unapprove',1)),'LINK',409);
 const sourceMemo=structuredClone(sourceOrigBody);sourceMemo.header.note='source memo';success(await command(sessions.admin,request(sourceOriginal,'save',1,sourceMemo)),'source original note');
 for(const op of ['save','approve','unapprove','delete'])await rejection('legacy-immediate-'+op+'-readonly',()=>command(sessions.admin,request(legacy,op,1,op==='save'?linked('OLD'):undefined)),'HISTORICAL_ONLY',409);
 const readBefore=fingerprint(),legacyRead=success(await get(sessions.admin,'/api/sales/document/'+legacy),'legacy read');assert.equal(legacyRead.legacy_readonly,true);assert.equal(legacyRead.creator,null);assert.equal(legacyRead.history[0].created_at,null);assert.deepEqual(fingerprint(),readBefore);
 const dedupChild=randomUUID();imported(dedupChild,exchange([incoming('DEDUP-CHILD','2.00','-2',{amount:'-4.00',stock_quantity_contribution:'2',original_line_id:sourceLine,unit:'件'})],[fund('DEDUP-REFUND','-4.00')],{original_document_id:sourceOriginal}));
 await approve(dedupChild,1);checked('source-runtime-same-baseline-not-double-counted',{originalId:sourceOriginal,baselineReturned:'1',newReturned:'2',totalReturned:'3'});
 checked('source-links-original-identity-and-legacy-readonly-preserved',{originalId:sourceOriginal,legacyId:legacy,originalAuditorUnknown:true});
 await rejection('retired-command-route-not-restored',()=>command(sessions.admin,{...request(legacy,'approve',1),operation:'return'}),'VALIDATION');
 const originalLatest=success(await get(sessions.admin,'/api/sales/document/'+parent.id),'original for disabled memo');
 adminSql(`UPDATE ${r}.master_data_entity SET body=jsonb_set(body,'{enabled}','false') WHERE kind='warehouses' AND id=${literal(w1)}`);
 const pureDisabledOut=exchange([incoming('ONLY-IN-ACTIVE','2.00')],[fund('ONLY-IN-REFUND','-2.00')],{source_warehouse_id:w2});delete pureDisabledOut.header.outgoing_warehouse_id;
 const pureOnly=await create(pureDisabledOut);await approve(pureOnly.id,1);checked('pure-return-needs-only-incoming-warehouse',{documentId:pureOnly.id,unusedOutgoingWarehouseDisabled:true});
 const disabledMemo=structuredClone(originalLatest.body);disabledMemo.header.note='disabled warehouse memo';
 success(await command(sessions.admin,request(parent.id,'save',originalLatest.version,disabledMemo)),'disabled original warehouse memo');
 adminSql(`UPDATE ${r}.master_data_entity SET body=jsonb_set(body,'{enabled}','true') WHERE kind='warehouses' AND id=${literal(w1)}`);
 checked('linked-note-does-not-require-new-use-of-disabled-warehouse');
 result.bridge=await exerciseReturnBridge({root,app,session:sessions.admin,origin:env.SESSION_ORIGIN,warehouseIds:[w1,w2],hallId:hall,productId:p1,skuId:sku1,colorId,sizeId,methodId:method,accountId:account,actor:actors.admin,protectedId:parent.id,legacyId:legacy});
 writeJson(join(out,'bridge-verification.json'),result.bridge);checked('actual-return-transport-and-recovery',{responseRecoveryPostedAgain:false});
 const originalImports=value(`SELECT jsonb_object_agg(document_id::text,body) FROM ${r}.revision WHERE original_imported AND document_id=ANY(ARRAY[${literal(historicalZero)},${literal(historicalFive)}]::uuid[])`);assert.deepEqual(originalImports,baselineBodies);
 result.finalFingerprint=fingerprint();result.status='PASS';result.completedAt=new Date().toISOString();writeJson(join(suite,'RESULT.json'),result);
}catch(error){result.status='FAIL';result.failure=error instanceof Error?error.message:'T22_VERIFY_FAILED';result.completedAt=new Date().toISOString();writeJson(join(suite,'RESULT.json'),result);throw error;
}finally{
 if(app)await app.close();
 if(started){const stop=spawnSync(join(pg,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C'},maxBuffer:1024*1024});
  writeFileSync(join(suite,'stop.log'),(stop.stdout??'')+(stop.stderr??''),{mode:0o600});result.clusterStopped=stop.status===0;
  writeJson(join(suite,'RESULT.json'),result);writeJson(join(out,'database-verification.json'),result);assert.equal(stop.status,0,'T22_PRIVATE_CLUSTER_STOP_FAILED');}
}
