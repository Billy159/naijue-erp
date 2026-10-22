import { requireDomain } from '../../domain/src/errors.ts';
import { HISTORY_COUNT_KEYS } from './history-storage-contract.ts';
import { HISTORY_CLOSURE_SOURCE_ENTITIES, HISTORY_TYPED_CLOSURE_VERSION, encodeHistoryClosureValue } from './history-typed-closure.ts';
import type { HistoryTypedClosurePlan } from './history-typed-closure.ts';

const must = (value: unknown): void => requireDomain(value, 'INVALID_HISTORY_PUBLICATION_PLAN', 'Exact independently authorized bounded closure plan required');
function bag(value: unknown, keys: readonly string[]): Record<string, unknown> {
  must(value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === keys.length);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key); must(d?.enumerable && Object.hasOwn(d, 'value')); result[key] = d!.value;
  }
  return result;
}
function count(value: unknown, maximum = 2147483645): number {
  must(Number.isSafeInteger(value) && !Object.is(value, -0) && (value as number) >= 0 && (value as number) <= maximum); return value as number;
}
function counts<K extends string>(value: unknown, keys: readonly K[]): Record<K, number> {
  const r = bag(value, keys); return Object.fromEntries(keys.map(k => [k, count(r[k])])) as Record<K, number>;
}
function hash(value: unknown): string { must(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)); return value as string; }
/** Pure own-descriptor capture; no DB/source access, source grant or publication.
 * MAIN carries this entire value. Persisted documents are later re-read and must
 * reproduce its independently authorized digest; SQL never supplies the expected plan. */
export function captureHistoryTypedClosurePlan(value: unknown): HistoryTypedClosurePlan {
  const r = bag(value, ['version', 'selectionSha256', 'authorizedPayloadHash', 'sourceManifestSha256', 'typedManifestSha256', 'documentManifestSha256', 'expectedCounts', 'sourceEntityCounts', 'documentCount']);
  must(r.version === HISTORY_TYPED_CLOSURE_VERSION);
  const plan: HistoryTypedClosurePlan = { version: HISTORY_TYPED_CLOSURE_VERSION, selectionSha256: hash(r.selectionSha256), authorizedPayloadHash: hash(r.authorizedPayloadHash), sourceManifestSha256: hash(r.sourceManifestSha256), typedManifestSha256: hash(r.typedManifestSha256), documentManifestSha256: hash(r.documentManifestSha256), expectedCounts: counts(r.expectedCounts, HISTORY_COUNT_KEYS), sourceEntityCounts: counts(r.sourceEntityCounts, HISTORY_CLOSURE_SOURCE_ENTITIES), documentCount: count(r.documentCount, 100000) };
  const e = plan.expectedCounts, s = plan.sourceEntityCounts;
  for (const [entity, table] of [['SALES_HEADER', 'history_sales_header'], ['SALES_LINE', 'history_sales_line'], ['SETTLEMENT', 'history_sales_settlement'], ['TRANSFER_HEADER', 'history_transfer_header'], ['TRANSFER_LINE', 'history_transfer_line'], ['BARCODE', 'barcodes']] as const) must(s[entity] === e[table]);
  must(Object.values(s).reduce((a, b) => a + b, 0) === e.import_source_row && plan.documentCount === e.history_sales_header + e.history_transfer_header);
  must(encodeHistoryClosureValue(plan).byteLength <= 64 * 1024);
  return plan;
}
/** Exact new profile, independent of frozen schema18 STAGE recognition. This is
 * only shape recognition: full runtime DDL/routine/trigger/ACL pins are mandatory. */
export function assertHistoryPublicationSchema19(value: unknown): void {
  const valid = Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
    && Object.getOwnPropertyDescriptor(value, 'length')?.value === 19 && Reflect.ownKeys(value).length === 20
    && Array.from({ length: 19 }, (_, i) => Object.getOwnPropertyDescriptor(value, String(i)))
      .every((d, i) => d?.enumerable && Object.hasOwn(d, 'value') && d.value === i + 1);
  requireDomain(valid, 'HISTORY_PUBLICATION_SCHEMA_NOT_READY', 'Exact finite schema1–19 publication profile required');
}
