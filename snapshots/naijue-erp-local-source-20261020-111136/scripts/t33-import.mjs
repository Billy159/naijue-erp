import './check-toolchain.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {calculateHistoryPlan} from '../server/domain/inventory/history-plan.ts';
import {importHistoryInventory,verifyHistoryInputArtifacts} from '../server/domain/inventory/history-store.ts';
import {PgDataAccess} from '../server/database/access.ts';
import {readDatabaseConfig,assertIsolatedTarget} from '../server/database/config.ts';

const [operation,...args]=process.argv.slice(2),flags=new Map();
if(!['plan','import'].includes(operation) || args.length%2)throw Error('Use plan|import --input FILE --artifact-root DIR --output FILE [--target FILE]');
for(let i=0;i<args.length;i+=2){if(!['--input','--artifact-root','--output','--target'].includes(args[i]) || flags.has(args[i]))throw Error('Invalid or duplicate T33 flag');flags.set(args[i],args[i+1]);}
for(const name of ['--input','--artifact-root','--output'])if(!flags.get(name))throw Error(name+' is required');
const input=JSON.parse(readFileSync(resolve(flags.get('--input')),'utf8')),artifactRoot=resolve(flags.get('--artifact-root'));
const plan=calculateHistoryPlan(input);verifyHistoryInputArtifacts(artifactRoot,input);
let result=plan;
if(operation==='import'){
  if(!flags.get('--target'))throw Error('Explicit bound target contract required');
  const target=JSON.parse(readFileSync(resolve(flags.get('--target')),'utf8')),config=readDatabaseConfig();assertIsolatedTarget(config);
  const access=new PgDataAccess(config);
  try{result=await importHistoryInventory(access,config,target,artifactRoot,input);}finally{await access.close();}
}
writeFileSync(resolve(flags.get('--output')),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({operation,output:resolve(flags.get('--output')),manifestSha256:plan.manifestSha256,productionActivation:false}));
