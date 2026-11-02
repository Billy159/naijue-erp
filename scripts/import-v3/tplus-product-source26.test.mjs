import test from 'node:test';
import assert from 'node:assert/strict';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {preflightV2} from '../import-v2/run.mjs';
import {readTPlusFieldMappings26,sourceEvidence} from './prepare-native-bindings.mjs';
import {parseV2Csv} from '../../packages/application/src/import-v2.ts';
import {preflightImport} from '../../packages/application/src/import-preflight.ts';
import {IMPORT_PREFLIGHT_SHEETS} from '../../packages/application/src/import-preflight-contract.ts';
import {IMPORT_V2_TABLES} from '../../packages/application/src/import-v2-contract.ts';
import {prepareProductEvidenceChunk} from '../../packages/application/src/product-evidence-staging.ts';
import {readTPlusProductMaster,readTPlusProductBarcodes,projectTPlusProductPrices,assembleTPlusProductSource26,buildTPlusProductCanonicalEvidence26} from './tplus-product-source26.mjs';
const text=raw=>({kind:'text',raw}),num=raw=>({kind:'number',raw});
const mh=['存货编码','存货名称','尺码所属取值组编码','采购价','零售价','五级批发价(工厂店供货价）','六级批发价（贴牌价）','七级批发价（批发价）','八级批发价（代理商供货价）','九级批发价（工厂店零售价）','十级批发价（葛玉珠）','最低售价'], bh=['存货编码','存货名称','规格型号','条形码','计量单位','是否默认条码'];
const ph=['条形码','存货编码','采购价','零售价','五级批发价','六级批发价','七级批发价','八级批发价','九级批发价','十级批发价','最低售价'];
const row=(sheet,excelRow,cells)=>({event:'row',sheet,excelRow,cells});
const head=(sheet,excelRow,labels)=>row(sheet,excelRow,Object.fromEntries(labels.map((x,i)=>[i,text(x)])));
const end=(sheet,rows)=>({event:'eof',sheet,rows});
test('source candidates preserve product code, exact prices, multiple barcodes and incomplete authority',async()=>{
 const master=await readTPlusProductMaster([head('存货',2,mh),row('存货',3,{0:text('001'),1:text('synthetic'),2:text('group'),3:num('12.30'),4:num('0')}),end('存货',2)],mh);
 const b=row('存货条形码',2,{0:text('001'),3:text('A'),5:num('1')});
 const barcodes=await readTPlusProductBarcodes([head('存货条形码',1,bh),b,row('存货条形码',3,{...b.cells,3:text('B'),5:num('0')}),end('存货条形码',3)]);
 const price=row('存货价格本',2,{1:text('001'),2:num('12.30'),3:num('0')});
 const prices=projectTPlusProductPrices([head('存货价格本',1,ph),price,end('存货价格本',2)],ph);
 const out=await Array.fromAsync(assembleTPlusProductSource26({master,barcodes,prices}));
 assert.equal(out[0].productSource.sourceProductCode,'001');assert.equal(out[0].barcodeRelations.length,2);
 assert.equal(out[0].prices['采购价'].minorAmount,'1230');assert.equal(out[0].prices['零售价'].minorAmount,'0');
 assert.equal(out[0].prices['五级批发价'].state,'BLANK_SOURCE');assert.equal(out[0].priceChecks['采购价'],'EXACT_MATCH');assert.equal(out[0].importReady,false);
 const changed=projectTPlusProductPrices([head('存货价格本',1,ph),{...price,cells:{...price.cells,2:num('12.31')}},end('存货价格本',2)],ph);
 const mismatch=await Array.fromAsync(assembleTPlusProductSource26({master,barcodes,prices:changed}));
 assert.equal(mismatch[0].priceChecks['采购价'],'MISMATCH');assert.equal(mismatch[0].status,'PENDING_SOURCE_FACTS');
 assert.equal(out[1].masterWithoutPrice,0);assert.equal(out[1].priceWithoutMaster,0);assert.equal(out[1].barcodeProductsWithoutPrice,0);
});
test('missing EOF, duplicate code, untrusted header, formula and precision are not silently accepted',async()=>{
 const masterHeader=head('存货',2,mh), m=row('存货',3,{0:text('001'),1:text('n'),2:text('g')});
 await assert.rejects(readTPlusProductMaster([masterHeader,m],mh),/EOF/);
 const b=row('存货条形码',2,{0:text('001'),3:text('A'),5:num('1')});
 await assert.rejects(readTPlusProductBarcodes([head('存货条形码',1,bh),b,{...b,excelRow:3},end('存货条形码',3)]),/DUPLICATE/);
 await assert.rejects(readTPlusProductMaster([masterHeader,m,{...m,excelRow:4},end('存货',3)],mh),/DUPLICATE/);
 await assert.rejects(readTPlusProductMaster([{...masterHeader,cells:{...masterHeader.cells,0:text('other')}},m,end('存货',2)],mh),/HEADER/);
 const h=head('存货价格本',1,ph), bad=row('存货价格本',2,{1:text('001'),2:{kind:'formula',raw:null,formula:'1+1'},3:num('1.234')});
 const result=await Array.fromAsync(projectTPlusProductPrices([h,bad,end('存货价格本',2)],ph));
 assert.equal(result[0].status,'PENDING_SOURCE_FACTS');assert.equal(result[0].prices['采购价'].state,'PENDING');assert.equal(result[0].prices['零售价'].state,'PENDING');
 const error={...bad,cells:{...bad.cells,2:{kind:'error',raw:null}}};
 assert.equal((await Array.fromAsync(projectTPlusProductPrices([h,error,end('存货价格本',2)],ph)))[0].prices['采购价'].state,'PENDING');
});
test('unmatched source codes and missing barcode remain explicit',async()=>{
 const master=await readTPlusProductMaster([head('存货',2,mh),row('存货',3,{0:text('001')}),end('存货',2)],mh);
 const prices=projectTPlusProductPrices([head('存货价格本',1,ph),row('存货价格本',2,{1:text('002')}),end('存货价格本',2)],ph);
 const out=await Array.fromAsync(assembleTPlusProductSource26({master,barcodes:new Map(),prices}));
 assert.equal(out[0].productSource,null);assert.equal(out[0].status,'PENDING_SOURCE_FACTS');
 assert.equal(out[1].masterWithoutPrice,1);assert.equal(out[1].priceWithoutMaster,1);
});

test('explicit source-column sidecar reaches the existing product evidence consumer without claiming original aliases',async t=>{
 const headers=[...mh,'停用','空辅助'];
 const sourceRow=row('存货',3,{0:text('001'),1:text('synthetic'),2:text('group'),3:num('12.30'),4:num('0'),12:num('0')});
 const master=await readTPlusProductMaster([head('存货',2,headers),sourceRow,end('存货',2)],headers);
 const productSource=master.get('001'),table=IMPORT_V2_TABLES.find(t=>t.entity==='PRODUCT'),canonicalFields={},fields={};
 const idxFor=name=>name==='来源编号'||name==='款号'?0:name==='商品名称'?1:name==='分类路径'||name==='尺码组'?2:name==='状态'?12:
  headers.findIndex(x=>name===x||name.startsWith(x+'（')||name.startsWith(x+'('));
 for(const c of table.columns){let idx=idxFor(c.name);if(idx<0)idx=13;const sourceCell=sourceRow.cells[idx],value=sourceCell?.raw??'';
  canonicalFields[c.name]=c.name==='状态'?'正常':value;
  fields[c.name]={rule:c.name==='状态'?'DISABLED_0_1_TO_STATUS':'COPY',source:{file:'synthetic.xlsx',sheet:'存货',row:3,sha256:'a'.repeat(64),column:idx,header:headers[idx],value}};
 }
 const proof={version:'TPLUS_FIELD_MAPPING_EVIDENCE_V1',fields},mappingEvidence={proof,sha256:requestHash(proof)};
 const binding={batchId:'00000000-0000-4000-8000-000000000001',fixedSourceNamespace:'synthetic:isolated'};
 const sourceCandidate={productSource,status:'SOURCE_FACTS_ONLY',priceChecks:Object.fromEntries(['采购价','零售价','五级批发价','六级批发价','七级批发价','八级批发价','九级批发价','十级批发价','最低售价'].map(x=>[x,'EXACT_MATCH']))};
 const candidate=buildTPlusProductCanonicalEvidence26({candidate:sourceCandidate,canonicalFields,mappingEvidence,sourceFile:'synthetic.xlsx',sourceSha256:'a'.repeat(64),selectedColumns:headers.map((_,i)=>i),binding});
 assert.equal(candidate.source.fieldProvenance.fields['来源编号'].origin,'MIGRATION_DERIVED');assert.equal(candidate.importReady,false);
 const quote=v=>'"'+v.replaceAll('"','""')+'"';const csv=table.columns.map(c=>quote(c.name)).join(',')+'\n'+table.columns.map(c=>quote(canonicalFields[c.name])).join(',')+'\n';
 const parsed=[];for await(const fields of parseV2Csv((async function*(){yield csv})()))parsed.push(fields);
 const contract=IMPORT_PREFLIGHT_SHEETS.find(x=>x.entityType==='PRODUCT'),cell=v=>({kind:'text',raw:v});
 const report=preflightImport({batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,mode:'STAGED',files:[{fileName:'product.csv',sha256:createHash('sha256').update(csv).digest('hex'),dateSystem:'1900',sheets:[{name:'01商品',headerRow:1,headers:contract.fields.map(f=>cell(f.header)),rows:[{excelRow:2,cells:parsed[1].map(cell)}]}]}]});
 assert.equal(report.records.filter(r=>r.entityType==='PRODUCT').length,1);
 const prepared=prepareProductEvidenceChunk({batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selection:{baseManifestSha256:'a'.repeat(64),selectionSha256:'a'.repeat(64),approvalSha256:'a'.repeat(64),entity:'PRODUCT',source:'BASE_V2',path:'business/01商品.csv',csvSha256:'a'.repeat(64)},rows:[{source:candidate.source,product:{sourceKey:'001',nativeId:'00000000-0000-4000-8000-000000000002',expectedVersion:1},blankPricePolicy:'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET'}]});
 assert.equal(prepared.rows.length,1);
 // A synthetic whole-format carrier exercises the original reader. Empty tables
 // here are fixture scaffolding only, never a real source or completeness claim.
 const root=await mkdtemp(join(tmpdir(),'synthetic-tplus-v2-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const files=new Map(IMPORT_V2_TABLES.map(x=>[x.file,x.columns.map(c=>c.name).join(',')+'\n']));
 files.set(table.file,csv);files.set('schema/normalized-business-columns.json',JSON.stringify(IMPORT_V2_TABLES));
 files.set('mappings/old-to-canonical-sku-15121.csv','oldSourceSkuId,canonicalSourceSkuId,productSourceId,colorCodeIdentity,fitCode,newSizeDictionaryId\n');
 files.set('mappings/stock-contributor-lineage-38314.csv','oldStockSourceId,canonicalStockRowSourceId,warehouseSourceId,oldSkuSourceId,canonicalSkuSourceId,productSourceId,signedQuantity,sourceUnit\n');
 files.set('audit/independent-verification/warehouse-unit-reconciliation.csv','warehouse,unit,before,after,difference\n');
 files.set('audit/warehouse-product-stock-conservation.csv','warehouseSourceId,productSourceId,inputSignedQuantity,outputSignedQuantity,exactDifference\n');
 files.set('audit/independent-verification/all-53-warehouses.csv','warehouse,name,before,after,difference\n');
 files.set('dictionaries/historical-customers.json','[]');
 files.set('snapshots/all-business-source-rows.jsonl',candidate.line+'\n');
 files.set('evidence/tplus-field-mapping.jsonl',JSON.stringify({entity:'PRODUCT',sourceId:'001',proof,sha256:mappingEvidence.sha256})+'\n');
 const digest=b=>createHash('sha256').update(b).digest('hex'),payloadFiles=[];
 for(const [path,value] of files){const bytes=Buffer.from(value);await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),bytes,{mode:0o600});payloadFiles.push({file:path,bytes:bytes.length,sha256:digest(bytes)});}
 const manifest=Buffer.from(JSON.stringify({importReady:false,sourceInputSha256:{'synthetic.xlsx':'a'.repeat(64)},payloadFiles,payloadBytes:payloadFiles.reduce((n,x)=>n+x.bytes,0)}));
 await writeFile(join(root,'manifest.json'),manifest);await writeFile(join(root,'manifest.sha256'),digest(manifest)+'  manifest.json\n');
 const v2=await preflightV2(root);assert.equal(v2.counts.PRODUCT,1);assert.equal(v2.importReady,false);assert.equal(v2.noSql,true);
 const evidenceFile=await readFile(join(root,'evidence/tplus-field-mapping.jsonl'),'utf8');
 const loaded=await readTPlusFieldMappings26((async function*(){yield evidenceFile})(),{'synthetic.xlsx':'a'.repeat(64)});
 const fromCarrier=sourceEvidence(candidate.raw,candidate.line,canonicalFields,binding,loaded.get('001'));
 assert.deepEqual(fromCarrier,candidate.source);

 assert.throws(()=>buildTPlusProductCanonicalEvidence26({candidate:{...sourceCandidate,status:'PENDING_SOURCE_FACTS'},canonicalFields,mappingEvidence,sourceFile:'synthetic.xlsx',sourceSha256:'a'.repeat(64),selectedColumns:headers.map((_,i)=>i),binding}),/CANONICAL_SOURCE/);
 const altered=structuredClone(proof);altered.fields['来源编号'].source.value='002';
 assert.throws(()=>buildTPlusProductCanonicalEvidence26({candidate:sourceCandidate,canonicalFields,mappingEvidence:{proof:altered,sha256:requestHash(altered)},sourceFile:'synthetic.xlsx',sourceSha256:'a'.repeat(64),selectedColumns:headers.map((_,i)=>i),binding}),/SOURCE_CELL/);
});

test('source drafts preserve directly observed facts and leave unmatched references pending',async()=>{
 const {draftTPlusProductFields26}=await import('./tplus-product-source26.mjs');
 const headers=[...mh,'停用'];
 const source=row('存货',3,{0:text('001'),1:text('synthetic'),2:text('group'),3:num('12.30'),4:num('0'),12:num('0')});
 const master=await readTPlusProductMaster([head('存货',2,headers),source,end('存货',2)],headers);
 const draft=draftTPlusProductFields26({status:'SOURCE_FACTS_ONLY',productSource:master.get('001')});
 assert.equal(draft.fields['来源编号'].value,'001');assert.equal(draft.fields['状态'].value,'正常');
 assert.ok(draft.pending.includes('分类路径'));assert.ok(draft.pending.includes('尺码组'));assert.equal(draft.importReady,false);
 assert.throws(()=>draftTPlusProductFields26({status:'PENDING_SOURCE_FACTS',productSource:master.get('001')}),/SOURCE/);
});


test('category source tree rejects cycles and keeps third level pending without flattening',async()=>{
 const {readTPlusCategoryTree26,attachTPlusCategorySource26}=await import('./tplus-product-source26.mjs');
 const h=['分类编码','分类名称','上级分类编码','上级分类'];
 const entry=(i,code,name,parent)=>row('存货分类',i,{0:text(code),1:text(name),2:parent?text(parent):{kind:'blank',raw:null}});
 const source=[head('存货分类',1,h),entry(2,'A','root',null),entry(3,'B','child','A'),entry(4,'C','leaf','B'),end('存货分类',4)];
 const paths=await readTPlusCategoryTree26(source,h);assert.equal(paths.get('C').path.length,3);assert.equal(paths.get('C').status,'PENDING_APPROVED_CATEGORY_MAPPING');
 const candidate={productSource:{sourceHeaders:['所属类别编码'],sourceCells:{0:text('C')}}};
 assert.equal(attachTPlusCategorySource26(candidate,paths).categoryReferenceStatus,'PENDING_APPROVED_CATEGORY_MAPPING');
 assert.equal(attachTPlusCategorySource26({productSource:{sourceHeaders:['所属类别编码'],sourceCells:{0:text('missing')}}},paths).categoryReferenceStatus,'PENDING_CATEGORY_SOURCE');
 await assert.rejects(readTPlusCategoryTree26([head('存货分类',1,h),entry(2,'A','root','B'),entry(3,'B','child','A'),end('存货分类',3)],h),/CYCLE/);
 await assert.rejects(readTPlusCategoryTree26([head('存货分类',1,h),entry(2,'A','root','missing'),end('存货分类',2)],h),/PARENT_MISSING/);
 await assert.rejects(readTPlusCategoryTree26(source.slice(0,-1),h),/EOF/);
});

test('pinned prior per-product category evidence never assumes parent-code equivalence',async()=>{
 const {readTPlusPriorCategoryDecisions26,compareTPlusPriorCategoryDecision26}=await import('./tplus-product-source26.mjs');
 const header=['code','name','target_id','target_name','target_parent_name','decision_status','decision_source','decision_basis','old_category_for_review_only','original_description','original_size_group','original_invoice_name'];
 const csv=header.join(',')+'\n001,synthetic,target,synthetic,,原可靠映射未涉及,synthetic,商品名称明确命中唯一最终分类（仅规范同义名称）,sourcecat,,G,\n';const bytes=Buffer.from(csv),pin=createHash('sha256').update(bytes).digest('hex');
 const decisions=await readTPlusPriorCategoryDecisions26(bytes,pin);
 const headers=['存货编码','存货名称','所属类别','存货描述','尺码所属取值组编码','开票名称'];
 const candidate={productSource:{sourceProductCode:'001',excelRow:3,sourceHeaders:headers,sourceCells:{0:text('001'),1:text('synthetic'),2:text('sourcecat'),3:{kind:'blank',raw:null},4:text('G'),5:{kind:'blank',raw:null}}}};
 assert.equal(compareTPlusPriorCategoryDecision26(candidate,decisions).status,'PRIOR_DECISION_MATCHED_REFERENCE_ONLY');
 const changed=structuredClone(candidate);changed.productSource.sourceCells[2]=text('other');
 assert.equal(compareTPlusPriorCategoryDecision26(changed,decisions).status,'PENDING_SOURCE_FACTS_CHANGED');
 const groupOnly=structuredClone(candidate);groupOnly.productSource.sourceCells[4]=text('other');
 assert.equal(compareTPlusPriorCategoryDecision26(groupOnly,decisions).status,'PENDING_SOURCE_FACTS_CHANGED');
 const formula=structuredClone(candidate);formula.productSource.sourceCells[4]={kind:'formula',raw:null,formula:'1+1'};
 const formulaResult=compareTPlusPriorCategoryDecision26(formula,decisions);assert.equal(formulaResult.status,'PENDING_SOURCE_FACTS_CHANGED');
 assert.equal(formulaResult.comparisons.find(x=>x.field==='尺码所属取值组编码').status,'SOURCE_UNREADABLE');
 assert.equal(Object.hasOwn(formulaResult,'priorTargetId'),false);
 const missing=structuredClone(candidate);missing.productSource.sourceProductCode='002';
 assert.equal(compareTPlusPriorCategoryDecision26(missing,decisions).status,'PENDING_NO_PRIOR_PRODUCT_DECISION');
 await assert.rejects(readTPlusPriorCategoryDecisions26(bytes,'b'.repeat(64)),/PIN/);
});


test('unknown price label meanings remain pending in master comparison and drafts',async()=>{
 const {draftTPlusProductFields26}=await import('./tplus-product-source26.mjs');
 const bad=[...mh];bad[5]='五级批发价（其他含义）';bad[6]='六级批发价(其他含义)';
 const source=row('存货',3,{0:text('001'),1:text('synthetic'),2:text('group'),3:num('12.30'),4:num('0'),5:num('100'),6:num('200')});
 const master=await readTPlusProductMaster([head('存货',2,bad),source,end('存货',2)],bad);
 const product=master.get('001');assert.equal(product.priceSourceCells['五级批发价'].kind,'unrecognized');assert.equal(product.priceSourceCells['六级批发价'].kind,'unrecognized');
 const draft=draftTPlusProductFields26({status:'SOURCE_FACTS_ONLY',productSource:product});
 assert.ok(draft.pending.includes('五级批发价（工厂店供货价）'));assert.ok(draft.pending.includes('六级批发价（贴牌价）'));
 assert.equal(draft.fields['五级批发价（工厂店供货价）'],undefined);
 const barcode=new Map([['001',[{sourceBarcode:'A'}]]]);const price=row('存货价格本',2,{1:text('001'),2:num('12.30'),3:num('0'),4:num('100'),5:num('200')});
 const out=await Array.fromAsync(assembleTPlusProductSource26({master,barcodes:barcode,prices:projectTPlusProductPrices([head('存货价格本',1,ph),price,end('存货价格本',2)],ph)}));
 assert.equal(out[0].priceChecks['五级批发价'],'PENDING');assert.equal(out[0].priceChecks['六级批发价'],'PENDING');assert.equal(out[0].status,'PENDING_SOURCE_FACTS');
 assert.equal(out[0].productSource.sourceHeaders[5],'五级批发价（其他含义）');assert.equal(out[0].productSource.sourceCells[5].raw,'100');
});

test('prior canonical category requires the exact product, decision and pinned row',async()=>{
 const {readTPlusPriorCategoryDecisions26,readPriorCanonicalProducts26,proposePriorCategoryCanonical26}=await import('./tplus-product-source26.mjs');
 const dh=['code','name','target_id','target_name','target_parent_name','decision_status','decision_source','decision_basis','old_category_for_review_only','original_description','original_size_group','original_invoice_name'];
 const db=Buffer.from(dh.join(',')+'\n001,synthetic,target,leaf,parent,原可靠映射未涉及,synthetic,商品名称明确命中唯一最终分类（仅规范同义名称）,sourcecat,,G,\n');
 const decisions=await readTPlusPriorCategoryDecisions26(db,createHash('sha256').update(db).digest('hex'));
 const cols=IMPORT_V2_TABLES.find(t=>t.entity==='PRODUCT').columns.map(c=>c.name), values=Object.fromEntries(cols.map(x=>[x,'']));
 Object.assign(values,{'款号':'001','商品名称':'synthetic','分类路径':'parent/leaf'});
 const pb=Buffer.from(cols.join(',')+'\n'+cols.map(k=>values[k]).join(',')+'\n'),prior=await readPriorCanonicalProducts26(pb,createHash('sha256').update(pb).digest('hex'));
 const headers=['存货编码','存货名称','所属类别','存货描述','尺码所属取值组编码','开票名称'];
 const candidate={productSource:{sourceProductCode:'001',excelRow:3,sourceHeaders:headers,sourceCells:{0:text('001'),1:text('synthetic'),2:text('sourcecat'),3:{kind:'blank',raw:null},4:text('G'),5:{kind:'blank',raw:null}}}};
 const matched=proposePriorCategoryCanonical26(candidate,decisions,prior);assert.equal(matched.canonicalCategory,'parent/leaf');assert.equal(matched.importReady,false);
 const bad=new Map(prior.products);bad.set('001',{...bad.get('001'),'分类路径':'other/leaf'});
 assert.equal(proposePriorCategoryCanonical26(candidate,decisions,{...prior,products:bad}).status,'PENDING_CATEGORY_PATH_PROOF');
 bad.set('001',{...bad.get('001'),'分类路径':'leaf'});assert.equal(proposePriorCategoryCanonical26(candidate,decisions,{...prior,products:bad}).status,'PENDING_CATEGORY_PATH_PROOF');
 const changed=structuredClone(candidate);changed.productSource.sourceCells[2]=text('different');
 assert.equal(proposePriorCategoryCanonical26(changed,decisions,prior).status,'PENDING_SOURCE_FACTS_CHANGED');
 await assert.rejects(readPriorCanonicalProducts26(pb,'0'.repeat(64)),/PIN/);
});

test('category reference merges into the same product draft with derived evidence; pending never fills it',async()=>{
 const {attachTPlusCanonicalCategory26}=await import('./tplus-product-source26.mjs');
 const draft={scope:'PARTIAL_SOURCE_DRAFT',importReady:false,sourceProductCode:'001',excelRow:3,fields:{},pending:['分类路径','尺码组']};
 const reference={status:'PRIOR_CATEGORY_CANONICAL_REFERENCE',importReady:false,sourceProductCode:'001',sourceRow:3,canonicalCategory:'parent/leaf',decisionRule:'ALL_RECORDED_FIELDS_MATCH',decisionEvidenceSha256:'a'.repeat(64),priorProductEvidenceSha256:'b'.repeat(64),comparisons:[{field:'存货名称',status:'EQUAL'}]};
 const result=attachTPlusCanonicalCategory26(draft,reference,'c'.repeat(64));assert.equal(result.fields['分类路径'].origin,'MIGRATION_DERIVED');
 assert.equal(result.fields['分类路径'].value,'parent/leaf');assert.equal(result.fields['分类路径'].evidence.sourceFileSha256,'c'.repeat(64));assert.equal(result.fields['分类路径'].evidence_ref,requestHash(result.fields['分类路径'].evidence));
 assert.deepEqual(result.pending,['尺码组']);assert.equal(result.importReady,false);assert.equal(Object.hasOwn(draft.fields,'分类路径'),false);
 const pending={...reference,status:'PENDING_SOURCE_FACTS_CHANGED'};assert.ok(attachTPlusCanonicalCategory26(draft,pending,'c'.repeat(64)).pending.includes('分类路径'));
 assert.throws(()=>attachTPlusCanonicalCategory26(draft,{...reference,sourceProductCode:'other'},'c'.repeat(64)),/IDENTITY/);
 assert.throws(()=>attachTPlusCanonicalCategory26(draft,{...reference,comparisons:[{field:'尺码所属取值组编码',status:'DIFFERENT'}]},'c'.repeat(64)),/EVIDENCE/);
 assert.throws(()=>attachTPlusCanonicalCategory26(draft,{...reference,comparisons:[{field:'存货名称',status:'UNKNOWN'}]},'c'.repeat(64)),/EVIDENCE/);
 assert.throws(()=>attachTPlusCanonicalCategory26(draft,{...reference,decisionRule:'EXPLICIT_NAME_GROUP'},'c'.repeat(64)),/EVIDENCE/);
});


test('only explicit decision rules permit missing prior facts; unknown decisions cannot return target',async()=>{
 const {compareTPlusPriorCategoryDecision26}=await import('./tplus-product-source26.mjs');
 const headers=['存货名称','所属类别','存货描述','尺码所属取值组编码','开票名称'];
 const candidate={productSource:{sourceProductCode:'001',excelRow:3,sourceHeaders:headers,sourceCells:{0:text('n'),1:text('c'),2:text('x'),3:text('g'),4:text('i')}}};
 const record={name:'n',old_category_for_review_only:'c',original_description:'',original_size_group:'g',original_invoice_name:'',decision_status:'原可靠映射未涉及',decision_source:'proof',decision_basis:'other rule',target_id:'t',target_name:'n'};
 const decisions={records:new Map([['001',record]]),sha256:'a'.repeat(64)};
 assert.equal(compareTPlusPriorCategoryDecision26(candidate,decisions).status,'PENDING_DECISION_SCOPE');
 record.decision_basis='商品名称明确命中唯一最终分类（仅规范同义名称）';const match=compareTPlusPriorCategoryDecision26(candidate,decisions);
 assert.equal(match.decisionRule,'EXPLICIT_NAME_ONLY');assert.equal(match.comparisons.find(x=>x.field==='存货描述').status,'PRIOR_NOT_RECORDED');
 record.decision_basis='明确套西尺码组与西服名称相互印证';record.decision_source='原审计category_reliable.csv，未受本轮人工裁决影响';
 assert.equal(compareTPlusPriorCategoryDecision26(candidate,decisions).decisionRule,'EXPLICIT_NAME_GROUP');
 const wrongGroup=structuredClone(candidate);wrongGroup.productSource.sourceCells[3]=text('different');assert.equal(compareTPlusPriorCategoryDecision26(wrongGroup,decisions).status,'PENDING_SOURCE_FACTS_CHANGED');
 record.decision_status='REJECTED';const rejected=compareTPlusPriorCategoryDecision26(candidate,decisions);assert.equal(rejected.status,'PENDING_DECISION_EVIDENCE');assert.equal(Object.hasOwn(rejected,'priorTargetId'),false);
 record.decision_status='本轮人工裁决';record.decision_source='';assert.equal(compareTPlusPriorCategoryDecision26(candidate,decisions).status,'PENDING_DECISION_EVIDENCE');
});

test('P01-P13 individual decision scope requires both external pins and exact batch and target coverage',async()=>{
 const {readTPlusPriorCategoryDecisions26,compareTPlusPriorCategoryDecision26}=await import('./tplus-product-source26.mjs');
 const headers=['code','name','target_id','target_name','target_parent_name','decision_status','decision_source','decision_basis','old_category_for_review_only','original_description','original_size_group','original_invoice_name','batch_id','batch_name','group_id'];
 const batches=Array.from({length:13},(_,i)=>({batch_id:'P'+String(i+1).padStart(2,'0'),batch_name:'batch'+i,count:1,resolved:1,unresolved:0,target_counts:{leaf:1}}));
 const rows=batches.map((b,i)=>['id'+i,'n','target','leaf','','本轮人工裁决','approved','individual rule','cat','','g','',b.batch_id,b.batch_name,'group']);
 rows.push(...Array.from({length:8},(_,i)=>['auto'+i,'n','target','leaf','','此前8款直接证据保留','前轮直接证据消解，未重新裁定','direct evidence','cat','','g','','AUTO','','group']));
 const bytes=Buffer.from(headers.join(',')+'\n'+rows.map(x=>x.join(',')).join('\n')+'\n'),pin=createHash('sha256').update(bytes).digest('hex');
 const scopeBytes=Buffer.from(JSON.stringify({all_pass:true,checks:{approved:true,'8_auto_unchanged':true},counts:{direct_evidence_preserved:8},batch_summary:batches})),scopePin=createHash('sha256').update(scopeBytes).digest('hex');
 const approved=await readTPlusPriorCategoryDecisions26(bytes,pin,{validationBytes:scopeBytes,trustedValidationSha256:scopePin});
 const sourceHeaders=['存货名称','所属类别','存货描述','尺码所属取值组编码','开票名称'];
 const candidate={productSource:{sourceProductCode:'id0',excelRow:3,sourceHeaders,sourceCells:{0:text('n'),1:text('cat'),2:text('new'),3:text('g'),4:text('new')}}};
 const result=compareTPlusPriorCategoryDecision26(candidate,approved);assert.equal(result.decisionRule,'EXPLICIT_PXX_PRODUCT_DECISION');assert.equal(result.scopeEvidenceSha256,scopePin);
 const direct=structuredClone(candidate);direct.productSource.sourceProductCode='auto0';assert.equal(compareTPlusPriorCategoryDecision26(direct,approved).decisionRule,'EXPLICIT_DIRECT_EVIDENCE');
 const unscoped=await readTPlusPriorCategoryDecisions26(bytes,pin);assert.equal(compareTPlusPriorCategoryDecision26(candidate,unscoped).status,'PENDING_DECISION_SCOPE');
 await assert.rejects(readTPlusPriorCategoryDecisions26(bytes,pin,{validationBytes:scopeBytes,trustedValidationSha256:'f'.repeat(64)}),/SCOPE_PIN/);
 const falseScope=Buffer.from(JSON.stringify({all_pass:true,checks:{approved:false,'8_auto_unchanged':true},counts:{direct_evidence_preserved:8},batch_summary:batches}));
 await assert.rejects(readTPlusPriorCategoryDecisions26(bytes,pin,{validationBytes:falseScope,trustedValidationSha256:createHash('sha256').update(falseScope).digest('hex')}),/SCOPE_VALIDATION/);
 const tampered=structuredClone(batches);tampered[0].target_counts={other:1};const bad=Buffer.from(JSON.stringify({all_pass:true,checks:{approved:true,'8_auto_unchanged':true},counts:{direct_evidence_preserved:8},batch_summary:tampered}));
 await assert.rejects(readTPlusPriorCategoryDecisions26(bytes,pin,{validationBytes:bad,trustedValidationSha256:createHash('sha256').update(bad).digest('hex')}),/SCOPE_RECORD/);
 const rejected=rows.map(x=>[...x]);rejected[0][5]='REJECTED';const altered=Buffer.from(headers.join(',')+'\n'+rejected.map(x=>x.join(',')).join('\n')+'\n');
 await assert.rejects(readTPlusPriorCategoryDecisions26(altered,createHash('sha256').update(altered).digest('hex'),{validationBytes:scopeBytes,trustedValidationSha256:scopePin}),/SCOPE_RECORD/);
});

test('frozen target reference selects by exact approved code and verifies parent and target level',async()=>{
 const {readApprovedCategoryTargets26,proposePriorCategoryCanonical26}=await import('./tplus-product-source26.mjs');
 const nodes=[{sourceTargetId:'root',name:'parent',parentTargetId:null,parentName:null,leaf:false,canonicalPath:'parent'},
 {sourceTargetId:'leaf',name:'leaf',parentTargetId:'root',parentName:'parent',leaf:true,canonicalPath:'parent/leaf'},
 ...Array.from({length:47},(_,i)=>({sourceTargetId:'r'+i,name:'root'+i,parentTargetId:null,parentName:null,leaf:false,canonicalPath:'root'+i}))];
 const payload={format:'FROZEN_APPROVED_CATEGORY_TARGET_REFERENCE_V1',frozenCommit:'b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3',sourceFileSha256:'2bd2f70869eb1b6e2beb6e4c2949588ad5f1d6ab6c999926bb7503e4199c00ca',decisionMappingSha256:'a'.repeat(64),comparison:{decisions:2941,allTargetIdsNamesParentsLevelsMatch:true},nativeTargetIdentityOrImportAuthority:false,nodes};
 const bytes=Buffer.from(JSON.stringify(payload)),pin=createHash('sha256').update(bytes).digest('hex'),targets=readApprovedCategoryTargets26(bytes,pin,'a'.repeat(64));
 const record={name:'n',old_category_for_review_only:'c',original_description:'d',original_size_group:'g',original_invoice_name:'i',decision_status:'本轮人工裁决',decision_source:'proof',decision_basis:'proof',target_id:'leaf',target_name:'leaf',target_parent_name:'parent',target_level:'叶子'};
 const decisions={sha256:'a'.repeat(64),records:new Map([['001',record]])};const candidate={productSource:{sourceProductCode:'001',excelRow:3,sourceHeaders:['存货名称','所属类别','存货描述','尺码所属取值组编码','开票名称'],sourceCells:{0:text('n'),1:text('c'),2:text('d'),3:text('g'),4:text('i')}}};
 const result=proposePriorCategoryCanonical26(candidate,decisions,undefined,targets);assert.equal(result.canonicalCategory,'parent/leaf');assert.equal(result.targetReferenceSha256,pin);assert.equal(result.importReady,false);
 const missingParent={...record,target_parent_name:''};decisions.records.set('001',missingParent);assert.equal(proposePriorCategoryCanonical26(candidate,decisions,undefined,targets).status,'PENDING_CATEGORY_TARGET_PROOF');
 const mismatch=structuredClone(record);mismatch.target_id='r0';decisions.records.set('001',mismatch);assert.equal(proposePriorCategoryCanonical26(candidate,decisions,undefined,targets).status,'PENDING_CATEGORY_TARGET_PROOF');
 assert.throws(()=>readApprovedCategoryTargets26(bytes,'f'.repeat(64),'a'.repeat(64)),/PIN/);
 const changed=structuredClone(payload);changed.nodes[1].parentName='wrong';const bad=Buffer.from(JSON.stringify(changed));assert.throws(()=>readApprovedCategoryTargets26(bad,createHash('sha256').update(bad).digest('hex'),'a'.repeat(64)),/PARENT/);
});

test('transfer SKU occurrences preserve raw dimensions and never infer missing fit or barcode identity',async()=>{
 const {projectTPlusTransferSkuOccurrences26:project}=await import('./tplus-product-source26.mjs');
 const headers={10:text('条形码'),12:text('存货编码'),14:text('颜色'),15:text('尺码'),16:text('数量'),17:text('版型')};
 const h=row('调拨单',1,headers),r=row('调拨单',2,{10:text('0001'),12:text('product'),14:text('color'),15:text('size'),16:num('-1.0'),17:text('fit')});
 const out=await Array.fromAsync(project([h,r,end('调拨单',2)]));assert.equal(out[0].status,'OBSERVED_COMPLETE_DIMENSIONS_NOT_IDENTITY');assert.equal(out[0].sourceCells['条形码'].raw,'0001');assert.equal(out[0].importReady,false);
 const missing={...r,cells:{...r.cells,17:{kind:'blank',raw:null}}};assert.equal((await Array.fromAsync(project([h,missing,end('调拨单',2)])))[0].status,'PENDING_SOURCE_DIMENSIONS_OR_STRUCTURE');
 const formula={...r,cells:{...r.cells,16:{kind:'formula',raw:null,formula:'1+1'}}};assert.equal((await Array.fromAsync(project([h,formula,end('调拨单',2)])))[0].status,'PENDING_SOURCE_DIMENSIONS_OR_STRUCTURE');
 await assert.rejects(Array.fromAsync(project([h,r])),/EOF/);
 await assert.rejects(Array.fromAsync(project([{...h,cells:{...h.cells,17:text('wrong')}},r,end('调拨单',2)])),/HEADER/);
});
