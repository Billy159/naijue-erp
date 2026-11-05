/** Fresh35 observation contract. This is not a reference registry, protected
 * installation record, engine provenance proof or import admission capability. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseStrictJson } from '../../../packages/application/src/unified-import-contract.ts';
import { WHOLE_CATALOG_QUERY } from './whole-catalog-gate.mjs';
import { loadFresh35RetirementPlan } from './fresh35-retirement-plan.mjs';
import { compileFresh35SchemaFromDump } from './fresh35-retirement-schema.mjs';
import { normalizeRetirementSignature } from './fresh35-retirement-source.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error(code);};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const specs=new WeakSet();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sorted=values=>[...values].sort();
const closed=(value,keys,code)=>need(value&&typeof value==='object'&&!Array.isArray(value)&&same(Object.keys(value).sort(),sorted(keys)),code);
function replaceOnce(sql,before,after){need(sql.split(before).length===2,'FRESH35_PREDECESSOR_QUERY_ANCHOR_DIFFERS');return sql.replace(before,()=>after);}
function query(){
 // Copy the complete raw catalogue projection, not the old runtime admission
 // predicate. This observes metadata only: no permission boolean, application
 // function invocation, explicit-zero review or inherited security gate runs.
 const packetAt=WHOLE_CATALOG_QUERY.indexOf(' packet AS (SELECT');
 need(packetAt>0,'FRESH35_PREDECESSOR_PACKET_ANCHOR_DIFFERS');
 let sql=`WITH ns AS (SELECT * FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp'),
 rels AS (SELECT c.* FROM pg_catalog.pg_class c WHERE c.relnamespace=(SELECT oid FROM ns)),
 funcs AS (SELECT p.* FROM pg_catalog.pg_proc p WHERE p.pronamespace=(SELECT oid FROM ns)),
 runtime_role AS (SELECT * FROM pg_catalog.pg_roles WHERE rolname='erp_unified27_runtime_2393dbc6db9581c2'),
 runtime_edges AS (SELECT m.* FROM pg_catalog.pg_auth_members m WHERE m.roleid=(SELECT oid FROM runtime_role)),
 application AS (SELECT r.* FROM pg_catalog.pg_roles r JOIN runtime_edges m ON m.member=r.oid),
`+WHOLE_CATALOG_QUERY.slice(packetAt);
 sql=replaceOnce(sql,'AS catalog_json FROM valid WHERE ok)','AS catalog_json)');
 sql=replaceOnce(sql," 'database',(SELECT",` 'resolved_routines',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',p.oid,'signature',pin->>'signature') ORDER BY p.oid) FROM pg_catalog.jsonb_array_elements($1::pg_catalog.jsonb) pin JOIN funcs p ON p.oid=(pin->>'signature')::pg_catalog.regprocedure),
 'resolved_constraints',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',c.oid,'definition',pg_catalog.pg_get_constraintdef(c.oid,false)) ORDER BY c.oid) FROM pg_catalog.pg_constraint c WHERE c.connamespace=(SELECT oid FROM ns)),
 'database',(SELECT`);
 return sql;
}
export const FRESH35_CATALOG_QUERY=query();
export const FRESH35_CATALOG_PROFILE='FRESH35_RETIRED152_V1';
export const FRESH35_IDENTITY_KEYS=Object.freeze(['system_identifier','database_oid','database_name','owner','controller','runtime_login','server_version_num']);
export function requireFresh35Identity(identity){
 closed(identity,FRESH35_IDENTITY_KEYS,'FRESH35_CATALOG_IDENTITY_REQUIRED');
 for(const key of FRESH35_IDENTITY_KEYS)need(key==='runtime_login'&&identity[key]===null||typeof identity[key]==='string'&&identity[key].length>0&&identity[key].length<=256,'FRESH35_CATALOG_IDENTITY_INVALID');
 for(const key of ['system_identifier','database_oid','server_version_num'])need(/^[1-9][0-9]*$/.test(identity[key]),'FRESH35_CATALOG_IDENTITY_INVALID');
 return identity;
}
export async function loadFresh35CatalogSpec(sourceRoot,input){
 closed(input,['schemaDump'],'FRESH35_SCHEMA_DUMP_REQUIRED');need(typeof input.schemaDump==='string'&&input.schemaDump.length>0&&Buffer.byteLength(input.schemaDump)<=32*1024*1024,'FRESH35_SCHEMA_DUMP_REQUIRED');
 const plan=await loadFresh35RetirementPlan(sourceRoot),schemaDumpSha256=hash(input.schemaDump);
 const schema=compileFresh35SchemaFromDump(input.schemaDump,plan,{dumpSha256:schemaDumpSha256,predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256});
 const modulePaths=['scripts/release/unified-install/fresh35-catalog-contract.mjs','scripts/release/unified-install/fresh35-catalog-collector.mjs','scripts/release/unified-install/fresh35-catalog-record-draft.mjs','scripts/release/unified-install/fresh35-catalog-schema-diff.mjs','tools/unified-import/fresh35-host-session.mjs'];
 const sourcePins=[...plan.sourcePins];
 for(const path of modulePaths){const bytes=await readFile(resolve(sourceRoot,path));const moduleBytes=await readFile(new URL('../../../'+path,import.meta.url));need(bytes.equals(moduleBytes),'FRESH35_CATALOG_MODULE_SOURCE_DIFFERS');sourcePins.push({path,sha256:hash(bytes)});}
 sourcePins.sort((a,b)=>a.path.localeCompare(b.path));need(new Set(sourcePins.map(pin=>pin.path)).size===sourcePins.length,'FRESH35_CATALOG_DUPLICATE_SOURCE');
 const spec={format:'FRESH35_RETIRED152_SOURCE_SPEC_V1',profile:FRESH35_CATALOG_PROFILE,
  sourceSetSha256:plan.sourceSetSha256,predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256,
  schemaDumpSha256,compiledSchemaSha256:schema.sha256,catalogQuerySha256:hash(FRESH35_CATALOG_QUERY),sourcePins,
  retainedTables:sorted(plan.retainedTables),omittedTables:sorted(plan.omittedTables),
  routinePins:plan.retainedRoutines.map(routine=>({signature:routine.signature,sha256:routine.bodySha256,search_path:routine.search_path})),
  foreignKeyReplacements:plan.foreignKeyReplacements,
  sourceOnly:true,schemaDumpOriginAuthenticated:false,reviewedCatalogRegistered:false,installationReady:false,targetAdmitted:false};
 const result=freeze({...spec,sourceSpecSha256:hash(JSON.stringify(spec))});specs.add(result);return result;
}
export function describeFresh35CatalogSpec(spec){need(specs.has(spec),'FRESH35_GENUINE_SOURCE_SPEC_REQUIRED');return spec;}
const catalogKeys=['database','dependencies','shared_dependencies','roles','memberships','schemas','routines','relations','columns','constraints','indexes','triggers','policies','types','defaults','rewrite','sequence_parameters','default_acl','parameter_acl','languages','extensions','role_setting_digests','resolved_routines','resolved_constraints'];
function inventory(catalog,key){const list=catalog[key];need(list===null||Array.isArray(list),'FRESH35_CATALOG_INVENTORY_INVALID:'+key);return list??[];}
const oid=value=>{need(typeof value==='string'&&/^(?:0|[1-9][0-9]*)$/.test(value)&&Number(value)<=4294967295||Number.isSafeInteger(value)&&value>=0&&value<=4294967295,'FRESH35_CATALOG_OID_INVALID');return String(value);};
const unique=(rows,key)=>{need(new Set(rows.map(row=>key==='oid'?oid(row[key]):row[key])).size===rows.length,'FRESH35_CATALOG_DUPLICATE:'+key);};
function owns(row,keys){for(const key of keys)need(Object.hasOwn(row,key),'FRESH35_CATALOG_METADATA_MISSING:'+key);}
/** Parsing caller-supplied JSON can only check consistency. It cannot establish
 * that a database ran this SELECT, that its ACL was reviewed, or that installation
 * completed. A byte hash of this packet is never an authorization token. */
export function validateFresh35CatalogPacket(text,spec,expectedIdentity){
 describeFresh35CatalogSpec(spec);requireFresh35Identity(expectedIdentity);
 need(typeof text==='string'&&Buffer.byteLength(text)<=16*1024*1024,'FRESH35_CATALOG_PACKET_BOUNDS');
 const packet=parseStrictJson(text);closed(packet,['identity','catalog'],'FRESH35_CATALOG_PACKET_INVALID');requireFresh35Identity(packet.identity);
 for(const key of FRESH35_IDENTITY_KEYS)need(packet.identity[key]===expectedIdentity[key],'FRESH35_CATALOG_PHYSICAL_TARGET_DIFFERS');
 closed(packet.catalog,catalogKeys,'FRESH35_CATALOG_PACKET_INCOMPLETE');const c=packet.catalog;
 for(const key of catalogKeys.filter(key=>key!=='database'))inventory(c,key);
 need(c.database&&typeof c.database==='object'&&!Array.isArray(c.database)&&String(c.database.oid)===packet.identity.database_oid&&c.database.datname===packet.identity.database_name,'FRESH35_CATALOG_DATABASE_IDENTITY_DIFFERS');
 const schemas=inventory(c,'schemas').filter(row=>row.nspname==='naijue_erp');need(schemas.length===1,'FRESH35_CATALOG_SCHEMA_MISSING');owns(schemas[0],['oid','nspowner','nspacl']);const schema=schemas[0];
 const relations=inventory(c,'relations'),routines=inventory(c,'routines'),resolved=inventory(c,'resolved_routines');
 unique(relations,'oid');unique(relations,'relname');unique(routines,'oid');unique(resolved,'oid');unique(resolved,'signature');
 for(const relation of relations){owns(relation,['oid','relname','relkind','relnamespace','relowner','relacl','relrowsecurity','relforcerowsecurity']);need(oid(relation.relnamespace)===oid(schema.oid),'FRESH35_CATALOG_RELATION_SCHEMA_DIFFERS');need(['r','i','S'].includes(relation.relkind),'FRESH35_CATALOG_UNREVIEWED_RELATION_KIND');}
 const tables=relations.filter(row=>row.relkind==='r');need(same(sorted(tables.map(row=>row.relname)),spec.retainedTables),'FRESH35_CATALOG_TABLE_COHORT_DIFFERS');
 need(routines.length===152&&resolved.length===152,'FRESH35_CATALOG_ROUTINE_COHORT_DIFFERS');
 const pins=new Map(spec.routinePins.map(pin=>[normalizeRetirementSignature(pin.signature),pin]));const seen=new Set();
 for(const routine of routines){
  owns(routine,['oid','proname','pronamespace','proowner','proacl','prosrc','proconfig']);
  const identity=resolved.find(row=>oid(row.oid)===oid(routine.oid)),key=typeof identity?.signature==='string'?normalizeRetirementSignature(identity.signature):null,pin=pins.get(key);
  need(pin&&!seen.has(key)&&oid(routine.pronamespace)===oid(schema.oid)&&oid(routine.proowner)===oid(schema.nspowner)&&routine.proname===key.slice('naijue_erp.'.length,key.indexOf('(')),'FRESH35_CATALOG_ROUTINE_IDENTITY_DIFFERS');seen.add(key);
  need(typeof routine.prosrc==='string'&&hash(routine.prosrc)===pin.sha256&&Array.isArray(routine.proconfig)&&routine.proconfig.includes(pin.search_path),'FRESH35_CATALOG_ROUTINE_SOURCE_DIFFERS');
 }
 const types=inventory(c,'types').filter(row=>oid(row.typnamespace)===oid(schema.oid));unique(types,'oid');unique(types,'typname');need(same(sorted(types.map(row=>row.typname)),sorted(spec.retainedTables.flatMap(table=>[table,'_'+table]))),'FRESH35_CATALOG_ROWTYPE_COHORT_DIFFERS');
 for(const table of tables){const composite=types.find(row=>row.typname===table.relname),array=types.find(row=>row.typname==='_'+table.relname);need(composite.typtype==='c'&&oid(composite.typrelid)===oid(table.oid)&&oid(composite.typelem)==='0'&&array.typtype==='b'&&oid(array.typrelid)==='0'&&oid(array.typelem)===oid(composite.oid),'FRESH35_CATALOG_ROWTYPE_BINDING_DIFFERS');}
 const constraints=inventory(c,'constraints'),definitions=inventory(c,'resolved_constraints');unique(constraints,'oid');unique(definitions,'oid');need(definitions.length===constraints.length,'FRESH35_CATALOG_CONSTRAINT_DEFINITIONS_MISSING');
 need(constraints.every(row=>row.convalidated===true),'FRESH35_CATALOG_UNVALIDATED_CONSTRAINT');
 for(const edge of spec.foreignKeyReplacements){
  const table=tables.find(row=>row.relname===edge.table);need(!constraints.some(row=>oid(row.conrelid)===oid(table.oid)&&row.conname===edge.fk),'FRESH35_CATALOG_LEGACY_FOREIGN_KEY_REMAINS');
  const matches=constraints.filter(row=>oid(row.conrelid)===oid(table.oid)&&row.conname===edge.check);need(matches.length===1&&matches[0].contype==='c','FRESH35_CATALOG_NULL_CHECK_MISSING');
  const definition=definitions.find(row=>oid(row.oid)===oid(matches[0].oid))?.definition;need(definition===`CHECK ((${edge.column} IS NULL))`,'FRESH35_CATALOG_NULL_CHECK_DIFFERS');
 }
 const triggers=inventory(c,'triggers'),policies=inventory(c,'policies');need(triggers.every(row=>row.tgenabled==='O'),'FRESH35_CATALOG_TRIGGER_DISABLED');
 for(const policy of policies)need(relations.some(row=>oid(row.oid)===oid(policy.polrelid)&&row.relrowsecurity===true),'FRESH35_CATALOG_POLICY_WITHOUT_RLS');
 return freeze({format:'FRESH35_CATALOG_OBSERVATION_V1',state:'OBSERVATION_ONLY_NOT_ADMISSION',profile:spec.profile,
  identity:packet.identity,catalogSha256:hash(text),sourceSpecSha256:spec.sourceSpecSha256,sourceSetSha256:spec.sourceSetSha256,
  predecessorSourceSpecSha256:spec.predecessorSourceSpecSha256,schemaDumpSha256:spec.schemaDumpSha256,compiledSchemaSha256:spec.compiledSchemaSha256,
  tableCount:tables.length,routineCount:routines.length,externalTriggerCount:triggers.filter(row=>row.tgisinternal===false).length,policyCount:policies.length,
  catalogCategoryKeysPresent:true,catalogMetadataComplete:false,engineDependenciesVerified:false,independentAclReviewComplete:false,migrationLineageVerified:false,physicalProvenanceAuthenticated:false,
  installationReady:false,targetAdmitted:false,businessImportVerified:false});
}
