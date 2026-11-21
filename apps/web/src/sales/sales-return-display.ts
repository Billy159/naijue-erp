import type { SalesDetailDto } from './contracts.ts';

/** UI only: type + trusted storage origin + complete directional facts.
 * A negative historical quantity or unknown totals do not reclassify a record. */
export function isCurrentPureReturn(data: SalesDetailDto): boolean {
  const { header, lines } = data.document;
  return data.stockBasis === 'RUNTIME_LEDGER' && header.businessType === 'RETURN'
    && lines.length > 0 && lines.every(row => /^-[1-9]\d*$/.test(row.quantity));
}
/** Require server proof across all current rows, not the gift-excluding list totals. */
export function isCurrentPureReturnListRow(row: {readonly currentPureReturn?: true | undefined; readonly dataset: string; readonly businessType: string}): boolean {
  return row.currentPureReturn === true && row.dataset === 'LIVE' && row.businessType === 'RETURN';
}
