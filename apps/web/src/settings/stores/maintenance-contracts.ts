import type { ReadScope } from '../../loading/read-scope.ts';
import type { StoreSettingsEntry, StoreSettingsKind } from './contracts.ts';

/** Private presentation ports, not new HTTP commands or a schema contract. */
export interface SettingsReference { readonly id: string; readonly name: string | null }
export type SettingsDirectoryKind = 'halls' | 'customers' | 'warehouses' | 'payment-methods';
export interface SettingsDirectoryParameters {
  readonly search: string; readonly page: number; readonly pageSize: 20 | 50 | 100;
  readonly hallId: string | null;
}
export interface SettingsDirectoryPage {
  readonly items: readonly SettingsReference[]; readonly total: number;
  readonly page: number; readonly pageSize: 20 | 50 | 100;
}
export interface SettingsDirectoryReader {
  read(kind: SettingsDirectoryKind, parameters: SettingsDirectoryParameters, signal: AbortSignal): Promise<SettingsDirectoryPage>;
}
export interface StoreMaintenanceDraft {
  readonly name: string; readonly enabled: boolean;
  readonly hall: SettingsReference | null; readonly customer: SettingsReference | null;
  readonly warehouse: SettingsReference | null;
}
export interface StoreMaintenancePreparation {
  /** Directory enumeration requires its own current backend grants. */
  readonly directory?: SettingsDirectoryReader;
  /** Session-owned command workspace; absence keeps form preparation read-only. */
  readonly workspace?: import('./maintenance-controller.ts').StoreMaintenanceWorkspace;
}
export interface StoreMaintenanceFormProps {
  readonly scope: ReadScope; readonly kind: StoreSettingsKind;
  readonly record: StoreSettingsEntry | null; readonly directory: SettingsDirectoryReader | undefined;
  readonly close: () => void;
}
export type SettingsErrors = Readonly<Record<string, string>>;
export const settingsSaveUnavailable = '此版本暂未开放保存，填写的内容不会保存。';
export function settingsReferenceName(value: SettingsReference | null): string {
  return value === null ? '未配置' : value.name ?? '名称未提供';
}

export type StoreCommand = import('../../../../../packages/application/src/organization-maintenance-ports.ts').OrganizationWriteCommand;
export interface StoreCommandResult {
  readonly operationId: string; readonly kind: 'HALL' | 'WAREHOUSE';
  readonly targetId: string; readonly version: number;
}
export interface StoreCommandReceipt {
  readonly requestKey: string; readonly action: StoreCommand['action']; readonly status: 'COMMITTED';
  readonly completedAt: string; readonly result: StoreCommandResult;
}
export interface StoreCommandClient {
  execute(kind: StoreSettingsKind, command: StoreCommand, signal: AbortSignal): Promise<StoreCommandResult>;
  receipt(kind: StoreSettingsKind, originalCommand: StoreCommand, signal: AbortSignal): Promise<StoreCommandReceipt>;
}
export type StoreCommandErrorKind = 'invalid-request' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'network' | 'timeout' | 'aborted' | 'malformed-response' | 'server';
export class StoreCommandError extends Error {
  readonly kind: StoreCommandErrorKind; readonly code: string;
  readonly outcome: 'not-sent' | 'rejected' | 'uncertain' | 'read'; readonly status: number | null;
  constructor(kind: StoreCommandErrorKind, code: string,
    outcome: 'not-sent' | 'rejected' | 'uncertain' | 'read', status: number | null = null) {
    super(({ 'invalid-request': '请求未通过校验。', unauthenticated: '登录已失效。', forbidden: '无权访问当前资料。', 'not-found': '未找到当前资料或回执。', conflict: '资料已改变或有关联限制。', network: '连接中断。', timeout: '请求超时。', aborted: '请求已中止。', 'malformed-response': '服务器返回无效。', server: '服务器暂未完成请求。' } as const)[kind]);
    this.name = kind === 'aborted' ? 'AbortError' : 'StoreCommandError';
    this.kind = kind; this.code = code; this.outcome = outcome; this.status = status;
  }
}
