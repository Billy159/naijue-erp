import {parseLegacyJsonTextIterative as parseLegacyJsonText,legacyDecimalText} from './legacy-json.mjs';
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
export function createDocumentSourceCensus(headerState){
 const headers=new Map(),seenRevisions=new Map();
 const result={status:'SCOPED_CURRENT_DOCUMENT_SOURCE_CENSUS_NOT_CONVERSION',documents:0,revisions:0,currentRevisions:0,unselectedRevisions:0,
  types:{SALE:0,TRANSFER:0,OTHER:0},states:{DRAFT:0,UNAUDITED:0,APPROVED:0,DELETED:0,VOID:0,OTHER:0},
  currentOriginalImported:0,currentRuntime:0,baselineIncluded:0,activeEffect:0,unknownBaselineFlag:0,unknownActiveEffectFlag:0,
  body:{object:0,other:0,headerObject:0,headerOther:0,linesArray:0,linesOther:0,fundsArray:0,fundsOther:0},
  lines:{total:0,nonObject:0,missingSku:0,quantityNull:0,quantityMissing:0,quantityInvalid:0,quantityNonInteger:0,quantityNegative:0,quantityZero:0,quantityInteger:0,quantityOutsideTargetBigint:0},
  targetWrites:0,identityAllocation:0,conversionVerified:false,independentTargetReadbackVerified:false};
 if(headerState!==undefined){
  need(headerState?.format==='DOCUMENT_HEADER_CENSUS_PRIVATE_V1'&&Array.isArray(headerState.headers)
   &&headerState.statistics?.documents===headerState.headers.length,'DOCUMENT_CENSUS_HEADER_STATE_REFUSED');
  // Only a completed header phase may be resumed. Revision progress cannot be
  // replayed as an empty phase, or counted twice after a failed attempt.
  const stats=headerState.statistics;
  need(stats.revisions===0&&stats.currentRevisions===0&&stats.unselectedRevisions===0
   &&JSON.stringify(Object.keys(stats).sort())===JSON.stringify(Object.keys(result).sort()),'DOCUMENT_CENSUS_HEADER_STATE_REFUSED');
  for(const [id,current] of headerState.headers){
   need(typeof id==='string'&&id.length>0&&integer(current)&&!headers.has(id),'DOCUMENT_CENSUS_HEADER_STATE_REFUSED');
   headers.set(id,{current,selected:false});
  }
  Object.assign(result,structuredClone(stats));
 }
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
  headerState(){
   need(result.revisions===0,'DOCUMENT_CENSUS_HEADER_PHASE_ALREADY_CONSUMED');
   // This contains private source IDs. Keep it in the existing private artifact
   // directory, never stdout, a report, the source repository or a target table.
   return {format:'DOCUMENT_HEADER_CENSUS_PRIVATE_V1',headers:[...headers].map(([id,h])=>[id,h.current]),statistics:structuredClone(result)};
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

/** First phase returns private resumable state only after the document file has
 * passed the original complete EOF/count/hash and unchanged-file checks. */
export async function readDocumentHeaderCensus(options){
 const census=createDocumentSourceCensus();
 const file=await consumePrivateSnapshotTable({...options,table:'erp_prod_runtime.document',maxRowBytes:33554432,onRow:(row,meta)=>{census.document(row);return options.onProgress?.({phase:'DOCUMENT',rows:meta.ordinal});}});
 return {format:'DOCUMENT_HEADER_FILE_CENSUS_PRIVATE_V1',sourceManifestSha256:options.expectedManifestSha256,
  file,headerState:census.headerState()};
}

/** Caller pins the private checkpoint bytes from the completed first-phase job
 * before parsing this object. No state/hash supplied by this function constitutes
 * independent approval or source completeness. Never replay partial revision work. */
export async function readDocumentRevisionCensus(options,checkpoint){
 need(checkpoint?.format==='DOCUMENT_HEADER_FILE_CENSUS_PRIVATE_V1'
  &&checkpoint.sourceManifestSha256===options.expectedManifestSha256
  &&checkpoint.file?.status==='CONSUMED_SCOPED_PRIVATE_TABLE'
  &&checkpoint.file.table==='erp_prod_runtime.document'
  &&checkpoint.file.sourceManifestSha256===options.expectedManifestSha256
  &&checkpoint.file.rows===String(checkpoint.headerState?.statistics?.documents)
  &&typeof checkpoint.file.sha256==='string'&&/^[a-f0-9]{64}$/.test(checkpoint.file.sha256),
  'DOCUMENT_CENSUS_CHECKPOINT_SOURCE_REFUSED');
 const census=createDocumentSourceCensus(checkpoint.headerState);
 const file=await consumePrivateSnapshotTable({...options,table:'erp_prod_runtime.revision',maxRowBytes:33554432,onRow:(row,meta)=>{census.revision(row);return options.onProgress?.({phase:'REVISION',rows:meta.ordinal});}});
 return {...census.finish(),sourceManifestSha256:options.expectedManifestSha256,sourceFilesConsumed:2,
  sourceRows:(BigInt(checkpoint.file.rows)+BigInt(file.rows)).toString(),
  sourceBytes:checkpoint.file.bytes+file.bytes,databaseConnections:0};
}
