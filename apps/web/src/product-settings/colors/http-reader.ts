import { createHttpJsonQuery, HttpQueryError, type HttpQueryOptions } from '../../transport/http-query.ts';
import { validateCatalogueSettingsPage, validateCatalogueSettingsTree, parseCatalogueSettingsByIdQuery, validateCatalogueSettingsByIdResult } from '../../../../../packages/application/src/catalogue-settings-read-validation.ts';
import type { CatalogueSettingsBrowserReader, CatalogueSettingsExactReader } from './contracts.ts';

function wire<T>(validate: () => T): T {
  try { return validate(); } catch { throw new HttpQueryError('malformed-response', 'INVALID_CATALOGUE_SETTINGS_RESPONSE'); }
}
/** Inert same-origin session reads. No fixtures, transaction candidates, browser roles,
 * importers, credentials, persistence or automatic retry. Host grants every enumeration. */
export function createCatalogueSettingsHttpReader(options: HttpQueryOptions): CatalogueSettingsBrowserReader & CatalogueSettingsExactReader {
  const http = createHttpJsonQuery(options);
  return Object.freeze<CatalogueSettingsBrowserReader & CatalogueSettingsExactReader>({
    readById: read => {
      const target = parseCatalogueSettingsByIdQuery(read.parameters);
      return http.post('/catalogue-settings-read/by-id', target, read.signal, value => wire(() => validateCatalogueSettingsByIdResult(value, target.id)));
    },
    readCategories: read => http.post('/catalogue-settings-read/categories/query', read.parameters, read.signal, value => wire(() => validateCatalogueSettingsTree(value))),
    readColors: read => http.post('/catalogue-settings-read/colors/query', read.parameters, read.signal, value => wire(() => validateCatalogueSettingsPage(value, { ...read.parameters }))),
    readFits: read => http.post('/catalogue-settings-read/fits/query', read.parameters, read.signal, value => wire(() => validateCatalogueSettingsPage(value, { ...read.parameters }))),
  });
}
