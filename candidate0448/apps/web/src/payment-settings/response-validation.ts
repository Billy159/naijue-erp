import { validateSettingsName } from '../settings/stores/maintenance-validation.ts';
import type { SettingsErrors } from '../settings/stores/maintenance-contracts.ts';
import type { PaymentCommand, PaymentCommandReceipt, PaymentCommandResult, PaymentSettingsDraft, PaymentSettingsKind } from './contracts.ts';
import { parsePaymentCommand } from '../../../../packages/application/src/payment-maintenance-validation.ts';
export function validatePaymentSettingsDraft(kind: PaymentSettingsKind, draft: Readonly<PaymentSettingsDraft>): SettingsErrors {
  const errors: Record<string, string> = {}, name = validateSettingsName(draft.name);
  if (name) errors.name = name;
  if (kind === 'accounts' && !draft.method?.id) errors.method = '请选择所属收款方式。';
  if (new Set(draft.halls.map(hall => hall.id)).size !== draft.halls.length) errors.halls = '营业厅不能重复。';
  // The frozen command accepts an explicit empty association set; never change it to ALL.
  return errors;
}

export function paymentNativeKind(kind: PaymentSettingsKind): 'PAYMENT_METHOD' | 'PAYMENT_ACCOUNT' {
  if (kind !== 'methods' && kind !== 'accounts') throw new TypeError('Invalid payment kind');
  return kind === 'methods' ? 'PAYMENT_METHOD' : 'PAYMENT_ACCOUNT';
}
export function validatePaymentCommand(kind: PaymentSettingsKind, value: unknown): PaymentCommand {
  return parsePaymentCommand(paymentNativeKind(kind), value);
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid response');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || !keys.every(key => Object.hasOwn(row, key))) throw new TypeError('Invalid response');
  return row;
}
export function validatePaymentResult(value: unknown, kind: PaymentSettingsKind, original: PaymentCommand): PaymentCommandResult {
  const row = exact(value, ['operationId', 'kind', 'targetId', 'version']), expectedKind = paymentNativeKind(kind);
  if (!uuid(row.operationId) || !uuid(row.targetId) || row.kind !== expectedKind
    || row.version !== (original.action === 'CREATE' ? 1 : original.expectedVersion + 1)
    || (original.action !== 'CREATE' && row.targetId !== original.id)) throw new TypeError('Invalid result');
  return Object.freeze({ operationId: row.operationId, kind: expectedKind, targetId: row.targetId, version: row.version as number });
}
export function validatePaymentReceipt(value: unknown, kind: PaymentSettingsKind, original: PaymentCommand): PaymentCommandReceipt {
  const row = exact(value, ['requestKey', 'action', 'status', 'completedAt', 'result']);
  if (row.requestKey !== original.requestKey || row.action !== original.action || row.status !== 'COMMITTED'
    || typeof row.completedAt !== 'string' || row.completedAt.length > 64 || !Number.isFinite(Date.parse(row.completedAt))
    || !/(?:Z|[+-]\d{2}:\d{2})$/.test(row.completedAt)) throw new TypeError('Invalid receipt');
  return Object.freeze({ requestKey: original.requestKey, action: original.action, status: 'COMMITTED', completedAt: row.completedAt,
    result: validatePaymentResult(row.result, kind, original) });
}

export function projectPaymentSettingsRecord(item: import('../../../../packages/application/src/organization-maintenance-ports.ts').OrganizationMaintenanceRecord): import('./contracts.ts').PaymentSettingsRecord {
  if (item.kind === 'PAYMENT_METHOD') return { kind: 'methods', id: item.id, name: item.name, enabled: item.enabled, version: item.version };
  if (item.kind === 'PAYMENT_ACCOUNT') return { kind: 'accounts', id: item.id, name: item.name, enabled: item.enabled, version: item.version,
    paymentMethod: { id: item.paymentMethod.id, name: item.paymentMethod.name }, halls: item.halls.map(hall => ({ id: hall.id, name: hall.name })) };
  throw new TypeError('Expected native payment record');
}
