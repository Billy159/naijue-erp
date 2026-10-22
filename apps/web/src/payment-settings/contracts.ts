import type { QueryRead } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { SettingsDirectoryReader, SettingsReference } from '../settings/stores/maintenance-contracts.ts';
export type PaymentSettingsKind = 'methods' | 'accounts';
interface PaymentSettingsBase { readonly id: string; readonly name: string; readonly enabled: boolean; readonly version: number }
/** Private read-view projections, not a speculative HTTP or write contract. */
export interface PaymentMethodRecord extends PaymentSettingsBase { readonly kind: 'methods' }
export interface PaymentAccountRecord extends PaymentSettingsBase {
  readonly kind: 'accounts'; readonly paymentMethod: SettingsReference;
  readonly halls: readonly SettingsReference[];
}
export type PaymentSettingsRecord = PaymentMethodRecord | PaymentAccountRecord;
export interface PaymentSettingsQuery {
  readonly search: string; readonly status: 'normal' | 'disabled' | 'all';
  readonly paymentMethodId: string | null; readonly page: number; readonly pageSize: 20 | 50 | 100;
}
export interface PaymentSettingsPage {
  readonly items: readonly PaymentSettingsRecord[]; readonly total: number;
  readonly page: number; readonly pageSize: 20 | 50 | 100;
}
export interface PaymentSettingsReader {
  readonly supportsPaymentMethodFilter?: true;
  readList(kind: PaymentSettingsKind, read: QueryRead<PaymentSettingsQuery>): Promise<PaymentSettingsPage>;
  readDetail(kind: PaymentSettingsKind, read: QueryRead<{ readonly id: string }>): Promise<PaymentSettingsRecord | null>;
}
/** Local inputs preserve all hall references even when candidate pages change. */
export interface PaymentSettingsDraft {
  readonly name: string; readonly enabled: boolean; readonly method: SettingsReference | null;
  readonly halls: readonly SettingsReference[];
}
export interface PaymentSettingsProps {
  readonly scope: ReadScope; readonly reader?: PaymentSettingsReader;
  readonly directory?: SettingsDirectoryReader; readonly canPrepare: boolean;
  readonly initialTab?: PaymentSettingsKind;
  /** Keep one workspace for the authenticated session; never create it in a route render. */
  readonly workspace?: import('./controller.ts').PaymentSettingsWorkspace;
  readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void;
}
export type PaymentCommand = import('../../../../packages/application/src/payment-maintenance-ports.ts').PaymentMaintenanceCommand;
export interface PaymentCommandResult {
  readonly operationId: string; readonly kind: 'PAYMENT_METHOD' | 'PAYMENT_ACCOUNT';
  readonly targetId: string; readonly version: number;
}
export interface PaymentCommandReceipt {
  readonly requestKey: string; readonly action: PaymentCommand['action']; readonly status: 'COMMITTED';
  readonly completedAt: string; readonly result: PaymentCommandResult;
}
export interface PaymentCommandClient {
  execute(kind: PaymentSettingsKind, command: PaymentCommand, signal: AbortSignal): Promise<PaymentCommandResult>;
  receipt(kind: PaymentSettingsKind, originalCommand: PaymentCommand, signal: AbortSignal): Promise<PaymentCommandReceipt>;
}
export type PaymentErrorKind = 'invalid-request' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'network' | 'timeout' | 'aborted' | 'malformed-response' | 'server';
export class PaymentClientError extends Error {
  readonly kind: PaymentErrorKind; readonly code: string;
  readonly outcome: 'not-sent' | 'rejected' | 'uncertain' | 'read'; readonly status: number | null;
  constructor(kind: PaymentErrorKind, code: string,
    outcome: 'not-sent' | 'rejected' | 'uncertain' | 'read', status: number | null = null) {
    super(({ 'invalid-request': '请求未通过校验。', unauthenticated: '登录已失效。', forbidden: '无权访问当前资料。', 'not-found': '未找到当前资料或回执。', conflict: '资料已改变或有关联限制。', network: '连接中断。', timeout: '请求超时。', aborted: '请求已中止。', 'malformed-response': '服务器返回无效。', server: '服务器暂未完成请求。' } as const)[kind]);
    this.name = kind === 'aborted' ? 'AbortError' : 'PaymentClientError';
    this.kind = kind; this.code = code; this.outcome = outcome; this.status = status;
  }
}
export const initialPaymentSettingsQuery: PaymentSettingsQuery = Object.freeze({ search: '', status: 'normal', paymentMethodId: null, page: 1, pageSize: 20 });
