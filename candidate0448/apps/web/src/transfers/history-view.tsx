import { useState, useSyncExternalStore } from 'react';
import { DocumentHistoryView } from '../components/document-history.tsx';
import { UIButton } from '../components/standard-controls.tsx';
import type { ReadScope } from '../loading/read-scope.ts';
import { TransferHistoryController } from './history-controller.ts';
import type { TransferHistoryReader } from './history-http-reader.ts';

export interface TransferHistoryCapability { readonly scope: ReadScope; readonly reader: TransferHistoryReader }
export function TransferHistoryAction({ capability, transferId, className = 'iw-text-button' }: { readonly capability?: TransferHistoryCapability; readonly transferId?: string; readonly className?: string }) {
  const active = useSyncExternalStore(listener => {
    const signal = capability?.scope.signal;
    signal?.addEventListener('abort', listener);
    return () => signal?.removeEventListener('abort', listener);
  }, () => capability?.scope.active ?? false, () => false);
  const [opened, setOpened] = useState<{ capability: TransferHistoryCapability; transferId: string; controller: TransferHistoryController } | null>(null);
  const visible = opened && opened.transferId === transferId && opened.capability.scope === capability?.scope;
  return <><UIButton type="button" className={className} disabled={!active || !transferId} title={!capability || !transferId ? '保存并读取单据后可查看操作历史' : undefined}
    onClick={() => { if (capability?.scope.active && transferId) setOpened({ capability, transferId, controller: new TransferHistoryController(capability.scope, capability.reader, transferId) }); }}>操作历史</UIButton>
    {visible && <TransferHistoryView controller={opened.controller} close={() => setOpened(null)} />}</>;
}
export function TransferHistoryView({ controller, close }: { readonly controller: TransferHistoryController; readonly close: () => void }) {
  return <DocumentHistoryView controller={controller} kind="调拨" close={close} />;
}
