import { TransferPageHost } from '../../transfers/transfers-route.tsx';
import { createTransferHttpReader, createTransferWarehouseHttpReader } from '../../transfers/http-reader.ts';
import { TransferCommandWorkspace } from '../../transfers/commands/controller.ts';
import { createTransferCommandHttpClient } from '../../transfers/commands/http-client.ts';
import type { TransferCommandCapability, TransferCommandError } from '../../transfers/commands/contracts.ts';
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
    || configuration.preparation !== undefined && typeof configuration.preparation.prepareCreate !== 'function') throw new TypeError('Explicit transfer command capability is required.');
  const workspace = new TransferCommandWorkspace({ scope: input.scope, reader: createTransferHttpReader(input.http), client: createTransferCommandHttpClient(input.http), newRequestKey: configuration.newRequestKey, onAccessFailure });
  const commands = Object.freeze({ workspace, ...(configuration.preparation ? { preparation: configuration.preparation } : {}) });
  return Object.freeze({ workspace, prepare: (currentRoute: RoutePreparation) => preparedTransferRoute(currentRoute, commands) });
}
