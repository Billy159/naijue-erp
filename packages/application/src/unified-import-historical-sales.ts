/** Narrow provenance boundary for retained standard-package sales facts.
 * The enclosing ordinary/stream validator must validate every source locator
 * against the manifest and registry. A locator/hash is a declaration, not proof
 * that the original business facts are true. No caller-provided bypass flag.
 */
export function isRetainedHistoricalSalesDocument(row: {fields: Record<string, unknown>; source_refs: readonly unknown[]} | undefined, explicitCleanedSourceProfile=false): boolean {
  return row !== undefined && ['SALE','RETURN','EXCHANGE'].includes(String(row.fields.business_type)) && row.fields.stock_basis === 'CUTOFF_HISTORY'
    && (explicitCleanedSourceProfile || (typeof row.fields.import_batch_id === 'string' && row.fields.import_batch_id.length > 0))
    && Array.isArray(row.source_refs) && row.source_refs.length > 0;
}
export function isRetainedHistoricalSale(row: {fields: Record<string, unknown>; source_refs: readonly unknown[]} | undefined, explicitCleanedSourceProfile=false): boolean {
  return row?.fields.business_type === 'SALE' && isRetainedHistoricalSalesDocument(row,explicitCleanedSourceProfile);
}
