import { StandardStatusTag } from '../components/standard-status-tag.tsx';
import type { SalesHeaderDto } from './contracts.ts';
import { salesStatusLabels } from './model.ts';

export function SalesStatusTag({ status, className = 'tc-status' }: { readonly status: SalesHeaderDto['status']; readonly className?: string }) {
  const appearance = status === 'APPROVED' ? 'effective' : status === 'VOID' ? 'void' : 'pending';
  return <StandardStatusTag label={salesStatusLabels[status]} documentStatus={appearance} appearance={appearance} className={className} />;
}
