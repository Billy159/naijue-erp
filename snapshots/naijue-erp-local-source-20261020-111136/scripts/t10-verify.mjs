import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {randomUUID, randomBytes, pbkdf2Sync, createHash, webcrypto} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, chmodSync, cpSync, realpathSync} from 'node:fs';
import {resolve, join, isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {root, writeJson} from './files.mjs';

const pg = process.env.T10_PG_BIN;
if (!pg || !isAbsolute(pg)) throw new Error('T10_PG_BIN must explicitly select local PostgreSQL 17');
const out = resolve(root, 'outputs/T10'), log = resolve(root, 'logs/T10');
mkdirSync(out, {recursive: true}); mkdirSync(log, {recursive: true}); chmodSync(log, 0o700);
const suite = mkdtempSync(join(log, 'postgres-suite-')), socket = log, port = '55490', admin = 't10_bootstrap';
// Recovery is limited to this task's own failed fixture initialization with NO documents/sessions/audit.
// It never accepts another task's cluster, external directories, active sockets or existing business rows.
const recoveryName = process.env.T10_RECOVER_EMPTY_SUITE;
let recovery = null;
if (recoveryName) {
  assert.match(recoveryName, /^postgres-suite-[a-zA-Z0-9]{6}$/);
  const previous = join(log, recoveryName), evidence = JSON.parse(readFileSync(join(previous,'RESULT.json'),'utf8'));
  const target = JSON.parse(readFileSync(join(previous,'qa-bootstrap.log'),'utf8')).target;
  assert.equal(evidence.status,'FAIL');assert.equal(evidence.clusterStopped,true);assert.equal(evidence.existingBusinessConnections,0);assert.equal(evidence.realCredentialsUsed,false);
  assert.equal(evidence.cluster.dataDirectory,join(previous,'data'));assert.equal(realpathSync(join(previous,'data')),join(previous,'data'));
  assert.equal(evidence.cluster.listenAddresses,'');assert.equal(target.clusterId,evidence.cluster.clusterId);
  assert.equal(target.host,socket);assert.equal(String(target.port),port);assert.equal(target.environment,'qa');assert.match(target.database,/^demo_8877_t10_qa_[a-f0-9]{8}$/);
  recovery={previous,target};
}
const dataDirectory=recovery?join(recovery.previous,'data'):join(suite,'data');
const runtime = join(suite, 'verified-server');
const build = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', resolve(root, 'tsconfig.json'), '--outDir', runtime], {encoding: 'utf8'});
writeFileSync(join(suite, 'strict-build.log'), build.stdout + build.stderr); assert.equal(build.status, 0, 'Private strict build failed; no DB connection attempted');
cpSync(resolve(root, 'server/database/sql'), join(runtime, 'database/sql'), {recursive: true});
const load = name => import(pathToFileURL(join(runtime, name)).href);
const {readDatabaseConfig, assertIsolatedTarget, databaseIdentifier: ident} = await load('database/config.js');
const {bootstrapAssertionSql} = await load('database/identity.js');
const {sqlLiteral: literal} = await load('database/sql.js');
const {createApp} = await load('app.js'), {readConfig} = await load('config.js');
const {registerBusinessRoute} = await load('security/http.js');
const {operation, operations, authorizeDocument} = await load('security/policies.js');
const {SessionKeys} = await load('security/config.js');
const {PgDataAccess} = await load('database/access.js');
assert.ok(Buffer.byteLength(socket + '/.s.PGSQL.' + port) < 104, 'Private socket path exceeds platform limit');
assert.equal(existsSync(join(socket, '.s.PGSQL.' + port)), false, 'Never reuse an existing socket');
const checks = [], denials = [], apps = [], targets = [], tables = new Map();
const result = {status: 'RUNNING', suite, checks, denials, productionConnections: 0, existingBusinessConnections: 0, serverOperations: 0, realCredentialsUsed: false};
const checked = (name, details = {}) => {checks.push({name, status: 'PASS', ...details}); console.log('PASS: ' + name);};
function tool(name, args, file) {
  const r = spawnSync(join(pg, name), args, {encoding: 'utf8', env: {PATH: process.env.PATH, LANG: 'C', PGPASSFILE: '/dev/null'}, maxBuffer: 8 * 1024 * 1024});
  writeFileSync(join(suite, file), r.stdout + r.stderr); assert.equal(r.status, 0, name + ' failed; see private log'); return r.stdout.trim();
}
const conn = database => ['-h', socket, '-p', port, '-U', admin, '-d', database];
function adminSql(c, statement) {
  assertIsolatedTarget(c);
  const r = spawnSync(join(pg, 'psql'), ['-X','-w','-qAt','-v','ON_ERROR_STOP=1',...conn(c.database)], {input: bootstrapAssertionSql(c, admin) + '\n' + statement,
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: {PATH: process.env.PATH, PGPASSFILE: '/dev/null', PGOPTIONS: '-c search_path=pg_catalog -c timezone=UTC'}});
  assert.equal(r.status, 0, 'Isolated synthetic fixture SQL failed; row contents suppressed'); return r.stdout.trim();
}
const value = (c, sql) => JSON.parse(adminSql(c, sql));
function cli(env, command, file) {
  const r = spawnSync(process.execPath, [join(runtime, 'database/cli-main.js'), command], {encoding: 'utf8', env: {PATH: process.env.PATH, ...env}, maxBuffer: 2 * 1024 * 1024});
  writeFileSync(join(suite, file), r.stdout + r.stderr); assert.equal(r.status, 0, 'Isolated maintenance failed'); return JSON.parse(r.stdout);
}
function fingerprints(c) {
  if (!tables.has(c.database)) tables.set(c.database, value(c, `SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',t.relname) ORDER BY n.nspname,t.relname)
    FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=ANY(ARRAY[${Object.values(c.schemas).map(literal).join(',')}]) AND t.relkind IN ('r','S')`));
  const selects = tables.get(c.database).map(t => `SELECT jsonb_build_object('schema',${literal(t.schema)},'table',${literal(t.table)},'rows',count(*),
    'sha256',encode(sha256(convert_to(coalesce(string_agg(row_to_json(ROW(r.*))::text,E'\\n' ORDER BY row_to_json(ROW(r.*))::text),''),'UTF8')),'hex')) AS fingerprint FROM ${ident(t.schema)}.${ident(t.table)} r`);
  return value(c, `SELECT jsonb_agg(fingerprint ORDER BY fingerprint->>'schema',fingerprint->>'table') FROM (${selects.join(' UNION ALL ')}) f`);
}
const digest = item => createHash('sha256').update(JSON.stringify(item)).digest('hex');
const allFingerprints = () => Object.fromEntries(targets.map(t => [t.config.environment, fingerprints(t.config)]));
async function denied(name, app, request, status, code) {
  const before = allFingerprints();
  const response = await app.inject(request);
  assert.equal(response.statusCode, status, name + ': ' + response.body);
  if (code) assert.equal(response.json().error.code, code, name);
  const after = allFingerprints(); assert.deepEqual(after, before, name + ' mutated database');
  const item = {name, method: request.method ?? 'GET', url: request.url, statusCode: status, code: response.json().error.code, fingerprintBefore: digest(before), fingerprintAfter: digest(after), databaseUnchanged: true};
  denials.push(item); writeJson(join(suite, 'denial-' + String(denials.length).padStart(3, '0') + '.json'), {verification: item, before, after});
}
const uid = number => '10000000-0000-4000-8000-' + String(number).padStart(12, '0');
const hall = uid(101), otherHall = uid(102), warehouses = [201,202,203,204,205].map(uid), product = uid(1), sku = uid(2), otherSku = uid(3), image = uid(401);
const docs = {own: uid(301), colleague: uid(302), cross: uid(303), unknownHall: uid(304), transfer: uid(305), stoppedOut: uid(306), stoppedIn: uid(307), negativeOut: uid(308), unknownWarehouse: uid(309), unknownCreator: uid(311)};
const users = [{id:'t10-admin',role:'管理员'}, {id:'t10-warehouse',role:'仓库人员'}, {id:'t10-sales-a',role:'营业员',storeId:hall}, {id:'t10-sales-b',role:'营业员',storeId:hall}, {id:'t10-sales-c',role:'营业员',storeId:otherHall}];
const password = randomUUID() + '-synthetic';
let started = false;
try {
  assert.match(tool('postgres', ['--version'], 'version.log'), /PostgreSQL\) 17\./);
  if(!recovery) tool('initdb', ['-D',dataDirectory,'-U',admin,'--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C','--wal-segsize=1','--set','min_wal_size=2MB','--set','max_wal_size=8MB'], 'initdb.log');
  const walSettings=recovery?'min_wal_size=32MB -c max_wal_size=32MB':'min_wal_size=2MB -c max_wal_size=8MB';
  tool('pg_ctl', ['-D',dataDirectory,'-l',join(suite,'postgres.log'),'-o',`-c listen_addresses='' -c ${walSettings} -c unix_socket_permissions=0700 -c unix_socket_directories=${socket} -p ${port}`,'-w','start'], 'start.log'); started = true;
  const cluster = JSON.parse(tool('psql', ['-X','-w','-qAt',...conn('postgres'),'-c', "SELECT jsonb_build_object('clusterId',system_identifier::text,'dataDirectory',current_setting('data_directory'),'listenAddresses',current_setting('listen_addresses')) FROM pg_control_system()"], 'identity.log'));
  assert.equal(cluster.dataDirectory, dataDirectory); assert.equal(cluster.listenAddresses, ''); result.cluster = cluster;
  if(recovery){assert.equal(cluster.clusterId,recovery.target.clusterId);result.recoveredOwnEmptySuite=recovery.previous;}
  checked('Fresh PostgreSQL 17 cluster and private Unix socket; TCP disabled');
  // Deliberately share a synthetic key to prove environment binding also resists misconfigured shared secrets.
  const secretFile = join(suite,'synthetic-session.key'); writeFileSync(secretFile, randomBytes(48), {mode:0o600});
  function make(environment) {
    const recovered=environment==='qa' && recovery;
    const suffix = recovered?recovery.target.database.slice(-8):randomUUID().replaceAll('-','').slice(0,8), prefix = 't10_' + environment + '_' + suffix;
    const env = {APP_ENV: environment, APP_DATABASE_MODE:'required', POSTGRES_HOST:socket, POSTGRES_PORT:port, POSTGRES_DB:'demo_8877_t10_' + environment + '_' + suffix,
      POSTGRES_USER:prefix + '_app', POSTGRES_ROLE_PREFIX:prefix, POSTGRES_SOURCE_SCHEMA:'t10_source', POSTGRES_RUNTIME_SCHEMA:'t10_runtime', POSTGRES_AUTH_SCHEMA:'t10_auth', POSTGRES_CONTROL_SCHEMA:'t10_control',
      POSTGRES_INSTANCE_ID:recovered?recovery.target.instanceId:randomUUID(), POSTGRES_CLUSTER_ID:cluster.clusterId, POSTGRES_BOOTSTRAP_USER:admin, PSQL_BIN:join(pg,'psql'), SESSION_ORIGIN:'https://t10-' + environment + '.invalid', SESSION_SECRET_FILE:secretFile};
    if(recovered) {
      cli(env,'inspect','qa-recovered-inspect.log');
      const c=readDatabaseConfig(env);
      const accounts=value(c,`SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',body->>'name','login',login_name,'version',version) ORDER BY id),'[]') FROM ${ident(c.schemas.auth)}.employee_login`);
      if(accounts.length) assert.deepEqual(accounts,users.map(u=>({id:u.id,name:u.id,login:u.id,version:1})).sort((a,b)=>a.id.localeCompare(b.id)));
      assert.equal(value(c,`SELECT count(*) FROM ${ident(c.schemas.auth)}.employee_session`),0);
      assert.equal(value(c,`SELECT count(*) FROM ${ident(c.schemas.auth)}.employee_account_audit`),0);
      assert.equal(value(c,`SELECT count(*) FROM ${ident(c.schemas.runtime)}.document`),0);
      const populated=fingerprints(c).filter(x=>x.schema===c.schemas.source && x.rows && !x.table.endsWith('_seq'));
      const expectedSource=[['category',1],['product',1],['unit',1],['variant',2],['warehouse',5]];
      if(populated.some(x=>x.table==='tplus_import_run')) expectedSource.push(['tplus_import_run',1],['tplus_hall',2]);
      assert.deepEqual(populated.map(x=>[x.table,x.rows]).sort(),expectedSource.sort());
      const source=ident(c.schemas.source);
      assert.equal(value(c,`SELECT to_json(bool_and(code='T10' AND name='Synthetic product' AND id=${literal(product)}::uuid)) FROM ${source}.product`),true);
      checked('Recovered only this T10 failed fixture initialization: exact identity; no documents/sessions/audit; only known synthetic fixtures');
    } else {
      tool('createdb', [...conn('postgres').slice(0,-2),'-S','file_copy',env.POSTGRES_DB], environment + '-create.log');
      cli(env, 'bootstrap', environment + '-bootstrap.log'); cli(env, 'migrate', environment + '-migrate.log');
    }
    const config = readDatabaseConfig(env), appConfig = readConfig(env), r = ident(config.schemas.runtime), s = ident(config.schemas.source), a = ident(config.schemas.auth);
    adminSql(config, `SET ROLE ${ident(config.roles.source)};
      INSERT INTO ${s}.tplus_import_run(batch_id,space_key,schema_name,database_name,manifest_path,manifest_sha256,preflight_batch_id,importer_version,status,git_sha,workspace_state_sha256)
        VALUES('T10','SYNTHETIC',${literal(config.schemas.source)},${literal(config.database)},'SYNTHETIC-NO-ORIGINALS',repeat('0',64),'SYNTHETIC','T10-fixture','COMMITTED','SYNTHETIC',repeat('0',64)) ${recovered?'ON CONFLICT(batch_id) DO NOTHING':''};
      INSERT INTO ${s}.category(id,code,code_normalized,name) VALUES(${literal(product)},'T10','T10','Synthetic category') ${recovered?'ON CONFLICT(id) DO NOTHING':''};
      INSERT INTO ${s}.unit(id,code,code_normalized,name) VALUES(${literal(product)},'T10','T10','Synthetic unit') ${recovered?'ON CONFLICT(id) DO NOTHING':''};
      INSERT INTO ${s}.product(id,code,code_normalized,name,category_id,unit_id) VALUES(${literal(product)},'T10','T10','Synthetic product',${literal(product)},${literal(product)}) ${recovered?'ON CONFLICT(id) DO NOTHING':''};
      INSERT INTO ${s}.variant(id,product_id,option_key) VALUES(${literal(sku)},${literal(product)},'ONE'),(${literal(otherSku)},${literal(product)},'TWO') ${recovered?'ON CONFLICT(id) DO NOTHING':''};
      ${warehouses.map((id,i) => `INSERT INTO ${s}.warehouse(id,code,code_normalized,name,type,enabled) VALUES(${literal(id)},'W${i}','W${i}','Synthetic W${i}','WAREHOUSE',${i < 2}) ${recovered?'ON CONFLICT(id) DO NOTHING':''};`).join('\n')}
      INSERT INTO ${s}.tplus_hall(batch_id,id,source_id,source_code,name,warehouse_ids,source_payload) VALUES
        ('T10',${literal(hall)},'H1','H1','Synthetic hall one',ARRAY[${literal(warehouses[0])}::uuid],'{}'),
        ('T10',${literal(otherHall)},'H2','H2','Synthetic hall two',ARRAY[${literal(warehouses[1])}::uuid],'{}') ${recovered?'ON CONFLICT(batch_id,source_id) DO NOTHING':''}; RESET ROLE;`);
    for (const user of users) {
      const body = {...user,name:user.id,employmentStatus:'在职',loginEnabled:true,loginName:user.id,phone:'',enabled:true};
      const salt = user.id === 't10-sales-a' ? randomUUID() : randomBytes(24).toString('hex');
      const hash = pbkdf2Sync(password,salt,210000,32,'sha256').toString('hex');
      adminSql(config, `SET ROLE ${ident(config.roles.auth)}; INSERT INTO ${a}.employee_login(id,login_name,body,password_salt,password_hash) VALUES(${literal(user.id)},${literal(user.id)},${literal(JSON.stringify(body))},${literal(salt)},${literal(hash)})
        ${recovered?'ON CONFLICT(id) DO UPDATE SET body=excluded.body,password_salt=excluded.password_salt,password_hash=excluded.password_hash':''}; RESET ROLE;
        SET ROLE ${ident(config.roles.runtime)}; INSERT INTO ${r}.operator(id,name,role) VALUES(${literal(user.id)},${literal(user.id)},${literal({'管理员':'ADMIN','仓库人员':'WAREHOUSE','营业员':'SALESPERSON'}[user.role])}) ${recovered?'ON CONFLICT(id) DO NOTHING':''}; RESET ROLE;`);
    }
    const sale = (storeId, creator) => ({header:{hall_id:storeId,source_warehouse_id:warehouses[0],source_employee_id:'t10-sales-a',source_payload:{v2_creator:{id:'t10-sales-a'}}},lines:[],creator});
    const transfer = (from,to) => ({header:{source_from_warehouse_id:from,source_to_warehouse_id:to},lines:[],creator:'t10-sales-a'});
    const records = [[docs.own,'SALE',sale(hall,'t10-sales-a')],[docs.colleague,'SALE',sale(hall,'t10-sales-b')],[docs.cross,'SALE',sale(otherHall,'t10-sales-c')],[docs.unknownHall,'SALE',sale(null,'t10-sales-a')],
      [docs.transfer,'TRANSFER',transfer(warehouses[0],warehouses[1])],[docs.stoppedOut,'TRANSFER',transfer(warehouses[2],warehouses[1])],[docs.stoppedIn,'TRANSFER',transfer(warehouses[0],warehouses[2])],
      [docs.negativeOut,'TRANSFER',transfer(warehouses[3],warehouses[1])],[docs.unknownWarehouse,'TRANSFER',transfer(warehouses[0],uid(999))],[docs.unknownCreator,'SALE',sale(hall,null)]];
    adminSql(config, `SET ROLE ${ident(config.roles.runtime)};
      ${records.map(([id,type,body],i) => `INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision) VALUES(${literal(id)},${literal(type)},'T10-${i}','UNAUDITED',false,false,1);
        INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id) VALUES(${literal(id)},1,${body.creator === null},${literal(JSON.stringify({header:body.header,lines:body.lines}))},${body.creator===null?'NULL':literal(body.creator)});`).join('\n')}
      INSERT INTO ${r}.inventory_delta(warehouse_id,sku_id,quantity) VALUES(${literal(warehouses[2])},${literal(sku)},5),(${literal(warehouses[2])},${literal(otherSku)},-5),(${literal(warehouses[3])},${literal(sku)},-4);
      INSERT INTO ${r}.product_image(id,product_id,path,sha256,media_type,role,name,sort_order) VALUES(${literal(image)},${literal(product)},'synthetic/not-a-real-file.webp',repeat('0',64),'image/webp','CURRENT','Synthetic image',0); RESET ROLE;`);
    const app = createApp(appConfig); apps.push(app);
    let invoked = 0;
    registerBusinessRoute(app, {method:'POST',url:'/api/t10/probe',resolve(request){const {operationId,selection}=request.body;return {id:operation(operationId),selection,locks:[{scope:'inventory',key:warehouses[0]+':'+sku}]};},
      async handler(context,request){invoked++;const id=operation(request.body.operationId);if(operations[id].mode==='command') await context.session.query(`INSERT INTO ${context.repo.runtime}.edit_lease(document_key,token,expires_at) VALUES($1,$2,now())`,[request.body.marker,context.actor.id]);
        return {actorId:context.actor.id,role:context.actor.role,version:context.actor.version,documents:context.documents.map(x=>({id:x.id,creatorId:x.creatorId,originalAuditor:x.originalAuditor,originalAuditedAt:x.originalAuditedAt}))};}});
    registerBusinessRoute(app, {method:'GET',url:'/api/t10/sales-list',resolve(request){return {id:'sales.list',selection:{kind:'document-list',type:'SALE',...(request.query.storeId?{storeId:request.query.storeId}:{})}};},
      async handler(context){const {session,repo,listScope,actor}=context;
        const rows=(await session.query(`SELECT d.id FROM ${repo.runtime}.document d JOIN ${repo.runtime}.revision r ON r.document_id=d.id AND r.revision=d.current_revision
          WHERE d.document_type='SALE' AND ($1::text IS NULL OR r.body->'header'->>'hall_id'=$1) ORDER BY d.id`,[listScope.storeId])).rows;
        const ids=[];for(const row of rows){const scope=await repo.document(row.id);await authorizeDocument(actor,scope,'sales.detail',repo);ids.push(row.id);}return ids;}});
    registerBusinessRoute(app, {method:'POST',url:'/api/t10/invalid-lock',resolve(){return {id:'products.save',selection:{kind:'product',id:product},locks:[{scope:'inventory',key:''}]};},
      handler:async()=>assert.fail('Invalid complete lock plan must never reach business work')});
    const item={env,config,app,invoked:()=>invoked}; targets.push(item); return item;
  }
  const qa = make('qa'), stage = make('stage');
  result.targets = targets.map(t => ({environment:t.config.environment,database:t.config.database,instanceId:t.config.instanceId,schemas:t.config.schemas,origin:t.env.SESSION_ORIGIN}));
  writeJson(join(out,'verification-targets.json'), {suite,socket,cluster,targets:result.targets,syntheticOnly:true,TCP:false});
  const start = allFingerprints(); writeJson(join(out,'fingerprints-before.json'), start);
  checked('Two newly created demo_8877 databases; synthetic users, halls, SKU, documents and media index only');
  assert.throws(()=>new PgDataAccess({...qa.config,environment:'production'}),/ISOLATED_DATABASE_REQUIRED/);
  assert.throws(()=>new PgDataAccess({...qa.config,database:'real_business'}),/ISOLATED_DATABASE_REQUIRED/);
  const productionKeys = new SessionKeys(readConfig(qa.env).security,{...qa.config,environment:'production'});
  assert.notEqual(productionKeys.cookieName,qa.app.identity.keys.cookieName);
  assert.notEqual(productionKeys.sessionDigest('a'.repeat(64)),qa.app.identity.keys.sessionDigest('a'.repeat(64)));
  checked('Production/non-isolated pools refused before connection; production/qa cookie and cryptographic namespaces distinct');
  const health=await qa.app.inject({url:'/api/health'}); assert.equal(health.statusCode,200); assert.equal(health.json().businessReady,false);
  const anonymous=await qa.app.inject({url:'/api/runtime/session'}); assert.deepEqual(anonymous.json().data,{employee:null,csrfToken:null});
  const oldPaths=['/api/reference/warehouses','/api/reference/employees','/api/sales','/api/runtime/documents?type=SALE','/api/runtime/document/'+docs.cross,'/api/runtime/catalog','/api/runtime/stock','/api/runtime/inventory','/api/outputs/export?documentId='+docs.cross,'/api/outputs/print?documentId='+docs.cross,'/api/media/'+image,'/api/requests/result?requestKey=guess&operationId=sales.save','/reference','/sales','/runtime/command','/assets/product-media/guessed.jpg'];
  for(const url of oldPaths) await denied('Anonymous path '+url,qa.app,{url},401,'UNAUTHENTICATED');
  checked('All legacy queries, exports, printing, media and result paths reject anonymous access',{paths:oldPaths.length});
  for(const payload of [{loginName:'unknown',password}, {loginName:'t10-sales-a',password:'wrong'},{}]) await denied('Invalid login '+(payload.loginName??'empty'),qa.app,{method:'POST',url:'/api/runtime/session',headers:{origin:qa.env.SESSION_ORIGIN},payload},payload.loginName?401:400);
  await denied('Cross-origin login',qa.app,{method:'POST',url:'/api/runtime/session',headers:{origin:'https://attacker.invalid'},payload:{loginName:'t10-admin',password}},403,'CSRF');
  async function login(item,id,passwordValue=password) {
    const response=await item.app.inject({method:'POST',url:'/api/runtime/session',headers:{origin:item.env.SESSION_ORIGIN},payload:{loginName:id,password:passwordValue}});
    assert.equal(response.statusCode,200,response.body);const data=response.json().data, cookie=response.headers['set-cookie'];
    assert.match(cookie,/^__Host-naijue_/); for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/']) assert(cookie.includes(flag));assert(!cookie.includes('Domain='));
    assert(!response.body.includes(passwordValue));assert(!/password_hash|password_salt|credential/.test(response.body));
    const raw=cookie.split(';')[0].split('=')[1];
    assert.equal(value(item.config,`SELECT count(*) FROM ${ident(item.config.schemas.auth)}.employee_session WHERE token=${literal(raw)}`),0);
    return {id,raw,cookie:cookie.split(';')[0],csrf:data.csrfToken,headers:{cookie:cookie.split(';')[0],origin:item.env.SESSION_ORIGIN,'x-csrf-token':data.csrfToken}};
  }
  const adminSession=await login(qa,'t10-admin'), sales=await login(qa,'t10-sales-a'), warehouse=await login(qa,'t10-warehouse');
  const stageSales=await login(stage,'t10-sales-a');
  checked('Login verifies retained PBKDF2 UUID/hex salts; Secure HttpOnly host cookies; only session digests stored');
  await denied('Business route forwards complete lock plan before authorization queries',qa.app,{method:'POST',url:'/api/t10/invalid-lock',headers:adminSession.headers,payload:{}},503,'CONNECTION');
  checked('Business route accepts a complete T09 lock plan; invalid plans stop before callback with unchanged database');
  const restart=createApp(readConfig(qa.env));apps.push(restart);
  const resumed=await restart.inject({url:'/api/runtime/session',headers:sales.headers});assert.equal(resumed.statusCode,200,resumed.body);assert.equal(resumed.json().data.employee.id,sales.id);assert.equal(resumed.json().data.csrfToken,sales.csrf);await restart.close();
  checked('A fresh application instance resumes persistent session without seeds or credential rewrites');
  const probe=(session,operationId,selection,marker=randomUUID())=>({method:'POST',url:'/api/t10/probe',headers:session.headers,payload:{operationId,selection,marker,actorId:'t10-admin',role:'ADMIN'}});
  const rejects=[['sales.unapprove',{kind:'document',id:docs.own}],['correction.preview',{kind:'warehouse',id:warehouses[0]}],['correction.confirm',{kind:'warehouse',id:warehouses[0]}],['products.save',{kind:'product',id:product}],['products.delete',{kind:'product',id:product}],['media.stageUpload',{kind:'product',id:product}],['productMasters.save',{kind:'global'}],['masters.save',{kind:'global'}],['imports.referenceCommit',{kind:'global'}],['employees.list',{kind:'global'}],['employees.save',{kind:'global'}]];
  const initialInvocations=qa.invoked();
  for(const [id,selection] of rejects) await denied('Salesperson forbidden '+id,qa.app,probe(sales,id,selection),403,'FORBIDDEN');
  assert.equal(qa.invoked(),initialInvocations);checked('Salesperson forbidden actions reject before callback; spoofed body actor/role cannot elevate',{actions:rejects.length});
  for(const doc of [docs.cross,docs.unknownHall]) for(const id of ['sales.detail','sales.save','sales.void']) await denied('Salesperson object scope '+id+' '+doc,qa.app,probe(sales,id,{kind:'document',id:doc}),403,'SCOPE');
  for(const doc of [docs.colleague,docs.unknownCreator]) await denied('Salesperson only own creator may approve '+doc,qa.app,probe(sales,'sales.approve',{kind:'document',id:doc}),403,'FORBIDDEN');
  const ownApprove=await qa.app.inject(probe(sales,'sales.approve',{kind:'document',id:docs.own}));assert.equal(ownApprove.statusCode,200,ownApprove.body);assert.equal(ownApprove.json().data.actorId,sales.id);
  assert.equal(ownApprove.json().data.documents[0].originalAuditor,null);assert.equal(ownApprove.json().data.documents[0].originalAuditedAt,null);
  for(const id of ['sales.save','sales.void']) assert.equal((await qa.app.inject(probe(sales,id,{kind:'document',id:docs.colleague}))).statusCode,200);
  const listing=await qa.app.inject({url:'/api/t10/sales-list',headers:sales.headers});assert.equal(listing.statusCode,200);assert(listing.json().data.includes(docs.colleague));assert(!listing.json().data.includes(docs.cross));assert(!listing.json().data.includes(docs.unknownHall));
  await denied('Cross-hall list filter cannot expand scope',qa.app,{url:'/api/t10/sales-list?storeId='+otherHall,headers:sales.headers},403,'SCOPE');
  checked('Salesperson reads/modifies colleague drafts in own hall; approval requires actual first actor; unknown history remains unknown');
  for(const id of ['transfers.save','transfers.approve','transfers.unapprove','transfers.void']) {
    const response=await qa.app.inject(probe(sales,id,{kind:'document',id:docs.transfer}));assert.equal(response.statusCode,200,response.body);
  }
  for(const doc of [docs.stoppedOut,docs.negativeOut]) assert.equal((await qa.app.inject(probe(sales,'transfers.approve',{kind:'document',id:doc}))).statusCode,200);
  await denied('Stopped transfer destination',qa.app,probe(sales,'transfers.approve',{kind:'document',id:docs.stoppedIn}),403,'SCOPE');
  await denied('Unknown transfer warehouse',qa.app,probe(sales,'transfers.approve',{kind:'document',id:docs.unknownWarehouse}),403,'SCOPE');
  const emptyFrom={header:{source_from_warehouse_id:warehouses[4],source_to_warehouse_id:warehouses[1]},lines:[]};
  await denied('Stopped warehouse without stock cannot transfer out',qa.app,probe(sales,'transfers.create',{kind:'new-document',type:'TRANSFER',body:emptyFrom}),403,'SCOPE');
  assert.equal((await qa.app.inject(probe(sales,'transfers.unapprove',{kind:'document',id:docs.stoppedIn}))).statusCode,200);
  assert.equal((await qa.app.inject(probe(sales,'inventory.balance',{kind:'global'}))).statusCode,200);
  checked('Salesperson retains cross-hall transfer including unapprove; both warehouses checked; positive/negative cells not hidden by net-zero totals');
  for(const session of [adminSession,warehouse]) for(const [id,selection] of [['sales.unapprove',{kind:'document',id:docs.own}],['correction.confirm',{kind:'warehouse',id:warehouses[0]}],['products.save',{kind:'product',id:product}]]) assert.equal((await qa.app.inject(probe(session,id,selection))).statusCode,200);
  await denied('Warehouse account management forbidden',qa.app,probe(warehouse,'employees.save',{kind:'global'}),403,'FORBIDDEN');
  await denied('Warehouse account import forbidden',qa.app,probe(warehouse,'imports.referenceCommit',{kind:'reference-import',kinds:['employees']}),403,'FORBIDDEN');
  checked('Administrator and warehouse action grants match T05; warehouse staff cannot manage accounts');
  for(const id of ['outputs.export','outputs.print']) await denied('Cross-hall output '+id,qa.app,probe(sales,id,{kind:'documents',ids:[docs.own,docs.cross]}),403,'SCOPE');
  await denied('Full unscoped sales export forbidden',qa.app,probe(sales,'outputs.export',{kind:'global'}),400,'VALIDATION');
  await denied('Inventory source link rechecks sales scope',qa.app,probe(sales,'inventory.sourceTrace',{kind:'document',id:docs.cross}),403,'SCOPE');
  assert.equal((await qa.app.inject(probe(sales,'media.read',{kind:'media',id:image}))).statusCode,200);
  await denied('Guessed media index cannot disclose path',qa.app,probe(sales,'media.read',{kind:'media',id:uid(999)}),403,'SCOPE');
  checked('Exports/printing check every object; media resolves persisted product binding; source links reapply document scope');
  const altered={header:{hall_id:otherHall,source_warehouse_id:warehouses[0]},lines:[]};
  await denied('Saving own document cannot change it into another hall',qa.app,probe(sales,'sales.save',{kind:'document-change',id:docs.own,body:altered}),403,'SCOPE');
  const extraSide={header:{hall_id:hall,source_warehouse_id:warehouses[0]},lines:[{warehouse_id:uid(999)}]};
  await denied('Return/exchange line-side warehouse checked',qa.app,probe(sales,'sales.create',{kind:'new-document',type:'SALE',body:extraSide}),403,'SCOPE');
  await denied('Missing document scope cannot become global',qa.app,probe(sales,'sales.save',{kind:'global'}),400,'VALIDATION');
  await denied('Unknown operation cannot become authenticated-only',qa.app,probe(sales,'migration.activateOpening',{kind:'global'}),400,'VALIDATION');
  checked('Original and proposed scope checked together; alternate line warehouses and unknown policies cannot bypass guards');
  for(const headers of [{cookie:sales.cookie,origin:qa.env.SESSION_ORIGIN},{...sales.headers,'x-csrf-token':'a'.repeat(64)},{...sales.headers,origin:'https://attacker.invalid'},{...sales.headers,'sec-fetch-site':'cross-site'}]) await denied('CSRF/origin mismatch '+denials.length,qa.app,{...probe(sales,'transfers.save',{kind:'document',id:docs.transfer}),headers},403,'CSRF');
  const noOrigin={...sales.headers};delete noOrigin.origin;await denied('Missing Origin on mutation',qa.app,{...probe(sales,'transfers.save',{kind:'document',id:docs.transfer}),headers:noOrigin},403,'CSRF');
  await denied('Form-style mutation cannot bypass JSON/CSRF',qa.app,{method:'POST',url:'/api/runtime/logout',headers:{...sales.headers,'content-type':'application/x-www-form-urlencoded'},payload:'x=1'},403,'CSRF');
  await denied('Unsafe GET route cannot execute command',qa.app,{method:'GET',url:'/api/runtime/command',headers:sales.headers},404,'NOT_FOUND');
  checked('SameSite plus explicit same-origin JSON and session-bound CSRF; denied before body work');
  await denied('Qa cookie not recognized by stage',stage.app,{url:'/api/reference/warehouses',headers:{cookie:sales.cookie}},401,'UNAUTHENTICATED');
  const renamed=stage.app.identity.keys.cookieName+'='+sales.raw;
  await denied('Renamed qa token not accepted by stage',stage.app,{url:'/api/reference/warehouses',headers:{cookie:renamed}},401,'UNAUTHENTICATED');
  const copied=value(qa.config,`SELECT row_to_json(s) FROM ${ident(qa.config.schemas.auth)}.employee_session s WHERE token=${literal(qa.app.identity.keys.sessionDigest(sales.raw))}`);
  adminSql(stage.config,`INSERT INTO ${ident(stage.config.schemas.auth)}.employee_session(token,employee_id,employee_version,expires_at) VALUES(${literal(copied.token)},${literal(copied.employee_id)},${copied.employee_version},${copied.expires_at})`);
  await denied('Copied session row still cannot cross environment with same secret',stage.app,{url:'/api/reference/warehouses',headers:{cookie:renamed}},401,'UNAUTHENTICATED');
  await denied('Foreign CSRF cannot authorize a valid own-stage token',stage.app,{method:'POST',url:'/api/runtime/logout',headers:{...stageSales.headers,'x-csrf-token':sales.csrf},payload:{}},403,'CSRF');
  checked('Cookies, token HMAC, CSRF, origin and database instance prevent cross-environment use even with copied rows/shared synthetic key');
  const requestKey='t10-original-request';
  adminSql(qa.config,`SET ROLE ${ident(qa.config.roles.runtime)};INSERT INTO ${ident(qa.config.schemas.runtime)}.idempotency_request(actor_id,command_scope,idempotency_key,payload_hash,response,completed_at,document_id,operation,committed_state)
    VALUES('t10-sales-a','sales.save',${literal(requestKey)},repeat('0',64),'{"document":"synthetic"}',now(),${literal(docs.own)},'sales.save','COMMITTED');RESET ROLE;`);
  const resultURL='/api/requests/result?requestKey='+requestKey+'&operationId=sales.save';
  const ownResult=await qa.app.inject({url:resultURL,headers:sales.headers});assert.equal(ownResult.statusCode,200);assert.equal(ownResult.json().data.resolution,'COMMITTED');
  const otherResult=await qa.app.inject({url:resultURL,headers:warehouse.headers});assert.equal(otherResult.json().data.resolution,'NOT_FOUND');assert(!otherResult.body.includes('synthetic'));
  adminSql(qa.config,`SET ROLE ${ident(qa.config.roles.runtime)};INSERT INTO ${ident(qa.config.schemas.runtime)}.idempotency_request(actor_id,command_scope,idempotency_key,payload_hash,document_id,operation)
    VALUES('t10-sales-a','sales.save','t10-pending',repeat('0',64),${literal(docs.own)},'sales.save');RESET ROLE;`);
  assert.equal((await qa.app.inject({url:'/api/requests/result?requestKey=t10-pending&operationId=sales.save',headers:sales.headers})).json().data.resolution,'PENDING_VERIFICATION');
  assert.equal((await qa.app.inject({url:resultURL.replace('sales.save','sales.approve'),headers:sales.headers})).json().data.resolution,'NOT_FOUND');
  checked('Original request result bound to environment, actual actor, operation and current document scope; unknown result never called rollback');
  // Actual browser transport code talks to the real Fastify app via injected same-origin fetch.
  const clientContext={crypto:webcrypto,AbortController,URLSearchParams,setTimeout,clearTimeout,navigator:{onLine:true}};vm.createContext(clientContext);vm.runInContext(readFileSync(resolve(root,'frontend/service-client.js'),'utf8'),clientContext);
  let clientActor='',clientCookie='',observedCsrf=false;
  const client=clientContext.ERP_API.createClient({storage:null,actor:()=>clientActor,fetcher:async(url,options)=>{
    const response=await qa.app.inject({method:options.method??'GET',url,headers:{...options.headers,origin:qa.env.SESSION_ORIGIN,...(clientCookie?{cookie:clientCookie}:{})},...(options.body?{payload:options.body}:{})});
    if(response.headers['set-cookie']) clientCookie=response.headers['set-cookie'].split(';')[0];
    if(options.headers?.['X-CSRF-Token']) observedCsrf=true;
    return {ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode,json:async()=>response.json()};}});
  const sessionData=await client.request('/runtime/session',{loginName:'t10-sales-b',password},{expire:false});clientActor=sessionData.employee.id;
  const probeData=await client.request('/t10/probe',{operationId:'transfers.save',selection:{kind:'document',id:docs.transfer},marker:randomUUID()});assert.equal(probeData.actorId,clientActor);assert(observedCsrf);
  await client.request('/runtime/logout',{});await assert.rejects(client.request('/reference/warehouses'),e=>e.code==='AUTH');
  checked('Unmodified T11 login flow obtains CSRF; actual shared client sends token; logout removes server session');
  // Existing historical accounts must satisfy the SAME effective-login predicate as new logins.
  adminSql(qa.config,`INSERT INTO ${ident(qa.config.schemas.auth)}.employee_login(id,login_name,body,password_salt,password_hash)
    SELECT 't10-disabled-admin','t10-disabled-admin',body || '{"name":"Synthetic disabled admin","enabled":false}'::jsonb,password_salt,password_hash FROM ${ident(qa.config.schemas.auth)}.employee_login WHERE id='t10-admin';
    INSERT INTO ${ident(qa.config.schemas.auth)}.employee_login(id,login_name,body,password_salt,password_hash)
    SELECT 't10-invalid-admin','t10-invalid-admin',body || '{"name":"Synthetic unsupported credential"}'::jsonb,password_salt,'UNSUPPORTED' FROM ${ident(qa.config.schemas.auth)}.employee_login WHERE id='t10-admin';`);
  const accounts=await qa.app.inject({url:'/api/runtime/employees',headers:adminSession.headers});assert.equal(accounts.statusCode,200);assert(!/"(?:password_salt|password_hash|credential)"\s*:/.test(accounts.body));
  await denied('Last administrator protection',qa.app,{method:'POST',url:'/api/runtime/employees',headers:adminSession.headers,payload:{record:{id:'t10-admin',loginEnabled:false},expectedVersion:1}},409,'LAST_ADMIN');
  await denied('Last administrator role cannot be removed using historical inactive administrators',qa.app,{method:'POST',url:'/api/runtime/employees',headers:adminSession.headers,payload:{record:{id:'t10-admin',role:'仓库人员'},expectedVersion:1}},409,'LAST_ADMIN');
  checked('Last effective administrator remains protected with legacy disabled and unsupported-credential administrator rows');
  const legacyBefore=value(qa.config,`SELECT jsonb_build_object('salt',password_salt,'hash',password_hash) FROM ${ident(qa.config.schemas.auth)}.employee_login WHERE id='t10-sales-a'`);
  const save=async(record,version,passwordValue)=>{const response=await qa.app.inject({method:'POST',url:'/api/runtime/employees',headers:adminSession.headers,payload:{record,expectedVersion:version,...(passwordValue?{password:passwordValue}:{}),actorId:'forged'}});assert.equal(response.statusCode,200,response.body);return response.json().data;};
  const inactiveAdmin=await save({id:'t10-disabled-admin',phone:'synthetic'},1);assert.equal(inactiveAdmin.loginEnabled,false);assert.equal(inactiveAdmin.loginName,'t10-disabled-admin');
  await denied('Editing legacy inactive account does not silently reopen login',qa.app,{method:'POST',url:'/api/runtime/session',headers:{origin:qa.env.SESSION_ORIGIN},payload:{loginName:'t10-disabled-admin',password}},401,'INVALID_CREDENTIALS');
  adminSql(qa.config,`INSERT INTO ${ident(qa.config.schemas.auth)}.employee_login(id,login_name,body) VALUES('t10-unknown-profile','t10-unknown-profile',${literal(JSON.stringify({name:'Synthetic unknown historic hall',role:'营业员',employmentStatus:'在职',loginEnabled:false,storeId:uid(999)}))})`);
  const unknownProfile=await save({id:'t10-unknown-profile',phone:'synthetic'},1);assert.equal(unknownProfile.storeId,uid(999));assert.equal(unknownProfile.loginEnabled,false);
  await denied('Unknown historic hall cannot authorize login',qa.app,{method:'POST',url:'/api/runtime/employees',headers:adminSession.headers,payload:{record:{id:'t10-unknown-profile',loginEnabled:true},expectedVersion:unknownProfile.authVersion,password}},400,'VALIDATION');
  checked('Unknown historic hall identity is preserved for inactive profiles; ordinary edits never silently restore disabled login');
  const departed=await save({id:'t10-sales-a',employmentStatus:'离职'},1);assert.equal(departed.loginEnabled,false);
  await denied('Departure revokes old session immediately',qa.app,{url:'/api/reference/warehouses',headers:sales.headers},401,'UNAUTHENTICATED');
  const restored=await save({id:'t10-sales-a',employmentStatus:'在职',loginEnabled:true},departed.authVersion);assert.equal(restored.loginEnabled,false);
  await denied('Restored employment does not silently restore login',qa.app,{method:'POST',url:'/api/runtime/session',headers:{origin:qa.env.SESSION_ORIGIN},payload:{loginName:'t10-sales-a',password}},401,'INVALID_CREDENTIALS');
  const reenabled=await save({id:'t10-sales-a',loginEnabled:true},restored.authVersion);const newSales=await login(qa,'t10-sales-a');
  const legacyAfter=value(qa.config,`SELECT jsonb_build_object('salt',password_salt,'hash',password_hash) FROM ${ident(qa.config.schemas.auth)}.employee_login WHERE id='t10-sales-a'`);assert.deepEqual(legacyAfter,legacyBefore);
  const moved=await save({id:'t10-sales-a',storeId:otherHall},reenabled.authVersion);
  await denied('Store reassignment revokes prior session',qa.app,{url:resultURL,headers:newSales.headers},401,'UNAUTHENTICATED');
  const movedSession=await login(qa,'t10-sales-a');
  await denied('Prior own result cannot disclose lost-hall document',qa.app,{url:resultURL,headers:movedSession.headers},403,'SCOPE');
  const disabled=await save({id:'t10-sales-a',loginEnabled:false},moved.authVersion);
  await denied('Login disabled revokes every existing session',qa.app,{url:'/api/runtime/session',headers:movedSession.headers},401,'UNAUTHENTICATED');
  const audit=value(qa.config,`SELECT jsonb_agg(jsonb_build_object('actor',actor_id,'changes',changes)) FROM ${ident(qa.config.schemas.auth)}.employee_account_audit`);
  assert(audit.every(row=>row.actor==='t10-admin'));assert(!JSON.stringify(audit).includes(password));
  assert.equal(value(qa.config,`SELECT count(*) FROM ${ident(qa.config.schemas.auth)}.employee_login WHERE id='t10-sales-a'`),1);
  assert.equal(value(qa.config,`SELECT count(*) FROM ${ident(qa.config.schemas.runtime)}.operator WHERE id='t10-sales-a'`),1);
  checked('Departure/login/store changes revoke all sessions; restoration needs explicit login re-enable; legacy credential and historical identities preserved',{lastVersion:disabled.authVersion});
  const newPassword=randomUUID()+'-reset';const oldWarehouse=warehouse;
  const reset=await save({id:'t10-warehouse'},1,newPassword);assert(reset.hasPassword);
  await denied('Password reset revokes warehouse session',qa.app,{url:'/api/reference/warehouses',headers:oldWarehouse.headers},401,'UNAUTHENTICATED');
  await denied('Old password no longer works after reset',qa.app,{method:'POST',url:'/api/runtime/session',headers:{origin:qa.env.SESSION_ORIGIN},payload:{loginName:'t10-warehouse',password}},401,'INVALID_CREDENTIALS');
  const modern=value(qa.config,`SELECT jsonb_build_object('format',split_part(password_hash,':',1),'iterations',split_part(password_hash,':',2)) FROM ${ident(qa.config.schemas.auth)}.employee_login WHERE id='t10-warehouse'`);assert.deepEqual(modern,{format:'pbkdf2-sha256',iterations:'600000'});
  const resetSession=await login(qa,'t10-warehouse',newPassword);
  await save({id:'t10-warehouse',role:'营业员',storeId:hall},reset.authVersion);
  await denied('Role change revokes previously effective warehouse session',qa.app,{url:'/api/reference/warehouses',headers:resetSession.headers},401,'UNAUTHENTICATED');
  checked('New/reset passwords use asynchronous PBKDF2 600000; prior password, reset and role-change sessions invalidated');
  let entered,release;const entry=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const inFlight=qa.app.identity.execute(adminSession.raw,'products.save',{kind:'product',id:product},async({session,repo,actor})=>{entered();await gate;await session.query(`INSERT INTO ${repo.runtime}.edit_lease VALUES($1,$2,now())`,['T10-INFLIGHT',actor.id]);});await entry;
  let revoked=false;const revocation=qa.app.identity.saveEmployee(adminSession.raw,{record:{id:'t10-admin',phone:'synthetic'},expectedVersion:1}).then(()=>{revoked=true;});
  await new Promise(r=>setTimeout(r,60));assert.equal(revoked,false);release();await inFlight;await revocation;
  await denied('Revocation serializes after admitted write then blocks stale token',qa.app,{url:'/api/reference/warehouses',headers:adminSession.headers},401,'UNAUTHENTICATED');
  checked('In-flight trusted action serializes with account edit; no action admitted after revocation commits');
  const finalAdmin=await login(qa,'t10-admin');
  const beforeRollback=allFingerprints();await assert.rejects(qa.app.identity.execute(finalAdmin.raw,'products.save',{kind:'product',id:product},async({session,repo})=>{
    await session.query(`INSERT INTO ${repo.runtime}.edit_lease VALUES($1,$2,now())`,['T10-ROLLBACK','synthetic']);throw new Error('synthetic failure after insert');}));assert.deepEqual(allFingerprints(),beforeRollback);
  const fresh=await login(qa,'t10-sales-c');
  adminSql(qa.config,`DELETE FROM ${ident(qa.config.schemas.auth)}.employee_session WHERE token=${literal(qa.app.identity.keys.sessionDigest(fresh.raw))}`);
  await denied('Deleted/logout session unusable',qa.app,{url:'/api/reference/warehouses',headers:fresh.headers},401,'UNAUTHENTICATED');
  const expired=await login(stage,'t10-sales-c');
  adminSql(stage.config,`UPDATE ${ident(stage.config.schemas.auth)}.employee_session SET expires_at=1 WHERE token=${literal(stage.app.identity.keys.sessionDigest(expired.raw))}`);
  await denied('Expired session rejects without cleanup writes',stage.app,{url:'/api/reference/warehouses',headers:expired.headers},401,'UNAUTHENTICATED');
  checked('Mid-action exception rolls back inserted data; logout and expiration refuse later operations without business writes');
  const after=allFingerprints();writeJson(join(out,'fingerprints-after.json'),after);
  for(const t of targets) for(const schema of [t.config.schemas.source,t.config.schemas.control]) assert.deepEqual(after[t.config.environment].filter(x=>x.schema===schema),start[t.config.environment].filter(x=>x.schema===schema));
  for(const t of targets) for(const name of ['document','revision','posting','movement','inventory_delta']) assert.deepEqual(after[t.config.environment].filter(x=>x.table===name),start[t.config.environment].filter(x=>x.table===name));
  checked('Source/control and all document/revision/posting/movement/inventory rows unchanged; granted probes only write synthetic lease metadata');
  result.status='PASS';result.denialCount=denials.length;result.deniedFingerprintsAllUnchanged=denials.every(d=>d.fingerprintBefore===d.fingerprintAfter);result.businessReady=false;
} catch(error) {
  result.status='FAIL';result.failure={name:error.name,message:error.message,frames:error.stack?.split('\n').filter(line=>/^\s+at /.test(line))};process.exitCode=1;console.error(error.name+': '+error.message);
} finally {
  for(const app of apps) try{await app.close();}catch{result.status='FAIL';process.exitCode=1;result.closeFailure=true;}
  if(started) try{tool('pg_ctl',['-D',dataDirectory,'-m','fast','-w','stop'],'stop.log');result.clusterStopped=true;}catch{result.status='FAIL';process.exitCode=1;result.clusterStopped=false;}
  if(result.status==='PASS' && !result.clusterStopped) {result.status='FAIL';process.exitCode=1;}
  result.completedAt=new Date().toISOString();writeJson(join(out,'database-verification.json'),result);writeJson(join(suite,'RESULT.json'),result);
}
