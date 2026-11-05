/** Offline atomic script renderer for a separately authorized NEW synthetic
 * target. No connection, credential creation, role grant or execution occurs. */
import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
import {loadFresh35RetirementSource} from './fresh35-retirement-source.mjs';
import {loadFresh35RetirementPlan,requireFresh35RetirementPlan} from './fresh35-retirement-plan.mjs';
import {mapFresh35RetirementIdentities} from './fresh35-retirement-identity.mjs';
import {compileFresh35SchemaFromDump,parseFresh35DumpSections} from './fresh35-retirement-schema.mjs';
import {collectFresh35RetirementMetadata} from './fresh35-retirement-metadata.mjs';
import {loadFresh35PostconditionEvidence,buildFresh35CatalogPostconditions} from './fresh35-catalog-postconditions.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');const need=(ok,code)=>{if(!ok)throw Error(code);};
const quote=value=>"'"+value.replaceAll("'","''")+"'";
// Explicit, independently reviewed local support closure. The predecessor's
// installation_sources describes its installation profile, not every module
// executed by this renderer. Conservative type dependencies are pinned too.
// A separate recursive-import regression test detects additions to this tree.
const rendererSupportSources=Object.freeze([
 'scripts/release/unified-install/whole-closure-integration-candidate.mjs',
 ...['unified-historical-staff-hall-approval','unified-zero-amount-archive','inventory-cutoff-import','request-hash','canonical-request-value','history-import-lifecycle','history-storage-contract','native-import-record-accounting','native-import-schema-contract','history-typed-closure','history-typed-publication','unified-import-stable-identity','unified-import-historical-sales','calendar-date','native-barcode-import','import-v2-contract'].map(name=>'packages/application/src/'+name+'.ts'),
 ...['errors','values','sales-money'].map(name=>'packages/domain/src/'+name+'.ts'),
]);
export async function loadFresh35InstallationSourcePins(root,plan){
 requireFresh35RetirementPlan(plan);
 const predecessors=new Map(plan.sourcePins.map(pin=>[pin.path,pin.sha256]));
 const paths=[...new Set([...predecessors.keys(),...['fresh35-retirement-install','fresh35-retirement-identity','fresh35-retirement-metadata','fresh35-catalog-postconditions'].map(name=>'scripts/release/unified-install/'+name+'.mjs'),...rendererSupportSources])].sort();
 const pins=[];
 for(const path of paths){const sha256=hash(await readFile(resolve(root,path)));need(!predecessors.has(path)||predecessors.get(path)===sha256,'FRESH35_INSTALL_SOURCE_PIN_CONFLICT');pins.push(Object.freeze({path,sha256}));}
 Object.freeze(pins);return Object.freeze({pins,sha256:hash(JSON.stringify(pins))});
}
export function createFresh35RetirementTargetGuard(target){
 need(target&&Object.getPrototypeOf(target)===Object.prototype&&Object.keys(target).sort().join(',')==='database_name,database_oid,owner,server_version_num,system_identifier','FRESH35_EXACT_SYNTHETIC_TARGET_REQUIRED');
 need(/^synthetic_fresh35_[a-z0-9_]+$/.test(target.database_name)&&target.database_name.length<=63&&/^[1-9][0-9]{0,9}$/.test(target.database_oid)&&/^[1-9][0-9]{0,19}$/.test(target.system_identifier)&&/^[a-z_][a-z0-9_]{0,62}$/.test(target.owner)&&/^17[0-9]{4}$/.test(target.server_version_num),'FRESH35_EXACT_SYNTHETIC_TARGET_REQUIRED');
 return `DO $fresh35_target$ BEGIN
 IF NOT(current_user=session_user) OR current_user<>${quote(target.owner)}
  OR current_database()<>${quote(target.database_name)}
  OR (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database())<>${quote(target.database_oid)}
  OR (SELECT system_identifier::text FROM pg_catalog.pg_control_system())<>${quote(target.system_identifier)}
  OR current_setting('server_version_num')<>${quote(target.server_version_num)}
  OR current_setting('transaction_isolation')<>'read committed'
  OR current_setting('transaction_read_only')<>'off'
  OR current_setting('session_replication_role')<>'origin'
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_database WHERE datname=current_database() AND datdba=current_user::regrole::oid)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
 THEN RAISE EXCEPTION 'FRESH35_PHYSICAL_NEW_SYNTHETIC_TARGET_REQUIRED' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp')
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%')
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname<>'plpgsql')
 THEN RAISE EXCEPTION 'FRESH35_EMPTY_DATABASE_REQUIRED' USING ERRCODE='55000'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2','erp_unified27_runtime_2393dbc6db9581c2') AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit AND rolconnlimit=0)<>3
 THEN RAISE EXCEPTION 'FRESH35_PRECREATED_PROTECTED_ROLES_REQUIRED' USING ERRCODE='42501'; END IF;
END $fresh35_target$;\n`;
}
export async function loadFresh35MigrationLineage(root){
 const source=await loadFresh35RetirementSource(root),rows=[];
 const migrations=source.sourcePins.filter(pin=>/^adapters\/postgres\/migrations\/\d{4}_[^/]+\.sql$/.test(pin.path));
 need(migrations.length===27,'FRESH35_EXACT27_MIGRATIONS_REQUIRED');
 for(const pin of migrations){
  const sql=await readFile(resolve(root,pin.path),'utf8');need(hash(sql)===pin.sha256,'FRESH35_MIGRATION_SOURCE_DIFFERS');
  const matches=[...sql.matchAll(/\bINSERT\s+INTO\s+naijue_erp\.schema_migration\s*\(\s*version\s*,\s*description\s*\)\s*VALUES\s*\(\s*(\d+)\s*,\s*'((?:''|[^'])*)'\s*\)\s*;/gi)];
  need(matches.length===1,'FRESH35_EXACT_MIGRATION_ROW_REQUIRED:'+pin.path);
  rows.push({version:Number(matches[0][1]),description:matches[0][2].replaceAll("''","'"),source:pin.path,sourceSha256:pin.sha256});
 }
 rows.sort((a,b)=>a.version-b.version);need(rows.every((row,index)=>row.version===index+1),'FRESH35_MIGRATION_LINEAGE_DIFFERS');
 return {rows,sql:rows.map(row=>`INSERT INTO naijue_erp.schema_migration(version,description) VALUES(${row.version},${quote(row.description)});`).join('\n')+'\n'};
}
export async function renderFresh35RetirementInstall(root,{dump,dumpSha256,predecessorSourceSpecSha256,target,identityMapping,postconditionEvidenceDirectory}){
 const targetGuard=createFresh35RetirementTargetGuard(target);
 need(typeof postconditionEvidenceDirectory==='string'&&postconditionEvidenceDirectory.length>0,'FRESH35_COMPLETE_POSTCONDITION_EVIDENCE_REQUIRED');
 need(identityMapping?.owner&&identityMapping?.controller,'FRESH35_EXPLICIT_IDENTITY_MAPPING_REQUIRED');
 const evidence=await loadFresh35PostconditionEvidence(postconditionEvidenceDirectory);
 need(typeof dump==='string'&&dump===evidence.dump&&dumpSha256===hash(evidence.dump),'FRESH35_PINNED_DUMP_REQUIRED');
 const plan=await loadFresh35RetirementPlan(root);
 const schema=compileFresh35SchemaFromDump(dump,plan,{dumpSha256,predecessorSourceSpecSha256});
 const sections=parseFresh35DumpSections(dump);
 const sourceOwner=identityMapping?.owner?.source??target.owner;
 need(sections.every(section=>section.owner==='-'||section.owner===sourceOwner),'FRESH35_DUMP_OWNER_TARGET_DIFFERS');
 if(identityMapping)need(identityMapping.owner.target===target.owner,'FRESH35_MAPPED_OWNER_TARGET_DIFFERS');
 const mapped=identityMapping?mapFresh35RetirementIdentities(schema.sql,identityMapping):null;
 const effectiveSchemaSql=mapped?.sql??schema.sql;
 const metadata=collectFresh35RetirementMetadata(effectiveSchemaSql);
 const completePostconditions=buildFresh35CatalogPostconditions(evidence,plan,{[identityMapping.owner.source]:identityMapping.owner.target,[identityMapping.controller.source]:identityMapping.controller.target},metadata);
 need(completePostconditions.completeMetadataGuardSource===true&&completePostconditions.sourceSchemaSha256===hash(effectiveSchemaSql),'FRESH35_COMPLETE_METADATA_SOURCE_BINDING_REQUIRED');
 const lineage=await loadFresh35MigrationLineage(root);
 const pins=plan.retainedRoutines.map(routine=>({signature:routine.signature,sha256:routine.bodySha256}));
 const postconditions=`DO $fresh35_installed$ DECLARE item jsonb; relation record; populated boolean; BEGIN
 IF (SELECT array_agg(relname::text ORDER BY relname) FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind='r') IS DISTINCT FROM ARRAY[${plan.retainedTables.map(quote).sort().join(',')}]
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND (relkind NOT IN('r','i','S') OR relpersistence<>'p' OR relispartition))
  OR (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>152
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE connamespace='naijue_erp'::regnamespace AND NOT convalidated)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid IN(SELECT oid FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace) AND tgenabled<>'O')
  OR (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY(SELECT generate_series(1,27))
 THEN RAISE EXCEPTION 'FRESH35_FINAL_SCHEMA_SHAPE_DIFFERS' USING ERRCODE='55000'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements($fresh35_pins$${JSON.stringify(pins)}$fresh35_pins$::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure(item->>'signature') AND proowner=current_user::regrole::oid AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')=item->>'sha256')
  THEN RAISE EXCEPTION 'FRESH35_FINAL_ROUTINE_PIN_DIFFERS' USING ERRCODE='55000'; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements($fresh35_edges$${JSON.stringify(plan.foreignKeyReplacements)}$fresh35_edges$::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid WHERE t.relnamespace='naijue_erp'::regnamespace AND t.relname=item->>'table' AND c.conname=item->>'check' AND c.contype='c' AND c.convalidated AND NOT c.connoinherit AND pg_catalog.pg_get_constraintdef(c.oid)=format('CHECK ((%I IS NULL))',item->>'column'))
  THEN RAISE EXCEPTION 'FRESH35_NULL_REFERENCE_CHECK_MISSING' USING ERRCODE='55000'; END IF;
 END LOOP;
 FOR relation IN SELECT * FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind='r' AND relname<>'schema_migration' LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',relation.relname) INTO populated;
  IF populated THEN RAISE EXCEPTION 'FRESH35_BUSINESS_TABLE_NOT_EMPTY' USING ERRCODE='55000'; END IF;
 END LOOP;
END $fresh35_installed$;\n`;
 const sql='\\set ON_ERROR_STOP on\nBEGIN ISOLATION LEVEL READ COMMITTED;\nSET LOCAL search_path=pg_catalog,pg_temp;\n'+targetGuard+effectiveSchemaSql+'\nSET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;\nSET LOCAL row_security=off;\n'+lineage.sql+postconditions+completePostconditions.sql+'COMMIT;\n';
 const rendererPath='scripts/release/unified-install/fresh35-retirement-install.mjs',rendererSha256=hash(await readFile(resolve(root,rendererPath)));
 const identityMapperPath='scripts/release/unified-install/fresh35-retirement-identity.mjs',identityMapperSha256=hash(await readFile(resolve(root,identityMapperPath)));
 const installationSources=await loadFresh35InstallationSourcePins(root,plan),installationSourcePins=installationSources.pins;
 return {format:'FRESH35_SYNTHETIC_ATOMIC_INSTALL_SOURCE_V1',sql,sha256:hash(sql),schemaSha256:hash(effectiveSchemaSql),unmappedSchemaSha256:schema.sha256,identityMapping:mapped?{...mapped,sql:undefined}:null,identityMapperPath,identityMapperSha256,sourceSetSha256:plan.sourceSetSha256,rendererPath,rendererSha256,target:{...target},lineage:lineage.rows,
  installationSourcePins,installationSourceSetSha256:installationSources.sha256,postconditions:{sha256:completePostconditions.sha256,sourceSchemaSha256:completePostconditions.sourceSchemaSha256,completeMetadataGuardSource:true,predecessorEvidencePins:evidence.pins},
  tableCount:35,routineCount:152,connectionsOpened:0,engineVerified:false,installationReady:false,existingDataMigrationSupported:false,
  remaining:['COMPLETE_GUARD_SOURCE_REVIEW_AND_PG_VALIDATION','AUTHORIZED_NEW35_TARGET_EXECUTION','DISTINCT152_CATALOG_ACL_RECORD_AND_HOST','FULL_IMPORT_REPLAY_ROLLBACK_AND_ORDINARY_BUSINESS_ACCEPTANCE']};
}
