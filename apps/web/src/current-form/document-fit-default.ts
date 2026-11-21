import type { CurrentFormSku } from '../../../../packages/application/src/current-form-ports.ts';
import type { createCurrentFormHttpReader } from './http-reader.ts';

export type DocumentFitChoice = { readonly id: string; readonly name: string };
type FitsReader = ReturnType<typeof createCurrentFormHttpReader>['readFits'];

// The current catalogue uses numeric code 5; older catalogues use literal A.
export async function readDefaultDocumentFitIds(read: FitsReader, signal: AbortSignal): Promise<ReadonlySet<string> | null> {
  const ids = new Set<string>();
  for (const code of ['5', 'A']) {
    let complete = false;
    for (let page = 1; page <= 50; page++) {
      const result = await read({ search: code, page, pageSize: 20 }, signal);
      signal.throwIfAborted();
      for (const fit of result.items) if (fit.enabled && fit.code === code) ids.add(fit.id);
      if (page * 20 >= result.total) { complete = true; break; }
    }
    if (!complete) return null;
  }
  return ids;
}

export function defaultDocumentFit(skus: readonly CurrentFormSku[], ids: ReadonlySet<string>, colorId?: string): DocumentFitChoice | null {
  const choices = new Map(skus.filter(sku => ids.has(sku.fitId) && (!colorId || sku.colorId === colorId))
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
