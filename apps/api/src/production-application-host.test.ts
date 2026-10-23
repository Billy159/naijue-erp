import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PostgresApplicationApi } from "./postgres-read-api.ts";
import { createProductionRequestHandler, startProductionApplicationHost } from "./production-application-host.ts";
import { createProductionRuntime26RequestHandler, startProductionRuntime26ApplicationHost } from "./production-application-host.ts";
import { createProductionRuntime26R3RequestHandler, startProductionRuntime26R3ApplicationHost, createProductionRuntime26R2RequestHandler, startProductionRuntime26R2ApplicationHost } from "./production-application-host.ts";
import { PRODUCTION_PUBLIC_ORIGIN } from "./production-provider-composition.ts";
import type { ProductionRuntimeConfiguration } from "./production-provider-composition.ts";
import { runProductionMain, runProductionRuntime26Main, runProductionRuntime26R2Main, runProductionRuntime26R3Main } from "./production-main.ts";

function config(root: string): ProductionRuntimeConfiguration {
  return { schemaVersion: 1, profile: "source-confirmed-native-v1", documentCommands: "DISABLED", publicOrigin: PRODUCTION_PUBLIC_ORIGIN,
    http: { host: "0.0.0.0", port: 3000, acceptedHosts: ["1n5635n614.goho.co", "web:8080"] }, assets: { root, entry: "index.html" },
    build: { sourceCommit: "a".repeat(40), buildId: "SYNTHETIC_HANDLER_CHECK" }, authentication: { sessionTtlSeconds: 900, policy: "source-confirmed-v1" },
    postgres: { target: { host: "never-connected.invalid", port: 5432, database: "SYNTHETIC_ONLY", user: "SYNTHETIC_ONLY", password: "SYNTHETIC_NOT_A_CREDENTIAL", ssl: false },
      max: 1, maxPendingAcquisitions: 1, connectionTimeoutMillis: 1000, acquisitionTimeoutMillis: 1000, queryTimeoutMillis: 1100, statementTimeoutMillis: 900,
      lockTimeoutMillis: 800, idleInTransactionTimeoutMillis: 1000, idlePoolTimeoutMillis: 1000, disposeGraceMillis: 0, disposeTimeoutMillis: 1000 } };
}
function apiDouble() {
  const routed: string[] = []; let closed = 0;
  const api = { trustedOrigin: PRODUCTION_PUBLIC_ORIGIN, app: { server: { listening: false }, routing(request: IncomingMessage, response: ServerResponse) {
    routed.push(request.url!); response.writeHead(404); response.end("API404");
  } }, async close() { closed++; }, postgresBackgroundFailureCount: 0 } as unknown as PostgresApplicationApi;
  return { api, routed, closed: () => closed };
}
const exact26Config = (root: string) => ({ ...config(root), profile: "source-confirmed-native-exact26-r1-v1" as const,
  documentCommands: "DISABLED" as const, runtime26Review: { reviewFile: "/unopened-private-metadata-review.json", trustedReviewSha256: "d".repeat(64) } });
function invoke(handle: (r: IncomingMessage, s: ServerResponse) => void, url: string, method = "GET", host = "1n5635n614.goho.co", headers: Record<string, string> = {}) {
  let status = 0, body: string | Buffer | undefined, responseHeaders: Record<string, unknown> = {};
  const request = { url, method, headers: { host, ...headers } } as IncomingMessage;
  const response = { writeHead(code: number, values?: Record<string, unknown>) { status = code; responseHeaders = values ?? {}; }, end(bytes?: string | Buffer) { body = bytes; } } as unknown as ServerResponse;
  handle(request, response); return { status, body: body?.toString(), headers: responseHeaders };
}
async function build() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "erp-production-host-")));
  await writeFile(path.join(root, "index.html"), '<!doctype html><script src="/assets/app.js"></script>');
  await writeFile(path.join(root, "app.js"), "SYNTHETIC_EMITTED_BUILD_ONLY");
  return root;
}

test("production handler strips only /api and captures actual emitted assets without a listener", async () => {
  const root = await build(), p = apiDouble();
  try {
    const handle = await createProductionRequestHandler({ api: p.api, configuration: config(root) });
    assert.equal(invoke(handle, "/api/sales/query?x=1", "POST").body, "API404");
    assert.equal(invoke(handle, "/api?x=1").body, "API404"); assert.deepEqual(p.routed, ["/sales/query?x=1", "/?x=1"]);
    assert.equal(invoke(handle, "/apiary").status, 404);
    assert.equal(invoke(handle, "/").body, await readFile(path.join(root, "index.html"), "utf8"));
    await writeFile(path.join(root, "app.js"), "CHANGED_AFTER_CAPTURE");
    assert.equal(invoke(handle, "/assets/app.js", "GET", "web:8080").body, "SYNTHETIC_EMITTED_BUILD_ONLY");
    const head = invoke(handle, "/assets/app.js", "HEAD"); assert.equal(head.status, 200); assert.equal(head.body, undefined); assert.equal(head.headers["content-length"], 28);
    const health = JSON.parse(invoke(handle, "/healthz").body!); assert.equal(health.databaseChecked, false); assert.equal(health.status, "HOST_READY"); assert.equal(health.sourceCommit, "a".repeat(40));
    assert.equal(p.closed(), 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("host rejects traversal, source/private files and spoofed forwarded Host", async () => {
  const root = await build(), p = apiDouble();
  try {
    await mkdir(path.join(root, "incoming")); await writeFile(path.join(root, "incoming", "original.json"), "DO_NOT_SERVE");
    for (const name of [".env", "private.json", "app.js.map", "app.ts"]) await writeFile(path.join(root, name), "DO_NOT_SERVE");
    let closing = false;
    const handle = await createProductionRequestHandler({ api: p.api, configuration: config(root) }, () => closing);
    for (const url of ["/assets/%2e%2e/index.html", "/assets/incoming/original.json", "/assets/.env", "/assets/private.json", "/assets/app.js.map", "/assets/app.ts", "/assets/app.js%2f..%2findex.html"]) assert.equal(invoke(handle, url).status, 404, url);
    assert.equal(invoke(handle, "/", "GET", "attacker.invalid", { "x-forwarded-host": "1n5635n614.goho.co", "x-forwarded-proto": "https" }).status, 400);
    assert.equal(invoke(handle, "//attacker.invalid/api").status, 400);
    assert.equal(invoke(handle, "/", "POST").status, 405);
    closing = true; assert.equal(invoke(handle, "/api/auth/session").status, 503); assert.deepEqual(p.routed, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("production exact26 host: independent adapter keeps public asset/API boundaries and never emits private review metadata", async () => {
  const root = await build(), p = apiDouble();
  try {
    const configuration = exact26Config(root), handle = await createProductionRuntime26RequestHandler({ api: p.api, configuration });
    assert.equal(invoke(handle, "/api/current-form/products/query", "POST").body, "API404"); assert.deepEqual(p.routed, ["/current-form/products/query"]);
    assert.equal(invoke(handle, "/assets/app.js").body, "SYNTHETIC_EMITTED_BUILD_ONLY");
    const health = invoke(handle, "/healthz").body!; assert.equal(JSON.parse(health).databaseChecked, false);
    assert.ok(!health.includes("runtime26") && !health.includes(configuration.runtime26Review.reviewFile) && !health.includes("d".repeat(64)));
    assert.equal(invoke(handle, "/assets/unopened-private-metadata-review.json").status, 404);
    await assert.rejects(createProductionRequestHandler({ api: p.api, configuration: configuration as never }), TypeError);
    assert.equal(p.closed(), 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("production exact26 host: invalid successor configuration closes its owned API before any listener; explicit main rejects missing/relative input", async () => {
  const p = apiDouble();
  await assert.rejects(startProductionRuntime26ApplicationHost({ api: p.api, configuration: { ...exact26Config("/unopened"), documentCommands: "NATIVE_RUNTIME" } as never }), TypeError);
  assert.equal(p.closed(), 1); assert.deepEqual(p.routed, []);
  await assert.rejects(runProductionRuntime26Main([]), TypeError); await assert.rejects(runProductionRuntime26Main(["relative-config.json"]), TypeError);
});
test("production R2 exact26 host: separate adapter routes the supplied API while review and existing selectors remain private", async () => {
  const root = await build(), p = apiDouble();
  try {
    const configuration = { ...exact26Config(root), profile: "source-confirmed-native-exact26-r2-v1" as const,
      documentCommands: "NATIVE_RUNTIME" as const, existingPreparation: { sales: true, transfers: false } };
    const handle = await createProductionRuntime26R2RequestHandler({ api: p.api, configuration });
    assert.equal(invoke(handle, "/api/sales/prepare-existing", "POST").body, "API404"); assert.deepEqual(p.routed, ["/sales/prepare-existing"]);
    const health = invoke(handle, "/healthz").body!; assert.equal(JSON.parse(health).databaseChecked, false);
    assert.ok(!health.includes("runtime26Review") && !health.includes("existingPreparation") && !health.includes("d".repeat(64)));
    assert.equal(invoke(handle, "/assets/app.js").body, "SYNTHETIC_EMITTED_BUILD_ONLY");
    await assert.rejects(createProductionRuntime26RequestHandler({ api: p.api, configuration: configuration as never }), TypeError);
    assert.equal(p.closed(), 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("production R2 exact26 host: invalid independent configuration closes owned API and missing CLI input never opens a listener", async () => {
  const p = apiDouble(), configuration = { ...exact26Config("/unopened"), profile: "source-confirmed-native-exact26-r2-v1" as const,
    documentCommands: "DISABLED", existingPreparation: { sales: true, transfers: true } };
  await assert.rejects(startProductionRuntime26R2ApplicationHost({ api: p.api, configuration: configuration as never }), TypeError); assert.equal(p.closed(), 1);
  await assert.rejects(runProductionRuntime26R2Main([]), TypeError); await assert.rejects(runProductionRuntime26R2Main(["relative-config.json"]), TypeError);
});

test("invalid build/startup closes owned API once and never opens a listener", async () => {
  const root = await build(), p = apiDouble();
  try {
    await symlink(path.join(root, "app.js"), path.join(root, "linked.js"));
    await assert.rejects(startProductionApplicationHost({ api: p.api, configuration: config(root) }), /symbolic links/); assert.equal(p.closed(), 1);
    const mismatch = apiDouble();
    await assert.rejects(startProductionApplicationHost({ api: { ...mismatch.api, trustedOrigin: "https://wrong.invalid" }, configuration: config(root) }), /exact public origin/);
    assert.equal(mismatch.closed(), 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("runtime entry refuses public or linked config before constructing application resources", async () => {
  const root = await build();
  try {
    const filename = path.join(root, "runtime.json"); await writeFile(filename, JSON.stringify(config(root)), { mode: 0o644 });
    await assert.rejects(runProductionMain([filename]), /private configuration/);
    const linked = path.join(root, "runtime-link.json"); await symlink(filename, linked);
    await assert.rejects(runProductionMain([linked]), /private configuration/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("production R3 media host: original API prefix and public build boundary keep private media configuration out of assets/health", async () => {
  const root = await build(), p = apiDouble();
  try {
    const configuration = { ...exact26Config(root), profile: "source-confirmed-native-exact26-r3-v1" as const,
      documentCommands: "NATIVE_RUNTIME" as const, existingPreparation: { sales: true, transfers: false }, productMedia: { root: root + "-private-media", rootKey: "native" } };
    const handle = await createProductionRuntime26R3RequestHandler({ api: p.api, configuration });
    invoke(handle, "/api/products/media/uploads", "POST"); invoke(handle, "/api/products/media/product/image/revision/thumbnail");
    assert.deepEqual(p.routed, ["/products/media/uploads", "/products/media/product/image/revision/thumbnail"]);
    assert.equal(invoke(handle, "/assets/app.js").body, "SYNTHETIC_EMITTED_BUILD_ONLY");
    const health = invoke(handle, "/healthz").body!;
    assert.ok(!health.includes("productMedia") && !health.includes(configuration.productMedia.root) && !health.includes("runtime26Review"));
    assert.equal(invoke(handle, "/assets/manifest.json").status, 404);
    await assert.rejects(createProductionRuntime26R2RequestHandler({ api: p.api, configuration: configuration as never }), TypeError);
  } finally { await rm(root, { recursive: true, force: true }); }
  await assert.rejects(startProductionRuntime26R3ApplicationHost({ api: p.api, configuration: {} as never }), TypeError);
  assert.equal(p.closed(), 1);
  await assert.rejects(runProductionRuntime26R3Main([]), TypeError);
  await assert.rejects(runProductionRuntime26R3Main(["relative-config.json"]), TypeError);
});
