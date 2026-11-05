import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { parseHistoricalBarcodeAttestation } from '../../../packages/application/src/historical-barcode-attestation.ts';
import { projectLocalHistoricalBarcodeDeclarations } from '../../../packages/application/src/historical-barcode-coordinate-projection.ts';

/** Candidate V2 reader. Its caller must first establish the independently
 * verified SQL capability for the SAME transaction and installation. The SQL
 * function must check published batch, immutable receipt/audit/record linkage,
 * and source-file pins before returning rows. This does not certify source bytes.
 * Never invoke against V1 or enable merely because this function is present. */
export async function readHistoricalBarcodeDeclarations(
  query: (sql: string, values: unknown[]) => Promise<{ rows: readonly Record<string, unknown>[] }>,
  productId: string, schemeId: string,
  skus: readonly { id: string; productId: string; colorId: string; fitId: string; sizeId: string }[],
): Promise<readonly { skuId: string; schemeId: string; productSegment: string; colorCode: string; sizeCode: string; evidenceRef: string }[]> {
  const rows = (await query('/* product-barcode:declared-v2 */ SELECT attestation,pinned_source_files FROM naijue_erp.standard_historical_barcode_declaration($1::uuid)', [productId])).rows;
  requireDomain(rows.length <= 1, 'INVALID_DATABASE_VALUE', 'Conflicting published historical barcode declarations');
  if (!rows.length) return [];
  const row = rows[0]!, pins = row.pinned_source_files, declaration = row.attestation;
  requireDomain(Array.isArray(pins) && pins.length > 0 && pins.length <= 10000 && pins.every(v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)) && new Set(pins).size === pins.length,
    'INVALID_DATABASE_VALUE', 'Invalid pinned declaration sources');
  requireDomain(declaration !== null && typeof declaration === 'object' && !Array.isArray(declaration)
    && (declaration as Record<string, unknown>).verification === 'LOCAL_DECLARATION_ONLY', 'INVALID_DATABASE_VALUE', 'Invalid local declaration marker');
  const { verification: _marker, ...raw } = declaration as Record<string, unknown>;
  let parsed: ReturnType<typeof parseHistoricalBarcodeAttestation>;
  try { parsed = parseHistoricalBarcodeAttestation(raw, productId, new Set(pins as string[])); }
  catch { requireDomain(false, 'INVALID_DATABASE_VALUE', 'Invalid published local declaration'); }
  const schemes = new Set(parsed.entries.map(entry => entry.scheme_id));
  requireDomain(schemes.size === 1, 'INVALID_DATABASE_VALUE', 'Mixed product scheme declarations');
  requireDomain(new Set(parsed.entries.map(entry => entry.product_segment)).size === 1, 'INVALID_DATABASE_VALUE', 'Conflicting source product segments');
  if (!schemes.has(schemeId)) return [];
  let projection: ReturnType<typeof projectLocalHistoricalBarcodeDeclarations>;
  try { projection = projectLocalHistoricalBarcodeDeclarations({ productId, schemeId, declaration: parsed, skus }); }
  catch { requireDomain(false, 'INVALID_DATABASE_VALUE', 'Invalid local declaration SKU scope'); }
  return projection.matched.map(entry => ({ ...entry, evidenceRef: `LOCAL_DECLARATION_ONLY:${productId}` }));
}
