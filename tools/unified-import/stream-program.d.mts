import type {StandardImportCurrentAdmin, StandardImportRequest, StandardImportStep} from '../../packages/application/src/unified-import-execution.ts';
import type {PreparedStreamPlan} from './stream-plan.mjs';
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
}

export function buildStreamProgram(plan: PreparedStreamPlan, indexPath: string, summary: StreamPreflightSummary, admin: StandardImportCurrentAdmin, options?: StreamProgramOptions): Promise<StreamProgram>;
