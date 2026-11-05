import type { HistoricalBarcodeAttestation } from './historical-barcode-attestation.ts';

/** Offline projection only. A LOCAL_DECLARATION_ONLY structure is not proof of
 * publication or authorization; this function must not be wired into a live
 * reader until a separately reviewed, restricted durable attestation protocol
 * proves the batch, receipt, immutable audit, and local declaration linkage. */
export function projectLocalHistoricalBarcodeDeclarations(input: {
  readonly productId: string;
  readonly schemeId: string;
  readonly declaration: HistoricalBarcodeAttestation;
  readonly skus: readonly { readonly id: string; readonly productId: string; readonly colorId: string; readonly fitId: string; readonly sizeId: string }[];
}): { readonly matched: readonly { readonly skuId: string; readonly schemeId: string; readonly productSegment: string; readonly colorCode: string; readonly sizeCode: string }[]; readonly missingSkuIds: readonly string[] } {
  if (input.declaration.verification !== 'LOCAL_DECLARATION_ONLY' || input.declaration.product_id !== input.productId) throw new Error('LOCAL_DECLARATION_PRODUCT_MISMATCH');
  const key = (scheme: string, color: string, fit: string, size: string) => JSON.stringify([scheme, color, fit, size]);
  const byCoordinate = new Map(input.declaration.entries.map(e => [key(e.scheme_id,e.color_id,e.fit_id,e.size_id), e]));
  if (byCoordinate.size !== input.declaration.entries.length) throw new Error('LOCAL_DECLARATION_DUPLICATE_COORDINATE');
  const seenIds = new Set<string>(), seenCoordinates = new Set<string>();
  const matched: { skuId: string; schemeId: string; productSegment: string; colorCode: string; sizeCode: string }[] = [], missingSkuIds: string[] = [];
  for (const sku of input.skus) {
    const coordinate = key(input.schemeId, sku.colorId, sku.fitId, sku.sizeId);
    if (sku.productId !== input.productId || seenIds.has(sku.id) || seenCoordinates.has(coordinate)) throw new Error('LOCAL_DECLARATION_INVALID_SKU_SCOPE');
    seenIds.add(sku.id); seenCoordinates.add(coordinate);
    const e = byCoordinate.get(coordinate);
    if (!e) { missingSkuIds.push(sku.id); continue; }
    matched.push({ skuId: sku.id, schemeId: e.scheme_id, productSegment: e.product_segment, colorCode: e.color_code, sizeCode: e.size_code });
  }
  return { matched, missingSkuIds };
}
