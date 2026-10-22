import { validateSettingsName } from '../settings/stores/maintenance-validation.ts';
import type { SettingsErrors } from '../settings/stores/maintenance-contracts.ts';
import type { PaymentSettingsDraft, PaymentSettingsKind } from './contracts.ts';
export function validatePaymentSettingsDraft(kind: PaymentSettingsKind, draft: Readonly<PaymentSettingsDraft>): SettingsErrors {
  const errors: Record<string, string> = {}, name = validateSettingsName(draft.name);
  if (name) errors.name = name;
  if (kind === 'accounts' && !draft.method?.id) errors.method = '请选择所属收款方式。';
  if (new Set(draft.halls.map(hall => hall.id)).size !== draft.halls.length) errors.halls = '营业厅不能重复。';
  // An empty hall list is not silently changed to ALL; B05 must freeze its meaning.
  return errors;
}

export function projectPaymentSettingsRecord(item: import('../../../../packages/application/src/organization-maintenance-ports.ts').OrganizationMaintenanceRecord): import('./contracts.ts').PaymentSettingsRecord {
  if (item.kind === 'PAYMENT_METHOD') return { kind: 'methods', id: item.id, name: item.name, enabled: item.enabled, version: item.version };
  if (item.kind === 'PAYMENT_ACCOUNT') return { kind: 'accounts', id: item.id, name: item.name, enabled: item.enabled, version: item.version,
    paymentMethod: { id: item.paymentMethod.id, name: item.paymentMethod.name }, halls: item.halls.map(hall => ({ id: hall.id, name: hall.name })) };
  throw new TypeError('Expected native payment record');
}
