import {build} from 'esbuild';
import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inlineManagementAssets} from '../management-browser-harness/inline-assets.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repoRoot=path.resolve(here,'../../..');
const sha256=value=>createHash('sha256').update(value).digest('hex');
/** esbuild reads nearest tsconfig/extends without listing them as module inputs.
 * Capture those actual repository configs so a copied source snapshot rebuilds
 * without borrowing compiler options from the active checkout. */
export async function collectBuildContextInputs(repositoryRoot,sourceNames){
 const captured={};
 const capture=async filename=>{
  const relative=path.relative(repositoryRoot,filename);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Build config escaped repository');
  if(Object.hasOwn(captured,relative))return;
  const text=await readFile(filename,'utf8');captured[relative]=sha256(text);
  const config=JSON.parse(text);
  for(const parent of Array.isArray(config.extends)?config.extends:config.extends?[config.extends]:[]){
   if(typeof parent!=='string'||!parent.startsWith('.'))throw new Error('Build snapshot requires explicit repository-local tsconfig extends');
   const resolved=path.resolve(path.dirname(filename),parent);
   await capture(resolved.endsWith('.json')?resolved:`${resolved}.json`);
  }
 };
 for(const name of sourceNames){
  if(name.split(/[\\/]/).includes('node_modules'))continue;
  let directory=path.dirname(path.resolve(repositoryRoot,name));
  while(!path.relative(repositoryRoot,directory).startsWith('..')){
   const candidate=path.join(directory,'tsconfig.json');let exists=true;
   try{await readFile(candidate);}catch(error){if(error.code!=='ENOENT')throw error;exists=false;}
   if(exists){await capture(candidate);break;}
   if(directory===repositoryRoot)break;directory=path.dirname(directory);
  }
 }
 return captured;
}

export async function buildUnifiedHarness({outdir=path.join(here,'dist')}={}){
  if(!path.isAbsolute(outdir))throw new TypeError('Harness output requires an explicit absolute path');
  const result=await build({absWorkingDir:repoRoot,entryPoints:[path.join(here,'main.tsx')],outdir:path.join(outdir,'unused-assets'),write:false,bundle:true,splitting:false,platform:'browser',format:'esm',target:'es2022',jsx:'automatic',minify:true,metafile:true,define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
  const script=result.outputFiles.find(file=>file.path.endsWith('.js'))?.text,css=result.outputFiles.find(file=>file.path.endsWith('.css'))?.text;
  if(!script||!css)throw new Error('Unified harness requires complete inline assets');
  const template=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>统一验收版 · 合成数据 · 非正式</title><!-- MANAGEMENT_INLINE_STYLE --></head><body><section id="unified-entry"><div class="unified-entry-card"><h1>统一验收版</h1><p>合成演示数据 / 非正式 / 不输入真实密码</p><p>同一个应用入口，使用左侧菜单逐页验收。无真实账号、真实数据库或外部网络；刷新清空合成单据。本页不是正式上线版本。</p><button id="enter" type="button">进入验收版</button></div></section><div id="unified-root" hidden></div><aside class="unified-synthetic-mark" aria-label="合成验收标识">合成数据 · 非正式 · 无密码</aside><details class="unified-debug"><summary>验收调试</summary><div class="unified-debug-panel"><strong>合成演示数据 / 非正式 / 不输入真实密码</strong><p>控件仅注入本页内存故障；不连接真实服务。库存流水及未接页面明确禁用；客户/供应商仅只读。交易仅新增草稿SAVE/回执，不模拟审核或库存过账。</p><div id="review-profile-tools"></div><p><button id="reenter" type="button">重新进入合成会话</button> <button id="home" type="button">关闭当前页</button> <button id="revoke" type="button">模拟身份失效</button></p><label><input id="show-session-layout" type="checkbox">显示合成账户栏（仅布局验收）</label><label>下一次读取 <select id="read-failure"><option value="none">正常</option><option value="forbidden">403拒权</option><option value="unavailable">503不可用</option><option value="network">连接失败</option><option value="empty">成功空结果</option></select></label><button id="read-delay" type="button">下一读取迟到3秒</button><label>交易故障 <select id="transaction-failure"><option value="none">正常</option><option value="candidate403">候选403</option><option value="prepare403">准备403</option><option value="prepareUnavailable">准备503</option><option value="proofMissing">销货凭据缺失</option><option value="saveUncertain">SAVE后丢响应</option></select></label><label><input id="prepare-delay" type="checkbox">原生准备延迟3秒</label><p id="harness-status" role="status">请点击“进入验收版”；无需账号密码。</p><details><summary>合成请求日志（只记固定路径）</summary><pre id="calls"></pre></details></div></details><!-- MANAGEMENT_INLINE_SCRIPT --></body></html>`;
  const html=inlineManagementAssets(template,script,css).replace('<style data-management-harness-style','<style data-unified-harness-style data-management-harness-style');await mkdir(outdir,{recursive:true});const filename=path.join(outdir,'synthetic-unified.html');await writeFile(filename,html);
  const inputs={};
  for(const name of Object.keys(result.metafile.inputs).filter(name=>!name.split(/[\\/]/).includes('node_modules')&&!name.startsWith('<')).sort()){
    const input=path.resolve(repoRoot,name),relative=path.relative(repoRoot,input);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Provenance input escaped repository');
    inputs[relative]=sha256(await readFile(input));
  }
  const dependencyManifests={};for(const name of ['package.json','package-lock.json'])dependencyManifests[name]=sha256(await readFile(path.join(repoRoot,name)));
  const provenance={syntheticOnly:true,visualVerification:'NOT_RUN',databaseVerification:'NOT_RUN',frozenDemoCommit:'b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3',sourceState:'WORKING_TREE_INPUT_HASHES_NOT_GIT_HEAD',generatedAt:new Date().toISOString(),artifact:{filename:path.basename(filename),bytes:Buffer.byteLength(html),sha256:sha256(html)},inputHashScope:'Repository source inputs from esbuild metafile; dependencies identified by package manifests, node_modules bytes excluded',dependencyManifests,inputs,rebuildInputs:{...await collectBuildContextInputs(repoRoot,Object.keys(inputs)),...Object.fromEntries(await Promise.all(['build.mjs','tsconfig.json','README.md','MAC_CHECKLIST.md','../management-browser-harness/inline-assets.mjs'].map(async name=>[path.relative(repoRoot,path.resolve(here,name)),sha256(await readFile(path.resolve(here,name)))])))}};
  await writeFile(path.join(outdir,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  await copyFile(path.join(here,'README.md'),path.join(outdir,'README.md'));await copyFile(path.join(here,'MAC_CHECKLIST.md'),path.join(outdir,'MAC_CHECKLIST.md'));
  return {filename,bytes:Buffer.byteLength(html),metafile:result.metafile,provenance};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const result=await buildUnifiedHarness();console.log(`Built SYNTHETIC ONLY offline unified harness: ${result.filename} (${result.bytes} bytes). No browser, server or database was started.`);}
