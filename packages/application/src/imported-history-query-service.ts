import type { ActorContext } from './ports.ts';
import type { ImportedHistoryKind, ImportedHistoryReadAuthorization, ImportedHistoryReadDependencies, ImportedHistoryReadIntent, ImportedHistoryReader } from './imported-history-query-ports.ts';
import { activeImportedHistoryRead, checkedImportedHistoryActor, checkedImportedHistoryGrant, checkedImportedHistoryKind, parseImportedHistoryDetailQuery, parseImportedHistoryListQuery, validateImportedHistoryDetail, validateImportedHistoryList } from './imported-history-query-validation.ts';

/** Explicit policy is captured at construction and called for every request. */
export function createImportedHistoryQueryService(dependencies: ImportedHistoryReadDependencies) {
  if (typeof dependencies?.authorization?.authorize !== 'function' || typeof dependencies.reader?.readList !== 'function' || typeof dependencies.reader.readDetail !== 'function') throw new TypeError('Historical reads require explicit authorization and reader');
  const authorize = dependencies.authorization.authorize.bind(dependencies.authorization) as ImportedHistoryReadAuthorization['authorize'];
  const reader: ImportedHistoryReader = Object.freeze({ readList: dependencies.reader.readList.bind(dependencies.reader), readDetail: dependencies.reader.readDetail.bind(dependencies.reader) });
  async function context(actor: ActorContext, intent: ImportedHistoryReadIntent, signal: AbortSignal) {
    const currentActor = checkedImportedHistoryActor(actor); activeImportedHistoryRead(signal);
    // A provider receives its own clone; neither immediate nor delayed mutations change SQL intent.
    const grant = checkedImportedHistoryGrant(await authorize(currentActor, structuredClone(intent), signal), intent, currentActor);
    activeImportedHistoryRead(signal); return Object.freeze({ actor: currentActor, intent, grant, signal });
  }
  return Object.freeze({
    async readList(actor: ActorContext, kind: ImportedHistoryKind, input: unknown, signal: AbortSignal) {
      checkedImportedHistoryKind(kind);
      const intent = Object.freeze({ kind, operation: 'list' as const, parameters: parseImportedHistoryListQuery(input, kind) });
      const read = await context(actor, intent, signal), result = await reader.readList(read); activeImportedHistoryRead(signal);
      return validateImportedHistoryList(result, intent, read.grant);
    },
    async readDetail(actor: ActorContext, kind: ImportedHistoryKind, input: unknown, signal: AbortSignal) {
      checkedImportedHistoryKind(kind);
      const intent = Object.freeze({ kind, operation: 'detail' as const, parameters: parseImportedHistoryDetailQuery(input, kind) });
      const read = await context(actor, intent, signal), result = await reader.readDetail(read); activeImportedHistoryRead(signal);
      return validateImportedHistoryDetail(result, intent, read.grant);
    }
  });
}
