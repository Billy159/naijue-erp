import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = path.resolve(here, '../../..');
const sha = value => createHash('sha256').update(value).digest('hex');
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['artifacts', 'node_modules', '.git'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(file));
    else if (/\.(?:tsx?|css|mjs|json)$/.test(entry.name)) result.push(path.relative(repo, file));
  }
  return result;
}
const sourcePaths = [...await files(path.join(repo, 'apps/web/src')), ...await files(here), ...await files(path.join(repo, 'packages/domain/src')), ...await files(path.join(repo, 'packages/application/src'))].sort();
const snapshot = async () => Promise.all(sourcePaths.map(async file => ({ file, sha256: sha(await readFile(path.join(repo, file))) })));
const before = await snapshot();
const baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
const expectedCommit = process.argv[2];
if (!expectedCommit || !/^[0-9a-f]{40}$/.test(expectedCommit) || baseCommit !== expectedCommit) throw new Error('Pass the exact 40-character reviewed runtime commit as the first argument; HEAD must match it.');
// Preserve previous delivered HTML/evidence in their existing directories.
const output = path.join(here, 'artifacts', baseCommit.slice(0, 12));
const result = await build({ absWorkingDir: here, entryPoints: ['main.tsx'], bundle: true, platform: 'browser', target: 'es2022', format: 'iife', minify: true, legalComments: 'none', write: false, outdir: 'portable', metafile: true, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': '"about:blank"' }, logLevel: 'warning' });
const script = result.outputFiles.find(file => file.path.endsWith('.js'))?.text;
const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text;
if (!script || !css) throw new Error('Missing actual source script/styles.');
const after = await snapshot();
const buildInputs = Object.keys(result.metafile.inputs).map(file => path.relative(repo, path.resolve(here, file))).sort();
if (JSON.stringify(before.filter(row => buildInputs.includes(row.file))) !== JSON.stringify(after.filter(row => buildInputs.includes(row.file)))) throw new Error('A consumed runtime source changed during portable compilation; wait for the source freeze and rebuild.');
if (buildInputs.some(file => /(?:^|\/)(?:tests|test|preview)\//.test(file) || /(?:legacy|old-fixture)/i.test(file))) throw new Error('Unexpected fixture/test/legacy source in portable runtime graph.');
const sourceInputHashes = after.filter(row => buildInputs.includes(row.file));
const productionSourceInputs = sourceInputHashes.filter(row => !row.file.startsWith('apps/web/preview-core-pages/'));
const ownPreviewSourceHashes = after.filter(row => row.file.startsWith('apps/web/preview-core-pages/'));
const workingTreeStatus = execFileSync('git', ['status', '--short', '--', ...productionSourceInputs.map(row => row.file), 'apps/web/preview-core-pages'], { cwd: repo, encoding: 'utf8' }).trim();
const dirtyProductionInputs = productionSourceInputs.filter(row => {
  try { return sha(execFileSync('git', ['show', `${baseCommit}:${row.file}`], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] })) !== row.sha256; }
  catch { return true; }
});
if (dirtyProductionInputs.length > 0) throw new Error(`Actual UI/native source inputs do not match the committed checkpoint: ${dirtyProductionInputs.map(row => row.file).join(', ')}. Wait for the coherent checkpoint; this preview does not label WIP as committed.`);
const sourceSnapshotSha256 = sha(sourceInputHashes.map(row => `${row.sha256}  ${row.file}\n`).join(''));
const dependencyLockHashes = await Promise.all(['package.json', 'package-lock.json'].map(async file => ({ file, sha256: sha(await readFile(path.join(repo, file))) })));
const safe = (value, tag) => value.replace(new RegExp(`</${tag}`, 'gi'), match => `<\\/${match.slice(2)}`);
const html = '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">'
  + `<meta name="source-base-commit" content="${baseCommit}"><meta name="source-working-tree-snapshot-sha256" content="${sourceSnapshotSha256}"><title>奈爵 ERP · TEST ONLY 三个核心只读页面</title><style data-inventory-inline data-core-preview-inline data-demo-single-select-inline data-demo-multi-select-inline>${safe(css, 'style')}</style></head><body><div id="root"></div><script>${safe(script, 'script')}</script></body></html>`;
const bytes = Buffer.byteLength(html);
if (bytes > 10 * 1024 * 1024) throw new Error(`Portable file exceeds reference-upload limit: ${bytes}; no feature was removed.`);
const file = path.join(output, `three-core-pages-synthetic-test-only-${baseCommit.slice(0, 12)}.html`);
const manifest = { file, bytes, sha256: sha(html), embedLimitBytes: 262144, referenceLimitBytes: 10485760, fitsEmbedLimit: bytes <= 262144, baseCommit, sourceState: 'Every actual UI/native runtime source input matches the named commit. Preview-only derivative inputs are separately hashed and may be uncommitted; this is not a production release.', sourceSnapshotSha256, sourceInputs: sourceInputHashes, productionSourceInputs, previewSourceInputs: sourceInputHashes.filter(row => row.file.startsWith('apps/web/preview-core-pages/')), ownPreviewSourceHashes, sourceFreezeHashes: productionSourceInputs.filter(row => row.file.startsWith('apps/web/src/')), dependencyLockHashes, workingTreeStatus, generatedAt: new Date().toISOString(), runtime: 'Actual shared DemoFrame + actual inventory/sales/transfers readonly leaves; explicit isolated synthetic providers. No network/backend/authentication/write operations.', limitations: ['All-in-one portable derivative, not production split/lazy-load performance evidence.', 'No real-browser, screenshot/pixel, real-data or Space embed acceptance.', 'Over-limit HTML is a downloadable file; no features cut to force embedding.'] };
await mkdir(output, { recursive: true });
await writeFile(file, html);
await writeFile(path.join(output, 'source-inputs.sha256'), sourceInputHashes.map(row => `${row.sha256}  ${row.file}\n`).join(''));
await writeFile(path.join(output, 'verification.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(output, 'metafile.json'), JSON.stringify(result.metafile, null, 2) + '\n');
console.log(JSON.stringify({ file, bytes, sha256: manifest.sha256, baseCommit, sourceSnapshotSha256, fitsEmbedLimit: manifest.fitsEmbedLimit }, null, 2));
console.log('Built local TEST ONLY files only. No server, listener, deployment, upload, database, credential or network action.');
