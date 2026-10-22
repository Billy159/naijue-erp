import { detail as seedFixtureDetail, summary as seedFixtureSummary } from '../src/transfers/tests/fixtures.ts';
import { detail as fixtureDetail } from '../src/transfers/commands/fixtures.test-support.ts';
import { sourceConfirmedCreateDocumentNumber } from '../../../packages/application/src/source-confirmed-document-number.ts';
import type { TransferDraftDto } from '../src/transfers/commands/contracts.ts';
import type { SyntheticTransactionFailure } from './types.ts';
import { reviewProfile, type UnifiedReviewProfile } from './review-profile.ts';
import { createReadonlyTransferFixtures } from './readonly-transfer-fixtures.ts';
import { parseTransferListQuery } from '../../../packages/application/src/transfer-query-validation.ts';
/** Extracted acceptance-only protocol from the existing transaction harness.
 * Native preparation/price functions and new SAVE/receipt boundary are preserved.
 * No import-time DOM, actual network, stock command or production host. */
export function createSyntheticTransferTransport(onRecord: (message: string) => void = () => {}, profile: UnifiedReviewProfile = 'standard') {
const readonlyFixtures = reviewProfile(profile) === 'transfer-readonly' ? createReadonlyTransferFixtures() : null;
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const base = fixtureDetail(), documents = new Map<string, TransferDraftDto>();
const seedSource = seedFixtureDetail(), seed = { ...seedSource, stockBasis: 'CUTOFF_HISTORY' as const, document: { ...seedSource.document, header: { ...seedSource.document.header, number: 'SYN-HISTORY-DB-001', note: '合成只读历史示例（非正式）' } } };
const seedSummary = { ...seedFixtureSummary(), number: seed.document.header.number };

const principal = { accountId: uuid(900), staffId: uuid(950), loginName: 'SYNTHETIC-BROWSER-ONLY', role: 'ADMIN', hallId: null, authVersion: 1 };
const warehouses = [20, 21, 22].map(n => ({ id: uuid(n), name: `合成仓库 ${n}`, hallId: uuid(10), hallName: '合成营业厅', enabled: true, hallEnabled: true, hasNonzeroInventory: false }));
const products = [{ id: uuid(40), code: 'SYN-001', name: '合成验收衬衫（非真实商品）', retailPrice: '39.90', minimumPriceAvailability: 'UNAVAILABLE' }];
const skus = [70, 71].map((n, index) => ({ id: uuid(n), skuCode: `SYN-SKU-${n}`, productId: uuid(40), productCode: 'SYN-001', productName: products[0]!.name, colorId: uuid(41), colorName: '合成红色', fitId: uuid(42), fitName: 'Y版（修身）', sizeId: uuid(60 + index), sizeName: index ? '170/M' : '165/S', sizeGroupId: uuid(50), barcodeAvailability: 'UNAVAILABLE' }));
let failure: SyntheticTransactionFailure = 'none';
let delayMs = 0, writes = 0;
const receipts = new Map<string, unknown>();
const record = onRecord;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const deny = (status: number) => json({ error: { code: status === 403 ? 'FORBIDDEN' : 'SERVICE_UNAVAILABLE', message: 'Explicit synthetic failure' } }, status);
const page = (items: readonly unknown[], query: { page: number; pageSize: number }) => json({ page: query.page, pageSize: query.pageSize, exactTotal: String(items.length), items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize) });
const referenceNames = (draft: TransferDraftDto) => ({ fromWarehouseName: warehouses.find(row => row.id === draft.header.fromWarehouseId)?.name ?? '合成调出仓', toWarehouseName: warehouses.find(row => row.id === draft.header.toWarehouseId)?.name ?? '合成调入仓', fromHallName: '合成营业厅', toHallName: '合成营业厅', createdByName: '合成验收账号', approvedByName: null });
const currentDetail = (draft: TransferDraftDto) => ({ ...base, document: { header: { ...base.document.header, ...draft.header, status: 'DRAFT', version: 1, createdByAccountId: principal.accountId }, lines: draft.lines }, references: referenceNames(draft) });
const http = { origin: 'https://synthetic-management.invalid', basePath: '/api', fetch: async (url: string, init: RequestInit): Promise<Response> => {
  const body = init.body ? JSON.parse(String(init.body)) : null;
  const endpoint = new URL(url).pathname.replace('/api', ''); record(`${init.method} ${endpoint}`);
  if (endpoint === '/auth/session') return json({ principal });
  if (endpoint === '/auth/logout') return json({ ok: true });
  if (readonlyFixtures && (endpoint === '/transfers/commands' || endpoint === '/transfers/prepare-create')) return deny(403);
  if (endpoint.startsWith('/current-form/') && failure === 'candidate403') return deny(403);
  if (endpoint === '/current-form/transfer-warehouses/query') return page(warehouses.filter(row => row.name.includes(body.search)), body);
  if (endpoint === '/current-form/products/query') return page(products.filter(row => `${row.code} ${row.name}`.includes(body.search)), body);
  if (endpoint === '/current-form/product-skus/query') return page(skus.filter(row => row.productId === body.productId), body);
  if (endpoint === '/transfers/prepare-create') {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs)); // Intentionally ignores abort, to verify stale protection.
    if (failure === 'prepare403') return deny(403);
    if (failure === 'prepareUnavailable') return deny(503);
    const id = crypto.randomUUID();
    return json({ header: { id, number: sourceConfirmedCreateDocumentNumber('TRANSFER', id), businessDate: body.businessDate, fromWarehouseId: body.fromWarehouseId, toWarehouseId: body.toWarehouseId, note: body.note }, lines: body.lines.map((line: { skuId: string; quantity: string }, index: number) => {
      const sku = skus.find(row => row.id === line.skuId); if (!sku) throw Error('Unknown synthetic SKU');
      return { id: crypto.randomUUID(), transferId: id, lineNo: index + 1, skuId: sku.id, quantity: line.quantity, isCurrent: true,
        snapshot: { productCode: sku.productCode, productName: sku.productName, colorName: sku.colorName, fitName: sku.fitName, sizeName: sku.sizeName, barcode: `SYNTHETIC-MAIN-${sku.skuCode}` } };
    }) });
  }
  if (endpoint === '/transfers/commands') {
    if (body.action !== 'SAVE' || body.expectedVersion !== null) return json({ error: { code: 'INVALID_STATE', message: 'Harness only accepts new SAVE; not an edit/stock/approval simulation.' } }, 409);
    if (receipts.has(body.requestKey)) return json((receipts.get(body.requestKey) as { result: unknown }).result);
    documents.set(body.draft.header.id, body.draft); writes++;
    const result = { transferId: body.draft.header.id, operationId: crypto.randomUUID(), version: 1, status: 'DRAFT', ledgerEntryIds: [] };
    receipts.set(body.requestKey, { requestKey: body.requestKey, action: 'SAVE', status: 'COMMITTED', completedAt: new Date().toISOString(), result });
    record(`SYNTHETIC ONLY: ${writes} SAVE(s) in page memory; no database writes.`);
    if (failure === 'saveUncertain') throw Error('Synthetic dropped response after in-memory save');
    return json(result);
  }
  if (endpoint.startsWith('/transfers/receipts/')) return receipts.has(decodeURIComponent(endpoint.split('/').at(-1)!)) ? json(receipts.get(decodeURIComponent(endpoint.split('/').at(-1)!))) : json({ error: { code: 'RECEIPT_NOT_FOUND', message: 'Synthetic absent' } }, 404);
  if (endpoint === '/transfers/query') {
    if (readonlyFixtures) { const query = parseTransferListQuery(body), f = query.filter; return page(readonlyFixtures.summaries.filter(row => (!f.number || row.number.toLowerCase().includes(f.number.toLowerCase())) && (!f.startDate || row.businessDate >= f.startDate) && (!f.endDate || row.businessDate <= f.endDate) && (!f.statuses.length || f.statuses.includes(row.status)) && (!f.fromWarehouseIds.length || f.fromWarehouseIds.includes(row.fromWarehouseId)) && (!f.toWarehouseIds.length || f.toWarehouseIds.includes(row.toWarehouseId))), query); }
    return page([seedSummary,...[...documents.values()].map(draft => ({ ...currentDetail(draft).document.header, totalQuantity: draft.lines.reduce((sum, row) => sum + BigInt(row.quantity), 0n).toString(), ...referenceNames(draft) })).map(({ approvedAt: _a, approvedByAccountId: _b, createdHallId: _c, createdRole: _d, note: _n, ...row }) => row)], body);
  }
  if (endpoint === '/transfers/detail/query') { if (readonlyFixtures) return readonlyFixtures.details.some(row => row.document.header.id === body.transferId) ? json(readonlyFixtures.details.find(row => row.document.header.id === body.transferId)) : json({ error: { code: 'DOCUMENT_NOT_FOUND', message: 'Synthetic absent' } }, 404); if(body.transferId===seed.document.header.id)return json(seed); const draft = documents.get(body.transferId); return draft ? json(currentDetail(draft)) : json({ error: { code: 'DOCUMENT_NOT_FOUND', message: 'Synthetic absent' } }, 404); }
  if (endpoint === '/transfers/warehouses/query') return page(warehouses.map(({ hasNonzeroInventory: _stock, ...row }) => row), body);
  throw Error(`Unsupported synthetic endpoint: ${endpoint}`);
} };

return Object.freeze({http, savedCount: () => writes,
 hasReadOnlyProduct: (productId: unknown) => !!readonlyFixtures && productId === readonlyFixtures.basics.productId,
 readOnlyProduct(path: string, productId: unknown, empty: boolean) {
   if (!readonlyFixtures || productId !== readonlyFixtures.basics.productId) throw new TypeError('Readonly fixture product not configured.');
   if (path === '/products/basics/query') return json(empty ? null : readonlyFixtures.basics);
   if (path === '/products/specifications/query') return json(empty ? null : readonlyFixtures.specifications);
   if (path === '/products/images/query') return json(empty ? null : readonlyFixtures.images);
   return json({ error: { code: 'IMAGE_NOT_FOUND', message: 'Synthetic fixture has no images' } }, 404);
 },
 setFailure(value: SyntheticTransactionFailure) { failure = value; },
 setPreparationDelay(milliseconds: number) { if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > 5000) throw new TypeError('Invalid synthetic preparation delay'); delayMs = milliseconds; },
});
}
