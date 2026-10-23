import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
const hash=x=>createHash('sha256').update(x).digest('hex');
// Independent fully synthetic sealed fixture; no private inputs, frozen core imports or DB.
async function fixture(t, mutate=()=>{}, alterManifest=x=>x) {
  const root=await mkdtemp(join(tmpdir(),'synthetic-v2-')); t.after(()=>rm(root,{recursive:true,force:true}));
  const files=new Map(IMPORT_V2_TABLES.map(table=>[table.file,table.columns.map(c=>c.name).join(',')+'\n']));
  files.set('schema/normalized-business-columns.json',JSON.stringify(IMPORT_V2_TABLES));
  files.set('mappings/old-to-canonical-sku-15121.csv','oldSourceSkuId,canonicalSourceSkuId,productSourceId,colorCodeIdentity,fitCode,newSizeDictionaryId\n');
  files.set('mappings/stock-contributor-lineage-38314.csv','oldStockSourceId,canonicalStockRowSourceId,warehouseSourceId,oldSkuSourceId,canonicalSkuSourceId,productSourceId,signedQuantity,sourceUnit\n');
  files.set('audit/independent-verification/warehouse-unit-reconciliation.csv','warehouse,unit,before,after,difference\n');
  files.set('audit/warehouse-product-stock-conservation.csv','warehouseSourceId,productSourceId,inputSignedQuantity,outputSignedQuantity,exactDifference\n');
  files.set('dictionaries/historical-customers.json','[]');
  files.set('audit/independent-verification/all-53-warehouses.csv','warehouse,name,before,after,difference\n');
  mutate(files); const payloadFiles=[];
  for (const [file,value] of files) { const bytes=Buffer.from(value); await mkdir(dirname(join(root,file)),{recursive:true}); await writeFile(join(root,file),bytes); payloadFiles.push({file,bytes:bytes.length,sha256:hash(bytes)}); }
  const manifest=Buffer.from(JSON.stringify(alterManifest({importReady:false,payloadFiles,payloadBytes:payloadFiles.reduce((n,p)=>n+p.bytes,0)})));
  await writeFile(join(root,'manifest.json'),manifest); await writeFile(join(root,'manifest.sha256'),hash(manifest)+'  manifest.json\n'); return root;
}

function stockFixture(files, quantity='-3') {
  const quote=x=>'"'+x.replaceAll('"','""')+'"';
  const rows={HALL:{'来源编号':'hall'},WAREHOUSE:{'来源编号':'warehouse','所属厅来源编号':'hall'},PRODUCT:{'来源编号':'product'},SKU:{'来源编号':'sku','商品来源编号':'product','颜色编码':'007','版型编码':'A','新尺码字典ID':'size'},INVENTORY_BASELINE:{'来源编号':'stock','仓库来源编号':'warehouse','SKU来源编号':'sku','核准库存数量':quantity,'合并输入库存行数':'2','来源单位集合快照':'["piece"]'}};
  for (const [entity,override] of Object.entries(rows)) {
    const table=IMPORT_V2_TABLES.find(t=>t.entity===entity);
    const row=Object.fromEntries(table.columns.map(c=>[c.name,c.required?(c.logicalType==='INTEGER'?'1':c.logicalType==='MONEY'?'1.00':'synthetic'):'' ])); Object.assign(row,override);
    files.set(table.file,files.get(table.file)+table.columns.map(c=>quote(row[c.name])).join(',')+'\n');
  }
  const alias='mappings/old-to-canonical-sku-15121.csv', lineage='mappings/stock-contributor-lineage-38314.csv';
  files.set(alias,files.get(alias)+'old-001,sku,product,007,A,size\nold-002,sku,product,007,A,size\n');
  files.set(lineage,files.get(lineage)+'part-001,stock,warehouse,old-001,sku,product,-5,piece\npart-002,stock,warehouse,old-002,sku,product,2,piece\n');
  const units='audit/independent-verification/warehouse-unit-reconciliation.csv',products='audit/warehouse-product-stock-conservation.csv';
  const allWarehouses='audit/independent-verification/all-53-warehouses.csv'; files.set(allWarehouses,files.get(allWarehouses)+'warehouse,synthetic,-3,-3,0\n');
  files.set(units,files.get(units)+'warehouse,piece,-3,-3,0\n'); files.set(products,files.get(products)+'warehouse,product,-3,-3,0\n');
}

async function v3Fixture(t, mode='valid', customize=()=>{}, sourceHashes={}) {
  const table=IMPORT_V2_TABLES.find(t=>t.entity==='BARCODE'), columns=table.columns.map(c=>c.name), all=[];
  for(let i=0;i<17976;i++) {
    const product=i<2958, row=Object.fromEntries(columns.map(c=>[c,'']));
    Object.assign(row,{'来源编号':`synthetic-barcode-${String(i).padStart(5,'0')}`,'条码':String(i).padStart(13,'0'),'SKU来源编号':product?'':'sku','条码性质':'synthetic','状态':'synthetic','绑定范围':product?'PRODUCT':'SKU','商品来源编号':'product'}); all.push(row);
  }
  const originalIds=all.slice(0,2958).map(row=>row['来源编号']).sort(), supplement=JSON.stringify({productLevelBarcodes:originalIds.map(sourceKey=>({sourceKey}))}), counts={};
  const csv=rows=>columns.join(',')+'\n'+rows.map(row=>columns.map(c=>row[c]).join(',')).join('\n')+'\n';
  const base=await fixture(t,files=>{stockFixture(files);files.set(table.file,csv(all));files.set('snapshots/supplement09-original.json',supplement);customize(files);for(const contract of IMPORT_V2_TABLES) counts[contract.entity]=files.get(contract.file).split('\n').length-2;},m=>({...m,bundleVersion:'synthetic-v2',sourceInputSha256:{'synthetic-supplement.json':hash(supplement),...sourceHashes}}));
  const baseBytes=await readFile(join(base,'manifest.json')), baseManifest=JSON.parse(baseBytes), baseFiles=new Map(baseManifest.payloadFiles.map(p=>[p.file,p]));
  const temp=await mkdtemp(join(tmpdir(),'synthetic-v3-'));t.after(()=>rm(temp,{recursive:true,force:true})); const amendment=join(temp,'amendment'), outside=join(temp,'approved.json'); await mkdir(amendment);
  const excluded=all.slice(0,2958).map(row=>({...row})), effective=all.slice(2958).map(row=>({...row}));
  if(mode==='raw-excluded') excluded[0]['条码']='changed'; if(mode==='raw-effective') effective[0]['条码']='changed';
  if(mode==='duplicate-excluded') excluded[0]=excluded[1]; if(mode==='missing-excluded') excluded.pop(); if(mode==='extra-excluded') excluded.push(effective[0]);
  if(mode==='non-product') {excluded[0]=effective[0];effective[0]=all[0];}
  const ids=[...originalIds]; if(mode==='duplicate-id') ids[0]=ids[1];
  const excludedPath='exclusions/商品级条码_2958_不导入.csv',idsPath='exclusions/excluded-source-ids.json';
  const files=new Map([[table.file,csv(effective)],[excludedPath,csv(excluded)],[idsPath,JSON.stringify(ids,null,2)+'\n']]);
  const effectiveCounts={...counts,BARCODE:15018}, setHash=hash(JSON.stringify(ids)), archiveHash='b'.repeat(64);
  const selection={schemaVersion:'NAIJUE_V3_EXPLICIT_BARCODE_EXCLUSION_SELECTION_20261021',baseBundleVersion:'synthetic-v2',baseManifestSha256:mode==='base-hash'?'c'.repeat(64):hash(baseBytes),baseArchiveSha256:archiveHash,baseBarcodeCsvSha256:baseFiles.get(table.file).sha256,mode:'REPLACE_BARCODE_IMPORT_INPUT_NOT_APPEND',effectiveBarcodeCsv:{path:table.file,sha256:hash(files.get(table.file)),count:15018,columns},excludedEvidenceCsv:{path:excludedPath,sha256:hash(files.get(excludedPath)),count:2958,columns,role:'EVIDENCE_ONLY_DO_NOT_IMPORT'},excludedSourceIdsFile:idsPath,excludedSourceIdsSetSha256:setHash,excludedCount:2958,effectiveCount:15018,idSetHashAlgorithm:'SHA256_UTF8_JSON_COMPACT_SORTED_ARRAY_NO_TRAILING_NEWLINE',exclusionDecisionFile:'approval.json',approvalDecisionId:'synthetic-explicit-decision',importFiles:IMPORT_V2_TABLES.map(contract=>({entity:contract.entity,source:contract.entity==='BARCODE'?'AMENDMENT_V3':'BASE_V2',path:contract.file,sha256:contract.entity==='BARCODE'?hash(files.get(table.file)):baseFiles.get(contract.file).sha256,count:effectiveCounts[contract.entity]})),effectiveEntityCounts:effectiveCounts,notImportTargets:['exclusions/**','audit/**','snapshots/**','BASE_V2/business/03历史条码.csv'],sourceRawSnapshotsRemainEvidenceOnly:true,other17BusinessFilesUnchanged:true,allEffectiveBarcodeSkuRefsNonempty:true,importReady:false,nativeDatabaseImportPerformed:false};
  if(mode==='other-entity') selection.importFiles.find(x=>x.entity==='PRODUCT').sha256='c'.repeat(64);
  files.set('effective-import-selection.json',JSON.stringify(selection,null,2)+'\n');
  const approval={decisionId:selection.approvalDecisionId,decisionText:'Synthetic explicit exclusion approval',scope:'EXCLUDE_EXACT_PRODUCT_BOUND_BARCODE_ARCHIVE_ROWS_FROM_THIS_IMPORT_ONLY',excludedBindingScope:'PRODUCT',excludedCount:2958,excludedSourceIdsSetSha256:setHash,idSetHashAlgorithm:selection.idSetHashAlgorithm,authoritativeTraceSource:{originalSupplementFile:'synthetic-supplement.json',sha256:hash(supplement),jsonArray:'productLevelBarcodes',sourceKeyField:'sourceKey'},baseManifestSha256:selection.baseManifestSha256,baseArchiveSha256:archiveHash,baseBarcodeCsvSha256:selection.baseBarcodeCsvSha256,businessDatabaseDeletionApproved:false,sourceEvidenceDeletionApproved:false,nativeDbImportAuthorizedByThisFile:false,selectionSha256:hash(files.get('effective-import-selection.json')),effectiveBarcodeCsvSha256:selection.effectiveBarcodeCsv.sha256,excludedEvidenceCsvSha256:selection.excludedEvidenceCsv.sha256,excludedSourceIdsFileSha256:hash(files.get(idsPath))};
  const approvalText=JSON.stringify(approval,null,2)+'\n';files.set('approval.json',approvalText); await writeFile(outside,mode==='external-approval'?JSON.stringify({...approval,decisionText:'different'}):approvalText);
  const payloadFiles=[];
  for(const [file,content] of files) {await mkdir(dirname(join(amendment,file)),{recursive:true}); await writeFile(join(amendment,file),content);payloadFiles.push({file,bytes:Buffer.byteLength(content),sha256:hash(content)});}
  const manifestBytes=JSON.stringify({importReady:false,payloadFiles,payloadBytes:payloadFiles.reduce((n,p)=>n+p.bytes,0)});await writeFile(join(amendment,'manifest.json'),manifestBytes);await writeFile(join(amendment,'manifest.sha256'),hash(manifestBytes)+'  manifest.json\n');
  return {base,amendment,approval:outside};
}

export const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const csv=(columns,rows)=>columns.join(',')+'\n'+rows.map(r=>columns.map(c=>'"'+String(r[c]).replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
export async function paymentSourceFixture(t,change=()=>{}){
 let approvedMoneyOverlaySha256;const sourceHash='d'.repeat(64),sourceFile='synthetic-sales-detail.xlsx';
 const bundle=await v3Fixture(t,'valid',files=>{
  const sourceRows=[];const make=(entity,override)=>{const table=IMPORT_V2_TABLES.find(t=>t.entity===entity);return Object.assign(Object.fromEntries(table.columns.map(c=>[c.name,c.required?(c.logicalType==='INTEGER'?'1':c.logicalType==='MONEY'?'1.00':'synthetic'):'' ])),override);};
  const header=make('SALES_HEADER',{'来源编号':'sale-header','原单号':'SYNTHETIC-0001','单据类型':'销售','所属厅来源编号':'hall','客户来源编号':'customer','仓库来源编号':'warehouse','营业员来源编号':'','原审核状态':'未审核'});
  const customer=make('CUSTOMER',{'来源编号':'customer'});
  const set=(entity,rows)=>{const table=IMPORT_V2_TABLES.find(t=>t.entity===entity);files.set(table.file,csv(table.columns.map(c=>c.name),rows));};
  set('SALES_HEADER',[header]);set('CUSTOMER',[customer]);
  const productTable=IMPORT_V2_TABLES.find(t=>t.entity==='PRODUCT');
  // Existing fixture PRODUCT money must also have exact original snapshot coverage.
  const product=make('PRODUCT',{'来源编号':'product'});
  set('PRODUCT',[product]);
  sourceRows.push({entity:'PRODUCT',sourceId:'product',file:sourceFile,sheet:'PRODUCT',row:1,sourceSha256:sourceHash,data:product});
  sourceRows.push({entity:'SALES_HEADER',sourceId:'sale-header',file:sourceFile,sheet:'HEADERS',row:1,sourceSha256:sourceHash,data:header});
  const rows=[],overlay=[];
  const moneyColumns=['file','sheet','row','sourceId','entity','documentSourceId','field','rawValue','excessFromNearestCent','candidateExactCentValue','sourceFileSha256','decision','provenance','toleranceCurrencyUnits','corroboratingDocumentSourceId'];
  for(let i=0;i<32;i++){
   const normalized=make('SALES_LINE',{'来源编号':`line-${i}`,'单据来源编号':'sale-header','原行号':String(i+1),'SKU来源编号':'sku','原数量':'-2','原参考价':'','原成交单价':'1.00','原行金额':'-2.06','原赠品标记':'否','原款号':'0007'});
   const raw={...normalized,'SKU来源编号':'old-001','原成交单价':'1.00000000000001'};rows.push(normalized);
   sourceRows.push({entity:'SALES_LINE',sourceId:normalized['来源编号'],file:sourceFile,sheet:'DETAIL',row:i+1,sourceSha256:sourceHash,data:raw});
   overlay.push({file:sourceFile,sheet:'DETAIL',row:String(i+1),sourceId:normalized['来源编号'],entity:'SALES_LINE',documentSourceId:'sale-header',field:'原成交单价',rawValue:raw['原成交单价'],excessFromNearestCent:'0.00000000000001',candidateExactCentValue:'1.00',sourceFileSha256:sourceHash,decision:'CORROBORATED_TAIL_ONLY_CANDIDATE',provenance:'MIGRATION_DERIVED_CENT_NORMALIZATION',toleranceCurrencyUnits:'1E-8',corroboratingDocumentSourceId:'sale-header'});
  }
  set('SALES_LINE',rows);files.set('provenance/approved-money-tail-overlay.csv',csv(moneyColumns,overlay));approvedMoneyOverlaySha256=hash(files.get('provenance/approved-money-tail-overlay.csv'));
  const paymentRows={PAYMENT_METHOD:[make('PAYMENT_METHOD',{'来源编号':'method-A','方式名称':'原方式A','状态':'正常'}),make('PAYMENT_METHOD',{'来源编号':'method-B','方式名称':'原方式B','状态':'正常'})],PAYMENT_ACCOUNT:[make('PAYMENT_ACCOUNT',{'来源编号':'account','账户显示名称':'原账户名','收款方式来源编号':'method-A','状态':'正常'})],PAYMENT_ACCOUNT_HALL:[{'账户来源编号':'account','厅来源编号':'hall'}]};
  for(const [entity,data]of Object.entries(paymentRows)){set(entity,data);for(let i=0;i<data.length;i++)sourceRows.push({entity,sourceId:entity==='PAYMENT_ACCOUNT_HALL'?JSON.stringify(['account','hall']):data[i]['来源编号'],file:sourceFile,sheet:entity,row:i+2,sourceSha256:sourceHash,data:data[i]});}
  const settlements=[make('SETTLEMENT',{'来源编号':'settlement-1','单据来源编号':'sale-header','原收退行号':'9','账户来源编号':'account','方向':'退款','金额':'7.03','原账户显示名':'历史账户旧名','原方式显示名':'历史方式旧名','原收款方式来源编号':'method-B'}),make('SETTLEMENT',{'来源编号':'settlement-2','单据来源编号':'sale-header','原收退行号':'10','账户来源编号':'account','方向':'收款','金额':'0.00','原账户显示名':'','原方式显示名':'','原收款方式来源编号':''})];set('SETTLEMENT',settlements);
  settlements.forEach((row,i)=>{const data={...row};if(i===1)delete data['原收款方式来源编号'];sourceRows.push({entity:'SETTLEMENT',sourceId:row['来源编号'],file:sourceFile,sheet:'SETTLEMENT',row:i+2,sourceSha256:sourceHash,data});});
  change({files,sourceRows,rows});files.set('snapshots/all-business-source-rows.jsonl',sourceRows.map(r=>JSON.stringify(r)+(r.sourceId==='settlement-1'?'\r':'')).join('\n')+'\n');
 },{[sourceFile]:sourceHash});
 const spoolParent=await mkdtemp(join(tmpdir(),'sales-detail-private-spool-'));t.after(()=>rm(spoolParent,{recursive:true,force:true}));
 return {base:await realpath(bundle.base),v3Amendment:await realpath(bundle.amendment),v3Approval:await realpath(bundle.approval),trustedApprovalSha256:hash(await readFile(bundle.approval)),approvedMoneyOverlaySha256,spoolParent:await realpath(spoolParent),batchId:id(1),fixedSourceNamespace:'synthetic-payment-reader'};
}

// Synthetic reviewed offsets for the two original finite history readers.
export async function materializedHistoryFixture(t,entity,change=()=>{}){
 const entities=['SKU','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','INVENTORY_BASELINE','SALES_LINE','SETTLEMENT','TRANSFER_LINE'];
 const all=['BARCODE','CUSTOMER','HALL','INVENTORY_BASELINE','ISSUE','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','PAYMENT_METHOD','PRODUCT','SALES_HEADER','SALES_LINE','SETTLEMENT','SKU','STAFF','SUPPLIER','TRANSFER_HEADER','TRANSFER_LINE','WAREHOUSE'];
 const options=await paymentSourceFixture(t,context=>{
  const sample=context.sourceRows[0];
  for(const [i,e]of entities.entries())if(!context.sourceRows.some(r=>r.entity===e))context.sourceRows.push({entity:e,sourceId:'synthetic-offset-'+e,file:sample.file,sheet:'OFFSET-'+e,row:1000+i,sourceSha256:sample.sourceSha256,data:{'来源编号':'synthetic-offset-'+e}});
  change(context);
 });
 const root=await mkdtemp(join(await realpath(tmpdir()),'synthetic-history-offsets-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const manifestFile=join(options.base,'manifest.json'),baseBytes=await readFile(manifestFile),sourceFile=join(options.base,'snapshots/all-business-source-rows.jsonl'),source=await readFile(sourceFile);
 const rows=new Map(entities.map(e=>[e,[]])),counts=Object.fromEntries(all.map(e=>[e,0]));let start=0;
 while(start<source.length){const end=source.indexOf(10,start),line=source.subarray(start,end),raw=JSON.parse(line);counts[raw.entity]++;
  if(rows.has(raw.entity))rows.get(raw.entity).push({entity:raw.entity,sourceKey:raw.sourceId,sourceLocator:{file:raw.file,sheet:raw.sheet,row:raw.row,sourceSha256:raw.sourceSha256},identityKind:raw.sourceId===''?'ORIGINAL_LOCATOR_ONLY':'ORIGINAL_SOURCE_KEY_AND_LOCATOR',offset:start,length:line.length,sha256:hash(line)});start=end+1;
 }
 const artifacts=[];for(const e of entities){const bytes=Buffer.from(rows.get(e).map(r=>JSON.stringify(r)+'\n').join('')),path=join(root,e+'.jsonl');await writeFile(path,bytes);artifacts.push({entity:e,path,rows:rows.get(e).length,bytes:bytes.length,sha256:hash(bytes)});}
 const index={version:'MATERIALIZED_SOURCE_OFFSET_INDEX_CANDIDATE_V1',status:'COMPLETE_PINNED_SOURCE_INDEX_NOT_NATIVE_AUTHORITY',source:{path:sourceFile,bytes:source.length,sha256:hash(source),rows:Object.values(counts).reduce((a,b)=>a+b,0)},manifest:{path:manifestFile,sha256:hash(baseBytes)},indexRows:artifacts.reduce((s,f)=>s+f.rows,0),indexBytes:artifacts.reduce((s,f)=>s+f.bytes,0),expectedEntityCounts:counts,observedEntityCounts:{...counts},artifacts,offsetEncoding:'UTF8_BYTE_OFFSET_LENGTH_EXCLUDES_LF_RETAINS_CR_V1',scannedOriginalWorkbooks:false,scannedVerifiedHeaderGzip:false,nativeUUIDsAllocated:0,sql:false,importAuthorized:false};
 const indexManifestFile=join(root,'INDEX-CANDIDATE.json'),indexBytes=Buffer.from(JSON.stringify(index));await writeFile(indexManifestFile,indexBytes);
 const qbFile=join(root,'synthetic-review-result.json'),qb=Buffer.from(JSON.stringify({result:'PASS',scope:'SYNTHETIC_FINITE_READER_ONLY'}));await writeFile(qbFile,qb);
 const decision=JSON.parse(await readFile(options.v3Approval)),binding={batchId:options.batchId,fixedSourceNamespace:options.fixedSourceNamespace,cutoffAt:'2026-10-04T12:00:00+08:00',selectionSha256:decision.selectionSha256};
 const review={version:'C_MATERIALIZED_SOURCE_OFFSET_INDEX_REVIEW_V1',decision:'ACCEPT_EXACT_SOURCE_OFFSET_BINDINGS',binding,indexManifest:{path:indexManifestFile,sha256:hash(indexBytes),bytes:indexBytes.length},source:{...index.source},scope:'OFFSET_ROWS_ONLY',independentReview:{path:qbFile,sha256:hash(qb),result:'PASS'},realImportExecutionAuthorized:false};
 const reviewFile=join(root,'synthetic-outside-review.json'),reviewBytes=Buffer.from(JSON.stringify(review));await writeFile(reviewFile,reviewBytes);
 return {...options,materializedSource:{indexManifestFile,trustedIndexManifestSha256:hash(indexBytes),reviewFile,trustedReviewSha256:hash(reviewBytes),binding,entities:[entity]}};
}
