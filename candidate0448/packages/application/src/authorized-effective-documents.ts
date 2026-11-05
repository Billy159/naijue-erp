import { requireDomain } from '../../domain/src/errors.ts';
import { decimalToMinor, entityId } from '../../domain/src/values.ts';

/** Read facts only. Publication, current actor/hall scope and effective-revision
 * validity are proved by the existing reader on its original RR client. This
 * identity neither grants access nor makes an unpublished history row readable.
 * Original local times and instants stay distinct; neither a missing timestamp
 * nor a missing amount/quantity can be replaced with the current time or zero. */
export type EffectiveDocumentIdentity =
  | { readonly dataset: 'LIVE'; readonly batchId: null; readonly documentId: string; readonly effectiveVersion: number }
  | { readonly dataset: 'HISTORY'; readonly batchId: string; readonly documentId: string; readonly effectiveVersion: number };

export function authorizedEffectiveDocumentIdentity(dataset: unknown, batchId: unknown, documentId: unknown, effectiveVersion: unknown): EffectiveDocumentIdentity {
  requireDomain((dataset === 'LIVE' && batchId === null) || (dataset === 'HISTORY' && typeof batchId === 'string'),
    'INVALID_DATABASE_VALUE', 'Exact dataset and original import batch required');
  requireDomain(typeof documentId === 'string' && typeof effectiveVersion === 'number' && Number.isSafeInteger(effectiveVersion)
    && effectiveVersion > 0 && effectiveVersion <= 2147483647, 'INVALID_DATABASE_VALUE', 'Exact effective document identity/version required');
  entityId('operation', documentId);
  if (dataset === 'LIVE') return { dataset, batchId: null, documentId, effectiveVersion };
  entityId('operation', batchId as string);
  return { dataset: 'HISTORY', batchId: batchId as string, documentId, effectiveVersion };
}

/** A page and its count must represent the same authorized filtered set. BigInt
 * arithmetic retains deep-page and aggregate precision; an empty page does not
 * turn a nonempty total into zero. */
export function assertEffectiveDocumentPage(identities: readonly EffectiveDocumentIdentity[], page: number, pageSize: number, total: bigint): void {
  requireDomain(Number.isSafeInteger(page) && page > 0 && Number.isSafeInteger(pageSize) && pageSize > 0 && total >= 0n,
    'INVALID_DATABASE_VALUE', 'Exact document page and total required');
  const remaining = total - BigInt(page - 1) * BigInt(pageSize);
  const expected = remaining <= 0n ? 0n : remaining < BigInt(pageSize) ? remaining : BigInt(pageSize);
  requireDomain(BigInt(identities.length) === expected, 'INVALID_DATABASE_VALUE', 'Document page differs from its exact authorized count');
  const keys = identities.map(row => `${row.dataset}:${row.batchId}:${row.documentId}`);
  requireDomain(new Set(keys).size === keys.length, 'INVALID_DATABASE_VALUE', 'Repeated effective document identity');
}

export function nullableEffectiveDocumentQuantity(value: unknown): bigint | null {
  if (value === null) return null;
  requireDomain(typeof value === 'string' && /^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(value), 'INVALID_DATABASE_VALUE', 'Exact nullable document quantity required');
  return BigInt(value);
}

export function nullableEffectiveDocumentMoney(value: unknown): bigint | null {
  if (value === null) return null;
  requireDomain(typeof value === 'string', 'INVALID_DATABASE_VALUE', 'Exact nullable document money required');
  return decimalToMinor(value, { scale: 2 });
}
