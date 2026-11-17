/** Narrow source-wiring check; never import runner/application/PG modules. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const HERE=resolve('outputs/D1/20261117-r3-settlement24-upgrade-seam-source-01');
const SOURCE=resolve('outputs/D1/20261117-r3-settlement24-current-wire-fix-source-01');
const BASE=resolve('outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL35-NATIVE-SPEC-SUCCESSOR-UNISSUED-01/catalog_update/bundle/catalog-successor-run.mjs');
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const old=await readFile(BASE,'utf8'),next=await readFile(join(HERE,'settlement24-catalog-run.UNBOUND.mjs'),'utf8');
const checks=[];function check(name,value){assert(value,name);checks.push(name)}
check('actual successful catalog35 runner e851',hash(old)==='e85116b983059257e6529a4008afeb4c304e49c5378b43810fa6ad6deb4fa129');
const sql=await readFile(join(SOURCE,'operation/adapters/postgres/patches/settlement24-current-wire-successor.sql'),'utf8');
check('reuse reviewed SQL daf3 unchanged',hash(sql)==='daf378435cdc532e5e49649cf8a344fc4cf92e0c48f0d9da358d9a1b42108184');
const expression=next.split('\n').find(line=>line.includes('const wrapped=/')).split('const wrapped=')[1].split('.exec(sql.')[0];
const regex=vm.runInNewContext(expression,Object.create(null),{timeout:1000});
const matched=regex.exec(sql);check('exact original transaction wrapper recognized',matched?.length===4);
const lines=sql.split('\n');
check('same complete SQL transaction bytes roundtrip',[...lines.slice(0,3),matched[1],matched[2],matched[3],'COMMIT;',''].join('\n')===sql);
check('only reviewed SET settings passed',matched[1]==='SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;'&&matched[2]==='SET LOCAL quote_all_identifiers=off;');
for(const key of ['REQUEST','START','INNER'])check('unissued runtime '+key,next.includes('const '+key+'=null;'));
check('runtime refusal precedes any service read',next.indexOf("'ACTUAL_RUNTIME_BINDINGS_STILL_UNISSUED'")<next.indexOf('const sr=await protectedBytes(SERVICE'));
check('unbound entry refuses before reading credential input',next.slice(next.indexOf('async function main()')).indexOf("'ACTUAL_RUNTIME_BINDINGS_STILL_UNISSUED'")<next.slice(next.indexOf('async function main()')).indexOf('const p=await readInput()'));
check('command626 then exact successorada8',next.includes('const before=await catalogs.buildFresh35BatchedCommandSuccessorCatalogV1')&&next.includes('const after=await catalogs.buildFresh35Settlement24CurrentWireCatalogV1')&&next.includes("batchedCatalog.modelSha256==='ada8f33433c6a4188173e98ea155f840fbd23d4643921b54d89ed777a7b027a9'"));
for(const phase of ['before','after'])check('explicit independent '+phase+' routine body/definition observation',next.includes("observe("+(phase==='before'?'before':'after')+",'"+phase+"')"));
check('all3 routine pin rows observed',next.includes('for(const routine of d.routinePins)')&&next.includes("routine[phase+'BodySha256']")&&next.includes("routine[phase+'DefinitionSha256']"));
check('postcommit readonly independent observation',next.indexOf("await send('COMMIT','COMMIT','I')")<next.indexOf("await send('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY'"));
check('SQL DO only once inside original transaction',next.split("await send(doSql,'DO','T')").length===2);
for(const anchor of [' const send=async',' const current=async','function ownerGuard',' }catch(error){\n  out.commitOutcomeUnknown=']){
 const a=old.indexOf(anchor),b=next.indexOf(anchor);assert(a>=0&&b>=0);
 const end=anchor.startsWith(' }catch')?'async function main':anchor==='function ownerGuard'?'async function runUpdate':anchor===' const send=async'?' const current=async':' const observe=async';
 check('retained native guard/cleanup '+anchor.trim(),old.slice(a,old.indexOf(end,a+anchor.length))===next.slice(b,next.indexOf(end,b+anchor.length)));
}
const result={state:'SOURCE_UPGRADE_WIRING_CHECKS_PASS_RUNTIME_UNBOUND',checksPassed:checks.length,checks,
 nativeRunnerImported:false,PGConnections:0,SQLExecuted:false,clockCalls:0,applicationSourceLoaderCalls:0,
 prior91SemanticChecksRerun:false,SQLSemanticsReReviewed:false,runtimeBindings:null,actualDurableConclusion:null,actualRoot08Marker:null};
await writeFile(join(HERE,'CHECK-RESULT.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({state:result.state,checksPassed:checks.length}));
