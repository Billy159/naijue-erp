export { PaymentSettingsController } from './controller.ts';
export type { PaymentSettingsProps, PaymentSettingsReader, PaymentSettingsRecord, PaymentSettingsKind } from './contracts.ts';
// Lazy-import payment-page.tsx only when its route is activated.
export { createPaymentSettingsHttpReader } from './http-client.ts';
