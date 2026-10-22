import type { TransferAction, TransferDraft, TransferResult } from '../../../../../packages/application/src/transfer-ports.ts';
import type { TransferDetailDto, TransferReader, TransferWire } from '../contracts.ts';
import type { ReadScope } from '../../loading/read-scope.ts';

/** Existing native wire contract. Identity, role, creation and approval facts stay server-owned. */
export type TransferDraftDto = TransferWire<TransferDraft>;
export type TransferCommandDto = { readonly action: 'SAVE'; readonly requestKey: string; readonly expectedVersion: number | null; readonly draft: TransferDraftDto }
  | { readonly action: Exclude<TransferAction, 'SAVE'>; readonly requestKey: string; readonly expectedVersion: number; readonly transferId: string };
export type TransferCommandResultDto = TransferWire<TransferResult>;
export interface TransferCommandReceiptDto { readonly requestKey: string; readonly action: TransferAction; readonly status: 'COMMITTED'; readonly completedAt: string; readonly result: TransferCommandResultDto }
export interface TransferCommandClient {
  execute(command: TransferCommandDto, signal: AbortSignal): Promise<TransferCommandResultDto>;
  receipt(command: TransferCommandDto, signal: AbortSignal): Promise<TransferCommandReceiptDto>;
}
export type TransferCommandErrorKind = 'invalid-request' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'network' | 'timeout' | 'aborted' | 'malformed-response' | 'server';
export type TransferCommandOutcome = 'not-sent' | 'rejected' | 'uncertain' | 'read';
export class TransferCommandError extends Error {
  readonly kind: TransferCommandErrorKind; readonly code: string; readonly outcome: TransferCommandOutcome; readonly status: number | null;
  constructor(kind: TransferCommandErrorKind, code: string, outcome: TransferCommandOutcome, status: number | null = null) {
    super(({ 'invalid-request': '调拨请求未通过校验。', unauthenticated: '登录已失效。', forbidden: '无权执行当前操作。', 'not-found': '未找到单据或操作回执。', conflict: '单据版本或状态已改变。', network: '连接中断。', timeout: '请求超时。', aborted: '已停止等待请求。', 'malformed-response': '服务器返回无效。', server: '服务器暂未完成请求。' } as const)[kind]);
    this.name = kind === 'aborted' ? 'AbortError' : 'TransferCommandError'; this.kind = kind; this.code = code; this.outcome = outcome; this.status = status;
  }
}
/** Explicit trusted current-reference and approved-number preparation. No historical
 * filter candidate, random number, eager catalogue or local fixture fallback. */
export interface TransferFormPreparationProvider { prepareCreate(signal: AbortSignal): Promise<TransferDraftDto> }
export interface TransferCommandCapability { readonly workspace: import('./controller.ts').TransferCommandWorkspace; readonly preparation?: TransferFormPreparationProvider;
  /** Explicit current-form/native-preparation host; never inferred from read access. */
  readonly manualCreate?: { readonly open: () => Promise<import('../../current-form/transfer-create.ts').TransferNewDocumentSession>; readonly canLeave: () => boolean };
}
export interface TransferCommandWorkspaceOptions {
  readonly scope: ReadScope; readonly client: TransferCommandClient; readonly reader: Pick<TransferReader, 'readDetail'>;
  readonly newRequestKey: () => string; readonly onAccessFailure: (error: TransferCommandError) => void;
  readonly existingPreparation?: import('../../current-form/existing-document-preparation.ts').TransferExistingPreparation;
  readonly existingReader?: ReturnType<typeof import('../../current-form/http-reader.ts').createCurrentFormHttpReader>;
}
/** Raw strings are session-owned too, so invalid input cannot evade leave guards. */
export interface TransferFormInput { readonly businessDate: string; readonly note: string; readonly quantities: Readonly<Record<string, string>> }
export interface TransferCommandWriteState {
  readonly phase: 'idle' | 'submitting' | 'checking' | 'replaying' | 'uncertain' | 'rejected' | 'committed';
  readonly command: TransferCommandDto | null; readonly result: TransferCommandResultDto | null; readonly receipt: TransferCommandReceiptDto | null;
  readonly recovery: 'unqueried' | 'absent' | 'failed' | 'found'; readonly error: TransferCommandError | null;
}
export interface TransferCommandEditor {
  readonly mode: 'CREATE' | 'EXISTING'; readonly transferId: string; readonly phase: 'ready' | 'loading' | 'error';
  readonly detail: TransferDetailDto | null; readonly draft: TransferDraftDto | null; readonly input: TransferFormInput | null; readonly inputError: boolean;
  readonly current: TransferDetailDto | null; readonly readError: TransferCommandError | null;
}
export interface TransferCommandSnapshot { readonly editor: TransferCommandEditor | null; readonly write: TransferCommandWriteState; readonly stale: boolean; readonly disposed: boolean; readonly notice: string | null }
