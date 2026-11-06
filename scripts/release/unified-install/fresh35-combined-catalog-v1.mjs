/** Independent additive successor catalog compiler. Existing blocked review SQL
 * remains unchanged. This module only generates checks; native installation
 * separately requires the fixed protected authorization and exact target. */
import {readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {describeFresh35CombinedSource,fresh35CombinedSourceData,assertFresh35CombinedSourcesCurrent,combinedSha256 as hash} from './fresh35-combined-source-v1.mjs';
import {describeFresh35CombinedTarget,fresh35RestoredTargetGuard,fresh35CombinedRuntimeTargetGuard,loadFresh35SyntheticBootstrapNetwork,assertFresh35SyntheticBootstrapNetworkCurrent,fresh35CombinedObserverCheck,fresh35CombinedObserverObservationSql,validateFresh35CombinedObserverObservation} from './fresh35-combined-target-v1.mjs';
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
 IF pg_catalog.current_setting('server_version_num')<>'170011' OR (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>152 THEN RAISE EXCEPTION 'FRESH35_COMBINED_ROUTINE_COHORT_DIFFERS'; END IF;
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
 catalogs.set(token,{source,target,model:mapped,lineage,sql,observation,modelPath,functionsPath,descriptor:freeze({...descriptor,catalogSpecSha256:hash(JSON.stringify(descriptor))})});
 await assertFresh35CombinedCatalogCurrent(token);return token;
}
export function describeFresh35CombinedCatalog(catalog){need(catalogs.has(catalog),'GENUINE_CATALOG_REQUIRED');return catalogs.get(catalog).descriptor}
export function fresh35CombinedCatalogSql(catalog,source,target){describeFresh35CombinedCatalog(catalog);const c=catalogs.get(catalog);need(c.source===source&&c.target===target,'SAME_SOURCE_AND_TARGET_REQUIRED');return Object.freeze({guardSql:c.sql,observationSql:c.observation})}
export async function assertFresh35CombinedCatalogCurrent(catalog){describeFresh35CombinedCatalog(catalog);const c=catalogs.get(catalog);await assertFresh35CombinedSourcesCurrent(c.source);await assertFresh35SyntheticBootstrapNetworkCurrent(c.target,describeFresh35CombinedSource(c.source).sourceSetSha256);await pinned(c.modelPath,MODEL_SHA);await pinned(c.functionsPath,FUNCTIONS_SHA);return true}
export function fresh35CombinedRuntimeCatalogSql(catalog,source,target){
 fresh35CombinedCatalogSql(catalog,source,target);const c=catalogs.get(catalog);
 return Object.freeze({guardSql:fresh35CombinedRuntimeTargetGuard(target)+'\n'+guardSql(c.model,c.lineage,target,{requireEmpty:false}),observationSql:observationSql(describeFresh35CombinedSource(source),{runtime:true})});
}
export function validateFresh35CombinedRuntimeCatalogObservation(raw,catalog,source,target){
 return validateCatalogObservation(raw,catalog,source,target,true);
}
export function validateFresh35CombinedCatalogObservation(raw,catalog,source,target){
 return validateCatalogObservation(raw,catalog,source,target,false);
}
function validateCatalogObservation(raw,catalog,source,target,runtime,ordinary=false,restoration=false){
 fresh35CombinedCatalogSql(catalog,source,target);const c=catalogs.get(catalog),s=describeFresh35CombinedSource(source),t=describeFresh35CombinedTarget(target);
 need(typeof raw==='string'&&Buffer.byteLength(raw)<=16*1024*1024,'BOUNDED_RAW_OBSERVATION_REQUIRED');const packet=parseStrictJson(raw),i=packet.identity;
 need(packet.format==='FRESH35_COMBINED_ACTUAL_CATALOG_V1'&&packet.sourceSetSha256===s.sourceSetSha256&&i&&i.systemIdentifier===t.physical.systemIdentifier&&i.databaseOid===t.physical.databaseOid&&i.serverVersionNum===t.physical.serverVersionNum&&i.database===t.proposal.database&&i.owner===t.proposal.owner&&i.actor===(restoration?t.proposal.admin:ordinary?t.proposal.runtime:runtime?t.proposal.controller:t.proposal.owner)&&i.host===(ordinary===true?t.ordinary.serverAddress:t.proposal.host)&&i.port===(ordinary===true?t.ordinary.serverPort:t.proposal.port),'ACTUAL_PHYSICAL_IDENTITY_DIFFERS');
 const expectedKeys=['relations','columns','routines','types','constraints','indexes','triggers','sequences','policies','defaultAcl','dependencies','sharedDependencies','schema','database','roles','membership','bootstrapObserver'];
 need(packet.catalog&&Object.keys(packet.catalog).sort().join(',')===expectedKeys.sort().join(',')&&expectedKeys.every(k=>Array.isArray(packet.catalog[k])),'FULL_RAW_CATALOG_REQUIRED');
 need(packet.catalog.types.length===70&&packet.catalog.routines.length===152&&packet.catalog.relations.filter(r=>r.relkind==='r').length===35,'RAW_OBJECT_COHORT_DIFFERS');
 validateFresh35CombinedObserverObservation(packet.catalog.bootstrapObserver,target);
 for(const routine of packet.catalog.routines){const expected=c.model.routines.find(r=>name(r.signature)===routine.catalog?.proname);need(expected&&hash(routine.catalog.prosrc)===expected.bodySha256&&hash(routine.definition)===expected.definitionSha256,'RAW_ROUTINE_DIFFERS')}
 need(isDeepStrictEqual(packet.lineage,c.lineage.map(({version,description})=>({version,description}))),'RAW_LINEAGE_DIFFERS');
 return Object.freeze({catalogSha256:hash(raw),physicalIdentityMatched:true,metadataGuardSource:c.descriptor.catalogSpecSha256,engineBusinessVerified:false});
}

/** Same complete catalog model on the ordinary interface role. The physical
 * system ID was read on this same transaction BEFORE SET LOCAL ROLE by the host;
 * no function grant is assumed on the interface role. This builder grants nothing. */
export function fresh35CombinedOrdinaryCatalogSql(catalog,source,target,physical){
 fresh35CombinedCatalogSql(catalog,source,target);const c=catalogs.get(catalog),t=describeFresh35CombinedTarget(target);
 need(['PRODUCTION_NEW_EMPTY_EXACT35','RESTORED_FROM_VERIFIED_INSTALLATION'].includes(t.purpose)&&physical?.systemIdentifier===t.physical.systemIdentifier&&physical.databaseOid===t.physical.databaseOid,'ORDINARY_PHYSICAL_BINDING_REQUIRED');
 const role='erp_unified27_runtime_2393dbc6db9581c2';
 const identity=`DO $ordinary35_identity$ BEGIN IF (current_database()=${q(t.proposal.database)} AND session_user=${q(t.proposal.runtime)} AND current_user=${q(role)} AND current_setting('row_security')='on' AND current_setting('session_replication_role')='origin' AND NOT pg_is_in_recovery() AND current_setting('transaction_isolation')='repeatable read' AND current_setting('transaction_read_only')='on' AND host(inet_server_addr())=${q(t.ordinary.serverAddress)} AND inet_server_port()=${t.ordinary.serverPort}) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FRESH35_ORDINARY_IDENTITY_DIFFERS'; END IF; END $ordinary35_identity$;`;
 return Object.freeze({guardSql:identity+'\n'+guardSql(c.model,c.lineage,target,{requireEmpty:false}),observationSql:observationSql(describeFresh35CombinedSource(source),{runtime:true,systemIdentifierExpression:q(physical.systemIdentifier)})});
}
export function validateFresh35CombinedOrdinaryCatalogObservation(raw,catalog,source,target){return validateCatalogObservation(raw,catalog,source,target,true,true)}

/** Separate synthetic V1 ordinary observation; production V2 guard unchanged. */
export function fresh35CombinedSyntheticOrdinaryCatalogSql(catalog,source,target,physical){
 fresh35CombinedCatalogSql(catalog,source,target);const c=catalogs.get(catalog),t=describeFresh35CombinedTarget(target);
 need(t.format==='FRESH35_COMBINED_TARGET_BINDING_V1'&&!t.purpose&&/^synthetic_fresh35_[0-9]{8}_r[1-9][0-9]{0,3}$/.test(t.proposal.database)&&t.proposal.host==='127.0.0.1'&&physical?.systemIdentifier===t.physical.systemIdentifier&&physical.databaseOid===t.physical.databaseOid&&physical.postmasterStart===t.physical.postmasterStart,'SYNTHETIC_ORDINARY_PHYSICAL_BINDING_REQUIRED');
 const identity=`DO $synthetic35_identity$ BEGIN IF (current_database()=${q(t.proposal.database)} AND session_user=${q(t.proposal.runtime)} AND current_user='erp_unified27_runtime_2393dbc6db9581c2' AND current_setting('row_security')='on' AND current_setting('session_replication_role')='origin' AND NOT pg_is_in_recovery() AND current_setting('transaction_isolation')='repeatable read' AND current_setting('transaction_read_only')='on' AND host(inet_server_addr())=${q(t.proposal.host)} AND inet_server_port()=${t.proposal.port} AND pg_postmaster_start_time()::text=${q(t.physical.postmasterStart)} AND extract(epoch FROM clock_timestamp())*1000>=${t.startsAt} AND extract(epoch FROM clock_timestamp())*1000<${t.expiresAt}) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FRESH35_SYNTHETIC_ORDINARY_IDENTITY_DIFFERS'; END IF; END $synthetic35_identity$;`;
 return Object.freeze({guardSql:identity+'\n'+guardSql(c.model,c.lineage,target,{requireEmpty:false}),observationSql:observationSql(describeFresh35CombinedSource(source),{runtime:true,systemIdentifierExpression:q(physical.systemIdentifier)})});
}
export function validateFresh35CombinedSyntheticOrdinaryCatalogObservation(raw,catalog,source,target){
 const t=describeFresh35CombinedTarget(target);need(t.format==='FRESH35_COMBINED_TARGET_BINDING_V1'&&!t.purpose,'SYNTHETIC_V1_TARGET_REQUIRED');return validateCatalogObservation(raw,catalog,source,target,true,'synthetic');
}

/** Same full model/ACL/152 routines/35 tables/70 types on the already restored
 * target. This is metadata observation, never schema installation. */
export function fresh35CombinedRestorationCatalogSql(catalog,source,target){
 fresh35CombinedCatalogSql(catalog,source,target);const c=catalogs.get(catalog),t=describeFresh35CombinedTarget(target);
 need(t.purpose==='RESTORED_FROM_VERIFIED_INSTALLATION','RESTORED_PURPOSE_REQUIRED');
 return Object.freeze({guardSql:fresh35RestoredTargetGuard(target)+'\n'+guardSql(c.model,c.lineage,target,{requireEmpty:false}),observationSql:observationSql(describeFresh35CombinedSource(source),{runtime:true})});
}
export function validateFresh35CombinedRestorationCatalogObservation(raw,catalog,source,target){return validateCatalogObservation(raw,catalog,source,target,true,false,true)}
