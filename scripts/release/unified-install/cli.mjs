#!/usr/bin/env node
/** Default dry-run. The actual adapter/runner is a separate controller API;
 * current CLI intentionally offers no database connection or secret input. */
import {pathToFileURL} from 'node:url';
import {BASE,loadUnifiedInstallPlan,describeUnifiedInstallPlan,need} from './source-plan.mjs';
import {writeTargetSourceBundle} from './comparison-bundle.mjs';
export function parseInstallArgs(args){
 if(args.length===0||args.length===1&&args[0]==='--help')return null;
 const out={};for(let i=0;i<args.length;i+=2){need(['--source-root','--scope','--source-bundle'].includes(args[i])&&typeof args[i+1]==='string'&&!Object.hasOwn(out,args[i]),'EXACT_DRY_RUN_SOURCE_ARGUMENTS_REQUIRED');out[args[i]]=args[i+1];}
 need(out['--source-root'],'EXPLICIT_RETAINED_DDL_SOURCE_ROOT_REQUIRED');return Object.freeze({sourceRoot:out['--source-root'],requestedScope:out['--scope']??'SCHEMA_ONLY',sourceBundle:out['--source-bundle']??null});
}
export async function main(args){const a=parseInstallArgs(args);if(!a){process.stdout.write('Dry-run: node scripts/release/unified-install/cli.mjs --source-root /ABS/retained-C12-source [--scope SCHEMA_ONLY|COMPONENT339|FULL_APPLICATION] [--source-bundle /ABS/new-output]\nNo PG/legacy data/application login or production action. Actual schema execution uses independently approved controller adapter, never this CLI.\n');return;}
 const plan=await loadUnifiedInstallPlan({sourceRoot:a.sourceRoot,baseCommit:BASE.commit,baseTree:BASE.tree,requestedScope:a.requestedScope});const bundle=a.sourceBundle?await writeTargetSourceBundle(plan,a.sourceBundle):null;
 process.stdout.write(JSON.stringify({mode:'DRY_RUN_NO_DATABASE',plan:describeUnifiedInstallPlan(plan),bundle},null,2)+'\n');}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main(process.argv.slice(2)).catch(error=>{process.stderr.write(JSON.stringify({status:'REFUSED_NO_DATABASE',code:error.code??error.name})+'\n');process.exitCode=2;});
