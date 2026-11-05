#!/usr/bin/env node
// Read-only runner; stdout contains aggregate results, never private row identities.
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { parseV2Csv, v2Integer, v2Cents, v2AliasIndex, v2HistoricalCustomerIds, v2HistoricalCustomerReference, parseV2JsonLines, v2MoneyApprovalSet, v2ApprovedCents, v2CreatorHallDecision, v3BarcodeExclusion } from '../../packages/application/src/import-v2.ts';
const fail = code => { throw Error(code); };
const eq = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const sum = (map,key,n) => map.set(key,(map.get(key) ?? 0n)+n);
export async function preflightV2(argument, options={}) {
  if ((options.v3Amendment !== undefined)!==(options.v3Approval !== undefined)) fail('V3_EXPLICIT_APPROVAL_REQUIRED');
  const root = await realpath(resolve(argument));
  async function safePath(relative) {
    if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.startsWith('/') || relative.split('/').some(p=>!p || p==='.' || p==='..')) fail('UNSAFE_MANIFEST_PATH');
    let path=root;
    for (const part of relative.split('/')) { path=join(path,part); if ((await lstat(path)).isSymbolicLink()) fail('SYMLINK_NOT_ALLOWED'); }
    const stat=await lstat(path); if (!stat.isFile() || stat.size>512*1024*1024) fail('FILE_TYPE_OR_SIZE'); return path;
  }
  async function small(relative) { const path=await safePath(relative); if ((await lstat(path)).size>4*1024*1024) fail('METADATA_SIZE'); return readFile(path); }
  const manifestBytes=await small('manifest.json');
  const seal=(await small('manifest.sha256')).toString('utf8').trim();
  if (!/^[a-f0-9]{64}(?:\s+\*?manifest\.json)?$/.test(seal) || seal.slice(0,64)!==createHash('sha256').update(manifestBytes).digest('hex')) fail('MANIFEST_HASH');
  const manifest=JSON.parse(manifestBytes.toString('utf8'));
  if (!Array.isArray(manifest.payloadFiles) || manifest.payloadFiles.length>1024 || manifest.importReady!==false) fail('MANIFEST_CONTRACT');
  const payload=new Map(); let total=0;
  for (const item of manifest.payloadFiles) {
    if (payload.has(item.file) || !Number.isSafeInteger(item.bytes) || item.bytes<0 || item.bytes>512*1024*1024 || !/^[a-f0-9]{64}$/.test(item.sha256)) fail('MANIFEST_ENTRY');
    total+=item.bytes; if (total>2*1024*1024*1024) fail('BUNDLE_SIZE'); await safePath(item.file); payload.set(item.file,item);
  }
  async function* bytes(relative) {
    const expected=payload.get(relative); if (!expected) fail('UNMANIFESTED_INPUT');
    const hash=createHash('sha256'); let count=0;
    for await (const chunk of createReadStream(await safePath(relative),{highWaterMark:65536})) { count+=chunk.length; if (count>expected.bytes) fail('FILE_SIZE_CHANGED'); hash.update(chunk); yield chunk; }
    if (count!==expected.bytes || hash.digest('hex')!==expected.sha256) fail('PAYLOAD_HASH_OR_SIZE');
  }
  async function* strings(relative) { const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}); for await (const chunk of bytes(relative)) yield decoder.decode(chunk,{stream:true}); yield decoder.decode(); }
  let totalRecords=0;
  async function* records(relative,columns,exact=true) {
    let header;
    for await (const cells of parseV2Csv(strings(relative))) {
      if (!header) { header=cells; if (new Set(header).size!==header.length || (columns && (exact ? !eq(header,columns) : columns.some(c=>!header.includes(c))))) fail('CSV_HEADER'); continue; }
      if (cells.length!==header.length) fail('CSV_ROW_WIDTH'); if (++totalRecords>1_000_000) fail('AGGREGATE_RECORD_LIMIT'); yield Object.fromEntries(header.map((name,i)=>[name,cells[i]]));
    }
    if (!header) fail('CSV_EMPTY');
  }
  for (const path of payload.keys()) for await (const _ of bytes(path)) { /* includes evidence, bounded chunks */ }
  if (manifest.payloadBytes!==total) fail('MANIFEST_TOTAL_BYTES');
  let schemaText=''; for await (const text of strings('schema/normalized-business-columns.json')) { schemaText+=text; if (schemaText.length>4*1024*1024) fail('METADATA_SIZE'); }
  const schema=JSON.parse(schemaText).map(t=>({entity:t.entity,file:t.file,columns:t.columns.map(c=>({name:c.name,logicalType:c.logicalType,required:c.required??false}))}));
  if (!eq(schema,IMPORT_V2_TABLES)) fail('SCHEMA_CONTRACT');
  const ids=new Map(), counts={}, canonical=new Map(), baseline=new Map(), references=new Map(); let referenceChecks=0;
  let temporalPolicyRequired=0,moneyCells=0,nullCells=0; const requiredEmptyByField={}; let productBarcodes=0,skuBarcodes=0;
  const referenceFields={'商品来源编号':'PRODUCT','SKU来源编号':'SKU','仓库来源编号':'WAREHOUSE','所属厅来源编号':'HALL','厅来源编号':'HALL','默认客户来源编号':'CUSTOMER','默认销货仓来源编号':'WAREHOUSE','供应商来源编号':'SUPPLIER','收款方式来源编号':'PAYMENT_METHOD','账户来源编号':'PAYMENT_ACCOUNT','客户来源编号':'CUSTOMER','营业员来源编号':'STAFF','调出仓来源编号':'WAREHOUSE','调入仓来源编号':'WAREHOUSE','原收款方式来源编号':'PAYMENT_METHOD','原创建厅编号':'HALL'};
  const barcodes=new Set(),coordinates=new Set(),lineKeys=new Set(),stockKeys=new Set();
  for (const table of IMPORT_V2_TABLES) {
    const seen=new Set(); ids.set(table.entity,seen); counts[table.entity]=0;
    for await (const row of records(table.file,table.columns.map(c=>c.name))) {
      counts[table.entity]++;
      const id=table.entity==='PAYMENT_ACCOUNT_HALL'?JSON.stringify([row['账户来源编号'],row['厅来源编号']]):row[table.entity==='ISSUE'?'问题编号':'来源编号'];
      if (!id || seen.has(id)) fail('DUPLICATE_OR_EMPTY_ID'); seen.add(id);
      for (const col of table.columns) {
        const raw=row[col.name]; if (raw==='') { nullCells++; if (col.required) { const key=table.entity+'.'+col.name; requiredEmptyByField[key]=(requiredEmptyByField[key]??0)+1; } continue; }
        if (col.logicalType==='INTEGER') v2Integer(raw);
        if (col.logicalType==='MONEY') { v2Cents(raw); moneyCells++; }
        if (col.logicalType==='DATE' || col.logicalType==='DATETIME') temporalPolicyRequired++;
        if (col.logicalType==='JSON_ARRAY_TEXT') { const value=JSON.parse(raw); if (!Array.isArray(value) || value.some(x=>typeof x!=='string')) fail('JSON_ARRAY_TEXT'); }
        const target=col.name==='单据来源编号'?(table.entity==='TRANSFER_LINE'?'TRANSFER_HEADER':'SALES_HEADER'):referenceFields[col.name];
        if (target) { const field=table.entity+'.'+col.name+'->'+target; if (!references.has(field)) references.set(field,{target,values:new Map()}); const values=references.get(field).values; values.set(raw,(values.get(raw)??0)+1); if (++referenceChecks>4_000_000) fail('REFERENCE_LIMIT'); }
      }
      if (table.entity==='SKU') { const coordinate={product:row['商品来源编号'],color:row['颜色编码'],fit:row['版型编码'],size:row['新尺码字典ID']}; const key=JSON.stringify(coordinate); if (coordinates.has(key)) fail('DUPLICATE_SKU_COORDINATE'); coordinates.add(key); canonical.set(id,coordinate); }
      if (table.entity==='BARCODE') {
        if (row['绑定范围']==='PRODUCT') productBarcodes++; else if (row['绑定范围']==='SKU') skuBarcodes++;
        if (barcodes.has(row['条码'])) fail('DUPLICATE_BARCODE'); barcodes.add(row['条码']);
        if (!((row['绑定范围']==='SKU' && row['SKU来源编号']!=='' && canonical.get(row['SKU来源编号'])?.product===row['商品来源编号']) || (row['绑定范围']==='PRODUCT' && row['SKU来源编号']==='' && row['商品来源编号']!==''))) fail('BARCODE_SCOPE');
      }
      if (['SALES_LINE','TRANSFER_LINE','SETTLEMENT'].includes(table.entity)) { const n=v2Integer(row[table.entity==='SETTLEMENT'?'原收退行号':'原行号']); const key=JSON.stringify([table.entity,row['单据来源编号'],n.toString()]); if (n<=0n || lineKeys.has(key)) fail('LINE_IDENTITY'); lineKeys.add(key); }
      if (table.entity==='INVENTORY_BASELINE') { const key=JSON.stringify([row['仓库来源编号'],row['SKU来源编号']]); if (stockKeys.has(key)) fail('DUPLICATE_BASELINE'); stockKeys.add(key); baseline.set(id,{warehouse:row['仓库来源编号'],sku:row['SKU来源编号'],quantity:v2Integer(row['核准库存数量']),units:JSON.parse(row['来源单位集合快照']),contributors:v2Integer(row['合并输入库存行数'])}); }
    }
  }
  let historicalText=''; for await (const text of strings('dictionaries/historical-customers.json')) { historicalText+=text; if (historicalText.length>4*1024*1024) fail('METADATA_SIZE'); }
  const historicalCustomers=v2HistoricalCustomerIds(JSON.parse(historicalText)); let supplementalHistoricalCustomerReferences=0;
  const missingReferencesByField={}; for (const [field,{target,values}] of references) for (const [id,count] of values) if (!ids.get(target)?.has(id)) { if (v2HistoricalCustomerReference(field,id,historicalCustomers)) supplementalHistoricalCustomerReferences+=count; else missingReferencesByField[field]=(missingReferencesByField[field]??0)+count; }
  const aliases=[];
  for await (const row of records('mappings/old-to-canonical-sku-15121.csv',['oldSourceSkuId','canonicalSourceSkuId','productSourceId','colorCodeIdentity','fitCode','newSizeDictionaryId'],false)) aliases.push({oldId:row.oldSourceSkuId,canonicalId:row.canonicalSourceSkuId,coordinate:{product:row.productSourceId,color:row.colorCodeIdentity,fit:row.fitCode,size:row.newSizeDictionaryId}});
  const aliasIndex=v2AliasIndex(canonical,aliases);
  const contributors=new Set(),groupSums=new Map(),groupCounts=new Map(),groupUnits=new Map(),unitSums=new Map(),productSums=new Map(),warehouseSums=new Map(),warehouses=new Set();
  for await (const row of records('mappings/stock-contributor-lineage-38314.csv',['oldStockSourceId','canonicalStockRowSourceId','warehouseSourceId','oldSkuSourceId','canonicalSkuSourceId','productSourceId','signedQuantity','sourceUnit'],false)) {
    if (!row.oldStockSourceId || contributors.has(row.oldStockSourceId)) fail('CONTRIBUTOR_IDENTITY'); contributors.add(row.oldStockSourceId);
    const target=baseline.get(row.canonicalStockRowSourceId);
    if (!target || target.warehouse!==row.warehouseSourceId || target.sku!==row.canonicalSkuSourceId || aliasIndex.get(row.oldSkuSourceId)!==target.sku || canonical.get(target.sku)?.product!==row.productSourceId) fail('CONTRIBUTOR_TARGET');
    const n=v2Integer(row.signedQuantity); sum(groupSums,row.canonicalStockRowSourceId,n); sum(groupCounts,row.canonicalStockRowSourceId,1n);
    if (!groupUnits.has(row.canonicalStockRowSourceId)) groupUnits.set(row.canonicalStockRowSourceId,new Set()); groupUnits.get(row.canonicalStockRowSourceId).add(row.sourceUnit);
    sum(warehouseSums,row.warehouseSourceId,n); sum(productSums,JSON.stringify([row.warehouseSourceId,row.productSourceId]),n); sum(unitSums,JSON.stringify([row.warehouseSourceId,row.sourceUnit]),n); warehouses.add(row.warehouseSourceId);
  }
  let stockTotal=0n;
  for (const [id,target] of baseline) { if (groupSums.get(id)!==target.quantity || groupCounts.get(id)!==target.contributors || !eq([...(groupUnits.get(id)??[])].sort(),[...target.units].sort())) fail('STOCK_GROUP_CONSERVATION'); stockTotal+=target.quantity; }
  const partitions=new Set();
  for await (const row of records('audit/independent-verification/warehouse-unit-reconciliation.csv',['warehouse','unit','before','after','difference'])) { const key=JSON.stringify([row.warehouse,row.unit]); if (partitions.has(key) || unitSums.get(key)!==v2Integer(row.before) || v2Integer(row.before)!==v2Integer(row.after) || v2Integer(row.difference)!==0n) fail('STOCK_UNIT_CONSERVATION'); partitions.add(key); }
  if (partitions.size!==unitSums.size) fail('STOCK_UNIT_COVERAGE');
  const productPartitions=new Set();
  for await (const row of records('audit/warehouse-product-stock-conservation.csv',['warehouseSourceId','productSourceId','inputSignedQuantity','outputSignedQuantity','exactDifference'])) {
    const key=JSON.stringify([row.warehouseSourceId,row.productSourceId]);
    if (productPartitions.has(key) || productSums.get(key)!==v2Integer(row.inputSignedQuantity) || v2Integer(row.inputSignedQuantity)!==v2Integer(row.outputSignedQuantity) || v2Integer(row.exactDifference)!==0n) fail('STOCK_PRODUCT_CONSERVATION'); productPartitions.add(key);
  }
  if (productPartitions.size!==productSums.size) fail('STOCK_PRODUCT_COVERAGE');
  const auditedWarehouses=new Set();
  for await (const row of records('audit/independent-verification/all-53-warehouses.csv',['warehouse','name','before','after','difference'])) {
    if (auditedWarehouses.has(row.warehouse) || !ids.get('WAREHOUSE').has(row.warehouse) || (warehouseSums.get(row.warehouse)??0n)!==v2Integer(row.before) || v2Integer(row.before)!==v2Integer(row.after) || v2Integer(row.difference)!==0n) fail('STOCK_WAREHOUSE_CONSERVATION'); auditedWarehouses.add(row.warehouse);
  }
  if (auditedWarehouses.size!==ids.get('WAREHOUSE').size) fail('STOCK_WAREHOUSE_COVERAGE');
  const report = {kind:'V2_READ_ONLY_PREFLIGHT',importReady:false,noSql:true,integrity:'MANIFEST_SELF_CONSISTENT_NOT_AUTHENTICATED',filesVerified:payload.size,wireRequiredFieldsValid:Object.keys(requiredEmptyByField).length===0,requiredEmptyByField,semanticBarcodeBindingsValid:true,barcodeBindings:{product:productBarcodes,sku:skuBarcodes},contractAdaptationRequired:Object.hasOwn(requiredEmptyByField,'BARCODE.SKU来源编号')?['SOURCE_REQUIRED_FLAG_CONFLICTS_WITH_PRODUCT_SCOPE_NULL_SKU_NOT_DATA_LOSS']:[],counts,aliases:aliasIndex.size,canonicalSkuTargets:canonical.size,referenceChecks,referenceTargetsValid:Object.keys(missingReferencesByField).length===0,missingReferencesByField,supplementalHistoricalCustomers:historicalCustomers.size,supplementalHistoricalCustomerReferences,moneyCellsExact:moneyCells,emptyCellsRetainedAsUnknown:nullCells,temporalCellsPolicyRequired:temporalPolicyRequired,stock:{contributors:contributors.size,groups:baseline.size,warehouses:ids.get('WAREHOUSE').size,warehousesWithContributors:warehouses.size,warehouseAuditCoverage:auditedWarehouses.size,unitPartitions:unitSums.size,warehouseProductPairs:productSums.size,signedTotal:stockTotal.toString()},supported:['payload path/hash/size','exact 18 business CSV schemas','literal UTF-8 strings','exact decimal cents without rounding','source identities and explicit business references; historical-only customer supplement scoped to sales history','many-to-one SKU aliases and coordinate agreement','signed stock group, all warehouses including zero-contributor warehouses, warehouse/product and warehouse/unit conservation'],missing:['trusted external manifest authentication','original-cell money overlay linkage (32-cell identity primitive tested separately)','date/time encoding, timezone and precision approval; raw values remain unchanged','dictionary references and enum domains','creator-hall provenance overlay authentication','native catalogue/history/barcode schema adapter','database writes, transactions, replay, restore, read-back and publication']};
  if (options.approvedMoneyOverlaySha256 !== undefined || options.verifyCreatorHall === true || options.v3Amendment !== undefined) {
    // Release large core indexes before the separate single-stream provenance pass.
    for (const index of [ids,canonical,baseline,references,barcodes,coordinates,lineKeys,stockKeys,aliasIndex,contributors,groupSums,groupCounts,groupUnits,unitSums,productSums,warehouseSums,warehouses,partitions,productPartitions,auditedWarehouses]) index.clear();
    aliases.length=0;
  }
  if (options.approvedMoneyOverlaySha256 !== undefined) {
    report.originalSourceMoneyVerification=await verifyOriginalMoney({records,strings,manifest,payload,approvedSha256:options.approvedMoneyOverlaySha256});
    report.supported.push('all normalized money cells compared with original snapshots; exactly 32 independently pinned approvals with full source SHA/location/identity/value agreement');
    report.missing=report.missing.filter(x=>!x.startsWith('original-cell money overlay linkage'));
  }
  if (options.verifyCreatorHall === true) {
    report.creatorHallSourceVerification=await verifyCreatorHall({records,strings,manifest});
    report.supported.push('creator hall source coordinates/person/employee-hall and approved derivation rules; UNKNOWN never falls back to a warehouse');
    report.missing=report.missing.map(x=>x==='creator-hall provenance overlay authentication'?'creator-hall auxiliary display/support row re-derivation and external artifact authentication':x);
  }
  if (options.v3Amendment !== undefined) {
    const verified = await applyV3Selection({report,records,strings,manifest,payload,baseManifestSha256:createHash('sha256').update(manifestBytes).digest('hex'),amendment:options.v3Amendment,externalApproval:options.v3Approval});
    if (options.onVerifiedV3 !== undefined) await options.onVerifiedV3({records,strings,manifest,verified,report});
  }
  return report;
}
async function verifyOriginalMoney({records,strings,manifest,payload,approvedSha256}) {
  const overlayFile='provenance/approved-money-tail-overlay.csv';
  if (typeof approvedSha256!=='string' || !/^[a-f0-9]{64}$/.test(approvedSha256) || payload.get(overlayFile)?.sha256!==approvedSha256) fail('MONEY_APPROVAL_TRUST_ANCHOR');
  if (!manifest.sourceInputSha256 || typeof manifest.sourceInputSha256!=='object' || Array.isArray(manifest.sourceInputSha256) || Object.keys(manifest.sourceInputSha256).length>1024 || Object.values(manifest.sourceInputSha256).some(hash=>typeof hash!=='string' || !/^[a-f0-9]{64}$/.test(hash))) fail('MONEY_SOURCE_HASH_CATALOGUE');
  const key=(entity,id,field)=>JSON.stringify([entity,id,field]);
  const approvals=[], approvalDetails=new Map();
  const overlayColumns=['file','sheet','row','sourceId','entity','documentSourceId','field','rawValue','excessFromNearestCent','candidateExactCentValue','sourceFileSha256','decision','provenance','toleranceCurrencyUnits','corroboratingDocumentSourceId'];
  for await (const row of records(overlayFile,overlayColumns)) {
    if (approvals.length>=32) fail('MONEY_APPROVAL_COUNT');
    const table=IMPORT_V2_TABLES.find(t=>t.entity===row.entity);
    if (!table?.columns.some(c=>c.name===row.field && c.logicalType==='MONEY') || row.decision!=='CORROBORATED_TAIL_ONLY_CANDIDATE' || row.provenance!=='MIGRATION_DERIVED_CENT_NORMALIZATION') fail('MONEY_APPROVAL_CONTRACT');
    if (!manifest.sourceInputSha256 || !Object.hasOwn(manifest.sourceInputSha256,row.file) || manifest.sourceInputSha256[row.file]!==row.sourceFileSha256) fail('MONEY_APPROVAL_SOURCE_HASH');
    const approval={fileSha256:row.sourceFileSha256,sheet:row.sheet,row:row.row,sourceId:row.sourceId,field:row.field,rawValue:row.rawValue,exactCentValue:row.candidateExactCentValue};
    approvals.push(approval); const k=key(row.entity,row.sourceId,row.field); if (approvalDetails.has(k)) fail('MONEY_APPROVAL_DUPLICATE_CELL'); approvalDetails.set(k,{approval,detail:row});
  }
  // The independently supplied digest authenticates the entire approved artifact, not its own manifest assertion.
  const approvedSet=v2MoneyApprovalSet(approvals,approvals);
  const tables=IMPORT_V2_TABLES.filter(t=>t.columns.some(c=>c.logicalType==='MONEY'));
  const fieldsByEntity=new Map(tables.map(t=>[t.entity,t.columns.filter(c=>c.logicalType==='MONEY').map(c=>c.name)]));
  const normalized=new Map(); let canonicalRows=0;
  for (const table of tables) for await (const row of records(table.file,table.columns.map(c=>c.name))) {
    const k=key(table.entity,row['来源编号'],''); if (normalized.has(k)) fail('MONEY_CANONICAL_ROW_DUPLICATE');
    normalized.set(k,fieldsByEntity.get(table.entity).map(field=>row[field])); canonicalRows++;
  }
  const hits=new Set(); let sourceRowsScanned=0, sourceMoneyRows=0, comparedCells=0, unchangedCells=0, unknownCells=0;
  for await (const source of parseV2JsonLines(strings('snapshots/all-business-source-rows.jsonl'))) {
    sourceRowsScanned++;
    if (!source || typeof source!=='object' || typeof source.entity!=='string') fail('SOURCE_SNAPSHOT_ROW');
    const fields=fieldsByEntity.get(source.entity); if (!fields) continue;
    if (typeof source.sourceId!=='string' || !source.sourceId || typeof source.file!=='string' || typeof source.sheet!=='string' || !Number.isSafeInteger(source.row) || source.row<1 || !source.data || typeof source.data!=='object' || source.data['来源编号']!==source.sourceId || !Object.hasOwn(manifest.sourceInputSha256,source.file) || manifest.sourceInputSha256[source.file]!==source.sourceSha256) fail('MONEY_SOURCE_PROVENANCE');
    const rowKey=key(source.entity,source.sourceId,''); const values=normalized.get(rowKey); if (!values) fail('MONEY_SOURCE_ROW_UNMATCHED_OR_DUPLICATE'); normalized.delete(rowKey); sourceMoneyRows++;
    for (let i=0;i<fields.length;i++) {
      const field=fields[i], canonical=values[i], raw=Object.hasOwn(source.data,field)?source.data[field]:'';
      if (typeof raw!=='string') fail('MONEY_SOURCE_NOT_LITERAL_STRING'); comparedCells++;
      const cellKey=key(source.entity,source.sourceId,field), allowed=approvalDetails.get(cellKey);
      if (allowed) {
        if (hits.has(cellKey) || source.file!==allowed.detail.file || source.sheet!==allowed.detail.sheet || String(source.row)!==allowed.detail.row || source.sourceSha256!==allowed.detail.sourceFileSha256 || source.sourceId!==allowed.detail.sourceId || raw!==allowed.detail.rawValue || canonical!==allowed.detail.candidateExactCentValue) fail('MONEY_APPROVAL_FULL_IDENTITY_MISMATCH');
        const document=source.entity==='SALES_HEADER'?source.sourceId:source.data['单据来源编号'];
        if (document!==allowed.detail.documentSourceId || document!==allowed.detail.corroboratingDocumentSourceId) fail('MONEY_APPROVAL_DOCUMENT_MISMATCH');
        v2ApprovedCents({fileSha256:source.sourceSha256,sheet:source.sheet,row:String(source.row),sourceId:source.sourceId,field,rawValue:raw,exactCentValue:canonical},approvedSet);
        if (raw===canonical) fail('MONEY_APPROVAL_NOT_A_CHANGE'); hits.add(cellKey);
      } else {
        if (raw!==canonical) fail('UNAPPROVED_MONEY_REWRITE');
        if (raw==='') unknownCells++; else { v2Cents(raw); unchangedCells++; }
      }
    }
  }
  if (normalized.size!==0 || sourceMoneyRows!==canonicalRows) fail('MONEY_SOURCE_COVERAGE');
  if (hits.size!==32) fail('MONEY_APPROVAL_NOT_ALL_CONSUMED');
  return {status:'VERIFIED',approvalTrust:'EXTERNALLY_PINNED_OVERLAY_SHA256',approvedCellsMatched:hits.size,unapprovedMoneyRewrites:0,sourceRowsScanned,canonicalMoneyRows:canonicalRows,comparedCells,unchangedNonemptyCells:unchangedCells,unknownCellsRetained:unknownCells,historicalAmountsRebalanced:false,originalWorkbooksReparsed:false};
}
async function verifyCreatorHall({records,strings,manifest}) {
  if (!manifest.sourceInputSha256 || typeof manifest.sourceInputSha256!=='object' || Array.isArray(manifest.sourceInputSha256) || Object.values(manifest.sourceInputSha256).some(hash=>typeof hash!=='string' || !/^[a-f0-9]{64}$/.test(hash))) fail('CREATOR_SOURCE_HASH_CATALOGUE');
  const staffTable=IMPORT_V2_TABLES.find(t=>t.entity==='STAFF'), hallTable=IMPORT_V2_TABLES.find(t=>t.entity==='HALL');
  const staffHalls=new Map(), hallIds=new Set();
  for await (const row of records(hallTable.file,hallTable.columns.map(c=>c.name))) hallIds.add(row['来源编号']);
  for await (const row of records(staffTable.file,staffTable.columns.map(c=>c.name))) { if (staffHalls.has(row['来源编号']) || (row['所属厅来源编号']!=='' && !hallIds.has(row['所属厅来源编号']))) fail('CREATOR_STAFF_REFERENCE'); staffHalls.set(row['来源编号'],row['所属厅来源编号']); }
  const canonical=new Map();
  for (const table of IMPORT_V2_TABLES.filter(t=>['SALES_HEADER','TRANSFER_HEADER'].includes(t.entity))) for await (const row of records(table.file,table.columns.map(c=>c.name))) {
    if (canonical.has(row['来源编号'])) fail('CREATOR_AMBIGUOUS_SOURCE_ID');
    const personField=table.entity==='SALES_HEADER'?'营业员来源编号':'原制单账号编号';
    canonical.set(row['来源编号'],{entity:table.entity,personField,personId:row[personField],number:row['原单号'],hall:row['原创建厅编号'],provenance:row['创建厅归属来源'],reason:row['创建厅归属原因']});
  }
  const originalHeaderCount=canonical.size, overlays=new Map(), reasonCounts={}; let derived=0,unknown=0;
  const columns=['file','sheet','row','sourceId','documentNumber','personField','personId','matchedStaffId','currentEmployeeHall','uploadedWarehouseDerivedHall','candidateCreatorHall','provenance','reason','comparison','rawCreatorDisplay','rawPeopleSupportRow'];
  for await (const row of records('provenance/creator-hall-approved-overlay.csv',columns)) {
    const target=canonical.get(row.sourceId); if (!target || overlays.has(row.sourceId) || !/^[1-9]\d*$/.test(row.row) || !Object.hasOwn(manifest.sourceInputSha256,row.file)) fail('CREATOR_OVERLAY_IDENTITY');
    if (target.personField!==row.personField || target.personId!==row.personId || target.number!==row.documentNumber) fail('CREATOR_PERSON_OR_DOCUMENT');
    const decision=v2CreatorHallDecision(target.entity,row.personId,staffHalls);
    const expectedHall=decision.candidateHall??'', matched=decision.matchedStaffId??'';
    if (row.matchedStaffId!==matched || row.currentEmployeeHall!==(matched?staffHalls.get(matched):'') || row.candidateCreatorHall!==expectedHall || row.provenance!==decision.provenance || row.reason!==decision.reason || target.hall!==expectedHall || target.provenance!==decision.provenance || target.reason!==decision.reason) fail('CREATOR_DERIVATION_OR_CANONICAL_MISMATCH');
    const comparison=row.uploadedWarehouseDerivedHall===expectedHall?'same':expectedHall===''?'clear_to_unknown':'different_nonblank';
    if (row.comparison!==comparison || !/^[1-9]\d*$/.test(row.rawPeopleSupportRow)) fail('CREATOR_AUXILIARY_FORMAT');
    overlays.set(row.sourceId,row); reasonCounts[decision.reason]=(reasonCounts[decision.reason]??0)+1; if (decision.provenance==='MIGRATION_DERIVED') derived++; else unknown++;
  }
  if (overlays.size!==canonical.size) fail('CREATOR_OVERLAY_COVERAGE');
  const seenStaff=new Set(); let sourceRowsScanned=0, sourceHeadersMatched=0, originalHallChanges=0;
  for await (const source of parseV2JsonLines(strings('snapshots/all-business-source-rows.jsonl'))) {
    sourceRowsScanned++;
    if (!source || typeof source!=='object' || typeof source.entity!=='string') fail('SOURCE_SNAPSHOT_ROW');
    if (!['STAFF','SALES_HEADER','TRANSFER_HEADER'].includes(source.entity)) continue;
    if (typeof source.sourceId!=='string' || !source.sourceId || typeof source.file!=='string' || typeof source.sheet!=='string' || !Number.isSafeInteger(source.row) || source.row<1 || !source.data || typeof source.data!=='object' || source.data['来源编号']!==source.sourceId || !Object.hasOwn(manifest.sourceInputSha256,source.file) || manifest.sourceInputSha256[source.file]!==source.sourceSha256) fail('CREATOR_SOURCE_PROVENANCE');
    if (source.entity==='STAFF') {
      if (!staffHalls.has(source.sourceId) || seenStaff.has(source.sourceId) || staffHalls.get(source.sourceId)!==(source.data['所属厅来源编号']??'')) fail('CREATOR_STAFF_SOURCE_MISMATCH'); seenStaff.add(source.sourceId); continue;
    }
    const target=canonical.get(source.sourceId), overlay=overlays.get(source.sourceId);
    if (!target || !overlay || target.entity!==source.entity || overlay.file!==source.file || overlay.sheet!==source.sheet || overlay.row!==String(source.row) || overlay.personId!==(source.data[target.personField]??'') || overlay.documentNumber!==source.data['原单号'] || overlay.uploadedWarehouseDerivedHall!==(source.data['原创建厅编号']??'')) fail('CREATOR_SOURCE_ROW_MISMATCH');
    if (overlay.uploadedWarehouseDerivedHall!==overlay.candidateCreatorHall) originalHallChanges++;
    canonical.delete(source.sourceId); overlays.delete(source.sourceId); sourceHeadersMatched++;
  }
  if (canonical.size || overlays.size || sourceHeadersMatched!==originalHeaderCount || seenStaff.size!==staffHalls.size) fail('CREATOR_SOURCE_COVERAGE');
  return {status:'SOURCE_AND_RULES_VERIFIED',sourceRowsScanned,sourceHeadersMatched,employeeHallSourcesMatched:seenStaff.size,derived,unknown,reasonCounts,originalHallChanges,rawOriginalHallAndPersonRetained:true,canonicalReasonsPreserved:true,warehouseFallbacks:0,auxiliaryDisplayAndSupportRowsSemanticallyReparsed:false,overlayExternallyAuthenticated:false,visibilityAuthorizationChanged:false};
}

if (process.argv[1] && resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)) {
  const flags=process.argv.slice(3), prefixes=['--approved-money-overlay-sha256=','--v3-amendment=','--v3-approval='];
  const value=prefix=>flags.find(x=>x.startsWith(prefix))?.slice(prefix.length);
  if (process.argv.length<3 || flags.length>4 || new Set(flags).size!==flags.length || flags.some(x=>x!=='--verify-creator-hall' && !prefixes.some(p=>x.startsWith(p))) || prefixes.some(p=>flags.filter(x=>x.startsWith(p)).length>1)) { console.error('Usage: node scripts/import-v2/run.mjs /absolute/read-only/v2-bundle [--approved-money-overlay-sha256=INDEPENDENT_APPROVED_HASH] [--verify-creator-hall] [--v3-amendment=DIR --v3-approval=EXTERNAL_APPROVAL_FILE]'); process.exitCode=2; }
  else try { console.log(JSON.stringify(await preflightV2(process.argv[2],{...(value(prefixes[0])!==undefined?{approvedMoneyOverlaySha256:value(prefixes[0])}:{}),verifyCreatorHall:flags.includes('--verify-creator-hall'),...(value(prefixes[1])!==undefined?{v3Amendment:value(prefixes[1])}:{}),...(value(prefixes[2])!==undefined?{v3Approval:value(prefixes[2])}:{})}),null,2)); } catch (error) { console.error(JSON.stringify({kind:'V2_OR_V3_READ_ONLY_PREFLIGHT',importReady:false,noSql:true,error:error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)?error.message:'INPUT_READ_OR_PARSE_FAILURE'})); process.exitCode=1; }
}

async function applyV3Selection({report,records,strings,manifest,payload,baseManifestSha256,amendment,externalApproval}) {
  const root=await realpath(resolve(amendment)), sha=buffer=>createHash('sha256').update(buffer).digest('hex');
  async function pathFor(relative) {
    if (typeof relative!=='string' || !relative || relative.startsWith('/') || relative.includes('\\') || relative.split('/').some(p=>!p || p==='.' || p==='..')) fail('V3_UNSAFE_PATH');
    let path=root; for (const part of relative.split('/')) { path=join(path,part); if ((await lstat(path)).isSymbolicLink()) fail('V3_SYMLINK'); }
    const stat=await lstat(path); if (!stat.isFile() || stat.size>64*1024*1024) fail('V3_FILE_SIZE_OR_TYPE'); return path;
  }
  async function metadata(relative) { const path=await pathFor(relative); if ((await lstat(path)).size>4*1024*1024) fail('V3_METADATA_SIZE'); return readFile(path); }
  const approvalPath=resolve(externalApproval), approvalStat=await lstat(approvalPath), approvalReal=await realpath(approvalPath);
  if (!approvalStat.isFile() || approvalStat.isSymbolicLink() || approvalStat.size>4*1024*1024 || approvalReal===root || approvalReal.startsWith(root+'/')) fail('V3_APPROVAL_MUST_BE_EXTERNAL');
  const approvalBytes=await readFile(approvalReal), approval=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(approvalBytes));
  if (approval.scope!=='EXCLUDE_EXACT_PRODUCT_BOUND_BARCODE_ARCHIVE_ROWS_FROM_THIS_IMPORT_ONLY' || approval.excludedBindingScope!=='PRODUCT' || approval.excludedCount!==2958 || approval.businessDatabaseDeletionApproved!==false || approval.sourceEvidenceDeletionApproved!==false || approval.nativeDbImportAuthorizedByThisFile!==false || typeof approval.decisionId!=='string' || !approval.decisionId) fail('V3_APPROVAL_POLICY');
  const selectionBytes=await metadata('effective-import-selection.json');
  if (sha(selectionBytes)!==approval.selectionSha256) fail('V3_SELECTION_APPROVAL_HASH');
  const selection=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(selectionBytes));
  if (selection.exclusionDecisionFile!=='approval.json' || !(await metadata('approval.json')).equals(approvalBytes)) fail('V3_EXTERNAL_APPROVAL_MISMATCH');
  if (selection.schemaVersion!=='NAIJUE_V3_EXPLICIT_BARCODE_EXCLUSION_SELECTION_20261021' || selection.mode!=='REPLACE_BARCODE_IMPORT_INPUT_NOT_APPEND' || selection.approvalDecisionId!==approval.decisionId || selection.importReady!==false || selection.nativeDatabaseImportPerformed!==false || selection.sourceRawSnapshotsRemainEvidenceOnly!==true || selection.other17BusinessFilesUnchanged!==true || selection.allEffectiveBarcodeSkuRefsNonempty!==true) fail('V3_SELECTION_POLICY');
  if (selection.baseManifestSha256!==baseManifestSha256 || approval.baseManifestSha256!==baseManifestSha256 || selection.baseBundleVersion!==manifest.bundleVersion || selection.baseArchiveSha256!==approval.baseArchiveSha256 || !/^[a-f0-9]{64}$/.test(selection.baseArchiveSha256)) fail('V3_BASE_HASH_MISMATCH');
  const barcode=IMPORT_V2_TABLES.find(t=>t.entity==='BARCODE'), columns=barcode.columns.map(c=>c.name);
  if (selection.baseBarcodeCsvSha256!==payload.get(barcode.file)?.sha256 || approval.baseBarcodeCsvSha256!==payload.get(barcode.file)?.sha256) fail('V3_BASE_BARCODE_HASH');
  if (selection.excludedCount!==2958 || selection.effectiveCount!==15018 || selection.effectiveBarcodeCsv?.count!==15018 || selection.excludedEvidenceCsv?.count!==2958 || selection.effectiveBarcodeCsv.path!==barcode.file || selection.excludedEvidenceCsv.role!=='EVIDENCE_ONLY_DO_NOT_IMPORT' || !eq(selection.effectiveBarcodeCsv.columns,columns) || !eq(selection.excludedEvidenceCsv.columns,columns)) fail('V3_SELECTION_COUNTS_OR_SCHEMA');
  if (selection.effectiveBarcodeCsv.sha256!==approval.effectiveBarcodeCsvSha256 || selection.excludedEvidenceCsv.sha256!==approval.excludedEvidenceCsvSha256 || selection.excludedSourceIdsSetSha256!==approval.excludedSourceIdsSetSha256 || selection.idSetHashAlgorithm!=='SHA256_UTF8_JSON_COMPACT_SORTED_ARRAY_NO_TRAILING_NEWLINE' || selection.idSetHashAlgorithm!==approval.idSetHashAlgorithm) fail('V3_APPROVAL_BINDINGS');
  const evidenceOnly=['exclusions/**','audit/**','snapshots/**','BASE_V2/business/03历史条码.csv'];
  if (!Array.isArray(selection.notImportTargets) || !eq([...selection.notImportTargets].sort(),evidenceOnly.sort())) fail('V3_EVIDENCE_IMPORT_FORBIDDEN');
  if (!Array.isArray(selection.importFiles) || selection.importFiles.length!==IMPORT_V2_TABLES.length || new Set(selection.importFiles.map(x=>x.entity)).size!==IMPORT_V2_TABLES.length) fail('V3_IMPORT_SELECTION_COVERAGE');
  const expectedCounts={...report.counts,BARCODE:15018};
  if (!selection.effectiveEntityCounts || !eq(Object.keys(selection.effectiveEntityCounts).sort(),Object.keys(expectedCounts).sort()) || Object.entries(expectedCounts).some(([entity,count])=>selection.effectiveEntityCounts[entity]!==count)) fail('V3_EFFECTIVE_ENTITY_COUNTS');
  for (const table of IMPORT_V2_TABLES) {
    const entry=selection.importFiles.find(x=>x.entity===table.entity), amended=table.entity==='BARCODE';
    if (!entry || entry.source!==(amended?'AMENDMENT_V3':'BASE_V2') || entry.path!==table.file || entry.sha256!==(amended?selection.effectiveBarcodeCsv.sha256:payload.get(table.file)?.sha256) || entry.count!==expectedCounts[table.entity]) fail('V3_UNAUTHORIZED_ENTITY_CHANGE');
  }
  const amendmentManifestBytes=await metadata('manifest.json'), seal=(await metadata('manifest.sha256')).toString('utf8').trim();
  if (!/^[a-f0-9]{64}(?:\s+\*?manifest\.json)?$/.test(seal) || seal.slice(0,64)!==sha(amendmentManifestBytes)) fail('V3_MANIFEST_HASH');
  const amendmentManifest=JSON.parse(amendmentManifestBytes.toString('utf8')), files=new Map(); let total=0;
  if (amendmentManifest.importReady!==false || !Array.isArray(amendmentManifest.payloadFiles) || amendmentManifest.payloadFiles.length>1024) fail('V3_MANIFEST_CONTRACT');
  for (const entry of amendmentManifest.payloadFiles) {
    if (files.has(entry.file) || !Number.isSafeInteger(entry.bytes) || entry.bytes<0 || entry.bytes>64*1024*1024 || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail('V3_MANIFEST_ENTRY');
    total+=entry.bytes; if (total>256*1024*1024) fail('V3_BUNDLE_SIZE'); await pathFor(entry.file); files.set(entry.file,entry);
  }
  if (amendmentManifest.payloadBytes!==total) fail('V3_MANIFEST_TOTAL_BYTES');
  async function* chunks(relative) {
    const entry=files.get(relative); if (!entry) fail('V3_UNMANIFESTED_INPUT'); const hash=createHash('sha256'); let count=0;
    for await (const chunk of createReadStream(await pathFor(relative),{highWaterMark:65536})) { count+=chunk.length; if (count>entry.bytes) fail('V3_PAYLOAD_SIZE'); hash.update(chunk); yield chunk; }
    if (count!==entry.bytes || hash.digest('hex')!==entry.sha256) fail('V3_PAYLOAD_HASH');
  }
  for (const path of files.keys()) for await (const _ of chunks(path)) { /* all amendment evidence remains read-only */ }
  for (const [path,expected] of [['effective-import-selection.json',approval.selectionSha256],['approval.json',sha(approvalBytes)],[selection.effectiveBarcodeCsv.path,approval.effectiveBarcodeCsvSha256],[selection.excludedEvidenceCsv.path,approval.excludedEvidenceCsvSha256],[selection.excludedSourceIdsFile,approval.excludedSourceIdsFileSha256]]) if (files.get(path)?.sha256!==expected) fail('V3_MANIFEST_APPROVAL_BINDING');
  async function* textChunks(relative) { const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}); for await (const chunk of chunks(relative)) yield decoder.decode(chunk,{stream:true}); yield decoder.decode(); }
  async function csv(relative) { const rows=[]; let header; for await (const cells of parseV2Csv(textChunks(relative))) { if (!header) { if (!eq(cells,columns)) fail('V3_CSV_HEADER'); header=cells; continue; } if (cells.length!==columns.length || rows.length>=17976) fail('V3_CSV_ROW_BOUND'); rows.push(Object.fromEntries(columns.map((c,i)=>[c,cells[i]]))); } if (!header) fail('V3_CSV_EMPTY'); return rows; }
  const idBytes=await metadata(selection.excludedSourceIdsFile); if (sha(idBytes)!==approval.excludedSourceIdsFileSha256) fail('V3_ID_FILE_HASH');
  const ids=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(idBytes));
  if (!Array.isArray(ids) || ids.length!==2958 || ids.some(x=>typeof x!=='string' || !x) || new Set(ids).size!==ids.length || !eq(ids,[...ids].sort()) || sha(JSON.stringify(ids))!==approval.excludedSourceIdsSetSha256) fail('V3_EXCLUSION_ID_SET');
  const trace=approval.authoritativeTraceSource;
  if (!trace || trace.jsonArray!=='productLevelBarcodes' || trace.sourceKeyField!=='sourceKey' || manifest.sourceInputSha256?.[trace.originalSupplementFile]!==trace.sha256 || payload.get('snapshots/supplement09-original.json')?.sha256!==trace.sha256) fail('V3_ORIGINAL_TRACE_HASH');
  let rawSupplement=''; for await (const text of strings('snapshots/supplement09-original.json')) { rawSupplement+=text; if (rawSupplement.length>16*1024*1024) fail('V3_ORIGINAL_TRACE_SIZE'); }
  const sourceArray=JSON.parse(rawSupplement).productLevelBarcodes;
  if (!Array.isArray(sourceArray) || sourceArray.length!==2958 || sourceArray.some(x=>!x || typeof x.sourceKey!=='string') || !eq(sourceArray.map(x=>x.sourceKey).sort(),ids)) fail('V3_ORIGINAL_TRACE_ID_SET');
  const source=[]; for await (const row of records(barcode.file,columns)) source.push(row);
  const excluded=await csv(selection.excludedEvidenceCsv.path), effective=await csv(selection.effectiveBarcodeCsv.path);
  if (!eq(excluded.map(row=>row['来源编号']).sort(),ids)) fail('V3_EXCLUDED_CSV_ID_SET');
  const result=v3BarcodeExclusion(columns,source,excluded,effective,{excluded:2958,effective:15018});
  if (report.requiredEmptyByField['BARCODE.SKU来源编号']!==2958) fail('V3_SOURCE_REQUIRED_CONFLICT_COUNT');
  report.kind='V3_READ_ONLY_PREFLIGHT'; report.sourceV2BarcodeEvidence={rows:report.counts.BARCODE,bindings:report.barcodeBindings,requiredEmptyByField:{...report.requiredEmptyByField},contractNotes:report.contractAdaptationRequired};
  report.counts=expectedCounts; report.barcodeBindings={product:0,sku:15018}; delete report.requiredEmptyByField['BARCODE.SKU来源编号']; report.wireRequiredFieldsValid=Object.keys(report.requiredEmptyByField).length===0; report.contractAdaptationRequired=[];
  report.v3SelectionVerification={status:'VERIFIED_EXPLICIT_APPROVAL',...result,otherBusinessEntitiesUnchanged:17,mode:'REPLACE_BARCODE_IMPORT_INPUT_NOT_APPEND',excludedAndRawEvidenceAreImportTargets:false,amendmentPayloadFilesVerified:files.size,baseManifestBoundToExternalApproval:true,baseArchiveRehashed:false,nativeProductBarcodeStructureRequired:false};
  report.integrity='V2_BASE_AND_V3_SELECTED_DATA_BOUND_TO_EXPLICIT_EXTERNAL_APPROVAL';
  report.missing=report.missing.filter(x=>x!=='trusted external manifest authentication').map(x=>x==='native catalogue/history/barcode schema adapter'?'native catalogue/history importer adapter (PRODUCT barcode structure not required by this selection)':x);
  report.supported.push('explicit approved v3 barcode replacement; exact original supplement PRODUCT ID set excluded as evidence only; all retained barcode fields and other 17 business inputs unchanged');
  return {selection,selectionSha256:sha(selectionBytes),approvalSha256:sha(approvalBytes)};
}
