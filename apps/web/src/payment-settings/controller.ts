import type { ReadScope } from '../loading/read-scope.ts';
import { SettingsDraftController } from '../settings/stores/maintenance-controller.ts';
import type { PaymentSettingsDraft, PaymentSettingsKind, PaymentSettingsRecord } from './contracts.ts';
import { validatePaymentSettingsDraft } from './response-validation.ts';
export class PaymentSettingsController extends SettingsDraftController<PaymentSettingsDraft> {
  readonly kind: PaymentSettingsKind;
  readonly record: PaymentSettingsRecord | null;
  constructor(scope: ReadScope, kind: PaymentSettingsKind, record: PaymentSettingsRecord | null) {
    if (record && record.kind !== kind) throw new TypeError('Payment form kind does not match its record');
    super(scope, { name: record?.name ?? '', enabled: record?.enabled ?? true,
      method: record?.kind === 'accounts' ? record.paymentMethod : null,
      halls: record?.kind === 'accounts' ? record.halls : [] }, draft => validatePaymentSettingsDraft(kind, draft));
    this.kind = kind; this.record = record;
  }
}
