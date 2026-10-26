import {mkdir,readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {frozenStyleOrder,replicaCommonStyles} from './frontend/frozen-style-order.ts';
import {parseProductionHostAssets,parseProductionHostConfiguration,productionAssetUrl} from '../src/production-host/configuration.ts';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),frontend=path.join(here,'frontend');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const relative=filename=>path.relative(root,filename).split(path.sep).join('/');
const json=value=>JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
const attribute=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;');

/** Existing release builder's frontend producer, now using the copied normal entry. */
export async function buildProductionHost({configuration,outdir,sourceCheckpoint}) {
 const checked=parseProductionHostConfiguration(configuration);
 if(!path.isAbsolute(outdir??'')||!/^[a-f0-9]{40}$/.test(sourceCheckpoint??''))throw new TypeError('Exact source and absolute fresh output are required.');
 await mkdir(outdir,{recursive:false});
 const observed=new Map(),namespaceSources=new Map();
 const runtimeCss=new Set([...['basic-settings-v2.css','runtime/settings/settings-runtime.css','runtime/settings/payment-halls.css','runtime/common/account-password.css'].map(name=>path.join(frontend,name)),...['standard-controls.css','standard-overlay.css','document-output.css'].map(name=>path.join(root,'apps/web/src/components',name))]);

 const input=async filename=>{const bytes=await readFile(filename),previous=observed.get(filename),record={bytes:bytes.length,sha256:sha256(bytes)};if(previous&&previous.sha256!==record.sha256)throw new Error('Production input changed during build.');observed.set(filename,record);return bytes;};
 for(const filename of [fileURLToPath(import.meta.url),path.join(frontend,'frozen-style-order.ts'),path.join(frontend,'runtime.html'),path.join(root,'package.json'),path.join(root,'package-lock.json'),path.join(root,'tsconfig.json'),path.join(root,'apps/web/tsconfig.json')])await input(filename);
 const result=await build({absWorkingDir:root,entryPoints:{application:'apps/web/demo-replica/frontend/production-bootstrap.ts','source-styles/arco':'node_modules/@arco-design/web-react/dist/css/arco.css',...Object.fromEntries(frozenStyleOrder.map(name=>['source-styles/'+name.slice(0,-4),'apps/web/demo-replica/frontend/'+name]))},outdir,bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',minify:true,metafile:true,sourcemap:false,chunkNames:'chunks/[name]-[hash]',assetNames:'assets/[name]-[hash]',define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning',alias:Object.fromEntries(['react','react-dom','@arco-design/web-react','jszip'].map(name=>[name,path.join(root,'node_modules',name)])),loader:{'.svg':'file','.png':'file','.jpg':'file','.woff2':'file'},plugins:[{name:'copied-production-inputs',setup(builder){
  builder.onResolve({filter:/\?(?:inline|inventory-drawer-retry)$/},async args=>{const inline=args.path.endsWith('?inline'),request=args.path.slice(0,args.path.lastIndexOf('?')),resolved=await builder.resolve(request,{resolveDir:args.resolveDir,kind:args.kind});if(resolved.errors.length)return {errors:resolved.errors};const namespace=inline?'replica-inline-style':'replica-drawer-retry';namespaceSources.set(namespace+':'+resolved.path,relative(resolved.path));return {path:resolved.path,namespace};});
  // esbuild emits CSS imported by JS separately but does not load it when a lazy JS chunk runs.
  // Keep these existing, scoped component styles attached to their original lazy module.
  builder.onResolve({filter:/\.css$/},args=>{
   if(args.kind!=='import-statement'||!args.importer.endsWith('.tsx'))return;
   const filename=path.resolve(args.resolveDir,args.path);if(!runtimeCss.has(filename))return;
   namespaceSources.set('replica-runtime-css:'+filename,relative(filename));return {path:filename,namespace:'replica-runtime-css'};
  });
  builder.onLoad({filter:/.*/,namespace:'replica-runtime-css'},async args=>{
   const css=(await input(args.path)).toString();
   return {contents:`const key=${json(relative(args.path))};if(!document.querySelector('style[data-replica-component="'+key+'"]')){const style=document.createElement('style');style.dataset.replicaComponent=key;style.textContent=${json(css)};document.head.append(style);}`,loader:'js'};
  });
  builder.onLoad({filter:/.*/,namespace:'replica-inline-style'},async args=>({contents:await input(args.path),loader:'text'}));
  builder.onLoad({filter:/.*/,namespace:'replica-drawer-retry'},async args=>({contents:await input(args.path),loader:'tsx',resolveDir:path.dirname(args.path)}));
  builder.onLoad({filter:/.*/,namespace:'file'},async args=>{await input(args.path);return undefined;});
 }}]});
 // Preserve the raw namespace identities, and give the existing release checker physical input names.
 await writeFile(path.join(outdir,'metafile-raw.json'),JSON.stringify(result.metafile,null,2)+'\n');
 const physical=name=>namespaceSources.get(name)??name;
 const imports=rows=>rows?.map(row=>({...row,path:physical(row.path)}));
 const graph={inputs:{},outputs:{}};
 for(const [name,value]of Object.entries(result.metafile.inputs)){const actual=physical(name);graph.inputs[actual]={...value,...(name.startsWith('replica-runtime-css:')?{bytes:observed.get(path.resolve(root,actual)).bytes}:{}),imports:imports(value.imports)};}
 for(const [name,value]of Object.entries(result.metafile.outputs)){const inputs={};for(const [key,row]of Object.entries(value.inputs)){const name=physical(key);inputs[name]={bytesInOutput:(inputs[name]?.bytesInOutput??0)+row.bytesInOutput};}graph.outputs[name]={...value,inputs,...(value.entryPoint?{entryPoint:physical(value.entryPoint)}:{})};}
 await writeFile(path.join(outdir,'metafile.json'),JSON.stringify(graph,null,2)+'\n');
 await mkdir(path.join(outdir,'source-styles/assets/fonts'),{recursive:true});
 await writeFile(path.join(outdir,'source-styles/assets/fonts/LICENSE.txt'),await input(path.join(frontend,'assets/fonts/LICENSE.txt')));
 const assets=parseProductionHostAssets({entry:'application.js',styles:{application:'source-styles/styles.css',inventory:'source-styles/inventory-workbench.css',sales:'source-styles/sales-current.css','sales-detail':'source-styles/sales-detail-alignment.css',parties:'source-styles/basic-settings.css',transfers:'source-styles/transfer-current.css','transfer-detail':'source-styles/transfer-current.css','transfer-product':'source-styles/product-current.css',products:'source-styles/product-current.css','product-categories':'source-styles/product-current.css','product-settings':'source-styles/product-current.css','barcode-schemes':'source-styles/product-current.css','store-settings':'source-styles/basic-settings.css','staff-settings':'source-styles/basic-settings.css','payment-settings':'source-styles/basic-settings.css','product-full-page':'source-styles/product-current.css'},productDrawerStyles:'source-styles/product-current.css'});
 let html=(await input(path.join(frontend,'runtime.html'))).toString();
 html=html.replace('<title>Demo replica phase2 - isolated synthetic preview</title>','<title>奈爵服饰 ERP</title>').replace(/<div data-replica-preview-marker[^>]*>[^<]*<\/div>/,'').replace('<div class="proto-tag">页面结构体验 · Demo</div>','<div class="proto-tag"></div>').replace(/<div class="sidebar-note">[\s\S]*?<\/div>/,'<div class="sidebar-note"></div>');
 html=html.replace('<script type="module" src="/runtime-bootstrap.ts"></script>',`<script id="naijue-erp-production-configuration" type="application/json">${json({configuration:checked,assets})}</script><script type="module" src="${attribute(productionAssetUrl(checked,assets.entry))}"></script>`);
 const shellStyles=frozenStyleOrder.map(name=>`<!--frozen-style:${name}-->`+(replicaCommonStyles.includes(name)?`<link rel="stylesheet" data-frozen-style="${name}" href="${attribute(productionAssetUrl(checked,'source-styles/'+name))}">`:'')).join('');
 const sharedArcoStyle=`<link rel="stylesheet" href="${attribute(productionAssetUrl(checked,'source-styles/arco.css'))}">`;
 html=html.replace('</head>',sharedArcoStyle+shellStyles+'<style id="replica-startup-style">html[data-replica-starting] .app{visibility:hidden}#replica-startup{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;gap:12px;background:#fff;color:#4e5969;font:14px system-ui,sans-serif}#replica-startup a{color:#1677ff}</style></head>')
  .replace('<html lang="zh-CN"','<html data-replica-starting="" lang="zh-CN"')
  .replace('<body>','<body><div id="replica-startup" role="status"><span>系统正在加载；若页面未能显示，请重新加载。</span><a id="replica-startup-retry" href="./">重新加载</a></div>');
 await writeFile(path.join(outdir,'index.html'),html);
 const sourceInputs=[];for(const [filename,record]of [...observed].sort(([a],[b])=>a.localeCompare(b))){const name=relative(filename);if(name.startsWith('../')||/(^|\/)(?:unified-browser-harness|new-document-browser-harness|development-host|fixtures?|tests?|synthetic[^/]*)(\/|$)|(?:\.test\.|\.spec\.|test-support|fixture|synthetic)/i.test(name))throw new Error('Non-production input: '+name);if(sha256(await readFile(filename))!==record.sha256)throw new Error('Production input changed: '+name);sourceInputs.push({path:name,...record});}
 const files=[];const walk=async directory=>{for(const name of(await readdir(directory)).sort()){const filename=path.join(directory,name);if((await stat(filename)).isDirectory())await walk(filename);else{const bytes=await readFile(filename);files.push({path:path.relative(outdir,filename).split(path.sep).join('/'),bytes:bytes.length,sha256:sha256(bytes)});}}};await walk(outdir);
 const manifest={format:'naijue-production-web-v1',sourceCheckpoint,builtAt:new Date().toISOString(),configuration:checked,entry:'index.html',assets,inputs:sourceInputs,outputs:files};
 await writeFile(path.join(outdir,'production-build.json'),JSON.stringify(manifest,null,2)+'\n');
 return Object.freeze({outdir,html:'index.html',manifest:'production-build.json',inputs:sourceInputs,outputs:[...files,{path:'production-build.json'}],assets});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const args=process.argv.slice(2);if(args.length!==6||args[0]!=='--config'||args[2]!=='--outdir'||args[4]!=='--source-checkpoint')throw new TypeError('Use --config ABS_PUBLIC_JSON --outdir ABS_FRESH_OUTPUT --source-checkpoint FULL_SHA');const configuration=JSON.parse(await readFile(args[1],'utf8'));const result=await buildProductionHost({configuration,outdir:args[3],sourceCheckpoint:args[5]});process.stdout.write(`Copied production frontend: ${result.outputs.length} outputs, ${result.inputs.length} inputs.\n`);}
