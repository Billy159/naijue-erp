// Fill the existing capturedOptions interface from C144 + original approved32.
// No source factory, database, grant, target discovery or new capture.
import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const need=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c});};
const sha=b=>createHash('sha256').update(b).digest('hex');
const same=(a,b)=>['dev','ino','size','mode','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
const MONEY_COLUMNS=['file','sheet','row','sourceId','entity','documentSourceId','field','rawValue','excessFromNearestCent','candidateExactCentValue','sourceFileSha256','decision','provenance','toleranceCurrencyUnits','corroboratingDocumentSourceId'];
/** Called inside T45's controlled read window. Manifest and money CSV are small;
 * source peek is <=4MiB and selection only. Actual source authority must verify
 * the accepted descriptor/lease, and original consumer still checks complete EOF.
 * Peek does not grant authority or mark source/native bindings verified. */
export async function prepareRetainedSalesOptions({sourceRoot,entity,binding,manifestRef,moneyRef,trustedApprovalSha256,authority,capturedAuthority,signal},io={}){
 need(['SALES_LINE','SETTLEMENT'].includes(entity),'SALES_OPTIONS_ENTITY');
 need(typeof authority?.verifyInputs==='function'&&typeof capturedAuthority?.verify==='function'&&typeof capturedAuthority?.close==='function','SALES_OPTIONS_EXISTING_AUTHORITY');
 const active=()=>need(!signal?.aborted,'SALES_OPTIONS_ABORTED');
 const context={entity,binding:structuredClone(binding),manifestRef:structuredClone(manifestRef),moneyRef:structuredClone(moneyRef),trustedApprovalSha256};
 active();need(await authority.verifyInputs(structuredClone(context))===undefined,'SALES_OPTIONS_AUTHORITY_RETURN');active();
 async function held(ref,max,work){if(io.resolveFile)ref={...ref,...await io.resolveFile(ref)};active();need(ref?.path?.startsWith('/')&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&/^[a-f0-9]{64}$/.test(ref.sha256),'SALES_OPTIONS_PIN');
  const before=await lstat(ref.path);need(before.isFile()&&!before.isSymbolicLink()&&(before.mode&0o077)===0&&before.size===ref.bytes,'SALES_OPTIONS_PRIVATE_FILE');
  const fd=await open(ref.path,constants.O_RDONLY|constants.O_NOFOLLOW);try{need(same(before,await fd.stat()),'SALES_OPTIONS_CHANGED');active();const v=await work(fd);active();need(same(before,await fd.stat())&&same(before,await lstat(ref.path)),'SALES_OPTIONS_CHANGED');return v;}finally{await fd.close();}}
 async function small(ref,max){need(ref.bytes<=max,'SALES_OPTIONS_SMALL_BOUND');return held(ref,max,async fd=>{const b=await fd.readFile();need(b.length===ref.bytes&&sha(b)===ref.sha256,'SALES_OPTIONS_SMALL_PIN');return b;});}
 const manifest=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await small(manifestRef,4194304)));
 const sources=manifest.artifacts?.filter(d=>d.entity===entity&&d.actualColumns===12),types=manifest.artifacts?.filter(d=>d.entity===entity&&d.actualColumns===(entity==='SALES_LINE'?21:11));
 need(sources?.length===1&&types?.length===1&&sources[0].rows===types[0].rows,'SALES_OPTIONS_DESCRIPTORS');
 const source=sources[0],typed=types[0];
 // Use exactly the original parseV2Csv and v2MoneyApprovalSet semantics.
 const {parseV2Csv,v2MoneyApprovalSet}=await import(pathToFileURL(sourceRoot+'/packages/application/src/import-v2.ts').href);
 const money=await small(moneyRef,1048576),approvals=[];let header;
 async function* text(){yield new TextDecoder('utf8',{fatal:true}).decode(money);}
 for await(const cells of parseV2Csv(text())){active();if(!header){assert.deepEqual(cells,MONEY_COLUMNS);header=cells;continue;}need(cells.length===header.length,'SALES_OPTIONS_MONEY_WIDTH');const r=Object.fromEntries(header.map((key,i)=>[key,cells[i]]));approvals.push({fileSha256:r.sourceFileSha256,sheet:r.sheet,row:r.row,sourceId:r.sourceId,field:r.field,rawValue:r.rawValue,exactCentValue:r.candidateExactCentValue});}
 const moneyApprovals=v2MoneyApprovalSet(approvals,approvals);
 const selection=await held(source,4194304,async fd=>{let pending=Buffer.alloc(0),position=0;
  while(position<source.bytes&&pending.length<4194304){active();const b=Buffer.alloc(Math.min(65536,source.bytes-position,4194304-pending.length));const r=await fd.read(b,0,b.length,position);need(r.bytesRead>0,'SALES_OPTIONS_PREFIX_EOF');position+=r.bytesRead;pending=Buffer.concat([pending,b.subarray(0,r.bytesRead)]);const at=pending.indexOf(10);if(at<0)continue;
   const row=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(pending.subarray(0,at))),p=row?.projection;
   need(row.relation==='import_source_row'&&p?.batch_id===binding.batchId&&p.entity_type===entity,'SALES_OPTIONS_SOURCE_BINDING');
   const staged=p.field_provenance?.[entity==='SALES_LINE'?'history_sales_detail_staging':'history_settlement_staging'],s=staged?.selection;
   need(s?.entity===entity&&s.selectionSha256===binding.selectionSha256&&s.approvalSha256===trustedApprovalSha256&&s.moneyApprovalSha256===moneyRef.sha256,'SALES_OPTIONS_SELECTION');return structuredClone(s);
  }throw Error('SALES_OPTIONS_PREFIX_BOUND');});
 const {historySettlementRequestHash}=await import(pathToFileURL(sourceRoot+'/packages/application/src/import-v3-history-settlement.ts').href);
 const captureContext={batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selection:structuredClone(selection),manifest:{path:manifestRef.path,bytes:manifestRef.bytes,sha256:manifestRef.sha256},source:structuredClone(source),typed:structuredClone(typed),moneyApprovalFingerprint:historySettlementRequestHash(moneyApprovals)};
 need(await capturedAuthority.verify(structuredClone(captureContext))===undefined,'SALES_OPTIONS_AUTHORITY_RETURN');active();
 return {batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,trustedApprovalSha256,approvedMoneyOverlaySha256:moneyRef.sha256,
  capturedSource:{manifestFile:manifestRef.path,trustedManifestSha256:manifestRef.sha256,selection,moneyApprovals,
   // Original consumer supplies retained read and invokes this original external proof.
   read:{sourceRows(){throw Error('USE_EXISTING_RETAINED_CONSUMER');},typedRow(){throw Error('USE_EXISTING_RETAINED_CONSUMER');}},
   async verify(actual){active();assert.deepEqual(actual.selection,selection);assert.deepEqual(actual.source,source);assert.deepEqual(actual.typed,typed);
    assert.deepEqual(actual,captureContext);need(await capturedAuthority.verify(structuredClone(actual))===undefined,'SALES_OPTIONS_AUTHORITY_RETURN');active();},
   async close(){await capturedAuthority.close();}}};
}
