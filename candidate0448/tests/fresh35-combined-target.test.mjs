import {createFresh35BootstrapNetworkModel as bootstrapNetworkModel,prepareFresh35CatalogProgramModel} from './fixtures/fresh35-bootstrap-network-model.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {bindFresh35CombinedTarget,describeFresh35CombinedTarget,fresh35CombinedTargetGuard,fresh35CombinedRuntimeTargetGuard} from '../scripts/release/unified-install/fresh35-combined-target-v1.mjs';
import {validateFresh35CombinedJournalPath} from '../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs';
const startsAt=Date.parse('2026-11-05T03:00:00Z');
const input=()=>({proposal:{database:'synthetic_fresh35_20261105_r9',owner:'fresh35_owner_20261105_r9',controller:'fresh35_controller_20261105_r9',runtime:'fresh35_runtime_20261105_r9',admin:'fresh35_admin_20261105_r9',host:'127.0.0.1',port:57639,workspaceDirectory:'/tmp/cloud-pg-fresh35-20261105-r9'},physical:{systemIdentifier:'7703999999999999999',databaseOid:'16384',serverVersionNum:'170011',postmasterStart:'2026-11-05 03:00:00.123456+00'},startsAt,expiresAt:startsAt+1200000});
test('new35 target is an immutable binding, not a database or authority',()=>{
 const arg=input(),target=bindFresh35CombinedTarget(arg,startsAt+1),d=describeFresh35CombinedTarget(target);arg.proposal.port=5432;
 assert.equal(d.proposal.port,57639);assert.equal(d.authority,'BINDING_ONLY_NOT_CREATION_OR_EXECUTION_PERMISSION');assert.ok(Object.isFrozen(d.physical));
 assert.throws(()=>describeFresh35CombinedTarget({...target}),/GENUINE_TARGET/);
});

test('observer SQL permits only the exact native no-database cohort and rejects real client/walsender/worker/unknown rows (SQLite SQL truth semantics, not PG)',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {fresh35CombinedBootstrapObserverSql}=await import('../scripts/release/unified-install/fresh35-combined-target-v1.mjs');
 const target=bindFresh35CombinedTarget(production(),startsAt+1),sql=fresh35CombinedBootstrapObserverSql(target);
 const body=sql.split('AS $fresh35_observer$')[1].split('$fresh35_observer$;')[0];
 const predicate=body.match(/RETURN (NOT EXISTS[\s\S]*?);/)[1].replaceAll('pg_catalog.','');
 const db=new DatabaseSync(':memory:');
 try{
  db.function('pg_backend_pid',()=>99);
  db.exec('CREATE TABLE pg_stat_activity(pid INTEGER,backend_type TEXT,datid INTEGER,usesysid INTEGER,usename TEXT)');
  const put=db.prepare('INSERT INTO pg_stat_activity VALUES(?,?,?,?,?)'),query=db.prepare('SELECT '+predicate+' AS exclusive');
  const self=[99,'client backend',16384,16385,'owner'];
  const allowed=[[1,'checkpointer',null,null,null],[2,'background writer',null,null,null],[3,'walwriter',null,null,null],[4,'autovacuum launcher',null,null,null],[5,'logical replication launcher',null,10,'bootstrap']];
  const reset=()=>{db.exec('DELETE FROM pg_stat_activity');put.run(...self);for(const row of allowed)put.run(...row)};
  reset();assert.equal(query.get().exclusive,1);
  const original=db.prepare("SELECT NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE (backend_type='client backend' OR usename IS NOT NULL) AND pid<>pg_backend_pid()) AS exclusive");
  assert.equal(original.get().exclusive,0,'actual original predicate rejects the normal launcher counterexample');
  const denied=[
   ['client backend',16384,16385,'owner'],['client backend',42,16386,'controller'],['client backend',null,10,'bootstrap'],
   ['walsender',null,10,'bootstrap'],['walsender',16384,16386,'controller'],
   ['logical replication worker',16384,10,'bootstrap'],['parallel worker',16384,10,'bootstrap'],['autovacuum worker',16384,null,null],
   ['unknown worker',null,null,null],[null,null,null,null],[null,null,10,'bootstrap'],
   ['logical replication launcher',16384,10,'bootstrap'],['logical replication launcher',null,16385,'owner'],['logical replication launcher',null,null,null],
   ['checkpointer',16384,null,null],['checkpointer',null,10,'bootstrap']
  ];
  for(const row of denied){reset();put.run(100,...row);assert.equal(query.get().exclusive,0,JSON.stringify(row))}
  reset();put.run(null,'logical replication launcher',null,10,'bootstrap');assert.equal(query.get().exclusive,0,'missing PID must not become an allowed native row');
  reset();put.run(101,'client backend',16384,16385,'owner');db.exec("UPDATE pg_stat_activity SET backend_type=NULL WHERE pid=101");assert.equal(query.get().exclusive,0,'masked client classification refuses rather than silently allowing');
 }finally{db.close()}
});

test('observer bootstrap is atomic, zero-argument and physical/session-bound with no public/runtime/interface or broad grant',async()=>{
 const api=await import('../scripts/release/unified-install/fresh35-combined-target-v1.mjs');
 for(const arg of [input(),production()]){
  const target=bindFresh35CombinedTarget(arg,startsAt+1),sql=api.fresh35CombinedBootstrapObserverSql(target),body=sql.split('AS $fresh35_observer$')[1].split('$fresh35_observer$;')[0],p=arg.proposal;
  assert(sql.startsWith('BEGIN;'));assert(sql.endsWith('COMMIT;\n'));
  assert.match(sql,/CREATE FUNCTION pg_catalog\.fresh35_exclusive_backends\(\) RETURNS pg_catalog\.bool/);
  assert.match(sql,/LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE SECURITY DEFINER\s+SET search_path = pg_catalog, pg_temp/);
  assert.match(sql,/REVOKE ALL ON FUNCTION pg_catalog\.fresh35_exclusive_backends\(\) FROM PUBLIC;/);
  assert.equal(sql.match(/^GRANT .*$/gm).join('\n'),`GRANT EXECUTE ON FUNCTION pg_catalog.fresh35_exclusive_backends() TO ${p.owner},${p.controller};`);
  for(const value of [p.database,p.admin,p.owner,p.controller,arg.physical.systemIdentifier,arg.physical.databaseOid,arg.physical.postmasterStart.replace(/\+00$/,''),String(arg.startsAt),String(arg.expiresAt)])assert(body.includes(value),value);
  assert.match(body,/pg_stat_clear_snapshot\(\)/);assert.match(body,/session_user IN\(/);assert.match(body,/current_setting\('role'\) IN\('none',session_user::text\)/);
  assert.doesNotMatch(sql,/CREATE OR REPLACE|pg_read_all_stats|pg_monitor|CREATE (?:TABLE|ROLE)|EXECUTE format|RETURN QUERY|RETURNS TABLE/);
  assert.doesNotMatch(body,/usename|query|client_addr/);
  assert.throws(()=>api.fresh35CombinedBootstrapObserverSql({...target}),/GENUINE_TARGET/);
  const guard=api.fresh35CombinedObserverGuard(target);
  for(const text of ['f.proowner=10','f.pronargs=0','f.prosecdef','f.provolatile=\'v\'','f.proparallel=\'u\'','f.prosrc=','f.proacl','pg_extension','count(*)'])assert(guard.includes(text),text);
 }
});

test('observer raw catalog validates source, signature, owner and ACL while preserving separate complete dependency evidence',async()=>{
 const api=await import('../scripts/release/unified-install/fresh35-combined-target-v1.mjs'),target=bindFresh35CombinedTarget(production(),startsAt+1),p=production().proposal;
 const sql=api.fresh35CombinedBootstrapObserverSql(target),body=sql.split('AS $fresh35_observer$')[1].split('$fresh35_observer$;')[0];
 // OID/oidvector JSON shapes are taken from the pinned PG17.11 native capture.
 const {readFile}=await import('node:fs/promises'),captures=JSON.parse(await readFile(new URL('../../reference-inputs/cloud-pg-schema178v2-20261105-r2/evidence/functions.json',import.meta.url),'utf8'));
 const f={...captures[0].catalog,proname:'fresh35_exclusive_backends',pronamespace:'11',proowner:'10',prokind:'f',pronargs:0,pronargdefaults:0,proargtypes:[],prorettype:'16',proretset:false,prosecdef:true,proleakproof:false,proisstrict:false,provolatile:'v',proparallel:'u',procost:100,prorows:0,prosupport:'-',proallargtypes:null,proargmodes:null,proargnames:null,proargdefaults:null,protrftypes:null,probin:null,prosqlbody:null,proconfig:['search_path=pg_catalog, pg_temp'],prosrc:body,proacl:[p.admin,p.owner,p.controller].map(r=>r+'=X/'+p.admin)};
 const rows=[{catalog:f,owner:p.admin,language:'plpgsql',definition:'PINNED-SHAPE-FIXTURE-NOT-PG-EXECUTION',dependencies:[],sharedDependencies:[]}];
 assert.doesNotThrow(()=>api.validateFresh35CombinedObserverObservation(rows,target));
 for(const update of [r=>r.push(r[0]),r=>r[0].catalog.prosrc+='RETURN true;',r=>r[0].catalog.prosecdef=false,r=>r[0].catalog.pronargs=1,r=>r[0].catalog.prorettype='25',r=>r[0].catalog.proowner='16384',r=>r[0].catalog.proconfig=['search_path=public'],r=>r[0].catalog.proacl.push('=X/'+p.admin),r=>r[0].catalog.proacl.push(p.runtime+'=X/'+p.admin),r=>r[0].language='sql',r=>r[0].owner=p.owner,r=>delete r[0].dependencies,r=>delete r[0].sharedDependencies]){
  const changed=structuredClone(rows);update(changed);assert.throws(()=>api.validateFresh35CombinedObserverObservation(changed,target),/OBSERVER_RAW/);
 }
 for(const text of ['pg_depend','pg_shdepend','pg_get_functiondef','to_jsonb(f)'])assert(api.fresh35CombinedObserverObservationSql.includes(text));
 assert.doesNotMatch(api.fresh35CombinedObserverObservationSql,/pg_stat_activity/);
});
test('target rejects unknown fields, getters, nonlocal endpoints and privilege-shaped names',()=>{
 let reads=0;const x=input();Object.defineProperty(x.proposal,'port',{enumerable:true,get(){reads++;return 57639}});assert.throws(()=>bindFresh35CombinedTarget(x,startsAt),/OWN|CLOSED/);assert.equal(reads,0);
 for(const update of [x=>x.approved=true,x=>x.proposal.host='localhost',x=>x.proposal.host='::1',x=>x.proposal.port=5432,x=>x.proposal.owner='postgres',x=>x.proposal.workspaceDirectory='/real/database',x=>x.physical.databaseOid='01',x=>x.physical.systemIdentifier='18446744073709551616',x=>x.physical.systemIdentifier='7704494445995372557',x=>x.physical.serverVersionNum='170010',x=>x.physical.postmasterStart='2026-02-30 03:00:00+00',x=>x.physical.postmasterStart='2026-11-05 02:59:59+00']){const x=input();update(x);assert.throws(()=>bindFresh35CombinedTarget(x,startsAt));}
});
test('original 20 minute deadline cannot be reset, extended, or reused after expiry',()=>{
 const x=input();assert.throws(()=>bindFresh35CombinedTarget(x,x.expiresAt),/WINDOW/);assert.throws(()=>bindFresh35CombinedTarget(x,x.startsAt-1),/WINDOW/);x.expiresAt++;assert.throws(()=>bindFresh35CombinedTarget(x,startsAt),/WINDOW/);
});
test('guard binds real endpoint and birth, ordinary owner, exact roles and ACL without provisioning',async()=>{
 const m=await bootstrapNetworkModel();try{await m.write(m.value);await m.api.loadFresh35SyntheticBootstrapNetwork(m.target,m.sourceSetSha256);const target=m.target,sql=m.api.fresh35CombinedTargetGuard(target,{requireEmpty:true});
 for(const text of ['pg_control_system','pg_postmaster_start_time','inet_server_port()=57639',"host(pg_catalog.inet_server_addr())='127.0.0.1'",'rolconnlimit=2','rolconnlimit=0','admin_option','inherit_option','set_option','EMPTY_DATABASE_REQUIRED','DATABASE_ACL_DIFFERS','rolvaliduntil','pg_prepared_xacts','pg_stat_activity'])assert.ok(sql.includes(text),text);
 assert.doesNotMatch(sql,/\bCREATE\s+(?:ROLE|DATABASE|TABLE)|\bGRANT\b|\bDROP\b|pg_monitor/);
 assert.doesNotMatch(m.api.fresh35CombinedTargetGuard(target,{requireEmpty:false}),/EMPTY_DATABASE_REQUIRED/);
 assert.match(sql,/PUBLIC_SCHEMA_BOUNDARY_DIFFERS/);assert.match(sql,/pg_database_owner=UC\/pg_database_owner/);assert.match(sql,/pg_catalog.pg_type/);
 }finally{await m.close()}
});
test('journal path cannot write outside the target workspace already bound into authorization',()=>{
 const target=bindFresh35CombinedTarget(input(),startsAt);
 assert.equal(validateFresh35CombinedJournalPath(target,'/tmp/cloud-pg-fresh35-20261105-r9/installation-journal'),'/tmp/cloud-pg-fresh35-20261105-r9/installation-journal');
 for(const path of ['/etc/naijue-erp/records','/tmp/arbitrary-journal','/tmp/cloud-pg-fresh35-20261105-r9/../installation-journal'])assert.throws(()=>validateFresh35CombinedJournalPath(target,path),/AUTHORIZED_TARGET_WORKSPACE/);
});

test('controller inspection has its own read-only repeatable snapshot and keeps all physical and ACL checks',async()=>{
 const m=await bootstrapNetworkModel();try{await m.write(m.value);await m.api.loadFresh35SyntheticBootstrapNetwork(m.target,m.sourceSetSha256);const target=m.target,runtime=m.api.fresh35CombinedRuntimeTargetGuard(target),install=m.api.fresh35CombinedTargetGuard(target,{requireEmpty:false});
 assert.match(runtime,/current_user='fresh35_controller_20261106_r9'/);assert.match(runtime,/session_user='fresh35_controller_20261106_r9'/);
 assert.match(runtime,/transaction_isolation'\)='repeatable read'/);
 assert.match(runtime,/transaction_read_only'\)='on'/);
 assert.match(install,/current_user='fresh35_owner_20261106_r9'/);
 assert.match(install,/transaction_isolation'\)='read committed'/);
 assert.match(install,/transaction_read_only'\)='off'/);
 for(const check of ['PHYSICAL_TARGET_DIFFERS','PUBLIC_SCHEMA_BOUNDARY_DIFFERS','ROLE_ATTRIBUTES_DIFFER','EXACT_MEMBERSHIP_REQUIRED','DATABASE_ACL_DIFFERS','pg_control_system','pg_postmaster_start_time','pg_stat_activity'])assert.ok(runtime.includes(check),check);
 assert.doesNotMatch(runtime,/EMPTY_DATABASE_REQUIRED|\b(?:CREATE|GRANT|DROP)\s/);
 }finally{await m.close()}
});

function production(){const p=input();p.proposal={database:'approved_new_erp',owner:'approved_owner',controller:'approved_controller',runtime:'approved_runtime',admin:'approved_admin',host:'10.0.0.4',port:5432,workspaceDirectory:'/private/approved-new-install'};return {...p,purpose:'PRODUCTION_NEW_EMPTY_EXACT35',ordinary:{connectHost:'postgres',connectPort:5432,serverAddress:'172.20.0.3',serverPort:5432,runtimeLoginValidUntil:null,referenceDirectory:'/private/reviewed-references'}};}
test('production V2 target is explicit, closed and separates install window/endpoint from ordinary service facts',async()=>{
 const {bindFresh35CombinedProductionTargetV2,assertFresh35InstallationTargetCurrent,reconstructFresh35InstalledProductionTargetV2}=await import('../scripts/release/unified-install/fresh35-combined-target-v1.mjs');
 const p=production(),token=bindFresh35CombinedTarget(p,startsAt+1),d=describeFresh35CombinedTarget(token);
 assert.equal(d.format,'FRESH35_COMBINED_TARGET_BINDING_V2');assert.equal(d.ordinary.connectHost,'postgres');assert.equal(d.proposal.host,'10.0.0.4');assert.equal(d.ordinary.runtimeLoginValidUntil,null);assert(Object.isFrozen(d.ordinary));
 assert.equal(assertFresh35InstallationTargetCurrent(token,startsAt+1),d);assert.throws(()=>assertFresh35InstallationTargetCurrent(token,p.expiresAt),/CURRENT_INSTALL_TARGET_REQUIRED/);
 const sql=fresh35CombinedTargetGuard(token,{requireEmpty:true});for(const x of ["current_user='approved_owner'","host(pg_catalog.inet_server_addr())='10.0.0.4'","rolname='approved_runtime'",'EMPTY_DATABASE_REQUIRED','EXACT_MEMBERSHIP_REQUIRED','DATABASE_ACL_DIFFERS',"rolvaliduntil='infinity'"])assert(sql.includes(x),x);
 assert.doesNotMatch(sql,/\bCREATE\s+(ROLE|DATABASE)|\bGRANT\b/);
 await assert.rejects(()=>reconstructFresh35InstalledProductionTargetV2({format:'FRESH35_COMBINED_INSTALLATION_RECORD_V2',target:d}),/FIXED_PROTECTED_ENVELOPE_REQUIRED/);
 for(const mutate of [x=>delete x.purpose,x=>x.ordinary.extra=true,x=>delete x.ordinary.runtimeLoginValidUntil,x=>x.proposal.runtime=x.proposal.owner,x=>x.proposal.database='synthetic_fresh35_20261105_r9',x=>x.ordinary.connectHost="postgres';select",x=>x.ordinary.runtimeLoginValidUntil='2026-02-30T00:00:00Z',x=>x.expiresAt++,x=>x.physical.serverVersionNum='170012']){const x=production();mutate(x);assert.throws(()=>bindFresh35CombinedProductionTargetV2(x,startsAt+1));}
});

test('bootstrap network observation is required, bound to original synthetic target and replaces only restricted socket read (OS model)',async()=>{
 const m=await bootstrapNetworkModel();try{
  assert.equal(typeof m.api.loadFresh35SyntheticBootstrapNetwork,'function');assert.throws(()=>m.api.fresh35CombinedTargetGuard(m.target,{requireEmpty:true}),/BOOTSTRAP_NETWORK_REQUIRED/);
  await assert.rejects(()=>m.api.loadFresh35SyntheticBootstrapNetwork(m.target,m.sourceSetSha256));
  await m.write(m.value);const digest=await m.api.loadFresh35SyntheticBootstrapNetwork(m.target,m.sourceSetSha256);assert.match(digest,/^[a-f0-9]{64}$/);
  const sql=m.api.fresh35CombinedTargetGuard(m.target,{requireEmpty:true});assert.doesNotMatch(sql,/current_setting\('unix_socket_directories'/);assert.match(sql,/current_setting\('listen_addresses'\)='127.0.0.1'/);assert(sql.includes(digest));
  for(const x of ['pg_control_system','pg_postmaster_start_time','inet_server_port()=57639','EXACT_MEMBERSHIP_REQUIRED','DATABASE_ACL_DIFFERS','EMPTY_DATABASE_REQUIRED'])assert(sql.includes(x),x);
  assert.doesNotMatch(sql,/\b(?:GRANT|CREATE|ALTER|DROP)\s|pg_read_all_settings|pg_monitor/);
  assert.equal(m.api.describeFresh35CombinedTarget(m.target).format,'FRESH35_COMBINED_TARGET_BINDING_V1');assert.deepEqual(Object.keys(m.api.describeFresh35CombinedTarget(m.target).physical).sort(),Object.keys(m.arg.physical).sort());
  await m.api.assertFresh35SyntheticBootstrapNetworkCurrent(m.target,m.sourceSetSha256);
  const actual=await import('../scripts/release/unified-install/fresh35-combined-target-v1.mjs');assert.throws(()=>actual.fresh35CombinedTargetGuard(m.target),/GENUINE_TARGET/);
 }finally{await m.close()}
});
test('bootstrap network observation rejects every changed binding field and caller extra data (OS model)',async()=>{
 const m=await bootstrapNetworkModel();try{
  for(const [key,value]of [['format','OTHER'],['systemIdentifier','123'],['databaseOid','99'],['serverVersionNum','170010'],['postmasterStart','2026-11-06 00:00:00+00'],['host','127.0.0.2'],['port',57640],['listenAddresses','*'],['unixSocketDirectories','/tmp'],['adminActor',m.arg.proposal.owner],['startsAt',m.value.startsAt-1],['expiresAt',m.value.expiresAt+1],['sourceSetSha256','b'.repeat(64)]]){
   await m.write({...m.value,[key]:value});await assert.rejects(()=>m.api.loadFresh35SyntheticBootstrapNetwork(m.target,m.sourceSetSha256),/BOOTSTRAP_NETWORK_BINDING_DIFFERS/,key);
  }
  await m.write({...m.value,approved:true});await assert.rejects(()=>m.api.loadFresh35SyntheticBootstrapNetwork(m.target,m.sourceSetSha256),/CLOSED_TARGET_DATA/);
 }finally{await m.close()}
});
test('bootstrap network observation rejects unreadable-mode, writable, non-root, linked or replaced proof (OS model)',async()=>{
 const m=await bootstrapNetworkModel();try{
  await m.write(m.value);for(const mode of [0o400,0o644,0o666]){await m.fs.chmod(m.path,mode);await assert.rejects(()=>m.api.loadFresh35SyntheticBootstrapNetwork(m.target,m.sourceSetSha256),/PROTECTED_FILE/)}
  await m.fs.chmod(m.path,0o444);m.ioApi.owner(501);await assert.rejects(()=>m.api.loadFresh35SyntheticBootstrapNetwork(m.target,m.sourceSetSha256),/PROTECTED_FILE/);m.ioApi.owner(0);
  await m.fs.link(m.path,m.path+'.link');await assert.rejects(()=>m.api.loadFresh35SyntheticBootstrapNetwork(m.target,m.sourceSetSha256),/PROTECTED_FILE/);await m.fs.unlink(m.path+'.link');
  await m.api.loadFresh35SyntheticBootstrapNetwork(m.target,m.sourceSetSha256);await m.fs.writeFile(m.path+'.new',JSON.stringify(m.value),{mode:0o444});await m.fs.rename(m.path+'.new',m.path);await assert.rejects(()=>m.api.assertFresh35SyntheticBootstrapNetworkCurrent(m.target,m.sourceSetSha256),/FILE_CHANGED/);
  await m.fs.rename(m.path,m.path+'.real');await m.fs.symlink(m.path+'.real',m.path);await assert.rejects(()=>m.api.loadFresh35SyntheticBootstrapNetwork(m.target,m.sourceSetSha256));
 }finally{await m.close()}
});
test('bootstrap network observation leaves production branch free of proof access and enforces original synthetic window (OS model)',async()=>{
 const m=await bootstrapNetworkModel();try{
  const prod={...m.arg,purpose:'PRODUCTION_NEW_EMPTY_EXACT35',proposal:{...m.arg.proposal,database:'new_production',owner:'new_owner',controller:'new_controller',runtime:'new_runtime',admin:'new_admin'},ordinary:{connectHost:'postgres',connectPort:5432,serverAddress:'10.0.0.1',serverPort:5432,runtimeLoginValidUntil:null,referenceDirectory:'/root/reference'}};
  const target=m.api.bindFresh35CombinedTarget(prod);assert.equal(await m.api.loadFresh35SyntheticBootstrapNetwork(target,'invalid-unused'),null);assert.equal(await m.api.assertFresh35SyntheticBootstrapNetworkCurrent(target,'invalid-unused'),null);assert.doesNotMatch(m.api.fresh35CombinedTargetGuard(target),/bootstrap network|listen_addresses|unix_socket_directories/);
  const originalNow=Date.now;try{await m.write(m.value);Date.now=()=>m.value.expiresAt;await assert.rejects(()=>m.api.loadFresh35SyntheticBootstrapNetwork(m.target,m.sourceSetSha256),/WINDOW_EXPIRED/)}finally{Date.now=originalNow}
 }finally{await m.close()}
});

test('bootstrap network observation is consumed by original catalog/program functions and changing proof blocks currentness (OS/source model)',async()=>{
 const m=await bootstrapNetworkModel();try{
  const {fileURLToPath}=await import('node:url'),{loadFresh35CombinedSource,describeFresh35CombinedSource,resolveFresh35ReferenceInputPaths}=await import('../scripts/release/unified-install/fresh35-combined-source-v1.mjs');
  const root=fileURLToPath(new URL('../',import.meta.url)),paths=await resolveFresh35ReferenceInputPaths(fileURLToPath(new URL('../../reference-inputs',import.meta.url))),source=await loadFresh35CombinedSource(root,{baselineDirectory:paths.baselineDirectory});
  m.sourceSetSha256=describeFresh35CombinedSource(source).sourceSetSha256;m.value.sourceSetSha256=m.sourceSetSha256;
  const stub=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
  const rewrite=async(path,replacements)=>{const url=new URL(path,import.meta.url);let text=await m.fs.readFile(url,'utf8');text=text.replaceAll('new URL(import.meta.url)',`new URL(${JSON.stringify(url.href)})`);text=text.replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g,(_m,_q,p)=>'from '+JSON.stringify(new URL(p,url).href));text=text.replace(/import\((['"])(\.{1,2}\/[^'"]+)\1\)/g,(_m,_q,p)=>'import('+JSON.stringify(new URL(p,url).href)+')');for(const [name,replacement]of replacements)text=text.replaceAll(new URL(name,url).href,replacement);return stub(text)};
  const catalogURL=await rewrite('../scripts/release/unified-install/fresh35-combined-catalog-v1.mjs',[['./fresh35-combined-target-v1.mjs',m.moduleURL]]),catalogAPI=await import(catalogURL);
  await assert.rejects(()=>catalogAPI.buildFresh35CombinedCatalog(source,m.target,paths));
  await m.write(m.value);const catalog=await catalogAPI.buildFresh35CombinedCatalog(source,m.target,paths),descriptor=catalogAPI.describeFresh35CombinedCatalog(catalog);assert.match(descriptor.bootstrapNetworkObservationSha256,/^[a-f0-9]{64}$/);
  const lifecycleURL=await rewrite('../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs',[['./fresh35-combined-target-v1.mjs',m.moduleURL],['./fresh35-combined-catalog-v1.mjs',catalogURL]]),lifecycleAPI=await import(lifecycleURL);
  const program=await lifecycleAPI.compileFresh35CombinedProgram({source,target:m.target,catalog}),programDescriptor=lifecycleAPI.describeFresh35CombinedProgram(program);assert.equal(programDescriptor.bootstrapNetworkObservationSha256,descriptor.bootstrapNetworkObservationSha256);
  assert(programDescriptor.statements.some(s=>s.name==='physical-empty-target'));await catalogAPI.assertFresh35CombinedCatalogCurrent(catalog);
  const actual=await import('../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs');assert.throws(()=>actual.describeFresh35CombinedProgram(program),/GENUINE_PROGRAM/);
  await m.fs.writeFile(m.path+'.new',JSON.stringify(m.value)+'\n',{mode:0o444});await m.fs.rename(m.path+'.new',m.path);
  await assert.rejects(()=>catalogAPI.assertFresh35CombinedCatalogCurrent(catalog),/FILE_CHANGED/);await assert.rejects(()=>lifecycleAPI.compileFresh35CombinedProgram({source,target:m.target,catalog}),/FILE_CHANGED/);
 }finally{await m.close()}
});

test('physical predicate diagnostic preserves every original synthetic/production condition exactly once and uses only finite static tags',async()=>{
 const m=await bootstrapNetworkModel();
 const split=(text,separator)=>{const parts=[];let depth=0,quoted=false,start=0;for(let i=0;i<text.length;i++){const c=text[i];if(c==="'"){if(quoted&&text[i+1]==="'"){i++;continue}quoted=!quoted;continue}if(quoted)continue;if(c==='(')depth++;else if(c===')')depth--;if(depth===0&&text.startsWith(separator,i)){parts.push(text.slice(start,i));i+=separator.length-1;start=i+1}}parts.push(text.slice(start));return parts.map(s=>s.trim())};
 try{
  await m.write(m.value);
  for(const production of [false,true]){
   const arg=production?{...m.arg,purpose:'PRODUCTION_NEW_EMPTY_EXACT35',proposal:{...m.arg.proposal,database:'new_diag_erp',owner:'diag_owner',controller:'diag_controller',runtime:'diag_runtime',admin:'diag_admin'},ordinary:{connectHost:'postgres',connectPort:5432,serverAddress:'10.0.0.1',serverPort:5432,runtimeLoginValidUntil:null,referenceDirectory:'/root/refs'}}:m.arg;
   const after=m.api.bindFresh35CombinedTarget(arg);
   if(!production)await m.api.loadFresh35SyntheticBootstrapNetwork(after,m.sourceSetSha256);
   const {proposal:p,physical:b,startsAt,expiresAt}=arg,runtime=false,q=v=>"'"+v.replaceAll("'","''")+"'",roles=[p.admin,p.owner,p.controller,p.runtime,...Object.values(m.api.FRESH35_COMBINED_INTERFACE_ROLES)],network={value:m.value,sha256:(await import('node:crypto')).createHash('sha256').update(await m.fs.readFile(m.path)).digest('hex')};
   // Exact original composite from c596bb45, frozen independently of the new builder.
   const originalCondition=`current_database()=${q(p.database)} AND current_user=${q(runtime?p.controller:p.owner)} AND session_user=${q(runtime?p.controller:p.owner)}
 AND (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database())=${q(b.databaseOid)}
 AND (SELECT system_identifier::text FROM pg_catalog.pg_control_system())=${q(b.systemIdentifier)}
 AND pg_catalog.current_setting('server_version_num')=${q(b.serverVersionNum)}
 AND pg_catalog.pg_postmaster_start_time() AT TIME ZONE 'UTC'=TIMESTAMP ${q(b.postmasterStart.replace(/\+00$/,''))}
 AND pg_catalog.host(pg_catalog.inet_server_addr())=${q(p.host)} AND pg_catalog.inet_server_port()=${p.port}
 ${production?'':`AND pg_catalog.current_setting('listen_addresses')='127.0.0.1' AND ${q(network.value.unixSocketDirectories)}='' /* root bootstrap network ${network.sha256} */`}
 AND pg_catalog.current_setting('session_replication_role')='origin' AND NOT pg_catalog.pg_is_in_recovery()
 AND pg_catalog.current_setting('transaction_isolation')=${q(runtime?'repeatable read':'read committed')} AND pg_catalog.current_setting('transaction_read_only')=${q(runtime?'on':'off')}
 AND extract(epoch FROM pg_catalog.clock_timestamp())*1000>=${startsAt} AND extract(epoch FROM pg_catalog.clock_timestamp())*1000<${expiresAt}
 AND (SELECT pg_catalog.pg_get_userbyid(datdba) FROM pg_catalog.pg_database WHERE datname=current_database())=${q(p.owner)}
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE (backend_type='client backend' OR usename IS NOT NULL) AND pid<>pg_catalog.pg_backend_pid())
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_database WHERE datname NOT IN('postgres','template0','template1',${q(p.database)}))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname NOT IN('public','pg_catalog','information_schema','pg_toast','naijue_erp'))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE left(rolname,3)<>'pg_' AND rolname NOT IN(${roles.map(q).join(',')}))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger)
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname<>'plpgsql')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_prepared_xacts)`;
   const previous=(' IF ('+originalCondition+") IS DISTINCT FROM true THEN RAISE EXCEPTION 'FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS'").replace(/\s+/g,' '),current=m.api.fresh35CombinedTargetGuard(after,{requireEmpty:true}).replace(/\s+/g,' ');
   const originalAtoms=split(previous.slice(previous.indexOf(' IF (')+5,previous.indexOf(") IS DISTINCT FROM true THEN RAISE EXCEPTION 'FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS'")),' AND ');
   const array=current.slice(current.indexOf('physical_checks := ARRAY[')+'physical_checks := ARRAY['.length,current.indexOf(']; IF (true = ALL(physical_checks))'));
   const currentAtoms=split(array,',').map(atom=>atom.slice(1,-1));
   const exclusiveIndex=originalAtoms.findIndex(atom=>atom.includes('pg_catalog.pg_stat_activity'));
   assert.equal(currentAtoms[exclusiveIndex],'pg_catalog.fresh35_exclusive_backends()');
   assert(current.startsWith('DO $fresh35_observer_catalog$'));
   assert.deepEqual(currentAtoms.filter((_,i)=>i!==exclusiveIndex),originalAtoms.filter((_,i)=>i!==exclusiveIndex),'all physical conditions except the explicitly replaced exclusive predicate remain unchanged and once-only');
   const tags=current.slice(current.indexOf('physical_failure_codes CONSTANT text[] := ARRAY['),current.indexOf(']; physical_index integer')).match(/FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS_[A-Z_]+/g);
   assert.equal(tags.length,originalAtoms.length);assert.equal(new Set(tags).size,tags.length);for(const tag of tags){assert(m.api.FRESH35_COMBINED_PHYSICAL_FAILURE_CODES.includes(tag));assert(tag.length<=81)}
   assert.match(current,/IF \(true = ALL\(physical_checks\)\) IS DISTINCT FROM true/);assert.match(current,/IF physical_checks\[physical_index\] IS DISTINCT FROM true/);assert.match(current,/RAISE EXCEPTION '%',physical_failure_codes\[physical_index\] USING ERRCODE='55000'/);
   assert(m.api.FRESH35_COMBINED_PHYSICAL_FAILURE_CODES.includes('FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS'));
  }
 }finally{await m.close()}
});
