import {derivePerformance155} from './performance155/derive155.mjs';
import {applyFresh35Sql39CatalogDelta} from './fresh35-sql39-catalog-delta.mjs';
/** Independent additive successor catalog compiler. Existing blocked review SQL
 * remains unchanged. This module only generates checks; native installation
 * separately requires the fixed protected authorization and exact target. */
import {readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {describeFresh35CombinedSource,fresh35CombinedSourceData,fresh35Admin154SourceData,fresh35CompactZeroSourceData,assertFresh35CombinedSourcesCurrent,combinedSha256 as hash} from './fresh35-combined-source-v1.mjs';
import {describeFresh35CombinedTarget,fresh35CombinedRuntimeTargetGuard,loadFresh35SyntheticBootstrapNetwork,assertFresh35SyntheticBootstrapNetworkCurrent,fresh35CombinedObserverCheck,fresh35CombinedObserverObservationSql,validateFresh35CombinedObserverObservation,fresh35Installed154UpgradeTargetData} from './fresh35-combined-target-v1.mjs';
import {parseFresh35DumpSections} from './fresh35-retirement-schema.mjs';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
const catalogs=new WeakMap(),need=(ok,code)=>{if(!ok)throw Error('FRESH35_COMBINED_CATALOG_'+code)};
const q=s=>"'"+s.replaceAll("'","''")+"'";
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
const normal=s=>s.replaceAll('pg_catalog.','').replace(/\btimestamp with time zone\b/g,'timestamptz').replace(/\binteger\b/g,'int4').replace(/\bboolean\b/g,'bool').replace(/\bbigint\b/g,'int8').replace(/\s*,\s*/g,',');
const name=s=>s.slice(s.indexOf('.')+1,s.indexOf('('));
const MODEL_SHA='2469ff8fb09dfe06c4992e31f8fa5aa85f462fae20d0c5490cee3082a921e28f';
const FUNCTIONS_SHA='9959bca2dd4d91d3fb1ba7558c5abdd0b70676b096eaf73c4dd117261534551f';
const ownPath='scripts/release/unified-install/fresh35-combined-catalog-v1.mjs',ownHash=hash(await readFile(new URL(import.meta.url)));
async function pinned(path,sha){need(await realpath(path)===path,'CANONICAL_EVIDENCE_PATH_REQUIRED');const bytes=await readFile(path);need(bytes.length>0&&bytes.length<8*1024*1024&&hash(bytes)===sha,'IMMUTABLE_EVIDENCE_DIFFERS');return JSON.parse(bytes.toString('utf8'))}
function body(text){const all=[...text.matchAll(/\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)([\s\S]*?)\1/g)];need(all.length===1,'EXACT_ROUTINE_BODY_REQUIRED');return all[0][2]}
function replacement(text,before,after){need(text.split(before).length===2,'UNIQUE_FUNCTION_BODY_REQUIRED');return text.replace(before,()=>after)}
function remap(value,roles){
 if(Array.isArray(value))return value.map(x=>remap(x,roles));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>{
  const mapped=remap(v,roles);
  // Role renaming changes ACL text order; match the unchanged SQL COLLATE C.
  return [k,k==='acl'&&Array.isArray(mapped)?mapped.sort((a,b)=>a<b?-1:a>b?1:0):mapped];
 }));
 if(typeof value!=='string')return value;
 if(Object.hasOwn(roles,value))return roles[value];
 const acl=value.match(/^([^=]*)=([^/]*)\/(.+)$/);if(acl)return (roles[acl[1]]??acl[1])+'='+acl[2]+'/'+(roles[acl[3]]??acl[3]);
 return value;
}

// Catalog expressions are source-level comparison primitives, not a stripped review entry.
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

const categories=[
 ['defaultAcls',defaultAclSql,'pg_catalog.pg_default_acl d JOIN pg_catalog.pg_roles o ON o.oid=d.defaclrole LEFT JOIN pg_catalog.pg_namespace ns ON ns.oid=d.defaclnamespace',"d.defaclnamespace='naijue_erp'::regnamespace OR d.defaclrole=(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp')",false],
 ['relations',relationSql,'pg_catalog.pg_class r JOIN pg_catalog.pg_roles o ON o.oid=r.relowner LEFT JOIN pg_catalog.pg_am am ON am.oid=r.relam',"r.relnamespace='naijue_erp'::regnamespace",false],
 ['columnAcls',columnAclSql,'pg_catalog.pg_attribute a JOIN pg_catalog.pg_class r ON r.oid=a.attrelid',"r.relnamespace='naijue_erp'::regnamespace AND r.relkind='r' AND a.attnum>0",false],
 ['constraints',constraintSql,'pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid LEFT JOIN pg_catalog.pg_class rr ON rr.oid=c.confrelid LEFT JOIN pg_catalog.pg_class ix ON ix.oid=c.conindid',"c.connamespace='naijue_erp'::regnamespace",false],
 ['indexes',indexSql,'pg_catalog.pg_index i JOIN pg_catalog.pg_class r ON r.oid=i.indrelid JOIN pg_catalog.pg_class ix ON ix.oid=i.indexrelid',"r.relnamespace='naijue_erp'::regnamespace",false],
 ['triggers',triggerSql,'pg_catalog.pg_trigger t JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid LEFT JOIN pg_catalog.pg_constraint c ON c.oid=t.tgconstraint LEFT JOIN pg_catalog.pg_class cr ON cr.oid=c.conrelid LEFT JOIN pg_catalog.pg_class ix ON ix.oid=t.tgconstrindid LEFT JOIN pg_catalog.pg_class rr ON rr.oid=t.tgconstrrelid',"r.relnamespace='naijue_erp'::regnamespace",false],
 ['tables',tableSql,'pg_catalog.pg_class r JOIN pg_catalog.pg_namespace ns ON ns.oid=r.relnamespace JOIN pg_catalog.pg_roles o ON o.oid=r.relowner',"ns.nspname='naijue_erp' AND r.relkind='r'",true],
 ['columns',columnSql,'pg_catalog.pg_attribute a JOIN pg_catalog.pg_class r ON r.oid=a.attrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=r.relnamespace JOIN pg_catalog.pg_type t ON t.oid=a.atttypid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace LEFT JOIN pg_catalog.pg_type element ON element.oid=t.typelem LEFT JOIN pg_catalog.pg_namespace en ON en.oid=element.typnamespace LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=r.oid AND d.adnum=a.attnum LEFT JOIN pg_catalog.pg_collation coll ON coll.oid=a.attcollation LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid=coll.collnamespace',"ns.nspname='naijue_erp' AND r.relkind='r' AND a.attnum>0",true],
 ['sequences',sequenceSql,'pg_catalog.pg_sequence s JOIN pg_catalog.pg_class r ON r.oid=s.seqrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=r.relnamespace JOIN pg_catalog.pg_roles o ON o.oid=r.relowner JOIN pg_catalog.pg_type t ON t.oid=s.seqtypid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace',"ns.nspname='naijue_erp'",true],
 ['policies',policySql,'pg_catalog.pg_policy p JOIN pg_catalog.pg_class r ON r.oid=p.polrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=r.relnamespace',"ns.nspname='naijue_erp'",true],
 ['rowtypes',rowtypeSql,"pg_catalog.pg_type t JOIN pg_catalog.pg_namespace ns ON ns.oid=t.typnamespace JOIN pg_catalog.pg_roles o ON o.oid=t.typowner LEFT JOIN pg_catalog.pg_class r ON r.oid=t.typrelid AND r.reltype=t.oid AND r.relnamespace=t.typnamespace AND r.relkind='r' LEFT JOIN pg_catalog.pg_type e ON e.oid=t.typelem AND e.typnamespace=t.typnamespace AND e.typtype='c' AND e.typarray=t.oid LEFT JOIN pg_catalog.pg_class er ON er.oid=e.typrelid AND er.reltype=e.oid AND er.relnamespace=t.typnamespace AND er.relkind='r' LEFT JOIN pg_catalog.pg_type at ON at.oid=t.typarray AND at.typelem=t.oid AND at.typnamespace=t.typnamespace AND at.typtype='b' AND at.typcategory='A'","ns.nspname='naijue_erp'",true],
];
const owned=`SELECT 'pg_catalog.pg_class'::regclass AS classid,oid AS objid FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace
 UNION SELECT 'pg_catalog.pg_proc'::regclass,oid FROM pg_catalog.pg_proc WHERE pronamespace='naijue_erp'::regnamespace
 UNION SELECT 'pg_catalog.pg_type'::regclass,oid FROM pg_catalog.pg_type WHERE typnamespace='naijue_erp'::regnamespace
 UNION SELECT 'pg_catalog.pg_namespace'::regclass,'naijue_erp'::regnamespace
 UNION SELECT 'pg_catalog.pg_constraint'::regclass,oid FROM pg_catalog.pg_constraint WHERE connamespace='naijue_erp'::regnamespace
 UNION SELECT 'pg_catalog.pg_trigger'::regclass,t.oid FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid WHERE r.relnamespace='naijue_erp'::regnamespace
 UNION SELECT 'pg_catalog.pg_attrdef'::regclass,d.oid FROM pg_catalog.pg_attrdef d JOIN pg_catalog.pg_class r ON r.oid=d.adrelid WHERE r.relnamespace='naijue_erp'::regnamespace
 UNION SELECT 'pg_catalog.pg_policy'::regclass,p.oid FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class r ON r.oid=p.polrelid WHERE r.relnamespace='naijue_erp'::regnamespace`;
function compare([label,expression,from,where,quoted]){return `PERFORM pg_catalog.set_config('quote_all_identifiers',${q(quoted?'on':'off')},true);
 SELECT coalesce(jsonb_agg(v ORDER BY v::text COLLATE "C"),'[]'::jsonb) INTO actual FROM (SELECT ${expression} AS v FROM ${from} WHERE ${where}) observed;
 SELECT coalesce(jsonb_agg(v ORDER BY v::text COLLATE "C"),'[]'::jsonb) INTO expected FROM jsonb_array_elements(model->${q(label)}) AS declared(v);
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FRESH35_COMBINED_${label.toUpperCase()}_DIFFER' USING ERRCODE='55000'; END IF;`}
function guardSql(model,lineage,target,{requireEmpty=true}={}){
 const json=JSON.stringify(model),rows=JSON.stringify(lineage.map(({version,description})=>({version,description})));
 need(!json.includes('$combined_model$'),'MODEL_DELIMITER_COLLISION');
 return `DO $fresh35_combined_catalog$
 DECLARE model jsonb:=$combined_model$${json}$combined_model$::jsonb; item jsonb; actual jsonb; expected jsonb; populated boolean; relation record; composite_template jsonb; array_template jsonb;
 BEGIN
 ${fresh35CombinedObserverCheck(target)}
 PERFORM pg_catalog.set_config('search_path','pg_catalog',true);
 PERFORM pg_catalog.set_config('quote_all_identifiers','off',true);
 IF pg_catalog.current_setting('server_version_num')<>'170011' OR (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>${model.routines.length} THEN RAISE EXCEPTION 'FRESH35_COMBINED_ROUTINE_COHORT_DIFFERS'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(model->'routines') LOOP
  SELECT jsonb_build_object('definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'bodySha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'owner',o.rolname,'acl',${aclSql('p.proacl')}) INTO actual FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles o ON o.oid=p.proowner WHERE p.oid=to_regprocedure(item->>'signature') AND p.pronamespace='naijue_erp'::regnamespace;
  IF actual IS DISTINCT FROM item-'signature' THEN RAISE EXCEPTION 'FRESH35_COMBINED_ROUTINE_SOURCE_OR_ACL_DIFFERS'; END IF;
 END LOOP;
 SELECT jsonb_build_object('name',n.nspname,'owner',o.rolname,'acl',${aclSql('n.nspacl')}) INTO actual FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles o ON o.oid=n.nspowner WHERE n.nspname='naijue_erp';
 IF actual IS DISTINCT FROM model->'schema' THEN RAISE EXCEPTION 'FRESH35_COMBINED_SCHEMA_ACL_DIFFERS'; END IF;
 ${categories.map(compare).join('\n')}
 -- Missing predecessor pg_type rows are not invented. Compare ALL nonidentity
 -- fields with the server's native table-composite and array templates, then
 -- the exact70 identity/owner/ACL relationships above close the removed fields.
 SELECT to_jsonb(t)-ARRAY['oid','typname','typnamespace','typowner','typrelid','typarray'] INTO composite_template FROM pg_catalog.pg_type t WHERE t.oid='pg_catalog.pg_class'::regtype;
 SELECT to_jsonb(t)-ARRAY['oid','typname','typnamespace','typowner','typelem'] INTO array_template FROM pg_catalog.pg_type t WHERE t.oid=(SELECT typarray FROM pg_catalog.pg_type WHERE oid='pg_catalog.pg_class'::regtype);
 IF composite_template IS NULL OR array_template IS NULL OR EXISTS(SELECT 1 FROM pg_catalog.pg_type t WHERE t.typnamespace='naijue_erp'::regnamespace AND CASE WHEN t.typtype='c' THEN (to_jsonb(t)-ARRAY['oid','typname','typnamespace','typowner','typrelid','typarray']) IS DISTINCT FROM composite_template ELSE (to_jsonb(t)-ARRAY['oid','typname','typnamespace','typowner','typelem']) IS DISTINCT FROM array_template END)
 THEN RAISE EXCEPTION 'FRESH35_COMBINED_RAW_ROWTYPE_TEMPLATE_DIFFERS'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND (reltablespace<>0 OR reloftype<>0 OR relrewrite<>0)) OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE connamespace='naijue_erp'::regnamespace AND (conparentid<>0 OR contypid<>0)) OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid WHERE r.relnamespace='naijue_erp'::regnamespace AND t.tgparentid<>0) THEN RAISE EXCEPTION 'FRESH35_COMBINED_UNSUPPORTED_OBJECT_INHERITANCE'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_operator WHERE oprnamespace='naijue_erp'::regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_opclass WHERE opcnamespace='naijue_erp'::regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_opfamily WHERE opfnamespace='naijue_erp'::regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_collation WHERE collnamespace='naijue_erp'::regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_conversion WHERE connamespace='naijue_erp'::regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_rewrite w JOIN pg_catalog.pg_class r ON r.oid=w.ev_class WHERE r.relnamespace='naijue_erp'::regnamespace) THEN RAISE EXCEPTION 'FRESH35_COMBINED_UNDECLARED_OBJECTS'; END IF;
 -- pg_identify_object quotes its schema field; restore the raw-name comparison context.
 PERFORM pg_catalog.set_config('quote_all_identifiers','off',true);
 IF EXISTS(WITH objects AS (${owned}) SELECT 1 FROM pg_catalog.pg_depend d JOIN objects o ON o.classid=d.classid AND o.objid=d.objid CROSS JOIN LATERAL pg_catalog.pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid) ref WHERE (ref.schema IS NOT NULL AND ref.schema NOT IN('pg_catalog','naijue_erp','pg_toast')) OR (d.refclassid='pg_catalog.pg_namespace'::regclass AND d.refobjid NOT IN('pg_catalog'::regnamespace,'naijue_erp'::regnamespace,'pg_toast'::regnamespace))) THEN RAISE EXCEPTION 'FRESH35_COMBINED_EXTERNAL_DEPENDENCY'; END IF;
 SELECT jsonb_agg(jsonb_build_object('version',version,'description',description) ORDER BY version) INTO actual FROM naijue_erp.schema_migration;
 IF actual IS DISTINCT FROM ${q(rows)}::jsonb THEN RAISE EXCEPTION 'FRESH35_COMBINED_EXACT_LINEAGE_DIFFERS'; END IF;
 ${requireEmpty?` FOR relation IN SELECT relname FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind='r' AND relname<>'schema_migration' LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',relation.relname) INTO populated;
  IF populated THEN RAISE EXCEPTION 'FRESH35_COMBINED_BUSINESS_TABLE_NOT_EMPTY'; END IF;
 END LOOP;`:''}
 PERFORM pg_catalog.set_config('quote_all_identifiers','off',true);
 END $fresh35_combined_catalog$;`;
}
const raw=(expression,from,where)=>`(SELECT coalesce(jsonb_agg(${expression}),'[]'::jsonb) FROM ${from} WHERE ${where})`;
function observationSql(source,{runtime=false,systemIdentifierExpression='(SELECT system_identifier::text FROM pg_catalog.pg_control_system())'}={}){return `WITH objects AS (${owned}) SELECT jsonb_build_object(
 'format','FRESH35_COMBINED_ACTUAL_CATALOG_V1','sourceSetSha256',${q(source.sourceSetSha256)},
 'identity',jsonb_build_object('systemIdentifier',${systemIdentifierExpression},'databaseOid',(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()),'database',current_database(),'owner',${runtime?'(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())':'current_user'},'actor',session_user,'serverVersionNum',current_setting('server_version_num'),'host',host(inet_server_addr()),'port',inet_server_port()),
 'catalog',jsonb_build_object(
 'relations',${raw('to_jsonb(r)','pg_catalog.pg_class r',"r.relnamespace='naijue_erp'::regnamespace")},
 'columns',${raw('to_jsonb(a)','pg_catalog.pg_attribute a JOIN pg_catalog.pg_class r ON r.oid=a.attrelid',"r.relnamespace='naijue_erp'::regnamespace")},
 'routines',${raw("jsonb_build_object('identity',pg_catalog.pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'catalog',to_jsonb(p))",'pg_catalog.pg_proc p',"p.pronamespace='naijue_erp'::regnamespace")},
 'types',${raw('to_jsonb(t)','pg_catalog.pg_type t',"t.typnamespace='naijue_erp'::regnamespace")},
 'constraints',${raw('to_jsonb(c)','pg_catalog.pg_constraint c',"c.connamespace='naijue_erp'::regnamespace")},
 'indexes',${raw('to_jsonb(i)','pg_catalog.pg_index i JOIN pg_catalog.pg_class r ON r.oid=i.indexrelid',"r.relnamespace='naijue_erp'::regnamespace")},
 'triggers',${raw('to_jsonb(t)','pg_catalog.pg_trigger t JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid',"r.relnamespace='naijue_erp'::regnamespace")},
 'sequences',${raw('to_jsonb(s)','pg_catalog.pg_sequence s JOIN pg_catalog.pg_class r ON r.oid=s.seqrelid',"r.relnamespace='naijue_erp'::regnamespace")},
 'policies',${raw('to_jsonb(p)','pg_catalog.pg_policy p JOIN pg_catalog.pg_class r ON r.oid=p.polrelid',"r.relnamespace='naijue_erp'::regnamespace")},
 'defaultAcl',${raw('to_jsonb(d)','pg_catalog.pg_default_acl d',"d.defaclnamespace='naijue_erp'::regnamespace OR d.defaclrole=(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp')")},
 'dependencies',${raw('to_jsonb(d)','pg_catalog.pg_depend d JOIN objects o ON o.classid=d.classid AND o.objid=d.objid','true')},
 'sharedDependencies',${raw('to_jsonb(d)','pg_catalog.pg_shdepend d JOIN objects o ON o.classid=d.classid AND o.objid=d.objid',"d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database())")},
 'schema',${raw('to_jsonb(n)','pg_catalog.pg_namespace n',"n.nspname='naijue_erp'")},
 'database',${raw('to_jsonb(d)','pg_catalog.pg_database d','d.datname=current_database()')},
 'roles',${raw("to_jsonb(r)-'rolpassword'",'pg_catalog.pg_roles r',"left(r.rolname,3)<>'pg_'")},
 'membership',${raw('to_jsonb(a)','pg_catalog.pg_auth_members a JOIN pg_catalog.pg_roles r ON r.oid=a.member',"left(r.rolname,3)<>'pg_'")},
 'bootstrapObserver',${fresh35CombinedObserverObservationSql}),
 'lineage',(SELECT jsonb_agg(jsonb_build_object('version',version,'description',description) ORDER BY version) FROM naijue_erp.schema_migration))::text AS catalog_json;`}

// The sealed token projection lost the leading LF emitted by PG17's CASE
// deparser. Restore only that byte, proven against each exact pinned dump column.
function applyCaptureReceiptConstraint(model,changes){
 need(Array.isArray(changes)&&changes.length===1,'CAPTURE_RECEIPT_CONSTRAINT_SET_DIFFERS');
 const change=changes[0];
 need(change?.relation==='operation_receipt'&&change?.name==='receipt_result_by_kind'&&typeof change.before?.definition==='string'&&typeof change.after?.definition==='string','CAPTURE_RECEIPT_CONSTRAINT_IDENTITY_DIFFERS');
 need(hash(change.before.definition)==='d381f58ff5c741d08ea257c95ff4b991cdfdaf0b17b2a7fea3f0432f555210a4'&&hash(change.after.definition)==='5fdd40b5fbb91274b469d196ed344a2c3141f2f7bed390cd2fc8cc469354c7be','CAPTURE_RECEIPT_CONSTRAINT_DEFINITION_DIFFERS');
 need(isDeepStrictEqual({...change.after,definition:change.before.definition},change.before),'CAPTURE_RECEIPT_CONSTRAINT_METADATA_DIFFERS');
 const matches=model.constraints.map((row,index)=>({row,index})).filter(({row})=>row.relation===change.relation&&row.name===change.name);
 need(matches.length===1&&isDeepStrictEqual(matches[0].row,change.before),'CAPTURE_RECEIPT_CONSTRAINT_PREDECESSOR_DIFFERS');
 model.constraints[matches[0].index]=structuredClone(change.after);
}
function restoreGeneratedExpressionPrefixes(model,declarations,sections){
 const generated=declarations.columns.filter(c=>c.generated==='s');
 need(generated.length===33&&model.columns.filter(c=>c.generated==='s').length===33,'GENERATED_EXPRESSION_COHORT_DIFFERS');
 for(const declared of generated){
  const matches=model.columns.filter(c=>c.schema===declared.schema&&c.table===declared.table&&c.name===declared.name&&c.ordinal===declared.ordinal);
  const tables=sections.filter(s=>s.type==='TABLE'&&s.schema===declared.schema&&s.name===declared.table),column=matches[0];
  need(matches.length===1&&tables.length===1&&column.generated==='s'&&typeof column.generatedExpression==='string'&&column.generatedExpression.startsWith('CASE\n')&&column.generatedExpression===declared.generatedExpression,'GENERATED_EXPRESSION_IDENTITY_DIFFERS');
  const exact='    "'+declared.name+'" '+declared.typeSql+' GENERATED ALWAYS AS (\n'+column.generatedExpression+') STORED';
  need(tables[0].text.split(exact).length===2,'GENERATED_EXPRESSION_SOURCE_DIFFERS');
  column.generatedExpression='\n'+column.generatedExpression;
 }
}
export async function buildFresh35CombinedCatalog(source,target,{modelPath,functionsPath}){
 const s=describeFresh35CombinedSource(source),data=fresh35CombinedSourceData(source),t=describeFresh35CombinedTarget(target);
 need(!['FRESH35_A53_ADMIN154_SOURCE_V1','FRESH35_COMPACT_ZERO_SOURCE_V2'].includes(s.format),'ADMIN154_EXPLICIT_CATALOG_REQUIRED');
 need(hash(await readFile(resolve(data.root,ownPath)))===ownHash,'RUNNING_MODULE_DIFFERS');
 const bootstrapNetworkObservationSha256=await loadFresh35SyntheticBootstrapNetwork(target,s.sourceSetSha256);
 const original=await pinned(modelPath,MODEL_SHA),functions=await pinned(functionsPath,FUNCTIONS_SHA);
 need(original.mappedSchemaSha256===hash(data.schema)&&original.routines.length===152&&functions.length===178,'BASE_MODEL_AND_CAPTURE_BINDING_REQUIRED');
 for(const key of ['routines','constraints','indexes','triggers','relations','columnAcls','schema','tableNames','owner'])need(isDeepStrictEqual(original[key],data.core[key]),'BASE_MODEL_CORE_DIFFERS:'+key);
 const sections=parseFresh35DumpSections(data.schema),byName=new Map(sections.filter(s=>s.type==='FUNCTION').map(s=>[s.name.slice(0,s.name.indexOf('(')),s]));
 need(byName.size===152,'UNIQUE152_FUNCTION_NAMES_REQUIRED');
 const definitions=new Map(),bodies=new Map();
 for(const row of original.routines){
  const captured=functions.find(f=>normal(f.signature)===normal(row.signature)),section=byName.get(name(row.signature));need(captured&&section,'EXACT_FUNCTION_CAPTURE_REQUIRED');
  const baseBody=body(section.text),definition=replacement(captured.definition,captured.catalog.prosrc,baseBody);
  need(hash(definition)===row.definitionSha256,'BASE_DEFINITION_BINDING_DIFFERS:'+row.signature);definitions.set(normal(row.signature),definition);bodies.set(normal(row.signature),baseBody);
 }
 const model=structuredClone(original),changes=[];
 restoreGeneratedExpressionPrefixes(model,data.declarations,sections);
 for(const patch of data.patches){
  need(patch.manifest.tableCount===35&&patch.manifest.routineCount===152&&patch.manifest.newTables===0&&patch.manifest.newColumns===0&&patch.manifest.newRoutines===0&&patch.manifest.permissionsChanged===false,'BOUNDED_SUCCESSOR_REQUIRED');
  for(const change of patch.manifest.routineChanges){
   const key=normal(change.signature),before=bodies.get(key),after=patch.changedBodies.find(b=>normal(b.signature)===key)?.body;
   need(typeof before==='string'&&typeof after==='string'&&hash(before)===change.before&&hash(after)===change.after,'ORDERED_ROUTINE_SUCCESSOR_DIFFERS');
   definitions.set(key,replacement(definitions.get(key),before,after));bodies.set(key,after);changes.push({patch:patch.name,...change});
  }
  for(const change of patch.manifest.columnChanges){
   need(change.table==='naijue_erp.sales_header'&&change.column==='hall_id'&&change.beforeNullable===false&&change.afterNullable===true,'ONLY_SALES_HALL_NULLABILITY_ALLOWED');
   const column=model.columns.find(c=>c.table==='sales_header'&&c.name==='hall_id');need(column?.notNull===true&&column.metadata.attnotnull===true,'EXACT_COLUMN_PREDECESSOR_REQUIRED');column.notNull=false;column.metadata.attnotnull=false;
  }
  if(patch.manifest.constraintChanges!==undefined){need(patch.name==='historical-settlement-difference'&&patch.manifest.newConstraints===0,'CAPTURE_RECEIPT_CONSTRAINT_PATCH_DIFFERS');applyCaptureReceiptConstraint(model,patch.manifest.constraintChanges);}
 }
 model.routines=model.routines.map(r=>({...r,definitionSha256:hash(definitions.get(normal(r.signature))),bodySha256:hash(bodies.get(normal(r.signature)))}));
 const finalPins=data.patches.at(-1).manifest.successorRoutinePins;need(finalPins.length===152&&finalPins.every(pin=>hash(bodies.get(normal(pin.signature)))===pin.sha256),'FINAL_SUCCESSOR_PIN_COHORT_DIFFERS');
 const mapped=remap(model,{'fresh35_owner_20261105_r1':t.proposal.owner,'fresh35_controller_20261105_r1':t.proposal.controller});
 // User-approved B: controller reads exactly the two lineage columns. The
 // relation/table ACL and applied_at column remain the captured baseline.
 for(const column of ['version','description']){
  const row=mapped.columnAcls.find(r=>r.relation==='schema_migration'&&r.column===column);
  need(row&&row.acl===null,'EXACT_CONTROLLER_LINEAGE_ACL_PREDECESSOR_REQUIRED');
  row.acl=[t.proposal.controller+'=r/'+t.proposal.owner];
 }
 // Existing ACCOUNT service writes only these columns through the original
 // prepared-audit/credential/deferred-receipt guards. No table or LOGIN grant.
 const accountColumnWrites=freeze({relation:'user_account',grantee:'erp_unified27_runtime_2393dbc6db9581c2',
  insertColumns:['id','staff_id','login_name','password_hash','login_enabled','auth_version','version','created_at','updated_at'],
  updateColumns:['login_name','login_enabled','auth_version','version','updated_at','password_hash']});
 for(const column of accountColumnWrites.insertColumns){
  const row=mapped.columnAcls.find(r=>r.relation==='user_account'&&r.column===column);
  const before=column==='id'?[accountColumnWrites.grantee+'=w/'+t.proposal.owner]:null;
  need(row&&isDeepStrictEqual(row.acl,before),'EXACT_ACCOUNT_COLUMN_ACL_PREDECESSOR_REQUIRED');
  row.acl=[accountColumnWrites.grantee+'=a'+(column==='id'||accountColumnWrites.updateColumns.includes(column)?'w':'')+'/'+t.proposal.owner];
 }

 const lineage=Array.isArray(data.lineage)?data.lineage:data.lineage.rows;need(Array.isArray(lineage)&&lineage.length===27,'EXACT27_LINEAGE_REQUIRED');
 const sql=guardSql(mapped,lineage,target),observation=observationSql(s),descriptor=freeze({format:'FRESH35_COMBINED_CATALOG_SPEC_V1',...(bootstrapNetworkObservationSha256?{bootstrapNetworkObservationSha256}:{}),sourceSetSha256:s.sourceSetSha256,targetSha256:hash(JSON.stringify(t)),modelSha256:hash(JSON.stringify(mapped)),evidencePins:{model:MODEL_SHA,functions:FUNCTIONS_SHA},changes,guardSqlSha256:hash(sql),observationSqlSha256:hash(observation),completeMetadataGuard:true,controllerLineageReadColumns:['version','description'],
  accountColumnWrites,rawRowtypeComparison:'ALL_NONIDENTITY_FIELDS_AGAINST_NATIVE_PG17_11_TABLE_AND_ARRAY_TEMPLATES_PLUS_EXACT70_IDENTITIES',dependencyValidation:'PHYSICAL_DEPENDENCY_SCHEMA_BOUNDARY_NOT_DYNAMIC_BUSINESS_EXECUTION',captureMissingEvidencePreserved:original.missingEvidence,independentSafetyReviewComplete:false,sqlParsedByPostgres:false,engineVerified:false,hostEnabled:false});
 const token=Object.freeze({profile:'FRESH35_COMBINED_CATALOG_SPEC_V1'});
 catalogs.set(token,{source,target,model:mapped,lineage,sql,observation,modelPath,functionsPath,definitions,bodies,descriptor:freeze({...descriptor,catalogSpecSha256:hash(JSON.stringify(descriptor))})});
 await assertFresh35CombinedCatalogCurrent(token);return token;
}
export function describeFresh35CombinedCatalog(catalog){need(catalogs.has(catalog),'GENUINE_CATALOG_REQUIRED');return catalogs.get(catalog).descriptor}
/** Only the frozen a53 4+2/EXECUTE delta. All non-routine model categories are
 * copied from the original 152 model and cannot be supplied by a caller. */
export async function buildFresh35Admin154Catalog(source,target,paths){
 const {base,candidate}=fresh35Admin154SourceData(source),s=describeFresh35CombinedSource(source),t=describeFresh35CombinedTarget(target);
 const baseCatalog=await buildFresh35CombinedCatalog(base,target,paths),prior=catalogs.get(baseCatalog);
 const model=structuredClone(prior.model),definitions=new Map(prior.definitions),bodies=new Map(prior.bodies);
 for(const change of candidate.manifest.routineChanges){
  const key=normal(change.signature),before=bodies.get(key),after=candidate.changedBodies.find(r=>normal(r.signature)===key)?.body;
  need(typeof before==='string'&&typeof after==='string'&&hash(before)===change.before&&hash(after)===change.after,'ADMIN154_EXACT_ROUTINE_SUCCESSOR_REQUIRED');
  definitions.set(key,replacement(definitions.get(key),before,after));bodies.set(key,after);
 }
 model.routines=model.routines.map(r=>({...r,definitionSha256:hash(definitions.get(normal(r.signature))),bodySha256:hash(bodies.get(normal(r.signature)))}));
 const template=definitions.get(normal('naijue_erp.standard_whole_package_inspect_v2(jsonb,text)'));
 need(typeof template==='string'&&template.startsWith('CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_inspect_v2('),'ADMIN154_CANONICAL_TEMPLATE_REQUIRED');
 const args={standard_admin_provision_proof_v1:'provision_operation uuid, provision_fingerprint text, admin jsonb, require_empty boolean',standard_admin_provision_only_v1:'request jsonb, encoded_scrypt text'};
 for(const routine of candidate.newRoutines){
  need(Object.hasOwn(args,routine.name)&&!model.routines.some(r=>name(r.signature)===routine.name),'ADMIN154_EXACT_NEW_ROUTINE_REQUIRED');
  const definition=replacement(template,body(template),routine.body).replace(/^CREATE OR REPLACE FUNCTION[^\n]+/,'CREATE OR REPLACE FUNCTION naijue_erp.'+routine.name+'('+args[routine.name]+')');
  const acl=[t.proposal.owner+'=X/'+t.proposal.owner,...routine.acl.map(a=>a.role+'=X/'+t.proposal.owner)].sort();
  model.routines.push({signature:routine.signature,definitionSha256:hash(definition),bodySha256:routine.sha256,owner:t.proposal.owner,acl});
  definitions.set(normal(routine.signature),definition);bodies.set(normal(routine.signature),routine.body);
 }
 need(model.routines.length===154&&candidate.manifest.successorRoutinePins.every(p=>hash(bodies.get(normal(p.signature)))===p.sha256),'ADMIN154_COMPLETE_COHORT_REQUIRED');
 const sql=guardSql(model,prior.lineage,target,{requireEmpty:false}),observation=observationSql(s);
 const descriptor={...prior.descriptor,format:'FRESH35_A53_ADMIN154_CATALOG_SPEC_V1',sourceSetSha256:s.sourceSetSha256,
  predecessorModelSha256:prior.descriptor.modelSha256,patchSqlSha256:candidate.manifest.patchSqlSha256,
  modelSha256:hash(JSON.stringify(model)),changes:candidate.manifest.routineChanges,permissionChanges:candidate.manifest.permissionChanges,
  routineCount:154,guardSqlSha256:hash(sql),observationSqlSha256:hash(observation)};
 delete descriptor.catalogSpecSha256;
 const token=Object.freeze({profile:'FRESH35_A53_ADMIN154_CATALOG_SPEC_V1'});
 catalogs.set(token,{...prior,source,model,definitions,bodies,sql,observation,baseCatalog,
  descriptor:freeze({...descriptor,catalogSpecSha256:hash(JSON.stringify(descriptor))})});
 await assertFresh35CombinedCatalogCurrent(token);return token;
}
/** Baseline/scope replaces nine routine bodies; table metadata, roles and ACLs are inherited. */
export async function buildFresh35CompactZeroCatalog(source,target,paths){
 const {base,candidate}=fresh35CompactZeroSourceData(source),s=describeFresh35CombinedSource(source),baseCatalog=await buildFresh35Admin154Catalog(base,target,paths),prior=catalogs.get(baseCatalog);
 const model=structuredClone(prior.model),definitions=new Map(prior.definitions),bodies=new Map(prior.bodies);
 need(candidate.changedBodies.length===9&&candidate.newRoutines.length===0&&candidate.manifest.permissionChanges.length===0,'COMPACT_ZERO_EXACT_DELTA_REQUIRED');
 for(const change of candidate.manifest.routineChanges){const key=normal(change.signature),before=bodies.get(key),after=candidate.changedBodies.find(r=>normal(r.signature)===key)?.body;need(typeof before==='string'&&typeof after==='string'&&hash(before)===change.before&&hash(after)===change.after,'COMPACT_ZERO_EXACT_PREDECESSOR_REQUIRED');definitions.set(key,replacement(definitions.get(key),before,after));bodies.set(key,after);}
 model.routines=model.routines.map(r=>({...r,definitionSha256:hash(definitions.get(normal(r.signature))),bodySha256:hash(bodies.get(normal(r.signature)))}));need(model.routines.length===154,'COMPACT_ZERO_EXACT154_REQUIRED');
 const sql=guardSql(model,prior.lineage,target,{requireEmpty:false}),observation=observationSql(s),descriptor={...prior.descriptor,format:'FRESH35_COMPACT_ZERO_CATALOG_SPEC_V2',sourceSetSha256:s.sourceSetSha256,predecessorModelSha256:prior.descriptor.modelSha256,patchSqlSha256:candidate.manifest.patchSqlSha256,modelSha256:hash(JSON.stringify(model)),changes:candidate.manifest.routineChanges,permissionChanges:[],routineCount:154,guardSqlSha256:hash(sql),observationSqlSha256:hash(observation)};delete descriptor.catalogSpecSha256;
 const token=Object.freeze({profile:descriptor.format});catalogs.set(token,{...prior,source,model,definitions,bodies,sql,observation,baseCatalog,descriptor:freeze({...descriptor,catalogSpecSha256:hash(JSON.stringify(descriptor))})});await assertFresh35CombinedCatalogCurrent(token);return token;
}
// Scope this catalogue to the already reviewed ten-routine migration.
const syntheticSql39Path='adapters/postgres/patches/0039_synthetic_ten_routine_successor.sql';
const syntheticSql39Sha='1f3deac19334fc58b5ace7a9d69fc727110eb64252208b784112dc9f88c37951';

async function readSyntheticSql39(source){
 const {root}=fresh35CombinedSourceData(source);
 const path=resolve(root,syntheticSql39Path);
 need(await realpath(path)===path,'SYNTHETIC_SQL39_CANONICAL_PATH_REQUIRED');
 const sql=await readFile(path,'utf8');
 need(hash(sql)===syntheticSql39Sha,'SYNTHETIC_SQL39_PATCH_DIFFERS');
 return sql;
}

/** Derive the controller's final catalogue from the same full SQL38 model.
 * This compiles observations only. It cannot open a wire or grant admission. */
export async function buildFresh35SyntheticSql39Catalog(source,target,paths){
 const t=describeFresh35CombinedTarget(target);
 need(t.format==='FRESH35_COMBINED_TARGET_BINDING_V1'&&!t.purpose,'SYNTHETIC_V1_TARGET_REQUIRED');
 const baseCatalog=await buildFresh35CompactZeroCatalog(source,target,paths),prior=catalogs.get(baseCatalog);
 const {lineage}=prior;
 const sql=await readSyntheticSql39(source);
 const specs=parseStrictJson(sql.split('$body_specs$')[1]);
 const {model:nextModel,definitions:nextDefinitions,bodies:nextBodies}=applyFresh35Sql39CatalogDelta(prior,specs);
 const sourceSetSha256=hash(JSON.stringify({parent:prior.descriptor.sourceSetSha256,patch:syntheticSql39Sha}));
 const successorGuard=guardSql(nextModel,lineage,target,{requireEmpty:false});
 const observation=observationSql({sourceSetSha256});
 const descriptor={...prior.descriptor,format:'FRESH35_SYNTHETIC_SQL39_CATALOG_SPEC_V1',sourceSetSha256,
  predecessorModelSha256:prior.descriptor.modelSha256,patchSqlSha256:syntheticSql39Sha,
  modelSha256:hash(JSON.stringify(nextModel)),guardSqlSha256:hash(successorGuard),observationSqlSha256:hash(observation),
  changes:specs.map(({signature,beforeSha256,afterSha256})=>({signature,before:beforeSha256,after:afterSha256}))};
 delete descriptor.catalogSpecSha256;
 const token=Object.freeze({profile:descriptor.format});
 catalogs.set(token,{...prior,model:nextModel,definitions:nextDefinitions,bodies:nextBodies,
  sql:successorGuard,observation,baseCatalog,descriptor:freeze({...descriptor,catalogSpecSha256:hash(JSON.stringify(descriptor))})});
 await assertFresh35CombinedCatalogCurrent(token);return token;
}


const prefix155Pins={"adapters/postgres/patches/prefix155/01-ten-routines.sql": "1f3deac19334fc58b5ace7a9d69fc727110eb64252208b784112dc9f88c37951", "adapters/postgres/patches/prefix155/02-single-read.sql": "c0ed3f987a097a58c950c9bc015c909a563ac3e1e01aeb7ef355b1e4cb968427", "adapters/postgres/patches/prefix155/03-on-demand-context.sql": "3c2b3caaaeef1766b9ec435704863a43e87de3d54445762b8a6b43e037f438d8", "adapters/postgres/patches/prefix155/04-inventory-readiness.sql": "151f739e1427fd32fd0c7edd00253de8715442d5e4fa431e24bc8f1182d6cedf", "adapters/postgres/patches/prefix155/05-prior-lookup.sql": "60c4d1af0ba99380d64eaef853451db6188f8414cf749dd4fe45898b557a6787", "adapters/postgres/patches/prefix155/06-root-single-scan.sql": "fc63b9c28a6113f1f242305c3a06aeb110b9d79a5f58505e06ce330552ccab09", "adapters/postgres/patches/prefix155/07-execute-authority.sql": "0c7d80d25fcbd078151226326cedd96e3ecfd8b90ce3014129f971af85fe020f", "adapters/postgres/patches/prefix155/08-witness-request.sql": "f4e56d34846049f7a43319da6d6b1f3f32e8b31be9b48ffc2173f473968e1dd9", "adapters/postgres/patches/prefix155/09-root-branches-import-index.sql": "dc03d84e9da6f4abaeb073395ff608624781dd8c5fd30db5921c13393941bff4", "adapters/postgres/patches/prefix155/10-party-set-proof.sql": "91dd39e9eb0b84b632623438e772383266c287aaeac4230a204140ad85c625a6", "adapters/postgres/patches/prefix155/11-party-audit-key.sql": "807b1bd4a5901f8013ab5b84c4d6db138d224221bebe00be4edcc6b044734d59", "adapters/postgres/patches/prefix155/12-party-prefix-single-projection.sql": "d5ffad0eecc1e05b72eba107502c41a091bf0fe25c0b521030967739a6e80d90", "adapters/postgres/patches/prefix155/INSTALL-ORDER.json": "db217adcc8e87a0b5b70471d18b85b852d158e3f73b165f65dd6a93229a3a3c2", "scripts/release/unified-install/20261115-r3-party-set-scalar-pg-local-03/FINAL155-CAPTURE.json": "f3de864442187ac4adcfbfa9af07d258f2adf003fd537c18a85da3e5c247fdcc", "scripts/release/unified-install/20261115-r3-party-set-scalar-pg-local-03/derive155.mjs": "827674e50d15296e55c7f61d997bd1324c6ce439a4f44cde9b3b7c721cf3f807", "scripts/release/unified-install/20261115-r3-root114-final-combination-local-01/FINAL155-CAPTURE.json": "074bfd7b09727cd11b03879c3b2defecbed9c800c3aad783b2236ae37734fcfe", "scripts/release/unified-install/20261115-r3-root114-final-combination-local-01/FROZEN155-CAPTURE.json": "3f24bb8bf5b9fa7e3a11f20f4b8e03151a7498eac710550622acce10d1074436", "scripts/release/unified-install/20261115-r3-root114-final-combination-local-01/PARENT154-CAPTURE.json": "685a704591a050800213c76b25387649311278c0e16396a44f19cbf8e02fdd75", "scripts/release/unified-install/20261115-r3-root114-final-combination-local-01/WITNESS155-CAPTURE.json": "a46b84e03e4b99ad2b13c81fbc113a49f1a58ce7be297aaa9640ea06f9788dbd", "scripts/release/unified-install/20261115-r3-root114-final-combination-local-01/derive155.mjs": "16cc349d32c4ef16e3f03fbc0be28774737d5c76e7da5395dccf13fac332fedd", "scripts/release/unified-install/performance155/FINAL155-CAPTURE.json": "495ebec8eb8f21f4eb5d65ccaaa769a612493ebc59ab0e3aae8f5305e08ba955", "scripts/release/unified-install/performance155/derive155.mjs": "9f0f3e9b4d78db937c42087891c89393ea76955e955bd654851fe5f0270f6649", "scripts/release/unified-install/performance155/parents/20261115-r3-party-audit-key-pg-local-01/FINAL155-CAPTURE.json": "6feafa7689dd7307a4604ae3b1338c97902412c6181b75cd68fa5bfe215012b1", "scripts/release/unified-install/performance155/parents/20261115-r3-party-audit-key-pg-local-01/derive155.mjs": "501e14f04aa91b8c00fe6836be94028868a27959601aa822e75a837edfba5f29", "scripts/release/unified-install/performance155/parents/20261115-r3-party-set-scalar-pg-local-03/FINAL155-CAPTURE.json": "f3de864442187ac4adcfbfa9af07d258f2adf003fd537c18a85da3e5c247fdcc", "scripts/release/unified-install/performance155/parents/20261115-r3-party-set-scalar-pg-local-03/derive155.mjs": "827674e50d15296e55c7f61d997bd1324c6ce439a4f44cde9b3b7c721cf3f807", "scripts/release/unified-install/performance155/parents/20261115-r3-root114-final-combination-local-01/FINAL155-CAPTURE.json": "074bfd7b09727cd11b03879c3b2defecbed9c800c3aad783b2236ae37734fcfe", "scripts/release/unified-install/performance155/parents/20261115-r3-root114-final-combination-local-01/FROZEN155-CAPTURE.json": "3f24bb8bf5b9fa7e3a11f20f4b8e03151a7498eac710550622acce10d1074436", "scripts/release/unified-install/performance155/parents/20261115-r3-root114-final-combination-local-01/PARENT154-CAPTURE.json": "685a704591a050800213c76b25387649311278c0e16396a44f19cbf8e02fdd75", "scripts/release/unified-install/performance155/parents/20261115-r3-root114-final-combination-local-01/WITNESS155-CAPTURE.json": "a46b84e03e4b99ad2b13c81fbc113a49f1a58ce7be297aaa9640ea06f9788dbd", "scripts/release/unified-install/performance155/parents/20261115-r3-root114-final-combination-local-01/derive155.mjs": "16cc349d32c4ef16e3f03fbc0be28774737d5c76e7da5395dccf13fac332fedd"};
async function readPrefix155Inputs(source){
 const {root}=fresh35CombinedSourceData(source);
 for(const [name,pin] of Object.entries(prefix155Pins)){
  const path=resolve(root,name);
  need(await realpath(path)===path,'PREFIX155_CANONICAL_SOURCE_REQUIRED');
  need(hash(await readFile(path))===pin,'PREFIX155_FIXED_SOURCE_DIFFERS');
 }
 return await readFile(resolve(root,'adapters/postgres/patches/prefix155/INSTALL-ORDER.json'));
}
export async function buildFresh35SyntheticPrefix155Catalog(source,target,paths){
 const baseCatalog=await buildFresh35SyntheticSql39Catalog(source,target,paths),prior=catalogs.get(baseCatalog);
 const t=describeFresh35CombinedTarget(target);
 const manifest=await readPrefix155Inputs(source);
 const derived=derivePerformance155(prior,{
  fresh35_owner_20261105_r1:t.proposal.owner,fresh35_controller_20261105_r1:t.proposal.controller,
 });
 const {model,definitions,bodies}=derived;
 const sourceSetSha256=hash(JSON.stringify({parent:prior.descriptor.sourceSetSha256,pins:prefix155Pins}));
 const sql=guardSql(model,prior.lineage,target,{requireEmpty:false}),observation=observationSql({sourceSetSha256});
 const previous=new Map(prior.model.routines.map(row=>[normal(row.signature),row]));
 const changes=model.routines.filter(row=>previous.has(normal(row.signature))&&
   previous.get(normal(row.signature)).bodySha256!==row.bodySha256).map(row=>({
    signature:row.signature,before:previous.get(normal(row.signature)).bodySha256,after:row.bodySha256}));
 const newRoutines=model.routines.filter(row=>!previous.has(normal(row.signature)));
 need(changes.length===17&&newRoutines.length===1,'PREFIX155_EXACT_ROUTINE_DELTA_REQUIRED');
 const descriptor={...prior.descriptor,format:'FRESH35_SYNTHETIC_PREFIX155_CATALOG_SPEC_V1',
  sourceSetSha256,changes,newRoutines,predecessorModelSha256:prior.descriptor.modelSha256,patchSqlSha256:hash(manifest),
  modelSha256:hash(JSON.stringify(model)),routineCount:155,indexCount:114,
  guardSqlSha256:hash(sql),observationSqlSha256:hash(observation)};
 delete descriptor.catalogSpecSha256;
 const token=Object.freeze({profile:descriptor.format});
 catalogs.set(token,{...prior,model,definitions,bodies,sql,observation,baseCatalog,
  descriptor:freeze({...descriptor,catalogSpecSha256:hash(JSON.stringify(descriptor))})});
 await assertFresh35CombinedCatalogCurrent(token);return token;
}

/** Exact production154 -> accepted twelve-layer155 model. No synthetic token. */
export async function buildFresh35ProductionPrefix155Catalog(source,target,paths){
 const t=describeFresh35CombinedTarget(target);
 need(t.format==='FRESH35_COMBINED_TARGET_BINDING_V2'&&t.purpose==='PRODUCTION_NEW_EMPTY_EXACT35','PREFIX155_PRODUCTION_TARGET_REQUIRED');
 const baseCatalog=await buildFresh35CompactZeroCatalog(source,target,paths),prior=catalogs.get(baseCatalog);
 need(prior.model.routines.length===154,'PREFIX155_EXACT154_PREDECESSOR_REQUIRED');
 const manifest=await readPrefix155Inputs(source);
 const sql39=await readSyntheticSql39(source);
 const sql39Prior=applyFresh35Sql39CatalogDelta(prior,parseStrictJson(sql39.split('$body_specs$')[1]));
 const {model,definitions,bodies}=derivePerformance155(sql39Prior,{
  fresh35_owner_20261105_r1:t.proposal.owner,fresh35_controller_20261105_r1:t.proposal.controller,
 });
 need(model.routines.length===155&&model.indexes.length===114,'PREFIX155_EXACT_SUCCESSOR_REQUIRED');
 const sourceSetSha256=hash(JSON.stringify({parent:prior.descriptor.sourceSetSha256,pins:prefix155Pins}));
 const sql=guardSql(model,prior.lineage,target,{requireEmpty:false}),observation=observationSql({sourceSetSha256});
 const descriptor={...prior.descriptor,format:'FRESH35_PRODUCTION_PREFIX155_CATALOG_SPEC_V1',
  sourceSetSha256,predecessorModelSha256:prior.descriptor.modelSha256,patchSqlSha256:hash(manifest),
  modelSha256:hash(JSON.stringify(model)),routineCount:155,indexCount:114,
  guardSqlSha256:hash(sql),observationSqlSha256:hash(observation)};
 delete descriptor.catalogSpecSha256;
 const token=Object.freeze({profile:descriptor.format});
 catalogs.set(token,{...prior,model,definitions,bodies,sql,observation,baseCatalog,
  descriptor:freeze({...descriptor,catalogSpecSha256:hash(JSON.stringify(descriptor))})});
 await assertFresh35CombinedCatalogCurrent(token);return token;
}

export function fresh35Admin154PredecessorCatalogSql(catalog){
 describeFresh35CombinedCatalog(catalog);const c=catalogs.get(catalog);need(c.baseCatalog,'ADMIN154_CATALOG_REQUIRED');
 const base=catalogs.get(c.baseCatalog);return Object.freeze({guardSql:base.sql,observationSql:base.observation,descriptor:base.descriptor});
}
export function fresh35CompactZeroParentCatalog(catalog){describeFresh35CombinedCatalog(catalog);const c=catalogs.get(catalog);need(c.descriptor.format==='FRESH35_COMPACT_ZERO_CATALOG_SPEC_V2'&&c.baseCatalog,'COMPACT_ZERO_CATALOG_REQUIRED');return c.baseCatalog;}
/** Current controller epoch is supplied only by the fixed protected-service
 * loader. The old installation observer remains unchanged historical metadata. */
export function fresh35Admin154ControllerCatalogSql(catalog,source,target,postmasterStart,expiresAt){
 fresh35CombinedCatalogSql(catalog,source,target);const c=catalogs.get(catalog),t=describeFresh35CombinedTarget(target);
 need(c.baseCatalog&&t.purpose==='PRODUCTION_NEW_EMPTY_EXACT35'&&typeof postmasterStart==='string'&&Number.isSafeInteger(expiresAt)&&expiresAt>Date.now(),'ADMIN154_CURRENT_CONTROLLER_REQUIRED');
 const members=JSON.stringify([['erp_unified27_importer_2393dbc6db9581c2',false,false,true],['erp_unified27_initializer_2393dbc6db9581c2',false,false,true]]);
 const safety=`EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname=session_user AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolconnlimit=2 AND r.rolvaliduntil>clock_timestamp() AND extract(epoch FROM r.rolvaliduntil)*1000<=${expiresAt}) AND (SELECT coalesce(jsonb_agg(jsonb_build_array(parent.rolname,m.admin_option,m.inherit_option,m.set_option) ORDER BY parent.rolname),'[]'::jsonb) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid WHERE m.member=session_user::regrole::oid)=${q(members)}::jsonb`;
 const identity=`DO $admin154_controller$ BEGIN IF (${safety} AND current_database()=${q(t.proposal.database)} AND current_user=${q(t.proposal.controller)} AND session_user=${q(t.proposal.controller)} AND (SELECT system_identifier::text FROM pg_catalog.pg_control_system())=${q(t.physical.systemIdentifier)} AND (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database())=${q(t.physical.databaseOid)} AND current_setting('server_version_num')=${q(t.physical.serverVersionNum)} AND pg_postmaster_start_time() AT TIME ZONE 'UTC'=TIMESTAMP ${q(postmasterStart.replace(/\+00$/,''))} AND host(inet_server_addr())=${q(t.proposal.host)} AND inet_server_port()=${t.proposal.port} AND current_setting('transaction_isolation')='repeatable read' AND current_setting('transaction_read_only')='on' AND current_setting('session_replication_role')='origin' AND NOT pg_is_in_recovery() AND extract(epoch FROM clock_timestamp())*1000<${expiresAt}) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FRESH35_ADMIN154_CONTROLLER_DIFFERS'; END IF; END $admin154_controller$;`;
 return Object.freeze({guardSql:identity+'\n'+guardSql(c.model,c.lineage,target,{requireEmpty:false}),observationSql:observationSql(c.descriptor,{runtime:true})});
}
export function fresh35CombinedCatalogSql(catalog,source,target){describeFresh35CombinedCatalog(catalog);const c=catalogs.get(catalog);need(c.source===source&&c.target===target,'SAME_SOURCE_AND_TARGET_REQUIRED');return Object.freeze({guardSql:c.sql,observationSql:c.observation})}
export async function assertFresh35CombinedCatalogCurrent(catalog){describeFresh35CombinedCatalog(catalog);const c=catalogs.get(catalog);await assertFresh35CombinedSourcesCurrent(c.source);if(c.descriptor.format==='FRESH35_SYNTHETIC_SQL39_CATALOG_SPEC_V1')await readSyntheticSql39(c.source);if(['FRESH35_SYNTHETIC_PREFIX155_CATALOG_SPEC_V1','FRESH35_PRODUCTION_PREFIX155_CATALOG_SPEC_V1'].includes(c.descriptor.format))await readPrefix155Inputs(c.source);if(c.descriptor.format==='FRESH35_BATCHED_CATALOG_SPEC_V1')await readBatchedInputs(c.source);if(c.descriptor.format==='FRESH35_BATCHED_COMMAND_SUCCESSOR_CATALOG_SPEC_V1')await readCommandSuccessorInputs(c.source);if(c.descriptor.format===hall165.format)await readHallSuccessorInputs(c.source,hall165);if(c.descriptor.format===directHistory166.format)await readHallSuccessorInputs(c.source,directHistory166);if(c.baseCatalog)await assertFresh35CombinedCatalogCurrent(c.baseCatalog);else await assertFresh35SyntheticBootstrapNetworkCurrent(c.target,describeFresh35CombinedSource(c.source).sourceSetSha256);await pinned(c.modelPath,MODEL_SHA);await pinned(c.functionsPath,FUNCTIONS_SHA);return true}
export function fresh35CombinedRuntimeCatalogSql(catalog,source,target){
 fresh35CombinedCatalogSql(catalog,source,target);const c=catalogs.get(catalog);
 return Object.freeze({guardSql:fresh35CombinedRuntimeTargetGuard(target)+'\n'+guardSql(c.model,c.lineage,target,{requireEmpty:false}),observationSql:observationSql(c.descriptor,{runtime:true})});
}
export function validateFresh35CombinedRuntimeCatalogObservation(raw,catalog,source,target){
 return validateCatalogObservation(raw,catalog,source,target,true);
}
export function validateFresh35CombinedCatalogObservation(raw,catalog,source,target){
 return validateCatalogObservation(raw,catalog,source,target,false);
}
/** The installer checks the active SET ROLE and live epoch on this transaction.
 * The pinned observation reports the effective owner and authenticated session separately. */
export function fresh35Installed154UpgradeCatalogObservation(catalog,upgradeTarget){
 const {source,metadataTarget,descriptor}=fresh35Installed154UpgradeTargetData(upgradeTarget);
 const statements=fresh35CombinedCatalogSql(catalog,source,metadataTarget);
 return Object.freeze({
  ...statements,
  validate:raw=>validateCatalogObservation(raw,catalog,source,metadataTarget,false,false,descriptor.proposal.admin),
 });
}
function validateCatalogObservation(raw,catalog,source,target,runtime,ordinary=false,upgradeSessionUser){
 fresh35CombinedCatalogSql(catalog,source,target);const c=catalogs.get(catalog),t=describeFresh35CombinedTarget(target);
 need(typeof raw==='string'&&Buffer.byteLength(raw)<=16*1024*1024,'BOUNDED_RAW_OBSERVATION_REQUIRED');const packet=parseStrictJson(raw),i=packet.identity;
 const expectedActor=upgradeSessionUser??(ordinary?t.proposal.runtime:runtime?t.proposal.controller:t.proposal.owner);
 need(packet.format==='FRESH35_COMBINED_ACTUAL_CATALOG_V1'&&packet.sourceSetSha256===c.descriptor.sourceSetSha256&&i&&i.systemIdentifier===t.physical.systemIdentifier&&i.databaseOid===t.physical.databaseOid&&i.serverVersionNum===t.physical.serverVersionNum&&i.database===t.proposal.database&&i.owner===t.proposal.owner&&i.actor===expectedActor&&i.host===(ordinary===true?t.ordinary.serverAddress:t.proposal.host)&&i.port===(ordinary===true?t.ordinary.serverPort:t.proposal.port),'ACTUAL_PHYSICAL_IDENTITY_DIFFERS');
 const expectedKeys=['relations','columns','routines','types','constraints','indexes','triggers','sequences','policies','defaultAcl','dependencies','sharedDependencies','schema','database','roles','membership','bootstrapObserver'];
 need(packet.catalog&&Object.keys(packet.catalog).sort().join(',')===expectedKeys.sort().join(',')&&expectedKeys.every(k=>Array.isArray(packet.catalog[k])),'FULL_RAW_CATALOG_REQUIRED');
 need(packet.catalog.types.length===70&&packet.catalog.routines.length===c.model.routines.length&&packet.catalog.relations.filter(r=>r.relkind==='r').length===35,'RAW_OBJECT_COHORT_DIFFERS');
 validateFresh35CombinedObserverObservation(packet.catalog.bootstrapObserver,target);
 for(const routine of packet.catalog.routines){const definitionSha256=hash(routine.definition);const expected=c.model.routines.find(r=>name(r.signature)===routine.catalog?.proname&&r.definitionSha256===definitionSha256);need(expected&&hash(routine.catalog.prosrc)===expected.bodySha256,'RAW_ROUTINE_DIFFERS')}
 need(isDeepStrictEqual(packet.lineage,c.lineage.map(({version,description})=>({version,description}))),'RAW_LINEAGE_DIFFERS');
 return Object.freeze({catalogSha256:hash(raw),physicalIdentityMatched:true,metadataGuardSource:c.descriptor.catalogSpecSha256,engineBusinessVerified:false});
}

/** Same complete catalog model on the ordinary interface role. The physical
 * system ID was read on this same transaction BEFORE SET LOCAL ROLE by the host;
 * no function grant is assumed on the interface role. This builder grants nothing. */
export function fresh35CombinedOrdinaryCatalogSql(catalog,source,target,physical){
 fresh35CombinedCatalogSql(catalog,source,target);const c=catalogs.get(catalog),t=describeFresh35CombinedTarget(target);
 need(t.purpose==='PRODUCTION_NEW_EMPTY_EXACT35'&&physical?.systemIdentifier===t.physical.systemIdentifier&&physical.databaseOid===t.physical.databaseOid,'ORDINARY_PHYSICAL_BINDING_REQUIRED');
 const role='erp_unified27_runtime_2393dbc6db9581c2';
 const identity=`DO $ordinary35_identity$ BEGIN IF (current_database()=${q(t.proposal.database)} AND session_user=${q(t.proposal.runtime)} AND current_user=${q(role)} AND current_setting('row_security')='on' AND current_setting('session_replication_role')='origin' AND NOT pg_is_in_recovery() AND current_setting('transaction_isolation')='repeatable read' AND current_setting('transaction_read_only')='on' AND host(inet_server_addr())=${q(t.ordinary.serverAddress)} AND inet_server_port()=${t.ordinary.serverPort}) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FRESH35_ORDINARY_IDENTITY_DIFFERS'; END IF; END $ordinary35_identity$;`;
 return Object.freeze({guardSql:identity+'\n'+guardSql(c.model,c.lineage,target,{requireEmpty:false}),observationSql:observationSql((c.descriptor.format==='FRESH35_BATCHED_COMMAND_SUCCESSOR_CATALOG_SPEC_V1'||c.descriptor.format==='FRESH35_SETTLEMENT24_CURRENT_WIRE_CATALOG_SPEC_V1'||c.descriptor.format===hall165.format||c.descriptor.format===directHistory166.format)?c.descriptor:describeFresh35CombinedSource(source),{runtime:true,systemIdentifierExpression:q(physical.systemIdentifier)})});
}
export function validateFresh35CombinedOrdinaryCatalogObservation(raw,catalog,source,target){return validateCatalogObservation(raw,catalog,source,target,true,true)}

/** Separate synthetic V1 ordinary observation; production V2 guard unchanged. */
export function fresh35CombinedSyntheticOrdinaryCatalogSql(catalog,source,target,physical){
 fresh35CombinedCatalogSql(catalog,source,target);const c=catalogs.get(catalog),t=describeFresh35CombinedTarget(target);
 need(t.format==='FRESH35_COMBINED_TARGET_BINDING_V1'&&!t.purpose&&/^synthetic_fresh35_[0-9]{8}_r[1-9][0-9]{0,3}$/.test(t.proposal.database)&&t.proposal.host==='127.0.0.1'&&physical?.systemIdentifier===t.physical.systemIdentifier&&physical.databaseOid===t.physical.databaseOid&&physical.postmasterStart===t.physical.postmasterStart,'SYNTHETIC_ORDINARY_PHYSICAL_BINDING_REQUIRED');
 const identity=`DO $synthetic35_identity$ BEGIN IF (current_database()=${q(t.proposal.database)} AND session_user=${q(t.proposal.runtime)} AND current_user='erp_unified27_runtime_2393dbc6db9581c2' AND current_setting('row_security')='on' AND current_setting('session_replication_role')='origin' AND NOT pg_is_in_recovery() AND current_setting('transaction_isolation')='repeatable read' AND current_setting('transaction_read_only')='on' AND host(inet_server_addr())=${q(t.proposal.host)} AND inet_server_port()=${t.proposal.port} AND pg_postmaster_start_time()::text=${q(t.physical.postmasterStart)} AND extract(epoch FROM clock_timestamp())*1000>=${t.startsAt} AND extract(epoch FROM clock_timestamp())*1000<${t.expiresAt}) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FRESH35_SYNTHETIC_ORDINARY_IDENTITY_DIFFERS'; END IF; END $synthetic35_identity$;`;
 return Object.freeze({guardSql:identity+'\n'+guardSql(c.model,c.lineage,target,{requireEmpty:false}),observationSql:observationSql(c.descriptor,{runtime:true,systemIdentifierExpression:q(physical.systemIdentifier)})});
}
export function validateFresh35CombinedSyntheticOrdinaryCatalogObservation(raw,catalog,source,target){
 const t=describeFresh35CombinedTarget(target);need(t.format==='FRESH35_COMBINED_TARGET_BINDING_V1'&&!t.purpose,'SYNTHETIC_V1_TARGET_REQUIRED');return validateCatalogObservation(raw,catalog,source,target,true,'synthetic');
}


// Additive source/model bridge. Root/empty admission remains a separate live
// check on the same physical client before any batch writer is exposed.
const batchedImportPins={
 'EXPECTED161-MODEL.json':'4e692cad636a86b4cc3bb3c55874c926e32b79508b846222f32d0d01f3ffed51',
 'EXPECTED161-DEFINITIONS.json':'b3f394b80055f164b2e11449487c3da5c234a510b39dfae73dab8993c0f79216',
 'EXPECTED161-BODIES.json':'a57ed0c0663b913e82f90b0bef4cef51506542c4398bef7330a7f6775ae60942',
};
async function readBatchedInputs(source){
 const {root}=fresh35CombinedSourceData(source),inputs={};
 for(const [filename,pin]of Object.entries(batchedImportPins)){
  const path=resolve(root,'scripts/release/unified-install/batched-import-v1',filename);
  need(await realpath(path)===path,'BATCHED_CANONICAL_SOURCE_REQUIRED');
  const bytes=await readFile(path);need(hash(bytes)===pin,'BATCHED_FIXED_SOURCE_DIFFERS');
  inputs[filename]=parseStrictJson(bytes.toString('utf8'));
 }
 return inputs;
}
export async function buildFresh35BatchedCatalogV1(source,target,predecessorCatalog){
 describeFresh35CombinedCatalog(predecessorCatalog);
 const prior=catalogs.get(predecessorCatalog),t=describeFresh35CombinedTarget(target);
 need(prior.source===source&&prior.target===target
  &&prior.descriptor.format==='FRESH35_COMPACT_ZERO_CATALOG_SPEC_V2'
  &&t.purpose==='PRODUCTION_NEW_EMPTY_EXACT35','BATCHED_PRODUCTION_PREDECESSOR_REQUIRED');
 const inputs=await readBatchedInputs(source);
 const model=remap(inputs['EXPECTED161-MODEL.json'],{
  fresh35_owner_20261105_r1:t.proposal.owner,fresh35_controller_20261105_r1:t.proposal.controller});
 const definitions=new Map(Object.entries(inputs['EXPECTED161-DEFINITIONS.json']));
 const bodies=new Map(Object.entries(inputs['EXPECTED161-BODIES.json']));
 need(model.routines.length===161&&definitions.size===161&&bodies.size===161
  &&model.tables.length===35&&model.columns.length===351&&model.indexes.length===114,
  'BATCHED_EXACT_MODEL_REQUIRED');
 const keys=new Set();
 for(const routine of model.routines){
  const key=normal(routine.signature);need(!keys.has(key),'BATCHED_UNIQUE_ROUTINE_REQUIRED');keys.add(key);
  need(hash(definitions.get(key))===routine.definitionSha256&&hash(bodies.get(key))===routine.bodySha256,
   'BATCHED_ROUTINE_SOURCE_DIFFERS');
 }
 const sourceSetSha256=hash(JSON.stringify({parent:prior.descriptor.sourceSetSha256,pins:batchedImportPins}));
 const sql=guardSql(model,prior.lineage,target,{requireEmpty:false});
 const observation=observationSql({sourceSetSha256});
 const descriptor={...prior.descriptor,format:'FRESH35_BATCHED_CATALOG_SPEC_V1',sourceSetSha256,
  predecessorModelSha256:prior.descriptor.modelSha256,modelSha256:hash(JSON.stringify(model)),
  routineCount:161,indexCount:114,requiresLockedRootAdmission:true,
  guardSqlSha256:hash(sql),observationSqlSha256:hash(observation)};
 delete descriptor.catalogSpecSha256;
 const token=Object.freeze({profile:descriptor.format});
 catalogs.set(token,{...prior,model,definitions,bodies,sql,observation,baseCatalog:predecessorCatalog,
  descriptor:freeze({...descriptor,catalogSpecSha256:hash(JSON.stringify(descriptor))})});
 await assertFresh35CombinedCatalogCurrent(token);return token;
}

const commandSuccessorReviewSha256='849288162c8e21036b2b50e1a8ceaf4d5bc5edad2340a679dae488e9e10749f7';
const commandSignature='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)';
const commandSuccessorLeaves=['COMMAND-SUCCESSOR-161-MODEL.json','COMMAND-SUCCESSOR-161-BODIES.json','COMMAND-SUCCESSOR-161-DEFINITIONS.json'];

async function readCommandSuccessorInputs(source){
 const {root}=fresh35CombinedSourceData(source);
 const base=resolve(root,'scripts/release/unified-install/batched-import-v1');
 need(typeof commandSuccessorReviewSha256==='string','COMMAND_SUCCESSOR_FINAL_REVIEW_REQUIRED');
 const review=await pinned(resolve(base,'COMMAND-SUCCESSOR-PINS.json'),commandSuccessorReviewSha256);
 need(review.format==='FRESH35_DB05_COMMAND_SUCCESSOR_PINS_V1'&&review.functionIdentity===commandSignature
  &&review.sqlPath==='adapters/postgres/patches/0028_batched_history_hall_provenance.sql'
  &&Object.keys(review.catalogInputs).sort().join(',')===commandSuccessorLeaves.toSorted().join(','),
 'COMMAND_SUCCESSOR_REVIEW_DIFFERS');
 const sqlPath=resolve(root,review.sqlPath);
 need(await realpath(sqlPath)===sqlPath&&hash(await readFile(sqlPath))===review.sqlSha256,'COMMAND_SUCCESSOR_SQL_DIFFERS');
 const values=await Promise.all(commandSuccessorLeaves.map(leaf=>pinned(resolve(base,leaf),review.catalogInputs[leaf])));
 return {review,values};
}

export async function buildFresh35BatchedCommandSuccessorCatalogV1(source,target,predecessorCatalog){
 describeFresh35CombinedCatalog(predecessorCatalog);
 const prior=catalogs.get(predecessorCatalog),t=describeFresh35CombinedTarget(target);
 need(prior.source===source&&prior.target===target&&prior.descriptor.format==='FRESH35_BATCHED_CATALOG_SPEC_V1',
  'COMMAND_SUCCESSOR_PREDECESSOR_REQUIRED');
 const {review,values:[raw,bodies,definitions]}=await readCommandSuccessorInputs(source);
 const oldRoutine=prior.model.routines.find(row=>normal(row.signature)===commandSignature);
 need(oldRoutine?.bodySha256===review.before.bodySha256&&oldRoutine.definitionSha256===review.before.definitionSha256,
  'COMMAND_SUCCESSOR_OLD_ROUTINE_DIFFERS');
 const model=remap(raw,{fresh35_owner_20261105_r1:t.proposal.owner,fresh35_controller_20261105_r1:t.proposal.controller});
 const expected=structuredClone(prior.model);
 const entry=expected.routines.find(row=>normal(row.signature)===commandSignature);
 entry.bodySha256=review.after.bodySha256;entry.definitionSha256=review.after.definitionSha256;
 need(isDeepStrictEqual(model,expected),'COMMAND_SUCCESSOR_UNRELATED_CATALOG_DIFFERS');
 const check=(next,original,expectedSha)=>{
  need(Object.keys(next).length===original.size&&hash(next[commandSignature])===expectedSha,
   'COMMAND_SUCCESSOR_ROUTINE_BYTES_DIFFERS');
  for(const [signature,bytes] of original){
   if(signature!==commandSignature)need(next[signature]===bytes,'COMMAND_SUCCESSOR_UNRELATED_ROUTINE_DIFFERS');
  }
 };
 check(bodies,prior.bodies,entry.bodySha256);
 check(definitions,prior.definitions,entry.definitionSha256);
 const sourceSetSha256=hash(JSON.stringify({parent:prior.descriptor.sourceSetSha256,reviewSha256:commandSuccessorReviewSha256}));
 const sql=guardSql(model,prior.lineage,target,{requireEmpty:false}),observation=observationSql({sourceSetSha256});
 const descriptor={...prior.descriptor,format:'FRESH35_BATCHED_COMMAND_SUCCESSOR_CATALOG_SPEC_V1',sourceSetSha256,
  predecessorModelSha256:prior.descriptor.modelSha256,modelSha256:hash(JSON.stringify(model)),patchSqlSha256:review.sqlSha256,
  guardSqlSha256:hash(sql),observationSqlSha256:hash(observation)};
 delete descriptor.catalogSpecSha256;
 const token=Object.freeze({profile:descriptor.format});
 catalogs.set(token,{...prior,model,bodies:new Map(Object.entries(bodies)),definitions:new Map(Object.entries(definitions)),
  sql,observation,baseCatalog:predecessorCatalog,descriptor:freeze({...descriptor,catalogSpecSha256:hash(JSON.stringify(descriptor))})});
 await assertFresh35CombinedCatalogCurrent(token);
 return token;
}


// Exact approved current-wire successor over the immutable command catalog.
const settlement24ReviewSha256='faaa57ae44e67f9d70f43913db121aadc1ed98d64e9a6049f65244a2bf543c19';
async function readSettlement24CurrentWireInputs(source){
 const {root}=fresh35CombinedSourceData(source),base=resolve(root,'scripts/release/unified-install/batched-import-v1');
 const review=await pinned(resolve(base,'SETTLEMENT24-CURRENT-WIRE-PINS.json'),settlement24ReviewSha256);
 need(review.format==='FRESH35_SETTLEMENT24_CURRENT_WIRE_SUCCESSOR_PINS_V1'
  &&review.decisionSha256==='3b04898ea9050610f83295c51075c65dfeaf95c0566a1cd834b140df1085bef6'
  &&review.predecessorCommandReviewSha256===commandSuccessorReviewSha256
  &&review.approved.rawSha256==='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05'
  &&review.approved.manifestSha256==='7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'
  &&review.approved.namespace==='naijue:tplus:20261102'&&review.approved.documents===24&&review.approved.settlements===26,
  'SETTLEMENT24_EXACT_SOURCE_DECISION_REQUIRED');
 const expected=['naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)',
  'naijue_erp.assert_document_migration(uuid)','naijue_erp.standard_whole_package_verify_v2(jsonb,text)'];
 need(review.changes.length===3&&review.changes.every((r,i)=>r.signature===expected[i]),'SETTLEMENT24_EXACT_THREE_ROUTINES_REQUIRED');
 const sqlPath=resolve(root,review.sqlPath);
 need(await realpath(sqlPath)===sqlPath&&hash(await readFile(sqlPath))===review.sqlSha256,'SETTLEMENT24_SQL_SOURCE_DIFFERS');
 const values=await Promise.all(['MODEL','BODIES','DEFINITIONS'].map(kind=>pinned(resolve(root,review.catalogInputs[kind].path),review.catalogInputs[kind].sha256)));
 return {review,values};
}
export async function buildFresh35Settlement24CurrentWireCatalogV1(source,target,predecessorCatalog){
 describeFresh35CombinedCatalog(predecessorCatalog);
 const prior=catalogs.get(predecessorCatalog),t=describeFresh35CombinedTarget(target);
 need(prior.source===source&&prior.target===target&&prior.descriptor.format==='FRESH35_BATCHED_COMMAND_SUCCESSOR_CATALOG_SPEC_V1',
  'SETTLEMENT24_COMMAND_PREDECESSOR_REQUIRED');
 const {review,values:[raw,bodies,definitions]}=await readSettlement24CurrentWireInputs(source);
 const model=remap(raw,{fresh35_owner_20261105_r1:t.proposal.owner,fresh35_controller_20261105_r1:t.proposal.controller});
 const expected=structuredClone(prior.model),changes=new Map(review.changes.map(r=>[r.signature,r]));
 need(expected.routines.length===161&&expected.tables.length===35&&expected.columns.length===351&&expected.indexes.length===114,
  'SETTLEMENT24_ORIGINAL_CATALOG_SHAPE_REQUIRED');
 for(const change of review.changes){
  const item=expected.routines.find(r=>normal(r.signature)===change.signature);
  need(item?.bodySha256===change.beforeBodySha256&&item.definitionSha256===change.beforeDefinitionSha256
   &&hash(prior.bodies.get(change.signature))===change.beforeBodySha256
   &&hash(prior.definitions.get(change.signature))===change.beforeDefinitionSha256,
   'SETTLEMENT24_EXACT_PREDECESSOR_ROUTINE_REQUIRED');
  item.bodySha256=change.afterBodySha256;item.definitionSha256=change.afterDefinitionSha256;
 }
 need(isDeepStrictEqual(model,expected),'SETTLEMENT24_UNRELATED_MODEL_CHANGED');
 need(Object.keys(bodies).length===161&&Object.keys(definitions).length===161,'SETTLEMENT24_EXACT161_SNAPSHOTS_REQUIRED');
 for(const [signature,body]of prior.bodies){
  const change=changes.get(signature);
  need(change?hash(bodies[signature])===change.afterBodySha256&&hash(definitions[signature])===change.afterDefinitionSha256
   :bodies[signature]===body&&definitions[signature]===prior.definitions.get(signature),
   'SETTLEMENT24_EXACT_THREE_ROUTINE_DELTA_REQUIRED');
 }
 const sourceSetSha256=hash(JSON.stringify({parent:prior.descriptor.sourceSetSha256,settlement24ReviewSha256}));
 const sql=guardSql(model,prior.lineage,target,{requireEmpty:false}),observation=observationSql({sourceSetSha256});
 const descriptor={...prior.descriptor,format:'FRESH35_SETTLEMENT24_CURRENT_WIRE_CATALOG_SPEC_V1',sourceSetSha256,
  changes:review.changes.map(r=>({signature:r.signature,before:r.beforeBodySha256,after:r.afterBodySha256,
   beforeDefinitionSha256:r.beforeDefinitionSha256,afterDefinitionSha256:r.afterDefinitionSha256})),
  predecessorModelSha256:prior.descriptor.modelSha256,modelSha256:hash(JSON.stringify(model)),patchSqlSha256:review.sqlSha256,
  successorPinsSha256:settlement24ReviewSha256,changedRoutineCount:3,guardSqlSha256:hash(sql),observationSqlSha256:hash(observation)};
 delete descriptor.catalogSpecSha256;
 const token=Object.freeze({profile:descriptor.format});
 catalogs.set(token,{...prior,model,bodies:new Map(Object.entries(bodies)),definitions:new Map(Object.entries(definitions)),
  sql,observation,baseCatalog:predecessorCatalog,descriptor:freeze({...descriptor,catalogSpecSha256:hash(JSON.stringify(descriptor))})});
 // All five new assets are in the original source-pin mechanism. The recursive
 // check preserves the old one-routine command-catalog assertions unchanged.
 await assertFresh35CombinedCatalogCurrent(token);return token;
}

// The closed successor is read against the same installed SQL42 model.
const hallSuccessorBase='scripts/release/unified-install/batched-import-v1';
const hall165=freeze({"format":"FRESH35_HALL_FINALIZE_165_CATALOG_SPEC_V1","assetPrefix":"HALL-FINALIZE-165","sqlStem":"hall-finalize-165","errorPrefix":"HALL165","routineCount":165,"pinsFormat":"FRESH35_HALL_FINALIZE_165_SUCCESSOR_PINS_V1","pinsSha256":"e763c1db8a056aa617924fa40c10bb7a243569f6ced4754a4eefe40631626d1a","changes":["naijue_erp.assert_document_migration(uuid)","naijue_erp.standard_import_record_proof(uuid)","naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)"],"helpers":["naijue_erp.standard_history_hall_projection_relation_v1()","naijue_erp.standard_history_hall_projection_store_v1(jsonb,jsonb,jsonb,jsonb)","naijue_erp.assert_final_history_origin_v1(uuid,uuid,uuid,jsonb)","naijue_erp.assert_document_migration_checked_v1(uuid,uuid)"]});
const directHistory166=freeze({"format":"FRESH35_DIRECT_HISTORY_166_CATALOG_SPEC_V1","assetPrefix":"DIRECT-HISTORY-166","sqlStem":"direct-history-166","errorPrefix":"DIRECT_HISTORY_166","routineCount":166,"beforeRoutineCount":165,"pinsFormat":"FRESH35_DIRECT_HISTORY_166_SUCCESSOR_PINS_V1","pinsSha256":"b47848535d8e33a87ea8324339edce77705198919da0ec3375dc37a85ff4507e","changes":["naijue_erp.validate_transfer_commit()","naijue_erp.validate_transfer_header_commit()","naijue_erp.validate_transfer_line_commit()","naijue_erp.validate_unified_ordinary_operation()","naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)","naijue_erp.standard_batched_import_assert_group_v1(uuid,jsonb)","naijue_erp.standard_batched_import_complete_v1(jsonb,jsonb)","naijue_erp.assert_standard_import_operation(uuid)","naijue_erp.validate_import_operation()","naijue_erp.guard_import_accounting_publication()","naijue_erp.guard_header_native_reference_publication()","naijue_erp.guard_history_publication()","naijue_erp.guard_native_catalogue_publication()","naijue_erp.guard_native_payment_publication()","naijue_erp.guard_successor_publication26()","naijue_erp.guard_history_typed_publication()"],"helpers":["naijue_erp.standard_transfer_migration_reuse_v1(uuid,jsonb)"],"beforeFormat":"FRESH35_HALL_FINALIZE_165_CATALOG_SPEC_V1","indexNames":["sales_line_sales_id_idx","inventory_balance_last_operation_id_idx"]});
async function readHallSuccessorInputs(source,spec){
 const {root}=fresh35CombinedSourceData(source);
 const pins=await pinned(resolve(root,hallSuccessorBase,spec.assetPrefix+'-PINS.json'),spec.pinsSha256);
 need(pins.format===spec.pinsFormat&&pins.beforeRoutineCount===(spec.beforeRoutineCount??161)
   &&pins.afterRoutineCount===spec.routineCount&&isDeepStrictEqual(pins.changes.map(row=>row.signature),spec.changes)
   &&isDeepStrictEqual(pins.newHelpers.map(row=>row.signature),spec.helpers),
  spec.errorPrefix+'_EXACT_COHORT_REQUIRED');
 for(const kind of ['forward','rollback']){
  const declared=pins.sql[kind], stem='adapters/postgres/patches/'+spec.sqlStem+'-'+kind;
  need(declared.path===stem+'.sql'&&declared.innerPath===stem+'-inner.sql'&&declared.innerStatementCount===1,
   spec.errorPrefix+'_SQL_PATH_DIFFERS');
  const wrappedPath=resolve(root,declared.path), innerPath=resolve(root,declared.innerPath);
  need(await realpath(wrappedPath)===wrappedPath&&await realpath(innerPath)===innerPath,spec.errorPrefix+'_CANONICAL_SQL_REQUIRED');
  const [wrapped,inner]=await Promise.all([readFile(wrappedPath),readFile(innerPath)]);
  need(hash(wrapped)===declared.sha256&&hash(inner)===declared.innerSha256
   &&wrapped.equals(Buffer.concat([Buffer.from('BEGIN ISOLATION LEVEL READ COMMITTED;\n'),inner,Buffer.from('COMMIT;\n')])),
   spec.errorPrefix+'_SQL_BYTES_DIFFERS');
 }
 const values=await Promise.all(['MODEL','BODIES','DEFINITIONS'].map(kind=>{
  const asset=pins.catalogInputs[kind];
  need(asset.path===hallSuccessorBase+'/'+spec.assetPrefix+'-'+kind+'.json',spec.errorPrefix+'_CATALOG_PATH_DIFFERS');
  return pinned(resolve(root,asset.path),asset.sha256);
 }));
 return {pins,values};
}

async function buildHallSuccessorCatalog(source,target,predecessorCatalog,spec){
 describeFresh35CombinedCatalog(predecessorCatalog);
 const prior=catalogs.get(predecessorCatalog), t=describeFresh35CombinedTarget(target);
 need(prior.source===source&&prior.target===target&&prior.descriptor.format===(spec.beforeFormat??'FRESH35_SETTLEMENT24_CURRENT_WIRE_CATALOG_SPEC_V1'),
  spec.errorPrefix+'_SQL42_PREDECESSOR_REQUIRED');
 const {pins,values:[raw,bodies,definitions]}=await readHallSuccessorInputs(source,spec);
 const roles={fresh35_owner_20261105_r1:t.proposal.owner,fresh35_controller_20261105_r1:t.proposal.controller};
 need(isDeepStrictEqual(roles,pins.roleMap)&&prior.descriptor.modelSha256===pins.predecessorInstalledCatalog.modelSha256,
  spec.errorPrefix+'_EXACT_SQL42_ROLE_AND_MODEL_REQUIRED');
 const model=remap(raw,roles), expected=structuredClone(prior.model);
 need(expected.routines.length===(spec.beforeRoutineCount??161)&&Object.keys(bodies).length===spec.routineCount&&Object.keys(definitions).length===spec.routineCount,
  spec.errorPrefix+'_EXACT_CATALOG_SIZE_REQUIRED');
 const changed=new Map(pins.changes.map(row=>[row.signature,row]));
 for(const item of expected.routines){
  const signature=normal(item.signature), change=changed.get(signature);
  if(change){
   need(item.bodySha256===change.beforeBodySha256&&item.definitionSha256===change.beforeDefinitionSha256
    &&hash(prior.bodies.get(signature))===change.beforeBodySha256
    &&hash(prior.definitions.get(signature))===change.beforeDefinitionSha256,
    spec.errorPrefix+'_EXACT_OLD_ROUTINE_REQUIRED');
   item.bodySha256=change.afterBodySha256;item.definitionSha256=change.afterDefinitionSha256;
  }else{
   need(bodies[signature]===prior.bodies.get(signature)&&definitions[signature]===prior.definitions.get(signature),
    spec.errorPrefix+'_UNRELATED_ROUTINE_DIFFERS');
  }
 }
 for(const helper of pins.newHelpers){
  need(!prior.bodies.has(helper.signature)&&helper.owner===t.proposal.owner
   &&isDeepStrictEqual(helper.acl,spec===directHistory166
    ? [t.proposal.owner+'=X/'+t.proposal.owner,'erp_unified27_importer_2393dbc6db9581c2=X/'+t.proposal.owner].sort()
    : [t.proposal.owner+'=X/'+t.proposal.owner]),spec.errorPrefix+'_PRIVATE_HELPER_REQUIRED');
  expected.routines.push(helper);
 }
 if(spec===directHistory166){
  need(expected.indexes.length===114&&expected.relations.length===153
   &&isDeepStrictEqual(pins.catalogAdditions.indexes.map(r=>r.index),spec.indexNames)
   &&isDeepStrictEqual(pins.catalogAdditions.relations.map(r=>r.relation),spec.indexNames),
   spec.errorPrefix+'_INDEX_DELTA_DIFFERS');
  expected.indexes.push(...pins.catalogAdditions.indexes);
  expected.relations.push(...pins.catalogAdditions.relations);
 }
 need(isDeepStrictEqual(model,expected)&&hash(JSON.stringify(model))===pins.afterMappedModelSha256,
  spec.errorPrefix+'_UNRELATED_MODEL_CHANGED');
 for(const item of model.routines){
  const signature=normal(item.signature);
  need(hash(bodies[signature])===item.bodySha256&&hash(definitions[signature])===item.definitionSha256,
   spec.errorPrefix+'_EXACT_ROUTINE_BYTES_REQUIRED');
 }
 const sourceSetSha256=hash(JSON.stringify({parent:prior.descriptor.sourceSetSha256,
  installedPredecessor:pins.predecessorInstalledCatalog,successorPinsSha256:spec.pinsSha256}));
 const sql=guardSql(model,prior.lineage,target,{requireEmpty:false}),observation=observationSql({sourceSetSha256});
 const descriptor={...prior.descriptor,format:spec.format,sourceSetSha256,
  installedPredecessor:pins.predecessorInstalledCatalog,predecessorModelSha256:prior.descriptor.modelSha256,
  modelSha256:pins.afterMappedModelSha256,routineCount:spec.routineCount,
  ...(spec===directHistory166?{indexCount:model.indexes.length,relationCount:model.relations.length}:{}),changedRoutineCount:spec.changes.length,addedRoutineCount:spec.helpers.length,
  changes:pins.changes,newHelpers:pins.newHelpers,successorPinsSha256:spec.pinsSha256,
  patchSqlSha256:pins.sql.forward.sha256,patchSqlInnerSha256:pins.sql.forward.innerSha256,
  rollbackSqlSha256:pins.sql.rollback.sha256,rollbackSqlInnerSha256:pins.sql.rollback.innerSha256,
  guardSqlSha256:hash(sql),observationSqlSha256:hash(observation)};
 delete descriptor.catalogSpecSha256;
 const token=Object.freeze({profile:descriptor.format});
 catalogs.set(token,{...prior,model,bodies:new Map(Object.entries(bodies)),definitions:new Map(Object.entries(definitions)),
  sql,observation,baseCatalog:predecessorCatalog,descriptor:freeze({...descriptor,catalogSpecSha256:hash(JSON.stringify(descriptor))})});
 await assertFresh35CombinedCatalogCurrent(token);
 return token;
}

export function buildFresh35HallFinalize165CatalogV1(source,target,predecessorCatalog){
 return buildHallSuccessorCatalog(source,target,predecessorCatalog,hall165);
}
export function buildFresh35DirectHistory166CatalogV1(source,target,hall165Catalog){
 return buildHallSuccessorCatalog(source,target,hall165Catalog,directHistory166);
}
