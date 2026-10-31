import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { StoreMaintenanceWorkspace } from '../../../../src/settings/stores/maintenance-controller.ts';
import type { PartyWorkspace } from '../../../../src/parties/controller.ts';
import type { StaffSettingsWorkspace } from '../../../../src/staff-settings/controller.ts';
import type { AccountSettingsWorkspace } from '../../../../src/account-settings/controller.ts';
import type { PaymentSettingsWorkspace } from '../../../../src/payment-settings/controller.ts';
import { createSettingsAuditHttpReader } from '../../../../src/settings/audit/http-reader.ts';
import { blankAuditDraft } from '../../../../src/settings/audit/contracts.ts';
import { settingsAuditModulesFor } from '../../../../../../packages/application/src/settings-audit-validation.ts';
import type {ReadyPageOptions,MountedReplicaPage,Navigate,PrepareRoute} from '../common/feature-contracts.ts';
const roles = Object.freeze([
  { value: 'ADMIN', label: '管理员', requiresHall: false },
  { value: 'WAREHOUSE', label: '仓库', requiresHall: false },
  { value: 'SALESPERSON', label: '营业员', requiresHall: true },
]);

export function createSettingsFeature(options:ReadyPageOptions,allUnresolved:()=>boolean){
  const {session}=options;
  const access=(kind:'unauthenticated'|'forbidden')=>session.onAccessFailure({kind});
  const enabled = (flag: boolean | undefined, admin = false) => () => {
    const auth = session.auth.getSnapshot();
    return flag === true && auth.phase === 'authenticated' && (auth.principal?.role === 'ADMIN' || !admin && auth.principal?.role === 'WAREHOUSE');
  };
  let owner:ReadScope|null=null;
  let stores: StoreMaintenanceWorkspace | undefined, parties: PartyWorkspace | undefined;
  let staff: StaffSettingsWorkspace | undefined, accounts: AccountSettingsWorkspace | undefined, payments: PaymentSettingsWorkspace | undefined;
  const unresolved=()=>!!owner?.active&&!!(stores?.hasUnresolvedWrite()||parties?.hasUnresolvedWrite()||staff?.hasUnresolvedWrite()||accounts?.hasUnresolvedWrite()||payments?.hasUnresolvedWrite());
  const ownerScope = () => {
    if (!owner?.active) {
      owner = session.reads.createScope('replica-settings-session');
      stores = undefined; parties = undefined; staff = undefined; accounts = undefined; payments = undefined;
    }
    return owner;
  };
  const audit = () => {
    const role = session.auth.getSnapshot().principal?.role;
    const allowedModules = role === 'ADMIN' || role === 'WAREHOUSE' ? settingsAuditModulesFor(role, { ...blankAuditDraft, page: 1, pageSize: 20 }) : [];
    return { reader: createSettingsAuditHttpReader(session.http), allowedModules, hasUnresolvedWrite: allUnresolved };
  };
  async function mount(host: HTMLElement, route: string, scope: ReadScope): Promise<MountedReplicaPage> {
    const principal = session.auth.getSnapshot().principal;
    if (!principal || principal.accountId !== scope.identity.accountId || !scope.active) throw new Error('当前登录身份尚未确认。');
    const http = session.http, config = options.routes, flags = config.maintenance;
    ownerScope();
    let root: Root | null = null;
    const release = () => { root?.unmount(); root = null; };
    const paint = (view: ReactNode) => { if (scope.active) { root = createRoot(host); root.render(view); } };
    try {
      if ((route === 'settings/stores' || route === 'settings/warehouses') && config.storeSettings) {
        const [module, customers] = await Promise.all([import('./index.ts'), import('../../../../src/parties/http-client.ts')]);
        if (!scope.active) { release(); return { dispose: () => {}, canLeave: () => true }; }
        stores ??= module.createStoreMaintenanceWorkspace({ scope: ownerScope(), client: module.createStoreSettingsCommandClient(http), newRequestKey: options.newRequestKey, writesEnabled: enabled(flags?.storeSettings), onAccessFailure: access });
        const workspace = stores;
        workspace.getViewState(route === 'settings/warehouses' ? 'warehouses' : config.storeSettings.initialTab);
        paint(<module.StoreSettingsRuntime scope={scope} reader={module.createOrganizationStoreSettingsReader(http)} maintenance={{ workspace, directory: module.createOrganizationSettingsDirectory({ scope, http, customers: customers.createPartyHttpClient(http) }) }} allowedTabs={config.storeSettings.allowedTabs} allowHallDirectoryRead={config.storeSettings.allowHallDirectoryRead} audit={audit()} onAccessFailure={access} />);
        return { dispose: () => release(), canLeave: workspace.canLeave };
      }
      if ((route === 'settings/parties' || route === 'customers' || route === 'suppliers') && config.parties) {
        const module = await import('./parties-entry.ts');
        if (!scope.active) { release(); return { dispose: () => {}, canLeave: () => true }; }
        parties ??= module.createPartyWorkspace({ scope: ownerScope(), client: module.createPartyHttpClient(http), newRequestKey: options.newRequestKey, onAccessFailure: error => access(error.kind === 'unauthenticated' ? 'unauthenticated' : 'forbidden') });
        const workspace = parties;
        paint(<module.PartiesRuntime initialTab={route === 'suppliers' ? 'SUPPLIER' : 'CUSTOMER'} workspace={workspace} {...(config.parties.readOnly ? { readOnly: true as const } : {})} audit={{ ...audit(), onAccessFailure: access }} />);
        return { dispose: () => release(), canLeave: () => workspace.canLeave() && !module.hasPendingPartyReadback(workspace) };
      }
      if ((route === 'settings/staff' || route === 'settings/accounts') && config.staffSettings) {
        if (principal.role !== 'ADMIN') throw new Error('当前账号无权打开此页面。');
        const module = await import('./personnel-entry.ts');
        const directoryModule = await import('../../../../src/settings/stores/maintenance-http-client.ts');
        if (!scope.active) { release(); return { dispose: () => {}, canLeave: () => true }; }
        const reader = module.createStaffSettingsHttpReader(http);
        staff ??= module.createStaffSettingsWorkspace({ scope: ownerScope(), roles, reader, client: module.createStaffSettingsCommandClient(http), newRequestKey: options.newRequestKey, writesEnabled: enabled(flags?.staffSettings, true), onAccessFailure: access, hasOtherUnresolvedWrite: () => !!(accounts?.hasUnresolvedWrite() || stores?.hasUnresolvedWrite() || payments?.hasUnresolvedWrite() || parties?.hasUnresolvedWrite()) });
        // Staff already contains its paired account and owns the combined maintenance form.
        // The old accounts deep link resolves here without creating a second daily workflow.
        const workspace = staff;
        paint(<module.StaffRuntime scope={scope} reader={reader} directory={directoryModule.createOrganizationSettingsDirectory({ scope, http })} roles={roles} canPrepare={enabled(flags?.staffSettings, true)()} workspace={workspace} audit={audit()} onAccessFailure={access} />);
        return { dispose: () => release(), canLeave: workspace.canLeave };
      }
      if ((route === 'settings/payments' || route === 'settings/fundAccounts') && config.paymentSettings) {
        const module = await import('./payments-entry.ts');
        const directoryModule = await import('../../../../src/settings/stores/maintenance-http-client.ts');
        if (!scope.active) { release(); return { dispose: () => {}, canLeave: () => true }; }
        payments ??= module.createPaymentSettingsWorkspace({ scope: ownerScope(), client: module.createPaymentSettingsCommandClient(http), newRequestKey: options.newRequestKey, writesEnabled: enabled(flags?.paymentSettings), onAccessFailure: access });
        const workspace = payments;
        paint(<module.PaymentsRuntime scope={scope} reader={module.createPaymentSettingsHttpReader(http)} directory={directoryModule.createOrganizationSettingsDirectory({ scope, http })} workspace={workspace} canPrepare={enabled(flags?.paymentSettings)()} initialTab={route === 'settings/fundAccounts' ? 'accounts' : 'methods'} audit={audit()} onAccessFailure={access} />);
        return { dispose: () => release(), canLeave: () => workspace.canLeave() && !module.hasPendingPaymentReadback(workspace) };
      }
      throw new Error('此页面尚未接入当前版本。');
    } catch (error) { release(); throw error; }
  }
  const prepare=(route:string)=>route==='settings/stores'||route==='settings/warehouses'?import('./index.ts'):route==='settings/parties'||route==='customers'||route==='suppliers'?import('./parties-entry.ts'):route==='settings/staff'||route==='settings/accounts'?import('./personnel-entry.ts'):import('./payments-entry.ts');
  return {prepare,mount,hasUnresolvedWrite:unresolved,dispose(){owner?.dispose();owner=null;}};
}
