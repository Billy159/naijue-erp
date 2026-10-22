import { Tag } from '@arco-design/web-react';
import './standard-status-tag.css';

/** Display only. Domain adapters own status vocabulary and labels; a tone
 * does not grant a command, identify a save receipt or alter validation. */
export function StandardStatusTag(props: { readonly label: string; readonly documentStatus: string; readonly appearance: 'pending' | 'effective' | 'void'; readonly className: string }) {
  return <Tag bordered={false} closable={false} checkable={false} className={'erp-document-tag ' + props.className}
    data-document-status={props.documentStatus} data-status-appearance={props.appearance}>{props.label}</Tag>;
}
