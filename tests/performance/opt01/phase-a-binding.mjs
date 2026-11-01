/** Explicit AFTER source selection. Never relabels active/after source as original C03. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const phaseSourceRoot = path.resolve(process.env.OPT01_PHASE_A_SOURCE_ROOT ?? repository);
assert.equal(process.version, 'v24.21.0');
export const phaseLoad = relative => import(pathToFileURL(path.join(phaseSourceRoot, relative)).href);
export const phaseSourcePaths = [
  'packages/application/src/current-form-ports.ts', 'packages/application/src/source-confirmed-current-form-authorization.ts',
  'adapters/postgres/src/current-form-reader.ts', 'apps/api/src/current-form-http.ts',
  'apps/web/src/current-form/http-reader.ts', 'apps/web/src/current-form/sales-existing-document.ts',
  'apps/web/src/current-form/transfer-existing-document.ts',
];
export async function phaseSourceBinding() {
  return { phase: 'OPT01_A_AFTER_R2_FINAL_STRING_V2_NOT_C03_BASELINE', root: phaseSourceRoot, files: await Promise.all(phaseSourcePaths.map(async name => {
    const bytes = await readFile(path.join(phaseSourceRoot, name));
    return { path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  })) };
}
export const uid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
export const signal = () => new AbortController().signal;
export const wireSku = (patch = {}) => ({ id: uid(10), skuCode: 'SYN-SKU-A', productId: uid(20), productCode: 'SYN-A', productName: 'Synthetic A',
  colorId: uid(40), colorName: 'Synthetic color', fitId: uid(41), fitName: 'Synthetic fit',
  sizeId: uid(50), sizeName: 'Synthetic size', sizeGroupId: uid(30), barcodeAvailability: 'UNAVAILABLE', ...patch });
export const skus = () => [wireSku(), wireSku({ id: uid(11), skuCode: 'SYN-SKU-A2', sizeId: uid(51) }),
  wireSku({ id: uid(12), skuCode: 'SYN-SKU-B', productId: uid(21), productCode: 'SYN-B', productName: 'Synthetic B', sizeGroupId: uid(31) })];
export const response = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
