/** One immutable production source anchor; import does not connect or spawn. */
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {need} from './fixture.mjs';
export const ROOT=fileURLToPath(new URL('../../../../',import.meta.url));
export const WORK=path.resolve(ROOT,'..');
export const ORIGINAL=Object.freeze({root:path.join(WORK,'development-results-20261031/cumulative-C08-r2-work/candidate'),commit:'a3e9fb9969d116a60856da0d2ac4d4d1ca0e8e23',tree:'b6815a5cd15e8bd63dd3368413423983eb2f96db'});
export async function loadOriginals(){
 const modules=await Promise.all(['adapters/postgres/src/product-management-query-reader.ts','packages/application/src/product-management-query-service.ts','apps/api/src/postgres-read-api.ts'].map(p=>import(pathToFileURL(path.join(ORIGINAL.root,p)).href)));
 const [reader,service,authorization]=modules;need(typeof reader.PostgresProductManagementQueryReader==='function'&&typeof service.createProductManagementQueryService==='function'&&typeof authorization.createSourceConfirmedApplicationReadAuthorization==='function','EXACT_ORIGINAL_PUBLIC_READER_FACTORIES_REQUIRED');return Object.freeze({Reader:reader.PostgresProductManagementQueryReader,createService:service.createProductManagementQueryService,createAuthorization:authorization.createSourceConfirmedApplicationReadAuthorization});
}
