import {SecurityError} from '../../security/errors.js';
import {formatScaled, multiplyMoneyByQuantity, parseScaled} from '../transactions/decimal.js';

export const maxCents = BigInt(Number.MAX_SAFE_INTEGER);
export const maxPriceCents = 99999999999n;
export const fail = (message: string, code = 'VALIDATION', status = 400): never => {throw new SecurityError(code,status,message);};
export const abs = (n: bigint): bigint => n < 0n ? -n : n;
export function safeCents(n: bigint): bigint {
  if (abs(n) > maxCents) return fail('金额超过可精确显示的范围');
  return n;
}
/** New input is a decimal string; historical precision is handled separately. */
export function money(value: unknown, label: string, nonnegative = false): bigint {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) return fail(`${label}须为最多两位小数的十进制字符串`);
  let n: bigint;
  try {n = parseScaled(value,2,false);} catch {return fail(`${label}精度或范围无效`);}
  if (nonnegative && n < 0n) return fail(`${label}不能为负数`);
  return safeCents(n);
}
export function historicalMoney(value: unknown, label: string): bigint {
  try {return safeCents(parseScaled(value,2));} catch (e) {if(e instanceof SecurityError)throw e;return fail(`历史${label}缺失或不是精确分金额`, 'HISTORICAL_FACTS',409);}
}
export function quantity(value: unknown): bigint {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d{1,4})?$/.test(value)) return fail('数量须为最多四位小数的十进制字符串');
  try {return parseScaled(value,4,false);} catch {return fail('数量精度或范围无效');}
}
export function lineAmount(price: bigint, q: bigint): bigint {return safeCents(multiplyMoneyByQuantity(price,q));}
export function discountPrice(reference: bigint, tenths: unknown): bigint {
  if (typeof tenths !== 'number' || !Number.isInteger(tenths) || tenths < 0 || tenths > 100) return fail('折扣须为 0–10 折，最多一位小数');
  return (reference*BigInt(tenths)+50n)/100n;
}
export function allocateDiscount(gross: readonly bigint[], adjustment: bigint): bigint[] {
  const total = safeCents(gross.reduce((a,b)=>a+b,0n));
  if (gross.some(n=>n<0n) || adjustment<0n || adjustment>total) return fail('整单优惠不能为负数或超过商品金额');
  const shares = gross.map(n=>total ? n*adjustment/total : 0n);
  const order = gross.map((n,i)=>({i,remainder:total ? n*adjustment%total : 0n})).sort((a,b)=>a.remainder===b.remainder ? a.i-b.i : a.remainder>b.remainder ? -1 : 1);
  let left = adjustment-shares.reduce((a,b)=>a+b,0n);
  for (const item of order) {if(!left)break;shares[item.i]=shares[item.i]!+1n;left--;}
  if(left) return fail('优惠分摊未守恒');
  return shares;
}
/** A fractional quantity keeps an exact rational basis instead of invented pieces. */
export function returnBasis(net: bigint, q: bigint): Record<string,string> {
  const count=abs(q);
  if (!count) return fail('交易数量不能为零');
  return {quantity:formatScaled(q,4),netCents:net.toString(),quantityTenThousandths:count.toString(),
    ...(count%10000n===0n ? {unitCents:(abs(net)/(count/10000n)).toString(),extraCentUnits:(abs(net)%(count/10000n)).toString()} : {})};
}
