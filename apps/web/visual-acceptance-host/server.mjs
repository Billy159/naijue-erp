/** Independent SYNTHETIC ONLY static UI-test host. Node built-ins, no app/API/DB imports. */
import { createServer } from 'node:http';
import { constants } from 'node:fs';
import { open, lstat, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const MIME = Object.freeze({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' });
export function requestAssetPath(target) {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//') || target.includes('?') || target.includes('#') || target.length > 2048 || /%(?:2f|5c)/i.test(target)) return null;
  let decoded;
  try { decoded = decodeURIComponent(target); } catch { return null; }
  if (/[\\\u0000-\u001f\u007f%]/.test(decoded) || decoded.includes('//')) return null;
  const segments = decoded.slice(1).split('/');
  if (segments.some(segment => segment === '.' || segment === '..' || segment.startsWith('.'))) return null;
  const relative = decoded === '/' ? 'index.html' : decoded.slice(1);
  if (!/^[A-Za-z0-9_/-]+\.(?:html|js|css|json|txt)$/.test(relative)) return null;
  return relative;
}
export function contentType(filename) { return MIME[path.extname(filename)] ?? null; }
const inside = (root, target) => target.startsWith(root + path.sep);
/** Pure construction; never starts a listener. All paths remain inside one fixed asset root. */
export async function createStaticResponder(assetRoot) {
  if ((await lstat(assetRoot)).isSymbolicLink()) throw new TypeError('A symlink cannot be the static asset root.');
  const root = await realpath(assetRoot);
  if (!(await lstat(root)).isDirectory()) throw new TypeError('A static asset directory is required.');
  return async (request, response) => {
    const headers = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'" };
    const finish = (status, message, extra = {}) => { response.writeHead(status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', ...extra }); response.end(request.method === 'HEAD' ? undefined : message); };
    if (request.method !== 'GET' && request.method !== 'HEAD') return finish(405, 'Read-only static host.\n', { Allow: 'GET, HEAD' });
    // Reject cross-origin requests/rebinding. The browser must use the printed loopback URL.
    if (!/^127\.0\.0\.1(?::\d{1,5})?$/.test(request.headers.host ?? '')) return finish(421, 'Use the printed loopback URL.\n');
    const relative = requestAssetPath(request.url);
    if (!relative || !contentType(relative)) return finish(400, 'Invalid static asset path.\n');
    const candidate = path.resolve(root, relative);
    if (!inside(root, candidate)) return finish(403, 'Static asset denied.\n');
    let file;
    try {
      // Deny every symlink component, even links currently pointing inside the root.
      let current = root;
      for (const segment of relative.split('/')) { current = path.join(current, segment); if ((await lstat(current)).isSymbolicLink()) return finish(403, 'Static symlinks are denied.\n'); }
      const resolved = await realpath(candidate);
      if (!inside(root, resolved)) return finish(403, 'Static asset denied.\n');
      file = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await file.stat();
      if (!stat.isFile()) return finish(404, 'Static asset not found.\n');
      const data = request.method === 'HEAD' ? null : await file.readFile();
      response.writeHead(200, { ...headers, 'Content-Type': contentType(relative), 'Content-Length': stat.size });
      response.end(data ?? undefined);
    } catch (error) {
      if (!response.headersSent) finish(error?.code === 'ELOOP' ? 403 : 404, 'Static asset not found.\n');
      else response.destroy();
    } finally { await file?.close(); }
  };
}
export function parsePort(args) {
  if (args.length !== 2 || args[0] !== '--port' || !/^(?:0|[1-9]\d{0,4})$/.test(args[1] ?? '')) throw new TypeError('Usage: node server.mjs --port 0|1024..65535');
  const port = Number(args[1]);
  if (port !== 0 && (port < 1024 || port > 65535)) throw new RangeError('Use an explicit non-privileged port or 0.');
  return port;
}
export async function startServer(port) {
  if (!Number.isInteger(port) || port !== 0 && (port < 1024 || port > 65535)) throw new TypeError('An explicit non-privileged port or 0 is required.');
  const assetRoot = fileURLToPath(new URL('./public/', import.meta.url));
  const manifest = JSON.parse(await readFile(path.join(assetRoot, 'manifest.json'), 'utf8'));
  if (manifest.purpose !== 'SYNTHETIC ONLY visual acceptance UI test' || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit)) throw new TypeError('A valid independently built acceptance manifest is required.');
  const responder = await createStaticResponder(assetRoot);
  const server = createServer((request, response) => { void responder(request, response).catch(() => response.destroy()); });
  server.requestTimeout = 10_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 1000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback address was assigned.');
  process.stdout.write(`SYNTHETIC ONLY | no login | no DB | no writes\nURL: http://127.0.0.1:${address.port}/\nGit HEAD at build: ${manifest.sourceCommit}\nHost working-tree changes at build: ${manifest.hostWorkingTreeChanges ? 'YES; host source is identified by the SHA-256 below, not that commit alone' : 'no'}\nSource SHA-256: ${manifest.sourceHash}\nStop: Ctrl+C (SIGINT)\n`);
  let stopping = false;
  const stop = () => { if (stopping) return; stopping = true; server.close(() => { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }); server.closeIdleConnections(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  return { server, stop };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await startServer(parsePort(process.argv.slice(2))); }
  catch (error) { process.stderr.write(`Acceptance static host did not start: ${error instanceof Error ? error.message : 'unknown failure'}\n`); process.exitCode = 1; }
}
