import { parseProductManagementCandidateQuery, parseProductManagementListQuery } from '../../../packages/application/src/product-management-query-validation.ts';
import type { ProductManagementCandidate, ProductManagementCandidateKind, ProductManagementListItem } from '../../../packages/application/src/product-management-query-ports.ts';
import { parseDictionaryListQuery, parseDictionarySchemeQuery } from '../../../packages/application/src/dictionary-read-validation.ts';
import type { DictionaryBarcodeScheme, DictionarySizeGroup, DictionarySeason } from '../../../packages/application/src/dictionary-read-ports.ts';
import { parseCatalogueSettingsListQuery, parseCatalogueSettingsTreeQuery } from '../../../packages/application/src/catalogue-settings-read-validation.ts';
import type { CatalogueSettingsCategory, CatalogueSettingsEntry } from '../../../packages/application/src/catalogue-settings-read-ports.ts';
import { parseProductQuery } from '../../../packages/application/src/product-query-validation.ts';

export const MANAGEMENT_SYNTHETIC_ORIGIN = 'https://synthetic-management.invalid';
export const syntheticId = (number: number) => `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
export type SyntheticReadFailure = 'none' | 'forbidden' | 'unavailable' | 'network' | 'empty';
export interface SyntheticManagementCall { readonly method: string; readonly path: string; readonly syntheticOnly: true }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const error = (status: number) => json({ error: { code: status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'SERVICE_UNAVAILABLE', message: 'Explicit synthetic acceptance state; no real server was called' } }, status);
const categories = [{ id: syntheticId(10), label: '合成服装', parentId: null, depth: 0 as const },
  { id: syntheticId(11), label: '合成衬衫', parentId: syntheticId(10), parentLabel: '合成服装', depth: 1 as const },
  { id: syntheticId(12), label: '合成长裤', parentId: syntheticId(10), parentLabel: '合成服装', depth: 1 as const }];
const fit = { id: syntheticId(30), label: '合成标准版' }, season = { id: syntheticId(20), label: '合成春夏' }, supplier = { id: syntheticId(40), label: '合成供应商（非真实单位）' };
interface SyntheticProduct extends ProductManagementListItem { readonly categoryId: string; readonly seasonId: string | null; readonly supplierId: string | null; readonly shapeCode: string | null; readonly systemCode: string }
const products: readonly SyntheticProduct[] = Object.freeze(Array.from({ length: 105 }, (_, index) => {
  const number = index + 1, unknown = index % 7 === 0;
  return Object.freeze({ id: syntheticId(1000 + number), code: `SYN-${String(number).padStart(4, '0')}`, name: `合成${number % 2 ? '衬衫' : '长裤'} ${number}（非正式商品）`,
    categoryId: syntheticId(number % 2 ? 11 : 12), categoryLabel: number % 2 ? '合成衬衫' : '合成长裤', year: unknown ? null : number % 2 ? 2026 : 2025,
    seasonId: unknown ? null : season.id, seasonLabel: unknown ? null : season.label, supplierId: unknown ? null : supplier.id, supplierLabel: unknown ? null : supplier.label,
    fits: unknown ? [] : [fit], thickness: unknown ? null : number % 2 ? '合成薄款' : '合成常规', shapeCode: unknown ? null : number % 2 ? 'SYN-COLLAR' : 'SYN-PANTS',
    retailPrice: unknown ? null : number % 5 ? '129.00' : '0.00', totalStock: unknown ? null : number % 4 ? String(number * 3) : '-2', systemCode: `SYN-SYSTEM-${number}` });
}));
const sizes = [
  { id: syntheticId(100), name: '165 / S', displayOrder: 1 }, { id: syntheticId(101), name: '170 / M', displayOrder: 2 }, { id: syntheticId(102), name: '175 / L', displayOrder: 3 },
];
const groups: readonly DictionarySizeGroup[] = Object.freeze(Array.from({ length: 23 }, (_, index) => ({ id: syntheticId(200 + index), name: `合成尺码组 ${String(index + 1).padStart(2, '0')}`, sizes: index === 22 ? [] : sizes })));
const seasons: readonly DictionarySeason[] = Object.freeze([{ id: season.id, name: season.label }, ...['合成秋季', '合成冬季'].map((name, index) => ({ id: syntheticId(300 + index), name }))]);
const schemes: readonly DictionaryBarcodeScheme[] = Object.freeze([
  { id: syntheticId(400), name: '合成当前方案（只读）', barcodeType: 'CODE128', ruleDescription: '合成示例：保留既有条码，不可在此重新生成。', codeLength: 18, ruleVersion: 'SYNTHETIC-1', status: 'CURRENT', applicability: null },
  { id: syntheticId(401), name: '合成历史方案（长度未知）', barcodeType: 'HISTORICAL-TEXT', ruleDescription: '合成历史记录；长度及适用范围未提供。', codeLength: null, ruleVersion: 'SYNTHETIC-HISTORY', status: 'HISTORICAL', applicability: null },
]);
const categorySource = [
  { id: syntheticId(10), parentId: null, name: '合成服装', displayOrder: -2 },
  { id: syntheticId(11), parentId: syntheticId(10), name: '合成衬衫', displayOrder: 1 },
  { id: syntheticId(12), parentId: syntheticId(10), name: '合成长裤', displayOrder: 2 },
  { id: syntheticId(15), parentId: null, name: '合成配饰', displayOrder: 3 },
  { id: syntheticId(16), parentId: syntheticId(15), name: '合成帽饰', displayOrder: 1 },
  { id: syntheticId(17), parentId: syntheticId(16), name: '合成便帽', displayOrder: -1 },
];
// Directory permission does NOT grant product counts, even inside this fixture.
const catalogueCategories: readonly CatalogueSettingsCategory[] = Object.freeze(categorySource.map(row => ({ ...row, version: 3, code: null, productCount: null,
  childCount: categorySource.filter(child => child.parentId === row.id).length })));
const catalogueEntries = (kind: 'colors' | 'fits'): readonly CatalogueSettingsEntry[] => Object.freeze(Array.from({ length: 23 }, (_, index) => ({
  id: syntheticId((kind === 'colors' ? 6000 : 7000) + index), code: kind === 'colors' ? `SYN-C${String(index + 1).padStart(2,'0')}` : String.fromCharCode(65 + index),
  name: `合成${kind === 'colors' ? '颜色' : '版型'} ${String(index + 1).padStart(2,'0')}`, enabled: index % 4 !== 2, version: index === 22 ? 7 : 1,
})));
const colors = catalogueEntries('colors'), fits = catalogueEntries('fits');
function outputProduct(row: SyntheticProduct): ProductManagementListItem {
  const { categoryId: _category, seasonId: _season, supplierId: _supplier, shapeCode: _shape, systemCode: _system, ...item } = row; return item;
}
function paginate<T>(items: readonly T[], query: { readonly page: number; readonly pageSize: number }, totalKey: 'total' | 'exactTotal') {
  return { page: query.page, pageSize: query.pageSize, [totalKey]: items.length, items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize) };
}
function candidateRows(kind: ProductManagementCandidateKind): readonly ProductManagementCandidate[] {
  switch (kind) {
    case 'product': return products.map(row => ({ id: row.id, label: `${row.code} ${row.name}`, code: row.code, name: row.name }));
    case 'category': return categories;
    case 'year': return [{ id: '2025', label: '2025年' }, { id: '2026', label: '2026年' }];
    case 'season': return [season]; case 'supplier': return [supplier]; case 'fit': return [fit];
    case 'thickness': return [{ id: '合成薄款', label: '合成薄款' }, { id: '合成常规', label: '合成常规' }];
    case 'shape': return [{ id: 'SYN-COLLAR', label: 'SYN-COLLAR' }, { id: 'SYN-PANTS', label: 'SYN-PANTS' }];
  }
}
/** Closed, injected, in-memory ACCEPTANCE transport. This module never calls global fetch,
 * reads storage, starts a server, connects a database or accepts passwords. Not a production fallback. */
export function createSyntheticManagementTransport(onCall?: (call: SyntheticManagementCall) => void) {
  let authorized = false, nextFailure: SyntheticReadFailure = 'none', nextDelay = 0;
  const calls: SyntheticManagementCall[] = [];
  return Object.freeze({
    calls: () => Object.freeze([...calls]),
    authorize: () => { authorized = true; }, revoke: () => { authorized = false; },
    setNextFailure: (failure: SyntheticReadFailure) => { if (!['none','forbidden','unavailable','network','empty'].includes(failure)) throw new TypeError('Unknown synthetic state'); nextFailure = failure; },
    setNextDelay: (milliseconds: number) => { if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > 5000) throw new TypeError('Invalid synthetic delay'); nextDelay = milliseconds; },
    http: Object.freeze({ origin: MANAGEMENT_SYNTHETIC_ORIGIN, basePath: '/api', fetch: async (input: string, init: RequestInit): Promise<Response> => {
      const url = new URL(input);
      if (url.origin !== MANAGEMENT_SYNTHETIC_ORIGIN || url.username || url.password || url.search || url.hash || !url.pathname.startsWith('/api/')) throw new TypeError('Synthetic transport rejected an external or malformed target');
      if (init.signal?.aborted) throw new DOMException('Synthetic read aborted', 'AbortError');
      const path = url.pathname.slice(4), method = init.method ?? 'GET';
      if (path === '/auth/login' || path === '/auth/password') throw new TypeError('Synthetic acceptance does not accept credential or password requests');
      const allowed = ['/auth/session', '/auth/logout', '/product-management/query', '/product-management/candidates/query', '/dictionary-read/size-groups/query', '/dictionary-read/seasons/query', '/dictionary-read/barcode-schemes/query', '/dictionary-read/barcode-scheme/query', '/products/basics/query', '/products/specifications/query', '/products/images/query', '/catalogue-settings-read/categories/query', '/catalogue-settings-read/colors/query', '/catalogue-settings-read/fits/query'];
      if (!allowed.includes(path) || method !== (path === '/auth/session' ? 'GET' : 'POST') || init.credentials !== 'same-origin') throw new TypeError('Synthetic transport rejected an unsupported operation');
      const call = Object.freeze({ method, path, syntheticOnly: true as const }); calls.push(call); onCall?.(call);
      if (path === '/auth/session') return authorized ? json({ principal: { accountId: syntheticId(900), staffId: syntheticId(901), loginName: 'SYNTHETIC-MANAGEMENT-ONLY', role: 'ADMIN', hallId: null, authVersion: 1 } }) : error(401);
      if (path === '/auth/logout') { authorized = false; return json({ ok: true }); }
      if (!authorized) return error(401);
      const body = JSON.parse(String(init.body));
      const failure = nextFailure, delay = nextDelay; nextFailure = 'none'; nextDelay = 0;
      // Intentionally ignore abort AFTER dispatch to exercise actual Application stale protection.
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (failure === 'forbidden') return error(403); if (failure === 'unavailable') return error(503); if (failure === 'network') throw new Error('Explicit synthetic network failure');
      const empty = failure === 'empty';
      if (path === '/product-management/query') {
        const query = parseProductManagementListQuery(body), f = query.filter;
        const matches = empty ? [] : products.filter(row => (!f.productIds.length || f.productIds.includes(row.id)) && (!f.categoryIds.length || f.categoryIds.includes(row.categoryId) || f.categoryIds.includes(syntheticId(10)))
          && (!f.years.length || row.year !== null && f.years.includes(String(row.year))) && (!f.seasonIds.length || row.seasonId !== null && f.seasonIds.includes(row.seasonId))
          && (!f.supplierIds.length || row.supplierId !== null && f.supplierIds.includes(row.supplierId)) && (!f.fitIds.length || row.fits.some(value => f.fitIds.includes(value.id)))
          && (!f.thicknesses.length || row.thickness !== null && f.thicknesses.includes(row.thickness)) && (!f.shapeCodes.length || row.shapeCode !== null && f.shapeCodes.includes(row.shapeCode)));
        return json(paginate(matches.map(outputProduct), query, 'exactTotal'));
      }
      if (path === '/product-management/candidates/query') {
        const query = parseProductManagementCandidateQuery(body), search = query.search.toLocaleLowerCase();
        const matches = empty ? [] : candidateRows(query.kind).filter(row => (!query.selectedIds.length || query.selectedIds.includes(row.id)) && (!search || `${row.label} ${row.code ?? ''} ${query.kind === 'product' ? products.find(value => value.id === row.id)?.systemCode ?? '' : ''}`.toLocaleLowerCase().includes(search)));
        return json(paginate(matches, query, 'exactTotal'));
      }
      if (path === '/catalogue-settings-read/categories/query') {
        parseCatalogueSettingsTreeQuery(body); return json({ total: empty ? 0 : catalogueCategories.length, items: empty ? [] : catalogueCategories });
      }
      if (path === '/catalogue-settings-read/colors/query' || path === '/catalogue-settings-read/fits/query') {
        const query = parseCatalogueSettingsListQuery(body), source = path === '/catalogue-settings-read/colors/query' ? colors : fits;
        return json(paginate(empty ? [] : source.filter(row => `${row.name} ${row.code}`.toLocaleLowerCase().includes(query.search.toLocaleLowerCase())), query, 'total'));
      }
      if (path === '/dictionary-read/barcode-scheme/query') { const query = parseDictionarySchemeQuery(body); return json(empty ? null : schemes.find(row => row.id === query.schemeId) ?? null); }
      if (path.startsWith('/dictionary-read/')) {
        const query = parseDictionaryListQuery(body), source = path === '/dictionary-read/size-groups/query' ? groups : path === '/dictionary-read/seasons/query' ? seasons : schemes;
        return json(paginate(empty ? [] : source.filter(row => row.name.toLocaleLowerCase().includes(query.search.toLocaleLowerCase())), query, 'total'));
      }
      const query = parseProductQuery(body), product = products.find(row => row.id === query.productId);
      if (!product || empty) return json(null);
      if (path === '/products/basics/query') return json({ productId: product.id, code: product.code, name: product.name, categoryLabel: product.categoryLabel, yearLabel: product.year === null ? null : String(product.year), seasonLabel: product.seasonLabel, supplierLabel: product.supplierLabel, systemCode: product.systemCode, retailPrice: product.retailPrice });
      if (path === '/products/specifications/query') return json({ productId: product.id, sizeGroup: { id: groups[0]!.id, label: groups[0]!.name }, colors: product.fits.length ? [{ id: syntheticId(50), label: '合成蓝色' }] : [], fits: product.fits, sizes: sizes.map(row => ({ id: row.id, label: row.name })), skus: product.fits.length ? sizes.map((row,index) => ({ id: syntheticId(500000 + Number(product.code.slice(4)) * 10 + index), colorId: syntheticId(50), fitId: fit.id, sizeId: row.id })) : [] });
      return json({ productId: product.id, images: [] });
    } }),
  });
}
