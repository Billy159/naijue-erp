export interface ScalarReconciliationResult {
 readonly status: 'CONSISTENT_GIVEN_DECLARED_COHORT_NOT_AUTHORIZED' | 'EMPTY_DECLARED_COHORT_NOT_SOURCE_COMPLETENESS';
 readonly counts: Readonly<{ cohort: number; rules: number; sourceRows: number; targetRows: number; matchedFields: number }>;
}
/** Unknown input is checked at runtime; no extraction completeness, mapping or write authority. */
export function validateScalarReconciliation(input: unknown): Readonly<ScalarReconciliationResult>;
