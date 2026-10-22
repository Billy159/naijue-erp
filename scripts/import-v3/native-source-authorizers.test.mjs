import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createNativeIdentityRegistry, reviewedPartyBinding, sourceEvidence } from './prepare-native-bindings.mjs';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { createNativeSourceStepAuthorizer, NATIVE_SOURCE_STEP_KINDS, openNativeBindingRegistry, openReviewedCatalogueSource } from './native-source-authorizers.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = b => createHash('sha256').update(b).digest('hex'), pin = 'a'.repeat(64);
async function registryReview(dir, manifest, binding, files) {
  const value={version:'C_NATIVE_BINDING_PARTIAL_REVIEW_PIN_V1',decision:'ACCEPT_EXACT_QB_REVIEWED_PARTIAL_ARTIFACT_SCOPE',
    manifestSha256:hash(manifest),manifestBytes:manifest.length,binding,components:files.map(f=>({component:f.name,sha256:f.sha256,scope:'SYNTHETIC_C_REVIEW_PROTOCOL_ONLY'})),
    closedToUnreviewedComponents:true,realNativeCommandsOrImportAuthorizedByThisPinAlone:false};
  const bytes=Buffer.from(JSON.stringify(value)),reviewRecordFile=join(dir,'scope-review.json');await writeFile(reviewRecordFile,bytes);return {reviewRecordFile,trustedReviewRecordSha256:hash(bytes)};
}
test('every direct-store kind needs its real source authorizer; source verdict flags are not accepted', async () => {
  const calls = [], h = Object.fromEntries(NATIVE_SOURCE_STEP_KINDS.map(k => [k, async p => { calls.push(k); assert.equal(p.marker, k); }]));
  const authorize = createNativeSourceStepAuthorizer(h);
  for (const k of NATIVE_SOURCE_STEP_KINDS) await authorize({ kind: k, payload: { marker: k } });
  assert.deepEqual(calls, NATIVE_SOURCE_STEP_KINDS); delete h.PRODUCT; assert.throws(() => createNativeSourceStepAuthorizer(h), /ALL_AUTHORITIZERS_REQUIRED/);
  await assert.rejects(authorize({ kind: 'invented', payload: {} }), /UNKNOWN_STEP/);
});
test('callback mutation, boolean grants and approval-map tampering are rejected', async () => {
  const h = Object.fromEntries(NATIVE_SOURCE_STEP_KINDS.map(k => [k, async () => {}]));
  h.PRODUCT = async () => true; await assert.rejects(createNativeSourceStepAuthorizer(h)({ kind: 'PRODUCT', payload: {} }), /AUTHORIZER_PROTOCOL/);
  h.SETTLEMENT = async p => { p.approvals.set('x', 'changed'); };
  await assert.rejects(createNativeSourceStepAuthorizer(h)({ kind: 'SETTLEMENT', payload: { approvals: new Map([['x', 'original']]) } }), /AUTHORIZER_PROTOCOL/);
});
test('externally pinned real registry supplies exact product resolver and refuses target/source/binding/file changes', async () => {
  const dir = await mkdtemp(join(await realpath(tmpdir()), 'native-source-test-'));
  try {
    const fields = { '来源编号': 'p', '款号': 'synthetic' }, rows = [{ entity: 'PRODUCT', sourceKey: 'p', nativeId: id(2), normalizedHash: requestHash(fields) }];
    const files = [];
    for (const [name, value] of [['native-identity-registry.json', rows], ['party-reference-candidates.json', []],['product-source-candidates.json',[{entityType:'PRODUCT',sourceKey:'p',rawFields:fields,normalizedFields:fields}]]]) {
      const b = Buffer.from(JSON.stringify(value)); await writeFile(join(dir, name), b); files.push({ name, bytes: b.length, sha256: hash(b) });
    }
    const binding = { batchId: id(1), fixedSourceNamespace: 'synthetic:namespace', selectionSha256: pin, cutoffAt: '2026-10-04T12:00:00+08:00' };
    const manifest = Buffer.from(JSON.stringify({ version: 'NATIVE_BINDING_REVIEW_CANDIDATE_V1', ...binding, files, registryFile: 'native-identity-registry.json' }));
    await writeFile(join(dir, 'review-candidate-manifest.json'), manifest);
    const review=await registryReview(dir,manifest,binding,files);
    await assert.rejects(openNativeBindingRegistry({ directory: dir, binding, trustedManifestSha256: null,...review }), /OUTSIDE_PIN_REQUIRED/);
    await assert.rejects(openNativeBindingRegistry({ directory: dir, binding: { ...binding, batchId: id(9) }, trustedManifestSha256: hash(manifest),...review }), /REGISTRY_BINDING/);
    await assert.rejects(openNativeBindingRegistry({ directory: dir, binding, trustedManifestSha256: hash(manifest) }), /REVIEW_SCOPE_REQUIRED/);
    const registry = await openNativeBindingRegistry({ directory: dir, binding, trustedManifestSha256: hash(manifest),...review });
    const q = { entity: 'PRODUCT', sourceKey: 'p', rawFields: fields, normalizedFields: fields };
    assert.deepEqual(await registry.resolveNativeBinding(q), { product: { sourceKey: 'p', nativeId: id(2), expectedVersion: 1 }, blankPricePolicy: 'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET' });
    await assert.rejects(registry.resolveNativeBinding({ ...q, normalizedFields: { ...fields, '款号': 'wrong' } }), /NORMALIZED_CHANGED/);
    await assert.rejects(registry.resolveNativeBinding({...q,rawFields:{...fields,'款号':'wrong'}}),/PRODUCT_CHANGED/);
    await assert.rejects(registry.resolveNativeBinding({...q,entity:'TRANSFER_LINE'}),/REVIEW_SCOPE_FORBIDDEN/);
    await assert.rejects(registry.resolveNativeBinding({...q,entity:'SALES_HEADER'}),/REVIEW_SCOPE_FORBIDDEN/);
    await writeFile(join(dir, 'native-identity-registry.json'), JSON.stringify(rows) + ' '); await assert.rejects(registry.verify(), /FILE_CHANGED/);
    registry.close(); await assert.rejects(registry.resolveNativeBinding(q), /REGISTRY_CLOSED/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('reviewed catalogue actual bytes produce native chunks, exact authorization and complete sorted closure streams; no supplied flags/defaults', async () => {
  const dir=await mkdtemp(join(await realpath(tmpdir()),'catalogue-source-test-'));
  try{
    const binding={batchId:id(1),fixedSourceNamespace:'synthetic:catalogue',selectionSha256:pin,authorizedPayloadHash:'b'.repeat(64)};
    const value={version:'NATIVE_CATALOGUE_OCCURRENCE_CANDIDATE_V1',...binding,baseManifestSha256:pin,groups:[[
      {entity:'COLOR',sourceKey:'color-007',nativeId:id(2),values:{code:'007',name:'synthetic color',enabled:false},references:{},originalEvidence:{kind:'SYNTHETIC',sourceFileSha256:pin,sheet:'colors',rowNo:'2'}}]]};
    const bytes=Buffer.from(JSON.stringify(value)),mappingFile=join(dir,'mapping.json');await writeFile(mappingFile,bytes);
    const review={version:'NATIVE_CATALOGUE_TECHNICAL_REVIEW_V1',...binding,mappingSha256:hash(bytes)},reviewBytes=Buffer.from(JSON.stringify(review)),reviewApprovalFile=join(dir,'outside-review.json');await writeFile(reviewApprovalFile,reviewBytes);
    const options={mappingFile,trustedMappingSha256:hash(bytes),reviewApprovalFile,trustedReviewApprovalSha256:hash(reviewBytes),binding};
    await assert.rejects(openReviewedCatalogueSource({...options,trustedReviewApprovalSha256:null}),/OUTSIDE_PIN_REQUIRED/);
    const source=await openReviewedCatalogueSource(options);try{
      const chunks=[];for await(const c of source.chunks())chunks.push(c);assert.equal(chunks.length,1);await source.authorize(chunks[0]);
      assert.equal(chunks[0].rows[0].nativeSnapshot.code,'007');assert.equal(chunks[0].rows[0].nativeSnapshot.enabled,false);
      const altered=structuredClone(chunks[0]);altered.rows[0].nativeSnapshot.enabled=true;await assert.rejects(source.authorize(altered));
      const session=await source.openClosure(binding,{group:'CATALOGUE',signal:new AbortController().signal});
      await session.verify();const original=[],typed=[];for await(const r of session.sourceRows())original.push(r);for await(const r of session.typedRows())typed.push(r);
      assert.equal(original.length,1);assert.equal(typed.length,2);assert.deepEqual(typed.map(r=>r.relation),['color','import_native_catalogue_binding']);
      assert.equal(typed[0].projection.enabled,false);await session.close();await assert.rejects(session.verify(),/CLOSED/);
      await writeFile(mappingFile,Buffer.concat([bytes,Buffer.from(' ')]));await assert.rejects(source.verify(),/FILE_CHANGED/);
    }finally{await source.close();}
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('real party source factory keeps hall+warehouse cycle atomic, customers before defaults and complete closure projections',async()=>{
  const dir=await mkdtemp(join(await realpath(tmpdir()),'party-closure-source-test-'));
  try{
    const binding={batchId:id(1),fixedSourceNamespace:'synthetic:party',selectionSha256:pin,cutoffAt:'2026-10-04T12:00:00+08:00',authorizedPayloadHash:'b'.repeat(64)};
    let n=20;const registry=createNativeIdentityRegistry(()=>id(n++));
    const overrides={CUSTOMER:{'来源编号':'c','名称':'synthetic customer','原编码':'001','状态':'正常'},HALL:{'来源编号':'h','厅名称':'synthetic hall','状态':'正常','默认客户来源编号':'c','默认销货仓来源编号':'w'},
      WAREHOUSE:{'来源编号':'w','仓库名称':'synthetic warehouse','所属厅来源编号':'h','状态':'正常','切换范围':'本次完整核准'},
      STAFF:{'来源编号':'s','姓名':'synthetic staff','角色':'管理员','所属厅来源编号':'h','任职状态':'在职','联系方式':''}};
    const fields=Object.entries(overrides).map(([entity,over])=>{const t=IMPORT_V2_TABLES.find(t=>t.entity===entity);const normalized={...Object.fromEntries(t.columns.map(c=>[c.name,''])),...over};registry.add(entity,over['来源编号'],normalized);return{entity,normalized,table:t};});
    const party=fields.map(({entity,normalized,table},i)=>{const raw={entity,sourceId:normalized['来源编号'],file:'synthetic.xlsx',sheet:entity,row:2,sourceSha256:pin,data:normalized};return{batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,
      selection:{baseManifestSha256:pin,selectionSha256:pin,approvalSha256:pin,entity,source:'BASE_V2',path:table.file,csvSha256:pin},source:sourceEvidence(raw,JSON.stringify(raw),normalized,binding),
      ...reviewedPartyBinding(entity,normalized,registry,'synthetic-exact-enums','2026-10-22T00:00:00Z',()=>id(99))};});
    const files=[];for(const[name,value]of[['native-identity-registry.json',[...registry.values()]],['party-reference-candidates.json',party]]){const bytes=Buffer.from(JSON.stringify(value));await writeFile(join(dir,name),bytes);files.push({name,bytes:bytes.length,sha256:hash(bytes)});}
    const bytes=Buffer.from(JSON.stringify({version:'NATIVE_BINDING_REVIEW_CANDIDATE_V1',...binding,files,registryFile:'native-identity-registry.json'}));await writeFile(join(dir,'review-candidate-manifest.json'),bytes);
    const review=await registryReview(dir,bytes,binding,files);
    const source=await openNativeBindingRegistry({directory:dir,trustedManifestSha256:hash(bytes),binding,...review});try{
      const chunks=[];for await(const c of source.partyChunks()){await source.authorizePartyChunk(c);chunks.push(c);}
      assert.deepEqual(chunks.map(c=>c.rows.map(r=>r.entity)),[['CUSTOMER'],['HALL','WAREHOUSE'],['STAFF']]);
      const bootstrap=await source.bootstrapPartyClosure('s');assert.equal(bootstrap.chunk.rows.length,4);await source.authorizePartyChunk(bootstrap.chunk);
      assert.equal(bootstrap.staff.nativeId,registry.get('STAFF','s').nativeId);assert.equal(bootstrap.staff.role,'ADMIN');assert.equal(bootstrap.staff.hallId,registry.get('HALL','h').nativeId);
      assert.equal(bootstrap.chunk.rows.filter(r=>r.entity==='HALL').length,1);assert.equal(bootstrap.chunk.rows.filter(r=>r.entity==='WAREHOUSE').length,1);
      await assert.rejects(source.bootstrapPartyClosure('unlinked-source-account'),/REFERENCE_MISSING/);
      const session=await source.openPartyClosure(binding,{group:'PARTIES',signal:new AbortController().signal});await session.verify();
      const sourceRows=[],typedRows=[];for await(const row of session.sourceRows())sourceRows.push(row);for await(const row of session.typedRows())typedRows.push(row);
      assert.equal(sourceRows.length,4);assert.equal(typedRows.length,11);assert.equal(typedRows.filter(r=>r.relation==='native_party_import_evidence').length,4);
      const warehouse=typedRows.find(r=>r.relation==='warehouse');assert.equal(warehouse.projection.hall_id,registry.get('HALL','h').nativeId);
      await session.close();await assert.rejects(session.verify(),/CLOSED/);
    }finally{source.close();}
  }finally{await rm(dir,{recursive:true,force:true});}
});
