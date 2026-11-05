/** Compile-time composition only; no file, SQL, credentials, or authority opened. */
import type {openAuthorizedNativePaymentReader} from '../scripts/import-v2/authorized-native-payment-reader.mjs';
import type {openAuthorizedSettlementReader} from '../scripts/import-v2/authorized-settlement-reader.mjs';
import type {createPostgresHistorySettlementBindingResolver} from '../adapters/postgres/src/import-v3-history-settlement-staging-store.ts';
import type {NativePaymentImportRow} from '../packages/application/src/native-payment-import.ts';
type SettlementReaderOptions=Parameters<typeof openAuthorizedSettlementReader>[0];
type Resolver=ReturnType<typeof createPostgresHistorySettlementBindingResolver>;
type Compatible=Resolver extends NonNullable<SettlementReaderOptions['resolveNativeBinding']>?true:never;
const compatible:Compatible=true;void compatible;
type PaymentDecision=Awaited<ReturnType<NonNullable<Parameters<typeof openAuthorizedNativePaymentReader>[0]['resolveNativeBinding']>>>;
type DecisionCompatible=PaymentDecision extends Omit<NativePaymentImportRow,'source'>?true:never;
const decisionCompatible:DecisionCompatible=true;void decisionCompatible;
