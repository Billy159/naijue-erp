import http from "node:http";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { parseProductionHostConfiguration, productionAssetUrl } from "../../web/src/production-host/configuration.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import { gunzipSync, brotliDecompressSync } from "node:zlib";
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
    build: { sourceCommit: "a".repeat(40), buildId: "SYNTHETIC_HANDLER_CHECK" }, authentication: { sessionTtlSeconds: 900, policy: "source-confirmed-v1", passwordWork:{maxConcurrent:1,maxAnonymous:1,retryAfterSeconds:1},loginAdmission:{global:{burst:10,tokens:10,intervalMillis:1000},source:{burst:10,tokens:10,intervalMillis:1000},sourceAccount:{burst:10,tokens:10,intervalMillis:1000},entryTtlMillis:1000,maxEntries:100,maxRetryAfterSeconds:1} },
    postgres: { target: { host: "never-connected.invalid", port: 5432, database: "SYNTHETIC_ONLY", user: "SYNTHETIC_ONLY", password: "SYNTHETIC_NOT_A_CREDENTIAL", ssl: false },
      max: 1, maxPendingAcquisitions: 1, connectionTimeoutMillis: 1000, acquisitionTimeoutMillis: 1000, queryTimeoutMillis: 1100, statementTimeoutMillis: 900,
      lockTimeoutMillis: 800, idleInTransactionTimeoutMillis: 1000, idlePoolTimeoutMillis: 1000, disposeGraceMillis: 0, disposeTimeoutMillis: 1000 } };
}
function apiDouble(responseHeaders: Record<string, string> = {}) {
  const routed: string[] = []; let closed = 0;
  const api = { trustedOrigin: PRODUCTION_PUBLIC_ORIGIN, app: { server: { listening: false }, routing(request: IncomingMessage, response: ServerResponse) {
    routed.push(request.url!); response.writeHead(404, responseHeaders); response.end("API404");
  } }, async close() { closed++; }, postgresBackgroundFailureCount: 0 } as unknown as PostgresApplicationApi;
  return { api, routed, closed: () => closed };
}
const exact26Config = (root: string) => ({ ...config(root), profile: "source-confirmed-native-exact26-r1-v1" as const,
  documentCommands: "DISABLED" as const, runtime26Review: { reviewFile: "/unopened-private-metadata-review.json", trustedReviewSha256: "d".repeat(64) } });
function invoke(handle: (r: IncomingMessage, s: ServerResponse) => void, url: string, method = "GET", host = "1n5635n614.goho.co", headers: Record<string, string> = {}) {
  let status = 0, body: string | Buffer | undefined, responseHeaders: Record<string, unknown> = {};
  const request = { url, method, headers: { host, ...headers } } as IncomingMessage;
  const response = { writeHead(code: number, values?: Record<string, unknown>) { status = code; responseHeaders = values ?? {}; }, end(bytes?: string | Buffer) { body = bytes; } } as unknown as ServerResponse;
  handle(request, response); return { status, body: body?.toString(), bytes: body, headers: responseHeaders };
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
    const health = JSON.parse(invoke(handle, "/healthz").body!); assert.equal(health.databaseChecked, false); assert.equal(health.status, "HOST_ALIVE"); assert.equal(health.sourceCommit, "a".repeat(40));
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

test("production assets: configured build prefix resolves generated public URLs and relative chunks while other versions stay 404", async () => {
  const root = await build(), p = apiDouble(), configuration = config(root), buildId = configuration.build.buildId;
  try {
    const publicConfiguration = parseProductionHostConfiguration({ kind: "naijue-erp-production-host",
      http: { origin: PRODUCTION_PUBLIC_ORIGIN, basePath: "/api" }, assets: { basePath: `/assets/${buildId}/` },
      session: { verifyOnMount: true }, routes: { inventory: true, sales: true, transfers: true } });
    // Use the actual public configuration/URL helper consumed by build-production-host.mjs.
    const scriptUrl = productionAssetUrl(publicConfiguration, "application.js");
    const html = `<script id="naijue-erp-production-configuration" type="application/json">${JSON.stringify({ configuration: publicConfiguration })}</script><script type="module" src="${scriptUrl}"></script>`;
    await writeFile(path.join(root, "index.html"), html);
    await writeFile(path.join(root, "application.js"), 'import "./chunks/page.js";');
    await mkdir(path.join(root, "chunks")); await writeFile(path.join(root, "chunks/page.js"), "SYNTHETIC_VERSIONED_CHUNK");
    const handle = await createProductionRequestHandler({ api: p.api, configuration });
    const servedHtml = invoke(handle, "/").body!;
    const generatedScript = new URL(servedHtml.match(/type="module" src="([^"]+)"/)![1]!);
    assert.equal(generatedScript.pathname, `/assets/${buildId}/application.js`);
    const script = invoke(handle, generatedScript.pathname); assert.equal(script.status, 200); assert.equal(script.body, 'import "./chunks/page.js";');
    const chunkUrl = new URL("./chunks/page.js", generatedScript);
    assert.equal(invoke(handle, chunkUrl.pathname).body, "SYNTHETIC_VERSIONED_CHUNK");
    assert.equal(invoke(handle, "/assets/application.js").body, script.body);
    assert.equal(invoke(handle, "/assets/chunks/page.js").body, "SYNTHETIC_VERSIONED_CHUNK");
    const head = invoke(handle, generatedScript.pathname, "HEAD"); assert.equal(head.status, 200); assert.equal(head.body, undefined);
    for (const url of ["/assets/OTHER_BUILD/application.js", `/assets/${buildId}-other/application.js`, `/assets/${buildId}/%2e%2e/application.js`, `/assets/${buildId}/private.json`])
      assert.equal(invoke(handle, url).status, 404, url);
    assert.equal(invoke(handle, generatedScript.pathname, "GET", "attacker.invalid").status, 400);
    assert.equal(invoke(handle, generatedScript.pathname, "POST").status, 405);
    assert.deepEqual(p.routed, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("production assets: exact root source-styles compiled CSS resolves under the same-origin build prefix without exposing source siblings", async () => {
  const root = await build(), p = apiDouble(), configuration = config(root), buildId = configuration.build.buildId;
  try {
    const publicConfiguration = parseProductionHostConfiguration({ kind: "naijue-erp-production-host",
      http: { origin: PRODUCTION_PUBLIC_ORIGIN, basePath: "/api" }, assets: { basePath: `/assets/${buildId}/` },
      session: { verifyOnMount: true }, routes: { inventory: true, sales: true, transfers: true } });
    const scriptUrl = new URL(productionAssetUrl(publicConfiguration, "application.js"));
    const cssUrl = new URL("./source-styles/matrix-experiments.css", scriptUrl);
    const fontUrl = new URL("./compiled.woff2", scriptUrl);
    const css = `@font-face{font-family:compiled;src:url("${fontUrl.pathname}")} .matrix{display:grid}`;
    await mkdir(path.join(root, "source-styles"));
    await writeFile(path.join(root, "source-styles/matrix-experiments.css"), css);
    await writeFile(path.join(root, "compiled.woff2"), "SYNTHETIC_EMITTED_FONT");
    const blockedFiles = ["runtime.js", "original.json", "matrix.css.map", "matrix.ts", "matrix.scss", "font.woff2",
      "private.css", "secret.css", "source.css", "source-client.css", "incoming.css", "provenance.css", ".hidden.css"];
    for (const name of blockedFiles) await writeFile(path.join(root, "source-styles", name), "DO_NOT_SERVE");
    await mkdir(path.join(root, "source-styles/nested")); await writeFile(path.join(root, "source-styles/nested/hidden.css"), "DO_NOT_SERVE");
    for (const directory of ["source", "source-styles-extra", "Source-Styles", "incoming", "provenance", "public/source-styles"]) {
      await mkdir(path.join(root, directory), { recursive: true }); await writeFile(path.join(root, directory, "hidden.css"), "DO_NOT_SERVE");
    }
    const handle = await createProductionRequestHandler({ api: p.api, configuration });
    assert.equal(cssUrl.origin, PRODUCTION_PUBLIC_ORIGIN);
    assert.equal(cssUrl.pathname, `/assets/${buildId}/source-styles/matrix-experiments.css`);
    const served = invoke(handle, cssUrl.pathname, "GET", cssUrl.host);
    assert.equal(served.status, 200); assert.equal(served.body, css);
    assert.equal(served.headers["content-type"], "text/css; charset=utf-8");
    assert.equal(served.headers["content-length"], Buffer.byteLength(css));
    assert.equal(served.headers["cache-control"], "public,max-age=31536000,immutable"); assert.equal(served.headers["x-content-type-options"], "nosniff");
    const head = invoke(handle, cssUrl.pathname, "HEAD", cssUrl.host); assert.equal(head.status, 200); assert.equal(head.body, undefined);
    await writeFile(path.join(root, "source-styles/matrix-experiments.css"), "CHANGED_AFTER_CAPTURE");
    assert.equal(invoke(handle, cssUrl.pathname).body, css);
    assert.equal(invoke(handle, "/assets/source-styles/matrix-experiments.css").body, css);
    assert.equal(invoke(handle, fontUrl.pathname).headers["content-type"], "font/woff2");
    assert.equal(invoke(handle, fontUrl.pathname).body, "SYNTHETIC_EMITTED_FONT");
    for (const name of blockedFiles) assert.equal(invoke(handle, `/assets/${buildId}/source-styles/${name}`).status, 404, name);
    for (const relative of ["source-styles", "source-styles/nested/hidden.css", "source-styles/../app.js", "source-styles//matrix-experiments.css",
      "source-styles/%2e%2e/app.js", "source/hidden.css", "source-styles-extra/hidden.css", "Source-Styles/hidden.css",
      "incoming/hidden.css", "provenance/hidden.css", "public/source-styles/hidden.css", "OTHER_BUILD/source-styles/matrix-experiments.css"])
      assert.equal(invoke(handle, `/assets/${buildId}/${relative}`).status, 404, relative);
    assert.deepEqual(p.routed, []); assert.equal(p.api.app.server.listening, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("production compiled CSS exception retains symbolic-link and build-ancestor rejection", async () => {
  const root = await build(), p = apiDouble();
  try {
    await mkdir(path.join(root, "source-styles"));
    await symlink(path.join(root, "app.js"), path.join(root, "source-styles/linked.css"));
    await assert.rejects(createProductionRequestHandler({ api: p.api, configuration: config(root) }), /symbolic links/);
    await rm(path.join(root, "source-styles/linked.css"));
    const nested = path.join(root, "source-styles/public-build"); await mkdir(nested);
    await writeFile(path.join(nested, "index.html"), "SYNTHETIC_EMITTED_HTML");
    await assert.rejects(createProductionRequestHandler({ api: p.api, configuration: config(nested) }), /Build ancestors/);
    assert.equal(p.closed(), 0); assert.equal(p.api.app.server.listening, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("production CORE v14 host: original handler accepts committed subset configuration while health/assets exclude CORE identity and metadata", async () => {
  const root = await build(), p = apiDouble();
  try {
    const configuration = { ...exact26Config(root), coreInitializationRead: { profile: "COMMITTED_CORE_SETTINGS_V14" as const,
      batchId: "14000000-0000-4000-8000-000000003000", operationId: "14000000-0000-4000-8000-000000003001", coreSourceDigest: "c".repeat(64) } };
    const handle = await createProductionRuntime26RequestHandler({ api: p.api, configuration });
    assert.equal(invoke(handle, "/api/store-settings-read/warehouses/query", "POST").body, "API404");
    assert.equal(invoke(handle, "/assets/app.js").body, "SYNTHETIC_EMITTED_BUILD_ONLY");
    const health = invoke(handle, "/healthz").body!, parsed = JSON.parse(health);
    assert.equal(parsed.databaseChecked, false); assert.equal(parsed.dataReady, undefined); assert.equal(parsed.businessReady, undefined);
    for (const privateValue of ["coreInitializationRead", configuration.coreInitializationRead.operationId, configuration.coreInitializationRead.batchId, configuration.coreInitializationRead.coreSourceDigest, configuration.runtime26Review.reviewFile])
      assert.ok(!health.includes(privateValue));
    assert.equal(p.closed(), 0); assert.equal(p.api.app.server.listening, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("production assets: captured hashed source-helpers chunk resolves without opening source siblings", async () => {
  const root = await build(), p = apiDouble(), buildId = "SYNTHETIC_HANDLER_CHECK";
  const chunk = "source-helpers-EEL3XLNG.js", emitted = "export const compiledHelper = 1;";
  try {
    await mkdir(path.join(root, "chunks")); await writeFile(path.join(root, "chunks", chunk), emitted);
    await writeFile(path.join(root, "app.js"), `import "./chunks/${chunk}";`);
    const blocked = ["source-helpers.js", "source-helpers-EEL3XLNG.ts", "source-helpers-EEL3XLNG.js.map", "source-helpers-eel3xlng.js", "source-helpers-EEL3XLNG.json", "source-private-EEL3XLNG.js", "source-other-EEL3XLNG.js"];
    // Do not overwrite the real-case fixture on case-insensitive macOS filesystems.
    for (const name of blocked) if (name !== chunk.toLowerCase()) await writeFile(path.join(root, "chunks", name), "DO_NOT_SERVE");
    await writeFile(path.join(root, chunk), "DO_NOT_SERVE_ROOT");
    await mkdir(path.join(root, "source")); await writeFile(path.join(root, "source", chunk), "DO_NOT_SERVE_SOURCE");
    const handle = await createProductionRequestHandler({ api: p.api, configuration: config(root) });
    const url = new URL(`./chunks/${chunk}`, `${PRODUCTION_PUBLIC_ORIGIN}/assets/${buildId}/app.js`);
    const served = invoke(handle, url.pathname); assert.equal(served.status, 200); assert.equal(served.body, emitted);
    assert.equal(served.headers["content-type"], "text/javascript; charset=utf-8");
    assert.equal(served.headers["content-length"], Buffer.byteLength(emitted));
    await writeFile(path.join(root, "chunks", chunk), "CHANGED_AFTER_CAPTURE");
    assert.equal(invoke(handle, url.pathname).body, emitted);
    assert.equal(invoke(handle, url.pathname, "HEAD").body, undefined);
    assert.equal(invoke(handle, url.pathname, "HEAD").status, 200);
    for (const name of blocked) assert.equal(invoke(handle, `/assets/${buildId}/chunks/${name}`).status, 404, name);
    for (const name of [chunk, `source/${chunk}`, `chunks/../${chunk}`, `chunks/%2e%2e/${chunk}`, `OTHER_BUILD/chunks/${chunk}`])
      assert.equal(invoke(handle, `/assets/${name}`).status, 404, name);
    assert.deepEqual(p.routed, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("captured JS/CSS negotiate startup gzip/br with exact decoded bytes, lengths and bodyless HEAD", async () => {
  const root = await build(), p = apiDouble();
  const js = "window.example = 'static compression';\n".repeat(2000), css = ".example { color: red; }\n".repeat(2000);
  try {
    await writeFile(path.join(root, "app.js"), js); await writeFile(path.join(root, "app.css"), css);
    const handle = await createProductionRequestHandler({ api: p.api, configuration: config(root) });
    await writeFile(path.join(root, "app.js"), "CHANGED_AFTER_CAPTURE");
    for (const [name, original] of [["app.js", js], ["app.css", css]]) {
      const url = `/assets/${config(root).build.buildId}/${name}`;
      for (const encoding of ["gzip", "br"]) {
        const headers = { "accept-encoding": encoding }, get = invoke(handle, url, "GET", undefined, headers);
        assert.equal(get.status, 200); assert.equal(get.headers["content-encoding"], encoding);
        assert.equal(get.headers.vary, "Accept-Encoding"); assert.equal(get.headers["cache-control"], "public,max-age=31536000,immutable");
        assert.ok(Buffer.isBuffer(get.bytes)); const bytes = get.bytes as Buffer;
        assert.equal(get.headers["content-length"], bytes.length); assert.ok(bytes.length < Buffer.byteLength(original!));
        assert.equal((encoding === "gzip" ? gunzipSync(bytes) : brotliDecompressSync(bytes)).toString(), original);
        const head = invoke(handle, url, "HEAD", undefined, headers);
        assert.deepEqual(head.headers, get.headers); assert.equal(head.bytes, undefined);
      }
      for (const accept of [undefined, "", "identity", "gzip;q=0, br;q=0", "deflate", "gzip;q=0.2, identity;q=1"]) {
        const identity = invoke(handle, url, "GET", undefined, accept === undefined ? {} : { "accept-encoding": accept });
        assert.equal(identity.body, original); assert.equal(identity.headers["content-encoding"], undefined);
        assert.equal(identity.headers["content-length"], Buffer.byteLength(original!));
      }
      for (const [accept, expected] of [["gzip;q=1,br;q=0.5", "gzip"], ["GZIP, BR", "br"], ["*", "br"],
        ["br;q=0, *;q=0.5", "gzip"], ["gzip;q=0.5, br;q=0.8", "br"], ["gzip;q=1, identity;q=0", "gzip"],
        ["gzip ;q=1,identity;q=0", "gzip"], ["br ;q=0,*;q=1,identity;q=0", "gzip"]]) {
        assert.equal(invoke(handle, url, "GET", undefined, { "accept-encoding": accept! }).headers["content-encoding"], expected);
      }
      for (const accept of ["*;q=0", "* ;q=0", "gzip;q=0,br;q=0,identity;q=0", "deflate,identity;q=0"]) {
        for (const method of ["GET", "HEAD"]) {
          const rejected = invoke(handle, url, method, undefined, { "accept-encoding": accept });
          assert.equal(rejected.status, 406); assert.equal(rejected.bytes, undefined); assert.equal(rejected.headers["content-length"], 0);
        }
      }
    }
    const api = invoke(handle, "/api/example", "POST", undefined, { "accept-encoding": "gzip,br" });
    assert.equal(api.body, "API404"); assert.equal(api.headers["content-encoding"], undefined);
    assert.equal(invoke(handle, "/healthz", "GET", undefined, { "accept-encoding": "gzip" }).headers["content-encoding"], undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("immutable caching applies only to successful canonical current-version JS/CSS and preserves no-store elsewhere", async () => {
  const root = await build(), p = apiDouble({ "cache-control": "no-store" }), buildId = config(root).build.buildId;
  const js = "window.cached = true;\n".repeat(1000), css = ".cached { color: red; }\n".repeat(1000);
  let closing = false;
  try {
    await writeFile(path.join(root, "app.js"), js); await writeFile(path.join(root, "app.css"), css);
    for (const name of ["configuration.json", "media.png", "compiled.woff2"]) await writeFile(path.join(root, name), "CAPTURED_PUBLIC_ONLY");
    await mkdir(path.join(root, "OTHER_BUILD")); await writeFile(path.join(root, "OTHER_BUILD/app.js"), js);
    const handle = await createProductionRequestHandler({ api: p.api, configuration: config(root) }, () => closing);
    for (const [name, original] of [["app.js", js], ["app.css", css]]) {
      for (const encoding of ["identity", "gzip", "br"]) {
        const headers = { "accept-encoding": encoding };
        for (const suffix of ["", "?v=1"]) {
          const url = `/assets/${buildId}/${name}${suffix}`, get = invoke(handle, url, "GET", undefined, headers);
          assert.equal(get.status, 200); assert.equal(get.headers["cache-control"], "public,max-age=31536000,immutable");
          assert.equal(get.headers.vary, "Accept-Encoding"); assert.equal(get.headers["content-encoding"], encoding === "identity" ? undefined : encoding);
          const bytes = get.bytes as Buffer;
          assert.equal(get.headers["content-length"], bytes.length);
          assert.equal((encoding === "gzip" ? gunzipSync(bytes) : encoding === "br" ? brotliDecompressSync(bytes) : bytes).toString(), original);
          const head = invoke(handle, url, "HEAD", undefined, headers);
          assert.equal(head.status, 200); assert.deepEqual(head.headers, get.headers); assert.equal(head.bytes, undefined);
        }
        for (const alias of [`/assets/${name}`, `/assets/${buildId}/${name!.replace(".", "%2e")}`,
          `/assets/${buildId}%2f${name}`, `/assets/%53${buildId.slice(1)}/${name}`]) {
          const get = invoke(handle, alias, "GET", undefined, headers), head = invoke(handle, alias, "HEAD", undefined, headers);
          assert.equal(get.status, 200, alias); assert.equal(get.headers["cache-control"], "no-store", alias);
          assert.equal(head.status, 200); assert.equal(head.headers["cache-control"], "no-store"); assert.equal(head.bytes, undefined);
        }
      }
    }
    for (const url of ["/", "/assets/index.html", `/assets/${buildId}/index.html`, "/healthz", "/assets/OTHER_BUILD/app.js",
      ...["configuration.json", "media.png", "compiled.woff2"].map(name => `/assets/${buildId}/${name}`)]) {
      for (const method of ["GET", "HEAD"]) {
        const result = invoke(handle, url, method);
        assert.equal(result.status, 200, url); assert.equal(result.headers["cache-control"], "no-store", url);
      }
    }
    for (const url of ["/api", "/api/auth/login", "/api/auth/session"]) {
      const result = invoke(handle, url);
      assert.equal(result.headers["cache-control"], "no-store"); assert.equal(result.body, "API404");
    }
    for (const [url, method, headers, status] of [[`/assets/${buildId}/missing.js`, "GET", {}, 404],
      [`/assets/${buildId}/app.js`, "POST", {}, 405], [`/assets/${buildId}/app.js`, "GET", { "accept-encoding": "*;q=0" }, 406]] as const) {
      const result = invoke(handle, url, method, undefined, headers);
      assert.equal(result.status, status); assert.equal(result.headers["cache-control"], "no-store");
    }
    const badHost = invoke(handle, `/assets/${buildId}/app.js`, "GET", "untrusted.invalid");
    assert.equal(badHost.status, 400); assert.equal(badHost.headers["cache-control"], "no-store");
    closing = true;
    const closed = invoke(handle, `/assets/${buildId}/app.js`);
    assert.equal(closed.status, 503); assert.equal(closed.headers["cache-control"], "no-store");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('H06 readiness is independent, live and fails closed without admitted dependencies or during drain',async()=>{
 const root=await build(),p=apiDouble();let closing=false,admitted=false,checks=0;
 try {
  const api={...p.api,async readiness(){checks++;return admitted;}};
  const handle=await createProductionRequestHandler({api,configuration:config(root)},()=>closing);
  const ready=()=>new Promise<{status:number;body:string}>(resolve=>{
   let status=0;const req={url:'/readyz',method:'GET',headers:{host:'web:8080'}} as IncomingMessage;
   const res={writeHead(n:number){status=n;},end(bytes?:Buffer){resolve({status,body:bytes?.toString()??''});}} as unknown as ServerResponse;handle(req,res);
  });
  assert.equal((await ready()).status,503);admitted=true;assert.equal((await ready()).status,200);
  admitted=false;assert.equal((await ready()).status,503);assert.equal(checks,3);
  closing=true;assert.equal((await ready()).status,503);assert.equal(checks,3);
  assert.equal(invoke(handle,'/healthz','GET','web:8080').status,200);
  const absent=await createProductionRequestHandler({api:p.api,configuration:config(root)});assert.equal(invoke(absent,'/readyz','GET','web:8080').status,503);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('H06 closing waits for admitted listener work before API disposal without eagerly destroying sockets',async()=>{
 const root=await build(),p=apiDouble(),original=http.createServer;
 let finish:((error?:Error)=>void)|undefined,destroyed=0;
 const server=new EventEmitter() as EventEmitter & {listen():void;close(callback:(error?:Error)=>void):void};
 server.listen=()=>{queueMicrotask(()=>server.emit('listening'));};server.close=callback=>{finish=callback;};
 http.createServer=(()=>server) as unknown as typeof http.createServer;syncBuiltinESMExports();
 try {
  const host=await startProductionApplicationHost({api:p.api,configuration:config(root)});
  const socket=new EventEmitter() as EventEmitter & {destroy():void};socket.destroy=()=>{destroyed++;};server.emit('connection',socket);
  const closing=host.close();assert.equal(p.closed(),0);assert.equal(destroyed,0);assert.ok(finish);
  finish();await closing;assert.equal(p.closed(),1);assert.equal(destroyed,0);await host.close();assert.equal(p.closed(),1);
 }finally{http.createServer=original;syncBuiltinESMExports();await rm(root,{recursive:true,force:true});}
});

test('H06 drain uses configured 120s output budget, completes beyond30s or reports unknown only at deadline',async t=>{
 const root=await build(),original=http.createServer;
 try{for(const expires of [false,true]){
  const p=apiDouble();let finish:((e?:Error)=>void)|undefined,destroyed=0;
  const server=new EventEmitter() as EventEmitter & {listen():void;close(cb:(e?:Error)=>void):void};
  server.listen=()=>queueMicrotask(()=>server.emit('listening'));server.close=cb=>{finish=cb;};
  http.createServer=(()=>server) as unknown as typeof http.createServer;syncBuiltinESMExports();
  const c={...config(root),inventoryOutputSpool:{directory:'/private/inventory-exports',maxBytes:536870912,maxConcurrent:1,maxDurationMs:120000}};
  const host=await startProductionApplicationHost({api:p.api,configuration:c});
  const socket=new EventEmitter() as EventEmitter & {destroy():void};socket.destroy=()=>{destroyed++;};server.emit('connection',socket);
  t.mock.timers.enable({apis:['setTimeout']});const closing=host.close();
  const checked=expires?assert.rejects(closing,error=>error instanceof AggregateError && error.errors.some((e:Error)=>e.message.includes('outcomes may require original-key recovery'))):closing;
  t.mock.timers.tick(31000);assert.equal(destroyed,0);assert.equal(p.closed(),0);
  if(expires)t.mock.timers.tick(91000);else finish!();
  await checked;assert.equal(destroyed,expires?1:0);assert.equal(p.closed(),1);t.mock.timers.reset();
 }}finally{t.mock.timers.reset();http.createServer=original;syncBuiltinESMExports();await rm(root,{recursive:true,force:true});}
});
test('H06 detached readiness response never writes after late probe completion',async()=>{
 const root=await build(),p=apiDouble();let complete!:(v:boolean)=>void,writes=0;
 try{const api={...p.api,readiness:()=>new Promise<boolean>(resolve=>{complete=resolve;})};
 const handle=await createProductionRequestHandler({api,configuration:config(root)});
 const req={url:'/readyz',method:'GET',headers:{host:'web:8080'},destroyed:false} as IncomingMessage;
 const res={destroyed:false,writableEnded:false,writeHead(){writes++;},end(){writes++;}} as unknown as ServerResponse;
 handle(req,res);Object.assign(req,{destroyed:true});Object.assign(res,{destroyed:true});complete(true);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(writes,0);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('H06 logs fixed fields only, bounded size/rate, one finish or cancellation event without request data',async()=>{
 const root=await build(),p=apiDouble(),lines:string[]=[];
 try{
  const handle=await createProductionRequestHandler({api:p.api,configuration:config(root),writeLog:(line:string)=>{lines.push(line);}});
  const request=(cancel=false)=>{
   const req=Object.assign(new EventEmitter(),{url:'/api/products/commands?token=SECRET_QUERY',method:'POST',headers:{host:'web:8080',cookie:'SECRET_COOKIE','x-request-id':'SECRET_HEADER'},body:'SECRET_BODY'}) as unknown as IncomingMessage;
   const res=Object.assign(new EventEmitter(),{statusCode:0,writableEnded:false,writeHead(n:number){this.statusCode=n;},end(this:{writableEnded:boolean;emit(event:string):boolean}){if(!cancel){this.writableEnded=true;this.emit('finish');}},destroy(){}}) as unknown as ServerResponse;
   handle(req,res);if(cancel)res.emit('close');else res.emit('close');
  };
  request();request(true);assert.equal(lines.length,2);const records=lines.map(s=>JSON.parse(s));
  assert.equal(records[0].reason,'COMPLETED');assert.equal(records[0].status,404);assert.equal(records[1].reason,'CLIENT_CLOSED');
  assert.match(records[0].requestId,/^[0-9a-f-]{36}$/);assert.equal(records[0].route,'API');assert.equal(records[0].operation,'WRITE');
  assert.ok(!lines.join('').includes('SECRET'));assert.ok(lines.every(s=>Buffer.byteLength(s)<=1024));
  for(let i=0;i<200;i++)request();assert.ok(lines.length<=128);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('H06 failing operational log sink cannot change the error response or emit private causes',async()=>{
 const root=await build(),p=apiDouble();let calls=0;
 try{const handle=await createProductionRequestHandler({api:p.api,configuration:config(root),writeLog:()=>{calls++;throw Error('PRIVATE_SINK_FAILURE');}});
 const req=Object.assign(new EventEmitter(),{url:'/api/missing',method:'POST',headers:{host:'web:8080'}}) as unknown as IncomingMessage;
 const res=Object.assign(new EventEmitter(),{statusCode:0,writableEnded:false,writeHead(n:number){this.statusCode=n;},end(this:{writableEnded:boolean;emit(event:string):boolean}){this.writableEnded=true;this.emit('finish');}}) as unknown as ServerResponse;
 assert.doesNotThrow(()=>handle(req,res));assert.equal(res.statusCode,404);assert.equal(calls,1);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('H06 drain logs only fixed cleanup reason once, never the private cleanup error',async()=>{
 const root=await build(),p=apiDouble(),original=http.createServer,lines:string[]=[];
 const server=new EventEmitter() as EventEmitter & {listen():void;close(cb:(e?:Error)=>void):void};
 server.listen=()=>queueMicrotask(()=>server.emit('listening'));server.close=cb=>cb();
 http.createServer=(()=>server) as unknown as typeof http.createServer;syncBuiltinESMExports();
 try{const api={...p.api,async close(){throw Error('PRIVATE_CLEANUP_SECRET');}};
 const host=await startProductionApplicationHost({api,configuration:config(root),writeLog:line=>{lines.push(line);}});
 await assert.rejects(host.close(),AggregateError);await assert.rejects(host.close(),AggregateError);
 assert.equal(lines.length,2);const events=lines.map(s=>JSON.parse(s));assert.equal(events[0].phase,'DRAIN_START');
 assert.equal(events[1].reason,'CLEANUP_FAILED_OUTCOME_UNKNOWN');assert.equal(events[0].requestId,events[1].requestId);
 assert.ok(!lines.join('').includes('PRIVATE'));assert.ok(lines.every(s=>Buffer.byteLength(s)<=1024));
 }finally{http.createServer=original;syncBuiltinESMExports();await rm(root,{recursive:true,force:true});}
});
