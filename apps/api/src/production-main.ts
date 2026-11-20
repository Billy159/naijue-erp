import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createProductionCapacityLaunch} from './production-capacity-launch.ts';
import {startProductionApplicationHost} from './production-application-host.ts';
import {createProductionRuntime35ApplicationApi, parseProductionRuntime35Configuration, productionRuntime35HostConfiguration} from './production-provider-composition.ts';
import {launch, type ProductionMainDependencies} from './production-launch.ts';
export {readProductionStaffCredentialRequestTag} from './production-launch.ts';
export type {ProductionMainDependencies} from './production-launch.ts';

const actualDependencies: ProductionMainDependencies = {
  createCapacity: createProductionCapacityLaunch,
  createApi: (_mode,config,capacity,tag,target,service,generation) =>
    createProductionRuntime35ApplicationApi(config,undefined,tag,capacity,target,service,generation),
  startHost: (_mode,api,config) =>
    startProductionApplicationHost({api,configuration:productionRuntime35HostConfiguration(config)}),
  writeStarted: line => { process.stdout.write(line); },
};

export async function runProductionCli(args:readonly string[],dependencies:ProductionMainDependencies=actualDependencies):Promise<void> {
  if (args[0] !== '--exact35') throw new TypeError('Explicit production --exact35 selector required');
  return launch('r35',args.slice(1),undefined,dependencies,input => {
    const config = parseProductionRuntime35Configuration(input);
    if (config.profile !== 'source-confirmed-native-exact35-production-v2')
      throw new TypeError('Production Exact35 V2 configuration required');
    return config;
  },'PRODUCTION_EXACT35_HOST_STARTED');
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)
  void runProductionCli(process.argv.slice(2)).catch(()=>{process.stderr.write('Production startup refused or failed; inspect private operational diagnostics\n');process.exitCode=1;});
