import {realpath} from 'node:fs/promises';
import {relative,sep} from 'node:path';
import {readBoundedCliFile} from './explicit-zero-cli-input.mjs';
import {readCurrentEffectiveAlignmentEvidence,currentEffectiveAlignmentMatchesManifest} from '../../packages/application/src/unified-current-effective-alignment.ts';

/** The reviewed file and trusted hash are independent operator inputs. Neither is
 * inferred from the package, an export timestamp, or an absent-key zero approval. */
export async function readCurrentEffectiveAlignmentCliEvidence(pkg,manifest,path,trustedSha256) {
 const relation=relative(await realpath(pkg),await realpath(path));
 if(!relation||relation!=='..'&&!relation.startsWith('..'+sep)&&!relation.startsWith(sep))throw Error('CURRENT_EFFECTIVE_ALIGNMENT_OUTSIDE_PACKAGE_REQUIRED');
 const evidence=readCurrentEffectiveAlignmentEvidence({bytes:await readBoundedCliFile(path,65536),trustedSha256});
 if(!currentEffectiveAlignmentMatchesManifest(evidence,manifest))throw Error('CURRENT_EFFECTIVE_ALIGNMENT_BINDING_INVALID');
 return evidence;
}
