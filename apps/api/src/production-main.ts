import type {CapacityRuntimeTarget} from './capacity-runtime-probe.ts';
import type {Fresh35CurrentProductionServiceInput} from '../../../tools/unified-import/fresh35-host-session.mjs';
import type { CapacityAdmission } from "./capacity-admission.ts";
import { createProductionCapacityLaunch, parseProductionCapacityLaunch } from "./production-capacity-launch.ts";
import { readProductionCredentialRequestKey } from "./production-credential-key.ts";
import { createNodeCredentialRequestTag } from "../../../packages/authentication/src/passwords.ts";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createProductionRuntime26FullApplicationApi, createProductionApplicationApi, parseProductionRuntimeConfiguration,
  createProductionRuntime26ApplicationApi, parseProductionRuntime26Configuration, createProductionRuntime27ApplicationApi, parseProductionRuntime27Configuration, productionRuntime27HostConfiguration, createProductionRuntime26R3ApplicationApi,
  parseProductionRuntime26R3Configuration, createProductionRuntime26R2ApplicationApi, parseProductionRuntime26R2Configuration,
  createProductionRuntime35ApplicationApi, parseProductionRuntime35Configuration, productionRuntime35HostConfiguration } from "./production-provider-composition.ts";
import type {ProductionRuntimeConfiguration, ProductionRuntime26Configuration, ProductionRuntime26R2Configuration, ProductionRuntime26R3Configuration, ProductionRuntime27Configuration} from "./production-provider-composition.ts";
import type { ProductionRuntime35Configuration } from './production-provider-composition.ts';
import { startProductionApplicationHost, startProductionRuntime26ApplicationHost, startProductionRuntime26R3ApplicationHost,
  startProductionRuntime26R2ApplicationHost } from "./production-application-host.ts";
import type {ProductionApplicationHost} from "./production-application-host.ts";
import type {PostgresApplicationApi} from "./postgres-read-api.ts";

type Mode = 'legacy' | 'r1' | 'r2' | 'r3' | 'full' | 'r27' | 'r35';
type Configuration = ProductionRuntimeConfiguration | ProductionRuntime26Configuration | ProductionRuntime26R2Configuration | ProductionRuntime26R3Configuration | ProductionRuntime27Configuration | ProductionRuntime35Configuration;
/** Explicit in-process test/owner launch ports only. The executable CLI never
 * obtains functions, environment options or an override provider from JSON. */
export interface ProductionMainDependencies {
  readonly createCapacity: typeof createProductionCapacityLaunch;
  readonly createApi: (mode: Mode, config: Configuration, capacity: CapacityAdmission, tag: ((password:string)=>string)|null,
    capacityTarget?:CapacityRuntimeTarget, currentService?:Fresh35CurrentProductionServiceInput) => Promise<PostgresApplicationApi>;
  readonly startHost: (mode: Mode, api: PostgresApplicationApi, config: Configuration) => Promise<ProductionApplicationHost>;
  readonly writeStarted: (line:string) => void;
}
const actualDependencies: ProductionMainDependencies = {
  createCapacity: createProductionCapacityLaunch,
  async createApi(mode,c,capacity,tag,capacityTarget,currentService) {
    if(mode==='legacy')return createProductionApplicationApi(c,undefined,capacity);
    if(mode==='r27')return createProductionRuntime27ApplicationApi(c,undefined,capacity);
    if(mode==='r35')return createProductionRuntime35ApplicationApi(c,undefined,tag,capacity,capacityTarget,currentService);
    if(mode==='r1')return createProductionRuntime26ApplicationApi(c,undefined,null,capacity);
    if(mode==='r2')return createProductionRuntime26R2ApplicationApi(c,undefined,null,undefined,capacity);
    if(mode==='full')return createProductionRuntime26FullApplicationApi(c,undefined,tag,capacity);
    return createProductionRuntime26R3ApplicationApi(c,undefined,tag,undefined,capacity);
  },
  async startHost(mode,api,c) {
    if(mode==='legacy')return startProductionApplicationHost({api,configuration:c as ProductionRuntimeConfiguration});
    if(mode==='r27')return startProductionApplicationHost({api,configuration:productionRuntime27HostConfiguration(c)});
    if(mode==='r35')return startProductionApplicationHost({api,configuration:productionRuntime35HostConfiguration(c)});
    if(mode==='r1')return startProductionRuntime26ApplicationHost({api,configuration:c as ProductionRuntime26Configuration});
    if(mode==='r2')return startProductionRuntime26R2ApplicationHost({api,configuration:c as ProductionRuntime26R2Configuration});
    return startProductionRuntime26R3ApplicationHost({api,configuration:c as ProductionRuntime26R3Configuration});
  },
  writeStarted:line=>{process.stdout.write(line);},
};
/** Only selected R3/Full reads the original authorized stable32 private key. */
export async function readProductionStaffCredentialRequestTag(config: Pick<ProductionRuntime26R3Configuration, 'staffMaintenance' | 'staffCredentialRequestKeyFile'>): Promise<((password: string) => string) | null> {
  if (config.staffMaintenance !== true) return null;
  if (config.staffCredentialRequestKeyFile === undefined) throw new TypeError("Selected staff credentials require a stable private request key");
  const key=await readProductionCredentialRequestKey(config.staffCredentialRequestKeyFile);
  try { return createNodeCredentialRequestTag(key); } finally { key.fill(0); }
}
async function launch(mode:Mode,args:readonly string[],injected?:CapacityAdmission,dependencies:ProductionMainDependencies=actualDependencies):Promise<void> {
  if(args.length!==1 || !args[0] || !path.isAbsolute(args[0]) || path.resolve(args[0])!==args[0])
    throw new TypeError('One absolute private runtime configuration path is required');
  const filename=args[0],stat=await lstat(filename);
  if(!stat.isFile() || stat.isSymbolicLink() || await realpath(filename)!==filename || stat.size>65536 || (stat.mode&0o077)!==0)
    throw new TypeError('A bounded canonical private configuration file is required');
  const bytes=await readFile(filename),after=await lstat(filename);
  if(bytes.length!==stat.size||bytes.length>65536||stat.ino!==after.ino||stat.dev!==after.dev||stat.size!==after.size
    ||stat.mtimeMs!==after.mtimeMs||stat.ctimeMs!==after.ctimeMs)throw new TypeError('Private configuration changed while reading');
  const raw=JSON.parse(bytes.toString('utf8')) as Record<string,unknown>;
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new TypeError('Private runtime object required');
  const {capacityLaunch,...runtime}=raw;
  if(injected!==undefined && Object.hasOwn(raw,'capacityLaunch'))throw new TypeError('Only one explicit capacity source is allowed');
  const c:Configuration=mode==='legacy'?parseProductionRuntimeConfiguration(runtime):mode==='r35'?parseProductionRuntime35Configuration(runtime):mode==='r27'?parseProductionRuntime27Configuration(runtime):mode==='r1'?parseProductionRuntime26Configuration(runtime)
    :mode==='r2'?parseProductionRuntime26R2Configuration(runtime):parseProductionRuntime26R3Configuration(runtime);
  const production35=mode==='r35'&&c.profile==='source-confirmed-native-exact35-production-v2';
  const currentServiceSha=process.env.NAIJUE_CURRENT_PRODUCTION_SERVICE_SHA256;
  if(currentServiceSha!==undefined&&(!production35||injected!==undefined||!/^[a-f0-9]{64}$/.test(currentServiceSha)))
    throw new TypeError('Current service digest requires the approved production Exact35 launch');
  let capacity:CapacityAdmission|undefined=injected,api:PostgresApplicationApi|undefined,host:ProductionApplicationHost|undefined;
  let stopping=false;
  const stop=():void=>{
    if(stopping)return;stopping=true;process.off('SIGTERM',stop);process.off('SIGINT',stop);
    void (async()=>{try{capacity?.close();}finally{if(host)await host.close();else await api?.close();}})()
      .catch(()=>{process.stderr.write('Production shutdown failed\n');process.exitCode=1;});
  };
  try {
    // Actual config-only CLI creates its own original singleton BEFORE the API.
    // Programmatic supplied singletons retain their explicit existing contract.
    if(!capacity)capacity=await dependencies.createCapacity(capacityLaunch,c);
    if(!capacity || typeof capacity.acquire!=='function' || typeof capacity.close!=='function')throw new TypeError('Explicit capacity resource required');
    process.once('SIGTERM',stop);process.once('SIGINT',stop);
    const tag=mode==='r3'||mode==='full'||mode==='r35'?await readProductionStaffCredentialRequestTag(c as ProductionRuntime26R3Configuration | ProductionRuntime35Configuration):null;
    const parsedCapacity=production35?parseProductionCapacityLaunch(capacityLaunch):undefined;
    const currentService=currentServiceSha!==undefined&&parsedCapacity
      ? {sha256:currentServiceSha,capacityExpiresAt:parsedCapacity.window.expiresAt} : undefined;
    api=await dependencies.createApi(mode,c,capacity,tag,parsedCapacity?.target,currentService);
    if(stopping)throw new Error('Production startup was cancelled');
    if(!injected){
      const prepared=capacity as Awaited<ReturnType<typeof createProductionCapacityLaunch>>;
      if(typeof prepared.preflight!=='function')throw new TypeError('Actual CLI requires same-owned-pool capacity preflight');
      await prepared.preflight(); // No write admission, no charge, before listen/ready.
    }
    if(stopping)throw new Error('Production startup was cancelled');
    host=await dependencies.startHost(mode,api,c);
    if(stopping)throw new Error('Production startup was cancelled');
    dependencies.writeStarted(JSON.stringify({event:mode==='legacy'?'PRODUCTION_HOST_STARTED':mode==='r35'?'PRODUCTION_EXACT35_HOST_STARTED':mode==='r27'?'PRODUCTION_EXACT27_HOST_STARTED':`PRODUCTION_EXACT26_${mode.toUpperCase()}_HOST_STARTED`,publicOrigin:host.publicOrigin,...c.build})+'\n');
  }catch{
    process.off('SIGTERM',stop);process.off('SIGINT',stop);
    const failures:unknown[]=[];
    try{capacity?.close();}catch{failures.push(true);}
    try{if(host)await host.close();else await api?.close();}catch{failures.push(true);}
    if(failures.length)throw new Error('Production startup failed; resource cleanup is unconfirmed');
    throw new Error('Production startup refused or failed; private dependencies must be checked by owner');
  }
}
export async function runProductionMain(args:readonly string[],capacity?:CapacityAdmission,dependencies?:ProductionMainDependencies):Promise<void>{return launch('legacy',args,capacity,dependencies);}
export async function runProductionRuntime27Main(args:readonly string[],capacity?:CapacityAdmission,dependencies?:ProductionMainDependencies):Promise<void>{return launch('r27',args,capacity,dependencies);}
export async function runProductionRuntime35Main(args:readonly string[],capacity?:CapacityAdmission,dependencies?:ProductionMainDependencies):Promise<void>{return launch('r35',args,capacity,dependencies);}
export async function runProductionRuntime26Main(args:readonly string[],capacity?:CapacityAdmission,dependencies?:ProductionMainDependencies):Promise<void>{return launch('r1',args,capacity,dependencies);}
export async function runProductionRuntime26R2Main(args:readonly string[],capacity?:CapacityAdmission,dependencies?:ProductionMainDependencies):Promise<void>{return launch('r2',args,capacity,dependencies);}
export async function runProductionRuntime26R3Main(args:readonly string[],capacity?:CapacityAdmission,dependencies?:ProductionMainDependencies):Promise<void>{return launch('r3',args,capacity,dependencies);}
export async function runProductionRuntime26FullMain(args:readonly string[],capacity?:CapacityAdmission,dependencies?:ProductionMainDependencies):Promise<void>{return launch('full',args,capacity,dependencies);}
/** The executable and tests use the SAME exact dispatch. Unknown flags reject. */
export async function runProductionCli(args:readonly string[],dependencies?:ProductionMainDependencies):Promise<void>{
  const selectors={'--exact35':'r35','--exact27':'r27','--exact26-r1':'r1','--exact26-r2':'r2','--exact26-r3':'r3','--exact26-full':'full'} as const;
  if(args[0]?.startsWith('--')){const mode=selectors[args[0] as keyof typeof selectors];if(!mode)throw new TypeError('Explicit production selector required');return launch(mode,args.slice(1),undefined,dependencies);}
  return launch('legacy',args,undefined,dependencies);
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)
  void runProductionCli(process.argv.slice(2)).catch(()=>{process.stderr.write('Production startup refused or failed; inspect private operational diagnostics\n');process.exitCode=1;});
