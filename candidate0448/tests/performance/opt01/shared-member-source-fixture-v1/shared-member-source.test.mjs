/** SYNTHETIC finite source/protocol tests; NOT PG, published import, ordinary EDIT COMMIT or browser evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openReviewedCatalogueSource26} from '../../../../scripts/import-v3/native-source-authorizers.mjs';
import {validatePreparedNativeCatalogueImportChunk26,prepareNativeCatalogueImportChunk26} from '../../../../packages/application/src/native-catalogue-import.ts';
import {validateDictionaryPage,validateDictionarySizeGroup} from '../../../../packages/application/src/dictionary-read-validation.ts';
import {parseProductMaintenanceCommandV2} from '../../../../packages/application/src/product-maintenance-validation.ts';
import {assertProductEvidencePendingCapacity} from '../../../../adapters/postgres/src/catalogue-completeness.ts';
import {createCurrentFormHttpReader} from '../../../../apps/web/src/current-form/http-reader.ts';
import {createTransferHttpReader} from '../../../../apps/web/src/transfers/http-reader.ts';
import {createHttpJsonQuery} from '../../../../apps/web/src/transport/http-query.ts';
import {firstCreateProtocol} from './first-create-protocol.mjs';
import {createSharedMemberFixture,inputOf,tupleEnvelope,bytes,hash,SOURCE_LIMIT,CHUNK_LIMIT,RESPONSE_LIMIT} from './fixture.mjs';
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const signal=()=>new AbortController().signal;
const receipt=(t,kind,value)=>t.diagnostic(JSON.stringify({kind,...value}));
test('shared-member fixture passes real source opener/prepare/authorize and original first-create adapter SQL protocol',{timeout:120000},async t=>{
 const f=createSharedMemberFixture(),directory=await mkdtemp(join(tmpdir(),'opt01-shared-source-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const mappingBytes=Buffer.from(JSON.stringify(f.mapping));assert.ok(mappingBytes.length<=SOURCE_LIMIT,'Unchanged production mapping file16MiB');
 const mappingFile=join(directory,'synthetic-mapping.json'),reviewApprovalFile=join(directory,'synthetic-review.json');
 const reviewBytes=Buffer.from(JSON.stringify({version:'NATIVE_CATALOGUE_TECHNICAL_REVIEW_V1',...f.binding,mappingSha256:hash(mappingBytes),syntheticProtocolOnly:true,realExecutionAuthorized:false}));
 await writeFile(mappingFile,mappingBytes);await writeFile(reviewApprovalFile,reviewBytes);
 const reader=await openReviewedCatalogueSource26({mappingFile,trustedMappingSha256:hash(mappingBytes),reviewApprovalFile,trustedReviewApprovalSha256:hash(reviewBytes),binding:f.binding});t.after(()=>reader.close());
 const p=firstCreateProtocol(f.binding),counts={},chunkReceipts=[];let rows=0,firstGroupRow;
 for await(const chunk of reader.chunks()){
  const input=inputOf(chunk),inputBytes=bytes(input);assert.ok(chunk.rows.length<=200);assert.ok(inputBytes<=CHUNK_LIMIT);validatePreparedNativeCatalogueImportChunk26(chunk);await reader.authorize(chunk);
  const result=await p.store.stage(chunk);assert.equal(result.inserted,chunk.rows.length);assert.equal(result.replayed,0);assert.equal(result.nativeCurrentMatchesCreation,true);
  for(const row of chunk.rows){counts[row.entity]=(counts[row.entity]??0)+1;if(row.entity==='SIZE_GROUP'&&!firstGroupRow)firstGroupRow={chunk,row};}rows+=chunk.rows.length;chunkReceipts.push({rows:chunk.rows.length,inputBytes});
 }
 assert.equal(rows,3204);assert.deepEqual(counts,{CATEGORY:1,COLOR:1,FIT:1,SEASON:1,SIZE:1000,SIZE_GROUP:101,SIZE_GROUP_MEMBER:2099});
 assert.equal(p.state().native.size,rows);assert.equal(p.state().sources.size,rows);assert.equal(p.state().bindings.size,rows);assert.equal(p.stats.groupNonemptyChecks,101);assert.equal(p.stats.commits,18);assert.equal(p.stats.connects,p.stats.releases);assert.equal(p.stats.rollbacks,0);
 for(const g of f.ordered){const members=[...p.state().native].filter(([k,n])=>k.startsWith('SIZE_GROUP_MEMBER/')&&n.size_group_id===g.nativeId);assert.ok(members.length>0);}
 for(const g of f.targetGroups){assert.equal(g.sizes.length,1000);for(const size of g.sizes){const native=p.state().native.get('SIZE/'+size.id);assert.equal(native.name,size.name);}}
 // Original adapter, not a new validation rule: a newly created group alone is rejected and rolled back.
 const emptyInput={...inputOf(firstGroupRow.chunk),rows:inputOf(firstGroupRow.chunk).rows.filter(r=>r.nativeId===firstGroupRow.row.nativeId)};
 const empty=prepareNativeCatalogueImportChunk26(emptyInput),negative=firstCreateProtocol(f.binding);
 await assert.rejects(negative.store.stage(empty),{code:'NATIVE_CATALOGUE_EMPTY_GROUP'});assert.equal(negative.stats.rollbacks,1);assert.equal(negative.state().native.size,0);assert.equal(negative.stats.connects,negative.stats.releases);
 receipt(t,'REAL_SOURCE_PARSER_AND_SCRIPTED_FIRST_CREATE_ONLY',{node:process.version,mappingBytes:mappingBytes.length,mappingLimit:SOURCE_LIMIT,mappingSha256:hash(mappingBytes),rows,counts,chunks:chunkReceipts,maxInputChunkBytes:Math.max(...chunkReceipts.map(c=>c.inputBytes)),adapterProtocol:p.stats,realPostgres:false,sourceApprovalIsSynthetic:true,publication:false,ordinaryEditCommit:false});
});
test('shared complete groups fit original100/page and20/page but same-values two-group tuple fails actual unchanged8MiB HTTP guard',{timeout:30000},async t=>{
 const f=createSharedMemberFixture(),pageReceipts=[],tuple=tupleEnvelope(f.targetGroups),seen=new Map();
 assert.equal(f.dictionary.length,101);assert.equal(f.dictionary[0].id,f.targetGroups[0].id);assert.equal(f.dictionary[100].id,f.targetGroups[1].id);
 for(const pageSize of [20,100])for(let page=1;(page-1)*pageSize<f.dictionary.length;page++){
  const value=f.page(page,pageSize),query={search:'',page,pageSize},valid=validateDictionaryPage(value,query,validateDictionarySizeGroup);assert.equal(valid.items.length,Math.min(pageSize,101-(page-1)*pageSize));assert.ok(bytes(value)<=RESPONSE_LIMIT);pageReceipts.push({pageSize,page,items:value.items.length,bytes:bytes(value)});
 }
 const http={origin:'https://opt01-shared.invalid',basePath:'',fetch:async(url,init)=>{assert.equal(new URL(url).pathname,'/dictionary-read/size-groups/query');const q=JSON.parse(String(init.body));assert.equal(q.search,'');assert.equal(q.pageSize,100);return response(f.page(q.page));}};
 const reader=createCurrentFormHttpReader(http),wanted=new Set(f.targetGroups.map(g=>g.id));let physicalReads=0;
 for(let page=1;;page++){
  const value=await reader.readSizeGroups({search:'',page,pageSize:100},signal());physicalReads++;for(const g of value.items)if(wanted.has(g.id))seen.set(g.id,g);if([...wanted].every(id=>seen.has(id)))break;if(page*100>=value.total)throw Error('GROUP_UNAVAILABLE');
 }
 assert.equal(physicalReads,2);assert.deepEqual([...seen.values()],f.targetGroups);assert.equal([...seen.values()].reduce((n,g)=>n+g.sizes.length,0),2000);
 const nameBytes=f.targetGroups.reduce((n,g)=>n+g.sizes.reduce((m,s)=>m+Buffer.byteLength(s.name),0),0);assert.ok(nameBytes>RESPONSE_LIMIT);assert.ok(bytes(tuple)>RESPONSE_LIMIT);
 let decodeCalls=0;const aggregate=createHttpJsonQuery({origin:'https://opt01-shared.invalid',basePath:'',fetch:async()=>response(tuple)});
 await assert.rejects(aggregate.post('/dictionary-read/proposed-only/query',{sizeGroupIds:[...wanted]},signal(),value=>{decodeCalls++;return value;}),{kind:'too-large',code:'RESPONSE_TOO_LARGE',status:null});assert.equal(decodeCalls,0);
 const detailReader=createTransferHttpReader({origin:'https://opt01-shared.invalid',basePath:'',fetch:async()=>response(f.original)}),detail=await detailReader.readDetail({parameters:{transferId:f.original.document.header.id},signal:signal()});
 assert.equal(detail.catalog.sizeGroups.reduce((n,g)=>n+g.members.length,0),2);assert.ok(bytes(detail)<RESPONSE_LIMIT);
 const t1={...detail,catalog:{skus:f.currentSkus.map(({id,skuCode,sizeName,barcodeAvailability,...s})=>({skuId:id,...s})),sizeGroups:f.targetGroups.map((g,n)=>({sizeGroupId:g.id,code:f.ordered[n?100:0].values.code,name:g.name,members:g.sizes.map(s=>({sizeId:s.id,code:null,name:s.name,displayOrder:s.displayOrder}))}))}};
 assert.ok(bytes(t1)>RESPONSE_LIMIT,'Do not call stable T1 full detail an accepted body');
 assert.throws(()=>validateDictionarySizeGroup({...f.targetGroups[0],sizes:[...f.targetGroups[0].sizes,f.targetGroups[0].sizes[0]]}),{code:'INVALID_DICTIONARY_RESPONSE'});
 receipt(t,'ACTUAL_DICTIONARY_HTTP_BOUNDARY_ONLY',{pages:pageReceipts,oldDictionaryReads:physicalReads,decodedTargetMembers:2000,uniqueSharedTargetSizes:new Set(f.targetGroups.flatMap(g=>g.sizes.map(s=>s.id))).size,nameBytes,tupleBytes:bytes(tuple),limit:RESPONSE_LIMIT,decodeCalls,t0DetailBytes:bytes(detail),t1FullDetailBytes:bytes(t1),ordinaryEditCommit:false,universalTwoRequestClaim:false});
});
test('proposed A→B command passes original optional-field parser and sparse audit-capacity function only; no service/ACL/commit claim',()=>{
 const f=createSharedMemberFixture();for(let n=0;n<2;n++){
  const command=f.commands[n],parsed=parseProductMaintenanceCommandV2(command);assert.equal(Object.hasOwn(parsed,'skuSelection'),false);assert.equal(parsed.values.sizeGroupId,f.targetGroups[n].id);assert.ok(bytes(command)<=1048576);assert.deepEqual(parsed.values.prices,command.values.prices);
  assert.ok(f.targetGroups[n].sizes.some(s=>s.id===f.oldGroups[n].sizes[0].id),'Original retained SKU size remains in B');
  const before={size_group_id:f.oldGroups[n].id,version:1},after={size_group_id:f.targetGroups[n].id,version:2},value=assertProductEvidencePendingCapacity({count:0,bytes:0},before,after);assert.equal(value.count,1);assert.equal(value.bytes,bytes([before,after]));
 }
 const before={},after={};assert.throws(()=>assertProductEvidencePendingCapacity({count:1024,bytes:0},before,after),{code:'PRODUCT_EVIDENCE_CAPACITY_EXCEEDED'});
});
