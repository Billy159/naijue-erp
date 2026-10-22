import type { ActorContext } from './ports.ts';

export const dictionaryPageSizes = [20, 50, 100] as const;
export type DictionaryPageSize = typeof dictionaryPageSizes[number];
export type DictionaryKind = 'size-groups' | 'seasons' | 'barcode-schemes';
export interface DictionaryListQuery { readonly search: string; readonly page: number; readonly pageSize: DictionaryPageSize }
export interface DictionarySchemeQuery { readonly schemeId: string }
export type DictionaryReadIntent =
  | { readonly kind: DictionaryKind; readonly operation: 'list'; readonly parameters: DictionaryListQuery }
  | { readonly kind: 'barcode-schemes'; readonly operation: 'detail'; readonly parameters: DictionarySchemeQuery };
/** Server-only explicit catalogue enumeration/target grant. Not a transaction-candidate grant.
 * No provider or role default is supplied. The trusted host must recheck current access. */
export interface DictionaryReadGrant { readonly kind: DictionaryKind; readonly targetId: string | null }
export interface DictionaryReadAuthorization {
  authorize(actor: ActorContext, intent: DictionaryReadIntent, signal: AbortSignal): Promise<DictionaryReadGrant>;
}
export interface DictionaryScopedRead {
  readonly actor: ActorContext; readonly grant: DictionaryReadGrant; readonly intent: DictionaryReadIntent; readonly signal: AbortSignal;
}
export interface DictionarySize { readonly id: string; readonly name: string; readonly displayOrder: number }
export interface DictionarySizeGroup { readonly id: string; readonly name: string; readonly sizes: readonly DictionarySize[] }
export interface DictionarySeason { readonly id: string; readonly name: string }
/** Descriptions only; never executable rules or an instruction to regenerate old barcodes.
 * Native schema has no applicability/prefix/segments facts. Null applicability is explicit. */
export interface DictionaryBarcodeScheme {
  readonly id: string; readonly name: string; readonly barcodeType: string; readonly ruleDescription: string;
  readonly codeLength: number | null; readonly ruleVersion: string; readonly status: 'CURRENT' | 'HISTORICAL';
  readonly applicability: null;
}
export interface DictionaryPage<T> { readonly page: number; readonly pageSize: DictionaryPageSize; readonly total: number; readonly items: readonly T[] }
export interface DictionaryReader {
  readSizeGroups(read: DictionaryScopedRead): Promise<DictionaryPage<DictionarySizeGroup>>;
  readSeasons(read: DictionaryScopedRead): Promise<DictionaryPage<DictionarySeason>>;
  readBarcodeSchemes(read: DictionaryScopedRead): Promise<DictionaryPage<DictionaryBarcodeScheme>>;
  readBarcodeScheme(read: DictionaryScopedRead): Promise<DictionaryBarcodeScheme | null>;
}
export interface DictionaryReadDependencies { readonly authorization: DictionaryReadAuthorization; readonly reader: DictionaryReader }
