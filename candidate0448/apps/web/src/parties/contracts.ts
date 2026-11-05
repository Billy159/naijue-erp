import type { HttpQueryOptions } from '../transport/http-query.ts';

/** Closed, independent native identities. Never a dual-role entity. */
export type PartyKind = 'CUSTOMER' | 'SUPPLIER';
export type PartyAction = 'CREATE' | 'EDIT' | 'DISABLE' | 'RESTORE';
export type PartyPageSize = 20 | 50 | 100;
export interface PartyRecord {
  readonly id: string; readonly code: string; readonly name: string; readonly enabled: boolean;
  readonly version: number; readonly createdAt: string | null; readonly updatedAt: string | null;
}
export interface PartyCandidate { readonly id: string; readonly code: string; readonly name: string }
export interface PartySearch { readonly search: string; readonly enabled: 'ALL' | 'ENABLED' | 'DISABLED'; readonly page: number; readonly pageSize: PartyPageSize }
export interface PartyCandidateSearch { readonly search: string; readonly page: number; readonly pageSize: PartyPageSize }
export interface PartyPage<T> { readonly items: readonly T[]; readonly total: number; readonly page: number; readonly pageSize: PartyPageSize }
export type PartyCommand = { readonly action: 'CREATE'; readonly requestKey: string; readonly name: string }
  | { readonly action: 'EDIT'; readonly requestKey: string; readonly id: string; readonly expectedVersion: number; readonly name: string; readonly enabled: boolean }
  | { readonly action: 'DISABLE' | 'RESTORE'; readonly requestKey: string; readonly id: string; readonly expectedVersion: number };
export interface PartyResult { readonly operationId: string; readonly kind: PartyKind; readonly partyId: string; readonly version: number; readonly code: string; readonly enabled: boolean }
export interface PartyReceipt { readonly requestKey: string; readonly action: PartyAction; readonly status: 'COMMITTED'; readonly completedAt: string; readonly result: PartyResult }
export interface PartyClient {
  list(kind: PartyKind, parameters: PartySearch, signal: AbortSignal): Promise<PartyPage<PartyRecord>>;
  detail(kind: PartyKind, id: string, signal: AbortSignal): Promise<PartyRecord>;
  candidates(kind: PartyKind, parameters: PartyCandidateSearch, signal: AbortSignal): Promise<PartyPage<PartyCandidate>>;
  execute(kind: PartyKind, command: PartyCommand, signal: AbortSignal): Promise<PartyResult>;
  receipt(kind: PartyKind, requestKey: string, signal: AbortSignal): Promise<PartyReceipt>;
}
export type PartyHttpOptions = HttpQueryOptions;
export type PartyErrorKind = 'invalid-request' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'network' | 'timeout' | 'aborted' | 'malformed-response' | 'server';
export type PartyErrorOutcome = 'not-sent' | 'rejected' | 'uncertain' | 'read';
/** Safe constant text only. Never retains bodies, URLs, credentials or provider exceptions. */
export class PartyClientError extends Error {
  readonly kind: PartyErrorKind; readonly code: string; readonly outcome: PartyErrorOutcome; readonly status: number | null;
  constructor(kind: PartyErrorKind, code: string, outcome: PartyErrorOutcome, status: number | null = null) {
    super(({ 'invalid-request': '请求未通过校验。', unauthenticated: '登录已失效。', forbidden: '无权访问当前资料。', 'not-found': '未找到当前资料或回执。', conflict: '资料已改变或有关联限制。', network: '连接中断。', timeout: '请求超时。', aborted: '请求已中止。', 'malformed-response': '服务器返回无效。', server: '服务器暂未完成请求。' } as const)[kind]);
    this.name = kind === 'aborted' ? 'AbortError' : 'PartyClientError';
    this.kind = kind; this.code = code; this.outcome = outcome; this.status = status;
  }
}
export const partyLabels: Readonly<Record<PartyKind, string>> = Object.freeze({ CUSTOMER: '客户', SUPPLIER: '供应商' });
export const partyPageSizes: readonly PartyPageSize[] = Object.freeze([20, 50, 100]);
