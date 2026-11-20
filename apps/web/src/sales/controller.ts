import type { ReadScope } from '../loading/read-scope.ts';
import type { SalesReader } from './contracts.ts';
import { createSalesListQuery } from './model.ts';

let instance = 0;
/** One controller per mounted sales route. Explicit host inputs only, no singleton,
 * default account, fixture reader, startup read or mutation API. */
export function createSalesPageController(scope: ReadScope, reader: SalesReader) {
  if (!scope.active || typeof reader?.readList !== 'function' || typeof reader.readDetail !== 'function') throw new TypeError('An active scope and an explicit sales reader are required.');
  const list = createSalesListQuery(scope, reader);
  return Object.freeze({ instanceId: String(++instance), scope, reader, list, dispose: () => list.dispose() });
}
export type SalesPageController = ReturnType<typeof createSalesPageController>;
