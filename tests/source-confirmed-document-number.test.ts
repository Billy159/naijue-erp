import assert from "node:assert/strict";
import test from "node:test";
import { sourceConfirmedCreateDocumentNumber as number } from "../packages/application/src/source-confirmed-document-number.ts";

const id = "12345678-0000-0000-0000-000000000001";
test("frozen CREATE number parity: fallback and supplied number without daily sequencing", () => {
  for (const source of [undefined, null, 42, "", "  ", "unsaved-a", "草稿-a"]) {
    assert.equal(number("SALE", id, source), "V2-XS-12345678");
    assert.equal(number("TRANSFER", id, source), "V2-DB-12345678");
  }
  for (const source of ["  SOURCE-1  ", " unsaved-a", " 草稿-a", "UNSAVED-a"])
    assert.equal(number("SALE", id, source), source.trim());
  assert.equal(number("SALE", id), number("SALE", id));
  // The original short-ID fallback is not a new global uniqueness policy.
  assert.equal(number("SALE", id), number("SALE", "12345678-0000-0000-0000-000000000002"));
});
test("number preparation rejects malformed identities and unsupported kinds", () => {
  assert.throws(() => number("SALE", "not-an-id"));
  assert.throws(() => number("OTHER" as "SALE", id));
});
