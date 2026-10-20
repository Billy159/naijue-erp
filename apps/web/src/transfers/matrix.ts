import type { TransferDetailDto } from './contracts.ts';

export type TransferLineDto = TransferDetailDto['document']['lines'][number];
export type TransferCatalogSkuDto = TransferDetailDto['catalog']['skus'][number];
export interface TransferMatrixRow {
  readonly key: string; readonly current: TransferCatalogSkuDto;
  readonly skus: ReadonlyMap<string, TransferCatalogSkuDto>;
  readonly lines: readonly TransferLineDto[];
  readonly quantities: ReadonlyMap<string, bigint>; readonly total: bigint;
}
export interface TransferMatrixSection {
  readonly group: TransferDetailDto['catalog']['sizeGroups'][number]; readonly rows: readonly TransferMatrixRow[];
}
/** Deliberate UI budgets, not measured virtualization/performance acceptance. */
export const TRANSFER_MATRIX_MAX_COLUMNS = 40;
export const TRANSFER_MATRIX_MAX_ROWS = 60;
export const TRANSFER_MATRIX_MAX_CELLS = 2400;
export function transferMatrixDisplay(sections: readonly TransferMatrixSection[]) {
  const columns = Math.max(0, ...sections.map(section => section.group.members.length));
  const rows = sections.reduce((count, section) => count + section.rows.length, 0);
  return { columns, rows, mode: columns > TRANSFER_MATRIX_MAX_COLUMNS || rows > TRANSFER_MATRIX_MAX_ROWS || rows * columns > TRANSFER_MATRIX_MAX_CELLS ? 'paged-lines' as const : 'matrix' as const };
}
const rowKey = (sku: TransferCatalogSkuDto) => JSON.stringify([sku.productId, sku.colorId, sku.fitId]);

/** Identity-only canonical projection. There is no grouping by labels, legacy
 * alias reconstruction, SKU cross product, catalog fetch or inventory estimate.
 * A legal SKU without a line differs from a nonexistent SKU. Saved labels remain
 * on each actual line, even when the current canonical name has changed. */
export function transferMatrix(data: TransferDetailDto): readonly TransferMatrixSection[] {
  const skuById = new Map(data.catalog.skus.map(sku => [sku.skuId, sku]));
  const actualRows = new Map<string, { current: TransferCatalogSkuDto; lines: TransferLineDto[] }>();
  for (const line of data.document.lines) {
    const sku = skuById.get(line.skuId); if (!sku) throw new TypeError('Transfer line has no canonical SKU.');
    const key = rowKey(sku); let row = actualRows.get(key);
    if (!row) { row = { current: sku, lines: [] }; actualRows.set(key, row); }
    row.lines.push(line);
  }
  const tupleSkus = new Map<string, Map<string, TransferCatalogSkuDto>>();
  for (const sku of data.catalog.skus) {
    const key = rowKey(sku); let row = tupleSkus.get(key);
    if (!row) { row = new Map(); tupleSkus.set(key, row); }
    if (row.has(sku.sizeId)) throw new TypeError('Duplicate canonical transfer SKU combination.');
    row.set(sku.sizeId, sku);
  }
  const sections = new Map<string, TransferMatrixRow[]>();
  for (const [key, source] of actualRows) {
    const quantities = new Map<string, bigint>(); let total = 0n;
    for (const line of source.lines) { const value = BigInt(line.quantity); quantities.set(line.skuId, (quantities.get(line.skuId) ?? 0n) + value); total += value; }
    let rows = sections.get(source.current.sizeGroupId);
    if (!rows) { rows = []; sections.set(source.current.sizeGroupId, rows); }
    rows.push({ key, current: source.current, skus: tupleSkus.get(key)!, lines: source.lines, quantities, total });
  }
  const output = data.catalog.sizeGroups.flatMap(group => {
    const rows = sections.get(group.sizeGroupId); return rows ? [{ group, rows }] : [];
  });
  if (output.length !== sections.size) throw new TypeError('Missing canonical transfer size group.');
  return output;
}
