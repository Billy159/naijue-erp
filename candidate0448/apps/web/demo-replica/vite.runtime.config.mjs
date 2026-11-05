import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {finalStyleSources} from './frontend/style-manifest.ts';
const root=path.dirname(fileURLToPath(import.meta.url)),frontend=path.join(root,'frontend'),modules=path.join(root,'node_modules');
const out=process.env.ERP_REPLICA_BUILD_OUT;if(!out||!path.isAbsolute(out))throw new Error('C must supply exact versioned output directory');
export default {root:frontend,publicDir:false,base:'/',define:{'process.env.NODE_ENV':JSON.stringify('production')},resolve:{dedupe:['react','react-dom','@arco-design/web-react'],alias:[{find:/^react$/,replacement:path.join(modules,'react')},{find:/^react\//,replacement:path.join(modules,'react')+'/'},{find:/^react-dom$/,replacement:path.join(modules,'react-dom')},{find:/^react-dom\//,replacement:path.join(modules,'react-dom')+'/'},{find:/^@arco-design\/web-react/,replacement:path.join(modules,'@arco-design/web-react')}]},build:{target:'es2022',outDir:out,emptyOutDir:false,manifest:true,cssCodeSplit:true,rollupOptions:{input:path.join(frontend,'runtime.html')}},plugins:[{name:'fixed-original-styles-and-module-graph',async generateBundle(_options,bundle){
 for(const [name,source] of Object.entries(finalStyleSources)){const css=name==='ui-tokens.css'?readFileSync(path.join(frontend,source)):(await build({entryPoints:[path.join(frontend,source)],bundle:true,write:false,logLevel:'warning'})).outputFiles[0].contents;this.emitFile({type:'asset',fileName:'source-styles/'+name,source:css});}
 for(const weight of [400,500,600,700])this.emitFile({type:'asset',fileName:'source-styles/assets/fonts/jakarta-'+weight+'.woff2',source:readFileSync(path.join(frontend,'assets/fonts/jakarta-'+weight+'.woff2'))});
 const chunks=Object.values(bundle).filter(x=>x.type==='chunk').map(x=>({file:x.fileName,isEntry:x.isEntry,imports:x.imports,dynamicImports:x.dynamicImports,modules:Object.keys(x.modules)}));this.emitFile({type:'asset',fileName:'runtime-build-graph.json',source:JSON.stringify({developmentRoot:'/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022/apps/web/demo-replica',fixedBuildInputRoot:root,chunks},null,2)});
}}]};
