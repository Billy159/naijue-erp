/** Validates an exact Gregorian calendar date without environment-specific dependencies. */
export function validateCalendarDate(value:unknown):value is string {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [y,m,d] = value.split("-").map(Number);
  if (!y || !m || !d || m > 12 || d > 31) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return d <= [31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m - 1]!;
}
