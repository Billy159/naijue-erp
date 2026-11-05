export type SyntheticTransactionFailure = 'none' | 'candidate403' | 'prepare403' | 'prepareUnavailable' | 'proofMissing' | 'saveUncertain';
export interface SyntheticCall { readonly method: string; readonly path: string; readonly syntheticOnly: true }
