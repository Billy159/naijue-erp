/** A default only for a new unsaved document. Never fills missing historical dates. */
export function currentBusinessDate(now: Date = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new TypeError('A valid current instant is required.');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
