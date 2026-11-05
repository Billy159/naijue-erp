/** Explicit source -> new synthetic role labels. No role is created, granted,
 * connected or reused. Routine bodies are opaque and never rewritten. */
import{createHash}from'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');const need=(ok,code)=>{if(!ok)throw Error(code);};
const bodies=sql=>[...sql.matchAll(/\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)([\s\S]*?)\1/g)].map(match=>hash(match[2]));
function mapIdentities(sql,mapping,production=false){
 need(typeof sql==='string'&&mapping&&Object.getPrototypeOf(mapping)===Object.prototype&&Object.keys(mapping).sort().join(',')==='controller,owner','FRESH35_EXPLICIT_IDENTITY_MAPPING_REQUIRED');
 const pairs=Object.entries(mapping).map(([kind,pair])=>{
  need(pair&&Object.keys(pair).sort().join(',')==='source,target'&&typeof pair.source==='string'&&typeof pair.target==='string'&&/^[a-z_][a-z0-9_]{0,62}$/.test(pair.source)&&(production?/^[a-z][a-z0-9_]{0,62}$/.test(pair.target)&&!pair.target.startsWith('pg_')&&!pair.target.startsWith('erp_unified27_')&&pair.source==='fresh35_'+kind+'_20261105_r1':new RegExp('^(?:schema35|fresh35)_'+kind+'_[a-z0-9_]+$').test(pair.target))&&pair.target.length<=63&&!pair.source.startsWith('erp_unified27_')&&(production||pair.source!==pair.target),'FRESH35_IDENTITY_MAPPING_INVALID');
  return {kind,...pair};
 });
 need(production?(new Set(pairs.map(p=>p.target)).size===2&&pairs.every(p=>!pairs.some(other=>other.kind!==p.kind&&other.source===p.target))):new Set(pairs.flatMap(pair=>[pair.source,pair.target])).size===4,'FRESH35_IDENTITY_MAPPING_OVERLAP');
 const bySource=new Map(pairs.map(pair=>[pair.source,pair])),changes=[];
 let i=0,last=0,result='',previous=[];
 const append=(start,end,text)=>{result+=sql.slice(last,start)+text;last=end;};
 while(i<sql.length){
  if(sql.startsWith('--',i)){
   const end=sql.indexOf('\n',i),stop=end<0?sql.length:end,line=sql.slice(i,stop);
   const match=line.match(/^-- Name: [^\n]+; Type: [A-Z ]+; Schema: [^;\n]+; Owner: ([a-z_][a-z0-9_]*)$/);
   if(match&&bySource.has(match[1])){
    const pair=bySource.get(match[1]);need(pair.kind==='owner','FRESH35_IDENTITY_MAPPING_HEADER_OWNER_DIFFERS');
    const start=stop-match[1].length;append(start,stop,pair.target);changes.push({kind:'HEADER_OWNER',source:pair.source,target:pair.target,offset:start});
   }
   i=stop;continue;
  }
  if(sql.startsWith('/*',i)){let depth=1;i+=2;while(i<sql.length&&depth){if(sql.startsWith('/*',i)){depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else i++;}need(depth===0,'FRESH35_IDENTITY_MAPPING_UNTERMINATED_COMMENT');continue;}
  const delimiter=sql[i]==='$'?sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]:null;
  if(delimiter){const end=sql.indexOf(delimiter,i+delimiter.length);need(end>=0,'FRESH35_IDENTITY_MAPPING_UNTERMINATED_BODY');const body=sql.slice(i+delimiter.length,end);for(const pair of pairs)need(!new RegExp('\\b'+pair.source+'\\b').test(body),'FRESH35_EMBEDDED_IDENTITY_REQUIRES_REVIEW');previous.push('$body$');i=end+delimiter.length;continue;}
  if(sql[i]==="'"){
   const start=i,escape=/[Ee]/.test(sql[i-1]??'')&&(i<2||!/[A-Za-z0-9_$]/.test(sql[i-2]));let closed=false;i++;
   while(i<sql.length){if(escape&&sql[i]==='\\'){i+=2;continue;}if(sql[i]==="'"){if(sql[i+1]==="'"){i+=2;continue;}i++;closed=true;break;}i++;}
   need(closed,'FRESH35_IDENTITY_MAPPING_UNTERMINATED_STRING');for(const pair of pairs)need(!new RegExp('\\b'+pair.source+'\\b').test(sql.slice(start,i)),'FRESH35_EMBEDDED_IDENTITY_REQUIRES_REVIEW');previous.push('$literal$');continue;
  }
  let token,start=i,quoted=false;
  if(sql[i]==='"'){
   quoted=true;i++;token='';let closed=false;while(i<sql.length){if(sql[i]==='"'){if(sql[i+1]==='"'){token+='"';i+=2;continue;}i++;closed=true;break;}token+=sql[i++];}need(closed,'FRESH35_IDENTITY_MAPPING_UNTERMINATED_IDENTIFIER');
  }else{token=sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];if(token)i+=token.length;}
  if(token!==undefined){
   const pair=bySource.get(token);
   if(pair){
    const prior=previous.at(-1)?.toUpperCase(),statement=previous[0]?.toUpperCase();
    const rolePosition=(prior==='TO'&&statement==='ALTER'&&previous.at(-2)?.toUpperCase()==='OWNER')||
      (prior==='TO'&&statement==='GRANT')||(prior==='FROM'&&statement==='REVOKE')||
      (prior==='BY'&&previous.at(-2)?.toUpperCase()==='GRANTED'&&['GRANT','REVOKE'].includes(statement));
    need(rolePosition,'FRESH35_NON_ROLE_IDENTITY_REQUIRES_REVIEW');
    append(start,i,quoted?'"'+pair.target+'"':pair.target);changes.push({kind:'OUTER_ROLE_IDENTIFIER',source:pair.source,target:pair.target,offset:start,statement});
   }
   previous.push(token);continue;
  }
  if(sql[i]===';')previous=[];else if(!/\s/.test(sql[i]))previous.push(sql[i]);i++;
 }
 result+=sql.slice(last);
 for(const pair of pairs){need(changes.some(change=>change.source===pair.source&&change.kind==='OUTER_ROLE_IDENTIFIER'),'FRESH35_IDENTITY_SOURCE_NOT_FOUND');need(production&&pair.source===pair.target||!new RegExp('\\b'+pair.source+'\\b').test(result),'FRESH35_UNKNOWN_SOURCE_IDENTITY_REMAINS');}
 const bodyHashesBefore=bodies(sql),bodyHashesAfter=bodies(result);need(JSON.stringify(bodyHashesBefore)===JSON.stringify(bodyHashesAfter),'FRESH35_IDENTITY_MAPPING_CHANGED_FUNCTION_BODY');
 return {format:production?'FRESH35_EXPLICIT_PRODUCTION_IDENTITY_MAPPING_V2':'FRESH35_EXPLICIT_SYNTHETIC_IDENTITY_MAPPING_V1',sql:result,sourceSha256:hash(sql),sha256:hash(result),mapping:structuredClone(mapping),changes,
  bodyHashesBefore,bodyHashesAfter,privilegeKindsAndGrantOptionsChanged:false,identityRecipientsChanged:pairs.some(p=>p.source!==p.target),rolesCreated:false,connectionsOpened:0,installationReady:false};
}

export function mapFresh35RetirementIdentities(sql,mapping){return mapIdentities(sql,mapping)}
export function mapFresh35ProductionIdentitiesV2(sql,mapping){return mapIdentities(sql,mapping,true)}
