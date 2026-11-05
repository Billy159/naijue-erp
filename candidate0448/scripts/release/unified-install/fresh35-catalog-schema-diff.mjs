/** Full same-version pg_dump schema comparison, never an installer/admission.
 * Only insignificant outer comments/whitespace, dump framing and the seven explicitly planned NULL-check placements vary.
 * Function bodies, literals, owner/ACL, defaults, policies, triggers, indexes,
 * sequence parameters and all other schema statement tokens remain exact. */
import { createHash } from 'node:crypto';
import { describeFresh35CatalogSpec } from './fresh35-catalog-contract.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error(code);};
function statements(sql){
 const result=[];let tokens=[],i=0;
 while(i<sql.length){
  if(/\s/.test(sql[i])){i++;continue;}
  if(sql.startsWith('--',i)){const end=sql.indexOf('\n',i);i=end<0?sql.length:end+1;continue;}
  if(sql.startsWith('/*',i)){let depth=1;i+=2;while(i<sql.length&&depth){if(sql.startsWith('/*',i)){depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else i++;}need(depth===0,'FRESH35_SCHEMA_DIFF_COMMENT');continue;}
  if(sql[i]==='\\'){const end=sql.indexOf('\n',i),line=sql.slice(i,end<0?sql.length:end).trim();need(tokens.length===0&&/^\\(?:un)?restrict [A-Za-z0-9_]+$/.test(line),'FRESH35_SCHEMA_DIFF_PSQL');i=end<0?sql.length:end+1;continue;}
  const delimiter=sql[i]==='$'?sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]:null;
  if(delimiter){const end=sql.indexOf(delimiter,i+delimiter.length);need(end>=0,'FRESH35_SCHEMA_DIFF_BODY');tokens.push({body:sql.slice(i+delimiter.length,end)});i=end+delimiter.length;continue;}
  if(sql[i]==="'"||sql[i]==='"'){
   const quote=sql[i],escape=quote==="'"&&/[Ee]/.test(sql[i-1]??'')&&(i<2||!/[A-Za-z0-9_$]/.test(sql[i-2]));let value='',closed=false;i++;
   while(i<sql.length){if(escape&&sql[i]==='\\'){value+=sql.slice(i,i+2);i+=2;continue;}if(sql[i]===quote){if(sql[i+1]===quote){value+=quote;i+=2;continue;}i++;closed=true;break;}value+=sql[i++];}
   need(closed,'FRESH35_SCHEMA_DIFF_QUOTE');tokens.push(quote==="'"?{literal:value,escape}:{identifier:value});continue;
  }
  if(sql[i]===';'){if(tokens.length)result.push(tokens);tokens=[];i++;continue;}
  const word=sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];if(word){tokens.push(word.toLowerCase());i+=word.length;continue;}
  const number=sql.slice(i).match(/^[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/)?.[0];if(number){tokens.push(number);i+=number.length;continue;}
  const operator=sql.slice(i).match(/^(?:::|:=|>=|<=|<>|!=|\|\||->>|->|#>>|#>)/)?.[0];if(operator){tokens.push(operator);i+=operator.length;continue;}
  tokens.push(sql[i++]);
 }
 need(tokens.length===0,'FRESH35_SCHEMA_DIFF_UNTERMINATED');return result;
}
const encode=tokens=>JSON.stringify(tokens);
const name=token=>typeof token==='string'?token:token&&typeof token==='object'&&typeof token.identifier==='string'?token.identifier:null;
const literal=(token,value)=>token&&typeof token==='object'&&token.literal===value&&token.escape===false;
function ignoreSetting(t){
 if(t[0]==='set'){
  const exact={statement_timeout:'0',lock_timeout:'0',idle_in_transaction_session_timeout:'0',transaction_timeout:'0',standard_conforming_strings:'on',check_function_bodies:'false',xmloption:'content',client_min_messages:'warning',row_security:'off',default_table_access_method:'heap'};
  const valid=t.length===4&&t[2]==='='&&(Object.hasOwn(exact,t[1])&&(t[3]===exact[t[1]]||t[1]==='default_table_access_method'&&name(t[3])==='heap')||t[1]==='client_encoding'&&literal(t[3],'UTF8')||t[1]==='default_tablespace'&&literal(t[3],''));
  need(valid,'FRESH35_SCHEMA_DIFF_SETTING');return true;
 }
 if(t[0]==='select'){
  const actual=t.length===11&&encode(t.slice(0,5))===encode(['select','pg_catalog','.','set_config','('])&&literal(t[5],'search_path')&&t[6]===','&&literal(t[7],'')&&t[8]===','&&t[9]==='false'&&t[10]===')';
  need(actual,'FRESH35_SCHEMA_DIFF_SETTING');return true;
 }
 return false;
}
function nullConstraint(table,tokens,edges){
 const edge=edges.find(edge=>edge.table===table&&tokens[0]==='constraint'&&name(tokens[1])===edge.check);
 if(!edge)return tokens;
 const a=['constraint',edge.check,'check','(',edge.column,'is','null',')'];
 const b=['constraint',edge.check,'check','(','(',edge.column,'is','null',')',')'];
 const actual=tokens.map((token,index)=>index===1||index===4||index===5?name(token)??token:token);
 if(encode(actual)===encode(a)||encode(actual)===encode(b))return a;
 return tokens;
}
/** This canonicalization is a consistency comparator for schema text, not a SQL
 * parser proving validity or a substitute for a controlled pg_dump observation. */
export function canonicalFresh35SchemaDump(sql,foreignKeyReplacements){
 need(typeof sql==='string'&&Buffer.byteLength(sql)<=32*1024*1024&&sql.startsWith('--')&&sql.includes('-- PostgreSQL database dump\n')&&sql.includes('-- PostgreSQL database dump complete'),'FRESH35_SCHEMA_DIFF_COMPLETE_DUMP_REQUIRED');
 need(Array.isArray(foreignKeyReplacements),'FRESH35_SCHEMA_DIFF_EDGES_REQUIRED');
 const entries=[];
 const add=(key,tokens)=>entries.push({key,tokens});
 for(const t of statements(sql)){
  if(ignoreSetting(t))continue;
  if(t[0]==='create'&&t[1]==='table'&&name(t[2])==='naijue_erp'&&t[3]==='.'&&typeof name(t[4])==='string'&&t[5]==='('){
   const table=name(t[4]);let depth=1,start=6,close=-1;const members=[];
   for(let i=6;i<t.length;i++){if(t[i]==='(')depth++;if(t[i]===')')depth--;if(depth===0){members.push(t.slice(start,i));close=i;break;}if(t[i]===','&&depth===1){members.push(t.slice(start,i));start=i+1;}}
   need(close>=0&&members.length>0&&members.every(member=>member.length>1),'FRESH35_SCHEMA_DIFF_TABLE');add('table:'+table,[...t.slice(0,6),')',...t.slice(close+1)]);
   const columnNames=[];
   for(const member of members){if(member[0]==='constraint'){const edge=foreignKeyReplacements.find(edge=>edge.table===table&&edge.check===name(member[1]));add((edge?'fresh-null:':'inline-constraint:')+table+':'+name(member[1]),edge?nullConstraint(table,member,foreignKeyReplacements):member);}else{need(typeof name(member[0])==='string','FRESH35_SCHEMA_DIFF_COLUMN');columnNames.push(name(member[0]));add('column:'+table+':'+name(member[0]),member);}}
   // Column order affects row types and positional INSERT. Keep it explicitly.
   add('column-order:'+table,columnNames);continue;
  }
  if(t[0]==='alter'&&t[1]==='table'){
   const at=t[2]==='only'?3:2;
   if(name(t[at])==='naijue_erp'&&t[at+1]==='.'&&typeof name(t[at+2])==='string'&&t[at+3]==='add'&&t[at+4]==='constraint'){
    const table=name(t[at+2]),member=t.slice(at+4),edge=foreignKeyReplacements.find(edge=>edge.table===table&&edge.check===name(member[1]));if(edge){need(t[2]==='only','FRESH35_SCHEMA_DIFF_NULL_CHECK_ONLY_REQUIRED');add('fresh-null:'+table+':'+name(member[1]),nullConstraint(table,member,foreignKeyReplacements));continue;}
   }
  }
  // Exact whole-statement preservation prevents dropping a metadata category.
  const key='statement:'+hash(encode(t));add(key,t);
 }
 const exactOrder=entries.filter(entry=>!entry.key.startsWith('fresh-null:'));
 const sevenNullChecks=entries.filter(entry=>entry.key.startsWith('fresh-null:')).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
 need(new Set(entries.map(entry=>entry.key)).size===entries.length,'FRESH35_SCHEMA_DIFF_DUPLICATE_OBJECT');
 return [...exactOrder,...sevenNullChecks];
}
export function compareFresh35SchemaDumps(spec,{compiledSchema,observedSchema}){
 const source=describeFresh35CatalogSpec(spec);need(hash(compiledSchema)===source.compiledSchemaSha256,'FRESH35_SCHEMA_DIFF_COMPILED_SOURCE_DIFFERS');
 const expected=canonicalFresh35SchemaDump(compiledSchema,source.foreignKeyReplacements),observed=canonicalFresh35SchemaDump(observedSchema,source.foreignKeyReplacements);
 const expectedSha256=hash(encode(expected)),observedSha256=hash(encode(observed));
 need(expectedSha256===observedSha256,'FRESH35_FULL_SCHEMA_METADATA_DIFFERS');
 return Object.freeze({format:'FRESH35_FULL_SCHEMA_COMPARISON_V1',state:'SCHEMA_TEXT_MATCH_NOT_ADMISSION',sourceSpecSha256:source.sourceSpecSha256,compiledSchemaSha256:source.compiledSchemaSha256,observedDumpSha256:hash(observedSchema),semanticSha256:expectedSha256,statementOrMemberCount:expected.length,observationOriginAuthenticated:false,roleMembershipsVerified:false,engineDependenciesVerified:false,installationReady:false,targetAdmitted:false});
}
