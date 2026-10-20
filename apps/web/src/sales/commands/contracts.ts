import type { SalesDraft, SalesPricingRule } from '../../../../../packages/domain/src/documents.ts';
import type { SalesAction, SalesResult } from '../../../../../packages/application/src/ports.ts';
import type { SalesDetailDto, SalesReader } from '../contracts.ts';
import type { ReadScope } from '../../loading/read-scope.ts';

/** Wire counterparts of the existing native contracts. No actor, role or scope is sent. */
type Wire<T> = T extends bigint ? string : T extends string ? string : T extends number ? number
  : T extends readonly (infer Item)[] ? readonly Wire<Item>[] : T extends object ? { readonly [K in keyof T]: Wire<T[K]> } : T;
export type SalesDraftDto = Omit<Wire<SalesDraft>, 'lines'> & { readonly lines: readonly (Omit<Wire<SalesDraft['lines'][number]>, 'pricingRule' | 'zeroConfirmed' | 'isCurrent'> & {
  readonly pricingRule: SalesPricingRule; readonly zeroConfirmed: boolean; readonly isCurrent: true;
})[] };
export type SalesCommandDto = { readonly action: 'SAVE'; readonly requestKey: string; readonly expectedVersion: number | null; readonly draft: SalesDraftDto }
  | { readonly action: Exclude<SalesAction, 'SAVE'>; readonly requestKey: string; readonly expectedVersion: number; readonly salesId: string };
export type SalesCommandResultDto = Wire<SalesResult>;
export interface SalesCommandReceiptDto {
  readonly requestKey: string; readonly action: SalesAction; readonly status: 'COMMITTED'; readonly completedAt: string; readonly result: SalesCommandResultDto;
}
export interface SalesCommandClient {
  execute(command: SalesCommandDto, signal: AbortSignal): Promise<SalesCommandResultDto>;
  /** Recovery is always bound to the original complete command, never only a loose key. */
  receipt(command: SalesCommandDto, signal: AbortSignal): Promise<SalesCommandReceiptDto>;
}
export type SalesCommandErrorKind = 'invalid-request' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'network' | 'timeout' | 'aborted' | 'malformed-response' | 'server';
export type SalesCommandOutcome = 'not-sent' | 'rejected' | 'uncertain' | 'read';
/** Safe constants only; never retains response messages, URLs, credentials or causes. */
export class SalesCommandError extends Error {
  readonly kind: SalesCommandErrorKind; readonly code: string; readonly outcome: SalesCommandOutcome; readonly status: number | null;
  constructor(kind: SalesCommandErrorKind, code: string, outcome: SalesCommandOutcome, status: number | null = null) {
    super(({ 'invalid-request': '销货请求未通过校验。', unauthenticated: '登录已失效。', forbidden: '无权执行当前操作。', 'not-found': '未找到单据或操作回执。', conflict: '单据版本或状态已改变。', network: '连接中断。', timeout: '请求超时。', aborted: '已停止等待请求。', 'malformed-response': '服务器返回无效。', server: '服务器暂未完成请求。' } as const)[kind]);
    this.name = kind === 'aborted' ? 'AbortError' : 'SalesCommandError';
    this.kind = kind; this.code = code; this.outcome = outcome; this.status = status;
  }
}
/** Future host integration only. Implementations must use actual authorized current
 * product/SKU/reference/account providers, not historical filter candidates. These
 * prepared client facts are proposals, NEVER server pricing/authorization authority. */
export interface SalesFormPreparationProvider {
  prepareCreate(signal: AbortSignal): Promise<SalesDraftDto>;
  prepareEdit(detail: SalesDetailDto, signal: AbortSignal): Promise<SalesDraftDto>;
}
/** No native picker/preparation implementation is supplied by this slice. */
export const salesCommandUiActivation = Object.freeze({ available: false, reason: 'NATIVE_FORM_PROVIDERS_UNAVAILABLE' } as const);
export interface SalesCommandWorkspaceOptions {
  /** Session-owned scope, retained across route detach. Identity changes dispose it. */
  readonly scope: ReadScope;
  readonly client: SalesCommandClient;
  readonly reader: Pick<SalesReader, 'readDetail'>;
  readonly newRequestKey: () => string;
  readonly onAccessFailure: (error: SalesCommandError) => void;
}
export interface SalesCommandWriteState {
  readonly phase: 'idle' | 'submitting' | 'checking' | 'replaying' | 'uncertain' | 'rejected' | 'committed';
  readonly command: SalesCommandDto | null; readonly result: SalesCommandResultDto | null;
  readonly receipt: SalesCommandReceiptDto | null;
  readonly recovery: 'unqueried' | 'absent' | 'failed' | 'found'; readonly error: SalesCommandError | null;
}
export interface SalesCommandEditor {
  readonly mode: 'CREATE' | 'EXISTING'; readonly salesId: string;
  readonly phase: 'ready' | 'loading' | 'error';
  readonly detail: SalesDetailDto | null; readonly draft: SalesDraftDto | null;
  readonly current: SalesDetailDto | null; readonly readError: SalesCommandError | null;
}
export interface SalesCommandSnapshot {
  readonly editor: SalesCommandEditor | null; readonly write: SalesCommandWriteState;
  readonly stale: boolean; readonly disposed: boolean; readonly notice: string | null;
}
