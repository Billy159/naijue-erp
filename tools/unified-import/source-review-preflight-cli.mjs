/** Independent approval-only preflight. Never routes to a host or database. */
import {realpath} from 'node:fs/promises';import {join,relative,sep} from 'node:path';import {pathToFileURL} from 'node:url';
import {readBoundedCliFile} from './explicit-zero-cli-input.mjs';
import {decodeUtf8,parseStrictJson,sha256} from '../../packages/application/src/unified-import-contract.ts';
import {readSourceReviewApproval,sourceReviewOfflineSummary} from '../../packages/application/src/unified-historical-sales-source-review.ts';
export async function runSourceReviewPreflight(args){
 const o={};let offline=false;for(let i=0;i<args.length;){const key=args[i++];if(key==='--offline'){if(offline)throw Error('SOURCE_REVIEW_ARGUMENTS');offline=true;continue;}if(!['--package','--manifest-sha256','--approval','--approval-sha256'].includes(key)||Object.hasOwn(o,key)||!args[i])throw Error('SOURCE_REVIEW_ARGUMENTS');o[key]=args[i++];}
 if(!offline||!['--package','--manifest-sha256','--approval','--approval-sha256'].every(k=>o[k]))throw Error('SOURCE_REVIEW_ARGUMENTS');
 const pkg=await realpath(o['--package']),approval=await realpath(o['--approval']),rel=relative(pkg,approval);if(!rel||rel!=='..'&&!rel.startsWith('..'+sep)&&!rel.startsWith(sep))throw Error('SOURCE_REVIEW_APPROVAL_OUTSIDE_PACKAGE_REQUIRED');
 const bytes=await readBoundedCliFile(join(pkg,'manifest.json'),2*1024*1024);if(sha256(bytes)!==o['--manifest-sha256'])throw Error('SOURCE_REVIEW_MANIFEST_HASH');
 const m=parseStrictJson(decodeUtf8(bytes));if(!m||typeof m!=='object'||typeof m.source_namespace!=='string'||!Array.isArray(m.source_files)||!m.source_files.every(f=>f&&typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256)))throw Error('SOURCE_REVIEW_MANIFEST_SHAPE');
 const a=readSourceReviewApproval({bytes:await readBoundedCliFile(approval,64*1024*1024),trustedSha256:o['--approval-sha256'],sourceNamespace:m.source_namespace,packageManifestSha256:o['--manifest-sha256'],sourceHashes:new Set(m.source_files.map(f=>f.sha256))});
 process.stdout.write(JSON.stringify(sourceReviewOfflineSummary(a))+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runSourceReviewPreflight(process.argv.slice(2)).catch(error=>{process.stderr.write((error instanceof Error&&/^SOURCE_REVIEW_[A-Z_]+$/.test(error.message)?error.message:'SOURCE_REVIEW_PREFLIGHT_FAILED')+'\n');process.exitCode=1});
