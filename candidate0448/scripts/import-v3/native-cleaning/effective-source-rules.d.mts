/** Pure selection models, not an extractor/writer or a real-data compliance grant. */
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue; }
export interface ProductMembership { id: string; branch: 'SOURCE' | 'OVERLAY_ONLY'; }
export interface MasterRecord extends JsonObject { kind: string; id: string; body: JsonObject; }
export interface MaintainedMasterRecord extends MasterRecord { sourceFacts: JsonObject; }
/** Documented domain: already validated finite ordinary JSON, no Proxy/cycles/accessors. */
export function productMembership(input: unknown): ProductMembership[];
/** Private exact-ID links only; no credential consumption, target ID allocation or login grant. */
export function linkLegacyEmployeeIdentities(input: {sourceEmployees: unknown; accounts: unknown; operators: unknown}): {
  status: 'EXACT_ID_LINKS_NOT_TARGET_MAPPING_NOT_LOGIN_AUTHORIZATION';
  links: {id: string; sourceEmployeePresent: boolean; accountPresent: boolean; operatorPresent: boolean}[];
  counts: {sourceEmployees: number; accounts: number; operators: number; sourceWithoutAccount: number;
    accountWithoutSource: number; operatorOnly: number; accountWithoutOperator: number};
  sourceCompletenessVerified: false; credentialCompatibilityVerified: false; targetWrites: 0;
};
/** Only string/null price facts; preserves empty strings/precision and upper-layer explicit null. */
export function minimumPriceText(input: unknown): string | null;
/** PostgreSQL jsonb text adapter; numeric prices retain their exact token, without rounding. */
export function minimumPriceFromLegacyJsonText(input: {profileJson: string | null; overlayJson: string | null; sourcePayloadJson: string | null}): string | null;
/** Already losslessly decoded bodies, including exact numeric token wrappers. */
export function minimumPriceFromLegacyObjects(input: {profile: unknown; overlay: unknown; sourcePayload: unknown}): string | null;
/** Only the merge AFTER the old source/static master row factory. No kind-specific defaults. */
export function mergeProductMasterRecord(input: unknown): MasterRecord;
/** Only replacement AFTER specialized fund/party projections. No permission or login inference. */
export function replaceBusinessMasterRecord(input: unknown): MaintainedMasterRecord;
