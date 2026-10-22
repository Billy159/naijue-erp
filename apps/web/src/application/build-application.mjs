import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

/** Static build only. Caller must supply a real, explicitly configured host entry.
 * No generated account/config, HTML auto-bootstrap, listener, install or deployment.
 * Override esbuild's eager aggregate CSS with exact shell/leaf CSS entry graphs. */
export async function buildApplication({ entryPoint, outdir, onSourceInput }) {
  if (!path.isAbsolute(entryPoint ?? '') || !path.isAbsolute(outdir ?? '')) throw new TypeError('Explicit absolute host entry and output directory are required.');
  await mkdir(outdir, { recursive: true });
  const plugins = onSourceInput ? [{ name: 'exact-production-inputs', setup(build) {
    build.onLoad({ filter: /\.(?:[cm]?js|jsx|tsx?|css|json)$/ }, async args => {
      const contents = await readFile(args.path);
      await onSourceInput(args.path, contents);
      const extension = path.extname(args.path).slice(1);
      return { contents, loader: ['mjs', 'cjs'].includes(extension) ? 'js' : extension };
    });
  } }] : [];
  const common = { absWorkingDir: here, bundle: true, platform: 'browser', target: 'es2022', minify: true, plugins,
    legalComments: 'none', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' };
  const result = await build({ ...common, entryPoints: { application: entryPoint }, outdir,
    format: 'esm', splitting: true, metafile: true, chunkNames: 'chunks/[name]-[hash]' });
  const styleManifests = {};
  for (const [name, input] of Object.entries({ application: 'shell', inventory: 'inventory', sales: 'sales', 'sales-detail': 'sales-detail', parties: 'parties', transfers: 'transfers', 'transfer-detail': 'transfer-detail', 'transfer-product': 'transfer-product', products: 'products', 'product-full-page': 'product-full-page', 'product-categories': 'product-categories', 'product-settings': 'product-settings', 'barcode-schemes': 'barcode-schemes', 'store-settings': 'store-settings' })) {
    const css = await build({ ...common, entryPoints: [path.join(here, 'styles', `${input}.css`)], outfile: path.join(outdir, `${name}.css`), metafile: true });
    Object.assign(result.metafile.inputs, css.metafile.inputs);
    // Replace rather than merge the erased eager CSS output metadata.
    for (const [file, output] of Object.entries(css.metafile.outputs)) result.metafile.outputs[file] = output;
    styleManifests[name] = `${name}.css`;
  }
  // Existing drawer uses its chunk's import.meta.url. Preserve that action-only URL;
  // no startup or inventory-route stylesheet imports the drawer body/tab CSS.
  await mkdir(path.join(outdir, 'chunks'), { recursive: true });
  const drawerPath = path.join(here, '../inventory/product-drawer.css'), drawerBytes = await readFile(drawerPath);
  await onSourceInput?.(drawerPath, drawerBytes);
  await writeFile(path.join(outdir, 'chunks/product-drawer.css'), drawerBytes);
  const pageSizeStyles = await build({ ...common, entryPoints: [path.join(here, '../demo-controls/single-select.css')], outfile: path.join(outdir, 'chunks/single-select.css'), metafile: true });
  Object.assign(result.metafile.inputs, pageSizeStyles.metafile.inputs);
  Object.assign(result.metafile.outputs, pageSizeStyles.metafile.outputs);
  const multiSelectStyles = await build({ ...common, entryPoints: [path.join(here, '../demo-controls/multi-select.css')], outfile: path.join(outdir, 'chunks/multi-select.css'), metafile: true });
  Object.assign(result.metafile.inputs, multiSelectStyles.metafile.inputs);
  Object.assign(result.metafile.outputs, multiSelectStyles.metafile.outputs);
  const productSearchStyles = await build({ ...common, entryPoints: [path.join(here, '../components/product-candidate-action.css')], outfile: path.join(outdir, 'chunks/product-candidate-action.css'), metafile: true });
  Object.assign(result.metafile.inputs, productSearchStyles.metafile.inputs);
  Object.assign(result.metafile.outputs, productSearchStyles.metafile.outputs);
  await writeFile(path.join(outdir, 'metafile.json'), JSON.stringify(result.metafile, null, 2));
  const manifest = Object.freeze({ entry: 'application.js', styles: styleManifests, productDrawerStyles: 'chunks/product-drawer.css' });
  await writeFile(path.join(outdir, 'application-assets.json'), JSON.stringify(manifest, null, 2));
  return { metafile: result.metafile, manifest };
}
