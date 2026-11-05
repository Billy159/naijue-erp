/** Pure QA897 input candidates. No source grant, private review, database,
 * execution callback or publication state. The existing fixture consumes the
 * ORIGINAL openImportHost26/createPostgresImportExecutor26 lifecycle only after
 * T45 wraps these exact safe inputs in independently reviewed source factories.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { stableImportId } from '../../packages/application/src/inventory-cutoff-import.ts';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { prepareNativeProductImportChunk26, NATIVE_PRODUCT_IMPORT_VERSION_26, NATIVE_PRODUCT_REFERENCE_DECISION_VERSION_26, NATIVE_PRODUCT_NULLABLE_POLICY, nativeProductImportEvidence26, nativeProductReferenceDecision26 } from '../../packages/application/src/native-product-import.ts';
import type { NativeProductImportChunk26 } from '../../packages/application/src/native-product-import.ts';
import { prepareNativeSkuImport26, NATIVE_SKU_IMPORT_VERSION_26, nativeSkuAliasEvidence26 } from '../../packages/application/src/native-sku-import.ts';
import type { NativeSkuImportInput26 } from '../../packages/application/src/native-sku-import.ts';
import { NATIVE_IMPORT_STOCK_CONSERVATION_VERSION, nativeStockContributorsManifestHash, nativeStockEffectiveGroupsManifestHash, validateNativeStockConservationPlan } from '../../packages/application/src/native-import-record-accounting.ts';
import { prepareNativePaymentImportChunk } from '../../packages/application/src/native-payment-import.ts';
import type { NativePaymentImportChunk, NativePaymentEntity, NativePaymentReference } from '../../packages/application/src/native-payment-import.ts';
import { nativePaymentSourceEvidence, nativePaymentBindingEvidence } from '../../adapters/postgres/src/native-payment-import.ts';
import { prepareNativeBarcode, nativeBarcodeSourceEvidence, nativeBarcodeSchemeInitializationRows26 } from '../../packages/application/src/native-barcode-import.ts';
import type { NativeBarcodeInput } from '../../packages/application/src/native-barcode-import.ts';
import { prepareHistorySalesDetailChunk, HISTORY_SALES_DETAIL_VERSION } from '../../packages/application/src/import-v3-history-sales-detail.ts';
import type { HistorySalesDetailChunk, PreparedHistorySalesDetailChunk } from '../../packages/application/src/import-v3-history-sales-detail.ts';
import { historySettlementRequestHash } from '../../packages/application/src/import-v3-history-settlement.ts';
import { prepareHistorySettlementChunk, HISTORY_SETTLEMENT_VERSION } from '../../packages/application/src/import-v3-history-settlement.ts';
import type { HistorySettlementChunk, PreparedHistorySettlementChunk } from '../../packages/application/src/import-v3-history-settlement.ts';
import { v2MoneyApprovalSet, v2Cents } from '../../packages/application/src/import-v2.ts';
import type { MoneyApproval } from '../../packages/application/src/import-v2.ts';
import { prepareNativeStockGroup, nativeStockSourceEvidence, nativeStockPublicationContributor26 } from '../../packages/application/src/native-stock-contributor-import.ts';
import type { PreparedNativePartyImportChunk } from '../../packages/application/src/native-party-import.ts';
import type { NativeStockGroupInput } from '../../packages/application/src/native-stock-contributor-import.ts';
import { prepareV3HistoryHeaderChunk } from '../../packages/application/src/import-v3-history-header-staging.ts';
import type { HistoryHeaderInput } from '../../packages/application/src/import-v3-history-header.ts';
import { prepareV3HistoryChunk } from '../../packages/application/src/import-v3-history-staging.ts';
import type { V3HistoryChunk } from '../../packages/application/src/import-v3-history-staging.ts';
import { prepareNativeCatalogueImportChunk26 } from '../../packages/application/src/native-catalogue-import.ts';
import { historyClosureProjectionRow26, buildHistoryTypedClosureExpected26, HISTORY_CLOSURE_SOURCE_ENTITIES } from '../../packages/application/src/history-typed-closure.ts';
import type { HistoryClosureRow } from '../../packages/application/src/history-typed-closure.ts';
import { HISTORY_COUNT_KEYS } from '../../packages/application/src/history-storage-contract.ts';
import type { ImportSourceEvidence, JsonObject, HistorySalesHeader } from '../../packages/application/src/history-storage-contract.ts';
import type { CurrentSalesBlueprint } from './current-runtime26-sales-fixture.ts';
import { currentRuntime26SyntheticScope, CURRENT_REWRITE_SYNTHETIC_TARGET } from './current-runtime26-sales-fixture.ts';

import type {LiveLedgerBalancePairsScenario} from './live-ledger-balance-pairs.integration.test.ts';
import type {HistoryRevisionCommand,HistoryRevisionReceipt} from '../../packages/application/src/history-revision-contracts.ts';

const sha=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
const table=(entity:string)=>{const t=IMPORT_V2_TABLES.find(t=>t.entity===entity);assert.ok(t);return t;};
const blank=(entity:string):Record<string,string>=>Object.fromEntries(table(entity).columns.map(c=>[c.name,'']));
const cell=(s:string)=>/[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;
function csv(entity:string,rows:readonly Record<string,string>[]){
 const t=table(entity),header=t.columns.map(c=>c.name);
 const utf8=[header,...rows.map(row=>header.map(k=>row[k]!))].map(row=>row.map(cell).join(',')).join('\n')+'\n';
 return {entity,path:t.file,utf8,bytes:Buffer.byteLength(utf8),sha256:sha(utf8),rowCount:rows.length};
}
function mappingCsv(path:string,rows:readonly Record<string,string>[]){const columns=Object.keys(rows[0]!);const utf8=[columns,...rows.map(r=>columns.map(k=>r[k]!))].map(r=>r.map(cell).join(',')).join('\n')+'\n';return {path,utf8,bytes:Buffer.byteLength(utf8),sha256:sha(utf8),rowCount:rows.length};}
const ordered=(rows:readonly HistoryClosureRow[])=>[...rows].sort((a,b)=>Buffer.compare(Buffer.from(a.relation+'\0'+a.key),Buffer.from(b.relation+'\0'+b.key)));
export const CURRENT_FULL_EMPTY_ENTITIES:readonly string[]=[];
type ClosureGroup={sourceRows:HistoryClosureRow[];typedRows:HistoryClosureRow[]};
const sourceRow=(s:ImportSourceEvidence,field_provenance:JsonObject):JsonObject=>({id:s.id,batch_id:s.batchId,entity_type:s.entityType,source_key:s.sourceKey,file_ref:s.fileRef,sheet:s.sheet,row_no:s.rowNo,source_file_sha256:s.sourceFileSha256,row_sha256:s.rowSha256,raw_fields:s.rawFields,normalized_fields:s.normalizedFields,field_provenance});

/** Fixed scene delegated by C: positive10 in one of the22 original warehouses;
 * the remaining21 are individually explicit zero targets, not absent evidence.
 */
export async function buildCurrentRuntime26FullSourceFixture(blueprint:CurrentSalesBlueprint){
 const scope=currentRuntime26SyntheticScope(blueprint.database,blueprint.batchId),tag=scope.tag;assert.equal(blueprint.namespace,scope.namespace);
 assert.equal(blueprint.parties.length,115);assert.equal(blueprint.accountIdentities.length,49);
 const b=structuredClone(blueprint),id=(kind:string,key:string)=>stableImportId(kind,b.namespace,`SYNTHETIC_${tag}_FULL`,key);
 const warehouses=b.parties.filter(r=>r.source.entityType==='WAREHOUSE');assert.equal(warehouses.length,22);
 const first=warehouses.find(w=>w.nativeSnapshot.id===b.refs.warehouseId)!;assert.ok(first);
 const second=warehouses.find(w=>w.nativeSnapshot.id!==first.nativeSnapshot.id)!;assert.ok(second);
 const catalogue=prepareNativeCatalogueImportChunk26(b.catalogue),find=(entity:string)=>{const row=catalogue.rows.find(r=>r.entity===entity);assert.ok(row);return row;};
 const category=find('CATEGORY'),color=find('COLOR'),fit=find('FIT'),size=find('SIZE'),group=find('SIZE_GROUP');
 const sourceModule=await import(new URL('../../scripts/import-v3/prepare-native-bindings.mjs',import.meta.url).href) as {
  sourceEvidence(raw:unknown,line:string,normalized:JsonObject,binding:{batchId:string;fixedSourceNamespace:string}):ImportSourceEvidence;
 };
 const sources:Record<string,ReturnType<typeof csv>>={},sourceFiles:Record<string,{utf8:string;sha256:string;bytes:number}>={},rawArtifacts:Record<string,{utf8:string;sha256:string;rows:number}>={};
 const source=(entity:string,key:string,row:Record<string,string>,normalized:Record<string,string>=row,index=1)=>{
  const file=`${scope.root}/full/${entity}/${entity==='PAYMENT_ACCOUNT_HALL'?'recommendation-1':key}.json`,physical=JSON.stringify(row)+'\n';
  const raw={entity,sourceId:entity==='PAYMENT_ACCOUNT_HALL'?'':key,file,sheet:entity,row:index,sourceSha256:sha(physical),data:row};
  sourceFiles[file]={utf8:physical,sha256:sha(physical),bytes:Buffer.byteLength(physical)};
  const line=JSON.stringify(raw);
  // Payment's original sealed-source format has exact unaugmented fields and
  // a genuine composite relation identity. The ordinary source helper's extra
  // row-hash field/required sourceId is not valid for this original contract.
  const evidence:ImportSourceEvidence=(entity.startsWith('PAYMENT_')||entity==='SETTLEMENT')?{id:stableImportId('source-row',b.namespace,entity,key),batchId:b.batchId,entityType:entity,sourceKey:key,fileRef:file,sheet:entity,rowNo:String(index),sourceFileSha256:raw.sourceSha256,rowSha256:sha(line),rawFields:row,normalizedFields:normalized,fieldProvenance:{schema_version:1,fields:Object.fromEntries(Object.entries(row).map(([field,value])=>[field,{origin:'ORIGINAL',reason:'EXACT_ORIGINAL_SNAPSHOT_CELL',raw:value}]))}}:sourceModule.sourceEvidence(raw,line,normalized,{batchId:b.batchId,fixedSourceNamespace:b.namespace});
  rawArtifacts[entity+':'+key]={utf8:line+'\n',sha256:sha(line+'\n'),rows:1};return evidence;
 };
 const selection=(entity:string,csvSha256:string)=>({baseManifestSha256:b.pins.baseManifestSha256,selectionSha256:b.pins.selectionSha256,approvalSha256:b.pins.approvalSha256,csvSha256,source:'BASE_V2' as const,entity,path:table(entity).file});
 const productKey=`SYNTHETIC-${tag}-IMPORTED-PRODUCT`,skuKey=`SYNTHETIC-${tag}-IMPORTED-SKU`,stockKey=`SYNTHETIC-${tag}-STOCK`,transferKey=`SYNTHETIC-${tag}-${scope.isNew?'APPROVED':'DRAFT'}-TRANSFER`;
 const p={...blank('PRODUCT'),来源编号:productKey,款号:`SYNTHETIC-${tag}-IMPORT`,商品名称:`SYNTHETIC ${tag} imported source product`,分类路径:String(category.nativeSnapshot.name),尺码组:String(group.nativeSnapshot.name),状态:'正常',零售价:'1.25',采购价:'0',年份:'2026',系统货号:`${tag}-IMPORT`};
 sources.PRODUCT=csv('PRODUCT',[p]);
 const productInput:NativeProductImportChunk26={batchId:b.batchId,fixedSourceNamespace:b.namespace,schemaProfile:'EXACT26',validatorVersion:NATIVE_PRODUCT_IMPORT_VERSION_26,
  selection:{...selection('PRODUCT',sources.PRODUCT.sha256),entity:'PRODUCT',path:'business/01商品.csv'},rows:[{source:source('PRODUCT',productKey,p),product:{sourceKey:productKey,nativeId:id('product','product'),expectedVersion:1},blankPricePolicy:'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET',nullableFieldPolicy:NATIVE_PRODUCT_NULLABLE_POLICY,
   references:{category:{sourceValue:p.分类路径,mappingSha256:requestHash(category.nativeSnapshot),path:[{nativeId:String(category.nativeSnapshot.id),name:String(category.nativeSnapshot.name),expectedVersion:1}]},sizeGroup:{sourceValue:p.尺码组,nativeId:String(group.nativeSnapshot.id),code:String(group.nativeSnapshot.code),name:String(group.nativeSnapshot.name),mappingSha256:requestHash(group.nativeSnapshot)},supplier:null,season:null},
   seasonSelection:{version:'NATIVE_PRODUCT_SEASON_SELECTION_V1',mapping_sha256:requestHash({sourceKey:productKey,season:''}),source_key:productKey,source_season:'',state:'UNKNOWN',season_ids:null,references:[]}}]};
 const product=prepareNativeProductImportChunk26(productInput);
 const sk={...blank('SKU'),来源编号:skuKey,SKU编码:`SYNTHETIC-${tag}-IMPORT-SKU`,商品来源编号:productKey,颜色编码:String(color.nativeSnapshot.code),颜色名称:String(color.nativeSnapshot.name),版型编码:String(fit.nativeSnapshot.code),完整尺码:String(size.nativeSnapshot.name),状态:'正常',切换范围:'本次完整核准',新尺码字典ID:size.source.sourceKey,新尺码组ID:group.source.sourceKey,新尺码组名称:String(group.nativeSnapshot.name),合并来源SKU数:'1'};
 sources.SKU=csv('SKU',[sk]);const ss=source('SKU',skuKey,sk);
 const alias={oldSourceSkuId:skuKey,canonicalSourceSkuId:skuKey,isRepresentative:'true' as const,canonicalMemberCount:'1',productSourceId:productKey,newSizeDictionaryId:size.source.sourceKey,newSizeGroupId:group.source.sourceKey,newSizeGroupName:String(group.nativeSnapshot.name),newSizeCode:'',newSizeName:String(size.nativeSnapshot.name),colorCodeIdentity:String(color.nativeSnapshot.code),fitCode:String(fit.nativeSnapshot.code),canonicalState:'正常',oldSkuCode:sk.SKU编码,oldState:'正常',sourceFile:ss.fileRef,sourceSheet:ss.sheet,sourceRow:ss.rowNo,sourceSha256:ss.sourceFileSha256,mappingBasis:'EXACT_SYNTHETIC_SINGLE_CANONICAL_MEMBER'};
 const aliasArtifact=mappingCsv('mappings/old-to-canonical-sku-15121.csv',[alias]);
 const skuInput:NativeSkuImportInput26={batchId:b.batchId,fixedSourceNamespace:b.namespace,schemaProfile:'EXACT26',validatorVersion:NATIVE_SKU_IMPORT_VERSION_26,selection:{...selection('SKU',sources.SKU.sha256),entity:'SKU',path:'business/02合法SKU.csv',aliasCsvSha256:aliasArtifact.sha256},canonicalSource:ss,nativeSkuId:id('sku','sku'),references:{product:{sourceKey:productKey,nativeId:product.nativeProducts[0]!.id,nativeSnapshot:product.nativeProducts[0]! as unknown as JsonObject},color:{sourceKey:color.source.sourceKey,nativeId:String(color.nativeSnapshot.id),nativeSnapshot:color.nativeSnapshot},fit:{sourceKey:fit.source.sourceKey,nativeId:String(fit.nativeSnapshot.id),nativeSnapshot:fit.nativeSnapshot},size:{sourceKey:size.source.sourceKey,nativeId:String(size.nativeSnapshot.id),nativeSnapshot:size.nativeSnapshot},sizeGroup:{sourceKey:group.source.sourceKey,nativeId:String(group.nativeSnapshot.id),nativeSnapshot:group.nativeSnapshot}},aliases:[{source:ss,mapping:alias}],importRecord:{id:id('source','sku-record'),reviewedAt:b.now,decisionReason:`SYNTHETIC_${tag}_EXPLICIT_SINGLE_SKU_MAPPING_CANDIDATE`}};
 const sku=prepareNativeSkuImport26(skuInput);
 const signed=[12,-2];const contributors=signed.map((quantity,i)=>{
  const key=`SYNTHETIC-${tag}-STOCK-CONTRIBUTION-${i+1}`,raw={来源编号:key,SKU来源编号:skuKey,仓库来源编号:first.source.sourceKey,核准库存数量:String(quantity)};
  const s=source('INVENTORY_BASELINE',key,raw,raw,i+1);
  return {source:s,lineage:{validator_version:'STOCK_CONTRIBUTOR_LINEAGE_V1' as const,oldStockSourceId:key,canonicalStockRowSourceId:stockKey,warehouseSourceId:first.source.sourceKey,oldSkuSourceId:skuKey,canonicalSkuSourceId:skuKey,productSourceId:productKey,signedQuantity:String(quantity),sourceUnit:'件',sourceFile:s.fileRef,sourceSheet:s.sheet,sourceRow:s.rowNo,sourceSha256:s.sourceFileSha256}};
 });
 const stockRow={...blank('INVENTORY_BASELINE'),来源编号:stockKey,仓库来源编号:first.source.sourceKey,SKU来源编号:skuKey,核准库存数量:'10',核准依据:'SYNTHETIC_SIGNED_12_PLUS_MINUS2',合并输入库存行数:'2',来源单位集合快照:'["件"]'};
 sources.INVENTORY_BASELINE=csv('INVENTORY_BASELINE',[stockRow]);
 const lineageArtifact=mappingCsv('mappings/stock-contributor-lineage-38314.csv',contributors.map(c=>{const {validator_version:_version,...row}=c.lineage;return row;}));
 const stockInput:NativeStockGroupInput={batchId:b.batchId,fixedSourceNamespace:b.namespace,selection:{...selection('INVENTORY_BASELINE',sources.INVENTORY_BASELINE.sha256),entity:'INVENTORY_BASELINE',path:'business/12切换库存.csv',lineageCsvSha256:lineageArtifact.sha256},canonicalStock:stockRow,warehouse:{sourceKey:first.source.sourceKey,nativeId:String(first.nativeSnapshot.id)},sku:{canonicalSourceKey:skuKey,nativeId:sku.nativeSku.id},contributors};
 const stock=prepareNativeStockGroup(stockInput);
 const hn={...blank('TRANSFER_HEADER'),来源编号:transferKey,原单号:`SYNTHETIC-${tag}-${scope.isNew?'APPROVED':'DRAFT'}-001`,业务日期:b.now.slice(0,10),调出仓来源编号:first.source.sourceKey,调入仓来源编号:second.source.sourceKey,原审核状态:scope.isNew?'已审核':'未审核',备注:scope.isNew?'SYNTHETIC: approved original transfer included in cutoff baseline':'SYNTHETIC: unapproved history, no stock effect',创建厅归属来源:'UNKNOWN',创建厅归属原因:'UNKNOWN_ORIGINAL_CREATOR_UNMATCHED'};
 const hr={...hn};delete (hr as Record<string,string>).创建厅归属来源;delete (hr as Record<string,string>).创建厅归属原因;
 sources.TRANSFER_HEADER=csv('TRANSFER_HEADER',[hn]);const hs=source('TRANSFER_HEADER',transferKey,hr,hn);
 const headerInput:HistoryHeaderInput={batchId:b.batchId,fixedSourceNamespace:b.namespace,selection:{...selection('TRANSFER_HEADER',sources.TRANSFER_HEADER.sha256),entity:'TRANSFER_HEADER',path:'business/16历史调拨单头.csv'},source:hs,bindings:{调出仓来源编号:{sourceKey:first.source.sourceKey,nativeId:String(first.nativeSnapshot.id)},调入仓来源编号:{sourceKey:second.source.sourceKey,nativeId:String(second.nativeSnapshot.id)}},creatorHallOverlay:{evidenceRef:`${scope.root}/full/explicit-unknown-creator.csv#1`,file:hs.fileRef,sheet:hs.sheet,row:hs.rowNo,sourceId:transferKey,documentNumber:hn.原单号,personField:'原制单账号编号',personId:'',uploadedWarehouseDerivedHall:'',candidateCreatorHall:'',provenance:'UNKNOWN',reason:'UNKNOWN_ORIGINAL_CREATOR_UNMATCHED'}};
 const headers=prepareV3HistoryHeaderChunk([headerInput]);const header=headers.rows[0]!.prepared;
 const ln={...blank('TRANSFER_LINE'),来源编号:`SYNTHETIC-${tag}-TRANSFER-LINE-1`,单据来源编号:transferKey,原行号:'1',SKU来源编号:skuKey,原数量:'1',原款号:p.款号,原品名:p.商品名称,原颜色名称:sk.颜色名称,原版型名称:String(fit.nativeSnapshot.name),原完整尺码:sk.完整尺码};
 sources.TRANSFER_LINE=csv('TRANSFER_LINE',[ln]);
 const transferInput:V3HistoryChunk={batchId:b.batchId,fixedSourceNamespace:b.namespace,selection:{...selection('TRANSFER_LINE',sources.TRANSFER_LINE.sha256),entity:'TRANSFER_LINE',path:'business/17历史调拨明细.csv'},rows:[{source:source('TRANSFER_LINE',ln.来源编号,ln),header:{sourceKey:transferKey,nativeId:header.header.id},sku:{sourceKey:skuKey,nativeId:sku.nativeSku.id}}]};
 const transfers=prepareV3HistoryChunk(transferInput);
 const hall=b.parties.find(p=>p.source.entityType==='HALL'&&p.nativeSnapshot.id===first.nativeSnapshot.hall_id);assert.ok(hall);
 const methodKey=`SYNTHETIC-${tag}-IMPORTED-PAYMENT-METHOD`,accountKey=`SYNTHETIC-${tag}-IMPORTED-PAYMENT-ACCOUNT`;
 const paymentRows:{entity:NativePaymentEntity;key:string;raw:Record<string,string>;nativeId:string|null;references:Record<string,NativePaymentReference>}[]=[];
 const pm={来源编号:methodKey,方式名称:`SYNTHETIC ${tag} IMPORT METHOD`,状态:'正常'};
 const pa={来源编号:accountKey,账户显示名称:`SYNTHETIC ${tag} IMPORT ACCOUNT`,收款方式来源编号:methodKey,状态:'正常'};
 const ph={账户来源编号:accountKey,厅来源编号:hall.source.sourceKey};
 const methodSnapshot={id:id('paymentMethod','source-payment-method'),name:pm.方式名称,enabled:true,version:1};
 const accountSnapshot={id:id('paymentAccount','source-payment-account'),name:pa.账户显示名称,payment_method_id:methodSnapshot.id,enabled:true,version:1};
 paymentRows.push({entity:'PAYMENT_METHOD',key:methodKey,raw:pm,nativeId:methodSnapshot.id,references:{}},
  {entity:'PAYMENT_ACCOUNT',key:accountKey,raw:pa,nativeId:accountSnapshot.id,references:{收款方式来源编号:{entity:'PAYMENT_METHOD',sourceKey:methodKey,nativeId:methodSnapshot.id,nativeSnapshot:methodSnapshot}}},
  {entity:'PAYMENT_ACCOUNT_HALL',key:JSON.stringify([accountKey,hall.source.sourceKey]),raw:ph,nativeId:null,references:{账户来源编号:{entity:'PAYMENT_ACCOUNT',sourceKey:accountKey,nativeId:accountSnapshot.id,nativeSnapshot:accountSnapshot},厅来源编号:{entity:'HALL',sourceKey:hall.source.sourceKey,nativeId:String(hall.nativeSnapshot.id),nativeSnapshot:hall.nativeSnapshot}}});
 const paymentInputs:NativePaymentImportChunk[]=paymentRows.map(row=>{const artifact=csv(row.entity,[row.raw]);sources[row.entity]=artifact;return {batchId:b.batchId,fixedSourceNamespace:b.namespace,selection:{...selection(row.entity,artifact.sha256),entity:row.entity},rows:[{source:source(row.entity,row.key,row.raw),nativeId:row.nativeId,enabledMapping:row.nativeId===null?null:{raw:'正常',native:true,evidenceRef:`${scope.root}/full/explicit-payment-state-map`},references:row.references}]};});
 const payments=paymentInputs.map(prepareNativePaymentImportChunk);
 const paymentPreparedRows=payments.flatMap(p=>p.rows);
 const approvedScheme=nativeBarcodeSchemeInitializationRows26().find(r=>r.native.status==='CURRENT')!;assert.ok(approvedScheme);
 const bn={...blank('BARCODE'),来源编号:`SYNTHETIC-${tag}-EXPLICIT-BARCODE`,条码:scope.isNew?'831000000000001':'897000000000001',SKU来源编号:skuKey,条码性质:'主码',原条码方案:approvedScheme.native.name,状态:'正常',绑定范围:'SKU',合并前SKU来源编号:skuKey,原始条码性质快照:'主码',主旧码归一化依据:'EXISTING_MAIN_REPRESENTATIVE_THEN_STABLE_SOURCE_ID'};
 sources.BARCODE=csv('BARCODE',[bn]);
 const barcodeInput:NativeBarcodeInput={batchId:b.batchId,fixedSourceNamespace:b.namespace,selection:{...selection('BARCODE',sources.BARCODE.sha256),source:'V3_BARCODE_REPLACEMENT',entity:'BARCODE',path:'business/03历史条码.csv',excludedSourceIdsSetSha256:requestHash([])},source:source('BARCODE',bn.来源编号,bn),nativeBarcodeId:id('barcode','explicit-imported-barcode'),sku:{canonicalSourceKey:skuKey,nativeId:sku.nativeSku.id,oldSourceSkuKey:skuKey},scheme:{id:approvedScheme.native.id,snapshot:approvedScheme.native as unknown as JsonObject}};
 const barcode=prepareNativeBarcode(barcodeInput);
 const customer=b.parties.find(r=>r.nativeSnapshot.id===b.refs.customerId)!,salesperson=b.parties.find(r=>r.nativeSnapshot.id===b.refs.salesperson.nativeStaffId)!;assert.ok(customer&&salesperson);
 const salesKey=`SYNTHETIC-${tag}-DRAFT-SALES`,sn={...blank('SALES_HEADER'),来源编号:salesKey,原单号:`SYNTHETIC-${tag}-SALES-001`,业务日期:b.now.slice(0,10),单据类型:'销售',所属厅来源编号:hall.source.sourceKey,客户来源编号:customer.source.sourceKey,仓库来源编号:first.source.sourceKey,营业员来源编号:salesperson.source.sourceKey,优惠前金额:'16.00',整单优惠:'0.00',应结金额:'16.00',原审核状态:'未审核',创建厅归属来源:'UNKNOWN',创建厅归属原因:'UNKNOWN_ORIGINAL_CREATOR_UNMATCHED'};
 const sr={...sn};delete (sr as Record<string,string>).创建厅归属来源;delete (sr as Record<string,string>).创建厅归属原因;
 sources.SALES_HEADER=csv('SALES_HEADER',[sn]);const shSource=source('SALES_HEADER',salesKey,sr,sn);
 const salesHeaderInput:HistoryHeaderInput={batchId:b.batchId,fixedSourceNamespace:b.namespace,selection:{...selection('SALES_HEADER',sources.SALES_HEADER.sha256),entity:'SALES_HEADER',path:'business/13历史销货单头.csv'},source:shSource,bindings:{所属厅来源编号:{sourceKey:hall.source.sourceKey,nativeId:String(hall.nativeSnapshot.id)},客户来源编号:{sourceKey:customer.source.sourceKey,nativeId:String(customer.nativeSnapshot.id)},仓库来源编号:{sourceKey:first.source.sourceKey,nativeId:String(first.nativeSnapshot.id)},营业员来源编号:{sourceKey:salesperson.source.sourceKey,nativeId:String(salesperson.nativeSnapshot.id)}},creatorHallOverlay:{evidenceRef:`${scope.root}/full/explicit-unknown-sales-creator#1`,file:shSource.fileRef,sheet:shSource.sheet,row:shSource.rowNo,sourceId:salesKey,documentNumber:sn.原单号,personField:'营业员来源编号',personId:salesperson.source.sourceKey,uploadedWarehouseDerivedHall:'',candidateCreatorHall:'',provenance:'UNKNOWN',reason:'UNKNOWN_ORIGINAL_CREATOR_UNMATCHED'}};
 const salesHeaders=prepareV3HistoryHeaderChunk([salesHeaderInput]),salesHeader=salesHeaders.rows[0]!.prepared,h=salesHeader.header as HistorySalesHeader;
 const headerBinding={sourceKey:salesKey,nativeId:h.id,sourceRowId:shSource.id,sourceFileSha256:shSource.sourceFileSha256,rowSha256:shSource.rowSha256,version:1 as const};
 const salesRows=Array.from({length:16},(_,i)=>({...blank('SALES_LINE'),来源编号:`SYNTHETIC-${tag}-SALES-LINE-${i+1}`,单据来源编号:salesKey,原行号:String(i+1),SKU来源编号:skuKey,原数量:'1',原参考价:'1.00',原成交单价:'1.00',原行金额:'1.00',原分摊优惠:'0.00',原赠品标记:'否',原定价方式:'UNIT_PRICE',原普通零价确认:'否',原款号:p.款号,原品名:p.商品名称,原颜色名称:sk.颜色名称,原版型名称:String(fit.nativeSnapshot.name),原完整尺码:sk.完整尺码,原使用条码:bn.条码}));
 const settlementRows=Array.from({length:16},(_,i)=>({...blank('SETTLEMENT'),来源编号:`SYNTHETIC-${tag}-SETTLEMENT-${i+1}`,单据来源编号:salesKey,原收退行号:String(i+1),账户来源编号:accountKey,方向:'收款',金额:'1.00',原账户显示名:pa.账户显示名称,原方式显示名:pm.方式名称,原收款方式来源编号:methodKey}));
 sources.SALES_LINE=csv('SALES_LINE',salesRows);sources.SETTLEMENT=csv('SETTLEMENT',settlementRows);
 const salesSources=salesRows.map((row,i)=>source('SALES_LINE',row.来源编号,{...row,原行金额:'1.00000000000001'},row,i+1));
 const settlementSources=settlementRows.map((row,i)=>source('SETTLEMENT',row.来源编号,{...row,金额:'1.00000000000001'},row,i+1));
 // These32 candidates point to actual selected source cells/bytes. This builder
 // deliberately does NOT construct an approval Map. Only externally supplied
 // reviewed exact cells may enter prepareCurrentRuntime26MoneyBranch below.
 const moneyCellCandidates:MoneyApproval[]=[...salesSources.map(s=>({fileSha256:s.sourceFileSha256,sheet:s.sheet,row:s.rowNo,sourceId:s.sourceKey,field:'原行金额',rawValue:String(s.rawFields.原行金额),exactCentValue:'1.00'})),...settlementSources.map(s=>({fileSha256:s.sourceFileSha256,sheet:s.sheet,row:s.rowNo,sourceId:s.sourceKey,field:'金额',rawValue:String(s.rawFields.金额),exactCentValue:'1.00'}))];
 const moneyCandidateArtifact=mappingCsv(`provenance/${tag.toLowerCase()}-money-cell-candidates.csv`,moneyCellCandidates.map(c=>({...c})));
 const salesInputCandidate={batchId:b.batchId,fixedSourceNamespace:b.namespace,selection:{...selection('SALES_LINE',sources.SALES_LINE.sha256),entity:'SALES_LINE' as const,path:'business/14历史销货明细.csv' as const,aliasCsvSha256:aliasArtifact.sha256},rows:salesSources.map(s=>({source:s,header:headerBinding,sku:{oldSourceSkuKey:skuKey,canonicalSourceKey:skuKey,nativeId:sku.nativeSku.id,aliasSourceRowId:ss.id,importRecordId:sku.importRecord.id}}))};
 const paymentBinding=(row:typeof paymentPreparedRows[number])=>({entity:row.entity as 'PAYMENT_METHOD'|'PAYMENT_ACCOUNT',sourceKey:row.source.sourceKey,nativeId:String(row.nativeSnapshot.id),sourceRowId:row.source.id,sourceFileSha256:row.source.sourceFileSha256,rowSha256:row.source.rowSha256,fingerprint:row.fingerprint,nativeSnapshot:row.nativeSnapshot});
 const settlementInputCandidate={batchId:b.batchId,fixedSourceNamespace:b.namespace,selection:{...selection('SETTLEMENT',sources.SETTLEMENT.sha256),entity:'SETTLEMENT' as const,path:'business/15历史收退记录.csv' as const},rows:settlementSources.map(s=>({source:s,header:headerBinding,account:paymentBinding(paymentPreparedRows[1]!),method:paymentBinding(paymentPreparedRows[0]!)}))};
 const salesSourceProjection=historyClosureProjectionRow26('import_source_row',sourceRow(shSource,{...salesHeader.fieldProvenance,history_header_staging:{validator_version:'V3_HISTORY_HEADER_STAGE_1',fingerprint:salesHeader.fingerprint,selection:salesHeader.selection as unknown as JsonObject}}));
 const salesTypedProjection=historyClosureProjectionRow26('history_sales_header',{id:h.id,source_row_id:h.sourceRowId,batch_id:h.batchId,version:h.version,number:h.number,business_date:h.businessDate,source_status:h.sourceStatus,note:h.note,created_by_source_key:h.createdBySourceKey,approved_by_source_key:h.approvedBySourceKey,created_hall_id:h.createdHallId,created_hall_provenance:h.createdHallProvenance,created_hall_reason:h.createdHallReason,created_local_at:h.createdLocalAt,updated_local_at:h.updatedLocalAt,approved_local_at:h.approvedLocalAt,created_instant:h.createdInstant,updated_instant:h.updatedInstant,approved_instant:h.approvedInstant,business_type:h.businessType,hall_id:h.hallId,customer_id:h.customerId,warehouse_id:h.warehouseId,salesperson_id:h.salespersonId,gross_amount:h.grossAmount,order_discount:h.orderDiscount,net_due:h.netDue});
 const emptySources=CURRENT_FULL_EMPTY_ENTITIES.map(entity=>({...csv(entity,[]),reason:'EXPLICIT_EMPTY_SYNTHETIC_SOURCE' as const}));
 const warehouseScope=warehouses.map(w=>({sourceKey:w.source.sourceKey,nativeId:String(w.nativeSnapshot.id),signedQuantity:w.nativeSnapshot.id===first.nativeSnapshot.id?'10':'0',basis:w.nativeSnapshot.id===first.nativeSnapshot.id?'EXACT_SIGNED_CONTRIBUTORS':'EXPLICIT_SYNTHETIC_ZERO_TARGET'}));
 const headerModule=await import(new URL('../../scripts/import-v3/native-transfer-header-source26.mjs',import.meta.url).href) as {transferHeaderProjection26(p:typeof header):{sourceRow:HistoryClosureRow;typedRow:HistoryClosureRow;document:{kind:'TRANSFER';sourceKey:string;headerSourceRowId:string;headerId:string}}};
 const lineModule=await import(new URL('../../scripts/import-v3/native-transfer-line-source26.mjs',import.meta.url).href) as {transferLineSourceEvidence26(row:typeof transfers.rows[number],selection:typeof transfers.selection):JsonObject};
 const hp=headerModule.transferHeaderProjection26(header),pe=nativeProductImportEvidence26(product,0);
 const groups={PRODUCTS:{sourceRows:[historyClosureProjectionRow26('import_source_row',pe.source)],typedRows:[historyClosureProjectionRow26('product',product.nativeProducts[0])]},SKUS:{sourceRows:sku.aliases.map(a=>historyClosureProjectionRow26('import_source_row',nativeSkuAliasEvidence26(sku,a))),typedRows:[historyClosureProjectionRow26('sku',sku.nativeSku),...sku.aliases.map(a=>historyClosureProjectionRow26('import_sku_alias',{batch_id:b.batchId,old_source_sku_id:a.source.sourceKey,canonical_sku_id:sku.nativeSku.id,source_row_id:a.source.id,canonical_source_key:sku.canonicalSource.sourceKey,mapping_basis:a.mapping.mappingBasis}))]},STOCK_CONTRIBUTORS:{sourceRows:stock.contributors.map(c=>historyClosureProjectionRow26('import_source_row',nativeStockSourceEvidence(stock,c))),typedRows:stock.contributors.map(c=>historyClosureProjectionRow26('import_stock_contributor',nativeStockPublicationContributor26(stock,c)))},HEADERS:{sourceRows:[hp.sourceRow,salesSourceProjection],typedRows:[hp.typedRow,salesTypedProjection]},TRANSFER_LINES:{sourceRows:transfers.rows.map(row=>historyClosureProjectionRow26('import_source_row',lineModule.transferLineSourceEvidence26(row,transfers.selection))),typedRows:transfers.rows.map(row=>historyClosureProjectionRow26('history_transfer_line',row.line))},BARCODES:{sourceRows:[historyClosureProjectionRow26('import_source_row',nativeBarcodeSourceEvidence(barcode))],typedRows:[historyClosureProjectionRow26('sku_barcode',barcode.nativeBarcode),...(b.database===CURRENT_REWRITE_SYNTHETIC_TARGET?nativeBarcodeSchemeInitializationRows26().map(s=>historyClosureProjectionRow26('barcode_scheme',s.native)):[])]},PAYMENT:{sourceRows:paymentPreparedRows.map(row=>historyClosureProjectionRow26('import_source_row',nativePaymentSourceEvidence(row))),typedRows:paymentPreparedRows.flatMap(row=>[historyClosureProjectionRow26('import_native_payment_binding',nativePaymentBindingEvidence(row)),historyClosureProjectionRow26(row.entity==='PAYMENT_METHOD'?'payment_method_identity':row.entity==='PAYMENT_ACCOUNT'?'payment_account_identity':'payment_account_hall',row.entity==='PAYMENT_ACCOUNT_HALL'?row.nativeSnapshot:{id:row.nativeSnapshot.id})])},SALES_DETAILS:null as ClosureGroup|null,SETTLEMENTS:null as ClosureGroup|null};
 const observedContributors=stock.contributors.map(c=>({sourceRowId:c.source.id,sourceKey:c.source.sourceKey,sourceFileSha256:c.source.sourceFileSha256,rowSha256:c.source.rowSha256,fileRef:c.source.fileRef,sheet:c.source.sheet,rowNo:c.source.rowNo,warehouseSourceKey:stock.warehouse.sourceKey,canonicalSkuSourceKey:stock.sku.canonicalSourceKey,oldSkuSourceId:c.lineage.oldSkuSourceId,canonicalStockSourceKey:stockKey,warehouseId:stock.warehouse.nativeId,skuId:stock.sku.nativeId,signedQuantity:c.lineage.signedQuantity,sourceUnit:c.lineage.sourceUnit}));
 const effectiveGroups=[{canonicalStockSourceKey:stockKey,warehouseSourceKey:stock.warehouse.sourceKey,canonicalSkuSourceKey:stock.sku.canonicalSourceKey,warehouseId:stock.warehouse.nativeId,skuId:stock.sku.nativeId,signedQuantity:'10',sourceUnit:'件',contributorCount:2,effectiveRowHash:requestHash(stock.canonicalStock)}];
 const stockConservation={version:NATIVE_IMPORT_STOCK_CONSERVATION_VERSION,selectionSha256:b.pins.selectionSha256,effectiveStockCsvSha256:sources.INVENTORY_BASELINE.sha256,contributorLineageCsvSha256:lineageArtifact.sha256,contributorCount:2,effectiveGroupCount:1,contributorsManifestHash:nativeStockContributorsManifestHash(observedContributors),effectiveGroupsManifestHash:nativeStockEffectiveGroupsManifestHash(effectiveGroups),warehouses:warehouseScope.map(({basis:_basis,...w})=>w),warehouseUnits:[{warehouseSourceKey:first.source.sourceKey,sourceUnit:'件',signedQuantity:'10'}]};
 validateNativeStockConservationPlan(stockConservation);
 // Original executor26 stage kinds, in dependency order. These are data only;
 // the original source authorizer must approve them before the existing host
 // can execute them, capture v22, BIND, ACCOUNT, stage closure and PUBLISH.
 const stagingStepCandidates=[{kind:'PRODUCT' as const,payload:product},{kind:'SKU' as const,payload:sku},{kind:'STOCK_CONTRIBUTOR' as const,payload:stock},{kind:'HEADER' as const,payload:headers},{kind:'HEADER' as const,payload:salesHeaders},{kind:'TRANSFER_LINES' as const,payload:transfers}];
 const continuationStageCandidates=[...payments.map(payload=>({kind:'PAYMENT' as const,payload})),{kind:'BARCODE' as const,payload:barcode}];
 const result={blueprint:b,productInput,skuInput,stockInput,headerInput,transferInput,paymentInputs,barcodeInput,salesHeaderInput,salesInputCandidate,settlementInputCandidate,moneyCellCandidates,moneyCandidateArtifact,prepared:{product,sku,stock,headers,transfers,payments,barcode,salesHeaders,money:null as {salesDetails:PreparedHistorySalesDetailChunk;settlements:PreparedHistorySettlementChunk}|null},sources,sourceFiles,rawArtifacts,aliasArtifact,lineageArtifact,stockConservation,productReferenceDecisionCandidate:nativeProductReferenceDecision26(productInput.rows[0]!),emptySources,warehouseScope,groups,documents:[hp.document,{kind:'SALES' as const,sourceKey:salesKey,headerSourceRowId:shSource.id,headerId:h.id}],stagingStepCandidates,continuationStageCandidates,moneyStageCandidates:[] as {kind:'SALES_DETAIL'|'SETTLEMENT';payload:PreparedHistorySalesDetailChunk|PreparedHistorySettlementChunk}[],inventoryExpectedCounts:{WAREHOUSE:22,SKU:1,INVENTORY_LEDGER:1,IMPORT_BATCH:1},executionAuthorized:false as const};
 validateCurrentRuntime26FullSourceFixture(result);return result;
}
export type CurrentRuntime26FullSourceFixture=Awaited<ReturnType<typeof buildCurrentRuntime26FullSourceFixture>>;

/** Pure, deliberately incomplete byte projection. It is not the original V2
 * preflight bundle, a reviewed selection, or permission to materialize/import. */
export function rewrite26SyntheticSourceByteCandidates(f: CurrentRuntime26FullSourceFixture) {
 const b=f.blueprint;const scope=currentRuntime26SyntheticScope(b.database,b.batchId);
 assert.equal(scope.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.equal(scope.namespace,b.namespace);
 assert.equal(f.executionAuthorized,false);validateCurrentRuntime26FullSourceFixture(f);
 const originals=Object.entries(f.sourceFiles).map(([logicalPath,value])=>({logicalPath,utf8:value.utf8,bytes:value.bytes,sha256:value.sha256}))
   .sort((a,b)=>a.logicalPath.localeCompare(b.logicalPath));
 assert.equal(originals.length,43);
 assert.equal(b.counts.SUPPLIER,0);assert.equal(f.moneyCellCandidates.length,32);
 const supplemental=[csv('SUPPLIER',[]),csv('ISSUE',f.moneyCellCandidates.map((v,i)=>({
   问题编号:`SYNTHETIC-${scope.tag}-MONEY-CANDIDATE-${String(i+1).padStart(2,'0')}`,
   涉及页签:v.sheet,来源编号:v.sourceId,问题字段:v.field,来源原值:v.rawValue,
   问题说明:'合成来源尾差；待独立逐单元采纳',拟处理方式:`候选规范值${v.exactCentValue}`,
   核对结果:'UNADOPTED_NOT_EXECUTION_AUTHORITY'})))];
 const tables=[...Object.values(f.sources).map(v=>({entity:v.entity,path:v.path,utf8:v.utf8,bytes:v.bytes,sha256:v.sha256,rows:v.rowCount})),
   ...supplemental.map(v=>({entity:v.entity,path:v.path,utf8:v.utf8,bytes:v.bytes,sha256:v.sha256,rows:v.rowCount})),
   ...b.partyArtifacts.map(v=>({entity:v.entity,path:v.fileRef,utf8:v.utf8,bytes:Buffer.byteLength(v.utf8,'utf8'),sha256:v.sha256,
     rows:b.parties.filter(row=>row.source.entityType===v.entity).length}))].sort((a,b)=>a.path.localeCompare(b.path));
 assert.equal(new Set(tables.map(v=>v.path)).size,tables.length);
 // Derive audit candidates from actual signed contributors and explicit targets.
 const lines=f.stockInput.contributors.map(c=>c.lineage), stock=f.stockInput.canonicalStock;
 assert.equal(lines.length,2);assert.ok(lines.every(l=>l.warehouseSourceId===stock.仓库来源编号 && l.canonicalStockRowSourceId===stock.来源编号 && l.canonicalSkuSourceId===stock.SKU来源编号 && l.productSourceId===lines[0]!.productSourceId && l.sourceUnit===lines[0]!.sourceUnit));
 const stockQuantity=stock.核准库存数量,stockWarehouse=stock.仓库来源编号;assert.ok(typeof stockQuantity==='string');assert.ok(typeof stockWarehouse==='string');
 const input=lines.reduce((sum,l)=>sum+BigInt(l.signedQuantity),0n),output=BigInt(stockQuantity);
 assert.equal(input,output);assert.equal(f.stockConservation.warehouseUnits.length,1);
 const unit=f.stockConservation.warehouseUnits[0]!;assert.equal(unit.warehouseSourceKey,stock.仓库来源编号);assert.equal(unit.sourceUnit,lines[0]!.sourceUnit);assert.equal(BigInt(unit.signedQuantity),output);
 const unitAudit=mappingCsv('audit/independent-verification/warehouse-unit-reconciliation.csv',[{warehouse:unit.warehouseSourceKey,unit:unit.sourceUnit,before:input.toString(),after:unit.signedQuantity,difference:(input-BigInt(unit.signedQuantity)).toString()}]);
 const productAudit=mappingCsv('audit/warehouse-product-stock-conservation.csv',[{warehouseSourceId:stockWarehouse,productSourceId:lines[0]!.productSourceId,inputSignedQuantity:input.toString(),outputSignedQuantity:output.toString(),exactDifference:(input-output).toString()}]);
 const warehouseAudit=mappingCsv('audit/independent-verification/all-53-warehouses.csv',f.warehouseScope.map(w=>{
   const party=b.parties.find(p=>p.source.entityType==='WAREHOUSE' && p.source.sourceKey===w.sourceKey);assert.ok(party);
   const before=lines.filter(l=>l.warehouseSourceId===w.sourceKey).reduce((sum,l)=>sum+BigInt(l.signedQuantity),0n),after=BigInt(w.signedQuantity);assert.equal(before,after);
   return {warehouse:w.sourceKey,name:String(party.nativeSnapshot.name),before:before.toString(),after:after.toString(),difference:(before-after).toString()};
 }));
 const jsonArtifact=(path:string,value:unknown,rows:number)=>{const utf8=JSON.stringify(value);return {path,utf8,bytes:Buffer.byteLength(utf8,'utf8'),sha256:sha(utf8),rowCount:rows};};
 // The only synthetic history customer is present in the normal customer table.
 assert.ok(b.parties.some(p=>p.source.entityType==='CUSTOMER' && p.source.sourceKey===f.salesHeaderInput.source.normalizedFields['客户来源编号']));
 const auxiliaryFiles=[jsonArtifact('schema/normalized-business-columns.json',IMPORT_V2_TABLES,IMPORT_V2_TABLES.length),jsonArtifact('dictionaries/historical-customers.json',[],0),f.aliasArtifact,f.lineageArtifact,unitAudit,productAudit,warehouseAudit];
 const catalogue={logicalPath:b.catalogueArtifact.fileRef,utf8:b.catalogueArtifact.utf8,
   bytes:Buffer.byteLength(b.catalogueArtifact.utf8,'utf8'),sha256:b.catalogueArtifact.sha256};
 for(const item of [...originals,...tables,...auxiliaryFiles,catalogue]) {
   assert.equal(item.bytes,Buffer.byteLength(item.utf8,'utf8'));assert.equal(item.sha256,sha(item.utf8));
 }
 const payloadFiles=[...tables,...auxiliaryFiles].map(v=>({file:v.path,bytes:v.bytes,sha256:v.sha256}));
 const sourcePins=[...originals.map(v=>[v.logicalPath,v.sha256] as const),
   ...b.partyArtifacts.map(v=>[v.fileRef,v.sha256] as const),[catalogue.logicalPath,catalogue.sha256] as const];
 assert.equal(new Set(sourcePins.map(([path])=>path)).size,sourcePins.length);
 const manifest={importReady:false as const,payloadFiles,payloadBytes:payloadFiles.reduce((sum,v)=>sum+v.bytes,0),
   sourceInputSha256:Object.fromEntries(sourcePins)};
 const manifestUtf8=JSON.stringify(manifest);
 const omitted=IMPORT_V2_TABLES.filter(t=>!tables.some(v=>v.entity===t.entity)).map(t=>({entity:t.entity,path:t.file}));
 return {kind:'UNREVIEWED_SYNTHETIC_BYTE_CANDIDATES_V1' as const,executionAuthorized:false as const,
   database:b.database,batchId:b.batchId,fixedSourceNamespace:b.namespace,syntheticTime:b.now,
   originals,tables,auxiliaryFiles,catalogue,manifestCandidate:{utf8:manifestUtf8,bytes:Buffer.byteLength(manifestUtf8,'utf8'),sha256:sha(manifestUtf8),
     completeV2Preflight:false as const,omittedBusinessTables:omitted},
   selectionCandidate:{state:'UNREVIEWED_NOT_A_SELECTION_SCHEMA' as const,source:'BASE_V2' as const,
     files:tables.map(v=>({entity:v.entity,path:v.path,bytes:v.bytes,sha256:v.sha256,rows:v.rows})),
     missingBusinessTables:omitted,externalSelectionAndApprovalRequired:true as const}};
}
/** Materializable source-only candidates. Reviews and execution authority remain
 * externally supplied; paths describe where the caller will write these bytes. */
export function rewrite26CaptureCandidates(f:CurrentRuntime26FullSourceFixture, directory:string){
 const b=f.blueprint;assert.equal(b.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.ok(isAbsolute(directory));validateCurrentRuntime26FullSourceFixture(f);
 const artifact=(name:string,utf8:string)=>({path:join(directory,name),utf8,bytes:Buffer.byteLength(utf8,'utf8'),sha256:sha(utf8)});
 const ref=(v:{path:string;bytes:number;sha256:string})=>({path:v.path,bytes:v.bytes,sha256:v.sha256});
 const captures=(['BARCODE','SALES_HEADER'] as const).map(entity=>{
  const input=entity==='BARCODE'?f.barcodeInput:f.salesHeaderInput, source=input.source;
  const original=artifact(`${entity}-original.json`,f.sourceFiles[source.fileRef]!.utf8);
  const records=artifact(`${entity}-records.json`,JSON.stringify([input]));
  const originals=artifact(`${entity}-originals.json`,JSON.stringify([{rawLine:f.rawArtifacts[`${entity}:${source.sourceKey}`]!.utf8.trimEnd(),sourceFile:{logicalPath:source.fileRef,...ref(original)}}]));
  const canonicalCsv=artifact(`${entity}-canonical.csv`,f.sources[entity]!.utf8);
  const references=entity==='BARCODE'?{sku:f.barcodeInput.sku,scheme:f.barcodeInput.scheme}:{bindings:f.salesHeaderInput.bindings,creatorHallOverlay:f.salesHeaderInput.creatorHallOverlay,temporalEvidence:f.salesHeaderInput.temporalEvidence??{}};
  const nativeId=entity==='BARCODE'?f.barcodeInput.nativeBarcodeId:f.prepared.salesHeaders.rows[0]!.prepared.header.id;
  const nativeBindings=artifact(`${entity}-native-bindings.json`,JSON.stringify([{sourceKey:source.sourceKey,sourceRowId:source.id,nativeId,references}]));
  return {entity,artifacts:[original,records,originals,canonicalCsv,nativeBindings],recipeInputs:{records:ref(records),originals:ref(originals),canonicalCsv:ref(canonicalCsv),nativeBindings:ref(nativeBindings)}};
 });
 return {executionAuthorized:false as const,captures};
}

/** Offset source uses the actual raw UTF-8 lines, never fabricated rows. The
 * resulting base manifest hash must be fed back into the fixture pins before
 * any component candidate is independently reviewed. */
export function rewrite26OffsetSourceCandidates(f:CurrentRuntime26FullSourceFixture,directory:string){
 assert.ok(isAbsolute(directory));const projected=rewrite26SyntheticSourceByteCandidates(f);
 const entities=['SKU','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','INVENTORY_BASELINE','SALES_LINE','SETTLEMENT','TRANSFER_LINE'];
 const artifact=(path:string,utf8:string)=>({path,utf8,bytes:Buffer.byteLength(utf8,'utf8'),sha256:sha(utf8)});
 const rows=Object.values(f.rawArtifacts).map(v=>v.utf8.trimEnd()),snapshot=artifact(join(directory,'snapshots/all-business-source-rows.jsonl'),rows.map(v=>v+'\n').join(''));
 const base=JSON.parse(projected.manifestCandidate.utf8);base.payloadFiles.push({file:'snapshots/all-business-source-rows.jsonl',bytes:snapshot.bytes,sha256:snapshot.sha256});base.payloadBytes+=snapshot.bytes;
 const baseManifest=artifact(join(directory,'manifest.json'),JSON.stringify(base));
 const indexed=new Map(entities.map(e=>[e,[] as Record<string,unknown>[]])),counts=Object.fromEntries(IMPORT_V2_TABLES.map(t=>[t.entity,0]));let offset=0;
 for(const line of rows){const raw=JSON.parse(line) as {entity:string;sourceId:string;file:string;sheet:string;row:number;sourceSha256:string};assert.ok(Object.hasOwn(counts,raw.entity));const priorCount=counts[raw.entity];assert.ok(typeof priorCount==='number');counts[raw.entity]=priorCount+1;
  const length=Buffer.byteLength(line,'utf8');if(indexed.has(raw.entity))indexed.get(raw.entity)!.push({entity:raw.entity,sourceKey:raw.sourceId,sourceLocator:{file:raw.file,sheet:raw.sheet,row:raw.row,sourceSha256:raw.sourceSha256},identityKind:raw.sourceId?'ORIGINAL_SOURCE_KEY_AND_LOCATOR':'ORIGINAL_LOCATOR_ONLY',offset,length,sha256:sha(line)});offset+=length+1;}
 const indices=entities.map(entity=>{const list=indexed.get(entity)!;assert.ok(list.length>0);return {...artifact(join(directory,'indices',entity+'.jsonl'),list.map(row=>JSON.stringify(row)+'\n').join('')),entity,rows:list.length};});
 const source={path:snapshot.path,bytes:snapshot.bytes,sha256:snapshot.sha256,rows:rows.length};
 const indexManifest=artifact(join(directory,'indices/INDEX.json'),JSON.stringify({version:'MATERIALIZED_SOURCE_OFFSET_INDEX_CANDIDATE_V1',status:'COMPLETE_PINNED_SOURCE_INDEX_NOT_NATIVE_AUTHORITY',source,manifest:{path:baseManifest.path,sha256:baseManifest.sha256},indexRows:indices.reduce((n,v)=>n+v.rows,0),indexBytes:indices.reduce((n,v)=>n+v.bytes,0),expectedEntityCounts:counts,observedEntityCounts:{...counts},artifacts:indices.map(({entity,path,rows,bytes,sha256})=>({entity,path,rows,bytes,sha256})),offsetEncoding:'UTF8_BYTE_OFFSET_LENGTH_EXCLUDES_LF_RETAINS_CR_V1',scannedOriginalWorkbooks:false,scannedVerifiedHeaderGzip:false,nativeUUIDsAllocated:0,sql:false,importAuthorized:false}));
 return {snapshot,baseManifest,indices,indexManifest,executionAuthorized:false as const};
}

/** Original party reader candidate bytes; independent component review is external. */
export function rewrite26PartyCandidates(f:CurrentRuntime26FullSourceFixture,directory:string){
 const b=f.blueprint;assert.equal(b.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.ok(isAbsolute(directory));validateCurrentRuntime26FullSourceFixture(f);
 const artifact=(name:string,value:unknown)=>{const utf8=JSON.stringify(value);return {path:join(directory,name),utf8,bytes:Buffer.byteLength(utf8,'utf8'),sha256:sha(utf8)};};
 const component=artifact('party-reference-candidates.json',b.partySourceCandidates);
 const manifest=artifact('review-candidate-manifest.json',{version:'NATIVE_BINDING_REVIEW_CANDIDATE_V1',batchId:b.batchId,fixedSourceNamespace:b.namespace,cutoffAt:b.now,selectionSha256:b.pins.selectionSha256,parties:b.partySourceCandidates.length,files:[{name:'party-reference-candidates.json',bytes:component.bytes,sha256:component.sha256}]});
 return {component,manifest,executionAuthorized:false as const};
}

/** Catalogue input already comes from the original synthetic blueprint; the
 * technical review is an externally supplied artifact. */
export function rewrite26CatalogueCandidate(f:CurrentRuntime26FullSourceFixture,path:string){
 assert.equal(f.blueprint.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.ok(isAbsolute(path));const utf8=JSON.stringify(f.blueprint.catalogueMappingCandidate);
 return {path,utf8,bytes:Buffer.byteLength(utf8,'utf8'),sha256:sha(utf8),executionAuthorized:false as const};
}

/** Source and reference candidates for the original product readers. Mapping
 * hashes must be the independently selected actual external mapping bytes. */
export function rewrite26ProductCandidates(f:CurrentRuntime26FullSourceFixture,directory:string,mapping:{catalogue:string;parties:string;season_source:string}){
 const b=f.blueprint;assert.equal(b.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.ok(isAbsolute(directory));for(const pin of Object.values(mapping))assert.match(pin,/^[a-f0-9]{64}$/);
 const artifact=(name:string,value:unknown)=>{const utf8=JSON.stringify(value);return {path:join(directory,name),utf8,bytes:Buffer.byteLength(utf8,'utf8'),sha256:sha(utf8)};};
 const binding={batchId:b.batchId,fixedSourceNamespace:b.namespace,cutoffAt:b.now,selectionSha256:b.pins.selectionSha256},original=f.productInput.rows[0]!;
 const row={...original,references:{...original.references,category:{...original.references.category!,mappingSha256:mapping.catalogue},sizeGroup:{...original.references.sizeGroup!,mappingSha256:mapping.catalogue}},seasonSelection:{...original.seasonSelection,mapping_sha256:mapping.season_source}};
 const component=artifact('product-source-candidates.json',[row.source]),sourceManifest=artifact('review-candidate-manifest.json',{version:'NATIVE_BINDING_REVIEW_CANDIDATE_V1',...binding,products:1,files:[{name:'product-source-candidates.json',sha256:component.sha256,bytes:component.bytes}]});
 const derived=artifact('product-derived-season.json',{version:'NATIVE_PRODUCT_SEASON_SELECTION_DERIVED_CANDIDATE_V1',batchId:b.batchId,fixedSourceNamespace:b.namespace,selectionSha256:b.pins.selectionSha256,sourceMappingSha256:mapping.season_source,dictionaryMappingSha256:mapping.catalogue,rows:[{sourceKey:row.source.sourceKey,nativeProductId:row.product.nativeId,sourceEvidenceHash:requestHash(row.source),seasonSelection:row.seasonSelection,derivedProofSha256:requestHash(row.seasonSelection)}]});
 const mappings={...mapping,derived_season_proofs:derived.sha256},references=artifact('product-reference-decisions.json',{schemaVersion:2,validatorVersion:NATIVE_PRODUCT_REFERENCE_DECISION_VERSION_26,schemaProfile:'EXACT26',batchId:b.batchId,fixedSourceNamespace:b.namespace,selection:f.productInput.selection,mappingFiles:Object.entries(mappings).map(([name,sha256])=>({name,sha256})),decisions:[nativeProductReferenceDecision26(row)]});
 const input={...f.productInput,rows:[row]},prepared=prepareNativeProductImportChunk26(input);
 return {component,sourceManifest,derived,references,input,prepared,executionAuthorized:false as const};
}
/** Update the candidate closure with the exact same mapped product input used
 * by the original reader; this remains a candidate, never source approval. */
export function rewrite26ApplyProductCandidate(f:CurrentRuntime26FullSourceFixture,candidate:ReturnType<typeof rewrite26ProductCandidates>):CurrentRuntime26FullSourceFixture{
 const next=structuredClone(f);next.productInput=candidate.input;next.prepared.product=candidate.prepared;next.productReferenceDecisionCandidate=nativeProductReferenceDecision26(candidate.input.rows[0]!);
 const evidence=nativeProductImportEvidence26(candidate.prepared,0);
 next.groups.PRODUCTS={sourceRows:[historyClosureProjectionRow26('import_source_row',evidence.source)],typedRows:[historyClosureProjectionRow26('product',candidate.prepared.nativeProducts[0])]};
 validateCurrentRuntime26FullSourceFixture(next);return next;
}

/** SKU decisions are deterministic source/reference projections. The reviewed
 * offset and catalogue pins are supplied after their independent adoption. */
export function rewrite26SkuCandidates(f:CurrentRuntime26FullSourceFixture,directory:string,refs:{indexManifestSha256:string;sourceReview:{path:string;sha256:string};catalogueMappingSha256:string;catalogueReviewSha256:string}){
 assert.equal(f.blueprint.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.ok(isAbsolute(directory)&&isAbsolute(refs.sourceReview.path));for(const pin of [refs.indexManifestSha256,refs.sourceReview.sha256,refs.catalogueMappingSha256,refs.catalogueReviewSha256])assert.match(pin,/^[a-f0-9]{64}$/);
 const b=f.blueprint,input=f.skuInput,prepared=f.prepared.sku,artifact=(name:string,utf8:string)=>({path:join(directory,name),utf8,bytes:Buffer.byteLength(utf8,'utf8'),sha256:sha(utf8)});
 const product=artifact('sku-product-snapshots.json',JSON.stringify({rows:[{sourceKey:input.references.product.sourceKey,native:input.references.product.nativeSnapshot}]}));
 const aliases=input.aliases.map(a=>({sourceKey:a.source.sourceKey,sourceEvidenceHash:requestHash(a.source),rawLineSha256:a.source.rowSha256,completeAliasCsvRowHash:requestHash(a.mapping),consumedMappingHash:requestHash(a.mapping)}));
 const canonical=input.canonicalSource.normalizedFields;
 const decision={canonicalSourceKey:input.canonicalSource.sourceKey,nativeSkuId:input.nativeSkuId,canonicalSourceEvidenceHash:requestHash(input.canonicalSource),canonicalCsvRowHash:requestHash(canonical),allocationNormalizedHash:requestHash(canonical),references:Object.fromEntries(Object.entries(input.references).map(([k,r])=>[k,{sourceKey:r.sourceKey,nativeId:r.nativeId,nativeSnapshotHash:requestHash(r.nativeSnapshot)}])),aliases,importRecord:input.importRecord,nativeSku:prepared.nativeSku,preparedFingerprint:prepared.fingerprint};
 const decisions=artifact('sku-decisions.jsonl',JSON.stringify(decision)+'\n');
 const manifest=artifact('sku-candidate-manifest.json',JSON.stringify({version:'NATIVE_SKU26_SOURCE_REFERENCE_CANDIDATE_V1',batchId:b.batchId,fixedSourceNamespace:b.namespace,cutoffAt:b.now,selectionSha256:b.pins.selectionSha256,selection:input.selection,rows:1,oldAliases:aliases.length,collisionGroups:0,collisionMembers:0,allPreparedSha256:sha(requestHash(prepared)+'\n'),artifact:{path:decisions.path,bytes:decisions.bytes,sha256:decisions.sha256,rows:1},sourceIndexManifestSha256:refs.indexManifestSha256,outsideSourceReview:refs.sourceReview,productSnapshotSha256:product.sha256,catalogueMappingSha256:refs.catalogueMappingSha256,catalogueReviewSha256:refs.catalogueReviewSha256,nativeReferenceApproved:false,importAuthorized:false}));
 return {decisions,manifest,product,executionAuthorized:false as const};
}

/** Source-only header bytes and decision; an actual independent receipt must
 * bind the gzip bytes before the reference manifest can be completed. */
export function rewrite26TransferHeaderCandidates(f:CurrentRuntime26FullSourceFixture,directory:string,refs:{partyReviewSha256:string;receiptFile:string;receiptSha256:string}){
 const b=f.blueprint;assert.equal(b.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.ok(isAbsolute(directory)&&isAbsolute(refs.receiptFile));assert.match(refs.partyReviewSha256,/^[a-f0-9]{64}$/);assert.match(refs.receiptSha256,/^[a-f0-9]{64}$/);
 const artifact=(name:string,value:unknown)=>{const utf8=JSON.stringify(value);return {path:join(directory,name),utf8,bytes:Buffer.byteLength(utf8,'utf8'),sha256:sha(utf8)};},record=(x:typeof f.headerInput|typeof f.salesHeaderInput)=>({source:x.source,selection:x.selection,creatorHallOverlay:x.creatorHallOverlay,temporalEvidence:x.temporalEvidence??{}}),transfer=record(f.headerInput),sales=record(f.salesHeaderInput);
 const rawUtf8=[transfer,sales].map(x=>JSON.stringify(x)+'\n').join(''),gz=gzipSync(Buffer.from(rawUtf8,'utf8'));
 const spool={path:join(directory,'headers.gz'),base64:gz.toString('base64'),bytes:gz.length,sha256:createHash('sha256').update(gz).digest('hex'),rawBytes:Buffer.byteLength(rawUtf8),rawSha256:sha(rawUtf8)};
 const prepared=f.prepared.headers.rows[0]!.prepared,header=prepared.header;
 const references=(['调出仓来源编号','调入仓来源编号'] as const).map(field=>{const sourceKey=String(transfer.source.normalizedFields[field]),party=b.partySourceCandidates.find(p=>p.source.entityType==='WAREHOUSE'&&p.source.sourceKey===sourceKey);assert.ok(party);const nativeId=party.nativeSnapshot.id;assert.ok(typeof nativeId==='string');const native={...party.nativeSnapshot,created_operation_id:null};return {field,entity:'WAREHOUSE',sourceKey,nativeId,nativeSnapshotHash:requestHash(native)};});
 const decision={entity:'TRANSFER_HEADER',sourceKey:transfer.source.sourceKey,sourceRowId:transfer.source.id,sourceContextHash:requestHash(transfer),normalizedRowHash:requestHash(transfer.source.normalizedFields),historyId:header.id,historyIdRule:'EXISTING_MAPPER_STABLE_IMPORT_ID',bindings:f.headerInput.bindings,references,historicalCustomerBinding:null,header,preparedFingerprint:prepared.fingerprint,fieldProvenanceHash:requestHash(prepared.fieldProvenance),temporalHash:requestHash(prepared.temporal)};
 const decisions=artifact('header-decisions.jsonl',decision);const decisionUtf8=decisions.utf8+'\n',lines={...decisions,utf8:decisionUtf8,bytes:Buffer.byteLength(decisionUtf8),sha256:sha(decisionUtf8)};
 const binding={batchId:b.batchId,fixedSourceNamespace:b.namespace,cutoffAt:b.now,selectionSha256:b.pins.selectionSha256};
 const manifest=artifact('header-candidate-manifest.json',{version:'NATIVE_TRANSFER_HEADER26_REFERENCE_CANDIDATE_V1',status:'TRANSFER_ONLY_REFERENCE_PENDING_NEW_JOIN_REVIEW',binding,rows:1,counts:{TRANSFER_HEADER:1},artifact:{path:lines.path,bytes:lines.bytes,sha256:lines.sha256,rows:1},preparedFingerprintStreamSha256:sha(prepared.fingerprint+'\n'),sourceContextStreamSha256:sha(requestHash(transfer)+'\n'),historyIdentityRule:'EXISTING_MAPPER_STABLE_IMPORT_ID',partyPartialReviewSha256:refs.partyReviewSha256,originalSourceProof:{receiptFile:refs.receiptFile,receiptSha256:refs.receiptSha256},full42561Passed:false,newNativeUUIDs:0,sql:0,executionAuthorized:false});
 return {spool,decisions:lines,manifest,executionAuthorized:false as const};
}

/** Reuse the original transfer-line binding preparer; exact independently
 * reviewed offset/header/SKU descriptors are provided by the caller. */
export async function rewrite26TransferLineCandidates(f:CurrentRuntime26FullSourceFixture,directory:string,refs:{originalSource:{path:string;bytes:number;sha256:string;rows:number};sourceIndexReview:{path:string;bytes:number;sha256:string};offsetIndex:{entity:string;path:string;bytes:number;sha256:string;rows:number};baseManifest:{path:string;bytes:number;sha256:string};headerReferenceReview:{path:string;bytes:number;sha256:string};skuReferenceReview:{path:string;bytes:number;sha256:string};headerDecisions:unknown[];skuDecisions:unknown[]}){
 const b=f.blueprint;assert.equal(b.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.ok(isAbsolute(directory));assert.equal(refs.baseManifest.sha256,b.pins.baseManifestSha256);
 const module=await import(new URL('../../scripts/import-v3/native-transfer-line-source26.mjs',import.meta.url).href) as {createNativeTransferLine26BindingPreparer(options:unknown):{prepare(options:unknown):{decision:unknown};finish():{headers:number;headerLineCounts:unknown[];preparedFingerprintStreamSha256:string;sourceEvidenceStreamSha256:string;perHeaderLineCountsSha256:string}}};
 const binding={batchId:b.batchId,fixedSourceNamespace:b.namespace,cutoffAt:b.now,selectionSha256:b.pins.selectionSha256},selection=f.transferInput.selection;
 const rawLine=f.rawArtifacts[`TRANSFER_LINE:${f.transferInput.rows[0]!.source.sourceKey}`]!.utf8.trimEnd(),canonical=f.transferInput.rows[0]!.source.normalizedFields;
 const preparer=module.createNativeTransferLine26BindingPreparer({binding,selection,headers:refs.headerDecisions,skus:refs.skuDecisions,expectedRows:1}),result=preparer.prepare({rawLine,canonical}),complete=preparer.finish();
 const artifact=(name:string,utf8:string,rows?:number)=>({path:join(directory,name),utf8,bytes:Buffer.byteLength(utf8,'utf8'),sha256:sha(utf8),...(rows===undefined?{}:{rows})});
 const rawRows=artifact('transfer-line-original.jsonl',rawLine+'\n',1),canonicalCsv=artifact('transfer-line-canonical.csv',f.sources.TRANSFER_LINE!.utf8,1),decisions=artifact('transfer-line-decisions.jsonl',JSON.stringify(result.decision)+'\n',1),headerLineCounts=artifact('transfer-line-header-counts.jsonl',complete.headerLineCounts.map(v=>JSON.stringify(v)+'\n').join(''),complete.headers);
 const desc=(v:{path:string;bytes:number;sha256:string;rows?:number})=>({path:v.path,bytes:v.bytes,sha256:v.sha256,rows:v.rows});
 const manifest=artifact('transfer-line-manifest.json',JSON.stringify({version:'NATIVE_TRANSFER_LINE26_SOURCE_REFERENCE_CANDIDATE_V1',status:'COMPLETE_SOURCE_REFERENCE_PENDING_C_REVIEW',binding,selection,rows:1,headers:complete.headers,originalSource:refs.originalSource,sourceIndexReview:refs.sourceIndexReview,offsetIndex:refs.offsetIndex,baseManifest:refs.baseManifest,rawRows:desc(rawRows),canonicalCsv:desc(canonicalCsv),decisions:desc(decisions),headerLineCounts:desc(headerLineCounts),headerReferenceReview:refs.headerReferenceReview,skuReferenceReview:refs.skuReferenceReview,preparedFingerprintStreamSha256:complete.preparedFingerprintStreamSha256,sourceEvidenceStreamSha256:complete.sourceEvidenceStreamSha256,perHeaderLineCountsSha256:complete.perHeaderLineCountsSha256,newNativeUUIDs:0,sql:0,executionAuthorized:false}));
 return {rawRows,canonicalCsv,decisions,headerLineCounts,manifest,executionAuthorized:false as const};
}

/** Stock reference candidate from the existing prepared signed group. The
 * party/SKU review hashes are independently supplied, not generated here. */
export function rewrite26StockCandidates(f:CurrentRuntime26FullSourceFixture,directory:string,refs:{partyReviewSha256:string;skuReviewSha256:string}){
 const b=f.blueprint;assert.equal(b.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.ok(isAbsolute(directory));for(const pin of Object.values(refs))assert.match(pin,/^[a-f0-9]{64}$/);
 const artifact=(name:string,utf8:string)=>({path:join(directory,name),utf8,bytes:Buffer.byteLength(utf8,'utf8'),sha256:sha(utf8)}),group=f.prepared.stock;
 const decisions=artifact('stock-decisions.jsonl',JSON.stringify(group)+'\n'),binding={batchId:b.batchId,fixedSourceNamespace:b.namespace,cutoffAt:b.now,selectionSha256:b.pins.selectionSha256};
 const manifest=artifact('stock-candidate-manifest.json',JSON.stringify({version:'NATIVE_STOCK26_REFERENCE_CANDIDATE_V1',status:'PENDING_NEW_NATIVE_STOCK_BINDING_REVIEW_NOT_AUTHORITY',binding,selection:f.stockInput.selection,groups:1,contributors:group.contributors.length,signedTotal:group.signedQuantity,negativeOriginal:group.contributors.filter(c=>BigInt(c.lineage.signedQuantity)<0n).length,negativeGroups:BigInt(group.signedQuantity)<0n?1:0,warehouseScope:f.warehouseScope.length,recordedWarehouses:1,approvedZeroWarehouseScope:f.warehouseScope.filter(w=>w.basis==='EXPLICIT_SYNTHETIC_ZERO_TARGET').length,skuReferenceReviewSha256:refs.skuReviewSha256,partyPartialReviewSha256:refs.partyReviewSha256,artifact:{path:decisions.path,bytes:decisions.bytes,sha256:decisions.sha256,groups:1,contributors:group.contributors.length},preparedFingerprintStreamSha256:sha(group.fingerprint+'\n'),newNativeUUIDs:0,sql:0,baselinePosted:false,executionAuthorized:false,sourceNormalization:'EXACT_SYNTHETIC_ORIGINAL_CELLS'}));
 return {decisions,manifest,executionAuthorized:false as const};
}

/** Exact existing PAYMENT reader candidate; externally reviewed refs remain
 * outside this function. The supplied artifact path is the eventual file path. */
export function rewrite26PaymentCandidate(f:CurrentRuntime26FullSourceFixture, artifactPath:string){
 const b=f.blueprint;assert.equal(b.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.ok(isAbsolute(artifactPath));validateCurrentRuntime26FullSourceFixture(f);
 const binding={batchId:b.batchId,fixedSourceNamespace:b.namespace,cutoffAt:b.now,selectionSha256:b.pins.selectionSha256};
 const prepared=f.prepared.payments;
 const sourceLocators=prepared.flatMap(c=>c.rows.map(r=>({entity:r.entity,sourceKey:r.source.sourceKey,originalSourceId:r.entity==='PAYMENT_ACCOUNT_HALL'?'':r.source.sourceKey,sourceLocator:{file:r.source.fileRef,sheet:r.source.sheet,row:Number(r.source.rowNo),sourceSha256:r.source.sourceFileSha256},rawLineSha256:r.source.rowSha256})));
 const data={version:'NATIVE_PAYMENT_SOURCE_REFERENCE_CANDIDATE_V1',...binding,prepared,sourceLocators,importAuthorized:false,nativeReferenceApproved:false};
 const utf8=JSON.stringify(data),artifact={path:artifactPath,utf8,bytes:Buffer.byteLength(utf8,'utf8'),sha256:sha(utf8)};
 const counts=Object.fromEntries(['PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL'].map(k=>[k,sourceLocators.filter(r=>r.entity===k).length]));
 const manifest={...binding,status:'SYNTHETIC_CANDIDATE_NOT_NATIVE_GRANT',counts,rows:sourceLocators.length,chunks:prepared.length,artifact:{path:artifact.path,bytes:artifact.bytes,sha256:artifact.sha256},nativeReferenceApproved:false,importAuthorized:false};
 return {artifact,manifest,executionAuthorized:false as const};
}

/** Captured money artifacts become available only after exact external money
 * adoption has been applied through prepareCurrentRuntime26MoneyBranch. */
export function rewrite26MoneyCaptureCandidates(f:CurrentRuntime26FullSourceFixture,directory:string){
 assert.equal(f.blueprint.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.ok(isAbsolute(directory));assert.ok(f.prepared.money&&f.groups.SALES_DETAILS&&f.groups.SETTLEMENTS,'External money adoption required');
 const artifact=(name:string,utf8:string)=>({path:join(directory,name),utf8,bytes:Buffer.byteLength(utf8,'utf8'),sha256:sha(utf8)});
 const ref=(v:{path:string;bytes:number;sha256:string})=>({path:v.path,bytes:v.bytes,sha256:v.sha256});
 const groups=([['SALES_DETAILS','SALES_LINE'],['SETTLEMENTS','SETTLEMENT']] as const).map(([group,entity])=>{
  const chunk=entity==='SALES_LINE'?f.prepared.money!.salesDetails:f.prepared.money!.settlements,projection=f.groups[group]!;
  const originals=chunk.input.rows.map(row=>{const s=row.source,original=artifact(`${entity}-original-${s.rowNo}.json`,f.sourceFiles[s.fileRef]!.utf8);return {original,rawLine:f.rawArtifacts[`${entity}:${s.sourceKey}`]!.utf8.trimEnd(),logicalPath:s.fileRef};});
  const originalList=artifact(`${entity}-originals.json`,JSON.stringify(originals.map(o=>({rawLine:o.rawLine,sourceFile:{logicalPath:o.logicalPath,...ref(o.original)}}))));
  const canonicalCsv=artifact(`${entity}-canonical.csv`,f.sources[entity]!.utf8);
  const sourceRows=artifact(`${entity}-source.jsonl`,ordered(projection.sourceRows).map(r=>JSON.stringify(r)).join('\n')+'\n');
  const typedRows=artifact(`${entity}-typed.jsonl`,ordered(projection.typedRows).map(r=>JSON.stringify(r)).join('\n')+'\n');
  const nativeBindings=artifact(`${entity}-native-bindings.json`,JSON.stringify(chunk.input.rows.map(row=>({sourceKey:row.source.sourceKey,rawRowSha256:row.source.rowSha256,bindings:entity==='SALES_LINE'?{header:row.header,sku:(row as NonNullable<typeof f.prepared.money>['salesDetails']['input']['rows'][number]).sku}:{header:row.header,account:(row as NonNullable<typeof f.prepared.money>['settlements']['input']['rows'][number]).account,method:(row as NonNullable<typeof f.prepared.money>['settlements']['input']['rows'][number]).method}}))));
  const descriptor=(file:typeof sourceRows,actualColumns:number)=>({...ref(file),rows:16,mode:'0600',entity,actualColumns});
  const manifest=artifact(`${entity}-manifest.json`,JSON.stringify({status:'ACTUAL_SOURCE_TYPED_PROJECTIONS_COMPLETED_REFERENCE_ONLY',referenceOnly:true,nativeBindingsVerified:false,PG:false,MAIN:false,PUBLISH:false,all11:false,actualPayloadHash:null,sourceRows:16,typedRows:16,artifacts:[descriptor(sourceRows,12),descriptor(typedRows,entity==='SALES_LINE'?21:11)]}));
  return {group,artifacts:[...originals.map(o=>o.original),originalList,canonicalCsv,sourceRows,typedRows,nativeBindings,manifest],recipe:{mode:'CAPTURED_MONEY' as const,manifest:ref(manifest),sourceRows:ref(sourceRows),typedRows:ref(typedRows),originals:ref(originalList),canonicalCsv:ref(canonicalCsv),nativeBindings:ref(nativeBindings),selection:chunk.input.selection}};
 });
 return {groups,executionAuthorized:false as const};
}

/** Wire the existing reader options from externally reviewed artifact refs.
 * Every path/ref remains caller-owned; this does not construct any review. */
export function rewrite26OriginalRecipeOptions(f:CurrentRuntime26FullSourceFixture,options:{authorizedPayloadHash:string;party:{directory:string;trustedManifestSha256:string;reviewRecordFile:string;trustedReviewRecordSha256:string};catalogue:{mappingFile:string;trustedMappingSha256:string;reviewApprovalFile:string;trustedReviewApprovalSha256:string};productSource:{directory:string;trustedManifestSha256:string;reviewRecordFile:string;trustedReviewRecordSha256:string};productReference:{referenceDecisionFile:string;trustedReferenceDecisionSha256:string;mappingFiles:Record<string,string>;reviewFile:string;trustedReviewSha256:string};skuReview:{reviewFile:string;trustedReviewSha256:string};skuProductSnapshotFile:string;baseDirectory:string;stockReview:{reviewFile:string;trustedReviewSha256:string};index:{indexManifestFile:string;trustedIndexManifestSha256:string;reviewFile:string;trustedReviewSha256:string};paymentReview:{reviewFile:string;trustedReviewSha256:string};headerReview:{reviewFile:string;trustedReviewSha256:string};headerOriginal:{spoolFile:string;receiptFile:string;trustedReceiptSha256:string};headerCacheParent:string;lineReviews:{sourceReviewFile:string;trustedSourceReviewSha256:string;referenceReviewFile:string;trustedReferenceReviewSha256:string};salesHeaderCapture:unknown;barcodeCapture:unknown;moneyCaptures:ReturnType<typeof rewrite26MoneyCaptureCandidates>}){
 const b=f.blueprint;assert.equal(b.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.match(options.authorizedPayloadHash,/^[a-f0-9]{64}$/);
 const binding={batchId:b.batchId,fixedSourceNamespace:b.namespace,cutoffAt:b.now,selectionSha256:b.pins.selectionSha256},authorizedPayloadHash=options.authorizedPayloadHash;
 const sku={...options.skuReview,binding,authorizedPayloadHash,baseDirectory:options.baseDirectory,productSnapshotFile:options.skuProductSnapshotFile,catalogue:options.catalogue};
 const ordinary={PARTIES:{binding,authorizedPayloadHash,source:options.party,historical:null,chunkRows:100},CATALOGUE:{...options.catalogue,binding},PRODUCTS:{binding,authorizedPayloadHash,source:options.productSource,reference:options.productReference,chunkRows:100},SKUS:sku,STOCK_CONTRIBUTORS:{...options.stockReview,binding,authorizedPayloadHash,source:{...options.index,baseDirectory:options.baseDirectory},references:{parties:options.party,skus:options.skuReview}},PAYMENT:{...options.paymentReview,binding,authorizedPayloadHash},TRANSFER_LINES:{...options.lineReviews,binding,authorizedPayloadHash}};
 const sales=options.moneyCaptures.groups.find(x=>x.group==='SALES_DETAILS'),settlements=options.moneyCaptures.groups.find(x=>x.group==='SETTLEMENTS');assert.ok(sales&&settlements);
 return {ordinary,transferHeader:{...options.headerReview,binding,authorizedPayloadHash,originalSource:options.headerOriginal,parties:options.party,cacheParent:options.headerCacheParent},salesHeaderCapture:options.salesHeaderCapture,barcodeCapture:options.barcodeCapture,salesDetails:sales.recipe,settlements:settlements.recipe,productEvidence:{...options.productSource,binding}};
}

/** Read the original bootstrap-bound party factory to build a pre-CORE
 * continuation candidate. Its warehouse items are the original CORE command;
 * the live reader still requires committed CORE readback before continuation. */
export async function rewrite26CoreProjectionCandidate(f:CurrentRuntime26FullSourceFixture,party:{report:{bootstrapAccountsCovered?:boolean};verify():Promise<void>;authorize(chunk:PreparedNativePartyImportChunk):Promise<void>;chunks():AsyncIterable<PreparedNativePartyImportChunk>},coreCommand:{action:string;batchId:string;actorAccountId:string;requestKey:string;sourceHash:string;coreInitialization:{coreSourceDigest:string};items:readonly unknown[]}){
 const b=f.blueprint;assert.equal(b.database,CURRENT_REWRITE_SYNTHETIC_TARGET);assert.equal(party.report.bootstrapAccountsCovered,true,'Original bootstrap-bound party source required');
 assert.equal(coreCommand.action,'IMPORT_CORE_STAGE');assert.equal(coreCommand.batchId,b.batchId);assert.equal(coreCommand.actorAccountId,b.refs.importer.nativeAccountId);assert.equal(coreCommand.sourceHash,b.pins.selectionSha256);assert.match(coreCommand.coreInitialization.coreSourceDigest,/^[a-f0-9]{64}$/);assert.equal(coreCommand.items.length,22);
 const coreMembers:{sourceRowId:string;entity:string;sourceKey:string;nativeId:unknown}[]=[],staffProofs:{sourceRowId:string;bootstrapAccounts:unknown}[]=[],members:{sourceRowId:string;entity:string;sourceKey:string;nativeId:unknown;version:unknown;nativeSnapshot:Record<string,unknown>;operations:never[]}[]=[];
 await party.verify();for await(const chunk of party.chunks()){await party.authorize(chunk);for(const row of chunk.rows){const input=row.input,sourceRowId=input.source.id,entity=row.entity,sourceKey=input.source.sourceKey,nativeSnapshot=structuredClone(input.nativeSnapshot),nativeId=nativeSnapshot.id;assert.equal(nativeSnapshot.version,1);
  coreMembers.push({sourceRowId,entity,sourceKey,nativeId});members.push({sourceRowId,entity,sourceKey,nativeId,version:1,nativeSnapshot,operations:[]});
  if(entity==='STAFF'){const fields=input.source.fieldProvenance.fields;assert.ok(fields!==null&&typeof fields==='object'&&!Array.isArray(fields),'Original staff field provenance required');const proof=fields.bootstrap_accounts;assert.ok(proof,'Original bound account proof required');staffProofs.push({sourceRowId,bootstrapAccounts:structuredClone(proof)});}
 }}await party.verify();assert.equal(coreMembers.length,115);assert.equal(staffProofs.length,49);
 coreMembers.sort((a,c)=>a.sourceRowId.localeCompare(c.sourceRowId));members.sort((a,c)=>a.sourceRowId.localeCompare(c.sourceRowId));staffProofs.sort((a,c)=>a.sourceRowId.localeCompare(c.sourceRowId));
 return {core:{receiptId:stableImportId('operation',coreCommand.actorAccountId,coreCommand.requestKey),coreSourceDigest:coreCommand.coreInitialization.coreSourceDigest},warehouses:structuredClone(coreCommand.items),coreProjection:{coreMembers,staffProofs,coreMaintenanceBinding:{version:'CORE_MAINTENANCE_BINDING_V1',members}},executionAuthorized:false as const};
}

/** Assemble only from supplied reviewed components; dataDigest is the original
 * provider's digest input for an independently issued execution authorization. */
export function rewrite26SourceProviderData(f:CurrentRuntime26FullSourceFixture, supplied:{binding:Record<string,unknown>;target:unknown;core:unknown;closureScope:unknown;warehouses:unknown;ordinary:Record<string,unknown>;transferHeader:unknown;salesHeaderCapture:unknown;barcodeCapture:unknown;salesDetails:unknown;settlements:unknown;productEvidence:unknown;coreProjection:unknown;initialization:unknown;preparation:unknown;money:unknown}){
 const b=f.blueprint;assert.equal(b.database,CURRENT_REWRITE_SYNTHETIC_TARGET);validateCurrentRuntime26FullSourceFixture(f);
 assert.equal(supplied.binding.batchId,b.batchId);assert.equal(supplied.binding.fixedSourceNamespace,b.namespace);assert.equal(supplied.binding.selectionSha256,b.pins.selectionSha256);assert.equal(supplied.binding.cutoffAt,b.now);
 const groups=['PARTIES','CATALOGUE','PRODUCTS','SKUS','STOCK_CONTRIBUTORS','PAYMENT','TRANSFER_LINES'];
 assert.deepEqual(Object.keys(supplied.ordinary).sort(),[...groups].sort());
 for(const v of [supplied.target,supplied.core,supplied.closureScope,supplied.warehouses,supplied.transferHeader,supplied.salesHeaderCapture,supplied.barcodeCapture,supplied.salesDetails,supplied.settlements,supplied.productEvidence,supplied.coreProjection,supplied.initialization,supplied.preparation,supplied.money,...Object.values(supplied.ordinary)])assert.ok(v!==null&&v!==undefined);
 const producers={...Object.fromEntries(groups.map(g=>[g,{mode:'ORIGINAL',options:supplied.ordinary[g]}])),HEADERS:{mode:'HEADERS',transfer:supplied.transferHeader,sales:supplied.salesHeaderCapture},BARCODES:supplied.barcodeCapture,SALES_DETAILS:supplied.salesDetails,SETTLEMENTS:supplied.settlements};
 const data={version:'REWRITE26_FULL_SOURCE_PROVIDER26_INPUT_V1',binding:supplied.binding,core:supplied.core,closureScope:supplied.closureScope,warehouses:supplied.warehouses,producers,productEvidence:supplied.productEvidence,coreProjection:supplied.coreProjection,initialization:supplied.initialization,preparation:supplied.preparation,money:supplied.money,target:supplied.target};
 return {data,sourceInputDigest:historySettlementRequestHash(data)};
}
export function rewrite26SourceProviderInput(data:ReturnType<typeof rewrite26SourceProviderData>['data'],executionAuthorization:{path:string;bytes:number;sha256:string}){
 assert.ok(isAbsolute(executionAuthorization.path)&&Number.isSafeInteger(executionAuthorization.bytes)&&executionAuthorization.bytes>0&&/^[a-f0-9]{64}$/.test(executionAuthorization.sha256));
 const utf8=JSON.stringify({...data,executionAuthorization});return {utf8,bytes:Buffer.byteLength(utf8,'utf8'),sha256:sha(utf8)};
}

export function validateCurrentRuntime26FullSourceFixture(f:CurrentRuntime26FullSourceFixture){
 validateNativeStockConservationPlan(f.stockConservation);
 assert.deepEqual(f.stockConservation.warehouses,f.warehouseScope.map(({basis:_basis,...w})=>w));
 assert.equal(f.stockConservation.effectiveStockCsvSha256,f.sources.INVENTORY_BASELINE!.sha256);assert.equal(f.stockConservation.contributorLineageCsvSha256,f.lineageArtifact.sha256);
 assert.equal(f.executionAuthorized,false);const scope=currentRuntime26SyntheticScope(f.blueprint.database,f.blueprint.batchId);assert.equal(f.blueprint.namespace,scope.namespace);
 assert.equal(f.warehouseScope.length,22);assert.equal(new Set(f.warehouseScope.map(w=>w.nativeId)).size,22);
 const expected=new Set(f.blueprint.parties.filter(r=>r.source.entityType==='WAREHOUSE').map(w=>String(w.nativeSnapshot.id)));
 for(const w of f.warehouseScope){assert.ok(expected.has(w.nativeId));const original=f.blueprint.parties.find(p=>p.source.entityType==='WAREHOUSE'&&p.nativeSnapshot.id===w.nativeId)!;assert.equal(w.sourceKey,original.source.sourceKey);assert.equal(w.signedQuantity,w.nativeId===f.prepared.stock.warehouse.nativeId?'10':'0');assert.equal(w.basis,w.signedQuantity==='0'?'EXPLICIT_SYNTHETIC_ZERO_TARGET':'EXACT_SIGNED_CONTRIBUTORS');}
 assert.equal(f.warehouseScope.filter(w=>w.signedQuantity==='0').length,21);
 assert.deepEqual(prepareNativeStockGroup(f.stockInput),f.prepared.stock);assert.equal(f.prepared.stock.signedQuantity,'10');
 assert.equal(f.skuInput.selection.aliasCsvSha256,f.aliasArtifact.sha256);assert.equal(f.aliasArtifact.sha256,sha(f.aliasArtifact.utf8));
 assert.equal(f.stockInput.selection.lineageCsvSha256,f.lineageArtifact.sha256);assert.equal(f.lineageArtifact.sha256,sha(f.lineageArtifact.utf8));
 assert.deepEqual(prepareNativeProductImportChunk26(f.productInput),f.prepared.product);assert.deepEqual(prepareNativeSkuImport26(f.skuInput),f.prepared.sku);
 assert.deepEqual(prepareNativeBarcode(f.barcodeInput),f.prepared.barcode);assert.deepEqual(prepareV3HistoryHeaderChunk([f.salesHeaderInput]),f.prepared.salesHeaders);
 assert.equal(f.prepared.salesHeaders.rows[0]!.prepared.header.sourceStatus,'DRAFT');assert.equal(f.moneyCellCandidates.length,32);
 if(f.prepared.money){assert.deepEqual(prepareHistorySalesDetailChunk(f.prepared.money.salesDetails.input),f.prepared.money.salesDetails);assert.deepEqual(prepareHistorySettlementChunk(f.prepared.money.settlements.input),f.prepared.money.settlements);}
 assert.equal(f.paymentInputs.length,3);assert.deepEqual(f.paymentInputs.map(prepareNativePaymentImportChunk),f.prepared.payments);
 assert.deepEqual(prepareV3HistoryHeaderChunk([f.headerInput]),f.prepared.headers);assert.deepEqual(prepareV3HistoryChunk(f.transferInput),f.prepared.transfers);
 assert.equal(f.prepared.headers.rows[0]!.prepared.header.sourceStatus,scope.isNew?'APPROVED':'DRAFT');assert.equal(f.prepared.transfers.rows[0]!.line.quantity,'1');
 assert.equal(f.prepared.transfers.rows[0]!.line.sku_id,f.prepared.sku.nativeSku.id);
 assert.equal(f.emptySources.length,CURRENT_FULL_EMPTY_ENTITIES.length);
 for(const entity of CURRENT_FULL_EMPTY_ENTITIES){const empty=f.emptySources.find(e=>e.entity===entity);assert.ok(empty);assert.deepEqual(empty,{...csv(entity,[]),reason:'EXPLICIT_EMPTY_SYNTHETIC_SOURCE'});}
}
/** Pure EXPECTED builder only. PARTIES/CATALOGUE must be the ORIGINAL reviewed
 * factories' exact closure projections (including private-factory CORE proof).
 * Never reconstruct them from counts, current SQL rows or this blueprint.
 */
export async function buildCurrentRuntime26FullClosureExpected(f:CurrentRuntime26FullSourceFixture,core:{PARTIES:{sourceRows:readonly HistoryClosureRow[];typedRows:readonly HistoryClosureRow[]};CATALOGUE:{sourceRows:readonly HistoryClosureRow[];typedRows:readonly HistoryClosureRow[]}},authorizedPayloadHash:string){
 validateCurrentRuntime26FullSourceFixture(f);assert.ok(core?.PARTIES&&core.CATALOGUE,'Original two source-factory closure projections required');
 assert.equal(core.PARTIES.sourceRows.length,115);assert.equal(core.CATALOGUE.sourceRows.length,9);
 const groups=Object.values(f.groups).map(g=>{assert.ok(g,'Original externally reviewed32-cell prepared money branch required');return g;});
 const all=[core.PARTIES,core.CATALOGUE,...groups],sourceRows=ordered(all.flatMap(g=>[...g.sourceRows])),typedRows=ordered(all.flatMap(g=>[...g.typedRows]));
 const expectedSourceEntityCounts=Object.fromEntries(HISTORY_CLOSURE_SOURCE_ENTITIES.map(e=>[e,sourceRows.filter(r=>(r.projection as JsonObject).entity_type===e).length]));
 const expectedCounts=Object.fromEntries(HISTORY_COUNT_KEYS.map(k=>[k,k==='import_source_row'?sourceRows.length:typedRows.filter(r=>r.relation===(k==='barcodes'?'sku_barcode':k)).length]));
 return buildHistoryTypedClosureExpected26({batchId:f.blueprint.batchId,fixedSourceNamespace:f.blueprint.namespace,selectionSha256:f.blueprint.pins.selectionSha256,authorizedPayloadHash,expectedCounts,expectedSourceEntityCounts,documents:f.documents,sourceRows,typedRows});
}


/** Pure mapping using externally supplied reviewed cells/actual artifact pin.
 * Produces prepared DTOs, not source/execution authority. No default approval
 * Map is generated; candidates alone cannot activate this branch.
 */
export function prepareCurrentRuntime26MoneyBranch(f:CurrentRuntime26FullSourceFixture,reviewedCells:ReadonlyMap<string,MoneyApproval>,reviewedArtifactSha256:string):CurrentRuntime26FullSourceFixture {
 assert.ok(reviewedCells instanceof Map,'External reviewed32-cell Map required');assert.match(reviewedArtifactSha256,/^[a-f0-9]{64}$/);
 const moneyApprovals=v2MoneyApprovalSet(f.moneyCellCandidates,[...reviewedCells.values()]);
 const salesInput:HistorySalesDetailChunk={...f.salesInputCandidate,selection:{...f.salesInputCandidate.selection,moneyApprovalSha256:reviewedArtifactSha256},moneyApprovals};
 const settlementInput:HistorySettlementChunk={...f.settlementInputCandidate,selection:{...f.settlementInputCandidate.selection,moneyApprovalSha256:reviewedArtifactSha256},moneyApprovals};
 const salesDetails=prepareHistorySalesDetailChunk(salesInput),settlements=prepareHistorySettlementChunk(settlementInput);
 const next=structuredClone(f);next.prepared.money={salesDetails,settlements};next.moneyStageCandidates=[{kind:'SALES_DETAIL',payload:salesDetails},{kind:'SETTLEMENT',payload:settlements}];
 next.groups.SALES_DETAILS={sourceRows:salesDetails.rows.map(row=>historyClosureProjectionRow26('import_source_row',sourceRow(row.source,{...row.fieldProvenance,history_sales_detail_staging:{validator_version:HISTORY_SALES_DETAIL_VERSION,fingerprint:row.fingerprint,selection:salesDetails.input.selection as unknown as JsonObject,header:row.header as unknown as JsonObject,sku:row.sku as unknown as JsonObject}}))),typedRows:salesDetails.rows.map(row=>historyClosureProjectionRow26('history_sales_line',row.line))};
 next.groups.SETTLEMENTS={sourceRows:settlements.rows.map(row=>historyClosureProjectionRow26('import_source_row',sourceRow(row.source,{...row.fieldProvenance,history_settlement_staging:{validator_version:HISTORY_SETTLEMENT_VERSION,fingerprint:row.fingerprint,selection:settlements.input.selection as unknown as JsonObject,header:row.header as unknown as JsonObject,account:row.account as unknown as JsonObject,method:row.method as unknown as JsonObject}}))),typedRows:settlements.rows.map(row=>historyClosureProjectionRow26('history_sales_settlement',row.settlement))};
 assert.equal(salesDetails.rows.length,16);assert.equal(settlements.rows.length,16);
 const totalLines=salesDetails.rows.reduce((n,r)=>n+v2Cents(String(r.line.line_amount)),0n),totalSettlements=settlements.rows.reduce((n,r)=>n+v2Cents(String(r.settlement.amount)),0n);
 const header=next.prepared.salesHeaders.rows[0]!.prepared.header as HistorySalesHeader;
 assert.equal(totalLines,v2Cents(header.grossAmount));assert.equal(totalSettlements,v2Cents(header.netDue));assert.equal(totalLines,1600n);
 validateCurrentRuntime26FullSourceFixture(next);return next;
}

/** Finite new-scene recipe, not actual setup/readiness or an execution grant.
 * The original bootstrap/source/PUBLISH factories still consume the same source
 * inputs and independently supplied reviews. This recipe never signs those.
 */
export function buildCurrentRuntime26LiveLedgerRecipe(f:CurrentRuntime26FullSourceFixture){
 validateCurrentRuntime26FullSourceFixture(f);const b=f.blueprint,scope=currentRuntime26SyntheticScope(b.database,b.batchId);assert.ok(scope.isNew);
 const header=f.prepared.headers.rows[0]!.prepared.header,line=f.prepared.transfers.rows[0]!.line;
 assert.ok('fromWarehouseId'in header&&'toWarehouseId'in header&&header.sourceStatus==='APPROVED'&&line.quantity==='1'&&typeof line.id==='string');
 const requestKey='V7R1-20261031-PREPARE-HISTORY-QUANTITY2';
 const historyCommand:HistoryRevisionCommand={kind:'transfers',documentId:header.id,expectedVersion:1,requestKey,
  reason:'Exact new synthetic fixture: original approved transfer1 to2; no historical identity/time changes',
  lines:[{lineId:line.id,quantity:'2'}],totals:null,settlements:[]};
 const account=f.prepared.payments.flatMap(p=>p.rows).find(r=>r.entity==='PAYMENT_ACCOUNT')!;
 const method=f.prepared.payments.flatMap(p=>p.rows).find(r=>r.entity==='PAYMENT_METHOD')!;assert.ok(account&&method);
 const keys=(family:string)=>({save:`V7R1-${family}-SAVE`,approve:`V7R1-${family}-APPROVE`,unapprove:`V7R1-${family}-UNAPPROVE`,reopen:`V7R1-${family}-REOPEN`,reapprove:`V7R1-${family}-REAPPROVE`,rollback:`V7R1-${family}-ROLLBACK`,unknownCommit:`V7R1-${family}-UNKNOWN-COMMIT`});
 const proposals:Pick<LiveLedgerBalancePairsScenario,'sales'|'transfers'|'keys'>={
  sales:{salesId:null,businessType:'SALE',businessDate:b.now.slice(0,10),note:'SYNTHETIC V7R1 ordinary sales',hallId:b.refs.hallId,
   customerId:b.refs.customerId,salespersonId:b.refs.salesperson.nativeStaffId,warehouseId:header.fromWarehouseId,
   orderDiscount:'0.00',lines:[{skuId:f.prepared.sku.nativeSku.id,existingLineId:null,quantity:'1',dealPrice:'1.25',pricingRule:'UNIT_PRICE',discountTenths:null,isGift:false,zeroConfirmed:false}],
   settlements:[{existingSettlementId:null,paymentAccountId:String(account.nativeSnapshot.id),paymentMethodId:String(method.nativeSnapshot.id),direction:'RECEIVE',amount:'1.25'}]},
  transfers:{transferId:null,businessDate:b.now.slice(0,10),note:'SYNTHETIC V7R1 ordinary transfer',fromWarehouseId:header.fromWarehouseId,toWarehouseId:header.toWarehouseId,
   responsibleStaffId:b.refs.importer.nativeStaffId,lines:[{skuId:f.prepared.sku.nativeSku.id,existingLineId:null,quantity:'1'}]},
  keys:{sales:keys('SALES'),transfers:keys('TRANSFER')}};
 return {version:'SYNTHETIC_V7_R1_LIVE_LEDGER_RECIPE_V1' as const,executionAuthorized:false as const,
  target:{database:b.database,namespace:b.namespace,batchId:b.batchId,databaseOid:null,runtimeRole:null,postmasterStart:null},
  originalPublicationRequired:true as const,
  lifecycle:['Original49 account bootstrap+115parties+9catalogue','Original scheme initialization+prefix+BIND+all11 source groups+ACCOUNT+closure+nonzero PUBLISH','Genuine V8 Full host ordinary DB LOGIN, original synthetic admin login','POST the one original HISTORY revision command; missing second balance is created only by original admitted history posting','Read original request-key revision receipt, original baseline and both history ledger rows, both actual balance quantities/versions','Map these actual rows into original live-ledger runner private scenario; then invoke its real business acceptance'],
  sourceInputs:{blueprint:b,fixture:f},
  postPublication:{method:'POST' as const,url:'/imported-history/transfers/revise',command:historyCommand,uncertainCommitRecovery:'Original identical command/requestKey only; original service receipt readback before mapping, never another revision/key'},
  loginAccountId:b.refs.importer.nativeAccountId,
  proposals,
  expectedAfterHistory:{skuId:f.prepared.sku.nativeSku.id,fromWarehouseId:header.fromWarehouseId,toWarehouseId:header.toWarehouseId,
   quantities:[{warehouseId:header.fromWarehouseId,quantity:'9'},{warehouseId:header.toWarehouseId,quantity:'1'}],totalQuantity:'10',
   historicalVersion:2,historicalLedgerCount:2,recordedBalances:null},
  actualState:'UNKNOWN_NOT_EXECUTED' as const,
  pending:['New-target original private account/source reviews and execution authorization are external','Fresh independent32 source-money decision/entries and new target/OID review envelope required; original QA897 adopted decision never reused','New actual OID/role/postmaster/V8 canonical metadata/transport installation and execution approval remain external']};
}
export type CurrentRuntime26LiveLedgerRecipe=ReturnType<typeof buildCurrentRuntime26LiveLedgerRecipe>;
/** Actual rows must come from T45's original ordinary-login readback after the
 * original real business method above. Mapping produces only scenario DATA;
 * it cannot supply an issuer/proof, authorize a write or mark actual readiness.
 */
export interface CurrentRuntime26LiveLedgerReadback {
 readonly database:string;readonly databaseOid:string;readonly runtimeRole:string;readonly postmasterStart:string;
 readonly login:LiveLedgerBalancePairsScenario['login'];
 readonly revisionReceipt:HistoryRevisionReceipt;
 readonly balances:readonly {warehouse_id:string;sku_id:string;quantity:string;version:number;last_operation_id:string}[];
 readonly baselineLedger:readonly {id:string;event_kind:'CUTOFF_BASELINE';sku_id:string;warehouse_id:string;source_import_batch_id:string;quantity_delta:string;quantity_before:null;quantity_after:null}[];
 readonly historyLedger:readonly {id:string;operation_id:string;source_history_revision_id:string;sku_id:string;warehouse_id:string;quantity_delta:string;endpoint:'FROM'|'TO';event_kind:'HISTORY_REVISION';source_document_version:number;source_history_transfer_line_id:string;source_history_sales_line_id:null;source_import_batch_id:null;reverses_entry_id:null;quantity_before:null;quantity_after:null}[];
}
export function mapCurrentRuntime26LiveLedgerScenario(recipe:CurrentRuntime26LiveLedgerRecipe,actual:CurrentRuntime26LiveLedgerReadback):LiveLedgerBalancePairsScenario{
 const scope=currentRuntime26SyntheticScope(recipe.target.database,recipe.target.batchId);assert.ok(scope.isNew&&recipe.executionAuthorized===false);
 assert.equal(actual.database,recipe.target.database);assert.match(actual.databaseOid,/^[1-9]\d*$/);assert.notEqual(actual.databaseOid,'21551');
 assert.ok(actual.runtimeRole.length>0&&actual.postmasterStart.length>0&&actual.login.accountId===recipe.loginAccountId&&actual.login.loginName.length>0&&actual.login.password.length>0);
 const r=actual.revisionReceipt,h=recipe.postPublication.command,e=recipe.expectedAfterHistory;
 assert.ok(r.dataset==='HISTORY'&&r.kind==='transfers'&&r.documentId===h.documentId&&r.version===2&&r.operationId!==r.revisionId&&r.ledgerEntryIds.length===2);
 assert.equal(actual.historyLedger.length,2);assert.equal(actual.balances.length,2);assert.ok(actual.baselineLedger.length===1);
 const original=actual.baselineLedger[0]!;assert.ok(original.sku_id===e.skuId&&original.warehouse_id===e.fromWarehouseId&&original.source_import_batch_id===recipe.target.batchId&&original.event_kind==='CUTOFF_BASELINE'&&original.quantity_delta==='10'&&original.quantity_before===null&&original.quantity_after===null);
 const ledgerIds=new Set(actual.historyLedger.map(l=>l.id));assert.equal(ledgerIds.size,2);const receiptLedgerIds=new Set(r.ledgerEntryIds);assert.equal(receiptLedgerIds.size,2);assert.deepEqual(receiptLedgerIds,ledgerIds);
 let total=0n;
 for(const expected of e.quantities){
  const balances=actual.balances.filter(v=>v.warehouse_id===expected.warehouseId&&v.sku_id===e.skuId);assert.equal(balances.length,1);const balance=balances[0]!;
  assert.equal(balance.quantity,expected.quantity);assert.ok(Number.isInteger(balance.version)&&balance.version>0&&balance.last_operation_id===r.operationId);total+=BigInt(balance.quantity);
  const rows=actual.historyLedger.filter(l=>l.warehouse_id===expected.warehouseId);assert.equal(rows.length,1);const l=rows[0]!;
  assert.ok(l.operation_id===r.operationId&&l.source_history_revision_id===r.revisionId&&l.sku_id===e.skuId&&l.event_kind==='HISTORY_REVISION'&&l.source_document_version===2&&l.source_history_transfer_line_id===h.lines[0]!.lineId&&l.source_history_sales_line_id===null&&l.source_import_batch_id===null&&l.reverses_entry_id===null&&l.quantity_before===null&&l.quantity_after===null);
  assert.equal(l.endpoint,expected.warehouseId===e.fromWarehouseId?'FROM':'TO');assert.equal(l.quantity_delta,expected.warehouseId===e.fromWarehouseId?'-1':'1');
 }
 assert.equal(total,10n,'Exact per-warehouse source conservation, not summary-only inferred stock');
 return {syntheticOnly:true,login:structuredClone(actual.login),...structuredClone(recipe.proposals),
  initialInventory:actual.balances.map(v=>({warehouseId:v.warehouse_id,skuId:v.sku_id,quantity:v.quantity,version:v.version})),
  unrecordedLedgerIds:{baseline:actual.baselineLedger.map(l=>l.id),historyRevision:actual.historyLedger.map(l=>l.id)}};
}
