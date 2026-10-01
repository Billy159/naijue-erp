import {spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const backend=process.argv.includes('--backend');
if(backend&&(!process.env.POSTGRES_DB||process.env.POSTGRES_DB==='business_management'))throw Error('后端回归必须指定隔离 POSTGRES_DB，不能使用真实业务数据库');
const frontend=['employee-permissions.cjs','shared-login-tabs.cjs','basic-settings-refactor.cjs','transfer-acceptance-core.cjs','transfer-reliability.cjs','transfer-history-cells.cjs','transfer-scan-drawer.cjs','transfer-presentation-state.cjs','sales-core.cjs','sales-inline-payment.cjs','sales-line-merge.cjs','product-barcode-validation.cjs','product-list-history.cjs','product-profile-current-selection.cjs','ledger-local-date.cjs','business-fit-roundtrip.mjs','sales-print-payments.cjs','recommendation-cache.cjs','sales-commit-state.cjs'];
const runtime=['employee-auth.test.ts','product-profile.test.ts','product-master.test.ts','product-spec-view.test.ts','specs.test.ts','supplements.test.ts','master-reference.test.ts','runtime.test.ts','size-mapping.test.ts','product-manual-alias.test.ts','sales-size-group.test.ts'];
const results=[];
for(const file of (backend?runtime:frontend)){
 const start=Date.now();
 const target=resolve(root,backend?'server/runtime':'frontend/verification',file);
 const result=spawnSync(process.execPath,[...(backend?['--import','tsx']:[]),target],{cwd:root,env:process.env,encoding:'utf8',timeout:240000,maxBuffer:4*1024*1024});
 results.push({file,exit:result.status,seconds:(Date.now()-start)/1000,stdout:result.stdout,stderr:result.stderr,error:result.error?.message});
 console.log(result.status===0?'PASS':'FAIL',file);
}
const out=resolve(root,'data-cleaning/verification/consolidation-20261001');mkdirSync(out,{recursive:true});
writeFileSync(resolve(out,backend?'backend-tests.json':'frontend-tests.json'),JSON.stringify(results,null,2)+'\n');
if(results.some(r=>r.exit!==0))process.exitCode=1;
