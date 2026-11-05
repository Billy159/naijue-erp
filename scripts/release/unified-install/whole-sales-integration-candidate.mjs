/** Offline composition only. Does not install, issue capabilities, or admit a catalog. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readWholeClosureIntegrationSources,compileWholeBatchClosureIntegrationCandidate} from './whole-closure-integration-candidate.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(condition,code)=>{if(!condition)throw Error(code);};
export const HISTORICAL_SALES_INTEGRATION_PINS=Object.freeze([
 ['profile','adapters/postgres/patches/0027_historical_sales_source_profile_successor.sql','4dafd8ec9c64d7ac99f659711e50b27e4c7aacd30db3dc9897b19d886ba49e96'],
 ['missing','adapters/postgres/patches/0027_historical_missing_settlement_successor.sql','a0464dbeb0764c371319c2d8230ddb75eb89a00a607fa0ff15d77864fef910ea'],
 ['restoration','adapters/postgres/patches/0027_historical-original-restoration_successor.sql','18ab7894162c9bd9053b7d6fd8126a70fcd81896c1fbb103972e4110fbe7b8de'],
 ['migration','adapters/postgres/migrations/0027_unified_business_documents.sql','d42954acf56445b803ae126b364b1b2a7b0cfe70a98accaeef5cc13a9082c317'],
].map(([name,path,sha256])=>Object.freeze({name,path,sha256})));
function transactionBody(sql){
 need((sql.match(/^BEGIN;$/gm)||[]).length===1&&(sql.match(/^COMMIT;$/gm)||[]).length===1&&sql.endsWith('COMMIT;\n'),'WHOLE_SALES_TRANSACTION_INVALID');
 return sql.replace(/^BEGIN;\n/m,'').slice(0,-'COMMIT;\n'.length);
}
function spec(sql,tag){return JSON.parse(sql.split(`$${tag}$`)[1]);}
function body(sql,name){
 const matches=[...sql.matchAll(new RegExp('CREATE OR REPLACE FUNCTION naijue_erp\\.'+name+'\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;','g'))];
 need(matches.length===1,'WHOLE_SALES_ROUTINE_INVALID');return matches[0][1];
}
function apply(before,specification,extension){
 need(hash(before)===specification.predecessor_sha256,'WHOLE_SALES_PREDECESSOR_INVALID');
 let after=before;
 for(const change of specification.replacements){
  need(change.before.length>0&&after.split(change.before).length===2,'WHOLE_SALES_ANCHOR_INVALID');
  after=after.replace(change.before,()=>change.after==='$RESTORATION_PROOF'?extension+change.before:change.after);
 }
 need(hash(after)===specification.successor_sha256,'WHOLE_SALES_SUCCESSOR_INVALID');return after;
}
export function compileWholeSalesIntegrationCandidate(sources,batchSql,sales){
 const prior=compileWholeBatchClosureIntegrationCandidate(sources,batchSql);
 need(sales&&Object.keys(sales).sort().join(',')==='migration,missing,profile,restoration','WHOLE_SALES_SOURCE_DIFFERS');
 for(const pin of HISTORICAL_SALES_INTEGRATION_PINS)need(typeof sales[pin.name]==='string'&&hash(sales[pin.name])===pin.sha256,'WHOLE_SALES_SOURCE_DIFFERS:'+pin.name);
 const profile=spec(sales.profile,'source_profile_changes'),missing=spec(sales.missing,'source_changes'),restoration=spec(sales.restoration,'source_changes');
 const command='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)',settlement='naijue_erp.validate_sales_settlement()';
 apply(body(sources.kernel,'standard_whole_package_command_v2'),profile);
 const intermediate=apply(body(sales.migration,'validate_sales_settlement'),missing);
 apply(intermediate,restoration,sales.restoration.split('$restoration_proof$')[1]);
 need(restoration.dependencies.find(dep=>dep.signature===command)?.sha256===profile.successor_sha256,'WHOLE_SALES_PROFILE_DEPENDENCY_INVALID');
 const beforePin=JSON.stringify({signature:command,sha256:profile.predecessor_sha256,new:true});
 const afterPin=JSON.stringify({signature:command,sha256:profile.successor_sha256,new:true});
 need(prior.accessSql.split(beforePin).length===2,'WHOLE_SALES_ACCESS_PIN_INVALID');
 // Exactly one additional verifier digest changes. Its permission statements and
 // owner, role, ACL, metadata and trigger predicates are otherwise untouched.
 const accessSql=prior.accessSql.replace(beforePin,afterPin);
 const oldAccess=transactionBody(prior.accessSql);
 need(prior.sql.split(oldAccess).length===2,'WHOLE_SALES_ACCESS_POSITION_INVALID');
 const successorBodies=['profile','missing','restoration'].map(name=>transactionBody(sales[name]));
 const sql=prior.sql.replace(oldAccess,()=>successorBodies.join('\n')+'\n'+transactionBody(accessSql));
 const chain=[{signature:command,before:profile.predecessor_sha256,after:profile.successor_sha256},
  {signature:settlement,before:missing.predecessor_sha256,after:missing.successor_sha256},
  {signature:settlement,before:restoration.predecessor_sha256,after:restoration.successor_sha256}];
 const changes=[...prior.manifest.routineChanges,chain[0],{signature:settlement,before:missing.predecessor_sha256,after:restoration.successor_sha256}];
 return {sql,accessSql,catalogPinProposal:{...prior.catalogPinProposal,format:'WHOLE_SALES_CATALOG_PIN_PROPOSAL_V1',changes},manifest:{
  ...prior.manifest,format:'WHOLE_SALES_INTEGRATION_REVIEW_CANDIDATE_V1',sqlSha256:hash(sql),routineChanges:changes,
  predecessorChain:[...prior.manifest.predecessorChain,...chain],
  sourcePins:[...prior.manifest.sourcePins,...HISTORICAL_SALES_INTEGRATION_PINS.map(({path,sha256})=>({path,sha256}))],
  sourceOnly:true,installationReady:false,activeProfilesChanged:false,
  requiredNextGate:'INDEPENDENT_COMBINED_SOURCE_REVIEW_AND_AUTHORIZED_ISOLATED_ENGINE_ACCEPTANCE_THEN_VERSIONED_CATALOG_ADMISSION',
 }};
}
export async function renderWholeSalesIntegrationCandidate(root){
 const sales=Object.fromEntries(await Promise.all(HISTORICAL_SALES_INTEGRATION_PINS.map(async pin=>[pin.name,await readFile(resolve(root,pin.path),'utf8')])));
 return compileWholeSalesIntegrationCandidate(await readWholeClosureIntegrationSources(root),await readFile(resolve(root,'adapters/postgres/patches/0027_standard_whole_closure_batch_binding_candidate.sql'),'utf8'),sales);
}

/** Versioned reception successor. Historical three-patch composition above is
 * unchanged; this extends it in the same transaction, with no implicit admission. */
export const ZERO_ARCHIVE_SQL_PIN=Object.freeze({path:'adapters/postgres/patches/0027_zero_amount_archive_successor.sql',sha256:'5159e75a04a0c20a9c47b8853df30c4233645509af0f352bc506dbd9a6ce30e6'});
export const STAFF_NULL_HALL_SQL_PIN=Object.freeze({path:'adapters/postgres/patches/0027_historical_staff_null_hall_successor.sql',sha256:'38a07279c703ec72c7f72af2894de6794103f582627d3da6f1e2800e8a52dc6f'});
export const RESTORATION_ACL_SQL_PIN=Object.freeze({path:'adapters/postgres/patches/0027_historical_restoration_acl_hardening_v1.sql',sha256:'3b676e85ee4b41da5fd85e93a2c2b878a1b4bdefc1f953932c7c7a05deb5bfda'});
export async function renderWholeHistoricalReceptionCandidate(root){
 const prior=await renderWholeSalesIntegrationCandidate(root),zero=await readFile(resolve(root,ZERO_ARCHIVE_SQL_PIN.path),'utf8');
 need(hash(zero)===ZERO_ARCHIVE_SQL_PIN.sha256,'ZERO_ARCHIVE_SOURCE_DIFFERS');
 const acl=await readFile(resolve(root,RESTORATION_ACL_SQL_PIN.path),'utf8');need(hash(acl)===RESTORATION_ACL_SQL_PIN.sha256,'RESTORATION_ACL_SOURCE_DIFFERS');
 const aclChanges=['naijue_erp.validate_sales_settlement()','naijue_erp.reject_immutable_change()'].map(signature=>({signature,before:'DEFAULT_PUBLIC_EXECUTE',after:'OWNER_ONLY_EXECUTE',operation:'REVOKE_PUBLIC_EXECUTE'}));
 const changes=spec(zero,'source_profile_changes'),command='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)',trace='naijue_erp.standard_zero_amount_archive_trace(uuid)';
 const old=JSON.stringify({signature:command,sha256:changes.predecessor_sha256,new:true});
 need(prior.accessSql.split(old).length===2,'ZERO_ARCHIVE_ACCESS_PREDECESSOR_DIFFERS');
 const kernel=await readFile(resolve(root,'adapters/postgres/patches/0027_standard_import_whole_package_v2.sql'),'utf8');
 const profile=await readFile(resolve(root,HISTORICAL_SALES_INTEGRATION_PINS[0].path),'utf8');
 const zeroBody=apply(apply(body(kernel,'standard_whole_package_command_v2'),spec(profile,'source_profile_changes')),changes);
 const staff=await readFile(resolve(root,STAFF_NULL_HALL_SQL_PIN.path),'utf8');need(hash(staff)===STAFF_NULL_HALL_SQL_PIN.sha256,'STAFF_NULL_HALL_SOURCE_DIFFERS');const staffChanges=spec(staff,'source_profile_changes');apply(zeroBody,staffChanges);
 const traceBody=zero.split('$zero_archive_trace$')[1],traceHash=hash(traceBody);
 let accessSql=prior.accessSql.replace(old,()=>JSON.stringify({signature:command,sha256:staffChanges.successor_sha256,new:true}));
 const check=`\n -- Exact read-only trace metadata and ACL are separately pinned from volatile command functions.\n SELECT * INTO STRICT p FROM pg_catalog.pg_proc WHERE oid='${trace}'::regprocedure;\n IF encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>'${traceHash}' OR p.proowner<>current_user::regrole::oid OR NOT p.prosecdef OR NOT p.proretset OR p.provolatile<>'s' OR p.proleakproof OR p.proisstrict OR p.prokind<>'f' OR p.proparallel<>'u' OR p.prorettype<>'record'::regtype OR p.proargtypes::text<>'2950' OR p.proallargtypes IS DISTINCT FROM ARRAY['uuid'::regtype::oid,'uuid'::regtype::oid,'uuid'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'jsonb'::regtype::oid] OR p.proargmodes IS DISTINCT FROM ARRAY['i','t','t','t','t','t']::"char"[] OR p.proargnames IS DISTINCT FROM ARRAY['sales','record_id','sales_id','sales_source_key','source_namespace','proof'] OR p.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql') OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp','TimeZone=UTC'] THEN RAISE EXCEPTION 'ZERO_ARCHIVE_TRACE_METADATA_DIFFERS' USING ERRCODE='55000'; END IF;\n recipient:='erp_unified27_importer_2393dbc6db9581c2'::regrole::oid;\n IF NOT has_function_privilege(recipient,p.oid,'EXECUTE') OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.grantee NOT IN (p.proowner,recipient) OR (acl.grantee<>p.proowner AND acl.is_grantable)) THEN RAISE EXCEPTION 'ZERO_ARCHIVE_TRACE_ACL_DIFFERS' USING ERRCODE='42501'; END IF;\n`;
 need(accessSql.split('END $access$;').length===2,'ZERO_ARCHIVE_ACCESS_ANCHOR_INVALID');
 accessSql=accessSql.replace('END $access$;',()=>check+'END $access$;');
 const previousAccess=transactionBody(prior.accessSql);
 need(prior.sql.split(previousAccess).length===2,'ZERO_ARCHIVE_INSTALL_POSITION_INVALID');
 const restoration=await readFile(resolve(root,HISTORICAL_SALES_INTEGRATION_PINS.find(x=>x.name==='restoration').path),'utf8');
 const restorationBody=transactionBody(restoration);need(prior.sql.split(restorationBody).length===2,'RESTORATION_ACL_POSITION_DIFFERS');
 const hardenedSql=prior.sql.replace(restorationBody,()=>transactionBody(acl)+'\n'+restorationBody);
 const sql=hardenedSql.replace(previousAccess,()=>transactionBody(zero)+'\n'+transactionBody(staff)+'\n'+transactionBody(accessSql));
 const routineChanges=prior.manifest.routineChanges.map(x=>x.signature===command?{...x,after:staffChanges.successor_sha256}:x).concat([{signature:trace,before:null,after:traceHash}]);
 return {...prior,sql,accessSql,catalogPinProposal:{...prior.catalogPinProposal,format:'WHOLE_HISTORICAL_RECEPTION_PIN_PROPOSAL_V1',changes:routineChanges},manifest:{...prior.manifest,format:'WHOLE_HISTORICAL_RECEPTION_CANDIDATE_V1',sqlSha256:hash(sql),aclChanges,routineChanges,predecessorChain:[...prior.manifest.predecessorChain,{signature:command,before:changes.predecessor_sha256,after:changes.successor_sha256},{signature:command,before:staffChanges.predecessor_sha256,after:staffChanges.successor_sha256}],sourcePins:[...prior.manifest.sourcePins,ZERO_ARCHIVE_SQL_PIN,STAFF_NULL_HALL_SQL_PIN,RESTORATION_ACL_SQL_PIN],permissions:{...prior.manifest.permissions,changedFromExistingAccessPolicy:true,existingRoutinePermissionsUnchanged:false,newTraceExecuteRole:"erp_unified27_importer_2393dbc6db9581c2",grantStatements:prior.manifest.permissions.grantStatements+1,revokeStatements:prior.manifest.permissions.revokeStatements+3}}};
}
