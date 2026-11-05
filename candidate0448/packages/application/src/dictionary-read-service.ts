import type { ActorContext } from './ports.ts';
import type { DictionaryReadDependencies, DictionaryReadIntent, DictionaryScopedRead } from './dictionary-read-ports.ts';
import { activeDictionaryRead, checkedDictionaryActor, checkedDictionaryGrant, parseDictionaryListQuery, parseDictionarySchemeQuery, validateDictionaryPage, validateDictionaryScheme, validateDictionarySeason, validateDictionarySizeGroup } from './dictionary-read-validation.ts';

/** Inert, read-only service; no identity, permission, source arrays or production fallback. */
export function createDictionaryReadService(dependencies: DictionaryReadDependencies) {
  if (typeof dependencies?.authorization?.authorize !== 'function' || !['readSizeGroups', 'readSeasons', 'readBarcodeSchemes', 'readBarcodeScheme'].every(method => typeof dependencies.reader?.[method as keyof typeof dependencies.reader] === 'function')) throw new TypeError('Dictionary reads require explicit trusted authorization and reader');
  async function read<T>(actor: ActorContext, intent: DictionaryReadIntent, signal: AbortSignal, work: (read: DictionaryScopedRead) => Promise<T>): Promise<T> {
    const trustedActor = checkedDictionaryActor(actor); activeDictionaryRead(signal);
    const grant = checkedDictionaryGrant(await dependencies.authorization.authorize(trustedActor, intent, signal), intent); activeDictionaryRead(signal);
    const result = await work(Object.freeze({ actor: trustedActor, grant, intent, signal })); activeDictionaryRead(signal); return result;
  }
  return Object.freeze({
    readSizeGroups(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseDictionaryListQuery(input);
      return read(actor, Object.freeze({ kind: 'size-groups', operation: 'list', parameters }), signal, async scoped => validateDictionaryPage(await dependencies.reader.readSizeGroups(scoped), parameters, validateDictionarySizeGroup));
    },
    readSeasons(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseDictionaryListQuery(input);
      return read(actor, Object.freeze({ kind: 'seasons', operation: 'list', parameters }), signal, async scoped => validateDictionaryPage(await dependencies.reader.readSeasons(scoped), parameters, validateDictionarySeason));
    },
    readBarcodeSchemes(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseDictionaryListQuery(input);
      return read(actor, Object.freeze({ kind: 'barcode-schemes', operation: 'list', parameters }), signal, async scoped => validateDictionaryPage(await dependencies.reader.readBarcodeSchemes(scoped), parameters, validateDictionaryScheme));
    },
    readBarcodeScheme(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseDictionarySchemeQuery(input);
      return read(actor, Object.freeze({ kind: 'barcode-schemes', operation: 'detail', parameters }), signal, async scoped => {
        const value = await dependencies.reader.readBarcodeScheme(scoped); if (value === null) return null;
        const result = validateDictionaryScheme(value); if (result.id !== parameters.schemeId) throw new Error('Mismatched trusted dictionary scheme target'); return result;
      });
    }
  });
}
