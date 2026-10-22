import type { QueryRead } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { SettingsDirectoryReader, SettingsReference } from '../settings/stores/maintenance-contracts.ts';
/** Safe private projection of frozen B05 native reads. No credential fields. */
export interface StaffSettingsRecord {
  readonly id: string; readonly name: string; readonly role: string;
  readonly hall: SettingsReference | null; readonly contact: string | null;
  readonly employmentStatus: string; readonly version: number;
  readonly account: { readonly id: string; readonly staffId: string; readonly loginName: string; readonly loginEnabled: boolean; readonly version: number } | null;
}
export interface StaffSettingsQuery {
  readonly search: string; readonly role: string; readonly hallId: string | null;
  readonly employmentStatus: '在职' | '离职' | 'all'; readonly loginStatus: '' | 'open' | 'closed';
  readonly page: number; readonly pageSize: 20 | 50 | 100;
}
export interface StaffSettingsPage {
  readonly items: readonly StaffSettingsRecord[]; readonly total: number;
  readonly page: number; readonly pageSize: 20 | 50 | 100;
}
export interface StaffSettingsReader {
  /** Only explicit server capabilities may enable filters; never filter one page locally. */
  readonly capabilities?: { readonly roleFilter?: true; readonly loginStatusFilter?: true; readonly loginNameSearch?: true };
  readList(read: QueryRead<StaffSettingsQuery>): Promise<StaffSettingsPage>;
  readDetail(read: QueryRead<{ readonly id: string }>): Promise<StaffSettingsRecord | null>;
}
export interface StaffRoleOption { readonly value: string; readonly label: string; readonly requiresHall: boolean }
/** Safe session draft only. Plaintext passwords live exclusively in the mounted input. */
export interface StaffSettingsDraft {
  readonly name: string; readonly role: string; readonly hall: SettingsReference | null;
  readonly contact: string; readonly loginName: string; readonly loginEnabled: boolean;
}
export interface StaffSettingsProps {
  /** Optional actual audit read capability; absent remains unavailable. */
  readonly audit?: import('../settings/audit/audit-entry.tsx').SettingsAuditCapability;
  readonly scope: ReadScope; readonly reader?: StaffSettingsReader;
  readonly directory?: SettingsDirectoryReader; readonly roles: readonly StaffRoleOption[];
  readonly canPrepare: boolean;
  readonly workspace?: import('./controller.ts').StaffSettingsWorkspace;
  readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void;
}
export const initialStaffSettingsQuery: StaffSettingsQuery = Object.freeze({ search: '', role: '', hallId: null, employmentStatus: '在职', loginStatus: '', page: 1, pageSize: 20 });

export interface AccountSettingsRecord {
  readonly id: string; readonly version: number; readonly loginName: string; readonly loginEnabled: boolean;
  readonly createdAt: string; readonly updatedAt: string;
  readonly staff: { readonly id: string; readonly name: string; readonly role: string; readonly employmentStatus: string; readonly hallId: string | null };
}
export interface AccountSettingsReader {
  readList(read: QueryRead<import('../../../../packages/application/src/organization-maintenance-ports.ts').OrganizationListQuery>): Promise<{ readonly page: number; readonly pageSize: 20 | 50 | 100; readonly total: number; readonly items: readonly AccountSettingsRecord[] }>;
  readDetail(read: QueryRead<{ readonly id: string }>): Promise<AccountSettingsRecord | null>;
}

export type StaffCommand = import('../../../../packages/application/src/staff-maintenance-ports.ts').StaffMaintenanceCommand;
export type StaffReceiptIdentity = { readonly requestKey: string; readonly action: 'CREATE' }
  | { readonly requestKey: string; readonly action: 'EDIT' | 'LEAVE' | 'REINSTATE'; readonly id: string; readonly expectedVersion: number };
export interface StaffCommandResult { readonly operationId: string; readonly kind: 'STAFF'; readonly targetId: string; readonly version: number }
export interface StaffCommandReceipt { readonly requestKey: string; readonly action: StaffCommand['action']; readonly status: 'COMMITTED'; readonly completedAt: string; readonly result: StaffCommandResult }
export interface StaffCommandClient {
  /** Password-bearing command is transient request input, never retained in a snapshot or retry queue. */
  execute(command: StaffCommand, signal: AbortSignal): Promise<StaffCommandResult>;
  receipt(original: StaffReceiptIdentity, signal: AbortSignal): Promise<StaffCommandReceipt>;
}
export type StaffErrorKind = 'invalid-request' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'network' | 'timeout' | 'aborted' | 'malformed-response' | 'server';
export class StaffClientError extends Error {
  readonly kind: StaffErrorKind; readonly code: string; readonly outcome: 'not-sent' | 'rejected' | 'uncertain' | 'read'; readonly status: number | null;
  constructor(kind: StaffErrorKind, code: string, outcome: 'not-sent' | 'rejected' | 'uncertain' | 'read', status: number | null = null) {
    super(({ 'invalid-request': '请求未通过校验。', unauthenticated: '登录已失效。', forbidden: '无权访问当前资料。', 'not-found': '未找到当前资料或回执。', conflict: '资料已改变或有关联限制。', network: '连接中断。', timeout: '请求超时。', aborted: '请求已中止。', 'malformed-response': '服务器返回无效。', server: '服务器暂未完成请求。' } as const)[kind]);
    this.name = kind === 'aborted' ? 'AbortError' : 'StaffClientError'; this.kind = kind; this.code = code; this.outcome = outcome; this.status = status;
  }
}
