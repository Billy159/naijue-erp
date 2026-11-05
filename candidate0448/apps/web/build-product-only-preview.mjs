import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const outputPath = path.join(root, 'dist-preview', 'product-drawer-only-preview-test-only.html');
const result = await build({
  absWorkingDir: root,
  entryPoints: ['preview/product-only.tsx'],
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  minify: true,
  legalComments: 'none',
  write: false,
  outdir: 'product-only-standalone',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': '"about:blank"' },
  logLevel: 'warning',
});
const script = result.outputFiles.find(file => file.path.endsWith('.js'))?.text;
const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text;
if (!script || !css) throw new Error('Missing product-only standalone script or styles.');
const safeInline = (source, tag) => source.replace(new RegExp(`</${tag}`, 'gi'), match => `<\\/${match.slice(2)}`);
const html = '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>奈爵 ERP · TEST ONLY 商品抽屉独立预览</title>'
  + `<style data-inventory-inline data-product-only-inline>${safeInline(css, 'style')}</style></head><body><div id="root"></div><script>${safeInline(script, 'script')}</script></body></html>`;
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, html, 'utf8');
const bytes = Buffer.byteLength(html, 'utf8');
const sha256 = createHash('sha256').update(html, 'utf8').digest('hex');
console.log(JSON.stringify({ file: outputPath, bytes, budgetBytes: 262144, sha256 }, null, 2));
if (bytes > 262144) throw new Error(`Product-only preview exceeds 256KiB: ${bytes} UTF-8 bytes. Functionality has not been removed to force the budget.`);
console.log('Built a separate TEST ONLY product-drawer derivative. Full inventory app untouched. No server, network, deployment or database.');
