import { businessDate, entityId, version, type EntityKind } from '../../../packages/domain/src/values.ts';

/** SYNTHETIC ONLY. Deterministic fixture identities, never imported business data. */
export const sid = <K extends EntityKind>(kind: K, serial: number) => entityId(kind, `f0000000-0000-4000-8000-${String(serial).padStart(12, '0')}`);
export const product = { id: sid('product', 1), code: 'SYNTH-001', name: '合成测试上衣（非业务商品）' };
export const color = { id: sid('color', 10), label: '合成蓝' };
export const fits = [{ id: sid('fit', 20), label: 'Y版（修身）' }, { id: sid('fit', 21), label: 'A版（标准）' }] as const;
export const sizes = ['160/XS', '165/S', '170/M', '175/L', '180/XL', '185/2XL', '190/3XL', '195/4XL', '200/5XL', '205/6XL', '无尺码'].map((label, index) => ({ id: sid('size', 30 + index), label }));
export const sizeGroup = { id: sid('sizeGroup', 50), label: '合成男装上衣尺码组' };
export const hall = { id: sid('hall', 60), label: '合成测试营业厅' };
export const warehouses = [{ id: sid('warehouse', 70), label: '合成测试总仓' }, { id: sid('warehouse', 71), label: '合成测试门店仓' }] as const;
export const customer = { id: sid('customer', 80), label: '合成测试客户（非真人）' };
export const salesperson = { id: sid('staff', 81), label: '合成测试营业员（非真人）' };
export const supplier = { id: sid('supplier', 82), label: '合成测试供应商' };
export const account = sid('account', 83);
export const category = { id: sid('category', 84), label: '合成测试服装' };
export const season = { id: sid('season', 85), label: '合成测试秋季' };
export const sku = (fit: number, size: number) => sid('sku', 100 + fit * 10 + size);
export const date = businessDate('2026-10-20');
export const stamp = '2026-10-20T08:00:00Z';
export const fixtureVersion = version(1);
export const skuSnapshot = (fit: number, size: number) => ({ productCode: product.code, productName: product.name, colorName: color.label, fitName: fits[fit]!.label, sizeName: sizes[size]!.label, barcode: null });

export type ReadKind = 'inventory' | 'inventoryCandidates' | 'salesList' | 'salesDetail' | 'salesReferences' | 'transferList' | 'transferDetail' | 'transferWarehouses' | 'productBasics' | 'productSpecifications' | 'productImages' | 'productOriginal';
export type ReportRead = (kind: ReadKind) => void;
export async function syntheticRead(signal: AbortSignal, report: ReportRead, kind: ReadKind): Promise<void> {
  if (signal.aborted) throw new Error('SYNTHETIC ONLY：读取已取消。');
  report(kind);
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('SYNTHETIC ONLY：读取已取消。')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 80);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); }
  });
}
