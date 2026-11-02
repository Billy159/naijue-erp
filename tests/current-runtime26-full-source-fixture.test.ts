import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildCurrentRuntime26SalesBlueprint, CURRENT_SALES_QA_TARGET } from './integration/current-runtime26-sales-fixture.ts';

test('dedicated rewrite synthetic scope is fixed and disjoint from the prior batch', async () => {
 const m = await import('./integration/current-runtime26-sales-fixture.ts');
 const pins={baseManifestSha256:'1'.repeat(64),selectionSha256:'2'.repeat(64),approvalSha256:'3'.repeat(64),occurrenceContractSha256:'4'.repeat(64)};
 const b=m.buildCurrentRuntime26SalesBlueprint({database:m.CURRENT_REWRITE_SYNTHETIC_TARGET,batchId:m.CURRENT_REWRITE_SYNTHETIC_BATCH,now:'2026-11-02T00:00:00.000Z',pins});
 assert.equal(b.accountIdentities.length,49); assert.equal(b.parties.length,115);
 assert.equal(b.parties.filter(x=>x.source.entityType==='WAREHOUSE').length,22);
 const candidate=m.rewrite26SyntheticIdentityCandidates(b);
 assert.equal(candidate.executionAuthorized,false); assert.equal(candidate.accounts.length,49);
 assert.doesNotMatch(JSON.stringify(candidate),/password|credential|loginName/i);
 const full=await buildCurrentRuntime26FullSourceFixture(b);
 assert.equal(full.executionAuthorized,false);assert.equal(full.warehouseScope.length,22);
 const bytes=rewrite26SyntheticSourceByteCandidates(full),aux=bytes.auxiliaryFiles;
 assert.equal(aux.length,7);assert.equal(aux.find(x=>x.path==='mappings/old-to-canonical-sku-15121.csv')!.utf8,full.aliasArtifact.utf8);
 assert.equal(aux.find(x=>x.path==='mappings/stock-contributor-lineage-38314.csv')!.utf8,full.lineageArtifact.utf8);
 assert.equal(aux.find(x=>x.path==='audit/independent-verification/all-53-warehouses.csv')!.rowCount,22);
 assert.match(aux.find(x=>x.path==='audit/independent-verification/warehouse-unit-reconciliation.csv')!.utf8,/,10,10,0\n$/);
 assert.equal(bytes.manifestCandidate.completeV2Preflight,false);assert.equal(bytes.selectionCandidate.state,'UNREVIEWED_NOT_A_SELECTION_SCHEMA');
 assert.equal(JSON.parse(bytes.manifestCandidate.utf8).payloadFiles.length,bytes.tables.length+7);
 assert.notEqual(b.batchId,m.CURRENT_LIVE_LEDGER_QA_BATCH);
 assert.throws(()=>m.currentRuntime26SyntheticScope(m.CURRENT_REWRITE_SYNTHETIC_TARGET,m.CURRENT_LIVE_LEDGER_QA_BATCH));
 assert.throws(()=>m.currentRuntime26SyntheticScope('rewrite_schema_20261102_02'));
});
import { buildCurrentRuntime26FullSourceFixture, rewrite26SyntheticSourceByteCandidates, rewrite26CaptureCandidates, rewrite26PaymentCandidate, rewrite26PartyCandidates, rewrite26MoneyCaptureCandidates, rewrite26OffsetSourceCandidates, rewrite26CatalogueCandidate, rewrite26SkuCandidates, rewrite26ProductCandidates, rewrite26ApplyProductCandidate, rewrite26CoreProjectionCandidate, rewrite26TransferHeaderCandidates, rewrite26StockCandidates, rewrite26TransferLineCandidates, validateCurrentRuntime26FullSourceFixture, buildCurrentRuntime26FullClosureExpected, prepareCurrentRuntime26MoneyBranch } from './integration/current-runtime26-full-source-fixture.ts';
import { prepareNativeStockGroup } from '../packages/application/src/native-stock-contributor-import.ts';
import { prepareV3HistoryChunk } from '../packages/application/src/import-v3-history-staging.ts';
import { v2MoneyApprovalSet } from '../packages/application/src/import-v2.ts';
import { parseV2Csv } from '../packages/application/src/import-v2.ts';
const blueprint=()=>buildCurrentRuntime26SalesBlueprint({database:CURRENT_SALES_QA_TARGET,batchId:'e2dfa367-7cda-42d2-9726-f7cc52124cf1',now:'2026-10-29T00:00:00.000Z',pins:{baseManifestSha256:'1'.repeat(64),selectionSha256:'2'.repeat(64),approvalSha256:'3'.repeat(64),occurrenceContractSha256:'4'.repeat(64)}});
// Synthetic syntax pins above are test inputs only; no authority/factory is
// signed, mocked or invoked as a publication grant by these tests.
const fixture=buildCurrentRuntime26FullSourceFixture(blueprint());
test('QA897 full source is deterministic, preserves49/115/9 and uses original exact26 preparers',async()=>{
 const f=await fixture,again=await buildCurrentRuntime26FullSourceFixture(blueprint());assert.deepEqual(f,again);
 assert.equal(f.blueprint.accountIdentities.length,49);assert.equal(f.blueprint.parties.length,115);assert.equal(f.blueprint.catalogue.rows.length,9);
 assert.equal(f.prepared.product.nativeProducts.length,1);assert.equal(f.prepared.sku.aliases.length,1);assert.equal(f.prepared.sku.nativeSku.created_operation_id,null);
 assert.equal(f.prepared.product.nativeProducts[0]!.season_ids,null);assert.equal(f.prepared.product.nativeProducts[0]!.default_barcode_scheme_id,null);
 assert.equal(f.executionAuthorized,false);assert.equal(Object.hasOwn(f,'authorize'),false);assert.equal(Object.hasOwn(f,'execute'),false);
 assert.deepEqual(f.stagingStepCandidates.map(s=>s.kind),['PRODUCT','SKU','STOCK_CONTRIBUTOR','HEADER','HEADER','TRANSFER_LINES']);
 assert.equal(Object.keys(f.groups).length,9);for(const name of ['HEADERS','TRANSFER_LINES','PRODUCTS','SKUS','STOCK_CONTRIBUTORS'] as const){assert.ok(f.groups[name].sourceRows.length>0);assert.ok(f.groups[name].typedRows.length>0);}
});
test('QA897 exact22 scope has signed12-2=10 and21 individually explicit zero targets',async()=>{
 const f=await fixture;assert.deepEqual(f.prepared.stock.contributors.map(c=>c.lineage.signedQuantity),['12','-2']);assert.equal(f.prepared.stock.signedQuantity,'10');
 assert.equal(f.warehouseScope.filter(w=>w.signedQuantity==='10').length,1);assert.equal(f.warehouseScope.filter(w=>w.signedQuantity==='0').length,21);
 assert.deepEqual(f.inventoryExpectedCounts,{WAREHOUSE:22,SKU:1,INVENTORY_LEDGER:1,IMPORT_BATCH:1});
 for(const change of ['missing','foreign','inventedZero'] as const){const bad=structuredClone(f);if(change==='missing')bad.warehouseScope.pop();else if(change==='foreign')bad.warehouseScope[1]!.nativeId='00000000-0000-4000-8000-000000000123';else bad.warehouseScope[0]!.signedQuantity='0';assert.throws(()=>validateCurrentRuntime26FullSourceFixture(bad));}
 const bad=structuredClone(f.stockInput);bad.contributors[1]!.lineage.signedQuantity='-1';assert.throws(()=>prepareNativeStockGroup(bad));
});
test('QA897 transfer remains unapproved quantity1 with unknown creator/times and no baseline effect',async()=>{
 const f=await fixture,h=f.prepared.headers.rows[0]!.prepared.header;assert.equal(h.sourceStatus,'DRAFT');assert.equal(h.createdBySourceKey,null);assert.equal(h.approvedBySourceKey,null);assert.equal(h.createdLocalAt,null);assert.equal(h.approvedLocalAt,null);
 assert.equal(f.prepared.transfers.rows[0]!.line.quantity,'1');assert.notEqual(f.headerInput.bindings.调出仓来源编号!.nativeId,f.headerInput.bindings.调入仓来源编号!.nativeId);
 assert.equal(f.prepared.stock.signedQuantity,'10');assert.equal(f.groups.STOCK_CONTRIBUTORS.typedRows.length,2);
 const bad=structuredClone(f);bad.transferInput.rows[0]!.source.rawFields.原数量='2';bad.transferInput.rows[0]!.source.normalizedFields.原数量='2';bad.prepared.transfers=prepareV3HistoryChunk(bad.transferInput);assert.throws(()=>validateCurrentRuntime26FullSourceFixture(bad));
});
test('QA897 nonempty CSV groups remain explicit while unreviewed money is pending rather than zero',async()=>{
 const f=await fixture;assert.equal(f.emptySources.length,0);assert.equal(f.groups.BARCODES.typedRows.length,1);assert.equal(f.groups.PAYMENT.typedRows.length,6);
 assert.equal(f.groups.SALES_DETAILS,null);assert.equal(f.groups.SETTLEMENTS,null);assert.equal(f.prepared.money,null);
 for(const entity of ['BARCODE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SETTLEMENT']){
  const a=f.sources[entity]!;const rows=[];for await(const row of parseV2Csv((async function*(){yield a.utf8;})()))rows.push(row);assert.equal(rows.length,a.rowCount+1);assert.ok(a.rowCount>0);
 }
});
test('QA897 source identity/alias mutation fails original DTO rederivation and full closure needs original two factories',async()=>{
 const f=await fixture,bad={...f,skuInput:{...f.skuInput,aliases:f.skuInput.aliases.map(a=>({...a,mapping:{...a.mapping,canonicalSourceSkuId:'different'}}))}};assert.throws(()=>validateCurrentRuntime26FullSourceFixture(bad));
 await assert.rejects(buildCurrentRuntime26FullClosureExpected(f,undefined!,'5'.repeat(64)),/Original two source/);
 await assert.rejects(buildCurrentRuntime26FullClosureExpected(f,{PARTIES:{sourceRows:[],typedRows:[]},CATALOGUE:{sourceRows:[],typedRows:[]}},'5'.repeat(64)));
});


test('QA897 mapping bytes and conservation plan bind exact source files and original manifests',async()=>{
 const f=await fixture;
 assert.equal(f.skuInput.selection.aliasCsvSha256,f.aliasArtifact.sha256);assert.equal(f.stockInput.selection.lineageCsvSha256,f.lineageArtifact.sha256);
 assert.equal(f.stockConservation.warehouses.length,22);assert.equal(f.stockConservation.contributorCount,2);assert.equal(f.stockConservation.effectiveGroupCount,1);
 assert.deepEqual(f.stockConservation.warehouseUnits,[{warehouseSourceKey:f.prepared.stock.warehouse.sourceKey,sourceUnit:'件',signedQuantity:'10'}]);
 for(const s of [f.productInput.rows[0]!.source,f.skuInput.canonicalSource,...f.stockInput.contributors.map(c=>c.source),f.headerInput.source,f.transferInput.rows[0]!.source])assert.equal(f.sourceFiles[s.fileRef]!.sha256,s.sourceFileSha256);
 const changed=structuredClone(f);changed.warehouseScope[1]!.sourceKey='different-source';assert.throws(()=>validateCurrentRuntime26FullSourceFixture(changed));
 const wrongMapping=structuredClone(f);wrongMapping.aliasArtifact.utf8+='wrong';assert.throws(()=>validateCurrentRuntime26FullSourceFixture(wrongMapping));
});


test('QA897 candidates confer no executable source authority to the original executor',async()=>{
 const f=await fixture;
 const original=await import(new URL('../scripts/import-v3/run.mjs',import.meta.url).href);
 assert.throws(()=>original.createPostgresImportExecutor26({candidates:f.stagingStepCandidates}),/IMPORT_EXECUTION_SHAPE/);
});


test('QA897 payment uses real1 method1 account1 hall source rows after BIND without balances or runtime CREATE overlap',async()=>{
 const f=await fixture,rows=f.prepared.payments.flatMap(c=>c.rows),method=rows[0]!,account=rows[1]!,hall=rows[2]!;
 assert.deepEqual(rows.map(r=>r.entity),['PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL']);
 assert.equal(account.nativeSnapshot.payment_method_id,method.nativeSnapshot.id);assert.equal(hall.nativeSnapshot.payment_account_id,account.nativeSnapshot.id);
 const warehouse=f.blueprint.parties.find(p=>p.nativeSnapshot.id===f.prepared.stock.warehouse.nativeId)!;
 assert.equal(hall.nativeSnapshot.hall_id,warehouse.nativeSnapshot.hall_id);
 assert.equal(hall.source.sourceKey,JSON.stringify([account.source.sourceKey,hall.references.厅来源编号!.sourceKey]));
 assert.equal(Object.hasOwn(hall.source.rawFields,'来源编号'),false);assert.equal(hall.nativeId,null);assert.equal(hall.enabledMapping,null);
 assert.deepEqual(f.continuationStageCandidates.map(c=>c.kind),['PAYMENT','PAYMENT','PAYMENT','BARCODE']);assert.ok(f.stagingStepCandidates.every(c=>String(c.kind)!=='PAYMENT'));
 assert.equal(f.groups.PAYMENT.sourceRows.length,3);assert.equal(f.groups.PAYMENT.typedRows.length,6);
 assert.ok(String(method.nativeSnapshot.name).includes('IMPORT METHOD'));assert.ok(String(account.nativeSnapshot.name).includes('IMPORT ACCOUNT'));
 for(const input of f.paymentInputs){const a=f.sources[input.selection.entity]!;assert.equal(a.rowCount,1);assert.equal(input.selection.csvSha256,a.sha256);const parsed=[];for await(const row of parseV2Csv((async function*(){yield a.utf8;})()))parsed.push(row);assert.equal(parsed.length,2);}
 assert.ok(rows.every(r=>!Object.hasOwn(r.nativeSnapshot,'balance')));assert.equal(f.inventoryExpectedCounts.INVENTORY_LEDGER,1);
 const bad=structuredClone(f);bad.paymentInputs[1]!.rows[0]!.references.收款方式来源编号!.sourceKey='wrong';assert.throws(()=>validateCurrentRuntime26FullSourceFixture(bad));
});


test('QA897 literal source barcode and DRAFT sales header bind the existing SKU hall customer salesperson',async()=>{
 const f=await fixture,b=f.prepared.barcode,h=f.prepared.salesHeaders.rows[0]!.prepared.header;
 assert.equal(b.nativeBarcode.barcode,'897000000000001');assert.equal(b.nativeBarcode.sku_id,f.prepared.sku.nativeSku.id);assert.equal(b.nativeBarcode.barcode_kind,'MAIN');
 assert.deepEqual(f.stagingStepCandidates.filter(s=>s.kind==='HEADER').map(s=>(s.payload as typeof f.prepared.headers).selection.entity),['TRANSFER_HEADER','SALES_HEADER']);
 assert.ok(f.continuationStageCandidates.some(s=>s.kind==='BARCODE'));assert.ok(f.stagingStepCandidates.every(s=>String(s.kind)!=='BARCODE'));
 assert.equal(h.sourceStatus,'DRAFT');assert.equal(h.approvedBySourceKey,null);assert.equal(h.approvedLocalAt,null);assert.equal(h.createdLocalAt,null);
 assert.ok('grossAmount' in h);if('grossAmount' in h){assert.equal(h.grossAmount,'16.00');assert.equal(h.netDue,'16.00');assert.equal(h.orderDiscount,'0.00');assert.equal(h.hallId,f.blueprint.refs.hallId);assert.equal(h.customerId,f.blueprint.refs.customerId);assert.equal(h.salespersonId,f.blueprint.refs.salesperson.nativeStaffId);}
 assert.equal(f.prepared.stock.signedQuantity,'10');assert.equal(f.prepared.transfers.rows[0]!.line.quantity,'1');
});
test('QA89732 candidate money cells all point to actual selected16 sales and16 settlement raw tail cells',async()=>{
 const f=await fixture,rows=[...f.salesInputCandidate.rows,...f.settlementInputCandidate.rows];assert.equal(rows.length,32);assert.equal(f.moneyCellCandidates.length,32);
 assert.equal(f.salesInputCandidate.rows.length,16);assert.equal(f.settlementInputCandidate.rows.length,16);
 const identities=new Set();for(const c of f.moneyCellCandidates){const r=rows.find(r=>r.source.sourceKey===c.sourceId)!;assert.ok(r);assert.equal(c.fileSha256,r.source.sourceFileSha256);assert.equal(c.row,r.source.rowNo);assert.equal(c.sheet,r.source.sheet);assert.equal(r.source.rawFields[c.field],'1.00000000000001');assert.equal(r.source.normalizedFields[c.field],'1.00');const bytes=f.sourceFiles[r.source.fileRef]!.utf8;assert.equal(createHash('sha256').update(bytes).digest('hex'),c.fileSha256);const physical=JSON.parse(bytes);assert.equal(physical[c.field],c.rawValue);identities.add(JSON.stringify([c.fileSha256,c.sheet,c.row,c.sourceId,c.field]));}
 assert.equal(identities.size,32);assert.equal(f.moneyCandidateArtifact.rowCount,32);assert.equal(f.prepared.money,null);
 assert.throws(()=>prepareCurrentRuntime26MoneyBranch(f,undefined!,'1'.repeat(64)),/External reviewed32/);
});
test('QA897 original money mappers close16.00 using external structural test parameters without source authority',async()=>{
 const f=await fixture;
 // Unit parameters exercise the pure mapper only. This is not an independent
 // review or a published approval; the real host still needs T45/C/QB pins.
 const externalUnitMap=v2MoneyApprovalSet(f.moneyCellCandidates,structuredClone(f.moneyCellCandidates));
 const prepared=prepareCurrentRuntime26MoneyBranch(f,externalUnitMap,f.moneyCandidateArtifact.sha256);
 assert.equal(prepared.prepared.money!.salesDetails.rows.length,16);assert.equal(prepared.prepared.money!.settlements.rows.length,16);
 assert.equal(prepared.groups.SALES_DETAILS!.sourceRows.length,16);assert.equal(prepared.groups.SETTLEMENTS!.typedRows.length,16);
 assert.equal(prepared.executionAuthorized,false);assert.deepEqual(prepared.moneyStageCandidates.map(s=>s.kind),['SALES_DETAIL','SETTLEMENT']);
 assert.equal(prepared.prepared.stock.signedQuantity,'10');assert.equal(f.prepared.money,null);
 const bad=new Map(externalUnitMap);bad.delete(bad.keys().next().value!);assert.throws(()=>prepareCurrentRuntime26MoneyBranch(f,bad,f.moneyCandidateArtifact.sha256));
 const mismatch=structuredClone(f);mismatch.moneyCellCandidates[0]!.sourceId='missing-cell';assert.throws(()=>prepareCurrentRuntime26MoneyBranch(mismatch,externalUnitMap,f.moneyCandidateArtifact.sha256));
});

// New target tests use syntax-only source pins. No generated grant/review or PG.
test('V7R1 exact new target shares pure source implementation without borrowing old identity or32-cell decision',async()=>{
 const module=await import('./integration/current-runtime26-sales-fixture.ts');
 const b=module.buildCurrentRuntime26SalesBlueprint({database:module.CURRENT_LIVE_LEDGER_QA_TARGET,batchId:module.CURRENT_LIVE_LEDGER_QA_BATCH,now:'2026-10-31T00:00:00.000Z',pins:blueprint().pins});
 const f=await buildCurrentRuntime26FullSourceFixture(b),old=await fixture;
 assert.equal(b.namespace,'synthetic.v7r1.ledger.20261031');assert.notEqual(b.batchId,old.blueprint.batchId);
 assert.equal(f.prepared.headers.rows[0]!.prepared.header.sourceStatus,'APPROVED');assert.equal(old.prepared.headers.rows[0]!.prepared.header.sourceStatus,'DRAFT');
 assert.equal(f.prepared.transfers.rows[0]!.line.quantity,'1');assert.equal(f.prepared.headers.rows[0]!.prepared.header.createdInstant,null);
 assert.equal(f.prepared.stock.signedQuantity,'10');assert.equal(f.prepared.money,null);assert.equal(f.executionAuthorized,false);
 assert.equal(b.parties.length,115);assert.equal(b.accountIdentities.length,49);assert.equal(b.catalogue.rows.length,9);
 const oldIds=new Set(old.blueprint.parties.map(p=>p.source.id));assert.ok(b.parties.every(p=>!oldIds.has(p.source.id)));
 assert.notEqual(f.prepared.sku.nativeSku.id,old.prepared.sku.nativeSku.id);assert.notEqual(b.refs.sizeGroup.id,old.blueprint.refs.sizeGroup.id);
 assert.equal(f.moneyCellCandidates.length,32);assert.ok(f.moneyCellCandidates.every(c=>!old.moneyCellCandidates.some(o=>o.fileSha256===c.fileSha256)));
 const oldMap=v2MoneyApprovalSet(old.moneyCellCandidates,structuredClone(old.moneyCellCandidates));
 assert.throws(()=>prepareCurrentRuntime26MoneyBranch(f,oldMap,old.moneyCandidateArtifact.sha256),'Old32 Map cannot authorize fresh source cells');
 // Fresh Map is a UNIT structural parameter, never a C approval or runtime proof.
 const freshUnitMap=v2MoneyApprovalSet(f.moneyCellCandidates,structuredClone(f.moneyCellCandidates));
 const prepared=prepareCurrentRuntime26MoneyBranch(f,freshUnitMap,f.moneyCandidateArtifact.sha256);
 assert.equal(prepared.prepared.money!.salesDetails.rows.length,16);assert.equal(prepared.prepared.money!.settlements.rows.length,16);
 assert.equal(prepared.executionAuthorized,false);assert.equal(f.prepared.money,null);
 for(const database of ['erp_prod','other_qa','demo_8877_arbitrary'])assert.throws(()=>module.buildCurrentRuntime26SalesBlueprint({...b,database} as never));
 assert.throws(()=>module.buildCurrentRuntime26SalesBlueprint({database:module.CURRENT_LIVE_LEDGER_QA_TARGET,batchId:old.blueprint.batchId,now:b.now,pins:b.pins}));
});
test('V7R1 recipe and scenario mapping need actual target rows, exact history deltas and NULL old balances; no inferred zero',async()=>{
 const module=await import('./integration/current-runtime26-sales-fixture.ts');
 const tools=await import('./integration/current-runtime26-full-source-fixture.ts');
 const {parseHistoryRevisionCommand}=await import('../packages/application/src/history-revision-service.ts');
 const b=module.buildCurrentRuntime26SalesBlueprint({database:module.CURRENT_LIVE_LEDGER_QA_TARGET,batchId:module.CURRENT_LIVE_LEDGER_QA_BATCH,now:'2026-10-31T00:00:00.000Z',pins:blueprint().pins});
 const f=await buildCurrentRuntime26FullSourceFixture(b),recipe=tools.buildCurrentRuntime26LiveLedgerRecipe(f);
 assert.equal(recipe.actualState,'UNKNOWN_NOT_EXECUTED');assert.equal(recipe.executionAuthorized,false);assert.equal(recipe.target.databaseOid,null);
 assert.deepEqual(parseHistoryRevisionCommand(recipe.postPublication.command),recipe.postPublication.command);
 assert.equal(recipe.proposals.sales.salesId,null);assert.equal(recipe.proposals.transfers.transferId,null);
 assert.ok('skuId'in recipe.proposals.sales.lines[0]!);assert.equal(recipe.proposals.sales.lines[0]!.skuId,f.prepared.sku.nativeSku.id);
 assert.equal(new Set([...Object.values(recipe.proposals.keys.sales),...Object.values(recipe.proposals.keys.transfers)]).size,14);
 const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,e=recipe.expectedAfterHistory;
 // Structural unit input only, NOT actual readback/canonical metadata/approval.
 const readback:import('./integration/current-runtime26-full-source-fixture.ts').CurrentRuntime26LiveLedgerReadback={
  database:module.CURRENT_LIVE_LEDGER_QA_TARGET,databaseOid:'30001',runtimeRole:'SYNTHETIC_UNIT_NOT_LOGIN',postmasterStart:'SYNTHETIC_UNIT_NOT_PG',
  login:{accountId:recipe.loginAccountId,loginName:'SYNTHETIC_UNIT_ONLY',password:'NOT_AN_ACTUAL_CREDENTIAL'},
  revisionReceipt:{operationId:id(1),revisionId:id(2),dataset:'HISTORY',kind:'transfers',documentId:recipe.postPublication.command.documentId,version:2,ledgerEntryIds:[id(3),id(4)]},
  balances:e.quantities.map(q=>({warehouse_id:q.warehouseId,sku_id:e.skuId,quantity:q.quantity,version:2,last_operation_id:id(1)})),
  baselineLedger:[{id:id(5),event_kind:'CUTOFF_BASELINE',warehouse_id:e.fromWarehouseId,sku_id:e.skuId,source_import_batch_id:b.batchId,quantity_delta:'10',quantity_before:null,quantity_after:null}],
  historyLedger:e.quantities.map((q,i)=>({id:id(3+i),operation_id:id(1),source_history_revision_id:id(2),sku_id:e.skuId,warehouse_id:q.warehouseId,quantity_delta:i===0?'-1':'1',endpoint:i===0?'FROM':'TO',event_kind:'HISTORY_REVISION',source_document_version:2,source_history_transfer_line_id:recipe.postPublication.command.lines[0]!.lineId,source_history_sales_line_id:null,source_import_batch_id:null,reverses_entry_id:null,quantity_before:null,quantity_after:null}))};
 const mapped=tools.mapCurrentRuntime26LiveLedgerScenario(recipe,readback);assert.deepEqual(mapped.initialInventory.map(b=>b.quantity),['9','1']);assert.deepEqual(mapped.unrecordedLedgerIds,{baseline:[id(5)],historyRevision:[id(3),id(4)]});
 const reordered={...structuredClone(readback),revisionReceipt:{...readback.revisionReceipt,ledgerEntryIds:[id(4),id(3)]}};assert.deepEqual(tools.mapCurrentRuntime26LiveLedgerScenario(recipe,reordered).initialInventory,mapped.initialInventory);
 type MutableReadback={-readonly[K in keyof typeof readback]:(typeof readback)[K]};
 for(const change of [(a:MutableReadback)=>{a.revisionReceipt={...a.revisionReceipt,ledgerEntryIds:[id(3),id(3)]};},(a:MutableReadback)=>{a.databaseOid='21551';},(a:MutableReadback)=>{a.balances=[];},(a:MutableReadback)=>{a.balances[0]!.quantity='0';},(a:MutableReadback)=>{a.historyLedger[0]!.source_history_transfer_line_id=id(99);},(a:MutableReadback)=>{a.historyLedger[1]!.quantity_delta='2';},(a:MutableReadback)=>{a.revisionReceipt={...a.revisionReceipt,ledgerEntryIds:[id(3),id(99)]};}]){
  const bad:MutableReadback=structuredClone(readback);change(bad);assert.throws(()=>tools.mapCurrentRuntime26LiveLedgerScenario(recipe,bad));
 }
 const old=await fixture;assert.throws(()=>tools.buildCurrentRuntime26LiveLedgerRecipe(old));
});

test('rewrite capture candidates feed the original reviewed reader',async t=>{
 const {mkdtemp,realpath,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{createHash}=await import('node:crypto');
 const m=await import('./integration/current-runtime26-sales-fixture.ts'),provider=await import('./integration/current-runtime26-source-provider.mjs');
 const dir=await mkdtemp(join(await realpath(tmpdir()),'rewrite26-capture-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const pins={baseManifestSha256:'1'.repeat(64),selectionSha256:'2'.repeat(64),approvalSha256:'3'.repeat(64),occurrenceContractSha256:'4'.repeat(64)};
 const b=m.buildCurrentRuntime26SalesBlueprint({database:m.CURRENT_REWRITE_SYNTHETIC_TARGET,batchId:m.CURRENT_REWRITE_SYNTHETIC_BATCH,now:'2026-10-31T00:00:00.000Z',pins}),f=await buildCurrentRuntime26FullSourceFixture(b);
 const binding={version:'NATIVE_IMPORT_EXECUTION_26_V1',phase:'FULL_SOURCE_CONTINUATION_26_V1',batchId:b.batchId,actorAccountId:b.refs.importer.nativeAccountId,fixedSourceNamespace:b.namespace,cutoffAt:b.now,selectionSha256:pins.selectionSha256,authorizedPayloadHash:'5'.repeat(64),coreSourceDigest:'6'.repeat(64),coreReceiptId:b.refs.importer.nativeAccountId,target:{database:b.database,role:'schema_runtime_20261102_01',serverAddress:'127.0.0.1',serverPort:5432,postmasterStartedAt:'2026-11-02T00:00:00.000Z'}};
 const target={database:b.database,databaseOid:'16387',actingRole:binding.target.role,sessionUser:binding.target.role,serverAddress:binding.target.serverAddress,serverPort:binding.target.serverPort,postmasterStart:binding.target.postmasterStartedAt},short={batchId:b.batchId,fixedSourceNamespace:b.namespace,cutoffAt:b.now,selectionSha256:pins.selectionSha256};
 const save=async(name:string,value:unknown)=>{const bytes=Buffer.from(JSON.stringify(value)),path=join(dir,name);await writeFile(path,bytes);return {path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};};
 const candidates=rewrite26CaptureCandidates(f,dir);assert.equal(candidates.executionAuthorized,false);
 for(const capture of candidates.captures){for(const a of capture.artifacts)await writeFile(a.path,a.utf8);const refs=capture.recipeInputs;
  // Isolated test review verifies reader compatibility only; never an execution grant.
  const independentReview=await save(capture.entity+'-unit-qb.json',{result:'PASS',target,binding:short,recordsSha256:refs.records.sha256,originalsSha256:refs.originals.sha256,nativeBindingsSha256:refs.nativeBindings.sha256,canonicalCsvSha256:refs.canonicalCsv.sha256});
  const review=await save(capture.entity+'-unit-review.json',{version:'C_REWRITE26_CAPTURE_SOURCE26_REVIEW_V1',decision:'ACCEPT_EXACT_SOURCE_NATIVE_PROJECTIONS',binding:short,entity:capture.entity,...refs,independentReview,realImportExecutionAuthorized:false,target});
  const reader=await provider.openReviewedQa22Capture({mode:'QA_CAPTURE',review,...refs},binding,new AbortController().signal,target);
  let count=0;for await(const row of capture.entity==='BARCODE'?reader.rows():reader.chunks()){await reader.authorize(row);count++;}assert.equal(count,1);
  if(capture.entity==='BARCODE'){const closure=await reader.openClosure({batchId:b.batchId,fixedSourceNamespace:b.namespace,selectionSha256:pins.selectionSha256,authorizedPayloadHash:binding.authorizedPayloadHash},{group:'BARCODES',signal:new AbortController().signal}),actual=[];for await(const row of closure.typedRows())actual.push(row);const order=(a:{relation:string;key:string},c:{relation:string;key:string})=>Buffer.compare(Buffer.from(a.relation+'\0'+a.key),Buffer.from(c.relation+'\0'+c.key));assert.deepEqual(actual,[...f.groups.BARCODES.typedRows].sort(order));await closure.close();}
  await reader.close();
 }
 const moneyMap=v2MoneyApprovalSet(f.moneyCellCandidates,f.moneyCellCandidates),approved=prepareCurrentRuntime26MoneyBranch(f,moneyMap,'7'.repeat(64)),money=rewrite26MoneyCaptureCandidates(approved,dir);
 const moneyReader=await import('../scripts/import-v2/authorized-sales-detail-reader.mjs');
 for(const item of money.groups){for(const a of item.artifacts)await writeFile(a.path,a.utf8);const r=item.recipe,src=JSON.parse('['+(await (await import('node:fs/promises')).readFile(r.sourceRows.path,'utf8')).trim().split('\n').join(',')+']'),typed=JSON.parse('['+(await (await import('node:fs/promises')).readFile(r.typedRows.path,'utf8')).trim().split('\n').join(',')+']'),bindings=JSON.parse(await (await import('node:fs/promises')).readFile(r.nativeBindings.path,'utf8'));
  const reader=await moneyReader.openCapturedSalesSettlementSource({batchId:b.batchId,fixedSourceNamespace:b.namespace,trustedApprovalSha256:r.selection.approvalSha256,approvedMoneyOverlaySha256:'7'.repeat(64),resolveNativeBinding:async(q:{sourceKey:string})=>bindings.find((x:{sourceKey:string})=>x.sourceKey===q.sourceKey).bindings,capturedSource:{manifestFile:r.manifest.path,trustedManifestSha256:r.manifest.sha256,selection:r.selection,moneyApprovals:moneyMap,read:{async *sourceRows(){yield* src;},async typedRow(_d:unknown,key:string){return typed.find((x:{key:string})=>x.key===key);}},async verify(){},async close(){}}},item.group==='SALES_DETAILS'?'SALES_LINE':'SETTLEMENT');
  let count=0;for await(const _ of reader.rows())count++;assert.equal(count,16);await reader.close();
 }
 const offset=rewrite26OffsetSourceCandidates(f,dir),fs=await import('node:fs/promises');await fs.mkdir(join(dir,'snapshots'));await fs.mkdir(join(dir,'indices'));for(const a of [offset.snapshot,offset.baseManifest,...offset.indices,offset.indexManifest])await writeFile(a.path,a.utf8);
 const qb=await save('offset-unit-qb.json',{result:'PASS'}),indexReview=await save('offset-unit-review.json',{version:'C_MATERIALIZED_SOURCE_OFFSET_INDEX_REVIEW_V1',decision:'ACCEPT_EXACT_SOURCE_OFFSET_BINDINGS',binding:short,indexManifest:{path:offset.indexManifest.path,bytes:offset.indexManifest.bytes,sha256:offset.indexManifest.sha256},source:{path:offset.snapshot.path,bytes:offset.snapshot.bytes,sha256:offset.snapshot.sha256,rows:43},scope:'OFFSET_ROWS_ONLY',independentReview:{path:qb.path,sha256:qb.sha256,result:'PASS'},realImportExecutionAuthorized:false});
 const offsetModule=await import('../scripts/import-v3/verified-offset-source.mjs'),offsetReader=await offsetModule.openReviewedMaterializedSource({indexManifestFile:offset.indexManifest.path,trustedIndexManifestSha256:offset.indexManifest.sha256,reviewFile:indexReview.path,trustedReviewSha256:indexReview.sha256,binding:short,entities:['SKU','INVENTORY_BASELINE']});let sourceCount=0;for(const entity of ['SKU','INVENTORY_BASELINE'])for await(const chunk of offsetReader.chunks(entity,100))sourceCount+=chunk.length;assert.equal(sourceCount,3);await offsetReader.close();
 const b2=m.buildCurrentRuntime26SalesBlueprint({database:b.database,batchId:b.batchId,now:b.now,pins:{...pins,baseManifestSha256:offset.baseManifest.sha256}}),f2=await buildCurrentRuntime26FullSourceFixture(b2);assert.equal(rewrite26OffsetSourceCandidates(f2,dir).baseManifest.sha256,offset.baseManifest.sha256);
 const catalogue=rewrite26CatalogueCandidate(f2,join(dir,'catalogue.json'));await writeFile(catalogue.path,catalogue.utf8);const catalogueReview=await save('catalogue-unit-review.json',{version:'NATIVE_CATALOGUE_TECHNICAL_REVIEW_V1',...short,mappingSha256:catalogue.sha256});
 const catalogueOptions={mappingFile:catalogue.path,trustedMappingSha256:catalogue.sha256,reviewApprovalFile:catalogueReview.path,trustedReviewApprovalSha256:catalogueReview.sha256};
 const catModule=await import('../scripts/import-v3/native-source-authorizers.mjs'),catReader=await catModule.openReviewedCatalogueSource26({...catalogueOptions,binding:short});let catCount=0;for await(const chunk of catReader.chunks()){await catReader.authorize(chunk);catCount+=chunk.rows.length;}assert.equal(catCount,9);await catReader.close();
 await fs.mkdir(join(dir,'business'));await fs.mkdir(join(dir,'mappings'));const material=rewrite26SyntheticSourceByteCandidates(f2);for(const a of [...material.tables,...material.auxiliaryFiles].filter(x=>x.path==='business/02合法SKU.csv'||x.path==='mappings/old-to-canonical-sku-15121.csv'))await writeFile(join(dir,a.path),a.utf8);
 await fs.mkdir(join(dir,'product'));const season=await save('season-candidate.json',{scope:'SYNTHETIC_SOURCE_ONLY'}),partyMapping=await save('party-mapping.json',{scope:'SYNTHETIC_SOURCE_ONLY'});const product=rewrite26ProductCandidates(f2,join(dir,'product'),{catalogue:catalogue.sha256,parties:partyMapping.sha256,season_source:season.sha256});for(const a of [product.component,product.sourceManifest,product.derived,product.references])await writeFile(a.path,a.utf8);
 const productSourceReview=await save('product-source-unit-review.json',{version:'C_NATIVE_BINDING_PARTIAL_REVIEW_PIN_V1',decision:'ACCEPT_EXACT_QB_REVIEWED_PARTIAL_ARTIFACT_SCOPE',manifestSha256:product.sourceManifest.sha256,manifestBytes:product.sourceManifest.bytes,binding:short,components:[{component:'product-source-candidates.json',sha256:product.component.sha256,scope:'SYNTHETIC_ORIGINAL_SOURCE_ONLY'}],closedToUnreviewedComponents:true,realNativeCommandsOrImportAuthorizedByThisPinAlone:false});
 const productReview=await save('product-unit-review.json',{version:'C_NATIVE_PRODUCT_REFERENCE26_REVIEW_V1',decision:'ACCEPT_EXACT_MANIFEST_REFERENCE_BINDINGS',binding:{batchId:b.batchId,fixedSourceNamespace:b.namespace,selectionSha256:pins.selectionSha256},manifest:{sha256:product.references.sha256,bytes:product.references.bytes,products:1,validatorVersion:'NATIVE_PRODUCT_REFERENCE_DECISIONS_V2_EXACT26',schemaProfile:'EXACT26'},scope:'FULL_REFERENCE_DECISIONS_ONLY',independentReview:{path:qb.path,sha256:qb.sha256,result:'PASS'},realImportExecutionAuthorized:false});
 const productModule=await import('../scripts/import-v3/native-product-source26.mjs'),productReader=await productModule.openReviewedProductSource26({binding:short,authorizedPayloadHash:'5'.repeat(64),source:{directory:join(dir,'product'),trustedManifestSha256:product.sourceManifest.sha256,reviewRecordFile:productSourceReview.path,trustedReviewRecordSha256:productSourceReview.sha256},reference:{referenceDecisionFile:product.references.path,trustedReferenceDecisionSha256:product.references.sha256,mappingFiles:{catalogue:catalogue.path,parties:partyMapping.path,season_source:season.path,derived_season_proofs:product.derived.path},reviewFile:productReview.path,trustedReviewSha256:productReview.sha256},chunkRows:100});let productCount=0;for await(const chunk of productReader.chunks()){await productReader.authorize(chunk);productCount+=chunk.rows.length;}assert.equal(productCount,1);const productClosure=await productReader.openClosure({...short,authorizedPayloadHash:'5'.repeat(64)},{group:'PRODUCTS',signal:new AbortController().signal}),productRows=[];for await(const row of productClosure.sourceRows())productRows.push(row);assert.deepEqual(productRows,rewrite26ApplyProductCandidate(f2,product).groups.PRODUCTS.sourceRows);await productClosure.close();await productReader.close();
 const sku=rewrite26SkuCandidates(f2,dir,{indexManifestSha256:offset.indexManifest.sha256,sourceReview:{path:indexReview.path,sha256:indexReview.sha256},catalogueMappingSha256:catalogue.sha256,catalogueReviewSha256:catalogueReview.sha256});for(const a of [sku.product,sku.decisions,sku.manifest])await writeFile(a.path,a.utf8);
 const skuReview=await save('sku-unit-review.json',{version:'C_NATIVE_SKU26_REFERENCE_REVIEW_V1',decision:'ACCEPT_EXACT_PREPARED_SKU26_REFERENCE_BINDINGS',binding:short,manifest:{path:sku.manifest.path,sha256:sku.manifest.sha256,bytes:sku.manifest.bytes,rows:1,oldAliases:1},decisions:{path:sku.decisions.path,sha256:sku.decisions.sha256,bytes:sku.decisions.bytes,rows:1},scope:'SKU_REFERENCE_DECISIONS_ONLY',independentReview:{path:qb.path,sha256:qb.sha256,result:'PASS'},realImportExecutionAuthorized:false});
 const skuModule=await import('../scripts/import-v3/native-sku-source26.mjs'),skuReader=await skuModule.openReviewedSkuSource26({reviewFile:skuReview.path,trustedReviewSha256:skuReview.sha256,binding:short,authorizedPayloadHash:'5'.repeat(64),baseDirectory:dir,productSnapshotFile:sku.product.path,catalogue:catalogueOptions});let skuCount=0;for await(const row of skuReader.rows()){await skuReader.authorize(row);skuCount++;}assert.equal(skuCount,1);const skuClosure=await skuReader.openClosure({batchId:b.batchId,fixedSourceNamespace:b.namespace,selectionSha256:pins.selectionSha256,authorizedPayloadHash:'5'.repeat(64)},{group:'SKUS',signal:new AbortController().signal}),skuSources=[];for await(const r of skuClosure.sourceRows())skuSources.push(r);assert.deepEqual(skuSources,f2.groups.SKUS.sourceRows);await skuClosure.close();await skuReader.close();
 const party=rewrite26PartyCandidates(f2,dir);await writeFile(party.component.path,party.component.utf8);await writeFile(party.manifest.path,party.manifest.utf8);
 const partyReview=await save('party-unit-review.json',{version:'C_NATIVE_BINDING_PARTIAL_REVIEW_PIN_V1',decision:'ACCEPT_EXACT_QB_REVIEWED_PARTIAL_ARTIFACT_SCOPE',binding:short,manifestSha256:party.manifest.sha256,manifestBytes:party.manifest.bytes,closedToUnreviewedComponents:true,realNativeCommandsOrImportAuthorizedByThisPinAlone:false,components:[{component:'party-reference-candidates.json',sha256:party.component.sha256}]});
 const partyReaderModule=await import('../scripts/import-v3/native-party-source26.mjs');const partyReader=await partyReaderModule.openReviewedPartySource26({binding:short,authorizedPayloadHash:null,source:{directory:dir,trustedManifestSha256:party.manifest.sha256,reviewRecordFile:partyReview.path,trustedReviewRecordSha256:partyReview.sha256},historical:null,chunkRows:100});assert.equal(partyReader.report.ordinaryParties,115);await partyReader.verify();await assert.rejects(rewrite26CoreProjectionCandidate(f2,partyReader,{} as never),/Original bootstrap-bound party source required/);await partyReader.close();
 await fs.mkdir(join(dir,'header'));const headerCache=await fs.mkdtemp(join(await realpath(tmpdir()),'rewrite26-header-cache-'));t.after(()=>rm(headerCache,{recursive:true,force:true}));const headerModule=await import('../scripts/import-v3/native-transfer-header-source26.mjs');
 const tempHeader=rewrite26TransferHeaderCandidates(f2,join(dir,'header'),{partyReviewSha256:partyReview.sha256,receiptFile:join(dir,'header-receipt.json'),receiptSha256:'8'.repeat(64)});await writeFile(tempHeader.spool.path,Buffer.from(tempHeader.spool.base64,'base64'),{mode:0o600});
 const observed=await headerModule.observeTransferHeaderCapture26({spoolFile:tempHeader.spool.path,binding:short}),receipt=await save('header-receipt.json',observed),header=rewrite26TransferHeaderCandidates(f2,join(dir,'header'),{partyReviewSha256:partyReview.sha256,receiptFile:receipt.path,receiptSha256:receipt.sha256});for(const a of [header.decisions,header.manifest])await writeFile(a.path,a.utf8);
 const headerQb=await save('header-unit-qb.json',{result:'PASS',taskId:'REWRITE26_TRANSFER_HEADER_CAPTURE',scope:'REWRITE26_HEADER_SOURCE_REFERENCE_V1',binding:short,acceptedManifest:{sha256:header.manifest.sha256},acceptedDecisions:{sha256:header.decisions.sha256,rows:1}});
 const headerReview=await save('header-unit-review.json',{version:'C_NATIVE_TRANSFER_HEADER26_REFERENCE_REVIEW_V1',decision:'ACCEPT_EXACT_TRANSFER_HEADER_SOURCE_REFERENCE_BINDINGS',atUtc:b.now,binding:short,sourceCommit:'a'.repeat(40),manifest:{path:header.manifest.path,bytes:header.manifest.bytes,sha256:header.manifest.sha256},decisions:{path:header.decisions.path,bytes:header.decisions.bytes,sha256:header.decisions.sha256,rows:1},nativeContextReview:partyReview,originalSourceReview:receipt,scope:'TRANSFER_HEADER_SOURCE_REFERENCE_DECISIONS_ONLY',independentReview:{path:headerQb.path,bytes:headerQb.bytes,sha256:headerQb.sha256,result:'PASS_TRANSFER_HEADER_ONLY'},noNewSourceAuthority:'UNIT_ONLY',realImportExecutionAuthorized:false});
 const headerReader=await headerModule.openReviewedTransferHeaderSource26({binding:short,authorizedPayloadHash:null,reviewFile:headerReview.path,trustedReviewSha256:headerReview.sha256,originalSource:{spoolFile:header.spool.path,receiptFile:receipt.path,trustedReceiptSha256:receipt.sha256},parties:{directory:dir,trustedManifestSha256:party.manifest.sha256,reviewRecordFile:partyReview.path,trustedReviewRecordSha256:partyReview.sha256},cacheParent:headerCache});let headerCount=0;for await(const c of headerReader.chunks()){await headerReader.authorize(c);headerCount+=c.rows.length;}assert.equal(headerCount,1);await headerReader.close();
 for(const a of [...material.tables,...material.auxiliaryFiles].filter(x=>x.path==='business/12切换库存.csv'||x.path==='mappings/stock-contributor-lineage-38314.csv'))await writeFile(join(dir,a.path),a.utf8);
 const stock=rewrite26StockCandidates(f2,dir,{partyReviewSha256:partyReview.sha256,skuReviewSha256:skuReview.sha256});for(const a of [stock.decisions,stock.manifest])await writeFile(a.path,a.utf8);
 const stockReview=await save('stock-unit-review.json',{version:'C_NATIVE_STOCK26_REFERENCE_REVIEW_V1',decision:'ACCEPT_EXACT_PREPARED_STOCK26_REFERENCE_BINDINGS',atUtc:b.now,binding:short,manifest:{path:stock.manifest.path,bytes:stock.manifest.bytes,sha256:stock.manifest.sha256},decisions:{path:stock.decisions.path,bytes:stock.decisions.bytes,sha256:stock.decisions.sha256,groups:1,originalContributors:2,signedTotal:'10',negativeContributors:1,negativeGroups:0},scope:'STOCK_REFERENCE_DECISIONS_ONLY',independentReview:{path:qb.path,sha256:qb.sha256,result:'PASS',qualification:'UNIT_ONLY'},noNewSourceAuthority:'UNIT_ONLY',unrepresentedWarehouseScopes:{count:21,notInferredZero:true,originalAcceptedZeroEvidence:'EXPLICIT_SYNTHETIC_ZERO_TARGETS'},realImportExecutionAuthorized:false,baselinePosted:false});
 const stockModule=await import('../scripts/import-v3/native-stock-source26.mjs'),stockReader=await stockModule.openReviewedStockSource26({binding:short,authorizedPayloadHash:'5'.repeat(64),reviewFile:stockReview.path,trustedReviewSha256:stockReview.sha256,source:{indexManifestFile:offset.indexManifest.path,trustedIndexManifestSha256:offset.indexManifest.sha256,reviewFile:indexReview.path,trustedReviewSha256:indexReview.sha256,baseDirectory:dir},references:{parties:{directory:dir,trustedManifestSha256:party.manifest.sha256,reviewRecordFile:partyReview.path,trustedReviewRecordSha256:partyReview.sha256},skus:{reviewFile:skuReview.path,trustedReviewSha256:skuReview.sha256}}});let stockCount=0;for await(const g of stockReader.groups()){await stockReader.authorize(g);stockCount++;}assert.equal(stockCount,1);const stockClosure=await stockReader.openClosure({batchId:b.batchId,fixedSourceNamespace:b.namespace,selectionSha256:pins.selectionSha256,authorizedPayloadHash:'5'.repeat(64)},{group:'STOCK_CONTRIBUTORS',signal:new AbortController().signal}),stockSources=[];for await(const r of stockClosure.sourceRows())stockSources.push(r);assert.deepEqual(stockSources,f2.groups.STOCK_CONTRIBUTORS.sourceRows.toSorted((a,c)=>Buffer.compare(Buffer.from(a.relation+'\0'+a.key),Buffer.from(c.relation+'\0'+c.key))));await stockClosure.close();await stockReader.close();
 const lineIndex=offset.indices.find(x=>x.entity==='TRANSFER_LINE')!;await fs.mkdir(join(dir,'line'));const line=await rewrite26TransferLineCandidates(f2,join(dir,'line'),{originalSource:{path:offset.snapshot.path,bytes:offset.snapshot.bytes,sha256:offset.snapshot.sha256,rows:43},sourceIndexReview:indexReview,offsetIndex:{entity:'TRANSFER_LINE',path:lineIndex.path,bytes:lineIndex.bytes,sha256:lineIndex.sha256,rows:lineIndex.rows},baseManifest:{path:offset.baseManifest.path,bytes:offset.baseManifest.bytes,sha256:offset.baseManifest.sha256},headerReferenceReview:headerReview,skuReferenceReview:skuReview,headerDecisions:[JSON.parse(header.decisions.utf8)],skuDecisions:[JSON.parse(sku.decisions.utf8)]});assert.equal(JSON.parse(line.manifest.utf8).rows,1);assert.equal(line.executionAuthorized,false);
 const payment=rewrite26PaymentCandidate(f2,join(dir,'payment.json'));assert.equal(payment.executionAuthorized,false);assert.equal(payment.manifest.rows,3);assert.equal(payment.manifest.importAuthorized,false);await writeFile(payment.artifact.path,payment.artifact.utf8);const paymentManifest=await save('payment-manifest.json',payment.manifest);
 const paymentReview=await save('payment-unit-review.json',{version:'C_NATIVE_PAYMENT_REFERENCE_REVIEW_V1',decision:'ACCEPT_EXACT_PREPARED_PAYMENT_REFERENCE_BINDINGS',binding:short,manifest:{...paymentManifest,rows:3,counts:payment.manifest.counts},decisions:{path:payment.artifact.path,bytes:payment.artifact.bytes,sha256:payment.artifact.sha256,rows:3},scope:'PAYMENT_REFERENCE_DECISIONS_ONLY',independentReview:{path:qb.path,sha256:qb.sha256,result:'PASS'},realImportExecutionAuthorized:false});
 const paymentModule=await import('../scripts/import-v3/native-payment-source26.mjs'),paymentReader=await paymentModule.openReviewedPaymentSource26({reviewFile:paymentReview.path,trustedReviewSha256:paymentReview.sha256,binding:short,authorizedPayloadHash:null});let payments=0;for await(const c of paymentReader.chunks()){await paymentReader.authorize(c);payments+=c.rows.length;}assert.equal(payments,3);await paymentReader.close();
});
