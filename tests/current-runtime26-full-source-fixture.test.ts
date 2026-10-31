import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildCurrentRuntime26SalesBlueprint, CURRENT_SALES_QA_TARGET } from './integration/current-runtime26-sales-fixture.ts';
import { buildCurrentRuntime26FullSourceFixture, validateCurrentRuntime26FullSourceFixture, buildCurrentRuntime26FullClosureExpected, prepareCurrentRuntime26MoneyBranch } from './integration/current-runtime26-full-source-fixture.ts';
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
