import './check-toolchain.mjs';
import {build} from 'vite';
import {transform} from 'esbuild';
import {readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync} from 'node:fs';
import {resolve, dirname, relative, posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {root, safeFile, fileRecords, writeJson, sha256} from './files.mjs';

// Preserve classic-script global names shared across files; ESM exports retain their names.
export async function compactPublicAsset(bytes, name) {
  if (!/\.(?:js|mjs|css)$/.test(name)) return bytes;
  const module = name.endsWith('.mjs');
  const result = await transform(bytes.toString('utf8'), {
    loader: name.endsWith('.css') ? 'css' : 'js',
    ...(module ? {format: 'esm'} : {}),
    minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: module,
    keepNames: !name.endsWith('.css'), charset: 'utf8', legalComments: 'inline',
    target: 'es2020', sourcemap: false, sourcefile: name,
  });
  return Buffer.from(result.code);
}

// This generated closure derives exclusively from the checked publication list.
// Keeping directory structure makes CSS URLs and relative module imports resolve
// within the same content-addressed release, including their existing query suffixes.
export function versionPublicAssets(web, expected, components = {}, routes = {}) {
  const logicalFiles = fileRecords(web);
  if (JSON.stringify(logicalFiles.map(f => f.path).sort()) !== JSON.stringify([...expected].sort())) {
    const paths = logicalFiles.map(f => f.path);
    throw new Error('Frontend output differs from the explicit publication list: ' + JSON.stringify({
      missing: expected.filter(path => !paths.includes(path)), unexpected: paths.filter(path => !expected.includes(path)),
    }));
  }
  const version = sha256(JSON.stringify({pipeline: 'versioned-static-shared-v2', files: logicalFiles, components, routes}));
  const prefix = `releases/${version}/`;
  const assets = {};
  const generated = [];
  for (const {path} of logicalFiles.filter(file => !file.path.endsWith('.html'))) {
    const target = prefix + path;
    mkdirSync(dirname(resolve(web, target)), {recursive: true});
    copyFileSync(safeFile(web, path), resolve(web, target));
    assets[path] = '/' + target;
    generated.push(target);
  }
  const config = JSON.stringify({version, assets, components, routes}).replace(/</g, '\\u003c');
  for (const {path} of logicalFiles.filter(file => file.path.endsWith('.html'))) {
    const source = readFileSync(safeFile(web, path), 'utf8');
    const changed = source.replace(/\b(src|href)=(['"])([^'"]+)\2/gi, (match, attribute, quote, value) => {
      // Navigation, API URLs, fragments, data URLs and external addresses are untouched.
      const resource = value.replace(/^\.\//, '').replace(/^\//, '').split(/[?#]/, 1)[0];
      if (!Object.hasOwn(assets, resource)) return match;
      return `${attribute}=${quote}${assets[resource]}${quote}`;
    });
    if (!/<head(?:\s[^>]*)?>/i.test(changed)) throw new Error(`HTML entry needs a head: ${path}`);
    writeFileSync(resolve(web, path), changed.replace(/<head(?:\s[^>]*)?>/i,
      head => `${head}<script>window.ERP_FRONTEND_RELEASE=${config};</script>`));
  }
  const compression = [];
  for (const path of [...expected, ...generated].filter(name => /\.(?:js|mjs|css|html)$/.test(name))) {
    const bytes = readFileSync(safeFile(web, path));
    const compressed = gzipSync(bytes, {level: 9});
    // Short text may compress poorly; nginx falls back to the verified identity file.
    if (compressed.length >= bytes.length) continue;
    writeFileSync(resolve(web, path + '.gz'), compressed);
    generated.push(path + '.gz');
    compression.push({path, identityBytes: bytes.length, gzipBytes: compressed.length});
  }
  const files = fileRecords(web);
  const allowed = [...expected, ...generated].sort();
  if (JSON.stringify(files.map(file => file.path).sort()) !== JSON.stringify(allowed)) {
    throw new Error('Generated frontend resource closure mismatch');
  }
  return {releaseVersion: version, assets, logicalFiles, generatedFiles: generated.sort(), compression, files};
}

// Only entrypoints in frontend-release.json may contribute to this graph. All
// emitted chunks/styles must be reachable from those entries, then the original
// exact-file publication check still applies to the entire web directory.
export function frontendGraphClosure(graph, entries) {
  const reachable = new Set(), visited = new Set(), components = {};
  function visit(key, styles) {
    if (!Object.hasOwn(graph, key)) throw new Error(`Missing module dependency: ${key}`);
    const node = graph[key];
    for (const file of [node.file, ...(node.css || []), ...(node.assets || [])]) {
      if (!file || file.includes('\\') || file.startsWith('/') || file.split('/').some(part => !part || part === '..')) throw new Error(`Invalid graph resource: ${file}`);
      reachable.add(file);
    }
    for (const file of node.css || []) styles.add(file);
    if (visited.has(key)) return;
    visited.add(key);
    for (const dependency of [...(node.imports || []), ...(node.dynamicImports || [])]) visit(dependency, styles);
  }
  function initialStyles(key, result = new Set(), seen = new Set()) {
    if (seen.has(key)) return result;
    seen.add(key);
    const node = graph[key];
    if (!node) throw new Error(`Missing style dependency: ${key}`);
    for (const file of node.css || []) result.add(file);
    for (const dependency of node.imports || []) initialStyles(dependency, result, seen);
    return result;
  }
  for (const entry of entries) {
    const key = entry.source.replace(/^frontend\//, '');
    const node = graph[key];
    if (!node?.isEntry || node.file !== entry.moduleOutput) throw new Error(`Entrypoint output differs from whitelist: ${entry.name}`);
    visit(key, new Set());
    const descriptor = {css: [...initialStyles(key)], facade: entry.facade || null};
    components[entry.moduleOutput] = descriptor;
    components[entry.output] = descriptor;
  }
  return {files: [...reachable].sort(), components};
}

function compatibilityLoader(entry, css) {
  const modulePath = posix.relative(posix.dirname(entry.output), entry.moduleOutput);
  // Old URLs remain valid asynchronous facades; standalone output uses the ESM
  // entry directly. Shared dependency code is never copied into these shims.
  return `(function(){var own=document.currentScript.src,base=new URL(own),styles=${JSON.stringify(css)};` +
    `var pending=window.ERP_COMPONENT_PROMISES||(window.ERP_COMPONENT_PROMISES={});` +
    `pending[${JSON.stringify(entry.name)}]=Promise.all(styles.map(function(path){var url=window.ERP_FRONTEND_RELEASE?.assets?.[path]||new URL('../'+path,base).href;return new Promise(function(resolve,reject){var link=document.createElement('link');link.rel='stylesheet';link.href=url;link.onload=resolve;link.onerror=function(){link.remove();reject(Error('组件样式加载失败'));};document.head.append(link);});})).then(function(){return import(new URL(${JSON.stringify(modulePath)},base).href);}).then(function(value){window.dispatchEvent(new CustomEvent('erp-component-ready',{detail:{name:${JSON.stringify(entry.name)}}}));return value;});` +
    `pending[${JSON.stringify(entry.name)}].catch(function(error){window.dispatchEvent(new CustomEvent('erp-component-error',{detail:{name:${JSON.stringify(entry.name)},message:error.message}}));});})();\n`;
}

async function buildComponentGraph(web, manifest) {
  const entries = manifest.entries;
  if (manifest.componentGraph !== 'shared-esm-v1' || !entries.length || new Set(entries.map(entry => entry.name)).size !== entries.length) throw new Error('Invalid shared component entry list');
  for (const entry of entries) {
    safeFile(root, entry.source);
    if (!/^assets\/modules\/[a-z0-9-]+\.js$/.test(entry.moduleOutput) || !/^assets\/[a-z0-9-]+\.bundle\.js$/.test(entry.output)) throw new Error(`Invalid component output: ${entry.name}`);
  }
  const moduleOwners = new Map();
  let sharedModules = [];
  await build({
    configFile: false, root: resolve(root, 'frontend'),
    define: {'process.env.NODE_ENV': JSON.stringify('production')},
    resolve: {dedupe: ['react', 'react-dom', '@arco-design/web-react']},
    plugins: [{name: 'strict-shared-component-graph', generateBundle(_, bundle) {
      for (const [file, node] of Object.entries(bundle)) {
        if (node.type !== 'chunk') continue;
        for (const id of Object.keys(node.modules)) {
          if (id.includes('/frontend/assets/product-media/')) throw new Error('Private product media cannot enter public component graph');
          if (moduleOwners.has(id)) throw new Error(`Module emitted in multiple chunks: ${id}`);
          moduleOwners.set(id, file);
        }
      }
      sharedModules = [...moduleOwners].filter(([id]) => /\/node_modules\/(?:react|react-dom|@arco-design\/web-react)\//.test(id))
        .map(([id, file]) => ({module: relative(root, id).replaceAll('\\', '/'), file}));
    }}],
    build: {
      outDir: web, emptyOutDir: false, manifest: '.vite/component-manifest.json',
      minify: 'esbuild', cssMinify: 'esbuild', sourcemap: false, target: 'es2020',
      rollupOptions: {
        input: Object.fromEntries(entries.map(entry => [entry.name, safeFile(root, entry.source)])),
        preserveEntrySignatures: 'strict',
        output: {
          entryFileNames: chunk => entries.find(entry => entry.name === chunk.name).moduleOutput,
          chunkFileNames: 'assets/chunks/[name]-[hash].js', assetFileNames: 'assets/chunks/[name]-[hash][extname]',
        },
      },
    },
  });
  const graphPath = safeFile(web, '.vite/component-manifest.json');
  const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  const closure = frontendGraphClosure(graph, entries);
  const emitted = fileRecords(web).map(file => file.path).filter(path => !manifest.publicFiles.includes(path) && path !== '.vite/component-manifest.json').sort();
  if (JSON.stringify(emitted) !== JSON.stringify(closure.files)) throw new Error('Component graph contains unreachable or missing resources');
  writeJson(resolve(root, 'dist/frontend-component-graph.json'), {graph, ...closure, sharedModules, moduleDuplication: 0});
  rmSync(resolve(web, '.vite'), {recursive: true});
  for (const entry of entries) writeFileSync(resolve(web, entry.output), compatibilityLoader(entry, closure.components[entry.moduleOutput].css));
  return closure;
}

export async function buildFrontend() {
  const manifest = JSON.parse(readFileSync(resolve(root, 'config/frontend-release.json'), 'utf8'));
  const web = resolve(root, 'dist/web');
  rmSync(web, {recursive: true, force: true});
  mkdirSync(web, {recursive: true});
  try {
    for (const file of manifest.publicFiles) {
      const source = safeFile(resolve(root, 'frontend'), file);
      const dest = resolve(web, file);
      mkdirSync(dirname(dest), {recursive: true});
      writeFileSync(dest, await compactPublicAsset(readFileSync(source), file));
    }
    const closure = await buildComponentGraph(web, manifest);
    const expected = [...manifest.publicFiles, ...closure.files, ...manifest.entries.map(entry => entry.output)];
    if (new Set(expected).size !== expected.length) throw new Error('Duplicate path in frontend publication list');
    const routes = manifest.modernRoutes || {};
    for (const [route, descriptor] of Object.entries(routes)) {
      if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(route) || !manifest.entries.some(entry => entry.moduleOutput === descriptor.module)) throw new Error(`Modern route is outside the entry whitelist: ${route}`);
    }
    const publication = versionPublicAssets(web, expected, closure.components, routes);
    writeJson(resolve(root, 'dist/frontend-manifest.json'), {
      version: 3, ...publication, componentGraph: manifest.componentGraph, components: closure.components, entries: manifest.entries, privateMediaPublished: false,
      cachePolicy: {versionedAssets: 'public,max-age=31536000,immutable', entryAndUnversioned: 'no-store', api: 'no-store'},
    });
    console.log(`Frontend publication: ${manifest.entries.length} entries, release ${publication.releaseVersion}; private product media excluded`);
  } catch (error) {
    rmSync(web, {recursive: true, force: true});
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildFrontend();
