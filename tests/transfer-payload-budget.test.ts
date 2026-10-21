import assert from "node:assert/strict";
import test from "node:test";
import { TRANSFER_PREPARED_RESPONSE_MAX_BYTES, TRANSFER_COMMAND_MAX_REQUEST_BYTES, transferJsonByteLength, transferPreparedDraftFitsSaveBudget } from "../packages/application/src/transfer-payload-budget.ts";

test("transfer budget counts exact UTF-8 JSON including escapes and bigint text", () => {
  const value = { note: "中文😀\u0001", quantity: 2n };
  assert.equal(transferJsonByteLength(value), Buffer.byteLength(JSON.stringify({ note: value.note, quantity: "2" })));
});
test("prepared response boundary reserves enough space for maximum supported SAVE envelope", () => {
  const draft = { note: "x".repeat(TRANSFER_PREPARED_RESPONSE_MAX_BYTES - 11) };
  assert.equal(transferJsonByteLength(draft), TRANSFER_PREPARED_RESPONSE_MAX_BYTES);
  assert.equal(transferPreparedDraftFitsSaveBudget(draft), true);
  assert.ok(transferJsonByteLength({ action: "SAVE", requestKey: "K".repeat(200), expectedVersion: Number.MAX_SAFE_INTEGER, draft }) <= TRANSFER_COMMAND_MAX_REQUEST_BYTES);
  assert.equal(transferPreparedDraftFitsSaveBudget({ note: draft.note + "x" }), false);
});
