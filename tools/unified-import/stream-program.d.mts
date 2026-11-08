import type {StandardImportCurrentAdmin, StandardImportRequest, StandardImportStep} from '../../packages/application/src/unified-import-execution.ts';
import type {PreparedStreamPlan, PrepareStreamPlanOptions} from './stream-plan.mjs';
import type {StreamPreflightSummary} from './stream-preflight.mjs';

export interface StreamProgramOptions {
  coalesce?: boolean;
  metrics?: Partial<Record<'master_cursor_ms' | 'baseline_cursor_ms' | 'document_cursor_ms', number>> | null;
}

export interface StreamProgram {
  identity: {
    batchId: string;
    documentBatchId: string;
    packageSha256: string;
    planSha256: string;
    namespace: string;
    cutoffAt: string;
  };
  initialize: StandardImportRequest;
  steps: AsyncGenerator<StandardImportStep, void, unknown>;
  createSteps(): AsyncGenerator<StandardImportStep, void, unknown>;
}

export function buildStreamProgram(plan: PreparedStreamPlan, indexPath: string, summary: StreamPreflightSummary, admin: StandardImportCurrentAdmin, options?: StreamProgramOptions): Promise<StreamProgram>;

/** Requires the same genuine active plan as buildStreamProgram; no index or
 * baseline/document request iteration. It does not recreate a missing plan. */
export function buildStreamInitializer(plan: PreparedStreamPlan, summary: StreamPreflightSummary, admin: StandardImportCurrentAdmin, options?: Pick<StreamProgramOptions, 'coalesce'>): Promise<Pick<StreamProgram, 'identity' | 'initialize'>>;

/** Revalidates a retained preflight index with the original planner; does not
 * repeat source preflight, construct steps or grant database authority. */
export function prepareStreamInitializerFromIndex(indexPath: string, summary: StreamPreflightSummary, manifestBytes: Uint8Array, options: PrepareStreamPlanOptions, programOptions?: Pick<StreamProgramOptions, 'coalesce'>): Promise<Pick<StreamProgram, 'identity' | 'initialize'>>;
