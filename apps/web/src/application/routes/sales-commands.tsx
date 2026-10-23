import { createSalesProductCapability } from './sales.tsx';
import type { DocumentProductInventoryNavigationFactory } from '../../sales/document-presentation.tsx';
import type { SalesNewDocumentSession } from '../../current-form/sales-create.ts';
import { createSalesHttpReader, createSalesFilterReferenceHttpReader } from '../../sales/http-reader.ts';
import type { ApplicationRouteProps, RoutePreparation, SalesSession } from '../contracts.ts';
import { createSalesCommandHttpClient } from '../../sales/commands/http-client.ts';
import { SalesEditorSession } from '../../sales/commands/editor-session.ts';
import { SalesCommandPageHost } from '../../sales/commands/page-host.tsx';
import { createCurrentFormHttpReader } from '../../current-form/http-reader.ts';

/** Separately imported opt-in leaf. Read-only routes do not import write clients
 * or session owners merely to render a sales list. */
export function prepareSalesCommandSession(input: RoutePreparation, onAccessFailure: () => void, inventoryNavigation?: DocumentProductInventoryNavigationFactory): SalesSession {
  const configuration = input.configuration.sales, commands = configuration?.commands;
  if (!commands || !configuration.detailStylesheet || typeof commands.newRequestKey !== 'function'
    || commands.preparation && (typeof commands.preparation.prepareCreate !== 'function' || typeof commands.preparation.prepareEdit !== 'function') || commands.existingPreparation && typeof commands.existingPreparation.prepareExisting !== 'function' || commands.manualCreate !== undefined && commands.manualCreate !== true) throw new TypeError('Explicit sales command capability is required.');
  const reader = createSalesHttpReader(input.http);
  const workspace = new SalesEditorSession({ scope: input.scope, principal: input.principal, reader,
    client: createSalesCommandHttpClient(input.http), newRequestKey: commands.newRequestKey, onAccessFailure,
    ...(commands.preparation ? { preparation: commands.preparation } : {}),
    ...(commands.existingPreparation ? { existingPreparation: commands.existingPreparation, existingReader: createCurrentFormHttpReader(input.http) } : {}) });
  let currentNewDocument: SalesNewDocumentSession | null = null;
  const manualCreate = commands.manualCreate ? Object.freeze({
    canLeave: () => !workspace.commands.hasUnresolvedWrite && (workspace.getSnapshot().command.editor ? workspace.canLeave() : !currentNewDocument || currentNewDocument.getSnapshot().disposed || currentNewDocument.getSnapshot().nativeHandoff || (!currentNewDocument.getSnapshot().preparing && !currentNewDocument.proposal.getSnapshot().dirty)),
    open: async () => {
      if (currentNewDocument && !currentNewDocument.getSnapshot().disposed) {
        if (!workspace.getSnapshot().command.editor && !currentNewDocument.getSnapshot().nativeHandoff) return currentNewDocument;
        if (!workspace.canLeave()) throw new TypeError('Unresolved sales document.');
        currentNewDocument.proposal.dispose(); currentNewDocument.dispose(); currentNewDocument = null;
      }
      if (!workspace.canLeave()) throw new TypeError('Unresolved sales document.');
      if (workspace.getSnapshot().command.editor) workspace.discardEditor();
      const [creation, proposal, reader] = await Promise.all([import('../../current-form/sales-create.ts'), import('../../current-form/sales-proposal.ts'), import('../../current-form/http-reader.ts')]);
      if (!input.scope.active) throw new TypeError('Inactive session.');
      if (currentNewDocument && !currentNewDocument.getSnapshot().disposed) return currentNewDocument;
      currentNewDocument = new creation.SalesNewDocumentSession({ scope: input.scope, editor: workspace,
        proposal: new proposal.SalesProposalSession(input.scope, reader.createCurrentFormHttpReader(input.http), onAccessFailure),
        preparation: creation.createSalesPreparationHttpClient(input.http), onAccessFailure });
      return currentNewDocument;
    },
  }) : undefined;
  const loadDetailStyles = () => configuration.detailStylesheet!.load();
  return Object.freeze({ workspace, ...(manualCreate ? { canLeave: manualCreate.canLeave } : {}), prepare: (route: RoutePreparation) => {
    const initialSalesId = route.initialDocument?.kind === 'SALES' ? route.initialDocument.salesId : undefined;
    // An explicit read target replaces a clean previously viewed editor, while
    // the original session retains the list's configured command capabilities.
    if (initialSalesId && workspace.canLeave()) workspace.discardEditor();
    const product = createSalesProductCapability(route, onAccessFailure, inventoryNavigation?.(route.scope));
    const routeReader = createSalesHttpReader(route.http), references = createSalesFilterReferenceHttpReader(route.http);
    return { View: ({ scope }: ApplicationRouteProps) => <SalesCommandPageHost scope={scope} reader={routeReader} references={references} session={workspace} {...(manualCreate ? { manualCreate } : {})} loadDetailStyles={loadDetailStyles} {...(product ? { product } : {})} {...(initialSalesId ? { initialSalesId } : {})} /> };
  } });
}
