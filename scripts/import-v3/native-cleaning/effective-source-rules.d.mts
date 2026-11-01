/** Pure selection models, not an extractor/writer or a real-data compliance grant. */
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue; }
export interface ProductMembership { id: string; branch: 'SOURCE' | 'OVERLAY_ONLY'; }
export interface MasterRecord extends JsonObject { kind: string; id: string; body: JsonObject; }
export interface MaintainedMasterRecord extends MasterRecord { sourceFacts: JsonObject; }
/** Documented domain: already validated finite ordinary JSON, no Proxy/cycles/accessors. */
export function productMembership(input: unknown): ProductMembership[];
/** Only string/null price facts; preserves empty strings/precision and upper-layer explicit null. */
export function minimumPriceText(input: unknown): string | null;
/** Only the merge AFTER the old source/static master row factory. No kind-specific defaults. */
export function mergeProductMasterRecord(input: unknown): MasterRecord;
/** Only replacement AFTER specialized fund/party projections. No permission or login inference. */
export function replaceBusinessMasterRecord(input: unknown): MaintainedMasterRecord;
