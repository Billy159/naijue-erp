import type { CurrentFormSku } from '../../../../packages/application/src/current-form-ports.ts';
import type { createCurrentFormHttpReader } from './http-reader.ts';

export type DocumentFitChoice = { readonly id: string; readonly name: string };
export type DocumentFitSku = Pick<CurrentFormSku, 'colorId' | 'fitId' | 'fitName'>;
type FitsReader = ReturnType<typeof createCurrentFormHttpReader>['readFits'];

// In the catalogue dictionary, exact code 5 is A版（标准）.
export async function readDefaultDocumentFitIds(read: FitsReader, signal: AbortSignal): Promise<ReadonlySet<string> | null> {
  const ids = new Set<string>();
  for (let page = 1; page <= 50; page++) {
    const result = await read({ search: '5', page, pageSize: 20 }, signal);
    signal.throwIfAborted();
    for (const fit of result.items) if (fit.enabled && fit.code === '5') ids.add(fit.id);
    if (page * 20 >= result.total) return ids;
  }
  return null;
}

export function documentDefaultFitSkus(skus: readonly DocumentFitSku[], ids: ReadonlySet<string>): readonly DocumentFitSku[] {
  return skus.filter(sku => ids.has(sku.fitId)).map(({ colorId, fitId, fitName }) => ({ colorId, fitId, fitName }));
}

export function defaultDocumentFit(skus: readonly DocumentFitSku[], colorId?: string): DocumentFitChoice | null {
  if (!colorId) return null;
  const choices = new Map(skus.filter(sku => sku.colorId === colorId)
    .map(sku => [sku.fitId, { id: sku.fitId, name: sku.fitName }]));
  return choices.size === 1 ? choices.values().next().value ?? null : null;
}

export function documentSpecOptions<T extends Pick<CurrentFormSku, 'fitId' | 'colorId'>>(rows: readonly T[], kind: 'color' | 'fit', selection?: {
  readonly color: Pick<DocumentFitChoice, 'id'> | null; readonly fit: Pick<DocumentFitChoice, 'id'> | null; readonly defaultFit?: Pick<DocumentFitChoice, 'id'> | null;
} | null): readonly T[] {
  if (kind === 'fit') return selection?.color ? rows.filter(row => row.colorId === selection.color!.id) : rows;
  // Automatic A is a preference, not a filter that can hide valid colors.
  if (!selection?.fit || selection.fit === selection.defaultFit) return rows;
  return rows.filter(row => row.fitId === selection.fit!.id);
}
