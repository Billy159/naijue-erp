import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildApplication } from '../application/build-application.mjs';
import { developmentAssetUrl, parseDevelopmentHostAssets, parseDevelopmentHostConfiguration } from './configuration.ts';
const here = path.dirname(fileURLToPath(import.meta.url));
const attribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const publicJson = value => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');

/** Offline static build only. Caller supplies the complete public configuration.
 * No environment lookup, credential handling, listener, browser, DB or deployment. */
export async function buildDevelopmentHost({ configuration, outdir }) {
  const checked = parseDevelopmentHostConfiguration(configuration);
  if (!path.isAbsolute(outdir ?? '')) throw new TypeError('An explicit absolute development-host output directory is required.');
  const result = await buildApplication({ entryPoint: path.join(here, 'entry.ts'), outdir });
  const assets = parseDevelopmentHostAssets(result.manifest);
  const hostStyles = await build({ absWorkingDir: path.resolve(here, '../application'), entryPoints: [path.join(here, 'host.css')], outfile: path.join(outdir, 'development-host.css'), bundle: true, minify: true, metafile: true, logLevel: 'warning' });
  Object.assign(result.metafile.inputs, hostStyles.metafile.inputs);
  Object.assign(result.metafile.outputs, hostStyles.metafile.outputs);
  await writeFile(path.join(outdir, 'metafile.json'), JSON.stringify(result.metafile, null, 2));
  const url = filename => attribute(developmentAssetUrl(checked, filename));
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="same-origin"><title>奈爵 ERP · 开发宿主</title>
<link rel="stylesheet" href="${url(assets.styles.application)}">
<link rel="stylesheet" href="${url('development-host.css')}">
</head><body><div id="naijue-erp-root"></div><noscript>此开发宿主需要启用 JavaScript。</noscript>
<script id="naijue-erp-development-configuration" type="application/json">${publicJson({ configuration: checked, assets })}</script>
<script type="module" src="${url(assets.entry)}"></script>
</body></html>\n`;
  await writeFile(path.join(outdir, 'index.html'), html);
  return Object.freeze({ ...result, configuration: checked, html: 'index.html', hostStyles: 'development-host.css' });
}

// No inferred config/output, .env read, deployment or implicit invocation on import.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--config' || args[2] !== '--outdir'
    || !path.isAbsolute(args[1] ?? '') || !path.isAbsolute(args[3] ?? '')) {
    process.stderr.write('Usage: node build-development-host.mjs --config ABSOLUTE_PUBLIC_JSON --outdir ABSOLUTE_OUTPUT\n');
    process.exitCode = 1;
  } else {
    try {
      const text = await readFile(args[1], 'utf8');
      if (text.length > 16_384) throw new TypeError('Public configuration is too large.');
      const result = await buildDevelopmentHost({ configuration: JSON.parse(text), outdir: args[3] });
      process.stdout.write(`Built development HTML and split assets at ${path.join(args[3], result.html)}. No server was started.\n`);
    } catch {
      // Never echo unknown configuration input, filesystem contents or provider exceptions.
      process.stderr.write('Development host build failed. Check explicit public configuration and output paths.\n'); process.exitCode = 1;
    }
  }
}
