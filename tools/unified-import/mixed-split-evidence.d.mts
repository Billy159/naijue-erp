import type { UnifiedPackage } from '../../packages/application/src/unified-import-contract.ts';

export const MIXED_SPLIT_EVIDENCE_VERSION: 'MIXED_SALES_SPLIT_EVIDENCE_V1';
export type MixedSplitTable = 'sales_header' | 'sales_line' | 'sales_settlement';
export const mixedSplitFactKeys: Readonly<Record<MixedSplitTable, readonly string[]>>;

export function isMixedSplitReceiverSchemaSupported(schema: unknown): boolean;

interface EvidenceVerificationLimits {
  readonly source_truth_verified: false;
  readonly database_proof_verified: false;
  readonly import_admission_ready: false;
}

export type MixedSplitEvidenceResult = EvidenceVerificationLimits & (
  | {
    readonly valid: true;
    readonly state: 'DECLARATION_CONSERVATION_VERIFIED';
    readonly format_version: typeof MIXED_SPLIT_EVIDENCE_VERSION;
    readonly evidence_sha256: string;
    readonly output_manifest_sha256: string;
    readonly groups_verified: number;
    readonly code?: never;
  }
  | {
    readonly valid: false;
    readonly state: 'REJECTED';
    readonly code: string;
  }
);

/** Malformed and non-string evidence is deliberately accepted for validation. */
export function validateMixedSplitEvidenceV1(
  outputPackage: UnifiedPackage,
  evidenceJson: unknown,
  options?: { readonly allowSynthetic?: boolean },
): MixedSplitEvidenceResult;
