import {realpath} from 'node:fs/promises';
import {relative,sep} from 'node:path';
import {readBoundedCliFile} from './explicit-zero-cli-input.mjs';
import {readHistoricalSettlementRetentionApproval} from '../../packages/application/src/unified-historical-settlement-retention.ts';
/** Separately pinned original-source review. The operator supplies a trusted pin independently;
 * target authorization and transaction admission remain mandatory. */
export async function readHistoricalSettlementRetentionCliApproval(pkg,manifest,path,trustedSha256) {
 const relation=relative(await realpath(pkg),await realpath(path));
 if(!relation||relation!=='..'&&!relation.startsWith('..'+sep)&&!relation.startsWith(sep))throw Error('HISTORICAL_SETTLEMENT_APPROVAL_OUTSIDE_PACKAGE_REQUIRED');
 return readHistoricalSettlementRetentionApproval({bytes:await readBoundedCliFile(path,4*1024*1024),trustedSha256,sourceNamespace:manifest.source_namespace,sourceHashes:new Set(manifest.source_files.map(f=>f.sha256))});
}
