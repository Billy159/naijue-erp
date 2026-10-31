/** Pure QA897 input candidates. No source grant, private review, database,
 * execution callback or publication state. The existing fixture consumes the
 * ORIGINAL openImportHost26/createPostgresImportExecutor26 lifecycle only after
 * T45 wraps these exact safe inputs in independently reviewed source factories.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { stableImportId } from '../../packages/application/src/inventory-cutoff-import.ts';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { prepareNativeProductImportChunk26, NATIVE_PRODUCT_IMPORT_VERSION_26, NATIVE_PRODUCT_NULLABLE_POLICY, nativeProductImportEvidence26, nativeProductReferenceDecision26 } from '../../packages/application/src/native-product-import.ts';
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
import { prepareHistorySettlementChunk, HISTORY_SETTLEMENT_VERSION } from '../../packages/application/src/import-v3-history-settlement.ts';
import type { HistorySettlementChunk, PreparedHistorySettlementChunk } from '../../packages/application/src/import-v3-history-settlement.ts';
import { v2MoneyApprovalSet, v2Cents } from '../../packages/application/src/import-v2.ts';
import type { MoneyApproval } from '../../packages/application/src/import-v2.ts';
import { prepareNativeStockGroup, nativeStockSourceEvidence, nativeStockPublicationContributor26 } from '../../packages/application/src/native-stock-contributor-import.ts';
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
import { currentRuntime26SyntheticScope } from './current-runtime26-sales-fixture.ts';

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
 const groups={PRODUCTS:{sourceRows:[historyClosureProjectionRow26('import_source_row',pe.source)],typedRows:[historyClosureProjectionRow26('product',product.nativeProducts[0])]},SKUS:{sourceRows:sku.aliases.map(a=>historyClosureProjectionRow26('import_source_row',nativeSkuAliasEvidence26(sku,a))),typedRows:[historyClosureProjectionRow26('sku',sku.nativeSku),...sku.aliases.map(a=>historyClosureProjectionRow26('import_sku_alias',{batch_id:b.batchId,old_source_sku_id:a.source.sourceKey,canonical_sku_id:sku.nativeSku.id,source_row_id:a.source.id,canonical_source_key:sku.canonicalSource.sourceKey,mapping_basis:a.mapping.mappingBasis}))]},STOCK_CONTRIBUTORS:{sourceRows:stock.contributors.map(c=>historyClosureProjectionRow26('import_source_row',nativeStockSourceEvidence(stock,c))),typedRows:stock.contributors.map(c=>historyClosureProjectionRow26('import_stock_contributor',nativeStockPublicationContributor26(stock,c)))},HEADERS:{sourceRows:[hp.sourceRow,salesSourceProjection],typedRows:[hp.typedRow,salesTypedProjection]},TRANSFER_LINES:{sourceRows:transfers.rows.map(row=>historyClosureProjectionRow26('import_source_row',lineModule.transferLineSourceEvidence26(row,transfers.selection))),typedRows:transfers.rows.map(row=>historyClosureProjectionRow26('history_transfer_line',row.line))},BARCODES:{sourceRows:[historyClosureProjectionRow26('import_source_row',nativeBarcodeSourceEvidence(barcode))],typedRows:[historyClosureProjectionRow26('sku_barcode',barcode.nativeBarcode)]},PAYMENT:{sourceRows:paymentPreparedRows.map(row=>historyClosureProjectionRow26('import_source_row',nativePaymentSourceEvidence(row))),typedRows:paymentPreparedRows.flatMap(row=>[historyClosureProjectionRow26('import_native_payment_binding',nativePaymentBindingEvidence(row)),historyClosureProjectionRow26(row.entity==='PAYMENT_METHOD'?'payment_method_identity':row.entity==='PAYMENT_ACCOUNT'?'payment_account_identity':'payment_account_hall',row.entity==='PAYMENT_ACCOUNT_HALL'?row.nativeSnapshot:{id:row.nativeSnapshot.id})])},SALES_DETAILS:null as ClosureGroup|null,SETTLEMENTS:null as ClosureGroup|null};
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
 const ledgerIds=new Set(actual.historyLedger.map(l=>l.id));assert.equal(ledgerIds.size,2);assert.ok(r.ledgerEntryIds.every(id=>ledgerIds.has(id)));
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
