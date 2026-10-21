import type { TransferNewDocumentSession } from '../../current-form/transfer-create.ts';
import { TransferPageHost } from '../../transfers/transfers-route.tsx';
import { createTransferHttpReader, createTransferWarehouseHttpReader } from '../../transfers/http-reader.ts';
import { TransferCommandWorkspace } from '../../transfers/commands/controller.ts';
import { createTransferCommandHttpClient } from '../../transfers/commands/http-client.ts';
import { TransferCommandError, type TransferCommandCapability } from '../../transfers/commands/contracts.ts';
import { HttpQueryError } from '../../transport/http-query.ts';
import type { ProductReadOnlyReader } from '../../inventory/product-contracts.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation, TransferSession } from '../contracts.ts';

function preparedTransferRoute(input: RoutePreparation, commands?: TransferCommandCapability): PreparedApplicationRoute {
  const configuration = input.configuration.transfers;
  if (!configuration) throw new TypeError('Transfer capability was not configured.');
  const reader = createTransferHttpReader(input.http), references = createTransferWarehouseHttpReader(input.http);
  const loadDetailStyles = () => configuration.detailStylesheet.load();
  let productClient: Promise<ProductReadOnlyReader> | null = null;
  const productReader = async (signal: AbortSignal): Promise<ProductReadOnlyReader> => {
    if (signal.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    productClient ??= import('../../transport/product-http-reader.ts').then(module => module.createProductHttpReader(input.http)).catch(error => { productClient = null; throw error; });
    const current = await productClient;
    if (signal.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    return current;
  };
  const product = configuration.product ? {
    reader: {
      readProductBasics: async read => (await productReader(read.signal)).readProductBasics(read),
      readProductSpecifications: async read => (await productReader(read.signal)).readProductSpecifications(read),
      readProductImages: async read => (await productReader(read.signal)).readProductImages(read),
      readProductImage: async read => (await productReader(read.signal)).readProductImage(read),
    } satisfies ProductReadOnlyReader,
    loadStyles: async (): Promise<void> => { await configuration.product!.stylesheet.load(); },
  } : undefined;
  return { View: ({ scope }: ApplicationRouteProps) => <TransferPageHost scope={scope} reader={reader} references={references} loadDetailStyles={loadDetailStyles} {...(commands ? { commands } : {})} {...(product ? { product } : {})} /> };
}
/** Default real read-only path. Commands are never inferred from read access. */
export function prepareTransferRoute(input: RoutePreparation): PreparedApplicationRoute { return preparedTransferRoute(input); }
/** One session-owned command workspace, retained across route detach. Explicit
 * host configuration is the capability gate, not an authorization bypass. */
export function prepareTransferSession(input: RoutePreparation, onAccessFailure: (error: TransferCommandError) => void): TransferSession {
  const configuration = input.configuration.transfers?.commands;
  if (input.principal.accountId !== input.scope.identity.accountId || !configuration || typeof configuration.newRequestKey !== 'function' || typeof onAccessFailure !== 'function'
    || configuration.preparation !== undefined && typeof configuration.preparation.prepareCreate !== 'function'
    || configuration.manualCreate !== undefined && configuration.manualCreate !== true) throw new TypeError('Explicit transfer command capability is required.');
  const workspace = new TransferCommandWorkspace({ scope: input.scope, reader: createTransferHttpReader(input.http), client: createTransferCommandHttpClient(input.http), newRequestKey: configuration.newRequestKey, onAccessFailure });
  const newDocumentAccessFailure = (error: HttpQueryError) => onAccessFailure(new TransferCommandError(error.kind === 'unauthenticated' ? 'unauthenticated' : 'forbidden', error.kind === 'unauthenticated' ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'read'));
  let currentNewDocument: TransferNewDocumentSession | null = null;
  const manualCreate = configuration.manualCreate ? Object.freeze({
    canLeave: () => workspace.getSnapshot().editor ? workspace.canLeave() : !currentNewDocument || currentNewDocument.getSnapshot().disposed || currentNewDocument.getSnapshot().nativeHandoff || (!currentNewDocument.getSnapshot().preparing && !currentNewDocument.proposal.getSnapshot().dirty),
    open: async () => {
      if (currentNewDocument && !currentNewDocument.getSnapshot().disposed) {
        if (!workspace.getSnapshot().editor && !currentNewDocument.getSnapshot().nativeHandoff) return currentNewDocument;
        if (!workspace.canLeave()) throw new TypeError('Unresolved native document.');
        currentNewDocument.proposal.dispose(); currentNewDocument.dispose(); currentNewDocument = null;
      }
      if (!workspace.canLeave()) throw new TypeError('Unresolved native document.');
      if (workspace.getSnapshot().editor) workspace.discardEditor();
      const [creation, proposal, reader] = await Promise.all([import('../../current-form/transfer-create.ts'), import('../../current-form/transfer-proposal.ts'), import('../../current-form/http-reader.ts')]);
      if (!input.scope.active) throw new TypeError('Inactive session.');
      if (currentNewDocument && !currentNewDocument.getSnapshot().disposed) return currentNewDocument;
      currentNewDocument = new creation.TransferNewDocumentSession({ scope: input.scope, workspace,
        proposal: new proposal.TransferProposalSession(input.scope, reader.createCurrentFormHttpReader(input.http), newDocumentAccessFailure),
        preparation: creation.createTransferPreparationHttpClient(input.http), onAccessFailure: newDocumentAccessFailure });
      return currentNewDocument;
    },
  }) : undefined;
  const commands = Object.freeze({ workspace, ...(manualCreate ? { manualCreate } : {}), ...(configuration.preparation ? { preparation: configuration.preparation } : {}) });
  return Object.freeze({ workspace, ...(manualCreate ? { canLeave: manualCreate.canLeave } : {}), prepare: (currentRoute: RoutePreparation) => preparedTransferRoute(currentRoute, commands) });
}
