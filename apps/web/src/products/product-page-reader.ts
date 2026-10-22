import type { ProductFullPageReadOnlyReader } from './product-page-contracts.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
export function guardedProductPageReader(scope: ReadScope, reader: ProductFullPageReadOnlyReader, denied: (error: HttpQueryError) => void): ProductFullPageReadOnlyReader {
  const run = async <T,>(signal: AbortSignal, work: () => Promise<T>): Promise<T> => {
    if (!scope.active || signal.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    try { return await work(); } catch (error) {
      if (scope.active && !signal.aborted && error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) {
        scope.dispose(); try { denied(error); } catch { /* Already cleared. */ }
      }
      throw error;
    }
  };
  return Object.freeze({ ...(reader.base ? { base: Object.freeze({ read: read => run(read.signal, () => reader.base!.read(read)) }) } : {}),
    ...(reader.specs ? { specs: Object.freeze({ read: read => run(read.signal, () => reader.specs!.read(read)) }) } : {}),
    ...(reader.images ? { images: Object.freeze({ read: read => run(read.signal, () => reader.images!.read(read)), readImage: read => run(read.signal, () => reader.images!.readImage(read)) }) } : {}) } satisfies ProductFullPageReadOnlyReader);
}
