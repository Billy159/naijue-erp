// Thin trusted-host composition. Never widens the old source reader's accepted
// shape, opens a DB, guesses references, or treats a caller aggregate as a grant.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { prepareProductEvidenceChunk } from '../../packages/application/src/product-evidence-staging.ts';
import { nativeProductReferenceDecision, nativeProductReferenceDecision26, NATIVE_PRODUCT_REFERENCE_DECISION_VERSION, NATIVE_PRODUCT_REFERENCE_DECISION_VERSION_26, NATIVE_PRODUCT_SIZE_GROUP_OVERRIDE_VERSION, validatePreparedNativeProductImportChunk, validatePreparedNativeProductImportChunk26 } from '../../packages/application/src/native-product-import.ts';
import { historySettlementRequestHash } from '../../packages/application/src/import-v3-history-settlement.ts';
const fail=code=>{throw Error(code);};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const MAX_DECISION_BYTES=4*1024*1024,MAX_MAPPING_BYTES=32*1024*1024,MAX_TOTAL_MAPPING_BYTES=64*1024*1024;
async function pinnedFile(path,pin,max,retain=false){
  if(typeof path!=='string'||!path||!hash(pin))fail('NATIVE_PRODUCT_AUTH_PIN_REQUIRED');
  const file=resolve(path),stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)fail('NATIVE_PRODUCT_AUTH_FILE');
  const digest=createHash('sha256'),parts=[];let size=0;
  for await(const bytes of createReadStream(file)){size+=bytes.length;if(size>max||size>stat.size)fail('NATIVE_PRODUCT_AUTH_FILE_CHANGED');digest.update(bytes);if(retain)parts.push(bytes);}
  const after=await lstat(file);
  if(!after.isFile()||after.isSymbolicLink()||after.size!==size||stat.size!==size||digest.digest('hex')!==pin)fail('NATIVE_PRODUCT_AUTH_FILE_CHANGED');
  return {bytes:size,contents:retain?Buffer.concat(parts):undefined};
}
/** sourceReader must be the trusted host's independently opened exact-file
 * AuthorizedV3Reader, not a caller boolean/report or a public API argument.
 * The external decision SHA pin is supplied independently, never discovered
 * from this manifest. The caller retains ownership of sourceReader.close(). */
export async function openNativeProductAuthorizer({sourceReader,referenceDecisionFile,trustedReferenceDecisionSha256,mappingFiles}){
  if(typeof sourceReader?.authorize!=='function')fail('NATIVE_PRODUCT_EXACT_SOURCE_AUTHORIZER_REQUIRED');
  if(!hash(trustedReferenceDecisionSha256))fail('NATIVE_PRODUCT_AUTH_PIN_REQUIRED');
  const loaded=await pinnedFile(referenceDecisionFile,trustedReferenceDecisionSha256,MAX_DECISION_BYTES,true);
  const manifest=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(loaded.contents));
  if(!exact(manifest,['schemaVersion','validatorVersion','batchId','fixedSourceNamespace','selection','mappingFiles','decisions'])
    ||manifest.schemaVersion!==1||manifest.validatorVersion!==NATIVE_PRODUCT_REFERENCE_DECISION_VERSION||!uuid(manifest.batchId)
    ||typeof manifest.fixedSourceNamespace!=='string'||!manifest.fixedSourceNamespace||manifest.selection?.entity!=='PRODUCT'
    ||!Array.isArray(manifest.mappingFiles)||manifest.mappingFiles.length<1||manifest.mappingFiles.length>16
    ||!Array.isArray(manifest.decisions)||manifest.decisions.length<1||manifest.decisions.length>50000)fail('NATIVE_PRODUCT_AUTH_MANIFEST');
  const paths=structuredClone(mappingFiles),files=new Map(),digests=new Set();
  if(!paths||typeof paths!=='object'||Array.isArray(paths)||Object.keys(paths).length!==manifest.mappingFiles.length)fail('NATIVE_PRODUCT_AUTH_MAPPING_FILES');
  for(const file of manifest.mappingFiles){
    if(!exact(file,['name','sha256'])||typeof file.name!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/.test(file.name)||!hash(file.sha256)
      ||files.has(file.name)||!Object.hasOwn(paths,file.name)||typeof paths[file.name]!=='string')fail('NATIVE_PRODUCT_AUTH_MAPPING_FILES');
    files.set(file.name,{path:paths[file.name],sha256:file.sha256});digests.add(file.sha256);
  }
  const decisions=new Map(),sourceIds=new Set(),targets=new Set(),overrides=new Map();
  for(const decision of manifest.decisions){
    if(!exact(decision,['sourceRowId','sourceKey','sourceEvidenceHash','product','blankPricePolicy','nullableFieldPolicy','references','decisionSha256',...(Object.hasOwn(decision,'sourceTransformation')?['sourceTransformation']:[])])
      ||!uuid(decision.sourceRowId)||typeof decision.sourceKey!=='string'||!decision.sourceKey||!hash(decision.sourceEvidenceHash)||!hash(decision.decisionSha256)
      ||decisions.has(decision.sourceKey)||sourceIds.has(decision.sourceRowId)||!uuid(decision.product?.nativeId)||targets.has(decision.product.nativeId))fail('NATIVE_PRODUCT_AUTH_DECISION');
    const {decisionSha256,...body}=decision;
    if(requestHash({validatorVersion:manifest.validatorVersion,...body})!==decisionSha256)fail('NATIVE_PRODUCT_AUTH_DECISION_DIGEST');
    const refs=decision.references;
    if(!exact(refs,['category','sizeGroup','season','supplier'])||!refs.category||!refs.sizeGroup)fail('NATIVE_PRODUCT_AUTH_REFERENCES');
    // Nullable reference decisions are complete explicit nulls, not missing keys.
    // Every nonnull reference must point to mapping bytes independently pinned
    // by this approved manifest and rehashed here; a hash-shaped input is not proof.
    for(const ref of Object.values(refs))if(ref!==null&&(!ref||!digests.has(ref.mappingSha256)))fail('NATIVE_PRODUCT_AUTH_MAPPING_DIGEST');
    if(Object.hasOwn(decision,'sourceTransformation')){
      const proof=decision.sourceTransformation;
      if(!exact(proof,['version','field','mappingSha256'])||proof.version!==NATIVE_PRODUCT_SIZE_GROUP_OVERRIDE_VERSION||proof.field!=='尺码组'||!digests.has(proof.mappingSha256))fail('NATIVE_PRODUCT_AUTH_SIZE_OVERRIDE');
      overrides.set(decision.sourceKey,{proof,decision});
    }
    decisions.set(decision.sourceKey,decision);sourceIds.add(decision.sourceRowId);targets.add(decision.product.nativeId);
  }
  let closed=false;
  const assertOpen=()=>{if(closed)fail('NATIVE_PRODUCT_AUTH_CLOSED');};
  const verifyFiles=async()=>{
    assertOpen();await pinnedFile(referenceDecisionFile,trustedReferenceDecisionSha256,MAX_DECISION_BYTES);
    let total=0;for(const file of files.values()){
      const required=[...overrides.values()].filter(x=>x.proof.mappingSha256===file.sha256),loaded=await pinnedFile(file.path,file.sha256,MAX_MAPPING_BYTES,required.length>0);
      total+=loaded.bytes;if(total>MAX_TOTAL_MAPPING_BYTES)fail('NATIVE_PRODUCT_AUTH_MAPPING_LIMIT');
      if(required.length){
        const rules=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(loaded.contents)),products=new Map([
          ['ce3871bc-1ddb-533a-a164-f4cd8bd3bf1a','501XK5399665'],['53641e19-578b-5f6e-9000-0d3a8201a017','501XK5399666'],
          ['dba12c5f-28ff-589c-88c8-dfb2c586f6ac','510XK5399661'],['4872df73-8997-583a-8f63-5468673c2b7c','510XK5399663']]);
        const sizes=new Map([['30',['202','165/S']],['31',['203','170/M']],['32',['204','175/L']],['33',['205','180/XL']],['34',['206','185/2XL']],['35',['207','190/3XL']]]),seen=new Set();
        if(!Array.isArray(rules)||rules.length!==18)fail('NATIVE_PRODUCT_AUTH_SIZE_OVERRIDE_RULE');
        for(const rule of rules){const size=sizes.get(rule.oldCurrentSizeName);
          if(!uuid(rule.sourceSkuId)||seen.has(rule.sourceSkuId)||products.get(rule.productSourceId)!==rule.productCode||!size
            ||rule.oldCurrentGroup!=='男装裤子尺码'||rule.newGroupId!=='UPPER'||rule.newGroupName!=='男装上衣尺码'
            ||rule.newSizeCode!==size[0]||rule.newSizeName!==size[1]||rule.scope!=='ONLY_THESE_FOUR_PRODUCTS_CURRENT_PANTS_BRANCHES'
            ||typeof rule.decisionSource!=='string'||!rule.decisionSource)fail('NATIVE_PRODUCT_AUTH_SIZE_OVERRIDE_RULE');seen.add(rule.sourceSkuId);}
        for(const {decision}of required)if(!rules.some(r=>r.productSourceId===decision.sourceKey))fail('NATIVE_PRODUCT_AUTH_SIZE_OVERRIDE_RULE');
      }
    }
    assertOpen();
  };
  await verifyFiles();
  return {
    report:{kind:'NATIVE_PRODUCT_COMPOSITE_AUTHORIZER',importReady:false,noSql:true,referenceDecisionSha256:trustedReferenceDecisionSha256,
      decisions:decisions.size,mappingFiles:files.size,sourceAuthorization:'REQUIRED_FOR_EVERY_CHUNK',referenceDecisionVersion:manifest.validatorVersion},
    async authorize(input){
      assertOpen();const chunk=structuredClone(input);validatePreparedNativeProductImportChunk(chunk);await verifyFiles();
      if(chunk.batchId!==manifest.batchId||chunk.fixedSourceNamespace!==manifest.fixedSourceNamespace||requestHash(chunk.selection)!==requestHash(manifest.selection))fail('NATIVE_PRODUCT_AUTH_SELECTION');
      for(const row of chunk.rows){
        const expected=decisions.get(row.source.sourceKey);
        if(!expected||requestHash(expected)!==requestHash(nativeProductReferenceDecision(row)))fail('NATIVE_PRODUCT_AUTH_REFERENCE_DECISION_MISMATCH');
      }
      // Deliberate minimal projection, then recompute the OLD prepared hash.
      // Passing nativeProducts/references/nullableFieldPolicy through would make
      // the old exact-source reader correctly reject READER_PREPARED_CHANGED.
      const projected=prepareProductEvidenceChunk({batchId:chunk.batchId,fixedSourceNamespace:chunk.fixedSourceNamespace,selection:chunk.selection,
        rows:chunk.rows.map(({source,product,blankPricePolicy})=>({source,product,blankPricePolicy}))});
      await sourceReader.authorize(projected);
      assertOpen();await verifyFiles();validatePreparedNativeProductImportChunk(chunk);
    },
    async close(){closed=true;decisions.clear();files.clear();digests.clear();overrides.clear();}
  };
}

const exactData26=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
  const d=Object.getOwnPropertyDescriptor(value,key);return d?.enumerable&&Object.hasOwn(d,'value');});
async function pinned26(path,pin,max,retain=false){
  if(typeof path!=='string'||!path||!hash(pin))fail('NATIVE_PRODUCT26_OUTSIDE_PIN_REQUIRED');
  const file=resolve(path),before=await lstat(file);if(!before.isFile()||before.isSymbolicLink()||before.size>max)fail('NATIVE_PRODUCT26_FILE');
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const opened=await handle.stat();if(opened.dev!==before.dev||opened.ino!==before.ino)fail('NATIVE_PRODUCT26_FILE_CHANGED');
    const digest=createHash('sha256'),parts=[];let bytes=0;
    for await(const part of handle.createReadStream({autoClose:false})){bytes+=part.length;if(bytes>max||bytes>before.size)fail('NATIVE_PRODUCT26_FILE_CHANGED');digest.update(part);if(retain)parts.push(part);}
    const after=await lstat(file),fd=await handle.stat();
    if(!after.isFile()||after.isSymbolicLink()||[after,fd].some(s=>s.dev!==before.dev||s.ino!==before.ino||s.size!==before.size||s.mtimeMs!==before.mtimeMs||s.ctimeMs!==before.ctimeMs)
      ||bytes!==before.size||digest.digest('hex')!==pin)fail('NATIVE_PRODUCT26_FILE_CHANGED');
    return{bytes,value:retain?JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(Buffer.concat(parts))):undefined};
  }finally{await handle.close();}
}
function exactOverrideRules26(rules,required){
  const products=new Map([['ce3871bc-1ddb-533a-a164-f4cd8bd3bf1a','501XK5399665'],['53641e19-578b-5f6e-9000-0d3a8201a017','501XK5399666'],['dba12c5f-28ff-589c-88c8-dfb2c586f6ac','510XK5399661'],['4872df73-8997-583a-8f63-5468673c2b7c','510XK5399663']]);
  const sizes=new Map([['30',['202','165/S']],['31',['203','170/M']],['32',['204','175/L']],['33',['205','180/XL']],['34',['206','185/2XL']],['35',['207','190/3XL']]]),seen=new Set();
  if(!Array.isArray(rules)||rules.length!==18)fail('NATIVE_PRODUCT26_SIZE_OVERRIDE_RULE');
  for(const r of rules){const size=sizes.get(r.oldCurrentSizeName);if(!uuid(r.sourceSkuId)||seen.has(r.sourceSkuId)||products.get(r.productSourceId)!==r.productCode||!size
    ||r.oldCurrentGroup!=='男装裤子尺码'||r.newGroupId!=='UPPER'||r.newGroupName!=='男装上衣尺码'||r.newSizeCode!==size[0]||r.newSizeName!==size[1]
    ||r.scope!=='ONLY_THESE_FOUR_PRODUCTS_CURRENT_PANTS_BRANCHES'||typeof r.decisionSource!=='string'||!r.decisionSource)fail('NATIVE_PRODUCT26_SIZE_OVERRIDE_RULE');seen.add(r.sourceSkuId);}
  for(const key of required)if(!rules.some(r=>r.productSourceId===key))fail('NATIVE_PRODUCT26_SIZE_OVERRIDE_RULE');
}
/** Explicit successor source/reference authority only. Never issues an execution,
 * target, SQL or runtime capability. V1's profile and 4MiB limit stay unchanged. */
export async function openNativeProductAuthorizer26(options){
  const keys=['sourceReader','referenceDecisionFile','trustedReferenceDecisionSha256','mappingFiles','reviewFile','trustedReviewSha256'];
  if(!exactData26(options,keys))fail('NATIVE_PRODUCT26_OPTIONS');
  const o=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(options,k).value]));
  if(!hash(o.trustedReviewSha256)||!hash(o.trustedReferenceDecisionSha256))fail('NATIVE_PRODUCT26_OUTSIDE_PIN_REQUIRED');
  if(!o.mappingFiles||Object.getPrototypeOf(o.mappingFiles)!==Object.prototype)fail('NATIVE_PRODUCT26_MAPPING_FILES');
  const pathKeys=Reflect.ownKeys(o.mappingFiles);
  if(pathKeys.some(k=>typeof k!=='string')||!exactData26(o.mappingFiles,pathKeys))fail('NATIVE_PRODUCT26_MAPPING_FILES');
  o.mappingFiles=Object.fromEntries(pathKeys.map(k=>[k,Object.getOwnPropertyDescriptor(o.mappingFiles,k).value]));
  const authorize=Object.getOwnPropertyDescriptor(o.sourceReader??{},'authorize');
  if(!authorize||!Object.hasOwn(authorize,'value')||typeof authorize.value!=='function')fail('NATIVE_PRODUCT26_EXACT_SOURCE_AUTHORIZER_REQUIRED');
  const authorizeSource=authorize.value.bind(o.sourceReader);
  const review=(await pinned26(o.reviewFile,o.trustedReviewSha256,1024*1024,true)).value;
  if(!exactData26(review,['version','decision','binding','manifest','scope','independentReview','realImportExecutionAuthorized'])
    ||review.version!=='C_NATIVE_PRODUCT_REFERENCE26_REVIEW_V1'||review.decision!=='ACCEPT_EXACT_MANIFEST_REFERENCE_BINDINGS'
    ||review.scope!=='FULL_REFERENCE_DECISIONS_ONLY'||review.realImportExecutionAuthorized!==false
    ||!exactData26(review.binding,['batchId','fixedSourceNamespace','selectionSha256'])
    ||!exactData26(review.manifest,['sha256','bytes','products','validatorVersion','schemaProfile'])
    ||review.manifest.sha256!==o.trustedReferenceDecisionSha256||review.manifest.validatorVersion!==NATIVE_PRODUCT_REFERENCE_DECISION_VERSION_26||review.manifest.schemaProfile!=='EXACT26'
    ||!exactData26(review.independentReview,['path','sha256','result'])||typeof review.independentReview.path!=='string'||!review.independentReview.path||!hash(review.independentReview.sha256)||review.independentReview.result!=='PASS')fail('NATIVE_PRODUCT26_FULL_REFERENCE_REVIEW_REQUIRED');
  const loaded=await pinned26(o.referenceDecisionFile,o.trustedReferenceDecisionSha256,8*1024*1024,true),m=loaded.value;
  if(!exactData26(m,['schemaVersion','validatorVersion','schemaProfile','batchId','fixedSourceNamespace','selection','mappingFiles','decisions'])
    ||m.schemaVersion!==2||m.validatorVersion!==NATIVE_PRODUCT_REFERENCE_DECISION_VERSION_26||m.schemaProfile!=='EXACT26'||!uuid(m.batchId)
    ||typeof m.fixedSourceNamespace!=='string'||!m.fixedSourceNamespace||m.selection?.entity!=='PRODUCT'||!hash(m.selection.selectionSha256)
    ||review.manifest.bytes!==loaded.bytes||!Array.isArray(m.decisions)||m.decisions.length<1||m.decisions.length>50000||review.manifest.products!==m.decisions.length
    ||requestHash(review.binding)!==requestHash({batchId:m.batchId,fixedSourceNamespace:m.fixedSourceNamespace,selectionSha256:m.selection.selectionSha256}))fail('NATIVE_PRODUCT26_MANIFEST');
  const allowed=['catalogue','parties','season_source','derived_season_proofs','size_overrides'];
  if(!Array.isArray(m.mappingFiles)||m.mappingFiles.length<4||m.mappingFiles.length>5||!exactData26(o.mappingFiles,m.mappingFiles.map(f=>f.name)))fail('NATIVE_PRODUCT26_MAPPING_FILES');
  const files=new Map();
  for(const f of m.mappingFiles){if(!exactData26(f,['name','sha256'])||!allowed.includes(f.name)||files.has(f.name)||!hash(f.sha256)||typeof o.mappingFiles[f.name]!=='string')fail('NATIVE_PRODUCT26_MAPPING_FILES');files.set(f.name,{path:o.mappingFiles[f.name],sha256:f.sha256});}
  if(!allowed.slice(0,4).every(n=>files.has(n)))fail('NATIVE_PRODUCT26_MAPPING_FILES');
  const decisions=new Map(),sourceIds=new Set(),targets=new Set(),overrides=[];
  for(const d of m.decisions){
    if(!exactData26(d,['sourceRowId','sourceKey','sourceEvidenceHash','product','blankPricePolicy','nullableFieldPolicy','references','seasonSelection','decisionSha256',
      ...(Object.hasOwn(d,'sourceTransformation')?['sourceTransformation']:[]),...(Object.hasOwn(d,'legacyScalarCreation')?['legacyScalarCreation']:[])])
      ||!uuid(d.sourceRowId)||typeof d.sourceKey!=='string'||!d.sourceKey||!hash(d.sourceEvidenceHash)||!hash(d.decisionSha256)
      ||decisions.has(d.sourceKey)||sourceIds.has(d.sourceRowId)||!exactData26(d.product,['sourceKey','nativeId','expectedVersion'])||!uuid(d.product.nativeId)||d.product.sourceKey!==d.sourceKey||d.product.expectedVersion!==1||targets.has(d.product.nativeId))fail('NATIVE_PRODUCT26_DECISION');
    const{decisionSha256,...body}=d;if(requestHash({validatorVersion:m.validatorVersion,...body})!==decisionSha256)fail('NATIVE_PRODUCT26_DECISION_DIGEST');
    const refs=d.references;if(!exactData26(refs,['category','sizeGroup','season','supplier'])||!refs.category||!refs.sizeGroup)fail('NATIVE_PRODUCT26_REFERENCES');
    for(const[name,ref]of Object.entries(refs))if(ref!==null&&ref.mappingSha256!==files.get(name==='supplier'?'parties':'catalogue').sha256)fail('NATIVE_PRODUCT26_MAPPING_DIGEST');
    if(!d.seasonSelection||d.seasonSelection.mapping_sha256!==files.get('season_source').sha256)fail('NATIVE_PRODUCT26_MAPPING_DIGEST');
    if(Object.hasOwn(d,'sourceTransformation')){const p=d.sourceTransformation;if(!exactData26(p,['version','field','mappingSha256'])||p.version!==NATIVE_PRODUCT_SIZE_GROUP_OVERRIDE_VERSION||p.field!=='尺码组'||p.mappingSha256!==files.get('size_overrides')?.sha256)fail('NATIVE_PRODUCT26_SIZE_OVERRIDE_RULE');overrides.push(d.sourceKey);}
    decisions.set(d.sourceKey,d);sourceIds.add(d.sourceRowId);targets.add(d.product.nativeId);
  }
  let closed=false;const active=()=>{if(closed)fail('NATIVE_PRODUCT26_CLOSED');};
  async function verify(){active();await pinned26(o.reviewFile,o.trustedReviewSha256,1024*1024);await pinned26(o.referenceDecisionFile,o.trustedReferenceDecisionSha256,8*1024*1024);
    let total=0;for(const[name,file]of files){const item=await pinned26(file.path,file.sha256,32*1024*1024,name==='derived_season_proofs'||name==='size_overrides');total+=item.bytes;if(total>64*1024*1024)fail('NATIVE_PRODUCT26_MAPPING_LIMIT');
      if(name==='size_overrides')exactOverrideRules26(item.value,overrides);
      if(name==='derived_season_proofs'){const s=item.value;if(s.version!=='NATIVE_PRODUCT_SEASON_SELECTION_DERIVED_CANDIDATE_V1'||s.batchId!==m.batchId||s.fixedSourceNamespace!==m.fixedSourceNamespace||s.selectionSha256!==m.selection.selectionSha256
        ||s.sourceMappingSha256!==files.get('season_source').sha256||s.dictionaryMappingSha256!==files.get('catalogue').sha256||!Array.isArray(s.rows))fail('NATIVE_PRODUCT26_SEASON_BINDING');
        const byKey=new Map(s.rows.map(row=>[row.sourceKey,row]));if(byKey.size!==s.rows.length)fail('NATIVE_PRODUCT26_SEASON_BINDING');
        for(const d of decisions.values()){const p=byKey.get(d.sourceKey);if(!p||p.nativeProductId!==d.product.nativeId||p.sourceEvidenceHash!==d.sourceEvidenceHash||p.derivedProofSha256!==requestHash(p.seasonSelection)
          ||requestHash(p.seasonSelection)!==requestHash(d.seasonSelection)||requestHash(p.legacyScalarCreation??null)!==requestHash(d.legacyScalarCreation??null))fail('NATIVE_PRODUCT26_SEASON_BINDING');}
      }
    }active();}
  await verify();
  return {report:Object.freeze({kind:'NATIVE_PRODUCT_COMPOSITE_AUTHORIZER26',referenceDecisionVersion:m.validatorVersion,referenceDecisionSha256:o.trustedReferenceDecisionSha256,
    reviewSha256:o.trustedReviewSha256,decisions:decisions.size,mappingFiles:files.size,sourceAuthorization:'REQUIRED_FOR_EVERY_CHUNK',importReady:false,noSql:true}),
    async authorize(input){active();const originalHash=historySettlementRequestHash(input),chunk=structuredClone(input);validatePreparedNativeProductImportChunk26(chunk);await verify();
      if(chunk.batchId!==m.batchId||chunk.fixedSourceNamespace!==m.fixedSourceNamespace||requestHash(chunk.selection)!==requestHash(m.selection))fail('NATIVE_PRODUCT26_SELECTION');
      for(const row of chunk.rows){const approved=decisions.get(row.source.sourceKey);if(!approved||requestHash(approved)!==requestHash(nativeProductReferenceDecision26(row)))fail('NATIVE_PRODUCT26_REFERENCE_DECISION_MISMATCH');}
      const projected=prepareProductEvidenceChunk({batchId:chunk.batchId,fixedSourceNamespace:chunk.fixedSourceNamespace,selection:chunk.selection,
        rows:chunk.rows.map(({source,product,blankPricePolicy})=>({source,product,blankPricePolicy}))});
      const projectionHash=historySettlementRequestHash(projected);
      if(await authorizeSource(projected)!==undefined)fail('NATIVE_PRODUCT26_SOURCE_AUTHORIZATION');
      if(historySettlementRequestHash(projected)!==projectionHash)fail('NATIVE_PRODUCT26_SOURCE_PROJECTION_CHANGED');
      await verify();validatePreparedNativeProductImportChunk26(chunk);if(historySettlementRequestHash(input)!==originalHash)fail('NATIVE_PRODUCT26_INPUT_CHANGED');active();
    },async close(){closed=true;decisions.clear();files.clear();sourceIds.clear();targets.clear();overrides.length=0;}};
}
