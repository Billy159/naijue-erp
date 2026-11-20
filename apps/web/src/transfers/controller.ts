import type { ReadScope } from '../loading/read-scope.ts';
import type { TransferReader } from './contracts.ts';
import { createTransferListQuery } from './model.ts';
import { childTransferScope } from './scope.ts';

let instance = 0;
/** Construction is inert. The active route owns its initial bounded list read;
 * candidates/details require their own explicit activation. No fixture port. */
export function createTransferPageController(parentScope: ReadScope, reader: TransferReader) {
  if (!parentScope.active || typeof reader?.readList !== 'function' || typeof reader.readDetail !== 'function') throw new TypeError('An active scope and native transfer reader are required.');
  const instanceId = String(++instance); const scope = childTransferScope(parentScope, `transfer-page:${instanceId}`);
  const list = createTransferListQuery(scope, reader);
  return Object.freeze({ instanceId, parentScope, scope, reader, list, dispose: () => scope.dispose() });
}
export type TransferPageController = ReturnType<typeof createTransferPageController>;
