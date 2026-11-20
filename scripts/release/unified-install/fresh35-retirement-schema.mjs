/** Source transformation for a NEW empty schema only. This does not execute SQL,
 * connect, authorize a target, admit a runtime catalog or migrate existing data. */
import { createHash } from 'node:crypto';
import { requireFresh35RetirementPlan } from './fresh35-retirement-plan.mjs';
import { normalizeRetirementSignature, findLegacyRoutineReferences } from './fresh35-retirement-source.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error(code);};
const header=/^-- Name: ([^\n]+); Type: ([A-Z ]+); Schema: ([^;\n]+); Owner: ([^\n]+)$/;
/** Walk SQL outer syntax so text inside a routine or SQL string cannot become a
 * fake pg_dump section. Nested comments and doubled quotes are handled. */
export function parseFresh35DumpSections(sql){
 need(typeof sql==='string'&&sql.includes('-- PostgreSQL database dump\n'),'FRESH35_DUMP_HEADER_REQUIRED');
 const found=[];let i=0,trailer=sql.length;
 while(i<sql.length){
  if(sql.startsWith('--',i)){
   const end=sql.indexOf('\n',i),line=sql.slice(i,end<0?sql.length:end),match=line.match(header);
   if(line==='-- PostgreSQL database dump complete'&&(i===0||sql[i-1]==='\n'))trailer=i;
   if(match&& (i===0||sql[i-1]==='\n'))found.push({offset:i,name:unquoteIdentifiers(match[1]),type:match[2],schema:unquoteIdentifiers(match[3]),owner:unquoteIdentifiers(match[4])});
   i=end<0?sql.length:end+1;continue;
  }
  if(sql.startsWith('/*',i)){
   let depth=1;i+=2;while(i<sql.length&&depth){if(sql.startsWith('/*',i)){depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else i++;}
   need(depth===0,'FRESH35_DUMP_UNTERMINATED_COMMENT');continue;
  }
  const delimiter=sql[i]==='$'?sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]:null;
  if(delimiter){const end=sql.indexOf(delimiter,i+delimiter.length);need(end>=0,'FRESH35_DUMP_UNTERMINATED_BODY');i=end+delimiter.length;continue;}
  if(sql[i]==="'"||sql[i]==='"'){
   const quote=sql[i],escape=quote==="'"&&/[Ee]/.test(sql[i-1]??'')&&(i<2||!/[A-Za-z0-9_$]/.test(sql[i-2]));let closed=false;i++;
   while(i<sql.length){if(escape&&sql[i]==='\\'){i+=2;continue;}if(sql[i]===quote){if(sql[i+1]===quote){i+=2;continue;}i++;closed=true;break;}i++;}
   need(closed,'FRESH35_DUMP_UNTERMINATED_QUOTE');continue;
  }
  i++;
 }
 return found.map((section,index)=>({...section,text:sql.slice(section.offset,index+1<found.length?found[index+1].offset:trailer),prefix:index===0?sql.slice(0,section.offset):'',suffix:index===found.length-1?sql.slice(trailer):''}));
}
export function replaceFresh35DumpBody(sql,beforeSha256,body){
 const matches=[...sql.matchAll(/\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)([\s\S]*?)\1/g)];
 need(matches.length===1&&hash(matches[0][2])===beforeSha256,'FRESH35_DUMP_FUNCTION_BODY_DIFFERS');
 const match=matches[0],delimiter=match[1];need(!body.includes(delimiter),'FRESH35_DUMP_BODY_DELIMITER_COLLISION');
 const start=match.index+match[0].indexOf(delimiter)+delimiter.length;
 return sql.slice(0,start)+body+sql.slice(start+match[2].length);
}
const unquoteIdentifiers=value=>value.replace(/"([a-z_][a-z0-9_]*)"/g,'$1');
const normalize=value=>normalizeRetirementSignature(unquoteIdentifiers(value).replace(/\s*,\s*/g,',').replace(/\(\s*/g,'(').replace(/\s*\)/g,')'));
function functionKey(name){
 const input=unquoteIdentifiers(name.replace(/^FUNCTION /,'')).replace(/\s*\[\s*\]/g,'[]');const match=input.match(/^([a-z_][a-z0-9_]*)\((.*)\)$/);
 need(match,'FRESH35_UNSUPPORTED_FUNCTION_NAME');
 const args=match[2].trim()?match[2].split(',').map(arg=>{
  const type=arg.trim().replace(/\s+DEFAULT\s+[\s\S]*$/i,'').replace(/^(?:IN|INOUT|VARIADIC)\s+/i,'').replace(/^[a-z_][a-z0-9_]*\s+(?=(?:pg_catalog\.|naijue_erp\.)?(?:uuid|text|jsonb|boolean|bool|integer|int4|bigint|int8|bytea|timestamptz|timestamp|audit_change|import_batch|import_source_row|native_party_import_evidence|sales_header|sales_line|sales_settlement|transfer_header|transfer_line)\b)/,'');
  return type.replace(/^timestamp with time zone$/,'timestamptz');
 }):[];
 return normalize('naijue_erp.'+match[1]+'('+args.join(',')+')');
}
function owningTable(section){
 if(['TABLE','ROW SECURITY'].includes(section.type))return section.name;
 if(['CONSTRAINT','FK CONSTRAINT','TRIGGER','POLICY','DEFAULT'].includes(section.type))return section.name.split(' ')[0];
 if(section.type==='INDEX')return unquoteIdentifiers(section.text).match(/\bON\s+(?:ONLY\s+)?naijue_erp\.([a-z_][a-z0-9_]*)(?:\s+USING\s+[a-z_][a-z0-9_]*)?\s*\(/)?.[1]??null;
 if(section.type==='ACL'||section.type==='COMMENT')return section.name.match(/^(?:TABLE|COLUMN) ([a-z_][a-z0-9_]*)(?:\.|$)/)?.[1]??null;
 return null;
}
/** Bound section declarations to their actual outer statements, not comments. */
function outerStatements(sql){
 const result=[];let tokens=[],i=0,start=0;
 const flush=()=>{if(tokens.length)result.push({tokens,sql:sql.slice(start,i)});tokens=[];start=i;};
 while(i<sql.length){
  if(/\s/.test(sql[i])){i++;continue;}
  if(sql.startsWith('--',i)){const end=sql.indexOf('\n',i);i=end<0?sql.length:end+1;continue;}
  if(sql.startsWith('/*',i)){let depth=1;i+=2;while(i<sql.length&&depth){if(sql.startsWith('/*',i)){depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else i++;}need(depth===0,'FRESH35_SECTION_STATEMENT_COMMENT');continue;}
  if(sql[i]==='\\'){
   const end=sql.indexOf('\n',i),line=sql.slice(i,end<0?sql.length:end);need(tokens.length===0&&/^\\(?:un)?restrict [A-Za-z0-9_]+$/.test(line),'FRESH35_SECTION_STATEMENT_PSQL');i=end<0?sql.length:end+1;start=i;continue;
  }
  const delimiter=sql[i]==='$'?sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]:null;
  if(delimiter){const end=sql.indexOf(delimiter,i+delimiter.length);need(end>=0,'FRESH35_SECTION_STATEMENT_BODY');tokens.push('$body$');i=end+delimiter.length;continue;}
  if(sql[i]==="'"||sql[i]==='"'){
   const quote=sql[i],escape=quote==="'"&&/[Ee]/.test(sql[i-1]??'')&&(i<2||!/[A-Za-z0-9_$]/.test(sql[i-2]));let text='',closed=false;i++;
   while(i<sql.length){if(escape&&sql[i]==='\\'){text+=sql.slice(i,i+2);i+=2;continue;}if(sql[i]===quote){if(sql[i+1]===quote){text+=quote;i+=2;continue;}i++;closed=true;break;}text+=sql[i++];}
   need(closed,'FRESH35_SECTION_STATEMENT_QUOTE');tokens.push(quote==='"'?text:'$literal$');continue;
  }
  if(sql[i]===';'){i++;flush();continue;}
  const word=sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];if(word){tokens.push(word);i+=word.length;}else tokens.push(sql[i++]);
 }
 need(tokens.length===0,'FRESH35_SECTION_STATEMENT_UNTERMINATED');return result;
}
function isStorageSetting(statement){
 const t=statement.tokens;
 return t.length===4&&t[0].toUpperCase()==='SET'&&t[2]==='='&&
  (t[1]==='default_table_access_method'&&t[3]==='heap'||t[1]==='default_tablespace'&&t[3]==='$literal$'&&/SET\s+default_tablespace\s*=\s*''\s*;/i.test(statement.sql));
}
function assertDumpSectionStatements(section){
 const statements=outerStatements(section.text);let creates=0;
 const functionIdentity=t=>{const open=t.indexOf('(');let depth=1,close=open+1;while(close<t.length&&depth){if(t[close]==='(')depth++;if(t[close]===')')depth--;close++;}need(open>=0&&depth===0,'FRESH35_SECTION_STATEMENT_ARGUMENTS');return functionKey(t[open-1]+'('+t.slice(open+1,close-1).join(' ').replace(/\s*\.\s*/g,'.').replace(/\s*\[\s*\]/g,'[]')+')');};
 const qualified=(tokens,at,name)=>tokens[at]==='naijue_erp'&&tokens[at+1]==='.'&&tokens[at+2]===name;
 const name=unquoteIdentifiers(section.name),table=owningTable(section);
 for(const statement of statements){
  if(isStorageSetting(statement))continue;
  const t=statement.tokens,u=t.map(token=>token.toUpperCase());let ok=false;
  if(section.type==='FUNCTION'){
   const routine=functionKey(name).slice('naijue_erp.'.length).split('(')[0];
   if(u[0]==='CREATE'&&u[1]==='FUNCTION'&&qualified(t,2,routine)&&t[5]==='('){ok=functionIdentity(t)===functionKey(name);creates++;}
   else if(u[0]==='ALTER'&&u[1]==='FUNCTION'&&qualified(t,2,routine)&&u.at(-3)==='OWNER'&&u.at(-2)==='TO'&&t.at(-1)===section.owner)ok=functionIdentity(t)===functionKey(name);
  }else if(section.type==='TABLE'){
   if(u[0]==='CREATE'&&u[1]==='TABLE'&&qualified(t,2,name)&&t[5]==='('){ok=true;creates++;}
   else if(u[0]==='ALTER'&&u[1]==='TABLE'&&qualified(t,2,name)&&u.slice(5).join(' ')==='OWNER TO '+section.owner.toUpperCase())ok=true;
  }else if(['CONSTRAINT','FK CONSTRAINT'].includes(section.type)){
   const at=u[2]==='ONLY'?3:2;ok=u[0]==='ALTER'&&u[1]==='TABLE'&&qualified(t,at,table)&&u[at+3]==='ADD'&&u[at+4]==='CONSTRAINT'&&t[at+5]===name.split(' ')[1];creates++;
  }else if(section.type==='TRIGGER'){
   const at=u[1]==='CONSTRAINT'?2:1,on=u.indexOf('ON');ok=u[0]==='CREATE'&&u[at]==='TRIGGER'&&t[at+1]===name.split(' ')[1]&&qualified(t,on+1,table);creates++;
  }else if(section.type==='INDEX'){
   const at=u[1]==='UNIQUE'?2:1,on=u.indexOf('ON');ok=u[0]==='CREATE'&&u[at]==='INDEX'&&t[at+1]===name&&qualified(t,on+1+(u[on+1]==='ONLY'?1:0),table);creates++;
  }else if(section.type==='POLICY'){
   const on=u.indexOf('ON');ok=u[0]==='CREATE'&&u[1]==='POLICY'&&t[2]===name.split(' ')[1]&&qualified(t,on+1,table);creates++;
  }else if(section.type==='ROW SECURITY'){
   ok=u[0]==='ALTER'&&u[1]==='TABLE'&&qualified(t,2,table)&&u.slice(5).join(' ')==='ENABLE ROW LEVEL SECURITY';creates++;
  }else if(section.type==='SCHEMA'){
   if(u[0]==='CREATE'&&u[1]==='SCHEMA'&&t[2]===name&&t.length===3){ok=true;creates++;}
   else ok=u[0]==='ALTER'&&u[1]==='SCHEMA'&&t[2]===name&&u[3]==='OWNER'&&u[4]==='TO'&&t[5]===section.owner&&t.length===6;
  }else if(section.type==='SEQUENCE'){
   if(u[0]==='CREATE'&&u[1]==='SEQUENCE'&&qualified(t,2,name)){ok=true;creates++;}
   else ok=u[0]==='ALTER'&&u[1]==='SEQUENCE'&&qualified(t,2,name)&&u.slice(5).join(' ')==='OWNER TO '+section.owner.toUpperCase();
  }else if(section.type==='SEQUENCE OWNED BY'){
   ok=u[0]==='ALTER'&&u[1]==='SEQUENCE'&&qualified(t,2,name)&&u[5]==='OWNED'&&u[6]==='BY';creates++;
  }else if(section.type==='DEFAULT'){
   const at=u[2]==='ONLY'?3:2;ok=u[0]==='ALTER'&&u[1]==='TABLE'&&qualified(t,at,table)&&u[at+3]==='ALTER'&&u[at+4]==='COLUMN'&&t[at+5]===name.split(' ')[1]&&u[at+6]==='SET'&&u[at+7]==='DEFAULT';creates++;
  }else if(section.type==='ACL'||section.type==='COMMENT'){
   ok=section.type==='ACL'?['GRANT','REVOKE'].includes(u[0]):u[0]==='COMMENT'&&u[1]==='ON';
   const target=name.match(/^(FUNCTION|TABLE|COLUMN|SEQUENCE|SCHEMA) (.+)$/);
   need(target,'FRESH35_SECTION_STATEMENT_METADATA_TARGET:'+section.type+':'+section.name);
   const kindAt=u.indexOf(target[1]==='COLUMN'&&section.type==='ACL'?'TABLE':target[1]);need(kindAt>=0,'FRESH35_SECTION_STATEMENT_METADATA_TARGET:'+section.type+':'+section.name);
   if(target[1]==='FUNCTION'){
    const func=t.slice(kindAt+1).join(' '),match=func.match(/^naijue_erp\s*\.\s*([a-z_][a-z0-9_]*)\s*\((.*?)\)/);
    ok=ok&&!!match&&functionKey(match[1]+'('+match[2].replace(/\s*\.\s*/g,'.')+')')===functionKey(name);
   }else if(target[1]==='SCHEMA')ok=ok&&t[kindAt+1]==='naijue_erp';
   else{
    ok=ok&&qualified(t,kindAt+1,target[2].split('.')[0]);
    if(target[1]==='COLUMN'){
     const column=target[2].split('.')[1];need(column,'FRESH35_SECTION_STATEMENT_COLUMN_TARGET');
     if(section.type==='COMMENT')ok=ok&&t[kindAt+4]==='.'&&t[kindAt+5]===column;
     else{let groups=0;for(let i=1;i<kindAt;i++)if(t[i]==='('){groups++;ok=ok&&t[i+1]===column&&t[i+2]===')';}ok=ok&&groups>0;}
    }
   }
  }
  need(ok,'FRESH35_SECTION_STATEMENT_DIFFERS:'+section.type+':'+section.name);
 }
 if(!['ACL','COMMENT'].includes(section.type))need(creates===1,'FRESH35_SECTION_COHORT_DIFFERS:'+section.name);
}
function assertDumpOuterSettings(text){
 for(const {tokens:t,sql} of outerStatements(text)){
  const u=t.map(token=>token.toUpperCase());
  const allowed=['statement_timeout','lock_timeout','idle_in_transaction_session_timeout','transaction_timeout','client_encoding','standard_conforming_strings','check_function_bodies','xmloption','client_min_messages','row_security','default_tablespace','default_table_access_method'];
  need(u[0]==='SET'&&allowed.includes(t[1])&&t[2]==='='||t.join(' ')==='SELECT pg_catalog . set_config ( $literal$ , $literal$ , false )'&&/SELECT pg_catalog\.set_config\('search_path', '', false\);/.test(sql),'FRESH35_SECTION_STATEMENT_PROLOGUE');
 }
}

/** The caller must obtain and independently verify the schema-only dump from the
 * exact current empty synthetic predecessor. This result is still unadmitted SQL. */
export function compileFresh35SchemaFromDump(dump,plan,binding){
 requireFresh35RetirementPlan(plan);
 need(plan?.format==='FRESH35_DIRECT_SCHEMA_RETIREMENT_PLAN_V1'&&plan.predecessorRoutines?.length===178&&plan.retainedRoutines?.length===152&&plan.omittedRoutines?.length===26&&plan.retainedTables?.length===35&&plan.omittedTables?.length===21,'FRESH35_EXACT_PLAN_REQUIRED');
 need(binding&&Object.keys(binding).sort().join(',')==='dumpSha256,predecessorSourceSpecSha256'&&binding.dumpSha256===hash(dump)&&binding.predecessorSourceSpecSha256===plan.predecessorSourceSpecSha256,'FRESH35_DUMP_SOURCE_BINDING_DIFFERS');
 need(dump.includes('-- PostgreSQL database dump complete'),'FRESH35_COMPLETE_DUMP_REQUIRED');
 const sections=parseFresh35DumpSections(dump);
 need(sections.length>0,'FRESH35_DUMP_SECTIONS_REQUIRED');assertDumpOuterSettings(sections[0].prefix);assertDumpOuterSettings(sections.at(-1).suffix);
 const allTables=[...plan.retainedTables,...plan.omittedTables].sort(),dumpTables=sections.filter(section=>section.type==='TABLE'&&section.schema==='naijue_erp').map(section=>section.name).sort();
 need(JSON.stringify(allTables)===JSON.stringify(dumpTables),'FRESH35_DUMP_TABLE_COHORT_DIFFERS');
 const before=new Map(plan.predecessorRoutines.map(routine=>[normalize(routine.signature),routine]));
 const retained=new Map(plan.retainedRoutines.map(routine=>[normalize(routine.signature),routine]));
 const omitted=new Set(plan.omittedRoutines.map(routine=>normalize(routine.signature)));
 const functions=sections.filter(section=>section.type==='FUNCTION');
 need(functions.length===178&&new Set(functions.map(section=>functionKey(section.name))).size===178,'FRESH35_DUMP_FUNCTION_COHORT_DIFFERS');
 const output=[],decisions=[],seenFunctions=new Set(),replacedEdges=new Set();
 const allowed=new Set(['SCHEMA','FUNCTION','TABLE','SEQUENCE','SEQUENCE OWNED BY','DEFAULT','CONSTRAINT','INDEX','TRIGGER','FK CONSTRAINT','POLICY','ROW SECURITY','ACL','COMMENT']);
 for(const section of sections){
  need(allowed.has(section.type),'FRESH35_UNSUPPORTED_DUMP_SECTION:'+section.type);
  need(section.schema==='naijue_erp'||section.schema==='-'&&section.type==='SCHEMA'&&section.name==='naijue_erp'||section.schema==='-'&&['ACL','COMMENT'].includes(section.type)&&section.name==='SCHEMA naijue_erp','FRESH35_UNEXPECTED_DUMP_SCHEMA');
  assertDumpSectionStatements(section);
  let text=section.text,action='RETAIN_UNCHANGED';const table=owningTable(section);
  if(section.type==='FUNCTION'){
   const key=functionKey(section.name),prior=before.get(key);need(prior,'FRESH35_UNKNOWN_DUMP_FUNCTION:'+section.name);
   // Verify every body, including omitted functions, against the actual178 source.
   replaceFresh35DumpBody(text,prior.bodySha256,prior.body);seenFunctions.add(key);
   if(omitted.has(key))action='OMIT_LEGACY_FUNCTION';
   else{const next=retained.get(key);need(next,'FRESH35_FUNCTION_DISPOSITION_MISSING');if(next.bodySha256!==prior.bodySha256){text=replaceFresh35DumpBody(text,prior.bodySha256,next.body);action='SPECIALIZE_FUNCTION_BODY';}}
  }else if(['ACL','COMMENT'].includes(section.type)&&section.name.startsWith('FUNCTION ')){
   const key=functionKey(section.name);need(before.has(key),'FRESH35_UNKNOWN_FUNCTION_METADATA');if(omitted.has(key))action='OMIT_LEGACY_FUNCTION_METADATA';
  }else if(table){
   need(allTables.includes(table),'FRESH35_UNKNOWN_DUMP_TABLE:'+table);
   if(plan.omittedTables.includes(table))action='OMIT_LEGACY_TABLE_OBJECT';
   else if(section.type==='FK CONSTRAINT'){
    const edge=plan.foreignKeyReplacements.find(edge=>section.name===edge.table+' '+edge.fk);
    if(edge){
     need(!replacedEdges.has(edge.fk)&&unquoteIdentifiers(text).includes('FOREIGN KEY ('+edge.column+') REFERENCES naijue_erp.'+edge.target+'(id)'),'FRESH35_PREDECESSOR_FK_DEFINITION_DIFFERS');
     const expected=`ALTER TABLE ONLY naijue_erp.${edge.table} ADD CONSTRAINT ${edge.fk} FOREIGN KEY (${edge.column}) REFERENCES naijue_erp.${edge.target}(id)${edge.deferred?' DEFERRABLE INITIALLY DEFERRED':''};`;
     const actualStatements=outerStatements(text).filter(statement=>!isStorageSetting(statement));
     need(actualStatements.length===1&&actualStatements[0].tokens.map(token=>token.toUpperCase()).join(' ')===outerStatements(expected)[0].tokens.map(token=>token.toUpperCase()).join(' '),'FRESH35_PREDECESSOR_FK_OPTIONS_DIFFER');
     replacedEdges.add(edge.fk);text=`-- Fresh-only null reference invariant.\nALTER TABLE ONLY naijue_erp.${edge.table}\n    ADD CONSTRAINT ${edge.check} CHECK (${edge.column} IS NULL);\n\n`;action='REPLACE_FK_WITH_VALIDATED_NULL_CHECK';
    }
   }
  }else need(['SCHEMA','SEQUENCE','SEQUENCE OWNED BY','ACL','COMMENT'].includes(section.type),'FRESH35_UNCLASSIFIED_DUMP_OBJECT:'+section.name);
  decisions.push({name:section.name,type:section.type,action,beforeSha256:hash(section.text),afterSha256:action.startsWith('OMIT')?null:hash(text)});
  if(!action.startsWith('OMIT'))output.push(text);
  else for(const statement of outerStatements(section.text).filter(isStorageSetting))output.push(statement.tokens[1]==='default_tablespace'?"\nSET default_tablespace = '';\n":'\nSET default_table_access_method = heap;\n');
 }
 need(seenFunctions.size===178&&replacedEdges.size===7,'FRESH35_INCOMPLETE_DUMP_TRANSFORM');
 const sql=sections[0].prefix+output.join('')+sections.at(-1).suffix;
 // This includes quoted SQL and metadata, so latent regprocedure/rowtype names
 // cannot survive merely because PostgreSQL does not track PL/pgSQL body reads.
 for(const section of output)for(const table of findLegacyRoutineReferences(section))throw Error('FRESH35_FINAL_SCHEMA_LEGACY_TABLE_REFERENCE:'+table);
 for(const routine of plan.omittedRoutines)need(!new RegExp('(?:\\b|\")'+routine.name+'\"?\\s*\\(','i').test(sql),'FRESH35_FINAL_SCHEMA_OMITTED_FUNCTION_REFERENCE:'+routine.name);
 return {format:'FRESH35_DIRECT_SCHEMA_SOURCE_V1',sql,sha256:hash(sql),predecessorDumpSha256:binding.dumpSha256,predecessorSourceSpecSha256:binding.predecessorSourceSpecSha256,
  tableCount:35,routineCount:152,decisions,existingTargetMutation:false,engineVerified:false,installationReady:false,
  remaining:['EXACT_SOURCE_DUMP_AND_PG_DEPEND_REVIEW','NEW_EMPTY_TARGET_GUARD_AND_MIGRATION_LINEAGE','DISTINCT152_CATALOG_ACL_AND_INSTALLATION_RECORD','ISOLATED_INSTALL_IMPORT_REPLAY_ROLLBACK_AND_ORDINARY_BUSINESS']};
}
