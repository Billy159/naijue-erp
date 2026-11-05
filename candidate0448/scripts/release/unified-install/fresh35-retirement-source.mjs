/** Resolve the current 178-routine source cohort before any fresh35 specialization.
 * This module reads source only. It neither opens a database nor grants admission.
 * Historical source profiles and installation records remain unchanged. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadWholeSalesSpecV1 } from './whole-sales-catalog-v1.mjs';
import { LEGACY_RETIREMENT_CANDIDATE_TABLES } from './legacy-dependency-source-report.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error(code);};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const normalizeRetirementSignature=value=>value.replaceAll('pg_catalog.','').replace(/\binteger\b/g,'int4').replace(/\bboolean\b/g,'bool').replace(/\bbigint\b/g,'int8');
const nameOf=signature=>signature.slice('naijue_erp.'.length,signature.indexOf('('));
const patches='adapters/postgres/patches/';
function payload(sql,tag){const chunks=sql.split('$'+tag+'$');need(chunks.length===3,'FRESH35_EXACT_REPLACEMENT_PAYLOAD_REQUIRED:'+tag);return JSON.parse(chunks[1]);}
export function applyRetirementSourceReplacement(before,spec,extension){
 need(spec&&hash(before)===spec.predecessor_sha256,'FRESH35_REPLACEMENT_PREDECESSOR_DIFFERS');
 need(Array.isArray(spec.replacements)&&spec.replacements.length>0,'FRESH35_REPLACEMENT_SET_REQUIRED');
 let after=before;
 for(const item of spec.replacements){
  need(typeof item.before==='string'&&item.before.length>0&&after.split(item.before).length===2,'FRESH35_REPLACEMENT_ANCHOR_DIFFERS');
  let replacement=item.after;
  if(replacement==='$RESTORATION_PROOF'){need(typeof extension==='string'&&extension.length>0,'FRESH35_RESTORATION_EXTENSION_REQUIRED');replacement=extension+item.before;}
  need(typeof replacement==='string','FRESH35_REPLACEMENT_VALUE_REQUIRED');
  after=after.replace(item.before,()=>replacement);
 }
 need(hash(after)===spec.successor_sha256,'FRESH35_REPLACEMENT_SUCCESSOR_DIFFERS');
 return after;
}
export async function loadFresh35RetirementSource(root){
 const spec=await loadWholeSalesSpecV1(root);
 need(spec.pins.length===178,'FRESH35_CURRENT178_COHORT_REQUIRED');
 const sources=[];const literals=new Map();
 for(const pin of spec.installation_sources.filter(pin=>pin.path.endsWith('.sql'))){
  const sql=await readFile(resolve(root,pin.path),'utf8');need(hash(sql)===pin.sha256,'FRESH35_CURRENT_SOURCE_CHANGED:'+pin.path);
  sources.push({...pin,sql});
  for(const match of sql.matchAll(/\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)([\s\S]*?)\1/g)){
   const digest=hash(match[2]);const prior=literals.get(digest);
   need(!prior||prior.body===match[2],'FRESH35_BODY_DIGEST_COLLISION');
   if(!prior)literals.set(digest,{body:match[2],source:pin.path});
  }
 }
 const sqlAt=path=>{const source=sources.find(source=>source.path===patches+path);need(source,'FRESH35_TRANSFORM_SOURCE_MISSING:'+path);return source.sql;};
 const commandChain=[['0027_historical_sales_source_profile_successor.sql','source_profile_changes'],['0027_zero_amount_archive_successor.sql','source_profile_changes'],['0027_historical_staff_null_hall_successor.sql','source_profile_changes'],['0027_explicit_zero_evidence_successor.sql','explicit_zero_changes']];
 function derive(chain,extension){
  const changes=chain.map(([path,tag])=>({path:patches+path,spec:payload(sqlAt(path),tag)}));
  const original=literals.get(changes[0].spec.predecessor_sha256);need(original,'FRESH35_DYNAMIC_PREDECESSOR_MISSING');
  let body=original.body;for(const change of changes)body=applyRetirementSourceReplacement(body,change.spec,extension);
  literals.set(hash(body),{body,source:changes.at(-1).path,derivedFrom:[original.source,...changes.map(change=>change.path)]});
 }
 derive(commandChain);
 const restoration=sqlAt('0027_historical-original-restoration_successor.sql').split('$restoration_proof$');
 need(restoration.length===3,'FRESH35_RESTORATION_PROOF_SOURCE_DIFFERS');
 derive([['0027_historical_missing_settlement_successor.sql','source_changes'],['0027_historical-original-restoration_successor.sql','source_changes']],restoration[1]);
 const routines=spec.pins.map(pin=>{
  const literal=literals.get(pin.sha256);need(literal,'FRESH35_CURRENT_ROUTINE_BODY_MISSING:'+pin.signature);
  return {...pin,name:nameOf(pin.signature),...literal,bodySha256:pin.sha256};
 });
 need(new Set(routines.map(routine=>normalizeRetirementSignature(routine.signature))).size===178,'FRESH35_CURRENT_ROUTINE_DUPLICATED');
 need((await loadWholeSalesSpecV1(root)).source_spec_sha256===spec.source_spec_sha256,'FRESH35_CURRENT_SOURCE_DRIFT');
 return freeze({format:'FRESH35_RETIREMENT_CURRENT178_SOURCE_V1',predecessorSourceSpecSha256:spec.source_spec_sha256,
  sourcePins:spec.installation_sources,routines,engineVerified:false,installationReady:false});
}
/** Lexical dependency leads, deliberately distinguishing immutable JSON labels
 * (for example valid_history_counts) from named relations and row types. */
export function findLegacyRoutineReferences(text){
 let code='',i=0;
 while(i<text.length){
  if(text.startsWith('--',i)){const end=text.indexOf('\n',i+2);i=end<0?text.length:end;code+=' ';continue;}
  if(text.startsWith('/*',i)){let depth=1;i+=2;while(i<text.length&&depth){if(text.startsWith('/*',i)){depth++;i+=2;}else if(text.startsWith('*/',i)){depth--;i+=2;}else i++;}need(depth===0,'FRESH35_UNTERMINATED_REFERENCE_COMMENT');code+=' ';continue;}
  if(text[i]==="'"){const escape=/[Ee]/.test(text[i-1]??'')&&(i<2||!/[A-Za-z0-9_$]/.test(text[i-2]));let closed=false;i++;while(i<text.length){if(escape&&text[i]==='\\'){i+=2;continue;}if(text[i]==="'"){if(text[i+1]==="'"){i+=2;continue;}i++;closed=true;break;}i++;}need(closed,'FRESH35_UNTERMINATED_REFERENCE_STRING');code+=' ';continue;}
  if(text[i]==='"'){i++;while(i<text.length&&text[i]!=='"'){code+=text[i++];}need(i<text.length,'FRESH35_UNTERMINATED_REFERENCE_IDENTIFIER');i++;continue;}
  code+=text[i++];
 }
 return LEGACY_RETIREMENT_CANDIDATE_TABLES.filter(table=>
  new RegExp('\\bnaijue_erp\"?\\s*\\.\\s*\"?'+table+'\\b','i').test(text)||
  new RegExp('\\b'+table+'\\b','i').test(code)||
  /\b(?:EXECUTE|regclass|regtype)\b/i.test(code)&&new RegExp('\\b'+table+'\\b','i').test(text)||
  new RegExp('\\b(?:FROM|JOIN|UPDATE|INTO|REFERENCES)\\s+(?:ONLY\\s+)?'+table+'\\b','i').test(text));
}
/** Exact, explicit omission only. A lexical closure is necessary, never enough
 * for physical retirement: pg_depend, ACL, triggers and engine tests are separate. */
export function deriveRetainedRoutineClosure(routines,omittedSignatures){
 need(Array.isArray(routines)&&Array.isArray(omittedSignatures),'FRESH35_CLOSURE_INPUT_REQUIRED');
 const normalize=normalizeRetirementSignature;
 const all=new Map(routines.map(routine=>[normalize(routine.signature),routine]));
 need(all.size===routines.length,'FRESH35_CLOSURE_DUPLICATE_ROUTINE');
 const omit=new Set(omittedSignatures.map(normalize));need(omit.size===omittedSignatures.length,'FRESH35_CLOSURE_DUPLICATE_OMISSION');
 for(const signature of omit)need(all.has(signature),'FRESH35_OMITTED_ROUTINE_MISSING:'+signature);
 const omitted=routines.filter(routine=>omit.has(normalize(routine.signature)));
 const retained=routines.filter(routine=>!omit.has(normalize(routine.signature)));
 for(const routine of retained){
  for(const table of findLegacyRoutineReferences(routine.signature+'\n'+routine.body))throw Error('FRESH35_RETAINED_LEGACY_REFERENCE:'+routine.signature+':'+table);
  for(const removed of omitted)need(!new RegExp('(?:\\b|\")'+removed.name+'\"?\\s*\\(','i').test(routine.body),'FRESH35_RETAINED_OMITTED_CALLEE:'+routine.signature+':'+removed.name);
 }
 return freeze({retained,omitted,sourceReferencesClosed:true,engineDependenciesVerified:false});
}
