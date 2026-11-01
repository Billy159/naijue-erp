/** Static emitted graph only. No build, browser, page/network timer or PG. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {collectBundles} from './collect-bundles.mjs';
import {sha256} from './fixture-generator.mjs';
const fail=m=>{throw new TypeError(m);};
function relativeWithin(root,absolute){const r=path.relative(root,absolute).split(path.sep).join('/');if(!r||r.startsWith('../')||path.isAbsolute(r)||/[\\%\x00-\x1f]/.test(r))fail('Output escaped exact artifact directory');return r;}
/** esbuild output/import paths are cwd-relative, NOT uniformly importer-relative. */
export function normalizeOutputs(metafile,sourceRoot,artifactDirectory){
 if(!path.isAbsolute(sourceRoot)||!path.isAbsolute(artifactDirectory)||!metafile?.outputs||typeof metafile.outputs!=='object')fail('Exact absolute roots and raw metafile required');
 const names=new Map(),absolute=new Map(),graph={};
 for(const [key,value]of Object.entries(metafile.outputs)){
  if(/[\\%\x00-\x1f]/.test(key))fail('Unsafe emitted path');const file=path.resolve(sourceRoot,key),name=relativeWithin(artifactDirectory,file);if(Object.hasOwn(graph,name))fail('Duplicate normalized output');if(!Number.isSafeInteger(value.bytes)||value.bytes<0)fail('Actual emitted bytes required');
  names.set(key,name);absolute.set(name,file);graph[name]={...value,imports:[]};
 }
 function resolve(from,reference){
  if(typeof reference!=='string'||!reference||/[\\%\x00-\x1f]/.test(reference)||/^[a-z]+:/i.test(reference))fail('Unsafe output edge');
  if(names.has(reference))return names.get(reference);if(Object.hasOwn(graph,reference))return reference;
  const candidates=[path.resolve(sourceRoot,reference),path.resolve(path.dirname(absolute.get(from)),reference)];
  for(const target of candidates){const relative=path.relative(artifactDirectory,target).split(path.sep).join('/');if(Object.hasOwn(graph,relative))return relative;}
  fail('Missing emitted edge: '+reference);
 }
 for(const [key,value]of Object.entries(metafile.outputs)){
  const name=names.get(key);for(const edge of value.imports??[]){if(edge.external){graph[name].imports.push({...edge,path:edge.path,external:true});continue;}graph[name].imports.push({...edge,path:resolve(name,edge.path)});}
  if(value.cssBundle)graph[name].cssBundle=resolve(name,value.cssBundle);
 }
 return graph;
}
/** Count each static node once; retain but do NOT traverse dynamic/remote edges. */
export function staticClosure(graph,roots){
 if(!Array.isArray(roots)||!roots.length)fail('Explicit graph roots required');const seen=new Set(),dynamic=new Map(),external=new Map(),associatedCss=new Map();
 function visit(name){if(seen.has(name))return;const node=graph[name];if(!node)fail('Unknown or missing static root');seen.add(name);
  for(const edge of node.imports??[]){if(edge.external){external.set(name+'\0'+edge.path,{from:name,to:edge.path,kind:edge.kind});continue;}if(!graph[edge.path])fail('Missing static/dynamic emitted resource');if(edge.kind==='dynamic-import'){dynamic.set(name+'\0'+edge.path,{from:name,to:edge.path});continue;}visit(edge.path);}
  if(node.cssBundle){if(!graph[node.cssBundle])fail('Missing associated CSS output');associatedCss.set(name+'\0'+node.cssBundle,{from:name,to:node.cssBundle});}
 }roots.forEach(visit);
 return {files:[...seen].sort(),associatedCssBundles:[...associatedCss.values()].map(edge=>({...edge,explicitlyRequired:seen.has(edge.to)})),dynamicEdges:[...dynamic.values()].map(edge=>({...edge,alreadyStatic:seen.has(edge.to)})),externalEdges:[...external.values()]};
}
export function closureBytes(graph,closure,measuredFiles){
 const measured=new Map(measuredFiles.map(f=>[f.path,f]));let jsBytes=0,jsGzipBytes=0,cssBytes=0,cssGzipBytes=0,otherBytes=0;const inlineCss=[];
 for(const name of closure.files){const node=graph[name],f=measured.get(name);if(/\.(?:m?js|css)$/.test(name)){
   if(!f||f.bytes!==node.bytes||!Number.isSafeInteger(f.gzipBytes)||f.gzipBytes<0)fail('Missing/mismatched actual standardized gzip observation');
   if(name.endsWith('.css')){cssBytes+=f.bytes;cssGzipBytes+=f.gzipBytes;}else{jsBytes+=f.bytes;jsGzipBytes+=f.gzipBytes;for(const [input,value]of Object.entries(node.inputs??{}))if(input.endsWith('.css')&&value.bytesInOutput>0)inlineCss.push({output:name,input,bytesInOutput:value.bytesInOutput});}
  }else otherBytes+=node.bytes;
 }
 return {fileCount:closure.files.length,jsBytes,jsGzipBytes,cssBytes,cssGzipBytes,otherBytes,otherGzipBytes:otherBytes?null:0,inlineCssInJs:inlineCss,
  accounting:'Per-emitted-file standardized gzip sum, NOT actual wire compression. Inline CSS allocation is already in JS bytes: do not add it again. Other resource gzip unknown unless separately observed.'};
}
function entry(graph,source){const found=Object.entries(graph).filter(([,v])=>v.entryPoint===source).map(([name])=>name);if(found.length!==1)fail('Missing/ambiguous source entry: '+source);return found[0];}
const P='apps/web/demo-replica/frontend/runtime/';
export const ROUTE_SCOPES=Object.freeze({
 'detail-leaf':{shell:false,sources:[P+'products/detail-entry.tsx'],css:false},
 'editor-leaf':{shell:false,sources:[P+'products/editor-entry.tsx'],css:false},
 'detail-open-minimum':{shell:true,sources:[P+'products/detail-entry.tsx','apps/web/src/products/product-page-http-reader.ts'],css:true},
 'detail-with-barcode-scheme':{shell:true,sources:[P+'products/detail-entry.tsx','apps/web/src/products/product-page-http-reader.ts','apps/web/src/product-settings/size-groups/http-reader.ts'],css:true},
 'editor-open-minimum':{shell:true,sources:[P+'products/editor-entry.tsx','apps/web/src/products/product-maintenance-http-client.ts','apps/web/src/transport/product-http-reader.ts','apps/web/src/product-settings/size-groups/http-reader.ts','apps/web/src/products/product-page-http-reader.ts','apps/web/src/product-settings/colors/http-reader.ts',P+'common/source-helpers.tsx'],css:true},
 'editor-with-catalogue-maintenance':{shell:true,sources:[P+'products/editor-entry.tsx','apps/web/src/products/product-maintenance-http-client.ts','apps/web/src/transport/product-http-reader.ts','apps/web/src/product-settings/size-groups/http-reader.ts','apps/web/src/products/product-page-http-reader.ts','apps/web/src/product-settings/colors/http-reader.ts',P+'common/source-helpers.tsx',P+'catalogue/session.ts'],css:true},
});
export function productRouteRoots(graph,id,headCss){const spec=ROUTE_SCOPES[id];if(!spec)fail('Unknown reviewed product route scope');return [...(spec.shell?['application.js',...headCss]:[]),...spec.sources.map(s=>entry(graph,s)),...(spec.css?['source-styles/product-current.css']:[])];}
export function headStyles(html,graph){const found=[];for(const tag of html.match(/<link\b[^>]*>/g)??[]){const attrs=Object.fromEntries([...tag.matchAll(/([a-z-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));if(attrs.rel!=='stylesheet')continue;if(!attrs.href)fail('Stylesheet href absent');const pathname=new URL(attrs.href.replaceAll('&amp;','&'),'https://static-graph.invalid').pathname;const matches=Object.keys(graph).filter(name=>name.endsWith('.css')&&(pathname===name||pathname.endsWith('/'+name)));if(matches.length!==1)fail('Unknown/ambiguous HTML CSS resource');found.push(matches[0]);}return [...new Set(found)];}
export async function collectProductGraph({artifactDirectory,sourceRoot}){
 const bytes=await collectBundles({artifactDirectory,sourceRoot}),manifestRaw=await readFile(path.join(artifactDirectory,'production-build.json')),manifest=JSON.parse(manifestRaw),raw=await readFile(path.join(artifactDirectory,'metafile.json')),meta=JSON.parse(raw),graph=normalizeOutputs(meta,sourceRoot,artifactDirectory),html=await readFile(path.join(artifactDirectory,'index.html'),'utf8'),css=headStyles(html,graph);
 if(sha256(manifestRaw)!==bytes.buildSha256)fail('Build changed between byte/graph collection');
 const scopes={};for(const id of Object.keys(ROUTE_SCOPES)){const roots=productRouteRoots(graph,id,css),closure=staticClosure(graph,roots);scopes[id]={reviewedRoots:roots,closure,...closureBytes(graph,closure,bytes.files)};}
 const shell=staticClosure(graph,['application.js',...css]);
 const modules=[P+'products/detail.tsx',P+'products/editor-barcodes.tsx',P+'products/editor-draft-barcodes.tsx',P+'catalogue/entry.tsx',P+'common/ui/source-control.tsx'];
 const modulePlacement=modules.map(source=>({source,outputs:Object.entries(graph).filter(([,o])=>o.inputs?.[source]?.bytesInOutput>0).map(([name,o])=>({output:name,bytesInOutput:o.inputs[source].bytesInOutput,detailLeafStatic:scopes['detail-leaf'].closure.files.includes(name),editorLeafStatic:scopes['editor-leaf'].closure.files.includes(name)}))}));
 const cssInJs=Object.entries(graph).filter(([name])=>name.endsWith('.js')).flatMap(([name,o])=>Object.entries(o.inputs??{}).filter(([input,v])=>input.endsWith('.css')&&v.bytesInOutput>0).map(([input,v])=>({output:name,input,bytesInOutput:v.bytesInOutput})));
 return {format:'opt00-canonical-product-static-graph-v2',status:'MEASURED_EMITTED_STATIC_GRAPH_ONLY',candidateCommit:bytes.candidateCommit,candidateTree:bytes.candidateTree,node:bytes.node,buildSha256:bytes.buildSha256,metafileSha256:sha256(raw),sourceBinding:bytes.sourceBinding,sourceClosureSha256:bytes.sourceClosureSha256,configuration:manifest.configuration,
  routeCapabilityInThisBuiltConfig:manifest.configuration.routes.products??false,routeInterpretation:'Product flags are OFF in this synthetic public config. Emitted product module bytes are actual; route-open combinations below are source-reviewed capability graph scenarios, NOT actual page loading/network/first-click observations.',
  shell:{closure:shell,...closureBytes(graph,shell,bytes.files)},headStyles:css,scopes,modulePlacement,cssInJs,
  sourceReviewedDynamicRoots:'products/feature.ts lines40..85: fixed Promise.all readers/helpers plus conditional barcode-scheme dictionary/catalogue session. No dynamic edge is automatically counted as initial.',
  firstHeavyTabNetwork:null,firstHeavyTabReadyMs:null,actualColdNetworkBytes:null,buildWallTimePerformance:null,performanceVerdict:'PENDING_BROWSER_AND_BEFORE_AFTER_ACCEPTANCE',
  warning:'Leaf static JS gzip is not full page initial JS. Shared files deduplicate within each scope; leaf and shell totals cannot be naively added. esbuild cssBundle sibling associations are recorded separately, NOT counted as wired CSS unless independently required by an HTML/route root or actual CSS import. Inline CSS already included in JS. Source module placement does not prove actual tab network timing.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const a=process.argv.slice(2);if(a.length!==6||a[0]!=='--artifacts'||a[2]!=='--source'||a[4]!=='--out')fail('Use --artifacts ABS_FINISHED_CANONICAL --source ABS_PINNED_CANDIDATE --out ABS_FRESH_JSON');await writeFile(a[5],JSON.stringify(await collectProductGraph({artifactDirectory:a[1],sourceRoot:a[3]}),null,2)+'\n',{flag:'wx'});}
