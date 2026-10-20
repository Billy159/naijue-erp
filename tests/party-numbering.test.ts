import test from "node:test";
import assert from "node:assert/strict";
import { createApprovedPartyCodeAllocator, formatApprovedPartyCode, nextApprovedPartyNumber, PARTY_SEQUENCE_MAX } from "../packages/application/src/party-numbering.ts";
import { createPartyMaintenanceService } from "../packages/application/src/party-maintenance-service.ts";
import { partyActor, partyFixture } from "./support/party-synthetic-store.ts";

const exhaustion = (error: unknown) => (error as { code: string }).code === "PARTY_CODE_EXHAUSTED";
test("approved party numbering: KH/GYS starts and minimum six-digit formatting, no 999999 cap", () => {
  assert.equal(formatApprovedPartyCode("CUSTOMER", nextApprovedPartyNumber("CUSTOMER", "1", false, null)), "KH000001");
  assert.equal(formatApprovedPartyCode("SUPPLIER", nextApprovedPartyNumber("SUPPLIER", "1", false, null)), "GYS000001");
  assert.equal(formatApprovedPartyCode("CUSTOMER", nextApprovedPartyNumber("CUSTOMER", "999999", true, null)), "KH1000000");
  assert.equal(formatApprovedPartyCode("SUPPLIER", PARTY_SEQUENCE_MAX), "GYS9223372036854775807");
});
test("approved party numbering: exact existing prefix suffixes advance without rewriting padded originals", () => {
  const existing = "KH0000000000000000000000000000000000000000456";
  assert.equal(nextApprovedPartyNumber("CUSTOMER", "1", false, existing), 457n); assert.equal(existing, "KH0000000000000000000000000000000000000000456");
  assert.equal(nextApprovedPartyNumber("SUPPLIER", "2", true, "GYS900000"), 900001n);
  assert.equal(nextApprovedPartyNumber("CUSTOMER", "1000", true, "KH000004"), 1001n);
  assert.equal(nextApprovedPartyNumber("CUSTOMER", "1", false, "KH000000"), 1n);
  assert.throws(() => nextApprovedPartyNumber("CUSTOMER", "1", false, "GYS000005"));
  assert.throws(() => nextApprovedPartyNumber("CUSTOMER", "1", false, " KH000005"));
});
test("approved party numbering: technical signed-bigint exhaustion is explicit, no precision loss or wrap", () => {
  const maximum = PARTY_SEQUENCE_MAX.toString();
  assert.equal(nextApprovedPartyNumber("CUSTOMER", maximum, false, null), PARTY_SEQUENCE_MAX);
  assert.throws(() => nextApprovedPartyNumber("CUSTOMER", maximum, true, null), exhaustion);
  assert.throws(() => nextApprovedPartyNumber("SUPPLIER", "1", false, `GYS${maximum}`), exhaustion);
  assert.throws(() => nextApprovedPartyNumber("CUSTOMER", "1", false, `KH${"9".repeat(100000)}`), exhaustion);
  assert.throws(() => formatApprovedPartyCode("SUPPLIER", PARTY_SEQUENCE_MAX + 1n), exhaustion);
});
test("SYNTHETIC approved party allocator: explicit wiring invokes separate reservations and exact replay does not allocate again", async () => {
  const f = partyFixture(); const service = createPartyMaintenanceService({ ...f.dependencies, codes: createApprovedPartyCodeAllocator() });
  const command = { actor: partyActor, kind: "CUSTOMER" as const, action: "CREATE" as const, requestKey: "one", name: "SAME" };
  const first = await service.execute(command); assert.equal(first.code, "KH000001"); assert.deepEqual(await service.execute(command), first);
  const second = await service.execute({ ...command, requestKey: "two" }); assert.equal(second.code, "KH000002");
  const supplier = await service.execute({ ...command, kind: "SUPPLIER", requestKey: "supplier" }); assert.equal(supplier.code, "GYS000001");
});
