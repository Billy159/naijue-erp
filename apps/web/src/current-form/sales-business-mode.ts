export type SalesBusinessMode = 'SALE' | 'RETURN_EXCHANGE';
export function salesBusinessMode(type: 'SALE' | 'RETURN' | 'EXCHANGE'): SalesBusinessMode { return type === 'SALE' ? 'SALE' : 'RETURN_EXCHANGE'; }
/** The two-choice UI preserves the server's three transaction types and explicit row signs. */
export function salesBusinessType(mode: SalesBusinessMode, quantities: readonly string[]): 'SALE' | 'RETURN' | 'EXCHANGE' {
  if (mode === 'SALE') return 'SALE';
  return quantities.some(value => /^[1-9]\d{0,18}$/.test(value)) ? 'EXCHANGE' : 'RETURN';
}
