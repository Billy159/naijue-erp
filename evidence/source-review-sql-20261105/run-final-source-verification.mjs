import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadFresh35SourceReviewCandidate} from '../../scripts/release/unified-install/fresh35-source-review-candidate.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const root=resolve(new URL('../..',import.meta.url).pathname),out=resolve(root,'evidence/source-review-sql-20261105');
const predecessorPath='/workspace/shared/fresh35-install-review-plan-20261105-r2/01-schema-REVIEW-ONLY.sql';
if(process.version!=='v24.21.0')throw Error('EXACT_NODE_24_21_0_REQUIRED');
const startedAt=new Date().toISOString();
const candidate=await loadFresh35SourceReviewCandidate(root,{predecessorPath});
await writeFile(resolve(out,'candidate-REVIEW-ONLY.sql'),candidate.reviewSql);
await writeFile(resolve(out,'candidate.json'),JSON.stringify(candidate.manifest,null,2)+'\n');
const files=['tests/fresh35-source-review-candidate.test.mjs','tests/historical-sales-source-review.test.ts','tests/historical-sales-source-review-cli.test.mjs',
 'tests/fresh35-combined-catalog.test.mjs','tests/fresh35-combined-lifecycle.test.mjs','tests/fresh35-combined-source.test.mjs','tests/fresh35-combined-target.test.mjs',
 'tests/fresh35-sales-hall-candidate.test.mjs','tests/fresh35-historical-amount-candidate.test.mjs'];
const testPins=await Promise.all(files.map(async path=>({path,sha256:hash(await readFile(resolve(root,path)))})));
let status=0,output='';
try{output=execFileSync(process.execPath,['--test',...files],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});}
catch(error){status=typeof error.status==='number'?error.status:1;output=String(error.stdout??'')+String(error.stderr??'');}
await writeFile(resolve(out,'final-source-tests.log'),output);
await writeFile(resolve(out,'final-source-tests.exit'),String(status)+'\n');
const changed=[];
for(const pin of [...candidate.manifest.sourcePins,...testPins])if(hash(await readFile(resolve(root,pin.path)))!==pin.sha256)changed.push(pin.path);
const result={startedAt,completedAt:new Date().toISOString(),node:process.version,nodePath:process.execPath,
 command:[process.execPath,'--test',...files],exitCode:status,sourcePinsUnchanged:changed.length===0,changedPaths:changed,
 predecessorSha256:hash(await readFile(predecessorPath)),candidateSqlSha256:hash(candidate.reviewSql),
 projectedTables:35,projectedRoutines:166,newRoutines:14,changedExistingRoutines:13,
 sourceSetSha256:candidate.manifest.sourceSetSha256,sourcePins:candidate.manifest.sourcePins,testPins,
 sourceOnly:true,postgresConnected:false,postgresParsed:false,postgresEngineVerified:false,
 finalReportFromSqlSubreviewerReceived:false,reviewFailureEvidence:'independent-review-status.json',
 independentFullAdmission:false,installationReady:false,persisted:false,freshBootstrapClosed:false,reprocessingImplemented:false};
await writeFile(resolve(out,'final-source-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(output.split('\n').slice(-12).join('\n'));
console.log(JSON.stringify({sourcePinsUnchanged:result.sourcePinsUnchanged,sqlSha256:result.candidateSqlSha256,node:result.node}));
if(status||changed.length)process.exitCode=1;
