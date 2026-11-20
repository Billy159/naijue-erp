import type { ReadScope } from '../loading/read-scope.ts';
import type { AccountSettingsReader, AccountSettingsRecord, StaffRoleOption, StaffSettingsReader } from '../staff-settings/contracts.ts';
export type { AccountSettingsReader, AccountSettingsRecord, StaffRoleOption, StaffSettingsReader };
export type AccountCommand = import('../../../../packages/application/src/account-maintenance-ports.ts').AccountMaintenanceCommand;
export type AccountIntent = 'CREATE' | 'EDIT' | 'DISABLE' | 'RESTORE' | 'RESET_PASSWORD';
export type AccountReceiptIdentity = { readonly action: 'CREATE'; readonly requestKey: string }
  | { readonly action: Exclude<AccountIntent, 'CREATE'>; readonly requestKey: string; readonly id: string; readonly expectedVersion: number };
export interface AccountCommandResult { readonly operationId: string; readonly kind: 'ACCOUNT'; readonly targetId: string; readonly version: number }
export interface AccountCommandReceipt { readonly requestKey: string; readonly action: AccountIntent; readonly status: 'COMMITTED'; readonly completedAt: string; readonly result: AccountCommandResult }
export interface AccountCommandClient {
  execute(command: AccountCommand, signal: AbortSignal): Promise<AccountCommandResult>;
  receipt(original: AccountReceiptIdentity, signal: AbortSignal): Promise<AccountCommandReceipt>;
}
/** Native safe employee facts; never an account credential or editable staff model. */
export interface AccountStaffCandidate { readonly id: string; readonly name: string; readonly role: string; readonly employmentStatus: string; readonly hallId: string | null; readonly hasAccount: boolean }
/** Session-safe values only. Password lives in the mounted form and submit parameter. */
export interface AccountSettingsDraft { readonly staff: AccountStaffCandidate | null; readonly loginName: string; readonly loginEnabled: boolean }
export type AccountSettingsQuery = import('../../../../packages/application/src/organization-maintenance-ports.ts').OrganizationListQuery;
export const initialAccountSettingsQuery: AccountSettingsQuery = Object.freeze({ search: '', status: 'all', hallId: null, page: 1, pageSize: 20 });
export interface AccountSettingsProps {
  readonly scope: ReadScope; readonly reader?: AccountSettingsReader; readonly staffReader?: StaffSettingsReader;
  readonly roles: readonly StaffRoleOption[]; readonly canPrepare: boolean;
  readonly workspace?: import('./controller.ts').AccountSettingsWorkspace;
  readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void;
}
export type AccountErrorKind = 'invalid-request' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'network' | 'timeout' | 'aborted' | 'malformed-response' | 'server';
export class AccountClientError extends Error {
  readonly kind: AccountErrorKind; readonly code: string; readonly outcome: 'not-sent' | 'rejected' | 'uncertain' | 'read'; readonly status: number | null;
  constructor(kind: AccountErrorKind, code: string, outcome: 'not-sent' | 'rejected' | 'uncertain' | 'read', status: number | null = null) {
    super(({ 'invalid-request': '请求未通过校验。', unauthenticated: '登录已失效。', forbidden: '无权访问当前资料。', 'not-found': '未找到当前资料或回执。', conflict: '资料已改变或有关联限制。', network: '连接中断。', timeout: '请求超时。', aborted: '请求已中止。', 'malformed-response': '服务器返回无效。', server: '服务器暂未完成请求。' } as const)[kind]);
    this.name = kind === 'aborted' ? 'AbortError' : 'AccountClientError'; this.kind = kind; this.code = code; this.outcome = outcome; this.status = status;
  }
}
