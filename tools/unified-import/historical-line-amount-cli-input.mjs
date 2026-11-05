import {realpath} from 'node:fs/promises';
import {relative,sep} from 'node:path';
import {readBoundedCliFile} from './explicit-zero-cli-input.mjs';
import {readHistoricalLineAmountEvidence} from '../../packages/application/src/unified-historical-line-amount-evidence.ts';
/** Separately pinned original-source review. The operator supplies a trusted pin independently;
 * target authorization and transaction admission remain mandatory. */
export async function readHistoricalLineAmountCliEvidence(pkg,manifest,path,trustedSha256) {
 const relation=relative(await realpath(pkg),await realpath(path));
 if(!relation||relation!=='..'&&!relation.startsWith('..'+sep)&&!relation.startsWith(sep))throw Error('HISTORICAL_LINE_AMOUNT_EVIDENCE_OUTSIDE_PACKAGE_REQUIRED');
 return readHistoricalLineAmountEvidence({bytes:await readBoundedCliFile(path,4*1024*1024),trustedSha256,sourceNamespace:manifest.source_namespace,sourceHashes:new Set(manifest.source_files.map(f=>f.sha256))});
}
