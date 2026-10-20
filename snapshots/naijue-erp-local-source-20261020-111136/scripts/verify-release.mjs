import {spawnSync} from 'node:child_process';
import {readFileSync, mkdtempSync, mkdirSync} from 'node:fs';
import {resolve, sep} from 'node:path';
import {root, safeFile, sha256, fileRecords, writeJson} from './files.mjs';
import {assertReleasePath} from './release-policy.mjs';
import {releaseDirectory} from './task-artifacts.mjs';

const override = process.argv.slice(2);
const directory = override.length ? resolve(override[1] ?? '') : releaseDirectory;
if (override.length && (override.length !== 2 || override[0] !== '--release-directory' || !directory.startsWith(resolve(root, 'work/T14') + sep))) throw new Error('Release verification override must be a T14 isolated fixture');
writeJson(resolve(directory, 'verification.json'), {status: 'RUNNING', productionReady: false});
try {
await import('./check-toolchain.mjs');
const latest = JSON.parse(readFileSync(resolve(directory, 'latest.json'), 'utf8'));
if (sha256(readFileSync(latest.archive)) !== latest.archiveSha256) throw new Error('Archive hash mismatch');
const listing = spawnSync('tar', ['-tzf', latest.archive], {encoding: 'utf8'});
if (listing.error || listing.status !== 0) throw new Error('Archive cannot be listed');
const archiveDirectories = [];
for (const entry of listing.stdout.trim().split('\n')) {
  const clean = entry.replace(/^\.\//, '').replace(/\/$/, '');
  if (!clean || clean === '.') continue;
  if (entry.startsWith('/') || clean.split('/').includes('..') || entry.includes('\\')) throw new Error(`Unsafe archive entry: ${entry}`);
  if (entry.endsWith('/')) {
    archiveDirectories.push({entry, clean});
  } else assertReleasePath(clean);
}
const detailedListing = spawnSync('tar', ['-tvzf', latest.archive], {encoding: 'utf8'});
if (detailedListing.status !== 0 || detailedListing.stdout.split('\n').filter(Boolean).some(line => !['-', 'd'].includes(line[0]))) throw new Error('Archive links or special entries are forbidden');
mkdirSync(resolve(root, 'work/release-verification'), {recursive: true});
const extracted = mkdtempSync(resolve(root, 'work/release-verification/readback-'));
const result = spawnSync('tar', ['-xzf', latest.archive, '-C', extracted], {stdio: 'inherit'});
if (result.error || result.status !== 0) throw new Error('Archive extraction failed');
const manifest = JSON.parse(readFileSync(safeFile(extracted, 'release-manifest.json'), 'utf8'));
if (sha256(readFileSync(resolve(extracted, 'release-manifest.json'))) !== latest.manifestHash) throw new Error('Release manifest hash mismatch');
const actual = fileRecords(extracted).filter(f => f.path !== 'release-manifest.json');
if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new Error('Archive contents differ from the release manifest');
for (const file of actual) assertReleasePath(file.path);
const built = JSON.parse(readFileSync(safeFile(extracted, 'build-manifest.json'), 'utf8'));
const front = JSON.parse(readFileSync(safeFile(extracted, 'frontend-manifest.json'), 'utf8'));
const required = ['package.json', 'package-lock.json', 'build-manifest.json', 'frontend-manifest.json', 'server/main.js',
  ...built.backendOutput.map(f => 'server/' + f.path), ...front.files.map(f => 'web/' + f.path)];
if (required.some(path => !actual.some(f => f.path === path))) throw new Error('Archive required build entry missing');
if (sha256(readFileSync(safeFile(extracted, 'build-manifest.json'))) !== manifest.sourceBuildManifestSha256) throw new Error('Archive build manifest hash mismatch');
for (const [prefix, records] of [['server/', built.backendOutput], ['web/', front.files]]) {
  for (const file of records) {
    const record = actual.find(f => f.path === prefix + file.path);
    if (!record || record.sha256 !== file.sha256 || record.bytes !== file.bytes) throw new Error('Archive build resource closure mismatch');
  }
}
// Only ancestors of the verified build closure may appear, including empty archive directories.
const allowedDirectories = new Set();
for (const path of required) {
  const parts = path.split('/');
  for (let count = 1; count < parts.length; count++) allowedDirectories.add(parts.slice(0, count).join('/'));
}
for (const {entry, clean} of archiveDirectories) {
  if (!allowedDirectories.has(clean)) throw new Error(`Unexpected archive directory: ${entry}`);
}
const report = {status: 'PASS', archive: latest.archive, archiveSha256: latest.archiveSha256, filesVerified: actual.length + 1, excludedFilesFound: 0, productMediaInPublicPackage: 0, readbackDirectory: extracted, productionReady: false};
writeJson(resolve(directory, 'verification.json'), report);
console.log(`Archive readback: PASS; ${report.filesVerified} files, forbidden files 0`);
} catch (error) {
  writeJson(resolve(directory, 'verification.json'), {status: 'FAIL', reason: error.message, productionReady: false});
  console.error('Archive readback: FAIL; ' + error.message);
  process.exitCode = 1;
}
