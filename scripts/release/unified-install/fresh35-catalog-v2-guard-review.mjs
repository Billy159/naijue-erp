/** Offline, UNREVIEWED catalog comparison source for one selected V2 capture.
 * The only rendered SQL always raises before any model assignment or catalog
 * access. It is not an executable installation guard, registration or approval.
 * Captured code and this later renderer remain separately identified. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {requireFresh35EvidenceV2Analysis,assertFresh35EvidenceV2AnalysisCurrent} from './fresh35-catalog-evidence-v2-adapter.mjs';
import {buildFresh35V2SourceProjection} from './fresh35-retirement-v2-projection.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_V2_GUARD_REVIEW_'+code);};
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const without=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key)));
const sourcePath='scripts/release/unified-install/fresh35-catalog-v2-guard-review.mjs';
const loadedSourceSha256=hash(await readFile(new URL(import.meta.url)));
const ownPin=Object.freeze({path:sourcePath,sha256:loadedSourceSha256});
const disabled=Object.freeze({reviewedEvidenceRegistered:false,independentSafetyReviewComplete:false,
 executionProvenanceAuthenticated:false,catalogMetadataComplete:false,engineDependenciesVerified:false,
 engineVerified:false,executionAuthorized:false,installationReady:false,targetAdmitted:false,hostEnabled:false,
 existingTargetMutation:false,existingDataMigrationSupported:false,oldTablesRemoved:false,
 sqlParsedByPostgres:false,sqlExecutedByPostgres:false,guardReviewCodeRanDuringCapture:false});

async function ownSource(root){need(typeof root==='string'&&hash(await readFile(resolve(root,sourcePath)))===loadedSourceSha256,'RUNNING_RENDERER_SOURCE_DIFFERS');}
async function checkPins(root,pins){for(const pin of pins)need(hash(await readFile(resolve(root,pin.path)))===pin.sha256,'SOURCE_PIN_DIFFERS:'+pin.path);}

// Snapshot only ordinary data properties, before crossing asynchronous checks.
// Extra arguments cannot supply a model, approval flag or barrier switch.
function snapshotMapping(value){
 function fields(object,keys){
  need(object&&Object.getPrototypeOf(object)===Object.prototype,'IDENTITY_MAPPING_DATA_REQUIRED');
  const descriptors=Object.getOwnPropertyDescriptors(object);
  const names=Reflect.ownKeys(descriptors);
  need(names.every(key=>typeof key==='string')&&names.sort().join(',')===keys.sort().join(',')&&keys.every(key=>descriptors[key].enumerable&&Object.hasOwn(descriptors[key],'value')),'IDENTITY_MAPPING_DATA_REQUIRED');
  return Object.fromEntries(keys.map(key=>[key,descriptors[key].value]));
 }
 const mapping=fields(value,['owner','controller']);
 for(const kind of ['owner','controller']){
  mapping[kind]=fields(mapping[kind],['source','target']);
  need(typeof mapping[kind].source==='string'&&typeof mapping[kind].target==='string','IDENTITY_MAPPING_DATA_REQUIRED');
 }
 return freeze(mapping);
}

function expectedModel(analysis,projection){
 const metadata=projection.metadata,core=projection.model;
 const relations=new Map(analysis.inventory.relations.map(row=>[row.relname,row]));
 const columns=metadata.columns.map(column=>{
  const relation=relations.get(column.table);
  const matches=analysis.inventory.columns.filter(row=>String(row.attrelid)===String(relation?.oid)&&row.attnum===column.ordinal);
  const prior=matches[0];
  need(matches.length===1&&prior.attname===column.name&&!prior.attisdropped,'COLUMN_SOURCE_DIFFERS');
  // Fresh CREATE TABLE has no predecessor fast-default missing-value storage.
  const attributes=without(prior,['attrelid','atttypid','attcollation','attacl']);
  attributes.atthasmissing=false;attributes.attmissingval=null;
  return {...without(column,['typeSql']),metadata:attributes};
 });
 const sequences=metadata.sequences.map(sequence=>without(sequence,['dataType','parameterResolution']));
 const policies=metadata.policies.map(policy=>({...policy,roles:[...policy.roles].sort()}));
 // These semantic rows are derived declarations, NOT captured pg_type rows.
 // No unobserved pg_type storage/procedure/default properties are invented.
 const rowtypes=metadata.tables.flatMap(table=>[
  {schema:table.schema,name:table.name,owner:table.owner,acl:null,kind:'c',category:'C',table:table.name,element:null,array:'_'+table.name},
  {schema:table.schema,name:'_'+table.name,owner:table.owner,acl:null,kind:'b',category:'A',table:table.name,element:table.name,array:null},
 ]);
 need(rowtypes.length===70&&new Set(rowtypes.map(row=>row.schema+'.'+row.name)).size===70,'ROWTYPE_DECLARATION_COHORT_DIFFERS');
 need(analysis.inventory.default_acl===null||Array.isArray(analysis.inventory.default_acl)&&analysis.inventory.default_acl.length===0,'UNSUPPORTED_DEFAULT_ACL');
 return freeze({...core,tables:metadata.tables,columns,sequences,policies,rowtypes,defaultAcls:[],
  rowtypeEvidence:'DERIVED_FROM_TABLE_DECLARATIONS',
  rowtypeScope:'Exact declared schema/name/owner/ACL/kind/category and bidirectional table/element/array relationships; not full captured pg_type properties',
  missingEvidence:['RAW_PG_TYPE_ROWS_AND_UNMODELED_TYPE_PROPERTIES','AUTHORIZED_NEW35_TARGET_CATALOG_AND_ENGINE_DEPENDENCIES'],
  compiledSchemaSha256:projection.unmappedSqlSha256,mappedSchemaSha256:projection.sqlSha256});
}

const aclSql=expression=>`CASE WHEN ${expression} IS NULL THEN NULL ELSE (SELECT pg_catalog.jsonb_agg(acl_entry::pg_catalog.text ORDER BY acl_entry::pg_catalog.text COLLATE pg_catalog."C") FROM pg_catalog.unnest(${expression}) AS acl_rows(acl_entry)) END`;
const tableSql=`pg_catalog.jsonb_build_object('schema',ns.nspname,'name',r.relname,'owner',o.rolname,'columnCount',r.relnatts,'rowSecurity',r.relrowsecurity,'forceRowSecurity',r.relforcerowsecurity)`;
const columnSql=`pg_catalog.jsonb_build_object('schema',ns.nspname,'table',r.relname,'name',a.attname,'ordinal',a.attnum,'typeSchema',CASE WHEN t.typcategory='A' THEN en.nspname ELSE tn.nspname END,'typeName',CASE WHEN t.typcategory='A' THEN element.typname ELSE t.typname END,'typeModifier',a.atttypmod,'arrayDimensions',a.attndims,'notNull',a.attnotnull,'defaultExpression',CASE WHEN a.attgenerated='' THEN pg_catalog.pg_get_expr(d.adbin,d.adrelid,false) ELSE NULL END,'generatedExpression',CASE WHEN a.attgenerated<>'' THEN pg_catalog.pg_get_expr(d.adbin,d.adrelid,false) ELSE NULL END,'generated',a.attgenerated,'identity',a.attidentity,'collation',CASE WHEN a.attcollation=t.typcollation THEN NULL ELSE pg_catalog.jsonb_build_object('schema',cn.nspname,'name',coll.collname) END,'metadata',pg_catalog.to_jsonb(a)-ARRAY['attrelid','atttypid','attcollation','attacl'])`;
const sequenceSql=`pg_catalog.jsonb_build_object('schema',ns.nspname,'name',r.relname,'owner',o.rolname,'typeSchema',tn.nspname,'typeName',t.typname,'start',s.seqstart::pg_catalog.text,'increment',s.seqincrement::pg_catalog.text,'min',s.seqmin::pg_catalog.text,'max',s.seqmax::pg_catalog.text,'cache',s.seqcache::pg_catalog.text,'cycle',s.seqcycle,'ownedBy',(SELECT pg_catalog.jsonb_build_object('schema',dn.nspname,'table',dr.relname,'column',da.attname) FROM pg_catalog.pg_depend dep JOIN pg_catalog.pg_class dr ON dr.oid=dep.refobjid JOIN pg_catalog.pg_namespace dn ON dn.oid=dr.relnamespace JOIN pg_catalog.pg_attribute da ON da.attrelid=dr.oid AND da.attnum=dep.refobjsubid WHERE dep.classid='pg_catalog.pg_class'::pg_catalog.regclass AND dep.objid=s.seqrelid AND dep.refclassid='pg_catalog.pg_class'::pg_catalog.regclass AND dep.deptype IN('a','i')))`;
const policySql=`pg_catalog.jsonb_build_object('schema',ns.nspname,'table',r.relname,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT pg_catalog.jsonb_agg(role_name ORDER BY role_name COLLATE pg_catalog."C") FROM (SELECT CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE roles.rolname END AS role_name FROM pg_catalog.unnest(p.polroles) AS role_oids(role_oid) LEFT JOIN pg_catalog.pg_roles roles ON roles.oid=role_oid) names),'usingExpression',pg_catalog.pg_get_expr(p.polqual,p.polrelid,false),'withCheckExpression',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false))`;
const constraintSql=`pg_catalog.jsonb_build_object('relation',r.relname,'name',c.conname,'definition',pg_catalog.pg_get_constraintdef(c.oid,false),'kind',c.contype,'validated',c.convalidated,'deferrable',c.condeferrable,'initiallyDeferred',c.condeferred,'noInherit',c.connoinherit,'local',c.conislocal,'inheritCount',c.coninhcount,'referencedRelation',rr.relname,'index',ix.relname,'columns',c.conkey,'referencedColumns',c.confkey,'deleteAction',c.confdeltype,'updateAction',c.confupdtype,'matchType',c.confmatchtype,'deleteColumns',c.confdelsetcols)`;
const indexSql=`pg_catalog.jsonb_build_object('relation',r.relname,'index',ix.relname,'definition',pg_catalog.pg_get_indexdef(i.indexrelid),'metadata',pg_catalog.to_jsonb(i)-ARRAY['indrelid','indexrelid','indclass','indcollation','indexprs','indpred'])`;
const relationSql=`pg_catalog.jsonb_build_object('relation',r.relname,'owner',o.rolname,'acl',${aclSql('r.relacl')},'accessMethod',am.amname,'metadata',pg_catalog.to_jsonb(r)-ARRAY['oid','relam','relacl','reltype','relowner','relpages','reltuples','relminmxid','relfilenode','relfrozenxid','relnamespace','reltablespace','reltoastrelid','relallvisible','relallfrozen','reloftype','relrewrite'])`;
const columnAclSql=`pg_catalog.jsonb_build_object('relation',r.relname,'column',a.attname,'number',a.attnum,'acl',${aclSql('a.attacl')})`;
const triggerSql=`pg_catalog.jsonb_build_object('relation',r.relname,'name',CASE WHEN t.tgisinternal THEN '<INTERNAL>' ELSE t.tgname END,'definition',CASE WHEN t.tgisinternal THEN pg_catalog.regexp_replace(pg_catalog.pg_get_triggerdef(t.oid,false),'^CREATE CONSTRAINT TRIGGER "(RI_ConstraintTrigger_[ac]_[0-9]+|Unique_ConstraintTrigger_[0-9]+)" ','CREATE CONSTRAINT TRIGGER "<INTERNAL>" ') ELSE pg_catalog.pg_get_triggerdef(t.oid,false) END,'constraint',CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.jsonb_build_array(cr.relname,c.conname) END,'constraintIndex',ix.relname,'constraintRelation',rr.relname,'metadata',pg_catalog.to_jsonb(t)-ARRAY['oid','tgname','tgfoid','tgrelid','tgparentid','tgconstraint','tgconstrindid','tgconstrrelid','tgqual'])`;
const rowtypeSql=`pg_catalog.jsonb_build_object('schema',ns.nspname,'name',t.typname,'owner',o.rolname,'acl',${aclSql('t.typacl')},'kind',t.typtype,'category',t.typcategory,'table',CASE WHEN t.typtype='c' AND t.typelem=0 THEN r.relname WHEN t.typtype='b' AND t.typcategory='A' AND t.typrelid=0 THEN er.relname ELSE '<UNRESOLVED>' END,'element',CASE WHEN t.typelem=0 THEN NULL WHEN e.oid IS NOT NULL THEN e.typname ELSE '<UNRESOLVED>' END,'array',CASE WHEN t.typarray=0 THEN NULL WHEN at.oid IS NOT NULL THEN at.typname ELSE '<UNRESOLVED>' END)`;
const defaultAclSql=`pg_catalog.jsonb_build_object('owner',o.rolname,'schema',ns.nspname,'kind',d.defaclobjtype,'acl',${aclSql('d.defaclacl')})`;

// Compare full rows as multisets, including duplicates. Avoid a SQL alias named
// item: PL/pgSQL loop variables can conflict with unqualified column aliases.
function compareCollection(label,expression,from,where){return `SELECT coalesce(pg_catalog.jsonb_agg(observed.entry ORDER BY observed.entry::pg_catalog.text COLLATE pg_catalog."C"),'[]'::pg_catalog.jsonb) INTO actual FROM (SELECT ${expression} AS entry ${from} WHERE ${where}) observed;
 SELECT coalesce(pg_catalog.jsonb_agg(declared.value ORDER BY declared.value::pg_catalog.text COLLATE pg_catalog."C"),'[]'::pg_catalog.jsonb) INTO expected FROM pg_catalog.jsonb_array_elements(model->'${label}') AS declared(value);
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FRESH35_V2_REVIEW_${label.toUpperCase()}_DIFFER' USING ERRCODE='55000'; END IF;
`;}

// Private renderer: there is deliberately no comparison-only return/export and
// no option that can suppress the first exception. All text is one DO statement.
function renderBlockedReview(model){
 const json=JSON.stringify(model);
 need(!json.includes('$fresh35_v2_guard_review$')&&!json.includes('$fresh35_v2_model$'),'MODEL_DELIMITER_COLLISION');
 return `DO $fresh35_v2_guard_review$
DECLARE model pg_catalog.jsonb; routine_item pg_catalog.jsonb; actual pg_catalog.jsonb; expected pg_catalog.jsonb;
BEGIN
 RAISE EXCEPTION 'FRESH35_V2_GUARD_REVIEW_NOT_AUTHORIZED' USING ERRCODE='55000';
 model := $fresh35_v2_model$${json}$fresh35_v2_model$::pg_catalog.jsonb;
 PERFORM pg_catalog.set_config('search_path','pg_catalog',true);
 PERFORM pg_catalog.set_config('quote_all_identifiers','off',true);
 IF pg_catalog.current_setting('search_path')<>'pg_catalog' OR pg_catalog.current_setting('quote_all_identifiers')<>'off' THEN RAISE EXCEPTION 'FRESH35_V2_REVIEW_DEPARSE_SETTINGS_DIFFER' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::pg_catalog.regnamespace AND (reltablespace<>0 OR reloftype<>0 OR relrewrite<>0)) OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE connamespace='naijue_erp'::pg_catalog.regnamespace AND (conparentid<>0 OR contypid<>0)) OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid WHERE r.relnamespace='naijue_erp'::pg_catalog.regnamespace AND t.tgparentid<>0) THEN RAISE EXCEPTION 'FRESH35_V2_REVIEW_UNSUPPORTED_INHERITANCE_OR_STORAGE' USING ERRCODE='55000'; END IF;
 IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc WHERE pronamespace='naijue_erp'::pg_catalog.regnamespace)<>152 THEN RAISE EXCEPTION 'FRESH35_V2_REVIEW_ROUTINE_COHORT_DIFFERS' USING ERRCODE='55000'; END IF;
 FOR routine_item IN SELECT declared_routine.value FROM pg_catalog.jsonb_array_elements(model->'routines') AS declared_routine(value) LOOP
  SELECT pg_catalog.jsonb_build_object('definitionSha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',o.rolname,'acl',${aclSql('p.proacl')}) INTO actual FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles o ON o.oid=p.proowner WHERE p.oid=pg_catalog.to_regprocedure(routine_item->>'signature') AND p.pronamespace='naijue_erp'::pg_catalog.regnamespace;
  IF actual IS DISTINCT FROM routine_item-'signature' THEN RAISE EXCEPTION 'FRESH35_V2_REVIEW_ROUTINE_METADATA_DIFFERS' USING ERRCODE='55000'; END IF;
 END LOOP;
 SELECT pg_catalog.jsonb_build_object('name',n.nspname,'owner',o.rolname,'acl',${aclSql('n.nspacl')}) INTO actual FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles o ON o.oid=n.nspowner WHERE n.nspname='naijue_erp';
 IF actual IS DISTINCT FROM model->'schema' THEN RAISE EXCEPTION 'FRESH35_V2_REVIEW_SCHEMA_ACL_DIFFERS' USING ERRCODE='55000'; END IF;
 ${compareCollection('defaultAcls',defaultAclSql,'FROM pg_catalog.pg_default_acl d JOIN pg_catalog.pg_roles o ON o.oid=d.defaclrole LEFT JOIN pg_catalog.pg_namespace ns ON ns.oid=d.defaclnamespace',"d.defaclnamespace='naijue_erp'::pg_catalog.regnamespace OR d.defaclrole=(SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp')")}
 ${compareCollection('relations',relationSql,'FROM pg_catalog.pg_class r JOIN pg_catalog.pg_roles o ON o.oid=r.relowner LEFT JOIN pg_catalog.pg_am am ON am.oid=r.relam',"r.relnamespace='naijue_erp'::pg_catalog.regnamespace")}
 ${compareCollection('columnAcls',columnAclSql,'FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class r ON r.oid=a.attrelid',"r.relnamespace='naijue_erp'::pg_catalog.regnamespace AND r.relkind='r' AND a.attnum>0")}
 ${compareCollection('constraints',constraintSql,'FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid LEFT JOIN pg_catalog.pg_class rr ON rr.oid=c.confrelid LEFT JOIN pg_catalog.pg_class ix ON ix.oid=c.conindid',"c.connamespace='naijue_erp'::pg_catalog.regnamespace")}
 ${compareCollection('indexes',indexSql,'FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class r ON r.oid=i.indrelid JOIN pg_catalog.pg_class ix ON ix.oid=i.indexrelid',"r.relnamespace='naijue_erp'::pg_catalog.regnamespace")}
 ${compareCollection('triggers',triggerSql,'FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid LEFT JOIN pg_catalog.pg_constraint c ON c.oid=t.tgconstraint LEFT JOIN pg_catalog.pg_class cr ON cr.oid=c.conrelid LEFT JOIN pg_catalog.pg_class ix ON ix.oid=t.tgconstrindid LEFT JOIN pg_catalog.pg_class rr ON rr.oid=t.tgconstrrelid',"r.relnamespace='naijue_erp'::pg_catalog.regnamespace")}
 PERFORM pg_catalog.set_config('quote_all_identifiers','on',true);
 IF pg_catalog.current_setting('quote_all_identifiers')<>'on' THEN RAISE EXCEPTION 'FRESH35_V2_REVIEW_DECLARED_DEPARSE_SETTINGS_DIFFER' USING ERRCODE='55000'; END IF;
 ${compareCollection('tables',tableSql,'FROM pg_catalog.pg_class r JOIN pg_catalog.pg_namespace ns ON ns.oid=r.relnamespace JOIN pg_catalog.pg_roles o ON o.oid=r.relowner',"ns.nspname='naijue_erp' AND r.relkind='r'")}
 ${compareCollection('columns',columnSql,'FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class r ON r.oid=a.attrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=r.relnamespace JOIN pg_catalog.pg_type t ON t.oid=a.atttypid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace LEFT JOIN pg_catalog.pg_type element ON element.oid=t.typelem LEFT JOIN pg_catalog.pg_namespace en ON en.oid=element.typnamespace LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=r.oid AND d.adnum=a.attnum LEFT JOIN pg_catalog.pg_collation coll ON coll.oid=a.attcollation LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid=coll.collnamespace',"ns.nspname='naijue_erp' AND r.relkind='r' AND a.attnum>0")}
 ${compareCollection('sequences',sequenceSql,'FROM pg_catalog.pg_sequence s JOIN pg_catalog.pg_class r ON r.oid=s.seqrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=r.relnamespace JOIN pg_catalog.pg_roles o ON o.oid=r.relowner JOIN pg_catalog.pg_type t ON t.oid=s.seqtypid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace',"ns.nspname='naijue_erp'")}
 ${compareCollection('policies',policySql,'FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class r ON r.oid=p.polrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=r.relnamespace',"ns.nspname='naijue_erp'")}
 ${compareCollection('rowtypes',rowtypeSql,"FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace ns ON ns.oid=t.typnamespace JOIN pg_catalog.pg_roles o ON o.oid=t.typowner LEFT JOIN pg_catalog.pg_class r ON r.oid=t.typrelid AND r.reltype=t.oid AND r.relnamespace=t.typnamespace AND r.relkind='r' LEFT JOIN pg_catalog.pg_type e ON e.oid=t.typelem AND e.typnamespace=t.typnamespace AND e.typtype='c' AND e.typarray=t.oid LEFT JOIN pg_catalog.pg_class er ON er.oid=e.typrelid AND er.reltype=e.oid AND er.relnamespace=t.typnamespace AND er.relkind='r' LEFT JOIN pg_catalog.pg_type at ON at.oid=t.typarray AND at.typelem=t.oid AND at.typnamespace=t.typnamespace AND at.typtype='b' AND at.typcategory='A'", "ns.nspname='naijue_erp'")}
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_operator WHERE oprnamespace='naijue_erp'::pg_catalog.regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_opclass WHERE opcnamespace='naijue_erp'::pg_catalog.regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_opfamily WHERE opfnamespace='naijue_erp'::pg_catalog.regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_collation WHERE collnamespace='naijue_erp'::pg_catalog.regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_conversion WHERE connamespace='naijue_erp'::pg_catalog.regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_rewrite w JOIN pg_catalog.pg_class r ON r.oid=w.ev_class WHERE r.relnamespace='naijue_erp'::pg_catalog.regnamespace) THEN RAISE EXCEPTION 'FRESH35_V2_REVIEW_UNDECLARED_SCHEMA_OBJECTS' USING ERRCODE='55000'; END IF;
END $fresh35_v2_guard_review$;
`;
}

/** Only genuine UNREVIEWED analyses are accepted, never caller-made models.
 * Both freshness boundaries and all 180 source pins are checked. Private brands
 * attest source construction only; no approval or target state follows. */
export async function buildFresh35V2CatalogGuardReview(root,analysis,identityMapping){
 requireFresh35EvidenceV2Analysis(analysis);
 need(arguments.length===3,'EXACT_ARGUMENTS_REQUIRED');
 const mapping=snapshotMapping(identityMapping);
 await ownSource(root);
 await assertFresh35EvidenceV2AnalysisCurrent(analysis);
 const projection=await buildFresh35V2SourceProjection(root,analysis,mapping);
 need(projection.sourcePins.length===179&&analysis.sourceBinding.sourcePins.length===177,'SOURCE_PIN_COHORT_DIFFERS');
 const pins=new Map(projection.sourcePins.map(pin=>[pin.path,pin.sha256]));
 need(!pins.has(sourcePath),'SOURCE_PIN_CONFLICT');pins.set(sourcePath,loadedSourceSha256);
 const sourcePins=[...pins].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,sha256])=>({path,sha256}));
 need(sourcePins.length===180,'SOURCE_PIN_COHORT_DIFFERS');
 await checkPins(root,sourcePins);
 const model=expectedModel(analysis,projection),guardReviewSql=renderBlockedReview(model);
 await ownSource(root);
 await assertFresh35EvidenceV2AnalysisCurrent(analysis);
 await checkPins(root,sourcePins);
 return freeze({format:'FRESH35_V2_CATALOG_GUARD_REVIEW_V1',state:'UNREVIEWED_BLOCKED_GUARD_SOURCE',analysisOnly:true,
  captureSourceBindingSha256:analysis.sourceBinding.sha256,captureSourcePins:analysis.sourceBinding.sourcePins,
  predecessorSourceSpecSha256:projection.predecessorSourceSpecSha256,retirementSourceSetSha256:projection.retirementSourceSetSha256,
  projectionSourceSetSha256:projection.projectionSourceSetSha256,guardReviewSourcePin:ownPin,
  sourcePins,guardReviewSourceSetSha256:hash(JSON.stringify(sourcePins)),
  sourceScope:'ORIGINAL_CAPTURE177_PLUS_ADAPTER_PROJECTION_GUARD_REVIEW_NOT_INSTALLATION_CANDIDATE_OR_WHOLE_REPOSITORY',
  inputEvidenceSha256Sums:analysis.selector.evidenceSha256Sums,inputManifestSha256:projection.inputManifestSha256,
  inputDumpSha256:projection.inputDumpSha256,artifactPins:analysis.artifactPins,evidencePins:analysis.evidencePins,
  identityMapping:mapping,model,modelSha256:hash(JSON.stringify(model)),guardReviewSql,guardReviewSqlSha256:hash(guardReviewSql),
  ...disabled,
  remaining:['INDEPENDENT_V2_EVIDENCE_AND_SAFETY_REVIEW','COMPLETE_TYPE_AND_DEPENDENCY_EVIDENCE','EXPLICIT_REVIEWED_PROFILE_AND_EXECUTABLE_GUARD_AUTHORIZATION','AUTHORIZED_NEW35_TARGET_INSTALLATION_AND_POSTGRES_CATALOG_CHECKS','FULL_PACKAGE_REPLAY_ROLLBACK_AND_ORDINARY_BUSINESS_ACCEPTANCE']});
}
