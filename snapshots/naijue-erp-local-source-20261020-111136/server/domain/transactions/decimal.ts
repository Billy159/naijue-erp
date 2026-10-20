export type DecimalPlaces = 2 | 4;

export class DecimalError extends Error {
  constructor(readonly code: 'INVALID_DECIMAL' | 'DECIMAL_PRECISION' | 'DECIMAL_OVERFLOW' | 'INVALID_BUSINESS_DAY') {
    super(code);
    this.name = 'DecimalError';
  }
}

const powers = new Map<number, bigint>([[2, 100n], [4, 10000n]]);
const maxIntegerDigits: Record<DecimalPlaces, number> = {2: 16, 4: 14};

/** Decimal strings retain source precision; JSON numbers may already have lost it. */
export function parseScaled(value: unknown, places: DecimalPlaces, allowNumber = false): bigint {
  if (typeof value !== 'string' && !(allowNumber && typeof value === 'number' && Number.isFinite(value))) throw new DecimalError('INVALID_DECIMAL');
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new DecimalError('INVALID_DECIMAL');
  const fraction = match[3] ?? '';
  if (fraction.length > places && /[1-9]/.test(fraction.slice(places))) throw new DecimalError('DECIMAL_PRECISION');
  const integerText = (match[2] ?? '').replace(/^0+(?=\d)/, '');
  if (integerText.length > maxIntegerDigits[places]) throw new DecimalError('DECIMAL_OVERFLOW');
  const scale = powers.get(places)!;
  const whole = BigInt(integerText || '0');
  const fractional = BigInt(fraction.slice(0, places).padEnd(places, '0') || '0');
  const result = whole * scale + fractional;
  return match[1] === '-' && result !== 0n ? -result : result;
}

export function formatScaled(value: bigint, places: DecimalPlaces): string {
  const scale = powers.get(places)!;
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const whole = magnitude / scale;
  if (String(whole).length > maxIntegerDigits[places]) throw new DecimalError('DECIMAL_OVERFLOW');
  return `${negative && magnitude !== 0n ? '-' : ''}${whole}.${String(magnitude % scale).padStart(places, '0')}`;
}

/** Amount is unit price in cents times a quantity scaled to four places, rounded half away from zero. */
export function multiplyMoneyByQuantity(unitPriceCents: bigint, quantityTenThousandths: bigint): bigint {
  const product = unitPriceCents * quantityTenThousandths;
  const magnitude = product < 0n ? -product : product;
  const rounded = (magnitude + 5000n) / 10000n;
  const result = product < 0n ? -rounded : rounded;
  if (result.toString().replace('-', '').length > maxIntegerDigits[2] + 2) throw new DecimalError('DECIMAL_OVERFLOW');
  return result;
}

/** Validate a Gregorian YYYY-MM-DD business date without local-time or timezone conversion. */
export function parseBusinessDay(value: unknown): string {
  if (typeof value !== 'string') throw new DecimalError('INVALID_BUSINESS_DAY');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new DecimalError('INVALID_BUSINESS_DAY');
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || year > 9999 || month < 1 || month > 12) throw new DecimalError('INVALID_BUSINESS_DAY');
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > monthDays[month - 1]!) throw new DecimalError('INVALID_BUSINESS_DAY');
  return value;
}
