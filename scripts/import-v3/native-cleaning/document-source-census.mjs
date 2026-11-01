import {parseLegacyJsonText,legacyDecimalText} from './legacy-json.mjs';
import {consumePrivateSnapshotTable} from './private-row-reader.mjs';

const need=(ok,code)=>{if(!ok)throw new Error(code);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const integer=x=>typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x);
function revision(value){const text=legacyDecimalText(value);need(integer(text),'DOCUMENT_CENSUS_REVISION_REFUSED');return text;}
function incrementKnown(counts,value){counts[Object.hasOwn(counts,value)?value:'OTHER']++;}

/** Current bodies are selected by the exact header pointer, never maximum date
 * or last file row. Results contain counts only, not document IDs or payloads.
 * This diagnoses conversion inputs; it neither chooses a status mapping nor
 * changes quantities, source identities, historical effects or permissions. */
export function createDocumentSourceCensus(){
 const headers=new Map(),seenRevisions=new Map();
 const result={status:'SCOPED_CURRENT_DOCUMENT_SOURCE_CENSUS_NOT_CONVERSION',documents:0,revisions:0,currentRevisions:0,unselectedRevisions:0,
  types:{SALE:0,TRANSFER:0,OTHER:0},states:{DRAFT:0,UNAUDITED:0,APPROVED:0,DELETED:0,VOID:0,OTHER:0},
  currentOriginalImported:0,currentRuntime:0,baselineIncluded:0,activeEffect:0,unknownBaselineFlag:0,unknownActiveEffectFlag:0,
  body:{object:0,other:0,headerObject:0,headerOther:0,linesArray:0,linesOther:0,fundsArray:0,fundsOther:0},
  lines:{total:0,nonObject:0,missingSku:0,quantityNull:0,quantityMissing:0,quantityInvalid:0,quantityNonInteger:0,quantityNegative:0,quantityZero:0,quantityInteger:0,quantityOutsideTargetBigint:0},
  targetWrites:0,identityAllocation:0,conversionVerified:false,independentTargetReadbackVerified:false};
 const quantity=line=>{
  const c=result.lines;
  if(!Object.hasOwn(line,'source_quantity')){c.quantityMissing++;return;}
  if(line.source_quantity===null){c.quantityNull++;return;}
  let text;try{text=legacyDecimalText(line.source_quantity);}catch{c.quantityInvalid++;return;}
  if(typeof text!=='string'||! /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text)){c.quantityInvalid++;return;}
  const [whole,fraction='']=text.split('.');
  if(/[1-9]/.test(fraction)){c.quantityNonInteger++;return;}
  const n=BigInt(whole);c.quantityInteger++;if(n<0n)c.quantityNegative++;if(n===0n)c.quantityZero++;
  if(n< -9223372036854775808n||n>9223372036854775807n)c.quantityOutsideTargetBigint++;
 };
 return {
  document(envelope){
   const row=parseLegacyJsonText(envelope.raw_json);
   need(object(row)&&typeof row.id==='string'&&row.id===envelope.source_document_id&&!headers.has(row.id),'DOCUMENT_CENSUS_HEADER_IDENTITY_REFUSED');
   const current=revision(row.current_revision);need(current===envelope.source_revision,'DOCUMENT_CENSUS_HEADER_POINTER_REFUSED');
   headers.set(row.id,{current,selected:false});result.documents++;
   incrementKnown(result.types,row.document_type);incrementKnown(result.states,row.status);
   if(typeof row.baseline_was_included!=='boolean')result.unknownBaselineFlag++;else if(row.baseline_was_included)result.baselineIncluded++;
   if(typeof row.current_effect_active!=='boolean')result.unknownActiveEffectFlag++;else if(row.current_effect_active)result.activeEffect++;
  },
  revision(envelope){
   const row=parseLegacyJsonText(envelope.raw_json);
   need(object(row)&&typeof row.document_id==='string'&&row.document_id===envelope.source_document_id,'DOCUMENT_CENSUS_REVISION_IDENTITY_REFUSED');
   const number=revision(row.revision),header=headers.get(row.document_id);
   need(number===envelope.source_revision&&header,'DOCUMENT_CENSUS_REVISION_POINTER_REFUSED');
   const keys=seenRevisions.get(row.document_id)??new Set();need(!keys.has(number),'DOCUMENT_CENSUS_DUPLICATE_REVISION');keys.add(number);seenRevisions.set(row.document_id,keys);
   need(typeof row.original_imported==='boolean'&&Object.hasOwn(row,'body'),'DOCUMENT_CENSUS_REVISION_METADATA_REFUSED');result.revisions++;
   if(number!==header.current){result.unselectedRevisions++;return;}
   header.selected=true;result.currentRevisions++;if(row.original_imported)result.currentOriginalImported++;else result.currentRuntime++;
   const b=row.body;if(!object(b)){result.body.other++;return;}result.body.object++;
   result.body[object(b.header)?'headerObject':'headerOther']++;
   result.body[Array.isArray(b.fundsRecords)?'fundsArray':'fundsOther']++;
   if(!Array.isArray(b.lines)){result.body.linesOther++;return;}result.body.linesArray++;
   for(const line of b.lines){result.lines.total++;if(!object(line)){result.lines.nonObject++;continue;}
    if(typeof line.sku_id!=='string'||line.sku_id.length===0)result.lines.missingSku++;quantity(line);
   }
  },
  finish(){need([...headers.values()].every(row=>row.selected),'DOCUMENT_CENSUS_CURRENT_REVISION_MISSING');return structuredClone(result);}
 };
}

export async function readDocumentSourceCensus(options){
 const census=createDocumentSourceCensus(),files=[];
 for(const [table,onRow] of [['erp_prod_runtime.document',census.document],['erp_prod_runtime.revision',census.revision]])
  files.push(await consumePrivateSnapshotTable({...options,table,maxRowBytes:33554432,onRow}));
 return {...census.finish(),sourceManifestSha256:options.expectedManifestSha256,sourceFilesConsumed:files.length,
  sourceRows:files.reduce((n,f)=>n+BigInt(f.rows),0n).toString(),sourceBytes:files.reduce((n,f)=>n+f.bytes,0),databaseConnections:0};
}
