/** Read-only extraction of portable expectations from a generated pg_dump.
 *
 * This is deliberately NOT a general SQL parser or an admission decision. It
 * accepts the closed declaration layouts used by the fresh35 source projection,
 * resolves names rather than copying predecessor OIDs or pg_node_tree values,
 * and fails when a scoped section cannot be completely consumed.
 *
 * Expression comparison requires the same PostgreSQL deparser context as the
 * dump: PostgreSQL 17, search_path=pg_catalog, quote_all_identifiers=on and
 * pg_get_expr(..., false). The USING / WITH CHECK and generated-column syntax
 * contributes one wrapper pair which is removed here; no other parentheses,
 * whitespace or identifier spelling is rewritten. Text equality is not a proof
 * of semantic equivalence across server/deparser versions. typeSql is source
 * spelling; typeSchema/typeName/typeModifier/arrayDimensions are resolved
 * catalog expectations, never source OIDs. Explicit COLLATE is resolved by name.
 *
 * aclStatements are ordered source operations, NOT a complete effective ACL.
 * An independent guard must start with PostgreSQL owner/default ACLs, apply the
 * operations, expand ALL for the object kind, preserve grant options/grantors,
 * and compare the entire resulting ACL (including absence of extra grants).
 * Fresh-role creation/NOLOGIN/membership and implicit owner powers are separate
 * checks. No function ACLs, defaults privileges, cluster ACLs, row data, sequence
 * current values, trigger/constraint/index definitions or routine semantics are
 * admitted here. Unsupported scoped layouts throw instead of inventing values.
 */
import { createHash } from 'node:crypto';
import { parseFresh35DumpSections } from './fresh35-retirement-schema.mjs';

const need=(ok,code)=>{if(!ok)throw Error('FRESH35_METADATA_'+code);};
const safeName=value=>typeof value==='string'&&/^[a-z_][a-z0-9_]*$/.test(value);
const schemaName='naijue_erp';
const genuineMetadata=new WeakSet();
/** This brand proves only this parser produced the frozen source expectations.
 * It is never a database/catalog/installation admission. */
export function requireFresh35RetirementMetadata(value){need(value&&genuineMetadata.has(value),'GENUINE_SOURCE_METADATA_REQUIRED');return value;}
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const sha256=value=>createHash('sha256').update(value).digest('hex');

/** Tokens retain byte-compatible JS string offsets so expression text is never
 * rebuilt by joining tokens. Comments, nested brackets and SQL doubled quotes
 * cannot split lists or synthesize a statement. */
function lex(sql){
 const tokens=[];let i=0;
 while(i<sql.length){
  if(/\s/.test(sql[i])){i++;continue;}
  if(sql.startsWith('--',i)){const end=sql.indexOf('\n',i);i=end<0?sql.length:end+1;continue;}
  if(sql.startsWith('/*',i)){let depth=1;i+=2;while(i<sql.length&&depth){if(sql.startsWith('/*',i)){depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else i++;}need(!depth,'UNTERMINATED_COMMENT');continue;}
  const start=i,escaped=/[Ee]/.test(sql[i])&&sql[i+1]==="'";
  if(escaped||sql[i]==="'"||sql[i]==='"'){
   const quote=escaped?sql[++i]:sql[i];i++;let value='',closed=false;
   while(i<sql.length){if(escaped&&sql[i]==='\\'){value+=sql.slice(i,i+2);i+=2;continue;}if(sql[i]===quote){if(sql[i+1]===quote){value+=quote;i+=2;continue;}i++;closed=true;break;}value+=sql[i++];}
   need(closed,'UNTERMINATED_QUOTE');tokens.push({kind:quote==='"'?'identifier':'string',value,start,end:i});continue;
  }
  const delimiter=sql[i]==='$'?sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]:null;
  if(delimiter){const end=sql.indexOf(delimiter,i+delimiter.length);need(end>=0,'UNTERMINATED_DOLLAR_QUOTE');i=end+delimiter.length;tokens.push({kind:'string',value:sql.slice(start,i),start,end:i});continue;}
  const word=sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];
  if(word){i+=word.length;tokens.push({kind:'word',value:word,start,end:i});continue;}
  const integer=sql.slice(i).match(/^\d+/)?.[0];
  if(integer){i+=integer.length;tokens.push({kind:'number',value:integer,start,end:i});continue;}
  need(sql[i]!=='\\','UNSUPPORTED_PSQL');tokens.push({kind:'punct',value:sql[i],start,end:++i});
 }
 return tokens;
}
const is=(token,value)=>token?.kind==='word'&&token.value===value;
const punct=(token,value)=>token?.kind==='punct'&&token.value===value;
function identifier(token,context){need(token?.kind==='identifier'&&safeName(token.value),context+'_IDENTIFIER');return token.value;}
function sameToken(token,value){return token?.value===value;}
function qualified(tokens,at,context){const schema=identifier(tokens[at],context),name=identifier(tokens[at+2],context);need(punct(tokens[at+1],'.')&&schema===schemaName,context+'_QUALIFIED_NAME');return {schema,name,end:at+3};}
function plain(sql,tokens){return tokens.length?sql.slice(tokens[0].start,tokens.at(-1).end):'';}
function statements(sql){
 const tokens=lex(sql),result=[];let start=0;const stack=[];
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i];if(punct(t,'(')||punct(t,'['))stack.push(t.value);
  if(punct(t,')')||punct(t,']'))need(stack.pop()===(t.value===')'?'(':'['),'UNBALANCED_GROUP');
  if(punct(t,';')){need(!stack.length,'STATEMENT_INSIDE_GROUP');need(i>start,'EMPTY_STATEMENT');result.push({tokens:tokens.slice(start,i),sql:sql.slice(tokens[start].start,t.end)});start=i+1;}
 }
 need(!stack.length,'UNBALANCED_GROUP');need(start===tokens.length,'UNTERMINATED_STATEMENT');return result;
}
function closeGroup(tokens,start,context){
 need(punct(tokens[start],'('),context+'_GROUP_REQUIRED');const stack=['('];
 for(let i=start+1;i<tokens.length;i++){
  const t=tokens[i];if(punct(t,'(')||punct(t,'['))stack.push(t.value);
  else if(punct(t,')')||punct(t,']')){need(stack.pop()===(t.value===')'?'(':'['),context+'_UNBALANCED_GROUP');if(!stack.length)return i;}
 }
 throw Error('FRESH35_METADATA_'+context+'_UNBALANCED_GROUP');
}
function splitList(tokens,context){
 const parts=[];let start=0;const stack=[];
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i];if(punct(t,'(')||punct(t,'['))stack.push(t.value);
  else if(punct(t,')')||punct(t,']'))need(stack.pop()===(t.value===')'?'(':'['),context+'_UNBALANCED_GROUP');
  else if(punct(t,',')&&!stack.length){need(i>start,context+'_EMPTY_LIST_ITEM');parts.push(tokens.slice(start,i));start=i+1;}
 }
 need(!stack.length&&start<tokens.length,context+'_UNBALANCED_OR_EMPTY_LIST');parts.push(tokens.slice(start));return parts;
}
function onlyOwner(statement,kind,name,owner){
 const t=statement.tokens;need(t.length===8&&is(t[0],'ALTER')&&is(t[1],kind),'TABLE_OWNER_REQUIRED');const q=qualified(t,2,kind+'_OWNER');need(q.name===name&&is(t[5],'OWNER')&&is(t[6],'TO')&&identifier(t[7],kind+'_OWNER')===owner,kind+'_OWNER_DIFFERS');
}
function storageSetting(statement){
 const t=statement.tokens;
 return t.length===4&&is(t[0],'SET')&&punct(t[2],'=')&&(is(t[1],'default_tablespace')&&t[3].kind==='string'&&t[3].value===''||is(t[1],'default_table_access_method')&&t[3].value==='heap');
}
function sectionStatements(section){return statements(section.text).filter(statement=>!storageSetting(statement));}
function declaredOwner(section){need(safeName(section.owner),'OWNER_NAME_REQUIRED');return section.owner;}

const builtinTypes={uuid:{typeName:'uuid'},text:{typeName:'text'},jsonb:{typeName:'jsonb'},date:{typeName:'date'},bigint:{typeName:'int8'},boolean:{typeName:'bool'},integer:{typeName:'int4'}};
function columnType(tokens,sql){
 let end=0,typeName,typeModifier=-1,arrayDimensions=0;
 const t=tokens[0];
 if(t&&(t.kind==='word'||t.kind==='identifier')&&builtinTypes[t.value]){typeName=builtinTypes[t.value].typeName;end=1;}
 else if(is(t,'timestamp')){need(is(tokens[1],'with')&&is(tokens[2],'time')&&is(tokens[3],'zone'),'COLUMN_UNSUPPORTED_TIMESTAMP');typeName='timestamptz';end=4;}
 else if(is(t,'numeric')){
  need(punct(tokens[1],'(')&&tokens[2]?.kind==='number'&&punct(tokens[3],',')&&tokens[4]?.kind==='number'&&punct(tokens[5],')'),'COLUMN_UNSUPPORTED_NUMERIC');
  const precision=Number(tokens[2].value),scale=Number(tokens[4].value);need(precision>=1&&precision<=1000&&scale>=0&&scale<=precision,'COLUMN_UNSUPPORTED_NUMERIC');typeName='numeric';typeModifier=(precision<<16)+scale+4;end=6;
 }else throw Error('FRESH35_METADATA_COLUMN_UNSUPPORTED_TYPE');
 if(punct(tokens[end],'[')){need(punct(tokens[end+1],']')&&typeName==='uuid','COLUMN_UNSUPPORTED_ARRAY');arrayDimensions=1;end+=2;}
 return {end,typeSql:plain(sql,tokens.slice(0,end)),typeSchema:'pg_catalog',typeName,typeModifier,arrayDimensions};
}
function column(section,tokens,ordinal){
 const name=identifier(tokens[0],'COLUMN'),type=columnType(tokens.slice(1),section.text);let i=1+type.end,notNull=false,defaultExpression=null,generatedExpression=null,generated='',collation=null;
 while(i<tokens.length){
  if(is(tokens[i],'NOT')){need(!notNull&&is(tokens[i+1],'NULL'),'COLUMN_UNSUPPORTED_NULLABILITY');notNull=true;i+=2;}
  else if(is(tokens[i],'COLLATE')){
   need(!collation&&tokens[i+1]?.kind==='identifier'&&punct(tokens[i+2],'.')&&tokens[i+3]?.kind==='identifier','COLUMN_COLLATION_QUALIFIED_REQUIRED');
   need(tokens[i+1].value==='pg_catalog'&&tokens[i+3].value==='C','COLUMN_COLLATION_UNSUPPORTED');collation={schema:'pg_catalog',name:'C'};i+=4;
  }else if(is(tokens[i],'DEFAULT')){
   need(defaultExpression===null&&generated==='','COLUMN_DUPLICATE_EXPRESSION');let end=i+1;const stack=[];
   for(;end<tokens.length;end++){const t=tokens[end];if(!stack.length&&(is(t,'NOT')&&is(tokens[end+1],'NULL')||is(t,'COLLATE')))break;if(punct(t,'(')||punct(t,'['))stack.push(t.value);else if(punct(t,')')||punct(t,']'))need(stack.pop()===(t.value===')'?'(':'['),'COLUMN_DEFAULT_GROUP');}
   need(end>i+1&&!stack.length,'COLUMN_DEFAULT_REQUIRED');defaultExpression=plain(section.text,tokens.slice(i+1,end));i=end;
  }else if(is(tokens[i],'GENERATED')){
   need(defaultExpression===null&&generated===''&&is(tokens[i+1],'ALWAYS')&&is(tokens[i+2],'AS'),'COLUMN_UNSUPPORTED_GENERATED');const close=closeGroup(tokens,i+3,'COLUMN_GENERATED');need(close>i+4&&is(tokens[close+1],'STORED'),'COLUMN_UNSUPPORTED_GENERATED');generatedExpression=plain(section.text,tokens.slice(i+4,close));generated='s';i=close+2;
  }else throw Error('FRESH35_METADATA_COLUMN_UNSUPPORTED_CLAUSE:'+name);
 }
 const {end,...resolved}=type;
 return {schema:section.schema,table:section.name,name,ordinal,...resolved,notNull,defaultExpression,generatedExpression,generated,identity:'',collation};
}
function parseTable(section){
 need(section.schema===schemaName&&safeName(section.name),'TABLE_TARGET');const owner=declaredOwner(section),ss=sectionStatements(section);need(ss.length===2,'TABLE_OWNER_REQUIRED');const t=ss[0].tokens;
 need(is(t[0],'CREATE')&&is(t[1],'TABLE'),'TABLE_DECLARATION');const q=qualified(t,2,'TABLE');need(q.name===section.name,'TABLE_TARGET');const close=closeGroup(t,5,'TABLE');need(close===t.length-1,'TABLE_UNSUPPORTED_SUFFIX');onlyOwner(ss[1],'TABLE',section.name,owner);
 const columns=[];
 for(const item of splitList(t.slice(6,close),'TABLE')){
  if(is(item[0],'CONSTRAINT')){identifier(item[1],'TABLE_CONSTRAINT');need(is(item[2],'CHECK')&&closeGroup(item,3,'TABLE_CONSTRAINT')===item.length-1,'TABLE_UNSUPPORTED_CONSTRAINT_LAYOUT');}
  else{const next=column(section,item,columns.length+1);need(!columns.some(c=>c.name===next.name),'COLUMN_DUPLICATE');columns.push(next);}
 }
 need(columns.length>0,'TABLE_COLUMNS_REQUIRED');
 return {table:{schema:section.schema,name:section.name,owner,columnCount:columns.length,rowSecurity:false,forceRowSecurity:false},columns};
}
function signedInteger(tokens,at,context){let sign='';if(punct(tokens[at],'-')||punct(tokens[at],'+'))sign=tokens[at++].value;need(tokens[at]?.kind==='number',context+'_INTEGER_REQUIRED');const value=BigInt(sign+tokens[at].value).toString();return {value,end:at+1};}
const sequenceLimits={smallint:['-32768','32767','int2'],integer:['-2147483648','2147483647','int4'],bigint:['-9223372036854775808','9223372036854775807','int8']};
function parseSequence(section){
 need(section.schema===schemaName&&safeName(section.name),'SEQUENCE_TARGET');const owner=declaredOwner(section),ss=sectionStatements(section);need(ss.length===2,'SEQUENCE_OWNER_REQUIRED');const t=ss[0].tokens;
 need(is(t[0],'CREATE')&&is(t[1],'SEQUENCE'),'SEQUENCE_DECLARATION');need(qualified(t,2,'SEQUENCE').name===section.name,'SEQUENCE_TARGET');onlyOwner(ss[1],'SEQUENCE',section.name,owner);
 let i=5,dataType='bigint',start,increment,min,max,cache,cycle=false;const seen=new Set();
 while(i<t.length){
  const key=t[i]?.value;need(!seen.has(key),'SEQUENCE_DUPLICATE_OPTION');
  if(is(t[i],'AS')){seen.add(key);dataType=t[i+1]?.value;need(t[i+1]?.kind==='word'&&sequenceLimits[dataType],'SEQUENCE_UNSUPPORTED_TYPE');i+=2;continue;}
  if(is(t[i],'START')||is(t[i],'INCREMENT')){seen.add(key);need(is(t[i+1],key==='START'?'WITH':'BY'),'SEQUENCE_OPTION');const n=signedInteger(t,i+2,'SEQUENCE');if(key==='START')start=n.value;else increment=n.value;i=n.end;continue;}
  if(is(t[i],'NO')){const option=t[i+1]?.value;need(['MINVALUE','MAXVALUE','CYCLE'].includes(option)&&!seen.has(option),'SEQUENCE_OPTION');seen.add(option);if(option==='MINVALUE')min=null;else if(option==='MAXVALUE')max=null;else cycle=false;i+=2;continue;}
  if(['MINVALUE','MAXVALUE','CACHE'].includes(key)&&t[i].kind==='word'){seen.add(key);const n=signedInteger(t,i+1,'SEQUENCE');if(key==='MINVALUE')min=n.value;else if(key==='MAXVALUE')max=n.value;else cache=n.value;i=n.end;continue;}
  if(is(t[i],'CYCLE')){seen.add(key);cycle=true;i++;continue;}
  throw Error('FRESH35_METADATA_SEQUENCE_UNSUPPORTED_OPTION');
 }
 need(start!==undefined&&increment!==undefined&&min!==undefined&&max!==undefined&&cache!==undefined,'SEQUENCE_PARAMETERS_REQUIRED');
 // pg_sequence.seqincrement and seqcache are int8 even when seqtypid names a
 // smaller sequence type. Keep exact decimals and reject out-of-storage values.
 // https://www.postgresql.org/docs/17/catalog-pg-sequence.html
 const incrementValue=BigInt(increment),cacheValue=BigInt(cache),int8Min=-9223372036854775808n,int8Max=9223372036854775807n;
 need(incrementValue>=int8Min&&incrementValue<=int8Max&&cacheValue<=int8Max,'SEQUENCE_PARAMETERS_OUT_OF_INT8_RANGE');
 need(incrementValue!==0n&&cacheValue>0n,'SEQUENCE_INVALID_PARAMETERS');
 const [lowest,highest,typeName]=sequenceLimits[dataType],ascending=BigInt(increment)>0n;
 min??=ascending?'1':lowest;max??=ascending?highest:'-1';
 need(BigInt(min)>=BigInt(lowest)&&BigInt(max)<=BigInt(highest)&&BigInt(min)<BigInt(max)&&BigInt(start)>=BigInt(min)&&BigInt(start)<=BigInt(max),'SEQUENCE_PARAMETERS_OUT_OF_RANGE');
 return {schema:section.schema,name:section.name,owner,dataType,typeSchema:'pg_catalog',typeName,start,increment,min,max,cache,cycle,ownedBy:null,parameterResolution:{postgresqlMajor:17,dataTypeDefaulted:!seen.has('AS'),minimumDefaulted:seen.has('MINVALUE')&&ss[0].tokens.some((token,index)=>is(token,'NO')&&is(ss[0].tokens[index+1],'MINVALUE')),maximumDefaulted:seen.has('MAXVALUE')&&ss[0].tokens.some((token,index)=>is(token,'NO')&&is(ss[0].tokens[index+1],'MAXVALUE')),boundsRule:'BY_TYPE_AND_INCREMENT_DIRECTION'}};
}
function role(token,context){if(is(token,'PUBLIC'))return 'PUBLIC';return identifier(token,context);}
function policy(section){
 const names=section.name.split(' ');need(section.schema===schemaName&&names.length===2&&names.every(safeName),'POLICY_TARGET');const ss=sectionStatements(section);need(ss.length===1,'POLICY_STATEMENT_COUNT');const t=ss[0].tokens;
 need(is(t[0],'CREATE')&&is(t[1],'POLICY')&&identifier(t[2],'POLICY')===names[1]&&is(t[3],'ON'),'POLICY_DECLARATION');need(qualified(t,4,'POLICY').name===names[0],'POLICY_TARGET');let i=7,permissive=true,command='*',roles=['PUBLIC'],usingExpression=null,withCheckExpression=null;
 if(is(t[i],'AS')){need(is(t[i+1],'PERMISSIVE')||is(t[i+1],'RESTRICTIVE'),'POLICY_PERMISSIVENESS');permissive=is(t[i+1],'PERMISSIVE');i+=2;}
 if(is(t[i],'FOR')){const commands={ALL:'*',SELECT:'r',INSERT:'a',UPDATE:'w',DELETE:'d'};need(t[i+1]?.kind==='word'&&commands[t[i+1].value],'POLICY_COMMAND');command=commands[t[i+1].value];i+=2;}
 if(is(t[i],'TO')){roles=[];i++;do{roles.push(role(t[i++],'POLICY_ROLE'));if(!punct(t[i],','))break;i++;}while(i<t.length);need(roles.length>0&&new Set(roles).size===roles.length,'POLICY_ROLE_DUPLICATE');}
 if(is(t[i],'USING')){const close=closeGroup(t,i+1,'POLICY_USING');need(close>i+2,'POLICY_USING_EMPTY');usingExpression=plain(section.text,t.slice(i+2,close));i=close+1;}
 if(is(t[i],'WITH')){need(is(t[i+1],'CHECK'),'POLICY_WITH_CHECK');const close=closeGroup(t,i+2,'POLICY_CHECK');need(close>i+3,'POLICY_CHECK_EMPTY');withCheckExpression=plain(section.text,t.slice(i+3,close));i=close+1;}
 need(i===t.length,'POLICY_UNSUPPORTED_SUFFIX');return {schema:section.schema,table:names[0],name:names[1],command,permissive,roles,usingExpression,withCheckExpression};
}
const privilegeKinds={SCHEMA:new Set(['ALL','USAGE','CREATE']),TABLE:new Set(['ALL','SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']),COLUMN:new Set(['ALL','SELECT','INSERT','UPDATE','REFERENCES']),SEQUENCE:new Set(['ALL','USAGE','SELECT','UPDATE'])};
function parseAcl(section,tables,sequences,schema){
 const target=section.name.match(/^(SCHEMA|TABLE|COLUMN|SEQUENCE) ([a-z_][a-z0-9_]*)(?:\.([a-z_][a-z0-9_]*))?$/);need(target,'ACL_UNSUPPORTED_TARGET');const [,objectType,name,column]=target;need((objectType==='COLUMN')===!!column,'ACL_COLUMN_TARGET');
 const owner=declaredOwner(section);need(owner===schema.owner,'ACL_OWNER_DIFFERS');
 if(objectType==='SCHEMA')need(section.schema==='-'&&name===schemaName,'ACL_SCHEMA_TARGET');
 else{need(section.schema===schemaName,'ACL_SCHEMA_TARGET');const relation=(objectType==='SEQUENCE'?sequences:tables).get(name);need(relation&&relation.owner===owner,'ACL_UNKNOWN_TARGET');if(column)need(relation.columns.has(column),'ACL_UNKNOWN_COLUMN');}
 const result=[];
 for(const statement of sectionStatements(section)){
  const t=statement.tokens,action=t[0]?.value;need(is(t[0],'GRANT')||is(t[0],'REVOKE'),'ACL_STATEMENT');let i=1,grantOptionOnly=false;
  if(action==='REVOKE'&&is(t[i],'GRANT')){need(is(t[i+1],'OPTION')&&is(t[i+2],'FOR'),'ACL_REVOKE_OPTION');grantOptionOnly=true;i+=3;}
  const on=t.findIndex((token,index)=>index>=i&&is(token,'ON'));need(on>i,'ACL_ON_REQUIRED');const privileges=splitList(t.slice(i,on),'ACL_PRIVILEGES').map(part=>{
   const privilege=part[0]?.value;need(part[0]?.kind==='word'&&privilegeKinds[objectType].has(privilege),'ACL_UNSUPPORTED_PRIVILEGE');let j=1;const columns=[];
   if(privilege==='ALL'&&is(part[j],'PRIVILEGES'))j++;
   if(punct(part[j],'(')){const close=closeGroup(part,j,'ACL_COLUMN');need(close===part.length-1,'ACL_COLUMN_LAYOUT');for(const c of splitList(part.slice(j+1,close),'ACL_COLUMNS')){need(c.length===1,'ACL_COLUMN_LAYOUT');columns.push(identifier(c[0],'ACL_COLUMN'));}j=close+1;}
   need(j===part.length&&(objectType==='COLUMN'?columns.length===1&&columns[0]===column:columns.length===0),'ACL_COLUMN_TARGET_DIFFERS');return {privilege,columns};
  });
  i=on+1;need(is(t[i],objectType==='COLUMN'?'TABLE':objectType),'ACL_OBJECT_KIND');i++;
  if(objectType==='SCHEMA'){need(identifier(t[i++],'ACL_SCHEMA')===schemaName,'ACL_SCHEMA_TARGET');}
  else{const q=qualified(t,i,'ACL');need(q.name===name,'ACL_TARGET_DIFFERS');i=q.end;}
  need(is(t[i++],action==='GRANT'?'TO':'FROM'),'ACL_RECIPIENT_REQUIRED');const grantees=[];
  do{grantees.push(role(t[i++],'ACL_ROLE'));if(!punct(t[i],','))break;i++;}while(i<t.length);
  need(grantees.length>0&&new Set(grantees).size===grantees.length,'ACL_ROLE_DUPLICATE');let grantOption=false;
  if(action==='GRANT'&&is(t[i],'WITH')){need(is(t[i+1],'GRANT')&&is(t[i+2],'OPTION'),'ACL_GRANT_OPTION');grantOption=true;i+=3;}
  need(i===t.length,'ACL_UNSUPPORTED_SUFFIX');result.push({sql:statement.sql,action,objectType,schema:schemaName,name,column:column??null,owner,grantor:owner,grantees,privileges,grantOption,grantOptionOnly});
 }
 need(result.length>0,'ACL_STATEMENTS_REQUIRED');return result;
}
function parseSchema(section){
 need(section.schema==='-'&&section.name===schemaName,'SCHEMA_TARGET');const owner=declaredOwner(section),ss=sectionStatements(section);need(ss.length===2,'SCHEMA_STATEMENT_COUNT');const a=ss[0].tokens,b=ss[1].tokens;
 need(a.length===3&&is(a[0],'CREATE')&&is(a[1],'SCHEMA')&&identifier(a[2],'SCHEMA')===schemaName,'SCHEMA_DECLARATION');
 need(b.length===6&&is(b[0],'ALTER')&&is(b[1],'SCHEMA')&&identifier(b[2],'SCHEMA')===schemaName&&is(b[3],'OWNER')&&is(b[4],'TO')&&identifier(b[5],'SCHEMA_OWNER')===owner,'SCHEMA_OWNER_DIFFERS');return {name:schemaName,owner};
}

/** Pure source preparation. No filesystem, database, network or SQL execution. */
export function collectFresh35RetirementMetadata(sql){
 need(typeof sql==='string'&&sql.endsWith('\n')&&/^-- PostgreSQL database dump complete\r?$/m.test(sql),'COMPLETE_DUMP_REQUIRED');
 const sections=parseFresh35DumpSections(sql);
 const supported=new Set(['SCHEMA','FUNCTION','TABLE','COMMENT','SEQUENCE','CONSTRAINT','INDEX','TRIGGER','FK CONSTRAINT','ROW SECURITY','POLICY','ACL']);
 for(const section of sections)need(supported.has(section.type),'UNSUPPORTED_SECTION:'+section.type);
 const schemas=sections.filter(s=>s.type==='SCHEMA');need(schemas.length===1,'SCHEMA_COHORT_REQUIRED');const schema=parseSchema(schemas[0]);
 const tables=[],columns=[],sequences=[],policies=[],aclStatements=[],tableMap=new Map(),sequenceMap=new Map();
 for(const section of sections){
  if(section.type==='TABLE'){
   const parsed=parseTable(section);need(parsed.table.owner===schema.owner,'TABLE_OWNER_DIFFERS');need(!tableMap.has(parsed.table.name),'TABLE_DUPLICATE');tables.push(parsed.table);columns.push(...parsed.columns);tableMap.set(parsed.table.name,{...parsed.table,columns:new Set(parsed.columns.map(c=>c.name))});
  }else if(section.type==='SEQUENCE'){
   const sequence=parseSequence(section);need(sequence.owner===schema.owner,'SEQUENCE_OWNER_DIFFERS');need(!sequenceMap.has(sequence.name),'SEQUENCE_DUPLICATE');sequences.push(sequence);sequenceMap.set(sequence.name,sequence);
  }
 }
 const rlsSeen=new Set(),policySeen=new Set();
 for(const section of sections){
  if(section.type==='ROW SECURITY'){
   const table=tables.find(t=>t.name===section.name);need(table&&section.schema===schemaName&&section.owner===schema.owner,'ROW_SECURITY_TARGET');need(!rlsSeen.has(table.name),'ROW_SECURITY_DUPLICATE');rlsSeen.add(table.name);
   const ss=sectionStatements(section);need(ss.length===1,'ROW_SECURITY_STATEMENT_COUNT');const t=ss[0].tokens;need(t.length===9&&is(t[0],'ALTER')&&is(t[1],'TABLE')&&qualified(t,2,'ROW_SECURITY').name===table.name&&is(t[5],'ENABLE')&&is(t[6],'ROW')&&is(t[7],'LEVEL')&&is(t[8],'SECURITY'),'ROW_SECURITY_UNSUPPORTED');table.rowSecurity=true;
  }else if(section.type==='POLICY'){
   const p=policy(section);need(tableMap.has(p.table)&&section.owner===schema.owner,'POLICY_TABLE_REQUIRED');const key=p.table+'.'+p.name;need(!policySeen.has(key),'POLICY_DUPLICATE');policySeen.add(key);policies.push(p);
  }else if(section.type==='ACL'&&!section.name.startsWith('FUNCTION '))aclStatements.push(...parseAcl(section,tableMap,sequenceMap,schema));
  else if(['DEFAULT','SEQUENCE OWNED BY','DEFAULT ACL'].includes(section.type))throw Error('FRESH35_METADATA_UNSUPPORTED_SECTION:'+section.type);
 }
 need(tables.length>0,'TABLES_REQUIRED');
 const roleNames=[...new Set([schema.owner,...policies.flatMap(p=>p.roles),...aclStatements.flatMap(a=>a.grantees)].filter(name=>name!=='PUBLIC'))].sort();
 const metadata=freeze({format:'FRESH35_RETIREMENT_SOURCE_METADATA_V1',schema,tables,columns,sequences,policies,aclStatements,roleNames,sourceSha256:sha256(sql),scope:['TABLE_DECLARATIONS','COLUMN_DECLARATIONS','SEQUENCE_PARAMETERS','POLICY_DECLARATIONS','SCHEMA_TABLE_COLUMN_SEQUENCE_ACL_STATEMENTS'],expressionContext:{postgresqlMajor:17,searchPath:'pg_catalog',quoteAllIdentifiers:true,pretty:false},sourceOnly:true,existingTargetMutation:false,engineVerified:false,catalogAdmitted:false,installationReady:false,expressionSyntaxValidated:false,aclEffectiveStateResolved:false});
 genuineMetadata.add(metadata);return metadata;
}
