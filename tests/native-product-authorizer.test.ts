import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { mkdtemp, rm, writeFile, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { openNativeProductAuthorizer } from "../scripts/import-v2/authorized-native-product-reader.mjs";
import { IMPORT_V2_TABLES } from "../packages/application/src/import-v2-contract.ts";
import { nativeProductReferenceDecision, NATIVE_PRODUCT_NULLABLE_POLICY, NATIVE_PRODUCT_REFERENCE_DECISION_VERSION, prepareNativeProductImportChunk, stageNativeProductImportChunk } from "../packages/application/src/native-product-import.ts";
import type { NativeProductImportChunk } from "../packages/application/src/native-product-import.ts";
import { prepareProductEvidenceChunk, validatePreparedProductEvidenceChunk } from "../packages/application/src/product-evidence-staging.ts";
import type { PreparedProductEvidenceChunk } from "../packages/application/src/product-evidence-staging.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
async function fixture(t: TestContext, optionalNull = false) {
  const root = await mkdtemp(join(tmpdir(),"synthetic-native-product-authority-")); t.after(() => rm(root,{recursive:true,force:true}));
  const mappingFiles: Record<string,string> = {}, mappings: {name:string;sha256:string}[] = [];
  for (const name of ["category","size-group","supplier","season"]) {
    const bytes = JSON.stringify({ kind:"SYNTHETIC_REVIEWED_MAPPING_BYTES", name }), path = join(root,name+".json");
    await writeFile(path,bytes); mappingFiles[name] = path; mappings.push({name,sha256:sha(bytes)});
  }
  const map = (name:string) => mappings.find(m=>m.name===name)!.sha256;
  const normalized = Object.fromEntries(IMPORT_V2_TABLES.find(table=>table.entity==="PRODUCT")!.columns.map(c=>[c.name,""]));
  Object.assign(normalized,{来源编号:"SYNTHETIC_SOURCE",款号:"SYNTHETIC_CODE",商品名称:"SYNTHETIC PRODUCT",分类路径:"SYNTHETIC PATH",尺码组:"SYNTHETIC GROUP",状态:"正常",零售价:"1.25",
    季节:optionalNull?"":"SYNTHETIC SEASON",供应商来源编号:optionalNull?"":"SYNTHETIC_SUPPLIER_SOURCE"});
  const chunk: NativeProductImportChunk = { batchId:id(1),fixedSourceNamespace:"synthetic-authorizer",selection:{entity:"PRODUCT",source:"BASE_V2",path:"business/01商品.csv",
    baseManifestSha256:"a".repeat(64),selectionSha256:"b".repeat(64),approvalSha256:"c".repeat(64),csvSha256:"d".repeat(64)}, rows:[{
    source:{id:id(2),batchId:id(1),entityType:"PRODUCT",sourceKey:normalized["来源编号"]!,fileRef:"synthetic-original.xlsx",sheet:"SYNTHETIC",rowNo:"2",sourceFileSha256:"e".repeat(64),rowSha256:"f".repeat(64),rawFields:{...normalized},normalizedFields:normalized,
      fieldProvenance:{schema_version:1,fields:Object.fromEntries(Object.entries(normalized).map(([key,raw])=>[key,{origin:"ORIGINAL",reason:"EXACT_SYNTHETIC_CELL",raw}]))}},
    product:{sourceKey:normalized["来源编号"]!,nativeId:id(3),expectedVersion:1},blankPricePolicy:"V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET",nullableFieldPolicy:NATIVE_PRODUCT_NULLABLE_POLICY,
    references:{ category:{sourceValue:normalized["分类路径"]!,mappingSha256:map("category"),path:[{nativeId:id(4),name:"SYNTHETIC CATEGORY",expectedVersion:1}]},
      sizeGroup:{sourceValue:normalized["尺码组"]!,nativeId:id(5),code:"SYNTHETIC_GROUP",name:"SYNTHETIC GROUP",mappingSha256:map("size-group")},
      supplier:optionalNull?null:{sourceValue:normalized["供应商来源编号"]!,nativeId:id(6),code:"SYNTHETIC_SUPPLIER",name:"SYNTHETIC SUPPLIER",expectedVersion:1,enabled:false,mappingSha256:map("supplier")},
      season:optionalNull?null:{sourceValue:normalized["季节"]!,nativeId:id(7),code:"SYNTHETIC_SEASON",name:"SYNTHETIC SEASON",mappingSha256:map("season")}}
  }] };
  const prepared = prepareNativeProductImportChunk(chunk);
  const projected = prepareProductEvidenceChunk({...chunk,rows:chunk.rows.map(({source,product,blankPricePolicy})=>({source,product,blankPricePolicy}))});
  const manifest = {schemaVersion:1,validatorVersion:NATIVE_PRODUCT_REFERENCE_DECISION_VERSION,batchId:chunk.batchId,fixedSourceNamespace:chunk.fixedSourceNamespace,
    selection:chunk.selection,mappingFiles:mappings,decisions:chunk.rows.map(nativeProductReferenceDecision)};
  const referenceDecisionFile = join(root,"reviewed-decisions.json");
  let sourceCalls = 0;
  const control: {deny?:boolean;pause?:()=>Promise<void>} = {};
  const sourceReader = {async authorize(input: unknown) {
    sourceCalls++; assert.equal(Object.hasOwn(input as object,"nativeProducts"),false);
    validatePreparedProductEvidenceChunk(input as PreparedProductEvidenceChunk);
    if(control.deny||requestHash(input)!==requestHash(projected)) throw Error("SYNTHETIC_EXACT_SOURCE_AUTH_DENIED");
    if(control.pause) await control.pause();
  }};
  const writeManifest = async () => {const bytes=JSON.stringify(manifest);await writeFile(referenceDecisionFile,bytes);return {sourceReader,referenceDecisionFile,trustedReferenceDecisionSha256:sha(bytes),mappingFiles};};
  const options = await writeManifest();
  return {root,chunk,prepared,projected,manifest,options,writeManifest,control,sourceCalls:()=>sourceCalls};
}
test("native authorizer projects exact old source DTO/hash, then independently checks complete reviewed reference decisions and mapping bytes",async t=>{
  const f=await fixture(t),auth=await openNativeProductAuthorizer(f.options);t.after(()=>auth.close());
  assert.notEqual(requestHash(f.prepared),requestHash(f.projected));
  await auth.authorize(f.prepared);assert.equal(f.sourceCalls(),1);assert.equal(auth.report.noSql,true);assert.equal(auth.report.importReady,false);
  let writes=0;const result=await stageNativeProductImportChunk(f.chunk,{mode:"STAGE",authorize:auth.authorize,store:{async stage(){writes++;return {inserted:1,replayed:0};}}});
  assert.equal(writes,1);assert.equal(result.published,false);assert.equal(f.sourceCalls(),2);
});
test("native reference decisions preserve explicit supplier/season null and nullable policy instead of manufacturing references",async t=>{
  const f=await fixture(t,true),auth=await openNativeProductAuthorizer(f.options);t.after(()=>auth.close());await auth.authorize(f.prepared);
  assert.equal(f.manifest.decisions[0]!.references.supplier,null);assert.equal(f.manifest.decisions[0]!.references.season,null);
});
test("native authorizer requires independent manifest pin, exact source authority and actual pinned mapping-file set",async t=>{
  const f=await fixture(t);
  await assert.rejects(openNativeProductAuthorizer({...f.options,trustedReferenceDecisionSha256:""}),/PIN_REQUIRED/);
  await assert.rejects(openNativeProductAuthorizer({...f.options,trustedReferenceDecisionSha256:"0".repeat(64)}),/FILE_CHANGED/);
  await assert.rejects(openNativeProductAuthorizer({...f.options,sourceReader:undefined as never}),/EXACT_SOURCE_AUTHORIZER_REQUIRED/);
  const missing={...f.options.mappingFiles};delete missing["season"];
  await assert.rejects(openNativeProductAuthorizer({...f.options,mappingFiles:missing}),/MAPPING_FILES/);
  await assert.rejects(openNativeProductAuthorizer({...f.options,mappingFiles:{...f.options.mappingFiles,extra:"synthetic"}}),/MAPPING_FILES/);
  assert.equal(f.sourceCalls(),0);
});
test("native authorizer rejects every full reference/decision/source target drift before staging",async t=>{
  const f=await fixture(t),auth=await openNativeProductAuthorizer(f.options);t.after(()=>auth.close());
  const changes: ((c:NativeProductImportChunk)=>void)[]=[
    c=>{(c.rows[0]!.references.category.path[0]! as {name:string}).name="CHANGED SYNTHETIC CATEGORY";},
    c=>{(c.rows[0]!.references.sizeGroup as {code:string}).code="CHANGED SYNTHETIC GROUP";},
    c=>{(c.rows[0]!.references.supplier! as {expectedVersion:number}).expectedVersion=2;},
    c=>{(c.rows[0]!.references.season! as {nativeId:string}).nativeId=id(99);},
    c=>{(c.rows[0]!.product as {nativeId:string}).nativeId=id(98);},
    c=>{c.rows[0]!.source.rowSha256="9".repeat(64);}
  ];
  for(const change of changes){const chunk=structuredClone(f.chunk);change(chunk);let writes=0;
    await assert.rejects(stageNativeProductImportChunk(chunk,{mode:"STAGE",authorize:auth.authorize,store:{async stage(){writes++;return {inserted:1,replayed:0};}}}),/REFERENCE_DECISION_MISMATCH/);assert.equal(writes,0);}
  assert.equal(f.sourceCalls(),0);
});
test("a self-consistent new decision digest or hash-shaped reference is not authority without all pinned files and exact source authorization",async t=>{
  const f=await fixture(t);f.manifest.decisions[0]!.decisionSha256="0".repeat(64);
  await assert.rejects(openNativeProductAuthorizer(await f.writeManifest()),/DECISION_DIGEST/);
  f.manifest.decisions=f.chunk.rows.map(nativeProductReferenceDecision);
  (f.chunk.rows[0]!.references.category as {mappingSha256:string}).mappingSha256="8".repeat(64);f.manifest.decisions=f.chunk.rows.map(nativeProductReferenceDecision);
  await assert.rejects(openNativeProductAuthorizer(await f.writeManifest()),/MAPPING_DIGEST/);
  const other=await fixture(t),forged=structuredClone(other.chunk);forged.rows[0]!.source.sheet="FORGED SYNTHETIC";
  other.manifest.decisions=forged.rows.map(nativeProductReferenceDecision);
  const auth=await openNativeProductAuthorizer(await other.writeManifest());t.after(()=>auth.close());
  await assert.rejects(auth.authorize(prepareNativeProductImportChunk(forged)),/EXACT_SOURCE_AUTH_DENIED/);assert.equal(other.sourceCalls(),1);
});
test("native authorizer rejects missing full/null reference decisions, stale decision digests, duplicate grants and wrong batch selection",async t=>{
  const f=await fixture(t);
  delete (f.manifest.decisions[0]!.references as unknown as Record<string,unknown>).season;
  const {decisionSha256:_old,...body}=f.manifest.decisions[0]!;
  f.manifest.decisions[0]!.decisionSha256=requestHash({validatorVersion:f.manifest.validatorVersion,...body});
  await assert.rejects(openNativeProductAuthorizer(await f.writeManifest()),/REFERENCES/);
  const dup=await fixture(t);dup.manifest.decisions.push(dup.manifest.decisions[0]!);
  await assert.rejects(openNativeProductAuthorizer(await dup.writeManifest()),/AUTH_DECISION/);
  const wrong=await fixture(t);wrong.manifest.batchId=id(88);const auth=await openNativeProductAuthorizer(await wrong.writeManifest());t.after(()=>auth.close());
  await assert.rejects(auth.authorize(wrong.prepared),/AUTH_SELECTION/);
});
test("native authorizer rehashes both decision and mapping files on every call; symlink/changed bytes cannot reuse old authority",async t=>{
  const f=await fixture(t),auth=await openNativeProductAuthorizer(f.options);t.after(()=>auth.close());
  await writeFile(f.options.mappingFiles["category"]!,"SYNTHETIC TAMPER");await assert.rejects(auth.authorize(f.prepared),/FILE_CHANGED/);assert.equal(f.sourceCalls(),0);
  const other=await fixture(t),link=join(other.root,"symlink-map.json");await symlink(other.options.mappingFiles["category"]!,link);
  await assert.rejects(openNativeProductAuthorizer({...other.options,mappingFiles:{...other.options.mappingFiles,category:link}}),/AUTH_FILE/);
  const decision=await fixture(t),a=await openNativeProductAuthorizer(decision.options);t.after(()=>a.close());
  await writeFile(decision.options.referenceDecisionFile,Buffer.concat([await readFile(decision.options.referenceDecisionFile),Buffer.from(" ")]));
  await assert.rejects(a.authorize(decision.prepared),/FILE_CHANGED/);
});
test("native authorizer rechecks after async exact-source authorization, honors close, and never stages on denial",async t=>{
  const f=await fixture(t);let resume!:()=>void,reached!:()=>void;
  const wait=new Promise<void>(r=>{resume=r;}),entered=new Promise<void>(r=>{reached=r;});
  f.control.pause=async()=>{reached();await wait;};const auth=await openNativeProductAuthorizer(f.options);t.after(()=>auth.close());
  let writes=0;const pending=stageNativeProductImportChunk(f.chunk,{mode:"STAGE",authorize:auth.authorize,store:{async stage(){writes++;return {inserted:1,replayed:0};}}});
  await entered;await writeFile(f.options.mappingFiles["season"]!,"CHANGED DURING SOURCE AUTH");resume();await assert.rejects(pending,/FILE_CHANGED/);assert.equal(writes,0);
  const other=await fixture(t),a=await openNativeProductAuthorizer(other.options);await a.close();await assert.rejects(a.authorize(other.prepared),/AUTH_CLOSED/);
  const denied=await fixture(t);denied.control.deny=true;const d=await openNativeProductAuthorizer(denied.options);t.after(()=>d.close());
  await assert.rejects(d.authorize(denied.prepared),/EXACT_SOURCE_AUTH_DENIED/);
});
