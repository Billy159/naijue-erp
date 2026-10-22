import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {watch,existsSync,renameSync,writeFileSync,symlinkSync} from 'node:fs';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
const hash=x=>createHash('sha256').update(x).digest('hex');
const run=promisify(execFile);
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
const headerId=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const csv=(columns,rows)=>columns.join(',')+'\n'+rows.map(row=>columns.map(c=>quote(row[c]??'')).join(',')).join('\n')+'\n';
const makeRow=(entity,override)=>Object.assign(Object.fromEntries(IMPORT_V2_TABLES.find(t=>t.entity===entity).columns.map(c=>[c.name,c.required?(c.logicalType==='INTEGER'?'1':c.logicalType==='MONEY'?'1.00':'synthetic'):'' ])),override);
async function makeWorkbook(path,entity,rows) {
  const dataFile=path+'.json';await writeFile(dataFile,JSON.stringify({entity,rows}));
  await run('python3',['-c',String.raw`
import json,sys,zipfile
from xml.sax.saxutils import escape
p=json.load(open(sys.argv[1])); rows=p['rows']; entity=p['entity']
ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'; rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships'; pkg='http://schemas.openxmlformats.org/package/2006/relationships'
sheet='13历史销货单头' if entity=='SALES_HEADER' else '16历史调拨单头'
headers=list(rows[0])
def col(i):
 s=''
 while i: i,n=divmod(i-1,26);s=chr(65+n)+s
 return s
def cell(ref,v,numeric=False):
 if numeric and v: return '<c r="'+ref+'" t="n" s="1"><v>'+escape(v)+'</v></c>'
 return '<c r="'+ref+'" t="inlineStr"><is><t>'+escape(v)+'</t></is></c>'
body='<row r="1">'+''.join(cell(col(i+1)+'1',h) for i,h in enumerate(headers))+'</row>'
for index,row in enumerate(rows,2): body+='<row r="'+str(index)+'">'+''.join(cell(col(i+1)+str(index),row[h],h in ('业务日期','原创建时间','原修改时间','原审核时间')) for i,h in enumerate(headers))+'</row>'
parts={'xl/workbook.xml':f'<workbook xmlns="{ns}" xmlns:r="{rel}"><workbookPr date1904="false"/><sheets><sheet name="{sheet}" sheetId="1" r:id="sheet1"/></sheets></workbook>',
'xl/_rels/workbook.xml.rels':f'<Relationships xmlns="{pkg}"><Relationship Id="sheet1" Type="{rel}/worksheet" Target="worksheets/header.xml"/><Relationship Id="styles" Type="{rel}/styles" Target="styles.xml"/></Relationships>',
'xl/styles.xml':f'<styleSheet xmlns="{ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>',
'xl/worksheets/header.xml':f'<worksheet xmlns="{ns}"><sheetData>{body}</sheetData></worksheet>'}
with zipfile.ZipFile(sys.argv[2],'w',compression=zipfile.ZIP_DEFLATED) as z:
 for name,value in parts.items(): z.writestr(name,value)
`,dataFile,path]);await rm(dataFile);
}
export async function headerReaderFixture(t) {
  const sourceRoot=await mkdtemp(join(tmpdir(),'synthetic-header-original-'));t.after(()=>rm(sourceRoot,{recursive:true,force:true}));
  const saleFile='历史销货.synthetic.xlsx',transferFile='历史调拨.synthetic.xlsx', productFile='catalogue.json';
  const originals=[],canonical=[];
  for(let i=0;i<32;i++) {
    const row=makeRow('SALES_HEADER',{'来源编号':`synthetic-sale-${i}`,'原单号':`000${i}`,'所属厅来源编号':'hall','客户来源编号':'historical-customer','仓库来源编号':'warehouse','营业员来源编号':'',
      '单据类型':'销售','原审核状态':'未审核','业务日期':'45614','原创建时间':'45614.5','原修改时间':'','原审核时间':'',
      '优惠前金额':'1.00','整单优惠':'0','应结金额':'1.00','原创建厅编号':'','创建厅归属来源':'UNKNOWN','创建厅归属原因':'UNKNOWN_NO_SALESPERSON_ID'});
    canonical.push(row);originals.push({...row,'优惠前金额':'1.00000000000001','原创建厅编号':'uploaded-old-hall'});
  }
  const transfer=makeRow('TRANSFER_HEADER',{'来源编号':'synthetic-transfer','原单号':'000-transfer','调出仓来源编号':'warehouse','调入仓来源编号':'warehouse-two','原制单账号编号':'',
    '原审核状态':'未审核','业务日期':'45614','原创建时间':'45614.5','原修改时间':'','原审核时间':'','原创建厅编号':'','创建厅归属来源':'UNKNOWN','创建厅归属原因':'UNKNOWN_ORIGINAL_CREATOR_UNMATCHED'});
  const rawTransfer={...transfer,'原创建厅编号':'uploaded-old-hall'};
  await makeWorkbook(join(sourceRoot,saleFile),'SALES_HEADER',originals);await makeWorkbook(join(sourceRoot,transferFile),'TRANSFER_HEADER',[rawTransfer]);await writeFile(join(sourceRoot,productFile),'{}');
  const sourceHashes=Object.fromEntries(await Promise.all([saleFile,transferFile,productFile].map(async f=>[f,hash(await readFile(join(sourceRoot,f)))])));
  let approvedMoneyOverlaySha256;
  const bundle=await v3Fixture(t,'valid',files=>{
    files.set('dictionaries/historical-customers.json',JSON.stringify([{sourceKey:'historical-customer',enabled:false,historicalOnly:true,visibleInCurrentCustomerList:false}]));
    const warehouseTable=IMPORT_V2_TABLES.find(t=>t.entity==='WAREHOUSE'), other=makeRow('WAREHOUSE',{'来源编号':'warehouse-two','所属厅来源编号':'hall'});
    files.set(warehouseTable.file,files.get(warehouseTable.file)+warehouseTable.columns.map(c=>quote(other[c.name])).join(',')+'\n');
    const audit='audit/independent-verification/all-53-warehouses.csv';files.set(audit,files.get(audit)+'warehouse-two,synthetic,0,0,0\n');
    for(const [entity,rows] of [['SALES_HEADER',canonical],['TRANSFER_HEADER',[transfer]]]){const table=IMPORT_V2_TABLES.find(t=>t.entity===entity);files.set(table.file,csv(table.columns.map(c=>c.name),rows));}
    const snapshots=[{file:productFile,sheet:'products',row:2,entity:'PRODUCT',sourceId:'product',sourceSha256:sourceHashes[productFile],data:{'来源编号':'product'}}];
    const dictRows={HALL:makeRow('HALL',{'来源编号':'hall'}),CUSTOMER:makeRow('CUSTOMER',{'来源编号':'customer','原编码':'000-client','名称':'客户'}),STAFF:makeRow('STAFF',{'来源编号':'staff','姓名':'员工','所属厅来源编号':'hall','角色':'legacy','任职状态':'legacy'})};
    for(const [entity,row]of Object.entries(dictRows)){const table=IMPORT_V2_TABLES.find(t=>t.entity===entity);files.set(table.file,csv(table.columns.map(c=>c.name),[row]));snapshots.push({file:productFile,sheet:'catalogue-'+entity,row:2,entity,sourceId:row['来源编号'],sourceSha256:sourceHashes[productFile],data:row});}
    for(const [entity,sourceFile,rows] of [['SALES_HEADER',saleFile,originals],['TRANSFER_HEADER',transferFile,[rawTransfer]]])rows.forEach((row,i)=>snapshots.push({file:sourceFile,sheet:entity==='SALES_HEADER'?'13历史销货单头':'16历史调拨单头',row:i+2,entity,sourceId:row['来源编号'],sourceSha256:sourceHashes[sourceFile],data:row}));
    files.set('snapshots/all-business-source-rows.jsonl',snapshots.map(r=>JSON.stringify(r)).join('\n')+'\n');
    const moneyColumns=['file','sheet','row','sourceId','entity','documentSourceId','field','rawValue','excessFromNearestCent','candidateExactCentValue','sourceFileSha256','decision','provenance','toleranceCurrencyUnits','corroboratingDocumentSourceId'];
    const approvals=originals.map((row,i)=>Object.fromEntries(moneyColumns.map((c,j)=>[c,[saleFile,'13历史销货单头',String(i+2),row['来源编号'],'SALES_HEADER',row['来源编号'],'优惠前金额','1.00000000000001','1E-14','1.00',sourceHashes[saleFile],'CORROBORATED_TAIL_ONLY_CANDIDATE','MIGRATION_DERIVED_CENT_NORMALIZATION','1E-8',row['来源编号']][j]])));
    const moneyCsv=csv(moneyColumns,approvals);files.set('provenance/approved-money-tail-overlay.csv',moneyCsv);approvedMoneyOverlaySha256=hash(moneyCsv);
    const overlayColumns=['file','sheet','row','sourceId','documentNumber','personField','personId','matchedStaffId','currentEmployeeHall','uploadedWarehouseDerivedHall','candidateCreatorHall','provenance','reason','comparison','rawCreatorDisplay','rawPeopleSupportRow'];
    const overlays=snapshots.filter(r=>['SALES_HEADER','TRANSFER_HEADER'].includes(r.entity)).map(r=>({file:r.file,sheet:r.sheet,row:String(r.row),sourceId:r.sourceId,documentNumber:r.data['原单号'],personField:r.entity==='SALES_HEADER'?'营业员来源编号':'原制单账号编号',personId:'',matchedStaffId:'',currentEmployeeHall:'',uploadedWarehouseDerivedHall:'uploaded-old-hall',candidateCreatorHall:'',provenance:'UNKNOWN',reason:r.data['创建厅归属原因'],comparison:'clear_to_unknown',rawCreatorDisplay:'',rawPeopleSupportRow:String(r.row)}));
    files.set('provenance/creator-hall-approved-overlay.csv',csv(overlayColumns,overlays));
  },sourceHashes);
  const spoolParent=await mkdtemp(join(tmpdir(),'synthetic-header-spool-'));t.after(()=>rm(spoolParent,{recursive:true,force:true}));
  return {...bundle,sourceRoot,spoolParent,batchId:headerId(1),fixedSourceNamespace:'synthetic-header',v3Amendment:bundle.amendment,v3Approval:bundle.approval,trustedApprovalSha256:hash(await readFile(bundle.approval)),approvedMoneyOverlaySha256};
}
const bindingsFor=({entity})=>entity==='SALES_HEADER'?{
  '所属厅来源编号':{sourceKey:'hall',nativeId:headerId(2)},'客户来源编号':{sourceKey:'historical-customer',nativeId:headerId(3)},'仓库来源编号':{sourceKey:'warehouse',nativeId:headerId(4)}
}:{'调出仓来源编号':{sourceKey:'warehouse',nativeId:headerId(4)},'调入仓来源编号':{sourceKey:'warehouse-two',nativeId:headerId(5)}};
test('header reader regenerates original OOXML, authenticates all 32 corrections and creator context before typed authorization',async t=>{
  const {openAuthorizedV3HeaderReader}=await import('./authorized-header-reader.mjs');
  const {prepareV3HistoryHeaderChunk}=await import('../../packages/application/src/import-v3-history-header-staging.ts');
  const options=await headerReaderFixture(t);let paused=false,resume,entered;const resolverEntered=new Promise(resolve=>{entered=resolve;});
  const resolveNativeBinding=async query=>{if(paused){entered();await new Promise(resolve=>{resume=resolve;});}return bindingsFor(query);};
  const reader=await openAuthorizedV3HeaderReader({...options,resolveNativeBinding});t.after(()=>reader.close());
  assert.equal(reader.report.selectedRows,33);assert.equal(reader.report.originalCellEvidenceRegenerated,true);assert.equal(reader.report.numericCellEvidence,66);
  assert.equal(reader.report.preflight.originalSourceMoneyVerification.approvedCellsMatched,32);assert.equal(reader.report.preflight.originalSourceMoneyVerification.unapprovedMoneyRewrites,0);
  assert.equal(reader.report.nativeBindingsVerified,false);assert.equal(reader.report.importReady,false);assert.equal(reader.report.noSql,true);
  let seen=0,saleInput,lastChunk;
  for await(const record of reader.rows()){
    const input={batchId:options.batchId,fixedSourceNamespace:options.fixedSourceNamespace,...record,bindings:bindingsFor({entity:record.source.entityType})};
    const chunk=prepareV3HistoryHeaderChunk([input]);await reader.authorize(chunk);lastChunk=chunk;seen++;
    const header=chunk.rows[0].prepared.header;assert.ok(header.businessDate);assert.equal(header.createdInstant,null);assert.equal(header.createdHallId,null);
    if(record.source.entityType==='SALES_HEADER'){
      saleInput??=input;assert.equal(record.source.rawFields['优惠前金额'],'1.00000000000001');assert.equal(header.grossAmount,'1.00');
      assert.equal(record.moneyApprovals.size,32);assert.equal(chunk.rows[0].prepared.fieldProvenance.fields['优惠前金额'].origin,'MIGRATION_DERIVED');
    }
  }
  assert.equal(seen,33);
  const returnedApproval=[...saleInput.moneyApprovals.values()][0],originalCent=returnedApproval.exactCentValue;
  returnedApproval.exactCentValue='999.00';
  await assert.rejects(reader.authorize(prepareV3HistoryHeaderChunk([saleInput])),/CONTEXT_NOT_AUTHORIZED/);
  returnedApproval.exactCentValue=originalCent;await reader.authorize(prepareV3HistoryHeaderChunk([saleInput]));
  for(const change of [
    i=>{i.source.rawFields['备注']='changed';i.source.normalizedFields['备注']='changed';},
    i=>{i.selection.csvSha256='e'.repeat(64);},
    i=>{i.temporalEvidence['业务日期'].styleIndex+=1;},
    i=>{i.creatorHallOverlay.evidenceRef='unapproved-overlay';},
    i=>{i.moneyApprovals.set('unapproved-extra',[...i.moneyApprovals.values()][0]);},
    i=>{[...i.moneyApprovals.values()][0].exactCentValue='999.00';},
    i=>{i.bindings['客户来源编号'].nativeId=headerId(99);},
    i=>{i.fixedSourceNamespace='unapproved-namespace';},
  ]){const input=structuredClone(saleInput);change(input);const chunk=prepareV3HistoryHeaderChunk([input]);await assert.rejects(reader.authorize(chunk));}
  await assert.rejects(reader.authorize({importReady:true,referenceTargetsValid:true}));
  paused=true;const pending=reader.authorize(lastChunk);await resolverEntered;await reader.close();resume();await assert.rejects(pending,/CLOSED/);
  assert.deepEqual(await readdir(options.spoolParent),[]);
});
test('header reader rejects missing independent pins, package-local authority, original-workbook corruption and cleans private outputs',async t=>{
  const {openAuthorizedV3HeaderReader}=await import('./authorized-header-reader.mjs');
  const options=await headerReaderFixture(t);
  await assert.rejects(openAuthorizedV3HeaderReader({...options,trustedApprovalSha256:undefined}),/PINS_REQUIRED/);
  await assert.rejects(openAuthorizedV3HeaderReader({...options,approvedMoneyOverlaySha256:undefined}),/PINS_REQUIRED/);
  await assert.rejects(openAuthorizedV3HeaderReader({...options,trustedApprovalSha256:'e'.repeat(64)}),/PIN_MISMATCH/);
  await assert.rejects(openAuthorizedV3HeaderReader({...options,v3Approval:join(options.amendment,'approval.json')}));
  assert.deepEqual(await readdir(options.spoolParent),[]);
  await writeFile(join(options.sourceRoot,'历史销货.synthetic.xlsx'),Buffer.from('not the approved workbook'));
  await assert.rejects(openAuthorizedV3HeaderReader(options));assert.deepEqual(await readdir(options.spoolParent),[]);
});

const referenceBindingFor=({entity})=>{
  const n=entity==='HALL'?{id:headerId(20),name:'synthetic',default_customer_id:null,default_sales_warehouse_id:null,enabled:true,version:1}:
    entity==='CUSTOMER'?{id:headerId(21),code:'000-client',name:'客户',enabled:true,version:1,created_at:null,updated_at:null}:
    {id:headerId(22),name:'员工',hall_id:headerId(20),role:'SALES',contact:null,employment_status:'ACTIVE',version:1};
  return {nativeSnapshot:n,bindings:entity==='STAFF'?{'所属厅来源编号':{sourceKey:'hall',nativeId:headerId(20)}}:{},
    enumMappings:entity==='STAFF'?{'角色':{raw:'legacy',native:'SALES',evidenceRef:'reviewed-enums'},'任职状态':{raw:'legacy',native:'ACTIVE',evidenceRef:'reviewed-enums'}}:{'状态':{raw:'synthetic',native:true,evidenceRef:'reviewed-enums'}}};
};
test('opt-in reference source authorization joins exact dictionary JSONL/CSV and rederives reviewed native snapshots',async t=>{
  const {openAuthorizedV3HeaderReader}=await import('./authorized-header-reader.mjs');
  const {prepareV3HistoryHeaderNativeReferenceChunk}=await import('../../packages/application/src/import-v3-history-header-native-reference.ts');
  const options=await headerReaderFixture(t);
  const reader=await openAuthorizedV3HeaderReader({...options,includeNativeReferenceSources:true,resolveNativeReferenceBinding:async q=>referenceBindingFor(q)});t.after(()=>reader.close());
  assert.equal(reader.report.nativeReferenceSourcesIncluded,true);assert.equal(reader.report.nativeReferenceRows,3);assert.equal(reader.report.selectedRows,33);
  let seen=0,last;
  for await(const record of reader.referenceRows()){
    const input={batchId:options.batchId,fixedSourceNamespace:options.fixedSourceNamespace,...record,...referenceBindingFor({entity:record.source.entityType})};
    const chunk=prepareV3HistoryHeaderNativeReferenceChunk([input]);await reader.authorizeReferences(chunk);seen++;last=chunk;
    const altered=structuredClone(input);altered.nativeSnapshot.id=headerId(99);await assert.rejects(reader.authorizeReferences(prepareV3HistoryHeaderNativeReferenceChunk([altered])),/BINDING_MISMATCH/);
    const rawChanged=structuredClone(input),nameField=input.source.entityType==='HALL'?'厅名称':input.source.entityType==='CUSTOMER'?'名称':'姓名';
    rawChanged.source.rawFields[nameField]='unapproved';rawChanged.source.normalizedFields[nameField]='unapproved';rawChanged.nativeSnapshot.name='unapproved';
    await assert.rejects(reader.authorizeReferences(prepareV3HistoryHeaderNativeReferenceChunk([rawChanged])),/SOURCE_NOT_AUTHORIZED/);
    const changedEnum=structuredClone(input);Object.values(changedEnum.enumMappings)[0].evidenceRef='unapproved';
    await assert.rejects(reader.authorizeReferences(prepareV3HistoryHeaderNativeReferenceChunk([changedEnum])),/BINDING_MISMATCH/);
  }
  assert.equal(seen,3);let headers=0;for await(const _of of reader.rows())headers++;assert.equal(headers,33);
  await reader.close();await assert.rejects(reader.authorizeReferences(last),/CLOSED/);assert.deepEqual(await readdir(options.spoolParent),[]);
});
test('header reader smaller evidence cap stops the fixed OOXML extractor before any row or native resolver',async t=>{
  const {openAuthorizedV3HeaderReader}=await import('./authorized-header-reader.mjs');const options=await headerReaderFixture(t);
  let callbacks=0,opened;t.after(async()=>{if(opened)await opened.close();});
  await assert.rejects(async()=>{opened=await openAuthorizedV3HeaderReader({...options,maxEvidenceSpoolBytes:1,resolveNativeBinding:async q=>{callbacks++;return bindingsFor(q);}});},/CELL_EXTRACTION_FAILED/);
  assert.equal(callbacks,0);assert.deepEqual(await readdir(options.spoolParent),[]);
});
test('header reader smaller selected spool cap refuses before yield or binding and awaits its owned cleanup',async t=>{
  const {openAuthorizedV3HeaderReader}=await import('./authorized-header-reader.mjs');const options=await headerReaderFixture(t);
  let callbacks=0,opened;t.after(async()=>{if(opened)await opened.close();});
  await assert.rejects(async()=>{opened=await openAuthorizedV3HeaderReader({...options,maxEvidenceSpoolBytes:16*1024*1024,maxSpoolBytes:1,resolveNativeBinding:async q=>{callbacks++;return bindingsFor(q);}});},/HEADER_READER_SPOOL_LIMIT/);
  assert.equal(callbacks,0);assert.deepEqual(await readdir(options.spoolParent),[]);
});
test('header reader captures both smaller bounds before await, rejects invalid own-data without getter execution and retains defaults',async t=>{
  const {openAuthorizedV3HeaderReader}=await import('./authorized-header-reader.mjs');const options=await headerReaderFixture(t);
  for(const key of ['maxEvidenceSpoolBytes','maxSpoolBytes']){
    for(const value of [0,-1,1.5,NaN,Infinity,512*1024*1024+1,'192',undefined])await assert.rejects(openAuthorizedV3HeaderReader({...options,[key]:value}),/BOUND/);
    let getters=0;await assert.rejects(openAuthorizedV3HeaderReader(Object.defineProperty({...options},key,{enumerable:true,get(){getters++;return 16*1024*1024;}})),/OPTIONS/);assert.equal(getters,0);
  }
  await assert.rejects(openAuthorizedV3HeaderReader({...options,[Symbol('extra')]:true}),/OPTIONS/);assert.deepEqual(await readdir(options.spoolParent),[]);
  const captured={...options,maxEvidenceSpoolBytes:16*1024*1024,maxSpoolBytes:16*1024*1024},pending=openAuthorizedV3HeaderReader(captured);captured.maxEvidenceSpoolBytes=1;captured.maxSpoolBytes=1;
  const bounded=await pending;try{assert.equal(bounded.report.selectedRows,33);}finally{await bounded.close();}
  const legacy=await openAuthorizedV3HeaderReader(options);try{assert.equal(legacy.report.selectedRows,33);}finally{await legacy.close();}assert.deepEqual(await readdir(options.spoolParent),[]);
});
test('complete authenticated OOXML evidence is released before selected DTO spool while every source cell and derived report remains',async t=>{
  const {openAuthorizedV3HeaderReader}=await import('./authorized-header-reader.mjs');const options=await headerReaderFixture(t),reader=await openAuthorizedV3HeaderReader({...options,maxEvidenceSpoolBytes:16*1024*1024,maxSpoolBytes:16*1024*1024});
  try{
    const dirs=await readdir(options.spoolParent);assert.equal(dirs.length,1);const root=join(options.spoolParent,dirs[0]),nested=(await readdir(root)).find(x=>x.startsWith('history-cell-evidence-'));assert.ok(nested);
    assert.deepEqual(await readdir(join(root,nested)),['report.json']);assert.ok((await readdir(root)).includes('selected-headers.jsonl'));
    let count=0;for await(const record of reader.rows()){count++;assert.equal(record.source.fieldProvenance.history_cell_encoding_evidence.schemaVersion,'HISTORY_XLSX_CELL_EVIDENCE_V1');assert.ok(record.temporalEvidence['业务日期']);}assert.equal(count,33);
  }finally{await reader.close();}assert.deepEqual(await readdir(options.spoolParent),[]);
});
test('replacement or symlink of newly derived evidence is rejected before selected writes and never deletes an original outside the owned output',async t=>{
  const {openAuthorizedV3HeaderReader}=await import('./authorized-header-reader.mjs');
  for(const attack of ['replacement','symlink']){
    const options=await headerReaderFixture(t),sentinel=join(options.sourceRoot,'untouched-original-sentinel');await writeFile(sentinel,'ORIGINAL MUST REMAIN');
    let attacked=false,attackError,selectedWritten=false,callbacks=0,opened;
    const watcher=watch(options.spoolParent,{recursive:true},(_event,filename)=>{
      const relative=String(filename??'');if(relative.endsWith('selected-headers.jsonl'))selectedWritten=true;
      if(attacked||!relative.endsWith('/evidence.jsonl')||!relative.includes('/history-cell-evidence-'))return;
      const path=join(options.spoolParent,relative);if(!existsSync(path))return;attacked=true;
      try{renameSync(path,path+'.displaced');if(attack==='symlink')symlinkSync(sentinel,path);else writeFileSync(path,'FORGED EVIDENCE\n',{mode:0o600});}catch(error){attackError=error;}
    });t.after(()=>watcher.close());t.after(async()=>{if(opened)await opened.close();});
    try{
      await assert.rejects(async()=>{opened=await openAuthorizedV3HeaderReader({...options,resolveNativeBinding:async q=>{callbacks++;return bindingsFor(q);}});});
      assert.equal(attackError,undefined);assert.equal(attacked,true,'actual new evidence pathname was attacked; no silent untested negative');assert.equal(selectedWritten,false);assert.equal(callbacks,0);
      assert.deepEqual(await readdir(options.spoolParent),[]);assert.equal(await readFile(sentinel,'utf8'),'ORIGINAL MUST REMAIN');
    }finally{watcher.close();}
  }
});
