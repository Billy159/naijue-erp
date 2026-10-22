import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),temporary=await mkdtemp(path.join(here,'.products-build-'));
try{
  const result=await build({entryPoints:[path.resolve(here,'../../application/routes/products.tsx')],outdir:temporary,bundle:true,splitting:true,format:'esm',platform:'browser',jsx:'automatic',write:false,metafile:true,logLevel:'warning'});
  const files=result.outputFiles,css=files.filter(file=>file.path.endsWith('.css')).map(file=>file.text).join('\n'),inputs=Object.keys(result.metafile.inputs);
  assert.ok(files.some(file=>file.path.endsWith('.js')));assert.match(css,/\.pm-products/);assert.match(css,/min-width: 1114px/);assert.match(css,/data-product-viewport-popup/);
  assert.ok(inputs.some(file=>file.endsWith('products/http-reader.ts')));assert.ok(inputs.some(file=>file.endsWith('inventory/product-drawer-host.tsx')));
  assert.ok(!inputs.some(file=>/synthetic|fixture|current-form\/http-reader|postgres|node:/.test(file)),'Actual product route must not ship fixture/current-form/database fallbacks');
  console.log('PASS independent products route browser bundle/CSS with real HTTP and target drawer, no fixture/database/transaction-candidate runtime. Build is not visual QA.');
}finally{await rm(temporary,{recursive:true,force:true});}
