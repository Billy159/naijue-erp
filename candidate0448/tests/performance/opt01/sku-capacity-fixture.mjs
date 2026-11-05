/** Exact reproducible v1 capacity witness. No raw 8 MiB body is written. */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const SKU_FIELDS = Object.freeze(['id', 'skuCode', 'productId', 'productCode', 'productName', 'colorId', 'colorName', 'fitId', 'fitName', 'sizeId', 'sizeName', 'sizeGroupId', 'barcodeAvailability']);
const uid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function stringWireV2(domain) {
  return { version: 2, skus: domain.skus.map(row => SKU_FIELDS.map(key => row[key])),
    products: domain.products.map(row => row.state === 'ELIGIBLE' ? [row.productId, row.state, row.sizeGroupId] : [row.productId, row.state]) };
}
export function capacityFixture() {
  const limit = 8 * 1024 * 1024, target = limit - 100;
  const base = Array.from({ length: 200 }, (_, i) => ({ id: uid(1000 + i), skuCode: `K${String(i).padStart(3, '0')}-`,
    productId: uid(20), productCode: 'SYN-A', productName: 'Synthetic A', colorId: uid(40), colorName: 'Synthetic color',
    fitId: uid(41), fitName: 'Synthetic fit', sizeId: uid(5000 + i), sizeName: 'S', sizeGroupId: uid(30), barcodeAvailability: 'UNAVAILABLE' }));
  const padding = target - Buffer.byteLength(JSON.stringify(base)), per = Math.floor(padding / 200), remainder = padding % 200;
  const skus = base.map((row, index) => ({ ...row, skuCode: row.skuCode + 'A'.repeat(per + (index < remainder ? 1 : 0)) }));
  const domain = { version: 1, skus, products: [{ productId: uid(20), state: 'ELIGIBLE', sizeGroupId: uid(30) }] };
  const legacyBytes = JSON.stringify(skus), version1Bytes = JSON.stringify(domain), version2Bytes = JSON.stringify(stringWireV2(domain));
  return { limit, domain, query: { context: { kind: 'TRANSFER' }, skuIds: skus.map(row => row.id) }, legacyBytes, version1Bytes, version2Bytes,
    receipt: { format: 'opt01-exact-sku-capacity-witness-v1', parameters: { skuCount: 200, productCount: 1, targetLegacyBytes: target, uidSkuStart: 1000, uidSizeStart: 5000, skuCodePrefix: 'K000-', padding: 'ASCII A distributed equally, first remainder rows gain one' },
      legacy: { bytes: Buffer.byteLength(legacyBytes), sha256: digest(legacyBytes) }, version1: { bytes: Buffer.byteLength(version1Bytes), sha256: digest(version1Bytes) },
      stringVersion2: { bytes: Buffer.byteLength(version2Bytes), sha256: digest(version2Bytes) },
      minSkuCodeLength: Math.min(...skus.map(row => row.skuCode.length)), maxSkuCodeLength: Math.max(...skus.map(row => row.skuCode.length)), rawBodiesWritten: false } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.stdout.write(JSON.stringify(capacityFixture().receipt, null, 2) + '\n');
