import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildApplication } from '../application/build-application.mjs';
import { parseProductionHostAssets, parseProductionHostConfiguration, productionAssetUrl } from './configuration.ts';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../../../..'), application = path.resolve(here, '../application');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const attribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');

/** C calls this once per fresh immutable output directory. No server, DB, credentials, .env or deployment. */
export async function buildProductionHost({ configuration, outdir, sourceCheckpoint }) {
  const checked = parseProductionHostConfiguration(configuration);
  if (!path.isAbsolute(outdir ?? '') || !/^[a-f0-9]{40}$/.test(sourceCheckpoint ?? '')) throw new TypeError('Absolute fresh output and exact source checkpoint are required.');
  // EEXIST is intentional: a prior version is never silently overwritten.
  await mkdir(outdir, { recursive: false });
  const observed = new Map();
  const onSourceInput = (filename, bytes) => {
    const previous = observed.get(filename), hash = sha256(bytes);
    if (previous && previous.sha256 !== hash) throw new Error('A production input changed during the build.');
    observed.set(filename, { bytes: bytes.length, sha256: hash });
  };
  for (const filename of [path.join(here, 'build-production-host.mjs'), path.join(application, 'build-application.mjs'), path.join(root, 'package.json'), path.join(root, 'package-lock.json'), path.join(root, 'tsconfig.json'), path.join(root, 'apps/web/tsconfig.json'), path.join(application, 'tsconfig.json')]) onSourceInput(filename, await readFile(filename));
  const result = await buildApplication({ entryPoint: path.join(here, 'entry.ts'), outdir, onSourceInput });
  const assets = parseProductionHostAssets(result.manifest);
  const sourceInputs = [];
  for (const [filename, observedInput] of [...observed].sort(([left], [right]) => left.localeCompare(right))) {
    const relative = path.relative(root, filename).replaceAll(path.sep, '/');
    if (relative.startsWith('../') || /(^|\/)(?:unified-browser-harness|new-document-browser-harness|development-host|fixtures?|tests?|synthetic[^/]*)(\/|$)|(?:\.test\.|\.spec\.|test-support|fixture|synthetic)/i.test(relative)) throw new Error('Non-production input entered the production graph.');
    const bytes = await readFile(filename);
    if (sha256(bytes) !== observedInput.sha256) throw new Error('A production input changed before the build was sealed.');
    sourceInputs.push({ path: relative, ...observedInput });
  }
  const url = filename => attribute(productionAssetUrl(checked, filename));
  const html = `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="same-origin"><title>奈爵服饰 ERP</title><link rel="stylesheet" href="${url(assets.styles.application)}"></head><body><div id="naijue-erp-root"></div><noscript>请启用 JavaScript 后使用系统。</noscript><script id="naijue-erp-production-configuration" type="application/json">${json({ configuration: checked, assets })}</script><script type="module" src="${url(assets.entry)}"></script></body></html>\n`;
  await writeFile(path.join(outdir, 'index.html'), html);
  const files = [];
  const walk = async directory => {
    for (const name of (await readdir(directory)).sort()) {
      const filename = path.join(directory, name), info = await stat(filename);
      if (info.isDirectory()) await walk(filename);
      else { const bytes = await readFile(filename); files.push({ path: path.relative(outdir, filename).replaceAll(path.sep, '/'), bytes: bytes.length, sha256: sha256(bytes) }); }
    }
  };
  await walk(outdir);
  const manifest = { format: 'naijue-production-web-v1', sourceCheckpoint, builtAt: new Date().toISOString(), configuration: checked,
    entry: 'index.html', assets, inputs: sourceInputs, outputs: files };
  await writeFile(path.join(outdir, 'production-build.json'), JSON.stringify(manifest, null, 2) + '\n');
  return Object.freeze({ outdir, html: 'index.html', manifest: 'production-build.json', inputs: sourceInputs, outputs: [...files, { path: 'production-build.json' }], assets });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== '--config' || args[2] !== '--outdir' || args[4] !== '--source-checkpoint' || !path.isAbsolute(args[1] ?? '')) {
    process.stderr.write('Usage: node build-production-host.mjs --config ABS_PUBLIC_JSON --outdir ABS_FRESH_OUTPUT --source-checkpoint FULL_SHA\n'); process.exitCode = 1;
  } else {
    try {
      const raw = await readFile(args[1], 'utf8'); if (raw.length > 16_384) throw new TypeError('Public configuration is too large.');
      const result = await buildProductionHost({ configuration: JSON.parse(raw), outdir: args[3], sourceCheckpoint: args[5] });
      process.stdout.write(`Production frontend built: ${result.outputs.length} outputs, ${result.inputs.length} hashed inputs. No service was started.\n`);
    } catch { process.stderr.write('Production frontend build failed; inspect the explicit public configuration, source graph and fresh output directory.\n'); process.exitCode = 1; }
  }
}
