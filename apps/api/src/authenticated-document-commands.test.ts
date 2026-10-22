import { TRANSFER_COMMAND_MAX_REQUEST_BYTES, TRANSFER_PREPARE_MAX_REQUEST_BYTES, TRANSFER_PREPARED_RESPONSE_MAX_BYTES, transferJsonByteLength } from "../../../packages/application/src/transfer-payload-budget.ts";
/** Isolated SYNTHETIC stores and session resolver; no socket, database or real user. */
import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import Fastify from "fastify";
import { createAuthenticatedDocumentCommandsPlugin } from "./authenticated-document-commands.ts";
import { createTransferHttpPlugin } from "./transfer-http.ts";
import type { TransferHttpOptions } from "./transfer-http.ts";
import { createTransferSessionAuthenticator } from "./transfer-authentication.ts";
import { createNativeTransferExistingPreparation, createNativeTransferPreparation, createNativeManualTransferReferences, parseNativeTransferExistingProposal } from "../../../packages/application/src/native-transfer-preparation.ts";
import { actor as transferActor } from "../../../tests/support/synthetic-transfer.ts";
import type { AuthenticatedDocumentCommandsOptions } from "./authenticated-document-commands.ts";
import { exactJson } from "./sales-http.ts";
import { fixture, syntheticDraft, ids, sid, snapshot, SYNTHETIC_RULES } from "../../../tests/support/synthetic-fixtures.ts";
import { fixture as transferFixture, draft as transferDraft } from "../../../tests/support/synthetic-transfer.ts";
import { DomainError, requireDomain } from "../../../packages/domain/src/errors.ts";
import type { AuthenticationService } from "../../../packages/authentication/src/service.ts";

const origin = "https://synthetic-commands.invalid";
const token = "S".repeat(43);
async function setup(t: TestContext, nativePreparation = false, productName = snapshot.productName,
  existing: Pick<AuthenticatedDocumentCommandsOptions, "nativeExistingSalesPreparation" | "nativeExistingTransferPreparation"> = {}) {
  const sales = fixture(); const transfers = transferFixture(); let active = true; let allowed = true; let sequence = 8000;
  const service: AuthenticationService = {
    async resolve(value) { return active && value === token ? { accountId: ids.account, staffId: sid("staff", 16),
      loginName: "SYNTHETIC", role: "ADMIN", hallId: ids.hall, authVersion: 1 } : null; },
    async login() { throw new Error("SYNTHETIC unused"); }, async logout() {}, async changeOwnPassword() {}
  };
  const plugin = createAuthenticatedDocumentCommandsPlugin({ authentication: { service, trustedOrigin: origin },
    sales: { unitOfWork: sales.store, rules: SYNTHETIC_RULES, authorization: { async assertAllowed(_actor, _action, document) {
      requireDomain(allowed && document.header.customerId === ids.customer, "FORBIDDEN", "Synthetic denied reference");
    } }, now: () => "2026-10-20T12:00:00Z", newId: kind => sid(kind, sequence++) }, transfers: { ...transfers.dependencies,
      unitOfWork: { transaction(work) { return transfers.store.transaction(tx => work({ ...tx,
        async getCurrentTransferSnapshots(ids) { return new Map(ids.map(id => [id, { ...snapshot, productName, barcode: "000123" }])); }
      })); } }
    }, ...(nativePreparation ? { nativeManualTransferPreparation: true as const } : {}), ...existing });
  // Mutation after composition cannot replace the captured session resolver.
  service.resolve = async () => { throw new Error("Must not replace captured authentication"); };
  const app = Fastify({ logger: false }); app.register(plugin); t.after(() => app.close()); await app.ready();
  const headers = { cookie: `__Host-naijue_session=${token}`, origin, "content-type": "application/json" };
  const post = (kind: "sales" | "transfers", body: unknown, customHeaders = headers) => app.inject({ method: "POST", url: `/${kind}/commands`, headers: customHeaders, payload: exactJson(body) });
  return { app, sales, transfers, headers, post, expire: () => { active = false; }, revoke: () => { allowed = false; transfers.revokeAccess(); } };
}
const save = (draft: unknown, requestKey = "create", expectedVersion: number | null = null) => ({ action: "SAVE", draft, requestKey, expectedVersion });

test("authenticated composition requires complete explicit providers", () => {
  assert.throws(() => createAuthenticatedDocumentCommandsPlugin({} as AuthenticatedDocumentCommandsOptions), /explicit trusted session/);
});
test("SYNTHETIC session/CSRF denial precedes writes for both document routes", async t => {
  const h = await setup(t);
  for (const kind of ["sales", "transfers"] as const) {
    const draft = kind === "sales" ? syntheticDraft() : transferDraft();
    assert.equal((await h.post(kind, save(draft), { ...h.headers, origin: "https://untrusted.invalid" })).statusCode, 401);
    assert.equal((await h.post(kind, save(draft), { ...h.headers, cookie: "" })).statusCode, 401);
  }
  assert.equal(h.sales.store.snapshot().headers.size, 0); assert.equal(h.transfers.store.snapshot().transfers.size, 0);
  assert.equal(h.app.server.listening, false);
});
test("SYNTHETIC commands retain atomic save, replay, stale and revoked-access behavior", async t => {
  const h = await setup(t);
  for (const kind of ["sales", "transfers"] as const) {
    const draft = kind === "sales" ? syntheticDraft() : transferDraft();
    const first = await h.post(kind, save(draft)); assert.equal(first.statusCode, 200);
    assert.deepEqual((await h.post(kind, save(draft))).json(), first.json());
    assert.equal((await h.post(kind, save(draft, "stale"))).statusCode, 409);
    assert.equal((await h.post(kind, save(draft, "create", 1))).statusCode, 409);
    const receipt = await h.app.inject({ url: `/${kind}/receipts/create`, headers: h.headers });
    assert.equal(receipt.statusCode, 200); assert.deepEqual(receipt.json().result, first.json());
  }
  const beforeSales = h.sales.store.snapshot(), beforeTransfers = h.transfers.store.snapshot(); h.revoke();
  assert.equal((await h.post("sales", save(syntheticDraft()))).statusCode, 403);
  assert.equal((await h.post("transfers", save(transferDraft()))).statusCode, 403);
  assert.deepEqual(h.sales.store.snapshot(), beforeSales); assert.deepEqual(h.transfers.store.snapshot(), beforeTransfers);
  h.expire(); assert.equal((await h.post("sales", save(syntheticDraft()))).statusCode, 401);
});
test("SYNTHETIC unknown references fail without creating documents", async t => {
  const h = await setup(t); const sales = syntheticDraft(); const transfer = transferDraft();
  assert.equal((await h.post("sales", save({ ...sales, header: { ...sales.header, customerId: sid("customer", 9999) } }))).statusCode, 403);
  assert.equal((await h.post("transfers", save({ ...transfer, header: { ...transfer.header, toWarehouseId: sid("warehouse", 9999) } }))).statusCode, 409);
  assert.equal(h.sales.store.snapshot().headers.size, 0); assert.equal(h.transfers.store.snapshot().transfers.size, 0);
});

test("SYNTHETIC opt-in prepare HTTP excludes caller snapshots, prepares then saves with revalidation", async t => {
  const h = await setup(t, true); const original = transferDraft();
  const proposal = { businessDate: "2026-10-21", note: null, fromWarehouseId: original.header.fromWarehouseId,
    toWarehouseId: original.header.toWarehouseId, lines: [{ skuId: original.lines[0]!.skuId, quantity: "2" }] };
  const prepare = (payload: unknown, headers = h.headers) => h.app.inject({ method: "POST", url: "/transfers/prepare-create", headers, payload: exactJson(payload) });
  assert.equal((await prepare({ ...proposal, number: "FORGED" })).statusCode, 400);
  assert.equal((await prepare({ ...proposal, lines: [{ ...proposal.lines[0], snapshot }] })).statusCode, 400);
  assert.equal((await prepare(proposal, { ...h.headers, origin: "https://untrusted.invalid" })).statusCode, 401);
  const response = await prepare(proposal); assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  const draft = response.json(); assert.match(draft.header.number, /^V2-DB-/);
  assert.equal(draft.lines[0].snapshot.barcode, "000123"); assert.equal(draft.lines[0].quantity, "2");
  assert.equal(h.transfers.store.snapshot().transfers.size, 0);
  const saved = await h.post("transfers", save(draft)); assert.equal(saved.statusCode, 200);
  assert.deepEqual((await h.post("transfers", save(draft))).json(), saved.json());
  const off = await setup(t); assert.equal((await off.app.inject({ method: "POST", url: "/transfers/prepare-create", headers: off.headers, payload: exactJson(proposal) })).statusCode, 404);
});

test("SYNTHETIC 200-line multibyte snapshots and escaped maximum note prepare and SAVE within shared budgets", async t => {
  const h = await setup(t, true, "多字节商品名称".repeat(20)); const original = transferDraft();
  const proposal = { businessDate: "2026-10-21", note: "\u0001".repeat(10_000), fromWarehouseId: original.header.fromWarehouseId,
    toWarehouseId: original.header.toWarehouseId, lines: Array.from({ length: 200 }, () => ({ skuId: original.lines[0]!.skuId, quantity: "2" })) };
  assert.ok(transferJsonByteLength(proposal) > 65_536); assert.ok(transferJsonByteLength(proposal) <= TRANSFER_PREPARE_MAX_REQUEST_BYTES);
  const response = await h.app.inject({ method: "POST", url: "/transfers/prepare-create", headers: h.headers, payload: exactJson(proposal) });
  assert.equal(response.statusCode, 200); const draft = response.json(); assert.equal(draft.lines.length, 200);
  assert.equal(draft.header.note, proposal.note); assert.equal(draft.lines[0].snapshot.productName, "多字节商品名称".repeat(20));
  assert.ok(Buffer.byteLength(response.body) <= TRANSFER_PREPARED_RESPONSE_MAX_BYTES);
  const command = save(draft, "K".repeat(200)); assert.ok(transferJsonByteLength(command) > 65_536);
  assert.ok(transferJsonByteLength(command) <= TRANSFER_COMMAND_MAX_REQUEST_BYTES);
  const saved = await h.post("transfers", command); assert.equal(saved.statusCode, 200);
  assert.deepEqual((await h.post("transfers", command)).json(), saved.json());
});
test("SYNTHETIC over-budget native labels fail preparation explicitly without writes or silent truncation", async t => {
  const h = await setup(t, true, "商品".repeat(2000)); const original = transferDraft();
  const proposal = { businessDate: "2026-10-21", note: null, fromWarehouseId: original.header.fromWarehouseId,
    toWarehouseId: original.header.toWarehouseId, lines: Array.from({ length: 200 }, () => ({ skuId: original.lines[0]!.skuId, quantity: "2" })) };
  const response = await h.app.inject({ method: "POST", url: "/transfers/prepare-create", headers: h.headers, payload: exactJson(proposal) });
  assert.equal(response.statusCode, 413); assert.equal(response.json().error.code, "TRANSFER_PAYLOAD_TOO_LARGE");
  assert.equal(h.transfers.store.snapshot().transfers.size, 0); assert.equal(h.transfers.store.snapshot().receipts.size, 0);
  const longNote = await h.app.inject({ method: "POST", url: "/transfers/prepare-create", headers: h.headers, payload: exactJson({ ...proposal, note: "x".repeat(10_001) }) });
  assert.equal(longNote.statusCode, 400);
  const oversized = await h.app.inject({ method: "POST", url: "/transfers/prepare-create", headers: h.headers, payload: JSON.stringify({ padding: "x".repeat(TRANSFER_PREPARE_MAX_REQUEST_BYTES) }) });
  assert.equal(oversized.statusCode, 413);
  const commandOversized = await h.app.inject({ method: "POST", url: "/transfers/commands", headers: h.headers, payload: JSON.stringify({ padding: "x".repeat(TRANSFER_COMMAND_MAX_REQUEST_BYTES) }) });
  assert.equal(commandOversized.statusCode, 413);
});

async function existingTransferHttp(t: TestContext, enable = true, provider?: TransferHttpOptions["existingPreparation"], composite = false) {
  const f = transferFixture(); let active = true, sequence = 20000;
  const original = transferDraft(); await f.service.execute({ actor: transferActor, action: "SAVE", expectedVersion: null, requestKey: "seed-existing-http", draft: original });
  const dependencies = { ...f.dependencies, newId: <K extends import("../../../packages/domain/src/values.ts").EntityKind>(kind: K) => sid(kind, sequence++),
    references: createNativeManualTransferReferences(), unitOfWork: { transaction<T>(work: (tx: import("../../../packages/application/src/transfer-ports.ts").TransferTransaction) => Promise<T>) {
      return f.store.transaction(tx => work({ ...tx, async getCurrentTransferSnapshots(ids) { return new Map(ids.map(id => [id, { ...snapshot, barcode: "000123" }])); } }));
    } } };
  const service: AuthenticationService = { async resolve(value) { return active && value === token ? { accountId: transferActor.accountId, staffId: sid("staff", 16),
    loginName: "SYNTHETIC", role: transferActor.role, hallId: transferActor.hallId, authVersion: 1 } : null; },
    async login() { throw Error("SYNTHETIC UNUSED"); }, async logout() {}, async changeOwnPassword() {} };
  const app = Fastify({ logger: false }); t.after(() => app.close());
  if (composite) {
    const sales = fixture();
    app.register(createAuthenticatedDocumentCommandsPlugin({ authentication: { service, trustedOrigin: origin }, transfers: dependencies,
      sales: { unitOfWork: sales.store, rules: SYNTHETIC_RULES, authorization: { async assertAllowed() {} }, now: () => "2026-10-21T12:00:00Z", newId: kind => sid(kind, sequence++) },
      nativeExistingTransferPreparation: true }));
  } else app.register(createTransferHttpPlugin({ dependencies, authenticate: createTransferSessionAuthenticator({ service, trustedOrigin: origin }),
    ...(enable ? { existingPreparation: provider ?? createNativeTransferExistingPreparation(dependencies) } : { preparation: createNativeTransferPreparation(dependencies) }) }));
  await app.ready(); const headers = { cookie: `__Host-naijue_session=${token}`, origin, "content-type": "application/json" };
  const input = () => ({ businessDate: "2026-10-21", note: null, transferId: original.header.id, expectedVersion: 1,
    fromWarehouseId: original.header.fromWarehouseId, toWarehouseId: original.header.toWarehouseId,
    lines: [{ existingLineId: original.lines[0]!.id, skuId: original.lines[0]!.skuId, quantity: "1" }] });
  return { app, f, input, original, headers, expire: () => { active = false; }, post: (payload: unknown, customHeaders = headers, url = "/transfers/prepare-existing") => app.inject({ method: "POST", url, headers: customHeaders, payload: exactJson(payload) }) };
}
test("SYNTHETIC existing transfer HTTP opt-in uses current session/CSRF, exact response and zero business effects", async t => {
  const old = await existingTransferHttp(t, false); assert.equal((await old.post(old.input())).statusCode, 404);
  const h = await existingTransferHttp(t), before = h.f.store.snapshot();
  const response = await h.post(h.input()); assert.equal(response.statusCode, 200); assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(Object.keys(response.json()).sort(), ["draft", "expectedVersion"]); assert.equal(response.json().expectedVersion, 1);
  assert.equal(response.json().draft.header.id, h.original.header.id); assert.equal(response.json().draft.header.number, h.original.header.number);
  assert.equal(response.json().draft.lines[0].quantity, "1"); assert.equal(response.json().draft.lines[0].id, h.original.lines[0]!.id);
  assert.deepEqual(h.f.store.snapshot(), before); assert.equal(h.app.server.listening, false);
  assert.equal((await h.post(h.input(), { ...h.headers, origin: "https://untrusted.invalid" })).statusCode, 401);
  assert.equal((await h.post(h.input(), { ...h.headers, cookie: "" })).statusCode, 401);
  h.expire(); assert.equal((await h.post(h.input())).statusCode, 401); assert.deepEqual(h.f.store.snapshot(), before);
});
test("SYNTHETIC existing transfer HTTP rejects forged pointers/authority, unknown fields, sales intent and invalid quantities", async t => {
  const h = await existingTransferHttp(t), input = h.input(), before = h.f.store.snapshot();
  for (const payload of [{ ...input, actor: transferActor }, { ...input, orderDiscount: "0" }, { ...input, expectedVersion: "1" },
    { ...input, lines: [{ ...input.lines[0], snapshot }] }, { ...input, lines: [{ ...input.lines[0], existingLineId: sid("transferLine", 999) }] },
    { ...input, lines: [input.lines[0], input.lines[0]] }]) assert.equal((await h.post(payload)).statusCode, 400);
  for (const quantity of ["-1", "0"]) assert.equal((await h.post({ ...input, lines: [{ ...input.lines[0], quantity }] })).statusCode, 422);
  assert.equal((await h.post(input, h.headers, "/transfers/prepare-existing?role=ADMIN")).statusCode, 400);
  const getter = { ...input }; Object.defineProperty(getter, "transferId", { enumerable: true, get() { throw Error("GETTER_MUST_NOT_RUN"); } });
  assert.throws(() => parseNativeTransferExistingProposal(getter), { code: "INVALID_HTTP_INPUT" }); assert.deepEqual(h.f.store.snapshot(), before);
});
test("SYNTHETIC existing transfer HTTP preserves actual version/state/history/ref conflicts and returns no partial draft", async t => {
  const h = await existingTransferHttp(t), input = h.input(), doc = h.f.store.snapshot().transfers.get(h.original.header.id)!.document;
  assert.equal((await h.post({ ...input, expectedVersion: 2 })).statusCode, 409);
  assert.equal((await h.post({ ...input, toWarehouseId: input.fromWarehouseId })).statusCode, 422);
  h.f.store.seedDocument({ ...doc, header: { ...doc.header, status: "APPROVED" } }); assert.equal((await h.post(input)).statusCode, 409);
  h.f.store.seedDocument(doc, "CUTOFF_HISTORY"); assert.equal((await h.post(input)).statusCode, 409);
  h.f.store.seedDocument(doc); h.f.revokeAccess(); const denied = await h.post(input); assert.equal(denied.statusCode, 403); assert.ok(!Object.hasOwn(denied.json(), "draft"));
  for (const code of ["NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE", "TRANSFER_SNAPSHOT_MISMATCH", "WAREHOUSE_UNAVAILABLE"] as const) {
    const x = await existingTransferHttp(t, true, { async prepareExisting() { throw new DomainError(code, "PRIVATE_PROVIDER_DETAIL"); } });
    const response = await x.post(x.input()); assert.equal(response.statusCode, 409); assert.ok(!response.body.includes("PRIVATE")); assert.ok(!Object.hasOwn(response.json(), "draft"));
  }
});
test("SYNTHETIC existing transfer HTTP bounds requests/responses and rejects a returned different target/version", async t => {
  for (const wrong of ["target", "version", "budget"] as const) {
    const h = await existingTransferHttp(t, true, { async prepareExisting() { const draft = transferDraft(); return { expectedVersion: wrong === "version" ? 2 : 1,
      draft: { ...draft, header: { ...draft.header, id: wrong === "target" ? sid("transfer", 999) : draft.header.id, note: wrong === "budget" ? "x".repeat(TRANSFER_COMMAND_MAX_REQUEST_BYTES) : null } } }; } });
    assert.equal((await h.post(h.input())).statusCode, wrong === "budget" ? 413 : 409);
    assert.equal((await h.post({ ...h.input(), note: "x".repeat(TRANSFER_PREPARE_MAX_REQUEST_BYTES) })).statusCode, 413);
    assert.equal((await h.app.inject({ method: "POST", url: "/transfers/prepare-existing", headers: { ...h.headers, "content-type": "text/plain" }, payload: "{}" })).statusCode, 415);
  }
});

test("R2 composition existing preparation: independent per-document opt-ins do not imply CREATE and CREATE alone never implies existing", async t => {
  for (const [sales, transfers] of [[false, false], [true, false], [false, true], [true, true]]) {
    const h = await setup(t, false, snapshot.productName, { ...(sales ? { nativeExistingSalesPreparation: true as const } : {}), ...(transfers ? { nativeExistingTransferPreparation: true as const } : {}) });
    for (const [kind, enabled] of [["sales", sales], ["transfers", transfers]] as const) {
      assert.equal(h.app.hasRoute({ method: "POST", url: `/${kind}/prepare-existing` }), enabled);
      assert.equal(h.app.hasRoute({ method: "POST", url: `/${kind}/prepare-create` }), false);
      const response = await h.app.inject({ method: "POST", url: `/${kind}/prepare-existing`, headers: { ...h.headers, origin: "https://untrusted.invalid" }, payload: {} });
      assert.equal(response.statusCode, enabled ? 401 : 404);
    }
    assert.equal(h.sales.store.snapshot().headers.size, 0); assert.equal(h.transfers.store.snapshot().transfers.size, 0);
  }
  const createOnly = await setup(t, true);
  assert.equal(createOnly.app.hasRoute({ method: "POST", url: "/transfers/prepare-create" }), true);
  assert.equal(createOnly.app.hasRoute({ method: "POST", url: "/transfers/prepare-existing" }), false);
});
test("R2 composition existing preparation: trusted composite runs actual transfer prepare-existing with exact response and no business effects", async t => {
  const h = await existingTransferHttp(t, true, undefined, true), before = h.f.store.snapshot();
  assert.equal(h.app.hasRoute({ method: "POST", url: "/transfers/prepare-create" }), false);
  assert.equal(h.app.hasRoute({ method: "POST", url: "/sales/prepare-existing" }), false);
  const response = await h.post(h.input()); assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(Object.keys(response.json()).sort(), ["draft", "expectedVersion"]); assert.equal(response.json().expectedVersion, 1);
  assert.equal(response.json().draft.header.number, h.original.header.number); assert.equal(response.json().draft.lines[0].id, h.original.lines[0]!.id);
  assert.equal(response.headers["cache-control"], "no-store"); assert.deepEqual(h.f.store.snapshot(), before); assert.equal(h.app.server.listening, false);
});
test("R2 composition existing preparation: missing own-data true, coercion and getters are rejected before providers", () => {
  let getterCalls = 0;
  const authentication = { trustedOrigin: origin, service: { async resolve() { return null; }, async login() {}, async logout() {}, async changeOwnPassword() {} } };
  for (const key of ["nativeExistingSalesPreparation", "nativeExistingTransferPreparation"]) {
    for (const value of [false, "true", 1, undefined])
      assert.throws(() => createAuthenticatedDocumentCommandsPlugin({ authentication, [key]: value } as never), /independent own-data true opt-in/);
    const getter = Object.defineProperty({ authentication }, key, { enumerable: true, get() { getterCalls++; throw Error("MUST_NOT_RUN"); } });
    assert.throws(() => createAuthenticatedDocumentCommandsPlugin(getter as never), /independent own-data true opt-in/);
    const inherited = Object.assign(Object.create({ [key]: true }) as object, { authentication });
    assert.throws(() => createAuthenticatedDocumentCommandsPlugin(inherited as never), /independent own-data true opt-in/);
  }
  assert.equal(getterCalls, 0);
});
