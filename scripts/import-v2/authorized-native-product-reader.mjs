// Thin trusted-host composition. Never widens the old source reader's accepted
// shape, opens a DB, guesses references, or treats a caller aggregate as a grant.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { prepareProductEvidenceChunk } from '../../packages/application/src/product-evidence-staging.ts';
import { nativeProductReferenceDecision, NATIVE_PRODUCT_REFERENCE_DECISION_VERSION, NATIVE_PRODUCT_SIZE_GROUP_OVERRIDE_VERSION, validatePreparedNativeProductImportChunk } from '../../packages/application/src/native-product-import.ts';
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
