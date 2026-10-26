import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createNativeIdentityRegistry, reviewedPartyBinding, sourceEvidence } from './prepare-native-bindings.mjs';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { createNativeSourceStepAuthorizer, NATIVE_SOURCE_STEP_KINDS, openNativeBindingRegistry, openReviewedCatalogueSource, openApprovedBarcodeMainDemotions, openReviewedProductSeasonSource, openReviewedProductEvidenceSource, openReviewedCatalogueSource26 } from './native-source-authorizers.mjs';
import { prepareProductEvidenceChunk } from '../../packages/application/src/product-evidence-staging.ts';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = b => createHash('sha256').update(b).digest('hex'), pin = 'a'.repeat(64);
async function registryReview(dir, manifest, binding, files) {
  const value={version:'C_NATIVE_BINDING_PARTIAL_REVIEW_PIN_V1',decision:'ACCEPT_EXACT_QB_REVIEWED_PARTIAL_ARTIFACT_SCOPE',
    manifestSha256:hash(manifest),manifestBytes:manifest.length,binding,components:files.map(f=>({component:f.name,sha256:f.sha256,scope:'SYNTHETIC_C_REVIEW_PROTOCOL_ONLY'})),
    closedToUnreviewedComponents:true,realNativeCommandsOrImportAuthorizedByThisPinAlone:false};
  const bytes=Buffer.from(JSON.stringify(value)),reviewRecordFile=join(dir,'scope-review.json');await writeFile(reviewRecordFile,bytes);return {reviewRecordFile,trustedReviewRecordSha256:hash(bytes)};
}
async function reviewedProductFixture(t) {
  const dir=await mkdtemp(join(await realpath(tmpdir()),'reviewed-product-source-synthetic-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const binding={batchId:id(1),fixedSourceNamespace:'synthetic:product-source',selectionSha256:pin,cutoffAt:'2026-10-04T12:00:00+08:00'};
  const fields=Object.fromEntries(IMPORT_V2_TABLES.find(t=>t.entity==='PRODUCT').columns.map(c=>[c.name,'']));
  Object.assign(fields,{'来源编号':'SYNTHETIC PRODUCT','款号':'SYN-001','商品名称':'SYNTHETIC NAME','分类路径':'SYNTHETIC ROOT','尺码组':'SYNTHETIC GROUP','状态':'正常'});
  const raw={entity:'PRODUCT',sourceId:fields['来源编号'],file:'SYNTHETIC.xlsx',sheet:'PRODUCT',row:2,sourceSha256:pin,data:fields};
  const source=sourceEvidence(raw,JSON.stringify(raw),fields,binding),sourceBytes=Buffer.from(JSON.stringify([source]));
  const sourcePath=join(dir,'product-source-candidates.json');await writeFile(sourcePath,sourceBytes);
  const files=[{name:'product-source-candidates.json',bytes:sourceBytes.length,sha256:hash(sourceBytes)}];
  const manifest=Buffer.from(JSON.stringify({version:'NATIVE_BINDING_REVIEW_CANDIDATE_V1',...binding,products:1,files}));await writeFile(join(dir,'review-candidate-manifest.json'),manifest);
  const review=await registryReview(dir,manifest,binding,files);
  const selection={entity:'PRODUCT',source:'BASE_V2',path:'business/01商品.csv',baseManifestSha256:pin,selectionSha256:pin,approvalSha256:pin,csvSha256:pin};
  const input={batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selection,rows:[{source,product:{sourceKey:source.sourceKey,nativeId:id(3),expectedVersion:1},blankPricePolicy:'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET'}]};
  return {sourcePath,input,prepared:prepareProductEvidenceChunk(input),options:{directory:dir,trustedManifestSha256:hash(manifest),...review,binding}};
}
test('reviewed product evidence source consumes exact accepted component without opening the identity registry or granting native references',async t=>{
  const f=await reviewedProductFixture(t),reader=await openReviewedProductEvidenceSource(f.options);t.after(()=>reader.close());
  const rows=[];for await(const source of reader.rows())rows.push(source);assert.equal(rows.length,1);assert.deepEqual(rows[0],f.input.rows[0].source);
  await reader.authorize(f.prepared);assert.equal(reader.report.products,1);assert.equal(reader.report.nativeReferenceAuthority,false);
  const changed=structuredClone(f.input);changed.rows[0].source.rawFields['商品名称']=changed.rows[0].source.normalizedFields['商品名称']='SUBSTITUTED';
  changed.rows[0].source.fieldProvenance.fields['商品名称'].raw='SUBSTITUTED';await assert.rejects(reader.authorize(prepareProductEvidenceChunk(changed)),/ORIGINAL_CHANGED/);
  await assert.rejects(reader.authorize({...f.prepared,rows:[{...f.prepared.rows[0],references:{}}]}),/EXACT_PROJECTION/);
});
test('reviewed product evidence source rejects absent component approval, missing outside pin and descriptor getters before source access',async t=>{
  const f=await reviewedProductFixture(t);await assert.rejects(openReviewedProductEvidenceSource({...f.options,trustedReviewRecordSha256:undefined}),/OUTSIDE_PIN/);
  let calls=0;const getter={...f.options};Object.defineProperty(getter,'directory',{enumerable:true,get(){calls++;return f.options.directory;}});
  await assert.rejects(openReviewedProductEvidenceSource(getter),/OPTIONS/);assert.equal(calls,0);
  const {readFile}=await import('node:fs/promises');const review=JSON.parse(await readFile(f.options.reviewRecordFile,'utf8'));review.components=[];const b=Buffer.from(JSON.stringify(review));await writeFile(f.options.reviewRecordFile,b);
  await assert.rejects(openReviewedProductEvidenceSource({...f.options,trustedReviewRecordSha256:hash(b)}),/COMPONENT_REVIEW_REQUIRED/);
});
test('reviewed product evidence source captures scope, detects source file mutation and revokes a closed reader',async t=>{
  const f=await reviewedProductFixture(t),reader=await openReviewedProductEvidenceSource(f.options);t.after(()=>reader.close());
  f.options.binding.batchId=id(99);await reader.authorize(f.prepared);
  await writeFile(f.sourcePath,'[]');await assert.rejects(reader.authorize(f.prepared),/FILE_CHANGED/);
  await reader.close();await assert.rejects(reader.rows().next(),/CLOSED/);
});
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

test('exact21 approval proof layer checks all original locators/aliases and revokes changed human approval; no native grant',async t=>{
 const dir=await mkdtemp(join(await realpath(tmpdir()),'native-main-demotion-synthetic-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const binding={batchId:id(1),fixedSourceNamespace:'SYNTHETIC',selectionSha256:pin},groups=[],rows=[];
 for(let i=0;i<15;i++){
  const canonical=id(100+i),keptMain={sourceKey:'SYNTHETIC_KEPT_'+i,rawBarcode:'SYNTHETIC_KEPT_BARCODE_'+i,rawKind:'主码',proposedKind:'MAIN',rawSkuSourceKey:canonical,canonicalSkuSourceKey:canonical};const g={canonicalSkuSourceKey:canonical,keptMain,proposedOldSourceKeys:[],proposedOldBarcodes:[]};groups.push(g);
  for(let j=0;j<(i<6?2:1);j++){const key='SYNTHETIC_OLD_'+rows.length,barcode='SYNTHETIC_CODE_'+rows.length,old=id(200+rows.length);g.proposedOldSourceKeys.push(key);g.proposedOldBarcodes.push(barcode);rows.push({sourceKey:key,rawKind:'主码',proposedKind:'CONFIRMED_OLD',proposedKindDisplay:'已确认旧码',rawBarcode:barcode,proposedOldBarcode:barcode,rawState:'正常',proposedState:'正常',rawSkuSourceKey:old,canonicalSkuSourceKey:canonical,approvedCanonicalAlias:{oldSourceSkuId:old,canonicalSourceSkuId:canonical,mappingFileSha256:pin},keptMain,originalOccurrence:{file:'synthetic.xlsx',sheet:'SYNTHETIC',row:rows.length+2,sourceFileSha256:pin,snapshotRawLineSha256ExcludingLf:pin}});}
 }
 const mapping={schemaVersion:1,selectionBinding:{selection:{sha256:pin}},rows,groups},approval={version:'B06_SOURCE_DECISIONS_20261022_V1',selectionSha256:pin,A:{status:'APPROVED_EXACT_21_ROWS_15_GROUPS'},source:{kind:'direct_human_async_question_reply'}},mb=Buffer.from(JSON.stringify(mapping)),ab=Buffer.from(JSON.stringify(approval)),mf=join(dir,'mapping.json'),af=join(dir,'human.json');await writeFile(mf,mb);await writeFile(af,ab);
 const source={id:id(2),batchId:id(1),entityType:'BARCODE',sourceKey:rows[0].sourceKey,fileRef:'synthetic.xlsx',sheet:'SYNTHETIC',rowNo:'2',sourceFileSha256:pin,rowSha256:pin,rawFields:{'条码':rows[0].rawBarcode,'条码性质':'主码','状态':'正常','SKU来源编号':rows[0].rawSkuSourceKey}},sku={oldSourceSkuKey:rows[0].rawSkuSourceKey,canonicalSourceKey:rows[0].canonicalSkuSourceKey};
 const opts={mappingFile:mf,trustedMappingSha256:hash(mb),humanApprovalFile:af,trustedHumanApprovalSha256:hash(ab),binding},reader=await openApprovedBarcodeMainDemotions(opts);t.after(()=>reader.close());const proof=await reader.proofFor(source,sku);assert.equal(proof.entrySha256,requestHash(rows[0]));assert.equal(reader.report.rows,21);assert.equal(reader.report.importReady,false);
 await assert.rejects(reader.proofFor({...source,rowNo:'99'},sku),/EXACT_SOURCE/);await assert.rejects(reader.proofFor(source,{...sku,canonicalSourceKey:id(999)}),/EXACT_SOURCE/);
 await writeFile(af,'{}');await assert.rejects(reader.proofFor(source,sku),/FILE_CHANGED/);
 const bad={...approval,A:{status:'PENDING'}};await writeFile(af,JSON.stringify(bad));await assert.rejects(openApprovedBarcodeMainDemotions({...opts,trustedHumanApprovalSha256:hash(JSON.stringify(bad))}),/APPROVAL/);
});

async function seasonFixture(t) {
  const dir = await mkdtemp(join(await realpath(tmpdir()), 'synthetic-season-proof-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const binding = { batchId: id(1), fixedSourceNamespace: 'synthetic:no-real-native-grant', selectionSha256: pin };
  const names = ['春', '夏', '秋', '冬'], codes = ['SEASON_SPRING', 'SEASON_SUMMER', 'SEASON_AUTUMN', 'SEASON_WINTER'];
  // Deliberately opposite UUID/display ordering: derived stored proof must sort UUIDs.
  const atoms = names.map((n, i) => ({ entity: 'SEASON', sourceKey: n, nativeId: id(90 - i), values: { name: n, code: codes[i], display_order: i }, references: {}, originalEvidence: { synthetic: true } }));
  const dictionary = { version: 'NATIVE_CATALOGUE_OCCURRENCE_CANDIDATE_V1', ...binding, groups: [atoms] };
  const files = { mappingFile: join(dir, 'mapping.json'), reviewFile: join(dir, 'review.json'), dictionaryFile: join(dir, 'dictionary.json'), dictionaryReviewFile: join(dir, 'dictionary-review.json') };
  const db = Buffer.from(JSON.stringify(dictionary)), dictionarySha = hash(db);
  const drb = Buffer.from(JSON.stringify({ version: 'NATIVE_CATALOGUE_TECHNICAL_REVIEW_V1', ...binding, mappingSha256: dictionarySha }));
  await writeFile(files.dictionaryFile, db); await writeFile(files.dictionaryReviewFile, drb);
  const rawCounts = { '秋': 1099, '冬': 566, '': 48, '春': 404, '秋、冬': 291, '夏': 529, '春、夏': 19 };
  const sources = [], rows = []; let i = 100;
  for (const [season, count] of Object.entries(rawCounts)) for (let j = 0; j < count; j++, i++) {
    const source = { id: id(i), batchId: binding.batchId, entityType: 'PRODUCT', sourceKey: `synthetic-${i}`, sourceFileSha256: pin,
      sheet: 'synthetic', rowNo: String(i), rowSha256: pin, rawFields: { '季节': season }, normalizedFields: { '季节': season }, fieldProvenance: { schema_version: 1, fields: {} } };
    const selected = season === '' ? null : season.split('、'); sources.push(source);
    rows.push({ sourceRowId: source.id, sourceKey: source.sourceKey, sourceEvidenceHash: requestHash(source), nativeProductId: id(10000 + i), sourceFileSha256: pin,
      sheet: source.sheet, rowNo: source.rowNo, rawSeason: season, normalizedSeason: season,
      seasonIds: selected?.map(n => atoms.find(a => a.sourceKey === n).nativeId) ?? null, dictionaryNames: selected,
      dictionaryMappingSha256: dictionarySha, oldScalarWrite: 'UNCHANGED_BY_THIS_CANDIDATE' });
  }
  const mapping = { version: 'NATIVE_PRODUCT_SEASON_IDS_SOURCE_CONVERSION_CANDIDATE_V1', ...binding, dictionaryMappingSha256: dictionarySha,
    sourceProductsSha256: pin, fieldApprovalSha256: pin, rows, knownCounts: { UNKNOWN: 48, SINGLE: 2598, MULTIPLE: 310 }, rawCounts,
    containsNewUUIDs: false, databaseWrites: 0, importAuthorized: false };
  const review = { version: 'C_PRODUCT_REFERENCE_DELTA_AND_SEASON_REVIEW_V1', decision: 'ACCEPT_EXACT_QB49_SCOPED_CANDIDATES', binding,
    independentReview: { result: 'PASS', qualification: 'NEW2_REF_PLUS_OLD2644_PRESERVATION_AND_2956_SEASON_SOURCE_CANDIDATE_ONLY' }, realNativeCommandsOrImportAuthorizedByThisPinAlone: false, components: [] };
  async function save() {
    const mb = Buffer.from(JSON.stringify(mapping)); await writeFile(files.mappingFile, mb);
    review.components = [{ path: files.mappingFile, sha256: hash(mb), bytes: mb.length }];
    const rb = Buffer.from(JSON.stringify(review)); await writeFile(files.reviewFile, rb);
    return { ...files, binding, trustedMappingSha256: hash(mb), trustedReviewSha256: hash(rb), trustedDictionarySha256: dictionarySha, trustedDictionaryReviewSha256: hash(drb) };
  }
  const product = source => ({ sourceKey: source.sourceKey, nativeId: rows.find(r => r.sourceKey === source.sourceKey).nativeProductId, expectedVersion: 1 });
  return { sources, mapping, review, save, product, files, options: await save() };
}

test('season source proof derives sorted storage members from preserved2956 mapping and distinguishes unknown', async t => {
  const f = await seasonFixture(t), reader = await openReviewedProductSeasonSource(f.options); t.after(() => reader.close());
  const multiple = f.sources.find(s => s.rawFields['季节'] === '秋、冬'), original = structuredClone(f.mapping.rows.find(r => r.sourceKey === multiple.sourceKey));
  const proof = await reader.proofFor(multiple, f.product(multiple));
  assert.equal(proof.state, 'KNOWN'); assert.deepEqual(proof.season_ids, [...original.seasonIds].sort());
  assert.deepEqual(proof.references.map(r => r.nativeId), proof.season_ids); assert.equal(proof.references[0].nativeSnapshot.name, '冬');
  assert.deepEqual(f.mapping.rows.find(r => r.sourceKey === multiple.sourceKey), original);
  await reader.authorizeProof(multiple, f.product(multiple), proof);
  const unknown = f.sources.find(s => s.rawFields['季节'] === ''), unknownProof = await reader.proofFor(unknown, f.product(unknown));
  assert.equal(unknownProof.state, 'UNKNOWN'); assert.equal(unknownProof.season_ids, null); assert.deepEqual(unknownProof.references, []);
  assert.deepEqual(reader.report, { kind: 'PRODUCT_SEASON_SOURCE_PROOF_ONLY_V1', products: 2956, unknown: 48, single: 2598, multiple: 310, multipleMembers: 620, noSql: true, nativeProductAuthorized: false, importReady: false });
  const changed = structuredClone(proof); changed.season_ids.reverse(); await assert.rejects(reader.authorizeProof(multiple, f.product(multiple), changed), /PROOF_CHANGED/);
  await assert.rejects(reader.proofFor({ ...multiple, rowNo: '999999' }, f.product(multiple)), /EXACT_SOURCE/);
  await assert.rejects(reader.proofFor(multiple, { ...f.product(multiple), nativeId: id(9999) }), /EXACT_SOURCE/);
});

test('season source proof rejects self grant, unknown empty array, reordered mapping and duplicate native identities', async t => {
  const f = await seasonFixture(t);
  await assert.rejects(openReviewedProductSeasonSource({ ...f.options, trustedReviewSha256: undefined }), /OUTSIDE_PIN/);
  f.review.realNativeCommandsOrImportAuthorizedByThisPinAlone = true; await assert.rejects(openReviewedProductSeasonSource(await f.save()), /SEASON_REVIEW/); f.review.realNativeCommandsOrImportAuthorizedByThisPinAlone = false;
  const unknown = f.mapping.rows.find(r => r.rawSeason === ''); unknown.seasonIds = []; await assert.rejects(openReviewedProductSeasonSource(await f.save()), /MEMBERS/); unknown.seasonIds = null;
  const multiple = f.mapping.rows.find(r => r.rawSeason === '秋、冬'); multiple.seasonIds.reverse(); await assert.rejects(openReviewedProductSeasonSource(await f.save()), /MEMBERS/); multiple.seasonIds.reverse();
  f.mapping.rows[1].nativeProductId = f.mapping.rows[0].nativeProductId; await assert.rejects(openReviewedProductSeasonSource(await f.save()), /SEASON_ROW/);
});

test('season source proof rejects changed private files and does not execute getters', async t => {
  const f = await seasonFixture(t), reader = await openReviewedProductSeasonSource(f.options); t.after(() => reader.close());
  const mappingPin = f.options.trustedMappingSha256; f.options.trustedMappingSha256 = 'f'.repeat(64);
  assert.equal((await reader.proofFor(f.sources[0], f.product(f.sources[0]))).mapping_sha256, mappingPin);
  let getterCalls = 0; const options = { ...f.options }; Object.defineProperty(options, 'mappingFile', { enumerable: true, get() { getterCalls++; return f.options.mappingFile; } });
  await assert.rejects(openReviewedProductSeasonSource(options), /CONFIG/); assert.equal(getterCalls, 0);
  await writeFile(f.files.reviewFile, '{}'); await assert.rejects(reader.proofFor(f.sources[0], f.product(f.sources[0])), /FILE_CHANGED/);
  reader.close(); await assert.rejects(reader.verify(), /CLOSED/);
});

async function catalogue26Fixture(t){
 const dir=await mkdtemp(join(await realpath(tmpdir()),'synthetic-catalogue26-source-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const binding={batchId:id(1),fixedSourceNamespace:'synthetic:catalogue26',selectionSha256:pin,authorizedPayloadHash:'b'.repeat(64)};
 const root={entity:'CATEGORY',sourceKey:'synthetic-root',nativeId:id(20),values:{name:'SYNTHETIC ROOT',display_order:0},references:{},originalEvidence:{synthetic:true}};
 const leaf={entity:'CATEGORY',sourceKey:'synthetic-child',nativeId:id(21),values:{name:'SYNTHETIC CHILD',display_order:1},references:{parent_id:{entity:'CATEGORY',sourceKey:root.sourceKey,nativeId:root.nativeId,nativeSnapshot:{id:root.nativeId,parent_id:null,name:root.values.name,display_order:0,version:1}}},originalEvidence:{synthetic:true}};
 const color={entity:'COLOR',sourceKey:'synthetic-color',nativeId:id(22),values:{code:'007',name:'SYNTHETIC COLOR',enabled:false},references:{},originalEvidence:{synthetic:true}};
 const value={version:'NATIVE_CATALOGUE_OCCURRENCE_CANDIDATE_V1',...binding,baseManifestSha256:pin,groups:[[root],[leaf],[color]]};
 const mappingFile=join(dir,'mapping.json'),reviewApprovalFile=join(dir,'outside-review.json');
 async function save(){const bytes=Buffer.from(JSON.stringify(value));await writeFile(mappingFile,bytes);const review=Buffer.from(JSON.stringify({version:'NATIVE_CATALOGUE_TECHNICAL_REVIEW_V1',...binding,mappingSha256:hash(bytes)}));await writeFile(reviewApprovalFile,review);return {mappingFile,trustedMappingSha256:hash(bytes),reviewApprovalFile,trustedReviewApprovalSha256:hash(review),binding};}
 return {value,leaf,binding,mappingFile,options:await save(),save};
}
test('catalogue26 source consumes preserved original decisions with full parent6/native6 and successor complete closure projections',async t=>{
 const f=await catalogue26Fixture(t),next=await openReviewedCatalogueSource26(f.options),old=await openReviewedCatalogueSource(f.options);t.after(()=>next.close());t.after(()=>old.close());
 const chunks=[],legacy=[];for await(const c of next.chunks()){await next.authorize(c);chunks.push(c);}for await(const c of old.chunks())legacy.push(c);
 assert.equal(chunks.length,3);for(let i=0;i<chunks.length;i++){const n=chunks[i].rows[0],o=legacy[i].rows[0];const {deleted_at,...snapshot}=n.nativeSnapshot;assert.equal(deleted_at,null);assert.deepEqual(snapshot,o.nativeSnapshot);assert.deepEqual(n.source,o.source);assert.deepEqual(n.decisions,o.decisions);assert.equal(Object.hasOwn(n.source.rawFields,'deleted_at'),false);}
 assert.equal(chunks[1].rows[0].references.parent_id.nativeSnapshot.deleted_at,null);assert.equal(Object.keys(chunks[1].rows[0].references.parent_id.nativeSnapshot).length,6);
 await assert.rejects(old.authorize(chunks[0]));await assert.rejects(next.authorize(legacy[0]));
 const session=await next.openClosure(f.binding,{group:'CATALOGUE',signal:new AbortController().signal});t.after(()=>session.close());await session.verify();const source=[],typed=[];for await(const r of session.sourceRows())source.push(r);for await(const r of session.typedRows())typed.push(r);
 assert.equal(source.length,3);assert.equal(typed.length,6);const natives=typed.filter(r=>r.relation!=='import_native_catalogue_binding');assert.equal(natives.length,3);for(const n of natives){assert.equal(n.projection.deleted_at,null);assert.equal(Object.keys(n.projection).length,6);}
 const bindings=typed.filter(r=>r.relation==='import_native_catalogue_binding');assert.equal(bindings.length,3);assert.equal(bindings[0].projection.validator_version,'NATIVE_CATALOGUE_IMPORT_V1');assert.equal(bindings[0].projection.native_snapshot.deleted_at,null);
 assert.deepEqual(typed.map(r=>r.relation+'\0'+r.key),[...typed.map(r=>r.relation+'\0'+r.key)].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b))));
});
test('catalogue26 source refuses missing review, descriptor getters, replacing original reference metadata, input mutation and lifetime change',async t=>{
 const f=await catalogue26Fixture(t);await assert.rejects(openReviewedCatalogueSource26({...f.options,trustedReviewApprovalSha256:undefined}),/OUTSIDE_PIN_REQUIRED/);
 let calls=0;const getter={...f.options};Object.defineProperty(getter,'mappingFile',{enumerable:true,get(){calls++;return f.mappingFile;}});await assert.rejects(openReviewedCatalogueSource26(getter),/OPTIONS/);assert.equal(calls,0);
 const source=await openReviewedCatalogueSource26(f.options);t.after(()=>source.close());let chunk;for await(const c of source.chunks()){chunk=c;break;}const pending=source.authorize(chunk);chunk.rows[0].nativeSnapshot.name='SUBSTITUTED';await assert.rejects(pending,/INPUT_CHANGED/);
 await writeFile(f.mappingFile,'{}');await assert.rejects(source.verify(),/FILE_CHANGED/);await source.close();await assert.rejects(source.verify(),/CLOSED/);
 f.leaf.references.parent_id.nativeSnapshot.deleted_at='SYNTHETIC';await assert.rejects(openReviewedCatalogueSource26(await f.save()),/ORIGINAL_REFERENCE/);
});

// Finite protocol fixtures only: these temporary approvals grant no real SQL execution.
async function schemeInitializationFixture26(t, implementation = async () => {}) {
  const {nativeBarcodeSchemeInitializationRows26} = await import('../../packages/application/src/native-barcode-import.ts');
  const {openApprovedBarcodeSchemes26,openApprovedBarcodeSchemeInitialization26} = await import('./native-source-authorizers.mjs');
  const dir=await mkdtemp(join(await realpath(tmpdir()),'synthetic-six-scheme-init-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const binding={batchId:id(2),fixedSourceNamespace:'synthetic:six-scheme-initialization',selectionSha256:pin,cutoffAt:'2026-10-04T12:00:00+08:00'};
  async function save(name,value){const bytes=Buffer.from(JSON.stringify(value)),file=join(dir,name);await writeFile(file,bytes);return{file,sha256:hash(bytes)};}
  const rows=nativeBarcodeSchemeInitializationRows26(),writeContract={scope:'SYNTHETIC_PROTOCOL_ONLY'};
  const p=await save('proposal.json',{version:'BARCODE_SCHEME_INITIALIZATION_PROPOSAL_V1',rows,writeContract});
  const a=await save('approval.json',{version:'BARCODE_SCHEME_INITIALIZATION_APPROVAL_V1',decision:'APPROVED_2026_CURRENT_OTHER5_HISTORICAL_WITH_SEPARATE_GENERATION_AND_COMPATIBLE_CODE_REQUIREMENTS',source:{kind:'DIRECT_HUMAN_REPLY_IN_CONTROLLER_CHAT',questionCallId:'SYNTHETIC_PROTOCOL_ONLY'},proposalSha256:p.sha256,approvedInitializationRows:rows,approvedInitializationWriteContract:writeContract});
  const r=await save('reply.json',{callId:'call_fcbc01113b4d42bea015ddd58a1d5513',status:'APPROVED_WITH_CORRECTION',retained:'exact six-scheme controlled initialization',newSchemaBeyondV19Allowed:false});
  const source=await openApprovedBarcodeSchemes26({proposalFile:p.file,trustedProposalSha256:p.sha256,approvalFile:a.file,trustedApprovalSha256:a.sha256,binding});t.after(()=>source.close());
  const command={action:'IMPORT_INITIALIZE_BARCODE_SCHEMES',actorAccountId:id(1),requestKey:'SYNTHETIC-init-authorizer',batchId:binding.batchId,expectedSequence:1,expectedCursor:22,schemeInitialization:{version:'BARCODE_SCHEME_INITIALIZATION_V19',coreReceiptId:id(3),coreSourceDigest:pin,...binding,target:{database:'demo_8877_synthetic_scheme_init',role:'synthetic',serverAddress:null,serverPort:null,postmasterStartedAt:'synthetic'},approvalPins:{proposalSha256:p.sha256,approvalSha256:a.sha256,writeContractReplySha256:r.sha256},schemes:rows}};
  delete command.schemeInitialization.batchId;
  const options={source,writeContractReplyFile:r.file,trustedWriteContractReplySha256:r.sha256,command,initializeSchemes26:implementation};
  return{source,command,options,replyFile:r.file,open:openApprovedBarcodeSchemeInitialization26};
}
test('v19 six source initializer binds exact3 pins and forwards original borrowed callback once with no execution grant',async t=>{
  const calls=[],f=await schemeInitializationFixture26(t,async(...args)=>{calls.push(args);}),reader=await f.open(f.options);t.after(()=>reader.close());
  const command=structuredClone(f.command),client={synthetic:true},runtime={synthetic:true},input={command,now:'2026-10-26T00:00:00.000Z',operationId:id(4)};
  f.options.command.requestKey='EXTERNAL-MUTATION';await reader.assertAllowed(command.actorAccountId,command);
  await reader.initializeSchemes26(client,input,runtime);assert.equal(calls.length,1);assert.equal(calls[0][0],client);assert.equal(calls[0][1],input);assert.equal(calls[0][2],runtime);
  assert.equal(f.source.report.executionAuthorized,false);assert.deepEqual(Object.keys(command.schemeInitialization.approvalPins).sort(),['approvalSha256','proposalSha256','writeContractReplySha256']);
  await reader.close();await assert.rejects(reader.assertAllowed(command.actorAccountId,command),/CLOSED/);
});
test('v19 six source initializer rejects changed command, actor, approved field and any substituted pin before callback',async t=>{
  let calls=0;const f=await schemeInitializationFixture26(t,async()=>{calls++;}),reader=await f.open(f.options);t.after(()=>reader.close());
  await assert.rejects(reader.assertAllowed(id(99),f.command),/COMMAND_CHANGED/);
  const changed=structuredClone(f.command);changed.expectedCursor++;await assert.rejects(reader.assertAllowed(changed.actorAccountId,changed),/COMMAND_CHANGED/);
  for(const key of Object.keys(f.command.schemeInitialization.approvalPins)){const command=structuredClone(f.command);command.schemeInitialization.approvalPins[key]='b'.repeat(64);await assert.rejects(f.open({...f.options,command}),/SOURCE_PINS/);}
  const command=structuredClone(f.command);command.schemeInitialization.schemes[0].native.name='SUBSTITUTED';await assert.rejects(f.open({...f.options,command}),/SOURCE_BINDING/);
  await writeFile(f.replyFile,'{}');await assert.rejects(reader.assertAllowed(f.command.actorAccountId,f.command),/FILE_CHANGED/);assert.equal(calls,0);
});
test('v19 six source initializer refuses truthy callback grants, callback mutation and post-await approval change',async t=>{
  for(const kind of ['truthy','mutation','approval']){
    let f;f=await schemeInitializationFixture26(t,async(_client,input)=>{if(kind==='truthy')return true;if(kind==='mutation')input.command.requestKey='MUTATED';if(kind==='approval')await writeFile(f.replyFile,'{}');});
    const reader=await f.open(f.options);t.after(()=>reader.close());
    await assert.rejects(reader.initializeSchemes26({synthetic:true},{command:structuredClone(f.command),now:'2026-10-26T00:00:00.000Z',operationId:id(4)},{synthetic:true}),kind==='truthy'?/CALLBACK_RESULT/:kind==='mutation'?/CALLBACK_MUTATED/:/FILE_CHANGED/);
  }
});
test('v19 six source initializer integrates exact2 owner projection with D1 same lease first-write and receipt replay',async t=>{
  const {PostgresCutoffImportStore}=await import('../../adapters/postgres/src/inventory-cutoff-import-store.ts');
  const {initializeNativeBarcodeSchemesOnClient26,NATIVE_BARCODE_SCHEME_INITIALIZATION26_SQL:sql26}=await import('../../adapters/postgres/src/native-barcode-import.ts');
  let initialized=0;
  const f=await schemeInitializationFixture26(t,async(...args)=>{initialized++;await initializeNativeBarcodeSchemesOnClient26(...args);});
  const source=await f.open(f.options);t.after(()=>source.close());
  const command=structuredClone(f.command),now='2026-10-26T00:00:00.000Z',calls=[],schemes=[],leases=[];
  let receipt,audit,checkpoint={sequence:1,cursor:22,counts:{WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0},expected:{}};
  const originalCheckpoint=structuredClone(checkpoint);
  const client={async query(sql,values=[]){calls.push(sql);let rows=[];
    if(sql.includes('barcode-init:actor'))rows=[{id:command.actorAccountId}];
    else if(sql.includes('barcode-init:target'))rows=[command.schemeInitialization.target];
    else if(sql.includes('barcode-init:batch'))rows=[{id:command.batchId,mapping_version:'V2_HISTORY_NULLABLE_1',source_name:command.schemeInitialization.fixedSourceNamespace,source_hash:command.schemeInitialization.selectionSha256,cutoff_at:command.schemeInitialization.cutoffAt,status:'STAGED',completed_at:null,history_validation_passed:false,checkpoint}];
    else if(sql.includes('barcode-init:receipt'))rows=receipt?[receipt]:[];
    else if(sql.includes('barcode-init:effects'))rows=[{barcode_source:false,barcode_rows:false,scheme_rows:schemes.length>0}];
    else if(sql===sql26.read||sql.includes('barcode-init:readback'))rows=[...schemes].sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id)));
    else if(sql===sql26.insert){const[id,name,barcode_type,rule_description,code_length,rule_version,status]=values;schemes.push({id,name,barcode_type,rule_description,code_length,rule_version,status});rows=[{id}];}
    else if(sql.includes('barcode-init:checkpoint')){assert.deepEqual(checkpoint,JSON.parse(values[2]));checkpoint=JSON.parse(values[1]);}
    else if(sql.startsWith('INSERT INTO naijue_erp.audit_change'))audit={before_values:JSON.parse(values[7]),after_values:JSON.parse(values[8])};
    else if(sql.startsWith('INSERT INTO naijue_erp.operation_receipt'))receipt={id:values[0],request_hash:values[3],action:values[4],target_type:'IMPORT',target_id:values[5],status:'COMMITTED',result_data:JSON.parse(values[6])};
    else if(sql.includes('barcode-init:replay-proof'))rows=audit?[audit]:[];
    else if(sql.includes('assert_barcode_scheme_initialization_v19'))assert.equal(requestHash([...schemes].sort((a,b)=>a.id.localeCompare(b.id))),requestHash(command.schemeInitialization.schemes.map(s=>s.native).sort((a,b)=>a.id.localeCompare(b.id))));
    return{rows,rowCount:1};},release(){leases.push('release');}};
  const pool={async connect(){leases.push('connect');return client;}},runtime={profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(actual,purpose){assert.equal(actual,client);assert.equal(purpose,'IMPORT_STAGE');}};
  // Source owner retains close for finally; D1 accepts exactly the original two methods.
  assert.throws(()=>new PostgresCutoffImportStore(pool,{runtime26:runtime,barcodeSchemeInitialization26:source}));
  const provider={assertAllowed:source.assertAllowed,initializeSchemes26:source.initializeSchemes26};
  const store=new PostgresCutoffImportStore(pool,{runtime26:runtime,barcodeSchemeInitialization26:provider});
  const result=await store.execute(command,now);assert.equal(initialized,1);assert.equal(schemes.length,6);assert.equal(result.sequence,2);assert.equal(result.cursor,22);assert.deepEqual(result.ledgerEntryIds,[]);
  assert.deepEqual(checkpoint,{...originalCheckpoint,sequence:2});assert.equal(audit.after_values.commandHash,requestHash(command));
  const inserts=calls.filter(s=>s===sql26.insert).length;assert.deepEqual(await store.execute(command,now),result);assert.equal(initialized,1);assert.equal(calls.filter(s=>s===sql26.insert).length,inserts);assert.deepEqual(leases,['connect','release','connect','release']);
});
