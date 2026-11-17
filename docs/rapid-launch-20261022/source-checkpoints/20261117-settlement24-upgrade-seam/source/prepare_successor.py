"""Minimal successor of the actually successful catalog35 native consumer."""
from pathlib import Path
import hashlib,json,difflib
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
V=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
BASE=V/'NORMAL35-NATIVE-SPEC-SUCCESSOR-UNISSUED-01/catalog_update/bundle/catalog-successor-run.mjs'
SOURCE=HERE.with_name('20261117-r3-settlement24-current-wire-fix-source-01')
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def main():
 old=BASE.read_bytes();assert sha(old)=='e85116b983059257e6529a4008afeb4c304e49c5378b43810fa6ad6deb4fa129'
 assert sha((SOURCE/'SOURCE-PINS.json').read_bytes())=='76864577847c0ab030aaa78881bc24ffd5d5db288b2af1034eb5fc26f2061c3b'
 sql=SOURCE/'operation/adapters/postgres/patches/settlement24-current-wire-successor.sql'
 assert sha(sql.read_bytes())=='daf378435cdc532e5e49649cf8a344fc4cf92e0c48f0d9da358d9a1b42108184'
 text=old.decode()
 def edit(a,b):
  nonlocal text
  assert text.count(a)==1,a;text=text.replace(a,b,1)
 edit("const REQUEST='t45-r3-batched161-command-successor-20261116-01';","const REQUEST=null; // Main must bind one actual upgrade job; never an old writer key.")
 edit("const START='t45-first-r3-native-service-start-20261116-35';","const START=null; // Actual future maintenance service, not a reconstructed C.")
 text=text.replace('installed-real-operation-batched-root06-20261116-01/operation','installed-real-operation-batched-root08-20261117-01/operation')
 edit("const INNER='/etc/naijue-erp/fresh35-batched161-command-successor-v1.json';","const INNER=null; // Bound only with actual reviewed finite maintenance authority.")
 edit("const SIGNATURE='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)';","const SIGNATURES=Object.freeze(['naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)','naijue_erp.assert_document_migration(uuid)','naijue_erp.standard_whole_package_verify_v2(jsonb,text)']);")
 text=text.replace('adapters/postgres/patches/0028_batched_history_hall_provenance.sql','adapters/postgres/patches/settlement24-current-wire-successor.sql')
 text=text.replace('849288162c8e21036b2b50e1a8ceaf4d5bc5edad2340a679dae488e9e10749f7','faaa57ae44e67f9d70f43913db121aadc1ed98d64e9a6049f65244a2bf543c19')
 for a,b in [('b7aa9fa8766d53d06ab9bd335d047fe9830cc95e8df31333e942193221ba7269','cf27add8653a4aa85b8cb10d609e2b85b1c4e55cf02f7fd2f5bf9e60ecb5ce9c'),('4be30c87bfea605a313e48a5a94e158f8cb7bb90d6d78aa00e4a0d28dfd14b26','9f4595dfd24f8c22d95d36725eefb38cda0ac2bd31707e88f9f45b6a723f8c29'),('6e0a0e039eead7714d4e2ec6c995678860dee16d35e7282245bc5748eb565e85','626c560485431d38db4b83e1247475af2996a41e980bd7d1db3de9aa91116811')]:text=text.replace(a,b)
 edit(" need(pin(REVIEWED_INPUT_SHA256),'FINAL_REVIEW_REQUIRED');"," need(typeof REQUEST==='string'&&typeof START==='string'&&typeof INNER==='string','ACTUAL_RUNTIME_BINDINGS_STILL_UNISSUED');\n need(pin(REVIEWED_INPUT_SHA256),'FINAL_REVIEW_REQUIRED');")
 text=text.replace('/batched-import-v1/COMMAND-SUCCESSOR-PINS.json','/batched-import-v1/SETTLEMENT24-CURRENT-WIRE-PINS.json')
 start=text.index(" need(review.format===");end=text.index(" const sql=",start)
 text=text[:start]+""" need(review.format==='FRESH35_SETTLEMENT24_CURRENT_WIRE_SUCCESSOR_PINS_V1'&&review.sqlPath===SQL
  &&review.sqlSha256==='daf378435cdc532e5e49649cf8a344fc4cf92e0c48f0d9da358d9a1b42108184'
  &&review.changes.length===3&&review.changes.every((r,i)=>r.signature===SIGNATURES[i]
   &&[r.beforeBodySha256,r.beforeDefinitionSha256,r.afterBodySha256,r.afterDefinitionSha256].every(pin)),
 'REVIEWED_EXACT_THREE_FUNCTIONS_REQUIRED');
"""+text[end:]
 start=text.index(' const wrapped=');end=text.index(' if(describe)',start)
 text=text[:start]+r""" const wrapped=/^--[^\n]*\n--[^\n]*\nBEGIN ISOLATION LEVEL READ COMMITTED;\n(SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;)\n(SET LOCAL quote_all_identifiers=off;)\n(DO \$settlement24_current_wire\$[\s\S]+\nEND \$settlement24_current_wire\$;)\nCOMMIT;\n$/.exec(sql.toString('utf8'));
 need(wrapped,'EXACT_REVIEWED_TRANSACTION_SOURCE_REQUIRED');
"""+text[end:]
 edit(" const before=await catalogs.buildFresh35BatchedCatalogV1(source,metadataTarget,base);\n const after=await catalogs.buildFresh35BatchedCommandSuccessorCatalogV1(source,metadataTarget,before);"," const batched=await catalogs.buildFresh35BatchedCatalogV1(source,metadataTarget,base);\n const before=await catalogs.buildFresh35BatchedCommandSuccessorCatalogV1(source,metadataTarget,batched);\n const after=await catalogs.buildFresh35Settlement24CurrentWireCatalogV1(source,metadataTarget,before);")
 edit("&&batchedCatalog.modelSha256!==predecessorBatchedCatalog.modelSha256","&&batchedCatalog.modelSha256==='ada8f33433c6a4188173e98ea155f840fbd23d4643921b54d89ed777a7b027a9'")
 text=text.replace("format:'FRESH35_BATCHED161_COMMAND_SUCCESSOR_PROGRAM_V1',requestKey:REQUEST,functionIdentity:SIGNATURE","format:'FRESH35_SETTLEMENT24_THREE_ROUTINE_SUCCESSOR_PROGRAM_V1',requestKey:REQUEST,functionIdentities:SIGNATURES")
 text=text.replace('beforeRoutine:review.before,afterRoutine:review.after','routinePins:review.changes')
 edit('doSql:wrapped[1]','doSql:wrapped[3],settings:wrapped.slice(1,3)')
 edit('publish,doSql}=ready','publish,doSql,settings}=ready')
 text=text.replace("'t45-batched161-command-update'","'t45-settlement24-three-routine-update'")
 text=text.replace("'batched161-command-'+d.programSha256","'settlement24-three-routine-'+d.programSha256")
 start=text.index(' const observe=async');end=text.index(' try{\n  await current()',start)
 text=text[:start]+r""" const observe=async(catalog,phase)=>{
  const statements=catalogs.fresh35Installed154UpgradeCatalogObservation(catalog,target);
  await send(statements.guardSql,'DO','T');
  const response=await send(statements.observationSql,'SELECT','T');
  need(response.rows?.length===1&&typeof response.rows[0].catalog_json==='string','CATALOG_PACKET_REQUIRED');
  const raw=response.rows[0].catalog_json,observed=statements.validate(raw),attributes={};
  for(const routine of d.routinePins){
   const result=await send(`SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') AS body,
    encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') AS definition,
    encode(sha256(convert_to((to_jsonb(p)-'prosrc')::text,'UTF8')),'hex') AS attributes
    FROM pg_catalog.pg_proc p WHERE oid=${quote(routine.signature)}::regprocedure`,'SELECT','T');
   need(result.rows?.length===1&&result.rows[0].body===routine[phase+'BodySha256']
    &&result.rows[0].definition===routine[phase+'DefinitionSha256']&&pin(result.rows[0].attributes),'EXACT_ROUTINE_DIFFERS');
   attributes[routine.signature]=result.rows[0].attributes;
  }
  return {raw,catalogSha256:observed.catalogSha256,routineAttributesSha256:sha(JSON.stringify(attributes))};
 };
"""+text[end:]
 text=text.replace('observe(before,d.beforeRoutine)',"observe(before,'before')").replace('observe(after,d.afterRoutine)',"observe(after,'after')")
 edit("  await send('BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN','T');","  await send('BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN','T');\n  for(const sql of settings)await send(sql,'SET','T');")
 edit("  await send('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY','BEGIN','T');","  await send('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY','BEGIN','T');\n  for(const sql of settings)await send(sql,'SET','T');")
 text=text.replace('beforeRoutine:d.beforeRoutine,afterRoutine:d.afterRoutine','routinePins:d.routinePins')
 text=text.replace('DB05_COMMAND_SUCCESSOR_APPLIED_AND_READ_BACK','SETTLEMENT24_THREE_ROUTINES_APPLIED_AND_READ_BACK')
 edit(" const p=await readInput(),ready=await compile(p,mode==='describe');"," need(typeof REQUEST==='string'&&typeof START==='string'&&typeof INNER==='string','ACTUAL_RUNTIME_BINDINGS_STILL_UNISSUED');\n const p=await readInput(),ready=await compile(p,mode==='describe');")
 (HERE/'settlement24-catalog-run.UNBOUND.mjs').write_text(text)
 (HERE/'CATALOG35-TO-THREE-ROUTINES.patch').write_text(''.join(difflib.unified_diff(old.decode().splitlines(True),text.splitlines(True),fromfile='actual-catalog35-e851.mjs',tofile='settlement24-upgrade.UNBOUND.mjs')))
 print(json.dumps({'state':'SOURCE_SEAM_PREPARED_RUNTIME_UNBOUND','runnerSha256':sha(text.encode()),'SQLReusedUnchanged':True}))
if __name__=='__main__':main()
