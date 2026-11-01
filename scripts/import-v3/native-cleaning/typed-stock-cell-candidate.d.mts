export interface TypedStockCellCandidate {
 readonly runId: string; readonly warehouseSourceId: string; readonly skuSourceId: string;
 readonly warehouseId: string; readonly skuId: string; readonly sourceUnit: string; readonly targetUnit: string;
 readonly opening: Readonly<{sourceText: string; targetText: string}>;
 readonly net: Readonly<{sourceText: string; targetText: string}>;
 readonly componentSum: string;
}
export interface TypedStockReviewCandidate {
 readonly status: 'TYPED_COMPONENT_REVIEW_CANDIDATE_NOT_CURRENT_STOCK_NOT_AUTHORIZED' | 'EMPTY_DECLARED_COHORT_NOT_SOURCE_COMPLETENESS';
 readonly sourceNamespace: string; readonly targetNamespace: string;
 readonly cells: readonly Readonly<TypedStockCellCandidate>[];
 readonly counts: Readonly<{ cells: number; components: number; unitRules: number; identities: number }>;
}
/** Private output; neither source completeness nor current-stock/write authority is established. */
export function prepareTypedStockCellReviewCandidate(input: unknown): Readonly<TypedStockReviewCandidate>;
