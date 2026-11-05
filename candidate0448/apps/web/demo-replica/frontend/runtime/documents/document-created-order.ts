/** Finite synthetic fixture ordering only. Production pages are globally ordered
 * by PostgreSQL before LIMIT/OFFSET; this must never sort a fetched UI page. */
export interface DocumentCreatedOrderKey {
  readonly createdAt: string | null;
  readonly documentId: string;
  readonly dataset: 'LIVE' | 'HISTORY';
  readonly batchId: string | null;
}
const binary = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
function instant(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) throw new TypeError('Actual UTC creation instant required.');
  return match[1]! + '.' + (match[2] ?? '').padEnd(6, '0') + 'Z';
}
export function compareDocumentCreatedOrder(a: DocumentCreatedOrderKey, b: DocumentCreatedOrderKey): number {
  const date = a.createdAt === null ? b.createdAt === null ? 0 : 1
    : b.createdAt === null ? -1 : binary(instant(b.createdAt), instant(a.createdAt));
  return date || binary(a.documentId, b.documentId) || binary(a.dataset, b.dataset)
    || (a.batchId === null ? b.batchId === null ? 0 : -1 : b.batchId === null ? 1 : binary(a.batchId, b.batchId));
}
