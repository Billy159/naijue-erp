import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { InventoryPage, InventoryProduct, InventoryParameters, InventoryReader, StockCell, StockTotal } from './contracts.ts';

/** Exact integers remain strings across the UI boundary. Negative values are preserved. */
export function assertQuantity(value: string): void {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(value)) {
    throw new TypeError('库存数量必须是明确的整数文本。');
  }
}
export function totalOf(cells: readonly StockCell[]): StockTotal {
  let known = 0n, unknownCells = 0;
  for (const cell of cells) {
    if (cell?.state === 'known') { assertQuantity(cell.quantity); known += BigInt(cell.quantity); }
    else if (cell?.state === 'unknown') { if (Object.keys(cell).sort().join(',') !== 'skuId,state') throw new TypeError('库存数据未完整核实，不能按零发布。'); if (!cell.skuId?.trim()) throw new TypeError('库存来源 SKU 身份缺失。'); unknownCells++; }
    else if (cell?.state !== 'not-applicable') throw new TypeError('库存数据未完整核实，不能按零发布。');
  }
  return { knownQuantity: String(known), completeness: unknownCells ? 'incomplete' : 'complete', unknownCells };
}
export function formatQuantity(value: string): string {
  assertQuantity(value);
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
export function cellLabel(cell: { readonly state: 'known'; readonly quantity: string } | { readonly state: 'not-applicable' } | { readonly state: 'unknown'; readonly skuId: string } | { readonly state: 'unknown'; readonly knownQuantity: string; readonly unknownCells: number }): string {
  if (cell.state === 'known') return formatQuantity(cell.quantity);
  if (cell.state === 'not-applicable') return '—';
  return 'knownQuantity' in cell ? totalLabel({ knownQuantity: cell.knownQuantity, unknownCells: cell.unknownCells, completeness: 'incomplete' }) : '未知';
}
export function totalLabel(total: StockTotal): string {
  assertTotal(total);
  return total.completeness === 'complete' ? formatQuantity(total.knownQuantity) : `已知 ${formatQuantity(total.knownQuantity)}（${total.unknownCells}格未知）`;
}
function assertTotal(total: StockTotal): void {
  if (!total || !Number.isSafeInteger(total.unknownCells) || total.unknownCells < 0 || (total.unknownCells === 0 ? total.completeness !== 'complete' : total.completeness !== 'incomplete')) throw new TypeError('库存汇总完整性未核实，不能发布部分结果。');
  assertQuantity(total.knownQuantity);
}

export function sumTotals(totals: readonly StockTotal[]): StockTotal {
  for (const total of totals) assertTotal(total);
  const unknownCells = totals.reduce((sum, total) => sum + total.unknownCells, 0);
  if (!Number.isSafeInteger(unknownCells)) throw new TypeError('库存未知格数超出范围。');
  return { knownQuantity: String(totals.reduce((sum, total) => sum + BigInt(total.knownQuantity), 0n)), unknownCells, completeness: unknownCells ? 'incomplete' : 'complete' };
}

function sameTotal(actual: StockTotal, expected: StockTotal): void {
  if (actual.knownQuantity !== expected.knownQuantity || actual.unknownCells !== expected.unknownCells || actual.completeness !== expected.completeness) throw new TypeError('库存汇总与完整当前页模型不一致，不能把未知当零。');
}
function nonempty(value: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('库存身份或显示标签缺失。');
}
function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) throw new TypeError('库存结果存在重复身份。');
}
/** A failed/incomplete transport cannot become a zero-stock success. */
export function assertInventoryPage(data: InventoryPage, parameters: Readonly<InventoryParameters>): void {
  if (!data || data.page !== parameters.page || data.pageSize !== parameters.pageSize || !Number.isSafeInteger(data.exactTotalProducts) || data.exactTotalProducts < 0) throw new TypeError('库存分页响应与已执行条件不一致。');
  if (!Array.isArray(data.products) || data.products.length > parameters.pageSize) throw new TypeError('库存页超出商品分页边界。');
  const expectedCount = Math.min(parameters.pageSize, Math.max(0, data.exactTotalProducts - (parameters.page - 1) * parameters.pageSize));
  if (data.products.length !== expectedCount) throw new TypeError('库存页条数与确切商品总数不一致。');
  nonempty(data.readReference);
  unique(data.products.map(product => product.id));
  assertTotal(data.allMatchesTotal);
  for (const product of data.products as readonly InventoryProduct[]) {
    [product.id, product.code, product.name, product.sizeGroup.id, product.sizeGroup.label].forEach(nonempty);
    if (!product.sizes.length) throw new TypeError('库存商品缺少已核实尺码列。');
    unique(product.sizes.map(size => size.id));
    unique(product.colorFits.map(group => JSON.stringify([group.color.id, group.fit.id])));
    assertTotal(product.total);
    for (const size of product.sizes) { nonempty(size.id); nonempty(size.label); assertTotal(product.sizeTotals[size.id]!); }
    const skuCoordinates = new Map<string, string>();
    for (const group of product.colorFits) {
      [group.color.id, group.color.label, group.fit.id, group.fit.label].forEach(nonempty);
      unique(group.rows.map(row => row.warehouse.id));
      assertTotal(group.total);
      for (const size of product.sizes) assertTotal(group.sizeTotals[size.id]!);
      for (const row of group.rows) {
        [row.warehouse.id, row.warehouse.label].forEach(nonempty);
        assertTotal(row.total);
        if (Object.keys(row.cells).length !== product.sizes.length) throw new TypeError('库存格数量与已核实尺码列不一致。');
        for (const size of product.sizes) {
          const cell = row.cells[size.id];
          if (!cell || !['known', 'unknown', 'not-applicable'].includes(cell.state) || Object.keys(cell).sort().join(',') !== (cell.state === 'known' ? 'quantity,skuId,state' : cell.state === 'unknown' ? 'skuId,state' : 'state')) throw new TypeError('库存格缺少明确状态，不能当作零库存。');
          if (cell.state !== 'not-applicable') {
            nonempty(cell.skuId);
            const coordinate = JSON.stringify([group.color.id, group.fit.id, size.id]);
            const previous = skuCoordinates.get(cell.skuId);
            if (previous !== undefined && previous !== coordinate) throw new TypeError('同一 SKU 不能合并不同颜色、版型或尺码。');
            skuCoordinates.set(cell.skuId, coordinate);
          }
          if (cell.state === 'known') assertQuantity(cell.quantity);
        }
        sameTotal(row.total, totalOf(product.sizes.map(size => row.cells[size.id]!)));
      }
      sameTotal(group.total, sumTotals(group.rows.map(row => row.total)));
      for (const size of product.sizes) sameTotal(group.sizeTotals[size.id]!, totalOf(group.rows.map(row => row.cells[size.id]!)));
    }
    sameTotal(product.total, sumTotals(product.colorFits.map(group => group.total)));
    for (const size of product.sizes) sameTotal(product.sizeTotals[size.id]!, sumTotals(product.colorFits.map(group => group.sizeTotals[size.id]!)));
  }
  const pageTotal = sumTotals(data.products.map(product => product.total));
  if (data.exactTotalProducts === data.products.length) sameTotal(data.allMatchesTotal, pageTotal);
}
export function createInventoryQuery(scope: ReadScope, reader: InventoryReader): LatestQuery<InventoryParameters, InventoryPage> {
  return new LatestQuery({ scope, execute: async read => {
    const data = await reader.readInventory(read);
    assertInventoryPage(data, read.parameters);
    return data;
  } });
}
