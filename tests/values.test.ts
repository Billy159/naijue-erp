import assert from "node:assert/strict";
import test from "node:test";
import { addMoney, addQuantity, businessDate, decimalToMinor, minorAmount, multiplyMoney, negateQuantity, quantity, QUANTITY_MAX, QUANTITY_MIN, version } from "../packages/domain/src/values.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";

test("SYNTHETIC: quantity signed bigint boundaries are exact, not JS-number limited", () => {
  assert.equal(quantity(QUANTITY_MAX.toString()), QUANTITY_MAX);
  assert.equal(quantity(QUANTITY_MIN.toString()), QUANTITY_MIN);
  assert.equal(quantity("9007199254740993"), 9007199254740993n);
});
test("SYNTHETIC: quantity overflow/underflow and unsafe negation fail rather than wrap", () => {
  for (const value of [QUANTITY_MAX + 1n, QUANTITY_MIN - 1n]) assert.throws(() => quantity(value.toString()), { code: "QUANTITY_OVERFLOW" });
  assert.throws(() => addQuantity(quantity(QUANTITY_MAX.toString()), quantity("1")), { code: "QUANTITY_OVERFLOW" });
  assert.throws(() => negateQuantity(quantity(QUANTITY_MIN.toString())), { code: "QUANTITY_OVERFLOW" });
});
test("SYNTHETIC: fractions, number input, whitespace and implicit conversions are rejected", () => {
  for (const value of ["1.1", "1e3", " 1", "+1", "01", "-0", "", "NaN", "1,000"]) assert.throws(() => quantity(value), { code: "INVALID_QUANTITY" });
  assert.throws(() => quantity(1 as unknown as string), { code: "INVALID_QUANTITY" });
});
test("SYNTHETIC: exact minor arithmetic has no binary floating-point error", () => {
  assert.equal(addMoney(decimalToMinor("0.10", { scale: 2 }), decimalToMinor("0.20", { scale: 2 })), 30n);
  assert.equal(multiplyMoney(minorAmount("125"), quantity("9007199254740993")), 1125899906842624125n);
  assert.equal(decimalToMinor("-12.05", { scale: 2 }), -1205n);
});
test("SYNTHETIC: explicit scale precision is rejected, never rounded", () => {
  assert.throws(() => decimalToMinor("1.001", { scale: 2 }), { code: "MONEY_PRECISION" });
  assert.throws(() => decimalToMinor("1.0", { scale: 0 }), { code: "MONEY_PRECISION" });
  assert.equal(decimalToMinor("1.2300", { scale: 4 }), 12300n);
});
test("SYNTHETIC: only a caller-supplied cap is enforced; no guessed production amount ceiling", () => {
  assert.equal(decimalToMinor("99.99", { scale: 2, maxAbsMinor: 9999n }), 9999n);
  assert.throws(() => decimalToMinor("100", { scale: 2, maxAbsMinor: 9999n }), { code: "MONEY_OVERFLOW" });
  assert.throws(() => decimalToMinor("-100", { scale: 2, maxAbsMinor: 9999n }), { code: "MONEY_OVERFLOW" });
  assert.equal(minorAmount("999999999999999999999999999999"), 999999999999999999999999999999n);
});
test("SYNTHETIC: invalid money syntax, implicit scale and invalid caps fail", () => {
  for (const value of ["1e3", " 1.2", "1.", ".1", "NaN", "1,000", "01.0"]) assert.throws(() => decimalToMinor(value, { scale: 2 }), { code: "INVALID_MONEY" });
  assert.throws(() => minorAmount("1.00"), { code: "INVALID_MONEY" });
  assert.throws(() => decimalToMinor("1", { scale: 2.5 }), { code: "INVALID_MONEY_SCALE" });
  assert.throws(() => decimalToMinor("1", { scale: 2, maxAbsMinor: -1n }), { code: "INVALID_MONEY_LIMIT" });
});
test("SYNTHETIC: versions cannot exceed safe integer range and dates cannot normalize silently", () => {
  for (const value of [0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => version(value), { code: "INVALID_VERSION" });
  assert.equal(businessDate("2024-02-29"), "2024-02-29");
  for (const value of ["2026-02-29", "2026-13-01", "2026-2-01", "2026-02-30"]) assert.throws(() => businessDate(value), { code: "INVALID_BUSINESS_DATE" });
});
test("SYNTHETIC: command hash is property-order stable but content/type/line-order sensitive", () => {
  assert.equal(requestHash({ a: 1n, b: "2" }), requestHash({ b: "2", a: 1n }));
  assert.notEqual(requestHash(1n), requestHash("1"));
  assert.notEqual(requestHash([1n, 2n]), requestHash([2n, 1n]));
  assert.throws(() => requestHash({ a: undefined }), { code: "INVALID_REQUEST" });
  const cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
  assert.throws(() => requestHash(cyclic), { code: "INVALID_REQUEST" });
});
