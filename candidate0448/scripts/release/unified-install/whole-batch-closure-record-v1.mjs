/** Read-only OS-trusted successor record. No creation, capture or self-approval.
 * Validating a JSON object alone does not make it a trusted installation record. */
import { open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { parseStrictJson } from '../../../packages/application/src/unified-import-contract.ts';
import { validateInstallationRecord, validateInstallationFileMetadata } from './whole-installation-record.mjs';
const etc = process.platform === 'darwin' ? '/private/etc' : '/etc';
export const WHOLE_BATCH_CLOSURE_RECORD_V1_PATH = etc + '/naijue-erp/whole-batch-closure-installation-v1.json';
const need = condition => { if (!condition) throw Error('WHOLE_BATCH_INSTALLATION_RECORD_UNTRUSTED'); };
export function validateWholeBatchClosureRecordV1(value, spec) {
  need(value && Object.keys(value).sort().join(',') === 'binding,closureBodySha256,format,installedAt,predecessorSourceSpecSha256');
  need(value.format === 'WHOLE_BATCH_CLOSURE_INSTALLATION_RECORD_V1');
  for (const key of ['source_spec_sha256', 'predecessor_source_spec_sha256', 'closure_body_sha256']) need(typeof spec?.[key] === 'string' && /^[a-f0-9]{64}$/.test(spec[key]));
  need(value.predecessorSourceSpecSha256 === spec.predecessor_source_spec_sha256 && value.closureBodySha256 === spec.closure_body_sha256);
  return validateInstallationRecord({ format: 'WHOLE_INSTALLATION_RECORD_V1', installedAt: value.installedAt, binding: value.binding }, spec.source_spec_sha256);
}
export async function loadWholeBatchClosureRecordV1(spec) {
  const uid = process.getuid?.(); need(Number.isInteger(uid) && uid !== 0);
  for (const directory of [etc, etc + '/naijue-erp']) {
    const stat = await lstat(directory);
    need(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === 0 && (stat.mode & 0o022) === 0);
  }
  const file = await open(WHOLE_BATCH_CLOSURE_RECORD_V1_PATH, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    validateInstallationFileMetadata(await file.stat(), uid);
    const bytes = await file.readFile(); need(bytes.length <= 65536);
    return validateWholeBatchClosureRecordV1(parseStrictJson(bytes.toString('utf8')), spec);
  } finally { await file.close(); }
}
