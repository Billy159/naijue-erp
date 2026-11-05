import { StandardStatusTag } from '../components/standard-status-tag.tsx';
import type { TransferDetailDto } from './contracts.ts';
import { transferStatusLabels } from './model.ts';

export function TransferStatusTag({ status }: { readonly status: TransferDetailDto['document']['header']['status'] }) {
  return <StandardStatusTag label={transferStatusLabels[status]} documentStatus={status}
    appearance={status === 'APPROVED' ? 'effective' : status === 'VOID' ? 'void' : 'pending'} className="tc-state-tag" />;
}
