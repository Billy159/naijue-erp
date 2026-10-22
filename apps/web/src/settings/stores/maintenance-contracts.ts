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
