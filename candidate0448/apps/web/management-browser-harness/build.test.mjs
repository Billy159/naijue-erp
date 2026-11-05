import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {buildManagementHarness} from './build.mjs';
import {inlineManagementAssets} from './inline-assets.mjs';
test('inline assets preserve literal bundle bytes and reject ambiguous templates',()=>{
  const script='const literal="$& $` $\' $$ </script>";',css='p::after{content:"$& $` $\' $$ </style>"}';
  const html=inlineManagementAssets('<!-- MANAGEMENT_INLINE_STYLE --><!-- MANAGEMENT_INLINE_SCRIPT -->',script,css);
  assert.ok(html.includes(script.replace(/<\/script/gi,()=>'<\\/script')));assert.ok(html.includes(css.replace(/<\/style/gi,()=>'<\\/style')));assert.throws(()=>inlineManagementAssets('bad',script,css));
});
test('offline actual Application harness contains all assets, strong synthetic warning and denies network; no frozen runtime or database bundles',async()=>{
  const temporary=await mkdtemp(path.join(os.tmpdir(),'management-build-'));
  try{const result=await buildManagementHarness({outdir:temporary});const html=await readFile(result.filename,'utf8');
    assert.match(html,/合成演示数据 \/ 非正式 \/ 不输入真实密码/);assert.match(html,/connect-src 'none'/);assert.match(html,/form-action 'none'/);assert.match(html,/id="open-categories"/);
    assert.ok(html.includes('data-management-harness-style'));assert.ok(!/<script[^>]+src=|<link[^>]+href=/i.test(html));assert.ok(result.bytes>100000);
    const inputs=Object.keys(result.metafile.inputs);assert.ok(inputs.some(input=>input.endsWith('src/application/controller.ts')));assert.ok(inputs.some(input=>input.endsWith('products/products-page.tsx')));assert.ok(inputs.some(input=>input.endsWith('product-settings/size-groups/setting-page.tsx')));assert.ok(inputs.some(input=>input.endsWith('barcode-schemes/barcode-schemes-page.tsx')));assert.ok(inputs.some(input=>input.endsWith('product-categories/product-categories-page.tsx')));assert.ok(inputs.some(input=>input.endsWith('product-settings/colors/entry-page.tsx')));
    assert.ok(!inputs.some(input=>/frozen-demo|adapters\/postgres|apps\/api|new-document-browser-harness|current-form\/fixtures/.test(input)));assert.ok(!/window\.fetch\s*\(|globalThis\.fetch\s*\(/.test(html));
  }finally{await rm(temporary,{recursive:true,force:true});}
});
