/** Real loopback HTTPS/CA transport with synthetic Fastify routes/assets; NOT real PG or frontend acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mkdtemp, mkdir, writeFile, readFile, symlink, realpath } from "node:fs/promises";
import type { TLSSocket } from "node:tls";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { request } from "node:https";
import { startLocalHttpsApplicationHost } from "../../apps/api/src/local-https-application-host.ts";
import type { PostgresApplicationApi } from "../../apps/api/src/postgres-read-api.ts";

assert.equal(process.env.NAIJUE_LOCAL_HTTPS_TEST, "I_APPROVE_NEW_LOOPBACK_SYNTHETIC_TLS_ONLY", "Explicit real TLS test opt-in required before any fixture/listener");
async function port(): Promise<number> {
  const server = createTcpServer(); await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const value = address.port; await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); return value;
}
let fixture: Awaited<ReturnType<typeof makeFixture>> | undefined;
async function makeFixture() {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "naijue-https-fixture-")));
  const assets = path.join(directory, "build"); await mkdir(assets);
  await writeFile(path.join(assets, "index.html"), '<!doctype html><title>Synthetic TLS only</title><script type="module" src="/assets/application.js"></script>');
  await writeFile(path.join(assets, "application.js"), 'export const transportTestOnly = true;');
  await writeFile(path.join(assets, "metafile.json"), '{"SYNTHETIC_PROVENANCE":"must not be served"}');
  const configuration = path.join(directory, "tls.cnf");
  await writeFile(configuration, '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=127.0.0.1\n[ext]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n');
  execFileSync('/usr/bin/openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-config',configuration,
    '-keyout',path.join(directory,'key.pem'),'-out',path.join(directory,'cert.pem')], { stdio: 'ignore' });
  const tls = { key: await readFile(path.join(directory, "key.pem")), cert: await readFile(path.join(directory, "cert.pem")) };
  return { directory, assets, tls };
}
async function resources() { return fixture ??= await makeFixture(); }
async function api(p: number) {
  const app = Fastify({ logger: false }); let closes = 0, slowClosed = false;
  let entered!: () => void; const slowEntered = new Promise<void>(resolve => { entered = resolve; });
  app.get("/probe", async request => ({ path: request.url, actualTls: (request.raw.socket as TLSSocket).encrypted === true }));
  app.get("/slow", async (_request, reply) => {
    entered(); await new Promise<void>(resolve => reply.raw.once("close", () => { slowClosed = true; resolve(); }));
    return { closed: true };
  });
  await app.ready();
  const value: PostgresApplicationApi = { app, trustedOrigin: `https://127.0.0.1:${p}`, postgresBackgroundFailureCount: 0,
    async close() { closes++; await app.close(); } };
  return { value, counts: () => ({ closes, slowClosed }), slowEntered };
}
function get(origin: string, url: string, ca?: Buffer): Promise<{ status: number; body: string; type: string | undefined }> {
  return new Promise((resolve, reject) => {
    const req = request(new URL(url, origin), { ...(ca ? { ca } : {}), rejectUnauthorized: true }, res => {
      const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(Buffer.from(chunk))); res.once("error", reject);
      res.once("end", () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString(), type: res.headers["content-type"] }));
    }); req.once("error", reject); req.end();
  });
}
test("actual TLS host serves immutable build bytes, maps external/api to ready routes and validates explicit CA", async () => {
  const f = await resources(), p = await port(), a = await api(p);
  const host = await startLocalHttpsApplicationHost({ api: a.value, address: { host: "127.0.0.1", port: p }, tls: f.tls, assets: { root: f.assets, entry: "index.html" } });
  try {
    assert.equal(host.origin, a.value.trustedOrigin);
    await assert.rejects(get(host.origin, "/"), /self.signed|certificate/i);
    assert.equal((await get(host.origin, "/", f.tls.cert)).status, 200);
    const asset = await get(host.origin, "/assets/application.js", f.tls.cert); assert.equal(asset.status, 200); assert.match(asset.type!, /javascript/);
    await writeFile(path.join(f.assets, "application.js"), 'CHANGED_SYNTHETIC_DISK_FILE');
    assert.equal((await get(host.origin, "/assets/application.js", f.tls.cert)).body, asset.body, "Startup-captured bytes cannot be swapped later");
    const probe = await get(host.origin, "/api/probe?literal=unchanged", f.tls.cert); assert.deepEqual(JSON.parse(probe.body), { path: "/probe?literal=unchanged", actualTls: true });
    for (const url of ["/api/not-a-route", "/assets/metafile.json", "/assets/source/app.js", "/assets/incoming.js", "/assets/provenance.json", "/assets/key.pem", "/assets/%2e%2e/key.pem", "/api%2fprobe"]) {
      const response = await get(host.origin, url, f.tls.cert); assert.notEqual(response.status, 200, url); assert.doesNotMatch(response.body, /doctype|SYNTHETIC_PROVENANCE|BEGIN PRIVATE/i);
    }
  } finally { await host.close(); await host.close(); }
  assert.equal(a.counts().closes, 1);
});
test("TLS startup rejects mismatched captured origin and symlink assets, closing the supplied API once", async () => {
  const f = await resources();
  const p = await port(), a = await api(p);
  await assert.rejects(startLocalHttpsApplicationHost({ api: a.value, address: { host: "127.0.0.1", port: await port() }, tls: f.tls, assets: { root: f.assets, entry: "index.html" } }));
  assert.equal(a.counts().closes, 1);
  const root = path.join(f.directory, "linked-build"); await mkdir(root); await writeFile(path.join(root, "index.html"), "SYNTHETIC");
  await symlink(path.join(f.assets, "application.js"), path.join(root, "leak.js"));
  const b = await api(await port());
  await assert.rejects(startLocalHttpsApplicationHost({ api: b.value, address: { host: "127.0.0.1", port: Number(new URL(b.value.trustedOrigin).port) }, tls: f.tls, assets: { root, entry: "index.html" } }));
  assert.equal(b.counts().closes, 1);
});
test("TLS close terminates an in-flight response and returns listener/API ownership exactly once", async () => {
  const f = await resources(), p = await port(), a = await api(p);
  const host = await startLocalHttpsApplicationHost({ api: a.value, address: { host: "127.0.0.1", port: p }, tls: f.tls, assets: { root: f.assets, entry: "index.html" } });
  const pending = get(host.origin, "/api/slow", f.tls.cert).then(() => "completed", () => "closed");
  await a.slowEntered; await host.close(); assert.equal(await pending, "closed");
  assert.deepEqual(a.counts(), { closes: 1, slowClosed: true });
  await assert.rejects(get(host.origin, "/", f.tls.cert), /ECONNREFUSED/);
});
test("TLS host captures the listener address before asynchronous build capture", async () => {
  const f = await resources(), p = await port(), a = await api(p);
  const address = { host: "127.0.0.1" as const, port: p };
  const host = await startLocalHttpsApplicationHost({ api: a.value, address, tls: f.tls, assets: { root: f.assets, entry: "index.html" } });
  try {
    address.port = p === 65535 ? p - 1 : p + 1;
    assert.equal((await get(host.origin, "/api/probe", f.tls.cert)).status, 200, "Caller mutation cannot alter captured Host validation");
  } finally { await host.close(); }
});
test("occupied-port and malformed-TLS construction failures close the API without touching the existing listener", async () => {
  const f = await resources(), occupied = createTcpServer();
  await new Promise<void>((resolve, reject) => { occupied.once("error", reject); occupied.listen(0, "127.0.0.1", resolve); });
  const address = occupied.address(); assert.ok(address && typeof address === "object");
  const a = await api(address.port);
  try {
    await assert.rejects(startLocalHttpsApplicationHost({ api: a.value, address: { host: "127.0.0.1", port: address.port }, tls: f.tls,
      assets: { root: f.assets, entry: "index.html" } }), (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE");
    assert.equal(a.counts().closes, 1); assert.equal(occupied.listening, true);
  } finally { await new Promise<void>((resolve, reject) => occupied.close(e => e ? reject(e) : resolve())); }
  const p = await port(), b = await api(p);
  await assert.rejects(startLocalHttpsApplicationHost({ api: b.value, address: { host: "127.0.0.1", port: p },
    tls: { key: Buffer.from("MALFORMED_SYNTHETIC_KEY"), cert: f.tls.cert }, assets: { root: f.assets, entry: "index.html" } }));
  assert.equal(b.counts().closes, 1);
  await assert.rejects(get(b.value.trustedOrigin, "/", f.tls.cert), /ECONNREFUSED/);
});
test("API disposal failure remains explicit while the HTTPS listener is closed and repeated close reuses the failure", async () => {
  const f = await resources(), p = await port(), a = await api(p), cause = Error("SYNTHETIC_DISPOSAL_FAILURE");
  const value = { ...a.value, async close() { await a.value.close(); throw cause; } };
  const host = await startLocalHttpsApplicationHost({ api: value, address: { host: "127.0.0.1", port: p }, tls: f.tls,
    assets: { root: f.assets, entry: "index.html" } });
  const first = host.close(), second = host.close(); assert.equal(first, second);
  await assert.rejects(first, (error: AggregateError) => error instanceof AggregateError && error.errors.includes(cause));
  assert.equal(a.counts().closes, 1);
  await assert.rejects(get(host.origin, "/", f.tls.cert), /ECONNREFUSED/);
});
