import { requireDomain } from '../../../packages/domain/src/errors.ts';

export type ReadDataset = 'SALES' | 'TRANSFER' | 'INVENTORY';
export interface DatasetVersionClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}
const datasets: readonly ReadDataset[] = ['SALES', 'TRANSFER', 'INVENTORY'];
function checkedDataset(value: ReadDataset): ReadDataset {
  requireDomain(datasets.includes(value), 'INVALID_READ_DATASET', 'An explicit supported read dataset is required');
  return value;
}
function revision(result: Awaited<ReturnType<DatasetVersionClient['query']>>, dataset: ReadDataset, writing: boolean): string {
  requireDomain(result.rowCount === 1 && result.rows.length === 1, 'INVALID_DATASET_VERSION', 'Exactly one persisted dataset version is required');
  const row = result.rows[0]!;
  const value = row.revision;
  requireDomain(row.dataset === dataset && typeof value === 'string' && /^(0|[1-9][0-9]{0,18})(?![\s\S])/.test(value)
    && BigInt(value) <= 9223372036854775807n && (!writing || value !== '0'),
  'INVALID_DATASET_VERSION', 'An exact nonnegative PostgreSQL bigint revision string is required');
  return value;
}
/** The caller supplies its original admitted RR client. No connection, authorization or transaction is created here. */
export async function readDatasetVersion(client: DatasetVersionClient, dataset: ReadDataset): Promise<string> {
  checkedDataset(dataset);
  return revision(await client.query('/* read-dataset-version:read */ SELECT dataset,revision::text AS revision FROM naijue_erp.read_dataset_version WHERE dataset=$1', [dataset]), dataset, false);
}
/** One instance per original write transaction. Mark only actual new writes, never committed receipt replays.
 * Flush after original business checks/evidence and before the caller COMMIT; the caller owns rollback and uncertain-outcome recovery.
 */
export function createDatasetVersionChanges(client: DatasetVersionClient): {
  mark(dataset: ReadDataset): void;
  flush(): Promise<void>;
} {
  const changed = new Set<ReadDataset>();
  let closed = false;
  return Object.freeze({
    mark(dataset: ReadDataset): void {
      requireDomain(!closed, 'DATASET_VERSION_CHANGES_CLOSED', 'Dataset changes are closed once flushing starts');
      changed.add(checkedDataset(dataset));
    },
    async flush(): Promise<void> {
      requireDomain(!closed, 'DATASET_VERSION_CHANGES_CLOSED', 'A dataset flush must never be retried on the same transaction marker');
      closed = true;
      for (const dataset of datasets) {
        if (!changed.has(dataset)) continue;
        revision(await client.query('/* read-dataset-version:bump */ UPDATE naijue_erp.read_dataset_version SET revision=revision+1 WHERE dataset=$1 RETURNING dataset,revision::text AS revision', [dataset]), dataset, true);
      }
    },
  });
}
