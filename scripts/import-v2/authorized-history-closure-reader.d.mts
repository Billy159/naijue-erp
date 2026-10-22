import type { HistoryCounts } from '../../packages/application/src/history-storage-contract.ts';
import type { HistoryClosureSourceEntity, HistoryClosureRow, HistoryTypedClosureStageInput } from '../../packages/application/src/history-typed-closure.ts';
export type HistoryClosureSourceGroup='PARTIES'|'CATALOGUE'|'PRODUCTS'|'SKUS'|'BARCODES'|'STOCK_CONTRIBUTORS'|'PAYMENT'|'HEADERS'|'SALES_DETAILS'|'SETTLEMENTS'|'TRANSFER_LINES';
export const HISTORY_CLOSURE_SOURCE_GROUPS:readonly HistoryClosureSourceGroup[];
export const HISTORY_CLOSURE_SOURCE_GROUP_ENTITIES:Readonly<Record<HistoryClosureSourceGroup,readonly HistoryClosureSourceEntity[]>>;
export const HISTORY_CLOSURE_SOURCE_GROUP_RELATIONS:Readonly<Record<HistoryClosureSourceGroup,readonly string[]>>;
export interface HistoryClosureExpectedScope {
 readonly batchId:string;readonly fixedSourceNamespace:string;readonly selectionSha256:string;readonly authorizedPayloadHash:string;
 readonly expectedCounts:HistoryCounts;readonly expectedSourceEntityCounts:Readonly<Record<HistoryClosureSourceEntity,number>>;
}
export type HistoryClosureDocumentAllocation=Pick<HistoryTypedClosureStageInput['documents'][number],'kind'|'sourceKey'|'headerSourceRowId'|'headerId'>;
type Rows<T>=Iterable<T>|AsyncIterable<T>;
/** Trusted independent complete source+mapping producer, never a report/boolean or SQL readback.
 * HEADERS must rederive/authenticate full original OOXML, whole32/creator/temporal provenance.
 * Other groups must authenticate original source, approved mapping/native allocation and full
 * row coverage. No default adapters are supplied; missing production providers remain blocked.
 * Return a fresh plain object with five own function fields on each call. A session cannot be
 * reused across groups or replays; a verify return value/report is never accepted as authority.
 * Factories clean up their own resources on construction failure. close is always awaited.
 */
export interface HistoryClosureSourceSession {
 readonly verify:(phase:'BEFORE_READ'|'AFTER_READ')=>Promise<void>;
 readonly sourceRows:()=>Rows<HistoryClosureRow>;
 readonly typedRows:()=>Rows<HistoryClosureRow>;
 readonly documents:()=>Rows<HistoryClosureDocumentAllocation>;
 readonly close:()=>Promise<void>;
}
export type HistoryClosureSourceFactory=(scope:HistoryClosureExpectedScope,context:Readonly<{group:HistoryClosureSourceGroup;signal:AbortSignal}>)=>Promise<HistoryClosureSourceSession>;
export interface AuthorizedHistoryClosureReader {
 /** Complete source-derived expected plan only; does not STAGE, import or publish. */
 expected():Promise<HistoryTypedClosureStageInput>;
 /** Reopens/rechecks complete production providers on EVERY call/replay, before store connection. */
 authorizeStage(input:HistoryTypedClosureStageInput):Promise<void>;
 /** Cancels in-flight grant, waits for all opened sessions to finish their own close. */
 close():Promise<void>;
}
export function openAuthorizedHistoryClosureReader(options:{
 readonly scope:HistoryClosureExpectedScope;
 readonly openSources:Readonly<Record<HistoryClosureSourceGroup,HistoryClosureSourceFactory>>;
 /** Independent trusted-host pins, not extracted from scope or a source package's own report. */
 readonly trustedSelectionSha256:string;
 readonly trustedAuthorizedPayloadHash:string;
}):Promise<AuthorizedHistoryClosureReader>;
