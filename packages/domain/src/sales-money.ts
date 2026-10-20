import { requireDomain } from "./errors.ts";
import { minorAmount } from "./values.ts";
import type { MinorAmount } from "./values.ts";

/** Candidate source: server/domain/sales/money.ts:27–39, not frozen-Demo runtime proof.
 * Minor units are exact. Discount tenths 0..100 represent 0.0..10.0 折. */
export function discountUnitPrice(referencePrice: MinorAmount, discountTenths: number): MinorAmount {
  requireDomain(referencePrice >= 0n, "INVALID_PRICE", "Reference price cannot be negative");
  requireDomain(Number.isInteger(discountTenths) && discountTenths >= 0 && discountTenths <= 100,
    "INVALID_LINE_DISCOUNT", "Discount must be integer tenths from 0 through 100");
  return minorAmount(((referencePrice * BigInt(discountTenths) + 50n) / 100n).toString());
}

/** Nonnegative SALE gross only; decreasing remainder, ties by original array index.
 * Callers must preserve this calculated row order, not reorder by SKU or identifier. */
export function allocateSalesDiscount(gross: readonly MinorAmount[], discount: MinorAmount): readonly MinorAmount[] {
  const total = gross.reduce((sum, amount) => sum + amount, 0n);
  requireDomain(gross.every(amount => amount >= 0n) && discount >= 0n && discount <= total,
    "INVALID_ORDER_DISCOUNT", "Sales discount must be between zero and nonnegative gross total");
  const shares = gross.map(amount => total === 0n ? 0n : amount * discount / total);
  const order = gross.map((amount, index) => ({ index, remainder: total === 0n ? 0n : amount * discount % total }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  let remaining = discount - shares.reduce((sum, amount) => sum + amount, 0n);
  for (const { index } of order) {
    if (remaining === 0n) break;
    shares[index] = shares[index]! + 1n;
    remaining--;
  }
  requireDomain(remaining === 0n, "DISCOUNT_NOT_CONSERVED", "Discount allocation must conserve exact minor units");
  return shares.map(amount => minorAmount(amount.toString()));
}
