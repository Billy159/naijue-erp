/** Pure opt-in selection. No environment reads, filesystem IO or connections. */
import path from 'node:path';
import {integrationSettings} from './safety.ts';
import type {IntegrationSettings} from './safety.ts';
export const AUTHENTICATION_COMPONENT_SUITE='authentication-component-0001-0010';
export interface AuthenticationComponentSettings extends IntegrationSettings {
 readonly dataDirectory:string;
}
export function authenticationComponentSettings(env:Readonly<Record<string,string|undefined>>,requireRunner=false):AuthenticationComponentSettings{
 if(env.NAIJUE_PG_TEST_SUITE!==AUTHENTICATION_COMPONENT_SUITE)
  throw Error('Authentication component requires its exact standalone suite; no business/runtime catalog acceptance');
 if(requireRunner&&!/^[a-f0-9]{64}$/.test(env.NAIJUE_PG_RUNNER_MARKER??''))
  throw Error('Use the standalone authentication component runner; direct engine execution is refused');
 const settings=integrationSettings(env,requireRunner),directory=env.NAIJUE_PG_COMPONENT_DATA_DIRECTORY;
 if(typeof directory!=='string'||directory.length>4096||directory.includes('\0')||!path.isAbsolute(directory)||path.resolve(directory)!==directory)
  throw Error('Explicit canonical owned disposable cluster directory is required for actual local capacity observations');
 return Object.freeze({...settings,dataDirectory:directory});
}
