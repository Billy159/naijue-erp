import { useRef } from 'react';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { CatalogueMaintenanceCapability } from '../../../../src/product-settings/colors/contracts.ts';
import type { CatalogueSettingsEntry } from '../../../../../../packages/application/src/catalogue-settings-read-ports.ts';
import { EntryEditor } from '../catalogue/source-controls.tsx';
import type { CataloguePageOptions } from '../catalogue/entry.tsx';

export function InlineCatalogueEntry(p: {
 options: CataloguePageOptions; scope: ReadScope; capability: CatalogueMaintenanceCapability;
 close: () => void; guard: (value: (() => boolean) | null) => void;
 accept: (item: CatalogueSettingsEntry) => void;
}) {
 const announced = useRef(new Set<string>());
 return <EntryEditor options={p.options} capability={p.capability} entry={null} close={p.close} guard={p.guard}
  saved={async result => {
   const kind = p.capability.kind;
   if (kind === 'CATEGORY' || !p.scope.active || !p.options.scope.active) return false;
   if (!announced.current.has(result.operationId)) {
    announced.current.add(result.operationId);
    p.options.onChanged(kind);
   }
   const signal = AbortSignal.any([p.scope.signal, p.options.scope.signal]);
   try {
    const { item } = await p.options.catalogue.readById({
     parameters: { kind: kind === 'COLOR' ? 'colors' : 'fits', id: result.targetId },
     identity: p.scope.identity, routeInstanceId: p.scope.routeInstanceId, entityId: null, signal,
    });
    if (signal.aborted) return false;
    if (!item || item.id !== result.targetId || item.version < result.version) return '已新增目录资料，但尚未读回该记录的最新版本，请重试读取。';
    p.accept(item);
    return true;
   } catch (error) {
    if (signal.aborted) return false;
    const kind = (error as { kind?: string })?.kind;
    if (kind === 'forbidden' || kind === 'unauthenticated') {
     p.scope.dispose();
     p.options.scope.dispose();
     p.options.onAccessFailure(kind);
     return false;
    }
    return '已新增目录资料，但最新资料读取失败，请重试读取。';
   }
  }}/>;
}
