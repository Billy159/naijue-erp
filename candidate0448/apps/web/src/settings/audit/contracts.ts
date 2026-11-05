import type { QueryRead } from '../../loading/latest-query.ts';
import type { ReadScope } from '../../loading/read-scope.ts';
export const auditModules = ['PRODUCT', 'CATEGORY', 'COLOR', 'FIT', 'HALL', 'WAREHOUSE', 'STAFF', 'ACCOUNT', 'PAYMENT_METHOD', 'PAYMENT_ACCOUNT', 'CUSTOMER', 'SUPPLIER'] as const;
export type SettingsAuditModule = typeof auditModules[number];
export const auditActions = ['CREATE', 'EDIT', 'DISABLE', 'RESTORE', 'DELETE', 'LEAVE', 'REINSTATE', 'RESET_PASSWORD'] as const;
export type SettingsAuditAction = typeof auditActions[number];
export interface SettingsAuditQuery {
  readonly module: 'ALL' | SettingsAuditModule; readonly objectId: string | null;
  readonly objectSearch: string; readonly actorSearch: string; readonly action: 'ALL' | SettingsAuditAction;
  /** Date-only Asia/Shanghai local calendar days; never convert these to UTC in the browser. */
  readonly dateFrom: string | null; readonly dateTo: string | null;
  readonly page: number; readonly pageSize: 20 | 50 | 100;
}
export type SettingsAuditDraft = Omit<SettingsAuditQuery, 'page' | 'pageSize'>;
export type SettingsAuditValue = { readonly state: 'ABSENT' } | { readonly state: 'NULL' }
  | { readonly state: 'VALUE'; readonly value: string | boolean | number }
  | { readonly state: 'IDS'; readonly value: readonly string[] }
  | { readonly state: 'ROW_COUNT'; readonly value: number };
export interface SettingsAuditItem {
  readonly id: string; readonly operationId: string; readonly occurredAt: string | null;
  readonly module: SettingsAuditModule;
  readonly object: { readonly id: string; readonly name: string | null; readonly code: string | null };
  readonly actor: { readonly accountId: string | null; readonly staffId: string | null; readonly name: string | null; readonly loginName: string | null };
  readonly action: SettingsAuditAction | null; readonly oldVersion: number | null; readonly newVersion: number | null;
  readonly changes: readonly { readonly field: string; readonly label: string; readonly before: SettingsAuditValue; readonly after: SettingsAuditValue }[];
  readonly credentialActions: readonly ('CREATE' | 'RESET_PASSWORD')[];
}
export interface SettingsAuditPage { readonly items: readonly SettingsAuditItem[]; readonly total: number; readonly page: number; readonly pageSize: 20 | 50 | 100 }
export interface SettingsAuditReader { readQuery(read: QueryRead<SettingsAuditQuery>): Promise<SettingsAuditPage> }
/** Current authenticated host's presentation capabilities; reads still authorize on the server. */
export interface SettingsAuditCapability {
  readonly reader: SettingsAuditReader;
  readonly allowedModules: readonly SettingsAuditModule[];
  readonly hasUnresolvedWrite: () => boolean;
}
export interface SettingsAuditTarget { readonly module: SettingsAuditModule; readonly objectId: string }
export interface SettingsAuditDrawerProps {
  readonly visible: boolean; readonly scope: ReadScope; readonly reader?: SettingsAuditReader;
  /** Explicit authenticated-host presentation capabilities only. Server still authorizes every read. */
  readonly allowedModules: readonly SettingsAuditModule[]; readonly target?: SettingsAuditTarget;
  readonly onClose: () => void; readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void;
  readonly hasUnresolvedWrite?: () => boolean;
}
export const auditModuleLabels: Readonly<Record<SettingsAuditModule, string>> = Object.freeze({ PRODUCT: '商品', CATEGORY: '商品分类', COLOR: '颜色', FIT: '版型', HALL: '营业厅', WAREHOUSE: '仓库', STAFF: '员工', ACCOUNT: '登录账号', PAYMENT_METHOD: '收款方式', PAYMENT_ACCOUNT: '资金账户', CUSTOMER: '客户', SUPPLIER: '供货商' });
export const auditActionLabels: Readonly<Record<SettingsAuditAction, string>> = Object.freeze({ CREATE: '新增', EDIT: '修改', DISABLE: '停用', RESTORE: '恢复使用', DELETE: '删除', LEAVE: '办理离职', REINSTATE: '恢复在职', RESET_PASSWORD: '重置密码' });
export const blankAuditDraft: SettingsAuditDraft = Object.freeze({ module: 'ALL', objectId: null, objectSearch: '', actorSearch: '', action: 'ALL', dateFrom: null, dateTo: null });
