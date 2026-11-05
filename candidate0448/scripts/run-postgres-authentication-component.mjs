/** Separate dormant component entry. No provisioning, .env, production factory or automatic retry. */
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {authenticationComponentSettings} from '../tests/integration/authentication-component-settings.ts';
import {safeTarget} from '../tests/integration/safety.ts';
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help'){
 console.log('Standalone synthetic authentication HTTP/service/real-PG component, schema1–10 only. Read docs/POSTGRES-AUTHENTICATION-COMPONENT.md. Requires explicit --run-authentication-component, NODE_ENV=test, NAIJUE_PG_INTEGRATION, NAIJUE_PG_TEST_SUITE=authentication-component-0001-0010, dedicated test URL/name and NAIJUE_PG_COMPONENT_DATA_DIRECTORY. No ERP V6/V7/V8, schema repair, provisioning or production acceptance.');
}else if(args.length!==1||args[0]!=='--run-authentication-component'){
 console.error('Refused: explicit --run-authentication-component and reviewed fresh owned target required; no connection attempted.');process.exitCode=2;
}else{
 try{
  const settings=authenticationComponentSettings(process.env);
  console.log(`Standalone authentication component only: ${safeTarget(settings)}. No ERP/business/catalog acceptance.`);
  const child=spawn(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap','tests/integration/authentication-component.integration.ts'],{
   cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',shell:false,
   env:{...process.env,NAIJUE_PG_RUNNER_MARKER:randomBytes(32).toString('hex')}
  });
  child.once('error',()=>{console.error('Authentication component process failed to start; no acceptance claimed.');process.exitCode=1;});
  child.once('exit',(code,signal)=>{process.exitCode=signal?1:(code??1);});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
 }catch{
  console.error('Authentication component opt-in/target gate refused before child creation; no connection attempted.');process.exitCode=2;
 }
}
