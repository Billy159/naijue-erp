import { TRANSFER_COMMAND_MAX_REQUEST_BYTES, TRANSFER_PREPARE_MAX_REQUEST_BYTES, TRANSFER_PREPARED_RESPONSE_MAX_BYTES, transferJsonByteLength } from "../../../packages/application/src/transfer-payload-budget.ts";
/** Isolated SYNTHETIC stores and session resolver; no socket, database or real user. */
import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import Fastify from "fastify";
import { createAuthenticatedDocumentCommandsPlugin } from "./authenticated-document-commands.ts";
import type { AuthenticatedDocumentCommandsOptions } from "./authenticated-document-commands.ts";
import { exactJson } from "./sales-http.ts";
import { fixture, syntheticDraft, ids, sid, snapshot, SYNTHETIC_RULES } from "../../../tests/support/synthetic-fixtures.ts";
import { fixture as transferFixture, draft as transferDraft } from "../../../tests/support/synthetic-transfer.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import type { AuthenticationService } from "../../../packages/authentication/src/service.ts";

const origin = "https://synthetic-commands.invalid";
const token = "S".repeat(43);
async function setup(t: TestContext, nativePreparation = false, productName = snapshot.productName) {
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
    }, ...(nativePreparation ? { nativeManualTransferPreparation: true as const } : {}) });
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
