import { useState, useSyncExternalStore } from 'react';
import { DocumentHistoryView } from '../components/document-history.tsx';
import { UIButton } from '../components/standard-controls.tsx';
import type { ReadScope } from '../loading/read-scope.ts';
import { SalesHistoryController } from './history-controller.ts';
import type { SalesHistoryReader } from './history-http-reader.ts';

export interface SalesHistoryCapability { readonly scope: ReadScope; readonly reader: SalesHistoryReader }
export function SalesHistoryAction({ capability, salesId, className = 'iw-text-button' }: { readonly capability?: SalesHistoryCapability; readonly salesId?: string; readonly className?: string }) {
  const active = useSyncExternalStore(listener => {
    const signal = capability?.scope.signal;
    signal?.addEventListener('abort', listener);
    return () => signal?.removeEventListener('abort', listener);
  }, () => capability?.scope.active ?? false, () => false);
  const [opened, setOpened] = useState<{ capability: SalesHistoryCapability; salesId: string; controller: SalesHistoryController } | null>(null);
  const visible = opened && opened.salesId === salesId && opened.capability.scope === capability?.scope;
  return <><UIButton type="button" className={className} disabled={!active || !salesId} title={!capability || !salesId ? '保存并读取单据后可查看操作历史' : undefined}
    onClick={() => { if (capability?.scope.active && salesId) setOpened({ capability, salesId, controller: new SalesHistoryController(capability.scope, capability.reader, salesId) }); }}>操作历史</UIButton>
    {visible && <SalesHistoryView controller={opened.controller} close={() => setOpened(null)} />}</>;
}
export function SalesHistoryView({ controller, close }: { readonly controller: SalesHistoryController; readonly close: () => void }) {
  return <DocumentHistoryView controller={controller} kind="销货" close={close} />;
}
