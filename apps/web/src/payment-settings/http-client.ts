import { HttpQueryError, type HttpQueryOptions } from '../transport/http-query.ts';
import { createOrganizationMaintenanceReadClient } from '../settings/stores/maintenance-http-client.ts';
import type { PaymentSettingsKind, PaymentSettingsReader } from './contracts.ts';
import { projectPaymentSettingsRecord } from './response-validation.ts';
function nativeKind(kind: PaymentSettingsKind) {
  if (kind !== 'methods' && kind !== 'accounts') throw new HttpQueryError('invalid-request', 'INVALID_PAYMENT_KIND');
  return kind === 'methods' ? 'PAYMENT_METHOD' as const : 'PAYMENT_ACCOUNT' as const;
}
export function createPaymentSettingsHttpReader(options: HttpQueryOptions): PaymentSettingsReader {
  const client = createOrganizationMaintenanceReadClient(options);
  return Object.freeze<PaymentSettingsReader>({
    async readList(kind, read) {
      if (read.parameters.paymentMethodId !== null) throw new HttpQueryError('not-implemented', 'PAYMENT_METHOD_FILTER_NOT_AVAILABLE');
      const result = await client.readList(nativeKind(kind), { search: read.parameters.search, status: read.parameters.status, hallId: null, page: read.parameters.page, pageSize: read.parameters.pageSize }, read.signal);
      return { page: result.page, pageSize: result.pageSize, total: result.total, items: result.items.map(projectPaymentSettingsRecord) };
    },
    async readDetail(kind, read) {
      const result = await client.readDetail(nativeKind(kind), read.parameters.id, read.signal);
      return result === null ? null : projectPaymentSettingsRecord(result);
    },
  });
}
