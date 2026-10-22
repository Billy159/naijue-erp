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
  readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void;
}
export const initialPaymentSettingsQuery: PaymentSettingsQuery = Object.freeze({ search: '', status: 'normal', paymentMethodId: null, page: 1, pageSize: 20 });
