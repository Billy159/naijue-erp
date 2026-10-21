import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { requestAssetPath, contentType, createStaticResponder, parsePort } from '../server.mjs';
test('explicit request paths and MIME fail closed', () => {
  for (const target of ['//outside/x.js', '/chunks%2fa.js', '/chunks%5ca.js', '/..%2foutside.js', '/%2e%2e/outside.js', '/chunks/../acceptance.js', '/chunks/%252e%252e/outside.js', '/a\\b.js', '/%00.js', '/.secret.json', '/acceptance.js?v=1', 'http://127.0.0.1/a.js', '/bad%zz.js', '/noextension', '/a.svg']) assert.equal(requestAssetPath(target), null, target);
  assert.equal(requestAssetPath('/'), 'index.html'); assert.equal(requestAssetPath('/chunks/action-ABC123.js'), 'chunks/action-ABC123.js');
  assert.equal(contentType('x.js'), 'text/javascript; charset=utf-8'); assert.equal(contentType('x.css'), 'text/css; charset=utf-8'); assert.equal(contentType('x.svg'), null);
  assert.equal(parsePort(['--port', '0']), 0); assert.equal(parsePort(['--port', '54321']), 54321);
  for (const args of [[], ['--port','80'], ['--port','65536'], ['--port','-1'], ['--port','01234'], ['--host','0.0.0.0']]) assert.throws(() => parsePort(args));
});
test('read-only static responder denies traversal and all symlinks without a listener', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'acceptance-static-'));
  try {
    const root = path.join(temporary, 'public'); await mkdir(path.join(root, 'chunks'), { recursive: true });
    await writeFile(path.join(root, 'index.html'), 'synthetic page'); await writeFile(path.join(root, 'chunks/a.js'), 'export{};');
    await writeFile(path.join(temporary, 'outside.js'), 'never expose');
    await symlink(path.join(temporary, 'outside.js'), path.join(root, 'escape.js'));
    await symlink(path.join(root, 'chunks/a.js'), path.join(root, 'inside.js'));
    await symlink(temporary, path.join(root, 'link'));
    await symlink(root, path.join(temporary, 'linked-root'));
    await assert.rejects(createStaticResponder(path.join(temporary, 'linked-root')), /symlink/);
    const respond = await createStaticResponder(root);
    const invoke = async (method, url, host = '127.0.0.1:45678') => {
      const result = { status: null, headers: {}, body: null, destroyed: false };
      const response = { headersSent: false, writeHead(status, headers) { result.status = status; result.headers = headers; this.headersSent = true; }, end(data) { result.body = data; }, destroy() { result.destroyed = true; } };
      await respond({ method, url, headers: { host } }, response); return result;
    };
    const page = await invoke('GET', '/'); assert.equal(page.status, 200); assert.equal(String(page.body), 'synthetic page');
    assert.match(page.headers['Content-Security-Policy'], /connect-src 'none'/); assert.equal(page.headers['X-Content-Type-Options'], 'nosniff');
    const head = await invoke('HEAD', '/chunks/a.js'); assert.equal(head.status, 200); assert.equal(head.body, undefined); assert.equal(head.headers['Content-Length'], 9);
    assert.equal((await invoke('POST', '/')).status, 405); assert.equal((await invoke('GET', '/', 'external.example')).status, 421);
    assert.equal((await invoke('GET', '/%2e%2e/outside.js')).status, 400);
    for (const url of ['/escape.js', '/inside.js', '/link/outside.js']) assert.equal((await invoke('GET', url)).status, 403, url);
    assert.equal((await invoke('GET', '/absent.js')).status, 404);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
