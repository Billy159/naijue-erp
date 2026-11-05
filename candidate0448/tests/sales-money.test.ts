/** Synthetic numbers exercising directly inspected candidate formulas, not frozen Demo/PG runtime evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { allocateSalesDiscount, discountUnitPrice } from "../packages/domain/src/sales-money.ts";
import { minorAmount, multiplyMoney, quantity } from "../packages/domain/src/values.ts";
const money = (value: number | string | bigint) => minorAmount(String(value));

test("candidate formula / synthetic: half-up discounted unit price is calculated before integer quantity", () => {
  assert.equal(discountUnitPrice(money(25), 50), 13n);
  assert.equal(multiplyMoney(discountUnitPrice(money(25), 50), quantity("3")), 39n);
  assert.equal(discountUnitPrice(money(24), 50), 12n);
  assert.equal(discountUnitPrice(money(25), 0), 0n);
  assert.equal(discountUnitPrice(money(25), 100), 25n);
  for (const invalid of [-1, 101, 50.5, NaN, Infinity]) assert.throws(() => discountUnitPrice(money(25), invalid), { code: "INVALID_LINE_DISCOUNT" });
  assert.throws(() => discountUnitPrice(money(-1), 50), { code: "INVALID_PRICE" });
});
test("candidate formula / synthetic: largest remainder uses unequal weights and original-index ties", () => {
  assert.deepEqual(allocateSalesDiscount([100, 200, 300].map(money), money(1)), [0n, 0n, 1n]);
  assert.deepEqual(allocateSalesDiscount([100, 100, 100].map(money), money(2)), [1n, 1n, 0n]);
  assert.deepEqual(allocateSalesDiscount([0, 100, 100].map(money), money(1)), [0n, 1n, 0n]);
  assert.deepEqual(allocateSalesDiscount([100, 200, 0].map(money), money(300)), [100n, 200n, 0n]);
  assert.deepEqual(allocateSalesDiscount([0, 0].map(money), money(0)), [0n, 0n]);
  assert.deepEqual(allocateSalesDiscount([], money(0)), []);
});
test("candidate formula / synthetic: allocator rejects signed gross and invalid order discounts", () => {
  for (const [gross, discount] of [[[-1, 2], 0], [[0], 1], [[10], -1], [[10], 11]] as const) {
    assert.throws(() => allocateSalesDiscount(gross.map(money), money(discount)), { code: "INVALID_ORDER_DISCOUNT" });
  }
});
test("candidate formula / synthetic: exact bigint arithmetic has no JavaScript-safe-money business cap", () => {
  const huge = 10n ** 70n + 1n;
  assert.equal(discountUnitPrice(money(huge), 50), (huge + 1n) / 2n);
  const shares = allocateSalesDiscount([huge, huge, huge].map(money), money(2));
  assert.deepEqual(shares, [1n, 1n, 0n]);
});
test("candidate formula / synthetic: small exhaustive allocations conserve total and never exceed each gross", () => {
  for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) for (let c = 0; c <= 9; c++) {
    const gross = [a, b, c].map(money);
    for (let d = 0; d <= a + b + c; d++) {
      const shares = allocateSalesDiscount(gross, money(d));
      assert.equal(shares.reduce((sum, amount) => sum + amount, 0n), BigInt(d));
      shares.forEach((share, index) => assert.ok(share >= 0n && share <= gross[index]!));
    }
  }
});
