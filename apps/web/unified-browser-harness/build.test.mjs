import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {JSDOM} from 'jsdom';
import {buildUnifiedHarness} from './build.mjs';
test('one offline actual Application artifact, no iframe/old app entry/network/chrome viewport band',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'synthetic-unified-build-'));
 try{const result=await buildUnifiedHarness({outdir:dir});const html=await readFile(result.filename,'utf8'),dom=new JSDOM(html),d=dom.window.document;
 assert.equal(d.scripts.length,1);assert.equal(d.scripts[0].hasAttribute('src'),false);assert.equal(d.querySelectorAll('iframe,link[href],script[src]').length,0);assert.equal(d.querySelectorAll('#enter').length,1);assert.equal(d.getElementById('enter').textContent,'进入验收版');assert.equal(d.querySelector('.unified-debug').open,false);assert.ok(d.getElementById('unified-root').hidden);assert.match(d.querySelector('meta[http-equiv="Content-Security-Policy"]').content,/connect-src 'none'/);assert.match(d.querySelector('.unified-synthetic-mark').textContent,/合成数据.*非正式.*无密码/);
 const inputs=Object.keys(result.metafile.inputs);assert.ok(inputs.some(name=>name.endsWith('/harness-app.tsx')));assert.ok(inputs.some(name=>name.endsWith('management-browser-harness/synthetic-transport.ts')));assert.ok(inputs.some(name=>name.endsWith('/application/controller.ts')));for(const route of ['inventory','sales','transfers','parties','products','product-settings','product-categories','barcode-schemes','store-settings'])assert.ok(inputs.some(name=>name.endsWith(`/application/routes/${route}.tsx`)),route);
 assert.ok(!inputs.some(name=>/new-document-browser-harness\/(?:sales-main|main)\.tsx$/.test(name)));assert.ok(!inputs.some(name=>/management-browser-harness\/(?:harness-app|main)\.tsx$/.test(name)));assert.ok(!inputs.some(name=>/apps\/api\/|adapters\/postgres/.test(name)));
 assert.equal(result.provenance.sourceState,'WORKING_TREE_INPUT_HASHES_NOT_GIT_HEAD');assert.equal(result.provenance.visualVerification,'NOT_RUN');assert.ok(Object.keys(result.provenance.inputs).length>220);assert.match(html,/\.unified-debug\{position:fixed/);dom.window.close();
 }finally{await rm(dir,{recursive:true,force:true});}
});
