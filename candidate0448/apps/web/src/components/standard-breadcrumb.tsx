import { Breadcrumb } from '@arco-design/web-react';
import './standard-breadcrumb.css';

/** Explicit presentation segments. A slash inside a business label is text,
 * never a delimiter or an inferred routing capability. */
export interface BreadcrumbSegment { readonly id: string; readonly label: string; }
export function StandardBreadcrumb({ segments, label }: { readonly segments: readonly BreadcrumbSegment[]; readonly label: string }) {
  if (segments.length === 0) return null;
  return <Breadcrumb className="erp-breadcrumb" aria-label={label}>
    {segments.map((segment, index) => <Breadcrumb.Item key={segment.id} aria-current={index === segments.length - 1 ? 'page' : undefined}>{segment.label}</Breadcrumb.Item>)}
  </Breadcrumb>;
}
