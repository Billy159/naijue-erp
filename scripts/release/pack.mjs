#!/usr/bin/env node
import { mkdir, writeFile, readFile, lstat, rm, chmod } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateRelease, canonicalAbsolute, boundedFile, requireRelease, walkFiles, sha256, matches, ReleaseError } from './manifest.mjs';

function tar(args) {
  const result = spawnSync('/usr/bin/tar', args, { encoding: 'utf8', maxBuffer: 1024 * 1024,
    timeout: 120000, env: { PATH: '/usr/bin:/bin', LANG: 'C', COPYFILE_DISABLE: '1' } });
  requireRelease(!result.error && result.status === 0, 'TAR_OPERATION_FAILED');
}
function within(parent, child) { return child === parent || child.startsWith(parent + path.sep); }

export async function packRelease(options) {
  const { sourceManifest, buildManifest, buildRoot, out } = options;
  requireRelease(typeof out === 'string' && path.isAbsolute(out) && path.normalize(out) === out, 'EXPLICIT_FRESH_OUTPUT_REQUIRED');
  await canonicalAbsolute(path.dirname(out), 'directory');
  let exists = false;
  try { await lstat(out); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  requireRelease(!exists, 'OUTPUT_EXISTS_NO_OVERWRITE');
  requireRelease(!within(buildRoot, out) && !within(out, buildRoot), 'OUTPUT_BUILD_OVERLAP_FORBIDDEN');
  const validated = await validateRelease({ sourceManifest, buildManifest, buildRoot });
  await mkdir(out, { recursive: false, mode: 0o700 });
  const stage = path.join(out, '.packing'), verify = path.join(out, '.readback');
  await mkdir(stage, { mode: 0o700 }); await mkdir(verify, { mode: 0o700 });
  const memberRecords = [];
  for (const [name, record] of validated.files) {
    if (record.role === 'evidence') continue;
    // Read again before copy; a changed shared build is rejected rather than packaging a mixed version.
    const bytes = await boundedFile(buildRoot, name); matches(bytes, record);
    const target = path.join(stage, record.member);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
    await writeFile(target, bytes, { flag: 'wx', mode: 0o444 });
    memberRecords.push({ path: record.member, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const manifestBytes = Buffer.from(JSON.stringify(validated.manifest, null, 2) + '\n');
  const rechecked = await validateRelease({ sourceManifest, buildManifest, buildRoot });
  requireRelease(JSON.stringify(rechecked.manifest) === JSON.stringify(validated.manifest), 'SOURCE_OR_BUILD_CHANGED_DURING_PACK');
  await writeFile(path.join(stage, 'release-manifest.json'), manifestBytes, { flag: 'wx', mode: 0o444 });
  memberRecords.push({ path: 'release-manifest.json', bytes: manifestBytes.length, sha256: sha256(manifestBytes) });
  memberRecords.sort((a, b) => a.path.localeCompare(b.path));
  const archive = path.join(out, 'release.tar.gz');
  tar(['-czf', archive, '-C', stage, '.']);
  await chmod(archive, 0o600);
  // This is our freshly created archive, extracted exactly once into a fresh private directory.
  tar(['-xzf', archive, '-C', verify]);
  const actual = await walkFiles(verify);
  requireRelease(actual.length === memberRecords.length && memberRecords.every(row => actual.includes(row.path)), 'ARCHIVE_MEMBER_SET_MISMATCH');
  for (const record of memberRecords) matches(await readFile(path.join(verify, record.path)), record);
  await writeFile(path.join(out, 'release-manifest.json'), manifestBytes, { flag: 'wx', mode: 0o600 });
  await writeFile(path.join(out, 'members.sha256'), memberRecords.map(row => `${row.sha256}  ${row.path}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  const archiveBytes = await readFile(archive);
  const receipt = { format: 'naijue-release-pack-receipt-v1', status: 'PACKED_AND_EXTRACTED_READBACK_MATCH',
    buildId: validated.manifest.buildId, sourceCommit: validated.manifest.sourceCommit,
    archive: { file: 'release.tar.gz', bytes: archiveBytes.length, sha256: sha256(archiveBytes) },
    manifestSha256: sha256(manifestBytes), members: memberRecords.length, archiveExtractions: 1,
    businessOrProductionValidation: false, deploymentExecuted: false };
  await writeFile(path.join(out, 'pack-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await rm(stage, { recursive: true }); await rm(verify, { recursive: true });
  return receipt;
}

export async function main(args) {
  const names = new Map([['--source-manifest', 'sourceManifest'], ['--build-manifest', 'buildManifest'], ['--build-root', 'buildRoot'], ['--out', 'out']]);
  const options = {};
  requireRelease(args.length === 8, 'USAGE');
  for (let index = 0; index < args.length; index += 2) {
    const name = names.get(args[index]);
    requireRelease(name && !Object.hasOwn(options, name) && typeof args[index + 1] === 'string', 'USAGE');
    options[name] = args[index + 1];
  }
  return packRelease(options);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const receipt = await main(process.argv.slice(2)); process.stdout.write(JSON.stringify(receipt) + '\n'); }
  catch (error) {
    process.stderr.write(`${error instanceof ReleaseError ? error.code : 'RELEASE_PACK_FAILED'}\n`);
    if (error?.code === 'USAGE') process.stderr.write('Usage: node scripts/release/pack.mjs --source-manifest ABS_JSON --build-manifest ABS_JSON --build-root ABS_DIRECTORY --out ABS_FRESH_DIRECTORY\n');
    process.exitCode = 1;
  }
}
