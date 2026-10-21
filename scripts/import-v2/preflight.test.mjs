import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { preflightV2 } from './run.mjs';
import { openAuthorizedV3Reader } from './authorized-reader.mjs';
import { prepareV3HistoryChunk } from '../../packages/application/src/import-v3-history-staging.ts';
import { prepareProductEvidenceChunk } from '../../packages/application/src/product-evidence-staging.ts';
const hash=x=>createHash('sha256').update(x).digest('hex');
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
test('synthetic empty wire contract is integrity-valid, never native-import ready',async t=>{
  const report=await preflightV2(await fixture(t)); assert.equal(report.importReady,false); assert.equal(report.noSql,true); assert.equal(report.counts.SKU,0); assert.ok(report.missing.length>0);
});
test('tampered payload and manifest seals fail closed',async t=>{
  const root=await fixture(t); await writeFile(join(root,IMPORT_V2_TABLES[0].file),'tampered'); await assert.rejects(preflightV2(root),/PAYLOAD_HASH_OR_SIZE/);
  await writeFile(join(root,'manifest.sha256'),'0'.repeat(64)); await assert.rejects(preflightV2(root),/MANIFEST_HASH/);
});
test('traversal, duplicate paths, and symlink payloads rejected',async t=>{
  await assert.rejects(preflightV2(await fixture(t,()=>{},m=>({...m,payloadFiles:[{file:'../escape',bytes:0,sha256:hash('')}]}))),/UNSAFE_MANIFEST_PATH/);
  await assert.rejects(preflightV2(await fixture(t,()=>{},m=>({...m,payloadFiles:[...m.payloadFiles,m.payloadFiles[0]]}))),/MANIFEST_ENTRY/);
  const root=await fixture(t), path=join(root,IMPORT_V2_TABLES[0].file); await rm(path); await symlink(join(root,'manifest.json'),path); await assert.rejects(preflightV2(root),/SYMLINK_NOT_ALLOWED/);
});
test('self-consistent changed CSV header is not accepted as trusted schema',async t=>{
  const root=await fixture(t,files=>files.set(IMPORT_V2_TABLES[0].file,'wrong\n')); await assert.rejects(preflightV2(root),/CSV_HEADER/);
});
test('malformed UTF-8 is rejected rather than replaced',async t=>{
  const root=await fixture(t,files=>files.set(IMPORT_V2_TABLES[0].file,Buffer.from([0xff]))); await assert.rejects(preflightV2(root),/encoded data/);
});
test('valid CSV with missing referenced target is explicitly not valid',async t=>{
  const root=await fixture(t,files=>{const table=IMPORT_V2_TABLES.find(t=>t.entity==='PAYMENT_ACCOUNT_HALL');files.set(table.file,files.get(table.file)+'synthetic-account,synthetic-hall\n');}); const report=await preflightV2(root); assert.equal(report.referenceTargetsValid,false); assert.equal(Object.keys(report.missingReferencesByField).length,2);
});
test('PRODUCT barcode unknown SKU is retained and contradictory required flag reported',async t=>{
  const root=await fixture(t,files=>{
    for (const entity of ['PRODUCT','BARCODE']) {
      const table=IMPORT_V2_TABLES.find(t=>t.entity===entity);
      const row=Object.fromEntries(table.columns.map(c=>[c.name,c.required?(c.logicalType==='INTEGER'?'1':c.logicalType==='MONEY'?'1.00':'synthetic'):'' ]));
      if(entity==='PRODUCT') row['来源编号']='synthetic-product';
      else Object.assign(row,{'绑定范围':'PRODUCT','SKU来源编号':'','商品来源编号':'synthetic-product'});
      files.set(table.file,files.get(table.file)+table.columns.map(c=>row[c.name]).join(',')+'\n');
    }
  });
  const report=await preflightV2(root); assert.equal(report.wireRequiredFieldsValid,false); assert.equal(report.requiredEmptyByField['BARCODE.SKU来源编号'],1); assert.equal(report.importReady,false); assert.equal(report.semanticBarcodeBindingsValid,true); assert.equal(report.barcodeBindings.product,1);
});
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
test('many-to-one stock contributions conserve signed quantity, warehouse/product and unit',async t=>{
  const report=await preflightV2(await fixture(t,files=>stockFixture(files)));
  assert.equal(report.aliases,2); assert.equal(report.canonicalSkuTargets,1); assert.equal(report.stock.signedTotal,'-3'); assert.equal(report.stock.contributors,2); assert.equal(report.stock.warehouseProductPairs,1);
});
test('stock must not clamp negatives or silently change signed baseline sums',async t=>{
  await assert.rejects(preflightV2(await fixture(t,files=>stockFixture(files,'0'))),/STOCK_GROUP_CONSERVATION/);
});
test('runner resolves a historical sales customer via sealed historical-only supplement',async t=>{
  const root=await fixture(t,files=>{
    stockFixture(files);
    files.set('dictionaries/historical-customers.json',JSON.stringify([{sourceKey:'historical-customer',enabled:false,historicalOnly:true,visibleInCurrentCustomerList:false}]));
    const table=IMPORT_V2_TABLES.find(t=>t.entity==='SALES_HEADER');
    const row=Object.fromEntries(table.columns.map(c=>[c.name,c.required?(c.logicalType==='INTEGER'?'1':c.logicalType==='MONEY'?'1.00':'synthetic'):'' ]));
    Object.assign(row,{'来源编号':'sale','所属厅来源编号':'hall','客户来源编号':'historical-customer','仓库来源编号':'warehouse','业务日期':'60'});
    files.set(table.file,files.get(table.file)+table.columns.map(c=>row[c.name]).join(',')+'\n');
  });
  const report=await preflightV2(root); assert.equal(report.referenceTargetsValid,true); assert.equal(report.supplementalHistoricalCustomerReferences,1); assert.equal(report.temporalCellsPolicyRequired,1); assert.equal(report.importReady,false);
});
test('zero-contributor warehouses remain in full coverage without manufactured stock rows',async t=>{
  const root=await fixture(t,files=>{
    stockFixture(files);
    const table=IMPORT_V2_TABLES.find(t=>t.entity==='WAREHOUSE');
    files.set(table.file,files.get(table.file)+'zero-warehouse,synthetic,hall,synthetic,synthetic\n');
    const audit='audit/independent-verification/all-53-warehouses.csv'; files.set(audit,files.get(audit)+'zero-warehouse,synthetic,0,0,0\n');
  });
  const report=await preflightV2(root); assert.equal(report.stock.warehouses,2); assert.equal(report.stock.warehousesWithContributors,1); assert.equal(report.stock.warehouseAuditCoverage,2); assert.equal(report.stock.groups,1);
});
test('missing zero-contributor warehouse audit entry fails coverage',async t=>{
  const root=await fixture(t,files=>{stockFixture(files); const table=IMPORT_V2_TABLES.find(t=>t.entity==='WAREHOUSE');files.set(table.file,files.get(table.file)+'zero-warehouse,synthetic,hall,synthetic,synthetic\n');});
  await assert.rejects(preflightV2(root),/STOCK_WAREHOUSE_COVERAGE/);
});
async function moneyFixture(t, mutate=()=>{}) {
  let pin;
  const root=await fixture(t,files=>{
    stockFixture(files);
    files.set('dictionaries/historical-customers.json',JSON.stringify([{sourceKey:'historical-customer',enabled:false,historicalOnly:true,visibleInCurrentCustomerList:false}]));
    const table=IMPORT_V2_TABLES.find(t=>t.entity==='SALES_HEADER');
    const sourceHash='a'.repeat(64), sourceFile='synthetic-source.xlsx';
    const snapshots=[{file:sourceFile,sheet:'synthetic-products',row:2,entity:'PRODUCT',sourceId:'product',sourceSha256:sourceHash,data:{'来源编号':'product'}}];
    const overlayColumns=['file','sheet','row','sourceId','entity','documentSourceId','field','rawValue','excessFromNearestCent','candidateExactCentValue','sourceFileSha256','decision','provenance','toleranceCurrencyUnits','corroboratingDocumentSourceId'];
    let canonical=files.get(table.file), overlay=overlayColumns.join(',')+'\n';
    for(let i=0;i<32;i++) {
      const id=`synthetic-sale-${i}`, row=Object.fromEntries(table.columns.map(c=>[c.name,c.required?(c.logicalType==='INTEGER'?'1':c.logicalType==='MONEY'?'1.00':'synthetic'):'' ]));
      Object.assign(row,{'来源编号':id,'所属厅来源编号':'hall','客户来源编号':'historical-customer','仓库来源编号':'warehouse','业务日期':'60','优惠前金额':'1.00','整单优惠':'0','应结金额':'1.00'});
      canonical+=table.columns.map(c=>row[c.name]).join(',')+'\n';
      snapshots.push({file:sourceFile,sheet:'synthetic-sales',row:i+2,entity:'SALES_HEADER',sourceId:id,sourceSha256:sourceHash,data:{...row,'优惠前金额':'1.00000000000001'}});
      overlay+=[sourceFile,'synthetic-sales',String(i+2),id,'SALES_HEADER',id,'优惠前金额','1.00000000000001','1E-14','1.00',sourceHash,'CORROBORATED_TAIL_ONLY_CANDIDATE','MIGRATION_DERIVED_CENT_NORMALIZATION','1E-8',id].join(',')+'\n';
    }
    files.set(table.file,canonical); files.set('snapshots/all-business-source-rows.jsonl',snapshots.map(s=>JSON.stringify(s)).join('\n')+'\n');
    files.set('provenance/approved-money-tail-overlay.csv',overlay); pin=hash(overlay);
    mutate(files,snapshots);
  },m=>({...m,sourceInputSha256:{'synthetic-source.xlsx':'a'.repeat(64)}}));
  return {root,pin};
}
test('32 pinned approvals join original source SHA/location/identity/raw value to canonical cells',async t=>{
  const {root,pin}=await moneyFixture(t); const report=await preflightV2(root,{approvedMoneyOverlaySha256:pin});
  assert.equal(report.originalSourceMoneyVerification.approvedCellsMatched,32); assert.equal(report.originalSourceMoneyVerification.unapprovedMoneyRewrites,0); assert.equal(report.originalSourceMoneyVerification.canonicalMoneyRows,33); assert.equal(report.originalSourceMoneyVerification.historicalAmountsRebalanced,false); assert.equal(report.importReady,false);
});
test('manifest self-consistency cannot authorize changed money overlay bytes',async t=>{
  const {root,pin}=await moneyFixture(t,files=>files.set('provenance/approved-money-tail-overlay.csv',files.get('provenance/approved-money-tail-overlay.csv').replace('1.00,','1.01,')));
  await assert.rejects(preflightV2(root,{approvedMoneyOverlaySha256:pin}),/TRUST_ANCHOR/);
});
test('every approved snapshot provenance component must match, even after self-consistent rehash',async t=>{
  for(const field of ['file','sheet','row','sourceId','sourceSha256']) {
    const {root,pin}=await moneyFixture(t,(files,rows)=>{const row=rows[1]; row[field]=field==='row'?999:'changed'; if(field==='sourceId') row.data['来源编号']='changed'; files.set('snapshots/all-business-source-rows.jsonl',rows.map(r=>JSON.stringify(r)).join('\n'));});
    await assert.rejects(preflightV2(root,{approvedMoneyOverlaySha256:pin}),/MONEY_/);
  }
});
test('approved raw value mismatch, unrelated money rewrite, and missing source coverage fail closed',async t=>{
  for(const mode of ['approved-raw','unapproved-money','missing-row','duplicate-row']) {
    const {root,pin}=await moneyFixture(t,(files,rows)=>{
      if(mode==='approved-raw') rows[1].data['优惠前金额']='1.00000000000002';
      if(mode==='unapproved-money') rows[1].data['应结金额']='1.01';
      if(mode==='missing-row') rows.pop(); if(mode==='duplicate-row') rows.push(rows[1]);
      files.set('snapshots/all-business-source-rows.jsonl',rows.map(r=>JSON.stringify(r)).join('\n'));
    });
    await assert.rejects(preflightV2(root,{approvedMoneyOverlaySha256:pin}),/MONEY_/);
  }
});
async function creatorFixture(t, mutate=()=>{}) {
  return fixture(t,files=>{
    stockFixture(files); files.set('dictionaries/historical-customers.json',JSON.stringify([{sourceKey:'historical-customer',enabled:false,historicalOnly:true,visibleInCurrentCustomerList:false}]));
    const snapshots=[], overlays=[];
    const add=(entity,override)=>{
      const table=IMPORT_V2_TABLES.find(t=>t.entity===entity), row=Object.fromEntries(table.columns.map(c=>[c.name,c.required?(c.logicalType==='INTEGER'?'1':c.logicalType==='MONEY'?'1.00':'synthetic'):'' ])); Object.assign(row,override); files.set(table.file,files.get(table.file)+table.columns.map(c=>row[c.name]).join(',')+'\n'); return row;
    };
    for(const [id,hall] of [['staff-hall','hall'],['staff-no-hall','']]) {
      const row=add('STAFF',{'来源编号':id,'所属厅来源编号':hall}); snapshots.push({file:'synthetic-source.xlsx',sheet:'staff',row:snapshots.length+2,entity:'STAFF',sourceId:id,sourceSha256:'a'.repeat(64),data:row});
    }
    for(const [id,entity,person,hall,provenance,reason] of [
      ['sale-derived','SALES_HEADER','staff-hall','hall','MIGRATION_DERIVED','MIGRATION_DERIVED_CURRENT_EMPLOYEE_HALL'],
      ['sale-unknown','SALES_HEADER','','','UNKNOWN','UNKNOWN_NO_SALESPERSON_ID'],
      ['transfer-unknown','TRANSFER_HEADER','staff-no-hall','','UNKNOWN','UNKNOWN_MATCHED_EMPLOYEE_HAS_NO_HALL']]) {
      const personField=entity==='SALES_HEADER'?'营业员来源编号':'原制单账号编号';
      const row=add(entity,{'来源编号':id,'原单号':id,'所属厅来源编号':'hall','客户来源编号':'historical-customer','仓库来源编号':'warehouse','调出仓来源编号':'warehouse','调入仓来源编号':'warehouse','业务日期':'60',[personField]:person,'原创建厅编号':hall,'创建厅归属来源':provenance,'创建厅归属原因':reason});
      const source={file:'synthetic-source.xlsx',sheet:entity,row:snapshots.length+2,entity,sourceId:id,sourceSha256:'a'.repeat(64),data:{...row,'原创建厅编号':'uploaded-old-hall'}}; snapshots.push(source);
      overlays.push({file:source.file,sheet:source.sheet,row:String(source.row),sourceId:id,documentNumber:id,personField,personId:person,matchedStaffId:person,currentEmployeeHall:hall,uploadedWarehouseDerivedHall:'uploaded-old-hall',candidateCreatorHall:hall,provenance,reason,comparison:hall?'different_nonblank':'clear_to_unknown',rawCreatorDisplay:'',rawPeopleSupportRow:String(source.row)});
    }
    const columns=['file','sheet','row','sourceId','documentNumber','personField','personId','matchedStaffId','currentEmployeeHall','uploadedWarehouseDerivedHall','candidateCreatorHall','provenance','reason','comparison','rawCreatorDisplay','rawPeopleSupportRow'];
    mutate({files,snapshots,overlays});
    files.set('provenance/creator-hall-approved-overlay.csv',columns.join(',')+'\n'+overlays.map(row=>columns.map(c=>row[c]).join(',')).join('\n')+'\n');
    files.set('snapshots/all-business-source-rows.jsonl',snapshots.map(row=>JSON.stringify(row)).join('\n'));
  },m=>({...m,sourceInputSha256:{'synthetic-source.xlsx':'a'.repeat(64)}}));
}
test('creator overlay joins original location/person and staff-source hall; retains reason and unknowns',async t=>{
  const report=await preflightV2(await creatorFixture(t),{verifyCreatorHall:true}), result=report.creatorHallSourceVerification;
  assert.equal(result.sourceHeadersMatched,3); assert.equal(result.employeeHallSourcesMatched,2); assert.equal(result.derived,1); assert.equal(result.unknown,2); assert.equal(result.warehouseFallbacks,0); assert.equal(result.canonicalReasonsPreserved,true); assert.equal(result.auxiliaryDisplayAndSupportRowsSemanticallyReparsed,false); assert.equal(report.importReady,false);
});
test('creator unknown cannot be silently filled from warehouse hall, even in a rehashed overlay',async t=>{
  const root=await creatorFixture(t,({overlays})=>{overlays[2].candidateCreatorHall='hall';overlays[2].provenance='MIGRATION_DERIVED';});
  await assert.rejects(preflightV2(root,{verifyCreatorHall:true}),/CREATOR_DERIVATION/);
});
test('creator source location, original hall, person, and staff hall must retain source agreement',async t=>{
  for(const mode of ['location','original-hall','person','staff-hall','missing-staff','missing-header']) {
    const root=await creatorFixture(t,({snapshots})=>{
      if(mode==='location') snapshots[2].row=999;
      if(mode==='original-hall') snapshots[2].data['原创建厅编号']='changed';
      if(mode==='person') snapshots[2].data['营业员来源编号']='staff-no-hall';
      if(mode==='staff-hall') snapshots[0].data['所属厅来源编号']='changed';
      if(mode==='missing-staff') snapshots.shift(); if(mode==='missing-header') snapshots.pop();
    });
    await assert.rejects(preflightV2(root,{verifyCreatorHall:true}),/CREATOR_/);
  }
});
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
test('v3 replaces barcode input only after explicit external approval; v2 remains reproducible',async t=>{
  const f=await v3Fixture(t), original=await preflightV2(f.base);assert.equal(original.counts.BARCODE,17976);assert.equal(original.wireRequiredFieldsValid,false);
  const report=await preflightV2(f.base,{v3Amendment:f.amendment,v3Approval:f.approval});assert.equal(report.kind,'V3_READ_ONLY_PREFLIGHT');assert.equal(report.counts.BARCODE,15018);assert.equal(report.barcodeBindings.product,0);assert.equal(report.wireRequiredFieldsValid,true);assert.equal(report.sourceV2BarcodeEvidence.rows,17976);assert.equal(report.v3SelectionVerification.excludedProductEvidenceRows,2958);assert.equal(report.v3SelectionVerification.otherBusinessEntitiesUnchanged,17);assert.equal(report.importReady,false);assert.deepEqual({...report.counts,BARCODE:17976},original.counts);
});
test('v3 refuses missing approval and a package-local self-approval',async t=>{
  const f=await v3Fixture(t);await assert.rejects(preflightV2(f.base,{v3Amendment:f.amendment}),/EXPLICIT_APPROVAL_REQUIRED/);
  await assert.rejects(preflightV2(f.base,{v3Amendment:f.amendment,v3Approval:join(f.amendment,'approval.json')}),/MUST_BE_EXTERNAL/);
});
test('v3 rejects mismatched base or external approval and any change to another entity',async t=>{
  for(const mode of ['base-hash','external-approval','other-entity']) {const f=await v3Fixture(t,mode);await assert.rejects(preflightV2(f.base,{v3Amendment:f.amendment,v3Approval:f.approval}),/V3_/);}
});
test('v3 rejects extra/missing/non-PRODUCT/duplicate exclusions and changed retained or raw fields',async t=>{
  for(const mode of ['missing-excluded','extra-excluded','non-product','duplicate-excluded','duplicate-id','raw-excluded','raw-effective']) {const f=await v3Fixture(t,mode);await assert.rejects(preflightV2(f.base,{v3Amendment:f.amendment,v3Approval:f.approval}),/V3_/);}
});

const readerId=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function readerFixture(t, mutate=()=>{}) {
  const raw=[];
  const bundle=await v3Fixture(t,'valid',files=>{
    for(const entity of ['PRODUCT','TRANSFER_HEADER','TRANSFER_LINE']) {
      const table=IMPORT_V2_TABLES.find(t=>t.entity===entity);
      const row=Object.fromEntries(table.columns.map(c=>[c.name,c.required?(c.logicalType==='INTEGER'?'1':c.logicalType==='MONEY'?'1.00':'synthetic'):'' ]));
      Object.assign(row,entity==='PRODUCT'?{'来源编号':'product'}:entity==='TRANSFER_HEADER'?{'来源编号':'transfer','调出仓来源编号':'warehouse','调入仓来源编号':'warehouse','原创建厅编号':''}:{'来源编号':'line','单据来源编号':'transfer','SKU来源编号':'sku'});
      const quote=x=>'"'+x.replaceAll('"','""')+'"';files.set(table.file,table.columns.map(c=>c.name).join(',')+'\n'+table.columns.map(c=>quote(row[c.name])).join(',')+'\n');
      if(entity!=='TRANSFER_HEADER')raw.push({entity,sourceId:row['来源编号'],file:'synthetic-source.xlsx',sheet:entity,row:2,sourceSha256:'d'.repeat(64),data:{...row,...(entity==='TRANSFER_LINE'?{'SKU来源编号':'old-001'}:{})}});
    }
    mutate(raw);files.set('snapshots/all-business-source-rows.jsonl',raw.map((r,i)=>JSON.stringify(r)+(i===0?'\r':'')).join('\n')+'\n');
  },{'synthetic-source.xlsx':'d'.repeat(64)});
  const spoolParent=await mkdtemp(join(tmpdir(),'synthetic-reader-output-'));t.after(()=>rm(spoolParent,{recursive:true,force:true}));
  return {...bundle,spoolParent,batchId:readerId(1),fixedSourceNamespace:'synthetic-reader',trustedApprovalSha256:hash(await readFile(bundle.approval)),v3Amendment:bundle.amendment,v3Approval:bundle.approval};
}
test('reader opens only after full verification; source rows and prepared PRODUCT/TRANSFER_LINE authorize exactly',async t=>{
  let pause=false,resume,reached;const entered=new Promise(resolve=>{reached=resolve;});
  const options=await readerFixture(t),resolveNativeBinding=async ({entity})=>{if(pause){reached();await new Promise(resolve=>{resume=resolve;});}return entity==='PRODUCT'?{product:{sourceKey:'product',nativeId:readerId(4),expectedVersion:1},blankPricePolicy:'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET'}:{header:{sourceKey:'transfer',nativeId:readerId(2)},sku:{sourceKey:'sku',nativeId:readerId(3)}};};
  const reader=await openAuthorizedV3Reader({...options,resolveNativeBinding});t.after(()=>reader.close());
  await assert.rejects(reader.authorize({importReady:true,referenceTargetsValid:true}),/SELECTION_NOT_AUTHORIZED/);
  assert.equal(reader.report.selectedRows,2);assert.equal(reader.report.noSql,true);assert.equal(reader.report.importReady,false);
  assert.equal(reader.report.nativeBindingsVerified,false);assert.ok(reader.report.spoolBytes>0);assert.match(reader.report.spoolSha256,/^[a-f0-9]{64}$/);
  let seen=0,lastChunk;
  for await(const record of reader.rows()){
    seen++;const binding=await resolveNativeBinding({entity:record.source.entityType});
    const input={batchId:options.batchId,fixedSourceNamespace:options.fixedSourceNamespace,selection:record.selection,rows:[{source:record.source,...binding}]};
    const chunk=record.source.entityType==='PRODUCT'?prepareProductEvidenceChunk(input):prepareV3HistoryChunk(input);
    await reader.authorize(chunk);lastChunk=chunk;
    const changed=structuredClone(chunk);changed.rows[0].source.rawFields['来源编号']='unapproved';await assert.rejects(reader.authorize(changed));
    const differentSource=structuredClone(input);differentSource.rows[0].source.fileRef='different-original.xlsx';
    const wellFormedButNotVerified=record.source.entityType==='PRODUCT'?prepareProductEvidenceChunk(differentSource):prepareV3HistoryChunk(differentSource);
    await assert.rejects(reader.authorize(wellFormedButNotVerified),/SOURCE_NOT_AUTHORIZED/);
    if(record.source.entityType==='TRANSFER_LINE'){
      const other=structuredClone(input);other.rows[0].sku.nativeId=readerId(9);await assert.rejects(reader.authorize(prepareV3HistoryChunk(other)),/BINDING_MISMATCH/);
      assert.equal(record.source.rawFields['SKU来源编号'],'old-001');assert.equal(record.source.normalizedFields['SKU来源编号'],'sku');
    }else assert.equal(record.source.rowSha256,hash(JSON.stringify({entity:'PRODUCT',sourceId:'product',file:'synthetic-source.xlsx',sheet:'PRODUCT',row:2,sourceSha256:'d'.repeat(64),data:record.source.rawFields})+'\r'));
  }
  assert.equal(seen,2);pause=true;const pending=reader.authorize(lastChunk);await entered;await reader.close();resume();await assert.rejects(pending,/CLOSED/);await assert.rejects(async()=>{for await(const _ of reader.rows()){}},/CLOSED/);
});
test('reader refuses unpinned/self-signed approval, missing native resolver and forged aggregate authorization',async t=>{
  const options=await readerFixture(t);
  await assert.rejects(openAuthorizedV3Reader({...options,trustedApprovalSha256:undefined}),/PIN_REQUIRED/);
  await assert.rejects(openAuthorizedV3Reader({...options,spoolParent:options.base}),/SPOOL_MUST_BE_OUTSIDE/);
  await assert.rejects(openAuthorizedV3Reader({...options,trustedApprovalSha256:'e'.repeat(64)}),/PIN_MISMATCH/);
  await assert.rejects(openAuthorizedV3Reader({...options,v3Approval:join(options.amendment,'approval.json')}),/EXTERNAL/);
  const reader=await openAuthorizedV3Reader(options);t.after(()=>reader.close());
  await assert.rejects(reader.authorize({importReady:true,referenceTargetsValid:true}),/RESOLVER_REQUIRED/);
});
test('reader rejects self-consistently rehashed wrong raw alias, changed snapshot text and duplicate original identity',async t=>{
  for(const mutate of [rows=>{rows[1].data['SKU来源编号']='unapproved';},rows=>{rows[1].data['原使用条码']='changed';},rows=>{rows.push(rows[1]);},rows=>{rows[1].sheet='x'.repeat(65537);}]){
    const options=await readerFixture(t,mutate);await assert.rejects(openAuthorizedV3Reader(options),/READER_/);assert.deepEqual(await readdir(options.spoolParent),[]);
  }
});
