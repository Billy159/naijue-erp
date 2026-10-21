import { createApplication, createDemoFrameWorkspaceRenderer } from '../src/application/index.tsx';
import type { RouteStylesheet } from '../src/application/contracts.ts';
import { detail as fixtureDetail } from '../src/transfers/commands/fixtures.test-support.ts';
import { sourceConfirmedCreateDocumentNumber } from '../../../packages/application/src/source-confirmed-document-number.ts';
import type { TransferDraftDto } from '../src/transfers/commands/contracts.ts';
import '../src/transfers/detail.css';
import '../src/demo-controls/single-select.css';
import '../src/demo-controls/multi-select.css';
import '../src/components/product-candidate-action.css';
import './harness.css';

// Explicit synthetic in-memory transport. Never calls global fetch, a database or
// a real authentication endpoint. This file is not imported by production hosts.
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const base = fixtureDetail(), documents = new Map<string, TransferDraftDto>();
const principal = { accountId: uuid(900), staffId: uuid(950), loginName: 'SYNTHETIC-BROWSER-ONLY', role: 'ADMIN', hallId: null, authVersion: 1 };
const warehouses = [20, 21, 22].map(n => ({ id: uuid(n), name: `合成仓库 ${n}`, hallId: uuid(10), hallName: '合成营业厅', enabled: true, hallEnabled: true, hasNonzeroInventory: false }));
const products = [{ id: uuid(40), code: 'SYN-001', name: '合成验收衬衫（非真实商品）', retailPrice: '39.90', minimumPriceAvailability: 'UNAVAILABLE' }];
const skus = [70, 71].map((n, index) => ({ id: uuid(n), skuCode: `SYN-SKU-${n}`, productId: uuid(40), productCode: 'SYN-001', productName: products[0]!.name, colorId: uuid(41), colorName: '合成红色', fitId: uuid(42), fitName: 'Y版（修身）', sizeId: uuid(60 + index), sizeName: index ? '170/M' : '165/S', sizeGroupId: uuid(50), barcodeAvailability: 'UNAVAILABLE' }));
let failure: 'none' | 'candidate403' | 'prepare403' | 'prepareUnavailable' | 'saveUncertain' = 'none';
let delayPreparation = false, writes = 0;
const receipts = new Map<string, unknown>();
const log = document.getElementById('calls')!;
function record(message: string) { log.textContent = `${new Date().toISOString().slice(11, 19)} ${message}\n${log.textContent ?? ''}`.slice(0, 10000); }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const deny = (status: number) => json({ error: { code: status === 403 ? 'FORBIDDEN' : 'SERVICE_UNAVAILABLE', message: 'Explicit synthetic failure' } }, status);
const page = (items: readonly unknown[], query: { page: number; pageSize: number }) => json({ page: query.page, pageSize: query.pageSize, exactTotal: String(items.length), items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize) });
const referenceNames = (draft: TransferDraftDto) => ({ fromWarehouseName: warehouses.find(row => row.id === draft.header.fromWarehouseId)?.name ?? '合成调出仓', toWarehouseName: warehouses.find(row => row.id === draft.header.toWarehouseId)?.name ?? '合成调入仓', fromHallName: '合成营业厅', toHallName: '合成营业厅', createdByName: '合成验收账号', approvedByName: null });
const currentDetail = (draft: TransferDraftDto) => ({ ...base, document: { header: { ...base.document.header, ...draft.header, status: 'DRAFT', version: 1, createdByAccountId: principal.accountId }, lines: draft.lines }, references: referenceNames(draft) });
const http = { origin: 'https://synthetic.invalid', basePath: '/api', fetch: async (url: string, init: RequestInit): Promise<Response> => {
  const body = init.body ? JSON.parse(String(init.body)) : null;
  const endpoint = new URL(url).pathname.replace('/api', ''); record(`${init.method} ${endpoint}`);
  if (endpoint === '/auth/session') return json({ principal });
  if (endpoint === '/auth/logout') return json({ ok: true });
  if (endpoint.startsWith('/current-form/') && failure === 'candidate403') return deny(403);
  if (endpoint === '/current-form/transfer-warehouses/query') return page(warehouses.filter(row => row.name.includes(body.search)), body);
  if (endpoint === '/current-form/products/query') return page(products.filter(row => `${row.code} ${row.name}`.includes(body.search)), body);
  if (endpoint === '/current-form/product-skus/query') return page(skus.filter(row => row.productId === body.productId), body);
  if (endpoint === '/transfers/prepare-create') {
    if (delayPreparation) await new Promise(resolve => setTimeout(resolve, 5000)); // Intentionally ignores abort, to verify stale protection.
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
  if (endpoint === '/transfers/query') return page([...documents.values()].map(draft => ({ ...currentDetail(draft).document.header, totalQuantity: draft.lines.reduce((sum, row) => sum + BigInt(row.quantity), 0n).toString(), ...referenceNames(draft) })).map(({ approvedAt: _a, approvedByAccountId: _b, createdHallId: _c, createdRole: _d, note: _n, ...row }) => row), body);
  if (endpoint === '/transfers/detail/query') { const draft = documents.get(body.transferId); return draft ? json(currentDetail(draft)) : json({ error: { code: 'DOCUMENT_NOT_FOUND', message: 'Synthetic absent' } }, 404); }
  if (endpoint === '/transfers/warehouses/query') return page(warehouses.map(({ hasNonzeroInventory: _stock, ...row }) => row), body);
  throw Error(`Unsupported synthetic endpoint: ${endpoint}`);
} };
// Harness bundles existing CSS in main.css; not evidence of production lazy CSS.
const bundledStyles = (): RouteStylesheet => ({ async load() { if (!document.querySelector('link[href="./main.css"], style[data-harness-style]')) throw Error('Harness CSS unavailable'); }, dispose() {} });
const app = createApplication({ http, presentation: { renderWorkspace: createDemoFrameWorkspaceRenderer(), renderRouteState: ({ controller, state }) => <section className="harness-state"><p>{state.phase === 'home' ? '请在左侧打开调拨单列表。合成数据仅保存在此页面内存，刷新全部清除。' : `界面状态：${state.phase}`}</p>{['error', 'cancelled'].includes(state.phase) && <button onClick={() => { void controller.navigate(state.route); }}>重试路由</button>}</section> }, routes: { transfers: { stylesheet: bundledStyles(), detailStylesheet: bundledStyles(), commands: { newRequestKey: () => crypto.randomUUID(), manualCreate: true } } } });
app.mount(document.getElementById('root')!);
document.getElementById('authorize')!.addEventListener('click', () => { failure = 'none'; (document.getElementById('failure') as HTMLSelectElement).value = 'none'; void app.controller.authentication.resolveSession(); });
document.getElementById('home')!.addEventListener('click', () => { void app.controller.navigate(null); });
document.getElementById('transfer')!.addEventListener('click', () => { void app.controller.navigate('transfers'); });
document.getElementById('failure')!.addEventListener('change', event => { failure = (event.target as HTMLSelectElement).value as typeof failure; record(`Next synthetic behavior: ${failure}`); });
document.getElementById('delay')!.addEventListener('change', event => { delayPreparation = (event.target as HTMLInputElement).checked; });
record('SYNTHETIC HARNESS READY. Click 模拟授权; no real credentials or network API.');
