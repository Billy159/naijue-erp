import { createHttpJsonQuery, HttpQueryError, type HttpQueryOptions } from '../../transport/http-query.ts';
import { parseStoreSettingsDetailQuery, parseStoreSettingsListQuery, validateStoreSettingsDetail, validateStoreSettingsPage } from '../../../../../packages/application/src/store-settings-read-validation.ts';
import type { StoreSettingsBrowserReader } from './contracts.ts';
function wire<T>(work: () => T): T { try { return work(); } catch { throw new HttpQueryError('malformed-response', 'INVALID_STORE_SETTINGS_RESPONSE'); } }
/** Inert session-backed reader. Identity revisions are lifecycle facts only and
 * never sent as authority. No fixture, transaction candidate or native importer. */
export function createStoreSettingsHttpReader(options: HttpQueryOptions): StoreSettingsBrowserReader {
  const http = createHttpJsonQuery(options);
  return Object.freeze<StoreSettingsBrowserReader>({
    readList(kind, read) { if (kind !== 'stores' && kind !== 'warehouses') throw new TypeError('Unknown store settings kind'); const parameters = parseStoreSettingsListQuery({ ...read.parameters }, kind); return http.post(`/store-settings-read/${kind}/query`, parameters, read.signal, value => wire(() => validateStoreSettingsPage(value, kind, parameters))); },
    readDetail(kind, read) { if (kind !== 'stores' && kind !== 'warehouses') throw new TypeError('Unknown store settings kind'); const parameters = parseStoreSettingsDetailQuery({ ...read.parameters }); return http.post(`/store-settings-read/${kind}/detail/query`, parameters, read.signal, value => wire(() => validateStoreSettingsDetail(value, kind, parameters))); }
  });
}
