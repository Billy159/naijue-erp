import {createFresh35BootstrapNetworkModel,prepareFresh35CatalogProgramModel} from './fixtures/fresh35-bootstrap-network-model.mjs';
import {after} from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadFresh35CombinedSource,describeFresh35CombinedSource,renderFresh35CombinedSchema,resolveFresh35ReferenceInputPaths,combinedSha256} from '../scripts/release/unified-install/fresh35-combined-source-v1.mjs';
import {parseFresh35DumpSections} from '../scripts/release/unified-install/fresh35-retirement-schema.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const {baselineDirectory:base,modelPath,functionsPath}=await resolveFresh35ReferenceInputPaths(fileURLToPath(new URL('../../reference-inputs',import.meta.url)));
const networkModel=await createFresh35BootstrapNetworkModel({proposalDate:'20261105'});after(()=>networkModel.close());
const startsAt=networkModel.arg.startsAt,target=networkModel.target;
const {bindFresh35CombinedTarget,describeFresh35CombinedTarget}=networkModel.api;
const source=await loadFresh35CombinedSource(root,{baselineDirectory:base}),graph=await prepareFresh35CatalogProgramModel(networkModel,source,{modelPath,functionsPath});
const {buildFresh35CombinedCatalog,describeFresh35CombinedCatalog,fresh35CombinedCatalogSql,validateFresh35CombinedCatalogObservation,fresh35CombinedRuntimeCatalogSql,validateFresh35CombinedRuntimeCatalogObservation}=graph.catalogAPI;
const {compileFresh35CombinedProgram,describeFresh35CombinedProgram,validateFresh35CombinedAuthorization,runFresh35CombinedInstall}=graph.lifecycleAPI;
const bundle=async()=>({source,catalog:graph.catalog,program:graph.program});
test('direct schema materializes captured default routine ACL without changing effective privileges (offline SQL projection, not PG)',async()=>{
 const signature='naijue_erp.is_native_party_import_insert(text,jsonb)',t=describeFresh35CombinedTarget(target);
 const schema=renderFresh35CombinedSchema(source,t.proposal),sql=fresh35CombinedCatalogSql(graph.catalog,source,target),model=JSON.parse(sql.guardSql.split('$combined_model$')[1]);
 const routine=model.routines.find(row=>row.signature===signature),owner=t.proposal.owner;
 const defaults=['=X/'+owner,owner+'=X/'+owner];assert.deepEqual(routine.acl,defaults);assert.deepEqual(model.defaultAcls,[]);
 const sections=parseFresh35DumpSections(schema.schemaSql),definition=sections.filter(s=>s.type==='FUNCTION'&&s.name.startsWith('is_native_party_import_insert('));
 assert.equal(definition.length,1);assert.equal(sections.filter(s=>s.type==='ACL'&&s.name.includes('is_native_party_import_insert(')).length,0,'pg_dump omits an explicit ACL equal to its default');
 const oldRawAcl=null;assert.notDeepEqual(oldRawAcl,routine.acl,'a fresh CREATE leaves NULL and the unchanged strict raw ACL guard must reject it');
 // Evaluate the real compiler statement construction, then bind it to the
 // genuine compiled program digest. This does not simulate a native PG result.
 const lifecycle=await readFile(root+'scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs','utf8'),start=lifecycle.indexOf(' const statements=['),end=lifecycle.indexOf(' const descriptor=',start);
 assert(start>=0&&end>start);
 const statements=new Function('schema','target','t','sql','fresh35CombinedTargetGuard',lifecycle.slice(start,end)+'return statements;')(schema,target,t,sql,networkModel.api.fresh35CombinedTargetGuard);
 const direct=statements.find(s=>s.name==='direct-35-schema'),compiled=describeFresh35CombinedProgram(graph.program);
 assert.equal(combinedSha256(direct.sql),compiled.statements.find(s=>s.name===direct.name).sha256);
 assert.equal(direct.sql.slice(0,schema.schemaSql.length),schema.schemaSql,'the sealed mapped schema, function body and owner remain exact');
 const tail=direct.sql.slice(schema.schemaSql.length),grant=tail.trim().match(/^GRANT EXECUTE ON FUNCTION naijue_erp\.is_native_party_import_insert\(text,jsonb\) TO (PUBLIC);$/);
 assert(grant,'the same direct schema step must materialize the one captured default ACL');
 const projectedRawAcl=grant?[...defaults]:oldRawAcl;
 assert.deepEqual(projectedRawAcl,routine.acl,'the raw ACL now matches the captured model without normalizing the guard');
 assert.deepEqual(oldRawAcl??defaults,projectedRawAcl??defaults,'effective owner/PUBLIC EXECUTE and grant options do not change');
 assert.deepEqual(statements.map(s=>s.name),compiled.statements.map(s=>s.name));assert.equal(statements.length,10);
 assert.equal(statements.filter(s=>s.name!=='direct-35-schema').map(s=>s.sql).join('\n').match(/is_native_party_import_insert\(text,jsonb\) TO PUBLIC/g)?.length??0,0);
});
test('current source closure separately records old180 and the later application/installer changes',async()=>{
 const {source}=await bundle(),d=describeFresh35CombinedSource(source);assert.equal(d.capturedSourcePins.length,180);assert.ok(d.currentSourcePins.length>=198);assert.equal(d.capturedEvidenceAppliesToCurrentChanges,false);
 for(const path of ['unified-historical-sales-hall-evidence.ts','unified-import-source-reconciliation.ts','unified-current-effective-alignment.ts','unified-historical-line-amount-evidence.ts','historical-sales-hall-evidence.ts'])assert.ok(d.currentSourcePins.some(p=>p.path==='packages/application/src/'+path),path);
 for(const p of d.currentSourceDelta)if(p.predecessorSha256!==null)assert.notEqual(p.predecessorSha256,p.currentSha256);
 const schema=renderFresh35CombinedSchema(source,describeFresh35CombinedTarget(target).proposal);assert.match(schema.schemaSql,/fresh35_owner_20261105_r9/);assert.doesNotMatch(schema.schemaSql,/fresh35_owner_20261105_r1/);assert.equal((schema.schemaSql.match(/^CREATE TABLE /gm)||[]).length,35);assert.doesNotMatch(schema.schemaSql,/CREATE TABLE "naijue_erp"\."history_sales_header"/);assert.equal(schema.patchBodies.length,4);
});
test('full successor model changes the adopted seven routine bodies and sales hall nullability',async()=>{
 const {source,catalog}=await bundle(),d=describeFresh35CombinedCatalog(catalog),sql=fresh35CombinedCatalogSql(catalog,source,target);
 const model=JSON.parse(sql.guardSql.split('$combined_model$')[1]),before=JSON.parse(await readFile(modelPath,'utf8'));
 assert.equal(d.changes.length,14);assert.equal(new Set(d.changes.map(r=>r.signature)).size,7);assert.equal(d.changes.at(-1).patch,'historical-settlement-difference');assert.equal(d.changes.findLast(c=>c.signature.includes('.validate_sales_settlement(')).after,'580340f008dcf9652fb18e041dde2b63ae2aa72abde3c5e8a772cb13cfb0990f');assert.equal(model.routines.length,152);
 assert.equal(model.routines.filter(r=>r.definitionSha256!==before.routines.find(b=>b.signature===r.signature).definitionSha256).length,7);
 const columns=model.columns.map(c=>({...c}));for(const c of columns){const old=before.columns.find(o=>o.table===c.table&&o.name===c.name);if(c.table==='sales_header'&&c.name==='hall_id'){assert.equal(old.notNull,true);assert.equal(c.notNull,false);assert.equal(c.metadata.attnotnull,false)}else assert.deepEqual(c,old)}
 for(const key of ['constraints','indexes','triggers','policies'])assert.deepEqual(model[key],before[key],key);
 assert.deepEqual(model.columnAcls,before.columnAcls.map(row=>({...row,acl:row.relation==='schema_migration'&&['version','description'].includes(row.column)?['fresh35_controller_20261105_r9=r/fresh35_owner_20261105_r9']:row.acl?.map(acl=>acl.replace('/fresh35_owner_20261105_r1','/fresh35_owner_20261105_r9'))??null})),'only approved two-column controller read differs; all other ACLs stay exact');
 assert.ok(model.routines.every(r=>/^[a-f0-9]{64}$/.test(r.bodySha256)));assert.equal(d.independentSafetyReviewComplete,false);assert.equal(d.sqlParsedByPostgres,false);assert.equal(d.engineVerified,false);
});
test('new catalog guards every category plus raw type templates and real dependency boundaries',async()=>{
 const {source,catalog}=await bundle(),{guardSql,observationSql}=fresh35CombinedCatalogSql(catalog,source,target);
 for(const token of ['DEFAULTACLS_DIFFER','RELATIONS_DIFFER','COLUMNACLS_DIFFER','CONSTRAINTS_DIFFER','INDEXES_DIFFER','TRIGGERS_DIFFER','TABLES_DIFFER','COLUMNS_DIFFER','SEQUENCES_DIFFER','POLICIES_DIFFER','ROWTYPES_DIFFER','RAW_ROWTYPE_TEMPLATE_DIFFERS','EXTERNAL_DEPENDENCY','EXACT_LINEAGE_DIFFERS','BUSINESS_TABLE_NOT_EMPTY'])assert.ok(guardSql.includes(token),token);
 assert.match(guardSql,/to_jsonb\(t\)-ARRAY\['oid','typname','typnamespace','typowner','typrelid','typarray'\]/);assert.match(guardSql,/'pg_catalog.pg_class'::regtype/);assert.match(observationSql,/'sharedDependencies'/);assert.match(observationSql,/to_jsonb\(r\)-'rolpassword'/);
 assert.doesNotMatch(guardSql,/FRESH35_V2_GUARD_REVIEW_NOT_AUTHORIZED/);assert.match(await readFile(root+'scripts/release/unified-install/fresh35-catalog-v2-guard-review.mjs','utf8'),/RAISE EXCEPTION 'FRESH35_V2_GUARD_REVIEW_NOT_AUTHORIZED'/);
});
test('program is one atomic application transaction and contains no provisioning or legacy tables',async()=>{
 const {program}=await bundle(),d=describeFresh35CombinedProgram(program);assert.equal(d.applicationTransactions,1);assert.deepEqual(d.statements.map(s=>s.name),['physical-empty-target','direct-35-schema','migration-lineage','controller-lineage-column-read','historical-sales-hall','historical-line-amount','historical-missing-settlement-types','historical-settlement-difference','complete-successor-catalog','same-physical-target']);
 for(const flag of ['createsCluster','createsRoles','createsCredentials','oldTablesRemoved','hostEnabled'])assert.equal(d[flag],false);
});
test('valid authorization data cannot issue a trusted execution token',async()=>{
 const {program}=await bundle(),d=describeFresh35CombinedProgram(program),value={format:'FRESH35_COMBINED_EXECUTION_AUTHORIZATION_V1',decision:'AUTHORIZE_EXACT_NEW35_SYNTHETIC_INSTALL_ONLY',programSha256:d.programSha256,sourceSetSha256:d.sourceSetSha256,targetSha256:d.targetSha256,startsAt,expiresAt:networkModel.arg.expiresAt,independentSafetyReviewSha256:'a'.repeat(64),authorizationReference:'TEST DATA ONLY; NOT AN ACTUAL AUTHORIZATION'};
 const parsed=validateFresh35CombinedAuthorization(value,program);await assert.rejects(()=>runFresh35CombinedInstall({program,authorization:parsed,client:{},journalDirectory:'/tmp/never-created'}),/GENUINE_UNUSED_TRUSTED_AUTHORIZATION/);
 assert.throws(()=>validateFresh35CombinedAuthorization({...value,programSha256:'b'.repeat(64)},program),/BINDING/);
 assert.throws(()=>validateFresh35CombinedAuthorization({...value,approved:true},program),/OWN_DATA/);
});
test('cloned catalog and invented actual observations cannot open the record or host',async()=>{
 const {source,catalog}=await bundle();assert.throws(()=>fresh35CombinedCatalogSql({...catalog},source,target),/GENUINE_CATALOG/);assert.throws(()=>validateFresh35CombinedCatalogObservation('{}',catalog,source,target),/PHYSICAL_IDENTITY/);
});

test('bootstrap observer joins the catalog/record closure on install, controller and both ordinary profiles without granting runtime execution',async()=>{
 const {source,catalog}=await bundle(),physical=describeFresh35CombinedTarget(target).physical;
 const variants=[fresh35CombinedCatalogSql(catalog,source,target),fresh35CombinedRuntimeCatalogSql(catalog,source,target),graph.catalogAPI.fresh35CombinedSyntheticOrdinaryCatalogSql(catalog,source,target,physical)];
 const t=describeFresh35CombinedTarget(target),prod=networkModel.api.bindFresh35CombinedProductionTargetV2({proposal:{...t.proposal,database:'new_observer_erp',owner:'observer_owner',controller:'observer_controller',runtime:'observer_runtime',admin:'observer_admin'},physical:t.physical,startsAt:t.startsAt,expiresAt:t.expiresAt,purpose:'PRODUCTION_NEW_EMPTY_EXACT35',ordinary:{connectHost:'postgres',connectPort:5432,serverAddress:'172.20.0.4',serverPort:5432,runtimeLoginValidUntil:null,referenceDirectory:'/private/references'}});
 const prodCatalog=await buildFresh35CombinedCatalog(source,prod,{modelPath,functionsPath});
 variants.push(graph.catalogAPI.fresh35CombinedOrdinaryCatalogSql(prodCatalog,source,prod,physical));
 for(const sql of variants){
  assert(!sql.guardSql.includes('DO $fresh35_observer_catalog$'),'the strict observer IF is embedded without a third DO result');assert(sql.guardSql.includes('f.prosrc='));assert(sql.guardSql.includes('f.proacl'));
  assert(sql.observationSql.includes("'bootstrapObserver'"));assert(sql.observationSql.includes('pg_get_functiondef(f.oid)'));
  assert(sql.observationSql.includes('pg_shdepend d WHERE d.dbid='));assert(sql.observationSql.includes('pg_depend d WHERE d.classid='));
 }
 for(const ordinary of variants.slice(2))assert(!ordinary.guardSql.includes('physical_checks := ARRAY['),'ordinary interface inspects the helper but does not call it');
 const entry=await readFile(root+'scripts/release/unified-install/fresh35-combined-record-v1.mjs','utf8');
 assert(entry.includes('catalogSha256:c.catalogSha256'),'existing record binds the complete raw catalog including the observer');
});

test('runtime keeps complete metadata inspection without reading populated business tables as controller',async()=>{
 const {source,catalog}=await bundle(),runtime=fresh35CombinedRuntimeCatalogSql(catalog,source,target),install=fresh35CombinedCatalogSql(catalog,source,target);
 for(const token of ['ROUTINE_SOURCE_OR_ACL_DIFFERS','SCHEMA_ACL_DIFFERS','RELATIONS_DIFFER','COLUMNACLS_DIFFER','CONSTRAINTS_DIFFER','INDEXES_DIFFER','TRIGGERS_DIFFER','EXACT_LINEAGE_DIFFERS'])assert.ok(runtime.guardSql.includes(token),token);
 assert.match(runtime.guardSql,/current_user='fresh35_controller_20261105_r9'/);
 assert.doesNotMatch(runtime.guardSql,/BUSINESS_TABLE_NOT_EMPTY|SELECT EXISTS\(SELECT 1 FROM naijue_erp\.%I\)/);
 assert.match(install.guardSql,/BUSINESS_TABLE_NOT_EMPTY/);
 assert.match(runtime.observationSql,/'owner',\(SELECT pg_get_userbyid\(datdba\)/);
 assert.match(install.observationSql,/'owner',current_user/);
 const d=describeFresh35CombinedTarget(target),identity={...d.physical,database:d.proposal.database,owner:d.proposal.owner,actor:d.proposal.owner,host:d.proposal.host,port:d.proposal.port};
 assert.throws(()=>validateFresh35CombinedRuntimeCatalogObservation(JSON.stringify({format:'FRESH35_COMBINED_ACTUAL_CATALOG_V1',sourceSetSha256:describeFresh35CombinedSource(source).sourceSetSha256,identity}),catalog,source,target),/ACTUAL_PHYSICAL_IDENTITY_DIFFERS/);
 assert.throws(()=>fresh35CombinedRuntimeCatalogSql({...catalog},source,target),/GENUINE_CATALOG/);
});

test('production ordinary catalog reuses the complete model and observes after role without assuming interface pg_control permission',async()=>{
 const {bindFresh35CombinedProductionTargetV2}=networkModel.api;
 const {fresh35CombinedOrdinaryCatalogSql,validateFresh35CombinedOrdinaryCatalogObservation}=graph.catalogAPI;
 const {source}=await bundle(),p=describeFresh35CombinedTarget(target),prod=bindFresh35CombinedProductionTargetV2({proposal:{database:'new_prod_erp',owner:'new_owner',controller:'new_controller',runtime:'new_runtime',admin:'new_admin',host:'10.0.0.3',port:5432,workspaceDirectory:'/private/new-install'},physical:p.physical,startsAt,expiresAt:startsAt+1200000,purpose:'PRODUCTION_NEW_EMPTY_EXACT35',ordinary:{connectHost:'postgres',connectPort:5432,serverAddress:'172.20.0.4',serverPort:5432,runtimeLoginValidUntil:null,referenceDirectory:'/private/references'}},startsAt+1);
 const catalog=await buildFresh35CombinedCatalog(source,prod,{modelPath,functionsPath}),program=await compileFresh35CombinedProgram({source,target:prod,catalog});
 const sql=fresh35CombinedOrdinaryCatalogSql(catalog,source,prod,p.physical);
 for(const token of ['ROUTINE_SOURCE_OR_ACL_DIFFERS','RELATIONS_DIFFER','COLUMNACLS_DIFFER','POLICIES_DIFFER','EXACT_LINEAGE_DIFFERS'])assert(sql.guardSql.includes(token),token);
 assert(sql.guardSql.includes("session_user='new_runtime'"));assert(sql.guardSql.includes("current_user='erp_unified27_runtime_2393dbc6db9581c2'"));assert(!sql.guardSql.includes('BUSINESS_TABLE_NOT_EMPTY'));
 assert(!sql.guardSql.includes('SELECT 1 FROM pg_catalog.pg_stat_activity WHERE'));
 assert(!sql.guardSql.includes('physical_checks := ARRAY['));
 assert(!sql.guardSql.includes('(pg_catalog.fresh35_exclusive_backends())'),'ordinary interface checks source metadata but never executes the observer');
 assert(!sql.observationSql.includes('pg_control_system()'));assert(sql.observationSql.includes("'systemIdentifier','"+p.physical.systemIdentifier+"'"));
 assert.throws(()=>fresh35CombinedOrdinaryCatalogSql(catalog,source,prod,{...p.physical,systemIdentifier:'99'}),/PHYSICAL_BINDING/);
 assert.throws(()=>validateFresh35CombinedOrdinaryCatalogObservation('{}',catalog,source,prod),/PHYSICAL_IDENTITY/);
 const d=describeFresh35CombinedProgram(program),authorization={format:'FRESH35_COMBINED_EXECUTION_AUTHORIZATION_V1',decision:'AUTHORIZE_EXACT_NEW35_PRODUCTION_INSTALL_ONLY',programSha256:d.programSha256,sourceSetSha256:d.sourceSetSha256,targetSha256:d.targetSha256,startsAt,expiresAt:startsAt+1200000,independentSafetyReviewSha256:'a'.repeat(64),authorizationReference:'SYNTHETIC MODEL ONLY'};
 assert.equal(validateFresh35CombinedAuthorization(authorization,program).decision,authorization.decision);
 assert.throws(()=>validateFresh35CombinedAuthorization({...authorization,decision:'AUTHORIZE_EXACT_NEW35_SYNTHETIC_INSTALL_ONLY'},program),/EXACT_INSTALL_AUTHORIZATION/);
});


test('synthetic ordinary catalog is closed to true V1 target/birth/window and preserves production purpose guard',async()=>{
 const {fresh35CombinedSyntheticOrdinaryCatalogSql,validateFresh35CombinedSyntheticOrdinaryCatalogObservation,fresh35CombinedOrdinaryCatalogSql}=graph.catalogAPI;
 const {source,catalog}=await bundle(),p=describeFresh35CombinedTarget(target),sql=fresh35CombinedSyntheticOrdinaryCatalogSql(catalog,source,target,p.physical);
 for(const token of ['ROUTINE_SOURCE_OR_ACL_DIFFERS','RELATIONS_DIFFER','COLUMNACLS_DIFFER','POLICIES_DIFFER','EXACT_LINEAGE_DIFFERS'])assert(sql.guardSql.includes(token));
 assert(sql.guardSql.includes("session_user='"+p.proposal.runtime+"'"));assert(sql.guardSql.includes("current_user='erp_unified27_runtime_2393dbc6db9581c2'"));assert(sql.guardSql.includes(String(p.expiresAt)));assert(sql.guardSql.includes(p.physical.postmasterStart));assert(!sql.guardSql.includes('BUSINESS_TABLE_NOT_EMPTY'));assert(!sql.observationSql.includes('pg_control_system()'));
 assert.throws(()=>fresh35CombinedOrdinaryCatalogSql(catalog,source,target,p.physical),/ORDINARY_PHYSICAL_BINDING_REQUIRED/);
 assert.throws(()=>fresh35CombinedSyntheticOrdinaryCatalogSql(catalog,source,target,{...p.physical,postmasterStart:'RESTARTED'}),/SYNTHETIC_ORDINARY_PHYSICAL_BINDING_REQUIRED/);
 assert.throws(()=>fresh35CombinedSyntheticOrdinaryCatalogSql({...catalog},source,target,p.physical),/GENUINE_CATALOG_REQUIRED/);
 assert.throws(()=>validateFresh35CombinedSyntheticOrdinaryCatalogObservation('{}',catalog,source,target),/ACTUAL_PHYSICAL_IDENTITY_DIFFERS/);
});

test('unchanged runtime/ordinary consumers accept two native pg command results and reject the prior three-result observer layout (native wire model, not PG)',async()=>{
 const {Client}=await import('pg'),host=await readFile(root+'tools/unified-import/fresh35-host-session.mjs','utf8');
 const runtimeStart=host.indexOf(' const guards=await client.query(sql.guardSql);'),runtimeEnd=host.indexOf(' const result=await client.query(sql.observationSql);',runtimeStart);
 const ordinaryStart=host.indexOf('  const guards=await client.query(sql.guardSql);'),ordinaryEnd=host.indexOf('  const observed=await client.query(sql.observationSql);',ordinaryStart);
 assert(runtimeStart>=0&&runtimeEnd>runtimeStart&&ordinaryStart>runtimeStart&&ordinaryEnd>ordinaryStart);
 const runtimeConsumer=host.slice(runtimeStart,runtimeEnd),ordinaryConsumer=host.slice(ordinaryStart,ordinaryEnd),AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 const need=(ok,code)=>{if(!ok)throw Error('FRESH35_HOST_'+code)},ack=(r,tag)=>assert.equal(r.command,tag);
 async function nativeResults(sql,consumer,commands){
  // Use the real pinned pg Client query/result accumulator. Only the transport
  // supplies CommandComplete/ReadyForQuery frames; there is no socket or PG.
  const client=new Client({pipeline:false}),con=client.connection;client.on('error',()=>{});client._attachListeners(con);client._connecting=true;con.emit('readyForQuery',{status:'I'});
  let submitted=0;
  con.query=actual=>{assert.equal(actual,sql);submitted++;queueMicrotask(()=>{for(const command of commands)con.emit('commandComplete',{text:command});con.emit('readyForQuery',{status:'T'})})};
  try{return await new AsyncFunction('client','sql','need','ack',consumer+'return true;')(client,{guardSql:sql},need,ack)}finally{assert.equal(submitted,1);con.removeAllListeners();client.removeAllListeners();con.stream.destroy()}
 }
 const {source,catalog}=await bundle(),t=describeFresh35CombinedTarget(target),physical=t.physical;
 const prod=networkModel.api.bindFresh35CombinedProductionTargetV2({proposal:{...t.proposal,database:'ack_prod_erp',owner:'ack_owner',controller:'ack_controller',runtime:'ack_runtime',admin:'ack_admin'},physical,startsAt:t.startsAt,expiresAt:t.expiresAt,purpose:'PRODUCTION_NEW_EMPTY_EXACT35',ordinary:{connectHost:'postgres',connectPort:5432,serverAddress:'172.20.0.4',serverPort:5432,runtimeLoginValidUntil:null,referenceDirectory:'/private/references'}});
 const pc=await buildFresh35CombinedCatalog(source,prod,{modelPath,functionsPath});
 const variants=[
  [target,fresh35CombinedRuntimeCatalogSql(catalog,source,target),runtimeConsumer,/CATALOG_GUARD_ACK_INVALID/],
  [target,graph.catalogAPI.fresh35CombinedSyntheticOrdinaryCatalogSql(catalog,source,target,physical),ordinaryConsumer,/ORDINARY_CATALOG_GUARD_ACK_INVALID/],
  [prod,fresh35CombinedRuntimeCatalogSql(pc,source,prod),runtimeConsumer,/CATALOG_GUARD_ACK_INVALID/],
  [prod,graph.catalogAPI.fresh35CombinedOrdinaryCatalogSql(pc,source,prod,physical),ordinaryConsumer,/ORDINARY_CATALOG_GUARD_ACK_INVALID/]
 ];
 for(const [bound,sql,consumer,refusal]of variants){
  const check=networkModel.api.fresh35CombinedObserverCheck(bound),wrapper=networkModel.api.fresh35CombinedObserverGuard(bound);
  assert(sql.guardSql.includes(check),'the exact strict source/ACL check stays inside the existing statement');
  const stripped=sql.guardSql.replaceAll(check,'');
  const before=consumer===runtimeConsumer?wrapper+'\n'+stripped:stripped.replace('DO $fresh35_combined_catalog$',wrapper+'\nDO $fresh35_combined_catalog$');
  await assert.rejects(()=>nativeResults(before,consumer,['DO','DO','DO']),refusal,'the real previous three-result transport is rejected by the unmodified consumer');
  assert.equal(await nativeResults(sql.guardSql,consumer,['DO','DO']),true);
  await assert.rejects(()=>nativeResults(sql.guardSql,consumer,['DO','SELECT']),/ERR_ASSERTION|Expected values/,'two results with the wrong command tag still fail');
 }
});
