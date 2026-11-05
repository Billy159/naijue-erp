/** Phase1 read-only source inventory. No driver, database or shell execution. */
import {readFile,readdir,realpath,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as capability from '../../../adapters/postgres/src/native-import-accounting-capability.ts';
import {HISTORY_COLUMNS} from '../../../scripts/release/prepare-runtime26-v6.mjs';

export const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
export const SHA=value=>createHash('sha256').update(value).digest('hex');
export const V22='adapters/postgres/patches/0026-v22-staged-prefix-bind.sql';
export const PATCH_CHAIN=Object.freeze([
 '0026-v9-empty-history-publication-dispatch.sql','0026-v10-native-creation-trigger-record-scope.sql',
 '0026-v11-document-specification-save.sql','0026-v14-core-initialization.sql',
 '0026-category-reorder-undo.sql','0026-history-revision-current-base.sql',
 '0026-v19-barcode-scheme-initialization.sql','0026-v20-history-insert-source-identity.sql',
 '0026-v22-staged-prefix-bind.sql','0026-history-responsible-null-successor.sql',
 '0026-category-depth-successor.sql','0026-history-revision-set-guards-successor.sql'
]);
const PROBES=Object.freeze({
 V6:capability.NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_WRITE_XMIN_FROM_V22_METADATA_PROBE,
 V7:capability.NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_METADATA_PROBE,
 V8:capability.NATIVE_RUNTIME26_COMPLETE_WRITE_ACL_V8_METADATA_PROBE,
 HISTORY:capability.NATIVE_RUNTIME26_HISTORY_DRAFT_LINESET_METADATA_PROBE
});
const validatedInventories=new WeakSet();
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function assertSourceInventory(value){need(validatedInventories.has(value),'ORIGINAL_FROZEN_SOURCE_INVENTORY_REQUIRED');return value;}
const line=(text,index)=>text.slice(0,index).split('\n').length;
const need=(value,reason)=>{if(!value)throw Error(reason);};

/** Split only outside comments, literals and dollar-quoted bodies. This is a
 * provenance/column-name scanner, NOT a PostgreSQL grammar or installed schema. */
export function splitSql(text,delimiter=';'){
 const rows=[];let start=0,depth=0;
 for(let i=0;i<text.length;i++){
  if(text.startsWith('--',i)){const end=text.indexOf('\n',i+2);i=end<0?text.length:end;continue;}
  if(text.startsWith('/*',i)){let nesting=1;i+=2;while(i<text.length&&nesting){if(text.startsWith('/*',i)){nesting++;i+=2;}else if(text.startsWith('*/',i)){nesting--;i+=2;}else i++;}need(!nesting,'UNTERMINATED_SQL_COMMENT');i--;continue;}
  if(text[i]==="'"||text[i]==='"'){const quote=text[i];let closed=false;for(i++;i<text.length;i++){if(text[i]===quote){if(text[i+1]===quote){i++;continue;}closed=true;break;}}need(closed,'UNTERMINATED_SQL_QUOTE');continue;}
  const dollar=text.slice(i).match(/^\$[A-Za-z0-9_]*\$/)?.[0];
  if(dollar){const end=text.indexOf(dollar,i+dollar.length);need(end>=0,'UNTERMINATED_SQL_DOLLAR');i=end+dollar.length-1;continue;}
  if(text[i]==='(')depth++;if(text[i]===')')depth--;
  need(depth>=0,'UNBALANCED_SQL_PARENS');
  if(text[i]===delimiter&&depth===0){rows.push({text:text.slice(start,i),offset:start});start=i+1;}
 }
 need(depth===0,'UNBALANCED_SQL_PARENS');if(text.slice(start).trim())rows.push({text:text.slice(start),offset:start});return rows;
}
export function stripSqlComments(text){
 const blank=value=>value.replace(/[^\n]/g,' ');let result='';
 for(let i=0;i<text.length;){
  if(text.startsWith('--',i)){const end=text.indexOf('\n',i+2),next=end<0?text.length:end;result+=blank(text.slice(i,next));i=next;continue;}
  if(text.startsWith('/*',i)){const begin=i;let nesting=1;i+=2;while(i<text.length&&nesting){if(text.startsWith('/*',i)){nesting++;i+=2;}else if(text.startsWith('*/',i)){nesting--;i+=2;}else i++;}need(!nesting,'UNTERMINATED_SQL_COMMENT');result+=blank(text.slice(begin,i));continue;}
  if(text[i]==="'"||text[i]==='"'){const begin=i,quote=text[i++];let closed=false;for(;i<text.length;i++){if(text[i]===quote){if(text[i+1]===quote){i++;continue;}i++;closed=true;break;}}need(closed,'UNTERMINATED_SQL_QUOTE');result+=text.slice(begin,i);continue;}
  const dollar=text.slice(i).match(/^\$[A-Za-z0-9_]*\$/)?.[0];if(dollar){const end=text.indexOf(dollar,i+dollar.length);need(end>=0,'UNTERMINATED_SQL_DOLLAR');const next=end+dollar.length;result+=text.slice(i,next);i=next;continue;}
  result+=text[i++];
 }
 return result;
}
const uncomment=stripSqlComments;
export function functionDefinitions(text,filename){
 const result=[],re=/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+naijue_erp\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*RETURNS[\s\S]*?\bAS\s+(\$[a-zA-Z0-9_]*\$)([\s\S]*?)\3/i;
 for(const statement of splitSql(text)){
  if(!/^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i.test(uncomment(statement.text).trim()))continue;
  const match=uncomment(statement.text).match(re);need(match,'UNPARSED_FUNCTION_DECLARATION');
  const escaped=match[3].replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),as=match[0].match(new RegExp('\\bAS\\s+'+escaped,'i'));need(as,'UNRESOLVED_FUNCTION_BODY_BOUNDARY');
  const tail=statement.text.slice(match.index+match[0].length),header=match[0].slice(0,as.index)+' '+tail;
  result.push({name:match[1],argumentsSource:match[2],identityArgumentsState:'DECLARED_ARGUMENTS_NOT_PG_NORMALIZED',declarationSignature:'naijue_erp.'+match[1]+'('+match[2].trim()+')',language:header.match(/\bLANGUAGE\s+([a-z_]+)/i)?.[1]?.toLowerCase()??'UNRESOLVED',volatility:header.match(/\b(IMMUTABLE|STABLE|VOLATILE)\b/i)?.[1]?.toUpperCase()??'DEFAULT_VOLATILE',securityDefiner:/\bSECURITY\s+DEFINER\b/i.test(header),searchPathDeclaration:header.match(/\bSET\s+search_path\s*=\s*([\s\S]*?)(?=\b(?:LANGUAGE|SECURITY|IMMUTABLE|STABLE|VOLATILE|STRICT|PARALLEL|LEAKPROOF)\b|$)/i)?.[1]?.trim()??null,attributesSource:header,bodySha256:SHA(match[4]),bodyBytes:Buffer.byteLength(match[4]),source:{path:filename,line:line(text,statement.offset+match.index),spanStart:statement.offset,spanEnd:statement.offset+statement.text.length,statementSha256:SHA(statement.text)}});
 }
 return result;
}
export function mergeDefinitions(definitions,next){
 const previous=definitions.get(next.name);need(!previous||previous.argumentsSource.replace(/\s+/g,' ').trim()===next.argumentsSource.replace(/\s+/g,' ').trim(),'UNRESOLVED_ROUTINE_OVERLOAD_OR_ARGUMENT_IDENTITY_CHANGE:'+next.name);definitions.set(next.name,next);
}
function schemaDeclarations(files){
 const tables=new Map(),statements=[],sequences=[],unresolved=[];
 for(const file of files)for(const statement of splitSql(file.text)){
  const clean=uncomment(statement.text).trim(),provenance={path:file.path,line:line(file.text,statement.offset),statementSha256:SHA(statement.text)};
  if(/^(?:CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX|(?:CONSTRAINT\s+)?TRIGGER|SEQUENCE)|ALTER\s+TABLE|DROP\s+(?:TRIGGER|INDEX))/i.test(clean))statements.push({...provenance,sql:statement.text.trim()});
  const sequence=clean.match(/^CREATE\s+SEQUENCE\s+naijue_erp\.([a-z_][a-z0-9_]*)\b/i);if(sequence)sequences.push({name:sequence[1],source:provenance});
  if(/^DO\b/i.test(clean)&&/\bEXECUTE\s+format\(['"](?:CREATE\s+TRIGGER|ALTER\s+TABLE)/i.test(clean))unresolved.push({...provenance,reason:'DYNAMIC_SCHEMA_DECLARATION_REQUIRES_INDEPENDENT_FINITE_REVIEW'});
  const create=clean.match(/^CREATE\s+TABLE\s+naijue_erp\.([a-z_]+)\s*\(([\s\S]*)\)\s*$/i);
  if(create){need(!tables.has(create[1]),'REPEATED_TABLE_DECLARATION');const columns=new Map();tables.set(create[1],columns);
   for(const piece of splitSql(create[2],',')){const value=uncomment(piece.text).trim();if(!value||/^(?:CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE)\b/i.test(value))continue;const parsed=value.match(/^(?:"([a-z_][a-z0-9_]*)"|([a-z_][a-z0-9_]*))\s+/i),name=parsed?.[1]??parsed?.[2];need(name,'UNPARSED_COLUMN_DECLARATION:'+file.path+':'+value.slice(0,100));need(!columns.has(name),'REPEATED_COLUMN_DECLARATION');columns.set(name,{name,definition:value,source:provenance});}
  }
  const alter=clean.match(/^ALTER\s+TABLE\s+naijue_erp\.([a-z_]+)\s+([\s\S]*)$/i);
  if(alter){const columns=tables.get(alter[1]);need(columns,'ALTER_UNKNOWN_TABLE');for(const piece of splitSql(alter[2],',')){
   const value=piece.text.trim(),add=value.match(/^ADD\s+COLUMN\s+([a-z_][a-z0-9_]*)\s+([\s\S]*)$/i),drop=value.match(/^DROP\s+COLUMN\s+([a-z_][a-z0-9_]*)\b/i),rename=value.match(/^RENAME\s+COLUMN\s+([a-z_][a-z0-9_]*)\s+TO\s+([a-z_][a-z0-9_]*)$/i);
   if(add){need(!columns.has(add[1]),'REPEATED_ADDED_COLUMN');columns.set(add[1],{name:add[1],definition:add[1]+' '+add[2],source:provenance});}
   if(drop){need(columns.delete(drop[1]),'DROP_UNKNOWN_COLUMN');}
   if(rename){const previous=columns.get(rename[1]);need(previous&&!columns.has(rename[2]),'RENAME_UNKNOWN_COLUMN');columns.delete(rename[1]);columns.set(rename[2],{...previous,name:rename[2],source:provenance});}
  }}
 }
 return {tables:[...tables].sort(([a],[b])=>a.localeCompare(b)).map(([name,columns])=>({name,columns:[...columns.values()]})),sequences,statements,unresolved,validation:'SOURCE_SCANNER_NOT_PG_PARSE_OR_INSTALLED_SCHEMA'};
}
export async function loadSourceInventory(){
 const paths=(await readdir(path.join(ROOT,'adapters/postgres/migrations'))).filter(x=>/^\d{4}.*\.sql$/.test(x)).sort().map(x=>'adapters/postgres/migrations/'+x);
 need(paths.length===26,'EXACT_26_SOURCE_MIGRATIONS_REQUIRED');paths.push(...PATCH_CHAIN.map(x=>'adapters/postgres/patches/'+x),'adapters/postgres/patches/0026-live-ledger-balance-pairs.sql','adapters/postgres/patches/0026-history-draft-transfer-line-set-successor.sql');
 const files=[];for(const filename of paths){const full=path.join(ROOT,filename),stat=await lstat(full);need(stat.isFile()&&!stat.isSymbolicLink()&&await realpath(full)===full,'CANONICAL_SOURCE_FILE_REQUIRED');const text=await readFile(full,'utf8');files.push({path:filename,sha256:SHA(text),bytes:Buffer.byteLength(text),text});}
 const v22=files.find(f=>f.path===V22);const parentMatch=v22.text.match(/expected jsonb:=\$routines\$([\s\S]*?)\$routines\$/);need(parentMatch,'V22_PARENT_MANIFEST_MISSING');const parents=JSON.parse(parentMatch[1]);need(parents.length===131&&new Set(parents.map(p=>p.signature)).size===131&&parents.every(p=>/^[a-f0-9]{64}$/.test(p.body)&&/^[a-f0-9]{64}$/.test(p.definition)),'EXACT_131_V22_PARENTS_REQUIRED');
 const marker=v22.text.indexOf('CREATE OR REPLACE FUNCTION naijue_erp.assert_core_initialization_v14('),end=v22.text.lastIndexOf('COMMIT;');need(marker>0&&end>marker,'V22_EXACT_FUNCTION_MEMBER_REQUIRED');const v22Definition=v22.text.slice(marker,end).trim();need(functionDefinitions(v22Definition,V22).length===1,'V22_MEMBER_MUST_CONTAIN_EXACT_ONE_FUNCTION');
 const profiles={};
 for(const [name,probe]of Object.entries(PROBES)){
  const chosen=files.slice(0,26+PATCH_CHAIN.length+(name==='V6'?0:name==='HISTORY'?2:1));
  const definitions=new Map();for(const file of chosen)for(const fn of functionDefinitions(file.text,file.path))mergeDefinitions(definitions,fn);
  const required=[...new Map([...probe.matchAll(/\('([a-z_][a-z0-9_]*)','([a-f0-9]{64})'\)/g)].map(m=>[m[1],{name:m[1],bodySha256:m[2]}])).values()];
  const count=Number(probe.match(/jsonb_array_length\(manifest->'routines'\)=(\d+)/)?.[1]);need(required.length===count&&definitions.size===count,'COMPLETE_ROUTINE_CLOSURE_COUNT_MISMATCH');
  const routines=required.map(r=>{const actual=definitions.get(r.name);need(actual?.bodySha256===r.bodySha256,'FINAL_CHAIN_ROUTINE_BODY_MISMATCH:'+r.name);return {...actual,...r};});
  profiles[name]={expectedRoutineCount:count,probeSha256:SHA(probe),sourceChain:chosen.map(({path,sha256})=>({path,sha256})),routines,schema:schemaDeclarations(chosen)};
 }
 const sourceFiles=files.map(({path,sha256,bytes})=>({path,sha256,bytes}));
 for(const filename of ['adapters/postgres/src/native-import-accounting-capability.ts','scripts/release/prepare-runtime26-v6.mjs','scripts/release/prepare-runtime26-v7.mjs','scripts/release/prepare-runtime26-v8.mjs']){const bytes=await readFile(path.join(ROOT,filename));sourceFiles.push({path:filename,sha256:SHA(bytes),bytes:bytes.length});}
 const inventory=freeze({format:'DOT_RUNTIME26_SOURCE_INVENTORY_PHASE1_V1',sourceFiles,sourceFingerprint:SHA(JSON.stringify(sourceFiles)),profiles,v22:{sourcePath:V22,sourceSha256:v22.sha256,parentManifestSha256:SHA(JSON.stringify(parents)),parents,definition:v22Definition,definitionSha256:SHA(v22Definition),oldGuardPreserved:true},knownAcl:{historyRevisionReadColumns:[...HISTORY_COLUMNS],ordinaryV6XminTables:[...capability.NATIVE_RUNTIME26_COMPLETE_WRITE_XMIN_TABLES],preparation13XminTables:[...capability.NATIVE_RUNTIME26_PREPARATION13_XMIN_TABLES??[]],categoryCminTables:[...capability.NATIVE_RUNTIME26_CATEGORY_CMIN_TABLES],normalDeleteTables:[...capability.NATIVE_RUNTIME26_NORMAL_DELETE_TABLES]},notice:'No SQL parsed/executed; selected final routine body pins match original probes. Source declarations are not independent ACL or canonical approval.'});
 validatedInventories.add(inventory);return inventory;
}
