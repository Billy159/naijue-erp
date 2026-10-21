import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../..');
const digest = data => createHash('sha256').update(data).digest('hex');
export async function buildAcceptance({ outdir = path.join(here, 'dist') } = {}) {
  if (!path.isAbsolute(outdir) || outdir === repository || outdir === here) throw new TypeError('An independent absolute output directory is required.');
  const publicRoot = path.join(outdir, 'public');
  await mkdir(publicRoot, { recursive: true });
  // Remove only this test app's generated public directory, never source or another app's output.
  if (path.basename(publicRoot) !== 'public') throw new TypeError('Invalid acceptance asset root.');
  try {
    const previous = JSON.parse(await readFile(path.join(publicRoot, 'manifest.json'), 'utf8'));
    if (previous.purpose !== 'SYNTHETIC ONLY visual acceptance UI test') throw new TypeError('Refusing to replace an unrelated public directory.');
    await rm(publicRoot, { recursive: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    if ((await readdir(publicRoot)).length) throw new TypeError('Refusing to replace a non-empty unmarked public directory.');
  }
  await mkdir(publicRoot, { recursive: true });
  const common = { absWorkingDir: repository, bundle: true, platform: 'browser', target: 'es2022', minify: true,
    legalComments: 'none', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' };
  // Source CSS imports are represented by explicit shell/route/action entries below.
  // Never emit esbuild's aggregate dynamic-import CSS as a startup stylesheet.
  const result = await build({ ...common, entryPoints: { acceptance: path.join(here, 'entry.tsx') }, outdir: publicRoot,
    format: 'esm', splitting: true, metafile: true, chunkNames: 'chunks/[name]-[hash]',
    plugins: [{ name: 'explicit-test-styles', setup(api) { api.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' })); } }] });
  const styles = { shell: path.join(here, 'shell.css'), inventory: 'apps/web/src/application/styles/inventory.css', sales: 'apps/web/src/application/styles/sales.css',
    transfers: 'apps/web/src/application/styles/transfers.css', 'sales-detail': 'apps/web/src/application/styles/sales-detail.css',
    'transfer-detail': 'apps/web/src/application/styles/transfer-detail.css', 'transfer-product': 'apps/web/src/application/styles/transfer-product.css',
    'chunks/product-drawer': 'apps/web/src/inventory/product-drawer.css', 'chunks/single-select': 'apps/web/src/demo-controls/single-select.css',
    'chunks/multi-select': 'apps/web/src/demo-controls/multi-select.css', 'chunks/product-candidate-action': 'apps/web/src/components/product-candidate-action.css' };
  for (const [name, source] of Object.entries(styles)) {
    const css = await build({ ...common, entryPoints: [source], outfile: path.join(publicRoot, `${name}.css`), metafile: true });
    Object.assign(result.metafile.inputs, css.metafile.inputs); Object.assign(result.metafile.outputs, css.metafile.outputs);
  }
  const html = '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>SYNTHETIC ONLY · 奈爵 ERP 独立视觉测试</title><link rel="stylesheet" href="./shell.css"></head><body><div id="visual-acceptance-root"></div><noscript>SYNTHETIC ONLY：此独立 UI 测试需要 JavaScript，无登录、数据库或写入。</noscript><script type="module" src="./acceptance.js"></script></body></html>\n';
  await writeFile(path.join(publicRoot, 'index.html'), html);
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
  const sourceInputs = {};
  const inputPaths = [...new Set([...Object.keys(result.metafile.inputs), 'package.json', 'package-lock.json', ...await sourceFiles(here)])].sort();
  for (const filename of inputPaths) {
    const absolute = path.resolve(repository, filename);
    // Dependency versions are recorded by the package lock; application source content is individually hashed.
    if (filename.includes('node_modules') || !absolute.startsWith(repository + path.sep)) continue;
    sourceInputs[path.relative(repository, absolute).split(path.sep).join('/')] = digest(await readFile(absolute));
  }
  const sourceHash = digest(JSON.stringify(sourceInputs));
  const assets = {};
  for (const filename of await files(publicRoot)) assets[filename] = digest(await readFile(path.join(publicRoot, filename)));
  const hostWorkingTreeChanges = execFileSync('git', ['status', '--porcelain', '--', 'apps/web/visual-acceptance-host'], { cwd: repository, encoding: 'utf8' }).trim().length > 0;
  const manifest = { componentsSourceBase: 'cc2f237a673c400a2ebefd9daa965fd1daaf4031', hostWorkingTreeChanges, sourceCommitMeaning: 'Git HEAD at build time; hostWorkingTreeChanges=true means the independent host is additionally identified by sourceHash, not included in that commit.', purpose: 'SYNTHETIC ONLY visual acceptance UI test', sourceCommit, sourceHash, sourceEntry: 'apps/web/visual-acceptance-host/entry.tsx',
    productionBootstrapUsed: false, businessNetwork: false, authentication: false, database: false, writes: false,
    assets, sourceInputs, chromeDifference: 'SYNTHETIC ONLY marker in existing DemoFrame topbarActions slot; closed fixed diagnostics outside business layout; no extra notice row.',
    boundary: 'Static build and focused tests are not frozen-Demo browser visual acceptance.' };
  await writeFile(path.join(publicRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(outdir, 'metafile.json'), `${JSON.stringify(result.metafile, null, 2)}\n`);
  await copyFile(path.join(here, 'server.mjs'), path.join(outdir, 'server.mjs'));
  await writeFile(path.join(outdir, 'distribution.sha256'), `${digest(await readFile(path.join(outdir, 'server.mjs')))}  server.mjs\n${digest(await readFile(path.join(publicRoot, 'manifest.json')))}  public/manifest.json\n${Object.entries(assets).map(([file, sha]) => `${sha}  public/${file}`).join('\n')}\n`);
  return { outdir, publicRoot, manifest, metafile: result.metafile };
}
async function files(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await files(root, relative)); else if (entry.isFile()) result.push(relative);
  }
  return result.sort();
}
async function sourceFiles(root) {
  return (await files(root)).filter(file => !file.startsWith('dist/')).map(file => path.relative(repository, path.join(root, file)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--outdir' || !path.isAbsolute(args[1]))) throw new TypeError('Usage: node build.mjs [--outdir ABSOLUTE_DIRECTORY]');
  const result = await buildAcceptance(args.length ? { outdir: args[1] } : {});
  process.stdout.write(`Built independent SYNTHETIC ONLY UI app at ${result.outdir}\nSource commit: ${result.manifest.sourceCommit}\nSource SHA-256: ${result.manifest.sourceHash}\nNo server was started.\n`);
}
