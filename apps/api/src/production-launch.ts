import {createProductionGeneration} from './production-generation.ts';
import type {ProductionGeneration} from './production-generation.ts';
import type {CapacityRuntimeTarget} from './capacity-runtime-probe.ts';
import type {Fresh35CurrentProductionServiceInput} from '../../../tools/unified-import/fresh35-host-session.mjs';
import type { CapacityAdmission } from "./capacity-admission.ts";
import { createProductionCapacityLaunch, parseProductionCapacityLaunch } from "./production-capacity-launch.ts";
import { readProductionCredentialRequestKey } from "./production-credential-key.ts";
import { createNodeCredentialRequestTag } from "../../../packages/authentication/src/passwords.ts";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type {ProductionRuntimeConfiguration, ProductionRuntime26Configuration, ProductionRuntime26R2Configuration, ProductionRuntime26R3Configuration, ProductionRuntime27Configuration} from "./production-provider-composition.ts";
import type { ProductionRuntime35Configuration } from './production-provider-composition.ts';
import type {ProductionApplicationHost} from "./production-application-host.ts";
import type {PostgresApplicationApi} from "./postgres-read-api.ts";

export type Mode = 'legacy' | 'r1' | 'r2' | 'r3' | 'full' | 'r27' | 'r35';
export type Configuration = ProductionRuntimeConfiguration | ProductionRuntime26Configuration | ProductionRuntime26R2Configuration | ProductionRuntime26R3Configuration | ProductionRuntime27Configuration | ProductionRuntime35Configuration;
/** Explicit in-process test/owner launch ports only. The executable CLI never
 * obtains functions, environment options or an override provider from JSON. */
export interface ProductionMainDependencies {
  readonly createCapacity: typeof createProductionCapacityLaunch;
  readonly createApi: (mode: Mode, config: Configuration, capacity: CapacityAdmission, tag: ((password:string)=>string)|null,
    capacityTarget?:CapacityRuntimeTarget, currentService?:Fresh35CurrentProductionServiceInput, generation?:ProductionGeneration) => Promise<PostgresApplicationApi>;
  readonly startHost: (mode: Mode, api: PostgresApplicationApi, config: Configuration) => Promise<ProductionApplicationHost>;
  readonly writeStarted: (line:string) => void;
}
/** Only selected R3/Full reads the original authorized stable32 private key. */
export async function readProductionStaffCredentialRequestTag(config: Pick<ProductionRuntime26R3Configuration, 'staffMaintenance' | 'staffCredentialRequestKeyFile'>): Promise<((password: string) => string) | null> {
  if (config.staffMaintenance !== true) return null;
  if (config.staffCredentialRequestKeyFile === undefined) throw new TypeError("Selected staff credentials require a stable private request key");
  const key=await readProductionCredentialRequestKey(config.staffCredentialRequestKeyFile);
  try { return createNodeCredentialRequestTag(key); } finally { key.fill(0); }
}
export async function launch(mode:Mode, args:readonly string[], injected:CapacityAdmission|undefined,
  dependencies:ProductionMainDependencies, parseRuntime:(input:unknown)=>Configuration, startedEvent:string):Promise<void> {
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
  const {capacityLaunch,productionGeneration,...runtime}=raw;
  if(injected!==undefined && Object.hasOwn(raw,'capacityLaunch'))throw new TypeError('Only one explicit capacity source is allowed');
  const c=parseRuntime(runtime);
  const production35=mode==='r35'&&c.profile==='source-confirmed-native-exact35-production-v2';
  const currentServiceSha=process.env.NAIJUE_CURRENT_PRODUCTION_SERVICE_SHA256;
  if(currentServiceSha!==undefined&&(!production35||injected!==undefined||!/^[a-f0-9]{64}$/.test(currentServiceSha)))
    throw new TypeError('Current service digest requires the approved production Exact35 launch');
  const admin154SuccessorSha=process.env.NAIJUE_ADMIN154_SUCCESSOR_SHA256;
  if(admin154SuccessorSha!==undefined&&(!production35||injected!==undefined||currentServiceSha===undefined||!/^[a-f0-9]{64}$/.test(admin154SuccessorSha)))
    throw new TypeError('Admin154 requires the exact successor digest and current production service');
  const compactSuccessorSha=process.env.NAIJUE_COMPACT_ZERO_SUCCESSOR_SHA256,compactParentSourceSha=process.env.NAIJUE_ADMIN154_PARENT_SOURCE_SHA256,compactParentCatalogSha=process.env.NAIJUE_ADMIN154_PARENT_CATALOG_SPEC_SHA256;
  const compactSelected=[compactSuccessorSha,compactParentSourceSha,compactParentCatalogSha].some(v=>v!==undefined);
  if(compactSelected&&(!production35||injected!==undefined||currentServiceSha===undefined||admin154SuccessorSha===undefined||![compactSuccessorSha,compactParentSourceSha,compactParentCatalogSha].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))))
    throw new TypeError('Compact zero requires all exact parent/successor digests and current production service');
  const formal = Object.hasOwn(raw,'productionGeneration');
  if(formal && (!production35 || injected !== undefined || !compactSelected || !currentServiceSha))
    throw new TypeError('Production generation requires explicit Exact35 and installed Compact Zero lineage');
  const parsedCapacity=production35?parseProductionCapacityLaunch(capacityLaunch):undefined;
  const generation=formal?createProductionGeneration(productionGeneration,currentServiceSha!,parsedCapacity!):undefined;
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
    if(!capacity)capacity=await dependencies.createCapacity(capacityLaunch,c,generation?.accounting);
    if(!capacity || typeof capacity.acquire!=='function' || typeof capacity.close!=='function')throw new TypeError('Explicit capacity resource required');
    process.once('SIGTERM',stop);process.once('SIGINT',stop);
    const tag=mode==='r3'||mode==='full'||mode==='r35'?await readProductionStaffCredentialRequestTag(c as ProductionRuntime26R3Configuration | ProductionRuntime35Configuration):null;
    const currentService=currentServiceSha!==undefined&&parsedCapacity
      ? {sha256:currentServiceSha,capacityExpiresAt:parsedCapacity.window.expiresAt,...(compactSelected?{compactZero:{profile:'FRESH35_COMPACT_ZERO_ORDINARY_V2' as const,parentPins:{sha256:admin154SuccessorSha!,sourceSetSha256:compactParentSourceSha!,catalogSpecSha256:compactParentCatalogSha!},successorSha256:compactSuccessorSha!}}:admin154SuccessorSha!==undefined?{admin154SuccessorSha256:admin154SuccessorSha}:{})} : undefined;
    api=await dependencies.createApi(mode,c,capacity,tag,parsedCapacity?.target,currentService,generation);
    if(stopping)throw new Error('Production startup was cancelled');
    if(!injected){
      const prepared=capacity as Awaited<ReturnType<typeof createProductionCapacityLaunch>>;
      if(typeof prepared.preflight!=='function')throw new TypeError('Actual CLI requires same-owned-pool capacity preflight');
      // No write admission or charge. The owner can still be CLOSED at startup.
      if(generation)await generation.privateRead(async()=>{
        await generation.assertOperational();
        await prepared.preflight();
        await generation.assertOperational();
      });
      else await prepared.preflight();
    }
    if(stopping)throw new Error('Production startup was cancelled');
    host=await dependencies.startHost(mode,api,c);
    if(stopping)throw new Error('Production startup was cancelled');
    dependencies.writeStarted(JSON.stringify({event:startedEvent,publicOrigin:host.publicOrigin,...c.build})+'\n');
  }catch{
    process.off('SIGTERM',stop);process.off('SIGINT',stop);
    const failures:unknown[]=[];
    try{capacity?.close();}catch{failures.push(true);}
    try{if(host)await host.close();else await api?.close();}catch{failures.push(true);}
    if(failures.length)throw new Error('Production startup failed; resource cleanup is unconfirmed');
    throw new Error('Production startup refused or failed; private dependencies must be checked by owner');
  }
}
