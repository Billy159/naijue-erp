import type { ReplicaSession } from './session.ts';
import type { ProductionHostConfiguration } from '../../../../src/production-host/configuration.ts';
import type { CatalogueRuntimeOptions } from '../catalogue/entry.tsx';
import type { InventoryMountOptions, InventoryProductContext, InventoryQuerySnapshot } from '../inventory/index.tsx';
export interface ReadyPageOptions {
  readonly session: ReplicaSession;
  readonly routes: ProductionHostConfiguration['routes'];
  readonly newRequestKey: () => string;
  /** C opts in only when the original private HREV write capability is paired. Server authorizes independently. */
  readonly historyRevision?: Readonly<Partial<Record<'sales'|'transfers',boolean>>>;
  readonly inventory: Pick<InventoryMountOptions, 'ledgerDialog' | 'createWorkbook'> & Pick<InventoryMountOptions, 'onOpenSource'>;
  readonly catalogue: Pick<CatalogueRuntimeOptions, 'maintenance' | 'onChanged'>;
}
export interface MountedReplicaPage { readonly dispose: () => void; readonly canLeave: () => boolean;readonly canDiscard?:()=>boolean;readonly discard?:()=>boolean }

export interface FeatureRuntime {
 prepare(route:string):Promise<unknown>;
 mount(host:HTMLElement,route:string,scope:import('../../../../src/loading/read-scope.ts').ReadScope):Promise<MountedReplicaPage>;
 hasUnresolvedWrite():boolean;
 dispose():void;
}
export type Navigate=(route:string)=>void|Promise<boolean>;
export type PrepareRoute=(route:string,signal:AbortSignal)=>Promise<void>;
