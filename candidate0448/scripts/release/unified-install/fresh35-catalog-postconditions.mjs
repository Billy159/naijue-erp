/** Read-only installation postconditions derived from pinned, already collected
 * predecessor metadata. Rendering is NOT execution, record publication, ACL
 * approval or runtime admission. Never reconnects to the stopped predecessor. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { requireFresh35RetirementPlan } from './fresh35-retirement-plan.mjs';
import { normalizeRetirementSignature } from './fresh35-retirement-source.mjs';
import { replaceFresh35DumpBody, compileFresh35SchemaFromDump } from './fresh35-retirement-schema.mjs';
import { mapFresh35RetirementIdentities } from './fresh35-retirement-identity.mjs';
import { collectFresh35RetirementMetadata, requireFresh35RetirementMetadata } from './fresh35-retirement-metadata.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error(code);};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const evidenceSet=new WeakSet();
const evidencePins=Object.freeze({
 'schema178-naijue-erp.sql':'1552f7a055ceaa42cfea7656b4f22a52ce3f7bad83915e8c4661f905a7954354',
 'inventory.json':'5acb7c5462c44ead296fd4dc32d91de8b04ddc27dfe98d139a9ba57096f0b194',
 'functions.json':'0f19441fad41e74e7049ecd5f8e5749390670ece4fde37c9c78d0114dcd01c90',
 'objects.json':'94c48f7037b0f1ae21d9f01ac81f04308630c612b412c72ca837a09d3398423a',
 'acl-and-roles.json':'443de0564c06789cba9578ad23e84230a494384de5383c9039273717cb51ce8d',
 'source-target.json':'53ce4f7955874df6dc8b4e4287240ca8845c6f0661bf81a8fda22ea3331a471d',
});
export async function loadFresh35PostconditionEvidence(directory){
 const files={};for(const [file,sha256] of Object.entries(evidencePins)){const bytes=await readFile(resolve(directory,file));need(hash(bytes)===sha256,'FRESH35_POSTCONDITION_EVIDENCE_CHANGED:'+file);files[file]=file.endsWith('.json')?JSON.parse(bytes.toString('utf8')):bytes.toString('utf8');}
 const result=freeze({format:'FRESH35_PINNED_PREDECESSOR_METADATA_V1',pins:evidencePins,dump:files['schema178-naijue-erp.sql'],inventory:files['inventory.json'],functions:files['functions.json'],objects:files['objects.json'],acl:files['acl-and-roles.json'],sourceTarget:files['source-target.json']});evidenceSet.add(result);return result;
}
const signature=value=>normalizeRetirementSignature(value.replace(/timestamp with time zone/g,'timestamptz'));
const safeRole=value=>typeof value==='string'&&/^[a-z_][a-z0-9_]{0,62}$/.test(value);
function mappingFor(evidence,mapping){
 need(mapping&&typeof mapping==='object'&&!Array.isArray(mapping)&&Object.values(mapping).every(safeRole),'FRESH35_POSTCONDITION_ROLE_MAPPING_REQUIRED');
 const oldOwner=evidence.sourceTarget.target.owner,oldController=evidence.sourceTarget.target.controller;
 need(Object.keys(mapping).sort().join(',')===[oldOwner,oldController].sort().join(',')&&new Set(Object.values(mapping)).size===2,'FRESH35_POSTCONDITION_ROLE_MAPPING_REQUIRED');
 return {map:role=>mapping[role]??role,owner:mapping[oldOwner]};
}
function mappedAcl(value,map){if(value===null)return null;need(Array.isArray(value),'FRESH35_POSTCONDITION_ACL_INVALID');return value.map(item=>{const match=typeof item==='string'&&item.match(/^([a-z_][a-z0-9_]*|)=([a-zA-Z*]*)\/([a-z_][a-z0-9_]*)$/);need(match,'FRESH35_POSTCONDITION_ACL_INVALID');return map(match[1])+'='+match[2]+'/'+map(match[3]);}).sort();}
function without(row,keys){return Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key)));}
function internalDefinition(trigger){
 const pattern=/^(?:RI_ConstraintTrigger_[ac]_[0-9]+|Unique_ConstraintTrigger_[0-9]+)$/;
 need(pattern.test(trigger.tgname),'FRESH35_POSTCONDITION_UNKNOWN_INTERNAL_TRIGGER');
 const prefix='CREATE CONSTRAINT TRIGGER "'+trigger.tgname+'" ';need(trigger.definition.startsWith(prefix),'FRESH35_POSTCONDITION_INTERNAL_TRIGGER_DEFINITION');
 return 'CREATE CONSTRAINT TRIGGER "<INTERNAL>" '+trigger.definition.slice(prefix.length);
}
/** Pure source projection is separately exported for model tests. It does not
 * authenticate the supplied metadata; only the pinned loader can feed the SQL
 * renderer. Reference OIDs are resolved to semantic names and never transplanted. */
export function projectFresh35CoreMetadata(evidence,plan,identityMapping){
 requireFresh35RetirementPlan(plan);need(evidence?.sourceTarget?.source_spec_sha256===plan.predecessorSourceSpecSha256,'FRESH35_POSTCONDITION_PREDECESSOR_SOURCE_DIFFERS');
 const {map,owner}=mappingFor(evidence,identityMapping),inv=evidence.inventory;
 need(Array.isArray(evidence.functions)&&evidence.functions.length===178&&Array.isArray(inv.relations),'FRESH35_POSTCONDITION_COMPLETE_PREDECESSOR_REQUIRED');
 const relations=new Map(inv.relations.map(row=>[String(row.oid),row])),tableIds=new Set(inv.relations.filter(row=>row.relkind==='r'&&plan.retainedTables.includes(row.relname)).map(row=>String(row.oid)));
 need(tableIds.size===35,'FRESH35_POSTCONDITION_TABLE_COHORT_DIFFERS');
 const bySignature=new Map(evidence.functions.map(row=>[signature(row.signature),row]));need(bySignature.size===178,'FRESH35_POSTCONDITION_ROUTINE_COHORT_DIFFERS');
 const routines=plan.retainedRoutines.map(routine=>{
  const before=bySignature.get(signature(routine.signature)),prior=plan.predecessorRoutines.find(row=>signature(row.signature)===signature(routine.signature));
  need(before&&prior&&before.body_sha256===prior.bodySha256&&hash(before.catalog.prosrc)===prior.bodySha256,'FRESH35_POSTCONDITION_ROUTINE_SOURCE_DIFFERS');
  const definition=replaceFresh35DumpBody(before.definition,prior.bodySha256,routine.body);
  return {signature:routine.signature,definitionSha256:hash(definition),owner,acl:mappedAcl(before.catalog.proacl,map)};
 });
 const replaced=new Set(plan.foreignKeyReplacements.map(edge=>edge.table+':'+edge.fk));
 const constraints=inv.constraints.filter(row=>tableIds.has(String(row.conrelid))&&!replaced.has(relations.get(String(row.conrelid)).relname+':'+row.conname));
 const constraintIds=new Set(constraints.map(row=>String(row.oid)));
 const metadataConstraints=constraints.map(row=>({relation:relations.get(String(row.conrelid)).relname,name:row.conname,
  definition:row.definition,kind:row.contype,validated:row.convalidated,deferrable:row.condeferrable,initiallyDeferred:row.condeferred,noInherit:row.connoinherit,local:row.conislocal,inheritCount:row.coninhcount,
  referencedRelation:String(row.confrelid)==='0'?null:relations.get(String(row.confrelid))?.relname,index:String(row.conindid)==='0'?null:relations.get(String(row.conindid))?.relname,
  columns:row.conkey,referencedColumns:row.confkey,deleteAction:row.confdeltype,updateAction:row.confupdtype,matchType:row.confmatchtype,deleteColumns:row.confdelsetcols}));
 for(const edge of plan.foreignKeyReplacements){const relation=inv.relations.find(row=>row.relkind==='r'&&row.relname===edge.table);const column=inv.columns.find(row=>String(row.attrelid)===String(relation.oid)&&row.attname===edge.column);need(column&&column.attnum>0,'FRESH35_POSTCONDITION_NULL_COLUMN_MISSING');metadataConstraints.push({relation:edge.table,name:edge.check,definition:`CHECK ((${edge.column} IS NULL))`,kind:'c',validated:true,deferrable:false,initiallyDeferred:false,noInherit:false,local:true,inheritCount:0,referencedRelation:null,index:null,columns:[column.attnum],referencedColumns:null,deleteAction:' ',updateAction:' ',matchType:' ',deleteColumns:null});}
 const indexes=inv.indexes.filter(row=>tableIds.has(String(row.indrelid))).map(row=>({relation:relations.get(String(row.indrelid)).relname,index:relations.get(String(row.indexrelid)).relname,definition:row.definition,metadata:without(row,['indrelid','indexrelid','definition','indclass','indcollation','indexprs','indpred'])}));
 const triggers=inv.triggers.filter(row=>tableIds.has(String(row.tgrelid))&&(!row.tgisinternal||constraintIds.has(String(row.tgconstraint)))).map(row=>{
  const constraint=String(row.tgconstraint)==='0'?null:constraints.find(item=>String(item.oid)===String(row.tgconstraint));need(String(row.tgconstraint)==='0'||constraint,'FRESH35_POSTCONDITION_TRIGGER_CONSTRAINT_MISSING');
  return {relation:relations.get(String(row.tgrelid)).relname,name:row.tgisinternal?'<INTERNAL>':row.tgname,definition:row.tgisinternal?internalDefinition(row):row.definition,
   constraint:constraint?[relations.get(String(constraint.conrelid)).relname,constraint.conname]:null,
   constraintIndex:String(row.tgconstrindid)==='0'?null:relations.get(String(row.tgconstrindid))?.relname,
   constraintRelation:String(row.tgconstrrelid)==='0'?null:relations.get(String(row.tgconstrrelid))?.relname,
   metadata:without(row,['oid','tgname','definition','tgfoid','tgrelid','tgparentid','tgconstraint','tgconstrindid','tgconstrrelid','tgqual'])};
 });

 const indexIds=new Set(inv.indexes.filter(row=>tableIds.has(String(row.indrelid))).map(row=>String(row.indexrelid)));
 const expectedRelations=inv.relations.filter(row=>tableIds.has(String(row.oid))||indexIds.has(String(row.oid))||row.relkind==='S').map(row=>{
  need(String(row.reltablespace)==='0'&&String(row.reloftype)==='0'&&String(row.relrewrite)==='0'&&!row.relhasrules&&!row.relispartition&&row.relpartbound===null,'FRESH35_POSTCONDITION_UNSUPPORTED_RELATION_METADATA');
  const meta=without(row,['oid','relam','relacl','reltype','relowner','relpages','reltuples','relminmxid','relfilenode','relfrozenxid','relnamespace','reltablespace','reltoastrelid','relallvisible','relallfrozen','reloftype','relrewrite']);
  if(row.relkind==='r'){meta.relchecks+=plan.foreignKeyReplacements.filter(edge=>edge.table===row.relname).length;meta.relhastriggers=triggers.some(trigger=>trigger.relation===row.relname);}
  const index=inv.indexes.find(index=>String(index.indexrelid)===String(row.oid));
  const accessMethod=row.relkind==='r'?'heap':row.relkind==='S'?null:index?.definition.match(/ USING ([a-z_][a-z0-9_]*) /)?.[1];need(accessMethod!==undefined,'FRESH35_POSTCONDITION_INDEX_ACCESS_METHOD_MISSING');
  return {relation:row.relname,owner,acl:mappedAcl(row.relacl,map),accessMethod,metadata:meta};
 });
 const columnAcls=inv.columns.filter(row=>tableIds.has(String(row.attrelid))&&row.attnum>0).map(row=>({relation:relations.get(String(row.attrelid)).relname,column:row.attname,number:row.attnum,acl:mappedAcl(row.attacl,map)}));
 const schema=inv.schemas.find(row=>row.nspname==='naijue_erp');need(schema,'FRESH35_POSTCONDITION_SCHEMA_MISSING');
 const schemaMetadata={name:'naijue_erp',owner,acl:mappedAcl(schema.nspacl,map)};
 need(inv.default_acl===null||Array.isArray(inv.default_acl)&&inv.default_acl.length===0,'FRESH35_POSTCONDITION_UNSUPPORTED_DEFAULT_ACL');
 for(const row of [...metadataConstraints,...triggers])need(!Object.values(row).includes(undefined),'FRESH35_POSTCONDITION_UNRESOLVED_REFERENCE');
 need(routines.length===152&&metadataConstraints.length===326&&indexes.length===111&&triggers.length===570&&triggers.filter(row=>!row.metadata.tgisinternal).length===152,'FRESH35_POSTCONDITION_SOURCE_PROJECTED_COUNTS_DIFFER');
 return freeze({routines,constraints:metadataConstraints,indexes,triggers,relations:expectedRelations,columnAcls,schema:schemaMetadata,tableNames:plan.retainedTables,owner,
  sourceSpecSha256:plan.predecessorSourceSpecSha256,sourceSetSha256:plan.sourceSetSha256,sourceEvidencePins:evidence.pins,
  engineVerified:false,installationReady:false});
}
const aclSql=expression=>`CASE WHEN ${expression} IS NULL THEN NULL ELSE (SELECT pg_catalog.jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM pg_catalog.unnest(${expression}) a) END`;
const tableSql=`pg_catalog.jsonb_build_object('schema',ns.nspname,'name',r.relname,'owner',o.rolname,'columnCount',r.relnatts,'rowSecurity',r.relrowsecurity,'forceRowSecurity',r.relforcerowsecurity)`;
const columnSql=`pg_catalog.jsonb_build_object('schema',ns.nspname,'table',r.relname,'name',a.attname,'ordinal',a.attnum,'typeSchema',CASE WHEN t.typcategory='A' THEN en.nspname ELSE tn.nspname END,'typeName',CASE WHEN t.typcategory='A' THEN element.typname ELSE t.typname END,'typeModifier',a.atttypmod,'arrayDimensions',a.attndims,'notNull',a.attnotnull,'defaultExpression',CASE WHEN a.attgenerated='' THEN pg_catalog.pg_get_expr(d.adbin,d.adrelid,false) ELSE NULL END,'generatedExpression',CASE WHEN a.attgenerated<>'' THEN pg_catalog.pg_get_expr(d.adbin,d.adrelid,false) ELSE NULL END,'generated',a.attgenerated,'identity',a.attidentity,'collation',CASE WHEN a.attcollation=t.typcollation THEN NULL ELSE pg_catalog.jsonb_build_object('schema',cn.nspname,'name',coll.collname) END,'metadata',pg_catalog.to_jsonb(a)-ARRAY['attrelid','atttypid','attcollation','attacl'])`;
const sequenceSql=`pg_catalog.jsonb_build_object('schema',ns.nspname,'name',r.relname,'owner',o.rolname,'typeSchema',tn.nspname,'typeName',t.typname,'start',s.seqstart::text,'increment',s.seqincrement::text,'min',s.seqmin::text,'max',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle,'ownedBy',(SELECT pg_catalog.jsonb_build_object('schema',dn.nspname,'table',dr.relname,'column',da.attname) FROM pg_catalog.pg_depend dep JOIN pg_catalog.pg_class dr ON dr.oid=dep.refobjid JOIN pg_catalog.pg_namespace dn ON dn.oid=dr.relnamespace JOIN pg_catalog.pg_attribute da ON da.attrelid=dr.oid AND da.attnum=dep.refobjsubid WHERE dep.classid='pg_catalog.pg_class'::regclass AND dep.objid=s.seqrelid AND dep.refclassid='pg_catalog.pg_class'::regclass AND dep.deptype IN('a','i')))`;
const policySql=`pg_catalog.jsonb_build_object('schema',ns.nspname,'table',r.relname,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT pg_catalog.jsonb_agg(role_name ORDER BY role_name COLLATE "C") FROM (SELECT CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE roles.rolname END AS role_name FROM pg_catalog.unnest(p.polroles) role_oid LEFT JOIN pg_catalog.pg_roles roles ON roles.oid=role_oid) names),'usingExpression',pg_catalog.pg_get_expr(p.polqual,p.polrelid,false),'withCheckExpression',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false))`;
const constraintSql=`pg_catalog.jsonb_build_object('relation',r.relname,'name',c.conname,'definition',pg_catalog.pg_get_constraintdef(c.oid,false),'kind',c.contype,'validated',c.convalidated,'deferrable',c.condeferrable,'initiallyDeferred',c.condeferred,'noInherit',c.connoinherit,'local',c.conislocal,'inheritCount',c.coninhcount,'referencedRelation',rr.relname,'index',ix.relname,'columns',c.conkey,'referencedColumns',c.confkey,'deleteAction',c.confdeltype,'updateAction',c.confupdtype,'matchType',c.confmatchtype,'deleteColumns',c.confdelsetcols)`;
const indexSql=`pg_catalog.jsonb_build_object('relation',r.relname,'index',ix.relname,'definition',pg_catalog.pg_get_indexdef(i.indexrelid),'metadata',pg_catalog.to_jsonb(i)-ARRAY['indrelid','indexrelid','indclass','indcollation','indexprs','indpred'])`;
const relationSql=`pg_catalog.jsonb_build_object('relation',r.relname,'owner',o.rolname,'acl',${aclSql('r.relacl')},'accessMethod',am.amname,'metadata',pg_catalog.to_jsonb(r)-ARRAY['oid','relam','relacl','reltype','relowner','relpages','reltuples','relminmxid','relfilenode','relfrozenxid','relnamespace','reltablespace','reltoastrelid','relallvisible','relallfrozen','reloftype','relrewrite'])`;
const columnAclSql=`pg_catalog.jsonb_build_object('relation',r.relname,'column',a.attname,'number',a.attnum,'acl',${aclSql('a.attacl')})`;
const triggerSql=`pg_catalog.jsonb_build_object('relation',r.relname,'name',CASE WHEN t.tgisinternal THEN '<INTERNAL>' ELSE t.tgname END,'definition',CASE WHEN t.tgisinternal THEN pg_catalog.regexp_replace(pg_catalog.pg_get_triggerdef(t.oid,false),'^CREATE CONSTRAINT TRIGGER "(RI_ConstraintTrigger_[ac]_[0-9]+|Unique_ConstraintTrigger_[0-9]+)" ','CREATE CONSTRAINT TRIGGER "<INTERNAL>" ') ELSE pg_catalog.pg_get_triggerdef(t.oid,false) END,'constraint',CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.jsonb_build_array(cr.relname,c.conname) END,'constraintIndex',ix.relname,'constraintRelation',rr.relname,'metadata',pg_catalog.to_jsonb(t)-ARRAY['oid','tgname','tgfoid','tgrelid','tgparentid','tgconstraint','tgconstrindid','tgconstrrelid','tgqual'])`;
/** A JSONB multiset compares full captured definitions and metadata, not counts
 * alone. Duplicates remain visible because ordering applies to every full row. */
function compareCollection(label,expression,from,where){return `SELECT coalesce(pg_catalog.jsonb_agg(observed.item ORDER BY observed.item::text COLLATE "C"),'[]'::jsonb) INTO actual FROM (SELECT ${expression} AS item ${from} WHERE ${where}) observed;
 SELECT coalesce(pg_catalog.jsonb_agg(declared.value ORDER BY declared.value::text COLLATE "C"),'[]'::jsonb) INTO expected FROM pg_catalog.jsonb_array_elements(model->'${label}') AS declared(value);
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FRESH35_COMPLETE_${label.toUpperCase()}_DIFFER' USING ERRCODE='55000'; END IF;
`;}
export function buildFresh35CatalogPostconditions(evidence,plan,identityMapping,suppliedMetadata){
 need(evidenceSet.has(evidence),'FRESH35_PINNED_POSTCONDITION_EVIDENCE_REQUIRED');const core=projectFresh35CoreMetadata(evidence,plan,identityMapping);
 const compiled=compileFresh35SchemaFromDump(evidence.dump,plan,{dumpSha256:evidencePins['schema178-naijue-erp.sql'],predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256});
 const sourceOwner=evidence.sourceTarget.target.owner,sourceController=evidence.sourceTarget.target.controller;
 const mapped=mapFresh35RetirementIdentities(compiled.sql,{owner:{source:sourceOwner,target:identityMapping[sourceOwner]},controller:{source:sourceController,target:identityMapping[sourceController]}});
 const metadata=suppliedMetadata??collectFresh35RetirementMetadata(mapped.sql);requireFresh35RetirementMetadata(metadata);
 need(metadata.sourceSha256===hash(mapped.sql),'FRESH35_POSTCONDITION_METADATA_SCHEMA_DIFFERS');
 need(metadata.tables.length===35&&metadata.columns.length===351&&metadata.sequences.length===4&&metadata.policies.length===32,'FRESH35_POSTCONDITION_METADATA_COHORT_DIFFERS');
 const sourceRelations=new Map(evidence.inventory.relations.map(row=>[row.relname,row]));
 const columns=metadata.columns.map(column=>{
  const relation=sourceRelations.get(column.table),prior=evidence.inventory.columns.find(row=>String(row.attrelid)===String(relation?.oid)&&row.attnum===column.ordinal);
  need(prior&&prior.attname===column.name&&!prior.attisdropped,'FRESH35_POSTCONDITION_COLUMN_SOURCE_DIFFERS');
  // Fast-default missing-value storage is predecessor physical optimization,
  // not a logical column property. Direct CREATE TABLE has no missing cells.
  const attributes=without(prior,['attrelid','atttypid','attcollation','attacl']);attributes.atthasmissing=false;attributes.attmissingval=null;
  return {...without(column,['typeSql']),metadata:attributes};
 });
 const sequences=metadata.sequences.map(sequence=>without(sequence,['dataType','parameterResolution']));
 const policies=metadata.policies.map(policy=>({...policy,roles:[...policy.roles].sort()}));
 const model=freeze({...core,tables:metadata.tables,columns,sequences,policies,compiledSchemaSha256:compiled.sha256,mappedSchemaSha256:hash(mapped.sql)});
 const json=JSON.stringify(model);need(['$fresh35_metadata$','$fresh35_metadata_guard$','$fresh35_declared_metadata$'].every(delimiter=>!json.includes(delimiter)),'FRESH35_METADATA_DELIMITER_COLLISION');
 const sql=`SET LOCAL search_path=pg_catalog;
SET LOCAL quote_all_identifiers=off;
DO $fresh35_metadata_guard$ DECLARE model jsonb := $fresh35_metadata$${json}$fresh35_metadata$::jsonb; item jsonb; actual jsonb; expected jsonb; BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND (reltablespace<>0 OR reloftype<>0 OR relrewrite<>0)) OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE connamespace='naijue_erp'::regnamespace AND (conparentid<>0 OR contypid<>0)) OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid WHERE r.relnamespace='naijue_erp'::regnamespace AND t.tgparentid<>0) THEN RAISE EXCEPTION 'FRESH35_UNSUPPORTED_OBJECT_INHERITANCE_OR_STORAGE' USING ERRCODE='55000'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>152 THEN RAISE EXCEPTION 'FRESH35_COMPLETE_ROUTINE_COHORT_DIFFERS' USING ERRCODE='55000'; END IF;
 FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(model->'routines') LOOP
  SELECT pg_catalog.jsonb_build_object('definitionSha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',o.rolname,'acl',${aclSql('p.proacl')}) INTO actual FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles o ON o.oid=p.proowner WHERE p.oid=pg_catalog.to_regprocedure(item->>'signature') AND p.pronamespace='naijue_erp'::regnamespace;
  IF actual IS DISTINCT FROM item-'signature' THEN RAISE EXCEPTION 'FRESH35_COMPLETE_ROUTINE_METADATA_DIFFERS' USING ERRCODE='55000'; END IF;
 END LOOP;
 SELECT pg_catalog.jsonb_build_object('name',n.nspname,'owner',o.rolname,'acl',${aclSql('n.nspacl')}) INTO actual FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles o ON o.oid=n.nspowner WHERE n.nspname='naijue_erp';
 IF actual IS DISTINCT FROM model->'schema' OR EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclnamespace='naijue_erp'::regnamespace OR defaclrole=(SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp')) THEN RAISE EXCEPTION 'FRESH35_COMPLETE_SCHEMA_ACL_DIFFERS' USING ERRCODE='55000'; END IF;
 ${compareCollection('relations',relationSql,'FROM pg_catalog.pg_class r JOIN pg_catalog.pg_roles o ON o.oid=r.relowner LEFT JOIN pg_catalog.pg_am am ON am.oid=r.relam',"r.relnamespace='naijue_erp'::regnamespace")}
 ${compareCollection('columnAcls',columnAclSql,'FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class r ON r.oid=a.attrelid',"r.relnamespace='naijue_erp'::regnamespace AND r.relkind='r' AND a.attnum>0")}
 ${compareCollection('constraints',constraintSql,'FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid LEFT JOIN pg_catalog.pg_class rr ON rr.oid=c.confrelid LEFT JOIN pg_catalog.pg_class ix ON ix.oid=c.conindid',"c.connamespace='naijue_erp'::regnamespace")}
 ${compareCollection('indexes',indexSql,'FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class r ON r.oid=i.indrelid JOIN pg_catalog.pg_class ix ON ix.oid=i.indexrelid',"r.relnamespace='naijue_erp'::regnamespace")}
 ${compareCollection('triggers',triggerSql,'FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid LEFT JOIN pg_catalog.pg_constraint c ON c.oid=t.tgconstraint LEFT JOIN pg_catalog.pg_class cr ON cr.oid=c.conrelid LEFT JOIN pg_catalog.pg_class ix ON ix.oid=t.tgconstrindid LEFT JOIN pg_catalog.pg_class rr ON rr.oid=t.tgconstrrelid',"r.relnamespace='naijue_erp'::regnamespace")}
END $fresh35_metadata_guard$;
SET LOCAL quote_all_identifiers=on;
DO $fresh35_declared_metadata$ DECLARE model jsonb := $fresh35_metadata$${json}$fresh35_metadata$::jsonb; actual jsonb; expected jsonb; BEGIN
 ${compareCollection('tables',tableSql,'FROM pg_catalog.pg_class r JOIN pg_catalog.pg_namespace ns ON ns.oid=r.relnamespace JOIN pg_catalog.pg_roles o ON o.oid=r.relowner',"ns.nspname='naijue_erp' AND r.relkind='r'")}
 ${compareCollection('columns',columnSql,'FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class r ON r.oid=a.attrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=r.relnamespace JOIN pg_catalog.pg_type t ON t.oid=a.atttypid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace LEFT JOIN pg_catalog.pg_type element ON element.oid=t.typelem LEFT JOIN pg_catalog.pg_namespace en ON en.oid=element.typnamespace LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=r.oid AND d.adnum=a.attnum LEFT JOIN pg_catalog.pg_collation coll ON coll.oid=a.attcollation LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid=coll.collnamespace',"ns.nspname='naijue_erp' AND r.relkind='r' AND a.attnum>0")}
 ${compareCollection('sequences',sequenceSql,'FROM pg_catalog.pg_sequence s JOIN pg_catalog.pg_class r ON r.oid=s.seqrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=r.relnamespace JOIN pg_catalog.pg_roles o ON o.oid=r.relowner JOIN pg_catalog.pg_type t ON t.oid=s.seqtypid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace',"ns.nspname='naijue_erp'")}
 ${compareCollection('policies',policySql,'FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class r ON r.oid=p.polrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=r.relnamespace',"ns.nspname='naijue_erp'")}
 IF (SELECT count(*) FROM pg_catalog.pg_type WHERE typnamespace='naijue_erp'::regnamespace)<>70 OR EXISTS(SELECT 1 FROM pg_catalog.pg_type t WHERE t.typnamespace='naijue_erp'::regnamespace AND (t.typowner<>(SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp') OR t.typacl IS NOT NULL OR NOT (t.typtype='c' AND EXISTS(SELECT 1 FROM pg_catalog.pg_class r WHERE r.oid=t.typrelid AND r.relnamespace=t.typnamespace AND r.relkind='r' AND r.relname=t.typname) OR t.typtype='b' AND t.typcategory='A' AND EXISTS(SELECT 1 FROM pg_catalog.pg_type e JOIN pg_catalog.pg_class r ON r.oid=e.typrelid WHERE e.oid=t.typelem AND e.typtype='c' AND r.relnamespace=t.typnamespace AND r.relkind='r' AND t.typname='_'||r.relname)))) THEN RAISE EXCEPTION 'FRESH35_COMPLETE_ROWTYPE_METADATA_DIFFERS' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_operator WHERE oprnamespace='naijue_erp'::regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_opclass WHERE opcnamespace='naijue_erp'::regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_opfamily WHERE opfnamespace='naijue_erp'::regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_collation WHERE collnamespace='naijue_erp'::regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_conversion WHERE connamespace='naijue_erp'::regnamespace) OR EXISTS(SELECT 1 FROM pg_catalog.pg_rewrite w JOIN pg_catalog.pg_class r ON r.oid=w.ev_class WHERE r.relnamespace='naijue_erp'::regnamespace) THEN RAISE EXCEPTION 'FRESH35_UNDECLARED_SCHEMA_OBJECTS' USING ERRCODE='55000'; END IF;
END $fresh35_declared_metadata$;
SET LOCAL quote_all_identifiers=off;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
`;
 return freeze({format:'FRESH35_CATALOG_POSTCONDITION_SOURCE_V1',sql,sha256:hash(sql),sourceSetSha256:plan.sourceSetSha256,sourceSchemaSha256:hash(mapped.sql),model,completeMetadataGuardSource:true,engineVerified:false,installationReady:false,targetAdmitted:false});
}
