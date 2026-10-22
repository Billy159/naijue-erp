import { createHttpJsonQuery, HttpQueryError, type HttpQueryOptions } from '../../transport/http-query.ts';
import { validateDictionaryPage, validateDictionaryScheme, validateDictionarySeason, validateDictionarySizeGroup } from '../../../../../packages/application/src/dictionary-read-validation.ts';
import type { DictionaryBrowserReader } from './contracts.ts';
function wire<T>(validate: () => T): T { try { return validate(); } catch { throw new HttpQueryError('malformed-response', 'INVALID_DICTIONARY_RESPONSE'); } }
/** Same-origin session only. No source fixtures, browser roles, importer calls or retries. */
export function createDictionaryHttpReader(options: HttpQueryOptions): DictionaryBrowserReader {
  const http = createHttpJsonQuery(options);
  return Object.freeze<DictionaryBrowserReader>({
    readSizeGroups: read => http.post('/dictionary-read/size-groups/query', read.parameters, read.signal, value => wire(() => validateDictionaryPage(value, read.parameters, validateDictionarySizeGroup))),
    readSeasons: read => http.post('/dictionary-read/seasons/query', read.parameters, read.signal, value => wire(() => validateDictionaryPage(value, read.parameters, validateDictionarySeason))),
    readBarcodeSchemes: read => http.post('/dictionary-read/barcode-schemes/query', read.parameters, read.signal, value => wire(() => validateDictionaryPage(value, read.parameters, validateDictionaryScheme))),
    readBarcodeScheme: read => http.post('/dictionary-read/barcode-scheme/query', read.parameters, read.signal, value => wire(() => {
      if (value === null) return null; const result = validateDictionaryScheme(value); if (result.id !== read.parameters.schemeId) throw new Error(); return result;
    }))
  });
}
