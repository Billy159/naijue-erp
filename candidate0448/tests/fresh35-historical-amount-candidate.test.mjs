import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=v=>createHash('sha256').update(v).digest('hex');
const load=async()=>import('../scripts/release/unified-install/fresh35-historical-amount-candidate.mjs');
test('exact35 amount candidate is source-only and adds no tables, columns, grants, or routines',async()=>{
 const candidate=await (await load()).loadFresh35HistoricalAmountCandidate(root);
 assert.equal(candidate.manifest.engineVerified,false);assert.equal(candidate.manifest.installationReady,false);
 assert.equal(candidate.manifest.newTables,0);assert.equal(candidate.manifest.newColumns,0);assert.equal(candidate.manifest.newRoutines,0);
 assert.deepEqual(candidate.manifest.columnChanges,[]);assert.equal(candidate.manifest.permissionsChanged,false);
 assert.equal(candidate.manifest.routineChanges.length,4);
 assert.equal((candidate.patchSql.match(/^BEGIN;$/gm)||[]).length,1);assert.equal((candidate.patchSql.match(/^COMMIT;$/gm)||[]).length,1);
 assert.doesNotMatch(candidate.patchSql.replace(/^--.*$/gm,''),/\b(?:CREATE TABLE|ALTER TABLE|DROP TABLE|TRUNCATE|GRANT\s+|DISABLE TRIGGER)\b/i);
 for(const pin of candidate.manifest.sourcePins)assert.equal(hash(await readFile(new URL('../'+pin.path,import.meta.url))),pin.sha256,pin.path);
});
test('candidate consumes independently reviewed evidence exactly and keeps all numeric source strings',async()=>{
 const candidate=await (await load()).loadFresh35HistoricalAmountCandidate(root);
 const bodies=candidate.changedBodies.map(x=>x.body).join('\n');
 for(const marker of ['HISTORICAL_LINE_AMOUNT_EVIDENCE_HASH','HISTORICAL_LINE_AMOUNT_APPROVAL_SHAPE','HISTORICAL_LINE_AMOUNT_PARENT_DIFFERS','HISTORICAL_LINE_AMOUNT_SOURCE_DIFFERS','HISTORICAL_LINE_AMOUNT_EXACT_SET_REQUIRED','HISTORICAL_LINE_AMOUNT_KNOWN_TOTALS_DIFFER','HISTORICAL_LINE_AMOUNT_NEW_ACTION_REQUIRES_FORMULA','historical_line_amount_evidence','historical_line_amount_differences','calculated_line_amount','difference','quantity','deal_price','line_amount'])assert.ok(bodies.includes(marker),marker);
 assert.ok(bodies.includes("IS JSON OBJECT WITH UNIQUE KEYS"));assert.ok(bodies.includes("'utf8','sha256'"));
 assert.ok(bodies.includes("'MIGRATE_DOCUMENT'"));assert.ok(bodies.includes("'PRESERVED_SOURCE_DIFFERENCE'"));
});
test('patch rejects drifted predecessor and requires exact unique replacement anchors',async()=>{
 const module=await load(),candidate=await module.loadFresh35HistoricalAmountCandidate(root);
 const spec=candidate.specs[0],before=candidate.predecessorBodies.find(r=>r.signature===spec.signature).body;
 assert.throws(()=>module.applyHistoricalAmountReplacement(before+' ',spec),/PREDECESSOR/);
 assert.throws(()=>module.applyHistoricalAmountReplacement(before,{...spec,replacements:[{before:'absent_unique_anchor',after:'x'}]}),/ANCHOR/);
 assert.equal(hash(module.applyHistoricalAmountReplacement(before,spec)),spec.successor_sha256);
});
test('amount successor composes after the hall change without replacing the hall provenance controls',async()=>{
 const c=await (await load()).loadFresh35HistoricalAmountCandidate(root);
 const command=c.changedBodies.find(r=>r.signature.includes('.standard_whole_package_command_v2(')).body;
 for(const s of ['HISTORICAL_HALL_APPROVAL_MEMBERSHIP','HISTORICAL_HALL_CAPTURE_CHANGED','historical_hall_evidence','STANDARD_EXACT_NUMERIC_STRING_REQUIRED','WHOLE_TWO_CAPABILITIES_REQUIRED','WHOLE_DOCUMENT_ALREADY_SEALED','HISTORICAL_LINE_AMOUNT_EVIDENCE_REQUIRED'])assert.ok(command.includes(s),s);
 assert.equal(c.manifest.successorRoutinePins.length,152);assert.equal(c.manifest.tableCount,35);
 const h=await import('../scripts/release/unified-install/fresh35-sales-hall-candidate.mjs'),hall=await h.loadFresh35SalesHallCandidate(root);
 const hallCommand=hall.manifest.routineChanges.find(s=>s.signature.includes('.standard_whole_package_command_v2('));
 assert.equal(c.specs.find(s=>s.signature.includes('.standard_whole_package_command_v2(')).predecessor_sha256,hallCommand.after);
});
test('new evidence is restricted to the explicit new profile and cannot be self-issued by a detail entry',async()=>{
 const c=await (await load()).loadFresh35HistoricalAmountCandidate(root),command=c.changedBodies.find(r=>r.signature.includes('.standard_whole_package_command_v2(')).body;
 assert.ok(command.includes(`payload->>'schema_declarations_sha256' IS DISTINCT FROM '${c.manifest.requiredSourceProfileSha256}'`));
 assert.ok(command.includes(`cfg->>'schema_declarations_sha256' IS DISTINCT FROM '${c.manifest.requiredSourceProfileSha256}'`));
 const typed=command.slice(command.indexOf("IF entry-ARRAY['record_id','entity_type'"),command.indexOf("THEN RAISE EXCEPTION 'STANDARD_TYPED_ROW_SHAPE_INVALID'"));
 assert.ok(typed.length>0);assert.ok(!typed.includes('historical_line_amount_evidence'));assert.ok(!typed.includes('historical_line_amount_approval'));
 assert.ok(command.includes("amount_fact:=amount_facts_by_id->target::text"));
 assert.ok(command.indexOf('INTO amount_facts_by_id')<command.indexOf("FOR entry IN SELECT value FROM jsonb_array_elements(payload->'rows')"));
});
test('INIT validates bounded exact strings, source occurrences, uniqueness and genuine discrepancies',async()=>{
 const c=await (await load()).loadFresh35HistoricalAmountCandidate(root),command=c.changedBodies.find(r=>r.signature.includes('.standard_whole_package_command_v2(')).body;
 for(const x of ['BETWEEN 1 AND 4194304','NOT BETWEEN 1 AND 10000',"(amount_fact->>'quantity')::bigint::text", "(amount_fact->>'line_amount')::numeric(18,2)::text",'HISTORICAL_LINE_AMOUNT_DIFFERENCE_REQUIRED',"count(DISTINCT fact->>'line_id')","count(DISTINCT fact->>'line_source_key')",'jsonb_agg(ref ORDER BY ref::text)',"amount_fact->'source_refs'", "amount_fact->'sales_source_refs'",'HISTORICAL_LINE_AMOUNT_APPROVAL_DUPLICATE'])assert.ok(command.includes(x),x);
 assert.ok(!/line_amount\s*:=|deal_price\s*:=|SET line_amount/i.test(command));
});
test('immutable proof includes source hash binding and final exact consumption; no partial allow-list',async()=>{
 const c=await (await load()).loadFresh35HistoricalAmountCandidate(root),command=c.changedBodies.find(r=>r.signature.includes('.standard_whole_package_command_v2(')).body,migration=c.changedBodies.find(r=>r.signature.includes('.assert_document_migration(')).body;
 for(const x of ["parsed:=parsed||jsonb_build_object('historical_line_amount_evidence',amount_evidence)","item:=item||jsonb_build_object('historical_line_amount_evidence',amount_evidence)",'amount_consumed<>jsonb_array_length',"proof->'historical_line_amount_evidence'->'fact'=fact",'HISTORICAL_LINE_AMOUNT_EXACT_SET_REQUIRED'])assert.ok(command.includes(x),x);
 assert.ok(command.indexOf("'historical_line_amount_evidence',amount_evidence")<command.indexOf("source_hash:=encode(sha256(convert_to(parsed::text"));
 for(const x of ['amount_init_receipt.status IS DISTINCT FROM',"amount_init->>'document_batch_id'",'amount_init_audit.actor_account_id IS DISTINCT FROM',"amount_fact->'quantity' IS DISTINCT FROM amount_line->'quantity'","amount_fact->'deal_price' IS DISTINCT FROM amount_line->'deal_price'","amount_fact->'line_amount' IS DISTINCT FROM amount_line->'line_amount'",'src.source_record_hash','HISTORICAL_LINE_AMOUNT_MIGRATION_ORIGIN_REQUIRED'])assert.ok(migration.includes(x),x);
 // standard_import_record_proof exposes source_hash as the enclosing manifest;
 // rechecking the typed-row digest must read its distinct persistent column.
 assert.ok(!migration.includes("IS DISTINCT FROM amount_proof->>'source_hash'"));
});
test('current economic actions retain formula and approved settlement rules; no metadata-only bypass was silently added',async()=>{
 const c=await (await load()).loadFresh35HistoricalAmountCandidate(root),body=c.changedBodies.find(r=>r.signature.includes('.validate_sales_settlement(')).body;
 assert.ok(body.includes("IF evidence.action IN ('SAVE','APPROVE') AND EXISTS"));
 assert.ok(body.indexOf('HISTORICAL_LINE_AMOUNT_NEW_ACTION_REQUIRES_FORMULA')<body.indexOf("IF evidence.action='MIGRATE_DOCUMENT'"));
 for(const x of ['RESTORATION_KNOWN_ECONOMICS_DIFFER','RESTORATION_ORIGIN_INVALID','ordinary approved state requires settlement net equal to net due'])assert.ok(body.includes(x),x);
 assert.equal(c.manifest.editBoundary,'NO_NEW_METADATA_SAVE_EXCEPTION; SAVE_AND_APPROVE_REQUIRE_ORDINARY_FORMULA');
});
test('credential-bound fenced verification reads original and current separately, and numeric diagnostics do not replace stored amounts',async()=>{
 const c=await (await load()).loadFresh35HistoricalAmountCandidate(root),v=c.changedBodies.find(r=>r.signature.includes('.standard_whole_package_verify_v2(')).body;
 for(const x of ['standard_whole_package_inspect_v2(init_request,encoded_scrypt)','WHOLE_VERIFY_COMMITTED_PACKAGE_REQUIRED','FOR SHARE','STANDARD_VERIFY_SOURCE_TO_ORIGINAL_LINE_DIFFERS','STANDARD_VERIFY_ORDINARY_CHAIN_INVALID',"'original_quantity'","'original_deal_price'","'original_line_amount'","'current_quantity'","'current_deal_price'","'current_line_amount'","'current_matches_original'","'calculated_line_amount'","'difference'"])assert.ok(v.includes(x),x);
 assert.ok(!/UPDATE naijue_erp\.sales_line|INSERT INTO naijue_erp\.sales_line|\.\.\/|fetch\(/.test(v));
 assert.ok(c.reviewSql.includes("RAISE EXCEPTION 'FRESH35_HISTORICAL_AMOUNT_REVIEW_ONLY'"));
});
test('new-profile empty-settlement restoration hashes original hall/archive/zero extensions while old profiles keep their exact base hash',async()=>{
 const c=await (await load()).loadFresh35HistoricalAmountCandidate(root),body=c.changedBodies.find(r=>r.signature.includes('.validate_sales_settlement(')).body;
 const base="jsonb_build_object('source_key',source_item->>'source_key','fields',source_item->'fields','source_refs',source_item->'source_refs')";
 // Reproduction is a structural/hash-input model, not a PostgreSQL execution.
 const original={source_key:'SYNTHETIC-HEADER',fields:{id:'SYNTHETIC-ONLY'},source_refs:[{file_sha256:'a'.repeat(64),sheet:'synthetic',row:1}]};
 const withHall={...original,historical_hall_evidence:{format_version:'HISTORICAL_SALES_HALL_EVIDENCE_V1',basis:'PENDING_REVIEW'}};
 assert.notEqual(hash(JSON.stringify(original)),hash(JSON.stringify(withHall)),'Adding the original capture changes the immutable hash input');
 assert.ok(body.includes(`restoration_source_fields:=${base};`));
 assert.ok(body.includes(`IF restoration_profile='${c.manifest.requiredSourceProfileSha256}' THEN`));
 assert.ok(body.includes("FOREACH restoration_extension IN ARRAY ARRAY['explicit_zero_evidence','zero_amount_archive','historical_hall_evidence'] LOOP"));
 assert.ok(body.includes("(source_item ? restoration_extension) IS DISTINCT FROM (source_entry ? restoration_extension)"));
 assert.ok(body.includes("source_item->restoration_extension IS DISTINCT FROM source_entry->restoration_extension"));
 assert.ok(body.includes("source_item->>'source_hash' IS DISTINCT FROM encode(sha256(convert_to(restoration_source_fields::text,'UTF8')),'hex')"));
 assert.ok(!body.includes("source_item->>'source_hash' IS DISTINCT FROM encode(sha256(convert_to("+base+"::text"));
 const old=c.predecessorBodies.find(r=>r.signature.includes('.validate_sales_settlement(')).body;
 assert.ok(old.includes("source_item->>'source_hash' IS DISTINCT FROM encode(sha256(convert_to("+base+"::text"),'Exact predecessor contains the reproduced omission');
});
test('restoration extension projection rejects omitted, changed and cross-kind evidence without weakening receipt or actor proof (offline model)',async()=>{
 const c=await (await load()).loadFresh35HistoricalAmountCandidate(root),body=c.changedBodies.find(r=>r.signature.includes('.validate_sales_settlement(')).body;
 const keys=/FOREACH restoration_extension IN ARRAY ARRAY\[([^\]]+)\] LOOP/.exec(body)[1].split(',').map(s=>s.replaceAll("'",''));
 assert.deepEqual(keys,['explicit_zero_evidence','zero_amount_archive','historical_hall_evidence']);
 assert.ok(body.includes("restoration_profile:=source_audit.after_values->'request'->'payload'->>'schema_declarations_sha256'"));
 assert.ok(body.includes("source_audit.after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM restoration_root_operation::text"));
 for(const x of ["source_item->'fields'->>'quantity' IS DISTINCT FROM '0'","proof_target.kind IS DISTINCT FROM 'SALES_HEADER'","source_item ? 'historical_line_amount_evidence'",'source_receipt.request_hash IS DISTINCT FROM','source_audit.actor_account_id IS DISTINCT FROM source_receipt.actor_account_id','source_item->\'source_refs\'','RESTORATION_EFFECTS_INVALID','RESTORATION_CHAIN_INCOMPLETE','RESTORATION_KNOWN_ECONOMICS_DIFFER'])assert.ok(body.includes(x),x);
 const profile=c.manifest.requiredSourceProfileSha256,base={source_key:'SYNTHETIC',fields:{quantity:'0'},source_refs:[{file_sha256:'1'.repeat(64),sheet:null,row:1}]};
 const project=(selected,kind,item,entry)=>{
  const out={source_key:item.source_key,fields:item.fields,source_refs:item.source_refs};
  if(selected===profile){
   if(kind==='SALES_HEADER'&&!Object.hasOwn(item,'historical_hall_evidence')||Object.hasOwn(item,'historical_line_amount_evidence'))throw Error('invalid extension');
   for(const k of keys){
    if(Object.hasOwn(item,k)!==Object.hasOwn(entry,k)||JSON.stringify(item[k])!==JSON.stringify(entry[k]))throw Error('evidence differs');
    if(Object.hasOwn(item,k)){if(!item[k]||typeof item[k]!=='object'||Array.isArray(item[k])||k==='explicit_zero_evidence'&&(kind!=='INVENTORY_KEY'||item.fields.quantity!=='0')||k!=='explicit_zero_evidence'&&kind!=='SALES_HEADER')throw Error('invalid extension');out[k]=item[k];}
   }
  }
  return out;
 };
 const header={...base,historical_hall_evidence:{selected_hall_id:null,basis:'PENDING_REVIEW'},zero_amount_archive:{profile:'ZERO_AMOUNT_SOURCE_ARCHIVE_V1',records:[{amount:'0.00'}]}};
 const key={...base,explicit_zero_evidence:{approval_sha256:'a'.repeat(64)}};
 for(const [kind,item] of [['SALES_HEADER',header],['INVENTORY_KEY',key]]){
  assert.deepEqual(project(profile,kind,item,structuredClone(item)),item);
  for(const field of keys.filter(k=>Object.hasOwn(item,k))){const removed=structuredClone(item);delete removed[field];assert.throws(()=>project(profile,kind,item,removed),/differs/);const changed=structuredClone(item);changed[field]={changed:true};assert.throws(()=>project(profile,kind,item,changed),/differs/);}
  assert.deepEqual(project('old-profile',kind,item,{}),base,'Old hash input remains byte-contract equivalent, not newly expanded');
 }
 assert.throws(()=>project(profile,'SALES_LINE',header,header),/invalid/);
 assert.throws(()=>project(profile,'SALES_HEADER',{...header,historical_line_amount_evidence:{}},{...header,historical_line_amount_evidence:{}}),/invalid/);
 assert.throws(()=>project(profile,'INVENTORY_KEY',{...key,fields:{quantity:'1'}},{...key,fields:{quantity:'1'}}),/invalid/);
});
test('old zero/archive restoration omission is source-reachable but remains unmodified outside the reviewed new profile',async()=>{
 const c=await (await load()).loadFresh35HistoricalAmountCandidate(root),command=c.predecessorBodies.find(r=>r.signature.includes('.standard_whole_package_command_v2(')).body,body=c.changedBodies.find(r=>r.signature.includes('.validate_sales_settlement(')).body;
 // Existing producer includes these keys whenever present, including the old
 // historical source cohort. This is a source-path counterexample, not DB QA.
 for(const key of ['explicit_zero_evidence','zero_amount_archive']){
  assert.ok(command.includes(`parsed:=parsed||jsonb_build_object('${key}',entry->'${key}')`));
  const b={source_key:'SYNTHETIC-OLD',fields:{quantity:'0'},source_refs:[]};assert.notEqual(hash(JSON.stringify(b)),hash(JSON.stringify({...b,[key]:{synthetic:true}})));
 }
 assert.ok(command.includes('89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e'));
 const gate=body.slice(body.indexOf("   IF restoration_profile="),body.indexOf("   IF source_record.source_system"));
 assert.ok(!gate.includes('89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e'));
 assert.equal((gate.match(/restoration_profile=/g)||[]).length,1);
});
