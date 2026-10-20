import './check-toolchain.mjs';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {readDatabaseConfig} from '../server/database/config.ts';
import {importHistoricalBody,importProductionHistoricalBody} from '../server/domain/imports/historical-body.ts';
import {readProductionAdmission,productionTarget} from '../server/database/production-admission.ts';
import {canonicalJson} from '../server/domain/idempotency/index.ts';
import {importApprovedCurrentSourceBodies} from '../server/domain/imports/current-source-body.ts';

const args=process.argv.slice(2),flags=new Map();
const current=args[0]==='--approved-current-source';
const formal=current||args[0]==='--production-maintenance';if(formal)args.shift();
if(args.length!==8)throw Error('Use [--production-maintenance | --approved-current-source] --input FILE --artifact-root DIR --target FILE --output FILE');
for(let i=0;i<args.length;i+=2){
  if(!['--input','--artifact-root','--target','--output'].includes(args[i])||flags.has(args[i]))throw Error('Invalid historical import flag');
  flags.set(args[i],args[i+1]);
}
for(const name of ['--input','--artifact-root','--target','--output'])if(!flags.get(name))throw Error(name+' is required');
const input=JSON.parse(readFileSync(resolve(flags.get('--input')),'utf8'));
const target=JSON.parse(readFileSync(resolve(flags.get('--target')),'utf8'));
const config=readDatabaseConfig();
let result;
if(formal){
  if(config.environment!=='production'||canonicalJson(target)!==canonicalJson(productionTarget(config)))throw Error('DECLARED_FORMAL_HISTORICAL_TARGET_MISMATCH');
  if(existsSync(resolve(flags.get('--output'))))throw Error('FORMAL_RECEIPT_PATH_ALREADY_EXISTS');
  const required=key=>{if(!process.env[key])throw Error(key+' is required');return process.env[key];};
  const admission=readProductionAdmission(config,{
    admissionFile:required('POSTGRES_PRODUCTION_ADMISSION_FILE'),
    authorityPublicKeyFile:required('POSTGRES_PRODUCTION_AUTHORITY_FILE'),
    authorityPublicKeySha256:required('POSTGRES_PRODUCTION_AUTHORITY_SHA256'),
    releaseFile:required('POSTGRES_PRODUCTION_RELEASE_FILE')});
  result=current
    ?await importApprovedCurrentSourceBodies(config,admission,resolve(flags.get('--artifact-root')),input.approvalManifest,input.materialization,input.importOperatorId)
    :await importProductionHistoricalBody(config,admission,resolve(flags.get('--artifact-root')),input);
}else result=await importHistoricalBody(config,target,resolve(flags.get('--artifact-root')),input);
writeFileSync(resolve(flags.get('--output')),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({documentBinding:result.documentBinding,settlementCount:result.settlementCount,observations:result.observations,
  applied:result.applied,writes:result.writes,productionActivation:false}));
