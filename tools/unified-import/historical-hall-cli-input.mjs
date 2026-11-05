import {realpath} from 'node:fs/promises';
import {relative,sep} from 'node:path';
import {readBoundedCliFile} from './explicit-zero-cli-input.mjs';
import {readHistoricalSalesHallApproval} from '../../packages/application/src/unified-historical-sales-hall-evidence.ts';
/** Reviewed observations and their trusted pin must be supplied outside the package.
 * This read does not authorize execution or manufacture a warehouse observation. */
export async function readHistoricalHallCliApproval(pkg,manifest,path,trustedSha256) {
 const relation=relative(await realpath(pkg),await realpath(path));
 if(!relation||relation!=='..'&&!relation.startsWith('..'+sep)&&!relation.startsWith(sep))throw Error('HISTORICAL_HALL_APPROVAL_OUTSIDE_PACKAGE_REQUIRED');
 return readHistoricalSalesHallApproval({bytes:await readBoundedCliFile(path,64*1024*1024),trustedSha256,sourceNamespace:manifest.source_namespace,sourceHashes:new Set(manifest.source_files.map(f=>f.sha256))});
}
