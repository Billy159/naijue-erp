import { createHash } from 'node:crypto';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export class ReleaseError extends Error {
  constructor(code) { super(code); this.name = 'ReleaseError'; this.code = code; }
}
export function requireRelease(condition, code) { if (!condition) throw new ReleaseError(code); }
const hashPattern = /^[a-f0-9]{64}$/;
const excludedSegment = /(?:^|[-_.])(?:synthetic[^/]*|fixtures?[^/]*|tests?|test-only|secrets?|private|credentials?|passwords?|tokens?|backups?|originals?|product-media|media|provenance)(?:$|[-_.])/i;
const excludedGraph = /(?:unified-browser-harness|new-document-browser-harness|management-browser-harness|visual-acceptance-host|development-host|local-https-application-host|fixturegraph)/i;
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.json', '.sql', '.svg', '.woff', '.woff2']);
const roleExtensions = {
  frontend: new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.woff', '.woff2']),
  backend: new Set(['.js', '.mjs', '.cjs', '.json']),
  migration: new Set(['.sql']),
  metadata: new Set(['.json']),
  evidence: new Set(['.json']),
};
export function relativeName(value, allowDot = false) {
  requireRelease(typeof value === 'string' && value.length <= 1024 && (allowDot && value === '.'
    || value.length > 0 && !value.startsWith('/') && !/[\\\x00-\x20\x7f:]/.test(value)
      && value.split('/').every(part => part.length > 0 && part !== '.' && part !== '..' && !part.startsWith('.'))), 'UNSAFE_RELATIVE_PATH');
  return value;
}
function allowedSource(value) {
  relativeName(value);
  const segments = value.split('/');
  // Media/secret *data* directories are forbidden; runtime source named controlled-media.ts is legitimate code.
  requireRelease(!excludedGraph.test(value) && !segments.some((part, index) => excludedSegment.test(part)
    && !(index === segments.length - 1 && /\.(?:tsx?|[cm]?js)$/.test(part) && !/synthetic|fixture|(?:^|[.-])test(?:[.-]|$)/i.test(part)))
    && ( /\.(?:tsx?|[cm]?js)$/.test(value) || !/(?:^|[\/._-])(?:keys?|pem|pgpass|env)(?:$|[\/._-])/i.test(value))
    && !/\.(?:test|spec)\.[^.]+$/i.test(value) && sourceExtensions.has(path.posix.extname(value)), 'NON_PRODUCTION_SOURCE');
}
export function allowedMember(value, role) {
  relativeName(value);
  requireRelease(Object.hasOwn(roleExtensions, role) && roleExtensions[role].has(path.posix.extname(value))
    && !value.split('/').some(part => excludedSegment.test(part) || part === 'node_modules')
    && !/(?:^|[\/._-])(?:keys?|pem|pgpass|env)(?:$|[\/._-])/i.test(value)
    && !excludedGraph.test(value) && !/\.(?:test|spec)\.[^.]+$/i.test(value), 'NON_RELEASE_MEMBER');
  requireRelease(role === 'frontend' ? value.startsWith('web/')
    : role === 'backend' ? value.startsWith('backend/')
      : role === 'migration' ? /^migrations\/[0-9]{4}_[A-Za-z0-9_-]+\.sql$/.test(value)
        : role === 'metadata' ? ['package.json', 'package-lock.json'].includes(value)
          : /^(?:(?:frontend|backend)-)?metafile\.json$|^production-build\.json$/.test(path.posix.basename(value)), 'MEMBER_ROLE_PATH_MISMATCH');
}
export async function canonicalAbsolute(value, type) {
  requireRelease(typeof value === 'string' && path.isAbsolute(value) && path.normalize(value) === value, 'EXPLICIT_CANONICAL_ABSOLUTE_PATH_REQUIRED');
  // Check every existing ancestor rather than letting realpath silently traverse a link.
  const parts = value.split(path.sep).filter(Boolean); let current = path.parse(value).root;
  for (const part of parts) {
    current = path.join(current, part);
    const info = await lstat(current);
    requireRelease(!info.isSymbolicLink(), 'SYMLINK_FORBIDDEN');
  }
  const info = await lstat(value);
  requireRelease(type === 'directory' ? info.isDirectory() : info.isFile(), 'REGULAR_PATH_REQUIRED');
  requireRelease(await realpath(value) === value, 'CANONICAL_PATH_REQUIRED');
  return value;
}
export async function boundedFile(root, name, limit = 64 * 1024 * 1024) {
  relativeName(name);
  const filename = path.join(root, name);
  await canonicalAbsolute(filename, 'file');
  const info = await lstat(filename);
  requireRelease(info.nlink === 1 && info.size <= limit, 'FILE_LINK_OR_SIZE_LIMIT');
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    requireRelease(opened.dev === info.dev && opened.ino === info.ino, 'INPUT_CHANGED_WHILE_READING');
    const bytes = await handle.readFile(), after = await lstat(filename);
    requireRelease(bytes.length === info.size && info.dev === after.dev && info.ino === after.ino
      && info.size === after.size && info.mtimeMs === after.mtimeMs && !after.isSymbolicLink(), 'INPUT_CHANGED_WHILE_READING');
    return bytes;
  } finally { await handle.close(); }
}
export async function readJson(filename) {
  await canonicalAbsolute(filename, 'file');
  const bytes = await boundedFile(path.dirname(filename), path.basename(filename), 32 * 1024 * 1024);
  let value;
  try { value = JSON.parse(bytes); } catch { throw new ReleaseError('INVALID_MANIFEST_JSON'); }
  requireRelease(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_MANIFEST_OBJECT');
  return { value, bytes, sha256: sha256(bytes) };
}
export function checkedRecord(record) {
  requireRelease(record && typeof record === 'object' && !Array.isArray(record)
    && Number.isSafeInteger(record.bytes) && record.bytes >= 0 && hashPattern.test(record.sha256), 'INVALID_FILE_RECORD');
  relativeName(record.path);
  return record;
}
export function matches(bytes, record) {
  requireRelease(bytes.length === record.bytes && sha256(bytes) === record.sha256, 'FILE_HASH_MISMATCH');
}
export async function walkFiles(root) {
  const files = [];
  async function walk(directory, prefix) {
    for (const name of (await readdir(directory)).sort()) {
      const relative = prefix + name;
      relativeName(relative);
      const info = await lstat(path.join(directory, name));
      requireRelease(!info.isSymbolicLink(), 'SYMLINK_FORBIDDEN');
      if (info.isDirectory()) await walk(path.join(directory, name), relative + '/');
      else { requireRelease(info.isFile() && info.nlink === 1, 'REGULAR_UNLINKED_MEMBER_REQUIRED'); files.push(relative); }
      requireRelease(files.length <= 10000, 'MEMBER_COUNT_LIMIT');
    }
  }
  await walk(root, ''); return files;
}
const sameSet = (left, right) => left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
function checkIdentity(source, build) {
  requireRelease(source.format === 'naijue-release-source-v1' && build.format === 'naijue-release-build-v1', 'MANIFEST_FORMAT_REQUIRED');
  requireRelease(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(source.buildId ?? '') && /^[a-f0-9]{40}$/.test(source.sourceCommit ?? ''), 'EXACT_BUILD_IDENTITY_REQUIRED');
  requireRelease(source.buildId === build.buildId && source.sourceCommit === build.sourceCommit, 'SOURCE_BUILD_IDENTITY_MISMATCH');
}
function indexRecords(records) {
  requireRelease(Array.isArray(records) && records.length > 0 && records.length <= 10000, 'FINITE_FILE_MANIFEST_REQUIRED');
  const result = new Map();
  for (const row of records) { checkedRecord(row); requireRelease(!result.has(row.path), 'DUPLICATE_FILE_RECORD'); result.set(row.path, row); }
  return result;
}
function graphPath(root, workingDirectory, name) {
  requireRelease(typeof name === 'string' && name.length > 0 && name.length <= 4096
    && !/[\\\x00-\x1f\x7f]/.test(name) && !name.startsWith('<'), 'INVALID_BUILD_GRAPH_PATH');
  const absolute = path.resolve(root, workingDirectory, name);
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  relativeName(relative); return relative;
}
function scanPublicBytes(bytes, name) {
  const text = bytes.toString('utf8');
  requireRelease(!/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|postgres(?:ql)?:\/\/[^\s/@:]+:[^\s/@]+@/i.test(text), 'SECRET_MATERIAL_FORBIDDEN');
  if (name.endsWith('.json')) {
    let value; try { value = JSON.parse(text); } catch { throw new ReleaseError('INVALID_PACKAGED_JSON'); }
    const inspect = object => {
      if (!object || typeof object !== 'object') return;
      for (const [key, item] of Object.entries(object)) {
        requireRelease(!/^(?:password|secret|token|api[-_]?key|access[-_]?token|refresh[-_]?token|private[-_]?key)$/i.test(key)
          || item === null || item === '', 'SECRET_MATERIAL_FORBIDDEN');
        inspect(item);
      }
    };
    inspect(value);
  }
}
function dependencyName(specifier) { return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]; }
const nodeBuiltins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));

/** Parse the generated entry's explicit HTML subset; never silently skip alternate resource-attribute syntax. */
function htmlResources(html) {
  const allowed = { html: ['lang'], head: [], meta: ['charset', 'name', 'content'], title: [], link: ['rel', 'href'],
    body: [], div: ['id'], noscript: [], script: ['id', 'type', 'src'] };
  const resources = []; let cursor = 0, configurations = 0;
  while ((cursor = html.indexOf('<', cursor)) !== -1) {
    if (html.startsWith('<!--', cursor)) {
      const end = html.indexOf('-->', cursor + 4); requireRelease(end !== -1, 'UNSUPPORTED_HTML_SYNTAX'); cursor = end + 3; continue;
    }
    const rest = html.slice(cursor), doctype = rest.match(/^<!doctype\s+html\s*>/i), closing = rest.match(/^<\/[a-z][a-z0-9-]*\s*>/i);
    if (doctype || closing) { cursor += (doctype ?? closing)[0].length; continue; }
    const start = rest.match(/^<([a-z][a-z0-9-]*)/i); requireRelease(start, 'UNSUPPORTED_HTML_SYNTAX');
    const tag = start[1].toLowerCase(); requireRelease(Object.hasOwn(allowed, tag), 'UNSUPPORTED_HTML_ELEMENT');
    cursor += start[0].length; const attributes = new Map(); let selfClosing = false;
    while (true) {
      const whitespace = html.slice(cursor).match(/^\s*/)[0]; cursor += whitespace.length;
      if (html.startsWith('/>', cursor)) { selfClosing = true; cursor += 2; break; }
      if (html[cursor] === '>') { cursor++; break; }
      requireRelease(whitespace.length > 0, 'UNSUPPORTED_HTML_ATTRIBUTE_SYNTAX');
      const nameMatch = html.slice(cursor).match(/^[a-z_:][a-z0-9_:.-]*/i); requireRelease(nameMatch, 'UNSUPPORTED_HTML_ATTRIBUTE_SYNTAX');
      const name = nameMatch[0].toLowerCase(); cursor += nameMatch[0].length;
      requireRelease(allowed[tag].includes(name) && !attributes.has(name), 'UNSUPPORTED_OR_DUPLICATE_HTML_ATTRIBUTE');
      cursor += html.slice(cursor).match(/^\s*/)[0].length;
      requireRelease(html[cursor] === '=', 'UNSUPPORTED_HTML_ATTRIBUTE_SYNTAX'); cursor++;
      cursor += html.slice(cursor).match(/^\s*/)[0].length;
      const quote = html[cursor]; let value;
      if (quote === '"' || quote === "'") {
        const end = html.indexOf(quote, ++cursor); requireRelease(end !== -1, 'UNSUPPORTED_HTML_ATTRIBUTE_SYNTAX'); value = html.slice(cursor, end); cursor = end + 1;
      } else {
        const unquoted = html.slice(cursor).match(/^[^\s"'`=<>]+/); requireRelease(unquoted, 'UNSUPPORTED_HTML_ATTRIBUTE_SYNTAX');
        value = unquoted[0]; cursor += value.length;
      }
      requireRelease(!/[<>\x00-\x1f\x7f]/.test(value), 'UNSUPPORTED_HTML_ATTRIBUTE_SYNTAX'); attributes.set(name, value);
      if (name === 'src' || name === 'href') {
        requireRelease(value.length > 0 && !value.includes('&'), 'UNSUPPORTED_HTML_RESOURCE_ENCODING'); resources.push(value);
      }
    }
    if (tag === 'script') {
      requireRelease(!selfClosing, 'UNSUPPORTED_HTML_SCRIPT');
      const end = html.slice(cursor).match(/<\/script\s*>/i); requireRelease(end, 'UNSUPPORTED_HTML_SCRIPT');
      if (attributes.has('src')) requireRelease((!attributes.has('type') || attributes.get('type') === 'module')
        && html.slice(cursor, cursor + end.index).trim() === '', 'UNSUPPORTED_HTML_SCRIPT');
      else { configurations++; requireRelease(configurations === 1 && attributes.get('id') === 'naijue-erp-production-configuration'
        && attributes.get('type') === 'application/json', 'UNSUPPORTED_HTML_SCRIPT'); }
      cursor += end.index + end[0].length;
    }
  }
  requireRelease(configurations === 1, 'PRODUCTION_CONFIGURATION_REQUIRED'); return resources;
}

/** Verify actual on-disk graph inputs and outputs. No production:true flag is accepted as provenance. */
async function verifyGraph(kind, component, context) {
  const { sourceRoot, buildRoot, sources, files, fileBytes, packageJson, lock } = context;
  requireRelease(component && typeof component === 'object' && !Array.isArray(component), 'EXPLICIT_COMPONENT_GRAPH_REQUIRED');
  relativeName(component.workingDirectory, true); allowedSource(component.entrySource);
  requireRelease(kind === 'frontend' ? /^apps\/web\/src\/production-host\/entry\.(?:tsx?|mjs|js)$/.test(component.entrySource)
    : /^apps\/api\/src\/production[-A-Za-z0-9_]*\.(?:ts|mjs|js)$/.test(component.entrySource), 'PRODUCTION_ENTRY_SOURCE_REQUIRED');
  requireRelease(sources.has(component.entrySource), 'ENTRY_SOURCE_NOT_FROZEN');
  relativeName(component.metafile); relativeName(component.entryOutput);
  requireRelease(files.get(component.metafile)?.role === 'evidence' && files.get(component.entryOutput)?.role === kind, 'GRAPH_ARTIFACT_ROLES_REQUIRED');
  let graph;
  try { graph = JSON.parse(fileBytes.get(component.metafile)); } catch { throw new ReleaseError('INVALID_BUILD_METAFILE'); }
  requireRelease(graph && typeof graph.inputs === 'object' && !Array.isArray(graph.inputs)
    && typeof graph.outputs === 'object' && !Array.isArray(graph.outputs)
    && Object.keys(graph.inputs).length > 0 && Object.keys(graph.outputs).length > 0, 'ACTUAL_METAFILE_REQUIRED');
  const inputs = new Set();
  for (const [key, details] of Object.entries(graph.inputs)) {
    const relative = graphPath(sourceRoot, component.workingDirectory, key); allowedSource(relative);
    const record = sources.get(relative);
    requireRelease(record && details && details.bytes === record.bytes && !inputs.has(relative), 'GRAPH_INPUT_NOT_FROZEN');
    if (relative.startsWith('node_modules/')) {
      const name = dependencyName(relative.slice('node_modules/'.length));
      requireRelease(lock.packages?.[`node_modules/${name}`], 'DEPENDENCY_INPUT_NOT_LOCKED');
    }
    inputs.add(relative);
    requireRelease(Array.isArray(details.imports), 'GRAPH_INPUT_IMPORTS_REQUIRED');
    for (const item of details.imports) {
      requireRelease(item && typeof item.path === 'string' && !excludedGraph.test(item.path), 'NON_PRODUCTION_GRAPH_IMPORT');
      if (!item.external) {
        const imported = graphPath(sourceRoot, component.workingDirectory, item.path);
        allowedSource(imported);
        requireRelease(Object.hasOwn(graph.inputs, item.path) || Object.keys(graph.inputs).some(candidate => graphPath(sourceRoot, component.workingDirectory, candidate) === imported), 'UNRESOLVED_GRAPH_INPUT');
      } else requireRelease(kind === 'backend' && (nodeBuiltins.has(item.path)
        || Object.hasOwn(packageJson.dependencies ?? {}, dependencyName(item.path))), 'UNDECLARED_EXTERNAL_DEPENDENCY');
    }
  }
  requireRelease(inputs.has(component.entrySource), 'ENTRY_MISSING_FROM_ACTUAL_GRAPH');
  const explicitInputs = indexRecords(component.inputs);
  requireRelease(sameSet([...explicitInputs.keys()], [...inputs]), 'ACTUAL_INPUT_SET_MISMATCH');
  for (const [name, record] of explicitInputs) {
    const original = sources.get(name);
    requireRelease(record.bytes === original.bytes && record.sha256 === original.sha256, 'COMPONENT_SOURCE_HASH_MISMATCH');
  }
  const outputs = new Map(); let entrySeen = false;
  const workingAbsolute = path.resolve(sourceRoot, component.workingDirectory);
  for (const [name, details] of Object.entries(graph.outputs)) {
    const absolute = path.resolve(workingAbsolute, name);
    const relative = path.relative(buildRoot, absolute).split(path.sep).join('/'); relativeName(relative);
    requireRelease(files.get(relative)?.role === kind && !outputs.has(relative) && details && details.bytes === files.get(relative).bytes
      && details.inputs && typeof details.inputs === 'object' && !Array.isArray(details.inputs), 'GRAPH_OUTPUT_NOT_PACKAGED');
    for (const input of Object.keys(details.inputs)) requireRelease(inputs.has(graphPath(sourceRoot, component.workingDirectory, input)), 'UNKNOWN_OUTPUT_INPUT');
    if (details.entryPoint !== undefined) {
      const entry = graphPath(sourceRoot, component.workingDirectory, details.entryPoint);
      requireRelease(inputs.has(entry), 'UNFROZEN_OUTPUT_ENTRY');
      if (relative === component.entryOutput) { requireRelease(entry === component.entrySource, 'ENTRY_OUTPUT_SOURCE_MISMATCH'); entrySeen = true; }
    }
    requireRelease(Array.isArray(details.imports), 'GRAPH_OUTPUT_IMPORTS_REQUIRED'); outputs.set(relative, details);
  }
  requireRelease(entrySeen, 'PRODUCTION_ENTRY_OUTPUT_REQUIRED');
  for (const [name, details] of outputs) {
    for (const item of details.imports) {
      requireRelease(item && typeof item.path === 'string', 'INVALID_OUTPUT_IMPORT');
      if (item.external) requireRelease(kind === 'backend' && (nodeBuiltins.has(item.path)
        || Object.hasOwn(packageJson.dependencies ?? {}, dependencyName(item.path))), 'UNDECLARED_EXTERNAL_DEPENDENCY');
      else {
        const candidates = [path.resolve(workingAbsolute, item.path), path.resolve(buildRoot, path.dirname(name), item.path)]
          .map(value => path.relative(buildRoot, value).split(path.sep).join('/'));
        requireRelease(candidates.some(candidate => outputs.has(candidate)), 'OUTPUT_IMPORT_OUTSIDE_RELEASE');
      }
    }
    if (details.cssBundle) {
      const css = path.relative(buildRoot, path.resolve(workingAbsolute, details.cssBundle)).split(path.sep).join('/');
      requireRelease(outputs.has(css), 'CSS_OUTPUT_OUTSIDE_RELEASE');
    }
  }
  for (const [name, record] of files) {
    if (record.role !== kind || outputs.has(name)) continue;
    // JS/CSS must be emitted by the actual graph. Only explicit exact copies and generated data/HTML may supplement it.
    requireRelease(!/\.(?:[cm]?js|css)$/.test(name), 'EXECUTABLE_OUTPUT_MISSING_FROM_GRAPH');
    if (record.sourcePath) {
      requireRelease(sources.has(record.sourcePath), 'COPY_SOURCE_NOT_FROZEN');
      matches(fileBytes.get(name), sources.get(record.sourcePath));
    } else {
      requireRelease(Array.isArray(record.producerInputs) && record.producerInputs.length > 0
        && record.producerInputs.every(input => sources.has(input) && /\.(?:mjs|js|ts)$/.test(input)), 'GENERATED_OUTPUT_PRODUCER_REQUIRED');
    }
  }
  return { entrySource: component.entrySource, entryOutput: component.entryOutput, metafileSha256: files.get(component.metafile).sha256,
    inputs: [...explicitInputs.values()].sort((a, b) => a.path.localeCompare(b.path)), outputs: [...outputs.keys()].sort() };
}

export async function validateRelease({ sourceManifest, buildManifest, buildRoot }) {
  const sourceRead = await readJson(sourceManifest), buildRead = await readJson(buildManifest);
  const source = sourceRead.value, build = buildRead.value; checkIdentity(source, build);
  const sourceRoot = await canonicalAbsolute(source.sourceRoot, 'directory');
  await canonicalAbsolute(buildRoot, 'directory');
  const sources = indexRecords(source.files), files = indexRecords(build.files);
  requireRelease(sources.has('package.json') && sources.has('package-lock.json'), 'LOCKED_PACKAGE_SOURCES_REQUIRED');
  let total = 0; const sourceBytes = new Map();
  for (const [name, record] of sources) {
    allowedSource(name); const bytes = await boundedFile(sourceRoot, name); matches(bytes, record); sourceBytes.set(name, bytes);
    total += bytes.length; requireRelease(total <= 512 * 1024 * 1024, 'SOURCE_SIZE_LIMIT');
  }
  let packageJson, lock;
  try { packageJson = JSON.parse(sourceBytes.get('package.json')); lock = JSON.parse(sourceBytes.get('package-lock.json')); }
  catch { throw new ReleaseError('INVALID_RUNTIME_LOCK'); }
  requireRelease(packageJson.private === true && packageJson.type === 'module' && lock.lockfileVersion >= 3
    && lock.packages?.[''] && JSON.stringify(lock.packages[''].dependencies ?? {}) === JSON.stringify(packageJson.dependencies ?? {}), 'PACKAGE_LOCK_IDENTITY_MISMATCH');
  const fileBytes = new Map(), members = new Set(); total = 0;
  for (const [name, record] of files) {
    allowedMember(name, record.role);
    if (record.role === 'evidence') requireRelease(record.member === null, 'EVIDENCE_MUST_NOT_SHIP');
    else {
      allowedMember(record.member, record.role);
      // Preserve emitted relative-import and CSS paths; a manifest cannot rename a graph member after the build.
      requireRelease(record.member === name, 'MEMBER_RELOCATION_FORBIDDEN');
      requireRelease(!members.has(record.member) && record.member !== 'release-manifest.json', 'DUPLICATE_PACKAGE_MEMBER'); members.add(record.member);
    }
    if (record.sourcePath) { allowedSource(record.sourcePath); requireRelease(sources.has(record.sourcePath), 'MEMBER_SOURCE_NOT_FROZEN'); }
    const bytes = await boundedFile(buildRoot, name); matches(bytes, record);
    if (record.role !== 'evidence') scanPublicBytes(bytes, record.member);
    fileBytes.set(name, bytes); total += bytes.length; requireRelease(total <= 256 * 1024 * 1024, 'BUILD_SIZE_LIMIT');
    if (record.role === 'metadata' || record.role === 'migration') {
      requireRelease(record.sourcePath && (record.role !== 'metadata' || record.sourcePath === record.member), 'DIRECT_SOURCE_PROVENANCE_REQUIRED');
      if (record.role === 'migration') requireRelease(/^adapters\/postgres\/migrations\/[0-9]{4}_[A-Za-z0-9_-]+\.sql$/.test(record.sourcePath)
        && path.posix.basename(record.sourcePath) === path.posix.basename(record.member), 'MIGRATION_SOURCE_IDENTITY_MISMATCH');
      matches(bytes, sources.get(record.sourcePath));
    }
  }
  requireRelease(sameSet(await walkFiles(buildRoot), [...files.keys()]), 'UNLISTED_BUILD_MEMBERS');
  requireRelease(members.has('package.json') && members.has('package-lock.json'), 'RUNTIME_PACKAGE_AND_LOCK_REQUIRED');
  const sourceMigrations = [...sources.keys()].filter(name => name.startsWith('adapters/postgres/migrations/'));
  requireRelease(sourceMigrations.length > 0 && sameSet(sourceMigrations, [...files.values()].filter(row => row.role === 'migration').map(row => row.sourcePath)), 'MIGRATION_SET_INCOMPLETE');
  const diskMigrations = (await walkFiles(path.join(sourceRoot, 'adapters/postgres/migrations'))).map(name => 'adapters/postgres/migrations/' + name);
  requireRelease(sameSet(sourceMigrations, diskMigrations), 'SOURCE_MIGRATION_DIRECTORY_INCOMPLETE');
  const context = { sourceRoot, buildRoot, sources, files, fileBytes, packageJson, lock };
  const frontend = await verifyGraph('frontend', build.components?.frontend, context);
  const backend = await verifyGraph('backend', build.components?.backend, context);
  const htmlRecord = [...files.values()].find(row => row.member === 'web/index.html' && row.role === 'frontend');
  requireRelease(htmlRecord, 'PRODUCTION_HTML_REQUIRED');
  const html = fileBytes.get(htmlRecord.path).toString('utf8');
  requireRelease(html.includes('id="naijue-erp-production-configuration"') && !excludedGraph.test(html)
    && !/synthetic|fixturegraph|TEST ONLY/i.test(html), 'PRODUCTION_HTML_IDENTITY_REQUIRED');
  const backendMember = files.get(build.components.backend.entryOutput).member;
  const frontendMember = files.get(build.components.frontend.entryOutput).member;
  const configurationMatch = html.match(/<script\s+id="naijue-erp-production-configuration"\s+type="application\/json">([^]*?)<\/script>/);
  let configuration;
  try { configuration = JSON.parse(configurationMatch?.[1]).configuration; } catch { throw new ReleaseError('PRODUCTION_CONFIGURATION_REQUIRED'); }
  requireRelease(configuration?.kind === 'naijue-erp-production-host' && configuration.http?.origin === 'https://1n5635n614.goho.co'
    && configuration.http?.basePath === '/api' && configuration.session?.verifyOnMount === true
    && /^\/assets\/(?:[A-Za-z0-9_-]+\/)*$/.test(configuration.assets?.basePath ?? ''), 'PRODUCTION_CONFIGURATION_REQUIRED');
  const assetsOrigin = new URL(configuration.assets.basePath, configuration.http.origin).href;
  let frontendScriptSeen = false;
  for (const resource of htmlResources(html)) {
    requireRelease(resource.startsWith(assetsOrigin), 'HTML_RESOURCE_OUTSIDE_RELEASE');
    const member = 'web/' + resource.slice(assetsOrigin.length);
    relativeName(member); requireRelease(members.has(member), 'HTML_RESOURCE_OUTSIDE_RELEASE');
    if (member === frontendMember) frontendScriptSeen = true;
  }
  requireRelease(frontendScriptSeen, 'PRODUCTION_SCRIPT_NOT_REFERENCED');
  return { sourceRoot, files, fileBytes, manifest: { format: 'naijue-release-v1', buildId: source.buildId, sourceCommit: source.sourceCommit,
    sourceManifestSha256: sourceRead.sha256, buildManifestSha256: buildRead.sha256, publicOrigin: 'https://1n5635n614.goho.co', apiPrefix: '/api',
    entrypoints: { frontend: 'web/index.html', frontendModule: frontendMember, backend: backendMember }, graphs: { frontend, backend },
    members: [...files.values()].filter(row => row.role !== 'evidence').map(row => ({ path: row.member, bytes: row.bytes, sha256: row.sha256, role: row.role,
      ...(row.sourcePath ? { sourcePath: row.sourcePath } : {}) })).sort((a, b) => a.path.localeCompare(b.path)) } };
}
