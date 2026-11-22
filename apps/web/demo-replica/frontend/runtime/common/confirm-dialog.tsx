import type { ReactNode } from 'react';
import { SaleDialog } from '../documents/native-dialog.tsx';

type ConfirmDialogProps = {
 title: string;
 children: ReactNode;
 onCancel: () => void;
 onConfirm: () => void;
 cancelLabel?: string;
 confirmLabel?: string;
 confirmDisabled?: boolean;
 tone?: 'normal' | 'danger';
 variant?: 'sales' | 'transfer';
};

/** Only for a two-way decision. Forms, previews and multi-action dialogs keep their own controls. */
export function ConfirmDialog({title,children,onCancel,onConfirm,cancelLabel='取消',confirmLabel='确定',confirmDisabled=false,tone='normal',variant}:ConfirmDialogProps) {
 return <SaleDialog title={title} close={onCancel} className={tone==='danger'?'erp-confirm erp-confirm-danger':'erp-confirm'} {...(variant===undefined?{}:{variant})}
  footer={<><button type="button" className="btn" data-confirm-cancel onClick={onCancel}>{cancelLabel}</button><button type="button" className="btn primary" data-confirm-action disabled={confirmDisabled} onClick={onConfirm}>{confirmLabel}</button></>}>
  {children}
 </SaleDialog>;
}
