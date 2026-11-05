/** Synthetic application checks only; no database sequence/durability evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { checkedAllocatedDocumentNumber } from "../packages/application/src/runtime-document-number.ts";
import { createSalesService } from "../packages/application/src/sales-service.ts";
import { createTransferService } from "../packages/application/src/transfer-service.ts";
import { createNativeTransferPreparation } from "../packages/application/src/native-transfer-preparation.ts";
import { SyntheticStore } from "./support/synthetic-store.ts";
import { actor, ids, sid, snapshot, SYNTHETIC_RULES, syntheticDraft } from "./support/synthetic-fixtures.ts";
import { fixture as transferFixture, ids as transferIds, actor as transferActor } from "./support/synthetic-transfer.ts";
import type { SalesDependencies } from "../packages/application/src/ports.ts";
import type { TransferDependencies } from "../packages/application/src/transfer-ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";

test("database numbers preserve twelve-digit padding and every bigint suffix digit", () => {
  for (const [kind, prefix] of [["SALES", "V2-XS-"], ["TRANSFER", "V2-DB-"]] as const) {
    for (const n of [1n, 999999999999n, 1000000000000n, 9007199254740993n, 9223372036854775807n]) {
      const value = prefix + n.toString().padStart(12, "0"); assert.equal(checkedAllocatedDocumentNumber(kind, value), value);
    }
    for (const suffix of ["000000000000", "00000001", "0000000000001", "9223372036854775808", "1.0", "-00000000001"]) assert.throws(() => checkedAllocatedDocumentNumber(kind, prefix + suffix), { code: "INVALID_DOCUMENT_NUMBER" });
  }
  assert.throws(() => checkedAllocatedDocumentNumber("SALES", "V2-DB-000000000001"), { code: "INVALID_DOCUMENT_NUMBER" });
});

test("new sales SAVE requires mapping after business validation; original-key replay retains it", async () => {
  const store = new SyntheticStore(); let sequence = 8000, permitted = false, validations = 0;
  const draft = syntheticDraft(); const number = "V2-XS-000000000001";
  const dependencies: SalesDependencies = { rules: SYNTHETIC_RULES, now: () => "2026-10-22T00:00:00Z", newId: kind => sid(kind, sequence++),
    authorization: { async assertAllowed() {} }, unitOfWork: { transaction(work) { return store.transaction(tx => work({ ...tx,
      async assertRuntimeDocumentNumber(input) { validations++; assert.equal(input.documentId, draft.header.id); assert.equal(input.actorAccountId, actor.accountId);
        if (!permitted || input.number !== number) throw new DomainError("DOCUMENT_NUMBER_MISMATCH", "SYNTHETIC denied mapping"); }
    })); } } };
  const command = { action: "SAVE" as const, actor, requestKey: "number-save", expectedVersion: null, draft: { ...draft, header: { ...draft.header, number } } };
  const service = createSalesService(dependencies), before = store.snapshot();
  await assert.rejects(service.execute(command), { code: "DOCUMENT_NUMBER_MISMATCH" }); assert.deepEqual(store.snapshot(), before);
  permitted = true; const saved = await service.execute(command), committed = store.snapshot();
  assert.deepEqual(await service.execute(command), saved); assert.deepEqual(store.snapshot(), committed); assert.equal(validations, 2);
  await assert.rejects(service.execute({ ...command, requestKey: "number-change", expectedVersion: saved.version, draft: { ...command.draft, header: { ...command.draft.header, number: "V2-XS-000000000002" } } }), { code: "DOCUMENT_NUMBER_MISMATCH" });
  assert.deepEqual(store.snapshot(), committed);
});

test("transfer preparation reserves only after references; SAVE failure/retry preserves that assigned number", async () => {
  const f = transferFixture(); let referencesReady = false, referencesAllowed = true, reserves = 0, mapped: string | undefined, validates = 0;
  const number = "V2-DB-000000000001";
  const dependencies: TransferDependencies = { ...f.dependencies, references: { async assertValid(...args) {
    if (!referencesAllowed) throw new DomainError("FORBIDDEN", "SYNTHETIC references revoked");
    await f.dependencies.references.assertValid(...args); referencesReady = true;
  } }, unitOfWork: { transaction(work) { return f.store.transaction(tx => work({ ...tx,
    async getCurrentTransferSnapshots() { return new Map([[transferIds.sku, snapshot]]); },
    async reserveRuntimeDocumentNumber(input) { assert.equal(referencesReady, true); assert.equal(input.kind, "TRANSFER"); reserves++; mapped = number; return number; },
    async assertRuntimeDocumentNumber(input) { validates++; if (input.number !== mapped) throw new DomainError("DOCUMENT_NUMBER_MISMATCH", "SYNTHETIC mapping"); }
  })); } } };
  const proposal = { businessDate: "2026-10-22", note: null, fromWarehouseId: transferIds.fromWarehouse, toWarehouseId: transferIds.toWarehouse, lines: [{ skuId: transferIds.sku, quantity: "2" }] };
  const prepare = createNativeTransferPreparation(dependencies); referencesAllowed = false;
  await assert.rejects(prepare.prepareCreate(transferActor, proposal), { code: "FORBIDDEN" }); assert.equal(reserves, 0);
  referencesAllowed = true; const draft = await prepare.prepareCreate(transferActor, proposal); assert.equal(draft.header.number, number); assert.equal(reserves, 1);
  const before = f.store.snapshot(), service = createTransferService(dependencies), command = { actor: transferActor, action: "SAVE" as const, expectedVersion: null, requestKey: "number-transfer", draft };
  referencesAllowed = false; await assert.rejects(service.execute(command), { code: "FORBIDDEN" }); assert.deepEqual(f.store.snapshot(), before); assert.equal(mapped, number);
  referencesAllowed = true; const saved = await service.execute(command), committed = f.store.snapshot();
  assert.deepEqual(await service.execute(command), saved); assert.deepEqual(f.store.snapshot(), committed); assert.equal(reserves, 1); assert.equal(validates, 1);
  await assert.rejects(service.execute({ ...command, requestKey: "number-change", expectedVersion: saved.version, draft: { ...draft, header: { ...draft.header, number: "V2-DB-000000000002" } } }), { code: "DOCUMENT_NUMBER_MISMATCH" });
  assert.deepEqual(f.store.snapshot(), committed);
});
