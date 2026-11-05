export type NullPolicy = 'REJECT_NULL' | 'PRESERVE_NULL';
export type SignPolicy = 'SIGNED' | 'NONNEGATIVE' | 'POSITIVE';
export interface ExactScalar { readonly sourceText: string | null; readonly targetText: string | null; }
export interface QuantityInput {
 readonly value: string | null; readonly sourceUnit: string; readonly targetUnit: string;
 readonly rule: { readonly sourceUnit: string; readonly targetUnit: string; readonly numerator: string; readonly denominator: string; readonly evidenceSha256: string };
 readonly nullPolicy: NullPolicy; readonly signPolicy: SignPolicy;
}
export interface MoneyInput {
 readonly value: string | null; readonly sourceCurrency: string; readonly targetCurrency: string;
 readonly sourceUnit: string; readonly targetUnit: string; readonly evidenceSha256: string;
 readonly precision: '18'; readonly scale: '2'; readonly nullPolicy: NullPolicy; readonly signPolicy: SignPolicy;
}
/** Unknown input deliberately accepted at the type boundary; runtime validates every own data property. */
export function normalizeQuantity(input: unknown): Readonly<ExactScalar>;
export function normalizeMoney(input: unknown): Readonly<ExactScalar>;
