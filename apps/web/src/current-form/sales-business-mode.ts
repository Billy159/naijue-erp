export type SalesBusinessMode = 'SALE' | 'RETURN_EXCHANGE';
export function salesBusinessMode(type: 'SALE' | 'RETURN' | 'EXCHANGE'): SalesBusinessMode { return type === 'SALE' ? 'SALE' : 'RETURN_EXCHANGE'; }
/** Current entry offers only sale and pure return; legacy exchange remains a stored type. */
export function salesBusinessType(mode: SalesBusinessMode): 'SALE' | 'RETURN' {
  if (mode === 'SALE') return 'SALE';
  return 'RETURN';
}

/** An existing exchange retains loaded quantities and economics, not current entry controls. */
export function isLegacyExchangeSale(document: { readonly header: { readonly businessType: 'SALE' | 'RETURN' | 'EXCHANGE' }; readonly lines: readonly { readonly quantity: string }[] }): boolean {
  return document.header.businessType === 'EXCHANGE'
    || document.header.businessType === 'RETURN' && document.lines.some(row => /^[1-9]\d*$/.test(row.quantity));
}
