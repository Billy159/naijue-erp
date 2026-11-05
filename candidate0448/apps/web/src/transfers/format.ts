/** Exact integer formatting. Never round a quantity/count through Number. */
export function transferCount(value: string): string {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new TypeError('Invalid exact transfer count.');
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Frozen transfer-golden.js display timezone and minute precision. Native
 * timestamps remain unchanged in DTOs and accessible full-value titles. */
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function transferUpdatedMinute(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('Invalid transfer timestamp.');
  const p = Object.fromEntries(clock.formatToParts(date).map(({ type, value: part }) => [type, part]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

export const transferPageSizes = [20, 50, 100, 200] as const;
export type TransferPageSize = (typeof transferPageSizes)[number];
export function transferPageFacts(page: number, pageSize: number, exactTotal: string | null) {
  if (!Number.isSafeInteger(page) || page < 1 || !transferPageSizes.includes(pageSize as TransferPageSize) || !Number.isSafeInteger(page * pageSize)) throw new TypeError('Invalid transfer page.');
  const total = BigInt(exactTotal ?? '0'); const size = BigInt(pageSize); const offset = BigInt(page - 1) * size;
  if (total < 0n) throw new TypeError('Invalid transfer total.');
  const pages = total === 0n ? 1n : (total + size - 1n) / size;
  return { pages, first: total > offset ? offset + 1n : 0n, last: total > offset ? total < offset + size ? total : offset + size : 0n,
    canNext: BigInt(page) < pages && Number.isSafeInteger((page + 1) * pageSize) };
}
