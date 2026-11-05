import { syntheticId } from '../management-browser-harness/synthetic-transport.ts';
import { parseStoreSettingsDetailQuery, parseStoreSettingsListQuery } from '../../../packages/application/src/store-settings-read-validation.ts';
import type { StoreSettingsEntry, StoreSettingsStore, StoreSettingsWarehouse } from '../../../packages/application/src/store-settings-read-ports.ts';

export const storeSettingsSyntheticPaths = new Set(['/store-settings-read/stores/query', '/store-settings-read/stores/detail/query', '/store-settings-read/warehouses/query', '/store-settings-read/warehouses/detail/query']);
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
/** Explicit synthetic-only directory. Missing timestamps, names and stock stay
 * missing. This module is never imported by the real route/reader/HTTPS host. */
export function createSyntheticStoreSettingsTransport() {
  const stores: readonly StoreSettingsStore[] = Array.from({ length: 43 }, (_, index) => ({
    kind: 'stores', id: syntheticId(6100 + index), name: `合成营业厅 ${index + 1}（非正式）`, enabled: index % 7 !== 6,
    version: index + 1, createdAt: null, updatedAt: null, defaultCustomer: null,
    defaultWarehouse: index === 0 ? { id: syntheticId(7100), name: null } : null,
  }));
  const warehouses: readonly StoreSettingsWarehouse[] = Array.from({ length: 27 }, (_, index) => ({
    kind: 'warehouses', id: syntheticId(7100 + index), name: `合成仓库 ${index + 1}（非正式）`, enabled: index % 6 !== 5,
    version: index + 1, createdAt: null, updatedAt: null, stockFacts: null,
    hall: { id: stores[index % stores.length]!.id, name: index === 0 ? null : stores[index % stores.length]!.name },
  }));
  return { request(path: string, body: unknown, empty: boolean): Response {
    if (!storeSettingsSyntheticPaths.has(path)) throw new TypeError('Unsupported synthetic store settings operation');
    const kind = path.includes('/warehouses/') ? 'warehouses' : 'stores';
    const entries: readonly StoreSettingsEntry[] = kind === 'stores' ? stores : warehouses;
    if (path.includes('/detail/')) {
      const query = parseStoreSettingsDetailQuery(body);
      return json({ item: empty ? null : entries.find(item => item.id === query.id) ?? null });
    }
    const query = parseStoreSettingsListQuery(body, kind);
    const items = empty ? [] : entries.filter(item => (query.status === 'all' || item.enabled === (query.status === 'normal'))
      && item.name.toLocaleLowerCase().includes(query.search.toLocaleLowerCase())
      && (!query.hallId || item.kind === 'warehouses' && item.hall.id === query.hallId));
    return json({ page: query.page, pageSize: query.pageSize, total: items.length, items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize) });
  } };
}
