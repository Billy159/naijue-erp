import { build } from 'esbuild';
import { inlineHarnessAssets } from './inline-assets.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)), outdir = path.join(here, 'dist');
await mkdir(outdir, { recursive: true });
await build({ entryPoints: [path.join(here, 'main.tsx')], outdir, bundle: true, platform: 'browser', format: 'esm', splitting: true, target: 'es2022', jsx: 'automatic', minify: true, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' });
await writeFile(path.join(outdir, 'index.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>合成验收 · NEW调拨流程 · 非正式</title><link rel="stylesheet" href="./main.css"></head><body><header class="harness-toolbar"><h1>合成浏览器验收 · 非正式 · 无数据库 / 无真实账号 / 无真实库存</h1><p>实际 ApplicationConfiguration / manualCreate 路由与组件，API 为页面内存模拟，不是数据库端到端验收。刷新会清空合成单据。</p><button id="authorize">模拟授权／权限失败后重新授权</button><button id="home">返回应用首页（测试离页守卫）</button><button id="transfer">打开调拨单列表</button><label>注入一次流程条件 <select id="failure"><option value="none">正常合成响应</option><option value="candidate403">候选403</option><option value="prepare403">准备403</option><option value="prepareUnavailable">准备服务503</option><option value="saveUncertain">保存后丢响应（用原回执核实）</option></select></label><label><input id="delay" type="checkbox">准备延迟5秒，测试编辑／取消后迟到响应</label></header><details><summary>合成请求日志（无真实数据）</summary><pre id="calls"></pre></details><div id="root"></div><script type="module" src="./main.js"></script></body></html>`);
console.log(`Built synthetic-only static browser harness: ${outdir}`);

const standalone = await build({ entryPoints: [path.join(here, 'main.tsx')], outdir: 'standalone', bundle: true, platform: 'browser', format: 'esm', write: false, target: 'es2022', jsx: 'automatic', minify: true, define: { 'process.env.NODE_ENV': '\"production\"' }, logLevel: 'warning' });
const script = standalone.outputFiles.find(file => file.path.endsWith('.js'))?.text;
const css = standalone.outputFiles.find(file => file.path.endsWith('.css'))?.text;
if (!script || !css) throw new Error('Missing standalone assets');
const html = inlineHarnessAssets(await readFile(path.join(outdir, 'index.html'), 'utf8'), script, css);
await writeFile(path.join(outdir, 'synthetic-new-transfer.html'), html);
console.log(`Standalone file-open harness: ${path.join(outdir, 'synthetic-new-transfer.html')} (${Buffer.byteLength(html)} bytes)`);
