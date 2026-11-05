import {build} from 'esbuild';
import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inlineManagementAssets} from './inline-assets.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repoRoot=path.resolve(here,'../../..');
const sha256=value=>createHash('sha256').update(value).digest('hex');
export async function buildManagementHarness({outdir=path.join(here,'dist')}={}){
  if(!path.isAbsolute(outdir))throw new TypeError('Harness output requires an explicit absolute path');
  const result=await build({absWorkingDir:repoRoot,entryPoints:[path.join(here,'main.tsx')],outdir:path.join(outdir,'unused-assets'),write:false,bundle:true,splitting:false,platform:'browser',format:'esm',target:'es2022',jsx:'automatic',minify:true,metafile:true,define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
  const script=result.outputFiles.find(file=>file.path.endsWith('.js'))?.text,css=result.outputFiles.find(file=>file.path.endsWith('.css'))?.text;
  if(!script||!css)throw new Error('Management harness requires complete inline assets');
  const template=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>商品管理只读验收 · 合成数据 · 非正式</title><!-- MANAGEMENT_INLINE_STYLE --></head><body><header class="management-harness-notice"><h1>合成演示数据 / 非正式 / 不输入真实密码</h1><p>实际 Application 路由与组件；所有API响应均为本页内存合成数据。无数据库、无真实账号、无真实库存、无商品写维护，不能作为正式端到端或视觉通过证明。</p><div class="management-harness-controls"><button id="enter" type="button">模拟进入商品验收（无需密码）</button><button id="open-products" type="button">商品信息</button><button id="open-categories" type="button">商品分类</button><button id="open-settings" type="button">商品设置</button><button id="open-schemes" type="button">条码方案</button><button id="home" type="button">关闭当前页</button><button id="revoke" type="button">模拟身份失效</button><label>下一次读取 <select id="failure"><option value="none">正常</option><option value="forbidden">403拒权</option><option value="unavailable">503不可用</option><option value="network">网络失败</option><option value="empty">成功空结果</option></select></label><button id="delay" type="button">下一读取延迟3秒（测试迟到）</button></div><p id="harness-status" role="status">请点击“模拟进入”。此页不接受账号密码；网络连接被CSP及封闭transport双重禁止。</p></header><details class="management-request-log"><summary>合成请求日志（只记固定路径，无凭据或请求数据）</summary><pre id="calls"></pre></details><div id="management-root"></div><!-- MANAGEMENT_INLINE_SCRIPT --></body></html>`;
  const html=inlineManagementAssets(template,script,css);await mkdir(outdir,{recursive:true});const filename=path.join(outdir,'synthetic-management.html');await writeFile(filename,html);
  const inputs={};
  for(const name of Object.keys(result.metafile.inputs).filter(name=>!name.split(/[\\/]/).includes('node_modules')&&!name.startsWith('<')).sort()){
    const input=path.resolve(repoRoot,name),relative=path.relative(repoRoot,input);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Provenance input escaped repository');
    inputs[relative]=sha256(await readFile(input));
  }
  const dependencyManifests={};for(const name of ['package.json','package-lock.json'])dependencyManifests[name]=sha256(await readFile(path.join(repoRoot,name)));
  const provenance={syntheticOnly:true,visualVerification:'NOT_RUN',databaseVerification:'NOT_RUN',frozenDemoCommit:'b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3',sourceState:'WORKING_TREE_INPUT_HASHES_NOT_GIT_HEAD',generatedAt:new Date().toISOString(),artifact:{filename:path.basename(filename),bytes:Buffer.byteLength(html),sha256:sha256(html)},inputHashScope:'Repository source inputs from esbuild metafile; dependencies identified by package manifests, node_modules bytes excluded',dependencyManifests,inputs};
  await writeFile(path.join(outdir,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  await copyFile(path.join(here,'README.md'),path.join(outdir,'README.md'));await copyFile(path.join(here,'MAC_CHECKLIST.md'),path.join(outdir,'MAC_CHECKLIST.md'));
  return {filename,bytes:Buffer.byteLength(html),metafile:result.metafile,provenance};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const result=await buildManagementHarness();console.log(`Built SYNTHETIC ONLY offline management harness: ${result.filename} (${result.bytes} bytes). No browser, server or database was started.`);}
