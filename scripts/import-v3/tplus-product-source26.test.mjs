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
const mh=['存货编码','存货名称','尺码所属取值组编码','采购价','零售价','五级批发价','六级批发价','七级批发价','八级批发价','九级批发价','十级批发价','最低售价'], bh=['存货编码','存货名称','规格型号','条形码','计量单位','是否默认条码'];
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
